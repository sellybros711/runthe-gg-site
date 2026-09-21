/* Everything under /fantasy, and it answers 404 to everybody.
 *
 * A Cloudflare Pages catch-all: functions/fantasy/[[path]].js intercepts
 * /fantasy and every path below it, so no file in the repo's fantasy/
 * directory is ever served directly. That is the point of it.
 *
 *
 * WHY A FUNCTION AND NOT JUST A STATIC PAGE WITH A noindex ON IT
 * ---------------------------------------------------------------------------
 * The brief's first acceptance criterion is that a stranger learns nothing
 * about the product's existence. A static fantasy/index.html cannot meet that
 * however well it is gated in JavaScript, for two reasons that have nothing to
 * do with how good the gate is:
 *
 *   * it answers 200, and a missing path answers 404, so the route's existence
 *     is readable from the status line alone without parsing anything
 *   * its source ships to whoever asks, so the product name, the tool names
 *     and the whole UI are a view-source away
 *
 * This repo already has the weaker pattern and is honest about it. Run The
 * Floor and MythiBall are unlisted and noindexed, and
 * mythiball/check-posture.mjs says in as many words: "Unlisted is the whole of
 * the gate. It is not access control: anyone with the URL is in." That is fine
 * for a game somebody might enjoy finding early. It is not fine here.
 *
 *
 * THE 404 BODY IS FETCHED, NEVER COPIED
 * ---------------------------------------------------------------------------
 * env.ASSETS.fetch('/404.html') serves the real asset and bypasses Functions,
 * so what a stranger gets back under /fantasy is byte-for-byte the site's own
 * 404 page, plus one injected script. A hand-copied 404 would have started
 * identical and drifted the first time somebody edited the real one, and the
 * drift is exactly what makes a page identifiable.
 *
 *
 * ONE HEADER IS DELIBERATELY NOT COPIED FROM THE REAL 404
 * ---------------------------------------------------------------------------
 * Cache-Control. The response depends on nothing the cache can see, and the
 * body it carries is a 404 either way, but a cached 404 would still be wrong
 * the moment somebody is added to the allowlist. no-store, and it costs
 * nothing because this route is never hot.
 */
import { gateJs } from './_gate.js';

/* The published anon key. It is in the source of every game on this site
 * already and RLS is what protects the data, not this string. It is here
 * rather than read from env so the route works on a preview deployment that
 * has no environment variables set, which is the state a new Pages project is
 * in before anybody configures it. */
const SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpjcnJ4cWZwZGVscm12anVpaG5tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3OTY5NjIsImV4cCI6MjA5NjM3Mjk2Mn0.wyjoZpa2yRW-l38-KMGqBvEgTlW9v1KheNye7csWAlM';

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  let html;
  try {
    const res = await env.ASSETS.fetch(new URL('/404.html', url.origin));
    html = await res.text();
  } catch (e) {
    html = null;
  }

  /* IF THE REAL 404 CANNOT BE READ, STILL ANSWER 404. A fallback that returned
     an error page, or a 500, would make this route distinguishable from a
     missing one on exactly the day something else was already broken. The
     minimal body below is never expected to be seen. */
  if (!html) {
    return new Response('<!doctype html><title>Page Not Found | RunThe.GG</title>', {
      status: 404,
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
    });
  }

  const gate = '<script>' + gateJs(SB_ANON) + '</script>';
  html = html.includes('</body>')
    ? html.replace('</body>', gate + '</body>')
    : html + gate;

  return new Response(html, {
    status: 404,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      /* The real 404 carries a noindex tag in its head, which comes along with
         the body. This says the same thing in a header, because a crawler that
         never parses a 404 body still reads headers. Belt and braces, and the
         belt is that robots.txt disallows the path in the first place. */
      'x-robots-tag': 'noindex, nofollow',
      'referrer-policy': 'strict-origin-when-cross-origin',
      'x-content-type-options': 'nosniff',
    },
  });
}
