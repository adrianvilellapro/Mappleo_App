import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { LocalFiles, maxDocumentBytes } from "../src/main/files";
import { LocalStore } from "../src/main/store";
import { emptyWorkspace } from "../../../packages/domain/sync";

test("documents and associations stay encrypted, local-only, durable and idempotent", () => {
  const dir = mkdtempSync(join(tmpdir(), "mappleo-files-test-")),
    key = randomBytes(32),
    files = new LocalFiles(dir, key),
    store = new LocalStore(dir, key);
  try {
    store.command({ action: "profile", name: "Archivos privados" });
    const original = Buffer.from(
      "CV privado confidencial sin enviar a la nube",
    );
    const doc = files.import("cv.txt", "cv", original);
    assert.equal(files.import("copia.txt", "other", original).id, doc.id);
    assert.equal(files.list().length, 1);
    files.update(
      doc.id,
      { name: "CV personal.txt", category: "cv", offerIds: ["oferta-local"] },
      new Set(["oferta-local"]),
    );
    assert.deepEqual(files.list()[0].offerIds, ["oferta-local"]);
    assert.equal(
      Buffer.from(files.read(doc.id).content, "base64").toString(),
      original.toString(),
    );
    assert.equal(
      JSON.stringify(store.exportBackup()).includes("CV personal"),
      false,
    );
    assert.equal(
      JSON.stringify(store.snapshot()).includes("oferta-local"),
      false,
    );
    assert.equal(store.diagnostics().operations, 3); // only factory columns, never documents
    for (const name of ["documents.sqlite", "documents.sqlite-wal"])
      if (existsSync(join(dir, name))) {
        const bytes = readFileSync(join(dir, name));
        assert.equal(bytes.includes(original), false);
        assert.equal(bytes.includes(Buffer.from("CV personal.txt")), false);
        assert.equal(bytes.includes(Buffer.from("oferta-local")), false);
      }
    const reopened = new LocalFiles(dir, key);
    try {
      assert.equal(reopened.list()[0].name, "CV personal.txt");
    } finally {
      reopened.close();
    }
    files.delete(doc.id);
    assert.equal(files.list().length, 0);
  } finally {
    files.close();
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test("document validation rejects executable types, traversal, invalid bytes, foreign links and excessive files", () => {
  const dir = mkdtempSync(join(tmpdir(), "mappleo-files-test-")),
    files = new LocalFiles(dir, randomBytes(32));
  try {
    assert.throws(() =>
      files.import("cv.html", "cv", Buffer.from("<script>alert(1)</script>")),
    );
    assert.throws(() =>
      files.import("fake.pdf", "cv", Buffer.from("MZ executable")),
    );
    assert.throws(() =>
      files.import("huge.txt", "cv", Buffer.alloc(maxDocumentBytes + 1, 65)),
    );
    assert.throws(() => files.read("../../secret"));
    const file = files.import(
      "cv.pdf",
      "cv",
      Buffer.from("%PDF-1.4\nDocument test bytes"),
    );
    assert.throws(() =>
      files.update(
        file.id,
        { name: "../cv.pdf", category: "cv", offerIds: [] },
        new Set(),
      ),
    );
    assert.throws(() =>
      files.update(
        file.id,
        { name: "cv.pdf", category: "cv", offerIds: ["foreign"] },
        new Set(),
      ),
    );
    assert.equal(files.list().length, 1);
    files.reset();
    assert.equal(files.list().length, 0);
  } finally {
    files.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test("local reset clears the profile and backups without queuing web deletions and retains only pending revocation", () => {
  const dir = mkdtempSync(join(tmpdir(), "mappleo-files-test-")),
    store = new LocalStore(dir, randomBytes(32));
  try {
    store.command({ action: "profile", name: "Antes" });
    store.backup();
    store.bindAccount(
      {
        userId: "temporary-cloud-user",
        email: "reset@example.test",
        deviceId: "temporary-device",
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
        origin: "https://mappleo.vercel.app",
        token: "temporary-revocation-secret",
      },
      emptyWorkspace("temporary-cloud-user"),
      "1",
    );
    store.resetLocalProfile();
    assert.equal(store.profile(), null);
    assert.equal(store.diagnostics().operations, 0);
    assert.equal(store.all("boardColumns").length, 0);
    assert.equal(store.pendingRevocations().length, 1);
    store.command({ action: "profile", name: "Nuevo" });
    assert.equal(store.profile()?.name, "Nuevo");
    assert.equal(store.all("boardColumns").length, 3);
    assert.equal(store.connection(), undefined);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
