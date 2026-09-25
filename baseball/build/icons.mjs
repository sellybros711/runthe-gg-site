/* Every icon Run The Diamond ships, drawn from ONE mark.
 *
 *   node baseball/build/icons.mjs
 *
 * The mark is a cut diamond with a baseball seam stitched across it: the game is
 * named for the field and the stone, and this is the one shape that is both. It
 * replaced a flat ball-on-an-infield drawing that said nothing about the name.
 *
 * WHY A BUILDER RATHER THAN SIX PNGS. The old icons were six files with no source
 * anywhere in the repo, which is the share card's own history (see og.mjs): once a
 * size needs changing, nobody can re-render it and it gets redrawn by hand, and the
 * sizes drift apart. Here every size is the same SVG through the same renderer, so
 * a tweak is one edit and one run.
 *
 * THE BACKGROUND IS THE PAGE'S OWN CREAM (--panel into --bg), because the icon sits
 * beside the wordmark in the header and on a phone's home screen it is the game's
 * front door. On cream a pale stone washes out, so the gem carries a dark outline
 * and its shaded facets are a notch deeper than the concept's, and the sparkles are
 * the page's gold rather than white.
 *
 * THE FAVICON IS A DIFFERENT DRAWING, NOT A SMALLER ONE. At 32px the stitches are
 * about one pixel each and turn into a red smear across the stone, the faint infield
 * lines vanish, and the sparkles read as dust. So the small variant keeps what
 * survives: the silhouette, the facet split, and the seam as one clean line.
 *
 * THE MASKABLE ICON KEEPS THE MARK INSIDE THE SAFE ZONE. Android crops a maskable
 * icon to whatever shape the launcher likes, down to a circle of 80% of the width,
 * so the gem is scaled into the middle of that circle and the cream runs to the edge.
 */
import { createRequire } from 'module';
import { writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const { chromium } = createRequire('/opt/node22/lib/node_modules/')('playwright');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, '..');
const f = (n) => +n.toFixed(2);

/* The stone, in a 512 frame, centred. Brilliant cut seen from the side: a crown of
   seven facets over a pavilion of four. */
const TABLE = [[176, 142], [336, 142]];
const GIRDLE_Y = 218, CULET = [256, 438];
const gx = (t) => 70 + 372 * t;
const GM = [gx(0.25), gx(0.5), gx(0.75)];
const OUTLINE = '176,142 336,142 442,218 256,438 70,218';

const CROWN = [
  [[[70, 218], [176, 142], [GM[0], 218]], '#d7eefc'],
  [[[176, 142], [229, 142], [GM[0], 218]], '#ffffff'],
  [[[229, 142], [GM[1], 218], [GM[0], 218]], '#a9d3ef'],
  [[[229, 142], [283, 142], [GM[1], 218]], '#e6f5fe'],
  [[[283, 142], [GM[2], 218], [GM[1], 218]], '#7fb5de'],
  [[[283, 142], [336, 142], [GM[2], 218]], '#c3e2f6'],
  [[[336, 142], [442, 218], [GM[2], 218]], '#5a95c7'],
];
const PAVILION = [
  [[[70, 218], [GM[0], 218], CULET], '#bfe0f5'],
  [[[GM[0], 218], [GM[1], 218], CULET], '#7cb2dc'],
  [[[GM[1], 218], [GM[2], 218], CULET], '#4d86ba'],
  [[[GM[2], 218], [442, 218], CULET], '#2e6195'],
];

/* The seam: an arch across the stone, stitched the way a ball's seam is. */
function seam() {
  const pts = [];
  for (let i = 0; i <= 50; i++) {
    const t = i / 50;
    pts.push([118 + 276 * t, 300 - 128 * Math.sin(Math.PI * t) * 0.62]);
  }
  const stitches = [];
  for (let k = 1; k < 12; k++) {
    const i = Math.round((k / 12) * 50), p = pts[i], q = pts[Math.min(50, i + 1)];
    let tx = q[0] - p[0], ty = q[1] - p[1];
    const L = Math.hypot(tx, ty); tx /= L; ty /= L;
    const nx = -ty, ny = tx, l = 13;
    for (const s of [-1, 1]) {
      stitches.push(`M${f(p[0] + nx * 3 * s)},${f(p[1] + ny * 3 * s)} L${f(p[0] + nx * l * s - tx * 8)},${f(p[1] + ny * l * s - ty * 8)}`);
    }
  }
  return { line: 'M' + pts.map((p) => f(p[0]) + ',' + f(p[1])).join(' L'), stitches };
}

const spark = (x, y, r, fill) =>
  `<path d="M${x},${y - r} L${x + r * .22},${y - r * .22} L${x + r},${y} L${x + r * .22},${y + r * .22} L${x},${y + r} L${x - r * .22},${y + r * .22} L${x - r},${y} L${x - r * .22},${y - r * .22} Z" fill="${fill}"/>`;

