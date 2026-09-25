/*
 * SEGUE BRAND ASSETS, generated rather than drawn.
 *
 *   node scripts/setlist/make_brand.mjs
 *
 * Every icon and the OG card come out of the ONE mark defined below. That is
 * the point: a hand-made PNG drifts from the app the first time a colour token
 * moves, and nobody notices until the icon and the game disagree. Re-run this
 * after touching the palette and the assets follow.
 *
 * THE MARK. A single chevron knocked out of a field of the game's own tie dye.
 * The chevron is the same glyph the game already prints between two songs that
 * segued, so the icon means the thing the game is named after.
 *
 * It was picked by rendering five candidates at 128/64/32/16 REAL pixels and
 * discarding the ones that died small: a dyed arrow on a navy tile vanishes at
 * 16px because the tile wins, a double chevron merges into one blob, and a
 * setlist-lines mark turns to mush. Knocking the arrow OUT of the dye keeps the
 * most ink on screen at every size, which is what survives a browser tab.
 *
 * Drawn with @napi-rs/canvas, which the repo already depends on, so this needs
 * nothing but `npm i`. Fonts are cached under .cache/fonts and fetched from
 * Google on first run.
 */
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, 'assets');
const CACHE = join(ROOT, '.cache', 'fonts');

// ── palette, kept in step with setlist/index.html ────────────────────────────
const NAVY = '#0E0B1C', INK = '#F6F2EA', MUT = '#B8AFCB', DIM = '#8C83A2';
/* The poster's own stock and the setlist paper, both fixed in the game too. */
const STAGE = '#140D2A', PAPER = '#F7F1E3', PAPER_INK = '#1B1726', PAPER_MUT = '#7A6E5C';
/* The wordmark's sweep, the same five stops as `.hero h1`, and no gold. */
const LIT = [[0.10, '#FF8A6B'], [0.34, '#FF6FC1'], [0.56, '#B794FF'], [0.76, '#4FD3E0'], [0.94, '#5FE39A']];
/* The same five accents the chips sweep through, in the same order and from
   the same 210deg start as --dye. Changing one here without changing the CSS
   is how the icon and the game drift apart. */
const DYE_STOPS = [
  [0, '#F06A5F'], [62, '#F2B632'], [128, '#48D17A'],
  [196, '#37C5D5'], [268, '#A982F3'], [360, '#F06A5F'],
];
const DYE_FROM = 210;

// ── fonts ────────────────────────────────────────────────────────────────────
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36';
async function loadFont(alias, spec) {
  const file = join(CACHE, alias + '.woff2');
  if (!existsSync(file)) {
    mkdirSync(CACHE, { recursive: true });
    const css = await (await fetch(
      `https://fonts.googleapis.com/css2?family=${spec}&display=swap`,
      { headers: { 'User-Agent': UA } })).text();
    /* css2 emits one @font-face per unicode-range subset and the basic Latin
       block is LAST. Taking the first URL yields a font with no A-Z and the
       renderer silently falls back. */
    const urls = [...css.matchAll(/url\((https:[^)]+\.woff2)\)/g)].map(m => m[1]);
    if (!urls.length) throw new Error(`no woff2 returned for ${alias}`);
    writeFileSync(file, Buffer.from(await (await fetch(urls[urls.length - 1])).arrayBuffer()));
    console.log(`  fetched ${alias}`);
  }
  GlobalFonts.register(readFileSync(file), alias);
}

// ── drawing ──────────────────────────────────────────────────────────────────
const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mix = (a, b, t) => {
  const [r1, g1, b1] = hex(a), [r2, g2, b2] = hex(b);
  return `rgb(${Math.round(r1 + (r2 - r1) * t)},${Math.round(g1 + (g2 - g1) * t)},${Math.round(b1 + (b2 - b1) * t)})`;
};
/** The colour of the dye at a given angle, in degrees from the sweep start. */
function dyeAt(deg) {
  const d = ((deg % 360) + 360) % 360;
  for (let i = 0; i < DYE_STOPS.length - 1; i++) {
    const [a, ca] = DYE_STOPS[i], [b, cb] = DYE_STOPS[i + 1];
    if (d >= a && d <= b) return mix(ca, cb, (d - a) / (b - a));
  }
  return DYE_STOPS[0][1];
}
/* Canvas has no conic gradient, so the sweep is drawn as wedges, one per
   degree, each overrunning the next by 2.5 degrees.
   The opaque base disc underneath is not belt-and-braces: without it the
   antialiased wedge edges never reach full coverage and the whole mark lands
   at alpha ~190, so the page behind bleeds through and the dye renders as
   pastel. Measured before and after on the centre pixel: 190,133,197,193
   against a solid 255. */
