/* DOES WHO YOU PLAYED COUNT? Measured, at a fixed record.
 *
 *   node cfb/build/test/probe_schedule.mjs [seasons-per-roster] [rosters]
 *
 * A player reported it does not: "I am seeing some 9-3 teams make the playoff but not
 * when I am with a hard schedule." The selection formula does have a strength-of-schedule
 * term, so the question is not whether it is there but whether it is worth anything
 * against the thing a hard schedule costs you, which is margin.
 *
 * WHAT IS HELD FIXED IS THE RECORD. Comparing all seasons would just rediscover that
 * playing good teams loses games. The question is the one the committee answers: two
 * teams at 9-3, one of whom played four ranked teams, which is ranked higher?
 *
 * Each roster is drafted once and then played over many DIFFERENT schedules, because
 * generateSchedule is where the difficulty comes from and holding one schedule for
 * three hundred seasons would measure nothing about it.
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(new URL('../../..', import.meta.url).pathname);
const E = require(ROOT + '/cfb/engine.js');
const R = require(ROOT + '/cfb/run.js');
const rd = (f) => JSON.parse(fs.readFileSync(ROOT + '/cfb/data/cfb_' + f, 'utf8'));
const players = rd('player_seasons.json');
const teams = rd('team_seasons.json');
const league = rd('league_context.json');
const data = R.indexData(players, teams);

const PER = Number(process.argv[2] || 400);
const ROSTERS = Number(process.argv[3] || 14);
const mean = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
const med = (a) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];

function draft() {
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
    R.sign(run, opts.reduce((b, p) => (p.ppr_ppg_mean > b.ppr_ppg_mean ? p : b)));
  }
  if (run.roster.length !== E.SLOTS.length) return null;
  R.startSeason(run, data, league);
  return run;
}

const elite = data.prepared.eliteThreshold;
const rows = [];
for (let d = 0; d < ROSTERS; d++) {
  const run = draft();
  if (!run) continue;
  const playoffs = run.playoffs.map((id) => data.byTeamSeasonId[id]);
  for (let i = 0; i < PER; i++) {
    const rng = E.createSeededRNG(E.hashSeed('sched|' + run.seed + '|' + i));
    /* A NEW SCHEDULE EVERY SEASON, drawn the way startSeason draws it. */
    const sched = E.generateSchedule(data.prepared, rng);
    const out = E.playRun(run.roster, run.season.chemistry, sched.games, playoffs,
      league, rng, data.prepared);
    const zs = sched.games.map((g) => g.strength_z);
    rows.push({
      wins: out.regularWins,
      rank: out.ranking.rank,
      made: !!out.seed.made,
      sos: mean(zs),
      hard: zs.filter((z) => z >= elite).length,   // opponents a fan would call ranked
      losses: E.expectedLosses(zs),                             // what the slate was worth
      top: mean(zs.slice().sort((a, b) => b - a).slice(0, 4)),  // the four toughest
      z: out.ranking.z,
      margin: out.results.filter((r) => !r.playoff && !r.bowl)
        .reduce((t, r) => t + (r.yourScore - r.oppScore), 0) / 12 / E.CONSTANTS.SCALE,
    });
  }
}

console.log('=== how much do the schedules differ at all? (' + rows.length + ' seasons) ===');
const allSos = rows.map((r) => r.sos), allHard = rows.map((r) => r.hard);
const qq = (a, p) => a.slice().sort((x, y) => x - y)[Math.floor((a.length - 1) * p)];
console.log('  mean opponent z   p10 ' + qq(allSos, 0.1).toFixed(3)
  + '   median ' + qq(allSos, 0.5).toFixed(3) + '   p90 ' + qq(allSos, 0.9).toFixed(3));
console.log('  ranked opponents  p10 ' + qq(allHard, 0.1) + '   median ' + qq(allHard, 0.5)
  + '   p90 ' + qq(allHard, 0.9) + '   (z >= ' + elite.toFixed(2) + ')');
/* The number the generator balances on and the resume reads. A spread here is schedule
   luck, and the smaller it is the more of a season the draft decides. */
const L = rows.map((r) => r.losses);
console.log('  expected losses   p10 ' + qq(L, 0.1).toFixed(2) + '   median ' + qq(L, 0.5).toFixed(2)
  + '   p90 ' + qq(L, 0.9).toFixed(2) + '   (par ' + data.prepared.meanScheduleLosses.toFixed(2) + ')\n');

/* THE TABLE THAT ANSWERS THE COMPLAINT. Every record, split into the third of seasons
   with the easiest schedule and the third with the hardest, by what the slate was worth
   in expected losses, which is the measure both the generator and the resume use.
   THE HARD THIRD SHOULD RANK AHEAD at the same record. Level is the old behaviour and
   the bug: it means who you played counted for nothing. */
console.log('=== at the same record, easiest third vs hardest third of schedules ===');
console.log('  record     n      easy: rank  CFP%      hard: rank  CFP%     gap');
for (const w of [12, 11, 10, 9, 8, 7]) {
  const g = rows.filter((r) => r.wins === w);
  if (g.length < 40) continue;
  const sorted = g.slice().sort((a, b) => a.losses - b.losses);
  const cut = Math.floor(sorted.length / 3);
  const easy = sorted.slice(0, cut), hard = sorted.slice(-cut);
  const pct = (a) => a.filter((r) => r.made).length * 100 / a.length;
  console.log('  ' + (w + '-' + (12 - w)).padEnd(9)
    + String(g.length).padStart(5)
    + String(med(easy.map((r) => r.rank))).padStart(13)
    + pct(easy).toFixed(0).padStart(6) + '%'
    + String(med(hard.map((r) => r.rank))).padStart(15)
    + pct(hard).toFixed(0).padStart(6) + '%'
    + ((med(hard.map((r) => r.rank)) - med(easy.map((r) => r.rank))) > 0 ? '   +' : '   ')
    + (med(hard.map((r) => r.rank)) - med(easy.map((r) => r.rank))));
}

console.log('\n=== the same thing by ranked opponents played, at 9-3 and 10-2 ===');
for (const w of [10, 9]) {
  const g = rows.filter((r) => r.wins === w);
  if (g.length < 40) continue;
  console.log('  ' + w + '-' + (12 - w) + ':');
  for (const h of [0, 1, 2, 3, 4, 5]) {
    const b = g.filter((r) => r.hard === h);
    if (b.length < 25) continue;
    console.log('    ' + h + ' ranked   n=' + String(b.length).padStart(5)
      + '   median rank ' + String(med(b.map((r) => r.rank))).padStart(4)
      + '   CFP ' + (b.filter((r) => r.made).length * 100 / b.length).toFixed(0).padStart(3) + '%'
      + '   margin ' + mean(b.map((r) => r.margin)).toFixed(1).padStart(6)
      + '   sos ' + mean(b.map((r) => r.sos)).toFixed(3).padStart(6));
  }
}
