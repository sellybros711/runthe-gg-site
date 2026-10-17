/* The world's API, behind the same gate as its page.
 *
 *   GET me      with the player's Supabase token: 200 and the page cookie for a tester, else 404
 *   GET world   with the page cookie: every game, its status, landmark and districts
 *   GET ideas   with the page cookie: the Advisor Agent's suggestions, newest week first
 *   GET agents  with the page cookie: every agent, what it is doing, where, and its open PRs
 *   GET agent   ?id=<agent>: its last few runs, from its log in the vault
 *   GET tasks   with the page cookie: tasks waiting for the dispatcher, and what it delivered
 *   POST task   with the page cookie: { agent, text, game, layer } queued for that agent's chat
 *
 * Anybody who is not on the tester list, signed in or not, gets exactly what an unknown path gets:
 * 404 {"error":"not_found"}. A database or GitHub that fails answers the same, so the world's
 * existence is never confirmed by an error. */
import { isTester } from './db.js';
import { LAYERS } from './layers.js';
import { clean } from './tasks.js';

export const NOT_FOUND = { status: 404, body: { error: 'not_found' } };

export async function handle(req, deps){
  const { method, path, bearerUid, cookieUid, query = {}, body = null } = req;
  if (method !== 'GET' && !(method === 'POST' && path === 'task')) return NOT_FOUND;
  try {
    if (path === 'me') {
      if (!bearerUid || !isTester(await deps.db.role(bearerUid))) return NOT_FOUND;
      return { status: 200, body: { ok: true }, mint: bearerUid };
    }
    if (path === 'world') {
      if (!cookieUid || !isTester(await deps.db.role(cookieUid))) return NOT_FOUND;
      const w = await deps.world();
      return { status: 200, body: { asOf: w.asOf, games: w.games, layers: LAYERS, art: w.art } };
    }
    if (['ideas', 'agents', 'agent', 'tasks', 'task'].includes(path)) {
      if (!cookieUid || !isTester(await deps.db.role(cookieUid))) return NOT_FOUND;
      if (path === 'ideas') return { status: 200, body: await deps.ideas() };
      if (path === 'agents') return { status: 200, body: await deps.agents() };
      if (path === 'agent') return /^[a-z0-9-]{2,64}$/.test(query.id || '') ? { status: 200, body: await deps.agent(query.id) } : NOT_FOUND;
      // tasking is the only write: it needs its own token, and says so to a tester when it is missing
      if (!deps.canTask()) return { status: 503, body: { error: 'tasking_off' } };
      if (path === 'tasks') return { status: 200, body: await deps.tasks() };
      const t = clean(body || {});
      if (t.text.length < 3 || !(await deps.agentIds()).includes(t.agent)) return { status: 400, body: { error: 'bad_task' } };
      return { status: 200, body: await deps.queue({ ...t, by: (await deps.db.name(cookieUid)) || 'a tester' }) };
    }
  } catch (e) { return NOT_FOUND; }
  return NOT_FOUND;
}
