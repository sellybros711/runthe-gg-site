/* Segue — QA harness for scoring v4.
 *
 *   node setlist/verify-scoring.mjs
 *
 * Asserts scoring.js against the v4 spec by hand-computed expected values.
 * If a scoring constant changes, this file should be the thing that fails first.
 */

import {
  SETS, ENCORE_INDEX, MAX_ROUNDS, NEUTRAL_BASE,
  V_RECOMMENDED, V_JAMCHART, V_LEN_20MIN, V_LEN_15MIN,
  MULT_PERFECT, MULT_PARTIAL, MULT_NEUTRAL, MULT_CLASH,
  SEGUE_POINTS, SEGUE_EXACT_BONUS, SEGUE_CHAIN_BONUS, SANDWICH_BONUS,
  SUITE_BONUS, SUITE_FULL_BONUS,
  MIN_LANDING_SECONDS, wouldStrand, danglingSegue, closesSandwich,
  ARC_MAX, ARC_ZERO_AT, BREADTH, BREADTH_MAX, BREADTH_BUSTOUT_GAP, BREADTH_BIG_JAM,
  ROLE_KINDS, BREADTH_ROLES, rolesMissing,
  MONO_KINDS, MONO_AT, MONO_MULTS, monotonyRun, monotonyDepth, monotonyMult,
  familiarityMult, segueDecay, segueKey, gradeScore, gradeRunning, GRADE_WARM, GRADE_HOT,
  cooldowns, isBigMoment, COOLDOWN_BONUS, COOLDOWN_BREATHER_ENERGY, COOLDOWN_LENGTH_RATIO,
  GAP_RARE, GAP_BUSTOUT, GAP_UNICORN, gapPhrase, TEASE_SECONDS, RX,
  bestPossible, respinLine, RESPIN_LINES, LEN_15MIN,
  SEGUE_FAMILIAR_FLOOR, SEGUE_DECAY_FREE, SEGUE_DECAY_FLOOR,
  TIME_POINTS_PER_SET, SHORT_SET_RATIO, ENERGY, RESPIN_COSTS, respinCost, canRespin,
  baseOf, isJamchart, isRecommended, rarityMult, versionMult, versionParts,
  roleAt, roleFit, placementMult, energyOf, scorePerf, fmtClock,
  budgets, remaining, canPlace, setFull, scoreShow, setNote, HEADLINES,
  theOneThatGotAway, reactionFor, eventLine, setOpenLine,
} from './scoring.js';

