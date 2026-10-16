import type { PoolConfig } from "pg";

export function runtimePoolConfig(connection: string, ca?: string): PoolConfig {
  let url: URL;
  try {
    url = new URL(connection);
  } catch {
    throw new Error("Invalid runtime database configuration.");
  }
  if (
    !["postgresql:", "postgres:"].includes(url.protocol) ||
    !url.hostname ||
    !url.pathname.slice(1)
  )
    throw new Error("Invalid runtime database configuration.");
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  // Passing a URI alongside ssl options lets pg query parameters override TLS/host.
  // Explicit options ignore those overrides and always verify remote certificates.
  return {
    host: url.hostname.replace(/^\[|\]$/g, ""),
    port: url.port ? Number(url.port) : 5432,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.slice(1)),
    ssl: local ? false : { rejectUnauthorized: true, ...(ca ? { ca } : {}) },
    enableChannelBinding: !local,
    application_name: "mappleo",
    max: 2,
    idleTimeoutMillis: 5000,
    allowExitOnIdle: true,
    connectionTimeoutMillis: 5000,
    statement_timeout: 35000,
  };
}
