/* The logo, the icons and the favicons, all from one pixel grid.
 *
 *   node hoops/build/logo.mjs
 *
 * The art is hoops/build/logo-art.mjs. This file lays it out at every size the site
 * needs and screenshots each one. The file names are the football game's, so a person
 * who knows where that game keeps its icons knows where this one keeps them:
 *
 *   favicon-16, -32, -48      the 15 cell ball at 1x, 2x and 3x, plus its shadow
 *   apple-touch-icon (180)    the tile, full bleed, because iOS rounds it itself
 *   icon-192, icon-512        the tile with its own rounded corners
 *   icon-maskable-512         full bleed, the ball inside the 80% safe circle
 *   logo.png (512)            the ball on nothing, large
 *   mark.png (22)             the ball at 1x for the top bar, which scales it by whole numbers
 *   wordmark.png              RUN THE FLOOR on one line, on nothing
 *   logo-lockup.png           the ball and the stacked wordmark, on the tile's navy
 *
 * EVERY SIZE IS A WHOLE MULTIPLE OF THE GRID, and the shadow is one cell. A ball scaled
 * by 1.3 is a ball whose cells are one and two pixels wide at random, which reads as a
 * rendering fault rather than as pixel art. So the favicons use the 15 cell ball (16 is
 * fifteen cells and a one pixel shadow) and everything larger uses the 21 cell one.
 *
 * THE MASKABLE ICON KEEPS THE BALL INSIDE 58% OF THE SQUARE. Android crops a maskable
 * icon to any shape it likes, down to a circle of 80% of the width.
 *
 * THE WORDMARK IS PRESS START 2P, fetched and inlined, which is og.mjs's lesson: Chromium
 * here cannot reach Google Fonts on its own, and a wordmark rendered in the fallback
 * would ship as the logo. It refuses to write if the face did not load. The type sizes
 * are multiples of 8, because the face is drawn on an 8 pixel grid and any other size
 * puts its own pixels between screen pixels.
 */
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { createRequire } from 'node:module';
import { ball } from './logo-art.mjs';

const { chromium } = createRequire('/opt/node22/lib/node_modules/')('playwright');
const OUT = path.resolve('hoops');

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) '
  + 'Chrome/126.0.0.0 Safari/537.36';
const curl = (url, binary) => execFileSync('curl', ['-sSL', '-A', UA, url],
  { maxBuffer: 64 * 1024 * 1024, encoding: binary ? 'buffer' : 'utf8' });
let css = curl('https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap', false);
for (const u of new Set(css.match(/https:\/\/fonts\.gstatic\.com\/[^)]+/g) || [])) {
  css = css.split(u).join('data:font/woff2;base64,' + curl(u, true).toString('base64'));
}

const SHADOW = '#05060b';
/* A ball of N cells at `cell` pixels a cell, with a hard one cell shadow down and right. */
const px = (N, cell) => `<div style="width:${N * cell + cell}px;height:${N * cell + cell}px;position:relative">
  <div style="position:absolute;left:0;top:0;width:${N * cell}px;height:${N * cell}px;filter:drop-shadow(${cell}px ${cell}px 0 ${SHADOW})">${ball(N)}</div></div>`;
/* The tile: navy, a lighter inner rim, and scanlines, which is what makes a dark square
   read as a screen rather than as a hole. */
const tile = (w, radius, rim, scan, inner) => `<div style="width:${w}px;height:${w}px;border-radius:${radius}px;
  overflow:hidden;position:relative;background:#10131f;box-shadow:inset 0 0 0 ${rim}px #1f2640;
  display:flex;align-items:center;justify-content:center">
  <div style="position:absolute;inset:0;background:repeating-linear-gradient(0deg,rgba(0,0,0,.28) 0 ${scan}px,transparent ${scan}px ${scan * 2}px)"></div>
  <div style="position:relative">${inner}</div></div>`;

const WM = (a, b, bottom) => `
  <span style="display:block;font-size:${a}px;color:#e8edf7;text-shadow:${a / 11}px ${a / 11}px 0 #3a4466">RUN THE</span>
  <span style="display:block;font-size:${b}px;color:#ffae3d;margin-top:${b / 14}px;
    text-shadow:0 ${b / 14}px 0 #e8632a,0 ${b / 7}px 0 #a8341f,${b / 12}px ${bottom}px 0 ${SHADOW}">FLOOR</span>`;

const boards = {
  'favicon-16.png': px(15, 1),
  'favicon-32.png': px(15, 2),
  'favicon-48.png': px(15, 3),
  'apple-touch-icon.png': tile(180, 0, 6, 3, px(21, 6)),
  'icon-192.png': tile(192, 42, 6, 3, px(21, 6)),
  'icon-512.png': tile(512, 112, 14, 4, px(21, 16)),
  'icon-maskable-512.png': tile(512, 0, 0, 4, px(21, 13)),
  'logo.png': `<div style="width:512px;height:512px;display:flex;align-items:center;justify-content:center">${px(21, 22)}</div>`,
  'mark.png': px(21, 1),
  'wordmark.png': `<div style="display:inline-block;padding:4px 16px 16px 4px;font-family:'Press Start 2P';line-height:1;white-space:nowrap">
    <span style="font-size:32px;color:#e8edf7;text-shadow:3px 3px 0 #3a4466">RUN THE </span><span style="font-size:32px;color:#ffae3d;text-shadow:0 3px 0 #e8632a,0 6px 0 #a8341f,4px 9px 0 ${SHADOW}">FLOOR</span></div>`,
  'logo-lockup.png': `<div style="width:1680px;height:640px;background:#10131f;position:relative;display:flex;align-items:center">
    <div style="margin-left:120px;flex:none">${px(21, 18)}</div>
    <div style="margin-left:90px;font-family:'Press Start 2P';line-height:1.18">${WM(88, 176, 34)}</div>
    <div style="position:absolute;inset:0;background:repeating-linear-gradient(0deg,rgba(0,0,0,.25) 0 3px,transparent 3px 6px)"></div></div>`,
};

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 2100, height: 1000 }, deviceScaleFactor: 1 });
const html = `<!doctype html><html><head><meta charset="utf-8"><style>${css}
  body{margin:0;background:transparent} .b{display:inline-block;margin:0 0 20px;vertical-align:top}
  svg{display:block;width:100%;height:100%}</style></head><body>
  ${Object.entries(boards).map(([n, h], i) => `<div class="b" id="b${i}">${h}</div>`).join('')}
  </body></html>`;
const tmp = path.join(fs.mkdtempSync('/tmp/rtf-logo-'), 'logo.html');
fs.writeFileSync(tmp, html);
await page.goto('file://' + tmp);
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(400);
const loaded = await page.evaluate(() => {
  let ok = false;
  document.fonts.forEach((f) => { if (f.status === 'loaded' && /Press Start/.test(f.family)) ok = true; });
  return ok;
});
if (!loaded) {
  console.log('REFUSING TO WRITE: Press Start 2P did not load and the wordmark would be set in a fallback.');
  await browser.close();
  process.exit(1);
}
const names = Object.keys(boards);
for (let i = 0; i < names.length; i++) {
  const el = await page.$(`#b${i} > div`);
  await el.screenshot({ path: path.join(OUT, names[i]), omitBackground: true });
  const bb = await el.boundingBox();
  console.log('wrote hoops/' + names[i], Math.round(bb.width) + 'x' + Math.round(bb.height));
}
await browser.close();
