// Run inside an ephemeral official Node 24 container with /source mounted read-only.
// Copies only public source paths; never copy private env files or local artifacts.
import { readFileSync, mkdirSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
const files = JSON.parse(
  readFileSync("/source/.deployment/linux-source-files.json", "utf8"),
);
const root = "/tmp/mappleo-build";
mkdirSync(root, { recursive: true });
for (const file of files) {
  if (
    typeof file !== "string" ||
    file.split(/[\\/]/).includes("..") ||
    file.startsWith("/") ||
    file.startsWith(".env") ||
    file.startsWith(".deployment")
  )
    throw new Error("Ruta no publicable.");
  const dest = join(root, file);
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(join("/source", file), dest);
}
process.chdir(root);
for (const args of [["ci"], ["run", "build"]]) {
  const result = spawnSync("npm", args, { stdio: "inherit", env: process.env });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
const proof = {};
for (const route of ["export", "statistics/pdf", "auth/[...nextauth]"]) {
  const trace = JSON.parse(
    readFileSync(
      ".next/server/app/api/" + route + "/route.js.nft.json",
      "utf8",
    ),
  );
  proof[route] = {
    metrics: trace.files.filter((f) => f.endsWith(".afm")).length,
    native: trace.files.filter((f) => f.endsWith(".node")).length,
  };
}
console.log("Linux Node24 build/tracing: " + JSON.stringify(proof));
