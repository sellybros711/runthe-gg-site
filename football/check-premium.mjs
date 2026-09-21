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

/* One page, serving the repo off disk.
   `tester` USED TO FLIP THE TWO ACCESS FILES from LIVE = false to true, which is the view
   the boot crash lived in. Both modes are launched and both files ship true, so there is
   one view now and the rewrite below matches nothing. It is kept, doing nothing, for one
   reason: every call site still passes the flag, and a file that says `tester: true` while
   silently serving the same bytes as `tester: false` is less confusing with the mechanism
   visible than with it deleted. When the next unannounced mode wants a preview view, this
   is the hook it goes back on. */
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
  + 'getDaily:(m)=>dailyState[m],markAsked:()=>{dailyAsked={dynasty:true,trade:true,full:true};},'
  + "signIn:()=>{authState.signedIn=true;authState.ready=true;authState.name='tester';}";
const t = await openPage(browser, 'http://local.test/football/', { tester: true, inject: INJECT });
/*
 * EVERY METER IS HAND-SET FROM HERE ON, SO NOTHING MAY GO AND ASK THE REAL ONE.
 *
 * dailyEnsure fires on the first paint after sign-in, and what comes back here is null,
 * because this harness routes every request that is not local.test to abort. That answer
 * lands whenever the aborted fetch resolves, which is somewhere in the middle of the
 * sections below.
 *
 * THIS IS NOT WHAT FIXES THAT, and reading it as the fix is the trap. The page used to store
 * the null over whatever state a section had just set, and the symptom was a boss toast that
 * never appeared on the middle of three grace claims. The PAGE was wrong: a null is no
 * opinion and dailyEnsure was the one writer of four that did not say so. It is fixed there,
 * and A LATE METER ANSWER NEVER MOVES THE COUNT BACKWARDS below is the guard that holds it,
 * driven by hand rather than raced.
 *
 * What this line buys is determinism. No section here wants the real meter, every one of
 * them sets dailyState itself, and a suite whose outcome depends on when an aborted fetch
 * resolves gives false confidence on the runs it happens to pass. Ahead of signIn, so there
 * is no paint in between.
 */
