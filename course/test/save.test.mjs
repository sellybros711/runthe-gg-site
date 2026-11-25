/* Save and load: the server route, the page's store, and the two together. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { CONFIG } from '../config.js';
import { MAP } from '../map.js';
import { newCourse, startShift, step, endShift, makeCtx, command } from '../sim.js';
import { makeBot } from '../bot.js';
import { createStore, KEY, QUEUE_MAX } from '../store.js';
import { handle, toCourse } from '../../functions/_course/api.js';
import { memoryDb } from '../../functions/_course/db-supabase.js';
import { cleanBatch, allowed, NO_EVENTS, EVENTS } from '../../functions/_course/events.js';
import { NO_EVENTS as LAST_SHOT_LIST } from '../../functions/_lastshot/events.js';

function play(course, debug) {
  const ctx = makeCtx(course, CONFIG, MAP), S = startShift(course, CONFIG, MAP), bot = makeBot();
  if (debug) command(S, 'cash', 500);
  while (!S.done) { bot(S, ctx); step(S, ctx); }
  return { end: endShift(S, ctx, course), log: S.log, debug: S.debug };
}
const mem = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), removeItem: k => m.delete(k), m }; };
/* A page's fetch, wired straight to the route's handler: no network. */
function wire(db, who, net = { up: true, calls: [] }) {
  return {
    net,
    fetchFn: async (url, o) => {
      if (!net.up) throw new Error('offline');
      const u = new URL(url, 'https://runthe.gg'), sub = u.pathname.replace('/api/course/', '');
      net.calls.push(o.method + ' ' + sub);
      const uid = (o.headers.Authorization || '').replace('Bearer token-', '') || null;
      const out = await handle({ method: o.method, sub, uid, query: Object.fromEntries(u.searchParams), body: o.body ? JSON.parse(o.body) : null }, db);
      return { status: out.status, json: async () => out.json };
    },
    auth: () => (who.id ? { token: 'token-' + who.id, userId: who.id } : null)
  };
}
function page(db, who, storage = mem(), seed = 5) {
  const w = wire(db, who);
  return { store: createStore({ cfg: CONFIG, map: MAP, storage, fetchFn: w.fetchFn, auth: w.auth, randomSeed: () => seed }), net: w.net, storage };
}

test('the route: a guest has no course on the server', async () => {
  const db = memoryDb();
  assert.equal((await handle({ method: 'GET', sub: 'state', uid: null, query: {} }, db)).status, 401);
  assert.equal((await handle({ method: 'POST', sub: 'shift', uid: null, body: {} }, db)).status, 401);
  assert.equal((await handle({ method: 'GET', sub: 'nope', uid: 'u1' }, db)).status, 404);
  assert.equal(db.writes, 0);
});

test('the route: the first visit makes the course, and it is the game\'s own new course', async () => {
  const db = memoryDb();
  const r = await handle({ method: 'GET', sub: 'state', uid: 'u1', query: { seed: '77' } }, db);
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.course, newCourse(CONFIG, MAP, 77));
  const again = await handle({ method: 'GET', sub: 'state', uid: 'u1', query: { seed: '99' } }, db);
  assert.equal(again.json.course.seed, 77, 'a second visit keeps the first seed');
  assert.equal(db.writes, 1, 'opening the game again writes nothing');
});

test('the route: a shift is re-run on the server and its own numbers are filed', async () => {
  const db = memoryDb();
  const course = (await handle({ method: 'GET', sub: 'state', uid: 'u1', query: { seed: '7' } }, db)).json.course;
  const { end, log } = play(course);
  /* the page lies about everything but the log: the server does not care */
  const r = await handle({ method: 'POST', sub: 'shift', uid: 'u1', body: { no: 1, v: CONFIG.version, checksum: 'deadbeef', log, cash: 999999 } }, db);
  assert.equal(r.status, 200);
  assert.equal(r.json.match, false);
  assert.deepEqual(r.json.course, end.course);
  assert.equal(db.courses.get('u1').cash, end.course.cash);
  assert.equal(db.shifts[0].verified, 'replay');
  const honest = await handle({ method: 'GET', sub: 'state', uid: 'u1', query: {} }, db);
  assert.deepEqual(honest.json.course, end.course, 'what comes back from the database is the same course');
});

