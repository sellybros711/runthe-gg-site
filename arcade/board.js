/*
 * board.js - RunTheGrid daily boards + cloud streaks client (shared by both games).
 *
 * There is NO new account system here. It uses the site's existing one: the same
 * Supabase project, the same session (supabase-js persists it under a shared storage
 * key, so signing in on RunThe.GG signs you in here). Sign-in itself lives on the
 * main site; this module only reads the session and posts scores under it.
 *
 * EVERYTHING FAILS SOFT. If the supabase-js CDN is blocked, or supabase/52_grid_daily.sql
 * has not been run, or the network is down, every call resolves to null/empty and
 * RTG_BOARD.offline goes true. The games then keep the local streak and the "Sample"
 * board instead of showing wrong numbers. Nothing here can break a finished puzzle.
 *
 * The anon key is public by design - it is already in the page source of every other
 * game on this site. RLS lets it read the board and call one function; it cannot
 * insert, update or delete a row directly.
 */
(function () {
  'use strict';

  var SB_URL = 'https://jcrrxqfpdelrmvjuihnm.supabase.co';
  var SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpjcnJ4cWZwZGVscm12anVpaG5tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3OTY5NjIsImV4cCI6MjA5NjM3Mjk2Mn0.wyjoZpa2yRW-l38-KMGqBvEgTlW9v1KheNye7csWAlM';
  var REST = SB_URL + '/rest/v1/';
  var TIMEOUT = 8000;

  var sb = null;
  var session = null;
  var name = null;              // profiles.username for the signed-in user
  var favTeam = null;           // profiles.fav_cfb_team {name,primary,secondary} or null
  var offline = false;
  var lastError = null;
  var listeners = [];

  function fire() { for (var i = 0; i < listeners.length; i++) { try { listeners[i](state()); } catch (e) {} } }
  function state() {
    return {
      ready: !!sb,
      signedIn: !!session,
      name: name,
      favTeam: favTeam,
      userId: session && session.user && session.user.id,
      offline: offline,
      lastError: lastError
    };
  }

  /* ONE GoTrue client per page. Two Supabase clients sharing a storage key both try to
     consume the single-use OAuth code when Google redirects back, so whichever loses the
     race reports a failure and the first Google sign-in appears not to work (the second
     attempt then succeeds because the session is already stored). board.js and auth.js
     both need a client, so they share this one. */
  function rtgSharedClient(url, anon) {
    try { if (window.__RTG_SB__ && window.__RTG_SB__.__rtgUrl === url) return window.__RTG_SB__; } catch (e) {}
    var c = window.supabase.createClient(url, anon, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    try { c.__rtgUrl = url; window.__RTG_SB__ = c; } catch (e) {}
    return c;
  }

  function boot() {
    if (!(window.supabase && window.supabase.createClient)) { offline = true; return false; }
    try {
      sb = rtgSharedClient(SB_URL, SB_ANON);
    } catch (e) { sb = null; offline = true; return false; }
    sb.auth.onAuthStateChange(function (_evt, s) {
      session = s || null;
      if (session) { syncPro(); Promise.all([loadName(), loadFav()]).then(fire); } else { name = null; favTeam = null; fire(); }
    });
    sb.auth.getSession().then(function (r) {
      session = (r && r.data && r.data.session) || null;
      if (session) { syncPro(); return Promise.all([loadName(), loadFav()]).then(fire).then(flush); }
      fire();
    }).catch(fire);

    /* Anything that didn't reach the server gets another go the moment the
       conditions that broke it change: the network comes back, or the tab does
       (which on a phone is usually the same moment). */
    try {
      window.addEventListener('online', function () { flush(); });
      document.addEventListener('visibilitychange', function () { if (!document.hidden) flush(); });
    } catch (e) {}
    return true;
  }

  // Pro entitlement: server truth for signed-in subscribers. Reads the
  // `subscriptions` row written by the Stripe webhook and mirrors it into
  // localStorage 'runthegrid_pro' (which tokens.js/archive.js read). Fails
  // open: on any error we leave the local flag as-is (so the rollout preview
  // unlock keeps working and a flaky network never strips a paying user).
  function syncPro() {
    if (!sb || !session) return;
    sb.from('subscriptions').select('status,current_period_end').eq('user_id', session.user.id).maybeSingle()
      .then(function (r) {
        if (!r || r.error) return;                     // table missing / RLS → leave as-is
        var row = r.data;
        var active = !!row && (row.status === 'active' || row.status === 'trialing') &&
          (!row.current_period_end || new Date(row.current_period_end).getTime() > Date.now() - 86400000);
        try {
          // On a SUCCESSFUL read (still fail-open on error/offline above), the
          // subscriptions row is authoritative: grant when active, otherwise
          // clear the flag - including when there is NO row (free user). This
          // stops a stale flag (e.g. a browser that was once a cardholder) from
          // granting unlimited plays to a free account.
          if (active) localStorage.setItem('runthegrid_pro', '1');
          else localStorage.removeItem('runthegrid_pro');
        } catch (e) {}
        fire();
      })
      .catch(function () {});
  }

  function loadName() {
    if (!session) { name = null; return Promise.resolve(); }
    return sb.from('profiles').select('username').eq('id', session.user.id).single()
      .then(function (r) { name = (r && r.data && r.data.username) || null; })
      .catch(function () { name = null; });
  }

  // The signed-in user's favorite college team (set by the College Football
  // game). Queried on its own so a not-yet-created column can't break username.
  // On success we mirror it into RTGFavTeam's cache so the hub + games (which
  // read localStorage, not Supabase) pick it up on their next paint.
  function loadFav() {
    if (!session) { favTeam = null; return Promise.resolve(); }
    return sb.from('profiles').select('fav_cfb_team').eq('id', session.user.id).maybeSingle()
      .then(function (r) {
        if (!r || r.error) return;                 // column missing / RLS → ignore
        var v = r.data && r.data.fav_cfb_team;
        if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = null; } }
        if (v && window.RTGFavTeam) { favTeam = window.RTGFavTeam.set(v) || favTeam; }
      })
      .catch(function () {});
  }

  function token() { return (session && session.access_token) || SB_ANON; }
  function headers(extra) {
    return Object.assign({ apikey: SB_ANON, Authorization: 'Bearer ' + token() }, extra || {});
  }
  function withTimeout(promise) {
    return new Promise(function (resolve) {
      var done = false;
      var t = setTimeout(function () { if (!done) { done = true; resolve(null); } }, TIMEOUT);
      promise.then(function (v) { if (!done) { done = true; clearTimeout(t); resolve(v); } })
             .catch(function () { if (!done) { done = true; clearTimeout(t); resolve(null); } });
    });
  }
  /* A refused score has to be said out loud.
   *
   * For as long as this module has existed, a 4xx on a submit resolved to null
   * and the game carried on as though nothing had happened: the player finished
   * the puzzle, won, opened the board and was not on it, with no way to tell a
   * rejection from an empty day. Every leaderboard bug on this site has been
   * found by somebody eventually noticing that, weeks late. The server always
   * says why in plain words ('unknown game', 'daily ranked limit reached',
   * 'implausible time'), so show it.
   *
   * Deliberately plain and self-contained: this fires in ten different games,
   * none of which share a toast, and it must never depend on one of them having
   * loaded. */
  var REFUSE_CSS = 'position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:2147483000;' +
    'max-width:min(92vw,420px);box-sizing:border-box;padding:11px 14px;border-radius:12px;' +
    'background:#2A1414;color:#FFE9E4;border:1px solid rgba(240,106,95,.55);' +
    'font:700 12.5px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;text-align:center;' +
    'box-shadow:0 14px 40px -12px rgba(0,0,0,.75);';
  function sayRefused(msg) {
    try {
      var el = document.getElementById('rtg-refused');
      if (!el) {
        el = document.createElement('div');
        el.id = 'rtg-refused';
        el.setAttribute('role', 'status');
        el.style.cssText = REFUSE_CSS;
        document.body.appendChild(el);
      }
      el.textContent = 'Score not posted: ' + msg;
      clearTimeout(sayRefused.t);
      sayRefused.t = setTimeout(function () { if (el && el.parentNode) el.parentNode.removeChild(el); }, 9000);
    } catch (e) {}
    try { document.dispatchEvent(new CustomEvent('rtg:refused', { detail: { message: msg } })); } catch (e) {}
  }

  function fail(where, res) {
    // A 4xx is a decision, not a dead network. Marking it offline made the game
    // fall back to its Sample board and told the player the opposite of the truth.
    if (!(res.status >= 400 && res.status < 500)) offline = true;
    return res.text().then(function (b) {
      try { b = JSON.parse(b); } catch (e) {}
      lastError = { where: where, status: res.status, message: (b && (b.message || b.hint)) || res.statusText };
      if (where === 'submit' && res.status >= 400 && res.status < 500) {
        try { console.warn('[RTG] score refused:', lastError.status, lastError.message); } catch (e) {}
        sayRefused(lastError.message || ('server said no (' + res.status + ')'));
      }
      return null;
    }).catch(function () { lastError = { where: where, status: res.status }; return null; });
  }

  /* ---- the outbox -------------------------------------------------------
   * A finished run used to get exactly one attempt to reach the server, with
   * an 8s ceiling, and any failure resolved to null in silence: no row, no
   * retry, no word to the player. On a phone that hands off between wifi and
   * cell mid-request that is a coin flip, which is exactly what "sometimes my
   * name isn't on the board" looks like from the outside.
   *
   * So a run that doesn't land is kept and re-sent: on the next page load, on
   * reconnect, and when the tab comes back to the foreground.
   *
   * Only ever for failures that a later attempt could actually fix. The RPC
   * rejects some runs on purpose: an unknown game key, a date outside the
   * window, an implausible time, a free account past its daily ranked cap.
   * Those are decisions, not accidents. Re-sending them would spin
   * forever, so a 4xx is dropped and remembered in lastError instead.
   */
  var OUTBOX = 'rtg:lbq:v1', OUTMAX = 20;
  function outRead() {
    try { var a = JSON.parse(localStorage.getItem(OUTBOX)); return Array.isArray(a) ? a : []; }
    catch (e) { return []; }
  }
  function outWrite(a) {
    try { localStorage.setItem(OUTBOX, JSON.stringify(a.slice(-OUTMAX))); } catch (e) {}
  }
  function outAdd(run) {
    var a = outRead();
    // one entry per game+date: a replay supersedes the run queued before it
    a = a.filter(function (r) { return !(r.game === run.game && r.date === run.date); });
    a.push(run); outWrite(a);
  }
  function outDrop(run) {
    outWrite(outRead().filter(function (r) { return !(r.game === run.game && r.date === run.date); }));
  }
  function pending() { return outRead().length; }

  /* A submit that collides with itself is not a refusal.
   *
   * withTimeout resolves the promise at 8s; it cannot cancel the request, which
   * carries on server-side. So on a slow phone the retry below overlaps the
   * first attempt, both transactions find no row for today, both insert, and
   * the loser comes back 409 on grid_runs' one-row-per-day key. The run posted.
   * Telling the player "Score not posted: duplicate key value violates unique
   * constraint" under a cleared board is the worst of both worlds: a database
   * error, shown to a human, saying the opposite of what happened.
   *
   * So a 23505 counts as landed. The row is there; read back the streak it
   * earned so the game shows the real number. 82_grid_submit_idempotent.sql
   * stops the collision happening at all, and this keeps the fix true for any
   * client running against a database that has not had it yet. */
  function landed(res, run) {
    return res.text().then(function (b) {
      try { b = JSON.parse(b); } catch (e) {}
      var code = b && b.code, msg = String((b && b.message) || '');
      if (code !== '23505' && msg.indexOf('duplicate key') < 0) {
        return fail('submit', res).then(function () { return false; });
      }
      offline = false;
      try { console.info('[RTG] run already posted for', run.game, run.date); } catch (e) {}
      return streakOf(run.game).then(function (s) {
        return { id: null, streak: (s && s.streak) || 0,
                 best_streak: (s && s.best_streak) || 0, duplicate: true };
      });
    }).catch(function () { return false; });
  }

  function post(run) {
    var body = JSON.stringify({
      p_game: run.game, p_date: run.date, p_seconds: run.seconds,
      p_mistakes: run.mistakes, p_reveals: run.reveals, p_run_len: run.runLen,
      p_replay: !!run.replay
    });
    // `null` here means "no answer" (timeout/network), so it is worth another try.
    // `false` means the server answered and said no, which is never worth retrying.
    return withTimeout(
      fetch(REST + 'rpc/grid_submit_run', { method: 'POST', headers: headers({ 'Content-Type': 'application/json' }), body: body })
        .then(function (res) {
          if (res.ok) { offline = false; return res.json(); }
          if (res.status === 409) return landed(res, run);                           // already on the board
          if (res.status >= 500 || res.status === 429) return fail('submit', res);   // transient → null
          return fail('submit', res).then(function () { return false; });            // refused → false
        })
    );
  }

  function replayFlag() {
    try { return !!(window.RTGTokens && RTGTokens.replaying && RTGTokens.replaying()); } catch (e) { return false; }
  }

  // ---- submit a completed run. Returns {streak, best_streak} or null. ----
  function submit(game, dateStr, opts) {
    if (!session) return Promise.resolve(null);   // signed-in only; guests keep local
    // Every game funnels its ranked result through here, so this is the one
    // place the server's token verdict has to be honoured. If the wallet was
    // faked (a locked game unlocked by hand) the spend RPC refused outright, and
    // the run that refusal covers must not reach the leaderboard.
    //
    // "You already played this today" is NOT that. It is the ordinary answer for
    // a cleared cache or a second device, and dropping those runs here is what
    // made a win vanish with nothing said. Those carry run.replay instead and the
    // server decides: an empty slot gets filled, an existing row is left alone.
    try { if (window.RTGTokens && RTGTokens.rankAuthorized && !RTGTokens.rankAuthorized()) return Promise.resolve(null); } catch (e) {}
    opts = opts || {};
    /* GA4: a completed, ranked run. Carries the specific arcade game so each one
       reports separately, plus the shape of the result. Inert without gtag. */
    try{
      if (typeof window.gtag === 'function') {
        var GA_L = {'match':'Common Ground','crossword':'Daily Crossword','guess':'Guess the Player','table':'Number Game','oddone':'Odd One Out','career':'Career Path','rankit':'Rank It','almamater':'Alma Mater','sportegories':'Sportegories','highlow':'High Low'};
        window.gtag('event','arcade_game_completed',{
          game_name:'Run The Arcade', arcade_game: GA_L[game] || game,
          seconds: Math.max(0, Math.round(opts.seconds || 0)),
          mistakes: opts.mistakes || 0,
          run_len: (opts.runLen == null ? 0 : Math.max(0, Math.round(opts.runLen)))
        });
      }
    }catch(e){}
    var run = {
      game: game, date: dateStr,
      seconds: Math.max(0, Math.round(opts.seconds || 0)),
      mistakes: opts.mistakes || 0,
      reveals: opts.reveals || 0,
      runLen: (opts.runLen == null ? null : Math.max(0, Math.round(opts.runLen))),
      /* A run that is not this player's first go at the game today. It still
         posts, but only to claim an empty slot: see 79_grid_replay_posts.sql.
         Two ways to be one. The server can say it already counted a play for
         today (a cleared cache, a second device), or the game can say so
         itself, which is how a cardholder's second attempt reaches the board
         when the first one left it empty without being able to overwrite a
         row that is already there. */
      replay: replayFlag() || !!opts.replay
    };
    return post(run).then(function (r) {
      if (r === false) return null;               // server refused; nothing to retry
      if (r) return r;
      return post(run).then(function (r2) {       // one immediate retry, then queue
        if (r2 === false) return null;
        if (r2) return r2;
        outAdd(run); flush.scheduled = false;
        return null;
      });
    });
  }

  // Re-send anything still queued. Serial, so a long queue can't fan out.
  function flush() {
    if (!session || flush.busy) return Promise.resolve(0);
    var q = outRead();
    if (!q.length) return Promise.resolve(0);
    flush.busy = true;
    var sent = 0;
    return q.reduce(function (chain, run) {
      return chain.then(function () {
        return post(run).then(function (r) {
          if (r || r === false) { outDrop(run); if (r) sent++; }   // landed, or refused for good
        });
      });
    }, Promise.resolve()).then(function () {
      flush.busy = false;
      if (sent) fire();
      return sent;
    }, function () { flush.busy = false; return 0; });
  }

  // Names kept off every public board (test accounts). Case-insensitive.
  var HIDE_NAMES = { 'jordantest': 1 };
  function scrub(rows) {
    if (!Array.isArray(rows)) return rows;
    return rows.filter(function (r) {
      return !(r && r.display_name && HIDE_NAMES[String(r.display_name).toLowerCase()]);
    });
  }

  // ---- top rows for a game's day. Returns array (maybe empty) or null. ----
  function leaderboard(game, dateStr, limit) {
    // A missing key would query game=eq.null and come back empty, which reads
    // as "nobody played" rather than "we asked the wrong question".
    if (!game || !dateStr) return Promise.resolve(null);
    var q = REST + 'grid_runs?game=eq.' + encodeURIComponent(game) +
      '&puzzle_date=eq.' + encodeURIComponent(dateStr) +
      '&order=score.asc,created_at.asc&limit=' + ((limit || 5) + 3) +   // fetch a few extra so scrub can't shrink a full board
      '&select=display_name,base_seconds,mistakes,reveals,run_len,score,flawless';
    return withTimeout(
      fetch(q, { headers: headers() })
        .then(function (res) { if (!res.ok) return fail('leaderboard', res); offline = false; return res.json(); })
        .then(function (rows) { return Array.isArray(rows) ? scrub(rows).slice(0, limit || 5) : rows; })
    );
  }

  // ---- how many beat this score (rank = count + 1). Returns int or null. ----
  function rank(game, dateStr, score) {
    var q = REST + 'grid_runs?game=eq.' + encodeURIComponent(game) +
      '&puzzle_date=eq.' + encodeURIComponent(dateStr) + '&score=lt.' + Math.round(score) + '&select=id';
    return withTimeout(
      fetch(q, { headers: headers({ Prefer: 'count=exact', 'Range-Unit': 'items', Range: '0-0' }) })
        .then(function (res) {
          if (!res.ok && res.status !== 206) return fail('rank', res);
          offline = false;
          var cr = res.headers.get('content-range') || '';           // e.g. "0-0/42" or "*/42"
          var total = parseInt((cr.split('/')[1] || '0'), 10);
          return (isNaN(total) ? 0 : total) + 1;
        })
    );
  }

  // ---- how many people posted a result for this game today. int or null. ----
  // The board only ever shows a handful of rows, so without this a player has no
  // idea whether 3rd place is out of 4 or out of 400.
  function playerCount(game, dateStr) {
    var q = REST + 'grid_runs?game=eq.' + encodeURIComponent(game) +
      '&puzzle_date=eq.' + encodeURIComponent(dateStr) + '&select=id';
    return withTimeout(
      fetch(q, { headers: headers({ Prefer: 'count=exact', 'Range-Unit': 'items', Range: '0-0' }) })
        .then(function (res) {
          if (!res.ok && res.status !== 206) return fail('count', res);
          offline = false;
          var total = parseInt(((res.headers.get('content-range') || '').split('/')[1] || '0'), 10);
          return isNaN(total) ? 0 : total;
        })
    );
  }

  /* ---- the complete player register (supabase/77_player_register.sql) ----
   * Sportegories' own file is curated for recognition and always will be: it
   * has to be small enough to ship. This is the other half: every player who
   * ever appeared, kept server-side because it is ~56k rows and 4MB+ in the
   * client encoding. Takes normalized "first|last" keys, one card's worth at a
   * time; the RPC caps at ten. Works signed-out, because it is public sports data. */
  /* An answer we could not settle is a hole in the register with a name on it.
     Fire-and-forget, deliberately: the game never waits on this and never shows
     an error for it, because a failed report must not cost anyone a point. */
  function logGap(row) {
    try {
      return fetch(REST + 'answer_gaps', {
        method: 'POST',
        headers: headers({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
        body: JSON.stringify(row)
      })['catch'](function () {});
    } catch (e) { return Promise.resolve(); }
  }

  function registerLookup(keys) {
    if (!keys || !keys.length) return Promise.resolve([]);
    return withTimeout(
      fetch(REST + 'rpc/player_lookup', {
        method: 'POST',
        headers: headers({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ p_keys: keys.slice(0, 10) })
      }).then(function (res) {
        if (!res.ok) return fail('register', res);
        offline = false; return res.json();
      })
    ).then(function (r) { return Array.isArray(r) ? r : []; });
  }

  // ---- the signed-in user's own row for a day, so the board can place them
  // even when they're nowhere near the top. Row or null. ----
  function myRun(game, dateStr) {
    if (!session) return Promise.resolve(null);
    var q = REST + 'grid_runs?game=eq.' + encodeURIComponent(game) +
      '&puzzle_date=eq.' + encodeURIComponent(dateStr) +
      '&user_id=eq.' + encodeURIComponent(session.user.id) +
      '&select=display_name,base_seconds,mistakes,reveals,run_len,score,flawless&limit=1';
    return withTimeout(
      fetch(q, { headers: headers() })
        .then(function (res) { if (!res.ok) return fail('myRun', res); offline = false; return res.json(); })
        .then(function (a) { return (a && a.length) ? a[0] : null; })
    );
  }

  // ---- the signed-in user's cloud streak for a game. {streak,best_streak} or null. ----
  function streakOf(game) {
    if (!session) return Promise.resolve(null);
    var q = REST + 'grid_streaks?user_id=eq.' + encodeURIComponent(session.user.id) +
      '&game=eq.' + encodeURIComponent(game) + '&select=streak,best_streak&limit=1';
    return withTimeout(
      fetch(q, { headers: headers() })
        .then(function (res) { if (!res.ok) return fail('streak', res); offline = false; return res.json(); })
        .then(function (a) { return (a && a.length) ? a[0] : null; })
    );
  }

  // ---- server-side play counter (signed-in users). spendToken(game) is the
  // source of truth for a ranked play; tokenStatus() reads today's per-game
  // counts without spending. Both resolve null when signed-out / offline, and
  // also when the RPC is missing, so a site deployed ahead of the migration
  // falls back to the client wallet instead of locking everyone out.
  // See supabase/71_arcade_free_games.sql. ----
  function spendToken(game) {
    if (!sb || !session) return Promise.resolve(null);
    return withTimeout(sb.rpc('arcade_spend_game', { p_game: game || '' })
      .then(function (r) { return (r && !r.error) ? r.data : null; }));
  }
  function tokenStatus() {
    if (!sb || !session) return Promise.resolve(null);
    return withTimeout(sb.rpc('arcade_game_status').then(function (r) { return (r && !r.error) ? r.data : null; }));
  }

  // ---- all-time best-streak leaderboard for one game. Array (maybe empty) or
  // null (offline). Works without a session (anon-granted RPC). ----
  function streakBoard(game, limit) {
    if (!sb) return Promise.resolve(null);
    return withTimeout(
      sb.rpc('grid_streak_board', { p_game: game, p_limit: (limit || 10) + 3 })
        .then(function (r) { return (r && !r.error && Array.isArray(r.data)) ? scrub(r.data).slice(0, limit || 10) : null; })
    );
  }

  // ---- all-time board for one game: each player's BEST result ever, ranked,
  // with the date it happened. Run games return run_len (higher = better); the
  // timed games return base_seconds/flawless. One RPC serves both via the shared
  // `score` key. Array (maybe empty) or null (offline). Anon-granted RPC. ----
  function allTimeBoard(game, limit) {
    if (!sb) return Promise.resolve(null);
    return withTimeout(
      sb.rpc('grid_alltime_board', { p_game: game, p_limit: (limit || 10) + 3 })
        .then(function (r) { return (r && !r.error && Array.isArray(r.data)) ? scrub(r.data).slice(0, limit || 10) : null; })
    );
  }

  // ---- one page of the all-time board, for the leaderboard sheet's endless
  // scroll. Unlike allTimeBoard() this reports the RAW row count alongside the
  // scrubbed rows: the caller advances its offset by what the SERVER returned,
  // not by what survived scrub(), or hiding one test account would make every
  // later page skip a real player. Resolves {rows, raw} or null (offline). ----
  function allTimePage(game, limit, offset) {
    if (!sb) return Promise.resolve(null);
    var n = limit || 50;
    return withTimeout(
      sb.rpc('grid_alltime_board', { p_game: game, p_limit: n, p_offset: offset || 0 })
        .then(function (r) {
          if (!r || r.error || !Array.isArray(r.data)) return null;
          return { rows: scrub(r.data), raw: r.data.length };
        })
    );
  }

  // ---- field size + the signed-in caller's own all-time best and rank, in one
  // call. The RPC reads auth.uid() itself, so this is safe to call signed-out:
  // it just comes back with total and nulls. Object or null (offline). ----
  function allTimeStats(game) {
    if (!sb) return Promise.resolve(null);
    return withTimeout(
      sb.rpc('grid_alltime_stats', { p_game: game })
        .then(function (r) {
          if (!r || r.error) return null;
          var d = r.data;
          if (Array.isArray(d)) d = d[0];
          return d || null;
        })
    );
  }

  window.RTG_BOARD = {
    boot: boot,
    state: state,
    onChange: function (fn) { listeners.push(fn); if (sb || offline) fn(state()); },
    submit: submit,
    flush: flush,
    pending: pending,
    leaderboard: leaderboard,
    rank: rank,
    playerCount: playerCount,
    myRun: myRun,
    registerLookup: registerLookup,
    logGap: logGap,
    streakOf: streakOf,
    streakBoard: streakBoard,
    allTimeBoard: allTimeBoard,
    allTimePage: allTimePage,
    allTimeStats: allTimeStats,
    spendToken: spendToken,
    tokenStatus: tokenStatus,
    fmtTime: function (s) { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
  };
})();
