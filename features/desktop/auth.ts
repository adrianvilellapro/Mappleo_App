import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { db, assertRuntimePrivileges } from "@/lib/db";
import { consumeAttempt } from "@/lib/auth/throttle";
import { SecurityError } from "@/lib/security/controls";
import { trustedRequestSource } from "@/lib/security/request";

export const digest = (value: string) =>
  createHash("sha256").update(value).digest("base64url");
const secret = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export const authorizationSchema = z.object({
  challenge: secret,
  state: secret,
  redirectUri: z
    .string()
    .max(200)
    .refine((value) => {
      try {
        const url = new URL(value);
        return (
          url.protocol === "http:" &&
          url.hostname === "127.0.0.1" &&
          Number(url.port) >= 1024 &&
          !url.username &&
          !url.password &&
          url.pathname === "/callback" &&
          !url.search &&
          !url.hash
        );
      } catch {
        return false;
      }
    }, "Dirección de retorno no válida."),
});
export function desktopEnabled() {
  if (process.env.DESKTOP_SYNC_ENABLED !== "true")
    throw new SecurityError(
      "La conexión de Windows todavía no está activada en este servidor.",
      503,
    );
}
export async function nativeBudget(
  request: Request,
  scope: string,
  limit = 30,
) {
  desktopEnabled();
  const source = trustedRequestSource(Object.fromEntries(request.headers));
  if (!(await consumeAttempt("desktop-" + scope, source, limit, 60000)))
    throw new SecurityError("Demasiadas peticiones. Espera un minuto.");
}
export async function readDesktopJson(
  request: Request,
  max = 3 * 1024 * 1024,
): Promise<unknown> {
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json")
    throw new SecurityError("Formato no permitido.", 415);
  if (Number(request.headers.get("content-length")) > max || !request.body)
    throw new SecurityError("La petición supera el tamaño permitido.", 413);
  const reader = request.body.getReader(),
    payload = Buffer.allocUnsafe(max);
  let size = 0,
    timeout = false;
  const timer = setTimeout(() => {
    timeout = true;
    void reader.cancel().catch(() => undefined);
  }, 10000);
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (size + value.byteLength > max) {
        await reader.cancel();
        throw new SecurityError("La petición supera el tamaño permitido.", 413);
      }
      payload.set(value, size);
      size += value.byteLength;
    }
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
  if (timeout)
    throw new SecurityError("La petición ha tardado demasiado.", 408);
  try {
    return JSON.parse(payload.subarray(0, size).toString("utf8"));
  } catch {
    throw new SecurityError("JSON no válido.", 400);
  }
}
export async function authorizeDevice(
  user: { id: string; sessionVersion: number },
  raw: unknown,
) {
  desktopEnabled();
  const input = authorizationSchema.parse(raw);
  if (!(await consumeAttempt("desktop-authorize", user.id, 8, 900000)))
    throw new SecurityError(
      "Has realizado varios intentos. Espera 15 minutos.",
    );
  const code = randomBytes(32).toString("base64url");
  await db.$transaction(async (tx) => {
    await tx.desktopAuthorization.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    const current = await tx.user.findFirst({
      where: { id: user.id, sessionVersion: user.sessionVersion },
      select: { id: true },
    });
    if (!current) throw new SecurityError("Inicia sesión de nuevo.", 401);
    await tx.desktopAuthorization.create({
      data: {
        codeHash: digest(code),
        userId: user.id,
        challenge: input.challenge,
        redirectUri: input.redirectUri,
        sessionVersion: user.sessionVersion,
        expiresAt: new Date(Date.now() + 120000),
      },
    });
    await tx.securityEvent.create({
      data: { type: "desktop_authorized", userId: user.id },
    });
  });
  const target = new URL(input.redirectUri);
  target.searchParams.set("code", code);
  target.searchParams.set("state", input.state);
  return target.href;
}
export async function exchangeCode(raw: unknown) {
  const input = z
    .object({
      code: secret,
      verifier: secret,
      redirectUri: z.string().max(200),
    })
    .parse(raw);
  return db.$transaction(async (tx) => {
    // DELETE RETURNING makes authorization codes single-use even with concurrent exchanges.
    const codes = await tx.$queryRaw<
      { userId: string; sessionVersion: number }[]
    >`
      DELETE FROM "DesktopAuthorization" WHERE "codeHash"=${digest(input.code)} AND "challenge"=${digest(input.verifier)}
      AND "redirectUri"=${input.redirectUri} AND "expiresAt">NOW() RETURNING "userId", "sessionVersion"`;
    const code = codes[0];
    if (!code)
      throw new SecurityError(
        "La autorización ha caducado o no es válida. Conecta de nuevo.",
        401,
      );
    // Serialize grants for this account: concurrent codes cannot exceed the
    // device limit, and a password reset cannot race identity verification.
    await tx.$queryRaw`SELECT id FROM "User" WHERE id=${code.userId} FOR UPDATE`;
    const user = await tx.user.findFirst({
      where: { id: code.userId, sessionVersion: code.sessionVersion },
      select: { id: true, name: true, email: true },
    });
    if (!user) throw new SecurityError("Inicia sesión de nuevo.", 401);
    await tx.desktopDevice.deleteMany({
      where: { userId: user.id, expiresAt: { lte: new Date() } },
    });
    if ((await tx.desktopDevice.count({ where: { userId: user.id } })) >= 10)
      throw new SecurityError(
        "Desconecta un equipo desde la configuración web antes de vincular otro.",
        409,
      );
    const token = randomBytes(32).toString("base64url"),
      expiresAt = new Date(Date.now() + 365 * 86400000);
    const device = await tx.desktopDevice.create({
      data: {
        userId: user.id,
        name: "Mappleo para Windows",
        tokenHash: digest(token),
        sessionVersion: code.sessionVersion,
        expiresAt,
      },
    });
    return {
      token,
      deviceId: device.id,
      expiresAt: expiresAt.toISOString(),
      user,
    };
  });
}
export async function requireDevice(request: Request) {
  desktopEnabled();
  await nativeBudget(request, "requests", 60);
  await assertRuntimePrivileges();
  const token = request.headers
    .get("authorization")
    ?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
  if (!token) throw new SecurityError("Vuelve a conectar tu cuenta.", 401);
  const device = await db.desktopDevice.findUnique({
    where: { tokenHash: digest(token) },
    include: { user: { select: { id: true, sessionVersion: true } } },
  });
  if (
    !device ||
    device.expiresAt <= new Date() ||
    device.sessionVersion !== device.user.sessionVersion
  )
    throw new SecurityError(
      "La conexión ha caducado o se ha revocado. Vuelve a conectar tu cuenta.",
      401,
    );
  if (!(await consumeAttempt("desktop-device", device.id, 40, 60000)))
    throw new SecurityError("Demasiadas peticiones. Espera un minuto.");
  if (Date.now() - device.lastSeenAt.getTime() > 3600000)
    await db.desktopDevice.updateMany({
      where: { id: device.id },
      data: { lastSeenAt: new Date() },
    });
  return device;
}
