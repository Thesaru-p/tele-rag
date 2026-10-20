import { createServer } from 'node:http';
import { readFile, mkdir, cp, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';

const project = resolve(import.meta.dirname, '..');
const building = process.argv.includes('--build');
const root = resolve(project, process.argv.includes('--preview') ? 'dist' : 'website');
if (building) {
  await mkdir(resolve(project, 'dist'), { recursive: true });
  await cp(resolve(project, 'website'), resolve(project, 'dist'), { recursive: true });
  console.log('Website built in dist/');
} else {
  const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
  const server = createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      const file = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
      if (!file.startsWith(root + sep) || !(await stat(file)).isFile()) {
        res.writeHead(404).end('Not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
      res.end(await readFile(file));
    } catch {
      res.writeHead(404).end('Not found');
    }
  });
  const port = Number(process.env.PORT || 3000);
  server.listen(port, '127.0.0.1', () => console.log(`Local: http://localhost:${port}`));
}
