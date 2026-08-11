/*
 * auth.js - accounts for Run The Arcade.
 *
 * There is NO new account system here. It is the SAME RunThe.GG account the rest of
 * the site uses: `profiles` from supabase/10_accounts.sql, and the email+password,
 * username, and Google sign-in the other games already have configured on the project.
 * A RunThe.GG account IS the account here, so this needed no dashboard work.
 *
 * The session lives in supabase-js under its default storage key, the same key
 * board.js and every other game read, so signing in here signs you in everywhere and
 * the other way round. RunTheTour (/golf) keeps its own session key, so we bridge the
 * session blob to it the same way the home page does - this is what makes one account
 * follow you into Arcade, Football, Soccer, Golf and back.
 *
 * OPTIONAL, exactly like board.js. If the supabase-js CDN is blocked or the library
 * fails to load, every function answers "not signed in" and the games run exactly as
 * before, recording runs locally. Accounts put your name on a run; they never gate one.
 *
 * The display name is never sent from here. grid_submit_run() reads it out of profiles
 * for auth.uid(); nothing in this file can put a name on a row.
 */
(function () {
  'use strict';

  var SB_URL = 'https://jcrrxqfpdelrmvjuihnm.supabase.co';
  var SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpjcnJ4cWZwZGVscm12anVpaG5tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3OTY5NjIsImV4cCI6MjA5NjM3Mjk2Mn0.wyjoZpa2yRW-l38-KMGqBvEgTlW9v1KheNye7csWAlM';
  var PROJECT_REF = 'jcrrxqfpdelrmvjuihnm';
  var DEFAULT_KEY = 'sb-' + PROJECT_REF + '-auth-token';   // supabase-js default key (Arcade, Football, Soccer read this)
  var GOLF_KEY = 'sb-runtour-auth';                        // RunTheTour's dedicated session key

  var sb = null;
  var session = null;
  var profile = null;                 // { username }
  var recovery = false;               // true after arriving via a password-reset link
  var listeners = [];

  function fire() { for (var i = 0; i < listeners.length; i++) { try { listeners[i](state()); } catch (e) {} } }
  function state() {
    return {
      ready: !!sb,
      signedIn: !!session,
      email: session && session.user && session.user.email,
      userId: session && session.user && session.user.id,
      name: profile && profile.username,
      recovery: recovery
    };
  }

  // ---- cross-game session bridge (mirror of the home page's) --------------------
  // The default key already covers Arcade/Football/Soccer. Golf reads GOLF_KEY, so we
  // copy the token blob there on sign-in and purge it on sign-out. On boot we also
  // copy an existing Golf session INTO the default key so arriving from Golf reads
  // as signed-in before createClient looks.
  function sessionBlob() {
    try {
      var b = localStorage.getItem(DEFAULT_KEY);
      if (b && b.indexOf('access_token') >= 0) return b;
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf('sb-') === 0 && /auth-token$/.test(k) && k !== GOLF_KEY) {
          var v = localStorage.getItem(k);
          if (v && v.indexOf('access_token') >= 0) return v;
        }
      }
    } catch (e) {}
    return null;
  }
  function bridgeSession() {
    try {
      var blob = sessionBlob();
      if (blob) { localStorage.setItem(GOLF_KEY, blob); localStorage.setItem('rtt_remember', '1'); }
    } catch (e) {}
  }
  function bridgeClear() {
    try {
      localStorage.removeItem(GOLF_KEY);
      localStorage.removeItem('rtt_remember');
      localStorage.removeItem('rtt_oauth_pending');
      localStorage.removeItem('rtp_oauth_pending');
      // Shared-device hygiene: the previous account's remaining token count
      // and Pro flag would otherwise carry over to the next signer on this
      // browser until the next reconcile / syncPro (a ~1s window on Pro,
      // longer on the token counter). Clear them at sign-out.
      localStorage.removeItem('runthegrid_tokens_v3');
      localStorage.removeItem('runthegrid_pro');
    } catch (e) {}
  }
  function bridgeInbound() {
    // arriving from Golf: if the default key is empty but Golf has a session, adopt it
    try {
      var def = localStorage.getItem(DEFAULT_KEY);
      if (!(def && def.indexOf('access_token') >= 0)) {
        var golf = localStorage.getItem(GOLF_KEY);
        if (golf && golf.indexOf('access_token') >= 0) localStorage.setItem(DEFAULT_KEY, golf);
      }
    } catch (e) {}
  }

  function boot() {
    if (sb) return true;
    if (!(window.supabase && window.supabase.createClient)) return false;
    bridgeInbound();
    try {
      sb = window.supabase.createClient(SB_URL, SB_ANON, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      });
    } catch (e) { sb = null; return false; }
    sb.auth.onAuthStateChange(function (evt, s) {
      if (evt === 'INITIAL_SESSION') return;   // getSession() below handles the first read
      // Arrived from a reset email: supabase-js parsed the recovery token into a
      // short-lived session. Flag it so the UI can show "set a new password".
      if (evt === 'PASSWORD_RECOVERY') recovery = true;
      session = s || null;
      if (session) bridgeSession(); else bridgeClear();
      if (session) loadProfile().then(fire); else { profile = null; fire(); }
    });
    sb.auth.getSession().then(function (r) {
      session = (r && r.data && r.data.session) || null;
      if (session) { bridgeSession(); return loadProfile().then(fire); }
      fire();
    }).catch(fire);
    return true;
  }

  // profile row is created by handle_new_user at sign-up; a null username is the
  // normal state right after a Google sign-in (hence the "choose a name" step).
  function loadProfile() {
    if (!sb || !session) { profile = null; return Promise.resolve(); }
    return sb.from('profiles').select('username').eq('id', session.user.id).maybeSingle()
      .then(function (r) { profile = (r && r.data) || null; })
      .catch(function () { profile = null; });
  }

  // Errors come back as the server's own words ("Invalid login credentials" is worth
  // showing, "an error occurred" is not), never thrown.
  function wrap(p) {
    if (!sb) return Promise.resolve({ error: 'Accounts are offline right now. Try again shortly.' });
    return Promise.resolve(p)
      .then(function (r) { return { error: r && r.error ? (r.error.message || String(r.error)) : null }; })
      .catch(function (e) { return { error: (e && e.message) || 'That did not work.' }; });
  }

  // Username OR email login: a bare username is resolved to its email first, but only
  // if the password checks out (email_for_login is the site's current, password-gated
  // login RPC - the old anon email_for_username hole was revoked).
  function signIn(idOrEmail, password) {
    if (!sb) return Promise.resolve({ error: 'Accounts are offline right now. Try again shortly.' });
    var id = String(idOrEmail || '').trim();
    var pre = id.indexOf('@') < 0
      ? sb.rpc('email_for_login', { p_username: id, p_password: password })
          .then(function (r) { if (r.error || !r.data) throw new Error('Wrong username or password.'); return r.data; })
      : Promise.resolve(id);
    return pre
      .then(function (email) { return sb.auth.signInWithPassword({ email: email, password: password }); })
      .then(function (res) {
        if (res.error) throw new Error(/invalid/i.test(res.error.message || '') ? 'Wrong email/username or password.' : (res.error.message || 'Sign-in failed.'));
        return { error: null };
      })
      .catch(function (e) { return { error: (e && e.message) || 'Sign-in failed.' }; });
  }

  // The username travels in sign-up metadata (handle_new_user reads it to make the
  // profile row). Availability is checked first so a taken name fails before the
  // account exists rather than after.
  function signUp(email, password, username) {
    if (!sb) return Promise.resolve({ error: 'Accounts are offline right now. Try again shortly.' });
    return available(username).then(function (free) {
      if (free === false) return { error: 'That username is taken. Try another.' };
      if (free === null) return { error: 'Could not check that name. Try again.' };
      return wrap(sb.auth.signUp({
        email: String(email).trim(), password: password,
        options: { data: { username: username }, emailRedirectTo: location.origin + location.pathname }
      })).then(function (r) {
        // no session back = email confirmation required; caller shows the note
        if (!r.error && !(session)) { r.needsConfirm = true; }
        return r;
      });
    });
  }

  function signInGoogle() {
    if (!sb) return Promise.resolve({ error: 'Accounts are offline right now. Try again shortly.' });
    try { localStorage.setItem('rtp_oauth_pending', '1'); localStorage.setItem('rtt_oauth_pending', '1'); } catch (e) {}
    return wrap(sb.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: location.origin + location.pathname }
    })).then(function (r) {
      if (r.error) { try { localStorage.removeItem('rtp_oauth_pending'); localStorage.removeItem('rtt_oauth_pending'); } catch (e) {} }
      return r;
    });
  }

  function signOut() {
    if (!sb) { session = null; profile = null; bridgeClear(); fire(); return Promise.resolve(); }
    return sb.auth.signOut({ scope: 'local' })
      .catch(function () { return sb.auth.signOut().catch(function () {}); })
      .then(function () { session = null; profile = null; bridgeClear(); fire(); });
  }

  function available(username) {
    if (!sb) return Promise.resolve(null);
    return sb.rpc('username_available', { p_username: username })
      .then(function (r) { return r.error ? null : !!r.data; })
      .catch(function () { return null; });
  }

  // set_username validates format + uniqueness server-side; the client check is a
  // courtesy. New name applies to future runs; older grid_runs keep the copied name.
  function setName(username) {
    if (!sb) return Promise.resolve({ error: 'Accounts are offline right now. Try again shortly.' });
    return wrap(sb.rpc('set_username', { p_username: username })).then(function (r) {
      if (r.error) return r;
      return loadProfile().then(function () { bridgeSession(); fire(); return { error: null }; });
    });
  }

  // ---- password reset ----------------------------------------------------------
  // Step 1: email a reset link. redirectTo brings the reader back to the page they
  // asked from; on arrival supabase-js fires PASSWORD_RECOVERY (handled above) and
  // the UI shows the "set a new password" step. We do not reveal whether the email
  // exists - the caller shows the same "check your email" note either way.
  function resetPassword(email) {
    if (!sb) return Promise.resolve({ error: 'Accounts are offline right now. Try again shortly.' });
    return wrap(sb.auth.resetPasswordForEmail(String(email || '').trim(), {
      redirectTo: location.origin + location.pathname
    }));
  }
  // Step 2: set the new password inside the recovery session. On success the reader
  // is signed in with the new password; clear the recovery flag so the UI moves on.
  function updatePassword(newPassword) {
    if (!sb) return Promise.resolve({ error: 'Accounts are offline right now. Try again shortly.' });
    return wrap(sb.auth.updateUser({ password: newPassword })).then(function (r) {
      if (!r.error) { recovery = false; fire(); }
      return r;
    });
  }

  var token = function () { return (session && session.access_token) || null; };

  // Ending the account is one RPC (supabase/65_delete_account.sql). A refusal (e.g. a
  // live Stripe subscription) is NOT an error; the caller tells the outcomes apart.
  function deleteAccount() {
    if (!sb) return Promise.resolve({ error: 'Accounts are offline right now. Try again shortly.' });
    return sb.rpc('rtg_delete_my_account')
      .then(function (r) {
        if (r.error) return { error: r.error.message || String(r.error) };
        var d = r.data;
        if (!d || d.ok !== true) return { reason: (d && d.reason) || 'failed', status: d && d.status };
        return signOut().then(function () { return { ok: true }; });
      })
      .catch(function (e) { return { error: (e && e.message) || 'That did not work.' }; });
  }

  window.RTG_AUTH = {
    API_VERSION: 1,
    boot: boot,
    state: state,
    onChange: function (f) { listeners.push(f); if (sb) f(state()); return function () {}; },
    signIn: signIn, signUp: signUp, signInGoogle: signInGoogle, signOut: signOut,
    available: available, setName: setName, token: token, deleteAccount: deleteAccount,
    resetPassword: resetPassword, updatePassword: updatePassword
  };
})();
