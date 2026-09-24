/* The share card.
 *
 *   (nohup python3 -m http.server 8080 &) ; node baseball/build/og.mjs
 *
 * Renders baseball/og-source.html to baseball/og.png at 1200x630, the size every
 * platform crops a share preview from. Run from the repo root with a static server
 * on :8080. This is hoops/build/og.mjs with this game's faces and its own fit check.
 *
 * WHY IT EXISTS. baseball/og.png shipped with NO SOURCE AND NO BUILDER anywhere in
 * the repo, so the one image this game shows strangers could not be re-rendered by
 * anybody, and a cap or a season range moving on the card meant redrawing it by
 * hand. It was also plainly set in a fallback face, which is this repo's own note
 * about measuring type in a headless browser arriving in the worst place.
 *
 * THE FONTS ARE FETCHED AND INLINED RATHER THAN LINKED, which is cfb/build/06-og.mjs's
 * lesson and not a new one. Chromium here reaches the network only through a proxy
 * that speaks HTTPS CONNECT, so the page's own <link> to Google Fonts arrives empty
 * and the card would silently render in Times. curl does go through the proxy, so
 * the stylesheet and every woff2 it names are pulled down, turned into data URIs and
 * injected after load. That also makes the render reproducible: the same bytes come
 * out whether or not the network is up when it runs.
 *
 * AND IT REFUSES TO WRITE IF A DISPLAY FACE IS MISSING. A share card set in a
 * fallback is worse than yesterday's card, and the check reads the loaded FontFace
 * set rather than document.fonts.check(), which answers true for a family that
 * merely resolves.
 */
import { execFileSync } from 'child_process';
import { createRequire } from 'node:module';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const E = createRequire(import.meta.url)(path.join(HERE, '..', 'engine.js'));

/* Playwright is installed globally in this sandbox and not in the repo, which is how
   every other browser-driving check here reaches it. See baseball/check-run.mjs. */
const { chromium } = createRequire('/opt/node22/lib/node_modules/')('playwright');

/* The page's own three: Bebas Neue is --fd, Bitter is --fp, Archivo is --fn. */
const CSS = 'https://fonts.googleapis.com/css2?family=Bebas+Neue'
  + '&family=Bitter:wght@600;700&family=Archivo:wght@600;700;800&display=swap';
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
await page.goto('http://127.0.0.1:8080/baseball/og-source.html',
  { waitUntil: 'domcontentloaded', timeout: 45000 });
await page.addStyleTag({ content: css });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(400);

