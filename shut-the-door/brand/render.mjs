/* Shut The Door: the PNG icons, rendered from the brand's SVG marks.
 *
 *   node shut-the-door/brand/render.mjs      (after build.py)
 *
 * Writes into shut-the-door/:
 *   favicon-16.png, favicon-32.png   from mark-small.svg (the simplified mark)
 *   apple-touch-icon.png (180)       from mark-square.svg (iOS rounds it itself)
 *   icon-192.png, icon-512.png       from mark.svg (rounded, transparent corners)
 *   icon-maskable-512.png            from mark-square.svg (full bleed, inside the safe zone)
 *
 * Chromium draws them, so a PNG is exactly the SVG the page shows.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, '..');
const pw = (() => {
  for (const t of ['playwright', '/opt/node-tools/node_modules/playwright', '/opt/node22/lib/node_modules/playwright']) { try { return require(t); } catch (e) {} }
  throw new Error('playwright not found');
})();
const CHROME = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((p) => fs.existsSync(p));

const JOBS = [
  ['mark-small.svg', 16, 'favicon-16.png'],
  ['mark-small.svg', 32, 'favicon-32.png'],
  ['mark-square.svg', 180, 'apple-touch-icon.png'],
  ['mark.svg', 192, 'icon-192.png'],
  ['mark.svg', 512, 'icon-512.png'],
  ['mark-square.svg', 512, 'icon-maskable-512.png'],
];

const browser = await pw.chromium.launch(CHROME ? { executablePath: CHROME } : {});
for (const [src, size, out] of JOBS) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  const svg = fs.readFileSync(path.join(HERE, src), 'utf8');
  await page.setContent('<html><body style="margin:0;background:transparent">' +
    '<img style="display:block;width:' + size + 'px;height:' + size + 'px" src="data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64') + '"></body></html>');
  await page.waitForFunction(() => document.images[0].complete);
  await page.screenshot({ path: path.join(OUT, out), omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  await page.close();
  console.log('  ' + out + ' (' + size + ')');
}
await browser.close();
