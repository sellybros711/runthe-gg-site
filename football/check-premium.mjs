/*
 * check-premium.mjs : the premium bundle, checked in a real browser.
 *
 *   node football/check-premium.mjs
 *
 * WHY THIS EXISTS. Every fault this catches is silent. A premium door that opens for the
 * wrong account throws nothing. A store button that posts the wrong bundle key charges
 * somebody for the wrong thing and returns a perfectly good 200. And the one that actually
 * shipped: moving the store into /assets/store.js left two callers behind on the football
 * page, "pwArt is not defined" threw during boot, and the whole game sat on the loading
 * screen. It was live for an hour, because the store had been verified in the PLAIN view
 * and the card that broke is only drawn for a tester.
 *
 * SO THE FIRST SECTION BOOTS BOTH VIEWS, on both pages that sell the bundle. That is the
 * check that would have caught it, and it is first because nothing below means anything if
 * the page does not start.
 *
 * STRIPE IS LIVE AND THERE IS NO TEST MODE. A request that reaches
 * /api/stripe/checkout-bundle for real ends at a real payment page. So the route is
 * intercepted here and answered with an error rather than a session url: the assertion is
 * about the KEY in the request body, and an answer carrying a url would navigate the page
 * to Stripe. Nothing in this file can spend money, and it must stay that way.
 *
 * WHAT IT DELIBERATELY DOES NOT DO is talk to Supabase or Stripe. Ownership is set by hand,
 * because the question here is what the PAGE does with an answer, not what the server
 * returns. The server side has its own check: scripts/stripe/verify-bundles.mjs.
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
  console.log('Set PS_PLAYWRIGHT to its index.js and PS_CHROME to a browser, or run it in CI.');
  process.exit(0);
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.webp': 'image/webp', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' };

let fails = 0;
const ok = (label, cond, extra) => {
  if (!cond) fails++;
  console.log('  ' + (cond ? 'ok  ' : 'FAIL') + '  ' + label + (extra ? '   ' + extra : ''));
};

/* One page, serving the repo off disk. `tester` flips the two access files the way the
   tester lists do, which is the view the boot crash lived in. */
async function openPage(browser, url, opts = {}) {
  const { tester = false, inject = null } = opts;
  const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
  const posted = [], boom = [];
  page.on('pageerror', (e) => boom.push(String(e).slice(0, 200)));
  await page.route('**/*', async (r) => {
    const u = new URL(r.request().url());
    if (u.pathname === '/api/stripe/checkout-bundle') {
      let body = {};
      try { body = JSON.parse(r.request().postData() || '{}'); } catch (e) {}
      posted.push(body);
      return r.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ error: 'intercepted_by_check' }) });
    }
    if (u.hostname !== 'local.test') return r.abort();
    let rel = decodeURIComponent(u.pathname);
    if (rel.endsWith('/')) rel += 'index.html';
    const f = path.join(ROOT, rel);
    if (!fs.existsSync(f)) return r.abort();
    let body = fs.readFileSync(f);
    if (tester && (rel.endsWith('dynasty-access.js') || rel.endsWith('fullteam-access.js'))) {
      body = Buffer.from(body.toString('utf8').replace(/LIVE = false/, 'LIVE = true'), 'utf8');
    }
    if (inject && rel === '/football/index.html') {
      const s = body.toString('utf8');
      if (s.indexOf('\nboot();') < 0) throw new Error('no boot() anchor to inject at');
      body = Buffer.from(s.replace('\nboot();', '\nwindow.__t={' + inject + '};\nboot();'), 'utf8');
    }
    await r.fulfill({ status: 200,
      contentType: TYPES[path.extname(f)] || 'application/octet-stream', body });
  });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  return { page, posted, boom };
}

const browser = await pw.chromium.launch({ executablePath: CHROME });

console.log('THE PAGE STARTS, IN BOTH VIEWS');
for (const [label, tester, url] of [
  ['football, plain view', false, 'http://local.test/football/'],
  ['football, tester view', true, 'http://local.test/football/'],
  ['cfb commish', false, 'http://local.test/cfb/commish/'],
]) {
  const { page, boom } = await openPage(browser, url, { tester });
  const on = await page.evaluate(() =>
    [...document.querySelectorAll('.screen.on')].map((s) => s.id).join(','));
  const stuck = /s-load/.test(on);
  ok(label, !stuck && !boom.length, stuck ? ('stuck on ' + on) : (boom.join(' | ') || on));
  await page.close();
}

console.log('\nTHE premium_unlocks ROW IS WHAT DECIDES, NOT THE TESTER LIST');
const INJECT = 'beginDynastyDraft,premiumSheet,profileSheet,pfPro,acctTier,premiumPitch,dailyOn,'
  + 'dailyGrace,dailySpentSheet,dynastyRulesHTML,canPlayClubDynasty,'
  /* A grace server that grants each reason once, standing in for ps_attempt_grace. Built on
     top of whatever the state already holds rather than from three fields, so `unit` survives
     the answer: a stub that drops it would put the page back on the run rule mid-check and
     the season copy would never be the thing being read. */
  + 'stubGrace:()=>{const got={};B.attemptGrace=async(m,reason)=>{const first=!got[reason];'
  + 'got[reason]=true;const s=dailyState[m]||{};'
  + 'return Object.assign({},s,{ok:true,allowance:(s.allowance||0)+(first?1:0)});};},'
  /* A server that closes the window and stamps the wait, which is what the real
     ps_attempt_day_end does. It counts its calls, because the assertion that matters is
     how often the page asks rather than what comes back. */
  + 'dailyStop,dailyDayEnd,'
  + 'stubDayEnd:()=>{const n={c:0,fired:null};B.attemptDayEnd=async(m,f)=>{n.c++;n.fired=f;'
  + 'const s=dailyState[m]||{};return Object.assign({},s,{used:s.allowance,ended:!!f,'
  + 'resetsAt:new Date(Date.now()+864e5).toISOString()});};return n;},'
  + 'setPremium:(v)=>{premiumSet=v;},setDaily:(m,v)=>{dailyState[m]=v;},'
  + 'getDaily:(m)=>dailyState[m],'
  + "signIn:()=>{authState.signedIn=true;authState.ready=true;authState.name='tester';}";
const t = await openPage(browser, 'http://local.test/football/', { tester: true, inject: INJECT });
await t.page.evaluate(() => window.__t.signIn());

/* THE RULES SHEET STANDS IN FRONT OF EVERY RUN NOW, unless the reader has ticked its own
   "don't show this again", so the two paths through dynastyIntro are opted-in and opted-out
   rather than first-time and later. The dead button only ever appeared on the path where no
   sheet was in the way, which is why both are still driven.
   DRIVEN ON ps_dynintro_off, NOT ps_dynintro. The second key still exists and still retires
   the NEW badge, and it no longer has anything to do with whether the sheet appears; a check
   left on the old key would run the same path twice and say it had run two. */
