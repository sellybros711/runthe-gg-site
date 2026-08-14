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
  function fail(where, res) {
    offline = true;
    return res.text().then(function (b) {
      try { b = JSON.parse(b); } catch (e) {}
      lastError = { where: where, status: res.status, message: (b && (b.message || b.hint)) || res.statusText };
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
   * rejects some runs on purpose — an unknown game key, a date outside the
   * window, an implausible time, a free account past its daily ranked cap —
   * and those are decisions, not accidents. Re-sending them would spin
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

  function post(run) {
    var body = JSON.stringify({
      p_game: run.game, p_date: run.date, p_seconds: run.seconds,
      p_mistakes: run.mistakes, p_reveals: run.reveals, p_run_len: run.runLen
    });
    // `null` here means "no answer" (timeout/network) — worth another try.
    // `false` means the server answered and said no — never worth retrying.
    return withTimeout(
      fetch(REST + 'rpc/grid_submit_run', { method: 'POST', headers: headers({ 'Content-Type': 'application/json' }), body: body })
        .then(function (res) {
          if (res.ok) { offline = false; return res.json(); }
          if (res.status >= 500 || res.status === 429) return fail('submit', res);   // transient → null
          return fail('submit', res).then(function () { return false; });            // refused → false
        })
    );
  }

  // ---- submit a completed run. Returns {streak, best_streak} or null. ----
  function submit(game, dateStr, opts) {
    if (!session) return Promise.resolve(null);   // signed-in only; guests keep local
    // Every game funnels its ranked result through here, so this is the one
    // place the server's token verdict has to be honoured. If the wallet was
    // faked (localStorage cleared to mint plays) the spend RPC refused, and
    // the run that refusal covers must not reach the leaderboard.
    try { if (window.RTGTokens && RTGTokens.rankAuthorized && !RTGTokens.rankAuthorized()) return Promise.resolve(null); } catch (e) {}
    opts = opts || {};
    var run = {
      game: game, date: dateStr,
      seconds: Math.max(0, Math.round(opts.seconds || 0)),
      mistakes: opts.mistakes || 0,
      reveals: opts.reveals || 0,
      runLen: (opts.runLen == null ? null : Math.max(0, Math.round(opts.runLen)))
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

  // ---- server-side Arcade token wallet (signed-in users). spendToken() is the
  // source of truth for a ranked play; tokenStatus() reads remaining without
  // spending. Both resolve null when signed-out / offline (caller falls back to
  // the client wallet). See supabase/69_arcade_card.sql. ----
  function spendToken() {
    if (!sb || !session) return Promise.resolve(null);
    return withTimeout(sb.rpc('arcade_spend_token').then(function (r) { return (r && !r.error) ? r.data : null; }));
  }
  function tokenStatus() {
    if (!sb || !session) return Promise.resolve(null);
    return withTimeout(sb.rpc('arcade_tokens_status').then(function (r) { return (r && !r.error) ? r.data : null; }));
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
  // call. The RPC reads auth.uid() itself, so this is safe to call signed-out —
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
