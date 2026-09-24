/*
 * board.js - the leaderboard client for Run The Floor.
 *
 * Talks to the Supabase REST API directly with fetch, the way football/board.js
 * and cfb/board.js already do, rather than pulling in the supabase-js bundle.
 * Every call here is one of five shapes and none of them needs a client library:
 *
 *   submit a run        POST /rpc/rtf_submit_run
 *   claim one           POST /rpc/rtf_claim_run
 *   count better runs   GET  /rtf_runs?score=gt.N     + Prefer: count=exact
 *   list the top rows   GET  /rtf_runs?order=score.desc&limit=N
 *   which boards exist  POST /rpc/rtf_board_modes
 *
 * EVERY FUNCTION FAILS SOFT. If supabase/108_hoops_leaderboard.sql has not been
 * run, or the network is down, or the table is renamed, each call resolves to
 * null and `RTF_BOARD.offline` goes true. The page then says the board is not
 * reachable, which is the truth, instead of showing a made-up rank. Nothing
 * here is ever allowed to break a finished run: the results screen is already
 * painted by the time any of this is called.
 *
 * A NULL IS NEVER "YOU ARE FIRST" AND NEVER "NOBODY HAS PLAYED". It means no
 * opinion. Every reader in this file's callers has to tell those apart, which
 * is the whole reason a board has four states rather than two.
 *
 * The anon key is public by design: it is already in the page source of every
 * other game on this site, and the table's RLS lets it read and lets it call
 * three functions. It cannot insert, update or delete a row directly.
 *
 * FOUR COMPETITIONS, NOT ONE BOARD WITH A FILTER ON IT, and the two locked ones
 * are scoped again by which club or which decade. That is not tidiness: it is
 * measured. One Franchise pins chemistry near its ceiling whatever gets drafted
 * and best-available finishes 46.8 wins against the league's 42.0, and the
 * decades are nine wins apart for the same drafting. One board would retire the
 * record to whoever picked the deepest franchise or the shallowest era. See the
 * header of supabase/108_hoops_leaderboard.sql.
 */
