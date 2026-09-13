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
  + 'dailyGrace,dailySpentSheet,dynastyRulesHTML,'
  /* A grace server that grants each reason once, standing in for ps_attempt_grace. */
  + 'stubGrace:()=>{const got={};B.attemptGrace=async(m,reason)=>{got[reason]=true;'
  + 'return {ok:true,used:dailyState[m].used,allowance:1+Object.keys(got).length,'
  + 'resetsAt:dailyState[m].resetsAt};};},'
  + 'setPremium:(v)=>{premiumSet=v;},setDaily:(m,v)=>{dailyState[m]=v;},'
  + "signIn:()=>{authState.signedIn=true;authState.ready=true;authState.name='tester';}";
const t = await openPage(browser, 'http://local.test/football/', { tester: true, inject: INJECT });
await t.page.evaluate(() => window.__t.signIn());

/* THE RULES SHEET IS SHOWN ONCE PER BROWSER, so the first dynasty and every later one take
   different paths through dynastyIntro. The dead button only appeared on the second, which
   is the path almost every real press is. Both are driven. */
for (const seenIntro of [false, true]) {
console.log('  ' + (seenIntro ? 'having already seen the rules sheet:' : 'first dynasty in this browser:'));
await t.page.evaluate((seen) => {
  try { if (seen) localStorage.setItem('ps_dynintro', '1');
    else localStorage.removeItem('ps_dynintro'); } catch (e) {}
  window.__dynIntro = seen || undefined;
}, seenIntro);
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

console.log('\nTHE TWO WAYS TO EARN ANOTHER RUN ARE SAID OUT LOUD');
/*
 * The game grants a second run for being fired in season one and a third for winning a boss
 * game, and for a long time it granted them SILENTLY: the allowance moved on the server, the
 * door quietly went back to playable, and nobody was told either thing had happened. A rule
 * nobody knows about is not a reward.
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
  && /Fired in season one/i.test(grace.rules) && /Win a boss game/i.test(grace.rules));
ok('an owner is told about no limit at all', !/One run a day/i.test(grace.ownerRules));
await t.page.close();

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