for (const introOff of [false, true]) {
console.log('  ' + (introOff ? 'having turned the rules sheet off:' : 'with the rules sheet in front of it:'));
await t.page.evaluate((off) => {
  try { if (off) localStorage.setItem('ps_dynintro_off', '1');
    else localStorage.removeItem('ps_dynintro_off'); } catch (e) {}
  window.__dynIntroOff = off || undefined;
}, introOff);
/*
 * THREE ACCOUNTS, AND THE FIRST ONE IS THE ONE THAT BROKE.
 *
 * A rowless tester WITH A RUN LEFT is the ordinary case: almost every press of Start a
 * dynasty is this. The two cases below it were the only ones being checked, and both have a
 * reason not to reach the draft (one is out of runs, the other owns the mode), so a gate
 * that silently refused everybody without a row passed the whole suite while the button did
 * nothing at all for the people using it.
 */
for (const [who, owns, day, want] of [
  ['a tester with no row and a run left', [], { used: 0, allowance: 1 }, 'the mode'],
  ['a tester with no row and none left', [], { used: 9, allowance: 1 }, 'the store on the spent sheet'],
  ['a tester holding ps_premium', ['ps_premium', 'cfb_premium'], { used: 9, allowance: 1 }, 'the mode'],
]) {
  const r = await t.page.evaluate(([owns, day]) => {
    const T = window.__t;
    T.setPremium(owns);
    const st = { used: day.used, allowance: day.allowance,
      resetsAt: new Date(Date.now() + 3600e3).toISOString() };
    T.setDaily('dynasty', st); T.setDaily('trade', st);
    /* And no saved run, or the replace sheet stands between the press and the draft. */
    try { localStorage.removeItem('ps_dynasty_save'); } catch (e) {}
    document.getElementById('sheet').classList.remove('on');
    document.getElementById('sheet-in').dataset.kind = '';
    T.beginDynastyDraft();
    /*
     * THE END OF THE JOURNEY, NOT THE FIRST STEP OF IT.
     *
     * This used to count the rules sheet (#b-dyni-go) as "the mode", and that is exactly
     * how a dead button got shipped: a SECOND ownership gate inside beginDraft returned
     * silently one step later, so the rules sheet opened, Draft my team did nothing, and
     * this check said the door was fine. Press through whatever stands in the way and
     * insist on the draft screen itself.
     */
    const go = document.getElementById('b-dyni-go');
    if (go) go.click();
    const kind = document.getElementById('sheet-in').dataset.kind;
    const onDraft = [...document.querySelectorAll('.screen.on')].some((s) => s.id === 's-draft');
    const door = onDraft ? 'the mode'
      : kind === 'premium' ? 'store'
      : kind === 'daily' ? 'the store on the spent sheet'
      : 'nowhere (sheet=' + (kind || 'none') + ', screens='
        + [...document.querySelectorAll('.screen.on')].map((s) => s.id).join(',') + ')';
    /* THE SPENT DOOR CARRIES THE OFFER ITSELF, not a card that opens it. Read before the
       profile sheet replaces the box. */
    const box = document.getElementById('sheet-in');
    const store = { tiles: [...box.querySelectorAll('.pw-tile b')].map((x) => x.textContent),
      from: [...box.querySelectorAll('.pw-from')].map((x) => x.textContent),
      buys: box.querySelectorAll('.pw-tier .btn').length };
    document.getElementById('sheet').classList.remove('on');
    T.profileSheet();
    return { door, store, tier: T.acctTier(), pitch: T.premiumPitch(), metered: T.dailyOn(),
      goPro: !!document.getElementById('pf-prem'),
      /* THE THREE MODES, AS THE MARKS THE STORE DRAWS THEM WITH, in a row under the word
         UNLIMITED. Counted AND measured, because the way this broke was neither a missing
         element nor an error: a comment closed one line early in the stylesheet swallowed
         both rules, the marks rendered as three blocks stacked in a column, and the only
         symptom was a card a third taller than it should be. */
      goProMarks: document.querySelectorAll('#pf-prem .pwc-marks svg').length,
      goProRow: (() => {
        const m = document.querySelector('#pf-prem .pwc-marks');
        return m ? getComputedStyle(m).display : 'none';
      })(),
      goProValue: ((document.querySelector('#pf-prem .pwc-go b') || {}).textContent) || '',
      goProCounts: /\d+\s*modes/i.test(
        (document.getElementById('pf-prem') || {}).innerText || ''),
      /* The front page's own card, built as a node rather than written into markup, which is
         the whole reason the two could say different things. */
      homeValue: ((document.querySelector('#b-premium .pwc-go b') || {}).textContent) || '',
      homeMarks: document.querySelectorAll('#b-premium .pwc-marks svg').length,
      homeCounts: /\d+\s*modes/i.test(
        (document.getElementById('b-premium') || {}).innerText || ''),
      proAccess: !!document.getElementById('pf-go-pro') };
  }, [owns, day]);
  console.log('  ' + who + ':');
  const owner = owns.length > 0;
  ok('    pressing the door reaches ' + want, r.door === want, r.door);
  ok('    dailyOn() is ' + (owner ? 'off' : 'on'), r.metered === !owner, String(r.metered));
  ok('    acctTier() is ' + (owner ? 'pro' : 'free'), r.tier === (owner ? 'pro' : 'free'), r.tier);
  ok('    premiumPitch() ' + (owner ? 'stands down' : 'offers'), r.pitch === !owner);
  ok('    the profile shows ' + (owner ? 'Your Pro access' : 'Go Pro'),
    owner ? (r.proAccess && !r.goPro) : (r.goPro && !r.proAccess),
    'goPro=' + r.goPro + ' proAccess=' + r.proAccess);
  if (!owner) {
    ok('    and the Go Pro card carries the three modes it sells',
      r.goProMarks === 3, String(r.goProMarks));
    ok('    in a row rather than a stack', r.goProRow === 'flex', r.goProRow);
    /* AND NEITHER CARD COUNTS ANY MORE. The front page said "4 modes", this one said
       "3 modes" and the college profile said "3 modes", about one purchase, on one day.
       All three are drawn by /assets/store.js now and a digit reappearing in any of them
       means one of them has been written out by hand again. */
    ok('    and says Unlimited rather than a number',
      r.goProValue === 'Unlimited' && !r.goProCounts, r.goProValue);
    ok('    the front page card says exactly the same',
      r.homeValue === 'Unlimited' && r.homeMarks === 3 && !r.homeCounts,
      r.homeValue + ' / ' + r.homeMarks + ' marks');
  }
  if (!owner && want !== 'the mode') {
    /* The spent door was a card linking to the store, which is a second tap between
       somebody who has just decided they want more and the thing that sells it. */
    ok('    the spent door draws the bundle itself',
      r.store.tiles.length === 3 && r.store.buys === 2,
      r.store.tiles.join(', ') + ' / ' + r.store.buys + ' buy buttons');
    ok('    and every tile says which game it is in',
      r.store.from.join(' | ') === 'Perfect Season | Perfect Season | College Football',
      r.store.from.join(' | '));
  }
  /* THE CARD PROMISES ONE FRANCHISE DYNASTY, so the row has to open it. This was the gate
     that had not learned the paid tier exists: it read the tester list and nothing else, so
     the store sold a mode the purchase did not deliver. Checked with the tester list EMPTY,
     because with a tester on it the list answers and the row is never consulted. */
  const club = await t.page.evaluate((owns) => {
    const A = window.PS_DYNASTY_ACCESS;
    const keptNames = A.TESTERS.slice(), keptIds = A.TESTER_IDS.slice();
    A.TESTERS.length = 0; A.TESTER_IDS.length = 0;
    const answer = window.__t.canPlayClubDynasty();
    A.TESTERS.push.apply(A.TESTERS, keptNames);
    A.TESTER_IDS.push.apply(A.TESTER_IDS, keptIds);
    return answer;
  }, owns);
  ok('    One Franchise Dynasty ' + (owner ? 'opens on the row alone' : 'stays shut without one'),
    club === owner, String(club));
  /* Back to the front page for the next case, whichever screen the last one ended on. */
  await t.page.evaluate(() => {
    document.getElementById('sheet').classList.remove('on');
    if (typeof window.__t.backToStart === 'function') window.__t.backToStart();
    document.querySelectorAll('.screen.on').forEach((s) => s.classList.remove('on'));
    document.getElementById('s-intro').classList.add('on');
  });
}
}

console.log('\nTHE STORE POSTS THE CATALOG KEYS AND NOTHING ELSE');
await t.page.evaluate(() => {
  window.__t.setPremium([]);
  /* beginBundleCheckout correctly refuses without a session token and sends the visitor to
     sign up instead, so the buttons never reach the endpoint in a signed out harness. */
  window.PS_AUTH = Object.assign({}, window.PS_AUTH, { token: () => 'check-token' });
});
for (const id of ['b-buy-ps', 'b-buy-rtb']) {
  await t.page.evaluate((id) => {
    document.getElementById('sheet').classList.remove('on');
    window.__t.premiumSheet();
    const el = document.getElementById(id);
    if (el) el.click();
  }, id);
  await t.page.waitForTimeout(500);
}
ok('two posts, both to checkout-bundle', t.posted.length === 2, JSON.stringify(t.posted));
ok('the keys are the two in _bundles.js',
  t.posted.length === 2 && t.posted[0].bundle === 'perfect-season'
    && t.posted[1].bundle === 'run-the-bundle',
  t.posted.map((x) => x.bundle).join(', '));

console.log('\nTHE RECEIPT SAYS WHAT, WHEN, AND WHETHER IT RUNS OUT');
const rec = await t.page.evaluate(async () => {
  const T = window.__t;
  T.setPremium(['ps_premium', 'cfb_premium', 'arcade_card_year', 'runtour_pack']);
  const ends = new Date(Date.now() + 300 * 86400e3).toISOString();
  const at = '2026-09-01T00:00:00Z';
  window.PS_AUTH = Object.assign({}, window.PS_AUTH, {
    token: () => 'check-token',
    premiumUnlocks: async () => [
      { product: 'ps_premium', source: 'bundle:run-the-bundle', granted_at: at, expires_at: null, fulfilled_at: at },
      { product: 'cfb_premium', source: 'bundle:run-the-bundle', granted_at: at, expires_at: null, fulfilled_at: at },
      { product: 'arcade_card_year', source: 'bundle:run-the-bundle', granted_at: at, expires_at: ends, fulfilled_at: at },
      { product: 'runtour_pack', source: 'bundle:run-the-bundle', granted_at: at, expires_at: null, fulfilled_at: null },
    ],
  });
  document.getElementById('sheet').classList.remove('on');
  T.pfPro();
  await new Promise((r) => setTimeout(r, 800));
  return { text: (document.getElementById('sheet-in').innerText || '').replace(/\s+/g, ' '),
    ends: new Date(ends).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) };
});
ok('all four grants are listed',
  ['Dynasty', 'Commissioner', 'Arcade Card', 'Tour Pack'].every((w) => rec.text.includes(w)));
ok('the Arcade year carries its end date', rec.text.includes(rec.ends), 'expected ' + rec.ends);
ok('and it says nothing renews', /Nothing here renews/i.test(rec.text));
ok('the Tour drop, unfulfilled, says it is on its way', /on its way/i.test(rec.text));

console.log('\nTHE OLD RUN RULE, WHICH IS STILL THE RULE UNTIL 101 IS DEPLOYED');
/*
 * The game grants a second run for being fired in season one and a third for winning a boss
 * game, and for a long time it granted them SILENTLY: the allowance moved on the server, the
 * door quietly went back to playable, and nobody was told either thing had happened. A rule
 * nobody knows about is not a reward.
 *
 * DRIVEN WITH NO `unit` ON THE STATE, which is exactly what a database still on
 * 100_daily_grace_reasons.sql answers, and is the whole reason this section stays: the page
 * has to keep describing and enforcing that rule correctly until the migration lands.
 */
