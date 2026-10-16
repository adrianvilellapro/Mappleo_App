import { Client } from "pg";
import { taskEnvironment } from "./task-environment";
import { runtimePoolConfig } from "../lib/db/connection";
const { target } = taskEnvironment();
const client = new Client(runtimePoolConfig(target.href));
await client.connect();
try {
  const result = await client.query(
    "SELECT tablename FROM pg_tables WHERE schemaname=$1",
    ["public"],
  );
  const tables: string[] = result.rows.map((row) => row.tablename);
  const counts: Record<string, number> = {};
  for (const table of [
    "User",
    "AdminAccount",
    "Company",
    "Application",
    "JobOffer",
    "Task",
    "Contact",
    "NetworkingEvent",
  ])
    if (tables.includes(table))
      counts[table] = Number(
        (await client.query(`SELECT count(*) FROM "${table}"`)).rows[0].count,
      );
  const policy = tables.includes("RegistrationPolicy")
    ? (
        await client.query(
          'SELECT "maxAccounts", "accountCount" FROM "RegistrationPolicy" WHERE id=1',
        )
      ).rows[0]
    : null;
  console.log(
    JSON.stringify({
      tlsVerified: true,
      publicTables: tables.length,
      counts,
      policy,
    }),
  );
} finally {
  await client.end();
}
