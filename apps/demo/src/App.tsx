import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Building2,
  BriefcaseBusiness,
  CalendarDays,
  ChartNoAxesCombined,
  Columns3,
  Home,
  Moon,
  Plus,
  Search,
  Send,
  Sun,
  Users,
  X,
} from "lucide-react";
import { entities, type EntityKind } from "../../../packages/domain/tracker";
import type { Command, Kind } from "../../../packages/domain/workspace";
import {
  creationShortcut,
  editingTextOrDialog,
} from "../../../packages/ui/creation-shortcut";
import {
  Board,
  Collection,
  Statistics,
  Today,
  type ViewProps,
} from "../../windows/src/renderer/Views";
import { Editor, type EditorState } from "../../windows/src/renderer/Editor";
import { RecordDetails } from "../../windows/src/renderer/RecordDetails";
import {
  getItems,
  isEntity,
  recordLabel,
  searchRows,
} from "../../windows/src/renderer/model";
import { DemoStore } from "./store";

const logo = new URL("../../../public/brand/mappleo-logo.png", import.meta.url)
  .href;

declare const __DEMO_LANGUAGE__: "es" | "en";
const en = __DEMO_LANGUAGE__ === "en";
const navigation = [
  { key: "today", label: "Hoy", icon: Home },
  { key: "board", label: "Kanban", icon: Columns3 },
  { key: "companies", label: "Empresas", icon: Building2 },
  { key: "offers", label: "Ofertas", icon: BriefcaseBusiness },
  { key: "applications", label: "Candidaturas", icon: Send },
  { key: "contacts", label: "Contactos", icon: Users },
  { key: "networking", label: "Networking", icon: CalendarDays },
  { key: "statistics", label: "Estadísticas", icon: ChartNoAxesCombined },
] as const;
function makeStore() {
  let storage: Storage | undefined;
  try {
    storage = window.sessionStorage;
  } catch {
    /* Memory-only mode. */
  }
  return new DemoStore(__DEMO_LANGUAGE__, storage);
}

