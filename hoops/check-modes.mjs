/*
 * check-modes.mjs - Conquest, Fix History and Six Passes.
 *
 *   node hoops/check-modes.mjs            the rules, the copy, the SQL, a browser walk
 *   node hoops/check-modes.mjs --quick    the rules and the copy only, no browser
 *
 * ── WHAT CAN GO WRONG HERE, AND WHY NONE OF IT THROWS ─────────────────────
 *
 * Every rule in modes.js answers with a valid-looking value when it is
 * wrong. A ladder with a repeated team is a ladder. A steal into a slot the man
 * cannot play is a roster the engine rates without complaint. A Fix History
 * score drawn from a different set of seasons on each device is a number, and
 * a leaderboard ranks it. A Six Passes par that is not the shortest chain is
 * a puzzle somebody can beat. So each is asked as a PROPERTY.
 *
 * THE BALANCE IS A BAND, measured the way modes.js's header measured it: 200
 * Conquest runs taking the best steal and 200 taking none. The claim is the
 * SHAPE (the steal decides the run, and a run that never steals never clears)
 * rather than one number, because the ladder is drawn off the pool and a
 * refreshed season moves every figure a little.
 *
 * THE BROWSER NEVER REACHES THE BOARD. Every request off local.test is
 * answered by a stand-in or refused, because the live project holds real
 * leaderboards and a checker must not file a play on one.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const req = createRequire(import.meta.url);
const E = req('./engine.js');
const R = req('./run.js');
const M = req('./modes.js');
E.setTeams(JSON.parse(fs.readFileSync(path.join(HERE, 'data/teams.json'), 'utf8')));
E.setCuratedChemistry(JSON.parse(fs.readFileSync(path.join(HERE, 'data/chemistry.json'), 'utf8')));
const D = R.indexData(JSON.parse(fs.readFileSync(path.join(HERE, 'data/players.json'), 'utf8')));
const QUICK = process.argv.includes('--quick');

const failures = [];
let passed = 0;
function ok(cond, what) { if (cond) passed++; else failures.push(what); }
function section(t) { console.log(`\n${t}\n${'-'.repeat(t.length)}`); }

// ── 1. Conquest's rules ─────────────────────────────────────────────────────
section('1. Conquest: the ladder, the steal and the lives');
{
  const a = M.cqCreate(D, 'checkseed01'), b = M.cqCreate(D, 'checkseed01');
  ok(JSON.stringify(a) === JSON.stringify(b), 'one seed is one run: same crew, same ladder');
  ok(a.ladder.length === M.CQ.RUNGS, `the ladder is ${M.CQ.RUNGS} rungs (${a.ladder.length})`);
  ok(new Set(a.ladder).size === a.ladder.length, 'no team-season stands in line twice');
  const top = [...D.teamSeasons].sort((x, y) => y.rating - x.rating)[0].team_season_id;
  ok(a.ladder[a.ladder.length - 1] === top, `the last rung is the best team in the data (${top})`);
  const rt = a.ladder.map((ts) => D.teamStats[ts].rating);
  ok(rt[0] < 35 && rt[rt.length - 2] > 85, `the line climbs from weak to great (${rt[0]} to ${rt[rt.length - 2]})`);
  ok(a.roster.every((k, i) => E.canFillSlot(D.allPlayers[k], E.SLOTS[i])), 'every crew man can play his slot');
  ok(new Set(a.roster.map((k) => D.allPlayers[k].i)).size === 5, 'the crew is five different men');

  /* THE STEAL. Played forward until a win, then every offered swap checked
     against the rule it claims to follow. */
  const st = M.cqCreate(D, 'checksteal02');
  let guard = 0;
  while (!st.pending && !st.lost && guard++ < 10) M.cqPlay(st, D);
  ok(!!st.pending, 'a crew can win a game against the first rungs');
  const opts = M.cqSteals(st, D);
  ok(opts.length > 0, `a win offers steals (${opts.length})`);
  ok(opts.every((o) => E.canFillSlot(D.allPlayers[o.take], E.SLOTS[o.slot])),
    'every offered steal can play the slot it goes into');
  const ids = new Set(st.roster.map((k) => D.allPlayers[k].i));
  ok(opts.every((o) => !ids.has(D.allPlayers[o.take].i) || D.allPlayers[st.roster[o.slot]].i === D.allPlayers[o.take].i),
    'no steal puts one man on the roster twice');
  let threw = false;
  const bad = M.bestFive(D, st.pending.ts).find((p) => !E.canFillSlot(p, 'PG'));
  try { if (bad) M.cqSteal(JSON.parse(JSON.stringify(st)), D, E.pkey(bad), 0); } catch (e) { threw = true; }
  ok(!bad || threw, 'a steal into a slot he cannot play is refused');

  /* LIVES. A loss is forced by recording one, the way the live board would. */
  const lv = M.cqCreate(D, 'checklives03');
  M.cqPlay(lv, D, { won: false, yourPoints: 90, oppPoints: 100, ot: 0 });
  ok(lv.lives === M.CQ.LIVES - 1 && !lv.lost && lv.rung === 0, 'a loss costs a life and the same team stays on');
  M.cqPlay(lv, D, { won: false, yourPoints: 90, oppPoints: 100, ot: 0 });
  M.cqPlay(lv, D, { won: false, yourPoints: 90, oppPoints: 100, ot: 0 });
  ok(lv.lives === 0 && !!lv.lost, 'the last life lost ends the run');
  const bs = M.cqCreate(D, 'checkboss04');
  bs.lives = 1; bs.rung = M.CQ.BOSS_EVERY - 1;
  ok(M.cqIsBoss(bs.rung), `rung ${bs.rung + 1} is a boss`);
  M.cqPlay(bs, D, { won: true, yourPoints: 110, oppPoints: 100, ot: 0 });
  M.cqSteal(bs, D, null, null);
  ok(bs.lives === 2, 'beating a boss gives a life back');
  const full = M.cqCreate(D, 'checkboss05');
  full.rung = M.CQ.BOSS_EVERY - 1;
  M.cqPlay(full, D, { won: true, yourPoints: 110, oppPoints: 100, ot: 0 });
  M.cqSteal(full, D, null, null);
  ok(full.lives === M.CQ.LIVES, 'and never past the most you can have');

  /* A REMATCH IS A NEW GAME. With the attempt left out of the rng tag, a loss
     would replay itself until the lives ran out. */
  let losses = 0, differ = 0;
  for (let i = 0; i < 40 && losses < 8; i++) {
    const r = M.cqCreate(D, 'checkrematch' + i);
    const g1 = M.cqPlay(r, D);
    if (g1.won) continue;
    losses++;
    const g2 = M.cqPlay(r, D);
    if (g2.you !== g1.you || g2.opp !== g1.opp) differ++;
  }
  ok(losses > 0 && differ === losses, `every rematch is a new game (${differ} of ${losses})`);
}

