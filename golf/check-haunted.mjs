/* Haunted Links: the October event page, its home card, and what it pays.
 *
 *   (nohup python3 -m http.server 8099 &)
 *   node golf/check-haunted.mjs
 *
 * The drop and the hunt were one event with no page of their own. This holds the page to the rules:
 *   PAYS ONCE   each step on the way pays its coins once, and the claim bar takes all of them at once
 *   KEEPS       the drop's own reward is still claimDropReward('spooky'), the hunt's prize still spkTryReward
 *   WINDOW      the card and the page exist in October only
 *   HINTS       every hidden thing has a hint, and the hints that name a screen take you there
 *   NOT SOLD    nothing on the page is bought: no step pays an item, only coins
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const HOST = process.env.HOST || 'http://localhost:8099';
const SRC = ROOT + '/golf/index.html';
const PROBE = ROOT + '/golf/__test_haunted.html';

let bad = 0;
const ok = (n, p, x) => { if (!p) bad++;
  console.log((p ? '  ok   ' : ' FAIL  ') + n + (x !== undefined ? '   ' + JSON.stringify(x).slice(0, 240) : '')); };
const head = (t) => console.log('\n' + t + '\n' + '-'.repeat(t.length));

const HOOK = `
window.__H = {
  rig(signed){ try{ localStorage.clear(); localStorage.setItem('bag_tour_done','true'); }catch(e){}
    sbUser=signed?{id:'hl-rig', email:'rig@example.com'}:null;
    var never=function(){ return {then:function(){ return this; }, catch:function(){ return this; }}; };
    sb={ from:function(){ return {select:function(){ return {eq:function(){ return {limit:never}; }, order:function(){ return {limit:never}; }, limit:never}; }}; }, rpc:never, functions:{invoke:never} };
    _walletCache={paid:0,lifePurchased:0,lifeGranted:0,tokens:0,passActive:false,passPeriod:'S'+passSeason().n};
    try{ cloudPush=function(){}; }catch(e){} S.overlay=null; S.screen='title'; return true; },
  own(n){ var d=dropById('spooky'), s=coinState(); d.items.forEach(function(ci,i){ var k=cosKey(ci[0],ci[1]); if(i<n) s.owned[k]=1; else delete s.owned[k]; }); coinSave(s); return dropProgress(d); },
  find(n){ LS.set(spkFoundKey(), SEASON_DECOR.spooky.eggs.slice(0,n)); return spkFoundCount(); },
  state(){ return {live:hlLive(), claimable:hlClaimable(), bal:coinBalance(), steps:HL_STEPS.map(function(s){ return s.id+':'+(hlStepClaimed(s)?'claimed':hlStepReady(s)?'ready':'no'); }),
    dropClaimed:dropRewardClaimed('spooky')}; },
  card(){ var l=homeModeList().map(function(m){ return m.id; }); var c=l.indexOf('haunted')>=0?hauntedCard().textContent.replace(/\\s+/g,' '):null; return {ids:l, card:c}; },
  page(){ var d=document.createElement('div'); document.body.appendChild(d); S.overlay='haunted'; overlayHaunted(d);
    var o={ shown:!!d.querySelector('.hl-ov'), claimBar:!!d.querySelector('[data-hlall]'), stepBtns:d.querySelectorAll('[data-hlstep]').length,
      dropBtn:!!d.querySelector('[data-hldrop]'), finds:d.querySelectorAll('.hl-f').length, gos:[].map.call(d.querySelectorAll('[data-hlgo]'),function(b){ return b.getAttribute('data-hlgo'); }),
      items:d.querySelectorAll('.dc').length, lit:d.querySelectorAll('.dc.own').length, txt:d.textContent.replace(/\\s+/g,' ') };
    d.remove(); S.overlay=null; return o; },
  claimAll(){ var t0=window.toast; window.toast=function(){}; var c=hlClaimAll(); window.toast=t0;
    var ov=document.getElementById('dropreward-ov'); if(ov) ov.remove(); return c; },
  hints(){ return SEASON_DECOR.spooky.eggs.map(function(id){ return {id:id, hint:HL_HINTS[id]||null, sprite:HL_SPRITE[id]||null, go:HL_GO[id]||null}; }); },
  popupGo(){ var d=document.createElement('div'); document.body.appendChild(d); overlaySpookySzn(d); var b=d.querySelector('.spk-go'); var t=b?b.textContent:'';
    var r0=window.render; window.render=function(){}; if(b) b.click(); window.render=r0; var o=S.overlay; d.remove(); S.overlay=null; return {txt:t, opens:o}; }
};
`;

const src = fs.readFileSync(SRC, 'utf8');
fs.writeFileSync(PROBE, src.replace(/<\/body>(?![\s\S]*<\/body>)/, '<script>' + HOOK + '</script></body>'));

const b = await chromium.launch();
const errs = [];
try {
  const page = await b.newPage({ viewport: { width: 390, height: 844 } });
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.clock.setSystemTime(new Date('2026-10-10T16:00:00Z'));
  await page.goto(HOST + '/golf/__test_haunted.html');
  await page.waitForFunction(() => window.__H && typeof passSeason === 'function');
  const E = (f, ...a) => page.evaluate(([f, a]) => window.__H[f](...a), [f, a]);

  head('October: the event is on');
  await E('rig', true);
  let st = await E('state');
  ok('the event is live', st.live === true, st);
  let C = await E('card');
  ok('the home screen carries a Haunted Links card beside the Tour Pass', C.ids.includes('haunted') && C.ids.includes('pass') && /Haunted Links/.test(C.card), C);
  ok('...that counts both meters', /Drop 0\/14/.test(C.card) && /Hunt 0\/10/.test(C.card), C.card);
  const P0 = await E('page');
  ok('the page shows all 14 drop pieces and all 10 hidden things', P0.shown && P0.items === 14 && P0.finds === 10, P0);
  ok('with nothing done, nothing is claimable', !P0.claimBar && P0.stepBtns === 0 && !P0.dropBtn, P0);
  ok('it names both big rewards', /Haunted Hollow/.test(P0.txt) && /Black Cat Ball/.test(P0.txt), P0.txt.slice(0, 200));

  head('the steps on the way pay once');
  await E('own', 3); await E('find', 5);
  st = await E('state');
  ok('3 items and 5 finds make two steps ready', st.claimable === 2 && st.steps.join() === 'drop3:ready,drop5:no,drop10:no,hunt5:ready', st);
  const P1 = await E('page');
  ok('the page offers the claim bar and both step buttons', P1.claimBar && P1.stepBtns === 2 && P1.lit === 3, P1);
  C = await E('card');
  ok('the card says there is something to claim', /2 to claim/.test(C.card), C.card);
  const bal0 = st.bal; const got = await E('claimAll');
  st = await E('state');
  ok('claiming all pays 1,500 + 500 coins', got === 2000 && st.bal - bal0 === 2000, { got, delta: st.bal - bal0 });
  ok('...and marks both claimed', st.steps.join() === 'drop3:claimed,drop5:no,drop10:no,hunt5:claimed' && st.claimable === 0, st);
  ok('claiming again pays nothing', (await E('claimAll')) === 0 && (await E('state')).bal === st.bal);

  head('the drop\'s own reward is still the drop\'s');
  await E('own', 7);
  st = await E('state');
  ok('7 pieces make the 5-piece step ready, and not the 10-piece step or the collection', st.claimable === 1 && st.steps[1] === 'drop5:ready' && st.steps[2] === 'drop10:no', st);
  let balB = st.bal; await E('claimAll');
  st = await E('state');
  ok('claiming it pays 3,000', st.bal - balB === 3000 && !st.dropClaimed, { delta: st.bal - balB });
  await E('own', 14);
  st = await E('state');
  ok('all 14 pieces make the 10-piece step and the collection reward ready', st.claimable === 2 && st.steps[2] === 'drop10:ready', st);
  balB = st.bal; await E('claimAll');
  st = await E('state');
  ok('claiming takes the step and the collection reward (5,000 + 100,000)', st.dropClaimed && st.bal - balB === 105000 && st.claimable === 0, { delta: st.bal - balB, st });

  head('hints');
  const H = await E('hints');
  ok('every hidden thing has a hint and a picture', H.every(h => h.hint && h.sprite), H.filter(h => !h.hint || !h.sprite));
  ok('the hints that name a screen take you there', H.filter(h => h.go).map(h => h.go).every(g => ['home', 'shop', 'tourpass', 'leaderboard', 'whatsnew'].includes(g)), H);
  await E('find', 2);
  const P2 = await E('page');
  ok('a found thing shows what it was, an unfound one its hint', /Found a spider/.test(P2.txt) && /Perched on the Tour Pass/.test(P2.txt), P2.txt.slice(0, 300));

  head('the announcement opens the event');
  const PG = await E('popupGo');
  ok('the October popup\'s button opens the Haunted Links page', /Open the event/.test(PG.txt) && PG.opens === 'haunted', PG);

  head('signed out');
  await E('rig', false); await E('own', 3);
  st = await E('state');
  ok('a guest has nothing claimable (rewards need an account)', st.claimable === 0, st);
  const PGu = await E('page');
  ok('...and is told so', /Sign in to claim/.test(PGu.txt), PGu.txt.slice(-120));

  head('November: the event is over');
  await page.clock.setSystemTime(new Date('2026-11-03T16:00:00Z'));
  await E('rig', true);
  st = await E('state');
  C = await E('card');
  ok('no event, no card', st.live === false && !C.ids.includes('haunted'), { st, ids: C.ids });

  head('page errors');
  ok('none', errs.length === 0, errs.slice(0, 3));
} finally {
  await b.close();
  try { fs.unlinkSync(PROBE); } catch (e) {}
}
console.log(bad ? `\n${bad} FAILED` : '\nall passed');
process.exit(bad ? 1 : 0);
