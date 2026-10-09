import http from 'node:http';
import { readFile, realpath } from 'node:fs/promises';
import { dirname, resolve, sep, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
export async function createServer() {
  const root = await realpath(resolve(dirname(fileURLToPath(import.meta.url)), '..'));
  const mime = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.md':'text/plain; charset=utf-8' };
  return http.createServer(async (req, res) => {
    try {
      if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      const relative = pathname === '/' ? 'web/index.html' : pathname.replace(/^\//, '');
      const path = await realpath(resolve(root, relative));
      if (!path.startsWith(root + sep) || !['web', 'docs'].some(folder => path.startsWith(resolve(root, folder) + sep))) {
        res.writeHead(403); res.end('Forbidden'); return;
      }
      const body = await readFile(path);
      res.writeHead(200, { 'Content-Type':mime[extname(path)] || 'application/octet-stream', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff', 'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'" });
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch { res.writeHead(404); res.end('Not found'); }
  });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 4173);
  const server = await createServer();
  server.listen(port, '127.0.0.1', () => console.log(`DYNAMIS ZELOS: http://localhost:${port}\nPress Ctrl+C to stop.`));
  server.on('error', error => { console.error(error.message); process.exitCode = 1; });
}
