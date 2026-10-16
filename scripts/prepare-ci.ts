import { writeFileSync, existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
if (process.env.CI !== "true" || existsSync(".env"))
  throw new Error(
    "Solo se puede crear una configuración CI nueva en un checkout limpio.",
  );
writeFileSync(
  ".env",
  [
    "DATABASE_URL=postgresql://postgres:mappleo-ci@127.0.0.1:5432/mappleo",
    "AUTH_SECRET=" + randomBytes(48).toString("hex"),
    "NEXTAUTH_URL=https://localhost:3000",
    "ADMIN_EMAIL=admin-ci@example.test",
    "FIELD_ENCRYPTION_KEYS=" +
      JSON.stringify({ v1: randomBytes(32).toString("base64") }),
    "FIELD_ENCRYPTION_ACTIVE_KEY=v1",
    "FIELD_ENCRYPTION_INDEX_KEY=" + randomBytes(32).toString("base64"),
  ].join("\n") + "\n",
);
console.log("Entorno efímero CI preparado sin datos ni secretos reales.");
