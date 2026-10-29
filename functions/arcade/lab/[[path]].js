/* /arcade/lab/*  (Cloudflare Pages Function)
 *
 * Serves the Arcade Lab page shells and their browser modules, and only to
 * somebody a game's flag and the tester list let in right now (see
 * functions/_arcadelab/gate.js). Everybody else gets the site's own 404 page.
 */
import { supabaseDb } from '../../_arcadelab/db-supabase.js';
import { pageGate } from '../../_arcadelab/gate.js';
import { verify, readCookie, secretOf } from '../../_stumpire/cookie.js';

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

async function notFound(context) {
  let html = 'Not found';
  try { const r = await context.env.ASSETS.fetch(new URL('/404.html', context.request.url)); if (r.ok) html = await r.text(); } catch (e) {}
  return new Response(html, { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}
