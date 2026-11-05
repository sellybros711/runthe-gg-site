/*
 * test_fanpromo.mjs : the results screen's Fantasy card shows only when it should.
 *
 *   node cfb/build/test/test_fanpromo.mjs          the cases, in a browser
 *   SHOTS=<dir> node cfb/build/test/test_fanpromo.mjs   and a screenshot of each state
 *
 * The owner's call (2026-11-05), the same rule as the NFL game's card: offer the college
 * Fantasy Challenge after a run, to somebody with no lineup in, and only while entries are
 * open, never from the first kickoff. Every case is decided by the rule and not by today's
 * date, because the week's pointer is served here.
 *
 * WHAT IS REAL. The page is cfb/index.html as shipped, and the account module is cfb/auth.js
 * as shipped, so `fantasyMyEntry` runs for real and its RPC is recorded. Only the Supabase
 * library is replaced, by a stub that signs in a made-up account and answers
 * `cfb_fantasy_my_entry`. Every other request leaves the machine by being aborted, so nothing
 * reaches the live project, which holds real competitions with a prize on them.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const CHROME = process.env.PS_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PW = process.env.PS_PLAYWRIGHT || '/opt/node22/lib/node_modules/playwright/index.js';
const SHOTS = process.env.SHOTS || '';
const SUPA_CDN = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
  '.webp': 'image/webp', '.ico': 'image/x-icon' };
const HOUR = 3600000;
const SEASON = 2026, WEEK = 10, PREV = 9;

let pw;
try { pw = (await import(PW)).default; } catch (e) {
  console.log('Playwright is not available here, so this check cannot run.');
  process.exit(0);
}

let fails = 0, passes = 0;
const ok = (label, cond, extra) => {
  if (cond) passes++; else fails++;
  console.log('  ' + (cond ? 'ok  ' : 'FAIL') + '  ' + label + (extra ? '   ' + extra : ''));
};

/* The stand-in for the Supabase library. It signs in a made-up account when `member` is set,
   records every RPC, and answers the college entry check from `entryRows`. */
const STUB = `(function () {
  var cfg = window.__RTG_STUB || {};
  var session = cfg.member ? { user: { id: 'test-account' }, access_token: 'test' } : null;
  function builder() {
    var b = {
      select: function () { return b; }, eq: function () { return b; }, order: function () { return b; },
      limit: function () { return b; },
      maybeSingle: function () { return Promise.resolve({ data: null, error: null }); },
      then: function (res, rej) { return Promise.resolve({ data: [], error: null }).then(res, rej); },
    };
    return b;
  }
  window.supabase = { createClient: function () { return {
    auth: {
      onAuthStateChange: function (cb) { setTimeout(function () { cb('INITIAL_SESSION', session); }, 0);
        return { data: { subscription: { unsubscribe: function () {} } } }; },
      getSession: function () { return Promise.resolve({ data: { session: session }, error: null }); },
    },
    from: function () { return builder(); },
    rpc: function (name, args) {
      (window.__rpcs = window.__rpcs || []).push({ name: name, args: args });
      if (name === 'cfb_fantasy_my_entry') return Promise.resolve({ data: cfg.entryRows || [], error: null });
      return Promise.resolve({ data: null, error: null });
    },
  }; } };
})();`;

const INJECT_AT = '\nboot();';

