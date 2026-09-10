/* THE STORE AND THE RECEIPT, ON THE COLLEGE GAME'S OWN PAGE.
 *
 *   (nohup python3 -m http.server 8080 &)
 *   node cfb/build/test/test_store.mjs
 *
 * ONE BUNDLE, TWO GAMES, AND THE PAPERWORK REACHABLE FROM EITHER. A purchase made on the
 * football page unlocks Commissioner Mode here, and until this test existed there was no
 * way to see either half of that from the college side: no offer anywhere on this page,
 * and no receipt at all. The only store a visitor could find was the one behind the
 * Commissioner gate, which is a wall rather than an offer, and a wall is not something a
 * player who has never opened that mode will ever walk into.
 *
 * The four states, which are the whole test:
 *
 *   signed out            no pill, no offer card, nothing sold to a person with no account
 *   signed in, no row     the Free pill, the Go Pro card, and a store that names Commissioner
 *   signed in, owns it    the Pro pill, the Your Pro access row, and no offer
 *   owns a lapsed year    the receipt says ENDED and never "ends", in the past tense
 *
 * The last one is the one worth being careful about. premium_products() filters on expiry
 * so the modes behave, but this page reads the TABLE, because a receipt has to show what
 * was bought rather than what is still running. A lapsed Arcade year reading "Ends" in the
 * future tense is a receipt telling a customer they hold something they do not hold.
 *
 * NOTHING HERE TOUCHES A PAYMENT PATH. The buy buttons are checked for existing and for
 * carrying the two bundle keys the shared store emits; the checkout POST itself belongs to
 * functions/api/stripe/checkout-bundle.js and is not called.
 */
import { chromium } from 'playwright';
const HOST = process.env.HOST || 'http://localhost:8080';

let bad = 0;
const ok = (n, p, x) => { if (!p) bad++; console.log((p ? '  ok   ' : ' FAIL  ') + n + (x !== undefined ? '   ' + x : '')); };

const UID = '11111111-1111-1111-1111-111111111111';
const day = (n) => new Date(Date.now() + n * 86400000).toISOString();

/* The account, and what it has PAID for, which are two separate answers the page asks two
   separate ways: premium_products() through an RPC for the gates, and the premium_unlocks
   rows through a table read for the receipt. Both are stubbed, and they are allowed to
   disagree, because in life they can: an account comped by hand has products and no rows. */
const stub = (signedIn, products, unlocks) => `
window.supabase={createClient(){
  const user={id:'${UID}',email:'c@e.com'};
  const session=${signedIn}?{access_token:'x',user}:null;
  return {auth:{
    /* THE SESSION, NOT JUST THE USER. auth.js takes the second argument as the session and
       reads access_token off it, so a callback fired with {user} alone signs the account in
       with no token: every gate reads as a member and every POST reads as a stranger, which
       is the shape of a bug that only shows up on the buy button. */
    onAuthStateChange(cb){ ${signedIn ? "setTimeout(()=>cb('SIGNED_IN',session),0);" : ''} return {data:{}}; },
    getSession:()=>Promise.resolve({data:{session}}),
    signOut:()=>Promise.resolve({})},
    from(t){
      if(t==='premium_unlocks') return {select(){return{eq(){return{
        order:()=>Promise.resolve({data:${JSON.stringify(unlocks || [])},error:null})}}}}};
      return {select(){return{eq(){return{maybeSingle:()=>Promise.resolve(
        {data:${signedIn ? "{username:'"+TESTER+"'}" : 'null'}})}}}}};
    },
    rpc:(fn)=>Promise.resolve((fn==='premium_products'&&(window.__rpc=(window.__rpc||0)+1),fn==='premium_products')
      ? {data:${JSON.stringify(products || [])},error:null}
      : {data:null,error:null})}}};`;

