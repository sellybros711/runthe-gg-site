/*
 * board.js: the leaderboard client for Run The Diamond.
 *
 * Talks to the Supabase REST API directly with fetch, the same way the football,
 * college and soccer boards do, rather than pulling in the supabase-js bundle.
 * Every call is one of four shapes and none of them needs a client library:
 *
 *   submit a season       POST /rpc/rtd_submit_run
 *   count better seasons  GET  /rtd_runs?score=gt.N     + Prefer: count=exact
 *   count a board         GET  /rtd_runs?run_mode=eq.X  + Prefer: count=exact
 *   list the top rows     GET  /rtd_runs?order=score.desc&limit=N
 *
 * EVERY FUNCTION FAILS SOFT. If supabase/97_baseball_leaderboard.sql has not been
 * run, or the network is down, or the table is renamed, each call resolves to null
 * and RTD_BOARD.offline goes true. The game then says the board is not reachable,
 * which is the truth, instead of showing a made-up rank. NOTHING HERE IS EVER
 * ALLOWED TO BREAK A FINISHED SEASON: the results screen paints first and asks the
 * board afterwards.
 *
 * The anon key is public by design: it is already in the page source of every other
 * game on this site, and the table's RLS lets it read and lets it call one function.
 * It cannot insert, update or delete a row directly.
 */
