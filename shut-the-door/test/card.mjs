/* Shut The Door: the share card's text never overlaps (card.js).
 *
 *   node shut-the-door/test/card.mjs
 *   SHOTS=/some/dir node shut-the-door/test/card.mjs   and a PNG of every card drawn
 *
 * Draws the card in Chromium, tall and wide, for every outcome, long kickers (the longest pack
 * titles) and long "pitched like" names, with the real faces (Anton and Inter from Google Fonts,
 * as the page loads them). Every fillText is recorded with the box its glyphs really cover
 * (measureText's actualBoundingBox, under the text's own font, spacing, align and baseline), and
 * the check fails when two boxes overlap, a box leaves the image, or a text that starts inside a
 * filled tile (a fact, the verdict, a strip square, the pill) runs out of it. A layout written with a fixed
 * offset for one font fails here as soon as the drawn font is wider or taller (the owner's #16
 * card, 2026-11-10: the kicker under DOOR SHUT., PITCHED LIKE under GREG HOLLAND).
 *
 * Fails, rather than passing on a fallback font, when the faces do not load.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
/* Playwright as check-browser.mjs finds it: the repo's (CI's install-playwright.sh), else the container's */
function loadPlaywright() {
  for (const t of ['playwright', '/opt/node-tools/node_modules/playwright', '/opt/node22/lib/node_modules/playwright']) { try { return require(t); } catch (e) {} }
  throw new Error('playwright not found');
}
const { chromium } = loadPlaywright();
const CHROME = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((p) => existsSync(p));
const SHOTS = process.env.SHOTS || '';

let fails = 0;
function ok(cond, msg) { console.log((cond ? 'ok   ' : 'FAIL ') + msg); if (!cond) fails++; }

const strip = ['yellow', 'green', 'green', 'yellow', 'yellow', 'yellow', 'yellow', 'green', 'orange', 'orange', 'green'];
const base = {
  outcome: 'door_shut', strip, pitches: 11, percentile: 97, label: '#16', title: 'Game 5, 2005 NLCS',
  vsReal: 'beat', vsLabel: 'you vs Lidge', vsHead: 'you did better',
  vsWhy: "your result: door shut. real result: door's open.", pitchedLike: 'Greg Holland',
};
const CASES = [
  ['the owner\'s #16 card', {}],
  ['Jonathan Papelbon', { pitchedLike: 'Jonathan Papelbon' }],
  ['Francisco Rodriguez', { pitchedLike: 'Francisco Rodriguez' }],
  ['a long kicker', { title: 'Cardinals at Brewers, September 7, 2010', pitchedLike: 'Francisco Rodriguez' }],
  ['held the tie', { outcome: 'tie_held', vsReal: 'matched', vsHead: 'you matched history', title: 'Mariners at Angels, September 13, 2008' }],
  ["door's open", { outcome: 'doors_open', vsReal: 'lost', vsHead: 'Papelbon did better', vsLabel: 'you vs Papelbon', pitchedLike: 'Jonathan Papelbon' }],
  ['walk-off, one pitch, no percentile', { outcome: 'walk_off', pitches: 1, strip: ['red'], percentile: null, vsReal: 'lost', vsHead: 'Rodriguez did better', vsLabel: 'you vs Rodriguez' }],
  ['a preview, no verdict', { label: 'preview', vsReal: null, vsHead: null, vsWhy: null }],
];

const TYPES = { '.js': 'text/javascript', '.svg': 'image/svg+xml', '.json': 'application/json', '.html': 'text/html' };
const PAGE = `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Anton&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
</head><body>
<script src="contract.js"></script>
<script>
/* every fillText with the box its glyphs cover */
window.BOXES = [];
const fill = CanvasRenderingContext2D.prototype.fillText;
CanvasRenderingContext2D.prototype.fillText = function (t, x, y) {
  const m = this.measureText(t);
  window.BOXES.push({ t: String(t), font: this.font, l: x - m.actualBoundingBoxLeft, r: x + m.actualBoundingBoxRight, top: y - m.actualBoundingBoxAscent, bot: y + m.actualBoundingBoxDescent });
  return fill.apply(this, arguments);
};
/* every filled path's bounds (the tiles, the strip, the verdict, the pill): a text that starts in a
   tile must end in it */
window.TILES = [];
const P2 = CanvasRenderingContext2D.prototype, pb = new WeakMap();
const grow = (c, x, y) => { const b = pb.get(c); if (b) { b.l = Math.min(b.l, x); b.r = Math.max(b.r, x); b.top = Math.min(b.top, y); b.bot = Math.max(b.bot, y); } };
const begin = P2.beginPath; P2.beginPath = function () { pb.set(this, { l: Infinity, r: -Infinity, top: Infinity, bot: -Infinity }); return begin.apply(this, arguments); };
for (const k of ['moveTo', 'lineTo']) { const f = P2[k]; P2[k] = function (x, y) { grow(this, x, y); return f.apply(this, arguments); }; }
const arcTo = P2.arcTo; P2.arcTo = function (x1, y1, x2, y2) { grow(this, x1, y1); grow(this, x2, y2); return arcTo.apply(this, arguments); };
const pfill = P2.fill; P2.fill = function () { const b = pb.get(this); if (b && b.r > b.l) window.TILES.push(Object.assign({}, b)); return pfill.apply(this, arguments); };
</script>
<script src="card.js"></script>
</body></html>`;

