import { z } from "zod";
import {
  workModes,
  statuses,
  sources,
  eventTypes,
  activityTypes,
} from "./tracker";
const enumKeys = <T extends Record<string, string>>(values: T) =>
  z.enum(Object.keys(values) as [keyof T & string, ...(keyof T & string)[]]);
const text = z.string().trim().max(500).default("");
const requiredText = z
  .string()
  .trim()
  .min(1, "Completa los campos obligatorios.")
  .max(200);
const notes = z.string().trim().max(30000).default("");
export const webUrl = z
  .string()
  .trim()
  .max(2048)
  .default("")
  .transform((v) => (v && !/^[a-z][a-z0-9+.-]*:/i.test(v) ? "https://" + v : v))
  .refine((v) => v.length <= 2048, "La URL es demasiado larga.")
  .refine((v) => {
    if (!v) return true;
    try {
      const u = new URL(v);
      return (
        ["http:", "https:"].includes(u.protocol) &&
        !!u.hostname &&
        !u.username &&
        !u.password
      );
    } catch {
      return false;
    }
  }, "Introduce una URL http o https válida.");
const date = z.preprocess(
  (v) => (v === "" || v == null ? null : v),
  z.coerce.date().nullable(),
);
const requiredDate = z
  .union([z.string().min(1), z.date()])
  .pipe(z.coerce.date());
const list = z.preprocess(
  (v) =>
    typeof v === "string"
      ? v
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : (v ?? []),
  z.array(z.string().trim().max(100)).max(50),
);
const ids = z.array(z.string().min(1).max(100)).max(100).default([]);
const rating = z.coerce.number().int().min(1).max(5);
const money = z.preprocess(
  (v) => (v === "" || v == null ? null : v),
  z.coerce.number().int().min(0).max(100000000).nullable(),
);
const common = { notes };
export const companySchema = z.object({
  ...common,
  name: requiredText,
  websiteUrl: webUrl,
  careersUrl: webUrl,
  linkedinUrl: webUrl,
  location: text,
  workMode: enumKeys(workModes),
  sector: text,
  interestRating: rating,
  tags: list,
});
export const offerSchema = z
  .object({
    ...common,
    title: requiredText,
    companyId: requiredText,
    url: webUrl,
    source: enumKeys(sources),
    location: text,
    workMode: enumKeys(workModes),
    salaryMin: money,
    salaryMax: money,
    salaryCurrency: z.enum(["EUR", "USD", "GBP"]),
    description: notes,
    technologies: list,
    interestRating: rating,
    publishedAt: date,
    deadlineAt: date,
  })
  .refine(
    (v) =>
      v.salaryMin === null ||
      v.salaryMax === null ||
      v.salaryMax >= v.salaryMin,
    "El salario máximo no puede ser menor que el mínimo.",
  );
export const applicationSchema = z
  .object({
    ...common,
    jobOfferId: requiredText,
    status: enumKeys(statuses),
    appliedAt: requiredDate,
    firstResponseAt: date,
    nextAction: text,
    nextActionDueAt: date,
    cvVersion: text,
    coverLetterUsed: z.preprocess((v) => v === true || v === "on", z.boolean()),
  })
  .refine(
    (v) => !v.nextActionDueAt || !!v.nextAction,
    "Escribe la próxima acción si indicas una fecha.",
  )
  .refine(
    (v) =>
      !v.firstResponseAt ||
      (v.firstResponseAt >= v.appliedAt && v.firstResponseAt <= new Date()),
    "La primera respuesta debe estar entre el envío y la fecha actual.",
  );
export const contactSchema = z.object({
  ...common,
  name: requiredText,
  companyId: z
    .string()
    .default("")
    .transform((v) => v || null),
  role: text,
  email: z.union([z.email(), z.literal("")]).default(""),
  phone: text,
  linkedinUrl: webUrl,
  lastContactAt: date,
  followUpAt: date,
});
export const networkingSchema = z
  .object({
    ...common,
    name: requiredText,
    type: enumKeys(eventTypes),
    startsAt: requiredDate,
    endsAt: date,
    location: text,
    url: webUrl,
    companyIds: ids,
    contactIds: ids,
  })
  .refine(
    (v) => !v.endsAt || v.endsAt >= v.startsAt,
    "El final del evento debe ser posterior al inicio.",
  );
export const activitySchema = z.object({
  applicationId: requiredText,
  title: requiredText,
  description: notes,
  type: enumKeys(activityTypes),
  happenedAt: requiredDate,
});
export const nextStepSchema = z.object({
  kind: z.enum(["applications", "contacts", "tasks"]),
  id: z.string().min(1).max(100),
  title: z.string().min(1).max(500),
  dueAt: z.iso.datetime().nullable(),
});
export function corporateDomain(url: string) {
  return url ? new URL(url).hostname.replace(/^www\./, "") : "";
}
