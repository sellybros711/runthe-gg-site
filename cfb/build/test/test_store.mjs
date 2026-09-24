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
 *   signed in, no row     the Free pill, the upgrade card, and a store that names Commissioner
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
   IT NO LONGER DECIDES ANYTHING, because COMMISH_LIVE is true and commishOn() answers yes
   before it ever reads a name. It is kept because every walk below still runs it and taking
   it out would change what those walks are, for no gain: an account on the list and an
   account on no list are now the same account, which is what launching the mode means, and
   the one walk that cares proves it by passing `listed` false.
   The gate itself is unchanged: the offer card is drawn off the same commishOn() the front
   page door is, so neither can advertise what the other hides. Same trap as test_page. */
const TESTER = 'storetester';
const arm = `
(function(){ var v;
  Object.defineProperty(window,'PS_CFB_COMMISH_ACCESS',{configurable:true,
    get:function(){ return v; },
    set:function(a){ v=a; try{ a.TESTERS.push(${JSON.stringify('storetester')}); }catch(e){} }});
})();`;

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });

/* `listed` off skips the trap, so nothing is pushed onto the real tester list. That used to
   mean no access to Commissioner Simulator at all; since the launch flag turned it means an
   account that gets in without being named anywhere, which is every visitor. */
async function open(init, label, listed, clock) {
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  p.errs = [];
  p.on('pageerror', (e) => p.errs.push(e.message));
  /* THE FREE TIER'S CLOCK, WHICH THIS PAGE NOW READS. It is answered here rather than by a
     database because what is under test is what the page does with an answer, and the two
     answers worth having are awkward to arrange for real: a season spent an hour ago, and a
     free term already finished. Pass 'offline' to abort the request instead, which is the
     case that must not lock anybody out. */
  if (clock !== undefined) {
    await p.route('**/rest/v1/rpc/commish_clock_*', async (r) => {
      if (clock === 'offline') return r.abort();
      await r.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify([clock]) });
    });
  }
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
/* HOW MANY LINES THE ELEMENT ACTUALLY OCCUPIES, off its painted height rather than its
   text. The sell line has to be exactly two at every width: one is a desktop stretching it
   flat, three means a half wrapped and the card grew. */
