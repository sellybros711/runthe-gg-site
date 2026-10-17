/* Shut The Door: the lesson (CONTRACT.md section 15), on the synthetic pack.
 *   node shut-the-door/test/lesson.mjs
 *
 *   the lesson is on the pitch with the most hold% lost
 *   the principle comes from the outcome group that explains most of the gap
 *     (a synthetic 3-1 ball-heavy call: walk risk; a synthetic 0-2 heart
 *     fastball: damage or strikes, never walk)
 *   every number in the copy is the grade's or the pack's
 *   an all-green outing has no lesson
 * The pro examples are checked against the library by pipeline/check_pros.py
 * (it needs the library), and their shape on every pack by test/packs.mjs.
 */
import { createRequire } from 'module';
import { synthPack, testRng } from './synth.mjs';
const require = createRequire(import.meta.url);
const K = require('../contract.js');
const G = require('../grade.js');
const E = require('../engine.js');
const L = require('../lesson.js');

let fails = 0;
function check(name, cond, detail) {
  if (cond) console.log('ok   ' + name);
  else { fails++; console.log('FAIL ' + name + (detail ? ': ' + detail : '')); }
}

const GROUP_OF = {
  walk: ['dont_walk_the_tying_run', 'strike_when_behind', 'first_pitch_strike', 'avoid_his_damage'],
  strike: ['first_pitch_strike', 'strike_when_behind', 'strikeout_with_runner_on_third', 'chase_when_ahead', 'same_side_breaker_away',
    'attack_his_hole', 'change_eye_level', 'use_your_best_pitch', 'avoid_his_damage'],
  damage: ['same_side_breaker_away', 'avoid_his_damage', 'change_eye_level', 'use_your_best_pitch', 'strike_when_behind', 'attack_his_hole'],
  outs: ['double_play_ball', 'use_your_best_pitch', 'avoid_his_damage', 'strike_when_behind', 'attack_his_hole', 'change_eye_level'],
};

const pack = synthPack();
const model = new G.Model(pack);

/* one pitch, as an outing the lesson can read */
function oneCall(st, call) {
  const grade = G.gradeCall(model, st, call);
  return { pack, model, grades: [grade], before: [st], calls: [call], log: [] };
}

{
  const o = oneCall({ bi: 0, b: 3, s: 1, outs: 0, bases: 0, margin: 1 }, { type: 'SL', cell: 24 });
  const ls = L.lessonFor(o);
  const top = ls && Object.entries(ls.contrib).sort((a, b) => b[1] - a[1])[0][0];
  check('3-1, a slider in the dirt: walk risk explains the most of the gap', top === 'walk', JSON.stringify(ls && ls.contrib));
  check('and the principle is a walk principle', ls && ['dont_walk_the_tying_run', 'strike_when_behind'].includes(ls.principle), ls && ls.principle);
  check('the copy carries the grade\'s numbers', ls && ls.why.join(' ').includes(`${(Math.round(o.grades[0].value * 10) / 10).toFixed(1)}%`), ls && ls.why.join(' | '));
  const DASHES = new RegExp('[' + String.fromCharCode(0x2013, 0x2014) + ']');
  check('the copy is lowercase prose with no dash', ls && !DASHES.test(ls.headline + ls.why.join('') + ls.nextTime));
}
{
  const o = oneCall({ bi: 3, b: 0, s: 2, outs: 1, bases: 0, margin: 1 }, { type: 'FF', cell: 12 });
  const ls = L.lessonFor(o);
  const top = ls && Object.entries(ls.contrib).sort((a, b) => b[1] - a[1])[0][0];
  check('0-2, a heart fastball: the gap is damage or strikes, not walks', ls && top !== 'walk', JSON.stringify(ls && ls.contrib));
  check('and the principle belongs to that group', ls && GROUP_OF[top].includes(ls.principle), ls && `${top}: ${ls.principle}`);
}
{
  // the lesson is on the pitch that lost the most
  let ok = true, seen = 0;
  for (let seed = 1; seed <= 25; seed++) {
    const rng = testRng(seed);
    const o = E.createOuting(pack, { seed, model });
    while (o.status === 'live') E.throwPitch(o, { type: model.types[Math.floor(rng() * 3)], cell: Math.floor(rng() * 25) });
    const r = E.finishOuting(o);
    if (!r.lesson) continue;
    seen++;
    const max = Math.max(...o.grades.map(g => g.lost));
    if (o.grades[r.lesson.pitchN - 1].lost !== max) ok = false;
    if (!L.PRINCIPLES.includes(r.lesson.principle)) ok = false;
    if (!(r.lesson.why.length >= 2 && r.lesson.why.length <= 3)) ok = false;
  }
  check('the lesson is on the pitch with the most hold% lost (25 outings)', ok && seen > 0, `${seen} lessons`);
}
{
  const o = E.createOuting(pack, { seed: 3, model });
  while (o.status === 'live') { const b = model.solve(o.st); E.throwPitch(o, { type: b.type, cell: b.cell }); }
  check('an all-green outing has no lesson', E.finishOuting(o).lesson === null);
}
check('every principle has a one-line explanation', L.PRINCIPLES.every(p => typeof L.ONE_LINE[p] === 'string'));

console.log(fails ? `${fails} FAILED` : 'all ok');
process.exit(fails ? 1 : 0);
