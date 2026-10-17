/* /last-shot and /last-shot/*  (Cloudflare Pages Function)
 *
 * Serves the Last Shot page shell and its browser modules, and only to
 * somebody on the tester list right now (see functions/_lastshot/gate.js).
 * The source lives under functions/_lastshot, which is never a static asset,
 * so there is no other URL that hands it out. Everybody else gets the site's
 * own 404 page with a 404 status, exactly as Stumpire answers them.
 */
import { supabaseDb } from '../_lastshot/db-supabase.js';
import { pageGate } from '../_lastshot/gate.js';
import { verify, readCookie, secretOf } from '../_stumpire/cookie.js';

export async function onRequest(context) {
  const { request, env, params } = context;
  const sub = Array.isArray(params.path) ? params.path.join('/') : String(params.path || '');
  let out = null;
  try {
    if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE) {
      const uid = await verify(secretOf(env), readCookie(request), Date.now());
      out = await pageGate(sub, uid, supabaseDb(env));
    }
  } catch (e) { out = null; }
  if (!out) return notFound(context);
  return new Response(out.body, { headers: { 'Content-Type': out.type, 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' } });
}

/* The same 404 as functions/arcade/stumpire/[[path]].js, byte for byte in what
   it sends: the site's 404.html, status 404, no-store. */
async function notFound(context) {
  let html = 'Not found';
  try { const r = await context.env.ASSETS.fetch(new URL('/404.html', context.request.url)); if (r.ok) html = await r.text(); } catch (e) {}
  return new Response(html, { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}
