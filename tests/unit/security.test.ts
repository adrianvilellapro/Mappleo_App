import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createRequire } from "node:module";
import { backupSchema } from "../../features/backup/schema";
import { backupWithinStructuralLimits } from "../../features/backup/preflight";
import { webUrl } from "../../features/tracker/schemas";
import { passwordSchema } from "../../lib/auth/validation";
import { runtimePoolConfig } from "../../lib/db/connection";
import {
  permittedOrigin,
  trustedRequestSource,
  applicationOrigin,
} from "../../lib/security/request";
import { isPublicAddress, safeImageMime } from "../../lib/company-icons";
import { usableFaviconUrl } from "../../lib/company-icon-url";
import { encryptBackup, decryptBackup } from "../../features/backup/encryption";
import { readFileSync } from "node:fs";
const require = createRequire(import.meta.url);
const fixture = () =>
  JSON.parse(
    readFileSync("DATOS_PRUEBA_IMPORTACION/mappleo-datos-prueba.json", "utf8"),
  );
describe("Validación de seguridad", () => {
  it("no permite desactivar TLS remoto ni cambiar el host mediante parámetros de la URL", () => {
    const remote = runtimePoolConfig(
      "postgresql://limited:fake-password@db.example.test:6543/mappleo?ssl=0&sslmode=disable&host=127.0.0.1&user=admin",
    );
    expect(remote.ssl).toEqual({ rejectUnauthorized: true });
    expect(remote.host).toBe("db.example.test");
    expect(remote.user).toBe("limited");
    expect(remote.port).toBe(6543);
    expect(remote).not.toHaveProperty("connectionString");
    const local = runtimePoolConfig(
      "postgresql://limited:fake-password@127.0.0.1:5433/mappleo?host=evil.example.test&sslmode=disable",
    );
    expect(local.host).toBe("127.0.0.1");
    expect(local.ssl).toBe(false);
  });
  it("rechaza colecciones gigantes y elementos inválidos antes de validar sus campos", () => {
    expect(backupWithinStructuralLimits(fixture())).toBe(true);
    expect(
      backupWithinStructuralLimits({ companies: Array(2001).fill({}) }),
    ).toBe(false);
    expect(
      backupWithinStructuralLimits({
        companies: [{ tags: Array(101).fill("a") }],
      }),
    ).toBe(false);
    expect(backupWithinStructuralLimits({ companies: [{ tags: [{}] }] })).toBe(
      false,
    );
    expect(
      backupWithinStructuralLimits({
        applications: [{ events: Array(2001).fill({}) }],
      }),
    ).toBe(false);
  });
  it("rechaza protocolos ejecutables y credenciales embebidas, también en backups", () => {
    for (const url of [
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "file:///etc/passwd",
      "https://usuario:clave@metaenlace.com/",
    ]) {
      expect(webUrl.safeParse(url).success).toBe(false);
      const backup = fixture();
      backup.offers[0].url = url;
      expect(backupSchema.safeParse(backup).success).toBe(false);
    }
  });
  it("rechaza enumeraciones manipuladas, identificadores de ruta y salarios absurdos", () => {
    const backup = fixture();
    backup.applications[0].status = "ADMIN";
    expect(backupSchema.safeParse(backup).success).toBe(false);
    const invalidId = fixture();
    invalidId.offers[0].id = "../../settings";
    expect(backupSchema.safeParse(invalidId).success).toBe(false);
    const salary = fixture();
    salary.offers[0].salaryMin = 200000001;
    expect(backupSchema.safeParse(salary).success).toBe(false);
  });
  it("admite texto literal que parece SQL/HTML sin interpretar ni ejecutarlo", () => {
    const backup = fixture();
    backup.companies[0].name = "<script>alert(1)</script>";
    backup.offers[0].title = "' OR 1=1 --";
    expect(backupSchema.safeParse(backup).success).toBe(true);
  });
  it("mantiene ocho caracteres, pero rechaza contraseñas frecuentes", () => {
    for (const value of [
      "password1",
      "password123",
      "password123!",
      "  password1  ",
      "Ｐａｓｓｗｏｒｄ１",
      " \n\t \n\t \n\t ",
      "123456789",
      "qwertyuiop",
      "iloveyou",
    ])
      expect(passwordSchema.safeParse(value).success).toBe(false);
    expect(passwordSchema.safeParse("Cl4ve!27").success).toBe(true);
  });
  it("compara protocolo, host y puerto y no admite orígenes inventados", () => {
    vi.stubEnv("NEXTAUTH_URL", "http://localhost:3000");
    try {
      expect(permittedOrigin("http://127.0.0.1:3000", "127.0.0.1:3000")).toBe(
        true,
      );
      for (const [origin, host] of [
        ["https://localhost:3000", "localhost:3000"],
        ["http://localhost:3001", "localhost:3001"],
        ["http://evil.test", "evil.test"],
        ["null", "localhost:3000"],
      ])
        expect(permittedOrigin(origin, host)).toBe(false);
      expect(trustedRequestSource({ "x-forwarded-for": "1.2.3.4" })).toBe(
        "local-loopback",
      );
      vi.stubEnv("NEXTAUTH_URL", "http://mappleo.test");
      expect(() => applicationOrigin()).toThrow(/HTTPS/);
    } finally {
      vi.unstubAllEnvs();
    }
  });
  it("bloquea IP privadas, transición IPv6, puertos y SVG como iconos", () => {
    for (const value of [
      "2002:7f00:1::",
      "2001::1",
      "64:ff9b::7f00:1",
      "fc00::1",
      "::ffff:127.0.0.1",
    ])
      expect(isPublicAddress(value, 6)).toBe(false);
    expect(isPublicAddress("2606:4700:4700::1111", 6)).toBe(true);
    expect(
      usableFaviconUrl("http://127.0.0.1/", "http://127.0.0.1/favicon.ico"),
    ).toBe("");
    expect(
      usableFaviconUrl(
        "https://metaenlace.com:3000/",
        "https://metaenlace.com:3000/icon.png",
      ),
    ).toBe("");
    expect(
      safeImageMime(Buffer.from("<svg onload='alert(1)' />"), "image/svg+xml"),
    ).toBe("");
    expect(safeImageMime(Buffer.from("<html>"), "image/png")).toBe("");
    expect(
      safeImageMime(
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        "image/png",
      ),
    ).toBe("image/png");
  });
});
describe("Backup cifrado", () => {
  it("restaura el contenido y rechaza contraseña incorrecta, corrupción y truncado", async () => {
    const plain = new TextEncoder().encode(
      JSON.stringify({ name: "Datos privados de prueba" }),
    );
    const cipher = await encryptBackup(plain, "Backup privado 42!");
    expect(new TextDecoder().decode(cipher)).not.toContain("Datos privados");
    expect(await decryptBackup(cipher, "Backup privado 42!")).toEqual(plain);
    await expect(
      decryptBackup(cipher, "Otra contraseña 42!"),
    ).rejects.toThrow();
    const broken = cipher.slice();
    broken[broken.length - 1] ^= 1;
    await expect(decryptBackup(broken, "Backup privado 42!")).rejects.toThrow();
    await expect(
      decryptBackup(cipher.slice(0, 20), "Backup privado 42!"),
    ).rejects.toThrow();
  });
});
describe("Parche de herramientas", () => {
  it("limita profundidad y no rompe los patrones habituales", () => {
    const braces = require("braces");
    const deep = "{".repeat(101) + "a,b" + "}".repeat(101);
    expect(() => braces(deep)).toThrow(/max depth/);
    expect(() => braces.parse("(".repeat(101) + ")".repeat(101))).toThrow(
      /max depth/,
    );
    expect(() => braces.parse("{{a,b},c}", { maxDepth: 1.5 })).toThrow(
      /max depth/,
    );
    expect(braces.expand("foo/({a,b})")).toEqual(["foo/(a)", "foo/(b)"]);
    expect(
      braces.stringify(braces.parse("{{a}}"), { escapeInvalid: true }),
    ).toBe("{{a}}");
    let ast: { type: string; value?: string; nodes?: unknown[] } = {
      type: "text",
      value: "a",
    };
    for (let i = 0; i < 101; i++) ast = { type: "brace", nodes: [ast] };
    const root = { type: "root", nodes: [ast] };
    for (const fn of [braces.compile, braces.expand, braces.stringify])
      expect(() => fn(root)).toThrow(/max depth/);
    const cyclic: { type: string; nodes: unknown[]; parent?: unknown } = {
      type: "paren",
      nodes: [{ type: "text", value: "a" }],
    };
    cyclic.parent = cyclic;
    expect(() => braces.expand(cyclic)).toThrow(/cycle/);
  });
});
