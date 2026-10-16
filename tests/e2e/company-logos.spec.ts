import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "../../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { encryptClient } from "../../lib/db/encrypted-client";
import { submitLogin } from "./submit-login";
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jC1cAAAAASUVORK5CYII=",
  "base64",
);
async function fixture(page: Page) {
  const url = new URL(process.env.DATABASE_URL!);
  if (
    !["localhost", "127.0.0.1"].includes(url.hostname) ||
    url.pathname !== "/mappleo_test"
  )
    throw Error("Solo se admite mappleo_test local.");
  const db = encryptClient(
    new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
    }),
  );
  try {
    const user = await db.user.findUniqueOrThrow({
      where: { email: process.env.AUTHORIZED_EMAIL! },
    });
    const company = await db.company.create({
      data: {
        userId: user.id,
        name: "Logo de prueba " + Date.now(),
        websiteUrl: "https://logos.mappleo.com",
        faviconUrl: "https://logos.mappleo.com/favicon.png",
      },
    });
    await page.goto("/login");
    await page
      .getByLabel("Email", { exact: true })
      .fill(process.env.AUTHORIZED_EMAIL!);
    await page
      .getByLabel("Contraseña", { exact: true })
      .fill(process.env.E2E_PASSWORD!);
    await submitLogin(page);
    return company.id;
  } finally {
    await db.$disconnect();
  }
}
test("el logo ya cargado antes de hidratar no se oculta tras recargar", async ({
  page,
}) => {
  const id = await fixture(page);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/company-icon?**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "image/png",
      body: png,
      headers: { "Cache-Control": "private, max-age=3600" },
    }),
  );
  let releaseScripts!: () => void;
  const gate = new Promise<void>((resolve) => {
    releaseScripts = resolve;
  });
  await page.route("**/_next/static/**/*.js", async (route) => {
    await gate;
    await route.continue();
  });
  const image = page
    .locator(`.company-logo img[src*="id=${id}"]:visible`)
    .first();
  // Locator :visible cannot match visibility:hidden; use the on-screen identity instead.
  const logo = page
    .locator(".record-identity:visible .company-logo")
    .filter({ has: page.locator(`img[src*="id=${id}"]`) })
    .first();
  try {
    await page.goto("/companies", { waitUntil: "commit" });
    await expect
      .poll(() =>
        logo
          .locator("img")
          .evaluate(
            (node: HTMLImageElement) => node.complete && node.naturalWidth > 0,
          ),
      )
      .toBe(true);
    releaseScripts();
    await expect(logo.locator("img")).toHaveCSS("visibility", "visible");
  } finally {
    releaseScripts();
    await page.unroute("**/_next/static/**/*.js");
  }
  for (let i = 0; i < 3; i++) {
    await page.reload();
    await expect(logo.locator("img")).toHaveCSS("visibility", "visible");
    await expect
      .poll(() =>
        logo
          .locator("img")
          .evaluate(
            (node: HTMLImageElement) => node.complete && node.naturalWidth > 0,
          ),
      )
      .toBe(true);
  }
  expect(await image.count()).toBe(1);
  expect(errors).toEqual([]);
});
test("un fallo temporal tiene un único reintento sin guardar un error permanentemente", async ({
  page,
}) => {
  const id = await fixture(page);
  let requests = 0;
  await page.route("**/api/company-icon?**", async (route) => {
    if (!new URL(route.request().url()).searchParams.get("id")?.includes(id)) {
      await route.continue();
      return;
    }
    requests++;
    await route.fulfill(
      requests === 1
        ? { status: 204, headers: { "Cache-Control": "private, no-store" } }
        : { status: 200, contentType: "image/png", body: png },
    );
  });
  await page.clock.install();
  await page.goto("/companies");
  const logo = page
    .locator(".record-identity:visible .company-logo")
    .filter({ has: page.locator(`img[src*="id=${id}"]`) })
    .first();
  await expect.poll(() => requests).toBe(1);
  // Give the image's error handler a real browser turn before advancing its retry timer.
  await expect(
    page.locator(`.record-identity:visible img[src*="id=${id}"]`),
  ).toHaveCount(0);
  await page.clock.fastForward(17000);
  await expect.poll(() => requests).toBe(2);
  await expect(logo.locator("img")).toHaveCSS("visibility", "visible");
  await page.clock.fastForward(60000);
  expect(requests).toBe(2);
});
