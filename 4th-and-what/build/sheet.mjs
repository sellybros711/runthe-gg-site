#!/usr/bin/env node
/* Render the sprite sheet to a PNG, for the owner to look at before any art
 * goes into the game, and again after any change to sprites.js.
 *
 *   node 4th-and-what/build/sheet.mjs [out.png]
 *
 * Top: every pose and frame, facing up, for a skill player and a lineman on
 * each side, at 4x. Middle: the run cycle in all four facings. Bottom: an
 * 11 on 11 snap at the size a phone draws it, so the box can be counted. */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch (_) { for (const p of ['/opt/node22/lib/node_modules/playwright', '/root/node-tools/node_modules/playwright']) { try { ({ chromium } = require(p)); break; } catch (e) {} } }
if (!chromium) { console.error('playwright is not installed'); process.exit(2); }
const EXE = process.env.CHROMIUM || ['/opt/pw-browsers/chromium'].find(f => fs.existsSync(f)) || undefined;

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = process.argv[2] || path.join(HERE, 'sheet.png');
const SPRITES = fs.readFileSync(path.join(HERE, '..', 'sprites.js'), 'utf8');

const html = `<!doctype html><html><body style="margin:0;background:#1b1f24">
<canvas id="c"></canvas><script>${SPRITES}</script><script>(function () {
const S = window.FAW_SPRITES, c = document.getElementById('c'), x = c.getContext('2d');
const W = 1500, H = 700; c.width = W; c.height = H;
x.fillStyle = '#1b1f24'; x.fillRect(0, 0, W, H);
function turf(x0, y0, w, h) {
  for (let i = 0; i * 40 < h; i++) { x.fillStyle = i % 2 ? '#2f8a4a' : '#338f4e'; x.fillRect(x0, y0 + i * 40, w, Math.min(40, h - i * 40)); }
}
function label(t, px, py, size, col) { x.fillStyle = col || '#e9e4d8'; x.font = (size || 14) + 'px monospace'; x.fillText(t, px, py); }

label('4th and What: player sprites (16x16, drawn facing up, the other facings are quarter turns)', 20, 28, 16);
const POSES = ['idle', 'stance', 'run', 'block', 'catch', 'carry', 'throw', 'dive', 'down'];
const KINDS = [['offense', false, 'offense, skill'], ['offense', true, 'offense, lineman'], ['defense', false, 'defense, skill'], ['defense', true, 'defense, lineman']];
const CELL = 4, BOX = 72;
turf(0, 44, W, 4 * (BOX + 22) + 30);
KINDS.forEach((k, r) => {
  const y = 60 + r * (BOX + 22);
  label(k[2], 14, y + 12, 12);
  let col = 0;
  POSES.forEach(p => {
    const n = S.frameCount(p);
    for (let f = 0; f < n; f++) {
      const px = 150 + col * (BOX - 2);
      if (r === 0) label(p + (n > 1 ? ' ' + (f + 1) : ''), px - 4, 56, 10);
      S.draw(x, { pose: p, frame: f, team: k[0], big: k[1], skin: (r * 3 + col) % 6 }, px + BOX / 2 - 10, y + BOX / 2 + 4, CELL);
      col++;
    }
  });
});

let y0 = 60 + 4 * (BOX + 22) + 30;
label('run cycle, four facings (up, right, down, left), and the ball', 20, y0 + 22, 14);
turf(0, y0 + 32, W, 2 * (BOX + 12) + 20);
['offense', 'defense'].forEach((t, r) => {
  for (let face = 0; face < 4; face++) for (let f = 0; f < 4; f++) {
    const px = 40 + face * 4 * (BOX - 6) + f * (BOX - 6) + face * 24;
    S.draw(x, { pose: t === 'offense' ? 'run' : 'run', frame: f, facing: face, team: t, skin: f + face }, px + 30, y0 + 80 + r * (BOX + 12), CELL);
  }
});
label('ball', W - 150, y0 + 60, 12);
S.drawBall(x, W - 130, y0 + 90, CELL, true);
S.drawBall(x, W - 80, y0 + 90, CELL, false);

window.done = true;
})();
</script></body></html>`;

