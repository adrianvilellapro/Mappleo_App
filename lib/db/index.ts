import "server-only";
import { PrismaClient } from "@/generated/prisma/client";
import { createHash } from "node:crypto";
import { databaseAdapter } from "./adapter";
import { encryptClient } from "./encrypted-client";
const globalDb = globalThis as unknown as {
  prisma?: PrismaClient;
  databaseKey?: string;
};
const connectionString = process.env.DATABASE_RUNTIME_URL;
if (!connectionString)
  throw new Error(
    "Run npm run security:prepare to configure the restricted database connection.",
  );
if (
  process.env.NODE_ENV === "test" &&
  new URL(connectionString).pathname !== "/mappleo_test"
)
  throw new Error("Tests must never connect to the development database.");
const target = new URL(connectionString);
const databaseKey = createHash("sha256")
  .update(target.href)
  .update(process.env.DATABASE_SSL_CA ?? "")
  .update(process.env.FIELD_ENCRYPTION_KEYS ?? "")
  .update(process.env.FIELD_ENCRYPTION_ACTIVE_KEY ?? "")
  .update(process.env.FIELD_ENCRYPTION_INDEX_KEY ?? "")
  .digest("hex");
const cached =
  globalDb.databaseKey === databaseKey ? globalDb.prisma : undefined;
export const db =
  cached ??
  encryptClient(
    new PrismaClient({
      adapter: databaseAdapter(target.href, process.env.DATABASE_SSL_CA),
    }),
  );
{
  if (globalDb.prisma && !cached)
    void globalDb.prisma.$disconnect().catch(() => undefined);
  globalDb.prisma = db;
  globalDb.databaseKey = databaseKey;
}
let privileges: Promise<void> | undefined;
export function assertRuntimePrivileges() {
  privileges ??= (async () => {
    const [encryption] = await db.$queryRaw<{ prepared: boolean }[]>`
      SELECT COUNT(*) = 11 AS prepared FROM pg_constraint WHERE conname LIKE 'mappleo_encrypted_%'`;
    if (!encryption?.prepared)
      throw new Error(
        "Run npm run encryption:prepare before serving encrypted data.",
      );
    const [role] = await db.$queryRaw<{ unsafe: boolean }[]>`
      SELECT (rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls
        OR has_schema_privilege(CURRENT_USER, 'public', 'CREATE')
        OR has_table_privilege(CURRENT_USER, '"_prisma_migrations"', 'INSERT,UPDATE,DELETE')
        OR has_table_privilege(CURRENT_USER, '"SecurityEvent"', 'UPDATE,DELETE')
        OR has_table_privilege(CURRENT_USER, '"AdminAccount"', 'SELECT,INSERT,UPDATE,DELETE')
        OR has_table_privilege(CURRENT_USER, '"AdminSession"', 'SELECT,INSERT,UPDATE,DELETE')
        OR has_table_privilege(CURRENT_USER, '"AdminAudit"', 'SELECT,INSERT,UPDATE,DELETE')
        OR has_table_privilege(CURRENT_USER, '"RegistrationPolicy"', 'INSERT,UPDATE,DELETE')) AS unsafe
      FROM pg_roles WHERE rolname = CURRENT_USER`;
    if (!role || role.unsafe)
      throw new Error(
        "The application database role is overprivileged. Run security:prepare or configure a restricted runtime role.",
      );
  })().catch((error) => {
    privileges = undefined;
    throw error;
  });
  return privileges;
}
