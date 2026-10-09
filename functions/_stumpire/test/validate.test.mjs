import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../config.js';
import { checkPrompt, checkSlate } from '../validate.js';
import { coverageProblems } from '../query.js';
import { previewPrompt, buildSlate } from '../publish.js';
import fs from 'node:fs';

const SA = JSON.parse(fs.readFileSync(new URL('../data/search_avg.json', import.meta.url))).values;
const SEED = JSON.parse(fs.readFileSync(new URL('../prompts/seed.json', import.meta.url)));
const fake = n => Array.from({ length: n }, (_, i) => ({ id: 'x' + i, tier: i >= n - 8 ? 4 : 1 }));
const q = (o = {}) => ({ league: 'NBA', type: 'athlete', years: [1980, 2025], where: [], ...o });

test('the difficulty ramp', () => {
  assert.equal(checkPrompt(q(), fake(120), null, 0).errors.length, 0);
  assert.ok(checkPrompt(q(), fake(90), null, 0).errors.some(e => /at-bat 1/.test(e)));
  assert.ok(checkPrompt(q(), fake(160), null, 1).errors.some(e => /at-bat 2/.test(e)));
  assert.equal(checkPrompt(q(), fake(55), null, 4).errors.length, 0);
  assert.ok(checkPrompt(q(), fake(61), null, 4).errors.length);
  assert.deepEqual(CONFIG.CALLED_BY_AT_BAT, [3, 4, 5, 6, 7]);
});

test('athlete prompts need 40 valid answers and 5 home runs', () => {
  const few = fake(55).map(r => ({ ...r, tier: 1 }));
  assert.ok(checkPrompt(q(), few, null, 4).errors.some(e => /home run/.test(e)));
  assert.ok(checkPrompt(q(), fake(30), null, 4).errors.some(e => /40 valid/.test(e)));
});

test('team prompts: set flag, 12 valid, one home run', () => {
  const t = q({ type: 'team', set: true });
  const twelve = Array.from({ length: 12 }, (_, i) => ({ id: 't' + i, tier: i === 11 ? 4 : 1 }));
  assert.equal(checkPrompt(t, twelve, null, 0).errors.length, 0);
  assert.ok(checkPrompt(q({ type: 'team' }), twelve, null, 0).errors.some(e => /set/.test(e)));
  assert.ok(checkPrompt(t, twelve.slice(1), null, 0).errors.length);
});

test('a slate: five prompts, every league, no league over two, one team prompt', () => {
  const P = (id, league, type = 'athlete') => ({ id, league, type });
  assert.deepEqual(checkSlate([P('a', 'NFL'), P('b', 'NBA'), P('c', 'MLB'), P('d', 'NBA'), P('e', 'NFL', 'team')]), []);
  assert.ok(checkSlate([P('a', 'NFL'), P('b', 'NBA'), P('c', 'NBA'), P('d', 'NBA'), P('e', 'NFL')]).some(e => /MLB/.test(e)));
  assert.ok(checkSlate([P('a', 'NFL'), P('b', 'NBA'), P('c', 'NBA'), P('d', 'NBA'), P('e', 'MLB')]).some(e => /no more than 2 NBA/.test(e)));
  assert.ok(checkSlate([P('a', 'NFL', 'team'), P('b', 'NBA'), P('c', 'MLB'), P('d', 'NBA'), P('e', 'NFL', 'team')]).some(e => /team prompt/.test(e)));
  assert.ok(checkSlate([P('a', 'NFL'), P('b', 'NBA'), P('c', 'MLB')]).length);
});

test('only fields complete for the prompt years may be used', () => {
  assert.deepEqual(coverageProblems(q({ years: [1990, 2025], where: [{ k: 'award', v: 'NBA All-Star' }] })), []);
  assert.ok(coverageProblems(q({ years: [1940, 2025], where: [{ k: 'award', v: 'NBA All-Star' }] })).length);
  assert.ok(coverageProblems(q({ where: [{ k: 'stat', v: 'nba_points', min: 20000 }] })).some(e => /stat/.test(e)), 'career stats are not complete');
  assert.ok(coverageProblems(q({ where: [{ k: 'col', v: 'Duke' }] })).length);
  assert.ok(coverageProblems(q({ league: 'MLB', where: [{ k: 'award', v: 'MLB All-Star' }] })).some(e => /MLB All-Star/.test(e)), 'MLB All-Star has measured holes');
  assert.ok(coverageProblems(q({ where: [{ k: 'not', p: { k: 'col', v: 'Duke' } }] })).length, 'a field inside not counts');
  assert.ok(coverageProblems(q({ years: null })).length);
});

test('all ten seed prompts pass at their at-bat, and the test slate publishes', () => {
  assert.equal(SEED.prompts.length, 10);
  for (const d of SEED.prompts) {
    const p = previewPrompt(d, d.at_bat - 1, SA);
    assert.deepEqual(p.check.errors, [], d.id);
  }
  const defs = SEED.test_slate.map(id => SEED.prompts.find(p => p.id === id));
  const b = buildSlate(defs, SA);
  assert.ok(b.ok, b.errors.join('; '));
  const leagues = new Set(SEED.prompts.map(p => p.league));
  assert.equal(leagues.size, 3);
});

test('publishing is blocked on a broken rule', () => {
  const d = { ...SEED.prompts.find(p => p.id === 'nfl-te-pro-bowl'), wildcard: null };
  assert.ok(previewPrompt(d, 4, SA).check.errors.some(e => /wildcard/.test(e)));
  const defs = SEED.test_slate.map(id => SEED.prompts.find(p => p.id === id));
  assert.equal(buildSlate([defs[0], defs[0], defs[2], defs[3], defs[4]], SA).ok, false);
});
