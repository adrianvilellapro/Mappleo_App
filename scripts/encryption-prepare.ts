import { Client } from "pg";
import { readFileSync, writeFileSync, mkdirSync, chmodSync } from "node:fs";
import { randomBytes } from "node:crypto";
import {
  fieldCipher,
  protectedFields,
  cipherPrefix,
} from "../lib/db/field-encryption";
import { runtimePoolConfig } from "../lib/db/connection";
import { taskEnvironment } from "./task-environment";

const { file, test, target } = taskEnvironment();
const client = new Client(
  runtimePoolConfig(target.href, process.env.DATABASE_SSL_CA),
);
await client.connect();
try {
  await client.query("BEGIN");
  await client.query("SET LOCAL lock_timeout = '10s'");
  await client.query(
    `LOCK TABLE ${Object.keys(protectedFields)
      .map((m) => `"${m}"`)
      .join(", ")} IN ACCESS EXCLUSIVE MODE`,
  );
  const inventory: Record<string, Record<string, unknown>[]> = {};
  for (const model of Object.keys(protectedFields))
    inventory[model] = (
      await client.query(`SELECT * FROM "${model}" ORDER BY id`)
    ).rows;
  const hasCiphertext = Object.entries(inventory).some(([model, rows]) =>
    rows.some((r) =>
      protectedFields[model].some((field) => {
        const values = Array.isArray(r[field]) ? r[field] : [r[field]];
        return values.some(
          (v) => typeof v === "string" && v.startsWith(cipherPrefix),
        );
      }),
    ),
  );
  if (
    !process.env.FIELD_ENCRYPTION_KEYS &&
    !process.env.FIELD_ENCRYPTION_INDEX_KEY &&
    !process.env.FIELD_ENCRYPTION_ACTIVE_KEY
  ) {
    if (hasCiphertext)
      throw new Error(
        "Encrypted records exist but keys are missing. Restore the original keys; no new key has been generated.",
      );
    const values = {
      FIELD_ENCRYPTION_KEYS: JSON.stringify({
        v1: randomBytes(32).toString("base64"),
      }),
      FIELD_ENCRYPTION_ACTIVE_KEY: "v1",
      FIELD_ENCRYPTION_INDEX_KEY: randomBytes(32).toString("base64"),
    };
    let content = readFileSync(file, "utf8");
    for (const [key, value] of Object.entries(values)) {
      const line = `${key}=${value}`;
      const pattern = new RegExp(`^${key}=.*$`, "m");
      content = pattern.test(content)
        ? content.replace(pattern, () => line)
        : `${content.trimEnd()}\n${line}\n`;
      process.env[key] = value;
    }
    writeFileSync(file, content, { mode: 0o600 });
    if (process.platform !== "win32") chmodSync(file, 0o600);
  }
  const cipher = fieldCipher();
  // Authenticate existing ciphertext and check email uniqueness BEFORE changing anything.
  const emails = new Set<string>();
  for (const [model, rows] of Object.entries(inventory))
    for (const row of rows) {
      for (const field of protectedFields[model]) {
        const values = Array.isArray(row[field]) ? row[field] : [row[field]];
        for (const value of values)
          if (typeof value === "string" && value.startsWith(cipherPrefix))
            cipher.decrypt(value, model, field);
      }
      if (model === "User") {
        const email = String(row.email).startsWith(cipherPrefix)
          ? cipher.decrypt(String(row.email), model, "email")
          : String(row.email);
        const lookup = cipher.emailLookup(email);
        if (emails.has(lookup))
          throw new Error(
            "Duplicate normalized emails. Migration cancelled without changing data.",
          );
        if (row.emailLookup && row.emailLookup !== lookup)
          throw new Error(
            "Email lookup key changed. Restore the original index key.",
          );
        emails.add(lookup);
      }
    }
  if (!test) {
    mkdirSync(".local-backups", { recursive: true, mode: 0o700 });
    const backup = `.local-backups/db-before-encryption-${new Date().toISOString().replace(/[:.]/g, "-")}.json.enc`;
    writeFileSync(
      backup,
      cipher.encrypt(JSON.stringify(inventory), "MigrationBackup", "snapshot"),
      { mode: 0o600 },
    );
    console.log(
      "Encrypted recovery snapshot saved locally. Keep its server keys separately and safely.",
    );
  }
  let changed = 0;
  for (const [model, rows] of Object.entries(inventory)) {
    for (const row of rows) {
      const values: unknown[] = [];
      const assignments: string[] = [];
      for (const field of protectedFields[model]) {
        const value = row[field];
        const encode = (v: unknown) => {
          if (typeof v !== "string")
            throw new Error(
              "Unexpected protected data type; migration cancelled.",
            );
          return v.startsWith(cipherPrefix)
            ? v
            : cipher.encrypt(v, model, field);
        };
        const encrypted = Array.isArray(value)
          ? value.map(encode)
          : encode(value);
        values.push(encrypted);
        assignments.push(`"${field}" = $${values.length}`);
      }
      if (model === "User") {
        values.push(
          cipher.emailLookup(
            String(row.email).startsWith(cipherPrefix)
              ? cipher.decrypt(String(row.email), "User", "email")
              : String(row.email),
          ),
        );
        assignments.push(`"emailLookup" = $${values.length}`);
      }
      values.push(row.id);
      await client.query(
        `UPDATE "${model}" SET ${assignments.join(", ")} WHERE id = $${values.length}`,
        values,
      );
      changed++;
    }
    // No code path (including an old admin script) may write plaintext afterwards.
    const constraint = `mappleo_encrypted_${model}`;
    const present = await client.query(
      "SELECT 1 FROM pg_constraint WHERE conname = $1",
      [constraint],
    );
    if (!present.rowCount) {
      const checks = protectedFields[model].map((f) =>
        f === "tags"
          ? `array_to_string("tags", E'\\n') = '' OR array_to_string("tags", E'\\n') ~ '^mappleo:enc:1:'`
          : `"${f}" LIKE '${cipherPrefix}%'`,
      );
      // Arrays need element-wise validation: trigger below checks every element.
      await client.query(
        `ALTER TABLE "${model}" ADD CONSTRAINT "${constraint}" CHECK (${checks.map((c) => `(${c})`).join(" AND ")}${model === "User" ? ' AND "emailLookup" IS NOT NULL' : ""})`,
      );
    }
  }
  await client.query(`CREATE OR REPLACE FUNCTION mappleo_encrypted_tags() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF EXISTS (SELECT 1 FROM unnest(NEW.tags) v WHERE v IS NULL OR v NOT LIKE 'mappleo:enc:1:%') THEN
      RAISE EXCEPTION 'Company tags must be encrypted';
    END IF; RETURN NEW; END $$`);
  await client.query(
    `DROP TRIGGER IF EXISTS mappleo_encrypted_tags ON "Company"`,
  );
  await client.query(
    `CREATE TRIGGER mappleo_encrypted_tags BEFORE INSERT OR UPDATE ON "Company" FOR EACH ROW EXECUTE FUNCTION mappleo_encrypted_tags()`,
  );
  // Full round-trip verification includes Unicode, empty values, arrays and timestamps.
  for (const [model, before] of Object.entries(inventory)) {
    const after = (await client.query(`SELECT * FROM "${model}" ORDER BY id`))
      .rows;
    if (after.length !== before.length)
      throw new Error("Record count changed; migration cancelled.");
    for (let i = 0; i < after.length; i++) {
      const decoded = { ...after[i] };
      for (const field of protectedFields[model]) {
        const v = decoded[field];
        decoded[field] = Array.isArray(v)
          ? v.map((s) => cipher.decrypt(s, model, field))
          : cipher.decrypt(v, model, field);
        const previous = before[i][field];
        const expected = Array.isArray(previous)
          ? previous.map((s) =>
              s.startsWith(cipherPrefix) ? cipher.decrypt(s, model, field) : s,
            )
          : String(previous).startsWith(cipherPrefix)
            ? cipher.decrypt(String(previous), model, field)
            : previous;
        if (JSON.stringify(decoded[field]) !== JSON.stringify(expected))
          throw new Error(
            "Round-trip verification failed; migration cancelled.",
          );
      }
      if (
        String(decoded.id) !== String(before[i].id) ||
        String(decoded.updatedAt) !== String(before[i].updatedAt)
      )
        throw new Error(
          "Record identity/version changed; migration cancelled.",
        );
    }
  }
  await client.query("COMMIT");
  console.log(
    `Field encryption verified: ${changed} records preserved. No secrets or personal data printed.`,
  );
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}
