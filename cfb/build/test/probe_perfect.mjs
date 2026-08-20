/* Not a test. How often a season goes unbeaten, by how good the roster is.
 *
 *   node cfb/build/test/probe_perfect.mjs [--label name] [--seasons N]
 *
 * probe_bracket.mjs reports rates by DRAFTING POLICY, which is the right frame for tuning
 * the postseason: the question there is whether the bracket moved the game. This one is
 * bucketed by TEAM OVERALL, which is the frame a player uses. "I built a 96 and went 15-0"
 * is a sentence about a number on their own screen, and nothing in the harness answered it.
 *
 * Three separate things are reported, because they are three different bars:
 *   12-0        the regular season, which is what makes the top seed and the bye
 *   15-0 / 16-0 unbeaten all the way, which is the thing a player is chasing
 *   title       won it, however many losses it took
 *
 * The rosters are drafted once and held, then played over many seasons each, so a rate in a
 * band is that band's rate rather than one lucky roster's.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');
const E = require(path.join(ROOT, 'cfb/engine.js'));
const R = require(path.join(ROOT, 'cfb/run.js'));
const rd = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'cfb/data', f), 'utf8'));
const data = R.indexData(rd('cfb_player_seasons.json'), rd('cfb_team_seasons.json'));
const league = rd('cfb_league_context.json');
const CTX = { battery: rd('cfb_battery.json'), curated: rd('cfb_curated.json'), coaches: rd('cfb_coaches.json') };

const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const label = arg('--label', 'current');
const SEASONS = +arg('--seasons', 400);
/* Sweep the marquee count without editing the engine, so a candidate can be measured against
   the shipped one over the identical rosters and the identical seeds. Unset means whatever
   CONSTANTS.MARQUEE_GAMES currently says. */
const MARQUEE = process.argv.includes('--marquee') ? +arg('--marquee', 0) : null;
/* Same idea for the regular season's own edge: sweep WEEK_UPSET without editing the engine,
   so a candidate is measured against the shipped one over the identical rosters and seeds. */
const CONST = (() => {
  let c = E.CONSTANTS;
  const set = (flag, key) => {
    if (!process.argv.includes(flag)) return;
    c = { ...c, [key]: +arg(flag, c[key]) };
  };
  set('--upset', 'WEEK_UPSET');
  set('--foelow', 'WEEK_FOE_LOW');
  set('--foehigh', 'WEEK_FOE_HIGH');
  set('--wfloor', 'WEEK_FLOOR');
  set('--wfull', 'WEEK_FULL');
  return c;
})();

/* A spread of drafting policies rather than one, so the overall bands fill from the top and
   the bottom. Greedy alone lands almost everything in the high eighties and nineties. */
const PICKS = [
  (o) => o.reduce((b, p) => (p.ppr_ppg_mean > b.ppr_ppg_mean ? p : b)),
  (o) => o.slice().sort((a, b) => a.ppr_ppg_mean - b.ppr_ppg_mean)[Math.floor(o.length * 0.85)],
  (o) => o.slice().sort((a, b) => a.ppr_ppg_mean - b.ppr_ppg_mean)[Math.floor(o.length * 0.6)],
  (o) => o.slice().sort((a, b) => a.ppr_ppg_mean - b.ppr_ppg_mean)[Math.floor(o.length / 2)],
];

function draft(pick, seed) {
  const run = R.createRun({ seed });
  for (let i = 0; i < 14 && run.roster.length < E.SLOTS.length; i++) {
    let d;
    try { d = R.spin(run, data); } catch (e) { return null; }
    const list = data.playersByTeamSeason[d.team_season_id] || [];
    const opts = d.options.map((k) => { const [id, s] = k.split('|');
      return list.find((p) => String(p.player_id) === id && String(p.season) === s); })
      .filter(Boolean).filter((p) => R.slotForPlayer(run, p) !== null);
    if (!opts.length) return null;
    R.sign(run, pick(opts));
  }
  return run.roster.length === E.SLOTS.length ? run : null;
}

/* The bands a player actually talks in. */
const BANDS = [[70, 79], [80, 84], [85, 89], [90, 94], [95, 99], [100, 200]];
const key = (o) => BANDS.findIndex(([lo, hi]) => o >= lo && o <= hi);
const rows = BANDS.map(() => ({ rosters: 0, n: 0, reg: 0, unbeaten: 0, title: 0, made: 0, bye: 0, wins: 0 }));

/* DRAFT FIRST, PLAY SECOND, AND CAP EACH BAND. Playing every roster drafted gives the
   middle of the range hundreds of rosters and the top of it a handful, which is exactly
   backwards: the top is the band being asked about, and a rate measured on seven rosters is
   seven rosters' luck. This drafts wide, buckets, and then plays the same number from each
   band, so a thin band gets deep coverage rather than a thin answer. */
const PER_BAND = +arg('--rosters', 40);
const pool = BANDS.map(() => []);
for (let r = 0; r < 6000 && pool.some((p, i) => p.length < PER_BAND); r++) {
  const run = draft(PICKS[r % PICKS.length], r * 7919 + 13);
  if (!run) continue;
  const chem = E.resolveChemistry(run.roster, CTX);
  const ovr = E.teamOverall(run.roster, chem.multiplier);
  const b = key(ovr);
  if (b < 0 || pool[b].length >= PER_BAND) continue;
  pool[b].push({ run, chem, ovr, r });
}

for (let b = 0; b < BANDS.length; b++) for (const { run, chem, r } of pool[b]) {
  rows[b].rosters++;
  for (let s = 0; s < SEASONS; s++) {
    const rng = E.createSeededRNG(E.hashSeed('perfect|' + r + '|' + s));
    const sched = E.generateSchedule(data.prepared, rng, MARQUEE == null ? {} : { marquee: MARQUEE });
    const po = E.generatePlayoffs(data.prepared, rng);
    const out = E.playRun(run.roster, chem.multiplier, sched.games, po, league, rng,
      data.prepared, CONST);
    const row = rows[b];
    row.n++;
    row.wins += out.regularWins;
    if (out.undefeatedRegular) row.reg++;
    if (out.seed.made) row.made++;
    if (out.seed.bye) row.bye++;
    if (out.titleWon) row.title++;
    if (out.losses === 0 && out.titleWon) row.unbeaten++;
  }
}

const pc = (x, n) => (100 * x / Math.max(1, n)).toFixed(2) + '%';
console.log('=== unbeaten seasons by team overall: ' + label + ' ===');
console.log('(' + SEASONS + ' seasons a roster)\n');
console.log('overall    rosters   seasons   reg wins    12-0     playoff      bye     title   UNBEATEN');
BANDS.forEach(([lo, hi], i) => {
  const w = rows[i];
  if (!w.n) return;
  const name = hi > 100 ? '100+' : lo + '-' + hi;
  console.log(name.padEnd(11) + String(w.rosters).padStart(6) + String(w.n).padStart(10)
    + (w.wins / w.n).toFixed(2).padStart(11)
    + pc(w.reg, w.n).padStart(9) + pc(w.made, w.n).padStart(11) + pc(w.bye, w.n).padStart(9)
    + pc(w.title, w.n).padStart(10) + pc(w.unbeaten, w.n).padStart(11));
});
