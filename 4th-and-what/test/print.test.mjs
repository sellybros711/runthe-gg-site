/* What a printed playbook says: the back of a card, the position quiz, the
 * flip, play numbers and wristband codes, situations, and the export's page
 * planning (which play lands where, the call sheet's boxes and its "if they,
 * then we" lines, the practice script). No browser, no canvas.
 *
 *   node --test 4th-and-what/test/print.test.mjs */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const C = require('../cards.js'), N = require('../names.js'), B = require('../book.js'), X = require('../export.js'), DG = require('../diagram.js'), FM = require('../formations.js');

const SNAG = { formation: 'gun3x1', moved: {}, blocks: [], handoff: null, targets: ['WR1', 'SLOT', 'WR2'],
  routes: [{ who: 'WR1', pts: [[-13.5, 1.5], [-9.5, 5.5]] }, { who: 'SLOT', pts: [[-9.5, 1], [-13.5, 3]] }, { who: 'WR2', pts: [[13.5, 12], [12.5, 10]] }] };
const POWER = { formation: 'iform', moved: {}, routes: [], blocks: [{ who: 'TE', to: [-1.5, -1] }], handoff: { to: 'RB', path: [[-1, -3], [-1.6, 0.5], [-1.8, 6]] }, targets: [] };
const SNEAK = { formation: 'uc12', moved: {}, routes: [], blocks: [], handoff: { to: 'QB', path: [[0, 4]] }, targets: [] };
const JET = { formation: 'gun3x1', moved: {}, blocks: [{ who: 'TE', to: [-5, 1] }], handoff: null, targets: ['WR2', 'RB'], playAction: true,
  motion: { who: 'WR2', pts: [[6, -1.5], [-2, -1.5]] },
  routes: [{ who: 'WR2', pts: [[-6, 2], [-12, 3]] }, { who: 'RB', pts: [[5, -3], [8, 1]] }] };
const line = (b, who) => b.lines.find(l => l.who === who).text;

test('the back: a line a player, the line, and the QB read in order', () => {
  const b = C.back(SNAG);
  assert.equal(line(b, 'X'), 'Slant at 2 yards');
  assert.equal(line(b, 'H'), 'Flat at 1 yard');
  assert.equal(line(b, 'Z'), 'Comeback at 12 yards');
  assert.equal(line(b, 'Y'), 'No assignment drawn');
  assert.deepEqual(b.lines.map(l => l.who), ['X', 'Z', 'H', 'Y', 'R']);
  assert.equal(b.line, 'Pass protect');
  assert.equal(b.qb, 'QB: 1 X slant, 2 H flat, 3 Z comeback. Pocket gone: check it down to the Z.');
});

test('the back of a run: the carrier says the run by name, a back leads', () => {
  const b = C.back(POWER);
  assert.equal(line(b, 'R'), 'Carries it on ' + N.suggest(POWER, { pattern: ['play'] }).name);
  assert.equal(line(b, 'R'), 'Carries it on Power Left');
  assert.equal(line(b, 'Y'), 'Leads on the run');
  assert.equal(b.line, 'Run block');
  assert.equal(b.qb, 'QB: hand it to the R.');
  /* the coach's own word for the run */
  assert.equal(line(C.back(POWER, { terms: { runs: [{ carrier: 'R', lead: 'yes', word: 'Dragon' }] } }), 'R'), 'Carries it on Dragon');
  assert.equal(C.back(SNEAK).qb, 'QB: keep it. Sneak.');
});

test('motion and play action on the back', () => {
  const b = C.back(JET);
  /* the route is read from where the motion ends, not where he lines up */
  assert.match(line(b, 'Z'), /^Jet motion, then /);
  assert.equal(line(b, 'Z'), 'Jet motion, then ' + C.routePhrase(require('../engine.js').routeName([-2, -1.5], JET.routes[0].pts), 2, false).replace(/^./, c => c.toLowerCase()));
  assert.match(line(b, 'R'), /^Fake, then /);
  assert.equal(line(b, 'Y'), 'Stays in to block');
  assert.match(b.qb, /^QB: fake to the R\. 1 Z /);
  assert.match(b.qb, /check it down to the R\.$/);
  /* a back with nothing drawn on play action still runs the fake */
  const pa = Object.assign({}, SNAG, { playAction: true });
  assert.equal(line(C.back(pa), 'R'), 'Runs the fake');
});

