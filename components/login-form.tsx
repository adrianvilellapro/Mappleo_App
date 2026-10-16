"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Button } from "./ui/button";
import { useHydrated } from "@/lib/use-hydrated";
export function LoginForm({
  callbackUrl = "/dashboard",
}: { callbackUrl?: string } = {}) {
  const router = useRouter();
  const ready = useHydrated();
  const [error, setError] = useState(""),
    [pending, setPending] = useState(false);
  return (
    <>
      <form
        className="login-form"
        method="post"
        aria-busy={pending}
        onSubmit={async (e) => {
          e.preventDefault();
          if (!ready || pending) return;
          const data = new FormData(e.currentTarget);
          setPending(true);
          setError("");
          try {
            const result = await signIn("credentials", {
              email: data.get("email"),
              password: data.get("password"),
              redirect: false,
            });
            if (result?.ok) {
              router.push(
                callbackUrl.startsWith("/desktop/connect?")
                  ? callbackUrl
                  : "/dashboard",
              );
              router.refresh();
            } else {
              setError(
                result?.error === "TooManyAttempts"
                  ? "has realizado varios intentos, espera 15 minutos."
                  : "Email o contraseña incorrectos.",
              );
              setPending(false);
            }
          } catch {
            setError("No se ha podido conectar. Vuelve a intentarlo.");
            setPending(false);
          }
        }}
      >
        <label>
          Email
          <input
            name="email"
            type="email"
            autoComplete="email"
            placeholder="tu@email.com"
            required
            disabled={!ready || pending}
          />
        </label>
        <label>
          Contraseña
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
            disabled={!ready || pending}
          />
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <Button disabled={!ready || pending} type="submit">
          {pending ? "Entrando…" : "Entrar en mi espacio"}
          <ArrowRight size={16} />
        </Button>
      </form>
    </>
  );
}