export function App() {
  const mainRef = useRef<HTMLElement>(null);
  const [store] = useState(makeStore),
    [data, setData] = useState(() => store.snapshot());
  const [section, setSection] = useState("today"),
    [editor, setEditor] = useState<EditorState | null>(null);
  const [detail, setDetail] = useState<{ kind: Kind; id: string } | null>(null);
  const [query, setQuery] = useState(""),
    [theme, setTheme] = useState("light"),
    [notice, setNotice] = useState("");
  const navigate = (key: string) => {
    setSection(key);
    setDetail(null);
    setQuery("");
  };
  useEffect(() => {
    mainRef.current?.scrollTo(0, 0);
  }, [section]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  useEffect(() => {
    const tick = () => {
      if (store.expired()) {
        setData(store.reset());
        setDetail(null);
        setEditor(null);
        setNotice(
          en
            ? "The demo expired. Sample data has been restored."
            : "La demo ha caducado. Se han restaurado los datos de ejemplo.",
        );
      }
    };
    const timer = window.setInterval(tick, 1000);
    window.addEventListener("focus", tick);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", tick);
    };
  }, [store]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (
        editingTextOrDialog(event.target) ||
        document.querySelector("[role='dialog']")
      )
        return;
      const kind = creationShortcut(event);
      if (kind) {
        event.preventDefault();
        setEditor({ kind });
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, []);
  const mutate = async (command: Command) => {
    try {
      const next = store.command(command);
      setData(next);
      if (
        command.action === "delete" &&
        detail?.kind === command.kind &&
        detail.id === command.id
      )
        setDetail(null);
      return true;
    } catch (error) {
      setData(store.snapshot());
      setNotice(
        error instanceof Error && !("issues" in error)
          ? error.message
          : en
            ? "Check the required fields, dates and links."
            : "Revisa los campos obligatorios, las fechas y los enlaces.",
      );
      return false;
    }
  };
  const open = (kind: Kind, id: string) => {
    setQuery("");
    if (kind === "tasks" || kind === "boardColumns") setEditor({ kind, id });
    else setDetail({ kind, id });
  };
  const props: ViewProps = {
    data,
    edit: setEditor,
    open,
    mutate,
    busy: false,
    createAction: (kind, id) => {
      navigate("board");
      setEditor({
        kind: "tasks",
        defaults: {
          links: [{ kind, recordId: id, label: recordLabel(data, kind, id) }],
        },
      });
    },
  };
  const results = searchRows(data, query);
  return (
    <>
      <div className="demo-banner" role="note">
        <div>
          <strong>
            {en ? "Interactive static demo" : "Demo estática interactiva"}
          </strong>
          <span>
            {en
              ? "John Miller and all records are fictitious. Try creating and moving things: changes stay in this tab for up to 30 minutes, then reset. No account, sync or real uploads. Do not enter personal information."
              : "John Miller y todos los registros son ficticios. Prueba a crear y mover cosas: los cambios solo duran hasta 30 minutos en esta pestaña y después se reinician. Sin cuenta, sincronización ni subidas reales. No introduzcas información personal."}
          </span>
        </div>
        <div className="demo-banner-actions">
          <a
            href={en ? "../es/index.html" : "../en/index.html"}
            lang={en ? "es" : "en"}
          >
            {en ? "Español" : "English"}
          </a>
        </div>
      </div>
      <div className="application demo-application">
        <a className="skip-link" href="#main">
          Ir al contenido
        </a>
        <aside className="sidebar">
          <button className="brand" onClick={() => navigate("today")}>
            <img src={logo} alt="" />
            <strong>
              Mappleo<span>.</span>
            </strong>
          </button>
          <span className="local-edition">
            {en ? "INTERACTIVE DEMO" : "DEMO INTERACTIVA"}
          </span>
          <nav aria-label="Secciones">
            {navigation.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                className={section === key ? "active" : ""}
                aria-current={section === key ? "page" : undefined}
                onClick={() => navigate(key)}
              >
                <Icon size={17} />
                {label}
                {isEntity(key) && (
                  <span className="nav-count">
                    {getItems(data, key).length}
                  </span>
                )}
              </button>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <div className="profile">
              <span className="profile-avatar">JM</span>
              <span>
                <strong>John Miller</strong>
                <small>
                  {en
                    ? "Fictitious profile · 6 months"
                    : "Perfil ficticio · 6 meses"}
                </small>
              </span>
            </div>
            <p className="muted demo-local">
              {en
                ? "Browser only · no server"
                : "Solo navegador · sin servidor"}
            </p>
          </div>
        </aside>
        <div className="workspace">
          <header className="topbar">
            <div className="global-search">
              <Search size={16} />
              <input
                type="search"
                aria-label="Buscar en todo Mappleo"
                placeholder="Buscar en Mappleo…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              {query && (
                <div className="global-results">
                  {results.map((result) => (
                    <button
                      key={result.kind + result.item.id}
                      onClick={() => open(result.kind, result.item.id)}
                    >
                      <span>
                        {isEntity(result.kind)
                          ? entities[result.kind].singular
                          : "Tarea"}
                      </span>
                      <strong>
                        {recordLabel(data, result.kind, result.item.id)}
                      </strong>
                    </button>
                  ))}
                  {!results.length && (
                    <p>{en ? "No results." : "Sin resultados."}</p>
                  )}
                </div>
              )}
            </div>
            <div className="topbar-right">
              <button
                className="icon-button"
                aria-label={
                  theme === "light"
                    ? "Activar modo oscuro"
                    : "Activar modo claro"
                }
                onClick={() => setTheme(theme === "light" ? "dark" : "light")}
              >
                {theme === "light" ? <Moon size={17} /> : <Sun size={17} />}
              </button>
              <details className="quick-menu">
                <summary className="button primary">
                  <Plus size={16} />
                  Añadir
                </summary>
                <div>
                  {Object.entries(entities).map(([kind, config]) => (
                    <button
                      key={kind}
                      onClick={(event) => {
                        event.currentTarget
                          .closest("details")
                          ?.removeAttribute("open");
                        setEditor({ kind: kind as EntityKind });
                      }}
                    >
                      {config.create}
                    </button>
                  ))}
                  <button
                    onClick={(event) => {
                      event.currentTarget
                        .closest("details")
                        ?.removeAttribute("open");
                      setEditor({ kind: "tasks" });
                    }}
                  >
                    Nueva tarea
                  </button>
                </div>
              </details>
            </div>
          </header>
          <main
            ref={mainRef}
            id="main"
            className={"page " + (section === "board" ? "board-page" : "")}
          >
            {section === "today" ? (
              <Today {...props} />
            ) : section === "board" ? (
              <Board {...props} />
            ) : section === "statistics" ? (
              <Statistics {...props} />
            ) : isEntity(section) ? (
              <Collection key={section} kind={section} {...props} />
            ) : null}
          </main>
        </div>
        {notice && (
          <div className="notification error" role="alert">
            <span>{notice}</span>
            <button aria-label="Cerrar aviso" onClick={() => setNotice("")}>
              <X size={16} />
            </button>
          </div>
        )}
        {detail &&
          getItems(data, detail.kind).some((item) => item.id === detail.id) && (
            <Dialog.Root
              open
              onOpenChange={(open) => {
                if (!open) setDetail(null);
              }}
            >
              <Dialog.Portal>
                <Dialog.Overlay className="modal-overlay" />
                <Dialog.Content className="editor record-sheet">
                  <header>
                    <div>
                      <Dialog.Title>
                        {recordLabel(data, detail.kind, detail.id)}
                      </Dialog.Title>
                      <Dialog.Description>
                        {en
                          ? "Fictitious demo record"
                          : "Ficha ficticia de la demo"}
                      </Dialog.Description>
                    </div>
                    <Dialog.Close className="icon-button" aria-label="Cerrar">
                      <X size={20} />
                    </Dialog.Close>
                  </header>
                  <div className="record-sheet-body">
                    <RecordDetails
                      key={detail.kind + detail.id}
                      {...props}
                      kind={detail.kind}
                      id={detail.id}
                      external={() =>
                        setNotice(
                          en
                            ? "Example links are fictitious. This demo does not open external websites."
                            : "Los enlaces de ejemplo son ficticios. Esta demo no abre webs externas.",
                        )
                      }
                    />
                  </div>
                </Dialog.Content>
              </Dialog.Portal>
            </Dialog.Root>
          )}
        {editor && (
          <Editor
            key={editor.kind + (editor.id ?? "new")}
            state={editor}
            {...props}
            mutate={mutate}
            close={() => setEditor(null)}
            saveHint={
              en
                ? "Temporary demo changes. Not saved to an account."
                : "Cambios temporales de la demo. No se guardan en ninguna cuenta."
            }
            deleteHint={
              en
                ? "This action cannot be undone. Reset the demo to restore its sample data."
                : "Esta acción no se puede deshacer. Reinicia la demo para restaurar los datos de ejemplo."
            }
          />
        )}
      </div>
    </>
  );
}
