/* The badge catalog, against simulated careers.
 *
 *   node hoops/check-badges.mjs
 *   node hoops/check-badges.mjs --runs 600
 *
 * WHY THIS EXISTS. The first cut of badges.js asked for three things that
 * cannot happen in this game: six decorated players on one roster (the most
 * ever seen is four), a chemistry bonus of +2 (the most is 1.67), and missing
 * the playoffs with a rating of 80 (the best rating that has ever missed is
 * 64). None of that failed anything. The cabinet rendered, the squares stayed
 * dim, and the only symptom was three achievements nobody would ever earn,
 * which is not difficulty, it is content that does not exist.
 *
 * So the shape-of-one-run badges are asserted REACHABLE against real
 * simulated seasons, played SIX different ways so the check is not measuring
 * one strategy's blind spot. Two of those six exist only because the first four
 * had exactly that blind spot: nothing was chasing chemistry and nothing was
 * building under the cap, so two perfectly good badges looked unreachable. The volume badges (finish fifty runs, win five
 * titles, collect thirty clubs) are deliberately not asserted that way: they
 * are reachable by definition and a simulation long enough to prove it would
 * take longer than the suite deserves. What IS asserted about them is that
 * their counter moves, which is the way they would actually break.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const E = require(path.join(HERE, 'engine.js'));
const R = require(path.join(HERE, 'run.js'));
const B = require(path.join(HERE, 'badges.js'));
const M = require(path.join(HERE, 'modes.js'));

const read = (f) => JSON.parse(fs.readFileSync(path.join(HERE, 'data', f), 'utf8'));
const players = read('players.json');
E.setTeams(read('teams.json'));
E.setCuratedChemistry(read('chemistry.json'));
const data = R.indexData(players);

/* 900 AND NOT 400, and the number was found rather than picked. The rarest
   one-run badge is Moneyball, which a strategy deliberately building under
   $80M reaches about once in ninety attempts; a strategy that is not trying
   never reaches it at all. At 400 runs each strategy gets 67 tries and the
   check failed. At 900 it passes.
   THIS IS NOT A FLAKY TEST. The seeds are fixed and every run is deterministic,
   so the set either contains a Moneyball roster or it does not, the same way
   every time. If the data or the engine changes enough to move that, this
   failing is the correct outcome and the number to look at is the threshold in
   badges.js, not this one. */
const argRuns = (() => {
  const i = process.argv.indexOf('--runs');
  return i !== -1 ? Number(process.argv[i + 1]) || 900 : 900;
})();

let pass = 0;
const failures = [];
const ok = (cond, what) => { if (cond) pass++; else failures.push(what); };

/* ── playing a run, four ways ─────────────────────────────────────────────
 * One strategy is one shape of roster. Best-available never leaves money on
 * the table, cheapest never spends it, and neither of them would ever have
 * found out whether a badge about a $70M roster is reachable. */
const STRATEGIES = {
  'best available': (o) => o.slice().sort((a, b) => b.w - a.w)[0],
  cheapest: (o) => o.slice().sort((a, b) => a.p - b.p)[0],
  'best value': (o) => o.slice().sort((a, b) => (b.w / Math.max(2, b.p)) - (a.w / Math.max(2, a.p)))[0],
  'most decorated': (o) => o.slice().sort((a, b) =>
    ((b.aw || []).length - (a.aw || []).length) || (b.w - a.w))[0],

  /* THESE TWO EXIST BECAUSE THE FIRST FOUR HAD A BLIND SPOT, and it looked
     exactly like a broken badge. Neither "field a roster worth +1.5 chemistry"
     nor "win 50 games under $80M" was reachable across 400 runs, and the honest
     reading was not that the thresholds were too hard: it was that no strategy
     here was TRYING to do either thing, and a person would. A bot that always
     signs the best man on the board will never deliberately reunite two
     team-mates, and one that never looks at the cap will never build cheap.
     Adding the strategies a player would use is the fix; loosening a threshold
     to suit a bot would have made the badge easier for everybody to hide a gap
     in this file. */
  'chemistry hunter': (o, run) => o.slice().sort((a, b) =>
    (R.previewSigning(run, b).delta - R.previewSigning(run, a).delta) || (b.w - a.w))[0],
  'spread the cap': (o, run) => {
    const share = R.remaining(run) / Math.max(1, R.slotsLeft(run));
    const within = o.filter((p) => p.p <= share * 1.15);
    return (within.length ? within : o).slice().sort((a, b) => b.w - a.w)[0];
  },
  /* Deliberately building UNDER the cap rather than to it, which is the only
     way the cheap-roster badges are ever reached and something no other
     strategy here does. Targets $80M of the $134M. */
  'build cheap': (o, run) => {
    const spent = E.CONSTANTS.CAP_MUSD - R.remaining(run);
    const share = Math.max(2, (80 - spent) / Math.max(1, R.slotsLeft(run)));
    const within = o.filter((p) => p.p <= share * 1.25);
    return (within.length ? within : o).slice().sort((a, b) => b.w - a.w)[0];
  },
};

function playRun(seed, pick) {
  const run = R.createRun({ seed });
  let guard = 0;
  while (run.phase === R.PHASES.DRAFT && guard++ < 50) {
    const draw = R.spin(run, data);
    const options = draw.options.map((k) => data.allPlayers[k]).filter(Boolean);
    if (!options.length) return null;
    R.sign(run, pick(options, run));
  }
  if (run.roster.length < E.SLOTS.length) return null;
  R.playSeason(run);
  return run;
}

