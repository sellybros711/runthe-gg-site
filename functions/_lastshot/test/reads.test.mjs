/* THE OPTIONS AND THE READ (the owner, 2026-11-26). Every drawn play has
 * scoring options, the clipboard lists them, and at the decision moment the
 * man with the ball goes to the open one, read off the real defense:
 *
 *   optionsOf      pure, the drawn Shoot first, every starter has two or more
 *   the read       follows the defense: going under the Pin-down it is O2,
 *                  fighting over it is O5 on the roll, and different seeds of
 *                  one play end with different shooters
 *   determinism    the same seed and play give the same run, the look ahead
 *                  draws nothing and leaves nothing behind
 *   the seam       a coach's read order is a progression (not wired yet) */
import test from 'node:test';
import assert from 'node:assert/strict';
import { SCENARIO as SC } from '../scenario.js';
import { simulate, winOf } from '../sim.js';
import { optionsOf, optionLine, deciderOf, choose, readCaption, worthOf, laneRisk, MAX_OPTIONS } from '../reads.js';
import { STARTERS, starterPlay } from '../starters.js';
import { scenarioFor } from '../playbook.js';

const P = (x, y) => ({ x, y });
const seedOf = i => (i * 2654435761) >>> 0;
const DASH = new RegExp('[' + String.fromCharCode(0x2013, 0x2014) + ']');
const PIN = () => starterPlay('pin-down');

test('optionsOf: the drawn Shoot is option 1, every starter has more than one', () => {
  for (const s of STARTERS) {
    const o = optionsOf(SC, s.play), shooter = s.play.steps.find(x => x.kind === 'shoot').who;
    assert.ok(o.length >= 2 && o.length <= MAX_OPTIONS, s.id + ' ' + o.length);
    assert.equal(o[0].who, shooter, s.id + ' option 1 is the drawn shooter');
    assert.equal(o[0].call, true);
    assert.deepEqual(o.map(x => x.n), o.map((x, k) => k + 1));
    assert.equal(new Set(o.map(x => x.who)).size, o.length, s.id + ' one line a man');
    for (const x of o) {
      assert.ok(x.label && x.label.length <= 34 && !DASH.test(x.label), s.id + ' ' + x.label);
      assert.ok(optionLine(x).startsWith(x.n + ' ' + x.who + ' '));
      assert.ok(Number.isFinite(x.at.x) && Number.isFinite(x.at.y));
    }
  }
  const pin = optionsOf(SC, PIN());
  assert.equal(optionLine(pin[0]), '1 O2 wing three off the pin-down');
  assert.equal(optionLine(pin[1]), '2 O5 roll to the rim');
  assert.ok(pin.some(x => x.who === 'O1' && x.label === 'pull-up three'), 'the handler is an option');
  const spain = optionsOf(SC, starterPlay('spain'));
  assert.equal(spain[0].who, 'O5');
  assert.match(spain[0].label, /rim/);
});

test('optionsOf is pure, and a play with no action has only the man with the ball', () => {
  const p = PIN(), before = JSON.stringify(p);
  assert.deepEqual(optionsOf(SC, p), optionsOf(SC, p));
  assert.equal(JSON.stringify(p), before, 'the play is not touched');
  const lazy = { spots: SC.spots, steps: [{ kind: 'shoot', who: 'O1' }] };
  assert.deepEqual(optionsOf(SC, lazy).map(o => o.who), ['O1']);
  // no Shoot yet: ranked by design, still one man a line
  const noShot = { spots: SC.spots, steps: PIN().steps.filter(s => s.kind !== 'shoot') };
  const o = optionsOf(SC, noShot);
  assert.ok(o.length >= 2 && !o.some(x => x.call));
  for (let k = 1; k < o.length; k++) assert.ok(o[k - 1].design >= o[k].design, 'ranked by design');
  for (const junk of [null, {}, { spots: SC.spots }]) assert.deepEqual(optionsOf(SC, junk), []);
  // the decider: the passer of the last pass, or the shooter himself
  assert.deepEqual(deciderOf(SC, PIN()), { who: 'O1', call: 'O2', pass: 3 });
  assert.deepEqual(deciderOf(SC, lazy), { who: 'O1', call: 'O1', pass: -1 });
});

