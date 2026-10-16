import "dotenv/config";
import { spawn } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { createPrivateKey, X509Certificate } from "node:crypto";
import { createSelfSignedCertificate } from "next/dist/lib/mkcert.js";

const origin = new URL(process.env.NEXTAUTH_URL ?? "");
if (
  origin.protocol !== "https:" ||
  !["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname)
)
  throw new Error("Local HTTPS requires NEXTAUTH_URL=https://localhost:3000.");
// Unlike next's automatic flag, do NOT fall back to HTTP if certificate generation fails.
const certificate = await createSelfSignedCertificate("localhost");
if (!certificate?.rootCA || !existsSync(certificate.rootCA))
  throw new Error(
    "HTTPS certificate unavailable. No HTTP server was started. Check Windows certificate installation permissions.",
  );
const cert = new X509Certificate(readFileSync(certificate.cert));
if (
  !cert.checkHost("localhost") ||
  !cert.checkIP("127.0.0.1") ||
  !cert.checkPrivateKey(createPrivateKey(readFileSync(certificate.key))) ||
  Date.parse(cert.validTo) <= Date.now()
)
  throw new Error(
    "Invalid or expired local HTTPS certificate. No HTTP server was started.",
  );
const args = [
  "node_modules/next/dist/bin/next",
  "dev",
  "--hostname",
  "127.0.0.1",
  "--experimental-https",
  "--experimental-https-key",
  certificate.key,
  "--experimental-https-cert",
  certificate.cert,
  ...process.argv.slice(2),
];
const child = spawn(process.execPath, args, {
  stdio: "inherit",
  env: { ...process.env, NODE_EXTRA_CA_CERTS: certificate.rootCA },
});
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => child.kill(signal));
child.on("exit", (code) => process.exit(code ?? 1));
