import "server-only";
import { db } from "@/lib/db";
import { calendarRange, madrid } from "@/lib/dates";
export type CalendarItem = {
  id: string;
  date: string;
  timestamp: string;
  category: string;
  title: string;
  href: string;
};
export const calendarCategories = {
  networking: "Networking",
  applications: "Candidaturas",
  offers: "Ofertas",
  contacts: "Contactos",
  companies: "Empresas",
  tasks: "Tareas",
};
export async function calendarItems(
  userId: string,
  month: string,
): Promise<CalendarItem[]> {
  const { start, end } = calendarRange(month);
  const range = { gte: start.toJSDate(), lt: end.toJSDate() };
  const [companies, offers, applications, contacts, networking, history] =
    await Promise.all([
      db.company.findMany({
        where: { userId, createdAt: range },
        select: { id: true, name: true, createdAt: true },
      }),
      db.jobOffer.findMany({
        where: {
          userId,
          OR: [
            { savedAt: range },
            { publishedAt: range },
            { deadlineAt: range },
          ],
        },
        select: {
          id: true,
          title: true,
          savedAt: true,
          publishedAt: true,
          deadlineAt: true,
        },
      }),
      db.application.findMany({
        where: {
          userId,
          OR: [
            { appliedAt: range },
            { firstResponseAt: range },
            { closedAt: range },
          ],
        },
        select: {
          id: true,
          appliedAt: true,
          firstResponseAt: true,
          closedAt: true,
          jobOffer: { select: { title: true } },
        },
      }),
      db.contact.findMany({
        where: {
          userId,
          lastContactAt: range,
        },
        select: { id: true, name: true, lastContactAt: true },
      }),
      db.networkingEvent.findMany({
        where: {
          userId,
          startsAt: { lt: end.toJSDate() },
          OR: [{ endsAt: { gte: start.toJSDate() } }, { startsAt: range }],
        },
        select: { id: true, name: true, startsAt: true, endsAt: true },
      }),
      db.applicationEvent.findMany({
        where: {
          application: { userId },
          happenedAt: range,
          type: { not: "APPLICATION_SENT" },
        },
        select: {
          id: true,
          applicationId: true,
          title: true,
          happenedAt: true,
        },
      }),
    ]);
  const items: CalendarItem[] = [];
  const add = (
    category: string,
    id: string,
    title: string,
    date: Date | null,
    suffix: string,
  ) => {
    if (!date || date < start.toJSDate() || date >= end.toJSDate()) return;
    items.push({
      id: category + ":" + id + ":" + suffix,
      date: madrid(date).toISODate()!,
      timestamp: date.toISOString(),
      category,
      title,
      href:
        category === "tasks" ? "/kanban?task=" + id : "/" + category + "/" + id,
    });
  };
  for (const c of companies)
    add(
      "companies",
      c.id,
      "Empresa guardada · " + c.name,
      c.createdAt,
      "saved",
    );
  for (const o of offers) {
    add("offers", o.id, "Oferta guardada · " + o.title, o.savedAt, "saved");
    add("offers", o.id, "Publicada · " + o.title, o.publishedAt, "published");
    add("offers", o.id, "Plazo · " + o.title, o.deadlineAt, "deadline");
  }
  for (const a of applications) {
    add(
      "applications",
      a.id,
      "Enviada · " + a.jobOffer.title,
      a.appliedAt,
      "sent",
    );
    add(
      "applications",
      a.id,
      "Primera respuesta · " + a.jobOffer.title,
      a.firstResponseAt,
      "response",
    );
    add(
      "applications",
      a.id,
      "Proceso cerrado · " + a.jobOffer.title,
      a.closedAt,
      "closed",
    );
  }
  for (const c of contacts) {
    add(
      "contacts",
      c.id,
      "Último contacto · " + c.name,
      c.lastContactAt,
      "last",
    );
  }
  for (const n of networking) {
    let cursor = madrid(n.startsAt).startOf("day");
    const last = madrid(n.endsAt ?? n.startsAt).startOf("day");
    if (cursor < start) cursor = start;
    while (cursor <= last && cursor < end) {
      add(
        "networking",
        n.id,
        n.name,
        cursor.hasSame(madrid(n.startsAt), "day")
          ? n.startsAt
          : cursor.toJSDate(),
        cursor.toISODate()!,
      );
      cursor = cursor.plus({ days: 1 });
    }
  }
  for (const h of history)
    add(
      "applications",
      h.applicationId,
      h.title,
      h.happenedAt,
      "history-" + h.id,
    );
  const [tasks, completed] = await Promise.all([
    db.task.findMany({
      where: { userId, completedAt: null, dueAt: range },
      select: { id: true, title: true, dueAt: true },
    }),
    db.taskCompletion.findMany({
      where: { userId, completedAt: range },
      select: { id: true, taskIdentity: true, title: true, completedAt: true },
    }),
  ]);
  for (const t of tasks) add("tasks", t.id, t.title, t.dueAt, "due");
  for (const t of completed)
    add(
      "tasks",
      t.taskIdentity,
      "Completada · " + t.title,
      t.completedAt,
      "complete-" + t.id,
    );
  return items.sort(
    (a, b) =>
      a.timestamp.localeCompare(b.timestamp) ||
      a.title.localeCompare(b.title, "es"),
  );
}
