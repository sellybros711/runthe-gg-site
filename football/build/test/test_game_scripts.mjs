/* The game script: not just what the final score was, but how it got there.
 *
 *   node football/build/test/test_game_scripts.mjs
 *
 * test_scorelines.mjs checks the FINAL is a real one. This checks the story that reaches
 * it, which had no coverage at all and had quietly drifted into a shape football never
 * has: measured over 18,000 scripts, the fourth quarter was the QUIETEST at 17% of the
 * points and the first was the loudest at 32%, so every game opened with a bang and
 * trailed off. Two causes, both since fixed -- the placer handed each score an even slice
 * of the hour, and the late-field-goal guard only ever moved kicks EARLIER, so points
 * drained forwards on every pass and nothing ever moved back.
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

for (let i = 0; i < N; i++) {
  const [you, them] = drawFinal();
  const sc = E.scoringScript(you, them, rng);
  scripts++;
  if (!sc.length) { if (you + them > 0) emptyButScored++; continue; }

  const last = sc[sc.length - 1];
  if (last.you !== you || last.them !== them) wrongFinal++;

  let prevAbs = -1, ry = 0, rt = 0;
  for (const e of sc) {
    events++;
    if (e.q < 1 || e.q > 4 || e.sec < 1 || e.sec > 899) badQuarter++;
    const abs = (e.q - 1) * 900 + (900 - e.sec);      // elapsed seconds
    if (abs === prevAbs) dupClock++;
    if (abs < prevAbs) outOfOrder++;
    prevAbs = abs;
    qPts[e.q - 1] += e.points;
    /* The kick that cannot be justified: inside the last three minutes, still behind by
       more than a field goal afterwards. Earlier in the quarter the same kick is ordinary
       game management and is deliberately allowed. */
    const behind = e.team === 'you' ? rt - ry : ry - rt;
    if (e.kind === 'FIELD GOAL' && abs >= 3600 - 180 && behind > 3) lateFG++;
    if (e.team === 'you') ry += e.points; else rt += e.points;
  }
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
/* Real NFL shares. The second and fourth carry the game because both end in a drive played
   against the clock; the first is two teams feeling each other out. Three points of slack
   per quarter: the placer is matching a shape, not hitting a number, and the mix of
   touchdowns and field goals moves it around. */
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
ok('the second quarter is the biggest', qPts[1] === Math.max(...qPts),
  qPts.map((v) => pct(v, total).toFixed(1) + '%').join('  '));

console.log('\n' + events + ' scoring plays over ' + scripts + ' scripts, ' +
  (events / scripts).toFixed(2) + ' a game');
console.log(bad ? '\n' + bad + ' FAILED' : '\nall clear');
process.exit(bad ? 1 : 0);
