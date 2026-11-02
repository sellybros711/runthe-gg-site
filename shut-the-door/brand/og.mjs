/* Shut The Door: the share image, og.png (1200x630), drawn from the brand.
 *
 *   node shut-the-door/brand/og.mjs      (after build.py)
 *
 * The first stadium still, darkened from the left, the crest at the top left, the title line
 * YOU ARE THE CLOSER. CAN YOU SHUT THE DOOR? in Anton (the game's face for its big moments, brand/fonts/) and a
 * signal bar along the foot. Chromium draws it, so the PNG is exactly what the page shows.
 * The page names it in its og:image and twitter:image tags (and the JSON-LD image); bump their
 * ?v= when it changes.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const GAME = path.join(HERE, '..');
const pw = (() => {
  for (const t of ['playwright', '/opt/node-tools/node_modules/playwright', '/opt/node22/lib/node_modules/playwright']) { try { return require(t); } catch (e) {} }
  throw new Error('playwright not found');
})();
const CHROME = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((p) => fs.existsSync(p));
const b64 = (f, type) => 'data:' + type + ';base64,' + fs.readFileSync(path.join(GAME, f)).toString('base64');

const html = `<!doctype html><html><head><style>
  @font-face { font-family: AN; src: url(${b64('brand/fonts/Anton-Regular.ttf', 'font/ttf')}) format('truetype'); font-weight: 400; font-style: normal; }
  html, body { margin: 0; width: 1200px; height: 630px; overflow: hidden; background: #0b0f17; }
  .bg { position: absolute; inset: 0; background: linear-gradient(90deg, rgba(11, 15, 23, .92) 0%, rgba(11, 15, 23, .7) 55%, rgba(11, 15, 23, .35) 100%), url(${b64('home-bg/wide.webp', 'image/webp')}) center / cover; }
  .crest { position: absolute; left: 84px; top: 48px; height: 196px; }
  h1 { position: absolute; left: 80px; bottom: 170px; margin: 0; font: 400 92px/1.04 AN, sans-serif; color: #fff; text-transform: uppercase; letter-spacing: .5px; }
  h1 b { display: block; color: #ff4f1f; }
  .bar { position: absolute; left: 0; right: 0; bottom: 0; height: 12px; background: #ff4f1f; }
</style></head><body><div class="bg"></div><img class="crest" src="${b64('brand/lockup-dark.svg', 'image/svg+xml')}" alt="">
<h1>You are the closer.<b>Can you shut the door?</b></h1><div class="bar"></div></body></html>`;

const browser = await pw.chromium.launch(CHROME ? { executablePath: CHROME } : {});
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.setContent(html);
await page.evaluate(() => document.fonts.ready);
await page.waitForFunction(() => [...document.images].every((i) => i.complete));
await page.screenshot({ path: path.join(GAME, 'og.png') });
await browser.close();
console.log('  og.png (1200x630)');
