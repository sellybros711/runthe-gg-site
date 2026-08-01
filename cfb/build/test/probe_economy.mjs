/* What the game's economy and difficulty actually are, measured.
 *
 *   node cfb/build/test/probe_economy.mjs          both games, every section
 *   node cfb/build/test/probe_economy.mjs pool     just one section
 *
 * Not a test: nothing here passes or fails. It prints the numbers a tuning
 * decision needs, so a change to prices, the resume weights or the playoff
 * ladder can be argued from measurements instead of from a feeling. Re-run it
 * after any of those change and compare.
 *
 * Sections:
 *   pool     the player pool, and what a dollar buys at each price
 *   season   four ways of drafting, and how each one's seasons go
 *   record   what each regular-season record is worth
 *   rounds   the per-game win rate, regular season and each playoff round
 *   nfl      the same headline numbers for the NFL game, as a yardstick
 *   bands    what each overall band is rare enough to be, and worth
 *   curve    the same thing two points at a time, to show it scales
 *   far      how far a season gets, by overall: where it ends
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(new URL('../../..', import.meta.url).pathname);
const only = process.argv[2] || null;
const want = (s) => !only || only === s;
const q = (a, p) => a.slice().sort((x, y) => x - y)[Math.max(0, Math.floor((a.length - 1) * p))];
const mean = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);

/* Both games are the same two modules with different data under them, so one
   loader covers the comparison section too. */
function load(game) {
  const E = require(ROOT + '/' + game + '/engine.js');
  const R = require(ROOT + '/' + game + '/run.js');
  const pre = game === 'cfb' ? 'cfb_' : '';
  const rd = (f) => JSON.parse(fs.readFileSync(ROOT + '/' + game + '/data/' + pre + f, 'utf8'));
  const players = rd('player_seasons.json');
  const teams = rd('team_seasons.json');
  const league = rd('league_context.json');
  return { E, R, players, teams, league, data: R.indexData(players, teams) };
}

/* Four ways a person plays. "greedy" is the one that matters: it is what a
   player trying to win does on every single pick, so its numbers are the
   ceiling of ordinary play, not the average of it. */
const STRATS = {
  random: (o) => o[Math.floor(Math.random() * o.length)],
  greedy: (o) => o.reduce((b, p) => (p.ppr_ppg_mean > b.ppr_ppg_mean ? p : b)),
  value: (o) => o.reduce((b, p) => (p.ppr_ppg_mean / Math.max(0.1, p.price_musd)
    > b.ppr_ppg_mean / Math.max(0.1, b.price_musd) ? p : b)),
  cheap: (o) => o.reduce((b, p) => (p.price_musd < b.price_musd ? p : b)),
};

function draft(G, pick) {
  const { E, R, data, league } = G;
  const run = R.createRun({});
  for (let i = 0; i < 12 && run.roster.length < E.SLOTS.length; i++) {
    let draw;
    try { draw = R.spin(run, data); } catch (e) { return null; }
    const list = data.playersByTeamSeason[draw.team_season_id] || [];
    const opts = draw.options
      .map((k) => { const [id, s] = k.split('|');
        return list.find((p) => String(p.player_id) === id && String(p.season) === s); })
      .filter(Boolean).filter((p) => R.slotForPlayer(run, p) !== null);
    if (!opts.length) return null;
    R.sign(run, pick(opts));
  }
  if (run.roster.length !== E.SLOTS.length) return null;
  R.startSeason(run, data, league);
  return run;
}

const CFB = load('cfb');