const grace = await t.page.evaluate(async () => {
  const T = window.__t;
  T.setPremium([]);
  T.setDaily('dynasty', { used: 1, allowance: 1, resetsAt: new Date(Date.now() + 3600e3).toISOString() });
  /* A server that grants each reason once, which is the rule 100_daily_grace_reasons.sql
     keeps. Without the "once" half, the repeat claim below cannot be checked. */
  const got = {};
  window.PS_BOARD_GRACE_STUB = true;
  T.stubGrace();
  const said = () => document.getElementById('toast').textContent;
  const out = {};
  document.getElementById('toast').textContent = '';
  await T.dailyGrace('dynasty', 'fired'); out.fired = said();
  document.getElementById('toast').textContent = '';
  await T.dailyGrace('dynasty', 'fired'); out.again = said();
  document.getElementById('toast').textContent = '';
  await T.dailyGrace('dynasty', 'boss'); out.boss = said();
  /* And the spent sheet, in the three states that decide whether it offers the rule. */
  const sheetFor = (mode, allow) => {
    T.setDaily(mode, { used: allow, allowance: allow, resetsAt: new Date(Date.now() + 3600e3).toISOString() });
    document.getElementById('sheet').classList.remove('on');
    T.dailySpentSheet(mode);
    return !!document.getElementById('sheet-in').querySelector('.dgrace');
  };
  out.none = sheetFor('dynasty', 1);
  out.both = sheetFor('dynasty', 3);
  out.trade = sheetFor('trade', 1);
  /* And the rules sheet, before anybody starts. */
  T.setDaily('dynasty', { used: 0, allowance: 1, resetsAt: new Date(Date.now() + 3600e3).toISOString() });
  const d = document.createElement('div');
  d.innerHTML = T.dynastyRulesHTML('go');
  out.rules = (d.innerText || '').replace(/\s+/g, ' ');
  T.setPremium(['ps_premium']);
  const o = document.createElement('div');
  o.innerHTML = T.dynastyRulesHTML('go');
  out.ownerRules = (o.innerText || '').replace(/\s+/g, ' ');
  T.setPremium([]);
  return out;
});
ok('a season one firing announces the extra run', /another run today/i.test(grace.fired), grace.fired);
ok('the same reason twice announces nothing', grace.again === '', '"' + grace.again + '"');
ok('a boss win announces the extra run', /another run today/i.test(grace.boss), grace.boss);
ok('the spent sheet lists the two ways', grace.none === true);
ok('and stops once both are earned', grace.both === false);
ok('the Trade Machine, which earns neither, is not offered them', grace.trade === false);
ok('the rules sheet states all three', /One run a day/i.test(grace.rules)
  && /Fired in season one/i.test(grace.rules) && /Win a boss battle/i.test(grace.rules));
ok('an owner is told about no limit at all', !/One run a day/i.test(grace.ownerRules));

console.log('\nTHE SEASON RULE, ONCE 101 AND 102 ARE DEPLOYED');
/*
 * THREE SEASONS A DAY ON ONE RUN, not one run a day. The unit arrives on the state row, so
 * every screen below is driven by setting it and nothing else: that is the contract between
 * 101_dynasty_seasons.sql and this page, and it is the thing that would break silently.
 *
 * THE THREE SHEETS ARE THREE DIFFERENT SENTENCES and the wrong one is not a typo. Telling
 * somebody mid-dynasty that "that is today's run" says the run is gone, which is the single
 * most alarming thing this screen could say and is false.
 */
const seas = await t.page.evaluate(async () => {
  const T = window.__t;
  T.setPremium([]);
  const at = new Date(Date.now() + 3600e3).toISOString();
  const day = (o) => Object.assign({ unit: 'season', resetsAt: at, ended: false }, o);
  const sheet = (o) => {
    T.setDaily('dynasty', day(o));
    document.getElementById('sheet').classList.remove('on');
    T.dailySpentSheet('dynasty');
    const box = document.getElementById('sheet-in');
    return { text: (box.innerText || '').replace(/\s+/g, ' '), grace: !!box.querySelector('.dgrace') };
  };
  const out = {};
  out.capped = sheet({ used: 3, allowance: 3 });
  out.boss = sheet({ used: 4, allowance: 4 });
  out.fired = sheet({ used: 1, allowance: 3, ended: true });
  /* The boss toast, which cannot say "another run" when no run was ever at risk. */
  T.setDaily('dynasty', day({ used: 3, allowance: 3 }));
  T.stubGrace();
  document.getElementById('toast').textContent = '';
  await T.dailyGrace('dynasty', 'boss');
  out.said = document.getElementById('toast').textContent;
  /* And the rules, before anybody starts. */
  T.setDaily('dynasty', day({ used: 0, allowance: 3 }));
  const d = document.createElement('div');
  d.innerHTML = T.dynastyRulesHTML('go');
  out.rules = (d.innerText || '').replace(/\s+/g, ' ');
  /* THE DOOR, with the day ended and no run to resume. */
  T.setDaily('dynasty', day({ used: 1, allowance: 3, ended: true }));
  document.getElementById('sheet').classList.remove('on');
  document.getElementById('sheet-in').dataset.kind = '';
  T.beginDynastyDraft();
  const go = document.getElementById('b-dyni-go');
  if (go) go.click();
  out.shut = document.getElementById('sheet-in').dataset.kind;
  out.onDraft = [...document.querySelectorAll('.screen.on')].some((s) => s.id === 's-draft');
  document.getElementById('sheet').classList.remove('on');
  return out;
});
ok('a spent day names the seasons, not a run',
  /That is your 3 seasons/i.test(seas.capped.text)
    && /all 3 of your free seasons/i.test(seas.capped.text),
  seas.capped.text.slice(0, 120));
ok('and says the dynasty is still there',
  /saved exactly where it stands/i.test(seas.capped.text), seas.capped.text.slice(0, 160));
ok('and that the clock is theirs and 24 hours long',
  /runs 24 hours/i.test(seas.capped.text), seas.capped.text.slice(0, 260));
ok('the boss battle is the one way to earn another', seas.capped.grace === true);
ok('and stops being offered once it is earned', seas.boss.grace === false);
ok('a firing ends the day in its own words',
  /That is the day/i.test(seas.fired.text) && /a firing ends the day/i.test(seas.fired.text),
  seas.fired.text.slice(0, 120));
ok('and is offered no boss battle, having no run to play one in', seas.fired.grace === false);
ok('nothing anywhere promises a calendar reset',
  ![seas.capped.text, seas.fired.text, seas.rules].some((s) => /midnight/i.test(s)));
ok('a boss win announces a season, not a run',
  /one more season\./i.test(seas.said) && !/today/i.test(seas.said), seas.said);
ok('the rules sheet states the budget, the clock and the firing',
  /3 seasons, then a wait/i.test(seas.rules) && /The clock is 24 hours/i.test(seas.rules)
    && /Getting fired starts it early/i.test(seas.rules)
    && !/One run a day/i.test(seas.rules), seas.rules.slice(0, 240));
ok('an ended day sends the door to the spent sheet rather than the draft',
  seas.shut === 'daily' && seas.onDraft === false, seas.shut + ' onDraft=' + seas.onDraft);

/*
 * THE CLOCK STARTS WHEN THE DAY ENDS, AND EXACTLY ONCE.
 *
 * A dynasty day ends in two steps: the budget goes, then the page reports it and the server
 * stamps 24 hours from that instant. Between them the door is shut with nothing counting
 * down, and a player left in that state is stuck for good with no clock to wait out. It is
 * only reachable by leaving in the seconds between a season's last snap and the screen that
 * reports it, which is exactly the kind of bug nobody can reproduce.
 *
 * THE OTHER HALF MATTERS MORE. A results screen is reopened from a save every time somebody
 * comes back to a finished run, so a second call that re-stamped the wait would turn looking
 * at your own dynasty into another day's punishment. The page must not ask twice, and the
 * server must not extend it if it does.
 */
const clock = await t.page.evaluate(async () => {
  const T = window.__t;
  T.setPremium([]);
  const n = T.stubDayEnd();
  const out = {};
  /* Shut, with no clock running: the gate has a day to end before it says anything. */
  T.setDaily('dynasty', { used: 3, allowance: 3, unit: 'season', ended: false, resetsAt: null });
  document.getElementById('sheet').classList.remove('on');
  await T.dailyStop('dynasty');
  out.started = n.c;
  out.ticking = !!(T.getDaily('dynasty') || {}).resetsAt;
  out.said = (document.getElementById('sheet-in').innerText || '').replace(/\s+/g, ' ');
  /* Shut with a clock already running: nothing to do but say so. */
  const was = n.c;
  document.getElementById('sheet').classList.remove('on');
  await T.dailyStop('dynasty');
  out.again = n.c - was;
  /* And the firing carries its reason through, because the two endings read differently. */
  await T.dailyDayEnd('dynasty', true);
  out.fired = n.fired;
  return out;
});
ok('a spent day with no clock on it starts one', clock.started === 1, String(clock.started));
ok('and the sheet it opens can name a countdown', clock.ticking === true);
ok('and says how long rather than a time of day',
  /unlocks in/i.test(clock.said) && !/midnight/i.test(clock.said), clock.said.slice(0, 140));
