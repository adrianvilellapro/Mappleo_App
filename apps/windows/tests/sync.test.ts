import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes, createHash } from "node:crypto";
import { LocalStore } from "../src/main/store";
import { SyncCoordinator, SyncHttpError, serverOrigin } from "../src/main/sync";
import {
  canonical,
  emptyWorkspace,
  mergeWorkspaces,
  withOwner,
  type SyncWorkspace,
  type SyncPatch,
  applyWorkspacePatch,
  workspacePatch,
} from "../../../packages/domain/sync";

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "mappleo-sync-test-")),
    key = randomBytes(32),
    store = new LocalStore(directory, key);
  store.command({ action: "profile", name: "John local" });
  let remote = withOwner(store.exportBackup(), "web-owner"),
    revision = 1;
  for (const c of remote.boardColumns ?? []) {
    c.id = "web-column-" + c.systemKey;
    c.name =
      c.systemKey === "todo"
        ? "Por hacer"
        : c.systemKey === "doing"
          ? "En curso"
          : "Completadas";
    c.position = c.systemKey === "todo" ? 0 : c.systemKey === "doing" ? 1 : 2;
  }
  const token = randomBytes(32).toString("base64url");
  const traffic: string[] = [];
  const uploads: SyncPatch[] = [];
  const transport = async (
    _origin: string,
    path: string,
    supplied?: string,
    body?: unknown,
  ) => {
    traffic.push(path);
    assert.equal(supplied, token);
    if (path === "/api/desktop/revoke") return { ok: true };
    if (body) {
      const input = body as { revision: string; changes: SyncPatch };
      uploads.push(structuredClone(input.changes));
      if (input.revision !== String(revision))
        throw new SyncHttpError("Changed", 409);
      const previous = remote;
      remote = applyWorkspacePatch(remote, input.changes);
      revision++;
      return {
        revision: String(revision),
        changes: workspacePatch(previous, remote),
      };
    }
    return new URL(path, "https://mappleo.vercel.app").searchParams.get(
      "revision",
    ) === String(revision)
      ? { revision: String(revision) }
      : { revision: String(revision), workspace: structuredClone(remote) };
  };
  store.bindAccount(
    {
      origin: "https://mappleo.vercel.app",
      userId: "web-owner",
      email: "john@example.test",
      token,
      deviceId: "device-one",
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    },
    remote,
    String(revision),
  );
  const coordinator = new SyncCoordinator(
    store,
    "https://mappleo.vercel.app",
    async () => {},
    () => {},
    transport,
  );
  return {
    store,
    coordinator,
    transport,
    token,
    traffic,
    uploads,
    key,
    directory,
    get remote() {
      return remote;
    },
    editRemote(fn: (w: SyncWorkspace) => void) {
      fn(remote);
      revision++;
    },
    close() {
      coordinator.stop();
      store.close();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}
function addCompany(store: LocalStore, name: string) {
  store.command({
    action: "save",
    kind: "companies",
    input: {
      name,
      websiteUrl: "",
      careersUrl: "",
      linkedinUrl: "",
      location: "",
      sector: "",
      workMode: "REMOTE",
      interestRating: 3,
      notes: "",
      tags: [],
    },
  });
  return store.all("companies").at(-1)!;
}
function editCompany(store: LocalStore, id: string, name: string) {
  const row = store.all("companies").find((c) => c.id === id)!;
  store.command({
    action: "save",
    kind: "companies",
    id,
    input: { ...row, name },
  });
}

test("uploads automatically prepared changes and downloads subsequent web edits without echoes", async () => {
  const f = fixture();
  try {
    const company = addCompany(f.store, "Empresa local");
    await f.coordinator.synchronize();
    assert.equal(f.remote.companies[0].id, company.id);
    assert.equal(f.remote.companies[0].userId, "web-owner");
    assert.equal(f.uploads[0].upserts.companies.length, 1);
    assert.equal(f.uploads[0].upserts.boardColumns.length, 0);
    assert.equal(f.store.snapshot().pendingChanges, 0);
    f.editRemote((w) => {
      w.companies[0].name = "Cambio en la web";
    });
    await f.coordinator.synchronize();
    assert.equal(f.store.all("companies")[0].name, "Cambio en la web");
    assert.equal(f.store.snapshot().pendingChanges, 0);
    const count = f.remote.companies.length;
    await f.coordinator.synchronize();
    assert.equal(f.remote.companies.length, count);
    assert.equal(f.store.snapshot().sync.phase, "synced");
    assert.equal(f.store.all("boardColumns").length, 3);
    assert.ok(!JSON.stringify(f.store.snapshot()).includes(f.token));
    assert.equal(f.store.portableBackup().ownerId, "web-owner");
    assert.equal(f.store.portableBackup().companies[0].id, company.id);
    assert.equal(f.store.importBackup(f.store.portableBackup()).added, 0);
  } finally {
    f.close();
  }
});
test("simultaneous edits require an explicit choice, and changed versions invalidate stale choices", async () => {
  const f = fixture();
  try {
    const c = addCompany(f.store, "Original");
    await f.coordinator.synchronize();
    editCompany(f.store, c.id, "Windows");
    f.editRemote((w) => {
      w.companies[0].name = "Web";
    });
    await f.coordinator.synchronize();
    assert.equal(f.store.snapshot().sync.phase, "conflicts");
    assert.equal(f.store.all("companies")[0].name, "Windows");
    assert.equal(f.remote.companies[0].name, "Web");
    const conflict = f.store.snapshot().sync.conflicts[0];
    await f.coordinator.resolve(conflict.key, "local");
    f.editRemote((w) => {
      w.companies[0].name = "Web más reciente";
    });
    await f.coordinator.synchronize();
    assert.equal(f.store.snapshot().sync.phase, "conflicts");
    await f.coordinator.resolve(conflict.key, "remote");
    await f.coordinator.synchronize();
    assert.equal(f.store.all("companies")[0].name, "Web más reciente");
    assert.equal(f.store.snapshot().sync.phase, "synced");
  } finally {
    f.close();
  }
});
test("delete versus edit is a conflict, and acknowledged deletes do not resurrect", async () => {
  const f = fixture();
  try {
    const c = addCompany(f.store, "Original");
    await f.coordinator.synchronize();
    f.store.command({ action: "delete", kind: "companies", id: c.id });
    f.editRemote((w) => {
      w.companies[0].notes = "Actualización remota";
    });
    await f.coordinator.synchronize();
    assert.equal(f.store.snapshot().sync.conflicts[0].reason, "deleted");
    await f.coordinator.resolve("companies:" + c.id, "local");
    await f.coordinator.synchronize();
    assert.equal(f.remote.companies.length, 0);
    await f.coordinator.synchronize();
    assert.equal(f.store.all("companies").length, 0);
  } finally {
    f.close();
  }
});
test("offline changes remain local, reconnect catches up, and disconnect preserves data and revokes only this device", async () => {
  const f = fixture();
  let offline = true;
  const coordinator = new SyncCoordinator(
    f.store,
    "https://mappleo.vercel.app",
    async () => {},
    () => {},
    async (...args) => {
      if (offline) throw new Error("network down");
      return f.transport(...args);
    },
  );
  try {
    addCompany(f.store, "Offline");
    await coordinator.synchronize();
    assert.equal(f.store.snapshot().sync.phase, "offline");
    assert.ok(f.store.snapshot().pendingChanges > 0);
    offline = false;
    await coordinator.synchronize();
    assert.equal(f.remote.companies.length, 1);
    await coordinator.disconnect();
    await coordinator.synchronize();
    assert.equal(f.store.all("companies").length, 1);
    assert.equal(f.store.connection()?.token, null);
    assert.equal(f.store.pendingRevocations().length, 0);
    const before = canonical(f.remote);
    addCompany(f.store, "Solo local");
    await coordinator.synchronize();
    assert.equal(canonical(f.remote), before);
    assert.throws(
      () =>
        f.store.bindAccount(
          { ...f.store.connection()!, userId: "another", token: f.token },
          f.remote,
          "2",
        ),
      /otra cuenta/,
    );
  } finally {
    coordinator.stop();
    f.close();
  }
});
test("edits made during an HTTP request survive the incoming response", async () => {
  const f = fixture();
  let editOnResponse = true;
  const coordinator = new SyncCoordinator(
    f.store,
    "https://mappleo.vercel.app",
    async () => {},
    () => {},
    async (...args) => {
      const response = await f.transport(...args);
      if (args[3] && editOnResponse) {
        editOnResponse = false;
        addCompany(f.store, "Durante el envío");
      }
      return response;
    },
  );
  try {
    addCompany(f.store, "Antes del envío");
    await coordinator.synchronize();
    assert.equal(f.store.all("companies").length, 2);
    assert.equal(f.remote.companies.length, 1);
    await coordinator.synchronize();
    assert.equal(f.remote.companies.length, 2);
  } finally {
    coordinator.stop();
    f.close();
  }
});
test("link recognizes previously imported web IDs and maps base columns instead of duplicating", () => {
  const f = fixture();
  try {
    const directory = mkdtempSync(join(tmpdir(), "mappleo-sync-import-test-")),
      store = new LocalStore(directory, randomBytes(32));
    try {
      store.command({ action: "profile", name: "Imported profile" });
      addCompany(f.store, "Importada");
      const remote = withOwner(f.store.exportBackup(), "original-web-owner");
      store.importBackup(remote);
      assert.ok(store.all("companies")[0].id.startsWith("import_"));
      store.bindAccount(
        {
          origin: "https://mappleo.vercel.app",
          userId: "original-web-owner",
          email: "john@example.test",
          token: f.token,
          deviceId: "device",
          expiresAt: new Date().toISOString(),
        },
        remote,
        "1",
      );
      assert.equal(store.all("companies")[0].id, remote.companies[0].id);
      assert.equal(store.all("boardColumns").length, 3);
      const merged = mergeWorkspaces(
        store.connection()!.base,
        store.exportBackup(),
        withOwner(remote, store.profile()!.id),
      );
      assert.equal(merged.conflicts.length, 0);
      assert.equal(merged.workspace.companies.length, 1);
      assert.equal(store.importBackup(remote).added, 0);
      assert.equal(store.all("companies").length, 1);
    } finally {
      store.close();
      rmSync(directory, { recursive: true, force: true });
    }
  } finally {
    f.close();
  }
});
test("incompatible related changes cannot silently orphan data", () => {
  const base = emptyWorkspace("owner"),
    local = emptyWorkspace("owner"),
    remote = emptyWorkspace("owner");
  remote.companies = [
    {
      id: "company",
      userId: "owner",
      name: "Web",
      websiteUrl: "",
      faviconUrl: "",
      domain: "",
      careersUrl: "",
      linkedinUrl: "",
      location: "",
      workMode: "REMOTE",
      sector: "",
      interestRating: 3,
      notes: "",
      tags: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      archivedAt: null,
    },
  ];
  base.companies = structuredClone(remote.companies);
  remote.contacts = [
    {
      id: "contact",
      userId: "owner",
      companyId: "company",
      name: "Contacto nuevo",
      email: "",
      phone: "",
      role: "",
      linkedinUrl: "",
      notes: "",
      lastContactAt: null,
      followUpAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];
  const result = mergeWorkspaces(base, local, remote);
  assert.equal(result.conflicts[0].reason, "relations");
  const chosen = mergeWorkspaces(base, local, remote, {
    workspace: {
      local: canonical(local),
      remote: canonical(remote),
      choice: "remote",
    },
  });
  assert.equal(chosen.conflicts.length, 0);
  assert.equal(chosen.workspace.contacts.length, 1);
});
test("production cannot be redirected to an arbitrary credential recipient", () => {
  assert.equal(
    serverOrigin(false, "https://evil.test"),
    "https://mappleo.vercel.app",
  );
  assert.throws(() => serverOrigin(true, "https://evil.test"));
  assert.throws(() => serverOrigin(true, "http://localhost:3100/extra"));
  assert.equal(
    serverOrigin(true, "http://localhost:3100"),
    "http://localhost:3100",
  );
});

test("browser callback checks state, exchanges the PKCE verifier and completes the link automatically", async () => {
  const f = fixture();
  f.store.disconnect();
  let browserUrl = "",
    issued = false;
  const newToken = randomBytes(32).toString("base64url");
  const manager = new SyncCoordinator(
    f.store,
    "https://mappleo.vercel.app",
    async (url) => {
      browserUrl = url;
    },
    () => {},
    async (origin, path, token, body) => {
      if (!token && path === "/api/desktop/sync")
        throw new SyncHttpError("Unauthorized", 401);
      if (path === "/api/desktop/token") {
        const data = body as { verifier: string; redirectUri: string };
        assert.equal(
          createHash("sha256").update(data.verifier).digest("base64url"),
          new URL(browserUrl).searchParams.get("challenge"),
        );
        assert.equal(
          data.redirectUri,
          new URL(browserUrl).searchParams.get("redirectUri"),
        );
        issued = true;
        return {
          token: newToken,
          deviceId: "new-device",
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
          user: { id: "web-owner", email: "john@example.test", name: "John" },
        };
      }
      if (path === "/api/desktop/revoke") return { ok: true };
      assert.equal(token, newToken);
      return f.transport(origin, path, f.token, body);
    },
  );
  try {
    await manager.connect();
    assert.equal(f.store.snapshot().sync.phase, "connecting");
    const url = new URL(browserUrl),
      callback = new URL(url.searchParams.get("redirectUri")!);
    callback.searchParams.set("state", randomBytes(32).toString("base64url"));
    callback.searchParams.set("code", randomBytes(32).toString("base64url"));
    assert.equal((await fetch(callback)).status, 400);
    assert.equal(issued, false);
    callback.searchParams.set("state", url.searchParams.get("state")!);
    assert.equal((await fetch(callback)).status, 200);
    const deadline = Date.now() + 5000;
    while (f.store.snapshot().sync.phase !== "synced" && Date.now() < deadline)
      await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(f.store.snapshot().sync.phase, "synced");
    assert.equal(f.store.connection()?.token, newToken);
    assert.ok(!JSON.stringify(f.store.snapshot()).includes(newToken));
  } finally {
    manager.stop();
    f.close();
  }
});
test("disconnect while a request is in flight cannot reattach the account or overwrite local data", async () => {
  const f = fixture();
  let release!: (value: unknown) => void;
  const manager = new SyncCoordinator(
    f.store,
    "https://mappleo.vercel.app",
    async () => {},
    () => {},
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  try {
    const running = manager.synchronize();
    await manager.disconnect();
    release({ revision: "2", workspace: f.remote });
    await running;
    assert.equal(f.store.connection()?.token, null);
    assert.equal(f.store.snapshot().sync.connected, false);
    assert.equal(f.store.pendingRevocations().length, 1);
  } finally {
    manager.stop();
    f.close();
  }
});
test("revoked devices retain local data and stop polling with invalid credentials", async () => {
  const f = fixture();
  let calls = 0;
  const manager = new SyncCoordinator(
    f.store,
    "https://mappleo.vercel.app",
    async () => {},
    () => {},
    async () => {
      calls++;
      throw new SyncHttpError("Revoked", 401);
    },
  );
  try {
    addCompany(f.store, "Guardada localmente");
    await manager.synchronize();
    assert.equal(f.store.snapshot().sync.phase, "expired");
    assert.equal(f.store.connection()?.token, null);
    await manager.synchronize();
    assert.equal(calls, 1);
    assert.equal(f.store.all("companies").length, 1);
  } finally {
    manager.stop();
    f.close();
  }
});
