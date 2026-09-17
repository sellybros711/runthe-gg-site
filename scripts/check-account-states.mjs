/* EVERY ACCOUNT STATE BOOTS, AND HAS A WAY IN.
 *
 *   (nohup python3 -m http.server 8080 &)
 *   node scripts/check-account-states.mjs
 *
 * ONE QUESTION, ASKED OF BOTH GAMES NINE TIMES. Does the page start, does it throw, and is
 * there something on it a person could press. Nothing here tests a rule: check-premium owns
 * the meter, test_store owns the offer, test_clock owns the free season. This owns the
 * dumbest failure there is, which is the page not coming up at all for one kind of visitor.
 *
 * WHY THAT NEEDS ITS OWN FILE. A boot crash in ONE account state has already shipped here.
 * Moving the store out of football/index.html left pwArt('star') behind on the home prompt
 * card, which only a tester was shown, so "pwArt is not defined" threw during boot and took
 * the game to the loading screen for exactly those accounts and nobody else. The store had
 * been verified. Every suite was green. The state nobody opened was the broken one.
 *
 * So the states are enumerated rather than sampled, and the awkward three are the point:
 *
 *   accounts offline             window.supabase never arrives, which is an ad blocker
 *   premium call errors          the RPC comes back with an error rather than an array
 *   premium call never answers   it never comes back at all, so premiumSet stays null
 *
 * Those three are where a page decides what to do with no answer, and the honest answer is
 * always the same: show the game. A page that waits forever for a database it cannot reach
 * is a page that is down, for somebody whose only crime is running uBlock.
 *
 * IT ASSERTS PRESENCE AND NOT BEHAVIOUR, on purpose. Pressing a door and following it into a
 * draft depends on a meter answer landing before the click, and a check that races is a check
 * that goes red on its own and gets ignored. The suites named above press those doors from a
 * state they control. This one stays deterministic so that a red run here means something.
 *
 * THE CONTROL IDS BELOW ARE A LIST AND LISTS GO STALE, which is the one way this file can
 * lie. It reports "NOTHING" when no id in its list is visible, and a renamed button looks
 * exactly like a page that came up empty. Writing it caught me twice: the college game's
 * play button is b-play-intro on the intro screen and not b-play, and the football game's
 * are b-start-off and b-start-def rather than b-start. So a red run here is worth one look
 * at the page before it is believed, and the failure prints what it DID find so that look
 * is short. The alternative, matching any button at all, passes on a page whose only
 * control is the cookie banner.
 *
 * NOTHING REACHES THE NETWORK. Supabase is stubbed per state and the pages are served off
 * the local http.server; no Stripe route is touched, because nothing here presses a button.
 */
import * as pw from 'playwright';

const HOST = process.env.HOST || 'http://localhost:8080';
const CHROME = process.env.PS_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const UID = '11111111-1111-1111-1111-111111111111';

let bad = 0;
const ok = (n, p, x) => { if (!p) bad++; console.log((p ? '  ok   ' : ' FAIL  ') + n + (x !== undefined ? '   ' + x : '')); };

/* window.supabase, shaped per state. `rpc` is what premium_products() gets back: an array,
   an error, or a promise that never settles. The last one is not exotic: it is every request
   that goes out on a train and comes back after the tunnel. */
const stub = (s) => {
  if (s.offline) return 'window.supabase=undefined;';
  const rpc = s.rpcHang ? 'new Promise(()=>{})'
    : s.rpcError ? "Promise.resolve({data:null,error:{message:'boom'}})"
    : `Promise.resolve({data:${JSON.stringify(s.products || [])},error:null})`;
  return `window.supabase={createClient(){
    const user={id:'${UID}',email:'c@e.com'};
    const session=${s.signedIn ? '{access_token:"x",user}' : 'null'};
    return {auth:{
      onAuthStateChange(cb){ ${s.signedIn ? 'setTimeout(()=>cb("SIGNED_IN",session),0);' : ''} return {data:{}}; },
      getSession:()=>Promise.resolve({data:{session}}),
      signOut:()=>Promise.resolve({})},
      from(t){
        if(t==='premium_unlocks') return {select(){return{eq(){return{
          order:()=>Promise.resolve({data:[],error:null})}}}}};
        return {select(){return{eq(){return{maybeSingle:()=>Promise.resolve(
          {data:${s.username ? "{username:'" + s.username + "'}" : 'null'}})}}}}};
      },
      rpc:(fn)=> fn==='premium_products' ? ${rpc} : Promise.resolve({data:null,error:null})
    };}};`;
};