if (want('pool')) {
  const { E, players } = CFB;
  console.log('=== the pool ===');
  console.log(players.length + ' player seasons, cap $' + E.CONSTANTS.CAP_MUSD + 'M, '
    + E.SLOTS.length + ' slots');
  const byPos = {};
  for (const p of players) (byPos[p.position] ??= []).push(p);
  for (const pos of Object.keys(byPos).sort()) {
    const l = byPos[pos];
    const pr = l.map((p) => p.price_musd), pg = l.map((p) => p.ppr_ppg_mean);
    console.log('  ' + pos.padEnd(3) + ' n=' + String(l.length).padStart(5)
      + '   price p50 ' + q(pr, 0.5).toFixed(2) + ' p95 ' + q(pr, 0.95).toFixed(2)
      + ' max ' + q(pr, 1).toFixed(2)
      + '   ppg p50 ' + q(pg, 0.5).toFixed(1) + ' p95 ' + q(pg, 0.95).toFixed(1)
      + ' max ' + q(pg, 1).toFixed(1));
  }
  console.log('\n=== what a dollar buys ===');
  console.log('  band          n     ppg p50   ppg p90   ppg per $M');
  for (const [lo, hi] of [[0, .5], [.5, 1], [1, 1.5], [1.5, 2], [2, 2.5], [2.5, 3], [3, 4], [4, 99]]) {
    const l = players.filter((p) => p.price_musd >= lo && p.price_musd < hi);
    if (!l.length) continue;
    const pg = l.map((p) => p.ppr_ppg_mean);
    const per = l.map((p) => p.ppr_ppg_mean / Math.max(0.1, p.price_musd));
    console.log('  ' + ('$' + lo + '-' + hi + 'M').padEnd(12) + String(l.length).padStart(5)
      + q(pg, .5).toFixed(1).padStart(10) + q(pg, .9).toFixed(1).padStart(10)
      + q(per, .5).toFixed(1).padStart(13));
  }
  console.log('');
}

if (want('season')) {
  const { E, R, data, league } = CFB;
  const CAP = E.CONSTANTS.CAP_MUSD, GAMES = E.CONSTANTS.REGULAR_SEASON_GAMES;
  const N = 120;
  console.log('=== how a season goes (' + N + ' drafts each, 400 simulated seasons per draft) ===');
  console.log('  strategy   spent   left    fppg   chem    wins     playoff  bye   title  perfect');
  for (const [name, pick] of Object.entries(STRATS)) {
    const A = { sp: [], fp: [], ch: [], w: [], po: [], by: [], ti: [], pf: [] };
    for (let i = 0; i < N; i++) {
      const run = draft(CFB, pick);
      if (!run) continue;
      const pr = R.projectSeason(run.roster, run.season.chemistry, run, data, league, 400);
      A.sp.push(run.roster.reduce((t, p) => t + p.price_musd, 0));
      A.fp.push(run.roster.reduce((t, p) => t + p.ppr_ppg_mean, 0));
      A.ch.push(run.season.chemistry); A.w.push(pr.meanWins);
      A.po.push(pr.playoffRate); A.by.push(pr.byeRate);
      A.ti.push(pr.titleRate); A.pf.push(pr.perfectRate);
    }
    console.log('  ' + name.padEnd(10)
      + ('$' + mean(A.sp).toFixed(1) + 'M').padEnd(8)
      + ('$' + (CAP - mean(A.sp)).toFixed(1) + 'M').padEnd(7)
      + mean(A.fp).toFixed(0).padStart(5)
      + ('+' + ((mean(A.ch) - 1) * 100).toFixed(1) + '%').padStart(8)
      + (mean(A.w).toFixed(1) + '-' + (GAMES - mean(A.w)).toFixed(1)).padStart(10)
      + (mean(A.po) * 100).toFixed(0).padStart(8) + '%'
      + (mean(A.by) * 100).toFixed(0).padStart(5) + '%'
      + (mean(A.ti) * 100).toFixed(1).padStart(7) + '%'
      + (mean(A.pf) * 100).toFixed(2).padStart(8) + '%');
  }
  console.log('');
}

/* record and rounds share their simulated seasons, because generating them is
   the slow part and both want the same ones. */
