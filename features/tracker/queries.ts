import "server-only";
import { db } from "@/lib/db";
import type { EntityKind } from "./config";
export async function listRecords(
  userId: string,
  kind: EntityKind,
  id?: string,
) {
  const where = { userId, ...(id ? { id } : {}) },
    orderBy = { updatedAt: "desc" as const };
  switch (kind) {
    case "companies":
      return db.company.findMany({
        where,
        orderBy,
        include: {
          offers: { where: { userId }, select: { id: true, title: true } },
          contacts: { where: { userId }, select: { id: true, name: true } },
        },
      });
    case "offers":
      return db.jobOffer.findMany({
        where,
        orderBy,
        include: {
          company: true,
          applications: {
            where: { userId },
            select: { id: true, status: true, appliedAt: true },
            orderBy: { appliedAt: "desc" },
          },
        },
      });
    case "applications":
      return db.application.findMany({
        where,
        orderBy,
        include: {
          jobOffer: { include: { company: true } },
          events: { orderBy: { happenedAt: "desc" } },
        },
      });
    case "contacts":
      return db.contact.findMany({
        where,
        orderBy,
        include: { company: true },
      });
    case "networking":
      return db.networkingEvent.findMany({
        where,
        orderBy: { startsAt: "asc" },
        include: {
          companies: { where: { userId } },
          contacts: { where: { userId } },
        },
      });
  }
}
export async function getOptions(userId: string, kind?: EntityKind) {
  const [companies, offers, contacts, technologies] = await Promise.all([
    !kind || ["offers", "contacts", "networking"].includes(kind)
      ? db.company.findMany({
          where: { userId },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    !kind || kind === "applications"
      ? db.jobOffer.findMany({
          where: { userId },
          select: {
            id: true,
            title: true,
            company: { select: { name: true } },
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        })
      : Promise.resolve([]),
    !kind || kind === "networking"
      ? db.contact.findMany({
          where: { userId },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    !kind || kind === "offers"
      ? db.technologyTag.findMany({
          where: { userId },
          select: { name: true },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
  ]);
  return {
    companies: companies
      .sort((a, b) => a.name.localeCompare(b.name, "es"))
      .map((c) => ({ id: c.id, label: c.name })),
    offers: offers.map((o) => ({
      id: o.id,
      label: o.company.name + " · " + o.title,
    })),
    contacts: contacts
      .sort((a, b) => a.name.localeCompare(b.name, "es"))
      .map((c) => ({ id: c.id, label: c.name })),
    technologies: technologies.map((t) => t.name),
  };
}
export type Options = Awaited<ReturnType<typeof getOptions>>;
