/* RunTheHouse, procedural pixel avatars.
 *
 * Browser only. window.RH_AVATAR.
 *
 * The first pass drew flat SVG silhouettes and produced fifteen near-identical
 * grey heads. You could not tell the house apart by face, which matters in a
 * game whose entire subject is remembering who is who.
 *
 * RunTheTour recolours two painted base portraits live on a canvas, keeping the
 * painted highlights. The principle is the right one, real shading plus a
 * per-player identity, but GDD §17 requires these to be generated from the seed
 * rather than loaded, so the shading has to be generated too.
 *
 * ── HOW THE THIRD DIMENSION HAPPENS ────────────────────────────────────────
 *
 * Every feature is stamped into a grid of MATERIAL IDs, not colours. Nothing
 * knows what it looks like while it is being drawn.
 *
 * A single pass afterwards turns materials into pixels by looking at each
 * pixel's neighbours:
 *
 *   the pixel up and to the left is behind me   ->  I am catching the light
 *   the pixel down and to the right is behind me ->  I am in shadow
 *   otherwise                                    ->  base tone
 *
 * That is one light, fixed at the top left, applied identically to skin, hair,
 * fabric and plastic. It is why a nose reads as sticking out and a collar reads
 * as sitting on top of a shoulder without a single hand-placed highlight, and
 * it is why sixteen randomly generated faces all look like they were lit in the
 * same room, which is the thing that actually sells three dimensions.
 *
 * Materials carry a DEPTH. "Behind me" means lower depth, so hair correctly
 * casts onto the forehead and a collar catches light against the neck.
 */

'use strict';