// ── 1b. the opening draft ─────────────────────────────────────────────────
section('1b. Conquest: you draft your five, from the tier the ladder is tuned to');
{
  const st = M.cqCreate(D, 'checkdraft08', { draft: true });
  ok(st.drafting && st.roster.length === 0, 'a drafted run starts with nobody');
  let threw = false;
  try { M.cqPlay(st, D); } catch (e) { threw = true; }
  ok(threw, 'and cannot tip off until the five are picked');
  let good = true, again = true;
  for (let k = 0; k < E.SLOTS.length; k++) {
    const cards = M.cqDraftCards(st, D);
    const rows = cards.map((c) => D.allPlayers[c]);
    const taken = new Set(st.roster.map((c) => D.allPlayers[c].i));
    if (cards.length !== M.CQ_CARDS || new Set(rows.map((p) => p.i)).size !== cards.length) good = false;
    if (!rows.every((p) => p.t !== 'TOT' && p.w >= M.CQ.CREW_MIN_WS && p.w <= M.CQ.CREW_MAX_WS
      && E.canFillSlot(p, E.SLOTS[k]) && !taken.has(p.i))) good = false;
    if (JSON.stringify(M.cqDraftCards(JSON.parse(JSON.stringify(st)), D)) !== JSON.stringify(cards)) again = false;
    if (k === 0) {
      let refused = false;
      const outsider = D.players.find((p) => p.t !== 'TOT' && cards.indexOf(E.pkey(p)) < 0);
      try { M.cqDraftPick(JSON.parse(JSON.stringify(st)), D, E.pkey(outsider)); } catch (e) { refused = true; }
      ok(refused, 'a man who is not one of the three cards is refused');
    }
    M.cqDraftPick(st, D, cards[k % cards.length]);
  }
  ok(good, `every pick offers ${M.CQ_CARDS} different men, in the crew's tier, who can play the slot and are not picked yet`);
  ok(again, 'a reload shows the same three cards');
  ok(!st.drafting && st.roster.length === 5 && st.roster.every((c, i) => E.canFillSlot(D.allPlayers[c], E.SLOTS[i])),
    'five picks end the draft with a legal five');
  ok(new Set(st.roster.map((c) => D.allPlayers[c].i)).size === 5, 'five different men');
  ok(M.cqPlay(st, D) && true, 'and the run tips off');
}

// ── 2. the chance printed before tip-off is the chance the game plays ───────
section('2. the win chance is the one resolveGame plays');
{
  const st = M.cqCreate(D, 'checkchance07');
  for (const rung of [0, 8, 16]) {
    st.rung = rung; st.tries = 0;
    const pv = M.cqPreview(st, D);
    const rng = E.createSeededRNG(1234 + rung);
    let w = 0; const N = 20000;
    for (let i = 0; i < N; i++) if (E.resolveGame(pv.means.pointsFor, pv.means.pointsAgainst, rng, pv.adv).won) w++;
    const sim = w / N;
    ok(Math.abs(sim - pv.chance) < 0.02,
      `rung ${rung}: printed ${(pv.chance * 100).toFixed(1)}% against ${(sim * 100).toFixed(1)}% played`);
  }
}

// ── 3. the balance band ─────────────────────────────────────────────────────
section('3. the steal decides the run');
{
  const N = QUICK ? 60 : 200;
  const smart = (st) => {
    let b = null;
    for (const x of M.cqSteals(st, D)) if (x.delta > 0 && (!b || x.rating > b.rating)) b = x;
    return b;
  };
  const play = (bot) => {
    const wins = []; let clear = 0;
    for (let i = 0; i < N; i++) {
      const st = M.cqCreate(D, 'band' + i);
      let g = 0;
      while (!st.lost && g++ < 80) {
        M.cqPlay(st, D);
        if (st.pending) { const x = bot(st); M.cqSteal(st, D, x ? x.take : null, x ? x.slot : null); }
      }
      wins.push(M.cqStreak(st)); if (M.cqCleared(st)) clear++;
    }
    wins.sort((a, b) => a - b);
    return { median: wins[Math.floor(N / 2)], clear: clear / N, mean: wins.reduce((s, x) => s + x, 0) / N };
  };
  const a = play(smart), b = play(() => null);
  /* THE DRAFT MUST NOT BREAK THE LADDER. A player who picks the best man on
     every card by win shares (which the screen never shows) is the most a
     draft can add, and it must stay inside the same band. */
  const drafted = (i) => {
    const st = M.cqCreate(D, 'band' + i, { draft: true });
    while (st.drafting) {
      const c = M.cqDraftCards(st, D).sort((x, y) => D.allPlayers[y].w - D.allPlayers[x].w);
      M.cqDraftPick(st, D, c[0]);
    }
    return st;
  };
  const dr = (() => {
    const wins = []; let clear = 0;
    for (let i = 0; i < N; i++) {
      const st = drafted(i); let g = 0;
      while (!st.lost && g++ < 80) {
        M.cqPlay(st, D);
        if (st.pending) { const x = smart(st); M.cqSteal(st, D, x ? x.take : null, x ? x.slot : null); }
      }
      wins.push(M.cqStreak(st)); if (M.cqCleared(st)) clear++;
    }
    wins.sort((x, y) => x - y);
    return { median: wins[Math.floor(N / 2)], clear: clear / N };
  })();
  console.log(`  best draft + best steal: median ${dr.median}, clears ${(dr.clear * 100).toFixed(1)}%`);
  ok(dr.median <= 12 && dr.clear < 0.2, `the best possible draft stays in the band (median ${dr.median}, clears ${(dr.clear * 100).toFixed(1)}%)`);
  console.log(`  best steal: median ${a.median}, mean ${a.mean.toFixed(1)}, clears ${(a.clear * 100).toFixed(1)}%`);
  console.log(`  no steals:  median ${b.median}, mean ${b.mean.toFixed(1)}, clears ${(b.clear * 100).toFixed(1)}%`);
  ok(a.median >= 4 && a.median <= 12, `a good run is a handful of wins, not one and not fifty (median ${a.median})`);
  ok(a.clear > 0 && a.clear < 0.2, `clearing the ladder is possible and rare (${(a.clear * 100).toFixed(1)}%)`);
  ok(b.clear === 0, 'a run that never steals never clears');
  ok(a.mean > b.mean + 1.5, `stealing is worth wins (${a.mean.toFixed(1)} against ${b.mean.toFixed(1)})`);
}

