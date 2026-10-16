import type { Workspace } from "../../../packages/domain/workspace";
import {
  entities,
  isEntityKind,
  type EntityKind,
} from "../../../features/tracker/config";
import {
  rowTitle,
  type RecordRow,
  type SelectOptions,
} from "../../../features/tracker/types";
import type { LinkOption } from "../../../features/tasks/types";
import type { DashboardData } from "../../../features/dashboard/view";
import type { CalendarItem } from "../../../features/calendar/data";
import { dashboardMetrics } from "../../../features/dashboard/metrics";
import { calendarRange, madrid } from "../../../lib/dates";
import {
  buildStatistics,
  parseStatsFilters,
  type StatsApplication,
} from "../../../features/statistics/model";

export function recordRows(data: Workspace, kind: string): RecordRow[] {
  if (!isEntityKind(kind)) return [];
  const company = (id: string) => {
    const company = data.companies.find((c) => c.id === id)!;
    return { ...company, faviconUrl: company.faviconUrl ?? "" };
  };
  const offer = (id: string) => {
    const o = data.offers.find((o) => o.id === id)!;
    return { ...o, company: company(o.companyId) };
  };
  switch (kind) {
    case "companies":
      return data.companies.map((c) => ({
        ...c,
        offers: data.offers.filter((o) => o.companyId === c.id),
        contacts: data.contacts.filter((p) => p.companyId === c.id),
      }));
    case "offers":
      return data.offers.map((o) => ({
        ...o,
        company: company(o.companyId),
        applications: data.applications
          .filter((a) => a.jobOfferId === o.id)
          .sort((a, b) => b.appliedAt.localeCompare(a.appliedAt)),
      }));
    case "applications":
      return data.applications.map((a) => ({
        ...a,
        jobOffer: offer(a.jobOfferId),
        events: [...a.events].sort((a, b) =>
          b.happenedAt.localeCompare(a.happenedAt),
        ),
      }));
    case "contacts":
      return data.contacts.map((c) => ({
        ...c,
        company: c.companyId ? company(c.companyId) : null,
      }));
    case "networking":
      return data.networking.map((n) => ({
        ...n,
        companies: n.companies.map((c) => company(c.id)),
        contacts: n.contacts.map((c) =>
          data.contacts.find((p) => p.id === c.id)!,
        ),
      }));
  }
}
export function recordOptions(data: Workspace): SelectOptions {
  return {
    companies: [...data.companies]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((c) => ({ id: c.id, label: c.name })),
    offers: [...data.offers]
      .sort((a, b) => b.savedAt.localeCompare(a.savedAt))
      .map((o) => ({
        id: o.id,
        label:
          o.title +
          " · " +
          data.companies.find((c) => c.id === o.companyId)!.name,
      })),
    contacts: [...data.contacts]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((c) => ({ id: c.id, label: c.name })),
    technologies: data.technologyTags ?? [],
  };
}
export function taskLinkOptions(data: Workspace): LinkOption[] {
  return (Object.keys(entities) as EntityKind[]).flatMap((kind) =>
    recordRows(data, kind).map((r) => ({
      kind,
      id: r.id,
      label:
        rowTitle(r) +
        (r.company
          ? " · " + r.company.name
          : r.jobOffer
            ? " · " + r.jobOffer.company.name
            : ""),
    })),
  );
}

