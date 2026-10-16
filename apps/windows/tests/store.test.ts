import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { LocalStore } from "../src/main/store";
import { RecordCipher } from "../src/main/crypto";
import { backupSchema } from "../../../packages/domain/backup";
import { makeCsv } from "../../../packages/domain/csv";

function fixture() {
  const path = mkdtempSync(join(tmpdir(), "mappleo-desktop-test-")),
    key = randomBytes(32),
    store = new LocalStore(path, key);
  store.command({ action: "profile", name: "John Local" });
  return {
    path,
    key,
    store,
    close() {
      store.close();
      rmSync(path, { recursive: true, force: true });
    },
  };
}
function company(store: LocalStore, name = "Empresa local") {
  store.command({
    action: "save",
    kind: "companies",
    input: {
      name,
      websiteUrl: "https://example.com",
      careersUrl: "",
      linkedinUrl: "",
      location: "Alicante",
      workMode: "REMOTE",
      sector: "Tecnología",
      interestRating: 4,
      tags: [],
      notes: "Nota confidencial",
    },
  });
  return store.all("companies").at(-1)!;
}
function offer(store: LocalStore, companyId: string) {
  store.command({
    action: "save",
    kind: "offers",
    input: {
      companyId,
      title: "Frontend Developer",
      url: "",
      source: "LINKEDIN",
      location: "",
      workMode: "REMOTE",
      salaryMin: "",
      salaryMax: "",
      salaryCurrency: "EUR",
      description: "Descripción",
      notes: "",
      technologies: ["React", "Tecnología nueva"],
      interestRating: 4,
      publishedAt: null,
      deadlineAt: null,
    },
  });
  return store.all("offers").at(-1)!;
}
function application(store: LocalStore, jobOfferId: string) {
  store.command({
    action: "save",
    kind: "applications",
    input: {
      jobOfferId,
      status: "APPLIED",
      appliedAt: new Date().toISOString(),
      firstResponseAt: null,
      nextAction: "Preparar entrevista",
      nextActionDueAt: new Date(Date.now() + 86400000).toISOString(),
      cvVersion: "CV frontend",
      coverLetterUsed: false,
      notes: "",
    },
  });
  return store.all("applications").at(-1)!;
}
test("profile, all core entities, related histories and completion are durable", () => {
  const f = fixture();
  try {
    assert.equal(f.store.all("boardColumns").length, 3);
    const c = company(f.store),
      o = offer(f.store, c.id),
      a = application(f.store, o.id);
    application(f.store, o.id);
    assert.equal(f.store.all("applications").length, 2);
    assert.equal(a.events[0].type, "APPLICATION_SENT");
    f.store.command({
      action: "save",
      kind: "contacts",
      input: {
        name: "Patricia",
        companyId: c.id,
        role: "Recruiter",
        email: "persona@example.com",
        phone: "",
        linkedinUrl: "",
        notes: "",
        lastContactAt: null,
        followUpAt: new Date().toISOString(),
      },
    });
    const contact = f.store.all("contacts")[0];
    f.store.command({
      action: "save",
      kind: "networking",
      input: {
        name: "Encuentro local",
        type: "MEETUP",
        startsAt: new Date().toISOString(),
        endsAt: null,
        location: "Alicante",
        url: "",
        notes: "",
        companyIds: [c.id],
        contactIds: [contact.id],
      },
    });
    assert.equal(f.store.all("tasks").length, 0); // entity fields no longer create tasks
    f.store.command({
      action: "save",
      kind: "tasks",
      input: {
        title: "Preparar entrevista",
        columnId: f.store.all("boardColumns")[0].id,
        links: [{ kind: "applications", recordId: a.id, label: "Candidatura" }],
      },
    });
    const task = f.store.all("tasks")[0];
    f.store.command({ action: "complete", kind: "tasks", id: task.id });
    assert.equal(f.store.all("taskCompletions").length, 1);
    assert.deepEqual(f.store.all("taskCompletions")[0].companyIds, [c.id]);
    assert.deepEqual(f.store.all("taskCompletions")[0].sources, ["LINKEDIN"]);
    const todo = f.store
      .all("boardColumns")
      .find((c) => c.systemKey === "todo")!;
    f.store.command({
      action: "save",
      kind: "tasks",
      id: task.id,
      input: { ...task, columnId: todo.id },
    });
    assert.equal(
      f.store.all("tasks").find((t) => t.id === task.id)!.completedAt,
      null,
    );
    assert.equal(
      f.store.all("tasks").find((t) => t.id === task.id)!.sourceKind,
      null,
    );
    assert.equal(
      f.store.all("applications")[0].nextAction,
      "Preparar entrevista",
    ); // legacy fields retained, no coupling
    assert.ok(f.store.all("contacts")[0].followUpAt);
    assert.ok(
      f.store.exportBackup().technologyTags?.includes("Tecnología nueva"),
    );
    backupSchema.parse(f.store.exportBackup());
    const second = new LocalStore(f.path, f.key);
    try {
      assert.equal(second.all("companies")[0].name, "Empresa local");
      assert.equal(second.all("networking").length, 1);
    } finally {
      second.close();
    }
  } finally {
    f.close();
  }
});
test("schema validation, foreign references, SQL injection text and atomic rollback", () => {
  const f = fixture();
  try {
    const c = company(f.store, "'; DROP TABLE records; --");
    assert.equal(f.store.all("companies")[0].name, c.name);
    assert.throws(() => offer(f.store, "does-not-exist"));
    assert.equal(f.store.all("offers").length, 0);
    assert.throws(() =>
      f.store.command({
        action: "save",
        kind: "companies",
        input: { name: "Malicious", websiteUrl: "javascript:alert(1)" },
      }),
    );
    const o = offer(f.store, c.id);
    application(f.store, o.id);
    assert.throws(() =>
      f.store.command({ action: "delete", kind: "companies", id: c.id }),
    );
    assert.throws(() =>
      f.store.command({ action: "delete", kind: "offers", id: o.id }),
    );
    assert.equal(f.store.all("companies").length, 1);
    assert.throws(() =>
      f.store.command({
        action: "save",
        kind: "companies",
        id: c.id,
        input: { ...c, interestRating: 999 },
      }),
    );
    assert.equal(f.store.all("companies")[0].interestRating, 4);
  } finally {
    f.close();
  }
});
test("encrypted storage, authenticated records, encrypted backups and incorrect key refusal", () => {
  const f = fixture();
  try {
    company(f.store, "Empresa supersecreta");
    const database = new DatabaseSync(join(f.path, "mappleo.sqlite"));
    try {
      const row = database
        .prepare("SELECT data FROM records WHERE kind='companies'")
        .get() as { data: Uint8Array };
      assert.equal(
        Buffer.from(row.data).includes(Buffer.from("Empresa supersecreta")),
        false,
      );
    } finally {
      database.close();
    }
    const backup = f.store.backup();
    assert.equal(
      readFileSync(backup).includes(Buffer.from("Nota confidencial")),
      false,
    );
    assert.throws(() => new LocalStore(f.path, randomBytes(32)));
    const cipher = new RecordCipher(randomBytes(32)),
      sealed = cipher.seal({ secret: "value" }, "one");
    assert.throws(() => cipher.open(sealed, "two"));
    sealed[sealed.length - 1] ^= 1;
    assert.throws(() => cipher.open(sealed, "one"));
  } finally {
    f.close();
  }
});
test("web-format JSON imports all records, preserves relationships, stays idempotent, never resurrects tombstones", () => {
  const source = fixture(),
    target = fixture();
  try {
    const c = company(source.store),
      o = offer(source.store, c.id),
      a = application(source.store, o.id);
    const raw = source.store.exportBackup();
    const result = target.store.importBackup(raw);
    assert.ok(result.added >= 3);
    const again = target.store.importBackup(raw);
    assert.equal(again.added, 0);
    assert.equal(target.store.all("companies").length, 1);
    assert.equal(target.store.all("applications").length, 1);
    assert.equal(
      target.store.all("applications")[0].jobOfferId,
      target.store.all("offers")[0].id,
    );
    assert.equal(
      target.store.all("tasks").filter((t) => !t.completedAt).length,
      0,
    );
    backupSchema.parse(target.store.exportBackup());
    const importedApplication = target.store.all("applications")[0];
    target.store.command({
      action: "delete",
      kind: "applications",
      id: importedApplication.id,
    });
    // A companies-only reimport leaves local deletions alone.
    const companiesOnly = {
      ...raw,
      offers: [],
      applications: [],
      tasks: [],
      taskCompletions: [],
      boardColumns: [],
    };
    target.store.importBackup(companiesOnly);
    assert.equal(target.store.all("applications").length, 0);
    assert.ok(target.store.diagnostics().tombstones >= 1);
    assert.ok(target.store.diagnostics().operations > 0);
    assert.ok(a.id && c.id);
  } finally {
    source.close();
    target.close();
  }
});
test("custom columns reorder with tasks; deleting moves or explicitly deletes; reopening retains history", () => {
  const f = fixture();
  try {
    f.store.command({
      action: "save",
      kind: "boardColumns",
      input: { name: "Preparación", position: 1 },
    });
    const column = f.store
        .all("boardColumns")
        .find((c) => c.name === "Preparación")!,
      todo = f.store.all("boardColumns").find((c) => c.systemKey === "todo")!,
      done = f.store.all("boardColumns").find((c) => c.isDone)!;
    f.store.command({
      action: "save",
      kind: "tasks",
      input: {
        title: "Mi tarea",
        columnId: column.id,
        dueAt: null,
        description: "Descripción larga",
        links: [],
      },
    });
    const task = f.store.all("tasks")[0];
    f.store.command({
      action: "moveTask",
      id: task.id,
      columnId: done.id,
      position: 0,
    });
    assert.ok(f.store.all("tasks")[0].completedAt);
    assert.equal(f.store.all("taskCompletions").length, 1);
    f.store.command({
      action: "moveTask",
      id: task.id,
      columnId: column.id,
      position: 0,
    });
    assert.equal(f.store.all("tasks")[0].completedAt, null);
    assert.throws(() =>
      f.store.command({
        action: "delete",
        kind: "boardColumns",
        id: column.id,
      }),
    );
    f.store.command({
      action: "delete",
      kind: "boardColumns",
      id: column.id,
      moveTo: todo.id,
    });
    assert.equal(f.store.all("tasks")[0].columnId, todo.id);
    assert.equal(f.store.all("taskCompletions").length, 1);
    f.store.command({ action: "delete", kind: "boardColumns", id: done.id });
    assert.equal(
      f.store.all("boardColumns").some((c) => c.id === done.id),
      false,
    );
  } finally {
    f.close();
  }
});
test("any base column can be deleted, completion destination falls back and is configurable without changing task history", () => {
  const f = fixture();
  try {
    const done = f.store.all("boardColumns").find((c) => c.isDone)!,
      todo = f.store.all("boardColumns")[0];
    f.store.command({
      action: "save",
      kind: "tasks",
      input: { title: "Hecha", columnId: done.id, links: [] },
    });
    const task = f.store.all("tasks")[0],
      stamp = task.completedAt;
    f.store.command({
      action: "delete",
      kind: "boardColumns",
      id: done.id,
      moveTo: todo.id,
    });
    assert.equal(f.store.all("boardColumns").length, 2);
    assert.equal(f.store.all("tasks")[0].completedAt, stamp);
    assert.equal(
      f.store.all("boardColumns").find((c) => c.isDone)?.id,
      todo.id,
    );
    const next = f.store.all("boardColumns").find((c) => c.id !== todo.id)!;
    f.store.command({
      action: "save",
      kind: "boardColumns",
      id: next.id,
      input: { name: next.name, position: next.position, isDone: true },
    });
    assert.equal(f.store.all("boardColumns").filter((c) => c.isDone).length, 1);
    f.store.command({
      action: "save",
      kind: "tasks",
      id: task.id,
      input: { ...task, columnId: todo.id, title: "Hecha editada" },
    });
    assert.equal(f.store.all("tasks")[0].completedAt, stamp);
    f.store.command({ action: "profile", name: "John" });
    assert.equal(
      f.store.all("boardColumns").some((c) => c.systemKey === "done"),
      false,
    );
    f.store.command({
      action: "delete",
      kind: "boardColumns",
      id: todo.id,
      moveTo: next.id,
    });
    assert.throws(() =>
      f.store.command({
        action: "delete",
        kind: "boardColumns",
        id: next.id,
        deleteTasks: true,
      }),
    );
  } finally {
    f.close();
  }
});
test("application events may be removed, CSV is protected from formula injection, JSON remains web-compatible", () => {
  const f = fixture();
  try {
    const c = company(f.store, '=WEBSERVICE("bad")'),
      o = offer(f.store, c.id),
      a = application(f.store, o.id);
    f.store.command({
      action: "activity",
      applicationId: a.id,
      title: "Entrevista",
      description: "Notas",
      type: "INTERVIEW",
      happenedAt: new Date().toISOString(),
    });
    const events = f.store.all("applications")[0].events;
    assert.equal(events.length, 2);
    f.store.command({
      action: "deleteActivity",
      applicationId: a.id,
      id: events[1].id,
    });
    assert.equal(f.store.all("applications")[0].events.length, 1);
    const csv = makeCsv(
      backupSchema.parse(f.store.exportBackup()),
      "companies",
    );
    assert.ok(csv.includes("'=WEBSERVICE"));
  } finally {
    f.close();
  }
});
