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
  var offline = false;
  var lastError = null;
  var listeners = [];

  function fire() { for (var i = 0; i < listeners.length; i++) { try { listeners[i](state()); } catch (e) {} } }
  function state() {
    return {
      ready: !!sb,
      signedIn: !!session,
      name: name,
      userId: session && session.user && session.user.id,
      offline: offline,
      lastError: lastError
    };
  }

  function boot() {
    if (!(window.supabase && window.supabase.createClient)) { offline = true; return false; }
    try {
      sb = window.supabase.createClient(SB_URL, SB_ANON, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      });
    } catch (e) { sb = null; offline = true; return false; }
    sb.auth.onAuthStateChange(function (_evt, s) {
      session = s || null;
      if (session) loadName().then(fire); else { name = null; fire(); }
    });
    sb.auth.getSession().then(function (r) {
      session = (r && r.data && r.data.session) || null;
      if (session) return loadName().then(fire);
      fire();
    }).catch(fire);
    return true;
  }

  function loadName() {
    if (!session) { name = null; return Promise.resolve(); }
    return sb.from('profiles').select('username').eq('id', session.user.id).single()
      .then(function (r) { name = (r && r.data && r.data.username) || null; })
      .catch(function () { name = null; });
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

  // ---- submit a completed run. Returns {streak, best_streak} or null. ----
  function submit(game, dateStr, opts) {
    if (!session) return Promise.resolve(null);   // signed-in only; guests keep local
    opts = opts || {};
    var body = JSON.stringify({
      p_game: game, p_date: dateStr,
      p_seconds: Math.max(0, Math.round(opts.seconds || 0)),
      p_mistakes: opts.mistakes || 0,
      p_reveals: opts.reveals || 0,
      p_run_len: (opts.runLen == null ? null : Math.max(0, Math.round(opts.runLen)))
    });
    return withTimeout(
      fetch(REST + 'rpc/grid_submit_run', { method: 'POST', headers: headers({ 'Content-Type': 'application/json' }), body: body })
        .then(function (res) { if (!res.ok) return fail('submit', res); offline = false; return res.json(); })
    );
  }

  // ---- top rows for a game's day. Returns array (maybe empty) or null. ----
  function leaderboard(game, dateStr, limit) {
    var q = REST + 'grid_runs?game=eq.' + encodeURIComponent(game) +
      '&puzzle_date=eq.' + encodeURIComponent(dateStr) +
      '&order=score.asc,created_at.asc&limit=' + (limit || 5) +
      '&select=display_name,base_seconds,mistakes,reveals,run_len,score,flawless';
    return withTimeout(
      fetch(q, { headers: headers() })
        .then(function (res) { if (!res.ok) return fail('leaderboard', res); offline = false; return res.json(); })
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

  window.RTG_BOARD = {
    boot: boot,
    state: state,
    onChange: function (fn) { listeners.push(fn); if (sb || offline) fn(state()); },
    submit: submit,
    leaderboard: leaderboard,
    rank: rank,
    streakOf: streakOf,
    fmtTime: function (s) { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
  };
})();
