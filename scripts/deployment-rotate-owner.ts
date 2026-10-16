import { Client } from "pg";
import { readFileSync, writeFileSync, renameSync } from "node:fs";
import { taskEnvironment } from "./task-environment";
import { runtimePoolConfig } from "../lib/db/connection";
import { homedir } from "node:os";
import { join } from "node:path";
const { file, target } = taskEnvironment();
if (
  !process.argv.includes("--apply") ||
  !file.endsWith(".env.deploy") ||
  target.username !== "neondb_owner"
)
  throw new Error(
    "Confirma la rotación de la credencial propietaria de producción con --apply.",
  );
const nextUrl = new URL(target);
const projectId = process.env.NEON_PROJECT_ID;
const branchId = process.env.NEON_PRODUCTION_BRANCH_ID;
if (
  !projectId ||
  !/^[a-z0-9-]+$/.test(projectId) ||
  !branchId ||
  !/^br-[a-z0-9-]+$/.test(branchId)
)
  throw new Error(
    "Configura NEON_PROJECT_ID y NEON_PRODUCTION_BRANCH_ID en el perfil privado antes de rotar credenciales.",
  );
const credentials = JSON.parse(
  readFileSync(join(homedir(), ".config/neon/credentials.json"), "utf8"),
);
if (!credentials.access_token)
  throw new Error(
    "Inicia sesión con neon login antes de renovar la contraseña.",
  );
async function call(path: string, method = "GET") {
  const response = await fetch("https://console.neon.tech/api/v2" + path, {
    method,
    headers: { Authorization: "Bearer " + credentials.access_token },
    signal: AbortSignal.timeout(30000),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(
      "Neon respondió HTTP " +
        response.status +
        ". No se ha repetido la operación.",
    );
  return result;
}
const prefix = "/projects/" + projectId;
const endpoints = await call(prefix + "/endpoints");
if (
  !endpoints.endpoints?.some(
    (endpoint: { branch_id: string; host: string }) =>
      endpoint.branch_id === branchId && endpoint.host === target.hostname,
  )
)
  throw new Error(
    "El host privado no coincide con la rama de producción; no se renovará ninguna contraseña.",
  );
const result = await call(
  prefix + "/branches/" + branchId + "/roles/neondb_owner/reset_password",
  "POST",
);
if (!result.role?.password)
  throw new Error(
    "Neon no devolvió la nueva credencial; consulta Roles en su consola, no repitas la rotación automáticamente.",
  );
nextUrl.password = result.role.password;
const pending = file + ".pending-owner";
const nextContents = readFileSync(file, "utf8").replace(
  /^DATABASE_URL=.*$/m,
  () => "DATABASE_URL=" + nextUrl.href,
);
// Persist the new credential before changing PostgreSQL; never log passwords.
writeFileSync(pending, nextContents, { mode: 0o600 });
try {
  for (const operation of result.operations ?? []) {
    let finished = false;
    for (let attempt = 0; attempt < 30; attempt++) {
      const status = (await call(prefix + "/operations/" + operation.id))
        .operation.status;
      if (status === "finished") {
        finished = true;
        break;
      }
      if (status === "failed")
        throw new Error("La operación de Neon ha fallado.");
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    if (!finished)
      throw new Error(
        "La operación sigue pendiente; conserva el archivo de recuperación.",
      );
  }
  const probe = new Client(runtimePoolConfig(nextUrl.href));
  await probe.connect();
  await probe.end();
  renameSync(pending, file);
  console.log(
    "Contraseña propietaria de Neon renovada y verificada con TLS. .env.deploy actualizado; las URLs limitadas de Vercel no cambian.",
  );
} catch {
  throw new Error(
    "No se ha podido verificar la rotación. Se conserva el perfil privado .env.deploy.pending-owner para recuperar el acceso; no repitas ni borres ese archivo sin revisar.",
  );
}
