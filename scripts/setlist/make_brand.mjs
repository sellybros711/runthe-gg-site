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
const NAVY = '#071426', INK = '#F4F7FB', MUT = '#A9B8CB', DIM = '#7C8DA3';
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

/* The OG card has one job: make a link unfurl as SEGUE rather than as the
   RunThe.GG suite icon every other game already uses. So the mark and the word
   carry it and the setlist behind is texture, not information. */
function drawOG() {
  const W = 1200, H = 630, PAD = 80;
  const c = createCanvas(W, H), x = c.getContext('2d');
  x.fillStyle = NAVY; x.fillRect(0, 0, W, H);

  /* The dye spiral from the home screen, over on the right where the lockup
     is not. The ring mask is built on its OWN canvas and applied in a single
     destination-in: compositing ring by ring intersects each new ring with
     what is already there, so by the fourth stroke the mask is empty and the
     spiral silently disappears. */
  const SCX = W - 250, SCY = H / 2;
  const spiral = createCanvas(W, H), sx = spiral.getContext('2d');
  fillDye(sx, SCX, SCY, 520);
  const rings = createCanvas(W, H), rx = rings.getContext('2d');
  rx.strokeStyle = '#000';
  rx.lineWidth = 13;
  for (let r = 500; r > 8; r -= 34) {
    rx.globalAlpha = Math.max(0.10, 1 - r / 520);
    rx.beginPath();
    rx.arc(SCX, SCY, r, 0, Math.PI * 2);
    rx.stroke();
  }
  sx.globalCompositeOperation = 'destination-in';
  sx.drawImage(rings, 0, 0);
  x.save();
  x.globalAlpha = 0.5;
  x.drawImage(spiral, 0, 0);
  x.restore();

  // The lockup's own metrics, needed before anything is drawn beside it.
  const M = 148, GAP = 30;
  const topY = H / 2 - 96;
  x.font = '132px AlfaSlab';
  const wordRight = PAD + M + GAP + x.measureText('SEGUE').width;

  /* Setlist texture, over on the right with the spiral. On the left it ran
     straight through the wordmark and MADHUVAN came out from behind the mark.
     The column starts clear of the MEASURED wordmark rather than at a number
     picked by eye, which is how the final E ended up inside DRIVE. */
  const TEXT_LEFT = wordRight + 60;
  x.save();
  x.beginPath(); x.rect(TEXT_LEFT, 0, W - TEXT_LEFT, H); x.clip();
  x.globalAlpha = 0.22;
  x.font = '700 34px Archivo';
  x.textBaseline = 'middle';
  const rows = ['HUNGERSITE', 'ARCADIA', 'DRIVE', 'MADHUVAN', 'TUMBLE', 'ECHO OF A ROSE'];
  rows.forEach((t, i) => {
    const y = H / 2 + (i - (rows.length - 1) / 2) * 74;
    x.fillStyle = INK;
    x.fillText(t, TEXT_LEFT + 40, y);
    if (i % 2) { x.fillStyle = '#48D17A'; x.fillText('›', TEXT_LEFT + 52 + x.measureText(t).width, y); }
  });
  x.restore();

  // The lockup, left-aligned so it can never collide with either texture.
  x.drawImage(drawMark(M), PAD, topY);

  x.textBaseline = 'alphabetic';
  x.font = '132px AlfaSlab';
  x.fillStyle = INK;
  x.fillText('SEGUE', PAD + M + GAP, topY + M - 26);

  x.font = '700 27px Archivo';
  x.fillStyle = MUT;
  letterspace(x, 'THE SETLIST BUILDER GAME', PAD + 4, topY + M + 62, 5.5);

  x.font = '700 25px Archivo';
  x.fillStyle = DIM;
  letterspace(x, 'runthe.gg/setlist', PAD + 4, H - 58, 3);

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
await loadFont('AlfaSlab', 'Alfa+Slab+One');
await loadFont('Archivo', 'Archivo:wght@700');
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