if (want('record') || want('rounds')) {
  const { E, data, league } = CFB;
  const GAMES = E.CONSTANTS.REGULAR_SEASON_GAMES;
  const byWins = {}, rounds = {}, reg = { n: 0, w: 0 };
  let n = 0;
  for (let d = 0; d < 60; d++) {
    const run = draft(CFB, STRATS.greedy);
    if (!run) continue;
    const schedule = run.schedule.map((id) => data.byTeamSeasonId[id]);
    const playoffs = run.playoffs.map((id) => data.byTeamSeasonId[id]);
    for (let i = 0; i < 300; i++) {
      const rng = E.createSeededRNG(E.hashSeed('probe|' + run.seed + '|' + i));
      const out = E.playRun(run.roster, run.season.chemistry, schedule, playoffs,
        league, rng, data.prepared);
      const b = (byWins[out.regularWins] ??= { n: 0, made: 0, bye: 0, title: 0, rank: [] });
      b.n++; n++;
      if (out.seed.made) b.made++;
      if (out.seed.bye) b.bye++;
      if (out.titleWon) b.title++;
      b.rank.push(out.ranking.rank);
      for (const r of out.results) {
        if (r.playoff) {
          const p = (rounds[r.round] ??= { n: 0, w: 0, mar: 0 });
          p.n++; p.mar += r.yourScore - r.oppScore; if (r.won) p.w++;
        } else if (!r.bowl) { reg.n++; if (r.won) reg.w++; }
      }
    }
  }
  const med = (a) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];
  if (want('record')) {
    console.log('=== what each record is worth (' + n + ' seasons, best-available drafting) ===');
    console.log('  record    share   median rank   makes CFP   bye   wins title');
    for (const w of Object.keys(byWins).map(Number).sort((a, b) => b - a)) {
      const b = byWins[w];
      console.log('  ' + (w + '-' + (GAMES - w)).padEnd(10)
        + (b.n * 100 / n).toFixed(1).padStart(5) + '%'
        + String(med(b.rank)).padStart(13)
        + (b.made * 100 / b.n).toFixed(0).padStart(11) + '%'
        + (b.bye * 100 / b.n).toFixed(0).padStart(6) + '%'
        + (b.title * 100 / b.n).toFixed(1).padStart(11) + '%');
    }
    console.log('');
  }
  if (want('rounds')) {
    console.log('=== the games themselves ===');
    console.log('  regular season   ' + (reg.w * 100 / reg.n).toFixed(1) + '% won  (n=' + reg.n + ')');
    for (const k of Object.keys(rounds)) {
      const b = rounds[k];
      console.log('  ' + k.padEnd(19) + (b.w * 100 / b.n).toFixed(1) + '% won'
        + ('   average margin ' + (b.mar / b.n > 0 ? '+' : '') + (b.mar / b.n).toFixed(1)).padEnd(28)
        + '(n=' + b.n + ')');
    }
    console.log('');
  }
}

if (want('nfl')) {
  console.log('=== the same headline numbers, both games ===');
  for (const game of ['football', 'cfb']) {
    const G = game === 'cfb' ? CFB : load(game);
    const GAMES = G.E.CONSTANTS.REGULAR_SEASON_GAMES, CAP = G.E.CONSTANTS.CAP_MUSD;
    const A = { sp: [], w: [], po: [], ti: [], pf: [] };
    for (let i = 0; i < 100; i++) {
      const run = draft(G, STRATS.greedy);
      if (!run) continue;
      const pr = G.R.projectSeason(run.roster, run.season.chemistry, run, G.data, G.league, 400);
      A.sp.push(run.roster.reduce((t, p) => t + p.price_musd, 0));
      A.w.push(pr.meanWins); A.po.push(pr.playoffRate);
      A.ti.push(pr.titleRate); A.pf.push(pr.perfectRate);
    }
    console.log('  ' + game.toUpperCase().padEnd(9) + GAMES + ' games, cap $' + CAP + 'M, '
      + (mean(A.sp) / CAP * 100).toFixed(0) + '% of it spent');
    console.log('    best-available drafting: ' + mean(A.w).toFixed(1) + '-'
      + (GAMES - mean(A.w)).toFixed(1) + ' (' + (mean(A.w) / GAMES * 100).toFixed(0) + '% of games won)'
      + '   playoffs ' + (mean(A.po) * 100).toFixed(0) + '%'
      + '   title ' + (mean(A.ti) * 100).toFixed(1) + '%'
      + '   perfect ' + (mean(A.pf) * 100).toFixed(2) + '%');
  }
  console.log('');
}

