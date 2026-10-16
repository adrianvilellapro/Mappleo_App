import { useState, type ReactNode } from "react";
import { Plus, Pencil, ArrowUpRight, Trash2 } from "lucide-react";
import {
  entities,
  activityTypes,
  workModes,
  type EntityKind,
} from "../../../../packages/domain/tracker";
import type { Kind } from "../shared/contracts";
import { Select } from "../../../../packages/ui/select";
import { Avatar, Badge, Empty, type ViewProps } from "./Views";
import {
  formatDate,
  getItems,
  inputDate,
  isEntity,
  recordLabel,
  subtitle,
  type Item,
} from "./model";
function Notes({ text }: { text: unknown }) {
  if (!text) return null;
  const value = String(text);
  return value.length > 450 ? (
    <details className="folded-notes">
      <summary>
        {value.slice(0, 300)}… <span>Ver texto completo</span>
      </summary>
      <p className="long-text">{value}</p>
    </details>
  ) : (
    <p className="long-text">{value}</p>
  );
}
export function RecordDetails({
  kind,
  id,
  external,
  renderFiles,
  ...props
}: ViewProps & {
  kind: Kind;
  id: string;
  external: (url: string) => void;
  renderFiles?: (offerId: string, heading?: string) => ReactNode;
}) {
  const { data, open, edit, mutate, busy } = props,
    item = getItems(data, kind).find((r) => r.id === id)!;
  const [activityType, setActivityType] = useState("NOTE");
  const links = ["websiteUrl", "careersUrl", "linkedinUrl", "url"].filter(
    (key) => item[key],
  );
  const related: { kind: Kind; item: Item }[] = [];
  if (kind === "companies") {
    data.offers
      .filter((o) => o.companyId === id)
      .forEach((item) => related.push({ kind: "offers", item }));
    data.contacts
      .filter((c) => c.companyId === id)
      .forEach((item) => related.push({ kind: "contacts", item }));
  }
  if (kind === "offers") {
    data.applications
      .filter((a) => a.jobOfferId === id)
      .forEach((item) => related.push({ kind: "applications", item }));
  }
  const application =
    kind === "applications" ? data.applications.find((a) => a.id === id) : null;
  return (
    <>
      <header className="page-heading">
        <div className="detail-title">
          <Avatar
            text={subtitle(data, kind, item) || recordLabel(data, kind, id)}
          />
          <div>
            <h1>{recordLabel(data, kind, id)}</h1>
            <p>{subtitle(data, kind, item)}</p>
          </div>
        </div>
        <div className="settings-actions">
          {isEntity(kind) && (
            <button
              className="button"
              onClick={() => props.createAction?.(kind, id)}
            >
              <Plus size={15} />
              Crear acción
            </button>
          )}
          {kind === "offers" &&
            !data.applications.some((a) => a.jobOfferId === id) && (
              <button
                className="button primary"
                onClick={() =>
                  edit({ kind: "applications", defaults: { jobOfferId: id } })
                }
              >
                <Plus size={16} />
                Candidatura
              </button>
            )}
          <button className="button" onClick={() => edit({ kind, id })}>
            <Pencil size={15} />
            Editar
          </button>
        </div>
      </header>
      <div className="detail-layout">
        <div>
          <section className="panel detail-panel">
            <h2>Información</h2>
            {application && <Badge status={application.status} />}
            <dl>
              {[
                ["Ubicación", item.location],
                [
                  "Modalidad",
                  workModes[item.workMode as keyof typeof workModes],
                ],
                ["Sector", item.sector],
                ["Cargo", item.role],
                ["Email", item.email],
                ["Teléfono", item.phone],
                [
                  "Fecha de candidatura",
                  item.appliedAt ? formatDate(item.appliedAt, true) : null,
                ],
                [
                  "Empieza",
                  item.startsAt ? formatDate(item.startsAt, true) : null,
                ],
                ["Termina", item.endsAt ? formatDate(item.endsAt, true) : null],
                [
                  "Fecha límite",
                  item.deadlineAt ? formatDate(item.deadlineAt, true) : null,
                ],
                [
                  "Fecha de tarea",
                  item.dueAt ? formatDate(item.dueAt, true) : null,
                ],
                [
                  "Completada",
                  item.completedAt ? formatDate(item.completedAt, true) : null,
                ],
                ["CV", item.cvVersion],
                ["Carta de presentación", item.coverLetterUsed ? "Sí" : null],
                [
                  "Interés",
                  item.interestRating
                    ? "★".repeat(Number(item.interestRating))
                    : null,
                ],
              ]
                .filter(([, value]) => !!value)
                .map(([label, value]) => (
                  <div key={String(label)}>
                    <dt>{String(label)}</dt>
                    <dd>{String(value)}</dd>
                  </div>
                ))}
            </dl>
            {links.length > 0 && (
              <div className="detail-links">
                {links.map((key) => (
                  <button
                    className="button small"
                    key={key}
                    onClick={() => external(String(item[key]))}
                  >
                    <ArrowUpRight size={14} />
                    {
                      (
                        {
                          websiteUrl: "Web",
                          careersUrl: "Empleo",
                          linkedinUrl: "LinkedIn",
                          url: "Abrir enlace",
                        } as Record<string, string>
                      )[key]
                    }
                  </button>
                ))}
              </div>
            )}
            {!!item.companyId && (
              <button
                className="text-button"
                onClick={() => open("companies", String(item.companyId))}
              >
                {recordLabel(data, "companies", String(item.companyId))}
                <ArrowUpRight size={14} />
              </button>
            )}
            {!!item.jobOfferId && (
              <button
                className="text-button"
                onClick={() => open("offers", String(item.jobOfferId))}
              >
                Ver oferta
                <ArrowUpRight size={14} />
              </button>
            )}
            {Array.isArray(item.technologies) && (
              <div className="chips">
                {item.technologies.map((t) => (
                  <span key={String(t)}>{String(t)}</span>
                ))}
              </div>
            )}
            {Array.isArray(item.links) && (
              <div className="detail-links">
                {item.links.map((raw) => {
                  const link = raw as {
                    kind: EntityKind;
                    recordId: string;
                    label: string;
                  };
                  return (
                    <button
                      className="button small"
                      key={link.kind + link.recordId}
                      onClick={() => open(link.kind, link.recordId)}
                    >
                      {link.label}
                      <ArrowUpRight size={13} />
                    </button>
                  );
                })}
              </div>
            )}
          </section>
          {!!item.description && (
            <section className="panel detail-panel">
              <h2>Descripción</h2>
              <Notes text={item.description} />
            </section>
          )}
          <section className="panel detail-panel">
            <h2>Notas</h2>
            <Notes text={item.notes} />
            {!item.notes && <p className="muted">Sin notas todavía.</p>}
          </section>
          {application && (
            <section className="panel detail-panel">
              <h2>Historial del proceso</h2>
              <div className="timeline">
                {application.events
                  .slice()
                  .sort((a, b) => b.happenedAt.localeCompare(a.happenedAt))
                  .map((event) => (
                    <article key={event.id}>
                      <div>
                        <strong>{event.title}</strong>
                        <button
                          className="icon-button danger-text"
                          aria-label={"Borrar entrada " + event.title}
                          disabled={busy}
                          onClick={() => {
                            if (
                              window.confirm(
                                "¿Borrar esta entrada del historial?",
                              )
                            )
                              void mutate({
                                action: "deleteActivity",
                                applicationId: id,
                                id: event.id,
                              });
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                      <small>{formatDate(event.happenedAt, true)}</small>
                      <Notes text={event.description} />
                    </article>
                  ))}
              </div>
              <form
                className="activity-form"
                onSubmit={async (event) => {
                  event.preventDefault();
                  const form = event.currentTarget,
                    fields = new FormData(form);
                  if (
                    await mutate({
                      action: "activity",
                      applicationId: id,
                      title: String(fields.get("title")),
                      description: String(fields.get("description")),
                      type: activityType,
                      happenedAt: new Date(
                        String(fields.get("happenedAt")),
                      ).toISOString(),
                    })
                  )
                    form.reset();
                }}
              >
                <h3>Añadir entrada</h3>
                <label>
                  Título
                  <input name="title" required maxLength={200} />
                </label>
                <div className="inline-form">
                  <label>
                    Tipo
                    <Select
                      label="Tipo de entrada"
                      value={activityType}
                      onValueChange={setActivityType}
                      options={Object.entries(activityTypes).map(
                        ([value, label]) => ({ value, label }),
                      )}
                    />
                  </label>
                  <label>
                    Fecha
                    <input
                      type="datetime-local"
                      name="happenedAt"
                      required
                      defaultValue={inputDate(new Date().toISOString())}
                    />
                  </label>
                </div>
                <label>
                  Detalles
                  <textarea name="description" maxLength={30000} rows={4} />
                </label>
                <button className="button primary" disabled={busy}>
                  Añadir entrada
                </button>
              </form>
            </section>
          )}
        </div>
        <aside>
          <section className="panel detail-panel">
            <h2>
              {kind === "offers"
                ? "Histórico de candidaturas"
                : "Registros relacionados"}
            </h2>
            {related.map((r) => (
              <button
                className="related-record"
                key={r.kind + r.item.id}
                onClick={() => open(r.kind, r.item.id)}
              >
                <strong>{recordLabel(data, r.kind, r.item.id)}</strong>
                <small>
                  {r.kind === "applications"
                    ? formatDate(r.item.appliedAt)
                    : isEntity(r.kind)
                      ? entities[r.kind].singular
                      : "Registro"}
                </small>
                {r.kind === "applications" && (
                  <Badge status={String(r.item.status)} />
                )}
              </button>
            ))}
            {!related.length && <Empty text="Sin registros relacionados." />}
            {kind === "offers" && (
              <button
                className="button small"
                onClick={() =>
                  edit({ kind: "applications", defaults: { jobOfferId: id } })
                }
              >
                <Plus size={14} />
                Registrar otra candidatura
              </button>
            )}
          </section>
        </aside>
      </div>
      {(kind === "offers" || application) &&
        renderFiles?.(
          application ? application.jobOfferId : id,
          application ? "Archivos de la oferta vinculada" : undefined,
        )}
    </>
  );
}
