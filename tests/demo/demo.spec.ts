import { expect, test } from "@playwright/test";

for (const lang of ["es", "en"] as const)
  test(`${lang}: linked offers, applications, contacts, events and tasks are creatable`, async ({
    page,
  }) => {
    const en = lang === "en";
    await page.goto(`./${lang}/index.html`);
    const go = (name: RegExp) =>
      page.getByRole("navigation").getByRole("button", { name }).click();
    const save = async () => {
      await page
        .getByRole("dialog")
        .last()
        .getByRole("button", { name: en ? "Save changes" : "Guardar cambios" })
        .click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
    };
    await go(en ? /^Job offers/ : /^Ofertas/);
    await page
      .getByRole("button", {
        name: en ? "New job offer" : "Nueva oferta",
        exact: true,
      })
      .click();
    await page
      .getByRole("dialog")
      .getByLabel(en ? "Job title" : "Puesto", { exact: false })
      .fill("Portfolio test offer");
    await save();
    await expect(
      page.getByText("Portfolio test offer", { exact: true }),
    ).toBeVisible();
    await go(en ? /^Applications/ : /^Candidaturas/);
    await page
      .getByRole("button", {
        name: en ? "New application" : "Nueva candidatura",
        exact: true,
      })
      .click();
    await page
      .getByPlaceholder(
        en ? "Search offers or companies…" : "Buscar oferta o empresa…",
      )
      .fill("Portfolio test offer");
    await page.locator(".offer-options button").first().click();
    await save();
    await expect(
      page.getByText("Portfolio test offer", { exact: true }),
    ).toBeVisible();
    await go(en ? /^Contacts/ : /^Contactos/);
    await page
      .getByRole("button", {
        name: en ? "New contact" : "Nuevo contacto",
        exact: true,
      })
      .click();
    await page
      .getByRole("dialog")
      .getByLabel(en ? "Name" : "Nombre", { exact: false })
      .fill("Portfolio test contact");
    await save();
    await expect(
      page.getByText("Portfolio test contact", { exact: true }),
    ).toBeVisible();
    await go(/^Networking/);
    await page
      .getByRole("button", {
        name: en ? "New event" : "Nuevo evento",
        exact: true,
      })
      .click();
    await page
      .getByRole("dialog")
      .getByLabel(en ? "Name" : "Nombre", { exact: false })
      .fill("Portfolio test event");
    await save();
    await expect(
      page.getByText("Portfolio test event", { exact: true }),
    ).toBeVisible();
    await go(/^Kanban/);
    await page
      .getByRole("button", {
        name: en ? "New column" : "Nueva columna",
        exact: true,
      })
      .click();
    await page
      .getByRole("dialog")
      .getByLabel(en ? "Name" : "Nombre", { exact: false })
      .fill("Portfolio column");
    await save();
    await page
      .getByRole("button", {
        name: (en ? "Add task to " : "Añadir tarea en ") + "Portfolio column",
        exact: true,
      })
      .click();
    await page
      .getByRole("dialog")
      .getByLabel(en ? "Title" : "Título", { exact: false })
      .fill("Portfolio task");
    await save();
    await page
      .getByRole("button", {
        name: (en ? "Complete " : "Completar ") + "Portfolio task",
        exact: true,
      })
      .click();
    await expect(
      page
        .locator(".kanban-card.completed")
        .filter({ hasText: "Portfolio task" }),
    ).toBeVisible();
  });