ok('a clock already running is never restarted', clock.again === 0, String(clock.again));
ok('a firing says which ending it was', clock.fired === true, String(clock.fired));
console.log('\nTHE PINNED BUTTON POINTS THE WAY THE RUN GOES');
/*
 * THE CHEVRON IS DRAWN IN CSS AND NUDGED, and the nudge is the part that breaks quietly. It
 * is a square turned 45 degrees, so a transform after that rotation moves along the TURNED
 * axes: translate(a,-a) comes out as straight right, and the obvious-looking translate(a,0)
 * comes out diagonally up. Both animate, both look deliberate in a diff, and only one of them
 * keeps the mark on the line of the text.
 *
 * SO THE ASSERTION IS ON THE MATRIX RATHER THAN ON THE KEYFRAME. What matters is where the
 * thing actually goes, sampled while it is going there.
 */
{
  const arrow = await t.page.evaluate(async () => {
    const dock = document.getElementById('o-dock');
    const btn = document.getElementById('b-next-season');
    dock.hidden = false;
    btn.textContent = 'Offseason 2';
    const at = () => {
      const m = getComputedStyle(btn, ':after').transform.match(/matrix\(([^)]+)\)/);
      if (!m) return null;
      const v = m[1].split(',').map(Number);
      return { x: v[4], y: v[5] };
    };
    const seen = [];
    for (let i = 0; i < 14; i++) {
      seen.push(at());
      await new Promise((r) => setTimeout(r, 100));
    }
    const s = getComputedStyle(btn, ':after');
    return { seen: seen.filter(Boolean), anim: s.animationName,
      w: parseFloat(s.width), borders: s.borderTopWidth + '/' + s.borderLeftWidth };
  });
  const xs = arrow.seen.map((p) => p.x), ys = arrow.seen.map((p) => p.y);
  ok('the dock button carries a mark', arrow.w > 4 && arrow.borders === '2px/0px',
    arrow.w + 'px ' + arrow.borders);
  ok('and it is animated', arrow.anim === 'dockarrow', arrow.anim);
  ok('it travels to the right', Math.max(...xs) > 1.5, String(Math.round(Math.max(...xs) * 100) / 100));
  /* THE ONE THAT CATCHES THE SIMPLIFICATION. A translate written in page axes instead of the
     rotated ones drifts the chevron up and out of line with the text. */
  ok('and never off the line of the text', Math.max(...ys.map(Math.abs)) < 0.01,
    String(Math.max(...ys.map(Math.abs))));
  /* Asked not to be moved, it still says which way the button goes: the direction is
     information and only the nudging is the part somebody opted out of. */
  await t.page.emulateMedia({ reducedMotion: 'reduce' });
  const still = await t.page.evaluate(() => {
    const s = getComputedStyle(document.getElementById('b-next-season'), ':after');
    return { anim: s.animationName, w: parseFloat(s.width) };
  });
  await t.page.emulateMedia({ reducedMotion: null });
  ok('reduced motion stops the nudge and keeps the arrow',
    still.anim === 'none' && still.w > 4, still.anim + ' ' + still.w + 'px');
  await t.page.evaluate(() => { document.getElementById('o-dock').hidden = true; });
}

console.log('\nTHE DYNASTY LEDGER READS ACROSS, NOT DOWN');
/*
 * ONE FIGURE SAT FIVE PIXELS LOW FOR A WHILE AND NOTHING REPORTED IT. The target cell was
 * class "lb", which is also the LEADERBOARD's row container four hundred lines up the same
 * stylesheet: `.lb{display:grid;gap:5px;margin-top:11px}`, unscoped. `.ldg .lb` only ever set
 * a colour, so the board's rule kept the rest and the number the season is judged against
 * hung below the four figures it is read against.
 *
 * MEASURED RATHER THAN NAMED. Asserting the class would only prove the rename happened; what
 * makes this table readable is that a row's cells share a top edge, and that is true or false
 * whatever anybody calls them. The one legitimate exception is the verdict, which is set two
 * points smaller and is centred rather than aligned, so it is allowed its own offset and
 * checked to be within a pixel and a half of the rest.
 *
 * PLANTED, NOT PLAYED, AND THE CLASSES COME OFF THE PAGE. Reaching a real results screen
 * means drafting and simulating two seasons, and what is being tested is the stylesheet. But
 * a planted row written out by hand here would go on passing after somebody renamed a cell
 * back in the page, which is exactly the change that caused this. So the six class names are
 * read out of paintOver's own row template and the row is built from them: rename one there
 * and this plants the new name, collides all over again, and fails.
 */
{
  /* The row template, as paintOver emits it. Refused loudly rather than skipped if the shape
     moves, because a check that quietly finds nothing to look at is worse than no check. */
  const src = fs.readFileSync(path.join(ROOT, 'football/index.html'), 'utf8');
  const tpl = /'<div class="ldg '\+cls\+tap\+'"[\s\S]*?lsc[^\n]*\n/.exec(src);
  /* THE OVERALL CELL IS SPLICED IN FROM A VARIABLE, because it has an empty form for a season
     saved before ratings existed. Put back at its own position so the six come out in the
     order the row draws them, which is the order this then measures. */
  const body = tpl ? tpl[0].replace(/\+\s*ov\s*\+/, '<span class="lo">') : '';
  const CELLS = (body.match(/<span class="([a-z]+)"/g) || [])
    .map((m) => /"([a-z]+)"/.exec(m)[1]);
  ok('the ledger row template is still readable from the page', CELLS.length === 6,
    CELLS.join(' ') || 'not found');
  const led = CELLS.length !== 6 ? null : await t.page.evaluate((cells) => {
    const VAL = { ly: '1', lr: '11-6', lo: '89.8', lv: 'KEPT', lsc: '12,500' };
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:0;top:0;width:358px;padding:8px';
    host.innerHTML = '<div class="ldg-h"><span>Season</span><span>Record</span>'
      + '<span class="lo">Ovr</span><span>Target</span><span></span>'
      + '<span class="lsc">Points</span></div>'
      + '<div class="ldg pass in">'
      + cells.map((c) => '<span class="' + c + '">' + (VAL[c] || '8') + '</span>').join('')
      + '</div>';
    document.body.appendChild(host);
    const row = host.querySelector('.ldg');
    const seen = [...row.children].map((c) => ({
      cls: c.className, top: c.getBoundingClientRect().top,
      size: parseFloat(getComputedStyle(c).fontSize) }));
    /* The header's labels have to start where the row's figures do, or the column is a
       heading over nothing. Read on the two that are not right-aligned against an edge. */
    const hOvr = host.querySelector('.ldg-h .lo').getBoundingClientRect();
    const hTgt = host.querySelectorAll('.ldg-h span')[3].getBoundingClientRect();
    const rOvr = host.querySelector('.ldg .lo').getBoundingClientRect();
    /* The target cell by POSITION rather than by name, because its name is the thing under
       test and hard-coding it here would put the bug back in the check. */
    const rTgt = row.children[3].getBoundingClientRect();
    host.remove();
    return { cells: seen,
      ovr: Math.round(hOvr.right - rOvr.right), tgt: Math.round(hTgt.left - rTgt.left) };
  }, CELLS);
  if (!led) { ok('the ledger could not be measured', false); } else {
  const full = led.cells.filter((c) => c.size > 10.5);
  const spread = Math.max(...full.map((c) => c.top)) - Math.min(...full.map((c) => c.top));
  ok('every figure in a season sits on one line', spread < 0.5,
    led.cells.map((c) => c.cls + '@' + Math.round(c.top * 10) / 10).join(' '));
  const verdict = led.cells.find((c) => c.cls === 'lv');
  const base = full[0].top;
  ok('and the verdict, set smaller, is centred against them',
    Math.abs(verdict.top - base) < 1.5, String(Math.round((verdict.top - base) * 10) / 10));
  ok('the Ovr heading is over the Ovr column', Math.abs(led.ovr) <= 1, String(led.ovr));
  ok('and the Target heading over the Target column', Math.abs(led.tgt) <= 1, String(led.tgt));
  }
}

await t.page.close();

/*
 * THE WALK BACK FROM STRIPE, which is the screen a paying customer sees first and the one
 * with the least margin for being wrong. It shipped wrong: a buyer who bought from
 * www.runthe.gg was returned to the apex by SITE_URL, where their session does not exist,
 * and the page spent ten seconds polling premium_products() as nobody before printing the
 * apology meant for a slow webhook. The server half is fixed in _site.js. This is the page
 * half, and there are three outcomes rather than the two it used to have.
 *
 * THE CONFETTI IS AN ASSERTION HERE, not decoration. Celebrating over a screen that has just
 * told somebody their account is not ready is worse than not celebrating at all, so each
 * case checks whether the canvas appeared as well as what the sheet says.
 */
