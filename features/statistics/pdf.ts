import PDFDocument from "pdfkit";
import type { Statistics } from "./model";
import { renderStatisticsPdf } from "./pdf-layout";
export async function statisticsPdf(
  report: Statistics,
  companyLabel: string,
): Promise<Buffer> {
  return Buffer.from(await renderStatisticsPdf(PDFDocument, report, companyLabel));
}
