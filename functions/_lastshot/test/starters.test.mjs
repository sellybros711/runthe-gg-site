/* The starter plays work and each has its own answer to the defense.
 * If a retune breaks one, redraw the play; do not loosen the bar. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { SCENARIO as SC, DEFENSES } from '../scenario.js';
import { simulate } from '../sim.js';
import { problems } from '../playbook.js';
import { STARTERS, starterPlay, starterById } from '../starters.js';

const N = 120;
const seedOf = i => (i * 2654435761) >>> 0;
const rate = (play, opt) => { let w = 0; for (let i = 1; i <= N; i++) if (simulate(SC, play, seedOf(i), opt).outcome === 'win') w++; return w / N; };
const LAZY = rate({ spots: SC.spots, steps: [{ kind: 'shoot', who: 'O1' }] });

test('four named starters, legal, with notes', () => {
  assert.deepEqual(STARTERS.map(s => s.name), ['Pin-down', 'Floppy', 'Horns Twist', 'Spain pick and roll']);
  for (const s of STARTERS) {
    assert.deepEqual(problems(SC, s.play), [], s.id);
    assert.ok(s.note && s.note.length < 90, s.id + ' note');
    assert.ok(s.play.steps.every(x => x.beat === 1));
  }
  const a = starterPlay('spain'); a.steps.pop();
  assert.equal(starterById('spain').play.steps.length, 6, 'starterPlay hands out a copy');
  assert.equal(starterPlay('nope'), null);
});

test('each starter wins, and each has a defense it beats and one that stops it', () => {
  const report = {};
  for (const s of STARTERS) {
    const by = Object.fromEntries(DEFENSES.map(d => [d, rate(s.play, { scheme: d })]));
    report[s.id] = by;
    const all = rate(s.play);
    assert.ok(all >= 0.45, s.id + ' wins ' + all);
    assert.ok(all >= LAZY + 0.25, s.id + ' beats the lazy shot: ' + all + ' vs ' + LAZY);
    assert.ok(Math.max(...Object.values(by)) >= 0.6, s.id + ' has a defense it beats: ' + JSON.stringify(by));
  }
  // the identities a coach would expect
  const r = report;
  assert.ok(r['pin-down'].under > r['pin-down'].zone32 + 0.2, 'pin-down: under yes, a zone no');
  assert.ok(r.floppy.over > r.floppy.zone32 + 0.15, 'floppy: man yes, a zone no');
  assert.ok(Math.min(...Object.values(r['horns-twist'])) >= 0.4, 'horns twist holds up against everybody');
  assert.ok(r.spain.switch > r.spain.under + 0.1, 'spain: a switch gives up the roller');
});