/* The row index.html writes. Kept here as one function so the check and the
   page cannot disagree about what a row means; if this drifts from the
   recorder, the badges are being tested against a shape the game never
   produces. check-badges asserts the field names against the page below. */
function rowOf(run) {
  const out = run.outcome;
  const last = (run.playoffs && run.playoffs.rounds.length)
    ? run.playoffs.rounds[run.playoffs.rounds.length - 1] : null;
  const awards = {};
  let decorated = 0, top = 0, pairs = 0;
  for (let a = 0; a < run.roster.length; a++) {
    const p = run.roster[a];
    if (p.p > top) top = p.p;
    const aw = p.aw || [];
    if (aw.length) decorated++;
    for (const k of aw) awards[k] = 1;
    for (let b = a + 1; b < run.roster.length; b++) {
      if (run.roster[b].t === p.t && run.roster[b].s === p.s) pairs++;
    }
  }
  return {
    w: out.wins, l: out.losses, ring: !!out.titleWon,
    /* The page's madePlayoffs(): a play-in loss is not the playoffs. */
    po: !!(run.playoffs && run.playoffs.rounds.length
      && (run.playoffs.rounds[0].round !== 'Play-In' || run.playoffs.rounds[0].won)),
    rating: Math.round(out.rating),
    chem: out.chemistry && typeof out.chemistry.bonus === 'number'
      ? Math.round(out.chemistry.bonus * 100) / 100 : 0,
    spend: Math.round((E.CONSTANTS.CAP_MUSD - R.remaining(run)) * 10) / 10,
    left: Math.round(R.remaining(run) * 10) / 10,
    top: Math.round(top * 10) / 10,
    pairs,
    aw: Object.keys(awards),
    decorated,
    swept: !!(last && !last.won && last.oppWins === 4 && last.yourWins === 0),
    lostFinals: !!(last && !last.won && last.round === 'NBA Finals'),
  };
}

/* ── one long career, played every way ───────────────────────────────────── */
const career = {
  version: 1, runs: 0, rings: 0, playoffs: 0, bestWins: 0, bestRating: 0,
  totalWins: 0, totalLosses: 0, clubs: {}, shapes: {}, beat72: 0,
  seasons: {}, colleges: {}, rows: [], feats: {},
};
/* Seeds per shape bot for the system sweep below. 110 puts the rarest system
   (the Death Lineup, which wants a roster with no rebounder, real spacing,
   real hands and real volume from the arc) at single figures out of about a
   thousand, which is rare rather than absent. Drafts only, so it is seconds.
   --quick cuts it the way it cuts the badge sweep. */
const SYSTEM_DRAFTS = argRuns < 900 ? 55 : 110;

const names = Object.keys(STRATEGIES);
let played = 0;
for (let i = 0; i < argRuns; i++) {
  const run = playRun(70000 + i, STRATEGIES[names[i % names.length]]);
  if (!run) continue;
  played++;
  const out = run.outcome;
  career.runs++;
  career.totalWins += out.wins;
  career.totalLosses += out.losses;
  if (out.titleWon) career.rings++;
  if (out.beatRecord) career.beat72++;
  if (rowOf(run).po) career.playoffs++;
  if (out.wins > career.bestWins) career.bestWins = out.wins;
  if (out.rating > career.bestRating) career.bestRating = out.rating;
  const shape = out.structure && out.structure.archetype ? out.structure.archetype.name : null;
  if (shape) career.shapes[shape] = (career.shapes[shape] || 0) + 1;
  for (const p of run.roster) {
    career.clubs[E.teamName(p.t)] = (career.clubs[E.teamName(p.t)] || 0) + 1;
    career.seasons[p.s] = (career.seasons[p.s] || 0) + 1;
    if (p.col) career.colleges[p.col] = (career.colleges[p.col] || 0) + 1;
  }
  career.rows.push(rowOf(run));
  B.applyFeats(career, B.draftFeats(run));
}
ok(played > argRuns * 0.9, `enough runs completed to judge on (${played} of ${argRuns})`);


/* ── THE REST OF THE CABINET IS PLAYED FOR, NOT ASSUMED ─────────────────────
 *
 * The sweep above plays the league the way somebody who has never read the
 * cabinet plays it. Most of the catalog is a goal somebody CHASES: three named
 * men on one roster, a man who averaged 35, a ring with one club, a Conquest
 * ladder cleared. So each gets the bot a person chasing it would be, and every
 * feat those bots produce lands on the same career. A badge still dark after
 * all of it is named below, unless it is on the excuse list with a reason and
 * a proof.
 *
 * Everything here runs through the same draftFeats, conquestFeats, fixFeats
 * and passesFeats the page calls, so a rule is never restated in this file. */
setTotalsFromData();
function setTotalsFromData() {
  const mvps = new Set(players.filter((p) => (p.aw || []).includes('mvp')).map((p) => p.s));
  B.setTotals({ mvps: mvps.size, franchises: E.franchises().length,
    seasons: new Set(data.teamSeasons.map((t) => t.season)).size,
    clubs: new Set(data.teamSeasons.map((t) => t.team)).size, shapes: E.SYSTEMS.length });
}
const QUICK = argRuns < 900;
const feat = (f) => B.applyFeats(career, f);
const opts = (run, d) => d.options.map((k) => data.allPlayers[k]).filter(Boolean);
const cheapest = (o) => o.slice().sort((a, b) => a.p - b.p)[0];