/* What the displayed overall is worth, band by band, and how often a draft lands
   in each one. Answers two questions the number itself cannot: is a 90 rare, and
   is it worth anything. The second half is the known cost of the rating formula:
   it counts chemistry and the scheme, and the simulation also counts the four
   SHAPE terms it leaves out, so two teams showing the same number can be worth
   different seasons. This measures how different. */
if (want('bands')) {
  const { E, R, data, league } = CFB;
  const CTX = { league };
  const rate = (r, c) => E.teamOverall(r, c);

  console.log('=== how often a draft lands in each band ===');
  const drafted = [], hindsight = [], teams = [];
  for (let i = 0; i < 700; i++) {
    const run = draft(CFB, STRATS.greedy);
    if (!run) continue;
    const ov = rate(run.roster, run.season.chemistry);
    drafted.push(ov);
    teams.push({ roster: run.roster, chem: run.season.chemistry, run, ov });
    try {
      const bp = R.bestPossibleSquad(run, data, CTX);
      if (bp && bp.squad) {
        const bov = rate(bp.squad, bp.chemistry);
        hindsight.push(bov);
        teams.push({ roster: bp.squad, chem: bp.chemistry, run, ov: bov });
      }
    } catch (e) { /* not always computable */ }
  }
  const BANDS = [[0, 70], [70, 80], [80, 85], [85, 90], [90, 95], [95, 100], [100, 999]];
  const label = ([lo, hi]) => (hi === 999 ? '100+' : lo + '-' + hi);
  const share = (a) => BANDS.map((b) =>
    (a.filter((v) => v >= b[0] && v < b[1]).length * 100 / a.length).toFixed(1).padStart(6) + '%').join('');
  console.log('  band          ' + BANDS.map((b) => label(b).padStart(7)).join(''));
  console.log('  you draft it  ' + share(drafted) + '   (n=' + drafted.length + ')');
  console.log('  best possible ' + share(hindsight) + '   (n=' + hindsight.length + ')');

  console.log('\n=== what each band is worth ===');
  const acc = BANDS.map(() => ({ teams: 0, n: 0, wins: 0, po: 0, bye: 0, fin: 0, title: 0, perfect: 0 }));
  const shaped = [];
  for (const t of teams) {
    const bi = BANDS.findIndex((b) => t.ov >= b[0] && t.ov < b[1]);
    if (bi < 0) continue;
    const b = acc[bi];
    if (b.teams >= 40) continue;
    b.teams++;
    const schedule = t.run.schedule.map((id) => data.byTeamSeasonId[id]);
    const playoffs = t.run.playoffs.map((id) => data.byTeamSeasonId[id]);
    let w = 0, po = 0, ti = 0;
    for (let i = 0; i < 300; i++) {
      const rng = E.createSeededRNG(E.hashSeed('band|' + t.run.seed + '|' + t.ov.toFixed(2) + '|' + i));
      const out = E.playRun(t.roster, t.chem, schedule, playoffs, league, rng, data.prepared);
      b.n++; b.wins += out.regularWins; w += out.regularWins;
      if (out.seed.made) { b.po++; po++; }
      if (out.seed.bye) b.bye++;
      if (out.titleWon) { b.title++; ti++; }
      if (out.perfect) b.perfect++;
      if (out.titleWon || out.exitRound === 'CFP Championship') b.fin++;
    }
    if (t.ov >= 85) shaped.push({ ov: t.ov, mult: E.rosterStructure(t.roster).multiplier,
      wins: w / 300, po: po / 300, ti: ti / 300 });
  }
  console.log('  band       teams   seasons   wins   playoff    bye   final   title  perfect');
  BANDS.forEach((bd, i) => {
    const b = acc[i];
    if (!b.n) return;
    const pc = (v) => (v * 100 / b.n).toFixed(1).padStart(6) + '%';
    console.log('  ' + label(bd).padEnd(11) + String(b.teams).padStart(5) + String(b.n).padStart(10)
      + (b.wins / b.n).toFixed(1).padStart(7) + pc(b.po) + pc(b.bye) + pc(b.fin) + pc(b.title) + pc(b.perfect));
  });

  console.log('\n=== the same number, different shape (teams rated 85 or better) ===');
  shaped.sort((a, b) => a.mult - b.mult);
  const third = Math.max(1, Math.floor(shaped.length / 3));
  for (const [name, g] of [['worst shaped third', shaped.slice(0, third)],
    ['middle third', shaped.slice(third, 2 * third)],
    ['best shaped third', shaped.slice(2 * third)]]) {
    if (!g.length) continue;
    const m = (f) => g.reduce((t, x) => t + f(x), 0) / g.length;
    console.log('  ' + name.padEnd(20) + String(g.length).padStart(3)
      + '   shape x' + m((x) => x.mult).toFixed(3)
      + '   showing ' + m((x) => x.ov).toFixed(1)
      + '   ' + m((x) => x.wins).toFixed(1) + ' wins'
      + '   playoff ' + (m((x) => x.po) * 100).toFixed(0) + '%'
      + '   title ' + (m((x) => x.ti) * 100).toFixed(1) + '%');
  }
  console.log('');
}

