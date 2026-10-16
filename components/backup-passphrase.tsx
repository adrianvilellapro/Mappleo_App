"use client";
import { useEffect, useRef, useState } from "react";
import { Sheet } from "@/components/ui/sheet";
import { PasswordField } from "@/components/ui/password-field";
import { passwordSchema } from "@/lib/auth/validation";

export function useBackupPassphrase() {
  const [mode, setMode] = useState<"encrypt" | "decrypt" | null>(null),
    [error, setError] = useState("");
  const resolve = useRef<((password: string | null) => void) | null>(null);
  useEffect(
    () => () => {
      resolve.current?.(null);
    },
    [],
  );
  const close = (password: string | null) => {
    setMode(null);
    resolve.current?.(password);
    resolve.current = null;
  };
  const askPassphrase = (value: "encrypt" | "decrypt") => {
    setMode(value);
    setError("");
    return new Promise<string | null>((done) => {
      resolve.current = done;
    });
  };
  const passwordDialog = (
    <Sheet
      open={!!mode}
      onOpenChange={(open) => {
        if (!open) close(null);
      }}
      title={mode === "encrypt" ? "Proteger el backup" : "Abrir backup cifrado"}
      description="Esta contraseña solo se utiliza en tu navegador. Guarda una copia: si la pierdes, no podremos recuperar este archivo."
    >
      <form
        key={mode}
        className="editor-body"
        method="post"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget),
            password = String(data.get("password") ?? "");
          if (password.length < 8 || password.length > 128) {
            setError("Usa entre 8 y 128 caracteres.");
            return;
          }
          if (mode === "encrypt") {
            const parsed = passwordSchema.safeParse(password);
            if (!parsed.success) {
              setError(parsed.error.issues[0].message);
              return;
            }
          }
          if (mode === "encrypt" && password !== data.get("confirmPassword")) {
            setError("Las contraseñas no coinciden.");
            return;
          }
          event.currentTarget.reset();
          close(password);
        }}
      >
        <PasswordField
          name="password"
          label="Contraseña del backup"
          autoComplete={
            mode === "encrypt" ? "new-password" : "current-password"
          }
          minLength={8}
        />
        {mode === "encrypt" && (
          <PasswordField
            name="confirmPassword"
            label="Confirmar contraseña del backup"
            autoComplete="new-password"
            minLength={8}
          />
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="button button-primary">
          Continuar
        </button>
      </form>
    </Sheet>
  );
  return { askPassphrase, passwordDialog };
}