(function () {

const N = 32;            // logical pixels per side
const CACHE = new Map();

// ─── materials ───────────────────────────────────────────────────────────────

/* Depth decides what counts as "behind" for the light pass. Order matters more
   than the numbers. */
const M = {
  EMPTY: 0,
  BG: 1,
  SHIRT: 2,
  COLLAR: 3,
  NECK: 4,
  SKIN: 5,
  EAR: 6,
  BROW: 7,
  EYE: 8,
  MOUTH: 9,
  NOSE: 10,
  HAIR: 11,
  BEARD: 12,
  ACC: 13,
  LENS: 14,
};
const DEPTH = {
  1: 0, 2: 1, 3: 2, 4: 2, 5: 3, 6: 3, 7: 4, 8: 4, 9: 4, 10: 5, 11: 6, 12: 5, 13: 7, 14: 6,
};

// ─── palettes ────────────────────────────────────────────────────────────────

/* Skin as a ramp of real tones, fair through deep, each a base with its own
   light and shadow rather than a mathematical lighten and darken, because
   lightening a dark tone numerically turns it grey. */
const SKIN = [
  ['#f0cbb0', '#dcae91', '#b98a6f'],
  ['#e8bd9c', '#d1a17f', '#ab7c5d'],
  ['#dcab86', '#c08f6a', '#996d4c'],
  ['#c68f68', '#a97551', '#84573a'],
  ['#a97350', '#8c5b3c', '#6b422a'],
  ['#8a5738', '#6f4327', '#52301b'],
  ['#6d4229', '#55311c', '#3d2214'],
  ['#4f2f1d', '#3b2114', '#2a170d'],
];
const HAIR = [
  ['#2a2320', '#1a1614', '#0f0d0c'], ['#4a3527', '#33241a', '#1f1610'],
  ['#6b4a2e', '#4e3520', '#332214'], ['#8a6034', '#684623', '#452e17'],
  ['#b58a4e', '#8f6a37', '#5f4623'], ['#d8bb7a', '#b0955c', '#77653e'],
  ['#8e3a24', '#6d2a19', '#48190f'], ['#9aa0a6', '#787e84', '#4f5459'],
  ['#d6d9dc', '#adb1b5', '#75787b'], ['#3a3f52', '#282c3a', '#181b24'],
];
/* Cold, worn, institutional. Nobody in this house has bright clothes. */
const SHIRT = [
  ['#4a5560', '#37414a', '#252c33'], ['#5c5348', '#453e35', '#2e2924'],
  ['#3f5250', '#2e3d3b', '#1f2a29'], ['#63504f', '#4a3b3a', '#312627'],
  ['#4d4a63', '#39374a', '#252433'], ['#57604a', '#414937', '#2b3025'],
  ['#6b5f52', '#50463c', '#342d27'], ['#42505c', '#313c45', '#20272d'],
];
const EYE_WHITE = ['#cfd4d8', '#a9aeb3', '#7d8287'];
const IRIS = [
  ['#5b7a8c', '#425c6b', '#2c3f4a'], ['#6b5a3e', '#4e412c', '#33291b'],
  ['#4a6b52', '#36503c', '#233427'], ['#3c3a38', '#2a2827', '#1a1918'],
];
const MOUTH = ['#9a6a62', '#7a5049', '#563531'];
/*
 * The backdrop each portrait is shot against.
 *
 * These were near-black, which read as a surveillance still on a dark page and
 * reads as a hole punched in the paper on a light one. Now they are the pale
 * card stock a passport photo gets mounted on, in three barely different tints
 * so sixteen avatars in a grid do not look stamped from one plate. Still three
 * tones each, because the bevel pass shades the backdrop too.
 */
const BG = [
  ['#dbe4f1', '#c9d5e7', '#b4c3da'], ['#e6ded0', '#d6ccba', '#c2b6a1'],
  ['#d8e4e0', '#c6d5d0', '#b1c3bd'],
];

// ─── grid helpers ────────────────────────────────────────────────────────────

function grid() { return new Uint8Array(N * N); }
const at = (g, x, y) => (x < 0 || y < 0 || x >= N || y >= N) ? 0 : g[y * N + x];
function put(g, x, y, m) { if (x >= 0 && y >= 0 && x < N && y < N) g[y * N + x] = m; }

function rect(g, x0, y0, w, h, m) {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) put(g, x, y, m);
}
/* Ellipse by scanline, so edges land on whole pixels and the result reads as
   deliberate pixel art rather than a resampled circle. */
function ellipse(g, cx, cy, rx, ry, m) {
  for (let y = -ry; y <= ry; y++) {
    const t = 1 - (y * y) / (ry * ry);
    if (t < 0) continue;
    const half = Math.round(rx * Math.sqrt(t));
    for (let x = -half; x <= half; x++) put(g, cx + x, cy + y, m);
  }
}
function ellipseIf(g, cx, cy, rx, ry, m, only) {
  for (let y = -ry; y <= ry; y++) {
    const t = 1 - (y * y) / (ry * ry);
    if (t < 0) continue;
    const half = Math.round(rx * Math.sqrt(t));
    for (let x = -half; x <= half; x++) {
      if (at(g, cx + x, cy + y) === only) put(g, cx + x, cy + y, m);
    }
  }
}

// ─── the face ────────────────────────────────────────────────────────────────

function build(rnd) {
  const g = grid();
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));

  const look = {
    skin: int(0, SKIN.length - 1),
    hair: int(0, HAIR.length - 1),
    shirt: int(0, SHIRT.length - 1),
    iris: int(0, IRIS.length - 1),
    bg: int(0, BG.length - 1),
  };

  rect(g, 0, 0, N, N, M.BG);

  /* Shoulders first, so everything sits on top of them. */
  const shoulder = 25 + int(0, 1);
  ellipse(g, 16, shoulder + 8, 13 + int(0, 2), 8, M.SHIRT);
  rect(g, 0, shoulder + 4, N, N - shoulder - 4, M.SHIRT);

  /* Neck, narrower than the jaw so the head reads as sitting on it. */
  rect(g, 13, 19, 6, 7, M.NECK);

  /* Head. Three builds: long, round, square. */
  const build3 = int(0, 2);
  const cy = 13, rx = build3 === 2 ? 8 : (build3 === 1 ? 8 : 7);
  const ry = build3 === 0 ? 10 : 9;
  ellipse(g, 16, cy, rx, ry, M.SKIN);
  if (build3 === 2) rect(g, 16 - rx, cy - 2, rx * 2 + 1, 7, M.SKIN);   // square jaw

  /* Ears, only when hair will not cover them. */
  const ears = rnd() < 0.75;
  if (ears) { ellipse(g, 16 - rx - 1, cy + 1, 1, 2, M.EAR); ellipse(g, 16 + rx + 1, cy + 1, 1, 2, M.EAR); }

  /* Collar over the shoulders, catching the light against the neck. */
  const collar = int(0, 2);
  if (collar === 0) { rect(g, 10, 25, 12, 2, M.COLLAR); }
  else if (collar === 1) { rect(g, 11, 25, 10, 1, M.COLLAR); rect(g, 12, 26, 8, 1, M.COLLAR); }
  else { rect(g, 9, 26, 14, 2, M.COLLAR); }

  /* Hair. Eight silhouettes, stamped only where skin or background already is,
     so it wraps the skull instead of floating over it. */
  const style = int(0, 7);
  const top = cy - ry;
  if (style !== 7) {
    ellipseIf(g, 16, cy - 1, rx + 1, ry, M.HAIR, M.SKIN);
    /* carve the face back out below the hairline */
    const line = top + 3 + int(0, 2);
    for (let y = line; y < N; y++) for (let x = 0; x < N; x++) {
      if (at(g, x, y) === M.HAIR && x > 16 - rx - 1 && x < 16 + rx + 1) put(g, x, y, M.SKIN);
    }
    ellipseIf(g, 16, cy - 1, rx + 2, ry + 1, M.HAIR, M.BG);
  }
  if (style === 1) { rect(g, 16 - rx - 2, top + 2, 2, 9, M.HAIR); rect(g, 16 + rx + 1, top + 2, 2, 9, M.HAIR); }
  if (style === 2) { ellipse(g, 16, top + 1, rx + 3, 4, M.HAIR); }
  if (style === 3) { for (let x = 16 - rx; x <= 16 + rx; x += 2) rect(g, x, top + 2, 1, 2, M.HAIR); }
  if (style === 4) { ellipse(g, 16 - rx - 2, cy + 3, 3, 5, M.HAIR); ellipse(g, 16 + rx + 2, cy + 3, 3, 5, M.HAIR); }
  if (style === 5) { rect(g, 16 - 5, top + 1, 10, 2, M.HAIR); }
  if (style === 6) { ellipse(g, 16, top + 2, rx, 3, M.HAIR); rect(g, 16 + 2, top + 1, 5, 3, M.HAIR); }

  /* Brows, eyes, nose, mouth. Placement varies by a pixel or two, which is
     most of what makes two faces feel like two people. */
  const eyeY = cy - 1 + int(0, 1);
  const eyeSp = 3 + int(0, 1);
  const browY = eyeY - 2 - int(0, 1);
  rect(g, 16 - eyeSp - 2, browY, 3, 1, M.BROW);
  rect(g, 16 + eyeSp - 1, browY, 3, 1, M.BROW);

  rect(g, 16 - eyeSp - 2, eyeY, 3, 2, M.EYE);
  rect(g, 16 + eyeSp - 1, eyeY, 3, 2, M.EYE);

  const noseLen = 2 + int(0, 1);
  rect(g, 16, eyeY + 2, 1, noseLen, M.NOSE);

  const mouthY = eyeY + noseLen + 3;
  const mouthW = 3 + int(0, 2);
  rect(g, 16 - Math.floor(mouthW / 2), mouthY, mouthW, 1, M.MOUTH);

  /* Facial hair, on the skin only. */
  const beard = rnd();
  if (beard < 0.14) rect(g, 16 - 2, mouthY - 1, 5, 1, M.BEARD);
  else if (beard < 0.24) { ellipseIf(g, 16, mouthY + 1, 4, 3, M.BEARD, M.SKIN); }
  else if (beard < 0.30) { ellipseIf(g, 16, cy + 4, rx, 5, M.BEARD, M.SKIN); }

  /* One accessory at most. Everything in here is institutional issue. */
  const acc = rnd();
  look.glasses = acc < 0.16;
  look.beard = beard < 0.30;
  if (acc < 0.16) {
    rect(g, 16 - eyeSp - 3, eyeY - 1, 5, 4, M.ACC);
    rect(g, 16 + eyeSp - 2, eyeY - 1, 5, 4, M.ACC);
    rect(g, 16 - eyeSp - 2, eyeY, 3, 2, M.LENS);
    rect(g, 16 + eyeSp - 1, eyeY, 3, 2, M.LENS);
    rect(g, 16 - 1, eyeY, 2, 1, M.ACC);
  } else if (acc < 0.24) {
    rect(g, 16 - rx - 1, top + 3, rx * 2 + 3, 2, M.ACC);
  } else if (acc < 0.29 && ears) {
    put(g, 16 + rx + 1, cy + 3, M.ACC);
  }

  return { g, look };
}

