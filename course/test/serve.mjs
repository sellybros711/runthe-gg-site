#!/usr/bin/env node
/* Run The Course: a local server for play and for the browser check.
 *
 *   node course/test/serve.mjs [port]      then open http://localhost:8788/course/
 *
 * Serves the repo as static files, and /api/course/* through the real
 * handler (functions/_course/api.js) over an in-memory database. Sign in is
 * faked: a request with Authorization: Bearer token-<id> is that account. */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handle } from '../../functions/_course/api.js';
import { memoryDb } from '../../functions/_course/db-supabase.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.glb': 'model/gltf-binary' };

export function serve(port = 0, db = memoryDb()) {
  const log = [];
  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://localhost');
    if (u.pathname.startsWith('/api/course/')) {
      let raw = '';
      for await (const c of req) raw += c;
      let body = null; try { body = raw ? JSON.parse(raw) : null; } catch (e) { body = null; }
      const m = (req.headers.authorization || '').match(/^Bearer token-(.+)$/);
      const sub = u.pathname.slice('/api/course/'.length);
      log.push(req.method + ' ' + sub);
      const out = await handle({ method: req.method, sub, uid: m ? m[1] : null, query: Object.fromEntries(u.searchParams), body, country: u.searchParams.get('cc') || undefined }, db);
      res.writeHead(out.status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(out.json === null ? '' : JSON.stringify(out.json));
      return;
    }
    let file = path.join(ROOT, decodeURIComponent(u.pathname));
    if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(ok => server.listen(port, () => ok({ server, db, log, port: server.address().port, close: () => new Promise(r => server.close(r)) })));
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  serve(+process.argv[2] || 8788).then(s => console.log('Run The Course at http://localhost:' + s.port + '/course/  (?debug for the tools)'));
}
