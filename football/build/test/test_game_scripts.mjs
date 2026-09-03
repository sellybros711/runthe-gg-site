/* The game script: not just what the final score was, but how it got there.
 *
 *   node football/build/test/test_game_scripts.mjs
 *
 * test_scorelines.mjs checks the FINAL is a real one. This checks the story that reaches
 * it, which had no coverage at all and had drifted into a shape football never has.
 *
 * Measured over 18,000 scripts before any of it was fixed: the fourth quarter was the
 * QUIETEST at 17% of the points and the first was the loudest at 32%, so every game opened
 * with a bang and trailed off; and the lead changed hands 0.60 times a game against
 * something nearer 2.4 in real football, because the placer alternated the two sides so
 * evenly that whoever scored first was usually ahead from the first whistle to the last.
 *
 * Scores are drawn straight from the real-pair table rather than played out, because the
 * script generator takes a final and nothing else: feeding it real finals tests it over
 * exactly the inputs it will ever see, and keeps this file independent of how rosters are
 * built. (The roster question is not academic -- see the note on the frequency exponent in
 * engine.js for how a harness that ignored the salary cap produced a whole wrong story.)
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');
const E = require(path.join(ROOT, 'football/engine.js'));
const cal = JSON.parse(fs.readFileSync(path.join(ROOT, 'football/data/display_calibration.json'), 'utf8'));

let bad = 0;
const ok = (n, p, x) => { if (!p) bad++; console.log((p ? '  ok   ' : ' FAIL  ') + n + (x !== undefined ? '   ' + x : '')); };
const pct = (n, d) => (100 * n / d);

/* Draw finals in proportion to how often they really happened, so the sample is the real
   mix of blowouts and one-score games rather than a flat sweep of the pair table. */
const rng = E.createSeededRNG(8161);
const cum = []; let tot = 0;
for (const [hi, lo, n] of cal.real_pairs) { tot += n; cum.push([tot, hi, lo]); }
const drawFinal = () => {
  const r = rng() * tot;
  for (const [c, hi, lo] of cum) if (r <= c) return rng() < 0.5 ? [hi, lo] : [lo, hi];
  return [cal.real_pairs[0][0], cal.real_pairs[0][1]];
};

const N = 20000;
const qPts = [0, 0, 0, 0];
let wrongFinal = 0, dupClock = 0, lateFG = 0, emptyButScored = 0, outOfOrder = 0, badQuarter = 0;
let events = 0, scripts = 0;
let closeLeads = 0, closeGames = 0, blowLeads = 0, blowGames = 0;
let otGames = 0, otRegNotLevel = 0, otLoserScored = 0, otNoScore = 0;

for (let i = 0; i < N; i++) {
  const [you, them] = drawFinal();
  const sc = E.scoringScript(you, them, rng);
  scripts++;
  if (!sc.length) { if (you + them > 0) emptyButScored++; continue; }

  const last = sc[sc.length - 1];
  if (last.you !== you || last.them !== them) wrongFinal++;

  let prevAbs = -1, ry = 0, rt = 0, prevDiff = 0, changes = 0;
  for (const e of sc) {
    events++;
    /* Five is overtime, and its period is fifteen minutes rather than a quarter's. */
    const maxSec = e.q === 5 ? 900 : 899;
    if (e.q < 1 || e.q > 5 || e.sec < 1 || e.sec > maxSec) badQuarter++;
    const abs = (e.q - 1) * 900 + (900 - e.sec);      // elapsed seconds
    if (abs === prevAbs) dupClock++;
    if (abs < prevAbs) outOfOrder++;
    prevAbs = abs;
    if (e.q <= 4) qPts[e.q - 1] += e.points;   // overtime is not a quarter
    /* The kick that cannot be justified: inside the last three minutes, still behind by
       more than a field goal afterwards. Earlier in the quarter the same kick is ordinary
       game management and is deliberately allowed. */
    const behind = e.team === 'you' ? rt - ry : ry - rt;
    if (e.kind === 'FIELD GOAL' && abs >= 3600 - 180 && behind > 3) lateFG++;
    if (e.team === 'you') ry += e.points; else rt += e.points;
    const d = ry - rt;
    if (prevDiff !== 0 && d !== 0 && Math.sign(d) !== Math.sign(prevDiff)) changes++;
    if (d !== 0) prevDiff = d;
  }
  const m = Math.abs(you - them);
  if (m <= 8) { closeLeads += changes; closeGames++; }
  else if (m >= 17) { blowLeads += changes; blowGames++; }

  const otPlays = sc.filter((e) => e.q === 5);
  if (otPlays.length) {
    otGames++;
    /* Regulation has to have finished level, or it was not an overtime. */
    const reg = sc.filter((e) => e.q <= 4);
    const rY = reg.length ? reg[reg.length - 1].you : 0;
    const rT = reg.length ? reg[reg.length - 1].them : 0;
    if (rY !== rT) otRegNotLevel++;
    /* Sudden death after both possessions: whoever scores in it has won, so the losing
       side can never be the one who scored there. */
    const winner = you > them ? 'you' : 'them';
    if (otPlays.some((e) => e.team !== winner)) otLoserScored++;
  } else if (you === them) otNoScore++;
}

