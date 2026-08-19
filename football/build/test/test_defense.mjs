/* The defense draft: the pool, the arithmetic, and the mode played through a browser.
 *
 *   node football/build/test/test_defense.mjs                 (pool + engine only)
 *   (nohup node cfb/build/test/gzip_server.mjs &)
 *   BROWSER=1 node football/build/test/test_defense.mjs       (adds the played season)
 *
 * The claim this file defends is not "a defense mode exists". It is that the defense mode
 * is the SAME GAME from the other side, which is a much easier thing to get wrong, and
 * three ways in particular:
 *
 *   THE MONEY HAS TO MEAN THE SAME THING. The cap puzzle is the game. If a $30M defender
 *   buys more or less than a $30M receiver, the two modes are two different games sharing
 *   an interface and a player moving between them has to relearn what money is worth.
 *
 *   THE DRAFT HAS TO MATTER AS MUCH. On the rating alone it does not: IDP scoring is
 *   tackle-led, tackle counts barely separate starters, and drafted defenses land within
 *   9.5% of each other where offenses spread over 22.5%. What closes that gap is
 *   defenseStructure reading WHAT KIND of defense a roster is. Break the schemes and
 *   nothing throws and nothing renders wrong; every season just quietly plays the same.
 *   Two assertions below draw that distinction on purpose, one on the rating alone and
 *   one on the rating times structure, so a regression says which half broke.
 *
 *   THE SEASON HAS TO BE AS WINNABLE. Same reason, other direction.
 *
 * The browser half is opt-in because it needs a server and takes a minute, and because the
 * first two halves are what catch a silent balance regression.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const ROOT = path.resolve(new URL('../../..', import.meta.url).pathname);
const E = require(`${ROOT}/football/engine.js`);
const HOST = process.env.HOST || 'http://localhost:8081';

let bad = 0;
const ok = (n, p, x) => { if (!p) bad++;
  console.log((p ? '  ok   ' : ' FAIL  ') + n + (x !== undefined ? '   ' + JSON.stringify(x).slice(0, 160) : '')); };

const rd = (f) => JSON.parse(fs.readFileSync(`${ROOT}/football/data/${f}`, 'utf8'));
const D = rd('defender_seasons.json');
const O = rd('player_seasons.json');
const TS = rd('team_seasons.json');
const LC = rd('league_context.json');
const CAL = rd('display_calibration.json');
/* The pool ships idp_ppg_*; the engine samples ppr_ppg_* because it is the same arithmetic
   on a different rating. The page normalises the same way on load. */
for (const p of D) { p.ppr_ppg_mean = p.idp_ppg_mean; p.ppr_ppg_sd = p.idp_ppg_sd; }

console.log('=== the pool ===');
{
  const slots = new Set(D.map((p) => p.position));
  ok('three slots, and only three', slots.size === 3 && ['DL', 'LB', 'DB'].every((s) => slots.has(s)),
    [...slots]);
  /* A wheel can stop on any team-season, and five of the six spots are position-locked, so
     a team-season that cannot fill one is a board the player cannot draft from. */
  const bySeason = new Map();
  for (const p of D) {
    if (!p.team_season_id) continue;
    if (!bySeason.has(p.team_season_id)) bySeason.set(p.team_season_id, new Set());
    bySeason.get(p.team_season_id).add(p.position);
  }
  const holes = [...bySeason.entries()].filter(([, s]) => s.size < 3).map(([k]) => k);
  ok('every team-season can fill every slot', holes.length === 0,
    { teamSeasons: bySeason.size, holes: holes.slice(0, 5) });

  /* The era has to be the offense pool's era, or the two modes are drafting from different
     games and the wheel would offer years one of them cannot honour. */
  const dY = D.map((p) => p.season), oY = O.map((p) => p.season);
  ok('the same era as the offense pool',
    Math.min(...dY) === Math.min(...oY) && Math.max(...dY) === Math.max(...oY),
    { defense: [Math.min(...dY), Math.max(...dY)], offense: [Math.min(...oY), Math.max(...oY)] });

  /* THE MONEY MEANS THE SAME THING. Same floor, same ceiling, and a comparable share of
     each pool at the ceiling: if one side could buy a maximum-price man far more easily
     than the other, the cap would be a different puzzle in the two modes. */
  const price = (rows) => rows.map((p) => p.price_musd).sort((a, b) => a - b);
  const dp = price(D), op = price(O);
  ok('the same price floor and ceiling as offense',
    dp[0] === op[0] && dp.at(-1) === op.at(-1), { defense: [dp[0], dp.at(-1)], offense: [op[0], op.at(-1)] });
  const atMax = (a) => a.filter((v) => v >= a.at(-1) - 0.05).length / a.length;
  ok('a comparable share of each pool costs the maximum',
    Math.abs(atMax(dp) - atMax(op)) < 0.02,
    { defense: (100 * atMax(dp)).toFixed(2) + '%', offense: (100 * atMax(op)).toFixed(2) + '%' });

  /* Every card has to be readable as a fact about a real season. */
  const noLine = D.filter((p) => !p.stat_line);
  ok('every defender has a stat line', noLine.length === 0, { without: noLine.length });
  const watt = D.find((p) => p.name === 'J.J. Watt' && p.season === 2012);
  ok('the best defensive season in the pool costs the ceiling',
    !!watt && watt.price_musd === dp.at(-1),
    watt && { price: watt.price_musd, line: watt.stat_line, badges: watt.badges });
}

console.log('\n=== the arithmetic ===');
{
  /* THE WHOLE MODE IS CALIBRATED SO A DEFENSE HAS THE SAME WIN CHANCES AS A DRAFT, and the
     four knobs below are what buys that. Their job is measured, not guessed, against the
     offense season-win distribution (see the note on defenseOverall), so the numbers here
     are the settings, and the balance itself is the "both modes" section further down.

     Better defense, fewer points. One sign flip from being exactly backwards. */
  const worse = E.defenseSuppression(30), mid = E.defenseSuppression(40), better = E.defenseSuppression(53);
  ok('a better defense suppresses harder', worse > mid && mid > better,
    { at30: worse.toFixed(2), at40: mid.toFixed(2), at53: better.toFixed(2) });
  /* THE MEDIAN DRAFTED DEFENSE (raw ~34) LETS THE OTHER TEAM SCORE ABOUT LEAGUE AVERAGE, a
     touch over. It is NOT a shutdown unit: your own offense is deliberately below average
     (DEF_OFFENSE_SCALE), so a merely-average defense is a losing team, exactly as a
     merely-average offense is in the main mode. A median that suppressed hard would hand
     every typical roster a winning record and make the mode softer than the draft. */
  const med = E.defenseSuppression(34);
  ok('the median defense allows about league average, not less',
    med > 1.0 && med < 1.3, { suppression: med.toFixed(2), impliedAllowed: (21.5 * med).toFixed(0) });
  /* AN ELITE DEFENSE IS DOMINANT, which is what lets it win the low-scoring games a title
     run is made of. At the top of the drafted range it roughly halves the opponent's
     scoring, holding a ~22 point team near 11. */
  ok('an elite defense roughly halves the opponent',
    E.defenseSuppression(53) < 0.62, E.defenseSuppression(53).toFixed(2));
  /* THE FLOOR IS BAD, NOT HOPELESS. A pure power law explodes for a scrap-heap defense and
     sends it winless, which the offense floor never does. The cap is the ceiling on how far
     the opponent runs it up, and it is what lets the curve be steep enough to separate the
     good defenses without a zero at the bottom. */
  ok('the worst defense is capped, never worse than the cap',
    E.defenseSuppression(1) === E.CONSTANTS.DEF_SUPPRESS_MAX
    && E.CONSTANTS.DEF_SUPPRESS_MAX <= 1.6,
    { atFloor: E.defenseSuppression(1), cap: E.CONSTANTS.DEF_SUPPRESS_MAX });
  /* YOUR FREE OFFENSE IS MEDIOCRE ON PURPOSE. Without this the mode is a coin flip in the
     middle because a neutral defense plus a league-average offense is a .500 team. */
  ok('the undrafted offense is set below average',
    E.CONSTANTS.DEF_OFFENSE_SCALE > 0.6 && E.CONSTANTS.DEF_OFFENSE_SCALE < 0.95,
    E.CONSTANTS.DEF_OFFENSE_SCALE);
}

