/* WHICH SEEDS THE PLAYOFF ACTUALLY HANDS OUT.
 *
 *   node cfb/build/test/probe_seeds.mjs [rosters] [seasons-per-roster]
 *   node cfb/build/test/probe_seeds.mjs 60 40 --gain 2.9 --shift -0.45
 *
 * A player wrote in: "I never get the middle seeds in the playoffs. I'm always top 4 or
 * bottom 3." They are right, and this is the tool that says so and says why.
 *
 * WHY IT HAPPENS. A seed IS a national rank, and a rank comes off the resume, and the
 * resume is dominated by the record: one win is worth WIN + LOSS = 7.5 of it. Ranks 5
 * through 10 are 5.2 of resume wide, because that part of the real country is densely
 * packed. So one win LEAPS the middle of the field, and the only way to land in it is to
 * be an unusual example of your record.
 *
 * A REAL TEAM IS UNUSUAL OFTEN. Its margin z, season to season within one record, has an
 * sd around 0.47. At the gain this shipped with, the player's was 0.19: less than half, so
 * a player's resume moved in near-lockstep with their record, every 11-1 landing within a
 * rank or two of every other 11-1 with nothing left over to carry anybody into the gap.
 *
 * So the fix is a spread, not a shove: widen the player's z to a real team's width and
 * hold the ladder where it is with an offset. Both numbers are fitted here. What must not
 * move is what the ladder is worth: 12-0 about first, 11-1 about fourth, 10-2 about tenth,
 * and the playoff and bye rates tune_bracket.mjs pins.
 *
 * The rosters are drafted ONCE and held, then played over many schedules, so a candidate
 * is compared against the same teams rather than against a new draw.
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(new URL('../../..', import.meta.url).pathname);
const E = require(ROOT + '/cfb/engine.js');
const R = require(ROOT + '/cfb/run.js');
const rd = (f) => JSON.parse(fs.readFileSync(ROOT + '/cfb/data/cfb_' + f, 'utf8'));
const teams = rd('team_seasons.json');
const data = R.indexData(rd('player_seasons.json'), teams);
const LEAGUE = rd('league_context.json').league_avg_pts_allowed_by_season;
const CAL = rd('display_calibration.json');
const CTX = { battery: rd('battery.json'), coaches: rd('coaches.json'), curated: rd('curated.json') };
const P = data.prepared;

const ROSTERS = Number(process.argv[2] || 60);
const PER = Number(process.argv[3] || 40);
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i >= 0 ? Number(process.argv[i + 1]) : d; };
const mean = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
const sd = (a) => { const m = mean(a); return Math.sqrt(mean(a.map((v) => (v - m) * (v - m)))); };
const med = (a) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];

/* The best man on every board, which is the drafting that reaches the field often enough
   to count a seed distribution off. */