const lineCount = (p, sel) => p.$eval(sel, (e) => {
  const lh = parseFloat(getComputedStyle(e).lineHeight);
  return Math.round(e.getBoundingClientRect().height / lh);
}).catch(() => 0);
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
  /* THE FRONT PAGE CARD IS GATED ON THE SAME ANSWER THE HUB CARD IS, and commishOn() needs
     an account: while COMMISH_LIVE is false only the tester list sees Commissioner Mode at
     all, so a signed out visitor would be sold a door that does not open for them. */
  ok('no offer card on the front page either', !(await has(p, '#b-premium')));
  await hub(p);
  ok('no upgrade card', !(await has(p, '#pf-prem')));
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
  /* ── THE FRONT PAGE CARRIES IT TOO, WHICH IT DID NOT ─────────────────────────────────
     The football game puts this card directly under its mode doors and this game put it
     two taps away, behind the avatar, on the profile hub. So the one screen every visitor
     to this game sees never mentioned that it has a paid tier, and the only ways to the
     offer were opening your own profile or being turned away somewhere. That is a quieter
     version of the wall the profile card was added to knock down.
     ASSERTED BEFORE THE HUB IS OPENED, because opening the hub is the thing that used to
     be required and the point is that it no longer is. */
  const home = await p.evaluate(() => {
    const el = document.getElementById('b-premium');
    if (!el) return { there: false };
    const ctas = document.querySelector('.ctas');
    const three = ctas && ctas.querySelector('.cta3');
    const door = document.getElementById('b-hp-commish');
    return { there: true,
      /* UNDER THE DOORS AND ABOVE THE ROW OF THREE, which is where the football page puts
         its own: after the thing people came for, before the things they came back for. */
      inCtas: !!(ctas && el.parentNode === ctas),
      aboveThree: !!(three && el.compareDocumentPosition(three)
        & Node.DOCUMENT_POSITION_FOLLOWING),
      belowDoor: !!(door && door.compareDocumentPosition(el)
        & Node.DOCUMENT_POSITION_FOLLOWING),
      title: (el.querySelector('.pwc-t b') || {}).textContent || '',
      sub: (el.querySelector('.pwc-t span') || {}).textContent || '',
      value: (el.querySelector('.pwc-go b') || {}).textContent || '',
      marks: el.querySelectorAll('.pwc-marks svg').length,
      /* ASKED OF THE PAGE, NOT PINNED. This was `=== 3` and that was right for exactly as
         long as the college page could not see Full Team at all. It loads the mode's own
         access file now, so the count is a question about the reader and the launch flag. */
      fullOn: (() => { const d = document.createElement('div');
        d.innerHTML = window.RTG_STORE.html({ signedOut: false });
        return d.querySelectorAll('.pw-tile').length; })() };
  });
  ok('the front page carries the offer card', home.there);
  ok('  in the doors, not in the nav or a sheet', home.inCtas === true);
  ok('  under the Commish door', home.belowDoor === true);
  ok('  and above the row of three', home.aboveThree === true);
  /* THE CARD CLAIMS WHAT THE SHEET CLAIMS, which is the rule that survives a launch. A
     pinned 3 said nothing about whether the two agreed; it only said what the answer was on
     the day it was written, and the day Full Team launched it failed while the page was
     right. */
  ok('  saying Unlimited over as many marks as the sheet has tiles',
    home.value === 'Unlimited' && home.marks === home.fullOn,
    home.value + ' / ' + home.marks + ' marks against ' + home.fullOn + ' tiles');
  await hub(p);
  /* ── AND BOTH CARDS SAY THE SAME SENTENCE ────────────────────────────────────────────
     THIS IS THE SECOND ROUND OF ONE FIX AND THAT IS WHY IT IS ASSERTED RATHER THAN READ.
     The markup moved into /assets/store.js so the cards could not drift, and the two
     STRINGS stayed as arguments each caller passed, so they drifted anyway: the football
     front page read "Unlock every mode" while both profile cards read "Unlock everything",
     about the same purchase, on the same day. The football page even carried a comment
     claiming "it says the same thing on all three" directly above the line that passed
     something else.
     cardInner() takes no words now, so this cannot fail without somebody deliberately
     re-adding a parameter, which is exactly the change worth failing on. */
  const hubCard = await p.evaluate(() => {
    const el = document.getElementById('pf-prem');
    return { title: (el.querySelector('.pwc-t b') || {}).textContent || '',
      sub: (el.querySelector('.pwc-t span') || {}).textContent || '' };
  });
  ok('  the front page and the hub say the same thing',
    home.title === hubCard.title && home.sub === hubCard.sub,
    JSON.stringify(home.title + ' / ' + home.sub) + '  vs  '
      + JSON.stringify(hubCard.title + ' / ' + hubCard.sub));
  /* AND IT IS THE SHEET'S OWN HEADING. A reader who presses this card lands on an <h2>,
     and a card that hands them a different name for the thing they just pressed makes them
     wonder whether they got the right screen. */
  const h2 = await p.evaluate(() => {
    const d = document.createElement('div');
    d.innerHTML = window.RTG_STORE.html({ signedOut: false });
    const h = d.querySelector('h2');
    return h ? h.textContent.trim() : '';
  });
  ok('  and it is the heading of the sheet it opens', hubCard.title === h2,
    JSON.stringify(hubCard.title) + ' vs ' + JSON.stringify(h2));
  ok('the Free pill is beside the name', (await txt(p, '.pfid .pw-pill')) === 'Free');
  ok('the upgrade card is on the hub', await has(p, '#pf-prem'));
  ok('and no receipt row, because there is nothing to receipt', !(await has(p, '#pf-go-pro')));
  /* THE SAME CARD THE FOOTBALL GAME DRAWS, out of the same function in /assets/store.js.
     It was written out a second time on this page and the two drifted: this said "3 modes"
     while the football front page said "4 modes", about the same purchase, on the same day.
     Asserted on the VALUE and the MARKS rather than the whole sentence, because those are
     the two halves that have to agree across three screens. */
  const card = await p.evaluate(() => {
    const el = document.getElementById('pf-prem');
    const m = el && el.querySelector('.pwc-marks');
    return { value: el ? (el.querySelector('.pwc-go b') || {}).textContent : '',
      marks: el ? el.querySelectorAll('.pwc-marks svg').length : 0,
      tiles: (() => { const d = document.createElement('div');
        d.innerHTML = window.RTG_STORE.html({ signedOut: false });
        return d.querySelectorAll('.pw-tile').length; })(),
      row: m ? getComputedStyle(m).display : 'none',
      counts: /\d+\s*modes/i.test((el && el.innerText) || '') };
  });
  ok('  it says Unlimited rather than counting', card.value === 'Unlimited' && !card.counts,
    card.value);
  /* THREE HERE AND NOT FOUR, and that is the gate working rather than a number left behind.
     Full Team joins the hero row and the marks for a reader who can open it.
     THIS PINNED THREE AND THE PIN WAS THE BUG. It was written when the college page did not
     load fullteam-access.js and never published RTG_FULLTEAM, so the store's fallback found
     no flag to read and dropped the mode: three was what this page could say rather than what
     it should say. The comment even predicted the launch would make it four "by way of that
     fallback", which was wrong in one word, because there was no flag here to fall back TO.
     The page loads the mode's own access file now, so the count follows the launch, and what
     is asserted is that the card and the sheet agree rather than what either of them says. */
  ok('  over as many modes as the sheet has tiles', card.marks === card.tiles,
    card.marks + ' marks against ' + card.tiles + ' tiles');
  ok('  in a row rather than a stack', card.row === 'flex', card.row);

  await p.click('#pf-prem');
  await p.waitForTimeout(600);
  const sheet = await txt(p, '#sheet-in');
  ok('the card opens the store', (await p.$eval('#sheet-in', (e) => e.dataset.kind)) === 'premium');
  /* THE ONE THING THE STORE HAS TO SAY ON THIS GAME'S PAGE. Somebody buying from the
     college side is buying Commissioner Mode, and a sheet that never names it is selling
     them the football game. */
  ok('the store names Commissioner', /Commissioner/.test(sheet));
  ok('both bundles are offered', (await has(p, '#b-buy-ps')) && (await has(p, '#b-buy-rtb')));
  /* ONE PAYMENT, ON EACH PRICE, which is where the anxiety it answers is actually felt.
     THIS WAS A HAZARD-STRIPED BAND WITH A BLINKING LAMP and the reasoning for that is worth
     keeping even though the band is gone: everything else sold this way is a subscription,
     and a reader who assumes this one is too is deciding against a monthly charge that does
     not exist. What it got wrong was the placement and the volume. It answered the question a
     full row above the first price, as the loudest thing on a screen already asking for
     money, and with four hero tiles above it the sheet read as a shout.
     SO THE ASSERTION MOVES RATHER THAN GOING. What has to hold is that BOTH prices carry it,
     because a reader comparing two numbers reads one of them, and that the sheet still says
     somewhere that nothing recurs. */
  const once = await p.evaluate(() => {
    const tiers = [...document.querySelectorAll('#sheet-in .pw-tier')];
    return tiers.map((t) => {
      const c = t.querySelector('.pw-cost .pw-once');
      return c ? (c.textContent || '').trim() : null;
    });
  });
  ok('every price says it is one payment', once.length === 2 && once.every((x) => /one payment/i.test(x || '')),
    JSON.stringify(once));
  ok('and the sheet still rules out a subscription', /no subscription/i.test(sheet),
    /no subscription/i.test(sheet) ? '' : sheet.slice(0, 120));
  /* AND THE BAND IS REALLY GONE rather than hidden, so nobody restores half of it later and
     leaves the sheet saying the same thing twice at two volumes. */
  ok('and the old band is not still there', !(await has(p, '#sheet-in .pw-alert')));
  /* AND IT NEVER CLAIMS A DEADLINE IT DOES NOT KEEP. Both bundles are permanent products at
     permanent prices, so an expiring-offer line would be the one claim on a payment screen
     that could not be defended. If a real window is ever wanted it needs an end date in
     _bundles.js and a store that stops selling at it; until then this is the guard. */
  ok('and promises no deadline the checkout does not keep',
    !/(offer ends|limited time|today only|ends soon|expires|hurry|last chance|act now)/i.test(sheet),
    sheet.slice(0, 120));
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

