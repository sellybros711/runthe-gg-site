/* /last-shot and /last-shot/*  (Cloudflare Pages Function)
 *
 * Serves the Last Shot page shell and its browser modules, and only to
 * somebody on the tester list right now (see functions/_lastshot/gate.js).
 * The source lives under functions/_lastshot, which is never a static asset,
 * so there is no other URL that hands it out. Everybody else gets the site's
 * own 404 page with a 404 status, exactly as Stumpire answers them.
 *
 * Also the tester round's two routes (gate.js roundGate): POST /last-shot/e
 * takes a tester's gameplay events, GET /last-shot/report shows an admin the
 * four launch targets. Refused the same way.
 */
import { supabaseDb } from '../_lastshot/db-supabase.js';
import { pageGate, roundGate } from '../_lastshot/gate.js';
import { readBody } from '../_lastshot/events.js';
import { verify, readCookie, secretOf } from '../_stumpire/cookie.js';

export async function onRequest(context) {
  const { request, env, params } = context;
  const sub = Array.isArray(params.path) ? params.path.join('/') : String(params.path || '');
  let out = null;
  try {
    if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE) {
      const uid = await verify(secretOf(env), readCookie(request), Date.now());
      const db = supabaseDb(env);
      /* the tester round's events and report; undefined means not one of those */
      const round = await roundGate({ method: request.method, sub, uid, query: Object.fromEntries(new URL(request.url).searchParams),
        body: request.method === 'POST' ? await readBody(request) : null, nowMs: Date.now() }, db);
      out = round === undefined ? (request.method === 'GET' || request.method === 'HEAD' ? await pageGate(sub, uid, db) : null) : round;
    }
  } catch (e) { out = null; }
  if (!out) return notFound(context);
  if (out.status === 204) return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
  return new Response(out.body, { status: out.status || 200, headers: { 'Content-Type': out.type, 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' } });
}

/* The same 404 as functions/arcade/stumpire/[[path]].js, byte for byte in what
   it sends: the site's 404.html, status 404, no-store. */
async function notFound(context) {
  let html = 'Not found';
  try { const r = await context.env.ASSETS.fetch(new URL('/404.html', context.request.url)); if (r.ok) html = await r.text(); } catch (e) {}
  return new Response(html, { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}
