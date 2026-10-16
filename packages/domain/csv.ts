import type { Backup } from "./backup";
import {
  eventTypes,
  sources,
  statuses,
  workModes,
} from "./tracker";
import type { CsvSection } from "./csv-sections";

function cell(value: unknown) {
  let result =
    value == null
      ? ""
      : value instanceof Date
        ? value.toISOString()
        : Array.isArray(value)
          ? value.join("; ")
          : String(value);
  // Spreadsheets may execute cells beginning with formula characters.
  if (/^[\s\u0000-\u001f]*[=+\-@]/u.test(result)) result = "'" + result;
  return '"' + result.replaceAll('"', '""') + '"';
}
function table(headers: string[], rows: unknown[][]) {
  return (
    "\uFEFF" +
    [headers, ...rows].map((row) => row.map(cell).join(",")).join("\r\n") +
    "\r\n"
  );
}
function label(values: Record<string, string>, value: string) {
  return values[value] ?? value;
}

export function makeCsv(backup: Backup, section: CsvSection) {
  const companies = new Map(
    backup.companies.map((item) => [item.id, item.name]),
  );
  const offers = new Map(backup.offers.map((item) => [item.id, item.title]));
  const contacts = new Map(backup.contacts.map((item) => [item.id, item.name]));
  switch (section) {
    case "tasks": {
      const columns = new Map(
        (backup.boardColumns ?? []).map((c) => [c.id, c.name]),
      );
      return table(
        [
          "ID",
          "Título",
          "Columna",
          "Descripción",
          "Fecha límite",
          "Completada",
          "Enlaces",
          "Creada",
          "Actualizada",
        ],
        (backup.tasks ?? []).map((t) => [
          t.id,
          t.title,
          columns.get(t.columnId),
          t.description,
          t.dueAt,
          t.completedAt,
          t.links.map((l) => l.kind + ":" + l.recordId + " · " + l.label),
          t.createdAt,
          t.updatedAt,
        ]),
      );
    }
    case "completions":
      return table(
        ["ID", "Tarea", "Título", "Completada", "Origen", "ID origen"],
        (backup.taskCompletions ?? []).map((c) => [
          c.id,
          c.taskIdentity,
          c.title,
          c.completedAt,
          c.sourceKind,
          c.sourceId,
        ]),
      );
    case "companies":
      return table(
        [
          "ID",
          "Nombre",
          "Web",
          "Icono",
          "Dominio",
          "Página de empleo",
          "LinkedIn",
          "Ubicación",
          "Modalidad",
          "Sector",
          "Interés",
          "Etiquetas",
          "Notas",
          "Archivada",
          "Creada",
          "Actualizada",
        ],
        backup.companies.map((c) => [
          c.id,
          c.name,
          c.websiteUrl,
          c.faviconUrl,
          c.domain,
          c.careersUrl,
          c.linkedinUrl,
          c.location,
          label(workModes, c.workMode),
          c.sector,
          c.interestRating,
          c.tags,
          c.notes,
          c.archivedAt,
          c.createdAt,
          c.updatedAt,
        ]),
      );
    case "offers":
      return table(
        [
          "ID",
          "Puesto",
          "Empresa",
          "ID empresa",
          "Enlace",
          "Fuente",
          "Ubicación",
          "Modalidad",
          "Salario mínimo",
          "Salario máximo",
          "Moneda",
          "Tecnologías",
          "Interés",
          "Publicada",
          "Fecha límite",
          "Guardada",
          "Descripción",
          "Notas",
          "Archivada",
          "Creada",
          "Actualizada",
        ],
        backup.offers.map((o) => [
          o.id,
          o.title,
          companies.get(o.companyId),
          o.companyId,
          o.url,
          label(sources, o.source),
          o.location,
          label(workModes, o.workMode),
          o.salaryMin,
          o.salaryMax,
          o.salaryCurrency,
          o.technologies,
          o.interestRating,
          o.publishedAt,
          o.deadlineAt,
          o.savedAt,
          o.description,
          o.notes,
          o.archivedAt,
          o.createdAt,
          o.updatedAt,
        ]),
      );
    case "applications":
      return table(
        [
          "ID",
          "Oferta",
          "ID oferta",
          "Empresa",
          "Estado",
          "Fecha de candidatura",
          "Primera respuesta real",
          "Próxima acción",
          "Fecha próxima acción",
          "Versión CV",
          "Carta de presentación",
          "Notas",
          "Cerrada",
          "Creada",
          "Actualizada",
        ],
        backup.applications.map((a) => {
          const offer = backup.offers.find((o) => o.id === a.jobOfferId);
          return [
            a.id,
            offers.get(a.jobOfferId),
            a.jobOfferId,
            offer ? companies.get(offer.companyId) : "",
            label(statuses, a.status),
            a.appliedAt,
            a.firstResponseAt,
            a.nextAction,
            a.nextActionDueAt,
            a.cvVersion,
            a.coverLetterUsed ? "Sí" : "No",
            a.notes,
            a.closedAt,
            a.createdAt,
            a.updatedAt,
          ];
        }),
      );
    case "history":
      return table(
        [
          "ID",
          "ID candidatura",
          "Oferta",
          "Tipo",
          "Estado anterior",
          "Estado nuevo",
          "Título",
          "Descripción",
          "Fecha",
          "Creada",
        ],
        backup.applications.flatMap((a) =>
          a.events.map((e) => [
            e.id,
            a.id,
            offers.get(a.jobOfferId),
            e.type,
            e.fromStatus ? label(statuses, e.fromStatus) : "",
            e.toStatus ? label(statuses, e.toStatus) : "",
            e.title,
            e.description,
            e.happenedAt,
            e.createdAt,
          ]),
        ),
      );
    case "contacts":
      return table(
        [
          "ID",
          "Nombre",
          "Cargo",
          "Empresa",
          "ID empresa",
          "Email",
          "Teléfono",
          "LinkedIn",
          "Último contacto",
          "Próximo seguimiento",
          "Notas",
          "Creado",
          "Actualizado",
        ],
        backup.contacts.map((c) => [
          c.id,
          c.name,
          c.role,
          c.companyId ? companies.get(c.companyId) : "",
          c.companyId,
          c.email,
          c.phone,
          c.linkedinUrl,
          c.lastContactAt,
          c.followUpAt,
          c.notes,
          c.createdAt,
          c.updatedAt,
        ]),
      );
    case "networking":
      return table(
        [
          "ID",
          "Evento",
          "Tipo",
          "Empieza",
          "Termina",
          "Ubicación",
          "Web",
          "Empresas",
          "Contactos",
          "Notas",
          "Creado",
          "Actualizado",
        ],
        backup.networking.map((n) => [
          n.id,
          n.name,
          label(eventTypes, n.type),
          n.startsAt,
          n.endsAt,
          n.location,
          n.url,
          n.companies.map((c) => companies.get(c.id) ?? c.id),
          n.contacts.map((c) => contacts.get(c.id) ?? c.id),
          n.notes,
          n.createdAt,
          n.updatedAt,
        ]),
      );
  }
}
