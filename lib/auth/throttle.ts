import "server-only";
import { createHmac } from "node:crypto";
import { db } from "@/lib/db";
function attemptKey(scope: string, identity: string, periodMs: number) {
  if (!process.env.AUTH_SECRET) throw new Error("AUTH_SECRET required");
  return (
    scope +
    ":" +
    Math.floor(Date.now() / periodMs) +
    ":" +
    createHmac("sha256", process.env.AUTH_SECRET).update(identity).digest("hex")
  );
}
export async function attemptBlocked(
  scope: string,
  identity: string,
  limit: number,
  periodMs: number,
) {
  const record = await db.authThrottle.findUnique({
    where: { key: attemptKey(scope, identity, periodMs) },
  });
  return !!record && record.expiresAt > new Date() && record.count >= limit;
}
export async function clearAttempts(
  scope: string,
  identity: string,
  periodMs: number,
) {
  await db.authThrottle.deleteMany({
    where: { key: attemptKey(scope, identity, periodMs) },
  });
}
export async function consumeAttempt(
  scope: string,
  identity: string,
  limit: number,
  periodMs: number,
) {
  if (!process.env.AUTH_SECRET) throw new Error("AUTH_SECRET required");
  const now = Date.now(),
    bucket = Math.floor(now / periodMs);
  const key = attemptKey(scope, identity, periodMs);
  await db.authThrottle.deleteMany({
    where: { expiresAt: { lt: new Date(now) } },
  });
  const counter = await db.authThrottle.upsert({
    where: { key },
    create: { key, count: 1, expiresAt: new Date((bucket + 1) * periodMs) },
    update: { count: { increment: 1 } },
  });
  return counter.count <= limit;
}
