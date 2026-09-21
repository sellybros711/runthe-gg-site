/* Three career decisions that PLAY OUT, in a browser.
 *
 *   (nohup python3 -m http.server 8099 &)
 *   node golf/verify-dilemma-match.mjs
 *
 * A money round with your rival, their doubled-stakes rematch and a prime-time exhibition used to
 * resolve with a weighted roll and a paragraph. Each of them is now a real 1v1 match on the
 * TourTracer, through the knockout's own engine, and this file is the proof that it is.
 *
 * What it cannot be is a career played by hand. Reaching dil_lg_exhibition needs the breakaway
 * league formed, its heat over 35 and a named star, which is a run of seasons and a coin flip on
 * top; reaching arc_rival_rematch needs the money round WON first and then five to nine events of
 * waiting. So this parks a career at each beat instead: the world, the schedule and the season are
 * the page's own, built by its own startSeason(), and only the reasons the beat is due are handed
 * to it. Everything from the button press onwards is untouched shipped code.
 *
 * The instrumented copy is written into golf/ because a hook has to reach INSIDE the page's one
 * inline script (a second <script> tag cannot see anything in there), and removed in a finally. If
 * a crash leaves one behind it is called __test_dilmatch.html and is safe to delete.
 *
 * Three things are checked, and they fail differently:
 *   LAUNCH   the button starts a match rather than printing an outcome, on the configured course,
 *            over the configured number of holes, against an opponent with real ratings.
 *   PLAY     the match runs to a decision through the shipped advance, sudden death included.
 *   OUTCOME  a win, a loss and a half each apply the outcome they were configured with. Money,
 *            confidence, the career feed and a seeded follow-up arc are all read back off S.
 * Plus: zero page errors, at any point, in any of it.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const HOST = process.env.HOST || 'http://localhost:8099';
const SRC = ROOT + '/golf/index.html';
const PROBE = ROOT + '/golf/__test_dilmatch.html';

let bad = 0;
const ok = (n, p, x) => { if (!p) bad++;
  console.log((p ? '  ok   ' : ' FAIL  ') + n + (x !== undefined ? '   ' + JSON.stringify(x).slice(0, 220) : '')); };
const head = (t) => console.log('\n' + t + '\n' + '-'.repeat(t.length));

/* ── the instrumented copy ──────────────────────────────────────────────────
   One hook, appended to the end of the page's largest script block, which is the game. Everything
   it exposes is a call into shipped code; nothing here reimplements a rule. */
