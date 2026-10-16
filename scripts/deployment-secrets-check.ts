import { parse } from "dotenv";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
const profiles = [".env", ".env.deploy"]
  .filter(existsSync)
  .map((file) => parse(readFileSync(file)));
const privateKeys = [
  "AUTH_SECRET",
  "FIELD_ENCRYPTION_KEYS",
  "FIELD_ENCRYPTION_INDEX_KEY",
  "REGISTRATION_CODE",
  "ADMIN_PASSWORD",
  "ADMIN_ACTION_PASSWORD",
  "ADMIN_TOTP_SECRET",
  "DATABASE_URL",
  "DATABASE_RUNTIME_URL",
  "DATABASE_ADMIN_RUNTIME_URL",
  "VERCEL_API_TOKEN",
];
const values = profiles
  .flatMap((e) => privateKeys.map((k) => e[k]))
  .filter((v): v is string => !!v && v.length >= 16);
const files = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { encoding: "utf8" },
)
  .split("\0")
  .filter(Boolean);
function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
  );
}
if (existsSync(".next-deploy-check/static"))
  files.push(...walk(".next-deploy-check/static"));
const hits: string[] = [];
for (const file of files) {
  if (!existsSync(file)) continue;
  const contents = readFileSync(file).toString("utf8");
  if (values.some((value) => contents.includes(value))) hits.push(file);
}
if (hits.length)
  throw new Error(
    "Se han encontrado secretos privados en archivos publicables: " +
      hits.join(", "),
  );
console.log(
  `Revisados ${files.length} archivos publicables y cliente compilado: ningún secreto privado encontrado.`,
);
