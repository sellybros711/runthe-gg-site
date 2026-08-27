/*
 * test_metrics.mjs - the tape, and the arithmetic the data centre draws with.
 *
 * A chart is the one screen in this mode that can be confidently, silently wrong. Every
 * other screen prints a number next to a word, and a wrong number looks wrong. A chart
 * turns numbers into a shape, and a shape has no units on it: a scale chosen badly draws a
 * catastrophe out of four points of drift, and nobody reading it can tell.
 *
 * So the arithmetic lives in metrics.js with no browser in it and is checked here:
 *
 *   THE TAPE       records once per position however many times it is called, and survives
 *                  a world that is missing half its fields
 *   THE SCALE      a flat term draws flat; a real move fills the box; nothing is plotted
 *                  as zero because it was absent
 *   THE GEOMETRY   the path lands inside the box, the highest value is at the top, and a
 *                  single point does not sit in the corner
 *   COMPARING      indexing to 100 is the only way two series share an axis, and a series
 *                  that cannot be indexed is dropped rather than drawn wrong
 *   THE WORDS      a pressure falling is good news and a bigger playoff is neither
 */
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..', '..', '..', '..');
const M = require(path.join(ROOT, 'cfb', 'commish', 'metrics.js'));
const L = require(path.join(ROOT, 'cfb', 'commish', 'ledger.js'));

let bad = 0;
const ok = (n, p, x) => { if (!p) bad++; console.log((p ? '  ok   ' : ' FAIL  ') + n + (x !== undefined ? '   ' + x : '')); };
const head = (s) => console.log('\n=== ' + s + ' ===');

const BOX = { x: 0, y: 0, w: 300, h: 120 };
const pts = (vals) => vals.map((v, i) => ({ x: i, v, at: { y: 2025, b: i, n: i } }));

head('the tape records once per position');
{
  const w = L.createWorld({ year: 2025, seed: 1 });
  M.record(w);
  M.record(w);
  M.record(w);
  ok('three calls on one state leave one row', w.tape.length === 1, w.tape.length + ' rows');

  /* THE CASE THIS GUARD EXISTS FOR. A ruling lands its edit and its fallout in one press,
     so the row written when the beat opened is stale rather than a second point. Overwrite,
     do not append, or a term reads as twice as many decisions as it had. */
  w.meters.standing = 41;
  M.record(w);
  ok('  and new numbers at the same position overwrite it', w.tape.length === 1, w.tape.length + ' rows');
  ok('  with the new value, not the old one', w.tape[0].st === 41, String(w.tape[0].st));

  w.history.push({ year: 2025, beat: 0, id: 'x', label: 'A ruling' });
  M.record(w);
  ok('a ruling is a new point even inside the same beat', w.tape.length === 2, w.tape.length + ' rows');

  w.beat = 1;
  M.record(w);
  ok('  and so is the next beat', w.tape.length === 3, w.tape.length + ' rows');

  /* Nine blocs are stored as a bare array to keep the save file small, so the order IS the
     schema and a reorder would silently relabel somebody's whole term. */
  ok('every bloc is on the row', w.tape[0].bl.length === 9, w.tape[0].bl.length + ' of 9');
  ok('  in the order the catalogue reads them back in',
    M.BLOC_ORDER[0] === 'SEC' && M.BLOC_ORDER[8] === 'Fans',
    M.BLOC_ORDER.join(', '));
  const secSeries = M.BY_ID['bloc:SEC'];
  ok('  and reading one back gets that bloc and not its neighbour',
    secSeries.pick(w.tape[0]) === w.blocs.SEC, String(secSeries.pick(w.tape[0])));
}

head('a world missing half its fields still records');
{
  /* A save from before this file existed, or a term mid-migration. The tape is decoration:
     it must never be the thing that stops a term loading. */
  let threw = null;
  for (const junk of [{}, { meters: null }, { blocs: {} }, { year: 2025, history: null }]) {
    try { M.record(junk); } catch (e) { threw = e.message; }
  }
  ok('four half-built worlds, no exception', !threw, threw || 'none');
  const empty = {};
  M.record(empty);
  ok('  and the row still has a slot for every bloc', empty.tape[0].bl.length === 9);
}

