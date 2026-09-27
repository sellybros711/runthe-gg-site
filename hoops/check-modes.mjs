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

// ── 4b. your lineup ─────────────────────────────────────────────────────────
section('4b. Fix History: you set the five, and the five you set is the five that plays');
{
  const day = 7, st = M.fxSeasonCreate(D, day);
  const keys = (fv) => fv.map(p => E.pkey(p)).join();
  const rows0 = M.fxRosterAt(D, st, 0), coach = M.fxLineup(rows0);
  ok(keys(M.fxLineupAt(D, st, 0)) === keys(coach), 'no lineup set is the coach\'s five');
  ok(JSON.stringify(M.fxStretches(D, st).map(g => keys(g.five))) === JSON.stringify(M.FX_WINDOWS.map(() => keys(coach))),
    'so a season nobody touched plays the team as built');
  /* The best man on the bench swapped for the best starter: a real change,
     and the one that has to move the odds downward. */
  const star = [...coach].sort((a, b) => b.w - a.w)[0];
  const bench = rows0.filter(p => !coach.some(c => c.i === p.i)).sort((a, b) => a.w - b.w)[0];
  const sat = coach.map(p => E.pkey(p === star ? bench : p));
  ok(M.fxSetLineup(D, st, sat) === null, 'a bench man can take a starter\'s spot');
  ok(keys(M.fxLineupAt(D, st, 0)) === sat.join(), 'and the five is the five set, in the spots set');
  ok(keys(M.fxStretches(D, st)[0].five) === sat.join(), 'the stretch plays that five, not the coach\'s');
  const oddsSat = M.fxSeasonOddsStep(D, st, 0, 300).titles, oddsCoach = M.fxSeasonOddsStep(D, M.fxSeasonCreate(D, day), 0, 300).titles;
  console.log(`  benching the best man: ${oddsCoach} titles in 300 against ${oddsSat}`);
  ok(oddsSat < oddsCoach, 'benching the best man costs title odds');
  /* A swap of two starters is legal whatever the positions say. */
  const flip = coach.map(p => E.pkey(p)); [flip[0], flip[4]] = [flip[4], flip[0]];
  const st2 = M.fxSeasonCreate(D, day);
  ok(M.fxSetLineup(D, st2, flip) === null && keys(M.fxLineupAt(D, st2, 0)) === flip.join(), 'two starters swap spots, any spot');
  ok(M.fxSetLineup(D, st2, flip.slice(0, 4).concat([flip[0]])) !== null, 'the same man twice is refused');
  ok(M.fxSetLineup(D, st2, flip.slice(0, 4).concat(['nobody|1990|XXX'])) !== null, 'a man not on the roster is refused');
  ok(M.fxSetLineup(D, st2, coach.map(p => E.pkey(p))) === null && !st2.lineups, 'setting the coach\'s five back clears it');
  /* It carries forward, and the games before the window it was set at never
     move: the record the desk prints is the record as played. */
  const st3 = M.fxSeasonCreate(D, day);
  M.fxNextWindow(st3);
  const before = M.fxSeasonReplay(D, st3).games.slice(0, M.FX_WINDOWS[1].at).join();
  M.fxSetLineup(D, st3, sat);
  ok(M.fxSeasonReplay(D, st3).games.slice(0, M.FX_WINDOWS[1].at).join() === before, 'a lineup set at a window never moves a game before it');
  ok(keys(M.fxStretches(D, st3)[0].five) === keys(coach), 'and the stretch before it keeps the coach\'s five');
  M.fxNextWindow(st3);
  ok(keys(M.fxLineupAt(D, st3, 2)) === sat.join(), 'the five carries forward to the next window');
  /* A starter traded away leaves a hole, and the hole is filled from the
     roster: always five different men, all of them yours. */
  const st4 = M.fxSeasonCreate(D, day);
  M.fxSetLineup(D, st4, sat);
  let holes = 0, tried = 0, moved = 0;
  for (const p of M.fxLineupAt(D, st4, 0)) {
    for (const o of M.fxCalls(D, st4, [E.pkey(p)], []).slice(0, 3)) {
      tried++;
      const t = { ...st4, trades: [{ w: 0, with: o.with, outs: [E.pkey(p)], ins: o.ins, picks: [] }] };
      const fv = M.fxLineupAt(D, t, 0), mine = new Set(M.fxRosterAt(D, t, 0).map(x => E.pkey(x)));
      if (fv.length !== 5 || new Set(fv.map(x => x.i)).size !== 5 || !fv.every(x => mine.has(E.pkey(x))) || fv.some(x => E.pkey(x) === E.pkey(p))) holes++;
      /* and the four who stayed keep the spots you put them in */
      if (sat.some((k, i) => k !== E.pkey(p) && E.pkey(fv[i]) !== k)) moved++;
    }
  }
  ok(tried > 3 && holes === 0, `a traded starter's hole is always filled from your roster (${holes} of ${tried} are not)`);
  ok(moved === 0, `and the four who stayed keep their spots (${moved} of ${tried} moved)`);
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

// ── 5b. endless and picked puzzles ─────────────────────────────────────────
/* An endless or picked puzzle is numbered below zero, so every seed built from
   it is one no calendar day can draw, and a picked one is numbered off what was
   picked, so a link gives a friend the same calls and the same odds. */
section('5b. endless and picked puzzles never share a seed with a day');
{
  const g = M.psGraph(D);
  let rs = 1;
  const rng = () => { rs = (rs * 16807) % 2147483647; return rs / 2147483647; };
  let fxNeg = 0, fxAvoid = 0, psNeg = 0, psPar = 0;
  const today = M.dayNumberOf(new Date().toISOString().slice(0, 10));
  for (let i = 0; i < 40; i++) {
    const f = M.fxEndless(D, rng, [M.fxDaily(D, today).ts]);
    if (f.day < 0 && M.isEndless(f.day) && M.fxCandidates(D).includes(f.ts)) fxNeg++;
    if (f.ts !== M.fxDaily(D, today).ts) fxAvoid++;
    const p = M.psEndless(g, rng, []);
    if (p && p.day < 0) psNeg++;
    if (p && M.psBfs(g, p.from)[p.to] === p.par && p.par >= M.PS.PAR_MIN && p.par <= M.PS.PAR_MAX) psPar++;
  }
  ok(fxNeg === 40, `40 endless teams, every one numbered below zero and a real contender (${fxNeg})`);
  ok(fxAvoid === 40, `and none of them is today's team (${fxAvoid})`);
  ok(psNeg === 40 && psPar === 40, `40 endless chains, numbered below zero, every par a real shortest chain (${psNeg}, ${psPar})`);
  ok(!M.isEndless(1) && !M.isEndless(today) && M.isEndless(-1), 'a calendar day is never endless');

  const a = M.fxCustom(D, 'CHI_1996'), b = M.fxCustom(D, 'CHI_1996');
  ok(a && a.day === b.day && a.day < 0 && a.custom, `a picked team has one number, below zero (${a && a.day})`);
  ok(M.fxCustom(D, 'CHI_1997').day !== a.day, 'and a different team has a different one');
  ok(M.fxCustom(D, 'NOPE_1990') === null, 'a team that does not exist is refused');
  ok(M.fxTeams(D).length > M.fxCandidates(D).length && M.fxTeams(D).includes('CHI_1996'),
    `pick-any offers every team with a five, champions too (${M.fxTeams(D).length} against ${M.fxCandidates(D).length})`);
  const st = M.fxSeasonCreate(D, a.day, a.ts);
  ok(st.ts === 'CHI_1996' && M.fxRosterAt(D, st, 0).length >= 5, 'a picked team plays the season off its own roster');
  const o1 = M.fxSeasonOddsStep(D, st, 0, 50), o2 = M.fxSeasonOddsStep(D, M.fxSeasonCreate(D, a.day, a.ts), 0, 50);
  ok(o1.titles === o2.titles && o1.wins === o2.wins, 'and two people who open the same link get the same odds');

  const pz = M.psCustom(g, 'jordami01', 'jamesle01');
  ok(pz && pz.day < 0 && pz.par === M.psBfs(g, 'jordami01')['jamesle01'] && pz.from === 'jordami01',
    `a made puzzle starts where it was told to, par the real shortest chain (par ${pz && pz.par})`);
  ok(M.psCustom(g, 'jordami01', 'jamesle01').day === pz.day, 'and has one number');
  ok(M.psCustomRefusal(g, 'jordami01', 'jordami01') && M.psCustom(g, 'jordami01', 'jordami01') === null, 'the same man twice is refused');
  ok(M.psCustomRefusal(g, 'jordami01', 'nobody00') && M.psCustom(g, 'nobody00', 'jordami01') === null, 'and so is a man who is not there');
  let far = null;
  const dist = M.psBfs(g, 'jordami01');
  for (const id of Object.keys(g.nameOf)) if (dist[id] == null || dist[id] > M.PS.CLOCK) { far = id; break; }
  ok(far === null || M.psCustom(g, 'jordami01', far) === null, 'and a pair the shot clock cannot join');
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
  const checkouts = [];
  let boardRows = [];   // what the stand-in answers a board read with
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
        if (/order=score\.desc/.test(q) && /mode=eq\.fix/.test(q)) {
          return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(boardRows) });
        }
        const n = /score=gt/.test(q) ? 2 : /fix_in=/.test(q) ? 5 : 41;
        return route.fulfill({ status: 200, contentType: 'application/json',
          headers: { 'content-range': '0-0/' + n, 'access-control-expose-headers': 'content-range' },
          body: '[]' });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }
    if (u.hostname !== 'local.test') { escaped.push(u.hostname); return route.abort(); }
    /* STRIPE IS LIVE AND HAS NO TEST MODE, so the checkout is answered here and
       never let out: a url in the answer would navigate to a real payment page. */
    if (u.pathname.startsWith('/api/')) {
      checkouts.push({ path: u.pathname, auth: route.request().headers().authorization || '',
        body: JSON.parse(route.request().postData() || '{}') });
      return route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"stripe_not_configured"}' });
    }
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

  /* YOUR LINEUP, set by hand. Drag a bench man's spot onto a starter's and he
     starts there; tap two spots and they swap; the coach's five puts it back.
     All by the real pointer, because the handle is the claim. */
  const order = () => page.$$eval('#s-fix .fx-five .fx-man.dr', (b) => b.map((x) => ({
    k: x.getAttribute('data-k'), bn: x.classList.contains('bn') })));
  const lu = () => page.evaluate(() => (JSON.parse(localStorage.getItem('rtf.fix.run.v2')) || {}).lineups || null);
  async function dragTo(fromKey, toKey) {
    const a = await page.$(`#s-fix .fx-man.dr[data-k="${fromKey}"] .fs`), b = await page.$(`#s-fix .fx-man.dr[data-k="${toKey}"]`);
    /* Both ends on the screen: the one the drag lands on at the top. */
    await page.evaluate((k) => {
      const el = document.querySelector('#s-fix .fx-man.dr[data-k="' + k + '"]');
      window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 90);
    }, toKey);
    const ra = await a.boundingBox();
    await page.mouse.move(ra.x + ra.width / 2, ra.y + ra.height / 2);
    await page.mouse.down();
    await page.mouse.move(ra.x + ra.width / 2, ra.y + ra.height / 2 + 12, { steps: 3 });
    const rb = await b.boundingBox();
    await page.mouse.move(rb.x + rb.width / 2, rb.y + rb.height / 2, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(150);
  }
  const o0 = await order();
  const starters0 = o0.filter((x) => !x.bn), bench0 = o0.filter((x) => x.bn);
  ok(starters0.length === 5 && bench0.length > 0, `five starters and a bench, each with a handle (${starters0.length}, ${bench0.length})`);
  const oddsBefore = await page.textContent('.fx-now-o b');
  await dragTo(bench0[0].k, starters0[0].k);
  const o1 = await order();
  ok(o1[0].k === bench0[0].k && !o1.some((x) => x.bn && x.k === bench0[0].k) && o1.some((x) => x.bn && x.k === starters0[0].k),
    'dragging a bench man onto a starter starts him in that spot and sits the starter');
  const l1 = await lu();
  ok(!!l1 && Array.isArray(l1['1']) && l1['1'][0] === bench0[0].k, 'and the lineup is kept with the season, for this window');
  ok(await page.$('#fx-coach') !== null, 'a changed five offers the coach\'s five back');
  console.log(`  title odds ${oddsBefore.trim()} with the coach's five, ${(await page.textContent('.fx-now-o b')).trim()} with the bench man`);
  ok(!(await page.$('#s-fix .fx-man.out')), 'moving a man never puts him on the block');
  const s1 = (await order()).filter((x) => !x.bn);
  await page.click(`#s-fix .fx-man.dr[data-k="${s1[1].k}"] .fs`);
  ok(await page.$(`#s-fix .fx-man.pick[data-k="${s1[1].k}"]`) !== null, 'a tap on a spot picks that man');
  await page.click(`#s-fix .fx-man.dr[data-k="${s1[2].k}"] .fs`);
  const s2 = (await order()).filter((x) => !x.bn);
  ok(s2[1].k === s1[2].k && s2[2].k === s1[1].k, 'and a tap on another spot swaps the two');
  if (await page.$('#fx-coach')) await page.click('#fx-coach');
  await page.waitForTimeout(100);
  ok((await order()).filter((x) => !x.bn).map((x) => x.k).join() === starters0.map((x) => x.k).join() && !(await lu()),
    'the coach\'s five puts it all back, and clears the lineup');
  await dragTo(bench0[0].k, starters0[4].k);
  ok(((await lu()) || {})['1'] && (await lu())['1'][4] === bench0[0].k, 'and a lineup set again is kept for the rest of the season');
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
  ok(!!saved && saved.lineups && saved.lineups['1'] && saved.lineups['1'][4] === bench0[0].k, 'with the lineup that played it');
  const resFive = await page.$$eval('#s-fix .fx-five .fx-man:not(.bn)', (b) => b.map((x) => x.getAttribute('data-k')));
  ok(resFive[4] === bench0[0].k, 'and the result draws the five you set, not the coach\'s');
  ok(await page.evaluate(() => localStorage.getItem('rtf.fix.run.v2')) === null, 'and the season in progress is cleared');
  const sub = posts.find((p) => p.fn === 'rtf_submit_fix_season');
  ok(!!sub && sub.body.p_day === fx.day && sub.body.p_trades.length === 1 && sub.body.p_trades[0].picks[0] === fx.pick
    && saved.trades[0].ins.indexOf(sub.body.p_headline) >= 0, 'and filed as a season: the trades, their picks, the headline');
  ok(sub && Math.abs(sub.body.p_odds - saved.odds) < 1e-4, 'with the odds the screen shows');
  ok(!posts.some((p) => p.fn === 'rtf_submit_fix' || p.fn === 'rtf_submit_trade'), 'and never through an older submit');
  const place = await page.textContent('#fx-place');
  ok(/3rd of 41 today/.test(place), `the place comes off the board ("${place.trim()}")`);
  ok(/4 others traded for/.test(place), 'and so does how many traded for the same man');

  /* THE BOARD ROW OPENS INTO THE SEASON IT WAS: the final roster rebuilt from
     the club and the trades, and the numbers the row does not have room for. */
  boardRows = [{ id: 501, created_at: '2026-09-27T12:00:00Z', display_name: 'Tester', mode: 'fix', day: fx.day, score: 31,
    fix_ts: fx.ts, fix_odds: 0.312, fix_base: 0.114, replay_wins: 61, replay_title: true, fix_trades: saved.trades }];
  await page.click('#fx-board');
  await page.waitForSelector('#mb-rows button.mb-row[data-id="501"]');
  ok(await page.$('#mb-rows .mb-more') === null, 'a board row starts shut');
  await page.click('#mb-rows button.mb-row[data-id="501"]');
  await page.waitForSelector('#mb-rows .mb-more');
  const more = await page.evaluate(() => {
    const m = document.querySelector('#mb-rows .mb-more');
    return { text: m.textContent, men: m.querySelectorAll('.mb-man').length, newMen: m.querySelectorAll('.mb-man em').length };
  });
  const finalRows = await page.evaluate((t) => window.RTF_MODES.fxRosterAt(window.RTF_PAGE.data, { ts: t.ts, trades: t.trades }, 3).length,
    { ts: fx.ts, trades: saved.trades });
  ok(more.men === finalRows, `it opens on the final roster, every man (${more.men} of ${finalRows})`);
  ok(more.newMen === saved.trades[0].ins.length, `with the men who came in marked (${more.newMen})`);
  ok(/31\.2%/.test(more.text) && /11\.4%/.test(more.text) && /61-21/.test(more.text), 'and the odds, the odds as built and the replay');
  ok(/Preseason/.test(more.text), 'and each trade, by the window it was made in');
  await page.click('#mb-rows button.mb-row[data-id="501"]');
  ok(await page.$('#mb-rows .mb-more') === null, 'a second press shuts it');
  await page.click('#mb-x');
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

  /* ENDLESS AND PICKED PUZZLES. None of this may touch today: not the day's
     saved result, not the board, not the days-played count. */
  await page.evaluate(() => window.RTF_PAGE.goHome());
  const doors = await page.evaluate(() => ['td-efx', 'td-eps', 'td-pfx', 'td-pps'].map((id) => !!document.getElementById(id)));
  ok(doors.every(Boolean), 'the front page offers endless and build for both dailies');
  /* PRO. A guest owns nothing, so every door wears the lock and opens the
     offer rather than doing nothing, and the finished daily's door does too. */
  const lockedHome = await page.evaluate(() => ({
    lk: document.querySelectorAll('.td-end button.lk').length, go: !!document.getElementById('td-pro'),
    rows: [...document.querySelectorAll('.td-end')].map((e) => Math.round(e.getBoundingClientRect().height)) }));
  ok(lockedHome.lk === 4 && lockedHome.go, `without Pro all four doors are locked and Go Pro is offered (${JSON.stringify(lockedHome)})`);
  ok(lockedHome.rows.every((h) => h < 44), `and each row of doors holds one line (${lockedHome.rows})`);
  await page.click('#td-efx');
  const sheet1 = await page.evaluate(() => { const s = document.getElementById('pro-sheet');
    return { open: !!s && !s.hidden, text: s ? s.textContent : '', screen: document.querySelector('.screen.active').id }; });
  ok(sheet1.open && /Run The Floor Pro/.test(sheet1.text) && /Sign in to get Pro/.test(sheet1.text), 'a locked door opens the offer, and a guest is asked to sign in');
  ok(sheet1.screen === 's-home', `and nothing behind it opens (${sheet1.screen})`);
  ok(/\$9\.99/.test(sheet1.text) && /stay free|dailies are free/i.test(sheet1.text), 'the offer names the price and says the dailies stay free');
  await page.click('#pro-sheet [data-pro-x]');
  await page.click('#mc-fix');
  await page.waitForSelector('#fx-endless');
  ok(/Pro/.test(await page.textContent('#fx-endless')), "the finished daily's endless door wears the Pro tag");
  await page.click('#fx-endless');
  ok(await page.evaluate(() => !document.getElementById('pro-sheet').hidden), 'and opens the offer too');
  await page.click('#pro-sheet [data-pro-x]');
  /* A SIGNED IN BUYER, stood in: the press posts the floor-pro bundle with the
     session token to the one checkout, and a refusal is said in words. */
  await page.evaluate(() => {
    window.__realAuth = window.RTF_PAGE.auth;
    const fake = { state: () => ({ signedIn: true, email: 'buyer@example.com' }), token: () => 'tok-123',
      premiumProducts: () => Promise.resolve(window.__owns || []) };
    window.RTF_PAGE.auth = () => fake;
    window.RTF_PAGE.goHome();
  });
  await page.click('#td-pro');
  await page.click('#pro-buy');
  await page.waitForSelector('#pro-err:not([hidden])');
  const co = checkouts[checkouts.length - 1];
  ok(co && co.path === '/api/stripe/checkout-bundle' && co.body.bundle === 'floor-pro' && co.body.return_path === '/hoops/',
    `Get Pro posts the floor-pro bundle to the one checkout (${co && co.body.bundle})`);
  ok(co && co.auth === 'Bearer tok-123', 'with the session token, never a user id in the body');
  ok(/not on sale yet/.test(await page.textContent('#pro-err')), 'and a checkout that is not configured says so');
  await page.click('#pro-sheet [data-pro-x]');
  /* OWNING IT: the account read says rtf_premium and every door opens. */
  await page.evaluate(() => { window.__owns = ['rtf_premium']; return window.RTF_MODES_UI._proRefresh(); });
  const openHome = await page.evaluate(() => ({ lk: document.querySelectorAll('.td-end button.lk').length, go: !!document.getElementById('td-pro') }));
  ok(openHome.lk === 0 && !openHome.go, 'once the account owns rtf_premium, the locks and the offer are gone');
  /* Everything after this walks through the doors, so a door that stayed shut
     would surface as a thirty second timeout naming a selector. Say what is
     wrong instead, and stop. */
  if (openHome.lk !== 0) {
    console.log(`\n${passed} passed, ${failures.length} FAILED`);
    failures.forEach((f) => console.log('  FAIL: ' + f));
    console.log('  (stopped: owning rtf_premium did not open the doors, so the endless walk cannot run)');
    await browser.close();
    process.exit(1);
  }
  await page.evaluate(() => { window.__owns = ['ps_premium', 'cfb_premium']; return window.RTF_MODES_UI._proRefresh(); });
  ok(await page.evaluate(() => document.querySelectorAll('.td-end button.lk').length) === 4, 'another game\'s Pro does not open this one');
  await page.evaluate(() => { window.__owns = ['rtf_premium']; return window.RTF_MODES_UI._proRefresh(); });
  await page.evaluate(() => { window.RTF_PAGE.auth = window.__realAuth; window.RTF_PAGE.goHome(); });
  const before5 = await page.evaluate(([d, pd]) => ({
    fx: localStorage.getItem('rtf.fix.v1'), ps: localStorage.getItem('rtf.passes.v1'),
    days: (JSON.parse(localStorage.getItem('runthefloor_career_v1') || '{}').feats || {})['fx.days'] || 0,
  }), [fx.day, chain.day]);
  posts.length = 0;
  await page.click('#td-efx');
  await page.waitForSelector('#fx-pat');
  ok(/Endless/.test(await page.textContent('#s-fix .cq-rung')), 'endless Fix History says so');
  for (let i = 0; i < 4; i++) {
    if (i) { await page.click('#fx-on'); await page.waitForSelector('#fx-pat'); }
    await page.click('#fx-pat');
    await page.waitForSelector('#fx-on');
  }
  await page.click('#fx-on');
  await page.waitForSelector('#fx-next', { timeout: 30000 });
  await page.waitForTimeout(300);
  const after5 = await page.evaluate(() => ({
    fx: localStorage.getItem('rtf.fix.v1'), ps: localStorage.getItem('rtf.passes.v1'),
    days: (JSON.parse(localStorage.getItem('runthefloor_career_v1') || '{}').feats || {})['fx.days'] || 0,
    end: JSON.parse(localStorage.getItem('rtf.fix.endless.v1')),
  }));
  ok(after5.fx === before5.fx, "an endless season leaves today's result exactly as it was");
  ok(after5.end && after5.end.result && after5.end.result.day < 0 && after5.end.run === null, 'and keeps its own result under its own key');
  ok(!posts.some((p) => /^rtf_submit_/.test(p.fn)), 'and files nothing to the board');
  ok(after5.days === before5.days, `and does not count as a day played (${before5.days} then ${after5.days})`);
  ok(await page.$('#fx-board') === null, 'no leaderboard button on an endless result');
  await page.click('#fx-next');
  await page.waitForSelector('#fx-pat');
  const next = await page.evaluate(() => JSON.parse(localStorage.getItem('rtf.fix.endless.v1')));
  ok(next.day !== after5.end.result.day && next.result === null, 'Next team deals a fresh one');

  // Endless Six Passes, solved along a real shortest chain.
  await page.evaluate(() => window.RTF_PAGE.goHome());
  await page.click('#td-eps');
  await page.waitForSelector('#ps-q');
  ok(/Endless/.test(await page.textContent('#s-pass .cq-rung')), 'endless Six Passes says so');
  const ech = await page.evaluate(() => {
    const M = window.RTF_MODES, g = M.psGraph(window.RTF_PAGE.data), s = JSON.parse(localStorage.getItem('rtf.passes.endless.v1'));
    const path = M.psPath(g, s.pz.from, s.pz.to);
    return { path, names: path.map((i) => g.nameOf[i]), par: s.pz.par };
  });
  for (let i = 1; i < ech.path.length; i++) {
    await page.fill('#ps-q', ech.names[i].split(' ').pop());
    await page.click(`.ps-mate[data-id="${ech.path[i]}"]`);
    await page.waitForTimeout(50);
  }
  const eps = await page.evaluate(() => ({ s: JSON.parse(localStorage.getItem('rtf.passes.endless.v1')), day: localStorage.getItem('rtf.passes.v1') }));
  ok(eps.s.st && eps.s.st.solved && eps.s.played === 1, 'an endless chain solves and counts once');
  ok(eps.day === before5.ps, "and today's Six Passes is untouched");
  ok(!posts.some((p) => /^rtf_submit_/.test(p.fn)), 'and nothing reaches the board');
  ok(await page.$('#ps-next') !== null && await page.$('#ps-board') === null, 'Next puzzle, and no leaderboard');

  // Build: any two players, through the search a player uses, sent as a link.
  await page.evaluate(() => { window.RTF_PAGE.goHome(); window.RTF_PAGE.shareText = (t) => { window.__shared = t; }; });
  await page.click('#td-pps');
  await page.waitForSelector('#ps-qa');
  await page.fill('#ps-qa', 'Michael Jordan');
  await page.click('.ps-mate[data-id="jordami01"]');
  await page.waitForSelector('#ps-qb');
  await page.fill('#ps-qb', 'LeBron');
  await page.click('.ps-mate[data-id="jamesle01"]');
  await page.waitForSelector('#ps-pgo');
  await page.click('#ps-psend');
  const sent = await page.evaluate(() => window.__shared || '');
  ok(/#pass=jordami01\.jamesle01$/.test(sent.trim()), `Send it to a friend carries the two players in the link ("${sent.trim().split('\n').pop()}")`);
  ok(!/runthe\.gg/.test(sent), 'and the link is built off the page the sender is on');

  // Build: any team, through the two selects.
  await page.evaluate(() => window.RTF_PAGE.goHome());
  await page.click('#td-pfx');
  await page.waitForSelector('#fx-pclub');
  await page.selectOption('#fx-pclub', 'CHI');
  await page.waitForSelector('#fx-pyr');
  await page.selectOption('#fx-pyr', 'CHI_1996');
  await page.waitForSelector('#fx-pgo');
  ok(/They won it/.test(await page.textContent('#s-fix .fx-note')), 'a champion is called one');
  await page.click('#fx-pgo');
  await page.waitForSelector('#fx-pat');
  ok(/Picked team/.test(await page.textContent('#s-fix .cq-rung')) && /1996/.test(await page.textContent('#s-fix .fx-yr')),
    'Rebuild them opens the four windows on the 1996 Bulls');

  /* A FRIEND'S LINK, opened on a fresh page with nothing stored: it plays,
     free, and the hash is cleared so a reload goes to the front page. */
  const friend = await ctx.newPage();
  friend.on('pageerror', (e) => boom.push(String(e).slice(0, 200)));
  await friend.route('**/*', serve);
  await friend.goto('http://local.test/hoops/#pass=jordami01.jamesle01', { waitUntil: 'domcontentloaded' });
  await friend.waitForSelector('#s-pass #ps-q', { timeout: 60000 });
  const fr = await friend.evaluate(() => ({ rung: document.querySelector('#s-pass .cq-rung').textContent, hash: location.hash,
    s: JSON.parse(localStorage.getItem('rtf.passes.endless.v1')) }));
  ok(/Custom/.test(fr.rung) && fr.s.pz.from === 'jordami01' && fr.s.pz.to === 'jamesle01', `a friend's link opens the made puzzle ("${fr.rung}")`);
  ok(fr.hash === '', 'and the hash is cleared once it has been read');
  await friend.goto('http://local.test/hoops/#fix=CHI_1996', { waitUntil: 'domcontentloaded' });
  await friend.waitForSelector('#s-fix #fx-pat', { timeout: 60000 });
  ok(/Picked team/.test(await friend.textContent('#s-fix .cq-rung')), 'and a team link opens the picked team');
  /* BACK FROM STRIPE: the thanks sheet, and the flag off the url. */
  await friend.goto('http://local.test/hoops/?checkout=success', { waitUntil: 'domcontentloaded' });
  await friend.waitForSelector('#pro-sheet:not([hidden])', { timeout: 60000 });
  const back5 = await friend.evaluate(() => ({ t: document.getElementById('pro-sheet').textContent, q: location.search }));
  ok(/Thanks for buying Pro/.test(back5.t) && back5.q === '', `coming back from checkout says thanks and clears the flag ("${back5.q}")`);
  await friend.close();
  ok(!checkouts.some((c) => !/^\/api\/stripe\//.test(c.path)), 'nothing but the stood in checkout was asked');

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
