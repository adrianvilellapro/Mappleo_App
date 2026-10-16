"use server";
import { z } from "zod";
import { revalidateWorkspace } from "@/lib/workspace-revalidation";
import { requireUser } from "@/lib/auth";
import { isEntityKind } from "./config";
import { TaskError } from "@/features/tasks/service";
import { mutationBudget, SecurityError } from "@/lib/security/controls";
import {
  saveRecord,
  removeRecord,
  archiveRecord,
  addActivity,
  removeActivity,
  completeNextStep,
  TrackerError,
} from "./services";
export type ActionResult = { ok: boolean; error?: string; id?: string };
function failure(error: unknown): ActionResult {
  if (error instanceof z.ZodError)
    return {
      ok: false,
      error: error.issues
        .map((i) => i.message)
        .slice(0, 3)
        .join(" "),
    };
  if (
    error instanceof TrackerError ||
    error instanceof TaskError ||
    error instanceof SecurityError
  )
    return { ok: false, error: error.message };
  const code =
    error && typeof error === "object" && "code" in error ? error.code : "";
  const messages: Record<string, string> = {
    P2002: "Ya existe un registro con esos datos.",
    P2003:
      "Hay ofertas o contactos asociados. Elimínalos o cambia su empresa antes de borrar este registro.",
    P2025: "El registro ya no está disponible.",
    P2034: "Otro cambio se guardó a la vez. Vuelve a intentarlo.",
  };
  return {
    ok: false,
    error:
      messages[String(code)] ??
      "No se ha podido completar el cambio. Vuelve a intentarlo en unos instantes.",
  };
}
export async function saveAction(
  kind: string,
  id: string | undefined,
  input: unknown,
): Promise<ActionResult> {
  const user = await requireUser();
  if (!isEntityKind(kind))
    return { ok: false, error: "Tipo de registro incorrecto." };
  try {
    await mutationBudget(user.id);
    if (id) z.object({ expectedUpdatedAt: z.iso.datetime() }).parse(input);
    const record = await saveRecord(user.id, kind, id, input);
    revalidateWorkspace(kind, record.id);
    return { ok: true, id: record.id };
  } catch (e) {
    return failure(e);
  }
}
export async function deleteAction(
  kind: string,
  id: string,
): Promise<ActionResult> {
  const user = await requireUser();
  if (!isEntityKind(kind) || !id)
    return { ok: false, error: "Registro incorrecto." };
  try {
    await mutationBudget(user.id);
    await removeRecord(user.id, kind, id);
    revalidateWorkspace(kind, id);
    return { ok: true };
  } catch (e) {
    return failure(e);
  }
}
export async function archiveAction(
  kind: string,
  id: string,
  archived: boolean,
): Promise<ActionResult> {
  const user = await requireUser();
  if (!isEntityKind(kind) || typeof archived !== "boolean")
    return { ok: false, error: "Registro incorrecto." };
  try {
    await mutationBudget(user.id);
    await archiveRecord(user.id, kind, id, archived);
    revalidateWorkspace(kind, id);
    return { ok: true };
  } catch (e) {
    return failure(e);
  }
}
export async function activityAction(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  try {
    await mutationBudget(user.id);
    await addActivity(user.id, input);
    revalidateWorkspace("applications");
    return { ok: true };
  } catch (e) {
    return failure(e);
  }
}
export async function deleteActivityAction(id: string): Promise<ActionResult> {
  const user = await requireUser();
  if (typeof id !== "string" || !id || id.length > 100)
    return { ok: false, error: "Entrada incorrecta." };
  try {
    await mutationBudget(user.id);
    await removeActivity(user.id, id);
    revalidateWorkspace("applications");
    return { ok: true };
  } catch (e) {
    return failure(e);
  }
}

export async function completeNextStepAction(
  input: unknown,
): Promise<ActionResult> {
  const user = await requireUser();
  try {
    await mutationBudget(user.id);
    const step = await completeNextStep(user.id, input);
    revalidateWorkspace(step.kind, step.id);
    return { ok: true };
  } catch (cause) {
    return failure(cause);
  }
}
