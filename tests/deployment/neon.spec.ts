import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { Client } from "pg";
import { runtimePoolConfig } from "../../lib/db/connection";
import { fieldCipher, cipherPrefix } from "../../lib/db/field-encryption";
import { registrationSourceKey } from "../../lib/auth/registration-access";
import { adminTotp, adminCookie } from "../../features/admin/config";
import { parse } from "dotenv";

test("Neon: registro protegido, sesión, CRUD/importación, exportación, cifrado y administrador", async ({
  page,
  context,
}) => {
  test.setTimeout(240000);
  const production = parse(readFileSync(".env.deploy"));
  if (
    new URL(process.env.DATABASE_URL!).hostname ===
    production.DEPLOY_DATABASE_HOST
  )
    throw new Error("Se prohíben recorridos de prueba sobre producción.");
  const owner = new Client(runtimePoolConfig(process.env.DATABASE_URL!));
  await owner.connect();
  const sourceKey = registrationSourceKey("local-loopback");
  const email = `cloud-${randomUUID()}@example.test`;
  let userId = "";
  try {
    await owner.query('DELETE FROM "AuthThrottle" WHERE key=$1', [sourceKey]);
    const response = await page.goto("/register");
    expect(response?.status()).toBe(200);
    await expect(page.locator('link[rel="icon"]')).toHaveAttribute(
      "href",
      "/brand/mappleo-logo.png",
    );
    expect((await page.request.get("/brand/mappleo-logo.png")).status()).toBe(
      200,
    );
    await page
      .getByLabel("Nombre", { exact: true })
      .fill("Persona de prueba Neon");
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Contraseña", { exact: true }).fill("Cl4ve!27");
    await page
      .getByLabel("Confirmar contraseña", { exact: true })
      .fill("Cl4ve!27");
    await page
      .getByLabel("Código de registro", { exact: true })
      .fill("codigo-no-autorizado");
    await page
      .getByRole("button", { name: "Crear cuenta", exact: true })
      .click();
    await expect(page.locator(".login-form").getByRole("alert")).toContainText(
      "código de registro no es válido",
    );
    await page
      .getByLabel("Código de registro", { exact: true })
      .fill(process.env.REGISTRATION_CODE!);
    await page
      .getByRole("button", { name: "Crear cuenta", exact: true })
      .click();
    await expect(page).toHaveURL(/dashboard/);
    const row = (
      await owner.query(
        'SELECT id,email,name,"passwordHash" FROM "User" WHERE "emailLookup"=$1',
        [fieldCipher().emailLookup(email)],
      )
    ).rows[0];
    userId = row.id;
    expect(row.email.startsWith(cipherPrefix)).toBe(true);
    expect(row.name.startsWith(cipherPrefix)).toBe(true);
    expect(row.passwordHash.startsWith("$argon2id$")).toBe(true);
    const cookie = (await context.cookies()).find(
      (c) => c.name === "__Secure-next-auth.session-token",
    );
    expect(cookie?.secure).toBe(true);
    expect(cookie?.httpOnly).toBe(true);
    await page.goto("/settings");
    const fixture = JSON.parse(
      readFileSync(
        "DATOS_PRUEBA_IMPORTACION/mappleo-datos-prueba.json",
        "utf8",
      ),
    );
    const first = await page.evaluate(async (backup) => {
      const r = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(backup),
      });
      return { status: r.status, data: await r.json() };
    }, fixture);
    expect(first.status).toBe(200);
    expect(first.data.created).toBe(136);
    const second = await page.evaluate(async (backup) => {
      const r = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(backup),
      });
      return { status: r.status, data: await r.json() };
    }, fixture);
    expect(second.status).toBe(200);
    expect(second.data.created).toBe(0);
    for (const path of [
      "/dashboard",
      "/companies",
      "/offers",
      "/applications",
      "/contacts",
      "/networking",
      "/kanban",
      "/statistics",
    ]) {
      expect((await page.goto(path))?.status()).toBe(200);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(page.viewportSize()!.width);
    }
    const exported = await page.request.get("/api/export");
    expect(exported.status()).toBe(200);
    const data = await exported.json();
    expect(data.companies.length).toBe(12);
    expect(data.applications.length).toBe(18);
    for (const format of ["pdf", "csv"]) {
      const r = await page.request.get(
        "/api/export?format=" + format + "&section=companies",
      );
      expect(r.status()).toBe(200);
      expect((await r.body()).byteLength).toBeGreaterThan(100);
    }
    expect((await page.request.get("/api/admin/accounts")).status()).toBe(401);
    await owner.query(
      'UPDATE "AdminAccount" SET "lastTotpCounter"=-1 WHERE id=1',
    );
    await page.goto("/admin/login");
    await page
      .getByLabel("Email administrativo")
      .fill(process.env.ADMIN_EMAIL!);
    await page
      .getByLabel("Contraseña de administrador", { exact: true })
      .fill(process.env.ADMIN_PASSWORD!);
    await page
      .getByLabel("Código del autenticador", { exact: true })
      .fill(adminTotp(process.env.ADMIN_TOTP_SECRET!).generate());
    await page
      .getByRole("button", { name: "Entrar en administración" })
      .click();
    await expect(page).toHaveURL(/\/admin$/);
    expect(
      (await context.cookies()).find((c) => c.name === adminCookie)?.secure,
    ).toBe(true);
    await expect(page.getByText(email, { exact: true })).toBeVisible();
    const adminData = await (
      await page.request.get("/api/admin/accounts")
    ).json();
    expect(JSON.stringify(adminData)).not.toContain("passwordHash");
    expect(JSON.stringify(adminData)).not.toContain("Persona de prueba Neon");
    const policy = (
      await owner.query(
        'SELECT "maxAccounts" FROM "RegistrationPolicy" WHERE id=1',
      )
    ).rows[0];
    expect(policy.maxAccounts).toBe(15);
    await page.goto("/register");
    await owner.query('DELETE FROM "AuthThrottle" WHERE key=$1', [sourceKey]);
    for (let i = 0; i < 9; i++) {
      const status = await page.evaluate(
        async () =>
          (
            await fetch("/api/register", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ registrationCode: "incorrecto" }),
            })
          ).status,
      );
      expect(status).toBe(i === 8 ? 429 : 403);
    }
    const blocked = await page.evaluate(
      async () =>
        (
          await fetch("/api/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
          })
        ).status,
    );
    expect(blocked).toBe(429);
    console.log(
      "Neon HTTPS: alta con invitación, datos cifrados, importación idempotente, PDF/CSV, MFA y bloqueo al noveno fallo verificados.",
    );
  } finally {
    if (userId)
      await owner.query("SELECT mappleo_admin_delete_user($1)", [userId]);
    await owner.query('DELETE FROM "AuthThrottle" WHERE key=$1', [sourceKey]);
    await owner.query('DELETE FROM "AdminSession"');
    await owner.query(
      'UPDATE "AdminAccount" SET "lastTotpCounter"=-1 WHERE id=1',
    );
    await owner.end();
  }
});
