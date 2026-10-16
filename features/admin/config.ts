import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { TOTP, Secret } from "otpauth";
export const adminCookie = "__Host-mappleo-admin";
export const adminLifetimeMs = 30 * 60000;
export const adminIdleMs = 10 * 60000;
export function adminConfiguration(
  env: Record<string, string | undefined> = process.env,
) {
  const email = env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = env.ADMIN_PASSWORD;
  const actionPassword = env.ADMIN_ACTION_PASSWORD;
  const secret = env.ADMIN_TOTP_SECRET;
  const allowedIps = (env.ADMIN_ALLOWED_IPS ?? "127.0.0.1,::1")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean)
    .sort();
  if (
    !email ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    !password ||
    password.length < 24 ||
    password.length > 128 ||
    !actionPassword ||
    actionPassword.length < 24 ||
    actionPassword.length > 128 ||
    password === actionPassword ||
    !secret ||
    !/^[A-Z2-7]{32}$/.test(secret) ||
    !env.AUTH_SECRET ||
    env.AUTH_SECRET.length < 64 ||
    !allowedIps.length ||
    allowedIps.some((ip) => !isIP(ip))
  )
    throw new Error("La configuración administrativa no está preparada.");
  const fingerprint = createHmac("sha256", env.AUTH_SECRET)
    .update("Mappleo/admin/config/v1\0")
    .update(
      JSON.stringify([email, password, actionPassword, secret, allowedIps]),
    )
    .digest("hex");
  return { email, password, actionPassword, secret, fingerprint, allowedIps };
}
export function adminTotp(secret: string) {
  return new TOTP({
    issuer: "Mappleo administración",
    label: "Administrador",
    secret: Secret.fromBase32(secret),
    algorithm: "SHA1",
    digits: 6,
    period: 30,
  });
}
export function acceptedTotpCounter(
  secret: string,
  token: string,
  now = Date.now(),
) {
  if (!/^\d{6}$/.test(token)) return null;
  const delta = adminTotp(secret).validate({
    token,
    timestamp: now,
    window: 1,
  });
  return delta === null ? null : Math.floor(now / 30000) + delta;
}
export function maskedEmail(email: string) {
  const [local, host] = email.split("@");
  return `${local.slice(0, 1)}***@${host?.slice(0, 1) ?? ""}***`;
}
