"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { PasswordField } from "@/components/ui/password-field";
import { useHydrated } from "@/lib/use-hydrated";
export function AdminLoginForm() {
  const router = useRouter();
  const ready = useHydrated();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setError("");
    const form = event.currentTarget;
    const fields = Object.fromEntries(new FormData(form));
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
        cache: "no-store",
      });
      const result = await response.json();
      form.reset();
      if (!response.ok) {
        setError(result.error ?? "No se ha podido iniciar sesión.");
        return;
      }
      router.replace("/admin");
      router.refresh();
    } catch {
      form.reset();
      setError("No se ha podido iniciar sesión. Vuelve a intentarlo.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="login-form" method="post" onSubmit={submit}>
      <label htmlFor="admin-email">Email administrativo</label>
      <input
        id="admin-email"
        name="email"
        type="email"
        autoComplete="username"
        maxLength={254}
        required
        disabled={!ready || busy}
      />
      <PasswordField
        label="Contraseña de administrador"
        name="password"
        autoComplete="current-password"
        disabled={!ready || busy}
      />
      <label htmlFor="admin-code">Código del autenticador</label>
      <input
        id="admin-code"
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]{6}"
        minLength={6}
        maxLength={6}
        required
        disabled={!ready || busy}
        aria-describedby="admin-code-hint"
      />
      <p id="admin-code-hint" className="field-hint">
        Introduce el código de seis dígitos que muestra tu aplicación de
        autenticación. La clave de configuración no se introduce aquí.
      </p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button className="button button-primary" disabled={!ready || busy}>
        {busy ? "Verificando acceso…" : "Entrar en administración"}
      </button>
      <p className="field-hint">
        El acceso dura como máximo 30 minutos y caduca tras 10 minutos sin
        actividad. Solo conexiones autorizadas.
      </p>
    </form>
  );
}
