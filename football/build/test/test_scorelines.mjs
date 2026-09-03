/* Every scoreline this game prints has to be one the NFL can produce.
 *
 *   node football/build/test/test_scorelines.mjs
 *
 * WHY THIS EXISTS. toFootballScore read cal.internal_offen_S_e_q and
 * build/04-display.mjs writes internal_offen_C_e_q. No such key as the first has
 * ever existed in display_calibration.json, so the guard in front of the
 * real-scoreline sampler was true on every call and every score this game had ever
 * shown came out of the arithmetic fallback instead. Measured over 40,000 games:
 * 14.35% of finals were scorelines the NFL has never produced, 0.588% of teams
 * scored 4 and 1.035% scored 2, against 0.000% and 0.014% in the 7,276 real games
 * the calibration is built from.
 *
 * Nothing threw. No single score looked absurd. That is what a silent fallback
 * buys you, and it is the reason this file checks the PATH as well as the output:
 * a typo in the other direction would put the game straight back where it was and
 * every assertion about averages would still pass.
 *
 * The college game had the identical bug and the same fix. If you are reading this
 * because you are about to add a third game, take the calibration key names from
 * the build stage rather than from memory.
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(new URL('../../..', import.meta.url).pathname);
const E = require(ROOT + '/football/engine.js');
const rd = (f) => JSON.parse(fs.readFileSync(ROOT + '/football/data/' + f, 'utf8'));

let bad = 0;
const ok = (n, p, x) => { if (!p) bad++; console.log((p ? '  ok   ' : ' FAIL  ') + n + (x !== undefined ? '   ' + x : '')); };

const players = rd('player_seasons.json');
const teamSeasons = rd('team_seasons.json');
const lc = rd('league_context.json').league_avg_pts_allowed_by_season;
const cal = rd('display_calibration.json');

console.log('=== the calibration has the keys the engine reads ===');
/* Spelled out one at a time, because "the file exists" is what everybody checked
   and the file always existed. */
for (const k of ['real_pairs', 'internal_offence_q', 'internal_margin_q',
  'real_margin_q', 'real_team_pts_q']) {
  ok('cal.' + k + ' is present and non-empty',
    Array.isArray(cal[k]) && cal[k].length > 0, String((cal[k] || []).length));
}

/* ── the corpus of real NFL finals ──────────────────────────────────────── */
const realKeys = new Set(cal.real_pairs.map(([h, l]) => h + ':' + l));
const realTeam = [];
for (const [hi, lo, n] of cal.real_pairs) for (let i = 0; i < n; i++) realTeam.push(hi, lo);
const pctOf = (arr, v) => 100 * arr.filter((x) => x === v).length / arr.length;
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;

console.log('\n=== the sampler is the path that runs, not the fallback ===');
/* The load-bearing assertion. The fallback builds a scoreline arithmetically and
   can land on pairs that have never happened, so "every final is a real pair" is
   exactly the thing that is false when the sampler is switched off. */
{
  const rng = E.createSeededRNG(31337);
  let miss = 0, n = 0;
  for (let i = 0; i < 4000; i++) {
    const you = 30 + rng() * 80, them = 30 + rng() * 80;
    const s = E.toFootballScore(you, them, you > them, rng, cal);
    n++;
    if (!realKeys.has(Math.max(s.you, s.them) + ':' + Math.min(s.you, s.them))) miss++;
  }
  ok('every scoreline is a final the NFL has really produced', miss === 0,
    miss + ' of ' + n + ' were not in real_pairs');
}

console.log('\n=== switching paths cannot change who wins ===');
/* THE INVARIANT THAT MADE THE FIX SAFE TO SHIP, and the reason it is asserted here
   rather than explained in a commit message. rng is a single sequential stream
   shared by every game in a season, so if the two scoreline paths drew different
   numbers of values, changing which one runs would shift the stream and silently
   rewrite the outcome of every later week. Both draw exactly one. Anyone adding a
   second draw to either path breaks the run history of a live game, and this is
   what tells them. */
const countingRng = (real) => { let n = 0; const f = () => { n++; return real(); }; f.count = () => n; return f; };
{
  const base = E.createSeededRNG(4242);
  const a = countingRng(base);
  E.toFootballScore(70, 45, true, a, cal);
  ok('the sampler draws exactly one rng value', a.count() === 1, String(a.count()));

  /* The fallback, reached the way a genuinely old calibration file would reach it. */
  const older = Object.assign({}, cal); delete older.real_pairs;
  const b = countingRng(base);
  E.toFootballScore(70, 45, true, b, older);
  ok('and the fallback draws exactly one too', b.count() === 1, String(b.count()));
}

console.log('\n=== played out over real seasons ===');
{
  const rng = E.createSeededRNG(20260810);
  const roster = E.SLOTS.map((slot) => {
    const pool = players.filter((p) => E.SLOT_ELIGIBILITY[slot].includes(p.position));
    return pool[Math.floor(rng() * pool.length)];
  });
  const scores = [];
  for (let i = 0; i < 8000; i++) {
    const opp = teamSeasons[Math.floor(rng() * teamSeasons.length)];
    const r = E.resolveGame(roster, 1.05, opp, lc[opp.season] ?? 21.5, rng);
    const s = E.toFootballScore(r.yourScore, r.oppScore, r.won, rng, cal);
    scores.push(s.you, s.them);
  }
  console.log('  ' + (scores.length / 2) + ' games, ' + scores.length + ' team scores');

  /* 1 and 4 are not low-probability in the NFL, they are impossible: there is no
     combination of scoring plays that reaches either. The old arithmetic produced
     both anyway. */
  ok('no team ever scores 1', pctOf(scores, 1) === 0, String(pctOf(scores, 1)));
  ok('no team ever scores 4', pctOf(scores, 4) === 0, String(pctOf(scores, 4)));

  /* 2 and 5 are possible and vanishingly rare, so the test is that they stay rare
     rather than that they never happen. Twice the real rate is the line: the old
     engine was at seventy times it. */
  for (const v of [2, 5]) {
    const got = pctOf(scores, v), want = pctOf(realTeam, v);
    ok('teams score ' + v + ' about as often as they really do',
      got <= Math.max(want * 2, 0.05),
      'engine ' + got.toFixed(3) + '%  real ' + want.toFixed(3) + '%');
  }

  const gm = mean(scores), rm = mean(realTeam);
  ok('the average team score is within three points of real',
    Math.abs(gm - rm) <= 3, 'engine ' + gm.toFixed(1) + '  real ' + rm.toFixed(1));
  ok('nothing negative and nothing absurd',
    Math.min(...scores) >= 0 && Math.max(...scores) <= 80,
    'range ' + Math.min(...scores) + ' to ' + Math.max(...scores));
}

console.log(bad ? '\n' + bad + ' FAILURES' : '\nall clear');
process.exit(bad ? 1 : 0);
