#!/usr/bin/env node
/* Render the 3D stadium's poses for review, after any change to live3d.js's
 * rig or its POSE table.
 *
 *   node 4th-and-what/build/sheet3d.mjs [outdir] [pose,pose,...]
 *
 * Writes sheet3d.png: one man in every pose (or the ones named), side on,
 * from FAW_LIVE3D.sheet. The page loads the game as it ships, so the repo is
 * served on a local port, and the browser gets a software WebGL. */
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
const OUT = process.argv[2] || HERE;
const NAMES = process.argv[3] ? process.argv[3].split(',') : null;
fs.mkdirSync(OUT, { recursive: true });

const TYPES = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  let u = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (u.endsWith('/')) u += 'index.html';
  const f = path.join(ROOT, u);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const base = 'http://localhost:' + server.address().port;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1400, height: 400 } });
await page.route(/fonts\.googleapis\.com|fonts\.gstatic\.com/, (r) => r.abort());
await page.goto(base + '/4th-and-what/');
await page.waitForFunction(() => !!window.FAW_LIVE3D, null, { timeout: 20000 });
const list = await page.evaluate((names) => {
  const c = document.createElement('canvas'); c.width = 2800; c.height = 700; c.id = 'sheet3d';
  c.style.cssText = 'position:fixed;left:0;top:0;width:1400px;height:350px;z-index:9999';
  document.body.appendChild(c);
  return window.FAW_LIVE3D.sheet(c, names);
}, NAMES);
await page.waitForTimeout(300);
await page.locator('#sheet3d').screenshot({ path: path.join(OUT, 'sheet3d.png') });
console.log('wrote', path.join(OUT, 'sheet3d.png') + ':', list.join(' '));
await browser.close(); server.close();
