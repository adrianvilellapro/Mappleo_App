import type { Workspace, Kind } from "../shared/contracts";
import {
  statuses,
  entities,
  type EntityKind,
} from "../../../../packages/domain/tracker";

export type Item = { id: string; [key: string]: unknown };
export const getItems = (data: Workspace, kind: Kind): Item[] =>
  data[kind] ?? [];
export function recordLabel(data: Workspace, kind: Kind, id: string): string {
  const item = getItems(data, kind).find((r) => r.id === id);
  if (!item) return "Registro no disponible";
  if (kind === "applications")
    return recordLabel(data, "offers", String(item.jobOfferId));
  return String(item.name ?? item.title ?? "Registro");
}
export function subtitle(data: Workspace, kind: Kind, item: Item): string {
  if (kind === "offers")
    return recordLabel(data, "companies", String(item.companyId));
  if (kind === "applications") {
    const offer = data.offers.find((o) => o.id === item.jobOfferId);
    return offer ? recordLabel(data, "companies", offer.companyId) : "";
  }
  if (kind === "contacts")
    return item.companyId
      ? recordLabel(data, "companies", String(item.companyId))
      : String(item.role ?? "");
  return String(item.location ?? "");
}
export const formatDate = (value: unknown, withTime = false) =>
  value
    ? new Intl.DateTimeFormat("es-ES", {
        dateStyle: "medium",
        ...(withTime ? { timeStyle: "short" as const } : {}),
      }).format(new Date(String(value)))
    : "Sin fecha";
export const inputDate = (value?: unknown) => {
  if (!value) return "";
  const date = new Date(String(value));
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
};
export const dateKey = (value: string | Date) => {
  const d = new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export type CalendarEntry = {
  key: string;
  at: string;
  label: string;
  kind: Kind;
  id: string;
  tone: string;
};
export function calendarEntries(data: Workspace): CalendarEntry[] {
  const result: CalendarEntry[] = [];
  data.applications.forEach((a) => {
    a.events.forEach((e) => {
      if (["INTERVIEW", "TECHNICAL_TEST"].includes(e.type))
        result.push({
          key: e.id,
          at: e.happenedAt,
          label: e.title,
          kind: "applications",
          id: a.id,
          tone: "purple",
        });
    });
  });
  data.offers.forEach((o) => {
    if (o.deadlineAt && !o.archivedAt)
      result.push({
        key: "offer:" + o.id,
        at: o.deadlineAt,
        label: "Cierre: " + o.title,
        kind: "offers",
        id: o.id,
        tone: "amber",
      });
  });
  data.networking.forEach((n) =>
    result.push({
      key: "network:" + n.id,
      at: n.startsAt,
      label: n.name,
      kind: "networking",
      id: n.id,
      tone: "blue",
    }),
  );
  (data.tasks ?? [])
    .filter((t) => !t.completedAt && t.dueAt)
    .forEach((t) =>
      result.push({
        key: "task:" + t.id,
        at: t.dueAt!,
        label: t.title,
        kind: "tasks",
        id: t.id,
        tone: "teal",
      }),
    );
  return result.sort((a, b) => a.at.localeCompare(b.at));
}
export function searchRows(data: Workspace, query: string) {
  const normalize = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  const tokens = normalize(query.trim()).split(/\s+/).filter(Boolean);
  if (!tokens.length) return [];
  return ([...Object.keys(entities), "tasks"] as Kind[])
    .flatMap((kind) =>
      getItems(data, kind)
        .filter((item) => {
          const haystack = normalize(
            [
              recordLabel(data, kind, item.id),
              subtitle(data, kind, item),
              item.notes,
              item.description,
              item.role,
              item.location,
              item.technologies,
              item.tags,
            ]
              .filter(Boolean)
              .join(" "),
          );
          return tokens.every((token) => haystack.includes(token));
        })
        .map((item) => ({ kind, item })),
    )
    .slice(0, 30);
}
export const statusLabel = (value: unknown) =>
  statuses[value as keyof typeof statuses] ?? String(value);
export const isEntity = (kind: string): kind is EntityKind =>
  Object.hasOwn(entities, kind);
