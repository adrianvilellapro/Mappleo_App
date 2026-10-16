import { expect, type Page } from "@playwright/test";
export async function createLinkedAction(
  page: Page,
  title: string,
  dueAt?: string,
) {
  await expect(page.getByLabel("Próxima acción", { exact: false })).toHaveCount(
    0,
  );
  await page.getByRole("link", { name: "Crear acción" }).click();
  await expect(
    page.getByRole("heading", { name: "Nueva tarea", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".task-linked-list li")).toHaveCount(1);
  await page.getByLabel("Título de tarea").fill(title);
  if (dueAt) await page.getByLabel("Fecha límite", { exact: true }).fill(dueAt);
  await page
    .getByRole("button", { name: "Guardar tarea", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeHidden();
}