function fillDye(x, cx, cy, radius) {
  x.beginPath();
  x.arc(cx, cy, radius, 0, Math.PI * 2);
  x.fillStyle = dyeAt(0);
  x.fill();
  for (let d = 0; d < 360; d++) {
    const a0 = (DYE_FROM + d - 90) * Math.PI / 180;
    const a1 = (DYE_FROM + d + 2.5 - 90) * Math.PI / 180;
    x.beginPath();
    x.moveTo(cx, cy);
    x.arc(cx, cy, radius, a0, a1);
    x.closePath();
    x.fillStyle = dyeAt(d);
    x.fill();
  }
}

/**
 * The mark, at any size, on transparent.
 *
 * @param {number} size
 * @param {boolean} maskable Draw the Android adaptive-icon variant instead:
 *   full bleed with no corner radius, and the chevron shrunk into the middle.
 *   A launcher crops a maskable icon to whatever shape it likes and only the
 *   centre 80% is guaranteed to survive, so handing it the rounded tile (as
 *   the other games in this repo do) gets the corners sliced off and the
 *   squircle re-cut at a different radius.
 */
function drawMark(size, maskable = false) {
  const c = createCanvas(size, size), x = c.getContext('2d');
  const s = size / 100;                        // the mark is authored on a 100 grid
  x.save();
  x.beginPath();
  if (maskable) x.rect(0, 0, size, size);
  else x.roundRect(0, 0, size, size, size * 0.22);
  x.clip();
  // The dye has to cover the corners, so the sweep radius is the diagonal.
  fillDye(x, size / 2, size / 2, size * 0.75);
  /* Pull the chevron toward the centre so it sits inside the safe circle.
     0.68 puts the arrow's furthest point at 34% from centre, comfortably
     inside the 40% a maskable icon is allowed to rely on. */
  if (maskable) {
    x.translate(size / 2, size / 2);
    x.scale(0.68, 0.68);
    x.translate(-size / 2, -size / 2);
  }
  /* The chevron is painted navy rather than knocked through to transparency.
     A hole takes the colour of whatever is behind it, which is charming in a
     browser tab and a liability as an app icon, where the launcher picks the
     backdrop. Navy is the brand's own ground, so on the OG card and the app
     the result is identical to a knockout, just predictable. */
  x.lineWidth = 15 * s;
  x.lineCap = 'round';
  x.lineJoin = 'round';
  x.strokeStyle = NAVY;
  x.beginPath();
  x.moveTo(38 * s, 26 * s);
  x.lineTo(66 * s, 50 * s);
  x.lineTo(38 * s, 74 * s);
  x.stroke();
  x.restore();
  return c;
}

/* THE OG CARD IS THE POSTER AND THE PAPER, the two objects the game is built
   from. It is what a link unfurls as in a group chat, so it has to say what
   this is to somebody who has never heard of it before they read a word: the
   lit wordmark on a night stage says "jam scene", and the handwritten setlist
   taped beside it says "setlists". Everything is drawn from the same constants
   as the page, so the card and the game cannot drift. */
