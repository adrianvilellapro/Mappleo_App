"use client";

import { useState, useTransition } from "react";
import { notifyWorkspaceChange } from "@/lib/workspace-events";
import { Trash2 } from "lucide-react";
import { deleteActivityAction } from "../actions";

export function DeleteActivityButton({
  id,
  title,
}: {
  id: string;
  title: string;
}) {
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  return (
    <div className="history-delete">
      {!confirm ? (
        <button
          className="icon-button history-delete-trigger"
          type="button"
          aria-label={"Eliminar entrada: " + title}
          title="Eliminar entrada"
          onClick={() => setConfirm(true)}
        >
          <Trash2 size={14} />
        </button>
      ) : (
        <div className="history-delete-confirm">
          <p>¿Borrar esta entrada? No cambiará el estado de la candidatura.</p>
          <button
            className="button button-danger"
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                setError("");
                const result = await deleteActivityAction(id);
                if (result.ok) notifyWorkspaceChange();
                else setError(result.error ?? "No se ha podido borrar.");
              })
            }
          >
            {pending ? "Borrando…" : "Sí, borrar entrada"}
          </button>
          <button
            className="button button-outline"
            type="button"
            disabled={pending}
            onClick={() => setConfirm(false)}
          >
            Conservar
          </button>
          {error && <p role="alert">{error}</p>}
        </div>
      )}
    </div>
  );
}
