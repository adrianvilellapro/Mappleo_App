import { requireApiUser, requireRecentIdentity } from "@/lib/auth";
import {
  securityResponse,
  withExpensiveOperation,
  recordSecurityEvent,
  SecurityError,
} from "@/lib/security/controls";
import { createBackup } from "@/features/backup/data";
import { backupSchema } from "@/features/backup/schema";
import { makeCsv } from "@/features/backup/csv";
import { csvSections } from "@/features/backup/sections";
import { backupMaxBytes, backupLimitMessage } from "@/features/backup/limits";

export const runtime = "nodejs";
const date = () => new Date().toISOString().slice(0, 10);
function download(body: BodyInit, filename: string, contentType: string) {
  const bytes =
    typeof body === "string"
      ? Buffer.byteLength(body, "utf8")
      : body instanceof Uint8Array
        ? body.byteLength
        : 0;
  if (bytes > backupMaxBytes)
    throw new SecurityError(
      backupLimitMessage + " Exporta una sección más pequeña en CSV.",
      413,
    );
  return new Response(body, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": 'attachment; filename="' + filename + '"',
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function GET(request: Request) {
  try {
    const user = await requireApiUser();
    requireRecentIdentity(user);
    return await withExpensiveOperation(user.id, () =>
      exportBackup(request, user.id),
    );
  } catch (cause) {
    return securityResponse(cause);
  }
}
async function exportBackup(request: Request, userId: string) {
  const params = new URL(request.url).searchParams;
  const format = params.get("format") ?? "json";
  if (!["json", "csv", "pdf"].includes(format))
    return new Response("Formato no disponible.", { status: 400 });

  const backup = await createBackup(userId);
  await recordSecurityEvent("data_exported", userId);
  if (format === "json")
    return download(
      JSON.stringify(
        backup,
        null,
        params.get("render") === "client" ? undefined : 2,
      ),
      "mappleo-backup-" + date() + ".json",
      "application/json; charset=utf-8",
    );

  const parsed = backupSchema.parse(JSON.parse(JSON.stringify(backup)));
  if (format === "pdf") {
    const { makePdf } = await import("@/features/backup/pdf");
    const bytes = await makePdf(parsed);
    return download(
      new Uint8Array(bytes),
      "mappleo-informe-" + date() + ".pdf",
      "application/pdf",
    );
  }
  const requested = params.get("section");
  if (requested && requested !== "all") {
    const section = csvSections.find((item) => item.id === requested);
    if (!section)
      return new Response("Sección no disponible.", { status: 400 });
    return download(
      makeCsv(parsed, section.id),
      "mappleo-" + section.filename,
      "text/csv; charset=utf-8",
    );
  }
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  for (const section of csvSections)
    zip.file(section.filename, makeCsv(parsed, section.id));
  const bytes = await zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
  });
  return download(
    new Uint8Array(bytes),
    "mappleo-csv-" + date() + ".zip",
    "application/zip",
  );
}
