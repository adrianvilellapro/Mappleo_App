"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { Eye, EyeOff, UserPlus } from "lucide-react";
import { Button } from "./ui/button";
import { registrationRequestSchema } from "@/lib/auth/validation";
import { useHydrated } from "@/lib/use-hydrated";
export function RegisterForm() {
  const router = useRouter();
  const ready = useHydrated();
  const [error, setError] = useState(""),
    [pending, setPending] = useState(false),
    [visible, setVisible] = useState(false);
  return (
    <form
      className="login-form"
      method="post"
      aria-busy={pending}
      onSubmit={async (e) => {
        e.preventDefault();
        if (!ready || pending) return;
        setError("");
        const parsed = registrationRequestSchema.safeParse(
          Object.fromEntries(new FormData(e.currentTarget)),
        );
        if (!parsed.success) {
          setError(parsed.error.issues[0].message);
          return;
        }
        setPending(true);
        try {
          const response = await fetch("/api/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(parsed.data),
            cache: "no-store",
          });
          const result = await response.json();
          if (result.ok) {
            const session = await signIn("credentials", {
              email: parsed.data.email,
              password: parsed.data.password,
              redirect: false,
            });
            if (session?.ok) {
              router.replace("/dashboard");
              router.refresh();
            } else {
              setError(
                "La cuenta se ha creado, pero no se pudo iniciar sesión. Inicia sesión con tus datos.",
              );
            }
          } else
            setError(result.error ?? "No se ha podido completar el registro.");
        } catch {
          setError("No se ha podido conectar. Vuelve a intentarlo.");
        } finally {
          setPending(false);
        }
      }}
    >
      <label htmlFor="register-name">Nombre</label>
      <input
        id="register-name"
        name="name"
        autoComplete="name"
        required
        minLength={2}
        maxLength={100}
        disabled={!ready || pending}
      />
      <label htmlFor="register-email">Email</label>
      <input
        id="register-email"
        name="email"
        type="email"
        autoComplete="email"
        required
        maxLength={254}
        disabled={!ready || pending}
      />
      <label htmlFor="register-code">Código de registro</label>
      <input
        id="register-code"
        name="registrationCode"
        type="password"
        autoComplete="off"
        required
        maxLength={128}
        disabled={!ready || pending}
        aria-describedby="registration-code-help"
      />
      <p id="registration-code-help" className="field-hint">
        Necesitas el código de invitación para crear una cuenta.
      </p>
      <label htmlFor="register-password">Contraseña</label>
      <div className="password-control">
        <input
          id="register-password"
          name="password"
          type={visible ? "text" : "password"}
          autoComplete="new-password"
          required
          minLength={8}
          maxLength={128}
          aria-describedby="password-help"
          disabled={!ready || pending}
        />
        <button
          type="button"
          disabled={!ready || pending}
          onClick={() => setVisible(!visible)}
          aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
        >
          {visible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
      <p id="password-help" className="password-help">
        Al menos 8 caracteres. Se permiten espacios y símbolos.
      </p>
      <label htmlFor="register-confirm">Confirmar contraseña</label>
      <input
        id="register-confirm"
        name="confirmPassword"
        type={visible ? "text" : "password"}
        autoComplete="new-password"
        required
        maxLength={128}
        disabled={!ready || pending}
      />
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <Button type="submit" disabled={!ready || pending}>
        <UserPlus size={16} />
        {pending ? "Creando cuenta…" : "Crear cuenta"}
      </Button>
    </form>
  );
}
