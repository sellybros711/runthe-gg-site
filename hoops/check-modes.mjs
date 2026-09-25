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

// ── 4. Fix History ──────────────────────────────────────────────────────────
section('4. Fix History: one team a day, a real trade market, one score everywhere');
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


  /* THE TRADE FINDER. Every property is asked of the real market for real
     blocks, because every way the finder goes wrong is an offer list that
     renders: one from the wrong season, one that breaks the salary rule, one
     that leaves nobody at center. */
  const ros = M.fxRoster(D, f.ts), season = Number(f.ts.slice(-4));
  const starterKeys = new Set(f.five.map((p) => E.pkey(p)));
  const bench = ros.filter((p) => !starterKeys.has(E.pkey(p)));
  ok(bench.length >= 3, `${f.ts} has a bench to trade from (${bench.length})`);
  ok(JSON.stringify(M.fiveOf(ros).map(E.pkey)) === JSON.stringify(f.five.map(E.pkey)),
    'the five a roster starts is the daily five, so a trade is judged by the rule that built it');
  const blocks = [[E.pkey(f.five[0])], [E.pkey(bench[bench.length - 1])], [E.pkey(f.five[1]), E.pkey(bench[0])]];
  const mineIds = new Set(ros.map((p) => p.i));
  blocks.forEach((blk) => {
    const offers = M.fxOffers(D, f.ts, blk);
    const label = blk.map((k) => D.allPlayers[k].n).join(' + ');
    ok(offers.length > 0, `${label}: the league makes offers (${offers.length})`);
    const outSal = blk.reduce((s, k) => s + D.allPlayers[k].p, 0);
    let bad = 0;
    offers.forEach((o) => {
      const ins = o.ins.map((k) => D.allPlayers[k]);
      const inSal = ins.reduce((s, p) => s + p.p, 0);
      if (M.fxTradeRefusal(D, f.ts, blk, o.with, o.ins) !== null) bad++;
      else if (Number(o.with.slice(-4)) !== season || o.with === f.ts) bad++;
      else if (ins.some((p) => p.s !== season || E.teamSeasonId(p.t, p.s) !== o.with || mineIds.has(p.i))) bad++;
      else if (inSal > outSal * 1.25 + 0.1 + 1e-9 || outSal > inSal * 1.25 + 0.1 + 1e-9) bad++;
      else if (!M.fxFiveAfter(D, f.ts, blk, o.ins)) bad++;
    });
    ok(bad === 0, `${label}: every offer is the same season, salary matched and leaves a five (${bad} not)`);
  });
  /* EVERY OFFER HAS A LINEUP, on many days rather than one. The first cut
     picked the coach's five from the top nine only, and trading the one guard
     in that nine for a big left a legal offer with no five: the page hung on
     "Replaying history" for ever. Found by the browser walk on day 8, where
     the day 11 fixture above had never met it. */
  {
    let offers = 0, noFive = 0;
    for (let d = 1; d <= 12; d++) {
      const g = M.fxDaily(D, d);
      [...g.five].sort((x, y) => y.p - x.p).slice(0, 2).forEach((star) => {
        M.fxOffers(D, g.ts, [E.pkey(star)]).forEach((o) => {
          offers++;
          if (!M.fxFiveAfter(D, g.ts, [E.pkey(star)], o.ins)) noFive++;
        });
      });
    }
    ok(noFive === 0, `every offer for a star over twelve days leaves a lineup (${noFive} of ${offers} do not)`);
  }
  /* THE FINDER IS THE WHOLE MARKET, not a sample of it: every one or two men
     on every club that season who pass the refusal are on the list. */
  {
    const blk = blocks[0], want = new Set();
    D.teamSeasons.filter((t) => t.season === season && t.team_season_id !== f.ts).forEach((t) => {
      const rows = M.fxRoster(D, t.team_season_id);
      rows.forEach((a, i) => {
        [[a]].concat(rows.slice(i + 1).map((b) => [a, b])).forEach((pk) => {
          const ks = pk.map(E.pkey);
          if (M.fxTradeRefusal(D, f.ts, blk, t.team_season_id, ks) === null) want.add(t.team_season_id + '|' + ks.join(','));
        });
      });
    });
    const got = new Set(M.fxOffers(D, f.ts, blk).map((o) => o.with + '|' + o.ins.join(',')));
    ok(want.size === got.size && [...want].every((k) => got.has(k)),
      `the finder lists every legal deal and nothing else (${got.size} of ${want.size})`);
  }
  /* canCover is a bipartite match; fiveOf is a brute force over the same rule.
     They must agree on every roster, or an offer the finder shows could leave
     a team the coach cannot start. */
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
  const other = D.teamSeasons.find((t) => t.season === season - 1 && t.team_season_id !== f.ts);
  const oldMan = M.fxRoster(D, other.team_season_id)[0];
  ok(/same season/.test(M.fxTradeRefusal(D, f.ts, blocks[0], other.team_season_id, [E.pkey(oldMan)]) || ''),
    'a partner from another season is refused');
  const peer = D.teamSeasons.find((t) => t.season === season && t.team_season_id !== f.ts).team_season_id;
  const cheapest = M.fxRoster(D, peer).slice(-1)[0];
  ok(/salaries/.test(M.fxTradeRefusal(D, f.ts, blocks[0], peer, [E.pkey(cheapest)]) || ''),
    'a star for the cheapest man in the league is refused on salary');
  ok(/two players/.test(M.fxTradeRefusal(D, f.ts, ros.slice(0, 3).map(E.pkey), peer, [E.pkey(cheapest)]) || ''),
    'three out is refused');
  // A trade that leaves nobody at a position, found rather than assumed.
  let hole = null;
  for (let d = 1; d <= 60 && !hole; d++) {
    const g = M.fxDaily(D, d), r = M.fxRoster(D, g.ts);
    const cs = r.filter((p) => E.canFillSlot(p, 'C'));
    if (cs.length > 2 || !cs.length) continue;
    const blk = cs.map(E.pkey), sal = cs.reduce((s, p) => s + p.p, 0);
    const pr = D.teamSeasons.find((t) => t.season === g.five[0].s && t.team_season_id !== g.ts
      && M.fxRoster(D, t.team_season_id).some((p) => !E.canFillSlot(p, 'C') && Math.abs(p.p - sal) < sal * 0.2));
    if (!pr) continue;
    const guard = M.fxRoster(D, pr.team_season_id).find((p) => !E.canFillSlot(p, 'C') && Math.abs(p.p - sal) < sal * 0.2);
    hole = { ts: g.ts, blk, pr: pr.team_season_id, ins: [E.pkey(guard)] };
  }
  ok(!!hole, 'a team whose centers can all be traded away exists to test with');
  if (hole) {
    ok(/nobody to play/.test(M.fxTradeRefusal(D, hole.ts, hole.blk, hole.pr, hole.ins) || ''),
      `trading away every center for a man who cannot play it is refused (${hole.ts})`);
    ok(!M.fxOffers(D, hole.ts, hole.blk).some((o) => o.with === hole.pr && o.ins.join() === hole.ins.join()),
      'and the finder never offers it');
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

  // Fix History, end to end: a starter on the block, the market, a deal.
  await page.click('#mc-fix');
  await page.waitForSelector('.fx-man[data-k]');
  const fx = await page.evaluate(() => {
    const M = window.RTF_MODES, D = window.RTF_PAGE.data, E = window.RTF_ENGINE;
    const d = window.RTF_PAGE.dayNumberOf(window.RTF_PAGE.easternISO());
    const f = M.fxDaily(D, d);
    const ros = M.fxRoster(D, f.ts), fiveK = new Set(f.five.map(E.pkey));
    return { day: d, ts: f.ts, star: E.pkey(f.five[1]), benchN: ros.filter((p) => !fiveK.has(E.pkey(p))).length,
      offers: M.fxOffers(D, f.ts, [E.pkey(f.five[1])]).length };
  });
  const rows = await page.$$eval('.fx-man[data-k]', (b) => b.length);
  ok(rows === 5 + fx.benchN, `the whole roster is on the screen, bench too (${rows} of ${5 + fx.benchN})`);
  ok(await page.$('#fx-find') === null, 'with an empty block there is nothing to find');
  await page.click(`.fx-man[data-k="${fx.star}"]`);
  const find = await page.textContent('#fx-find');
  ok(find.includes(String(fx.offers)), `the dock counts the market ("${find.trim()}" for ${fx.offers})`);
  await page.click('#fx-find');
  await page.waitForSelector('.fx-offer');
  const shown = await page.$$eval('.fx-offer', (b) => b.length);
  ok(shown === Math.min(25, fx.offers), `the market shows its first page (${shown})`);
  const wsOnMarket = await page.$$eval('.fx-offer', (b) => b.some((x) => /\bWS\b/.test(x.textContent)));
  ok(!wsOnMarket, 'no win shares on an offer: that is the answer');
  await page.click('.fx-chip[data-p="C"]');
  await page.waitForSelector('.fx-offer, .fx-hint');
  const allC = await page.evaluate(() => {
    const D = window.RTF_PAGE.data, E = window.RTF_ENGINE;
    return [...document.querySelectorAll('.fx-offer')].every((b) => b.getAttribute('data-i').split('|').slice(1).join('|')
      .split(',').some((k) => E.canFillSlot(D.allPlayers[k], 'C')));
  });
  ok(allC, 'the C filter keeps only offers carrying a man who can play center');
  const pick = await page.getAttribute('.fx-offer', 'data-i');
  await page.click('.fx-offer');
  await page.click('#fx-yes');
  await page.waitForSelector('#fx-share', { timeout: 30000 });
  await page.waitForTimeout(300);
  const saved = await page.evaluate((d) => JSON.parse(localStorage.getItem('rtf.fix.v1')).days[d], fx.day);
  const pickWith = pick.split('|')[0];
  ok(!!saved && saved.with === pickWith && saved.outs.join() === fx.star, 'the trade is kept for the day');
  const sub = posts.find((p) => p.fn === 'rtf_submit_trade');
  ok(!!sub && sub.body.p_with === pickWith && sub.body.p_outs.join() === fx.star && sub.body.p_day === fx.day,
    'and filed with the board as a trade: the partner, both sides and the day');
  ok(sub && sub.body.p_ins.join() === saved.ins.join() && Math.abs(sub.body.p_odds - saved.odds) < 1e-4,
    'with the odds the screen shows');
  ok(!posts.some((p) => p.fn === 'rtf_submit_fix'), 'and never through the one-for-one submit');
  const place = await page.textContent('#fx-place');
  ok(/3rd of 41 today/.test(place), `the place comes off the board ("${place.trim()}")`);
  ok(/4 others traded for/.test(place), 'and so does how many traded for the same man');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#b-today:not([disabled])', { timeout: 60000 });
  await page.click('#mc-fix');
  ok(await page.$('#fx-share') !== null && await page.$('.fx-man:not([disabled])') === null,
    'a reload lands on the result: one trade a day');
  const dock = await page.evaluate(() => { window.RTF_PAGE.goHome(); return document.querySelector('#dock').textContent.trim(); });
  ok(/Six Passes/.test(dock), `with Fix done, the dock moves on to Six Passes ("${dock}")`);

  /* A RESULT SAVED BY THE FIRST VERSION is one man for one man, and somebody
     who played it this morning comes back to it after the page changes. */
  const legacy = await page.evaluate((d) => {
    const M = window.RTF_MODES, D = window.RTF_PAGE.data, E = window.RTF_ENGINE;
    const f = M.fxDaily(D, d);
    const inn = D.players.find((p) => p.t !== 'TOT' && p.p < f.five[4].p && E.canFillSlot(p, 'C') && p.s < 1990);
    const st = JSON.parse(localStorage.getItem('rtf.fix.v1'));
    st.days[d] = { day: d, ts: f.ts, slot: 4, out: E.pkey(f.five[4]), inKey: E.pkey(inn), odds: 0.2, base: 0.1,
      avgWins: 50, replay: { w: 50, l: 32, title: false, story: 'Lost in the Second Round, 2-4.' }, at: 1 };
    localStorage.setItem('rtf.fix.v1', JSON.stringify(st));
    return { name: inn.n };
  }, fx.day);
  posts.length = 0;
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#b-today:not([disabled])', { timeout: 60000 });
  await page.click('#mc-fix');
  await page.waitForSelector('#fx-share');
  const lt = await page.textContent('#s-fix');
  ok(lt.includes(legacy.name), `a first-version result still draws its man (${legacy.name})`);
  await page.waitForTimeout(300);
  ok(posts.some((p) => p.fn === 'rtf_submit_fix') && !posts.some((p) => p.fn === 'rtf_submit_trade'),
    'and files through the submit it was made for');
  await page.evaluate(() => window.RTF_PAGE.goHome());

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
  const before = await page.textContent('#cq-wins');
  await page.click('#cq-go');
  const during = await page.textContent('#cq-wins');
  ok(during === before, `the win count does not move before the game is over (${before} then ${during})`);
  await page.waitForFunction(() => document.querySelector('.mx-stamp'), null, { timeout: 20000 });
  const st = await page.evaluate(() => window.RTF_MODES_UI._cq());
  ok(!!(st.pending || st.losses.length), 'the game is recorded on the run');

  // Play it out and check the end is filed once.
  for (let i = 0; i < 200; i++) {
    const s = await page.evaluate(() => { const c = window.RTF_MODES_UI._cq(); return { lost: !!c.lost, pending: !!c.pending }; });
    if (s.lost) break;
    if (await page.$('#cq-again')) { await page.click('#cq-again'); continue; }
    if (await page.$('#cq-keep')) { await page.click('#cq-keep'); continue; }
    if (await page.$('#cq-go')) { await page.click('#cq-go'); await page.waitForFunction(() => document.querySelector('.mx-stamp'), null, { timeout: 20000 }); continue; }
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