test('the route: a resend, a skipped number, an old version, a debug log and garbage are all refused', async () => {
  const db = memoryDb();
  const course = (await handle({ method: 'GET', sub: 'state', uid: 'u1', query: { seed: '7' } }, db)).json.course;
  const { end, log } = play(course);
  const send = body => handle({ method: 'POST', sub: 'shift', uid: 'u1', body }, db);
  assert.equal((await send({ no: 2, v: CONFIG.version, log })).status, 409);
  assert.equal((await send({ no: 1, v: CONFIG.version + 1, log })).status, 400);
  assert.equal((await send({ no: 1, v: CONFIG.version, log: [[3, 'cash', 5000]] })).status, 400);
  assert.equal((await send({ no: 1, v: CONFIG.version, log: 'x' })).status, 400);
  assert.equal((await send(null)).status, 400);
  assert.equal(db.shifts.length, 0);
  assert.equal((await send({ no: 1, v: CONFIG.version, checksum: end.result.checksum, log })).json.match, true);
  const twice = await send({ no: 1, v: CONFIG.version, checksum: end.result.checksum, log });
  assert.equal(twice.status, 409);
  assert.deepEqual(twice.json.course, end.course, 'a resend answers with what is stored');
  assert.equal(db.shifts.length, 1, 'and files nothing');
});

test('the store: a guest plays on the device, and nothing is sent', async () => {
  const db = memoryDb(), who = { id: null }, p = page(db, who);
  assert.equal(await p.store.sync(), 'guest');
  const c0 = p.store.course(), a = play(c0);
  assert.equal(await p.store.finish(a.end, a.log, false), 'device');
  assert.deepEqual(p.store.course(), a.end.course);
  assert.equal(p.net.calls.length, 0);
  /* a refresh: the same course, from the device */
  const p2 = page(db, who, p.storage);
  assert.deepEqual(p2.store.course(), a.end.course);
});

test('the store: a guest who signs in keeps the course, filed shift by shift', async () => {
  const db = memoryDb(), who = { id: null }, p = page(db, who);
  let c = p.store.course();
  for (let i = 0; i < 3; i++) { const a = play(c); await p.store.finish(a.end, a.log, false); c = a.end.course; }
  who.id = 'u1';
  assert.equal(await p.store.sync(), 'saved');
  assert.equal(db.shifts.length, 3);
  assert.deepEqual(p.store.course(), c);
  assert.equal(p.store.pending(), 0);
  /* and a second device gets it */
  const other = page(db, who, mem(), 1234);
  assert.equal(await other.store.sync(), 'saved');
  assert.deepEqual(other.store.course(), c);
});

test('the store: an account that already has a course keeps it', async () => {
  const db = memoryDb(), who = { id: 'u1' }, first = page(db, who);
  await first.store.sync();
  const a = play(first.store.course());
  assert.equal(await first.store.finish(a.end, a.log, false), 'saved');
  const guest = { id: null }, p = page(db, guest, mem(), 999), g = play(p.store.course());
  await p.store.finish(g.end, g.log, false);
  guest.id = 'u1';
  await p.store.sync();
  assert.deepEqual(p.store.course(), a.end.course, 'the server copy wins');
  assert.equal(db.shifts.length, 1);
});

test('the store: a shift ended offline is kept and sent on the next load, once', async () => {
  const db = memoryDb(), who = { id: 'u1' }, p = page(db, who);
  await p.store.sync();
  const a = play(p.store.course());
  p.net.up = false;
  assert.equal(await p.store.finish(a.end, a.log, false), 'offline');
  assert.equal(p.store.pending(), 1);
  const p2 = page(db, who, p.storage);
  assert.equal(await p2.store.sync(), 'saved');
  assert.equal(db.shifts.length, 1);
  const before = p2.net.calls.length;
  assert.equal(await p2.store.sync(), 'saved');
  assert.deepEqual(p2.net.calls.slice(before), ['GET state'], 'a filed shift is never sent again');
});

test('the store: a second tab that filed the same day first is not a second day', async () => {
  const db = memoryDb(), who = { id: 'u1' }, storage = mem(), a = page(db, who, storage), b = page(db, who, mem());
  await a.store.sync(); await b.store.sync();
  const one = play(a.store.course()), two = play(b.store.course());
  await a.store.finish(one.end, one.log, false);
  assert.equal(await b.store.finish(two.end, two.log, false), 'server');
  assert.equal(db.shifts.length, 1);
  assert.deepEqual(b.store.course(), one.end.course);
});