const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
const page = await browser.newPage();
page.on('pageerror', (e) => ok(false, 'page error: ' + e.message));
await page.route('http://card.test/**', (route) => {
  const p = new URL(route.request().url()).pathname;
  if (p === '/shut-the-door/card-check.html') return route.fulfill({ body: PAGE, contentType: 'text/html' });
  const f = join(ROOT, decodeURIComponent(p));
  if (!f.startsWith(ROOT) || !existsSync(f)) return route.fulfill({ status: 404, body: '' });
  return route.fulfill({ body: readFileSync(f), contentType: TYPES[extname(f)] || 'application/octet-stream' });
});
await page.goto('http://card.test/shut-the-door/card-check.html');
const faces = await page.evaluate(async () => {
  await window.STD_CARD.fonts();
  return ['400 40px Anton', '600 40px Inter', '700 40px Inter'].map((f) => document.fonts.check(f) && [...document.fonts].some((x) => x.status === 'loaded' && f.includes(x.family)));
});
ok(faces.every(Boolean), 'the card\'s faces load (Anton 400, Inter 600 and 700): ' + faces.join(' '));
if (!faces.every(Boolean)) { await browser.close(); process.exit(1); }

if (SHOTS) mkdirSync(SHOTS, { recursive: true });
for (const size of ['tall', 'wide']) {
  for (const [name, over] of CASES) {
    const card = Object.assign({}, base, over);
    const got = await page.evaluate(async ({ card, size }) => {
      window.BOXES = []; window.TILES = [];
      const cv = await window.STD_CARD.render(card, size);
      return { boxes: window.BOXES, tiles: window.TILES, w: cv.width, h: cv.height, png: cv.toDataURL('image/png') };
    }, { card, size });
    const b = got.boxes.filter((x) => x.t.trim() && x.r - x.l > 0);
    const hits = [];
    for (let i = 0; i < b.length; i++) {
      for (let j = i + 1; j < b.length; j++) {
        const A = b[i], B = b[j];
        const ox = Math.min(A.r, B.r) - Math.max(A.l, B.l), oy = Math.min(A.bot, B.bot) - Math.max(A.top, B.top);
        if (ox > 0.5 && oy > 0.5) hits.push(`"${A.t}" and "${B.t}" overlap by ${ox.toFixed(0)}x${oy.toFixed(0)} px`);
      }
    }
    for (const x of b) {
      const home = got.tiles.find((t) => x.l >= t.l && x.l <= t.r && x.top >= t.top && x.top <= t.bot);
      if (home && (x.r > home.r + 0.5 || x.bot > home.bot + 0.5)) hits.push(`"${x.t}" runs out of its tile by ${Math.max(x.r - home.r, x.bot - home.bot).toFixed(0)} px`);
    }
    const out = b.filter((x) => x.l < 0 || x.top < 0 || x.r > got.w || x.bot > got.h).map((x) => `"${x.t}" leaves the image`);
    const like = card.pitchedLike && b.some((x) => x.t === 'PITCHED LIKE') && b.some((x) => x.t.startsWith(card.pitchedLike.toUpperCase().slice(0, 6)));
    ok(!hits.length && !out.length, `${size} · ${name}: ${b.length} text boxes, none overlap or leave their tile${hits.concat(out).length ? ' (' + hits.concat(out).join('; ') + ')' : ''}`);
    if (size === 'tall' && card.pitchedLike) ok(like, `${size} · ${name}: pitched like and the name are both drawn`);
    if (SHOTS) writeFileSync(join(SHOTS, `card-${size}-${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`), Buffer.from(got.png.split(',')[1], 'base64'));
  }
}
await browser.close();
console.log(fails ? fails + ' failed' : 'all ok');
process.exit(fails ? 1 : 0);
