"use client";
import { useEffect, useRef, useState } from "react";
import { Sheet } from "@/components/ui/sheet";
import { PasswordField } from "@/components/ui/password-field";
import { confirmIdentityAction } from "@/features/account/actions";

export function useIdentityConfirmation() {
  const [open, setOpen] = useState(false),
    [pending, setPending] = useState(false),
    [error, setError] = useState("");
  const resolve = useRef<((confirmed: boolean) => void) | null>(null);
  useEffect(
    () => () => {
      resolve.current?.(false);
    },
    [],
  );
  const close = (confirmed: boolean) => {
    setOpen(false);
    resolve.current?.(confirmed);
    resolve.current = null;
  };
  const secureFetch = async (input: string, init?: RequestInit) => {
    const response = await fetch(input, init);
    if (response.status !== 428) return response;
    setError("");
    setOpen(true);
    const confirmed = await new Promise<boolean>((done) => {
      resolve.current = done;
    });
    return confirmed ? fetch(input, init) : response;
  };
  const dialog = (
    <Sheet
      open={open}
      onOpenChange={(value) => {
        if (!value && !pending) close(false);
      }}
      title="Confirmar identidad"
      description="Tu sesión sigue abierta. Para importar o descargar datos personales, confirma de nuevo tu contraseña."
    >
      <form
        className="editor-body"
        method="post"
        onSubmit={async (event) => {
          event.preventDefault();
          const password = String(
            new FormData(event.currentTarget).get("password") ?? "",
          );
          setPending(true);
          setError("");
          try {
            const result = await confirmIdentityAction(password);
            if (result.ok) close(true);
            else
              setError(
                result.error ?? "No se ha podido confirmar la identidad.",
              );
          } catch {
            setError("No se ha podido conectar. Vuelve a intentarlo.");
          } finally {
            setPending(false);
          }
        }}
      >
        <PasswordField
          label="Contraseña actual"
          name="password"
          autoComplete="current-password"
        />
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button
          className="button button-primary"
          disabled={pending}
          type="submit"
        >
          {pending ? "Comprobando…" : "Confirmar y continuar"}
        </button>
      </form>
    </Sheet>
  );
  return { secureFetch, dialog };
}