/* Draft only: a roster feat needs no season. `want(p)` marks a man worth
   hunting, and the bot re-spins while none is on the board, the way a person
   hunting him would. */
function hunt(runOpts, want, fallback) {
  const run = R.createRun(runOpts);
  let g = 0;
  while (run.phase === R.PHASES.DRAFT && g++ < 60) {
    let d = R.spin(run, data), o = opts(run, d), t = o.filter(want);
    while (!t.length && R.canRespin(run)) {
      try { d = R.respin(run, data); } catch (e) { break; }
      o = opts(run, d); t = o.filter(want);
    }
    if (!o.length) return null;
    const pick = t.length ? t.slice().sort((a, b) => a.p - b.p)[0] : (fallback || cheapest)(o, run);
    try { R.sign(run, pick); } catch (e) { try { R.sign(run, cheapest(o)); } catch (e2) { return null; } }
  }
  return run.roster.length === E.SLOTS.length ? run : null;
}

/* THE REUNIONS, one club each, hunted in One Franchise. The rarest took 2
   drafts in 100 when this was written, so each gets up to 150. */
const reunionTries = {};
for (const [key, club, ids] of B.REUNIONS) {
  let tries = 0;
  for (let i = 0; i < 150; i++) {
    tries++;
    const run = hunt({ seed: 81000 + i * 7 + key.length, club }, (p) => ids.includes(p.i));
    const f = run ? B.draftFeats(run) : null;
    if (f && f.add['re:' + key]) { feat(f); break; }
  }
  reunionTries[key] = tries;
}

/* THE STAT LINES AND THE FAMOUS NAMES. A hunter for each, league and locked. */
const statHunts = [
  (p) => p.pts >= 35, (p) => p.pts >= 30, (p) => p.ast >= 12, (p) => p.reb >= 15,
  (p) => p.blk >= 3.5, (p) => p.stl >= 3, (p) => p.pts >= 10 && p.reb >= 10 && p.ast >= 10,
  (p) => (p.aw || []).length > 0, (p) => (p.aw || []).includes('mvp'), (p) => (p.aw || []).includes('fmvp'),
  (p) => p.pts >= 20, (p) => (p.tpa || 0) < 0.5, (p) => (p.tpa || 0) >= 7,
  (p) => p.dr && p.s === p.dr + 1, (p) => p.dr && p.s - p.dr >= 12, (p) => p.p >= 55,
];
const eras = Object.keys(E.ERAS);
const clubs = E.franchises().map((f) => f.code);
const HUNT_RUNS = QUICK ? 30 : 60;
statHunts.forEach((want, h) => {
  for (let i = 0; i < HUNT_RUNS; i++) {
    const o = { seed: 83000 + h * 1000 + i };
    if (i % 3 === 1) o.club = clubs[(h + i) % clubs.length];
    if (i % 3 === 2) o.era = eras[(h + i) % eras.length];
    const run = hunt(o, want);
    if (run) feat(B.draftFeats(run));
  }
});
/* The named collections: every Dream Teamer and every class, hunted by id.
   A career collection, so each man only has to be signed once. */
for (const id of new Set([...B.DREAM_TEAM, ...B.CLASSES.flatMap((c) => c[1])])) {
  const homes = [...new Set(players.filter((p) => p.i === id).map((p) => p.t))];
  for (let i = 0; i < 40; i++) {
    const club = E.franchises().find((f) => f.codes.includes(homes[i % homes.length]));
    const run = hunt({ seed: 85000 + i, club: club ? club.code : null }, (p) => p.i === id);
    if (run && run.roster.some((p) => p.i === id)) { feat(B.draftFeats(run)); break; }
  }
}
/* Five decades on one roster, three from one college, three from one class:
   a person chasing one of those drafts for it. */
{
  const chase = (key, pick) => {
    for (let i = 0; i < 200; i++) {
      const run = hunt({ seed: 87000 + i + key.length * 1000 }, () => false, pick);
      if (!run) continue;
      const f = B.draftFeats(run);
      if (f.add[key]) { feat(f); return; }
    }
  };
  const decadeOf = (p) => Math.floor(p.s / 10);
  chase('st.decades5', (o, run) => o.slice().sort((a, b) =>
    (run.roster.some((x) => decadeOf(x) === decadeOf(a)) ? 1 : 0)
    - (run.roster.some((x) => decadeOf(x) === decadeOf(b)) ? 1 : 0) || a.p - b.p)[0]);
  const byMost = (field) => (o, run) => {
    const seen = {};
    for (const x of run.roster) if (x[field]) seen[x[field]] = (seen[x[field]] || 0) + 1;
    return o.slice().sort((a, b) => (seen[b[field]] || 0) - (seen[a[field]] || 0) || a.p - b.p)[0];
  };
  chase('st.col3', byMost('col'));
  chase('st.class3', byMost('dr'));
}

