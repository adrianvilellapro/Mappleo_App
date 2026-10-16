import { isIP } from "node:net";

const loopback = (host: string) =>
  ["localhost", "127.0.0.1", "[::1]"].includes(host);
export function applicationOrigin() {
  const url = new URL(process.env.NEXTAUTH_URL ?? "http://localhost:3000");
  if (
    url.username ||
    url.password ||
    (!loopback(url.hostname) && url.protocol !== "https:")
  )
    throw new Error("Public deployments require NEXTAUTH_URL with HTTPS.");
  return url.origin;
}
export function permittedOrigin(origin: string, host: string) {
  try {
    const canonical = new URL(applicationOrigin());
    const incoming = new URL(origin);
    if (incoming.origin !== origin || incoming.host !== host) return false;
    if (canonical.origin === incoming.origin) return true;
    return (
      loopback(canonical.hostname) &&
      loopback(incoming.hostname) &&
      incoming.protocol === canonical.protocol &&
      incoming.port === canonical.port
    );
  } catch {
    return false;
  }
}
export function trustedRequestSource(
  headers: Record<string, string | string[] | undefined>,
) {
  const configured = process.env.TRUSTED_CLIENT_IP_HEADER?.toLowerCase();
  if (configured) {
    const value = headers[configured];
    // Only enable a header overwritten by your reverse proxy; never trust an arbitrary X-Forwarded-For.
    if (typeof value === "string" && isIP(value.trim())) return value.trim();
    throw new Error("Trusted proxy did not provide a valid client address.");
  }
  if (!loopback(new URL(applicationOrigin()).hostname))
    throw new Error(
      "Public deployments require TRUSTED_CLIENT_IP_HEADER and a trusted ingress.",
    );
  return "local-loopback";
}