const BOUGHT = [
  { product: 'ps_premium', source: 'perfect-season', granted_at: day(-30), expires_at: null, fulfilled_at: day(-30) },
  { product: 'cfb_premium', source: 'perfect-season', granted_at: day(-30), expires_at: null, fulfilled_at: day(-30) },
];
const FULL = BOUGHT.concat([
  { product: 'arcade_card_year', source: 'run-the-bundle', granted_at: day(-30), expires_at: day(335), fulfilled_at: day(-30) },
  { product: 'runtour_pack', source: 'run-the-bundle', granted_at: day(-30), expires_at: null, fulfilled_at: null },
]);
const LAPSED = BOUGHT.concat([
  { product: 'arcade_card_year', source: 'run-the-bundle', granted_at: day(-400), expires_at: day(-35), fulfilled_at: day(-400) },
]);

/* PUT A NAME ON THE REAL TESTER LIST, by trapping the assignment commish/access.js makes.
   The offer card is gated on commishOn(), the same call the front page door makes: while
   the launch flag is false only the list can see Commissioner Simulator, and selling that
   mode to somebody who would still find nothing after paying is selling a shut door. So a
   walk that expects to see the offer has to be on the list, and it gets there through the
   real array rather than by patching the page. Same trap, same reasoning, as test_page. */
const TESTER = 'storetester';
const arm = `
(function(){ var v;
  Object.defineProperty(window,'PS_CFB_COMMISH_ACCESS',{configurable:true,
    get:function(){ return v; },
    set:function(a){ v=a; try{ a.TESTERS.push(${JSON.stringify('storetester')}); }catch(e){} }});
})();`;

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });

/* `listed` off is an account with no access to Commissioner Simulator at all: no trap, so
   nothing is pushed onto the real tester list and commishOn() answers false. */
async function open(init, label, listed) {
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  p.errs = [];
  p.on('pageerror', (e) => p.errs.push(e.message));
  if (listed !== false) await p.addInitScript(arm);
  await p.addInitScript(init);
  await p.goto(HOST + '/cfb/index.html', { waitUntil: 'domcontentloaded', timeout: 40000 });
  await p.waitForTimeout(3200);
  console.log('\n=== ' + label + ' ===');
  return p;
}
/* THE HUB IS OPENED THE WAY A PLAYER OPENS IT, through the avatar in the header. Not by
   calling openProfile() from evaluate(): the page declares everything with top level `let`
   in a classic script, which puts it in the global lexical environment rather than on
   window, and none of it is reachable by name from a test. Every browser suite in this
   directory drives the DOM for the same reason. */
async function hub(p) {
  await p.click('#b-profile');
  await p.waitForTimeout(900);
}
const txt = (p, sel) => p.$eval(sel, (e) => (e.textContent || '').replace(/\s+/g, ' ').trim()).catch(() => '');
const has = (p, sel) => p.$(sel).then((e) => !!e);

/* ── the stylesheet, which is the bug that made this file worth writing ──────────────────
   store.js styles more than the offer: the Pro pill beside an account name and every line
   of the receipt come out of the same block. It used to inject that block lazily, on the
   first call to html() or art(), and game() never injected anything. So an OWNER was
   exactly the visitor who could reach the receipt without the CSS, because an owner is
   never shown the pitch card that would have warmed it. Four unstyled paragraphs, nothing
   thrown, nothing to report. It injects at load now, and this is what says so. */
{
  const p = await open(stub(true, ['cfb_premium'], BOUGHT), 'the store stylesheet is there before anything asks for it');
  const s = await p.evaluate(() => {
    const el = document.getElementById('rtg-store-css');
    return { there: !!el, line: !!(el && el.textContent.indexOf('.pw-line') >= 0),
      pill: !!(el && el.textContent.indexOf('.pw-pill') >= 0) };
  });
  ok('the store module loaded', await p.evaluate(() => !!window.RTG_STORE));
  ok('its stylesheet is in the document', s.there);
  ok('and carries the receipt rules', s.line && s.pill);
  /* Measured rather than assumed present: a rule that exists and matches nothing is the
     same as no rule, and .pw-pill is the one a specificity fight was already lost over. */
  await hub(p);
  const pill = await p.evaluate(() => {
    const el = document.querySelector('.pfid .pw-pill');
    if (!el) return null;
    const c = getComputedStyle(el);
    return { display: c.display, radius: c.borderTopLeftRadius };
  });
  ok('the pill is styled, not inheriting display:block from the line under the name',
    !!pill && pill.display === 'inline-block', pill && pill.display);
  ok('no page errors', p.errs.length === 0, p.errs[0]);
  await p.close();
}

