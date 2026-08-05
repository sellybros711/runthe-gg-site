/* Run The Setlist — QA harness for scoring v2.
 *
 *   node setlist/verify-scoring.mjs
 *
 * Asserts scoring.js against the v2 spec by hand-computed expected values.
 * If a scoring constant changes, this file should be the thing that fails first.
 */

import {
  SCALE, SEGUE_COEF, COMPLETION_BONUS, NEUTRAL_BASE, NUM_ROUNDS, SLOTS,
  versionScore, placementMult, slotFit, rarityBase, scorePerf, segueBonus, scoreSetlist,
} from './scoring.js';

let pass = 0, fail = 0;
function eq(actual, expected, label){
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { pass++; }
  else { fail++; console.log(`  FAIL  ${label}\n        expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
}
function group(name, fn){ console.log(`\n${name}`); fn(); }

/** A performance row, as the CSV would give it (all strings). */
const perf = (o = {}) => ({
  song_id: o.song_id || 'x', song: o.song || 'Song',
  tags: o.tags || '', crowd_rating: o.crowd_rating === undefined ? '' : String(o.crowd_rating),
  is_jamchart: o.jam ? 'true' : 'false',
  length_sec: String(o.len || 0), show_gap: String(o.gap || 0),
  is_cover: 'false', original_artist: '', set: '1', position: '1',
});

group('constants', () => {
  eq(SCALE, 1.3, 'SCALE');
  eq(SEGUE_COEF, 0.25, 'SEGUE_COEF');
  eq(COMPLETION_BONUS, 30, 'completion bonus');
  eq(NEUTRAL_BASE, 30, 'neutral base');
  eq(NUM_ROUNDS, 8, 'rounds');
  eq(SLOTS.length, 8, 'slot count');
  eq(SLOTS.map(s => s.tags.join('|')),
     ['opener', '', 'closer|jam', 'opener|jam', 'peak', 'ballad', 'closer|peak', 'encore'],
     'slot preferred tags');
});

group('rarityBase(gap) tiers', () => {
  eq(rarityBase(200), 50, 'gap 200');
  eq(rarityBase(100), 50, 'gap 100 (boundary)');
  eq(rarityBase(99),  35, 'gap 99');
  eq(rarityBase(50),  35, 'gap 50 (boundary)');
  eq(rarityBase(49),  20, 'gap 49');
  eq(rarityBase(20),  20, 'gap 20 (boundary)');
  eq(rarityBase(19),  10, 'gap 19');
  eq(rarityBase(8),   10, 'gap 8 (boundary)');
  eq(rarityBase(7),    0, 'gap 7');
  eq(rarityBase(0),    0, 'debut');
});

group('versionScore = round(base * v)', () => {
  eq(versionScore(perf()),                         30, 'neutral base, nothing special');
  eq(versionScore(perf({ jam: true })),            39, 'jamchart: v = 1.3');
  eq(versionScore(perf({ len: 900 })),             33, '15 min: v = 1.1');
  eq(versionScore(perf({ len: 1200 })),            36, '20 min: v = 1.2');
  eq(versionScore(perf({ jam: true, len: 900 })),  42, 'jamchart + 15 min: v = 1.4');
  eq(versionScore(perf({ jam: true, len: 1200 })), 45, 'jamchart + 20 min: v = 1.5');
  eq(versionScore(perf({ len: 899 })),             30, 'just under 15 min');
  eq(versionScore(perf({ crowd_rating: 60 })),     60, 'explicit crowd_rating overrides neutral');
});

group('placement', () => {
  // Slot 0 wants [opener]; slot 2 wants [closer, jam]; slot 5 wants [ballad].
  eq(slotFit('opener', 0),        'great',   'all wanted tags present');
  eq(placementMult('opener', 0),  1.15,      '→ 1.15');
  eq(slotFit('closer|jam', 2),    'great',   'both tags for a two-tag slot');
  eq(slotFit('closer', 2),        'ok',      'one of two tags');
  eq(placementMult('closer', 2),  1.08,      '→ 1.08');
  eq(slotFit('', 0),              'neutral', 'untagged song');
  eq(placementMult('', 0),        0.92,      '→ 0.92');
  eq(slotFit('opener', 1),        'neutral', 'slot 1 wants nothing — always neutral');
  eq(slotFit('ballad', 1),        'neutral', 'even a ballad is neutral in slot 1');

  // Hard clashes.
  for (const i of [2, 3, 4, 6]) eq(slotFit('ballad', i), 'bad', `ballad in energy slot ${i}`);
  eq(placementMult('ballad', 4),  0.65,      '→ 0.65');
  eq(slotFit('jam', 5),           'bad',     'jam in the breather');
  eq(slotFit('peak', 5),          'bad',     'peak in the breather');
  eq(placementMult('peak', 5),    0.65,      '→ 0.65');
  eq(slotFit('ballad', 5),        'great',   'ballad IS the breather');
  eq(slotFit('ballad', 0),        'neutral', 'ballad in an opener is only neutral, not a clash');
  eq(slotFit('ballad|closer', 2), 'ok',      'a matching tag outranks the ballad clash');
});

group('scorePerf = placed + rarity', () => {
  // placed = round(versionScore * placementMult * SCALE)
  eq(scorePerf(perf({ tags: 'opener' }), 0).placed, 45, 'round(30 * 1.15 * 1.3)');
  eq(scorePerf(perf({ tags: 'closer' }), 2).placed, 42, 'round(30 * 1.08 * 1.3)');
  eq(scorePerf(perf(), 0).placed,                   36, 'round(30 * 0.92 * 1.3)');
  eq(scorePerf(perf({ tags: 'ballad' }), 4).placed, 25, 'round(30 * 0.65 * 1.3)');

  // rarity = round(rarityBase(gap) * (base/30) * SCALE)
  eq(scorePerf(perf({ gap: 120 }), 1).rarity, 65, 'round(50 * 1 * 1.3)');
  eq(scorePerf(perf({ gap: 60 }),  1).rarity, 46, 'round(35 * 1 * 1.3)');
  eq(scorePerf(perf({ gap: 25 }),  1).rarity, 26, 'round(20 * 1 * 1.3)');
  eq(scorePerf(perf({ gap: 10 }),  1).rarity, 13, 'round(10 * 1 * 1.3)');
  eq(scorePerf(perf({ gap: 3 }),   1).rarity,  0, 'gap under 8 scores no rarity');
  eq(scorePerf(perf({ gap: 120, crowd_rating: 60 }), 1).rarity, 130, 'rarity scales with base');

  const s = scorePerf(perf({ tags: 'opener', jam: true, len: 1200, gap: 120 }), 0);
  eq(s.versionScore, 45,        'vs = round(30 * 1.5)');
  eq(s.placed,       67,        'placed = round(45 * 1.15 * 1.3)');
  eq(s.rarity,       65,        'rarity = round(50 * 1 * 1.3)');
  eq(s.subtotal,     132,       'subtotal = placed + rarity');
});

group('segue bonus = round(SEGUE_COEF * (vsA + vsB) * SCALE)', () => {
  eq(segueBonus(perf(), perf()),                      20, 'round(.25 * 60 * 1.3)');
  eq(segueBonus(perf({ jam: true }), perf()),         22, 'round(.25 * 69 * 1.3)');
  eq(segueBonus(perf({ jam: true, len: 1200 }),
                perf({ jam: true, len: 1200 })),      29, 'round(.25 * 90 * 1.3)');
});

group('full setlist', () => {
  const empty = new Set();

  // Eight neutral, untagged songs in a slot order where every one is neutral.
  const plain = Array.from({ length: 8 }, (_, i) => perf({ song_id: `s${i}` }));
  const r1 = scoreSetlist(plain, empty);
  eq(r1.completion, 30,          'all eight filled → completion bonus');
  eq(r1.total, 36 * 8 + 30,      '8 × 36 + 30');

  // Seven filled — no completion bonus.
  const partial = plain.slice(0, 7).concat([null]);
  const r2 = scoreSetlist(partial, empty);
  eq(r2.completion, 0,           'seven filled → no completion bonus');
  eq(r2.total, 36 * 7,           'partial total');

  // A canonical segue between slots 0 and 1.
  const segues = new Set(['s0|s1']);
  const r3 = scoreSetlist(plain, segues);
  eq(r3.segues.length, 1,        'one segue detected');
  eq(r3.segues[0], { from: 0, to: 1, points: 20 }, 'segue payload');
  eq(r3.total, r1.total + 20,    'segue adds its bonus');

  // Reversed order is a different pair — segues are directional.
  eq(scoreSetlist(plain, new Set(['s1|s0'])).segues.length, 0, 'segues are directional');

  // Perfect-fit run: the right archetype in every slot.
  const ideal = [
    perf({ song_id: 'a', tags: 'opener' }),
    perf({ song_id: 'b', tags: '' }),
    perf({ song_id: 'c', tags: 'closer|jam' }),
    perf({ song_id: 'd', tags: 'opener|jam' }),
    perf({ song_id: 'e', tags: 'peak' }),
    perf({ song_id: 'f', tags: 'ballad' }),
    perf({ song_id: 'g', tags: 'closer|peak' }),
    perf({ song_id: 'h', tags: 'encore' }),
  ];
  const r4 = scoreSetlist(ideal, empty);
  // Seven great (45) + slot 1 neutral (36) + completion.
  eq(r4.total, 45 * 7 + 36 + 30, 'ideal placement total');
  eq(r4.songs.map(s => s.placed), [45, 36, 45, 45, 45, 45, 45, 45], 'per-slot placed');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
