import { test, expect, type Page } from "@playwright/test";
import JSZip from "jszip";
import { createLinkedAction } from "./create-linked-action";
import { submitLogin } from "./submit-login";
async function choose(page: Page, label: string | RegExp, option: string) {
  await page.getByRole("combobox", { name: label }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}
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
async function save(page: Page) {
  await page
    .getByRole("button", { name: "Guardar cambios", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
}
async function openNamed(page: Page, name: string) {
  // Use the existing search for a record beyond the first lazy-loaded block.
  const found = page
    .getByRole("link")
    .filter({ has: page.getByText(name, { exact: true }) })
    .filter({ visible: true });
  if (!(await found.count()))
    await page.locator(".collection-toolbar input").fill(name);
  await page
    .getByRole("link")
    .filter({ has: page.getByText(name, { exact: true }) })
    .filter({ visible: true })
    .first()
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
}
test("las páginas privadas requieren sesión", async ({ page }) => {
  await page.goto("/companies");
  await expect(page).toHaveURL(/login/);
  const unauthenticated = await page.request.get("/api/export");
  expect(unauthenticated.status()).toBe(401);
});
test("login incorrecto muestra un mensaje genérico", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill("unknown@example.test");
  await page
    .getByLabel("Contraseña", { exact: true })
    .fill("incorrect-password");
  await page.getByRole("button", { name: "Entrar en mi espacio" }).click();
  await expect(page.locator(".login-form").getByRole("alert")).toContainText(
    "Email o contraseña incorrectos",
  );
});
test("estrellas, etiquetas, ofertas recientes, filas y accesos rápidos", async ({
  page,
}, testInfo) => {
  const suffix = testInfo.project.name + "-" + Date.now();
  const company = "Empresa controles " + suffix;
  const oldTitle = "Oferta anterior " + suffix;
  const newTitle = "Oferta reciente " + suffix;
  const customTechnology = "Tecnología propia " + suffix;
  await login(page);
  await page.goto("/companies?new=1");
  await page.getByLabel("Nombre", { exact: false }).fill(company);
  const fourthStar = page.getByRole("radio", { name: "4 estrellas" });
  if (testInfo.project.name === "desktop") {
    await fourthStar.hover();
    await expect(page.locator(".rating-active")).toHaveCount(4);
  }
  await fourthStar.click();
  await expect(fourthStar).toHaveAttribute("aria-checked", "true");
  await save(page);

  for (const title of [oldTitle, newTitle]) {
    await page.goto("/offers?new=1");
    await page.getByLabel("Puesto").fill(title);
    await choose(page, /^Empresa/, company);
    if (title === newTitle) {
      await page.getByLabel("Tecnologías").fill("Ang");
      await page
        .getByRole("dialog")
        .getByRole("button", { name: /Angular/ })
        .click();
      await expect(page.getByText("Angular", { exact: true })).toBeVisible();
      await page.getByLabel("Tecnologías").fill(customTechnology);
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Añadir", exact: true })
        .click();
      await expect(
        page.getByText(customTechnology, { exact: true }),
      ).toBeVisible();
    }
    await save(page);
  }

  await page.goto("/offers");
  if (testInfo.project.name === "desktop") {
    await page
      .locator("tbody tr:visible")
      .filter({ hasText: newTitle })
      .locator("td")
      .nth(1)
      .click();
  } else {
    await page
      .locator(".mobile-record:visible")
      .filter({ hasText: newTitle })
      .locator(".mobile-record-bottom")
      .click();
  }
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Cerrar panel" }).click();
  await page
    .getByRole("button", { name: "Crear candidatura para " + newTitle })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Mostrar ofertas" }).click();
  const offers = await page.getByRole("option").allTextContents();
  expect(offers.findIndex((offer) => offer.includes(newTitle))).toBeLessThan(
    offers.findIndex((offer) => offer.includes(oldTitle)),
  );
  await page.getByRole("combobox", { name: "Oferta" }).fill(oldTitle);
  await expect(
    page.getByRole("option").filter({ hasText: oldTitle }),
  ).toHaveCount(1);
  await page.screenshot({
    path: "test-results/offer-picker-" + testInfo.project.name + ".png",
  });
  await expect(
    page.getByRole("option").filter({ hasText: newTitle }),
  ).toHaveCount(0);
  await page.getByRole("combobox", { name: "Oferta" }).fill(newTitle);
  await page.getByRole("option").filter({ hasText: newTitle }).click();
  await save(page);
  await openNamed(page, newTitle);
  await createLinkedAction(
    page,
    "Acción controles " + suffix,
    "2026-10-10T10:00",
  );

  await page.goto("/offers");
  await page.getByRole("textbox", { name: "Buscar ofertas" }).fill(suffix);
  await choose(page, "Filtrar ofertas por candidatura", "Candidatura enviada");
  await expect(
    page.getByText(newTitle, { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  await expect(
    page.getByText(oldTitle, { exact: true }).filter({ visible: true }),
  ).toHaveCount(0);
  await choose(page, "Filtrar ofertas por candidatura", "Sin candidatura");
  await expect(
    page.getByText(oldTitle, { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  await expect(
    page.getByText(newTitle, { exact: true }).filter({ visible: true }),
  ).toHaveCount(0);
  await choose(page, "Filtrar ofertas por candidatura", "Todas las ofertas");
  await expect(
    page.getByText(newTitle, { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Crear candidatura para " + newTitle }),
  ).toHaveCount(0);
  await expect(
    page
      .getByRole("button", { name: "Crear candidatura para " + oldTitle })
      .filter({ visible: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: "test-results/offer-buttons-" + testInfo.project.name + ".png",
  });

  await page.goto("/applications");
  await expect(page.getByLabel("Filtrar por estado")).toHaveCount(0);
  await page.getByRole("tab", { name: /^Enviada/ }).click();
  await openNamed(page, newTitle);
  await choose(page, "Estado", "Primer contacto");
  await save(page);
  await page.getByRole("tab", { name: /^Primer contacto/ }).click();
  await expect(
    page.getByText(newTitle, { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: "test-results/application-tabs-" + testInfo.project.name + ".png",
  });

  const contactName = "Contacto controles " + suffix;
  await page.goto("/contacts?new=1");
  await page.getByLabel("Nombre", { exact: false }).fill(contactName);
  await save(page);
  await openNamed(page, contactName);
  await createLinkedAction(
    page,
    "Contactar con " + contactName,
    "2026-10-11T10:00",
  );
  await page.goto("/dashboard");
  await expect(page.locator(".action-list")).toBeVisible();
  const expand = page.getByRole("button", { name: /Ver todas las acciones/ });
  const hasMore = await expand.isVisible();
  if (hasMore) {
    await expand.click();
    await expect(
      page.getByRole("button", { name: "Mostrar menos" }),
    ).toBeVisible();
  }
  await page
    .getByRole("button", {
      name: "Completar: Acción controles " + suffix,
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Completar: Acción controles " + suffix,
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", {
      name: "Completado: Acción controles " + suffix,
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator(".action-completed")).not.toHaveCount(0);
  if (hasMore)
    await expect(
      page.getByRole("button", { name: "Mostrar menos" }),
    ).toBeVisible();
  await page
    .getByRole("button", {
      name: "Completar: Contactar con " + contactName,
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Completar: Contactar con " + contactName,
      exact: true,
    }),
  ).toHaveCount(0);

  const backup = await (await page.request.get("/api/export")).json();
  const savedOffer = backup.offers.find(
    (offer: { title: string }) => offer.title === newTitle,
  );
  const savedApplication = backup.applications.find(
    (application: { jobOfferId: string }) =>
      application.jobOfferId === savedOffer.id,
  );
  expect(savedApplication.nextAction).toBe("");
  expect(savedApplication.nextActionDueAt).toBeNull();
  expect(
    backup.contacts.find(
      (contact: { name: string }) => contact.name === contactName,
    ).followUpAt,
  ).toBeNull();
  expect(backup.technologyTags).toContain(customTechnology);
  expect(
    backup.offers.find((offer: { title: string }) => offer.title === newTitle)
      .technologies,
  ).toEqual(["Angular", customTechnology]);

  await page.goto("/dashboard");
  const help = page.getByLabel("Ver accesos directos");
  if (testInfo.project.name === "desktop") await help.hover();
  else await help.click();
  await expect(page.locator(".shortcut-panel table")).toBeVisible();
  for (const [key, section] of [
    ["e", "companies"],
    ["o", "offers"],
    ["c", "applications"],
    ["v", "networking"],
    ["p", "contacts"],
  ]) {
    await page.keyboard.press("Control+Alt+" + key);
    await expect(page).toHaveURL(new RegExp(`/${section}\\?new=1`));
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("button", { name: "Cerrar panel" }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
  }
});
test("flujo completo persistente de empresas, ofertas, candidaturas, contactos y eventos", async ({
  page,
}, testInfo) => {
  // Five domains, repeated edits and all backup formats need room for cold Windows dev builds.
  test.setTimeout(240000);
  const suffix = testInfo.project.name + "-" + Date.now();
  const company = "Acme " + suffix,
    title = "Developer " + suffix,
    contact = "Sam " + suffix,
    event = "Meetup " + suffix;
  await login(page);
  await page.goto("/companies?new=1");
  await page.getByLabel("Nombre", { exact: false }).fill(company);
  await page.getByLabel("Web", { exact: true }).fill("example.com");
  await page.getByLabel("Ubicación", { exact: true }).fill("Alicante");
  await choose(page, "Modalidad", "Remoto");
  await page
    .getByLabel("Notas", { exact: true })
    .fill("Empresa ficticia para pruebas.");
  await save(page);
  await page.reload();
  await expect(
    page.getByText(company, { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  await expect(
    page
      .locator(".record-identity:visible")
      .filter({ hasText: company })
      .first()
      .locator(".company-logo"),
  ).toHaveAttribute("data-favicon-url", "");
  await page.goto("/offers?new=1");
  await page.getByLabel("Puesto").fill(title);
  await choose(page, /^Empresa/, company);
  await page.getByLabel("Salario mínimo anual").fill("35000");
  await page.getByLabel("Salario máximo anual").fill("45000");
  await page.getByLabel("Tecnologías").fill("React, TypeScript");
  await save(page);
  await expect(
    page
      .locator(".record-identity:visible")
      .filter({ hasText: title })
      .first()
      .locator(".company-logo"),
  ).toHaveAttribute("data-favicon-url", "");
  await openNamed(page, title);
  await expect(
    page.getByRole("dialog").locator(".record-meta .company-logo"),
  ).toHaveAttribute("data-favicon-url", "");
  await page.getByRole("link", { name: "Registrar candidatura" }).click();
  await expect(
    page.getByRole("heading", { name: "Nueva candidatura", exact: true }),
  ).toBeVisible();
  await save(page);
  await openNamed(page, title);
  await createLinkedAction(page, "Preparar entrevista", "2026-10-10T10:00");
  await page.goto("/applications");
  await openNamed(page, title);
  await choose(page, "Estado", "Entrevista");
  const longNotes =
    "NotasSinEspacios".repeat(200) + "\nContenido final de las notas.";
  await page.getByLabel("Notas", { exact: true }).fill(longNotes);
  await save(page);
  await openNamed(page, title);
  await expect(
    page.getByRole("button", { name: "Desplegar notas completas" }),
  ).toBeVisible();
  await expect(page.locator(".notes-preview")).not.toContainText(
    "Contenido final",
  );
  await page.getByRole("button", { name: "Desplegar notas completas" }).click();
  await expect(page.getByLabel("Notas", { exact: true })).toHaveValue(
    longNotes,
  );
  expect(
    await page
      .getByLabel("Notas", { exact: true })
      .evaluate((node) => node.scrollWidth <= node.clientWidth),
  ).toBe(true);
  await page.getByRole("button", { name: "Plegar notas" }).click();
  // Guardar con las notas plegadas debe conservar su contenido completo.
  await save(page);
  await openNamed(page, title);
  await page.getByRole("button", { name: "Desplegar notas completas" }).click();
  await expect(page.getByLabel("Notas", { exact: true })).toHaveValue(
    longNotes,
  );
  await expect(
    page.getByText("Estado: Entrevista", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Candidatura registrada", { exact: true }),
  ).toBeVisible();
  const mistaken = "Nota equivocada " + suffix;
  const recent = "Recruiter confirmó " + suffix;
  await page.getByLabel("Título de actividad").fill(mistaken);
  await page.getByRole("button", { name: "Añadir al historial" }).click();
  const mistakenRow = page
    .locator(".timeline li")
    .filter({ hasText: mistaken });
  await expect(mistakenRow).toBeVisible();
  await mistakenRow.getByRole("button", { name: /Eliminar entrada/ }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await mistakenRow.screenshot({
    path: "test-results/history-confirm-" + testInfo.project.name + ".png",
  });
  await mistakenRow.getByRole("button", { name: "Sí, borrar entrada" }).click();
  await expect(mistakenRow).toHaveCount(0);
  await page.getByLabel("Título de actividad").fill(recent);
  const details =
    "DetallesSinEspacios".repeat(200) + "\nFin de los detalles completos.";
  await page.getByLabel("Detalles", { exact: true }).fill(details);
  await page.getByRole("button", { name: "Añadir al historial" }).click();
  await expect(page.getByText(recent, { exact: true })).toBeVisible();
  const activity = page.locator(".timeline li").filter({ hasText: recent });
  await expect(activity).not.toContainText("Fin de los detalles completos.");
  await activity
    .getByRole("button", { name: "Ver detalles de " + recent })
    .click();
  await expect(activity.locator(".expandable-text p")).toHaveText(details);
  expect(
    await activity.evaluate((node) => node.scrollWidth <= node.clientWidth),
  ).toBe(true);
  await activity
    .getByRole("button", { name: "Ocultar detalles de " + recent })
    .click();
  await expect(activity).not.toContainText("Fin de los detalles completos.");
  await page.getByRole("button", { name: "Cerrar panel" }).click();
  await page.goto("/contacts?new=1");
  await page.getByLabel("Nombre", { exact: false }).fill(contact);
  await choose(page, "Empresa", company);
  await page.getByLabel("Email", { exact: true }).fill("sam@example.test");
  await save(page);
  await page.goto("/networking?new=1");
  await page.getByLabel("Nombre", { exact: false }).fill(event);
  await page.getByLabel("Empieza").fill("2026-11-10T17:00");
  await page.getByLabel(company, { exact: true }).check();
  await page.getByLabel(contact, { exact: true }).check();
  await save(page);
  await page.goto("/search?q=" + encodeURIComponent(suffix));
  await expect(page.getByText(event, { exact: true })).toBeVisible();
  await page.goto("/dashboard");
  await expect(page.locator(".action-list")).toBeVisible();
  const allActions = page.getByRole("button", {
    name: /Ver todas las acciones/,
  });
  if (await allActions.isVisible()) await allActions.click();
  await expect(
    page.locator(".action-list").getByText("Preparar entrevista").first(),
  ).toBeVisible();
  const recentRow = page
    .locator(".recent-activity li")
    .filter({ hasText: recent });
  await expect(recentRow).toBeVisible();
  await expect(
    recentRow.getByRole("button", { name: /Eliminar entrada/ }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: "test-results/dashboard-" + testInfo.project.name + ".png",
    fullPage: true,
  });
  const response = await page.request.get("/api/export");
  expect(response.ok()).toBeTruthy();
  const backup = await response.json();
  expect(
    backup.companies.some((r: { name: string }) => r.name === company),
  ).toBeTruthy();
  expect(JSON.stringify(backup)).not.toContain("passwordHash");
  expect(JSON.stringify(backup)).not.toContain(mistaken);
  expect(JSON.stringify(backup)).toContain(recent);
  expect(
    backup.companies.find((r: { name: string }) => r.name === company)
      ?.faviconUrl,
  ).toBe("");
  await page.goto("/companies");
  await openNamed(page, company);
  await page.getByRole("button", { name: "Archivar", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.getByRole("button", { name: /Archivados/ }).click();
  await expect(
    page.getByText(company, { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  await openNamed(page, company);
  await page.getByRole("button", { name: "Restaurar", exact: true }).click();
  await page.getByRole("button", { name: /Todos los registros/ }).click();
  await openNamed(page, company);
  await page.getByRole("button", { name: "Eliminar", exact: true }).click();
  await page.getByRole("button", { name: "Sí, eliminar" }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "asociados",
  );
  await page.getByRole("button", { name: "Cerrar panel" }).click();
  await page.goto("/networking");
  await openNamed(page, event);
  await page.getByRole("button", { name: "Eliminar", exact: true }).click();
  await page.getByRole("button", { name: "Sí, eliminar" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.reload();
  await expect(page.getByText(event, { exact: true })).toHaveCount(0);
  await page.goto("/settings");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await page.getByRole("button", { name: "Activar modo oscuro" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("button", { name: "Oscuro" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.screenshot({
    path: "test-results/settings-dark-" + testInfo.project.name + ".png",
    fullPage: true,
  });
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.goto("/dashboard");
  await expect(page.locator(".dashboard-date")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Activar modo claro" }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/dashboard-dark-" + testInfo.project.name + ".png",
    fullPage: true,
  });
  await page.goto("/settings");
  await page.getByRole("button", { name: "Claro", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await choose(page, "Formato", "Informe PDF");
  await expect(
    page.getByRole("button", { name: "Descargar PDF" }),
  ).toHaveAttribute("data-export-url", "/api/export?format=json&render=client");
  const pdf = await page.request.get("/api/export?format=pdf");
  expect(pdf.ok()).toBe(true);
  expect(pdf.headers()["content-type"]).toContain("application/pdf");
  expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");

  await choose(page, "Formato", "Hojas CSV");
  const zipResponse = await page.request.get(
    "/api/export?format=csv&section=all",
  );
  expect(zipResponse.ok()).toBe(true);
  const zip = await JSZip.loadAsync(await zipResponse.body());
  expect(Object.keys(zip.files).sort()).toEqual([
    "candidaturas.csv",
    "contactos.csv",
    "empresas.csv",
    "finalizaciones.csv",
    "historial.csv",
    "networking.csv",
    "ofertas.csv",
    "tareas.csv",
  ]);
  expect(await zip.file("empresas.csv")!.async("string")).toContain(company);
  const oneCsv = await page.request.get(
    "/api/export?format=csv&section=companies",
  );
  expect(oneCsv.headers()["content-type"]).toContain("text/csv");
  expect(await oneCsv.text()).toContain(company);

  page.on("dialog", (dialog) => dialog.accept());
  await page.getByLabel("Archivo de backup").setInputFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(backup)),
  });
  await page.getByRole("button", { name: "Restaurar datos" }).click();
  await expect(page.getByRole("status")).toContainText("1 registros nuevos");
  const firstRestore = await (await page.request.get("/api/export")).json();
  expect(
    firstRestore.networking.filter((r: { name: string }) => r.name === event),
  ).toHaveLength(1);
  await page.getByRole("button", { name: "Restaurar datos" }).click();
  await expect(page.getByRole("status")).toContainText("0 registros nuevos");
  const secondRestore = await (await page.request.get("/api/export")).json();
  expect(
    secondRestore.networking.filter((r: { name: string }) => r.name === event),
  ).toHaveLength(1);
});
