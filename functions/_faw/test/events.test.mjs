/* 4th and What's launch events: what the collector keeps.
 *
 *   node --test functions/_faw/test/events.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanBatch, sameOrigin, store, EVENTS, MAX_EVENTS } from '../events.js';

const D = 'dev-abcd1234', S = 'sess-abcd1234';

test('a batch keeps only known events, known props and good values', () => {
  const b = cleanBatch({ d: D, s: S, ev: [
    { n: 'open', t: 0, p: { first: true, entry: 'home', email: 'x@y.z' } },
    { n: 'snap', t: 9000, p: { mode: 'go', card: 'quick', win: true, outcome: 'down', shell: 'one', distance: 3, name: 'Stick' } },
    { n: 'snap', t: 9500, p: { mode: 'hacked', distance: 500 } },
    { n: 'nope', t: 1, p: {} },
    { n: 'share', t: -5, p: { kind: 'run' } }
  ] });
  assert.equal(b.device, D);
  assert.deepEqual(b.rows.map(r => r.name), ['open', 'snap', 'snap']);
  assert.deepEqual(b.rows[0].props, { first: true, entry: 'home' }, 'no stray keys, nothing personal');
  assert.deepEqual(b.rows[1].props, { mode: 'go', card: 'quick', win: true, outcome: 'down', shell: 'one', distance: 3 });
  assert.deepEqual(b.rows[2].props, {}, 'bad values are dropped');
  assert.ok(b.rows.every(r => r.session_id === S));
});

test('a bad body stores nothing; a batch is capped', () => {
  for (const bad of [null, 'x', {}, { d: 'no', s: S, ev: [] }, { d: D, s: 'bad id!', ev: [] }, { d: D, s: S, ev: 'x' }]) assert.equal(cleanBatch(bad), null);
  const many = cleanBatch({ d: D, s: S, ev: Array.from({ length: 100 }, (_, i) => ({ n: 'snap', t: i, p: {} })) });
  assert.equal(many.rows.length, MAX_EVENTS);
  assert.ok(Object.keys(EVENTS).every(n => /^[a-z_]{2,20}$/.test(n)), 'every name fits game_events');
});

test('another site cannot post; a store is one call to faw_events_add, and never throws', async () => {
  const req = (origin) => new Request('https://runthe.gg/api/faw/e', { method: 'POST', headers: origin ? { Origin: origin } : {} });
  assert.ok(sameOrigin(req('https://runthe.gg')) && sameOrigin(req(null)) && !sameOrigin(req('https://evil.example')));
  const calls = [];
  const env = { SUPABASE_URL: 'https://db.example/', SUPABASE_SERVICE_ROLE: 'k' };
  assert.equal(await store(env, cleanBatch({ d: D, s: S, ev: [{ n: 'open', t: 0, p: {} }] }), async (u, o) => { calls.push([u, JSON.parse(o.body)]); return { ok: true }; }), 1);
  assert.equal(calls[0][0], 'https://db.example/rest/v1/rpc/faw_events_add');
  assert.equal(calls[0][1].p_device, D);
  assert.equal(await store(env, cleanBatch({ d: D, s: S, ev: [{ n: 'open', t: 0 }] }), async () => { throw new Error('down'); }), 0);
  assert.equal(await store({}, cleanBatch({ d: D, s: S, ev: [{ n: 'open', t: 0 }] })), 0, 'no keys, no write');
});
