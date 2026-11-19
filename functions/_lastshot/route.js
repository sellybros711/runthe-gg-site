/* The two Last Shot routes that are Pages Functions, shared by
 * functions/last-shot/e.js and functions/last-shot/report.js.
 *
 *   POST /last-shot/e        a player's gameplay events (an account, a device or both)
 *   GET  /last-shot/report   the four targets, admins only
 *
 * Everything else under /last-shot/ is a static file in last-shot/ at the
 * site root (built by build/pages.mjs), served by Pages with no Function: a
 * route file wins only for its own path, so the page and its modules never
 * reach this code and never count as an invocation.
 *
 * A refusal (no database, a wrong method, the report for anybody but an
 * admin, a guest's events with no good device id) is the same 404 Stumpire
 * gives a stranger. This file exports no onRequest, so Pages never routes it. */
import { supabaseDb } from './db-supabase.js';
import { roundGate } from './gate.js';
import { readBody } from './events.js';
import { verify, readCookie, secretOf } from '../_stumpire/cookie.js';

export async function answer(context, sub) {
  const { request, env } = context;
  let out = null;
  try {
    /* the events and the report need the database; without it, the 404 */
    if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE) {
      const uid = await verify(secretOf(env), readCookie(request), Date.now());
      out = await roundGate({ method: request.method, sub, uid, query: Object.fromEntries(new URL(request.url).searchParams),
        body: request.method === 'POST' ? await readBody(request) : null, nowMs: Date.now() }, supabaseDb(env));
    }
  } catch (e) { out = null; }
  if (!out) return notFound(context);
  if (out.status === 204) return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
  /* the report: never cached, never for a crawler */
  return new Response(out.body, { status: out.status || 200, headers: { 'Content-Type': out.type, 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' } });
}

/* The same 404 as functions/arcade/stumpire/[[path]].js, byte for byte in what
   it sends: the site's 404.html, status 404, no-store. */
async function notFound(context) {
  let html = 'Not found';
  try { const r = await context.env.ASSETS.fetch(new URL('/404.html', context.request.url)); if (r.ok) html = await r.text(); } catch (e) {}
  return new Response(html, { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}
