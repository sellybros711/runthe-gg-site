/* ONE SEASON A DAY, AS THE SCREEN PLAYS IT.
 *
 *   (nohup python3 -m http.server 8080 &)
 *   node cfb/build/test/commish/test_clock.mjs
 *
 * The rule is in supabase/104_commish_free_clock.sql and it is tested against a real
 * Postgres by supabase/test/commish_clock_test.sql. That file proves the clock counts.
 * This one proves the PAGE obeys it, which is a different question and the one with the
 * holes in it:
 *
 *   does the wall actually stop a free account moving the year on
 *   does a RELOAD walk around it, which is the hole a client side gate always has
 *   does a paying account ever see it, or ever spend a day
 *   does a season get charged TWICE for one year
 *   does the offer on the wall post the same two bundle keys as everywhere else
 *   does the countdown come off the SERVER's clock rather than the device's
 *
 * THE RPC IS INTERCEPTED HERE rather than answered by a database. What is being tested is
 * what the page does with an answer, and a route gives exact control of the answer
 * including the ones that are awkward to arrange for real: locked with four hours left,
 * locked with one second left, and unreachable. The SQL has its own suite for the counting.
 *
 * NOTHING HERE REACHES STRIPE. The checkout route is intercepted and answered with an
 * error, the way football/check-premium.mjs and test_store.mjs both do it, because Stripe
 * is live and a url in the answer would navigate a test to a real payment page.
 */
import { chromium } from 'playwright';
const HOST = process.env.HOST || 'http://localhost:8080';
const URL = HOST + '/cfb/commish/index.html';

let bad = 0;
const ok = (n, p, x) => { if (!p) bad++; console.log((p ? '  ok   ' : ' FAIL  ') + n + (x !== undefined ? '   ' + x : '')); };

const UID = '11111111-1111-1111-1111-111111111111';
const TESTER = 'clocktester';

/* The tester list, armed through the real array the page reads. Same trap as test_page. */
const arm = `
(function(){ var v;
  Object.defineProperty(window,'PS_CFB_COMMISH_ACCESS',{configurable:true,
    get:function(){ return v; },
    set:function(a){ v=a; try{ a.TESTERS.push(${JSON.stringify(TESTER)}); }catch(e){} }});
})();`;

const stub = (products) => `
window.supabase={createClient(){
  const user={id:'${UID}',email:'c@e.com'};
  const session={access_token:'x',user};
  return {auth:{onAuthStateChange(cb){setTimeout(()=>cb('SIGNED_IN',session),0);return{data:{}}},
    getSession:()=>Promise.resolve({data:{session}}),
    signOut:()=>Promise.resolve({})},
    from(){return{select(){return{eq(){return{maybeSingle:()=>Promise.resolve(
      {data:{username:'${TESTER}'}})}}}}}},
    rpc:(fn)=>Promise.resolve(fn==='premium_products'
      ? {data:${JSON.stringify(products || [])},error:null}
      : {data:null,error:null})}}};`;

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });

/* `clock` is what the intercepted RPC answers with, and it is a function so a walk can
   change its mind between two calls the way a real clock does when a day passes. */