export function demoCalendar(data: Workspace, month: string): CalendarItem[] {
  const { start, end } = calendarRange(month),
    items: CalendarItem[] = [];
  const offers = new Map(data.offers.map((o) => [o.id, o]));
  const add = (
    category: string,
    id: string,
    title: string,
    value: string | null | undefined,
    suffix: string,
  ) => {
    if (!value) return;
    const date = new Date(value);
    if (date < start.toJSDate() || date >= end.toJSDate()) return;
    items.push({
      id: `${category}:${id}:${suffix}`,
      date: madrid(date).toISODate()!,
      timestamp: date.toISOString(),
      category,
      title,
      href:
        category === "tasks" ? "/kanban?task=" + id : "/" + category + "/" + id,
    });
  };
  data.companies.forEach((c) =>
    add(
      "companies",
      c.id,
      "Empresa guardada · " + c.name,
      c.createdAt,
      "saved",
    ),
  );
  data.offers.forEach((o) => {
    add("offers", o.id, "Oferta guardada · " + o.title, o.savedAt, "saved");
    add("offers", o.id, "Publicada · " + o.title, o.publishedAt, "published");
    add("offers", o.id, "Plazo · " + o.title, o.deadlineAt, "deadline");
  });
  data.applications.forEach((a) => {
    const title = offers.get(a.jobOfferId)!.title;
    add("applications", a.id, "Enviada · " + title, a.appliedAt, "sent");
    add(
      "applications",
      a.id,
      "Primera respuesta · " + title,
      a.firstResponseAt,
      "response",
    );
    add(
      "applications",
      a.id,
      "Proceso cerrado · " + title,
      a.closedAt,
      "closed",
    );
    a.events
      .filter((e) => e.type !== "APPLICATION_SENT")
      .forEach((e) =>
        add("applications", a.id, e.title, e.happenedAt, "history-" + e.id),
      );
  });
  data.contacts.forEach((c) =>
    add(
      "contacts",
      c.id,
      "Último contacto · " + c.name,
      c.lastContactAt,
      "last",
    ),
  );
  data.networking.forEach((n) => {
    let cursor = madrid(new Date(n.startsAt)).startOf("day");
    const last = madrid(new Date(n.endsAt ?? n.startsAt)).startOf("day");
    if (cursor < start) cursor = start;
    while (cursor <= last && cursor < end) {
      add(
        "networking",
        n.id,
        n.name,
        cursor.hasSame(madrid(new Date(n.startsAt)), "day")
          ? n.startsAt
          : cursor.toISO()!,
        cursor.toISODate()!,
      );
      cursor = cursor.plus({ days: 1 });
    }
  });
  (data.tasks ?? [])
    .filter((t) => !t.completedAt)
    .forEach((t) => add("tasks", t.id, t.title, t.dueAt, "due"));
  (data.taskCompletions ?? []).forEach((t) =>
    add(
      "tasks",
      t.taskIdentity,
      "Completada · " + t.title,
      t.completedAt,
      "complete-" + t.id,
    ),
  );
  return items.sort(
    (a, b) =>
      a.timestamp.localeCompare(b.timestamp) || a.title.localeCompare(b.title),
  );
}
export function demoDashboard(
  data: Workspace,
  now = new Date(),
): DashboardData {
  const applications = recordRows(data, "applications").sort((a, b) =>
    String(b.updatedAt).localeCompare(String(a.updatedAt)),
  );
  const activity = data.applications
    .flatMap((a) =>
      a.events.map((e) => ({
        ...e,
        applicationId: a.id,
        happenedAt: new Date(e.happenedAt),
        application: {
          jobOffer: {
            company: {
              name: data.companies.find(
                (c) =>
                  c.id ===
                  data.offers.find((o) => o.id === a.jobOfferId)!.companyId,
              )!.name,
            },
          },
        },
      })),
    )
    .sort((a, b) => b.happenedAt.getTime() - a.happenedAt.getTime())
    .slice(0, 6);
  return {
    now,
    metrics: dashboardMetrics(data.companies, data.offers, data.applications),
    applications: applications as unknown as DashboardData["applications"],
    events: data.networking
      .filter((n) => n.startsAt >= now.toISOString())
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
      .slice(0, 4)
      .map((n) => ({ ...n, startsAt: new Date(n.startsAt) })),
    tasks: (data.tasks ?? [])
      .filter((t) => !t.completedAt)
      .map((t) => ({ ...t, dueAt: t.dueAt ? new Date(t.dueAt) : null })),
    activity,
    calendar: demoCalendar(data, madrid(now).toFormat("yyyy-MM")),
  };
}
export function demoStatistics(
  data: Workspace,
  params: Record<string, string | undefined>,
  now = new Date(),
) {
  const filters = parseStatsFilters(params, now);
  const applications: StatsApplication[] = data.applications.map((a) => {
    const offer = data.offers.find((o) => o.id === a.jobOfferId)!;
    return {
      ...a,
      appliedAt: new Date(a.appliedAt),
      firstResponseAt: a.firstResponseAt ? new Date(a.firstResponseAt) : null,
      nextActionDueAt: a.nextActionDueAt ? new Date(a.nextActionDueAt) : null,
      jobOffer: {
        ...offer,
        company: {
          name: data.companies.find((c) => c.id === offer.companyId)!.name,
        },
      },
      events: a.events.map((e) => ({
        ...e,
        happenedAt: new Date(e.happenedAt),
      })),
    };
  });
  const inside = (s: string | null | undefined) =>
    !!s &&
    madrid(new Date(s)).toISODate()! >= filters.from &&
    madrid(new Date(s)).toISODate()! <= filters.to;
  return buildStatistics(applications, filters, now, {
    networking: data.networking
      .filter(
        (n) =>
          inside(n.startsAt) &&
          (filters.company === "all" ||
            n.companies.some((c) => c.id === filters.company)),
      )
      .map((n) => ({ ...n, startsAt: new Date(n.startsAt) })),
    contacts: data.contacts
      .filter(
        (c) =>
          (inside(c.createdAt) || inside(c.lastContactAt)) &&
          (filters.company === "all" || c.companyId === filters.company),
      )
      .map((c) => ({
        ...c,
        createdAt: new Date(c.createdAt),
        lastContactAt: c.lastContactAt ? new Date(c.lastContactAt) : null,
      })),
    completions: (data.taskCompletions ?? [])
      .filter(
        (c) =>
          inside(c.completedAt) &&
          (filters.company === "all" ||
            c.companyIds?.includes(filters.company)) &&
          (filters.source === "all" || c.sources?.includes(filters.source)),
      )
      .map((c) => ({ ...c, completedAt: new Date(c.completedAt) })),
  });
}
