import { test, expect } from "@playwright/test";
import { PrismaClient } from "../../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { readFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { encryptClient } from "../../lib/db/encrypted-client";

test.use({ baseURL: "http://127.0.0.1:3100" });
test("seguridad real: CSP, importación, XSS, sesiones, identidad y backup cifrado", async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(180000);
  if (new URL(process.env.DATABASE_URL!).pathname !== "/mappleo_test")
    throw new Error("Solo mappleo_test.");
  const db = encryptClient(
    new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
    }),
  );
  const email = `browser-security-${testInfo.project.name}-${randomUUID()}@example.test`;
  const password = "Una prueba privada de navegador 27!";
  let userId = "";
  const copied = await browser.newContext({ baseURL: "http://127.0.0.1:3100" });
  const violations: string[] = [];
  page.on("console", (message) => {
    if (
      /content security policy|refused to execute|violates.*policy/i.test(
        message.text(),
      )
    )
      violations.push(message.text());
  });
  try {
    const login = await page.request.get("/login");
    expect(login.headers()["content-security-policy"]).toContain("'nonce-");
    expect(login.headers()["content-security-policy"]).toContain(
      "frame-ancestors 'none'",
    );
    expect(login.headers()["x-frame-options"]).toBe("DENY");
    expect(login.headers()["x-content-type-options"]).toBe("nosniff");
    for (const url of [
      "/api/export",
      "/api/calendar?month=2026-10",
      "/api/statistics/pdf",
    ])
      expect((await page.request.get(url)).status()).toBe(401);
    await page.goto("/register");
    await page
      .getByLabel("Código de registro", { exact: true })
      .fill(process.env.REGISTRATION_CODE!);
    await page
      .getByLabel("Nombre", { exact: true })
      .fill("Seguridad navegador");
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Contraseña", { exact: true }).fill(password);
    await page
      .getByLabel("Confirmar contraseña", { exact: true })
      .fill(password);
    await page
      .getByRole("button", { name: "Crear cuenta", exact: true })
      .click();
    await expect(page).toHaveURL(/dashboard/);
    const session = await (await page.request.get("/api/auth/session")).json();
    userId = session.user.id;
    const url = "http://127.0.0.1:3100";
    for (const origin of [
      undefined,
      "https://127.0.0.1:3100",
      "http://evil.test",
    ]) {
      const response = await page.request.post("/api/import", {
        data: "{}",
        headers: {
          "Content-Type": "application/json",
          ...(origin ? { Origin: origin } : {}),
        },
      });
      expect(response.status()).toBe(403);
    }
    expect(
      (
        await page.request.post("/api/import", {
          data: Buffer.from("{"),
          headers: { "Content-Type": "application/json", Origin: url },
        })
      ).status(),
    ).toBe(400);
    const backup = JSON.parse(
      readFileSync(
        "DATOS_PRUEBA_IMPORTACION/mappleo-datos-prueba.json",
        "utf8",
      ),
    );
    const literal = '<img src=x onerror="window.mappleoSecurityExecuted=1">';
    backup.companies[0].name = literal;
    backup.companies[0].notes = "=1+1";
    backup.offers[0].title = "' OR 1=1 --";
    backup.offers[0].url = "javascript:alert(1)";
    const rejected = await page.request.post("/api/import", {
      data: JSON.stringify(backup),
      headers: { "Content-Type": "application/json", Origin: url },
    });
    expect(rejected.status()).toBe(400);
    expect(
      (await (await page.request.get("/api/export")).json()).companies,
    ).toHaveLength(0);
    backup.offers[0].url = "https://metaenlace.com/jobs";
    expect(
      (
        await page.request.post("/api/import", {
          data: JSON.stringify(backup),
          headers: { "Content-Type": "application/json", Origin: url },
        })
      ).status(),
    ).toBe(200);
    await page.goto("/companies");
    await expect(
      page.getByText(literal, { exact: true }).filter({ visible: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(() => Reflect.get(window, "mappleoSecurityExecuted")),
    ).toBeUndefined();
    expect(await page.locator('img[src="x"]').count()).toBe(0);
    const exported = await (await page.request.get("/api/export")).json();
    expect(
      exported.offers.some((o: { title: string }) => o.title === "' OR 1=1 --"),
    ).toBe(true);
    expect(JSON.stringify(exported)).not.toContain("passwordHash");
    expect(
      await (
        await page.request.get("/api/export?format=csv&section=companies")
      ).text(),
    ).toContain('"\'=1+1"');
    const sessionKey = createHash("sha256")
      .update(session.user.sessionId)
      .digest("hex");
    await db.authSession.update({
      where: { id: sessionKey },
      data: { verifiedAt: new Date(Date.now() - 3600000) },
    });
    expect((await page.request.get("/api/export")).status()).toBe(428);
    await page.goto("/settings");
    await page
      .getByRole("button", { name: "Descargar JSON", exact: true })
      .click();
    const identity = page.getByRole("dialog", { name: "Confirmar identidad" });
    await expect(identity).toBeVisible();
    await identity
      .getByLabel("Contraseña actual", { exact: true })
      .fill(password);
    const downloadPromise = page.waitForEvent("download");
    await identity
      .getByRole("button", { name: "Confirmar y continuar" })
      .click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.json$/);
    await page.getByRole("combobox", { name: "Formato", exact: true }).click();
    await page
      .getByRole("option", { name: "Backup cifrado (.mappleo)", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Descargar backup cifrado", exact: true })
      .click();
    const encryption = page.getByRole("dialog", { name: "Proteger el backup" });
    await encryption
      .getByLabel("Contraseña del backup", { exact: true })
      .fill("Mi backup privado 42!");
    await encryption
      .getByLabel("Confirmar contraseña del backup", { exact: true })
      .fill("Mi backup privado 42!");
    const encryptedPromise = page.waitForEvent("download");
    await encryption
      .getByRole("button", { name: "Continuar", exact: true })
      .click();
    const encryptedDownload = await encryptedPromise;
    expect(encryptedDownload.suggestedFilename()).toMatch(/\.mappleo$/);
    const path = (await encryptedDownload.path())!;
    const data = readFileSync(path);
    expect(data.subarray(0, 8).toString()).toBe("MAPPLEO1");
    expect(data.toString()).not.toContain(literal);
    await page.getByLabel("Archivo de backup").setInputFiles({
      name: "backup.mappleo",
      mimeType: "application/octet-stream",
      buffer: data,
    });
    page.once("dialog", (dialog) => dialog.accept());
    await page
      .getByRole("button", { name: "Restaurar datos", exact: true })
      .click();
    const opening = page.getByRole("dialog", { name: "Abrir backup cifrado" });
    await opening
      .getByLabel("Contraseña del backup", { exact: true })
      .fill("Mi backup privado 42!");
    await opening
      .getByRole("button", { name: "Continuar", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText("0 registros nuevos");
    const cookies = await page.context().cookies();
    await page
      .locator(".settings-page")
      .getByRole("button", { name: "Cerrar sesión", exact: true })
      .click();
    await expect(page).toHaveURL(/login/);
    await copied.addCookies(cookies);
    const replay = await copied.request.get("/settings", { maxRedirects: 0 });
    expect(replay.status()).toBe(307);
    expect((await copied.request.get("/api/export")).status()).toBe(401);
    const revokedProfile = await (
      await copied.request.get("/api/auth/session")
    ).json();
    expect(JSON.stringify(revokedProfile)).not.toContain(email);
    expect(violations).toEqual([]);
  } finally {
    await copied.close();
    const user =
      userId ||
      (await db.user.findUnique({ where: { email }, select: { id: true } }))
        ?.id;
    if (user) {
      const where = { userId: user };
      await db.task.deleteMany({ where });
      await db.boardColumn.deleteMany({ where });
      await db.networkingEvent.deleteMany({ where });
      await db.contact.deleteMany({ where });
      await db.application.deleteMany({ where });
      await db.jobOffer.deleteMany({ where });
      await db.company.deleteMany({ where });
      await db.securityEvent.deleteMany({ where });
      await db.user.delete({ where: { id: user } });
    }
    await db.$disconnect();
  }
});
