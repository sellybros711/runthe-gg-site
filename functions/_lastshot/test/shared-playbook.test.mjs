/* /assets/playbook.js, the plumbing 4th and What and Last Shot share. These
 * hold both games' shapes: Last Shot's sets and situations, 4th and What's
 * levels, formations, own numbers and wristband codes. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const PB = require('../../../assets/playbook.js');

test('the model: a book, a play, extra fields, limits', () => {
  const b = PB.newBook('x'.repeat(99), { formations: [] });
  assert.equal(b.name.length, PB.LIMITS.book);
  assert.deepEqual(b.formations, []);
  assert.equal(b.sections.length, 1);
  const p = PB.newPlay(b, { a: 1 }, { name: 'Trips Snag' }, { distance: 4, num: 7 });
  assert.equal(p.section, b.sections[0].id);
  assert.equal(p.distance, 4); assert.equal(p.num, 7);
  assert.equal(PB.newPlay(b, {}, { name: 'y'.repeat(99), limits: { play: 20 } }).name.length, 20);
});

test('stats: a field per game, and a bucket per level', () => {
  const e = { stats: {} };
  PB.countRun(e, '22.0/O1', 'over', true, 'byScheme');
  PB.countRun(e, 4, 'cover2', false, 'byCall', 'college');
  PB.countRun(e, 4, 'cover2', true, 'byCall', 'college');
  assert.deepEqual(e.stats['22.0/O1'].byScheme.over, { n: 1, w: 1 });
  assert.deepEqual(e.statsBy.college[4].byCall.cover2, { n: 2, w: 1 });
  assert.equal(PB.statsOf(e), e.stats);
  assert.equal(PB.statsOf(e, 'college'), e.statsBy.college);
  assert.deepEqual(PB.totals(e.statsBy.college[4].byCall), { n: 2, w: 1 });
});

test('the file: fresh ids, sections remapped, a list remapped, game fields only through hooks', () => {
  const book = { id: 'b1', name: 'Varsity', team: 'Hawks', level: 'hs', sections: [{ id: 's1', name: 'Base' }, { id: 's2', name: 'Red zone' }],
    formations: [{ id: 'f1', name: 'Bunch', base: 'gun3x1' }, { id: 'bad' }],
    plays: [{ id: 'p1', name: 'Snag', section: 's2', play: { formation: 'gun3x1', customFormation: 'f1' }, num: 12, secret: 'x' },
      { id: 'p2', name: 'Junk', section: 's1' }] };
  const file = PB.exportFile(book, { preset: 'tree' }, { format: 'fmt-a' });
  const r = PB.importFile(file, {
    format: 'fmt-a', label: 'Test',
    keepPlay: p => !!(p && p.play),
    lists: { formations: f => (f.base ? { name: f.name, base: f.base } : null) },
    mapPlay: (src, base) => Object.assign(base, { num: src.num }),
    mapBook: (src, base) => Object.assign(base, { level: src.level }),
    afterImport: (b, maps) => { b.plays.forEach(p => { if (p.play.customFormation) p.play.customFormation = maps.formations[p.play.customFormation]; }); b.upgraded = true; return b; }
  });
  const b = r.book;
  assert.notEqual(b.id, 'b1');
  assert.equal(b.plays.length, 1, 'keepPlay drops a play with no drawing');
  assert.equal(b.formations.length, 1, 'a list item the fix rejects is dropped');
  assert.notEqual(b.formations[0].id, 'f1');
  assert.equal(b.plays[0].play.customFormation, b.formations[0].id, 'afterImport remaps the reference');
  assert.equal(b.plays[0].section, b.sections[1].id);
  assert.equal(b.plays[0].num, 12, 'mapPlay copies the game field');
  assert.equal(b.plays[0].secret, undefined, 'nothing else comes across');
  assert.equal(b.level, 'hs'); assert.equal(b.upgraded, true);
  assert.equal(r.terms.preset, 'tree');
  assert.throws(() => PB.importFile(file, { format: 'fmt-b', label: 'Other' }), /not a Other playbook file/);
});

const BOOK = { sections: [{ id: 'a', name: 'Base' }, { id: 'b', name: 'Late' }], plays: [
  { id: 'p1', name: 'Zed', section: 'b', num: 30 }, { id: 'p2', name: 'Alpha', section: 'a', num: 10 },
  { id: 'p3', name: 'Mid', section: 'b' }, { id: 'p4', name: 'Beta', section: 'a', num: 10 }] };

test('pick: order, numbering, sectionId', () => {
  const ids = l => l.map(i => i.entry.id).join(' ');
  assert.equal(ids(PB.pick(BOOK, { order: 'book' })), 'p1 p2 p3 p4');
  assert.equal(ids(PB.pick(BOOK, { order: 'section' })), 'p2 p4 p1 p3');
  assert.equal(ids(PB.pick(BOOK, { order: 'name' })), 'p2 p4 p3 p1');
  assert.equal(ids(PB.pick(BOOK, { order: 'number' })), 'p2 p4 p1 p3', 'by num, ties in book order, no num last');
  assert.deepEqual(PB.pick(BOOK, { numbering: 'continuous', startAt: 5 }).map(i => i.number), ['5', '6', '7', '8']);
  assert.deepEqual(PB.pick(BOOK, { numbering: 'section', order: 'section' }).map(i => i.number), ['101', '102', '201', '202']);
  assert.deepEqual(PB.pick(BOOK, { numbering: 'own', startAt: 1 }).map(i => i.number), ['30', '10', '3', '10']);
  assert.deepEqual(PB.pick(BOOK, { numbering: 'none' }).map(i => i.number), ['', '', '', '']);
  const it = PB.pick(BOOK, { plays: 'sections', sections: ['b'] });
  assert.deepEqual(it.map(i => [i.sectionId, i.section]), [['b', 'Late'], ['b', 'Late']]);
  assert.equal(ids(PB.pick(BOOK, { plays: 'chosen', chosen: ['p3'] })), 'p3');
});

test('pick: shuffled codes and decorate', () => {
  const l = PB.pick(BOOK, { codes: 'shuffled', numbering: 'continuous' }, { codesFn: () => ({ p1: '47', p3: '12' }), decorate: (i, p) => Object.assign(i, { tag: p.name[0] }) });
  assert.deepEqual(l.map(i => i.call), ['47', '2', '12', '4']);
  assert.deepEqual(l.map(i => i.tag), ['Z', 'A', 'M', 'B']);
  assert.ok(PB.pick(BOOK, { numbering: 'continuous' }).every(i => i.call === i.number && i.code === ''));
});

/* a canvas that records what is drawn, enough for page() and footer() */
function fakeDoc() {
  const calls = [];
  const ctx = { calls, fillRect() {}, fillText(t) { calls.push(t); }, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, save() {}, restore() {}, measureText: t => ({ width: t.length * 5 }) };
  return { createElement: () => { const c = { width: 0, height: 0, getContext: () => ctx }; ctx.canvas = c; return c; }, calls };
}