/* One page load of the results screen, with the given world. */
async function load(world, opts = {}) {
  const page = await browser.newPage({ viewport: opts.viewport || { width: 390, height: 844 } });
  const boom = [];
  page.on('pageerror', (e) => boom.push(String(e).slice(0, 200)));
  await page.addInitScript((w) => {
    window.__RTG_STUB = { member: !!w.member, entryRows: w.entryRows || [] };
    if (w.localEntry) localStorage.setItem('cfb_fantasy_' + w.localEntry.season + '_w' + w.localEntry.week,
      JSON.stringify({ submitted: 1 }));
    if (w.skip) localStorage.setItem('cfb_fanpromo_skip', w.skip);
  }, world);
  await page.route('**/*', async (r) => {
    const url = r.request().url();
    if (url === SUPA_CDN) return r.fulfill({ status: 200, contentType: 'text/javascript', body: STUB });
    const u = new URL(url);
    if (u.hostname !== 'local.test') return r.abort();
    let rel = decodeURIComponent(u.pathname);
    if (rel === '/cfb/data/fantasy/now.json') {
      if (world.pointer === 'fail') return r.fulfill({ status: 500, contentType: 'text/plain', body: 'down' });
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(world.now) });
    }
    if (rel.endsWith('/')) rel += 'index.html';
    const f = path.join(ROOT, rel);
    if (!fs.existsSync(f)) return r.abort();
    let body = fs.readFileSync(f);
    if (rel === '/cfb/index.html') {
      const s = body.toString('utf8');
      if (s.split(INJECT_AT).length !== 2) throw new Error('boot() anchor is not unique in cfb/index.html');
      /* A getter, because authState is reassigned as the account answers. */
      body = Buffer.from(s.replace(INJECT_AT,
        '\nwindow.__t={fantasyPromoPaint,show,get authState(){return authState;},'
        + 'cfbFanDoor:()=>cfbFanDoor};' + INJECT_AT), 'utf8');
    }
    await r.fulfill({ status: 200, contentType: TYPES[path.extname(f)] || 'application/octet-stream', body });
  });
  await page.goto('http://local.test/cfb/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  return { page, boom };
}

/* Open the results screen the way the game does, and read what the card says. */
async function results(h) {
  await h.page.evaluate(() => { window.__t.show('s-over'); window.__t.fantasyPromoPaint(); });
  await h.page.waitForTimeout(1500);
  return h.page.evaluate(() => {
    const e = document.getElementById('o-fanpromo');
    return {
      shown: !!e && !e.hidden,
      text: e ? e.textContent : '',
      doorDrawn: !!document.getElementById('b-hp-fantasy'),
      rpcs: window.__rpcs || [],
    };
  });
}

const pointer = (lockIn, extra = {}) => ({ season: SEASON, week: WEEK, file: 'pool_2026_w10.json',
  locks_at: new Date(Date.now() + lockIn).toISOString(), ...extra });
const AHEAD = pointer(30 * HOUR);

console.log('\nTHE RESULTS SCREEN\'S FANTASY CARD');
const browser = await pw.chromium.launch({ executablePath: CHROME });

