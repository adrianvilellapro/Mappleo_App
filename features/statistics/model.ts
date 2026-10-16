import { day, madrid } from "@/lib/dates";
import { closedStatuses, sources, statuses } from "@/features/tracker/config";
import { technologyKey } from "@/features/tracker/technologies";

export const periods = {
  month: "Mes actual",
  week: "Semana actual",
  weeks: "Últimas 12 semanas",
  months: "Últimos 6 meses",
  year: "Últimos 12 meses",
  custom: "Rango personalizado",
};
export type StatsFilters = {
  period: string;
  from: string;
  to: string;
  group: "week" | "month";
  source: string;
  company: string;
};
export class StatsInputError extends Error {}
export function parseStatsFilters(
  params: Record<string, string | undefined>,
  now = new Date(),
): StatsFilters {
  const today = madrid(now).startOf("day");
  const period = params.period ?? "month";
  if (!Object.hasOwn(periods, period))
    throw new StatsInputError("Elige un periodo válido.");
  let start = today.startOf("month"),
    end = today;
  if (period === "week") start = today.startOf("week");
  if (period === "weeks") start = today.startOf("week").minus({ weeks: 11 });
  if (period === "months" || period === "year")
    start = today
      .startOf("month")
      .minus({ months: period === "months" ? 5 : 11 });
  if (period === "custom") {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(params.from ?? "") ||
      !/^\d{4}-\d{2}-\d{2}$/.test(params.to ?? "")
    )
      throw new StatsInputError("Indica las fechas del informe.");
    start = day(params.from!).startOf("day");
    end = day(params.to!).startOf("day");
  }
  if (
    !start.isValid ||
    !end.isValid ||
    start.year < 2000 ||
    end < start ||
    end > today ||
    end.diff(start, "days").days > 366
  )
    throw new StatsInputError(
      "Usa un rango de hasta 12 meses, sin fechas futuras.",
    );
  const source = params.source ?? "all",
    company = params.company ?? "all",
    group =
      params.group ??
      (period === "months" || period === "year" ? "month" : "week");
  if (source !== "all" && !Object.hasOwn(sources, source))
    throw new StatsInputError("Fuente no válida.");
  if (company.length > 100 || !["week", "month"].includes(group))
    throw new StatsInputError("Filtro no válido.");
  return {
    period,
    from: start.toISODate()!,
    to: end.toISODate()!,
    source,
    company,
    group: group as "week" | "month",
  };
}
export type StatsApplication = {
  id: string;
  status: string;
  appliedAt: Date;
  firstResponseAt: Date | null;
  nextAction: string;
  nextActionDueAt: Date | null;
  jobOffer: {
    technologies?: string[];
    title: string;
    source: string;
    companyId: string;
    company: { name: string };
  };
  events: { type: string; toStatus: string | null; happenedAt: Date }[];
};
const milestone = (
  a: StatsApplication,
  types: string[],
  states: string[],
  now: Date,
) =>
  states.includes(a.status) ||
  a.events.some(
    (e) =>
      e.happenedAt >= a.appliedAt &&
      e.happenedAt <= now &&
      (types.includes(e.type) || states.includes(e.toStatus ?? "")),
  );
const validResponse = (a: StatsApplication, now: Date) =>
  !!a.firstResponseAt &&
  a.firstResponseAt >= a.appliedAt &&
  a.firstResponseAt <= now;
export function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
export const rate = (count: number, total: number) =>
  total ? Math.round((count * 1000) / total) / 10 : null;
