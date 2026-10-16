import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { passwordSchema } from "@/lib/auth/validation";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { consumeAttempt } from "@/lib/auth/throttle";
export const accountSchema = z
  .discriminatedUnion("kind", [
    z.object({
      kind: z.literal("name"),
      name: z.string().trim().min(2).max(100),
      currentPassword: z.string().min(1).max(128),
    }),
    z.object({
      kind: z.literal("password"),
      password: passwordSchema,
      confirmPassword: z.string().max(128),
      currentPassword: z.string().min(1).max(128),
    }),
  ])
  .superRefine((v, ctx) => {
    if (v.kind === "password" && v.password !== v.confirmPassword)
      ctx.addIssue({
        code: "custom",
        message: "Las contraseñas no coinciden.",
      });
    if (v.kind === "password" && v.password === v.currentPassword)
      ctx.addIssue({
        code: "custom",
        message: "La nueva contraseña debe ser diferente de la actual.",
      });
  });
export class AccountError extends Error {}
export async function updateAccount(
  userId: string,
  sessionVersion: number,
  input: unknown,
  sessionId?: string,
) {
  const data = accountSchema.parse(input);
  if (!(await consumeAttempt("account-change", sessionId ?? userId, 5, 900000)))
    throw new AccountError("Demasiados intentos. Espera 15 minutos.");
  const user = await db.user.findFirst({
    where: { id: userId, sessionVersion },
  });
  if (!user?.passwordHash)
    throw new AccountError(
      "No se puede confirmar la identidad. Inicia sesión de nuevo o espera 15 minutos.",
    );
  if (!(await verifyPassword(data.currentPassword, user.passwordHash))) {
    await db.securityEvent.create({
      data: { userId, type: "account_confirmation_failed" },
    });
    throw new AccountError("La contraseña actual es incorrecta.");
  }
  if (
    data.kind === "password" &&
    user.email.split("@")[0].length >= 4 &&
    data.password.toLowerCase().includes(user.email.split("@")[0].toLowerCase())
  )
    throw new AccountError("La contraseña no debe contener tu email.");
  const update =
    data.kind === "password"
      ? {
          passwordHash: await hashPassword(data.password),
          sessionVersion: { increment: 1 },
        }
      : { name: data.name };
  const changed = await db.$transaction(async (tx) => {
    const result = await tx.user.updateMany({
      where: {
        id: userId,
        sessionVersion,
        passwordHash: user.passwordHash,
      },
      data: { ...update, failedAttempts: 0, lockedUntil: null },
    });
    if (result.count) {
      if (data.kind === "password")
        await tx.authSession.deleteMany({ where: { userId } });
      await tx.securityEvent.create({
        data: {
          userId,
          type: data.kind === "password" ? "password_changed" : "name_changed",
        },
      });
    }
    return result;
  });
  if (!changed.count)
    throw new AccountError("La cuenta ha cambiado. Inicia sesión de nuevo.");
  return { logout: data.kind === "password" };
}
