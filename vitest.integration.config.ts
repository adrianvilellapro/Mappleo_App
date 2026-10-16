import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
config({ path: ".env.test", override: true, quiet: true });
if (
  !process.env.DATABASE_URL ||
  new URL(process.env.DATABASE_URL).pathname !== "/mappleo_test" ||
  !process.env.DATABASE_RUNTIME_URL ||
  new URL(process.env.DATABASE_RUNTIME_URL).pathname !== "/mappleo_test"
)
  throw new Error("Ejecuta npm run test:prepare.");
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: {
    include: ["tests/integration/**/*.test.ts"],
    environment: "node",
    testTimeout: 30000,
    hookTimeout: 30000,
    fileParallelism: false,
  },
});
