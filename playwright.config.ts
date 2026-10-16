import { defineConfig, devices } from "@playwright/test";
import { config } from "dotenv";
config({ path: ".env.test", override: true, quiet: true });
process.env.E2E_ISOLATED_RUN = "1";
if (process.env.E2E_RUN_EMAIL)
  process.env.AUTHORIZED_EMAIL = process.env.E2E_RUN_EMAIL;
if (
  !process.env.DATABASE_URL ||
  new URL(process.env.DATABASE_URL).pathname !== "/mappleo_test" ||
  !process.env.DATABASE_RUNTIME_URL ||
  new URL(process.env.DATABASE_RUNTIME_URL).pathname !== "/mappleo_test"
)
  throw new Error("Ejecuta npm run test:prepare antes de las pruebas E2E.");
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 120000,
  expect: { timeout: 15000 },
  globalSetup: "./tests/e2e/global-setup.ts",
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    timezoneId: "Europe/Madrid",
    baseURL: "http://localhost:3100",
    actionTimeout: 15000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1000 },
      },
    },
    {
      name: "mobile",
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" },
    },
  ],
  webServer: {
    command: "npm run dev:test -- --port 3100",
    url: "http://localhost:3100/login",
    reuseExistingServer: false,
    timeout: 120000,
    env: {
      MAPPLEO_E2E: "1",
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
      GOOGLE_CLIENT_ID: "",
      GOOGLE_CLIENT_SECRET: "",
    },
  },
});