test('worth: down 1 any make, down 2 a two is the coin, down 3 a two is nothing', () => {
  assert.equal(worthOf(SC, 2), 1);
  const d2 = scenarioFor(SC, { down: 2 }), d3 = scenarioFor(SC, { down: 3 });
  assert.equal(worthOf(d2, 2), SC.tuning.overtimeWin); assert.equal(worthOf(d2, 3), 1);
  assert.equal(worthOf(d3, 2), 0); assert.equal(worthOf(d3, 3), SC.tuning.overtimeWin);
  // with time left their answer comes off it
  assert.equal(winOf(SC, 2, 3), 1);
  assert.ok(winOf(SC, 2, 8) < 0.7 && winOf(SC, 2, 8) > 0.3);
  assert.equal(optionsOf(d3, PIN()).filter(o => o.points === 2 && !o.call).length, 0, 'down 3, no two is an option');
});

test('the read follows the defense: under it is O2, over the top it is O5', () => {
  const by = scheme => { const out = []; for (let i = 1; i <= 40; i++) out.push(simulate(SC, PIN(), seedOf(i), { scheme })); return out; };
  const under = by('under'), over = by('over');
  for (const r of under) if (r.shot && !r.shot.bailout) { assert.equal(r.shooter, 'O2'); assert.equal(r.read.why, 'call'); }
  const o5 = over.filter(r => r.shooter === 'O5');
  assert.ok(o5.length >= 32, 'over: O5 shot ' + o5.length + ' of 40');
  for (const r of o5) {
    assert.equal(r.read.call, 'O2'); assert.equal(r.read.pick, 'O5'); assert.notEqual(r.read.why, 'call');
    const c = r.read.options.find(x => x.who === 'O2'), p = r.read.options.find(x => x.who === 'O5');
    assert.ok(p.value > c.value, 'the pick is the better look ' + p.value + ' vs ' + c.value);
    assert.match(r.read.text, /^They fought over\. O2 covered\. O5 (open|the best look)\.$/);
    assert.ok(r.events.some(e => e.read && e.text === r.read.text), 'the caption says it');
    assert.match(r.reason, /^O2 was covered\. O1 found O5\. O5 \(C\) was /);
    assert.ok(r.passes.some(p => p.from === 'O1' && p.to === 'O5'), 'the pass went to O5');
    assert.ok(!r.passes.some(p => p.to === 'O2'), 'and not to O2');
  }
  // the look the read saw is the look he got: the sim looks ahead with itself
  for (const r of [...under, ...over]) if (r.shot && !r.shot.bailout && r.read) {
    const seen = r.read.options.find(x => x.who === r.shooter);
    assert.ok(Math.abs(seen.p - r.shot.p) < 0.02, r.shooter + ' read ' + seen.p + ' shot ' + r.shot.p);
  }
});

test('one play, different seeds, different shooters', () => {
  const seen = {};
  for (let i = 1; i <= 200; i++) { const r = simulate(SC, PIN(), seedOf(i)); seen[r.shooter] = (seen[r.shooter] || 0) + 1; }
  assert.ok((seen.O2 || 0) >= 40 && (seen.O5 || 0) >= 40, JSON.stringify(seen));
  // and the same switch can go either way, off where the defense ended up
  const sw = new Set(); for (let i = 1; i <= 60; i++) sw.add(simulate(SC, PIN(), seedOf(i), { scheme: 'switch' }).shooter);
  assert.ok(sw.has('O2') && sw.has('O5'), [...sw].join(' '));
});

