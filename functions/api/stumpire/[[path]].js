/* /api/stumpire/*  (Cloudflare Pages Function)
 *
 * A thin wrapper: who is asking (the Supabase bearer, resolved server side by
 * the same helper the Stripe endpoints use), which guest device, then
 * functions/_stumpire/api.js decides everything. Non-testers get a 404 on
 * every path. GET me also sets the page gate's cookie for a tester.
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE, SUPABASE_ANON (STUMPIRE_COOKIE_SECRET optional).
 */
import { verifyUser } from '../stripe/_verify.js';
import { supabaseDb } from '../../_stumpire/db-supabase.js';
import { sign, setCookie, secretOf } from '../../_stumpire/cookie.js';

/* EVERY PAGES FUNCTION IS ONE WORKER. A static import of the engine would
   evaluate its 2MB dataset on the cold start of every endpoint on the site,
   the Stripe webhook included. Loaded on first use, only Stumpire pays. */
let ENGINE = null;
async function engine() {
  if (!ENGINE) {
    const [api, search] = await Promise.all([import('../../_stumpire/api.js'), import('../../_stumpire/data/search_avg.json', { with: { type: 'json' } })]);
    ENGINE = { handle: api.handle, search: (search.default || search).values };
  }
  return ENGINE;
}

export async function onRequest(context) {
  const { request, env, params } = context;
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE) return json({ error: 'not_found' }, 404);
  const url = new URL(request.url);
  const path = Array.isArray(params.path) ? params.path.join('/') : String(params.path || '');
  let body = null;
  if (request.method !== 'GET') { try { body = await request.json(); } catch (e) { body = {}; } }
  const uid = await verifyUser(env, request);
  const { handle, search } = await engine();
  const guest = (request.headers.get('X-Stumpire-Guest') || '').slice(0, 64);
  const res = await handle({
    method: request.method, path, query: Object.fromEntries(url.searchParams), body,
    uid, guestId: /^[A-Za-z0-9-]{8,64}$/.test(guest) ? guest : null
  }, { db: supabaseDb(env), now: () => Date.now(), searchAvg: () => search });
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
  if (path === 'me' && res.status === 200 && uid && secretOf(env)) {
    headers['Set-Cookie'] = setCookie(await sign(secretOf(env), uid, Date.now()));
  }
  return new Response(JSON.stringify(res.body), { status: res.status, headers });
}

function json(b, status) {
  return new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}
