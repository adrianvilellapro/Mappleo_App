import { afterEach, describe, expect, it, vi } from "vitest";
import {
  registrationCodeAccepted,
  registrationSourceKey,
  accountLimitCeiling,
} from "../../lib/auth/registration-access";
afterEach(() => vi.unstubAllEnvs());
describe("Código de registro privado y techo de cuentas", () => {
  it("solo acepta el código configurado, nunca un valor ausente o demasiado corto", () => {
    const code = "Una-invitacion-privada-aleatoria-42";
    expect(registrationCodeAccepted(code, code)).toBe(true);
    expect(registrationCodeAccepted(" " + code + " ", code)).toBe(true);
    for (const input of ["wrong", undefined, {}, "x".repeat(129)])
      expect(registrationCodeAccepted(input, code)).toBe(false);
    vi.stubEnv("REGISTRATION_CODE", "");
    expect(registrationCodeAccepted("anything")).toBe(false);
    expect(registrationCodeAccepted("short", "short")).toBe(false);
  });
  it("no almacena la IP en claro y distingue fuentes", () => {
    vi.stubEnv("AUTH_SECRET", "test-only-secret".repeat(8));
    const first = registrationSourceKey("203.0.113.1");
    expect(first).not.toContain("203.0.113.1");
    expect(first).toBe(registrationSourceKey("203.0.113.1"));
    expect(first).not.toBe(registrationSourceKey("203.0.113.2"));
  });
  it("limita el administrador a quince por defecto y rechaza configuraciones inválidas", () => {
    vi.stubEnv("ACCOUNT_LIMIT_CEILING", undefined);
    expect(accountLimitCeiling()).toBe(15);
    for (const value of ["0", "-1", "NaN", "100001", "1.5"]) {
      vi.stubEnv("ACCOUNT_LIMIT_CEILING", value);
      expect(() => accountLimitCeiling()).toThrow();
    }
  });
});
