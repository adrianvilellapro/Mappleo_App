import { build } from "vite";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { demoConfig } from "../apps/demo/vite.config";
const output = fileURLToPath(new URL("../apps/demo/dist/", import.meta.url));
for (const language of ["es", "en"] as const)
  await build({ ...demoConfig(language), configFile: false });
await mkdir(output, { recursive: true });
await writeFile(
  output + "index.html",
  '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="0;url=es/index.html"><title>Mappleo demo</title></head><body><p>Demo estática / Static demo: <a href="es/index.html">Español</a> · <a href="en/index.html">English</a></p></body></html>',
);
await writeFile(output + ".nojekyll", "");
console.log(
  "Standalone static demo built in apps/demo/dist for GitHub Pages. Never copied into the web application. No database or .env loaded.",
);
