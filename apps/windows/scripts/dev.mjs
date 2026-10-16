import { createServer } from "vite";
import { build } from "esbuild";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mkdir, copyFile } from "node:fs/promises";
import electron from "electron";
process.chdir(fileURLToPath(new URL("..", import.meta.url)));
await mkdir("dist/renderer", { recursive: true });
await copyFile("../../public/brand/mappleo-logo.png", "dist/renderer/logo.png");
await copyFile("resources/icon.png", "dist/icon.png");
const shared = {
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node24",
  external: ["electron"],
};
await build({
  ...shared,
  entryPoints: ["src/main/index.ts"],
  outfile: "dist/main.cjs",
  alias: { "@": fileURLToPath(new URL("../../../", import.meta.url)) },
});
await build({
  ...shared,
  entryPoints: ["src/preload/index.ts"],
  outfile: "dist/preload.cjs",
});
const server = await createServer();
await server.listen();
console.info(
  "[Mappleo] Servidor de desarrollo listo en http://127.0.0.1:5178. Abriendo la ventana…",
);
const env = {
  ...process.env,
  MAPPLEO_DESKTOP_DEV_URL: "http://127.0.0.1:5178",
};
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(electron, ["."], {
  env,
  stdio: "inherit",
  // This child is the GUI the user requested. Hiding it can suppress ShowWindow.
  windowsHide: false,
});
child.on("error", async () => {
  console.error(
    "No se ha podido iniciar Electron. Ejecuta npm.cmd run desktop:install y vuelve a intentarlo.",
  );
  await server.close();
  process.exitCode = 1;
});
const stop = async () => {
  if (!child.killed) child.kill();
  await server.close();
};
process.on("SIGINT", () => {
  void stop();
});
child.on("exit", async (code) => {
  await server.close();
  process.exitCode = code ?? 1;
});
