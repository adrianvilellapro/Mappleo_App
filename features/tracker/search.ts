import {
  eventTypes,
  sources,
  statuses,
  workModes,
  type EntityKind,
} from "./config";
import { rowTitle, type RecordRow } from "./types";

export function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("es")
    .trim();
}

export function matchesSearch(text: string, query: string) {
  const normalized = normalizeSearch(text);
  return normalizeSearch(query)
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => normalized.includes(word));
}

type SearchField = { label: string; text: string; weight: number };
export type RecordMatch = { score: number; label: string; excerpt: string };

export function searchRecord(
  kind: EntityKind,
  row: RecordRow,
  query: string,
): RecordMatch | null {
  const words = normalizeSearch(query).split(/\s+/).filter(Boolean);
  if (!words.length) return { score: 0, label: "", excerpt: "" };
  const fields: SearchField[] = [];
  const add = (label: string, value: unknown, weight = 1) => {
    const text = Array.isArray(value)
      ? value.filter((v) => typeof v === "string").join(", ")
      : typeof value === "string"
        ? value
        : "";
    if (text) fields.push({ label, text, weight });
  };
  add(
    kind === "offers" || kind === "applications" ? "Puesto" : "Nombre",
    rowTitle(row),
    10,
  );
  add("Empresa", row.company?.name ?? row.jobOffer?.company.name, 8);
  add("Ubicación", row.location);
  add("Notas", row.notes);
  if (kind === "companies") {
    add("Sector", row.sector);
    add("Etiquetas", row.tags, 4);
    add("Web", row.websiteUrl);
  }
  if (kind === "offers") {
    add("Tecnologías", row.technologies, 6);
    add("Descripción", row.description);
    add("Fuente", sources[row.source as keyof typeof sources]);
  }
  if (kind === "offers" || kind === "companies")
    add("Modalidad", workModes[row.workMode as keyof typeof workModes]);
  if (kind === "applications") {
    add("Estado", statuses[row.status as keyof typeof statuses]);
    add("Versión del CV", row.cvVersion);
  }
  if (kind === "contacts") {
    add("Cargo", row.role, 4);
    add("Email", row.email);
    add("Teléfono", row.phone);
  }
  if (kind === "networking") {
    add("Tipo", eventTypes[row.type as keyof typeof eventTypes]);
    add(
      "Empresas",
      row.companies?.map((c) => c.name),
    );
    add(
      "Contactos",
      row.contacts?.map((c) => c.name),
    );
  }
  const normalized = fields.map((field) => normalizeSearch(field.text));
  if (!words.every((word) => normalized.some((text) => text.includes(word))))
    return null;
  const matches = fields
    .map((field, index) => ({
      ...field,
      normalized: normalized[index],
      score:
        field.weight *
        words.filter((word) => normalized[index].includes(word)).length,
    }))
    .filter((field) => field.score)
    .sort((a, b) => b.score - a.score);
  const best = matches[0];
  const start = Math.max(
    0,
    Math.min(
      ...words
        .map((word) => best.normalized.indexOf(word))
        .filter((index) => index >= 0),
    ) - 45,
  );
  const excerpt =
    (start ? "…" : "") +
    best.text.slice(start, start + 160) +
    (best.text.length > start + 160 ? "…" : "");
  return {
    score: matches.reduce((sum, field) => sum + field.score, 0),
    label: best.label,
    excerpt,
  };
}
