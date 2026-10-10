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

test('nearly every pool prompt fits an at-bat, and a month of daily slates all publish', async () => {
  const { slotFit, chooseSlate } = await import('../daily.js');
  const fit = slotFit(SEED.prompts, SA, '2026-10-09');
  /* search_avg is re-imported every night, so a prompt on the edge of a band
     can stop fitting for a while; the picker skips it. A pool going stale in
     bulk is the failure worth catching. */
  const misfit = SEED.prompts.filter(d => !fit.some(f => f.includes(d))).map(d => d.id);
  assert.ok(misfit.length <= 3, 'prompts that fit no at-bat: ' + misfit.join(', '));
  assert.equal(new Set(SEED.prompts.map(p => p.league)).size, 3);
  const recent = new Set();
  for (let k = 0; k < 30; k++) {
    const date = new Date(Date.parse('2026-10-09T12:00:00Z') + k * 86400000).toISOString().slice(0, 10);
    const r = chooseSlate(SEED.prompts, SA, date, recent);
    assert.ok(r.ok, date + ': ' + (r.errors || []).join('; '));
    assert.deepEqual(checkSlate(r.defs), []);
    r.defs.forEach(d => recent.add(d.id));
    assert.deepEqual(chooseSlate(SEED.prompts, SA, date, new Set()).defs.map(d => d.id), chooseSlate(SEED.prompts, SA, date, new Set()).defs.map(d => d.id), 'a date always gives the same slate');
  }
});

test('publishing is blocked on a broken rule', () => {
  const d = { ...SEED.prompts.find(p => p.id === 'nfl-te-pro-bowl'), wildcard: null };
  assert.ok(previewPrompt(d, 4, SA).check.errors.some(e => /wildcard/.test(e)));
  const one = SEED.prompts.find(p => p.id === 'mlb-gold-glove');
  assert.equal(buildSlate([one, one, one, one, one], SA).ok, false);
  const nfl = SEED.prompts.find(p => p.id === 'nfl-cowboys-2000');
  assert.ok(previewPrompt({ ...nfl, years: [1980, 2025] }, 0, SA).check.errors.some(e => /1995/.test(e)), 'an NFL prompt before 1995 is refused');
});