// ─── the light ───────────────────────────────────────────────────────────────

function ramps(look) {
  const r = {};
  r[M.BG] = BG[look.bg];
  r[M.SHIRT] = SHIRT[look.shirt];
  r[M.COLLAR] = SHIRT[look.shirt];
  r[M.SKIN] = SKIN[look.skin];
  r[M.NECK] = SKIN[look.skin];
  r[M.EAR] = SKIN[look.skin];
  r[M.NOSE] = SKIN[look.skin];
  r[M.HAIR] = HAIR[look.hair];
  r[M.BEARD] = HAIR[look.hair];
  r[M.BROW] = HAIR[look.hair];
  r[M.EYE] = IRIS[look.iris];
  r[M.LENS] = EYE_WHITE;
  r[M.MOUTH] = MOUTH;
  r[M.ACC] = ['#3d444b', '#2c3238', '#1d2126'];
  return r;
}

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

/**
 * One pass, one light, fixed at the top left. See the header: this is the whole
 * three dimensional effect and it is why every face in a house looks lit by the
 * same room.
 */
function shade(g, look) {
  const R = ramps(look);
  const out = new Uint8ClampedArray(N * N * 4);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const m = at(g, x, y);
      if (!m) continue;
      const ramp = R[m] || R[M.BG];
      const d = DEPTH[m] || 0;
      const upLeft = DEPTH[at(g, x - 1, y - 1)] || 0;
      const downRight = DEPTH[at(g, x + 1, y + 1)] || 0;

      let tone = 1;
      if (upLeft < d) tone = 0;            // catching the light
      else if (downRight < d) tone = 2;    // turning away from it

      /* The background gets a vignette instead, so the subject sits inside a
         lit box rather than on a flat colour. */
      if (m === M.BG) {
        const dx = (x - 13) / N, dy = (y - 10) / N;
        const dist = Math.sqrt(dx * dx + dy * dy);
        tone = dist < 0.30 ? 0 : (dist < 0.52 ? 1 : 2);
      }

      const c = hex(ramp[tone]);
      const i = (y * N + x) * 4;
      out[i] = c[0]; out[i + 1] = c[1]; out[i + 2] = c[2]; out[i + 3] = 255;
    }
  }
  return out;
}

