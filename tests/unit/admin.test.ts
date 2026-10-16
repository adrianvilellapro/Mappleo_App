import { describe, expect, it } from "vitest";
import { Secret, TOTP } from "otpauth";
import {
  acceptedTotpCounter,
  adminConfiguration,
  maskedEmail,
} from "../../features/admin/config";
const config = () => ({
  ADMIN_EMAIL: "admin@example.test",
  ADMIN_PASSWORD: "a".repeat(64),
  ADMIN_ACTION_PASSWORD: "b".repeat(64),
  ADMIN_TOTP_SECRET: new Secret({ size: 20 }).base32,
  AUTH_SECRET: "c".repeat(96),
  ADMIN_ALLOWED_IPS: "127.0.0.1,::1",
});
describe("Administración segura", () => {
  it("configuración obligatoria, contraseñas independientes e IPs concretas", () => {
    const env = config();
    expect(adminConfiguration(env).email).toBe("admin@example.test");
    for (const overrides of [
      { ADMIN_PASSWORD: "short" },
      { ADMIN_ACTION_PASSWORD: env.ADMIN_PASSWORD },
      { ADMIN_TOTP_SECRET: "invalid" },
      { ADMIN_ALLOWED_IPS: "*" },
      { AUTH_SECRET: "short" },
    ])
      expect(() => adminConfiguration({ ...env, ...overrides })).toThrow();
    expect(() => adminConfiguration({})).toThrow();
    expect(
      adminConfiguration({ ...env, ADMIN_ACTION_PASSWORD: "d".repeat(64) })
        .fingerprint,
    ).not.toBe(adminConfiguration(env).fingerprint);
  });
  it("respeta vectores RFC6238 SHA1 y valida solo una pequeña ventana temporal", () => {
    const secret = Secret.fromUTF8("12345678901234567890");
    const totp = new TOTP({ secret, algorithm: "SHA1", digits: 8, period: 30 });
    for (const [seconds, token] of [
      [59, "94287082"],
      [1111111109, "07081804"],
      [1111111111, "14050471"],
      [1234567890, "89005924"],
      [2000000000, "69279037"],
      [20000000000, "65353130"],
    ] as const)
      expect(totp.generate({ timestamp: seconds * 1000 })).toBe(token);
    const six = new TOTP({ secret, algorithm: "SHA1", digits: 6, period: 30 });
    const now = 1234567890000;
    expect(
      acceptedTotpCounter(secret.base32, six.generate({ timestamp: now }), now),
    ).toBe(Math.floor(now / 30000));
    expect(
      acceptedTotpCounter(
        secret.base32,
        six.generate({ timestamp: now - 120000 }),
        now,
      ),
    ).toBeNull();
    expect(acceptedTotpCounter(secret.base32, "not-code", now)).toBeNull();
  });
  it("no muestra el email completo", () => {
    expect(maskedEmail("personal@example.test")).toBe("p***@e***");
  });
});