console.log('\n=== the schemes ===');
{
  const byTS = new Map();
  for (const r of D) { if (!r.team_season_id) continue;
    if (!byTS.has(r.team_season_id)) byTS.set(r.team_season_id, []);
    byTS.get(r.team_season_id).push(r); }
  const ks = [...byTS.keys()];
  let seed = 2024;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const ELIG = { DL: ['DL'], LB: ['LB'], DB: ['DB'], FLEX: ['DL', 'LB', 'DB'] };
  /* `rank` is the player's strategy. Drafting toward a scheme is the point of the feature,
     so the test drafts the way somebody chasing one would. */
  const draft = (rank) => {
    let spent = 0; const took = [];
    for (let i = 0; i < E.DEFENSE_SLOTS.length; i++) {
      const ts = ks[Math.floor(rnd() * ks.length)];
      const opts = (byTS.get(ts) || []).filter((p) => ELIG[E.DEFENSE_SLOTS[i]].includes(p.position));
      if (!opts.length) { i--; continue; }
      const budget = 140 - spent - 3 * (E.DEFENSE_SLOTS.length - 1 - i);
      const can = opts.filter((p) => p.price_musd <= budget);
      const from = (can.length ? can : opts.slice().sort((a, b) => a.price_musd - b.price_musd).slice(0, 1)).slice();
      from.sort((a, b) => rank(b) - rank(a));
      took.push(from[0]); spent += from[0].price_musd;
    }
    return took;
  };
  const survey = (rank, n) => {
    const hits = {}; let none = 0;
    for (let i = 0; i < n; i++) {
      const st = E.defenseStructure(draft(rank));
      if (st.scheme) hits[st.scheme] = (hits[st.scheme] || 0) + 1; else none++;
    }
    return { hits, none, n };
  };
  const N = Number(process.env.SCHEMES || 2500);
  const best = survey((p) => p.ppr_ppg_mean, N);

  /* A scheme nobody can reach is decoration; one that fires on nearly everything is not a
     decision. Both ends are asserted. */
  const share = (r, k) => (r.hits[k] || 0) / r.n;
  const top = Math.max(...Object.values(best.hits)) / best.n;
  ok('no single scheme swallows the mode', top < 0.35,
    { commonest: (100 * top).toFixed(1) + '%' });
  ok('and drafting well usually earns one', best.none / best.n < 0.10,
    { noScheme: (100 * best.none / best.n).toFixed(1) + '%' });

  /* THE SCHEMES ARE DRAFTABLE ON PURPOSE, which is the whole feature. Three strategies, and
     each has to produce the defense it is chasing. A scheme reachable only by luck is a
     lottery ticket rather than a decision. */
  const rushy = survey((p) => p.rush_ppg, N);
  const covery = survey((p) => p.cover_ppg, N);
  const tackly = survey((p) => p.tackle_ppg - 3 * p.rush_ppg, N);
  ok('chasing the pass rush builds a pass-rush defense',
    share(rushy, 'forty_six') + share(rushy, 'steel_curtain') + share(rushy, 'blitzburgh')
      + share(rushy, 'sack_exchange') > 0.60,
    { the46: (100 * share(rushy, 'forty_six')).toFixed(0) + '%',
      steel: (100 * share(rushy, 'steel_curtain')).toFixed(0) + '%',
      blitz: (100 * share(rushy, 'blitzburgh')).toFixed(0) + '%' });
  ok('chasing coverage builds a coverage defense',
    share(covery, 'no_fly_zone') + share(covery, 'legion_of_boom') > 0.60,
    { noFly: (100 * share(covery, 'no_fly_zone')).toFixed(0) + '%',
      boom: (100 * share(covery, 'legion_of_boom')).toFixed(0) + '%' });
  ok('and chasing tacklers builds the one that has no splash plays',
    share(tackly, 'bend_dont_break') > 0.20,
    { bend: (100 * share(tackly, 'bend_dont_break')).toFixed(0) + '%' });

  /* Every scheme has to be reachable by SOME strategy, or it is dead code with a name. */
  const all = {};
  for (const r of [best, rushy, covery, tackly]) {
    for (const k of Object.keys(r.hits)) all[k] = true;
  }
  const dead = Object.keys(E.DEFENSE_SCHEME_NAMES).filter((k) => !all[k]);
  ok('every scheme is reachable by some way of drafting', dead.length === 0,
    { unreachable: dead.map((k) => E.DEFENSE_SCHEME_NAMES[k]) });

  /* And each names itself, so the panel never has a key with no words behind it. */
  const missing = Object.keys(E.DEFENSE_SCHEME_NAMES)
    .filter((k) => !E.DEFENSE_SCHEME_NAMES[k] || !E.DEFENSE_SCHEME_TAGLINES[k]);
  ok('every scheme has a name and a tagline', missing.length === 0, { missing });
}

console.log('\n=== a season, both modes ===');
{
  const byTS = (rows) => { const m = new Map();
    for (const r of rows) { if (!r.team_season_id) continue;
      if (!m.has(r.team_season_id)) m.set(r.team_season_id, []); m.get(r.team_season_id).push(r); }
    return m; };
  const dTS = byTS(D), oTS = byTS(O);
  const teams = TS.filter((t) => t.pts_scored_mean && t.pts_allowed_mean);
  const avgAllowed = LC.league_avg_pts_allowed_by_season;
  let seed = 987654321;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const CAP = 140, FLOOR = 3;
  const draft = (slots, pool, elig) => {
    const ks = [...pool.keys()]; let spent = 0; const took = [];
    for (let i = 0; i < slots.length; i++) {
      const ts = ks[Math.floor(rnd() * ks.length)];
      const opts = (pool.get(ts) || []).filter((p) => elig[slots[i]].includes(p.position));
      if (!opts.length) { i--; continue; }
      const budget = CAP - spent - FLOOR * (slots.length - 1 - i);
      const can = opts.filter((p) => p.price_musd <= budget);
      const from = can.length ? can : opts.slice().sort((a, b) => a.price_musd - b.price_musd).slice(0, 1);
      from.sort((a, b) => b.ppr_ppg_mean - a.ppr_ppg_mean);
      took.push(from[0]); spent += from[0].price_musd;
    }
    return took;
  };
  const measure = (slots, pool, elig, defense, n) => {
    const wins = [], totals = [], allowed = [];
    for (let i = 0; i < n; i++) {
      const roster = draft(slots, pool, elig);
      /* Ranked by what the engine will actually use, rating TIMES structure, not by rating
         alone. Both modes apply a structure multiplier and in both of them it is part of
         how good the roster is, so ranking on the rating would be asking whether half the
         draft matters and reporting it as the whole. */
      const st = defense ? E.defenseStructure(roster) : E.rosterStructure(roster);
      totals.push(roster.reduce((t, p) => t + p.ppr_ppg_mean, 0) * st.multiplier);
      let w = 0;
      for (let g = 0; g < 17; g++) {
        const opp = teams[Math.floor(rnd() * teams.length)];
        const la = avgAllowed[opp.season] ?? 21.5;
        const r = defense
          ? E.resolveGameDefense(roster, 1, opp, la, rnd, E.CONSTANTS, 1)
          : E.resolveGame(roster, 1, opp, la, rnd, E.CONSTANTS, 1);
        if (r.won) w++;
        allowed.push(E.toFootballScore(r.yourScore, r.oppScore, r.won, rnd, CAL).them);
      }
      wins.push(w);
    }
    const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
    const pairs = totals.map((t, i) => [t, wins[i]]).sort((a, b) => a[0] - b[0]);
    const tenth = Math.max(1, Math.floor(pairs.length * 0.1));
    const lo = mean(pairs.slice(0, tenth).map((x) => x[1]));
    const hi = mean(pairs.slice(-tenth).map((x) => x[1]));
    return { wins: mean(wins), gap: hi - lo, allowed: mean(allowed) };
  };
  const N = Number(process.env.SEASONS || 600);
  const o = measure(['QB', 'RB', 'WR', 'WR', 'TE', 'FLEX'], oTS,
    { QB: ['QB'], RB: ['RB'], WR: ['WR'], TE: ['TE'], FLEX: ['RB', 'WR', 'TE'] }, false, N);
  const d = measure(E.DEFENSE_SLOTS, dTS,
    { DL: ['DL'], LB: ['LB'], DB: ['DB'], FLEX: ['DL', 'LB', 'DB'] }, true, N);
  console.log(`  ${N} seasons each`);
  console.log(`  offense: ${o.wins.toFixed(2)} wins, draft gap ${o.gap.toFixed(2)}, allowed ${o.allowed.toFixed(1)}`);
  console.log(`  defense: ${d.wins.toFixed(2)} wins, draft gap ${d.gap.toFixed(2)}, allowed ${d.allowed.toFixed(1)}`);
  ok('a defensive season is about as winnable as an offensive one',
    Math.abs(o.wins - d.wins) < 1.5, { offense: o.wins.toFixed(2), defense: d.wins.toFixed(2) });
  /* THE DRAFT MATTERS AT LEAST AS MUCH, not exactly as much. A defense's outcomes spread
     wider across draft quality than an offense's, so drafting well is rewarded a little more
     here, which is a feature of the mode rather than a balance leak: the concern for parity
     is that a defense is not HARDER, and a wider spread does not make a good draft harder. */
  ok('and the draft matters at least as much as the offense draft',
    d.gap >= o.gap - 0.3, { offense: o.gap.toFixed(2), defense: d.gap.toFixed(2) });
  /* The mode's own identity: you are the side that stops people. */
  ok('a drafted defense allows fewer points than a drafted offense does',
    d.allowed < o.allowed, { defense: d.allowed.toFixed(1), offense: o.allowed.toFixed(1) });
}

console.log('\n=== the overall, and the season it projects ===');
{
  /* THE TWO NUMBERS THE RESULTS SCREEN MAKES A CLAIM WITH, and both were wrong on a
     defense in the same way: they were computed as though six defenders were an offense.

     Team overall was the raw product, which tops out at 55.4 on a scale whose green band
     starts at 75, so no defense could ever be graded well and every one of them was fed to
     the seeding and edge constants as a bottom roster. The typical record came out of
     playRun, which resolved a defensive roster through resolveGame: a 47 point offense
     that loses almost every week. A season that finished 10-7 was reported as typically
     2-15, which is not a rounding error, it is the wrong sport. */
  const byTS = new Map();
  for (const r of D) { if (!r.team_season_id) continue;
    if (!byTS.has(r.team_season_id)) byTS.set(r.team_season_id, []);
    byTS.get(r.team_season_id).push(r); }
  const oTS = new Map();
  for (const r of O) { if (!r.team_season_id) continue;
    if (!oTS.has(r.team_season_id)) oTS.set(r.team_season_id, []);
    oTS.get(r.team_season_id).push(r); }
  let seed = 77;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const pick = (map, slots, elig) => {
    const ks = [...map.keys()];
    let spent = 0; const took = [];
    for (let i = 0; i < slots.length; i++) {
      const ts = ks[Math.floor(rnd() * ks.length)];
      const opts = (map.get(ts) || []).filter((p) => elig[slots[i]].includes(p.position));
      if (!opts.length) { i--; continue; }
      const budget = 140 - spent - 3 * (slots.length - 1 - i);
      const can = opts.filter((p) => p.price_musd <= budget);
      const from = (can.length ? can : opts.slice().sort((a, b) => a.price_musd - b.price_musd).slice(0, 1)).slice();
      from.sort((a, b) => b.ppr_ppg_mean - a.ppr_ppg_mean);
      took.push(from[0]); spent += from[0].price_musd;
    }
    return took;
  };
  const dElig = { DL: ['DL'], LB: ['LB'], DB: ['DB'], FLEX: ['DL', 'LB', 'DB'] };
  const oElig = { QB: ['QB'], RB: ['RB'], WR: ['WR'], TE: ['TE'], FLEX: ['RB', 'WR', 'TE'] };

  /* ---- the scale ---- */
  ok('the overall is monotone, so a better defense never grades worse',
    [10, 20, 30, 40, 50, 60].every((v, i, a) => i === 0
      || E.defenseOverall(v) > E.defenseOverall(a[i - 1])),
    [10, 30, 50].map((v) => +E.defenseOverall(v).toFixed(1)));
  /* THE THREE ANCHORS THAT MATTER, by raw defense total: the median drafted defense (~34)
     grades where the median offense does (~48), a well-drafted one (~48) reads ~80 like a
     well-drafted offense, and a near-perfect one (~55) reaches ~95 so it can finally touch
     the elite seeding and title-game tier the whole fix is about. */
  ok('the map aligns the median, the good draft, and the elite ceiling',
    Math.abs(E.defenseOverall(34) - 48) < 4
    && Math.abs(E.defenseOverall(48) - 80) < 4
    && E.defenseOverall(55) >= 94,
    { median: +E.defenseOverall(34).toFixed(0), good: +E.defenseOverall(48).toFixed(0), ceiling: +E.defenseOverall(55).toFixed(0) });

  const N = Number(process.env.OVERALL || 300);
  const grade = (n, map, slots, elig, defense) => {
    const out = [];
    for (let i = 0; i < n; i++) out.push(E.overallOf(pick(map, slots, elig), 1, defense));
    out.sort((a, b) => a - b);
    return out;
  };
  const dOvr = grade(N, byTS, E.DEFENSE_SLOTS, dElig, true);
  const oOvr = grade(N, oTS, E.SLOTS, oElig, false);
  const med = (a) => a[Math.floor(a.length / 2)];
  console.log(`  greedy median overall: offense ${med(oOvr).toFixed(1)}, defense ${med(dOvr).toFixed(1)}`);
  /* THE BAND IS THE POINT. 75 is where the results screen turns the number green and it
     means "you beat a greedy draft". A defense that could not reach it was being told it
     had failed for doing the best thing available on every board. */
  ok('a greedy defense grades like a greedy offense, both in the green band',
    Math.abs(med(dOvr) - med(oOvr)) < 8 && med(dOvr) >= 75,
    { offense: +med(oOvr).toFixed(1), defense: +med(dOvr).toFixed(1) });

  /* ---- the season it projects ---- */
  const teams = TS.filter((t) => t.pts_scored_mean > 0);
  const avg = LC.league_avg_pts_allowed_by_season;
  const sched = Array.from({ length: 17 }, () => teams[Math.floor(rnd() * teams.length)]);
  const po = Array.from({ length: 4 }, () => teams[Math.floor(rnd() * teams.length)]);
  const trials = 120;
  const project = (roster, defense) => {
    let w = 0;
    for (let i = 0; i < trials; i++) {
      const rng = E.createSeededRNG(E.hashSeed(`proj|${i}`));
      w += E.playRun(roster, 1, sched, po, avg, rng, E.CONSTANTS, { defense }).regularWins;
    }
    return w / trials;
  };
  const roster = pick(byTS, E.DEFENSE_SLOTS, dElig);
  const asDefense = project(roster, true);
  const asOffense = project(roster, false);
  console.log(`  the same six defenders: ${asDefense.toFixed(2)} wins as a defense, `
    + `${asOffense.toFixed(2)} projected as an offense`);
  /* Not a range check on a tuned number: the claim is that the projection plays the mode.
     Resolved as an offense a defensive roster is a 47 point team and wins almost nothing,
     which is exactly the 2-15 that was on screen. */
  ok('playRun projects a defense as a defense', asDefense > asOffense + 3,
    { asDefense: +asDefense.toFixed(2), asOffense: +asOffense.toFixed(2) });
  ok('and the projection agrees with the game the engine actually plays',
    Math.abs(asDefense - (() => {
      let w = 0;
      for (let i = 0; i < trials; i++) {
        const rng = E.createSeededRNG(E.hashSeed(`direct|${i}`));
        let k = 0;
        for (const opp of sched) {
          if (E.resolveGameDefense(roster, 1, opp, avg[opp.season] ?? 21.5, rng, E.CONSTANTS, 1).won) k++;
        }
        w += k;
      }
      return w / trials;
    })()) < 1.5, { viaPlayRun: +asDefense.toFixed(2) });
}

