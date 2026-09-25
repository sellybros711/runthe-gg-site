/* Every icon Run The Diamond ships, drawn from ONE pixel baseball.
 *
 *   node baseball/build/icons.mjs
 *
 * The ball is the one on top of the logo (baseball/logo.webp, cut out by
 * build/logo.py), redrawn here as real pixel art rather than cropped out of the
 * artwork. The artwork is painted pixels on no fixed grid, so a crop resampled to
 * 32px or 192px turns into mush. A ball drawn on its own grid of cells lands every
 * cell on whole pixels at every size, which is the hoops logo's rule arriving here.
 * It replaced a cut diamond with a seam across it, which lasted a day.
 *
 * THE GRID IS ODD, so the ball has a middle column and sits square. 25 cells for
 * everything but the favicon, plus one cell of shadow down and to the right.
 *
 * THE FAVICON IS A DIFFERENT DRAWING, NOT A SMALLER ONE. At 15 cells the zigzag
 * stitches of the big ball crowd into a red smear, so the small one keeps its seams
 * as plain curved lines. 15 cells and a shadow is 16, so the 32px favicon is that
 * at exactly 2x.
 *
 * EVERY SIZE IS A WHOLE MULTIPLE OF THE GRID. A pixel ball scaled by 1.3 has cells
 * one and two pixels wide at random. So each target picks a cell size in whole
 * pixels and centres the ball in what is left.
 *
 * The app icons keep the page's cream stock (a home screen icon needs a background)
 * and the header mark, the share card mark and the favicon are transparent. The
 * maskable icon keeps the ball inside Android's 80% safe circle.
 */
import { createRequire } from 'module';
import { writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const { chromium } = createRequire('/opt/node22/lib/node_modules/')('playwright');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, '..');

const PAL = {
  o: '#1e1a12',              // outline
  w: '#f6efdc',              // leather
  h: '#fffaee',              // the highlight, top left
  s: '#ddd2b4',              // shade
  d: '#c4b793',              // deep shade, bottom right
  r: '#c8352a',              // the seams
  k: 'rgba(58,42,24,.28)',   // the drop shadow
};

/* One ball on a D x D grid, as rows of palette keys (null is transparent). */
function ballGrid(D, { zig = true } = {}) {
  const g = Array.from({ length: D }, () => Array(D).fill(null));
  const c = (D - 1) / 2, R = D / 2 - 0.2;
  const inside = (x, y) => Math.hypot(x - c, y - c) <= R;
  for (let y = 0; y < D; y++) for (let x = 0; x < D; x++) {
    if (!inside(x, y)) continue;
    // two cells of outline on the big ball, the weight the logo's ball has; one on the favicon
    const t = D >= 21 ? 2 : 1;
    const near = [];
    for (let dy = -t; dy <= t; dy++) for (let dx = -t; dx <= t; dx++) if (Math.abs(dx) + Math.abs(dy) <= t) near.push([dx, dy]);
    if (near.some(([dx, dy]) => !inside(x + dx, y + dy))) { g[y][x] = 'o'; continue; }
    const hl = Math.hypot(x - (c - R * 0.35), y - (c - R * 0.35));
    const sd = Math.hypot(x - (c - R * 0.25), y - (c - R * 0.25));
    g[y][x] = hl < R * 0.28 ? 'h' : sd > R * 1.12 ? 'd' : sd > R * 0.92 ? 's' : 'w';
  }
  // two seams bowing toward the middle, stopped short of the outline,
  // stitched by stepping a cell out and back every other pair of rows
  for (const side of [-1, 1]) {
    for (let y = 2; y < D - 2; y++) {
      const t = (y - c) / R;
      if (Math.abs(t) > 0.64) continue;
      const x = Math.round(c + side * R * (0.74 - 0.36 * (1 - t * t)));
      const step = !zig ? 0 : Math.floor((y + 1) / 2) % 2 === 0 ? -side : side;
      for (const xx of [x, x + step]) if (g[y][xx] && g[y][xx] !== 'o') g[y][xx] = 'r';
    }
  }
  return g;
}

/* The ball as crisp SVG rects, `px` pixels to the cell, placed at (ox, oy), with
   its one cell shadow. Returns the markup and the size it covers. */
function ballRects(D, px, ox = 0, oy = 0, opts) {
  const g = ballGrid(D, opts);
  let shadow = '', body = '';
  for (let y = 0; y < D; y++) for (let x = 0; x < D; x++) {
    if (!g[y][x]) continue;
    shadow += `<rect x="${ox + (x + 1) * px}" y="${oy + (y + 1) * px}" width="${px}" height="${px}" fill="${PAL.k}"/>`;
    body += `<rect x="${ox + x * px}" y="${oy + y * px}" width="${px}" height="${px}" fill="${PAL[g[y][x]]}"/>`;
  }
  return { markup: shadow + body, size: (D + 1) * px };
}

/* A square icon of side S: the ball at the largest whole cell size that fits in
   `fill` of the square, centred, on cream or on nothing. */
function icon(S, { D = 25, fill = 0.82, background = true, opts } = {}) {
  const px = Math.max(1, Math.floor((S * fill) / (D + 1)));
  const size = (D + 1) * px, o = Math.floor((S - size) / 2);
  const { markup } = ballRects(D, px, o, o, opts);
  const bg = background ? `<defs><radialGradient id="cream" cx=".5" cy=".38" r=".85">
      <stop offset="0" stop-color="#f7f2e8"/><stop offset=".7" stop-color="#ece2cf"/><stop offset="1" stop-color="#ddcdb0"/>
    </radialGradient></defs><rect width="${S}" height="${S}" fill="url(#cream)"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}" shape-rendering="crispEdges">${bg}${markup}</svg>`;
}

/* The header mark is the SVG at one unit to the cell, drawn at 26 CSS pixels, so a
   cell is exactly 2 or 3 device pixels on a phone and the vector is crisp anyway. */
const MARK = (() => {
  const { markup, size } = ballRects(25, 1);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges">${markup}</svg>`;
})();

const TARGETS = [
  ['icon-512.png', 512, icon(512)],
  ['icon-192.png', 192, icon(192)],
  ['apple-touch-icon.png', 180, icon(180)],
  ['icon-maskable-512.png', 512, icon(512, { fill: 0.62 })],
  ['favicon-32.png', 32, icon(32, { D: 15, fill: 1, background: false, opts: { zig: false } })],
  ['mark-256.png', 256, icon(256, { fill: 1, background: false })],
];

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage();
for (const [file, size, svg] of TARGETS) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<!doctype html><html><body style="margin:0;background:transparent">${svg}</body></html>`);
  await page.screenshot({ path: path.join(OUT, file), clip: { x: 0, y: 0, width: size, height: size }, omitBackground: true });
  console.log('wrote baseball/' + file + ' at ' + size);
}
await browser.close();

writeFileSync(path.join(OUT, 'mark.svg'), MARK);
console.log('wrote baseball/mark.svg');
