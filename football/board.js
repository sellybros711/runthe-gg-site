/*
 * board.js - the leaderboard client for The Perfect Season.
 *
 * Talks to the Supabase REST API directly with fetch, the same way the soccer
 * game's leaderboard does, rather than pulling in the supabase-js bundle. Every
 * call here is one of five shapes, and none of them needs a client library:
 *
 *   submit a run          POST /rpc/ps_submit_run
 *   count better runs     GET  /ps_runs?score=gt.N        + Prefer: count=exact
 *   count runs in window  GET  /ps_runs?created_at=gte.T  + Prefer: count=exact
 *   list the top rows     GET  /ps_runs?order=score.desc&limit=N
 *
 * EVERY FUNCTION FAILS SOFT. If supabase/50_football_perfect_season.sql has not
 * been run, or the network is down, or the table is renamed, each call resolves
 * to null and `PS_BOARD.offline` goes true. The game then says the board is not
 * reachable, which is the truth, instead of showing a made-up rank. Nothing here
 * is ever allowed to break a finished season.
 *
 * The anon key is public by design: it is already in the page source of every
 * other game on this site, and the table's RLS lets it read and lets it call one
 * function. It cannot insert, update or delete a row directly.
 */
(function () {
  'use strict';

  const SB_URL = 'https://jcrrxqfpdelrmvjuihnm.supabase.co';
  const SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpjcnJ4cWZwZGVscm12anVpaG5tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3OTY5NjIsImV4cCI6MjA5NjM3Mjk2Mn0.wyjoZpa2yRW-l38-KMGqBvEgTlW9v1KheNye7csWAlM';

  /* Overridable so the test harness can point the whole module at a local stand-in
     for PostgREST without touching the shipped constants. */
  const base = () => (window.PS_BOARD_URL || SB_URL) + '/rest/v1/';

  const TIMEOUT_MS = 8000;
  const TABLE = 'ps_runs';

  /* Columns the board list needs. Named explicitly rather than select=*, so the
     rows stay small and adding a column to the table does not silently grow every
     board request. */
  const ROW_COLS = 'id,created_at,wins,losses,games,title_won,perfect,made_playoffs,' +
    'seed_label,point_diff,chemistry_pct,spend_musd,respins,franchise,daily,picks,slots,' +
    'squad_fppg,structure_mult,team_rating,perfect_pct';

  /* The two things a board can be sorted by, and the column each one orders on.
     Named here rather than taking a column name from the caller, so nothing can
     put an arbitrary string into an order= parameter. */
  const SORTS = {
    record: 'score',
    rating: 'team_rating',
  };

  let offline = false;

  /* One decimal place, matching round(p_point_diff, 1) in ps_submit_run(). Declared
     up here because both submit() and scoreOf() need it and submit() is defined
     first. */
  const round1 = (n) => Math.round(Number(n) * 10) / 10;

  const headers = (extra) => Object.assign({
    apikey: SB_ANON,
    Authorization: 'Bearer ' + SB_ANON,
    'Content-Type': 'application/json',
  }, extra || {});

  /* A hung request must not leave the results screen waiting forever. */
  function timed(url, opts) {
    const ctl = typeof AbortController === 'function' ? new AbortController() : null;
    const t = setTimeout(() => { if (ctl) ctl.abort(); }, TIMEOUT_MS);
    return fetch(url, Object.assign({ signal: ctl ? ctl.signal : undefined }, opts))
      .finally(() => clearTimeout(t));
  }

  /* PostgREST returns the exact count in Content-Range as "0-24/1234". A missing
     or unparseable header is a failure, NOT a zero: reading it as zero would rank
     everybody first. */
  function countOf(res) {
    const cr = res.headers.get('content-range') || '';
    const total = cr.split('/')[1];
    if (!total || total === '*') return null;
    const n = parseInt(total, 10);
    return Number.isFinite(n) ? n : null;
  }

  /* ---------------- the three windows ----------------
     UTC, not local time. A daily board where everyone's day starts at a different
     moment is not one board, and the copy on the leaderboard screen promises a
     midnight UTC reset. The week starts Monday, for the same reason: it has to be
     the same week for everybody. */
  function cutoffISO(win) {
    const now = new Date();
    if (win === 'all') return null;
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    if (win === 'week') {
      const dow = (d.getUTCDay() + 6) % 7;      // 0 = Monday
      d.setUTCDate(d.getUTCDate() - dow);
    }
    return d.toISOString();
  }

  const winFilter = (win) => {
    const cut = cutoffISO(win);
    return cut ? '&created_at=gte.' + encodeURIComponent(cut) : '';
  };

  /* ---------------- submit ----------------
     Sends only what the server cannot derive. wins, losses, games, the seed label
     and the perfect flag are all recomputed in ps_submit_run() from regular_wins
     and playoff_wins, so there is no way for this call to disagree with the row
     that lands in the table.

     Returns the new row id, or null if it did not go through. A null here is not
     an error the player should see: their season still happened. */
  async function submit(payload) {
    try {
      const res = await timed(base() + 'rpc/ps_submit_run', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
          p_regular_wins: payload.regularWins,
          p_playoff_wins: payload.playoffWins,
          p_point_diff: round1(payload.pointDiff),
          p_chemistry_pct: payload.chemistryPct,
          p_spend_musd: payload.spendMusd,
          p_respins: payload.respins || 0,
          p_franchise: payload.franchise || null,
          p_daily: !!payload.daily,
          p_picks: payload.picks,
          p_slots: payload.slots || null,
          p_seed: payload.seed || null,
          p_rng_calls: payload.rngCalls || null,
          p_squad_fppg: payload.squadFppg ?? null,
          p_structure_mult: payload.structureMult ?? null,
          p_team_rating: payload.teamRating ?? null,
          p_perfect_pct: payload.perfectPct ?? null,
        }),
      });
      if (!res.ok) { offline = true; return null; }
      const id = await res.json().catch(() => null);
      return typeof id === 'number' ? id : null;
    } catch (e) { offline = true; return null; }
  }

  /* ---------------- rank ----------------
     Rank is the count of strictly better runs plus one, computed from the board
     rather than from this run's own insert. That ordering means a failed submit
     shows a correct rank instead of collapsing to "1 of 1", and it is why rank is
     read AFTER the submit but does not depend on it.

     Ties: two runs with the same score share a rank here, and the board list
     breaks them by who got there first. That is deliberate. Counting created_at
     into the rank would mean a player's rank silently worsens as later people tie
     him, which reads as the board being wrong.

     One request per number, six in parallel. Each is an index-only count. */
  async function rankIn(win, score) {
    try {
      const q = base() + TABLE + '?select=id&limit=1&score=gt.' + encodeURIComponent(score) +
        winFilter(win);
      const res = await timed(q, { headers: headers({ Prefer: 'count=exact' }) });
      if (!res.ok) { offline = true; return null; }
      const better = countOf(res);
      return better === null ? null : better + 1;
    } catch (e) { offline = true; return null; }
  }

  async function total(win) {
    try {
      const q = base() + TABLE + '?select=id&limit=1' + winFilter(win);
      const res = await timed(q, { headers: headers({ Prefer: 'count=exact' }) });
      if (!res.ok) { offline = true; return null; }
      return countOf(res);
    } catch (e) { offline = true; return null; }
  }

  /* All three windows at once. A window whose two numbers did not both come back
     is returned as null rather than half-filled, so the UI never prints
     "#4 of null". The total is floored at the rank for the same reason the soccer
     board does it: the two counts are separate queries, so a run inserted a moment
     ago can be missing from the total while already counted in the rank, which
     would render an impossible "#41 of 40". */
  async function ranks(score) {
    const wins = ['day', 'week', 'all'];
    const got = await Promise.all(wins.map((w) =>
      Promise.all([rankIn(w, score), total(w)])));
    const out = {};
    wins.forEach((w, i) => {
      const [rank, tot] = got[i];
      out[w] = (rank === null || tot === null) ? null : { rank, total: Math.max(tot, rank) };
    });
    return out;
  }

  /* ---------------- the board itself ----------------
     sort is 'record' or 'rating', dir is 'desc' or 'asc'. Both are looked up
     rather than interpolated, and the tiebreak always runs the same direction:
     whoever got there first is listed first, whichever way the board is pointed.

     Rows sorted by rating skip the ones with no rating on them. Any run recorded
     before team_rating existed has a null there, and PostgREST would sort nulls
     to one end of the list, so a low-to-high rating board would open on a page of
     rows with an empty rating column. */
  async function top(win, limit, sort, dir) {
    const col = SORTS[sort] || SORTS.record;
    const way = dir === 'asc' ? 'asc' : 'desc';
    try {
      let q = base() + TABLE + '?select=' + ROW_COLS +
        '&order=' + col + '.' + way + ',created_at.asc' +
        '&limit=' + (limit || 10) + winFilter(win);
      if (col !== 'score') q += '&' + col + '=not.is.null';
      const res = await timed(q, { headers: headers() });
      if (!res.ok) { offline = true; return null; }
      const rows = await res.json().catch(() => null);
      return Array.isArray(rows) ? rows : null;
    } catch (e) { offline = true; return null; }
  }

  /* One row by id, so a player who is nowhere near the top page can still be
     pinned under the list. */
  async function byId(id) {
    try {
      const q = base() + TABLE + '?select=' + ROW_COLS + '&id=eq.' + encodeURIComponent(id);
      const res = await timed(q, { headers: headers() });
      if (!res.ok) { offline = true; return null; }
      const rows = await res.json().catch(() => null);
      return (Array.isArray(rows) && rows[0]) || null;
    } catch (e) { offline = true; return null; }
  }

  /* The score the server will compute, worked out here as well so a rank can be
     read before or without a successful submit. Any change to the generated column
     in 50_football_perfect_season.sql has to be made here too, and the test suite
     compares the two against real Postgres on every run.

     THE ROUNDING IS THE WHOLE POINT OF THIS FUNCTION EXISTING.
     ps_submit_run() stores round(p_point_diff, 1) and the generated column is
     computed from the STORED value. Working the score out from an unrounded
     differential produces a number one or two lower than the row that just went
     in, so the run counts itself among the runs that beat it. The symptom was
     "#2 of 2" on a table with one row in it, and nobody could ever rank first.
     Rounding here, rather than trusting callers to do it, means there is one place
     for this to be right. */
  function scoreOf(wins, pointDiff) {
    const diff = Math.min(9999, Math.max(0, Math.round((round1(pointDiff) + 40) * 100)));
    return wins * 10000 + diff;
  }

  window.PS_BOARD = {
    API_VERSION: 1,
    submit, ranks, rankIn, total, top, byId, scoreOf, cutoffISO, SORTS,
    get offline() { return offline; },
    /* Used by the tests to prove a failed board never breaks the results screen. */
    _forceOffline() { offline = true; },
  };
})();
