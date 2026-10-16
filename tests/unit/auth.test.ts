import { describe, expect, it } from "vitest";
import { registrationSchema } from "../../lib/auth/validation";
import { hash } from "bcryptjs";
import { hashPassword, verifyPassword } from "../../lib/auth/password";
const valid = {
  name: "Alex",
  email: "Alex@example.test",
  password: "Mi frase larga y privada 42!",
  confirmPassword: "Mi frase larga y privada 42!",
};
describe("Registro", () => {
  it("normaliza el email", () => {
    expect(registrationSchema.parse(valid).email).toBe("alex@example.test");
  });
  it("rechaza contraseñas cortas, repetitivas o con el email", () => {
    for (const password of ["breve", "aaaaaaaa", "alex-una-frase-larga"])
      expect(
        registrationSchema.safeParse({
          ...valid,
          password,
          confirmPassword: password,
        }).success,
      ).toBe(false);
  });
  it("rechaza confirmaciones distintas", () => {
    expect(
      registrationSchema.safeParse({
        ...valid,
        confirmPassword: "Otra contraseña larga",
      }).success,
    ).toBe(false);
  });
  it("acepta 8 caracteres y Unicode largo sin truncar", async () => {
    expect(
      registrationSchema.safeParse({
        ...valid,
        password: "Cl4ve!27",
        confirmPassword: "Cl4ve!27",
      }).success,
    ).toBe(true);
    const password = "árbol".repeat(20);
    expect(
      registrationSchema.safeParse({
        ...valid,
        password,
        confirmPassword: password,
      }).success,
    ).toBe(true);
    const stored = await hashPassword(password);
    expect(stored).toMatch(/^\$argon2id\$/);
    expect(await verifyPassword(password, stored)).toBe(true);
    expect(await verifyPassword(password + "!", stored)).toBe(false);
  });
  it("mantiene el acceso a hashes anteriores", async () => {
    const stored = await hash(valid.password, 12);
    expect(await verifyPassword(valid.password, stored)).toBe(true);
  });
});
