/* What the postseason does to a roster, measured the same way before and after the
 * bracket goes in.
 *
 *   node cfb/build/test/probe_bracket.mjs [--label baseline]
 *
 * THERE IS NO BRACKET TODAY. generatePlayoffs draws a LADDER of four opponents by
 * strength -- a nine-or-ten-win team, then two eleven-win teams, then one of the best
 * seasons in the data -- and playoffOpponent hands you the next rung each round. Nothing
 * tracks who else is in the field, nothing advances, and the seed beside the opponent on
 * the scoreboard is that team's rank in its OWN real season, which is why a four seed can
 * appear to play a four seed.
 *
 * Replacing that ladder with a real twelve-team bracket changes who you meet and when,
 * and this game's title and perfect-season rates have been tuned twice already against
 * the ladder's exact shape. So this measures the rates first, and the same numbers have
 * to come back after. Anything else is a difficulty change smuggled in behind a
 * formatting fix.
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(new URL('../../..', import.meta.url).pathname);
const E = require(ROOT + '/cfb/engine.js');
const R = require(ROOT + '/cfb/run.js');
const rd = (f) => JSON.parse(fs.readFileSync(ROOT + '/cfb/data/' + f, 'utf8'));
const players = rd('cfb_player_seasons.json');
const teams = rd('cfb_team_seasons.json');
const league = rd('cfb_league_context.json');
const data = R.indexData(players, teams);

const label = (() => {
  const i = process.argv.indexOf('--label');
  return i >= 0 ? process.argv[i + 1] : 'current';
})();

/* The drafting policies that bracket ordinary play: the best man on every board, and a
   middling one. Rates are read per policy because a bracket that only hurts good rosters
   is a different change from one that hurts everybody. */
const STRATS = {
  greedy: (o) => o.reduce((b, p) => (p.ppr_ppg_mean > b.ppr_ppg_mean ? p : b)),
  median: (o) => o.slice().sort((a, b) => a.ppr_ppg_mean - b.ppr_ppg_mean)[Math.floor(o.length / 2)],
};

function draft(pick, seed) {
  const run = R.createRun({ seed });
  for (let i = 0; i < 14 && run.roster.length < E.SLOTS.length; i++) {
    let draw;
    try { draw = R.spin(run, data); } catch (e) { return null; }
    const list = data.playersByTeamSeason[draw.team_season_id] || [];
    const opts = draw.options.map((k) => { const [id, s] = k.split('|');
      return list.find((p) => String(p.player_id) === id && String(p.season) === s); })
      .filter(Boolean).filter((p) => R.slotForPlayer(run, p) !== null);
    if (!opts.length) return null;
    R.sign(run, pick(opts));
  }
  return run.roster.length === E.SLOTS.length ? run : null;
}

const SEASONS_PER_ROSTER = 30;
const ROSTERS = 220;

console.log('=== postseason rates: ' + label + ' ===');
console.log('policy    rosters  overall   playoff    bye    title   perfect   titles from a bye');
for (const [name, pick] of Object.entries(STRATS)) {
  let n = 0, made = 0, bye = 0, title = 0, perfect = 0, byeTitle = 0, byeN = 0;
  const overalls = [];
  for (let r = 0; r < ROSTERS; r++) {
    const run = draft(pick, r * 7919 + 13);
    if (!run) continue;
    const chem = E.resolveChemistry(run.roster, {
      battery: rd('cfb_battery.json'), curated: rd('cfb_curated.json'), coaches: rd('cfb_coaches.json'),
    });
    overalls.push(E.teamOverall(run.roster, chem.multiplier));
    for (let s = 0; s < SEASONS_PER_ROSTER; s++) {
      const rng = E.createSeededRNG(E.hashSeed('probe|' + r + '|' + s));
      const sched = E.generateSchedule(data.prepared, rng);
      const po = E.generatePlayoffs(data.prepared, rng);
      const out = E.playRun(run.roster, chem.multiplier, sched.games, po, league, rng, data.prepared);
      n++;
      if (out.seed.made) made++;
      if (out.seed.bye) { bye++; byeN++; if (out.titleWon) byeTitle++; }
      if (out.titleWon) title++;
      if (out.perfect) perfect++;
    }
  }
  const pc = (x) => (100 * x / Math.max(1, n)).toFixed(2) + '%';
  const med = overalls.sort((a, b) => a - b)[Math.floor(overalls.length / 2)];
  console.log(name.padEnd(9) + String(overalls.length).padStart(6)
    + med.toFixed(1).padStart(9)
    + pc(made).padStart(10) + pc(bye).padStart(8) + pc(title).padStart(9) + pc(perfect).padStart(9)
    + ((100 * byeTitle / Math.max(1, byeN)).toFixed(1) + '%').padStart(18));
}

/* And the thing a player can see with their own eyes: who they are actually put in front
   of. Under the ladder this is a strength tier and nothing else. */
console.log('\n=== who a top-four seed meets, over 400 brackets ===');
const rng0 = E.createSeededRNG(E.hashSeed('who'));
const byRound = [{}, {}, {}, {}];
for (let i = 0; i < 400; i++) {
  const po = E.generatePlayoffs(data.prepared, rng0);
  po.forEach((t, idx) => {
    const w = Number(String(t.record).split('-')[0]) || 0;
    byRound[idx][w] = (byRound[idx][w] || 0) + 1;
  });
}
const NAMES = E.playoffRoundNames(4);
byRound.forEach((h, i) => {
  const tot = Object.values(h).reduce((a, b) => a + b, 0);
  const wins = Object.keys(h).map(Number).sort((a, b) => a - b);
  console.log('  ' + NAMES[i].padEnd(18)
    + wins.map((w) => w + '-win ' + (100 * h[w] / tot).toFixed(0) + '%').join(', '));
});
