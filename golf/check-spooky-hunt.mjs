/* The Spooky Szn hunt: ten hidden things around the game, and the Black Cat Ball for finding them all.
 *
 *   (nohup python3 -m http.server 8099 &)
 *   node golf/check-spooky-hunt.mjs            add SHOTS=1 to save a screenshot of each place
 *
 * A hidden thing that is never drawn throws nothing. The hunt just can't be finished, and nobody finds
 * out except the player who looked everywhere. So this opens every place the hunt names, in a real
 * browser, and asks that the egg is there, visible and clickable:
 *
 *   PLACED     each of the ten ids is drawn where the list says it is, and only while the hunt is on
 *   PAID       finding all ten pays the Black Cat Ball and 1,000 coins, once, on the account
 *   FAIR       a player who found the first five (and was paid the coins then) gets the ball, not the
 *              coins again; a guest is told to sign in and is paid on the next render after they do
 *   EXCLUSIVE  the ball is never in a pack, never a coin buy, never in a drop or on the Tour Pass
 *   REDUCED    with reduced motion the bat roosts instead of flying, so the hunt can still be finished
 *
 * The date is Playwright's clock (Oct 10 2026, inside the October drop). The instrumented copy is
 * golf/__test_hunt.html, removed in a finally.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const HOST = process.env.HOST || 'http://localhost:8099';
const SRC = ROOT + '/golf/index.html';
const PROBE = ROOT + '/golf/__test_hunt.html';
const SHOTS = !!process.env.SHOTS;

let bad = 0;
const ok = (n, p, x) => { if (!p) bad++;
  console.log((p ? '  ok   ' : ' FAIL  ') + n + (x !== undefined ? '   ' + JSON.stringify(x).slice(0, 260) : '')); };
const head = (t) => console.log('\n' + t + '\n' + '-'.repeat(t.length));

const HOOK = `
window.__H = {
  signIn(){ sbUser={id:'hunt-rig', email:'rig@example.com'}; window._PACKSTEST=true;
    var never=function(){ return {then:function(){ return this; }, catch:function(){ return this; }}; };
    sb={ from:function(){ return {select:function(){ return {eq:function(){ return {limit:never}; }, order:function(){ return {limit:never}; }, limit:never}; }}; }, rpc:never, functions:{invoke:never} };
    _walletCache={paid:0, lifePurchased:0, lifeGranted:0, tokens:0, passActive:false, passPeriod:''};
    try{ cloudPush=function(){}; }catch(e){} },
  signOut(){ sbUser=null; },
  cfg(){ var c=SEASON_DECOR.spooky; return {eggs:c.eggs, found:c.found, coins:c.coins, prize:c.prize, live:decorLive()}; },
  reset(found, claimed){ LS.set(spkFoundKey(), found||[]); var st=coinState();
    delete st.owned[spkEggClaimKey()]; delete st.owned[cosKey('ball','blackcat')];
    if(claimed) st.owned[spkEggClaimKey()]=1; coinSave(st); },
  /* open a place the way the game does, then report the eggs drawn there */
  open(place){ S.overlay=null; S.screen='title';
    if(place==='shop'){ S.overlay='shop'; S.shopSec='apparel'; }
    else if(place==='closet'){ S.screen='setup'; }
    else if(place==='tourpass') S.overlay='tourpass';
    else if(place==='leaderboard') S.overlay='leaderboard';
    else if(place==='whatsnew') S.overlay='whatsnew';
    else if(place==='season') S.screen='season';
    else if(place==='daily') S.screen='dailyround';
    try{ render(); }catch(e){ return {err:e.message}; }
    return Array.prototype.map.call(document.querySelectorAll('.spk-egg'), function(b){ var r=b.getBoundingClientRect(), cs=getComputedStyle(b);
      return {id:b.getAttribute('data-egg')||null, label:b.getAttribute('aria-label'), cls:b.className, w:Math.round(r.width), h:Math.round(r.height), shown:cs.display!=='none'&&cs.visibility!=='hidden'&&r.width>0}; }); },
  /* click every egg on screen through the real handler, recording the toasts */
  clickAll(){ var got=[], t0=window.toast; window.toast=function(h){ got.push(String(h).replace(/<[^>]+>/g,'')); };
    Array.prototype.slice.call(document.querySelectorAll('.spk-egg')).forEach(function(b){ if(!b.classList.contains('gone')) b.click(); });
    window.toast=t0; return got; },
  find(id){ var got=[], t0=window.toast; window.toast=function(h){ got.push(String(h).replace(/<[^>]+>/g,'')); }; spkFind(id,null); window.toast=t0; return got; },
  state(){ var st=coinState(); return {found:spkFound(), count:spkFoundCount(), ball:!!st.owned[cosKey('ball','blackcat')], coinsClaimed:!!st.owned[spkEggClaimKey()], coins:coinBalance()}; },
  tryReward(){ var got=[], t0=window.toast; window.toast=function(h){ got.push(String(h).replace(/<[^>]+>/g,'')); }; var r=spkTryReward(); window.toast=t0; return {r:r, toasts:got}; },
  prize(){ var tile=function(store){ S.overlay=store?'shop':null; var o=(cosmeticItems('ball')||[]).find(function(x){ return x.id==='blackcat'; }); var h=o?cosTileHTML('ball',o):null; S.overlay=null; return h; };
    return {listed:(cosmeticItems('ball')||[]).some(function(o){ return o.id==='blackcat'; }), drawn:!!(PXG_BALL.blackcat&&PXG_BALL_PAL.blackcat),
      base:cosmeticPriceBase('ball','blackcat'), inPool:packPool().some(function(e){ return e.cat==='ball'&&e.id==='blackcat'; }),
      buy:cosBuy('ball','blackcat'), drop:!!DROP_BY_ITEM['ball|blackcat'], pass:!!passItemOf('ball','blackcat'), packOnly:cosPackOnly('ball','blackcat'),
      store:tile(true), locker:tile(false)}; },
  worn(){ var a=pxGolferCanvas(Object.assign({},DEFLOOK)).toDataURL(), b=pxGolferCanvas(Object.assign({},DEFLOOK,{ball:'blackcat'})).toDataURL(); return a!==b; },
  popupHint(){ var d=document.createElement('div'); document.body.appendChild(d); overlaySpookySzn(d); var h=d.querySelector('.spk-hint'); var t=h?h.textContent:''; d.remove(); S.overlay=null; return t; },
};`;

const src = fs.readFileSync(SRC, 'utf8');
const re = /<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g; let m, best = null;
while ((m = re.exec(src))) { if (!best || m[1].length > best[1].length) best = m; }
const at = best.index + best[0].length - '</script>'.length;
fs.writeFileSync(PROBE, src.slice(0, at) + '\n' + HOOK + '\n' + src.slice(at));

const PLACES = { home: ['homespider', 'homeghost', 'homebat'], shop: ['shopspider', 'previewghost'], tourpass: ['passbat'],
  leaderboard: ['boardghost'], whatsnew: ['newscat'], season: ['seasonpumpkin'], daily: ['dailyspider'] };

const b = await chromium.launch();
try {
  const boot = async (opts) => {
    const ctx = await b.newContext(Object.assign({ viewport: { width: 1280, height: 900 } }, opts || {}));
    const page = await ctx.newPage();
    const errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.addInitScript(() => { try { localStorage.setItem('bag_tour_done', 'true'); localStorage.setItem('bag_spooky_2026_seen', 'true'); } catch (e) {} });
    await page.clock.setSystemTime(new Date('2026-10-10T16:00:00Z'));
    await page.goto(HOST + '/golf/__test_hunt.html', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction('!!window.__H', null, { timeout: 20000 });
    const E = (f, ...a) => page.evaluate(([f, a]) => window.__H[f](...a), [f, a]);
    return { ctx, page, E, errs };
  };
  const { page, E, errs } = await boot();
  await E('signIn');

  head('the list');
  const C = await E('cfg');
  ok('the hunt is on in October', C.live === 'spooky', C.live);
  ok('ten things, no repeats', C.eggs.length === 10 && new Set(C.eggs).size === 10, C.eggs);
  ok('every one has a name for its toast', C.eggs.every(id => C.found[id]), C.eggs.filter(id => !C.found[id]));
  ok('the prize is the Black Cat Ball, plus 1,000 coins', C.prize && C.prize.cat === 'ball' && C.prize.id === 'blackcat' && C.coins === 1000, C);
  ok('the list here and the list in the game are the same ten', JSON.stringify(Object.values(PLACES).flat().sort()) === JSON.stringify(C.eggs.slice().sort()));
  const hint = await E('popupHint');
  ok('the October popup says ten, and names the prize', /^10 spooky things/.test(hint) && /Black Cat Ball/.test(hint) && /1,000 coins/.test(hint), hint);

  head('placed: every one is drawn where the list says, and can be seen');
  await E('reset', [], false);
  for (const [place, ids] of Object.entries(PLACES)) {
    const got = await E('open', place);
    if (got && got.err) { ok(`${place}: opens`, false, got); continue; }
    for (const id of ids) {
      const hit = got.find(g => g.id === id || (place === 'home' && g.label && (id === 'homespider' ? g.cls.includes('hang') : id === 'homeghost' ? g.cls.includes('peek') : g.cls.includes('fly'))) || (place === 'shop' && (id === 'shopspider' ? g.cls.includes('inbar') : g.cls.includes('mirror'))));
      ok(`${place}: ${id} is drawn and visible`, !!hit && hit.shown && hit.w >= 14 && hit.h >= 14, hit || got);
    }
    const others = got.filter(g => g.id && !ids.includes(g.id));
    ok(`${place}: and nothing from another place leaks onto it`, !others.length, others);
    if (SHOTS) await page.screenshot({ path: `/tmp/claude-0/hunt-${place}.png` });
  }

  head('paid: all ten, once');
  await E('reset', [], false);
  const c0 = (await E('state')).coins;
  let last = [];
  for (const place of Object.keys(PLACES)) { await E('open', place); last = await E('clickAll'); }
  let st = await E('state');
  ok('every egg clicked through the real handler counts', st.count === 10, st);
  ok('the last find pays the ball and the coins', st.ball && st.coinsClaimed && st.coins - c0 === 1000, { st, c0 });
  ok('and says so', last.some(t => /Black Cat Ball/.test(t) && /1,000 coins/.test(t)), last);
  await E('open', 'home');
  const again = await E('tryReward');
  ok('a render after that pays nothing more', again.r === false && (await E('state')).coins - c0 === 1000, again);
  ok('a found egg is not drawn again', (await E('open', 'tourpass')).every(g => g.id !== 'passbat'));
  ok('the ball changes the golfer it is put on', await E('worn'));

  head('fair: a player paid for the first five gets the ball, not the coins again');
  await E('reset', C.eggs.slice(0, 5), true);
  const c1 = (await E('state')).coins;
  for (const id of C.eggs.slice(5)) await E('find', id);
  st = await E('state');
  ok('ball granted', st.ball, st);
  ok('no second 1,000', st.coins === c1, { now: st.coins, before: c1 });
  await E('reset', ['homespider', 'homeghost', 'homebat', 'shopspider', 'previewghost', 'retired-id', 'another'], false);
  ok('an id that is not on the list does not fill a slot', (await E('state')).count === 5);

  head('fair: a guest finds them all and is paid after signing in');
  await E('reset', C.eggs.slice(0, 9), false);
  await E('signOut');
  const tg = await E('find', C.eggs[9]);
  ok('the guest is told to sign in for the ball', tg.some(t => /Sign in to claim the Black Cat Ball/.test(t)), tg);
  ok('and nothing is granted yet', !(await E('state')).ball);
  await E('signIn');
  await E('open', 'home');
  st = await E('state');
  ok('the next render after signing in pays it', st.ball && st.coinsClaimed, st);

  head('exclusive: the ball is never sold');
  await E('reset', [], false);
  const P = await E('prize');
  ok('listed and drawn', P.listed && P.drawn, P);
  ok('price 0, so in no pack pool', P.base === 0 && !P.inPool, P);
  ok('never a coin buy', !P.buy.ok && /earned, not bought/.test(P.buy.msg), P.buy);
  ok('not in a drop and not on the Tour Pass', !P.drop && !P.pass, P);
  const P2 = await E('prize');
  ok('in October the store shows it locked, with how to earn it', /Find all 10 spooky things/.test(P2.store || '') && !/data-kind="cos"/.test(P2.store || ''), (P2.store || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 160));
  ok('the closet shows the same locked tile', /Find all 10 spooky things/.test(P2.locker || ''));
  await page.clock.setSystemTime(new Date('2026-11-12T16:00:00Z'));
  const P3 = await E('prize');
  ok('in November the store hides it', P3.store === '', (P3.store || '').slice(0, 80));
  ok('and the hunt is over: nothing is drawn on the Tour Pass', (await E('open', 'tourpass')).length === 0);
  await page.clock.setSystemTime(new Date('2026-10-10T16:00:00Z'));

  head('page errors');
  ok('none', !errs.length, errs);

  head('reduced: with reduced motion the bat roosts, so the hunt can be finished');
  const R = await boot({ reducedMotion: 'reduce' });
  await R.E('signIn'); await R.E('reset', [], false);
  const rh = await R.E('open', 'home');
  const bat = rh.find(g => /A bat/.test(g.label || ''));
  ok('the bat is on the home screen, roosting and visible', !!bat && /roost/.test(bat.cls) && bat.shown, rh);
  ok('no page errors', !R.errs.length, R.errs);
  await R.ctx.close();
} finally {
  await b.close();
  try { fs.unlinkSync(PROBE); } catch (e) {}
}
console.log(bad ? `\n${bad} FAILED` : '\nall good');
process.exit(bad ? 1 : 0);
