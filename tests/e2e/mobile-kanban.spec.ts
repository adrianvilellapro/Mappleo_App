import { test, expect } from "@playwright/test";
import { submitLogin } from "./submit-login";
test("el tablero móvil se desplaza sobre tarjetas y el cierre de sesión está en ajustes", async ({
  page,
  context,
}, info) => {
  test.skip(info.project.name !== "mobile", "Gestos táctiles en móvil");
  await page.goto("/login");
  await page
    .getByLabel("Email", { exact: true })
    .fill(process.env.AUTHORIZED_EMAIL!);
  await page
    .getByLabel("Contraseña", { exact: true })
    .fill(process.env.E2E_PASSWORD!);
  await submitLogin(page);
  await expect(
    page.getByRole("button", { name: "Cerrar sesión", exact: true }),
  ).toBeHidden();
  await page.goto("/kanban");
  await page.getByRole("button", { name: "Nueva tarea", exact: true }).click();
  await page
    .getByLabel("Título de tarea")
    .fill("Tarjeta para deslizar " + Date.now());
  await page
    .getByRole("button", { name: "Guardar tarea", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeHidden();
  const board = page.locator(".kanban-board");
  await board.evaluate((e) => (e.scrollLeft = 0));
  const card = page.locator(".kanban-card").first();
  await card.scrollIntoViewIfNeeded();
  const box = await card.boundingBox();
  if (!box) throw Error("Tarjeta no disponible");
  const width = page.viewportSize()!.width,
    x = Math.min(width - 30, box.x + box.width - 15),
    y = Math.min(
      page.viewportSize()!.height - 50,
      box.y + Math.min(45, box.height / 2),
    );
  const cdp = await context.newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x, y }],
  });
  for (let i = 1; i <= 6; i++) {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: x - i * 30, y }],
    });
    await page.waitForTimeout(15);
  }
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expect
    .poll(() => board.evaluate((e) => e.scrollLeft))
    .toBeGreaterThan(20);
  await expect(page.locator(".drag-preview")).toHaveCount(0);
  await card.locator(".task-open").tap();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Cerrar panel" }).click();
  await page.goto("/settings");
  await expect(
    page.getByRole("button", { name: "Cerrar sesión", exact: true }),
  ).toBeVisible();
});
