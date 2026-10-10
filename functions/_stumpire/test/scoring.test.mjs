import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG, tierForDepth } from '../config.js';
import { blend, grade, calledList, bandSizes } from '../scoring.js';

test('blend is (k * prior + observed) / (k + n)', () => {
  assert.equal(blend(0.1, 0, 0), 0.1);
  assert.equal(blend(0.1, 50, 100, 200), (200 * 0.1 + 50) / 300);
  assert.equal(CONFIG.BLEND_K, 200);
  // shares still sum to 1 after blending a whole prompt
  const rows = grade([{ id: 'a', searchAvg: 50, observed: 10 }, { id: 'b', searchAvg: 30, observed: 0 }, { id: 'c', searchAvg: 20, observed: 30 }]);
  assert.ok(Math.abs(rows.reduce((s, r) => s + r.expected, 0) - 1) < 1e-9);
});

test('depth bands: single to 75%, double to 90%, triple to 97%, home run beyond', () => {
  assert.equal(tierForDepth(0), 1);
  assert.equal(tierForDepth(0.75), 1);
  assert.equal(tierForDepth(0.7501), 2);
  assert.equal(tierForDepth(0.90), 2);
  assert.equal(tierForDepth(0.9001), 3);
  assert.equal(tierForDepth(0.97), 3);
  assert.equal(tierForDepth(0.9701), 4);
});

test('depth is the share held by MORE popular answers', () => {
  const g = grade([{ id: 'a', searchAvg: 60 }, { id: 'b', searchAvg: 20 }, { id: 'c', searchAvg: 15 }, { id: 'd', searchAvg: 3 }, { id: 'e', searchAvg: 2 }]);
  assert.deepEqual(g.map(r => r.id), ['a', 'b', 'c', 'd', 'e']);
  assert.deepEqual(g.map(r => +r.depth.toFixed(2)), [0, 0.6, 0.8, 0.95, 0.98]);
  assert.deepEqual(g.map(r => r.tier), [1, 1, 2, 3, 4]);
  assert.deepEqual(bandSizes(g), { 1: 2, 2: 1, 3: 1, 4: 1 });
});

test('observed answers move an answer up the ranking', () => {
  const before = grade([{ id: 'a', searchAvg: 50 }, { id: 'b', searchAvg: 50 }, { id: 'z', searchAvg: 1 }]);
  const after = grade([{ id: 'a', searchAvg: 50 }, { id: 'b', searchAvg: 50 }, { id: 'z', searchAvg: 1, observed: 500 }]);
  assert.equal(before[2].id, 'z');
  assert.equal(after[0].id, 'z');
});

test('called list is the top N-1 plus the wildcard, with a coverage flag', () => {
  const rows = Array.from({ length: 20 }, (_, i) => ({ id: 'p' + i, searchAvg: 100 - i * 4 }));
  const g = grade(rows);
  const c = calledList(g, 0, 'p9');
  assert.deepEqual(c.ids, ['p0', 'p1', 'p9']);
  assert.equal(c.problems.length, 0);
  assert.ok(c.coverage < CONFIG.CALLED_COVERAGE_LOW && c.flag === 'low');
  assert.ok(calledList(g, 0, 'p1').problems.length, 'a wildcard already in the top is refused');
  assert.ok(calledList(g, 0, 'nobody').problems.length, 'a wildcard outside the valid set is refused');
  assert.ok(calledList(g, 0, null).problems.length, 'a wildcard is required');
  assert.equal(calledList(g, 4, 'p19').ids.length, 7);
});

test('an arguable answer is never called', () => {
  const g = grade([{ id: 'a', searchAvg: 90, arguable: true }, { id: 'b', searchAvg: 50 }, { id: 'c', searchAvg: 40 }, { id: 'd', searchAvg: 10 }]);
  const c = calledList(g, 0, 'd');
  assert.deepEqual(c.ids, ['b', 'c', 'd']);
  assert.ok(calledList(g, 0, 'a').problems.some(p => /arguable/.test(p)));
});
