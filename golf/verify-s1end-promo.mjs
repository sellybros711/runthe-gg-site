/* The Season 1 closing popup, and the tier 20 boost that comes with buying late.
 *
 *   (nohup python3 -m http.server 8099 &)
 *   node golf/verify-s1end-promo.mjs
 *
 * The owner's contract is three sentences long and every one of them is a way to lose money or trust:
 *
 *   it must NOT show to anybody who already bought the pass   (selling a man his own pass)
 *   it must show ONCE per unique user                         (a nag screen on every launch)
 *   buying now unlocks the first 20 tiers                     (a promise made in copy, kept in code)
 *
 * The dangerous one is the first. Pass ownership lives on the server and arrives by RPC a moment after
 * sign-in, so dailyPassActive() is false on every cold load before the wallet lands. A gate that only
 * asked "do they own it" would fire at holders roughly always. The popup therefore also waits on the
 * wallet being LOADED, and that wait is asserted here rather than trusted.
 *
 * The wallet is stubbed rather than bought, same as verify-daily-pass.mjs: the stub fills the cache the
 * RPC fills, so the shipped gates run against the state a real purchase produces and nothing touches the
 * network or a checkout.
 *
 * The instrumented copy is written into golf/ and removed in a finally. If a crash leaves one behind it
 * is called __test_s1end.html and is safe to delete.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const HOST = process.env.HOST || 'http://localhost:8099';
const SRC = ROOT + '/golf/index.html';
const PROBE = ROOT + '/golf/__test_s1end.html';
const SHOTS = ROOT + '/golf/__shots';

let bad = 0;
const ok = (n, p, x) => { if (!p) bad++;
  console.log((p ? '  ok   ' : ' FAIL  ') + n + (x !== undefined ? '   ' + JSON.stringify(x).slice(0, 220) : '')); };
const head = (t) => console.log('\n' + t + '\n' + '-'.repeat(t.length));

const HOOK = `
window.__S1 = {
  toasts: [], bought: 0,
  /* kind: plain | holder | loading | guest.  tier = where the free lane already sits.
     season = which pass season to pretend today falls in.  left = days remaining in it.
     seen = beat ids this account has already met (true is shorthand for the legacy s1end flag). */
  rig(o){
    o=o||{}; this.toasts=[]; this.bought=0;
    try{ localStorage.clear(); localStorage.setItem('bag_tour_done','true'); }catch(e){}
    reset();
    var kind=o.kind||'plain';
    sbUser = kind==='guest' ? null : {id:o.user||'rig-user', email:'rig@example.com'};
    var never=function(){ return {then:function(){ return this; }, catch:function(){ return this; }}; };
    sb={ from:function(){ return {select:function(){ return {eq:function(){ return {limit:never}; },
      order:function(){ return {limit:never}; }, limit:never}; }}; }, rpc:never };
    _walletCache = kind==='loading' ? null
      : {paid:0, lifePurchased:0, lifeGranted:0, tokens:0,
         passActive:(kind==='holder'), passPeriod:'S'+(o.season||1)};
    window.__S1._season = o.season||1;
    window.__S1._left = o.left||0;
    /* Anybody reaching the END of season 1 has already met its LAUNCH popup, which sits ahead of this one
       in the queue. Leaving it unseen would mean every case below tested the launch popup's gate. */
    if(!o.launchUnseen){ LS.set('bag_s1_launch_seen', true); }
    LS.set('bag_rosterhint_seen', true);   // its spotlight would sit on top of every screenshot below
    if(o.tier){ var ps=passState(); ps.xp=passXpForTier(o.tier); passSave(ps); }
    if(o.seen===true){ LS.set(acctKey('bag_pass'), {s1end:1}); }
    else if(Array.isArray(o.seen)){ LS.set(acctKey('bag_pass'), {s1seen:o.seen.slice()}); }
    S.screen='title'; S.overlay=null;
    return {signedIn:sbSignedIn(), season:passSeason().n, left:passSeason().daysLeft,
      tier:passTierAt(passState().xp), holder:dailyPassActive(), beat:s1EndBeat().id};
  },
  pending(){ return s1EndPending(); },
  beat(){ return s1EndBeat().id; },
  seen(){ return s1EndSeen(); },
  beats(){ return S1_END_BEATS.map(function(b){ return {id:b.id, at:b.at}; }); },
  /* which gate is holding it, when one is. worth having: every one of these is a silent return. */
  why(){ return {pending:s1EndPending(), overlay:S.overlay||null, screen:S.screen,
    tour:(typeof tourRunning==='function'&&tourRunning()), welcome:welcomePackPending(),
    launch:s1LaunchPending(), login:!!S._loginPending}; },
  /* run the real launch-time queue entry and report where it left the game */
  fire(){ S.overlay=null; S.screen='title'; maybeS1EndPopup();
    return {overlay:S.overlay||null, flag:!!(LS.get(acctKey('bag_pass'),null)||{}).s1end,
      seen:s1EndSeen()}; },
  /* walk a whole season a day at a time and collect every beat that actually fires */
  season(){ var out=[];
    for(var left=TOURPASS_LEN; left>=1; left--){
      window.__S1._left=left;
      var before=s1EndSeen().length; window.__S1.fire();
      if(s1EndSeen().length>before) out.push({left:left, beat:s1EndSeen()[s1EndSeen().length-1],
        head:(document.querySelector('.ov.s1eov .s1head')||{}).innerText});
      S.overlay=null;
    }
    return out; },
  /* the rendered overlay, as a player sees it */
  paint(){ S.overlay='s1end'; render();
    var el=document.querySelector('.ov.s1eov');
    return el?{beat:s1EndBeat().id, tag:el.querySelector('.s1tag').innerText.trim(),
      head:el.querySelector('.s1head').innerText.replace(/\\s+/g,' ').trim(),
      lede:el.querySelector('.s1lede').innerText.replace(/\\s+/g,' ').trim(),
      cta:el.querySelector('.buy').innerText.trim(),
      txt:el.innerText.replace(/\\s+/g,' ').trim(),
      cells:Array.prototype.map.call(el.querySelectorAll('[data-cd]'),function(b){ return b.textContent; }),
      btns:Array.prototype.map.call(el.querySelectorAll('.btn'),function(b){ return b.innerText.trim(); })}:null; },
  /* the ids of every interval started while fn ran, so the countdown's own timer can be followed rather
     than a running total that other screens also move */
  spawned(fn){ var pre=new Set(window.__S1._ids); fn();
    return Array.from(window.__S1._ids).filter(function(i){ return !pre.has(i); }); },
  liveOf(ids){ return ids.filter(function(i){ return window.__S1._ids.has(i); }); },
  clockCells(){ var el=document.querySelector('.ov.s1eov');
    return el?Array.prototype.map.call(el.querySelectorAll('[data-cd]'),function(b){ return b.textContent; }):null; },
  /* the date and the deadline, as the page computes them */
  dates(){ var e=passSeasonEndUTC(1), m=passSeasonEndMs(1);
    return {txt:passSeasonEndTxt(1), endDay:new Date(e).toISOString().slice(0,10),
      endMs:new Date(m).toISOString(), season2:passSeasonEndTxt(2), cd:passCountdown(1),
      epoch:TOURPASS_EPOCH, len:TOURPASS_LEN, boostTiers:PASS_S1_BOOST_TIERS}; },
  /* the grant, run for real: this is the function a completed purchase calls */
  grant(){ var before=passTierAt(passState().xp);
    maybePassRewards();
    var after=passTierAt(passState().xp);
    maybePassRewards();                              // twice: the boost must not stack
    return {before:before, after:after, again:passTierAt(passState().xp),
      claimable:passClaimable(), toasts:window.__S1.toasts.slice()}; },
};
(function(){ var real=toast; toast=function(m,d){ try{ window.__S1.toasts.push(String(m).replace(/<[^>]*>/g,' ')); }catch(e){} return real(m,d); }; })();
/* track live intervals by id, so a countdown that keeps ticking after its overlay is gone is a failure
   rather than a mystery slowdown three screens later */
