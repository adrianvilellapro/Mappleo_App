"use client";
import { useState, type FormEvent } from "react";
import Link from "@/components/ui/app-link";
import { useRouter } from "next/navigation";
import { PasswordField } from "@/components/ui/password-field";
import { BrandLogo } from "@/components/brand-logo";
import type { AdminOverview } from "./service";
type Selection = {
  operation: "reset-password" | "delete-account" | "limit";
  userId?: string;
};
const date = (value: string) =>
  new Date(value).toLocaleString("es-ES", { timeZone: "Europe/Madrid" });
export function AdminPanel({ initial }: { initial: AdminOverview }) {
  const router = useRouter();
  const [data, setData] = useState(initial),
    [selected, setSelected] = useState<Selection | null>(null);
  const [search, setSearch] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  async function refresh(page = 1, term = search) {
    const response = await fetch("/api/admin/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ page, search: term }),
      cache: "no-store",
    });
    const result = await response.json();
    if (!response.ok) {
      if (response.status === 401) router.replace("/admin/login");
      throw new Error(
        result.error ?? "No se han podido consultar las cuentas.",
      );
    }
    setData(result);
  }
  async function searchAccounts(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function open(selection: Selection) {
    setSelected(selection);
    setMessage("");
    setError("");
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const form = event.currentTarget;
    const fields = Object.fromEntries(new FormData(form));
    const body = {
      ...fields,
      ...(selected.userId ? { userId: selected.userId } : {}),
      ...(selected.operation === "limit"
        ? { maxAccounts: Number(fields.maxAccounts) }
        : {}),
    };
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/${selected.operation}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        cache: "no-store",
      });
      const result = await response.json();
      form.reset();
      if (!response.ok) {
        if (response.status === 401) router.replace("/admin/login");
        setError(result.error ?? "No se ha podido aplicar el cambio.");
        return;
      }
      setSelected(null);
      setMessage(
        selected.operation === "delete-account"
          ? "Cuenta y datos eliminados."
          : selected.operation === "reset-password"
            ? "Contraseña restablecida. Todas las sesiones de esa cuenta se han cerrado."
            : "Límite de cuentas actualizado.",
      );
      await refresh();
    } catch (e) {
      form.reset();
      setError(
        e instanceof Error
          ? e.message
          : "No se ha podido completar la operación.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    setBusy(true);
    try {
      const response = await fetch("/api/admin/logout", { method: "POST" });
      if (!response.ok) {
        setError("No se ha podido cerrar la sesión. Vuelve a intentarlo.");
        return;
      }
      router.replace("/admin/login");
      router.refresh();
    } catch {
      setError("No se ha podido cerrar la sesión. Vuelve a intentarlo.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="admin-panel">
      <header className="admin-header">
        <div>
          <Link className="brand" href="/admin">
            <BrandLogo />
            Mappleo · Administración
          </Link>
          <h1>Cuentas y acceso</h1>
          <p>Administrador único · {data.administrator}</p>
        </div>
        <button
          className="button button-outline"
          onClick={logout}
          disabled={busy}
        >
          Cerrar sesión administrativa
        </button>
      </header>
      <section className="admin-policy">
        <div>
          <h2>
            {data.accountCount} / {data.maxAccounts} cuentas
          </h2>
          <p>
            Incluye la cuenta administrativa. Los registros se bloquean al
            alcanzar el límite.
          </p>
        </div>
        <button
          className="button button-outline"
          onClick={() => open({ operation: "limit" })}
        >
          Cambiar límite
        </button>
      </section>
      <p className="field-hint">
        Vista administrativa: emails completos, fechas, sesiones y recuentos. No
        se muestran nombres, hashes, contraseñas, teléfonos, notas ni contenido
        privado. Buscar por email completo o ID exacto permite localizar una
        cuenta.
      </p>
      <form className="admin-search" onSubmit={searchAccounts}>
        <label htmlFor="admin-search">
          Buscar cuenta por email o ID exacto
        </label>
        <input
          id="admin-search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          maxLength={254}
        />
        <button className="button button-outline" disabled={busy}>
          Buscar
        </button>
      </form>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="admin-success">
          {message}
        </p>
      )}
      {selected && (
        <section
          className="admin-operation"
          aria-label="Confirmar operación administrativa"
        >
          <h2>
            {selected.operation === "limit"
              ? "Cambiar límite de cuentas"
              : selected.operation === "delete-account"
                ? "Eliminar cuenta"
                : "Restablecer contraseña"}
          </h2>
          {selected.userId && (
            <p className="admin-account-id">Cuenta: {selected.userId}</p>
          )}
          {selected.operation === "delete-account" && (
            <p className="form-error">
              Se eliminarán definitivamente esta cuenta y todos sus datos.
              Conserva las copias necesarias antes de continuar.
            </p>
          )}
          <form method="post" onSubmit={submit}>
            {selected.operation === "limit" && (
              <label>
                Máximo de cuentas
                <input
                  name="maxAccounts"
                  type="number"
                  min={data.accountCount}
                  max={data.accountLimitCeiling}
                  defaultValue={data.maxAccounts}
                  required
                />
              </label>
            )}
            {selected.operation === "reset-password" && (
              <>
                <PasswordField
                  label="Nueva contraseña del usuario"
                  name="password"
                  autoComplete="new-password"
                  minLength={8}
                />
                <PasswordField
                  label="Repetir nueva contraseña"
                  name="confirmPassword"
                  autoComplete="new-password"
                  minLength={8}
                />
              </>
            )}
            {selected.operation === "delete-account" && (
              <label>
                Confirmación de borrado
                <input
                  name="confirmation"
                  placeholder={`BORRAR ${selected.userId}`}
                  autoComplete="off"
                  maxLength={160}
                  required
                />
              </label>
            )}
            <PasswordField
              label="Contraseña de operaciones administrativas"
              name="actionPassword"
              autoComplete="current-password"
            />
            <label>
              Código nuevo del autenticador
              <input
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                required
              />
            </label>
            <p className="field-hint">
              Esta contraseña es distinta de la de acceso. No reutilices el
              código de inicio de sesión: espera al siguiente código del
              autenticador.
            </p>
            <div className="admin-buttons">
              <button
                className="button button-outline"
                type="button"
                onClick={() => {
                  setSelected(null);
                  setError("");
                }}
                disabled={busy}
              >
                Cancelar
              </button>
              <button
                className={`button ${selected.operation === "delete-account" ? "button-danger" : "button-primary"}`}
                disabled={busy}
              >
                {busy
                  ? "Verificando…"
                  : selected.operation === "delete-account"
                    ? "Eliminar definitivamente"
                    : "Confirmar cambio"}
              </button>
            </div>
          </form>
        </section>
      )}
      <section aria-label="Cuentas registradas" className="admin-accounts">
        {data.accounts.length === 0 && <p>No hay cuentas que coincidan.</p>}
        {data.accounts.map((account) => (
          <article key={account.id} className="admin-account">
            <div>
              <h2>{account.email}</h2>
              <p className="admin-account-id">ID: {account.id}</p>
              <p>Registro: {date(account.createdAt)}</p>
              <p>Última actualización: {date(account.updatedAt)}</p>
              <p>{account.activeSessions} sesiones vigentes</p>
              <p>
                {account.counts.companies} empresas · {account.counts.offers}{" "}
                ofertas · {account.counts.applications} candidaturas ·{" "}
                {account.counts.contacts} contactos ·{" "}
                {account.counts.networkingEvents} eventos ·{" "}
                {account.counts.tasks} tareas
              </p>
            </div>
            <div className="admin-buttons">
              <button
                className="button button-outline"
                onClick={() =>
                  open({ operation: "reset-password", userId: account.id })
                }
                disabled={busy}
              >
                Restablecer contraseña
              </button>
              <button
                className="button button-danger"
                onClick={() =>
                  open({ operation: "delete-account", userId: account.id })
                }
                disabled={busy}
              >
                Eliminar cuenta
              </button>
            </div>
          </article>
        ))}
      </section>
      <nav className="admin-buttons" aria-label="Páginas de cuentas">
        <button
          className="button button-outline"
          disabled={busy || data.page <= 1}
          onClick={() => {
            setBusy(true);
            refresh(data.page - 1)
              .catch((e) => setError(e.message))
              .finally(() => setBusy(false));
          }}
        >
          Anterior
        </button>
        <span>
          {data.page} / {data.pages}
        </span>
        <button
          className="button button-outline"
          disabled={busy || data.page >= data.pages}
          onClick={() => {
            setBusy(true);
            refresh(data.page + 1)
              .catch((e) => setError(e.message))
              .finally(() => setBusy(false));
          }}
        >
          Siguiente
        </button>
      </nav>
      <section className="admin-audit">
        <h2>Actividad administrativa reciente</h2>
        {data.events.map((event, index) => (
          <p key={index}>
            {date(event.createdAt)} ·{" "}
            {(
              {
                login_success: "Acceso correcto",
                login_denied: "Acceso rechazado",
                action_denied: "Operación rechazada",
                logout: "Cierre de sesión",
                limit: "Límite actualizado",
                "reset-password": "Contraseña restablecida",
                "delete-account": "Cuenta eliminada",
              } as Record<string, string>
            )[event.action] ?? "Evento administrativo"}{" "}
            {event.targetUserId ? `· ${event.targetUserId}` : ""}
          </p>
        ))}
      </section>
    </main>
  );
}