function drawOG() {
  const W = 1200, H = 630, PAD = 78;
  const c = createCanvas(W, H), x = c.getContext('2d');
  x.fillStyle = STAGE; x.fillRect(0, 0, W, H);
  // The light rig: coloured washes, the same four the hero paints.
  for (const [cx, cy, r, col, a] of [
    [120, -40, 560, '240,106,95', .34], [1080, -60, 560, '55,197,213', .28],
    [420, 360, 620, '169,130,243', .36], [1000, 700, 420, '255,111,193', .20]]) {
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, `rgba(${col},${a})`); g.addColorStop(1, `rgba(${col},0)`);
    x.fillStyle = g; x.fillRect(0, 0, W, H);
  }
  // Print screen.
  x.fillStyle = 'rgba(255,255,255,.06)';
  for (let yy = 2; yy < H; yy += 6) for (let xx = 2; xx < W; xx += 6) x.fillRect(xx, yy, 1.4, 1.4);

  // The paper, on the right, skewed and taped, songs in marker.
  x.save();
  x.translate(930, 318); x.rotate(-3 * Math.PI / 180);
  const PW = 330, PH = 430;
  x.shadowColor = 'rgba(0,0,0,.55)'; x.shadowBlur = 40; x.shadowOffsetY = 18;
  x.fillStyle = PAPER; x.fillRect(-PW / 2, -PH / 2, PW, PH);
  x.shadowColor = 'transparent';
  x.strokeStyle = 'rgba(27,23,38,.06)'; x.lineWidth = 1.5;
  for (let ly = -PH / 2 + 44; ly < PH / 2; ly += 34) { x.beginPath(); x.moveTo(-PW / 2, ly); x.lineTo(PW / 2, ly); x.stroke(); }
  x.fillStyle = 'rgba(255,241,200,.72)'; x.save(); x.rotate(4 * Math.PI / 180);
  x.fillRect(-58, -PH / 2 - 16, 116, 34); x.restore();
  x.textBaseline = 'alphabetic';
  x.font = '900 15px ArchivoBlack'; x.fillStyle = PAPER_MUT;
  letterspace(x, 'SET I', -PW / 2 + 30, -PH / 2 + 62, 3);
  const songs = [['Hungersite', true], ['Arcadia', true], ['Hungersite', false], ['Tumble', false],
                 ['Drive', true], ['Madhuvan', false]];
  x.font = '34px Marker';
  songs.forEach(([t, seg], i) => {
    const y = -PH / 2 + 104 + i * 45;
    x.fillStyle = PAPER_INK; x.fillText(t, -PW / 2 + 30, y);
    if (seg) { x.fillStyle = '#6D3BD6'; x.fillText('>', -PW / 2 + 42 + x.measureText(t).width, y); }
  });
  x.font = '900 15px ArchivoBlack'; x.fillStyle = PAPER_MUT;
  letterspace(x, 'ENCORE', -PW / 2 + 30, PH / 2 - 44, 3);
  x.font = '34px Marker'; x.fillStyle = PAPER_INK; x.fillText('Rockdale', -PW / 2 + 152, PH / 2 - 42);
  x.restore();

  // The lockup: the mark, then the lit wordmark with its hard poster shadow.
  const M = 112;
  x.drawImage(drawMark(M), PAD, 96);
  x.font = '900 20px ArchivoBlack'; x.fillStyle = '#CFC4E6';
  letterspace(x, 'THE SETLIST GAME FOR JAM FANS', PAD + M + 26, 162, 4);
  x.font = '176px Shrikhand';
  const base = 392, wx = PAD - 6;
  x.fillStyle = '#07040F'; x.fillText('Segue', wx, base + 9);
  const g = x.createLinearGradient(0, base - 150, 0, base + 36);
  for (const [o, col] of LIT) g.addColorStop(o, col);
  x.fillStyle = g; x.fillText('Segue', wx, base);

  x.font = '44px Shrikhand'; x.fillStyle = INK;
  x.fillText('Build the show that', PAD, 482);
  x.fillText('never happened.', PAD, 532);

  x.font = '900 22px ArchivoBlack'; x.fillStyle = MUT;
  letterspace(x, 'runthe.gg/setlist', PAD + 2, H - 40, 2);
  return c;
}
/** Canvas has no letter-spacing, and these labels need it to read as signage. */
function letterspace(x, text, sx, y, gap) {
  let cx = sx;
  for (const ch of text) { x.fillText(ch, cx, y); cx += x.measureText(ch).width + gap; }
}
function measureSpaced(x, text, gap) {
  let w = 0;
  for (const ch of text) w += x.measureText(ch).width + gap;
  return w - gap;
}

// ── run ──────────────────────────────────────────────────────────────────────
await loadFont('Shrikhand', 'Shrikhand');
await loadFont('Marker', 'Permanent+Marker');
await loadFont('Archivo', 'Archivo:wght@700');
await loadFont('ArchivoBlack', 'Archivo:wght@900');
mkdirSync(OUT, { recursive: true });

const ICONS = [16, 32, 48, 64, 180, 192, 512, 1024];
for (const s of ICONS) {
  const name = `segue-icon_${s}.png`;
  writeFileSync(join(OUT, name), drawMark(s).toBuffer('image/png'));
  console.log(`  ${name}`);
}
for (const s of [192, 512]) {
  const name = `segue-icon-maskable_${s}.png`;
  writeFileSync(join(OUT, name), drawMark(s, true).toBuffer('image/png'));
  console.log(`  ${name}`);
}
writeFileSync(join(OUT, 'segue-og_1200x630.png'), drawOG().toBuffer('image/png'));
console.log('  segue-og_1200x630.png');
console.log(`\n${ICONS.length + 3} assets written to assets/`);
