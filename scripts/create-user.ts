import "dotenv/config";
import { input, password, confirm } from "@inquirer/prompts";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { registrationSchema } from "../lib/auth/validation";
import { hashPassword } from "../lib/auth/password";
import { encryptClient } from "../lib/db/encrypted-client";
const db = encryptClient(
  new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  }),
);
try {
  const data = registrationSchema.parse({
    email: await input({ message: "Tu email:" }),
    name: await input({ message: "Tu nombre:" }),
    password: await password({
      message: "Contraseña (mínimo 8 caracteres):",
      mask: "*",
    }),
    confirmPassword: await password({
      message: "Repite la contraseña:",
      mask: "*",
    }),
  });
  const existing = await db.user.findUnique({ where: { email: data.email } });
  if (
    !existing ||
    (await confirm({
      message:
        "La cuenta existe. ¿Cambiar su contraseña y cerrar sus sesiones anteriores?",
      default: false,
    }))
  ) {
    const passwordHash = await hashPassword(data.password);
    await db.$transaction(async (tx) => {
      const account = await tx.user.upsert({
        where: { email: data.email },
        create: { email: data.email, name: data.name, passwordHash },
        update: {
          name: data.name,
          passwordHash,
          failedAttempts: 0,
          lockedUntil: null,
          sessionVersion: { increment: 1 },
        },
      });
      await tx.authSession.deleteMany({ where: { userId: account.id } });
      await tx.securityEvent.create({
        data: {
          userId: account.id,
          type: existing
            ? "password_reset_local_admin"
            : "account_created_local_admin",
        },
      });
    });
    console.log("Cuenta preparada. Ya puedes iniciar sesión.");
  }
} finally {
  await db.$disconnect();
}
