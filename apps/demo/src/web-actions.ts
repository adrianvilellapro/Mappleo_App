import { demoRuntime, type DemoRuntime } from "./runtime";
import { isEntityKind } from "../../../features/tracker/config";
import { recordRows, taskLinkOptions } from "./web-data";
import { rowTitle } from "../../../features/tracker/types";

export function webActions(runtime: DemoRuntime) {
  const execute = (command: unknown) =>
    Promise.resolve(runtime.execute(command));
  return {
    async saveAction(kind: string, id: string | undefined, input: unknown) {
      if (!isEntityKind(kind))
        return { ok: false, error: "Tipo de registro incorrecto." };
      return execute({ action: "save", kind, id, input });
    },
    async deleteAction(kind: string, id: string) {
      return execute({ action: "delete", kind, id });
    },
    async archiveAction(kind: string, id: string, archived: boolean) {
      return execute({ action: "archive", kind, id, archived });
    },
    async activityAction(input: unknown) {
      return execute({ ...(input as object), action: "activity" });
    },
    async deleteActivityAction(id: string) {
      const app = runtime
        .snapshot()
        .data.applications.find((a) => a.events.some((e) => e.id === id));
      return app
        ? execute({ action: "deleteActivity", id, applicationId: app.id })
        : { ok: false, error: "El registro ya no existe." };
    },
    async completeNextStepAction(input: unknown) {
      const value = input as { id: string; kind: string };
      return execute({ action: "complete", kind: value.kind, id: value.id });
    },
    async taskAction(
      operation: string,
      id: string | undefined,
      input: unknown,
    ) {
      const value = (input ?? {}) as Record<string, unknown>;
      const data = runtime.snapshot().data;
      switch (operation) {
        case "save": {
          const options = taskLinkOptions(data);
          const links = (
            (value.links as { kind: string; recordId: string }[]) ?? []
          ).map((l) => ({
            ...l,
            label:
              options.find((o) => o.kind === l.kind && o.id === l.recordId)
                ?.label ??
              rowTitle(
                recordRows(data, l.kind).find((r) => r.id === l.recordId) ?? {
                  id: l.recordId,
                },
              ),
          }));
          return execute({
            action: "save",
            kind: "tasks",
            id,
            input: { ...value, links },
          });
        }
        case "column":
          return execute({
            action: "save",
            kind: "boardColumns",
            id,
            input: value,
          });
        case "delete":
          return execute({ action: "delete", kind: "tasks", id });
        case "delete-column":
          if (value.confirmed !== true)
            return { ok: false, error: "Confirma la eliminación." };
          return execute({
            action: "delete",
            kind: "boardColumns",
            id,
            moveTo: value.mode === "move" ? value.targetColumnId : undefined,
            deleteTasks: value.mode === "delete",
          });
        case "complete":
          return execute({
            action: "complete",
            kind: "tasks",
            id: value.id ?? id,
          });
        case "move": {
          const ordered = (data.tasks ?? [])
            .filter(
              (t) => t.columnId === value.columnId && t.id !== value.taskId,
            )
            .sort(
              (a, b) => a.position - b.position || a.id.localeCompare(b.id),
            );
          const before = ordered.findIndex((t) => t.id === value.beforeId);
          return execute({
            action: "moveTask",
            id: value.taskId,
            columnId: value.columnId,
            position: before < 0 ? ordered.length : before,
          });
        }
        default:
          return { ok: false, error: "Operación no válida." };
      }
    },
  };
}
export const saveAction = (
  ...args: Parameters<ReturnType<typeof webActions>["saveAction"]>
) => webActions(demoRuntime()).saveAction(...args);
export const deleteAction = (
  ...args: Parameters<ReturnType<typeof webActions>["deleteAction"]>
) => webActions(demoRuntime()).deleteAction(...args);
export const archiveAction = (
  ...args: Parameters<ReturnType<typeof webActions>["archiveAction"]>
) => webActions(demoRuntime()).archiveAction(...args);
export const activityAction = (input: unknown) =>
  webActions(demoRuntime()).activityAction(input);
export const deleteActivityAction = (id: string) =>
  webActions(demoRuntime()).deleteActivityAction(id);
export const completeNextStepAction = (input: unknown) =>
  webActions(demoRuntime()).completeNextStepAction(input);
export const taskAction = (
  operation: string,
  id: string | undefined,
  input: unknown,
) => webActions(demoRuntime()).taskAction(operation, id, input);
