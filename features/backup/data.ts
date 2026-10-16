import "server-only";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";

export async function createBackup(
  userId: string,
  client: Prisma.TransactionClient = db,
) {
  const db = client;
  const [
    companies,
    offers,
    applications,
    contacts,
    networking,
    technologyTags,
    boardColumns,
    tasks,
    taskCompletions,
  ] = await Promise.all([
    // Backups store foreign IDs, not repeated full companies/offers. Preserve
    // the complete owner data and process history without duplicate relations.
    db.company.findMany({ where: { userId }, orderBy: { updatedAt: "desc" } }),
    db.jobOffer.findMany({ where: { userId }, orderBy: { updatedAt: "desc" } }),
    db.application.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      include: { events: { orderBy: { happenedAt: "desc" } } },
    }),
    db.contact.findMany({ where: { userId }, orderBy: { updatedAt: "desc" } }),
    db.networkingEvent.findMany({
      where: { userId },
      orderBy: { startsAt: "asc" },
      include: {
        companies: { where: { userId }, select: { id: true, name: true } },
        contacts: { where: { userId }, select: { id: true, name: true } },
      },
    }),
    db.technologyTag.findMany({
      where: { userId },
      select: { name: true },
      orderBy: { name: "asc" },
    }),
    db.boardColumn.findMany({
      where: { userId },
      orderBy: { position: "asc" },
    }),
    db.task.findMany({
      where: { userId },
      include: { links: true },
      orderBy: { position: "asc" },
    }),
    db.taskCompletion.findMany({
      where: { userId },
      orderBy: { completedAt: "asc" },
    }),
  ]);
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    ownerId: userId,
    companies,
    offers,
    applications,
    contacts,
    networking,
    technologyTags: technologyTags.map((tag) => tag.name),
    boardColumns,
    tasks,
    taskCompletions,
  };
}
