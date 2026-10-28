/*
 * rewarded.js : a player chooses to watch a short ad for one extra thing.
 *
 *   RTG_AD.status(kind, target, max)            {ok, reason, left}. Show the button only when ok.
 *   RTG_AD.setPlayer(fn)                        the network's player: fn(done) plays one video and
 *                                               calls done(true) only when it has finished.
 *   RTG_AD.ready()                              true once a player is set. Show a button only on this.
 *   RTG_AD.watch(kind, target, max, opts)       issue a code, play, claim. opts.onGranted(answer),
 *                                               opts.onReason(reason). Resolves with the answer.
 *
 * THE RULES THIS FILE KEEPS (the owner's, 2026-10-28):
 *  - The player always chooses. Nothing here starts a video on its own.
 *  - The reward is granted by the server, through ad_reward_claim, and never by this page. A
 *    page can be forged, so nothing on the page is trusted beyond "a view was reported".
 *  - A guest is never offered the video. status answers 'sign_in' and the caller shows the
 *    sign-in prompt, then offers the video once signed in.
 *  - The switch lives on the server (ad_rewards_live). Until Google approves the owner, the
 *    player is never set, and watch() answers 'off' without a round trip.
 *  - Every call fails soft. A null or a thrown error answers {ok:false, reason:'error'}, and
 *    the game carries on exactly as it did without an ad.
 *
 * THE NETWORK IS NOT CHOSEN YET. Google's H5 Games program is the candidate, and it has not
 * approved the site. When it does, setPlayer() gets the real player. Until then this file
 * can be tested with a stand-in player, and that is what check-rewarded.mjs does.
 */
(function (root) {
  'use strict';
  if (root.RTG_AD) return;

  var SB_URL = 'https://jcrrxqfpdelrmvjuihnm.supabase.co';
  var SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpjcnJ4cWZwZGVscm12anVpaG5tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3OTY5NjIsImV4cCI6MjA5NjM3Mjk2Mn0.wyjoZpa2yRW-l38-KM';
  var TIMEOUT_MS = 12000;

  /* The same token rule as cloudsave.js: whichever auth module this page loaded. A page with no
     session has no reward to give, so a null token is a sign_in answer, not an error. */
  function token() {
    var a = root.PS_AUTH || root.PS_CFB_AUTH || root.RTF_AUTH;
    var t = a && typeof a.token === 'function' ? a.token() : null;
    return t || null;
  }

  function rpc(name, body) {
    var tok = token();
    if (!tok) return Promise.resolve({ ok: false, reason: 'sign_in' });
    var ctl = typeof AbortController === 'function' ? new AbortController() : null;
    var t = setTimeout(function () { if (ctl) ctl.abort(); }, TIMEOUT_MS);
    return fetch(SB_URL + '/rest/v1/rpc/' + name, {
      method: 'POST', signal: ctl ? ctl.signal : undefined,
      headers: { apikey: SB_ANON, Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function (r) {
      clearTimeout(t);
      return r.ok ? r.json() : { ok: false, reason: 'error' };
    }).catch(function () { clearTimeout(t); return { ok: false, reason: 'error' }; })
      .then(function (a) { return a && typeof a === 'object' ? a : { ok: false, reason: 'error' }; });
  }

  var player = null;
  var busy = false;

  function status(kind, target, max) {
    return rpc('ad_reward_status', { p_kind: kind, p_target: target || null, p_max: max });
  }

  function issue(kind, target, max) {
    return rpc('ad_reward_issue', { p_kind: kind, p_target: target || null, p_max: max });
  }

  function claim(code, max) {
    return rpc('ad_reward_claim', { p_code: code, p_max: max });
  }

  /* One video at a time. A second tap while one is open does nothing, so a double tap can never
     play two ads for one reward. */
  function watch(kind, target, max, opts) {
    opts = opts || {};
    var say = function (answer) {
      if (!answer.ok && opts.onReason) opts.onReason(answer.reason);
      if (answer.ok && opts.onGranted) opts.onGranted(answer);
      return answer;
    };
    if (busy) return Promise.resolve({ ok: false, reason: 'busy' });
    if (!player) return Promise.resolve(say({ ok: false, reason: 'off' }));
    busy = true;
    return issue(kind, target, max).then(function (got) {
      if (!got.ok) { busy = false; return say(got); }
      return new Promise(function (resolve) {
        player(function (finished) {
          if (!finished) { busy = false; return resolve(say({ ok: false, reason: 'closed' })); }
          claim(got.code, max).then(function (answer) {
            busy = false;
            resolve(say(answer));
          });
        });
      });
    });
  }

  root.RTG_AD = {
    status: status,
    watch: watch,
    setPlayer: function (fn) { player = typeof fn === 'function' ? fn : null; },
    /* True only once a player is set. A game shows its button on this, so nothing is offered
       on a site whose network has not approved it. */
    ready: function () { return !!player; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
