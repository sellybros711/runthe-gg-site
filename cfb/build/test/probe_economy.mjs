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
 *   policies the five ways a person really plays, BOTH games side by side.
 *            This is the section that answers "is a perfect season as hard
 *            here as it is there", because it measures the same ladder in
 *            both, ending at a solver that plays the wheel perfectly.
 *   margin   MARGIN_GAIN, refitted: the player's z against a real team's
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

/* MARGIN_GAIN, re-measured rather than remembered.
 *
 * A player's margin is not a real point differential. It is a fantasy total
 * against an opponent's real points, so the two sides of the subtraction are in
 * different units and the z that falls out is flatter than a real team's.
 * MARGIN_GAIN is the slope that puts the player's season on the same scale as
 * the teams it is ranked against, and engine.js says in as many words to
 * re-measure it if SCALE, the cap or DEFENSE_WEIGHT move.
 *
 * It said that with no tool to do it: the 1.30 in the file was fitted once by
 * hand and never again, so the instruction was unfollowable. This is that tool.
 * Match on RECORD, because that is the thing both sides have in common: for
 * every win total, what does a real team of that record score on strength_z, and
 * what does a player of that record score on the raw z? The ratio of those two,
 * regressed through the origin, is the gain.
 */
if (want('margin')) {
  const { E, data, league } = CFB;
  const GAMES = E.CONSTANTS.REGULAR_SEASON_GAMES;
  const prepared = data.prepared;

  /* Real teams, bucketed by wins. Their strength_z is the target scale. */
  const realByWins = {};
  for (const t of CFB.teams) {
    const w = Number(String(t.record).split('-')[0]);
    if (!Number.isFinite(w)) continue;
    (realByWins[w] ??= []).push(t.strength_z);
  }

  /* Player seasons, bucketed the same way, carrying the RAW z: the margin
     standardised, before any gain is applied. Undoing the constant rather than
     recomputing it keeps this honest if the formula around it changes. */
  const mineByWins = {};
  for (let d = 0; d < 40; d++) {
    const run = draft(CFB, STRATS.greedy);
    if (!run) continue;
    const schedule = run.schedule.map((id) => data.byTeamSeasonId[id]);
    const playoffs = run.playoffs.map((id) => data.byTeamSeasonId[id]);
    for (let i = 0; i < 250; i++) {
      const rng = E.createSeededRNG(E.hashSeed('margin|' + run.seed + '|' + i));
      const out = E.playRun(run.roster, run.season.chemistry, schedule, playoffs,
        league, rng, prepared);
      (mineByWins[out.regularWins] ??= []).push(out.ranking.z / E.MARGIN_GAIN);
    }
  }

  console.log('=== MARGIN_GAIN, measured ===');
  console.log('  record      real z    yours (raw)     ratio       n real   n yours');
  const pts = [];
  for (const w of Object.keys(mineByWins).map(Number).sort((a, b) => a - b)) {
    const mine = mineByWins[w], real = realByWins[w];
    /* Records a real team cannot have in this data are no use as a reference. */
    if (!real || real.length < 20 || mine.length < 40) continue;
    const my = mean(mine), rl = mean(real);
    pts.push([my, rl]);
    console.log('  ' + (w + '-' + (GAMES - w)).padEnd(11)
      + rl.toFixed(3).padStart(8) + my.toFixed(3).padStart(15)
      + (my !== 0 ? (rl / my).toFixed(3) : '  -').padStart(11)
      + String(real.length).padStart(12) + String(mine.length).padStart(10));
  }
  /* Through the origin: a season with no margin is an average season on either
     scale, so the line has no business having an intercept. */
  const num = pts.reduce((s, [x, y]) => s + x * y, 0);
  const den = pts.reduce((s, [x]) => s + x * x, 0);
  const slope = den ? num / den : 0;
  const ybar = pts.reduce((s, [, y]) => s + y, 0) / Math.max(1, pts.length);
  const ssTot = pts.reduce((s, [, y]) => s + (y - ybar) ** 2, 0);
  const ssRes = pts.reduce((s, [x, y]) => s + (y - slope * x) ** 2, 0);
  console.log('\n  fitted MARGIN_GAIN = ' + slope.toFixed(3)
    + '   (R2 ' + (ssTot ? (1 - ssRes / ssTot).toFixed(3) : 'n/a')
    + ', ' + pts.length + ' records)');
  console.log('  engine.js currently says ' + E.MARGIN_GAIN
    + (Math.abs(slope - E.MARGIN_GAIN) > 0.05 ? '   <-- STALE, update it' : '   (in line)'));
  console.log('');
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

/* THE FIVE WAYS A PERSON REALLY PLAYS, IN BOTH GAMES, ON THE SAME LADDER.
 *
 * Every other section here drafts greedily, which is a policy, not a player.
 * Greedy takes the highest scorer on every spin and never once thinks about
 * what it is leaving itself: it overspends early, strands the last two slots
 * and builds a shape the structure model punishes. Judging difficulty by it
 * says the game is harder than it is for somebody who is actually trying.
 *
 * The top of the ladder is `bestPossibleSquad`, the solver behind the perfect
 * draft badge. It sees the same six wheels the player saw and returns the best
 * legal roster inside those draws, so it is not cheating with players nobody
 * was offered: it is the ceiling of what the run allowed. A good human sits
 * between the top row and that, closer to it the more they play. So the honest
 * question is not "what does greedy get" but "what is at each rung, in both
 * games", and that is what this prints.
 *
 * THIS IS THE SECTION THAT ANSWERS whether a perfect season is as hard here as
 * it is in the NFL game. Compare rung to rung, not headline to headline: the
 * NFL is 17 games plus 3, this is 12 plus 4, so only the same policy in both is
 * a fair comparison. Ported from football/simulator.js --policies, which is the
 * same five names against the same solver, so the two really are one ladder.
 */
if (want('policies')) {
  const N = Number(process.env.PROBE_N ?? 60);
  console.log('=== the five ways a person really plays, both games (' + N + ' runs each) ===');
  console.log('  game  policy                  spend   FPPG   chem   record   playoff  title  perfect');
  for (const game of ['football', 'cfb']) {
    const G = game === 'cfb' ? CFB : load(game);
    const { E, R, data, league } = G;
    const GAMES = E.CONSTANTS.REGULAR_SEASON_GAMES;
    /* The NFL harness needs the coach and battery tables to start a season; the
       college one takes the league context alone. Passing the wrong shape gives
       a chemistry of 1.0 everywhere, which would quietly flatten the ladder. */
    const CTX = game === 'cfb' ? { league } : {
      battery: JSON.parse(fs.readFileSync(ROOT + '/football/data/battery.json', 'utf8')),
      coaches: JSON.parse(fs.readFileSync(ROOT + '/football/data/coaches.json', 'utf8')),
      curated: JSON.parse(fs.readFileSync(ROOT + '/football/data/curated.json', 'utf8')),
    };
    const LEAGUE = game === 'cfb' ? league : league.league_avg_pts_allowed_by_season;
    const POLICIES = {
      'cheapest every time': (o) => o.reduce((b, p) => (p.price_musd < b.price_musd ? p : b)),
      'best points per dollar': (o) => o.reduce((b, p) =>
        (p.ppr_ppg_mean / Math.max(3, p.price_musd) > b.ppr_ppg_mean / Math.max(3, b.price_musd) ? p : b)),
      'random tap': (o, rng) => o[Math.floor(rng() * o.length)],
      'taps the top row': (o) => o.reduce((b, p) => (p.ppr_ppg_mean > b.ppr_ppg_mean ? p : b)),
      'perfect play (solver)': (o) => o.reduce((b, p) => (p.ppr_ppg_mean > b.ppr_ppg_mean ? p : b)),
    };
    for (const name of Object.keys(POLICIES)) {
      const A = { sp: [], fp: [], ch: [], w: [], po: [], ti: [], pf: [] };
      for (let i = 0; i < N; i++) {
        const seed = 20000 + i * 7919;
        const run = R.createRun({ seed });
        const rng = E.createSeededRNG(seed ^ 0x5f5f);
        let stranded = false;
        while (run.roster.length < E.SLOTS.length) {
          let draw;
          try { draw = R.spin(run, data); } catch (e) { stranded = true; break; }
          const list = data.playersByTeamSeason[draw.team_season_id] || [];
          const opts = draw.options
            .map((k) => { const [id, s] = k.split('|');
              return list.find((p) => String(p.player_id) === id && String(p.season) === s); })
            .filter(Boolean).filter((p) => R.slotForPlayer(run, p) !== null);
          /* KEEP ENOUGH BACK TO FILL THE REST, which every one of these policies
             has to respect or it is not a policy a person could follow: the game
             will not let you sign a man who leaves a slot unfillable. Without
             this filter "taps the top row" strands itself and the ladder measures
             the stranding rather than the strategy. */
          const budget = R.remaining(run) - R.reserveFloor(run);
          const legal = opts.filter((p) => p.price_musd <= budget);
          const pick = (legal.length ? POLICIES[name](legal, rng) : opts[0]);
          if (!pick) { stranded = true; break; }
          /* TWO ARGUMENTS, NOT THREE. sign()'s third is the slot the player asked
             for, and it is checked rather than trusted, so passing anything else
             there (`data`, say) fails the check and throws "no empty spot". */
          R.sign(run, pick);
        }
        if (stranded || run.roster.length !== E.SLOTS.length) continue;
        R.startSeason(run, data, CTX);
        let roster = run.roster, chem = run.season.chemistry;
        if (name === 'perfect play (solver)') {
          let best = null;
          try { best = R.bestPossibleSquad(run, data, CTX); } catch (e) { best = null; }
          if (best && best.squad) { roster = best.squad; chem = best.chemistry; }
        }
        const pr = R.projectSeason(roster, chem, run, data, LEAGUE, 400);
        A.sp.push(roster.reduce((t, p) => t + p.price_musd, 0));
        A.fp.push(roster.reduce((t, p) => t + p.ppr_ppg_mean, 0));
        A.ch.push(chem); A.w.push(pr.meanWins);
        A.po.push(pr.playoffRate); A.ti.push(pr.titleRate); A.pf.push(pr.perfectRate);
      }
      if (!A.w.length) { console.log('  ' + game.padEnd(6) + name.padEnd(24) + '  no legal run'); continue; }
      console.log('  ' + (game === 'cfb' ? 'CFB' : 'NFL').padEnd(6) + name.padEnd(24)
        + ('$' + mean(A.sp).toFixed(0) + 'M').padStart(6)
        + mean(A.fp).toFixed(0).padStart(7)
        + ('+' + ((mean(A.ch) - 1) * 100).toFixed(1) + '%').padStart(7)
        + (mean(A.w).toFixed(1) + '-' + (GAMES - mean(A.w)).toFixed(1)).padStart(9)
        + (mean(A.po) * 100).toFixed(0).padStart(9) + '%'
        + (mean(A.ti) * 100).toFixed(1).padStart(6) + '%'
        + (mean(A.pf) * 100).toFixed(2).padStart(8) + '%');
    }
    console.log('');
  }
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
