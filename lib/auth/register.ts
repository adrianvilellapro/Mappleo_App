import "server-only";
import { db, assertRuntimePrivileges } from "@/lib/db";
import { registrationSchema } from "./validation";
import { consumeAttempt } from "./throttle";
import { hashPassword } from "./password";
import { headers } from "next/headers";
import {
  trustedRequestSource,
  applicationOrigin,
} from "@/lib/security/request";
import { withAuthCapacity } from "@/lib/security/controls";
import {
  defaultTechnologies,
  technologyKey,
} from "@/features/tracker/technologies";
import { registrationCodeAccepted } from "./registration-access";
import {
  registrationBlocked,
  recordRegistrationFailure,
  registrationBlockedMessage,
} from "./registration-throttle";
export async function registerAccount(
  input: unknown,
  source?: string,
): Promise<{
  ok: boolean;
  error?: string;
  status?: number;
}> {
  const identity =
    source ?? trustedRequestSource(Object.fromEntries(await headers()));
  if (await registrationBlocked(identity))
    return { ok: false, error: registrationBlockedMessage, status: 429 };
  const failed = async (error: string, status?: number) =>
    (await recordRegistrationFailure(identity))
      ? { ok: false, error: registrationBlockedMessage, status: 429 }
      : { ok: false, error, ...(status ? { status } : {}) };
  if (
    !registrationCodeAccepted(
      typeof input === "object" && input !== null && "registrationCode" in input
        ? input.registrationCode
        : undefined,
    )
  )
    return failed("El código de registro no es válido.", 403);
  const parsed = registrationSchema.safeParse(input);
  if (!parsed.success) return failed(parsed.error.issues[0].message);
  const { name, email, password } = parsed.data;
  await assertRuntimePrivileges();
  if (
    !new URL(applicationOrigin()).hostname.match(
      /^(localhost|127\.0\.0\.1|\[::1\])$/,
    ) &&
    process.env.ALLOW_UNVERIFIED_REGISTRATION !== "true"
  )
    return {
      ok: false,
      error: "El registro público no está disponible todavía.",
    };
  if (!(await consumeAttempt("register-source", identity, 20, 3600000)))
    return {
      ok: false,
      error:
        "Demasiados intentos. Espera unos minutos antes de volver a probar.",
    };
  return withAuthCapacity(async () => {
    const passwordHash = await hashPassword(password);
    try {
      await db.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: { name, email, passwordHash },
        });
        await tx.technologyTag.createMany({
          data: defaultTechnologies.map((technology) => ({
            userId: user.id,
            name: technology,
            key: technologyKey(technology),
          })),
        });
        await tx.boardColumn.createMany({
          data: [
            { systemKey: "todo", name: "Por hacer", position: 0 },
            { systemKey: "doing", name: "En curso", position: 1 },
            {
              systemKey: "done",
              name: "Completadas",
              position: 2,
              isDone: true,
            },
          ].map((column) => ({ ...column, userId: user.id })),
          skipDuplicates: true,
        });
        await tx.securityEvent.create({
          data: { type: "registration", userId: user.id },
        });
      });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes("Mappleo_account_capacity")
      )
        return failed(
          "Se ha alcanzado el límite de cuentas. El registro no está disponible en este momento.",
        );
      if (
        error instanceof Error &&
        error.message.includes("Mappleo_reserved_admin_identity")
      )
        return failed("No se puede registrar una cuenta con este email.");
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "P2002"
      )
        return failed(
          "Este email ya tiene una cuenta. Inicia sesión con su contraseña actual.",
        );
      throw error;
    }
    return { ok: true };
  });
}
