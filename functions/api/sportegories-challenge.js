/* Sportegories challenges (Cloudflare Pages Function)
 *
 * POST /api/sportegories-challenge   { answer, letter, cat, label }
 *   -> { verdict: 'upheld'|'denied'|'unsure'|'offline'|'refused'|'stale', msg }
 * GET  /api/sportegories-challenge?c=<label>&c=<label>...
 *   -> { rulings: [{ a: nameKey, c: label }] }   the upheld ones, for a card
 *
 * The ruling is functions/_sportegories/challenge.js; this file only wires it
 * to the game's own data, Wikidata and the memory table.
 *
 * The game's data is loaded by _sportegories/engine.js, from the deployment's
 * own static file, once per isolate. Without the
 * SUPABASE_URL and SUPABASE_SERVICE_ROLE secrets, or against a database
 * without 135, it still rules and simply remembers nothing.
 */
import { wikidata } from './player-check.js';
import { rule, supabaseMemory } from '../_sportegories/challenge.js';
import { loadEngine, parseData } from '../_sportegories/engine.js';

export { parseData };

export async function onRequestPost(context) {
  try {
    const { SP, LC } = await loadEngine(context);
    let body = {};
    try { body = await context.request.json(); } catch (e) {}
    const out = await rule(body, { SP, LC, wiki: wikidata, db: supabaseMemory(context.env) });
    return json(out);
  } catch (e) {
    return json({ verdict: 'offline', msg: 'Couldn’t reach the record books. Try again in a minute.' }, 502);
  }
}

export async function onRequestGet(context) {
  try {
    const u = new URL(context.request.url);
    const labels = u.searchParams.getAll('c').map((s) => s.slice(0, 80)).slice(0, 12);
    const db = supabaseMemory(context.env);
    const rulings = db ? await db.upheld(labels) : [];
    return json({ rulings }, 200, 60);
  } catch (e) {
    return json({ rulings: [] });
  }
}

function json(obj, status, ttl) {
  const h = { 'content-type': 'application/json; charset=utf-8' };
  h['cache-control'] = ttl ? 'public, max-age=' + ttl : 'no-store';
  return new Response(JSON.stringify(obj), { status: status || 200, headers: h });
}