async function open(label, opts) {
  const o = opts || {};
  const p = await b.newPage({ viewport: { width: 390, height: 900 } });
  p.errs = [];
  p.calls = { state: 0, spend: 0 };
  p.on('pageerror', (e) => p.errs.push(e.message));
  await p.addInitScript(arm);
  await p.addInitScript(stub(o.products || []));
  /* The premium RPC goes through the supabase stub above; the clock goes over fetch, so it
     is routed. Both halves of the tier therefore come from this file. */
  await p.route('**/rest/v1/rpc/commish_clock_*', async (route) => {
    const spend = /commish_clock_spend/.test(route.request().url());
    p.calls[spend ? 'spend' : 'state']++;
    const ans = o.clock ? o.clock({ spend, n: p.calls.spend }) : null;
    if (ans === 'offline') { await route.abort(); return; }
    await route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify([ans]) });
  });
  await p.route('**/api/stripe/checkout-bundle', async (route) => {
    p.posted = p.posted || [];
    try { p.posted.push(JSON.parse(route.request().postData() || '{}')); } catch (e) {}
    await route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ error: 'stripe_not_configured' }) });
  });
  await p.goto(URL, { waitUntil: 'domcontentloaded', timeout: 40000 });
  await p.waitForTimeout(2600);
  console.log('\n=== ' + label + ' ===');
  return p;
}
const on = (p, id) => p.$eval('#' + id, (e) => e.classList.contains('on')).catch(() => false);
const txt = (p, sel) => p.$eval(sel, (e) => (e.textContent || '').replace(/\s+/g, ' ').trim()).catch(() => '');
const has = (p, sel) => p.$(sel).then((e) => !!e);
/* Take the job and land in the office, past whatever scene the first beat wants. */
async function job(p) {
  await p.evaluate(() => window.PS_CFB_COMMISH_TEST.takeJob('none'));
  await p.waitForTimeout(500);
  for (let i = 0; i < 6; i++) {
    if (!(await on(p, 's-scene'))) break;
    await p.click('#b-scene-skip').catch(() => {});
    await p.waitForTimeout(300);
  }
}
/* Move the save to the next year the way finishing a season does, and let office() decide. */
const nextYear = (p, y) => p.evaluate((yy) => window.PS_CFB_COMMISH_TEST.jump(0, yy), y);

const iso = (ms) => new Date(Date.now() + ms).toISOString();
const LOCKED = (hrs, terms) => ({ ok: false, pro: false, locked: true,
  next_at: iso(hrs * 3600000), now_at: new Date().toISOString(), seasons: 1,
  terms: terms || 0 });
const FREE = (terms) => ({ ok: true, pro: false, locked: true,
  next_at: iso(24 * 3600000), now_at: new Date().toISOString(), seasons: 1,
  terms: terms || 0 });

/* ── the first season is free ────────────────────────────────────────────────────── */
{
  const p = await open('a free account plays its first season without being asked',
    { clock: () => FREE() });
  await job(p);
  ok('the office opens', await on(p, 's-office'));
  ok('and no wall was shown', !(await on(p, 's-wait')));
  /* NOT ONE ROUND TRIP, which is the point of world.cleared. Taking the job pays for the
     season it starts on, so the very first thing a new player does is not a request that
     could hang, fail, or cost them a day. */
  /* NO SEASON IS CHARGED. The gate does ask the clock once, to check the free tier's one
     contract limit, and that is a read rather than a spend. */
  ok('and no season was charged for it', p.calls.spend === 0, p.calls.spend);
  ok('the gate read the clock once, and only once', p.calls.state === 1, p.calls.state);
  ok('no page errors', p.errs.length === 0, p.errs[0]);
  await p.close();
}

/* ── the second season is a day away ─────────────────────────────────────────────── */
{
  const p = await open('the wall stops the next season', { clock: () => LOCKED(5) });
  await job(p);
  await nextYear(p, 2026);
  await p.waitForTimeout(700);
  ok('the wall is up', await on(p, 's-wait'));
  ok('and the office is not', !(await on(p, 's-office')));
  ok('it names the season being waited for', /Season 2/.test(await txt(p, '#w-head')),
    await txt(p, '#w-head'));
  ok('it says where the term stands', /1 season into a 5 season term/.test(await txt(p, '#w-say')),
    await txt(p, '#w-say'));
  /* AND WHY IT IS ONE HERE. The other game in the same bundle gives a different number, and
     a player who owns both meets both: unexplained, this reads as the college game being
     stingy or broken. The two are different on purpose (see CLAUDE.md), so the screen says
     so rather than leaving somebody to guess. */
  ok('  and that the rule here is one a day', /Free plays one season a day/.test(await txt(p, '#w-say')));
  ok('  and why it is one', /full year of rulings/.test(await txt(p, '#w-say')));
  ok('  and that the other game differs', /NFL game sets its own pace/.test(await txt(p, '#w-say')));
  /* NO FIGURE FOR THE OTHER GAME, because that number lives on its own server and its own
     screen. A second copy here is one that goes stale the next time somebody tunes it, and
     a wrong number about the thing you are being sold is worse than no number. */
  ok('  without quoting the other game\'s number',
    !/\b(two|three|four|five|2|3|4|5) seasons a day/i.test(await txt(p, '#w-say')),
    await txt(p, '#w-say'));
  ok('the countdown reads about five hours', /^[45]h /.test(await txt(p, '#w-left')),
    await txt(p, '#w-left'));
  ok('the offer is on it', (await has(p, '#b-buy-ps')) && (await has(p, '#b-buy-rtb')));
  ok('and it names the wait it would end', /every season back to back/.test(await txt(p, '#w-act')));
  ok('exactly one season was charged', p.calls.spend === 1, p.calls.spend);
  ok('no page errors', p.errs.length === 0, p.errs[0]);
  await p.close();
}