head('the scale does not invent a story');
{
  /* THE FAILURE THIS IS THE WHOLE GUARD AGAINST. Standing wobbling between 49 and 51 is a
     term in which nothing happened. Fitted to its own data it would fill the box top to
     bottom and draw the same picture as a collapse from 90 to 10. */
  const s = M.BY_ID.standing;
  const flat = M.extent(pts([49, 50, 51, 50]), s);
  ok('a term that barely moved is given a floor to sit in',
    (flat.hi - flat.lo) >= 12, 'span ' + (flat.hi - flat.lo).toFixed(1));

  const real = M.extent(pts([80, 60, 40, 20]), s);
  ok('  while a real collapse is allowed to fill the box',
    (real.hi - real.lo) > 60, 'span ' + (real.hi - real.lo).toFixed(1));
  ok('  and a real collapse draws taller than a flat term',
    (real.hi - real.lo) > (flat.hi - flat.lo) * 3);

  /* Viewership runs around 1.4 and a floor of twelve would flatten every real move in it. */
  const v = M.extent(pts([1.38, 1.44, 1.41]), M.BY_ID.perGame);
  ok('a series on a different scale gets a floor on its own scale',
    (v.hi - v.lo) < 0.5 && (v.hi - v.lo) > 0.01, 'span ' + (v.hi - v.lo).toFixed(3));

  ok('nothing is drawn below zero when nothing went below zero',
    M.extent(pts([0, 1, 2]), M.BY_ID.outsiders).lo >= 0);
  ok('an empty series has no extent rather than a made up one', M.extent([], s) === null);
}

head('the geometry');
{
  const s = M.BY_ID.standing;
  const p = pts([20, 60, 40, 90]);
  const e = M.extent(p, s);
  const d = M.path(p, BOX, e);
  const nums = d.match(/-?\d+(\.\d+)?/g).map(Number);
  const xs = nums.filter((_, i) => i % 2 === 0), ys = nums.filter((_, i) => i % 2 === 1);
  ok('every point is inside the box',
    xs.every((x) => x >= BOX.x - 0.5 && x <= BOX.x + BOX.w + 0.5)
    && ys.every((y) => y >= BOX.y - 0.5 && y <= BOX.y + BOX.h + 0.5),
    'x ' + Math.min(...xs) + '-' + Math.max(...xs) + '  y ' + Math.min(...ys) + '-' + Math.max(...ys));
  /* SVG y grows downward, so the biggest value must be the SMALLEST y. Getting this
     backwards draws every chart in the mode upside down and reads as plausible. */
  ok('  the highest value is at the top', ys[3] === Math.min(...ys),
    'peak 90 at y=' + ys[3] + ', min y ' + Math.min(...ys));
  ok('  the lowest is at the bottom', ys[0] === Math.max(...ys));
  ok('  and the line runs left to right', xs[0] < xs[3] && xs[0] === BOX.x);

  const a = M.area(p, BOX, e);
  ok('the wash under it closes on the floor', /Z$/.test(a) && a.indexOf(String(BOX.y + BOX.h)) > 0);
  ok('  and is not drawn for a single point', M.area(pts([5]), BOX, e) === '');

  /* One point in the corner reads as a rendering fault rather than as year one. */
  const one = M.scaler(pts([5]), BOX, e);
  ok('a lone point sits in the middle, not in the corner', one.X(0) === BOX.x + BOX.w / 2,
    'x=' + one.X(0));

  const t = M.ticks(0, 100, 4);
  ok('axis ticks are numbers a person would pick', t.join(' ') === '0 25 50 75 100', t.join(' '));
  ok('  on a small scale too', M.ticks(1.38, 1.44, 3).length >= 2, M.ticks(1.38, 1.44, 3).join(' '));
}

head('finding the point under the pointer');
{
  const p = pts([1, 2, 3, 4, 5]);
  ok('the left edge finds the first', M.nearest(p, BOX, 0) === 0);
  ok('the right edge finds the last', M.nearest(p, BOX, 300) === 4);
  ok('the middle finds the middle', M.nearest(p, BOX, 150) === 2);
  /* THE POINTER IS NEVER ASKED TO LAND ON THE LINE. It is asked to be closest in x, and
     anywhere outside the box still resolves to an end rather than to nothing. */
  ok('past either edge still resolves', M.nearest(p, BOX, -900) === 0 && M.nearest(p, BOX, 900) === 4);
  ok('and an empty series resolves to nothing at all', M.nearest([], BOX, 10) === -1);
}

head('comparing without a second axis');
{
  /* THE ANTI-PATTERN THIS EXISTS TO AVOID. Viewership near 1.4 and standing near 60 cannot
     share a y-axis: aligning them is arbitrary, so the picture invents a correlation. Both
     rebased to 100 at the left edge is one axis, in percent moved, and honest. */
  const a = M.indexed(pts([1.40, 1.47, 1.54]));
  const b = M.indexed(pts([60, 54, 45]));
  ok('both series start at exactly 100', a[0].v === 100 && b[0].v === 100);
  ok('  and end where they actually went', Math.round(a[2].v) === 110 && Math.round(b[2].v) === 75,
    Math.round(a[2].v) + ' and ' + Math.round(b[2].v));
  ok('  keeping the real number for the readout', a[2].raw === 1.54, String(a[2].raw));

  /* Everything after a zero start is an infinite percentage of nothing. Dropped, so the
     caller can say which line is missing, rather than drawn as a wrong one. */
  ok('a series starting at zero is refused rather than drawn', M.indexed(pts([0, 4, 9])) === null);
  ok('  and so is an empty one', M.indexed([]) === null);

  ok('only three series may share a plot', M.COMPARE.length === 3, M.COMPARE.join(', '));
  ok('  and all three exist', M.COMPARE.every((id) => M.BY_ID[id]));
}