/* ── the door has to OPEN ─────────────────────────────────────────────────────────────────
 *
 * THIS SECTION USED TO ASSERT THE OPPOSITE AND IT SHIPPED A BUG. While Commissioner
 * Simulator was sold at the entrance, the card wore a gold Pro tag and a padlock and a
 * non-owner's tap was taken over and turned into the store. All of that was right then. The
 * free tier (supabase/104_commish_free_clock.sql) made every part of it false on the same
 * day, and nothing failed, because selling somebody a mode they already have access to
 * throws no error. What it produced was the report: a signed in free account tapped the
 * door, got the store, and read the whole mode as locked with no way in.
 *
 * So the thing to pin down is that the tap NAVIGATES. Copy can be argued about; a door that
 * refuses the tier it was opened for is the bug, and it is invisible in the markup.
 */
/* WAS THE ANCHOR ALLOWED TO DO ITS JOB. The page's own handler runs first, on the element;
   this listener bubbles to the document afterwards and reads whether that handler called
   preventDefault. It then stops the navigation itself, because the point is what the page
   decided rather than what the next page looks like. */
const TRAP = `
document.addEventListener('click',function(e){
  var a=e.target&&e.target.closest?e.target.closest('a'):null;
  if(!a) return;
  window.__nav={href:a.getAttribute('href'),prevented:e.defaultPrevented};
  e.preventDefault();
});`;
const tapped = (p) => p.evaluate(() => window.__nav || null);
{
  const p = await open(stub(true, [], []), 'a free account gets a door that opens');
  const door = await p.$('#b-hp-commish');
  ok('the door is drawn', !!door);
  /* NOT A PRICE TAG. Gold on this site means money, and the mode does not cost any to get
     into. Preview is what it reads before the launch flag turns. */
  ok('the badge is not the gold Pro one',
    !(await p.$eval('#b-hp-commish .hp-tag', (e) => e.classList.contains('pro')).catch(() => false)));
  ok('no padlock on the name', !(await has(p, '#b-hp-commish .hp-namerow .mc-pad')));
  /* THE SAME SENTENCE A BUYER READS. It used to open "Go Pro and", which was the verb that
     made a locked card say so in words. With the door open it would be asking for money in
     front of something already included. */
  ok('the line under the name is the promise, not a toll',
    (await txt(p, '#b-hp-commish .hp-sub')) === 'Leave your mark on College Football forever',
    await txt(p, '#b-hp-commish .hp-sub'));
  ok('and the front page never says Go Pro any more', !/Go Pro/.test(await txt(p, '#b-hp-commish')));
  /* SENTENCE CASE, because spaced caps at this size is the setting a sentence gets skimmed
     in, and this is the one line on the card somebody has to actually read. */
  ok('it is set to be read rather than skimmed',
    (await p.$eval('#b-hp-commish .hp-sub', (e) => getComputedStyle(e).textTransform)) === 'none');
  /* TWO LINES, WITH "College Football forever" AS THE SECOND ONE. Left to itself the line
     broke wherever it ran out of room, which on a phone put the word forever alone under a
     full line. A one word last line is a widow, and a widow made of the word the sentence
     turns on is the worst one available. The measure and the unbreakable tail are what stop
     it, and both are easy to undo by rewording either half, so this is measured off the
     PAINTED height at the widths a phone and a desk actually are. */
  ok('the tail is held together', await has(p, '#b-hp-commish .hp-sub .hp-nb'));
  ok('and it is the three words that must not split',
    (await txt(p, '#b-hp-commish .hp-sub .hp-nb')) === 'College Football forever');
  for (const w of [320, 390, 430, 1200]) {
    await p.setViewportSize({ width: w, height: 900 });
    await p.waitForTimeout(250);
    ok('  two lines at ' + w + 'px', (await lineCount(p, '#b-hp-commish .hp-sub')) === 2,
      (await lineCount(p, '#b-hp-commish .hp-sub')) + ' lines');
  }
  await p.setViewportSize({ width: 390, height: 844 });
  await p.waitForTimeout(250);
  /* NO FIGURE ON THE FRONT PAGE. A price quoted before anything has been offered is a cost
     the reader has to decide against with nothing on the other side of the scale, and it is
     a second copy of a number that lives in the store. */
  ok('and never quotes a price out here', !/\$/.test(await txt(p, '#b-hp-commish')));
  /* THE ONE THAT MATTERS. This is the assertion whose absence let the bug ship. */
  await p.evaluate(TRAP);
  await p.click('#b-hp-commish');
  await p.waitForTimeout(500);
  const nav = await tapped(p);
  ok('the tap is not taken over', !!nav && nav.prevented === false, JSON.stringify(nav));
  ok('and it is headed for the mode', !!nav && nav.href === '/cfb/commish/', nav && nav.href);
  ok('the store is never put in the way', (await p.$eval('#sheet-in', (e) => e.dataset.kind)) !== 'premium');
  ok('no page errors', p.errs.length === 0, p.errs[0]);
  await p.close();
}
{
  const p = await open(stub(true, ['cfb_premium'], BOUGHT), 'an owner reads exactly the same door');
  ok('the badge is not the gold one', !(await p.$eval('#b-hp-commish .hp-tag', (e) => e.classList.contains('pro')).catch(() => false)));
  ok('no padlock', !(await has(p, '#b-hp-commish .hp-namerow .mc-pad')));
  /* ONE CARD FOR BOTH TIERS, which is the plainest way to say the door is not the thing
     being sold. What Pro changes is the pace, and the mode itself is where that is said. */
  ok('the line is the same promise',
    (await txt(p, '#b-hp-commish .hp-sub')) === 'Leave your mark on College Football forever',
    await txt(p, '#b-hp-commish .hp-sub'));
  ok('and it never says Go Pro to somebody who has', !/Go Pro/.test(await txt(p, '#b-hp-commish')));
  for (const w of [320, 390, 1200]) {
    await p.setViewportSize({ width: w, height: 900 });
    await p.waitForTimeout(250);
    ok('  two lines at ' + w + 'px', (await lineCount(p, '#b-hp-commish .hp-sub')) === 2,
      (await lineCount(p, '#b-hp-commish .hp-sub')) + ' lines');
  }
  ok('the link still points at the mode',
    (await p.$eval('#b-hp-commish', (e) => e.getAttribute('href'))) === '/cfb/commish/');
  ok('no page errors', p.errs.length === 0, p.errs[0]);
  await p.close();
}
{
  /* THE MODES SHEET CARRIES THE SAME CARD and carried the same lock, so it gets the same
     two questions: does it open, and does the line under it describe the mode a free
     account is actually about to play. */
  const p = await open(stub(true, [], []), 'the modes sheet card opens too, and states the pace');
  await p.click('#b-modes');
  await p.waitForTimeout(700);
  ok('the sticker does not read Pro', (await txt(p, '#b-mc-commish .mc-sticker')) !== 'Pro',
    await txt(p, '#b-mc-commish .mc-sticker'));
  ok('the card is not marked pro', !(await p.$eval('#b-mc-commish', (e) => e.classList.contains('pro'))));
  ok('an arrow, not a padlock', (await has(p, '#b-mc-commish .mc-arrow')) && !(await has(p, '#b-mc-commish .mc-pad')));
  /* THE PACE FIRST, because that is what the reader is about to meet, and the offer second.
     The sheet is the one surface with room to say both, and it is the same sentence the
     wait wall inside the mode opens with. */
  ok('it says what free plays at',
    /^Free plays one season a day\./.test(await txt(p, '#b-mc-commish .mc-pro')),
    await txt(p, '#b-mc-commish .mc-pro'));
  /* THE PHRASE MOVED AND THIS IS WHAT CAUGHT IT. "Go pro" is what a PLAYER does in this
     sport, and this mode has a named doctrine rule called "Going pro and coming back", so
     the purchase sentence was using the game's own words for something that is not the game.
     Pinned on the new sentence, and the line below pins that the old verb is gone. */
  ok('and what Pro changes about it', /Unlock it to run the whole term at your own pace/.test(await txt(p, '#b-mc-commish .mc-pro')));
  ok('  without telling a player to go pro', !/go pro/i.test(await txt(p, '#b-mc-commish')));
  /* THE THING A READER OF THIS GAME CANNOT KNOW, which is that one payment covers both. */
  ok('and that the payment covers the NFL game too', /unlocks the NFL game too/.test(await txt(p, '#b-mc-commish .mc-pro')));
  /* DYNASTY'S NUMBER LIVES ON DYNASTY'S OWN SERVER AND ITS OWN SCREEN. A copy of it here is
     a copy that goes stale the next time somebody tunes it, and the two allowances differ on
     purpose. */
  ok('and it never quotes the other game\'s allowance', !/three seasons/i.test(await txt(p, '#b-mc-commish')));
  await p.evaluate(TRAP);
  await p.click('#b-mc-commish');
  await p.waitForTimeout(500);
  const nav = await tapped(p);
  ok('the tap is not taken over', !!nav && nav.prevented === false, JSON.stringify(nav));
  ok('and it is headed for the mode', !!nav && nav.href === '/cfb/commish/', nav && nav.href);
  ok('no page errors', p.errs.length === 0, p.errs[0]);
  await p.close();
}
{
  /* AN OWNER GETS NO LINE AT ALL. They are not being told about a pace they will never be
     held to, and they are not being sold what they have. */
  const p = await open(stub(true, ['cfb_premium'], BOUGHT), 'an owner is not pitched on the modes sheet');
  await p.click('#b-modes');
  await p.waitForTimeout(700);
  ok('the card is there', await has(p, '#b-mc-commish'));
  ok('and carries no pitch', !(await has(p, '#b-mc-commish .mc-pro')));
  ok('no page errors', p.errs.length === 0, p.errs[0]);
  await p.close();
}

