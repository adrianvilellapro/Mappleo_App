import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { taskEnvironment } from "./task-environment";
const { file } = taskEnvironment();
if (!file.endsWith(".env.deploy-check"))
  throw new Error("La verificación solo usa el perfil de rama temporal.");
const npmCli =
  process.env.npm_execpath ||
  resolve(dirname(process.execPath), "node_modules/npm/bin/npm-cli.js");
if (!existsSync(npmCli))
  throw new Error("Ejecuta este script desde npm/npx para localizar npm.");
const child = spawn(process.execPath, [npmCli, "run", "build"], {
  stdio: "inherit",
  env: { ...process.env, MAPPLEO_DEPLOY_CHECK: "1" },
});
child.on("error", () => {
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
