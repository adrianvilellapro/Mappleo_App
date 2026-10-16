import "server-only";
import { db } from "@/lib/db";
export async function boardData(userId: string) {
  const columns = await db.boardColumn.findMany({
    where: { userId },
    orderBy: [{ position: "asc" }, { id: "asc" }],
  });
  const tasks = await db.task.findMany({
    where: { userId },
    include: { links: true },
    orderBy: [{ position: "asc" }, { id: "asc" }],
  });
  return JSON.parse(JSON.stringify({ columns, tasks }));
}
export async function taskOptions(userId: string) {
  const [companies, offers, applications, contacts, networking] =
    await Promise.all([
      db.company.findMany({
        where: { userId },
        select: { id: true, name: true },
      }),
      db.jobOffer.findMany({
        where: { userId },
        select: { id: true, title: true, company: { select: { name: true } } },
        orderBy: { savedAt: "desc" },
      }),
      db.application.findMany({
        where: { userId },
        select: {
          id: true,
          appliedAt: true,
          jobOffer: {
            select: { title: true, company: { select: { name: true } } },
          },
        },
        orderBy: { appliedAt: "desc" },
      }),
      db.contact.findMany({
        where: { userId },
        select: { id: true, name: true },
      }),
      db.networkingEvent.findMany({
        where: { userId },
        select: { id: true, name: true },
        orderBy: { startsAt: "desc" },
      }),
    ]);
  return [
    ...companies
      .sort((a, b) => a.name.localeCompare(b.name, "es"))
      .map((r) => ({ kind: "companies", id: r.id, label: r.name })),
    ...offers.map((r) => ({
      kind: "offers",
      id: r.id,
      label: r.title + " · " + r.company.name,
    })),
    ...applications.map((r) => ({
      kind: "applications",
      id: r.id,
      label:
        r.jobOffer.title +
        " · " +
        r.jobOffer.company.name +
        " · " +
        r.appliedAt.toLocaleDateString("es-ES", { timeZone: "Europe/Madrid" }),
    })),
    ...contacts
      .sort((a, b) => a.name.localeCompare(b.name, "es"))
      .map((r) => ({ kind: "contacts", id: r.id, label: r.name })),
    ...networking.map((r) => ({ kind: "networking", id: r.id, label: r.name })),
  ];
}
