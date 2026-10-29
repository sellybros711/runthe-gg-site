import test from 'node:test';
import assert from 'node:assert/strict';
import { store, tag } from '../entities.js';
import { fold, key, sortedKey, tokens } from '../normalize.js';

test('precomputed matcher keys agree with normalize.js (rebuild entities if this fails)', () => {
  for (const e of store().list) {
    const t = tokens(e.n);
    assert.deepEqual(e.x, [fold(e.n), key(e.n), sortedKey(e.n), e.k === 'p' && t.length > 1 ? t[t.length - 1] : ''], e.id);
    assert.deepEqual(e.xa || [], (e.a || []).map(a => [fold(a), key(a)]), e.id);
  }
});

test('ids are unique, stable in shape, and one person is one record', () => {
  const ids = store().list.map(e => e.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.every(id => /^(nfl|nba|mlb|team)-[a-z0-9-]+$/.test(id)));
  const jordans = store().list.filter(e => e.n === 'Michael Jordan' && e.s === 'NBA');
  assert.equal(jordans.length, 1, 'the duplicate Jordan record is merged');
  assert.equal(tag(jordans[0]), 'SG · NBA · 1980s-2000s');
});
