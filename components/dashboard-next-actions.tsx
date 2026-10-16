"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { notifyWorkspaceChange } from "@/lib/workspace-events";
import Link from "@/components/ui/app-link";
import {
  ArrowUpRight,
  Check,
  CheckCheck,
  ChevronDown,
  LoaderCircle,
} from "lucide-react";
import { completeNextStepAction } from "@/features/tracker/actions";

type Action = {
  id: string;
  kind: "applications" | "contacts" | "tasks";
  title: string;
  context: string;
  href: string;
  dueLabel: string;
  dueAt: string | null;
  overdue: boolean;
};
const keyOf = (a: Action) => [a.href, a.title, a.dueAt].join("|");
export function NextActions({ actions }: { actions: Action[] }) {
  const [expanded, setExpanded] = useState(false);
  const [pending, startTransition] = useTransition();
  const [retained, setRetained] = useState<
    { action: Action; done: boolean; index: number }[]
  >([]);
  const [error, setError] = useState("");
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const router = useRouter();
  useEffect(() => {
    const activeTimers = timers.current;
    return () => activeTimers.forEach(clearTimeout);
  }, []);
  const merged = [...actions];
  for (const r of retained.filter(
    (r) => !actions.some((a) => keyOf(a) === keyOf(r.action)),
  ))
    merged.splice(Math.min(r.index, merged.length), 0, r.action);
  const visible = expanded ? merged : merged.slice(0, 8);
  return (
    <>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <span className="sr-only" role="status">
        {retained.some((r) => r.done) ? "Paso completado." : ""}
      </span>
      {!merged.length && (
        <div className="panel-empty">
          <CheckCheck size={24} />
          <h3>Todo despejado por aquí</h3>
          <p>
            Añade una próxima acción a una candidatura o un follow-up a un
            contacto, o crea una tarea en Kanban.
          </p>
          <Link href="/applications">
            Ver candidaturas <ArrowUpRight size={14} />
          </Link>
        </div>
      )}
      <ul className="action-list">
        {visible.map((action) => {
          const key = keyOf(action);
          const retainedStep = retained.find((r) => keyOf(r.action) === key);
          const done = retainedStep?.done;
          return (
            <li
              key={key}
              className={done ? "action-completed" : ""}
              data-completed={done || undefined}
            >
              <button
                type="button"
                className="complete-step-button"
                aria-label={
                  (done ? "Completado: " : "Completar: ") + action.title
                }
                title={done ? "Completado" : "Marcar como completado"}
                disabled={pending || !!retainedStep}
                onClick={() => {
                  setRetained((prev) => [
                    ...prev,
                    { action, done: false, index: merged.indexOf(action) },
                  ]);
                  setError("");
                  startTransition(async () => {
                    try {
                      const result = await completeNextStepAction({
                        kind: action.kind,
                        id: action.id,
                        title: action.title,
                        dueAt: action.dueAt,
                      });
                      if (!result.ok)
                        throw new Error(
                          result.error || "No se ha podido completar el paso.",
                        );
                      setRetained((prev) =>
                        prev.map((r) =>
                          keyOf(r.action) === key ? { ...r, done: true } : r,
                        ),
                      );
                      notifyWorkspaceChange();
                      timers.current.push(
                        setTimeout(
                          () =>
                            setRetained((prev) =>
                              prev.filter((r) => keyOf(r.action) !== key),
                            ),
                          3000,
                        ),
                      );
                    } catch (cause) {
                      setRetained((prev) =>
                        prev.filter((r) => keyOf(r.action) !== key),
                      );
                      setError(
                        cause instanceof Error
                          ? cause.message
                          : "No se ha podido completar el paso. Vuelve a intentarlo.",
                      );
                      router.refresh();
                    }
                  });
                }}
              >
                <span className="step-circle">
                  {retainedStep && !done ? (
                    <LoaderCircle size={12} className="spin" />
                  ) : (
                    <Check
                      size={12}
                      className={done ? "step-check visible" : "step-check"}
                    />
                  )}
                </span>
              </button>
              <Link href={action.href}>
                <span className="action-text">
                  <strong>{action.title}</strong>
                  <small>{action.context}</small>
                </span>
                <span
                  className={
                    done ? "due" : action.overdue ? "due overdue" : "due"
                  }
                >
                  {done ? "Completado" : action.dueLabel}
                </span>
                <ArrowUpRight size={15} />
              </Link>
            </li>
          );
        })}
      </ul>
      {merged.length > 8 && (
        <button
          className="action-expand"
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded
            ? "Mostrar menos"
            : `Ver todas las acciones (${merged.length})`}
          <ChevronDown size={15} className={expanded ? "rotated" : ""} />
        </button>
      )}
    </>
  );
}
