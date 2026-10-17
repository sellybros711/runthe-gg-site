/* The world's API, behind the same gate as its page.
 *
 *   GET me      with the player's Supabase token: 200 and the page cookie for a tester, else 404
 *   GET world   with the page cookie: every game, its status, landmark and districts
 *
 * Anybody who is not on the tester list, signed in or not, gets exactly what an unknown path gets:
 * 404 {"error":"not_found"}. A database or GitHub that fails answers the same, so the world's
 * existence is never confirmed by an error. */
import { isTester } from './db.js';
import { LAYERS } from './layers.js';

export const NOT_FOUND = { status: 404, body: { error: 'not_found' } };

export async function handle(req, deps){
  const { method, path, bearerUid, cookieUid } = req;
  if (method !== 'GET') return NOT_FOUND;
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
  } catch (e) { return NOT_FOUND; }
  return NOT_FOUND;
}