export type StatsExtras = {
  networking: { id: string; name: string; startsAt: Date }[];
  contacts: {
    id: string;
    name: string;
    createdAt: Date;
    lastContactAt: Date | null;
  }[];
  completions: {
    id: string;
    taskIdentity: string;
    title: string;
    completedAt: Date;
  }[];
};
export function buildStatistics(
  applications: StatsApplication[],
  filters: StatsFilters,
  now = new Date(),
  extras: StatsExtras = { networking: [], contacts: [], completions: [] },
) {
  const filtered = applications.filter(
    (a) =>
      a.appliedAt <= now &&
      (filters.source === "all" || a.jobOffer.source === filters.source) &&
      (filters.company === "all" || a.jobOffer.companyId === filters.company),
  );
  const dateOf = (date: Date) => madrid(date).toISODate()!;
  const inside = (date: Date) =>
    dateOf(date) >= filters.from && dateOf(date) <= filters.to;
  const cohort = filtered.filter((a) => inside(a.appliedAt));
  const responses = cohort.filter((a) => validResponse(a, now));
  const interviews = cohort.filter((a) =>
    milestone(a, ["INTERVIEW"], ["INTERVIEW", "FINAL_INTERVIEW"], now),
  );
  const offers = cohort.filter((a) =>
    milestone(a, ["OFFER_RECEIVED"], ["OFFER_RECEIVED"], now),
  );
  const accepted = cohort.filter((a) => milestone(a, [], ["ACCEPTED"], now));
  const rejected = cohort.filter((a) =>
    milestone(a, ["REJECTION_RECEIVED"], ["REJECTED"], now),
  );
  const durations = responses.map(
    (a) => (a.firstResponseAt!.getTime() - a.appliedAt.getTime()) / 86400000,
  );
  const days = day(filters.to).diff(day(filters.from), "days").days + 1;
  let previousFrom = day(filters.from).minus({ days }),
    previousTo = day(filters.from).minus({ days: 1 });
  if (filters.period === "month") {
    previousFrom = day(filters.from).minus({ months: 1 }).startOf("month");
    previousTo = previousFrom.plus({
      days: Math.min(days, previousFrom.daysInMonth!) - 1,
    });
  }
  const previous = filtered.filter(
    (a) =>
      dateOf(a.appliedAt) >= previousFrom.toISODate()! &&
      dateOf(a.appliedAt) <= previousTo.toISODate()!,
  ).length;
  const series: {
    key: string;
    label: string;
    sent: number;
    responses: number;
    interviews: number;
  }[] = [];
  for (
    let cursor = day(filters.from).startOf(filters.group);
    cursor <= day(filters.to);
    cursor = cursor.plus(
      filters.group === "week" ? { weeks: 1 } : { months: 1 },
    )
  ) {
    const key = cursor.toISODate()!;
    series.push({
      key,
      label: cursor.toFormat(filters.group === "week" ? "d LLL" : "LLL yy"),
      sent: 0,
      responses: 0,
      interviews: 0,
    });
  }
  const bucket = (date: Date) =>
    series.find(
      (b) => b.key === madrid(date).startOf(filters.group).toISODate(),
    );
  for (const a of filtered) {
    if (inside(a.appliedAt)) bucket(a.appliedAt)!.sent++;
    if (validResponse(a, now) && inside(a.firstResponseAt!))
      bucket(a.firstResponseAt!)!.responses++;
    const firstInterview = a.events
      .filter(
        (e) =>
          e.happenedAt >= a.appliedAt &&
          e.happenedAt <= now &&
          (e.type === "INTERVIEW" ||
            ["INTERVIEW", "FINAL_INTERVIEW"].includes(e.toStatus ?? "")),
      )
      .sort((a, b) => a.happenedAt.getTime() - b.happenedAt.getTime())[0];
    if (firstInterview && inside(firstInterview.happenedAt))
      bucket(firstInterview.happenedAt)!.interviews++;
  }
  const bySource = [...new Set(cohort.map((a) => a.jobOffer.source))]
    .map((source) => {
      const rows = cohort.filter((a) => a.jobOffer.source === source),
        responseRows = rows.filter((a) => validResponse(a, now));
      return {
        source,
        label: sources[source as keyof typeof sources] ?? source,
        sent: rows.length,
        responses: responseRows.length,
        interviews: rows.filter((a) => interviews.includes(a)).length,
        offers: rows.filter((a) => offers.includes(a)).length,
        rate: rate(responseRows.length, rows.length),
      };
    })
    .sort((a, b) => b.sent - a.sent || a.label.localeCompare(b.label, "es"));
  const current = filtered.filter((a) => !closedStatuses.includes(a.status));
  const stateCounts = Object.entries(statuses)
    .map(([status, label]) => ({
      status,
      label,
      count: filtered.filter((a) => a.status === status).length,
    }))
    .filter((s) => s.count);
  const events = extras.networking.filter(
    (n) => n.startsAt <= now && inside(n.startsAt),
  );
  const newContacts = extras.contacts.filter(
    (c) => c.createdAt <= now && inside(c.createdAt),
  );
  const contacted = extras.contacts.filter(
    (c) => c.lastContactAt && c.lastContactAt <= now && inside(c.lastContactAt),
  );
  const completed = [
    ...new Map(
      extras.completions
        .filter((c) => c.completedAt <= now && inside(c.completedAt))
        .sort((a, b) => a.completedAt.getTime() - b.completedAt.getTime())
        .map((c) => [c.taskIdentity, c]),
    ).values(),
  ];
  const activity = series.map((b) => ({
    ...b,
    sent: 0,
    responses: 0,
    interviews: 0,
  }));
  const activityBucket = (date: Date) =>
    activity.find(
      (b) => b.key === madrid(date).startOf(filters.group).toISODate(),
    );
  for (const e of events) activityBucket(e.startsAt)!.sent++;
  for (const c of newContacts) activityBucket(c.createdAt)!.responses++;
  for (const c of completed) activityBucket(c.completedAt)!.interviews++;
  const tags = new Map<string, { label: string; apps: StatsApplication[] }>();
  for (const a of cohort)
    for (const [key, label] of new Map(
      (a.jobOffer.technologies ?? []).map((t) => [technologyKey(t), t]),
    )) {
      const tag = tags.get(key) ?? { label, apps: [] };
      tag.apps.push(a);
      tags.set(key, tag);
    }
  const technologies = [...tags.values()]
    .map((t) => ({
      label: t.label,
      sent: t.apps.length,
      responses: t.apps.filter((a) => responses.includes(a)).length,
      interviews: t.apps.filter((a) => interviews.includes(a)).length,
      rate: rate(
        t.apps.filter((a) => responses.includes(a)).length,
        t.apps.length,
      ),
    }))
    .sort((a, b) => b.sent - a.sent || a.label.localeCompare(b.label, "es"));
  return {
    filters,
    generatedAt: now.toISOString(),
    sent: cohort.length,
    responses: responses.length,
    interviews: interviews.length,
    offers: offers.length,
    accepted: accepted.length,
    rejected: rejected.length,
    responseRate: rate(responses.length, cohort.length),
    interviewRate: rate(interviews.length, cohort.length),
    medianDays: median(durations),
    responseSample: responses.length,
    withoutResponseDate: cohort.length - responses.length,
    previous,
    previousFrom: previousFrom.toISODate()!,
    previousTo: previousTo.toISODate()!,
    series,
    bySource,
    stateCounts,
    extended: {
      events: events.length,
      newContacts: newContacts.length,
      contacted: contacted.length,
      completed: completed.length,
      series: activity,
      technologies,
      completionRows: completed.map((c) => ({
        id: c.id,
        title: c.title,
        date: c.completedAt.toISOString(),
      })),
      eventRows: events.map((n) => ({
        id: n.id,
        title: n.name,
        date: n.startsAt.toISOString(),
      })),
      contactRows: newContacts.map((c) => ({
        id: c.id,
        title: c.name,
        date: c.createdAt.toISOString(),
      })),
    },
    current: {
      active: current.length,
      interviews: current.filter((a) =>
        ["INTERVIEW", "FINAL_INTERVIEW"].includes(a.status),
      ).length,
      pending: current.filter((a) => a.nextAction).length,
      overdue: current.filter(
        (a) => a.nextAction && a.nextActionDueAt && a.nextActionDueAt < now,
      ).length,
    },
    rows: cohort
      .sort((a, b) => b.appliedAt.getTime() - a.appliedAt.getTime())
      .map((a) => ({
        id: a.id,
        title: a.jobOffer.title,
        company: a.jobOffer.company.name,
        source:
          sources[a.jobOffer.source as keyof typeof sources] ??
          a.jobOffer.source,
        status: statuses[a.status as keyof typeof statuses] ?? a.status,
        appliedAt: a.appliedAt.toISOString(),
        firstResponseAt: a.firstResponseAt?.toISOString() ?? null,
        response: responses.includes(a),
        interview: interviews.includes(a),
        offer: offers.includes(a),
      })),
  };
}
export type Statistics = ReturnType<typeof buildStatistics>;
export const prettyDate = (iso: string) => day(iso).toFormat("dd/LL/yyyy");
