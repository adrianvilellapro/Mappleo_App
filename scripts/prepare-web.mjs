import { rm, readFile, lstat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve, sep } from "node:path";

// Retire ONLY the generated demo from the previous version. The web application
// must not ship a demo, even if an old local/Vercel build cache still contains it.
const publicRoot = resolve(
  fileURLToPath(new URL("../public/", import.meta.url)),
);
const legacyDemo = resolve(publicRoot, "demo");
if (legacyDemo !== publicRoot + sep + "demo")
  throw Error("Unsafe generated output path");
const info = await lstat(legacyDemo).catch((error) => {
  if (error?.code === "ENOENT") return undefined;
  throw error;
});
if (info) {
  if (!info.isDirectory() || info.isSymbolicLink())
    throw Error("Unexpected legacy demo path");
  const marker = await readFile(resolve(legacyDemo, "index.html"), "utf8");
  if (!marker.includes("Mappleo demo") || !marker.includes("es/index.html"))
    throw Error("Unknown public/demo contents: refusing to delete user files");
  await rm(legacyDemo, { recursive: true, force: true });
  console.log(
    "Removed obsolete generated public/demo; the web build contains no demo.",
  );
}
