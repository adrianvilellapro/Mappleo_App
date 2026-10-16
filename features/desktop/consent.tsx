"use client";
import { useState } from "react";
import { PasswordField } from "@/components/ui/password-field";
import { useHydrated } from "@/lib/use-hydrated";
export function DesktopConsent({
  email,
  authorization,
}: {
  email: string;
  authorization: { challenge: string; state: string; redirectUri: string };
}) {
  const ready = useHydrated();
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <form
      className="login-form"
      method="post"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!ready || busy) return;
        setBusy(true);
        setError("");
        const password = String(
          new FormData(event.currentTarget).get("password"),
        );
        try {
          const response = await fetch("/api/desktop/authorize", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ authorization, password }),
          });
          const result = await response.json();
          if (!response.ok)
            throw new Error(
              result.error ?? "No se ha podido autorizar el equipo.",
            );
          const target = new URL(result.redirect);
          if (
            target.origin !== new URL(authorization.redirectUri).origin ||
            target.pathname !== "/callback"
          )
            throw new Error("Retorno no válido.");
          window.location.assign(target.href);
        } catch (cause) {
          setError(
            cause instanceof Error
              ? cause.message
              : "No se ha podido conectar.",
          );
          setBusy(false);
        }
      }}
    >
      <p>
        Cuenta: <strong>{email}</strong>
      </p>
      <p>
        El equipo podrá leer y modificar tus registros. La primera
        sincronización combinará los datos de ambos espacios; las discrepancias
        necesitarán tu confirmación. No se enviarán archivos ni tu contraseña a
        Windows.
      </p>
      <label>
        <input type="checkbox" required disabled={!ready || busy} /> Autorizo la
        vinculación y la combinación de mis datos locales con esta cuenta.
      </label>
      <PasswordField
        label="Confirma tu contraseña"
        name="password"
        autoComplete="current-password"
        disabled={!ready || busy}
      />
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button className="button button-primary" disabled={!ready || busy}>
        {busy ? "Autorizando…" : "Autorizar este equipo"}
      </button>
      <p className="field-hint">
        Puedes revocar su acceso desde Configuración → Equipos conectados.
      </p>
    </form>
  );
}
