import { parse } from "dotenv";
import { readFileSync } from "node:fs";
const e = parse(readFileSync(".env.deploy"));
e.DESKTOP_SYNC_ENABLED ??= "false";
if (!["true", "false"].includes(e.DESKTOP_SYNC_ENABLED))
  throw new Error("DESKTOP_SYNC_ENABLED debe ser true o false.");
const projectId = e.VERCEL_PROJECT_ID;
const teamId = e.VERCEL_TEAM_ID;
if (
  !projectId ||
  !/^prj_[a-zA-Z0-9]+$/.test(projectId) ||
  !teamId ||
  !/^team_[a-zA-Z0-9]+$/.test(teamId) ||
  !e.VERCEL_API_TOKEN
)
  throw new Error("Perfil privado o destino de Vercel incorrecto.");
async function call(path: string, method = "GET", body?: unknown) {
  const response = await fetch(
    "https://api.vercel.com" +
      path +
      (path.includes("?") ? "&" : "?") +
      "teamId=" +
      teamId,
    {
      method,
      headers: {
        Authorization: "Bearer " + e.VERCEL_API_TOKEN,
        "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(30000),
    },
  );
  const data = await response.json();
  if (!response.ok)
    throw new Error(
      `Vercel ${method}: HTTP ${response.status}, ${data.error?.code ?? "unknown"}`,
    );
  return data;
}
const project = await call("/v9/projects/" + projectId);
if (
  project.id !== projectId ||
  project.accountId !== teamId ||
  project.link?.repo !== "Mappleo"
)
  throw new Error(
    "El proyecto de Vercel no coincide con Mappleo; no se ha modificado nada.",
  );
const domains = await call("/v9/projects/" + projectId + "/domains");
console.log(
  JSON.stringify({
    assignedDomains: domains.domains.map((d: { name: string }) => d.name),
  }),
);
const host = new URL(e.NEXTAUTH_URL).hostname;
if (!domains.domains?.some((domain: { name: string }) => domain.name === host))
  throw new Error(
    "NEXTAUTH_URL no coincide con un dominio asignado al proyecto.",
  );
console.log(
  JSON.stringify({
    project: project.name,
    productionBranch: project.link.productionBranch,
    node: project.nodeVersion,
    domains: domains.domains.map((d: { name: string }) => d.name),
    fluid: project.resourceConfig?.fluid,
  }),
);
if (process.argv.includes("--apply")) {
  if (
    project.link.productionBranch !== "main" ||
    new URL(e.NEXTAUTH_URL).protocol !== "https:"
  )
    throw new Error(
      "Confirma main como producción y HTTPS antes de continuar.",
    );
  const names = [
    "DATABASE_RUNTIME_URL",
    "DATABASE_ADMIN_RUNTIME_URL",
    "AUTH_SECRET",
    "NEXTAUTH_URL",
    "FIELD_ENCRYPTION_KEYS",
    "FIELD_ENCRYPTION_ACTIVE_KEY",
    "FIELD_ENCRYPTION_INDEX_KEY",
    "REGISTRATION_CODE",
    "ACCOUNT_LIMIT_CEILING",
    "ALLOW_UNVERIFIED_REGISTRATION",
    "DESKTOP_SYNC_ENABLED",
    "TRUSTED_CLIENT_IP_HEADER",
    "ADMIN_EMAIL",
    "ADMIN_PASSWORD",
    "ADMIN_ACTION_PASSWORD",
    "ADMIN_TOTP_SECRET",
    "ADMIN_ALLOWED_IPS",
  ];
  const plain = new Set([
    "NEXTAUTH_URL",
    "ACCOUNT_LIMIT_CEILING",
    "ALLOW_UNVERIFIED_REGISTRATION",
    "DESKTOP_SYNC_ENABLED",
    "TRUSTED_CLIENT_IP_HEADER",
    "FIELD_ENCRYPTION_ACTIVE_KEY",
  ]);
  if (names.some((key) => !e[key]))
    throw new Error(
      "Falta preparar alguna variable privada; no se ha enviado nada.",
    );
  for (const key of ["DATABASE_RUNTIME_URL", "DATABASE_ADMIN_RUNTIME_URL"]) {
    const url = new URL(e[key]);
    if (
      !url.hostname.includes("-pooler.") ||
      !["mappleo_runtime", "mappleo_admin_runtime"].includes(url.username)
    )
      throw new Error(
        "Solo se permiten usuarios SQL limitados y conexiones agrupadas.",
      );
  }
  const variables = names.map((key) => ({
    key,
    value: e[key],
    type: plain.has(key) ? "plain" : "sensitive",
    target: ["production"],
  }));
  // Prisma generate expects this variable. NEVER upload the owner/migration URI.
  variables.push({
    key: "DATABASE_URL",
    value: e.DATABASE_RUNTIME_URL,
    type: "sensitive",
    target: ["production"],
  });
  const result = await call(
    "/v10/projects/" + projectId + "/env?upsert=true",
    "POST",
    variables,
  );
  if (result.failed?.length)
    throw new Error(
      "Vercel rechazó alguna variable; revisa los nombres desde el panel sin exponer sus valores.",
    );
  await call("/v9/projects/" + projectId, "PATCH", {
    nodeVersion: "24.x",
    framework: "nextjs",
    previewDeploymentsDisabled: true,
    resourceConfig: {
      fluid: true,
      functionDefaultRegions: ["fra1"],
      functionDefaultTimeout: 30,
    },
  });
  const verified = await call("/v9/projects/" + projectId);
  console.log(
    JSON.stringify({
      productionOnly: true,
      previewDeploymentsDisabled: verified.previewDeploymentsDisabled,
      regions: verified.resourceConfig?.functionDefaultRegions,
      timeout: verified.resourceConfig?.functionDefaultTimeout,
    }),
  );
  console.log(
    `Variables de producción configuradas: ${variables.length}. No se ha creado ningún despliegue.`,
  );
}
