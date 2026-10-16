import { defineConfig, type Plugin } from "vite";
import ts from "typescript";
import { fileURLToPath } from "node:url";
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
        /\/apps\/demo\/src\/|\/apps\/windows\/src\/renderer\/(?:Views|Editor|RecordDetails|model)\.|\/packages\/(?:domain|ui)\//.test(
          id.replaceAll("\\", "/"),
        )
      )
        return { code: translateDemo(source, id), map: null };
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
    plugins: [localize],
    resolve: {
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