await t.page.evaluate(() => { window.__t.markAsked(); window.__t.signIn(); });

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
      /* THE SENTENCE, WHICH NOTHING HERE READ, AND THAT IS HOW IT DRIFTED. Everything above
         is the VALUE and the MARK COUNT, and those two agreed across all three cards the
         whole time the words did not: the front page said "Unlock every mode" while both
         profiles said "Unlock everything". The markup had been moved into the store to stop
         exactly this, and the two strings stayed behind as arguments each caller passed, so
         a check on the parts the store owned could not see the parts it did not. */
      goProTitle: ((document.querySelector('#pf-prem .pwc-t b') || {}).textContent) || '',
      goProSub: ((document.querySelector('#pf-prem .pwc-t span') || {}).textContent) || '',
      homeTitle: ((document.querySelector('#b-premium .pwc-t b') || {}).textContent) || '',
      homeSub: ((document.querySelector('#b-premium .pwc-t span') || {}).textContent) || '',
      /* AND THE SHEET'S OWN HEADING, because the card is a door and the heading is the room.
         A reader who presses "Unlock every mode" and lands on "Unlock everything" has to
         stop and work out whether they got the screen they asked for. */
      sheetH2: (() => {
        const d = document.createElement('div');
        d.innerHTML = window.RTG_STORE.html({ signedOut: false });
        const h = d.querySelector('h2');
        return h ? h.textContent.trim() : '';
      })(),
      /* The front page's own card, built as a node rather than written into markup, which is
         the whole reason the two could say different things. */
      homeValue: ((document.querySelector('#b-premium .pwc-go b') || {}).textContent) || '',
      homeMarks: document.querySelectorAll('#b-premium .pwc-marks svg').length,
      homeCounts: /\d+\s*modes/i.test(
        (document.getElementById('b-premium') || {}).innerText || ''),
      proAccess: !!document.getElementById('pf-go-pro'),
      /* WHETHER THIS READER IS BEING SOLD FULL TEAM, asked of the page rather than assumed
         from the view. The store names it, gives it a hero tile and gives the card a fourth
         mark for anybody who can open the mode, so every count below is a question about
         this reader and not a constant. */
      fullOn: !!window.RTG_FULLTEAM && !!window.RTG_FULLTEAM() };
  }, [owns, day]);
  console.log('  ' + who + ':');
  const owner = owns.length > 0;
  ok('    pressing the door reaches ' + want, r.door === want, r.door);
  ok('    dailyOn() is ' + (owner ? 'off' : 'on'), r.metered === !owner, String(r.metered));
  ok('    acctTier() is ' + (owner ? 'pro' : 'free'), r.tier === (owner ? 'pro' : 'free'), r.tier);
  ok('    premiumPitch() ' + (owner ? 'stands down' : 'offers'), r.pitch === !owner);
  ok('    the profile shows ' + (owner ? 'Your Pro access' : 'the upgrade card'),
    owner ? (r.proAccess && !r.goPro) : (r.goPro && !r.proAccess),
    'goPro=' + r.goPro + ' proAccess=' + r.proAccess);
  if (!owner) {
    /* THE COUNT IS DERIVED NOW, because it depends on the reader. Full Team joins the hero
       row and the card's marks for anybody who can open the mode, so this view (a tester,
       with the flag flipped) sees four and a stranger sees three. Written as a number it
       would be right for one of them and a lie about the other, and whichever it was would
       be the one nobody ran. What has to hold either way is that the CARD and the SHEET
       claim the same number of things, which is the assertion below it. */
    const wantMarks = r.fullOn ? 4 : 3;
    ok('    and the upgrade card carries the ' + wantMarks + ' modes it sells',
      r.goProMarks === wantMarks, String(r.goProMarks));
    ok('    in a row rather than a stack', r.goProRow === 'flex', r.goProRow);
    /* AND NEITHER CARD COUNTS ANY MORE. The front page said "4 modes", this one said
       "3 modes" and the college profile said "3 modes", about one purchase, on one day.
       All three are drawn by /assets/store.js now and a digit reappearing in any of them
       means one of them has been written out by hand again. */
    ok('    and says Unlimited rather than a number',
      r.goProValue === 'Unlimited' && !r.goProCounts, r.goProValue);
    ok('    the front page card says exactly the same',
      r.homeValue === 'Unlimited' && r.homeMarks === wantMarks && !r.homeCounts,
      r.homeValue + ' / ' + r.homeMarks + ' marks');
    /* AND "EXACTLY THE SAME" NOW INCLUDES THE WORDS. See the note in the evaluate above:
       the line before this one passed for weeks while the two cards read differently,
       because the value and the marks were the store's and the sentence was not. */
    ok('    including the sentence, not just the value',
      r.homeTitle === r.goProTitle && r.homeSub === r.goProSub,
      JSON.stringify(r.homeTitle + ' / ' + r.homeSub) + '  vs  '
        + JSON.stringify(r.goProTitle + ' / ' + r.goProSub));
    ok('    and the card is named for the sheet it opens',
      r.homeTitle === r.sheetH2,
      JSON.stringify(r.homeTitle) + ' vs ' + JSON.stringify(r.sheetH2));
  }
  if (!owner && want !== 'the mode') {
    /* The spent door was a card linking to the store, which is a second tap between
       somebody who has just decided they want more and the thing that sells it. */
    /* THE SHEET'S TILES AND THE CARD'S MARKS ARE ONE ANSWER. The card mirrors the hero row,
       so a fourth tile that did not bring a fourth mark would put the card and the sheet it
       opens at different counts, which is the "3 modes" against "4 modes" drift arriving by
       a door the digits check does not watch. */
    ok('    the spent door draws the bundle itself',
      r.store.tiles.length === (r.fullOn ? 4 : 3) && r.store.buys === 2,
      r.store.tiles.join(', ') + ' / ' + r.store.buys + ' buy buttons');
    ok('    and the card claims exactly as many as the sheet',
      r.goProMarks === r.store.tiles.length,
      r.goProMarks + ' marks against ' + r.store.tiles.length + ' tiles');
    ok('    and every tile says which game it is in',
      r.store.from.join(' | ') === (r.fullOn
        ? 'Perfect Season | Perfect Season | College Football | Perfect Season'
        : 'Perfect Season | Perfect Season | College Football'),
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
  + 'reviewDynastyRules,dynIntroOff,dynNewSheet,dailyStop,PRO_ITEM,'
  /* The two Full Team questions, which have different answers for a tester: who may PLAY it
     and whether it is part of the PRODUCT. The unlocked sheet reads the first, the receipt
     and the store read the second. */
  + 'canPlayFull,fullTeamSold,'
  /* The modes sheet, and the two questions One Franchise Dynasty asks of it: who SEES the
     door and who may open it. See the section on the lock. */
  + 'modeMenu,clubDynastyShow,canPlayClubDynasty,'
  + 'setPremium:(v)=>{premiumSet=v;},'
  /* The walk back from Stripe runs earlier on this page and leaves justPaid set, which is
     itself a reason premiumPitch() stands down. Cleared rather than worked around, so the
     section below is testing the ownership rule and not that one. */
  + 'setPaid:(v)=>{justPaid=v;},goHome,paintSeed,seasonTag,runPlayoffs,R:R,'
  + 'dataNow,LEAGUE:()=>LEAGUE,CAL:()=>CAL,D:()=>DATA,'
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
/* FULL TEAM IS THE ONE DOOR WHOSE PRESENCE DEPENDS ON THE READER, so the count is derived
   rather than written down. This view flips FULLTEAM_LIVE to true, which is the launched
   world; before launch the row is absent and the old 4 and 6 are still the answer. Deriving
   it is what keeps this assertion meaningful on both sides of the flag instead of being a
   magic number somebody bumps whenever it goes red. The row's own presence is asserted
   against the flag straight after the loop, which is the half a count cannot check. */
const fullDoorShows = await ck.page.evaluate(() => !!window.__t.canPlayFull());
for (const [label, owns, want] of [
  ['perfect-season', ['ps_premium', 'cfb_premium'], 4 + (fullDoorShows ? 1 : 0)],
  ['run-the-bundle', ['ps_premium', 'cfb_premium', 'arcade_card_year', 'runtour_pack'],
    6 + (fullDoorShows ? 1 : 0)],
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

/* AND THE FULL TEAM ROW IS THERE EXACTLY WHEN THE READER CAN WALK THROUGH IT. The count above
   would pass just as green if some other row had appeared and this one had not, which is the
   badge-that-cannot-be-lit trap in yet another coat. */
const ftRow = await ck.page.evaluate(() => {
  const T = window.__t;
  T.setPremium(['ps_premium']);
  document.getElementById('sheet').classList.remove('on');
  T.unlockedSheet();
  const rows = [...document.getElementById('sheet-in').querySelectorAll('.ulk-row')];
  const r = rows.find((x) => /Full Team/.test(x.querySelector('b').textContent));
  return { present: !!r, live: !!window.__t.fullTeamSold(), clickable: !!(r && r.onclick) };
});
ok('  the Full Team door matches who can play it', ftRow.present === fullDoorShows,
  'door ' + ftRow.present + ', canPlayFull ' + fullDoorShows);
ok('  and it goes somewhere', !ftRow.present || ftRow.clickable);
/* THE RECEIPT IS THE OTHER RULE AND NOT THIS ONE. A door asks who may play; a receipt
   itemises what was BOUGHT, and that cannot differ between two people who paid the same
   $19.99 because one of them is on a tester list. So it reads the LAUNCH flag, the same rule
   the badge catalog's denominator uses.
   READ OFF PRO_ITEM RATHER THAN OFF A RENDERED SHEET, deliberately: pfPro paints from a real
   premiumUnlocks() round trip that this harness has no account for, so driving it would be
   asserting against the empty state. The line itself is the thing with the rule in it. */
const receipt = await ck.page.evaluate(() => ({
  ps: window.__t.PRO_ITEM.ps_premium.text,
  live: !!window.__t.fullTeamSold(),
}));
ok('  the receipt names Full Team only once it has launched',
  /Full Team/.test(receipt.ps) === receipt.live, receipt.ps);
/* AND IT IS THE SAME SENTENCE THE STORE SELLS. The comment over PRO_ITEM says a receipt
   shorter than the card it is the receipt for reads as something having been taken away, and
   the two are in two different files, so nothing but this notices when they drift. */
const sold = await ck.page.evaluate(() => {
  const m = (window.RTG_STORE.html({ signedOut: false }) || '')
    .match(/Unlimited play:[^<]*/);
  return m ? m[0] : '';
});
ok('  and the store sells the same list', !!sold
  && sold.replace(/^Unlimited play:\s*/, '') === receipt.ps.replace(/^Unlimited runs:\s*/, ''),
  sold + '   ||   ' + receipt.ps);

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

/* ─── THE SHEET IS SQUARE, AND IT IS MEASURED RATHER THAN LOOKED AT ────────────────────
 *
 * EVERYTHING HERE FAILS SILENTLY, which is why it is worth a section. A ragged hero row
 * renders, reads and sells perfectly well; the only symptom is that it looks wrong, and
 * looking wrong is not a thing any other check in this file can see.
 *
 * IT HAS ALREADY COME BACK TWICE IN ONE AFTERNOON, by two different doors, which is the
 * argument for measuring the PROPERTY instead of the cause:
 *
 *   - ONE TILE CARRIED A PART THE OTHERS DID NOT. A grid row stretches every cell to its
 *     tallest, so the .pw-also line under Dynasty put about sixty pixels of nothing under
 *     the Trade Machine beside it: 167.6px against 128.6px at 390px.
 *   - THEN THE LONGEST NAME WRAPPED. With .pw-also gone and the step-down written at 359px,
 *     COMMISSIONER MODE still wrapped at 360, which is what a Galaxy reports, and the rag
 *     was back at 12px on the one width that had not been looked at.
 *
 * So this asks for one height across the whole row, at four widths, and never for a number.
 * A tile that grows for a good reason is fine as long as they all grow together.
 *
 * AND THE CHIPS BESIDE A PRICE SHARE A CENTRE. Save $45 carried align-self:center and One
 * payment did not, so two pills a few pixels apart on the Run The Bundle card sat 4.7px out
 * of step, at two type sizes, with one of them drawing its outline as a real border (which
 * adds two pixels to the box) and the other as an inset shadow (which adds none). Nothing
 * about that is visible in the source of either rule; it is only visible in the boxes.
 */
/* THE VIEWPORT IS RESIZED FOR REAL, one width at a time, and that is not fussiness. The
   first draft of this measured a div narrowed inside a 390px window and reported the rag
   alive at 320 and 360 when it was not: a media query keys on the VIEWPORT, so a narrowed
   element renders at the wide rules and every width below the real one is measured with the
   wrong stylesheet. The widths matter here precisely because the rules change at them. */
/* THE CARD HAS TO BE BACK ON THE PAGE, AND THE PAGE HAS TO BE ON SCREEN. Two separate
   things, and the second one cost a round: the walk above left this account holding both
   products, which is the reader the card is removed for, AND it left the game on a run
   screen. Painted but not shown, the card is found by getElementById and measures 0px wide,
   so the first version of this reported "0 lines in a 0px column" rather than saying the
   front page was not up. A layout assertion has to be made against a laid out element. */
await ck.page.evaluate(() => {
  window.__t.setPaid(false);
  window.__t.setPremium([]);
  window.__t.goHome();
  window.__t.paintHomeStart();
});
await new Promise((r) => setTimeout(r, 200));
const geom = [];
for (const w of [320, 360, 390, 560]) {
  await ck.page.setViewportSize({ width: w, height: 1400 });
  await new Promise((r) => setTimeout(r, 120));
  geom.push(await ck.page.evaluate(async (width) => {
    const box = document.createElement('div');
    box.style.cssText = 'position:absolute;left:0;top:0;width:100%;padding:16px;box-sizing:border-box';
    box.innerHTML = window.RTG_STORE.html({ signedOut: false });
    document.body.appendChild(box);
    await new Promise((r) => requestAnimationFrame(r));
    const tiles = [...box.querySelectorAll('.pw-tile')]
      .map((t) => Math.round(t.getBoundingClientRect().height));
    /* A PRICE ROW IS ALLOWED TO WRAP AND A CHIP IS NOT ALLOWED TO DRIFT, so the claim is
       about chips that share a LINE. At 320px the Run The Bundle row genuinely does not hold
       a price, a struck price and two pills, and wrapping the pills onto a second line under
       the price is the right answer rather than a defect. Asserting over the whole row would
       read that wrap as a 27px misalignment and send somebody to fix a layout that is doing
       what it should. */
    const lines = [];
    [...box.querySelectorAll('.pw-cost')].forEach((row) => {
      const b = row.querySelector('b');
      if (!b) return;
      const br = b.getBoundingClientRect();
      /* BESIDE THE PRICE MEANS OVERLAPPING IT VERTICALLY, and the obvious alternative is
         what the first draft of this got wrong: grouping chips by rounded top put two chips
         five pixels out of step into two different buckets, so the check compared each one
         with itself, found no spread, and passed on exactly the misalignment it was written
         for. Two chips that are out of line are still on the same line. */
      const chips = [...row.querySelectorAll('.pw-once,.pw-save')]
        .map((c) => c.getBoundingClientRect())
        .filter((r) => r.top < br.bottom && r.bottom > br.top)
        .map((r) => ({ mid: r.top + r.height / 2, h: r.height, bottom: r.bottom }));
      if (!chips.length) return;                 // the row wrapped them all below the price
      lines.push({
        spread: chips.length < 2 ? 0
          : Math.max(...chips.map((c) => c.mid)) - Math.min(...chips.map((c) => c.mid)),
        heights: chips.length < 2 ? 0
          : Math.max(...chips.map((c) => c.h)) - Math.min(...chips.map((c) => c.h)),
        overhang: Math.max(0, Math.max(...chips.map((c) => c.bottom)) - br.bottom),
      });
    });
    const total = Math.round(box.getBoundingClientRect().height);
    box.remove();
    /* AND THE PROMPT CARD THAT OPENS ALL THIS, measured in its REAL place on the page. Its
       text column is whatever the value and the marks leave, which is 200px at 390 once the
       fourth mark is there, and the sub has to hold one line in it. "No daily limits. One
       payment, lifetime." needed 240 and wrapped on every phone anybody holds, leaving the
       word "lifetime." alone on a second line.
       MEASURED HERE RATHER THAN COUNTED IN CHARACTERS, because the column depends on the
       mark count and the mark count depends on the reader. */
    const card = document.getElementById('b-premium');
    let sub = null;
    if (card) {
      const s = card.querySelector('.pwc-t span');
      const lh = parseFloat(getComputedStyle(s).lineHeight);
      sub = { lines: Math.round(s.getBoundingClientRect().height / lh),
        col: Math.round(card.querySelector('.pwc-t').getBoundingClientRect().width) };
    }
    return { w: width, tiles, spread: Math.max(...tiles) - Math.min(...tiles), sub,
      chipSpread: Math.max(0, ...lines.map((l) => l.spread)),
      chipHeights: Math.max(0, ...lines.map((l) => l.heights)),
      overhang: Math.max(0, ...lines.map((l) => l.overhang)), total };
  }, w));
}
await ck.page.setViewportSize({ width: 390, height: 1400 });
console.log('\nTHE OFFER IS SQUARE AT EVERY WIDTH IT IS READ AT');
geom.forEach((g) => {
  ok('  ' + g.w + 'px: every hero tile is the same height', g.spread === 0,
    g.tiles.join(' ') + '  (spread ' + g.spread + 'px)');
  ok('  ' + g.w + 'px: the chips beside a price share a centre', g.chipSpread < 1,
    g.chipSpread.toFixed(1) + 'px apart');
  ok('  ' + g.w + 'px: and are the same pill', g.chipHeights < 1,
    g.chipHeights.toFixed(1) + 'px of height between them');
  ok('  ' + g.w + 'px: no chip hangs below the price', g.overhang < 1,
    g.overhang.toFixed(1) + 'px');
  /* 320 IS EXEMPT AND SAYS SO. At 320 the card's title wraps too, so a one line rule there
     would be asking for copy nobody would write. Every width a phone in use actually
     reports is 360 and up. */
  if (g.w >= 360) {
    ok('  ' + g.w + 'px: the prompt card says it in one line', !!g.sub && g.sub.lines === 1,
      g.sub ? g.sub.lines + ' lines in a ' + g.sub.col + 'px column' : 'no card');
  }
});
/* A CEILING ON THE WHOLE SHEET, because the complaint that started this pass was scrolling
   and nothing else here would notice it growing back. Measured at 390px it was 1090px and is
   now 918px. 1000 is a real ceiling rather than a pin: it leaves room to add a line and fails
   on adding a block. Move it when the sheet is meant to get longer, never to make this pass. */
const tall = geom.find((g) => g.w === 390);
ok('  and the whole offer stays under 1000px at 390', tall.total < 1000, tall.total + 'px');

/* ─── A DYNASTY SCREEN SAYS WHICH SEASON IT IS, AND NOTHING ELSE DOES ──────────────────
 *
 * The seeding screen is the same screen in season one and season forty: an eyebrow reading
 * "Regular season complete" over a record. The run is the only thing on the page that knows
 * the difference, and every other Dynasty screen already names it (the squad screen's step,
 * the schedule's heading, the boss battle's eyebrow), so this one was the odd one out.
 *
 * THE HALF THAT NEEDS A GUARD IS THE RESET, NOT THE LABEL. #sd-eye is static markup drawn
 * for the Trade Machine and Full Team on the same page, and both of them reach this screen.
 * Written as "set it when dynasty" and nothing else, a dynasty in the other slot leaves its
 * season number sitting on a mode that has no seasons, which is a sentence that is wrong
 * rather than missing, and nothing anywhere throws. v-caleye carries the same note for the
 * same reason; this is the fourth element on this page with that shape.
 *
 * PAINTED DIRECTLY RATHER THAN PLAYED TO. What is under test is one heading, and driving
 * seventeen weeks of football to reach it would be testing the season loop instead.
 */
console.log('\nA DYNASTY SCREEN SAYS WHICH SEASON IT IS');
const SEED_FIXTURE = { regularRecord: '13-4', bye: false, byeRoute: null,
  roundNames: ['Wild Card', 'Divisional', 'Conf.', 'Title'] };
for (const [label, opts] of [
  ['a dynasty in season 6', { dynasty: true, seasonNo: 6 }],
  ['a dynasty in season 40', { dynasty: true, seasonNo: 40 }],
  ['a Trade Machine run', { dynasty: false, tradeMachine: true, seasonNo: 1 }],
]) {
  const r = await ck.page.evaluate(({ o, seed }) => {
    const run = window.__t.R.createRun({ dynasty: !!o.dynasty, seed: 5 });
    run.dynasty = !!o.dynasty;
    run.tradeMachine = !!o.tradeMachine;
    run.seasonNo = o.seasonNo;
    run.playoffSeed = seed;
    window.__t.setRun(run);
    window.__t.paintSeed();
    const e = document.getElementById('sd-eye');
    const lh = parseFloat(getComputedStyle(e).lineHeight) || 13;
    return { txt: (e.textContent || '').trim(),
      lines: Math.round(e.getBoundingClientRect().height / lh),
      /* The rest of the screen, so a change to the heading cannot quietly take it with it. */
      rec: (document.getElementById('sd-rec') || {}).textContent,
      steps: [...document.querySelectorAll('#sd-tracker .po-step')].length };
  }, { o: opts, seed: SEED_FIXTURE });
  console.log('  ' + label + ':');
  ok('    the eyebrow reads "' + r.txt + '"',
    opts.dynasty
      ? r.txt === 'Regular season complete · Season ' + opts.seasonNo
      : r.txt === 'Regular season complete',
    r.txt);
  /* 320 IS NOT ASSERTED. The viewport here is 390 by the line above this block, which is the
     width this is read at; at 320 a two digit season wraps and breaks cleanly at the middot,
     which is a second line rather than a widow. */
  ok('    on one line at 390', r.lines === 1, r.lines + ' lines');
  ok('    and the screen under it is intact', r.rec === '13-4' && r.steps === 4,
    r.rec + ' / ' + r.steps + ' rounds');
}

/* THE WHOLE POSTSEASON, NOT JUST THE SCREEN THAT WAS REPORTED. The seeding screen was the
   one a player pointed at, and the bracket and the broadcast that follow it had the same
   hole: three screens in a row, each identical in season one and season forty. The results
   screen already named it, on the score card, so it is left alone.
   DRIVEN FOR REAL, because nbrkShow and playPlayoffGame both need a bracket and an opponent
   and neither can be handed a fixture the way paintSeed can. A greedy draft does not reach
   the postseason every year, so the seed is SEARCHED for: the first attempt at this read a
   missed season as a broken harness, because the phase goes straight to 'over' at week 17
   and startPlayoffs then throws "not at seeding". */
const po = await ck.page.evaluate(async () => {
  const T = window.__t, RR = T.R, DATA = T.D();
  /* One draft and one season, to the point the seeding screen is drawn. */
  const toSeeding = (seed) => {
    const run = RR.createRun({ dynasty: true, seed });
    let g = 0;
    while (run.roster.length < run.slots.length && g++ < 400) {
      let d; try { d = RR.spin(run, DATA); } catch (e) { continue; }
      const men = RR.affordableFrom(run, d.team_season_id, DATA.playersByTeamSeason);
      if (!men.length) continue;
      const w = men.slice().sort((a, b) => b.ppr_ppg_mean - a.ppr_ppg_mean)[0];
      try { RR.sign(run, w, RR.slotChoices(run, w)[0]); } catch (e) {}
    }
    if (run.roster.length < run.slots.length) return null;
    run.seasonNo = 6;
    T.setRun(run);
    try { RR.startSeason(run, T.dataNow(), T.LEAGUE(), T.CAL()); } catch (e) { return null; }
    let n = 0;
    while (run.phase === RR.PHASES.SEASON && n++ < 40) {
      try { RR.advanceWeek(run, T.dataNow(), T.LEAGUE(), T.CAL()); } catch (e) { break; }
    }
    return run.phase === RR.PHASES.SEEDING ? run : null;
  };
  /* THE THREE HEADINGS, reached the way a player reaches them: the seeding screen, then the
     button, then the bracket, then the broadcast. Calling the painters instead is not an
     option for the last two, which need a built bracket and a real opponent. */
  const walk = async () => {
    T.paintSeed();
    const seedEye = (document.getElementById('sd-eye').textContent || '').trim();
    document.getElementById('b-po').click();
    await new Promise((r) => setTimeout(r, 700));
    const brkEye = (document.getElementById('nbrk-eyebrow').textContent || '').trim();
    for (let i = 0; i < 40; i++) {
      if (document.getElementById('s-po').classList.contains('on')) break;
      const b = document.getElementById('b-nbrk-fast');
      if (b && b.offsetParent) b.click();
      await new Promise((r) => setTimeout(r, 200));
    }
    return { seedEye, brkEye,
      poEye: (document.getElementById('po-round').textContent || '').trim() };
  };
  let found = null, run = null;
  for (let seed = 1; seed <= 40 && !run; seed++) { run = toSeeding(seed); if (run) found = seed; }
  if (!run) return { found: null };
  const dyn = await walk();

  /* AND THE SAME WALK AGAIN AS A TRADE MACHINE, which is the half that catches the real bug.
     WHY THE WHOLE POSTSEASON IS REPLAYED RATHER THAN ONE ELEMENT REPAINTED: the first version
     of this flipped the flags and called paintSeed alone, so only #sd-eye was drawn a second
     time. Written the careless way, `if (dynasty) set-with-season; else set-without`, the
     bracket and the broadcast both PASSED that check while carrying the trap, because nothing
     ever painted them as a non-dynasty. Proved by doing exactly that.
     The run is rebuilt on the same seed and the flags flipped before the button is pressed,
     so the postseason itself is identical and the only thing that differs is the mode. */
  const run2 = toSeeding(found);
  if (!run2) return { found, dyn, other: null };
  run2.dynasty = false; run2.tradeMachine = true;
  T.setRun(run2);
  const other = await walk();
  return { found, dyn, other, tag: T.seasonTag() };
});
console.log('  the postseason, played to the wild card:');
if (!po.found) {
  ok('    a seed reached the playoffs', false, 'none of 40 did');
} else {
  ok('    the seeding screen names the season',
    po.dyn.seedEye.endsWith('· Season 6'), po.dyn.seedEye);
  ok('    the bracket names it', po.dyn.brkEye.endsWith('· Season 6'), po.dyn.brkEye);
  ok('    the broadcast names it', po.dyn.poEye.endsWith('· Season 6'), po.dyn.poEye);
  if (!po.other) {
    ok('    the same seed replays for the Trade Machine', false, 'rebuild failed');
  } else {
    const none = [po.other.seedEye, po.other.brkEye, po.other.poEye];
    /* THE TAIL, NOT THE WORD. Written /Season/i this failed on a correct page, because
       "Regular season complete" contains the word. What must be absent is the tag. */
    ok('    and none of the three carries the tag for a Trade Machine run',
      po.tag === '' && none.every((t) => !/·\s*Season\s*\d/.test(t)), none.join(' | '));
  }
}

console.log('\nONE FRANCHISE DYNASTY IS SOLD, AND A SHUT DOOR SAYS SO');
/*
 * Reported by a player who could play One Franchise Dynasty without owning the bundle. They
 * could: they are on dynasty-access.js's list, which comps that one mode so a tester holding
 * no row can go on testing it. The gate itself was right and beginDynastyDraft has always
 * carried it.
 *
 * WHAT WAS ACTUALLY WRONG IS THAT NOBODY ELSE COULD SEE THE MODE AT ALL. canPlayClubDynasty()
 * decided both who may OPEN it and whether the door is DRAWN, so a free account and a guest
 * got the One Franchise card with no Dynasty half on it: no door, no lock, no mention. The
 * only ways to learn the mode exists were to buy the bundle and read the receipt, or to be on
 * the list. That is the wall the college front page's card was added to knock down, standing
 * on this page instead, and it is the Commish door's rule arriving here: who SEES a mode and
 * who is SOLD it are different questions.
 *
 * SO THE DOOR IS DRAWN FOR EVERYBODY AND OPENS FOR OWNERS. clubDynastyShow() answers the
 * first, canPlayClubDynasty() the second, and a non-owner gets the same door wearing a
 * padlock whose tap opens the sheet that sells it.
 *
 * THE ASSERTIONS THAT MATTER ARE THE TWO HALVES TOGETHER. A lock on a door that opens anyway
 * is decoration, and a door that refuses with no way to the thing that opens it is the wall
 * this replaces, so the walk presses it and reads what comes up.
 *
 * AND RESUMING IS NEVER GATED, which is written three times elsewhere in this page and is the
 * half most easily lost when a mode is put behind a payment. A saved One Franchise dynasty
 * belongs to whoever played it: the tester list can shorten and a card can expire, and
 * neither may be the thing that takes a career away. Ownership decides STARTING one.
 */
{
  const CLUB_KEY = 'ps_dynasty_save_club';
  const setup = async (owns, save) => ck.page.evaluate(async (o) => {
    const T = window.__t;
    document.getElementById('sheet').classList.remove('on');
    T.setPaid(false);
    if (o.signedIn === false) T.clearAuth();
    else {
      T.setAuthState({ ready: true, signedIn: true, userId: 'u1', name: 'tester' });
      T.setPremium(o.owns ? ['ps_premium', 'cfb_premium'] : []);
    }
    try {
      if (o.save) {
        localStorage.setItem(o.key, JSON.stringify({
          v: T.DYN_SAVE_VERSION, user: 'u1', at: Date.now(), submitted: null,
          run: { dynasty: true, franchise: 'KC', phase: 'squad', roster: ['x|2019'],
            seasonNo: 4, score: 1000 },
        }));
      } else localStorage.removeItem(o.key);
    } catch (e) {}
    T.modeMenu();
    const dyn = document.getElementById('b-mc-clubdyn');
    return {
      show: T.clubDynastyShow(), on: T.canPlayClubDynasty(),
      /* The door exists at all, which is the half a free account did not get. */
      drawn: !!dyn,
      locked: !!(dyn && dyn.classList.contains('mc-go-lock')),
      pad: !!(dyn && dyn.querySelector('svg.mc-lk')),
      label: ((dyn && dyn.innerText) || '').replace(/\s+/g, ' ').trim(),
      disabled: !!(dyn && dyn.disabled),
      alt: !!document.getElementById('b-mc-clubnew'),
    };
  }, { owns, save, key: CLUB_KEY, signedIn: owns === null ? false : true });

  /* A FREE ACCOUNT. The door is there, it is locked, and it says what opens it. */
  const free = await setup(false, false);
  ok('a free account is shown the One Franchise Dynasty door', free.drawn === true,
    'show ' + free.show + ', drawn ' + free.drawn);
  ok('  with a lock on it', free.locked && free.pad, free.label || 'no label');
  ok('  naming what opens it', /pro/i.test(free.label), free.label);
  ok('  and the mode itself still refused', free.on === false, String(free.on));
  /* PRESSED, because a lock with nothing behind it is the wall this replaced. */
  const pressed = await ck.page.evaluate(async () => {
    /* GUARDED, because a door that is not drawn is exactly what the assertion above is for
       and a null here would abort the suite rather than report it. */
    const b = document.getElementById('b-mc-clubdyn');
    if (!b) return { missing: true };
    b.click();
    await new Promise((r) => setTimeout(r, 120));
    return { kind: document.getElementById('sheet-in').dataset.kind,
      on: document.getElementById('sheet').classList.contains('on') };
  });
  ok('  and pressing it opens the offer',
    !pressed.missing && pressed.on && pressed.kind === 'premium',
    pressed.missing ? 'no door to press' : 'sheet kind ' + pressed.kind);

  /* A GUEST. The account wall already disables every card in this sheet, so what is being
     asked here is only that the mode is NAMED rather than hidden from somebody with no
     account at all. */
  const guest = await setup(null, false);
  ok('a guest is shown it too', guest.drawn === true && guest.locked === true,
    'drawn ' + guest.drawn + ', locked ' + guest.locked);
  ok('  behind the account wall the whole sheet carries', guest.disabled === true,
    String(guest.disabled));

  /* AN OWNER. No lock, and the door is the mode. */
  const owner = await setup(true, false);
  ok('an owner gets the door open', owner.on === true && owner.drawn === true
    && owner.locked === false && owner.pad === false,
    'on ' + owner.on + ', locked ' + owner.locked);
  ok('  and it offers the mode rather than the price', /season after season/i.test(owner.label),
    owner.label);

  /* A NON-OWNER HOLDING A SAVED RUN. This is the carve-out, and it is the one that costs
     somebody a career if it is got wrong. */
  const saved = await setup(false, true);
  ok('a saved run is never locked away from the player who made it',
    saved.drawn === true && saved.locked === false, 'locked ' + saved.locked);
  ok('  the door resumes it by name', /resume/i.test(saved.label) && /season 4/i.test(saved.label),
    saved.label);
  /* AND STARTING A DIFFERENT ONE IS STILL THE PAID ACTION. The footnote under a Resume door
     is the one route left to a new run, so it is the one that has to stay shut. */
  const alt = await ck.page.evaluate(async () => {
    const b = document.getElementById('b-mc-clubnew');
    if (!b) return { there: false };
    b.click();
    await new Promise((r) => setTimeout(r, 120));
    return { there: true, kind: document.getElementById('sheet-in').dataset.kind };
  });
  ok('  while starting a different club still asks for the bundle',
    alt.there === true && alt.kind === 'premium', JSON.stringify(alt));

  /* AND THE ENGINE REFUSES IT WHATEVER THE SCREEN DID. The door is the only thing that
     passes a franchise, and a caller is not the authority on who may use it. */
  const forced = await ck.page.evaluate(async () => {
    const T = window.__t;
    T.setAuthState({ ready: true, signedIn: true, userId: 'u1', name: 'tester' });
    T.setPremium([]);
    T.setRun(null);
    T.beginDynastyDraft({ franchise: 'KC' });
    await new Promise((r) => setTimeout(r, 200));
    const r = T.getRun();
    return { started: !!(r && r.franchise) };
  });
  ok('  and calling the draft directly starts nothing', forced.started === false,
    String(forced.started));
}
ok('  and none of it threw', ck.boom.length === 0, ck.boom.join(' | '));

await ck.page.close();

/*
 * THE LAUNCHED VIEW, WHICH IS EVERYBODY'S VIEW.
 *
 * This section read AN ACCOUNT OFF THE TESTER LISTS SEES NONE OF IT and asserted five
 * absences, which was the right guard for two unannounced modes. Every one of those five
 * is now inverted on purpose: the doors are built for anybody, the pitch is drawn, and a
 * free account IS metered. Those are not five regressions, they are what launching meant,
 * and the file has to say so in the position it is in rather than be quietly deleted.
 *
 * WHAT IT GUARDS NOW is the shape of the paid tier, which is the thing that can still break
 * quietly: a free account gets the mode plus a meter, an owner gets the mode with the meter
 * off, and NEITHER of them is ever refused the door. The mode being free to enter is the
 * whole design (see the note in 105_fullteam_daily.sql on why a hard gate would cap every
 * free cabinet's GOAT forever), so a door that came back as a wall would be a silent
 * reversal of it, and no error anywhere would report that.
 */
console.log('\nAN ACCOUNT THAT IS NOBODY IN PARTICULAR GETS ALL OF IT');
const plain = await openPage(browser, 'http://local.test/football/', { tester: false,
  inject: 'acctTier,premiumPitch,dailyOn,canPlayDynasty,canPlayFull,'
    + "signIn:()=>{authState.signedIn=true;authState.ready=true;authState.name='someone';}"
    + ',setPremium:(v)=>{premiumSet=v;}' });
const off = await plain.page.evaluate(() => {
  const T = window.__t;
  T.signIn(); T.setPremium([]);
  return { pitch: T.premiumPitch(), metered: T.dailyOn(),
    canDyn: T.canPlayDynasty(), canFull: T.canPlayFull(),
    dynastyDoor: !!document.getElementById('b-start-dyn'),
    fullDoor: !!document.getElementById('b-start-full'),
    pitchCard: !!document.getElementById('b-premium') };
});
ok('a dynasty door, for an account on no list', off.dynastyDoor);
ok('a full team door, the same', off.fullDoor);
ok('  and both modes answer that they can be played', off.canDyn && off.canFull);
ok('the pitch card is on the front page', off.pitchCard);
ok('premiumPitch() offers the bundle', off.pitch === true);
/* THE METER IS THE PRODUCT, so this is the line that says the free tier is still a free
   TIER and not a free GAME. It was `=== false` when nobody off the list could reach a mode
   to be metered on. */
ok('and a free account is metered', off.metered === true);
/* AND THE ROW IS WHAT TURNS IT OFF, which is the same assertion from the paying side. The
   tester lists are feature flags and never permissions, so the thing that has to move the
   meter is the premium_unlocks row and nothing else. Same page, same account, one row. */
const paid = await plain.page.evaluate(() => {
  const T = window.__t;
  T.setPremium(['ps_premium', 'cfb_premium']);
  return { metered: T.dailyOn(), pitch: T.premiumPitch(),
    dynastyDoor: !!document.getElementById('b-start-dyn') };
});
ok('the row stops the counting', paid.metered === false);
ok('  and the pitch goes quiet for an owner', paid.pitch === false);
ok('  and the door is still there', paid.dynastyDoor);
await plain.page.close();

/*
 * THE DYNASTY BOARD HAS A WAY IN FROM THE FRONT PAGE.
 *
 * It did not. The table, the axes and the queries all existed and the only thing that ever
 * set lbDynasty was boardFromRun, which needs a finished dynasty season on screen, so the
 * board was reachable from exactly one place and openBoard cleared the flag on the way in
 * from anywhere else. Nothing was broken and nothing could report it: a leaderboard nobody
 * can open renders perfectly. Reported by a player who went looking for it.
 *
 * WHAT MADE IT MORE THAN ONE LINE is that boardChrome hid the competition select on this
 * board, on the argument that Dynasty's own axis tabs stand in for it. True while the board
 * was only ever a run's own board; false the moment the select is the way IN, because a door
 * that disappears behind you is a board you can only leave by closing the whole screen. The
 * select stays up on both now and the SORT BAR is what the axis tabs actually replace.
 *
 * So both directions are driven here, and the way back is the half that never existed.
 */
console.log('\nTHE DYNASTY BOARD IS REACHABLE, AND LEAVEABLE');
const lb = await openPage(browser, 'http://local.test/football/', { tester: false,
  inject: 'canPlayDynasty,openBoard,setRun:(r)=>{run=r;},'
    + 'lbDyn:()=>lbDynasty,paintDyn:paintDynastyBoard,paintCls:paintBoard,'
    + 'setRows:(rs)=>{lbRows=rs;},setSort:(s)=>{lbSort=s;lbDir=sortBestDir(s);},'
    + 'hiNum:dynHiNum,byScore:(on)=>{lbDynSort=on?"score":"seasons";},'
    + "signIn:()=>{authState.signedIn=true;authState.ready=true;authState.name='t';"
    + "authState.userId='u1';premiumSet=[];}" });
await lb.page.evaluate(() => window.__t.signIn());
await lb.page.click('#frg-x', { timeout: 2000 }).catch(() => {});
{
  /* The way a player does it: press Leaderboard, then pick it out of the select. */
  await lb.page.click('#b-board');
  await lb.page.waitForTimeout(1200);
  const opts = await lb.page.evaluate(() =>
    [...document.querySelectorAll('#lb-comp option')].map((o) => o.value));
  ok('Dynasty is in the competition select', opts.includes('dynasty'),
    opts.filter((o) => !/^[A-Z]{2,3}$/.test(o)).join(', ') || '(none)');
  await lb.page.selectOption('#lb-comp', 'dynasty');
  await lb.page.waitForTimeout(1200);
  const on = await lb.page.evaluate(() => ({
    dyn: window.__t.lbDyn(),
    eye: (document.querySelector('#s-board .lbtop .eyebrow') || {}).textContent,
    sel: getComputedStyle(document.querySelector('#s-board .lbmode')).display,
    value: document.getElementById('lb-comp').value,
    axes: getComputedStyle(document.getElementById('lb-dyntabwrap')).display,
    sort: getComputedStyle(document.querySelector('#s-board .sortbar')).display,
    blurb: (document.getElementById('lb-blurb') || {}).textContent || '',
  }));
  ok('  picking it opens the Dynasty board', on.dyn === true && on.eye === 'Dynasty', on.eye);
  ok('  AND THE SELECT STAYS UP, so it is not a one-way door', on.sel !== 'none', on.sel);
  ok('  showing Dynasty as the one selected', on.value === 'dynasty', on.value);
  ok('  with the run axes in place of the season sort bar',
    on.axes !== 'none' && on.sort === 'none', 'axes ' + on.axes + ', sort ' + on.sort);
  /* THE BLURB IS WRITTEN BEFORE THE REQUEST, so the unreachable branch cannot leave the last
     board's sentence under a Dynasty table. Nothing reaches a server in this harness, which
     is exactly the state that used to print "Free runs only. Each franchise has its own
     board." over the Dynasty error. */
  ok('  and the board says what a row is, even with nothing reachable',
    /One row a run/.test(on.blurb), on.blurb.slice(0, 64));
}
{
  await lb.page.selectOption('#lb-comp', '');
  await lb.page.waitForTimeout(1200);
  const off = await lb.page.evaluate(() => ({
    dyn: window.__t.lbDyn(),
    eye: (document.querySelector('#s-board .lbtop .eyebrow') || {}).textContent,
    sort: getComputedStyle(document.querySelector('#s-board .sortbar')).display,
    axes: getComputedStyle(document.getElementById('lb-dyntabwrap')).display,
  }));
  ok('  and picking Offense comes back out', off.dyn === false && off.eye === 'Standings', off.eye);
  ok('    with the classic sort bar back and the run axes gone',
    off.sort !== 'none' && off.axes === 'none', 'sort ' + off.sort + ', axes ' + off.axes);
}
{
  /* AND THE ROUTE THAT ALREADY WORKED STILL DOES. Coming off a finished dynasty season opens
     that run's own board without anybody picking anything, and that is the path every
     existing player knows. Adding a second way in must not cost the first. */
  const r = await lb.page.evaluate(() => {
    const T = window.__t;
    T.setRun({ outcome: 'done', dynasty: true, seasonNo: 3 });
    T.openBoard();
    return { dyn: T.lbDyn(), value: document.getElementById('lb-comp').value };
  });
  await lb.page.waitForTimeout(1000);
  ok('  a finished dynasty season still opens its own board', r.dyn === true, String(r.dyn));
  ok('    and the select says so', r.value === 'dynasty', r.value);
}
/*
 * TWO MARKS A ROW CANNOT WORK OUT FOR ITSELF, AND BOTH FAIL SILENTLY.
 *
 * `display_pro` says the account holds the bundle and `dynasty_over` says the run has
 * finished. Neither is knowable in the browser: premium_unlocks is read-own, so nobody can
 * see who else paid, and nothing about somebody else's save reaches this page at all. Both
 * arrive as columns written by 107_board_pro_and_live.sql.
 *
 * EVERY WAY THIS BREAKS RENDERS PERFECTLY. A gold name that never appears is a board that
 * looks exactly like the board did last week. A LIVE badge on a run somebody abandoned in
 * March is a valid pill on a valid row. A pill that computes to display:block pushes the
 * name onto a second line, which is the champion mark's own bug and cost this file nothing
 * to catch only because somebody had already paid for it once.
 *
 * SO THE ROWS ARE FABRICATED AND THE SCREEN IS MEASURED. Nothing reaches a server in this
 * harness, so the painters are handed the five rows that cover the states: live, live and
 * paid, finished and paid, neither, and the one the page has to refuse on its own judgement,
 * which is a run whose last season is three days old and which no column will ever mark as
 * over.
 */
console.log('\nA PAID NAME AND A LIVE RUN');
{
  const seen = await lb.page.evaluate(() => {
    const T = window.__t, now = Date.now();
    const ago = (h) => new Date(now - h * 3600 * 1000).toISOString();
    T.setRows([
      { dynasty_id: 'a', seasons: 40, score: 900000, display_name: 'Pod Paid',
        created_at: ago(1), dynasty_over: false, display_pro: true },
      { dynasty_id: 'b', seasons: 30, score: 800000, display_name: 'Pod Done',
        created_at: ago(1), dynasty_over: true },
      { dynasty_id: 'c', seasons: 20, score: 700000, display_name: 'Pod Plain',
        created_at: ago(1) },
      { dynasty_id: 'd', seasons: 10, score: 600000, display_name: 'Live Free',
        created_at: ago(2), dynasty_over: false },
      { dynasty_id: 'e', seasons: 9, score: 500000, display_name: 'Live Paid',
        created_at: ago(2), dynasty_over: false, display_pro: true },
      { dynasty_id: 'f', seasons: 8, score: 400000, display_name: 'Done Paid',
        created_at: ago(2), dynasty_over: true, display_pro: true },
      { dynasty_id: 'g', seasons: 7, score: 300000, display_name: 'Plain Row',
        created_at: ago(2) },
      { dynasty_id: 'h', seasons: 6, score: 200000, display_name: 'Walked Off',
        created_at: ago(72), dynasty_over: false },
    ]);
    T.paintDyn();
    const rows = [...document.querySelectorAll('#lb-rows .lbr')];
    const read = (r) => {
      const b = r.querySelector('.who b'), pill = r.querySelector('.livepill');
      const cs = getComputedStyle(b);
      return {
        name: b.textContent.trim(),
        pro: b.classList.contains('pro-name'),
        pill: !!pill,
        pillDisplay: pill ? getComputedStyle(pill).display : null,
        pillColor: pill ? getComputedStyle(pill).color : null,
        /* `.who > span`, and the child combinator is the whole of it. The sub line is a
           direct child of .who and the pill is a span too, nested inside the name, so a
           descendant selector matches the PILL first: the comparison below was the pill
           against itself, which can never differ, and the assertion failed on a correct
           page. That is this file's own extractor lesson, arriving at a one line read. */
        subColor: getComputedStyle(r.querySelector('.who > span')).color,
        rowClass: r.className,
        /* THE NAME'S OWN HEIGHT, NOT THE ROW'S. A board row has a 75px floor set by the
           avatar beside it, so a name pushed onto a second line fits inside it and the
           row measures the same: the first draft of this compared rows and reported 75
           against 75 with the pill computing to display:block. The element that actually
           grows is the one the pill is inside. */
        h: Math.round(b.getBoundingClientRect().height),
        fill: cs.webkitTextFillColor || cs.color,
        bg: cs.backgroundImage,
      };
    };
    const pods = [...document.querySelectorAll('#lb-podium .pod')].map((p) => {
      const n = p.querySelector('.pn'), pill = p.querySelector('.livepill');
      return { name: n.textContent.trim(), pro: n.classList.contains('pro-name'),
        pill: !!pill, word: pill ? getComputedStyle(pill).fontSize : null };
    });
    return { rows: rows.map(read), pods };
  });
  const by = {};
  seen.rows.forEach((r) => { by[r.name.replace(/^LIVE/, '')] = r; });
  ok('the five list rows drew', seen.rows.length === 5,
    seen.rows.map((r) => r.name).join(', '));
  /* THE PILL, on the one thing a column can answer and the one thing it cannot. */
  ok('  a run still going wears LIVE', by['Live Free'] && by['Live Free'].pill === true);
  ok('    and a finished one does not', by['Done Paid'] && by['Done Paid'].pill === false);
  ok('    and a row from before the column says nothing',
    by['Plain Row'] && by['Plain Row'].pill === false);
  /* The cutoff is the page's own judgement and it is the half no migration can make. This
     run is marked unfinished and always will be: nothing reaches the server when somebody
     closes the tab for the last time. */
  ok('    and a run nobody has touched for three days is not live',
    by['Walked Off'] && by['Walked Off'].pill === false);
  /* THE CHAMPION MARK'S OWN BUG, asked of the new element. `.lbr .who span` claims every
     span inside .who as a block, so a pill that lost that cascade would take the row's
     whole width and drop the name onto a second line. Measured as a height rather than as
     a display, because the height is what a reader would actually see. */
  ok('  the pill sits on the name line', by['Live Free'].pillDisplay === 'inline-flex',
    String(by['Live Free'].pillDisplay));
  ok('    and costs the name no height',
    by['Live Free'].h === by['Plain Row'].h,
    by['Live Free'].h + ' against ' + by['Plain Row'].h);
  /* THE SAME RULE SETS A COLOUR, and the first draft of this section did not ask. It came
     off the champion mark's bug, and the champion mark is an SVG with its own fill, so the
     colour half of that cascade had never cost anything. Here it did: a red box with a red
     dot and the word in the sub line's grey. Reported by nothing, because it renders. */
  {
    const c = (by['Live Free'].pillColor || '').match(/\d+/g) || [];
    ok('    and the word is red rather than the sub line grey',
      by['Live Free'].pillColor !== by['Live Free'].subColor &&
      +c[0] > +c[1] && +c[0] > +c[2],
      by['Live Free'].pillColor + ' against ' + by['Live Free'].subColor);
  }
  /* THE NAME AND NOT THE ROW. Gold on this board is an achievement and blue is whose row it
     is; a paid account is neither, so it may not touch anything the row itself wears. */
  ok('  a paid account is gilded', by['Live Paid'].pro === true);
  ok('    with a gradient under the glyphs',
    /gradient/.test(by['Live Paid'].bg) && by['Live Paid'].fill === 'rgba(0, 0, 0, 0)',
    by['Live Paid'].fill);
  ok('    and a free one is not',
    by['Live Free'].pro === false && by['Live Free'].bg === 'none', by['Live Free'].bg);
  ok('    and the ROW is untouched either way',
    by['Live Paid'].rowClass === by['Live Free'].rowClass,
    '"' + by['Live Paid'].rowClass + '" against "' + by['Live Free'].rowClass + '"');
  /* The podium draws in the order 2, 1, 3, so the paid live run is the middle step. */
  const pod = {}; seen.pods.forEach((p) => { pod[p.name.replace(/^LIVE/, '')] = p; });
  ok('  the podium carries both marks too',
    pod['Pod Paid'] && pod['Pod Paid'].pro === true && pod['Pod Paid'].pill === true);
  ok('    with the word collapsed to its dot, because a step is 93px wide',
    pod['Pod Paid'].word === '0px', String(pod['Pod Paid'].word));
  ok('    and a finished run on the steps wears nothing',
    pod['Pod Done'] && pod['Pod Done'].pill === false && pod['Pod Done'].pro === false);
}

/*
 * ONE ACCOUNT CANNOT HAVE FOUR RUNS GOING, AND THE BOARD SAID IT DID.
 *
 * Reported with a screenshot: four rows of the Dynasty board wore LIVE and all four
 * belonged to one player. The page has two dynasty slots, so at most two of an account's
 * runs are in progress; the other two were runs whose local save had gone before anything
 * could post their end, and the 48 hour window is not short enough to catch a tester who
 * played four in two days. 108_dynasty_slot.sql gives the server the slot and answers
 * `dynasty_current`: of this account's runs in this slot, is this the latest one.
 *
 * THE COLUMN IS FABRICATED HERE, so this section says nothing about what WRITES it. That
 * is supabase/test/dynasty_slot_test.sql's job, the same split 107's two halves already
 * run on. What is under test is the page's reading, and specifically the three-valued one:
 * a database on 107 and not 108 answers nothing, and reading that as "no" would take the
 * badge off everybody the day it shipped.
 */
console.log('\nA BADGE THAT SAYS LIVE HAS TO MEAN ONE RUN A SLOT');
{
  const seen = await lb.page.evaluate(() => {
    const T = window.__t, now = Date.now();
    const ago = (h) => new Date(now - h * 3600 * 1000).toISOString();
    /* One account, four unfinished runs, all played inside the window. Two are the newest
       in their slot and two are behind them. Plus a row from a database that has not had
       108, which has no opinion to read. */
    T.setRows([
      { dynasty_id: 'p', seasons: 40, score: 900000, display_name: 'Pod A',
        created_at: ago(1), dynasty_over: false, dynasty_current: true },
      { dynasty_id: 'q', seasons: 39, score: 880000, display_name: 'Pod B',
        created_at: ago(1), dynasty_over: false, dynasty_current: false },
      { dynasty_id: 'r', seasons: 38, score: 870000, display_name: 'Pod C',
        created_at: ago(1), dynasty_over: false, dynasty_current: true },
      { dynasty_id: 'a', seasons: 20, score: 700000, display_name: 'Open Now',
        created_at: ago(2), dynasty_over: false, dynasty_current: true },
      { dynasty_id: 'b', seasons: 19, score: 690000, display_name: 'Club Now',
        created_at: ago(3), dynasty_over: false, dynasty_current: true },
      { dynasty_id: 'c', seasons: 18, score: 680000, display_name: 'Open Stale',
        created_at: ago(4), dynasty_over: false, dynasty_current: false },
      { dynasty_id: 'd', seasons: 17, score: 670000, display_name: 'Club Stale',
        created_at: ago(5), dynasty_over: false, dynasty_current: false },
      { dynasty_id: 'e', seasons: 16, score: 660000, display_name: 'No Opinion',
        created_at: ago(6), dynasty_over: false },
    ]);
    T.paintDyn();
    return [...document.querySelectorAll('#lb-rows .lbr')].map((r) => ({
      name: r.querySelector('.who b').textContent.trim().replace(/^LIVE/, ''),
      pill: !!r.querySelector('.livepill'),
    }));
  });
  const by = {};
  seen.forEach((r) => { by[r.name] = r.pill; });
  ok('the five list rows drew', seen.length === 5, seen.map((r) => r.name).join(', '));
  ok('  the newest run in each slot is live',
    by['Open Now'] === true && by['Club Now'] === true);
  /* The whole report, in two lines: an account may light two and never four. */
  ok('  and the runs abandoned behind them are not',
    by['Open Stale'] === false && by['Club Stale'] === false,
    'open ' + by['Open Stale'] + ', club ' + by['Club Stale']);
  /* THE THREE-VALUED READ. Written `dynasty_current !== true` this row goes dark, and so
     does every row on every database that has had 107 and not 108. Undefined is the server
     having no opinion, which is the "absent is not zero" rule the daily meter runs on. */
  ok('  and a database without 108 is unchanged',
    by['No Opinion'] === true, String(by['No Opinion']));
  /* The podium reads the same answer, and it is drawn by a different painter. */
  const pods = await lb.page.evaluate(() =>
    [...document.querySelectorAll('#lb-podium .pod')].map((p) => ({
      name: p.querySelector('.pn').textContent.trim().replace(/^LIVE/, ''),
      pill: !!p.querySelector('.livepill'),
    })));
  const pod = {}; pods.forEach((p) => { pod[p.name] = p.pill; });
  ok('  the podium caps it too', pod['Pod A'] === true && pod['Pod C'] === true
    && pod['Pod B'] === false,
    pods.map((p) => p.name + ':' + p.pill).join(', '));
}

/*
 * AND THE TAG DROPS THE SLOT RATHER THAN THE SEASON.
 *
 * SQL is deployed by hand and this page is deployed by a push, so there is a window in
 * which the page asks for a function the database does not have yet. PostgREST resolves an
 * rpc by its ARGUMENT NAMES, so a five argument call against a database still on 107 is not
 * a slower answer and not a null: it is 404 PGRST202, and the season is never tagged. A run
 * with no dynasty_id is not on the Dynasty board at all, and nothing on screen says so.
 *
 * It is the version pin's own problem in the one place a pin cannot reach: the page and the
 * module move together in a commit and the SCHEMA does not move with either.
 *
 * DRIVEN THROUGH THE REAL FUNCTION, with fetch swapped for a recorder, because what is
 * being asserted is which bodies go out and in what order. `timed` calls the global fetch,
 * so nothing about board.js is faked.
 */
console.log('\nA TAG THAT MEETS A DATABASE ONE MIGRATION BEHIND');
{
  const tag = await lb.page.evaluate(async () => {
    const real = window.fetch;
    const run = async (has108) => {
      const sent = [];
      window.fetch = async (url, opts) => {
        if (String(url).indexOf('rpc/ps_dynasty_tag') < 0) return real(url, opts);
        const body = JSON.parse((opts && opts.body) || '{}');
        sent.push(body);
        if (!has108 && 'p_slot' in body) {
          return new Response(JSON.stringify({ code: 'PGRST202',
            message: 'Could not find the function public.ps_dynasty_tag'
              + '(p_dynasty_id, p_row, p_score, p_season, p_slot) in the schema cache' }),
            { status: 404, headers: { 'Content-Type': 'application/json' } });
        }
        /* A void rpc answers 204, and a 204 is a NULL BODY STATUS: `new Response('', ...)`
           throws rather than answering, which the retry loop reads as a network blip and
           swallows. The first draft of this section did exactly that and reported three
           requests on the arm that should make one. */
        return new Response(null, { status: 204 });
      };
      const ok = await window.PS_BOARD.dynastyTag(
        7, '11111111-2222-3333-4444-555555555555', 3, 4000, 'club');
      return { ok, sent };
    };
    const now = await run(true);
    const old = await run(false);
    window.fetch = real;
    return { now, old };
  });
  ok('a database with 108 is asked once, with the slot',
    tag.now.ok === true && tag.now.sent.length === 1 && tag.now.sent[0].p_slot === 'club',
    tag.now.sent.length + ' request(s), slot ' + tag.now.sent[0].p_slot);
  /* THE SEASON IS WHAT MUST NOT BE LOST. A badge that is briefly wrong is the whole of what
     the fallback gives up, and it heals on the next season filed after the migration. */
  ok('  and one behind still files the season', tag.old.ok === true);
  ok('    by asking again without the slot', tag.old.sent.length === 2
    && tag.old.sent[0].p_slot === 'club' && !('p_slot' in tag.old.sent[1]),
    tag.old.sent.map((b) => ('p_slot' in b) ? 'with' : 'without').join(' then '));
  /* Everything else the tag sends is unchanged, or the retry would file a different season
     from the one that was refused. Written against `sent[1]` directly it THREW rather than
     failing when the retry was reintroduced as missing, which takes the rest of the file
     with it: a guard has to report the defect it was proved against, not crash on it. */
  ok('    and nothing else about the season moved', tag.old.sent.length === 2
    && ['p_row', 'p_dynasty_id', 'p_season', 'p_score']
      .every((k) => JSON.stringify(tag.old.sent[0][k]) === JSON.stringify(tag.old.sent[1][k])));
}

/*
 * A DYNASTY SCORE GROWS WITH THE SQUARE OF THE RUN, SO THE LADDER HAS TO GO ON GOING UP.
 *
 * dynastySeasonScore multiplies a season by its own season number, so a run's total is
 * quadratic in its length and there is no ceiling on it. The corner had one rung, M, and
 * the record reached 1,524,900,000 and printed `1524.9M`: a correct abbreviation of a
 * number nobody writes that way, and longer than the exact figure it replaced. Reported by
 * a player. B and T will both be reached by somebody simply continuing to play.
 *
 * TWO FIXED SLOTS AND ONE THAT CAN GIVE. The door and a podium step are boxes the number
 * cannot argue with; a list row shrinks the name instead and keeps the figure exact, which
 * is where somebody checking whether they beat it by four hundred points looks.
 */
console.log('\nA SCORE THAT OUTGREW ITS LADDER');
{
  const seen = await lb.page.evaluate(() => {
    const T = window.__t;
    const ladder = [0, 578000, 999999, 1e6, 1524900, 999999999, 1524900000, 1e12, 4.56e13]
      .map((n) => [n, T.hiNum(n)]);
    const now = Date.now();
    const ago = (h) => new Date(now - h * 3600 * 1000).toISOString();
    T.byScore(true);
    T.setRows([
      { dynasty_id: 'a', seasons: 294, score: 1524900000, display_name: 'Record', created_at: ago(1) },
      { dynasty_id: 'b', seasons: 210, score: 988400000, display_name: 'Second', created_at: ago(1) },
      { dynasty_id: 'c', seasons: 180, score: 640200000, display_name: 'Third', created_at: ago(1) },
      { dynasty_id: 'd', seasons: 90, score: 99500000, display_name: 'In The List', created_at: ago(1) },
    ]);
    T.paintDyn();
    const pods = [...document.querySelectorAll('#lb-podium .pod')].map((p) => {
      const pr = p.querySelector('.pr');
      return { text: pr.textContent, over: pr.scrollWidth > pr.clientWidth + 1 };
    });
    const rows = [...document.querySelectorAll('#lb-rows .lbr')]
      .map((r) => r.querySelector('.rec b.big').textContent);
    T.byScore(false);
    return { ladder, pods, rows };
  });
  const want = { 0: '0', 578000: '578,000', 999999: '999,999', 1000000: '1M',
    1524900: '1.52M', 999999999: '1B', 1524900000: '1.52B', 1000000000000: '1T',
    45600000000000: '45.6T' };
  const wrong = seen.ladder.filter(([n, s]) => want[n] !== s);
  ok('the ladder runs to a trillion', wrong.length === 0,
    wrong.map(([n, s]) => n + ' reads ' + s + ' not ' + want[n]).join(', ')
      || seen.ladder.map((p) => p[1]).join(' '));
  /* THE BAND IS PICKED ON THE RAW VALUE AND THE STRING CAN ROUND PAST IT, which is how
     999,999,999 came out as `1000M` on the first draft of the fix. Its own line above,
     because it is the one case a reader of the source would not predict. */
  ok('  and a value that rounds up moves band with it',
    (want[999999999] === '1B') && seen.ladder.find((p) => p[0] === 999999999)[1] === '1B');
  /* Abbreviated where the slot is fixed. The harness measures the FALLBACK face, which is
     about a third wider than the condensed one a real visitor gets, so an overflow here is
     not proof of one on a phone; what this asserts is the shape, that a step never carries
     a raw comma number, which is true in any face. */
  ok('  the podium steps abbreviate', seen.pods.length === 3
    && seen.pods.every((p) => /[MBT]$/.test(p.text) && p.text.indexOf(',') < 0),
    seen.pods.map((p) => p.text).join(' '));
  ok('    and none of them overflows its step',
    seen.pods.every((p) => !p.over), seen.pods.map((p) => p.text + (p.over ? ' OVER' : '')).join(' '));
  /* And the list under it keeps the figure, because a row can shrink the name instead. */
  ok('  and the list below keeps the exact figure',
    seen.rows.length === 1 && seen.rows[0] === '99,500,000', seen.rows.join(' '));
}

/*
 * AND THE CLASSIC BOARD GILDS THE SAME HALF OF THE SAME ROW.
 *
 * The LIVE pill is Dynasty's alone: a dynasty is the one run here that spans days, and every
 * other board ranks finished seasons. The paid name is on every board, and on this one it
 * has to share the front of the name with the champion mark, which is the element whose own
 * cascade bug this markup is written around.
 */
console.log('\nTHE PAID NAME IS ON THE CLASSIC BOARD TOO');
{
  const seen = await lb.page.evaluate(() => {
    const T = window.__t;
    T.setSort('rating');
    T.setRows([
      { id: 1, display_name: 'Paid Champ', team_rating: 101.4, wins: 17, losses: 0,
        perfect: true, perfect_pct: 30, picks: [], display_pro: true },
      { id: 2, display_name: 'Paid Plain', team_rating: 96.2, wins: 14, losses: 3,
        perfect_pct: 12, picks: [], display_pro: true },
      { id: 3, display_name: 'Free Plain', team_rating: 92.0, wins: 12, losses: 5,
        perfect_pct: 8, picks: [] },
      { id: 4, display_name: 'Free Other', team_rating: 88.1, wins: 10, losses: 7,
        perfect_pct: 4, picks: [] },
    ]);
    T.paintCls();
    return [...document.querySelectorAll('#s-board .lbr, #s-board .pod')].map((r) => {
      const n = r.querySelector('.who b') || r.querySelector('.pn');
      return { name: n.textContent.trim(), pro: n.classList.contains('pro-name'),
        badge: !!n.querySelector('.champbadge'),
        badgeDisplay: n.querySelector('.champbadge')
          ? getComputedStyle(n.querySelector('.champbadge')).display : null };
    });
  });
  const paid = seen.filter((r) => /Paid/.test(r.name));
  const free = seen.filter((r) => /Free/.test(r.name));
  ok('every row drew', seen.length >= 4, seen.map((r) => r.name).join(', '));
  ok('  every paid name is gilded', paid.length >= 2 && paid.every((r) => r.pro),
    paid.map((r) => r.name + ':' + r.pro).join(', '));
  ok('  and no free one is', free.length >= 2 && free.every((r) => !r.pro),
    free.map((r) => r.name + ':' + r.pro).join(', '));
  /* The mark is drawn with its own fill rather than currentColor, so a name set to
     transparent cannot take the trophy with it. */
  const champ = seen.find((r) => r.badge);
  ok('  and the champion mark survives a transparent name',
    !!champ && champ.badgeDisplay === 'inline-flex',
    champ ? champ.name + ' ' + champ.badgeDisplay : '(no badge drew)');
}
ok('  and none of it threw', lb.boom.length === 0, lb.boom.join(' | '));
await lb.page.close();

/*
 * A BOOT READ THAT LANDS LATE MUST NOT UNDO WHAT LANDED WHILE IT WAS IN FLIGHT.
 *
 * dailySpend, dailyGrace and dailyDayEnd all write the meter behind `if (r && r.used != null)`.
 * dailyEnsure, which is the BOOT read and so the oldest answer of the four, wrote whatever
 * came back with no guard at all. Two things follow from that one missing clause and both
 * are silent, because every allowance here fails open: nothing is ever wrongly refused, so
 * nothing throws and no screen says anything.
 *
 *   A NULL ERASES A REAL ANSWER.  attemptsState answers null on any network blip. Stored, it
 *   is read everywhere as "no opinion", so the door loses its countdown and dailySeasons()
 *   falls back to 'run', which quietly puts the season copy back on the old run rule in the
 *   middle of a session. The grace announcement reads `was` off the same state and goes mute.
 *
 *   A STALE ANSWER UNDOES A SPEND.  The boot read is the oldest request in flight. Land it
 *   after a kickoff and the used count goes back down: the door redraws with a season the
 *   player has already played still on it.
 *
 * FOUND FROM THE HARNESS SIDE, which is worth saying because the harness looked like the
 * bug. Adding a second background call shifted the timing enough that the null landed
 * between two stubbed states, and the symptom was a boss-win toast that never appeared. The
 * suite was fixed so no section asks the real meter. That is right on its own terms and it
 * is not this: the page had the same race with nothing stubbed at all.
 *
 * THE ANSWER IS THE ONE dynCloudPull ALREADY USES one screen over: null is no opinion, so
 * keep what is held and drop the mark, and the next paint asks again. Bounded, because
 * dailyEnsure is called from every paint of the front page and an unbounded re-arm against a
 * dead network is a request per repaint.
 */
console.log('\nA LATE METER ANSWER NEVER MOVES THE COUNT BACKWARDS');
const lm = await openPage(browser, 'http://local.test/football/', { tester: false,
  inject: 'dailyEnsure,dailySpend,setPremium:(v)=>{premiumSet=v;},'
    + 'setDaily:(m,v)=>{dailyState[m]=v;},getDaily:(m)=>dailyState[m],'
    + 'asked:(m)=>dailyAsked[m],reask:(m)=>{dailyAsked[m]=false;},'
    /* A meter server whose answer is HELD OPEN, so the boot read can be landed by hand at
       the exact moment each case below needs it. A timing bug cannot be checked by racing
       it; it has to be driven. */
    + 'holdState:(v)=>{window.__land=null;'
    + 'B.attemptsState=async()=>new Promise((r)=>{window.__land=()=>r(v);});},'
    + 'land:()=>{if(window.__land){window.__land();window.__land=null;}},'
    + 'stubSpend:(v)=>{B.attemptSpend=async()=>v;},'
    + "signIn:()=>{authState.signedIn=true;authState.ready=true;authState.name='t';}" });
const REAL = { used: 1, allowance: 3, unit: 'season',
  resetsAt: new Date(Date.now() + 9 * 3600e3).toISOString() };
await lm.page.evaluate(() => { window.__t.signIn(); window.__t.setPremium([]); });
{
  const r = await lm.page.evaluate(async ([real]) => {
    const T = window.__t;
    T.setDaily('dynasty', Object.assign({}, real));
    T.holdState(null);                       // the blip
    T.reask('dynasty'); T.dailyEnsure('dynasty');
    T.land();
    await new Promise((go) => setTimeout(go, 50));
    return { held: T.getDaily('dynasty'), asked: T.asked('dynasty') };
  }, [REAL]);
  console.log('  a boot read that comes back null:');
  ok('    does not erase the answer the page is holding',
    !!r.held && r.held.used === 1, JSON.stringify(r.held));
  /* AND THE UNIT IS THE HALF THAT CHANGES THE WORDS. Erased, dailySeasons() falls back to
     'run' and the copy reverts to a rule this database is not keeping. */
  ok('    so the page goes on describing the season rule',
    !!r.held && r.held.unit === 'season', String(r.held && r.held.unit));
  ok('    and the mode is left free to ask again', r.asked === false, String(r.asked));
}
{
  const r = await lm.page.evaluate(async ([real]) => {
    const T = window.__t;
    T.setDaily('dynasty', Object.assign({}, real));
    T.holdState(Object.assign({}, real));    // the pre-kickoff answer, still in flight
    T.reask('dynasty'); T.dailyEnsure('dynasty');
    /* A season is played WHILE that read is out. This is the fresher answer. */
    T.stubSpend({ ok: true, used: 2, allowance: 3, unit: 'season', resetsAt: real.resetsAt });
    await T.dailySpend('dynasty');
    const spent = T.getDaily('dynasty').used;
    T.land();
    await new Promise((go) => setTimeout(go, 50));
    return { spent, after: T.getDaily('dynasty').used };
  }, [REAL]);
  console.log('  a boot read that lands after a kickoff:');
  ok('    the kickoff was counted', r.spent === 2, String(r.spent));
  ok('    AND THE LATE ANSWER DOES NOT GIVE THE SEASON BACK', r.after === 2, String(r.after));
}
/* AND THE SAME RULE FOR THE OTHER THREE WRITERS, which is a separate clause in a separate
   place. dailyEnsure refuses a null itself, because it has to decide whether to ask again;
   dailySpend, dailyGrace and dailyDayEnd refuse theirs inside dailyPut. Removing dailyPut's
   guard left every assertion above green, so without this one the clause those three depend
   on is carried by nothing. A spend that cannot reach the server already grants the season
   (it fails open, and returns true); what it must not also do is forget the day. */
{
  const r = await lm.page.evaluate(async ([real]) => {
    const T = window.__t;
    T.setDaily('dynasty', Object.assign({}, real));
    T.stubSpend(null);                       // the server could not be asked
    const allowed = await T.dailySpend('dynasty');
    return { allowed, held: T.getDaily('dynasty') };
  }, [REAL]);
  console.log('  a spend the server never answered:');
  ok('    lets the season go ahead', r.allowed === true, String(r.allowed));
  ok('    and leaves the day exactly as it was',
    !!r.held && r.held.used === 1 && r.held.unit === 'season', JSON.stringify(r.held));
}
ok('  and none of it threw', lm.boom.length === 0, lm.boom.join(' | '));
await lm.page.close();

/*
 * ONE NEW DYNASTY A DAY, AND THE GATE HAS TO SIT ABOVE THE LINES THAT DESTROY A SAVE.
 *
 * supabase/106_dynasty_one_run_a_day.sql meters how often somebody STARTS a dynasty, which
 * is a different question from how many seasons they may play, and its own suite
 * (supabase/test/dynasty_run_day_test.sql) counts it properly. This asks the half that suite
 * cannot see: where the refusal lands in the page.
 *
 * WHAT CAN GO WRONG HERE IS SILENT AND IT HAS HAPPENED ONCE ALREADY. dynNewSheet cleared the
 * save and asked the allowance afterwards, so the trade this mode is built on (this run for
 * a new one) could be taken halfway: the dynasty went, the draft was then refused, and the
 * player was left holding neither. Nothing throws when a save is removed.
 *
 * TWO DOORS REACH beginDraft AND BOTH ARE DRIVEN. beginDynastyDraft is the one every press
 * goes through; the replace sheet's own button is the one that does NOT go back through it,
 * so a gate added to the door alone is a gate with a hole beside it. That second one is
 * driven the way it actually breaks, too: the sheet is opened on an OPEN day and pressed on
 * a shut one, because a sheet sits open for as long as somebody leaves it open and the other
 * slot, or another tab, can spend the day underneath it.
 */
console.log('\nONE NEW DYNASTY A DAY, AND A REFUSED ONE COSTS NOTHING');
const rd = await openPage(browser, 'http://local.test/football/', { tester: false,
  inject: 'beginDynastyDraft,dynRead,dynKeyFor,DYN_SAVE_VERSION,runDayShut,R:R,'
    + 'setPremium:(v)=>{premiumSet=v;},setAsked:(m)=>{dailyAsked[m]=true;},'
    + 'setDaily:(m,v)=>{dailyState[m]=v;},'
    + 'setRunDay:(v)=>{runDayState=v;runDayAsked=true;},ensureDynastyButton,'
    + "signIn:()=>{authState.signedIn=true;authState.ready=true;authState.name='t';"
    + "authState.userId='u1';}" });
await rd.page.evaluate(() => window.__t.signIn());
/* The rules sheet stands in front of every run and this section is not about it. */
await rd.page.evaluate(() => { try { localStorage.setItem('ps_dynintro_off', '1'); } catch (e) {} });
/* A free account WITH SEASONS LEFT, so the only thing on this page that can refuse is the
   new-run meter and a failure here cannot be the season budget wearing its clothes. */
const rdSetup = (shut, withSave) => rd.page.evaluate(([shut, withSave]) => {
  const T = window.__t;
  try { localStorage.removeItem(T.dynKeyFor('open')); } catch (e) {}
  T.setPremium([]);
  T.setAsked('dynasty');
  T.setDaily('dynasty', { used: 0, allowance: 3,
    resetsAt: new Date(Date.now() + 9 * 3600e3).toISOString(), unit: 'season' });
  T.setRunDay(shut
    ? { ok: false, pro: false, nextAt: new Date(Date.now() + 9 * 3600e3).toISOString() }
    : { ok: true, pro: false, nextAt: null });
  /* WRITTEN STRAIGHT TO THE KEY rather than through dynSave, which packs the LIVE run and
     there is no live run on the front page. What dynRead asks of it is all that matters: the
     version, a dynasty with a roster in it, the open slot, and this account. */
  if (withSave) {
    localStorage.setItem(T.dynKeyFor('open'), JSON.stringify({
      v: T.DYN_SAVE_VERSION, api: 1, user: 'u1', at: Date.now(), submitted: null,
      run: { dynasty: true, franchise: null, phase: T.R.PHASES.OFFSEASON, seasonNo: 4,
        roster: ['1|2020', '2|2020', '3|2020', '4|2020', '5|2020', '6|2020'],
        coach: null, winter: null, history: [] },
    }));
  }
  document.getElementById('sheet').classList.remove('on');
  document.getElementById('sheet-in').dataset.kind = '';
  return !!T.dynRead('open');
}, [shut, withSave]);

{
  const had = await rdSetup(true, true);
  const r = await rd.page.evaluate(() => {
    window.__t.beginDynastyDraft();
    return { on: document.getElementById('sheet').classList.contains('on'),
      head: (document.querySelector('#sheet-in h2') || {}).textContent || '',
      screen: [...document.querySelectorAll('.screen.on')].map((s) => s.id).join(','),
      save: !!window.__t.dynRead('open') };
  });
  console.log('  a shut day, with a dynasty already saved:');
  ok('    the save was there to begin with', had === true);
  ok('    the door draws the wall', r.on && /today.s dynasty/i.test(r.head),
    JSON.stringify(r.head));
  ok('    the draft never opened', !/s-draft/.test(r.screen), r.screen);
  ok('    AND THE SAVED DYNASTY IS UNTOUCHED', r.save === true, String(r.save));
}
{
  await rdSetup(true, false);
  const r = await rd.page.evaluate(() => {
    window.__t.beginDynastyDraft();
    const t = document.getElementById('sheet-in').innerText || '';
    return { on: document.getElementById('sheet').classList.contains('on'),
      says: /Nothing was used by asking/i.test(t),
      offers: /Unlock everything/i.test(t),
      screen: [...document.querySelectorAll('.screen.on')].map((s) => s.id).join(',') };
  });
  console.log('  a shut day with nothing saved:');
  ok('    still refused', r.on);
  /* IT SAYS WHAT IT DID NOT COST. A wall that only says no reads as a wall that took
     something, which is the whole complaint this meter has to avoid producing. */
  ok('    and says nothing was spent by asking', r.says);
  ok('    with the bundle under the fact rather than over it', r.offers);
  ok('    the draft never opened', !/s-draft/.test(r.screen), r.screen);
}
{
  await rdSetup(false, true);
  const r = await rd.page.evaluate(() => {
    const T = window.__t;
    T.beginDynastyDraft();                               // lands on the replace sheet
    const opened = document.getElementById('sheet-in').dataset.kind;
    T.setRunDay({ ok: false, pro: false,
      nextAt: new Date(Date.now() + 9 * 3600e3).toISOString() });
    document.getElementById('b-dr-new').click();
    return { opened,
      head: (document.querySelector('#sheet-in h2') || {}).textContent || '',
      screen: [...document.querySelectorAll('.screen.on')].map((s) => s.id).join(','),
      save: !!T.dynRead('open') };
  });
  console.log('  the replace sheet, pressed after the day shut under it:');
  ok('    the sheet reached was the replace sheet', r.opened === 'dynreplace', r.opened);
  ok('    the wall is drawn', /today.s dynasty/i.test(r.head), JSON.stringify(r.head));
  ok('    the draft never opened', !/s-draft/.test(r.screen), r.screen);
  ok('    AND THE DYNASTY IT WOULD HAVE TRADED AWAY IS STILL THERE',
    r.save === true, String(r.save));
}
/* AND THE DOOR SAYS SO BEFORE THE TAP. Seasons left and no run to spend them on is a state
   the season branch cannot describe: what is used up is the fresh start rather than the
   budget, so a door reading Day done would be wrong about both halves, and one reading Start
   a Dynasty sends somebody into a wall the front page already knew about. */
{
  await rdSetup(true, false);
  const r = await rd.page.evaluate(() => {
    const T = window.__t;
    T.ensureDynastyButton();
    const el = document.getElementById('b-start-dyn');
    return { text: ((el || {}).innerText || '').replace(/\s+/g, ' ').trim(),
      locked: !!(el && el.querySelector('.hp-tag-spent')),
      pad: !!(el && el.querySelector('.hp-tag-spent svg')) };
  });
  console.log('  the front page door, on a spent new-run day with seasons left:');
  ok('    carries the spent tag', r.locked, r.text);
  ok('    with a padlock on it', r.pad);
  ok('    and says a new dynasty rather than a new season', /New dynasty in/i.test(r.text), r.text);
  ok('    and never claims the day is done', !/Day done/i.test(r.text), r.text);
}
/* THE THREE WAYS THE METER MUST NOT BITE. An open day, a database that has not had 106 yet
   (the call errors, the state stays null, and no opinion is permission), and an owner. */
{
  await rdSetup(false, false);
  const r = await rd.page.evaluate(() => {
    const T = window.__t;
    const open = T.runDayShut();
    T.setRunDay(null);
    const quiet = T.runDayShut();
    T.setRunDay({ ok: true, pro: true, nextAt: null });
    return { open, quiet, owner: T.runDayShut() };
  });
  ok('  an open day is not shut', r.open === false, String(r.open));
  ok('  a database without 106 answers nothing, and nothing is permission',
    r.quiet === false, String(r.quiet));
  ok('  an owner is never shut', r.owner === false, String(r.owner));
}
ok('  and none of it threw', rd.boom.length === 0, rd.boom.join(' | '));
await rd.page.close();

await browser.close();
console.log('');
console.log(fails ? fails + ' FAILED' : 'all premium checks passed');
process.exit(fails ? 1 : 0);
