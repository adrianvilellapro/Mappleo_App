import {
  _electron as electron,
  test,
  expect,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { PrismaClient } from "../../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { encryptClient } from "../../lib/db/encrypted-client";
import type { Command } from "../../apps/windows/src/shared/contracts";
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
test("real browser authorization, initial merge, automatic sync, conflicts, restart and disconnect", async ({
  page: browser,
}) => {
  const directory = mkdtempSync(join(tmpdir(), "mappleo-sync-e2e-"));
  const client = encryptClient(
    new PrismaClient({
      adapter: new PrismaPg({
        connectionString: process.env.DATABASE_RUNTIME_URL,
      }),
    }),
  );
  const owner = await client.user.findUniqueOrThrow({
    where: { email: process.env.E2E_RUN_EMAIL! },
  });
  const cloud = await client.company.create({
    data: {
      userId: owner.id,
      name: "Empresa web " + randomUUID(),
      notes: "Solo web al empezar",
    },
  });
  let app: ElectronApplication | undefined;
  const launch = async () => {
    const env: Record<string, string> = {
      ...process.env,
      MAPPLEO_DESKTOP_TEST_DATA: directory,
      MAPPLEO_DESKTOP_HIDE_WINDOW: "1",
      MAPPLEO_DESKTOP_SERVER_URL: "http://localhost:3100",
    };
    delete env.ELECTRON_RUN_AS_NODE;
    delete env.MAPPLEO_DESKTOP_DEV_URL;
    app = await electron.launch({
      executablePath: resolve(
        "apps/windows/node_modules/electron/dist/electron.exe",
      ),
      args: ["."],
      cwd: resolve("apps/windows"),
      env,
    });
    const page = await app.firstWindow();
    page.on("dialog", (dialog) => void dialog.accept());
    return page;
  };
  try {
    let desktop = await launch();
    await desktop.getByLabel("¿Cómo te llamas?").fill("John sincronización");
    await desktop
      .getByRole("button", { name: "Crear mi espacio local" })
      .click();
    await command(desktop, {
      action: "save",
      kind: "companies",
      input: {
        name: "Empresa de Windows",
        websiteUrl: "",
        careersUrl: "",
        linkedinUrl: "",
        location: "",
        workMode: "REMOTE",
        sector: "",
        interestRating: 3,
        tags: [],
        notes: "Solo local al empezar",
      },
    });
    await app!.evaluate(({ shell }) => {
      shell.openExternal = async (url: string) => {
        (
          globalThis as typeof globalThis & { authorizationUrl?: string }
        ).authorizationUrl = url;
      };
    });
    await desktop
      .getByRole("button", { name: "Configuración", exact: true })
      .click();
    await desktop
      .getByRole("button", { name: "Conectar mi cuenta", exact: true })
      .click();
    await expect
      .poll(() =>
        app!.evaluate(
          () =>
            (globalThis as typeof globalThis & { authorizationUrl?: string })
              .authorizationUrl,
        ),
      )
      .toBeTruthy();
    const authorizationUrl = await app!.evaluate(
      () =>
        (globalThis as typeof globalThis & { authorizationUrl?: string })
          .authorizationUrl!,
    );
    await browser.goto(authorizationUrl);
    await browser
      .getByLabel("Email", { exact: true })
      .fill(process.env.E2E_RUN_EMAIL!);
    await browser
      .getByLabel("Contraseña", { exact: true })
      .fill(process.env.E2E_PASSWORD!);
    await browser.getByRole("button", { name: "Entrar en mi espacio" }).click();
    await browser.getByRole("checkbox").check();
    await browser
      .getByLabel("Confirma tu contraseña", { exact: true })
      .fill(process.env.E2E_PASSWORD!);
    await browser
      .getByRole("button", { name: "Autorizar este equipo", exact: true })
      .click();
    await expect
      .poll(async () => (await snapshot(desktop)).sync.phase)
      .toBe("synced");
    const initial = await snapshot(desktop);
    expect(initial.workspace.companies).toHaveLength(2);
    expect(initial.workspace.boardColumns).toHaveLength(3);
    expect(await client.company.count({ where: { userId: owner.id } })).toBe(2);
    expect(
      await client.desktopDevice.count({ where: { userId: owner.id } }),
    ).toBe(1);
    await browser.goto("/companies");
    await expect(
      browser.getByText("Empresa de Windows", { exact: true }).first(),
    ).toBeVisible();
    await browser.clock.install();
    // Both ways, triggered by a normal local save rather than a special refresh button.
    await client.company.update({
      where: { id: cloud.id },
      data: { notes: "Cambio desde web" },
    });
    await command(desktop, { action: "profile", name: "John sincronización" });
    await expect
      .poll(
        async () =>
          (await snapshot(desktop)).workspace.companies.find(
            (c) => c.id === cloud.id,
          )?.notes,
      )
      .toBe("Cambio desde web");
    const local = initial.workspace.companies.find((c) => c.id !== cloud.id)!;
    await command(desktop, {
      action: "save",
      kind: "companies",
      id: local.id,
      input: {
        ...local,
        name: "Empresa sincronizada por Windows",
        notes: "Edición local automática",
      },
    });
    await expect
      .poll(
        async () =>
          (await client.company.findUniqueOrThrow({ where: { id: local.id } }))
            .notes,
      )
      .toBe("Edición local automática");
    await browser.clock.fastForward(61000);
    await browser.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(
      browser
        .getByText("Empresa sincronizada por Windows", { exact: true })
        .first(),
    ).toBeVisible();
    await browser.clock.resume();
    // Intentionally change the same record independently before the debounce sends it.
    await command(desktop, {
      action: "save",
      kind: "companies",
      id: local.id,
      input: { ...local, notes: "Versión de Windows" },
    });
    await client.company.update({
      where: { id: local.id },
      data: { notes: "Versión de la web" },
    });
    await expect(
      desktop.getByText("Elige qué versión conservar", { exact: true }),
    ).toBeVisible();
    await desktop
      .getByRole("button", { name: "Comparar versiones", exact: true })
      .click();
    await expect(
      desktop.getByText("Versión de Windows", { exact: true }),
    ).toBeVisible();
    await expect(
      desktop.getByText("Versión de la web", { exact: true }),
    ).toBeVisible();
    await desktop
      .getByRole("button", { name: "Conservar web", exact: true })
      .click();
    await expect
      .poll(async () => (await snapshot(desktop)).sync.phase)
      .toBe("synced");
    expect(
      (await snapshot(desktop)).workspace.companies.find(
        (c) => c.id === local.id,
      )?.notes,
    ).toBe("Versión de la web");
    // The encrypted link survives a full Electron restart, with no fresh login.
    await app!.close();
    app = undefined;
    desktop = await launch();
    await expect
      .poll(async () => (await snapshot(desktop)).sync.phase)
      .toBe("synced");
    expect((await snapshot(desktop)).sync.connected).toBe(true);
    await desktop
      .getByRole("button", { name: "Configuración", exact: true })
      .click();
    await desktop
      .getByRole("button", { name: "Desconectar cuenta", exact: true })
      .click();
    await expect
      .poll(async () => (await snapshot(desktop)).sync.connected)
      .toBe(false);
    await expect
      .poll(() => client.desktopDevice.count({ where: { userId: owner.id } }))
      .toBe(0);
    expect((await snapshot(desktop)).workspace.companies).toHaveLength(2);
    expect(await client.company.count({ where: { userId: owner.id } })).toBe(2);
  } finally {
    if (app) await app.close();
    await client.$disconnect();
    if (directory.startsWith(join(tmpdir(), "mappleo-sync-e2e-")))
      rmSync(directory, { recursive: true, force: true });
  }
});
