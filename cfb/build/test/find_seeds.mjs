/* Not a test. Finds the pinned run seeds test_bracket.mjs drives the browser with.
 *
 *   node cfb/build/test/find_seeds.mjs [--from 0] [--to 400]
 *
 * That suite needs two runs of a known SHAPE: a top-four seed that sits out the first round
 * and watches it resolve, and a five-to-twelve seed that plays all four. A seed that lands
 * on the wrong shape does not fail loudly, it quietly stops covering the thing the file says
 * it covers, so the seeds are pinned rather than hunted for at runtime.
 *
 * They also go stale on purpose. Any change to the season, the prices or the cap moves which
 * seeds land where: WEEK_UPSET moved seed 106 off the bye path the day it went in. This is
 * the tool for re-pinning them rather than a hand search through the browser.
 *
 * The draft here has to be the one the browser performs, or the picks it prints will not
 * reproduce: best available on every board, and the slot printed beside each man is the one
 * signing him without an answer chooses, which is what the suite then clicks by data-i.
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
const cal = rd('cfb_display_calibration.json');
const CTX = { battery: rd('cfb_battery.json'), curated: rd('cfb_curated.json'), coaches: rd('cfb_coaches.json') };

const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? +process.argv[i + 1] : d; };
const FROM = arg('--from', 0), TO = arg('--to', 400);

function attempt(seed) {
  const run = R.createRun({ seed });
  const picks = [];
  for (let i = 0; i < 14 && run.roster.length < E.SLOTS.length; i++) {
    let d;
    try { d = R.spin(run, data); } catch (e) { return null; }
    const list = data.playersByTeamSeason[d.team_season_id] || [];
    const opts = d.options.map((k) => { const [id, s] = k.split('|');
      return list.find((p) => String(p.player_id) === id && String(p.season) === s); })
      .filter(Boolean).filter((p) => R.slotForPlayer(run, p) !== null);
    if (!opts.length) return null;
    const p = opts.reduce((b, x) => (x.ppr_ppg_mean > b.ppr_ppg_mean ? x : b));
    /* The spot signing him takes, which is the one the browser has to be told to click when
       the man plays two positions and the sheet asks. */
    const slot = R.slotForPlayer(run, p);
    R.sign(run, p);
    picks.push(p.player_id + '|' + p.season + ':' + slot);
  }
  if (run.roster.length < E.SLOTS.length) return null;

  const chem = E.resolveChemistry(run.roster, CTX);
  R.startSeason(run, data, CTX);
  for (let w = 0; w < 40 && run.phase === R.PHASES.SEASON; w++) {
    R.advanceWeek(run, data, league, cal);
  }
  const sd = run.playoffSeed;
  return {
    seed, picks,
    overall: E.teamOverall(run.roster, chem.multiplier),
    record: run.season.wins + '-' + run.season.losses,
    made: !!(sd && sd.made), bye: !!(sd && sd.bye),
    poSeed: sd && sd.made ? sd.seed : null,
    names: run.roster.map((p) => p.name).join(', '),
  };
}

const bye = [], noBye = [];
for (let s = FROM; s <= TO; s++) {
  const a = attempt(s);
  if (!a || !a.made) continue;
  (a.bye ? bye : noBye).push(a);
}

const show = (title, list) => {
  console.log('\n=== ' + title + ' (' + list.length + ' found) ===');
  /* The strongest few first: a run that scrapes in is one bad roll from changing shape the
     next time anything moves, and the point of pinning is to stop that happening. */
  for (const a of list.slice(0, 5)) {
    console.log('\nseed ' + a.seed + '   overall ' + a.overall.toFixed(1)
      + '   ' + a.record + '   No. ' + a.poSeed + ' seed');
    console.log('  ' + a.names);
    console.log('  ' + JSON.stringify(a.picks));
  }
};
bye.sort((a, b) => a.poSeed - b.poSeed || b.overall - a.overall);
noBye.sort((a, b) => Math.abs(a.poSeed - 8) - Math.abs(b.poSeed - 8) || b.overall - a.overall);
show('top-four seeds, which sit out the first round', bye);
show('five to twelve seeds, which play all four rounds', noBye);
