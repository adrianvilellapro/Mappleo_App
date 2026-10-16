"use client";
import { useState, useTransition } from "react";
import {
  Save,
  Trash2,
  Archive,
  ExternalLink,
  ArrowUpRight,
  Clock3,
} from "lucide-react";
import Link from "@/components/ui/app-link";
import { entities, activityTypes, statuses, type EntityKind } from "../config";
import {
  saveAction,
  deleteAction,
  archiveAction,
  activityAction,
} from "../actions";
import { type RecordRow, type SelectOptions } from "../types";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import { DeleteActivityButton } from "./delete-activity-button";
import { CompanyLogo } from "@/components/company-logo";
import { InterestRating } from "./interest-rating";
import { OfferPicker } from "./offer-picker";
import { TechnologyPicker } from "./technology-picker";
import { Select } from "@/components/ui/select";
import { ExpandableNotes } from "./expandable-notes";
import { ExpandableText } from "@/components/ui/expandable-text";
import { webUrl } from "../schemas";
import { notifyWorkspaceChange } from "@/lib/workspace-events";
function localInput(value: string) {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}
export function RecordEditor({
  kind,
  record,
  options,
  onDone,
  preset,
}: {
  kind: EntityKind;
  record?: RecordRow;
  options: SelectOptions;
  onDone: () => void;
  preset?: Record<string, string>;
}) {
  const config = entities[kind];
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [pending, startTransition] = useTransition(),
    [confirmDelete, setConfirmDelete] = useState(false);
  const submit = (form: HTMLFormElement) => {
    const data = new FormData(form),
      values: Record<string, unknown> = Object.fromEntries(data);
    if (record) values.expectedUpdatedAt = record.updatedAt;
    for (const field of config.fields) {
      if (field.type === "multiselect")
        values[field.name] = data.getAll(field.name);
      if (field.type === "tagpicker") {
        values[field.name] = [
          ...data.getAll(field.name).map(String),
          ...String(data.get(field.name + "Draft") ?? "")
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
        ];
        delete values[field.name + "Draft"];
      }
      if (field.type === "checkbox") values[field.name] = data.has(field.name);
      if (field.type === "datetime-local" && values[field.name])
        values[field.name] = new Date(String(values[field.name])).toISOString();
    }
    startTransition(async () => {
      setError("");
      const result = await saveAction(kind, record?.id, values);
      if (!result.ok) setError(result.error ?? "No se ha podido guardar.");
      else {
        notifyWorkspaceChange();
        onDone();
      }
    });
  };
  const prerequisite =
    kind === "offers" && !options.companies.length
      ? ["companies", "Crea primero una empresa"]
      : kind === "applications" && !options.offers.length
        ? ["offers", "Guarda primero una oferta"]
        : null;
  const logoCompany =
    kind === "companies"
      ? record
      : kind === "offers"
        ? record?.company
        : kind === "applications"
          ? record?.jobOffer?.company
          : null;
  const parsedLink = webUrl.safeParse(record?.websiteUrl || record?.url || "");
  const externalLink = parsedLink.success ? parsedLink.data : "";
  return (
    <div className="editor-body">
      {prerequisite && (
        <p className="info-note">
          <Link href={"/" + prerequisite[0] + "?new=1"}>
            {prerequisite[1]} <ArrowUpRight size={14} />
          </Link>{" "}
          para poder asociarla a este registro.
        </p>
      )}
      {record && (
        <div className="record-meta">
          {logoCompany && (
            <CompanyLogo
              companyId={logoCompany.id}
              name={logoCompany.name ?? "Empresa"}
              websiteUrl={logoCompany.websiteUrl}
              faviconUrl={logoCompany.faviconUrl}
            />
          )}
          <span>Actualizado {formatDate(String(record.updatedAt))}</span>
          <Link
            className="button"
            href={`/kanban?new=1&kind=${kind}&recordId=${encodeURIComponent(record.id)}`}
          >
            Crear acción <ArrowUpRight size={14} />
          </Link>
          {record.archivedAt && <span className="badge">Archivado</span>}
          {externalLink && (
            <a target="_blank" rel="noopener noreferrer" href={externalLink}>
              Abrir web <ExternalLink size={13} />
            </a>
          )}
        </div>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(e.currentTarget);
        }}
      >
        <fieldset disabled={pending} className="editor-fields">
          <div className="form-grid">
            {config.fields.map((field) => {
              let value =
                record?.[field.name] ??
                preset?.[field.name] ??
                field.defaultValue ??
                "";
              if (!record && ["appliedAt", "startsAt"].includes(field.name))
                value = new Date().toISOString();
              if (field.type === "datetime-local" && value)
                value = localInput(String(value));
              if (
                Array.isArray(value) &&
                field.type !== "multiselect" &&
                field.type !== "tagpicker"
              )
                value = value.join(", ");
              const related = field.relation ? options[field.relation] : null;
              const selectOptions = related
                ? Object.fromEntries(related.map((o) => [o.id, o.label]))
                : field.options;
              const readOnlyOffer = !!record && field.name === "jobOfferId";
              return (
                <div
                  key={field.name}
                  className={
                    [
                      "textarea",
                      "multiselect",
                      "checkbox",
                      "tagpicker",
                    ].includes(field.type ?? "") || field.name === "jobOfferId"
                      ? "form-wide"
                      : ""
                  }
                >
                  {field.type === "checkbox" ? (
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        name={field.name}
                        defaultChecked={!!value}
                      />
                      {field.label}
                    </label>
                  ) : field.type === "multiselect" ? (
                    <fieldset className="relation-picker">
                      <legend>{field.label}</legend>
                      {!related?.length && (
                        <p className="muted">
                          Todavía no hay registros para asociar.
                        </p>
                      )}
                      {related?.map((option) => (
                        <label className="checkbox-label" key={option.id}>
                          <input
                            type="checkbox"
                            name={field.name}
                            value={option.id}
                            defaultChecked={
                              (field.name === "companyIds"
                                ? record?.companies
                                : record?.contacts
                              )?.some((r) => r.id === option.id) ?? false
                            }
                          />
                          {option.label}
                        </label>
                      ))}
                    </fieldset>
                  ) : (
                    <>
                      <label htmlFor={field.name}>
                        {field.label}
                        {field.required && (
                          <span aria-hidden="true" className="required-mark">
                            {" "}
                            *
                          </span>
                        )}
                      </label>
                      {field.type === "rating" ? (
                        <InterestRating value={Number(value) || 3} />
                      ) : field.type === "tagpicker" ? (
                        <TechnologyPicker
                          initial={
                            Array.isArray(value) ? value.map(String) : []
                          }
                          options={options.technologies}
                        />
                      ) : field.name === "jobOfferId" ? (
                        <OfferPicker
                          options={options.offers}
                          value={String(value)}
                          readOnly={readOnlyOffer}
                        />
                      ) : kind === "applications" && field.name === "notes" ? (
                        <ExpandableNotes initial={String(value)} />
                      ) : field.type === "textarea" ? (
                        <textarea
                          id={field.name}
                          aria-describedby={
                            field.hint ? field.name + "-hint" : undefined
                          }
                          name={field.name}
                          rows={4}
                          defaultValue={String(value)}
                          maxLength={30000}
                        />
                      ) : field.type === "select" ? (
                        <>
                          <Select
                            id={field.name}
                            name={field.name}
                            defaultValue={String(
                              value ||
                                (field.relation && !field.required
                                  ? ""
                                  : Object.keys(selectOptions ?? {})[0] || ""),
                            )}
                            required={field.required}
                            disabled={pending}
                            options={[
                              ...(field.relation
                                ? [
                                    {
                                      value: "",
                                      label: field.required
                                        ? "Seleccionar…"
                                        : "Sin empresa",
                                    },
                                  ]
                                : []),
                              ...Object.entries(selectOptions ?? {}).map(
                                ([value, label]) => ({ value, label }),
                              ),
                            ]}
                          />
                        </>
                      ) : (
                        <input
                          id={field.name}
                          aria-describedby={
                            field.hint ? field.name + "-hint" : undefined
                          }
                          name={field.name}
                          type={
                            field.type === "url"
                              ? "text"
                              : (field.type ?? "text")
                          }
                          inputMode={field.type === "url" ? "url" : undefined}
                          required={field.required}
                          defaultValue={String(value)}
                          placeholder={
                            field.type === "url" ? "https://…" : undefined
                          }
                          min={field.type === "number" ? 0 : undefined}
                          max={field.type === "number" ? 100000000 : undefined}
                          maxLength={field.type === "number" ? undefined : 2048}
                        />
                      )}
                      {field.hint && (
                        <small id={field.name + "-hint"} className="field-hint">
                          {field.hint}
                        </small>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </fieldset>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <div className="editor-footer">
          <Button
            type="button"
            variant="outline"
            onClick={onDone}
            disabled={pending}
          >
            Cancelar
          </Button>
          <Button type="submit" disabled={pending || !!prerequisite}>
            <Save size={15} />
            {pending ? "Guardando…" : "Guardar cambios"}
          </Button>
        </div>
      </form>
      {record && (
        <section className="record-tools">
          {["companies", "offers"].includes(kind) && (
            <Button
              variant="outline"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await archiveAction(
                    kind,
                    record.id,
                    !record.archivedAt,
                  );
                  if (result.ok) {
                    notifyWorkspaceChange();
                    onDone();
                  } else setError(result.error ?? "Error al archivar.");
                })
              }
            >
              <Archive size={14} />
              {record.archivedAt ? "Restaurar" : "Archivar"}
            </Button>
          )}
          {!confirmDelete ? (
            <Button
              variant="ghost"
              className="danger-text"
              disabled={pending}
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 size={14} />
              Eliminar
            </Button>
          ) : (
            <div className="delete-confirm">
              <p>
                ¿Eliminar este registro
                {kind === "applications" ? " y su historial" : ""}? No se puede
                deshacer.
              </p>
              <Button
                variant="destructive"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const result = await deleteAction(kind, record.id);
                    if (result.ok) {
                      notifyWorkspaceChange();
                      onDone();
                    } else
                      setError(result.error ?? "No se ha podido eliminar.");
                  })
                }
              >
                Sí, eliminar
              </Button>
              <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
                Conservar
              </Button>
            </div>
          )}
        </section>
      )}
      {record && kind === "companies" && (
        <section className="related-actions">
          <h3>Ofertas y personas</h3>
          {record.offers?.map((o) => (
            <Link key={o.id} href={"/offers/" + o.id}>
              {o.title}
              <ArrowUpRight size={14} />
            </Link>
          ))}
          {record.contacts?.map((c) => (
            <Link key={c.id} href={"/contacts/" + c.id}>
              {c.name}
              <ArrowUpRight size={14} />
            </Link>
          ))}
          <Link href={"/offers?new=1&companyId=" + record.id}>
            Guardar una oferta <ArrowUpRight size={14} />
          </Link>
          <Link href={"/contacts?new=1&companyId=" + record.id}>
            Añadir un contacto <ArrowUpRight size={14} />
          </Link>
        </section>
      )}
      {record && kind === "offers" && (
        <section className="related-actions">
          <h3>Candidatura</h3>
          {record.applications?.length ? (
            <Link href={"/applications/" + record.applications[0].id}>
              Ver candidatura <ArrowUpRight size={14} />
            </Link>
          ) : (
            <Link href={"/applications?new=1&jobOfferId=" + record.id}>
              Registrar candidatura <ArrowUpRight size={14} />
            </Link>
          )}
        </section>
      )}
      {record && kind === "applications" && (
        <section className="timeline-section">
          <Link href={"/offers/" + record.jobOffer?.id}>
            Ver oferta y todos sus envíos <ArrowUpRight size={14} />
          </Link>
        </section>
      )}
      {record && kind === "offers" && (
        <section className="timeline-section">
          <h3>
            Histórico de candidaturas ({record.applications?.length ?? 0})
          </h3>
          <Link
            className="button button-primary"
            href={"/applications?new=1&jobOfferId=" + record.id}
          >
            Registrar nueva candidatura
          </Link>
          <ol className="timeline">
            {record.applications?.map((a) => (
              <li key={a.id}>
                <time>{formatDate(a.appliedAt, true)}</time>
                <Link href={"/applications/" + a.id}>
                  {statuses[a.status as keyof typeof statuses]}{" "}
                  <ArrowUpRight size={14} />
                </Link>
              </li>
            ))}
          </ol>
          {!record.applications?.length && (
            <p className="muted">
              Todavía no hay candidaturas para esta oferta.
            </p>
          )}
        </section>
      )}
      {record && kind === "applications" && (
        <section className="timeline-section">
          <h3>
            <Clock3 size={17} /> Historial del proceso
          </h3>
          <form
            className="activity-form"
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget,
                data = new FormData(form);
              startTransition(async () => {
                setNotice("");
                setError("");
                const result = await activityAction({
                  ...Object.fromEntries(data),
                  applicationId: record.id,
                  happenedAt: new Date(
                    String(data.get("happenedAt")),
                  ).toISOString(),
                });
                if (result.ok) {
                  form.reset();
                  setNotice("Actividad añadida.");
                  notifyWorkspaceChange();
                } else setError(result.error ?? "Error al guardar.");
              });
            }}
          >
            <label>
              Título de actividad
              <input
                name="title"
                required
                maxLength={200}
                placeholder="¿Qué ha pasado?"
              />
            </label>
            <div className="form-grid">
              <label>
                Tipo
                <Select
                  name="type"
                  label="Tipo"
                  defaultValue="NOTE"
                  disabled={pending}
                  options={Object.entries(activityTypes).map(
                    ([value, label]) => ({ value, label }),
                  )}
                />
              </label>
              <label>
                Fecha
                <input
                  name="happenedAt"
                  type="datetime-local"
                  required
                  defaultValue={localInput(new Date().toISOString())}
                />
              </label>
            </div>
            <label>
              Detalles
              <textarea name="description" rows={2} maxLength={30000} />
            </label>
            <Button variant="outline" disabled={pending} type="submit">
              Añadir al historial
            </Button>
            <p role="status">{notice}</p>
          </form>
          <ol className="timeline">
            {record.events?.map((event) => (
              <li key={event.id}>
                <time>{formatDate(event.happenedAt, true)}</time>
                <strong>{event.title}</strong>
                {event.fromStatus && event.toStatus && (
                  <small>
                    {statuses[event.fromStatus as keyof typeof statuses]} →{" "}
                    {statuses[event.toStatus as keyof typeof statuses]}
                  </small>
                )}
                {event.description && (
                  <ExpandableText
                    text={event.description}
                    label={event.title}
                  />
                )}
                <DeleteActivityButton id={event.id} title={event.title} />
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
