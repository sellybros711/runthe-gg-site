/* Call it: the hand, the read, and that the look is the snap.
 *
 *   node --test 4th-and-what/test/calls.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const K = require('../calls.js'), E = require('../engine.js'), C = require('../config.js'), TR = require('../trivia.js');
const at = (o) => Object.assign({}, C.SCENARIO, { down: 4, distance: 5, ballOn: 40 }, o);

test('a hand is a run, a quick pass and a shot, the same for the same snap', () => {
  for (let s = 1; s <= 300; s++) {
    const h = K.deal(at(), s);
    assert.deepEqual(h.map(c => c.type), ['run', 'quick', 'shot']);
    h.forEach(c => assert.equal(K.TYPE[c.concept], c.type, c.concept));
    assert.ok(!h.some(c => c.type === 'run' && c.set === 'empty'), 'no run from Empty');
    assert.ok(!h.some(c => c.concept === 'QB Sneak'), 'no sneak at 4th and 5');
    assert.ok(new Set(h.map(c => c.set)).size === 3, 'three sets');
    assert.deepEqual(K.deal(at(), s).map(c => c.concept + c.set + c.side), h.map(c => c.concept + c.set + c.side));
  }
  const sneaks = Array.from({ length: 400 }, (_, s) => K.deal(at({ distance: 1 }), s)).filter(h => h[0].concept === 'QB Sneak').length;
  assert.ok(sneaks > 10, 'the sneak is dealt at 4th and 1: ' + sneaks);
  /* every concept in the library has a card kind */
  TR.pool().forEach(it => assert.ok(K.TYPE[it.concept], it.concept));
});

test('the look is the snap: the shell shown is the one played, whatever card is picked', () => {
  let dis = 0;
  for (let s = 1; s <= 200; s++) {
    const h = K.deal(at(), s), shells = h.map(c => E.look(at(), c.play, s).shell);
    assert.ok(shells.every(x => x === shells[0]), 'one shell for every card: ' + shells);
    h.forEach(c => { const r = E.run(at(), c.play, s), l = E.look(at(), c.play, s); assert.equal(r.shell, l.shell); assert.equal(r.disguised, r.shell !== E.SHELL[r.call.coverage]); });
    dis += E.run(at(), h[0].play, s).disguised;
  }
  assert.ok(dis > 25 && dis < 75, 'about a quarter of snaps disguise: ' + dis + ' of 200');
});

test('the look tells the truth more often than not, and never names the call', () => {
  const l = E.look(at(), K.deal(at(), 9)[1].play, 9);
  assert.deepEqual(Object.keys(l).sort(), ['box', 'defense', 'shell']);
  l.defense.forEach(d => assert.deepEqual(Object.keys(d).sort(), ['at', 'id', 'role']));
  assert.match(K.readText(l), /^(Two deep|One deep|Nobody deep) · \d+ in the box$/);
  const txt = K.hintText(l) + K.readText(l);
  assert.ok(K.hintText(l).length > 10 && ![...txt].some(c => c.charCodeAt(0) === 0x2013 || c.charCodeAt(0) === 0x2014), 'no dashes');
});

test('the read is worth something: vs nobody deep, the quick game beats the run', () => {
  /* the same snaps, run and quick, at 4th and 2: a pre-snap read must pay */
  let run = [0, 0], quick = [0, 0];
  for (let s = 1; s <= 1500; s++) {
    const h = K.deal(at({ distance: 2 }), s);
    if (E.look(at({ distance: 2 }), h[0].play, s).shell !== 'zero') continue;
    run[0] += E.run(at({ distance: 2 }), h[0].play, s).win; run[1]++;
    quick[0] += E.run(at({ distance: 2 }), h[1].play, s).win; quick[1]++;
  }
  assert.ok(run[1] > 40, 'enough zero looks: ' + run[1]);
  assert.ok(quick[0] / quick[1] > run[0] / run[1] + 0.1, 'quick ' + (quick[0] / quick[1]).toFixed(2) + ' against run ' + (run[0] / run[1]).toFixed(2));
});
