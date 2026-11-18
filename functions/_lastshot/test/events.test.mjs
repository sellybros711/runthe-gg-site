/* The tester round's events and report (Phase 4).
 *   - only known events, only their props, only small clean values are kept
 *   - POST /last-shot/e takes any account, or a guest with a device id (launched)
 *   - the account is the gate's, never the body's
 *   - a store error never surfaces (still 204)
 *   - /last-shot/report is for admins only and marks each target met or not */
import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanBatch, EVENTS, MAX_EVENTS } from '../events.js';
import { roundGate, pageGate, PUBLIC_EVENTS } from '../gate.js';
import { memoryDb } from '../db-supabase.js';
import { renderReport, rangeOf, TARGETS } from '../report.js';

const S = 'sess-1234abcd';
const NOW = Date.parse('2026-11-14T17:00:00Z');

test('a batch keeps only known events, known props and clean values', () => {
  const rows = cleanBatch({ s: S, ev: [
    { n: 'open', t: 5, p: { first: true, entry: 'home', email: 'x@y.z' } },
    { n: 'run', t: 900, p: { mode: 'level', level: '2-4', n: 1, seed: 99 } },
    { n: 'result', t: 4000, p: { mode: 'free', outcome: 'win', how: 'make', stars: 3, look: 0.6789 } },
    { n: 'result', t: 4100, p: { outcome: 'maybe', stars: 9, level: '9-9', how: 'DROP TABLE' } },
    { n: 'hack', t: 1, p: {} },
    { n: 'run', t: -1 },
    { n: 'run', t: 1.5 },
    { n: 'share', t: 10, p: { kind: 'result', note: 'x'.repeat(700) } },
    null, 'run'
  ] });
  assert.deepEqual(rows.map(r => r.name), ['open', 'run', 'result', 'result']);
  assert.deepEqual(rows[0].props, { first: true, entry: 'home' }, 'no stray keys, ever');
  assert.deepEqual(rows[1].props, { mode: 'level', level: '2-4', n: 1 });
  assert.equal(rows[2].props.look, 0.68);
  assert.deepEqual(rows[3].props, {}, 'bad values dropped, the event kept');
  assert.ok(rows.every(r => r.session_id === S && Number.isInteger(r.client_ms)));
  assert.deepEqual(cleanBatch({ s: 'bad id!', ev: [{ n: 'open', t: 1 }] }), []);
  assert.deepEqual(cleanBatch({ s: S }), []);
  assert.deepEqual(cleanBatch(null), []);
  assert.equal(cleanBatch({ s: S, ev: Array.from({ length: 100 }, () => ({ n: 'run', t: 1 })) }).length, MAX_EVENTS);
  assert.ok(Object.keys(EVENTS).length === 10);
});

test('POST /last-shot/e: any account, the account from the gate', async () => {
  const db = memoryDb({ t: 'tester', a: 'admin' });
  const body = { s: S, ev: [{ n: 'open', t: 1, p: { first: true } }], user_id: 'someone-else' };
  for (const uid of ['t', 'a', 'nobody']) assert.equal((await roundGate({ method: 'POST', sub: 'e', uid, body, nowMs: NOW }, db)).status, 204, uid);
  assert.deepEqual(db.events.map(e => e.user_id), ['t', 'a', 'nobody'], 'the account is the cookie\'s, never the body\'s');
  assert.ok(db.events.every(e => e.game === 'last-shot' && e.name === 'open'));
  assert.equal(await roundGate({ method: 'POST', sub: 'e', uid: null, body, nowMs: NOW }, db), null, 'no account and no device id: refused');
  assert.equal(await roundGate({ method: 'GET', sub: 'e', uid: 't', nowMs: NOW }, db), null, 'GET is not a route');
  const broken = { async role() { return 'tester'; }, async insertEvents() { throw new Error('down'); } };
  assert.equal((await roundGate({ method: 'POST', sub: 'e', uid: 't', body, nowMs: NOW }, broken)).status, 204, 'a store error never surfaces');
  const down = { async role() { throw new Error('down'); } };
  assert.equal(await roundGate({ method: 'POST', sub: 'e', uid: 't', body, nowMs: NOW, publicEvents: false }, down), null, 'off, a role error is a refusal');
  assert.equal(await roundGate({ method: 'GET', sub: 'report', uid: 'a', nowMs: NOW }, down), null, 'a role error refuses the report');
  assert.equal(await roundGate({ method: 'GET', sub: '', uid: 't', nowMs: NOW }, db), undefined, 'the page is not a round route');
  assert.equal(pageGate('e'), null, 'the page gate never serves the event route');
  assert.equal(pageGate('report'), null, 'nor the report');
});