console.log('\nTHE WALK BACK FROM STRIPE');
const CK_INJECT = 'checkoutReturn,checkoutThanks,unlockedSheet,premiumSheet,profileSheet,'
  + 'premiumRefresh,paintHomeStart,setDaily:(m,v)=>{dailyState[m]=v;},'
  /* The board is never called in this harness, so the two corner numbers are set by hand
     the same way ownership is. dynHiFor is pinned alongside them, or the next repaint
     sees a user it has not asked for and fires a real request that overwrites them. */
  + 'setHi:(t,m)=>{dynHiTop=t;dynHiMine=m;dynHiFor=(authState.userId||null);},'
  + 'dynRead,beginDynastyDraft,DYN_SAVE_VERSION,getRun:()=>run,setRun:(v)=>{run=v;},'
  + 'spendTheDay,dynToWinter,countSpends:()=>{const n={c:0};'
  + 'B.attemptSpend=async(m)=>{n.c++;const s=dailyState[m]||{};'
  + 'return Object.assign({},s,{ok:true,used:(s.used||0)+1});};return n;},'
  + 'reviewDynastyRules,dynIntroOff,dynNewSheet,dailyStop,'
  + 'setPremium:(v)=>{premiumSet=v;},'
  /* The walk back from Stripe runs earlier on this page and leaves justPaid set, which is
     itself a reason premiumPitch() stands down. Cleared rather than worked around, so the
     section below is testing the ownership rule and not that one. */
  + 'setPaid:(v)=>{justPaid=v;},'
  + 'setAuthState:(v)=>{authState=Object.assign({},authState,v);},'
  + "clearAuth:()=>{authState={ready:false,signedIn:false};premiumSet=null;},"
  + 'onSuccessUrl:()=>{history.replaceState(null,"","/football/?checkout=success");}';
const ck = await openPage(browser, 'http://local.test/football/', { tester: true, inject: CK_INJECT });

/* A helper the three cases share: put the success parameter back, answer premiumProducts
   with `answers` (an array of arrays, one per poll, so a webhook that lands late can be
   modelled), and report what the sheet came out as. */
await ck.page.evaluate(() => {
  window.__ck = async (opts) => {
    const T = window.__t;
    document.getElementById('sheet').classList.remove('on');
    document.querySelectorAll('.confetti-cv').forEach((c) => c.remove());
    T.setPremium(null);
    if (opts.signedIn === false) T.clearAuth();
    else T.setAuthState({ ready: true, signedIn: true, userId: 'u1', name: 'tester' });
    let n = 0;
    const answers = opts.answers || [[]];
    window.PS_AUTH = Object.assign({}, window.PS_AUTH, {
      premiumProducts: async () => answers[Math.min(n++, answers.length - 1)],
    });
    /* Auth arriving LATE is the regression: checkoutReturn used to poll before the session
       existed and read its own impatience as a missing purchase. */
    if (opts.authAfter) {
      T.clearAuth();
      setTimeout(() => T.setAuthState({ ready: true, signedIn: true, userId: 'u1', name: 'tester' }),
        opts.authAfter);
    }
    T.onSuccessUrl();
    await T.checkoutReturn();
    const box = document.getElementById('sheet-in');
    return {
      kind: box.dataset.kind,
      text: (box.innerText || '').replace(/\s+/g, ' '),
      confetti: !!document.querySelector('.confetti-cv'),
      buttons: [...box.querySelectorAll('.btn')].map((b) => b.id + ':' + b.textContent).join(' | '),
      polls: n,
    };
  };
});

const cases = [
  ['the row is there', { answers: [['ps_premium', 'cfb_premium']] }, 'owned'],
  ['the webhook lands on the third ask',
    { answers: [[], [], ['ps_premium', 'cfb_premium']] }, 'owned'],
  ['the session came back on the other hostname', { signedIn: false }, 'signedout'],
  ['auth arrives a second late', { authAfter: 1000, answers: [['ps_premium', 'cfb_premium']] }, 'owned'],
];
for (const [label, opts, want] of cases) {
  const r = await ck.page.evaluate((o) => window.__ck(o), opts);
  console.log('  ' + label + ':');
  if (want === 'owned') {
    /* CASE-INSENSITIVE, because .display is uppercased in CSS and innerText reports what
       is rendered. A case-sensitive match here fails on a heading that is perfectly right. */
    ok('    says You are Pro', /You are Pro/i.test(r.text), r.text.slice(0, 90));
    ok('    thanks them in so many words', /Thank you\. Genuinely\./i.test(r.text));
    ok('    fires confetti', r.confetti === true);
    ok('    offers the door list', /ck-see/.test(r.buttons), r.buttons);
  } else {
    ok('    does NOT claim Pro', !/You are Pro/i.test(r.text), r.text.slice(0, 90));
    ok('    does NOT fire confetti', r.confetti === false);
    ok('    still thanks them', /Thank you\. Genuinely\./i.test(r.text));
    ok('    says the purchase is safe', /purchase is safe/i.test(r.text), r.text.slice(0, 140));
    ok('    offers a way back in', /ck-in/.test(r.buttons), r.buttons);
  }
}

/* A signed-in account whose row never appears is the third outcome, and it must read as a
   wait rather than as a failure: this page cannot know a payment failed and must never
   imply it. */
const pend = await ck.page.evaluate(() => window.__ck({ answers: [[]] }));
console.log('  the webhook has not landed at all:');
ok('    does not claim Pro', !/You are Pro/i.test(pend.text));
ok('    does not fire confetti', pend.confetti === false);
ok('    never suggests the payment failed', !/fail|problem|wrong|error/i.test(pend.text), pend.text.slice(0, 140));
ok('    offers to ask again', /ck-again/.test(pend.buttons), pend.buttons);
ok('    it really did keep asking', pend.polls >= 6, String(pend.polls));

/*
 * A GRANT THAT LANDS AFTER THE THANK YOU IS ALREADY ON SCREEN.
 *
 * Thirteen seconds covers a slow webhook and not an outage, and the version that stopped
 * there left a buyer on a free-looking front page with a receipt in their email until they
 * thought to reload. checkoutWatch keeps asking for about two minutes and turns the sheet
 * into the celebration in place. Nobody should have to reload to learn their money arrived.
 */
console.log('\nA WEBHOOK THAT LANDS AFTER THE SHEET IS ALREADY DRAWN');
for (const stillOpen of [true, false]) {
  const late = await ck.page.evaluate(async (stillOpen) => {
    const T = window.__t;
    document.getElementById('sheet').classList.remove('on');
    document.querySelectorAll('.confetti-cv').forEach((c) => c.remove());
    document.getElementById('toast').textContent = '';
    T.setPremium(null);
    T.setAuthState({ ready: true, signedIn: true, userId: 'u1', name: 'tester' });
    window.__ckNow = [];
    window.PS_AUTH = Object.assign({}, window.PS_AUTH, {
      premiumProducts: async () => window.__ckNow,
    });
    T.onSuccessUrl();
    await T.checkoutReturn();               // ends pending, and starts the watch
    const during = document.getElementById('sheet-in').innerText || '';
    if (!stillOpen) document.getElementById('sheet').classList.remove('on');
    /* The webhook arrives while nobody is pressing anything. */
    window.__ckNow = ['ps_premium', 'cfb_premium'];
    await new Promise((r) => setTimeout(r, 6500));   // the watch's first wait is 5s
    return {
      during: during.replace(/\s+/g, ' '),
      after: (document.getElementById('sheet-in').innerText || '').replace(/\s+/g, ' '),
      sheetOpen: document.getElementById('sheet').classList.contains('on'),
      confetti: !!document.querySelector('.confetti-cv'),
      toast: document.getElementById('toast').textContent,
      /* THE HEADER IS THE ONLY THING ON THE FRONT PAGE THAT SAYS PRO. Everything else
         ownership does is a subtraction, and a screen that differs from the free one only
         by what is missing is the screen that makes a buyer think it did not take. */
      proRing: document.getElementById('b-profile').classList.contains('pro'),
    };
  }, stillOpen);
  console.log('  ' + (stillOpen ? 'with the sheet still up:' : 'after they closed it:'));
  ok('    it said it was setting up first', !/You are Pro/i.test(late.during), late.during.slice(0, 70));
  ok('    the header gains the Pro ring', late.proRing === true);
  if (stillOpen) {
    ok('    the sheet becomes the celebration', /You are Pro/i.test(late.after), late.after.slice(0, 70));
    ok('    and the confetti fires then', late.confetti === true);
  } else {
    /* A popup over whatever they went back to is the wrong way to deliver good news. */
    ok('    it does not reopen a sheet over them', late.sheetOpen === false);
    ok('    it says so in a line of toast', /Pro account is ready/i.test(late.toast), late.toast);
  }
}

/* AND THE RING FOLLOWS OWNERSHIP RATHER THAN THE ACCOUNT. The row lands a second or two
   behind the session it belongs to, so paintAvatar has to run when premiumRefresh answers
   and not only on the auth change, or a fresh buyer keeps a free-looking header until their
   next load. */
const ring = await ck.page.evaluate(async () => {
  const T = window.__t;
  const cls = () => document.getElementById('b-profile').classList.contains('pro');
  T.setAuthState({ ready: true, signedIn: true, userId: 'u1', name: 'tester' });
  window.PS_AUTH = Object.assign({}, window.PS_AUTH, { premiumProducts: async () => [] });
  await T.premiumRefresh(true);
  const free = cls();
  window.PS_AUTH = Object.assign({}, window.PS_AUTH,
    { premiumProducts: async () => ['ps_premium', 'cfb_premium'] });
  await T.premiumRefresh(true);
  return { free, pro: cls() };
});
ok('a free account has no Pro ring', ring.free === false);
ok('and premiumRefresh alone puts it there', ring.pro === true);

