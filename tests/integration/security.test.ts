import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createHash, randomUUID } from "node:crypto";
import { hash } from "bcryptjs";
import { db } from "../../lib/db";
import { PrismaClient } from "../../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { authOptions } from "../../lib/auth/options";
import { confirmIdentity } from "../../features/account/identity";
import { updateAccount } from "../../features/account/service";
import { withExpensiveOperation } from "../../lib/security/controls";
import { assertAccountQuota } from "../../lib/security/quota";
import { saveRecord } from "../../features/tracker/services";
import type { User } from "next-auth";
import type { JWT } from "next-auth/jwt";
const admin = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
const password = "Prueba segura de sesiones 27!",
  replacement = "Una contraseña distinta 42!";
const suffix = randomUUID();
let owner = "",
  other = "",
  company = "",
  loggedIn: User;
const authorize = (
  authOptions.providers[0] as unknown as {
    options: {
      authorize: (
        input: Record<string, string>,
        request: { headers: Record<string, string> },
      ) => Promise<User | null>;
    };
  }
).options.authorize;
const jwt = (input: { token: JWT; user?: User }) =>
  authOptions.callbacks!.jwt!({ ...input, user: input.user!, account: null });
beforeAll(async () => {
  owner = (
    await db.user.create({
      data: {
        name: "Security owner",
        email: `security-owner-${suffix}@example.test`,
        passwordHash: await hash(password, 12),
      },
    })
  ).id;
  other = (
    await db.user.create({
      data: {
        name: "Security other",
        email: `security-other-${suffix}@example.test`,
      },
    })
  ).id;
  company = (
    await db.company.create({
      data: { userId: owner, name: "Security company" },
    })
  ).id;
});
afterAll(async () => {
  await admin.securityEvent.deleteMany({
    where: { userId: { in: [owner, other] } },
  });
  await admin.company.deleteMany({ where: { userId: { in: [owner, other] } } });
  await admin.user.deleteMany({ where: { id: { in: [owner, other] } } });
  await admin.$disconnect();
  await db.$disconnect();
});
describe("Sesiones y permisos reales", () => {
  it("usa un rol no administrador y el registro de seguridad no se puede alterar", async () => {
    const [role] = await db.$queryRaw<
      {
        rolsuper: boolean;
        rolcreatedb: boolean;
        rolcreaterole: boolean;
        rolbypassrls: boolean;
      }[]
    >`SELECT rolsuper, rolcreatedb, rolcreaterole, rolbypassrls FROM pg_roles WHERE rolname = CURRENT_USER`;
    expect(role).toEqual({
      rolsuper: false,
      rolcreatedb: false,
      rolcreaterole: false,
      rolbypassrls: false,
    });
    await db.securityEvent.create({
      data: { userId: owner, type: "security_test" },
    });
    await expect(
      db.securityEvent.updateMany({
        where: { userId: owner },
        data: { type: "tampered" },
      }),
    ).rejects.toThrow();
    await expect(
      db.securityEvent.deleteMany({ where: { userId: owner } }),
    ).rejects.toThrow();
  });
  it("rechaza vínculos entre cuentas incluso saltándose los servicios", async () => {
    await expect(
      db.jobOffer.create({
        data: {
          userId: other,
          companyId: company,
          title: "Cross-tenant forbidden",
        },
      }),
    ).rejects.toThrow();
    await expect(
      db.networkingEvent.create({
        data: {
          userId: other,
          name: "Cross tenant",
          startsAt: new Date(),
          companies: { connect: [{ id: company }] },
        },
      }),
    ).rejects.toThrow();
  });
  it("actualiza bcrypt a Argon2id y crea una sesión revocable de un año", async () => {
    loggedIn = (await authorize(
      { email: `security-owner-${suffix}@example.test`, password },
      { headers: {} },
    ))!;
    expect(loggedIn.id).toBe(owner);
    expect(loggedIn.sessionId).toHaveLength(64);
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: owner } })).passwordHash,
    ).toMatch(/^\$argon2id\$/);
    const token = await jwt({ token: {}, user: loggedIn });
    expect(token.sub).toBe(owner);
    const session = await db.authSession.findUniqueOrThrow({
      where: {
        id: createHash("sha256").update(loggedIn.sessionId!).digest("hex"),
      },
    });
    expect(session.expiresAt.getTime() - Date.now()).toBeGreaterThan(
      364 * 86400000,
    );
  });
  it("rechaza cookies copiadas después de logout y tokens anteriores sin sesión", async () => {
    const token = await jwt({ token: {}, user: loggedIn });
    const logout = authOptions.events!.signOut! as unknown as (input: {
      token: JWT;
    }) => Promise<void>;
    await logout({ token });
    const revoked = await jwt({ token: { ...token } });
    expect(revoked.sub).toBeUndefined();
    expect(revoked.email).toBeUndefined();
    expect(revoked.name).toBeUndefined();
    expect(
      (await jwt({ token: { sub: owner, sessionVersion: 0 } })).sub,
    ).toBeUndefined();
  });
  it("la identidad se confirma en el servidor y cambiar contraseña revoca todas las sesiones", async () => {
    loggedIn = (await authorize(
      { email: `security-owner-${suffix}@example.test`, password },
      { headers: {} },
    ))!;
    const token = await jwt({ token: {}, user: loggedIn });
    const user = {
      id: owner,
      sessionVersion: 0,
      sessionId: loggedIn.sessionId!,
    };
    const key = createHash("sha256").update(user.sessionId).digest("hex");
    await db.authSession.update({
      where: { id: key },
      data: { verifiedAt: new Date(Date.now() - 3600000) },
    });
    await expect(confirmIdentity(user, "incorrecta")).rejects.toThrow();
    await confirmIdentity(user, password);
    expect(
      Date.now() -
        (
          await db.authSession.findUniqueOrThrow({ where: { id: key } })
        ).verifiedAt.getTime(),
    ).toBeLessThan(10000);
    await updateAccount(
      owner,
      0,
      {
        kind: "password",
        currentPassword: password,
        password: replacement,
        confirmPassword: replacement,
      },
      user.sessionId,
    );
    expect(await db.authSession.count({ where: { userId: owner } })).toBe(0);
    expect((await jwt({ token: { ...token } })).sub).toBeUndefined();
  });
  it("los intentos fallidos no bloquean a la víctima desde otro origen de red", async () => {
    vi.stubEnv("TRUSTED_CLIENT_IP_HEADER", "x-real-ip");
    try {
      for (let i = 0; i < 4; i++)
        expect(
          await authorize(
            {
              email: `security-owner-${suffix}@example.test`,
              password: "Incorrecta",
            },
            { headers: { "x-real-ip": "198.51.100.10" } },
          ),
        ).toBeNull();
      await expect(
        authorize(
          {
            email: `security-owner-${suffix}@example.test`,
            password: "Incorrecta",
          },
          { headers: { "x-real-ip": "198.51.100.10" } },
        ),
      ).rejects.toThrow("TooManyAttempts");
      expect(
        (
          await authorize(
            {
              email: `security-owner-${suffix}@example.test`,
              password: replacement,
            },
            { headers: { "x-real-ip": "198.51.100.11" } },
          )
        )?.id,
      ).toBe(owner);
    } finally {
      vi.unstubAllEnvs();
    }
  });
  it("impide una segunda operación costosa simultánea en la misma cuenta", async () => {
    let release!: () => void, started!: () => void;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    const first = withExpensiveOperation(owner, async () => {
      started();
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return 1;
    });
    await ready;
    try {
      await expect(
        withExpensiveOperation(owner, async () => 2),
      ).rejects.toThrow(/operación en curso/);
    } finally {
      release();
    }
    expect(await first).toBe(1);
  });
  it("las cuotas cancelan la transacción, sin aplicar parcialmente sus datos", async () => {
    await expect(
      db.$transaction(async (tx) => {
        await tx.technologyTag.createMany({
          data: Array.from({ length: 501 }, (_, n) => ({
            userId: other,
            name: "Quota " + n,
            key: "quota-" + n,
          })),
        });
        await assertAccountQuota(tx, other);
      }),
    ).rejects.toThrow(/límite/);
    expect(await db.technologyTag.count({ where: { userId: other } })).toBe(0);
  });
  it("rechaza un guardado basado en una versión obsoleta", async () => {
    const old = await db.company.findUniqueOrThrow({ where: { id: company } });
    await db.company.update({
      where: { id: company },
      data: {
        name: "New version",
        updatedAt: new Date(old.updatedAt.getTime() + 1000),
      },
    });
    await expect(
      saveRecord(owner, "companies", company, {
        name: "Stale update",
        workMode: "UNKNOWN",
        interestRating: 3,
        expectedUpdatedAt: old.updatedAt.toISOString(),
      }),
    ).rejects.toThrow(/otra ventana/);
    expect(
      (await db.company.findUniqueOrThrow({ where: { id: company } })).name,
    ).toBe("New version");
  });
});
