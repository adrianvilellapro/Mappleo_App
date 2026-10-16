import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
process.env.E2E_COMPILED = "1";
export default defineConfig({
  ...base,
  testMatch: [
    "**/analytics.spec.ts",
    "**/optimizations.spec.ts",
    "**/company-logos.spec.ts",
  ],
  outputDir: "test-results-optimizations",
  reporter: "list",
  use: {
    ...base.use,
    baseURL: "https://localhost:3445",
    ignoreHTTPSErrors: false,
  },
  webServer: {
    command:
      "node --use-system-ca node_modules/tsx/dist/cli.mjs scripts/serve-verification.ts",
    url: "https://localhost:3445/login",
    timeout: 120000,
    reuseExistingServer: false,
  },
});
