import "server-only";
import { db } from "@/lib/db";
import { buildStatistics, type StatsFilters } from "./model";
import { day } from "@/lib/dates";
export async function statisticsData(userId: string, filters: StatsFilters) {
  const from = day(filters.from).startOf("day").toJSDate();
  const to = day(filters.to).plus({ days: 1 }).startOf("day").toJSDate();
  const range = { gte: from, lt: to };
  const applications = await db.application.findMany({
    // Keep all matching applications: the report's current snapshot and its
    // previous-period comparison are intentionally independent of the date range.
    where: {
      userId,
      appliedAt: { lte: new Date() },
      jobOffer: {
        userId,
        ...(filters.source === "all" ? {} : { source: filters.source }),
        ...(filters.company === "all" ? {} : { companyId: filters.company }),
      },
    },
    select: {
      id: true,
      status: true,
      appliedAt: true,
      firstResponseAt: true,
      nextAction: true,
      nextActionDueAt: true,
      jobOffer: {
        select: {
          title: true,
          source: true,
          technologies: true,
          companyId: true,
          company: { select: { name: true } },
        },
      },
      events: { select: { type: true, toStatus: true, happenedAt: true } },
    },
  });
  const [networking, contacts, completions] = await Promise.all([
    db.networkingEvent.findMany({
      where: {
        userId,
        startsAt: range,
        ...(filters.company === "all"
          ? {}
          : { companies: { some: { id: filters.company, userId } } }),
      },
      select: { id: true, name: true, startsAt: true },
    }),
    db.contact.findMany({
      where: {
        userId,
        OR: [{ createdAt: range }, { lastContactAt: range }],
        ...(filters.company === "all" ? {} : { companyId: filters.company }),
      },
      select: { id: true, name: true, createdAt: true, lastContactAt: true },
    }),
    db.taskCompletion.findMany({
      where: {
        userId,
        completedAt: range,
        ...(filters.company === "all"
          ? {}
          : { companyIds: { has: filters.company } }),
        ...(filters.source === "all"
          ? {}
          : { sources: { has: filters.source } }),
      },
      select: {
        id: true,
        taskIdentity: true,
        title: true,
        completedAt: true,
        companyIds: true,
        sources: true,
      },
    }),
  ]);
  const filteredCompletions = completions.filter((c) => {
    return (
      (filters.company === "all" || c.companyIds.includes(filters.company)) &&
      (filters.source === "all" || c.sources.includes(filters.source))
    );
  });
  const report = buildStatistics(applications, filters, new Date(), {
    networking,
    contacts,
    completions: filteredCompletions,
  });
  const companies = await db.company.findMany({
    where: { userId },
    select: { id: true, name: true },
  });
  return {
    report,
    companies: companies.sort((a, b) => a.name.localeCompare(b.name, "es")),
  };
}
