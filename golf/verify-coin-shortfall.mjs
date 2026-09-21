/* Running out of coins, in a browser.
 *
 *   (nohup python3 -m http.server 8099 &)
 *   node golf/verify-coin-shortfall.mjs
 *
 * Every coin purchase in the game can run out of coins, and there are exactly three live paths that
 * can: a gear/cosmetic/club buy through the shop preview card, a pack, and a pack bundle. All three
 * now open one dialog that says how far short you are, what the first-time bonus is worth, and which
 * bucket would cover it. This checks all three reach it and that what it says is true.
 *
 * The account is stubbed rather than signed in: coins are an account feature and this sandbox has no
 * Supabase. The stub is a user object and a client whose calls never resolve, so every code path the
 * dialog takes is the shipped one and nothing reaches the network. The purchase-history cache the
 * per-size 2x is read from is set directly, which is the only way to test an account that has bought
 * some sizes and not others without buying anything.
 *
 * Stripe checkout is stubbed too, and the assertion is that the dialog asked for the RIGHT bucket.
 * Sending a tester to a real checkout is not a test anybody can run twice.
 *
 * The instrumented copy is written into golf/ because the hook has to reach inside the page's one
 * inline script, and removed in a finally. If a crash leaves one behind it is called
 * __test_coinshort.html and is safe to delete.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const HOST = process.env.HOST || 'http://localhost:8099';
const SRC = ROOT + '/golf/index.html';
const PROBE = ROOT + '/golf/__test_coinshort.html';

let bad = 0;
const ok = (n, p, x) => { if (!p) bad++;
  console.log((p ? '  ok   ' : ' FAIL  ') + n + (x !== undefined ? '   ' + JSON.stringify(x).slice(0, 220) : '')); };
const head = (t) => console.log('\n' + t + '\n' + '-'.repeat(t.length));

const HOOK = `
window.__CS = {
  checkout: null,
  /* A stubbed account. sbUser is what sbSignedIn() reads; sb is only touched for queries this dialog
     never waits on, so a client whose calls never settle is the honest stub. */
  rig(o){
    o=o||{};
    this.checkout=null;
    try{ localStorage.clear(); }catch(e){}
    reset();
    if(o.signed===false){ sbUser=null; sb=null; }
    else {
      sbUser={id:'rig-user', email:'rig@example.com'};
      var never=function(){ return {then:function(){ return this; }, catch:function(){ return this; }}; };
      sb={ from:function(){ return {select:function(){ return {eq:function(){ return {limit:never}; },
        order:function(){ return {limit:never}; }, limit:never}; }}; }, rpc:never };
    }
    _walletCache={paid:(o.bal==null?0:o.bal), lifePurchased:0, lifeGranted:0, tokens:0, passActive:false};
    _bucketBuysCache = o.buys===null ? null : {set:new Set(o.buys||[])};
    if(o.firstBuySpin!=null){ var w=wheelState(); w.firstBuy=!o.firstBuySpin; wheelSave(w); }
    /* The very first Base pack is free, so it never checks coins. Spend it, which is where every
       player is by their second pack and the only state in which a pack CAN come up short. */
    if(o.freePack!==true){ var ps=packState(); ps.freeUsed=true; packSave(ps); }
    beginCheckout=function(id,ev){ window.__CS.checkout={id:id, ev:ev}; };
    S.screen='title'; S.overlay=null; S.shopPreview=null;
    return {bal:coinBalance(), signed:sbSignedIn(), buckets:BUCKETS.map(function(b){return {id:b.id,coins:b.coins,usd:b.usd};})};
  },
  /* A REAL buyable shirt colour at its REAL price, found through the game's own catalog. An invented
     id would preview at a made-up price and then charge whatever the pricing function actually says,
     which is how the "and paid for" check first disagreed with itself. */
  pickItem(){
    var list=cosmeticItems('shirt')||[];
    for(var i=0;i<list.length;i++){ var o=list[i];
      if(cosOwned('shirt',o.id)) continue;
      if(typeof cosPackOnly==='function' && cosPackOnly('shirt',o.id)) continue;
      if(typeof cosRewardOnly==='function' && cosRewardOnly('shirt',o.id)) continue;
      if(cosmeticPriceBase('shirt',o.id)<=0) continue;
      if(typeof itemDropLocked==='function' && itemDropLocked('shirt',o.id)) continue;
      return {cat:'shirt', id:o.id, name:o.name||o.id, price:cosmeticPrice('shirt',o.id)};
    }
    throw new Error('no buyable shirt in the catalog');
  },
  /* the three live routes into it, each entered through its own shipped entry point */
  viaPreview(it){
    S.overlay='shop'; S.shopSec='apparel';
    S.shopPreview={kind:'cos', cat:it.cat, id:it.id, name:it.name, price:it.price};
    render();
    return {btn:(document.getElementById('pv-buy')||{}).textContent||''};
  },
  clickPreviewBuy(){ var b=document.getElementById('pv-buy'); if(!b) throw new Error('no pv-buy'); b.click(); return true; },
  viaPack(tier){ startPackDeal({pack:tier||'base'}); return true; },
  viaBundle(tier){ startPackBundle(tier||'base'); return true; },
  packPrice(tier){ return packPrice(tier||'base'); },
  bundlePrice(tier){ return packBundlePriceFor(tier||'base'); },
  /* what the dialog is showing */
  dlg(){
    var c=document.querySelector('.cspcard.short');
    if(!c) return null;
    var rows={};
    c.querySelectorAll('.csp-row').forEach(function(r){
      var k=r.children[0]?r.children[0].textContent.trim():'';
      rows[k]=(r.children[1]?r.children[1].textContent:'').replace(/\\s+/g,'').trim();
    });
    var first=c.querySelector('.csp-first');
    return { text:c.innerText.replace(/\\s+/g,' ').trim(),
      kicker:(c.querySelector('.csp-kick')||{}).textContent||'',
      name:(c.querySelector('.csp-name')||{}).textContent||'',
      rows:rows,
      first:first?first.innerText.replace(/\\s+/g,' ').trim():null,
      more:(function(){ var m=c.querySelector('.csp-more'); return m?m.innerText.replace(/\\s+/g,' ').trim():null; })(),
      pick:(c.querySelector('.csp-pick .pkn')||{}).textContent||null,
      pickCoins:((c.querySelector('.csp-pick .pkc')||{}).textContent||'').replace(/\\s+/g,' ').trim()||null,
      has2x:!!c.querySelector('.csp-pick .pk2x'),
      buy:(c.querySelector('.btn.buy')||{}).textContent||null,
      store:!!c.querySelector('.btn.store'),
      acct:!!c.querySelector('.btn.acct'),
      no:(c.querySelector('.btn.no')||{}).textContent||null };
  },
  clickBuy(){ var b=document.querySelector('.cspcard.short .btn.buy'); if(!b) throw new Error('no buy'); b.click(); return window.__CS.checkout; },
  clickStore(){ var b=document.querySelector('.cspcard.short .btn.store'); if(!b) throw new Error('no store'); b.click();
    return {overlay:S.overlay, sec:S.shopSec}; },
  clickNo(){ var b=document.querySelector('.cspcard.short .btn.no'); if(b) b.click(); return !document.querySelector('.cspcard.short'); },
  clickBackdrop(){ var o=document.querySelector('.cspov'); if(o) o.dispatchEvent(new MouseEvent('click',{bubbles:true}));
    return !document.querySelector('.cspcard.short'); },
  open(){ return !!document.querySelector('.cspcard.short'); },
  openDirect(price){ coinShortfall({name:'Rig Item', price:price, from:'rig'}); return true; },
  confirmOpen(){ var c=document.querySelector('.cspcard'); return !!(c && !c.classList.contains('short')); },
  owns(it){ return cosOwned(it.cat,it.id); },
  bal(){ return coinBalance(); }
};
`;

function buildProbe() {
  const src = fs.readFileSync(SRC, 'utf8');
  const re = /<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g;
  let m, best = null;
  while ((m = re.exec(src))) { if (!best || m[1].length > best[1].length) best = m; }
  if (!best) throw new Error('no inline script found in golf/index.html');
  const at = best.index + best[0].length - '</script>'.length;
  fs.writeFileSync(PROBE, src.slice(0, at) + '\n' + HOOK + '\n' + src.slice(at));
}

const num = s => +String(s || '').replace(/[^0-9]/g, '');

const run = async () => {
  buildProbe();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 430, height: 900 } });
  const errs = [], netFail = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('requestfailed', r => netFail.push(r.url()));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/i.test(m.text())) errs.push('console: ' + m.text()); });

  await page.addInitScript(() => { try { localStorage.setItem('bag_tour_done', 'true'); } catch (e) {} });
  await page.goto(HOST + '/golf/__test_coinshort.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('!!window.__CS', null, { timeout: 20000 });

  const rig = o => page.evaluate(x => window.__CS.rig(x), o);
  const dlg = () => page.evaluate(() => window.__CS.dlg());

  const info = await rig({ bal: 0, buys: [] });
  const B = info.buckets;
  const IT = await page.evaluate(() => window.__CS.pickItem());
  ok('the stub signs in and the balance is settable', info.signed === true && info.bal === 0, info.bal);
  ok('a real buyable item was found in the catalog', IT.price > 0, IT);
  const SHORT_BAL = Math.max(0, IT.price - 7800);       // every gear case below is short by exactly this

  // ── the three routes in ────────────────────────────────────────────────────
  head('every way of running out of coins ends here');

  await rig({ bal: SHORT_BAL, buys: [] });
  const pv = await page.evaluate(it => window.__CS.viaPreview(it), IT);
  ok('the gear card offers an action instead of a dead button', /get coins/i.test(pv.btn), pv.btn);
  await page.evaluate(() => window.__CS.clickPreviewBuy());
  let d = await dlg();
  ok('gear: the dialog opens', !!d);
  ok('gear: it names the item', d.name.indexOf(IT.name) >= 0, { got: d.name, want: IT.name });
  ok('gear: nothing was bought', (await page.evaluate(it => window.__CS.owns(it), IT)) === false);
  await page.evaluate(() => window.__CS.clickNo());

  const packP = await page.evaluate(() => window.__CS.packPrice('base'));
  await rig({ bal: Math.max(0, packP - 500), buys: [] });
  await page.evaluate(() => window.__CS.viaPack('base'));
  d = await dlg();
  ok('pack: the dialog opens instead of a toast', !!d, d && d.name);
  ok('pack: the confirm dialog did NOT also open', (await page.evaluate(() => window.__CS.confirmOpen())) === false);
  await page.evaluate(() => window.__CS.clickNo());

  const bunP = await page.evaluate(() => window.__CS.bundlePrice('base'));
  await rig({ bal: Math.max(0, bunP - 500), buys: [] });
  await page.evaluate(() => window.__CS.viaBundle('base'));
  d = await dlg();
  ok('bundle: the dialog opens', !!d, d && d.name);
  ok('bundle: and it is the bundle price it is short of', num(d.rows['Cost']) === bunP, { got: num(d.rows['Cost']), want: bunP });
  await page.evaluate(() => window.__CS.clickNo());

  // ── what it says ───────────────────────────────────────────────────────────
  head('the numbers on it');

  await rig({ bal: SHORT_BAL, buys: [] });
  await page.evaluate(it => window.__CS.viaPreview(it), IT);
  await page.evaluate(() => window.__CS.clickPreviewBuy());
  d = await dlg();
  ok('the kicker says what happened', /NOT ENOUGH COINS/i.test(d.kicker), d.kicker);
  ok('cost is the item\'s real price', num(d.rows['Cost']) === IT.price, { got: d.rows['Cost'], want: IT.price });
  ok('you have is the balance', num(d.rows['You have']) === SHORT_BAL, d.rows['You have']);
  ok('short by is the difference, which is the number nobody was told before',
    num(d.rows['Short by']) === 7800, d.rows['Short by']);

  // ── the first-time bonus ───────────────────────────────────────────────────
  head('the first-time bonus');

  ok('a player who has bought nothing is told their first purchase pays double',
    d.first && /first purchase pays double/i.test(d.first), d.first);
  ok('and that it also earns a free Prize Wheel spin', d.first && /Prize Wheel/i.test(d.first), d.first);
  await page.evaluate(() => window.__CS.clickNo());

  // the offered bucket still has its 2x, but the account has bought before: bonus, no wheel spin
  await rig({ bal: 0, buys: ['small'], firstBuySpin: false });
  await page.evaluate(a => window.__CS.viaPreview({cat:'shirt', id:a.id, name:a.name, price:50000}), IT);
  await page.evaluate(() => window.__CS.clickPreviewBuy());
  d = await dlg();
  ok('a returning buyer offered an un-doubled size still sees the bonus',
    d.first && /first-time bonus/i.test(d.first) && /twice the coins/i.test(d.first), d.first);
  ok('but is not promised the wheel spin again', d.first && !/Prize Wheel/i.test(d.first), d.first);
  ok('and the bucket carries the 2x the banner just promised', d.has2x === true);
  await page.evaluate(() => window.__CS.clickNo());

  // the offered bucket has ALREADY had its double. Promising one here is a promise the next row breaks.
  await rig({ bal: SHORT_BAL, buys: ['small'], firstBuySpin: false });
  await page.evaluate(it => window.__CS.viaPreview(it), IT);
  await page.evaluate(() => window.__CS.clickPreviewBuy());
  d = await dlg();
  ok('a bucket that has had its double is not sold under a bonus banner', d.first === null, d.first);
  ok('and it shows no 2x', d.has2x === false);
  ok('the other sizes are mentioned once, quietly', !!d.more && /other sizes/i.test(d.more), d.more);
  await page.evaluate(() => window.__CS.clickNo());

  await rig({ bal: SHORT_BAL, buys: B.map(b => b.id), firstBuySpin: false });
  await page.evaluate(it => window.__CS.viaPreview(it), IT);
  await page.evaluate(() => window.__CS.clickPreviewBuy());
  d = await dlg();
  ok('a player who has bought every size is promised nothing', d.first === null && d.more === null, { first: d.first, more: d.more });
  ok('and their bucket shows no 2x', d.has2x === false);
  await page.evaluate(() => window.__CS.clickNo());

  // ── the recommendation ─────────────────────────────────────────────────────
  head('the bucket it picks');

  const pick = async (bal, price, buys) => {
    await rig({ bal, buys });
    await page.evaluate(a => window.__CS.viaPreview({cat:'shirt', id:a[0].id, name:a[0].name, price:a[1]}), [IT, price]);
    await page.evaluate(() => window.__CS.clickPreviewBuy());
    const r = await dlg();
    return r;
  };
  const smallest = (gap, buys) => {
    for (const b of B) { const c = buys.includes(b.id) ? b.coins : b.coins * 2; if (c >= gap) return b; }
    return B[B.length - 1];
  };
  for (const [bal, price, buys] of [[0, 9000, []], [0, 50000, []], [0, 100000, []],
                                    [0, 20000, ['small', 'medium', 'large', 'xl', 'mega']],
                                    [5000, 300000, ['small']], [0, 9000000, []]]) {
    const want = smallest(price - bal, buys);
    const r = await pick(bal, price, buys);
    ok(`short ${price - bal} with ${buys.length} size(s) bought picks the ${want.id}`,
      r.pick && r.pick.toLowerCase().indexOf(want.id === 'xl' ? 'xl' : want.id) >= 0, { got: r.pick, want: want.name });
    ok('  and shows it doubled exactly when that size is still unbought',
      r.has2x === !buys.includes(want.id), { has2x: r.has2x, bought: buys.includes(want.id) });
    await page.evaluate(() => window.__CS.clickNo());
  }

  await rig({ bal: 0, buys: [] });
  await page.evaluate(a => window.__CS.viaPreview({cat:'shirt', id:a.id, name:a.name, price:50000}), IT);
  await page.evaluate(() => window.__CS.clickPreviewBuy());
  const co = await page.evaluate(() => window.__CS.clickBuy());
  ok('the buy button starts checkout for the bucket it recommended',
    co && co.id === smallest(50000, []).id && co.ev === 'bucket_checkout', co);

  await rig({ bal: 0, buys: [] });
  await page.evaluate(a => window.__CS.viaPreview({cat:'shirt', id:a.id, name:a.name, price:50000}), IT);
  await page.evaluate(() => window.__CS.clickPreviewBuy());
  const st = await page.evaluate(() => window.__CS.clickStore());
  ok('and the secondary lands on the coin tab of the store', st.overlay === 'shop' && st.sec === 'buckets', st);

  // ── getting out of it ──────────────────────────────────────────────────────
  head('closing it');

  await rig({ bal: SHORT_BAL, buys: [] });
  await page.evaluate(it => window.__CS.viaPreview(it), IT);
  await page.evaluate(() => window.__CS.clickPreviewBuy());
  ok('tapping outside closes it', (await page.evaluate(() => window.__CS.clickBackdrop())) === true);
  await page.evaluate(it => window.__CS.viaPreview(it), IT);
  await page.evaluate(() => window.__CS.clickPreviewBuy());
  await page.keyboard.press('Escape');
  ok('escape closes it', (await page.evaluate(() => window.__CS.open())) === false);

  // ── signed out ─────────────────────────────────────────────────────────────
  head('signed out');

  // Every live caller checks sign-in before it ever checks coins, so a guest cannot reach this through
  // the UI. The branch is a guard, and it is opened directly here to prove the guard is right rather
  // than to claim a route that does not exist.
  await rig({ bal: 0, buys: [], signed: false });
  await page.evaluate(() => window.__CS.openDirect(9000));
  d = await dlg();
  ok('a guest is asked to make an account, not to buy', !!d && d.acct === true && d.buy === null, d && d.text.slice(0, 90));
  await page.evaluate(() => window.__CS.clickNo());

  // ── and the case where nothing should change ───────────────────────────────
  head('when they CAN afford it');

  const RICH = IT.price + 41000;
  await rig({ bal: RICH, buys: [] });
  const pv2 = await page.evaluate(it => window.__CS.viaPreview(it), IT);
  ok('the gear card still says Buy', /^Buy$/i.test(pv2.btn.trim()), pv2.btn);
  await page.evaluate(() => window.__CS.clickPreviewBuy());
  ok('no shortfall dialog', (await page.evaluate(() => window.__CS.open())) === false);
  ok('and the item was bought', (await page.evaluate(it => window.__CS.owns(it), IT)) === true);
  ok('and paid for at its real price', (await page.evaluate(() => window.__CS.bal())) === 41000,
    { bal: await page.evaluate(() => window.__CS.bal()), price: IT.price });

  head('page errors');
  ok('none, in any of it', errs.length === 0, errs.slice(0, 6));
  const sameOrigin = netFail.filter(u => u.indexOf(HOST) === 0);
  ok('every failed request was offsite', sameOrigin.length === 0, { offsite: netFail.length, sameOrigin: sameOrigin.slice(0, 4) });

  await browser.close();
};

try {
  await run();
} finally {
  try { fs.unlinkSync(PROBE); } catch (e) {}
}
console.log('\n' + (bad ? bad + ' FAILED' : 'all good'));
process.exit(bad ? 1 : 0);
