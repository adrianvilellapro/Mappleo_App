import { parse } from "dotenv";
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { isIP } from "node:net";
import { Secret } from "otpauth";
const file = ".env.deploy";
const source = parse(readFileSync(file));
const encryptionKeys = [
  "FIELD_ENCRYPTION_KEYS",
  "FIELD_ENCRYPTION_ACTIVE_KEY",
  "FIELD_ENCRYPTION_INDEX_KEY",
];
if (
  encryptionKeys.some((key) => source[key]) &&
  !encryptionKeys.every((key) => source[key])
)
  throw new Error(
    "La configuración de cifrado está incompleta. Restaura sus claves privadas originales; no se generarán sustitutas.",
  );
const local = parse(readFileSync(".env"));
const target = new URL(source.DATABASE_URL);
if (
  !target.hostname.endsWith(".neon.tech") ||
  target.hostname !== source.DEPLOY_DATABASE_HOST ||
  target.hostname.includes("-pooler.")
)
  throw new Error("El perfil debe apuntar al host directo de Neon confirmado.");
const ipFlag = process.argv.indexOf("--admin-ip");
const ip = ipFlag >= 0 ? process.argv[ipFlag + 1] : source.ADMIN_ALLOWED_IPS;
if (!ip || !isIP(ip))
  throw new Error("Confirma una IP pública exacta con --admin-ip.");
const adminEmail = source.ADMIN_EMAIL || local.ADMIN_EMAIL;
if (!adminEmail)
  throw new Error(
    "Configura ADMIN_EMAIL en tu perfil privado; no existe una dirección administrativa predeterminada.",
  );
const values: Record<string, string> = {
  ...source,
  AUTH_SECRET: source.AUTH_SECRET || randomBytes(48).toString("hex"),
  NEXTAUTH_URL: source.NEXTAUTH_URL || "https://mappleo.vercel.app",
  FIELD_ENCRYPTION_KEYS:
    source.FIELD_ENCRYPTION_KEYS ||
    JSON.stringify({ v1: randomBytes(32).toString("base64") }),
  FIELD_ENCRYPTION_ACTIVE_KEY: source.FIELD_ENCRYPTION_ACTIVE_KEY || "v1",
  FIELD_ENCRYPTION_INDEX_KEY:
    source.FIELD_ENCRYPTION_INDEX_KEY || randomBytes(32).toString("base64"),
  REGISTRATION_CODE:
    source.REGISTRATION_CODE || randomBytes(32).toString("base64url"),
  ACCOUNT_LIMIT_CEILING: "15",
  ALLOW_UNVERIFIED_REGISTRATION: "true",
  TRUSTED_CLIENT_IP_HEADER: "x-vercel-forwarded-for",
  ADMIN_EMAIL: adminEmail,
  ADMIN_PASSWORD: source.ADMIN_PASSWORD || randomBytes(32).toString("hex"),
  ADMIN_ACTION_PASSWORD:
    source.ADMIN_ACTION_PASSWORD || randomBytes(32).toString("hex"),
  ADMIN_TOTP_SECRET:
    source.ADMIN_TOTP_SECRET || new Secret({ size: 20 }).base32,
  ADMIN_ALLOWED_IPS: ip,
};
writeFileSync(
  file,
  Object.entries(values)
    .map(([key, value]) => key + "=" + value)
    .join("\n") + "\n",
  { mode: 0o600 },
);
const branchFlag = process.argv.indexOf("--branch-host");
if (branchFlag >= 0) {
  const branchHost = process.argv[branchFlag + 1];
  if (
    !branchHost ||
    !/^ep-[a-z0-9-]+\.c-\d+\.[a-z0-9.-]+\.neon\.tech$/.test(branchHost) ||
    branchHost === target.hostname ||
    branchHost.includes("-pooler.")
  )
    throw new Error("Host de rama temporal no válido.");
  const branch = { ...values };
  const url = new URL(branch.DATABASE_URL);
  url.hostname = branchHost;
  branch.DATABASE_URL = url.href;
  branch.DEPLOY_DATABASE_HOST = branchHost;
  branch.NEXTAUTH_URL = "https://localhost:3444";
  branch.TRUSTED_CLIENT_IP_HEADER = "";
  branch.ADMIN_ALLOWED_IPS = "127.0.0.1,::1";
  delete branch.DATABASE_RUNTIME_URL;
  delete branch.DATABASE_ADMIN_RUNTIME_URL;
  delete branch.VERCEL_API_TOKEN;
  writeFileSync(
    ".env.deploy-check",
    Object.entries(branch)
      .map(([key, value]) => key + "=" + value)
      .join("\n") + "\n",
    { mode: 0o600 },
  );
}
console.log(
  "Perfil de producción preparado en .env.deploy, independiente de .env. No se han mostrado secretos.",
);
