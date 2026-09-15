/*
 * cloudsave.js : a run in progress, kept against the account instead of the browser.
 *
 * WHY THIS IS SHARED. The football game and the college game both had the same save and the
 * same bug in it, written twice: a run in localStorage and nothing anywhere else. Two copies
 * of a sync rule is two chances to get the conflict wrong, and the one that is wrong is
 * whichever was edited second. Same argument /assets/store.js makes about a price.
 *
 *   RTG_SAVE.get(game, slot)                  what the account has stored, or null
 *   RTG_SAVE.all(game)                        every slot of one game, in one round trip
 *   RTG_SAVE.put(game, slot, payload, prog)   {ok, payload, progress, savedAt} or null
 *   RTG_SAVE.drop(game, slot)                 the run is over. Removes it.
 *   RTG_SAVE.queue(game, slot, fn)            put, coalesced, at most one in flight per slot
 *
 * LOCAL FIRST, ALWAYS. Nothing here is on the path between a player's tap and the screen
 * responding. The page writes localStorage and returns, exactly as it always did, and this
 * catches up behind it. A dynasty autosaves on every roster move, and a game that waited on a
 * round trip for each of those would be a worse game than one that loses a save, which is
 * saying something.
 *
 * SO EVERY CALL FAILS SOFT and answers null. There is no state in this module that a failure
 * can corrupt, and no caller is allowed to treat null as "you have no save": it means this
 * module has no opinion, and the local copy stands. The whole point is to lose runs less
 * often, so a cloud that cannot be reached must never be the reason one goes.
 *
 * PROGRESS IS THE CONFLICT RULE and it lives in supabase/103_cloud_saves.sql, not here. A
 * write that would move a save backwards is refused by the server and the answer carries what
 * is stored instead, so a caller that pushes a stale run is told, once, with the newer run in
 * hand. Every game supplies its own progress number because only the game knows what further
 * along means.
 */
