/*
 * auth.js: accounts for Shut The Door. window.STD_AUTH.
 *
 * A copy of the pattern in baseball/auth.js (RTD_AUTH), as every top-level game
 * carries its own: the site's one account system (`profiles`, email and
 * password, Google), the session in supabase-js under its DEFAULT storage key
 * so one sign-in covers the site, and the same three-state boot (ready,
 * waiting, not coming) because supabase-js is loaded with `defer`.
 *
 * OPTIONAL. If the library never arrives every call here answers "not signed
 * in" or null, and the game plays exactly the same: an account is never a gate
 * in front of playing. What it adds is the daily kept on the account, the doors
 * shut streak across devices, and the day's board.
 *
 * THE DISPLAY NAME IS NEVER SENT FROM HERE. shutdoor_board() reads it out of
 * profiles. Nothing in this file can put a name on a row.
 *
 * The shape is what the UI assumed (CONTRACT_REQUESTS.md B5, accepted):
 *   boot, state, onChange, signIn, signUp, signInGoogle, signOut, token,
 *   myStats; plus submit and board, which api.js calls.
 * Every server call answers null on any failure, never a guess: null means
 * "could not ask", which the page reads as "keep what you have".
 */
(function () {
  'use strict';

  const SB_URL = 'https://jcrrxqfpdelrmvjuihnm.supabase.co';
  /* Public by design: already in the page source of every other game on the
     site. RLS keeps it to reading the board and calling the functions. */
  const SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpjcnJ4cWZwZGVscm12anVpaG5tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3OTY5NjIsImV4cCI6MjA5NjM3Mjk2Mn0.wyjoZpa2yRW-l38-KMGqBvEgTlW9v1KheNye7csWAlM';

  let sb = null;
  let session = null;
  let profile = null;
  const listeners = [];
  let waiting = true;
  let waitTimer = null;

  /* Overridable so a test can point the module at a local stand-in. */
  const url = () => window.STD_BOARD_URL || SB_URL;

  /* boot() is not one shot: the library is deferred and can land after the
     game's own boot on a repeat visit (baseball/auth.js has the story). A
     cheap poll with a deadline, so a blocked CDN ends as "not available". */
  const RETRY_MS = 150, GIVE_UP_MS = 15000;
  function boot() {
    if (sb) return true;
    if (start()) return true;
    if (waitTimer) return false;
    const deadline = Date.now() + GIVE_UP_MS;
    waitTimer = setInterval(() => {
      if (start()) { clearInterval(waitTimer); waitTimer = null; return; }
      if (Date.now() > deadline) {
        clearInterval(waitTimer); waitTimer = null;
        waiting = false;
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
    waiting: waiting && !sb,
    signedIn: !!session,
    email: session && session.user && session.user.email,
    userId: session && session.user && session.user.id,
    name: profile && profile.username,
  });

  async function loadProfile() {
    if (!session) { profile = null; return; }
    try {
      const { data } = await sb.from('profiles').select('username').eq('id', session.user.id).maybeSingle();
      profile = data || null;
    } catch (e) { profile = null; }
  }

  /* Errors come back as the server's own words, never thrown. */
  const wrap = async (p) => {
    if (!sb) return { error: 'Accounts are not available right now.' };
    try {
      const { error } = await p;
      return { error: error ? (error.message || String(error)) : null };
    } catch (e) { return { error: (e && e.message) || 'that did not work' }; }
  };

  const signIn = (email, password) => {
    if (!sb) return Promise.resolve({ error: 'Accounts are not available right now.' });
    return wrap(sb.auth.signInWithPassword({ email: String(email).trim(), password }));
  };

  async function available(username) {
    if (!sb) return null;
    try {
      const { data, error } = await sb.rpc('username_available', { p_username: username });
      return error ? null : !!data;
    } catch (e) { return null; }
  }

  /* The username travels in the sign-up metadata, which handle_new_user reads
     to make the profile row. Checked for availability first. */
  async function signUp(email, password, username) {
    if (!sb) return { error: 'Accounts are not available right now.' };
    const free = await available(username);
    if (free === false) return { error: 'That name is taken.' };
    if (free === null) return { error: 'Could not check that name. Try again.' };
    return wrap(sb.auth.signUp({
      email: String(email).trim(), password,
      options: { data: { username }, emailRedirectTo: location.origin + location.pathname },
    }));
  }

  const signInGoogle = () => {
    if (!sb) return Promise.resolve({ error: 'Accounts are not available right now.' });
    return wrap(sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + location.pathname } }));
  };

  /* Signing out survives a dead network: the stored session is removed here as
     well, since supabase-js only clears it after its /logout call returns
     (baseball/auth.js has the story). */
  const projectRef = () => {
    try { return new URL(url()).hostname.split('.')[0] || null; } catch (e) { return null; }
  };
  function forgetStoredSession() {
    try {
      const ref = projectRef(); if (!ref) return;
      localStorage.removeItem('sb-' + ref + '-auth-token');
      localStorage.removeItem('sb-' + ref + '-auth-token-code-verifier');
    } catch (e) {}
  }
  async function signOut() {
    if (!sb) return { error: null };
    try { await sb.auth.signOut({ scope: 'local' }); }
    catch (e) { try { await sb.auth.signOut(); } catch (e2) {} }
    forgetStoredSession();
    session = null; profile = null; fire();
    return { error: null };
  }

  const token = () => (session && session.access_token) || null;

  /* ---------------- Shut The Door (supabase/153_shut_the_door.sql) ---------------- */

  /* Post today's finished daily. {taken, streak, best, rank, players,
     keptScore, keptOutcome} or null (the last two since 159). The first post
     for (user, day) stands; a repeat answers what the server holds. */
  async function submit(row) {
    if (!sb || !session || !row) return null;
    try {
      const r = await sb.rpc('shutdoor_submit', {
        p_day: row.day, p_number: row.number, p_scenario: row.scenarioId, p_calls: row.calls,
        p_outcome: row.outcome, p_pitches: row.pitches, p_score: row.score, p_percentile: row.percentile,
        p_pitched_like: row.pitchedLike || null, p_strip: row.strip,
      });
      if (r && !r.error && r.data && typeof r.data === 'object') return r.data;
    } catch (e) {}
    return null;
  }

  /* The day's board: rows {rank, username, outcome, pitches, score,
     percentile, pitched_like, strip, mine, players}. Public, so it reads
     signed out too. null on failure. */
  async function board(day, limit) {
    if (!sb) return null;
    try {
      const r = await sb.rpc('shutdoor_board', { p_day: day, p_limit: limit || 50 });
      if (r && !r.error && Array.isArray(r.data)) return r.data;
    } catch (e) {}
    return null;
  }

  /* This account's kept outing for a day (supabase/159_shut_the_door_boards.sql):
     {day, scenarioId, calls, outcome, pitches, score, percentile}, or null when
     there is none, signed out, or on any failure. api.js replays its calls, so a
     second device shows the day the first one played. */
  async function myDay(day) {
    if (!sb || !session || !day) return null;
    try {
      const r = await sb.rpc('shutdoor_my_day', { p_day: day });
      if (r && !r.error && r.data && typeof r.data === 'object') return r.data;
    } catch (e) {}
    return null;
  }

  /* This account's record: {played, doorShut, tieHeld, doorsOpen, walkOff,
     avgPercentile, bestScore, streak, best, lastDay}, or null. */
  async function myStats() {
    if (!sb || !session) return null;
    try {
      const r = await sb.rpc('shutdoor_my_stats');
      if (r && !r.error && r.data && typeof r.data === 'object') return r.data;
    } catch (e) {}
    return null;
  }

  /* ---------------- the vote, Survivor, the archive, Pro (supabase/160_shut_the_door_vote_survivor.sql) ---------------- */

  /* One call that answers the server's json, or null on any failure. */
  async function rpc(name, args, signedInOnly) {
    if (!sb || (signedInOnly && !session)) return null;
    try {
      const r = await sb.rpc(name, args || {});
      if (r && !r.error && r.data != null) return r.data;
    } catch (e) {}
    return null;
  }
  /* A write that says why it was refused: {data} or {error: the server's words}. */
  async function act(name, args) {
    if (!sb) return { error: 'Accounts are not available right now.' };
    if (!session) return { error: 'sign in first' };
    try {
      const r = await sb.rpc(name, args);
      if (r && r.error) return { error: r.error.message || String(r.error) };
      return { data: r ? r.data : null };
    } catch (e) { return { error: (e && e.message) || 'that did not work' }; }
  }

  /* A day's vote: {day, epoch, open, candidates [A, B], myVote, votes {a, b} | null, winner,
     canVote, why}. Reads signed out too. */
  const vote = (day) => rpc('shutdoor_vote', { p_day: day });
  const voteCast = (day, pack) => act('shutdoor_vote_cast', { p_day: day, p_pack: pack });
  /* {signedIn, pro, archive, survivorRuns}: Pro answers false for everyone until payments exist. */
  const entitlements = () => rpc('shutdoor_entitlements', {});
  /* Survivor: the caller's runs for a day, start or resume one, post a finished situation, the board. */
  const survivorState = (day) => rpc('shutdoor_survivor_state', { p_day: day }, true);
  const survivorStart = (day) => act('shutdoor_survivor_start', { p_day: day });
  const survivorPost = (row) => act('shutdoor_survivor_post', {
    p_day: row.day, p_run: row.run, p_index: row.index, p_scenario: row.scenarioId, p_calls: row.calls,
    p_outcome: row.outcome, p_pitches: row.pitches, p_score: row.score,
  });
  async function survivorBoard(day, limit) {
    const r = await rpc('shutdoor_survivor_board', { p_day: day, p_limit: limit || 50 });
    return Array.isArray(r) ? r : null;
  }
  /* A past daily played from the archive (Pro), kept and never on the daily board. */
  const archiveSubmit = (row) => act('shutdoor_archive_submit', {
    p_day: row.day, p_scenario: row.scenarioId, p_calls: row.calls, p_outcome: row.outcome,
    p_pitches: row.pitches, p_score: row.score, p_percentile: row.percentile,
  });

  window.STD_AUTH = {
    API_VERSION: 1,
    boot, state, onChange: (f) => { listeners.push(f); return () => {}; },
    signIn, signUp, signInGoogle, signOut, token, available,
    submit, board, myStats, myDay,
    vote, voteCast, entitlements, survivorState, survivorStart, survivorPost, survivorBoard, archiveSubmit,
  };
})();
