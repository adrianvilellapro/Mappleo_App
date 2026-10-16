import { backupSchema, type Backup } from "./backup";
import { z } from "zod";

type Wire<T> = T extends Date
  ? string
  : T extends (infer I)[]
    ? Wire<I>[]
    : T extends object
      ? { [K in keyof T]: Wire<T[K]> }
      : T;
export type SyncWorkspace = Wire<Backup>;
export const syncSections = [
  "companies",
  "offers",
  "applications",
  "contacts",
  "networking",
  "boardColumns",
  "tasks",
  "taskCompletions",
] as const;
export type SyncSection = (typeof syncSections)[number];
export type SyncRecord = { id: string; userId: string; [key: string]: unknown };
export type SyncConflict = {
  key: string;
  section: SyncSection | "workspace";
  id: string;
  label: string;
  local: SyncRecord | SyncWorkspace | null;
  remote: SyncRecord | SyncWorkspace | null;
  reason: "modified" | "deleted" | "relations";
};
export type SyncChoice = {
  local: string;
  remote: string;
  choice: "local" | "remote";
};
export type SyncChoices = Record<string, SyncChoice>;
const syncWorkspaceSchema = backupSchema.superRefine((workspace, context) => {
  const reminders = new Set<string>();
  for (const task of workspace.tasks ?? [])
    if (!task.completedAt && task.sourceKind && task.sourceId) {
      const key = task.sourceKind + ":" + task.sourceId;
      if (reminders.has(key))
        context.addIssue({
          code: "custom",
          message: "Hay dos recordatorios activos para el mismo registro.",
        });
      reminders.add(key);
    }
});
const syncId = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-zA-Z0-9_:-]+$/);
export const syncPatchSchema = z
  .object({
    upserts: z.record(
      z.enum(syncSections),
      z.array(z.record(z.string(), z.unknown())).max(4000),
    ),
    deletes: z.record(z.enum(syncSections), z.array(syncId).max(4000)),
    technologyTags: z.array(z.string().min(1).max(100)).max(500).optional(),
  })
  .strict();
export type SyncPatch = z.infer<typeof syncPatchSchema>;
export function workspacePatch(
  before: SyncWorkspace,
  after: SyncWorkspace,
): SyncPatch {
  const patch: SyncPatch = {
    upserts: Object.fromEntries(
      syncSections.map((s) => [s, []]),
    ) as unknown as SyncPatch["upserts"],
    deletes: Object.fromEntries(
      syncSections.map((s) => [s, []]),
    ) as unknown as SyncPatch["deletes"],
  };
  for (const section of syncSections) {
    const previous = new Map(
      (before[section] ?? []).map((row) => [row.id, row]),
    );
    const next = new Map((after[section] ?? []).map((row) => [row.id, row]));
    patch.upserts[section] = [...next.values()].filter(
      (row) => canonical(row) !== canonical(previous.get(row.id)),
    ) as unknown as Record<string, unknown>[];
    patch.deletes[section] = [...previous.keys()].filter((id) => !next.has(id));
  }
  if (
    canonical(before.technologyTags ?? []) !==
    canonical(after.technologyTags ?? [])
  )
    patch.technologyTags = after.technologyTags ?? [];
  return patch;
}
export function applyWorkspacePatch(
  before: SyncWorkspace,
  patch: SyncPatch,
): SyncWorkspace {
  const workspace = structuredClone(before);
  for (const section of syncSections) {
    const records = new Map(
      (workspace[section] ?? []).map((row) => [row.id, row as SyncRecord]),
    );
    for (const id of patch.deletes[section]) records.delete(id);
    for (const row of patch.upserts[section]) {
      if (typeof row.id !== "string")
        throw new Error("Identificador de sincronización no válido.");
      records.set(row.id, row as SyncRecord);
    }
    Object.assign(workspace, { [section]: [...records.values()] });
  }
  if (patch.technologyTags) workspace.technologyTags = patch.technologyTags;
  return wireWorkspace(workspace);
}

