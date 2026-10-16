import { z } from "zod";
import {
  applicationSchema,
  companySchema,
  contactSchema,
  networkingSchema,
  offerSchema,
  corporateDomain,
} from "./schemas";
import { closedStatuses, statuses } from "./tracker";
import { defaultTechnologies, uniqueTechnologies } from "./technologies";
import type { Command, Kind, Profile, Workspace } from "./workspace";
export const tables = [
  "companies",
  "offers",
  "applications",
  "contacts",
  "networking",
  "boardColumns",
  "tasks",
  "taskCompletions",
] as const;
export type Table = (typeof tables)[number];
export type Row<K extends Table> = NonNullable<Workspace[K]>[number];
export type Stored = {
  id: string;
  userId: string;
  updatedAt?: string;
  createdAt?: string;
  [key: string]: unknown;
};

const kindSchema = z.enum([
  "companies",
  "offers",
  "applications",
  "contacts",
  "networking",
  "tasks",
  "boardColumns",
]);
const idSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-zA-Z0-9_:-]+$/);
export const commandSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("profile"),
    name: z.string().trim().min(1).max(100),
  }),
  z.object({
    action: z.literal("save"),
    kind: kindSchema,
    id: idSchema.optional(),
    input: z.record(z.string(), z.unknown()),
  }),
  z.object({
    action: z.literal("delete"),
    kind: kindSchema,
    id: idSchema,
    moveTo: idSchema.optional(),
    deleteTasks: z.boolean().optional(),
  }),
  z.object({
    action: z.literal("moveTask"),
    id: idSchema,
    columnId: idSchema,
    position: z.number().int().min(0).max(2000),
  }),
  z.object({
    action: z.literal("complete"),
    kind: z.enum(["applications", "contacts", "tasks"]),
    id: idSchema,
  }),
  z.object({
    action: z.literal("activity"),
    applicationId: idSchema,
    title: z.string().max(200),
    description: z.string().max(30000),
    type: z.string().max(50),
    happenedAt: z.string().max(40),
  }),
  z.object({
    action: z.literal("deleteActivity"),
    applicationId: idSchema,
    id: idSchema,
  }),
]);
const linkSchema = z.object({
  kind: z.enum([
    "companies",
    "offers",
    "applications",
    "contacts",
    "networking",
  ]),
  recordId: idSchema,
  label: z.string().max(500),
});
const taskSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(30000).default(""),
  columnId: idSchema,
  dueAt: z.preprocess((v) => v || null, z.coerce.date().nullable()),
  links: z.array(linkSchema).max(20).default([]),
});

const asWire = <T>(value: unknown): T => JSON.parse(JSON.stringify(value)) as T;
const now = () => new Date().toISOString();

const randomUUID = () => globalThis.crypto.randomUUID();
/** Storage-independent mutations shared by SQLite and the disposable browser demo.
 * Persistence, encryption and network transport remain outside this class.
 */