const HOOK = `
window.__DM = {
  /* Park a career at the point a decision beat fires. The world, the schedule and the season are
     built by the page's own startSeason(), so the field, the courses and the living roster are the
     real ones; only the golfer's ratings and the rival are handed in. */
  rig(opts){
    opts=opts||{};
    reset();
    S.daily=false; S.circuitMode=false; S.name='Rig Tester'; S.year=3; S.careerSeed=20260904;
    CATS.forEach(c=>{ S.slots[c.k]={golfer:'Rig', value:(opts.ovr||82)}; });
    S.career={ firsts:{dilemma:1, storyline:1}, arcs:[], seasons:[], wins:0,
      story:{feed:[], followers:120000, confidence:null, seenDil:{}, dilSeason:0} };
    ensureWorld();
    if(opts.rival) S.career.rival={name:opts.rival, ovr:(opts.rivalOvr||84), sinceYear:1,
      seasonsWon:0, seasonsLost:0, seriesStreak:0, emergent:true};
    startSeason();
    S.screen='season'; S.evtIndex=1;
    const act=(S.world&&S.world.active)||[];
    const top=act.filter(g=>g&&!g.retiredYear).slice().sort((a,b)=>(b.lov||0)-(a.lov||0));
    return { world:act.length, sched:(S.schedule||[]).length,
      topName:(top[0]&&top[0].name)||'', topOvr:(top[0]&&top[0].lov)||0,
      rival:(S.career.rival&&S.career.rival.name)||'' };
  },
  /* Open the beat's own card, with the ctx the season screen would have built. */
  fire(id, over){
    const beat = (typeof DILEMMAS!=='undefined' && DILEMMAS.find(d=>d.id===id))
      || (typeof STORY_ARCS!=='undefined' && STORY_ARCS[id])
      || (function(){ try{ return (LEAGUE_DILEMMAS||[]).find(d=>d.id===id)||null; }catch(e){ return null; } })()
      || (function(){ try{ return LEAGUE_ARCS[id]||null; }catch(e){ return null; } })();
    if(!beat) throw new Error('no such beat: '+id);
    const ce={ evt:(S.schedule&&S.schedule[1])||{name:'Test Open'}, done:false, roundsDone:1 };
    const ctx=Object.assign(dilemmaCtx(ce), over||{});
    showDilemma({beat, ctx, id});
    return { title:String(typeof beat.title==='function'?beat.title(ctx):beat.title||''),
      choices:(beat.choices||[]).map(c=>String(typeof c.t==='function'?c.t(ctx):c.t)),
      matched:(beat.choices||[]).map(c=>!!c.match) };
  },
  /* What the page is showing and what the match engine thinks. */
  state(){
    const mp=S.matchPlay;
    return { screen:S.screen, played:(S.dailyHoles||[]).length,
      course:S.dailyCourse, cond:S.dailyCond, courseName:(DAILY_COURSES[S.dailyCourse]||{}).v||'',
      mp: mp?{ holes:mp.holes, opp:mp.oppName, group:mp.group, exh:!!mp.exh, day:mp.day,
        roundName:mp.roundName, oppOvr:(mp.exh&&mp.exh.oppOvr)||null,
        oppSk:Object.assign({},mp.oppSk), oppHoles:mp.oppHoles.slice(),
        winCfg:!!(mp.exh&&mp.exh.win), loseCfg:!!(mp.exh&&mp.exh.lose), halfCfg:!!(mp.exh&&mp.exh.half) }:null,
      st: mp?matchState():null };
  },
  /* Play MY card through the shipped per-hole engine, then write the opponent's card relative to
     it, which is the only way to reach a chosen result on demand. Their score is the one thing a
     player can never influence anyway: it is drawn in full before the first tee shot. */
  playMine(){
    const mp=S.matchPlay; if(!mp) throw new Error('no match in flight');
    clearDailyTimer(); S.dailyAuto=false; S.dailyHolePause=false; S.dailyProv=null;
    S.dailyRevealN=null; S.dailySinking=false;
    const c=DAILY_COURSES[S.dailyCourse], N=matchRegHoles();
    while(S.dailyHoles.length<N){
      const n=S.dailyHoles.length, h=c.holes[n];
      const toPar=dSimHole(h[0],h[1],S.dailyDiffs[n],S.dailySkills,c.fit,DCFG.COND[S.dailyCond],S.dailyPlan,null,dHoleRng(S.dailySeed,S.dailyCourse,n,dAttSalt(0)));
      S.dailyHoles.push({i:n,n:n+1,par:h[0],yards:h[1],name:h[2],toPar,attack:null,shots:[]});
    }
    return N;
  },
  setOpp(kind){
    const mp=S.matchPlay; if(!mp) throw new Error('no match in flight');
    const N=matchRegHoles();
    for(let i=0;i<N;i++){ const mine=S.dailyHoles[i].toPar;
      mp.oppHoles[i] = kind==='win' ? mine+1 : kind==='lose' ? mine-1 : mine; }
    mp._oppShots=null;
    return mp.oppHoles.slice();
  },
  finish(){ finishMatchRound(); return this.after(); },
  skip(){ matchSkipToEnd(); return this.after(); },
  /* Everything a decision outcome is allowed to move, read straight off career state. */
  after(){
    const st=(S.career&&S.career.story)||{};
    return { screen:S.screen, matchPlay:!!S.matchPlay,
      money:(S.season&&S.season.sideMoney)||0,
      conf:(S.season&&S.season.confidence!=null)?S.season.confidence:null,
      fans:(S.career&&S.career.rep&&S.career.rep.fans)||null,
      followers:Math.round(st.followers||0),
      feed:(st.feed||[]).slice(0,2).map(f=>f.text),
      arcs:((S.career&&S.career.arcs)||[]).map(a=>a.fid),
      fx:(typeof activeFx==='function'?activeFx().map(f=>f.skill+':'+f.amt):[]),
      resultCard:(function(){ const n=document.querySelector('.dilemmaov'); return n?n.innerText.replace(/\\s+/g,' ').trim().slice(0,240):''; })() };
  },
  speed(v){ setDailySpeed(v); return dailySpeed(); },
  /* The broadcast bar the round is played under. */
  bar(){ const n=document.querySelector('.bcasthd'); return n?n.innerText.replace(/\\s+/g,' ').trim():''; },
  /* how many HOLE columns the scorecard drew. The spacers a short second block pads with carry the
     same classes and must not be counted, or a 12-hole card reads as an 18-hole one. */
  card(){ const n=document.querySelector('.rsc'); return n?(n.querySelectorAll('.rsc-c.rsc-hd:not(.rsc-sub):not(.rsc-fill)').length):-1; },
  /* matchOppSkills on its own, both branches. */
  oppSkills(name, ovr){ return matchOppSkills(name, ovr); },
  extraHoles(n){ S.matchPlay=S.matchPlay||{}; const keep=S.matchPlay.holes; S.matchPlay.holes=n;
    const out=[0,1,2,3].map(k=>matchExtraHole(k)); S.matchPlay.holes=keep; return out; }
};
`;

