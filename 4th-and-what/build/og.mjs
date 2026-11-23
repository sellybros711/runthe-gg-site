#!/usr/bin/env node
/* Render the share card: what a link to the game unfurls as in iMessage,
 * WhatsApp, Discord and Slack (the launch plan, Phase 4: share and search).
 *
 *   node 4th-and-what/build/og.mjs [outdir] [seed]
 *
 * Writes og.png (1200x630, to 4th-and-what/ by default). It is the game's own
 * Home at the card's size: the banner over a play from the library, held still
 * (reduced motion is Home's still frame; Home shuffles with Math.random, so
 * the page gets a seeded one and the same seed draws the same play), with the day's card swapped for a
 * line that never goes stale. A cached preview outlives the day, so it says no
 * day's facts. The repo is served on a local port so the page loads its
 * scripts the way the game does. After a change, bump og.png's ?v= in
 * index.html. */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch (_) { for (const p of ['/opt/node22/lib/node_modules/playwright', '/root/node-tools/node_modules/playwright']) { try { ({ chromium } = require(p)); break; } catch (e) {} } }
if (!chromium) { console.error('playwright is not installed'); process.exit(2); }

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..', '..');
const OUT = process.argv[2] || path.join(ROOT, '4th-and-what');
const SEED = +(process.argv[3] || 1);

const TYPES = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  let u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (u.endsWith('/')) u += 'index.html';
  const f = path.join(ROOT, u);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise(r => server.listen(0, r));
const BASE = 'http://localhost:' + server.address().port;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
page.on('pageerror', e => console.error('page error:', e.message));
await page.emulateMedia({ reducedMotion: 'reduce' });
await page.addInitScript(seed => {
  let a = seed >>> 0;
  Math.random = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}, SEED);
await page.goto(BASE + '/4th-and-what/');
await page.waitForTimeout(2000);
await page.evaluate(() => {
  /* the top bar keeps the logo, the tabs and RunThe.GG; buttons read as clutter on a card */
  document.querySelectorAll('.topbar button:not(.tab), .topbar .navr > :not(.home)').forEach(n => { n.style.display = 'none'; });
  const box = document.getElementById('hdBox');
  box.hidden = false;
  box.innerHTML = '<span class="dnum">A football game</span><span class="hdsit">Go for it on 4th down</span>'
    + '<span class="hdmeta">Read the defense. Call the play.</span><span class="btn gold big">Play free</span>';
});
await page.waitForTimeout(300);
await page.screenshot({ path: path.join(OUT, 'og.png') });
console.log('wrote', path.join(OUT, 'og.png'), 'seed', SEED, ':', await page.textContent('#hName'));
await browser.close();
server.close();
