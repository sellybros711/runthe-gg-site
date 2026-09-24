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
  /* ---- overtime, stamps, holiday XP, Pass challenges ---- */
  setXp(xp){ var s=passState(); s.xp=xp; passSave(s); return {x:passTierX(xp), t:passTierAt(xp), claim:passClaimable()}; },
  xpAt(t){ return passXpForTierX(t); },
  consts(){ return {tiers:PASS_TIERS, otMax:PASS_OT_MAX, otCost:PASS_OT_COST, stamp:PASS_STAMP_TIER, marks:PASS_MARKS}; },
  histReset(){ try{ localStorage.removeItem(acctKey('bag_passhist')); }catch(e){} return passHist(); },
  hist(){ return passHist(); },
  /* a stale season's state sitting in storage, as a device carries it across a season boundary */
  staleSeason(n, tier){ LS.set(acctKey('bag_tourpass'), {season:n, xp:passXpForTierX(tier), pro:false, curveV:PASS_CURVE_V, claimed:{free:[],prem:[]}});
    var cur=passState(); return {hist:passHist(), now:cur.season, xp:cur.xp}; },
  histFrom(obj){ passHistFromState(obj); return passHist(); },
  mergeHist(a,b){ return mergePassHist(a,b); },
  stamps(){ return {list:passStamps(), code:passStampsCode(), html:passStampsHTML(), decoded:passStampsDecode(passStampsCode()), look:lookForBoard().stamps||null}; },
  card(){ var d=document.createElement('div'); d.innerHTML=playerCardHTML({self:true, name:'Rig', look:S.look||DEFLOOK, rep:'Amateur'}); var st=d.querySelector('.pcstamps'); return st?st.textContent:null; },
  otherCard(code){ var d=document.createElement('div'); d.innerHTML=playerCardHTML({self:false, uid:'x', name:'Other', look:Object.assign({},DEFLOOK,{stamps:code}), rep:'Amateur'}); var st=d.querySelector('.pcstamps'); return st?st.textContent:null; },
  event(){ return {now:(passEventNow()||{}).id||null, mult:passEventMult(), soon:(passEventSoon(3)||{e:{}}).e.id||null, line:passEventLine().replace(/<[^>]+>/g,''), chip:passEventChip().replace(/<[^>]+>/g,'')}; },
  addXp(n, boost){ try{ var w=wheelState(); w.boostUntil=boost?Date.now()+600000:0; wheelSave(w); }catch(e){}
    var s=passState(), before=s.xp; passAddXp(n); var after=passState().xp; S._passPop=null; return after-before; },
  eventNote(){ var got=[]; var t0=window.toast; window.toast=function(h){ got.push(String(h).replace(/<[^>]+>/g,' ')); };
    try{ Object.keys(localStorage).forEach(function(k){ if(k.indexOf('bag_passev_')>=0) localStorage.removeItem(k); }); }catch(e){}
    maybePassEventNote(); maybePassEventNote(); return new Promise(function(r){ setTimeout(function(){ window.toast=t0; r(got); }, 1700); }); },
  chalReset(){ try{ localStorage.removeItem(acctKey('bag_passchal')); }catch(e){} },
  chal(){ var st=passChalState(); return {theme:(passChalTheme()||{}).name||null, set:passChalSet().map(function(c){ return {id:c.id,grp:c.grp||null,metric:c.metric,target:c.target,xp:c.xp,label:c.label}; }), prog:st.prog, done:st.done, week:st.week, season:st.season}; },
  /* drive a metric through the REAL hook the game calls, and report the Pass XP it paid */
  hit(metric, n){ var t0=window.toast; window.toast=function(){}; var s0=passState().xp;
    if(metric==='dailyUnder'||metric==='packsOpened') passChalProgress(metric,n); else questWeekly(metric,n);
    window.toast=t0; S._passPop=null; return passState().xp-s0; },
  mergeChal(a,b){ return mergePassChal(a,b); },
  homeCard(){ return tourPassCard().textContent.replace(/\\s+/g,' '); },
  chalHTML(){ return passChalHTML().replace(/<[^>]+>/g,' ').replace(/\\s+/g,' '); },
  board(){ var n=challengesNode(); return n?n.textContent.replace(/\\s+/g,' '):''; },
  trackPage(){ var d=document.createElement('div'); document.body.appendChild(d); S.overlay='tourpass'; overlayTourPass(d);
    var q=function(x){ var e=d.querySelector(x); return e?e.textContent.replace(/\\s+/g,' '):null; };
    var out={head:q('.tp-tblock'), xp:q('.tp-xp'), ev:q('.tp-ev'), chal:q('.pchal'), stamps:q('.tp-stamps'), ot:q('.tp-ot'), otOn:d.querySelectorAll('.tp-otm.on').length, stampTag:!!d.querySelector('[data-t="30"] .tp-stq')};
    d.remove(); S.overlay=null; return out; },
  levelUp(fromTier, toTier){ var s=passState(); s.xp=passXpForTierX(toTier); passSave(s);
    S._passPop={xp0:passXpForTierX(fromTier), tier0:fromTier}; S.overlay=null; S.screen='title';
    var pend=passLevelPending(); flushPassLevel(); var pl=S.passLevel;
    var d=document.createElement('div'); document.body.appendChild(d); S.overlay='passlevel'; overlayPassLevel(d);
    var t=d.textContent.replace(/\\s+/g,' '); d.remove(); S.overlay=null; S.passLevel=null; return {pend:pend, tier1:pl&&pl.tier1, txt:t}; },
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
  ok('...and lists what is new about the track, from the live constants', /NEW THIS SEASON/i.test(L.txt) && /tier 90/.test(L.txt) && /tier 30/.test(L.txt) && /Halloween and Thanksgiving/.test(L.txt), L.txt.slice(L.txt.search(/NEW THIS SEASON/i), L.txt.search(/NEW THIS SEASON/i) + 400));
  const G = await E('launchGate');
  ok('it is owed once, under its own flag', G.owed && G.key === 'bag_s2_launch_seen', G);

  head('claiming the whole track');
  const CL = await E('claimAll');
  ok(`all ${CL.n} rewards claim, and every cosmetic lands in the closet`, CL.cos.length === 17 && CL.cos.every(c => c.owned), CL.cos.filter(c => !c.owned));

  const at = async (iso) => { await page.clock.setSystemTime(new Date(iso)); };

  head('overtime: the track keeps counting past 60, and pays nothing but a mark');
  await at('2026-10-10T16:00:00Z');
  await E('addXp', 0, false);   // clear any wheel boost left by the harness
  const K = await E('consts'), cap = await E('xpAt', 60);
  ok('overtime runs 61 to 90 at a flat cost', K.otMax === 90 && K.otCost > 0 && (await E('xpAt', 61)) - cap === K.otCost, K);
  let X = await E('setXp', cap);
  ok('tier 60 is tier 60 on both counts', X.x === 60 && X.t === 60, X);
  const claim60 = X.claim;
  X = await E('setXp', cap + K.otCost - 1);
  ok('one XP short of overtime tier 61 is still 60', X.x === 60, X);
  X = await E('setXp', cap + K.otCost);
  ok('overtime tier 61, while the reward tier stays 60', X.x === 61 && X.t === 60, X);
  X = await E('setXp', (await E('xpAt', 90)) + 999999);
  ok('overtime stops at 90', X.x === 90 && X.t === 60, X);
  ok('overtime adds nothing to claim', X.claim === claim60, { at60: claim60, at90: X.claim });
  await E('setXp', await E('xpAt', 75));
  let TP = await E('trackPage');
  ok('the header counts overtime', /OVERTIME/.test(TP.head) && /75/.test(TP.head) && /\/90/.test(TP.head), TP.head);
  ok('the overtime panel lights one mark at 75', TP.otOn === 1 && /TIER 70/.test(TP.ot), TP.ot);
  let LU = await E('levelUp', 60, 71);
  ok('crossing 70 is a level-up moment', LU.pend && LU.tier1 === 71 && /Overtime tier 71 reached/.test(LU.txt), LU.txt.slice(0, 200));
  ok('...that names the prestige mark', /★ Prestige mark on your Season 2 stamp/.test(LU.txt), LU.txt.slice(0, 400));
  ok('...and sends you to the track, with nothing to collect', /View the Track/.test(LU.txt) && !/Collect in the Tour Pass/.test(LU.txt));
  LU = await E('levelUp', 58, 62);
  ok('a climb through 60 lists the real tiers, then the overtime ones', /T59/.test(LU.txt) && /T60/.test(LU.txt) && /Overtime tiers 61 to 62 of 90/.test(LU.txt) && !/T61/.test(LU.txt), LU.txt.slice(0, 400));

  head('season stamps: tier 30 keeps a stamp for good');
  await E('setXp', await E('xpAt', 29));
  await E('histReset');   // after the move: setXp reads the old state first, and that read records its tier
  await E('trackPage');
  let H = await E('hist');
  ok('tier 29 is recorded, and is not a stamp', H['2'] === 29 && (await E('stamps')).list.length === 0, H);
  ok('no stamp, no stamp strip on the card', (await E('card')) === null);
  let tp29 = await E('trackPage');
  ok('the track says what the stamp needs', /Reach tier 30 to keep a Season 2 stamp/.test(tp29.stamps) && tp29.stampTag, tp29.stamps);
  const got = await E('addXp', (await E('xpAt', 31)) - (await E('xpAt', 29)), false);
  H = await E('hist');
  ok('earning XP records the new best tier by itself', H['2'] === 31 && got > 0, H);
  let ST = await E('stamps');
  ok('tier 31 is a Season 2 stamp', ST.list.length === 1 && ST.list[0].n === 2 && ST.list[0].marks === 0, ST.list);
  ok('the card carries it', (await E('card')) === 'S2', await E('card'));
  ok('the board look carries it for other players', ST.look === ST.code && ST.code === '2:31', ST);
  // Season 1 is kept even though its state is about to be thrown away.
  await E('histReset');
  let SS = await E('staleSeason', 1, 35);
  ok('a Season 1 track still on the device on Oct 5 becomes a Season 1 stamp', SS.hist['1'] === 35 && SS.now === 2 && SS.xp === 0, SS);
  await E('histReset');
  SS = await E('staleSeason', 1, 20);
  ok('tier 20 in Season 1 is recorded and earns nothing', SS.hist['1'] === 20 && (await E('stamps')).list.length === 0, SS.hist);
  H = await E('histFrom', { season: 1, xp: await E('xpAt', 72), curveV: 4 });
  ok('a Season 1 track arriving from the cloud counts too, overtime included', H['1'] === 72, H);
  H = await E('histFrom', { season: 1, xp: 10, curveV: 4 });
  ok('a smaller one never lowers it', H['1'] === 72, H);
  ok('the merge keeps each season\'s best and drops junk', JSON.stringify(await E('mergeHist', { 1: 35, 2: 10 }, { 1: 20, 2: 44, x: 5, 3: 400 })) === JSON.stringify({ 1: 35, 2: 44, 3: 90 }), await E('mergeHist', { 1: 35, 2: 10 }, { 1: 20, 2: 44, x: 5, 3: 400 }));
  ok('Season 1 at 72 shows one mark', (await E('card')) === 'S1★', await E('card'));
  ok('another player\'s stamps come off their look', (await E('otherCard', '1:35,2:90')) === 'S1S2★★★', await E('otherCard', '1:35,2:90'));
  ok('a garbled look shows nothing rather than breaking the card', (await E('otherCard', 'nonsense')) === null);

  head('holiday XP: Halloween and Thanksgiving weekends');
  await E('setXp', await E('xpAt', 20));
  await at('2026-10-10T16:00:00Z');
  let EV = await E('event');
  ok('Oct 10 is an ordinary day', EV.now === null && EV.mult === 1 && EV.soon === null && EV.line === '', EV);
  ok('an ordinary day pays ordinary XP', (await E('addXp', 100, false)) === 100);
  await at('2026-10-28T16:00:00Z');
  EV = await E('event');
  ok('two days out, the track says it is coming', EV.now === null && EV.soon === 'halloween' && /starts in 2 days/.test(EV.line), EV);
  await at('2026-10-29T16:00:00Z');
  ok('...and tomorrow the day before', /starts tomorrow/.test((await E('event')).line));
  await at('2026-10-31T16:00:00Z');
  EV = await E('event');
  ok('Halloween is double Pass XP', EV.now === 'halloween' && EV.mult === 2 && /2× Pass XP/.test(EV.chip), EV);
  ok('an award pays double', (await E('addXp', 100, false)) === 200);
  ok('a Prize Wheel boost stacks with it, so a boost won that weekend is not wasted', (await E('addXp', 100, true)) === 400);
  await E('addXp', 0, false);
  const note = await E('eventNote');
  ok('the weekend is announced once, with the day it ends', note.length === 1 && /Halloween Weekend/.test(note[0]) && /Sunday/.test(note[0]), note);
  TP = await E('trackPage');
  ok('the track says so', /Halloween Weekend/.test(TP.ev || '') && /2 days left/.test(TP.ev || ''), TP.ev);
  ok('the home screen\'s Tour Pass card wears the chip', /2× Pass XP/.test(await E('homeCard')), await E('homeCard'));
  await at('2026-11-02T04:30:00Z');   // 11:30pm ET Sunday Nov 1
  ok('it runs to the end of Sunday Eastern', (await E('event')).now === 'halloween');
  await at('2026-11-02T16:00:00Z');
  ok('Monday is ordinary again', (await E('event')).now === null && (await E('addXp', 100, false)) === 100);
  await at('2026-11-26T16:00:00Z');
  EV = await E('event');
  ok('Thanksgiving is double Pass XP', EV.now === 'thanksgiving' && EV.mult === 2, EV);
  await at('2026-11-30T16:00:00Z');
  ok('the Monday after is ordinary', (await E('event')).now === null);
  await at('2026-12-10T16:00:00Z');
  ok('Season 3 has no events until somebody writes them', (await E('event')).now === null && (await E('season')).n === 3);

  head('Pass challenges: three a week, Pass XP only');
  await at('2026-10-10T16:00:00Z');
  await E('setXp', await E('xpAt', 20));
  await E('chalReset');
  let CH = await E('chal');
  ok('three challenges, one from each group', CH.set.length === 3 && ['daily', 'career', 'extra'].every(g => CH.set.some(c => c.grp === g)) && CH.theme === null, CH.set);
  ok('each pays 300 Pass XP', CH.set.every(c => c.xp === 300));
  const c0 = CH.set[0];
  ok('short of the target pays nothing', (await E('hit', c0.metric, c0.target - 1)) === 0);
  ok('reaching it through the game\'s own hook pays once', (await E('hit', c0.metric, 1)) === 300);
  ok('...and never twice', (await E('hit', c0.metric, 5)) === 0);
  const other = ['dailyPlays', 'dailyBeats', 'dailyUnder', 'seasonsDone', 'tourneysWon', 'majorsWon', 'h2hMatches', 'h2hWins', 'packsOpened'].find(m => !CH.set.some(c => c.metric === m));
  ok('a metric not in this week\'s set pays nothing', (await E('hit', other, 50)) === 0, other);
  const txt = await E('chalHTML');
  ok('the panel shows progress and says it is Pass XP only', /1\/3/.test(txt) && /Pass XP only/.test(txt) && /Thursday/.test(txt), txt.slice(0, 200));
  const board = await E('board');
  ok('the Challenges board lists them under the weekly ones', board.indexOf('Weekly Challenges') >= 0 && board.indexOf('Pass Challenges') > board.indexOf('Weekly Challenges'), board.slice(0, 120));
  const weeks = new Set();
  for (const d of ['2026-10-08', '2026-10-15', '2026-10-22', '2026-11-12', '2026-11-19']) { await at(d + 'T16:00:00Z'); weeks.add((await E('chal')).set.map(c => c.id).join(',')); }
  ok('the set changes from week to week', weeks.size >= 3, [...weeks]);
  await at('2026-10-31T16:00:00Z');
  CH = await E('chal');
  ok('Halloween Week is its own themed set', CH.theme === 'Halloween Week' && CH.set.length === 3 && CH.set.every(c => c.xp === 450), CH.set.map(c => c.label));
  const packC = CH.set.find(c => c.metric === 'packsOpened');
  ok('opening packs completes the trick-or-treat challenge, doubled by the weekend', !!packC && (await E('hit', 'packsOpened', packC.target)) === 900);
  await at('2026-11-04T16:00:00Z');
  ok('the theme runs the whole challenge week, to Wednesday', (await E('chal')).theme === 'Halloween Week');
  await at('2026-11-05T16:00:00Z');
  ok('and Thursday is an ordinary week', (await E('chal')).theme === null);
  await at('2026-11-26T16:00:00Z');
  ok('Thanksgiving Week is themed too', (await E('chal')).theme === 'Thanksgiving Week');
  await at('2026-10-04T16:00:00Z');
  await E('chalReset'); await E('hit', 'dailyPlays', 2);
  const s1w = await E('chal');
  await at('2026-10-05T16:00:00Z');
  const s2w = await E('chal');
  ok('a week split by the season boundary starts fresh on Oct 5', s1w.season === 1 && s2w.season === 2 && s1w.week === s2w.week && Object.keys(s2w.prog).length === 0, { s1: s1w.prog, s2: s2w.prog });
  const MC = await E('mergeChal', { week: 5, season: 2, prog: { a: 1, b: 4 }, done: { x: 1 } }, { week: 5, season: 2, prog: { a: 3 }, done: { y: 1 } });
  ok('two devices in one week merge to the most of each', MC.prog.a === 3 && MC.prog.b === 4 && MC.done.x && MC.done.y, MC);
  ok('a newer week wins outright', (await E('mergeChal', { week: 5, season: 2, prog: { a: 9 }, done: {} }, { week: 6, season: 2, prog: {}, done: {} })).week === 6);
  ok('a newer season wins even with an older-looking week', (await E('mergeChal', { week: 9, season: 1, prog: {}, done: {} }, { week: 8, season: 2, prog: {}, done: {} })).season === 2);
  await at('2026-10-10T16:00:00Z');

  head('page errors');
  ok('none', errs.length === 0, errs.slice(0, 3));
} finally {
  await b.close();
  try { fs.unlinkSync(PROBE); } catch (e) {}
}
console.log(bad ? `\n${bad} FAILED` : '\nall passed');
process.exit(bad ? 1 : 0);
