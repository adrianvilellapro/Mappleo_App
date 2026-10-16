import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { createBackup } from "@/features/backup/data";
import { backupSchema } from "@/packages/domain/backup";
import { backupWithinStructuralLimits } from "@/features/backup/preflight";
import {
  canonical,
  wireWorkspace,
  syncSections,
  type SyncWorkspace,
  type SyncSection,
  syncPatchSchema,
  applyWorkspacePatch,
  workspacePatch,
} from "@/packages/domain/sync";
import { uniqueTechnologies } from "@/packages/domain/technologies";
import { assertAccountQuota } from "@/lib/security/quota";
import { SecurityError } from "@/lib/security/controls";
type Tx = Prisma.TransactionClient;

async function revision(tx: Tx, userId: string) {
  return (
    (
      await tx.syncVersion.findUnique({ where: { userId } })
    )?.revision.toString() ?? "0"
  );
}
export async function pullWorkspace(userId: string, known: string | null) {
  return db.$transaction(
    async (tx) => {
      const cursor = await revision(tx, userId);
      if (known === cursor) return { revision: cursor };
      const workspace = wireWorkspace(await createBackup(userId, tx));
      return { revision: cursor, workspace };
    },
    { isolationLevel: "RepeatableRead", timeout: 20000 },
  );
}
function omit<T extends object, K extends keyof T>(
  item: T,
  keys: K[],
): Omit<T, K> {
  return Object.fromEntries(
    Object.entries(item).filter(([key]) => !keys.includes(key as K)),
  ) as Omit<T, K>;
}
/** Only changed rows are written. Extended unique filters always bind id + owner;
 * a guessed ID belonging to another account cannot be updated or connected. */
