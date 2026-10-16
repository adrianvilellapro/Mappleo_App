import { readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { Client } from "pg";
import { Secret } from "otpauth";
import { adminConfiguration } from "../features/admin/config";
import { fieldCipher } from "../lib/db/field-encryption";
import { hashPassword } from "../lib/auth/password";
import { runtimePoolConfig } from "../lib/db/connection";
import {
  taskEnvironment,
  localRoleFallback,
  runtimeUrl,
} from "./task-environment";
const { file, test, target } = taskEnvironment();
const localEnv = localRoleFallback(test);
const adminEmail =
  process.env.ADMIN_EMAIL || (test ? "admin@example.test" : undefined);
if (!adminEmail)
  throw new Error(
    "Configura ADMIN_EMAIL explícitamente en el perfil privado antes de preparar la administración.",
  );
const adminUrl = runtimeUrl(target);
adminUrl.username = "mappleo_admin_runtime";
const previous =
  process.env.DATABASE_ADMIN_RUNTIME_URL || localEnv.DATABASE_ADMIN_RUNTIME_URL;
const previousUrl = previous ? new URL(previous) : null;
// Never write invented credentials for an existing SQL role if its private URL was lost.
const roleCheck = new Client(
  runtimePoolConfig(target.href, process.env.DATABASE_SSL_CA),
);
await roleCheck.connect();
try {
  const exists = await roleCheck.query(
    "SELECT 1 FROM pg_roles WHERE rolname = 'mappleo_admin_runtime'",
  );
  if (exists.rowCount && previousUrl?.username !== "mappleo_admin_runtime")
    throw new Error(
      "Restaura DATABASE_ADMIN_RUNTIME_URL desde tu copia privada. No se ha cambiado .env ni la contraseña del rol existente.",
    );
} finally {
  await roleCheck.end();
}
adminUrl.password =
  previousUrl?.username === "mappleo_admin_runtime"
    ? decodeURIComponent(previousUrl.password)
    : randomBytes(32).toString("hex");
const generated = {
  ADMIN_EMAIL: adminEmail,
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || randomBytes(32).toString("hex"),
  ADMIN_ACTION_PASSWORD:
    process.env.ADMIN_ACTION_PASSWORD || randomBytes(32).toString("hex"),
  ADMIN_TOTP_SECRET:
    process.env.ADMIN_TOTP_SECRET || new Secret({ size: 20 }).base32,
  ADMIN_ALLOWED_IPS: process.env.ADMIN_ALLOWED_IPS || "127.0.0.1,::1",
  DATABASE_ADMIN_RUNTIME_URL: adminUrl.href,
};
let contents = readFileSync(file, "utf8");
for (const [key, value] of Object.entries(generated)) {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, "m");
  contents = pattern.test(contents)
    ? contents.replace(pattern, () => line)
    : contents.trimEnd() + "\n" + line + "\n";
  process.env[key] = value;
}
// Persist generated credentials once, before provisioning. Never print them.
writeFileSync(file, contents, { mode: 0o600 });
const settings = adminConfiguration();
const client = new Client(
  runtimePoolConfig(target.href, process.env.DATABASE_SSL_CA),
);
await client.connect();
try {
  await client.query("BEGIN");
  const existingRole = await client.query(
    "SELECT 1 FROM pg_roles WHERE rolname = 'mappleo_admin_runtime'",
  );
  if (!existingRole.rowCount)
    await client.query(
      `CREATE ROLE mappleo_admin_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '${decodeURIComponent(adminUrl.password).replace(/'/g, "''")}'`,
    );
  else if (!previousUrl || previousUrl.username !== "mappleo_admin_runtime")
    throw new Error(
      "Faltan las credenciales del rol administrativo existente; no se ha sustituido su contraseña.",
    );
  const privileges = await client.query(
    "SELECT rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls AS unsafe FROM pg_roles WHERE rolname=$1",
    ["mappleo_admin_runtime"],
  );
  const memberships = await client.query(
    "SELECT 1 FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname=$1)",
    ["mappleo_admin_runtime"],
  );
  if (privileges.rows[0]?.unsafe || memberships.rowCount)
    throw new Error(
      "El usuario administrativo tiene privilegios SQL no permitidos; se ha detenido la preparación.",
    );
  await client.query("GRANT USAGE ON SCHEMA public TO mappleo_admin_runtime");
  await client.query(
    "REVOKE ALL ON ALL TABLES IN SCHEMA public FROM mappleo_admin_runtime",
  );
  await client.query(
    'GRANT SELECT ON "AdminAccount", "AdminSession", "AdminAudit", "RegistrationPolicy" TO mappleo_admin_runtime',
  );
  await client.query(
    'GRANT UPDATE ("lastTotpCounter") ON "AdminAccount" TO mappleo_admin_runtime',
  );
  await client.query(
    'GRANT INSERT, UPDATE, DELETE ON "AdminSession" TO mappleo_admin_runtime',
  );
  await client.query('GRANT INSERT ON "AdminAudit" TO mappleo_admin_runtime');
  await client.query(
    'GRANT UPDATE ("maxAccounts") ON "RegistrationPolicy" TO mappleo_admin_runtime',
  );
  await client.query(
    'GRANT SELECT (id, email, "emailLookup", "createdAt", "updatedAt", "sessionVersion") ON "User" TO mappleo_admin_runtime',
  );
  await client.query(
    'GRANT UPDATE ("passwordHash", "sessionVersion", "failedAttempts", "lockedUntil", "updatedAt") ON "User" TO mappleo_admin_runtime',
  );
  await client.query(
    'GRANT SELECT (id, "userId", "expiresAt") ON "AuthSession" TO mappleo_admin_runtime',
  );
  await client.query('GRANT DELETE ON "AuthSession" TO mappleo_admin_runtime');
  for (const table of [
    "Company",
    "JobOffer",
    "Application",
    "Contact",
    "NetworkingEvent",
    "Task",
  ])
    await client.query(
      `GRANT SELECT (id, "userId") ON "${table}" TO mappleo_admin_runtime`,
    );
  await client.query(
    "GRANT EXECUTE ON FUNCTION mappleo_admin_delete_user(TEXT) TO mappleo_admin_runtime",
  );
  await client.query(
    'REVOKE ALL ON "AdminAccount", "AdminSession", "AdminAudit", "RegistrationPolicy" FROM mappleo_runtime',
  );
  await client.query('GRANT SELECT ON "RegistrationPolicy" TO mappleo_runtime');
  await client.query(
    "REVOKE ALL ON FUNCTION mappleo_admin_delete_user(TEXT) FROM mappleo_runtime",
  );
  const lookup = fieldCipher().emailLookup(settings.email);
  const collision = await client.query(
    'SELECT 1 FROM "User" WHERE "emailLookup" = $1',
    [lookup],
  );
  if (collision.rowCount)
    throw new Error(
      "El identificador administrativo coincide con un usuario. Elige otro ADMIN_EMAIL; ninguna cuenta ha sido promovida.",
    );
  const passwordHash = await hashPassword(settings.password);
  const actionHash = await hashPassword(settings.actionPassword);
  const account = await client.query(
    'SELECT fingerprint FROM "AdminAccount" WHERE id = 1',
  );
  if (account.rows[0]?.fingerprint !== settings.fingerprint) {
    await client.query('DELETE FROM "AdminSession"');
    await client.query(
      'INSERT INTO "AdminAccount" (id,"emailLookup","passwordHash","actionPasswordHash",fingerprint) VALUES (1,$1,$2,$3,$4) ON CONFLICT (id) DO UPDATE SET "emailLookup"=EXCLUDED."emailLookup", "passwordHash"=EXCLUDED."passwordHash", "actionPasswordHash"=EXCLUDED."actionPasswordHash", fingerprint=EXCLUDED.fingerprint, "lastTotpCounter"=-1',
      [lookup, passwordHash, actionHash, settings.fingerprint],
    );
  }
  if (test)
    await client.query(
      'UPDATE "RegistrationPolicy" SET "maxAccounts" = 100000 WHERE id = 1',
    );
  await client.query("COMMIT");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}
const probe = new Client(
  runtimePoolConfig(adminUrl.href, process.env.DATABASE_SSL_CA),
);
await probe.connect();
await probe.end();
console.log(
  `Administrador único preparado. Credenciales guardadas únicamente en ${file}; no se han mostrado ni borrado datos.`,
);