/* ── signed out ─────────────────────────────────────────────────────────────────────── */
{
  const p = await open(stub(false, [], []), 'signed out: nothing is sold and no status is claimed');
  await hub(p);
  ok('no Go Pro card', !(await has(p, '#pf-prem')));
  ok('no Pro access row', !(await has(p, '#pf-go-pro')));
  /* NOT "FREE". A free account is a thing somebody has, and a visitor with no account has
     nothing to show a status for. */
  ok('no tier pill anywhere', !(await has(p, '.pw-pill')));
  ok('no page errors', p.errs.length === 0, p.errs[0]);
  await p.close();
}

/* ── signed in, bought nothing ──────────────────────────────────────────────────────── */
{
  const p = await open(stub(true, [], []), 'signed in without the row: the offer is reachable');
  await hub(p);
  ok('the Free pill is beside the name', (await txt(p, '.pfid .pw-pill')) === 'Free');
  ok('the Go Pro card is on the hub', await has(p, '#pf-prem'));
  ok('and no receipt row, because there is nothing to receipt', !(await has(p, '#pf-go-pro')));

  await p.click('#pf-prem');
  await p.waitForTimeout(600);
  const sheet = await txt(p, '#sheet-in');
  ok('the card opens the store', (await p.$eval('#sheet-in', (e) => e.dataset.kind)) === 'premium');
  /* THE ONE THING THE STORE HAS TO SAY ON THIS GAME'S PAGE. Somebody buying from the
     college side is buying Commissioner Mode, and a sheet that never names it is selling
     them the football game. */
  ok('the store names Commissioner', /Commissioner/.test(sheet));
  ok('both bundles are offered', (await has(p, '#b-buy-ps')) && (await has(p, '#b-buy-rtb')));
  ok('and both prices are on it', /\$19\.99/.test(sheet) && /\$34\.99/.test(sheet));
  /* ONE STORE, NOT A STORE PER GAME, AND ONE PAYMENT PATH. The buttons post the same two
     bundle keys the football page posts, to the same endpoint, so both land on the same two
     Stripe products. The request is intercepted here rather than allowed out: this test
     must never reach live Stripe, and the endpoint's own contract is that the verdict is
     the `error` field and never the status. Answering with one proves the button reads it. */
  const posted = [];
  await p.route('**/api/stripe/checkout-bundle', async (route) => {
    let body = {};
    try { body = JSON.parse(route.request().postData() || '{}'); } catch (e) {}
    posted.push(body);
    await route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ error: 'stripe_not_configured' }) });
  });
  await p.click('#b-buy-ps');
  await p.waitForTimeout(700);
  await p.click('#b-buy-rtb');
  await p.waitForTimeout(700);
  ok('both buttons post to the one bundle endpoint', posted.length === 2, posted.length);
  ok('with the site-wide bundle keys',
    posted.map((x) => x.bundle).join(',') === 'perfect-season,run-the-bundle',
    posted.map((x) => x.bundle).join(','));
  /* THE WALK BACK LANDS ON THIS GAME. A buyer who paid from the college page and is
     returned to the football one reads as having bought the wrong thing. */
  ok('and a return path back to this game',
    posted.every((x) => x.return_path === '/cfb/'), posted.map((x) => x.return_path).join(','));
  ok('a refusal lands on the button that was pressed',
    (await txt(p, '#b-buy-rtb')) === 'Not on sale yet', await txt(p, '#b-buy-rtb'));
  ok('no page errors', p.errs.length === 0, p.errs[0]);
  await p.close();
}

