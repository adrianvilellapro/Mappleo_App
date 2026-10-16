import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve, sep, extname } from "node:path";
const root = fileURLToPath(new URL("../apps/demo/dist/", import.meta.url));
const prefix = process.env.MAPPLEO_DEMO_PREVIEW_BASE_PATH ?? "";
if (prefix && !/^\/[a-zA-Z0-9_-]+$/.test(prefix))
  throw Error("Invalid demo preview base path");
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
};
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(
      new URL(req.url, "http://localhost").pathname,
    );
    if (prefix && !pathname.startsWith(prefix + "/")) {
      res.writeHead(404).end("Not found");
      return;
    }
    const path = resolve(root, "." + pathname.slice(prefix.length));
    if (
      path !== root.slice(0, -1) &&
      !path.startsWith(root.endsWith(sep) ? root : root + sep)
    ) {
      res.writeHead(403).end();
      return;
    }
    const file = (await stat(path)).isDirectory()
      ? resolve(path, "index.html")
      : path;
    res.writeHead(200, {
      "Content-Type": types[extname(file)] ?? "application/octet-stream",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404).end("Not found");
  }
});
server.listen(4173, "127.0.0.1", () =>
  console.log("Browser-only demo: http://127.0.0.1:4173" + prefix + "/"),
);
