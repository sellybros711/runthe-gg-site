/* Run The Setlist — QA harness for scoring v4.
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
  MIN_LANDING_SECONDS, wouldStrand, danglingSegue, closesSandwich,
  ARC_MAX, ARC_ZERO_AT, VARIETY_MAX, VARIETY_MIN_ROLES,
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

group('budgets — the encore inherits leftovers', () => {
  const OPEN = [false, false, false];
  eq(budgets([[], [], []], OPEN), [4500, 4200, 600],
     'mid-game with both sets still open, the encore has only its own 10 minutes');

  const short1 = [[perf({ len: 3000 })], [], []];
  eq(budgets(short1, [true, false, false])[2], 600 + 1500,
     'once Set I closes 25 minutes short, the encore inherits them');
  eq(budgets(short1, OPEN)[2], 600, 'while Set I is still open it has left nothing behind');

  const full1 = [[perf({ len: 4500 })], [], []];
  eq(budgets(full1, [true, false, false])[2], 600, 'a set used in full leaves nothing behind');

  const both = [[perf({ len: 3000 })], [perf({ len: 3000 })], []];
  eq(budgets(both, [true, true, false])[2], 600 + 1500 + 1200,
     'both sets closed short: the encore collects from each');
  eq(budgets(both)[0], 4500, 'Set I own budget is never changed by the maths');
  eq(budgets(both)[2], 600 + 1500 + 1200,
     'with no closed argument every set counts, which is how a finished show scores');
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
  eq(setNote(0.7, 1), 'Cut short — the crowd noticed.', 'set note when short');
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

group('graded segues', () => {
  const mk = (id, o={}) => ({ ...perf({ song_id: id, len: 600, ...o }) });
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
  eq(four.segues[2].points, SEGUE_POINTS + SEGUE_CHAIN_BONUS, 'the third link pays the chain bonus');

  // A > B > A closes a sandwich.
  const sand = scoreShow([[A, B, mk('a')], [], []], pair);
  const closing = sand.segues[sand.segues.length - 1];
  eq(closing.kinds.includes('sandwich'), true, 'coming back closes a sandwich');
  eq(closing.points >= SANDWICH_BONUS, true, 'and it pays for it');

  eq(closesSandwich([A, B], mk('a'), pair), true, 'closesSandwich sees the return');
  eq(closesSandwich([A, B], C, pair), false, 'a new song is not a sandwich');
  eq(closesSandwich([A], mk('a'), pair), false, 'A straight back into A is not a sandwich');
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
  const a = perf({ song_id: 'a', len: 600 }), b = perf({ song_id: 'b', len: 600 });
  const seg = new Set(['a|b']);
  eq(scoreShow([[a, b], [], []], seg).segues.length, 1, 'adjacent inside Set I');
  eq(scoreShow([[a], [b], []], seg).segues.length, 0, 'across the set break does not count');
  eq(scoreShow([[b, a], [], []], seg).segues.length, 0, 'segues are directional');
  eq(scoreShow([[a, b], [], []], seg).segues[0].points, SEGUE_POINTS, 'worth SEGUE_POINTS');
});

group('fan headline', () => {
  const fill = (secs, n = 1) => Array.from({ length: n }, () => perf({ len: secs / n }));
  const packed = scoreShow([fill(4500), fill(4200), fill(600)], new Set());
  eq(/curfew|wasted|minute/i.test(packed.headline), true,
     `a full night gets a full-night headline (got "${packed.headline}")`);

  const thin = scoreShow([fill(1200), fill(1200), []], new Set());
  eq(/wanting more|early|Barely|short/i.test(thin.headline), true,
     `a short night gets called out (got "${thin.headline}")`);

  eq(HEADLINES[HEADLINES.length - 1].when({}), true, 'the last headline always matches');
  eq(typeof scoreShow([[], [], []], new Set()).headline, 'string', 'an empty night still gets a line');
});

group('the one that got away', () => {
  const seen = [
    perf({ song_id: 'a', song: 'Ordinary', crowd: 30, len: 600 }),
    perf({ song_id: 'b', song: 'The Monster', crowd: 75, len: 1400, rec: 1, tags: 'peak' }),
    perf({ song_id: 'c', song: 'Fine', crowd: 45, len: 700 }),
  ];
  const played = [[seen[0]], [], []];
  const miss = theOneThatGotAway(seen, played);
  eq(miss.perf.song, 'The Monster', 'the best thing left behind is what surfaces');
  eq(miss.score.subtotal > 100, true, 'and it is scored, not just named');
  eq(miss.role && miss.role.name, 'Peak', 'a peak song is named as a peak');

  // A song that suits no role in particular must not be labelled one.
  const bland = [perf({ song_id: 'q', song: 'Bland', crowd: 70, len: 800 })];
  eq(theOneThatGotAway(bland, [[], [], []]).role, null,
     'a song with no role fit is not given a role it does not have');

  eq(theOneThatGotAway(seen, [[seen[0]], [seen[1]], [seen[2]]]), null,
     'nothing got away when everything was played');
  eq(theOneThatGotAway([], [[], [], []]), null, 'nothing seen, nothing missed');

  // A song shown twice and never played should not beat itself.
  const twice = [seen[1], seen[1]];
  eq(theOneThatGotAway(twice, [[], [], []]).perf.song, 'The Monster', 'duplicates are fine');

  // An untimed song can never be played, so it never counts as missed.
  eq(theOneThatGotAway([perf({ song_id: 'z', song: 'No Clock', len: 0, crowd: 75 })],
     [[], [], []]), null, 'an untimed song was never really on offer');
});

group('fan reactions are keyed to why', () => {
  const R = (o, roleName='Mid', fit='neutral') =>
    reactionFor({ subtotal: o.sub === undefined ? 60 : o.sub, fit, role: roleName },
                perf(o), 0);

  eq(/BUSTOUT|Bustout|forever/.test(R({ gap: 100 })), true, 'a 100-show gap is a bustout');
  eq(/hose|send each other|type II|bliss/i.test(R({ rec: 1, len: 1300 })), true,
     'a recommended 20-minute version is a legend line');
  eq(/twenty|type II|Whale|Peaked/i.test(R({ len: 1300 })), true, 'a 20-minute version went there');
  eq(/jam vehicle|patient|Plinko|Legs/i.test(R({ jam: 1 })), true, 'a jamchart version gets jam talk');
  eq(/[Cc]over/.test(R({ is_cover: 'true' })), true, 'a cover is called out');
  eq(/Lighters|exhale|Pretty/.test(R({ tags: 'ballad' })), true, 'a ballad is the breather');
  eq(/momentum|thinned|Air came/.test(R({}, 'Peak', 'bad')), true, 'a clash kills the room');

  // The clash line must win over everything, including a bustout.
  eq(/momentum|thinned|Air came/.test(R({ gap: 200 }, 'Peak', 'bad')), true,
     'a badly placed bustout still reads as a mistake');

  // Every line is short enough to read in one beat of playback.
  const all = [];
  for (const g of [0, 100]) for (const l of [300, 1300]) for (const f of ['neutral','bad','great'])
    all.push(R({ gap: g, len: l }, 'Mid', f));
  eq(all.every(x => typeof x === 'string' && x.length > 0 && x.length <= 60), true,
     'every reaction is a one-breath line');

  eq(eventLine(['sandwich']).includes('andwich'), true, 'a sandwich announces itself');
  eq(/no gap|not stopped/i.test(eventLine(['chain'])), true, 'a chain says it has not stopped');
  eq(/tape|everybody knows/i.test(eventLine(['exact'])), true, 'an exact rebuild references the tape');
  eq(eventLine(null), null, 'no segue, no line');
  eq(typeof setOpenLine(0), 'string', 'each set gets an opening line');
  eq(setOpenLine(1).toLowerCase().includes('setbreak'), true, 'Set II comes back from setbreak');
});

group('scoreShow totals', () => {
  const mk = (id, tags, len) => perf({ song_id: id, tags, len, crowd: 30 });
  const sets = [
    [mk('a', 'opener', 900), mk('b', '', 900), mk('c', 'closer|jam', 1200)],
    [mk('d', 'opener', 900), mk('e', 'peak', 1500), mk('f', 'closer|peak', 1200)],
    [mk('g', 'encore', 600)],
  ];
  const r = scoreShow(sets, new Set());
  eq(r.total, r.songTotal + r.timeTotal + r.flowTotal, 'total is songs + time + flow');
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
