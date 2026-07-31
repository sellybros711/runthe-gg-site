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