function buildProbe(){
  const src = fs.readFileSync(SRC, 'utf8');
  // the game is the largest script block on the page; append the hook to the end of it
  const re = /<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g;
  let m, best = null;
  while ((m = re.exec(src))) { if (!best || m[1].length > best[1].length) best = m; }
  if (!best) throw new Error('no inline script found in golf/index.html');
  const at = best.index + best[0].length - '</script>'.length;
  fs.writeFileSync(PROBE, src.slice(0, at) + '\n' + HOOK + '\n' + src.slice(at));
  return best[1].length;
}

/* Each case: the beat, the ctx it needs, the config it should have produced, and what a win, a
   loss and a half are each worth. The expectations are written out here rather than read back off
   the page, so a config edited to something else fails instead of agreeing with itself. */
const CASES = [
  { id: 'dil_practice_rival', label: 'dil_practice_rival · the money round',
    rig: { rival: 'REAL_TOP' },                 // resolved to a real world player at run time
    ctxOver: {},
    accept: 0,
    want: { holes: 9, course: 'Sedgefield Country Club', cond: 'calm', group: true,
      day: 'TUESDAY', roundName: 'Money round · $20,000 a side' },
    win:  { money: 20000, conf: 5, feed: /money practice round/i, arc: 'arc_rival_rematch' },
    lose: { money: 0, conf: -4, fx: 'clu:-3' },
    half: { money: 0, conf: 1, arc: 'arc_rival_rematch' } },

  { id: 'arc_rival_rematch', label: 'arc_rival_rematch · double or nothing',
    rig: { rival: 'Jack Sparrowhawk', rivalOvr: 86 },   // a name the world has never heard of
    ctxOver: {},
    accept: 0,
    want: { holes: 18, course: 'Oakmont', cond: 'windy', group: false,
      day: 'THE REMATCH', roundName: 'Double or nothing · $40,000' },
    win:  { money: 40000, conf: 5, feed: /head-to-head/i },
    lose: { money: -40000, conf: -4, fx: 'clu:-2' },
    half: null },                                       // a grudge cannot be halved: sudden death

  { id: 'dil_lg_exhibition', label: 'dil_lg_exhibition · prime time',
    rig: { rival: 'REAL_TOP' },
    ctxOver: { starName: 'REAL_TOP', lgOn: true, lgHeat: 60 },
    accept: 0,
    want: { holes: 12, course: 'Gulf Dunes Club', cond: 'breezy', group: true,
      day: 'PRIME TIME', roundName: 'Exhibition · 12 holes' },
    win:  { money: 3500000, conf: 5, feed: /prime-time exhibition/i },
    lose: { money: 1800000, conf: -5, feed: /Lost a prime-time exhibition/i },
    half: { money: 2400000, conf: 1, feed: /Halved a prime-time exhibition/i } },
];

