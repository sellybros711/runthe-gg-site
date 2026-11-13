/* Down 2, down 3, overtime and the bail-out mark (2026-11-13).
 *
 *   down 3       a made two is not enough, whatever the clock
 *   down 2       a two at the horn ties it: overtime, a coin flip
 *   tied early   their ball: they score and win, they miss and it is overtime
 *   up 2 early   their two ties it (overtime), their three beats you
 *   bail-out     a shooter already in his gather at 3.0 lets it go on time,
 *                so a catch timed to the mark is not a free look
 *   down 1       never lands in overtime from the horn and never falls short */
import test from 'node:test';
import assert from 'node:assert/strict';
import { SCENARIO as SC } from '../scenario.js';
import { simulate } from '../sim.js';
import { scenarioFor, situationKey, cleanSituation } from '../playbook.js';

const P = (x, y) => ({ x, y });
const spots = () => JSON.parse(JSON.stringify(SC.spots));
const seedOf = i => (i * 2654435761) >>> 0;
const PIN = [
  { kind: 'screen', who: 'O5', pts: [P(35, 10.5)] },
  { kind: 'move', who: 'O2', pts: [P(33.5, 9), P(38, 14), P(43, 23)] },
  { kind: 'pass', from: 'O1', to: 'O2' },
  { kind: 'shoot', who: 'O2' }
];
// O2 to the block, a two
const TWO = [{ kind: 'move', who: 'O2', pts: [P(30, 12)] }, { kind: 'pass', from: 'O1', to: 'O2' }, { kind: 'shoot', who: 'O2' }];

function runs(sc, play, n = 300, opt) {
  const out = [];
  for (let i = 1; i <= n; i++) out.push(simulate(sc, play, seedOf(i), opt));
  return out;
}

test('a situation carries down 2 or 3, and down 1 keys as before', () => {
  assert.deepEqual(cleanSituation({ down: 2 }), { down: 2 });
  assert.equal(cleanSituation({ down: 1 }), null, 'down 1 is the default');
  assert.equal(cleanSituation({ down: 5 }), null);
  const d3 = scenarioFor(SC, { down: 3 });
  assert.equal(d3.them - d3.us, 3);
  assert.equal(situationKey(SC, null), '22.0/O1');
  assert.equal(situationKey(SC, { down: 2, clock: 8 }), '8.0/O1/d2');
});

test('down 3: a made two is not enough', () => {
  const sc = scenarioFor(SC, { down: 3 });
  const twos = runs(sc, { spots: spots(), steps: TWO, goAt: 5 }).filter(r => r.shot && r.shot.made && r.shot.points === 2);
  assert.ok(twos.length > 20, 'made twos ' + twos.length);
  for (const r of twos) { assert.equal(r.outcome, 'lose'); assert.equal(r.how, 'short'); assert.match(r.reason, /needed a three/); }
  const threes = runs(sc, { spots: spots(), steps: PIN, goAt: 5.5 }).filter(r => r.shot && r.shot.made && r.shot.points === 3 && r.shotAt < sc.winWindow);
  assert.ok(threes.length > 20);
  for (const r of threes) assert.equal(r.how, 'ot', 'down 3, a three at the horn ties it');
});

test('down 2: a two at the horn goes to overtime, a coin flip', () => {
  const sc = scenarioFor(SC, { down: 2 });
  const late = runs(sc, { spots: spots(), steps: TWO, goAt: 5 }, 500).filter(r => r.shot && r.shot.made && r.shotAt < sc.winWindow);
  assert.ok(late.length > 50, 'late made twos ' + late.length);
  for (const r of late) { assert.equal(r.how, 'ot'); assert.equal(r.ot.after, 'end'); assert.equal(r.us, r.them); }
  const won = late.filter(r => r.outcome === 'win').length / late.length;
  assert.ok(won > 0.3 && won < 0.7, 'overtime won ' + won);
  // a three at the horn wins it outright
  const three = runs(sc, { spots: spots(), steps: PIN, goAt: 6 }).filter(r => r.shot && r.shot.made && r.shot.points === 3 && r.shotAt < sc.winWindow);
  assert.ok(three.length > 20);
  for (const r of three) { assert.equal(r.outcome, 'win'); assert.equal(r.how, 'make'); }
});

test('tied with time left: their ball, then a loss or overtime', () => {
  const sc = scenarioFor(SC, { down: 2 });
  const early = runs(sc, { spots: spots(), steps: TWO }, 500).filter(r => r.shot && r.shot.made && r.shotAt >= sc.winWindow);
  assert.ok(early.length > 20);
  for (const r of early) {
    assert.ok(r.answer, 'their ball');
    if (r.answer.scored) assert.equal(r.how, 'answer');
    else { assert.equal(r.how, 'ot'); assert.equal(r.ot.after, 'stop'); }
  }
});

test('up 2 with time left: their two ties it, their three beats you', () => {
  const up2 = runs(SC, { spots: spots(), steps: PIN }, 600).filter(r => r.answer && r.shot.points === 3);
  assert.ok(up2.length > 30);
  const kinds = new Set(up2.map(r => r.how));
  assert.ok(kinds.has('ot') && kinds.has('answer') && kinds.has('stop'), [...kinds].join(' '));
  for (const r of up2) {
    if (r.how === 'answer') assert.equal(r.them, r.us + 1, 'their three wins by one');
    if (r.how === 'ot') { assert.equal(r.ot.after, 'answer'); assert.equal(r.them, r.us); }
  }
});

test('down 1 never falls short and never ties at the horn', () => {
  for (const r of runs(SC, { spots: spots(), steps: TWO, goAt: 5 }, 300)) {
    assert.notEqual(r.how, 'short');
    if (r.how === 'ot') assert.notEqual(r.ot.after, 'end');
  }
});

test('the bail-out mark does not hand a catch a free look', () => {
  // a pop timed so the catch lands at the 3.0 mark: the closeout still comes
  const pop = { spots: spots(), goAt: 4.6, steps: [{ kind: 'move', who: 'O2', pts: [P(43, 23)] }, { kind: 'pass', from: 'O1', to: 'O2' }, { kind: 'shoot', who: 'O2' }] };
  const rs = runs(SC, pop, 200);
  const open = rs.reduce((a, r) => a + r.shot.open, 0) / rs.length;
  assert.ok(open < 4.5, 'average room at release ' + open.toFixed(1));
  assert.ok(rs.every(r => r.shotAt < 3.0), 'he lets it go after the mark, on his own time');
});