(function (root) {
  'use strict';
  if (root.RTG_SAVE) return;

  var SB_URL = 'https://jcrrxqfpdelrmvjuihnm.supabase.co';
  var SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpjcnJ4cWZwZGVscm12anVpaG5tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3OTY5NjIsImV4cCI6MjA5NjM3Mjk2Mn0.wyjoZpa2yRW-l38-KMGqBvEgTlW9v1KheNye7csWAlM';
  var TIMEOUT_MS = 12000;

  /* Overridable the way board.js allows, so a check can point the module at a stand-in
     without touching the shipped constants. */
  function base() { return (root.PS_BOARD_URL || SB_URL) + '/rest/v1/'; }

  /* THE TOKEN, FROM WHICHEVER AUTH MODULE THIS PAGE LOADED. The two games ship separate auth
     clients against one project, and this file is loaded by both. Anonymous is not a fallback
     worth having: every function in 103 raises without auth.uid(), so a page with no session
     would spend a round trip to be told what it already knew. */
  function token() {
    var a = root.PS_AUTH || root.PS_CFB_AUTH;
    var t = a && typeof a.token === 'function' ? a.token() : null;
    return t || null;
  }

  function headers(tok) {
    return { apikey: SB_ANON, Authorization: 'Bearer ' + tok,
      'Content-Type': 'application/json' };
  }

  /* A hung request must not leave a queued save in flight for ever, because `busy` below is
     what stops the next one going out. */
  function timed(url, opts) {
    var ctl = typeof AbortController === 'function' ? new AbortController() : null;
    var t = setTimeout(function () { if (ctl) ctl.abort(); }, TIMEOUT_MS);
    opts = opts || {};
    opts.signal = ctl ? ctl.signal : undefined;
    return fetch(url, opts).then(function (r) { clearTimeout(t); return r; },
      function (e) { clearTimeout(t); throw e; });
  }

  var offline = false;
  var lastError = null;

  function call(fn, body) {
    var tok = token();
    if (!tok) return Promise.resolve(null);
    return timed(base() + 'rpc/' + fn, {
      method: 'POST', headers: headers(tok), body: JSON.stringify(body || {}),
    }).then(function (res) {
      if (!res.ok) {
        offline = true;
        return res.text().catch(function () { return ''; }).then(function (t) {
          lastError = fn + ' ' + res.status + ' ' + String(t).slice(0, 200);
          return null;
        });
      }
      offline = false;
      return res.json().catch(function () { return null; });
    }, function (e) {
      offline = true;
      lastError = fn + ' ' + ((e && e.message) || 'failed');
      return null;
    });
  }

  /* PostgREST hands back a `returns table` function as an array of rows. One row or none for
     the single-slot calls; a row per slot for all(). */
  function row(r) {
    var o = Array.isArray(r) ? r[0] : r;
    if (!o) return null;
    return { ok: o.ok !== false, slot: o.slot || null,
      progress: o.progress == null ? 0 : Number(o.progress),
      payload: o.payload == null ? null : o.payload,
      savedAt: o.saved_at || null };
  }

  function get(game, slot) {
    return call('ps_save_get', { p_game: game, p_slot: slot }).then(function (r) {
      return r == null ? null : row(r);
    });
  }

  function all(game) {
    return call('ps_save_all', { p_game: game }).then(function (r) {
      if (r == null) return null;
      return (Array.isArray(r) ? r : [r]).map(function (o) { return row(o); })
        .filter(function (o) { return !!o; });
    });
  }

  function put(game, slot, payload, progress) {
    return call('ps_save_put', { p_game: game, p_slot: slot, p_payload: payload,
      p_progress: Math.max(0, Math.floor(Number(progress) || 0)) }).then(function (r) {
      return r == null ? null : row(r);
    });
  }

  function drop(game, slot) {
    return call('ps_save_drop', { p_game: game, p_slot: slot }).then(function (r) {
      return r == null ? null : true;
    });
  }

  /*
   * ONE WRITE IN FLIGHT PER SLOT, AND ONLY THE LATEST ONE WAITING.
   *
   * A dynasty offseason writes a save on every cut, every signing and every spin, which is
   * dozens of them inside a minute. Sending each would be dozens of round trips racing each
   * other to the same row, and the one that lands last is whichever the network happened to
   * favour rather than the newest. So a slot has at most one request out and at most one
   * pending, the pending one is always replaced rather than queued behind, and the payload is
   * built at SEND time by the callback rather than captured at queue time, so what goes up is
   * the run as it stands when the wire is free.
   *
   * The callback returns {payload, progress}, or {drop:true} to delete, or null to skip.
   * Answers a promise for the caller that wants to wait, which is the checks and nothing in
   * the game.
   *
   * A DELETE GOES THROUGH THE SAME QUEUE, and that is not tidiness. Starting over deletes the
   * row and then saves the new run a moment later, and those two racing each other over the
   * open network land in whichever order the network liked: the delete arriving second takes
   * the NEW run with it. Through one queue they are in the order they were asked for, and the
   * delete also discards whatever put was still pending, which is by definition a write of
   * the run being thrown away.
   */
  var busy = {}, pending = {}, waiters = {};

  function queue(game, slot, build) {
    var key = game + '/' + slot;
    pending[key] = build;
    if (!waiters[key]) waiters[key] = [];
    var p = new Promise(function (resolve) { waiters[key].push(resolve); });
    pump(game, slot, key);
    return p;
  }

  function pump(game, slot, key) {
    if (busy[key] || !pending[key]) return;
    var build = pending[key];
    pending[key] = null;
    var made = null;
    try { made = build(); } catch (e) { made = null; }
    if (!made || (!made.payload && !made.drop)) { settle(key, null); return; }
    busy[key] = true;
    var sent = made.drop ? drop(game, slot) : put(game, slot, made.payload, made.progress);
    sent.then(function (r) {
      busy[key] = false;
      settle(key, made.drop ? null : r);
      pump(game, slot, key);
    }, function () {
      busy[key] = false;
      settle(key, null);
      pump(game, slot, key);
    });
  }

  function settle(key, r) {
    var list = waiters[key] || [];
    waiters[key] = [];
    for (var i = 0; i < list.length; i++) { try { list[i](r); } catch (e) {} }
  }

  /* True while anything is still on its way up, so a check can wait for quiet rather than
     guess at a timeout. */
  function idle() {
    for (var k in busy) if (busy[k] || pending[k]) return false;
    return true;
  }

  /* The ordered delete, which is the one every caller in the games wants: it discards a
     pending write of the run being thrown away and lands after anything already in flight.
     `drop` itself stays exported for a caller that genuinely wants the bare call. */
  function remove(game, slot) {
    return queue(game, slot, function () { return { drop: true }; });
  }

  root.RTG_SAVE = {
    API_VERSION: 1,
    get: get, all: all, put: put, drop: remove, dropNow: drop, queue: queue, idle: idle,
    signedIn: function () { return !!token(); },
    get offline() { return offline; },
    get lastError() { return lastError; },
  };
})(window);