export async function applyWorkspace(
  tx: Tx,
  userId: string,
  before: SyncWorkspace,
  after: SyncWorkspace,
) {
  const data = backupSchema.parse(after);
  const changed = (section: SyncSection, item: { id: string }) =>
    canonical((before[section] ?? []).find((r) => r.id === item.id)) !==
    canonical(item);
  const deleted = (section: SyncSection) =>
    (before[section] ?? [])
      .filter((row) => !(after[section] ?? []).some((r) => r.id === row.id))
      .map((row) => row.id);
  await tx.taskCompletion.deleteMany({
    where: { userId, id: { in: deleted("taskCompletions") } },
  });
  await tx.task.deleteMany({ where: { userId, id: { in: deleted("tasks") } } });
  for (const item of data.companies)
    if (changed("companies", item)) {
      const fields = {
        ...item,
        faviconUrl: item.faviconUrl ?? "",
        updatedAt: new Date(),
      };
      await tx.company.upsert({
        where: { id: item.id, userId },
        create: fields,
        update: omit(fields, ["id", "userId"]),
      });
    }
  for (const item of data.boardColumns ?? [])
    if (changed("boardColumns", item))
      await tx.boardColumn.upsert({
        where: { id: item.id, userId },
        create: item,
        update: omit(item, ["id", "userId"]),
      });
  for (const item of data.offers)
    if (changed("offers", item)) {
      const fields = { ...item, updatedAt: new Date() };
      await tx.jobOffer.upsert({
        where: { id: item.id, userId },
        create: fields,
        update: omit(fields, ["id", "userId"]),
      });
    }
  for (const item of data.applications)
    if (changed("applications", item)) {
      const fields = { ...omit(item, ["events"]), updatedAt: new Date() };
      await tx.application.upsert({
        where: { id: item.id, userId },
        create: fields,
        update: omit(fields, ["id", "userId"]),
      });
      await tx.applicationEvent.deleteMany({
        where: { applicationId: item.id, application: { userId } },
      });
      if (item.events.length)
        await tx.applicationEvent.createMany({ data: item.events });
    }
  for (const item of data.contacts)
    if (changed("contacts", item)) {
      const fields = { ...item, updatedAt: new Date() };
      await tx.contact.upsert({
        where: { id: item.id, userId },
        create: fields,
        update: omit(fields, ["id", "userId"]),
      });
    }
  for (const item of data.networking)
    if (changed("networking", item)) {
      const fields = {
        ...omit(item, ["companies", "contacts"]),
        updatedAt: new Date(),
      };
      const companies = item.companies.map((c) => ({ id: c.id, userId })),
        contacts = item.contacts.map((c) => ({ id: c.id, userId }));
      await tx.networkingEvent.upsert({
        where: { id: item.id, userId },
        create: {
          ...fields,
          companies: { connect: companies },
          contacts: { connect: contacts },
        },
        update: {
          ...omit(fields, ["id", "userId"]),
          companies: { set: companies },
          contacts: { set: contacts },
        },
      });
    }
  // Release old reminder uniqueness before reassignments (sourceKey is global).
  const changedTasks = (data.tasks ?? []).filter((item) =>
    changed("tasks", item),
  );
  if (changedTasks.length)
    await tx.task.updateMany({
      where: { userId, id: { in: changedTasks.map((t) => t.id) } },
      data: { sourceKey: null },
    });
  for (const item of changedTasks) {
    const fields = {
      ...omit(item, ["links"]),
      updatedAt: new Date(),
      sourceKey:
        !item.completedAt && item.sourceKind && item.sourceId
          ? item.sourceKind + ":" + item.sourceId
          : null,
    };
    await tx.task.upsert({
      where: { id: item.id, userId },
      create: fields,
      update: omit(fields, ["id", "userId"]),
    });
    await tx.taskLink.deleteMany({
      where: { taskId: item.id, task: { userId } },
    });
    if (item.links.length)
      await tx.taskLink.createMany({
        data: item.links.map((link) => ({ ...link, taskId: item.id })),
      });
  }
  for (const item of data.taskCompletions ?? [])
    if (changed("taskCompletions", item)) {
      const fields = {
        ...item,
        companyIds: item.companyIds ?? [],
        sources: item.sources ?? [],
      };
      await tx.taskCompletion.upsert({
        where: { id: item.id, userId },
        create: fields,
        update: omit(fields, ["id", "userId"]),
      });
    }
  await tx.networkingEvent.deleteMany({
    where: { userId, id: { in: deleted("networking") } },
  });
  await tx.contact.deleteMany({
    where: { userId, id: { in: deleted("contacts") } },
  });
  await tx.application.deleteMany({
    where: { userId, id: { in: deleted("applications") } },
  });
  await tx.jobOffer.deleteMany({
    where: { userId, id: { in: deleted("offers") } },
  });
  await tx.company.deleteMany({
    where: { userId, id: { in: deleted("companies") } },
  });
  await tx.boardColumn.deleteMany({
    where: { userId, id: { in: deleted("boardColumns") } },
  });
  const technologies = uniqueTechnologies([
    ...(data.technologyTags ?? []),
    ...data.offers.flatMap((o) => o.technologies),
  ]);
  const existingTags = new Set(
    (
      await tx.technologyTag.findMany({
        where: { userId },
        select: { key: true },
      })
    ).map((t) => t.key),
  );
  const newTags = technologies.filter((tag) => !existingTags.has(tag.key));
  if (newTags.length)
    await tx.technologyTag.createMany({
      data: newTags.map((tag) => ({ ...tag, userId })),
      skipDuplicates: true,
    });
  await assertAccountQuota(tx, userId);
}
export async function pushWorkspace(
  device: { id: string; userId: string; sessionVersion: number },
  expectedRevision: string,
  raw: unknown,
  delta = false,
) {
  const patch = delta ? syncPatchSchema.parse(raw) : undefined;
  if (!backupWithinStructuralLimits(patch?.upserts ?? raw))
    throw new SecurityError(
      "La estructura del espacio supera los límites permitidos.",
      413,
    );
  const supplied = delta ? undefined : wireWorkspace(raw),
    userId = device.userId;
  return db.$transaction(
    async (tx) => {
      const current = await tx.desktopDevice.findFirst({
        where: {
          id: device.id,
          userId,
          expiresAt: { gt: new Date() },
          user: { sessionVersion: device.sessionVersion },
        },
        select: { id: true },
      });
      if (!current) throw new SecurityError("La conexión se ha revocado.", 401);
      await tx.syncVersion.upsert({
        where: { userId },
        create: { userId, revision: 0 },
        update: {},
      });
      const [locked] = await tx.$queryRaw<
        { revision: bigint }[]
      >`SELECT "revision" FROM "SyncVersion" WHERE "userId"=${userId} FOR UPDATE`;
      if (locked.revision.toString() !== expectedRevision)
        throw new SecurityError(
          "Hay cambios nuevos en la web. Se volverán a comprobar.",
          409,
        );
      const before = wireWorkspace(await createBackup(userId, tx));
      const workspace = patch ? applyWorkspacePatch(before, patch) : supplied!;
      if (
        workspace.ownerId !== userId ||
        syncSections.some((section) =>
          (workspace[section] ?? []).some((row) => row.userId !== userId),
        )
      )
        throw new SecurityError("Los datos no pertenecen a esta cuenta.", 403);
      await applyWorkspace(tx, userId, before, workspace);
      // Return exactly what was committed, including server timestamps and normalized fields.
      const committed = wireWorkspace(await createBackup(userId, tx));
      return {
        revision: await revision(tx, userId),
        workspace: committed,
        changes: workspacePatch(before, committed),
      };
    },
    { isolationLevel: "Serializable", timeout: 20000, maxWait: 5000 },
  );
}
