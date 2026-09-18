/* THE DEV SWITCHES DO NOT LEAK TO A PLAYER.
 *
 *   (nohup python3 -m http.server 8080 &)
 *   node cfb/build/test/commish/test_devswitch.mjs
 *
 * ITS OWN FILE BECAUSE ITS SUBJECT IS THE READER, not a screen. Every other suite here
 * signs in as a tester, because a tester is who could reach the mode when they were
 * written. That is exactly the account these switches are FOR, so no amount of running
 * them could ever have shown one leaking. What is asserted here is the four other people:
 * a free player, a paying customer, a stranger typing a query string, and a tester, who
 * must each see a different thing.
 *
 * WHAT WENT WRONG, because the shape of it matters more than the strings:
 *
 * `?tier=free` and `?rulings=N` are author switches, and neither had a gate of its own.
 * Their gate was the DOOR: the mode sat behind the tester list, so "nobody else can reach
 * this page at all" was written next to both of them and was true. COMMISH_LIVE went true,
 * commishAllowed() started answering true for everybody, and that sentence became false
 * with nothing anywhere watching it. A guard that reads the right answer for the wrong
 * reason breaks silently the moment the reason changes, and this one broke into the most
 * visible place it could have: a line on the front screen of the mode reading "See what a
 * free player sees", under the button, to a free player. Reported by a player.
 *
 * The badge beside it had the same fault from the same cause and nobody had noticed that
 * one at all: it read `ownsCfb() ? 'Tester' : 'Free'`, which was one population while the
 * list was the only way in, so a customer who paid was shown the word Tester.
 *
 * SO THE ASSERTION IS ON THE READER AND NEVER ON THE DOOR. allowed() answers who may PLAY.
 * Who may drive the switches is a different question with a different answer, and the two
 * were one function for as long as the mode was shut.
 *
 * NOTHING HERE REACHES STRIPE. The checkout route is intercepted and answered with an
 * error, the way test_clock.mjs and test_store.mjs both do it, because Stripe is live and
 * a url in the answer would navigate a test to a real payment page.
 */
import { chromium } from 'playwright';

const HOST = process.env.HOST || 'http://localhost:8080';
const URL = HOST + '/cfb/commish/index.html';
const UID = '11111111-1111-1111-1111-111111111111';
const TESTER = 'devswitchtester';

let bad = 0;
const ok = (n, p, x) => { if (!p) bad++; console.log((p ? '  ok   ' : ' FAIL  ') + n + (x !== undefined ? '   ' + x : '')); };

/* The tester list, armed through the real array the page reads rather than by patching the
   page, so the gate under test is the real gate. Same trap as test_page and test_clock. */
const arm = `
(function(){ var v;
  Object.defineProperty(window,'PS_CFB_COMMISH_ACCESS',{configurable:true,
    get:function(){ return v; },
    set:function(a){ v=a; try{ a.TESTERS.push(${JSON.stringify(TESTER)}); }catch(e){} }});
})();`;

const stub = (products, name) => `
window.supabase={createClient(){
  const user={id:'${UID}',email:'c@e.com'};
  const session={access_token:'x',user};
  return {auth:{onAuthStateChange(cb){setTimeout(()=>cb('SIGNED_IN',session),0);return{data:{}}},
    getSession:()=>Promise.resolve({data:{session}}),
    signOut:()=>Promise.resolve({})},
    from(){return{select(){return{eq(){return{maybeSingle:()=>Promise.resolve(
      {data:{username:${JSON.stringify(name)}}})}}}}}},
    rpc:(fn)=>Promise.resolve(fn==='premium_products'
      ? {data:${JSON.stringify(products)},error:null}
      : {data:null,error:null})}}};`;

const b = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox'],
});

