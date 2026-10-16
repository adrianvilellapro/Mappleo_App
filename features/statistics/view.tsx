"use client";
import { useState, useTransition } from "react";
import Link from "@/components/ui/app-link";
import { useRouter } from "next/navigation";
import { Download, ArrowUpRight } from "lucide-react";
import { Select } from "@/components/ui/select";
import { Sheet } from "@/components/ui/sheet";
import { sources } from "@/features/tracker/config";
import { periods, prettyDate, type Statistics } from "./model";
import { ActivityChart, Milestones } from "./charts";
import { day } from "@/lib/dates";
import { ExtendedStatistics } from "./extended";
import { useIdentityConfirmation } from "@/components/identity-confirmation";
import { useHydrated } from "@/lib/use-hydrated";
export function StatisticsView({
  report,
  companies,
  readOnlyDemo = false,
}: {
  report: Statistics;
  companies: { id: string; name: string }[];
  readOnlyDemo?: boolean;
}) {
  const { secureFetch, dialog } = useIdentityConfirmation();
  const hydrated = useHydrated();
  const router = useRouter(),
    [pending, startTransition] = useTransition();
  const [drill, setDrill] = useState("");
  const [period, setPeriod] = useState(report.filters.period);
  const [exporting, setExporting] = useState(false),
    [error, setError] = useState("");
  const params = new URLSearchParams(report.filters);
  const download = async () => {
    if (readOnlyDemo) return;
    setExporting(true);
    setError("");
    try {
      const response = await secureFetch(
        "/api/statistics/pdf?render=client&" + params.toString(),
      );
      if (
        !response.ok ||
        !response.headers.get("content-type")?.includes("application/json")
      )
        throw new Error(
          "No se ha podido descargar el informe. Vuelve a intentarlo.",
        );
      const blob = await (
        await import("@/features/reports/worker-client")
      ).generateReport({
        type: "statistics",
        report,
        companyLabel:
          report.filters.company === "all"
            ? "Todas"
            : (companies.find((c) => c.id === report.filters.company)?.name ??
              "Sin coincidencias"),
      });
      const url = URL.createObjectURL(blob),
        a = document.createElement("a");
      a.href = url;
      a.download = `mappleo-estadisticas-${report.filters.from}-${report.filters.to}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "No se ha podido descargar el informe.",
      );
    } finally {
      setExporting(false);
    }
  };
  const rows = report.rows.filter((r) =>
    drill === "responses"
      ? r.response
      : drill === "interviews"
        ? r.interview
        : true,
  );
  return (
    <div className="page statistics-page">
      {dialog}
      <div className="breadcrumb">
        Mi espacio <span>/</span> Estadísticas
      </div>
      <header className="page-heading">
        <div>
          <h1>Estadísticas</h1>
          <p>Tu actividad y sus resultados, con contexto.</p>
        </div>
        <button
          className="button button-outline"
          disabled={!hydrated || exporting || pending || readOnlyDemo}
          title={readOnlyDemo ? "No disponible en la demo" : undefined}
          onClick={download}
        >
          <Download size={16} />
          {exporting ? "Generando informe…" : "Descargar informe PDF"}
        </button>
      </header>
      <form
        className="panel statistics-filters"
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          startTransition(() =>
            router.push(
              "/statistics?" +
                new URLSearchParams(
                  Object.fromEntries(data) as Record<string, string>,
                ),
              { scroll: false },
            ),
          );
        }}
      >
        <label>
          Periodo
          <Select
            name="period"
            value={period}
            onValueChange={setPeriod}
            options={Object.entries(periods).map(([value, label]) => ({
              value,
              label,
            }))}
          />
        </label>
        {period === "custom" && (
          <>
            <label>
              Desde
              <input
                name="from"
                type="date"
                defaultValue={report.filters.from}
                max={day(report.generatedAt).toISODate()!}
                required
              />
            </label>
            <label>
              Hasta
              <input
                name="to"
                type="date"
                defaultValue={report.filters.to}
                max={day(report.generatedAt).toISODate()!}
                required
              />
            </label>
          </>
        )}
        <label>
          Agrupar por
          <Select
            name="group"
            defaultValue={report.filters.group}
            options={[
              { value: "week", label: "Semanas" },
              { value: "month", label: "Meses" },
            ]}
          />
        </label>
        <label>
          Fuente
          <Select
            name="source"
            defaultValue={report.filters.source}
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
            name="company"
            defaultValue={report.filters.company}
            options={[
              { value: "all", label: "Todas las empresas" },
              ...companies.map((c) => ({ value: c.id, label: c.name })),
            ]}
          />
        </label>
        <button
          type="submit"
          className="button button-primary"
          disabled={pending}
        >
          {pending ? "Aplicando…" : "Aplicar filtros"}
        </button>
      </form>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="statistics-period">
        <strong>
          {prettyDate(report.filters.from)} — {prettyDate(report.filters.to)}
        </strong>
        <span>
          Resultados hasta {prettyDate(report.generatedAt)} · Europe/Madrid
        </span>
      </div>
      <div className="statistics-metrics">
        {[
          {
            id: "sent",
            label: "Candidaturas enviadas",
            value: String(report.sent),
            detail: `Periodo comparable anterior: ${report.previous} (${prettyDate(report.previousFrom)}–${prettyDate(report.previousTo)})`,
          },
          {
            id: "responses",
            label: "Respuesta real registrada",
            value:
              report.responseRate === null
                ? "Sin datos"
                : report.responseRate + " %",
            detail: `${report.responses} de ${report.sent} candidaturas · ${report.withoutResponseDate} sin fecha de respuesta`,
          },
          {
            id: "interviews",
            label: "Llegaron a entrevista",
            value:
              report.interviewRate === null
                ? "Sin datos"
                : report.interviewRate + " %",
            detail: `${report.interviews} de ${report.sent} candidaturas`,
          },
          {
            id: "responses",
            label: "Mediana hasta responder",
            value:
              report.medianDays === null
                ? "Sin datos"
                : report.medianDays.toLocaleString("es", {
                    maximumFractionDigits: 1,
                  }) + " días",
            detail: `${report.responseSample} casos medidos · excluye pendientes`,
          },
        ].map((m, i) => (
          <button
            key={i}
            className="panel statistics-metric"
            onClick={() => setDrill(m.id)}
          >
            <span>
              {m.label}
              <ArrowUpRight size={15} />
            </span>
            <strong>{m.value}</strong>
            <small>{m.detail}</small>
          </button>
        ))}
      </div>
      {report.sent > 0 && report.sent < 10 && (
        <p className="statistics-note">
          Muestra pequeña: interpreta los porcentajes junto al número de
          candidaturas.
        </p>
      )}
      <div className="statistics-charts">
        <section className="panel">
          <header className="panel-heading">
            <h2>Actividad del periodo</h2>
          </header>
          <ActivityChart series={report.series} />
          <p className="statistics-note">
            Lo que ocurrió en estas fechas, incluso en candidaturas enviadas
            antes.
          </p>
        </section>
        <section className="panel">
          <header className="panel-heading">
            <h2>Hitos de las candidaturas enviadas</h2>
          </header>
          <Milestones report={report} />
          <p className="statistics-note">
            Candidaturas distintas, hasta hoy. Pueden saltarse etapas. Rechazos
            registrados: {report.rejected}.
          </p>
        </section>
      </div>
      <section className="panel">
        <header className="panel-heading">
          <h2>Resultados por fuente</h2>
          <span>{report.sent} candidaturas</span>
        </header>
        <div className="statistics-table-wrap">
          <table className="statistics-table">
            <thead>
              <tr>
                <th>Fuente</th>
                <th>Enviadas</th>
                <th>Respuestas</th>
                <th>Entrevistas</th>
                <th>Ofertas</th>
                <th>Respuesta</th>
              </tr>
            </thead>
            <tbody>
              {report.bySource.map((s) => (
                <tr key={s.source}>
                  <th>{s.label}</th>
                  <td>{s.sent}</td>
                  <td>{s.responses}</td>
                  <td>{s.interviews}</td>
                  <td>{s.offers}</td>
                  <td>
                    {s.rate} %{s.sent < 10 && <small> Muestra pequeña</small>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!report.sent && (
          <p className="compact-empty">
            No hay candidaturas enviadas en este periodo y con estos filtros.
          </p>
        )}
      </section>
      <ExtendedStatistics report={report} />
      <section className="panel statistics-snapshot">
        <h2>Ahora mismo</h2>
        <p>
          Foto actual con la fuente y empresa elegidas, independiente del
          periodo.
        </p>
        <div>
          <span>
            <strong>{report.current.active}</strong> procesos activos
          </span>
          <span>
            <strong>{report.current.interviews}</strong> en entrevista
          </span>
          <span>
            <strong>{report.current.pending}</strong> próximas acciones{" "}
            <small>({report.current.overdue} vencidas)</small>
          </span>
        </div>
      </section>
      <p className="statistics-note">
        La respuesta se mide con «Primera respuesta real» en la ficha de
        candidatura, no con emails automáticos ni fechas de edición. Los hitos
        usan estados e historial conservado; los pasos omitidos no se inventan y
        las pendientes no son fracasos.
      </p>
      <Sheet
        open={!!drill}
        onOpenChange={(open) => {
          if (!open) setDrill("");
        }}
        title="Candidaturas que explican la cifra"
        description="Enviadas en el periodo y con los filtros del informe"
      >
        <div className="statistics-drill">
          {rows.map((r) => (
            <Link key={r.id} href={"/applications/" + r.id}>
              <strong>{r.title}</strong>
              <span>
                {r.company} · {r.source}
              </span>
              <small>
                Enviada {prettyDate(r.appliedAt)} · {r.status}
                {r.firstResponseAt
                  ? " · Respuesta " + prettyDate(r.firstResponseAt)
                  : ""}
              </small>
            </Link>
          ))}
          {!rows.length && (
            <p className="muted">Sin candidaturas para esta cifra.</p>
          )}
        </div>
      </Sheet>
    </div>
  );
}
