import { useState } from "react";
import {
  Plus,
  Check,
  ChevronLeft,
  ChevronRight,
  Pencil,
  ArrowUpRight,
  Search,
  Building2,
  BriefcaseBusiness,
  Send,
  Users,
  CalendarDays,
  ListTodo,
} from "lucide-react";
import {
  entities,
  statuses,
  closedStatuses,
  sources,
  type EntityKind,
} from "../../../../packages/domain/tracker";
import type { Command, Kind, Workspace } from "../shared/contracts";
import type { EditorState } from "./Editor";
import { Select } from "../../../../packages/ui/select";
import {
  calendarEntries,
  dateKey,
  formatDate,
  getItems,
  recordLabel,
  statusLabel,
  subtitle,
} from "./model";

export type ViewProps = {
  data: Workspace;
  edit: (state: EditorState) => void;
  open: (kind: Kind, id: string) => void;
  mutate: (command: Command) => Promise<boolean>;
  busy: boolean;
  exportPdf?: () => void;
  createAction?: (kind: EntityKind, id: string) => void;
};
export function Empty({
  text = "Todavía no hay registros. Añade el primero cuando quieras.",
}: {
  text?: string;
}) {
  return (
    <div className="empty-state">
      <div className="empty-mark">
        <Plus size={22} />
      </div>
      <p>{text}</p>
    </div>
  );
}
export function Badge({ status }: { status: string }) {
  return (
    <span className={"badge status-" + status.toLowerCase()}>
      {statusLabel(status)}
    </span>
  );
}
export function Avatar({ text }: { text: string }) {
  return (
    <span className="company-avatar" aria-hidden="true">
      {text
        .split(/\s+/)
        .slice(0, 2)
        .map((s) => s[0])
        .join("")
        .toUpperCase()}
    </span>
  );
}

export function Today(props: ViewProps) {
  const { data, open, edit, mutate } = props;
  const [all, setAll] = useState(false),
    [completed, setCompleted] = useState(new Set<string>());
  const pending = (data.tasks ?? [])
    .filter((t) => !t.completedAt || completed.has(t.id))
    .sort((a, b) => (a.dueAt ?? "9999").localeCompare(b.dueAt ?? "9999"));
  const active = data.applications.filter(
    (a) => !closedStatuses.includes(a.status),
  );
  const complete = async (id: string) => {
    if (completed.has(id)) return;
    setCompleted((current) => new Set([...current, id]));
    // Persist immediately; retain the green acknowledgement independently of storage.
    const saved = await mutate({ action: "complete", kind: "tasks", id });
    if (saved) await new Promise((resolve) => setTimeout(resolve, 1400));
    setCompleted((current) => new Set([...current].filter((x) => x !== id)));
  };
  return (
    <>
      <div className="date-heading">
        <span>HOY</span>
        <h1>
          {new Intl.DateTimeFormat("es-ES", {
            weekday: "long",
            day: "numeric",
            month: "long",
          }).format(new Date())}
        </h1>
      </div>
      <div className="metrics">
        {[
          [
            Building2,
            data.companies.filter((c) => !c.archivedAt).length,
            "Empresas en el radar",
          ],
          [
            BriefcaseBusiness,
            data.offers.filter((o) => !o.archivedAt).length,
            "Ofertas guardadas",
          ],
          [Send, active.length, "Procesos activos"],
          [
            Users,
            active.filter((a) =>
              ["INTERVIEW", "FINAL_INTERVIEW"].includes(a.status),
            ).length,
            "En entrevista",
          ],
        ].map(([Icon, count, label]) => {
          const I = Icon as typeof Building2;
          return (
            <div className="metric" key={String(label)}>
              <span>
                <I size={16} />
                {String(label)}
              </span>
              <strong>{String(count)}</strong>
              <small>Datos de tu espacio local</small>
            </div>
          );
        })}
      </div>
      <div className="today-grid">
        <section className="panel">
          <div className="panel-heading">
            <h2>
              <ListTodo size={18} />
              Lo siguiente <span className="count">{pending.length}</span>
            </h2>
            <button
              className="button small"
              onClick={() => edit({ kind: "tasks" })}
            >
              <Plus size={15} />
              Tarea
            </button>
          </div>
          <div className="next-actions">
            {(all ? pending : pending.slice(0, 8)).map((t) => (
              <div
                className={
                  "next-action " + (completed.has(t.id) ? "just-completed" : "")
                }
                key={t.id}
              >
                <button
                  className="complete-task"
                  aria-label={"Completar " + t.title}
                  disabled={completed.has(t.id) || props.busy}
                  onClick={() => void complete(t.id)}
                >
                  <Check
                    size={12}
                    className={completed.has(t.id) ? "checked" : ""}
                  />
                </button>
                <button
                  className="action-label"
                  onClick={() => open("tasks", t.id)}
                >
                  <strong>{t.title}</strong>
                  <small>
                    {t.sourceKind && t.sourceId
                      ? recordLabel(data, t.sourceKind, t.sourceId)
                      : "Tarea del Kanban"}
                  </small>
                </button>
                <span
                  className={
                    "date-pill " +
                    (t.dueAt && new Date(t.dueAt) < new Date() ? "overdue" : "")
                  }
                >
                  {formatDate(t.dueAt)}
                </span>
              </div>
            ))}
            {!pending.length && (
              <Empty text="Todo en orden. Tus próximas acciones aparecerán aquí." />
            )}
          </div>
          {pending.length > 8 && (
            <button
              className="text-button panel-more"
              onClick={() => setAll(!all)}
            >
              {all
                ? "Mostrar menos"
                : "Ver todas las tareas (" + pending.length + ")"}
            </button>
          )}
        </section>
        <section className="panel">
          <div className="panel-heading">
            <h2>Procesos activos</h2>
          </div>
          {active
            .slice()
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
            .slice(0, 6)
            .map((a) => (
              <button
                className="process-row"
                key={a.id}
                onClick={() => open("applications", a.id)}
              >
                <Avatar text={subtitle(data, "applications", a)} />
                <span>
                  <strong>{recordLabel(data, "applications", a.id)}</strong>
                  <small>{subtitle(data, "applications", a)}</small>
                </span>
                <Badge status={a.status} />
              </button>
            ))}
          {!active.length && (
            <Empty text="Tus candidaturas activas aparecerán aquí." />
          )}
        </section>
      </div>
      <Calendar {...props} />
      <section className="panel">
        <div className="panel-heading">
          <h2>Actividad reciente</h2>
        </div>
        {data.applications
          .flatMap((a) => a.events.map((e) => ({ ...e, applicationId: a.id })))
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .slice(0, 6)
          .map((e) => (
            <button
              className="activity-row"
              key={e.id}
              onClick={() => open("applications", e.applicationId)}
            >
              <span>
                <strong>{e.title}</strong>
                <small>
                  {recordLabel(data, "applications", e.applicationId)}
                </small>
              </span>
              <time>{formatDate(e.happenedAt)}</time>
            </button>
          ))}
      </section>
    </>
  );
}

