import { test, expect, type Page } from "@playwright/test";
import { DateTime } from "luxon";
import { readFile } from "node:fs/promises";
import { createLinkedAction } from "./create-linked-action";
import { submitLogin } from "./submit-login";
async function choose(page: Page, label: string | RegExp, option: string) {
  await page.getByRole("combobox", { name: label }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}
async function save(page: Page) {
  await page
    .getByRole("button", { name: "Guardar cambios", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
}
async function noOverflow(page: Page) {
  const width = page.viewportSize()!.width;
  const layout = await page.evaluate(
    (width) => ({
      width: document.documentElement.scrollWidth,
      overflow: [...document.querySelectorAll("body *")]
        .filter((e) => e.getBoundingClientRect().right > width + 1)
        .slice(0, 18)
        .map((e) => e.tagName + "." + e.className),
    }),
    width,
  );
  expect(layout.width, JSON.stringify(layout.overflow)).toBeLessThanOrEqual(
    width,
  );
}
test("calendario, recuentos reales, estadísticas filtradas y PDF", async ({
  page,
}, testInfo) => {
  const browserErrors: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  const suffix = testInfo.project.name + "-" + Date.now(),
    company = "Empresa analítica " + suffix,
    title = "Oferta analítica " + suffix,
    action = "Paso agenda " + suffix;
  const now = DateTime.now().setZone("Europe/Madrid"),
    tomorrow = now.plus({ days: 1 }),
    sent = now.minus({ days: 2 }),
    response = now.minus({ days: 1 });
  await page.goto("/login");
  await page
    .getByLabel("Email", { exact: true })
    .fill(process.env.AUTHORIZED_EMAIL!);
  await page
    .getByLabel("Contraseña", { exact: true })
    .fill(process.env.E2E_PASSWORD!);
  await submitLogin(page);
  await page.goto("/companies?new=1");
  await page.getByLabel("Nombre", { exact: false }).fill(company);
  await save(page);
  await page.goto("/offers?new=1");
  await page.getByLabel("Puesto").fill(title);
  await choose(page, /^Empresa/, company);
  await choose(page, "Fuente", "LinkedIn");
  await page
    .getByLabel("Fecha límite")
    .fill(tomorrow.toFormat("yyyy-MM-dd'T'HH:mm"));
  await save(page);
  await page
    .getByRole("button", { name: "Crear candidatura para " + title })
    .filter({ visible: true })
    .click();
  await page
    .getByLabel("Fecha de candidatura")
    .fill(sent.toFormat("yyyy-MM-dd'T'HH:mm"));
  await page
    .getByLabel("Primera respuesta real")
    .fill(response.toFormat("yyyy-MM-dd'T'HH:mm"));
  await choose(page, "Estado", "Entrevista");
  await save(page);
  await page
    .getByRole("link")
    .filter({ has: page.getByText(title, { exact: true }) })
    .filter({ visible: true })
    .first()
    .click();
  await createLinkedAction(
    page,
    action,
    tomorrow.toFormat("yyyy-MM-dd'T'HH:mm"),
  );
  await page.goto("/dashboard");
  await expect(page.locator(".dashboard-date")).toBeVisible();
  await expect(page.getByText("Tu próximo paso, más claro.")).toHaveCount(0);
  const backup = await (await page.request.get("/api/export")).json();
  const expected = {
    "Empresas en el radar": backup.companies.filter(
      (r: { archivedAt: string | null }) => !r.archivedAt,
    ).length,
    "Ofertas guardadas": backup.offers.filter(
      (r: { archivedAt: string | null }) => !r.archivedAt,
    ).length,
    "Procesos activos": backup.applications.filter(
      (r: { status: string }) =>
        !["ACCEPTED", "REJECTED", "WITHDRAWN", "GHOSTED"].includes(r.status),
    ).length,
    "En entrevista": backup.applications.filter((r: { status: string }) =>
      ["INTERVIEW", "FINAL_INTERVIEW"].includes(r.status),
    ).length,
  };
  for (const [label, count] of Object.entries(expected))
    await expect(
      page.locator(".metric").filter({ hasText: label }).locator("strong"),
    ).toHaveText(String(count).padStart(2, "0"));
  await page.locator(".metric").filter({ hasText: "En entrevista" }).click();
  await expect(page.locator(".scope-filter")).toContainText("En entrevista");
  await expect(page.locator(".collection-footer")).toContainText(
    String(expected["En entrevista"]),
  );
  await page.goto("/dashboard");
  if (tomorrow.month !== now.month) {
    await page.getByRole("button", { name: "Mes siguiente" }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "Cargando fechas" }),
    ).toHaveCount(0);
  }
  await choose(page, "Filtrar calendario", "Tareas");
  await page
    .getByRole("button", {
      name: new RegExp(
        "^" + tomorrow.setLocale("es").toFormat("d LLLL yyyy") + ",",
      ),
    })
    .click();
  await expect(
    page.locator(".calendar-selection").getByText(action, { exact: true }),
  ).toBeVisible();
  await noOverflow(page);
  await page.screenshot({
    path: "test-results/calendar-" + testInfo.project.name + ".png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Mes siguiente" }).click();
  await expect(page.locator(".calendar-navigation h3")).not.toContainText(
    now.setLocale("es").toFormat("LLLL yyyy"),
  );
  await page
    .locator(".calendar-navigation")
    .getByRole("button", { name: "Hoy", exact: true })
    .click();
  await page.evaluate(() => {
    const event = new KeyboardEvent("keydown", {
      key: "€",
      code: "",
      ctrlKey: true,
      altKey: true,
      bubbles: true,
    });
    Object.defineProperty(event, "getModifierState", {
      value: (key: string) => key === "AltGraph",
    });
    window.dispatchEvent(event);
  });
  await expect(page).toHaveURL(/companies\?new=1/);
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Cerrar panel" }).click();
  const ownCompany = backup.companies.find(
    (c: { name: string }) => c.name === company,
  );
  const params = new URLSearchParams({
    period: "custom",
    from: sent.toISODate()!,
    to: now.toISODate()!,
    group: "week",
    source: "LINKEDIN",
    company: ownCompany.id,
  });
  await page.goto("/statistics?" + params);
  await expect(
    page.getByRole("heading", { name: "Estadísticas", exact: true }),
  ).toBeVisible();
  await expect(
    page
      .locator(".statistics-metric")
      .filter({ hasText: "Candidaturas enviadas" })
      .locator("strong"),
  ).toHaveText("1");
  await expect(
    page
      .locator(".statistics-metric")
      .filter({ hasText: "Respuesta real registrada" })
      .locator("strong"),
  ).toHaveText("100 %");
  await expect(
    page
      .locator(".statistics-metric")
      .filter({ hasText: "Llegaron a entrevista" })
      .locator("strong"),
  ).toHaveText("100 %");
  await page
    .locator(".statistics-metric")
    .filter({ hasText: "Candidaturas enviadas" })
    .click();
  await expect(
    page.getByRole("dialog").getByText(title, { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cerrar panel" }).click();
  await choose(page, "Fuente", "InfoJobs");
  await page.getByRole("button", { name: "Aplicar filtros" }).click();
  await expect(
    page
      .locator(".statistics-metric")
      .filter({ hasText: "Candidaturas enviadas" })
      .locator("strong"),
  ).toHaveText("0");
  await choose(page, "Fuente", "LinkedIn");
  await page.getByRole("button", { name: "Aplicar filtros" }).click();
  await expect(
    page
      .locator(".statistics-metric")
      .filter({ hasText: "Candidaturas enviadas" })
      .locator("strong"),
  ).toHaveText("1");
  const requestPromise = page.waitForRequest((r) =>
    r.url().includes("/api/statistics/pdf"),
  );
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Descargar informe PDF" }).click();
  const request = await requestPromise;
  expect(new URL(request.url()).searchParams.get("company")).toBe(
    ownCompany.id,
  );
  expect(new URL(request.url()).searchParams.get("source")).toBe("LINKEDIN");
  const download = await downloadPromise;
  expect(
    (await readFile((await download.path())!)).subarray(0, 5).toString(),
  ).toBe("%PDF-");
  expect(download.suggestedFilename()).toContain(sent.toISODate()!);
  const pdf = await page.request.get("/api/statistics/pdf?" + params);
  expect(pdf.ok()).toBe(true);
  expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");
  const invalid = await page.request.get(
    "/api/statistics/pdf?period=custom&from=2026-02-30&to=2026-09-01",
  );
  expect(invalid.status()).toBe(400);
  await noOverflow(page);
  await page.screenshot({
    path: "test-results/statistics-" + testInfo.project.name + ".png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Activar modo oscuro" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.screenshot({
    path: "test-results/statistics-dark-" + testInfo.project.name + ".png",
    fullPage: true,
  });
  expect(browserErrors).toEqual([]);
});
