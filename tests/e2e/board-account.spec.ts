import { test, expect, type Page } from "@playwright/test";
import { submitLogin } from "./submit-login";
test.use({ baseURL: "http://127.0.0.1:3100" });
async function login(
  page: Page,
  email = process.env.AUTHORIZED_EMAIL!,
  password = process.env.E2E_PASSWORD!,
) {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Contraseña", { exact: true }).fill(password);
  await submitLogin(page);
}
async function choose(page: Page, label: string, option: string) {
  await page.getByRole("combobox", { name: label, exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}
test("Kanban compartido con Hoy, enlaces, arrastre y estadísticas", async ({
  page,
}, info) => {
  test.setTimeout(180000);
  const suffix = info.project.name + "-" + Date.now(),
    title = "Tarea Kanban " + suffix,
    col = "Revisión " + suffix;
  await login(page);
  await page.getByRole("link", { name: "Kanban", exact: true }).click();
  // No speculative prefetch: allow the first cold Windows development compilation.
  await expect(page.getByRole("heading", { name: "Tu tablero" })).toBeVisible({
    timeout: 30000,
  });
  await page
    .getByRole("button", { name: "Añadir columna", exact: true })
    .click();
  await page.getByLabel("Nombre de columna").fill(col);
  await page.getByRole("button", { name: "Guardar columna" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page
    .getByRole("button", { name: "Añadir tarea en Por hacer", exact: true })
    .click();
  await page.getByLabel("Título de tarea").fill(title);
  await page
    .getByLabel("Descripción", { exact: true })
    .fill("DescripciónSinEspacios".repeat(200));
  await page.getByLabel("Fecha límite").fill("2026-11-20T10:00");
  await page.getByLabel("Buscar registros para enlazar").fill("oferta");
  const linkResult = page.locator(".task-link-results button").first();
  if (await linkResult.isVisible()) await linkResult.click();
  await page
    .getByRole("button", { name: "Guardar tarea", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  const card = page.locator(".kanban-card").filter({ hasText: title });
  await expect(card).toBeVisible();
  expect(
    await card.evaluate((node) => node.scrollWidth <= node.clientWidth),
  ).toBe(true);
  expect(
    await card
      .locator(".task-preview")
      .evaluate((node) => node.clientHeight < node.scrollHeight),
  ).toBe(true);
  const taskId = await card.getAttribute("data-task-id");
  await page.goto("/dashboard");
  await expect(page.locator(".action-list")).toBeVisible();
  const expand = page.getByRole("button", { name: /Ver todas las acciones/ });
  if (await expand.isVisible()) await expand.click();
  await expect(
    page.locator(".action-list").getByText(title, { exact: true }),
  ).toBeVisible();
  await page.locator(".action-list").getByText(title, { exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await choose(page, "Mover tarea a columna", col);
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "Columna " + col })
      .getByText(title, { exact: true }),
  ).toBeVisible();
  if (info.project.name === "desktop") {
    await page
      .getByRole("button", { name: "Añadir tarea en En curso", exact: true })
      .click();
    await page.getByLabel("Título de tarea").fill("Ancla " + suffix);
    await page
      .getByRole("button", { name: "Guardar tarea", exact: true })
      .click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await page.getByRole("textbox", { name: "Buscar tareas" }).fill(suffix);
    await page
      .getByRole("button", { name: "Editar tarea " + title, exact: true })
      .click();
    await choose(page, "Mover tarea a columna", "Por hacer");
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await expect(
      page
        .getByRole("region", { name: "Columna Por hacer" })
        .getByText(title, { exact: true }),
    ).toBeVisible();
    const handle = page
        .locator(".kanban-card")
        .filter({ hasText: title })
        .locator(".task-preview"),
      dest = page.getByRole("region", { name: "Columna En curso" });
    await handle.scrollIntoViewIfNeeded();
    await expect(handle).toBeVisible();
    const h = await handle.boundingBox();
    await expect(dest).toBeVisible();
    const d = await dest.boundingBox();
    await page.mouse.move(h!.x + h!.width / 2, h!.y + h!.height / 2);
    await page.mouse.down();
    await page.mouse.move(h!.x + 12, h!.y + 12, { steps: 5 });
    const overlay = page.locator(".drag-preview");
    await expect(overlay.locator(".task-preview")).toHaveText(
      "DescripciónSinEspacios".repeat(200),
    );
    await expect(overlay.locator(".task-complete-circle")).toBeVisible();
    await expect(overlay.locator("footer")).toContainText("20 nov");
    await page.mouse.move(d!.x + d!.width / 2, d!.y + 70, { steps: 15 });
    await expect(dest.locator(".kanban-drop-slot")).toBeVisible();
    await expect(dest).toHaveClass(/is-over/);
    await page.keyboard.press("Escape");
    await page.mouse.up();
    await expect(page.locator(".kanban-drop-slot")).toHaveCount(0);
    await expect(page.locator(".drag-preview")).toHaveCount(0);
    await expect(
      page
        .getByRole("region", { name: "Columna Por hacer" })
        .getByText(title, { exact: true }),
    ).toBeVisible();
    await page.mouse.move(h!.x + h!.width / 2, h!.y + h!.height / 2);
    await page.mouse.down();
    await page.mouse.move(h!.x + 12, h!.y + 12, { steps: 5 });
    await page.mouse.move(d!.x + d!.width / 2, d!.y + 70, { steps: 15 });
    await expect(dest.locator(".kanban-drop-slot")).toBeVisible();
    await page.screenshot({ path: "test-results/kanban-drag-desktop.png" });
    await page.mouse.up();
    await expect(page.locator(".kanban-drop-slot")).toHaveCount(0);
    await expect(overlay).toHaveCount(0);
    await expect(dest.getByText(title, { exact: true })).toBeVisible();
    const afterDrop = await (await page.request.get("/api/export")).json();
    expect(
      afterDrop.tasks.find((t: { id: string }) => t.id === taskId).position,
    ).toBeLessThan(
      afterDrop.tasks.find(
        (t: { title: string }) => t.title === "Ancla " + suffix,
      ).position,
    );
  }
  const complete = page.getByRole("button", {
    name: "Completar tarea: " + title,
    exact: true,
  });
  if (info.project.name === "desktop") {
    await complete.hover();
    await expect(complete.locator("svg")).toHaveCSS("opacity", "1");
  }
  await complete.click();
  await expect(
    page.getByRole("button", { name: "Completada: " + title, exact: true }),
  ).toBeDisabled();
  const backup = await (await page.request.get("/api/export")).json();
  expect(
    backup.tasks.find((t: { id: string }) => t.id === taskId).completedAt,
  ).not.toBeNull();
  expect(
    backup.taskCompletions.filter(
      (t: { taskIdentity: string }) => t.taskIdentity === taskId,
    ),
  ).toHaveLength(1);
  await page.goto("/dashboard");
  await expect(
    page.locator(".action-list").getByText(title, { exact: true }),
  ).toHaveCount(0);
  await page.goto("/statistics");
  await expect(
    page
      .locator(".extended-metrics")
      .getByText("Tareas completadas", { exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Tecnologías", exact: true }).click();
  await expect(
    page
      .locator(".statistics-extended")
      .getByRole("columnheader", { name: "Tecnología", exact: true }),
  ).toBeVisible();
  await page.goto("/kanban");
  await page.getByRole("textbox", { name: "Buscar tareas" }).fill(title);
  await page
    .locator(".kanban-card")
    .filter({ hasText: title })
    .scrollIntoViewIfNeeded();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(page.viewportSize()!.width);
  await page.screenshot({
    path: "test-results/kanban-" + info.project.name + ".png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Activar modo oscuro" }).click();
  await page.screenshot({
    path: "test-results/kanban-dark-" + info.project.name + ".png",
    fullPage: true,
  });
});
test("cambios de cuenta requieren contraseña y revocan las demás sesiones", async ({
  page,
  browser,
}, info) => {
  test.setTimeout(120000);
  const email = `settings-${info.project.name}-${Date.now()}@example.test`,
    password = "Una clave segura de prueba 27!",
    replacement = "Cl4ve!27";
  await page.goto("/register");
  await page
    .getByLabel("Código de registro", { exact: true })
    .fill(process.env.REGISTRATION_CODE!);
  await page.getByLabel("Nombre", { exact: true }).fill("Perfil original");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Contraseña", { exact: true }).fill(password);
  await page.getByLabel("Confirmar contraseña").fill(password);
  await page.getByRole("button", { name: "Crear cuenta", exact: true }).click();
  await expect(page).toHaveURL(/dashboard/);
  const second = await browser.newContext({ baseURL: "http://127.0.0.1:3100" });
  try {
    const other = await second.newPage();
    await login(other, email, password);
    await page.goto("/settings");
    const nameForm = page.getByRole("form", {
      name: "Cambiar nombre",
      exact: true,
    });
    await nameForm
      .getByLabel("Nombre", { exact: true })
      .fill("Perfil actualizado");
    await nameForm
      .getByLabel("Contraseña actual", { exact: true })
      .fill("Incorrecta");
    await nameForm.getByRole("button", { name: "Guardar nombre" }).click();
    await expect(
      page.locator(".account-forms").getByRole("alert"),
    ).toContainText("incorrecta");
    await nameForm
      .getByLabel("Contraseña actual", { exact: true })
      .fill(password);
    await nameForm.getByRole("button", { name: "Guardar nombre" }).click();
    await expect(
      page.getByRole("link", { name: "Configuración de Perfil actualizado" }),
    ).toBeVisible();
    const pwdForm = page.getByRole("form", {
      name: "Cambiar contraseña",
      exact: true,
    });
    await pwdForm
      .getByLabel("Contraseña actual", { exact: true })
      .fill(password);
    await pwdForm
      .getByLabel("Nueva contraseña", { exact: true })
      .fill(replacement);
    await pwdForm
      .getByLabel("Confirmar nueva contraseña", { exact: true })
      .fill(replacement);
    for (const label of [
      "Contraseña actual",
      "Nueva contraseña",
      "Confirmar nueva contraseña",
    ]) {
      const field = pwdForm.getByLabel(label, { exact: true });
      await expect(field).toHaveAttribute("type", "password");
      await pwdForm
        .getByRole("button", {
          name: "Mostrar " + label.toLowerCase(),
          exact: true,
        })
        .click();
      await expect(field).toHaveAttribute("type", "text");
      await expect(field).toHaveValue(
        label === "Contraseña actual" ? password : replacement,
      );
      await pwdForm
        .getByRole("button", {
          name: "Ocultar " + label.toLowerCase(),
          exact: true,
        })
        .click();
      await expect(field).toHaveAttribute("type", "password");
    }
    await pwdForm
      .getByRole("button", { name: "Cambiar contraseña", exact: true })
      .click();
    await expect(page).toHaveURL(/login/);
    await other.goto("/settings");
    await expect(other).toHaveURL(/login/);
    await login(page, email, replacement);
  } finally {
    await second.close();
  }
});
