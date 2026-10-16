import "server-only";
import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { z } from "zod";
import {
  adminConfiguration,
  acceptedTotpCounter,
  adminIdleMs,
  adminLifetimeMs,
} from "./config";
import { adminDatabase, assertAdminPrivileges } from "./db";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { passwordSchema } from "@/lib/auth/validation";
import { consumeAttempt, attemptBlocked } from "@/lib/auth/throttle";
import { SecurityError, withAuthCapacity } from "@/lib/security/controls";
import { applicationOrigin } from "@/lib/security/request";
import { fieldCipher } from "@/lib/db/field-encryption";
import { accountLimitCeiling } from "@/lib/auth/registration-access";
import type { Prisma } from "@/generated/prisma/client";

const loginSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(254),
    password: z.string().min(1).max(128),
    code: z.string().regex(/^\d{6}$/),
  })
  .strict();
const proof = {
  actionPassword: z.string().min(1).max(128),
  code: z.string().regex(/^\d{6}$/),
};
const target = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const resetSchema = z
  .object({
    ...proof,
    userId: target,
    password: passwordSchema,
    confirmPassword: z.string().max(128),
  })
  .strict()
  .refine(
    (v) => v.password === v.confirmPassword,
    "Las contraseñas no coinciden.",
  );
const deleteSchema = z
  .object({ ...proof, userId: target, confirmation: z.string().max(160) })
  .strict()
  .refine(
    (v) => v.confirmation === `BORRAR ${v.userId}`,
    "Escribe la confirmación completa para borrar la cuenta.",
  );
const limitSchema = () =>
  z
    .object({
      ...proof,
      maxAccounts: z.number().int().min(1).max(accountLimitCeiling()),
    })
    .strict();
export type AdminIdentity = {
  sessionKey: string;
  fingerprint: string;
  sourceHash: string;
};
const denied = () =>
  new SecurityError("Acceso administrativo no autorizado.", 401);
