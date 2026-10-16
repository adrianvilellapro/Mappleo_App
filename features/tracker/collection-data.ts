import "server-only";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { closedStatuses, type EntityKind } from "./config";
import { searchRecord } from "./search";
import { rowTitle, type RecordRow } from "./types";
import {
  collectionFilterSchema,
  collectionPageSize,
  type CollectionFilters,
  type CollectionSummary,
  type CollectionPage,
} from "./collection";
const identity = { id: true, createdAt: true, updatedAt: true } as const;
const company = {
  id: true,
  name: true,
  domain: true,
  websiteUrl: true,
  faviconUrl: true,
} as const;
export function collectionWhere(
  userId: string,
  kind: EntityKind,
  f: CollectionFilters,
): Record<string, unknown> {
  const where: Record<string, unknown> = { userId };
  if (["companies", "offers"].includes(kind) && f.filter !== "all")
    where.archivedAt = f.filter === "active" ? null : { not: null };
  if (kind === "applications") {
    if (f.status) where.status = f.status;
    else if (f.scope === "active") where.status = { notIn: closedStatuses };
    else if (f.scope === "interviews")
      where.status = { in: ["INTERVIEW", "FINAL_INTERVIEW"] };
  }
  if (kind === "offers" && f.applications !== "all")
    where.applications =
      f.applications === "sent" ? { some: { userId } } : { none: { userId } };
  return where;
}
// Only list/search fields, never whole related companies or process histories.
export async function collectionRows(
  userId: string,
  kind: EntityKind,
  f: CollectionFilters,
  search = false,
  limited = true,
) {
  const where = collectionWhere(userId, kind, f);
  const page: { skip?: number; take?: number } = limited
    ? { skip: f.offset, take: collectionPageSize + 1 }
    : {};
  const orderBy =
    f.sort === "interest" && ["companies", "offers"].includes(kind)
      ? { interestRating: "desc" as const }
      : kind === "networking"
        ? { startsAt: "asc" as const }
        : { updatedAt: "desc" as const };
  const query = { ...page, orderBy: [orderBy, { id: "asc" as const }] };
  let rows: unknown[];
  switch (kind) {
    case "companies":
      rows = await db.company.findMany({
        where: where as Prisma.CompanyWhereInput,
        ...query,
        select: {
          ...identity,
          name: true,
          location: true,
          workMode: true,
          interestRating: true,
          archivedAt: true,
          websiteUrl: true,
          faviconUrl: true,
          ...(search ? { notes: true, sector: true, tags: true } : {}),
        },
      });
      break;
    case "offers":
      rows = await db.jobOffer.findMany({
        where: where as Prisma.JobOfferWhereInput,
        ...query,
        select: {
          ...identity,
          title: true,
          location: true,
          workMode: true,
          interestRating: true,
          archivedAt: true,
          company: { select: company },
          applications: {
            where: { userId },
            select: { id: true, status: true, appliedAt: true },
            take: 1,
          },
          ...(search
            ? {
                notes: true,
                description: true,
                source: true,
                technologies: true,
              }
            : {}),
        },
      });
      break;
    case "applications":
      rows = await db.application.findMany({
        where: where as Prisma.ApplicationWhereInput,
        ...query,
        select: {
          ...identity,
          status: true,
          appliedAt: true,
          jobOffer: {
            select: { id: true, title: true, company: { select: company } },
          },
          ...(search ? { notes: true, cvVersion: true } : {}),
        },
      });
      break;
    case "contacts":
      rows = await db.contact.findMany({
        where: where as Prisma.ContactWhereInput,
        ...query,
        select: {
          ...identity,
          name: true,
          role: true,
          lastContactAt: true,
          company: { select: company },
          ...(search ? { notes: true, email: true, phone: true } : {}),
        },
      });
      break;
    case "networking":
      rows = await db.networkingEvent.findMany({
        where: where as Prisma.NetworkingEventWhereInput,
        ...query,
        select: {
          ...identity,
          name: true,
          location: true,
          type: true,
          startsAt: true,
          companies: { where: { userId }, select: { id: true, name: true } },
          contacts: { where: { userId }, select: { id: true, name: true } },
          ...(search ? { notes: true } : {}),
        },
      });
      break;
  }
  return JSON.parse(JSON.stringify(rows)) as RecordRow[];
}
export async function collectionSummary(
  userId: string,
  kind: EntityKind,
): Promise<CollectionSummary> {
  switch (kind) {
    case "companies": {
      const [total, active] = await Promise.all([
        db.company.count({ where: { userId } }),
        db.company.count({ where: { userId, archivedAt: null } }),
      ]);
      return { total, active, archived: total - active, statuses: {} };
    }
    case "offers": {
      const [total, active] = await Promise.all([
        db.jobOffer.count({ where: { userId } }),
        db.jobOffer.count({ where: { userId, archivedAt: null } }),
      ]);
      return { total, active, archived: total - active, statuses: {} };
    }
    case "applications": {
      const groups = await db.application.groupBy({
        by: ["status"],
        where: { userId },
        _count: { _all: true },
      });
      const total = groups.reduce((n, g) => n + g._count._all, 0);
      return {
        total,
        active: total,
        archived: 0,
        statuses: Object.fromEntries(
          groups.map((g) => [g.status, g._count._all]),
        ),
      };
    }
    case "contacts": {
      const total = await db.contact.count({ where: { userId } });
      return { total, active: total, archived: 0, statuses: {} };
    }
    case "networking": {
      const total = await db.networkingEvent.count({ where: { userId } });
      return { total, active: total, archived: 0, statuses: {} };
    }
  }
}
export function listOnly(row: RecordRow): RecordRow {
  const result = { ...row };
  for (const field of [
    "notes",
    "description",
    "email",
    "phone",
    "cvVersion",
    "sector",
    "tags",
    "technologies",
    "source",
  ])
    delete result[field];
  return result;
}
export async function collectionPage(
  userId: string,
  kind: EntityKind,
  input: unknown = {},
): Promise<CollectionPage> {
  const f = collectionFilterSchema.parse(input);
  const scan = Boolean(f.q) || f.sort === "name";
  const [raw, summary] = await Promise.all([
    collectionRows(userId, kind, f, Boolean(f.q), !scan),
    collectionSummary(userId, kind),
  ]);
  let rows = raw;
  if (f.q) rows = rows.filter((row) => searchRecord(kind, row, f.q));
  if (f.sort === "name")
    rows.sort((a, b) => rowTitle(a).localeCompare(rowTitle(b), "es"));
  const page = scan
    ? rows.slice(f.offset, f.offset + collectionPageSize + 1)
    : rows;
  let matchedTotal = scan ? rows.length : summary.active;
  if (!scan) {
    if (f.filter === "archived") matchedTotal = summary.archived;
    else if (f.filter === "all") matchedTotal = summary.total;
    if (kind === "applications")
      matchedTotal = Object.entries(summary.statuses).reduce(
        (total, [status, count]) => {
          const matches = f.status
            ? status === f.status
            : f.scope === "active"
              ? !closedStatuses.includes(status)
              : f.scope === "interviews"
                ? ["INTERVIEW", "FINAL_INTERVIEW"].includes(status)
                : true;
          return total + (matches ? count : 0);
        },
        0,
      );
    if (kind === "offers" && f.applications !== "all")
      matchedTotal = await db.jobOffer.count({
        where: collectionWhere(userId, kind, f) as Prisma.JobOfferWhereInput,
      });
  }
  return {
    records: page.slice(0, collectionPageSize).map(listOnly),
    summary,
    hasMore: page.length > collectionPageSize,
    offset: f.offset,
    filters: f,
    matchedTotal,
  };
}
