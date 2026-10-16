import { RecordDetails } from "./RecordDetails";
import { useEffect, useState, type FormEvent } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Building2,
  CalendarDays,
  ChartNoAxesCombined,
  CircleHelp,
  Columns3,
  Download,
  Home,
  LoaderCircle,
  Moon,
  Plus,
  Search,
  Settings,
  Sun,
  Upload,
  Users,
  BriefcaseBusiness,
  Send,
  X,
  FolderOpen,
} from "lucide-react";
import { entities, type EntityKind } from "../../../../packages/domain/tracker";
import { csvSections } from "../../../../packages/domain/csv-sections";
import type { Command, Kind, Result, Snapshot } from "../shared/contracts";
import { Select } from "../../../../packages/ui/select";
import { Editor, type EditorState } from "./Editor";
import { Board, Collection, Today, Statistics, type ViewProps } from "./Views";
import { getItems, isEntity, recordLabel, searchRows, subtitle } from "./model";
import brandLogo from "../../../../public/brand/mappleo-logo.png";
import { SyncSettings, SyncIndicator } from "./SyncSettings";
import { FilesView } from "./FilesView";
import {
  creationShortcut,
  editingTextOrDialog,
} from "../../../../packages/ui/creation-shortcut";

const navigation = [
  { key: "today", label: "Hoy", icon: Home },
  { key: "board", label: "Kanban", icon: Columns3 },
  { key: "companies", label: "Empresas", icon: Building2 },
  { key: "offers", label: "Ofertas", icon: BriefcaseBusiness },
  { key: "applications", label: "Candidaturas", icon: Send },
  { key: "contacts", label: "Contactos", icon: Users },
  { key: "networking", label: "Networking", icon: CalendarDays },
  { key: "statistics", label: "Estadísticas", icon: ChartNoAxesCombined },
  { key: "files", label: "Archivos", icon: FolderOpen },
] as const;
export function App() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null),
    [section, setSection] = useState("today"),
    [detail, setDetail] = useState<{ kind: Kind; id: string } | null>(null),
    [editor, setEditor] = useState<EditorState | null>(null),
    [query, setQuery] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState<{ text: string; error: boolean } | null>(
      null,
    ),
    [theme, setTheme] = useState(
      localStorage.getItem("mappleo-desktop-theme") ?? "light",
    );
  const notify = (text: string, error = false) => setNotice({ text, error });
  async function refresh() {
    try {
      const result = await window.mappleo.snapshot();
      if (result.ok) setSnapshot(result.data);
      else notify(result.error, true);
    } catch {
      notify(
        "No se ha podido abrir el espacio local. Inicia Mappleo desde la aplicación de escritorio.",
        true,
      );
    }
  }
  useEffect(() => {
    void refresh();
    return window.mappleo.onChange(() => void refresh());
  }, []);
  useEffect(() => {
    const online = () => {
      void window.mappleo.connectionAvailable();
    };
    window.addEventListener("online", online);
    return () => window.removeEventListener("online", online);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("mappleo-desktop-theme", theme);
  }, [theme]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 8000);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (
        !snapshot?.profile ||
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
    window.addEventListener("keydown", listener, true);
    return () => window.removeEventListener("keydown", listener, true);
  }, [snapshot?.profile]);
  async function mutate(command: Command) {
    if (busy) return false;
    setBusy(true);
    try {
      const result = await window.mappleo.command(command);
      if (!result.ok) {
        notify(result.error, true);
        return false;
      }
      setSnapshot(result.data);
      return true;
    } catch {
      notify("No se ha podido guardar el cambio.", true);
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function run<T>(operation: () => Promise<Result<T>>, success: string) {
    if (busy) return;
    setBusy(true);
    try {
      const result = await operation();
      if (result.ok) {
        if (result.data) notify(success);
        await refresh();
      } else notify(result.error, true);
    } catch {
      notify("No se ha podido completar la operación.", true);
    } finally {
      setBusy(false);
    }
  }
  async function importBackup() {
    if (busy) return;
    setBusy(true);
    try {
      const result = await window.mappleo.importBackup();
      if (result.ok && result.data) {
        notify(
          `Importación terminada: ${result.data.added} añadidos, ${result.data.updated} actualizados y ${result.data.skipped} conservados.`,
        );
        await refresh();
      } else if (!result.ok) notify(result.error, true);
    } catch {
      notify("No se ha podido importar la copia.", true);
    } finally {
      setBusy(false);
    }
  }
  const open = (kind: Kind, id: string) => {
    setQuery("");
    if (kind === "tasks") {
      setEditor({ kind, id });
      return;
    }
    setDetail({ kind, id });
  };
  const edit = (state: EditorState) => setEditor(state);
  const navigate = (key: string) => {
    setSection(key);
    setDetail(null);
    setQuery("");
  };
  const notification = notice && (
    <div
      role={notice.error ? "alert" : "status"}
      className={"notification " + (notice.error ? "error" : "")}
    >
      <span>{notice.text}</span>
      <button aria-label="Cerrar aviso" onClick={() => setNotice(null)}>
        <X size={16} />
      </button>
    </div>
  );
  if (!snapshot)
    return (
      <main className="welcome">
        <LoaderCircle className="loading" />
        <h1>Abriendo Mappleo…</h1>
        {notification}
      </main>
    );
  if (!snapshot.profile)
    return (
      <main className="welcome">
        <img src={logoUrl()} alt="Mappleo" />
        <span className="eyebrow">MAPPLEO PARA WINDOWS</span>
        <h1>Tu búsqueda, en tu ordenador.</h1>
        <p>
          Crea un perfil local para empezar. No necesitas internet, una cuenta
          web ni un código de registro.
        </p>
        <form
          onSubmit={async (event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            await mutate({
              action: "profile",
              name: String(new FormData(event.currentTarget).get("name")),
            });
          }}
        >
          <label htmlFor="profile-name">¿Cómo te llamas?</label>
          <input
            id="profile-name"
            name="name"
            required
            minLength={1}
            maxLength={100}
            autoFocus
            placeholder="Tu nombre"
          />
          <button className="button primary" disabled={busy}>
            Crear mi espacio local
          </button>
        </form>
        <small>
          Los datos se guardarán cifrados bajo tu usuario de Windows. Puedes
          importar después una copia JSON desde Configuración.
        </small>
        {notification}
      </main>
    );
  const data = snapshot.workspace,
    viewProps: ViewProps = {
      data,
      open,
      edit,
      mutate,
      busy,
      createAction: (kind, id) => {
        navigate("board");
        setEditor({
          kind: "tasks",
          defaults: {
            links: [{ kind, recordId: id, label: recordLabel(data, kind, id) }],
          },
        });
      },
      exportPdf: () =>
        void run(() => window.mappleo.exportPdf(), "Informe PDF guardado."),
    };
  const results = searchRows(data, query);
  return (
    <div className="application">
      <a className="skip-link" href="#main">
        Ir al contenido
      </a>
      <aside className="sidebar">
        <button className="brand" onClick={() => navigate("today")}>
          <img src={logoUrl()} alt="" />
          <strong>
            Mappleo<span>.</span>
          </strong>
        </button>
        <span className="local-edition">WINDOWS</span>
        <nav aria-label="Secciones">
          {navigation.map(({ key, label, icon: Icon }) => (
            <button
              aria-label={label}
              className={section === key ? "active" : ""}
              key={key}
              onClick={() => navigate(key)}
            >
              <Icon size={17} />
              {label}
              {isEntity(key) && (
                <span className="nav-count">
                  {getItems(data, key).length || ""}
                </span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button
            onClick={() => navigate("settings")}
            aria-label="Estado de sincronización"
          >
            <SyncIndicator status={snapshot.sync} />
          </button>
          <button
            className={section === "settings" ? "active" : ""}
            onClick={() => navigate("settings")}
          >
            <Settings size={17} />
            Configuración
          </button>
          <button className="profile" onClick={() => navigate("settings")}>
            <span className="profile-avatar">
              {snapshot.profile.name[0].toUpperCase()}
            </span>
            <span>
              <strong>{snapshot.profile.name}</strong>
              <small>Perfil local</small>
            </span>
          </button>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="global-search">
            <Search size={16} />
            <input
              type="search"
              placeholder="Buscar en Mappleo…"
              aria-label="Buscar en todo Mappleo"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
              <div className="global-results">
                {results.map((r) => (
                  <button
                    key={r.kind + r.item.id}
                    onClick={() => open(r.kind, r.item.id)}
                  >
                    <span>
                      {r.kind === "tasks"
                        ? "Tarea"
                        : isEntity(r.kind)
                          ? entities[r.kind].singular
                          : "Registro"}
                    </span>
                    <strong>{recordLabel(data, r.kind, r.item.id)}</strong>
                    <small>{subtitle(data, r.kind, r.item)}</small>
                  </button>
                ))}
                {!results.length && <p>No hay resultados para «{query}».</p>}
              </div>
            )}
          </div>
          <div className="shortcut-help">
            <button className="icon-button" aria-label="Ver accesos directos">
              <CircleHelp size={17} />
            </button>
            <div className="shortcut-tooltip">
              <strong>Creación rápida</strong>
              {[
                ["E", "Empresa"],
                ["O", "Oferta"],
                ["C", "Candidatura"],
                ["N", "Evento networking"],
                ["T", "Contacto"],
              ].map(([key, label]) => (
                <div key={key}>
                  <span>{label}</span>
                  <kbd>Ctrl + Alt + {key}</kbd>
                </div>
              ))}
            </div>
          </div>
          <div className="topbar-right">
            <span className="local-indicator">
              <span />
              Guardado en tu PC
            </span>
            <button
              className="icon-button"
              aria-label={
                theme === "light" ? "Activar modo oscuro" : "Activar modo claro"
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
                      edit({ kind: kind as EntityKind });
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
                    edit({ kind: "tasks" });
                  }}
                >
                  Nueva tarea
                </button>
              </div>
            </details>
          </div>
        </header>
        <main
          id="main"
          className={"page " + (section === "board" ? "board-page" : "")}
        >
          {section === "today" ? (
            <Today {...viewProps} />
          ) : section === "board" ? (
            <Board {...viewProps} />
          ) : section === "statistics" ? (
            <Statistics {...viewProps} />
          ) : section === "files" ? (
            <FilesView data={data} openOffer={(id) => open("offers", id)} />
          ) : isEntity(section) ? (
            <Collection key={section} kind={section} {...viewProps} />
          ) : (
            <>
              <header className="page-heading">
                <div>
                  <h1>Configuración</h1>
                  <p>Tu espacio y tus copias de seguridad.</p>
                </div>
              </header>
              <section className="panel settings-panel">
                <h2>Perfil local</h2>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (
                      await mutate({
                        action: "profile",
                        name: String(new FormData(e.currentTarget).get("name")),
                      })
                    )
                      notify("Nombre actualizado.");
                  }}
                >
                  <label htmlFor="settings-name">Nombre</label>
                  <div className="inline-form">
                    <input
                      id="settings-name"
                      name="name"
                      maxLength={100}
                      required
                      defaultValue={snapshot.profile.name}
                    />
                    <button className="button primary" disabled={busy}>
                      Guardar nombre
                    </button>
                  </div>
                </form>
                <p>
                  El acceso local depende de tu usuario de Windows. Vincular una
                  cuenta web es opcional; puedes seguir trabajando sin internet.
                </p>
              </section>
              <SyncSettings
                status={snapshot.sync}
                busy={busy}
                run={(operation, success) => void run(operation, success)}
              />
              <section className="panel settings-panel">
                <h2>Apariencia</h2>
                <div className="theme-options">
                  <button
                    className={
                      "button " + (theme === "light" ? "selected" : "")
                    }
                    onClick={() => setTheme("light")}
                  >
                    <Sun size={16} />
                    Claro
                  </button>
                  <button
                    className={"button " + (theme === "dark" ? "selected" : "")}
                    onClick={() => setTheme("dark")}
                  >
                    <Moon size={16} />
                    Oscuro
                  </button>
                </div>
              </section>
              <section className="panel settings-panel">
                <h2>Copias de seguridad y exportación</h2>
                <p>
                  Importa los JSON de Mappleo web o Windows. Reimportar la misma
                  copia no duplica sus registros; los datos locales más
                  recientes y los borrados se conservan.
                </p>
                <p className="muted">
                  Los archivos JSON, CSV y PDF exportados no están cifrados.
                  Guárdalos en un sitio privado. Los archivos .mappleo
                  protegidos por contraseña no se importan en esta primera
                  versión: exporta un JSON desde la web.
                </p>
                <div className="settings-actions">
                  <button
                    className="button primary"
                    disabled={busy}
                    onClick={() => void importBackup()}
                  >
                    <Upload size={16} />
                    Importar JSON
                  </button>
                  <button
                    className="button"
                    disabled={busy}
                    onClick={() =>
                      void run(
                        () => window.mappleo.exportFile("json"),
                        "Copia JSON guardada.",
                      )
                    }
                  >
                    <Download size={16} />
                    Exportar JSON completo
                  </button>
                  <button
                    className="button"
                    disabled={busy}
                    onClick={() =>
                      void run(
                        () => window.mappleo.exportPdf(),
                        "Informe PDF guardado.",
                      )
                    }
                  >
                    Guardar esta vista en PDF
                  </button>
                </div>
                <form
                  className="inline-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const section = new FormData(event.currentTarget).get(
                      "section",
                    ) as (typeof csvSections)[number]["id"];
                    void run(
                      () => window.mappleo.exportFile("csv", section),
                      "CSV guardado.",
                    );
                  }}
                >
                  <Select
                    name="section"
                    label="Datos del CSV"
                    options={csvSections.map((s) => ({
                      value: s.id,
                      label: s.label,
                    }))}
                  />
                  <button className="button" disabled={busy}>
                    Exportar CSV
                  </button>
                </form>
              </section>
              <section className="panel settings-panel">
                <h2>Almacenamiento y seguridad</h2>
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    const confirmation = String(
                      new FormData(event.currentTarget).get("confirmation"),
                    );
                    void run(async () => {
                      const r =
                        await window.mappleo.resetLocalProfile(confirmation);
                      if (r.ok && r.data) {
                        setDetail(null);
                        setEditor(null);
                        setSection("today");
                        setQuery("");
                      }
                      return r;
                    }, "Espacio local borrado. Puedes empezar de nuevo.");
                  }}
                >
                  <h3>Borrar el espacio local</h3>
                  <p>
                    Elimina este perfil, sus registros, archivos y copias
                    locales. No borra tu cuenta web ni sus datos. Exporta antes
                    lo que quieras conservar; no se puede deshacer.
                  </p>
                  <label htmlFor="reset-confirmation">
                    Escribe BORRAR LOCAL para confirmar
                  </label>
                  <input
                    id="reset-confirmation"
                    name="confirmation"
                    required
                    pattern="BORRAR LOCAL"
                    autoComplete="off"
                  />
                  <button className="button danger" disabled={busy}>
                    Borrar cuenta local y empezar de cero
                  </button>
                </form>
                <dl>
                  <dt>Versión</dt>
                  <dd>{snapshot.version} · Windows local</dd>
                  <dt>Carpeta de datos</dt>
                  <dd>{snapshot.dataPath}</dd>
                  <dt>Base de datos</dt>
                  <dd>SQLite · registros cifrados con AES-256-GCM</dd>
                  <dt>Clave</dt>
                  <dd>Protegida por Windows, no incluida en el instalador</dd>
                  <dt>Conexión</dt>
                  <dd>
                    {snapshot.sync.connected
                      ? "Sincronización opcional por HTTPS. Credenciales protegidas en este equipo."
                      : "Cuenta desconectada. Los cambios solo se guardan en este equipo."}
                  </dd>
                </dl>
                <p>
                  Se conservan hasta 10 copias locales al abrir la aplicación o
                  importar datos. Estas copias cifradas dependen de la clave y
                  del usuario de Windows original: exporta JSON para trasladar
                  tus datos a otro equipo.
                </p>
                <button
                  className="button"
                  onClick={() =>
                    void run(
                      () => window.mappleo.openDataFolder(),
                      "Carpeta abierta.",
                    )
                  }
                >
                  Abrir carpeta de datos
                </button>
              </section>
            </>
          )}
        </main>
      </div>
      {detail &&
        getItems(data, detail.kind).some((r) => r.id === detail.id) && (
          <Dialog.Root
            open
            onOpenChange={(open) => !open && !busy && setDetail(null)}
          >
            <Dialog.Portal>
              <Dialog.Overlay className="modal-overlay" />
              <Dialog.Content
                className="editor record-sheet"
                key={detail.kind + detail.id}
              >
                <header>
                  <div>
                    <Dialog.Title>
                      {isEntity(detail.kind)
                        ? entities[detail.kind].singular
                        : "Ficha"}
                    </Dialog.Title>
                    <Dialog.Description>
                      Consulta la información y sus registros relacionados.
                    </Dialog.Description>
                  </div>
                  <Dialog.Close asChild>
                    <button
                      className="icon-button"
                      aria-label="Cerrar ficha"
                      disabled={busy}
                    >
                      <X size={20} />
                    </button>
                  </Dialog.Close>
                </header>
                <div className="record-sheet-content">
                  <RecordDetails
                    key={detail.kind + detail.id}
                    {...viewProps}
                    kind={detail.kind}
                    id={detail.id}
                    renderFiles={(offerId, heading) => (
                      <FilesView
                        key={offerId}
                        data={data}
                        offerId={offerId}
                        heading={heading}
                        openOffer={(id) => open("offers", id)}
                      />
                    )}
                    external={(url) =>
                      void run(
                        () => window.mappleo.openExternal(url),
                        "Enlace abierto en tu navegador.",
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
          data={data}
          busy={busy}
          mutate={mutate}
          close={() => setEditor(null)}
        />
      )}{" "}
      {notification}
      {busy && (
        <div className="saving-indicator" role="status">
          <LoaderCircle size={14} className="loading" />
          Procesando…
        </div>
      )}
    </div>
  );
}
function logoUrl() {
  return brandLogo;
}
