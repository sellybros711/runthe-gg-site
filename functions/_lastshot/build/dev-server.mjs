#!/usr/bin/env node
/* Play Last Shot locally.
 *   node functions/_lastshot/build/dev-server.mjs [port]     then open /last-shot
 * Everybody is signed in as the tester 'dev'; add ?as=nobody to be a guest
 * (the game is live, so a guest gets the page too; a path it does not know
 * is the 404). pages.js is rebuilt on every page load, so edits show on reload.
 * /api/arcade/* is the Arcade Lab's real handler on an in-memory database
 * (test/fake-arcade.mjs), so the Daily plays locally, as the signed in 'dev'.
 * POST /last-shot/e answers as the real one does (gate.js roundGate): 204 for
 * an account or a guest with a good device id, and keeps each body in events. */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { render } from './pages.mjs';
import { deviceOf } from '../events.js';
import { fakeArcade } from '../test/fake-arcade.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(HERE, '../../..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2' };

export function startDev(port = 8790) {
  let who = 'dev';
  const arcade = fakeArcade({ uidOf: () => who });
  const events = [];
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const as = url.searchParams.get('as');
    if (as) who = as === 'nobody' ? null : as === 'boss' ? 'boss' : 'dev';
    /* The round's events (analytics.js): an account, or a guest with a good
       device id, gets 204 and the body is kept in events for the checks;
       anybody else the 404. The real endpoint is functions/last-shot/[[path]].js. */
    if (url.pathname === '/last-shot/e' && req.method === 'POST') {
      const chunks = []; for await (const c of req) chunks.push(c);
      let body = null; try { body = JSON.parse(Buffer.concat(chunks).toString()); } catch (e) {}
      if (!who && !deviceOf(body)) { res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); return res.end(fs.readFileSync(path.join(REPO, '404.html'))); }
      events.push({ who, type: req.headers['content-type'] || '', body });
      res.writeHead(204, { 'Cache-Control': 'no-store' }); return res.end();
    }
    if (url.pathname === '/last-shot' || url.pathname.startsWith('/last-shot/')) {
      fs.writeFileSync(path.join(HERE, '../pages.js'), render());
      const { pageGate } = await import(pathToFileURL(path.join(HERE, '../gate.js')).href + '?t=' + Date.now());
      const out = pageGate(url.pathname.slice('/last-shot'.length));
      if (!out) { res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); return res.end(fs.readFileSync(path.join(REPO, '404.html'))); }
      res.writeHead(200, { 'Content-Type': out.type, 'Cache-Control': 'no-store' }); return res.end(out.body);
    }
    if (url.pathname.startsWith('/api/arcade/')) {
      let body = null;
      if (req.method !== 'GET') { const chunks = []; for await (const c of req) chunks.push(c); try { body = JSON.parse(Buffer.concat(chunks).toString() || '{}'); } catch (e) { body = {}; } }
      const out = await arcade.answer({ method: req.method, path: url.pathname.slice('/api/arcade/'.length), query: Object.fromEntries(url.searchParams), body, headers: req.headers });
      res.writeHead(out.status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); return res.end(JSON.stringify(out.body));
    }
    const f = path.join(REPO, decodeURIComponent(url.pathname));
    if (f.startsWith(REPO) && fs.existsSync(f) && fs.statSync(f).isFile()) {
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); return res.end(fs.readFileSync(f));
    }
    res.writeHead(404); res.end('not found');
  });
  return new Promise(r => server.listen(port, () => r({ server, arcade, events, setWho: w => { who = w; } })));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const port = Number(process.argv[2]) || 8790;
  await startDev(port);
  console.log('Last Shot on http://localhost:' + port + '/last-shot');
}