head('labels that would land on top of each other');
{
  /* THE SMUDGE THIS EXISTS TO PREVENT. Two of three indexed lines finishing a point apart
     put their end labels at the same height, which is three numbers in three colours in one
     illegible pile, at exactly the end of the line a reader looks at first. */
  const s = M.spread([40, 41, 42], 11, 0, 200);
  ok('three labels a pixel apart are pushed to the gap',
    s[1] - s[0] >= 11 && s[2] - s[1] >= 11, JSON.stringify(s));
  ok('  and come back in the order they went in, so they keep their colours',
    s[0] < s[1] && s[1] < s[2], JSON.stringify(s));

  /* ORDER IN IS NOT ORDER UP. The caller zips these against a list of colours by index, so
     a function that returned them sorted would hand every label the wrong hue. */
  const mixed = M.spread([90, 40, 65], 11, 0, 200);
  ok('an unsorted list keeps its own order',
    mixed[0] > mixed[2] && mixed[2] > mixed[1], JSON.stringify(mixed));

  ok('labels that already fit are left alone', M.spread([20, 60, 100], 11, 0, 200).join()
    === '20,60,100', M.spread([20, 60, 100], 11, 0, 200).join());

  /* Pushing down must not push the last one out of the plot. */
  const low = M.spread([195, 196, 197], 11, 0, 200);
  ok('a stack near the floor is slid up rather than run off it',
    low.every((v) => v >= 0 && v <= 200), JSON.stringify(low));
  ok('  and still separated', low[1] - low[0] >= 11 && low[2] - low[1] >= 11);

  /* AND WHEN THEY CANNOT FIT, NOTHING. The legend already carries every name and its move,
     so no labels beats a pile of them. */
  ok('labels that cannot fit are refused rather than crammed',
    M.spread([10, 11, 12], 11, 0, 20) === null);
  ok('an empty list is an empty list', M.spread([], 11, 0, 100).length === 0);
}

head('change, and whether it is good news');
{
  const c = M.change(pts([50, 60, 40]));
  ok('change is measured end to end, not high to low', c.from === 50 && c.to === 40 && c.delta === -10,
    c.from + ' to ' + c.to);
  ok('  as a percentage of where it started', Math.round(c.pct) === -20, Math.round(c.pct) + '%');
  ok('a single point has no change to report', M.change(pts([50])).delta === 0);

  /* THE PART A CHART GETS WRONG BY DEFAULT: up is not the same question as good. */
  ok('standing rising is good news', M.tone(5, M.BY_ID.standing) === 'up');
  ok('standing falling is not', M.tone(-5, M.BY_ID.standing) === 'dn');
  ok('a lawsuit fuse rising is BAD news', M.tone(5, M.BY_ID.legal) === 'dn');
  ok('  and it falling is good', M.tone(-5, M.BY_ID.legal) === 'up');
  /* A bigger playoff is a choice, not a score, and the mode must not take a side in the
     argument the whole game is about. */
  ok('a bigger playoff is neither', M.tone(4, M.BY_ID.playoff) === '');
  ok('and neither is a bigger player share', M.tone(4, M.BY_ID.share) === '');
  ok('no move at all is neither', M.tone(0, M.BY_ID.standing) === '');
}

head('reading a series off a real term');
{
  let w = L.createWorld({ year: 2025, seed: 7 });
  M.record(w);
  for (let i = 0; i < 12; i++) {
    w.meters.standing = 60 - i;
    w.blocs.SEC = 52 + i;
    w = L.advance(w);
    M.record(w);
  }
  w.ratings = { 2025: { total: 900, perGame: 1.40, outsiders: 1, title: 22 },
                2026: { total: 940, perGame: 1.45, outsiders: 2, title: 24 } };

  const term = M.points(w, 'standing', 'term');
  ok('a term reads back every point on the tape', term.length === 13, term.length + ' points');
  ok('  in the order they happened', term[0].v > term[term.length - 1].v,
    term[0].v + ' down to ' + term[term.length - 1].v);

  const season = M.points(w, 'standing', 'season');
  ok('a season reads back only this year', season.length < term.length && season.length > 0,
    season.length + ' of ' + term.length);
  ok('  and every point in it is this year',
    season.every((p) => p.at.y === w.year), 'year ' + w.year);

  const yearly = M.points(w, 'perGame', 'term');
  ok('a yearly series reads off the ratings', yearly.length === 2, yearly.length + ' points');
  ok('  labelled by year, not by beat', yearly[0].at.y === 2025 && yearly[0].at.b === null);

  /* A SEASON THAT HAS NOT BEEN PLAYED HAS NO VIEWERSHIP, and plotting that as zero draws a
     collapse that did not happen. */
  w.ratings[2027] = { total: null, perGame: null, outsiders: 0, title: 0 };
  ok('a missing value is dropped rather than plotted as zero',
    M.points(w, 'perGame', 'term').length === 2,
    M.points(w, 'perGame', 'term').length + ' points from 3 years');

  ok('an unknown series id is empty rather than an exception',
    M.points(w, 'nonsense', 'term').length === 0);
}

