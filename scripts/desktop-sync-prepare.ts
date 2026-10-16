import { spawnSync } from "node:child_process";
import { Client } from "pg";
import { taskEnvironment } from "./task-environment";
import { runtimePoolConfig } from "../lib/db/connection";
const { target } = taskEnvironment();
const runtime = new URL(process.env.DATABASE_RUNTIME_URL!);
if (
  runtime.username !== "mappleo_runtime" ||
  runtime.pathname !== target.pathname ||
  (target.hostname.endsWith(".neon.tech")
    ? runtime.hostname.replace("-pooler.", ".") !== target.hostname
    : runtime.hostname !== target.hostname)
)
  throw new Error(
    "La conexión limitada no corresponde a esta base. No se ha modificado nada.",
  );
const result = spawnSync(
  process.execPath,
  ["node_modules/prisma/build/index.js", "migrate", "deploy"],
  { stdio: "inherit", env: process.env },
);
if (result.status !== 0)
  throw new Error(
    "La migración no se ha aplicado. No actives la sincronización.",
  );
const connection = new Client(
  runtimePoolConfig(target.href, process.env.DATABASE_SSL_CA),
);
await connection.connect();
try {
  await connection.query(
    'GRANT SELECT, INSERT, UPDATE, DELETE ON "DesktopDevice", "DesktopAuthorization", "SyncVersion" TO mappleo_runtime',
  );
  console.log(
    "Sincronización preparada: migraciones y permisos limitados. No se han creado cuentas, importado datos ni activado producción.",
  );
} finally {
  await connection.end();
}
