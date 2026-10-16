import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/auth/password";
import { consumeAttempt } from "@/lib/auth/throttle";
import { SecurityError } from "@/lib/security/controls";

export async function confirmIdentity(
  user: { id: string; sessionId: string; sessionVersion: number },
  input: unknown,
) {
  const password = z.string().min(1).max(128).parse(input);
  if (!(await consumeAttempt("identity-confirm", user.sessionId, 5, 900000)))
    throw new SecurityError(
      "Has realizado varios intentos. Espera 15 minutos.",
    );
  const account = await db.user.findFirst({
    where: { id: user.id, sessionVersion: user.sessionVersion },
    select: { passwordHash: true },
  });
  if (
    !account?.passwordHash ||
    !(await verifyPassword(password, account.passwordHash))
  )
    throw new SecurityError("La contraseña actual es incorrecta.", 403);
  const id = createHash("sha256").update(user.sessionId).digest("hex");
  await db.$transaction(async (tx) => {
    const count = await tx.authSession.updateMany({
      where: {
        id,
        userId: user.id,
        sessionVersion: user.sessionVersion,
        expiresAt: { gt: new Date() },
        user: {
          passwordHash: account.passwordHash,
          sessionVersion: user.sessionVersion,
        },
      },
      data: { verifiedAt: new Date() },
    });
    if (!count.count) throw new SecurityError("Inicia sesión de nuevo.", 401);
    await tx.securityEvent.create({
      data: { type: "identity_confirmed", userId: user.id },
    });
  });
}
