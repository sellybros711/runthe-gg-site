/* The Tour Pass buys unlimited daily plays. Does it, in a browser?
 *
 *   (nohup python3 -m http.server 8099 &)
 *   node golf/verify-daily-pass.mjs
 *
 * A paying player reported that the unlimited daily plays their pass promises were not working. The
 * pass was honoured in exactly two of the eight places that decide whether you may play, so once the
 * three free attempts were gone the home card said DONE, the draft button would not arm, and a fourth
 * round was REFUSED at submission after being played. This drives every one of those gates.
 *
 * The wallet is stubbed rather than bought: pass ownership lives on the server, and the client asks a
 * Supabase RPC for it. The stub sets the same cache that RPC fills, so every gate below runs the shipped
 * code against the state a real pass produces, and nothing reaches the network or a checkout.
 *
 * Three accounts are checked at three used attempts, because the bug is only visible once the free ones
 * are gone: a PASS holder must be able to play, a plain account must NOT (or the fix has given the game
 * away), and a wallet that has not loaded yet must not hand out plays it cannot vouch for.
 *
 * The instrumented copy is written into golf/ and removed in a finally. If a crash leaves one behind it
 * is called __test_dailypass.html and is safe to delete.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const HOST = process.env.HOST || 'http://localhost:8099';
const SRC = ROOT + '/golf/index.html';
const PROBE = ROOT + '/golf/__test_dailypass.html';

let bad = 0;
const ok = (n, p, x) => { if (!p) bad++;
  console.log((p ? '  ok   ' : ' FAIL  ') + n + (x !== undefined ? '   ' + JSON.stringify(x).slice(0, 200) : '')); };
const head = (t) => console.log('\n' + t + '\n' + '-'.repeat(t.length));

const HOOK = `
window.__DP = {
  toasts: [],
  /* kind: pass | plain | dev | loading. used = how many of today's attempts are already spent. */
  rig(kind, used){
    this.toasts=[];
    try{ localStorage.clear(); localStorage.setItem('bag_tour_done','true'); }catch(e){}
    reset();
    sbUser={id:'rig-user', email:'rig@example.com'};
    var never=function(){ return {then:function(){ return this; }, catch:function(){ return this; }}; };
    sb={ from:function(){ return {select:function(){ return {eq:function(){ return {limit:never}; },
      order:function(){ return {limit:never}; }, limit:never}; }}; }, rpc:never };
    // the wallet the pass lives in. 'loading' leaves it null, which is the state of a cold load.
    _walletCache = kind==='loading' ? null
      : {paid:0, lifePurchased:0, lifeGranted:0, tokens:0, passActive:(kind==='pass'), passPeriod:'S1'};
    window.__DP._dev=(kind==='dev');
    if(used>0){ LS.set(acctKey('bag_daily'), {date:todayKey(), attempts:used,
      best:{day:todayKey(), course:S.dailyCourse||dailyCourseKey(todayKey()), total:-2, par:72, ovr:80}, result:null}); }
    S.screen='home'; S.overlay=null;
    return {used:dailyAttempts(), signedIn:sbSignedIn()};
  },
  gates(){
    return { left:dailyAttemptsLeft(), uncapped:dailyUncapped(), done:dailyDoneToday(),
      passActive:dailyPassActive(), unlimited:dailyUnlimited(),
      // the home screen's own "is today's round still worth doing" test
      homeActionable:(function(){ try{ return !!homeModeList().find(function(m){return m.id==='daily';}).act; }catch(e){ return null; } })(),
      // the preview screen's draft gate, the exact expression that screen uses
      canDraft:(PRACTICE || dailyAttemptsLeft()>0) };
  },
  heroCard(){ try{ return dailyHeroCard().innerText.replace(/\\s+/g,' ').trim(); }catch(e){ return 'ERR '+e.message; } },
  /* press the Daily Challenge button and report where it landed */
  press(){ S.overlay=null; startDailyChallenge();
    return {screen:S.screen, overlay:S.overlay||null}; },
  /* the submission gate: play a round, then offer it for saving */
  claim(){
    S.dailyClaimMsg=null;
    S._claimDaily={day:todayKey(), course:dailyCourseKey(todayKey()), total:-4, par:72, ovr:80, won:true, holes:[]};
    var out=maybeClaimDaily();
    return {ran:out, msg:S.dailyClaimMsg, refused:!!(S.dailyClaimMsg && S.dailyClaimMsg.ok===false)};
  },
  /* the result screen, which is where a player who has already played today is sent */
  resultText(){
    try{
      S.daily=true; S.dailyResult=null;
      S.screen='dailyresult'; render();
      var el=document.querySelector('.screen');
      return el?el.innerText.replace(/\\s+/g,' ').trim():'';
    }catch(e){ return 'ERR '+e.message; }
  }
};
// devMode() decides the dev branch; the rig drives it rather than needing one of the real dev names
(function(){ var real=devMode; devMode=function(){ return window.__DP && window.__DP._dev ? true : real(); }; })();
(function(){ var real=toast; toast=function(m,d){ try{ window.__DP.toasts.push(String(m)); }catch(e){} return real(m,d); }; })();
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

