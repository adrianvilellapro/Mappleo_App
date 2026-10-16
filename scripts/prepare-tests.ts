import "dotenv/config";
import { Client } from "pg";
import { writeFileSync, existsSync, readFileSync } from "node:fs";
import { parse } from "dotenv";
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
const source = new URL(process.env.DATABASE_URL!);
if (!["localhost", "127.0.0.1"].includes(source.hostname))
  throw new Error("Las pruebas solo se preparan en PostgreSQL local.");
const admin = new Client({ connectionString: source.toString() });
await admin.connect();
try {
  const exists = await admin.query(
    "SELECT 1 FROM pg_database WHERE datname = $1",
    ["mappleo_test"],
  );
  if (!exists.rowCount) await admin.query('CREATE DATABASE "mappleo_test"');
} finally {
  await admin.end();
}
source.pathname = "/mappleo_test";
const previous = existsSync(".env.test")
  ? parse(readFileSync(".env.test"))
  : {};
const runtime = new URL(process.env.DATABASE_RUNTIME_URL ?? source.href);
runtime.pathname = "/mappleo_test";
writeFileSync(
  ".env.test",
  [
    "DATABASE_URL=" + source.toString(),
    "DATABASE_RUNTIME_URL=" + runtime.toString(),
    "AUTH_SECRET=" + randomBytes(48).toString("hex"),
    "AUTHORIZED_EMAIL=owner@example.test",
    "NEXTAUTH_URL=http://localhost:3100",
    "E2E_PASSWORD=" + randomBytes(24).toString("hex"),
    "REGISTRATION_CODE=" +
      (previous.REGISTRATION_CODE ?? randomBytes(32).toString("base64url")),
    "ACCOUNT_LIMIT_CEILING=100000",
    ...[
      "ADMIN_EMAIL",
      "ADMIN_PASSWORD",
      "ADMIN_ACTION_PASSWORD",
      "ADMIN_TOTP_SECRET",
      "ADMIN_ALLOWED_IPS",
      "DATABASE_ADMIN_RUNTIME_URL",
    ]
      .filter((key) => previous[key])
      .map((key) => key + "=" + previous[key]),
    "FIELD_ENCRYPTION_KEYS=" +
      (previous.FIELD_ENCRYPTION_KEYS ??
        JSON.stringify({ v1: randomBytes(32).toString("base64") })),
    "FIELD_ENCRYPTION_ACTIVE_KEY=" +
      (previous.FIELD_ENCRYPTION_ACTIVE_KEY ?? "v1"),
    "FIELD_ENCRYPTION_INDEX_KEY=" +
      (previous.FIELD_ENCRYPTION_INDEX_KEY ??
        randomBytes(32).toString("base64")),
  ].join("\n") + "\n",
);
execFileSync(
  process.execPath,
  ["node_modules/prisma/build/index.js", "migrate", "deploy"],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      DATABASE_URL: source.href,
      DATABASE_RUNTIME_URL: runtime.href,
    },
  },
);
execFileSync(
  process.execPath,
  ["node_modules/tsx/dist/cli.mjs", "scripts/security-prepare.ts", "--test"],
  { stdio: "inherit", env: process.env },
);
console.log(
  "Base mappleo_test preparada. Credenciales ficticias generadas en .env.test (ignorado).",
);
execFileSync(
  process.execPath,
  ["node_modules/tsx/dist/cli.mjs", "scripts/encryption-prepare.ts", "--test"],
  { stdio: "inherit", env: process.env },
);
execFileSync(
  process.execPath,
  ["node_modules/tsx/dist/cli.mjs", "scripts/admin-prepare.ts", "--test"],
  { stdio: "inherit", env: process.env },
);
