import "server-only";
import { randomBytes, createHash } from "node:crypto";
import { db } from "@/lib/db";
import { consumeAttempt } from "@/lib/auth/throttle";

export class SecurityError extends Error {
  constructor(
    message: string,
    public status = 429,
  ) {
    super(message);
  }
}
export const privateHeaders = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};
export function securityResponse(error: unknown) {
  const status = error instanceof SecurityError ? error.status : 503;
  return Response.json(
    {
      ok: false,
      error:
        error instanceof SecurityError
          ? error.message
          : "No se ha podido completar la operación. Vuelve a intentarlo.",
    },
    {
      status,
      headers: {
        ...privateHeaders,
        ...(status === 429 ? { "Retry-After": "60" } : {}),
      },
    },
  );
}
export async function recordSecurityEvent(type: string, userId?: string) {
  await db.securityEvent.create({ data: { type, userId } });
}
export async function mutationBudget(userId: string) {
  if (!(await consumeAttempt("mutations", userId, 120, 60000)))
    throw new SecurityError(
      "Has realizado muchos cambios seguidos. Espera un minuto.",
    );
}
export async function withAuthCapacity<T>(run: () => Promise<T>): Promise<T> {
  const owner = randomBytes(24).toString("hex");
  let key = "";
  await db.operationLease.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  for (let i = 0; i < 4; i++) {
    try {
      key = "auth:slot:" + i;
      await db.operationLease.create({
        data: { key, owner, expiresAt: new Date(Date.now() + 60000) },
      });
      break;
    } catch {
      key = "";
    }
  }
  if (!key) throw new Error("TooManyAttempts");
  try {
    return await run();
  } finally {
    await db.operationLease.deleteMany({ where: { key, owner } });
  }
}
// Persistent leases bound concurrency across workers, not just within a Node process.
export async function withExpensiveOperation<T>(
  userId: string,
  run: () => Promise<T>,
): Promise<T> {
  if (!(await consumeAttempt("bulk-operations", userId, 10, 60000)))
    throw new SecurityError(
      "Demasiadas importaciones o exportaciones. Espera un minuto.",
    );
  const owner = randomBytes(24).toString("hex");
  const userKey =
    "bulk:user:" + createHash("sha256").update(userId).digest("hex");
  let slot = "";
  await db.operationLease.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  try {
    await db.operationLease.create({
      data: { key: userKey, owner, expiresAt: new Date(Date.now() + 180000) },
    });
  } catch {
    throw new SecurityError(
      "Ya hay una operación en curso. Espera a que termine.",
    );
  }
  try {
    for (let i = 0; i < 4; i++) {
      try {
        slot = "bulk:slot:" + i;
        await db.operationLease.create({
          data: { key: slot, owner, expiresAt: new Date(Date.now() + 180000) },
        });
        break;
      } catch {
        slot = "";
      }
    }
    if (!slot)
      throw new SecurityError(
        "El servicio está ocupado. Vuelve a intentarlo en un minuto.",
      );
    return await run();
  } finally {
    await db.operationLease.deleteMany({
      where: { owner, key: { in: [userKey, slot] } },
    });
  }
}
