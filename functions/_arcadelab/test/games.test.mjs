import test from 'node:test';
import assert from 'node:assert/strict';
import { GAMES } from '../registry.js';
import { seedFor } from '../shared/seed.js';
import { play } from './bots.mjs';
import * as Drop from '../games/dropboard/sim.js';
import * as Pin from '../games/pinball/sim.js';
import * as Whack from '../games/whack/sim.js';
import { CONFIG as WC } from '../games/whack/config.js';
import { blast } from '../build/tune-pinball.mjs';

const THEME = { theme: { title: 'Test', slots: [10, 20, 30, 40, 50, 60, 70].map(v => ({ label: 'v' + v, value: v })) } };
const cfgFor = (id, seed) => id === 'drop-board' ? THEME : id === 'whack' ? null : GAMES[id].sim.dailyConfig(seed);

for (const id of Object.keys(GAMES)) {
  test(id + ': same seed and inputs give the same result, and the replay agrees', () => {
    const sim = GAMES[id].sim, seed = seedFor('2026-10-10', id), cfg = cfgFor(id, seed);
    const a = play(id, seed, cfg, 3), b = play(id, seed, cfg, 3);
    assert.ok(a.over, 'the run ends');
    assert.equal(a.score, b.score); assert.deepEqual(a.log, b.log);
    const r = sim.replay(seed, a.log, cfg);
    assert.equal(r.error, undefined, JSON.stringify(r));
    assert.equal(r.score, a.score); assert.deepEqual(r.detail, a.detail);
  });
  test(id + ': a log that never happened is refused', () => {
    const sim = GAMES[id].sim, seed = seedFor('2026-10-10', id), cfg = cfgFor(id, seed);
    assert.ok(sim.replay(seed, 'nope', cfg).error);
    assert.ok(sim.replay(seed, [{ f: 5 }, { f: 2 }], cfg).error, 'frames go forward');
    assert.ok(sim.replay(seed, [{ f: 1, x: NaN, a: NaN, p: 9, h: 99, k: 'ZZ' }], cfg).error, 'an impossible input');
  });
}

test('drop board: the final slot of 50 drops is the same every time', () => {
  const seed = seedFor('2026-10-10', 'drop-board');
  const run = () => { const out = []; for (let i = 0; i < 50; i++) {
    const s = Drop.create(seed + i, THEME); Drop.applyInput(s, { f: 0, x: 5 + (i * 37) % 90 });
    while (s.drop === 0 && !s.over) Drop.step(s);
    out.push(s.results[0].slot);
  } return out; };
  const a = run(), b = run();
  assert.deepEqual(a, b);
  assert.ok(new Set(a).size >= 4, 'drops land in many slots');
});

test('pinball: 400 fast balls never pass through a wall or a flipper', () => {
  const r = blast(400);
  assert.equal(r.crossings, 0); assert.equal(r.escapes, 0);
});

test('pinball: a ball sitting still is moved before six seconds', () => {
  const s = Pin.create(1);
  s.b.rest = false; s.b.inLane = false; s.b.x = 20; s.b.y = 130; s.b.vx = 0; s.b.vy = 0;
  let worst = 0;
  for (let f = 0; f < 600; f++) { Pin.step(s); worst = Math.max(worst, s.slow); }
  assert.ok(worst < 6 * 60, 'longest slow stretch ' + worst);
});

test('whack: everybody meets the same cards, holes and moments', () => {
  const a = Whack.schedule(77, null), b = Whack.schedule(77, null);
  assert.deepEqual(a.spawns, b.spawns);
  for (let r = 0; r < 3; r++) {
    const sp = a.spawns.filter(x => x.round === r), share = sp.filter(x => x.ok).length / sp.length;
    assert.ok(Math.abs(share - WC.CORRECT_SHARE[r]) < 0.2, 'round ' + r + ' correct share ' + share.toFixed(2));
  }
  const holes = a.spawns.map(x => x.hole);
  for (let i = 1; i < holes.length; i++) assert.notEqual(holes[i], holes[i - 1], 'no hole twice in a row');
});

test('whack: three wrong hits end the run', () => {
  const s = Whack.create(5, null); let strikes = 0;
  while (!s.over) {
    const c = s.live.find(x => !x.ok && !x.hit && s.frame >= x.at);
    if (c) { Whack.applyInput(s, { f: s.frame, h: c.hole }); strikes++; }
    Whack.step(s);
  }
  assert.equal(s.strikes, WC.STRIKES); assert.ok(Whack.detail(s).out);
  assert.equal(Whack.squares(Whack.detail(s)).includes('🟥'), true);
});