/* ── an account the mode is not open to ─────────────────────────────────────────────── */
{
  /* THE OFFER IS GATED ON THE DOOR, not just on ownership. While the launch flag is false
     Commissioner Simulator is visible to the tester list alone, and the one thing this card
     sells on this game is that mode: showing it to somebody who would still find nothing
     after paying is selling a shut door. It appears for everybody on the day the flag
     flips, out of the same commishOn() the front page door reads. */
  const p = await open(stub(true, [], []), 'off the tester list: no offer, because the mode is not there to sell', false);
  await hub(p);
  ok('the front page door is not drawn', !(await has(p, '#b-hp-commish')));
  ok('and neither is the offer card', !(await has(p, '#pf-prem')));
  /* The pill still tells them what their account is, because that is true either way. */
  ok('the account still knows what tier it is', (await txt(p, '.pfid .pw-pill')) === 'Free');
  ok('no page errors', p.errs.length === 0, p.errs[0]);
  await p.close();
}

/* ── signed in, owns it ─────────────────────────────────────────────────────────────── */
{
  const p = await open(stub(true, ['ps_premium', 'cfb_premium', 'arcade_card_year', 'runtour_pack'], FULL),
    'an owner sees what they bought, and is not sold it again');
  await hub(p);
  ok('the Pro pill is beside the name', (await txt(p, '.pfid .pw-pill')) === 'Pro');
  ok('the Pro access row is on the hub', await has(p, '#pf-go-pro'));
  ok('and the offer card is gone', !(await has(p, '#pf-prem')));

  await p.click('#pf-go-pro');
  await p.waitForTimeout(900);
  const r = await txt(p, '#pf-pro-list');
  ok('all four lines are on the receipt', (await p.$$('#pf-pro-list .pw-line')).length === 4,
    (await p.$$('#pf-pro-list .pw-line')).length);
  ok('the college game is named in full', /College Football/.test(r));
  ok('Commissioner Mode is itemised', /Commissioner Mode/.test(r));
  /* THE ONE THING A ONE-OFF PAYMENT HAS TO SAY OUT LOUD. An end date on a page with no
     such sentence looks exactly like a subscription about to bill, and a customer who
     thinks they are on a recurring charge cancels the account to stop it. */
  ok('it says nothing renews', /Nothing here renews/.test(r));
  ok('and gives the Arcade year an end date', /Arcade Card year simply ends on/.test(r));
  /* NOT EVERYTHING IN A BUNDLE ARRIVES AT ONCE. The Tour coins are credited by the golf
     backend, so an unstamped row is a promise rather than a thing the player has. */
  ok('the unfulfilled item says it is on the way', /On its way to your account/.test(r));
  ok('the billing button is there', await has(p, '#pf-bill'));
  ok('no page errors', p.errs.length === 0, p.errs[0]);
  await p.close();
}

/* ── an Arcade year that has run out ────────────────────────────────────────────────── */
{
  const p = await open(stub(true, ['ps_premium', 'cfb_premium'], LAPSED),
    'a lapsed Arcade year is reported in the past tense');
  await hub(p);
  await p.click('#pf-go-pro');
  await p.waitForTimeout(900);
  const r = await txt(p, '#pf-pro-list');
  ok('the lapsed line is shown rather than hidden', /Arcade Card, one year/.test(r));
  ok('it reads Ended', /Ended /.test(r));
  ok('and never claims a future end date', !/Ends /.test(r) && !/simply ends on/.test(r));
  ok('the line is marked ended', (await p.$$('#pf-pro-list .pw-line.ended')).length === 1);
  ok('no page errors', p.errs.length === 0, p.errs[0]);
  await p.close();
}

