import { defineConfig, type Plugin } from "vite";
import ts from "typescript";
import { fileURLToPath } from "node:url";
import { resolve, dirname, isAbsolute } from "node:path";
import { english } from "./english";

export function translateDemo(source: string, id: string): string {
  const file = ts.createSourceFile(id, source, ts.ScriptTarget.Latest, true);
  const changes: { start: number; end: number; text: string }[] = [];
  const walk = (node: ts.Node) => {
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isJsxText(node)
    ) {
      const value = ts.isJsxText(node)
        ? node.text.replace(/\s+/g, " ").trim()
        : node.text;
      const text = english[value];
      if (text !== undefined)
        changes.push({
          start: node.getStart(file),
          end: node.end,
          text: ts.isJsxText(node)
            ? `{${JSON.stringify(text)}}`
            : JSON.stringify(text),
        });
    }
    if (
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    ) {
      const text = english[node.text];
      if (text !== undefined)
        changes.push({
          start: node.getStart(file) + 1,
          end: node.end - (ts.isTemplateTail(node) ? 1 : 2),
          text: text.replaceAll("`", "\\`").replaceAll("${", "\\${"),
        });
    }
    ts.forEachChild(node, walk);
  };
  walk(file);
  for (const change of changes.sort((a, b) => b.start - a.start))
    source =
      source.slice(0, change.start) + change.text + source.slice(change.end);
  return source;
}
export function demoConfig(language: "es" | "en") {
  const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
  const demoFile = (name: string) =>
    fileURLToPath(new URL("./src/" + name, import.meta.url));
  const replacements = new Map([
    [
      resolve(projectRoot, "features/tracker/actions"),
      demoFile("web-actions.ts"),
    ],
    [
      resolve(projectRoot, "features/tasks/actions"),
      demoFile("web-actions.ts"),
    ],
    [
      resolve(projectRoot, "features/account/actions"),
      demoFile("restricted.ts"),
    ],
    [
      resolve(projectRoot, "features/reports/worker-client"),
      demoFile("report-unavailable.ts"),
    ],
  ]);
  const localTransport: Plugin = {
    name: "mappleo-demo-browser-only-transport",
    enforce: "pre",
    resolveId(source, importer) {
      const target = source.startsWith("@/")
        ? resolve(projectRoot, source.slice(2))
        : source.startsWith(".") && importer
          ? resolve(dirname(importer.split("?")[0]), source)
          : source;
      const replacement = replacements.get(
        (isAbsolute(target) ? resolve(target) : target).replace(
          /\.[jt]sx?$/,
          "",
        ),
      );
      if (replacement) return replacement;
      if (
        source === "server-only" ||
        source.startsWith("node:") ||
        source.includes("@prisma/")
      )
        throw Error("Server code is forbidden in the static demo: " + source);
    },
    transform(source, id) {
      if (id.includes("node_modules") || !/\.[jt]sx?$/.test(id)) return;
      if (
        /^[\s\S]*?['"]use server['"];|import\s*['"]server-only['"]/.test(source)
      )
        throw Error("A server module reached the demo build: " + id);
      if (
        language === "en" &&
        id.replaceAll("\\", "/").endsWith("/lib/dates.ts")
      )
        return {
          code: source.replaceAll('.setLocale("es")', '.setLocale("en")'),
          map: null,
        };
    },
    generateBundle(_options, bundle) {
      for (const output of Object.values(bundle))
        if (output.type === "chunk") {
          for (const id of Object.keys(output.modules))
            if (
              /\/apps\/windows\/|\/lib\/(?:db|auth\.ts)|\/features\/(?:tracker|tasks)\/services?\./.test(
                id.replaceAll("\\", "/"),
              )
            )
              throw Error(
                "Desktop or server implementation reached the demo bundle: " +
                  id,
              );
        }
    },
  };
  const localize: Plugin = {
    name: "mappleo-demo-copy",
    enforce: "pre",
    transform(source, id) {
      if (
        language !== "en" ||
        !/\.[jt]sx?$/.test(id) ||
        id.includes("node_modules")
      )
        return;
      if (
        /\/apps\/demo\/src\/|\/features\/|\/components\/|\/lib\/(?:utils|dates)\.|\/packages\/(?:domain|ui)\//.test(
          id.replaceAll("\\", "/"),
        )
      )
        return {
          code: translateDemo(
            id.replaceAll("\\", "/").endsWith("/features/dashboard/view.tsx")
              ? source.replaceAll(
                  'DateTimeFormat("es",',
                  'DateTimeFormat("en",',
                )
              : source,
            id,
          ),
          map: null,
        };
    },
    transformIndexHtml(html) {
      const csp =
        "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'self'; form-action 'none'";
      return html
        .replace('lang="es"', `lang="${language}"`)
        .replace(
          "<head>",
          `<head><meta http-equiv="Content-Security-Policy" content="${csp}"/>`,
        );
    },
  };
  return defineConfig({
    root: fileURLToPath(new URL(".", import.meta.url)),
    base: "./",
    publicDir: false,
    envDir: false,
    envPrefix: "MAPPLEO_PUBLIC_DEMO_",
    logLevel: "warn",
    define: { __DEMO_LANGUAGE__: JSON.stringify(language) },
    plugins: [localTransport, localize],
    css: { postcss: projectRoot },
    resolve: {
      alias: [
        { find: "next/navigation", replacement: demoFile("router.tsx") },
        { find: "next/link", replacement: demoFile("router.tsx") },
        { find: "next/image", replacement: demoFile("image.tsx") },
        { find: "next-auth/react", replacement: demoFile("restricted.ts") },
        { find: /^@\//, replacement: projectRoot.replaceAll("\\", "/") + "/" },
      ],
      dedupe: [
        "react",
        "react-dom",
        "@radix-ui/react-dialog",
        "@radix-ui/react-select",
        "lucide-react",
      ],
    },
    build: {
      outDir: `dist/${language}`,
      emptyOutDir: true,
      assetsInlineLimit: 0,
      sourcemap: false,
      rolldownOptions: { checks: { moduleLevelDirective: false } },
    },
  });
}
export default demoConfig("es");