(function () {
  'use strict';

  const BOARD_API_VERSION = 2;

  const SB_URL = 'https://jcrrxqfpdelrmvjuihnm.supabase.co';
  const SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpjcnJ4cWZwZGVscm12anVpaG5tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3OTY5NjIsImV4cCI6MjA5NjM3Mjk2Mn0.wyjoZpa2yRW-l38-KMGqBvEgTlW9v1KheNye7csWAlM';

  /* Overridable so a test can point the whole module at a local stand-in for
     PostgREST without touching the shipped constants. */
  const base = () => (window.RTF_BOARD_URL || SB_URL) + '/rest/v1/';

  const TIMEOUT_MS = 15000;
  const TABLE = 'rtf_runs';

  /* Columns the list needs, named explicitly rather than select=*, so the rows
     stay small and adding a column to the table does not silently grow every
     request. No player-supplied text is among them: the roster comes back as
     ids and is drawn against the client's own copy of players.json. */
  const COLS = 'id,created_at,display_name,run_mode,lock_key,daily_day,' +
    'wins,losses,games,playoff_wins,made_playoffs,title_won,beat_record,is_goat,depth,' +
    'seed_label,point_diff,rating,ortg,drtg,chemistry,structure_mult,archetype,' +
    'spend_musd,respins,all_time_rank,picks,slots';

  /* ---------------- which competition ----------------
     A mode is a pair: the door, and the lock inside it. Written as a plain
     object rather than a string like 'club:CHI' because the two halves go into
     two different query parameters, and a string would have to be taken apart
     again at every call site.

     modeOf() is what stops anything a caller hands in reaching a query as text.
     An unknown door falls back to the league, which is the one board that is
     always there, rather than to a query that PostgREST answers with a 400. */
  const DOORS = ['league', 'club', 'era', 'daily'];

  function modeOf(m) {
    const o = m || {};
    const door = DOORS.indexOf(o.door) >= 0 ? o.door : 'league';
    if (door === 'club') {
      /* Two to four upper case letters, matching the check in rtf_submit_run.
         A key that cannot be legal is dropped along with its door, because a
         club board with no club is not a narrower board, it is every club's
         runs in one list under one club's name. */
      const k = String(o.key || '').toUpperCase();
      if (!/^[A-Z]{2,4}$/.test(k)) return { door: 'league', key: null, day: null };
      return { door: 'club', key: k, day: null };
    }
    if (door === 'era') {
      const k = String(o.key || '').toLowerCase();
      if (!/^[a-z]{4,12}$/.test(k)) return { door: 'league', key: null, day: null };
      return { door: 'era', key: k, day: null };
    }
    if (door === 'daily') {
      const d = Math.round(Number(o.day));
      if (!Number.isFinite(d) || d < 1) return { door: 'league', key: null, day: null };
      return { door: 'daily', key: null, day: d };
    }
    return { door: 'league', key: null, day: null };
  }

  /* The query scope for a mode, and it is the same string on the list and on
     every count. A place counted against a different competition from the one
     being listed is worse than no place at all, which is why this is one
     function rather than a clause written at each call site. */
  function scope(mode, named) {
    const m = modeOf(mode);
    let q = '&run_mode=eq.' + m.door;
    if (m.key !== null) q += '&lock_key=eq.' + encodeURIComponent(m.key);
    if (m.day !== null) q += '&daily_day=eq.' + m.day;
    /* NAMED RUNS ONLY, when asked for, exactly as the other two boards do it. A
       guest run is a real run and counts towards how many have been played, so
       it belongs in the activity total; it carries no name, so listing it puts
       a row of Anonymous on a board whose whole job is to say who did what. */
    if (named) q += '&display_name=not.is.null';
    return q;
  }

  /* ---------------- the three axes ----------------
     Named here rather than taking a column from the caller, so nothing can put
     an arbitrary string into an order= parameter.

     THREE, AND THE FIRST IS HOW FAR THE RUN WENT. This board shipped with two
     (the record and the rating) and ranked a run on its regular season alone,
     so over 1,800 simulated league runs the median champion sat 98th, under
     60 win teams that went out in the first round. The game's own guide says
     the goal is the ring and hands the player the playoff games to call, so
     `score` leads with depth (see 108_hoops_leaderboard.sql) and the record
     is a board of its own, because chasing 72 is its own sport.

     The college board retired an axis because it did not discriminate. These
     three disagree on real runs: a 45 win champion is first on Best run and
     nowhere on Best record, and the rating is the roster rather than either. */
  const SORTS = { run: 'score', record: 'record_score', rating: 'rating' };
  const DIR = { run: 'desc', record: 'desc', rating: 'desc' };
  const DEFAULT_SORT = 'run';

  /* Postgres reads an index backwards as happily as forwards, but only when
     EVERY sort key reverses together: `score asc, created_at asc` against a
     (score desc, created_at asc) index is a backward scan plus an incremental
     sort, while `score asc, created_at desc` is a clean backward scan. So the
     tiebreak flips whenever the read does.

     Keyed on whether the index is being read BACKWARDS and not on the literal
     word, which is the distinction that cost the college board an axis its
     index: that form is only correct for an index that runs (col desc,
     created_at asc). Both axes here do, so the two forms agree today and the
     difference is invisible. It stays written this way because an ascending
     index is one migration away and the version that agrees by coincidence is
     the version that breaks silently when it arrives. */
  const dirOf = (key, want) => (want === 'asc' || want === 'desc' ? want : DIR[key]);
  const tiebreakFor = (key, way) => (way === DIR[key] ? 'asc' : 'desc');

  let offline = false;
  /* THE LAST THING THAT WENT WRONG, kept rather than thrown away. Failing soft
     and silently is right for the player and useless for working out why
     nothing is being recorded: a failed submit looks exactly like a healthy
     board with nobody on it. PostgREST answers a rejected call with a JSON body
     carrying a code and a message, and that body is the whole diagnosis. */
  let lastError = null;
  /* Set when the table itself is missing, so the page can name the file to run
     rather than leaving it to be guessed. */
  let needsMigration = false;

  async function fail(where, res) {
    offline = true;
    let body = null;
    try { body = await res.json(); } catch (e) { body = null; }
    const msg = (body && (body.message || body.hint)) || res.statusText || 'no message';
    /* A 404 is the table or the function missing. A message naming either is
       the same thing arriving as a 400 from a stale schema cache, which is a
       real state a Supabase project sits in for a minute after a migration. */
    if (res.status === 404 || /rtf_runs|rtf_submit_run|rtf_board_modes|record_score|depth/.test(msg)) {
      needsMigration = true;
    }
    lastError = { where, status: res.status, code: (body && body.code) || '', message: msg };
    return null;
  }
  function failThrown(where, e) {
    offline = true;
    lastError = { where, status: 0, code: 'network',
      message: (e && e.message) || 'the request did not complete' };
    return null;
  }

  /* ROUNDED THE WAY POSTGRES ROUNDS, WHICH IS NOT THE WAY Math.round DOES.
     Postgres `round(numeric, n)` rounds a half AWAY FROM ZERO; Math.round
     rounds a half toward positive infinity. They agree on every positive value
     and disagree on every negative one landing exactly on a half:

       round(-7.55, 1)        => -7.6   (Postgres)
       Math.round(-75.5) / 10 => -7.5   (JavaScript)

     which is one whole step of the score column. That matters because scoreOf()
     below recomputes the stored `score` locally so the results screen can show
     a place without waiting for the row to come back: if the two definitions
     disagree, the count of runs ahead of you is taken against a number that is
     not the one in your row, and your own place comes back off by however many
     rows sit in the gap. Reachable on any season with a negative differential
     landing on a half, which a 30 win team at minus four and a half points
     does. Lifted from cfb/board.js, where it was found. */
  const roundTo = (n, places) => {
    const f = Math.pow(10, places);
    const v = Number(n) * f;
    return (v < 0 ? -Math.round(-v) : Math.round(v)) / f;
  };
  const round1 = (n) => roundTo(n, 1);

  /* HOW FAR A RUN WENT, 0 to 6, and it has to agree with rtf_submit_run():

       0 missed the playoffs      4 lost in the conference finals
       1 lost the play-in         5 lost in the Finals
       2 lost in the first round  6 won the title
       3 lost in the second round

     A seeded run starts at 2 and a play-in run at 1, and each series won is
     one more. The lines are the engine's own constants, passed in rather than
     read off a global, so this file does not have to load before engine.js. */
  function depthOf(wins, playoffWins, topSix, playIn) {
    const w = Math.round(Number(wins));
    const po = Math.max(0, Math.round(Number(playoffWins) || 0));
    if (!Number.isFinite(w)) return null;
    if (w >= topSix) return 2 + po;
    if (w >= playIn) return 1 + po;
    return 0;
  }

  /* THE SCORE, RECOMPUTED HERE, and it has to be byte-identical to the stored
     generated columns in 108_hoops_leaderboard.sql:

       score        = depth * 1000000 + record_score
       record_score = wins * 10000
                      + least(9999, greatest(0, round((point_diff + 40) * 100)))

     The results screen counts the runs ahead of you the moment the season ends,
     which is before the insert has come back, so this is the number that count
     is taken against. Two definitions of one thing is the shape that drifts, so
     the file that owns it is the SQL and this is a copy that has to be checked
     against it. verify.mjs does exactly that. */
  function recordScoreOf(wins, pointDiff) {
    const w = Math.round(Number(wins));
    const d = round1(Number(pointDiff));
    if (!Number.isFinite(w) || !Number.isFinite(d)) return null;
    const shifted = Math.min(9999, Math.max(0, Math.round((d + 40) * 100)));
    return w * 10000 + shifted;
  }
  function scoreOf(wins, pointDiff, depth) {
    const r = recordScoreOf(wins, pointDiff);
    const dp = Math.round(Number(depth) || 0);
    return r === null ? null : dp * 1000000 + r;
  }

  /* THE SIGNED-IN USER'S TOKEN, WHEN THERE IS ONE. Sending the anon key while
     somebody is signed in would leave auth.uid() null inside rtf_submit_run(),
     so their run would record as a guest and their name would never appear on
     it. The apikey header stays the anon key either way, which is what
     PostgREST wants; only the bearer changes. */
  const headers = (extra) => {
    const A = window.RTF_AUTH;
    const tok = (A && A.token && A.token()) || SB_ANON;
    return Object.assign({
      apikey: SB_ANON,
      Authorization: 'Bearer ' + tok,
      'Content-Type': 'application/json',
    }, extra || {});
  };

  /* A hung request must not leave the results screen waiting for ever. */
  function timed(url, opts) {
    const ctl = typeof AbortController === 'function' ? new AbortController() : null;
    const t = setTimeout(() => { if (ctl) ctl.abort(); }, TIMEOUT_MS);
    return fetch(url, Object.assign({ signal: ctl ? ctl.signal : undefined }, opts))
      .finally(() => clearTimeout(t));
  }

  /* PostgREST returns the exact count in Content-Range as "0-24/1234". A
     missing or unparseable header is a FAILURE, not a zero: reading it as zero
     would rank everybody first. */
  function countOf(res) {
    const cr = res.headers.get('content-range') || '';
    const total = cr.split('/')[1];
    if (!total || total === '*') return null;
    const n = parseInt(total, 10);
    return Number.isFinite(n) ? n : null;
  }

  /* ---------------- submit ----------------
     Sends the result and nothing about what it means. The losses, the games,
     the seed label, whether it made the playoffs, whether it won a ring,
     whether it beat 72, the mode itself and the ordering score are all derived
     by rtf_submit_run(). See the header of supabase/108_hoops_leaderboard.sql
     for why that is the shape.

     THE MODE IS THREE ARGUMENTS AND NOT ONE, for the same reason: the server
     works out which board this is from the club, the era and the day, so a
     client cannot file a locked run on the league board by sending a mode
     string that disagrees with its own lock.

     Resolves to the new row's id, or null. */
  async function submit(payload) {
    const p = payload || {};
    const body = {
      p_regular_wins: Math.round(p.wins),
      p_playoff_wins: Math.round(p.playoffWins || 0),
      p_point_diff: round1(p.pointDiff),
      p_club: p.club || null,
      p_era: p.era || null,
      p_daily_day: p.dailyDay == null ? null : Math.round(p.dailyDay),
      p_rating: p.rating == null ? null : round1(p.rating),
      p_ortg: p.ortg == null ? null : round1(p.ortg),
      p_drtg: p.drtg == null ? null : round1(p.drtg),
      p_chemistry: p.chemistry == null ? null : roundTo(p.chemistry, 2),
      p_structure_mult: p.structureMult == null ? null : roundTo(p.structureMult, 3),
      p_archetype: p.archetype || null,
      p_spend_musd: p.spendMusd == null ? null : round1(p.spendMusd),
      p_respins: Math.round(p.respins || 0),
      p_all_time_rank: p.allTimeRank == null ? null : Math.round(p.allTimeRank),
      p_picks: p.picks || null,
      p_slots: p.slots || null,
      p_seed: p.seed == null ? null : String(p.seed),
      p_rng_calls: p.rngCalls == null ? null : Math.round(p.rngCalls),
    };
    try {
      const res = await timed(base() + 'rpc/rtf_submit_run', {
        method: 'POST', headers: headers(), body: JSON.stringify(body),
      });
      if (!res.ok) return await fail('submit', res);
      const id = await res.json();
      return typeof id === 'number' ? id : null;
    } catch (e) { return failThrown('submit', e); }
  }

  /* The run you finished before you signed in. Only ever stamps a row that is
     still unowned, which is enforced in the function and not here: the id
     travels through the browser, so the id alone must not be enough to own a
     row. Answers false rather than throwing on anything at all. */
  async function claim(id) {
    if (!id) return false;
    try {
      const res = await timed(base() + 'rpc/rtf_claim_run', {
        method: 'POST', headers: headers(), body: JSON.stringify({ p_id: id }),
      });
      if (!res.ok) { await fail('claim', res); return false; }
      return (await res.json()) === true;
    } catch (e) { failThrown('claim', e); return false; }
  }

  /* ---------------- where one run sits ----------------
     Ahead of you means GREATER on both axes here, and the comparison still
     flips with the direction rather than being written as `gt` twice, because
     a reversed board is one argument away and the version that agrees by
     coincidence is the version that breaks silently.

     Nulls need no excluding: a row with no rating is neither greater than nor
     less than yours, so it falls out of the count on its own, which matches a
     list that also leaves it out.

     Equal runs share a place, and the list breaks the tie by who got there
     first. */
  async function placeIn(mode, sort, dirWant, value, named) {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) return null;
    const key = SORTS[sort] ? sort : DEFAULT_SORT;
    const col = SORTS[key];
    const dir = dirOf(key, dirWant);
    /* Rounded to match what the column HOLDS, or the comparison is against a
       precision the stored rows do not have and the place comes back one out.
       rating is numeric(5,1) and rtf_submit_run rounds to one place on the way
       in. Done here rather than at the call site, so every caller is protected
       rather than the one that remembered. */
    const v = col === 'rating' ? round1(value) : value;
    try {
      const q = base() + TABLE + '?select=id&limit=1' +
        '&' + col + '=' + (dir === 'asc' ? 'lt.' : 'gt.') + encodeURIComponent(v) +
        scope(mode, named);
      const res = await timed(q, { headers: headers({ Prefer: 'count=exact' }) });
      if (!res.ok) return await fail('place', res);
      const ahead = countOf(res);
      return ahead === null ? null : ahead + 1;
    } catch (e) { return failThrown('place', e); }
  }

  /* How many runs are on this board at all, so a place can be shown as "412th
     of 9,051" rather than as a bare ordinal nobody can read a meaning into. */
  async function total(mode, named) {
    try {
      const q = base() + TABLE + '?select=id&limit=1' + scope(mode, named);
      const res = await timed(q, { headers: headers({ Prefer: 'count=exact' }) });
      if (!res.ok) return await fail('total', res);
      return countOf(res);
    } catch (e) { return failThrown('total', e); }
  }

  /* Your place and the field, in one round trip pair rather than two in
     sequence, because two one-after-another is most of a second on a phone and
     they do not depend on each other.

     COUNTED AGAINST THE BOARD, WHICH IS THE NAMED ROWS. The college board
     counted against every row in the window, guests included, so its results
     screen could say 40th while the board seated the same season 31st: two
     different numbers for one question, and the one you could check was the
     one that was wrong. Both halves here are named, so the place and the field
     it is out of describe the same population as the list. */
  async function ranks(mode, score) {
    const [place, count, played] = await Promise.all([
      placeIn(mode, 'run', 'desc', score, true),
      total(mode, true),
      /* And the unnamed total beside it, because "how many runs have been
         played here" and "who is on the board" are two different questions and
         the first is the one that says whether a mode is alive. */
      total(mode, false),
    ]);
    return { place, total: count, played };
  }

  /* ---------------- the list ----------------
     `dir`, when given, overrides the axis's natural direction. Reading an index
     backwards is as cheap as reading it forwards in Postgres, so a reversed
     board costs no new index and no extra time, provided the tiebreak reverses
     with it, which is what tiebreakFor is for.

     Validated against DIR's own two values rather than passed through, for the
     same reason `sort` is looked up in SORTS: nothing a caller hands in reaches
     an order= parameter as text. */
  async function top(mode, limit, sort, dirWant) {
    const key = SORTS[sort] ? sort : DEFAULT_SORT;
    const col = SORTS[key];
    const dir = dirOf(key, dirWant);
    const n = Math.min(200, Math.max(1, Math.round(Number(limit) || 25)));
    try {
      const q = base() + TABLE + '?select=' + COLS +
        '&order=' + col + '.' + dir + ',created_at.' + tiebreakFor(key, dir) +
        '&limit=' + n +
        /* The rating axis cannot order rows that have none, and PostgREST puts
           nulls last on a desc order anyway, but saying so keeps the count and
           the list describing the same rows. */
        (col === 'rating' ? '&rating=not.is.null' : '') +
        scope(mode, true);
      const res = await timed(q, { headers: headers() });
      if (!res.ok) return await fail('top', res);
      const rows = await res.json();
      return Array.isArray(rows) ? rows : null;
    } catch (e) { return failThrown('top', e); }
  }

  /* Your own runs, newest first, for the profile. Needs a user id rather than
     reading one out of the session, so a caller that has not resolved its
     session yet gets null instead of everybody's runs. */
  async function mine(userId, limit) {
    if (!userId) return null;
    const n = Math.min(100, Math.max(1, Math.round(Number(limit) || 20)));
    try {
      const q = base() + TABLE + '?select=' + COLS +
        '&user_id=eq.' + encodeURIComponent(userId) +
        '&order=created_at.desc&limit=' + n;
      const res = await timed(q, { headers: headers() });
      if (!res.ok) return await fail('mine', res);
      const rows = await res.json();
      return Array.isArray(rows) ? rows : null;
    } catch (e) { return failThrown('mine', e); }
  }

  /* Which locked boards have anything on them, so the picker can lead with
     where the competition is. It reports COUNTS and decides nothing: every
     door is still offered, because on a mode this new "nobody yet" is the
     common case and being first is the prize. */
  async function boards() {
    try {
      const res = await timed(base() + 'rpc/rtf_board_modes', {
        method: 'POST', headers: headers(), body: '{}',
      });
      if (!res.ok) return await fail('boards', res);
      const rows = await res.json();
      return Array.isArray(rows) ? rows : null;
    } catch (e) { return failThrown('boards', e); }
  }

  window.RTF_BOARD = {
    /* Moves when any of the shapes above change. index.html pins this and falls
       through to a stub that answers null to everything when it disagrees,
       which is the SOFT failure the football game shipped a version of for a
       whole release: the page ran on the stub, printed dashes where the
       leaderboard should have been, and looked exactly like a site having a bad
       network day. Nothing throws, so nothing reports it. Bump this and the
       page's NEED_BOARD in the same commit. */
    API_VERSION: BOARD_API_VERSION,
    submit, claim, ranks, top, mine, boards, placeIn, total, boardsScope: scope,
    scoreOf, recordScoreOf, depthOf, modeOf, round1,
    SORTS, DIR, DEFAULT_SORT,
    get offline() { return offline; },
    get lastError() { return lastError; },
    get needsMigration() { return needsMigration; },
  };
})();
