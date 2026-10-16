import PDFDocument from "pdfkit";
import type { Backup } from "./schema";
import { renderBackupPdf } from "./pdf-layout";
import { ReportLimitError } from "../reports/pdf-runtime";
import { SecurityError } from "@/lib/security/controls";
export function makePdf(backup: Backup): Promise<Buffer> {
  try {
    return renderBackupPdf(PDFDocument, backup)
      .then((bytes) => Buffer.from(bytes))
      .catch((error) => {
        if (error instanceof ReportLimitError)
          throw new SecurityError(error.message, 413);
        throw error;
      });
  } catch (error) {
    if (error instanceof ReportLimitError)
      throw new SecurityError(error.message, 413);
    throw error;
  }
}
