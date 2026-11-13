/* The ladder stays fair. For every level:
 *   - a reference play (found by search, 2026-11-13) wins enough: half the
 *     time in chapters 1 to 3, a quarter in chapter 4 (down 3 can only tie,
 *     then overtime is a coin flip)
 *   - three stars can be earned
 *   - a lazy one tap shot does not clear it easily
 * Retuning the sim can move these. If one fails, re-run the search and fix
 * the level or the play here; do not just loosen the bar. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { simulate } from '../sim.js';
import { problems } from '../playbook.js';
import { LEVELS, CHAPTERS, levelScenario, levelOpt, starsOf, levelById, SETS } from '../levels.js';

const P = (x, y) => ({ x, y });
const N = 100;
const seedOf = i => (i * 2654435761) >>> 0;

// [kind, screener, cutter, target, goAt]: 'scr' screens the cutter to the target, 'pop' just runs him there
const REF = {
  '1-1': ['scr', 'O4', 'O2', [35, 27], 5.4], '1-2': ['scr', 'O5', 'O2', [7, 23], 6.2], '1-3': ['scr', 'O5', 'O2', [15, 27], 6.2],
  '1-4': ['scr', 'O5', 'O2', [15, 27], 5.5], '1-5': ['scr', 'O4', 'O2', [35, 27], 5.4], '1-6': ['scr', 'O4', 'O2', [35, 27], 5.4],
  '2-1': ['scr', 'O4', 'O2', [35, 27], 5.4], '2-2': ['scr', 'O5', 'O2', [15, 27], 6.2], '2-3': ['scr', 'O5', 'O2', [7, 23], 6],
  '2-4': ['scr', 'O4', 'O2', [35, 27], 5.4], '2-5': ['scr', 'O4', 'O2', [47, 3.5], 6.2], '2-6': ['scr', 'O5', 'O2', [43, 23], 5],
  '3-1': ['pop', null, 'O2', [7, 23], 5.4], '3-2': ['scr', 'O4', 'O2', [35, 27], 6.2], '3-3': ['pop', null, 'O2', [15, 27], 5.4],
  '3-4': ['scr', 'O5', 'O2', [7, 23], 6.2], '3-5': ['pop', null, 'O2', [7, 23], 5.4], '3-6': ['pop', null, 'O2', [47, 3.5], 4],
  '4-1': ['scr', 'O4', 'O2', [35, 27], 5.4], '4-2': ['scr', 'O5', 'O2', [15, 27], 6.2], '4-3': ['scr', 'O5', 'O2', [7, 23], 6],
  '4-4': ['scr', 'O5', 'O2', [35, 27], 5.4], '4-5': ['pop', null, 'O2', [7, 23], 5.4], '4-6': ['scr', 'O4', 'O2', [35, 27], 5.4]
};

function playFor(level) {
  const sc = levelScenario(level), [kind, s, c, [tx, ty], g] = REF[level.id], a = sc.spots[c];
  const steps = [];
  if (kind === 'scr') {
    const scr = P((a.x + tx) / 2 + 0.5, (a.y + ty) / 2);
    steps.push({ kind: 'screen', who: s, pts: [scr] }, { kind: 'move', who: c, pts: [P(scr.x - 1, scr.y - 1), P(tx, ty)] });
  } else steps.push({ kind: 'move', who: c, pts: [P(tx, ty)] });
  steps.push({ kind: 'pass', from: 'O1', to: c }, { kind: 'shoot', who: c });
  return { sc, play: { spots: sc.spots, steps, goAt: g } };
}

test('24 levels in four chapters of six, each well formed', () => {
  assert.equal(LEVELS.length, 24);
  assert.equal(new Set(LEVELS.map(l => l.id)).size, 24);
  for (const ch of CHAPTERS) assert.equal(LEVELS.filter(l => l.chapter === ch.id).length, 6, 'chapter ' + ch.id);
  for (const l of LEVELS) {
    assert.ok(SETS[l.set], l.id + ' set');
    assert.equal(levelById(l.id), l);
    const sc = levelScenario(l);
    assert.ok(sc.clock >= 4 && sc.clock <= 24 && [1, 2, 3].includes(sc.them - sc.us), l.id);
    assert.equal(sc.them - sc.us, l.chapter === 4 ? 3 : (l.sit.down || 1));
  }
});

test('every level is winnable, three stars can be earned, and a lazy shot does not clear it', () => {
  const report = [];
  for (const l of LEVELS) {
    const { sc, play } = playFor(l);
    assert.deepEqual(problems(sc, play), [], l.id);
    const lazy = { spots: sc.spots, steps: [{ kind: 'shoot', who: 'O1' }] };
    let w = 0, three = 0, lw = 0;
    for (let i = 1; i <= N; i++) {
      const r = simulate(sc, play, seedOf(i), levelOpt(l));
      if (r.outcome === 'win') w++;
      if (starsOf(r) === 3) three++;
      if (simulate(sc, lazy, seedOf(i), levelOpt(l)).outcome === 'win') lw++;
    }
    report.push(l.id + ' ' + w + '/' + three + '/' + lw);
    const bar = l.chapter === 4 ? 25 : 50;
    assert.ok(w >= bar, l.id + ' reference play won ' + w + ' of ' + N);
    assert.ok(three > 0, l.id + ' three stars never earned');
    assert.ok(lw <= 30, l.id + ' lazy shot won ' + lw + ' of ' + N);
    assert.ok(w >= lw + 15, l.id + ' the play beats the lazy shot: ' + w + ' vs ' + lw);
  }
});

test('stars grade the play', () => {
  assert.equal(starsOf({ outcome: 'lose', shot: { p: 0.9 }, shotAt: 1 }), 0);
  assert.equal(starsOf({ outcome: 'win', shot: { p: 0.3, bailout: false }, shotAt: 1 }), 1);
  assert.equal(starsOf({ outcome: 'win', shot: { p: 0.6, bailout: false }, shotAt: 4 }), 2);
  assert.equal(starsOf({ outcome: 'win', shot: { p: 0.6, bailout: false }, shotAt: 2.6 }), 3);
  assert.equal(starsOf({ outcome: 'win', shot: { p: 0.6, bailout: true }, shotAt: 2.9 }), 2, 'a heave is not clutch');
});
