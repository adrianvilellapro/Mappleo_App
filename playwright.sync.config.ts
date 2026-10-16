import { defineConfig } from "@playwright/test";
import { config } from "dotenv";
config({ path: ".env.test", override: true, quiet: true });
for (const key of ["DATABASE_URL", "DATABASE_RUNTIME_URL"]) {
  const target = new URL(process.env[key]!);
  if (
    target.pathname !== "/mappleo_test" ||
    !["localhost", "127.0.0.1"].includes(target.hostname)
  )
    throw new Error(
      "La sincronización E2E solo puede probarse en mappleo_test local.",
    );
}
process.env.E2E_ISOLATED_RUN = "1";
export default defineConfig({
  testDir: "./tests/desktop-sync",
  workers: 1,
  timeout: 120000,
  expect: { timeout: 25000 },
  reporter: "list",
  globalSetup: "./tests/e2e/global-setup.ts",
  outputDir: "test-results-sync",
  use: { baseURL: "http://localhost:3100", trace: "retain-on-failure" },
  webServer: {
    command: "npm run dev:test -- --webpack --port 3100",
    url: "http://localhost:3100/login",
    reuseExistingServer: false,
    timeout: 180000,
    env: {
      MAPPLEO_E2E: "1",
      MAPPLEO_SYNC_E2E: "1",
      DESKTOP_SYNC_ENABLED: "true",
      DATABASE_URL: process.env.DATABASE_URL!,
      DATABASE_RUNTIME_URL: process.env.DATABASE_RUNTIME_URL!,
      AUTH_SECRET: process.env.AUTH_SECRET!,
      FIELD_ENCRYPTION_KEYS: process.env.FIELD_ENCRYPTION_KEYS!,
      FIELD_ENCRYPTION_ACTIVE_KEY: process.env.FIELD_ENCRYPTION_ACTIVE_KEY!,
      FIELD_ENCRYPTION_INDEX_KEY: process.env.FIELD_ENCRYPTION_INDEX_KEY!,
      AUTHORIZED_EMAIL: process.env.AUTHORIZED_EMAIL!,
      REGISTRATION_CODE: process.env.REGISTRATION_CODE!,
      ACCOUNT_LIMIT_CEILING: process.env.ACCOUNT_LIMIT_CEILING!,
      NEXTAUTH_URL: "http://localhost:3100",
    },
  },
});
