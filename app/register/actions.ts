"use server";
import { registerAccount } from "@/lib/auth/register";
export async function registerAction(
  input: unknown,
): Promise<{ ok: boolean; error?: string }> {
  try {
    return await registerAccount(input);
  } catch {
    return {
      ok: false,
      error:
        "No se ha podido completar el registro. Vuelve a intentarlo más tarde.",
    };
  }
}
