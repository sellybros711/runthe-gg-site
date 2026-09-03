#!/usr/bin/env node
/* WHAT DOES AN ARCADE GAME PAGE ACTUALLY COST TO OPEN?
 *
 * Written because the number everybody quotes is the wrong one. `ls -S` says
 * a game ships 2.5 MB of script, and the plan's payload pass was ranked off
 * that figure, but Cloudflare compresses JavaScript on the way out: former.js
 * is 1225 KB on disk and about 171 KB on the wire. Optimising against the disk
 * figure would have chased the wrong seven eighths.
 *
 * The cost that compression does NOT touch is parsing. A megabyte of JSON
 * written as a JavaScript object literal is a megabyte the main thread reads
 * before the player can press anything, on a phone, every time. That is the
 * number this prints next to the wire figure, so the two are never confused
 * again.
 *
 *   node scripts/measure-payload.mjs                 every arcade page
 *   node scripts/measure-payload.mjs career guess    just those
 *
 * It serves the working tree over a local server that gzips exactly the way
 * Cloudflare does, drives a real browser at it, and reports per page:
 *
 *   wire      bytes actually transferred, compressed
 *   raw       bytes the parser sees
 *   files     how many requests
 *   DCL       milliseconds to DOMContentLoaded, which on these pages is when
 *             the last blocking script has been compiled and run
 *
 * Needs no network. The CDN and Supabase are blocked at the browser, the same
 * way the other browser checks in this repo block them, so the numbers are the
 * site's own weight and not a third party's.
 */
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const PW = '/opt/node22/lib/node_modules/playwright/index.js';
const EXE = '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
                '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png',
                '.webp': 'image/webp', '.ico': 'image/x-icon' };
/* Cloudflare compresses text and leaves images alone. Matching that is the
   whole point: a measurement that gzips a PNG would flatter the page. */
const COMPRESS = new Set(['.html', '.js', '.json', '.css', '.svg']);

function serve(port) {
  return new Promise((res) => {
    const s = createServer((req, rep) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p.endsWith('/')) p += 'index.html';
      const file = path.join(ROOT, p.replace(/^\/+/, ''));
      if (!file.startsWith(ROOT) || !existsSync(file) || statSync(file).isDirectory()) {
        rep.writeHead(404).end('not found');
        return;
      }
      const ext = path.extname(file);
      let body = readFileSync(file);
      const head = { 'Content-Type': TYPES[ext] || 'application/octet-stream' };
      if (COMPRESS.has(ext) && /gzip/.test(req.headers['accept-encoding'] || '')) {
        body = gzipSync(body, { level: 6 });
        head['Content-Encoding'] = 'gzip';
      }
      head['Content-Length'] = body.length;
      rep.writeHead(200, head).end(body);
    });
    s.listen(port, () => res(s));
  });
}

const kb = (n) => Math.round(n / 1024);

const pages = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ['sportegories', 'crossword', 'almamater', 'career', 'match', 'rollcall', 'chain',
     'rankit', 'guess', 'table', 'oddone', 'highlow'];

/* Playwright is CommonJS, so the namespace object from a dynamic import puts
   its exports under .default rather than at the top level. */
const pw = await import(PW);
const { chromium } = pw.default || pw;
const PORT = 8611;
const server = await serve(PORT);
const browser = await chromium.launch({ executablePath: EXE });

const rows = [];
for (const name of pages) {
  const ctx = await browser.newContext({ bypassCSP: true });
  const page = await ctx.newPage();
  /* Third parties are not this site's payload and their latency is not ours. */
  for (const pat of ['**cdn.jsdelivr.net**', '**supabase.co**', '**googlesyndication.com**',
                     '**google-analytics.com**', '**googletagmanager.com**', '**doubleclick.net**',
                     '**fonts.googleapis.com**', '**fonts.gstatic.com**']) {
    await page.route(pat, (r) => r.abort());
  }
  /* The fonts have to be blocked BEFORE anything is timed, not because they
     are cheap but because they are somebody else's server. Left in, the
     Google Fonts stylesheet is unreachable from this sandbox and holds
     DOMContentLoaded for twelve seconds, which is twelve seconds of a number
     that has nothing to do with how heavy the arcade is. It is a real
     render-blocking dependency on the live site and belongs in its own pass. */
  /* Keyed by path, because a page that asks for the same file twice pays for
     it once: the second request is served from the memory cache and never
     reaches the network. Summing every response event counted those twice and
     put a page 200 KB over what it actually costs. */
  const seen = new Map();
  page.on('response', async (r) => {
    const u = r.url();
    if (!u.includes(`:${PORT}/`)) return;
    const key = u.split(`:${PORT}`)[1].split('?')[0];
    if (seen.has(key)) return;
    try {
      const len = +(await r.headerValue('content-length')) || 0;
      const body = await r.body();
      seen.set(key, [len, body.length]);
    } catch { /* a response the page navigated away from */ }
  });

  await page.goto(`http://127.0.0.1:${PORT}/arcade/${name}/`, { waitUntil: 'load' });
  /* DOMContentLoaded is the number that means something here. Every one of
     these files is a blocking <script src>, so DCL is the moment the last of
     them has been fetched, compiled and run, which is the earliest the game's
     own code can do anything. Nothing lazier is being measured because nothing
     on these pages is currently lazy. */
  const dcl = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0];
    return Math.round(nav ? nav.domContentLoadedEventEnd : 0);
  });
  let wire = 0, raw = 0;
  for (const [w, r] of seen.values()) { wire += w; raw += r; }
  rows.push({ name, wire, raw, files: seen.size, dcl, parts: [...seen.entries()] });
  await ctx.close();
}
await browser.close();
server.close();

rows.sort((a, b) => b.wire - a.wire);
const line = (r) =>
  String(r.name).padEnd(14) +
  String(kb(r.wire) + ' KB').padStart(9) +
  String(kb(r.raw) + ' KB').padStart(9) +
  String(r.files).padStart(7) +
  String(r.dcl + 'ms').padStart(8);
console.log('');
console.log('page               wire      raw  files     DCL');
console.log('------------------------------------------------');
for (const r of rows) console.log(line(r));
const tot = (f) => rows.reduce((a, r) => a + r[f], 0);
console.log('------------------------------------------------');
console.log(line({ name: 'mean', wire: tot('wire') / rows.length, raw: tot('raw') / rows.length,
                   files: Math.round(tot('files') / rows.length),
                   dcl: Math.round(tot('dcl') / rows.length) }));
console.log('');

/* Asked about one page, show what it is made of. This is the view that tells
   you where to spend the next hour, and it is the reason the numbers above are
   worth having: without it "568 KB" is a fact you cannot act on. */
if (rows.length === 1) {
  const parts = rows[0].parts.slice().sort((a, b) => b[1][0] - a[1][0]);
  console.log('largest of the ' + parts.length + ' files:');
  for (const [p, [w, r]] of parts.slice(0, 14)) {
    console.log(String(kb(w) + ' KB').padStart(9) + ' wire' + String(kb(r) + ' KB').padStart(9) + ' raw   ' + p);
  }
  console.log('');
}
