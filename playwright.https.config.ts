import { defineConfig, devices } from "@playwright/test";
import { config } from "dotenv";
config({ path: ".env.test", override: true, quiet: true });
if (
  !process.env.DATABASE_URL ||
  new URL(process.env.DATABASE_URL).pathname !== "/mappleo_test" ||
  !process.env.DATABASE_RUNTIME_URL ||
  new URL(process.env.DATABASE_RUNTIME_URL).pathname !== "/mappleo_test"
)
  throw new Error("HTTPS tests only use mappleo_test. Run test:prepare first.");
export default defineConfig({
  testDir: "./tests/https",
  outputDir: "test-results-https",
  workers: 1,
  timeout: 120000,
  expect: { timeout: 20000 },
  reporter: "list",
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile",
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" },
    },
  ],
  use: { baseURL: "https://localhost:3300", ignoreHTTPSErrors: false },
  webServer: {
    command: "npm run dev -- --port 3300",
    url: "https://localhost:3300/login",
    timeout: 120000,
    reuseExistingServer: false,
    env: {
      ...Object.fromEntries(
        Object.entries(process.env).filter(
          (entry): entry is [string, string] => typeof entry[1] === "string",
        ),
      ),
      NEXTAUTH_URL: "https://localhost:3300",
      MAPPLEO_HTTPS_TEST: "1",
      MAPPLEO_E2E: "1",
    },
  },
});
