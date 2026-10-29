import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as C from '../content/index.js';
import { get } from '../content/dataset.js';
import { handle } from '../api.js';
import { memoryDb } from '../db-memory.js';
import { pageGate } from '../gate.js';
import { GAMES, FLAGS } from '../registry.js';
import { seedFor, dateKey } from '../shared/seed.js';
import { play } from './bots.mjs';

C.setLookups(JSON.parse(fs.readFileSync(new URL('../../_stumpire/data/search_avg.json', import.meta.url), 'utf8')).values);
const W = C.whack, D = C.drop;
const mvp = () => W.draftPrompt(W.TEMPLATES.find(t => t.title === 'Hit every NBA MVP')).def;
const has = (rep, re) => rep.errors.some(e => re.test(e));

test('every drafted prompt and theme validates', () => {
  for (const t of W.TEMPLATES) { const { report } = W.draftPrompt(t); assert.ok(report.ok, t.title + ': ' + report.errors.join(' ')); }
  for (const t of D.STAT_THEMES) { const { report } = D.draftTheme(t); assert.ok(report.ok, t.title + ': ' + report.errors.join(' ')); }
});

test('the validator rejects a borderline decoy, and says why', () => {
  const add = id => { const d = mvp(); d.decoys = [...d.decoys, id]; return W.validatePrompt(d); };
  // a well known player with no awards on record looks like a hole in the data
  const r1 = add('nba-al-harrington-2000');
  assert.equal(r1.ok, false); assert.ok(has(r1, /Al Harrington.*borderline.*no awards/), r1.errors.join(' | '));
  // a player whose career began before the data is complete
  const d2 = mvp(); d2.query = { ...d2.query, years: [1980, 2025] }; d2.decoys = [...d2.decoys, 'nba-bill-sharman-1950'];
  const r2 = W.validatePrompt(d2);
  assert.ok(has(r2, /Bill Sharman.*borderline/), r2.errors.join(' | '));
  // a decoy who fits is a wrong card
  const r3 = add('nba-bob-cousy-1950');
  assert.ok(has(r3, /Bob Cousy.*fits the query/), r3.errors.join(' | '));
});

test('a decoy must be famous, retired, and plausible means the same position group', () => {
  const add = id => { const d = mvp(); d.decoys = [...d.decoys, id]; return W.validatePrompt(d); };
  // still active: a season the data does not have yet could make him a winner
  assert.ok(has(add('nba-anthony-edwards-2010'), /Anthony Edwards.*still active/));
  const cy = W.draftPrompt(W.TEMPLATES.find(t => t.title === 'Hit every Cy Young winner'));
  const sb = W.draftPrompt(W.TEMPLATES.find(t => t.title === 'Hit every Super Bowl MVP'));
  // a college name nobody knows as a pro is not a fair wrong answer
  const leak = { ...sb.def, decoys: [...sb.def.decoys, 'nfl-chris-leak-2000'] };
  assert.ok(has(W.validatePrompt(leak), /Chris Leak.*not famous enough/));
  // a pitcher is a real question for the Cy Young; a shortstop is not
  assert.ok(cy.report.plausible.includes('mlb-mariano-rivera-1990'));
  assert.ok(cy.def.decoys.includes('mlb-derek-jeter-1990') && !cy.report.plausible.includes('mlb-derek-jeter-1990'));
  // every draft keeps some famous players from elsewhere for the early rounds to ramp from
  const mlb = W.draftPrompt(W.TEMPLATES.find(t => t.title === 'Hit every MLB MVP'));
  assert.ok(mlb.report.counts.decoys > mlb.report.counts.plausible);
  // the AL MVPs the source index was missing (functions/_stumpire/data/fixes.json)
  assert.ok(get('mlb-ichiro-suzuki-2000').aw.includes('MLB MVP'));
  assert.ok(!mlb.def.decoys.includes('mlb-ichiro-suzuki-2000'));
});

test('a drop board value ships only when a second source agrees with it', () => {
  // the index has Chris Webber at 9,123 rebounds; Basketball-Reference has 8,124
  const th = D.STAT_THEMES.find(t => t.key === 'nba_rebounds');
  const { def } = D.draftTheme(th);
  const bad = { ...def, slots: def.slots.map((s, i) => i === 1 ? { ...s, id: 'nba-chris-webber-1990', label: 'Chris Webber', value: 9123 } : s) };
  const r = D.validateTheme(bad);
  assert.ok(r.errors.some(e => /Chris Webber.*not confirmed by a second source/.test(e)), r.errors.join(' | '));
  // and no draft, in any variant, uses a value the second source does not hold
  for (const t of D.STAT_THEMES) for (let v = 0; v < D.VARIANTS; v++) assert.ok(D.draftTheme(t, v).report.ok, t.key + ' v' + v);
});

