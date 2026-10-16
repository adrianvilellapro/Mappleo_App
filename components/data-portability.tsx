"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { notifyWorkspaceChange } from "@/lib/workspace-events";
import { Database, Download, FileUp } from "lucide-react";
import { csvSections } from "@/features/backup/sections";
import { Select } from "@/components/ui/select";
import { useIdentityConfirmation } from "@/components/identity-confirmation";
import { useHydrated } from "@/lib/use-hydrated";
import { useBackupPassphrase } from "@/components/backup-passphrase";
import { backupMaxBytes, backupLimitMessage } from "@/features/backup/limits";
import {
  encryptedBackup,
  encryptBackup,
  decryptBackup,
} from "@/features/backup/encryption";

export function DataPortability() {
  const router = useRouter();
  const hydrated = useHydrated();
  const { secureFetch, dialog } = useIdentityConfirmation();
  const { askPassphrase, passwordDialog } = useBackupPassphrase();
  const [format, setFormat] = useState("json");
  const [section, setSection] = useState("all");
  const [file, setFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const url =
    "/api/export?format=json" +
    (format === "pdf" || format === "csv" ? "&render=client" : "");

  async function restore() {
    if (!file || pending) return;
    setError("");
    setMessage("");
    if (file.size > backupMaxBytes + 52) {
      setError(backupLimitMessage);
      return;
    }
    if (
      !window.confirm(
        "Los registros del backup con el mismo identificador actualizarán los actuales. Los demás se añadirán. No se borrará ningún dato. ¿Continuar?",
      )
    )
      return;
    setPending(true);
    try {
      let bytes = new Uint8Array(await file.arrayBuffer());
      if (encryptedBackup(bytes)) {
        const password = await askPassphrase("decrypt");
        if (password === null) return;
        bytes = await decryptBackup(bytes, password);
      }
      if (bytes.length > backupMaxBytes) throw new Error(backupLimitMessage);
      const response = await secureFetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: bytes,
      });
      if (!response.headers.get("content-type")?.includes("application/json"))
        throw new Error(
          "Tu sesión puede haber caducado. Vuelve a iniciar sesión.",
        );
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error ?? "No se ha podido importar el archivo.");
      setMessage(
        result.created === 0 && result.updated === 0
          ? "El backup es válido, pero no contiene registros. No se ha modificado nada."
          : "Restauración completada: " +
              result.created +
              " registros nuevos y " +
              result.updated +
              " existentes actualizados. Puedes importar el mismo archivo de nuevo sin duplicados.",
      );
      notifyWorkspaceChange();
      router.refresh(); // Route Handler imports do not return an updated RSC page.
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No se ha podido importar el archivo.",
      );
    } finally {
      setPending(false);
    }
  }
  async function download() {
    if (pending) return;
    setPending(true);
    setError("");
    try {
      let response = await secureFetch(url);
      let serverFallback = false;
      // Keep large CSV/ZIP exports that fit compressed but exceed raw JSON.
      if (response.status === 413 && format === "csv") {
        response = await secureFetch(
          "/api/export?format=csv&section=" + encodeURIComponent(section),
        );
        serverFallback = true;
      }
      if (!response.ok) {
        const result = await response.json();
        throw new Error(
          result.error ?? "No se ha podido descargar el archivo.",
        );
      }
      let blob =
        !serverFallback && (format === "pdf" || format === "csv")
          ? await (
              await import("@/features/reports/worker-client")
            ).generateReport({
              type: "backup",
              raw: await response.json(),
              format,
              section,
            })
          : await response.blob();
      if (format === "encrypted") {
        const password = await askPassphrase("encrypt");
        if (password === null) return;
        const encrypted = await encryptBackup(
          new Uint8Array(await blob.arrayBuffer()),
          password,
        );
        blob = new Blob([encrypted], { type: "application/octet-stream" });
      }
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      const date = new Date().toISOString().slice(0, 10);
      link.download =
        format === "pdf"
          ? "mappleo-informe-" + date + ".pdf"
          : format === "csv"
            ? section === "all"
              ? "mappleo-csv-" + date + ".zip"
              : "mappleo-" +
                csvSections.find((item) => item.id === section)!.filename
            : format === "encrypted"
              ? "mappleo-backup-" +
                new Date().toISOString().slice(0, 10) +
                ".mappleo"
              : (response.headers
                  .get("content-disposition")
                  ?.match(/filename="([^"]+)"/)?.[1] ??
                "mappleo-datos." + format);
      link.click();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 10000);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No se ha podido descargar el archivo.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      {dialog}
      {passwordDialog}
      <section className="panel settings-section">
        <h2>
          <Database size={18} /> Exportar tus datos
        </h2>
        <p>
          Elige cómo quieres descargarlos. JSON conserva todos los datos y sirve
          para restaurarlos. El PDF es un informe para leer o imprimir.
        </p>
        <div className="portability-controls">
          <label htmlFor="export-format">Formato</label>
          <Select
            id="export-format"
            value={format}
            onValueChange={setFormat}
            options={[
              { value: "json", label: "Backup JSON" },
              { value: "encrypted", label: "Backup cifrado (.mappleo)" },
              { value: "pdf", label: "Informe PDF" },
              { value: "csv", label: "Hojas CSV" },
            ]}
          />
          {format === "csv" && (
            <>
              <label htmlFor="export-section">Contenido CSV</label>
              <Select
                id="export-section"
                value={section}
                onValueChange={setSection}
                options={[
                  { value: "all", label: "Todo · ZIP con 6 CSV" },
                  ...csvSections.map((item) => ({
                    value: item.id,
                    label: item.label,
                  })),
                ]}
              />
            </>
          )}
          <button
            className="button button-outline"
            type="button"
            data-export-url={url}
            disabled={!hydrated || pending}
            onClick={() => {
              void download();
            }}
          >
            <Download size={16} /> Descargar{" "}
            {format === "encrypted" ? "backup cifrado" : format.toUpperCase()}
          </button>
        </div>
        {format === "csv" && (
          <small>
            «Todo» incluye un CSV por apartado, también el historial de
            candidaturas. Puedes descargar un único apartado con el selector.
          </small>
        )}
      </section>
      <section className="panel settings-section">
        <h2>
          <FileUp size={18} /> Restaurar un backup
        </h2>
        <p>
          Selecciona un backup JSON o cifrado (.mappleo) de Mappleo (máximo{" "}
          {backupMaxBytes / 1024 / 1024}
          MB). Los registros con el mismo identificador se actualizan; los
          nuevos se añaden. Los datos que ya tienes y no estén en el backup se
          conservan.
        </p>
        <div className="portability-controls">
          <label htmlFor="import-file">Archivo de backup</label>
          <input
            id="import-file"
            type="file"
            accept=".json,.mappleo,application/json,application/octet-stream"
            disabled={pending}
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              setMessage("");
              setError("");
            }}
          />
          <button
            className="button button-primary"
            type="button"
            disabled={!file || pending}
            onClick={restore}
          >
            <FileUp size={16} /> {pending ? "Restaurando…" : "Restaurar datos"}
          </button>
        </div>
        {message && (
          <p className="import-message" role="status">
            {message}
          </p>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <small>
          El JSON puede contener información personal. Guárdalo en un lugar
          privado.
        </small>
      </section>
    </>
  );
}