// ── 3b. the game plan is a read, and a read pays ──────────────────────────
section('3b. Conquest: the game plan');
{
  /* THE RULES, as properties of the real cqPlans and cqPlay. */
  const st = M.cqCreate(D, 'checkplan09');
  let bounded = true, oneBest = true, signed = true, keys = new Set();
  for (const rung of [0, 5, 11, 18, 24]) {
    st.rung = rung; st.tries = 0;
    const ps = M.cqPlans(st, D);
    ps.forEach((p) => keys.add(p.key));
    if (ps.some((p) => Math.abs(p.edge) > 2 * M.CQ.PLAN + 1e-9)) bounded = false;
    const best = ps.filter((p) => p.best);
    if (best.length !== 1 || best[0].edge < Math.max(...ps.map((p) => p.edge))) oneBest = false;
    /* The edge is the gap, so it has the gap's sign. */
    if (ps.some((p) => p.you !== p.them && Math.sign(p.edge) !== Math.sign(p.you - p.them))) signed = false;
  }
  ok(keys.size === M.CQ_PLANS.length, `every plan is offered (${keys.size})`);
  ok(bounded, `no plan is worth more than ${2 * M.CQ.PLAN} points a night either way`);
  ok(oneBest, 'exactly one plan is the best read, and it has the biggest edge');
  ok(signed, 'an edge points the way the two fives do');

  let refused = false;
  try { M.cqSetPlan(M.cqCreate(D, 'x1'), 'zone'); } catch (e) { refused = true; }
  ok(refused, 'a plan that does not exist is refused');

  /* THE SAME GAME, THREE WAYS. cqPlay draws its noise off the run's seed and
     the rung, so the only thing that differs is the plan, and the margin has
     to move the way the edge says. */
  let up = 0, down = 0, tested = 0, cleared = true;
  for (let i = 0; i < 60; i++) {
    const base = M.cqCreate(D, 'planmargin' + i);
    base.rung = i % 20;
    const ps = M.cqPlans(base, D);
    const best = ps.find((p) => p.best), worst = ps.slice().sort((a, b) => a.edge - b.edge)[0];
    if (best.edge <= 0 || worst.edge >= 0) continue;
    /* An overtime draws more noise than regulation, so a game that reaches
       one in any arm is a different path through the rng rather than the
       same game with a different plan, and it is left out. */
    let ot = false;
    const margin = (k) => { const c = JSON.parse(JSON.stringify(base)); M.cqSetPlan(c, k); const r = M.cqPlay(c, D);
      if (c.plan != null) cleared = false; if (r.ot) ot = true; return r.you - r.opp; };
    const m0 = margin(null), mb = margin(best.key), mw = margin(worst.key);
    if (ot) continue;
    tested++;
    if (mb >= m0) up++;
    if (mw <= m0) down++;
  }
  ok(tested >= 10, `enough matchups had a plan each way to test (${tested})`);
  ok(up === tested && down === tested, `the best read never costs and the worst never helps (${up}, ${down} of ${tested})`);
  ok(cleared, 'a plan is for one game');

  /* THE LADDER OF SKILL. A random plan is roughly the mode without plans,
     and the best read is clearly more. Measured at 600 runs in modes.js's
     header; held here as a shape, because the ladder is drawn off the pool. */
  const N = QUICK ? 80 : 240;
  const smart = (st2) => {
    let b = null;
    for (const x of M.cqSteals(st2, D)) if (x.delta > 0 && (!b || x.rating > b.rating)) b = x;
    return b;
  };
  const run = (pick) => {
    const wins = []; let clear = 0;
    for (let i = 0; i < N; i++) {
      const s2 = M.cqCreate(D, 'planband' + i);
      const rng = E.createSeededRNG(E.hashSeed('planpick' + i));
      let g = 0;
      while (!s2.lost && g++ < 80) {
        M.cqSetPlan(s2, pick(M.cqPlans(s2, D), rng));
        M.cqPlay(s2, D);
        if (s2.pending) { const x = smart(s2); M.cqSteal(s2, D, x ? x.take : null, x ? x.slot : null); }
      }
      wins.push(M.cqStreak(s2)); if (M.cqCleared(s2)) clear++;
    }
    return { mean: wins.reduce((a, b) => a + b, 0) / N, clear: clear / N };
  };
  const none = run(() => null);
  const rand = run((ps, rng) => ps[Math.floor(rng() * ps.length)].key);
  const best = run((ps) => ps.find((p) => p.best).key);
  const worst = run((ps) => ps.slice().sort((a, b) => a.edge - b.edge)[0].key);
  for (const [n, r] of [['worst read', worst], ['no plan', none], ['random plan', rand], ['best read', best]]) {
    console.log(`  ${n.padEnd(12)} mean ${r.mean.toFixed(1)}, clears ${(r.clear * 100).toFixed(1)}%`);
  }
  ok(Math.abs(rand.mean - none.mean) < 2, `a random plan is about the mode without plans (${rand.mean.toFixed(1)} against ${none.mean.toFixed(1)})`);
  ok(best.mean - rand.mean >= 2, `a read is worth two wins or more over a guess (${(best.mean - rand.mean).toFixed(1)})`);
  ok(worst.mean < none.mean, `a bad read costs (${worst.mean.toFixed(1)} against ${none.mean.toFixed(1)})`);
  ok(best.clear > rand.clear, `and the read clears the ladder more often (${(best.clear * 100).toFixed(1)}% against ${(rand.clear * 100).toFixed(1)}%)`);
}

