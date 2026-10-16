import {
  _electron as electron,
  test,
  expect,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { fileURLToPath } from "node:url";
import {
  mkdtempSync,
  rmSync,
  readFileSync,
  writeFileSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { Command } from "../src/shared/contracts";
import { backupSchema } from "../../../packages/domain/backup";

function launch(data: string) {
  const env: Record<string, string> = {
    ...process.env,
    MAPPLEO_DESKTOP_TEST_DATA: data,
    MAPPLEO_DESKTOP_HIDE_WINDOW: "1",
  };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.MAPPLEO_DESKTOP_DEV_URL;
  return electron.launch({
    executablePath:
      process.env.MAPPLEO_DESKTOP_PACKAGED_EXE ??
      fileURLToPath(
        new URL("../node_modules/electron/dist/electron.exe", import.meta.url),
      ),
    args: process.env.MAPPLEO_DESKTOP_PACKAGED_EXE ? [] : ["."],
    cwd: process.cwd(),
    env,
  });
}
async function command(page: Page, input: Command) {
  const result = await page.evaluate((c) => window.mappleo.command(c), input);
  if (!result.ok) throw new Error(result.error);
  return result.data;
}
async function snapshot(page: Page) {
  const result = await page.evaluate(() => window.mappleo.snapshot());
  if (!result.ok) throw new Error(result.error);
  return result.data;
}
async function profile(page: Page) {
  await page.getByLabel("¿Cómo te llamas?").fill("John Windows");
  await page.getByRole("button", { name: "Crear mi espacio local" }).click();
  await expect(page.getByRole("navigation")).toBeVisible();
}
async function seed(page: Page) {
  await command(page, {
    action: "save",
    kind: "companies",
    input: {
      name: "Empresa de prueba",
      websiteUrl: "https://example.com",
      careersUrl: "",
      linkedinUrl: "",
      location: "Alicante",
      workMode: "REMOTE",
      sector: "IT",
      interestRating: 4,
      tags: [],
      notes: "Notas",
    },
  });
  const s = await snapshot(page),
    c = s.workspace.companies[0];
  await command(page, {
    action: "save",
    kind: "offers",
    input: {
      companyId: c.id,
      title: "Frontend Developer",
      url: "",
      source: "LINKEDIN",
      location: "Alicante",
      workMode: "REMOTE",
      salaryMin: null,
      salaryMax: null,
      salaryCurrency: "EUR",
      description: "Descripción de oferta",
      notes: "",
      technologies: ["React"],
      interestRating: 4,
      publishedAt: null,
      deadlineAt: null,
    },
  });
  const o = (await snapshot(page)).workspace.offers[0];
  await command(page, {
    action: "save",
    kind: "applications",
    input: {
      jobOfferId: o.id,
      status: "INTERVIEW",
      appliedAt: new Date().toISOString(),
      firstResponseAt: null,
      cvVersion: "CV",
      coverLetterUsed: false,
      notes: "Notas de candidatura",
    },
  });
  await page.reload();
  const application = (await snapshot(page)).workspace.applications[0];
  await command(page, {
    action: "save",
    kind: "tasks",
    input: {
      title: "Preparar entrevista",
      columnId: (await snapshot(page)).workspace.boardColumns![0].id,
      links: [
        {
          kind: "applications",
          recordId: application.id,
          label: "Candidatura",
        },
      ],
    },
  });
  await expect(page.getByRole("navigation")).toBeVisible();
}
function cleanup(path: string) {
  const base = resolve(tmpdir()) + "\\mappleo-electron-";
  if (!resolve(path).startsWith(base))
    throw new Error("Unexpected test directory");
  rmSync(path, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 250,
  });
}

test("local documents preview, offer links, task sheet, column destination and confirmed profile reset", async () => {
  const path = mkdtempSync(join(tmpdir(), "mappleo-electron-"));
  let app: ElectronApplication | undefined;
  try {
    const chunks = ["%PDF-1.4\n"],
      offsets = [0];
    const objects = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 250 250] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ];
    const content = "BT /F1 18 Tf 30 180 Td (CV local privado) Tj ET";
    objects.push(
      `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    );
    objects.forEach((o, i) => {
      offsets.push(Buffer.byteLength(chunks.join("")));
      chunks.push(`${i + 1} 0 obj\n${o}\nendobj\n`);
    });
    const xref = Buffer.byteLength(chunks.join(""));
    chunks.push(
      `xref\n0 6\n0000000000 65535 f \n${offsets
        .slice(1)
        .map((n) => String(n).padStart(10, "0") + " 00000 n \n")
        .join(
          "",
        )}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`,
    );
    const source = join(path, "cv-prueba.pdf");
    writeFileSync(source, chunks.join(""));
    app = await launch(path);
    const page = await app.firstWindow();
    await profile(page);
    await seed(page);
    await app.evaluate(({ dialog }, source) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [source],
      });
      dialog.showMessageBox = async () => ({
        response: 1,
        checkboxChecked: false,
      });
    }, source);
    await page.getByRole("button", { name: "Archivos", exact: true }).click();
    await page
      .getByRole("button", { name: "Añadir archivo", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect
      .poll(
        () =>
          page
            .locator("canvas")
            .evaluate((c) => (c as HTMLCanvasElement).width),
        {
          timeout: 30000,
        },
      )
      .toBeGreaterThan(100);
    await expect
      .poll(
        () =>
          page.locator("canvas").evaluate((element) => {
            const c = element as HTMLCanvasElement;
            const ctx = c.getContext("2d")!;
            return ctx
              .getImageData(0, 0, c.width, c.height)
              .data.some((v, i) => i % 4 !== 3 && v < 200);
          }),
        { timeout: 30000 },
      )
      .toBe(true);
    await page.getByPlaceholder("Buscar oferta o empresa…").fill("Frontend");
    await page.getByLabel("Frontend Developer", { exact: true }).check();
    await page
      .getByRole("button", { name: "Guardar enlaces y nombre" })
      .click();
    const files = await page.evaluate(() => window.mappleo.listDocuments());
    expect(files.ok && files.data[0].offerIds).toHaveLength(1);
    expect(JSON.stringify((await snapshot(page)).workspace)).not.toContain(
      "cv-prueba.pdf",
    );
    await page.getByRole("button", { name: "Cerrar archivo" }).click();
    await page.getByRole("button", { name: "Ofertas", exact: true }).click();
    await page
      .getByRole("button", { name: /Abrir Frontend Developer/ })
      .click();
    await expect(
      page.getByText("cv-prueba.pdf", { exact: true }),
    ).toBeVisible();
    const offerSheet = page.locator(".record-sheet");
    await expect(offerSheet).toBeVisible();
    expect(
      await offerSheet
        .locator(".local-files")
        .evaluate(
          (files) =>
            !!files.previousElementSibling?.classList.contains("detail-layout"),
        ),
    ).toBe(true);
    await offerSheet
      .getByRole("button", { name: "Editar", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Guardar cambios", exact: true })
      .click();
    await expect(offerSheet).toBeVisible();
    await offerSheet
      .getByRole("button", { name: "cv-prueba.pdf", exact: false })
      .click();
    await expect(page.locator(".document-sheet")).toBeVisible();
    await page.getByRole("button", { name: "Cerrar archivo" }).click();
    await expect(offerSheet).toBeVisible();
    await page
      .getByRole("button", { name: "Crear acción", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.locator(".task-sheet")).toBeVisible();
    await page
      .getByLabel("Título", { exact: false })
      .fill("Acción desde oferta");
    await page
      .getByRole("button", { name: "Guardar cambios", exact: true })
      .click();
    expect(
      (await snapshot(page)).workspace.tasks!.find(
        (t) => t.title === "Acción desde oferta",
      )!.links[0].kind,
    ).toBe("offers");
    await page
      .locator(".kanban-card")
      .filter({ hasText: "Acción desde oferta" })
      .click();
    await expect(page.locator(".task-sheet")).toBeVisible();
    await page.getByRole("button", { name: "Eliminar", exact: true }).click();
    await page
      .getByRole("button", { name: "Sí, eliminar", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toBeHidden();
    await page
      .getByRole("button", { name: "Editar columna Completadas", exact: true })
      .click();
    await page.getByRole("button", { name: "Eliminar", exact: true }).click();
    await page
      .getByRole("button", { name: "Sí, eliminar", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toBeHidden();
    expect(
      (await snapshot(page)).workspace.boardColumns!.filter((c) => c.isDone),
    ).toHaveLength(1);
    expect((await snapshot(page)).workspace.boardColumns).toHaveLength(2);
    await page
      .getByRole("button", { name: "Configuración", exact: true })
      .click();
    await page
      .getByLabel("Escribe BORRAR LOCAL para confirmar")
      .fill("BORRAR LOCAL");
    await page
      .getByRole("button", { name: "Borrar cuenta local y empezar de cero" })
      .click();
    await expect(
      page.getByRole("button", { name: "Crear mi espacio local" }),
    ).toBeVisible();
    const reset = await snapshot(page);
    expect(reset.profile).toBeNull();
    expect(reset.workspace.companies).toHaveLength(0);
    expect(reset.pendingChanges).toBe(0);
    await profile(page);
    const cleared = await page.evaluate(() => window.mappleo.listDocuments());
    expect(cleared.ok && cleared.data).toHaveLength(0);
  } finally {
    if (app) await app.close();
    cleanup(path);
  }
});

test("record sheets preserve the collection and Kanban scroll reaches the last column in a narrow window", async () => {
  const path = mkdtempSync(join(tmpdir(), "mappleo-electron-"));
  let app: ElectronApplication | undefined;
  try {
    app = await launch(path);
    const page = await app.firstWindow();
    await profile(page);
    await seed(page);
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setSize(1000, 700),
    );
    for (const section of ["Empresas", "Ofertas", "Candidaturas"]) {
      await page
        .getByRole("navigation")
        .getByRole("button", { name: section, exact: true })
        .click();
      const collection = page.locator("main .table-wrap");
      await expect(collection).toBeVisible();
      await collection
        .getByRole("button", { name: /^Abrir / })
        .first()
        .click();
      const sheet = page.locator(".record-sheet");
      await expect(sheet).toBeVisible();
      const box = await sheet.boundingBox();
      expect(box!.x).toBeGreaterThan(100);
      expect(await collection.count()).toBe(1);
      if (section === "Candidaturas") {
        await expect(
          sheet.getByRole("heading", {
            name: "Archivos de la oferta vinculada",
          }),
        ).toBeVisible();
        expect(
          await sheet
            .locator(".local-files")
            .evaluate(
              (files) =>
                !!files.previousElementSibling?.classList.contains(
                  "detail-layout",
                ),
            ),
        ).toBe(true);
      }
      await page.keyboard.press("Escape");
      await expect(sheet).toBeHidden();
      await expect(collection).toBeVisible();
    }
    for (let i = 0; i < 5; i++)
      await command(page, {
        action: "save",
        kind: "boardColumns",
        input: { name: "Columna extra " + i, position: 3 + i, isDone: false },
      });
    await page.reload();
    await page
      .getByRole("navigation")
      .getByRole("button", { name: "Kanban", exact: true })
      .click();
    const board = page.locator(".kanban");
    const dimensions = await board.evaluate((el) => ({
      width: el.clientWidth,
      scrollWidth: el.scrollWidth,
      bottom: el.getBoundingClientRect().bottom,
      windowHeight: window.innerHeight,
      pageWidth: document.documentElement.scrollWidth,
      windowWidth: window.innerWidth,
    }));
    expect(dimensions.scrollWidth).toBeGreaterThan(dimensions.width);
    expect(dimensions.bottom).toBeLessThanOrEqual(dimensions.windowHeight);
    expect(dimensions.pageWidth).toBeLessThanOrEqual(dimensions.windowWidth);
    await board.evaluate((el) => {
      el.scrollLeft = el.scrollWidth;
    });
    await expect
      .poll(() => board.evaluate((el) => el.scrollLeft))
      .toBeGreaterThan(0);
    const last = await board.locator(".kanban-column").last().boundingBox();
    const bounds = await board.boundingBox();
    expect(last!.x + last!.width).toBeLessThanOrEqual(
      bounds!.x + bounds!.width + 1,
    );
    expect(last!.x).toBeGreaterThanOrEqual(bounds!.x);
  } finally {
    if (app) await app.close();
    cleanup(path);
  }
});

test("offline window: onboarding, real CRUD forms, search, shortcuts, calendar, statistics and persistence", async () => {
  const path = mkdtempSync(join(tmpdir(), "mappleo-electron-"));
  let app: ElectronApplication | undefined;
  try {
    app = await launch(path);
    let page = await app.firstWindow();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.context().setOffline(true);
    await profile(page);
    await page
      .getByRole("navigation")
      .getByRole("button", { name: "Empresas" })
      .click();
    await page
      .getByRole("button", { name: "Nueva empresa", exact: true })
      .click();
    await page
      .getByLabel("Nombre", { exact: false })
      .last()
      .fill("Empresa offline");
    await page.getByLabel("Web", { exact: true }).fill("https://example.com");
    await page.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(
      page.getByRole("button", { name: "Abrir Empresa offline" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Abrir Empresa offline" }).click();
    await expect(
      page.getByRole("heading", { name: "Empresa offline", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Cerrar ficha", exact: true })
      .click();
    await seed(page);
    await page.getByLabel("Buscar en todo Mappleo").fill("Frontend");
    await expect(
      page
        .locator(".global-results")
        .getByText("Frontend Developer", { exact: true })
        .first(),
    ).toBeVisible();
    await page.getByLabel("Buscar en todo Mappleo").fill("zzzz-absent");
    await expect(page.locator(".global-results")).toContainText(
      "No hay resultados",
    );
    await page.getByLabel("Buscar en todo Mappleo").fill("");
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
    await page.keyboard.press("Escape");
    await page
      .getByRole("navigation")
      .getByRole("button", { name: "Hoy", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Calendario", exact: true }),
    ).toBeVisible();
    await expect(
      page.locator(".metric").filter({ hasText: "En entrevista" }),
    ).toContainText("1");
    await page.getByRole("button", { name: "Mes siguiente" }).click();
    await page.getByRole("button", { name: "Mes anterior" }).click();
    await page
      .getByRole("navigation")
      .getByRole("button", { name: "Estadísticas" })
      .click();
    await expect(
      page.getByRole("heading", { name: "Candidaturas por mes" }),
    ).toBeVisible();
    await page.getByLabel("Activar modo oscuro").click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].showInactive(),
    );
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    const statisticsImage = await app.evaluate(async ({ BrowserWindow }) =>
      (
        await BrowserWindow.getAllWindows()[0].webContents.capturePage(
          undefined,
          { stayHidden: true, stayAwake: true },
        )
      )
        .toPNG()
        .toString("base64"),
    );
    writeFileSync(
      "test-results/windows-statistics.png",
      Buffer.from(statisticsImage, "base64"),
    );
    expect(
      await page.evaluate(() => ({
        node: typeof (window as unknown as Record<string, unknown>).require,
        ipc: typeof (window as unknown as Record<string, unknown>).ipcRenderer,
      })),
    ).toEqual({ node: "undefined", ipc: "undefined" });
    const before = (await snapshot(page)).workspace;
    await app.close();
    app = await launch(path);
    page = await app.firstWindow();
    await page.context().setOffline(true);
    await expect(page.getByRole("navigation")).toBeVisible();
    const after = (await snapshot(page)).workspace;
    expect(after.companies.length).toBe(before.companies.length);
    expect(after.applications.length).toBe(1);
    expect(errors).toEqual([]);
  } finally {
    if (app) await app.close();
    cleanup(path);
  }
});

test("Kanban full-card drag, column preview, reminders and history work offline", async () => {
  const path = mkdtempSync(join(tmpdir(), "mappleo-electron-"));
  let app: ElectronApplication | undefined;
  try {
    app = await launch(path);
    const page = await app.firstWindow();
    await page.context().setOffline(true);
    await profile(page);
    await seed(page);
    await page
      .getByRole("navigation")
      .getByRole("button", { name: "Kanban", exact: true })
      .click();
    const card = page
      .locator(".kanban-card")
      .filter({ hasText: "Preparar entrevista" });
    await expect(card).toBeVisible();
    const target = page.locator(".kanban-column").filter({
      has: page.getByRole("heading", { name: "En marcha", exact: true }),
    });
    await card.dragTo(target.locator(".kanban-cards"));
    await expect(target.locator(".kanban-card")).toContainText(
      "Preparar entrevista",
    );
    await target
      .getByRole("button", {
        name: "Completar Preparar entrevista",
        exact: true,
      })
      .click();
    await expect(
      page
        .locator(".kanban-column")
        .filter({
          has: page.getByRole("heading", { name: "Completadas", exact: true }),
        })
        .locator(".kanban-card"),
    ).toContainText("Preparar entrevista");
    const state = await snapshot(page);
    expect(state.workspace.applications[0].nextAction).toBe("");
    expect(state.workspace.taskCompletions).toHaveLength(1);
    await page
      .getByRole("button", { name: "Añadir tarea en Pendientes" })
      .click();
    await page
      .getByLabel("Título", { exact: false })
      .fill("Tarea offline nueva");
    await page.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(
      page.locator(".kanban-card").filter({ hasText: "Tarea offline nueva" }),
    ).toBeVisible();
    await expect(page.getByRole("dialog")).toBeHidden();
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].showInactive(),
    );
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    const boardImage = await app.evaluate(async ({ BrowserWindow }) =>
      (
        await BrowserWindow.getAllWindows()[0].webContents.capturePage(
          undefined,
          { stayHidden: true, stayAwake: true },
        )
      )
        .toPNG()
        .toString("base64"),
    );
    writeFileSync(
      "test-results/windows-kanban.png",
      Buffer.from(boardImage, "base64"),
    );
  } finally {
    if (app) await app.close();
    cleanup(path);
  }
});

test("native import/export, idempotent JSON restore, PDF output and blocked external requests", async () => {
  const path = mkdtempSync(join(tmpdir(), "mappleo-electron-"));
  let app: ElectronApplication | undefined;
  try {
    app = await launch(path);
    const page = await app.firstWindow();
    await page.context().setOffline(true);
    await profile(page);
    await seed(page);
    const jsonPath = join(path, "roundtrip.json"),
      csvPath = join(path, "companies.csv"),
      pdfPath = join(path, "report.pdf");
    await app.evaluate(({ dialog }, file) => {
      dialog.showMessageBox = async () => ({
        response: 1,
        checkboxChecked: false,
      });
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
    }, jsonPath);
    const exported = await page.evaluate(() =>
      window.mappleo.exportFile("json"),
    );
    expect(exported.ok).toBe(true);
    backupSchema.parse(JSON.parse(readFileSync(jsonPath, "utf8")));
    await app.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [file],
      });
    }, jsonPath);
    const first = await page.evaluate(() => window.mappleo.importBackup()),
      second = await page.evaluate(() => window.mappleo.importBackup());
    expect(first.ok && first.data?.added).toBe(0);
    expect(second.ok && second.data?.added).toBe(0);
    await app.evaluate(({ dialog }, file) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
    }, csvPath);
    expect(
      (await page.evaluate(() => window.mappleo.exportFile("csv", "companies")))
        .ok,
    ).toBe(true);
    expect(readFileSync(csvPath, "utf8")).toContain("Empresa de prueba");
    await page
      .getByRole("navigation")
      .getByRole("button", { name: "Estadísticas" })
      .click();
    await app.evaluate(({ dialog }, file) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
    }, pdfPath);
    expect((await page.evaluate(() => window.mappleo.exportPdf())).ok).toBe(
      true,
    );
    expect(readFileSync(pdfPath).subarray(0, 4).toString()).toBe("%PDF");
    expect(
      (
        await page.evaluate(() =>
          window.mappleo.openExternal("file:///C:/Windows/System32/cmd.exe"),
        )
      ).ok,
    ).toBe(false);
    const original = await snapshot(page),
      invalid = {
        ...original.workspace,
        offers: [{ ...original.workspace.offers[0], companyId: "missing" }],
      };
    writeFileSync(jsonPath, JSON.stringify(invalid));
    const bad = await page.evaluate(() => window.mappleo.importBackup());
    expect(bad.ok).toBe(false);
    expect((await snapshot(page)).workspace.offers).toHaveLength(1);
    expect(existsSync(join(path, "installation-key.dpapi"))).toBe(true);
  } finally {
    if (app) await app.close();
    cleanup(path);
  }
});
