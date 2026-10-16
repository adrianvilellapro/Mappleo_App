import { test, expect } from "@playwright/test";
import { submitLogin } from "./submit-login";

const routes = [
  { path: "/login", button: "Entrar en mi espacio" },
  { path: "/register", button: "Crear cuenta" },
  { path: "/admin/login", button: "Entrar en administración" },
];

for (const { path, button } of routes) {
  test(`${path}: no permite enviar credenciales antes de cargar JavaScript`, async ({
    page,
  }) => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let held = 0;
    const sensitiveQueries: boolean[] = [];
    page.on("request", (request) => {
      const url = new URL(request.url());
      sensitiveQueries.push(
        [
          "password",
          "confirmPassword",
          "email",
          "registrationCode",
          "code",
        ].some((key) => url.searchParams.has(key)),
      );
    });
    await page.route("**/_next/static/**", async (route) => {
      if (route.request().resourceType() === "script") {
        held++;
        await gate;
      }
      await route.continue().catch(() => {});
    });
    try {
      await page.goto(path, { waitUntil: "commit" });
      const form = page.locator(".login-form");
      await expect(form).toBeVisible();
      await expect.poll(() => held).toBeGreaterThan(0);
      await expect(form).toHaveAttribute("method", "post");
      await expect(
        page.getByRole("button", { name: button, exact: true }),
      ).toBeDisabled();
      const inputs = form.locator("input");
      expect(await inputs.count()).toBeGreaterThan(0);
      for (const input of await inputs.all())
        await expect(input).toBeDisabled();

      release();
      for (const input of await inputs.all()) await expect(input).toBeEnabled();
      await expect(
        page.getByRole("button", { name: button, exact: true }),
      ).toBeEnabled();
      if (path === "/login") {
        await page
          .getByLabel("Email", { exact: true })
          .fill(process.env.AUTHORIZED_EMAIL!);
        await page
          .getByLabel("Contraseña", { exact: true })
          .fill(process.env.E2E_PASSWORD!);
        await submitLogin(page);
      }
      expect(sensitiveQueries.some(Boolean)).toBe(false);
    } finally {
      release();
      await page.unrouteAll({ behavior: "wait" });
    }
  });
}

test("sin JavaScript, los formularios permanecen bloqueados y un envío nativo forzado nunca usa GET", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({
    baseURL,
    javaScriptEnabled: false,
  });
  try {
    const page = await context.newPage();
    for (const { path, button } of routes) {
      await page.goto(path);
      const form = page.locator(".login-form");
      await expect(form).toHaveAttribute("method", "post");
      await expect(
        page.getByRole("button", { name: button, exact: true }),
      ).toBeDisabled();
      // Bypass the disabled controls deliberately, with a fictitious value, to
      // verify the native fallback cannot put a password in browser history.
      const [response] = await Promise.all([
        page.waitForResponse(
          (r) =>
            r.request().isNavigationRequest() &&
            r.request().method() === "POST" &&
            new URL(r.url()).pathname === path,
        ),
        page.waitForEvent(
          "framenavigated",
          (frame) =>
            frame === page.mainFrame() &&
            new URL(frame.url()).pathname === path,
        ),
        form.evaluate((element) => {
          const f = element as HTMLFormElement;
          const input = document.createElement("input");
          input.name = "password";
          input.type = "hidden";
          input.value = "fictitious-not-a-real-password";
          f.append(input);
          HTMLFormElement.prototype.submit.call(f);
        }),
      ]);
      const request = response.request();
      expect(request.method()).toBe("POST");
      expect(new URL(request.url()).search).toBe("");
      await response.finished();
      await page.waitForLoadState("domcontentloaded");
    }
  } finally {
    await context.close();
  }
});
