import { build as bundle } from "esbuild";
import { build } from "vite";
import { mkdir, copyFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

process.chdir(fileURLToPath(new URL("..", import.meta.url)));
await mkdir("dist", { recursive: true });
await bundle({
  entryPoints: ["src/main/index.ts"],
  outfile: "dist/main.cjs",
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node24",
  external: ["electron"],
  alias: { "@": fileURLToPath(new URL("../../../", import.meta.url)) },
});
await bundle({
  entryPoints: ["src/preload/index.ts"],
  outfile: "dist/preload.cjs",
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node24",
  external: ["electron"],
});
await build();
await copyFile("../../public/brand/mappleo-logo.png", "dist/renderer/logo.png");
await copyFile("resources/icon.png", "dist/icon.png");
console.log(
  "Mappleo Windows: interfaz y procesos compilados (sin secretos ni configuración de la nube).",
);
