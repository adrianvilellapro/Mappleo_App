import "server-only";
import { headers, cookies } from "next/headers";
import { adminCookie } from "./config";
import { authenticateAdmin, assertAdminSource } from "./service";
import {
  trustedRequestSource,
  applicationOrigin,
  permittedOrigin,
} from "@/lib/security/request";
import { SecurityError } from "@/lib/security/controls";
import type { NextRequest } from "next/server";
export function adminRequestSource(request: NextRequest) {
  const source = trustedRequestSource(Object.fromEntries(request.headers));
  assertAdminSource(source);
  const proxiedHttps =
    !!process.env.TRUSTED_CLIENT_IP_HEADER &&
    request.headers.get("x-forwarded-proto") === "https";
  if (request.nextUrl.protocol !== "https:" && !proxiedHttps)
    throw new SecurityError("Administración requiere HTTPS.", 403);
  const origin = request.headers.get("origin");
  if (
    request.headers.get("sec-fetch-site") === "cross-site" ||
    (origin &&
      !permittedOrigin(
        origin,
        request.headers.get("host") ?? request.nextUrl.host,
      )) ||
    (request.method !== "GET" && !origin)
  )
    throw new SecurityError("Origen no permitido.", 403);
  return source;
}
export async function adminPageIdentity() {
  if (!applicationOrigin().startsWith("https:"))
    throw new SecurityError("Administración requiere HTTPS.", 403);
  const source = trustedRequestSource(Object.fromEntries(await headers()));
  return authenticateAdmin((await cookies()).get(adminCookie)?.value, source);
}
export async function smallAdminJson(request: Request) {
  if (
    request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !==
    "application/json"
  )
    throw new SecurityError("Formato no permitido.", 415);
  const reader = request.body?.getReader();
  if (!reader) throw new SecurityError("Petición inválida.", 400);
  const bytes = new Uint8Array(4096);
  let size = 0,
    chunks = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const read = async () => {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (++chunks > 1024 || size + value.length > bytes.length)
          throw new SecurityError("Petición demasiado grande.", 413);
        bytes.set(value, size);
        size += value.length;
      }
      return JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(
          bytes.subarray(0, size),
        ),
      );
    };
    return await Promise.race([
      read(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new SecurityError("Petición agotada.", 408)),
          5000,
        );
      }),
    ]);
  } catch (error) {
    if (error instanceof SecurityError) throw error;
    throw new SecurityError("Petición inválida.", 400);
  } finally {
    clearTimeout(timer);
    void reader.cancel().catch(() => undefined);
  }
}
