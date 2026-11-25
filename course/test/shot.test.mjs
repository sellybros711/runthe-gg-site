/* The shot model: calibration, lies, putting, and a round with nobody there. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../config.js';
import { MAP } from '../map.js';
import { playRounds, playHole, testCourse, holeGeom } from '../shot.js';

const clone = o => JSON.parse(JSON.stringify(o));

test('the test course is a par 72', () => {
  const g = testCourse(CONFIG);
  assert.equal(g.length, 18);
  assert.equal(g.reduce((a, h) => a + h.par, 0), 72);
});

test('each tier averages within one stroke of its target over 1,000 rounds', () => {
  const g = testCourse(CONFIG);
  for (const [name, t] of Object.entries(CONFIG.shot.tiers)) {
    const r = playRounds(20261125, g, name, CONFIG, 1000);
    assert.ok(Math.abs(r.average - t.target) <= 1, name + ' averaged ' + r.average.toFixed(2) + ', target ' + t.target);
  }
});

test('better tiers score lower, on the real holes too', () => {
  const g = MAP.holes.slice(0, 3).map(h => holeGeom(h, CONFIG));
  const avg = ['scratch', 'good', 'average', 'hacker', 'beginner'].map(t => playRounds(5, g, t, CONFIG, 600).average);
  for (let i = 1; i < avg.length; i++) assert.ok(avg[i] > avg[i - 1], avg.join(' '));
});

test('the same seed plays the same round', () => {
  const g = testCourse(CONFIG);
  assert.deepEqual(playRounds(9, g, 'average', CONFIG, 50), playRounds(9, g, 'average', CONFIG, 50));
  assert.notDeepEqual(playRounds(9, g, 'average', CONFIG, 50), playRounds(10, g, 'average', CONFIG, 50));
});

test('water costs a penalty stroke and a ball', () => {
  const dry = holeGeom({ ord: 1, par: 3, line: [{ x: 0, y: 0 }, { x: 0, y: 20 }] }, CONFIG);
  const wet = holeGeom({ ord: 1, par: 3, line: [{ x: 0, y: 0 }, { x: 0, y: 20 }] }, CONFIG, [{ type: 'water', x: 0, y: 95, r: 40 }]);
  const a = playRounds(3, [dry], 'average', CONFIG, 800), b = playRounds(3, [wet], 'average', CONFIG, 800);
  assert.equal(a.lostPerRound, 0);
  assert.ok(b.lostPerRound > 0.05, 'balls are lost in the pond');
  assert.ok(b.average > a.average + 0.05, 'the pond costs strokes');
});

test('bunkers and trees make a hole harder', () => {
  const line = [{ x: 0, y: 0 }, { x: 0, y: 30 }, { x: 0, y: 50 }];
  const plain = holeGeom({ ord: 1, par: 4, line }, CONFIG);
  const sand = holeGeom({ ord: 1, par: 4, line }, CONFIG, [{ type: 'bunker', x: 0, y: 215, r: 28 }]);
  const wood = holeGeom({ ord: 1, par: 4, line }, CONFIG, [{ type: 'trees', x: 0, y: 215, r: 28 }]);
  const base = playRounds(4, [plain], 'average', CONFIG, 800).average;
  assert.ok(playRounds(4, [sand], 'average', CONFIG, 800).average > base);
  assert.ok(playRounds(4, [wood], 'average', CONFIG, 800).average > base);
});

test('one putt from d feet is the constant over d, capped', () => {
  const cfg = clone(CONFIG);
  const hole = holeGeom({ ord: 1, par: 3, line: [{ x: 0, y: 0 }, { x: 0, y: 1 }] }, cfg);   // tee 8 yards (24 feet) from the pin
  const S = { rng: 1 }, t = cfg.shot.tiers.average;
  let one = 0;
  const n = 4000;
  for (let i = 0; i < n; i++) if (playHole(S, hole, t, cfg).putts === 1) one++;
  assert.ok(Math.abs(one / n - t.putt / 24) < 0.03, 'one putts ' + (one / n).toFixed(3) + ', expected ' + (t.putt / 24).toFixed(3));
});

test('nobody takes more than the stroke cap', () => {
  const g = testCourse(CONFIG), S = { rng: 2 };
  for (let i = 0; i < 2000; i++) assert.ok(playHole(S, g[i % 18], CONFIG.shot.tiers.beginner, CONFIG).strokes <= CONFIG.shot.maxStrokes + 3);
});
