import { Client } from "pg";
import { spawnSync } from "node:child_process";
import { taskEnvironment } from "./task-environment";
import { runtimePoolConfig } from "../lib/db/connection";
const { file, target, remote } = taskEnvironment();
if (!remote || !file.endsWith(".env.deploy"))
  throw new Error(
    "La inicialización solo admite el perfil explícito de producción.",
  );
const probe = new Client(runtimePoolConfig(target.href));
await probe.connect();
try {
  const tables = (
    await probe.query("SELECT tablename FROM pg_tables WHERE schemaname=$1", [
      "public",
    ])
  ).rows.map((r) => r.tablename);
  for (const table of [
    "User",
    "Company",
    "JobOffer",
    "Application",
    "Task",
    "Contact",
    "NetworkingEvent",
  ]) {
    if (
      tables.includes(table) &&
      Number(
        (await probe.query(`SELECT count(*) FROM "${table}"`)).rows[0].count,
      ) > 0
    )
      throw new Error(
        "La base contiene usuarios/datos: no se ejecutará una inicialización destinada a una base vacía.",
      );
  }
} finally {
  await probe.end();
}
const scripts = [
  "security-prepare",
  "encryption-prepare",
  "admin-prepare",
  "registration-prepare",
  "deployment-inspect",
];
function run(args: string[]) {
  const result = spawnSync(process.execPath, args, {
    encoding: "utf8",
    env: process.env,
  });
  if (result.status !== 0)
    throw new Error(
      "La preparación ha fallado en " +
        args[1] +
        "; se ha detenido sin continuar. Las credenciales permanecen en el archivo privado.",
    );
  process.stdout.write(result.stdout);
}
run(["node_modules/prisma/build/index.js", "migrate", "deploy"]);
for (const script of scripts)
  run([
    "node_modules/tsx/dist/cli.mjs",
    `scripts/${script}.ts`,
    "--env-file",
    file,
    "--allow-remote",
  ]);
console.log(
  "Base de producción inicializada sin importar ningún dato local ni ejecutar seeds.",
);
