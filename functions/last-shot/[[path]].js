/* /last-shot and /last-shot/*  (Cloudflare Pages Function)
 *
 * Serves the Last Shot page shell and its browser modules from
 * functions/_lastshot/pages.js, to anybody (see functions/_lastshot/serve.js).
 * The game is unlisted, not gated: noindexed and linked from nowhere public.
 * The source under functions/ is never a static asset; any other path here
 * gets the site's own 404 page.
 */
import { serve } from '../_lastshot/serve.js';

export async function onRequest(context) {
  const { params } = context;
  const sub = Array.isArray(params.path) ? params.path.join('/') : String(params.path || '');
  const out = serve(sub);
  if (!out) return notFound(context);
  return new Response(out.body, { headers: { 'Content-Type': out.type, 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' } });
}

async function notFound(context) {
  let html = 'Not found';
  try { const r = await context.env.ASSETS.fetch(new URL('/404.html', context.request.url)); if (r.ok) html = await r.text(); } catch (e) {}
  return new Response(html, { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}
