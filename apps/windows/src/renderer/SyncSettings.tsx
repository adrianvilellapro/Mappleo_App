import { useState } from "react";
import {
  Cloud,
  CloudOff,
  Link2,
  LoaderCircle,
  Unplug,
  AlertTriangle,
} from "lucide-react";
import type { DesktopAPI, Result, SyncStatus } from "../shared/contracts";
import {
  canonical,
  syncSections,
  type SyncConflict,
} from "../../../../packages/domain/sync";

const labels: Record<string, string> = {
  name: "Nombre",
  title: "Título",
  notes: "Notas",
  description: "Descripción",
  status: "Estado",
  nextAction: "Próxima acción",
  nextActionDueAt: "Fecha de la acción",
  followUpAt: "Seguimiento",
  columnId: "Columna",
  position: "Posición",
  completedAt: "Completada",
  email: "Email",
  phone: "Teléfono",
  websiteUrl: "Web",
  careersUrl: "Página de empleo",
  linkedinUrl: "LinkedIn",
  location: "Ubicación",
  companyId: "Empresa",
  jobOfferId: "Oferta",
  events: "Historial",
  links: "Enlaces",
  technologies: "Tecnologías",
  tags: "Etiquetas",
  appliedAt: "Enviada",
  dueAt: "Fecha",
  startsAt: "Inicio",
  endsAt: "Fin",
  interestRating: "Interés",
  salaryMin: "Salario mínimo",
  salaryMax: "Salario máximo",
  workMode: "Modalidad",
  companies: "Empresas",
  contacts: "Contactos",
  applications: "Candidaturas",
  offers: "Ofertas",
  networking: "Networking",
  boardColumns: "Columnas",
  tasks: "Tareas",
  taskCompletions: "Finalizaciones",
};
export function SyncIndicator({ status }: { status: SyncStatus }) {
  const Icon =
    status.phase === "syncing" || status.phase === "connecting"
      ? LoaderCircle
      : status.phase === "conflicts"
        ? AlertTriangle
        : status.connected
          ? Cloud
          : CloudOff;
  const text = {
    disconnected: "Solo en este equipo",
    connecting: "Conectando…",
    syncing: "Sincronizando…",
    synced: "Sincronizado",
    offline: "Sin conexión",
    conflicts: "Discrepancias pendientes",
    error: "Revisar conexión",
    expired: "Reconectar cuenta",
  }[status.phase];
  return (
    <span className={"sync-indicator " + status.phase}>
      <Icon size={14} className={status.phase === "syncing" ? "loading" : ""} />
      {text}
    </span>
  );
}
export function SyncSettings({
  status,
  run,
  busy,
}: {
  status: SyncStatus;
  busy: boolean;
  run: (operation: () => Promise<Result<boolean>>, success: string) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const act = (
    method: keyof Pick<
      DesktopAPI,
      "connectAccount" | "disconnectAccount" | "cancelConnection"
    >,
    success: string,
  ) => run(() => window.mappleo[method](), success);
  return (
    <section className="panel settings-panel sync-settings">
      <h2>
        <Cloud size={19} /> Cuenta web y sincronización
      </h2>
      <SyncIndicator status={status} />
      {status.email && (
        <p>
          Cuenta asociada: <strong>{status.email}</strong>
        </p>
      )}
      <p>
        Tu trabajo siempre se guarda primero en este ordenador. Si conectas tu
        cuenta, los cambios se combinarán automáticamente con la web al abrir
        Mappleo, después de editar y al recuperar la conexión.
      </p>
      {status.lastSyncedAt && (
        <p className="muted">
          Última sincronización:{" "}
          {new Date(status.lastSyncedAt).toLocaleString("es-ES")}
        </p>
      )}
      {status.message && <p role="status">{status.message}</p>}
      {status.revocationPending && (
        <p className="muted">
          Queda pendiente confirmar la revocación en el servidor. Se reintentará
          cuando haya conexión. También puedes revocar el equipo desde la
          configuración web.
        </p>
      )}
      <div className="settings-actions">
        {!status.connected && status.phase !== "connecting" && (
          <button
            className="button primary"
            disabled={busy}
            onClick={() =>
              act("connectAccount", "Continúa la autorización en tu navegador.")
            }
          >
            <Link2 size={16} />
            Conectar mi cuenta
          </button>
        )}
        {status.phase === "connecting" && (
          <button
            className="button"
            disabled={busy}
            onClick={() => act("cancelConnection", "Vinculación cancelada.")}
          >
            Cancelar vinculación
          </button>
        )}
        {status.connected && (
          <button
            className="button danger-text"
            disabled={busy}
            onClick={() => {
              if (
                window.confirm(
                  "¿Desconectar esta cuenta? Los datos del ordenador y de la web se conservarán. No se enviarán más cambios; podrás reconectar la misma cuenta después.",
                )
              )
                act(
                  "disconnectAccount",
                  "Cuenta desconectada. Tus datos locales se conservan.",
                );
            }}
          >
            <Unplug size={16} />
            Desconectar cuenta
          </button>
        )}
      </div>
      {!!status.conflicts.length && (
        <div className="sync-conflicts">
          <h3>Elige qué versión conservar</h3>
          <p>
            No se han aplicado cambios mientras existan discrepancias. La otra
            versión queda protegida en una copia local cifrada antes de
            confirmar tu elección.
          </p>
          {status.conflicts.map((conflict) => (
            <article key={conflict.key} className="sync-conflict">
              <strong>{conflict.label}</strong>
              <small>
                {labels[conflict.section] ?? conflict.section} ·{" "}
                {conflict.reason === "deleted"
                  ? "Borrado en un sitio y modificado en otro"
                  : conflict.reason === "relations"
                    ? "Cambios relacionados incompatibles"
                    : "Modificado en ambos espacios"}
              </small>
              {conflict.section === "workspace" && (
                <p>
                  La combinación parcial dejaría registros sin sus relaciones.
                  Estas opciones conservan el espacio completo elegido,
                  incluidos sus borrados. Revisa ambos resúmenes antes de
                  confirmar.
                </p>
              )}
              <button
                className="text-button"
                onClick={() =>
                  setSelected(selected === conflict.key ? null : conflict.key)
                }
              >
                {selected === conflict.key
                  ? "Ocultar comparación"
                  : "Comparar versiones"}
              </button>
              {selected === conflict.key && <Comparison conflict={conflict} />}
              <div className="settings-actions">
                {(["local", "remote"] as const).map((choice) => (
                  <button
                    key={choice}
                    className="button"
                    disabled={busy}
                    onClick={() => {
                      if (
                        !window.confirm(
                          `¿Conservar ${choice === "local" ? "la versión de este ordenador" : "la versión de la web"} de «${conflict.label}»? Se creará una copia de seguridad antes de resolverla.`,
                        )
                      )
                        return;
                      run(
                        () =>
                          window.mappleo.resolveConflict(conflict.key, choice),
                        "Preferencia guardada. Comprobando los últimos cambios…",
                      );
                    }}
                  >
                    {choice === "local" ? "Conservar Windows" : "Conservar web"}
                  </button>
                ))}
              </div>
            </article>
          ))}
        </div>
      )}
      <p className="muted">
        La vinculación no convierte este perfil en una cuenta distinta: para
        evitar mezclas accidentales, solo se podrá reconectar a la misma cuenta
        y servidor. Desconectar no borra las copias ya sincronizadas.
      </p>
    </section>
  );
}
function Comparison({ conflict }: { conflict: SyncConflict }) {
  const keys = [
    ...new Set([
      ...Object.keys(conflict.local ?? {}),
      ...Object.keys(conflict.remote ?? {}),
    ]),
  ].filter(
    (key) =>
      ![
        "id",
        "userId",
        "updatedAt",
        "createdAt",
        "ownerId",
        "exportedAt",
        "version",
      ].includes(key) &&
      canonical((conflict.local as Record<string, unknown> | null)?.[key]) !==
        canonical((conflict.remote as Record<string, unknown> | null)?.[key]),
  );
  return (
    <div className="sync-comparison">
      {(["local", "remote"] as const).map((side) => {
        const record = conflict[side] as Record<string, unknown> | null;
        return (
          <div key={side}>
            <h4>{side === "local" ? "Este ordenador" : "Web"}</h4>
            {!record ? (
              <p>Registro eliminado</p>
            ) : conflict.section === "workspace" ? (
              <dl>
                {syncSections.map((section) => (
                  <div key={section}>
                    <dt>{labels[section]}</dt>
                    <dd>
                      {Array.isArray(record[section])
                        ? record[section].length
                        : 0}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : (
              <dl>
                {keys.map((key) => (
                  <div key={key}>
                    <dt>{labels[key] ?? key}</dt>
                    <dd>
                      <pre>
                        {record[key] == null
                          ? "Sin valor"
                          : typeof record[key] === "object"
                            ? JSON.stringify(record[key], null, 2)
                            : String(record[key])}
                      </pre>
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        );
      })}
    </div>
  );
}