export function wireWorkspace(value: unknown): SyncWorkspace {
  return JSON.parse(
    JSON.stringify(
      syncWorkspaceSchema.parse(JSON.parse(JSON.stringify(value))),
    ),
  ) as SyncWorkspace;
}
export function emptyWorkspace(ownerId: string): SyncWorkspace {
  return {
    version: 1,
    exportedAt: new Date(0).toISOString(),
    ownerId,
    companies: [],
    offers: [],
    applications: [],
    contacts: [],
    networking: [],
    boardColumns: [],
    tasks: [],
    taskCompletions: [],
    technologyTags: [],
  };
}
/** Ignore transport/Prisma timestamps and collection order.
 * Actual user-entered fields (including events and completion dates) remain significant. */
export function canonical(value: unknown): string {
  function normalize(v: unknown): unknown {
    if (v instanceof Date) return v.toISOString();
    if (Array.isArray(v))
      return v
        .map(normalize)
        .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    if (v && typeof v === "object")
      return Object.fromEntries(
        Object.entries(v)
          .filter(
            ([k]) => !["updatedAt", "exportedAt", "sourceKey"].includes(k),
          )
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, item]) => [k, normalize(item)]),
      );
    return v;
  }
  return JSON.stringify(normalize(value ?? null));
}
export function withOwner(
  workspace: SyncWorkspace,
  userId: string,
): SyncWorkspace {
  const result = structuredClone(workspace);
  result.ownerId = userId;
  for (const section of syncSections)
    for (const row of result[section] ?? []) row.userId = userId;
  return result;
}
export function mergeWorkspaces(
  base: SyncWorkspace,
  local: SyncWorkspace,
  remote: SyncWorkspace,
  choices: SyncChoices = {},
) {
  const merged = emptyWorkspace(local.ownerId!);
  const conflicts: SyncConflict[] = [];
  const wholeChoice = choices.workspace;
  if (
    wholeChoice &&
    wholeChoice.local === canonical(local) &&
    wholeChoice.remote === canonical(remote)
  ) {
    return {
      workspace: structuredClone(
        wholeChoice.choice === "local" ? local : remote,
      ),
      conflicts,
    };
  }
  for (const section of syncSections) {
    const map = (w: SyncWorkspace) =>
      new Map((w[section] ?? []).map((row) => [row.id, row as SyncRecord]));
    const b = map(base),
      l = map(local),
      r = map(remote),
      output: SyncRecord[] = [];
    for (const id of new Set([...b.keys(), ...l.keys(), ...r.keys()])) {
      const before = b.get(id) ?? null,
        left = l.get(id) ?? null,
        right = r.get(id) ?? null;
      const ls = canonical(left),
        rs = canonical(right),
        bs = canonical(before),
        key = section + ":" + id;
      let selected: SyncRecord | null;
      if (ls === rs) selected = right;
      else if (ls === bs) selected = right;
      else if (rs === bs) selected = left;
      else {
        const choice = choices[key];
        if (choice?.local === ls && choice.remote === rs)
          selected = choice.choice === "local" ? left : right;
        else {
          selected = left;
          const label = String(
            left?.name ?? left?.title ?? right?.name ?? right?.title ?? id,
          );
          conflicts.push({
            key,
            section,
            id,
            label,
            local: left,
            remote: right,
            reason: !left || !right ? "deleted" : "modified",
          });
        }
      }
      if (selected) output.push(structuredClone(selected));
    }
    Object.assign(merged, { [section]: output });
  }
  // Technologies are an account vocabulary: union preserves independently added tags.
  merged.technologyTags = [
    ...new Map(
      [...(remote.technologyTags ?? []), ...(local.technologyTags ?? [])].map(
        (t) => [t.toLocaleLowerCase("es"), t],
      ),
    ).values(),
  ];
  merged.exportedAt = new Date().toISOString();
  if (!conflicts.length) {
    const valid = syncWorkspaceSchema.safeParse(merged);
    if (!valid.success)
      conflicts.push({
        key: "workspace",
        section: "workspace",
        id: "workspace",
        label: "Registros relacionados",
        local,
        remote,
        reason: "relations",
      });
    else return { workspace: wireWorkspace(valid.data), conflicts };
  }
  return { workspace: merged, conflicts };
}