window.__S1._ids=new Set();
(function(){ var si=window.setInterval, ci=window.clearInterval;
  window.setInterval=function(){ var id=si.apply(window,arguments); window.__S1._ids.add(id); return id; };
  window.clearInterval=function(id){ window.__S1._ids.delete(id); return ci.apply(window,arguments); }; })();
/* Pretend today falls somewhere else in the pass calendar, without moving the machine's clock. _left is
   days remaining in the season, which is what picks a beat. */
(function(){ var real=passSeason; passSeason=function(){ var r=real();
  if(window.__S1 && window.__S1._season && window.__S1._season!==1){ r.n=window.__S1._season; }
  if(window.__S1 && window.__S1._left){ r.daysLeft=window.__S1._left; r.day=r.len-r.daysLeft+1; }
  return r; }; })();
/* ...and move the DEADLINE with it, so the rendered clock agrees with the beat on screen. Six and a half
   hours past the last midnight, so the final day reads 0 days and some hours rather than a flat zero. */
(function(){ var real=passSeasonEndMs; passSeasonEndMs=function(n){
  if(window.__S1 && window.__S1._left && (n|0)===1) return Date.now()+(window.__S1._left-1)*86400000+23400000;
  return real(n); }; })();
(function(){ var real=beginPassPurchase; beginPassPurchase=function(){ window.__S1.bought++; return true; }; })();
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
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 430, height: 932 } });
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/i.test(m.text())) errs.push('console: ' + m.text()); });
  await page.addInitScript(() => { try { localStorage.setItem('bag_tour_done', 'true'); } catch (e) {} });
  await page.goto(HOST + '/golf/__test_s1end.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('!!window.__S1', null, { timeout: 20000 });

  const rig = (o) => page.evaluate(a => window.__S1.rig(a), o);
  const pending = () => page.evaluate(() => window.__S1.pending());

  head('the deadline the copy quotes');
  const D = await page.evaluate(() => window.__S1.dates());
  console.log('    season 1 runs ' + D.len + ' days from epoch day ' + D.epoch);
  console.log('    last day ' + D.endDay + ' · locks at ' + D.endMs + ' · reads as "' + D.txt + '"');
  ok('the last day is derived from the epoch and the length, not written down',
    D.endDay === '2026-10-04', D.endDay);
  ok('and the deadline is the END of that day, so the clock does not expire a day early',
    D.endMs === '2026-10-05T00:00:00.000Z', D.endMs);
  ok('season 2 ends on its own date', /December/.test(D.season2), D.season2);
  ok('the boost is the 20 tiers the copy promises', D.boostTiers === 20);
  ok('the countdown is running and inside the season', D.cd.ms > 0 && D.cd.d < D.len, D.cd);

  // ── who sees it ────────────────────────────────────────────────────────────
  head('a signed-in player who has not bought the pass');
  const r0 = await rig({ kind: 'plain', tier: 6 });
  ok('the rig is in season 1, signed in, not a holder', r0.signedIn && r0.season === 1 && !r0.holder, r0);
  ok('the popup is pending', (await pending()) === true);
  const f0 = await page.evaluate(() => window.__S1.fire());
  ok('and it opens', f0.overlay === 's1end', await page.evaluate(() => window.__S1.why()));
  ok('the seen flag is written the moment it opens', f0.flag === true);
  ok('so it is no longer pending', (await pending()) === false);
  const f1 = await page.evaluate(() => window.__S1.fire());
  ok('the same beat never opens twice', f1.overlay === null, f1);

  // ── the five beats ─────────────────────────────────────────────────────────
  head('which beat a given day belongs to');
  const B = await page.evaluate(() => window.__S1.beats());
  console.log('    ' + B.map(b => b.id + (b.at ? ' at ' + b.at + 'd' : ' (intro)')).join('  ·  '));
  ok('five beats: an introduction and four deadlines', B.length === 5, B);
  ok('and they tighten', B.slice(1).every((b, i) => i === 0 || b.at < B[i].at), B);
  const want = { 60: 's0', 27: 's0', 16: 's0', 15: 's0', 14: 's14', 13: 's14', 8: 's14', 7: 's7', 5: 's7', 4: 's7', 3: 's3', 2: 's3', 1: 's1' };
  for (const [left, id] of Object.entries(want)) {
    const r = await rig({ kind: 'plain', left: +left });
    ok(`${String(left).padStart(2)} days left is the ${id} beat`, r.beat === id, { left, got: r.beat });
  }

  head('a player who opens the game every day of the season');
  await rig({ kind: 'plain', tier: 6 });
  const walk = await page.evaluate(() => window.__S1.season());
  console.log('    ' + walk.map(w => w.left + 'd: ' + w.beat + ' "' + String(w.head).replace(/\s+/g, ' ') + '"').join('\n    '));
  ok('meets it five times across sixty days, not five times in a week', walk.length === 5, walk.length);
  ok('in order, one per beat', walk.map(w => w.beat).join(',') === 's0,s14,s7,s3,s1', walk.map(w => w.beat));
  ok('at the marks the owner asked for', walk.map(w => w.left).join(',') === '60,14,7,3,1', walk.map(w => w.left));
  ok('and every one of them says something different',
    new Set(walk.map(w => w.head)).size === 5, walk.map(w => w.head));

  head('a player whose first visit is late');
  const rl = await rig({ kind: 'plain', left: 5 });
  ok('gets the beat for the day they turned up', rl.beat === 's7', rl);
  const fl = await page.evaluate(() => window.__S1.fire());
  ok('and the earlier ones are never backfilled at them', fl.seen.join(',') === 's7', fl.seen);
  const late = await page.evaluate(() => { window.__S1._left = 1; return window.__S1.fire(); });
  ok('the last day still reaches them', late.overlay === 's1end' && late.seen.join(',') === 's7,s1', late.seen);

  head('an account that saw a beat on another device');
  await rig({ kind: 'plain', seen: ['s0'] });
  ok('does not see that one here', (await pending()) === false);
  await rig({ kind: 'plain', seen: ['s0'], left: 7 });
  ok('but a beat it has NOT seen still fires', (await pending()) === true);
  const merged = await page.evaluate(() => mergePass({ s1seen: ['s0', 's14'] }, { s1seen: ['s0', 's7'] }));
  ok('because a merge unions the beats from both sides',
    merged.s1seen.slice().sort().join(',') === 's0,s14,s7', merged.s1seen);
  const merged2 = await page.evaluate(() => mergePass({ s1end: 1 }, { claimed: 'S1' }));
  ok('the flag the first version wrote still counts as the intro',
    merged2.s1seen.join(',') === 's0' && merged2.s1end === true, merged2);
  await rig({ kind: 'plain', seen: true });
  ok('...so an account upgraded from that build does not replay it', (await pending()) === false);
  const merged3 = await page.evaluate(() => mergePass({ claimed: 'S1' }, { claimed: 'S1' }));
  ok('and an account that has seen nothing is not marked as having seen anything',
    !merged3.s1end && merged3.s1seen.length === 0, merged3);

  head('the people it must never sell to');
  await rig({ kind: 'holder' });
  ok('a pass holder is not asked to buy the pass', (await pending()) === false);
  await rig({ kind: 'loading' });
  ok('a wallet still in flight waits rather than guessing', (await pending()) === false);
  await rig({ kind: 'guest' });
  ok('a signed-out visitor is not a unique user, so no popup', (await pending()) === false);
  await rig({ kind: 'plain', season: 2 });
  ok('and it is a SEASON 1 promotion, gone in season 2', (await pending()) === false);

  head('it waits its turn in the launch queue');
  await rig({ kind: 'plain' });
  const q1 = await page.evaluate(() => { S._loginPending = true; S.overlay = null; S.screen = 'title';
    maybeS1EndPopup(); var o = S.overlay || null; S._loginPending = false; return o; });
  ok('a queued login bonus goes first', q1 === null, q1);
  ok('and the popup is still pending afterwards', (await pending()) === true);
  const q2 = await page.evaluate(() => { S.overlay = 'shop'; maybeS1EndPopup(); return S.overlay; });
  ok('it never lands on top of an open overlay', q2 === 'shop', q2);
  const q3 = await page.evaluate(() => { S.overlay = null; S.screen = 'play'; maybeS1EndPopup(); return { s: S.screen, o: S.overlay || null }; });
  ok('or in the middle of a round', q3.o === null, q3);
  await rig({ kind: 'plain', launchUnseen: true });
  const q4 = await page.evaluate(() => window.__S1.fire());
  ok('and a player who never saw the SEASON LAUNCH popup gets that one first', q4.overlay === null, q4);
  ok('with the closing popup still owed to them', (await pending()) === true);

  // ── what it says ───────────────────────────────────────────────────────────
  head('what a player below tier 20 reads');
  await rig({ kind: 'plain', tier: 6 });
  const p1 = await page.evaluate(() => window.__S1.paint());
  console.log('    ' + p1.txt.slice(0, 260));
  // the headline is uppercased by CSS, so the DOM text is compared case-blind
  ok('it names the closing date', p1.txt.toLowerCase().includes(D.txt.toLowerCase()), D.txt);
  ok('it counts down in days, hours, minutes and seconds',
    /DAYS.*HRS.*MIN.*SEC/i.test(p1.txt), p1.txt.slice(0, 120));
  ok('the clock is filled in, not left on its placeholder',
    p1.cells.length === 4 && p1.cells.every(c => /^\d+$/.test(c)), p1.cells);
  ok('the three lower units are zero padded', p1.cells.slice(1).every(c => c.length === 2), p1.cells);
  ok('it promises the jump to tier 20', /Tier 20/.test(p1.txt), (p1.txt.match(/.{0,40}Tier 20.{0,40}/) || [''])[0]);
  ok('and says how many tiers that is worth from here', /14 tiers/.test(p1.txt), (p1.txt.match(/.{0,30}\d+ tiers.{0,20}/) || [''])[0]);
  ok('it says the track locks with the season', /lock/i.test(p1.txt));
  ok('it quotes the price', /\$14\.99/.test(p1.txt));
  ok('three ways out: buy, look, dismiss', p1.btns.length === 4, p1.btns);

  head('the clock actually ticks');
  const c1 = await page.evaluate(() => window.__S1.clockCells());
  await page.waitForTimeout(2100);
  const c2 = await page.evaluate(() => window.__S1.clockCells());
  ok('the seconds move on their own', c1[3] !== c2[3], { was: c1[3], now: c2[3] });
  ok('and the days do not', c1[0] === c2[0], { was: c1[0], now: c2[0] });
  const ids = await page.evaluate(() => window.__S1.spawned(() => window.__S1.paint()));
  ok('painting it starts exactly one timer', ids.length === 1, ids);
  await page.evaluate(() => { S.overlay = null; render(); });
  await page.waitForTimeout(1400);
  const stillLive = await page.evaluate(i => window.__S1.liveOf(i), ids);
  ok('closing the popup stops that timer', stillLive.length === 0, { spawned: ids, live: stillLive });

  head('what a player already past tier 20 reads');
  await rig({ kind: 'plain', tier: 26 });
  const p2 = await page.evaluate(() => window.__S1.paint());
  ok('it does not offer to move them backwards', !/jump to/i.test(p2.txt), (p2.txt.match(/.{0,40}jump to.{0,40}/i) || ['(no jump offer, correct)'])[0]);
  // owner: the boost card is for people the boost is worth something to, and nobody else
  ok('the boost card is gone entirely rather than reworded', !/tier 20/i.test(p2.txt), (p2.txt.match(/.{0,40}tier 20.{0,40}/i) || ['(no boost card, correct)'])[0]);
  ok('no empty box is left where it was', (await page.evaluate(() => document.querySelectorAll('.ov.s1eov .s1boost').length)) === 0);
  ok('the deadline, the clock and the offer are still there',
    p2.txt.toLowerCase().includes(D.txt.toLowerCase()) && /SEC/i.test(p2.txt) && /\$14\.99/.test(p2.txt), p2.txt.slice(0, 140));

  head('the five beats, side by side');
  const copy = [];
  for (const left of [27, 14, 7, 3, 1]) {
    await rig({ kind: 'plain', tier: 6, left });
    const c = await page.evaluate(() => window.__S1.paint());
    copy.push({ left, ...c });
    console.log(`    ${String(left).padStart(2)}d ${c.beat.padEnd(4)} ${c.tag}`);
    console.log(`         "${c.head}" / ${c.lede.slice(0, 96)}`);
    console.log(`         ${c.cta}   ·   ${(c.txt.match(/[A-Z][A-Z ,.]*JUMP TO|BUY NOW[^T]*|[^.]*TAKE\b|[^.]*START ON\b/) || [''])[0].trim().slice(0, 60)}`);
  }
  for (const f of ['tag', 'head', 'lede', 'cta']) {
    ok(`every beat has its own ${f}`, new Set(copy.map(c => c[f])).size === 5, copy.map(c => c[f]));
  }
  ok('the clock agrees with the beat on every one of them',
    copy.every(c => +c.cells[0] === c.left - 1), copy.map(c => ({ left: c.left, days: c.cells[0] })));
  ok('the last one says tonight, not a date', /tonight/i.test(copy[4].lede), copy[4].lede);
  ok('and drops the days box rather than showing a zero', !/\bDAYS\b/i.test(copy[4].txt), (copy[4].txt.match(/.{0,30}DAYS.{0,20}/i) || ['(no days box, correct)'])[0]);
  ok('while every earlier beat keeps it', copy.slice(0, 4).every(c => /\bDAYS\b/i.test(c.txt)), copy.map(c => /\bDAYS\b/i.test(c.txt)));
  ok('and the boost card is still on all five, for a player who is below it',
    copy.every(c => /Tier 20/.test(c.txt)), copy.map(c => /Tier 20/.test(c.txt)));

  head('the buttons do what they say');
  await rig({ kind: 'plain', tier: 6 });
  await page.evaluate(() => window.__S1.paint());
  await page.click('.ov.s1eov .look');
  ok('"See the track first" opens the pass track', await page.evaluate(() => S.overlay) === 'tourpass');
  await page.evaluate(() => window.__S1.paint());
  await page.click('.ov.s1eov .later');
  ok('"Not now" closes it', await page.evaluate(() => S.overlay) === null);
  await page.evaluate(() => window.__S1.paint());
  await page.click('.ov.s1eov .buy');
  ok('and the buy button starts the real purchase', await page.evaluate(() => window.__S1.bought) === 1);

  // ── the promise, kept ──────────────────────────────────────────────────────
  head('buying it: the first 20 tiers unlock');
  await rig({ kind: 'holder', tier: 6 });
  const g1 = await page.evaluate(() => window.__S1.grant());
  ok('a buyer on tier 6 lands on tier 20', g1.before === 6 && g1.after === 20, g1);
  ok('running the grant twice does not push them further', g1.again === 20, g1);
  ok('the rewards are there to claim', g1.claimable >= 20, { claimable: g1.claimable });
  ok('and they are told about it', g1.toasts.some(t => /Season 1 boost/i.test(t)), g1.toasts);

  await rig({ kind: 'holder', tier: 0 });
  const g2 = await page.evaluate(() => window.__S1.grant());
  ok('a buyer who has never played gets all 20', g2.before === 0 && g2.after === 20, g2);

  await rig({ kind: 'holder', tier: 31 });
  const g3 = await page.evaluate(() => window.__S1.grant());
  ok('a buyer already on tier 31 keeps every point they earned', g3.before === 31 && g3.after === 31, g3);
  ok('and is not told about a boost that did not happen', !g3.toasts.some(t => /Season 1 boost/i.test(t)), g3.toasts);

  await rig({ kind: 'holder', tier: 4, season: 2 });
  const g4 = await page.evaluate(() => window.__S1.grant());
  ok('a season 2 buyer gets no season 1 boost', g4.after === 4, g4);

  head('screenshots');
  await page.setViewportSize({ width: 430, height: 932 });
  for (const [tag, o] of [['s0', { left: 27 }], ['s14', { left: 14 }], ['s7', { left: 7 }],
                          ['s3', { left: 3 }], ['s1', { left: 1 }]]) {
    await rig({ kind: 'plain', tier: 6, ...o });
    await page.evaluate(() => window.__S1.paint());
    await page.waitForTimeout(120);
    await page.screenshot({ path: `${SHOTS}/s1end-${tag}-mobile.png` });
  }
  await rig({ kind: 'plain', tier: 26 });
  await page.evaluate(() => window.__S1.paint());
  await page.waitForTimeout(120);
  await page.screenshot({ path: `${SHOTS}/s1end-above20-mobile.png` });
  await page.setViewportSize({ width: 1280, height: 900 });
  for (const [tag, o] of [['s0', { left: 27 }], ['s1', { left: 1 }]]) {
    await rig({ kind: 'plain', tier: 6, ...o });
    await page.evaluate(() => window.__S1.paint());
    await page.waitForTimeout(120);
    await page.screenshot({ path: `${SHOTS}/s1end-${tag}-desktop.png` });
  }
  console.log('    wrote golf/__shots/s1end-*.png');

  head('page errors');
  ok('none', errs.length === 0, errs.slice(0, 4));
  await browser.close();
};

try { await run(); } finally { try { fs.unlinkSync(PROBE); } catch (e) {} }
console.log('\n' + (bad ? bad + ' FAILED' : 'all good'));
process.exit(bad ? 1 : 0);
