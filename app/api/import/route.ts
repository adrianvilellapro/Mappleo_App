import { requireApiUser, requireRecentIdentity } from "@/lib/auth";
import {
  securityResponse,
  withExpensiveOperation,
  SecurityError,
} from "@/lib/security/controls";
import { permittedOrigin } from "@/lib/security/request";
import { backupSchema } from "@/features/backup/schema";
import { backupWithinStructuralLimits } from "@/features/backup/preflight";
import { restoreBackup } from "@/features/backup/restore";
import {
  backupMaxBytes as MAX_BYTES,
  backupLimitMessage,
} from "@/features/backup/limits";

export const runtime = "nodejs";
const headers = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};
const error = (message: string, status: number) =>
  Response.json({ ok: false, error: message }, { status, headers });

export async function POST(request: Request) {
  try {
    const user = await requireApiUser();
    requireRecentIdentity(user);
    return await withExpensiveOperation(user.id, () =>
      importBackup(request, user.id),
    );
  } catch (cause) {
    return securityResponse(cause);
  }
}
async function importBackup(request: Request, userId: string) {
  const origin = request.headers.get("origin");
  if (
    !origin ||
    !permittedOrigin(
      origin,
      request.headers.get("host") ?? new URL(request.url).host,
    )
  )
    return error("Origen no permitido.", 403);
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json")
    return error("Selecciona un archivo JSON.", 415);
  if (Number(request.headers.get("content-length")) > MAX_BYTES)
    return error(backupLimitMessage, 413);
  if (!request.body) return error("El archivo está vacío.", 400);

  const reader = request.body.getReader();
  const payload = Buffer.allocUnsafe(MAX_BYTES);
  let size = 0;
  let timedOut = false;
  const deadline = setTimeout(() => {
    timedOut = true;
    void reader.cancel().catch(() => undefined);
  }, 10000);
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (size + value.byteLength > MAX_BYTES) {
        await reader.cancel();
        return error(backupLimitMessage, 413);
      }
      payload.set(value, size);
      size += value.byteLength;
    }
  } finally {
    clearTimeout(deadline);
    reader.releaseLock();
  }
  if (timedOut)
    return error(
      "La carga del archivo ha tardado demasiado. Vuelve a intentarlo.",
      408,
    );
  let raw: unknown;
  try {
    raw = JSON.parse(payload.subarray(0, size).toString("utf8"));
  } catch {
    return error("El archivo no contiene JSON válido.", 400);
  }
  if (!backupWithinStructuralLimits(raw))
    return error(
      "El archivo contiene una estructura o cantidad de datos no permitida.",
      413,
    );
  const parsed = backupSchema.safeParse(raw);
  if (!parsed.success)
    return error("Backup no válido: " + parsed.error.issues[0].message, 400);
  try {
    const counts = await restoreBackup(userId, parsed.data);
    return Response.json({ ok: true, ...counts }, { headers });
  } catch (cause) {
    if (cause instanceof SecurityError) return securityResponse(cause);
    if (
      cause instanceof Error &&
      cause.name === "PrismaClientValidationError" &&
      /Unknown argument [`\"]?faviconUrl/.test(cause.message)
    )
      return error(
        "No se ha podido restaurar el archivo en este momento. Vuelve a intentarlo más tarde. Tus datos no se han modificado.",
        503,
      );
    if (
      cause instanceof Error &&
      [
        "El archivo contiene candidaturas incompatibles.",
        "El archivo coincide con datos de otra cuenta.",
      ].includes(cause.message)
    )
      return error(cause.message, 409);
    console.error("Error al restaurar backup", {
      name: cause instanceof Error ? cause.name : "Unknown",
      code:
        cause && typeof cause === "object" && "code" in cause
          ? String(cause.code)
          : undefined,
    });
    return error(
      "No se ha podido restaurar el backup. No se ha aplicado ningún cambio.",
      409,
    );
  }
}
