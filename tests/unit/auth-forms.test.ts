import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("next-auth/react", () => ({ signIn: vi.fn(), signOut: vi.fn() }));
vi.mock("../../features/account/actions", () => ({ accountAction: vi.fn() }));

import { LoginForm } from "../../components/login-form";
import { RegisterForm } from "../../components/register-form";
import { AdminLoginForm } from "../../features/admin/login-form";
import { AccountForms } from "../../features/account/forms";
import { DesktopConsent } from "../../features/desktop/consent";

describe("Formularios sensibles antes de hidratar", () => {
  for (const Component of [LoginForm, RegisterForm, AdminLoginForm]) {
    it(`${Component.name}: SSR usa POST y bloquea todos los campos y botones`, () => {
      const html = renderToStaticMarkup(createElement(Component));
      expect(html).toMatch(/<form[^>]*method="post"/);
      const controls = html.match(/<(?:input|button)\b[^>]*>/g) ?? [];
      expect(controls.length).toBeGreaterThan(0);
      for (const tag of controls) expect(tag).toContain('disabled=""');
    });
  }
  it("cambiar nombre y contraseña usa POST y fieldsets bloqueados", () => {
    const html = renderToStaticMarkup(
      createElement(AccountForms, { name: "Prueba" }),
    );
    expect(html.match(/<form[^>]*method="post"/g)).toHaveLength(2);
    expect(html.match(/<fieldset disabled=""/g)).toHaveLength(2);
  });
  it("autorizar Windows no permite enviar la contraseña antes de estar listo", () => {
    const html = renderToStaticMarkup(
      createElement(DesktopConsent, {
        email: "test@example.test",
        authorization: {
          challenge: "test",
          state: "test",
          redirectUri: "http://127.0.0.1:43129/callback",
        },
      }),
    );
    expect(html).toMatch(/<form[^>]*method="post"/);
    for (const tag of html.match(/<(?:input|button)\b[^>]*>/g) ?? [])
      expect(tag).toContain('disabled=""');
  });
});
