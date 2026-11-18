/* /last-shot and /last-shot/*  (Cloudflare Pages Function)
 *
 * Serves the Last Shot page shell and its browser modules to anybody (the
 * game is live; see functions/_lastshot/gate.js). The source lives under
 * functions/_lastshot, which is never a static asset, so this is the one URL
 * that hands it out. A path it does not know gets the site's own 404 page
 * with a 404 status.
 *
 * Also the round's two routes (gate.js roundGate): POST /last-shot/e takes a
 * player's gameplay events (an account, a device or both), GET
 * /last-shot/report shows an admin the four targets. Everybody else gets the
 * same 404 from the report.
 */
import { supabaseDb } from '../_lastshot/db-supabase.js';
import { pageGate, roundGate, isRound } from '../_lastshot/gate.js';
import { readBody } from '../_lastshot/events.js';
import { BUILD } from '../_lastshot/pages.js';
import { verify, readCookie, secretOf } from '../_stumpire/cookie.js';

export async function onRequest(context) {
  const { request, env, params } = context;
  const sub = Array.isArray(params.path) ? params.path.join('/') : String(params.path || '');
  let out = null;
  try {
    if (isRound(sub)) {
      /* the events and the report need the database; without it, the 404 */
      if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE) {
        const uid = await verify(secretOf(env), readCookie(request), Date.now());
        out = await roundGate({ method: request.method, sub, uid, query: Object.fromEntries(new URL(request.url).searchParams),
          body: request.method === 'POST' ? await readBody(request) : null, nowMs: Date.now() }, supabaseDb(env));
      }
    } else if (request.method === 'GET' || request.method === 'HEAD') {
      out = pageGate(sub);
    }
  } catch (e) { out = null; }
  if (!out) return notFound(context);
  if (out.status === 204) return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
  /* A module asked for at this build's hash (the page and every import carry
     it) is the same bytes for as long as that URL lives: anybody may keep it
     a year. The page itself, the report and anything else are never cached.
     Only the page is for a crawler. */
  const isPage = !isRound(sub) && !/^m\//.test(sub);
  const fresh = /^m\//.test(sub) && new URL(request.url).searchParams.get('b') === BUILD;
  const headers = { 'Content-Type': out.type, 'Cache-Control': fresh ? 'public, max-age=31536000, immutable' : 'no-store' };
  if (!isPage) headers['X-Robots-Tag'] = 'noindex, nofollow';
  return new Response(out.body, { status: out.status || 200, headers });
}

/* The same 404 as functions/arcade/stumpire/[[path]].js, byte for byte in what
   it sends: the site's 404.html, status 404, no-store. */
async function notFound(context) {
  let html = 'Not found';
  try { const r = await context.env.ASSETS.fetch(new URL('/404.html', context.request.url)); if (r.ok) html = await r.text(); } catch (e) {}
  return new Response(html, { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}