console.log('=== the script has to reach the score it was given ===');
ok('every script ends on its own final', wrongFinal === 0, wrongFinal + ' wrong');
ok('a scored game is never an empty script', emptyButScored === 0, emptyButScored);

console.log('\n=== the clock has to make sense ===');
ok('no two scores share a clock', dupClock === 0, dupClock);
ok('scores are in time order', outOfOrder === 0, outOfOrder);
ok('every score sits in a real quarter and a real second', badQuarter === 0, badQuarter);

console.log('\n=== nobody kicks a field goal that cannot help ===');
ok('no field goal inside three minutes while still losing after it', lateFG === 0, lateFG);

console.log('\n=== the points land when real points land ===');
/* The NFL's shares, borrowed knowingly: college clock rules differ, but there is no college
   quarter-by-quarter reference in this repo to calibrate against and the shape is the same
   in both codes. Three points of slack per quarter -- the placer is matching a shape, not
   hitting a number, and the mix of kinds moves it around. */
const REAL = [21, 29, 22, 28], SLACK = 3;
const total = qPts.reduce((a, b) => a + b, 0);
['Q1', 'Q2', 'Q3', 'Q4'].forEach((q, i) => {
  const got = pct(qPts[i], total);
  ok(q + ' carries about its real share of the points',
    Math.abs(got - REAL[i]) <= SLACK, got.toFixed(1) + '% vs a real ' + REAL[i] + '%');
});
/* The specific shape that was wrong, stated as its own promise so a future change cannot
   quietly invert it again while every quarter stays inside its tolerance. */
ok('the fourth quarter outscores the first', qPts[3] > qPts[0],
  'Q4 ' + pct(qPts[3], total).toFixed(1) + '%  Q1 ' + pct(qPts[0], total).toFixed(1) + '%');
/* The two quarters that end in a drive against the clock are the two that carry the game.
   Which of THEM is fractionally bigger is not a promise worth making: real football has
   them at 29 and 28, a single point apart, so any honest model will swap their order on
   noise. Asserting Q2 strictly biggest failed at 28.6 against 28.9 with every quarter
   inside a point of real, which is the test being wrong rather than the model. */
ok('the clock-driven quarters carry the game',
  Math.min(qPts[1], qPts[3]) > Math.max(qPts[0], qPts[2]),
  qPts.map((v) => pct(v, total).toFixed(1) + '%').join('  '));

console.log('\n=== and the lead has to change hands ===');
/* Counted at scoring plays, skipping ties but NOT letting a tie erase which side led into
   it -- 7-0, 7-7, 7-14 is one lead change, and treating the tie as a reset misses it.
   Judged on the close games: real football puts nearly all its lead changes there and
   almost none in blowouts, so an average over everything mostly measures the blowout mix. */
ok('close games change hands about as often as real ones',
  closeLeads / Math.max(1, closeGames) >= 1.8,
  (closeLeads / Math.max(1, closeGames)).toFixed(2) + ' in games inside one score, real ~2.4');
ok('blowouts settle and stay settled',
  blowLeads / Math.max(1, blowGames) < 1.2,
  (blowLeads / Math.max(1, blowGames)).toFixed(2) + ' in games decided by 17+');

console.log('\n=== overtime ===');
/* PLAYOFF RULES EVERYWHERE, which is what the record can represent: a run is wins and
   losses with nowhere to put a tie, so an overtime here always produces a winner. */
ok('no game is left level', otNoScore === 0, otNoScore + ' finished tied');
ok('overtime happens about as often as it really does',
  pct(otGames, scripts) >= 4.0 && pct(otGames, scripts) <= 7.5,
  pct(otGames, scripts).toFixed(2) + '% of games, real ~5.6%');
ok('regulation finished level in every one of them', otRegNotLevel === 0, otRegNotLevel);
ok('only the winner scores in overtime', otLoserScored === 0, otLoserScored);

console.log('\n' + events + ' scoring plays over ' + scripts + ' scripts, ' +
  (events / scripts).toFixed(2) + ' a game');
console.log(bad ? '\n' + bad + ' FAILED' : '\nall clear');
process.exit(bad ? 1 : 0);
