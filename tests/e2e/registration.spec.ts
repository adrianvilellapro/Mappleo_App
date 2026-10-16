import { test, expect } from "@playwright/test";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import { submitLogin } from "./submit-login";
test.use({ baseURL: "http://127.0.0.1:3100" });
test("login centrado, sin Google y alta funcional", async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  await page.goto("/login");
  await expect(
    page.getByRole("button", { name: "Continuar con Google" }),
  ).toHaveCount(0);
  const card = await page.locator(".auth-card").boundingBox();
  expect(
    Math.abs(card!.x + card!.width / 2 - page.viewportSize()!.width / 2),
  ).toBeLessThan(2);
  await page.screenshot({
    path: testInfo.outputPath("login.png"),
    fullPage: true,
  });
  const providers = await (
    await page.request.get("/api/auth/providers")
  ).json();
  expect(Object.keys(providers)).toEqual(["credentials"]);
  await page.getByRole("link", { name: "Crear una cuenta" }).click();
  await page
    .getByLabel("Código de registro", { exact: true })
    .fill(process.env.REGISTRATION_CODE!);
  const email =
    "signup-" + testInfo.project.name + "-" + Date.now() + "@example.test";
  const password = "Cl4ve!27";
  await expect(page.locator("#password-help")).toHaveText(
    "Al menos 8 caracteres. Se permiten espacios y símbolos.",
  );
  await page.getByLabel("Nombre", { exact: true }).fill("Alex de prueba");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Contraseña", { exact: true }).fill(password);
  await page
    .getByLabel("Confirmar contraseña", { exact: true })
    .fill("No coincide esta frase");
  await page.getByRole("button", { name: "Crear cuenta", exact: true }).click();
  await expect(page.locator(".login-form").getByRole("alert")).toContainText(
    "no coinciden",
  );
  await page.getByLabel("Confirmar contraseña", { exact: true }).fill(password);
  await page.screenshot({
    path: testInfo.outputPath("registro.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Crear cuenta", exact: true }).click();
  await expect(page).toHaveURL(/dashboard/);
  const sessionCookie = (await page.context().cookies()).find((cookie) =>
    cookie.name.endsWith("next-auth.session-token"),
  );
  expect(sessionCookie).toBeDefined();
  expect(sessionCookie!.expires - Date.now() / 1000).toBeGreaterThan(
    360 * 24 * 60 * 60,
  );
  await expect(page.locator(".dashboard-date")).toBeVisible();
  await expect(page.getByText("Mi espacio personal")).toHaveCount(0);
  await expect(page.getByText("Espacio privado")).toHaveCount(0);
  await page
    .getByRole("link", { name: "Configuración de Alex de prueba" })
    .click();
  await expect(page).toHaveURL(/settings/);
  const crossOrigin = await page.request.post("/api/import", {
    data: "{}",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://otra-web.example.com",
    },
  });
  expect(crossOrigin.status()).toBe(403);
  const fixture = resolve(
    process.cwd(),
    "DATOS_PRUEBA_IMPORTACION",
    "mappleo-datos-prueba.json",
  );
  page.on("dialog", (dialog) => dialog.accept());
  const fixtureData = JSON.parse(readFileSync(fixture, "utf8")),
    stamp = new Date().toISOString();
  // Explicit Kanban tasks: old action/follow-up fields no longer generate reminders.
  fixtureData.boardColumns = [
    {
      id: "test-kanban-todo",
      userId: fixtureData.ownerId,
      name: "Por hacer",
      position: 0,
      isDone: false,
      systemKey: "todo",
      createdAt: stamp,
      updatedAt: stamp,
    },
  ];
  fixtureData.tasks = Array.from({ length: 25 }, (_, i) => ({
    id: `test-kanban-${i}`,
    userId: fixtureData.ownerId,
    title: `Acción explícita ${i + 1}`,
    description: "",
    columnId: "test-kanban-todo",
    position: i,
    dueAt: stamp,
    completedAt: null,
    sourceKind: null,
    sourceId: null,
    links: [],
    createdAt: stamp,
    updatedAt: stamp,
  }));
  await page.getByLabel("Archivo de backup").setInputFiles({
    name: "test-backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(fixtureData)),
  });
  await page.getByRole("button", { name: "Restaurar datos" }).click();
  await expect(page.getByRole("status")).toContainText("161 registros nuevos");
  await page.getByRole("button", { name: "Restaurar datos" }).click();
  await expect(page.getByRole("status")).toContainText("0 registros nuevos");
  const fakeIconRequests: string[] = [];
  page.on("request", (request) => {
    if (/\.example\.(?:com|org|net|test)\//i.test(request.url()))
      fakeIconRequests.push(request.url());
  });
  await page.goto("/companies");
  await expect(page.locator(".company-logo:visible").first()).toBeVisible();
  await page.goto("/offers");
  await expect(page.locator(".company-logo:visible").first()).toBeVisible();
  expect(fakeIconRequests).toEqual([]);
  await page.goto("/dashboard");
  await expect(page.locator(".action-list li")).toHaveCount(8);
  await page
    .getByRole("button", { name: "Ver todas las acciones (25)" })
    .click();
  await expect(page.locator(".action-list li")).toHaveCount(25);
  await page.getByRole("button", { name: "Mostrar menos" }).click();
  await expect(page.locator(".action-list li")).toHaveCount(8);
  await expect(page.locator(".recent-activity button")).toHaveCount(0);
  await page.goto("/settings");
  await page
    .locator(".settings-page")
    .getByRole("button", { name: "Cerrar sesión" })
    .click();
  await expect(page).toHaveURL(/login/);
  await page.goto("/register");
  await page
    .getByLabel("Código de registro", { exact: true })
    .fill(process.env.REGISTRATION_CODE!);
  await page.getByLabel("Nombre", { exact: true }).fill("Alex de prueba");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page
    .getByLabel("Contraseña", { exact: true })
    .fill("Otra contraseña segura 427!");
  await page
    .getByLabel("Confirmar contraseña", { exact: true })
    .fill("Otra contraseña segura 427!");
  await page.getByRole("button", { name: "Crear cuenta", exact: true }).click();
  await expect(page.locator(".login-form").getByRole("alert")).toContainText(
    "Este email ya tiene una cuenta",
  );
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Contraseña", { exact: true }).fill(password);
  await submitLogin(page);
  const exported = await page.request.get("/api/export");
  expect(exported.ok()).toBe(true);
  const data = await exported.json();
  expect(data.companies).toHaveLength(12);
  expect(data.offers).toHaveLength(24);
  expect(data.applications).toHaveLength(18);
  expect(data.contacts).toHaveLength(18);
  expect(data.networking).toHaveLength(10);
});