test('the store: a debug day is never saved, and another account\'s copy is never used', async () => {
  const db = memoryDb(), who = { id: 'u1' }, p = page(db, who);
  await p.store.sync();
  const c0 = p.store.course(), d = play(c0, true);
  assert.equal(d.debug, true);
  assert.equal(await p.store.finish(d.end, d.log, true), 'debug');
  assert.deepEqual(p.store.course(), c0);
  assert.equal(db.shifts.length, 0);
  const a = play(c0); await p.store.finish(a.end, a.log, false);
  who.id = 'u2';
  await p.store.sync();
  assert.equal(p.store.course().shiftsFiled, 0, 'u2 starts a course of their own');
  assert.equal(db.courses.get('u2').shifts_filed, 0);
});

test('the store: garbage on the device is a new course, and a full queue stops being claimable', async () => {
  const storage = mem(); storage.setItem(KEY, '{not json');
  const p = page(memoryDb(), { id: null }, storage);
  assert.equal(p.store.course().shiftsFiled, 0);
  storage.setItem(KEY, JSON.stringify({ course: { schema: 99 }, queue: [] }));
  assert.equal(page(memoryDb(), { id: null }, storage).store.course().schema, CONFIG.schema);
  assert.ok(QUEUE_MAX >= 10);
});

test('the page sends a save only when a shift ends: no timer, no poll', () => {
  for (const f of ['store.js', 'main.js', 'analytics.js']) {
    const src = fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.equal(/setInterval/.test(src), false, f + ' has a timer');
  }
  const main = fs.readFileSync(new URL('../main.js', import.meta.url), 'utf8');
  assert.equal((main.match(/store\.finish\(/g) || []).length, 1, 'one place files a shift');
  assert.equal((main.match(/store\.sync\(/g) || []).length, 1, 'one place reads the account');
});

test('events: only known names and props are kept, and the consent list is the site\'s', () => {
  const b = cleanBatch({ s: 'abcdefgh12', d: 'device-12345', ev: [{ n: 'shift_end', t: 10, p: { no: 1, rounds: 3, cash: 60, evil: 'x', goal_met: true } },
    { n: 'nope', t: 1, p: {} }, { n: 'open', t: -4, p: {} }, { n: 'pad_buy', t: 5, p: { id: 'DROP TABLE' } }] });
  assert.deepEqual(b.rows.map(r => r.name), ['shift_end', 'pad_buy']);
  assert.deepEqual(b.rows[0].props, { no: 1, rounds: 3, cash: 60, goal_met: true });
  assert.deepEqual(b.rows[1].props, {});
  assert.equal(cleanBatch({ s: 'short', ev: [] }), null);
  assert.equal(cleanBatch(null), null);
  for (const n of Object.keys(EVENTS)) assert.match(n, /^[a-z_]{2,20}$/, 'supabase/170 only takes such a name');
  assert.deepEqual([...NO_EVENTS].sort(), [...LAST_SHOT_LIST].sort());
  assert.equal(allowed('DE'), false); assert.equal(allowed('US'), true); assert.equal(allowed(undefined), true);
});

test('events: the route stores a guest by device, nothing from a blocked country, and always answers 204', async () => {
  const db = memoryDb(), body = { s: 'abcdefgh12', d: 'device-12345', ev: [{ n: 'open', t: 1, p: { first: true } }] };
  assert.equal((await handle({ method: 'POST', sub: 'e', uid: null, body }, db)).status, 204);
  assert.equal(db.eventRows.length, 1); assert.equal(db.eventRows[0].device_id, 'device-12345'); assert.equal(db.eventRows[0].user_id, null);
  assert.equal((await handle({ method: 'POST', sub: 'e', uid: 'u1', body, country: 'FR' }, db)).status, 204);
  assert.equal(db.eventRows.length, 1);
  assert.equal((await handle({ method: 'POST', sub: 'e', uid: null, body: { ...body, d: undefined } }, db)).status, 204);
  assert.equal(db.eventRows.length, 1, 'no account and no device stores nothing');
  assert.deepEqual((await handle({ method: 'GET', sub: 'e', country: 'CH' }, db)).json, { on: false });
  assert.deepEqual((await handle({ method: 'GET', sub: 'e', country: 'US' }, db)).json, { on: true });
});

test('a database row reads back as the sim\'s course, whatever order its keys come in', () => {
  const row = { course: { state: { unlocks: { hole_4: 'clearing', cart_barn: 'done' }, reviews: [3.1] }, stars: '2.40', cash: '80', shifts_filed: 2, seed: 5, schema_version: 1, name: 'X', tier: 'muni' },
    holes: [{ ord: 1, par: 3, open: true, condition: { fairway: 60, green: 80 } }] };
  const c = toCourse(row);
  assert.equal(c.cash, 80); assert.equal(c.stars, 2.4); assert.deepEqual(c.holes[0], { ord: 1, par: 3, open: true, green: 80, fairway: 60 });
});