async function look(label, o) {
  const p = await b.newPage({ viewport: { width: 390, height: 900 } });
  p.errs = [];
  p.on('pageerror', (e) => p.errs.push(e.message));
  /* THE LIST IS ARMED ONLY FOR THE TESTER CASES. Everybody else meets the list as it ships,
     which is empty, and that is the whole point of the file. */
  if (o.tester) await p.addInitScript(arm);
  await p.addInitScript(stub(o.products || [], o.tester ? TESTER : 'someplayer'));
  await p.route('**/api/stripe/checkout-bundle', (r) =>
    r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"no"}' }));
  await p.goto(URL + (o.qs || ''), { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2500);
  console.log('\n=== ' + label + ' ===');
  return {
    p,
    errs: p.errs,
    txt: await p.$eval('#gate-act', (e) => e.innerText).catch(() => ''),
    tag: await p.$eval('#tag', (e) => e.textContent).catch(() => ''),
    hrefs: await p.$$eval('#gate-act a', (es) => es.map((e) => e.getAttribute('href') || '')),
    rulings: await p.evaluate(() => {
      const T = window.PS_CFB_COMMISH_TEST;
      return T && T.rulings ? T.rulings() : null;
    }),
  };
}

/* THE SAVE PROMISE IS ASSERTED IN EVERY CASE. The tester half used to be the second half of
   a sentence whose first half is a real thing a player needs to know, so the obvious way to
   delete the switch takes the promise with it. */
const keepsPromise = (r) => /saved to your account/i.test(r.txt);

{
  const r = await look('a free player, which is who reported it', {});
  ok('is offered no tour of the tier they are in',
    !/free player sees/i.test(r.txt), r.txt.slice(-90));
  ok('  and carries no ?tier=free link at all',
    !r.hrefs.some((h) => /tier=free/.test(h)), JSON.stringify(r.hrefs));
  ok('  the save promise is still there', keepsPromise(r));
  ok('  the badge says Free', r.tag === 'Free', r.tag);
  ok('  nothing threw', r.errs.length === 0, r.errs[0]);
}

{
  const r = await look('a paying customer', { products: ['cfb_premium'] });
  ok('is offered no dev switch', !/free player sees/i.test(r.txt), r.txt.slice(-90));
  /* THE WORD, not the exact badge, because any badge calling a buyer a tester is wrong
     however it is phrased. The positive assertion is the line under it. */
  ok('  is never called a tester', !/tester/i.test(r.tag), r.tag);
  ok('  what a buyer is, is Pro', r.tag === 'Pro', r.tag);
  ok('  the save promise is still there', keepsPromise(r));
  ok('  nothing threw', r.errs.length === 0, r.errs[0]);
}

{
  /* THE SWITCH IS REFUSED, NOT MERELY UNADVERTISED. Removing the link alone would leave the
     query string working for anybody who saw it once or was sent it. */
  const r = await look('a stranger typing ?tier=free', { products: ['cfb_premium'], qs: '?tier=free' });
  ok('does not get the free view of a mode they own', r.tag === 'Pro', r.tag);
  ok('  and is not told they are in one',
    !/looking at the free version/i.test(r.txt), r.txt.slice(-90));
  ok('  nothing threw', r.errs.length === 0, r.errs[0]);
}

{
  /* THE QUIET ONE. `?rulings=N` draws no link, so nothing on screen would ever have shown
     it leaking, and what it hands over is the council ladder, the one thing in the mode
     meant to be earned across terms. */
  const r = await look('a stranger typing ?rulings=400', { qs: '?rulings=400' });
  ok('cannot buy the council ladder with a query string',
    r.rulings === 0, String(r.rulings));
  ok('  nothing threw', r.errs.length === 0, r.errs[0]);
}

{
  const r = await look('a tester', { tester: true, products: ['cfb_premium'] });
  ok('still gets the switch, which is the point of keeping it',
    /free player sees/i.test(r.txt), r.txt.slice(-90));
  ok('  the badge says Tester', r.tag === 'Tester', r.tag);
  ok('  the save promise is still there', keepsPromise(r));
  ok('  nothing threw', r.errs.length === 0, r.errs[0]);
}

{
  const r = await look('a tester in the free view',
    { tester: true, products: ['cfb_premium'], qs: '?tier=free' });
  ok('is told which view they are in', /looking at the free version/i.test(r.txt), r.txt.slice(-90));
  ok('  and offered the way back', r.hrefs.some((h) => h === '?'), JSON.stringify(r.hrefs));
  ok('  the badge says so too', r.tag === 'Tester, free view', r.tag);
  ok('  nothing threw', r.errs.length === 0, r.errs[0]);
}

{
  const r = await look('a tester using ?rulings=400', { tester: true, qs: '?rulings=400' });
  ok('still gets the ladder they asked for', r.rulings === 400, String(r.rulings));
  ok('  nothing threw', r.errs.length === 0, r.errs[0]);
}

await b.close();
console.log(bad ? '\n' + bad + ' FAILURES' : '\nall clear');
process.exit(bad ? 1 : 0);
