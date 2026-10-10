#!/usr/bin/env node
/* Play the Arcade Lab locally against the in-memory store.
 *   node functions/_arcadelab/build/dev-server.mjs [port]     then open /arcade/lab/roll-ball/
 * Everybody is the tester 'dev' (add ?as=nobody to the page url to see the 404).
 * pages.js is rebuilt on every page load, so edits show up on reload. */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { memoryDb } from '../db-memory.js';
import { handle } from '../api.js';
import { FLAGS } from '../registry.js';
import { render } from './pages.mjs';
import * as content from '../content/index.js';
import { dateKey } from '../shared/seed.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(HERE, '../../..');
export function startDev(port = 8787) {
  const db = memoryDb({ roles: { dev: 'tester', boss: 'admin' }, names: { dev: 'dev' }, flags: Object.fromEntries(FLAGS.map(f => [f, 'testers'])) });
  content.setLookups(JSON.parse(fs.readFileSync(path.join(REPO, 'functions/_stumpire/data/search_avg.json'), 'utf8')).values);
  /* Today's content, so Whack the Right Player and Drop Board are playable
     here: Claude's drafts, published for today (and yesterday, for practice). */
  const W = content.whack, D = content.drop, today = dateKey(Date.now());
  const yday = new Date(Date.parse(today + 'T12:00:00Z') - 86400000).toISOString().slice(0, 10);
  const wdefs = [0, 7, 3].map(i => W.draftPrompt(W.TEMPLATES[i]).def);
  for (const d of [today, yday]) {
    db.insertSlate({ game_id: 'whack', date_key: d, payload: W.snapshotSlate(wdefs) });
    db.insertSlate({ game_id: 'drop-board', date_key: d, payload: D.snapshotTheme(D.draftTheme(D.STAT_THEMES[d === today ? 0 : 5]).def) });
  }
  let who = 'dev';
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    if (url.searchParams.get('as')) who = { nobody: 'nobody', boss: 'boss' }[url.searchParams.get('as')] || 'dev';
    if (url.pathname.startsWith('/api/arcade/')) {
      let body = null;
      if (req.method !== 'GET') { const chunks = []; for await (const c of req) chunks.push(c); try { body = JSON.parse(Buffer.concat(chunks).toString() || '{}'); } catch (e) { body = {}; } }
      const r = await handle({ method: req.method, path: url.pathname.slice('/api/arcade/'.length), query: Object.fromEntries(url.searchParams), body, uid: who, guestId: null }, { db, now: () => Date.now(), content: async () => content });
      res.writeHead(r.status, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify(r.body));
    }
    if (url.pathname.startsWith('/arcade/lab/')) {
      fs.writeFileSync(path.join(HERE, '../pages.js'), render());
      const { pageGate } = await import(pathToFileURL(path.join(HERE, '../gate.js')).href + '?t=' + Date.now());
      const out = await pageGate(url.pathname.slice('/arcade/lab/'.length), who, db);
      if (!out) { res.writeHead(404, { 'Content-Type': 'text/html' }); return res.end(fs.readFileSync(path.join(REPO, '404.html'))); }
      res.writeHead(200, { 'Content-Type': out.type, 'Cache-Control': 'no-store' }); return res.end(out.body);
    }
    const f = path.join(REPO, decodeURIComponent(url.pathname));
    if (f.startsWith(REPO) && fs.existsSync(f) && fs.statSync(f).isFile()) {
      const ext = path.extname(f);
      res.writeHead(200, { 'Content-Type': ext === '.js' ? 'text/javascript' : ext === '.html' ? 'text/html' : 'application/octet-stream' });
      return res.end(fs.readFileSync(f));
    }
    res.writeHead(404); res.end('nf');
  });
  return new Promise(r => server.listen(port, () => r({ server, db })));
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const port = +process.argv[2] || 8787;
  await startDev(port); console.log('http://localhost:' + port + '/arcade/lab/roll-ball/');
}
