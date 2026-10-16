import "server-only";
import { PrismaClient } from "@/generated/prisma/client";
import { databaseAdapter } from "@/lib/db/adapter";
import { encryptClient } from "@/lib/db/encrypted-client";
import { createHash } from "node:crypto";
const globalAdmin = globalThis as unknown as {
  adminDb?: PrismaClient;
  adminKey?: string;
};
export function adminDatabase() {
  const url = process.env.DATABASE_ADMIN_RUNTIME_URL;
  if (
    !url ||
    (process.env.NODE_ENV === "test" &&
      new URL(url).pathname !== "/mappleo_test")
  )
    throw new Error("Admin database unavailable.");
  const key = createHash("sha256")
    .update(url)
    .update(process.env.FIELD_ENCRYPTION_KEYS ?? "")
    .update(process.env.FIELD_ENCRYPTION_INDEX_KEY ?? "")
    .update(process.env.DATABASE_SSL_CA ?? "")
    .digest("hex");
  if (globalAdmin.adminDb && globalAdmin.adminKey === key)
    return globalAdmin.adminDb;
  if (globalAdmin.adminDb)
    void globalAdmin.adminDb.$disconnect().catch(() => undefined);
  globalAdmin.adminDb = encryptClient(
    new PrismaClient({
      adapter: databaseAdapter(url, process.env.DATABASE_SSL_CA),
    }),
  );
  globalAdmin.adminKey = key;
  return globalAdmin.adminDb;
}
export async function assertAdminPrivileges() {
  const [role] = await adminDatabase().$queryRaw<{ unsafe: boolean }[]>`
    SELECT (rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls
      OR has_schema_privilege(CURRENT_USER, 'public', 'CREATE')
      OR has_column_privilege(CURRENT_USER, '"Company"', 'notes', 'SELECT')
      OR has_column_privilege(CURRENT_USER, '"User"', 'passwordHash', 'SELECT')
      OR has_table_privilege(CURRENT_USER, '"AdminAccount"', 'INSERT,DELETE')
      OR has_table_privilege(CURRENT_USER, '"AdminAudit"', 'UPDATE,DELETE')) AS unsafe
    FROM pg_roles WHERE rolname = CURRENT_USER`;
  if (!role || role.unsafe)
    throw new Error("Overprivileged admin database role.");
}
