/* The playbook's rules: names from the coach's terminology, which rule wins,
 * the forced defense Test it uses, the snap count, and a playbook file that
 * comes back exactly as it went out.
 *
 *   node --test 4th-and-what/test/playbook.test.mjs */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const N = require('../names.js'), B = require('../book.js'), E = require('../engine.js'), C = require('../config.js');

const SNAG = { formation: 'gun3x1', moved: {}, blocks: [], handoff: null, targets: ['WR1'],
  routes: [{ who: 'WR1', pts: [[-13.5, 1.5], [-9.5, 5.5]] }, { who: 'SLOT', pts: [[-9.5, 1], [-13.5, 3]] }, { who: 'WR2', pts: [[13.5, 12], [12.5, 10]] }] };

test('a play is named from the preset when there are no rules', () => {
  assert.equal(N.suggest(SNAG, {}).name, 'Trips Left Slant Flat Comeback');
  assert.equal(N.suggest(SNAG, { preset: 'tree' }).name, 'Trips Left 213');
});

test('a route word: a slant on the left is Seminole', () => {
  assert.equal(N.suggest(SNAG, { routes: [{ type: 'slant', side: 'left', who: 'any', word: 'Seminole' }] }).name, 'Trips Left Seminole Flat Comeback');
  /* not on the right */
  assert.equal(N.suggest(SNAG, { routes: [{ type: 'slant', side: 'right', who: 'any', word: 'Seminole' }] }).name, 'Trips Left Slant Flat Comeback');
});

test('the most exact rule wins: a player beats a side, a side beats anywhere', () => {
  const t = { routes: [{ type: 'slant', side: 'any', who: 'any', word: 'Any' }, { type: 'slant', side: 'left', who: 'any', word: 'Side' }, { type: 'slant', side: 'any', who: 'X', word: 'Player' }] };
  assert.equal(N.suggest(SNAG, t).name, 'Trips Left Player Flat Comeback');
});

test('strong and weak follow the formation', () => {
  assert.equal(N.suggest(SNAG, { routes: [{ type: 'slant', side: 'strong', word: 'Hot' }] }).name, 'Trips Left Hot Flat Comeback');
  assert.equal(N.suggest(SNAG, { routes: [{ type: 'comeback', side: 'weak', word: 'Backside' }] }).name, 'Trips Left Slant Flat Backside');
});

test('a concept names routes together, before single route words', () => {
  const t = { concepts: [{ types: ['slant', 'flat'], side: 'any', word: 'Snag' }], routes: [{ type: 'slant', side: 'left', word: 'Seminole' }] };
  const s = N.suggest(SNAG, t);
  assert.equal(s.name, 'Trips Left Snag Comeback');
  assert.ok(s.parts.some(p => p.why && /Snag/.test(p.why)), 'it says which rule named it');
  /* not on the other side */
  assert.equal(N.suggest(SNAG, { concepts: [{ types: ['slant', 'flat'], side: 'right', word: 'Snag' }] }).name, 'Trips Left Slant Flat Comeback');
});

test('a concept on both sides is called once', () => {
  const both = { formation: 'gun2x2', moved: {}, blocks: [], handoff: null, targets: ['WR1'],
    routes: [{ who: 'WR1', pts: [[-13.5, 1.5], [-9.5, 5.5]] }, { who: 'SLOT', pts: [[-8.5, 1], [-12.5, 3]] }, { who: 'WR2', pts: [[13.5, 1.5], [9.5, 5.5]] }, { who: 'TE', pts: [[8.5, 1], [12.5, 3]] }] };
  assert.equal(N.suggest(both, { concepts: [{ types: ['slant', 'flat'], side: 'any', word: 'Snag' }] }).name, 'Doubles Snag');
});

test('formation words, the name order, and runs', () => {
  assert.equal(N.suggest(SNAG, { formations: { gun3x1: 'Spread' }, pattern: ['play', 'formation', 'side'] }).name, 'Slant Flat Comeback Spread Left');
  assert.equal(N.suggest(SNAG, {}, { formationName: 'Bunch' }).name, 'Bunch Left Slant Flat Comeback');
  const power = { formation: 'iform', moved: {}, routes: [], blocks: [{ who: 'TE', to: [-1.5, -1] }], handoff: { to: 'RB', path: [[-1, -3], [-1.6, 0.5], [-1.8, 6]] }, targets: [] };
  assert.equal(N.suggest(power, {}).name, 'I Right Power Left');
  assert.equal(N.suggest(power, { runs: [{ carrier: 'R', lead: 'yes', side: 'left', word: 'Dragon' }] }).name, 'I Right Dragon');
  const sneak = { formation: 'uc12', moved: {}, routes: [], blocks: [], handoff: { to: 'QB', path: [[0, 4]] }, targets: [] };
  assert.equal(N.suggest(sneak, { runs: [{ carrier: 'Q', word: 'Tush Push' }] }).name, 'Ace Tush Push');
});

test('Test it can force each call, and the dice after it fall the same way', () => {
  const sc = Object.assign({}, C.SCENARIO, { distance: 5 });
  for (const k of E.CALL_KEYS) {
    const r = E.run(sc, SNAG, 11, { call: k });
    assert.equal(r.callKey, k);
    assert.equal(JSON.stringify(r), JSON.stringify(E.run(sc, SNAG, 11, { call: k })), k + ' is deterministic');
  }
  assert.equal(E.CALL_KEYS.length, 7);
});

test('a watched snap counts against the call the defense made', () => {
  const b = B.newBook('Test'), e = B.newPlay(b, SNAG, { distance: 5 });
  B.countSnap(e, 5, 'cover2', true); B.countSnap(e, 5, 'cover2', false); B.countSnap(e, 5, 'cover0', true);
  assert.deepEqual(e.stats[5].byCall, { cover2: { n: 2, w: 1 }, cover0: { n: 1, w: 1 } });
  assert.deepEqual(B.totals(e.stats[5].byCall), { n: 3, w: 2 });
});

test('a playbook file comes back as it went out, with fresh ids', () => {
  const b = B.newBook('Varsity'); b.team = 'Westfield';
  b.sections.push({ id: 'red', name: 'Red zone' });
  b.plays.push(B.newPlay(b, SNAG, { name: 'Snag Right', nameEdited: true, section: 'red', notes: 'Read the flat', distance: 7 }));
  const terms = { routes: [{ type: 'slant', side: 'left', word: 'Seminole' }] };
  const r = B.importFile(B.exportFile(b, terms));
  assert.notEqual(r.book.id, b.id);
  assert.equal(r.book.name, 'Varsity'); assert.equal(r.book.team, 'Westfield');
  assert.equal(r.book.sections.length, 2);
  const p = r.book.plays[0];
  assert.equal(p.name, 'Snag Right'); assert.equal(p.notes, 'Read the flat'); assert.equal(p.distance, 7);
  assert.equal(r.book.sections.find(s => s.id === p.section).name, 'Red zone');
  assert.deepEqual(p.play, b.plays[0].play);
  assert.deepEqual(r.terms, terms);
  assert.throws(() => B.importFile('{"nope":1}'), /not a 4th and What playbook/);
});
