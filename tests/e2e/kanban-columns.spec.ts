import { test, expect, type Page } from "@playwright/test";
test.use({ baseURL: "http://127.0.0.1:3100" });
async function choose(page: Page, label: string, option: string) {
  await page.getByRole("combobox", { name: label, exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

test("editar el orden de columnas y confirmar traslado o borrado de sus tareas", async ({
  page,
}, info) => {
  test.setTimeout(180000);
  const suffix = info.project.name + "-" + Date.now(),
    column = "Reordenar " + suffix,
    destination = "Destino " + suffix,
    title = "Tarea trasladada " + suffix;
  await page.goto("/register");
  await page
    .getByLabel("Código de registro", { exact: true })
    .fill(process.env.REGISTRATION_CODE!);
  await page.getByLabel("Nombre", { exact: true }).fill("Tablero de prueba");
  await page
    .getByLabel("Email", { exact: true })
    .fill("columns-" + suffix + "@example.test");
  await page.getByLabel("Contraseña", { exact: true }).fill("Cl4ve!27");
  await page.getByLabel("Confirmar contraseña").fill("Cl4ve!27");
  await page.getByRole("button", { name: "Crear cuenta", exact: true }).click();
  await expect(page).toHaveURL(/dashboard/);
  await page.goto("/kanban");
  for (const name of [column, destination]) {
    await page
      .getByRole("button", { name: "Añadir columna", exact: true })
      .click();
    await page.getByLabel("Nombre de columna").fill(name);
    await page.getByRole("button", { name: "Guardar columna" }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
  }
  await page
    .getByRole("button", { name: "Añadir tarea en " + column, exact: true })
    .click();
  await page.getByLabel("Título de tarea").fill(title);
  await page
    .getByRole("button", { name: "Guardar tarea", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  const lane = page.getByRole("region", {
    name: "Columna " + column,
    exact: true,
  });
  await expect(lane.getByText(title, { exact: true })).toBeVisible();
  expect(
    await lane
      .locator(".count-pill")
      .evaluate((node) => node.nextElementSibling?.getAttribute("aria-label")),
  ).toBe("Añadir tarea en " + column);
  const columnId = await lane.getAttribute("data-column-id");
  const taskId = await lane
    .locator(".kanban-card")
    .getAttribute("data-task-id");
  for (const [position, index] of [
    ["1 · Al principio", 0],
    ["5 · Al final", 4],
  ] as const) {
    await page
      .getByRole("button", { name: "Editar columna " + column, exact: true })
      .click();
    await choose(page, "Posición de columna", position);
    await page.getByRole("button", { name: "Guardar columna" }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await expect(page.locator(".kanban-lane").nth(index)).toHaveAttribute(
      "aria-label",
      "Columna " + column,
    );
    await expect(lane.getByText(title, { exact: true })).toBeVisible();
  }
  await page
    .getByRole("button", { name: "Editar columna " + column, exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Eliminar columna", exact: true }),
  ).toHaveClass(/button-danger/);
  const saveBounds = await page
    .getByRole("button", { name: "Guardar columna", exact: true })
    .boundingBox();
  const deleteBounds = await page
    .getByRole("button", { name: "Eliminar columna", exact: true })
    .boundingBox();
  expect(deleteBounds!.x).toBeGreaterThan(saveBounds!.x);
  expect(Math.abs(deleteBounds!.y - saveBounds!.y)).toBeLessThan(2);
  await page
    .getByRole("button", { name: "Eliminar columna", exact: true })
    .click();
  await choose(page, "Columna de destino", destination);
  page.once("dialog", (dialog) => dialog.dismiss());
  await page
    .getByRole("button", { name: "Confirmar eliminación de columna" })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(
    (await (await page.request.get("/api/export")).json()).tasks.find(
      (t: { id: string }) => t.id === taskId,
    ).columnId,
  ).toBe(columnId);
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Confirmar eliminación de columna" })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(lane).toHaveCount(0);
  const destinationLane = page.getByRole("region", {
    name: "Columna " + destination,
    exact: true,
  });
  await expect(destinationLane.getByText(title, { exact: true })).toBeVisible();
  await expect(
    destinationLane.getByRole("button", { name: "Completar tarea: " + title }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Editar columna " + destination, exact: true })
    .click();
  await page
    .getByRole("button", { name: "Eliminar columna", exact: true })
    .click();
  await page
    .getByRole("radio", { name: "Borrar todas las tareas de la columna" })
    .check();
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Confirmar eliminación de columna" })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(destinationLane).toHaveCount(0);
  const backup = await (await page.request.get("/api/export")).json();
  expect(backup.tasks.some((t: { id: string }) => t.id === taskId)).toBe(false);
  await page.reload();
  await expect(lane).toHaveCount(0);
  await expect(destinationLane).toHaveCount(0);
});