const run = async () => {
  buildProbe();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 430, height: 900 } });
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/i.test(m.text())) errs.push('console: ' + m.text()); });
  await page.addInitScript(() => { try { localStorage.setItem('bag_tour_done', 'true'); } catch (e) {} });
  await page.goto(HOST + '/golf/__test_dailypass.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('!!window.__DP', null, { timeout: 20000 });

  const rig = (kind, used) => page.evaluate(a => window.__DP.rig(a[0], a[1]), [kind, used]);
  const gates = () => page.evaluate(() => window.__DP.gates());

  // ── the reported bug ───────────────────────────────────────────────────────
  head('a pass holder with all three free attempts spent');
  const r0 = await rig('pass', 3);
  ok('the rig has an account with three attempts used', r0.signedIn && r0.used === 3, r0);
  const g = await gates();
  ok('the pass is seen', g.passActive === true);
  ok('and it lifts the cap', g.uncapped === true && g.left > 0, { uncapped: g.uncapped, left: g.left });
  ok('the day is not "done"', g.done === false);
  ok('the home card still offers the round', g.homeActionable === true);
  ok('the draft button arms', g.canDraft === true);
  const hero = await page.evaluate(() => window.__DP.heroCard());
  ok('the card says unlimited, not DONE', /PRO/.test(hero) && !/\bDONE\b/.test(hero), hero.slice(0, 90));
  ok('and never prints the 99 sentinel at the player', !/99/.test(hero), hero.slice(0, 90));
  const p = await page.evaluate(() => window.__DP.press());
  ok('pressing Daily does not hit the "done for today" wall', p.overlay !== 'dailydone', p);

  head('the round they play is actually saved');
  await rig('pass', 3);
  const c = await page.evaluate(() => window.__DP.claim());
  ok('a fourth round is not refused at submission', c.refused === false, c.msg);
  ok('it is recorded as an attempt', !!(c.msg && c.msg.ok === true), c.msg);
  const toasts = await page.evaluate(() => window.__DP.toasts);
  ok('and the player is not told they are out of attempts', !toasts.some(t => /out of attempts/i.test(t)), toasts);

  head('the result screen they get sent to');
  await rig('pass', 3);
  const res = await page.evaluate(() => window.__DP.resultText());
  ok('offers another round', /play again|go lower/i.test(res), res.slice(0, 120));
  ok('and says unlimited rather than "99 left"', !/99/.test(res), (res.match(/.{0,40}99.{0,40}/) || [''])[0]);

  // ── the fix must not give the game away ────────────────────────────────────
  head('a plain account, same three attempts spent');
  await rig('plain', 3);
  const g2 = await gates();
  ok('is still capped', g2.uncapped === false && g2.left === 0, g2);
  ok('is done for the day', g2.done === true);
  ok('its home card is not actionable', g2.homeActionable === false);
  ok('and cannot draft', g2.canDraft === false);
  // Pressing Daily with a score already on the board shows you that score, capped or not: the wall is
  // the result screen refusing another round, not an overlay. Asserting the overlay was asserting a
  // route this account never takes.
  const p2 = await page.evaluate(() => window.__DP.press());
  ok('pressing Daily shows today\'s round', p2.screen === 'dailyresult', p2);
  const res2 = await page.evaluate(() => window.__DP.resultText());
  ok('and that screen does NOT offer another one', !/play again|go lower/i.test(res2), (res2.match(/.{0,60}(play again|go lower).{0,20}/i) || ['(no offer, correct)'])[0]);
  await rig('plain', 3);
  const c2 = await page.evaluate(() => window.__DP.claim());
  ok('and a fourth score is still refused', c2.refused === true, c2.msg);

  head('a wallet that has not loaded yet');
  await rig('loading', 3);
  const g3 = await gates();
  ok('does not hand out plays it cannot vouch for', g3.uncapped === false && g3.done === true, g3);

  head('the accounts that already worked');
  await rig('pass', 0);
  const g4 = await gates();
  ok('a pass holder who has not played is fine', g4.done === false && g4.uncapped === true, g4);
  await rig('plain', 0);
  const g5 = await gates();
  ok('so is a plain account with attempts left', g5.done === false && g5.left === 3, g5);
  await rig('dev', 3);
  const g6 = await gates();
  ok('and a dev account is still uncapped', g6.uncapped === true && g6.unlimited === true, g6);
  const hero6 = await page.evaluate(() => window.__DP.heroCard());
  ok('with its own badge, not the pass one', /DEV/.test(hero6), hero6.slice(0, 60));

  head('page errors');
  ok('none', errs.length === 0, errs.slice(0, 4));
  await browser.close();
};

try { await run(); } finally { try { fs.unlinkSync(PROBE); } catch (e) {} }
console.log('\n' + (bad ? bad + ' FAILED' : 'all good'));
process.exit(bad ? 1 : 0);