export function Calendar({ data, open }: ViewProps) {
  const [month, setMonth] = useState(
    new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );
  const entries = calendarEntries(data),
    start = new Date(month);
  start.setDate(1 - ((start.getDay() + 6) % 7));
  return (
    <section className="panel calendar-panel">
      <div className="panel-heading">
        <h2>
          <CalendarDays size={18} />
          Calendario
        </h2>
        <div className="calendar-controls">
          <button
            className="icon-button"
            aria-label="Mes anterior"
            onClick={() =>
              setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))
            }
          >
            <ChevronLeft size={18} />
          </button>
          <strong>
            {new Intl.DateTimeFormat("es-ES", {
              month: "long",
              year: "numeric",
            }).format(month)}
          </strong>
          <button
            className="icon-button"
            aria-label="Mes siguiente"
            onClick={() =>
              setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))
            }
          >
            <ChevronRight size={18} />
          </button>
          <button
            className="button small"
            onClick={() =>
              setMonth(
                new Date(new Date().getFullYear(), new Date().getMonth(), 1),
              )
            }
          >
            Hoy
          </button>
        </div>
      </div>
      <div className="calendar-grid">
        {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((d) => (
          <div className="calendar-weekday" key={d}>
            {d}
          </div>
        ))}
        {Array.from({ length: 42 }, (_, i) => {
          const date = new Date(start);
          date.setDate(start.getDate() + i);
          const items = entries.filter((e) => dateKey(e.at) === dateKey(date));
          return (
            <div
              className={
                "calendar-day " +
                (date.getMonth() !== month.getMonth() ? "outside " : "") +
                (dateKey(date) === dateKey(new Date()) ? "is-today" : "")
              }
              key={dateKey(date)}
            >
              <span>{date.getDate()}</span>
              {items.map((e) => (
                <button
                  key={e.key}
                  title={e.label + " · " + formatDate(e.at, true)}
                  className={"calendar-event " + e.tone}
                  onClick={() => open(e.kind, e.id)}
                >
                  {e.label}
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function Collection({
  kind,
  ...props
}: ViewProps & { kind: EntityKind }) {
  const { data, open, edit } = props;
  const [query, setQuery] = useState(""),
    [status, setStatus] = useState("all"),
    [sent, setSent] = useState("all");
  const rows = getItems(data, kind)
    .slice()
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .filter((item) => {
      const haystack = [
        recordLabel(data, kind, item.id),
        subtitle(data, kind, item),
        item.location,
        ...(Array.isArray(item.technologies) ? item.technologies : []),
      ]
        .join(" ")
        .toLowerCase();
      return (
        query
          .trim()
          .toLowerCase()
          .split(/\s+/)
          .every((s) => haystack.includes(s)) &&
        (kind !== "applications" ||
          status === "all" ||
          item.status === status) &&
        (kind !== "offers" ||
          sent === "all" ||
          (data.applications.some((a) => a.jobOfferId === item.id)
            ? "yes"
            : "no") === sent)
      );
    });
  return (
    <>
      <header className="page-heading">
        <div>
          <h1>{entities[kind].title}</h1>
          <p>{entities[kind].description}</p>
        </div>
        <button className="button primary" onClick={() => edit({ kind })}>
          <Plus size={16} />
          {entities[kind].create}
        </button>
      </header>
      <section className="panel collection">
        <div className="collection-tabs">
          <button
            className={status === "all" ? "selected" : ""}
            onClick={() => setStatus("all")}
          >
            Todos los registros <span>{getItems(data, kind).length}</span>
          </button>
          {kind === "applications" &&
            Object.entries(statuses)
              .filter(([key]) =>
                data.applications.some((a) => a.status === key),
              )
              .map(([key, label]) => (
                <button
                  key={key}
                  className={status === key ? "selected" : ""}
                  onClick={() => setStatus(key)}
                >
                  {label}
                  <span>
                    {data.applications.filter((a) => a.status === key).length}
                  </span>
                </button>
              ))}
        </div>
        <div className="collection-toolbar">
          <div className="search-field">
            <Search size={16} />
            <input
              aria-label={"Buscar " + entities[kind].title.toLowerCase()}
              type="search"
              placeholder="Buscar registros…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          {kind === "offers" && (
            <Select
              label="Candidaturas enviadas"
              value={sent}
              onValueChange={setSent}
              options={[
                { value: "all", label: "Todas las ofertas" },
                { value: "yes", label: "Con candidatura" },
                { value: "no", label: "Sin candidatura" },
              ]}
            />
          )}
          <small>{rows.length} registros</small>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>
                  {kind === "applications"
                    ? "Oferta / empresa"
                    : entities[kind].singular}
                </th>
                <th>
                  {kind === "applications"
                    ? "Estado"
                    : kind === "networking"
                      ? "Fecha"
                      : "Ubicación"}
                </th>
                <th>
                  {kind === "applications"
                    ? "Fecha de envío"
                    : kind === "contacts"
                      ? "Contacto"
                      : kind === "offers"
                        ? "Tecnologías"
                        : kind === "networking"
                          ? "Tipo"
                          : "Interés"}
                </th>
                <th>Registrada</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((item) => (
                <tr
                  key={item.id}
                  tabIndex={0}
                  role="button"
                  aria-label={"Abrir " + recordLabel(data, kind, item.id)}
                  onClick={() => open(kind, item.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") open(kind, item.id);
                  }}
                >
                  <td>
                    <div className="record-identity">
                      <Avatar
                        text={
                          kind === "companies"
                            ? String(item.name)
                            : subtitle(data, kind, item) ||
                              recordLabel(data, kind, item.id)
                        }
                      />
                      <div>
                        <strong>{recordLabel(data, kind, item.id)}</strong>
                        <small>{subtitle(data, kind, item)}</small>
                      </div>
                      {kind === "offers" &&
                        !data.applications.some(
                          (a) => a.jobOfferId === item.id,
                        ) && (
                          <button
                            className="button small quick-apply"
                            onClick={(e) => {
                              e.stopPropagation();
                              edit({
                                kind: "applications",
                                defaults: { jobOfferId: item.id },
                              });
                            }}
                          >
                            <Plus size={13} />
                            Candidatura
                          </button>
                        )}
                    </div>
                  </td>
                  <td>
                    {kind === "applications" ? (
                      <Badge status={String(item.status)} />
                    ) : kind === "networking" ? (
                      formatDate(item.startsAt, true)
                    ) : (
                      String(item.location || "—")
                    )}
                  </td>
                  <td>
                    {kind === "applications" ? (
                      <>
                        <span>{formatDate(item.appliedAt)}</span>
                      </>
                    ) : kind === "offers" ? (
                      <div className="chips">
                        {(item.technologies as string[])
                          .slice(0, 4)
                          .map((t) => (
                            <span key={t}>{t}</span>
                          ))}
                      </div>
                    ) : kind === "contacts" ? (
                      String(item.email || item.role || "—")
                    ) : kind === "networking" ? (
                      String(item.type)
                    ) : (
                      <span className="stars">
                        {"★".repeat(Number(item.interestRating))}
                        {"☆".repeat(5 - Number(item.interestRating))}
                      </span>
                    )}
                  </td>
                  <td>
                    {formatDate(
                      kind === "applications" ? item.appliedAt : item.createdAt,
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!rows.length && <Empty />}
      </section>
    </>
  );
}

export function Board({ data, edit, open, mutate, busy }: ViewProps) {
  const [dragging, setDragging] = useState<string | null>(null),
    [target, setTarget] = useState<{
      columnId: string;
      position: number;
    } | null>(null);
  const columns = (data.boardColumns ?? [])
    .slice()
    .sort((a, b) => a.position - b.position);
  async function drop() {
    const id = dragging,
      to = target;
    setDragging(null);
    setTarget(null);
    if (id && to) {
      const original = (data.tasks ?? [])
        .filter((t) => t.columnId === to.columnId)
        .sort((a, b) => a.position - b.position)
        .findIndex((t) => t.id === id);
      await mutate({
        action: "moveTask",
        id,
        columnId: to.columnId,
        position:
          original >= 0 && original < to.position
            ? to.position - 1
            : to.position,
      });
    }
  }
  return (
    <>
      <header className="page-heading">
        <div>
          <h1>Kanban</h1>
          <p>Un espacio para organizar cada paso de tu búsqueda.</p>
        </div>
        <button
          className="button"
          onClick={() => edit({ kind: "boardColumns" })}
        >
          <Plus size={16} />
          Nueva columna
        </button>
      </header>
      <div className="kanban">
        {columns.map((column) => {
          const tasks = (data.tasks ?? [])
            .filter((t) => t.columnId === column.id)
            .sort((a, b) => a.position - b.position);
          return (
            <section
              className={
                "kanban-column " +
                (target?.columnId === column.id ? "drop-active" : "")
              }
              key={column.id}
              onDragOver={(e) => {
                e.preventDefault();
                setTarget({ columnId: column.id, position: tasks.length });
              }}
              onDrop={(e) => {
                e.preventDefault();
                void drop();
              }}
            >
              <header>
                <h2>
                  <span
                    className={"column-dot " + (column.isDone ? "done" : "")}
                  />
                  {column.name}
                </h2>
                <span className="count">
                  {
                    (data.tasks ?? []).filter((t) => t.columnId === column.id)
                      .length
                  }
                </span>
                <button
                  className="icon-button"
                  aria-label={"Añadir tarea en " + column.name}
                  onClick={() =>
                    edit({ kind: "tasks", defaults: { columnId: column.id } })
                  }
                >
                  <Plus size={16} />
                </button>
                <button
                  className="icon-button"
                  aria-label={"Editar columna " + column.name}
                  onClick={() => edit({ kind: "boardColumns", id: column.id })}
                >
                  <Pencil size={14} />
                </button>
              </header>
              <div className="kanban-cards">
                {tasks.map((t, index) => (
                  <div
                    key={t.id}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setTarget({ columnId: column.id, position: index });
                    }}
                  >
                    {target?.columnId === column.id &&
                      target.position === index && (
                        <div className="drop-preview">Soltar aquí</div>
                      )}
                    <article
                      draggable={!busy}
                      className={
                        "kanban-card " +
                        (t.completedAt ? "completed " : "") +
                        (t.id === dragging ? "dragging" : "")
                      }
                      tabIndex={0}
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = "move";
                        e.dataTransfer.setData("text/plain", t.id);
                        setDragging(t.id);
                        setTarget(null);
                      }}
                      onDragEnd={() => {
                        setDragging(null);
                        setTarget(null);
                      }}
                      onClick={() => open("tasks", t.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") open("tasks", t.id);
                      }}
                    >
                      <div className="task-card-heading">
                        <strong>{t.title}</strong>
                        <button
                          className="complete-task"
                          aria-label={"Completar " + t.title}
                          disabled={!!t.completedAt || busy}
                          onClick={(e) => {
                            e.stopPropagation();
                            void mutate({
                              action: "complete",
                              kind: "tasks",
                              id: t.id,
                            });
                          }}
                        >
                          <Check
                            size={12}
                            className={t.completedAt ? "checked" : ""}
                          />
                        </button>
                      </div>
                      {t.description && (
                        <p className="task-description">{t.description}</p>
                      )}
                      <div className="task-links">
                        {t.links.slice(0, 2).map((l) => (
                          <button
                            key={l.kind + l.recordId}
                            onClick={(e) => {
                              e.stopPropagation();
                              open(l.kind, l.recordId);
                            }}
                          >
                            <ArrowUpRight size={12} />
                            {recordLabel(data, l.kind, l.recordId)}
                          </button>
                        ))}
                      </div>
                      {t.dueAt && (
                        <small className="task-date">
                          <CalendarDays size={12} />
                          {formatDate(t.dueAt)}
                        </small>
                      )}
                    </article>
                  </div>
                ))}
                {target?.columnId === column.id &&
                  target.position === tasks.length && (
                    <div className="drop-preview">Soltar aquí</div>
                  )}
                {!tasks.length && !dragging && (
                  <button
                    className="add-task-empty"
                    onClick={() =>
                      edit({ kind: "tasks", defaults: { columnId: column.id } })
                    }
                  >
                    <Plus size={15} />
                    Añadir tarea
                  </button>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}

export function Statistics({ data, exportPdf, busy }: ViewProps) {
  const [from, setFrom] = useState(
      dateKey(new Date(new Date().getFullYear(), new Date().getMonth() - 5, 1)),
    ),
    [to, setTo] = useState(dateKey(new Date())),
    [source, setSource] = useState("all"),
    [company, setCompany] = useState("all");
  const inRange = (at: string) => dateKey(at) >= from && dateKey(at) <= to;
  const offers = data.offers.filter(
    (o) =>
      (source === "all" || o.source === source) &&
      (company === "all" || o.companyId === company),
  );
  const cohort = data.applications.filter(
    (a) => offers.some((o) => o.id === a.jobOfferId) && inRange(a.appliedAt),
  );
  const interview = (a: Workspace["applications"][number]) =>
    ["INTERVIEW", "FINAL_INTERVIEW", "OFFER_RECEIVED", "ACCEPTED"].includes(
      a.status,
    ) ||
    a.events.some(
      (e) =>
        e.type === "INTERVIEW" ||
        ["INTERVIEW", "FINAL_INTERVIEW"].includes(e.toStatus ?? ""),
    );
  const responded = cohort.filter(
    (a) =>
      !!a.firstResponseAt ||
      a.events.some(
        (e) =>
          [
            "EMAIL_RECEIVED",
            "CALL",
            "INTERVIEW",
            "TECHNICAL_TEST",
            "OFFER_RECEIVED",
            "REJECTION_RECEIVED",
          ].includes(e.type) ||
          [
            "SCREENING",
            "TECHNICAL_TEST",
            "INTERVIEW",
            "FINAL_INTERVIEW",
            "OFFER_RECEIVED",
            "ACCEPTED",
            "REJECTED",
          ].includes(e.toStatus ?? ""),
      ),
  ).length;
  const buckets = new Map<string, number>();
  cohort.forEach((a) => {
    const key = a.appliedAt.slice(0, 7);
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  });
  const technologies = new Map<string, number>();
  cohort.forEach((a) =>
    data.offers
      .find((o) => o.id === a.jobOfferId)
      ?.technologies.forEach((t) =>
        technologies.set(t, (technologies.get(t) ?? 0) + 1),
      ),
  );
  const completions = (data.taskCompletions ?? []).filter(
    (c) =>
      inRange(c.completedAt) &&
      (company === "all" || c.companyIds?.includes(company)) &&
      (source === "all" || c.sources?.includes(source)),
  );
  const network = data.networking.filter(
    (n) =>
      inRange(n.startsAt) &&
      (company === "all" || n.companies.some((c) => c.id === company)),
  );
  const contacts = data.contacts.filter(
    (c) =>
      inRange(c.createdAt) && (company === "all" || c.companyId === company),
  );
  return (
    <>
      <header className="page-heading">
        <div>
          <h1>Estadísticas</h1>
          <p>La evolución de tu búsqueda, con tus datos locales.</p>
        </div>
        {exportPdf && (
          <button className="button" onClick={exportPdf} disabled={busy}>
            Descargar informe PDF
          </button>
        )}
      </header>
      <section className="panel statistics-filters">
        <label>
          Desde
          <input
            type="date"
            value={from}
            max={to}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label>
          Hasta
          <input
            type="date"
            value={to}
            min={from}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <label>
          Fuente
          <Select
            label="Fuente"
            value={source}
            onValueChange={setSource}
            options={[
              { value: "all", label: "Todas las fuentes" },
              ...Object.entries(sources).map(([value, label]) => ({
                value,
                label,
              })),
            ]}
          />
        </label>
        <label>
          Empresa
          <Select
            label="Empresa"
            value={company}
            onValueChange={setCompany}
            options={[
              { value: "all", label: "Todas las empresas" },
              ...data.companies.map((c) => ({ value: c.id, label: c.name })),
            ]}
          />
        </label>
      </section>
      <div className="metrics">
        {[
          ["Candidaturas enviadas", cohort.length],
          ["Con respuesta", responded],
          ["Con entrevista", cohort.filter(interview).length],
          [
            "Tasa de respuesta",
            cohort.length
              ? Math.round((100 * responded) / cohort.length) + " %"
              : "—",
          ],
        ].map(([label, value]) => (
          <div className="metric" key={String(label)}>
            <span>{label}</span>
            <strong>{value}</strong>
            <small>En el periodo seleccionado</small>
          </div>
        ))}
      </div>
      <div className="today-grid">
        <section className="panel">
          <div className="panel-heading">
            <h2>Candidaturas por mes</h2>
          </div>
          <div className="bar-chart">
            {[...buckets]
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([month, count]) => (
                <div className="chart-row" key={month}>
                  <span>
                    {new Intl.DateTimeFormat("es-ES", {
                      month: "short",
                      year: "numeric",
                    }).format(new Date(month + "-01T12:00:00"))}
                  </span>
                  <div>
                    <i
                      style={{
                        width: `${(count / Math.max(...buckets.values(), 1)) * 100}%`,
                      }}
                    />
                  </div>
                  <strong>{count}</strong>
                </div>
              ))}
            {!buckets.size && (
              <Empty text="No hay candidaturas en este periodo." />
            )}
          </div>
        </section>
        <section className="panel">
          <div className="panel-heading">
            <h2>Distribución por estado</h2>
          </div>
          <div className="bar-chart">
            {Object.entries(statuses)
              .map(([key, label]) => ({
                key,
                label,
                count: cohort.filter((a) => a.status === key).length,
              }))
              .filter((s) => s.count)
              .map((s) => (
                <div className="chart-row" key={s.key}>
                  <span>{s.label}</span>
                  <div>
                    <i
                      style={{
                        width: `${(s.count / Math.max(cohort.length, 1)) * 100}%`,
                      }}
                    />
                  </div>
                  <strong>{s.count}</strong>
                </div>
              ))}
          </div>
        </section>
      </div>
      <div className="stats-extras">
        <section className="panel summary-stat">
          <Users size={20} />
          <strong>{contacts.length}</strong>
          <span>Contactos registrados</span>
        </section>
        <section className="panel summary-stat">
          <CalendarDays size={20} />
          <strong>{network.length}</strong>
          <span>Eventos de networking</span>
        </section>
        <section className="panel summary-stat">
          <Check size={20} />
          <strong>{completions.length}</strong>
          <span>Tareas completadas</span>
        </section>
      </div>
      <section className="panel">
        <div className="panel-heading">
          <h2>Tecnologías en tus candidaturas</h2>
        </div>
        <div className="technology-stats">
          {[...technologies]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 12)
            .map(([name, count]) => (
              <span className="badge" key={name}>
                {name}
                <strong>{count}</strong>
              </span>
            ))}
          {!technologies.size && (
            <p>No hay tecnologías registradas en este periodo.</p>
          )}
        </div>
      </section>
      <p className="muted report-note">
        Respuesta e entrevista se calculan sobre las candidaturas enviadas en el
        periodo. Networking y contactos se filtran por fecha y empresa, no por
        fuente de oferta.
      </p>
    </>
  );
}
