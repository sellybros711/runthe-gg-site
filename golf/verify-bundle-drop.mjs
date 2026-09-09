/* The golf half of Run The Bundle, in a browser.
 *
 *   (nohup python3 -m http.server 8099 &)
 *   node golf/verify-bundle-drop.mjs
 *
 * Run The Bundle is one Stripe purchase covering four games, sold on the football side. Its Run The Tour
 * grant lands as a premium_unlocks row with fulfilled_at null, and until now nothing on this side read it:
 * a buyer would have paid, the row would exist, and no coins and no pack would ever have reached them.
 *
 * The coins are credited by a server function (supabase/104_runtour_bundle_redeem.sql), which is where the
 * exactly-once guarantee lives and where it is tested, against a real Postgres with real concurrent
 * sessions (supabase/test/bundle_test.sql and bundle_concurrent.sh). THIS drives the client half: that the
 * pack is granted exactly once from the row, that the two halves settle independently when either server
 * call fails, and that nothing at all happens for the overwhelming majority of players who never bought
 * a bundle.
 *
 * Supabase is stubbed, not called. The stub answers the two shapes the code uses and counts the calls, so
 * "granted twice" and "asked the server twice" are both visible.
 *
 * The instrumented copy is written into golf/ and removed in a finally. If a crash leaves one behind it is
 * called __test_bundle.html and is safe to delete.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const HOST = process.env.HOST || 'http://localhost:8099';
const SRC = ROOT + '/golf/index.html';
const PROBE = ROOT + '/golf/__test_bundle.html';

let bad = 0;
const ok = (n, p, x) => { if (!p) bad++;
  console.log((p ? '  ok   ' : ' FAIL  ') + n + (x !== undefined ? '   ' + JSON.stringify(x).slice(0, 220) : '')); };
const head = (t) => console.log('\n' + t + '\n' + '-'.repeat(t.length));

const HOOK = `
window.__BD = {
  toasts: [], rpcCalls: 0, selCalls: 0,
  /* o.row     the premium_unlocks row the server holds, or null for a player who bought nothing
     o.coins   what the RPC reports crediting (the server decides this, the client only reports it)
     o.rpcErr  the RPC fails, as it would on a server without migration 104
     o.selErr  the row read fails
     o.signedOut / o.noSb                                                                            */
  rig(o){
    o=o||{}; this.toasts=[]; this.rpcCalls=0; this.selCalls=0;
    try{ localStorage.clear(); localStorage.setItem('bag_tour_done','true'); }catch(e){}
    reset();
    window._PACKSTEST=true;
    sbUser = o.signedOut ? null : {id:'bundle-user', email:'buyer@example.com'};
    _walletCache = {paid:(o.paid||0), lifePurchased:0, lifeGranted:0, tokens:0, passActive:false, passPeriod:null};
    var rows = o.row===undefined ? [] : (o.row===null ? [] : [o.row]);
    var selAnswer = o.selErr ? {error:{message:'relation does not exist'}, data:null} : {error:null, data:rows};
    /* The stub CLAIMS, the way the real function does: the first call pays and stamps, every call after it
       pays zero. A stub that paid every time would have hidden whether the client can tell the difference,
       and it is the difference that decides whether a player is congratulated once or on every load. */
    var paid=(o.paid||0), owed=(o.coins||0);
    sb = o.noSb ? null : {
      rpc:function(n){ if(n!=='runtour_redeem_unlocks') return Promise.resolve({error:null,data:null});
        window.__BD.rpcCalls++;
        if(o.rpcErr) return Promise.resolve({error:{message:'function does not exist'}, data:null});
        var c=owed; owed=0; paid+=c;
        return Promise.resolve({error:null, data:[{coins:c, packs:(c>0?(o.packs||[]):[]), paid_coins:paid}]}); },
      from:function(t){ return { select:function(){ return { eq:function(){ return {
        limit:function(){ if(t==='premium_unlocks') window.__BD.selCalls++;
          return Promise.resolve(selAnswer); } }; } }; } }; }
    };
    if(o.granted){ LS.set(acctKey('bag_bucket_packs'), {granted:o.granted}); }
    S.screen='title'; S.overlay=null;   // 'home' is not a screen: render() would throw and the toast path calls it
    return {signedIn:sbSignedIn(), packsOn:packsOn()};
  },
  /* run it and wait for both server calls to settle */
  async drop(){ maybeBundleDrop(); await new Promise(function(r){ setTimeout(r,60); }); return this.state(); },
  state(){ var p=packState();
    return {paid:(_walletCache?_walletCache.paid:null),
      tour:p.tourEarned||0, base:p.packEarned||0, champ:p.champEarned||0,
      granted:Object.keys((LS.get(acctKey('bag_bucket_packs'),null)||{}).granted||{}),
      log:coinLogEntries().map(function(e){ return e.a+' '+e.w; }),
      toasts:window.__BD.toasts.slice(), rpc:window.__BD.rpcCalls, sel:window.__BD.selCalls};
  },
  merge(a,b){ return mergeBucketPacks(a,b); },
  /* the two places the game calls it from. sbApply is the sign-in chain (it runs inside the loadWallet
     callback there, so the wallet is loaded before the credit lands in it); bucketShopNode is the store. */
  callSites(){
    var a=String(sbApply), i=a.indexOf('loadWallet');
    return {signin:(i>=0 && a.indexOf('maybeBundleDrop', i)>i),
            shop:(String(bucketShopNode).indexOf('maybeBundleDrop')>=0)};
  }
};
(function(){ var real=toast; toast=function(m,d){ try{ window.__BD.toasts.push(String(m).replace(/<[^>]*>/g,' ').replace(/\\s+/g,' ').trim()); }catch(e){} return real(m,d); }; })();
`;

/* the row the Stripe webhook writes for run-the-bundle, verbatim from functions/api/stripe/_bundles.js */
const ROW = (grantedAt) => ({
  product: 'runtour_pack',
  granted_at: grantedAt,
  payload: { checkout_session: 'cs_test_1', stripe_customer: 'cus_test_1', coins: 100000, packs: [{ tier: 'tour', n: 1 }] }
});

function buildProbe() {
  const src = fs.readFileSync(SRC, 'utf8');
  const re = /<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g;
  let m, best = null;
  while ((m = re.exec(src))) { if (!best || m[1].length > best[1].length) best = m; }
  if (!best) throw new Error('no inline script found in golf/index.html');
  const at = best.index + best[0].length - '</script>'.length;
  fs.writeFileSync(PROBE, src.slice(0, at) + '\n' + HOOK + '\n' + src.slice(at));
}

const run = async () => {
  buildProbe();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 430, height: 900 } });
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/i.test(m.text())) errs.push('console: ' + m.text().slice(0,600)); });
  await page.addInitScript(() => { try { localStorage.setItem('bag_tour_done', 'true'); } catch (e) {} });
  await page.goto(HOST + '/golf/__test_bundle.html', { waitUntil: 'domcontentloaded' });
  // the hook is appended into the game's own script, so a slip in it is a page error rather than a stack
  try { await page.waitForFunction('!!window.__BD', null, { timeout: 15000 }); }
  catch (e) { console.log('the hook did not load:'); errs.slice(0, 3).forEach(x => console.log('  ' + x)); throw e; }

  const rig = (o) => page.evaluate(a => window.__BD.rig(a), o);
  const drop = () => page.evaluate(() => window.__BD.drop());

  head('where it is called from');
  const cs = await page.evaluate(() => window.__BD.callSites());
  ok('on sign-in, once the wallet has loaded', cs.signin === true, cs);
  ok('and on opening the store', cs.shop === true, cs);

  head('a buyer opens the game for the first time after buying');
  const r0 = await rig({ row: ROW('2026-09-09T12:00:00Z'), coins: 100000, paid: 4200 });
  ok('the rig is signed in with packs live', r0.signedIn && r0.packsOn, r0);
  const s0 = await drop();
  ok('the wallet balance the server reported is taken', s0.paid === 104200, s0.paid);
  ok('the Tour Pack out of the payload is in the bag', s0.tour === 1, s0);
  ok('nothing else was granted', s0.base === 0 && s0.champ === 0, s0);
  ok('the coins are in the ledger under the bundle', s0.log.join('|') === '100000 Run The Bundle', s0.log);
  ok('and they are told, once, what landed',
    s0.toasts.length === 1 && /100,000 coins/.test(s0.toasts[0]) && /1 Tour Pack/.test(s0.toasts[0]), s0.toasts);

  head('and then keeps opening the game');
  const s1 = await drop();
  ok('the pack is not granted again', s1.tour === 1, s1);
  ok('and nothing is said a second time', s1.toasts.length === 1, s1.toasts);
  const s2 = await page.evaluate(async () => { await window.__BD.drop(); await window.__BD.drop(); return window.__BD.drop(); });
  ok('nor on the fifth open', s2.tour === 1 && s2.toasts.length === 1, { tour: s2.tour, toasts: s2.toasts.length });
  ok('though the server is asked every time, which is what makes it the authority',
    s2.rpc === 5 && s2.sel === 5, { rpc: s2.rpc, sel: s2.sel });
  ok('the grant is recorded against the row, not a flag',
    s2.granted.join(',') === 'bundle:2026-09-09T12:00:00Z', s2.granted);

  head('the two halves settle independently');
  await rig({ row: ROW('2026-09-09T12:00:00Z'), coins: 100000, paid: 0, rpcErr: true });
  const e1 = await drop();
  ok('a server without migration 104 still hands over the pack', e1.tour === 1, e1);
  ok('and credits nothing, because the server credits coins and we do not', e1.paid === 0 && !e1.log.length, e1);
  await rig({ row: ROW('2026-09-09T12:00:00Z'), coins: 100000, paid: 0, selErr: true });
  const e2 = await drop();
  ok('a failed row read still leaves the coins credited', e2.paid === 100000, e2);
  ok('and the message does not point at a pack nobody was given',
    !/Pro Shop/.test(e2.toasts[0]) && /coin balance/.test(e2.toasts[0]), e2.toasts);
  ok('while the pack-only case points only at the packs',
    /Pro Shop/.test(e1.toasts[0]) && !/coin balance/.test(e1.toasts[0]), e1.toasts);
  ok('and grants no pack, so the next sign-in can still grant it', e2.tour === 0 && !e2.granted.length, e2);

  head('a grant that is genuinely re-issued');
  await rig({ row: ROW('2026-09-09T12:00:00Z'), coins: 100000 });
  await drop();
  const g1 = await page.evaluate(async () => {
    // the webhook upserts on (user_id, product), so a re-grant rewrites granted_at
    const o = { row: { product: 'runtour_pack', granted_at: '2026-11-01T09:00:00Z',
      payload: { coins: 100000, packs: [{ tier: 'tour', n: 1 }] } }, coins: 100000,
      granted: { 'bundle:2026-09-09T12:00:00Z': 1 } };
    window.__BD.rig(o); return window.__BD.drop();
  });
  ok('a new grant is a new pack', g1.tour === 1 && g1.granted.length === 2, g1.granted);

  head('the players who did not buy anything');
  await rig({ row: null, coins: 0 });
  const n1 = await drop();
  ok('no row means no pack, no coins, no toast', n1.tour === 0 && !n1.toasts.length && !n1.log.length, n1);
  ok('and no grant is recorded against nothing', n1.granted.length === 0, n1.granted);
  await rig({ signedOut: true, row: ROW('2026-09-09T12:00:00Z'), coins: 100000 });
  const n2 = await drop();
  ok('a signed-out visitor never asks', n2.rpc === 0 && n2.sel === 0, n2);
  await rig({ noSb: true, row: ROW('2026-09-09T12:00:00Z') });
  const n3 = await drop();
  ok('and neither does a page with no Supabase client', n3.tour === 0, n3);

  head('payloads that are not what we expect');
  for (const [name, payload, want] of [
    ['an empty payload', {}, 0],
    ['packs that are not an array', { coins: 100000, packs: 'tour' }, 0],
    ['a pack with no count', { packs: [{ tier: 'tour' }] }, 0],
    ['a negative count', { packs: [{ tier: 'tour', n: -3 }] }, 0],
    ['an absurd count', { packs: [{ tier: 'tour', n: 999 }] }, 20],
  ]) {
    await rig({ row: { product: 'runtour_pack', granted_at: '2026-09-09T12:00:00Z', payload }, coins: 0 });
    const s = await drop();
    ok(name + ' grants ' + want, s.tour === want, { tour: s.tour, base: s.base });
  }
  await rig({ row: { product: 'runtour_pack', granted_at: '2026-09-09T12:00:00Z',
    payload: { packs: [{ tier: 'champ', n: 2 }, { tier: 'base', n: 1 }] } }, coins: 0 });
  const mixed = await drop();
  ok('and a payload with two kinds of pack grants both', mixed.champ === 2 && mixed.base === 1, mixed);

  head('a second device');
  const m1 = await page.evaluate(() => window.__BD.merge({ granted: { 'bundle:A': 1 } }, { granted: { 'cs_evt_1': 1 } }));
  ok('the merge unions a bundle drop with a coin purchase', Object.keys(m1.granted).sort().join(',') === 'bundle:A,cs_evt_1', m1);
  const m2 = await page.evaluate(() => window.__BD.merge(null, { granted: { 'bundle:A': 1 } }));
  ok('a fresh device inherits what the other one already granted', !!m2.granted['bundle:A'], m2);
  await rig({ row: ROW('2026-09-09T12:00:00Z'), coins: 100000, granted: { 'bundle:2026-09-09T12:00:00Z': 1 } });
  const m3 = await drop();
  ok('so signing in on it does not hand out the pack twice', m3.tour === 0, m3);
  ok('while the coins are still the server\'s call, not the set\'s', m3.paid === 100000, m3);

  head('page errors');
  if (errs.length) errs.slice(0, 3).forEach(e => console.log('    ' + e));
  ok('none', errs.length === 0, errs.length);
  await browser.close();
};

try { await run(); } finally { try { fs.unlinkSync(PROBE); } catch (e) {} }
console.log('\n' + (bad ? bad + ' FAILED' : 'all good'));
process.exit(bad ? 1 : 0);