/* ── the hole a client side gate always has ──────────────────────────────────────── */
{
  /* THE SAVE HAS ALREADY MOVED ON when the wall appears: advance() rolls the year and
     writes it before the office is ever painted. So a reload arrives with world.year at
     2026 and nothing on screen, and if office() did not ask again it would simply play.
     This is the only assertion in the file that could not be made by reading the code. */
  const p = await open('a reload does not walk around the wall', { clock: () => LOCKED(3) });
  await job(p);
  await nextYear(p, 2026);
  await p.waitForTimeout(700);
  ok('the wall is up before the reload', await on(p, 's-wait'));
  await p.reload({ waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2600);
  /* The gate offers to resume, which is the door a reload actually comes back through. */
  const resume = await p.$('#g-resume');
  ok('the save offers to resume', !!resume);
  if (resume) { await resume.click(); await p.waitForTimeout(800); }
  ok('and it lands on the wall, not the office', await on(p, 's-wait'));
  ok('the office did not open', !(await on(p, 's-office')));
  ok('no page errors', p.errs.length === 0, p.errs[0]);
  await p.close();
}

/* ── the day passes ──────────────────────────────────────────────────────────────── */
{
  /* Locked on the first ask and open on the second, which is what a real clock does when
     somebody comes back tomorrow. */
  const p = await open('when the clock runs out the season opens',
    { clock: ({ n }) => (n <= 1 ? LOCKED(2) : FREE()) });
  await job(p);
  await nextYear(p, 2026);
  await p.waitForTimeout(700);
  ok('the wall is up', await on(p, 's-wait'));
  /* Tapping Back to the game and returning is the same thing office() does: ask again. */
  await p.evaluate(() => window.PS_CFB_COMMISH_TEST.repaint());
  await p.waitForTimeout(900);
  ok('the second ask lets them in', await on(p, 's-office'));
  ok('and two seasons were charged in total', p.calls.spend === 2, p.calls.spend);
  /* AND THE YEAR IS WRITTEN DOWN, so the next paint of the office is free. Without this a
     player who walks between the office and the map all year is charged for each trip. */
  await p.evaluate(() => window.PS_CFB_COMMISH_TEST.repaint());
  await p.waitForTimeout(500);
  ok('a third paint of the same year costs nothing', p.calls.spend === 2, p.calls.spend);
  ok('still in the office', await on(p, 's-office'));
  ok('no page errors', p.errs.length === 0, p.errs[0]);
  await p.close();
}

/* ── an account that paid ────────────────────────────────────────────────────────── */
{
  const p = await open('a paying account is never metered', {
    products: ['cfb_premium'],
    /* If the page asks at all this answers locked, so a pro account that leaked into the
       metered path would fail loudly here rather than quietly play on. */
    clock: () => LOCKED(9),
  });
  await job(p);
  await nextYear(p, 2026);
  await p.waitForTimeout(700);
  ok('the office opens on the next season', await on(p, 's-office'));
  ok('no wall', !(await on(p, 's-wait')));
  await nextYear(p, 2027);
  await p.waitForTimeout(500);
  await nextYear(p, 2028);
  await p.waitForTimeout(500);
  ok('and on every season after it', await on(p, 's-office'));
  /* NOT ONE REQUEST. isPro() answers before the transport is reached, so a paying player
     never waits on a network call to play the game they bought. */
  ok('the clock was never asked at all', p.calls.spend === 0 && p.calls.state === 0,
    'spend=' + p.calls.spend + ' state=' + p.calls.state);
  ok('no page errors', p.errs.length === 0, p.errs[0]);
  await p.close();
}

/* ── the offer on the wall is the one offer ──────────────────────────────────────── */
{
  const p = await open('the wall sells the same bundle as everywhere else',
    { clock: () => LOCKED(6) });
  await job(p);
  await nextYear(p, 2026);
  await p.waitForTimeout(700);
  await p.click('#b-buy-ps');
  await p.waitForTimeout(600);
  await p.click('#b-buy-rtb');
  await p.waitForTimeout(600);
  const posted = p.posted || [];
  ok('both buttons post to the one bundle endpoint', posted.length === 2, posted.length);
  ok('with the site wide bundle keys',
    posted.map((x) => x.bundle).join(',') === 'perfect-season,run-the-bundle',
    posted.map((x) => x.bundle).join(','));
  ok('and a return path back to the mode',
    posted.every((x) => x.return_path === '/cfb/commish/'),
    posted.map((x) => x.return_path).join(','));
  ok('no page errors', p.errs.length === 0, p.errs[0]);
  await p.close();
}

/* ── the countdown runs off the server's clock ───────────────────────────────────── */
{
  /* A DEVICE WITH THE WRONG DATE MUST NOT TALK ITSELF INTO A SEASON, and must not be told
     a wait is far longer than it is. The answer carries the server's own now, and the page
     draws the gap between the two deadlines rather than between the deadline and the
     device. Here the server is reported as three hours BEHIND this machine: a page reading
     its own clock would show two hours left, and the truth is five.
     THIS IS THE ASSERTION MOST LIKELY TO ROT, because it fails only if somebody deletes
     the skew line as redundant. It looks redundant. */
  const p = await open('the countdown is drawn through the clock skew', {
    clock: () => ({ ok: false, pro: false, locked: true,
      next_at: iso(2 * 3600000),
      now_at: new Date(Date.now() - 3 * 3600000).toISOString(), seasons: 1 }),
  });
  await job(p);
  await nextYear(p, 2026);
  await p.waitForTimeout(700);
  ok('it reads five hours, not two', /^[45]h /.test(await txt(p, '#w-left')),
    await txt(p, '#w-left'));
  ok('no page errors', p.errs.length === 0, p.errs[0]);
  await p.close();
}

/* ── the server cannot be reached ────────────────────────────────────────────────── */
{
  /* IT FAILS OPEN, and clock.js's header argues why at length. The short version is that
     the two mistakes cost different things: a wrongly granted season costs a fraction of
     one sale, and a wrongly refused one costs a player who was engaged enough to come
     back. This asserts the decision rather than discovering it. */
  const p = await open('an unreachable clock lets the season through',
    { clock: () => 'offline' });
  await job(p);
  await nextYear(p, 2026);
  await p.waitForTimeout(900);
  ok('the office opens', await on(p, 's-office'));
  ok('and no wall was left on screen', !(await on(p, 's-wait')));
  ok('no page errors', p.errs.length === 0, p.errs[0]);
  await p.close();
}

/* ── the contract, and what comes after it ───────────────────────────────────────────────
 *
 * A TERM USED TO BE FIVE SEASONS AND THEN THE MODE WAS OVER: "take the job again" built a
 * fresh 2025 and threw away the sport, which is the one thing this mode is about. A pro
 * account now signs an extension that KEEPS the sport, for a number of years the room
 * decides off the standing they finished on. A free account gets one contract.
 *
 * ending() is reached through the test hook rather than by playing five seasons, the same
 * way test_ending does it. */
/* ending() plays the last morning as a cutscene before it shows the screen, so a walk
   that goes straight to reading the button finds it behind a scene. Same skip every other
   suite here does. */
async function endTerm(p) {
  await p.evaluate(() => window.PS_CFB_COMMISH_TEST.ending());
  await p.waitForTimeout(400);
  for (let i = 0; i < 8; i++) {
    if (!(await on(p, 's-scene'))) break;
    await p.click('#b-scene-skip').catch(() => {});
    await p.waitForTimeout(320);
  }
  await p.waitForTimeout(300);
}

{
  const p = await open('a pro term ends in an extension, not a reset',
    { products: ['cfb_premium'], clock: () => LOCKED(9) });
  await job(p);
  /* Change the sport, so the renewal can be checked for keeping it rather than for
     merely continuing. A sixteen team playoff is the loudest single thing to move. */
  await p.evaluate(() => window.PS_CFB_COMMISH_TEST.plant('playoff-format', { option: 'expand-16' }));
  /* SERVE THE TERM, or the renewal starts on the same year it started on and the check
     below that the sport did not reset to 2025 proves nothing. Five seasons on. */
  await nextYear(p, 2030);
  await p.waitForTimeout(400);
  const before = await p.evaluate(() => {
    const w = window.PS_CFB_COMMISH_TEST.world();
    return { playoff: JSON.stringify(w.playoff), start: w.startYear, year: w.year };
  });
  await endTerm(p);
  await p.waitForTimeout(700);
  const label = await txt(p, '#b-year-next');
  ok('the offer is an extension', /Sign the extension/.test(label), label);
  ok('and it names a number of years', /\d+ more years/.test(label), label);
  await p.click('#b-year-next');
  await p.waitForTimeout(800);
  const after = await p.evaluate(() => {
    const w = window.PS_CFB_COMMISH_TEST.world();
    return { playoff: JSON.stringify(w.playoff), start: w.startYear, year: w.year,
      term: w.term, len: w.termSeasons, outcome: w.outcome, logged: w.careerLogged };
  });
  ok('it opens the office', await on(p, 's-office'));
  /* THE WHOLE POINT. The sport is the one you built, not a fresh 2025. */
  ok('the sport is kept', after.playoff === before.playoff, after.playoff);
  ok('and the year did not go back to 2025', after.year > 2025, String(after.year));
  ok('the new contract starts now', after.start === after.year,
    after.start + ' vs ' + after.year);
  ok('it is the second term', after.term === 2, String(after.term));
  ok('with a length of its own', after.len >= 3 && after.len <= 8, String(after.len));
  /* THE SHELF GUARD HAS TO BE RELEASED WITH THE CONTRACT, or every term after the first
     is missing from the career. */
  ok('and the career shelf can file the next one', !after.logged, String(after.logged));
  ok('no page errors', p.errs.length === 0, p.errs[0]);
  await p.close();
}

{
  /* THE LENGTH IS THE VERDICT ON THE LAST TERM. Standing is set by hand at both ends of
     the ladder, because the interesting claim is that the two differ. */
  const p = await open('the room decides how many years, off the standing',
    { products: ['cfb_premium'], clock: () => LOCKED(9) });
  await job(p);
  await p.evaluate(() => { window.PS_CFB_COMMISH_TEST.world().meters.standing = 95; });
  await endTerm(p);
  await p.waitForTimeout(600);
  const high = await txt(p, '#b-year-next');
  await p.close();

  const q = await open('  and a bad one gets a short leash',
    { products: ['cfb_premium'], clock: () => LOCKED(9) });
  await job(q);
  await q.evaluate(() => { window.PS_CFB_COMMISH_TEST.world().meters.standing = 5; });
  await endTerm(q);
  await q.waitForTimeout(600);
  const low = await txt(q, '#b-year-next');
  const yrs = (t) => Number((t.match(/(\d+) more years/) || [])[1] || 0);
  ok('a room that loves you signs a longer deal', yrs(high) > yrs(low),
    yrs(high) + ' vs ' + yrs(low));
  ok('and both are real contracts', yrs(low) >= 3 && yrs(high) <= 8,
    yrs(low) + '..' + yrs(high));
  /* AND THE NUMBER IS EXPLAINED, because "3 more years" and "8 more years" are the same
     button and opposite news. */
  ok('the room says which it is', /leash|watching/i.test(await txt(q, '#y-say')));
  ok('no page errors', q.errs.length === 0, q.errs[0]);
  await q.close();
}

{
  /* SACKED IS NOT RENEWED. The room voted you out, so there is nothing to extend, and the
     offer is somebody else's sport from the top. */
  const p = await open('a sacking is not an extension',
    { products: ['cfb_premium'], clock: () => LOCKED(9) });
  await job(p);
  await p.evaluate(() => {
    const w = window.PS_CFB_COMMISH_TEST.world();
    w.outcome = { removed: true, reason: 'voted', say: 'They voted you out.' };
  });
  await endTerm(p);
  await p.waitForTimeout(700);
  const label = await txt(p, '#b-year-next');
  ok('no extension is offered', !/extension/i.test(label), label);
  ok('a new job is', /another job/i.test(label), label);
  ok('no page errors', p.errs.length === 0, p.errs[0]);
  await p.close();
}

{
  /* THE FREE TIER IS ONE CONTRACT. The offer at the end is the continuation rather than
     a repeat: what Pro buys is that THIS sport keeps going. */
  const p = await open('a free career ends with the term', { clock: () => FREE() });
  await job(p);
  await endTerm(p);
  await p.waitForTimeout(700);
  const label = await txt(p, '#b-year-next');
  ok('there is no extension to sign', !/extension/i.test(label), label);
  ok('and no fresh term either', !/take the job|another job/i.test(label), label);
  ok('the offer is to keep this sport', /Go Pro and keep this sport/.test(label), label);
  await p.click('#b-year-next');
  await p.waitForTimeout(700);
  ok('it lands on the end of the career', await on(p, 's-wait'));
  ok('which says the free tier is one contract',
    /free tier is one contract/.test(await txt(p, '#w-say')), await txt(p, '#w-say'));
  /* NO COUNTDOWN HERE. There is no next season to wait for, and a clock ticking toward
     one would be a promise the tier does not keep. */
  ok('and shows no countdown', await p.$eval('#w-clock', (e) => e.hidden));
  ok('the offer is on it', (await has(p, '#b-buy-ps')) && (await has(p, '#b-buy-rtb')));
  ok('no page errors', p.errs.length === 0, p.errs[0]);
  await p.close();
}

{
  /* AND THE GATE HOLDS IT TOO, which is the other door. Come back tomorrow, or on another
     device, and the gate would otherwise hand out a fresh term. The clock answers terms:1
     from the first call here, standing in for an account that finished one yesterday. */
  const p = await open('the gate does not hand a capped account a second term',
    { clock: () => FREE(1) });
  await p.waitForTimeout(1200);
  ok('the career end screen takes over the gate', await on(p, 's-wait'));
  ok('and there is no way to take the job', !(await on(p, 's-gate')));
  ok('no page errors', p.errs.length === 0, p.errs[0]);
  await p.close();
}

{
  /* A TERM STILL RUNNING IS NOT CAPPED. Somebody halfway through their one contract has
     not used it up, and a gate that refused them would strand a save mid term. */
  const p = await open('a half played term is still resumable', { clock: () => FREE(1) });
  await job(p);
  await p.reload({ waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2600);
  ok('the gate offers to resume', !!(await p.$('#g-resume')));
  ok('and did not end the career', !(await on(p, 's-wait')));
  ok('no page errors', p.errs.length === 0, p.errs[0]);
  await p.close();
}

await b.close();
console.log(bad ? '\n' + bad + ' FAILED\n' : '\nall good\n');
process.exit(bad ? 1 : 0);
