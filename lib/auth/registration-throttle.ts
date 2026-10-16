import "server-only";
import { db } from "@/lib/db";
import {
  registrationSourceKey,
  registrationWindowMs,
  registrationFailureLimit,
} from "./registration-access";

export const registrationBlockedMessage =
  "Has realizado más de 8 intentos fallidos. Espera 15 minutos.";
export async function registrationBlocked(source: string) {
  const row = await db.authThrottle.findUnique({
    where: { key: registrationSourceKey(source) },
  });
  return (
    !!row && row.count > registrationFailureLimit && row.expiresAt > new Date()
  );
}
export async function recordRegistrationFailure(source: string) {
  const key = registrationSourceKey(source);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + registrationWindowMs);
  // One stable HMAC key per trusted source. Atomic SQL prevents races and starts
  // a full fifteen-minute block on the ninth failure, even across time buckets.
  const [row] = await db.$queryRaw<{ count: number; expiresAt: Date }[]>`
    INSERT INTO "AuthThrottle" (key, count, "expiresAt")
    VALUES (${key}, 1, ${expiresAt})
    ON CONFLICT (key) DO UPDATE SET
      count = CASE
        WHEN "AuthThrottle"."expiresAt" <= ${now} THEN 1
        WHEN "AuthThrottle".count > 8 THEN "AuthThrottle".count
        ELSE "AuthThrottle".count + 1 END,
      "expiresAt" = CASE
        WHEN "AuthThrottle"."expiresAt" <= ${now} OR "AuthThrottle".count = 8
          THEN ${expiresAt}
        ELSE "AuthThrottle"."expiresAt" END
    RETURNING count, "expiresAt"
  `;
  return row.count > registrationFailureLimit;
}
