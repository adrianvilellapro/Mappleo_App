import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const registrationWindowMs = 15 * 60 * 1000;
export const registrationFailureLimit = 8;
export function registrationCodeAccepted(input: unknown, expected?: string) {
  const candidate =
    typeof input === "string" && input.length <= 128 ? input.trim() : "";
  const configured = expected ?? process.env.REGISTRATION_CODE;
  if (!configured || configured.length < 24 || configured.length > 128)
    return false;
  return timingSafeEqual(
    createHash("sha256").update(candidate).digest(),
    createHash("sha256").update(configured).digest(),
  );
}
export function registrationSourceKey(source: string) {
  if (!process.env.AUTH_SECRET) throw new Error("AUTH_SECRET required");
  return (
    "registration-failed:" +
    createHmac("sha256", process.env.AUTH_SECRET)
      .update("Mappleo/registration/source/v1\0")
      .update(source)
      .digest("hex")
  );
}
export function accountLimitCeiling() {
  const value = Number(process.env.ACCOUNT_LIMIT_CEILING ?? 15);
  if (!Number.isInteger(value) || value < 1 || value > 100000)
    throw new Error("Invalid account ceiling configuration.");
  return value;
}