/*
 * THE DYNASTY DOOR IS GOLD, AND THE SPENT ONE IS NOT.
 *
 * Gold is this mode's colour everywhere else on that card (the pool of light behind the
 * ball, the NEW badge, the Pro tag) and the border was the last part still reading as the
 * generic white hairline every other button has. Asserted because a glow is exactly the kind
 * of thing a later patch replaces without noticing, and because the other half matters more:
 * a glowing, breathing border on a door that will not open until midnight is the page being
 * loud about a disappointment.
 */
console.log('\nTHE DYNASTY DOOR CARRIES THE GOLD, EXCEPT WHEN THE DAY IS SPENT');
const gold = await ck.page.evaluate(async () => {
  const T = window.__t;
  const read = () => {
    const el = document.getElementById('b-start-dyn');
    if (!el) return null;
    const s = getComputedStyle(el);
    return { border: s.borderTopColor, shadow: s.boxShadow, anim: s.animationName };
  };
  const at = new Date(Date.now() + 3600e3).toISOString();
  T.setAuthState({ ready: true, signedIn: true, userId: 'u1', name: 'tester' });
  T.setPremium([]);
  try { localStorage.removeItem('ps_dynasty_save'); } catch (e) {}
  T.setDaily('dynasty', { used: 0, allowance: 1, resetsAt: at });
  T.paintHomeStart();
  const open = read();
  T.setDaily('dynasty', { used: 1, allowance: 1, resetsAt: at });
  T.paintHomeStart();
  return { open, spent: read() };
});
/* Gold is any colour whose red clearly leads its blue. Read off the computed value rather
   than compared to a literal, so a designer nudging the exact hex does not fail this. */
