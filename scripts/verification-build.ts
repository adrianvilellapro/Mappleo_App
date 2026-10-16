import { parse } from "dotenv";
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawn } from "node:child_process";
const env = parse(readFileSync(".env.test"));
const url = new URL(env.DATABASE_URL);
if (
  !["127.0.0.1", "localhost"].includes(url.hostname) ||
  url.pathname !== "/mappleo_test"
)
  throw Error(
    "La compilación de prueba solo utiliza la base local mappleo_test.",
  );
const npm =
  process.env.npm_execpath ??
  resolve(dirname(process.execPath), "node_modules/npm/bin/npm-cli.js");
if (!existsSync(npm)) throw Error("Ejecuta desde npm o npx.");
const child = spawn(process.execPath, [npm, "run", "build"], {
  stdio: "inherit",
  env: { ...process.env, ...env, MAPPLEO_DEPLOY_CHECK: "1" },
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
