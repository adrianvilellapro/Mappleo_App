import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { SecurityError } from "./controls";
// Runs inside the write transaction: exceeding a limit rolls back every change.
export async function assertAccountQuota(
  tx: Prisma.TransactionClient,
  userId: string,
) {
  const rows = await tx.$queryRaw<
    { records: bigint; bytes: bigint; tags: bigint }[]
  >`
    SELECT SUM(n)::bigint AS records, SUM(b)::bigint AS bytes,
      (SELECT COUNT(*) FROM "TechnologyTag" WHERE "userId" = ${userId})::bigint AS tags
    FROM (
      SELECT COUNT(*) n, COALESCE(SUM(octet_length(row_to_json(t)::text)),0) b FROM "Company" t WHERE "userId" = ${userId}
      UNION ALL SELECT COUNT(*), COALESCE(SUM(octet_length(row_to_json(t)::text)),0) FROM "JobOffer" t WHERE "userId" = ${userId}
      UNION ALL SELECT COUNT(*), COALESCE(SUM(octet_length(row_to_json(t)::text)),0) FROM "Application" t WHERE "userId" = ${userId}
      UNION ALL SELECT COUNT(*), COALESCE(SUM(octet_length(row_to_json(t)::text)),0) FROM "Contact" t WHERE "userId" = ${userId}
      UNION ALL SELECT COUNT(*), COALESCE(SUM(octet_length(row_to_json(t)::text)),0) FROM "NetworkingEvent" t WHERE "userId" = ${userId}
      UNION ALL SELECT COUNT(*), COALESCE(SUM(octet_length(row_to_json(t)::text)),0) FROM "Task" t WHERE "userId" = ${userId}
      UNION ALL SELECT COUNT(*), COALESCE(SUM(octet_length(row_to_json(t)::text)),0) FROM "BoardColumn" t WHERE "userId" = ${userId}
      UNION ALL SELECT COUNT(*), COALESCE(SUM(octet_length(row_to_json(t)::text)),0) FROM "TaskCompletion" t WHERE "userId" = ${userId}
      UNION ALL SELECT COUNT(*), COALESCE(SUM(octet_length(row_to_json(t)::text)),0) FROM "ApplicationEvent" t WHERE "applicationId" IN (SELECT id FROM "Application" WHERE "userId" = ${userId})
      UNION ALL SELECT COUNT(*), COALESCE(SUM(octet_length(row_to_json(t)::text)),0) FROM "TaskLink" t WHERE "taskId" IN (SELECT id FROM "Task" WHERE "userId" = ${userId})
      UNION ALL SELECT COUNT(*), COALESCE(SUM(octet_length(row_to_json(t)::text)),0) FROM "_CompanyToNetworkingEvent" t WHERE "B" IN (SELECT id FROM "NetworkingEvent" WHERE "userId" = ${userId})
      UNION ALL SELECT COUNT(*), COALESCE(SUM(octet_length(row_to_json(t)::text)),0) FROM "_ContactToNetworkingEvent" t WHERE "B" IN (SELECT id FROM "NetworkingEvent" WHERE "userId" = ${userId})
      UNION ALL SELECT 0, COALESCE(SUM(octet_length(row_to_json(t)::text)),0) FROM "TechnologyTag" t WHERE "userId" = ${userId}
    ) inventory`;
  const usage = rows[0];
  const [limits] = await tx.$queryRaw<{ exceeded: boolean }[]>`
    SELECT (
      EXISTS (SELECT 1 FROM "ApplicationEvent" WHERE "applicationId" IN (SELECT id FROM "Application" WHERE "userId" = ${userId}) GROUP BY "applicationId" HAVING COUNT(*) > 2000)
      OR (SELECT COUNT(*) > 2000 FROM "Company" WHERE "userId" = ${userId})
      OR (SELECT COUNT(*) > 2000 FROM "JobOffer" WHERE "userId" = ${userId})
      OR (SELECT COUNT(*) > 2000 FROM "Application" WHERE "userId" = ${userId})
      OR (SELECT COUNT(*) > 2000 FROM "Contact" WHERE "userId" = ${userId})
      OR (SELECT COUNT(*) > 2000 FROM "NetworkingEvent" WHERE "userId" = ${userId})
      OR (SELECT COUNT(*) > 2000 FROM "Task" WHERE "userId" = ${userId})
      OR (SELECT COUNT(*) > 30 FROM "BoardColumn" WHERE "userId" = ${userId})
      OR (SELECT COUNT(*) > 4000 FROM "TaskCompletion" WHERE "userId" = ${userId})
    ) AS exceeded`;
  if (
    Number(usage.records) > 6000 ||
    Number(usage.bytes) > 8 * 1024 * 1024 ||
    Number(usage.tags) > 500 ||
    limits.exceeded
  )
    throw new SecurityError(
      "Has alcanzado el límite de almacenamiento de tu cuenta (6.000 registros, 8 MB o 500 tecnologías). Exporta y elimina datos que no necesites antes de añadir más.",
      409,
    );
}
