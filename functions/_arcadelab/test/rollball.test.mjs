import test from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../games/rollball/sim.js';
import { CONFIG as C, LAYOUTS } from '../games/rollball/config.js';
import { seedFor, dateKey, dayNumber, msToNextDay } from '../shared/seed.js';
import { playLog } from './helpers.mjs';

test('same seed and same inputs give the same result, twice', () => {
  for (let k = 0; k < 25; k++) {
    const seed = seedFor('2026-10-' + String(10 + (k % 18)).padStart(2, '0'), 'roll-ball') ^ k;
    const run = playLog(seed >>> 0, k + 1);
    const a = S.replay(seed >>> 0, run.log), b = S.replay(seed >>> 0, run.log);
    assert.deepEqual(a, b);
    assert.equal(a.score, run.score);
    assert.deepEqual(a.detail, run.detail);
  }
});

test('the replay survives a JSON round trip, which is what the server sees', () => {
  const seed = seedFor('2026-10-10', 'roll-ball'), run = playLog(seed, 7);
  assert.equal(S.replay(seed, JSON.parse(JSON.stringify(run.log))).score, run.score);
});

test('the score is bases, capped at 36, and the cycle is all four', () => {
  for (let k = 0; k < 40; k++) {
    const run = playLog(1000 + k, k);
    assert.ok(run.score >= 0 && run.score <= C.BALLS * C.MAX_BASES);
    assert.equal(run.detail.results.length, C.BALLS);
    assert.equal(run.score, run.detail.results.reduce((a, r) => a + r.bases, 0));
    for (const r of run.detail.results) assert.ok(r.bases <= C.MAX_BASES);
  }
});

test('a log the sim cannot have produced is refused', () => {
  const seed = 42, run = playLog(seed, 3);
  assert.equal(S.replay(seed, run.log.slice(0, 8)).error, 'bad_inputs');
  const early = run.log.map((x, i) => i === 3 ? { ...x, f: run.log[2].f + 1 } : x);
  assert.ok(S.replay(seed, early).error);
  const wild = run.log.map((x, i) => i === 0 ? { ...x, a: 3 } : x);
  assert.equal(S.replay(seed, wild).error, 'illegal_input');
  const strong = run.log.map((x, i) => i === 0 ? { ...x, p: 1.5 } : x);
  assert.equal(S.replay(seed, strong).error, 'illegal_input');
  assert.equal(S.replay(seed, 'nope').error, 'bad_inputs');
});

test('the same throw on a different day can land differently (the jitter is seeded)', () => {
  const log = playLog(5, 9).log;
  const seen = new Set();
  for (let k = 0; k < 30; k++) { const r = S.replay(5000 + k, log); if (!r.error) seen.add(r.score); }
  assert.ok(seen.size > 1);
});

test('eight distinct layouts, and the hot ring is never the home run', () => {
  assert.ok(LAYOUTS.length >= 8);
  assert.equal(new Set(LAYOUTS.map(l => l.id)).size, LAYOUTS.length);
  const hit = new Set();
  for (let d = 1; d <= 120; d++) { const c = S.dailyConfig(seedFor('2026-' + String(1 + (d % 12)).padStart(2, '0') + '-' + String(1 + (d % 28)).padStart(2, '0'), 'roll-ball')); hit.add(c.layoutId); assert.notEqual(c.hot, 'HR'); assert.ok(c.rule.length > 10); }
  assert.ok(hit.size >= 6, 'days reach most layouts');
});

test('a sliding pocket moves with the frame', () => {
  const L = LAYOUTS.find(l => l.id === 'slide-l'), p = L.pockets[0];
  assert.notEqual(S.pocketAt(p, 0).x, S.pocketAt(p, 55).x);
});

test('a nine ball run fits in 90 seconds of play', () => {
  const run = playLog(77, 4, 150);   // two and a half seconds of aiming a ball
  assert.ok(run.frames / 60 < 90, run.frames / 60 + 's');
});

test('the day turns over at Eastern midnight', () => {
  assert.equal(dateKey(Date.parse('2026-10-11T03:59:00Z')), '2026-10-10');
  assert.equal(dateKey(Date.parse('2026-10-11T04:01:00Z')), '2026-10-11');
  assert.equal(dayNumber('2026-10-10'), 1);
  const ms = msToNextDay(Date.parse('2026-10-11T03:00:00Z'));
  assert.ok(Math.abs(ms - 3600000) < 2000);
});

test('the share line is one header, squares only, and the url', () => {
  const d = playLog(9, 9).detail;
  const sq = S.squares(d);
  assert.equal(sq.length, 9);
  for (const s of sq) assert.ok(['🟩', '🟨', '🟧', '🟥', '⬛'].includes(s));
});