function draft(seed) {
  const run = R.createRun({ seed });
  for (let i = 0; i < 14 && run.roster.length < E.SLOTS.length; i++) {
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
  R.startSeason(run, data, CTX);
  return run;
}
const held = [];
for (let i = 0; held.length < ROSTERS && i < ROSTERS * 4; i++) {
  const run = draft(E.hashSeed('seeds|' + i));
  if (run) held.push(run);
}
console.log(held.length + ' rosters held, ' + (held.length * PER) + ' seasons per candidate\n');

/* ── what a real team's own spread looks like, for the target ──────────────── */
{
  const byRec = {};
  for (const t of teams) {
    const w = Number(String(t.record).split('-')[0]);
    if (!(w >= 0)) continue;
    (byRec[t.record] = byRec[t.record] || []).push(t.strength_z || 0);
  }
  const rows = ['12-0', '11-1', '10-2', '9-3', '8-4'].filter((k) => (byRec[k] || []).length >= 5);
  console.log('THE COUNTRY, so there is something to match');
  console.log('  record    n   mean z   sd z');
  rows.forEach((k) => console.log('  ' + k.padEnd(8) + String(byRec[k].length).padStart(4)
    + mean(byRec[k]).toFixed(2).padStart(9) + sd(byRec[k]).toFixed(2).padStart(7)));
  console.log('');
}

/* ── one candidate ─────────────────────────────────────────────────────────── */
/* rankSeason is not parameterised, so the candidate is applied by rebuilding the same
   arithmetic here off the raw margin. This is a probe, not the game: the values it settles
   on go into engine.js, and test_postseason_field.mjs pins what comes out of them. */
function rankWith(gain, shift, marginPerGame, wins, losses, oppZs) {
  const mu = P.pointDiffMean != null ? P.pointDiffMean : 0;
  const s = P.pointDiffSd || 1;
  const z = (marginPerGame - mu) / s * gain + shift;
  const sos = E.scheduleStrength(oppZs, P);
  const resume = E.resumeScore(wins, losses, z, sos);
  return { z, rank: E.nationalRank(resume, P) };
}

/* Every held roster over PER schedules, keeping only what a candidate needs: the record,
   the raw margin and the slate. One pass, so a sweep costs nothing per candidate. */
const seasons = [];
for (const base of held) {
  for (let i = 0; i < PER; i++) {
    const run = JSON.parse(JSON.stringify(base));
    run.seed = E.hashSeed('sched|' + base.seed + '|' + i);
    run.rngCalls = 0;
    /* A fresh schedule and a fresh season off the same roster. */
    const rng = E.createSeededRNG(run.seed);
    const sched = E.generateSchedule(P, () => { run.rngCalls++; return rng(); });
    run.schedule = sched.games.map((g) => g.team_season_id);
    while (run.phase === R.PHASES.SEASON) R.advanceWeek(run, data, LEAGUE, CAL);
    const reg = run.season.results.filter((x) => !x.playoff && !x.bowl);
    const margin = reg.reduce((t, x) => t + (x.yourScore - x.oppScore), 0)
      / Math.max(1, reg.length) / (E.CONSTANTS.SCALE || 1);
    seasons.push({
      wins: run.season.regularWins, losses: run.season.regularLosses, margin,
      oppZs: run.schedule.map((id) => (data.byTeamSeasonId[id] || {}).strength_z || 0),
    });
  }
}

function measure(gain, shift) {
  const seeds = new Array(13).fill(0);
  const byRec = {};
  let made = 0, bye = 0;
  for (const s of seasons) {
    const { z, rank } = rankWith(gain, shift, s.margin, s.wins, s.losses, s.oppZs);
    const key = s.wins + '-' + s.losses;
    (byRec[key] = byRec[key] || []).push({ z, rank });
    const seat = E.seedFromRanking(rank, s.wins);
    if (seat.made) { made++; seeds[seat.seed]++; if (seat.bye) bye++; }
  }
  return { seeds, made, bye, byRec, n: seasons.length };
}

/* HOW EVEN THE FIELD IS, in one number, so a sweep can be read down a column. The share of
   the twelve seats that never come up at all, plus how far the shares are from a twelfth
   each. Zero is a perfectly even field; the reading before this change is about 0.6. */
function lumpiness(seeds, made) {
  if (!made) return 1;
  let err = 0;
  for (let s = 1; s <= 12; s++) err += Math.abs(seeds[s] / made - 1 / 12);
  return err / 2;      // total variation distance from an even field
}

function report(label, gain, shift) {
  const m = measure(gain, shift);
  const empty = [];
  let bars = '';
  for (let s = 1; s <= 12; s++) {
    if (!m.seeds[s]) empty.push(s);
    const pct = m.seeds[s] * 100 / Math.max(1, m.made);
    bars += (s > 1 ? ' ' : '') + String(Math.round(pct)).padStart(2);
  }
  console.log(label.padEnd(22)
    + ('gain ' + gain.toFixed(2) + '  shift ' + shift.toFixed(2)).padEnd(26)
    + 'playoff ' + (m.made * 100 / m.n).toFixed(2) + '%'
    + '  bye ' + (m.bye * 100 / m.n).toFixed(2) + '%'
    + '  lump ' + lumpiness(m.seeds, m.made).toFixed(3)
    + '  never: ' + (empty.length ? empty.join(',') : 'none'));
  return { m, bars };
}

console.log('THE FIELD AS IT IS, AND AS IT COULD BE');
console.log('  (lump is how far the twelve seats are from a twelfth each: 0 is even)\n');
/* WHAT THE GAME SHIPS, read off the engine rather than written down here, so this stays a
   comparison against the build in front of you. */
const NOW = { gain: E.MARGIN_GAIN, shift: E.MARGIN_SHIFT || 0 };
/* AND WHAT IT SHIPPED WHEN THE COMPLAINT CAME IN, kept as the yardstick every reading
   below is measured against. Gain 1.30 and no shift: lump 0.592, seeds 6 and 7 never
   dealt at all, and the eleven seed taking 49% of the whole field. */
const CUR = { gain: 1.30, shift: 0 };
const cur = report('before the fix', CUR.gain, CUR.shift);
report('as it ships now', NOW.gain, NOW.shift);

if (process.argv.indexOf('--gain') >= 0) {
  const g = arg('gain', 1.3), sh = arg('shift', 0);
  const one = report('candidate', g, sh);
  showDetail(g, sh, one.m);
} else {
  console.log('');
  /* The spread that matches a real team's, and the offset that holds the ladder. Swept
     rather than solved: the two interact through nationalRank, which is not linear. */
  const best = { lump: 9, gain: 0, shift: 0 };
  for (let g = 1.3; g <= 4.01; g += 0.2) {
    for (let sh = -1.2; sh <= 0.41; sh += 0.05) {
      const m = measure(g, sh);
      const playoff = m.made * 100 / m.n;
      /* Held to the rate it ships at, within a quarter point, so this is a redistribution
         of the field and not a widening of it. */
      if (Math.abs(playoff - (cur.m.made * 100 / cur.m.n)) > 0.25) continue;
      const l = lumpiness(m.seeds, m.made);
      if (l < best.lump) { best.lump = l; best.gain = g; best.shift = sh; }
    }
  }
  console.log('');
  const fit = report('fitted', best.gain, best.shift);
  showDetail(best.gain, best.shift, fit.m);
}

function showDetail(gain, shift, m) {
  console.log('\n  seed    1    2    3    4    5    6    7    8    9   10   11   12');
  let line = '  share';
  for (let s = 1; s <= 12; s++) line += (m.seeds[s] * 100 / Math.max(1, m.made)).toFixed(0).padStart(5) + '%';
  console.log(line.replace(/%/g, ''));
  const cm = measure(CUR.gain, CUR.shift);
  let was = '  before';
  for (let s = 1; s <= 12; s++) was += (cm.seeds[s] * 100 / Math.max(1, cm.made)).toFixed(0).padStart(5);
  console.log(was);

  /* THE LADDER, which is the thing that must not move: what each record is worth. */
  console.log('\n  record      n   median rank (was)   sd of z (was)   playoff% (was)');
  for (const k of ['12-0', '11-1', '10-2', '9-3', '8-4', '7-5']) {
    const a = m.byRec[k], b = cm.byRec[k];
    if (!a || a.length < 8) continue;
    const inField = (rows, wins) => rows.filter((r) => E.seedFromRanking(r.rank, wins).made).length * 100 / rows.length;
    const w = Number(k.split('-')[0]);
    console.log('  ' + k.padEnd(10) + String(a.length).padStart(5)
      + String(med(a.map((r) => r.rank))).padStart(11) + (' (' + med(b.map((r) => r.rank)) + ')').padEnd(9)
      + sd(a.map((r) => r.z)).toFixed(2).padStart(9) + (' (' + sd(b.map((r) => r.z)).toFixed(2) + ')').padEnd(10)
      + inField(a, w).toFixed(0).padStart(8) + '%' + (' (' + inField(b, w).toFixed(0) + '%)'));
  }
}