// ── 4. Fix History ──────────────────────────────────────────────────────────
section('4. Fix History: one team a day, four trade windows, one score everywhere');
{
  const list = M.fxCandidates(D);
  ok(list.length > 300, `enough teams that a year never repeats one (${list.length})`);
  const seen = new Set(); let baseMax = 0, baseMin = 1;
  for (let d = 1; d <= 30; d++) {
    const f = M.fxDaily(D, d);
    seen.add(f.ts);
    ok(f.five.every((p, i) => E.canFillSlot(p, E.SLOTS[i])), `day ${d}: every man in ${f.ts} can play his slot`);
    ok(!E.wonTitle(f.ts.split('_')[0], Number(f.ts.split('_')[1])), `day ${d}: ${f.ts} did not win the title`);
    if (d <= 6) {
      const o = M.fxOdds(D, f.five, d, 300).odds;
      baseMax = Math.max(baseMax, o); baseMin = Math.min(baseMin, o);
    }
  }
  ok(seen.size === 30, `thirty days, thirty teams (${seen.size})`);
  ok(baseMax < 0.5, `nobody starts with the title in hand (best ${(baseMax * 100).toFixed(0)}%)`);

  const f = M.fxDaily(D, 11);
  const whole = M.fxOdds(D, f.five, 11, 240).odds;
  let t = 0;
  for (let i = 0; i < 240; i += 37) t += M.fxOddsStep(D, f.five, 11, i, Math.min(240, i + 37)).titles;
  ok(Math.abs(whole - t / 240) < 1e-12, 'the odds come out the same played in slices as all at once');
  ok(M.fxOdds(D, f.five, 11, 120).odds === M.fxOdds(D, f.five, 11, 120).odds, 'and the same twice');


  /* A SEASON OF TRADE WINDOWS. Every property is asked of the real market for
     real packages, because every way it goes wrong is an offer list that
     renders: two offers from one club, one from the wrong season, one that
     breaks the salary or value rule, one that leaves either side with nobody
     at center, a franchise player for sale. */
  ok(M.FX_WINDOWS.length === 4 && M.FX_WINDOWS[0].at === 0 && M.FX_WINDOWS.every((w, i) => i === 0 || w.at > M.FX_WINDOWS[i - 1].at)
    && M.FX_WINDOWS[3].at < E.CONSTANTS.REGULAR_SEASON_GAMES, 'four windows, in order, the last before the season ends');
  {
    const a = M.fxSeasonCreate(D, 11);
    const built = M.fxOddsStep(D, f.five, 11, 0, 200).titles, pat = M.fxSeasonOddsStep(D, a, 0, 200).titles;
    ok(built === pat, `standing pat all season is the team as built, season for season (${built} and ${pat})`);
  }
  const st = M.fxSeasonCreate(D, 11), ros = M.fxRosterAt(D, st, 0), season = Number(f.ts.slice(-4));
  const starterKeys = new Set(f.five.map((p) => E.pkey(p)));
  const bench = ros.filter((p) => !starterKeys.has(E.pkey(p)));
  ok(bench.length >= 3, `${f.ts} has a bench to trade from (${bench.length})`);
  ok(M.fxPicksLeft(st).length === 5 && M.fxPicksLeft(st).every(M.pickOk), 'a team owns five picks to start');
  const packs = [
    [[E.pkey(f.five[0])], []],
    [[E.pkey(bench[bench.length - 1])], []],
    [[E.pkey(f.five[1]), E.pkey(bench[0]), E.pkey(bench[1])], []],
    [[E.pkey(f.five[0])], M.fxPicksLeft(st).slice(0, 2)],
  ];
  const mineIds = new Set(ros.map((p) => p.i));
  packs.forEach(([outs, picks]) => {
    const offers = M.fxCalls(D, st, outs, picks);
    const label = outs.map((k) => D.allPlayers[k].n.split(' ').pop()).join('+') + (picks.length ? ' +' + picks.length + ' picks' : '');
    ok(offers.length > 0, `${label}: clubs call (${offers.length})`);
    ok(new Set(offers.map((o) => o.with)).size === offers.length, `${label}: one offer per club at most`);
    const got = outs.reduce((s, k) => s + D.allPlayers[k].p, 0) + picks.reduce((s, id) => s + M.pickValue(id), 0);
    let bad = 0;
    offers.forEach((o) => {
      const ins = o.ins.map((k) => D.allPlayers[k]);
      const inSal = ins.reduce((s, p) => s + p.p, 0);
      if (M.fxDealRefusal(D, st, outs, picks, o.with, o.ins) !== null) bad++;
      else if (!M.clubCalls(st, 0, o.with)) bad++;
      else if (ins.some((p) => p.s !== season || E.teamSeasonId(p.t, p.s) !== o.with || mineIds.has(p.i))) bad++;
      else if (inSal > got + 1e-9) bad++;
      else if (o.ins.indexOf(M.untouchable(D, o.with)) >= 0) bad++;
    });
    ok(bad === 0, `${label}: every offer is from a club that called, same season, fair, and not their star (${bad} not)`);
  });
  /* THE OFFER IS THE CLUB'S BEST FAIR ONE. Rebuilt by brute force for one
     club: no legal package it could send scores higher. */
  {
    const [outs] = packs[0];
    const o = M.fxCalls(D, st, outs, [])[0];
    const rows = M.fxRoster(D, o.with).filter((p) => !mineIds.has(p.i) && E.pkey(p) !== M.untouchable(D, o.with));
    const score = (ks) => ks.reduce((s, k) => s + D.allPlayers[k].p, 0) - M.TRADE.BODY * (ks.length - 1);
    let beat = 0;
    for (let a = 0; a < rows.length; a++) for (let b = a; b < rows.length; b++) for (let c = b; c < rows.length; c++) {
      const ks = [...new Set([a, b, c])].map((i) => E.pkey(rows[i]));
      if (M.fxDealRefusal(D, st, outs, [], o.with, ks) === null && score(ks) > score(o.ins) + 1e-9) beat++;
    }
    ok(beat === 0, `the offer from ${o.with} is the best fair package it has (${beat} beat it)`);
  }
  {
    const withPicks = M.fxCalls(D, st, packs[3][0], packs[3][1]), without = M.fxCalls(D, st, packs[0][0], []);
    const sal = (list) => list.reduce((s, o) => s + o.sal, 0) / Math.max(1, list.length);
    ok(sal(withPicks) > sal(without), `picks buy more salary back (${sal(without).toFixed(1)} to ${sal(withPicks).toFixed(1)} a club)`);
  }
  {
    const who = new Set(D.teamSeasons.filter((t) => t.season === season && t.team_season_id !== f.ts)
      .filter((t) => M.clubCalls(st, 0, t.team_season_id)).map((t) => t.team_season_id));
    const a1 = new Set(M.fxCalls(D, st, packs[0][0], []).map((o) => o.with));
    const a2 = new Set(M.fxCalls(D, st, packs[1][0], []).map((o) => o.with));
    ok([...a1].every((w) => who.has(w)) && [...a2].every((w) => who.has(w)),
      'who calls is the day and the window, never the package');
  }
  /* A WHOLE SEASON, driven: trade a starter, send on a man taken back, stand
     pat, and the refusals the rules promise. */
  {
    const s2 = M.fxSeasonCreate(D, 11);
    const o1 = M.fxCalls(D, s2, [E.pkey(f.five[0])], ['R1Y' + (season + 1)])[0];
    M.fxDeal(D, s2, [E.pkey(f.five[0])], ['R1Y' + (season + 1)], o1.with, o1.ins);
    let twice = null;
    try { M.fxDeal(D, s2, [E.pkey(f.five[1])], [], o1.with, o1.ins); } catch (e) { twice = e.message; }
    M.fxNextWindow(s2);
    ok(s2.win === 1 && !s2.done, 'a window closes and the next opens');
    ok(!M.fxPicksLeft(s2).includes('R1Y' + (season + 1)), 'a pick traded is gone');
    const took = o1.ins[0];
    ok(M.fxRosterAt(D, s2, 1).some((p) => E.pkey(p) === took) && !M.fxRosterAt(D, s2, 1).some((p) => E.pkey(p) === E.pkey(f.five[0])),
      'the roster after the window has the men taken back and not the man sent');
    const o2 = M.fxCalls(D, s2, [took], []);
    ok(o2.length > 0, 'a man taken back can be shopped at the next window');
    M.fxNextWindow(s2); M.fxNextWindow(s2);
    ok(!s2.done, 'the deadline window is still open after three closes');
    M.fxNextWindow(s2);
    ok(s2.done, 'and four closes end the season');
    ok(/deadline has passed/.test(M.fxDealRefusal(D, s2, [took], [], o1.with, o1.ins) || ''), 'no trade after the deadline');
    const sg = M.fxStretches(D, s2);
    ok(sg.length === 4 && sg[0].from === 0 && sg[3].to === E.CONSTANTS.REGULAR_SEASON_GAMES, 'the season is four stretches, 0 to 82');
    /* THE GAMES BEFORE A WINDOW NEVER DEPEND ON WHAT IS DONE AT IT, which is
       what lets the screen show a record and keep it. */
    const early = M.fxSeasonCreate(D, 11);
    M.fxNextWindow(early); M.fxNextWindow(early);
    const r0 = M.fxSeasonReplay(D, early).games.slice(0, 40).join();
    const o3 = M.fxCalls(D, early, [E.pkey(f.five[2])], [])[0];
    M.fxDeal(D, early, [E.pkey(f.five[2])], [], o3.with, o3.ins);
    ok(M.fxSeasonReplay(D, early).games.slice(0, 40).join() === r0, 'a trade at game 40 does not rewrite games 1 to 40');
    const three = M.fxRosterAt(D, M.fxSeasonCreate(D, 11), 0).slice(0, 4).map(E.pkey);
    ok(/three players/.test(M.fxDealRefusal(D, M.fxSeasonCreate(D, 11), three, [], o1.with, o1.ins) || ''), 'four out is refused');
    ok(/franchise player/.test(M.fxDealRefusal(D, M.fxSeasonCreate(D, 11), [E.pkey(f.five[0])], [], o1.with,
      [M.untouchable(D, o1.with)]) || ''), 'a club\'s franchise player is not for sale');
  }
  /* NEGOTIATING. Every answer is asked of a real proposal, and the club's
     counter is checked against a brute force over everything on your side. */
  {
    const n = M.fxSeasonCreate(D, 11), mine = M.fxRosterAt(D, n, 0);
    const star = [...f.five].sort((x, y) => y.p - x.p)[0], sk = E.pkey(star);
    const off = M.fxCalls(D, n, [sk], [])[0];
    // A proposal asking exactly for the offer: it is fair at price, and a
    // counter wants the premium on top, so it is short and the club names a price.
    const r1 = M.fxPropose(D, n, off.with, [sk], [], off.ins);
    const got = star.p, need = M.fxAsking(D, off.ins, 1);
    ok(r1.verdict === (got >= need - 1e-9 ? 'yes' : r1.verdict === 'counter' ? 'counter' : 'no') && r1.attempt === 1,
      `a first proposal is answered and counts (${r1.verdict})`);
    ok(Math.abs(need - off.sal * (1 + M.TRADE.PREMIUM)) < 0.06, 'the first proposal wants the premium on top of what they give');
    ok(M.fxTriesLeft(n, off.with) === M.TRADE.PATIENCE - 1, 'and costs one proposal');
    if (r1.verdict === 'counter') {
      const val = (outs, pk) => outs.reduce((x, k) => x + D.allPlayers[k].p, 0) + pk.reduce((x, id) => x + M.pickValue(id), 0);
      ok(val(r1.outs, r1.picks) >= r1.need - 1e-9 && M.fxDealRefusal(D, n, r1.outs, r1.picks, off.with, off.ins) === null,
        'the club\'s counter closes the gap and is a legal deal');
      let cheaper = 0;
      const opts = M.fxPicksLeft(n).map((id) => ({ outs: [sk], picks: [id], v: M.pickValue(id) }))
        .concat(mine.filter((p) => E.pkey(p) !== sk).map((p) => ({ outs: [sk, E.pkey(p)], picks: [], v: p.p })));
      const addV = r1.add.kind === 'pick' ? M.pickValue(r1.add.key) : D.allPlayers[r1.add.key].p;
      opts.forEach((o) => {
        if (o.v < addV - 1e-9 && val(o.outs, o.picks) >= r1.need - 1e-9
          && M.fxRulesRefusal(D, n, o.outs, o.picks, off.with, off.ins) === null) cheaper++;
      });
      ok(cheaper === 0, `and it is the cheapest single thing that does (${cheaper} cheaper)`);
    }
    // An illegal proposal is explained and costs nothing.
    const cheap = M.fxRoster(D, off.with).filter((p) => E.pkey(p) !== M.untouchable(D, off.with)).slice(-1)[0];
    const before = M.fxTriesLeft(n, off.with);
    const r2 = M.fxPropose(D, n, off.with, [sk], [], [E.pkey(cheap)]);
    ok(r2.verdict === 'illegal' && /salar/.test(r2.reason) && M.fxTriesLeft(n, off.with) === before,
      `a proposal the rules refuse is explained and costs no patience (${r2.reason})`);
    // Their star is never on the table.
    ok(M.fxPropose(D, n, off.with, [sk], [], [M.untouchable(D, off.with)]).verdict === 'illegal', 'asking for the franchise player is refused');
    // Out of patience, they hang up, stop calling this window, and call again at the next.
    /* A 'no' needs a proposal that is legal, short, and has nothing on your
       side that closes it: three men out, so no room for a fourth, and short by
       more than the dearest pick. Found by search rather than assumed. */
    const allPicks = [], pv = M.TRADE.PICK1;
    let fixture = null;
    const trios = [];
    for (let a = 0; a < mine.length; a++) for (let b = a + 1; b < mine.length; b++) for (let c = b + 1; c < mine.length; c++)
      trios.push([mine[a], mine[b], mine[c]]);
    trios.sort((x, y) => y.reduce((q, p) => q + p.p, 0) - x.reduce((q, p) => q + p.p, 0));
    for (const trio of trios.slice(0, 40)) {
      if (fixture) break;
      const outs = trio.map(E.pkey), got2 = trio.reduce((q, p) => q + p.p, 0) + pv;
      for (const t of D.teamSeasons) {
        if (fixture) break;
        if (t.season !== Number(f.ts.slice(-4)) || t.team_season_id === f.ts) continue;
        const rs = M.fxRoster(D, t.team_season_id).filter((p) => E.pkey(p) !== M.untouchable(D, t.team_season_id));
        for (let a = 0; a < rs.length && !fixture; a++) for (let b = a + 1; b < rs.length && !fixture; b++) for (let c = b + 1; c < rs.length && !fixture; c++) {
          const ins = [rs[a], rs[b], rs[c]].map(E.pkey), sal = rs[a].p + rs[b].p + rs[c].p;
          if (sal * (1 + M.TRADE.PREMIUM) > got2 && M.fxRulesRefusal(D, n, outs, allPicks, t.team_season_id, ins) === null) {
            fixture = { club: t.team_season_id, outs, ins };
          }
        }
      }
    }
    ok(!!fixture, 'a legal proposal nothing on your side can close exists to test with');
    const club = fixture ? fixture.club : off.with;
    for (let i = 0; i < 4 && fixture && !M.fxHungUp(n, club); i++) {
      const r = M.fxPropose(D, n, club, fixture.outs, allPicks, fixture.ins);
      if (i === 0) ok(r.verdict === 'no' && !r.hung, `short with nothing to add is a no, and the first no is not a hang-up (${r.verdict})`);
    }
    ok(M.fxHungUp(n, club) && M.fxTriesLeft(n, club) === 0, 'a club out of patience hangs up');
    ok(!M.fxCalls(D, n, [sk], []).some((o) => o.with === club), 'and does not call again this window');
    ok(M.fxPropose(D, n, club, [sk], [], off.ins).verdict === 'gone', 'or take another proposal');
    M.fxNextWindow(n);
    ok(!M.fxHungUp(n, club) && M.fxTriesLeft(n, club) === M.TRADE.PATIENCE, 'a new window is a new conversation');
    // A yes is a deal the engine will make.
    const n2 = M.fxSeasonCreate(D, 11);
    const rich = [sk, E.pkey(mine.filter((p) => E.pkey(p) !== sk).sort((a, b) => b.p - a.p)[0])];
    const yes = M.fxPropose(D, n2, off.with, rich.slice(0, 1), M.fxPicksLeft(n2).slice(0, 2), off.ins);
    if (yes.verdict === 'yes') ok(M.fxDealRefusal(D, n2, rich.slice(0, 1), M.fxPicksLeft(n2).slice(0, 2), off.with, off.ins) === null, 'a yes is a legal deal');
    else ok(yes.verdict === 'counter', `adding picks gets a yes or a named price (${yes.verdict})`);
  }
  /* canCover is a bipartite match; fiveOf is a brute force over the same rule.
     They must agree on every roster, or an offer could leave a team the coach
     cannot start. */
  {
    const rng = E.createSeededRNG(E.hashSeed('cover'));
    let disagree = 0;
    for (let n = 0; n < 400; n++) {
      const rows = M.fxRoster(D, D.teamSeasons[Math.floor(rng() * D.teamSeasons.length)].team_season_id)
        .filter(() => rng() < 0.55).slice(0, 9);
      if (M.canCover(rows) !== !!M.fiveOf(rows)) disagree++;
    }
    ok(disagree === 0, `canCover and the brute force agree on 400 rosters (${disagree} disagree)`);
  }
  /* EVERY OFFER HAS A LINEUP, on many days. A legal trade can send the only
     guard in the top nine while a guard sits tenth, and the lineup has to
     look down the whole bench rather than leave a legal trade with no five. */
  {
    let offers = 0, noFive = 0;
    for (let d = 1; d <= 12; d++) {
      const g = M.fxDaily(D, d), s3 = M.fxSeasonCreate(D, d);
      [...g.five].sort((x, y) => y.p - x.p).slice(0, 2).forEach((star) => {
        M.fxCalls(D, s3, [E.pkey(star)], []).forEach((o) => {
          offers++;
          const t = M.fxSeasonCreate(D, d);
          M.fxDeal(D, t, [E.pkey(star)], [], o.with, o.ins);
          if (!M.fxLineup(M.fxRosterAt(D, t, 0))) noFive++;
        });
      });
    }
    ok(noFive === 0 && offers > 100, `every offer for a star over twelve days leaves a lineup (${noFive} of ${offers} do not)`);
  }
  /* THE BALANCE: chasing points is the trap, reading value is the puzzle. A
     bot trading for the most points ends lower than a bot trading for win
     shares, which the screen never shows. */
  if (!QUICK) {
    const bot = (day, judge) => {
      const s4 = M.fxSeasonCreate(D, day);
      while (!s4.done) {
        const r4 = M.fxRosterAt(D, s4, s4.win), v0 = judge(M.fxLineup(r4));
        let best = null;
        for (let i = 0; i < r4.length; i++) for (const o of M.fxCalls(D, s4, [E.pkey(r4[i])], [])) {
          const t = { ...s4, trades: s4.trades.concat([{ w: s4.win, with: o.with, outs: [E.pkey(r4[i])], ins: o.ins, picks: [] }]) };
          const v = judge(M.fxLineup(M.fxRosterAt(D, t, s4.win)));
          if (!best || v > best.v) best = { v, out: E.pkey(r4[i]), o };
        }
        if (best && best.v > v0 * 1.02) M.fxDeal(D, s4, [best.out], [], best.o.with, best.o.ins);
        M.fxNextWindow(s4);
      }
      return M.fxSeasonOddsStep(D, s4, 0, 200).titles / 200;
    };
    const wsJ = (fv) => fv.reduce((x, p) => x + p.w, 0), ptJ = (fv) => fv.reduce((x, p) => x + (p.pts || 0), 0);
    let ws = 0, pt = 0;
    for (const d of [3, 11, 20]) { ws += bot(d, wsJ); pt += bot(d, ptJ); }
    console.log(`  over three days: trading for win shares ${(ws / 3 * 100).toFixed(0)}%, for points ${(pt / 3 * 100).toFixed(0)}%`);
    ok(ws > pt + 0.15, 'reading value beats chasing points by a lot');
    ok(ws / 3 < 0.9, 'and even perfect reading does not make the title a formality');
  }
}

