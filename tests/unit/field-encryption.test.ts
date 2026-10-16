import { describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { fieldCipher, cipherPrefix } from "../../lib/db/field-encryption";

const env = () => ({
  FIELD_ENCRYPTION_KEYS: JSON.stringify({
    v1: randomBytes(32).toString("base64"),
  }),
  FIELD_ENCRYPTION_ACTIVE_KEY: "v1",
  FIELD_ENCRYPTION_INDEX_KEY: randomBytes(32).toString("base64"),
});
describe("Cifrado de campos", () => {
  it("cifra Unicode, textos vacíos y textos con prefijos sin perder información", () => {
    const cipher = fieldCipher(env());
    for (const plain of [
      "",
      "Adrián +34 600 123 456 🧑‍💻\nnota",
      cipherPrefix + "texto escrito por usuario",
    ]) {
      const first = cipher.encrypt(plain, "Contact", "name");
      const second = cipher.encrypt(plain, "Contact", "name");
      expect(first).not.toBe(second);
      expect(cipher.decrypt(first, "Contact", "name")).toBe(plain);
    }
  });
  it("rechaza manipulación, truncado, texto plano y claves incorrectas", () => {
    const cipher = fieldCipher(env());
    const encoded = cipher.encrypt("dato personal", "User", "name");
    const payload = Buffer.from(encoded.split(":").at(-1)!, "base64url");
    payload[15] ^= 1;
    const changed =
      encoded.slice(0, encoded.lastIndexOf(":") + 1) +
      payload.toString("base64url");
    for (const value of [changed, encoded.slice(0, -8), "dato sin cifrar"])
      expect(() => cipher.decrypt(value, "User", "name")).toThrow(
        /authenticate/,
      );
    expect(() => fieldCipher(env()).decrypt(encoded, "User", "name")).toThrow(
      /authenticate/,
    );
    expect(() => cipher.decrypt(encoded, "User", "email")).toThrow(
      /authenticate/,
    );
    expect(() => cipher.decrypt(encoded, "Contact", "name")).toThrow(
      /authenticate/,
    );
  });
  it("el índice email es normalizado, estable, secreto e independiente", () => {
    const config = env();
    const cipher = fieldCipher(config);
    expect(cipher.emailLookup("  Prueba@Example.test ")).toBe(
      cipher.emailLookup("prueba@example.test"),
    );
    expect(cipher.emailLookup("prueba@example.test")).toMatch(/^[a-f0-9]{64}$/);
    expect(fieldCipher(env()).emailLookup("prueba@example.test")).not.toBe(
      cipher.emailLookup("prueba@example.test"),
    );
    const rotated = fieldCipher({
      ...config,
      FIELD_ENCRYPTION_KEYS: JSON.stringify({
        ...JSON.parse(config.FIELD_ENCRYPTION_KEYS),
        v2: randomBytes(32).toString("base64"),
      }),
      FIELD_ENCRYPTION_ACTIVE_KEY: "v2",
    });
    expect(rotated.emailLookup("prueba@example.test")).toBe(
      cipher.emailLookup("prueba@example.test"),
    );
    expect(
      rotated.decrypt(
        cipher.encrypt("anterior", "User", "name"),
        "User",
        "name",
      ),
    ).toBe("anterior");
    expect(rotated.encrypt("nuevo", "User", "name")).toContain(":v2:");
  });
  it("no acepta secretos débiles, configuración incompleta o claves compartidas", () => {
    expect(() => fieldCipher({})).toThrow();
    expect(() =>
      fieldCipher({ ...env(), FIELD_ENCRYPTION_KEYS: '{"v1":"password"}' }),
    ).toThrow();
    const config = env();
    expect(() =>
      fieldCipher({
        ...config,
        FIELD_ENCRYPTION_INDEX_KEY: JSON.parse(config.FIELD_ENCRYPTION_KEYS).v1,
      }),
    ).toThrow(/independent/);
  });
});
