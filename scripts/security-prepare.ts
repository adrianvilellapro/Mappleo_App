import { Client } from "pg";
import { readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import {
  taskEnvironment,
  localRoleFallback,
  runtimeUrl as pooledUrl,
} from "./task-environment";
import { runtimePoolConfig } from "../lib/db/connection";

const { file, test, target: adminUrl } = taskEnvironment();
const existing = localRoleFallback(test);
const previous =
  process.env.DATABASE_RUNTIME_URL || existing.DATABASE_RUNTIME_URL;
const runtimeUrl = pooledUrl(adminUrl);
runtimeUrl.username = "mappleo_runtime";
const previousUrl = previous ? new URL(previous) : null;
runtimeUrl.password =
  previousUrl?.username === "mappleo_runtime"
    ? decodeURIComponent(previousUrl.password)
    : randomBytes(32).toString("hex");
const connection = new Client(
  runtimePoolConfig(adminUrl.href, process.env.DATABASE_SSL_CA),
);
await connection.connect();
try {
  const role = await connection.query(
    "SELECT 1 FROM pg_roles WHERE rolname = $1",
    ["mappleo_runtime"],
  );
  if (role.rowCount && previousUrl?.username !== "mappleo_runtime")
    throw new Error(
      "Faltan las credenciales del usuario limitado existente; no se ha cambiado su contraseña.",
    );
  // Save generated credentials BEFORE creating the role, so a later provisioning
  // failure can be retried without losing the password of a newly created role.
  const contents = readFileSync(file, "utf8");
  const line = "DATABASE_RUNTIME_URL=" + runtimeUrl.href;
  writeFileSync(
    file,
    /^DATABASE_RUNTIME_URL=.*$/m.test(contents)
      ? contents.replace(/^DATABASE_RUNTIME_URL=.*$/m, () => line)
      : contents.trimEnd() + "\n" + line + "\n",
    { mode: 0o600 },
  );
  if (!role.rowCount) {
    // PostgreSQL utility statements cannot bind passwords; quote a generated/validated literal.
    const secret = decodeURIComponent(runtimeUrl.password).replace(/'/g, "''");
    await connection.query(
      `CREATE ROLE mappleo_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '${secret}'`,
    );
  } else if (!previousUrl || previousUrl.username !== "mappleo_runtime") {
    throw new Error(
      "El usuario limitado ya existe, pero faltan sus credenciales locales. No se ha cambiado su contraseña.",
    );
  }
  const privileges = await connection.query(
    "SELECT rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls AS unsafe FROM pg_roles WHERE rolname=$1",
    ["mappleo_runtime"],
  );
  const memberships = await connection.query(
    "SELECT 1 FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname=$1)",
    ["mappleo_runtime"],
  );
  if (privileges.rows[0]?.unsafe || memberships.rowCount)
    throw new Error(
      "El usuario limitado tiene privilegios no permitidos; se ha detenido la preparación.",
    );
  await connection.query("REVOKE CREATE ON SCHEMA public FROM PUBLIC");
  await connection.query("GRANT USAGE ON SCHEMA public TO mappleo_runtime");
  await connection.query(
    "GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO mappleo_runtime",
  );
  await connection.query(
    "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO mappleo_runtime",
  );
  const migrations = await connection.query(
    "SELECT to_regclass('public.\"_prisma_migrations\"') AS table_name",
  );
  if (migrations.rows[0]?.table_name)
    await connection.query(
      'REVOKE ALL ON "_prisma_migrations" FROM mappleo_runtime',
    );
  const log = await connection.query(
    "SELECT to_regclass('public.\"SecurityEvent\"') AS table_name",
  );
  if (log.rows[0]?.table_name) {
    await connection.query(
      'REVOKE UPDATE, DELETE, TRUNCATE ON "SecurityEvent" FROM mappleo_runtime',
    );
    await connection.query(
      'GRANT SELECT, INSERT ON "SecurityEvent" TO mappleo_runtime',
    );
  }
  const adminTables = await connection.query(
    "SELECT to_regclass('public.\"AdminAccount\"') AS table_name",
  );
  if (adminTables.rows[0]?.table_name) {
    await connection.query(
      'REVOKE ALL ON "AdminAccount", "AdminSession", "AdminAudit", "RegistrationPolicy" FROM mappleo_runtime',
    );
    await connection.query(
      'GRANT SELECT ON "RegistrationPolicy" TO mappleo_runtime',
    );
    await connection.query(
      "REVOKE ALL ON FUNCTION mappleo_admin_delete_user(TEXT) FROM mappleo_runtime",
    );
  }
} finally {
  await connection.end();
}
const probe = new Client(
  runtimePoolConfig(runtimeUrl.href, process.env.DATABASE_SSL_CA),
);
await probe.connect();
await probe.end();
const contents = readFileSync(file, "utf8");
const line = "DATABASE_RUNTIME_URL=" + runtimeUrl.href;
writeFileSync(
  file,
  /^DATABASE_RUNTIME_URL=.*$/m.test(contents)
    ? contents.replace(/^DATABASE_RUNTIME_URL=.*$/m, line)
    : contents.trimEnd() + "\n" + line + "\n",
);
console.log(
  "Conexión limitada preparada en " +
    file +
    ". No se han mostrado credenciales ni modificado registros.",
);
