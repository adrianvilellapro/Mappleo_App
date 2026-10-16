"use client";
import { useMemo, useState, useEffect, useRef } from "react";
import Link from "@/components/ui/app-link";
import { useCollection } from "./use-collection";
import { workspaceChangeEvent } from "@/lib/workspace-events";
import { defaultCollectionFilters, type CollectionPage } from "../collection";
import { useRouter } from "next/navigation";
import {
  Plus,
  Search,
  ArrowUpRight,
  ArrowDownUp,
  Inbox,
  Star,
  FilePlus2,
} from "lucide-react";
import {
  entities,
  statuses,
  workModes,
  eventTypes,
  type EntityKind,
} from "../config";
import { type RecordRow, type SelectOptions, rowTitle } from "../types";
import { RecordEditor } from "./record-editor";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { CompanyLogo } from "@/components/company-logo";
import { formatDate } from "@/lib/utils";
import { searchRecord } from "../search";
import { Select } from "@/components/ui/select";
import { applicationInScope } from "@/features/dashboard/metrics";
export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={"badge status-" + status.toLowerCase()}>
      <span className="badge-dot" />
      {statuses[status as keyof typeof statuses] ?? status}
    </span>
  );
}
function RecordIdentity({
  kind,
  record,
  secondary,
  onApply,
}: {
  kind: EntityKind;
  record: RecordRow;
  secondary: string;
  onApply: () => void;
}) {
  const title = rowTitle(record);
  const href = "/" + kind + "/" + record.id;
  return (
    <div className="record-identity">
      <Link
        className="record-logo-link"
        href={href}
        aria-label={"Abrir ficha de " + title}
      >
        <CompanyLogo
          companyId={
            kind === "companies"
              ? record.id
              : (record.company?.id ?? record.jobOffer?.company.id)
          }
          name={record.jobOffer?.company.name ?? record.company?.name ?? title}
          websiteUrl={
            record.websiteUrl ??
            record.company?.websiteUrl ??
            record.jobOffer?.company.websiteUrl
          }
          faviconUrl={
            record.faviconUrl ??
            record.company?.faviconUrl ??
            record.jobOffer?.company.faviconUrl
          }
        />
      </Link>
      <Link className="record-name" href={href}>
        <span>
          <strong>{title}</strong>
          <small>{secondary || "Sin ubicación"}</small>
        </span>
      </Link>
      {kind === "offers" && !record.applications?.length && (
        <button
          type="button"
          className="button button-outline quick-application-button"
          aria-label={"Crear candidatura para " + title}
          title="Crear candidatura"
          onClick={onApply}
        >
          <FilePlus2 size={15} />
          <span>Candidatura</span>
        </button>
      )}
    </div>
  );
}
export function RecordsView({
  kind,
  records,
  options,
  initialRecordId,
  creating = false,
  preset,
  initialScope,
  initialPage,
}: {
  kind: EntityKind;
  records: RecordRow[];
  options?: SelectOptions;
  initialPage?: CollectionPage;
  initialRecordId?: string;
  creating?: boolean;
  preset?: Record<string, string>;
  initialScope?: string;
}) {
  const config = entities[kind],
    router = useRouter();
  const [query, setQuery] = useState(""),
    [filter, setFilter] = useState("active"),
    [status, setStatus] = useState(""),
    [applicationFilter, setApplicationFilter] = useState("all"),
    [sort, setSort] = useState("recent"),
    [newOpen, setNewOpen] = useState(false);
  const [scope, setScope] = useState(initialScope ?? "all");
  const selected = records.find((r) => r.id === initialRecordId);
  const {
    page: loadedPage,
    error: collectionError,
    sentinel: attachSentinel,
  } = useCollection(kind, initialPage, {
    ...defaultCollectionFilters,
    q: query,
    filter: filter as "active" | "archived" | "all",
    status,
    scope: scope as "all" | "active" | "interviews",
    applications: applicationFilter as "all" | "sent" | "unsent",
    sort: sort as "recent" | "name" | "interest",
  });
  const rows = initialPage ? (loadedPage?.records ?? records) : records;
  const summary = initialPage ? loadedPage?.summary : undefined;
  const totalRecords = summary?.total ?? records.length;
  const matchedTotal = initialPage
    ? (loadedPage?.matchedTotal ?? initialPage.matchedTotal)
    : undefined;
  const activeStatus = (
    summary
      ? summary.statuses[status]
      : records.some((r) => r.status === status)
  )
    ? status
    : "";
  const openRecord = (id: string) =>
    router.push("/" + kind + "/" + id, { scroll: false });
  const visible = useMemo(
    () =>
      rows
        .filter((r) => {
          if (filter === "active" && r.archivedAt) return false;
          if (filter === "archived" && !r.archivedAt) return false;
          if (activeStatus && r.status !== activeStatus) return false;
          if (
            kind === "applications" &&
            !applicationInScope(r.status ?? "", scope)
          )
            return false;
          if (
            kind === "offers" &&
            applicationFilter !== "all" &&
            Boolean(r.applications?.length) !== (applicationFilter === "sent")
          )
            return false;
          return initialPage ? true : Boolean(searchRecord(kind, r, query));
        })
        .sort((a, b) =>
          sort === "name"
            ? rowTitle(a).localeCompare(rowTitle(b), "es")
            : sort === "interest"
              ? (b.interestRating ?? 0) - (a.interestRating ?? 0)
              : kind === "networking"
                ? String(a.startsAt).localeCompare(String(b.startsAt))
                : String(b.updatedAt).localeCompare(String(a.updatedAt)),
        ),
    [
      rows,
      filter,
      activeStatus,
      applicationFilter,
      query,
      sort,
      kind,
      scope,
      initialPage,
    ],
  );
  const open = creating || newOpen || !!selected;
  const [loadedOptions, setLoadedOptions] = useState<SelectOptions>();
  const [optionsError, setOptionsError] = useState("");
  const optionsUntil = useRef(0);
  useEffect(() => {
    const invalidate = () => {
      optionsUntil.current = 0;
    };
    window.addEventListener(workspaceChangeEvent, invalidate);
    return () => window.removeEventListener(workspaceChangeEvent, invalidate);
  }, []);
  useEffect(() => {
    if (!open || options || optionsUntil.current > Date.now()) return;
    const controller = new AbortController();
    fetch("/api/records/" + kind + "?options=1", {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok)
          throw Error(data.error || "No se han podido cargar las opciones.");
        return data;
      })
      .then((data) => {
        if (!controller.signal.aborted) {
          setLoadedOptions(data);
          optionsUntil.current = Date.now() + 2 * 60000;
          setOptionsError("");
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) setOptionsError(e.message);
      });
    return () => controller.abort();
  }, [open, kind, options]);
  const editorOptions = options ?? loadedOptions;
  const close = () => {
    setNewOpen(false);
    if (creating || selected) router.push("/" + kind, { scroll: false });
  };
  const secondary = (r: RecordRow) =>
    r.jobOffer?.company.name ?? r.company?.name ?? r.location ?? "";
  const column3 = (r: RecordRow) =>
    kind === "applications" ? (
      <StatusBadge status={r.status ?? "APPLIED"} />
    ) : kind === "networking" ? (
      <span className="badge">
        {eventTypes[r.type as keyof typeof eventTypes] ?? r.type}
      </span>
    ) : kind === "contacts" ? (
      r.role || "Sin cargo"
    ) : (
      <span>
        {workModes[r.workMode as keyof typeof workModes] ?? "Sin especificar"}
      </span>
    );
  const column4 = (r: RecordRow) =>
    kind === "applications" ? (
      formatDate(r.appliedAt)
    ) : kind === "networking" ? (
      formatDate(r.startsAt, true)
    ) : kind === "contacts" ? (
      formatDate(r.lastContactAt)
    ) : (
      <span className="interest">
        <Star size={13} />
        {r.interestRating ?? 3}
        <span className="muted"> / 5</span>
      </span>
    );
  return (
    <div className="page">
      <div className="breadcrumb">
        Mi espacio <span>/</span> {config.title}
      </div>
      <header className="page-heading">
        <div>
          <div className="title-line">
            <h1>{config.title}</h1>
            <span className="count-pill">{totalRecords}</span>
          </div>
          <p>{config.description}</p>
        </div>
        <Button onClick={() => setNewOpen(true)}>
          <Plus size={16} />
          {config.create}
        </Button>
      </header>
      <div className="collection-panel">
        <div
          className={
            kind === "applications"
              ? "collection-tabs status-tabs"
              : "collection-tabs"
          }
          role={kind === "applications" ? "tablist" : undefined}
          aria-label={
            kind === "applications" ? "Estados de candidaturas" : undefined
          }
        >
          <button
            className={filter === "active" && !activeStatus ? "selected" : ""}
            role={kind === "applications" ? "tab" : undefined}
            aria-selected={kind === "applications" ? !activeStatus : undefined}
            onClick={() => {
              setFilter("active");
              setStatus("");
              setScope("all");
            }}
          >
            Todos los registros{" "}
            <span>
              {summary?.active ?? records.filter((r) => !r.archivedAt).length}
            </span>
          </button>
          {kind === "applications" &&
            Object.entries(statuses).map(([key, label]) => {
              const count =
                summary?.statuses[key] ??
                records.filter((r) => r.status === key).length;
              return count ? (
                <button
                  key={key}
                  role="tab"
                  aria-selected={activeStatus === key}
                  className={activeStatus === key ? "selected" : ""}
                  onClick={() => {
                    setStatus(key);
                    setScope("all");
                  }}
                >
                  {label} <span>{count}</span>
                </button>
              ) : null;
            })}
          {["companies", "offers"].includes(kind) && (
            <button
              className={filter === "archived" ? "selected" : ""}
              onClick={() => setFilter("archived")}
            >
              Archivados{" "}
              <span>
                {summary?.archived ??
                  records.filter((r) => !!r.archivedAt).length}
              </span>
            </button>
          )}
          {kind !== "applications" && (
            <span className="view-note">Vista general</span>
          )}
        </div>
        {kind === "applications" && scope !== "all" && (
          <div className="scope-filter">
            <span>
              {scope === "interviews"
                ? "En entrevista o entrevista final"
                : "Procesos activos · candidaturas no cerradas"}
            </span>
            <button
              className="button button-ghost"
              onClick={() => setScope("all")}
            >
              Mostrar todas
            </button>
          </div>
        )}
        <div className="collection-toolbar">
          <label className="search-box">
            <Search size={16} />
            <input
              aria-label={"Buscar " + config.title.toLowerCase()}
              placeholder={"Buscar " + config.title.toLowerCase() + "…"}
              value={query}
              maxLength={100}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <div className="filter-controls">
            {kind === "offers" && (
              <Select
                label="Filtrar ofertas por candidatura"
                value={applicationFilter}
                onValueChange={setApplicationFilter}
                options={[
                  { value: "all", label: "Todas las ofertas" },
                  { value: "sent", label: "Candidatura enviada" },
                  { value: "unsent", label: "Sin candidatura" },
                ]}
              />
            )}
            <label className="sort-control">
              <ArrowDownUp size={14} />
              <Select
                label="Ordenar registros"
                value={sort}
                onValueChange={setSort}
                options={[
                  {
                    value: "recent",
                    label:
                      kind === "networking" ? "Por fecha" : "Más recientes",
                  },
                  { value: "name", label: "Por nombre" },
                  ...(["companies", "offers"].includes(kind)
                    ? [{ value: "interest", label: "Mayor interés" }]
                    : []),
                ]}
              />
            </label>
          </div>
        </div>
        {collectionError && (
          <p className="form-error" role="alert">
            {collectionError}
          </p>
        )}
        {!visible.length ? (
          <div className="empty-state">
            <span className="empty-icon">
              <Inbox size={27} />
            </span>
            <h2>
              {totalRecords
                ? "No hay coincidencias"
                : "Aquí empieza tu próximo paso"}
            </h2>
            <p>
              {totalRecords
                ? "Prueba otra búsqueda o cambia los filtros."
                : "Añade tu primer registro. Puedes completar los detalles más adelante."}
            </p>
            {!totalRecords && (
              <Button variant="outline" onClick={() => setNewOpen(true)}>
                <Plus size={15} />
                {config.create}
              </Button>
            )}
          </div>
        ) : (
          <>
            <div className="desktop-table">
              <table>
                <thead>
                  <tr>
                    <th>
                      {kind === "applications" || kind === "offers"
                        ? "Puesto / empresa"
                        : "Nombre"}
                    </th>
                    <th>
                      {kind === "contacts" ? "Empresa" : "Ubicación / contexto"}
                    </th>
                    <th>
                      {kind === "applications"
                        ? "Estado"
                        : kind === "networking"
                          ? "Tipo"
                          : kind === "contacts"
                            ? "Cargo"
                            : "Modalidad"}
                    </th>
                    <th>
                      {kind === "applications"
                        ? "Fecha de envío"
                        : kind === "networking"
                          ? "Fecha"
                          : kind === "contacts"
                            ? "Último contacto"
                            : "Interés"}
                    </th>
                    <th>
                      <span className="sr-only">Abrir</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((r) => (
                    <tr
                      key={r.id}
                      className="clickable-record-row"
                      tabIndex={0}
                      aria-label={"Abrir " + rowTitle(r)}
                      onClick={(event) => {
                        if (!(event.target as HTMLElement).closest("a, button"))
                          openRecord(r.id);
                      }}
                      onKeyDown={(event) => {
                        if (event.target !== event.currentTarget) return;
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          openRecord(r.id);
                        }
                      }}
                    >
                      <td>
                        <RecordIdentity
                          kind={kind}
                          record={r}
                          secondary={secondary(r)}
                          onApply={() =>
                            router.push(
                              "/applications?new=1&jobOfferId=" + r.id,
                            )
                          }
                        />
                      </td>
                      <td>{r.location || secondary(r) || "—"}</td>
                      <td>{column3(r)}</td>
                      <td>{column4(r)}</td>
                      <td>
                        <Link
                          className="icon-button"
                          href={"/" + kind + "/" + r.id}
                          aria-label={"Abrir " + rowTitle(r)}
                        >
                          <ArrowUpRight size={17} />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mobile-records">
              {visible.map((r) => (
                <div
                  key={r.id}
                  className="mobile-record"
                  onClick={(event) => {
                    if (!(event.target as HTMLElement).closest("a, button"))
                      openRecord(r.id);
                  }}
                >
                  <div className="mobile-record-top">
                    <RecordIdentity
                      kind={kind}
                      record={r}
                      secondary={secondary(r)}
                      onApply={() =>
                        router.push("/applications?new=1&jobOfferId=" + r.id)
                      }
                    />
                    <ArrowUpRight size={16} />
                  </div>
                  <div className="mobile-record-bottom">
                    {column3(r)}
                    {column4(r)}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
        <div className="collection-footer">
          <span>
            {matchedTotal ?? visible.length}{" "}
            {(matchedTotal ?? visible.length) === 1 ? "registro" : "registros"}
          </span>
        </div>
      </div>
      {initialPage && (
        <div ref={attachSentinel} aria-hidden="true" style={{ height: 1 }} />
      )}
      <Sheet
        open={open}
        onOpenChange={(v) => {
          if (!v) close();
        }}
        title={selected ? rowTitle(selected) : config.create}
        description={
          selected
            ? "Detalles y seguimiento · " + config.title
            : "Lo esencial ahora. Los detalles, cuando quieras."
        }
      >
        {editorOptions ? (
          <RecordEditor
            key={selected?.id ?? "new"}
            kind={kind}
            record={selected}
            options={editorOptions}
            onDone={close}
            preset={preset}
          />
        ) : (
          <div className="editor-body" aria-busy={!optionsError}>
            {optionsError ? (
              <p className="form-error" role="alert">
                {optionsError}
              </p>
            ) : null}
          </div>
        )}
      </Sheet>
    </div>
  );
}