/* RINGS IN THE LOCKED MODES AND ON THE DAILY. A title is the rare half, so
   these play a whole season with the strongest bot here. */
{
  const spread = STRATEGIES['spread the cap'];
  const TITLE_RUNS = QUICK ? 240 : 600;
  for (let i = 0; i < TITLE_RUNS; i++) {
    const o = { seed: 88000 + i };
    if (i % 3 === 0) o.club = clubs[i % clubs.length];
    else if (i % 3 === 1) o.era = eras[i % eras.length];
    else o.daily = 1 + i;
    const run = playRunWith(o, spread);
    if (run) feat(B.draftFeats(run));
  }
}
function playRunWith(o, pick) {
  const run = R.createRun(o);
  let guard = 0;
  while (run.phase === R.PHASES.DRAFT && guard++ < 50) {
    const d = R.spin(run, data), op = opts(run, d);
    if (!op.length) return null;
    R.sign(run, pick(op, run));
  }
  if (run.roster.length < E.SLOTS.length) return null;
  R.playSeason(run);
  return run;
}

/* CONQUEST, played the way check-modes plays it: the best legal steal after
   every win. Plus a crew that never steals, which is the only way to be loyal
   to it. */
{
  const smart = (st) => {
    let b = null;
    for (const x of M.cqSteals(st, data)) if (x.delta > 0 && (!b || x.rating > b.rating)) b = x;
    return b;
  };
  const mvpThief = (st) => {
    const all = M.cqSteals(st, data);
    return all.find((x) => (data.allPlayers[x.take].aw || []).includes('mvp')) || smart(st);
  };
  const bots = [smart, () => null, mvpThief];
  const CQ_RUNS = QUICK ? 60 : 150;
  for (let i = 0; i < CQ_RUNS; i++) {
    const st = M.cqCreate(data, 'badge' + i);
    const bot = bots[i % bots.length];
    let g = 0;
    while (!st.lost && g++ < 120) {
      M.cqPlay(st, data);
      if (st.pending) { const x = bot(st); M.cqSteal(st, data, x ? x.take : null, x ? x.slot : null); }
      feat(B.conquestFeats(st, M.CQ.RUNGS, (k) => data.allPlayers[k], false));
    }
    feat(B.conquestFeats(st, M.CQ.RUNGS, (k) => data.allPlayers[k], true));
  }
}

/* FIX HISTORY. A value trader, a trader who deals in every window, and one
   who packages three men and his picks for one. The odds are read over 200
   seasons rather than the page's thousand: this asks what is reachable, not
   what a score is worth. */
{
  const wsJ = (fv) => fv ? fv.reduce((x, p) => x + p.w, 0) : 0;
  const finish = (st, day, streak) => {
    const f = M.fxDaily(data, day);
    const odds = M.fxSeasonOddsStep(data, st, 0, 200).titles / 200;
    const base = M.fxOddsStep(data, f.five, day, 0, 200).titles / 200;
    const rep = M.fxSeasonReplay(data, st);
    feat(B.fixFeats({ odds, base, trades: st.trades,
      replay: { w: rep.wins, l: rep.losses, title: !!rep.titleWon } }, streak));
  };
  const valueBot = (st, always) => {
    const ros = M.fxRosterAt(data, st, st.win), v0 = wsJ(M.fxLineup(ros));
    let best = null;
    for (const p of ros) for (const o of M.fxCalls(data, st, [E.pkey(p)], [])) {
      const t = { ...st, trades: st.trades.concat([{ w: st.win, with: o.with, outs: [E.pkey(p)], ins: o.ins, picks: [] }]) };
      const v = wsJ(M.fxLineup(M.fxRosterAt(data, t, st.win)));
      if (!best || v > best.v) best = { v, out: E.pkey(p), o };
    }
    if (best && (always || best.v > v0 * 1.02)) M.fxDeal(data, st, [best.out], [], best.o.with, best.o.ins);
  };
  const packBot = (st) => {
    const ros = M.fxRosterAt(data, st, st.win).slice().sort((a, b) => a.p - b.p);
    const outs = ros.slice(0, 3).map(E.pkey), picks = M.fxPicksLeft(st);
    for (const o of M.fxCalls(data, st, outs, picks)) {
      if (o.ins.length !== 1) continue;
      try { M.fxDeal(data, st, outs, picks, o.with, o.ins); return; } catch (e) { /* next */ }
    }
  };
  /* THE NEGOTIATOR is the one that reaches the big odds, because the offers
     that ring are a club's best FAIR package and a real jump needs asking for
     a man. It asks the best non-franchise players that season for one of its
     own plus its picks, takes a yes or a counter, and only when the five gets
     better. Measured before shipping: the 2025 Nuggets went from 11% to 56%. */
  const talker = (st, myTs) => {
    const season = +myTs.slice(-4);
    const ros = M.fxRosterAt(data, st, st.win), v0 = wsJ(M.fxLineup(ros));
    const gain = (outs, picks, ts, ins) => wsJ(M.fxLineup(M.fxRosterAt(data,
      { ...st, trades: st.trades.concat([{ w: st.win, with: ts, outs, ins, picks }]) }, st.win))) - v0;
    const targets = [];
    for (const t of data.teamSeasons) {
      if (t.season !== season || t.team_season_id === myTs) continue;
      const un = M.untouchable(data, t.team_season_id);
      for (const p of (data.byTeamSeason[t.team_season_id] || [])) {
        const k = E.pkey(p);
        if (k !== un && p.t !== 'TOT') targets.push({ ts: t.team_season_id, p, k });
      }
    }
    targets.sort((a, b) => b.p.w - a.p.w);
    const byPrice = ros.slice().sort((a, b) => b.p - a.p);
    for (const t of targets.slice(0, 25)) {
      for (const out of byPrice) {
        if (M.fxHungUp(st, t.ts)) break;
        const outs = [E.pkey(out)];
        if (gain(outs, [], t.ts, [t.k]) <= 1) continue;
        const picks = M.fxPicksLeft(st).slice(0, 3);
        const r = M.fxPropose(data, st, t.ts, outs, picks, [t.k]);
        const deal = r.verdict === 'yes' ? { o: outs, p: picks } : r.verdict === 'counter' ? { o: r.outs, p: r.picks } : null;
        if (deal && gain(deal.o, deal.p, t.ts, [t.k]) > 1) {
          try { M.fxDeal(data, st, deal.o, deal.p, t.ts, [t.k]); return; } catch (e) { /* next */ }
        }
      }
    }
  };
  const playDay = (d, streak, move) => {
    const st = M.fxSeasonCreate(data, d), ts = M.fxDaily(data, d).ts;
    while (!st.done) { if (move) move(st, ts); M.fxNextWindow(st); }
    finish(st, d, streak);
  };
  /* A week of days in a row, the way somebody playing every morning would. */
  const RUN = QUICK ? 3 : 7;
  for (let d = 1; d <= RUN; d++) playDay(d, d, d % 2 ? talker : (st) => valueBot(st, true));
  playDay(20, 1, talker);
  playDay(11, 1, null);                    // stood pat: the 2009 Celtics win it as built
  playDay(2, 1, packBot);
  playDay(5, 1, packBot);
}

