/* Beat my play links: a play survives the trip, the result is worked out
 * from the play (never read from the link), and garbage is null, not a throw. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { encode, decode, resultOf, challengeScenario, MAX_LINK } from '../challenge.js';
import { simulate } from '../sim.js';
import { scoreOf } from '../daily.js';

const P = (x, y) => ({ x, y });
const base = { clock: 14, down: 2, set: 'horns', scheme: 'zone23', seed: 123456789 };
const sc = challengeScenario(base);
const play = { spots: sc.spots, goAt: 6, steps: [
  { kind: 'screen', who: 'O5', pts: [P(31, 12.3)] }, { kind: 'move', who: 'O2', pts: [P(40, 6), P(45.6, 21.2)] },
  { kind: 'pass', from: 'O1', to: 'O2' }, { kind: 'shoot', who: 'O2' }] };

test('a play makes the round trip, and the result is the same run', () => {
  const s = encode({ ...base, play });
  assert.match(s, /^[A-Za-z0-9_-]+$/, 'url safe');
  assert.ok(s.length < 1000, 'short: ' + s.length);
  const ch = decode(s);
  assert.deepEqual({ ...ch, play: undefined }, { ...base, play: undefined });
  assert.deepEqual(ch.play.steps, play.steps);
  assert.equal(ch.play.goAt, 6);
  const direct = simulate(sc, play, base.seed, { scheme: 'zone23' });
  const { res, score } = resultOf(ch);
  assert.equal(res.outcome, direct.outcome); assert.equal(res.shotAt, direct.shotAt);
  assert.equal(score, scoreOf(direct));
});

test('the link carries no score, so it cannot claim one', () => {
  const s = encode({ ...base, play });
  const json = JSON.parse(Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
  assert.equal(json.score, undefined);
  assert.equal(json.outcome, undefined);
});

test('garbage is null, never a throw', () => {
  const bad = ['', 'x', '%%%', 'e30', 'A'.repeat(MAX_LINK + 1), null, 42,
    encode({ ...base, play }).slice(0, 40),
    Buffer.from(JSON.stringify({ v: 1, c: 99, d: 1, s: 'box', seed: 1, o: [], k: [] })).toString('base64'),
    Buffer.from(JSON.stringify({ v: 1, c: 10, d: 1, s: 'box', x: 'press', seed: 1, o: new Array(10).fill(100), k: [] })).toString('base64'),
    Buffer.from(JSON.stringify({ v: 1, c: 10, d: 1, s: 'box', seed: 1, o: new Array(10).fill(9999), k: [] })).toString('base64')];
  for (const s of bad) assert.equal(decode(s), null, String(s).slice(0, 30));
});