export abstract class WorkspaceMutations {
  protected abstract requireProfile(): Profile;
  protected abstract all<K extends Table>(kind: K): Row<K>[];
  protected abstract get<K extends Table>(kind: K, id: string): Row<K>;
  protected abstract put<T extends { id: string; userId: string }>(
    kind: Table,
    record: T,
    operation?: "upsert" | "delete",
  ): void;
  protected abstract meta<T>(key: string): T | undefined;
  protected abstract setMeta(key: string, value: unknown): void;
  protected ensureColumns() {
    const profile = this.requireProfile();
    const columns = this.all("boardColumns").sort(
      (a, b) => a.position - b.position || a.id.localeCompare(b.id),
    );
    if (columns.length) {
      const done = columns.find((c) => c.isDone) ?? columns[columns.length - 1];
      for (const column of columns)
        if (column.isDone !== (column.id === done.id))
          this.put("boardColumns", {
            ...column,
            isDone: column.id === done.id,
          });
      return;
    }
    for (const [key, name] of [
      ["todo", "Pendientes"],
      ["doing", "En marcha"],
      ["done", "Completadas"],
    ]) {
      if (this.all("boardColumns").some((c) => c.systemKey === key)) continue;
      this.put("boardColumns", {
        id: randomUUID(),
        userId: profile.id,
        name,
        position: this.all("boardColumns").length,
        isDone: key === "done",
        systemKey: key,
      });
    }
  }
  protected doneColumn() {
    const columns = this.all("boardColumns").sort(
      (a, b) => a.position - b.position || a.id.localeCompare(b.id),
    );
    const done = columns.find((c) => c.isDone) ?? columns[columns.length - 1];
    if (!done) throw new Error("Crea una columna antes de completar tareas.");
    return done;
  }
  protected save(
    kind: Kind,
    id: string | undefined,
    input: Record<string, unknown>,
  ) {
    const profile = this.requireProfile(),
      stamp = now();
    const old = id ? this.get(kind, id) : null;
    const base = {
      id: id ?? randomUUID(),
      userId: profile.id,
      createdAt: stamp,
      updatedAt: stamp,
      ...old,
    };
    if (kind === "boardColumns") {
      const parsed = z
        .object({
          name: z.string().trim().min(1).max(80),
          position: z.coerce.number().int().min(0).max(30),
          isDone: z.boolean().optional(),
        })
        .parse(input);
      const columns = this.all("boardColumns")
        .filter((c) => c.id !== base.id)
        .sort((a, b) => a.position - b.position);
      if (!old && columns.length >= 30)
        throw new Error("Puedes crear hasta 30 columnas.");
      columns.splice(Math.min(parsed.position, columns.length), 0, {
        id: base.id,
        userId: profile.id,
        name: parsed.name,
        position: 0,
        systemKey: old && "systemKey" in old ? old.systemKey : null,
        isDone: old && "isDone" in old ? old.isDone : false,
      });
      const destination =
        parsed.isDone === true
          ? base.id
          : (columns.find(
              (c) => c.isDone && !(c.id === base.id && parsed.isDone === false),
            )?.id ?? columns[columns.length - 1].id);
      columns.forEach((c, position) =>
        this.put("boardColumns", {
          ...c,
          position,
          isDone: c.id === destination,
        }),
      );
      return;
    }
    if (kind === "tasks") {
      const parsed = asWire<z.output<typeof taskSchema>>(
        taskSchema.parse(input),
      );
      const column = this.get("boardColumns", parsed.columnId);
      const prior = old as Row<"tasks"> | null;
      const reopening =
        !!prior?.completedAt && !column.isDone && prior.columnId !== column.id;
      const task: Row<"tasks"> = {
        ...base,
        title: parsed.title,
        description: parsed.description,
        columnId: column.id,
        dueAt: parsed.dueAt as unknown as string | null,
        position:
          prior?.columnId === column.id
            ? prior.position
            : this.all("tasks").filter((t) => t.columnId === column.id).length,
        completedAt: prior?.completedAt ?? null,
        sourceKind: reopening ? null : (prior?.sourceKind ?? null),
        sourceId: reopening ? null : (prior?.sourceId ?? null),
        links: parsed.links,
        updatedAt: stamp,
      };
      if (
        column.isDone &&
        !task.completedAt &&
        (!prior || prior.columnId !== column.id)
      )
        this.finish(task, column.id);
      else
        this.put("tasks", {
          ...task,
          completedAt: reopening ? null : task.completedAt,
        });
      return;
    }
    const schemas = {
      companies: companySchema,
      offers: offerSchema,
      applications: applicationSchema,
      contacts: contactSchema,
      networking: networkingSchema,
    };
    const parsed = asWire<Record<string, unknown>>(schemas[kind].parse(input));
    let record: Stored = { ...base, ...parsed, updatedAt: stamp };
    if (kind === "companies")
      record = {
        ...record,
        domain: corporateDomain(String(parsed.websiteUrl)),
        faviconUrl: "",
        archivedAt: (old as Row<"companies"> | null)?.archivedAt ?? null,
      };
    if (kind === "offers") {
      this.get("companies", String(parsed.companyId));
      record = {
        ...record,
        archivedAt: (old as Row<"offers"> | null)?.archivedAt ?? null,
        savedAt: (old as Row<"offers"> | null)?.savedAt ?? stamp,
      };
      const tags = uniqueTechnologies([
        ...(this.meta<string[]>("technologies") ?? defaultTechnologies),
        ...(parsed.technologies as string[]),
      ]).map((t) => t.name);
      this.setMeta("technologies", tags.slice(0, 500));
    }
    if (kind === "networking") {
      record.companies = (parsed.companyIds as string[]).map((id) => ({ id }));
      record.contacts = (parsed.contactIds as string[]).map((id) => ({ id }));
      delete record.companyIds;
      delete record.contactIds;
    }
    if (kind === "applications") {
      this.get("offers", String(parsed.jobOfferId));
      const previous = old as Row<"applications"> | null;
      const events = previous?.events ?? [];
      if (!previous || previous.status !== parsed.status)
        events.push({
          id: randomUUID(),
          applicationId: base.id,
          type: previous ? "STATUS_CHANGED" : "APPLICATION_SENT",
          fromStatus: previous?.status ?? null,
          toStatus: parsed.status as keyof typeof statuses,
          title: previous
            ? `Estado: ${statuses[parsed.status as keyof typeof statuses]}`
            : "Candidatura enviada",
          description: "",
          happenedAt: previous ? stamp : String(parsed.appliedAt),
          createdAt: stamp,
        });
      record = {
        ...record,
        events,
        closedAt: closedStatuses.includes(String(parsed.status))
          ? (previous?.closedAt ?? stamp)
          : null,
      };
    }
    this.put(kind, record);
  }
  protected finish(task: Row<"tasks">, columnId: string) {
    const stamp = now();
    const companyIds = new Set<string>(),
      sources = new Set<string>();
    const refs = [
      ...task.links,
      ...(task.sourceKind && task.sourceId
        ? [{ kind: task.sourceKind, recordId: task.sourceId }]
        : []),
    ];
    for (const ref of refs) {
      if (ref.kind === "companies") companyIds.add(ref.recordId);
      if (ref.kind === "contacts") {
        const contact = this.get("contacts", ref.recordId);
        if (contact.companyId) companyIds.add(contact.companyId);
      }
      if (ref.kind === "networking")
        this.get("networking", ref.recordId).companies.forEach((c) =>
          companyIds.add(c.id),
        );
      if (ref.kind === "applications" || ref.kind === "offers") {
        const offer = this.get(
          "offers",
          ref.kind === "offers"
            ? ref.recordId
            : this.get("applications", ref.recordId).jobOfferId,
        );
        companyIds.add(offer.companyId);
        sources.add(offer.source);
      }
    }
    this.put("tasks", {
      ...task,
      columnId,
      completedAt: stamp,
      updatedAt: stamp,
    });
    this.put("taskCompletions", {
      id: randomUUID(),
      userId: task.userId,
      taskId: task.id,
      taskIdentity: task.id,
      companyIds: [...companyIds],
      sources: [...sources],
      title: task.title,
      sourceKind: task.sourceKind,
      sourceId: task.sourceId,
      completedAt: stamp,
    });
  }
  protected move(id: string, columnId: string, position: number) {
    const task = this.get("tasks", id),
      column = this.get("boardColumns", columnId);
    const ordered = this.all("tasks")
      .filter((t) => t.columnId === columnId && t.id !== id)
      .sort((a, b) => a.position - b.position);
    ordered.splice(Math.min(position, ordered.length), 0, task);
    ordered.forEach((t, index) => {
      const next = { ...t, columnId, position: index, updatedAt: now() };
      if (t.id === id && column.isDone && !t.completedAt)
        this.finish(next, columnId);
      else if (t.id === id && !column.isDone && t.completedAt)
        this.put("tasks", {
          ...next,
          completedAt: null,
          sourceKind: null,
          sourceId: null,
        });
      else this.put("tasks", next);
    });
  }
  protected remove(command: Extract<Command, { action: "delete" }>) {
    const { kind, id } = command,
      record = this.get(kind, id);
    if (
      kind === "companies" &&
      (this.all("offers").some((o) => o.companyId === id) ||
        this.all("contacts").some((c) => c.companyId === id) ||
        this.all("networking").some((n) =>
          n.companies.some((c) => c.id === id),
        ))
    )
      throw new Error(
        "Antes de borrar la empresa, elimina o desvincula sus ofertas, contactos y eventos.",
      );
    if (
      kind === "offers" &&
      this.all("applications").some((a) => a.jobOfferId === id)
    )
      throw new Error(
        "Esta oferta tiene candidaturas. Elimínalas o cambia su oferta antes.",
      );
    if (kind === "boardColumns") {
      if (this.all("boardColumns").length < 2)
        throw new Error("Mantén al menos una columna en el tablero.");
      if (command.moveTo === id)
        throw new Error("Elige otra columna de destino.");
      const tasks = this.all("tasks").filter((t) => t.columnId === id);
      if (tasks.length && !command.moveTo && !command.deleteTasks)
        throw new Error("Elige mover las tareas a otra columna o borrarlas.");
      if (command.moveTo) this.get("boardColumns", command.moveTo);
      tasks.forEach((t) =>
        command.moveTo
          ? this.put("tasks", {
              ...t,
              columnId: command.moveTo,
              position: this.all("tasks").filter(
                (x) => x.columnId === command.moveTo,
              ).length,
              updatedAt: now(),
            })
          : this.remove({ action: "delete", kind: "tasks", id: t.id }),
      );
      const remaining = this.all("boardColumns")
        .filter((c) => c.id !== id)
        .sort((a, b) => a.position - b.position);
      const done =
        remaining.find((c) => c.isDone)?.id ??
        command.moveTo ??
        remaining[remaining.length - 1].id;
      remaining.forEach((c, position) =>
        this.put("boardColumns", { ...c, position, isDone: c.id === done }),
      );
    }
    if (kind === "tasks") {
      this.all("taskCompletions")
        .filter((c) => c.taskId === id)
        .forEach((c) => this.put("taskCompletions", { ...c, taskId: null }));
    }
    if (kind === "contacts")
      this.all("networking")
        .filter((n) => n.contacts.some((c) => c.id === id))
        .forEach((n) =>
          this.put("networking", {
            ...n,
            contacts: n.contacts.filter((c) => c.id !== id),
            updatedAt: now(),
          }),
        );
    for (const task of this.all("tasks")) {
      if (task.sourceKind === kind && task.sourceId === id)
        this.put(
          "tasks",
          {
            ...task,
            links: task.links.filter(
              (l) => !(l.kind === kind && l.recordId === id),
            ),
            sourceKind: null,
            sourceId: null,
            updatedAt: now(),
          },
          "upsert",
        );
      else if (task.links.some((l) => l.kind === kind && l.recordId === id))
        this.put("tasks", {
          ...task,
          links: task.links.filter(
            (l) => !(l.kind === kind && l.recordId === id),
          ),
          updatedAt: now(),
        });
    }
    this.put(kind, record, "delete");
  }
}