/* SIX PASSES. A solver that finds the shortest chain, and one that takes the
   long way round and scores on the last pass of the shot clock. */
{
  const g = M.psGraph(data);
  const PS_DAYS = QUICK ? 60 : 140;
  let streak = 0;
  for (let d = 1; d <= PS_DAYS; d++) {
    const pz = M.psDaily(g, d);
    if (!pz) { streak = 0; continue; }
    let chain;
    if (d % 4 === 0) chain = longWay(g, pz, M.PS.CLOCK);
    if (!chain) chain = M.psPath(g, pz.from, pz.to);
    const solved = !!chain && chain[chain.length - 1] === pz.to;
    streak = solved ? streak + 1 : 0;
    feat(B.passesFeats(solved, chain ? chain.length - 1 : M.PS.CLOCK, pz.par, M.PS.CLOCK, streak));
  }
}
/* Exactly `clock` passes, never passing to the same man twice, finishing on
   the target. A walk that keeps the target within reach of what is left. */
function longWay(g, pz, clock) {
  const dist = M.psBfs(g, pz.to);
  const chain = [pz.from];
  const seen = new Set(chain);
  const walk = () => {
    const left = clock - (chain.length - 1);
    const at = chain[chain.length - 1];
    if (left === 0) return at === pz.to;
    for (const v of (g.adj[at] || []).slice(0, 60)) {
      if (seen.has(v) || dist[v] == null || dist[v] > left - 1) continue;
      if (v === pz.to && left !== 1) continue;
      chain.push(v); seen.add(v);
      if (walk()) return true;
      chain.pop(); seen.delete(v);
    }
    return false;
  };
  return walk() ? chain.slice() : null;
}

/* ── EVERY BADGE IS EITHER LIT OR EXCUSED, AND AN EXCUSE CARRIES A PROOF ────
 *
 * Three honest reasons a badge can stay dark after all of the above, and each
 * has to show its working rather than just being written down:
 *
 *   grind  a bigger count of something the sweep DID produce. The proof is
 *          that the count moved, so the badge is time and not luck.
 *   page   written by the page itself (a daily streak, a negotiated deal),
 *          which no bot here drives. The proof is that the page writes the key.
 *   skill  a feat these bots are not good enough for. The proof is a run built
 *          by hand that lights it through the real rule, so the rule is not
 *          dead code, plus a measurement in the comment.
 *
 * A badge dark and not on this list fails the file. A badge ON the list that
 * lit anyway fails it too, so the list cannot rot into a blanket. */
const pageSrc = fs.readFileSync(path.join(HERE, 'index.html'), 'utf8')
  + fs.readFileSync(path.join(HERE, 'modes-ui.js'), 'utf8');
const writes = (key) => pageSrc.includes("'" + key + "'");
const moved = (key) => Object.keys(career.feats).some((k) => k.indexOf(key) === 0 && career.feats[k] > 0);
const lights = (id, run) => {
  const c = { version: 1, feats: {} };
  B.applyFeats(c, B.draftFeats(run));
  return B.earned(c).some((b) => b.id === id);
};
/* A hand-built run for the skill proofs: the roster matters to none of them. */
const fakeRun = (over) => ({ roster: [], outcome: { wins: 60, losses: 22, titleWon: true, totalPF: 0, totalPA: 0 },
  season: [], schedule: [], ...over });
const round = (name, games) => ({ round: name, won: games.filter((g) => g.won).length === 4
  || (name === 'Play-In' && games[0].won),
  yourWins: games.filter((g) => g.won).length, oppWins: games.filter((g) => !g.won).length, games });
