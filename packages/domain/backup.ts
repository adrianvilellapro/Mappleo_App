import { z } from "zod";
import { sameWebsiteHost } from "./company-url";
import { webUrl } from "./schemas";
import {
  statuses,
  workModes,
  sources,
  eventTypes,
  activityTypes,
} from "./tracker";
import { publicWebsiteUrl, isExampleHost } from "./company-url";
const id = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-zA-Z0-9_:-]+$/, "Identificador no válido.");
const keys = (values: Record<string, string>) =>
  z.enum(Object.keys(values) as [string, ...string[]]);
const text = z.string().max(30000);
const short = z.string().max(500);
const required = short.trim().min(1);
const date = z.iso.datetime().transform((value) => new Date(value));
const nullableDate = date.nullable();
const base = { id, userId: id, createdAt: date, updatedAt: date };
const rating = z.number().int().min(1).max(5);
const list = z.array(z.string().max(100)).max(100);

const company = z.object({
  ...base,
  name: required,
  websiteUrl: webUrl,
  faviconUrl: z.string().max(2048).optional(),
  domain: short,
  careersUrl: webUrl,
  linkedinUrl: webUrl,
  location: short,
  workMode: keys(workModes),
  sector: short,
  interestRating: rating,
  notes: text,
  tags: list,
  archivedAt: nullableDate,
});
const offer = z.object({
  ...base,
  companyId: id,
  title: required,
  url: webUrl,
  source: keys(sources),
  location: short,
  workMode: keys(workModes),
  salaryMin: z.number().int().min(0).max(100000000).nullable(),
  salaryMax: z.number().int().min(0).max(100000000).nullable(),
  salaryCurrency: z.enum(["EUR", "USD", "GBP"]),
  description: text,
  notes: text,
  technologies: list,
  interestRating: rating,
  publishedAt: nullableDate,
  deadlineAt: nullableDate,
  savedAt: date,
  archivedAt: nullableDate,
});
const history = z.object({
  id,
  applicationId: id,
  type: keys({
    ...activityTypes,
    STATUS_CHANGED: "Cambio",
    APPLICATION_SENT: "Enviada",
  }),
  fromStatus: keys(statuses).nullable(),
  toStatus: keys(statuses).nullable(),
  title: short,
  description: text,
  happenedAt: date,
  createdAt: date,
});
const application = z.object({
  ...base,
  jobOfferId: id,
  status: keys(statuses),
  appliedAt: date,
  firstResponseAt: nullableDate.optional(),
  nextAction: short,
  nextActionDueAt: nullableDate,
  cvVersion: short,
  coverLetterUsed: z.boolean(),
  notes: text,
  closedAt: nullableDate,
  events: z.array(history).max(2000),
});
const contact = z.object({
  ...base,
  companyId: id.nullable(),
  name: required,
  role: short,
  email: z.union([z.email().max(254), z.literal("")]),
  linkedinUrl: webUrl,
  phone: short,
  notes: text,
  lastContactAt: nullableDate,
  followUpAt: nullableDate,
});
const networking = z.object({
  ...base,
  name: required,
  type: keys(eventTypes),
  startsAt: date,
  endsAt: nullableDate,
  location: short,
  url: webUrl,
  notes: text,
  companies: z.array(z.object({ id })).max(500),
  contacts: z.array(z.object({ id })).max(500),
});
const entity = z.enum([
  "companies",
  "offers",
  "applications",
  "contacts",
  "networking",
]);
const column = z.object({
  id,
  userId: id,
  name: z.string().trim().min(1).max(80),
  position: z.number().int().nonnegative(),
  isDone: z.boolean(),
  systemKey: z.enum(["todo", "doing", "done"]).nullable(),
});
const task = z.object({
  ...base,
  columnId: id,
  title: required,
  description: text,
  dueAt: nullableDate,
  position: z.number().int().nonnegative(),
  completedAt: nullableDate,
  sourceKind: z.enum(["applications", "contacts"]).nullable(),
  sourceId: id.nullable(),
  links: z
    .array(z.object({ kind: entity, recordId: id, label: short }))
    .max(20),
});
const completion = z.object({
  id,
  userId: id,
  taskId: id.nullable(),
  taskIdentity: id,
  companyIds: z.array(id).max(100).optional(),
  sources: z.array(short).max(30).optional(),
  title: short,
  sourceKind: z.enum(["applications", "contacts"]).nullable(),
  sourceId: id.nullable(),
  completedAt: date,
});

