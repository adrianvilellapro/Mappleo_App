import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
const files = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { encoding: "utf8" },
)
  .split("\0")
  .filter((file) => file && existsSync(file) && !file.startsWith(".env"));
mkdirSync(".deployment", { recursive: true });
writeFileSync(".deployment/linux-source-files.json", JSON.stringify(files));
console.log(
  "Lista de archivos publicables preparada para compilación Linux aislada.",
);
