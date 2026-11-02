/* The playbook: frames, the situation, forced schemes, Test it, names from a
 * coach's words, and the playbook file. Pure: no browser, no account. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { SCENARIO as SC, SCHEMES } from '../scenario.js';
import { simulate } from '../sim.js';
import * as P from '../playbook.js';
import * as N from '../names.js';
import * as B from '../book.js';
import { testPlay, testKey, DEFENSES } from '../testit.js';

const pt = (x, y) => ({ x, y });
const spots = () => JSON.parse(JSON.stringify(SC.spots));
const KILL = [pt(40, 30), pt(10, 34), pt(40, 34), pt(10, 30)];
const PIN = { spots: spots(), steps: [
  { kind: 'move', who: 'O1', pts: [...KILL, pt(40, 31), pt(20, 34), pt(28, 32)], beat: 1 },
  { kind: 'screen', who: 'O5', pts: [pt(35, 10.5)], beat: 2 },
  { kind: 'move', who: 'O2', pts: [pt(33.5, 9), pt(38, 14), pt(43, 23)], beat: 2 },
  { kind: 'pass', from: 'O1', to: 'O2', beat: 3 },
  { kind: 'shoot', who: 'O2', beat: 3 }] };
const PNR = { spots: spots(), steps: [
  { kind: 'move', who: 'O1', pts: [...KILL, pt(34, 32), pt(25, 32)] },
  { kind: 'move', who: 'O3', pts: [pt(4, 4)] },
  { kind: 'screen', who: 'O4', pts: [pt(22.5, 29)] },
  { kind: 'move', who: 'O1', pts: [pt(21.5, 32), pt(16, 23)] },
  { kind: 'move', who: 'O4', pts: [pt(25, 8)] },
  { kind: 'pass', from: 'O1', to: 'O4' },
  { kind: 'shoot', who: 'O4' }] };
const noBeats = p => ({ ...p, steps: p.steps.map(({ beat, ...s }) => s) });

/* ---------- frames ---------- */

test('frames group steps, and a play with no beats is one frame', () => {
  assert.deepEqual(P.framesOf(PIN), [[0], [1, 2], [3, 4]]);
  assert.deepEqual(P.framesOf(PNR), [[0, 1, 2, 3, 4, 5, 6]]);
  assert.deepEqual(P.framesOf(PNR, 2), [[0, 1, 2, 3, 4, 5, 6], []]);
});

test('a step added to an earlier frame joins the end of that frame', () => {
  const p = P.addToFrame(PIN, 2, { kind: 'move', who: 'O3', pts: [pt(4, 4)] });
  assert.deepEqual(p.steps.map(s => s.beat), [1, 2, 2, 2, 3, 3]);
  assert.equal(p.steps[3].who, 'O3');
  const q = P.addToFrame({ spots: spots(), steps: [] }, 1, { kind: 'pass', from: 'O1', to: 'O2' });
  assert.equal(q.steps.length, 1);
});

test('frames are presentation only: the same play with or without beats runs the same', () => {
  for (const seed of [1, 2, 3, 99, 1234]) assert.deepEqual(simulate(SC, PIN, seed), simulate(SC, noBeats(PIN), seed));
  assert.equal(P.playKey(PIN), P.playKey(noBeats(PIN)), 'regrouping frames never makes a test stale');
});

test('Play frame previews one frame, from where it starts, with no shot', () => {
  const pv = P.previewOf(SC, PIN, 3);
  assert.equal(pv.sc.handler, 'O1');
  assert.deepEqual(pv.play.steps.map(s => s.kind), ['pass']);
  assert.deepEqual(pv.play.spots.O2, pt(43, 23));
  const r = simulate(pv.sc, pv.play, 5, { preview: true });
  assert.equal(r.preview, true);
  assert.ok(r.frames.length > 2);
  assert.ok(!('outcome' in r));
  assert.throws(() => simulate(pv.sc, pv.play, 5), /Pick a shooter/);
});

/* ---------- forced schemes ---------- */

test('a forced scheme is rolled first, so the rest falls the same way', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const r = simulate(SC, PIN, seed);
    assert.deepEqual(simulate(SC, PIN, seed, { scheme: r.scheme }), r, 'forcing the rolled scheme changes nothing (seed ' + seed + ')');
  }
  for (const s of SCHEMES) assert.equal(simulate(SC, PIN, 3, { scheme: s }).scheme, s);
  assert.equal(simulate(SC, PIN, 3, { scheme: 'zone' }).scheme, simulate(SC, PIN, 3).scheme, 'an unknown scheme is ignored');
});

test('Test it runs every defense, the same every time', () => {
  const a = testPlay(SC, PIN, { runs: 12 }), b = testPlay(SC, PIN, { runs: 12 });
  assert.deepEqual(a, b);
  assert.deepEqual(Object.keys(a.rows), DEFENSES);
  for (const d of DEFENSES) { assert.equal(a.rows[d].n, 12); assert.ok(a.rows[d].w <= 12); }
  assert.equal(a.all.n, 12 * DEFENSES.length);
});

test('a test goes stale when the play or its situation changes, not when frames do', () => {
  const k = testKey(SC, PIN, null);
  assert.equal(testKey(SC, noBeats(PIN), null), k);
  assert.notEqual(testKey(SC, PIN, { clock: 12 }), k);
  const moved = JSON.parse(JSON.stringify(PIN)); moved.steps[2].pts[2] = pt(44, 24);
  assert.notEqual(testKey(SC, moved, null), k);
});

/* ---------- the situation ---------- */

