"use server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { updateAccount, AccountError } from "./service";
import { confirmIdentity } from "./identity";
import { SecurityError, withAuthCapacity } from "@/lib/security/controls";
export async function confirmIdentityAction(input: unknown) {
  const user = await requireUser();
  try {
    await withAuthCapacity(() => confirmIdentity(user, input));
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof SecurityError
          ? error.message
          : "No se ha podido confirmar tu identidad. Vuelve a iniciar sesión.",
    };
  }
}
export async function accountAction(input: unknown) {
  const user = await requireUser();
  try {
    const result = await withAuthCapacity(() =>
      updateAccount(user.id, user.sessionVersion, input, user.sessionId),
    );
    revalidatePath("/", "layout");
    return { ok: true, ...result };
  } catch (e) {
    return {
      ok: false,
      logout: false,
      error:
        e instanceof AccountError
          ? e.message
          : e instanceof z.ZodError
            ? e.issues[0].message
            : "No se ha podido actualizar la cuenta. Vuelve a intentarlo.",
    };
  }
}
