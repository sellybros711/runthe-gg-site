/* /api/arcade/*  (Cloudflare Pages Function)
 *
 * The Arcade Lab's API. Who is asking (the Supabase bearer, resolved server
 * side), which guest device, then functions/_arcadelab/api.js decides
 * everything. Anybody a game's flag and the tester list refuse gets a 404.
 * GET me also sets the page gate's cookie for a tester (the same signed
 * cookie Stumpire uses, so one sign in opens both).
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE, SUPABASE_ANON.
 */
import { verifyUser } from '../stripe/_verify.js';
import { supabaseDb } from '../../_arcadelab/db-supabase.js';
import { handle } from '../../_arcadelab/api.js';
import { sign, setCookie, secretOf } from '../../_stumpire/cookie.js';

export async function onRequest(context) {
  const { request, env, params } = context;
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE) return json({ error: 'not_found' }, 404);
  const url = new URL(request.url);
  const path = Array.isArray(params.path) ? params.path.join('/') : String(params.path || '');
  let body = null;
  if (request.method !== 'GET') { try { body = await request.json(); } catch (e) { body = {}; } }
  const uid = await verifyUser(env, request);
  const guest = (request.headers.get('X-Arcade-Guest') || '').slice(0, 64);
  let res;
  try {
    res = await handle({ method: request.method, path, query: Object.fromEntries(url.searchParams), body,
      uid, guestId: /^[A-Za-z0-9-]{8,64}$/.test(guest) ? guest : null }, { db: supabaseDb(env), now: () => Date.now() });
  } catch (e) {
    /* A database without 134 answers like a refusal: never confirm the game. */
    return json({ error: 'not_found' }, 404);
  }
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' };
  if (path === 'me' && res.status === 200 && uid && secretOf(env)) headers['Set-Cookie'] = setCookie(await sign(secretOf(env), uid, Date.now()));
  return new Response(JSON.stringify(res.body), { status: res.status, headers });
}

function json(b, status) {
  return new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}