test('page and footer: the header, the area, footRoom, page numbers and a game legend', () => {
  const doc = fakeDoc(); globalThis.document = doc;
  try {
    const opt = { paper: 'letter', landscape: false, margin: 0.5, dpi: 100, title: 'Late Game', team: 'Hawks', date: '', pageNumbers: true };
    const a = PB.page(opt), b = PB.page(opt, { footRoom: 0.5 }), c = PB.page(opt, { footRoom: o => (o.pageNumbers ? 0.3 : 0) });
    assert.equal(a.canvas.width, 850); assert.equal(a.canvas.height, 1100);
    assert.deepEqual(a.canvas.inches, [8.5, 11]);
    assert.ok(doc.calls.includes('Late Game') && doc.calls.includes('Hawks'));
    assert.equal(Math.round(a.area.h - b.area.h), 35, 'footRoom in inches comes off the area');
    assert.equal(Math.round(a.area.h - c.area.h), 15, 'or from a function');
    assert.equal(PB.page({ ...opt, landscape: true }).canvas.width, 1100);
    let legend = null;
    const f = PB.page(opt);
    PB.footer(f.ctx, opt, 2, 5, (ctx, rect) => { legend = rect; });
    assert.ok(doc.calls.includes('Page 2 of 5'));
    assert.ok(legend && legend.w === 750);
  } finally { delete globalThis.document; }
});

test('terminology helpers: the most specific rule, the biggest first', () => {
  const rules = [{ w: 'a', s: 1 }, { w: 'b', s: 3 }, { w: 'c', s: 3 }, { w: 'd', s: -1 }];
  assert.equal(PB.bestRule({}, rules, r => r.s).w, 'b', 'ties go to the rule written first');
  assert.equal(PB.bestRule({}, [{ s: -1 }], r => r.s), null);
  assert.deepEqual(PB.biggestFirst([{ n: 1 }, { n: 3 }, { n: 2 }, { n: 3 }], r => r.n).map(r => r.n), [3, 3, 2, 1]);
});

test('the store: local first, the cloud behind it, rev conflicts, the cap', async () => {
  const mem = {}, ls = {};
  globalThis.localStorage = { getItem: k => ls[k] ?? null, setItem: (k, v) => { ls[k] = v; } };
  globalThis.RTG_AUTH = { state: () => ({ signedIn: true, userId: 'u1' }) };
  globalThis.RTG_SAVE = {
    all: g => Promise.resolve(Object.keys(mem).filter(k => k.startsWith(g + '/')).map(k => ({ slot: k.split('/')[1], progress: mem[k].progress, payload: JSON.parse(JSON.stringify(mem[k].payload)) }))),
    queue: (g, sl, fn) => { const m = fn(); const k = g + '/' + sl; if (!m) return Promise.resolve(null); if (mem[k] && mem[k].progress > m.progress) return Promise.resolve({ ok: false, payload: mem[k].payload }); mem[k] = { progress: m.progress, payload: JSON.parse(JSON.stringify(m.payload)) }; return Promise.resolve({ ok: true }); },
    drop: (g, sl) => { delete mem[g + '/' + sl]; return Promise.resolve(null); } };
  try {
    let remote = 0;
    const S = PB.createStore({ game: 'g', prefix: 'g_pb_', maxBytes: 4000, onRemote: () => remote++ });
    await S.open();
    const b = PB.newBook('One');
    assert.ok(S.put(b));
    await new Promise(r => setTimeout(r, 0));
    assert.ok(mem['g/b-' + b.id] && mem['g/index'], 'the book and the index reach the cloud');
    assert.ok(ls['g_pb_u1'], 'and the local copy, under the account');
    // another device saved a newer copy: ours is refused and replaced
    mem['g/b-' + b.id] = { progress: 99, payload: Object.assign({}, b, { name: 'From the phone', rev: 99 }) };
    S.put(b); await new Promise(r => setTimeout(r, 0));
    assert.equal(S.book(b.id).name, 'From the phone'); assert.equal(remote, 1);
    // a book over the cap is refused
    const big = PB.newBook('Big'); big.plays = Array.from({ length: 200 }, (_, i) => ({ id: 'x' + i, name: 'play ' + i }));
    assert.equal(S.put(big), null);
    S.remove(b.id); await new Promise(r => setTimeout(r, 0));
    assert.ok(!mem['g/b-' + b.id], 'remove drops the slot');
  } finally { delete globalThis.localStorage; delete globalThis.RTG_AUTH; delete globalThis.RTG_SAVE; }
});