test("distingue credenciales incorrectas del bloqueo por intentos", async ({
  page,
}, testInfo) => {
  const email =
    "locked-" + testInfo.project.name + "-" + Date.now() + "@example.test";
  await page.goto("/register");
  await page
    .getByLabel("Código de registro", { exact: true })
    .fill(process.env.REGISTRATION_CODE!);
  await page.getByLabel("Nombre", { exact: true }).fill("Cuenta bloqueo");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page
    .getByLabel("Contraseña", { exact: true })
    .fill("Mi clave de pruebas 27!");
  await page
    .getByLabel("Confirmar contraseña", { exact: true })
    .fill("Mi clave de pruebas 27!");
  await page.getByRole("button", { name: "Crear cuenta", exact: true }).click();
  await expect(page).toHaveURL(/dashboard/);
  await page.goto("/settings");
  await page
    .locator(".settings-page")
    .getByRole("button", { name: "Cerrar sesión" })
    .click();
  await expect(page).toHaveURL(/login/);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Contraseña", { exact: true }).fill("ClaveErronea");
  for (let attempt = 1; attempt <= 5; attempt++) {
    await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().includes("/api/auth/callback/credentials") &&
          r.request().method() === "POST",
      ),
      page.getByRole("button", { name: "Entrar en mi espacio" }).click(),
    ]);
    await expect(page.locator(".login-form").getByRole("alert")).toHaveText(
      attempt === 5
        ? "has realizado varios intentos, espera 15 minutos."
        : "Email o contraseña incorrectos.",
    );
  }
});
