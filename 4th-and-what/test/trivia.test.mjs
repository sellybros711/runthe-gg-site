/* Daily Defense: the pool, the schedule, the answer.
 *
 *   node --test 4th-and-what/test/trivia.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const Tr = require('../trivia.js'), D = require('../daily.js');
const DATA = require('../data/defense.json');

test('the pool: every concept on every formation, both ways', () => {
  const P = Tr.pool();
  assert.ok(P.length > 100, P.length + ' plays');
  assert.ok(P.every(p => (p.play.handoff && p.play.handoff.to) || p.play.targets.length), 'each has a read or a run');
  assert.equal(new Set(P.map(p => p.concept + p.set + p.side)).size, P.length, 'none twice');
});

test('the schedule: a year of days, each a play from the pool at a distance that suits it', () => {
  assert.ok(DATA.days.length >= 365, DATA.days.length + ' days');
  for (const e of DATA.days) {
    const it = Tr.itemOf(e);
    assert.ok(it, 'in the pool: ' + JSON.stringify(e));
    if (it.kind === 'run') assert.ok(e.distance <= 4, 'a run at short yardage');
    else assert.ok(e.distance >= 3 && e.distance <= 10, 'a pass at 3 to 10');
  }
  assert.equal(Tr.entryFor(DATA.days, 3), Tr.entryFor(DATA.days, 3), 'the same day, the same play');
});

test('the answer is the engine, the same on every device, and the first days have a clear one', () => {
  for (let n = 1; n <= 3; n++) {
    const e = Tr.entryFor(DATA.days, n), day = '2026-11-0' + n, sc = Tr.scenarioFor(day, e.distance), it = Tr.itemOf(e);
    const a = Tr.solve(sc, it.play, day), b = Tr.solve(sc, it.play, day);
    assert.deepEqual(a, b, 'same seeds, same rates');
    const v = Tr.CALLS.map(c => a[c]);
    assert.ok(Math.max(...v) - Math.min(...v) >= 0.1, 'the calls are not all the same: ' + JSON.stringify(a));
    const best = Tr.CALLS.reduce((x, c) => (a[c] < a[x] ? c : x));
    assert.ok(Tr.judge(a, best).correct && Tr.judge(a, best).rank === 1, 'the lowest is a best call');
    const worst = Tr.CALLS.reduce((x, c) => (a[c] > a[x] ? c : x));
    assert.ok(!Tr.judge(a, worst).correct, 'the worst is not');
  }
});

test('the run is chunked and lands where the whole run does', () => {
  const e = Tr.entryFor(DATA.days, 1), day = '2026-11-01', sc = Tr.scenarioFor(day, e.distance), it = Tr.itemOf(e);
  const r = Tr.runner(sc, it.play, day); let steps = 0;
  while (!r.step(35)) steps++;
  assert.equal(r.done(), r.total);
  assert.deepEqual(r.rates(), Tr.solve(sc, it.play, day));
  assert.ok(steps > 10, 'it yields along the way');
  assert.equal(D.numberOf(D.EPOCH), 1);
});
