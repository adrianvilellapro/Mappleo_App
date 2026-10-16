"use client";
import type { Statistics } from "@/features/statistics/model";
type Job =
  | { type: "backup"; raw: unknown; format: "pdf" | "csv"; section: string }
  | { type: "statistics"; report: Statistics; companyLabel: string };
export async function generateReport(job: Job): Promise<Blob> {
  if (typeof Worker === "undefined") return fallback(job);
  let worker: Worker;
  try {
    worker = new Worker(new URL("./export.worker.ts", import.meta.url), {
      type: "module",
    });
  } catch {
    return fallback(job);
  }
  return new Promise<Blob>((resolve, reject) => {
    const timeout = setTimeout(() => {
      worker.terminate();
      reject(
        Error(
          "La generación del informe ha tardado demasiado. Reduce los datos o filtros.",
        ),
      );
    }, 120000);
    worker.onmessage = (event) => {
      clearTimeout(timeout);
      worker.terminate();
      if (event.data.ok)
        resolve(new Blob([event.data.bytes], { type: event.data.mime }));
      else
        reject(
          Error(event.data.error || "No se ha podido generar el informe."),
        );
    };
    worker.onerror = () => {
      clearTimeout(timeout);
      worker.terminate();
      void fallback(job).then(resolve, reject);
    };
    worker.postMessage(job);
  });
}
async function fallback(job: Job) {
  const render = await import("./browser");
  return job.type === "backup"
    ? render.browserBackup(job.raw, job.format, job.section)
    : render.browserStatistics(job.report, job.companyLabel);
}
