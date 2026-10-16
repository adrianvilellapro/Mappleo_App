import { lazy, Suspense, useCallback, useEffect } from "react";
import { X } from "lucide-react";
import Link, { useDemoState, usePathname } from "./router";
import { demoRuntime } from "./runtime";
import {
  demoCalendar,
  demoDashboard,
  demoStatistics,
  recordRows,
  recordOptions,
  taskLinkOptions,
} from "./web-data";
import { Navigation } from "../../../components/layout/navigation";
import { Topbar } from "../../../components/layout/topbar";
import { RecordsView } from "../../../features/tracker/components/records-view";
import { DashboardView } from "../../../features/dashboard/view";
import { SearchView } from "../../../features/search/view";
import { isEntityKind, entities } from "../../../features/tracker/config";
import { searchRecord } from "../../../features/tracker/search";
import Loading from "../../../app/(workspace)/loading";

const Board = lazy(() =>
  import("../../../features/tasks/board").then((m) => ({ default: m.Board })),
);
const StatisticsView = lazy(() =>
  import("../../../features/statistics/view").then((m) => ({
    default: m.StatisticsView,
  })),
);
const SettingsView = lazy(() =>
  import("../../../features/account/settings-view").then((m) => ({
    default: m.SettingsView,
  })),
);

declare const __DEMO_LANGUAGE__: "es" | "en";
const en = __DEMO_LANGUAGE__ === "en";

export function App() {
  const runtime = demoRuntime();
  const { data, href, notice } = useDemoState();
  const pathname = usePathname();
  const params = new URLSearchParams(href.split("?")[1]);
  const [section, id] = pathname.slice(1).split("/");
  const loadCalendar = useCallback(
    async (month: string) => ({ month, items: demoCalendar(data, month) }),
    [data],
  );
  useEffect(() => {
    try {
      document.documentElement.dataset.theme =
        localStorage.getItem("mappleo-theme") === "dark" ? "dark" : "light";
    } catch {
      document.documentElement.dataset.theme = "light";
    }
    const timer = window.setInterval(runtime.expire, 1000);
    window.addEventListener("focus", runtime.expire);
    window.addEventListener("popstate", runtime.restoreRoute);
    window.addEventListener("hashchange", runtime.restoreRoute);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", runtime.expire);
      window.removeEventListener("popstate", runtime.restoreRoute);
      window.removeEventListener("hashchange", runtime.restoreRoute);
    };
  }, [runtime]);
  const options = recordOptions(data);
  let content;
  if (isEntityKind(section)) {
    content = (
      <RecordsView
        key={section}
        kind={section}
        records={recordRows(data, section)}
        options={options}
        initialRecordId={id}
        creating={params.get("new") === "1"}
        preset={Object.fromEntries(params)}
        initialScope={params.get("scope") ?? undefined}
      />
    );
  } else if (section === "kanban") {
    const links = taskLinkOptions(data);
    content = (
      <Board
        key={href}
        columns={[...(data.boardColumns ?? [])].sort(
          (a, b) => a.position - b.position,
        )}
        tasks={[...(data.tasks ?? [])].sort(
          (a, b) => a.position - b.position || a.id.localeCompare(b.id),
        )}
        options={links}
        initialTaskId={params.get("task") ?? undefined}
        initialCreate={params.get("new") === "1"}
        initialLink={links.find(
          (l) =>
            l.kind === params.get("kind") && l.id === params.get("recordId"),
        )}
      />
    );
  } else if (section === "statistics") {
    let report;
    let reportError = "";
    try {
      report = demoStatistics(data, Object.fromEntries(params));
    } catch (error) {
      reportError =
        error instanceof Error ? error.message : "Filtro no válido.";
    }
    content = report ? (
      <StatisticsView
        key={href}
        report={report}
        companies={data.companies}
        readOnlyDemo
      />
    ) : (
      <div className="page">
        <h1>Estadísticas</h1>
        <p className="form-error" role="alert">
          {reportError}
        </p>
        <Link className="button button-outline" href="/statistics">
          Restablecer filtros
        </Link>
      </div>
    );
  } else if (section === "settings") {
    content = (
      <SettingsView
        user={{ name: "John Miller", email: "john.miller@example.test" }}
        syncEnabled
        readOnlyDemo
      />
    );
  } else if (section === "search") {
    const q = (params.get("q") ?? "").trim().slice(0, 100);
    const results = q
      ? Object.keys(entities)
          .filter(isEntityKind)
          .map((kind) => ({
            kind,
            rows: recordRows(data, kind)
              .flatMap((row) => {
                const match = searchRecord(kind, row, q);
                return match ? [{ row, match }] : [];
              })
              .sort((a, b) => b.match.score - a.match.score),
          }))
      : [];
    content = <SearchView key={q} q={q} results={results} />;
  } else {
    content = (
      <DashboardView {...demoDashboard(data)} loadCalendar={loadCalendar} />
    );
  }
  return (
    <div
      className="demo-root"
      onSubmitCapture={(event) => {
        const form = event.target;
        if (
          form instanceof HTMLFormElement &&
          form.getAttribute("action") === "/search"
        ) {
          event.preventDefault();
          runtime.navigate(
            "/search?q=" +
              encodeURIComponent(
                String(new FormData(form).get("q") ?? "").slice(0, 100),
              ),
          );
        }
      }}
      onClickCapture={(event) => {
        const anchor = (event.target as Element).closest?.("a");
        const target = anchor?.getAttribute("href") ?? "";
        if (target === "#main") {
          event.preventDefault();
          document.getElementById("main")?.focus();
        } else if (/^(?:https?:|mailto:)/i.test(target)) {
          event.preventDefault();
          runtime.notify(
            en
              ? "Example links are fictitious. This demo does not open external websites."
              : "Los enlaces de ejemplo son ficticios. Esta demo no abre webs externas.",
          );
        }
      }}
    >
      <div className="demo-banner" role="note">
        <div>
          <strong>
            {en ? "Interactive static demo" : "Demo estática interactiva"}
          </strong>
          <span>
            {en
              ? "John Miller and all records are fictitious. Explore the web interface: changes stay in this tab for up to 30 minutes, then reset. Account settings, files and exports are unavailable. Do not enter personal information."
              : "John Miller y todos los registros son ficticios. Explora la interfaz web: los cambios solo duran hasta 30 minutos en esta pestaña y después se reinician. Cuenta, archivos y exportaciones no disponibles. No introduzcas información personal."}
          </span>
        </div>
        <a
          href={en ? "../es/index.html" : "../en/index.html"}
          lang={en ? "es" : "en"}
        >
          {en ? "Español" : "English"}
        </a>
      </div>
      <div className="app-shell demo-application">
        <a className="skip-link" href="#main">
          Saltar al contenido
        </a>
        <Navigation name="John Miller" />
        <div className="workspace">
          <Topbar />
          <main id="main" tabIndex={-1}>
            <Suspense fallback={<Loading />}>{content}</Suspense>
          </main>
        </div>
      </div>
      {notice && (
        <div className="demo-message panel" role="status">
          <span>{notice}</span>
          <button
            className="icon-button"
            aria-label="Cerrar aviso"
            onClick={() => runtime.notify("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
