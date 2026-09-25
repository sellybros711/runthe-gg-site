/* Renders every Run The Tour logo file from golf/logo-source.html.
 *
 *   (nohup python3 -m http.server 8099 &)      # any static server at the repo root
 *   node golf/build-logo.mjs
 *
 * The logo is pixel art, so every file is one of the source grids at a WHOLE scale. A pixel drawn at 1.5x
 * is two pixels of one width and one of another, which is exactly the mush this avoids. The icon plates
 * are the only thing drawn smooth, because they are a background and not part of the art.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
const HOST = process.env.HOST || 'http://localhost:8099';
const OUT = new URL('.', import.meta.url).pathname;
const b = await chromium.launch();
try {
  const page = await b.newPage();
  await page.goto(HOST + '/golf/logo-source.html');
  await page.waitForFunction('window.__markReady === true');
  const files = await page.evaluate(() => {
    const L = window.LOGO, out = {};
    const png = c => c.toDataURL('image/png');
    // art alone, transparent
    const art = (g, s) => L.toCanvas(g, s);
    // art centred on the game's deep green plate
    const plated = (g, s, size) => {
      const c = document.createElement('canvas'); c.width = c.height = size; const x = c.getContext('2d');
      const r = x.createRadialGradient(size / 2, size * 0.38, 0, size / 2, size * 0.38, size * 0.75);
      r.addColorStop(0, '#1d6b45'); r.addColorStop(0.55, '#0f4029'); r.addColorStop(1, '#082517');
      x.fillStyle = r; x.fillRect(0, 0, size, size);
      const a = L.toCanvas(g, s); x.imageSmoothingEnabled = false;
      x.drawImage(a, Math.round((size - a.width) / 2), Math.round((size - a.height) / 2));
      return c;
    };
    const lock = L.lockup(), i32 = L.icon(32), i16 = L.icon(16);
    out['logo.png'] = png(art(lock, 4));          // 416 x 216, the title for anywhere that wants a big one
    out['lockup.png'] = png(art(lock, 1));        // 104 x 54, shown by CSS at 2x with pixelated scaling
    out['icon-512.png'] = png(plated(i32, 14, 512));
    out['icon-192.png'] = png(plated(i32, 5, 192));
    out['icon-180.png'] = png(plated(i32, 5, 180));
    // Android crops a maskable icon to any shape and only promises the middle 80%, so the art comes in
    out['icon-maskable-512.png'] = png(plated(i32, 10, 512));
    out['favicon-32.png'] = png(art(i32, 1));
    out['favicon-16.png'] = png(art(i16, 1));
    out['favicon-48.png'] = png(art(i16, 3));
    out['mark.png'] = png(art(i16, 4));          // 64 x 64, the header's small mark
    return out;
  });
  for (const [name, url] of Object.entries(files)) {
    fs.writeFileSync(OUT + name, Buffer.from(url.split(',')[1], 'base64'));
    console.log('  wrote', name);
  }
} finally { await b.close(); }