const isGold = (c) => {
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(c || '');
  return !!m && +m[1] > 180 && +m[1] - +m[3] > 60;
};
ok('a playable door has a gold border', gold.open && isGold(gold.open.border), gold.open && gold.open.border);
ok('and a gold glow around it', gold.open && /rgba?\(2\d\d,\s*1\d\d/.test(gold.open.shadow || ''),
  gold.open && String(gold.open.shadow).slice(0, 80));
ok('a spent door drops the gold', gold.spent && !isGold(gold.spent.border), gold.spent && gold.spent.border);
ok('and stops breathing', gold.spent && gold.spent.anim === 'none', gold.spent && gold.spent.anim);

/*
 * THE TWO NUMBERS IN THE CORNER, AND THE FOUR STATES THEY HAVE.
 *
 * The board answers or it does not, and the player has a run on it or does not, so this
 * corner has to be right with either half missing. The failure that matters is the quiet
 * one: a dash, a zero, or a stale number from the previous account sitting on the door as
 * though it were a result.
 *
 * AND IT MUST NOT GROW INTO THE FOOTBALL. A score has no ceiling and this slot does. The
 * abbreviation exists because an eight figure record printed in full runs 2px into the ball
 * at 320px and twelve past it at 300, which was measured rather than guessed, so the widths
 * below are the check on that arithmetic rather than a formatting preference.
 */
/*
 * AN ABANDONED DRAFT IS NOT A RUN TO RESUME.
 *
 * Reported by an owner who had just bought the bundle: the front page offered to RESUME a
 * dynasty they had never played, captioned "0 signed, still drafting". Opening the draft
 * screen is enough to write a save, because every exported mutation in run.js is wrapped to
 * call dynSave and dynAtRest counted the DRAFT phase as a resting place. Older than the
 * What you unlocked sheet, and first hit the moment that sheet put a Dynasty door one tap
 * from a receipt.
 *
 * BOTH SIDES ARE CHECKED, and the read side matters more: the write side only stops NEW
 * junk, and the browsers holding one today are fixed by the reader refusing it.
 *
 * AND THE OTHER HALF, which is the one that would be a disaster to get wrong: a run with a
 * man in it must still come back. A fix for a phantom resume that eats real runs is worse
 * than the phantom.
 */
/*
 * THE RULES SHEET STANDS IN FRONT OF EVERY RUN, AND THE READER TURNS IT OFF.
 *
 * It used to be once per browser. A dynasty is a calendar, a moving win bar, a frozen cap
 * and an ageing rule, and somebody coming back a fortnight later starts a run against rules
 * they half remember. So it shows every time and carries its own off switch.
 *
 * THE TWO KEYS ARE THE POINT. ps_dynintro still means "has read them once" and is what
 * retires the NEW badge; ps_dynintro_off is the only thing that skips the sheet. Folding
 * them together is the obvious move and breaks both: a reader who never ticks the box keeps
 * a NEW badge forever, and ticking the box silently also claims the mode is no longer new to
 * them. Asserted because nothing on screen would look wrong either way.
 */
console.log('\nTHE RULES SHEET, BEFORE EVERY RUN, UNTIL THEY SAY OTHERWISE');
{
  const open = () => ck.page.evaluate(() => {
    const T = window.__t;
    T.setPremium(['ps_premium', 'cfb_premium']);
    T.setDaily('dynasty', { used: 0, allowance: 1, resetsAt: new Date(Date.now() + 3600e3).toISOString() });
    document.getElementById('sheet').classList.remove('on');
    document.getElementById('sheet-in').dataset.kind = '';
    document.querySelectorAll('.screen.on').forEach((s) => s.classList.remove('on'));
    document.getElementById('s-intro').classList.add('on');
    try { localStorage.removeItem('ps_dynasty_save'); } catch (e) {}
    T.beginDynastyDraft();
    return { up: document.getElementById('sheet').classList.contains('on'),
      kind: document.getElementById('sheet-in').dataset.kind,
      box: !!document.getElementById('b-dyni-off') };
  });
  await ck.page.evaluate(() => {
    try { localStorage.removeItem('ps_dynintro'); localStorage.removeItem('ps_dynintro_off'); } catch (e) {}
    window.__dynIntro = undefined; window.__dynIntroOff = undefined;
  });
  /* Three in a row, because "once per browser" passes a check that only opens it twice. */
  for (const n of [1, 2, 3]) {
    const r = await open();
    ok('run ' + n + ' gets the sheet', r.up && r.kind === 'dynintro', JSON.stringify(r));
    ok('  carrying its own off switch', r.box === true);
  }
  const ticked = await ck.page.evaluate(() => {
    const c = document.getElementById('b-dyni-off');
    c.checked = true; c.onchange();
    return { off: window.__t.dynIntroOff(), read: localStorage.getItem('ps_dynintro') };
  });
  ok('ticking it is remembered', ticked.off === true);
  const after = await open();
  ok('and the next run goes straight to the draft', after.up === false, JSON.stringify(after));
  /* THE OTHER KEY SURVIVED IT. They have read the rules, so the badge is retired, and that
     has to be true whether or not they ticked the box. */
  ok('while the mode still counts as read', ticked.read === '1', String(ticked.read));
  /* AND THE ON-DEMAND SHEET NEVER OFFERS IT. Hiding a thing somebody just asked to see. */
  const demand = await ck.page.evaluate(() => {
    window.__t.reviewDynastyRules();
    return !!document.getElementById('b-dyni-off');
  });
  ok('the How to play sheet has no off switch', demand === false);
  await ck.page.evaluate(() => {
    document.getElementById('sheet').classList.remove('on');
    document.querySelectorAll('.screen.on').forEach((s) => s.classList.remove('on'));
    document.getElementById('s-intro').classList.add('on');
    try { localStorage.removeItem('ps_dynasty_save'); } catch (e) {}
  });
}

console.log('\nAN ABANDONED DRAFT IS NOT A RUN TO RESUME');
{
  /* Planted rather than played, so the reader is tested on exactly the two shapes that
     matter without depending on a wheel landing. The version is read off the page, or this
     check quietly passes forever the next time DYN_SAVE_VERSION is bumped. */
  const planted = await ck.page.evaluate(() => {
    const T = window.__t;
    T.setAuthState({ ready: true, signedIn: true, userId: 'u1', name: 'tester' });
    const save = (roster) => JSON.stringify({
      v: T.DYN_SAVE_VERSION, user: 'u1', at: Date.now(), submitted: null,
      run: { dynasty: true, phase: 'draft', roster: roster, seasonNo: 1, score: 0 },
    });
    const read = (roster) => {
      localStorage.setItem('ps_dynasty_save', save(roster));
      return !!T.dynRead('open');
    };
    const empty = read([]);
    const one = read(['x|2019']);
    try { localStorage.removeItem('ps_dynasty_save'); } catch (e) {}
    return { empty, one };
  });
  ok('a saved draft with nobody signed is refused', planted.empty === false);
  ok('and one with a man in it is not', planted.one === true);

  /* THE REPORTED PATH, PLAYED. Open the door, go no further, come back. */
  await ck.page.evaluate(() => {
    const T = window.__t;
    T.setPremium(['ps_premium', 'cfb_premium']);
    T.setDaily('dynasty', { used: 0, allowance: 1, resetsAt: new Date(Date.now() + 3600e3).toISOString() });
    /* Opted out of the rules sheet, so beginDynastyDraft goes straight to the draft and
       this section is testing the save rather than the sheet in front of it. */
    try { localStorage.removeItem('ps_dynasty_save'); localStorage.setItem('ps_dynintro_off', '1'); } catch (e) {}
    T.beginDynastyDraft();
  });
  await ck.page.waitForTimeout(1500);
  const walked = await ck.page.evaluate(() => {
    const T = window.__t;
    const r = T.getRun();
    T.paintHomeStart();
    const el = document.getElementById('b-start-dyn');
    return { onDraft: !!(r && r.dynasty), signed: (r && r.roster || []).length,
      door: el ? (el.innerText || '').replace(/\s+/g, ' ').trim() : '' };
  });
  ok('  opening the draft really does reach it', walked.onDraft && walked.signed === 0,
    'signed=' + walked.signed);
  ok('  and walking away leaves Start, not Resume', /Start a Dynasty/i.test(walked.door)
    && !/Resume/i.test(walked.door), walked.door.slice(0, 60));
  /* PUT THE PAGE BACK ON THE FRONT SCREEN, which is not tidiness. This section is the only
     one that leaves the game inside a draft, and the next one reads the door with innerText:
     on a hidden screen innerText degrades to textContent, so every corner assertion came
     back unspaced and un-uppercased and failed for a reason that had nothing to do with the
     corner. The suite caught it, which is the point of asserting rendered text. */
  await ck.page.evaluate(() => {
    document.getElementById('sheet').classList.remove('on');
    document.querySelectorAll('.screen.on').forEach((s) => s.classList.remove('on'));
    document.getElementById('s-intro').classList.add('on');
    try { localStorage.removeItem('ps_dynasty_save'); } catch (e) {}
  });
}

console.log('\nTHE OFFER COMES OFF THE SCREEN WHEN THE ACCOUNT OWNS IT');
/*
 * THE FRONT PAGE'S CARD ALREADY WENT: ensurePremiumCard removes the node when premiumPitch()
 * turns false, and paintHomeStart runs it when the products answer lands. The PROFILE's card
 * had nothing doing that. It is written in when the sheet is drawn and the sheet is not
 * redrawn on ownership, so a buyer whose purchase confirmed while their profile was open sat
 * looking at Go Pro, on a Pro account, under a gold pill saying so.
 *
 * NARROW BUT REAL. An owner never sees the card on an ordinary load, because premiumPitch()
 * answers false for the whole round trip as well as after it. What reaches this is the walk
 * back from Stripe, which polls premiumRefresh(true) for ten seconds: open the profile during
 * that and ownership lands underneath it.
 *
 * AND THE SHEET IS NOT REDRAWN, which is the other half of the assertion. Rebuilding it would
 * throw somebody back to the top of their profile, or off the page they were reading, to fix
 * something they were not looking at.
 */
{
  const gone = await ck.page.evaluate(async () => {
    const T = window.__t;
    T.setAuthState({ ready: true, signedIn: true, userId: 'u1', name: 'tester' });
    T.setPremium([]);
    T.setPaid(false);
    document.getElementById('sheet').classList.remove('on');
    T.profileSheet();
    const before = !!document.getElementById('pf-prem');
    /* Mark the sheet, so a redraw can be told from a removal. */
    const box = document.getElementById('sheet-in');
    box.dataset.witness = 'here';
    /* Ownership lands the way it really does: the products call answers, and premiumRefresh
       is what the walk back from Stripe is already calling on a timer. */
    window.PS_AUTH = Object.assign({}, window.PS_AUTH,
      { premiumProducts: async () => ['ps_premium', 'cfb_premium'] });
    await T.premiumRefresh(true);
    return { before: before, after: !!document.getElementById('pf-prem'),
      kind: box.dataset.kind, kept: box.dataset.witness === 'here',
      tier: T.acctTier ? T.acctTier() : null };
  });
  ok('a free account is shown the offer', gone.before === true);
  ok('and it is taken away the moment the account turns Pro', gone.after === false);
  ok('without redrawing the sheet underneath them', gone.kept === true && gone.kind === 'profile',
    gone.kind + ' witness=' + gone.kept);
}

console.log('\nA SEASON IS WHAT COSTS, AND IT COSTS ONCE');
/*
 * THE ONE RULE EVERYTHING ELSE HANGS OFF. Under the old unit a kickoff charged only on season
 * one, so the entire mode past its first winter was free for ever; under the new one every
 * kickoff charges, and charging twice for the same season is the way that breaks. Driven
 * against a bare run object rather than a played one, because what is being tested is
 * spendTheDay's arithmetic and nothing downstream of it.
 */
{
  const spent = await ck.page.evaluate(async () => {
    const T = window.__t;
    T.setAuthState({ ready: true, signedIn: true, userId: 'u1', name: 'tester' });
    T.setPremium([]);
    const at = new Date(Date.now() + 3600e3).toISOString();
    const n = T.countSpends();
    const drive = (unit) => {
      T.setDaily('dynasty', { used: 0, allowance: 3, resetsAt: at, unit: unit, ended: false });
      T.setRun({ dynasty: true, seasonNo: 1, roster: [], phase: 'season' });
      const before = n.c;
      const r = T.getRun();
      /* Season one, twice: the second is the reload in the middle of it. */
      T.spendTheDay(); T.spendTheDay();
      r.seasonNo = 2; T.spendTheDay();
      r.seasonNo = 3; T.spendTheDay(); T.spendTheDay();
      return n.c - before;
    };
    const out = { season: drive('season'), run: drive('run') };
    /* AND THE DOOR OUT OF THE RESULTS SCREEN, which is where a spent day stops a dynasty. */
    T.setDaily('dynasty', { used: 3, allowance: 3, resetsAt: at, unit: 'season', ended: false });
    T.setRun({ dynasty: true, seasonNo: 3, roster: [], phase: 'over' });
    document.getElementById('sheet').classList.remove('on');
    document.getElementById('sheet-in').dataset.kind = '';
    T.dynToWinter();
    out.shut = document.getElementById('sheet-in').dataset.kind;
    T.setDaily('dynasty', { used: 2, allowance: 3, resetsAt: at, unit: 'season', ended: false });
    document.getElementById('sheet').classList.remove('on');
    document.getElementById('sheet-in').dataset.kind = '';
    /* With a season left it must go THROUGH, and this run has no engine state behind it, so
       beginOffseason throwing is the proof it got past the gate. Anything else means the gate
       swallowed it. */
    let threw = false;
    try { T.dynToWinter(); } catch (e) { threw = true; }
    out.through = threw || document.getElementById('sheet-in').dataset.kind !== 'daily';
    T.setRun(null);
    document.getElementById('sheet').classList.remove('on');
    return out;
  });
  ok('three seasons charge three times, however often the page reloads',
    spent.season === 3, String(spent.season));
  ok('and the old unit still charges once for the whole run', spent.run === 1, String(spent.run));
  ok('a spent day stops the run at its results screen', spent.shut === 'daily', spent.shut);
  ok('and a day with a season left in it does not', spent.through === true);
}

console.log('\nA SPENT DAY NEVER COSTS SOMEBODY THEIR RUN');
/*
 * A free player loses a dynasty on exactly two things: ending it themselves, and being
 * fired. A clock is not one of them, and every way the clock could take one is checked here
 * because each of them is silent. Nothing throws when a save is removed.
 *
 * THE ONE THAT SHIPPED was the trade this game offers and could not honour. "Start a new
 * run" cleared the save first and asked the allowance second, so a player out of seasons
 * pressed it, watched their dynasty go, and got the spent sheet instead of a draft. Both
 * halves of the trade gone in one tap.
 *
 * AND THE DOOR ITSELF. For one release it refused to open a saved run on a spent day, which
 * protects nothing: the wall that matters is inside the run, at the winter. A dynasty the
 * game will not let you look at reads as a dynasty the game has taken.
 */
{
  const kept = await ck.page.evaluate(async () => {
    const T = window.__t;
    T.setAuthState({ ready: true, signedIn: true, userId: 'u1', name: 'tester' });
    T.setPremium([]);
    T.setHi(null, null);
    const at = new Date(Date.now() + 8 * 3600e3).toISOString();
    const plant = () => localStorage.setItem('ps_dynasty_save', JSON.stringify({
      v: T.DYN_SAVE_VERSION, user: 'u1', at: Date.now(), submitted: null,
      run: { dynasty: true, phase: 'over', roster: ['x|2019'], seasonNo: 3, score: 402500 },
    }));
    const shut = () => T.setDaily('dynasty',
      { used: 3, allowance: 3, unit: 'season', ended: false, resetsAt: at });
    const out = {};

    /* The door, with the day gone and a run sitting at its results screen. */
    plant(); shut();
    T.paintHomeStart();
    const el = document.getElementById('b-start-dyn');
    out.door = ((el && el.innerText) || '').replace(/\s+/g, ' ').trim();

    /* Start a new run, on a day that cannot start one. */
    document.getElementById('sheet').classList.remove('on');
    document.getElementById('sheet-in').dataset.kind = '';
    await T.dynNewSheet();
    out.asked = document.getElementById('sheet-in').dataset.kind;
    out.survived = !!T.dynRead('open');

    /* And with a season left, the same press has to still offer the trade. */
    T.setDaily('dynasty', { used: 1, allowance: 3, unit: 'season', ended: false, resetsAt: null });
    document.getElementById('sheet').classList.remove('on');
    document.getElementById('sheet-in').dataset.kind = '';
    await T.dynNewSheet();
    out.open = document.getElementById('sheet-in').dataset.kind;

    document.getElementById('sheet').classList.remove('on');
    try { localStorage.removeItem('ps_dynasty_save'); } catch (e) {}
    return out;
  });
  ok('the door still offers the run back', /Resume Dynasty/i.test(kept.door), kept.door);
  ok('and says when the next season lands instead of where they left off',
    /season 4 in /i.test(kept.door) && !/season played/i.test(kept.door), kept.door);
  ok('Start a new run is refused rather than honoured halfway', kept.asked === 'daily', kept.asked);
  ok('and the run is still there afterwards', kept.survived === true);
  ok('with a season left it asks the question as it always did',
    kept.open === 'dynnew', kept.open);
}

console.log('\nTHE RECORD AND YOUR BEST, IN THE CORNER OF THE DOOR');
for (const [label, top, mine, want] of [
  ['the board answered and they have a run', { dynasty_id: 'a', score: 402500 }, { dynasty_id: 'b', score: 198000 },
    'RECORD 402,500 YOUR BEST 198,000'],
  ['they hold the record themselves', { dynasty_id: 'a', score: 402500 }, { dynasty_id: 'a', score: 402500 },
    'YOUR RECORD 402,500'],
  ['signed out, or never played one', { dynasty_id: 'a', score: 402500 }, null, 'RECORD 402,500'],
  /* THE BOARD IS UNREACHABLE MORE OFTEN THAN ANYBODY WOULD LIKE. Nothing at all is the
     right answer; a dash would be the door reporting a result it does not have. */
  ['the board said nothing', null, null, ''],
  ['a run worth nothing yet', { dynasty_id: 'a', score: 0 }, { dynasty_id: 'b', score: 0 }, ''],
  ['a record past a million', { dynasty_id: 'a', score: 12845000 }, { dynasty_id: 'b', score: 1200000 },
    'RECORD 12.8M YOUR BEST 1.2M'],
]) {
  const r = await ck.page.evaluate(([top, mine]) => {
    const T = window.__t;
    const at = new Date(Date.now() + 3600e3).toISOString();
    T.setAuthState({ ready: true, signedIn: true, userId: 'u1', name: 'tester' });
    T.setPremium([]);
    try { localStorage.removeItem('ps_dynasty_save'); } catch (e) {}
    T.setDaily('dynasty', { used: 0, allowance: 1, resetsAt: at });
    T.setHi(top, mine);
    T.paintHomeStart();
    const el = document.getElementById('b-start-dyn');
    const hi = el && el.querySelector('.hp-hi');
    const ball = el && el.querySelector('.hp-mark');
    const h = hi && hi.getBoundingClientRect(), bb = ball && ball.getBoundingClientRect();
    return {
      text: hi ? (hi.innerText || '').replace(/\s+/g, ' ').trim() : '',
      /* The ball sits centred above the headline and the block starts at the left edge, so
         the only way they meet is the block getting wider than the space beside it. */
      hitsBall: !!(h && bb && h.right > bb.left),
      sub: el ? (el.querySelector('.hp-full-sub').innerText || '').trim() : '',
    };
  }, [top, mine]);
  ok(label, r.text === want, '"' + r.text + '"' + (r.text === want ? '' : ' wanted "' + want + '"'));
  ok('  clear of the football', !r.hitsBall);
}
/* THE CAPTION. "One team, one life" described how the mode was configured and named nothing
   anybody wants. Asserted as the stake rather than as an exact string, so it can be reworded
   without failing, but not quietly reverted to a spec line. */
const cap = await ck.page.evaluate(() =>
  (document.getElementById('b-start-dyn').querySelector('.hp-full-sub').innerText || '').trim());
ok('the caption names the stake', /fire/i.test(cap), cap);
ok('and it is one line', await ck.page.evaluate(() => {
  const s = document.getElementById('b-start-dyn').querySelector('.hp-full-sub');
  return s.getBoundingClientRect().height < parseFloat(getComputedStyle(s).lineHeight) * 1.6;
}));

console.log('\nWHAT YOU UNLOCKED, AND EVERY ROW IS A DOOR');
/*
 * The catalog sells two bundles and this sheet is drawn from the ROW rather than the bundle
 * key, so the cheaper one has to come out four doors and Run The Bundle six. A door that
 * lists something the account does not own is the same lie as a tile promising a mode the
 * purchase does not open, which this file already exists because of.
 */
for (const [label, owns, want] of [
  ['perfect-season', ['ps_premium', 'cfb_premium'], 4],
  ['run-the-bundle', ['ps_premium', 'cfb_premium', 'arcade_card_year', 'runtour_pack'], 6],
  ['nothing readable', [], 0],
]) {
  const r = await ck.page.evaluate((owns) => {
    const T = window.__t;
    T.setPremium(owns);
    document.getElementById('sheet').classList.remove('on');
    T.unlockedSheet();
    const box = document.getElementById('sheet-in');
    const rows = [...box.querySelectorAll('.ulk-row')];
    return {
      n: rows.length,
      names: rows.map((x) => x.querySelector('b').textContent).join(' | '),
      games: rows.map((x) => x.querySelector('u').textContent).join(' | '),
      /* EVERY ROW REALLY GOES SOMEWHERE. A link carries an href, a mode row carries a
         click handler. A row with neither is a button that does nothing, which is the
         exact fault this suite was strengthened for twice already. */
      dead: rows.filter((x) => !(x.tagName === 'A' ? x.getAttribute('href') : x.onclick)).length,
      /* Root-relative, never absolute: an absolute link would move a www buyer to the
         apex and sign them out on the way to a game they just paid for. */
      abs: rows.filter((x) => /^https?:/.test(x.getAttribute('href') || '')).length,
      text: (box.innerText || '').replace(/\s+/g, ' '),
    };
  }, owns);
  console.log('  ' + label + ':');
  ok('    ' + want + ' doors', r.n === want, r.n + ': ' + r.names);
  ok('    none of them is dead', r.dead === 0, String(r.dead));
  ok('    no absolute links', r.abs === 0, String(r.abs));
  if (want) {
    ok('    each says which game it is in', !/\|\s*\|/.test(' ' + r.games + ' ') && r.games.length > 0, r.games);
    ok('    and it says nothing renews', /Nothing here renews/i.test(r.text));
  } else {
    ok('    never says the bundle is gone', !/gone|expired|no longer/i.test(r.text), r.text.slice(0, 120));
  }
}

/* AND ONE OF THEM PRESSED FOR REAL. The Trade Machine is the one door an owner can walk
   through with nothing else set up: no saved run to replace, no rules sheet in front of it,
   and dailyOn() is off for somebody holding the row. */
const walked = await ck.page.evaluate(async () => {
  const T = window.__t;
  T.setPremium(['ps_premium', 'cfb_premium']);
  T.setAuthState({ ready: true, signedIn: true, userId: 'u1', name: 'tester' });
  document.getElementById('sheet').classList.remove('on');
  T.unlockedSheet();
  const row = [...document.querySelectorAll('.ulk-row')]
    .find((x) => /Trade Machine/.test(x.textContent));
  if (!row) return { got: 'no Trade Machine row' };
  row.click();
  await new Promise((r) => setTimeout(r, 600));
  /* THE ONE-TIME RULES SHEET STANDS IN THE WAY, the same way the dynasty one does above, and
     for the same reason the dynasty case learned the hard way: stopping at the first sheet
     counts a popup as the mode, and that is how a dead button passed this suite once. Press
     through it and insist on the game itself. Note tradeIntro adds .on to #sheet WITHOUT
     setting dataset.kind, so a check reading the kind would call this door dead. */
  const go = document.getElementById('b-tmi-go');
  if (go) go.click();
  await new Promise((r) => setTimeout(r, 700));
  return { got: [...document.querySelectorAll('.screen.on')].map((s) => s.id).join(','),
    viaRules: !!go };
});
ok('pressing Trade Machine reaches the game', /s-(draft|game|reveal)/.test(walked.got),
  walked.got + (walked.viaRules ? ' (through the rules sheet)' : ''));
await ck.page.close();

console.log('\nAN ACCOUNT OFF THE TESTER LISTS SEES NONE OF IT');
const plain = await openPage(browser, 'http://local.test/football/', { tester: false,
  inject: 'acctTier,premiumPitch,dailyOn,'
    + "signIn:()=>{authState.signedIn=true;authState.ready=true;authState.name='someone';}"
    + ',setPremium:(v)=>{premiumSet=v;}' });
const off = await plain.page.evaluate(() => {
  const T = window.__t;
  T.signIn(); T.setPremium([]);
  return { pitch: T.premiumPitch(), metered: T.dailyOn(),
    dynastyDoor: !!document.getElementById('b-start-dyn'),
    fullDoor: !!document.getElementById('b-start-full'),
    pitchCard: !!document.getElementById('b-premium') };
});
ok('no dynasty door', !off.dynastyDoor);
ok('no full team door', !off.fullDoor);
ok('no pitch card on the front page', !off.pitchCard);
ok('premiumPitch() stays quiet', off.pitch === false);
ok('nothing is metered', off.metered === false);
await plain.page.close();

await browser.close();
console.log('');
console.log(fails ? fails + ' FAILED' : 'all premium checks passed');
process.exit(fails ? 1 : 0);
