/* Renders every MythiBall logo file from mythiball/logo-source.html, and the link preview from
 * mythiball/og-source.html.
 *
 *   (nohup python3 -m http.server 8099 &)      # any static server at the repo root
 *   node mythiball/build-logo.mjs
 *
 * It is golf/build-logo.mjs for this game, file for file. The PIPELINE is shared and the look is not: see the
 * MYPIX header in mythiball/index.html for why.
 *
 * The logo is pixel art, so every file is one of the source grids at a WHOLE scale. A pixel drawn at 1.5x
 * is two pixels of one width and one of another, which is exactly the mush this avoids. The icon plates
 * are the only thing drawn smooth, because they are a background and not part of the art.
 *
 * After a run, bump the ?v= on every reference to a file that changed. They are hand written in
 * mythiball/index.html and mythiball/manifest.webmanifest, and `node mythiball/check-posture.mjs` fails
 * when two of them disagree about one file. It cannot tell that the bytes moved and the number did not,
 * because there is no earlier version to compare against: that half is this sentence.
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
import fs from 'node:fs';
const HOST = process.env.HOST || 'http://localhost:8099';
const OUT = new URL('.', import.meta.url).pathname;
const b = await chromium.launch();
try {
  const page = await b.newPage();
  await page.goto(HOST + '/mythiball/logo-source.html');
  await page.waitForFunction('window.__markReady === true');
  const files = await page.evaluate(() => {
    const L = window.MYPIX, out = {};
    const png = c => c.toDataURL('image/png');
    const art = (g, s) => L.toCanvas(g, s);
    // the patch centred on card stock, the cream the game's own pages are printed on. The patch brings its
    // own navy field, so a navy plate would swallow its edge
    const plated = (g, s, size) => {
      const c = document.createElement('canvas'); c.width = c.height = size; const x = c.getContext('2d');
      const r = x.createRadialGradient(size / 2, size * 0.38, 0, size / 2, size * 0.38, size * 0.75);
      r.addColorStop(0, '#fbf1d6'); r.addColorStop(0.6, '#f1e2bb'); r.addColorStop(1, '#dcc79a');
      x.fillStyle = r; x.fillRect(0, 0, size, size);
      const a = L.toCanvas(g, s); x.imageSmoothingEnabled = false;
      x.drawImage(a, Math.round((size - a.width) / 2), Math.round((size - a.height) / 2));
      return c;
    };
    const lock = L.lockup(0), i32 = L.icon(32, 0), i16 = L.icon(16, 0);
    out['logo.png'] = png(art(lock, 4));          // 416 x 192, the title for anywhere that wants a big one
    out['lockup.png'] = png(art(lock, 1));        // 104 x 48, shown by CSS at a whole multiple, pixelated
    // the ball spinning at the end of its trail: four frames side by side, stepped through by CSS
    { const s = document.createElement('canvas'); s.width = lock.w * 4; s.height = lock.h; const x = s.getContext('2d');
      window.PHASES.forEach((p, i) => x.drawImage(L.toCanvas(L.lockup(p), 1), lock.w * i, 0));
      out['lockup-spin.png'] = png(s); }
    out['icon-512.png'] = png(plated(i32, 14, 512));
    out['icon-192.png'] = png(plated(i32, 5, 192));
    out['icon-180.png'] = png(plated(i32, 5, 180));
    // Android crops a maskable icon to any shape and only promises the middle 80%, so the art comes in
    out['icon-maskable-512.png'] = png(plated(i32, 10, 512));
    out['favicon-32.png'] = png(art(i32, 1));
    out['favicon-16.png'] = png(art(i16, 1));
    out['favicon-48.png'] = png(art(i16, 3));
    out['mark.png'] = png(art(i16, 4));          // 64 x 64
    return out;
  });
  // the link preview, from its own page
  { const og = await b.newPage();
    const errors = [];
    og.on('pageerror', e => errors.push(e.message));
    await og.goto(HOST + '/mythiball/og-source.html');
    await og.waitForFunction('window.__ogReady === true', null, { timeout: 20000 }).catch(() => {});
    if (errors.length) throw new Error('og-source.html threw: ' + errors.join(' | '));
    files['og.png'] = await og.evaluate(() => window.OG.toDataURL('image/png'));
    await og.close(); }
  for (const [name, url] of Object.entries(files)) {
    fs.writeFileSync(OUT + name, Buffer.from(url.split(',')[1], 'base64'));
    console.log('  wrote', name);
  }
} finally { await b.close(); }
