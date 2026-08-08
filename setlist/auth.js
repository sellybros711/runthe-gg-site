/*
 * auth.js - accounts for Segue: The Setlist Builder.
 *
 * There is NO new account system here. The site already has one, and this uses it:
 * `profiles` from supabase/10_accounts.sql, and the email-and-password and Google
 * sign-in the other games already have configured on the project. A RunThe.GG
 * account IS the account here. That is why this needed no dashboard work: the
 * providers, the redirect URLs and the email templates are already set up.
 *
 * The session lives in supabase-js under its default storage key, which is the same
 * key the rest of the site reads, so signing in here signs you in there and the other
 * way round.
 *
 * OPTIONAL, exactly like board.js. If the CDN is blocked or the library fails to
 * load, every function here answers "not signed in" and the game runs as it did
 * before: shows recorded anonymously, and the shows you were at kept in this
 * browser's localStorage. An account is a way to carry those to another phone and
 * to put your name on a board, not a gate in front of drafting a show.
 *
 * The display name is never sent from here. segue_submit_run() reads it out of
 * profiles for auth.uid(). Nothing in this file can put a name on a row.
 */
(function () {
  'use strict';

  const SB_URL = 'https://jcrrxqfpdelrmvjuihnm.supabase.co';
  const SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpjcnJ4cWZwZGVscm12anVpaG5tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3OTY5NjIsImV4cCI6MjA5NjM3Mjk2Mn0.wyjoZpa2yRW-l38-KMGqBvEgTlW9v1KheNye7csWAlM';

  let sb = null;
  let session = null;
  let profile = null;          // { username, segue_name }
  const listeners = [];

  /* A NAME FOR THIS GAME, and a project may be one migration behind.
     supabase/68_setlist_username.sql adds profiles.segue_name, and PostgREST
     answers a select naming a column the table does not have with a 400 -- which
     would take the WHOLE profile read down, so a signed-in player would look
     signed out. Same hazard, and the same shape of fix, as the optional column
     sets in board.js: drop it once, remember, carry on with the site username. */
  let segueColumn = true;

  const url = () => window.SEGUE_BOARD_URL || SB_URL;

  function boot() {
    if (!(window.supabase && window.supabase.createClient)) return false;
    try {
      sb = window.supabase.createClient(url(), SB_ANON, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      });
    } catch (e) { sb = null; return false; }
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
    signedIn: !!session,
    email: session && session.user && session.user.email,
    userId: session && session.user && session.user.id,
    /* WHAT THE BOARD WILL PRINT, which is the only name most of the UI cares
       about. segue_display_name() computes the same coalesce server-side; this
       is the client's copy of it so a header chip does not need a round trip. */
    name: profile && (profile.segue_name || profile.username),
    /* And the two halves, for the account sheet, which is the one place that
       has to tell them apart. */
    siteName: profile && profile.username,
    segueName: profile && profile.segue_name,
    canRename: segueColumn,
  });

  /* The profile row is created by the handle_new_user trigger at sign-up, so this
     only reads. A row with no username yet is the normal state right after a Google
     sign-in, which is why the UI has a "choose a name" step. */
  async function loadProfile() {
    if (!session) { profile = null; return; }
    const cols = () => segueColumn ? 'username,segue_name' : 'username';
    try {
      let { data, error } = await sb.from('profiles').select(cols())
        .eq('id', session.user.id).maybeSingle();
      /* Remembered, not retried forever: one fallback, then this project is
         known to be pre-68 for the rest of the session. */
      if (error && segueColumn && /segue_name/.test(error.message || '')) {
        segueColumn = false;
        ({ data } = await sb.from('profiles').select(cols())
          .eq('id', session.user.id).maybeSingle());
      }
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
     client's own check is a courtesy and not the rule. segue_rename_runs() then
     fixes the name on every show already recorded, which is the price of the board
     storing a copy rather than joining profiles on every read. */
  async function setName(username) {
    if (!sb) return { error: 'Accounts are not available right now.' };
    const r = await wrap(sb.rpc('set_username', { p_username: username }));
    if (r.error) return r;
    await loadProfile();
    try { await sb.rpc('segue_rename_runs'); } catch (e) {}
    fire();
    return { error: null };
  }

  /* ---------------- the name for THIS game ----------------
     Separate from setName() above, and deliberately so. That one changes the
     RunThe.GG account: the football and college boards follow it. This one
     changes nothing outside Segue.

     segue_set_name() validates the format, enforces uniqueness across BOTH
     namespaces, and renames every show already on the board in the same
     transaction, so the client's own availability check is a courtesy and not
     the rule. What comes back is what was stored, which is what the caller
     should then draw. */
  async function setSegueName(name) {
    if (!sb) return { error: 'Accounts are not available right now.' };
    try {
      const { data, error } = await sb.rpc('segue_set_name', { p_name: name || null });
      if (error) {
        /* The function is missing, which is 68 not having been run rather than
           anything the player did. Say which, so the UI can offer the truth
           instead of "try again". */
        if (error.code === 'PGRST202') { segueColumn = false; fire();
          return { error: 'Renaming is not switched on yet.', missing: true }; }
        return { error: error.message || String(error) };
      }
      await loadProfile();
      fire();
      return { name: data || null };
    } catch (e) { return { error: (e && e.message) || 'that did not work' }; }
  }

  /* Null when the question could not be asked, which the form shows as nothing
     rather than as "taken": a check that failed is not a refusal. */
  async function segueNameFree(name) {
    if (!sb) return null;
    try {
      const { data, error } = await sb.rpc('segue_name_free', { p_name: name });
      return error ? null : !!data;
    } catch (e) { return null; }
  }

  /* board.js signs its requests with the anon key. Once somebody is signed in the
     RPC has to see their JWT instead, or auth.uid() is null and the show records as
     a guest, so this hands the live access token over. */
  const token = () => (session && session.access_token) || null;

  window.SEGUE_AUTH = {
    API_VERSION: 1,
    boot, state, onChange: (f) => { listeners.push(f); return () => {}; },
    signIn, signUp, signInGoogle, signOut,
    available, setName, setSegueName, segueNameFree, token,
  };
})();