/* ── an account on no list at all ───────────────────────────────────────────────────── */
{
  /* THE OFFER IS GATED ON THE DOOR, not just on ownership, and THE DAY THE FLAG FLIPPED IS
     THIS ONE. The note here used to say this card appears for everybody on the day
     COMMISH_LIVE turns, and these two assertions read the other way to prove it had not.
     It has, so they read this way.
     THE GATE ITSELF DID NOT CHANGE and is the reason the pair is still worth asserting: the
     one thing this card sells on this game is Commissioner Simulator, so it is drawn off
     the same commishOn() the front page door is. The fault it catches is the two coming
     apart in either direction. A card with no door behind it takes money for a shut door.
     A door with no card is a mode you can only find by being refused somewhere else.
     NOT ON THE TESTER LIST, which is the point of the third argument: this account is
     nobody in particular, and it gets in on the launch flag rather than on a name. */
  const p = await open(stub(true, [], []), 'on no list: the door and the offer are both there', false);
  await hub(p);
  ok('the front page door is drawn', await has(p, '#b-hp-commish'));
  ok('and so is the offer card', await has(p, '#pf-prem'));
  /* The pill still tells them what their account is, because that is true either way. */
  ok('the account still knows what tier it is', (await txt(p, '.pfid .pw-pill')) === 'Free');
  ok('no page errors', p.errs.length === 0, p.errs[0]);
  await p.close();
}

