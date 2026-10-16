import { concatPdfChunks, ReportLimitError } from "../reports/pdf-runtime";
import type { Backup } from "./schema";
import {
  eventTypes,
  sources,
  statuses,
  workModes,
} from "@/features/tracker/config";

const ink = "#111827";
const teal = "#0F766E";
const muted = "#64706E";
const line = "#E5E7EB";
const margin = 48;
const width = 595.28 - margin * 2;

function date(value: Date | null | undefined) {
  if (!value) return "";
  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Madrid",
  }).format(value);
}
function named(values: Record<string, string>, value: string) {
  return values[value] ?? value;
}
function details(
  doc: PDFKit.PDFDocument,
  title: string,
  fields: [string, unknown][],
) {
  if (doc.y > 730) doc.addPage();
  doc
    .font("Helvetica-Bold")
    .fontSize(11)
    .fillColor(ink)
    .text(title, margin, doc.y, { width });
  doc.moveDown(0.25);
  for (const [label, raw] of fields) {
    if (
      raw === null ||
      raw === undefined ||
      raw === "" ||
      (Array.isArray(raw) && !raw.length)
    )
      continue;
    const value =
      raw instanceof Date
        ? date(raw)
        : Array.isArray(raw)
          ? raw.join(", ")
          : String(raw);
    doc
      .font("Helvetica-Bold")
      .fontSize(9)
      .fillColor(muted)
      .text(label + ": ", margin, doc.y, { continued: true, width });
    doc.font("Helvetica").fillColor(ink).text(value);
  }
  doc.moveDown(0.55);
  doc
    .strokeColor(line)
    .lineWidth(0.5)
    .moveTo(margin, doc.y)
    .lineTo(margin + width, doc.y)
    .stroke();
  doc.moveDown(0.8);
}
function section(doc: PDFKit.PDFDocument, title: string, count: number) {
  if (doc.y > 700) doc.addPage();
  doc
    .font("Helvetica-Bold")
    .fontSize(16)
    .fillColor(teal)
    .text(title, margin, doc.y, { width });
  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor(muted)
    .text(count + (count === 1 ? " registro" : " registros"));
  doc.moveDown(0.65);
  if (!count) {
    doc.font("Helvetica").fontSize(10).fillColor(muted).text("Sin registros.");
    doc.moveDown(1.2);
  }
}