for (const lang of ["es", "en"] as const)
  test(`${lang}: browser-only CRUD, tasks, details, expiry and no API traffic`, async ({
    page,
  }, info) => {
    const en = lang === "en",
      requests: string[] = [],
      errors: string[] = [];
    page.on("request", (req) => {
      if (
        req.resourceType() === "fetch" ||
        req.resourceType() === "xhr" ||
        req.url().includes("/api/")
      )
        requests.push(req.url());
    });
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`./${lang}/index.html`);
    await expect(page.getByRole("note")).toContainText(
      en ? "Interactive static demo" : "Demo estática interactiva",
    );
    await expect(page.getByRole("note").getByRole("button")).toHaveCount(0);
    await expect(page.getByRole("note")).not.toContainText(/\d+ min$/);
    await expect(
      page
        .getByRole("navigation")
        .getByRole("button", { name: en ? /^Companies/ : /^Empresas/ }),
    ).toBeVisible();
    await page
      .getByRole("navigation")
      .getByRole("button", { name: en ? /^Companies/ : /^Empresas/ })
      .click();
    await page
      .getByRole("button", {
        name: en ? "New company" : "Nueva empresa",
        exact: true,
      })
      .click();
    const dialog = page.getByRole("dialog").last();
    await dialog
      .getByLabel(en ? "Name" : "Nombre", { exact: false })
      .fill("Portfolio " + lang + " " + info.project.name);
    await dialog
      .getByRole("button", { name: en ? "Save changes" : "Guardar cambios" })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const name = "Portfolio " + lang + " " + info.project.name;
    await expect(page.getByText(name, { exact: true })).toBeVisible();
    await page.reload();
    await page
      .getByRole("navigation")
      .getByRole("button", { name: en ? /^Companies/ : /^Empresas/ })
      .click();
    await page.getByText(name, { exact: true }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: en ? "Edit" : "Editar", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .last()
      .getByRole("button", { name: en ? "Delete" : "Eliminar", exact: true })
      .click();
    await page
      .locator(".delete-confirm")
      .getByRole("button", {
        name: en ? "Yes, delete" : "Sí, eliminar",
        exact: true,
      })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByText(name, { exact: true })).toHaveCount(0);
    await page
      .getByRole("navigation")
      .getByRole("button", { name: "Kanban", exact: true })
      .click();
    await expect(
      page.getByRole("link", { name: /Lo siguiente|Up next/ }),
    ).toHaveCount(0);
    const card = page.locator(".kanban-card").first();
    await expect(card).toBeVisible();
    if (info.project.name === "desktop") {
      const column = page.locator(".kanban-column").nth(2);
      const title = await card.locator("strong").first().textContent();
      await card.dragTo(column);
      await expect(column).toContainText(title!);
    }
    await page
      .getByRole("navigation")
      .getByRole("button", {
        name: en ? "Statistics" : "Estadísticas",
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("heading", {
        name: en ? "Applications by month" : "Candidaturas por mes",
      }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /PDF/ })).toHaveCount(0);
    const width = await page.evaluate(() => ({
      page: document.documentElement.scrollWidth,
      viewport: innerWidth,
    }));
    expect(width.page).toBeLessThanOrEqual(width.viewport + 1);
    await page.evaluate(() => {
      const key = Object.keys(sessionStorage).find((k) =>
        k.startsWith("mappleo-portfolio-demo"),
      )!;
      const stored = JSON.parse(sessionStorage.getItem(key)!);
      stored.expiresAt = Date.now() - 1;
      sessionStorage.setItem(key, JSON.stringify(stored));
    });
    await page.reload();
    expect(await page.evaluate(() => typeof window.mappleo)).toBe("undefined");
    expect(requests).toEqual([]);
    expect(errors).toEqual([]);
    await page.screenshot({
      path: `test-results-demo/${lang}-${info.project.name}.png`,
      fullPage: true,
    });
  });

test("Spanish euro key opens company creation but never interrupts typing currency", async ({
  page,
}) => {
  await page.goto("./es/index.html");
  await page.getByRole("navigation").waitFor();
  await page.evaluate(() =>
    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "€",
        code: "",
        ctrlKey: true,
        altKey: true,
        bubbles: true,
      }),
    ),
  );
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Cerrar", exact: true }).click();
  const search = page.getByLabel("Buscar en todo Mappleo");
  await search.focus();
  await search.dispatchEvent("keydown", {
    key: "€",
    code: "KeyE",
    ctrlKey: true,
    altKey: true,
    bubbles: true,
  });
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