const keyOf = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export function assertAdminSource(source: string) {
  if (!applicationOrigin().startsWith("https:"))
    throw new SecurityError("Administración requiere HTTPS.", 403);
  const settings = adminConfiguration();
  const address = source === "local-loopback" ? "127.0.0.1" : source;
  if (!settings.allowedIps.includes(address))
    throw new SecurityError(
      "Acceso administrativo no permitido desde esta conexión.",
      403,
    );
  return settings;
}
function sourceDigest(source: string) {
  return createHmac("sha256", process.env.AUTH_SECRET!)
    .update("Mappleo/admin/source/v1\0")
    .update(source)
    .digest("hex");
}
function equalText(a: string, b: string) {
  const aa = createHash("sha256").update(a).digest(),
    bb = createHash("sha256").update(b).digest();
  return timingSafeEqual(aa, bb);
}
async function audit(
  action: string,
  sourceHash: string,
  targetUserId?: string,
) {
  await adminDatabase().adminAudit.create({
    data: { action, sourceHash, targetUserId },
  });
}
export async function loginAdmin(input: unknown, source: string) {
  const settings = assertAdminSource(source);
  await assertAdminPrivileges();
  const sourceHash = sourceDigest(source);
  if (
    !(await consumeAttempt("admin-login-volume", source, 20, 60000)) ||
    (await attemptBlocked(
      "admin-login-failures",
      settings.fingerprint,
      5,
      900000,
    ))
  )
    throw new SecurityError(
      "Demasiados intentos administrativos. Espera 15 minutos.",
      429,
    );
  const parsed = loginSchema.safeParse(input);
  const stored = await adminDatabase().adminAccount.findUnique({
    where: { id: 1 },
  });
  if (!stored || stored.fingerprint !== settings.fingerprint) throw denied();
  const valid = await withAuthCapacity(() =>
    verifyPassword(
      parsed.success ? parsed.data.password : "invalid",
      stored.passwordHash,
    ),
  );
  const counter = parsed.success
    ? acceptedTotpCounter(settings.secret, parsed.data.code)
    : null;
  if (
    !parsed.success ||
    !equalText(parsed.data.email, settings.email) ||
    !valid ||
    counter === null
  ) {
    await consumeAttempt(
      "admin-login-failures",
      settings.fingerprint,
      5,
      900000,
    );
    await audit("login_denied", sourceHash);
    throw denied();
  }
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + adminLifetimeMs);
  await adminDatabase().$transaction(async (tx) => {
    const consumed = await tx.adminAccount.updateMany({
      where: {
        id: 1,
        fingerprint: settings.fingerprint,
        lastTotpCounter: { lt: counter },
      },
      data: { lastTotpCounter: counter },
    });
    if (!consumed.count)
      throw new SecurityError(
        "Código inválido o ya utilizado. Espera un código nuevo del autenticador.",
        401,
      );
    // A new login revokes every previous administrative session.
    await tx.adminSession.deleteMany({ where: { adminId: 1 } });
    await tx.adminSession.create({
      data: {
        id: keyOf(token),
        fingerprint: settings.fingerprint,
        sourceHash,
        expiresAt,
      },
    });
    await tx.adminAudit.create({
      data: { action: "login_success", sourceHash },
    });
  });
  return { token, expiresAt };
}
export async function authenticateAdmin(
  token: string | undefined,
  source: string,
): Promise<AdminIdentity> {
  const settings = assertAdminSource(source);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) throw denied();
  await assertAdminPrivileges();
  const sessionKey = keyOf(token),
    sourceHash = sourceDigest(source);
  const session = await adminDatabase().adminSession.findUnique({
    where: { id: sessionKey },
    include: { admin: { select: { fingerprint: true } } },
  });
  const now = new Date();
  if (
    !session ||
    session.adminId !== 1 ||
    session.fingerprint !== settings.fingerprint ||
    session.admin.fingerprint !== settings.fingerprint ||
    session.sourceHash !== sourceHash ||
    session.expiresAt <= now ||
    session.lastSeenAt.getTime() <= now.getTime() - adminIdleMs
  )
    throw denied();
  if (!(await consumeAttempt("admin-requests", sessionKey, 120, 60000)))
    throw new SecurityError("Demasiadas peticiones. Espera un minuto.", 429);
  const touched = await adminDatabase().adminSession.updateMany({
    where: {
      id: sessionKey,
      fingerprint: settings.fingerprint,
      sourceHash,
      expiresAt: { gt: now },
      lastSeenAt: { gt: new Date(now.getTime() - adminIdleMs) },
    },
    data: { lastSeenAt: now },
  });
  if (!touched.count) throw denied();
  return { sessionKey, fingerprint: settings.fingerprint, sourceHash };
}
export async function logoutAdmin(identity: AdminIdentity) {
  await adminDatabase().$transaction(async (tx) => {
    await tx.adminSession.deleteMany({
      where: {
        id: identity.sessionKey,
        fingerprint: identity.fingerprint,
        sourceHash: identity.sourceHash,
      },
    });
    await tx.adminAudit.create({
      data: { action: "logout", sourceHash: identity.sourceHash },
    });
  });
}
async function assertLive(
  tx: Prisma.TransactionClient,
  identity: AdminIdentity,
) {
  const now = new Date();
  const live = await tx.adminSession.updateMany({
    where: {
      id: identity.sessionKey,
      fingerprint: identity.fingerprint,
      sourceHash: identity.sourceHash,
      expiresAt: { gt: now },
      lastSeenAt: { gt: new Date(now.getTime() - adminIdleMs) },
    },
    data: { lastSeenAt: now },
  });
  if (!live.count || adminConfiguration().fingerprint !== identity.fingerprint)
    throw denied();
}
export async function adminOverview(identity: AdminIdentity, query: unknown) {
  const input = z
    .object({
      page: z.coerce.number().int().min(1).max(100000).default(1),
      search: z.string().trim().max(254).default(""),
    })
    .strict()
    .parse(query);
  const settings = adminConfiguration();
  const filter = input.search
    ? input.search.includes("@")
      ? { emailLookup: fieldCipher().emailLookup(input.search) }
      : { id: input.search }
    : {};
  return adminDatabase().$transaction(async (tx) => {
    await assertLive(tx, identity);
    const policy = await tx.registrationPolicy.findUniqueOrThrow({
      where: { id: 1 },
    });
    const accounts = await tx.user.findMany({
      where: filter,
      orderBy: { createdAt: "desc" },
      skip: (input.page - 1) * 50,
      take: 50,
      select: {
        id: true,
        email: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            companies: true,
            offers: true,
            applications: true,
            contacts: true,
            networkingEvents: true,
            tasks: true,
          },
        },
        authSessions: {
          where: { expiresAt: { gt: new Date() } },
          select: { id: true },
        },
      },
    });
    const total = await tx.user.count({ where: filter });
    const events = await tx.adminAudit.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { action: true, targetUserId: true, createdAt: true },
    });
    return {
      maxAccounts: policy.maxAccounts,
      accountLimitCeiling: accountLimitCeiling(),
      accountCount: policy.accountCount,
      page: input.page,
      pages: Math.max(1, Math.ceil(total / 50)),
      administrator: settings.email,
      accounts: accounts.map((a) => ({
        id: a.id,
        email: a.email,
        createdAt: a.createdAt.toISOString(),
        updatedAt: a.updatedAt.toISOString(),
        counts: a._count,
        activeSessions: a.authSessions.length,
      })),
      events: events.map((e) => ({
        ...e,
        createdAt: e.createdAt.toISOString(),
      })),
    };
  });
}
export type AdminOverview = Awaited<ReturnType<typeof adminOverview>>;
export async function adminMutation(
  identity: AdminIdentity,
  operation: "reset-password" | "delete-account" | "limit",
  input: unknown,
) {
  const data =
    operation === "reset-password"
      ? resetSchema.parse(input)
      : operation === "delete-account"
        ? deleteSchema.parse(input)
        : limitSchema().parse(input);
  const settings = adminConfiguration();
  if (identity.fingerprint !== settings.fingerprint) throw denied();
  if (
    await attemptBlocked(
      "admin-action-failures",
      settings.fingerprint,
      5,
      900000,
    )
  )
    throw new SecurityError("Demasiados intentos. Espera 15 minutos.", 429);
  if (
    !(await consumeAttempt(
      "admin-action-volume",
      identity.sessionKey,
      15,
      60000,
    ))
  )
    throw new SecurityError("Demasiadas operaciones. Espera un minuto.", 429);
  const account = await adminDatabase().adminAccount.findUniqueOrThrow({
    where: { id: 1 },
  });
  const valid = await withAuthCapacity(() =>
    verifyPassword(data.actionPassword, account.actionPasswordHash),
  );
  const counter = acceptedTotpCounter(settings.secret, data.code);
  if (
    !valid ||
    account.fingerprint !== settings.fingerprint ||
    counter === null ||
    counter <= account.lastTotpCounter
  ) {
    const allowed = await consumeAttempt(
      "admin-action-failures",
      settings.fingerprint,
      4,
      900000,
    );
    await audit("action_denied", identity.sourceHash);
    if (!allowed)
      await adminDatabase().adminSession.deleteMany({
        where: { id: identity.sessionKey },
      });
    throw new SecurityError(
      "Contraseña de operaciones o código incorrectos. Usa un código nuevo.",
      403,
    );
  }
  const replacement =
    "password" in data
      ? await withAuthCapacity(() => hashPassword(data.password))
      : null;
  if (
    "password" in data &&
    [settings.password, settings.actionPassword].includes(data.password)
  )
    throw new SecurityError(
      "No reutilices credenciales administrativas en una cuenta de usuario.",
      400,
    );
  await adminDatabase().$transaction(
    async (tx) => {
      await assertLive(tx, identity);
      const used = await tx.adminAccount.updateMany({
        where: {
          id: 1,
          fingerprint: identity.fingerprint,
          lastTotpCounter: { lt: counter },
        },
        data: { lastTotpCounter: counter },
      });
      if (!used.count)
        throw new SecurityError(
          "El código ya se utilizó. Espera uno nuevo.",
          403,
        );
      if ("maxAccounts" in data) {
        // UPDATE takes the same row lock as the registration trigger, closing the capacity race.
        const changed = await tx.registrationPolicy.updateMany({
          where: { id: 1, accountCount: { lte: data.maxAccounts } },
          data: { maxAccounts: data.maxAccounts },
        });
        if (!changed.count)
          throw new SecurityError(
            "El límite no puede ser inferior al número de cuentas existentes, incluido el administrador.",
            409,
          );
      } else {
        const targetAccount = await tx.user.findUnique({
          where: { id: data.userId },
          select: { id: true, email: true, emailLookup: true },
        });
        if (!targetAccount || targetAccount.emailLookup === account.emailLookup)
          throw new SecurityError(
            "Cuenta no disponible. El administrador no se modifica desde este panel.",
            404,
          );
        if (replacement) {
          const local = targetAccount.email.split("@")[0].toLowerCase();
          if (
            "password" in data &&
            local.length >= 4 &&
            data.password.toLowerCase().includes(local)
          )
            throw new SecurityError(
              "La contraseña no debe contener el email de la cuenta.",
              400,
            );
          const changed = await tx.user.updateMany({
            where: { id: data.userId },
            data: {
              passwordHash: replacement,
              sessionVersion: { increment: 1 },
              failedAttempts: 0,
              lockedUntil: null,
            },
          });
          if (!changed.count)
            throw new SecurityError("La cuenta ya no existe.", 404);
          await tx.authSession.deleteMany({ where: { userId: data.userId } });
        } else {
          const [result] = await tx.$queryRaw<
            { deleted: boolean }[]
          >`SELECT mappleo_admin_delete_user(${data.userId}) AS deleted`;
          if (!result?.deleted)
            throw new SecurityError("La cuenta ya no existe.", 404);
        }
      }
      await tx.adminAudit.create({
        data: {
          action: operation,
          sourceHash: identity.sourceHash,
          targetUserId: "userId" in data ? data.userId : undefined,
        },
      });
    },
    { maxWait: 5000, timeout: 15000 },
  );
  return { ok: true };
}