/* Does the number scale inside a band, or does it step? Two-point buckets, so a
   90 and a 95 can be told apart. The wide bands elsewhere in this file are
   measurement buckets, not thresholds: nothing in the game reads a band. */
if (want('curve')) {
  const { E, R, data, league } = CFB;
  const CTX = { league };
  /* The overall IS the rating now: no divisor, no ceiling. */
  const rate = (r, c) => E.teamOverall(r, c);
  const LO = 66, HI = 112, W = 2;
  const nbins = Math.ceil((HI - LO) / W);
  const bins = Array.from({ length: nbins }, () => []);
  for (let i = 0; i < 2600; i++) {
    const run = draft(CFB, STRATS.greedy);
    if (!run) continue;
    const cands = [{ roster: run.roster, chem: run.season.chemistry, run }];
    try {
      const bp = R.bestPossibleSquad(run, data, CTX);
      if (bp && bp.squad) cands.push({ roster: bp.squad, chem: bp.chemistry, run });
    } catch (e) { /* not always computable */ }
    for (const c of cands) {
      const ov = rate(c.roster, c.chem);
      const bi = Math.floor((ov - LO) / W);
      if (bi >= 0 && bi < nbins && bins[bi].length < 22) bins[bi].push({ ...c, ov });
    }
    if (bins.every((b) => b.length >= 22)) break;
  }
  console.log('=== the curve, two points at a time ===');
  console.log('  overall   teams  seasons   wins   playoff     bye    title  perfect');
  const rows = [];
  for (let bi = 0; bi < nbins; bi++) {
    const list = bins[bi];
    if (list.length < 4) continue;
    let n = 0, w = 0, po = 0, bye = 0, ti = 0, pf = 0;
    for (const t of list) {
      const schedule = t.run.schedule.map((id) => data.byTeamSeasonId[id]);
      const playoffs = t.run.playoffs.map((id) => data.byTeamSeasonId[id]);
      for (let i = 0; i < 320; i++) {
        const rng = E.createSeededRNG(E.hashSeed('cv|' + t.run.seed + '|' + t.ov.toFixed(2) + '|' + i));
        const o = E.playRun(t.roster, t.chem, schedule, playoffs, league, rng, data.prepared);
        n++; w += o.regularWins;
        if (o.seed.made) po++;
        if (o.seed.bye) bye++;
        if (o.titleWon) ti++;
        if (o.perfect) pf++;
      }
    }
    const pc = (v) => (v * 100 / n).toFixed(1).padStart(8) + '%';
    console.log('  ' + ((LO + bi * W) + '-' + (LO + bi * W + W)).padEnd(9)
      + String(list.length).padStart(5) + String(n).padStart(9)
      + (w / n).toFixed(1).padStart(7) + pc(po) + pc(bye) + pc(ti)
      + (pf * 100 / n).toFixed(2).padStart(8) + '%');
    rows.push({ po: po / n, ti: ti / n, pf: pf / n });
  }
  /* Any step that goes backwards is roster shape, which the number leaves out:
     a bucket holding a few badly shaped teams sags below the one beneath it. */
  const dips = (k) => rows.slice(1).filter((r, i) => r[k] < rows[i][k] - 0.004).length;
  console.log('  steps that go backwards, out of ' + (rows.length - 1)
    + ':   playoff ' + dips('po') + '   title ' + dips('ti') + '   perfect ' + dips('pf'));
  console.log('');
}


