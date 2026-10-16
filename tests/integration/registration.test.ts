import { afterAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { verifyPassword } from "../../lib/auth/password";
import { db } from "../../lib/db";
import { registerAccount } from "../../lib/auth/register";
import { consumeAttempt } from "../../lib/auth/throttle";
const email = "registration-" + Date.now() + "@example.test";
const data = {
  registrationCode: process.env.REGISTRATION_CODE,
  name: "Registro de prueba",
  email,
  password: "Una frase secreta de prueba 42!",
  confirmPassword: "Una frase secreta de prueba 42!",
};
afterAll(async () => {
  await db.user.deleteMany({ where: { email } });
  await db.$disconnect();
});
describe("Registro persistente", () => {
  it("guarda un hash y no sobrescribe una cuenta duplicada", async () => {
    expect(await registerAccount(data, "test-" + email)).toEqual({ ok: true });
    const user = await db.user.findUniqueOrThrow({ where: { email } });
    expect(user.passwordHash).not.toBe(data.password);
    expect(await verifyPassword(data.password, user.passwordHash!)).toBe(true);
    expect(
      await db.technologyTag.count({ where: { userId: user.id } }),
    ).toBeGreaterThan(40);
    expect(
      await db.technologyTag.findUnique({
        where: { userId_key: { userId: user.id, key: "angular" } },
      }),
    ).not.toBeNull();
    expect(
      await registerAccount(
        {
          ...data,
          password: "Otra frase diferente de prueba!",
          confirmPassword: "Otra frase diferente de prueba!",
        },
        "test-" + email,
      ),
    ).toEqual({
      ok: false,
      error:
        "Este email ya tiene una cuenta. Inicia sesión con su contraseña actual.",
    });
    expect(
      (await db.user.findUniqueOrThrow({ where: { email } })).passwordHash,
    ).toBe(user.passwordHash);
  });
  it("rechaza datos inválidos en servidor", async () => {
    expect(
      (await registerAccount({ ...data, password: "corta" }, "test-" + email))
        .ok,
    ).toBe(false);
  });
  it("limita intentos concurrentes de forma persistente", async () => {
    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        consumeAttempt("test-" + email, email, 3, 900000),
      ),
    );
    expect(results.filter(Boolean)).toHaveLength(3);
  });
});