test('determinism: same seed, same run, and the look ahead draws nothing', () => {
  for (const s of STARTERS) for (const seed of [1, 7, 99, 123456789]) {
    assert.equal(JSON.stringify(simulate(SC, s.play, seed)), JSON.stringify(simulate(SC, s.play, seed)), s.id + ' ' + seed);
  }
  const real = Math.random;
  Math.random = () => { throw new Error('Math.random called'); };
  try { for (const s of STARTERS) simulate(SC, s.play, 5); } finally { Math.random = real; }
  // a read leaves the run's own rolls where they were: their answer is the last draw either way
  const r = simulate(SC, PIN(), seedOf(3), { scheme: 'over' });
  assert.ok(r.read && Array.isArray(r.read.options) && r.read.options.length === optionsOf(SC, PIN()).length);
  // a preview never reads
  const pv = simulate(SC, { spots: SC.spots, steps: PIN().steps.slice(0, 3) }, 1, { preview: true });
  assert.equal(pv.read, undefined);
});

test('the lane risk the read weighs is the one the throw rolls', () => {
  for (let i = 1; i <= 30; i++) {
    const r = simulate(SC, PIN(), seedOf(i));
    if (!r.read || r.read.pick === r.read.by) continue;
    const pass = r.passes.find(p => p.to === r.read.pick);
    const seen = r.read.options.find(o => o.who === r.read.pick);
    assert.ok(pass && Math.abs(pass.risk - seen.risk) < 0.02, JSON.stringify(pass) + ' ' + seen.risk);
  }
  const T = SC.tuning;
  assert.equal(laneRisk(T, [], P(25, 31), P(43, 23)).risk, 0);
  assert.ok(laneRisk(T, [{ pos: P(34, 27), man: 'O4' }], P(25, 31), P(43, 23)).risk > 0, 'a man in the lane');
  assert.equal(laneRisk(T, [{ pos: P(34, 27), man: 'O4' }], P(25, 31), P(43, 23), { handoff: true }).risk, 0);
});

test('choose: the call while it is close, the open man when it is not, and the seam for an order', () => {
  const c = (n, who, value, open, call = false) => ({ n, who, value, open, call });
  const call = c(1, 'O2', 0.45, 3.8, true), roll = c(2, 'O5', 0.7, 5.5), spot = c(3, 'O3', 0.3, 7);
  assert.equal(choose([call, roll, spot], 0.9).pick.who, 'O5');
  assert.equal(choose([call, roll, spot], 0.9).why, 'open');
  assert.equal(choose([c(1, 'O2', 0.66, 5, true), roll, spot], 0.9).why, 'call', 'within stay of the best');
  assert.equal(choose([call, c(2, 'O5', 0.6, 2), spot], 0.9).why, 'best', 'nobody open: the best look');
  // a coach's order (not wired yet): the first open one in his order
  assert.equal(choose([call, roll, spot], 0.9, [3, 2]).pick.who, 'O3');
  assert.equal(choose([call, c(2, 'O5', 0.7, 2), c(3, 'O3', 0.3, 2)], 0.9, [3, 2]).pick.who, 'O5', 'nobody open in it: the best');
  assert.equal(choose([], 0.9), null);
  const text = readCaption({ by: 'O1', pick: 'O5', why: 'open', options: [{ who: 'O2', call: true, open: 3 }, { who: 'O5', open: 5 }] }, 'They switched.');
  assert.equal(text, 'They switched. O2 covered. O5 open.');
  assert.equal(readCaption({ by: 'O1', pick: 'O1', why: 'best', options: [{ who: 'O2', call: true, open: 3 }, { who: 'O1', open: 3 }] }, null), 'O2 covered. O1 keeps it.');
  assert.equal(readCaption({ by: 'O1', pick: 'O2', why: 'call', options: [{ who: 'O2', call: true, open: 3 }] }, null), null);
});

test('read copy: short, no dashes', () => {
  for (const s of STARTERS) for (let i = 1; i <= 40; i++) {
    const r = simulate(SC, s.play, seedOf(i));
    const all = r.reason + ' ' + r.events.map(e => e.text).join(' ') + ' ' + (r.read ? r.read.options.map(o => o.label).join(' ') : '');
    assert.ok(!DASH.test(all), all);
    if (r.read && r.read.text) assert.ok(r.read.text.length <= 48 && r.read.text.split('. ').every(t => t.split(' ').length <= 4), r.read.text);
  }
});