test('the back reads Test it results and the entry notes', () => {
  const entry = { name: 'Snag', notes: 'Throw it on time.', distance: 3, play: SNAG,
    stats: { 3: { test: { cover1: { n: 40, w: 10, yds: 0 }, cover2: { n: 40, w: 30, yds: 0 }, at: 'x' } } } };
  const b = C.back(entry);
  assert.equal(b.notes, 'Throw it on time.');
  assert.deepEqual(b.vs.map(v => [v.call, v.label, v.rate]), [['cover1', 'Cover 1', 25], ['cover2', 'Cover 2', 75]]);
  assert.deepEqual(C.back(SNAG, { stats: { cover3b: { n: 3, w: 1 } } }).vs.map(v => v.rate), [33]);
});

test('the quiz: the right answer is there, three wrong ones, the same every time', () => {
  for (const who of ['X', 'H', 'Z', 'R']) {
    const q = C.quiz(SNAG, who), again = C.quiz(SNAG, who);
    assert.deepEqual(q, again);
    assert.equal(q.question, 'What is your assignment?');
    assert.equal(q.choices.length, 4);
    assert.equal(new Set(q.choices).size, 4);
    assert.equal(q.choices[q.answer], line(C.back(SNAG), who));
  }
  assert.deepEqual(C.quiz(SNAG, 'WR1'), C.quiz(SNAG, 'X'));
  /* a different play can ask it differently */
  const other = C.quiz(C.flipPlay(SNAG), 'X');
  assert.equal(other.choices[other.answer], 'Slant at 2 yards');
});

test('flip: its own inverse, and the name flips side', () => {
  for (const p of [SNAG, POWER, JET, SNEAK]) {
    const once = C.flipPlay(p), twice = C.flipPlay(once);
    assert.deepEqual(C.flipPlay(twice), once);
    /* every spot comes back */
    const a = FM.place(p.formation, p.moved), b = FM.place(twice.formation, twice.moved);
    assert.deepEqual(b, a);
    assert.deepEqual(twice.routes, p.routes);
    assert.deepEqual(twice.blocks, p.blocks);
    if (p.handoff) assert.deepEqual(twice.handoff, p.handoff);
    if (p.motion) assert.deepEqual(twice.motion, p.motion);
  }
  assert.equal(N.suggest(SNAG, {}).name, 'Trips Left Slant Flat Comeback');
  assert.equal(N.suggest(C.flipPlay(SNAG), {}).name, 'Trips Right Slant Flat Comeback');
  assert.equal(N.suggest(C.flipPlay(POWER), {}).name, 'I Left Power Right');
  /* the moved spots are all written out, and a saved formation link goes */
  const f = C.flipPlay(Object.assign({}, SNAG, { customFormation: 'abc' }));
  assert.equal(f.customFormation, undefined);
  assert.deepEqual(Object.keys(f.moved).sort(), FM.EDITABLE.slice().sort());
  assert.equal(f.moved.WR1[0], 13.5);
});

test('defense letters and the front', () => {
  const O = FM.place('gun3x1', {}), D = FM.defense('gun3x1', {}, 5), L = DG.defenseLetters(D, O);
  const by = l => D.filter(d => L[d.id] === l);
  assert.equal(by('E').length, 2);
  assert.equal(by('T').length, 2);
  assert.equal(by('C').length, 2);
  /* trips left: the nickel to the strength is $, the weak backer is to the right */
  assert.equal(by('$').length, 1);
  assert.ok(by('$')[0].at[0] < 0);
  assert.equal(by('W').length, 1);
  assert.ok(by('W')[0].at[0] > by('M')[0].at[0]);
  assert.equal(by('F').length, 1);
  assert.equal(DG.frontName(D), 'Nickel 4-2-5');
  assert.equal(DG.vsLabel(D, 'cover3b'), 'vs Nickel 4-2-5 · Cover 3 blitz');
  assert.ok(D.every(d => L[d.id]));
});

test('play numbers: one each, never shared, the next on add', () => {
  const b = B.newBook('T');
  assert.equal(b.week, 1);
  for (let i = 0; i < 3; i++) b.plays.push(B.newPlay(b, SNAG, { distance: 2 }));
  assert.deepEqual(b.plays.map(p => p.num), [1, 2, 3]);
  /* an old book: no numbers, and two that clash */
  const old = { plays: [{ id: 'a' }, { id: 'b', num: 7 }, { id: 'c', num: 7 }, { id: 'd', num: 0 }, { id: 'e', num: 2 }] };
  B.ensureNumbers(old);
  const nums = old.plays.map(p => p.num);
  assert.equal(new Set(nums).size, nums.length);
  assert.equal(old.plays[1].num, 7);
  assert.equal(old.plays[4].num, 2);
  assert.ok(nums.every(n => Number.isInteger(n) && n >= 1));
  /* a deleted play's number is not handed out again */
  b.plays.splice(1, 1);
  assert.equal(B.newPlay(b, SNAG).num, 4);
});