const STATES = [
  ['signed out',                 {}],
  ['signed in, no username',     { signedIn: true }],
  ['free, no purchase',          { signedIn: true, username: 'someone' }],
  ['owns the Premium Bundle',    { signedIn: true, username: 'someone',
                                   products: ['ps_premium', 'cfb_premium'] }],
  ['owns Run The Bundle',        { signedIn: true, username: 'someone',
                                   products: ['ps_premium', 'cfb_premium', 'arcade_card_year', 'runtour_pack'] }],
  ['accounts offline',           { offline: true }],
  ['premium call errors',        { signedIn: true, username: 'someone', rpcError: true }],
  ['premium call never answers', { signedIn: true, username: 'someone', rpcHang: true }],
];

const browser = await pw.chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });

async function open(url, state) {
  const p = await browser.newPage({ viewport: { width: 390, height: 900 } });
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e).slice(0, 150)));
  await p.addInitScript(stub(state));
  await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 40000 });
  await p.waitForTimeout(5200);
  /* The first visit card sits over the doors by design. A visitor dismisses it; a check that
     does not is measuring the overlay rather than the screen underneath it. */
  await p.click('#frg-x', { timeout: 2500 }).catch(() => {});
  await p.waitForTimeout(400);
  return { p, errs };
}
/* Visible means a person can see it: in the document, painted, and not hidden. A door that
   exists as a node and renders at zero by zero is not a door. */
const PROBE = (ids) => `(()=>{ const vis=(e)=>{ if(!e) return false;
    const b=e.getBoundingClientRect();
    return b.width>0&&b.height>0&&getComputedStyle(e).visibility!=='hidden'; };
  return { screen:(document.querySelector('.screen.on')||{}).id||'',
    ways:${JSON.stringify(ids)}.filter((i)=>vis(document.getElementById(i))) }; })()`;

console.log('\n=============== THE PERFECT SEASON ===============');
for (const [label, state] of STATES) {
  const { p, errs } = await open(HOST + '/football/index.html', state);
  const r = await p.evaluate(PROBE(['b-start', 'b-start-off', 'b-start-def', 'b-start-dyn', 'b-start-full', 'b-modes']));
  console.log('\n=== ' + label + ' ===');
  ok('the page is up', !!r.screen, r.screen || 'no screen is on');
  ok('  nothing threw', errs.length === 0, errs.join(' | ') || 'no errors');
  ok('  and there is something to press', r.ways.length > 0, r.ways.join(', ') || 'NOTHING');
  await p.close();
}

console.log('\n=============== PERFECT SEASON: COLLEGE FOOTBALL ===============');
for (const [label, state] of STATES) {
  const { p, errs } = await open(HOST + '/cfb/index.html', state);
  const r = await p.evaluate(PROBE(['b-play-intro', 'b-play', 'b-modes', 'b-hp-commish']));
  console.log('\n=== ' + label + ' ===');
  ok('the page is up', !!r.screen, r.screen || 'no screen is on');
  ok('  nothing threw', errs.length === 0, errs.join(' | ') || 'no errors');
  ok('  and there is something to press', r.ways.length > 0, r.ways.join(', ') || 'NOTHING');
  await p.close();
}

await browser.close();
console.log('');
console.log(bad ? bad + ' FAILED' : 'every account state boots both games with a way in');
process.exit(bad ? 1 : 0);
