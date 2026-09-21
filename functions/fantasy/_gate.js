/* The gate script, as a string, injected into the 404 body by [[path]].js.
 *
 * Files prefixed with "_" are NOT routed by Cloudflare Pages, so this is a
 * private helper and never an endpoint. It lives in its own file rather than
 * as a template literal inside the route so it can be read as code.
 *
 *
 * WHY THIS IS INLINE RATHER THAN A SCRIPT TAG
 * ---------------------------------------------------------------------------
 * A `<script src="/fantasy/gate.js">` would be a second fetchable file under
 * the gated path, which means the catch-all route has to carve out an
 * exception for it, which means there is a URL under /fantasy that answers 200
 * to anybody. One fewer file and one fewer exception.
 *
 *
 * IT DOES NOTHING AT ALL WHEN NOBODY IS SIGNED IN
 * ---------------------------------------------------------------------------
 * The first thing it does is read localStorage for a session that the rest of
 * this site already put there. No session, and it returns before it has made a
 * single network request. So a crawler, a curl, or somebody who guessed the
 * URL gets a 404 page that behaves in every way like a 404 page: no fetch, no
 * CDN script, no second request of any kind.
 *
 * That is also why supabase-js is NOT loaded up front. The happy path needs
 * only the access token, which is already sitting in localStorage, and the
 * SERVER is what verifies it. The library is fetched in exactly one case,
 * described at refresh() below.
 *
 *
 * WHAT A STRANGER CAN STILL LEARN, STATED PLAINLY RATHER THAN GLOSSED
 * ---------------------------------------------------------------------------
 * Somebody who guesses the exact path AND reads the source of the 404 they get
 * back learns that a gated route named fantasy exists. That is the residual,
 * and it is not nothing.
 *
 * What it is not: they learn no product name, no tool names, no methodology,
 * no data, and no way in. Every one of those is behind /api/fantasy/app, which
 * verifies a real Supabase session against the allowlist server-side before it
 * returns a byte.
 *
 * Closing that last gap means an HttpOnly session cookie set at a neutral URL,
 * so the route itself can 404 without shipping any script. That is a real
 * option and it is deliberately not built yet, because it means a second
 * session mechanism alongside the localStorage one every other page on this
 * site uses, and that is a bigger change than the gap is worth until somebody
 * says otherwise.
 *
 *
 * IT FAILS CLOSED, which is the opposite of every other client on this site.
 * board.js, clock.js and cloudsave.js all fail OPEN by design, because a
 * wrongly refused player costs a season. Here a wrongly admitted stranger
 * cannot be un-shown what they saw. So every catch, every non-ok response and
 * every unreadable token ends the same way: the 404 that is already on screen
 * stays on screen, and nothing is added to it.
 */
/* Takes the anon key rather than holding one. It is public (it is in the page
 * source of every game here) but it belongs to the project configuration, and
 * a second hand-written copy of it is a second thing to rotate. The route
 * passes the one it already has. */
export const gateJs = (anonKey) => `
(function () {
  'use strict';

  /* The project ref, which is already in the page source of every game on this
     site. supabase-js stores its session under this exact key and the rest of
     the site reads the same one, so a member who signed in on the football game
     is already signed in here. */
  var REF = 'jcrrxqfpdelrmvjuihnm';
  var KEY = 'sb-' + REF + '-auth-token';

  /* Which view was asked for, derived from the path rather than written into
     the page, so adding a tool later is a file rather than an edit here. The
     server validates it against its own list; nothing here is trusted. */
  function view() {
    var p = location.pathname.replace(/^\\/fantasy\\/?/, '').replace(/\\/+$/, '');
    return p === '' ? 'hub' : p;
  }

  function token() {
    var raw = null;
    try { raw = localStorage.getItem(KEY); } catch (e) { return null; }
    if (!raw) return null;
    try {
      var v = JSON.parse(raw);
      return (v && v.access_token) || null;
    } catch (e) { return null; }
  }

  /* THE ONE CASE THAT NEEDS THE LIBRARY. An access token is short lived, so a
     member coming back after an hour holds a stale one and the server will
     refuse it. Without this they would get the 404 and have no way to tell it
     from being removed from the list.

     So on a 401 only, supabase-js is fetched and asked to refresh, and the
     request is retried ONCE. A signed-out visitor never reaches this function,
     so the CDN request never happens for them. */
  function refresh() {
    return new Promise(function (done) {
      var s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
      s.onerror = function () { done(null); };
      s.onload = function () {
        try {
          var sb = window.supabase.createClient(
            'https://' + REF + '.supabase.co',
            ${JSON.stringify(anonKey)},
            { auth: { persistSession: true, autoRefreshToken: true } });
          sb.auth.getSession().then(function (r) {
            done((r && r.data && r.data.session && r.data.session.access_token) || null);
          }).catch(function () { done(null); });
        } catch (e) { done(null); }
      };
      document.head.appendChild(s);
      /* A blocked CDN must not leave a member looking at a spinner for ever.
         Ten seconds and it is the 404, which is the honest answer. */
      setTimeout(function () { done(null); }, 10000);
    });
  }

  function ask(at) {
    return fetch('/api/fantasy/app?view=' + encodeURIComponent(view()), {
      headers: { Authorization: 'Bearer ' + at },
      cache: 'no-store'
    });
  }

  function run(code) {
    /* A Blob URL rather than eval, so the view is a real module: it gets its
       own scope, can use import/export, and shows up in the debugger as a file
       rather than as a string. */
    var url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
    return import(url).then(function (m) {
      URL.revokeObjectURL(url);
      if (m && typeof m.render === 'function') m.render(document);
    });
  }

  var at = token();
  if (!at) return;   /* signed out: not one request, not one byte */

  ask(at).then(function (r) {
    if (r.status === 401) {
      return refresh().then(function (fresh) {
        if (!fresh) return null;
        return ask(fresh);
      });
    }
    return r;
  }).then(function (r) {
    if (!r || !r.ok) return null;   /* 404 for a non-member, and it stays a 404 */
    return r.text();
  }).then(function (code) {
    if (code) return run(code);
  }).catch(function () {
    /* Fails closed. The 404 already on screen is the answer. */
  });
})();
`;
