/* Season 2 of the Tour Pass (Hallows & Harvest), and every season after it.
 *
 *   (nohup python3 -m http.server 8099 &)
 *   node golf/check-pass-season.mjs
 *
 * The reward tables were written for Season 1 and nothing said which season they belonged to, so on
 * Oct 5 the game would have served Season 1 again: the Beach Shades and the Floppy Hat, and the
 * "one-season-only" Tour Pass Plate and Champion Aura handed to the same buyers a second time. Nothing
 * throws when that happens. What breaks is a promise, and the only person who notices is a paying player.
 *
 * So this holds the season table to what the pass sells:
 *
 *   VALUE      every pack, shard and spin Season 1 paid is still paid, at the same tier, and no tier
 *              pays fewer coins. A new season is never a worse pass.
 *   EXCLUSIVE  every item on a season's track is on that track only: price 0, in no pack pool, in no
 *              drop, on no other season, carrying no stat boost, and never offered for coins.
 *   DRAWN      every item actually renders. A hat id with no sprite silently falls back to the plain
 *              cap, which is a reward that looks like nothing.
 *   CALENDAR   October sells the Spooky pack, November the Harvest pack, and the Tour Pass's seasonal
 *              packs follow the month. A seasonal credit that outlives its window becomes a Tour pack
 *              instead of a pack nobody can open.
 *   SEASONAL PACKS copy the Summer pack's price, odds and pity exactly (the ladder is not re-tuned).
 *
 * The date is moved with Playwright's clock, so passSeason() and dropLive() read it exactly as they read a
 * real one. The instrumented copy is golf/__test_pass.html, removed in a finally.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const HOST = process.env.HOST || 'http://localhost:8099';
const SRC = ROOT + '/golf/index.html';
const PROBE = ROOT + '/golf/__test_pass.html';

let bad = 0;
const ok = (n, p, x) => { if (!p) bad++;
  console.log((p ? '  ok   ' : ' FAIL  ') + n + (x !== undefined ? '   ' + JSON.stringify(x).slice(0, 260) : '')); };
const head = (t) => console.log('\n' + t + '\n' + '-'.repeat(t.length));

const HOOK = `
window.__P = {
  signIn(){ sbUser={id:'pass-rig', email:'rig@example.com'}; window._PACKSTEST=true;
    var never=function(){ return {then:function(){ return this; }, catch:function(){ return this; }}; };
    sb={ from:function(){ return {select:function(){ return {eq:function(){ return {limit:never}; }, order:function(){ return {limit:never}; }, limit:never}; }}; }, rpc:never, functions:{invoke:never} };
    _walletCache={paid:0, lifePurchased:0, lifeGranted:0, tokens:0, passActive:true, passPeriod:'S'+passSeason().n};
    try{ cloudPush=function(){}; }catch(e){} },
  season(){ return passSeason(); },
  tables(){ var out={};
    [1,2,3].forEach(function(n){ var L={free:[],prem:[]};
      for(var t=1;t<=PASS_TIERS;t++){ L.free.push(passTierReward(t,'free',n)); L.prem.push(passTierReward(t,'prem',n)); }
      out[n]=L; });
    out.base={free:[],prem:[]};
    for(var t=1;t<=PASS_TIERS;t++){ out.base.free.push(passBaseReward(t,'free')); out.base.prem.push(passBaseReward(t,'prem')); }
    return out; },
  items(){ var out=[];
    Object.keys(PASS_SEASONS).forEach(function(n){ var d=PASS_SEASONS[n], lanes=d.legacy?(d.excl||{}):{prem:d.items};
      ['free','prem'].forEach(function(lane){ var m=lanes[lane]||{}; Object.keys(m).forEach(function(t){ out.push({season:+n,lane:lane,tier:+t,cat:m[t].cat,id:m[t].id,name:m[t].name}); }); }); });
    return out; },
  audit(cat,id){
    var listed=(cosmeticItems(cat)||[]).some(function(o){ return o.id===id; });
    var drawn=false;
    if(cat==='hw') drawn=!!PXG_HATS[id]; else if(cat==='ew') drawn=!!PXG_EYEWEAR[id];
    else if(cat==='ball') drawn=!!(PXG_BALL[id]&&PXG_BALL_PAL[id]); else if(cat==='pat') drawn=!!PXPAT_BY[id];
    else if(cat==='fx') drawn=!!PXFX_BY[id]; else if(cat==='plate') drawn=!!PLATE_STYLE[id]; else if(cat==='cardbg') drawn=!!CARDBG_ART[id];
    var inPool=packPool().some(function(e){ return e.cat===cat && e.id===id; });
    var inDrop=!!DROP_BY_ITEM[cat+'|'+id], reward=cosRewardOnly(cat,id), boost=!!COS_BOOST[cosKey(cat,id)];
    return {listed:listed, drawn:drawn, base:cosmeticPriceBase(cat,id), price:cosmeticPrice(cat,id), packOnly:cosPackOnly(cat,id),
      inPool:inPool, inDrop:inDrop, reward:reward, boost:boost, buy:cosBuy(cat,id).msg}; },
  /* the rendered golfer really differs from the plain one, so the item is on the sprite and not a fallback */
  worn(cat,id){ var lk=(COS_CATS.find(function(c){ return c.k===cat; })||{}).lookKey; if(!lk) return null;
    if(cat==='plate'||cat==='cardbg') return null;
    var plain=Object.assign({},DEFLOOK), on=Object.assign({},DEFLOOK); on[lk]=id; if(cat==='hw') on.cap=true;
    if(cat==='fx') return !!PXFX_PARTS[id] || !!PXFX_BY[id];
    var a=pxGolferCanvas(plain).toDataURL(), b=pxGolferCanvas(on).toDataURL(); return a!==b; },
  bg(id){ var cv=pxCardBgCanvas(id), x=cv.getContext('2d'), d=x.getImageData(0,0,cv.width,cv.height).data, cols=new Set();
    for(var i=0;i<d.length;i+=16) cols.add(d[i]+','+d[i+1]+','+d[i+2]); return cols.size; },
  tile(cat,id,store){ S.overlay=store?'shop':null; var o=(cosmeticItems(cat)||[]).find(function(x){ return x.id===id; })||{id:id,name:id};
    var h=cosTileHTML(cat,o); S.overlay=null; return h; },
  packs(){ var out={}; ['summer','spooky','harvest','winter','tour'].forEach(function(k){ var p=PACK_TYPES[k]; out[k]=p?{price:p.price,odds:p.odds,pityEpic:p.pityEpic,pityLeg:p.pityLeg,bias:p.dropBias||0,drop:p.dropId||null,art:!!PACK_PAL_OVR[k]}:null; }); return out; },
  calendar(){ return {live:packTierList(), passTier:passPackTier(), opensAs:packType('seasonal').id, drop:(liveThemedDrop()||{}).id||null,
    harvestInPool:packPool().some(function(e){ return e.cat==='hw'&&e.id==='turkey'; }),
    spookyInPool:packPool().some(function(e){ return e.cat==='hw'&&e.id==='witch'; })}; },
  drops(){ return DROPS.filter(function(d){ return d.id==='spooky'||d.id==='harvest'; }).map(function(d){
    var r=DROP_REWARDS[d.id]||{};
    return {id:d.id, window:d.window, items:d.items.map(function(ci){ return {cat:ci[0],id:ci[1],base:cosmeticPriceBase(ci[0],ci[1]),listed:(cosmeticItems(ci[0])||[]).some(function(o){return o.id===ci[1];})}; }),
      reward:(r.items||[]).map(function(it){ return {cat:it.cat,id:it.id,listed:(cosmeticItems(it.cat)||[]).some(function(o){return o.id===it.id;}),bg:!!CARDBG_ART[it.id]}; }), coins:r.coins||0}; }); },
  /* credits are one pool: old per-pack counters fold in, and whatever is in the pool opens as the live pack */
  pool(n){ var p=packState(); p.summerEarned=(p.summerEarned||0)+n; packSave(p);
    var before=packCredits('seasonal'), m1=mergeSeasonalCredits(), m2=mergeSeasonalCredits();
    grantFreePack(1,{tier:'seasonal',silent:true});
    return {before:before, m1:m1, m2:m2, pool:packCredits('seasonal'), asLive:liveSeasonalPackId()?packCredits(liveSeasonalPackId()):null,
      live:liveSeasonalPackId(), opensAs:packType('seasonal').id}; },
  claimAll(){ var s=passState(); s.xp=passXpForTier(PASS_TIERS); passSave(s); var got=passClaimAll(); var own=coinState().owned;
    return {n:got.length, cos:got.filter(function(r){return r.cos;}).map(function(r){ return {cat:r.cos.cat,id:r.cos.id,owned:!!own[cosKey(r.cos.cat,r.cos.id)]}; })}; },
  /* the Go Pro pitch, which only a player WITHOUT the pass sees */
  sales(){ var had=_walletCache.passActive; _walletCache.passActive=false;
    var d=document.createElement('div'); document.body.appendChild(d); S.overlay='tourpass'; overlayTourPass(d);
    var pitch=d.querySelector('.tp-cta'), t=pitch?pitch.innerText:''; d.remove(); S.overlay=null; _walletCache.passActive=had; return t; },
  launch(){ var d=document.createElement('div'); document.body.appendChild(d); overlaySeasonLaunch(d); var t=d.innerText.replace(/\\s+/g,' '); var n=d.querySelectorAll('.sl-th').length; d.remove(); return {txt:t, thumbs:n}; },
  launchGate(){ try{ localStorage.removeItem('bag_s2_launch_seen'); }catch(e){} return {owed:seasonLaunchOwed(), pending:s1LaunchPending(), key:seasonLaunchKey(passSeason().n)}; },
};`;

const src = fs.readFileSync(SRC, 'utf8');
const re = /<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g; let m, best = null;
while ((m = re.exec(src))) { if (!best || m[1].length > best[1].length) best = m; }
const at = best.index + best[0].length - '</script>'.length;
fs.writeFileSync(PROBE, src.slice(0, at) + '\n' + HOOK + '\n' + src.slice(at));

const b = await chromium.launch();
try {
  const page = await b.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.addInitScript(() => { try { localStorage.setItem('bag_tour_done', 'true'); } catch (e) {} });
  // Noon Eastern on Oct 10: inside Season 2 and inside the Spooky Season drop.
  await page.clock.setSystemTime(new Date('2026-10-10T16:00:00Z'));
  await page.goto(HOST + '/golf/__test_pass.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('!!window.__P', null, { timeout: 20000 });
  await page.evaluate(() => window.__P.signIn());
  const E = (f, ...a) => page.evaluate(([f, a]) => window.__P[f](...a), [f, a]);

  head('the calendar');
  const ssn = await E('season');
  ok('Oct 10 2026 is Season 2', ssn.n === 2, ssn);

  head('value: Season 2 is never a worse pass than Season 1');
  const T = await E('tables');
  const sum = (L, k) => L.reduce((a, r) => a + (k === 'coins' ? (r.coins || 0) : 0), 0);
  for (const lane of ['free', 'prem']) {
    const s1 = T[1][lane], s2 = T[2][lane];
    ok(`${lane}: Season 1 is the base table exactly as shipped`, JSON.stringify(s1) === JSON.stringify(T.base[lane]));
    const moved = [];
    for (let i = 0; i < s1.length; i++) {
      const a = s1[i], z = s2[i];
      // Season 2 may ADD a pack where Season 1 had only a cosmetic; it may never change or drop one.
      if ((a.pack && JSON.stringify(a.pack) !== JSON.stringify(z.pack || null)) || JSON.stringify(a.shard || null) !== JSON.stringify(z.shard || null)
        || JSON.stringify(a.spin || null) !== JSON.stringify(z.spin || null) || (z.coins || 0) < (a.coins || 0)) moved.push(i + 1);
    }
    ok(`${lane}: every pack, shard and spin is where Season 1 put it, and no tier pays fewer coins`, !moved.length, moved);
    const added = s2.map((z, i) => (!s1[i].pack && z.pack) ? (i + 1) + ':' + z.pack.tier : null).filter(Boolean);
    if (lane === 'free') ok('free: the two tiers Season 1 spent on cosmetics pay a seasonal pack instead', added.join(',') === '15:seasonal,35:seasonal', added);
    else ok('prem: no pack is added on the Pro lane', !added.length, added);
    const c1 = sum(s1, 'coins'), c2 = sum(s2, 'coins');
    ok(`${lane}: Season 2 coins ${c2.toLocaleString()} >= Season 1 ${c1.toLocaleString()}`, c2 >= c1);
    const s1cos = new Set(s1.filter(r => r.cos).map(r => r.cos.cat + '|' + r.cos.id));
    const repeat = s2.filter(r => r.cos && s1cos.has(r.cos.cat + '|' + r.cos.id)).map(r => r.cos.id);
    ok(`${lane}: no Season 1 cosmetic comes back in Season 2`, !repeat.length, repeat);
    ok(`${lane}: a season nobody has authored pays no cosmetics at all`, !T[3][lane].some(r => r.cos));
  }
  ok('free: Season 2 gives no season items away on the free lane', !T[2].free.some(r => r.cos), T[2].free.filter(r => r.cos).map(r => r.cos.id));
  const n2 = T[2].free.filter(r => r.cos).length + T[2].prem.filter(r => r.cos).length;
  const n1 = T[1].free.filter(r => r.cos).length + T[1].prem.filter(r => r.cos).length;
  ok(`Season 2 has more cosmetics than Season 1 (${n2} against ${n1})`, n2 > n1);
  ok('the Pro capstone at tier 60 is a cosmetic', !!T[2].prem[59].cos, T[2].prem[59].cos);

  head('exclusive: every pass item is on one track and nowhere else');
  const items = await E('items');
  const seen = {};
  items.forEach(i => { const k = i.cat + '|' + i.id; seen[k] = (seen[k] || 0) + 1; });
  ok('no item is on two seasons', Object.values(seen).every(v => v === 1), Object.keys(seen).filter(k => seen[k] > 1));
  for (const it of items) {
    const a = await E('audit', it.cat, it.id);
    const good = a.listed && a.drawn && a.base === 0 && a.price === 0 && !a.packOnly && !a.inPool && !a.inDrop && !a.reward && !a.boost;
    ok(`S${it.season} ${it.lane} T${it.tier} ${it.cat}:${it.id}`, good, good ? undefined : a);
    if (it.season === 2) {
      const w = await E('worn', it.cat, it.id);
      if (w !== null) ok(`  and it changes the golfer it is put on`, w === true);
      if (it.cat === 'cardbg') { const c = await E('bg', it.id); ok(`  and the backdrop renders (${c} colours)`, c > 40); }
    }
  }

  head('the store: a pass item is a locked tile, never a 0-coin buy');
  const tWisp = await E('tile', 'fx', 'wisp', true);
  ok('Season 2 capstone shows where it is earned', /Season 2 Tour Pass · Pro tier 60/.test(tWisp), tWisp.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 160));
  ok('...with no price on it', !/data-kind="cos"/.test(tWisp));
  const tCrown = await E('tile', 'fx', 'passcrown', true);
  ok('a past season\'s exclusive is gone from the store', tCrown === '');
  const tCandy = await E('tile', 'pat', 'candycorn', false);
  ok('the closet shows the same locked tile, not a buy', /Season 2 Tour Pass · Pro tier 3/.test(tCandy));

  head('seasonal packs copy Summer Smash exactly');
  const P = await E('packs');
  for (const k of ['spooky', 'harvest', 'winter']) {
    const a = P[k], s = P.summer;
    ok(`${k}: price, odds, pity and bias equal Summer's`, !!a && a.price === s.price && JSON.stringify(a.odds) === JSON.stringify(s.odds)
      && a.pityEpic === s.pityEpic && a.pityLeg === s.pityLeg && a.bias === s.bias, a);
    ok(`${k}: and its odds equal the Tour pack's, so the pool is never worth less than a Tour pack`, JSON.stringify(a.odds) === JSON.stringify(P.tour.odds) && a.pityEpic === P.tour.pityEpic && a.pityLeg === P.tour.pityLeg);
    ok(`${k}: has its own pack art`, a.art);
  }

  head('drops and their rewards');
  for (const d of await E('drops')) {
    ok(`${d.id}: every item exists and is priced`, d.items.every(i => i.listed && i.base > 0), d.items.filter(i => !(i.listed && i.base > 0)));
    ok(`${d.id}: completing it pays a listed backdrop and coins`, d.reward.length > 0 && d.reward.every(r => r.listed && r.bg) && d.coins > 0, d.reward);
  }

  head('October');
  let C = await E('calendar');
  ok('the Spooky pack is on sale and the Harvest pack is not', C.live.includes('spooky') && !C.live.includes('harvest'), C.live);
  ok('the Tour Pass hands out seasonal packs, and they open as Spooky packs', C.passTier === 'seasonal' && C.opensAs === 'spooky', C);
  ok('Harvest items are not in packs yet', !C.harvestInPool && C.spookyInPool);

  head('November');
  await page.clock.setSystemTime(new Date('2026-11-12T16:00:00Z'));
  C = await E('calendar');
  ok('the Harvest pack is on sale and the Spooky pack is not', C.live.includes('harvest') && !C.live.includes('spooky'), C.live);
  ok('the same seasonal credit opens as a Harvest pack now', C.passTier === 'seasonal' && C.opensAs === 'harvest', C);
  ok('Harvest items are in packs, Spooky items are not', C.harvestInPool && !C.spookyInPool);
  ok('still Season 2', (await E('season')).n === 2);

  head('December, the last three days of the season');
  await page.clock.setSystemTime(new Date('2026-12-02T16:00:00Z'));
  C = await E('calendar');
  ok('the Winter pack takes over, so the season never runs without a seasonal pack', C.live.includes('winter') && !C.live.includes('harvest') && C.opensAs === 'winter', C);

  head('seasonal credits are one pool that follows the store');
  const R = await E('pool', 2);
  ok('two old Summer credits fold into the pool, once', R.m1 === 2 && R.m2 === 0 && R.pool === R.before + 3, R);
  ok('in December the pool is what the Winter card offers free', R.live === 'winter' && R.asLive === R.pool, R);
  await page.clock.setSystemTime(new Date('2026-09-20T16:00:00Z'));
  const R2 = await E('pool', 0);
  ok('in a month with no seasonal pack the credits are kept, under a plain name', R2.live === null && R2.pool === R.pool + 1 && R2.opensAs === 'seasonal', R2);
  await page.clock.setSystemTime(new Date('2026-10-10T16:00:00Z'));
  const R3 = await E('pool', 0);
  ok('and they are all on the Spooky card the day it opens', R3.live === 'spooky' && R3.asLive === R3.pool && R3.pool === R2.pool + 1, R3);

  head('the sales pages and the launch popup read the Season 2 table');
  await page.clock.setSystemTime(new Date('2026-10-10T16:00:00Z'));
  const sales = await E('sales');
  ok('the Go Pro pitch names the Season 2 capstone', /Will-o'-Wisp Aura/.test(sales) && /Go\s*Pro/i.test(sales), sales.replace(/\s+/g, ' ').slice(0, 260));
  ok('...and not Season 1\'s', !/Champion Aura|Summer Smash/.test(sales));
  const L = await E('launch');
  ok('the launch popup says Season 2 and shows the exclusives', /season 2 is here/i.test(L.txt) && L.thumbs >= 6, L);
  const G = await E('launchGate');
  ok('it is owed once, under its own flag', G.owed && G.key === 'bag_s2_launch_seen', G);

  head('claiming the whole track');
  const CL = await E('claimAll');
  ok(`all ${CL.n} rewards claim, and every cosmetic lands in the closet`, CL.cos.length === 17 && CL.cos.every(c => c.owned), CL.cos.filter(c => !c.owned));

  head('page errors');
  ok('none', errs.length === 0, errs.slice(0, 3));
} finally {
  await b.close();
  try { fs.unlinkSync(PROBE); } catch (e) {}
}
console.log(bad ? `\n${bad} FAILED` : '\nall passed');
process.exit(bad ? 1 : 0);