/* ── signed in, owns it ─────────────────────────────────────────────────────────────── */
{
  const p = await open(stub(true, ['ps_premium', 'cfb_premium', 'arcade_card_year', 'runtour_pack'], FULL),
    'an owner sees what they bought, and is not sold it again');
  /* AND THE FRONT PAGE IS CLEAN FOR A BUYER, which is the half that is easy to miss: the
     card is BUILT on an auth change and ownership lands after that, so without the repaint
     on the premium_products answer a customer would go on being offered what they own on
     the first screen of the game. */
  ok('no offer card on the front page for a buyer', !(await has(p, '#b-premium')));
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
  ok('and never says it did not', !/fail/i.test(t) && !/could(?:n't| not)/i.test(t));
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

/* ── the door that turns into the offer ─────────────────────────────────────────────── */
/*
 * THE CARD IS ALWAYS THERE AND THE TAP IS ONLY TAKEN WHEN THERE IS NOTHING TO OPEN.
 *
 * Both halves matter and they pull against each other, which is why they are asserted
 * together. Taking EVERY non-owner's tap is what this page used to do, and the bug report
 * was a signed in free account tapping the door, getting the store, and reading the whole
 * mode as locked with no way in. Taking NONE of them sends a player whose season is spent
 * through a page load to a wall they could have been shown at once.
 *
 * So the rule is the door's own state: shut means today's season is gone or the one free
 * term is finished, and only then does the tap become the offer. Everything else, including
 * an answer that never arrives, goes through and lets the mode decide. See blocked() in
 * cfb/commish/clock.js, which is where that rule is written once.
 */
{
  const iso = (ms) => new Date(Date.now() + ms).toISOString();
  const now = () => new Date().toISOString();
  const CAN   = { pro: false, locked: false, next_at: null, now_at: now(), seasons: 0, terms: 0 };
  const SPENT = { pro: false, locked: true, next_at: iso(5 * 3600000), now_at: now(), seasons: 1, terms: 0 };
  const DONE  = { pro: false, locked: false, next_at: null, now_at: now(), seasons: 5, terms: 1 };
  const PRO   = { pro: true, locked: false, next_at: null, now_at: now(), seasons: 0, terms: 0 };

  for (const [label, signedIn, products, clock, offer] of [
    ['signed out, the card is still there', false, [], CAN, false],
    ['a free season in hand goes to the mode', true, [], CAN, false],
    ['a season spent today opens the offer', true, [], SPENT, true],
    ['a finished free term opens the offer', true, [], DONE, true],
    ['an owner is never stopped', true, ['cfb_premium', 'ps_premium'], PRO, false],
    ['an unreachable clock lets them through', true, [], 'offline', false],
  ]) {
    const p = await open(stub(signedIn, products, signedIn ? BOUGHT : []), label, false, clock);
    const door = await p.$('#b-hp-commish');
    ok('the door is on the front page', !!door);
    if (door) {
      await door.click({ timeout: 5000 }).catch(() => {});
      await p.waitForTimeout(1100);
      /* NULL SAFE ON PURPOSE. Half these taps navigate, and /cfb/commish/ has no #sheet at
         all, so reading classList off it throws and takes the whole file down rather than
         failing one assertion. */
      const r = await p.evaluate(() => {
        const sh = document.getElementById('sheet');
        const inn = document.getElementById('sheet-in');
        return { path: location.pathname,
          sheet: !!(sh && sh.classList.contains('on')),
          kind: (inn && inn.dataset && inn.dataset.kind) || '' };
      });
      const sold = r.sheet && r.kind === 'premium';
      ok(offer ? '  the tap opens the bundle' : '  the tap goes through to the mode',
        offer ? sold : (!sold && /\/cfb\/commish\//.test(r.path)), r.path + (sold ? ' | store' : ''));
      /* AND THE PAGE IS STILL THE FRONT PAGE when the offer is drawn, because the whole
         point of taking the tap is not loading the mode to reach the same offer. */
      if (offer) ok('    without loading the mode', !/\/cfb\/commish\//.test(r.path), r.path);
    }
    ok('  no page errors', p.errs.length === 0, p.errs[0]);
    await p.close();
  }
}

await b.close();
console.log(bad ? '\n' + bad + ' FAILED\n' : '\nall good\n');
process.exit(bad ? 1 : 0);
