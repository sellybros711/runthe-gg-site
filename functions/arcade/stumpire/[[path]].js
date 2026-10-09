/* /arcade/stumpire/*  (Cloudflare Pages Function)
 *
 * Serves the Stumpire page shells, and only to somebody the database lets
 * in right now. The HTML lives in functions/_stumpire/pages.js, which is not
 * a static asset, so there is no other URL that hands it out. Everybody else
 * gets the site's own 404 page with a 404 status.
 */
import { supabaseDb } from '../../_stumpire/db-supabase.js';
import { verify, readCookie, secretOf } from '../../_stumpire/cookie.js';
import { PLAY_PAGE, ADMIN_PAGE } from '../../_stumpire/pages.js';

export async function onRequest(context) {
  const { request, env, params } = context;
  const sub = Array.isArray(params.path) ? params.path.join('/') : String(params.path || '');
  const page = sub === '' ? PLAY_PAGE : sub === 'admin' ? ADMIN_PAGE : null;
  let access = null;
  try {
    if (page && env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE) {
      const db = supabaseDb(env);
      const uid = await verify(secretOf(env), readCookie(request), Date.now());
      access = uid ? await db.access(uid) : ((await db.mode()) === 'public' ? 'player' : null);
    }
  } catch (e) { access = null; }
  const allowed = page === PLAY_PAGE ? !!access : page === ADMIN_PAGE ? access === 'admin' : false;
  if (!allowed) return notFound(context);
  return new Response(page, { headers: {
    'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store',
    'X-Robots-Tag': 'noindex, nofollow'
  } });
}

async function notFound(context) {
  let html = 'Not found';
  try { const r = await context.env.ASSETS.fetch(new URL('/404.html', context.request.url)); if (r.ok) html = await r.text(); } catch (e) {}
  return new Response(html, { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}
