import "server-only";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { z } from "zod";
import { discoverCompanyIcon } from "@/lib/company-icons";
import { assertAccountQuota } from "@/lib/security/quota";
import {
  companySchema,
  offerSchema,
  applicationSchema,
  contactSchema,
  networkingSchema,
  corporateDomain,
  activitySchema,
  nextStepSchema,
} from "./schemas";
import { type EntityKind, closedStatuses, statuses } from "./config";
import { uniqueTechnologies } from "./technologies";
import {
  completeTask,
  unlinkRecord,
  TaskError,
} from "@/features/tasks/service";
export class TrackerError extends Error {}
function assertOwned(value: unknown) {
  if (!value)
    throw new TrackerError("No se encuentra el registro o no tienes acceso.");
}
export async function saveRecord(
  userId: string,
  kind: EntityKind,
  id: string | undefined,
  input: unknown,
) {
  const companyData = kind === "companies" ? companySchema.parse(input) : null;
  const existingCompany =
    companyData && id
      ? await db.company.findFirst({
          where: { id, userId },
          select: { id: true, websiteUrl: true, faviconUrl: true },
        })
      : null;
  if (companyData && id)
    assertOwned(
      await db.company.findFirst({
        where: { id, userId },
        select: { id: true },
      }),
    );
  const discoveredIcon =
    companyData &&
    (!existingCompany ||
      existingCompany.websiteUrl !== companyData.websiteUrl ||
      !existingCompany.faviconUrl)
      ? await discoverCompanyIcon(companyData.websiteUrl)
      : "";
  return db.$transaction(
    async (tx) => {
      const version = z
        .object({ expectedUpdatedAt: z.iso.datetime().optional() })
        .parse(input).expectedUpdatedAt;
      if (id && version) {
        const where = { id, userId, updatedAt: new Date(version) },
          select = { id: true };
        const current =
          kind === "companies"
            ? await tx.company.findFirst({ where, select })
            : kind === "offers"
              ? await tx.jobOffer.findFirst({ where, select })
              : kind === "applications"
                ? await tx.application.findFirst({ where, select })
                : kind === "contacts"
                  ? await tx.contact.findFirst({ where, select })
                  : await tx.networkingEvent.findFirst({ where, select });
        if (!current)
          throw new TrackerError(
            "El registro ha cambiado en otra ventana. Actualiza antes de guardar.",
          );
      }
      const result = await (async () => {
        const ownCompany = async (companyId: string) =>
          assertOwned(
            await tx.company.findFirst({ where: { id: companyId, userId } }),
          );
        switch (kind) {
          case "companies": {
            const data = companyData!;
            const existing = id
              ? await tx.company.findFirst({ where: { id, userId } })
              : null;
            if (id) assertOwned(existing);
            const values = {
              ...data,
              domain: corporateDomain(data.websiteUrl),
              faviconUrl:
                discoveredIcon ||
                (existing?.websiteUrl === data.websiteUrl
                  ? existing.faviconUrl
                  : ""),
            };
            if (id) {
              return tx.company.update({ where: { id, userId }, data: values });
            }
            return tx.company.create({ data: { ...values, userId } });
          }
          case "offers": {
            const data = offerSchema.parse(input);
            await ownCompany(data.companyId);
            const requested = uniqueTechnologies(data.technologies);
            if (requested.length) {
              await tx.technologyTag.createMany({
                data: requested.map((technology) => ({
                  ...technology,
                  userId,
                })),
                skipDuplicates: true,
              });
            }
            const canonical = requested.length
              ? await tx.technologyTag.findMany({
                  where: { userId, key: { in: requested.map((t) => t.key) } },
                  select: { key: true, name: true },
                })
              : [];
            const names = new Map(canonical.map((t) => [t.key, t.name]));
            const values = {
              ...data,
              technologies: requested.map((t) => names.get(t.key) ?? t.name),
            };
            if (id) {
              assertOwned(
                await tx.jobOffer.findFirst({ where: { id, userId } }),
              );
              return tx.jobOffer.update({
                where: { id, userId },
                data: values,
              });
            }
            return tx.jobOffer.create({ data: { ...values, userId } });
          }
          case "applications": {
            const data = applicationSchema.parse(input);
            assertOwned(
              await tx.jobOffer.findFirst({
                where: { id: data.jobOfferId, userId },
              }),
            );
            const old = id
              ? await tx.application.findFirst({ where: { id, userId } })
              : null;
            if (id) assertOwned(old);
            if (old && old.jobOfferId !== data.jobOfferId)
              throw new TrackerError(
                "La oferta de una candidatura existente no puede cambiarse.",
              );
            const closedAt = closedStatuses.includes(data.status)
              ? (old?.closedAt ?? new Date())
              : null;
            const record = id
              ? await tx.application.update({
                  where: { id, userId },
                  data: { ...data, closedAt },
                })
              : await tx.application.create({
                  data: { ...data, userId, closedAt },
                });
            if (!old || old.status !== data.status)
              await tx.applicationEvent.create({
                data: {
                  applicationId: record.id,
                  type: old ? "STATUS_CHANGED" : "APPLICATION_SENT",
                  title: old
                    ? "Estado: " + statuses[data.status]
                    : "Candidatura registrada",
                  fromStatus: old?.status,
                  toStatus: data.status,
                  happenedAt: old ? new Date() : data.appliedAt,
                },
              });
            return record;
          }
          case "contacts": {
            const data = contactSchema.parse(input);
            if (data.companyId) await ownCompany(data.companyId);
            if (id) {
              assertOwned(
                await tx.contact.findFirst({ where: { id, userId } }),
              );
              const record = await tx.contact.update({
                where: { id, userId },
                data,
              });
              return record;
            }
            const record = await tx.contact.create({
              data: { ...data, userId },
            });
            return record;
          }
          case "networking": {
            const { companyIds, contactIds, ...data } =
              networkingSchema.parse(input);
            const cids = [...new Set(companyIds)],
              pids = [...new Set(contactIds)];
            if (
              (await tx.company.count({
                where: { id: { in: cids }, userId },
              })) !== cids.length ||
              (await tx.contact.count({
                where: { id: { in: pids }, userId },
              })) !== pids.length
            )
              throw new TrackerError("Alguna relación no está disponible.");
            const companies = cids.map((id) => ({ id })),
              contacts = pids.map((id) => ({ id }));
            if (id) {
              assertOwned(
                await tx.networkingEvent.findFirst({ where: { id, userId } }),
              );
              return tx.networkingEvent.update({
                where: { id, userId },
                data: {
                  ...data,
                  companies: { set: companies },
                  contacts: { set: contacts },
                },
              });
            }
            return tx.networkingEvent.create({
              data: {
                ...data,
                userId,
                companies: { connect: companies },
                contacts: { connect: contacts },
              },
            });
          }
        }
      })();
      await assertAccountQuota(tx, userId);
      return result;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}
export async function removeRecord(
  userId: string,
  kind: EntityKind,
  id: string,
) {
  return db.$transaction(async (tx) => {
    await unlinkRecord(tx, userId, kind, id);
    const where = { id, userId };
    switch (kind) {
      case "companies":
        return tx.company.delete({ where });
      case "offers":
        return tx.jobOffer.delete({ where });
      case "applications":
        return tx.application.delete({ where });
      case "contacts":
        return tx.contact.delete({ where });
      case "networking":
        return tx.networkingEvent.delete({ where });
    }
  });
}
export async function archiveRecord(
  userId: string,
  kind: EntityKind,
  id: string,
  archived: boolean,
) {
  const data = { archivedAt: archived ? new Date() : null },
    where = { id, userId };
  if (kind === "companies") return db.company.update({ where, data });
  if (kind === "offers") return db.jobOffer.update({ where, data });
  throw new TrackerError("Este registro no se puede archivar.");
}
export async function addActivity(userId: string, input: unknown) {
  const data = activitySchema.parse(input);
  assertOwned(
    await db.application.findFirst({
      where: { id: data.applicationId, userId },
    }),
  );
  return db.$transaction(
    async (tx) => {
      const event = await tx.applicationEvent.create({ data });
      await assertAccountQuota(tx, userId);
      return event;
    },
    { isolationLevel: "Serializable" },
  );
}
export async function removeActivity(userId: string, eventId: string) {
  const deleted = await db.applicationEvent.deleteMany({
    where: { id: eventId, application: { userId } },
  });
  if (!deleted.count)
    throw new TrackerError("La entrada ya no existe o no tienes acceso.");
}

export async function completeNextStep(userId: string, input: unknown) {
  const { kind, id, title, dueAt } = nextStepSchema.parse(input);
  if (kind === "tasks") {
    await completeTask(userId, { id, title, dueAt });
    return { kind, id };
  }
  const task = await db.task.findFirst({
    where: { userId, sourceKey: kind + ":" + id, completedAt: null },
  });
  if (!task)
    throw new TaskError(
      "El paso ha cambiado o ya está completado. Actualiza la página.",
    );
  await completeTask(userId, { id: task.id, title, dueAt });
  return { kind, id };
}
