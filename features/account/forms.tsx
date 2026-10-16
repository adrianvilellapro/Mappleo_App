"use client";
import { useState, useTransition } from "react";
import { signOut } from "next-auth/react";
import { notifyWorkspaceChange } from "@/lib/workspace-events";
import { accountAction } from "./actions";
import { PasswordField } from "@/components/ui/password-field";
import { useHydrated } from "@/lib/use-hydrated";
export function AccountForms({ name }: { name: string }) {
  const ready = useHydrated();
  const [pending, start] = useTransition(),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const submit = (form: HTMLFormElement, kind: string) => {
    if (!ready || pending) return;
    const data = Object.fromEntries(new FormData(form));
    setError("");
    setNotice("");
    start(async () => {
      try {
        const result = await accountAction({ ...data, kind });
        if (!result.ok) {
          setError(result.error || "No se ha podido guardar.");
          return;
        }
        form.reset();
        if (result.logout) {
          await signOut({ callbackUrl: "/login" });
          return;
        }
        setNotice("Nombre actualizado.");
        notifyWorkspaceChange();
      } catch {
        setError("No se ha podido conectar. Vuelve a intentarlo.");
      }
    });
  };
  return (
    <div className="account-forms">
      <form
        method="post"
        aria-label="Cambiar nombre"
        onSubmit={(e) => {
          e.preventDefault();
          submit(e.currentTarget, "name");
        }}
      >
        <h3>Cambiar nombre</h3>
        <fieldset disabled={!ready || pending}>
          <label>
            Nombre
            <input
              name="name"
              autoComplete="name"
              defaultValue={name}
              minLength={2}
              maxLength={100}
              required
            />
          </label>
          <PasswordField
            label="Contraseña actual"
            name="currentPassword"
            autoComplete="current-password"
          />
          <button className="button button-primary" type="submit">
            Guardar nombre
          </button>
        </fieldset>
      </form>
      <form
        method="post"
        aria-label="Cambiar contraseña"
        onSubmit={(e) => {
          e.preventDefault();
          submit(e.currentTarget, "password");
        }}
      >
        <h3>Cambiar contraseña</h3>
        <fieldset disabled={!ready || pending}>
          <PasswordField
            label="Contraseña actual"
            name="currentPassword"
            autoComplete="current-password"
          />
          <PasswordField
            label="Nueva contraseña"
            name="password"
            autoComplete="new-password"
            minLength={8}
          />
          <PasswordField
            label="Confirmar nueva contraseña"
            name="confirmPassword"
            autoComplete="new-password"
          />
          <p className="field-hint">
            Al menos 8 caracteres. Tras cambiarla se cerrarán todas las
            sesiones, incluida esta.
          </p>
          <button className="button button-primary" type="submit">
            Cambiar contraseña
          </button>
        </fieldset>
      </form>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
    </div>
  );
}
