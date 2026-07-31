/* Stage 8, the share card.
 *
 *   (nohup python3 -m http.server 8080 &) ; node cfb/build/08-og.mjs
 *
 * Renders cfb/og-source.html to cfb/og.png at 1200x630, the size every platform crops a
   share preview from. Run from the repo root with a static server on :8080:
     (see the header above)

   THE FONTS ARE FETCHED AND INLINED RATHER THAN LINKED. Chromium here reaches the network
   only through a proxy that speaks HTTPS CONNECT and nothing else, so the page's own
   <link> to Google Fonts arrives empty and the card would silently render in Times. curl
   does go through the proxy, so the stylesheet and every woff2 it names are pulled down,
   turned into data URIs and injected after load. That also makes the render reproducible:
   the same bytes come out whether or not the network is up when it runs.

   The script refuses to write the file if the display faces are missing, because a share
   card set in a fallback is worse than yesterday's card. */
import { chromium } from 'playwright';
import { execFileSync } from 'child_process';

const CSS = 'https://fonts.googleapis.com/css2?family=Anton&family=Archivo:wght@600;700;800' +
  '&family=Graduate&family=Inter:wght@400;600;700&display=swap';
/* Google serves woff2 only to a UA it believes supports it. */
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/126.0.0.0 Safari/537.36';
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
await page.goto('http://localhost:8080/cfb/og-source.html', { waitUntil: 'domcontentloaded', timeout: 45000 });
await page.addStyleTag({ content: css });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(400);

/* document.fonts.check() answers true when a family is merely resolvable, fallback
   included, so it cannot tell a loaded Anton from Times pretending. Read the loaded
   FontFace set instead, which only holds faces that actually arrived. */
const fonts = await page.evaluate(() => {
  const loaded = new Set();
  document.fonts.forEach((f) => { if (f.status === 'loaded') loaded.add(f.family.replace(/["']/g, '')); });
  return { anton: loaded.has('Anton'), graduate: loaded.has('Graduate'), inter: loaded.has('Inter') };
});
console.log('faces loaded:', JSON.stringify(fonts));
if (!fonts.anton || !fonts.graduate || !fonts.inter) {
  console.log('REFUSING TO WRITE: a display face is missing and the card would be set in a fallback.');
  await browser.close();
  process.exit(1);
}

await page.screenshot({ path: 'cfb/og.png', type: 'png' });
console.log('wrote cfb/og.png');
await browser.close();
