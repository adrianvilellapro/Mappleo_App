import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import JSZip from "jszip";
import { submitLogin } from "./submit-login";
async function login(page: Page) {
  await page.goto("/login");
  await page
    .getByLabel("Email", { exact: true })
    .fill(process.env.AUTHORIZED_EMAIL!);
  await page
    .getByLabel("Contraseña", { exact: true })
    .fill(process.env.E2E_PASSWORD!);
  await submitLogin(page);
}
test("caché del calendario, opciones diferidas y cambios entre pestañas sin sondeo frecuente", async ({
  page,
  context,
}, info) => {
  await login(page);
  const calls: string[] = [];
  page.on("request", (r) => calls.push(r.url()));
  await page.getByRole("button", { name: "Mes siguiente" }).click();
  await expect
    .poll(() => calls.filter((u) => u.includes("/api/calendar?")).length)
    .toBe(1);
  await expect(
    page.getByRole("status").filter({ hasText: "Cargando fechas" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Mes anterior" }).click();
  await page.getByRole("button", { name: "Mes siguiente" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Cargando fechas" }),
  ).toHaveCount(0);
  expect(calls.filter((u) => u.includes("/api/calendar?")).length).toBe(1);
  await page.goto("/offers");
  await expect(
    page.getByRole("heading", { name: "Ofertas", exact: true }),
  ).toBeVisible();
  expect(calls.filter((u) => u.includes("options=1"))).toEqual([]);
  await page
    .locator(".page-heading")
    .getByRole("button", { name: "Nueva oferta", exact: true })
    .click();
  await expect(page.getByLabel("Puesto")).toBeVisible();
  expect(calls.filter((u) => u.includes("options=1"))).toHaveLength(1);
  await page.getByRole("button", { name: "Cerrar panel" }).click();
  const receiver = await context.newPage();
  await receiver.goto("/companies");
  const name = "Cambio entre pestañas " + info.project.name + " " + Date.now();
  await page.goto("/companies?new=1");
  await page.getByLabel("Nombre", { exact: false }).fill(name);
  await page
    .getByRole("button", { name: "Guardar cambios", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await receiver.bringToFront();
  await expect(
    receiver.getByText(name, { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  await receiver.close();
  await page
    .getByRole("link", { name: "Abrir ficha de " + name, exact: true })
    .filter({ visible: true })
    .click();
  await page.getByRole("button", { name: "Archivar", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.getByRole("button", { name: /Archivados/ }).click();
  await expect(
    page.getByText(name, { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  await page.goto("/dashboard");
  // Development hot reload can refetch RSC independently of application polling.
  // Verify absence of periodic/focus requests against the compiled HTTPS server.
  if (process.env.E2E_COMPILED !== "1") return;
  await page.getByRole("combobox", { name: "Filtrar calendario" }).click();
  await page
    .getByRole("option", { name: "Todos los apartados", exact: true })
    .click();
  await page.clock.install();
  const requests: string[] = [];
  page.on("request", (r) => {
    if (new URL(r.url()).searchParams.has("_rsc")) requests.push(r.url());
  });
  await page.clock.fastForward(65000);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  expect(requests).toEqual([]);
});
test("los informes se descargan desde el navegador sin generar PDF/ZIP en el servidor", async ({
  page,
}) => {
  await login(page);
  await page.goto("/settings");
  const calls: string[] = [];
  const workerErrors: string[] = [];
  page.on("request", (r) => calls.push(r.url()));
  page.on("pageerror", (e) => workerErrors.push(e.message));
  await page.getByRole("combobox", { name: "Formato", exact: true }).click();
  await page.getByRole("option", { name: "Informe PDF", exact: true }).click();
  const pdfPromise = page.waitForEvent("download", { timeout: 60000 });
  await page
    .getByRole("button", { name: "Descargar PDF", exact: true })
    .click();
  const pdf = await pdfPromise;
  expect((await readFile((await pdf.path())!)).subarray(0, 5).toString()).toBe(
    "%PDF-",
  );
  await page.getByRole("combobox", { name: "Formato", exact: true }).click();
  await page.getByRole("option", { name: "Hojas CSV", exact: true }).click();
  const csvPromise = page.waitForEvent("download", { timeout: 60000 });
  await page.getByRole("button", { name: /Descargar.*CSV/ }).click();
  const csv = await csvPromise;
  const zip = await JSZip.loadAsync(await readFile((await csv.path())!));
  expect(Object.keys(zip.files)).toContain("empresas.csv");
  expect(await zip.file("empresas.csv")!.async("string")).toContain("ID");
  expect(calls.some((u) => /format=(pdf|csv)/.test(u))).toBe(false);
  expect(workerErrors).toEqual([]);
});
test("Kanban carga los enlaces únicamente al abrir una tarea y evita navegación anticipada", async ({
  page,
}) => {
  await login(page);
  await page.goto("/companies?new=1");
  await page
    .getByLabel("Nombre", { exact: false })
    .fill("Empresa para enlaces " + Date.now());
  await page
    .getByRole("button", { name: "Guardar cambios", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.goto("/dashboard");
  const calls: string[] = [];
  page.on("request", (r) => calls.push(r.url()));
  const kanban = page
    .getByRole("link", { name: "Kanban", exact: true })
    .filter({ visible: true })
    .first();
  await kanban.hover();
  expect(calls.filter((u) => new URL(u).pathname === "/kanban")).toEqual([]);
  await kanban.click();
  await expect(
    page.getByRole("heading", { name: "Tu tablero", exact: true }),
  ).toBeVisible({ timeout: 30000 });
  expect(calls.filter((u) => u.includes("/api/records/tasks"))).toEqual([]);
  await page
    .getByRole("button", { name: "Añadir tarea en Por hacer", exact: true })
    .click();
  await page.getByLabel("Buscar registros para enlazar").fill("empresa");
  await expect(page.locator(".task-link-results button").first()).toBeVisible();
  expect(calls.filter((u) => u.includes("/api/records/tasks"))).toHaveLength(1);
});