const fonts = await page.evaluate(() => {
  const loaded = new Set();
  document.fonts.forEach((f) => { if (f.status === 'loaded') loaded.add(f.family.replace(/["']/g, '')); });
  return { bebas: loaded.has('Bebas Neue'), bitter: loaded.has('Bitter'), archivo: loaded.has('Archivo') };
});
console.log('faces loaded:', JSON.stringify(fonts));
if (!fonts.bebas || !fonts.bitter || !fonts.archivo) {
  console.log('REFUSING TO WRITE: a face is missing and the card would be set in a fallback.');
  console.log('That is exactly how the card this replaces came to ship.');
  await browser.close();
  process.exit(1);
}

/* EVERYTHING HAS TO FIT, AND A HEADLESS BROWSER IS THE PLACE THAT CAN SAY SO. Bebas
   is a condensed face and the fallback here is much wider, so a card that fits in the
   sandbox fits on a real render with room; the reverse is not true, which is why this
   is asserted AFTER the face check above and never instead of it.

   THE HEADLINE IS ONE LINE BY CONSTRUCTION (white-space:nowrap), so it does not wrap
   when it runs out of room, it OVERFLOWS, and an overflow is invisible to a check
   that only reads the element's own height. The pills are the other half: three boxes
   on one flex row with no wrap, which silently run off the side rather than stacking. */
const fit = await page.evaluate(() => {
  const r = (s) => { const el = document.querySelector(s); return el ? el.getBoundingClientRect() : null; };
  const h1 = r('h1'), pills = r('.pills'), tag = r('p.tag'), foot = r('.foot'), frame = r('.frame');
  const heights = [...document.querySelectorAll('.pill')].map((p) => p.getBoundingClientRect().height);
  return {
    h1: { left: h1.left, right: h1.right },
    pills: { left: pills.left, right: pills.right },
    tag: { left: tag.left, right: tag.right },
    top: Math.min(...[h1, pills, tag, foot].map((x) => x.top)),
    bottom: Math.max(...[h1, pills, tag, foot].map((x) => x.bottom)),
    frame: { top: frame.top, bottom: frame.bottom, left: frame.left, right: frame.right },
    pillHeights: heights,
  };
});

const problems = [];
const PAD = 8;   // the hairline frame is at 26px; nothing may come within 8px of it
for (const [name, box] of [['headline', fit.h1], ['pills', fit.pills], ['tagline', fit.tag]]) {
  if (box.left < fit.frame.left + PAD || box.right > fit.frame.right - PAD) {
    problems.push(`the ${name} runs into the frame (${box.left.toFixed(0)} to ${box.right.toFixed(0)}`
      + ` against ${fit.frame.left.toFixed(0)} to ${fit.frame.right.toFixed(0)})`);
  }
}
if (fit.top < fit.frame.top + PAD || fit.bottom > fit.frame.bottom - PAD) {
  problems.push(`the block runs into the frame vertically (${fit.top.toFixed(0)} to ${fit.bottom.toFixed(0)}`
    + ` against ${fit.frame.top.toFixed(0)} to ${fit.frame.bottom.toFixed(0)})`);
}
/* One row, one height. The premium sheet's own rule: a grid or flex row stretches
   every cell to its tallest, so a pill that grew a second line would leave a hole
   beside its neighbours rather than reporting anything. */
const hs = fit.pillHeights;
if (hs.length !== 3) problems.push(`there are ${hs.length} pills, not 3`);
if (Math.max(...hs) - Math.min(...hs) > 0.5) {
  problems.push(`the pills are not one height (${hs.map((h) => h.toFixed(1)).join(', ')})`);
}

/* ── AND THE NUMBERS ON IT HAVE TO BE THE NUMBERS THE GAME PLAYS ──────────────
   This is the one surface on the site that can never interpolate. Once rendered
   the card is a picture, so a cap that moves leaves it promising a number the game
   does not charge, on the most public thing this game produces, with no reader who
   can tell and no page to correct.

   IT IS CHECKED HERE RATHER THAN IN check-numbers.mjs, and that was tried first:
   put on that file's PAGES list, og-source.html contributed zero claims and the
   total stayed where it was, because `copyOf` filters through `isCopy`, which
   wants three words, and the card says "$170M cap", which is two. A page on a list
   reading nothing is worse than no page at all. A check at the point of production
   cannot be vacuous. */
const said = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
const cap = said.match(/\$(\d+(?:\.\d+)?)M/);
const slots = said.match(/Draft\s+(\d+)\s+legends/i);
const years = said.match(/(\d{4})-(\d{4})/);

if (!cap) problems.push('the card names no cap at all');
else if (Number(cap[1]) !== E.CONSTANTS.CAP_MUSD) {
  problems.push(`the card says $${cap[1]}M and the engine charges $${E.CONSTANTS.CAP_MUSD}M`);
}
if (!slots) problems.push('the card names no roster count at all');
else if (Number(slots[1]) !== E.SLOTS.length) {
  problems.push(`the card says ${slots[1]} legends and a roster is ${E.SLOTS.length}`);
}
/* The season range is read off the pool rather than pinned, because the annual
   refresh adds a season and this card cannot notice on its own. */
if (!years) problems.push('the card names no season range at all');
else {
  const pool = createRequire(import.meta.url)(path.join(HERE, '..', 'data', 'players.json'));
  const lo = Math.min(...pool.map((r) => r.s)), hi = Math.max(...pool.map((r) => r.s));
  if (Number(years[1]) !== lo || Number(years[2]) !== hi) {
    problems.push(`the card says ${years[1]}-${years[2]} and the pool runs ${lo}-${hi}`);
  }
}

/* ── AND THE VERSION ON IT IS ONE NUMBER IN FOUR PLACES ───────────────────────
   og.png is an ASSET WITH A HAND-WRITTEN VERSION, which is the class
   scripts/check-cachebust.mjs exists for, and that file cannot see this one: it
   reads a <script src>, a module import and a fetch of a .json, and this is a
   <meta> tag. So the card is versioned by hand on two pages, twice each (og:image
   and twitter:image), and nothing anywhere held the four together.

   THEY HAD ALREADY COME APART INSIDE ONE EDIT. Bumping the card to v=2 on
   index.html left how-to-play.html asking for v=1 of a file that had just been
   rewritten, so the two pages pointed at one image under two names and a scraper
   that had seen either one went on serving the old card from its own cache. Nothing
   throws. The only symptom is a share preview that is a version behind, on whichever
   of the two pages somebody happened to paste.

   What is checked is that they AGREE, which is the half a builder can answer. That
   the number MOVED when the bytes did is not knowable here: the pages are edited by
   hand either side of this run, so there is no earlier version to compare against
   and inventing a record beside cachebust.json would be a second copy of an answer. */
const OG = 'baseball/og.png';
const refs = [];
for (const f of ['baseball/index.html', 'baseball/how-to-play.html']) {
  const html = readFileSync(path.join(HERE, '..', '..', f), 'utf8');
  for (const m of html.matchAll(/content="[^"]*baseball\/og\.png\?v=([^"]+)"/g)) {
    refs.push({ file: f, v: m[1] });
  }
}
if (!refs.length) problems.push(`no page asks for ${OG} with a version at all`);
else {
  const seen = [...new Set(refs.map((r) => r.v))];
  if (seen.length > 1) {
    problems.push(`${OG} is asked for at ${seen.length} different versions: `
      + refs.map((r) => `${r.file} wants v=${r.v}`).join(', '));
  }
}

if (problems.length) {
  console.log('REFUSING TO WRITE:');
  for (const p of problems) console.log('  ' + p);
  await browser.close();
  process.exit(1);
}

await page.screenshot({ path: 'baseball/og.png', type: 'png' });
console.log('wrote baseball/og.png');
console.log(`  headline ${fit.h1.left.toFixed(0)} to ${fit.h1.right.toFixed(0)}`
  + `, pills ${fit.pills.left.toFixed(0)} to ${fit.pills.right.toFixed(0)}`
  + `, block ${fit.top.toFixed(0)} to ${fit.bottom.toFixed(0)}`);
await browser.close();
