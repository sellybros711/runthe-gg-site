/* A HELD SEASON IS THE SAME SEASON.
 *
 *   node cfb/build/test/test_hold_season.mjs [tries]
 *
 * A guest who makes the playoff is asked for an account before playing it out, and two
 * of the three ways to answer that leave the page: Google is a full redirect and a new
 * account is an email confirmation. The run lives in one variable and survives neither,
 * so the game writes it to localStorage when the gate goes up and reads it back on the
 * next load.
 *
 * THAT ONLY WORKS IF A RUN IS ITS OWN SAVE FILE. It is, by construction: the seed and a
 * call count stand in for the generator, so rngFor rebuilds the exact stream from two
 * numbers and nothing else in a run is anything but data. This pins it, because the day
 * that stops being true is the day a player signs in to finish a season and gets a
 * different one, and nothing would say so.
 *
 * What is compared is the whole postseason on both sides of a JSON round trip: every
 * score, every opponent, the bracket the other eleven teams played out, and the verdict.
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
const data = R.indexData(players, rd('team_seasons.json'));
const LEAGUE = rd('league_context.json').league_avg_pts_allowed_by_season;
const CAL = rd('display_calibration.json');
/* The index the page keeps, and the one the restore reads: a held roster comes back as
   the data's own player objects rather than the copies JSON handed over. */
const BYKEY = new Map(players.map((p) => [p.player_id + '|' + p.season, p]));
const CTX = { battery: rd('battery.json'), coaches: rd('coaches.json'), curated: rd('curated.json') };

let bad = 0;
const ok = (n, p, x) => { if (!p) bad++; console.log((p ? '  ok   ' : ' FAIL  ') + n + (x !== undefined ? '   ' + x : '')); };

/* Draft the best man offered at every turn, which is the quickest way to a roster good
   enough to reach the field often. */
function toSeeding(seed) {
  const run = R.createRun({ seed });
  for (let i = 0; i < 12 && run.roster.length < E.SLOTS.length; i++) {
    let draw;
    try { draw = R.spin(run, data); } catch (e) { return null; }
    const list = data.playersByTeamSeason[draw.team_season_id] || [];
    const opts = draw.options
      .map((k) => {
        const [id, s] = k.split('|');
        return list.find((p) => String(p.player_id) === id && String(p.season) === s);
      })
      .filter(Boolean).filter((p) => R.slotForPlayer(run, p) !== null);
    if (!opts.length) return null;
    R.sign(run, opts.reduce((b, p) => (p.ppr_ppg_mean > b.ppr_ppg_mean ? p : b)));
  }
  if (run.roster.length !== E.SLOTS.length) return null;
  R.startSeason(run, data, CTX);
  while (run.phase === R.PHASES.SEASON) R.advanceWeek(run, data, LEAGUE, CAL);
  return run;
}

/* What the page does on the way back in: the parsed run, with the roster handed back its
   own objects. Everything else in a run is read by value. */
function restore(r) {
  r.roster = r.roster.map((p) => BYKEY.get(p.player_id + '|' + p.season) || p);
  return r;
}

function playOut(run) {
  R.startPlayoffs(run);
  while (run.phase === R.PHASES.PLAYOFFS) R.advanceWeek(run, data, LEAGUE, CAL);
  return run;
}

const TRIES = Number(process.argv[2] || 400);
let tested = 0;
for (let i = 0; i < TRIES && tested < 25; i++) {
  const run = toSeeding(E.hashSeed('hold|' + i));
  if (!run || run.phase !== R.PHASES.SEEDING || !run.playoffSeed.made) continue;
  tested++;

  /* Exactly what goes into localStorage, and exactly what comes back out of it. */
  const held = JSON.stringify({ v: 1, at: Date.now(), run });
  /* The control keeps playing in memory, as a player who never left the page. */
  const straight = playOut(JSON.parse(JSON.stringify(run)));
  const resumed = playOut(restore(JSON.parse(held).run));

  const same = (k, a, b) => {
    if (JSON.stringify(a) === JSON.stringify(b)) return true;
    if (tested <= 3 || bad < 3) console.log('        ' + k + '\n          straight ' + JSON.stringify(a)
      + '\n          resumed  ' + JSON.stringify(b));
    return false;
  };
  const post = (r) => r.season.results.filter((x) => x.playoff);
  ok('seed ' + i + ': every playoff game is the same game',
    same('results', post(straight), post(resumed)),
    'No. ' + run.playoffSeed.seed + ' seed, ' + post(straight).length + ' games');
  ok('seed ' + i + ': the bracket around them played out the same',
    same('bracket', straight.bracket.rounds, resumed.bracket.rounds));
  ok('seed ' + i + ': the same verdict',
    same('outcome', straight.outcome, resumed.outcome),
    straight.outcome.record + (straight.outcome.titleWon ? ' champions' : ''));
}

ok('there were seasons to test at all', tested > 0, tested + ' playoff seasons');

/* THE THINGS THE PAGE REFUSES TO READ BACK. Not the storage code itself, which lives
   inside the page, but the shape it is checking for: a held season is a run at seeding
   with a place in the field, and anything else is dropped rather than repaired. */
const seeding = toSeeding(E.hashSeed('hold|shape'));
ok('a run carries the two things the restore checks',
  !!(seeding && typeof seeding.phase === 'string' && seeding.playoffSeed
     && 'made' in seeding.playoffSeed && Array.isArray(seeding.roster)));
ok('a full roster is the slot count, which is what the restore requires',
  !!seeding && seeding.roster.length === E.SLOTS.length, E.SLOTS.length + ' slots');

console.log(bad ? '\n' + bad + ' FAILED' : '\nall clear');
process.exit(bad ? 1 : 0);
