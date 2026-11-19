/* The Arcade Lab's daily service, in memory, for the dev server and the
 * browser checks: the real handler (functions/_arcadelab/api.js) on the real
 * in-memory database, so a run is replayed by the real daily.js and a forged
 * score is refused exactly as the server refuses it. Nothing here is served
 * to anybody; it only answers a local page.
 *
 *   const fake = fakeArcade({ uidOf })      uidOf(headers) -> uid or null
 *   await fake.answer({ method, path, query, body, headers }) -> { status, body }
 *   fake.failNext = { status: 400, error: 'stale_day' }   the next run post fails so
 *   fake.posts                                           every run body posted */
import { handle } from '../../_arcadelab/api.js';
import { memoryDb } from '../../_arcadelab/db-memory.js';

export function fakeArcade(opts = {}) {
  const roles = { dev: 'tester', boss: 'admin', ...(opts.roles || {}) };
  const db = memoryDb({ roles, flags: { arcade_last_shot: 'testers', ...(opts.flags || {}) }, names: opts.names || {} });
  const fake = { db, failNext: null, posts: [], calls: [], uidOf: opts.uidOf || (() => null) };
  fake.answer = async ({ method, path, query, body, headers }) => {
    const h = headers || {};
    const uid = fake.uidOf(h);
    const g = String(h['x-arcade-guest'] || '').slice(0, 64);
    fake.calls.push({ method, path, guest: g, uid });
    if (method === 'POST' && /\/run$/.test(path)) {
      fake.posts.push(body);
      if (fake.failNext) { const f = fake.failNext; fake.failNext = null; return { status: f.status || 400, body: { error: f.error } }; }
    }
    return handle({ method, path, query: query || {}, body, uid, guestId: /^[A-Za-z0-9-]{8,64}$/.test(g) ? g : null }, { db, now: () => Date.now() });
  };
  return fake;
}
