import { defineConfig, devices } from "@playwright/test";
import { config, parse } from "dotenv";
import { readFileSync } from "node:fs";
config({ path: ".env.deploy-check", override: true, quiet: true });
const url = new URL(process.env.DATABASE_URL!);
const production = parse(readFileSync(".env.deploy"));
if (
  url.hostname !== process.env.DEPLOY_DATABASE_HOST ||
  url.hostname === production.DEPLOY_DATABASE_HOST ||
  !url.hostname.endsWith(".neon.tech") ||
  process.env.NEXTAUTH_URL !== "https://localhost:3444"
)
  throw new Error(
    "Las pruebas cloud requieren el perfil de rama temporal confirmado.",
  );
export default defineConfig({
  testDir: "./tests/deployment",
  outputDir: "test-results-deploy",
  workers: 1,
  timeout: 120000,
  expect: { timeout: 30000 },
  reporter: "list",
  use: { baseURL: "https://localhost:3444", ignoreHTTPSErrors: false },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile",
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" },
    },
  ],
  webServer: {
    command:
      "npx tsx scripts/serve-deployment-check.ts --env-file .env.deploy-check --allow-remote",
    url: "https://localhost:3444/login",
    ignoreHTTPSErrors: true,
    timeout: 120000,
    reuseExistingServer: false,
  },
});
