"use client";
import { backupSchema } from "@/features/backup/schema";
import type { Statistics } from "@/features/statistics/model";
import type { CsvSection } from "@/features/backup/sections";
import { backupMaxBytes, backupLimitMessage } from "@/features/backup/limits";
async function browserPdfDocument() {
  const [pdf, { default: regular }, { default: bold }] = await Promise.all([
    import("pdfkit"),
    import("pdfkit/standard-fonts/Helvetica"),
    import("pdfkit/standard-fonts/HelveticaBold"),
  ]);
  (
    pdf as unknown as { registerStdFonts: (...fonts: unknown[]) => void }
  ).registerStdFonts(regular, bold);
  return pdf.default;
}
export async function browserBackup(
  raw: unknown,
  format: "pdf" | "csv",
  section = "all",
) {
  const backup = backupSchema.parse(raw);
  if (format === "pdf") {
    const [PDFDocument, { renderBackupPdf }] = await Promise.all([
      browserPdfDocument(),
      import("@/features/backup/pdf-layout"),
    ]);
    const bytes = await renderBackupPdf(PDFDocument, backup);
    return new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
  }
  const [{ makeCsv }, { csvSections }] = await Promise.all([
    import("@/features/backup/csv"),
    import("@/features/backup/sections"),
  ]);
  if (section !== "all") {
    if (!csvSections.some((item) => item.id === section))
      throw Error("Sección no disponible.");
    const csv = makeCsv(backup, section as CsvSection);
    if (new TextEncoder().encode(csv).length > backupMaxBytes)
      throw Error(backupLimitMessage);
    return new Blob([csv], { type: "text/csv;charset=utf-8" });
  }
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  for (const item of csvSections)
    zip.file(item.filename, makeCsv(backup, item.id));
  const bytes = await zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
  });
  if (bytes.length > backupMaxBytes) throw Error(backupLimitMessage);
  return new Blob([new Uint8Array(bytes)], { type: "application/zip" });
}
export async function browserStatistics(
  report: Statistics,
  companyLabel: string,
) {
  const [PDFDocument, { renderStatisticsPdf }] = await Promise.all([
    browserPdfDocument(),
    import("@/features/statistics/pdf-layout"),
  ]);
  return new Blob(
    [
      new Uint8Array(
        await renderStatisticsPdf(PDFDocument, report, companyLabel),
      ),
    ],
    { type: "application/pdf" },
  );
}
