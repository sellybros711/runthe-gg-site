/* Every scoreline this game prints has to be one real college football can produce.
 *
 *   node cfb/build/test/test_scorelines.mjs
 *
 * A player noticed teams scoring one point. The cause was a single misspelled key:
 * toFootballScore read cal.internal_offen_S_e_q and 04-display.mjs writes
 * internal_offen_C_e_q, so the guard in front of the real-scoreline sampler was
 * true on every call and every score the game had ever shown came out of the
 * arithmetic fallback instead. Nothing threw, because the fallback returns a
 * number that looks like a score.
 *
 * So this checks the OUTPUT and the PATH, in that order. The output test is what a
 * player would notice; the path test is what stops the same class of bug returning
 * as a different typo.
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(new URL('../../..', import.meta.url).pathname);
const E = require(ROOT + '/cfb/engine.js');
const R = require(ROOT + '/cfb/run.js');
const rd = (f) => JSON.parse(fs.readFileSync(ROOT + '/cfb/data/' + f, 'utf8'));

let bad = 0;
const ok = (n, p, x) => { if (!p) bad++; console.log((p ? '  ok   ' : ' FAIL  ') + n + (x !== undefined ? '   ' + x : '')); };

const data = R.indexData(rd('cfb_player_seasons.json'), rd('cfb_team_seasons.json'));
const league = rd('cfb_league_context.json');
const cal = rd('cfb_display_calibration.json');

console.log('=== the calibration has the keys the engine reads ===');
/* Spelled out one at a time, because "the file exists" is what everybody checked
   and the file always existed. */
for (const k of ['real_pairs', 'internal_offence_q', 'internal_margin_q',
  'real_margin_q', 'real_team_pts_q']) {
  ok('cal.' + k + ' is present and non-empty',
    Array.isArray(cal[k]) && cal[k].length > 0, String((cal[k] || []).length));
}

console.log('\n=== the sampler is the path that runs, not the fallback ===');
/* legacyFootballScore is reachable and must stay reachable for a project whose
   calibration predates real_pairs. What must not happen is it running by default.
   Detected by its signature: it splits a total evenly, so it can return pairs that
   are not in real_pairs at all. */
const pairSet = new Set(cal.real_pairs.map(([h, l]) => h + ':' + l));
let offPairs = 0, sampled = 0;
const rngAt = (i) => E.createSeededRNG(E.hashSeed('probe|' + i));
for (let i = 0; i < 4000; i++) {
  const you = 40 + (i % 90), them = 40 + ((i * 7) % 90);
  const s = E.toFootballScore(you, them, you > them, rngAt(i), cal);
  sampled++;
  const key = Math.max(s.you, s.them) + ':' + Math.min(s.you, s.them);
  if (!pairSet.has(key)) offPairs++;
}
ok('every scoreline is a pair that really happened', offPairs === 0,
  offPairs + ' of ' + sampled + ' were not in real_pairs');

console.log('\n=== a full season of real seasons ===');
function draft(seed) {
  const run = R.createRun({ seed });
  for (let i = 0; i < 12 && run.roster.length < E.SLOTS.length; i++) {
    let draw; try { draw = R.spin(run, data); } catch (e) { return null; }
    const list = data.playersByTeamSeason[draw.team_season_id] || [];
    const opts = draw.options.map((k) => { const [id, s] = k.split('|');
      return list.find((p) => String(p.player_id) === id && String(p.season) === s); })
      .filter(Boolean).filter((p) => R.slotForPlayer(run, p) !== null);
    const budget = R.remaining(run) - R.reserveFloor(run);
    const legal = opts.filter((p) => p.price_musd <= budget);
    const pool = legal.length ? legal : opts;
    if (!pool.length) return null;
    R.sign(run, pool.reduce((b, p) => (p.ppr_ppg_mean > b.ppr_ppg_mean ? p : b), pool[0]));
  }
  if (run.roster.length !== E.SLOTS.length) return null;
  R.startSeason(run, data, { league });
  return run;
}
const pts = new Map(); let n = 0, games = 0;
for (let d = 0; d < 25; d++) {
  const run = draft(20000 + d * 7919); if (!run) continue;
  const schedule = run.schedule.map((id) => data.byTeamSeasonId[id]);
  const playoffs = run.playoffs.map((id) => data.byTeamSeasonId[id]);
  for (let k = 0; k < 24; k++) {
    const rng = E.createSeededRNG(E.hashSeed('ts|' + run.seed + '|' + k));
    const out = E.playRun(run.roster, run.season.chemistry, schedule, playoffs,
      league, rng, data.prepared);
    for (const r of out.results) {
      const s = E.toFootballScore(r.yourScore, r.oppScore, r.won,
        E.createSeededRNG(E.hashSeed('tv|' + run.seed + '|' + k + '|' + games)), cal);
      games++;
      for (const v of [s.you, s.them]) { pts.set(v, (pts.get(v) || 0) + 1); n++; }
    }
  }
}
console.log('  ' + games + ' games, ' + n + ' team scores');
/* A single team cannot finish on 1 without a one-point safety on a conversion, and
   cannot finish on 4 at all without two safeties and nothing else. Neither appears
   even once in the 16,820 real games this game is built from. */
for (const v of [1, 4]) {
  ok('no team ever scores ' + v, !pts.get(v), String(pts.get(v) || 0));
}
/* 2 and 5 are real, barely: a safety, and a safety plus a field goal. They are
   allowed at roughly the rate they really occur and not at ten times it. */
const realPts = new Map(); let realN = 0;
for (const [h, l, c] of cal.real_pairs) {
  realPts.set(h, (realPts.get(h) || 0) + c);
  realPts.set(l, (realPts.get(l) || 0) + c); realN += 2 * c;
}
for (const v of [2, 5]) {
  const e = ((pts.get(v) || 0) * 100) / n, r = ((realPts.get(v) || 0) * 100) / realN;
  ok('teams score ' + v + ' about as often as they really do', e <= Math.max(0.25, r * 4),
    'engine ' + e.toFixed(3) + '%  real ' + r.toFixed(3) + '%');
}
const meanOf = (m, t) => { let s = 0; for (const [v, c] of m) s += v * c; return s / t; };
const em = meanOf(pts, n), rm = meanOf(realPts, realN);
ok('the average team score is within three points of real', Math.abs(em - rm) <= 3.0,
  'engine ' + em.toFixed(1) + '  real ' + rm.toFixed(1));
ok('nothing negative and nothing absurd',
  [...pts.keys()].every((v) => v >= 0 && v <= 100),
  'range ' + Math.min(...pts.keys()) + ' to ' + Math.max(...pts.keys()));

console.log(bad ? ('\n' + bad + ' FAILURES') : '\nall clear');
process.exit(bad ? 1 : 0);