test('a play can set its own clock and ball handler, within the limits', () => {
  assert.equal(P.scenarioFor(SC, null), SC);
  const s = P.scenarioFor(SC, { clock: 9, handler: 'O3' });
  assert.equal(s.clock, 9); assert.equal(s.handler, 'O3'); assert.equal(s.us, SC.us);
  assert.equal(P.scenarioFor(SC, { clock: 99 }).clock, P.CLOCK_MAX);
  assert.equal(P.scenarioFor(SC, { clock: 1 }).clock, P.CLOCK_MIN);
  assert.equal(P.cleanSituation({ handler: 'X9' }), null);
  const r = simulate(P.scenarioFor(SC, { clock: 9 }), noBeats(PIN), 4);
  assert.ok(r.shotAt <= 9);
});

/* ---------- names ---------- */

test('the set is read from where the five start', () => {
  assert.equal(N.setOf(SC.spots), 'box');
  assert.equal(N.setOf({ O1: pt(25, 31), O2: pt(46, 6), O3: pt(4, 6), O4: pt(18.5, 18.5), O5: pt(31.5, 18.5) }), 'horns');
  assert.equal(N.setOf({ O1: pt(25, 31), O2: pt(43, 20), O3: pt(7, 20), O4: pt(18, 20), O5: pt(32, 20) }), 'high14');
  assert.equal(N.setOf({ O1: pt(25, 31), O2: pt(46, 4), O3: pt(4, 4), O4: pt(44, 22), O5: pt(6, 22) }), 'out5');
});

test('presets name a play by number or by position', () => {
  assert.equal(N.suggest(SC, PIN, {}).name, 'Box Pin 2');
  assert.equal(N.suggest(SC, PIN, { preset: 'positions' }).name, 'Box Pin SG');
  assert.equal(N.suggest(SC, PNR, {}).name, 'Box Pick 4', 'a ball screen is called by who sets it');
});

test('the most specific action rule wins: a player beats a side, a side beats any', () => {
  const t = { actions: [{ action: 'pin-down', word: 'Down' }, { action: 'pin-down', side: 'right', word: 'Wing' }, { action: 'pin-down', who: 'O2', word: 'Elevator' }] };
  assert.equal(N.suggest(SC, PIN, t).name, 'Box Elevator');
  assert.equal(N.suggest(SC, PIN, { actions: [{ action: 'pin-down', side: 'left', word: 'Left' }, { action: 'pin-down', side: 'right', word: 'Wing' }] }).name, 'Box Wing');
  const r = N.suggest(SC, PIN, t);
  assert.ok(r.parts.some(x => x.why && x.why.includes('Elevator')), 'it says which rule named it');
});

test('a series wins over single actions, and one with a set takes the set place', () => {
  assert.equal(N.suggest(SC, PNR, { series: [{ set: 'box', actions: ['pick and roll'], word: 'Box Twist' }] }).name, 'Box Twist');
  assert.equal(N.suggest(SC, PNR, { series: [{ set: 'horns', actions: ['pick and roll'], word: 'Horns Twist' }] }).name, 'Box Pick 4', 'the wrong set never matches');
  assert.equal(N.suggest(SC, PIN, { sets: { box: 'Elevator' } }).name, 'Elevator Pin 2');
  assert.equal(N.suggest(SC, PIN, { pattern: ['play', 'set'] }).name, 'Pin 2 Box');
  assert.equal(N.suggest(SC, PIN, { pattern: ['set', 'side', 'play'] }).name, 'Box Right Pin 2');
});

test('a frame caption says what happens in it', () => {
  assert.equal(N.captionOf(SC, PIN, 2, {}), '5 sets the pin-down for 2.');
  assert.equal(N.captionOf(SC, PIN, 3, {}), '1 passes to 2. 2 shoots.');
});

/* ---------- the playbook model and file ---------- */

test('a run counts against the scheme the sim used', () => {
  const b = B.newBook('Varsity'), e = B.newPlay(b, PIN, { name: 'Box Pin 2' });
  B.countRun(e, '22.0/O1', 'over', true); B.countRun(e, '22.0/O1', 'over', false); B.countRun(e, '22.0/O1', 'switch', true);
  assert.deepEqual(e.stats['22.0/O1'].byScheme, { over: { n: 2, w: 1 }, switch: { n: 1, w: 1 } });
  assert.deepEqual(B.totals(e.stats['22.0/O1'].byScheme), { n: 3, w: 2 });
});

test('the playbook file round trips with fresh ids', () => {
  const b = B.newBook('Varsity');
  b.sections.push({ id: 'late', name: 'Late game' });
  b.sets.push({ id: 's1', name: 'Elevator', spots: spots() });
  const e = B.newPlay(b, PIN, { name: 'Box Pin 2', section: 'late', situation: { clock: 9 } });
  e.frameNotes = { 2: 'Wait for the screen.' };
  b.plays.push(e);
  const file = B.exportFile(b, { preset: 'positions' });
  const back = B.importFile(file);
  assert.notEqual(back.book.id, b.id);
  assert.notEqual(back.book.plays[0].id, e.id);
  assert.equal(back.book.plays[0].section, back.book.sections[1].id, 'a play keeps its section');
  assert.deepEqual(back.book.plays[0].play, e.play);
  assert.deepEqual(back.book.plays[0].situation, { clock: 9 });
  assert.equal(back.book.plays[0].frameNotes[2], 'Wait for the screen.');
  assert.equal(back.terms.preset, 'positions');
  assert.throws(() => B.importFile('{"format":"4th-and-what-playbook","book":{}}'), /not a Last Shot playbook/);
});

test('a full book stays under the cloud save cap', () => {
  const b = B.newBook('Big');
  for (let i = 0; i < B.MAX_PLAYS; i++) b.plays.push(B.newPlay(b, PIN, { name: 'Play ' + i }));
  assert.ok(B.bytesOf(b) < B.MAX_BYTES, 'bytes ' + B.bytesOf(b));
});
