import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { applicationOrigin, permittedOrigin } from "@/lib/security/request";

export function proxy(request: NextRequest) {
  const origin = applicationOrigin();
  const nonce = randomBytes(18).toString("base64");
  const development = process.env.NODE_ENV !== "production";
  const policy = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "worker-src 'self'",
    `connect-src 'self'${development ? (origin.startsWith("https:") ? " wss://localhost:* wss://127.0.0.1:*" : " ws://localhost:* ws://127.0.0.1:*") : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(origin.startsWith("https:") ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", policy);
  const mutating = !["GET", "HEAD", "OPTIONS"].includes(request.method);
  const requestOrigin = request.headers.get("origin");
  // Only native endpoints may omit Origin. They require PKCE or a scoped bearer
  // token in their own handler; cookie-based endpoints keep strict CSRF checks.
  const nativeDesktop =
    ["/api/desktop/token", "/api/desktop/sync", "/api/desktop/revoke"].includes(
      request.nextUrl.pathname,
    ) &&
    !requestOrigin &&
    !request.headers.get("sec-fetch-site") &&
    request.headers.get("x-mappleo-client") === "windows-v1";
  const invalid =
    mutating &&
    !nativeDesktop &&
    (!requestOrigin ||
      !permittedOrigin(
        requestOrigin,
        request.headers.get("host") ?? request.nextUrl.host,
      ) ||
      request.headers.get("sec-fetch-site") === "cross-site");
  const response = invalid
    ? NextResponse.json(
        { ok: false, error: "Origen no permitido." },
        { status: 403 },
      )
    : NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", policy);
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=()",
  );
  response.headers.set("Cache-Control", "private, no-store");
  if (origin.startsWith("https:"))
    response.headers.set("Strict-Transport-Security", "max-age=31536000");
  return response;
}
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|brand/).*)"],
};