const browser = await chromium.launch(EXE ? { executablePath: EXE } : {});
const page = await browser.newPage({ viewport: { width: 1500, height: 700 } });
const errs = [];
page.on('pageerror', e => errs.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await page.setContent(html);
await page.waitForFunction(() => window.done === true, null, { timeout: 10000 }).catch(() => {});
await page.locator('#c').screenshot({ path: OUT });
/* The phone frame: 390 css px wide at a phone's 3x density, the field 36
   yards across and 30 deep (a yard is 390 / 36 = 10.8 css px). A sprite
   pixel is 4 device pixels, so a player is 21 css px, about 2 yards: the
   linemen stand 2 yards apart, wider than real splits, so none overlap. */
const PHONE = OUT.replace(/\.png$/, '') + '-phone.png';
const phone = await browser.newPage({ viewport: { width: 390, height: 330 }, deviceScaleFactor: 3 });
phone.on('pageerror', e => errs.push(String(e)));
await phone.setContent(`<!doctype html><html><body style="margin:0;background:#1b1f24">
<canvas id="c" style="width:390px;height:330px;display:block"></canvas><script>${SPRITES}</script><script>(function () {
const S = window.FAW_SPRITES, c = document.getElementById('c'), x = c.getContext('2d');
const D = 3, YD = 390 / 36 * D; c.width = 390 * D; c.height = 330 * D;
for (let i = 0; i < 6; i++) { x.fillStyle = i % 2 ? '#2f8a4a' : '#338f4e'; x.fillRect(0, i * 5 * YD, c.width, 5 * YD); }
const los = 18 * YD, mid = c.width / 2;
x.fillStyle = 'rgba(255,255,255,.55)';
for (let yd = 0; yd <= 30; yd++) { const y = los - (yd - 12) * YD; x.fillRect(mid - 6 * YD, y - 1, 1.2 * YD, 3); x.fillRect(mid + 4.8 * YD, y - 1, 1.2 * YD, 3); }
for (let yd = -10; yd <= 20; yd += 5) x.fillRect(0, los - (yd + 0) * YD - 2, c.width, 4);
x.fillStyle = '#4aa3ff'; x.fillRect(0, los - 4, c.width, 8);
x.fillStyle = '#ffd23f'; x.fillRect(0, los - 5 * YD - 4, c.width, 8);
const O = [[-4, 1.2, 1], [-2, 1.2, 1], [0, 1.2, 1], [2, 1.2, 1], [4, 1.2, 1], [0, 5.5, 0], [2, 5.5, 0], [-15, 1, 0], [-10.5, 1.8, 0], [-6.5, 1.8, 0], [13, 1, 0]];
const DF = [[-5, -1.4, 1], [-1.8, -1.4, 1], [1.8, -1.4, 1], [5, -1.4, 1], [-3.5, -5, 0], [3.5, -5, 0], [-15, -6.5, 0], [13, -6.5, 0], [-8.5, -7, 0], [-5, -13, 0], [6, -13, 0]];
DF.forEach((p, i) => S.draw(x, { pose: p[2] ? 'stance' : 'idle', facing: 2, team: 'defense', big: !!p[2], skin: i + 2 }, mid + p[0] * YD, los + p[1] * YD, 4));
O.forEach((p, i) => S.draw(x, { pose: p[2] ? 'stance' : 'idle', team: 'offense', big: !!p[2], skin: i }, mid + p[0] * YD, los + p[1] * YD, 4));
S.drawBall(x, mid, los + 0.1 * YD, 3, true);
window.done = true;
})();</script></body></html>`);
await phone.waitForFunction(() => window.done === true, null, { timeout: 10000 }).catch(() => {});
await phone.screenshot({ path: PHONE });
console.log('wrote ' + PHONE);
await browser.close();
if (errs.length) { console.error(errs.join('\n')); process.exit(1); }
console.log('wrote ' + OUT);
