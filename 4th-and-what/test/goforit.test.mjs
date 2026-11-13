/* Go For It: the run's rules, and a whole run on the real engine.
 *
 *   node --test 4th-and-what/test/goforit.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const G = require('../goforit.js'), E = require('../engine.js'), C = require('../config.js'), K = require('../calls.js');

test('a run starts at 4th and 1 on your own 35, and the ladder only grows', () => {
  const s = G.newRun(7);
  assert.deepEqual([s.n, s.ballOn, s.distance, s.over], [0, 65, 1, false]);
  for (let i = 1; i < G.LADDER.length; i++) assert.ok(G.LADDER[i] >= G.LADDER[i - 1]);
  assert.equal(G.distanceFor(30, 99), 15, 'the top of the ladder holds');
  assert.equal(G.distanceFor(10, 4), 4, 'inside the 10 it is 4th and goal');
});

test('convert and go again from the spot; three stops end it; a touchdown starts a new drive', () => {
  let s = G.newRun(1);
  s = G.after(s, { win: true, outcome: 'down', yards: 6, spotY: 41, seed: 1 }, 2);
  assert.deepEqual([s.n, s.yards, s.ballOn, s.distance, s.seed, s.over], [1, 6, 59, 2, 2, false]);
  s = G.after(s, { win: true, outcome: 'touchdown', yards: 59, spotY: 100, seed: 2 }, 3);
  assert.deepEqual([s.n, s.tds, s.ballOn, s.yards], [2, 1, G.AFTER_TD, 65]);
  s = G.after(s, { win: false, outcome: 'incomplete', yards: 0, seed: 3 }, 4);
  assert.deepEqual([s.over, s.stops, s.ballOn, s.distance, G.stopsLeft(s)], [false, 1, G.START, 2, 2], 'a stop: a new possession from your own 35, the ladder holds');
  s = G.after(s, { win: false, outcome: 'incomplete', yards: 0, seed: 4 }, 5);
  s = G.after(s, { win: false, outcome: 'sack', yards: -7, seed: 5 }, 6);
  assert.ok(s.over); assert.equal(s.log.length, 5); assert.equal(G.STOPS, 3);
  assert.equal(G.overText(s), '2 4th downs converted. 65 yards, 1 touchdown.');
  assert.equal(G.tallyText(s), '2 converted · 65 yds · 1 TD');
  assert.equal(G.overText(G.newRun(1)), 'Not one converted. Shake it off.');
  let p = G.after(G.newRun(1), { win: false, outcome: 'interception', yards: 0, seed: 1 }, 2);
  assert.deepEqual([p.stops, G.stopsLeft(p), p.over], [2, 1, false], 'a pick costs two stops');
  p = G.after(p, { win: false, outcome: 'interception', yards: 0, seed: 2 }, 3);
  assert.ok(p.over && G.stopsLeft(p) === 0, 'and a second one ends it');
  assert.ok(G.better({ n: 3, yards: 10 }, { n: 2, yards: 90 }) && G.better({ n: 2, yards: 20 }, { n: 2, yards: 10 }) && !G.better({ n: 2, yards: 10 }, { n: 2, yards: 10 }));
  for (const t of [G.overText(s), G.tallyText(s), G.shareText(s)]) assert.ok(![...t].some(c => c.charCodeAt(0) === 0x2013 || c.charCodeAt(0) === 0x2014));
});

test('whole runs on the real engine: they end, and a good reader goes further than a random one', () => {
  /* the "reader" picks the card the shell favours; the "random" one picks by the seed */
  const pickBy = { zero: 'quick', one: 'quick', two: 'run' };
  function runs(reader) {
    const out = [];
    for (let r = 1; r <= 120; r++) {
      let s = G.newRun(r * 7919), guard = 0;
      while (!s.over && guard++ < 200) {
        const sc = Object.assign({}, C.SCENARIO, { down: 4, distance: s.distance, ballOn: s.ballOn });
        const hand = K.deal(sc, s.seed), shell = E.look(sc, hand[0].play, s.seed).shell;
        const card = reader ? hand.find(h => h.type === pickBy[shell]) : hand[s.seed % 3];
        s = G.after(s, E.run(sc, card.play, s.seed), (s.seed * 48271 + r) >>> 0);
      }
      assert.ok(s.over, 'every run ends');
      out.push(s.n);
    }
    return out.reduce((a, b) => a + b, 0) / out.length;
  }
  const a = runs(true), b = runs(false);
  assert.ok(a > b, 'reading the shell pays over a run: ' + a.toFixed(2) + ' against ' + b.toFixed(2));
  assert.ok(a > 2 && a < 8, 'a run lasts a few conversions, not forever: ' + a.toFixed(2));
});

test("today's run: the same seeds for everybody, and a post the server takes", () => {
  assert.equal(G.dailySeed('2026-11-13', 0), G.dailySeed('2026-11-13', 0));
  assert.notEqual(G.dailySeed('2026-11-13', 0), G.dailySeed('2026-11-13', 1));
  assert.notEqual(G.dailySeed('2026-11-13', 0), G.dailySeed('2026-11-14', 0));
  /* a whole day's run on the engine, posted the way supabase/169 checks it */
  let s = G.newRun(G.dailySeed('2026-11-13', 0)); s.daily = '2026-11-13';
  while (!s.over) {
    const sc = Object.assign({}, C.SCENARIO, { down: 4, distance: s.distance, ballOn: s.ballOn });
    s = G.after(s, E.run(sc, K.deal(sc, s.seed)[1].play, s.seed), G.dailySeed(s.daily, s.log.length + 1));
  }
  const p = G.postOf(s);
  assert.ok(p.snaps === p.log.length && p.converted < p.snaps && p.tds <= p.converted && p.yards >= 0);
  assert.ok(p.log.every((l, k) => l.seed === G.dailySeed('2026-11-13', k)), 'snap k is the day\'s seed k');
});
