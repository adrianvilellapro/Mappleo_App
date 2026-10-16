"use server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { revalidateWorkspace } from "@/lib/workspace-revalidation";
import { mutationBudget, SecurityError } from "@/lib/security/controls";
import {
  saveTask,
  moveTask,
  deleteTask,
  saveColumn,
  deleteColumn,
  TaskError,
  completeTask,
} from "./service";
export async function taskAction(
  operation: string,
  id: string | undefined,
  input: unknown,
) {
  const user = await requireUser();
  try {
    await mutationBudget(user.id);
    switch (operation) {
      case "save":
        if (id) z.object({ expectedUpdatedAt: z.iso.datetime() }).parse(input);
        await saveTask(user.id, id, input);
        break;
      case "move":
        await moveTask(user.id, input);
        break;
      case "complete":
        await completeTask(user.id, input);
        break;
      case "delete":
        await deleteTask(user.id, z.string().min(1).parse(id));
        break;
      case "column":
        await saveColumn(user.id, id, input);
        break;
      case "delete-column":
        await deleteColumn(user.id, z.string().min(1).parse(id), input);
        break;
      default:
        throw new TaskError("Operación no válida.");
    }
    revalidateWorkspace("tasks");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error:
        e instanceof TaskError || e instanceof SecurityError
          ? e.message
          : e instanceof z.ZodError
            ? e.issues[0].message
            : "No se ha podido guardar. Actualiza la página y vuelve a intentarlo.",
    };
  }
}
