import { browserBackup, browserStatistics } from "./browser";
import type { Statistics } from "@/features/statistics/model";
type Job =
  | { type: "backup"; raw: unknown; format: "pdf" | "csv"; section: string }
  | { type: "statistics"; report: Statistics; companyLabel: string };
const worker = self as unknown as {
  onmessage: ((event: MessageEvent<Job>) => void) | null;
  postMessage: (value: unknown, transfer?: Transferable[]) => void;
};
worker.onmessage = async (event) => {
  try {
    const job = event.data;
    const blob =
      job.type === "backup"
        ? await browserBackup(job.raw, job.format, job.section)
        : await browserStatistics(job.report, job.companyLabel);
    const bytes = await blob.arrayBuffer();
    worker.postMessage({ ok: true, bytes, mime: blob.type }, [bytes]);
  } catch (error) {
    worker.postMessage({
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "No se ha podido generar el informe.",
    });
  }
};
