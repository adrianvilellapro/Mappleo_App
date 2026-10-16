import { test, expect } from "@playwright/test";
import { randomBytes, randomUUID } from "node:crypto";
import { PrismaClient } from "../../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { encryptClient } from "../../lib/db/encrypted-client";
import {
  adminConfiguration,
  adminTotp,
  adminCookie,
} from "../../features/admin/config";
import { hashPassword } from "../../lib/auth/password";

test("administración aislada, MFA, privacidad, límite, cambio y borrado confirmados", async ({
  page,
  context,
}) => {
  test.setTimeout(240000);
  if (new URL(process.env.DATABASE_URL!).pathname !== "/mappleo_test")
    throw new Error("Only test database.");
  const sql = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
  const db = encryptClient(
    new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
    }),
  );
  const settings = adminConfiguration();
  const email = `browser-admin-${"l".repeat(50)}-${randomUUID()}@example.test`;
  const password = "Una contraseña privada de usuario 27!";
  let id = "";
  async function code() {
    const account = await sql.adminAccount.findUniqueOrThrow({
      where: { id: 1 },
    });
    const step = Math.max(
      Math.floor(Date.now() / 30000) - 1,
      account.lastTotpCounter + 1,
    );
    const wait = (step - 1) * 30000 - Date.now() + 100;
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    return adminTotp(settings.secret).generate({ timestamp: step * 30000 });
  }
  try {
    await sql.registrationPolicy.update({
      where: { id: 1 },
      data: { maxAccounts: 100000 },
    });
    await sql.adminAccount.update({
      where: { id: 1 },
      data: { lastTotpCounter: -1 },
    });
    const user = await db.user.create({
      data: {
        name: "Nombre privado oculto",
        email,
        passwordHash: await hashPassword(password),
      },
    });
    id = user.id;
    await db.company.create({
      data: {
        userId: id,
        name: "Empresa privada",
        notes: "Nota privada que no puede verse en administración",
      },
    });
    await page.goto("/login");
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Contraseña", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Entrar en mi espacio" }).click();
    await expect(page).toHaveURL(/dashboard/);
    expect(
      await page.evaluate(
        async () => (await fetch("/api/admin/accounts")).status,
      ),
    ).toBe(401);
    await page.goto("/admin");
    await expect(page).toHaveURL(/admin\/login/);
    await context.addCookies([
      {
        name: adminCookie,
        value: randomBytes(32).toString("hex"),
        url: "https://localhost:3300",
        secure: true,
        httpOnly: true,
        sameSite: "Strict",
      },
    ]);
    expect(
      await page.evaluate(
        async () => (await fetch("/api/admin/accounts")).status,
      ),
    ).toBe(401);
    await page.getByLabel("Email administrativo").fill(settings.email);
    await page
      .getByLabel("Contraseña de administrador", { exact: true })
      .fill(settings.password);
    await page
      .getByLabel("Código del autenticador", { exact: true })
      .fill(await code());
    await page
      .getByRole("button", { name: "Entrar en administración" })
      .click();
    await expect(page).toHaveURL(/\/admin$/);
    const cookie = (await context.cookies()).find(
      (c) => c.name === adminCookie,
    )!;
    expect(cookie.secure).toBe(true);
    expect(cookie.httpOnly).toBe(true);
    expect(cookie.sameSite).toBe("Strict");
    expect(cookie.expires - Date.now() / 1000).toBeLessThanOrEqual(1800);
    expect(
      (
        await page.request.post("/api/admin/limit", {
          headers: {
            Origin: "https://evil.example.test",
            "Content-Type": "application/json",
          },
          data: {},
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await page.request.post("/api/admin/limit", {
          headers: {
            Origin: "https://localhost:3300",
            "Content-Type": "application/json",
          },
          data: { oversized: "x".repeat(5000) },
        })
      ).status(),
    ).toBe(413);
    await page.getByLabel("Buscar cuenta por email o ID exacto").fill(email);
    await page.getByRole("button", { name: "Buscar", exact: true }).click();
    const account = page.locator(".admin-account").filter({ hasText: id });
    await expect(account).toBeVisible();
    await expect(account.getByText(email, { exact: true })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(page.viewportSize()!.width);
    await expect(
      page.getByText("Nombre privado oculto", { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByText("Nota privada que no puede verse en administración", {
        exact: true,
      }),
    ).toHaveCount(0);
    const metadata = await page.evaluate(async () =>
      (await fetch("/api/admin/accounts")).json(),
    );
    expect(
      metadata.accounts.find((entry: { id: string }) => entry.id === id).email,
    ).toBe(email);
    expect(JSON.stringify(metadata)).not.toContain("passwordHash");
    await page.getByRole("button", { name: "Cambiar límite" }).click();
    const current = await sql.registrationPolicy.findUniqueOrThrow({
      where: { id: 1 },
    });
    await page
      .getByLabel("Máximo de cuentas")
      .fill(String(current.accountCount + 5));
    await page
      .getByLabel("Contraseña de operaciones administrativas", { exact: true })
      .fill(settings.actionPassword);
    await page
      .getByLabel("Código nuevo del autenticador", { exact: true })
      .fill(await code());
    await page
      .getByRole("button", { name: "Confirmar cambio", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText(
      "Límite de cuentas actualizado",
    );
    await account
      .getByRole("button", { name: "Restablecer contraseña" })
      .click();
    const newPassword = "Una nueva clave privada 42!";
    await page
      .getByLabel("Nueva contraseña del usuario", { exact: true })
      .fill(newPassword);
    await page
      .getByLabel("Repetir nueva contraseña", { exact: true })
      .fill(newPassword);
    await page
      .getByLabel("Contraseña de operaciones administrativas", { exact: true })
      .fill(settings.actionPassword);
    await page
      .getByLabel("Código nuevo del autenticador", { exact: true })
      .fill(await code());
    await page
      .getByRole("button", { name: "Confirmar cambio", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText(
      "Contraseña restablecida",
    );
    expect(await db.authSession.count({ where: { userId: id } })).toBe(0);
    expect(
      await page.evaluate(async () => (await fetch("/api/export")).status),
    ).toBe(401);
    await account
      .getByRole("button", { name: "Eliminar cuenta", exact: true })
      .click();
    await page.getByLabel("Confirmación de borrado").fill(`BORRAR ${id}`);
    await page
      .getByLabel("Contraseña de operaciones administrativas", { exact: true })
      .fill(settings.actionPassword);
    await page
      .getByLabel("Código nuevo del autenticador", { exact: true })
      .fill(await code());
    await page
      .getByRole("button", { name: "Eliminar definitivamente" })
      .click();
    await expect(page.getByRole("status")).toContainText(
      "Cuenta y datos eliminados",
    );
    expect(await db.user.findUnique({ where: { id } })).toBeNull();
    await page
      .getByRole("button", { name: "Cerrar sesión administrativa" })
      .click();
    await expect(page).toHaveURL(/admin\/login/);
    expect(
      await page.evaluate(
        async () => (await fetch("/api/admin/accounts")).status,
      ),
    ).toBe(401);
    await context.addCookies([cookie]);
    expect(
      await page.evaluate(
        async () => (await fetch("/api/admin/accounts")).status,
      ),
    ).toBe(401);
  } finally {
    if (id) await sql.$queryRaw`SELECT mappleo_admin_delete_user(${id})`;
    await sql.registrationPolicy.update({
      where: { id: 1 },
      data: { maxAccounts: 100000 },
    });
    await sql.adminSession.deleteMany();
    await sql.adminAccount.update({
      where: { id: 1 },
      data: { lastTotpCounter: -1 },
    });
    await sql.$disconnect();
    await db.$disconnect();
  }
});