// ─── public ──────────────────────────────────────────────────────────────────

/* mulberry32, local so this file has no dependencies and can be dropped into a
   page on its own. */
function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A data URL for one player, at native 32x32. Scale it with CSS and
 * image-rendering: pixelated, never by redrawing bigger, or the pixels stop
 * being pixels.
 */
function url(seed) {
  const key = String(seed);
  if (CACHE.has(key)) return CACHE.get(key);

  const r = rng(typeof seed === 'number' ? seed : hashStr(key));
  const built = build(r);
  const px = shade(built.g, built.look);

  const cv = document.createElement('canvas');
  cv.width = N; cv.height = N;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(N, N);
  img.data.set(px);
  ctx.putImageData(img, 0, 0);
  const u = cv.toDataURL('image/png');

  CACHE.set(key, u);
  return u;
}

/**
 * What a face visibly has, without drawing it.
 *
 * Head Count asks the player to count the ones wearing glasses as they walk
 * past, which means something has to be able to answer that question without
 * looking at pixels. Cached by the same key as the image, so the answer and the
 * picture can never disagree.
 */
const FEAT = new Map();
function features(seed) {
  const key = String(seed);
  if (FEAT.has(key)) return FEAT.get(key);
  const r = rng(typeof seed === 'number' ? seed : hashStr(key));
  const f = build(r).look;
  const out = { glasses: !!f.glasses, beard: !!f.beard };
  FEAT.set(key, out);
  return out;
}

function hashStr(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return (h ^= h >>> 16) >>> 0;
}

/** Ready to drop into markup. */
function img(seed, size, cls) {
  return `<img class="pxa ${cls || ''}" src="${url(seed)}" width="${size}" height="${size}" alt="" draggable="false">`;
}

const api = { N, url, img, features, build, shade, SKIN, HAIR, SHIRT, M, DEPTH };

if (typeof window !== 'undefined') window.RH_AVATAR = api;
if (typeof module !== 'undefined' && module.exports) module.exports = api;

})();