test('GET /last-shot/report: admins only, the targets marked met or not', async () => {
  let asked = null;
  const R = { new_players: 24, first_run_median_s: 14.2, first_run_never: 1, ran: 23, win_in_5: 0.652, sessions: 40, tries_per_session: 5, tries_mean: 6.1,
    day1_eligible: 20, day1_return: 0.3, events: 900, funnel: { open: 24, run: 23, save: 4 } };
  const db = memoryDb({ t: 'tester', a: 'admin' }, (game, since, until, ex) => { asked = { game, since, until, ex }; return R; });
  assert.equal(await roundGate({ method: 'GET', sub: 'report', uid: 't', query: {}, nowMs: NOW }, db), null, 'a tester gets the 404');
  assert.equal(await roundGate({ method: 'GET', sub: 'report', uid: null, query: {}, nowMs: NOW }, db), null);
  const out = await roundGate({ method: 'GET', sub: 'report', uid: 'a', query: {}, nowMs: NOW }, db);
  assert.equal(out.status, 200);
  assert.deepEqual(asked, { game: 'last-shot', since: '2026-11-01T00:00:00-05:00', until: '2026-11-15T00:00:00-05:00', ex: true }, 'the last 14 days, admins out');
  assert.match(out.body, /3 of 4 targets met/);
  assert.match(out.body, /14\.2 s/); assert.match(out.body, /65%/); assert.match(out.body, /30%/);
  assert.match(out.body, /Goal: 6 or more · not yet/);
  assert.match(out.body, /noindex/);
  const DASH = new RegExp('[' + String.fromCharCode(0x2013, 0x2014) + ']');
  assert.ok(!DASH.test(out.body), 'no dashes');
  await roundGate({ method: 'GET', sub: 'report', uid: 'a', query: { since: '2026-11-03', until: '2026-11-10', admins: '1' }, nowMs: NOW }, db);
  assert.deepEqual(asked, { game: 'last-shot', since: '2026-11-03T00:00:00-05:00', until: '2026-11-10T00:00:00-05:00', ex: false });
  await roundGate({ method: 'GET', sub: 'report', uid: 'a', query: { since: "'; drop", until: 'x' }, nowMs: NOW }, db);
  assert.equal(asked.since, '2026-11-01T00:00:00-05:00', 'a bad date falls back');
  assert.match(renderReport(null, rangeOf({}, NOW)), /could not be read/);
  assert.equal(TARGETS[0].show(2147483.6), 'never');
});

test('guests: launched, a guest counts by the device; the report stays admins only', async () => {
  assert.equal(PUBLIC_EVENTS, true, 'the launch turned guests on');
  const db = memoryDb({ t: 'tester' });
  const body = { s: S, d: 'dev-abcd1234', ev: [{ n: 'open', t: 1, p: { first: true } }] };
  await roundGate({ method: 'POST', sub: 'e', uid: 't', body, nowMs: NOW }, db);
  assert.deepEqual(db.events.map(e => [e.user_id, e.device_id]), [['t', 'dev-abcd1234']], 'a tester row carries the account and the device');
  assert.equal((await roundGate({ method: 'POST', sub: 'e', uid: null, body, nowMs: NOW }, db)).status, 204, 'a guest is let in');
  assert.deepEqual(db.events.slice(-1).map(e => [e.user_id, e.device_id]), [[null, 'dev-abcd1234']]);
  assert.equal(await roundGate({ method: 'POST', sub: 'e', uid: null, body: { ...body, d: 'bad id!' }, nowMs: NOW }, db), null, 'a guest needs a good device id');
  assert.equal(await roundGate({ method: 'POST', sub: 'e', uid: null, body: { s: S, ev: body.ev }, nowMs: NOW }, db), null, 'and a guest with no device id is refused');
  assert.equal((await roundGate({ method: 'POST', sub: 'e', uid: 'stranger', body, nowMs: NOW }, db)).status, 204, 'a signed in player counts by the account');
  assert.deepEqual(db.events.slice(-1).map(e => [e.user_id, e.device_id]), [['stranger', 'dev-abcd1234']]);
  const down = { ...db, async role() { throw new Error('down'); } };
  assert.equal((await roundGate({ method: 'POST', sub: 'e', uid: 'stranger', body, nowMs: NOW }, down)).status, 204, 'events never wait on the tester list');
  assert.equal(await roundGate({ method: 'GET', sub: 'e', uid: null, body, nowMs: NOW }, db), null, 'only a POST');
  for (const uid of [null, 'stranger', 't']) assert.equal(await roundGate({ method: 'GET', sub: 'report', uid, query: {}, nowMs: NOW }, db), null, 'the report stays admins only: ' + uid);
  /* the switch still works the old way if it is ever turned off */
  const closed = { method: 'POST', sub: 'e', body, nowMs: NOW, publicEvents: false };
  assert.equal(await roundGate({ ...closed, uid: null }, db), null, 'off: a guest is refused');
  assert.equal(await roundGate({ ...closed, uid: 'stranger' }, db), null, 'off: so is a signed in non tester');
  assert.equal((await roundGate({ ...closed, uid: 't' }, db)).status, 204, 'off: a tester still counts');
});

test('until 175 has run, a tester\'s rows still land in 170\'s table', async () => {
  const { supabaseDb } = await import('../db-supabase.js');
  const real = globalThis.fetch, calls = [];
  globalThis.fetch = async (u, o) => { calls.push(String(u).replace('https://db.test/rest/v1/', '')); return new Response('', { status: String(u).includes('rpc/') ? 404 : 201 }); };
  try {
    const db = supabaseDb({ SUPABASE_URL: 'https://db.test', SUPABASE_SERVICE_ROLE: 'k' });
    await db.insertEvents('t', 'dev-abcd1234', [{ name: 'open', session_id: S, client_ms: 1, props: {} }]);
    assert.deepEqual(calls, ['rpc/last_shot_events_add', 'game_events']);
    calls.length = 0;
    await assert.rejects(db.insertEvents(null, 'dev-abcd1234', [{ name: 'open', session_id: S, client_ms: 1, props: {} }]));
    assert.deepEqual(calls, ['rpc/last_shot_events_add'], 'a guest row needs 175; it is not forced into 170');
  } finally { globalThis.fetch = real; }
});
