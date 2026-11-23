/* POST /api/faw/e  (Cloudflare Pages Function)
 *
 * Takes the page's batched launch events (functions/_faw/events.js cleans
 * them) and stores them in the shared game_events through supabase/171. The
 * answer is always 204 with nothing in it, so the page never waits on it and
 * a failed write never shows in the game. It lives under /api, not in the
 * game's folder: that folder stays a plain public one with no Function in
 * front of it (the game's posture check). */
import { readBody, cleanBatch, sameOrigin, store } from '../../_faw/events.js';

export async function onRequestPost({ request, env }) {
  if (sameOrigin(request)) await store(env, cleanBatch(await readBody(request)));
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
}