export const backupSchema = z
  .object({
    version: z.literal(1),
    exportedAt: date,
    ownerId: id.optional(),
    companies: z.array(company).max(2000),
    offers: z.array(offer).max(2000),
    applications: z.array(application).max(2000),
    contacts: z.array(contact).max(2000),
    networking: z.array(networking).max(2000),
    technologyTags: z
      .array(z.string().trim().min(1).max(100))
      .max(500)
      .optional(),
    boardColumns: z.array(column).max(30).optional(),
    tasks: z.array(task).max(2000).optional(),
    taskCompletions: z.array(completion).max(4000).optional(),
  })
  .superRefine((backup, ctx) => {
    const sections = [
      backup.companies,
      backup.offers,
      backup.applications,
      backup.contacts,
      backup.networking,
      backup.boardColumns ?? [],
      backup.tasks ?? [],
      backup.taskCompletions ?? [],
    ];
    const records = sections.flat();
    const histories = backup.applications.flatMap((item) => item.events);
    if (records.length + histories.length > 6000)
      ctx.addIssue({
        code: "custom",
        message: "El archivo contiene demasiados registros.",
      });
    const owner = backup.ownerId ?? records[0]?.userId;
    if (records.some((record) => record.userId !== owner))
      ctx.addIssue({
        code: "custom",
        message: "El archivo mezcla datos de distintas cuentas.",
      });
    for (const item of backup.companies) {
      if (!item.faviconUrl) continue;
      try {
        const site = new URL(item.websiteUrl);
        const icon = new URL(item.faviconUrl);
        if (
          !["http:", "https:"].includes(site.protocol) ||
          !["http:", "https:"].includes(icon.protocol) ||
          !sameWebsiteHost(icon.hostname, site.hostname) ||
          (!(publicWebsiteUrl(site) && publicWebsiteUrl(icon)) &&
            !(
              isExampleHost(site.hostname) &&
              !site.port &&
              !icon.port &&
              !site.username &&
              !site.password &&
              !icon.username &&
              !icon.password
            ))
        )
          throw new Error("Origen distinto");
      } catch {
        ctx.addIssue({
          code: "custom",
          message: "El icono de una empresa no pertenece a su web.",
        });
      }
    }
    for (const section of [...sections, histories]) {
      const ids = section.map((record) => record.id);
      if (new Set(ids).size !== ids.length)
        ctx.addIssue({
          code: "custom",
          message: "El archivo contiene identificadores duplicados.",
        });
    }
    const companyIds = new Set(backup.companies.map((item) => item.id));
    if (
      backup.offers.some(
        (offer) =>
          offer.salaryMin !== null &&
          offer.salaryMax !== null &&
          offer.salaryMax < offer.salaryMin,
      ) ||
      backup.networking.some(
        (event) => event.endsAt && event.endsAt < event.startsAt,
      )
    )
      ctx.addIssue({
        code: "custom",
        message: "El archivo contiene salarios o fechas incompatibles.",
      });
    const offerIds = new Set(backup.offers.map((item) => item.id));
    const contactIds = new Set(backup.contacts.map((item) => item.id));
    const refs: Record<string, Set<string>> = {
      companies: companyIds,
      offers: offerIds,
      applications: new Set(backup.applications.map((a) => a.id)),
      contacts: contactIds,
      networking: new Set(backup.networking.map((n) => n.id)),
    };
    const colIds = new Set(backup.boardColumns?.map((c) => c.id) ?? []),
      taskIds = new Set(backup.tasks?.map((t) => t.id) ?? []);
    const keys = (backup.boardColumns ?? [])
      .map((c) => c.systemKey)
      .filter(Boolean);
    if (
      new Set(keys).size !== keys.length ||
      (backup.boardColumns ?? []).filter((c) => c.isDone).length > 1 ||
      (backup.tasks ?? []).some(
        (t) =>
          !colIds.has(t.columnId) ||
          !!t.sourceKind !== !!t.sourceId ||
          (t.sourceKind && t.sourceId && !refs[t.sourceKind].has(t.sourceId)) ||
          t.links.some((l) => !refs[l.kind].has(l.recordId)),
      ) ||
      (backup.taskCompletions ?? []).some(
        (c) => c.taskId && !taskIds.has(c.taskId),
      )
    )
      ctx.addIssue({
        code: "custom",
        message: "El tablero contiene relaciones o columnas incompatibles.",
      });
    // Legacy source IDs remain validated above, but tasks are now independent:
    // their title/date need not mirror the retired next-action fields.
    if (
      backup.offers.some((item) => !companyIds.has(item.companyId)) ||
      backup.applications.some((item) => !offerIds.has(item.jobOfferId)) ||
      backup.contacts.some(
        (item) => item.companyId && !companyIds.has(item.companyId),
      ) ||
      backup.networking.some(
        (item) =>
          item.companies.some((company) => !companyIds.has(company.id)) ||
          item.contacts.some((contact) => !contactIds.has(contact.id)),
      ) ||
      backup.applications.some((item) =>
        item.events.some((event) => event.applicationId !== item.id),
      )
    )
      ctx.addIssue({
        code: "custom",
        message: "El archivo contiene relaciones incompletas.",
      });
  });

export type Backup = z.infer<typeof backupSchema>;
