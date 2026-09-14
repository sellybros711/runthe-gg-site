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
const LOCKED = (hrs) => ({ ok: false, pro: false, locked: true,
  next_at: iso(hrs * 3600000), now_at: new Date().toISOString(), seasons: 1 });
const FREE = () => ({ ok: true, pro: false, locked: true,
  next_at: iso(24 * 3600000), now_at: new Date().toISOString(), seasons: 1 });

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
  ok('and the clock was never asked', p.calls.spend === 0 && p.calls.state === 0,
    'spend=' + p.calls.spend + ' state=' + p.calls.state);
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

await b.close();
console.log(bad ? '\n' + bad + ' FAILED\n' : '\nall good\n');
process.exit(bad ? 1 : 0);