console.log('\n=== the scoreboard the projection reports ===');
{
  /* The How close table prints what each roster does to the SCOREBOARD, not just what it is
     worth in fantasy points: points scored a game on a draft, points allowed a game on a
     defense, yours against the best you could have had. Both come out of projectSeason, so
     both are the season a roster typically plays rather than the one it happened to play.

     THE SUBTLE PART IS THE RNG. toFootballScore is what turns the engine's continuous score
     into a scoreline the NFL has really produced, and it draws a value. Drawing it from the
     season's own stream would consume numbers the next game depends on and silently rewrite
     every later week, which would not look like a rendering change: it would look like the
     leaderboard disagreeing with itself. The scores get a second seeded stream, and the
     first assertion here is that the records did not move because of it. */
  const R = require(`${ROOT}/football/run.js`);
  const oData = R.indexData(O, TS);
  const dData = R.indexData(D, TS);
  const ctx = { battery: rd('battery.json'), coaches: rd('coaches.json'), curated: rd('curated.json') };
  const LEAGUE = LC.league_avg_pts_allowed_by_season;

  const play = (defense, seed) => {
    const data = defense ? dData : oData;
    const run = R.createRun({ seed, defense: defense || undefined });
    while (run.roster.length < 6) {
      const draw = R.spin(run, data);
      const live = R.affordableFrom(run, draw.team_season_id, data.playersByTeamSeason);
      if (!live.length) throw new Error('nothing signable');
      const left = 6 - run.roster.length;
      const spent = run.roster.reduce((t, p) => t + p.price_musd, 0);
      const budget = 140 - spent - 3 * (left - 1);
      const can = live.filter((p) => p.price_musd <= budget);
      const from = (can.length ? can : live.slice().sort((a, b) => a.price_musd - b.price_musd).slice(0, 1)).slice();
      from.sort((a, b) => b.ppr_ppg_mean - a.ppr_ppg_mean);
      R.sign(run, from[0]);
    }
    R.startSeason(run, data, ctx);
    let guard = 0;
    while (run.phase !== R.PHASES.OVER && guard++ < 80) {
      if (run.phase === R.PHASES.SEEDING) {
        if (run.playoffSeed.made) { R.startPlayoffs(run); continue; }
        break;
      }
      R.advanceWeek(run, data, LEAGUE, CAL);
    }
    return { run, data };
  };

  const { run, data } = play(true, 4041);
  const withScores = R.projectSeason(run.roster, run.season.chemistry, run, data, LEAGUE, 150, CAL);
  const without = R.projectSeason(run.roster, run.season.chemistry, run, data, LEAGUE, 150);
  ok('working out the scorelines does not change the record they came from',
    withScores.typicalWins === without.typicalWins && withScores.meanWins === without.meanWins,
    { with: withScores.typicalWins, without: without.typicalWins });

  /* The projection is a projection OF the season that was played, so the two have to be in
     the same neighbourhood. Not equal: one season is mostly luck, which is the whole reason
     the table replays it rather than reporting it. */
  const played = (f) => run.season.results.reduce((t, r) => t + f(r), 0) / run.season.results.length;
  const realAgainst = played((r) => r.shownThem ?? r.oppScore);
  console.log(`  points allowed: projected ${withScores.pointsAgainst.toFixed(1)}, `
    + `played ${realAgainst.toFixed(1)}`);
  ok('the projected points allowed agree with the season that was played',
    Math.abs(withScores.pointsAgainst - realAgainst) < 4,
    { projected: +withScores.pointsAgainst.toFixed(1), played: +realAgainst.toFixed(1) });
  ok('and they are NFL scores, not engine units',
    withScores.pointsAgainst > 10 && withScores.pointsAgainst < 40,
    +withScores.pointsAgainst.toFixed(1));

  /* THE ROW ONLY MEANS SOMETHING IF A BETTER DEFENSE SHOWS A LOWER NUMBER. That is the
     direction of the whole mode and it is one sign flip from being backwards. */
  const best = R.bestPossibleSquad(run, data, ctx);
  if (best) {
    const bestProj = R.projectSeason(best.squad, best.chemistry, run, data, LEAGUE, 150, CAL);
    console.log(`  yours ${withScores.pointsAgainst.toFixed(1)} allowed, `
      + `best available ${bestProj.pointsAgainst.toFixed(1)}`);
    ok('the best defense you could have drafted allows fewer points than yours',
      bestProj.pointsAgainst <= withScores.pointsAgainst + 0.01,
      { yours: +withScores.pointsAgainst.toFixed(1), best: +bestProj.pointsAgainst.toFixed(1) });
  } else {
    ok('the best possible squad could be worked out', false);
  }

  /* And the other side of the ball, where the row is points SCORED and a better draft has to
     move it the other way. */
  const off = play(false, 4041);
  const oMine = R.projectSeason(off.run.roster, off.run.season.chemistry, off.run, off.data, LEAGUE, 150, CAL);
  const oBest = R.bestPossibleSquad(off.run, off.data, ctx);
  console.log(`  offense: yours ${oMine.pointsFor.toFixed(1)} scored, `
    + `best available ${oBest ? R.projectSeason(oBest.squad, oBest.chemistry, off.run, off.data, LEAGUE, 150, CAL).pointsFor.toFixed(1) : 'n/a'}`);
  ok('a draft scores NFL points too, and the best you could have drafted scores more',
    oMine.pointsFor > 10 && oMine.pointsFor < 45 && (!oBest
      || R.projectSeason(oBest.squad, oBest.chemistry, off.run, off.data, LEAGUE, 150, CAL).pointsFor
        >= oMine.pointsFor - 0.01),
    +oMine.pointsFor.toFixed(1));
}

