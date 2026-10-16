import { DatabaseSync } from "node:sqlite";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, existsSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { backupSchema } from "../../../../packages/domain/backup";
import { activitySchema } from "../../../../packages/domain/schemas";
import {
  defaultTechnologies,
  uniqueTechnologies,
} from "../../../../packages/domain/technologies";
import type {
  ImportSummary,
  Profile,
  Snapshot,
  Workspace,
} from "../shared/contracts";
import { RecordCipher } from "./crypto";
import {
  canonical,
  emptyWorkspace,
  mergeWorkspaces,
  wireWorkspace,
  withOwner,
  type SyncChoices,
  type SyncWorkspace,
} from "../../../../packages/domain/sync";
import type { SyncStatus } from "../shared/contracts";

export type SyncLink = {
  origin: string;
  userId: string;
  email: string;
  token: string | null;
  deviceId: string;
  expiresAt: string;
  revision: string | null;
  base: SyncWorkspace;
  remote: SyncWorkspace;
  choices: SyncChoices;
  lastSyncedAt?: string;
};

import {
  WorkspaceMutations,
  commandSchema,
  tables,
  type Table,
  type Row,
  type Stored,
} from "../../../../packages/domain/workspace-mutations";
const asWire = <T>(value: unknown): T => JSON.parse(JSON.stringify(value)) as T;
const now = () => new Date().toISOString();

/** Local repository. No network, credentials, Next.js or Postgres dependencies.
 * Each transaction stores revisions, tombstones and an encrypted outbox atomically.
 * Remote synchronization is optional and driven by the privileged SyncCoordinator.
 */
