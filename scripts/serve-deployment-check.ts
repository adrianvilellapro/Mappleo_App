import { createServer } from "node:https";
import { readFileSync } from "node:fs";
import next from "next";
import { taskEnvironment } from "./task-environment";
import { parse } from "dotenv";
const { file, target } = taskEnvironment();
const production = parse(readFileSync(".env.deploy"));
if (
  !file.endsWith(".env.deploy-check") ||
  target.hostname === production.DEPLOY_DATABASE_HOST ||
  process.env.NEXTAUTH_URL !== "https://localhost:3444"
)
  throw new Error("Solo se sirve la rama de verificación en localhost:3444.");
process.env.MAPPLEO_DEPLOY_CHECK = "1";
const app = next({ dev: false, hostname: "localhost", port: 3444 });
await app.prepare();
const server = createServer(
  {
    key: readFileSync("certificates/localhost-key.pem"),
    cert: readFileSync("certificates/localhost.pem"),
  },
  app.getRequestHandler(),
);
server.listen(3444, "127.0.0.1", () =>
  console.log(
    "Verificación HTTPS de la compilación y Neon disponible en localhost:3444 (solo local).",
  ),
);
async function shutdown() {
  server.close();
  await app.close();
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());
