/* Play calling. Three plays a coach would recognise, drawn by hand from the
 * default box set, run through the real sim:
 *
 *   pin-down       O1 kills clock up top, then O5 comes down from the elbow
 *                  and pins for O2 (the SG) who comes up off it to the wing
 *                  for a three
 *   pick and roll  O1 kills clock, O3 clears to the corner, O4 comes up
 *                  from the elbow to set a ball screen, O1 turns the corner,
 *                  O4 rolls, O1 hits him at the rim
 *   bad play       O1 dribbles all over the top and shoots when he is done,
 *                  which is after the bail-out mark
 *
 * For each: the same seed twice gives identical result JSON, a fixed seed
 * gives a known outcome, and over a few hundred seeds the good plays win
 * clearly more than the bad one. Then the order rule, the screen names, and
 * that the screen scheme moves the shooter's contest distance. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { SCENARIO as SC } from '../scenario.js';
import { simulate } from '../sim.js';
import { planOf, labelsOf, problems, ORDER_RULE } from '../playbook.js';

const spots = () => JSON.parse(JSON.stringify(SC.spots));
const P = (x, y) => ({ x, y });

// O1 walks the ball side to side up top, killing clock before the action.
const KILL = [P(40, 30), P(10, 34), P(40, 34), P(10, 30)];

const PINDOWN = {
  spots: spots(), steps: [
    { kind: 'move', who: 'O1', pts: [...KILL, P(40, 31), P(20, 34), P(28, 32)] },
    { kind: 'screen', who: 'O5', pts: [P(35, 10.5)] },
    { kind: 'move', who: 'O2', pts: [P(33.5, 9), P(38, 14), P(43, 23)] },
    { kind: 'pass', from: 'O1', to: 'O2' },
    { kind: 'shoot', who: 'O2' }
  ]
};

const PNR = {
  spots: spots(), steps: [
    { kind: 'move', who: 'O1', pts: [...KILL, P(34, 32), P(25, 32)] },
    { kind: 'move', who: 'O3', pts: [P(4, 4)] },
    { kind: 'screen', who: 'O4', pts: [P(22.5, 29)] },
    { kind: 'move', who: 'O1', pts: [P(21.5, 32), P(16, 23)] },
    { kind: 'move', who: 'O4', pts: [P(25, 8)] },
    { kind: 'pass', from: 'O1', to: 'O4' },
    { kind: 'shoot', who: 'O4' }
  ]
};

const BAD = {
  spots: spots(), steps: [
    { kind: 'move', who: 'O1', pts: [P(40, 34), P(10, 34), P(40, 38), P(10, 38), P(40, 34), P(10, 34), P(40, 30), P(25, 30)] },
    { kind: 'shoot', who: 'O1' }
  ]
};

const N = 300;
function sweep(play) {
  const out = { n: 0, wins: 0, bail: 0, by: {} };
  for (let seed = 1; seed <= N; seed++) {
    const r = simulate(SC, play, seed);
    out.n++;
    if (r.outcome === 'win') out.wins++;
    if (r.shot && r.shot.bailout) out.bail++;
    const b = out.by[r.scheme] || (out.by[r.scheme] = { n: 0, wins: 0, open: 0, p: 0 });
    b.n++; if (r.outcome === 'win') b.wins++;
    if (r.shot) { b.open += r.shot.open; b.p += r.shot.p; }
  }
  out.rate = out.wins / out.n;
  for (const b of Object.values(out.by)) { b.rate = b.wins / b.n; b.open /= b.n; b.p /= b.n; }
  return out;
}
const SWEEP = { pin: sweep(PINDOWN), pnr: sweep(PNR), bad: sweep(BAD) };
const seedFor = (play, scheme) => { let s = 1; while (simulate(SC, play, s).scheme !== scheme) s++; return s; };

test('the three plays are legal', () => {
  for (const p of [PINDOWN, PNR, BAD]) assert.deepEqual(problems(SC, p), []);
});

test('same seed, same play, same result JSON', () => {
  for (const p of [PINDOWN, PNR, BAD]) for (const seed of [1, 7, 123456789]) {
    assert.equal(JSON.stringify(simulate(SC, p, seed)), JSON.stringify(simulate(SC, p, seed)));
  }
});

test('the sim never calls Math.random', () => {
  const real = Math.random;
  Math.random = () => { throw new Error('Math.random called'); };
  try { simulate(SC, PINDOWN, 3); simulate(SC, PNR, 3); simulate(SC, BAD, 3); } finally { Math.random = real; }
});

test('pin-down: O2 comes off it for a three and it reads as a pin-down', () => {
  assert.equal(labelsOf(SC, PINDOWN)[2], 'pin-down');
  const r = simulate(SC, PINDOWN, 7);
  assert.equal(r.shooter, 'O2');
  assert.equal(r.shot.zone, 'three');
  assert.equal(r.shot.bailout, false);
  assert.equal(r.scheme, 'switch');
  assert.equal(r.shot.byArch, 'C', 'the switch puts the C on the SG');
  assert.ok(r.shotAt < SC.winWindow && r.shotAt > SC.bailoutAt, 'timed to win outright: ' + r.shotAt);
  assert.equal(r.outcome, 'win');
  assert.equal(r.how, 'make');
  assert.match(r.reason, /^O2 \(SG\) was (wide open|open) off the pin-down\. The switch left a C on him\./);
  assert.ok(r.events.some(e => e.text === 'They switch the pin-down'));
});

test('pick and roll: O4 rolls and finishes, the roll is labelled', () => {
  const labels = labelsOf(SC, PNR);
  assert.equal(labels[3], 'pick and roll');
  assert.equal(labels[4], 'roll');
  const r = simulate(SC, PNR, 8);
  assert.equal(r.shooter, 'O4');
  assert.equal(r.shot.zone, 'rim');
  assert.equal(r.shot.bailout, false);
  assert.equal(r.scheme, 'switch');
  assert.equal(r.shot.byArch, 'PG', 'the switch puts the PG on the roller');
  assert.ok(r.shotAt < SC.winWindow && r.shotAt > SC.bailoutAt, 'timed to win outright: ' + r.shotAt);
  assert.equal(r.outcome, 'win');
  assert.equal(r.how, 'make');
  assert.match(r.reason, /^O4 \(PF\) was .+ on the roll\. The switch left a PG on him\. The layup went in/);
  // the roll starts when O1 has used the screen, not when his dribble ends
  const plan = planOf(SC, PNR);
  assert.deepEqual(plan[4].start, { mode: 'used', screen: 2, by: 3 });
});

test('bad play: reaches the bail-out every time and loses most of the time', () => {
  const r = simulate(SC, BAD, 7);
  assert.equal(r.shot.bailout, true);
  assert.equal(r.shotAt, SC.bailoutAt);
  assert.match(r.reason, /^Nobody got there in time\. O1 \(PG\) threw it up at 3\.0\./);
  assert.equal(SWEEP.bad.bail, SWEEP.bad.n, 'every seed is a bail-out');
  assert.ok(SWEEP.bad.rate < 0.25, 'bad play win rate ' + SWEEP.bad.rate);
});

test('the good plays win clearly more often than the bad one', () => {
  const { pin, pnr, bad } = SWEEP;
  assert.equal(pin.bail, 0); assert.equal(pnr.bail, 0);
  assert.ok(pin.rate >= 0.3 && pin.rate <= 0.5, 'pin-down ' + pin.rate);
  assert.ok(pnr.rate >= 0.38 && pnr.rate <= 0.6, 'pick and roll ' + pnr.rate);
  assert.ok(pin.rate > bad.rate + 0.12, 'pin-down ' + pin.rate + ' vs bad ' + bad.rate);
  assert.ok(pnr.rate > bad.rate + 0.2, 'pick and roll ' + pnr.rate + ' vs bad ' + bad.rate);
});

test('the scheme materially changes the shooter\'s contest distance', () => {
  const by = SWEEP.pin.by;
  for (const s of ['switch', 'over', 'under']) assert.ok(by[s] && by[s].n > 50, s + ' was rolled');
  // going under a pin-down for a shooter gives him room; fighting over gets a hand up
  assert.ok(by.under.open - by.over.open >= 2.5, 'under ' + by.under.open.toFixed(1) + ' vs over ' + by.over.open.toFixed(1));
  assert.ok(by.under.open >= 6, 'under is wide open: ' + by.under.open.toFixed(1));
  assert.ok(by.over.open < 4.5, 'over gets close: ' + by.over.open.toFixed(1));
  // on the pick and roll it is the other way round: switching puts a guard on the big
  const r = SWEEP.pnr.by;
  assert.ok(r.switch.p - r.under.p >= 0.06, 'switch ' + r.switch.p.toFixed(2) + ' vs under ' + r.under.p.toFixed(2));
  // and the same seed's scheme decides it: one play, three schemes, three distances
  const d = ['switch', 'over', 'under'].map(s => simulate(SC, PINDOWN, seedFor(PINDOWN, s)).shot.open);
  assert.ok(Math.max(...d) - Math.min(...d) >= 2.5, 'per scheme ' + d.map(x => x.toFixed(1)).join(' '));
});

test('order rule: a cut goes with its screen and waits for it to be set', () => {
  const plan = planOf(SC, PINDOWN);
  assert.deepEqual(plan[1].start, { mode: 'done', of: 0 });
  assert.deepEqual(plan[2].start, { mode: 'with', of: 1 });
  assert.deepEqual(plan[2].parts[1].waitFor, [1], 'the cut waits on step 2, the screen');
  assert.deepEqual(plan[3].start, { mode: 'started', of: 2 }, 'the pass starts with the cut');
  // in the run: O2 leaves with O5, waits, and the ball is in the air before he gets to the wing
  const r = simulate(SC, PINDOWN, 7);
  const F = r.frames, o = (f, i) => ({ x: f.o[2 * i], y: f.o[2 * i + 1] });
  const start = F.findIndex(f => o(f, 4).y < SC.spots.O5.y - 0.3);
  const o2 = F.findIndex(f => Math.hypot(o(f, 1).x - SC.spots.O2.x, o(f, 1).y - SC.spots.O2.y) > 0.3);
  assert.ok(Math.abs(F[start].t - F[o2].t) < 0.1, 'cutter and screener leave together');
  const pass = r.passes[0], arrive = F.find(f => Math.hypot(o(f, 1).x - 43, o(f, 1).y - 23) < 0.2);
  assert.ok(pass.at > arrive.t, 'the pass is thrown before he arrives: ' + pass.at + ' vs ' + arrive.t);
});

test('screens are named as a coach would', () => {
  const s = spots();
  const name = steps => labelsOf(SC, { spots: s, steps });
  assert.equal(name([
    { kind: 'move', who: 'O3', pts: [P(12, 22)] }, { kind: 'screen', who: 'O4', pts: [P(15.5, 25)] },
    { kind: 'move', who: 'O3', pts: [P(14, 23.5), P(3, 22)] }])[2], 'flare screen');
  assert.equal(name([
    { kind: 'screen', who: 'O3', pts: [P(23, 7)] }, { kind: 'move', who: 'O2', pts: [P(25, 6), P(19, 5)] }])[1], 'cross screen');
  assert.equal(name([
    { kind: 'move', who: 'O2', pts: [P(36, 12), P(43, 22)] }, { kind: 'pass', from: 'O1', to: 'O2' },
    { kind: 'screen', who: 'O5', pts: [P(29, 22)] }, { kind: 'move', who: 'O1', pts: [P(28, 24), P(26, 8)] }])[3], 'UCLA screen');
  assert.equal(name([
    { kind: 'move', who: 'O3', pts: [P(8, 20)] }, { kind: 'screen', who: 'O4', pts: [P(11, 17)] },
    { kind: 'move', who: 'O3', pts: [P(10, 18), P(22, 7)] }])[2], 'back screen');
  assert.equal(name([
    { kind: 'screen', who: 'O5', pts: [P(33, 12)] }, { kind: 'screen', who: 'O4', pts: [P(31, 21)] },
    { kind: 'move', who: 'O2', pts: [P(33, 9), P(32, 17), P(30, 27)] }])[2], 'stagger');
  assert.equal(name([
    { kind: 'screen', who: 'O4', pts: [P(22.5, 29)] }, { kind: 'move', who: 'O1', pts: [P(21.5, 32), P(16, 23)] },
    { kind: 'move', who: 'O4', pts: [P(28, 30)] }])[1], 'pick and pop');
  assert.equal(name([
    { kind: 'move', who: 'O5', pts: [P(34, 26)] }, { kind: 'pass', from: 'O1', to: 'O5' },
    { kind: 'move', who: 'O2', pts: [P(38, 16), P(33, 26), P(26, 29)] }, { kind: 'pass', from: 'O5', to: 'O2' }])[3], 'handoff');
});

// the two dash characters the site bans, built from their code points so
// this file holds neither
const DASHES = new RegExp('[' + String.fromCharCode(0x2013, 0x2014) + ']');

test('copy has no dashes and the order rule is two short sentences', () => {
  assert.equal(ORDER_RULE.split('. ').length, 2);
  for (const p of [PINDOWN, PNR, BAD]) for (let seed = 1; seed <= 40; seed++) {
    const r = simulate(SC, p, seed);
    assert.ok(!DASHES.test(r.reason + r.events.map(e => e.text).join(' ')), r.reason);
  }
});

test('an early make gives them a chance that grows with the time left', async () => {
  const { answerOdds } = await import('../sim.js');
  assert.equal(answerOdds(SC, 4.9, 2), 0);
  assert.ok(answerOdds(SC, 6, 2) < answerOdds(SC, 12, 2));
  assert.ok(answerOdds(SC, 12, 3) < answerOdds(SC, 12, 2), 'up 2, a two only ties');
  assert.ok(answerOdds(SC, 21, 2) <= SC.tuning.answerMax);
});
