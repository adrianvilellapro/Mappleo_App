import { createServer } from "node:https";
import { readFileSync } from "node:fs";
import { parse } from "dotenv";
import next from "next";
const env = parse(readFileSync(".env.test"));
for (const name of ["DATABASE_URL", "DATABASE_RUNTIME_URL"]) {
  const url = new URL(env[name]);
  if (
    !["localhost", "127.0.0.1"].includes(url.hostname) ||
    url.pathname !== "/mappleo_test"
  )
    throw Error("Solo se admite la base local mappleo_test.");
}
Object.assign(process.env, env, {
  NEXTAUTH_URL: "https://localhost:3445",
  MAPPLEO_DEPLOY_CHECK: "1",
  NODE_ENV: "production",
});
const app = next({ dev: false, hostname: "localhost", port: 3445 });
await app.prepare();
const server = createServer(
  {
    key: readFileSync("certificates/localhost-key.pem"),
    cert: readFileSync("certificates/localhost.pem"),
  },
  app.getRequestHandler(),
);
server.listen(3445, "127.0.0.1", () =>
  console.log(
    "Compilación de producción en HTTPS local:3445; solo mappleo_test.",
  ),
);
async function shutdown() {
  server.close();
  await app.close();
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());
