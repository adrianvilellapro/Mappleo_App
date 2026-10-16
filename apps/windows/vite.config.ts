import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
  root: fileURLToPath(new URL("src/renderer", import.meta.url)),
  base: "./",
  resolve: {
    alias: { "@": fileURLToPath(new URL("../../", import.meta.url)) },
    dedupe: ["react", "react-dom", "@radix-ui/react-select", "lucide-react"],
  },
  build: {
    outDir: "../../dist/renderer",
    emptyOutDir: true,
    assetsInlineLimit: 0,
    rolldownOptions: { checks: { moduleLevelDirective: false } },
  },
  server: {
    host: "127.0.0.1",
    port: 5178,
    strictPort: true,
    fs: {
      allow: ["./", "../../packages", "../../public", "../../node_modules"].map(
        (path) => fileURLToPath(new URL(path, import.meta.url)),
      ),
    },
  },
});
