import "server-only";
import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import type { Backup } from "./schema";
import { uniqueTechnologies } from "@/features/tracker/technologies";
import { ensureColumns, recordLabel } from "@/features/tasks/service";
import { type EntityKind } from "@/features/tracker/config";
import { assertAccountQuota } from "@/lib/security/quota";

function omit<T extends object, K extends keyof T>(
  value: T,
  keys: readonly K[],
): Omit<T, K> {
  return Object.fromEntries(
    Object.entries(value).filter(([key]) => !keys.includes(key as K)),
  ) as Omit<T, K>;
}

export async function restoreBackup(userId: string, backup: Backup) {
  const sourceOwner =
    backup.ownerId ??
    backup.companies[0]?.userId ??
    backup.offers[0]?.userId ??
    backup.applications[0]?.userId ??
    backup.contacts[0]?.userId ??
    backup.networking[0]?.userId;
  if (!sourceOwner) return { created: 0, updated: 0 };
  const target = (kind: string, sourceId: string) =>
    sourceOwner === userId
      ? sourceId
      : "restore_" +
        createHash("sha256")
          .update(JSON.stringify([userId, sourceOwner, kind, sourceId]))
          .digest("hex")
          .slice(0, 32);
  const counts = { created: 0, updated: 0 };
  const checkOwner = (owner: string | undefined) => {
    if (owner && owner !== userId)
      throw new Error("El archivo coincide con datos de otra cuenta.");
    if (owner) counts.updated++;
    else counts.created++;
  };

  await db.$transaction(
    async (tx) => {
      const technologyTags = uniqueTechnologies([
        ...(backup.technologyTags ?? []),
        ...backup.offers.flatMap((offer) => offer.technologies),
      ]);
      if (technologyTags.length)
        await tx.technologyTag.createMany({
          data: technologyTags.map((tag) => ({ ...tag, userId })),
          skipDuplicates: true,
        });
      for (const item of backup.companies) {
        const id = target("company", item.id);
        const existing = await tx.company.findUnique({
          where: { id },
          select: { userId: true },
        });
        checkOwner(existing?.userId);
        const fields = {
          ...omit(item, ["id", "userId"]),
          faviconUrl: item.faviconUrl ?? "",
        };
        await tx.company.upsert({
          where: { id },
          create: { ...fields, id, userId },
          update: fields,
        });
      }
      for (const item of backup.offers) {
        const id = target("offer", item.id);
        const existing = await tx.jobOffer.findUnique({
          where: { id },
          select: { userId: true },
        });
        checkOwner(existing?.userId);
        const fields = omit(item, ["id", "userId", "companyId"]);
        const companyId = target("company", item.companyId);
        await tx.jobOffer.upsert({
          where: { id },
          create: { ...fields, id, userId, companyId },
          update: { ...fields, companyId },
        });
      }
      for (const item of backup.applications) {
        const jobOfferId = target("offer", item.jobOfferId);
        const preferredId = target("application", item.id);
        const byId = await tx.application.findUnique({
          where: { id: preferredId },
          select: { id: true, userId: true },
        });
        checkOwner(byId?.userId);
        const id = preferredId;
        const fields = omit(item, ["id", "userId", "jobOfferId", "events"]);
        await tx.application.upsert({
          where: { id },
          create: { ...fields, id, userId, jobOfferId },
          update: { ...fields, jobOfferId },
        });
        for (const event of item.events) {
          const eventId = target("history", event.id);
          const existingEvent = await tx.applicationEvent.findUnique({
            where: { id: eventId },
            select: { application: { select: { userId: true } } },
          });
          checkOwner(existingEvent?.application.userId);
          const eventFields = omit(event, ["id", "applicationId"]);
          await tx.applicationEvent.upsert({
            where: { id: eventId },
            create: { ...eventFields, id: eventId, applicationId: id },
            update: { ...eventFields, applicationId: id },
          });
        }
      }
      for (const item of backup.contacts) {
        const id = target("contact", item.id);
        const existing = await tx.contact.findUnique({
          where: { id },
          select: { userId: true },
        });
        checkOwner(existing?.userId);
        const fields = omit(item, ["id", "userId", "companyId"]);
        const companyId = item.companyId
          ? target("company", item.companyId)
          : null;
        await tx.contact.upsert({
          where: { id },
          create: { ...fields, id, userId, companyId },
          update: { ...fields, companyId },
        });
      }
      for (const item of backup.networking) {
        const id = target("networking", item.id);
        const existing = await tx.networkingEvent.findUnique({
          where: { id },
          select: { userId: true },
        });
        checkOwner(existing?.userId);
        const fields = omit(item, ["id", "userId", "companies", "contacts"]);
        const companies = item.companies.map((company) => ({
          id: target("company", company.id),
        }));
        const contacts = item.contacts.map((contact) => ({
          id: target("contact", contact.id),
        }));
        await tx.networkingEvent.upsert({
          where: { id },
          create: {
            ...fields,
            id,
            userId,
            companies: { connect: companies },
            contacts: { connect: contacts },
          },
          update: {
            ...fields,
            companies: { set: companies },
            contacts: { set: contacts },
          },
        });
      }
      const { columns: currentColumns } = await ensureColumns(tx, userId);
      const columnMap = new Map<string, string>();
      for (const item of backup.boardColumns ?? []) {
        const preferredId = target("column", item.id),
          system = item.systemKey
            ? currentColumns.find((c) => c.systemKey === item.systemKey)
            : null;
        const id = system?.id ?? preferredId,
          existing = await tx.boardColumn.findUnique({
            where: { id },
            select: { userId: true },
          });
        checkOwner(existing?.userId);
        columnMap.set(item.id, id);
        const fields = omit(item, ["id", "userId"]);
        await tx.boardColumn.upsert({
          where: { id },
          create: { ...fields, id, userId },
          update: fields,
        });
      }
      const taskMap = new Map<string, string>();
      for (const item of backup.tasks ?? []) {
        const preferredId = target("task", item.id),
          sourceId = item.sourceId
            ? target(
                item.sourceKind === "applications" ? "application" : "contact",
                item.sourceId,
              )
            : null;
        const sourceKey =
          !item.completedAt && item.sourceKind && sourceId
            ? item.sourceKind + ":" + sourceId
            : null;
        const byId = await tx.task.findUnique({
          where: { id: preferredId },
          select: { id: true, userId: true },
        });
        if (byId && byId.userId !== userId)
          throw new Error("Datos de otra cuenta.");
        const bySource = sourceKey
          ? await tx.task.findFirst({
              where: { sourceKey, userId },
              select: { id: true },
            })
          : null;
        if (byId && bySource && byId.id !== bySource.id)
          throw new Error(
            "Hay un recordatorio nuevo que entra en conflicto con el backup. No se ha aplicado ningún cambio.",
          );
        const id = byId?.id ?? bySource?.id ?? preferredId;
        taskMap.set(item.id, id);
        const existing = await tx.task.findUnique({
          where: { id },
          select: { userId: true },
        });
        checkOwner(existing?.userId);
        const columnId = columnMap.get(item.columnId);
        if (!columnId) throw new Error("Columna de tarea no disponible.");
        const fields = {
          ...omit(item, ["id", "userId", "columnId", "sourceId", "links"]),
          columnId,
          sourceId,
          sourceKey,
        };
        const links = [];
        for (const l of item.links) {
          const kind = l.kind as EntityKind,
            recordId = target(
              {
                companies: "company",
                offers: "offer",
                applications: "application",
                contacts: "contact",
                networking: "networking",
              }[kind],
              l.recordId,
            );
          const label = await recordLabel(tx, userId, kind, recordId);
          if (!label) throw new Error("Enlace de tarea no disponible.");
          links.push({ kind, recordId, label });
        }
        await tx.task.upsert({
          where: { id },
          create: { ...fields, id, userId },
          update: fields,
        });
        await tx.taskLink.deleteMany({ where: { taskId: id } });
        if (links.length)
          await tx.taskLink.createMany({
            data: links.map((l) => ({ ...l, taskId: id })),
          });
      }
      for (const item of backup.taskCompletions ?? []) {
        const id = target("completion", item.id),
          existing = await tx.taskCompletion.findUnique({
            where: { id },
            select: { userId: true },
          });
        checkOwner(existing?.userId);
        const fields = {
          ...omit(item, ["id", "userId", "taskId", "taskIdentity", "sourceId"]),
          taskId: item.taskId ? (taskMap.get(item.taskId) ?? null) : null,
          companyIds: (item.companyIds ?? []).map((id) =>
            target("company", id),
          ),
          taskIdentity:
            taskMap.get(item.taskIdentity) ?? target("task", item.taskIdentity),
          sourceId: item.sourceId
            ? target(
                item.sourceKind === "applications" ? "application" : "contact",
                item.sourceId,
              )
            : null,
        };
        await tx.taskCompletion.upsert({
          where: { id },
          create: { ...fields, id, userId },
          update: fields,
        });
      }
      await ensureColumns(tx, userId);
      await assertAccountQuota(tx, userId);
      await tx.securityEvent.create({
        data: { userId, type: "backup_restored" },
      });
    },
    { isolationLevel: "Serializable", maxWait: 5000, timeout: 30000 },
  );
  return counts;
}