head('the rulings on the line');
{
  /* The marks that make it a chart of a TERM rather than a chart of a number. Each one has
     to name the decision that actually produced the point it sits on. */
  let w = L.createWorld({ year: 2025, seed: 3 });
  M.record(w);
  w.history.push({ year: 2025, beat: 0, id: 'a', label: 'The first one' });
  w.meters.standing = 50; M.record(w);
  w.beat = 1; M.record(w);
  w.history.push({ year: 2025, beat: 1, id: 'b', label: 'The second one' });
  w.meters.standing = 44; M.record(w);

  const marks = M.rulings(w, 'term');
  ok('one mark per ruling, not one per row', marks.length === 2, marks.length + ' marks');
  ok('  each naming its own ruling',
    marks[0].label === 'The first one' && marks[1].label === 'The second one',
    marks.map((m) => m.label).join(' | '));
  /* The mark has to sit on the point the ruling produced, or the annotation points at the
     wrong moment and is worse than no annotation. */
  const line = M.points(w, 'standing', 'term');
  ok('  and sitting on the point that ruling produced',
    line[marks[1].x].v === 44, 'mark at x=' + marks[1].x + ' reads ' + line[marks[1].x].v);
  ok('a term with no rulings has no marks',
    M.rulings(L.createWorld({ year: 2025, seed: 1 }), 'term').length === 0);
}

head('the catalogue holds together');
{
  ok('every series has an id, a label and a group',
    M.SERIES.every((s) => s.id && s.label && s.group), M.SERIES.length + ' series');
  ok('  and every id is unique',
    Object.keys(M.BY_ID).length === M.SERIES.length, Object.keys(M.BY_ID).length + ' ids');
  ok('  and every one can be read without throwing', (() => {
    const row = M.sample(L.createWorld({ year: 2025, seed: 1 }));
    return M.SERIES.every((s) => { try { s.pick(row); return true; } catch (e) { return false; } });
  })());
  ok('  and says what it is, in a sentence', M.SERIES.every((s) => s.about && s.about.length > 20));
  ok('the nine blocs are all in it',
    M.SERIES.filter((s) => s.bloc).length === 9,
    M.SERIES.filter((s) => s.bloc).length + ' bloc series');
  /* A COLOUR PER SERIES, FIXED. A reader who learns viewership is the blue line must not
     have that repainted by changing what else is on screen. */
  ok('  and every series carries its own colour', M.SERIES.every((s) => /^#[0-9a-f]{6}$/i.test(s.color)));
  ok('  with the blocs keeping the colour the rest of the mode draws them in',
    M.BY_ID['bloc:SEC'].color === '#ef4444' && M.BY_ID['bloc:Fans'].color === '#38bdf8');
  ok('formatting a value uses the series own units',
    M.fmt(1.4, M.BY_ID.perGame) === '1.40M' && M.fmt(1.3, M.BY_ID.pool) === '$1.30B',
    M.fmt(1.4, M.BY_ID.perGame) + ' and ' + M.fmt(1.3, M.BY_ID.pool));
  ok('  and a change is signed', M.fmtDelta(-4, M.BY_ID.standing) === '−4'
    && M.fmtDelta(4, M.BY_ID.standing) === '+4',
    M.fmtDelta(-4, M.BY_ID.standing) + ' and ' + M.fmtDelta(4, M.BY_ID.standing));
  ok('a point knows where in the term it sits',
    M.whenOf({ y: 2027, b: 4 }, L.BEATS) === 'September, 2027',
    M.whenOf({ y: 2027, b: 4 }, L.BEATS));
  ok('  and a weekly one says which week', M.whenOf({ y: 2027, week: 6 }, L.BEATS) === 'Week 6, 2027');
}

console.log('');
if (bad) { console.log(bad + ' FAILED'); process.exit(1); }
console.log('all clear');