// ── 5. Six Passes ───────────────────────────────────────────────────────────
section('5. Six Passes: a year of puzzles, every par a real shortest chain');
{
  const g = M.psGraph(D);
  let missing = 0; const pars = {};
  for (let d = 1; d <= 365; d++) {
    const p = M.psDaily(g, d);
    if (!p) { missing++; continue; }
    pars[p.par] = (pars[p.par] || 0) + 1;
    if (d <= 40) {
      const path = M.psPath(g, p.from, p.to);
      ok(path && path.length === p.par + 1, `day ${d}: par ${p.par} is a real chain`);
      ok(path.every((id, i) => i === 0 || M.psCanPass(g, path[i - 1], id)), `day ${d}: every pass in it is to a teammate`);
      ok(M.psBfs(g, p.from)[p.to] === p.par, `day ${d}: and nothing is shorter`);
      ok(g.stars[p.from] >= M.PS.STARS && g.stars[p.to] >= M.PS.STARS, `day ${d}: both ends are All-Stars`);
    }
  }
  ok(missing === 0, `every day of a year has a puzzle (${missing} missing)`);
  ok(Object.keys(pars).every((k) => k >= M.PS.PAR_MIN && k <= M.PS.PAR_MAX && k < M.PS.CLOCK),
    `every par fits the shot clock (${JSON.stringify(pars)})`);
  ok(Object.keys(pars).length >= 2, 'and the par varies');
}

