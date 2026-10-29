/* The Fantasy Challenge's share cards, NFL and college.
 *
 *   (nohup python3 -m http.server 8080 &) ; node football/build/fantasy-og.mjs
 *
 * Renders football/fantasy/og-source.html twice at 1200x630: as it is, to
 * football/fantasy/og.png, and with ?league=cfb, to cfb/fantasy/og.png. Run from the repo
 * root with a static server on :8080.
 *
 * WHY IT EXISTS. A link to the mode used to unfurl as the site's generic card, so the one
 * thing a player shares from it (the link to the week) said nothing about the week.
 *
 * THE FONTS ARE FETCHED AND INLINED, which is cfb/build/06-og.mjs's lesson: Chromium here
 * reaches the network only through a CONNECT proxy, so the page's own link to Google Fonts
 * arrives empty and the card would render in a fallback. curl does go through the proxy.
 *
 * AND IT REFUSES TO WRITE when a face is missing or the layout collides: a share card set
 * in a fallback, or a headline running under the lineup card, is worse than no new card.
 *
 * After a run, bump the ?v= on og.png in both pages' og:image and twitter:image together.
 */
import { execFileSync } from 'child_process';
import { createRequire } from 'node:module';

const { chromium } = createRequire('/opt/node22/lib/node_modules/')('playwright');

const CSS = 'https://fonts.googleapis.com/css2?family=Anton'
  + '&family=Archivo:wght@700;800&family=Inter:wght@500;700&display=swap';
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) '
  + 'Chrome/126.0.0.0 Safari/537.36';
const curl = (url, binary) => execFileSync('curl', ['-sSL', '-A', UA, url],
  { maxBuffer: 64 * 1024 * 1024, encoding: binary ? 'buffer' : 'utf8' });

let css = curl(CSS, false);
const urls = Array.from(new Set(css.match(/https:\/\/fonts\.gstatic\.com\/[^)]+/g) || []));
for (const u of urls) {
  css = css.split(u).join('data:font/woff2;base64,' + curl(u, true).toString('base64'));
}
console.log('inlined ' + urls.length + ' font files');

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
let failed = false;
for (const [q, out] of [['', 'football/fantasy/og.png'], ['?league=cfb', 'cfb/fantasy/og.png']]) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.goto('http://127.0.0.1:8080/football/fantasy/og-source.html' + q,
    { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.addStyleTag({ content: css });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  const got = await page.evaluate(() => {
    const loaded = new Set();
    document.fonts.forEach((f) => { if (f.status === 'loaded') loaded.add(f.family.replace(/["']/g, '')); });
    const r = (s) => document.querySelector(s).getBoundingClientRect();
    const h1 = document.querySelector('h1');
    const rng = document.createRange(); rng.selectNodeContents(h1);
    return { anton: loaded.has('Anton'), archivo: loaded.has('Archivo'),
      ink: rng.getBoundingClientRect().right, card: r('.card').left,
      wrapBottom: r('.sub').bottom, foot: r('.foot').top, cardBottom: r('.card').bottom,
      name: document.getElementById('name').textContent };
  });
  const why = [];
  if (!got.anton || !got.archivo) why.push('a display face is missing');
  if (got.ink > got.card - 16) why.push('the headline runs under the lineup card');
  if (got.wrapBottom > got.foot - 12) why.push('the sub line runs into the footer');
  if (got.cardBottom > 630) why.push('the lineup card runs off the bottom');
  if (why.length) {
    console.log(`REFUSING TO WRITE ${out}: ${why.join(', ')} ${JSON.stringify(got)}`);
    failed = true;
  } else {
    await page.screenshot({ path: out, type: 'png' });
    console.log(`wrote ${out} (${got.name})`);
  }
  await page.close();
}
await browser.close();
process.exit(failed ? 1 : 0);
