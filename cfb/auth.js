/*
 * auth.js - accounts for College Football: Perfect Season.
 *
 * THERE IS NO NEW ACCOUNT SYSTEM HERE. The site already has one and this uses it:
 * `profiles` from supabase/10_accounts.sql, and the email-and-password and Google
 * sign-in the other games already have configured on the project. A RunThe.GG
 * account IS the account here, which is why this needs no dashboard work: the
 * providers, the redirect URLs and the email templates are already set up.
 *
 * The session lives in supabase-js under its default storage key, the same key the
 * rest of the site reads, so signing in here signs you in on the football game and
 * the other way round.
 *
 * OPTIONAL, exactly like board.js. If the CDN is blocked or the library fails to
 * load, every function here answers "not signed in" and the game runs as it did
 * before, with seasons recorded anonymously. An account is a way to put your name
 * on a season, not a gate in front of playing one.
 *
 * THE DISPLAY NAME IS NEVER SENT FROM HERE. cfb_submit_run() reads it out of
 * profiles for auth.uid(). Nothing in this file can put a name on a row.
 */
(function () {
  'use strict';

  const SB_URL = 'https://jcrrxqfpdelrmvjuihnm.supabase.co';
  /* Public by design: it is already in the page source of every other game on this
     site, and RLS lets it read the board and call three functions. It cannot
     insert, update or delete a row directly. */
  const SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpjcnJ4cWZwZGVscm12anVpaG5tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3OTY5NjIsImV4cCI6MjA5NjM3Mjk2Mn0.wyjoZpa2yRW-l38-KMGqBvEgTlW9v1KheNye7csWAlM';

  let sb = null;
  let session = null;
  let profile = null;          // { username }
  const listeners = [];
  /* Whether the library is still expected to turn up. Three states, not two: not
     here yet is a different thing from not coming, and the difference is what the
     UI needs to decide between a spinner and an apology. */
  let waiting = true;
  let waitTimer = null;

  /* Overridable so a test can point the whole module at a local stand-in. */
  const url = () => window.PS_CFB_BOARD_URL || SB_URL;

  /* THE LIBRARY IS DEFERRED, AND boot() USED TO BE ONE SHOT.
     supabase-js is loaded with `defer`, so it executes after the document is parsed.
     boot() is called from the game's own boot, which is async and normally spends
     long enough fetching player data for the library to have landed. NORMALLY. On a
     repeat visit the data comes out of the browser cache in a few milliseconds while
     the script is still in flight over a slow connection, and boot() then found no
     window.supabase, returned false, and NOTHING EVER TRIED AGAIN: accounts were
     permanently offline for that page load, on exactly the connections where they
     were most likely to be wanted.

     So it retries. Cheap poll, because there is no load event to hang this on that
     is not also the thing being waited for, and a deadline, because a genuinely
     blocked CDN has to end as a clear "not available" rather than a spinner that
     never stops. */
  const RETRY_MS = 150, GIVE_UP_MS = 15000;
  function boot() {
    if (sb) return true;
    if (start()) return true;
    if (waitTimer) return false;       // already waiting
    const deadline = Date.now() + GIVE_UP_MS;
    waitTimer = setInterval(() => {
      if (start()) { clearInterval(waitTimer); waitTimer = null; return; }
      if (Date.now() > deadline) {
        clearInterval(waitTimer); waitTimer = null;
        waiting = false;               // it is not coming
        fire();
      }
    }, RETRY_MS);
    return false;
  }

  function start() {
    if (!(window.supabase && window.supabase.createClient)) return false;
    try {
      sb = window.supabase.createClient(url(), SB_ANON, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      });
    } catch (e) { sb = null; waiting = false; fire(); return false; }
    waiting = false;
    sb.auth.onAuthStateChange((evt, s) => {
      session = s || null;
      if (session) loadProfile().then(fire); else { profile = null; fire(); }
    });
    sb.auth.getSession().then((r) => {
      session = (r && r.data && r.data.session) || null;
      if (session) return loadProfile().then(fire);
      fire();
    }).catch(fire);
    return true;
  }

  const fire = () => listeners.forEach((f) => { try { f(state()); } catch (e) {} });
  const state = () => ({
    ready: !!sb,
    /* True while the library might still arrive. `ready` false and `waiting` true is
       "checking"; both false is "accounts are not available". */
    waiting: waiting && !sb,
    signedIn: !!session,
    email: session && session.user && session.user.email,
    userId: session && session.user && session.user.id,
    name: profile && profile.username,
  });

  /* The profile row is created by the handle_new_user trigger at sign-up, so this
     only reads. A row with no username yet is the normal state right after a Google
     sign-in, which is why the UI has a "choose a name" step. */
  async function loadProfile() {
    if (!session) { profile = null; return; }
    try {
      const { data } = await sb.from('profiles').select('username')
        .eq('id', session.user.id).maybeSingle();
      profile = data || null;
    } catch (e) { profile = null; }
  }

  /* ---------------- sign in ----------------
     Errors are returned rather than thrown, and returned as the server's own words:
     "Invalid login credentials" is worth showing, "an error occurred" is not. */
  const wrap = async (p) => {
    if (!sb) return { error: 'Accounts are not available right now.' };
    try {
      const { error } = await p;
      return { error: error ? (error.message || String(error)) : null };
    } catch (e) { return { error: (e && e.message) || 'that did not work' }; }
  };

  const signIn = (email, password) =>
    wrap(sb.auth.signInWithPassword({ email: email.trim(), password }));

  /* The username travels in the sign-up metadata, which is what handle_new_user
     reads to make the profile row. It is checked for availability first so the
     failure comes before the account exists rather than after. */
  async function signUp(email, password, username) {
    if (!sb) return { error: 'Accounts are not available right now.' };
    const free = await available(username);
    if (free === false) return { error: 'That name is taken.' };
    if (free === null) return { error: 'Could not check that name. Try again.' };
    return wrap(sb.auth.signUp({
      email: email.trim(), password,
      options: { data: { username }, emailRedirectTo: location.origin + location.pathname },
    }));
  }

  const signInGoogle = () => wrap(sb.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: location.origin + location.pathname },
  }));

  async function signOut() {
    if (!sb) return;
    try { await sb.auth.signOut({ scope: 'local' }); }
    catch (e) { try { await sb.auth.signOut(); } catch (e2) {} }
    session = null; profile = null; fire();
  }

  /* ---------------- the name ---------------- */
  async function available(username) {
    if (!sb) return null;
    try {
      const { data, error } = await sb.rpc('username_available', { p_username: username });
      return error ? null : !!data;
    } catch (e) { return null; }
  }

  /* set_username() validates the format and the uniqueness server-side, so the
     client's own check is a courtesy and not the rule. cfb_rename_runs() then fixes
     the name on every season already recorded, which is the price of the board
     storing a copy rather than joining profiles on every read. */
  async function setName(username) {
    if (!sb) return { error: 'Accounts are not available right now.' };
    const r = await wrap(sb.rpc('set_username', { p_username: username }));
    if (r.error) return r;
    await loadProfile();
    try { await sb.rpc('cfb_rename_runs'); } catch (e) {}
    fire();
    return { error: null };
  }

  /* The season you finished as a guest, taken over now that you are signed in.
     Returns false if it was already owned, which is what stops an id in a URL being
     enough to claim somebody else's season. */
  async function claim(runId) {
    if (!sb || !session || !runId) return false;
    try {
      const { data, error } = await sb.rpc('cfb_claim_run', { p_id: runId });
      return !error && data === true;
    } catch (e) { return false; }
  }

  /* board.js signs its requests with the anon key. Once somebody is signed in the
     RPC has to see their JWT instead, or auth.uid() is null and the season records
     as a guest, so this hands the live access token over. */
  const token = () => (session && session.access_token) || null;

  window.PS_CFB_AUTH = {
    API_VERSION: 1,
    boot, state, onChange: (f) => { listeners.push(f); return () => {}; },
    signIn, signUp, signInGoogle, signOut,
    available, setName, claim, token,
  };
})();
