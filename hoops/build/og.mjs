/* The share card.
 *
 *   (nohup python3 -m http.server 8080 &) ; node hoops/build/og.mjs
 *
 * Renders hoops/og-source.html to hoops/og.png at 1200x630, the size every platform
 * crops a share preview from. Run from the repo root with a static server on :8080.
 *
 * WHY THIS EXISTS AT ALL. The link block is what a player's friends actually see, and
 * this game had none of it: no og:image, no og:title, no card. A share of the daily,
 * which is the whole loop of that mode, arrived in a chat as a bare grey URL while the
 * football and college games arrived as a picture of themselves.
 *
 * THE FONTS ARE FETCHED AND INLINED RATHER THAN LINKED, which is cfb/build/06-og.mjs's
 * lesson and not a new one. Chromium here reaches the network only through a proxy that
 * speaks HTTPS CONNECT, so the page's own <link> to Google Fonts arrives empty and the
 * card would silently render in Times. curl does go through the proxy, so the stylesheet
 * and every woff2 it names are pulled down, turned into data URIs and injected after
 * load. That also makes the render reproducible: the same bytes come out whether or not
 * the network is up when it runs.
 *
 * AND IT REFUSES TO WRITE IF A DISPLAY FACE IS MISSING. A share card set in a fallback
 * is worse than yesterday's card, and this repo's own note about measuring type in a
 * headless browser is the reason the check reads the loaded FontFace set rather than
 * document.fonts.check(), which answers true for a family that merely resolves.
 */
import { execFileSync } from 'child_process';
import { createRequire } from 'node:module';

/* Playwright is installed globally in this sandbox and not in the repo, which is how
   every other browser-driving check here reaches it. See hoops/check-draft.mjs. */
const { chromium } = createRequire('/opt/node22/lib/node_modules/')('playwright');

const CSS = 'https://fonts.googleapis.com/css2?family=Anton'
  + '&family=Archivo:wght@600;700;800&family=Press+Start+2P&display=swap';
/* Google serves woff2 only to a UA it believes supports it. */
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) '
  + 'Chrome/126.0.0.0 Safari/537.36';
const curl = (url, binary) =>
  execFileSync('curl', ['-sSL', '-A', UA, url],
    { maxBuffer: 64 * 1024 * 1024, encoding: binary ? 'buffer' : 'utf8' });

console.log('fetching the stylesheet');
let css = curl(CSS, false);
const urls = Array.from(new Set(css.match(/https:\/\/fonts\.gstatic\.com\/[^)]+/g) || []));
console.log('inlining ' + urls.length + ' font files');
for (const u of urls) {
  const buf = curl(u, true);
  const type = u.endsWith('.woff2') ? 'font/woff2' : 'font/woff';
  css = css.split(u).join('data:' + type + ';base64,' + buf.toString('base64'));
}

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.goto('http://127.0.0.1:8080/hoops/og-source.html',
  { waitUntil: 'domcontentloaded', timeout: 45000 });
await page.addStyleTag({ content: css });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(400);

const fonts = await page.evaluate(() => {
  const loaded = new Set();
  document.fonts.forEach((f) => { if (f.status === 'loaded') loaded.add(f.family.replace(/["']/g, '')); });
  return { pixel: loaded.has('Press Start 2P'), archivo: loaded.has('Archivo') };
});
console.log('faces loaded:', JSON.stringify(fonts));
if (!fonts.pixel || !fonts.archivo) {
  console.log('REFUSING TO WRITE: a display face is missing and the card would be set in a fallback.');
  await browser.close();
  process.exit(1);
}

/* THE BALL IS AN IMAGE NOW, hoops/logo.png, and a screenshot taken before it decodes is a
   card with a hole where the logo goes. So it waits for it, and refuses if it never came. */
const ballOk = await page.evaluate(async () => {
  const img = document.querySelector('img.ball');
  if (!img) return false;
  if (!img.complete) await new Promise((r) => { img.onload = img.onerror = r; });
  return img.naturalWidth > 0;
});
if (!ballOk) {
  console.log('REFUSING TO WRITE: hoops/logo.png did not load, so the card would have no logo.');
  await browser.close();
  process.exit(1);
}

/* THE HEADLINE HAS TO FIT, AND A HEADLESS BROWSER IS THE PLACE THAT CAN SAY SO. It is
   asserted AFTER the face check above and never instead of it: measured in a fallback,
   the headline is a different width from the one that ships. */
const fit = await page.evaluate(() => {
  const h1 = document.querySelector('h1');
  const wrap = document.querySelector('.wrap');
  const ball = document.querySelector('.ball').getBoundingClientRect();
  const r = h1.getBoundingClientRect();
  return { right: r.right, ballLeft: ball.left, bottom: r.bottom,
    wrapWidth: wrap.getBoundingClientRect().width };
});
if (fit.right > 1200 || fit.bottom > 630) {
  console.log(`REFUSING TO WRITE: the headline runs off the card (${JSON.stringify(fit)})`);
  await browser.close();
  process.exit(1);
}

await page.screenshot({ path: 'hoops/og.png', type: 'png' });
console.log('wrote hoops/og.png');
await browser.close();
