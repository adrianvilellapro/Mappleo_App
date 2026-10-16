import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Upload,
  FileText,
  Trash2,
  Download,
  X,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type {
  LocalDocument,
  DocumentCategory,
  Workspace,
} from "../shared/contracts";
import { Select } from "../../../../packages/ui/select";
const categories = {
  cv: "Currículum",
  letter: "Carta de presentación",
  other: "Otro documento",
};
function PdfPreview({ content }: { content: string }) {
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null),
    [page, setPage] = useState(1),
    [error, setError] = useState("");
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let active = true;
    let loading:
      ReturnType<typeof import("pdfjs-dist").getDocument> | undefined;
    void import("pdfjs-dist")
      .then((pdf) => {
        if (!active) return;
        pdf.GlobalWorkerOptions.workerSrc = workerUrl;
        loading = pdf.getDocument({
          data: Uint8Array.from(atob(content), (c) => c.charCodeAt(0)),
          useSystemFonts: true,
          useWorkerFetch: false,
          enableXfa: false,
        });
        return loading.promise.then((doc) => {
          if (active) setDocument(doc);
        });
      })
      .catch(() => {
        if (active)
          setError(
            "No se puede previsualizar este PDF. Puede estar dañado o protegido por contraseña. Puedes guardar el original.",
          );
      });
    return () => {
      active = false;
      void loading?.destroy();
    };
  }, [content]);
  useEffect(() => {
    let active = true;
    let render:
      | ReturnType<Awaited<ReturnType<PDFDocumentProxy["getPage"]>>["render"]>
      | undefined;
    if (document && canvas.current)
      void document
        .getPage(page)
        .then((pdfPage) => {
          if (!active || !canvas.current) return;
          const base = pdfPage.getViewport({ scale: 1 });
          const viewport = pdfPage.getViewport({
            scale: Math.min(1.3, 1800 / base.width, 1800 / base.height),
          });
          canvas.current.width = viewport.width;
          canvas.current.height = viewport.height;
          render = pdfPage.render({ canvas: canvas.current, viewport });
          return render.promise;
        })
        .catch(() => {
          if (active) setError("No se ha podido dibujar esta página.");
        });
    return () => {
      active = false;
      render?.cancel();
    };
  }, [document, page]);
  return (
    <div className="pdf-preview">
      {error ? (
        <p role="alert">{error}</p>
      ) : (
        <>
          <div className="settings-actions">
            <button
              className="button"
              aria-label="Página anterior"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft size={16} />
            </button>
            <span>
              Página {page} de {document?.numPages ?? "…"}
            </span>
            <button
              className="button"
              aria-label="Página siguiente"
              disabled={!document || page >= document.numPages}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight size={16} />
            </button>
          </div>
          <canvas ref={canvas} aria-label="Vista previa del PDF" role="img" />
          {!document && <p>Abriendo PDF local…</p>}
        </>
      )}
    </div>
  );
}
export function FilesView({
  data,
  offerId,
  heading,
  openOffer,
}: {
  data: Workspace;
  offerId?: string;
  heading?: string;
  openOffer: (id: string) => void;
}) {
  const [files, setFiles] = useState<LocalDocument[]>([]),
    [category, setCategory] = useState<DocumentCategory>("cv"),
    [query, setQuery] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [selected, setSelected] = useState<string | null>(null);
  async function refresh() {
    const r = await window.mappleo.listDocuments();
    if (r.ok) setFiles(r.data);
    else setError(r.error);
  }
  useEffect(() => {
    void refresh();
  }, []);
  async function add() {
    setBusy(true);
    setError("");
    try {
      const r = await window.mappleo.importDocument(category);
      if (!r.ok) throw Error(r.error);
      if (r.data) {
        if (offerId && !r.data.offerIds.includes(offerId)) {
          const u = await window.mappleo.updateDocument(r.data.id, {
            name: r.data.name,
            category: r.data.category,
            offerIds: [...r.data.offerIds, offerId],
          });
          if (!u.ok) throw Error(u.error);
        }
        await refresh();
        setSelected(r.data.id);
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No se pudo guardar el archivo.",
      );
    } finally {
      setBusy(false);
    }
  }
  const visible = files.filter(
    (f) =>
      (!offerId || f.offerIds.includes(offerId)) &&
      f.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  );
  return (
    <section
      className={offerId ? "panel detail-panel local-files" : "local-files"}
    >
      <header className="page-heading">
        <div>
          <h1>
            {heading ?? (offerId ? "Archivos de esta oferta" : "Archivos")}
          </h1>
          <p>
            Solo en este ordenador. Nunca se suben ni sincronizan con la web.
          </p>
        </div>
        <div className="settings-actions">
          <Select
            label="Tipo de documento"
            value={category}
            onValueChange={(v) => setCategory(v as DocumentCategory)}
            options={Object.entries(categories).map(([value, label]) => ({
              value,
              label,
            }))}
          />
          <button
            className="button primary"
            onClick={() => void add()}
            disabled={busy}
          >
            <Upload size={16} />
            Añadir archivo
          </button>
        </div>
      </header>
      <p className="muted">
        PDF, PNG, JPG o TXT · Hasta 10 MB por archivo y 200 MB en total. Para
        Word, guarda primero como PDF. Las copias JSON no incluyen estos
        documentos: utiliza «Guardar copia» para conservar el original.
      </p>
      <input
        className="file-search"
        aria-label="Buscar archivos"
        type="search"
        placeholder="Buscar archivos…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {offerId && (
        <Select
          label="Vincular un archivo existente"
          value=""
          options={[
            { value: "", label: "Vincular un archivo existente…" },
            ...files
              .filter((f) => !f.offerIds.includes(offerId))
              .map((f) => ({ value: f.id, label: f.name })),
          ]}
          onValueChange={async (id) => {
            const f = files.find((f) => f.id === id);
            if (!f) return;
            const r = await window.mappleo.updateDocument(id, {
              name: f.name,
              category: f.category,
              offerIds: [...f.offerIds, offerId],
            });
            if (r.ok) await refresh();
            else setError(r.error);
          }}
        />
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="document-grid">
        {visible.map((file) => (
          <button
            className="panel document-card"
            key={file.id}
            onClick={() => setSelected(file.id)}
          >
            <FileText size={26} />
            <strong>{file.name}</strong>
            <small>
              {categories[file.category]} · {(file.size / 1024).toFixed(0)} KB
            </small>
            <small>
              {file.offerIds.length
                ? `${file.offerIds.length} ofertas vinculadas`
                : "Sin ofertas vinculadas"}
            </small>
          </button>
        ))}
      </div>
      {!visible.length && <p>No hay archivos aquí todavía.</p>}
      {selected && (
        <DocumentSheet
          key={selected}
          id={selected}
          data={data}
          close={() => setSelected(null)}
          changed={refresh}
          openOffer={(id) => {
            setSelected(null);
            openOffer(id);
          }}
        />
      )}
    </section>
  );
}
function DocumentSheet({
  id,
  data,
  close,
  changed,
  openOffer,
}: {
  id: string;
  data: Workspace;
  close: () => void;
  changed: () => Promise<void>;
  openOffer: (id: string) => void;
}) {
  const [loaded, setLoaded] = useState<{
      document: LocalDocument;
      content: string;
    } | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [offerQuery, setOfferQuery] = useState("");
  useEffect(() => {
    let active = true;
    void window.mappleo.readDocument(id).then((r) => {
      if (active) {
        if (r.ok) setLoaded(r.data);
        else setError(r.error);
      }
    });
    return () => {
      active = false;
    };
  }, [id]);
  const update = (change: Partial<LocalDocument>) =>
    setLoaded((prev) =>
      prev ? { ...prev, document: { ...prev.document, ...change } } : prev,
    );
  const file = loaded?.document;
  return (
    <Dialog.Root
      open
      onOpenChange={(v) => {
        if (!v && !busy) close();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="modal-overlay" />
        <Dialog.Content className="editor document-sheet">
          <header>
            <div>
              <Dialog.Title>{file?.name ?? "Archivo local"}</Dialog.Title>
              <Dialog.Description>
                Documento y enlaces privados de este equipo; no se sincronizan.
              </Dialog.Description>
            </div>
            <Dialog.Close
              className="icon-button"
              aria-label="Cerrar archivo"
              disabled={busy}
            >
              <X size={20} />
            </Dialog.Close>
          </header>
          <div className="document-content">
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            {file && loaded && (
              <>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setBusy(true);
                    const result = await window.mappleo.updateDocument(id, {
                      name: file.name,
                      category: file.category,
                      offerIds: file.offerIds.filter((id) =>
                        data.offers.some((o) => o.id === id),
                      ),
                    });
                    if (result.ok) await changed();
                    else setError(result.error);
                    setBusy(false);
                  }}
                >
                  <label>
                    Nombre del archivo
                    <input
                      value={file.name}
                      maxLength={180}
                      required
                      onChange={(e) => update({ name: e.target.value })}
                    />
                  </label>
                  <Select
                    label="Categoría del archivo"
                    value={file.category}
                    onValueChange={(v) =>
                      update({ category: v as DocumentCategory })
                    }
                    options={Object.entries(categories).map(
                      ([value, label]) => ({ value, label }),
                    )}
                  />
                  <label>
                    Vincular ofertas
                    <input
                      type="search"
                      value={offerQuery}
                      onChange={(e) => setOfferQuery(e.target.value)}
                      placeholder="Buscar oferta o empresa…"
                    />
                  </label>
                  <div className="document-offers">
                    {data.offers
                      .filter(
                        (o) =>
                          file.offerIds.includes(o.id) ||
                          (offerQuery &&
                            (
                              o.title +
                              " " +
                              data.companies.find((c) => c.id === o.companyId)
                                ?.name
                            )
                              .toLocaleLowerCase()
                              .includes(offerQuery.toLocaleLowerCase())),
                      )
                      .slice(0, 30)
                      .map((o) => (
                        <div key={o.id}>
                          <label>
                            <input
                              type="checkbox"
                              checked={file.offerIds.includes(o.id)}
                              onChange={(e) =>
                                update({
                                  offerIds: e.target.checked
                                    ? [...file.offerIds, o.id]
                                    : file.offerIds.filter((id) => id !== o.id),
                                })
                              }
                            />
                            {o.title}
                          </label>
                          {file.offerIds.includes(o.id) && (
                            <button
                              type="button"
                              className="text-button"
                              onClick={() => openOffer(o.id)}
                            >
                              Abrir oferta <ArrowUpRight size={13} />
                            </button>
                          )}
                        </div>
                      ))}
                  </div>
                  <div className="settings-actions">
                    <button className="button primary" disabled={busy}>
                      Guardar enlaces y nombre
                    </button>
                    <button
                      type="button"
                      className="button"
                      disabled={busy}
                      onClick={async () => {
                        const r = await window.mappleo.exportDocument(id);
                        if (!r.ok) setError(r.error);
                      }}
                    >
                      <Download size={15} />
                      Guardar copia
                    </button>
                    <button
                      type="button"
                      className="button danger"
                      disabled={busy}
                      onClick={async () => {
                        const r = await window.mappleo.deleteDocument(id);
                        if (r.ok && r.data) {
                          await changed();
                          close();
                        } else if (!r.ok) setError(r.error);
                      }}
                    >
                      <Trash2 size={15} />
                      Eliminar archivo
                    </button>
                  </div>
                </form>
                {file.mime === "application/pdf" ? (
                  <PdfPreview content={loaded.content} />
                ) : file.mime === "text/plain" ? (
                  <pre className="long-text">
                    {new TextDecoder().decode(
                      Uint8Array.from(atob(loaded.content), (c) =>
                        c.charCodeAt(0),
                      ),
                    )}
                  </pre>
                ) : (
                  <img
                    className="document-image"
                    src={`data:${file.mime};base64,${loaded.content}`}
                    alt={file.name}
                  />
                )}
              </>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
