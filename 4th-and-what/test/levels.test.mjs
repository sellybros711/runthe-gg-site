/* High School, College and the NFL.
 *
 *   node --test 4th-and-what/test/levels.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const E = require('../engine.js'), C = require('../config.js'), B = require('../book.js'), R = require('../routes.js');
import { PLAYBOOK } from '../build/tune.mjs';
const at = (d, level) => Object.assign({}, C.SCENARIO, { distance: d, level });

test('each level has its own hash marks', () => {
  const mid = 80 / 3;
  assert.equal(C.ballXFor('nfl', 'mid'), mid);
  assert.ok(Math.abs(mid - C.ballXFor('nfl', 'left') - 3.08) < 0.01, 'NFL hashes 70 feet 9 inches from the sideline');
  assert.ok(Math.abs(C.ballXFor('college', 'right') - mid - 6.67) < 0.01, 'college 60 feet');
  assert.ok(Math.abs(mid - C.ballXFor('hs', 'left') - 8.89) < 0.01, 'high school 53 feet 4 inches, the field in thirds');
});

test('the NFL is the tuning it was: no level and the NFL play the same snap', () => {
  for (let s = 1; s <= 20; s++) {
    const a = E.run(at(5), PLAYBOOK.mesh, s), b = E.run(at(5, 'nfl'), PLAYBOOK.mesh, s);
    assert.equal(JSON.stringify(a.frames), JSON.stringify(b.frames));
    assert.equal(b.level, 'nfl');
  }
});

test('the levels play like their levels', () => {
  const runs = [PLAYBOOK['inside zone'], R.apply({ formation: 'iform', moved: {}, routes: [], blocks: [], handoff: null, targets: [] }, 'Power')];
  const out = {};
  for (const lv of ['nfl', 'college', 'hs']) {
    let y = 0, n = 0, drops = 0, att = 0;
    for (const p of runs) for (let s = 1; s <= 150; s++) { y += E.run(Object.assign(at(10, lv), { ballOn: 60 }), p, s * 7919).yards; n++; }
    for (const p of [PLAYBOOK.mesh, PLAYBOOK.stick, PLAYBOOK.dig]) for (let s = 1; s <= 150; s++) {
      const r = E.run(at(7, lv), p, s * 7919); if (r.throwInfo) { att++; if (r.events.some(e => e.text === 'Dropped.')) drops++; }
    }
    out[lv] = { ypc: y / n, drop: drops / att };
  }
  assert.ok(out.hs.ypc > out.college.ypc && out.college.ypc > out.nfl.ypc, 'runs go further the lower the level: ' + JSON.stringify(out));
  assert.ok(out.hs.drop > out.nfl.drop, 'and more balls hit the ground');
  assert.equal(E.run(at(5, 'hs'), PLAYBOOK.mesh, 3).level, 'hs');
});

test('a play keeps its numbers at each level apart', () => {
  const e = { stats: {} };
  B.countSnap(e, 5, 'cover1', true);
  B.countSnap(e, 5, 'cover1', false, 'hs');
  B.countSnap(e, 5, 'cover1', false, 'hs');
  assert.deepEqual(B.statsOf(e, 'nfl')[5].byCall.cover1, { n: 1, w: 1 });
  assert.deepEqual(B.statsOf(e, 'hs')[5].byCall.cover1, { n: 2, w: 0 });
  assert.equal(B.statsOf(e, 'college')[5], undefined);
});
