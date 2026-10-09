import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../config.js';
import * as G from '../game.js';

/* A fake slate: answers named by tier, 'c*' called, 'arg' arguable. */
function slate() {
  const rows = new Map([
    ['c1', { name: 'Called One', tier: 1, called: true }],
    ['s1', { name: 'Single', tier: 1 }], ['s2', { name: 'Double', tier: 2 }],
    ['s3', { name: 'Triple', tier: 3 }], ['s4', { name: 'Homer', tier: 4 }],
    ['h4', { name: 'Homer Two', tier: 4 }], ['arg', { name: 'Arguable', tier: 4, arguable: true }]
  ]);
  const p = { id: 'x', league: 'NBA', type: 'athlete', rows };
  return { prompts: [p, p, p, p, p] };
}
const resolveText = (input) => {
  if (input.entityId) return { status: 'match', id: input.entityId, via: 'id' };
  if (input.text === 'ambiguous') return { status: 'picker', options: [{ id: 's1' }, { id: 's2' }] };
  if (input.text === 'nobody') return { status: 'nopitch', reason: 'no_match' };
  return { status: 'match', id: input.text, via: 'exact' };
};
function live(t = 0) { const st = G.newPlay('2026-10-09', 9); G.start(st, t); return st; }
const say = (st, x, t = 1000) => G.answer(st, typeof x === 'object' ? x : { text: x }, slate(), resolveText, t);

test('SAFE earns the frozen tier', () => {
  const st = live();
  const r = say(st, 's3');
  assert.equal(r.ruling, 'SAFE'); assert.equal(r.tier, 3); assert.equal(st.i, 1);
});

test('OUT for a called answer, scoring nothing', () => {
  const st = live();
  const r = say(st, 'c1');
  assert.equal(r.ruling, 'OUT'); assert.equal(r.tier, 0); assert.equal(st.outs, 1);
});

test('each strike lowers the best hit a tier, never below a single', () => {
  assert.deepEqual([0, 1, 2, 3].map(G.maxTier), [4, 3, 2, 1]);
  let st = live(); say(st, 'bad1'); let r = say(st, 's4');
  assert.equal(r.tier, 3, 'one strike caps a home run at a triple');
  st = live(); say(st, 'bad1'); say(st, 'bad2'); r = say(st, 's4');
  assert.equal(r.tier, 2);
  st = live(); say(st, 'bad1'); say(st, 'bad2'); r = say(st, 's1');
  assert.equal(r.tier, 1, 'a single stays a single');
});

test('the third strike in an at-bat is an out', () => {
  const st = live();
  assert.equal(say(st, 'bad1').ruling, 'STRIKE');
  assert.equal(say(st, 'bad2').ruling, 'STRIKE');
  const r = say(st, 'bad3');
  assert.equal(r.ruling, 'STRIKE'); assert.ok(r.strikeout); assert.equal(st.outs, 1); assert.equal(st.i, 1);
});

test('NO PITCH costs nothing, and a repeat of a tried answer is a no pitch', () => {
  const st = live();
  assert.equal(say(st, 'nobody').ruling, 'NO_PITCH');
  assert.equal(st.ab[0].strikes, 0);
  say(st, 'bad1');
  const r = say(st, 'bad1');
  assert.equal(r.ruling, 'NO_PITCH'); assert.equal(r.reason, 'already_tried'); assert.equal(st.ab[0].strikes, 1);
});

test('benefit of the doubt: arguable is accepted, capped at a single, and reviewed', () => {
  const st = live();
  const r = say(st, 'arg');
  assert.equal(r.ruling, 'SAFE'); assert.equal(r.tier, CONFIG.ARGUABLE_CAP); assert.deepEqual(r.review, { id: 'arg', reason: 'arguable' });
});

test('an expired clock is a strike, and the retry gets a fresh clock', () => {
  const st = live(0);
  const late = CONFIG.CLOCK_MS + CONFIG.CLOCK_TOLERANCE_MS + 1;
  const r = say(st, 's4', late);
  assert.equal(r.ruling, 'STRIKE'); assert.ok(r.expired);
  assert.equal(G.remaining(st.ab[0], late), CONFIG.CLOCK_MS);
  const t = say(st, { timeout: true }, late + 3000);
  assert.equal(t.ruling, 'NO_PITCH', 'a timeout ping with time left is ignored');
  assert.equal(st.ab[0].strikes, 1);
});

test('the clock pauses while the picker is open', () => {
  const st = live(0);
  const p = say(st, 'ambiguous', 10000);
  assert.equal(p.ruling, 'PICKER');
  assert.equal(G.remaining(st.ab[0], 40000), CONFIG.CLOCK_MS - 10000, 'thirty seconds in the picker cost nothing');
  const r = say(st, { entityId: 's2' }, 40000);
  assert.equal(r.ruling, 'SAFE');
});

test('three outs end the game; five at-bats with fewer wins it', () => {
  let st = live();
  for (let i = 0; i < 3; i++) { say(st, 'c1'); if (!st.over) G.start(st, 0); }
  assert.ok(st.over); assert.equal(st.won, false); assert.equal(G.answer(st, { text: 's1' }, slate(), resolveText, 0).error, 'game_over');
  st = live();
  for (const a of ['s1', 's2', 's3', 's4', 'c1']) { say(st, a); if (!st.over) G.start(st, 0); }
  assert.ok(st.over); assert.ok(st.won);
  const s = G.summary(st);
  assert.equal(s.bases, 10); assert.equal(s.outs, 1); assert.ok(s.cycle);
});

test('an at-bat cannot be answered before it starts or replayed after', () => {
  const st = G.newPlay('2026-10-09', 9);
  assert.equal(G.answer(st, { text: 's1' }, slate(), resolveText, 0).error, 'not_started');
  G.start(st, 0); say(st, 's1');
  assert.equal(st.ab[0].s, 'done');
  assert.equal(G.answer(st, { text: 's1' }, slate(), resolveText, 0).error, 'not_started', 'the next at-bat waits for its pitch');
});

test('share line and tie-breaks', () => {
  const st = live();
  say(st, 's4'); G.start(st, 0); say(st, 'c1'); G.start(st, 0); say(st, 'bad'); say(st, 's2');
  assert.equal(G.shareLine(st), 'Stumpire #9\n4️⃣ ❌ 2️⃣ ⬜ ⬜\n6/20 · 1 out · 1 strike');
  const a = { bases: 10, outs: 1, strikes: 2 }, b = { bases: 10, outs: 1, strikes: 0 }, c = { bases: 12, outs: 2, strikes: 5 };
  assert.deepEqual([a, b, c].sort(G.compareResults), [c, b, a]);
});
