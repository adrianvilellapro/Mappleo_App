import { expect, test, type Page } from "@playwright/test";

const copy = (en: boolean, es: string, english: string) => (en ? english : es);
async function go(page: Page, name: string) {
  await page
    .locator(".sidebar")
    .getByRole("link", { name, exact: true })
    .click();
  if (["Estadísticas", "Statistics"].includes(name))
    await expect(page.locator(".statistics-page")).toBeVisible();
}
async function save(page: Page, en: boolean, task = false) {
  await page
    .getByRole("dialog")
    .last()
    .getByRole("button", {
      name: task
        ? copy(en, "Guardar tarea", "Save task")
        : copy(en, "Guardar cambios", "Save changes"),
      exact: true,
    })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}
async function close(page: Page, en: boolean) {
  await page
    .getByRole("dialog")
    .getByRole("button", {
      name: copy(en, "Cerrar panel", "Close panel"),
      exact: true,
    })
    .click();
}
async function visibleRow(page: Page, title: string) {
  return page
    .locator(
      ".desktop-table:visible tbody tr, .mobile-records:visible .mobile-record",
    )
    .filter({ hasText: title })
    .first();
}

for (const lang of ["es", "en"] as const) {
  const en = lang === "en";
  test(`${lang}: actual web forms create related companies, offers, applications, contacts, events and tasks`, async ({
    page,
  }, info) => {
    await page.goto(`./${lang}/index.html`);
    const company = "Portfolio company " + info.project.name;
    const title = "Portfolio offer " + info.project.name;
    await go(page, copy(en, "Empresas", "Companies"));
    await page
      .getByRole("button", {
        name: copy(en, "Nueva empresa", "New company"),
        exact: true,
      })
      .click();
    await page
      .getByRole("dialog")
      .getByLabel(copy(en, "Nombre", "Name"), { exact: false })
      .fill(company);
    await save(page, en);
    await go(page, copy(en, "Ofertas", "Job offers"));
    await page
      .getByRole("button", {
        name: copy(en, "Nueva oferta", "New job offer"),
        exact: true,
      })
      .click();
    const offer = page.getByRole("dialog");
    await offer
      .getByLabel(copy(en, "Puesto", "Job title"), { exact: false })
      .fill(title);
    await offer.locator("#companyId").click();
    await page.getByRole("option", { name: company, exact: true }).click();
    await save(page, en);
    await go(page, copy(en, "Candidaturas", "Applications"));
    await page
      .getByRole("button", {
        name: copy(en, "Nueva candidatura", "New application"),
        exact: true,
      })
      .click();
    await page.getByRole("dialog").locator("#jobOfferId").fill(title);
    await page.getByRole("option").filter({ hasText: title }).click();
    await save(page, en);
    await expect(await visibleRow(page, title)).toBeVisible();
    await (await visibleRow(page, title)).click();
    await expect(page.locator(".sheet-content form").first()).toBeVisible();
    await page
      .getByRole("dialog")
      .getByLabel(copy(en, "Título de actividad", "Activity title"))
      .fill("Portfolio history");
    await page
      .getByRole("dialog")
      .getByRole("button", {
        name: copy(en, "Añadir al historial", "Add to history"),
      })
      .click();
    await expect(
      page.getByRole("dialog").getByText("Portfolio history", { exact: true }),
    ).toBeVisible();
    await close(page, en);
    await go(page, copy(en, "Contactos", "Contacts"));
    await page
      .getByRole("button", {
        name: copy(en, "Nuevo contacto", "New contact"),
        exact: true,
      })
      .click();
    await page
      .getByRole("dialog")
      .getByLabel(copy(en, "Nombre", "Name"), { exact: false })
      .fill("Portfolio contact");
    await save(page, en);
    await go(page, "Networking");
    await page
      .getByRole("button", {
        name: copy(en, "Nuevo evento", "New event"),
        exact: true,
      })
      .click();
    await page
      .getByRole("dialog")
      .getByLabel(copy(en, "Nombre", "Name"), { exact: false })
      .fill("Portfolio event");
    await save(page, en);
    await go(page, copy(en, "Ofertas", "Job offers"));
    await (await visibleRow(page, title)).click();
    await page
      .getByRole("dialog")
      .getByRole("link", { name: copy(en, "Crear acción", "Create action") })
      .click();
    await expect(
      page
        .getByRole("dialog")
        .getByRole("heading", { name: copy(en, "Nueva tarea", "New task") }),
    ).toBeVisible();
    await expect(
      page.getByRole("dialog").locator(".task-linked-list"),
    ).toContainText(title);
    await page
      .getByRole("dialog")
      .getByLabel(copy(en, "Título de tarea", "Task title"))
      .fill("Portfolio linked task");
    await save(page, en, true);
    const card = page
      .locator(".kanban-card")
      .filter({ hasText: "Portfolio linked task" });
    await expect(card).toBeVisible();
    await card
      .getByRole("button", {
        name: copy(
          en,
          "Completar tarea: Portfolio linked task",
          "Complete task: Portfolio linked task",
        ),
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("button", {
        name: copy(
          en,
          "Completada: Portfolio linked task",
          "Completed: Portfolio linked task",
        ),
        exact: true,
      }),
    ).toBeDisabled();
  });

  test(`${lang}: web layout, editable side sheets, calendar, settings, search and isolated cache`, async ({
    page,
  }, info) => {
    const requests: string[] = [],
      errors: string[] = [];
    page.on("request", (r) => {
      if (
        ["fetch", "xhr"].includes(r.resourceType()) ||
        r.url().includes("/api/")
      )
        requests.push(r.url());
    });
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`./${lang}/index.html`);
    await expect(page.getByRole("note")).toContainText(
      copy(en, "Demo estática interactiva", "Interactive static demo"),
    );
    await expect(page.getByRole("note").getByRole("button")).toHaveCount(0);
    await expect(page.locator(".sidebar .version")).toHaveText("BETA");
    await expect(page.locator(".shortcut-help")).toBeVisible();
    await expect(page.locator(".metric-grid .metric")).toHaveCount(4);
    const calendar = page.locator(".calendar-panel");
    await calendar.scrollIntoViewIfNeeded();
    await calendar
      .getByRole("button", { name: copy(en, "Mes anterior", "Previous month") })
      .click();
    await expect(calendar.locator(".calendar-grid")).toBeVisible();
    await go(page, copy(en, "Contactos", "Contacts"));
    await page
      .locator(
        ".desktop-table:visible tbody tr, .mobile-records:visible .mobile-record",
      )
      .first()
      .click();
    await expect(page.locator(".sheet-content .editor-body")).toBeVisible();
    await expect(
      page
        .getByRole("dialog")
        .getByLabel(copy(en, "Email", "Email"), { exact: true }),
    ).toBeVisible();
    await expect(page.locator(".record-sheet")).toHaveCount(0);
    const name = "Temporary contact " + info.project.name;
    await page
      .getByRole("dialog")
      .getByLabel(copy(en, "Nombre", "Name"), { exact: false })
      .fill(name);
    await save(page, en);
    await page.reload();
    await (await visibleRow(page, name)).click();
    await expect(
      page
        .getByRole("dialog")
        .getByLabel(copy(en, "Nombre", "Name"), { exact: false }),
    ).toHaveValue(name);
    await page
      .getByRole("dialog")
      .getByRole("button", {
        name: copy(en, "Eliminar", "Delete"),
        exact: true,
      })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", {
        name: copy(en, "Sí, eliminar", "Yes, delete"),
        exact: true,
      })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(await visibleRow(page, name)).toHaveCount(0);
    await go(page, copy(en, "Estadísticas", "Statistics"));
    await expect(
      page.getByRole("heading", {
        name: copy(en, "Estadísticas", "Statistics"),
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /PDF/ })).toBeDisabled();
    await page
      .getByRole("combobox", {
        name: copy(en, "Periodo", "Period"),
        exact: true,
      })
      .click();
    await page
      .getByRole("option", {
        name: copy(en, "Últimos 6 meses", "Last 6 months"),
        exact: true,
      })
      .click();
    await page
      .getByRole("button", {
        name: copy(en, "Aplicar filtros", "Apply filters"),
        exact: true,
      })
      .click();
    await expect(page.locator(".statistics-page")).toBeVisible();
    await go(page, copy(en, "Configuración", "Settings"));
    await expect(
      page.getByRole("heading", {
        name: copy(en, "Tu espacio, tus datos.", "Your workspace, your data."),
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page
        .getByLabel(copy(en, "Contraseña actual", "Current password"))
        .first(),
    ).toBeDisabled();
    await expect(page.locator("#import-file")).toBeDisabled();
    await expect(
      page.getByText(
        copy(en, "No hay equipos conectados.", "No connected devices."),
        { exact: true },
      ),
    ).toBeVisible();
    await page
      .getByRole("button", { name: copy(en, "Oscuro", "Dark"), exact: true })
      .click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page
      .getByRole("button", { name: copy(en, "Claro", "Light"), exact: true })
      .click();
    const search = page.getByRole("search").getByRole("textbox");
    await search.fill("Aurora");
    await search.press("Enter");
    await expect(page.locator(".search-results")).not.toHaveCount(0);
    await expect(page.locator(".search-results").first()).toContainText(
      "Aurora",
    );
    await page.evaluate(() => {
      const key = Object.keys(sessionStorage).find((k) =>
        k.startsWith("mappleo-portfolio-demo"),
      )!;
      const cached = JSON.parse(sessionStorage.getItem(key)!);
      cached.expiresAt = Date.now() - 1;
      sessionStorage.setItem(key, JSON.stringify(cached));
    });
    await page.reload();
    expect(await page.evaluate(() => typeof window.mappleo)).toBe("undefined");
    expect(requests).toEqual([]);
    expect(errors).toEqual([]);
    await page.screenshot({
      path: `test-results-demo/${lang}-web-${info.project.name}.png`,
    });
  });

  test(`${lang}: navigation remains visible at the end of long web lists`, async ({
    page,
  }) => {
    await page.goto(`./${lang}/index.html`);
    for (const name of en
      ? ["Companies", "Job offers", "Applications", "Statistics"]
      : ["Empresas", "Ofertas", "Candidaturas", "Estadísticas"]) {
      await go(page, name);
      const main = page.locator("main");
      await expect.poll(() => main.evaluate((e) => e.scrollTop)).toBe(0);
      await main.evaluate((e) => {
        e.scrollTop = e.scrollHeight;
      });
      await expect
        .poll(() => main.evaluate((e) => e.scrollTop))
        .toBeGreaterThan(100);
      await expect(page.getByRole("navigation")).toBeInViewport({ ratio: 1 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      ).toBe(true);
    }
  });
}

test("desktop: full web drag preview and task movement", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop", "Desktop pointer interaction.");
  await page.goto("./es/index.html#/kanban");
  const card = page
    .locator(".kanban-lane")
    .nth(0)
    .locator(".kanban-card")
    .first();
  const taskId = await card.getAttribute("data-task-id");
  const start = await card.locator(".task-preview").boundingBox();
  const destination = page.locator(".kanban-lane").nth(1);
  const bounds = await destination.boundingBox();
  await page.mouse.move(
    start!.x + start!.width / 2,
    start!.y + start!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(start!.x + 12, start!.y + 12, { steps: 5 });
  await expect(page.locator(".drag-preview .task-preview")).toBeVisible();
  await page.mouse.move(bounds!.x + bounds!.width / 2, bounds!.y + 70, {
    steps: 15,
  });
  await expect(destination.locator(".kanban-drop-slot")).toBeVisible();
  await page.mouse.up();
  await expect(destination.locator(`[data-task-id="${taskId}"]`)).toBeVisible();
});

test("short desktop windows can reach every web navigation entry", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop", "Desktop sidebar overflow only.");
  await page.setViewportSize({ width: 1100, height: 420 });
  await page.goto("./es/index.html");
  const statistics = page
    .getByRole("navigation")
    .getByRole("link", { name: "Estadísticas", exact: true });
  await statistics.scrollIntoViewIfNeeded();
  await expect(statistics).toBeInViewport({ ratio: 1 });
  await statistics.click();
  await page.locator(".sidebar").evaluate((e) => {
    e.scrollTop = 0;
  });
  const today = page.getByRole("navigation").getByRole("link").first();
  await expect(today).toBeInViewport({ ratio: 1 });
  await today.click();
});

test("web company shortcut supports the euro key without interrupting typed currency", async ({
  page,
}) => {
  await page.goto("./es/index.html");
  await page.locator(".topbar").waitFor();
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
  await close(page, false);
  const search = page.getByLabel("Búsqueda global");
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
