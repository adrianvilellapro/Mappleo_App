import { config, parse } from "dotenv";
import { existsSync, readFileSync } from "node:fs";
import { resolve, basename } from "node:path";

export function taskEnvironment() {
  const test = process.argv.includes("--test");
  const flag = process.argv.indexOf("--env-file");
  const file = flag >= 0 ? process.argv[flag + 1] : test ? ".env.test" : ".env";
  if (!file || !existsSync(file))
    throw new Error("Falta el archivo privado de configuración.");
  if (test && basename(file) !== ".env.test")
    throw new Error("Las pruebas solo usan .env.test.");
  config({ path: file, override: true, quiet: true });
  const target = new URL(process.env.DATABASE_URL!);
  const remote = !["localhost", "127.0.0.1", "[::1]"].includes(target.hostname);
  if (test && (remote || target.pathname !== "/mappleo_test"))
    throw new Error("Las pruebas solo pueden usar mappleo_test local.");
  if (
    remote &&
    (!process.argv.includes("--allow-remote") ||
      [".env", ".env.local", ".env.test"].includes(basename(file)) ||
      !target.hostname.endsWith(".neon.tech") ||
      target.hostname.includes("-pooler.") ||
      target.hostname !== process.env.DEPLOY_DATABASE_HOST)
  )
    throw new Error(
      "Preparación remota denegada: usa un archivo separado, host directo confirmado y --allow-remote.",
    );
  return { file: resolve(file), test, target, remote };
}
export function localRoleFallback(test: boolean) {
  return test && existsSync(".env") ? parse(readFileSync(".env")) : {};
}
export function runtimeUrl(target: URL) {
  const url = new URL(target);
  if (target.hostname.endsWith(".neon.tech"))
    url.hostname = target.hostname.replace(/^(ep-[^.]+)(\.)/, "$1-pooler$2");
  return url;
}