const poly = (pts, fill, edge) =>
  `<polygon points="${pts.map((p) => f(p[0]) + ',' + f(p[1])).join(' ')}" fill="${fill}"`
  + ` stroke="#ffffff" stroke-opacity="${edge}" stroke-width="2" stroke-linejoin="round"/>`;

/* One drawing, three dressings.
     full   the app icons and the header mark
     small  the favicon: silhouette, facets and a plain seam
     mask   the Android maskable icon: the full mark inside the 80% safe circle */
function mark({ small = false, scale = 1, background = true } = {}) {
  const s = seam();
  // the stone's box is 70..442 x 142..438, so its centre is (256, 290): lift it to 256
  const lift = -34;
  const k = small ? 1.14 : scale;
  const tf = `translate(256 256) scale(${k}) translate(-256 ${-256 + lift})`;
  const bg = background ? `
    <rect width="512" height="512" fill="url(#cream)"/>
    ${small ? '' : `<path d="M256,470 L56,270 L256,70 L456,270 Z" fill="none" stroke="#8b6d4c" stroke-opacity=".16" stroke-width="5" transform="translate(0 -14)"/>`}` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <radialGradient id="cream" cx=".5" cy=".38" r=".85">
      <stop offset="0" stop-color="#f7f2e8"/><stop offset=".7" stop-color="#ece2cf"/><stop offset="1" stop-color="#ddcdb0"/>
    </radialGradient>
    <filter id="drop" x="-20%" y="-20%" width="140%" height="150%">
      <feDropShadow dx="0" dy="${small ? 10 : 14}" stdDeviation="${small ? 6 : 12}" flood-color="#3a2a18" flood-opacity="${small ? .35 : .32}"/>
    </filter>
    <linearGradient id="sheen" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".45" stop-color="#fff" stop-opacity=".32"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
    <clipPath id="stone"><polygon points="${OUTLINE}"/></clipPath>
  </defs>
  ${bg}
  <g transform="${tf}">
    <g filter="url(#drop)">
      <polygon points="${OUTLINE}" fill="#1d2a3a" stroke="#1d2a3a" stroke-width="${small ? 26 : 14}" stroke-linejoin="round"/>
      ${CROWN.map(([p, c]) => poly(p, c, small ? 0 : .6)).join('')}
      ${PAVILION.map(([p, c]) => poly(p, c, small ? 0 : .5)).join('')}
    </g>
    <g clip-path="url(#stone)">
      ${small ? '' : '<rect x="60" y="130" width="400" height="320" fill="url(#sheen)"/>'}
      <path d="${s.line}" fill="none" stroke="#6e0d1a" stroke-width="${small ? 20 : 7}" stroke-linecap="round" opacity=".3" transform="translate(0 3)"/>
      <path d="${s.line}" fill="none" stroke="#c8202f" stroke-width="${small ? 17 : 5.5}" stroke-linecap="round"/>
      ${small ? '' : s.stitches.map((d) => `<path d="${d}" stroke="#c8202f" stroke-width="5" stroke-linecap="round" fill="none"/>`).join('')}
    </g>
    ${small ? '' : spark(364, 124, 22, '#b8860b') + spark(410, 232, 12, '#b8860b') + spark(206, 170, 10, '#ffffff')}
  </g>
</svg>`;
}

/* The mark on its own, no background and cropped to the stone and its sparkle: the
   page header draws the SVG, and the share card draws the PNG, because a canvas
   that draws an SVG image can be marked unsafe to export in some browsers, and a
   same-origin PNG never is. */
const MARK = mark({ background: false }).replace('viewBox="0 0 512 512"', 'viewBox="52 52 408 408"');

const TARGETS = [
  ['icon-512.png', 512, mark()],
  ['icon-192.png', 192, mark()],
  ['apple-touch-icon.png', 180, mark()],
  ['icon-maskable-512.png', 512, mark({ scale: 0.74 })],
  ['favicon-32.png', 32, mark({ small: true })],
  ['mark-256.png', 256, MARK],
];

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage();
for (const [file, size, svg] of TARGETS) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<!doctype html><html><body style="margin:0;background:transparent">`
    + svg.replace('width="512" height="512"', `width="${size}" height="${size}"`) + '</body></html>');
  await page.screenshot({ path: path.join(OUT, file), clip: { x: 0, y: 0, width: size, height: size }, omitBackground: true });
  console.log('wrote baseball/' + file + ' at ' + size);
}
await browser.close();

writeFileSync(path.join(OUT, 'mark.svg'), MARK);
console.log('wrote baseball/mark.svg');
