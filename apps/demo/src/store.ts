import { backupSchema } from "../../../packages/domain/backup";
import { activitySchema } from "../../../packages/domain/schemas";
import {
  commandSchema,
  WorkspaceMutations,
  tables,
  type Row,
  type Table,
} from "../../../packages/domain/workspace-mutations";
import type { Profile, Workspace } from "../../../packages/domain/workspace";
import { createDemoWorkspace } from "./seed";

export const DEMO_TTL = 30 * 60 * 1000;
export class DemoStore extends WorkspaceMutations {
  private data: Workspace;
  readonly cacheKey: string;
  expiresAt: number;
  cacheAvailable = true;
  constructor(
    private readonly language: "es" | "en",
    private readonly storage?: Pick<
      Storage,
      "getItem" | "setItem" | "removeItem"
    >,
    private readonly clock = () => Date.now(),
  ) {
    super();
    this.cacheKey = `mappleo-portfolio-demo-v1-${language}`;
    this.expiresAt = clock() + DEMO_TTL;
    this.data = createDemoWorkspace(language, new Date(clock()));
    try {
      const raw = storage?.getItem(this.cacheKey);
      if (raw && raw.length < 4_000_000) {
        const cached = JSON.parse(raw);
        if (
          Number.isFinite(cached.expiresAt) &&
          cached.expiresAt > clock() &&
          cached.expiresAt <= clock() + DEMO_TTL
        ) {
          const valid = backupSchema.parse(cached.data);
          if (
            valid.ownerId !== "demo-john-miller" ||
            tables.some((kind) =>
              valid[kind]?.some((row) => row.userId !== "demo-john-miller"),
            )
          )
            throw Error("Invalid demo owner");
          this.data = JSON.parse(JSON.stringify(valid)) as Workspace;
          this.expiresAt = cached.expiresAt;
        } else storage?.removeItem(this.cacheKey);
      }
    } catch {
      this.cacheAvailable = false;
      try {
        storage?.removeItem(this.cacheKey);
      } catch {
        /* Memory-only demo still works. */
      }
    }
  }
  expired() {
    return this.clock() >= this.expiresAt;
  }
  snapshot(): Workspace {
    return structuredClone(this.data);
  }
  reset() {
    this.data = createDemoWorkspace(this.language, new Date(this.clock()));
    this.expiresAt = this.clock() + DEMO_TTL;
    this.persist();
    return this.snapshot();
  }
  protected requireProfile(): Profile {
    return {
      id: "demo-john-miller",
      name: "John Miller",
      deviceId: "browser-demo",
      createdAt: this.data.exportedAt,
    };
  }
  protected all<K extends Table>(kind: K): Row<K>[] {
    return (this.data[kind] ?? []) as Row<K>[];
  }
  protected get<K extends Table>(kind: K, id: string): Row<K> {
    const row = this.all(kind).find((r) => r.id === id);
    if (!row) throw Error("El registro ya no existe.");
    return row;
  }
  protected put<T extends { id: string; userId: string }>(
    kind: Table,
    record: T,
    operation: "upsert" | "delete" = "upsert",
  ) {
    if (record.userId !== this.requireProfile().id)
      throw Error("Invalid demo owner");
    const rows = this.all(kind),
      index = rows.findIndex((row) => row.id === record.id);
    if (operation === "delete") {
      if (index >= 0) rows.splice(index, 1);
    } else if (index >= 0) rows[index] = record as unknown as Row<typeof kind>;
    else rows.push(record as unknown as Row<typeof kind>);
    Object.assign(this.data, { [kind]: rows });
  }
  protected meta<T>(key: string): T | undefined {
    return key === "technologies" ? (this.data.technologyTags as T) : undefined;
  }
  protected setMeta(key: string, value: unknown) {
    if (key === "technologies") this.data.technologyTags = value as string[];
  }
  command(raw: unknown) {
    if (this.expired()) {
      this.reset();
      throw Error(
        "La demo ha caducado. Se han restaurado los datos de ejemplo.",
      );
    }
    if (JSON.stringify(raw).length > 150000)
      throw Error("La operación es demasiado grande.");
    const command = commandSchema.parse(raw),
      before = this.snapshot();
    try {
      if (command.action === "profile")
        throw Error("Esta demo no tiene cuentas reales.");
      if (command.action === "save")
        this.save(command.kind, command.id, command.input);
      if (command.action === "delete") this.remove(command);
      if (command.action === "moveTask")
        this.move(command.id, command.columnId, command.position);
      if (command.action === "complete") {
        if (command.kind !== "tasks")
          throw Error("Completa una tarea del Kanban.");
        const task = this.get("tasks", command.id);
        if (!task.completedAt) this.finish(task, this.doneColumn().id);
      }
      if (command.action === "activity") {
        const fields = JSON.parse(
          JSON.stringify(activitySchema.parse(command)),
        );
        const app = this.get("applications", command.applicationId);
        app.events.push({
          ...fields,
          id: crypto.randomUUID(),
          applicationId: app.id,
          createdAt: new Date(this.clock()).toISOString(),
          fromStatus: null,
          toStatus: null,
        });
      }
      if (command.action === "deleteActivity") {
        const app = this.get("applications", command.applicationId);
        app.events = app.events.filter((e) => e.id !== command.id);
      }
      if (
        tables.reduce((count, kind) => count + this.all(kind).length, 0) > 1500
      )
        throw Error(
          "Límite de la demo alcanzado. Reinicia los datos para seguir probando.",
        );
      backupSchema.parse(this.data); // Includes foreign keys, safe URLs and field limits.
      this.persist();
      return this.snapshot();
    } catch (error) {
      this.data = before;
      throw error;
    }
  }
  private persist() {
    try {
      this.storage?.setItem(
        this.cacheKey,
        JSON.stringify({ expiresAt: this.expiresAt, data: this.data }),
      );
    } catch {
      this.cacheAvailable = false; /* Keep changes in memory if browser storage is disabled/full. */
    }
  }
}