export class LocalStore extends WorkspaceMutations {
  private readonly db: DatabaseSync;
  private readonly cipher: RecordCipher;
  constructor(
    readonly directory: string,
    key: Buffer,
  ) {
    super();
    mkdirSync(directory, { recursive: true });
    this.cipher = new RecordCipher(key);
    this.db = new DatabaseSync(join(directory, "mappleo.sqlite"));
    try {
      this.db.exec(
        "PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;",
      );
      const version = this.db.prepare("PRAGMA user_version").get() as {
        user_version: number;
      };
      if (version.user_version > 1)
        throw new Error(
          "Estos datos pertenecen a una versión más reciente de Mappleo. Actualiza la aplicación.",
        );
      if (version.user_version === 0) {
        this.db.exec(`BEGIN IMMEDIATE;
        CREATE TABLE metadata (key TEXT PRIMARY KEY, value BLOB NOT NULL);
        CREATE TABLE records (kind TEXT NOT NULL, id TEXT NOT NULL, revision INTEGER NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT, data BLOB, PRIMARY KEY(kind,id));
        CREATE TABLE outbox (sequence INTEGER PRIMARY KEY AUTOINCREMENT, operation_id TEXT UNIQUE NOT NULL, device_id TEXT NOT NULL, kind TEXT NOT NULL, record_id TEXT NOT NULL, base_revision INTEGER NOT NULL, revision INTEGER NOT NULL, operation TEXT NOT NULL, happened_at TEXT NOT NULL, payload BLOB NOT NULL);
        CREATE INDEX records_live ON records(kind,deleted_at);
        PRAGMA user_version=1;
        COMMIT;`);
      }
      // Detect a wrong/lost key immediately; never silently replace unreadable data.
      this.profile();
    } catch (error) {
      this.db.close();
      throw error;
    }
  }
  protected meta<T>(key: string): T | undefined {
    const row = this.db
      .prepare("SELECT value FROM metadata WHERE key=?")
      .get(key) as { value: Uint8Array } | undefined;
    return row ? this.cipher.open<T>(row.value, "metadata:" + key) : undefined;
  }
  protected setMeta(key: string, value: unknown) {
    this.db
      .prepare(
        "INSERT INTO metadata(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      )
      .run(key, this.cipher.seal(value, "metadata:" + key));
  }
  profile(): Profile | null {
    return this.meta<Profile>("profile") ?? null;
  }
  protected requireProfile() {
    const profile = this.profile();
    if (!profile) throw new Error("Crea tu perfil local para empezar.");
    return profile;
  }
  all<K extends Table>(kind: K): Row<K>[] {
    const records = this.db
      .prepare(
        "SELECT id,data FROM records WHERE kind=? AND deleted_at IS NULL ORDER BY rowid",
      )
      .all(kind) as { id: string; data: Uint8Array }[];
    return records.map((row) =>
      this.cipher.open<Row<K>>(row.data, kind + ":" + row.id),
    );
  }
  protected get<K extends Table>(kind: K, id: string): Row<K> {
    const row = this.db
      .prepare(
        "SELECT data FROM records WHERE kind=? AND id=? AND deleted_at IS NULL",
      )
      .get(kind, id) as { data: Uint8Array } | undefined;
    if (!row) throw new Error("El registro ya no existe.");
    return this.cipher.open<Row<K>>(row.data, kind + ":" + id);
  }
  protected put<T extends { id: string; userId: string }>(
    kind: Table,
    record: T,
    operation: "upsert" | "delete" = "upsert",
  ) {
    const profile = this.requireProfile();
    if (record.userId !== profile.id)
      throw new Error("El registro no pertenece al perfil local.");
    const previous = this.db
      .prepare("SELECT revision FROM records WHERE kind=? AND id=?")
      .get(kind, record.id) as { revision: number } | undefined;
    const revision = (previous?.revision ?? 0) + 1,
      timestamp = now();
    const data =
      operation === "delete"
        ? null
        : this.cipher.seal(record, kind + ":" + record.id);
    this.db
      .prepare(
        "INSERT INTO records(kind,id,revision,updated_at,deleted_at,data) VALUES (?,?,?,?,?,?) ON CONFLICT(kind,id) DO UPDATE SET revision=excluded.revision,updated_at=excluded.updated_at,deleted_at=excluded.deleted_at,data=excluded.data",
      )
      .run(
        kind,
        record.id,
        revision,
        timestamp,
        operation === "delete" ? timestamp : null,
        data,
      );
    const operationId = randomUUID();
    this.db
      .prepare(
        "INSERT INTO outbox(operation_id,device_id,kind,record_id,base_revision,revision,operation,happened_at,payload) VALUES (?,?,?,?,?,?,?,?,?)",
      )
      .run(
        operationId,
        profile.deviceId,
        kind,
        record.id,
        revision - 1,
        revision,
        operation,
        timestamp,
        this.cipher.seal(
          operation === "delete" ? { id: record.id } : record,
          "outbox:" + operationId,
        ),
      );
  }
  exportBackup(): Workspace {
    return {
      version: 1,
      exportedAt: now(),
      ownerId: this.profile()?.id,
      companies: this.all("companies"),
      offers: this.all("offers"),
      applications: this.all("applications"),
      contacts: this.all("contacts"),
      networking: this.all("networking"),
      boardColumns: this.all("boardColumns"),
      tasks: this.all("tasks"),
      taskCompletions: this.all("taskCompletions"),
      technologyTags: this.meta<string[]>("technologies") ?? [
        ...defaultTechnologies,
      ],
    };
  }
  snapshot(): Snapshot {
    const count = this.db
      .prepare("SELECT COUNT(*) AS count FROM outbox")
      .get() as { count: number };
    return {
      profile: this.profile(),
      workspace: this.exportBackup(),
      dataPath: this.directory,
      pendingChanges: count.count,
      version: "0.1.1",
      sync: this.meta<SyncStatus>("sync-status") ?? {
        connected: false,
        phase: "disconnected",
        conflicts: [],
      },
    };
  }
  portableBackup(): Workspace {
    const workspace = this.exportBackup(),
      link = this.connection();
    // Once linked, exports keep the account's IDs/owner so importing back into
    // that same web account does not namespace already-synchronized records.
    return link ? withOwner(workspace, link.userId) : workspace;
  }
  private transaction<T>(work: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = work();
      backupSchema.parse(this.exportBackup());
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  connection(): SyncLink | undefined {
    return this.meta<SyncLink>("sync-link");
  }
  setConnection(link: SyncLink) {
    this.setMeta("sync-link", link);
  }
  syncStatus(status: SyncStatus) {
    this.setMeta("sync-status", status);
  }
  syncSequence() {
    return (
      this.db
        .prepare("SELECT COALESCE(MAX(sequence),0) AS n FROM outbox")
        .get() as { n: number }
    ).n;
  }
  pendingRevocations(): { origin: string; token: string }[] {
    return this.meta("sync-revocations") ?? [];
  }
  setRevocations(items: { origin: string; token: string }[]) {
    this.setMeta("sync-revocations", items);
  }
  /** Direct remote apply never creates upload operations or changes the local profile identity. */
  private replaceWorkspace(workspace: SyncWorkspace) {
    const valid = wireWorkspace(workspace);
    for (const kind of tables) {
      const previous = new Map(this.all(kind).map((row) => [row.id, row]));
      const live = new Map((valid[kind] ?? []).map((row) => [row.id, row]));
      for (const row of this.all(kind))
        if (!live.has(row.id))
          this.db
            .prepare(
              "UPDATE records SET data=NULL,deleted_at=?,revision=revision+1 WHERE kind=? AND id=?",
            )
            .run(now(), kind, row.id);
      for (const record of live.values()) {
        const old = previous.get(record.id);
        if (
          old &&
          canonical(old) === canonical(record) &&
          (old as Stored).updatedAt === (record as Stored).updatedAt
        )
          continue;
        this.db
          .prepare(
            "INSERT INTO records(kind,id,revision,updated_at,deleted_at,data) VALUES (?,?,1,?,NULL,?) ON CONFLICT(kind,id) DO UPDATE SET revision=records.revision+1,updated_at=excluded.updated_at,deleted_at=NULL,data=excluded.data",
          )
          .run(
            kind,
            record.id,
            now(),
            this.cipher.seal(record, kind + ":" + record.id),
          );
      }
    }
    this.setMeta("technologies", valid.technologyTags ?? []);
  }
  bindAccount(
    account: {
      userId: string;
      email: string;
      origin: string;
      token: string;
      deviceId: string;
      expiresAt: string;
    },
    remote: SyncWorkspace,
    revision: string,
  ) {
    const profile = this.requireProfile(),
      previous = this.connection();
    if (
      previous &&
      (previous.userId !== account.userId || previous.origin !== account.origin)
    )
      throw new Error(
        "Este perfil local ya está asociado a otra cuenta o servidor. Reconecta la misma cuenta para no mezclar datos.",
      );
    this.backup("antes-vincular");
    this.transaction(() => {
      if (!previous) {
        const local = this.exportBackup(),
          mappings = new Map<string, string>();
        // Recognize the deterministic IDs of previously imported web backups.
        for (const kind of tables)
          for (const row of remote[kind] ?? []) {
            const imported =
              "import_" +
              createHash("sha256")
                .update(account.userId + ":" + row.id)
                .digest("hex")
                .slice(0, 40);
            if ((local[kind] ?? []).some((r) => r.id === imported))
              mappings.set(imported, row.id);
          }
        for (const column of local.boardColumns ?? []) {
          const target = remote.boardColumns?.find(
            (c) => c.systemKey && c.systemKey === column.systemKey,
          );
          if (target) {
            const original = this.db
              .prepare(
                "SELECT revision FROM records WHERE kind='boardColumns' AND id=?",
              )
              .get(column.id) as { revision: number } | undefined;
            mappings.set(column.id, target.id);
            // Factory defaults are not user edits. Adopt the web defaults on
            // first link; genuinely renamed/reordered columns still conflict.
            if (original?.revision === 1) {
              column.name = target.name;
              column.position = target.position;
              column.isDone = target.isDone;
            }
          }
        }
        const mapId = (id: string) => mappings.get(id) ?? id;
        for (const task of local.tasks ?? []) {
          const target = remote.tasks?.find(
            (t) =>
              !t.completedAt &&
              !task.completedAt &&
              t.sourceKind &&
              t.sourceKind === task.sourceKind &&
              t.sourceId === mapId(task.sourceId ?? ""),
          );
          if (target) mappings.set(task.id, target.id);
        }
        for (const application of local.applications)
          for (const event of application.events) {
            const target = remote.applications
              .flatMap((a) => a.events)
              .find(
                (e) =>
                  "import_" +
                    createHash("sha256")
                      .update(account.userId + ":" + e.id)
                      .digest("hex")
                      .slice(0, 40) ===
                  event.id,
              );
            if (target) mappings.set(event.id, target.id);
          }
        for (const kind of tables)
          for (const row of local[kind] ?? []) {
            const record = row as unknown as Record<string, unknown>;
            record.id = mapId(row.id);
            for (const key of [
              "companyId",
              "jobOfferId",
              "columnId",
              "sourceId",
              "taskId",
              "taskIdentity",
            ])
              if (typeof record[key] === "string")
                record[key] = mapId(record[key]);
            if (kind === "applications")
              record.events = (row as Row<"applications">).events.map((e) => ({
                ...e,
                id: mapId(e.id),
                applicationId: row.id,
              }));
            if (kind === "networking")
              for (const key of ["companies", "contacts"] as const)
                record[key] = (row as Row<"networking">)[key].map((ref) => ({
                  id: mapId(ref.id),
                }));
            if (kind === "tasks")
              record.links = (row as Row<"tasks">).links.map((link) => ({
                ...link,
                recordId: mapId(link.recordId),
              }));
            if (kind === "taskCompletions")
              record.companyIds = ((record.companyIds as string[]) ?? []).map(
                mapId,
              );
          }
        this.replaceWorkspace(local);
      }
      const localRemote = withOwner(remote, profile.id);
      this.setConnection({
        ...account,
        revision,
        base: previous?.base ?? emptyWorkspace(profile.id),
        remote: localRemote,
        choices: previous?.choices ?? {},
        lastSyncedAt: previous?.lastSyncedAt,
      });
    });
  }
  rememberRemote(remote: SyncWorkspace, revision: string) {
    const link = this.connection();
    if (!link) return;
    this.setConnection({
      ...link,
      remote: withOwner(remote, this.requireProfile().id),
      revision,
    });
  }
  chooseConflict(
    key: string,
    choice: "local" | "remote",
    local: unknown,
    remote: unknown,
  ) {
    const link = this.connection();
    if (!link?.token)
      throw new Error("Conecta tu cuenta antes de resolver discrepancias.");
    this.setConnection({
      ...link,
      choices: {
        ...link.choices,
        [key]: { choice, local: canonical(local), remote: canonical(remote) },
      },
    });
  }
  acceptSynced(
    remote: SyncWorkspace,
    revision: string,
    sent: SyncWorkspace,
    sequence: number,
  ) {
    const link = this.connection();
    if (!link?.token) return;
    const localRemote = withOwner(remote, this.requireProfile().id),
      current = this.exportBackup();
    const rebased = mergeWorkspaces(sent, current, localRemote);
    this.transaction(() => {
      // If the user edited during the request, never replace those newer edits.
      if (!rebased.conflicts.length) this.replaceWorkspace(rebased.workspace);
      this.setConnection({
        ...link,
        base: rebased.conflicts.length ? sent : localRemote,
        remote: localRemote,
        revision,
        choices: {},
        lastSyncedAt: now(),
      });
      this.db.prepare("DELETE FROM outbox WHERE sequence<=?").run(sequence);
    });
  }
  disconnect() {
    const link = this.connection();
    if (link?.token) {
      this.setRevocations(
        [
          ...this.pendingRevocations(),
          { origin: link.origin, token: link.token },
        ].slice(-10),
      );
      this.setConnection({ ...link, token: null, choices: {} });
    }
    this.syncStatus({
      connected: false,
      phase: "disconnected",
      conflicts: [],
      revocationPending: this.pendingRevocations().length > 0,
    });
  }
  command(raw: unknown): Snapshot {
    if (JSON.stringify(raw).length > 150000)
      throw new Error("La operación es demasiado grande.");
    const command = commandSchema.parse(raw);
    this.transaction(() => {
      if (command.action === "profile") {
        const old = this.profile();
        this.setMeta(
          "profile",
          old
            ? { ...old, name: command.name }
            : {
                id: randomUUID(),
                deviceId: randomUUID(),
                name: command.name,
                createdAt: now(),
              },
        );
        if (!old) this.ensureColumns();
        return;
      }
      this.requireProfile();
      if (command.action === "save")
        this.save(command.kind, command.id, command.input);
      if (command.action === "delete") this.remove(command);
      if (command.action === "moveTask")
        this.move(command.id, command.columnId, command.position);
      if (command.action === "complete") {
        const task =
          command.kind === "tasks"
            ? this.get("tasks", command.id)
            : this.all("tasks").find(
                (t) =>
                  t.sourceKind === command.kind &&
                  t.sourceId === command.id &&
                  !t.completedAt,
              );
        if (!task) throw new Error("Este paso ya no está pendiente.");
        if (!task.completedAt) this.finish(task, this.doneColumn().id);
      }
      if (command.action === "activity") {
        const activity = asWire<Record<string, unknown>>(
          activitySchema.parse(command),
        );
        const application = this.get("applications", command.applicationId);
        application.events.push({
          ...activity,
          id: randomUUID(),
          applicationId: application.id,
          createdAt: now(),
          fromStatus: null,
          toStatus: null,
        } as Workspace["applications"][number]["events"][number]);
        this.put("applications", { ...application, updatedAt: now() });
      }
      if (command.action === "deleteActivity") {
        const application = this.get("applications", command.applicationId);
        this.put("applications", {
          ...application,
          events: application.events.filter((e) => e.id !== command.id),
          updatedAt: now(),
        });
      }
    });
    return this.snapshot();
  }
  resetLocalProfile() {
    // Do NOT create tombstones: resetting this computer must never erase the web account.
    this.disconnect();
    this.transaction(() => {
      this.db.exec(
        "DELETE FROM outbox; DELETE FROM records; DELETE FROM metadata WHERE key <> 'sync-revocations';",
      );
    });
    this.db.exec("PRAGMA wal_checkpoint(TRUNCATE); VACUUM;");
    const dir = join(this.directory, "backups");
    if (existsSync(dir))
      for (const name of readdirSync(dir)) {
        if (
          /^mappleo-(automatico|antes-importar|antes-vincular|antes-resolver)-[\dTZ-]+\.sqlite$/.test(
            name,
          )
        )
          unlinkSync(join(dir, name));
      }
  }
  importBackup(raw: unknown): ImportSummary {
    this.requireProfile();
    const backup = asWire<Workspace>(backupSchema.parse(raw));
    const owner =
        backup.ownerId ??
        tables.map((kind) => backup[kind]?.[0]?.userId).find(Boolean) ??
        "empty-backup",
      localOwner = this.requireProfile().id;
    const mapId = (id: string) =>
      owner === localOwner || owner === this.connection()?.userId
        ? id
        : "import_" +
          createHash("sha256")
            .update(owner + ":" + id)
            .digest("hex")
            .slice(0, 40);
    const summary = { added: 0, updated: 0, skipped: 0 };
    this.transaction(() => {
      for (const kind of tables) {
        for (const rawRecord of backup[kind] ?? []) {
          const record: Stored = {
            ...rawRecord,
            id: mapId(rawRecord.id),
            userId: localOwner,
          };
          for (const key of [
            "companyId",
            "jobOfferId",
            "columnId",
            "sourceId",
            "taskId",
            "taskIdentity",
          ] as const)
            if (typeof record[key] === "string")
              record[key] = mapId(record[key]);
          if (kind === "boardColumns" && record.systemKey) {
            const previous = this.all("boardColumns").find(
              (c) => c.systemKey === record.systemKey,
            );
            if (previous) record.id = previous.id;
          }
          if (kind === "tasks") {
            const sourceColumn = backup.boardColumns?.find(
              (c) =>
                c.id === rawRecord.id ||
                c.id === (rawRecord as Row<"tasks">).columnId,
            );
            if (sourceColumn?.systemKey)
              record.columnId =
                this.all("boardColumns").find(
                  (c) => c.systemKey === sourceColumn.systemKey,
                )?.id ?? record.columnId;
            record.links = (rawRecord as Row<"tasks">).links.map((l) => ({
              ...l,
              recordId: mapId(l.recordId),
            }));
          }
          if (kind === "applications")
            record.events = (rawRecord as Row<"applications">).events.map(
              (e) => ({ ...e, id: mapId(e.id), applicationId: record.id }),
            );
          if (kind === "networking")
            for (const key of ["companies", "contacts"] as const)
              record[key] = (rawRecord as Row<"networking">)[key].map(
                (ref) => ({ id: mapId(ref.id) }),
              );
          if (kind === "taskCompletions")
            record.companyIds = ((record.companyIds as string[]) ?? []).map(
              mapId,
            );
          const previous = this.db
            .prepare(
              "SELECT data,deleted_at,revision FROM records WHERE kind=? AND id=?",
            )
            .get(kind, record.id) as
            | {
                data: Uint8Array | null;
                deleted_at: string | null;
                revision: number;
              }
            | undefined;
          if (previous) {
            // A stale backup must never resurrect a record the user has deleted.
            if (previous.deleted_at) {
              summary.skipped++;
              continue;
            }
            const value = this.cipher.open<Stored>(
              previous.data!,
              kind + ":" + record.id,
            );
            const modified = record.updatedAt ?? record.createdAt;
            if (
              kind === "boardColumns"
                ? previous.revision > 1
                : !modified ||
                  (value.updatedAt ?? value.createdAt ?? "") >= modified
            ) {
              summary.skipped++;
              continue;
            }
            summary.updated++;
          } else summary.added++;
          this.put(kind, record);
        }
      }
      this.ensureColumns();
      this.setMeta(
        "technologies",
        uniqueTechnologies([
          ...(this.meta<string[]>("technologies") ?? defaultTechnologies),
          ...(backup.technologyTags ?? []),
          ...backup.offers.flatMap((o) => o.technologies),
        ])
          .map((t) => t.name)
          .slice(0, 500),
      );
    });
    return summary;
  }
  backup(label = "automatico") {
    const dir = join(this.directory, "backups");
    mkdirSync(dir, { recursive: true });
    const date = now().replace(/[:.]/g, "-");
    const file = join(dir, `mappleo-${label}-${date}.sqlite`);
    this.db.prepare("VACUUM INTO ?").run(file);
    // Backups are encrypted with the same device key. Keep the latest 10.
    const files = readdirSync(dir)
      .filter((f) =>
        /^mappleo-(automatico|antes-importar|antes-vincular|antes-resolver)-[\dTZ-]+\.sqlite$/.test(
          f,
        ),
      )
      .sort((a, b) =>
        a.slice(a.search(/\d{4}-/)).localeCompare(b.slice(b.search(/\d{4}-/))),
      );
    for (const name of files.slice(0, Math.max(0, files.length - 10))) {
      const target = join(dir, name);
      if (existsSync(target)) unlinkSync(target);
    }
    return file;
  }
  close() {
    this.db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    this.db.close();
  }
  /** Diagnostic counts only; payload/keys are deliberately not exposed over IPC. */
  diagnostics() {
    return {
      tombstones: (
        this.db
          .prepare(
            "SELECT COUNT(*) AS n FROM records WHERE deleted_at IS NOT NULL",
          )
          .get() as { n: number }
      ).n,
      operations: (
        this.db.prepare("SELECT COUNT(*) AS n FROM outbox").get() as {
          n: number;
        }
      ).n,
    };
  }
}