const W = { won: true }, L = { won: false };
const EXCUSED = {
  /* Volume. */
  'five-rings': ['grind', () => career.rings > 0],
  'clubs-45': ['grind', () => Object.keys(career.clubs).length > 0],
  'mvps-all': ['grind', () => moved('mvp:')],
  'fring-5': ['grind', () => moved('fring:')],
  'fring-15': ['grind', () => moved('fring:')],
  'fring-all': ['grind', () => moved('fring:')],
  'ering-all': ['grind', () => moved('ering:')],
  'fx-30': ['grind', () => moved('fx.days')],
  'fx-title10': ['grind', () => moved('fx.title')],
  /* The page writes these. */
  'daily-3': ['page', () => writes('daily.streak')],
  'daily-7': ['page', () => writes('daily.streak')],
  'daily-30': ['page', () => writes('daily.streak')],
  'fx-talk': ['page', () => writes('fx.talk')],
  /* The live board. A person plays these games; no bot here does. */
  'g7live': ['skill', () => lights('g7live', fakeRun({ playoffs: { won: true, rounds: [
    round('First Round', [W, W, W, L, L, L, { won: true, live: true }])] } }))],
  'livering': ['skill', () => lights('livering', fakeRun({ playoffs: { won: true, rounds: [
    round('NBA Finals', [W, W, { won: true, live: true }, W])] } }))],
  /* Titles with a condition on top. Measured before shipping over 1,500 runs
     of the cap-spreading bot: 2 titles lost one playoff game, 1 title came out
     of the play-in, 2 Finals were sweeps. A drafter reaching 60 wins does
     better than that bot, which medians 43. */
  'fofofo': ['skill', () => lights('fofofo', fakeRun({ playoffs: { won: true, rounds: [
    round('First Round', [W, W, W, W]), round('Conference Semifinals', [W, W, W, W]),
    round('Conference Finals', [W, L, W, W, W]), round('NBA Finals', [W, W, W, W])] } }))],
  'w70': ['skill', () => B.earned({ bestWins: 70 }).some((b) => b.id === 'w70') && career.bestWins >= 60],
  'record': ['skill', () => career.bestWins >= 60],
  'cq-flawless': ['skill', () => moved('cq.best')],
  'fx-miracle': ['skill', () => moved('fx.gain')],
};

