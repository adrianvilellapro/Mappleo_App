import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
try {
  require.resolve("braces/package.json");
} catch {
  process.exit(0);
} // Development-only dependency, absent in production-only installs.
execFileSync(
  process.execPath,
  [require.resolve("patch-package/index.js"), "--error-on-fail"],
  { stdio: "inherit" },
);
