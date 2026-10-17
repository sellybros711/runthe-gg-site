#!/usr/bin/env node
/* Render the look for review: the players and the stadium, before any of it
 * goes into the game, and again after any change to rig.js or stage.js.
 *
 *   node 4th-and-what/build/sheet.mjs [outdir]
 *
 * Writes three pictures:
 *   sheet.png       every pose at game size, shown four times bigger, and the
 *                   run in all sixteen headings
 *   phone-snap.png  a phone at 3x: shotgun 3x1 against a six man box, set
 *   phone-play.png  the same snap a second and a half later: the pocket, the
 *                   routes, a man in coverage
 * The page imports PXHD from setlist/pxhd.js exactly as the game will, so the
 * repo is served on a local port for the browser. */
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
const EXE = process.env.CHROMIUM || ['/opt/pw-browsers/chromium'].find(f => fs.existsSync(f)) || undefined;

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..', '..');
const OUT = process.argv[2] || HERE;
fs.mkdirSync(OUT, { recursive: true });

const TYPES = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (u === '/__sheet') { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end(PAGE); }
  const f = path.join(ROOT, u);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise(r => server.listen(0, r));
const BASE = 'http://localhost:' + server.address().port;

const PAGE = `<!doctype html><html><head><meta charset="utf-8">
<style>body{margin:0;background:#15181d}canvas{display:block;image-rendering:pixelated}</style></head><body>
<canvas id="c"></canvas>
<script src="/4th-and-what/rig.js"></script><script src="/4th-and-what/stage.js"></script>
<script type="module">
import PXHD from '/setlist/pxhd.js?v=2';
const R = window.FAW_RIG, ST = window.FAW_STAGE;
R.init(PXHD);
const K = 6.5, PITCH = 0.6;
window.sheet = function () {
  const Z = 4, c = document.getElementById('c'), x = c.getContext('2d');
  const W = 1500, H = 980; c.width = W; c.height = H;
  x.imageSmoothingEnabled = false;
  x.fillStyle = '#15181d'; x.fillRect(0, 0, W, H);
  const lab = (t, a, b, s) => { x.fillStyle = '#e9e4d8'; x.font = (s || 13) + 'px monospace'; x.fillText(t, a, b); };
  const turf = (y0, h) => { for (let i = 0; i * 44 < h; i++) { x.fillStyle = i % 2 ? '#3f8f45' : '#479a4c'; x.fillRect(0, y0 + i * 44, W, Math.min(44, h - i * 44)); } };
  lab('4th and What players: traced from a 3D model and painted by PXHD, shown at 4x the size the game draws them', 16, 24, 15);
  const POSES = ['idle', 'stance', 'stance3', 'run', 'block', 'catch', 'carry', 'throw', 'dive', 'down'];
  const KINDS = [['offense', false, 'offense, skill', 180], ['offense', true, 'offense, lineman', 180], ['defense', false, 'defense, facing you', 0], ['defense', true, 'defense lineman', 0]];
  turf(36, 4 * 150 + 10);
  KINDS.forEach((k, r) => {
    let col = 0;
    lab(k[2], 10, 56 + r * 150, 11);
    POSES.forEach(p => {
      for (let f = 0; f < R.frameCount(p); f++) {
        const s = R.sprite({ pose: p, frame: f, yaw: k[3], team: k[0], big: k[1], skin: (r * 5 + col) % 6, k: K, pitch: PITCH });
        const px = 70 + col * 72, py = 168 + r * 150;
        if (r === 0) lab(p + (R.frameCount(p) > 1 ? ' ' + (f + 1) : ''), px - 6, 50, 10);
        x.drawImage(s.canvas, Math.round(px - s.footX * Z / 2), Math.round(py - s.footY * Z / 2), s.w * Z / 2, s.h * Z / 2);
        col++;
      }
    });
  });
  const y0 = 36 + 4 * 150 + 30;
  lab('the run in all sixteen headings (offense, then defense), at 2x', 16, y0 - 6, 13);
  turf(y0, 300);
  for (let t = 0; t < 2; t++) for (let i = 0; i < 16; i++) {
    const s = R.sprite({ pose: 'run', frame: i % 4, yaw: i * 22.5, team: t ? 'defense' : 'offense', skin: i, k: K, pitch: PITCH });
    const px = 50 + i * 90, py = y0 + 120 + t * 140;
    x.drawImage(s.canvas, Math.round(px - s.footX * 2), Math.round(py - s.footY * 2), s.w * 2, s.h * 2);
  }
  return true;
};

/* An 11 on 11 at the 40, as the phone shows it: a 260 by 400 cell picture
   shown at 390 by 600 points. t is 0 at the set, 1 a beat after the snap. */
const BIG = 1.35;   /* players drawn a size up from life, as console games do */
window.phone = function (t) {
  const c = document.getElementById('c'), x = c.getContext('2d');
  const W = 260, H = 400;
  c.width = W; c.height = H; c.style.width = '390px'; c.style.height = '600px';
  x.imageSmoothingEnabled = false;
  const LOS = 60, MID = ST.FIELD_W / 2, FD = LOS + 7;
  const cam = ST.camera(W, H, MID, LOS);
  x.drawImage(ST.render(cam, { pxhd: PXHD }), 0, 0);
  const line = (Y, col) => { const a = cam.pr([-1, Y, 0]), b = cam.pr([ST.FIELD_W + 1, Y, 0]); if (!a || !b) return; x.fillStyle = col; x.fillRect(Math.round(a[0]), Math.round(a[1]) - 1, Math.round(b[0] - a[0]), 2); };
  line(LOS, 'rgba(74,163,255,.85)'); line(FD, 'rgba(255,210,63,.95)');
  ST.goalpost(x, cam, PXHD);
  const P = [];
  const O = t ? [
    [-4, -1.4, 'block', 1, 0, 1], [-2, -1.1, 'block', 1, 0, 1], [0, -1.0, 'block', 0, 0, 1], [2, -1.1, 'block', 1, 0, 1], [4, -1.4, 'block', 0, 0, 1],
    [0.4, -7, 'throw', 0, 0, 0], [2.4, -4.6, 'block', 1, 20, 0], [-14, 9, 'run', 2, 60, 0], [-9.5, 6, 'run', 1, -20, 0], [-5.5, 11, 'run', 3, 30, 0], [13, 8, 'run', 0, -20, 0]
  ] : [
    [-4, -1.3, 'stance3', 0, 0, 1], [-2, -1.3, 'stance3', 0, 0, 1], [0, -1.3, 'stance3', 0, 0, 1], [2, -1.3, 'stance3', 0, 0, 1], [4, -1.3, 'stance3', 0, 0, 1],
    [0, -5.5, 'stance', 0, 0, 0], [2.2, -5.5, 'stance', 0, 0, 0], [-15, -1.2, 'stance', 0, 0, 0], [-10.5, -1.8, 'stance', 0, 0, 0], [-6.5, -1.8, 'stance', 0, 0, 0], [13, -1.2, 'stance', 0, 0, 0]
  ];
  const D = t ? [
    [-3.6, 0.2, 'block', 0, 180, 1], [-1.1, 0.4, 'block', 1, 180, 1], [1.2, 0.4, 'block', 0, 180, 1], [4.2, -0.6, 'run', 2, 210, 1],
    [-3.5, 4.5, 'run', 1, 160, 0], [4.5, 5.5, 'run', 3, 200, 0], [-13.4, 10, 'run', 0, 60, 0], [12, 9.5, 'run', 2, 170, 0], [-9, 7.6, 'run', 1, 200, 0], [-6, 15, 'run', 3, 180, 0], [6, 16, 'run', 1, 170, 0]
  ] : [
    [-5, 1.3, 'stance3', 0, 180, 1], [-1.8, 1.3, 'stance3', 0, 180, 1], [1.8, 1.3, 'stance3', 0, 180, 1], [5, 1.3, 'stance3', 0, 180, 1],
    [-3.5, 5, 'stance', 0, 180, 0], [3.5, 5, 'stance', 0, 180, 0], [-15, 6.5, 'stance', 0, 180, 0], [13, 6.5, 'stance', 0, 180, 0], [-8.5, 7, 'stance', 0, 180, 0], [-5, 13, 'idle', 0, 180, 0], [6, 13, 'idle', 0, 180, 0]
  ];
  /* heading is degrees from straight downfield toward the right sideline */
  O.forEach((p, i) => P.push({ X: MID + p[0], Y: LOS + p[1], pose: p[2], frame: p[3], head: p[4], big: !!p[5], team: 'offense', skin: i }));
  D.forEach((p, i) => P.push({ X: MID + p[0], Y: LOS + p[1], pose: p[2], frame: p[3], head: p[4], big: !!p[5], team: 'defense', skin: i + 2 }));
  P.forEach(p => { const s = cam.pr([p.X, p.Y, 0]), sc = cam.scaleAt(p.X, p.Y); ST.shadow(x, s[0], s[1], sc.k * 3 * 1.6 * BIG); });
  P.sort((a, b) => b.Y - a.Y).forEach(p => {
    const s = cam.pr([p.X, p.Y, 0]), sc = cam.scaleAt(p.X, p.Y);
    R.draw(x, { pose: p.pose, frame: p.frame, team: p.team, big: p.big, skin: p.skin, k: sc.k * BIG, pitch: sc.pitch, yaw: 180 - (p.head - sc.yawTo) }, s[0], s[1]);
  });
  if (!t) { const b = cam.pr([MID, LOS - 0.3, 0]); x.fillStyle = '#7a4320'; x.fillRect(Math.round(b[0]) - 1, Math.round(b[1]) - 2, 3, 2); }
  else {
    const g = cam.pr([MID - 5, LOS + 7, 0]), a = cam.pr([MID - 5, LOS + 7, 3.6]);
    x.fillStyle = 'rgba(16,30,60,.35)'; x.fillRect(Math.round(g[0]) - 1, Math.round(g[1]), 3, 1);
    x.fillStyle = '#7a4320'; x.fillRect(Math.round(a[0]) - 2, Math.round(a[1]) - 1, 4, 3);
    x.fillStyle = '#f4efe4'; x.fillRect(Math.round(a[0]) - 1, Math.round(a[1]), 2, 1);
  }
  ST.vignette(x, W, H);
  return true;
};
window.ready = true;
</script></body></html>`;

const browser = await chromium.launch(EXE ? { executablePath: EXE } : {});
const errs = [];
async function shot(fn, arg, file, vp, dpr) {
  const page = await browser.newPage({ viewport: vp, deviceScaleFactor: dpr || 1 });
  page.on('pageerror', e => errs.push(String(e)));
  page.on('console', m => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) errs.push(m.text()); });
  await page.goto(BASE + '/__sheet');
  await page.waitForFunction(() => window.ready === true, null, { timeout: 15000 });
  const t0 = Date.now();
  await page.evaluate(([f, a]) => window[f](a), [fn, arg]);
  const ms = Date.now() - t0;
  await page.locator('#c').screenshot({ path: path.join(OUT, file) });
  await page.close();
  console.log('wrote ' + file + ' (' + ms + ' ms to draw)');
}
await shot('sheet', 0, 'sheet.png', { width: 1500, height: 980 });
await shot('phone', 0, 'phone-snap.png', { width: 390, height: 600 }, 3);
await shot('phone', 1, 'phone-play.png', { width: 390, height: 600 }, 3);
await browser.close();
server.close();
if (errs.length) { console.error(errs.join('\n')); process.exit(1); }
