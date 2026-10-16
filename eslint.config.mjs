import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
export default defineConfig([
  ...nextVitals,
  ...nextTs,
  { files: ["apps/demo/**"], rules: { "@next/next/no-img-element": "off" } },
  globalIgnores([
    ".deployment/**",
    "apps/windows/**",
    "apps/demo/dist/**",
    "public/demo/**",
    "test-results-demo/**",
    ".next/**",
    ".next-e2e/**",
    ".next-sync-e2e/**",
    ".next-https-test/**",
    ".next-deploy-check/**",
    "generated/**",
    "next-env.d.ts",
    "playwright-report/**",
    "test-results/**",
    "test-results-https/**",
    "test-results-deploy/**",
    "test-results-optimizations/**",
    "test-results-sync/**",
  ]),
]);
