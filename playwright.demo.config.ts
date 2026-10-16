import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "tests/demo",
  outputDir: "test-results-demo",
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  expect: { timeout: 10000 },
  use: {
    baseURL: (
      process.env.MAPPLEO_DEMO_TEST_ORIGIN ??
      "http://127.0.0.1:4173" +
        (process.env.MAPPLEO_DEMO_PREVIEW_BASE_PATH ?? "")
    ).replace(/\/?$/, "/"),
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: process.env.MAPPLEO_DEMO_TEST_ORIGIN
    ? undefined
    : {
        command: "node scripts/serve-demo.mjs",
        url:
          "http://127.0.0.1:4173" +
          (process.env.MAPPLEO_DEMO_PREVIEW_BASE_PATH ?? "") +
          "/",
        reuseExistingServer: !process.env.CI,
      },
});
