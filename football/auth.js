/*
 * auth.js - accounts for The Perfect Season.
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
 * before, with runs recorded anonymously. Accounts are a way to put your name on a
 * run, not a gate in front of playing one.
 *
 * The display name is never sent from here. ps_submit_run() reads it out of profiles
 * for auth.uid(). Nothing in this file can put a name on a row.
 */
(function () {
  'use strict';

  const SB_URL = 'https://jcrrxqfpdelrmvjuihnm.supabase.co';
  const SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpjcnJ4cWZwZGVscm12anVpaG5tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3OTY5NjIsImV4cCI6MjA5NjM3Mjk2Mn0.wyjoZpa2yRW-l38-KMGqBvEgTlW9v1KheNye7csWAlM';

  let sb = null;
  let session = null;
  let profile = null;          // { username }
  /* The signed-in account's premium product keys, cached with the user id they
     belong to. null means never fetched or fetch failed, which callers treat as
     owning nothing: wrong only in the harmless direction, and the next call
     re-asks rather than trusting a failure. */
  let premium = null;
  let premiumFor = null;
  const listeners = [];

  const url = () => window.PS_BOARD_URL || SB_URL;

  function boot() {
    if (sb) return true;   // idempotent: never build a second GoTrue client for one page
    if (!(window.supabase && window.supabase.createClient)) return false;
    try {
      sb = window.supabase.createClient(url(), SB_ANON, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      });
    } catch (e) { sb = null; return false; }
    sb.auth.onAuthStateChange((evt, s) => {
      session = s || null;
      /* A different account holds different unlocks, and none holds none. */
      const pu = session && session.user && session.user.id;
      if (pu !== premiumFor) { premium = null; premiumFor = null; }
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

  /* THE PROJECT REF, WHICH IS ALSO THE STORAGE KEY. supabase-js keeps the session at
     `sb-<ref>-auth-token` in localStorage, per ORIGIN, which is what lets the two games
     on this site share one sign-in: the same project, the same key, no storageKey
     override in either. Derived from the URL rather than written out, so a project move
     cannot leave this pointing at the old one. */
  const projectRef = () => {
    try { return new URL(url()).hostname.split('.')[0] || null; } catch (e) { return null; }
  };
  /* SIGNING OUT HAS TO SURVIVE A DEAD NETWORK, and on its own it does not.
     supabase-js only clears the stored session AFTER its POST to /logout comes back, and
     it makes that call even at scope:'local'. A network failure is not one of the
     statuses it forgives (404, 401, 403), so it throws before the session is removed --
     leaving a token in localStorage while every screen says signed out, and signing the
     player straight back in on the next load. On a shared device that is somebody else's
     account still being open.
     So the stored session is removed here as well. When the call DID work this is a
     no-op on a key that is already gone. */
  function forgetStoredSession() {
    try {
      const ref = projectRef(); if (!ref) return;
      localStorage.removeItem('sb-' + ref + '-auth-token');
      localStorage.removeItem('sb-' + ref + '-auth-token-code-verifier');
    } catch (e) {}
  }
  async function signOut() {
    if (!sb) return;
    try { await sb.auth.signOut({ scope: 'local' }); }
    catch (e) { try { await sb.auth.signOut(); } catch (e2) {} }
    forgetStoredSession();
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
     client's own check is a courtesy and not the rule. ps_rename_runs() then fixes
     the name on every run already recorded, which is the price of the board storing
     a copy rather than joining profiles on every read. */
  async function setName(username) {
    if (!sb) return { error: 'Accounts are not available right now.' };
    const r = await wrap(sb.rpc('set_username', { p_username: username }));
    if (r.error) return r;
    await loadProfile();
    try { await sb.rpc('ps_rename_runs'); } catch (e) {}
    fire();
    return { error: null };
  }

  /* The run you finished as a guest, taken over now that you are signed in. Returns
     false if it was already owned, which is what stops an id in a URL being enough
     to claim somebody else's run. */
  async function claim(runId) {
    if (!sb || !session || !runId) return false;
    try {
      const { data, error } = await sb.rpc('ps_claim_run', { p_id: runId });
      return !error && data === true;
    } catch (e) { return false; }
  }

  /* board.js signs its requests with the anon key. Once somebody is signed in the
     RPC has to see their JWT instead, or auth.uid() is null and the run records as a
     guest, so this hands the live access token over. */
  const token = () => (session && session.access_token) || null;

  /* ENDING THE ACCOUNT. The whole job is one RPC -- see supabase/65_delete_account.sql --
     because the client cannot reach auth.users and should not be given a delete policy on a
     dozen game tables to do the same thing. Three outcomes are worth telling apart, so the
     caller can say something true about each: it worked, the server refused (and why), or
     the call itself failed. A refusal is NOT an error: the common one is a live Stripe
     subscription, which nothing here can cancel, and the player has to do that first.
     Sign-out is ours to do afterwards, because the session outlives the row it points at. */
  async function deleteAccount() {
    if (!sb) return { error: 'Accounts are not available right now.' };
    try {
      const { data, error } = await sb.rpc('rtg_delete_my_account');
      if (error) return { error: error.message || String(error) };
      if (!data || data.ok !== true) {
        return { reason: (data && data.reason) || 'failed', status: data && data.status };
      }
      try { await signOut(); } catch (e) {}
      return { ok: true };
    } catch (e) { return { error: (e && e.message) || 'that did not work' }; }
  }


  /* WHAT THIS ACCOUNT HAS PAID FOR, asked of the database, because the file that
     gates each mode says so itself: a list shipped in the page is a feature flag
     and never a permission. premium_products() (supabase/101_premium_bundles.sql)
     runs as the signed-in user and returns their live product keys, e.g.
     ['ps_premium','cfb_premium']. Empty array when signed out, on error, or when
     the account simply owns nothing: all three read the same to a caller, and all
     three should. */
  /* `force` SKIPS THE CACHE, and it exists because of what an empty answer is in
     JavaScript. `premium` holding [] is TRUTHY, so once a signed-in non-owner has
     been cached as owning nothing, every later call returned that stale [] without
     ever asking the server again. That is harmless at a gate and fatal on the walk
     back from Stripe: the buyer returns, the page asks six times over ten seconds,
     and gets the same cached "you own nothing" every time, so a purchase that
     landed in one second reads as one that never arrived. Poll with force. */
  async function premiumProducts(force) {
    if (!sb || !session) return [];
    const uid = session.user && session.user.id;
    if (!force && premium && premiumFor === uid) return premium;
    try {
      const r = await sb.rpc('premium_products');
      if (r && !r.error && Array.isArray(r.data)) {
        premium = r.data; premiumFor = uid;
        return premium;
      }
    } catch (e) {}
    return [];
  }

  /* THE SAME PURCHASES, WITH THE PAPERWORK ON THEM.
     premiumProducts() above answers the only question a GATE asks: may this
     account open that door. A customer looking at their own account is asking a
     different one, and it is the question a refund request is made of: what did I
     buy, when, and does any of it run out. That needs the rows rather than the
     keys, so this reads premium_unlocks directly.

     SAFE TO READ FROM THE CLIENT because the table's only policy is select-own
     (supabase/101_premium_bundles.sql). Nothing here can grant anything: there is
     no insert, update or delete policy at all, and the webhook's service role is
     the only writer.

     NOT CACHED, unlike the product keys. This is looked at once in a while by
     somebody who has just come back from paying, which is exactly the moment a
     cache would show them an account they no longer have. The keys are asked on
     every paint and have to be cheap; this is asked when a page is opened.

     Returns [] for signed out, for an error and for an account that owns nothing.
     A caller that has to tell those apart has already asked premiumProducts(). */
  async function premiumUnlocks() {
    if (!sb || !session) return [];
    const uid = session.user && session.user.id;
    if (!uid) return [];
    try {
      /* The user filter is REDUNDANT AND STAYS. RLS is what actually scopes this to
         the caller; asking for the row we mean as well costs nothing and means a
         policy edited by hand in the dashboard cannot turn a receipt screen into
         somebody else's receipts. Belt and braces, the way every other read here
         checks its own gate twice. */
      const r = await sb.from('premium_unlocks')
        .select('product,source,granted_at,expires_at,fulfilled_at')
        .eq('user_id', uid)
        .order('granted_at', { ascending: true });
      if (r && !r.error && Array.isArray(r.data)) return r.data;
    } catch (e) {}
    return [];
  }

  /* THE STRIPE CUSTOMER PORTAL, which is where a receipt lives.
     Answers { url } to send the browser to, or { error } naming why not. The
     endpoint identifies the customer from this session's token and never from
     anything sent here, so there is nothing to pass but where to come back to. */
  async function billingPortal(returnPath) {
    const t = token();
    if (!t) return { error: 'unauthorized' };
    try {
      const r = await fetch('/api/stripe/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t },
        body: JSON.stringify({ return_path: returnPath || '/football/' }),
      });
      const d = await r.json().catch(() => ({}));
      if (d && d.url) return { url: d.url };
      return { error: (d && d.error) || 'failed' };
    } catch (e) { return { error: 'failed' }; }
  }

  window.PS_AUTH = {
    API_VERSION: 1,
    boot, state, onChange: (f) => { listeners.push(f); return () => {}; },
    signIn, signUp, signInGoogle, signOut,
    available, setName, claim, token, deleteAccount,
    premiumProducts, premiumUnlocks, billingPortal,
  };
})();