/* HOW FAR A SEASON GETS, by overall. The curve above says how often a team wins
   things; this says where its season ENDS, which is what a player watches
   happen. Every column should move one way as the rating climbs: less "missed
   it", more "won it", and the exits in between sliding later. */
if (want('far')) {
  const { E, R, data, league } = CFB;
  const CTX = { league };
  const LO = 74, HI = 106, W = 4;
  const nbins = Math.ceil((HI - LO) / W);
  const bins = Array.from({ length: nbins }, () => []);
  for (let i = 0; i < 2600; i++) {
    const run = draft(CFB, STRATS.greedy);
    if (!run) continue;
    const cands = [{ roster: run.roster, chem: run.season.chemistry, run }];
    try {
      const bp = R.bestPossibleSquad(run, data, CTX);
      if (bp && bp.squad) cands.push({ roster: bp.squad, chem: bp.chemistry, run });
    } catch (e) { /* not always computable */ }
    for (const c of cands) {
      const ov = E.teamOverall(c.roster, c.chem);
      const bi = Math.floor((ov - LO) / W);
      if (bi >= 0 && bi < nbins && bins[bi].length < 26) bins[bi].push({ ...c, ov });
    }
    if (bins.every((b) => b.length >= 26)) break;
  }
  const COLS = ['missed', 'bowl', 'first round', 'quarter', 'semi', 'final', 'WON IT'];
  console.log('=== where a season ends, by overall ===');
  console.log('  overall   teams' + COLS.map((c) => c.padStart(13)).join(''));
  const rows = [];
  for (let bi = 0; bi < nbins; bi++) {
    const list = bins[bi];
    if (list.length < 6) continue;
    const c = COLS.map(() => 0);
    let n = 0;
    for (const t of list) {
      const schedule = t.run.schedule.map((id) => data.byTeamSeasonId[id]);
      const playoffs = t.run.playoffs.map((id) => data.byTeamSeasonId[id]);
      for (let i = 0; i < 300; i++) {
        const rng = E.createSeededRNG(E.hashSeed('far|' + t.run.seed + '|' + t.ov.toFixed(2) + '|' + i));
        const o = E.playRun(t.roster, t.chem, schedule, playoffs, league, rng, data.prepared);
        n++;
        if (o.titleWon) c[6]++;
        else if (o.exitRound === 'CFP Championship') c[5]++;
        else if (o.exitRound === 'CFP Semifinal') c[4]++;
        else if (o.exitRound === 'CFP Quarterfinal') c[3]++;
        else if (o.exitRound === 'CFP First Round') c[2]++;
        else if (o.bowlResult) c[1]++;
        else c[0]++;
      }
    }
    console.log('  ' + ((LO + bi * W) + '-' + (LO + bi * W + W)).padEnd(10) + String(list.length).padStart(4)
      + c.map((v) => (v * 100 / n).toFixed(1).padStart(12) + '%').join(''));
    rows.push(c.map((v) => v / n));
  }
  /* missed should only fall and WON IT should only rise, all the way up */
  const dips = (i, up) => rows.slice(1).filter((r, k) =>
    up ? r[i] < rows[k][i] - 0.01 : r[i] > rows[k][i] + 0.01).length;
  console.log('  steps the wrong way, out of ' + (rows.length - 1)
    + ':   missed ' + dips(0, false) + '   won it ' + dips(6, true));
  console.log('');
}
