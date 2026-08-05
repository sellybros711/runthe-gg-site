/* Run The Setlist — QA harness for scoring v3.
 *
 *   node setlist/verify-scoring.mjs
 *
 * Asserts scoring.js against the v3 spec by hand-computed expected values.
 * If a scoring constant changes, this file should be the thing that fails first.
 * Run in CI by .github/workflows/setlist-checks.yml.
 */

import {
  COMPLETION_BONUS, NEUTRAL_BASE, NUM_ROUNDS, SLOTS,
  V_RECOMMENDED, V_JAMCHART, V_LEN_20MIN, V_LEN_15MIN,
  MULT_PERFECT, MULT_PARTIAL, MULT_NEUTRAL, MULT_CLASH,
  SEGUE_POINTS, ARC_MAX, ARC_PENALTY, VARIETY_MAX, VARIETY_MIN_ROLES,
  ENERGY, ENERGY_DEFAULT,
  baseOf, isJamchart, isRecommended, rarityMult, versionMult, versionParts,
  placementMult, slotFit, energyOf, scorePerf, hasSegue, scoreFlow, scoreSetlist,
} from './scoring.js';

let pass = 0, fail = 0;
function eq(actual, expected, label){
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { pass++; }
  else { fail++; console.log(`  FAIL  ${label}\n        expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
}
function close(actual, expected, label, tol = 1e-9){
  const ok = Math.abs(actual - expected) <= tol;
  if (ok) { pass++; }
  else { fail++; console.log(`  FAIL  ${label}\n        expected ${expected}, got ${actual}`); }
}
function group(name, fn){ console.log(`\n${name}`); fn(); }

/** A performance row, as the CSV would give it (all strings). */
const perf = (o = {}) => ({
  song_id: o.song_id || 'x', song: o.song || 'Song',
  tags: o.tags || '',
  crowd_rating: o.crowd === undefined ? '' : String(o.crowd),
  is_jamchart: o.jam ? 'true' : 'false',
  is_recommended: o.rec ? 'true' : 'false',
  jamchart_note: o.note || '',
  length_sec: String(o.len || 0), show_gap: String(o.gap || 0),
  is_cover: 'false', original_artist: '', set: '1', position: '1',
});

group('constants', () => {
  eq(COMPLETION_BONUS, 40, 'completion bonus');
  eq(NEUTRAL_BASE, 30, 'neutral base');
  eq(NUM_ROUNDS, 8, 'rounds');
  eq(SLOTS.length, 8, 'slot count');
  eq(SEGUE_POINTS, 45, 'segue points');
  eq(SLOTS.map(s => s.tags.join('|')),
     ['opener', '', 'closer|jam', 'opener|jam', 'peak', 'ballad', 'closer|peak', 'encore'],
     'slot preferred tags');
  eq(SLOTS.map(s => s.want), [3, 3, 4, 4, 5, 1, 5, 3], 'slot wanted energy');
  eq(SLOTS.map(s => s.set), ['1', '1', '1', '2', '2', '2', '2', 'E'], 'slot sets');
});

group('baseOf — song esteem, neutral when blank', () => {
  eq(baseOf(perf()), 30, 'blank crowd_rating falls back to neutral');
  eq(baseOf(perf({ crowd: 75 })), 75, 'top-of-jamchart song');
  eq(baseOf(perf({ crowd: 36 })), 36, 'lightly charted song');
  eq(baseOf({ crowd_rating: null }), 30, 'null is neutral');
  eq(baseOf({}), 30, 'missing column is neutral');
});

group('version flags', () => {
  eq(isJamchart(perf({ jam: 1 })), true, 'jamchart true');
  eq(isJamchart(perf()), false, 'jamchart false');
  eq(isRecommended(perf({ rec: 1 })), true, 'recommended true');
  eq(isRecommended(perf()), false, 'recommended false');
  eq(isJamchart({ is_jamchart: '1' }), true, 'numeric string 1 counts');
});

group('rarityMult(gap) tiers', () => {
  eq(rarityMult(200), 0.40, 'gap 200');
  eq(rarityMult(100), 0.40, 'gap 100 (boundary)');
  eq(rarityMult(99), 0.25, 'gap 99');
  eq(rarityMult(50), 0.25, 'gap 50 (boundary)');
  eq(rarityMult(20), 0.15, 'gap 20 (boundary)');
  eq(rarityMult(8), 0.07, 'gap 8 (boundary)');
  eq(rarityMult(7), 0, 'gap 7 — below the first tier');
  eq(rarityMult(0), 0, 'debut');
});

group('versionMult — additive reasons', () => {
  close(versionMult(perf()), 1, 'plain version is 1x');
  close(versionMult(perf({ jam: 1 })), 1 + V_JAMCHART, 'jamchart');
  close(versionMult(perf({ rec: 1 })), 1 + V_RECOMMENDED, 'recommended');
  close(versionMult(perf({ rec: 1, jam: 1 })), 1 + V_RECOMMENDED,
    'recommended supersedes jamchart rather than stacking');
  close(versionMult(perf({ len: 900 })), 1 + V_LEN_15MIN, '15 min');
  close(versionMult(perf({ len: 1200 })), 1 + V_LEN_20MIN, '20 min');
  close(versionMult(perf({ len: 1199 })), 1 + V_LEN_15MIN, 'just under 20 min');
  close(versionMult(perf({ len: 899 })), 1, 'just under 15 min');
  close(versionMult(perf({ rec: 1, len: 1200, gap: 100 })),
    1 + V_RECOMMENDED + V_LEN_20MIN + 0.40, 'everything at once');

  const p = versionParts(perf({ rec: 1, len: 1200, gap: 60 }));
  eq(p.reasons.map(r => r.label), ['Recommended version', '20+ minutes', '60-show gap'],
     'reasons are listed for the breakdown');
});

group('slotFit', () => {
  eq(slotFit('opener', 0), 'great', 'opener into Set I opener');
  eq(slotFit('closer|jam', 2), 'great', 'both wanted tags');
  eq(slotFit('closer', 2), 'ok', 'one of two wanted tags');
  eq(slotFit('', 1), 'neutral', 'Mid wants nothing');
  eq(slotFit('ballad', 1), 'neutral', 'ballad in Mid is not a clash');
  eq(slotFit('ballad', 4), 'bad', 'ballad in the Peak slot');
  eq(slotFit('jam', 5), 'bad', 'jam in the Breather');
  eq(slotFit('peak', 5), 'bad', 'peak in the Breather');
  eq(slotFit('ballad', 5), 'great', 'ballad in the Breather');
  eq(slotFit('encore', 7), 'great', 'encore in the Encore');
  eq(slotFit('opener', 4), 'neutral', 'unrelated tag is neutral, not bad');
});

group('placementMult', () => {
  eq(placementMult('opener', 0), MULT_PERFECT, 'great');
  eq(placementMult('closer', 2), MULT_PARTIAL, 'ok');
  eq(placementMult('', 1), MULT_NEUTRAL, 'neutral');
  eq(placementMult('ballad', 4), MULT_CLASH, 'clash');
  eq(MULT_PERFECT > MULT_PARTIAL, true, 'perfect beats partial');
  eq(MULT_PARTIAL > MULT_NEUTRAL, true, 'partial beats neutral');
  eq(MULT_NEUTRAL > MULT_CLASH, true, 'neutral beats clash');
});

group('energyOf', () => {
  eq(energyOf(perf({ tags: 'ballad' })), ENERGY.ballad, 'ballad is quietest');
  eq(energyOf(perf({ tags: 'peak' })), ENERGY.peak, 'peak is loudest');
  eq(energyOf(perf({ tags: '' })), ENERGY_DEFAULT, 'untagged is middling');
  eq(energyOf(perf({ tags: 'ballad|peak' })), ENERGY.peak, 'loudest tag wins');
});

group('scorePerf = base x version x placement', () => {
  eq(scorePerf(perf({ crowd: 30 }), 1).subtotal, Math.round(30 * 1 * MULT_NEUTRAL),
     'plain song in a neutral slot');
  eq(scorePerf(perf({ crowd: 60, tags: 'opener' }), 0).subtotal,
     Math.round(60 * 1 * MULT_PERFECT), 'beloved song, perfect slot');
  eq(scorePerf(perf({ crowd: 60, tags: 'opener', rec: 1, len: 1200 }), 0).subtotal,
     Math.round(60 * (1 + V_RECOMMENDED + V_LEN_20MIN) * MULT_PERFECT),
     'beloved song, legendary version, perfect slot');
  eq(scorePerf(perf({ crowd: 60, tags: 'ballad' }), 4).subtotal,
     Math.round(60 * 1 * MULT_CLASH), 'beloved song in the wrong slot is punished');

  const s = scorePerf(perf({ crowd: 50, tags: 'opener', jam: 1 }), 0);
  eq(s.base, 50, 'breakdown exposes base');
  eq(s.fit, 'great', 'breakdown exposes fit');
  eq(s.versionReasons.length, 1, 'breakdown exposes version reasons');

  // A great song badly placed should lose to an ordinary song well placed.
  const bad = scorePerf(perf({ crowd: 75, tags: 'ballad' }), 4).subtotal;
  const good = scorePerf(perf({ crowd: 40, tags: 'peak' }), 4).subtotal;
  eq(good > bad, true, 'placement can outweigh song esteem');
});

group('segues — within a set only', () => {
  const a = perf({ song_id: 'a' }), b = perf({ song_id: 'b' });
  const segues = new Set(['a|b']);
  const slots = new Array(8).fill(null);

  slots[0] = a; slots[1] = b;
  eq(hasSegue(slots, 0, segues), true, 'slots 0->1, both Set I');
  slots[0] = null; slots[1] = null;

  slots[2] = a; slots[3] = b;
  eq(hasSegue(slots, 2, segues), false, 'slots 2->3 straddle the set break');
  slots[2] = null; slots[3] = null;

  slots[6] = a; slots[7] = b;
  eq(hasSegue(slots, 6, segues), false, 'slots 6->7 straddle into the encore');
  slots[6] = null; slots[7] = null;

  slots[3] = a; slots[4] = b;
  eq(hasSegue(slots, 3, segues), true, 'slots 3->4, both Set II');
  slots[3] = null; slots[4] = null;

  slots[0] = b; slots[1] = a;
  eq(hasSegue(slots, 0, segues), false, 'segues are directional');
});

group('scoreFlow', () => {
  const mk = tags => perf({ tags });
  // A setlist that matches every slot's wanted energy exactly.
  const ideal = [mk('opener'), mk('opener'), mk('jam'), mk('jam'), mk('peak'),
                 mk('ballad'), mk('peak'), mk('opener')];
  const f = scoreFlow(ideal, new Set());
  eq(f.arc, ARC_MAX, 'perfect arc pays ARC_MAX');
  eq(f.variety, VARIETY_MAX, '5 distinct roles clears the variety bar');

  // Every slot filled with the same wrong-energy song.
  const flat = new Array(8).fill(mk('ballad'));
  const g = scoreFlow(flat, new Set());
  const dev = SLOTS.reduce((a, s) => a + Math.abs(ENERGY.ballad - s.want), 0);
  eq(g.arc, Math.max(0, ARC_MAX - dev * ARC_PENALTY), 'flat setlist loses arc points');
  eq(g.variety, Math.round(VARIETY_MAX * (1 / VARIETY_MIN_ROLES)), 'one role scores low variety');

  eq(scoreFlow(new Array(8).fill(null), new Set()).total, 0, 'empty setlist has no flow');

  const half = new Array(8).fill(null);
  half[0] = mk('opener');
  eq(scoreFlow(half, new Set()).arc <= ARC_MAX / 4, true,
     'a nearly-empty setlist cannot farm arc points');
});

group('scoreSetlist', () => {
  const mk = (id, tags) => perf({ song_id: id, tags, crowd: 30 });
  const slots = [mk('a', 'opener'), mk('b', ''), mk('c', 'closer|jam'),
                 mk('d', 'opener|jam'), mk('e', 'peak'), mk('f', 'ballad'),
                 mk('g', 'closer|peak'), mk('h', 'encore')];
  const r = scoreSetlist(slots, new Set());

  eq(r.completion, COMPLETION_BONUS, 'full setlist pays the completion bonus');
  eq(r.songs.length, 8, 'one breakdown per slot');
  eq(r.songTotal, r.songs.reduce((a, s) => a + s.subtotal, 0), 'songTotal is the sum of subtotals');
  eq(r.total, r.songTotal + r.flow.total + r.completion, 'total is songs + flow + completion');
  eq(r.songs.every(s => s.fit === 'great' || s.fit === 'neutral'), true,
     'every song sits in a slot that wants it');

  const partial = [...slots]; partial[7] = null;
  eq(scoreSetlist(partial, new Set()).completion, 0, 'incomplete setlist gets no bonus');
  eq(scoreSetlist(new Array(8).fill(null), new Set()).total, 0, 'empty setlist scores 0');

  // Segue inside Set II should pay, and show up in the flow breakdown.
  const seg = [...slots];
  const withSeg = scoreSetlist(seg, new Set([`${seg[3].song_id}|${seg[4].song_id}`]));
  eq(withSeg.flow.segues.length, 1, 'one segue found');
  eq(withSeg.total - r.total, SEGUE_POINTS, 'a segue is worth SEGUE_POINTS');
});

group('the model behaves sensibly end to end', () => {
  const mk = (id, tags, o = {}) => perf({ song_id: id, tags, ...o });
  const base = [mk('a', 'opener'), mk('b', ''), mk('c', 'closer|jam'),
                mk('d', 'opener|jam'), mk('e', 'peak'), mk('f', 'ballad'),
                mk('g', 'closer|peak'), mk('h', 'encore')];

  const plain = scoreSetlist(base, new Set()).total;

  const loved = base.map((p, i) => i === 4 ? mk('e', 'peak', { crowd: 75 }) : p);
  eq(scoreSetlist(loved, new Set()).total > plain, true, 'a treasured song scores more');

  const legend = base.map((p, i) => i === 4 ? mk('e', 'peak', { rec: 1, len: 1500 }) : p);
  eq(scoreSetlist(legend, new Set()).total > plain, true, 'a legendary version scores more');

  const misplaced = [...base];
  [misplaced[4], misplaced[5]] = [misplaced[5], misplaced[4]];
  eq(scoreSetlist(misplaced, new Set()).total < plain, true,
     'swapping the peak and the breather scores less');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