{
  const h = await load({ now: AHEAD });
  const r = await results(h);
  ok('the door is drawn, entries open, no lineup in: the card is there', r.shown, r.text.slice(0, 60));
  ok('  and the door is drawn, so the card has a week to sell', r.doorDrawn);
  ok('  it names the week', /Week 10/.test(r.text));
  ok('  it says what the week\'s top score wins', /Top score this week wins Pro\./.test(r.text));
  ok('  and says when entries lock, in Eastern time', /Lineups lock \w{3} \d{1,2}:\d{2}[ap]m ET\./.test(r.text), r.text);
  ok('  it links to the college page', await h.page.evaluate(() =>
    document.getElementById('b-fanpromo').getAttribute('href') === '/cfb/fantasy/'));
  ok('  a guest is not asked the server (no account)', !r.rpcs.some((x) => x.name === 'cfb_fantasy_my_entry'));
  if (SHOTS) {
    await h.page.locator('#o-fanpromo').scrollIntoViewIfNeeded();
    await h.page.screenshot({ path: path.join(SHOTS, 'card-390-no-lineup.png'), fullPage: false });
  }
  await h.page.click('#b-fanpromo-x');
  ok('  Not this week takes it away', await h.page.evaluate(() => document.getElementById('o-fanpromo').hidden));
  await h.page.evaluate(() => window.__t.fantasyPromoPaint());
  await h.page.waitForTimeout(800);
  ok('  and it stays away for the rest of the week',
    await h.page.evaluate(() => document.getElementById('o-fanpromo').hidden));
  ok('  nothing threw', !h.boom.length, h.boom[0]);
  await h.page.close();
}
{
  const h = await load({ now: pointer(-2 * HOUR) });
  const r = await results(h);
  ok('the games are on (the lock has passed): no card', !r.shown);
  await h.page.close();
}
{
  const h = await load({ now: AHEAD, localEntry: { season: SEASON, week: WEEK } });
  const r = await results(h);
  ok('a lineup is in on this browser: no card', !r.shown);
  await h.page.close();
}
{
  const h = await load({ now: AHEAD, member: true, entryRows: [{ picks: ['a', 'b'] }] });
  const r = await results(h);
  const asked = r.rpcs.find((x) => x.name === 'cfb_fantasy_my_entry');
  ok('signed in, the server has a lineup in from another device: no card', !r.shown);
  ok('  the college entry check ran, for this week',
    !!asked && asked.args.p_season === SEASON && asked.args.p_week === WEEK, JSON.stringify(asked));
  ok('  and the NFL entry check did not run', !r.rpcs.some((x) => x.name === 'fantasy_my_entry'));
  await h.page.close();
}
{
  const h = await load({ now: AHEAD, member: true, entryRows: [] });
  const r = await results(h);
  ok('signed in, no lineup on the server or here: the card is there', r.shown);
  ok('  and the server was asked', r.rpcs.some((x) => x.name === 'cfb_fantasy_my_entry'));
  if (SHOTS) {
    await h.page.locator('#o-fanpromo').scrollIntoViewIfNeeded();
    await h.page.screenshot({ path: path.join(SHOTS, 'card-1440-no-lineup.png'), fullPage: false });
  }
  await h.page.close();
}
{
  /* An older cached auth.js has no fantasyMyEntry: the card falls back to the browser record. */
  const h = await load({ now: AHEAD, member: true, entryRows: [{ picks: ['a'] }] });
  await h.page.evaluate(() => { delete window.PS_CFB_AUTH.fantasyMyEntry; });
  const r = await results(h);
  ok('an older auth.js with no entry check: the browser record decides, and the card is there', r.shown);
  await h.page.close();
}
{
  const h = await load({ now: AHEAD, skip: `${SEASON}_w${PREV}` });
  const r = await results(h);
  ok('waved off LAST week: the card is back for this one', r.shown);
  await h.page.close();
}
{
  const h = await load({ now: AHEAD, skip: `${SEASON}_w${WEEK}` });
  const r = await results(h);
  ok('waved off THIS week: no card', !r.shown);
  await h.page.close();
}
{
  const h = await load({ now: AHEAD, pointer: 'fail' });
  const r = await results(h);
  ok('the pointer fetch fails: no card', !r.shown);
  ok('  nothing threw', !h.boom.length, h.boom[0]);
  await h.page.close();
}
{
  const h = await load({ now: AHEAD });
  await h.page.evaluate(() => { document.getElementById('b-hp-fantasy').remove(); });
  const r = await results(h);
  ok('the Fantasy door is not drawn: no card', !r.shown);
  await h.page.close();
}

/* With SHOTS set, the results screen's buttons at both sizes, with and without a lineup in. */
if (SHOTS) {
  for (const [name, vp] of [['390', { width: 390, height: 844 }], ['1440', { width: 1440, height: 900 }]]) {
    for (const [state, world] of [['no-lineup', {}], ['lineup-in', { localEntry: { season: SEASON, week: WEEK } }]]) {
      const h = await load({ now: AHEAD, ...world }, { viewport: vp });
      await results(h);
      await h.page.locator('.next-panel').scrollIntoViewIfNeeded();
      await h.page.screenshot({ path: path.join(SHOTS, `results-${name}-${state}.png`) });
      await h.page.close();
    }
  }
  console.log('\nscreenshots written to ' + SHOTS);
}

await browser.close();
console.log(fails ? '\n' + fails + ' FAILED, ' + passes + ' ok' : '\nall ' + passes + ' ok');
process.exit(fails ? 1 : 0);
