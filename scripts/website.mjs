import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { build, createServer as createViteServer } from "vite";
import { handleApi } from "./api.mjs";
import { loadEnv } from "./env.mjs";
loadEnv();
const project = resolve(import.meta.dirname, "..");
if (process.argv.includes("--build")) {
  await build({ configFile: resolve(project, "vite.config.ts") });
} else {
  const preview = process.argv.includes("--preview");
  const root = resolve(project, "dist");
  const types = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".svg": "image/svg+xml",
    ".woff2": "font/woff2",
  };
  let vite;
  const server = createServer(async (req, res) => {
    try {
      if (await handleApi(req, res)) return;
      const url = new URL(req.url, "http://localhost");
      if (url.pathname === "/workspace" || url.pathname === "/workspace/")
        req.url = "/workspace.html" + url.search;
      if (!preview) {
        vite.middlewares(req, res);
        return;
      }
      const pathname = decodeURIComponent(
        new URL(req.url, "http://localhost").pathname,
      );
      const file = resolve(
        root,
        "." + (pathname === "/" ? "/index.html" : pathname),
      );
      if (!file.startsWith(root + sep) || !(await stat(file)).isFile())
        throw new Error("Not found");
      res.writeHead(200, {
        "Content-Type": types[extname(file)] || "application/octet-stream",
        "Cache-Control": "no-cache",
        "X-Content-Type-Options": "nosniff",
      });
      res.end(await readFile(file));
    } catch {
      if (!res.headersSent) res.writeHead(404);
      res.end("Not found");
    }
  });
  if (!preview)
    vite = await createViteServer({
      configFile: resolve(project, "vite.config.ts"),
      server: { middlewareMode: true, hmr: { server } },
      appType: "mpa",
    });
  const port = Number(process.env.PORT || 3000);
  server.listen(port, "127.0.0.1", () =>
    console.log(`Local: http://localhost:${port}`),
  );
}
