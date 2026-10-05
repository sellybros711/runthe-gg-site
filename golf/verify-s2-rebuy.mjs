/* A Season 1 Tour Pass buyer, on Season 2's first week, buying again.
 *
 *   (nohup python3 -m http.server 8099 &)
 *   node golf/verify-s2-rebuy.mjs
 *
 * Nobody on the team bought the Season 1 pass (the test accounts are dev accounts, which get Pro free and
 * never see a buy button), so this plays one. The wallet is stood in for exactly as runtour_wallet answers
 * it: pass_active false and the last period bought, then pass_active true and 'S2' once the webhook lands.
 *
 *   PROMPT     the Season 2 launch popup offers the track, and the track and the store both sell the pass
 *   CHECKOUT   every buy button posts package 'tourpass' to create-checkout, and nothing else
 *   SEASON 1   the Pro lane they paid for is still settled, and the Season 2 track is not Pro
 *   RETURN     back from Stripe the pass lands: Pro, the thank-you screen, 2 seasonal packs, once
 *
 * What it CANNOT see is the server: create-checkout and the webhook are Supabase edge functions that are
 * not in this repo, and the sandbox cannot reach Supabase. That half is checked with SQL (see the README
 * note printed at the end).
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const HOST = process.env.HOST || 'http://localhost:8099';
const SRC = ROOT + '/golf/index.html';
const PROBE = ROOT + '/golf/__test_rebuy.html';

let bad = 0;
const ok = (n, p, x) => { if (!p) bad++;
  console.log((p ? '  ok   ' : ' FAIL  ') + n + (x !== undefined ? '   ' + JSON.stringify(x).slice(0, 240) : '')); };
const head = (t) => console.log('\n' + t + '\n' + '-'.repeat(t.length));

const HOOK = `
window.__R = {
  invoked: [],
  wallet: null,
  rig(period){ var R=this;
    sbUser={id:'s1-buyer', email:'buyer@example.com'};
    var never=function(){ return {then:function(){ return this; }, catch:function(){ return this; }}; };
    sb={ from:function(){ return {select:function(){ return {eq:function(){ return {limit:never, order:function(){ return {limit:never}; }}; }, order:function(){ return {limit:never}; }, limit:never}; }}; },
      rpc:function(name){ if(name==='runtour_wallet') return Promise.resolve({error:null, data:[R.wallet]}); return never(); },
      functions:{ invoke:function(fn, opts){ R.invoked.push({fn:fn, body:opts&&opts.body}); return never(); } } };
    try{ cloudPush=function(){}; }catch(e){}
    try{ localStorage.clear(); localStorage.setItem('bag_tour_done','true'); }catch(e){}
    // what a Season 1 buyer's device holds: the pass packs claimed for S1, and the S1 track marked Pro
    LS.set(acctKey('bag_pass'), {claimed:'S1'});
    LS.set(acctKey('bag_tourpass'), {season:1, xp:passXpForTier(25), pro:true, curveV:PASS_CURVE_V, claimed:{free:[1,2,3],prem:[1,2,3]}});
    R.wallet={paid_coins:0, lifetime_purchased:1499, lifetime_granted:0, daily_tokens:0, pass_active:false, pass_period:period};
    _walletCache=null; S.overlay=null; S.screen='title';
    return new Promise(function(res){ loadWallet(function(){ res(_walletCache); }); }); },
  state(){ var s=passState();
    return {season:passSeason().n, active:dailyPassActive(), pro:passProActive(), trackPro:!!s.pro, trackProS:s.proS||'',
      card:tourPassCard().textContent.replace(/\\s+/g,' ').trim()}; },
  settle(){ var st=passArchive()['1']; var p=passSettle(); var led=passSettled()['1']||{free:[],prem:[]};
    return {archivedPro:!!(st&&st.pro), paid:(p['1']||[]).length, free:led.free.length, prem:led.prem.length}; },
  launch(){ try{ localStorage.removeItem(seasonLaunchKey(passSeason().n)); }catch(e){} S.overlay=null; S.screen='title'; S._welcomePop=null;
    maybeS1LaunchPopup(); var o=S.overlay; var d=document.createElement('div'); document.body.appendChild(d);
    if(o==='seasonlaunch') overlaySeasonLaunch(d);
    var t=d.innerText.replace(/\\s+/g,' '); var b=d.querySelector('.store'); if(b) b.click(); var next=S.overlay; d.remove(); S.overlay=null;
    return {shown:o, txt:t.slice(0,160), opens:next}; },
  trackBuy(){ this.invoked=[]; var d=document.createElement('div'); document.body.appendChild(d); S.overlay='tourpass'; overlayTourPass(d);
    var b=d.querySelector('[data-buypass]'); var t=b?b.innerText.replace(/\\s+/g,' '):null; if(b) b.click(); d.remove(); S.overlay=null;
    return {button:t, invoked:this.invoked.slice()}; },
  storeBuy(){ this.invoked=[]; var n=bucketShopNode('pass'); document.body.appendChild(n);
    var b=[].slice.call(n.querySelectorAll('button')).find(function(x){ return /Pass/.test(x.textContent)&&x.textContent.indexOf('14.99')>=0; });
    var t=b?b.textContent.replace(/\\s+/g,' '):null; if(b) b.click(); n.remove(); return {button:t, invoked:this.invoked.slice()}; },
  bought(){ this.wallet=Object.assign({}, this.wallet, {pass_active:true, pass_period:'S'+passSeason().n, paid_coins:30000}); },
  returnFromStripe(){ var R=this; var t0=window.toast; R.toasts=[]; window.toast=function(h){ R.toasts.push(String(h).replace(/<[^>]+>/g,' ')); };
    var before=packCredits('seasonal'); _purchaseHandled=false;
    history.replaceState(null,'',location.pathname+'?purchase=success');
    purchaseCheck();
    return new Promise(function(res){ setTimeout(function(){ window.toast=t0;
      res({purchased:S.purchased||null, overlay:S.overlay, packsAdded:packCredits('seasonal')-before, claimed:(LS.get(acctKey('bag_pass'),null)||{}).claimed,
        url:location.search, toasts:R.toasts}); }, 2600); }); },
  again(){ var before=packCredits('seasonal'); maybePassRewards(); return packCredits('seasonal')-before; }
};
`;

const src = fs.readFileSync(SRC, 'utf8');
fs.writeFileSync(PROBE, src.replace(/<\/body>(?![\s\S]*<\/body>)/, '<script>' + HOOK + '</script></body>'));

const b = await chromium.launch();
const errs = [];
try {
  for (const period of ['S1', '']) {
    const page = await b.newPage({ viewport: { width: 390, height: 844 } });
    page.on('pageerror', (e) => errs.push(String(e)));
    await page.clock.setSystemTime(new Date('2026-10-06T16:00:00Z'));
    await page.goto(HOST + '/golf/__test_rebuy.html');
    await page.waitForFunction(() => window.__R && typeof passSeason === 'function');
    const E = (f, ...a) => page.evaluate(([f, a]) => window.__R[f](...a), [f, a]);

    head(`a Season 1 buyer opens the game in Season 2 (the wallet says pass_period ${period ? "'" + period + "'" : 'nothing'})`);
    const W = await E('rig', period);
    ok('the wallet loaded and shows no pass this season', W && W.passActive === false, W);
    const S0 = await E('state');
    ok('it is Season 2', S0.season === 2, S0);
    ok('they are not Pro, and the Season 2 track is not marked Pro', !S0.active && !S0.pro && !S0.trackPro && S0.trackProS === '', S0);
    ok('the home card reads Season 2 and does not say PRO', /Season 2/i.test(S0.card) && !/PRO/.test(S0.card), S0.card);

    head('Season 1 is still paid out');
    const ST = await E('settle');
    ok('the Season 1 track is archived with its Pro mark', ST.archivedPro, ST);
    ok('both lanes of Season 1 are settled up to tier 25, minus what was claimed', ST.free === 22 && ST.prem === 22, ST);

    head('they are asked to buy again');
    const L = await E('launch');
    ok('the Season 2 launch popup shows', L.shown === 'seasonlaunch', L);
    ok('...and its button opens the track', L.opens === 'tourpass', L);
    const T = await E('trackBuy');
    ok('the track shows a buy button', !!T.button, T);
    ok('...which starts checkout for the Tour Pass and nothing else', T.invoked.length === 1 && T.invoked[0].fn === 'create-checkout' && T.invoked[0].body.package_id === 'tourpass', T.invoked);
    const SB = await E('storeBuy');
    ok('the store sells the Season 2 pass at $14.99', !!SB.button && /Season 2/.test(SB.button), SB.button);
    ok('...and starts the same checkout', SB.invoked.length === 1 && SB.invoked[0].body.package_id === 'tourpass', SB.invoked);

    head('back from Stripe, once the webhook has landed');
    await E('bought');
    const RT = await E('returnFromStripe');
    ok('the thank-you screen shows the pass', RT.overlay === 'purchased' && RT.purchased && RT.purchased.kind === 'pass', RT);
    ok('the purchase flag is cleaned off the address', RT.url === '', RT.url);
    ok('2 seasonal packs are granted for Season 2', RT.packsAdded === 2 && RT.claimed === 'S2', RT);
    const S1 = await E('state');
    ok('they are Pro, and the Season 2 track is stamped S2', S1.active && S1.pro && S1.trackPro && S1.trackProS === 'S2', S1);
    ok('the home card says PRO', /PRO/.test(S1.card), S1.card);
    ok('opening the game again grants no more packs', (await E('again')) === 0);
    await page.close();
  }
  head('page errors');
  ok('none', errs.length === 0, errs.slice(0, 3));
} finally {
  await b.close();
  try { fs.unlinkSync(PROBE); } catch (e) {}
}
console.log(bad ? `\n${bad} FAILED` : '\nall passed');
process.exit(bad ? 1 : 0);