// ── 6. a number a player reads is the number the game plays ─────────────────
section('6. the copy and the SQL agree with the constants');
{
  const WORD = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
  const ORD = ['', '', 'second', 'third', 'fourth', 'fifth', 'sixth'];
  const how = fs.readFileSync(path.join(HERE, 'how-to-play.html'), 'utf8');
  ok(how.includes('<b>' + WORD[M.CQ.LIVES] + ' lives</b>'), `the rules page says ${WORD[M.CQ.LIVES]} lives`);
  ok(how.includes('shot clock is ' + WORD[M.PS.CLOCK] + ' passes'), `the rules page says ${WORD[M.PS.CLOCK]} passes`);
  ok(how.includes('Every ' + ORD[M.CQ.BOSS_EVERY] + ' team is a boss'), `the rules page says every ${ORD[M.CQ.BOSS_EVERY]} team is a boss`);

  const sql = fs.readFileSync(path.join(ROOT, 'supabase/116_hoops_modes.sql'), 'utf8');
  ok(sql.includes("date '" + M.DAILY_EPOCH + "'"), `116 counts days from ${M.DAILY_EPOCH}, as modes.js does`);
  const page = fs.readFileSync(path.join(HERE, 'index.html'), 'utf8');
  ok(page.includes("var DAILY_EPOCH = '" + M.DAILY_EPOCH + "'"), 'and so does the page');
  ok(sql.includes('v_passes > ' + M.PS.CLOCK), `116 refuses a chain past the ${M.PS.CLOCK} pass shot clock`);
  ok(sql.includes('p_lives > ' + M.CQ.LIVES), `116 refuses more than ${M.CQ.LIVES} lives`);
  ok(sql.includes('p_slot > ' + (E.SLOTS.length - 1)), 'and a slot past the last one');
  ok(sql.includes('p_par > 6') && M.PS.PAR_MAX <= 6, 'and a par past what the puzzle ever sets');
  ok(M.dayNumberOf(M.DAILY_EPOCH) === 1, 'the epoch is day 1');
  const sql117 = fs.readFileSync(path.join(ROOT, 'supabase/117_hoops_trade.sql'), 'utf8');
  ok(sql117.includes('v_nout > ' + M.TRADE.MAX) && sql117.includes('v_nin > ' + M.TRADE.MAX),
    `117 refuses more than ${M.TRADE.MAX} a side, as the finder does`);
  const pre = fs.readFileSync(path.join(ROOT, 'supabase/test/launch_preflight.sql'), 'utf8');
  ok(pre.includes("'117_hoops_trade'") && pre.includes("name = 'rtf_submit_trade'"), 'the preflight asks for 117');

}