/* A key a badge reads that nothing writes is a badge nobody can earn. Every
   key the sweeps produced is a key something writes; for the rest, the page
   has to write it. */
{
  const src = fs.readFileSync(path.join(HERE, 'badges.js'), 'utf8');
  const read = [...src.matchAll(/has\('([^']+)'/g)].map((m) => m[1]);
  const produced = (k) => career.feats[k] > 0 || writes(k) || (k.endsWith(':') && moved(k))
    || /* a draftFeats key whose run is excused above */ src.includes("one('" + k + "')")
    || src.includes("'" + k + "'] = ") || src.includes("m('" + k + "'");
  const orphan = [...new Set(read)].filter((k) => !produced(k));
  ok(orphan.length === 0, `every feat a badge reads is written somewhere${orphan.length ? ` (nothing writes ${orphan.join(', ')})` : ''}`);
}

/* The lists a fan knows are Basketball-Reference ids, and a typo is a badge
   nobody can ever earn. */
{
  const ids = new Set(players.map((p) => p.i));
  const named = [...B.DREAM_TEAM, ...B.CLASSES.flatMap((c) => c[1]), ...B.REUNIONS.flatMap((r) => r[2])];
  const missing = named.filter((i) => !ids.has(i));
  ok(missing.length === 0, `every named man is in the data${missing.length ? ` (missing ${missing.join(', ')})` : ''}`);
  const bad = B.REUNIONS.filter(([, club, list]) => {
    const codes = (E.franchises().find((f) => f.code === club) || { codes: [] }).codes;
    return !list.every((i) => players.some((p) => p.i === i && codes.includes(p.t)));
  }).map((r) => r[0]);
  ok(bad.length === 0, `every reunion's men all played for its club${bad.length ? ` (${bad.join(', ')})` : ''}`);
}

const got = new Set(B.earned(career).map((b) => b.id));
const all = B.evaluate(career);

/* Every badge lit, or excused with a proof. */
{
  /* THE FULL SWEEP IS THE STRICT ONE, and it is what CI runs. A shorter
     --runs sweep reaches less, so there a dark badge is printed rather than
     failed: the excuse list is a record of what the full sweep reaches, and
     it can only be tuned to one sweep. */
  const dark = all.filter((b) => !b.got && !EXCUSED[b.id]).map((b) => b.id);
  if (QUICK && dark.length) console.log(`  (short sweep) not reached here: ${dark.join(', ')}`);
  ok(QUICK || dark.length === 0, `every badge is reached or excused${dark.length
    ? `\n      never earned: ${dark.join(', ')}\n`
      + '      Either no bot above chases it, so add the one a person would be,\n'
      + '      or it cannot happen, so change what it asks. Never move a number to suit a bot.'
    : ''}`);
  const stale = Object.keys(EXCUSED).filter((id) => got.has(id));
  ok(QUICK || stale.length === 0, `no excuse is for a badge that lit anyway${stale.length ? ` (${stale.join(', ')})` : ''}`);
  const unknown = Object.keys(EXCUSED).filter((id) => !all.some((b) => b.id === id));
  ok(unknown.length === 0, `every excuse names a real badge${unknown.length ? ` (${unknown.join(', ')})` : ''}`);
  const unproved = Object.keys(EXCUSED).filter((id) => !got.has(id) && !EXCUSED[id][1]());
  ok(unproved.length === 0, `every excuse carries a proof that holds${unproved.length ? ` (${unproved.join(', ')})` : ''}`);
  ok(Object.values(EXCUSED).every((e) => ['grind', 'page', 'skill'].includes(e[0])), 'every excuse has a known reason');
  const groups = new Set(B.GROUPS.map((x) => x[0]));
  ok(all.every((b) => groups.has(b.g)), 'every badge sits on a shelf the cabinet draws');
  ok(B.GROUPS.every(([g]) => all.some((b) => b.g === g)), 'every shelf has a badge on it');
  if (process.argv.includes('--reunions')) console.log('  reunion drafts needed:', JSON.stringify(reunionTries));
}


/* ── every badge about ONE RUN has to be reachable ───────────────────────── */
const SHAPE_BADGES = ['playoffs', 'spend-it', 'chemistry', 'reunion', 'mvp',
  'all-decorated', 'no-hardware', 'swept', 'flop', 'lost-finals', 'sixty',
  'thrift', 'cheap-ring', 'ring'];
const unreachable = SHAPE_BADGES.filter((id) => !got.has(id));
ok(unreachable.length === 0,
  `every one-run badge is reachable${unreachable.length
    ? `\n      never earned across ${played} runs: ${unreachable.join(', ')}\n`
      + '      A badge nobody can earn is not a hard badge. Loosen the threshold in\n'
      + '      badges.js until this passes, and put the measured number in the comment.'
    : ''}`);

/* ── AND EVERY SYSTEM HAS TO BE REACHABLE TOO ────────────────────────────
 *
 * This file exists because a badge nobody can earn throws no error and breaks
 * no test. A SYSTEM nobody can be named is the same thing wearing a different
 * coat, and there was no guard for it, so two of the fourteen shipped dead:
 *
 *   Twin Towers      fired on 175 of 800 drafts when the roster was six men
 *                    and on 0 of 800 at five, because it asked for two men
 *                    ELIGIBLE AT CENTRE and a starting five has one centre
 *                    slot. Killed by the roster change, reported by nobody.
 *   The Death Lineup asked for no man whose position is centre, which the
 *                    centre slot makes impossible. Dead at six men as well,
 *                    so it had never once been named.
 *
 * Both were found by a player saying you can still go big or small with a
 * starting five, which is true, and which the game had quietly stopped being
 * able to say.
 *
 * IT DRAFTS AND DOES NOT PLAY, which is why it can afford its own bots. A
 * system is a property of the roster, so no season has to be simulated: a
 * thousand drafts here cost a fraction of the sweep above. And it needs its
 * own bots, because the seven strategies above are all about MONEY and a
 * system is about shape: not one of them would ever chase threes, steals or
 * the glass, and four of the fourteen are unreachable to all seven. That is
 * the badge sweep's own lesson, which added two strategies rather than
 * loosening two thresholds.
 *
 * A SYSTEM REPORTED UNREACHED IS THE SAME QUESTION A BADGE REPORTED UNREACHED
 * IS. Either the roster cannot produce it, in which case rewrite what it
 * tests, or no bot here is trying, in which case add the one a player would
 * use. Never move a threshold to suit a bot.
 *
 * FIRST MATCH WINS in detectSystem, so a rung can also be reachable and always
 * shadowed by a looser one above it. That is what the counts are printed for,
 * and it is what sent Twin Towers above Pick and Roll. */
{
  const pa = (v, s) => E.paceAdjust(v || 0, s);
  const SHAPES = {
    'best available': (o) => o.slice().sort((a, b) => b.w - a.w)[0],
    cheapest: (o) => o.slice().sort((a, b) => a.p - b.p)[0],
    'the glass': (o) => o.slice().sort((a, b) => pa(b.reb, b.s) - pa(a.reb, a.s))[0],
    shooters: (o) => o.slice().sort((a, b) => pa(b.tpa, b.s) - pa(a.tpa, a.s))[0],
    'ball hogs': (o) => o.slice().sort((a, b) => pa(b.fga, b.s) - pa(a.fga, a.s))[0],
    passers: (o) => o.slice().sort((a, b) => pa(b.ast, b.s) - pa(a.ast, a.s))[0],
    hands: (o) => o.slice().sort((a, b) => pa(b.stl, b.s) - pa(a.stl, a.s))[0],
    'the post': (o) => o.slice().sort((a, b) => pa(b.pts, b.s) - pa(a.pts, a.s))[0],
    spacing: (o) => o.slice().sort((a, b) => E.spacingIndex(b) - E.spacingIndex(a))[0],
  };
  const shapeNames = Object.keys(SHAPES);
  const seen = new Map();
  let drafted = 0;
  for (let i = 0; i < SYSTEM_DRAFTS * shapeNames.length; i++) {
    const pick = SHAPES[shapeNames[i % shapeNames.length]];
    const run = R.createRun({ seed: 90000 + i });
    let guard = 0, fine = true;
    try {
      while (run.phase === R.PHASES.DRAFT && guard++ < 50) {
        const draw = R.spin(run, data);
        const options = draw.options.map((k) => data.allPlayers[k]).filter(Boolean);
        if (!options.length) { fine = false; break; }
        R.sign(run, pick(options, run));
      }
    } catch (e) { fine = false; }
    if (!fine || run.roster.length !== E.SLOTS.length) continue;
    drafted++;
    const s = E.detectSystem(run.roster);
    if (s) seen.set(s.key, (seen.get(s.key) || 0) + 1);
  }
  ok(drafted > SYSTEM_DRAFTS * shapeNames.length * 0.9,
    `enough drafts completed to judge the systems on (${drafted})`);

  const dead = E.SYSTEMS.map((s) => s.key).filter((k) => !seen.has(k));
  ok(dead.length === 0,
    `every system can be named${dead.length
      ? `\n      never named across ${drafted} drafts ${shapeNames.length} ways: ${dead.join(', ')}\n`
        + '      A system nobody reaches is not a rare system. Either the roster cannot\n'
        + '      produce it, in which case rewrite what it tests, or no bot above is\n'
        + '      trying, in which case add the one a player would use.'
      : ''}`);
  if (process.argv.includes('--systems')) {
    console.log(`\n  ${drafted} drafts, ${shapeNames.length} ways`);
    for (const s of E.SYSTEMS) console.log(`    ${s.key.padEnd(18)} ${String(seen.get(s.key) || 0).padStart(5)}`);
  }
}

/* ── a key a caller compares against has to be a key a system has ──────────
 *
 * `coachReport` tested `archetype.key === 'hero_ball'` to print "Leans hard on
 * <name>", and no system has ever had that key: the one it means is `iso`,
 * which is the second most common label a drafted roster gets. So that
 * weakness had never printed once. Same class as the results screen reading
 * `out.spendLeft` off an outcome that has no such field, and just as silent,
 * because an `undefined` compares false rather than throwing. */
{
  const known = new Set(E.SYSTEMS.map((s) => s.key));
  const src = fs.readFileSync(path.join(HERE, 'engine.js'), 'utf8');
  const compared = [...src.matchAll(/archetype\.key\s*===\s*'([^']+)'/g)].map((m) => m[1]);
  ok(compared.length > 0, `the engine compares a system key somewhere (${compared.length})`);
  const strangers = compared.filter((k) => !known.has(k));
  ok(strangers.length === 0,
    `every system key a caller names is a real one${strangers.length
      ? `\n      no system has the key: ${strangers.join(', ')}` : ''}`);
}

/* ── the volume badges are checked by their counter, not by earning them ─── */
const COUNTERS = [
  ['runs', career.runs], ['rings', career.rings],
  ['clubs collected', Object.keys(career.clubs).length],
  ['seasons collected', Object.keys(career.seasons).length],
  ['colleges collected', Object.keys(career.colleges).length],
  ['shapes collected', Object.keys(career.shapes).length],
  ['games played', career.totalWins + career.totalLosses],
];
for (const [what, n] of COUNTERS) ok(n > 0, `the career counts ${what} (${n})`);

/* ── the catalog itself has to be well formed ────────────────────────────── */
const ids = all.map((b) => b.id);
ok(new Set(ids).size === ids.length, 'every badge id is unique');
ok(all.every((b) => b.name && b.why), 'every badge has a name and a reason');
ok(all.every((b) => ['bronze', 'silver', 'gold', 'ring'].includes(b.tier)),
  'every badge has a known tier');
ok(all.every((b) => !b.collection || b.need > 1), 'every collection has something to collect');
ok(B.evaluate({}).every((b) => !b.got),
  'a career with nothing in it has earned nothing');
ok(B.evaluate(null).length === all.length, 'a missing career does not throw');

/* ── the page writes the fields this file reads ──────────────────────────── */
{
  const src = fs.readFileSync(path.join(HERE, 'index.html'), 'utf8');
  const sample = rowOf({ roster: [], outcome: { wins: 0, losses: 0, rating: 0, chemistry: { bonus: 0 } },
    playoffs: null });
  const missing = Object.keys(sample).filter((k) => !new RegExp(`\\b${k}:`).test(src));
  ok(missing.length === 0,
    `the page records every field the badges read${missing.length ? ` (missing ${missing.join(', ')})` : ''}`);
}

/* ── the report ──────────────────────────────────────────────────────────── */
console.log(`\nBADGES over ${played} runs, played four ways.\n`);
const rank = { ring: 0, gold: 1, silver: 2, bronze: 3 };
for (const b of all.slice().sort((a, c) => (rank[a.tier] - rank[c.tier]) || a.name.localeCompare(c.name))) {
  const mark = b.got ? 'x' : ' ';
  const prog = b.need > 1 ? `${b.have}/${b.need}` : '';
  console.log(`  [${mark}] ${b.tier.padEnd(7)}${b.name.padEnd(28)}${prog}`);
}
console.log(`\n  ${got.size} of ${all.length} earned by a machine that was not trying.`);
console.log('  The ones left are the collections and the feats, which is the point:');
console.log('  a cabinet finished on day one is a cabinet with nothing in it.\n');

if (failures.length) {
  console.error(`${pass} assertions passed, ${failures.length} FAILED\n`);
  for (const f of failures) console.error(`  FAIL: ${f}`);
  process.exit(1);
}
console.log(`${pass} assertions passed`);
