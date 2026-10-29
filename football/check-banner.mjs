/*
 * check-banner.mjs : the closeable bottom banner covers nothing at first view.
 *
 *   node football/check-banner.mjs
 *
 * The owner's call (2026-10-29): with the banner from assets/rtg-ads.js filled, no button or
 * link on a screen that carries it (the front page, the leaderboard, the results) may sit
 * under it before the player scrolls. Content further down still scrolls under it. Measured
 * the way the Ads Agent measures every game: the banner hidden, then every control that
 * overlaps its box and is the thing actually at that point.
 *
 * ADSENSE IS A STAND-IN that marks every unit filled, so the banner is its real filled height.
 * The display faces are let through from Google Fonts when the network allows, because the
 * front page's title is measured in them; without them the fallback face is wider, which is
 * the strict direction for a claim that something fits.
 *
 * Also proved: closing the banner with its X gives the front page back exactly as it was.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CHROME = process.env.PS_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PW = process.env.PS_PLAYWRIGHT || '/opt/node22/lib/node_modules/playwright/index.js';

let pw;
try { pw = (await import(PW)).default; } catch (e) {
  console.log('Playwright is not available here, so this check cannot run.');
  process.exit(0);
}

let fails = 0;
const ok = (label, cond, extra) => {
  if (!cond) fails++;
  console.log('  ' + (cond ? 'ok  ' : 'FAIL') + '  ' + label + (extra ? '   ' + extra : ''));
};
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
  '.webp': 'image/webp' };
const AD_STUB = "(function(){function f(){document.querySelectorAll('ins.adsbygoogle:not([data-ad-status])').forEach(function(i){var z=i.closest('[data-ad-zone]');if(!z||/^0+$/.test(i.getAttribute('data-ad-slot')||''))return;i.setAttribute('data-ad-status','filled');i.style.background='#c33'})} window.adsbygoogle={push:function(){f()}}; f(); setInterval(f,200);})();";
const SIZES = [[390, 844], [360, 640], [1440, 900], [1920, 1080]];

const browser = await pw.chromium.launch({ executablePath: CHROME });

async function open(w, h) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  const boom = [];
  page.on('pageerror', (e) => boom.push(String(e).slice(0, 200)));
  await page.route('**/*', async (r) => {
    const u = new URL(r.request().url());
    if (/adsbygoogle\.js$/.test(u.pathname)) {
      return r.fulfill({ status: 200, contentType: 'text/javascript', body: AD_STUB });
    }
    if (/^fonts\.(googleapis|gstatic)\.com$/.test(u.hostname)) return r.continue().catch(() => {});
    if (u.hostname !== 'local.test') return r.abort();
    let rel = decodeURIComponent(u.pathname);
    if (rel.endsWith('/')) rel += 'index.html';
    const f = path.join(ROOT, rel);
    if (!fs.existsSync(f)) return r.abort();
    await r.fulfill({ status: 200, contentType: TYPES[path.extname(f)] || 'application/octet-stream',
      body: fs.readFileSync(f) });
  });
  await page.goto('http://local.test/football/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  await page.click('#frg-x', { timeout: 1500 }).catch(() => {});
  return { page, boom };
}
const top = async (page) => { await page.evaluate(() => scrollTo(0, 0)); await page.waitForTimeout(600); };
const covered = (page) => page.evaluate(() => {
  const s = document.querySelector('[data-ad-zone=sticky]');
  const inner = s && s.querySelector('.rtg-sticky-in');
  if (!inner) return 'no banner';
  const z = inner.getBoundingClientRect();
  if (z.height < 5) return 'banner not filled';
  /* The old phone strip (.rtp-ad-mobile-bottom) is transparent and pinned to the same edge,
     and elementFromPoint would land on it and call whatever is behind it clear. */
  document.querySelectorAll('.rtp-ad-mobile-bottom').forEach((x) => { x.style.visibility = 'hidden'; });
  s.style.visibility = 'hidden';
  const hit = [...document.querySelectorAll('button,a[href],[role=button]')].filter((e) => e.offsetWidth)
    .filter((e) => {
      const t = e.getBoundingClientRect();
      if (!(t.bottom > z.top && t.top < z.bottom && t.right > z.left && t.left < z.right)) return false;
      const h = document.elementFromPoint(t.left + t.width / 2, Math.min(innerHeight - 1, t.top + t.height / 2));
      return h && (h === e || e.contains(h));
    }).map((e) => (e.id ? '#' + e.id + ' ' : '') + e.textContent.trim().replace(/\s+/g, ' ').slice(0, 30));
  s.style.visibility = '';
  return hit;
});
const screenOn = (page) => page.evaluate(() => (document.querySelector('.screen.on') || {}).id);
const clear = (c) => Array.isArray(c) && !c.length;

