import { useState, type FormEvent } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X, Trash2 } from "lucide-react";
import { entities, type Field } from "../../../../packages/domain/tracker";
import type { Command, Kind, Workspace } from "../shared/contracts";
import { Select } from "../../../../packages/ui/select";
import { InterestRating } from "../../../../packages/ui/interest-rating";
import { TechnologyPicker } from "../../../../packages/ui/technology-picker";
import { getItems, inputDate, recordLabel, type Item, isEntity } from "./model";

export type EditorState = {
  kind: Kind;
  id?: string;
  defaults?: Record<string, unknown>;
};
type Props = {
  state: EditorState;
  data: Workspace;
  busy: boolean;
  mutate: (command: Command) => Promise<boolean>;
  close: () => void;
  saveHint?: string;
  deleteHint?: string;
};
const taskFields: Field[] = [
  { name: "title", label: "Título", required: true },
  { name: "columnId", label: "Columna", type: "select", required: true },
  { name: "dueAt", label: "Fecha", type: "datetime-local" },
  { name: "description", label: "Descripción", type: "textarea" },
];
export function Editor({
  state,
  data,
  mutate,
  busy,
  close,
  saveHint = "Se guarda primero en este ordenador.",
  deleteHint = "Esta acción no se puede deshacer desde la aplicación. Puedes exportar antes una copia JSON.",
}: Props) {
  const existing = state.id
    ? getItems(data, state.kind).find((r) => r.id === state.id)
    : undefined;
  const initial: Item = { id: "", ...state.defaults, ...existing };
  const fields = isEntity(state.kind)
    ? entities[state.kind].fields
    : state.kind === "tasks"
      ? taskFields
      : [
          { name: "name", label: "Nombre", required: true },
          { name: "position", label: "Posición", type: "select" as const },
        ];
  const [offerQuery, setOfferQuery] = useState("");
  const [selectedOffer, setSelectedOffer] = useState(
    String(initial.jobOfferId ?? ""),
  );
  const [selectedLinks, setSelectedLinks] = useState<
    { kind: string; recordId: string; label: string }[]
  >(
    (initial.links as
      { kind: string; recordId: string; label: string }[] | undefined) ?? [],
  );
  const [linkQuery, setLinkQuery] = useState("");
  const [deleteMode, setDeleteMode] = useState(false);
  const [moveTo, setMoveTo] = useState(
    (data.boardColumns ?? []).find((c) => c.id !== state.id && !c.isDone)?.id ??
      "",
  );
  const [deleteTasks, setDeleteTasks] = useState(false);
  const [error, setError] = useState("");
  const title = isEntity(state.kind)
    ? state.id
      ? "Editar " + entities[state.kind].singular
      : entities[state.kind].create
    : state.kind === "tasks"
      ? state.id
        ? "Editar tarea"
        : "Nueva tarea"
      : state.id
        ? "Editar columna"
        : "Nueva columna";
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget),
      input: Record<string, unknown> = {};
    for (const field of fields) {
      let value: unknown =
        field.type === "checkbox"
          ? form.has(field.name)
          : ["multiselect", "tagpicker"].includes(field.type ?? "")
            ? form.getAll(field.name).map(String)
            : String(form.get(field.name) ?? "");
      if (field.type === "datetime-local" && value)
        value = new Date(String(value)).toISOString();
      input[field.name] = value;
    }
    if (state.kind === "applications") {
      if (!selectedOffer) {
        setError("Selecciona una oferta.");
        return;
      }
      input.jobOfferId = selectedOffer;
    }
    if (state.kind === "tasks") input.links = selectedLinks;
    if (state.kind === "boardColumns") input.isDone = form.has("isDone");
    const success = await mutate({
      action: "save",
      kind: state.kind,
      id: state.id,
      input,
    });
    if (success) close();
  }
  const deletable =
    state.kind !== "boardColumns" || (data.boardColumns?.length ?? 0) > 1;
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open && !busy) close();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="modal-overlay" />
        <Dialog.Content
          className={"editor " + (state.kind === "tasks" ? "task-sheet" : "")}
        >
          <header>
            <div>
              <Dialog.Title>{title}</Dialog.Title>
              <Dialog.Description>{saveHint}</Dialog.Description>
            </div>
            <Dialog.Close
              className="icon-button"
              aria-label="Cerrar"
              disabled={busy}
            >
              <X size={20} />
            </Dialog.Close>
          </header>
          <form onSubmit={submit} className="editor-form">
            <div className="form-grid">
              {fields.map((field) => {
                const value = initial[field.name];
                let options = field.options
                  ? Object.entries(field.options).map(([value, label]) => ({
                      value,
                      label,
                    }))
                  : [];
                if (field.relation)
                  options = getItems(data, field.relation)
                    .slice()
                    .reverse()
                    .map((item) => ({
                      value: item.id,
                      label: recordLabel(data, field.relation!, item.id),
                    }));
                if (field.name === "columnId")
                  options = (data.boardColumns ?? [])
                    .slice()
                    .sort((a, b) => a.position - b.position)
                    .map((c) => ({ value: c.id, label: c.name }));
                if (field.name === "position")
                  options = Array.from(
                    {
                      length:
                        (data.boardColumns?.length ?? 0) + (state.id ? 0 : 1),
                    },
                    (_, i) => ({
                      value: String(i),
                      label: `${i + 1} · ${data.boardColumns?.slice().sort((a, b) => a.position - b.position)[i]?.name ?? "Al final"}`,
                    }),
                  );
                const fallback =
                  field.defaultValue ??
                  (field.name === "appliedAt" || field.name === "startsAt"
                    ? inputDate(new Date().toISOString())
                    : field.name === "columnId"
                      ? (options.find(
                          (o) =>
                            !(data.boardColumns ?? []).find(
                              (c) => c.id === o.value,
                            )?.isDone,
                        )?.value ?? options[0]?.value)
                      : field.name === "position"
                        ? String(data.boardColumns?.length ?? 0)
                        : field.type === "select"
                          ? options[0]?.value
                          : "");
                return (
                  <div
                    className={
                      field.type === "textarea" ||
                      field.type === "tagpicker" ||
                      field.type === "multiselect" ||
                      field.name === "jobOfferId"
                        ? "field wide"
                        : "field"
                    }
                    key={field.name}
                  >
                    <label htmlFor={field.name}>
                      {field.label}
                      {field.required ? " *" : ""}
                    </label>
                    {field.name === "jobOfferId" ? (
                      <div className="offer-combobox">
                        <input
                          type="search"
                          id="jobOfferId"
                          placeholder="Buscar oferta o empresa…"
                          value={offerQuery}
                          onChange={(e) => setOfferQuery(e.target.value)}
                        />
                        <div
                          className="offer-options"
                          role="listbox"
                          aria-label="Ofertas disponibles"
                        >
                          {data.offers
                            .slice()
                            .sort((a, b) =>
                              b.createdAt.localeCompare(a.createdAt),
                            )
                            .filter((o) =>
                              [
                                o.title,
                                recordLabel(data, "companies", o.companyId),
                              ]
                                .join(" ")
                                .toLowerCase()
                                .includes(offerQuery.toLowerCase()),
                            )
                            .map((o) => (
                              <button
                                type="button"
                                role="option"
                                aria-selected={selectedOffer === o.id}
                                key={o.id}
                                className={
                                  selectedOffer === o.id ? "selected" : ""
                                }
                                onClick={() => setSelectedOffer(o.id)}
                              >
                                <strong>{o.title}</strong>
                                <small>
                                  {recordLabel(data, "companies", o.companyId)}
                                </small>
                              </button>
                            ))}
                          {!data.offers.length && (
                            <p>Crea primero una empresa y una oferta.</p>
                          )}
                        </div>
                        {selectedOffer && (
                          <small>
                            Seleccionada:{" "}
                            {recordLabel(data, "offers", selectedOffer)}
                          </small>
                        )}
                      </div>
                    ) : field.type === "rating" ? (
                      <InterestRating value={Number(value ?? 3)} />
                    ) : field.type === "tagpicker" ? (
                      <TechnologyPicker
                        initial={(value as string[]) ?? []}
                        options={data.technologyTags ?? []}
                      />
                    ) : field.type === "select" ? (
                      <Select
                        id={field.name}
                        name={field.name}
                        label={field.label}
                        required={field.required}
                        options={[
                          ...(!field.required && field.relation
                            ? [{ value: "", label: "Sin asociar" }]
                            : []),
                          ...options,
                        ]}
                        defaultValue={String(value ?? fallback ?? "")}
                      />
                    ) : field.type === "multiselect" ? (
                      <div className="multi-options">
                        {options.map((option) => (
                          <label key={option.value}>
                            <input
                              type="checkbox"
                              name={field.name}
                              value={option.value}
                              defaultChecked={
                                Array.isArray(
                                  initial[
                                    field.name === "companyIds"
                                      ? "companies"
                                      : "contacts"
                                  ],
                                ) &&
                                (
                                  initial[
                                    field.name === "companyIds"
                                      ? "companies"
                                      : "contacts"
                                  ] as {
                                    id: string;
                                  }[]
                                ).some((r) => r.id === option.value)
                              }
                            />
                            {option.label}
                          </label>
                        ))}
                      </div>
                    ) : field.type === "textarea" ? (
                      <textarea
                        id={field.name}
                        name={field.name}
                        defaultValue={String(value ?? "")}
                        maxLength={30000}
                        rows={5}
                      />
                    ) : field.type === "checkbox" ? (
                      <input
                        id={field.name}
                        name={field.name}
                        type="checkbox"
                        defaultChecked={!!value}
                      />
                    ) : (
                      <input
                        id={field.name}
                        name={field.name}
                        type={
                          field.type === "url" ? "text" : (field.type ?? "text")
                        }
                        defaultValue={
                          field.type === "datetime-local"
                            ? inputDate(value) || String(fallback ?? "")
                            : Array.isArray(value)
                              ? value.join(", ")
                              : String(value ?? fallback ?? "")
                        }
                        required={field.required}
                        min={field.type === "number" ? 0 : undefined}
                        maxLength={
                          field.type === "number" ||
                          field.type === "datetime-local"
                            ? undefined
                            : 2048
                        }
                      />
                    )}
                    {field.hint && <small>{field.hint}</small>}
                  </div>
                );
              })}
            </div>
            {state.kind === "boardColumns" && (
              <label className="completion-destination">
                <input
                  type="checkbox"
                  name="isDone"
                  defaultChecked={!!initial.isDone}
                />{" "}
                Enviar aquí las tareas completadas
              </label>
            )}
            {state.kind === "tasks" && (
              <div className="field">
                <label htmlFor="task-link">Enlazar con un registro</label>
                <input
                  id="task-link"
                  type="search"
                  placeholder="Buscar empresa, oferta, candidatura, contacto o evento…"
                  value={linkQuery}
                  onChange={(e) => setLinkQuery(e.target.value)}
                />
                <div className="chips">
                  {selectedLinks.map((link) => (
                    <button
                      type="button"
                      key={link.kind + link.recordId}
                      onClick={() =>
                        setSelectedLinks(
                          selectedLinks.filter((l) => l !== link),
                        )
                      }
                    >
                      {link.label}
                      <X size={12} />
                    </button>
                  ))}
                </div>
                {linkQuery && (
                  <div className="link-options">
                    {(Object.keys(entities) as (keyof typeof entities)[])
                      .flatMap((kind) =>
                        getItems(data, kind).map((item) => ({
                          kind,
                          item,
                          label: recordLabel(data, kind, item.id),
                        })),
                      )
                      .filter(
                        (r) =>
                          r.label
                            .toLowerCase()
                            .includes(linkQuery.toLowerCase()) &&
                          !selectedLinks.some(
                            (l) =>
                              l.kind === r.kind && l.recordId === r.item.id,
                          ),
                      )
                      .slice(0, 10)
                      .map((r) => (
                        <button
                          type="button"
                          key={r.kind + r.item.id}
                          onClick={() => {
                            setSelectedLinks([
                              ...selectedLinks,
                              {
                                kind: r.kind,
                                recordId: r.item.id,
                                label: r.label,
                              },
                            ]);
                            setLinkQuery("");
                          }}
                        >
                          {entities[r.kind].title} · {r.label}
                        </button>
                      ))}
                  </div>
                )}
              </div>
            )}
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <footer>
              <button type="submit" className="button primary" disabled={busy}>
                Guardar cambios
              </button>
              <button
                type="button"
                className="button"
                disabled={busy}
                onClick={close}
              >
                Cancelar
              </button>
              {state.id && deletable && (
                <button
                  className="button danger push-right"
                  type="button"
                  disabled={busy}
                  onClick={() => setDeleteMode(!deleteMode)}
                >
                  <Trash2 size={15} />
                  Eliminar
                </button>
              )}
            </footer>
          </form>
          {deleteMode && (
            <section className="delete-confirm">
              <h3>Confirmar eliminación</h3>
              <p>{deleteHint}</p>
              {state.kind === "boardColumns" && (
                <>
                  <label>
                    <input
                      type="checkbox"
                      checked={deleteTasks}
                      onChange={(e) => setDeleteTasks(e.target.checked)}
                    />
                    Borrar también todas las tareas de la columna
                  </label>
                  {!deleteTasks && (
                    <Select
                      label="Mover tareas a"
                      options={(data.boardColumns ?? [])
                        .filter((c) => c.id !== state.id)
                        .map((c) => ({ value: c.id, label: c.name }))}
                      value={moveTo}
                      onValueChange={setMoveTo}
                    />
                  )}
                </>
              )}
              <button
                type="button"
                className="button danger"
                disabled={busy}
                onClick={async () => {
                  if (
                    await mutate({
                      action: "delete",
                      kind: state.kind,
                      id: state.id!,
                      ...(state.kind === "boardColumns"
                        ? deleteTasks
                          ? { deleteTasks: true }
                          : { moveTo }
                        : {}),
                    })
                  )
                    close();
                }}
              >
                Sí, eliminar{deleteTasks ? " columna y tareas" : ""}
              </button>
            </section>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
