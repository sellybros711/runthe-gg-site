/*
 * check-fanpromo.mjs : the results screen's Fantasy card shows only when it should.
 *
 *   node football/check-fanpromo.mjs
 *
 * The owner's call (2026-11-05): offer the Fantasy Challenge after a run, to somebody with no
 * lineup in, and only while entries are open, never during the games. The week's pointer is
 * served by this check, so every case is decided by the rule and not by today's date.
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
const INJECT = 'fantasyPromoPaint,show';
const HOUR = 3600000;

const browser = await pw.chromium.launch({ executablePath: CHROME });

/* now: { season, week, locks_at } served as the pointer. */
async function card(now, before) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const boom = [];
  page.on('pageerror', (e) => boom.push(String(e).slice(0, 200)));
  if (before) await page.addInitScript(before);
  await page.route('**/*', async (r) => {
    const u = new URL(r.request().url());
    if (u.hostname !== 'local.test') return r.abort();
    let rel = decodeURIComponent(u.pathname);
    if (rel === '/football/data/fantasy_now.json') {
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(now) });
    }
    if (rel.endsWith('/')) rel += 'index.html';
    const f = path.join(ROOT, rel);
    if (!fs.existsSync(f)) return r.abort();
    let body = fs.readFileSync(f);
    if (rel === '/football/index.html') {
      const s = body.toString('utf8');
      if (s.indexOf('\nboot();') < 0) throw new Error('no boot() anchor to inject at');
      body = Buffer.from(s.replace('\nboot();', '\nwindow.__t={' + INJECT + '};\nboot();'), 'utf8');
    }
    await r.fulfill({ status: 200, contentType: TYPES[path.extname(f)] || 'application/octet-stream', body });
  });
  await page.goto('http://local.test/football/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await page.evaluate(() => { window.__t.show('s-over'); window.__t.fantasyPromoPaint(); });
  await page.waitForTimeout(1200);
  const r = await page.evaluate(() => {
    const e = document.getElementById('o-fanpromo');
    return { shown: !!e && !e.hidden, text: e ? e.textContent : '' };
  });
  return { page, boom, ...r };
}

const week = (lockIn) => ({ season: 2026, week: 9, file: 'weekly_2026_w9.json',
  locks_at: new Date(Date.now() + lockIn).toISOString() });

console.log('\nTHE RESULTS SCREEN\'S FANTASY CARD');
{
  const c = await card(week(30 * HOUR));
  ok('entries open, no lineup in: the card is there', c.shown, c.text.slice(0, 60));
  ok('  it names the week', /Week 9/.test(c.text));
  ok('  it says what the week\'s top score wins', /Top score this week wins 30 days of Pro\./.test(c.text));
  ok('  and says when entries lock, in Eastern time', /Entries lock \w{3} \d{1,2}:\d{2}[ap]m ET\./.test(c.text), c.text);
  await c.page.click('#b-fanpromo-x');
  ok('  Not this week takes it away', await c.page.evaluate(() => document.getElementById('o-fanpromo').hidden));
  await c.page.evaluate(() => window.__t.fantasyPromoPaint());
  await c.page.waitForTimeout(800);
  ok('  and it stays away for the rest of the week',
    await c.page.evaluate(() => document.getElementById('o-fanpromo').hidden));
  ok('  nothing threw', !c.boom.length, c.boom[0]);
  await c.page.close();
}
{
  const c = await card(week(-2 * HOUR));
  ok('the games are on (the lock has passed): no card', !c.shown);
  await c.page.close();
}
{
  const c = await card(week(30 * HOUR),
    "localStorage.setItem('ps_fantasy_2026_w9', JSON.stringify({submitted: 1}));");
  ok('a lineup is already in this week: no card', !c.shown);
  await c.page.close();
}
{
  const c = await card(week(30 * HOUR),
    "localStorage.setItem('ps_fanpromo_skip', '2026_w8');");
  ok('waved off LAST week: the card is back for this one', c.shown);
  await c.page.close();
}
{
  const c = await card(week(30 * HOUR), "window.PS_FANTASY_ACCESS = { show: () => false, allowed: () => false };"
    + "Object.defineProperty(window, 'PS_FANTASY_ACCESS', { value: window.PS_FANTASY_ACCESS, writable: false });");
  ok('a player who is not shown the Fantasy door: no card', !c.shown);
  await c.page.close();
}

await browser.close();
console.log(fails ? '\n' + fails + ' FAILED' : '\nall ok');
process.exit(fails ? 1 : 0);
