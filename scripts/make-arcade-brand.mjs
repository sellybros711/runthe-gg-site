/* make-arcade-brand.mjs — generate every Run The Arcade brand asset from one
 * source logo, so the mark is defined in exactly one place.
 *
 * INPUT (commit this once): arcade/assets/arcade-logo.png
 *   The official Arcade logo — the basketball/baseball/football ball on the
 *   arcade joystick base — as a SQUARE, TRANSPARENT-background PNG, >=1024px.
 *
 * OUTPUT (regenerated, safe to overwrite):
 *   arcade/assets/arcade-icon.png       512  favicon / browser tab (logo on dark tile)
 *   arcade/assets/arcade-apple-180.png  180  iOS home-screen icon
 *   arcade/assets/arcade-share.png     1200x630  link-share (OG) card
 *
 * Run:  node scripts/make-arcade-brand.mjs
 * Needs Playwright's chromium (already present in this repo's CI/dev image).
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
// Resolve Playwright whether it's a local dep (CI) or the globally-installed
// package (this dev image). ESM ignores NODE_PATH, so fall back to an explicit path.
let pw;
try { pw = (await import('playwright')).default; }
catch { pw = (await import(process.env.PW_MODULE || '/opt/node22/lib/node_modules/playwright/index.js')).default; }

const SRC = 'arcade/assets/arcade-logo.png';
if (!existsSync(SRC)) {
  console.error('MISSING ' + SRC + ' — commit the square, transparent Arcade logo there first.');
  process.exit(1);
}
const dataUri = 'data:image/png;base64,' + readFileSync(SRC).toString('base64');
const BG = '#071426';   // arcade dark field

// A square app-icon tile: the logo centered on the dark brand field, rounded.
function iconHTML(size, pad) {
  return `<!doctype html><meta charset="utf-8"><style>
    html,body{margin:0}
    .t{width:${size}px;height:${size}px;background:
        radial-gradient(120% 120% at 30% 10%, #0d2340 0%, ${BG} 62%);
      display:flex;align-items:center;justify-content:center;overflow:hidden}
    img{width:${100 - pad * 2}%;height:${100 - pad * 2}%;object-fit:contain;
      filter:drop-shadow(0 ${Math.round(size*0.02)}px ${Math.round(size*0.05)}px rgba(0,0,0,.5))}
  </style><div class="t"><img src="${dataUri}"></div>`;
}

const OUT = [
  { file: 'arcade/assets/arcade-icon.png',      w: 512, h: 512, html: iconHTML(512, 9) },
  { file: 'arcade/assets/arcade-apple-180.png', w: 180, h: 180, html: iconHTML(180, 8) }
];

// The OG card: render arcade/og-source.html with the logo inlined as a data URI
// (so no server / absolute-path resolution is needed).
const ogHtml = readFileSync('arcade/og-source.html', 'utf8')
  .replace('src="/arcade/assets/arcade-logo.png"', 'src="' + dataUri + '"');

const exe = process.env.PW_CHROMIUM || undefined;   // CI can pin the binary
const browser = await pw.chromium.launch(exe ? { executablePath: exe } : {});
try {
  for (const o of OUT) {
    const p = await browser.newPage({ viewport: { width: o.w, height: o.h }, deviceScaleFactor: 1 });
    await p.setContent(o.html, { waitUntil: 'load' });
    await p.waitForTimeout(150);
    const el = await p.$('.t');
    const buf = await (el ? el.screenshot({ omitBackground: false }) : p.screenshot());
    writeFileSync(o.file, buf);
    console.log('wrote', o.file, o.w + 'x' + o.h);
    await p.close();
  }
  const p = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await p.setContent(ogHtml, { waitUntil: 'networkidle' });
  await p.waitForTimeout(400);
  writeFileSync('arcade/assets/arcade-share.png', await p.screenshot());
  console.log('wrote arcade/assets/arcade-share.png 1200x630');
  await p.close();
} finally { await browser.close(); }
console.log('done.');