export function renderBackupPdf(
  PDFDocument: typeof import("pdfkit"),
  backup: Backup,
): Promise<Uint8Array> {
  if (JSON.stringify(backup).length > 1024 * 1024)
    throw new ReportLimitError(
      "Los datos son demasiado extensos para un único PDF. Descárgalos en JSON o CSV, o utiliza el informe de estadísticas con filtros.",
    );
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin,
      bufferPages: true,
      info: { Title: "Mappleo · Informe de datos", Author: "Mappleo" },
    });
    const chunks: Uint8Array[] = [];
    doc.on("data", (chunk: Uint8Array) => chunks.push(chunk));
    doc.on("end", () => {
      try {
        resolve(concatPdfChunks(chunks));
      } catch (error) {
        reject(error);
      }
    });
    doc.on("error", reject);
    doc.on("pageAdded", () => {
      if (doc.bufferedPageRange().count > 250) {
        const error = new ReportLimitError(
          "El informe supera las 250 páginas permitidas. Usa JSON o CSV para descargar todos los datos.",
        );
        // The browser build has no Node stream destroy(); throwing still stops rendering.
        if (typeof doc.destroy === "function") doc.destroy(error);
        throw error;
      }
    });

    doc.rect(0, 0, doc.page.width, 126).fill(teal);
    doc
      .font("Helvetica-Bold")
      .fontSize(25)
      .fillColor("#FFFFFF")
      .text("Mappleo", margin, 31);
    doc
      .font("Helvetica")
      .fontSize(13)
      .text("Informe de tu búsqueda de empleo", margin, 69);
    doc.fontSize(9).text("Exportado: " + date(backup.exportedAt), margin, 98);
    doc.y = 154;

    const companies = new Map(
      backup.companies.map((item) => [item.id, item.name]),
    );
    const offers = new Map(backup.offers.map((item) => [item.id, item]));
    const contacts = new Map(
      backup.contacts.map((item) => [item.id, item.name]),
    );
    const counts = [
      ["Empresas", backup.companies.length],
      ["Ofertas", backup.offers.length],
      ["Candidaturas", backup.applications.length],
      ["Contactos", backup.contacts.length],
      ["Eventos", backup.networking.length],
    ];
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor(muted)
      .text(
        counts.map(([label, count]) => label + ": " + count).join("   ·   "),
        margin,
        doc.y,
        { width },
      );
    doc.moveDown(1.5);

    section(doc, "Empresas", backup.companies.length);
    for (const c of backup.companies)
      details(doc, c.name, [
        ["Web", c.websiteUrl],
        ["Icono", c.faviconUrl],
        ["Dominio", c.domain],
        ["Página de empleo", c.careersUrl],
        ["LinkedIn", c.linkedinUrl],
        ["Ubicación", c.location],
        ["Modalidad", named(workModes, c.workMode)],
        ["Sector", c.sector],
        ["Interés", c.interestRating + "/5"],
        ["Etiquetas", c.tags],
        ["Notas", c.notes],
        ["Archivada", c.archivedAt ? date(c.archivedAt) : ""],
      ]);
    section(doc, "Ofertas", backup.offers.length);
    for (const o of backup.offers)
      details(doc, o.title, [
        ["Empresa", companies.get(o.companyId)],
        ["Enlace", o.url],
        ["Fuente", named(sources, o.source)],
        ["Ubicación", o.location],
        ["Modalidad", named(workModes, o.workMode)],
        [
          "Salario",
          o.salaryMin === null && o.salaryMax === null
            ? ""
            : [o.salaryMin, o.salaryMax].filter((v) => v !== null).join("–") +
              " " +
              o.salaryCurrency,
        ],
        ["Tecnologías", o.technologies],
        ["Interés", o.interestRating + "/5"],
        ["Publicada", date(o.publishedAt)],
        ["Fecha límite", date(o.deadlineAt)],
        ["Descripción", o.description],
        ["Notas", o.notes],
        ["Archivada", o.archivedAt ? date(o.archivedAt) : ""],
      ]);
    section(doc, "Candidaturas", backup.applications.length);
    for (const a of backup.applications) {
      const offer = offers.get(a.jobOfferId);
      details(doc, offer?.title ?? "Candidatura", [
        ["Empresa", offer ? companies.get(offer.companyId) : ""],
        ["Estado", named(statuses, a.status)],
        ["Presentada", date(a.appliedAt)],
        ["Primera respuesta real", date(a.firstResponseAt)],
        ["Próxima acción", a.nextAction],
        ["Fecha de acción", date(a.nextActionDueAt)],
        ["Versión del CV", a.cvVersion],
        ["Carta de presentación", a.coverLetterUsed ? "Sí" : "No"],
        ["Notas", a.notes],
        ["Cerrada", date(a.closedAt)],
        ...a.events
          .slice()
          .sort(
            (left, right) =>
              left.happenedAt.getTime() - right.happenedAt.getTime(),
          )
          .map((event): [string, string] => [
            "Historial · " + date(event.happenedAt),
            event.title + (event.description ? " — " + event.description : ""),
          ]),
      ]);
    }
    section(doc, "Contactos", backup.contacts.length);
    for (const c of backup.contacts)
      details(doc, c.name, [
        ["Cargo", c.role],
        ["Empresa", c.companyId ? companies.get(c.companyId) : ""],
        ["Email", c.email],
        ["Teléfono", c.phone],
        ["LinkedIn", c.linkedinUrl],
        ["Último contacto", date(c.lastContactAt)],
        ["Próximo seguimiento", date(c.followUpAt)],
        ["Notas", c.notes],
      ]);
    section(doc, "Networking", backup.networking.length);
    for (const n of backup.networking)
      details(doc, n.name, [
        ["Tipo", named(eventTypes, n.type)],
        ["Empieza", date(n.startsAt)],
        ["Termina", date(n.endsAt)],
        ["Ubicación", n.location],
        ["Web", n.url],
        [
          "Empresas",
          n.companies.map((item) => companies.get(item.id) ?? item.id),
        ],
        [
          "Contactos",
          n.contacts.map((item) => contacts.get(item.id) ?? item.id),
        ],
        ["Notas", n.notes],
      ]);

    section(doc, "Tareas del Kanban", backup.tasks?.length ?? 0);
    const columns = new Map(
      (backup.boardColumns ?? []).map((c) => [c.id, c.name]),
    );
    for (const t of backup.tasks ?? [])
      details(doc, t.title, [
        ["Columna", columns.get(t.columnId)],
        ["Descripción", t.description],
        ["Fecha límite", date(t.dueAt)],
        ["Completada", date(t.completedAt)],
        ["Enlaces", t.links.map((l) => l.label)],
      ]);
    section(
      doc,
      "Histórico de tareas completadas",
      backup.taskCompletions?.length ?? 0,
    );
    for (const c of backup.taskCompletions ?? [])
      details(doc, c.title, [
        ["Fecha", date(c.completedAt)],
        ["Origen", c.sourceKind],
      ]);
    const pages = doc.bufferedPageRange();
    for (let index = pages.start; index < pages.start + pages.count; index++) {
      doc.switchToPage(index);
      doc
        .font("Helvetica")
        .fontSize(8)
        .fillColor(muted)
        .text(
          "Mappleo · Informe privado                                     Página " +
            (index + 1) +
            " de " +
            pages.count,
          margin,
          doc.page.height - 65,
          { width, align: "right" },
        );
    }
    doc.end();
  });
}
