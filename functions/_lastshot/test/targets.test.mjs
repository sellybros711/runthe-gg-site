/* Launch targets (the owner, 2026-11-13: "arcade true", Go at, the clock is
 * half the decision). These lock the feel the game ships with:
 *
 *   lazy play           a shot with no action wins rarely, sooner or later
 *   great play          a pin-down timed with Go at wins over half the time
 *   timing matters      the same play run at once wins far less
 *   defense matters     one play swings 20 points or more across defenses
 *   shot quality        wide open falls 60% or more, a hand in the face rarely
 *   answer odds         a make with time left is answered most of the time
 *   Go at               the run starts at goAt, the page gets what it needs
 *
 * A retune that breaks one of these changes the game, so it changes this
 * file and the vault note games/last-shot/sim.md in the same PR. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { SCENARIO as SC, DEFENSES } from '../scenario.js';
import { simulate, answerOdds, goAtOf } from '../sim.js';
import { shotQuality } from '../shot.js';
import { problems, playKey, emptyPlay, GO_AT_NEW } from '../playbook.js';

const P = (x, y) => ({ x, y });
const spots = () => JSON.parse(JSON.stringify(SC.spots));
const N = 500;
const seedOf = i => (i * 2654435761) >>> 0;

const PIN_STEPS = [
  { kind: 'screen', who: 'O5', pts: [P(35, 10.5)] },
  { kind: 'move', who: 'O2', pts: [P(33.5, 9), P(38, 14), P(43, 23)] },
  { kind: 'pass', from: 'O1', to: 'O2' },
  { kind: 'shoot', who: 'O2' }
];
const PIN = { spots: spots(), steps: PIN_STEPS, goAt: 6 };
const PIN_NOW = { spots: spots(), steps: PIN_STEPS };
const LAZY_NOW = { spots: spots(), steps: [{ kind: 'shoot', who: 'O1' }] };
const LAZY_LATE = { spots: spots(), steps: [{ kind: 'shoot', who: 'O1' }], goAt: 6 };

function rate(play, opt) {
  let w = 0;
  for (let i = 1; i <= N; i++) if (simulate(SC, play, seedOf(i), opt).outcome === 'win') w++;
  return w / N;
}
const R = { pin: rate(PIN), pinNow: rate(PIN_NOW), lazyNow: rate(LAZY_NOW), lazyLate: rate(LAZY_LATE) };

test('a lazy play wins rarely, whenever it goes', () => {
  assert.ok(R.lazyNow <= 0.22, 'one tap shoot at once ' + R.lazyNow);
  assert.ok(R.lazyLate >= 0.12 && R.lazyLate <= 0.32, 'one tap shoot at 6 ' + R.lazyLate);
});

test('a great play timed right wins over half the time', () => {
  assert.ok(R.pin >= 0.5 && R.pin <= 0.7, 'pin-down at 6 ' + R.pin);
  assert.ok(R.pin >= R.lazyLate + 0.25, 'pin-down ' + R.pin + ' vs lazy ' + R.lazyLate);
});

test('timing matters: the same play run at once wins far less', () => {
  assert.ok(R.pin - R.pinNow >= 0.2, 'at 6 ' + R.pin + ' vs at once ' + R.pinNow);
});

test('defense matters: one play swings 20 points across the seven defenses', () => {
  const by = DEFENSES.map(d => [d, rate(PIN, { scheme: d })]);
  const rates = by.map(b => b[1]);
  assert.ok(Math.max(...rates) - Math.min(...rates) >= 0.2, JSON.stringify(by));
  // the pin-down is a man play: going under it gives it up, a zone takes it away
  const of = d => by.find(b => b[0] === d)[1];
  assert.ok(of('under') >= 0.65, 'under ' + of('under'));
  assert.ok(of('zone131') < of('under') - 0.2, '1-3-1 ' + of('zone131'));
});

test('shot quality: wide open falls, a hand in the face mostly does not', () => {
  const at = (arch, pos, d, extra = {}) => shotQuality(SC, { pos, arch, ...extra }, [{ who: 'X2', arch, pos: { x: pos.x + d, y: pos.y } }], false).p;
  const wing3 = P(45, 20), elbow = P(32, 19);
  for (const a of ['PG', 'SG', 'SF']) {
    const open = at(a, wing3, 8);
    assert.ok(open >= 0.55 && open <= 0.82, a + ' wide open three ' + open);
    assert.ok(at(a, wing3, 1) <= 0.25, a + ' contested three ' + at(a, wing3, 1));
  }
  assert.ok(at('SG', elbow, 8) >= 0.6, 'SG open two');
  assert.ok(at('C', wing3, 8) <= 0.2, 'a center does not shoot threes');
});

test('answer odds: the clock is half the decision', () => {
  assert.equal(answerOdds(SC, 4.9, 2), 0, 'inside the window it is over');
  assert.ok(answerOdds(SC, 6, 2) <= 0.45, 'at 6 ' + answerOdds(SC, 6, 2));
  assert.ok(answerOdds(SC, 15, 2) >= 0.7, 'at 15 ' + answerOdds(SC, 15, 2));
  assert.ok(answerOdds(SC, 15, 3) < answerOdds(SC, 15, 2), 'up 2 they need a three more often');
});

test('Go at: the run starts at goAt and the page gets the hold', () => {
  const r = simulate(SC, PIN, 7);
  assert.equal(r.startClock, SC.clock);
  assert.equal(r.goAt, 6);
  assert.ok(Math.abs(r.frames[0].t - 6) < 0.01, 'first frame at ' + r.frames[0].t);
  assert.ok(r.shotAt <= 6);
  // no goAt goes at once, exactly as before
  const now = simulate(SC, PIN_NOW, 7);
  assert.equal(now.goAt, SC.clock);
  assert.ok(Math.abs(now.frames[0].t - SC.clock) < 0.01);
  // clamped into 1.0 and the clock
  assert.equal(goAtOf(SC, { goAt: 40 }), SC.clock);
  assert.equal(goAtOf(SC, { goAt: 0.2 }), 1);
  // same seed, same play: identical
  assert.deepEqual(simulate(SC, PIN, 11), simulate(SC, PIN, 11));
});

test('Go at in the play model', () => {
  const e = emptyPlay(SC);
  assert.equal(e.goAt, GO_AT_NEW);
  assert.notEqual(playKey(PIN), playKey(PIN_NOW));
  assert.notEqual(playKey({ ...PIN, goAt: 7 }), playKey(PIN));
  assert.deepEqual(problems(SC, PIN), []);
  assert.deepEqual(problems(SC, { ...PIN, goAt: 30 }), [], 'past the clock goes at once');
  assert.equal(problems(SC, { ...PIN, goAt: 0.5 }).length, 1);
});

test('the result carries what the page needs for the readout and the cutaway', () => {
  for (let i = 1; i <= 60; i++) {
    const r = simulate(SC, PIN_NOW, seedOf(i));
    if (r.shot) {
      const ev = r.events.find(e => e.shot);
      assert.ok(ev && typeof ev.p === 'number' && typeof ev.open === 'number' && ev.zone, 'shot event ' + JSON.stringify(ev));
    }
    if (r.answer) {
      const a = r.answer;
      assert.ok(a.at > 0 && a.at < a.startAt && a.startAt <= r.shotAt, JSON.stringify(a) + ' shot at ' + r.shotAt);
      assert.ok(a.kind === 'two' || a.kind === 'three');
      assert.equal(r.how, a.scored ? 'answer' : a.tied ? 'ot' : 'stop');
    }
  }
});