console.log('\nTHE FRONT PAGE, THE LEADERBOARD AND THE RESULTS, AT FIRST VIEW');
for (const [w, h] of [...SIZES, [375, 667], [430, 932], [320, 568]]) {
  const at = w + 'x' + h;
  const { page, boom } = await open(w, h);
  await top(page);
  let c = await covered(page);
  ok(at + ': nothing on the front page is under the banner', clear(c), JSON.stringify(c));
  if (SIZES.some(([a, b]) => a === w && b === h)) {
    await page.evaluate(() => document.getElementById('b-board').click());
    await page.waitForTimeout(2000);
    await top(page);
    c = await covered(page);
    ok(at + ': nothing on the leaderboard is under it', (await screenOn(page)) === 's-board' && clear(c),
      JSON.stringify(c));
    await page.evaluate(() => document.getElementById('b-board-x').click());
    await page.waitForTimeout(800);
    /* A WHOLE RUN TO THE RESULTS: six signings, the season, and every round skipped. */
    await page.click('#b-start');
    await page.waitForTimeout(4500);
    for (let i = 0; i < 6; i++) {
      await page.click('#opts .tile:not(.off)', { timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(300);
      await page.evaluate(() => {
        const b = [...document.querySelectorAll('button')]
          .find((x) => /^(sign|sign him|confirm|yes)/i.test((x.textContent || '').trim()) && x.offsetParent);
        if (b) b.click();
      });
      await page.waitForTimeout(4200);
    }
    await page.click('#b-play', { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(1500);
    for (let k = 0; k < 60 && (await screenOn(page)) !== 's-over'; k++) {
      await page.evaluate(() => {
        for (const id of ['b-sim', 'b-po-skip', 'b-seed-go', 'b-po-fast', 'b-boss-fast']) {
          const e = document.getElementById(id);
          if (e && e.offsetParent) e.click();
        }
      });
      await page.waitForTimeout(1500);
    }
    await page.waitForTimeout(4000);
    await top(page);
    c = await covered(page);
    ok(at + ': nothing on the results is under it', (await screenOn(page)) === 's-over' && clear(c),
      (await screenOn(page)) + ' ' + JSON.stringify(c));
  }
  ok('  nothing threw', !boom.length, boom.join(' | ') || 'clean');
  await page.close();
}

console.log('\nCLOSING THE BANNER GIVES THE FRONT PAGE BACK');
for (const [w, h] of [[390, 844], [360, 640]]) {
  const at = w + 'x' + h;
  const { page, boom } = await open(w, h);
  await top(page);
  const read = () => page.evaluate(() => ({
    on: document.body.classList.contains('rtg-sticky-on'),
    field: Math.round(document.querySelector('.field.hero-field').getBoundingClientRect().height),
    cols: getComputedStyle(document.getElementById('hp-longer')).gridTemplateColumns.split(' ').length,
    moved: document.querySelectorAll('[data-band]').length,
  }));
  const up = await read();
  ok(at + ': with the banner up the doors share a row', up.on && up.cols === 2, JSON.stringify(up));
  await page.click('.rtg-sticky-x');
  await page.waitForTimeout(600);
  const shut = await read();
  ok(at + ': closed, the doors are stacked again and the field is back',
    !shut.on && shut.cols === 1 && shut.field > 100 && shut.moved === 0, JSON.stringify(shut));
  ok('  nothing threw', !boom.length, boom.join(' | ') || 'clean');
  await page.close();
}

await browser.close();
console.log(fails ? `\n${fails} FAILED` : '\nall ok');
process.exit(fails ? 1 : 0);
