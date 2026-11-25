/* The starter plays work and each has its own answer to the defense.
 * If a retune breaks one, redraw the play; do not loosen the bar. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { SCENARIO as SC, DEFENSES } from '../scenario.js';
import { simulate } from '../sim.js';
import { problems } from '../playbook.js';
import { STARTERS, starterPlay, starterById, isStarter, OWN_HINT, NO_STARTERS } from '../starters.js';

const N = 120;
const seedOf = i => (i * 2654435761) >>> 0;
const rate = (play, opt, n = N) => { let w = 0; for (let i = 1; i <= n; i++) if (simulate(SC, play, seedOf(i), opt).outcome === 'win') w++; return w / n; };
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
    const all = rate(s.play, undefined, 400);   // the overall bar on 400 runs: 120 swings it 5 points
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

test('isStarter: the exact shape of a starter, and one edit makes it yours', () => {
  for (const s of STARTERS) {
    const p = starterPlay(s.id);
    assert.equal(isStarter(p), true, s.id);
    assert.equal(isStarter({ ...p, steps: p.steps.map(x => ({ ...x, beat: 2 })) }), true, s.id + ': the frame is not the shape');
    assert.equal(isStarter({ ...p, goAt: p.goAt - 0.5 }), false, s.id + ': Go at');
    const sp = starterPlay(s.id); sp.spots.O3 = { x: sp.spots.O3.x + 1, y: sp.spots.O3.y }; assert.equal(isStarter(sp), false, s.id + ': a spot');
    const rt = starterPlay(s.id); const mv = rt.steps.find(x => x.pts); mv.pts[0] = { x: mv.pts[0].x + 1, y: mv.pts[0].y }; assert.equal(isStarter(rt), false, s.id + ': a route');
    const st = starterPlay(s.id); st.steps.splice(0, 1); assert.equal(isStarter(st), false, s.id + ': a step less');
  }
  for (const junk of [null, undefined, {}, { spots: {} }, 'x']) assert.equal(isStarter(junk), false);
  const DASH = new RegExp('[' + String.fromCharCode(0x2013, 0x2014) + ']');
  for (const t of [OWN_HINT, NO_STARTERS]) { assert.ok(!DASH.test(t) && t.length < 60, t); }
});
