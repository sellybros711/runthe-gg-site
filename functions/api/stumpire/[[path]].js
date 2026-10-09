/* /api/stumpire/*  (Cloudflare Pages Function)
 *
 * A thin wrapper: who is asking (the Supabase bearer, resolved server side by
 * the same helper the Stripe endpoints use), which guest device, then
 * functions/_stumpire/api.js decides everything. Non-testers get a 404 on
 * every path. GET me also sets the page gate's cookie for a tester.
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE, SUPABASE_ANON, STUMPIRE_COOKIE_SECRET.
 */
import { verifyUser } from '../stripe/_verify.js';
import { handle } from '../../_stumpire/api.js';
import { supabaseDb } from '../../_stumpire/db-supabase.js';
import { sign, setCookie } from '../../_stumpire/cookie.js';
import SEARCH from '../../_stumpire/data/search_avg.json' with { type: 'json' };

export async function onRequest(context) {
  const { request, env, params } = context;
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE) return json({ error: 'not_found' }, 404);
  const url = new URL(request.url);
  const path = Array.isArray(params.path) ? params.path.join('/') : String(params.path || '');
  let body = null;
  if (request.method !== 'GET') { try { body = await request.json(); } catch (e) { body = {}; } }
  const uid = await verifyUser(env, request);
  const guest = (request.headers.get('X-Stumpire-Guest') || '').slice(0, 64);
  const res = await handle({
    method: request.method, path, query: Object.fromEntries(url.searchParams), body,
    uid, guestId: /^[A-Za-z0-9-]{8,64}$/.test(guest) ? guest : null
  }, { db: supabaseDb(env), now: () => Date.now(), searchAvg: () => SEARCH.values });
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
  if (path === 'me' && res.status === 200 && uid && env.STUMPIRE_COOKIE_SECRET) {
    headers['Set-Cookie'] = setCookie(await sign(env.STUMPIRE_COOKIE_SECRET, uid, Date.now()));
  }
  return new Response(JSON.stringify(res.body), { status: res.status, headers });
}

function json(b, status) {
  return new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}