/* ── the walk back from Stripe ───────────────────────────────────────────────────────────
 *
 * checkout-bundle.js returns the buyer to /cfb/?checkout=success, and until this page read
 * that parameter the most important screen in the flow was the front page exactly as they
 * left it: no acknowledgement, no receipt, and the mode they had just paid for still shut.
 *
 * THE GRANT IS NOT DONE WHEN THE BROWSER ARRIVES. It is written by the Stripe webhook and
 * the redirect races it, so both outcomes are checked: the webhook that won, and the one
 * that has not landed yet.
 */
{
  const p = await open(stub(true, ['ps_premium', 'cfb_premium'], BOUGHT), 'coming back from Stripe, grant already written');
  await p.goto(HOST + '/cfb/index.html?checkout=success', { waitUntil: 'domcontentloaded', timeout: 40000 });
  await p.waitForTimeout(3200);
  ok('the sheet is open on the thank you', (await p.$eval('#sheet-in', (e) => e.dataset.kind)) === 'thanks');
  const t = await txt(p, '#sheet-in');
  ok('it says the account is Pro', /You are Pro/.test(t));
  ok('and offers the door that was just bought', await has(p, '#th-go'));
  ok('which goes to the mode',
    (await p.$eval('#th-go', (e) => e.getAttribute('href'))) === '/cfb/commish/');
  /* STRIPPED, so a reload cannot replay it and a shared link cannot carry a thank you to
     somebody who bought nothing. */
  ok('the parameter is off the URL', !/checkout=/.test(p.url()), p.url());
  ok('no page errors', p.errs.length === 0, p.errs[0]);
  await p.close();
}
{
  const p = await open(stub(true, [], []), 'coming back from Stripe, webhook still in flight');
  await p.goto(HOST + '/cfb/index.html?checkout=success', { waitUntil: 'domcontentloaded', timeout: 40000 });
  await p.waitForTimeout(3200);
  const t = await txt(p, '#sheet-in');
  /* IT NEVER SAYS THE PAYMENT FAILED, because this page cannot know that. */
  ok('it says the payment went through', /payment went through/.test(t));
  ok('and never says it did not', !/fail/i.test(t) && !/could not/i.test(t));
  ok('no door is offered for a mode that is still shut', !(await has(p, '#th-go')));
  /* AND IT KEEPS ASKING, forcing past auth.js's cache each time: a cached [] is precisely
     the answer that makes a landed purchase look like a missing one. One ask would be the
     bug this polling exists to prevent, so the count is what says it is really polling. */
  await p.waitForTimeout(9000);
  const calls = await p.evaluate(() => window.__rpc || 0);
  ok('it asks the server again and again rather than once', calls >= 4, calls + ' calls');
  ok('no page errors', p.errs.length === 0, p.errs[0]);
  await p.close();
}

/* A CANCELLED CHECKOUT GETS NO SCREEN, and its parameter still comes off the URL. Somebody
   pressed back on a payment form, which is a thing people do; being chased about it is how
   a store gets closed. Stripe returns them here the same way it returns a buyer. */
{
  const p = await open(stub(true, [], []), 'a cancelled checkout is not an event');
  await p.goto(HOST + '/cfb/index.html?checkout=cancelled', { waitUntil: 'domcontentloaded', timeout: 40000 });
  await p.waitForTimeout(3200);
  ok('no sheet is opened', !(await p.$eval('#sheet', (e) => e.classList.contains('on')).catch(() => false)));
  ok('the parameter is off the URL', !/checkout=/.test(p.url()), p.url());
  ok('no page errors', p.errs.length === 0, p.errs[0]);
  await p.close();
}

await b.close();
console.log(bad ? '\n' + bad + ' FAILED\n' : '\nall good\n');
process.exit(bad ? 1 : 0);
