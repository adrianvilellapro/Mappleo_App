import { DatabaseSync } from "node:sqlite";
import { randomUUID, createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join, extname, basename } from "node:path";
import { z } from "zod";
import { RecordCipher } from "./crypto";
import type { LocalDocument, DocumentCategory } from "../shared/contracts";

export const maxDocumentBytes = 10 * 1024 * 1024;
const categories = z.enum(["cv", "letter", "other"]);
const identifier = z.uuid();
const metadata = z.object({
  id: identifier,
  name: z.string().min(1).max(180),
  category: categories,
  mime: z.enum(["application/pdf", "image/png", "image/jpeg", "text/plain"]),
  size: z.number().int().positive().max(maxDocumentBytes),
  createdAt: z.iso.datetime(),
  offerIds: z.array(z.string().min(1).max(100)).max(100),
  digest: z.string().length(64),
});

// Deliberately separate from LocalStore, Workspace, backup JSON and the sync outbox.
export class LocalFiles {
  private db: DatabaseSync;
  private cipher: RecordCipher;
  constructor(directory: string, key: Buffer) {
    mkdirSync(directory, { recursive: true });
    this.cipher = new RecordCipher(key);
    this.db = new DatabaseSync(join(directory, "documents.sqlite"));
    this.db.exec(
      "PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA secure_delete=ON; CREATE TABLE IF NOT EXISTS documents(id TEXT PRIMARY KEY, metadata BLOB NOT NULL, content BLOB NOT NULL)",
    );
  }
  private entries() {
    return (
      this.db.prepare("SELECT id,metadata FROM documents").all() as {
        id: string;
        metadata: Uint8Array;
      }[]
    ).map((r) =>
      metadata.parse(this.cipher.open(r.metadata, "document-meta:" + r.id)),
    );
  }
  list(): LocalDocument[] {
    return this.entries()
      .map(({ digest: _digest, ...item }) => item)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  import(
    name: string,
    category: DocumentCategory,
    bytes: Buffer,
  ): LocalDocument {
    categories.parse(category);
    if (!bytes.length || bytes.length > maxDocumentBytes)
      throw new Error("Cada archivo debe ocupar entre 1 byte y 10 MB.");
    const extension = extname(name).toLowerCase();
    let mime: LocalDocument["mime"];
    if (extension === ".pdf" && bytes.subarray(0, 5).toString() === "%PDF-")
      mime = "application/pdf";
    else if (
      extension === ".png" &&
      bytes
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    )
      mime = "image/png";
    else if (
      [".jpg", ".jpeg"].includes(extension) &&
      bytes[0] === 255 &&
      bytes[1] === 216 &&
      bytes[2] === 255
    )
      mime = "image/jpeg";
    else if (extension === ".txt" && !bytes.includes(0)) {
      new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      mime = "text/plain";
    } else
      throw new Error(
        "Selecciona un PDF, PNG, JPG o texto UTF-8 válido. Convierte tu documento Word a PDF para previsualizarlo aquí.",
      );
    const entries = this.entries(),
      digest = createHash("sha256").update(bytes).digest("hex");
    const existing = entries.find((e) => e.digest === digest);
    if (existing) {
      const { digest: _digest, ...item } = existing;
      return item;
    }
    if (
      entries.length >= 250 ||
      entries.reduce((sum, e) => sum + e.size, 0) + bytes.length >
        200 * 1024 * 1024
    )
      throw new Error("El archivo local admite hasta 250 documentos y 200 MB.");
    const item = metadata.parse({
      id: randomUUID(),
      name: basename(name)
        .replace(/[\x00-\x1f]/g, "")
        .slice(0, 180),
      category,
      mime,
      size: bytes.length,
      createdAt: new Date().toISOString(),
      offerIds: [],
      digest,
    });
    this.db
      .prepare("INSERT INTO documents(id,metadata,content) VALUES (?,?,?)")
      .run(
        item.id,
        this.cipher.seal(item, "document-meta:" + item.id),
        this.cipher.seal(
          bytes.toString("base64"),
          "document-content:" + item.id,
        ),
      );
    const { digest: _digest, ...result } = item;
    return result;
  }
  read(id: string) {
    identifier.parse(id);
    const row = this.db
      .prepare("SELECT metadata,content FROM documents WHERE id=?")
      .get(id) as { metadata: Uint8Array; content: Uint8Array } | undefined;
    if (!row) throw new Error("El archivo ya no está disponible.");
    const item = metadata.parse(
      this.cipher.open(row.metadata, "document-meta:" + id),
    );
    const content = this.cipher.open<string>(
      row.content,
      "document-content:" + id,
    );
    if (Buffer.from(content, "base64").length !== item.size)
      throw new Error("El archivo está dañado.");
    const { digest: _digest, ...document } = item;
    return { document, content };
  }
  update(id: string, input: unknown, offerIds: ReadonlySet<string>) {
    identifier.parse(id);
    const data = z
      .object({
        name: z
          .string()
          .trim()
          .min(1)
          .max(180)
          .refine((v) => !/[\\/\x00-\x1f]/.test(v)),
        category: categories,
        offerIds: z.array(z.string().min(1).max(100)).max(100),
      })
      .parse(input);
    if (data.offerIds.some((id) => !offerIds.has(id)))
      throw new Error("La oferta no pertenece a este espacio local.");
    const item = this.entries().find((e) => e.id === id);
    if (!item) throw new Error("El archivo ya no existe.");
    this.db
      .prepare("UPDATE documents SET metadata=? WHERE id=?")
      .run(
        this.cipher.seal(
          { ...item, ...data, offerIds: [...new Set(data.offerIds)] },
          "document-meta:" + id,
        ),
        id,
      );
  }
  delete(id: string) {
    identifier.parse(id);
    this.db.prepare("DELETE FROM documents WHERE id=?").run(id);
  }
  reset() {
    this.db.exec(
      "DELETE FROM documents; PRAGMA wal_checkpoint(TRUNCATE); VACUUM;",
    );
  }
  close() {
    this.db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    this.db.close();
  }
}