(function () {
  'use strict';

  const SB_URL = 'https://jcrrxqfpdelrmvjuihnm.supabase.co';
  const SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpjcnJ4cWZwZGVscm12anVpaG5tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3OTY5NjIsImV4cCI6MjA5NjM3Mjk2Mn0.wyjoZpa2yRW-l38-KMGqBvEgTlW9v1KheNye7csWAlM';

  /* Overridable so a test can point the module at a local stand-in for PostgREST
     without touching the shipped constants. */
  const base = () => (window.RTD_BOARD_URL || SB_URL) + '/rest/v1/';

  const TIMEOUT_MS = 15000;
  const TABLE = 'rtd_runs';

  /* Named explicitly rather than select=*, so rows stay small and adding a column
     to the table does not silently grow every board request. No player-supplied
     text is among them: the roster comes back as ids. */
  const COLS = [
    'id', 'created_at', 'display_name', 'wins', 'losses', 'playoff_wins',
    'made_playoffs', 'seed_label', 'title_won', 'tied_record', 'is_goat',
    'run_mode', 'franchise', 'era', 'division', 'daily_key',
    'rating', 'all_time_rank', 'staff_era', 'chemistry_pct', 'spend_musd',
    'respins', 'cuts', 'trades', 'score', 'picks', 'slots',
  ].join(',');

  const MODES = ['free', 'era', 'franchise', 'division', 'capsurvivor', 'staff', 'trade'];

  let offline = false;
  let lastError = null;
  let needsMigration = false;

  function headers(extra) {
    const h = {
      apikey: SB_ANON,
      Authorization: 'Bearer ' + (window.RTD_ACCESS_TOKEN || SB_ANON),
      'Content-Type': 'application/json',
    };
    return extra ? Object.assign(h, extra) : h;
  }

  /* One place that decides a call failed, so `offline` can never be set by a
     caller that merely got an empty list back. A 404 means the migration has not
     been run, which is worth telling apart from a network failure. */
  async function call(path, opts) {
    const ctl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), TIMEOUT_MS) : null;
    try {
      const res = await fetch(base() + path, Object.assign({ signal: ctl && ctl.signal }, opts));
      if (res.status === 404) { needsMigration = true; offline = true; lastError = 'no table'; return null; }
      if (!res.ok) {
        lastError = 'http ' + res.status;
        let body = '';
        try { body = await res.text(); } catch (_) {}
        if (body) lastError += ': ' + body.slice(0, 200);
        /* A 400 from the RPC is the function refusing an incoherent row, which is
           a client bug and not an outage. Everything else is an outage. */
        if (res.status !== 400) offline = true;
        return null;
      }
      offline = false;
      return res;
    } catch (e) {
      offline = true;
      lastError = (e && e.name === 'AbortError') ? 'timeout' : String(e && e.message || e);
      return null;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /* The count comes back in the Content-Range header as "0-24/1039". */
  function countFrom(res) {
    const cr = res && res.headers && res.headers.get('content-range');
    if (!cr) return null;
    const n = parseInt(cr.split('/')[1], 10);
    return isFinite(n) ? n : null;
  }

  /* The same score the server computes, so the results screen can work out its own
     place without waiting for the row to come back. Kept in step with
     97_baseball_leaderboard.sql BY HAND: if one changes, the other has to. */
  function scoreOf(wins, playoffWins, rating) {
    return Math.round(wins) * 10000
      + Math.round(playoffWins || 0) * 1000
      + Math.round((rating || 0) * 10);
  }

  /* Post a finished season. Resolves to { id } on success, { duplicate:true } when
     the daily was already recorded by this browser, or null on any failure. */
  async function submit(p) {
    const res = await call('rpc/rtd_submit_run', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        p_wins: p.wins,
        p_playoff_wins: p.playoffWins || 0,
        p_run_mode: p.mode || 'free',
        p_franchise: p.franchise || null,
        p_era: p.era || null,
        p_division: p.division || null,
        p_daily_key: p.dailyKey || null,
        p_daily_client: p.dailyClient || null,
        p_rating: p.rating == null ? null : p.rating,
        p_all_time_rank: p.allTimeRank == null ? null : p.allTimeRank,
        p_staff_era: p.staffEra == null ? null : p.staffEra,
        p_chemistry_pct: p.chemistryPct || 0,
        p_spend_musd: p.spendMusd || 0,
        p_respins: p.respins || 0,
        p_runs_for: p.runsFor == null ? null : p.runsFor,
        p_runs_against: p.runsAgainst == null ? null : p.runsAgainst,
        p_cuts: p.cuts || 0,
        p_trades: p.trades || 0,
        p_picks: p.picks || [],
        p_slots: p.slots || [],
        p_rng_seed: p.rngSeed == null ? null : String(p.rngSeed),
        p_rng_calls: p.rngCalls == null ? null : p.rngCalls,
      }),
    });
    if (!res) return null;
    let id = null;
    try { id = await res.json(); } catch (_) {}
    /* The function returns null rather than raising when a daily is already in,
       because a second attempt is an ordinary thing for a browser to do. */
    if (id === null || id === undefined) return { duplicate: true, id: null };
    return { id, duplicate: false };
  }

  /* How many seasons beat this one, on the board it belongs to. Returns the place
     (1 = best), or null if the board cannot be reached. */
  async function placeIn(opts) {
    const o = opts || {};
    const q = ['select=id', 'score=gt.' + Math.round(o.score || 0), 'limit=1'];
    if (o.dailyKey) q.push('daily_key=eq.' + encodeURIComponent(o.dailyKey));
    else q.push('run_mode=eq.' + encodeURIComponent(o.mode || 'free'),
                'daily_key=is.null');
    const res = await call(TABLE + '?' + q.join('&'), {
      headers: headers({ Prefer: 'count=exact', Range: '0-0' }),
    });
    const better = countFrom(res);
    return better == null ? null : better + 1;
  }

  /* How many seasons are on that board at all. */
  async function total(opts) {
    const o = opts || {};
    const q = ['select=id', 'limit=1'];
    if (o.dailyKey) q.push('daily_key=eq.' + encodeURIComponent(o.dailyKey));
    else q.push('run_mode=eq.' + encodeURIComponent(o.mode || 'free'),
                'daily_key=is.null');
    const res = await call(TABLE + '?' + q.join('&'), {
      headers: headers({ Prefer: 'count=exact', Range: '0-0' }),
    });
    return countFrom(res);
  }

  /* The top rows of a board, newest-first within a tie. */
  async function top(opts) {
    const o = opts || {};
    const n = Math.max(1, Math.min(100, o.limit || 25));
    const q = ['select=' + COLS, 'order=score.desc,created_at.asc', 'limit=' + n];
    if (o.dailyKey) q.push('daily_key=eq.' + encodeURIComponent(o.dailyKey));
    else q.push('run_mode=eq.' + encodeURIComponent(o.mode || 'free'),
                'daily_key=is.null');
    const res = await call(TABLE + '?' + q.join('&'), { headers: headers() });
    if (!res) return null;
    try { return await res.json(); } catch (_) { return null; }
  }

  /* Is the board there at all? One cheap call, used to decide whether to draw the
     leaderboard door on the home screen. */
  async function probe() {
    const res = await call(TABLE + '?select=id&limit=1', { headers: headers() });
    return !!res;
  }

  /* Attach a guest's run to an account after they sign in. */
  async function claim(id) {
    if (!id) return false;
    const res = await call('rpc/rtd_claim_run', {
      method: 'POST', headers: headers(), body: JSON.stringify({ p_id: id }),
    });
    if (!res) return false;
    try { return (await res.json()) === true; } catch (_) { return false; }
  }

  window.RTD_BOARD = {
    API_VERSION: 1,
    submit, placeIn, total, top, probe, claim, scoreOf, MODES,
    get offline() { return offline; },
    get lastError() { return lastError; },
    get needsMigration() { return needsMigration; },
    /* Used by the tests to prove a failed board never breaks the results screen. */
    _forceOffline() { offline = true; },
  };
})();
