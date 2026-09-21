/* GET /api/fantasy/app?view=<name>
 *
 * The only door into Run The Fantasy League. Verifies a real Supabase session,
 * checks it against fantasy_access_allowlist, and only then returns the view's
 * JavaScript. Anything else gets a 404 with an empty body.
 *
 *
 * WHY THE UI IS SERVED FROM HERE AND NOT FROM A FILE
 * ---------------------------------------------------------------------------
 * The views live in the repo at fantasy/app/*.js, which on a static host would
 * make them fetchable by anybody who guessed the path. They are not, because
 * functions/fantasy/[[path]].js intercepts every request under /fantasy and
 * answers 404. env.ASSETS.fetch() below reads the asset directly and bypasses
 * Functions, so this endpoint is the only thing on the internet that can hand
 * one of those files to a browser.
 *
 * That inversion is the whole design. The gate is not "the page checks and
 * then hides the content"; the content is never sent at all.
 *
 *
 * THREE REFUSALS, AND THEY ARE NOT THE SAME REFUSAL
 * ---------------------------------------------------------------------------
 *   401  the token is missing, malformed or expired
 *   404  the token is good and the account is not on the allowlist
 *   404  the view name is not one we serve
 *
 * The 401 exists so a member holding a stale token can be told to refresh and
 * retry, which _gate.js does exactly once. Answering 404 there instead would
 * be marginally more opaque and would lock out every member who left a tab
 * open for an hour, which is the wrong trade for a tool somebody opens on a
 * Sunday morning.
 *
 * The two 404s are deliberately identical: same status, same empty body, same
 * headers. A signed-in stranger cannot tell "you are not on the list" from
 * "there is no such thing", which is the distinction the brief asks us not to
 * draw. That is also why there is no "you are not authorized" anywhere in this
 * file.
 *
 *
 * IT NEEDS THE SERVICE ROLE, AND THAT IS WHY THE CHECK IS HERE
 * ---------------------------------------------------------------------------
 * fantasy_access_allowlist is RLS'd so that an account reads only its own row.
 * A browser could therefore check its own membership, and _gate.js could have
 * done it. It does not, because a client-side check is a client-side check:
 * the answer would be a boolean in JavaScript that anybody can flip. The
 * server asks, with a key the browser never sees, and the answer decides
 * whether bytes are sent.
 */
import { verifyUser } from '../stripe/_verify.js';

/* An allowlist, never a path. `view` arrives from the client, and the one
 * mistake this endpoint could make that actually matters is letting it address
 * a file. With a map there is no traversal to defend against, no '..' to
 * strip, and no way to name a file that is not on this list. */
const VIEWS = {
  'hub':        '/fantasy/app/hub.js',
  'start-sit':  '/fantasy/app/start-sit.js',
  'trade':      '/fantasy/app/trade.js',
};

/* Identical for every refusal. Built once so the three of them cannot drift
 * into being distinguishable by a header. */
const nope = (status) => new Response('', {
  status,
  headers: {
    'cache-control': 'no-store',
    'x-robots-tag': 'noindex, nofollow',
  },
});

export async function onRequestGet(context) {
  const { request, env } = context;

  const view = new URL(request.url).searchParams.get('view') || '';
  const asset = Object.prototype.hasOwnProperty.call(VIEWS, view) ? VIEWS[view] : null;

  /* THE VIEW IS CHECKED BEFORE THE TOKEN, on purpose. It costs nothing and it
     means a scan for a traversal bug never reaches the auth code at all. */
  if (!asset) return nope(404);

  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE) {
    /* NOT CONFIGURED IS A REFUSAL, NEVER A PASS. This is the one branch where
       failing open would be catastrophic and tempting: on a preview
       deployment with no environment variables, "let it through so I can see
       the page" is a one line change somebody would make at midnight. 503
       rather than 404 so the log says which of the two it was, and the gate
       treats anything that is not 200 as the 404 either way. */
    return nope(503);
  }

  const userId = await verifyUser(env, request);
  if (!userId) return nope(401);

  const allowed = await onList(env, userId);
  if (!allowed) return nope(404);

  try {
    const res = await env.ASSETS.fetch(new URL(asset, new URL(request.url).origin));
    if (!res.ok) return nope(404);
    return new Response(await res.text(), {
      status: 200,
      headers: {
        'content-type': 'text/javascript; charset=utf-8',
        'cache-control': 'no-store',
        'x-robots-tag': 'noindex, nofollow',
      },
    });
  } catch (e) {
    return nope(404);
  }
}

/* Asked with the service role, so it sees the row regardless of RLS, and asked
 * about the id verifyUser returned rather than anything from the request.
 *
 * ANY FAILURE IS A NO. A network blip, a 500 from PostgREST, a missing table
 * because the migration was never pasted: all of them end here as false. That
 * is the opposite of every other client on this site, and the reason is in
 * 109_fantasy_access.sql's header: a wrongly refused teammate presses reload,
 * and a wrongly admitted stranger cannot be un-shown what they saw. */
async function onList(env, userId) {
  try {
    const u = env.SUPABASE_URL.replace(/\/+$/, '')
      + '/rest/v1/fantasy_access_allowlist'
      + '?select=user_id&user_id=eq.' + encodeURIComponent(userId) + '&limit=1';
    const r = await fetch(u, {
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE,
        Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE,
        Accept: 'application/json',
      },
    });
    if (!r.ok) return false;
    const rows = await r.json();
    return Array.isArray(rows) && rows.length === 1;
  } catch (e) {
    return false;
  }
}