// ── 7. the page ─────────────────────────────────────────────────────────────
if (!QUICK) {
  section('7. the page, all three modes, the board stood in for');
  const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  const pw = createRequire('/opt/node22/lib/node_modules/')('playwright');
  const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };
  const posts = [];
  const escaped = [];
  async function serve(route) {
    const u = new URL(route.request().url());
    /* THE BOARD, stood in for. Submits answer an id; reads answer a row and a
       count in Content-Range, which is what PostgREST sends. */
    if (/supabase\.co$/.test(u.hostname)) {
      if (u.pathname.includes('/rpc/')) {
        posts.push({ fn: u.pathname.split('/').pop(), body: JSON.parse(route.request().postData() || '{}') });
        return route.fulfill({ status: 200, contentType: 'application/json', body: '77' });
      }
      if (u.pathname.endsWith('/rtf_plays')) {
        /* Three counts the page asks: how many are ahead (score=gt), how many
           made the same move (fix_in), and the whole field. Answered as
           different numbers so each line can be told apart. */
        const q = u.search;
        const n = /score=gt/.test(q) ? 2 : /fix_in=/.test(q) ? 5 : 41;
        return route.fulfill({ status: 200, contentType: 'application/json',
          headers: { 'content-range': '0-0/' + n, 'access-control-expose-headers': 'content-range' },
          body: '[]' });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }
    if (u.hostname !== 'local.test') { escaped.push(u.hostname); return route.abort(); }
    let rel = decodeURIComponent(u.pathname);
    if (rel.endsWith('/')) rel += 'index.html';
    const f = path.join(ROOT, rel);
    if (!fs.existsSync(f)) return route.abort();
    return route.fulfill({ status: 200, contentType: TYPES[path.extname(f)] || 'application/octet-stream',
      body: fs.readFileSync(f) });
  }
  const browser = await pw.chromium.launch({ executablePath: CHROME });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  await ctx.addInitScript(() => {
    try { localStorage.setItem('rtf.guide.v1', '1'); } catch (e) {}
    window.RTF_BOARD_URL = 'https://stand-in.supabase.co';
  });
  const page = await ctx.newPage();
  const boom = [];
  page.on('pageerror', (e) => boom.push(String(e).slice(0, 200)));
  await page.route('**/*', serve);
  await page.goto('http://local.test/hoops/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#b-today:not([disabled])', { timeout: 60000 });

  const home = await page.evaluate(() => ({
    cards: ['mc-fix', 'mc-ps', 'mc-cq'].map((id) => !!document.getElementById(id)),
    dock: document.querySelector('#dock').textContent.trim(),
  }));
  ok(home.cards.every(Boolean), 'the front page has a card for each of the three');
  ok(/Fix History/.test(home.dock), `the dock offers today's Fix History first ("${home.dock}")`);

  // Fix History, end to end: a season of four windows.
  await page.click('#mc-fix');
  await page.waitForSelector('.fx-man[data-k]');
  const fx = await page.evaluate(() => {
    const M = window.RTF_MODES, D = window.RTF_PAGE.data, E = window.RTF_ENGINE;
    const d = window.RTF_PAGE.dayNumberOf(window.RTF_PAGE.easternISO());
    const st = M.fxSeasonCreate(D, d);
    const f = M.fxDaily(D, d), ros = M.fxRosterAt(D, st, 0);
    const star = E.pkey(f.five[1]), pick = M.fxPicksLeft(st)[0];
    return { day: d, ts: f.ts, star, pick, rows: ros.length, offers: M.fxCalls(D, st, [star], [pick]).length };
  });
  const rows = await page.$$eval('.fx-man[data-k]', (b) => b.length);
  ok(rows === fx.rows, `the whole roster is on the screen, bench too (${rows} of ${fx.rows})`);
  ok(await page.$('#fx-find') === null && await page.$('#fx-pat') !== null,
    'with an empty block there is nothing to find, and standing pat is always there');
  const steps = await page.$$eval('.fxw-s', (b) => b.map((x) => x.textContent));
  ok(steps.length === 4 && /Open now/.test(steps[0]), `four windows, the first open (${steps.length})`);
  await page.click(`.fx-man[data-k="${fx.star}"]`);
  await page.click(`.fx-pick[data-pk="${fx.pick}"]`);
  const find = await page.textContent('#fx-find');
  ok(find.includes(String(fx.offers)), `the dock counts the calls for the package with its pick ("${find.trim()}" for ${fx.offers})`);
  await page.click('#fx-find');
  await page.waitForSelector('.fx-offer');
  const shown = await page.$$eval('.fx-offer', (b) => b.map((x) => x.getAttribute('data-w')));
  ok(shown.length === fx.offers && new Set(shown).size === shown.length, `one offer per club on the screen (${shown.length})`);
  const wsOnMarket = await page.$$eval('.fx-offer', (b) => b.some((x) => /\bWS\b/.test(x.textContent)));
  ok(!wsOnMarket, 'no win shares on an offer: that is the answer');
  const pickWith = await page.getAttribute('.fx-offer', 'data-w');
  await page.click('.fo-take');
  await page.click('#fx-yes');
  await page.waitForSelector('#fx-on', { timeout: 30000 });
  const run = await page.evaluate(() => JSON.parse(localStorage.getItem('rtf.fix.run.v2')));
  ok(run && run.win === 1 && run.trades.length === 1 && run.trades[0].with === pickWith
    && run.trades[0].picks[0] === fx.pick && run.trades[0].outs[0] === fx.star, 'the deal and its pick are kept, and the window moves on');
  const stretch = await page.textContent('#s-fix');
  ok(/Games 1 to 20/.test(stretch), 'the first stretch of the season is played and shown');

  /* A RELOAD MID-SEASON comes back to the same window with the same deal. */
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#b-today:not([disabled])', { timeout: 60000 });
  const row = await page.textContent('#mc-fix');
  ok(/Game 20 window is open/.test(row), `the front page says which window is open ("${row.trim().slice(0, 60)}")`);
  await page.click('#mc-fix');
  await page.waitForSelector('#fx-pat');
  const steps2 = await page.$$eval('.fxw-s', (b) => b.map((x) => x.textContent));
  ok(/Traded/.test(steps2[0]) && /Open now/.test(steps2[1]), 'a reload lands in the game 20 window with the deal marked');
  ok(await page.$(`.fx-pick[data-pk="${fx.pick}"]`) === null, 'and the traded pick is gone from the shelf');
  /* A COUNTER at game 20: the table opens on the club's offer, a proposal is
     answered, and it costs a proposal. Then back out and stand pat. */
  await page.click('#s-fix .fx-man[data-k]');
  await page.click('#fx-find');
  await page.waitForSelector('.fo-talk');
  await page.click('.fo-talk');
  await page.waitForSelector('#tk-go');
  const asked = await page.$$eval('.tk-p.on[data-side="theirs"]', (b) => b.length);
  ok(asked > 0, `the table opens on the club's own offer (${asked} asked for)`);
  const locked = await page.$$eval('.tk-p.lock', (b) => b.length);
  ok(locked === 1, 'with their franchise player shown and not for sale');
  if (await page.$('#tk-go:not([disabled])')) {
    await page.click('#tk-go');
    await page.waitForSelector('.tk-reply');
    const reply = await page.textContent('.tk-reply');
    ok(/said yes|want more|No\.|hung up/.test(reply), `the club answers ("${reply.trim().slice(0, 60)}")`);
    const pat = await page.textContent('.tk-pat');
    ok(/1 proposal left/.test(pat), `and the proposal is spent ("${pat.trim()}")`);
  } else ok(false, 'the club\'s own offer can be proposed back to it');
  await page.click('#tk-back');
  await page.waitForSelector('#fx-back');
  await page.click('#fx-back');
  await page.waitForSelector('#fx-pat');
  await page.click('#s-fix .fx-man.out[data-k]');
  for (let i = 0; i < 3; i++) {
    if (i) { await page.click('#fx-on'); await page.waitForSelector('#fx-pat'); }
    await page.click('#fx-pat');
    await page.waitForSelector('#fx-on');
  }
  await page.click('#fx-on');
  await page.waitForSelector('#fx-share', { timeout: 30000 });
  await page.waitForTimeout(300);
  const saved = await page.evaluate((d) => JSON.parse(localStorage.getItem('rtf.fix.v1')).days[d], fx.day);
  ok(!!saved && saved.v === 2 && saved.trades.length === 1 && saved.trades[0].with === pickWith, 'the season is kept for the day');
  ok(await page.evaluate(() => localStorage.getItem('rtf.fix.run.v2')) === null, 'and the season in progress is cleared');
  const sub = posts.find((p) => p.fn === 'rtf_submit_fix_season');
  ok(!!sub && sub.body.p_day === fx.day && sub.body.p_trades.length === 1 && sub.body.p_trades[0].picks[0] === fx.pick
    && saved.trades[0].ins.indexOf(sub.body.p_headline) >= 0, 'and filed as a season: the trades, their picks, the headline');
  ok(sub && Math.abs(sub.body.p_odds - saved.odds) < 1e-4, 'with the odds the screen shows');
  ok(!posts.some((p) => p.fn === 'rtf_submit_fix' || p.fn === 'rtf_submit_trade'), 'and never through an older submit');
  const place = await page.textContent('#fx-place');
  ok(/3rd of 41 today/.test(place), `the place comes off the board ("${place.trim()}")`);
  ok(/4 others traded for/.test(place), 'and so does how many traded for the same man');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#b-today:not([disabled])', { timeout: 60000 });
  await page.click('#mc-fix');
  ok(await page.$('#fx-share') !== null && await page.$('#fx-pat') === null,
    'a reload lands on the result: one season a day');
  const dock = await page.evaluate(() => { window.RTF_PAGE.goHome(); return document.querySelector('#dock').textContent.trim(); });
  ok(/Six Passes/.test(dock), `with Fix done, the dock moves on to Six Passes ("${dock}")`);

  /* THE TWO OLDER SHAPES OF RESULT, planted as somebody who played this
     morning would have left them, still draw and still file the way they were
     made. */
  for (const shape of ['one-for-one', 'one trade']) {
    const legacy = await page.evaluate(([d, shape]) => {
      const M = window.RTF_MODES, D = window.RTF_PAGE.data, E = window.RTF_ENGINE;
      const f = M.fxDaily(D, d);
      const st = JSON.parse(localStorage.getItem('rtf.fix.v1'));
      const base = { day: d, ts: f.ts, odds: 0.2, base: 0.1, avgWins: 50,
        replay: { w: 50, l: 32, title: false, story: 'Lost in the Second Round, 2-4.' }, at: 1 };
      let name;
      if (shape === 'one-for-one') {
        const inn = D.players.find((p) => p.t !== 'TOT' && p.p < f.five[4].p && E.canFillSlot(p, 'C') && p.s < 1990);
        st.days[d] = Object.assign(base, { slot: 4, out: E.pkey(f.five[4]), inKey: E.pkey(inn) });
        name = inn.n;
      } else {
        const s0 = M.fxSeasonCreate(D, d), o = M.fxCalls(D, s0, [E.pkey(f.five[0])], [])[0];
        st.days[d] = Object.assign(base, { with: o.with, outs: [E.pkey(f.five[0])], ins: o.ins });
        name = D.allPlayers[o.ins[0]].n;
      }
      localStorage.setItem('rtf.fix.v1', JSON.stringify(st));
      return { name };
    }, [fx.day, shape]);
    posts.length = 0;
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#b-today:not([disabled])', { timeout: 60000 });
    await page.click('#mc-fix');
    await page.waitForSelector('#fx-share');
    const lt = await page.textContent('#s-fix');
    ok(lt.includes(legacy.name), `a ${shape} result still draws its man (${legacy.name})`);
    await page.waitForTimeout(300);
    const want = shape === 'one-for-one' ? 'rtf_submit_fix' : 'rtf_submit_trade';
    ok(posts.some((p) => p.fn === want) && posts.every((p) => !/^rtf_submit_(fix|trade|fix_season)$/.test(p.fn) || p.fn === want),
      `and files through ${want}, the submit it was made for`);
    await page.evaluate(() => window.RTF_PAGE.goHome());
  }

  // Six Passes, along a shortest chain, through the filter a player uses.
  await page.click('#mc-ps');
  await page.waitForSelector('#ps-q');
  const art = await page.evaluate(() => ({
    pics: document.querySelectorAll('#s-pass .ps-pic svg.portrait').length,
    hoop: !!document.querySelector('#s-pass .ps-tl .ps-hoop'),
    flag: [...document.querySelectorAll('#s-pass .ps-tl path')].some((p) => /Z\s*$/.test(p.getAttribute('d') || '')),
  }));
  ok(art.pics === 2, `both ends of the puzzle wear a pixel portrait (${art.pics})`);
  ok(art.hoop && !art.flag, 'the timeline ends at a hoop, not a golf flag');
  const chain = await page.evaluate(() => {
    const M = window.RTF_MODES, g = M.psGraph(window.RTF_PAGE.data);
    const d = window.RTF_PAGE.dayNumberOf(window.RTF_PAGE.easternISO());
    const p = M.psDaily(g, d);
    return { day: d, par: p.par, path: M.psPath(g, p.from, p.to), names: M.psPath(g, p.from, p.to).map((i) => g.nameOf[i]) };
  });
  for (let i = 1; i < chain.path.length; i++) {
    await page.fill('#ps-q', chain.names[i].split(' ').pop());
    await page.click(`.ps-mate[data-id="${chain.path[i]}"]`);
    await page.waitForTimeout(50);
  }
  const psDone = await page.evaluate((d) => JSON.parse(localStorage.getItem('rtf.passes.v1')).days[d], chain.day);
  ok(psDone && psDone.done && psDone.solved && psDone.chain.length === chain.par + 1, 'a chain at par solves the day');
  const pssub = posts.find((p) => p.fn === 'rtf_submit_passes');
  ok(!!pssub && pssub.body.p_par === chain.par && pssub.body.p_solved === true, 'and is filed with its par and solved');
  ok(/Perfect pass/i.test(await page.textContent('#s-pass')), 'a chain at par is called a perfect pass');

  // Conquest: a game, and the count is not spoiled while it is on.
  await page.evaluate(() => window.RTF_MODES_UI.openConquest());
  await page.click('#cq-new');
  /* THE OPENING DRAFT, through the cards a player taps. A reload in the
     middle has to come back to the same pick with the same three cards. */
  await page.waitForSelector('.cqd-card');
  await page.click('.cqd-card');
  await page.click('.cqd-card');
  const mid = await page.$$eval('.cqd-card', (b) => b.map((x) => x.getAttribute('data-k')).join());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#b-today:not([disabled])', { timeout: 60000 });
  await page.evaluate(() => window.RTF_MODES_UI.openConquest());
  await page.waitForSelector('.cqd-card');
  const back = await page.$$eval('.cqd-card', (b) => b.map((x) => x.getAttribute('data-k')).join());
  ok(back === mid, 'a reload mid-draft comes back to the same pick and the same three cards');
  for (let i = 0; i < 3; i++) await page.click('.cqd-card');
  await page.waitForSelector('#cq-go');
  const drafted = await page.evaluate(() => window.RTF_MODES_UI._cq().roster.length);
  ok(drafted === 5, `five taps draft five (${drafted})`);
  /* THE GAME PLAN. Tip off waits on one, and choosing one must not move the
     odds bar: a chance that moved as you tapped would turn the read into a
     menu of five numbers. */
  const gate = await page.evaluate(() => {
    const go = document.getElementById('cq-go');
    return { disabled: go.disabled, text: go.textContent, plans: document.querySelectorAll('.cq-plan[data-plan]').length,
      bar: document.querySelector('.cq-bar i').style.width, odds: document.querySelector('.cq-bar-l').textContent };
  });
  ok(gate.disabled && /plan/i.test(gate.text), `tip off waits on a game plan (${gate.disabled}, "${gate.text}")`);
  ok(gate.plans === M.CQ_PLANS.length, `every plan is offered (${gate.plans})`);
  const planPage = await page.evaluate(() => document.querySelector('.cq-plans').innerText);
  ok(!/[+-]\d|edge|%/i.test(planPage), 'the plan card shows the two fives and no edge or chance');
  await page.click('.cq-plan[data-plan="rim"]');
  const picked = await page.evaluate(() => ({
    disabled: document.getElementById('cq-go').disabled,
    on: [...document.querySelectorAll('.cq-plan.on')].map((b) => b.getAttribute('data-plan')).join(),
    bar: document.querySelector('.cq-bar i').style.width, odds: document.querySelector('.cq-bar-l').textContent,
    saved: window.RTF_MODES_UI._cq().plan }));
  ok(!picked.disabled && picked.on === 'rim' && picked.saved === 'rim', `a tap picks the plan and opens tip off (${picked.on}, ${picked.saved})`);
  ok(picked.bar === gate.bar && picked.odds === gate.odds, 'and the odds bar does not move');
  const before = await page.textContent('#cq-wins');
  await page.click('#cq-go');
  const during = await page.textContent('#cq-wins');
  ok(during === before, `the win count does not move before the game is over (${before} then ${during})`);
  await page.waitForFunction(() => document.querySelector('.mx-stamp'), null, { timeout: 20000 });
  const st = await page.evaluate(() => window.RTF_MODES_UI._cq());
  ok(!!(st.pending || st.losses.length), 'the game is recorded on the run');
  const g1 = st.pending || st.losses[st.losses.length - 1];
  ok(g1 && g1.plan === 'rim' && typeof g1.edge === 'number' && g1.bestPlan, `the game carries its plan and the best read (${g1 && g1.plan})`);
  ok(st.plan == null, 'and the plan is cleared for the next game');
  await page.waitForSelector('.cq-verdict', { timeout: 5000 }).catch(() => null);
  const verdict = await page.evaluate(() => { const v = document.querySelector('.cq-verdict'); return v ? v.textContent : ''; });
  ok(/Protect the rim:/.test(verdict) && /(right read|Better read)/.test(verdict), `after the game it says how the plan went ("${verdict}")`);

  // Play it out and check the end is filed once.
  for (let i = 0; i < 200; i++) {
    const s = await page.evaluate(() => { const c = window.RTF_MODES_UI._cq(); return { lost: !!c.lost, pending: !!c.pending }; });
    if (s.lost) break;
    if (await page.$('#cq-again')) { await page.click('#cq-again'); continue; }
    if (await page.$('#cq-keep')) { await page.click('#cq-keep'); continue; }
    if (await page.$('#cq-go')) { await page.click('.cq-plan'); await page.click('#cq-go'); await page.waitForFunction(() => document.querySelector('.mx-stamp'), null, { timeout: 20000 }); continue; }
    await page.waitForTimeout(100);
  }
  await page.waitForTimeout(500);
  if (await page.$('#cq-end')) { await page.click('#cq-end'); await page.waitForTimeout(300); }
  const cqsub = posts.filter((p) => p.fn === 'rtf_submit_conquest');
  ok(cqsub.length === 1, `a finished run is filed once (${cqsub.length})`);
  ok(cqsub[0] && cqsub[0].body.p_lives === 0 && /^[a-z0-9]{6,40}$/.test(cqsub[0].body.p_seed),
    'with no lives left and a seed the server accepts');

  /* Fonts and the supabase-js bundle are asked for and refused, which is
     fine. What must never appear is a database host: every one is answered by
     the stand-in above, so reaching this list would mean one got past it. */
  const db = escaped.filter((h) => /supabase/.test(h) && !/jsdelivr/.test(h));
  ok(db.length === 0, `no request reached a database (${db.join(', ') || 'none'})`);
  ok(boom.length === 0, `no page errors (${boom.join(' | ') || 'none'})`);
  await browser.close();
}

console.log('');
if (failures.length) {
  console.error(`${passed} passed, ${failures.length} FAILED\n`);
  for (const f of failures) console.error('  FAIL: ' + f);
  process.exit(1);
}
console.log(`${passed} assertions passed.`);
