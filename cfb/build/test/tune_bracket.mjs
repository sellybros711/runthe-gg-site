/* Put the title back where it was, now that a real bracket decides it.
 *
 *   node cfb/build/test/tune_bracket.mjs                  # sweep
 *   node cfb/build/test/tune_bracket.mjs --semi 92 --final 95   # one setting
 *
 * probe_bracket.mjs measures the postseason the way the game is actually played, and it
 * is the thing to trust. But it reads the title rate off about six titles, and six is
 * noise: the note on ROUND_EDGE_PIVOT in engine.js already records two tuning readings
 * that turned out to be sampling noise and both of them looked like results. So this
 * drafts the rosters ONCE, holds them, and runs enough seasons on each candidate that a
 * 0.24% rate is counted in the hundreds rather than the handful.
 *
 * Only the two late pivots move. The first round and the quarterfinal decide how far a
 * season gets, and that part of the shape came back unchanged when the bracket went in;
 * the semifinal and the final decide whether it ends in a trophy, and that is what the
 * bracket moved.
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(new URL('../../..', import.meta.url).pathname);
const E = require(ROOT + '/cfb/engine.js');
const R = require(ROOT + '/cfb/run.js');
const rd = (f) => JSON.parse(fs.readFileSync(ROOT + '/cfb/data/' + f, 'utf8'));
const data = R.indexData(rd('cfb_player_seasons.json'), rd('cfb_team_seasons.json'));
const league = rd('cfb_league_context.json');
const ctx = { battery: rd('cfb_battery.json'), curated: rd('cfb_curated.json'), coaches: rd('cfb_coaches.json') };

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i >= 0 ? Number(process.argv[i + 1]) : d; };

/* The best man on every board. Greedy is not a yardstick for the economy, but it is the
   right one here: it is the drafting that reaches the title game often enough to measure
   one, and holding ITS rate is what holds the game's. */
function draft(seed) {
  const run = R.createRun({ seed });
  for (let i = 0; i < 14 && run.roster.length < E.SLOTS.length; i++) {
    let draw;
    try { draw = R.spin(run, data); } catch (e) { return null; }
    const list = data.playersByTeamSeason[draw.team_season_id] || [];
    const opts = draw.options.map((k) => { const [id, s] = k.split('|');
      return list.find((p) => String(p.player_id) === id && String(p.season) === s); })
      .filter(Boolean).filter((p) => R.slotForPlayer(run, p) !== null);
    if (!opts.length) return null;
    R.sign(run, opts.reduce((b, p) => (p.ppr_ppg_mean > b.ppr_ppg_mean ? p : b)));
  }
  return run.roster.length === E.SLOTS.length ? run : null;
}

const ROSTERS = arg('rosters', 220);
const SEASONS = arg('seasons', 260);
process.stdout.write('drafting ' + ROSTERS + ' rosters ');
const held = [];
for (let r = 0; r < ROSTERS; r++) {
  const run = draft(r * 7919 + 13);
  if (!run) continue;
  const chem = E.resolveChemistry(run.roster, ctx);
  held.push({ roster: run.roster, chem: chem.multiplier });
  if (r % 40 === 0) process.stdout.write('.');
}
console.log(' ' + held.length + ' held, ' + (held.length * SEASONS) + ' seasons per candidate\n');

/* A candidate is a whole settings object handed to playRun, not a global poked between
   runs, so nothing leaks from one reading into the next. */
function measure(semi, final, eliteSeeds, greatSeeds, bracket = true) {
  const C = { ...E.CONSTANTS, BRACKET_ENABLED: bracket,
    BRACKET_ELITE_SEEDS: eliteSeeds, BRACKET_GREAT_SEEDS: greatSeeds,
    ROUND_EDGE_PIVOT: { ...E.CONSTANTS.ROUND_EDGE_PIVOT,
      'CFP Semifinal': semi, 'CFP Championship': final } };
  let n = 0, made = 0, bye = 0, title = 0, perfect = 0, byeTitle = 0, byeN = 0;
  for (let i = 0; i < held.length; i++) {
    const h = held[i];
    for (let s = 0; s < SEASONS; s++) {
      const rng = E.createSeededRNG(E.hashSeed('tune|' + i + '|' + s));
      const sched = E.generateSchedule(data.prepared, rng);
      const po = E.generatePlayoffs(data.prepared, rng);
      const out = E.playRun(h.roster, h.chem, sched.games, po, league, rng, data.prepared, C);
      n++;
      if (out.seed.made) made++;
      if (out.seed.bye) { byeN++; bye++; if (out.titleWon) byeTitle++; }
      if (out.titleWon) title++;
      if (out.perfect) perfect++;
    }
  }
  return { n, made, bye, title, perfect, byeTitle, byeN };
}

const pc = (x, n) => (100 * x / Math.max(1, n)).toFixed(3) + '%';
function row(label, semi, final, el, gr, bracket = true) {
  const m = measure(semi, final, el, gr, bracket);
  console.log(String(label).padEnd(18) + (bracket ? el + '/' + gr : 'ladder').padStart(6)
    + String(semi).padStart(6) + String(final).padStart(7)
    + pc(m.made, m.n).padStart(11) + pc(m.bye, m.n).padStart(10)
    + pc(m.title, m.n).padStart(10) + pc(m.perfect, m.n).padStart(10)
    + String(m.title).padStart(8) + pc(m.byeTitle, m.byeN).padStart(12));
}

console.log('TARGET: playoff 17.42%  bye 4.65%  title 0.240%  perfect 0.060%  titles from a bye 4.2%');
console.log('candidate         tiers  semi  final    playoff       bye     title   perfect  titles  from a bye');

const one = process.argv.includes('--semi') || process.argv.includes('--elite');
if (one) {
  row('as asked', arg('semi', 94), arg('final', 97), arg('elite', 2), arg('great', 8));
} else {
  /* THE LADDER AT FULL SAMPLE, which is the number to hold. The 0.240% in the target
     line above was read off sixteen titles by probe_bracket.mjs, and sixteen is not a
     rate; this row is the same seasons the candidates below are measured over. */
  row('the old ladder', 94, 97, 1, 6, false);
  for (const gr of [7, 6, 5]) row('elite 1, great ' + gr, 94, 97, 1, gr);
  row('elite 2, great 6', 94, 97, 2, 6);
}
