import { expect, type Page } from "@playwright/test";

// Check authentication separately from navigation, so a cold server cannot
// disguise a rejected password (or a lost submit) as a dashboard timeout.
export async function submitLogin(page: Page) {
  const button = page.getByRole("button", {
    name: "Entrar en mi espacio",
    exact: true,
  });
  await expect(button).toBeEnabled();
  const [response] = await Promise.all([
    page.waitForResponse(
      (r) =>
        new URL(r.url()).pathname === "/api/auth/callback/credentials" &&
        r.request().method() === "POST",
      { timeout: 45000 },
    ),
    button.click(),
  ]);
  expect(
    response.status(),
    "El servidor debe aceptar las credenciales de prueba",
  ).toBe(200);
  await expect(page).toHaveURL(/\/dashboard(?:[?#]|$)/, { timeout: 45000 });
}