let pass = 0, fail = 0;
function eq(a, b, label){
  if (JSON.stringify(a) === JSON.stringify(b)) pass++;
  else { fail++; console.log(`  FAIL  ${label}\n        expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }
}
function close(a, b, label, tol = 1e-9){
  if (Math.abs(a - b) <= tol) pass++;
  else { fail++; console.log(`  FAIL  ${label}\n        expected ${b}, got ${a}`); }
}
function group(n, fn){ console.log(`\n${n}`); fn(); }

const perf = (o = {}) => ({
  song_id: o.song_id || 'x', song: o.song || 'Song',
  tags: o.tags || '',
  crowd_rating: o.crowd === undefined ? '' : String(o.crowd),
  is_jamchart: o.jam ? 'true' : 'false',
  is_recommended: o.rec ? 'true' : 'false',
  jamchart_note: '',
  length_sec: String(o.len === undefined ? 600 : o.len),
  show_gap: String(o.gap || 0),
  is_cover: o.is_cover || 'false', original_artist: o.original_artist || '',
  set: '1', position: '1',
});

group('the show', () => {
  eq(SETS.map(s => s.label), ['Set I', 'Set II', 'Encore'], 'three sets');
  eq(SETS.map(s => s.seconds), [4500, 4200, 600], 'budgets are 75 / 70 / 10 minutes');
  eq(SETS.map(s => s.maxSongs), [8, 8, 3], 'song caps');
  eq(ENCORE_INDEX, 2, 'encore index');
  eq(MAX_ROUNDS, 19, 'hard round cap is the sum of the song caps');
  eq(NEUTRAL_BASE, 30, 'neutral base');
  eq(fmtClock(600), '10:00', 'clock formatting');
  eq(fmtClock(75), '1:15', 'clock formatting, seconds padded');
});

group('budgets: time cascades into the next set', () => {
  const OPEN = [false, false, false];
  eq(budgets([[], [], []], OPEN), [4500, 4200, 600],
     'mid-game with both sets still open, nobody has inherited anything');

  /* THE CHANGE THIS GROUP EXISTS FOR. Time used to jump the middle: both sets
     paid straight into the encore, so 25 minutes banked in Set I could only be
     spent on a ten-minute slot at the end of the night. It carries one step
     now, which is what makes running short early a real decision. */
  const short1 = [[perf({ len: 3000 })], [], []];
  eq(budgets(short1, [true, false, false])[1], 4200 + 1500,
     'Set I closes 25 minutes short and SET II gets them');
  eq(budgets(short1, [true, false, false])[2], 600,
     'and the encore gets nothing yet, because Set II may spend them');
  eq(budgets(short1, OPEN)[1], 4200, 'while Set I is still open it has left nothing behind');

  const full1 = [[perf({ len: 4500 })], [], []];
  eq(budgets(full1, [true, false, false])[1], 4200, 'a set used in full leaves nothing behind');

  // Set I banks 25 min, Set II uses 50 of its 70+25, so 45 reach the encore.
  const both = [[perf({ len: 3000 })], [perf({ len: 3000 })], []];
  eq(budgets(both, [true, true, false])[2], 600 + 1200 + 1500,
     'what Set II does not use, inherited time included, reaches the encore');
  eq(budgets(both, [true, false, false])[2], 600,
     'an open Set II stops the chain: the encore cannot know its share yet');
  eq(budgets(both)[0], 4500, 'Set I own budget is never changed by the maths');
  eq(budgets(both)[2], 600 + 1200 + 1500,
     'with no closed argument every set counts, which is how a finished show scores');

  /* Set II spending what Set I banked is the whole point, so it is checked
     directly: 65 minutes does not fit 70 alone once 10 are already played, and
     does fit when Set I handed 25 over. */
  const spend = [[perf({ len: 3000 })], [perf({ len: 600 })], []];
  eq(budgets(spend, [true, false, false])[1] - 600, 4200 + 1500 - 600,
     'Set II can actually spend what Set I left');
});

group('remaining / canPlace / setFull', () => {
  const sets = [[perf({ len: 1200 })], [], []];
  eq(remaining(sets, 0), 4500 - 1200, 'remaining subtracts what is played');
  eq(canPlace(sets, 0, perf({ len: 3300 })), true, 'a song that exactly fills the set fits');
  eq(canPlace(sets, 0, perf({ len: 3301 })), false, 'one second too long does not fit');
  eq(canPlace(sets, 0, perf({ len: 0 })), false, 'an untimed song can never be placed');

  const packed = [Array.from({ length: 8 }, () => perf({ len: 60 })), [], []];
  eq(setFull(packed, 0), true, 'eight songs fills a set on count alone');
  eq(canPlace(packed, 0, perf({ len: 60 })), false, 'a full set takes nothing more, however short');
});

group('roleAt — position decides the role', () => {
  eq(roleAt(0, 0, 5).name, 'Opener', 'first song of Set I');
  eq(roleAt(0, 4, 5).name, 'Closer', 'last song of Set I');
  eq(roleAt(0, 4, 5).tags, ['closer', 'jam'], 'Set I closer wants a jam');
  eq(roleAt(1, 4, 5).tags, ['closer', 'peak'], 'Set II closer wants a peak');
  eq(roleAt(1, 3, 6).name, 'Peak', 'Set II back half is peak territory');
  eq(roleAt(0, 3, 6).name, 'Mid', 'Set I back half is not');
  eq(roleAt(2, 0, 1).name, 'Encore', 'the encore is always the encore');
  eq(roleAt(0, 0, 1).name, 'Opener', 'a one-song set is an opener, not a closer');
});

group('roleFit', () => {
  eq(roleFit('opener', roleAt(0, 0, 4)), 'great', 'opener opening');
  eq(roleFit('closer|jam', roleAt(0, 3, 4)), 'great', 'both wanted tags');
  eq(roleFit('closer', roleAt(0, 3, 4)), 'ok', 'one of two');
  eq(roleFit('', roleAt(0, 1, 4)), 'neutral', 'mid-set wants nothing in particular');
  eq(roleFit('ballad', roleAt(0, 1, 4)), 'ok', 'a ballad mid-set is the breather');
  eq(roleFit('ballad', roleAt(1, 4, 5)), 'bad', 'a ballad closing Set II is a clash');
  eq(roleFit('encore', roleAt(2, 0, 1)), 'great', 'encore in the encore');
});

group('versionMult', () => {
  close(versionMult(perf()), 1, 'plain');
  close(versionMult(perf({ jam: 1 })), 1 + V_JAMCHART, 'jamchart');
  close(versionMult(perf({ rec: 1 })), 1 + V_RECOMMENDED, 'recommended');
  close(versionMult(perf({ rec: 1, jam: 1 })), 1 + V_RECOMMENDED, 'recommended supersedes');
  close(versionMult(perf({ len: 900 })), 1 + V_LEN_15MIN, '15 min');
  close(versionMult(perf({ len: 1200 })), 1 + V_LEN_20MIN, '20 min');
  close(versionMult(perf({ gap: 100 })), 1.40, 'a 100-show gap');
  eq(versionParts(perf({ rec: 1, len: 1200 })).reasons.map(r => r.label),
     ['Recommended version', '20+ minutes'], 'reasons listed for the breakdown');
});

group('rarityMult tiers', () => {
  eq(rarityMult(200), 0.40, '200'); eq(rarityMult(100), 0.40, '100');
  eq(rarityMult(99), 0.25, '99');   eq(rarityMult(50), 0.25, '50');
  eq(rarityMult(20), 0.15, '20');   eq(rarityMult(8), 0.07, '8');
  eq(rarityMult(7), 0, '7 is below the first tier');
});

group('scorePerf', () => {
  const opener = roleAt(0, 0, 4);
  eq(scorePerf(perf({ crowd: 60, tags: 'opener' }), opener).subtotal,
     Math.round(60 * 1 * MULT_PERFECT), 'loved song, right role');
  eq(scorePerf(perf({ crowd: 60, tags: 'ballad' }), roleAt(1, 4, 5)).subtotal,
     Math.round(60 * 1 * MULT_CLASH), 'loved song, wrong role');
  const s = scorePerf(perf({ crowd: 50, tags: 'opener', rec: 1 }), opener);
  eq(s.role, 'Opener', 'breakdown carries the role');
  eq(s.versionReasons.length, 1, 'breakdown carries the reasons');
});

group('time scoring', () => {
  const full = [[perf({ len: 4500 })], [perf({ len: 4200 })], [perf({ len: 600 })]];
  const r = scoreShow(full, new Set());
  eq(r.time.map(t => t.points), [65, 65, 65], 'every set filled pays full time points');
  eq(r.timeTotal, 3 * TIME_POINTS_PER_SET, 'time total');

  const half = [[perf({ len: 2250 })], [], []];
  const h = scoreShow(half, new Set());
  eq(h.time[0].points, Math.round(TIME_POINTS_PER_SET / 2), 'half a set pays half its time points');
  eq(h.time[1].points, 0, 'an unplayed set pays nothing');

  eq(scoreShow([[], [], []], new Set()).timeTotal, 0, 'an empty night scores no time');
  eq(setNote(1, 1), 'Filled to the curfew.', 'set note at the top');
  eq(setNote(0.7, 1), 'Cut short. The crowd noticed.', 'set note when short');
  eq(setNote(0.3, 1), 'Barely a set.', 'set note when barely played');
  eq(setNote(0.9, 0), 'Never happened.', 'an empty set says so regardless of ratio');
});

group('a set never ends mid-segue', () => {
  const seg = o => perf({ ...o });
  const segOut = (id, len) => ({ ...perf({ song_id: id, len }), is_segue: 'true' });

  // Placing a segue song with plenty of room is fine.
  eq(wouldStrand([[], [], []], 0, segOut('a', 600), [false,false,false], [0,0,0]), false,
     'a segue song early in an empty set has room to land');

  // ...but not when it would fill the set on count.
  const nearlyFullCount = [Array.from({length: 7}, () => perf({ len: 60 })), [], []];
  eq(wouldStrand(nearlyFullCount, 0, segOut('a', 60), [false,false,false], [0,0,0]), true,
     'a segue song taking the last slot has nothing to land in');

  // ...nor when it would leave less than a landing's worth of time.
  const nearlyFullTime = [[perf({ len: 4500 - 700 })], [], []];
  eq(wouldStrand(nearlyFullTime, 0, segOut('a', 600), [false,false,false], [0,0,0]), true,
     'a segue song leaving under MIN_LANDING_SECONDS is refused');
  eq(MIN_LANDING_SECONDS, 180, 'three minutes counts as room to land');

  // A non-segue song is never stranded.
  eq(wouldStrand(nearlyFullCount, 0, perf({ len: 60 }), [false,false,false], [0,0,0]), false,
     'an ordinary song can close a set');

  eq(danglingSegue([[perf({ len: 600 })], [], []], 0), null, 'a normal set is not dangling');
  eq(danglingSegue([[segOut('a', 600)], [], []], 0).song_id, 'a', 'a set ending on a segue is');
  eq(danglingSegue([[], [], []], 0), null, 'an empty set is not dangling');
});

group('only a take that segued can start one', () => {
  const seg = (id) => ({ ...perf({ song_id: id, len: 600 }), is_segue: 'true' });
  const cleanTake = (id) => ({ ...perf({ song_id: id, len: 600 }), is_segue: 'false' });
  const pair = new Set(['a|b']);

  eq(scoreShow([[seg('a'), cleanTake('b')], [], []], pair).segues.length, 1,
     'a take that segued starts one');
  eq(scoreShow([[cleanTake('a'), cleanTake('b')], [], []], pair).segues.length, 0,
     'a clean take of the same song does NOT — this is what made the arrow a lie');
});

group('graded segues', () => {
  const mk = (id, o={}) => ({ ...perf({ song_id: id, len: 600, ...o }), is_segue: 'true' });
  const A = mk('a'), B = mk('b'), C = mk('c');
  const pair = new Set(['a|b', 'b|c', 'c|a', 'b|a']);

  const plain = scoreShow([[A, B], [], []], pair);
  eq(plain.segues[0].points, SEGUE_POINTS, 'a canonical pair pays the base');

  // The exact transition that take played is worth more.
  const exact = { ...A, segued_into_id: 'b' };
  eq(scoreShow([[exact, B], [], []], pair).segues[0].points,
     SEGUE_POINTS + SEGUE_EXACT_BONUS, 'rebuilding the exact pair pays more');

  // Three in a row: the third link is a run.
  const run = scoreShow([[A, B, C], [], []], pair);
  eq(run.segues.length, 2, 'two links across three songs');
  eq(run.segues[1].points, SEGUE_POINTS, 'the second link is not yet a chain');
  const four = scoreShow([[A, B, C, mk('d')], [], []], new Set([...pair, 'c|d']));
  eq(four.segues[2].kinds.includes('chain'), true, 'the third link is a chain');
  // ...and the third link of the night is also the first to be decayed, so the
  // chain bonus arrives already scaled. Both mechanics, one number.
  eq(four.segues[2].points,
     Math.round((SEGUE_POINTS + SEGUE_CHAIN_BONUS) * segueDecay(3)),
     'the third link pays the chain bonus, decayed');

  // A > B > A closes a sandwich.
  const sand = scoreShow([[A, B, mk('a')], [], []], pair);
  const closing = sand.segues[sand.segues.length - 1];
  eq(closing.kinds.includes('sandwich'), true, 'coming back closes a sandwich');
  eq(closing.points >= SANDWICH_BONUS, true, 'and it pays for it');

  eq(closesSandwich([A, B], mk('a'), pair), true, 'closesSandwich sees the return');
  eq(closesSandwich([A, B], C, pair), false, 'a new song is not a sandwich');
  eq(closesSandwich([A], mk('a'), pair), false, 'A straight back into A is not a sandwich');
});

group('familiarity brakes a routine pair', () => {
  const mk = id => ({ ...perf({ song_id: id, len: 600 }), is_segue: 'true' });
  const A = mk('a'), B = mk('b');
  const pair = new Set(['a|b']);

  eq(familiarityMult(1), 1, 'a pair played once pays in full');
  eq(familiarityMult(4) < familiarityMult(2), true, 'more familiar pays less');
  eq(familiarityMult(2) < familiarityMult(1), true, 'and it starts biting immediately');
  eq(familiarityMult(10_000) >= SEGUE_FAMILIAR_FLOOR, true, 'never falls through the floor');
  eq(familiarityMult(0), 1, 'an unknown count is treated as a first-time pair');

  const rare = scoreShow([[A, B], [], []], pair, undefined, new Map([['a|b', 1]]));
  const routine = scoreShow([[A, B], [], []], pair, undefined, new Map([['a|b', 56]]));
  eq(rare.segues[0].points > routine.segues[0].points, true,
     'Seekers pt I > pt II must not pay like a pair they played once');
  eq(routine.segues[0].kinds.includes('routine'), true, 'and it says so');
  eq(rare.segues[0].points, SEGUE_POINTS, 'a once-ever pair is unscaled');
  eq(scoreShow([[A, B], [], []], pair).segues[0].points, SEGUE_POINTS,
     'no counts at all behaves like a once-ever pair');
});

group('segue decay stops the farm', () => {
  eq(segueDecay(1), 1, 'the first link is whole');
  eq(segueDecay(SEGUE_DECAY_FREE), 1, 'so is the last free one');
  eq(segueDecay(SEGUE_DECAY_FREE + 1) < 1, true, 'the next one is not');
  eq(segueDecay(99) >= SEGUE_DECAY_FLOOR, true, 'decay has a floor');
  let prev = 1;
  for (let n = 1; n <= 12; n++) { const d = segueDecay(n); eq(d <= prev, true,
    `link ${n} is worth no more than link ${n - 1}`); prev = d; }

  // Eight links must not pay eight times one link.
  const chain = [], keys = new Set();
  for (let i = 0; i < 9; i++) chain.push({ ...perf({ song_id: `s${i}`, len: 300 }), is_segue: 'true' });
  for (let i = 0; i < 8; i++) keys.add(`s${i}|s${i + 1}`);
  const farmed = scoreShow([chain, [], []], keys);
  const one = scoreShow([[chain[0], chain[1]], [], []], keys);
  eq(farmed.segues.length, 8, 'all eight links are found');
  eq(farmed.segues.reduce((a, x) => a + x.points, 0) < one.segues[0].points * 8, true,
     'but they pay less than eight of the first');
});

group('breadth replaces a category nobody could fail', () => {
  const base = (o = {}) => perf({ song_id: 'x', len: 600, ...o });
  const has = (id, songs) => {
    const r = scoreShow([songs, [], []], new Set());
    return r.breadth.find(c => c.id === id).got;
  };
  const miss = (id, songs) => {
    const r = scoreShow([songs, [], []], new Set());
    return r.breadth.find(c => c.id === id).missed;
  };
  eq(BREADTH_MAX, BREADTH.reduce((a, c) => a + c.points, 0), 'BREADTH_MAX is the sum of the cards');
  eq(BREADTH.length, 5, 'five cards');
  eq(has('cover', [base({ song_id: 'a' })]), false, 'no cover by default');
  eq(has('cover', [{ ...base(), is_cover: 'true' }]), true, 'a cover is seen');
  eq(has('bustout', [{ ...base(), show_gap: String(BREADTH_BUSTOUT_GAP) }]), true, 'a bustout is seen');
  eq(has('bustout', [{ ...base(), show_gap: String(BREADTH_BUSTOUT_GAP - 1) }]), false,
     'one show short of the gap is not');
  eq(has('jamchart', [{ ...base(), is_jamchart: 'true' }]), true, 'a jamchart take is seen');
  eq(has('bigjam', [base({ len: BREADTH_BIG_JAM })]), true, 'a 20-minute jam is seen');
  eq(has('bigjam', [base({ len: BREADTH_BIG_JAM - 1 })]), false, 'a second short of it is not');

  const empty = scoreShow([[], [], []], new Set());
  eq(empty.breadthTotal, 0, 'an empty night earns no breadth');
  eq(empty.breadth.every(c => !c.got), true, 'and claims no cards');

  // The point of the change: a night CAN miss these. The old variety score was
  // maxed by random play, greedy play and segue farming alike.
  const narrow = scoreShow([[base({ song_id: 'a', tags: 'jam' }), base({ song_id: 'b', tags: 'jam' })], [], []], new Set());
  eq(narrow.breadthTotal < BREADTH_MAX, true, 'a one-note night does not max breadth');

  // The roles card is all six kinds, not five of six. Five of six fires for
  // ~70% of shows however they are played, because the encore is nearly free.
  const kinds = ROLE_KINDS.map((t, i) => base({ song_id: `r${i}`, tags: t }));
  eq(BREADTH_ROLES, 6, 'six kinds of song');
  eq(has('roles', kinds), true, 'all six claims the card');
  ROLE_KINDS.forEach(drop => {
    eq(has('roles', kinds.filter(p => p.tags !== drop)), false, `dropping the ${drop} loses it`);
  });
  eq(BREADTH.find(c => c.id === 'roles').points, Math.max(...BREADTH.map(c => c.points)),
     'and it is the biggest card, because it is the hardest');

  // Missing it should name the gap. A player can act on "everything but a
  // ballad"; they cannot act on "the night only did one thing".
  eq(rolesMissing(kinds), [], 'nothing missing from a full spread');
  eq(rolesMissing(kinds.filter(p => p.tags !== 'ballad')), ['ballad'], 'one gap is named');
  eq(miss('roles', kinds.filter(p => p.tags !== 'ballad')), 'Everything except a ballad',
     'one gap reads as prose');
  eq(miss('roles', kinds.filter(p => !['peak', 'ballad'].includes(p.tags))),
     'Everything except a peak or ballad', 'two gaps are joined with an or');
  eq(miss('roles', kinds.filter(p => !['opener', 'peak', 'ballad'].includes(p.tags))),
     'Everything except an opener, peak or ballad', 'three gaps list out');
  eq(miss('roles', [base({ tags: 'jam' })]), 'Only 1 of the six kinds',
     'four or more gaps count up instead of listing');
});

group('monotony: three of the same thing, unconnected', () => {
  const jam = i => perf({ song_id: `j${i}`, song: `Jam ${i}`, tags: 'jam', len: 600 });
  const jams = n => Array.from({ length: n }, (_, i) => jam(i));
  const depth = (songs, i, seg) => monotonyDepth(songs, i, seg);

  eq(MONO_KINDS, ['jam', 'peak', 'ballad'], 'only the tags that say what a song IS');
  eq(MONO_KINDS.includes('opener') || MONO_KINDS.includes('encore'), false,
     'position tags describe the source show, not the song');
  eq(MONO_AT, 3, 'the third of a kind is where it starts');

  // Depth counts backwards through an unbroken run.
  const four = jams(4);
  eq([0, 1, 2, 3].map(i => depth(four, i, new Set())), [1, 2, 3, 4], 'a run counts up');
  eq([0, 1, 2, 3].map(i => monotonyMult(depth(four, i, new Set()))),
     [1, 1, MONO_MULTS[0], MONO_MULTS[1]], 'and the first two are free');
  eq(monotonyMult(9), MONO_MULTS[MONO_MULTS.length - 1], 'past the table it flattens out');

  // A different kind of song breaks it.
  const broken = [jam(0), jam(1), perf({ song_id: 'b', tags: 'ballad' }), jam(2), jam(3)];
  eq(broken.map((_, i) => depth(broken, i, new Set())), [1, 2, 1, 1, 2], 'a change of gear resets');
  // So does an untagged song, and 32% of the pool is untagged.
  const plain = [jam(0), jam(1), perf({ song_id: 'p' }), jam(2), jam(3)];
  eq(depth(plain, 4, new Set()), 2, 'an untagged song resets it too');
  eq(depth(plain, 2, new Set()), 1, 'and is never itself part of a run');

  // THE POINT OF THE RULE. The band's three-jam runs are segued together 62%
  // of the time against their own 46% baseline; a points-chasing player's sit
  // at 27% against a 25% baseline. A welded suite is the best thing in this
  // band, so a real segue resets the count.
  const suite = jams(4);
  const seg = new Set([segueKey(suite[0], suite[1]), segueKey(suite[1], suite[2])]);
  eq(suite.map((_, i) => depth(suite, i, seg)), [1, 1, 1, 2], 'a segue resets the run');
  eq(suite.every((_, i) => monotonyMult(depth(suite, i, seg)) === 1),
     true, 'so a segued jam suite is paid in full');
  eq(depth(jams(4), 3, new Set()), 4, 'while the same four unconnected are 4 deep');

  // The whole run must share ONE kind, so a chain of overlaps is not a run.
  const chain = [perf({ song_id: 'a', tags: 'jam' }), perf({ song_id: 'b', tags: 'jam|peak' }),
                 perf({ song_id: 'c', tags: 'peak' })];
  eq(depth(chain, 2, new Set()), 2, 'jam, jam+peak, peak is not three of a kind');
  eq(monotonyRun(chain, 2, new Set()).kind, 'peak', 'and the run it IS gets named');

  // It reaches the score, and it is a multiplier on the song rather than a
  // flat deduction, so stacking three BIG jams costs more than three small.
  const big = i => perf({ song_id: `B${i}`, tags: 'jam', len: 1200, crowd: 5 });
  const small = i => perf({ song_id: `s${i}`, tags: 'jam', len: 300, crowd: 1 });
  const cost = mk => {
    const r = scoreShow([[mk(0), mk(1), mk(2)], [], []], new Set());
    return r.monoLost;
  };
  eq(cost(big) > cost(small), true, 'stacking big songs costs more than stacking small ones');
  eq(scoreShow([[jam(0), jam(1)], [], []], new Set()).monoLost, 0, 'two in a row is free');

  const r = scoreShow([[jam(0), jam(1), jam(2), jam(3)], [], []], new Set());
  eq(r.monotony.length, 2, 'the third and fourth are both itemised');
  eq(r.monotony.map(m => m.depth), [3, 4], 'each knows how deep it sat');
  eq(r.monotony.every(m => m.kind === 'jam'), true, 'and which kind repeated');
  eq(r.monoLost, r.monotony.reduce((a, m) => a + m.lost, 0), 'monoLost is the sum of the rows');
  eq(r.monoLost > 0, true, 'and it actually costs something');
  // The scorecard prints a gross line and subtracts the rows from it, so the
  // arithmetic on screen has to close.
  eq(r.songTotal + r.monoLost > r.songTotal, true, 'the gross line is above the net');

  // A night that changes gear pays nothing, which is the honest player.
  const varied = scoreShow([[jam(0), perf({ song_id: 'v', tags: 'ballad' }), jam(1),
                             perf({ song_id: 'w' }), jam(2)], [], []], new Set());
  eq(varied.monoLost, 0, 'a night that moves around is never touched');
});

group('a score colour means a rating', () => {
  eq(gradeScore(GRADE_WARM - 1), 'cold', 'a weak night is red');
  eq(gradeScore(GRADE_WARM), 'warm', 'a middling night is yellow');
  eq(gradeScore(GRADE_HOT), 'hot', 'a strong night is green');
  eq(GRADE_HOT > GRADE_WARM, true, 'the bands are in order');

  // Length must not decide the colour: time, flow and breadth are whole-show
  // pools, so a long night was being marked down just for being long.
  eq(gradeScore(GRADE_HOT), gradeScore(GRADE_HOT), 'the grade is on the total alone');

  // Projection: the same pace grades the same however far in you are.
  eq(gradeRunning(GRADE_HOT / 2, 0.5), 'hot', 'half a night at a green pace is green');
  eq(gradeRunning(GRADE_HOT, 1), 'hot', 'and it still is at the end');
  eq(gradeRunning((GRADE_WARM - 100) / 4, 0.25), 'cold', 'a cold pace is cold early');
  eq(gradeRunning(500, 0), 'warm', 'no progress yet is neutral, not a red mark');
  // The last playback beat must agree with the scorecard, always.
  for (const t of [400, 900, GRADE_WARM, 1100, GRADE_HOT, 1600])
    eq(gradeRunning(t, 1), gradeScore(t), `playback and scorecard agree at ${t}`);
});

group('the cooldown', () => {
  const mk = (id, o = {}) => perf({ song_id: id, len: 600, ...o });
  const big = mk('a', { tags: 'peak', len: 1000 });
  const longOne = mk('L', { len: LEN_15MIN });

  eq(isBigMoment(big), true, 'a peak is a big moment');
  eq(isBigMoment(longOne), true, 'so is anything past fifteen minutes');
  eq(isBigMoment(mk('z', { len: 400 })), false, 'a short untagged song is not');

  const breather = mk('b', { tags: 'ballad', len: 400 });
  eq(cooldowns([[big, breather], [], []]).length, 1, 'peak into a breather counts');
  eq(cooldowns([[big, mk('c', { tags: 'peak', len: 400 })], [], []]).length, 0,
     'peak into another peak does not — the room has nowhere to go');
  eq(cooldowns([[big, mk('d', { tags: 'ballad', len: 999 })], [], []]).length, 0,
     'a quiet song that runs nearly as long is not a breather');
  eq(cooldowns([[big], [breather], []]).length, 0, 'and it has to be inside one set');
  eq(cooldowns([[breather, big], [], []]).length, 0, 'the order matters');

  const scored = scoreShow([[big, breather], [], []], new Set());
  eq(scored.cooldowns.length, 1, 'scoreShow reports it');
  eq(scored.stats.cooldowns, 1, 'and counts it for the headline');
  eq(scored.flowTotal, scored.arc + COOLDOWN_BONUS, 'and it lands inside Flow');
  eq(cooldowns([]).length, 0, 'no sets, no cooldowns');
  eq(cooldowns([[], [], []]).length, 0, 'empty sets, no cooldowns');
});

group('the ceiling is reachable and never below you', () => {
  const mk = (id, o = {}) => perf({ song_id: id, len: 600, crowd: 40, ...o });
  const show = songs => ({ songs });

  eq(bestPossible([], new Set(), undefined, [0, 0, 0]), null, 'no shows, no ceiling');
  eq(bestPossible(null, new Set(), undefined, [0, 0, 0]), null, 'no input, no ceiling');

  const a = mk('a', { crowd: 80, len: 900 }), b = mk('b', { crowd: 20 });
  const c = mk('c', { crowd: 70 }), d = mk('d', { crowd: 10 });
  const drafted = [
    { show: show([a, b]), perf: b, si: 0 },
    { show: show([c, d]), perf: d, si: 0 },
  ];
  const played = scoreShow([[b, d], [], []], new Set(), [0, 0, 0]);
  const ceil = bestPossible(drafted, new Set(), undefined, [0, 0, 0]);
  eq(ceil.total > played.total, true, 'taking the better song of each pair scores more');
  eq(ceil.matchedPlayer, false, 'and the search beat the player');
  eq(typeof ceil.matchedPlayer, 'boolean', 'matchedPlayer is always a boolean');

  /* THE ONE GUARANTEE THAT MATTERS. A ceiling below the score it is a ceiling
     for is worse than no ceiling, and two separate bugs produced exactly that:
     a dead-ended beam used to abandon the player's line mid-walk, and states
     with no legal move were dropped instead of kept as finished shows. The
     player's own line is walked alongside the search and never pruned, so this
     must hold for every shape of night. Note the searcher may also move set
     boundaries — beating a "best song every round" line is correct, not a bug. */
  let checked = 0;
  for (const n of [1, 2, 3, 5, 8]) {
    for (const takeWorst of [true, false]) {
      const steps = [], sets = [[], [], []];
      for (let i = 0; i < n; i++) {
        const good = mk(`g${i}`, { crowd: 70, len: 500 + i * 40 });
        const bad = mk(`b${i}`, { crowd: 15, len: 500 + i * 40 });
        const picked = takeWorst ? bad : good;
        const si = i < 3 ? 0 : i < 6 ? 1 : 2;
        steps.push({ show: show([good, bad]), perf: picked, si });
        sets[si].push(picked);
      }
      const mine = scoreShow(sets, new Set(), [0, 0, 0]).total;
      const top = bestPossible(steps, new Set(), undefined, [0, 0, 0]);
      eq(top.total >= mine, true,
         `${n} rounds taking the ${takeWorst ? 'worse' : 'better'} song: ` +
         `ceiling ${top.total} >= played ${mine}`);
      checked++;
    }
  }
  eq(checked, 10, 'every shape of night was checked');
});

group('the respin asks first', () => {
  eq(RESPIN_LINES.length >= 4, true, 'enough lines that they do not repeat immediately');
  eq(new Set(RESPIN_LINES).size, RESPIN_LINES.length, 'every line is distinct');
  eq(respinLine(0), RESPIN_LINES[0], 'the first line is the first line');
  eq(respinLine(RESPIN_LINES.length), RESPIN_LINES[0], 'and they wrap');
  eq(typeof respinLine(-3), 'string', 'a negative seed still returns a line');
  eq(RESPIN_LINES.every(l => l.length > 12), true, 'every line says something');
});

group('respins cost stage time', () => {
  eq(RESPIN_COSTS, [300, 600, 900], 'five, ten, then fifteen minutes');
  eq(respinCost(0), 300, 'the first spin is cheapest');
  eq(respinCost(1), 600, 'the second costs double');
  eq(respinCost(2), 900, 'the third is a jam you will never play');
  eq(respinCost(3), null, 'there is no fourth');

  const empty = [[], [], []];
  eq(canRespin(empty, 0, 0, [false, false, false], [0, 0, 0]), true,
     'a fresh Set I can afford a spin');
  eq(canRespin(empty, 0, 3, [false, false, false], [0, 0, 0]), false,
     'no spins left means no spin, however much time is going spare');

  // A set with only four minutes left cannot buy a five-minute spin.
  const nearlyFull = [[perf({ len: 4500 - 240 })], [], []];
  eq(canRespin(nearlyFull, 0, 0, [false, false, false], [0, 0, 0]), false,
     'a spin you cannot afford is not offered');

  // Time spent spinning is gone: it shrinks the budget and the time score.
  const sets = [[perf({ len: 4200 })], [], []];
  const clean = scoreShow(sets, new Set(), [0, 0, 0]);
  const spun  = scoreShow(sets, new Set(), [300, 0, 0]);
  eq(spun.time[0].budget, 4500 - 300, 'a spin comes straight off the set clock');
  eq(spun.time[0].ratio >= clean.time[0].ratio, true,
     'the same songs fill more of a smaller budget');
  eq(spun.time[0].budget < clean.time[0].budget, true, 'but the budget really is smaller');

  // Spinning away time you never use is pure loss: it cannot reach the encore.
  const idle = scoreShow([[], [], []], new Set(), [900, 0, 0]);
  eq(idle.time[2].budget, 600 + (4500 - 900) + 4200,
     'time burned on spins never reaches the encore');
});

group('segues count only inside a set', () => {
  // The opening take must carry is_segue — a clean take starts nothing.
  const a = { ...perf({ song_id: 'a', len: 600 }), is_segue: 'true' };
  const b = { ...perf({ song_id: 'b', len: 600 }), is_segue: 'true' };
  const seg = new Set(['a|b']);
  eq(scoreShow([[a, b], [], []], seg).segues.length, 1, 'adjacent inside Set I');
  eq(scoreShow([[a], [b], []], seg).segues.length, 0, 'across the set break does not count');
  eq(scoreShow([[b, a], [], []], seg).segues.length, 0, 'segues are directional');
  eq(scoreShow([[a, b], [], []], seg).segues[0].points, SEGUE_POINTS, 'worth SEGUE_POINTS');
});

group('suites: the movements of one piece', () => {
  /* THE BUG THIS EXISTS FOR. familiarityMult discounts a pair by how often the
     band plays it, and Seekers on the Ridge pt I > pt II is the MOST PLAYED
     PAIR IN THE ARCHIVE at 57 times, so it sat on the 0.30 floor and scored 18
     of a possible 60. The most canonical link in the catalogue paid the least
     of any link in the game. */
  const A = { ...perf({ song_id: 'j1', len: 600 }), is_segue: 'true', song: 'Jive I' };
  const B = { ...perf({ song_id: 'j2', len: 600 }), is_segue: 'true', song: 'Jive II' };
  const C = { ...perf({ song_id: 'jl', len: 600 }), song: 'Jive Lee' };
  const X = { ...perf({ song_id: 'x', len: 600 }), is_segue: 'true' };
  const Y = { ...perf({ song_id: 'y', len: 600 }) };
  const seg = new Set(['j1|j2', 'j2|jl', 'x|y']);
  const counts = new Map([['j1|j2', 57], ['j2|jl', 57], ['x|y', 57]]);
  const suites = new Map([['j1', 'jive'], ['j2', 'jive'], ['jl', 'jive']]);

  const plain = scoreShow([[X, Y], [], []], seg, undefined, counts, suites).segues[0];
  const suite = scoreShow([[A, B], [], []], seg, undefined, counts, suites).segues[0];
  eq(plain.fam < 0.35, true, 'an ordinary pair played 57 times is still braked hard');
  eq(suite.fam, 1, 'a suite link is not braked for being canonical');
  eq(suite.points > plain.points * 3, true,
     `a suite link is worth several times the same pair as an ordinary segue (${suite.points} vs ${plain.points})`);
  /* The bonus ITSELF, not just the missing brake. Checked against raw, which is
     the graded total before the brakes: without this the test passed with
     SUITE_BONUS deleted, because the exemption alone already cleared 3x. */
  eq(suite.raw, SEGUE_POINTS + SUITE_BONUS, 'and carries the suite bonus on top');
  eq(suite.kinds.includes('suite'), true, 'and is named as one');
  eq(suite.suite, true, 'and flagged for the scoresheet');

  /* Two movements is a suite; three is the thing the band has managed twice in
     660 shows. The full bonus fires on the SECOND link, not the first. */
  const two = scoreShow([[A, B], [], []], seg, undefined, counts, suites).segues;
  eq(two.some(h => h.kinds.includes('full suite')), false,
     'two movements is not a full suite');
  const three = scoreShow([[A, B, C], [], []], seg, undefined, counts, suites).segues;
  eq(three.length, 2, 'three movements make two links');
  eq(three[0].kinds.includes('full suite'), false, 'the first link is not yet the full one');
  eq(three[1].kinds.includes('full suite'), true, 'the second one carries it past two');
  eq(three[1].raw, SEGUE_POINTS + SUITE_BONUS + SUITE_FULL_BONUS,
     'and is paid both bonuses');

  // Only within one family, and only pairs the band has actually segued.
  const other = new Map([['j1', 'jive'], ['j2', 'seekers'], ['jl', 'jive']]);
  eq(scoreShow([[A, B], [], []], seg, undefined, counts, other).segues[0].suite, false,
     'two different pieces are not a suite');
  eq(scoreShow([[A, B], [], []], new Set(), undefined, counts, suites).segues.length, 0,
     'and a pair the band never segued is not a link at all');

  // Every caller that predates suites still works, unchanged.
  eq(scoreShow([[A, B], [], []], seg, undefined, counts).segues[0].suite, false,
     'without a suites map, a suite link scores as an ordinary segue');
});

group('fan headline', () => {
  // An ORDINARY night: real-length songs, a bit of breadth, nothing anybody
  // would still be talking about. Filler alone is not ordinary — a night with
  // no cover and one kind of song is genuinely narrow, and gets told so.
  let n = 0;
  const ord = (o = {}) => perf({ song_id: `o${n++}`, len: 700, tags: 'jam', ...o });
  const ordinary = si => [
    ord({ tags: 'opener' }), ord({ is_cover: 'true' }), ord({ jam: 1 }),
    ord({ tags: 'ballad' }), ord({ tags: si === 1 ? 'peak' : 'jam' }),
    ord({ tags: 'closer' }),
  ];

  const packed = scoreShow([ordinary(0), ordinary(1), [ord({ tags: 'encore', len: 600 })]], new Set());
  eq(packed.stats.breadthGot >= 2 && packed.stats.breadthGot < 5, true,
     'the ordinary fixture is neither barren nor a clean sweep');
  eq(/curfew|minute|tank/i.test(packed.headline), true,
     `an ordinary full night falls back to timing (got "${packed.headline}")`);

  const thin = scoreShow([ordinary(0).slice(0, 2), ordinary(1).slice(0, 2), []], new Set());
  eq(/wanting more|early|road|coasted/i.test(thin.headline), true,
     `a short night gets called out (got "${thin.headline}")`);

  // The point of the rewrite: something remarkable about the night outranks
  // its clock management. A sandwich is the loudest thing a show can contain.
  const seg = id => ({ ...perf({ song_id: id, len: 600 }), is_segue: 'true' });
  const A = seg('a'), B = seg('b');
  const sand = scoreShow([[A, B, seg('a')], [], []], new Set(['a|b', 'b|a']));
  eq(sand.stats.sandwiches >= 1, true, 'the fixture really does close a sandwich');
  eq(/inside another one/i.test(sand.headline), true,
     `a sandwich outranks any timing line (got "${sand.headline}")`);

  // Timing rules must stay at the back, or they swallow everything again —
  // which is exactly how 10 of 16 headlines became unreachable.
  const timingIds = ['tothewire', 'full', 'good', 'solid'];
  const firstTiming = HEADLINES.findIndex(h => timingIds.includes(h.id));
  const lastFeature = HEADLINES.map(h => h.id)
    .lastIndexOf(HEADLINES.filter(h => !timingIds.includes(h.id) &&
      !['set1thin', 'set2thin', 'shortall', 'short'].includes(h.id)).at(-1).id);
  eq(firstTiming > lastFeature, true, 'every feature rule is checked before any timing rule');
  eq(HEADLINES.at(-1).id, 'solid', 'the catch-all is last');
  eq(HEADLINES.at(-1).when({}), true, 'the last headline always matches');

  // No two rules may share a line, and none may be blank.
  const texts = HEADLINES.map(h => h.text);
  eq(new Set(texts).size, texts.length, 'every headline is distinct');
  eq(texts.every(t => t && t.length > 10), true, 'every headline says something');
  eq(new Set(HEADLINES.map(h => h.id)).size, HEADLINES.length, 'ids are unique');

  eq(typeof scoreShow([[], [], []], new Set()).headline, 'string', 'an empty night still gets a line');
});

/* THE CARD IS A SWAP, and every assertion here is about that being a fair one.
   It used to take the best song ever offered, judged in the best of six roles,
   and print the number next to a setlist scored one role per song: measured
   over 300 random games it beat every song the player played in 296 of them.
   Same show, same slot, same role, and no longer than what was spent there. */
group('the one that got away', () => {
  const ordinary = perf({ song_id: 'a', song: 'Ordinary', crowd: 30, len: 600 });
  const monster  = perf({ song_id: 'b', song: 'The Monster', crowd: 75, len: 600,
                          rec: 1, tags: 'peak' });
  const fine     = perf({ song_id: 'c', song: 'Fine', crowd: 45, len: 600 });
  const show = { show_id: 's1', songs: [ordinary, monster, fine] };
  const draft = p => [{ show, perf: p, si: 0 }];

  const miss = theOneThatGotAway(draft(ordinary), [[ordinary], [], []]);
  eq(miss.perf.song, 'The Monster', 'the better song in the same show surfaces');
  eq(miss.instead.song, 'Ordinary', 'named against the song actually taken');
  eq(miss.took.subtotal, miss.score.subtotal - miss.gap,
     'and the gap is the difference between the two');
  eq(miss.gap > 0, true, 'only a song that would have scored MORE is a regret');

  /* THE TWO NUMBERS ARE COMPARABLE BY CONSTRUCTION, which is the whole fix:
     both are scorePerf of one song in one role, and it is the same role. */
  eq(miss.score.role, miss.took.role, 'both scored in the same role');

  /* THE CAP IS LOAD-BEARING. A longer alternative might not have fitted the
     clock, and reporting a regret that was never available is exactly what
     made the old card a taunt. */
  const huge = perf({ song_id: 'd', song: 'Twenty Two Minutes', crowd: 75,
                      len: 1400, rec: 1, tags: 'peak' });
  const bigShow = { show_id: 's2', songs: [ordinary, huge] };
  eq(theOneThatGotAway([{ show: bigShow, perf: ordinary, si: 0 }], [[ordinary], [], []]),
     null, 'a song longer than the one you took is not counted as missed');
  /* The cap is a ceiling, not a floor. A long DULL pick leaves room for a
     short strong one, and that is a real regret. Dull rather than the peak
     song above, because the version multiplier tiers on length: a 23-minute
     take of anything outscores a 10-minute take of the same thing, so a long
     great song is not something a short great song beats. */
  const longDull = perf({ song_id: 'e', song: 'Long Dull One', crowd: 30, len: 1400 });
  const roomy = { show_id: 's3', songs: [longDull, monster] };
  eq(theOneThatGotAway([{ show: roomy, perf: longDull, si: 0 }], [[longDull], [], []]).perf.song,
     'The Monster', 'but a shorter one against a long weak pick is');

  /* THE SLOT ADVANCES WITH THE PICKS. Judging every round in the first slot's
     role passes every single-pick test above, so this one has two picks in one
     set and an alternative whose fit depends on which of them it is measured
     against: with a set of two, index 0 is the Opener and index 1 the Closer,
     and a closer-tagged song is only a big regret against the second. */
  const dullA = perf({ song_id: 'm', song: 'Filler One', crowd: 30, len: 600 });
  const dullB = perf({ song_id: 'n', song: 'Filler Two', crowd: 30, len: 600 });
  const opens = perf({ song_id: 'o', song: 'The Opener', crowd: 45, len: 600, tags: 'opener' });
  const shuts = perf({ song_id: 'p', song: 'The Closer', crowd: 75, len: 600,
                       rec: 1, tags: 'closer' });
  const twoSlot = { show_id: 's6', songs: [dullA, dullB, opens, shuts] };
  const both = theOneThatGotAway(
    [{ show: twoSlot, perf: dullA, si: 0 }, { show: twoSlot, perf: dullB, si: 0 }],
    [[dullA, dullB], [], []]);
  eq(both.perf.song, 'The Closer', 'a later pick is judged in the slot it really filled');
  eq(both.instead.song, 'Filler Two', 'and named against the song taken in that slot');

  /* A song you took LATER is not one that got away. */
  eq(theOneThatGotAway(draft(ordinary), [[ordinary], [monster], [fine]]), null,
     'nothing got away when everything was played somewhere');
  eq(theOneThatGotAway([], [[], [], []]), null, 'nothing drafted, nothing missed');
  eq(theOneThatGotAway(null, [[], [], []]), null, 'and no drafted list at all is safe');

  /* GOOD PLAY MAKES IT DISAPPEAR, which is the property the old card lacked:
     it fired every game regardless of how well anybody did. */
  eq(theOneThatGotAway(draft(monster), [[monster], [], []]), null,
     'taking the best song in the show leaves no regret');

  /* A TEASE IS NOT A SONG YOU MISSED. The length cap lets anything short
     through, so 13% of the regrets it surfaced were takes under three minutes:
     "you took SALT for 36, this was worth 64" about a 1:23 snippet. */
  const snippet = perf({ song_id: 't', song: 'Snippet', crowd: 75, len: 83,
                         rec: 1, tags: 'peak' });
  eq(theOneThatGotAway([{ show: { show_id: 's7', songs: [ordinary, snippet] },
     perf: ordinary, si: 0 }], [[ordinary], [], []]), null,
     'a take under three minutes is a tease, not a song you missed');

  // An untimed song can never be played, so it never counts as missed.
  const noClock = perf({ song_id: 'z', song: 'No Clock', len: 0, crowd: 75 });
  eq(theOneThatGotAway([{ show: { show_id: 's4', songs: [ordinary, noClock] },
     perf: ordinary, si: 0 }], [[ordinary], [], []]), null,
     'an untimed song was never really on offer');

  // A song that suits no role in particular must not be labelled one.
  const bland = perf({ song_id: 'q', song: 'Bland', crowd: 70, len: 600 });
  const dull  = perf({ song_id: 'r', song: 'Duller', crowd: 30, len: 600 });
  const b = theOneThatGotAway([{ show: { show_id: 's5', songs: [dull, bland] },
    perf: dull, si: 0 }], [[dull], [], []]);
  eq(b && b.role, null, 'a song with no role fit is not given a role it does not have');
});

group('fan reactions are keyed to why', () => {
  const R = (o, roleName = 'Mid', fit = 'neutral', ctx = {}, seed = 0) =>
    reactionFor({ subtotal: o.sub === undefined ? 60 : o.sub, fit, role: roleName },
                perf(o), seed, ctx);

  /* THE CARD AND THE CROWD READ THE SAME NUMBER.
     The chip appeared at a gap of 20 and the bustout reaction fired at 50, so
     68% of every take wearing a "N SHOW GAP" chip was advertised as rare and
     then greeted with "beer line got long". */
  eq(GAP_RARE < GAP_BUSTOUT && GAP_BUSTOUT < GAP_UNICORN, true, 'the tiers are in order');
  eq(/cheer|since the last|Deep cut|section 102/i.test(R({ gap: GAP_RARE })), true,
     'the gap that earns a chip also earns a reaction');
  eq(/cheer|since the last|Deep cut|section 102|BUSTOUT|roof came off/i
       .test(R({ gap: GAP_RARE - 1 })), false,
     'and one show short of it says nothing about the gap');
  eq(/BUSTOUT|Bustout|First time|waiting/i.test(R({ gap: GAP_BUSTOUT })), true,
     'a real bustout is a bustout');
  eq(/roof came off|Are you kidding|Nobody alive|whitest whale/i.test(R({ gap: GAP_UNICORN })), true,
     'and a hundred shows is its own thing again');

  // The number is in the line, because a crowd that waited knows how long.
  eq(R({ gap: 147 }, 'Mid', 'neutral', {}, 0).includes('147 shows'), true,
     'the loud lines say the number');
  eq(R({ gap: 1 }, 'Mid', 'neutral', {}, 1).includes('{gap}'), false,
     'no template token ever reaches the screen');
  eq(gapPhrase(1), 'one show', 'one show is not "1 shows"');
  eq(gapPhrase(147), '147 shows', 'and the rest are plain');

  /* A bustout in the wrong slot is two true things at once. Choosing one lost
     the other, so the line says both. */
  const badBustout = R({ gap: 200 }, 'Peak', 'bad');
  eq(/buried|wrong moment|wrong slot/i.test(badBustout), true,
     'a badly placed bustout is still called out as badly placed');
  eq(/bedlam|pop was real|Still counts/i.test(badBustout), true,
     '...and still gets its pop');
  eq(/momentum|thinned|Air came/.test(R({ gap: GAP_RARE }, 'Peak', 'bad')), true,
     'but a merely rare song in the wrong slot is just a mistake');

  eq(/hose|send each other|type II|bliss/i.test(R({ rec: 1, len: 1300 })), true,
     'a recommended 20-minute version is a legend line');
  eq(/twenty|type II|Whale|Peaked/i.test(R({ len: 1300 })), true, 'a 20-minute version went there');
  eq(/jam vehicle|patient|Plinko|Legs/i.test(R({ jam: 1 })), true, 'a jamchart version gets jam talk');
  eq(/[Cc]over/.test(R({ is_cover: 'true' })), true, 'a cover is called out');
  eq(/heard in|Bustout AND|dusted off/i.test(R({ is_cover: 'true', gap: 80 })), true,
     'a cover that is also a bustout gets both');
  eq(/Lighters|exhale|Pretty/.test(R({ tags: 'ballad' })), true, 'a ballad is the breather');
  eq(/momentum|thinned|Air came/.test(R({}, 'Peak', 'bad')), true, 'a clash kills the room');

  // Context: where in the night it landed, and the cooldown the rule pays for.
  eq(/exhale|refilled|comes down|Soft landing/i.test(R({}, 'Mid', 'neutral', { cooldown: true })), true,
     'the breather after a big one is heard, not just scored');
  eq(/erupts|Openers do not|out of the gate/i.test(R({}, 'Mid', 'neutral', { first: true })), true,
     'the first song of the night gets the lights-down line');
  eq(/Last one|house lights|Final note/i.test(R({}, 'Mid', 'neutral', { last: true })), true,
     'and the last one gets the house lights');
  eq(/minute of it|tease|Short, sharp/i.test(R({ len: TEASE_SECONDS - 1 })), true,
     'anything under three minutes is a tease');
  eq(/minute of it|tease|Short, sharp/i.test(R({ len: TEASE_SECONDS })), false,
     'and three minutes exactly is a song');

  /* Every line, at every seed, with the biggest gap on record substituted, has
     to read in one beat of playback. Templating made this easy to break: a
     line that fits empty can overflow once "543 shows" lands in it. */
  const long = [];
  for (const g of [0, GAP_RARE, GAP_BUSTOUT, GAP_UNICORN, 543])
    for (let seed = 0; seed < 8; seed++)
      for (const f of ['neutral', 'bad', 'great'])
        for (const ctx of [{}, { first: true }, { last: true }, { cooldown: true }]) {
          const t = R({ gap: g, len: 600 }, 'Mid', f, ctx, seed);
          if (typeof t !== 'string' || !t.length || t.length > 60) long.push(`${t.length}: ${t}`);
        }
  eq(long.length, 0, `every reaction reads in one beat${long.length ? ` — ${long[0]}` : ''}`);

  /* Rotation: the same bucket firing repeatedly must walk its lines rather
     than repeat one. A four-line bucket used four times produced the identical
     sentence four times in one show before this. */
  const rot = new Map();
  const seen = [];
  for (let i = 0; i < 4; i++)
    seen.push(reactionFor({ subtotal: 60, fit: 'neutral', role: 'Mid' },
              perf({ gap: GAP_RARE }), i * 13, { rotation: rot, offset: 0 }));
  eq(new Set(seen).size, 4, 'four uses of a four-line bucket give four different lines');
  eq(rot.get('rare'), 4, 'and the rotation counted them');

  // A different show opens on a different line, but a replay of one show is
  // identical — the offset is the night's own score, not a random number.
  const line = off => reactionFor({ subtotal: 60, fit: 'neutral', role: 'Mid' },
    perf({ gap: GAP_RARE }), 0, { rotation: new Map(), offset: off });
  eq(line(0) !== line(1), true, 'two shows do not open on the same line');
  eq(line(7), line(7), 'and the same show replays the same');

  // No bucket may be empty, or a situation resolves to undefined on screen.
  eq(Object.values(RX).every(v => Array.isArray(v) && v.length &&
       v.every(t => typeof t === 'string' && t.trim())), true,
     'every reaction bucket has real lines in it');
});


group('scoreShow totals', () => {
  const mk = (id, tags, len) => perf({ song_id: id, tags, len, crowd: 30 });
  const sets = [
    [mk('a', 'opener', 900), mk('b', '', 900), mk('c', 'closer|jam', 1200)],
    [mk('d', 'opener', 900), mk('e', 'peak', 1500), mk('f', 'closer|peak', 1200)],
    [mk('g', 'encore', 600)],
  ];
  const r = scoreShow(sets, new Set());
  eq(r.total, r.songTotal + r.timeTotal + r.flowTotal + r.breadthTotal,
     'total is songs + time + flow + breadth');
  // Every heading on the scoresheet must equal the rows printed beneath it.
  eq(r.flowTotal, r.segues.reduce((a, x) => a + x.points, 0) + r.arc,
     'Flow is exactly its segues plus its arc');
  eq(r.breadthTotal, r.breadth.filter(c => c.got).reduce((a, c) => a + c.points, 0),
     'Breadth is exactly the cards it earned');
  eq(r.perSet.map(x => x.length), [3, 3, 1], 'per-set breakdowns line up');
  eq(r.stats.songs, 7, 'song count');
  eq(r.perSet[0][0].role.name, 'Opener', 'first song is the opener');
  eq(r.perSet[0][2].role.name, 'Closer', 'last song of Set I is the closer');

  // Using more of the stage must beat using less, all else equal.
  const shorter = [[mk('a', 'opener', 900)], [], []];
  eq(scoreShow(sets, new Set()).timeTotal > scoreShow(shorter, new Set()).timeTotal, true,
     'a fuller night scores more time');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