const run = async () => {
  buildProbe();
  const browser = await chromium.launch();
  const page = await browser.newPage();
  /* A page error is a thrown exception or a console error the game itself printed. Requests that
     never left this sandbox are NOT that: the page reaches for auth, analytics and a webfont, all of
     them offsite, and none of them exist here. They are collected separately and asserted to be
     offsite, so a same-origin fetch that broke still fails this file. */
  const errs = [], netFail = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('requestfailed', r => netFail.push(r.url()));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/i.test(m.text())) errs.push('console: ' + m.text()); });

  // The guided tour is a modal that owns the screen, and it dims and swallows the very button this
  // file is here to press. Turned off through the page's own opt-out (its "done" flag), never by
  // editing it out, so this cannot quietly pass against a build where the tour was removed.
  const url = HOST + '/golf/__test_dilmatch.html';
  await page.addInitScript(() => { try { localStorage.setItem('bag_tour_done', 'true'); } catch (e) {} });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('!!window.__DM', null, { timeout: 20000 });

  /* the opponent resolver, on its own, before anything is played */
  head('matchOppSkills');
  const rigInfo = await page.evaluate(() => window.__DM.rig({ rival: 'Anybody' }));
  ok('the world built', rigInfo.world > 40, rigInfo.world);
  ok('a season was built', rigInfo.sched > 5, rigInfo.sched);
  const real = await page.evaluate(n => window.__DM.oppSkills(n, 70), rigInfo.topName);
  ok('a name in the living world resolves to that golfer', real.real === true && real.sk.name === rigInfo.topName, real.sk.name);
  ok('and to THEIR overall, not the number asked for', Math.abs(real.ovr - rigInfo.topOvr) <= 1 && real.ovr > 74, { got: real.ovr, lov: rigInfo.topOvr });
  const synth = await page.evaluate(() => window.__DM.oppSkills('Nobody At All', 88));
  ok('a name the world does not know is synthesized', synth.real === false, synth.ovr);
  ok('on the overall it was asked for', Math.abs(synth.ovr - 88) <= 1, synth.ovr);
  ok('with eight real categories in range', Object.keys(synth.sk).length === 9
    && ['dist','acc','app','sht','scr','bnk','put','clu'].every(k => synth.sk[k] >= 45 && synth.sk[k] <= 99), synth.sk);
  const synth2 = await page.evaluate(() => window.__DM.oppSkills('Nobody At All', 88));
  ok('and the same golfer every time', JSON.stringify(synth.sk) === JSON.stringify(synth2.sk));
  const ex9 = await page.evaluate(() => window.__DM.extraHoles(9));
  const ex18 = await page.evaluate(() => window.__DM.extraHoles(18));
  ok('sudden death on a nine-hole match stays inside the nine', ex9.every(i => i >= 0 && i < 9), ex9);
  ok('and on eighteen still rotates 18 / 1 / 10', ex18[0] === 17 && ex18[1] === 0 && ex18[2] === 9, ex18);

  /* the three, one at a time */
  for (const C of CASES) {
    head(C.label);
    const rig = Object.assign({}, C.rig);
    let starName = null;
    // a first rig purely to learn a real name out of THIS world, then rig again with it in place
    const probe = await page.evaluate(o => window.__DM.rig(o), { rival: 'x' });
    if (rig.rival === 'REAL_TOP') rig.rival = probe.topName;
    const ctxOver = Object.assign({}, C.ctxOver);
    if (ctxOver.starName === 'REAL_TOP') { ctxOver.starName = probe.topName; starName = probe.topName; }
    const expectOpp = starName || rig.rival;

    // ---- LAUNCH
    await page.evaluate(o => window.__DM.rig(o), rig);
    const fired = await page.evaluate(a => window.__DM.fire(a[0], a[1]), [C.id, ctxOver]);
    ok('the card opens', await page.locator('.dilemmaov').count() === 1, fired.title);
    ok('the accept choice carries a match config', fired.matched[C.accept] === true, fired.matched);
    ok('and says so on the button', /hole by hole/i.test(await page.locator('.dilemmaov .dbtns button').nth(C.accept).innerText()));
    await page.locator('.dilemmaov .dbtns button').nth(C.accept).click();
    await page.waitForFunction('window.__DM.state().screen==="dailyround"', null, { timeout: 10000 });
    const s = await page.evaluate(() => window.__DM.state());
    ok('the card is gone, a match is in flight', await page.locator('.dilemmaov').count() === 0 && !!s.mp);
    ok('it is an exhibition, not a bracket match', s.mp.exh === true);
    ok('over the configured holes', s.mp.holes === C.want.holes, s.mp.holes);
    ok('on the configured course', s.course === C.want.course, { got: s.course, name: s.courseName });
    ok('in the configured weather', s.cond === C.want.cond, s.cond);
    ok('halveable exactly as configured', s.mp.group === C.want.group, s.mp.group);
    ok('against the right opponent', s.mp.opp === expectOpp, { got: s.mp.opp, want: expectOpp });
    ok('whose whole card is drawn before you tee off', s.mp.oppHoles.length === C.want.holes
      && s.mp.oppHoles.every(v => Number.isFinite(v)), s.mp.oppHoles.length);
    ok('with eight ratings, all in range', ['dist','acc','app','sht','scr','bnk','put','clu']
      .every(k => s.mp.oppSk[k] >= 45 && s.mp.oppSk[k] <= 99), s.mp.oppSk);
    ok('win and lose outcomes are configured', s.mp.winCfg && s.mp.loseCfg);
    const bar = await page.evaluate(() => window.__DM.bar());
    // the bar is upper-cased by its own stylesheet, so compare on case
    const barU = bar.toUpperCase();
    ok('the broadcast bar names them and states the stake',
      barU.indexOf('VS ' + expectOpp.toUpperCase()) === 0
      && barU.indexOf(C.want.day.toUpperCase()) >= 0
      && barU.indexOf(C.want.roundName.toUpperCase()) >= 0, bar);
    const cells = await page.evaluate(() => window.__DM.card());
    ok('the scorecard is the length of the match', cells === C.want.holes, { cells, want: C.want.holes });

    // ---- PLAY, then each outcome
    for (const kind of ['win', 'lose', 'half']) {
      const want = C[kind];
      if (kind === 'half' && !want) continue;
      await page.evaluate(o => window.__DM.rig(o), rig);
      await page.evaluate(a => window.__DM.fire(a[0], a[1]), [C.id, ctxOver]);
      await page.locator('.dilemmaov .dbtns button').nth(C.accept).click();
      await page.waitForFunction('window.__DM.state().screen==="dailyround"', null, { timeout: 10000 });
      const n = await page.evaluate(() => window.__DM.playMine());
      ok(kind + ': the round played to the end of regulation', n === C.want.holes, n);
      await page.evaluate(k => window.__DM.setOpp(k), kind);
      const st = await page.evaluate(() => window.__DM.state().st);
      if (kind === 'half') ok('half: all square through ' + C.want.holes, st.up === 0 && st.reg === C.want.holes, st);
      else ok(kind + ': the match is decided', st.decided === true && st.won === (kind === 'win'), st.label);
      const after = await page.evaluate(() => window.__DM.finish());
      ok(kind + ': back on the season screen with no match left', after.screen === 'season' && after.matchPlay === false);
      ok(kind + ': the result card is up', /hole/i.test(after.resultCard) && after.resultCard.length > 40, after.resultCard.slice(0, 90));
      ok(kind + ': the money it was configured for', after.money === want.money, { got: after.money, want: want.money });
      if (want.conf != null) ok(kind + ': confidence moved by ' + want.conf, after.conf != null, after.conf);
      if (want.feed) ok(kind + ': the career feed carries the headline', want.feed.test(after.feed.join(' | ')), after.feed);
      if (want.fx) ok(kind + ': the skill effect is active', after.fx.indexOf(want.fx) >= 0, after.fx);
      if (want.arc) ok(kind + ': the follow-up arc is seeded', after.arcs.indexOf(want.arc) >= 0, after.arcs);
    }

    // ---- the shipped skip path, all the way through, including sudden death where there is no half
    await page.evaluate(o => window.__DM.rig(o), rig);
    await page.evaluate(a => window.__DM.fire(a[0], a[1]), [C.id, ctxOver]);
    await page.locator('.dilemmaov .dbtns button').nth(C.accept).click();
    await page.waitForFunction('window.__DM.state().screen==="dailyround"', null, { timeout: 10000 });
    await page.evaluate(() => window.__DM.playMine());
    await page.evaluate(() => window.__DM.setOpp('half'));       // dead level with a hole to go
    const skipped = await page.evaluate(() => window.__DM.skip());
    ok('skip to end resolves it either way', skipped.screen === 'season' && skipped.matchPlay === false, skipped.resultCard.slice(0, 80));
    if (!C.want.group) {
      ok('a match that cannot be halved went to sudden death', /Decided at the/i.test(skipped.resultCard), skipped.resultCard.slice(0, 80));
    } else {
      ok('a halveable match was halved', /All square/i.test(skipped.resultCard), skipped.resultCard.slice(0, 80));
    }
  }

  /* ── and once with nothing driven at all ──────────────────────────────────
     Everything above reaches into the engine to reach a chosen result. This one does not: it presses
     the button, answers the on-course calls on the real tap-targets, and lets the page's own timers
     carry the match from the first tee to the outcome card. It is the only check here that proves
     the whole seam works with a player on the other end of it. */
  head('the money round, played through with nothing driven');
  {
    const C = CASES[0];
    const probe = await page.evaluate(o => window.__DM.rig(o), { rival: 'x' });
    await page.evaluate(o => window.__DM.rig(o), { rival: probe.topName });
    await page.evaluate(a => window.__DM.fire(a[0], a[1]), [C.id, {}]);
    await page.locator('.dilemmaov .dbtns button').nth(C.accept).click();
    await page.waitForFunction('window.__DM.state().screen==="dailyround"', null, { timeout: 10000 });
    await page.evaluate(() => window.__DM.speed(5));
    // The safe side of whichever decision UI is up: the panel docked in the tracer window, its
    // on-course tap-target, or the below-window fallback bar. All three are the same call.
    const DEC = '.hvdec .dkc.safe, .dctarget.safe, .dcbar .dccard.safe';
    let calls = 0, deadline = Date.now() + 180000;
    while (Date.now() < deadline) {
      const st = await page.evaluate(() => window.__DM.state());
      if (st.screen !== 'dailyround') break;
      const dec = page.locator(DEC).first();
      if (await dec.count() && await dec.isVisible()) { await dec.click(); calls++; continue; }
      await page.waitForTimeout(200);
    }
    const after = await page.evaluate(() => window.__DM.after());
    ok('the match reached its own end', after.screen === 'season' && after.matchPlay === false, { calls });
    ok('and the outcome card is up', /THE LOCKER ROOM/i.test(after.resultCard), after.resultCard.slice(0, 100));
    ok('with an outcome applied, whichever way it went',
      after.money === 20000 || after.conf === 46 || after.conf === 51, { money: after.money, conf: after.conf });
    ok('on-course calls were actually asked for', calls > 0, calls);
  }

  head('page errors');
  ok('none, in any of it', errs.length === 0, errs.slice(0, 6));
  const sameOrigin = netFail.filter(u => u.indexOf(HOST) === 0);
  ok('every failed request was offsite, none of the page\'s own', sameOrigin.length === 0,
    { offsite: netFail.length, sameOrigin: sameOrigin.slice(0, 4) });

  await browser.close();
};

try {
  await run();
} finally {
  try { fs.unlinkSync(PROBE); } catch (e) {}
}
console.log('\n' + (bad ? bad + ' FAILED' : 'all good'));
process.exit(bad ? 1 : 0);