test('the validator rejects a shared name, a stat filter and a wrong correct card', () => {
  const d = mvp(); d.query = { league: 'MLB', type: 'athlete', years: [1990, 2025], where: [{ k: 'award', v: 'MLB MVP' }] };
  d.correct = ['mlb-adam-jones-2000']; d.decoys = [];
  const r = W.validatePrompt(d);
  assert.ok(has(r, /not a MLB athlete|same name|does not fit/), r.errors.join(' | '));
  const s = W.validatePrompt({ id: 'x', title: 'Hit every 500 homer man', query: { league: 'MLB', type: 'athlete', years: [1950, 2025], where: [{ k: 'stat', v: 'mlb_hr', min: 500 }] }, correct: [], decoys: [] });
  assert.ok(has(s, /Coverage: stat/), s.errors.join(' | '));
  const n = mvp(); n.correct = [...n.correct, 'nba-al-jefferson-2000'];
  assert.ok(has(W.validatePrompt(n), /Al Jefferson.*does not fit/));
});

test('the theme validator rejects a wrong or unreadable value', () => {
  const { def } = D.draftTheme(D.STAT_THEMES[0]);
  assert.ok(D.validateTheme(def).ok);
  const wrong = JSON.parse(JSON.stringify(def)); wrong.slots[2].value += 1;
  assert.ok(has(D.validateTheme(wrong), /is wrong: the record says/));
  const odd = JSON.parse(JSON.stringify(def)); odd.slots[1].value = 12.5;
  assert.ok(has(D.validateTheme(odd), /not readable/));
  const label = JSON.parse(JSON.stringify(def)); label.slots[0].label = 'Somebody Else';
  assert.ok(has(D.validateTheme(label), /is not .*name/));
  const six = JSON.parse(JSON.stringify(def)); six.slots.pop();
  assert.ok(has(D.validateTheme(six), /exactly 7/));
});

/* ---- the API: publishing, playing a slate, reports, restarts ---- */
const T0 = Date.parse('2026-10-10T16:00:00Z'), DAY = dateKey(T0);
function setup() {
  const clock = { t: T0 };
  const db = memoryDb({ roles: { boss: 'admin', dev: 'tester', dev2: 'tester' }, names: { dev: 'devname', dev2: 'two' },
    flags: Object.fromEntries(FLAGS.map(f => [f, 'testers'])), now: () => clock.t });
  const ctx = { db, now: () => clock.t, content: async () => C };
  const call = (method, path, uid, body, query) => handle({ method, path, uid, body, query }, ctx);
  return { db, call };
}
async function publishWhack(call) {
  await call('POST', 'admin/draft', 'boss', { game: 'whack' });
  const ids = ['whack-hit-every-nba-mvp', 'whack-hit-every-nfl-mvp', 'whack-hit-every-cy-young-winner'];
  for (const id of ids) assert.equal((await call('POST', 'admin/status', 'boss', { id, status: 'approved' })).status, 200);
  return call('POST', 'admin/publish', 'boss', { game: 'whack', date: DAY, ids });
}

test('admin routes are admins only, and a draft cannot be published', async () => {
  const { call } = setup();
  for (const p of ['admin/prompts', 'admin/slates', 'admin/reports'])
    assert.equal((await call('GET', p, 'dev', null, { game: 'whack' })).status, 404, p);
  assert.equal((await call('POST', 'admin/draft', 'dev', { game: 'whack' })).status, 404);
  await call('POST', 'admin/draft', 'boss', { game: 'whack' });
  const r = await call('POST', 'admin/publish', 'boss', { game: 'whack', date: DAY, ids: ['whack-hit-every-nba-mvp', 'whack-hit-every-nfl-mvp', 'whack-hit-every-cy-young-winner'] });
  assert.equal(r.status, 422); assert.equal(r.body.error, 'not_approved');
});

test('a content game has no day until one is published, and a published day never changes', async () => {
  const { call, db } = setup();
  const t0 = (await call('GET', 'whack/today', 'dev')).body;
  assert.equal(t0.config, null);
  const seed = seedFor(DAY, 'whack');
  assert.equal((await call('POST', 'whack/run', 'dev', { mode: 'daily', dateKey: DAY, seed, inputs: [], score: 0, durationMs: 100000 })).body.error, 'no_slate');
  const pub = await publishWhack(call);
  assert.equal(pub.status, 200, JSON.stringify(pub.body));
  const before = JSON.stringify((await db.slate('whack', DAY)).payload);
  // editing a prompt afterwards changes nothing about the day
  const p = await db.prompt('whack-hit-every-nba-mvp');
  await call('POST', 'admin/prompts', 'boss', { game: 'whack', def: { ...p.def, title: 'Hit every NBA MVP (edited)' } });
  assert.equal(JSON.stringify((await db.slate('whack', DAY)).payload), before);
  assert.equal((await publishWhack(call)).status, 409, 'a day publishes once');
  assert.throws(() => { 'use strict'; db.slateRows[0].payload = {}; }, TypeError, 'the stored slate is frozen');
  const t1 = (await call('GET', 'whack/today', 'dev')).body;
  assert.equal(t1.config.rounds.length, 3);
  assert.ok(t1.config.rounds.every(r => r.cards.every(c => get(c.id) && typeof c.ok === 'boolean')));
});