test('situations, tags and the upgrade of an old book', () => {
  const b = B.newBook('T');
  assert.deepEqual(B.newPlay(b, SNAG, { distance: 2 }).situations, ['short']);
  assert.deepEqual(B.newPlay(b, SNAG, { distance: 5 }).situations, ['medium']);
  assert.deepEqual(B.newPlay(b, SNAG, { distance: 9 }).situations, ['long']);
  assert.equal(B.situationFor(3), 'short');
  assert.equal(B.situationFor(4), 'medium');
  assert.equal(B.situationFor(7), 'long');
  assert.deepEqual(B.SITUATION_KEYS, ['openers', 'first10', 'second-long', 'second-short', 'short', 'medium', 'long', 'redzone', 'goalline', 'twominute', 'backedup']);
  const e = B.newPlay(b, SNAG);
  assert.equal(e.fav, false);
  assert.equal(e.tag, null);
  assert.equal(B.tagOf(e), 'pass');
  assert.equal(B.tagOf({ play: POWER }), 'run');
  assert.equal(B.tagOf({ play: Object.assign({}, POWER, { targets: ['WR1'] }) }), 'rpo');
  assert.equal(B.tagOf({ play: SNAG, tag: 'special' }), 'special');
  const old = { name: 'Old', plays: [{ id: 'x', distance: 1, play: SNAG }, { id: 'y', distance: 8, play: POWER }] };
  B.upgrade(old);
  assert.equal(old.week, 1);
  assert.deepEqual(old.plays.map(p => [p.num, p.situations[0], p.fav, p.tag]), [[1, 'short', false, null], [2, 'long', false, null]]);
});

test('a playbook file keeps its numbers and situations', () => {
  const b = B.newBook('T'); b.week = 3;
  b.plays.push(B.newPlay(b, SNAG, { distance: 2, situations: ['redzone', 'short'], tag: 'pass', fav: true }));
  b.plays.push(B.newPlay(b, POWER, { distance: 1 }));
  b.plays[1].num = 1; /* a clash, as an old file might carry */
  const r = B.importFile(B.exportFile(b)).book;
  assert.equal(r.week, 3);
  assert.deepEqual(r.plays[0].situations, ['redzone', 'short']);
  assert.equal(r.plays[0].fav, true);
  assert.equal(r.plays[0].num, 1);
  assert.equal(r.plays[1].num, 2);
});

function bookOf(n, week) {
  const b = B.newBook('T'); b.week = week || 1;
  for (let i = 0; i < n; i++) { const e = B.newPlay(b, SNAG, { distance: 1 + (i % 9), name: 'P' + i }); e.id = 'id' + i; b.plays.push(e); }
  return b;
}

test('shuffled codes: unique, stable for a week, new the next week', () => {
  const b = bookOf(40), c1 = B.bandCodes(b), c2 = B.bandCodes(bookOf(40));
  assert.deepEqual(c1, c2);
  const vals = Object.values(c1);
  assert.equal(new Set(vals).size, 40);
  assert.ok(vals.every(v => /^\d{2}$/.test(v)));
  const next = B.bandCodes(bookOf(40, 2));
  assert.notDeepEqual(next, c1);
  assert.ok(Object.keys(c1).filter(k => c1[k] !== next[k]).length > 30);
  /* a bigger book takes three digits, still unique */
  const big = Object.values(B.bandCodes(bookOf(120)));
  assert.equal(new Set(big).size, 120);
  assert.ok(big.every(v => /^\d{3}$/.test(v)));
  /* the order of the book does not move a code */
  const r = bookOf(40); r.plays.reverse();
  assert.deepEqual(B.bandCodes(r), c1);
  /* the export uses them, on the band and, when asked, the call sheet */
  const items = X.pick(b, { codes: 'shuffled' });
  assert.ok(items.every(it => it.call === c1[it.entry.id] && it.code === c1[it.entry.id]));
  const band = X.planWristband(items, { bandColors: ['Blue', 'Red'] });
  assert.equal(band.bands[0][0].label, 'Blue ' + c1[items[0].entry.id]);
  assert.equal(band.bands[0][1].label, 'Red ' + c1[items[1].entry.id]);
  const sheet = X.planCallSheet(b, items, { callCodes: true });
  assert.equal(sheet[0].plays[0].label, c1[sheet[0].plays[0].item.entry.id]);
  /* not asked: the sheet keeps the play numbers */
  const plain = X.planCallSheet(b, items, {})[0].plays[0];
  assert.equal(plain.label, plain.item.number);
  assert.notEqual(plain.label, plain.item.code);
});

