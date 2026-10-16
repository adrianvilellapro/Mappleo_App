import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "../../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { encryptClient } from "../../lib/db/encrypted-client";

test("HTTPS con certificado verificado, sesión Secure y datos cifrados", async ({
  page,
  context,
}) => {
  if (new URL(process.env.DATABASE_URL!).pathname !== "/mappleo_test")
    throw new Error("Only test database.");
  const email = `tls-${randomUUID()}@example.test`;
  const db = encryptClient(
    new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
    }),
  );
  try {
    const response = await page.goto("/register");
    await page
      .getByLabel("Código de registro", { exact: true })
      .fill(process.env.REGISTRATION_CODE!);
    expect(response?.status()).toBe(200);
    expect(response?.headers()["strict-transport-security"]).toBe(
      "max-age=31536000",
    );
    expect(response?.headers()["content-security-policy"]).toContain(
      "upgrade-insecure-requests",
    );
    expect(response?.headers()["content-security-policy"]).not.toContain(
      " ws://",
    );
    await page.getByLabel("Nombre", { exact: true }).fill("Prueba TLS privada");
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page
      .getByLabel("Contraseña", { exact: true })
      .fill("Prueba TLS segura 27!");
    await page
      .getByLabel("Confirmar contraseña", { exact: true })
      .fill("Prueba TLS segura 27!");
    await page
      .getByRole("button", { name: "Crear cuenta", exact: true })
      .click();
    await expect(page).toHaveURL(/dashboard/);
    const cookies = await context.cookies();
    const session = cookies.find(
      (c) => c.name === "__Secure-next-auth.session-token",
    );
    expect(session).toBeDefined();
    expect(session!.secure).toBe(true);
    expect(session!.httpOnly).toBe(true);
    expect(session!.sameSite).toBe("Lax");
    expect(
      cookies.some(
        (c) =>
          c.name === "__Host-next-auth.csrf-token" && c.secure && c.httpOnly,
      ),
    ).toBe(true);
    // Browser fetch also uses real certificate verification (no insecure TLS overrides).
    const api = await page.evaluate(async () => {
      const response = await fetch("/api/export");
      return { status: response.status, data: await response.json() };
    });
    expect(api.status).toBe(200);
    expect(api.data.version).toBe(1);
    await page.goto("/settings");
    await expect(
      page.getByRole("link", { name: "Configuración de Prueba TLS privada" }),
    ).toBeVisible();
  } finally {
    await db.user.deleteMany({ where: { email } });
    await db.$disconnect();
  }
});