test('a whack daily plays the published slate, is re-simulated, and takes a report', async () => {
  const { call, db } = setup();
  await publishWhack(call);
  const cfg = (await call('GET', 'whack/today', 'dev')).body.config, seed = seedFor(DAY, 'whack');
  const r = play('whack', seed, cfg, 9);
  const res = await call('POST', 'whack/run', 'dev', { mode: 'daily', dateKey: DAY, seed, inputs: r.log, score: r.score, durationMs: r.frames * 17 });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.result.score, r.score);
  const card = cfg.rounds[0].cards[0];
  const rep = await call('POST', 'whack/report', 'dev', { dateKey: DAY, promptId: cfg.rounds[0].promptId, athleteId: card.id, note: 'x' });
  assert.equal(rep.status, 200);
  assert.equal((await call('POST', 'whack/report', 'dev', { promptId: cfg.rounds[0].promptId, athleteId: 'nope' })).body.error, 'unknown_card');
  assert.equal(db.reportRows.length, 1);
  assert.equal((await call('GET', 'admin/reports', 'boss')).body.reports.length, 1);
});

test('drop board plays a published theme, with gems scaled to the day', async () => {
  const { call } = setup();
  await call('POST', 'admin/draft', 'boss', { game: 'drop-board' });
  assert.equal((await call('POST', 'admin/status', 'boss', { id: 'drop-mlb_hr', status: 'approved' })).status, 200);
  assert.equal((await call('POST', 'admin/publish', 'boss', { game: 'drop-board', date: DAY, ids: ['drop-mlb_hr'] })).status, 200);
  const cfg = (await call('GET', 'drop-board/today', 'dev')).body.config, seed = seedFor(DAY, 'drop-board');
  assert.equal(cfg.theme.slots.length, 7);
  const r = play('drop-board', seed, cfg, 4);
  const res = await call('POST', 'drop-board/run', 'dev', { mode: 'daily', dateKey: DAY, seed, inputs: r.log, score: r.score, durationMs: r.frames * 17 });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.ok(res.body.result.gems >= 5 && res.body.result.gems <= 15);
});

test('a restarted daily is scored but kept off the board', async () => {
  const { call } = setup();
  const seed = seedFor(DAY, 'hoop-shoot');
  await call('POST', 'hoop-shoot/start', 'dev', {});
  await call('POST', 'hoop-shoot/start', 'dev', {});          // a second fresh start: storage cleared, or another device
  await call('POST', 'hoop-shoot/start', 'dev2', {});
  const a = play('hoop-shoot', seed, null, 1), b = play('hoop-shoot', seed, null, 2);
  assert.equal((await call('POST', 'hoop-shoot/run', 'dev', { mode: 'daily', dateKey: DAY, seed, inputs: a.log, score: a.score, durationMs: a.frames * 17 })).status, 200);
  assert.equal((await call('POST', 'hoop-shoot/run', 'dev2', { mode: 'daily', dateKey: DAY, seed, inputs: b.log, score: b.score, durationMs: b.frames * 17 })).status, 200);
  const lb = (await call('GET', 'hoop-shoot/leaderboard', 'dev')).body;
  assert.equal(lb.total, 1); assert.deepEqual(lb.top.map(x => x.name), ['two']);
  assert.equal(lb.me.restarted, true); assert.equal(lb.me.rank, null);
});

test('the gate: every game page is testers only, the admin page is admins only', async () => {
  const { db } = setup();
  for (const g of Object.values(GAMES)) {
    assert.equal(await pageGate(g.id, 'nobody', db), null, g.id);
    assert.ok(await pageGate(g.id, 'dev', db), g.id);
    assert.ok(await pageGate('m/games/' + g.dir + '/client.js', 'dev', db), g.dir);
    assert.equal(await pageGate('m/games/' + g.dir + '/client.js', 'nobody', db), null, g.dir);
  }
  assert.equal(await pageGate('admin', 'dev', db), null, 'a tester does not get the admin page');
  assert.ok(await pageGate('admin', 'boss', db));
  assert.equal(await pageGate('m/content/whack.js', 'boss', db), null, 'the validator is never served');
});