test('own numbers are the default, and every page plan agrees', () => {
  const b = bookOf(5); b.plays[0].num = 14;
  const items = X.pick(b, {});
  assert.equal(X.DEFAULTS.numbering, 'own');
  assert.equal(items[0].number, '14');
  assert.deepEqual(X.pick(b, { numbering: 'continuous' }).map(i => i.number), ['1', '2', '3', '4', '5']);
  assert.deepEqual(X.pick(b, { order: 'number' }).map(i => i.number), ['2', '3', '4', '5', '14']);
});

test('card pages, and duplex backs mirrored for a long edge flip', () => {
  const items = X.pick(bookOf(6), {});
  const p = X.planCards(items, { perPage: 4, backs: 'duplex' });
  assert.deepEqual(p.pages.map(g => g.kind), ['front', 'back', 'front', 'back']);
  assert.deepEqual([p.cols, p.rows], [2, 2]);
  const f = p.pages[0], bk = p.pages[1];
  f.cells.forEach((c, i) => {
    assert.equal(bk.cells[i].item, c.item);
    assert.equal(bk.cells[i].col, 1 - c.col);
    assert.equal(bk.cells[i].row, c.row);
  });
  assert.equal(p.pages[3].cells.length, 2);
  /* landscape flips the rows instead */
  const l = X.planCards(items, { perPage: 6, backs: 'duplex', landscape: true });
  assert.deepEqual([l.cols, l.rows], [3, 2]);
  l.pages[0].cells.forEach((c, i) => { assert.equal(l.pages[1].cells[i].row, 1 - c.row); assert.equal(l.pages[1].cells[i].col, c.col); });
  assert.deepEqual(X.planCards(items, { perPage: 4 }).pages.map(g => g.kind), ['front', 'front']);
});

test('the call sheet: boxes by situation in order, runs red and passes blue', () => {
  const b = B.newBook('T');
  const add = (name, play, distance, sits) => { const e = B.newPlay(b, play, { name, distance, situations: sits }); b.plays.push(e); return e; };
  add('Snag', SNAG, 2); add('Power', POWER, 1); add('Opener', SNAG, 5, ['openers', 'medium']); add('Long one', SNAG, 9);
  const boxes = X.planCallSheet(b, X.pick(b, {}), {});
  assert.deepEqual(boxes.map(x => x.key), ['openers', 'short', 'medium', 'long']);
  const short = boxes[1];
  assert.deepEqual(short.plays.map(r => [r.item.entry.name, r.tag, r.color]), [['Snag', 'pass', X.TAG_COLOR.pass], ['Power', 'run', X.TAG_COLOR.run]]);
  assert.equal(X.TAG_COLOR.run, '#c8392a');
  assert.equal(X.TAG_COLOR.pass, '#1f4fa8');
  /* by list: by section, as picked */
  assert.deepEqual(X.planCallSheet(b, X.pick(b, {}), { callBy: 'list' }).map(x => x.plays.length), [4]);
});

test('"if they, then we" picks the best tested play in the box', () => {
  const b = B.newBook('T');
  const add = (name, distance, test) => { const e = B.newPlay(b, SNAG, { name, distance }); if (test) e.stats[distance] = { test }; b.plays.push(e); return e; };
  add('Snag', 2, { cover2: { n: 100, w: 64, yds: 0 }, cover1: { n: 100, w: 20, yds: 0 }, at: 'x' });
  add('Stick', 3, { cover2: { n: 100, w: 50, yds: 0 }, cover1: { n: 100, w: 45, yds: 0 }, cover0: { n: 100, w: 30, yds: 0 }, at: 'x' });
  add('Untested', 1, null);
  /* tested at another distance only: it does not count in the short box */
  const far = add('Far', 2, null); far.stats[8] = { test: { cover2: { n: 100, w: 99, yds: 0 } } };
  const short = X.planCallSheet(b, X.pick(b, {}), {}).find(x => x.key === 'short');
  const by = Object.fromEntries(short.ifThen.map(t => [t.call, t]));
  assert.equal(by.cover2.item.entry.name, 'Snag');
  assert.equal(by.cover2.rate, 64);
  assert.equal(by.cover2.text, 'vs Cover 2: 1 Snag (64%)');
  assert.equal(by.cover1.item.entry.name, 'Stick');
  assert.equal(by.cover0.item.entry.name, 'Stick');
  assert.equal(by.cover3, undefined);
  assert.deepEqual(short.ifThen.map(t => t.call), ['cover0', 'cover1', 'cover2']);
  assert.deepEqual(X.planCallSheet(b, X.pick(b, {}), { callIfThen: false })[0].ifThen, []);
});

