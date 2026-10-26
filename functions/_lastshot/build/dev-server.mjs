#!/usr/bin/env node
/* Play Last Shot locally.
 *   node functions/_lastshot/build/dev-server.mjs [port]     then open /last-shot
 * pages.js is rebuilt on every page load, so edits show on reload. */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { render } from './pages.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(HERE, '../../..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2' };

export function startDev(port = 8790) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/last-shot' || url.pathname.startsWith('/last-shot/')) {
      fs.writeFileSync(path.join(HERE, '../pages.js'), render());
      const { serve } = await import(pathToFileURL(path.join(HERE, '../serve.js')).href + '?t=' + Date.now());
      const out = serve(url.pathname.slice('/last-shot'.length));
      if (!out) { res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); return res.end(fs.readFileSync(path.join(REPO, '404.html'))); }
      res.writeHead(200, { 'Content-Type': out.type, 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' }); return res.end(out.body);
    }
    const f = path.join(REPO, decodeURIComponent(url.pathname));
    if (f.startsWith(REPO) && fs.existsSync(f) && fs.statSync(f).isFile()) {
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); return res.end(fs.readFileSync(f));
    }
    res.writeHead(404); res.end('not found');
  });
  return new Promise(r => server.listen(port, () => r({ server })));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const port = Number(process.argv[2]) || 8790;
  await startDev(port);
  console.log('Last Shot on http://localhost:' + port + '/last-shot');
}