if (process.env.BROWSER) {
  console.log('\n=== the mode, in a browser ===');
  const { chromium } = await import('playwright');
  const PROBE = `${ROOT}/football/__test_defense.html`;
  /* One anchor, the same insertion every harness for this page uses. */
  const HOOK = `
window.__DEF={
  menu:()=>modeMenu(),
  /* Repaints the way the real onChange does. Assigning authState alone would leave the
     front page showing whatever it showed before, which is exactly the bug this suite is
     meant to catch rather than reproduce. */
  auth(st){ authState=st; paintHomeStart(); },
  intro(){ closeSheet(); show('s-intro'); },
  /* DEFENSE_LIVE is a const in the shipped file, so the gate is read here and overridden
     through a hook rather than reassigned: one build has to be driven through both states. */
  live:()=>DEFENSE_LIVE,
  testers:()=>DEFENSE_TESTERS.slice(),
  /* null hands the question back to the shipped gate, which is how the tester allowlist
     gets tested at all: overriding it would answer before the allowlist is consulted. */
  setLive(v){ __defLiveOverride=v; },
  launch(){ return beginDefenseDraft(); },
  /* WHAT THE SHEET IN FRONT OF A SIGNED-OUT VISITOR ACTUALLY SAYS, plus the state of the
     button they pressed to get it. Both halves matter: the wall was written for One
     Franchise and named it out loud, and the Defense half was left spinning behind it. */
  wall(){
    const s=document.getElementById('sheet'), i=document.getElementById('sheet-in');
    const b=document.getElementById('b-start-def');
    return {open:s.classList.contains('on'),kind:i.dataset.kind||'',
      eyebrow:((i.querySelector('.eyebrow')||{}).textContent||'').trim(),
      text:i.textContent,
      btn:b?{disabled:!!b.disabled,loading:b.classList.contains('hp-loading')}:null};
  },
  /* The sign-up landing, without a real account: this is the flag the auth change reads. */
  wallSignIn(){ const b=document.getElementById('b-wall-in'); if(b) b.click();
    return {oneTeam:wantOneTeam,defense:wantDefense}; },
  /* Put the flag back, or the next auth change in this suite would follow through on it and
     take the page into the draft under the sticker assertions. */
  wallReset(){ wantOneTeam=false; wantDefense=false; },
  board(){ show('s-board'); paintComp(); },
  /* Has the defensive pool been fetched by this page yet. The whole of the bug below is that
     nothing on the board's path ever asked for it. */
  pool:()=>!!DDATA,
  /* Draw the Defense board with one row on the wire, and read back what the row and the run
     detail sheet actually say. The row is handed in rather than drafted, because what is
     under test is a browser that has never opened a defense draft: drafting one would load
     the pool as a side effect and the bug would vanish before the assertion ran. */
  async boardWith(row){
    const sel=document.getElementById('lb-comp'); sel.value='defense';
    sel.dispatchEvent(new Event('change'));
    const real=window.fetch;
    window.fetch=(u,o)=>{ const s=String(u);
      const body=/ps_runs\\?/.test(s)?JSON.stringify([row]):'[]';
      return Promise.resolve(new Response(body,{status:200,
        headers:{'Content-Type':'application/json','Content-Range':'0-0/1'}})); };
    /* A board request left in flight by an earlier assertion would make loadBoard return at
       its own guard and this would read the loading state forever. */
    lbBusy=false;
    try{ await loadBoard(); }finally{ window.fetch=real; }
    return {rowText:document.getElementById('lb-rows').textContent,pool:!!DDATA};
  },
  /* The sheet, as a reader sees it: the names it managed to resolve and its full text. */
  detail(row){ runDetail(row);
    return {names:[...document.querySelectorAll('#sheet-in .rrow .nm b')].map(x=>x.textContent),
      text:document.getElementById('sheet-in').textContent}; },
  detailNow:()=>({names:[...document.querySelectorAll('#sheet-in .rrow .nm b')].map(x=>x.textContent),
    text:document.getElementById('sheet-in').textContent}),
  comps:()=>[...document.querySelectorAll('#lb-comp option')]
    .map(o=>({value:o.value,label:o.textContent})),
  scopeFor(v){ const sel=document.getElementById('lb-comp'); sel.value=v;
    sel.dispatchEvent(new Event('change')); return lbScope(); },
  /* THE URL EACH COMPETITION ACTUALLY ASKS FOR, with fetch stubbed so the real call is
     built and nothing leaves the page. This is the question "does a defense run show up on
     the classic board" reduced to something answerable: the filtering is the database's, so
     what decides it is the run_mode the client puts in the query string. */
  async urlFor(v){
    const sel=document.getElementById('lb-comp'); sel.value=v;
    sel.dispatchEvent(new Event('change'));
    const seen=[]; const real=window.fetch;
    window.fetch=(u,o)=>{ seen.push(String(u));
      return Promise.resolve(new Response('[]',{status:200,
        headers:{'Content-Type':'application/json','Content-Range':'0-0/0'}})); };
    try{ await B.top(lbScope(),10,'record','desc'); }
    finally{ window.fetch=real; }
    return seen.find(u=>/ps_runs\?/.test(u))||null;
  },
  /* What the picker offers, as a flat list with its groupings, so the shape of the menu is
     under test and not only the values in it. */
  compTree:()=>[...document.querySelectorAll('#lb-comp > optgroup, #lb-comp > option')]
    .map(el=>el.tagName==='OPTGROUP'
      ? {group:el.label,options:[...el.children].map(o=>({v:o.value,t:o.textContent}))}
      : {v:el.value,t:el.textContent}),
  /* THE FRONT PAGE'S OWN STATE, which is where the mode now lives. One full-width Start a
     run for everybody, or the Offense and Defense pair for anybody on the allowlist. */
  home(){
    const split=document.getElementById('hp-split'), one=document.getElementById('b-start');
    const off=document.getElementById('b-start-off'), def=document.getElementById('b-start-def');
    const box=(el)=>{ const r=el.getBoundingClientRect();
      return {w:Math.round(r.width),h:Math.round(r.height)}; };
    const name=(el)=>((el.querySelector('.hp-side-name')||{}).textContent||'').trim();
    /* MEASURED, NOT ASKED. Reading el.hidden says what the ATTRIBUTE is, which is not the
       same as what the page shows: the hidden attribute is a display:none in the UA sheet and
       .btn sets display:block, so b-start stayed on screen with the attribute set and an
       assertion on el.hidden passed while the front page showed BOTH controls stacked, one
       above the other. offsetParent is null only when the thing is genuinely not rendered.
       (No backticks in here: this whole hook is a template literal.) */
    const shown=(el)=>!!el&&el.offsetParent!==null&&el.getBoundingClientRect().height>0;
    return {
      split:shown(split), single:shown(one),
      splitAttr:!!split&&!split.hidden, singleAttr:!!one&&!one.hidden,
      /* The Defense half's own state, which survives a whole run if nothing puts it back. */
      defDisabled:!!def&&def.disabled,
      defLoading:!!def&&/hp-loading/.test(def.className),
      singleLabel:one?one.textContent.trim():null,
      offName:off?name(off):null, defName:def?name(def):null,
      defSub:def?((def.querySelector('.hp-side-sub')||{}).textContent||'').trim():null,
      offBox:off?box(off):null, defBox:def?box(def):null,
      /* Neither half may spill out of the page: two 19px words in a 390px screen is the
         thing most likely to break here. */
      overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,
    };
  },
  paintHome:()=>paintHomeStart(),
  /* The sentence over the rank windows on the results screen, which is a claim about WHICH
     field the number underneath was measured in. */
  rankCopy:()=>({against:rankAgainst(),apart:rankApart(),kind:runKindOf(
    {run_mode:runMode(),franchise:run&&run.franchise,era:run&&run.era})}),
  /* THE EIGHT POSITION TOKENS, straight off the stylesheet. The three defensive ones used to
     be the same hexes as QB, TE and WR, so a defensive field was an offensive one with two
     colours missing; this is what says they are their own. Read from the computed root
     rather than from the source text, because the share card asks the DOM for them too. */
  palette(){
    const cs=getComputedStyle(document.documentElement);
    const g=(n)=>cs.getPropertyValue('--'+n).trim().toLowerCase();
    const rgb=(n)=>cs.getPropertyValue('--'+n+'-rgb').trim();
    return {off:{QB:g('qb'),RB:g('rb'),WR:g('wr'),TE:g('te')},
      def:{DL:g('dl'),LB:g('lb'),DB:g('db')},
      flex:g('flex'),
      /* The triples feed a canvas, where a disagreement with the hex is discovered late. */
      triples:{DL:rgb('dl'),LB:rgb('lb'),DB:rgb('db')}};
  },
  /* The launch sticker: whether it is up, whether its window is still open, that it is on
     the DEFENSE half and not the offense one, and that it is out of the flow. The last is
     the one that would go wrong silently: the two halves are equal grid columns, so anything
     in the flow of one and not the other shifts that half's label off centre against its
     twin, and nothing throws. */
  /* THE TWO STICKERS, and whether either has slid under the label it sits beside.
     A badge over a word is the failure this page has had before in another form and it is
     always silent: nothing throws, the season still plays, and the only symptom is a button
     nobody can read. Measured as a box intersection rather than eyeballed, because it holds
     at 390 and breaks at 360, which is not a difference anyone spots in a screenshot. */
  stickers(){
    const hit=(a,b)=>!(a.right<=b.left||a.left>=b.right||a.bottom<=b.top||a.top>=b.bottom);
    const read=(btnId,tagSel)=>{
      const btn=document.getElementById(btnId); if(!btn) return null;
      const tag=btn.querySelector(tagSel), nm=btn.querySelector('.hp-side-name'),
            sub=btn.querySelector('.hp-side-sub');
      if(!tag||!nm||!sub) return {missing:true};
      const T=tag.getBoundingClientRect(), N=nm.getBoundingClientRect(),
            S=sub.getBoundingClientRect(), B=btn.getBoundingClientRect();
      return {
        text:tag.textContent.trim(),
        shown:tag.offsetParent!==null&&T.height>0,
        absolute:getComputedStyle(tag).position==='absolute',
        hitsName:hit(T,N), hitsSub:hit(T,S),
        /* Inside its own half, and the label inside it too. */
        inBox:T.right<=B.right+1&&T.top>=B.top-1,
        labelFits:N.left>=B.left+2&&N.right<=B.right-2&&S.left>=B.left+2&&S.right<=B.right-2,
        /* Centred against its own half, so neither sticker has pushed its label sideways. */
        off:Math.round((N.left+N.right)/2-(B.left+B.right)/2),
        h:Math.round(B.height),
      };
    };
    return {og:read('b-start-off','.hp-og'), nw:read('b-start-def','#hp-def-new'),
      windowOpen:defenseNewLive(), until:DEFENSE_NEW_UNTIL,
      /* No pips any more: they repeated the line below them and half of them could not be
         seen against their own button. */
      pips:document.querySelectorAll('.hp-pips').length};
  },
  /* The mode MOVED. A card left behind in the menu would be a second door to the same
     place, gated by different code. */
  menuHasCard:()=>!!document.getElementById('b-mc-def'),
  slots:()=>slotsNow(),
  tabs:()=>[...document.querySelectorAll('#tabs .tab')].map(t=>t.textContent),
  /* THE SHARE CARD. It is drawn to a canvas, so what it says cannot be read back without
     an OCR pass; what CAN be read back is that it drew at all, at the right size, off the
     right slot names. */
  shareCard(){
    const before=slotsNow().join(',');
    const c=drawShareCard();
    return {w:c.width,h:c.height,slots:before,
      bytes:c.toDataURL('image/png').length};
  },
  /* ---- WHAT ACTUALLY GOES OVER THE WIRE ----
     fetch is stubbed and the real calls are made, so this reads the URL the board asks
     for and the body the submit sends rather than the intent the page had. The two are
     not the same thing and the difference is where the defense draft's runs were being lost. */
  async wire(){
    const seen=[]; const real=window.fetch;
    window.fetch=(u,o)=>{ seen.push({url:String(u),body:(o&&o.body)||null});
      return Promise.resolve(new Response('[]',{status:200,
        headers:{'Content-Type':'application/json'}})); };
    try{ await B.top({mode:'defense',win:'day',named:true},10,'record','desc');
      await B.submit(runPayload()); }
    catch(e){ seen.push({error:String(e&&e.message)}); }
    finally{ window.fetch=real; }
    return seen;
  },
  /* ---- THE GROUP COLORS ----
     Which color each group is wearing, and whether the text on it can be read. Sampled off
     the rendered page rather than computed from the palette, because every one of these
     sits on a different ground: a chip is on grass, a tab is on the page, a pip is on a
     white wash over the page. The same red cleared 4.59 on one and 3.87 on another. */
  tint(){
    const lum=(c)=>{ const f=(v)=>{ v/=255;
      return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4); };
      return 0.2126*f(c[0])+0.7152*f(c[1])+0.0722*f(c[2]); };
    /* THE DOUBLED BACKSLASH IN THAT CHARACTER CLASS IS DELIBERATE. This whole hook is a
       template literal, and a template literal eats one level of escaping, so the digit
       class has to be written with two here to arrive in the page with one. Written with
       one it arrives as a class of the letter d, which matches nothing in a color, so every
       color reads as transparent and every ratio below comes out as exactly 1. That is what
       it did, and 1 is not a number anybody reads as wrong.

       Anything that will not parse reads as fully transparent, which walks the search up to
       the next ground rather than guessing at a color it could not read. */
    const parse=(s)=>{ const m=String(s||'').match(/[\\d.]+/g);
      return m?m.slice(0,4).map(Number):[0,0,0,0]; };
    const over=(fg,bg)=>{ const a=fg[3]===undefined?1:fg[3];
      return [0,1,2].map(i=>fg[i]*a+bg[i]*(1-a)); };
    /* The nearest ground that actually paints something opaque, which is what the eye
       is comparing the text against. */
    const bgOf=(el)=>{ let n=el;
      while(n&&n!==document.documentElement){
        const c=parse(getComputedStyle(n).backgroundColor);
        if((c[3]===undefined?1:c[3])>0.9) return c.slice(0,3);
        n=n.parentElement; }
      return [8,11,20]; };
    const read=(el,what)=>{ const bg=bgOf(el);
      const fg=over(parse(getComputedStyle(el).color),bg);
      const a=lum(fg), b=lum(bg);
      return {what,hue:getComputedStyle(el).color,
        ratio:Math.round(100*(Math.max(a,b)+0.05)/(Math.min(a,b)+0.05))/100}; };
    const out=[];
    document.querySelectorAll('#tabs .tab:not(.all)').forEach((t)=>out.push(read(t,'tab '+t.dataset.t)));
    document.querySelectorAll('#field .chip.empty .disc').forEach((d)=>out.push(read(d,'spot '+d.textContent.trim())));
    document.querySelectorAll('.dpips i:not(.on)').forEach((d)=>out.push(read(d,'pip '+d.textContent.trim())));
    document.querySelectorAll('.rnode:not(.on) .rdot').forEach((d)=>out.push(read(d,'node '+d.textContent.trim())));
    return out;
  },
  /* ---- THE FIELD ----
     Whichever copy of it is on screen: the draft's, the squad's or the results'. */
  vis(){ return [...document.querySelectorAll('.field')]
    .find(f=>f.getBoundingClientRect().width>0)||null; },
  shape:()=>defShape().key,
  frontName:()=>{ const f=window.__DEF.vis();
    return f?((f.querySelector('.front')||{}).textContent||''):''; },
  los:()=>{ const f=window.__DEF.vis(); return !!(f&&f.querySelector('.los')); },
  /* Force the flex, so all four shapes are reachable from one draft. */
  setFlex(pos){ const i=run.slotIndex.indexOf(5); if(i<0) return null;
    run.roster[i].position=pos; const f=window.__DEF.vis(); if(f) drawField(f,true);
    return defShape().key; },
  /* Every disc against every other chip's rendered NAME, in real pixels. Not the label
     box: a surname is centered and ellipsized inside a box far wider than most of them,
     so boxes touching is not the same complaint as a disc drawn over a name. */
  fieldProbe(){
    const f=window.__DEF.vis(); if(!f) return {noField:true,over:[],outside:[],discs:[]};
    const fr=f.getBoundingClientRect();
    const chips=[...f.querySelectorAll('.chip')];
    const box=(el)=>{ const r=el.getBoundingClientRect();
      return {l:r.left,r:r.right,t:r.top,b:r.bottom}; };
    const hit=(a,b)=>a.l<b.r&&b.l<a.r&&a.t<b.b&&b.t<a.b;
    const out={field:{w:Math.round(fr.width),h:Math.round(fr.height)},
      over:[],outside:[],discs:[]};
    const discs=chips.map(c=>box(c.querySelector('.disc')));
    const texts=chips.map(c=>{ const rg=document.createRange();
      rg.selectNodeContents(c.querySelector('.who'));
      const r=rg.getBoundingClientRect();
      const y=box(c.querySelector('.yr'));
      return r.width?{l:r.left,r:r.right,t:r.top,b:Math.max(r.bottom,y.bottom)}:null; });
    chips.forEach((c,i)=>{
      if(discs[i].t<fr.top-0.5||discs[i].b>fr.bottom+0.5
        ||discs[i].l<fr.left-0.5||discs[i].r>fr.right+0.5) out.outside.push(i+':disc');
      if(texts[i]&&(texts[i].b>fr.bottom+0.5||texts[i].t<fr.top-0.5))
        out.outside.push(i+':name');
      chips.forEach((_,j)=>{ if(i===j) return;
        if(texts[j]&&hit(discs[i],texts[j])) out.over.push(i+' on '+j);
        if(j>i&&hit(discs[i],discs[j])) out.discs.push(i+'+'+j); });
    });
    return out;
  },
  roster:()=>(run&&run.roster||[]).map(p=>({pos:p.position,price:p.price_musd})),
  state:()=>{ const s=run&&run.season||{}; const rs=s.results||[];
    return { defense:!!(run&&run.defense), mode:runMode(), label:runModeLabel(),
      wins:s.wins, losses:s.losses, games:rs.length,
      defMods:rs.slice(0,3).map(r=>r.defMod) }; },
};

boot();`;
  let src = fs.readFileSync(`${ROOT}/football/index.html`, 'utf8');
  if (src.split('\nboot();').length !== 2) throw new Error('the boot() anchor moved');
  /* The gate is a const in the shipped file and stays one. The probe copy adds an override
     beside it so the same build can be seen both ways. */
  /* THE OVERRIDE STANDS IN FOR THE FLAG, NOT FOR THE ANSWER, and the difference is the
     whole allowlist half of this suite. Short-circuiting canPlayDefense to return the
     override outright made setLive(false) mean "nobody, including testers", so the moment
     DEFENSE_LIVE shipped true there was no way left to reach the state the allowlist governs:
     flag off, named account in. Replacing the flag READ instead leaves the rest of the gate
     doing its real work under every setting. */
  const GATE = 'const canPlayDefense=()=>{';
  const FLAG = 'if(DEFENSE_LIVE) return true;';
  if (src.split(GATE).length !== 2) throw new Error('the defense gate moved; update this file');
  if (src.split(FLAG).length !== 2) throw new Error('the DEFENSE_LIVE check moved; update this file');
  src = src.replace(GATE, 'let __defLiveOverride=null;\n' + GATE)
    .replace(FLAG, 'if(__defLiveOverride!==null?__defLiveOverride:DEFENSE_LIVE) return true;');
  fs.writeFileSync(PROBE, src.replace('\nboot();', HOOK));
  const b = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  try {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(() => { try {
      localStorage.setItem('ps_seen_guide', '1'); localStorage.setItem('rtg_arcade_ad_off', '1');
    } catch (e) {} });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => { bad++; console.log('  FAIL  page error   ' + String(e.message).split('\n')[0]); });
    await p.goto(`${HOST}/football/__test_defense.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await p.waitForFunction(() => window.__DEF && document.getElementById('s-intro'), null, { timeout: 60000 });
    await p.evaluate(() => window.__DEF.auth({ ready: true, signedIn: true, name: 'Tester', userId: 'u1' }));
    await p.evaluate(() => window.__DEF.menu());
    await p.waitForTimeout(400);
    /* ── THE GATE ─────────────────────────────────────────────────────────────
       The mode is finished and NOT recordable until ps_runs_run_mode_ck lists it, so a
       pressable button would hand somebody a season that vanishes on submit. It now lives
       on the FRONT PAGE rather than in the mode menu, and the gate shows in a different
       shape because of that: there is no greyed-out card any more. Somebody who cannot play
       it sees the front page it has always had, one full-width Start a run, with no sign
       the other half exists. That is deliberate. A padlocked Defense button on the home
       screen advertises an unannounced mode to everybody who loads the game. */
    const shipped = await p.evaluate(() => window.__DEF.live());
    console.log(`  (DEFENSE_LIVE is ${shipped}; the migration must be applied before it flips)`);
    await p.evaluate(() => window.__DEF.setLive(false));
    await p.evaluate(() => { window.__DEF.paintHome(); window.__DEF.intro(); });
    await p.waitForTimeout(250);
    const gated = await p.evaluate(() => window.__DEF.home());
    ok('gated: the front page is the one it has always been, one Start a run',
      gated.single && !gated.split && gated.singleLabel === 'Start a run', gated);
    ok('gated: and nothing on it hints at a mode nobody can play',
      gated.split === false, { splitShown: gated.split });
    ok('gated: the launcher refuses even when called directly',
      await p.evaluate(async () => { window.__DEF.launch();
        await new Promise((r) => setTimeout(r, 500));
        return !document.getElementById('s-draft').classList.contains('on'); }));
    await p.evaluate(() => window.__DEF.board());
    await p.waitForTimeout(200);
    ok('gated: the board does not offer a competition nobody can be on',
      await p.evaluate(() => !window.__DEF.comps().some((o) => o.value === 'defense')));
    /* THE MODE MOVED, it was not copied. A card still sitting in the menu would be a second
       door to the same draft, reached through different code and gated separately. */
    await p.evaluate(() => window.__DEF.menu());
    await p.waitForTimeout(300);
    ok('gated: and the mode menu no longer carries a card for it',
      await p.evaluate(() => !window.__DEF.menuHasCard()));

    /* ── THE TESTER ALLOWLIST ─────────────────────────────────────────────────
       Between "nobody" and "everybody" there is a middle state: named accounts get the real
       mode on the real database while everybody else sees the front page unchanged. The mode
       is LIVE now, so the shipped gate answers "everybody" and would no longer exercise this
       at all: the whole block stays under an explicit setLive(false), which is what makes it
       a test of the ALLOWLIST rather than of the flag. It is worth keeping past launch
       because the flag is the rollback: if the mode ever has to be pulled, this is the state
       it goes back to, and a path nobody tests is a path nobody can trust in a hurry. */
    await p.evaluate(() => window.__DEF.setLive(false));
    const testers = await p.evaluate(() => window.__DEF.testers());
    console.log(`  (testers: ${testers.join(', ') || 'none'})`);
    ok('the allowlist is not empty, so the rollback state still has a way in',
      testers.length > 0, testers);
    /* Capitalised on purpose: a username is displayed the way it was typed and a tester
       should not have to match their own capitalisation to reach the mode. */
    await p.evaluate((n) => window.__DEF.auth({ ready: true, signedIn: true, name: n, userId: 'u2' }),
      String(testers[0] || 'malikwillislover').toUpperCase());
    /* The front page has to BE on screen to be measured: the menu above left a sheet open
       over it, and a hidden screen's children all measure zero by zero. */
    await p.evaluate(() => window.__DEF.intro());
    await p.waitForTimeout(250);
    const asTester = await p.evaluate(() => window.__DEF.home());
    ok('tester: the split appears however the name was capitalised',
      asTester.split && !asTester.single, asTester);
    /* Compared case-insensitively on purpose: every control on this page is uppercased by
       CSS rather than in the markup, so textContent is the sentence case that was typed. */
    ok('tester: and it is Offense and Defense, not one button renamed',
      /^offense$/i.test(asTester.offName || '') && /^defense$/i.test(asTester.defName || ''),
      { off: asTester.offName, def: asTester.defName });
    /* The whole point of the pair over a single button: each half says which six spots it
       fills, which is the only real difference between the two modes. */
    ok('tester: each half says what it drafts', /DL/.test(asTester.defSub || ''),
      asTester.defSub);
    /* A 44px minimum is the accessibility floor for a touch target, and these are the two
       most important controls in the game. */
    ok('tester: both halves are a real thumb target',
      asTester.offBox.h >= 44 && asTester.defBox.h >= 44
      && asTester.offBox.w >= 44 && asTester.defBox.w >= 44,
      { off: asTester.offBox, def: asTester.defBox });
    /* MEASURED AGAINST THE PAGE WITHOUT THE SPLIT, not against zero. The front page already
       scrolls sideways by about 119px at 390 wide, in both states and with no visible
       element wider than the viewport, so something off-screen has been contributing to
       scrollWidth since before this button existed. Asserting zero here would fail for a
       reason that has nothing to do with the split; what this has to prove is that two
       buttons in the width of one do not make it worse. */
    ok('tester: the split adds no sideways scroll the single button did not already have',
      asTester.overflow <= gated.overflow + 1,
      { withSplit: asTester.overflow, withSingle: gated.overflow });
    await p.evaluate(() => window.__DEF.board());
    await p.waitForTimeout(200);
    ok('tester: and the board offers Defense',
      await p.evaluate(() => window.__DEF.comps().some((o) => o.value === 'defense')));

    await p.evaluate(() => window.__DEF.auth({ ready: true, signedIn: true, name: 'Somebody Else', userId: 'u3' }));
    /* On screen before it is measured, every time: home() reports what is RENDERED, and a
       screen that is not the visible one renders nothing at all. */
    await p.evaluate(() => window.__DEF.intro());
    await p.waitForTimeout(250);
    const asOther = await p.evaluate(() => window.__DEF.home());
    ok('everybody else: the front page goes back to one button',
      asOther.single && !asOther.split, asOther);
    ok('everybody else: the launcher refuses when called directly',
      await p.evaluate(async () => { window.__DEF.launch();
        await new Promise((r) => setTimeout(r, 500));
        return !document.getElementById('s-draft').classList.contains('on'); }));
    await p.evaluate(() => window.__DEF.auth({ ready: true, signedIn: false, name: null, userId: null }));
    await p.evaluate(() => window.__DEF.intro());
    await p.waitForTimeout(250);
    ok('signed out: one button too, and a name is what the allowlist matches on',
      await p.evaluate(() => { const h = window.__DEF.home(); return h.single && !h.split; }));

    /* ── AND WHAT THE PAGE ACTUALLY SHIPS ─────────────────────────────────────
       Everything above drove the gate through an override. This asks the shipped constant,
       with nobody signed in, which is the state a stranger arriving at runthe.gg is in. */
    await p.evaluate(() => window.__DEF.setLive(null));
    await p.evaluate(() => window.__DEF.intro());
    await p.waitForTimeout(250);
    const shipState = await p.evaluate(() => window.__DEF.home());
    ok('as shipped, a signed-out visitor gets both halves',
      shipped === true ? (shipState.split && !shipState.single)
        : (shipState.single && !shipState.split),
      { DEFENSE_LIVE: shipped, split: shipState.split, single: shipState.single });
    /* ── AND WHAT PRESSING IT GETS THEM ──────────────────────────────────────
       The mode is live to everybody but the draft still needs an account, because the
       Defense board lists runs by name. So a signed-out visitor CAN press Defense, and what
       came back was a sheet headed One Franchise explaining thirty-two club leaderboards,
       with the Defense half left spinning underneath it: the wall was written for one mode
       and hard-coded its name, its blurb and where the sign-up lands.

       Three separate things, and each one is asserted: the sheet names Defense and nothing
       else, the button they pressed is pressable again, and finishing the sign-up is
       recorded as wanting the defense draft rather than the club picker. */
    {
      await p.evaluate(() => window.__DEF.auth({ ready: true, signedIn: false, name: null, userId: null }));
      await p.evaluate(() => window.__DEF.intro());
      await p.waitForTimeout(200);
      await p.evaluate(() => window.__DEF.launch());
      await p.waitForTimeout(400);
      const w = await p.evaluate(() => window.__DEF.wall());
      ok('signed out: pressing Defense raises a wall that names Defense',
        w.open && w.kind === 'wall' && w.eyebrow === 'Defense', { open: w.open, kind: w.kind, eyebrow: w.eyebrow });
      ok('and it does not talk about One Franchise', !/One Franchise|franchise/i.test(w.text),
        w.text.slice(0, 160));
      ok('and the Defense button is left pressable, not spinning',
        !!w.btn && !w.btn.disabled && !w.btn.loading, w.btn);
      const want = await p.evaluate(() => window.__DEF.wallSignIn());
      ok('and signing up from it is remembered as wanting the defense draft',
        want.defense === true && want.oneTeam === false, want);
      await p.evaluate(() => window.__DEF.wallReset());
      await p.evaluate(() => window.__DEF.intro());
      await p.waitForTimeout(150);
    }

    /* THE STICKERS, at every width a phone actually is. NEW rides the launch window and
       takes itself away, so it is asserted against the date the page carries rather than
       against a hardcoded "on"; OG carries no date because it is a fact about the mode
       rather than an announcement, so it is simply always up.
       The widths are the point of this block. Both labels cleared their badge at 430 and
       ran straight under it at 390, 360 and 320, by as much as 14px, and every one of those
       is a phone somebody is holding. */
    for (const w of [320, 360, 390, 430]) {
      await p.setViewportSize({ width: w, height: 900 });
      await p.evaluate(() => window.__DEF.intro());
      await p.waitForTimeout(180);
      const st = await p.evaluate(() => window.__DEF.stickers());
      ok('@' + w + ' the OG and New stickers clear their own labels',
        !st.og.hitsName && !st.og.hitsSub && !st.nw.hitsName && !st.nw.hitsSub, st);
      ok('@' + w + ' both halves keep their label centred, inside the button, and thumb-sized',
        st.og.labelFits && st.nw.labelFits && Math.abs(st.og.off) <= 1
        && Math.abs(st.nw.off) <= 1 && st.og.h >= 44 && st.nw.h >= 44, st);
    }
    await p.setViewportSize({ width: 390, height: 844 });
    await p.evaluate(() => window.__DEF.intro());
    await p.waitForTimeout(200);
    const sticker = await p.evaluate(() => window.__DEF.stickers());
    /* The word is asserted, not just the presence of a badge: it said OG first, which reads
       as a joke to anybody who already knew the game and as nothing at all to anybody who
       did not. Classic draft says which of the two buttons is the game that was here. */
    ok('Classic draft is on the offense half and does not expire',
      sticker.og.text === 'Classic draft' && sticker.og.shown && sticker.og.absolute, sticker.og);
    ok('New is on the defense half, and only while its window is open',
      sticker.nw.text === 'New' && sticker.nw.absolute
      && sticker.nw.shown === (shipped && sticker.windowOpen), sticker.nw);
    /* The row of coloured dots is gone. It named the same five positions as the line
       underneath it, and QB on a red button and DB on a blue one could not be seen doing it. */
    ok('and the coloured pips are gone from both halves', sticker.pips === 0,
      { pipRows: sticker.pips });
    await p.evaluate(() => window.__DEF.auth({ ready: true, signedIn: true, name: 'Tester', userId: 'u1' }));
    await p.waitForTimeout(200);

    /* And what flipping it buys, so the live path is covered before it is live. */
    await p.evaluate(() => window.__DEF.setLive(true));
    await p.evaluate(() => window.__DEF.board());
    await p.waitForTimeout(200);
    /* THE NAME ON SCREEN IS "Defense"; the value in the database is still 'defense', which
       is a coincidence of this rename rather than a rule. The mode was called Lockdown when
       it was built and the stored enum never was: renaming a stored value to match a label
       would orphan every run already recorded under the old one, so the two are deliberately
       allowed to differ and this asserts both halves at once. */
    ok('live: the board offers Defense as its own competition',
      await p.evaluate(() => window.__DEF.comps()
        .some((o) => o.value === 'defense' && /Defense/.test(o.label))));
    ok('live: and choosing it asks the database for run_mode defense',
      await p.evaluate(() => window.__DEF.scopeFor('defense').mode) === 'defense',
      await p.evaluate(() => window.__DEF.scopeFor('defense')));

    /* ── A DEFENSE RUN CANNOT REACH THE OFFENSE BOARD ─────────────────────────
       The filtering is the database's, so the only thing the page can get wrong is the
       run_mode it asks for. Both directions are checked, because one filter being right
       says nothing about the other: the offense board asking for eq.free is what keeps a
       defense season off it, and the defense board asking for eq.defense is what stops it
       being ranked against six receivers. The URLs are read off a stubbed fetch, so these
       are the requests the page really builds rather than the scope object it intended. */
    const urlOff = await p.evaluate(() => window.__DEF.urlFor(''));
    const urlDef = await p.evaluate(() => window.__DEF.urlFor('defense'));
    ok('the offense board asks for run_mode=free, and never for defense',
      !!urlOff && /run_mode=eq\.free/.test(urlOff) && !/defense/.test(urlOff),
      urlOff && urlOff.replace(/^.*\/rest/, '').slice(0, 140));
    ok('the defense board asks for run_mode=defense, and never for free',
      !!urlDef && /run_mode=eq\.defense/.test(urlDef) && !/run_mode=eq\.free/.test(urlDef),
      urlDef && urlDef.replace(/^.*\/rest/, '').slice(0, 140));
    /* Every competition names one, so no board can ever be an unfiltered read of the table.
       That is the property that actually prevents the leak; the two above are instances. */
    const everyUrl = await p.evaluate(async () => {
      const out = {};
      for (const v of ['', 'defense', 'era:2010s', 'GB']) out[v] = await window.__DEF.urlFor(v);
      return out;
    });
    ok('every competition filters on a run_mode, so no board reads the table unfiltered',
      Object.values(everyUrl).every((u) => u && /run_mode=eq\.[a-z]+/.test(u)),
      Object.fromEntries(Object.entries(everyUrl)
        .map(([k, u]) => [k || 'offense', (String(u).match(/run_mode=eq\.[a-z]+/) || ['none'])[0]])));

    /* ── AND THE PICKER PUTS THE TWO SIDES TOGETHER ───────────────────────────
       They are one choice on the front page; a menu that lists Offense at the top and
       Defense three entries below it describes a different game. */
    const tree = await p.evaluate(() => window.__DEF.compTree());
    const ps = tree.find((x) => x.group === 'Perfect Season');
    ok('the picker leads with Perfect Season, holding Offense and Defense',
      !!ps && ps.options.length === 2
      && ps.options[0].v === '' && /Offense/.test(ps.options[0].t)
      && ps.options[1].v === 'defense' && /Defense/.test(ps.options[1].t),
      ps || tree.slice(0, 3));
    ok('and nothing in it still calls the offense board Classic Mode',
      !JSON.stringify(tree).includes('Classic'), tree.slice(0, 2));

    /* ── THE NAMES ON A DEFENSE ROW ───────────────────────────────────────────
       Every name on a board is resolved out of THIS browser's player data, and the
       defenders are a second data file that only starting a defense draft ever loaded. So
       the Defense board, read by somebody who had not played one, was a list of records
       with no players on it: "6 players" where two names belong, and a run detail sheet
       reading "This run's players are not in the player data this browser has" about
       players that are in it the moment anything asks. Reported off the live board.

       The row is injected rather than drafted, because the state under test is a page that
       has never opened a defense draft: drafting one loads the pool as a side effect and
       the bug disappears before the assertion can see it. Which is exactly why the suite
       never caught it: every check it made came after a draft.

       This block has to come BEFORE the draft below for the same reason. */
    ok('nothing has fetched the defensive pool yet, which is the state a reader is in',
      !(await p.evaluate(() => window.__DEF.pool())));
    {
      /* Six real defenders off the shipped file, as the pick keys a row carries. */
      const pool = JSON.parse(fs.readFileSync(`${ROOT}/football/data/defender_seasons.json`, 'utf8'));
      const picked = new Set();
      const wanted = ['DL', 'DL', 'LB', 'DB', 'DB', 'DB'];
      const six = wanted.map((pos) => pool.find((r) => r.position === pos
        && r.idp_ppg_mean > 10 && !picked.has(r.player_id + '|' + r.season)
        && (picked.add(r.player_id + '|' + r.season) || true)));
      const row = {
        id: 'test-row', created_at: new Date(0).toISOString(), wins: 18, losses: 3, games: 21,
        title_won: false, perfect: false, made_playoffs: true, seed_label: 'Wild card',
        playoff_wins: 3, point_diff: 120, chemistry_pct: 1.9, spend_musd: 138, respins: 0,
        team_rating: 90.5, squad_fppg: 51, structure_mult: 1.01, perfect_pct: 96,
        run_mode: 'defense', franchise: null, era: null, name: 'tester',
        picks: six.map((r) => r.player_id + ':' + r.season),
        slots: ['DL', 'DL', 'LB', 'DB', 'DB', 'FLEX'],
      };
      /* The sheet first, because it is the screenshot the report came with, and because the
         board below loads the pool and there is only one first time. */
      const before = await p.evaluate((r) => window.__DEF.detail(r), row);
      ok('the sheet opens on the first tap, with nothing to name yet',
        before.names.length === 0 && /not in the player data/.test(before.text),
        before.text.slice(0, 120));
      /* Caught rather than thrown: a page that never fetches the pool is the bug, and it
         should read as a failed assertion here and not as a suite that died. */
      const came = await p.waitForFunction(() => window.__DEF.pool(), null, { timeout: 30000 })
        .then(() => true).catch(() => false);
      ok('the sheet goes and gets the defenders by itself', came);
      await p.waitForTimeout(400);
      const after = await p.evaluate(() => window.__DEF.detailNow());
      ok('and once the defenders land the sheet names all six of them',
        after.names.length === 6, after.names);
      ok('and it no longer says the players are not in this browser',
        !/not in the player data/.test(after.text), after.text.slice(0, 120));
      ok('and the six it names are the six the row carries',
        six.every((m) => after.names.includes(m.name)),
        { drew: after.names, row: six.map((m) => m.name) });

      /* And the board itself, which is where the two names on each row come from. */
      const board = await p.evaluate((r) => window.__DEF.boardWith(r), row);
      ok('the Defense board names players on its rows rather than counting them',
        !/6 players/.test(board.rowText)
        && six.some((m) => board.rowText.includes(m.name.split(' ').slice(-1)[0])),
        board.rowText.slice(0, 160));
    }

    await p.evaluate(() => { window.__DEF.paintHome(); window.__DEF.intro(); });
    await p.waitForSelector('#s-intro.on', { timeout: 10000 });
    await p.waitForTimeout(300);
    ok('live: the front page offers it to everybody', await p.evaluate(() => {
      const h = window.__DEF.home(); return h.split && !h.single; }));
    await p.click('#b-start-def');
    await p.waitForSelector('#opts .tile', { timeout: 60000 });
    await p.waitForTimeout(300);
    ok('the roster spots are a defense',
      JSON.stringify(await p.evaluate(() => window.__DEF.slots())) === '["DL","DL","LB","DB","DB","FLEX"]',
      await p.evaluate(() => window.__DEF.slots()));
    ok('the tabs are defensive', await p.evaluate(() => {
      const t = window.__DEF.tabs().join(' ');
      return /DL/.test(t) && /LB/.test(t) && /DB/.test(t) && !/QB|WR/.test(t); }),
      await p.evaluate(() => window.__DEF.tabs()));

    /* ── EVERY GROUP KEEPS ITS OWN COLOR, AND EVERY ONE STAYS READABLE ────────
       An empty spot wears its group's color at low opacity, on four surfaces with four
       different grounds. Both halves are asserted because they pull against each other:
       fade the tint until it is comfortably legible and the three groups stop being
       distinguishable, saturate it until they are and the label stops carrying. */
    const tint = await p.evaluate(() => window.__DEF.tint());
    const worst = tint.reduce((a, t) => Math.min(a, t.ratio), 99);
    console.log(`  (${tint.length} tinted labels, worst ${worst}:1)`);
    ok('nothing tinted drops under the 4.5:1 its own label needs',
      tint.length > 0 && worst >= 4.5,
      tint.filter((t) => t.ratio < 4.5).slice(0, 6));
    /* The alpha differs by surface on purpose (a tab carries its color at full strength,
       a chip on grass at 95%), so the comparison is the hue and not the string. */
    const hueOf = (pfx) => [...new Set(tint.filter((t) => t.what.endsWith(' ' + pfx))
      .map((t) => (t.hue.match(/[\d.]+/g) || []).slice(0, 3).join(',')))];
    const groups = ['DL', 'LB', 'DB'].map((g) => hueOf(g));
    ok('and DL, LB and DB are three different colors, not one',
      groups.every((h) => h.length === 1)
      && new Set(groups.map((h) => h[0])).size === 3,
      { DL: groups[0], LB: groups[1], DB: groups[2] });
    /* The one spot with no group of its own stays neutral, which is the honest thing for
       the spot that has not decided what it is. */
    ok('and the flex is none of them',
      hueOf('FLEX').length === 1 && !groups.some((h) => h[0] === hueOf('FLEX')[0]),
      hueOf('FLEX'));

    /* ── THE DEFENSE OWNS ITS COLOURS ────────────────────────────────────────
       DL, LB and DB used to be the same three hexes as QB, TE and WR. Everything above
       still passed while that was true: they were distinct from each other, they were
       legible, and the field drew correctly. What they were not was the DEFENSE'S, and no
       assertion here could tell. This one can. */
    const pal = await p.evaluate(() => window.__DEF.palette());
    const offHexes = Object.values(pal.off);
    const clash = Object.entries(pal.def).filter(([, v]) => offHexes.includes(v));
    ok('no defensive colour is an offensive colour wearing a different name',
      clash.length === 0, { clash, off: pal.off, def: pal.def });
    ok('and the three of them are three, not two and a repeat',
      new Set(Object.values(pal.def)).size === 3, pal.def);
    /* FLEX is the one spot both modes share, so it is the one colour that must NOT have
       moved: same purple on an offense and on a defense. */
    ok('flex is untouched and is nobody else\'s colour',
      pal.flex === '#ba22f1'
      && !offHexes.includes(pal.flex) && !Object.values(pal.def).includes(pal.flex),
      { flex: pal.flex });
    /* The triples are handed to a canvas, which is the wrong place to discover that they
       drifted from the hexes beside them. */
    const hexToTriple = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)).join(' ');
    const drift = Object.entries(pal.def)
      .filter(([k, v]) => pal.triples[k] !== hexToTriple(v));
    ok('and each rgb triple still agrees with its own hex', drift.length === 0,
      { drift, triples: pal.triples });

    let spent = 0;
    for (let i = 0; i < 9; i++) {
      const done = await p.evaluate(() => ['s-squad', 's-season'].some((id) =>
        document.getElementById(id).classList.contains('on')));
      if (done) break;
      const ready = await p.waitForFunction(() => [...document.querySelectorAll('#opts .tile')]
        .some((x) => !x.disabled && !x.classList.contains('off') && !x.classList.contains('no')),
        null, { timeout: 30000 }).catch(() => null);
      if (!ready) break;
      const got = await p.evaluate(([sp, idx]) => {
        const live = [...document.querySelectorAll('#opts .tile')]
          .filter((x) => !x.disabled && !x.classList.contains('off') && !x.classList.contains('no'));
        const rows = live.map((t) => {
          const m = ((t.querySelector('.th') || {}).textContent || '').match(/\$([\d.]+)M/);
          return { t, cost: m ? parseFloat(m[1]) : 999,
            fppg: parseFloat((t.querySelector('.tf') || {}).textContent) || 0 };
        });
        const budget = 140 - sp - 3 * (5 - idx);
        const can = rows.filter((r) => r.cost <= budget);
        const from = can.length ? can : rows.slice().sort((a, b) => a.cost - b.cost).slice(0, 1);
        /* CHEAPEST AMONG EQUALS, and the second half of that is not tidiness.
           The board prints one decimal, so ties on the figure are common, and with no
           tie-break the winner was whichever tile the page happened to list first. That
           made this harness depend on the ORDER of a list it does not own: when the ALL
           tab changed from position order to price order the tie-break silently became
           'take the most expensive man with these points', six picks in a row, and the
           drafted team stopped reaching the postseason in eight attempts out of eight.
           Nothing about the game had got worse. Same points for less money is what a
           player would do anyway, so this is both the competent choice and a
           deterministic one. */
        from.sort((a, b) => b.fppg - a.fppg || a.cost - b.cost);
        from[0].t.click();
        return { cost: from[0].cost };
      }, [spent, i]);
      if (!got) break;
      spent += got.cost;
      await p.waitForTimeout(450);
      if (await p.evaluate(() => document.getElementById('sheet').classList.contains('on'))) {
        await p.evaluate(() => { const x = document.querySelector('.slotopt'); if (x) x.click(); });
        await p.waitForTimeout(450);
      }
    }
    const roster = await p.evaluate(() => window.__DEF.roster());
    ok('six defenders signed, inside the cap',
      roster.length === 6 && roster.every((r) => ['DL', 'LB', 'DB'].includes(r.pos))
      && roster.reduce((t, r) => t + r.price, 0) <= 140.01,
      { n: roster.length, spend: roster.reduce((t, r) => t + r.price, 0).toFixed(1) });

    /* ── THE FIELD ────────────────────────────────────────────────────────────
       The defense draft draws its own formation, and the thing that breaks a formation is not
       arithmetic, it is a label landing on somebody's face. Six defensive spots can hold
       exactly four shapes, so all four are checked at every width the game draws a field
       at, against the rendered pixels rather than against the table they came from.

       This is the assertion the offense's formation never had and had to be re-solved by
       hand twice because of it. */
    ok('the field is a defensive one: a line of scrimmage, and defensive spots',
      await p.evaluate(() => window.__DEF.los())
      && JSON.stringify(await p.evaluate(() => [...window.__DEF.vis()
        .querySelectorAll('.chip .dl')].map((d) => d.textContent)))
        .indexOf('QB') < 0);
    for (const W of [320, 390, 430, 900]) {
      await p.setViewportSize({ width: W, height: 844 });
      await p.waitForTimeout(200);
      for (const flex of ['DL', 'LB', 'DB']) {
        const key = await p.evaluate((f) => window.__DEF.setFlex(f), flex);
        await p.waitForTimeout(620);
        const r = await p.evaluate(() => window.__DEF.fieldProbe());
        ok(`@${W} the ${key} formation fits, with nothing drawn over a name`,
          !r.noField && !r.over.length && !r.outside.length && !r.discs.length,
          { over: r.over, outside: r.outside, discs: r.discs, field: r.field });
      }
    }
    /* The front is named only once the flex has decided the shape, which by now it has. */
    ok('and the front is named on the field',
      ['Heavy front', 'Base', 'Nickel'].includes(await p.evaluate(() => window.__DEF.frontName())),
      await p.evaluate(() => window.__DEF.frontName()));
    await p.setViewportSize({ width: 390, height: 844 });

    if (await p.evaluate(() => document.getElementById('s-squad').classList.contains('on'))) {
      await p.click('#b-play');
    }
    await p.waitForSelector('#s-season.on', { timeout: 30000 });
    await p.click('#b-sim');
    await p.waitForSelector('#s-seed.on,#s-over.on', { timeout: 120000 });
    const st = await p.evaluate(() => window.__DEF.state());
    ok('a full season plays', st.games === 17 && st.wins + st.losses === 17, st);

    /* THE RANK IS A CLAIM ABOUT A FIELD, so the sentence over it has to name the right one.
       It branched on run.franchise alone, so everything that was not One Franchise was told
       it had been placed "among every free run": for a defense season that is the one board
       it is certainly not on, printed directly above its actual placing. */
    const copy = await p.evaluate(() => window.__DEF.rankCopy());
    ok('the results screen ranks a defense run against Defense runs, not free ones',
      /Defense/.test(copy.against) && !/free/i.test(copy.against)
      && !/One Franchise/.test(copy.against), copy);
    ok('and it says the modes are kept apart', /own board/.test(copy.apart), copy);
    ok('and the run names itself Defense rather than a free run', copy.kind === 'Defense', copy);

    /* WALK IT TO THE END BEFORE READING THE WIRE, because a run that made the playoffs stops
       at seeding and has submitted nothing yet. The three assertions below read the submit
       body, so on a season good enough to be seeded they were reading an undefined request
       and failing: not a flaky mode, a flaky test, and one that only showed up when the
       drafted defense happened to be good. Measured across runs of this suite the same
       roster policy went 7-10 and then 12-5, and only the losing season passed. */
    /* DRIVEN BY THE REAL FAST-FORWARD CONTROLS, in preference to any button whose label
       happens to match. A 13-4 defense plays four playoff rounds, and each one is a bracket
       reveal AND a called game; walking that on a generic text match at 800ms a click ran
       out of iterations before the results screen, which came back as the three submit
       assertions below failing on a request that had never been made. Those two ids are the
       page's own skip controls and they end an animation outright. */
    for (let i = 0; i < 60; i++) {
      if (await p.evaluate(() => document.getElementById('s-over').classList.contains('on'))) break;
      const clicked = await p.evaluate(() => {
        const live = (id) => { const e = document.getElementById(id);
          return e && !e.disabled && e.offsetParent !== null ? e : null; };
        const fast = live('b-nbrk-fast') || live('b-po-fast') || live('b-po');
        if (fast) { fast.click(); return 'fast:' + fast.id; }
        const b2 = [...document.querySelectorAll('.screen.on button')]
          .find((x) => !x.disabled && /start|play|next|continue|see|results|skip|finish/i.test(x.textContent));
        if (b2) { b2.click(); return 'text:' + (b2.id || b2.textContent.trim()); }
        return null;
      });
      await p.waitForTimeout(clicked && clicked.startsWith('fast') ? 500 : 800);
    }
    ok('the run reaches its results screen',
      await p.evaluate(() => document.getElementById('s-over').classList.contains('on')));

    /* ── THE RUN HAS TO BE RECORDED AS THE GAME IT WAS ────────────────────────
       This is the assertion that would have saved the Trade Machine, and it is written
       here because the defense draft repeated the fault exactly. board.js decided the mode name at
       four separate call sites; a new mode had to be added to all four and was added to
       none, so a defense run went out as p_mode 'free' and landed on the open draft's
       board, ranked against a game it was not playing. Nothing threw and nothing looked
       wrong: a misfiled run is a valid row.

       So the check is on the wire and not on the intent. The page can believe it is in
       defense mode all day; what matters is the mode name in the request body and the
       run_mode in the board's query string. */
    const wire = await p.evaluate(() => window.__DEF.wire());
    const read = wire.find((w) => w.url && /ps_runs\?/.test(w.url));
    const wrote = wire.find((w) => w.url && /rpc\/ps_submit_run/.test(w.url));
    ok('the board asks the database for run_mode defense, and for nothing else',
      !!read && /run_mode=eq\.defense/.test(read.url) && !/run_mode=eq\.free/.test(read.url),
      read && read.url.replace(/^.*\/rest/, '').slice(0, 150));
    const sent = wrote && JSON.parse(wrote.body);
    ok('and the submit sends p_mode defense', !!sent && sent.p_mode === 'defense',
      sent && sent.p_mode);
    /* ps_submit_run checks the slot names against the mode, so an offensive lineup on a
       defense run is rejected outright. It was being sent: runPayload read E.SLOTS. */
    ok('with a defensive lineup, which is what the server checks them against',
      !!sent && Array.isArray(sent.p_slots) && sent.p_slots.length === 6
      && sent.p_slots.every((x) => ['DL', 'LB', 'DB', 'FLEX'].includes(x)),
      sent && sent.p_slots);
    /* And the fields that belong to other modes are not along for the ride. */
    ok('and no franchise, no era, no GM rating',
      !!sent && !sent.p_franchise && !sent.p_era && sent.p_gm_rating == null,
      sent && { fr: sent.p_franchise, era: sent.p_era, gm: sent.p_gm_rating });
    ok('and every game was resolved as a defense',
      st.defense === true && st.mode === 'defense' && st.label === 'Defense'
      && st.defMods.every((m) => m > 0 && m < 5), st);

    /* THE ONE ARTEFACT THAT LEAVES THE SITE. The card took its six row labels from E.SLOTS,
       the offense's list, so a defensive card printed six defenders under QB RB WR WR TE
       FLEX: the wrong word, on the graphic that travels furthest from the game that could
       explain it. It reads the run's own slots now, and this checks it draws from them. */
    /* The run was already walked to the end above, before the submit was read off the wire. */
    const card = await p.evaluate(() => window.__DEF.shareCard());
    ok('the share card draws, at 1080x1350, off the defensive slots',
      !!card && card.w === 1080 && card.h === 1350
      && card.slots === 'DL,DL,LB,DB,DB,FLEX' && card.bytes > 20000, card);

    /* ── AND THE BUTTON IS STILL A BUTTON AFTERWARDS ──────────────────────────
       Reported from the live build: play a defense run, come back to the front page, and
       the Defense half is sitting there spinning and unpressable. beginDefenseDraft
       disables it and spins it while the pool is fetched and only ever put it back on the
       FAILURE path; on success the draft screen replaced the front page a frame later, so
       nobody saw the state that was left behind until the run ended and they came home.
       The mode card this replaced could not show the fault, because modeMenu rebuilt the
       sheet's markup every time it opened. That is why this assertion did not exist and why
       the whole path has to be walked to reach it: a fresh page load looks perfect. */
    await p.evaluate(() => { const home = document.getElementById('b-again'); if (home) home.click(); });
    await p.waitForSelector('#s-intro.on', { timeout: 20000 });
    await p.waitForTimeout(400);
    const after = await p.evaluate(() => window.__DEF.home());
    ok('after a run, the front page comes back and Defense is pressable again',
      after.split && !after.defDisabled && !after.defLoading, after);
    await ctx.close();
  } finally {
    await b.close();
    if (fs.existsSync(PROBE)) fs.unlinkSync(PROBE);
  }
}

console.log(bad ? `\n${bad} FAILED` : '\nall good');
process.exit(bad ? 1 : 0);