test('wristband sizes, and QB or player bands', () => {
  assert.deepEqual(X.bandSize(X.withDefaults({ bandSize: 'adult' })), [4.875, 2.75]);
  assert.deepEqual(X.bandSize(X.withDefaults({ bandSize: 'youth' })), [4.125, 2.5]);
  assert.deepEqual(X.bandSize(X.withDefaults({ bandSize: 'triple-large' })), [5.5, 3.5]);
  assert.deepEqual(X.bandSize(X.withDefaults({ bandSize: 'triple-small' })), [4, 2.5]);
  assert.deepEqual(X.bandSize(X.withDefaults({ bandSize: 'custom', bandW: 3, bandH: 2 })), [3, 2]);
  const items = X.pick(bookOf(10), {});
  assert.equal(X.planWristband(items, X.PRESETS['QB wristband']).text, false);
  assert.equal(X.planWristband(items, X.PRESETS['Player wristband']).text, true);
  const w = X.planWristband(items, { bandCols: 3, bandRows: 2, bandCopies: 2 });
  assert.equal(w.bands.length, 4);
  assert.equal(w.bands[0], w.bands[1]);
  assert.equal(w.bands[2][0].item, items[6]);
  assert.equal(w.bands[0][0].label, items[0].number);
});

test('the practice script: periods, hashes and looks', () => {
  const items = X.pick(bookOf(4), {});
  const s = X.planScript(items, { scriptReps: 7, periods: 3 });
  assert.deepEqual(s.periods.map(p => [p.title, p.rows.length]), [['Period 1', 3], ['Period 2', 3], ['Period 3', 1]]);
  const rows = s.periods.flatMap(p => p.rows);
  assert.deepEqual(rows.map(r => r.hash).join(''), 'LMRLMRL');
  assert.deepEqual(rows.map(r => r.call), ['cover0', 'cover1', 'cover1b', 'cover2', 'cover2b', 'cover3', 'cover3b']);
  assert.equal(rows[4].item, items[0]);
  const fixed = X.planScript(items, { scriptHash: 'R', scriptCall: 'cover2' }).periods[0].rows;
  assert.ok(fixed.every(r => r.hash === 'R' && r.call === 'cover2'));
  const r1 = X.planScript(items, { scriptCall: 'random', scriptSeed: 9, scriptReps: 12, scriptCalls: ['cover1', 'cover3'] });
  assert.deepEqual(r1, X.planScript(items, { scriptCall: 'random', scriptSeed: 9, scriptReps: 12, scriptCalls: ['cover1', 'cover3'] }));
  assert.ok(r1.periods[0].rows.every(r => r.call === 'cover1' || r.call === 'cover3'));
  assert.equal(X.planScript(items, { periodNames: ['Team'] }).periods[0].title, 'Team');
});

test('scout cards and the install packet', () => {
  const b = bookOf(3); b.sections.push({ id: 's2', name: 'Runs' }); b.plays[1].section = 's2';
  const items = X.pick(b, {});
  assert.equal(X.planScout(items, {}).length, 21);
  assert.deepEqual(X.planScout(items, { scoutCall: 'cover3' }).map(s => s.title), ['Cover 3', 'Cover 3', 'Cover 3']);
  const ins = X.planInstall(b, items, {});
  assert.deepEqual(ins.days.map(d => [d.title, d.items.length]), [['Day 1: Plays', 2], ['Day 2: Runs', 1]]);
  assert.equal(ins.cards.pages.every(p => p.kind === 'front'), true);
  assert.deepEqual(Object.keys(X.PRESETS), ['Play cards', 'Call sheet', 'QB wristband', 'Player wristband', 'Scout cards', 'Practice script', 'Install packet']);
  Object.values(X.PRESETS).forEach(p => Object.keys(p).forEach(k => assert.ok(k in X.DEFAULTS, k + ' is in DEFAULTS')));
  assert.equal(X.plan(b, X.PRESETS['Install packet']).layout, 'install');
});
