/*
 * board.js - the leaderboard client for College Football: Perfect Season.
 *
 * Talks to the Supabase REST API directly with fetch, the same way the football and
 * soccer boards do, rather than pulling in the supabase-js bundle. Every call here
 * is one of four shapes and none of them needs a client library:
 *
 *   submit a season       POST /rpc/cfb_submit_run
 *   count better seasons  GET  /cfb_runs?score=gt.N       + Prefer: count=exact
 *   count in a window     GET  /cfb_runs?created_at=gte.T + Prefer: count=exact
 *   list the top rows     GET  /cfb_runs?order=score.desc&limit=N
 *
 * EVERY FUNCTION FAILS SOFT. If supabase/62_cfb_leaderboard.sql has not been run, or
 * the network is down, or the table is renamed, each call resolves to null and
 * PS_CFB_BOARD.offline goes true. The game then says the board is not reachable,
 * which is the truth, instead of showing a made-up rank. NOTHING HERE IS EVER
 * ALLOWED TO BREAK A FINISHED SEASON: the results screen paints first and asks the
 * board afterwards.
 *
 * NO PER-COLUMN FALLBACK, deliberately, and that is a real difference from
 * football/board.js. That client carries three droppable column sets because its
 * schema arrived across five migrations and there are genuine intermediate states
 * where a project has names but not avatars. This game ships one file, so either the
 * table is there in full or it is not there at all, and a partial retry could only
 * ever mask a broken query as a missing migration.
 *
 * The anon key is public by design: it is already in the page source of every other
 * game on this site, and the table's RLS lets it read and lets it call one function.
 * It cannot insert, update or delete a row directly.
 */
(function () {
  'use strict';

  const SB_URL = 'https://jcrrxqfpdelrmvjuihnm.supabase.co';
  const SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpjcnJ4cWZwZGVscm12anVpaG5tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3OTY5NjIsImV4cCI6MjA5NjM3Mjk2Mn0.wyjoZpa2yRW-l38-KMGqBvEgTlW9v1KheNye7csWAlM';

  /* Overridable so a test can point the whole module at a local stand-in for
     PostgREST without touching the shipped constants. */
  const base = () => (window.PS_CFB_BOARD_URL || SB_URL) + '/rest/v1/';

  const TIMEOUT_MS = 15000;
  const TABLE = 'cfb_runs';

  /* Columns the board list needs, named explicitly rather than select=*, so the rows
     stay small and adding a column to the table does not silently grow every board
     request. No player-supplied text is among them: the roster comes back as ids and
     is rendered against the client's own copy of the player data. */
  /* SIX COMPETITIONS, NOT ONE BOARD WITH A FILTER ON IT. Six spins restricted to
     the SEC and six over the whole country do not produce comparable rosters, and
     neither does the SEC against the Pac-12. Every query below carries a mode.
     See supabase/63_cfb_run_mode.sql. */
  const MODES = ['free', 'conf:SEC', 'conf:Big Ten', 'conf:Big 12', 'conf:ACC', 'conf:Pac-12'];
  const modeOf = (m) => (MODES.indexOf(m) >= 0 ? m : 'free');

  const COLS = 'id,created_at,display_name,run_mode,regular_wins,playoff_wins,wins,losses,games,' +
    'national_rank,playoff_seed,made_playoffs,title_won,perfect,eliminated_in,bowl,' +
    'bowl_won,bowl_key,seed_label,point_diff,chemistry_pct,spend_musd,respins,sig_wins,' +
    'best_win_rank,squad_fppg,structure_mult,team_rating,overall,perfect_pct,picks,slots,' +
    /* THE CIRCLE, drawn from the ROW's own columns and never from the viewer's, so two
       people who both play in Virginia colors both show Virginia. See
       supabase/66_cfb_profile_avatars.sql. A project that has not run that file yet has no
       such columns and PostgREST answers 400 to the whole select, which is why every list
       call below drops back to the columns without them rather than showing an empty
       board. */
    'display_school,display_initials';
  /* The same list minus the two 66 adds, for exactly that fallback. */
  const COLS_NO_AVATAR = COLS.replace(',display_school,display_initials', '');
  let avatarCols = true;
  const cols = () => (avatarCols ? COLS : COLS_NO_AVATAR);

  /* THE THREE THINGS A BOARD CAN BE SORTED BY, and the column each orders on. Named
     here rather than taking a column name from the caller, so nothing can put an
     arbitrary string into an order= parameter.

     `rank` is the odd one and the most college thing on the board: it is the only
     axis where LOW IS GOOD, because No. 1 in the country is first. DIR carries that,
     so no caller has to remember which way each axis runs. */
  const SORTS = { record: 'score', overall: 'overall', rank: 'national_rank' };
  const DIR = { record: 'desc', overall: 'desc', rank: 'asc' };

  /* Postgres reads an index backwards as happily as forwards, but only when every
     sort key reverses together: `score asc, created_at asc` against a
     (score desc, created_at asc) index is a backward scan plus an Incremental Sort,
     while `score asc, created_at desc` is a clean backward scan. So the tiebreak
     flips with the sort. */
  const ORDER_TIEBREAK = { desc: 'asc', asc: 'desc' };

  let offline = false;

  /* THE LAST THING THAT WENT WRONG, kept rather than thrown away. Failing soft and
     silently is right for the player and useless for working out why nothing is
     being recorded: a failed submit looks exactly like a healthy board with nobody
     on it. PostgREST answers a rejected call with a JSON body carrying a code and a
     message, and that body is the whole diagnosis. */
  let lastError = null;
  /* Set when the table itself is missing, so the diagnostics can name the file to
     run rather than leaving it to be guessed. */
  let needsMigration = false;

  async function fail(where, res) {
    offline = true;
    let body = null;
    try { body = await res.json(); } catch (e) { body = null; }
    const msg = (body && (body.message || body.hint)) || res.statusText || 'no message';
    if (res.status === 404 || /cfb_runs|cfb_submit_run/.test(msg)) needsMigration = true;
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
     Postgres `round(numeric, n)` rounds a half AWAY FROM ZERO; Math.round rounds a
     half toward positive infinity. They agree on every positive value and disagree
     on every negative one that lands exactly on a half:

       round(-7.55, 1)          => -7.6   (Postgres)
       Math.round(-75.5) / 10   => -7.5   (JavaScript)

     which is one whole step of the score column. That matters because scoreOf()
     below recomputes the stored `score` locally so the results screen can show a
     place without waiting for the row to come back: if the two definitions disagree,
     the count of seasons ahead of you is taken against a number that is not the one
     in your row, and your own place comes back off by however many rows sit in the
     gap. Reachable on any season with a negative point differential that lands on a
     half, which a 16-game champion at minus four points does. */
  const roundTo = (n, places) => {
    const f = Math.pow(10, places);
    const v = Number(n) * f;
    return (v < 0 ? -Math.round(-v) : Math.round(v)) / f;
  };
  /* One decimal place, matching round(p_point_diff, 1) in cfb_submit_run(). */
  const round1 = (n) => roundTo(n, 1);
  /* Two, matching the numeric(6,2) overall column. THE COLUMN TYPE DOES THE ROUNDING
     ON THE WAY IN, so a place counted against an unrounded local value counts your
     own row as ahead of you: 73.456 stored as 73.46 is greater than 73.456. */
  const round2 = (n) => roundTo(n, 2);

  /* THE SIGNED-IN USER'S TOKEN, WHEN THERE IS ONE. Sending the anon key while
     somebody is signed in would leave auth.uid() null inside cfb_submit_run(), so
     their season would record as a guest and their name would never appear on it.
     The apikey header stays the anon key either way, which is what PostgREST wants;
     only the bearer changes. */
  const headers = (extra) => {
    const A = window.PS_CFB_AUTH;
    const tok = (A && A.token && A.token()) || SB_ANON;
    return Object.assign({
      apikey: SB_ANON,
      Authorization: 'Bearer ' + tok,
      'Content-Type': 'application/json',
    }, extra || {});
  };

  /* A hung request must not leave the results screen waiting forever. */
  function timed(url, opts) {
    const ctl = typeof AbortController === 'function' ? new AbortController() : null;
    const t = setTimeout(() => { if (ctl) ctl.abort(); }, TIMEOUT_MS);
    return fetch(url, Object.assign({ signal: ctl ? ctl.signal : undefined }, opts))
      .finally(() => clearTimeout(t));
  }

  /* PostgREST returns the exact count in Content-Range as "0-24/1234". A missing or
     unparseable header is a FAILURE, not a zero: reading it as zero would rank
     everybody first. */
  function countOf(res) {
    const cr = res.headers.get('content-range') || '';
    const total = cr.split('/')[1];
    if (!total || total === '*') return null;
    const n = parseInt(total, 10);
    return Number.isFinite(n) ? n : null;
  }

  /* ---------------- the three windows ----------------
     EASTERN, NOT UTC, AND NOT THE VIEWER'S OWN CLOCK.

     One fixed zone, because a board where everyone's day starts at a different moment
     is not one board. UTC puts the reset at 8pm Eastern the evening before, so
     "Today" fills up during Saturday evening and the week rolls over while Saturday
     is still being played. College football is played on Saturdays in the Eastern
     United States, so that is the clock these windows keep.

     America/New_York rather than a fixed -5, so the reset stays at midnight through
     the summer instead of drifting to 1am. */
  const ZONE = 'America/New_York';

  /* The wall clock in the zone at a given instant, as numbers. */
  function zoneParts(d) {
    const f = new Intl.DateTimeFormat('en-US', {
      timeZone: ZONE, hourCycle: 'h23', year: 'numeric', month: '2-digit',
      day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const p = {};
    for (const part of f.formatToParts(d)) if (part.type !== 'literal') p[part.type] = +part.value;
    return p;
  }

  /* How far the zone is from UTC in minutes at that instant: -240 on EDT, -300 on EST. */
  function zoneOffsetMin(d) {
    const p = zoneParts(d);
    const asIfUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    return (asIfUTC - Math.floor(d.getTime() / 1000) * 1000) / 60000;
  }

  /* The instant a given Eastern calendar day began. Iterated, because the offset is
     read at one instant and applied at another, and on the two days a year the clocks
     move those are not the same offset. */
  function zoneMidnight(year, month, day) {
    const wall = Date.UTC(year, month - 1, day);
    let t = wall - zoneOffsetMin(new Date()) * 60000;
    t = wall - zoneOffsetMin(new Date(t)) * 60000;
    return new Date(wall - zoneOffsetMin(new Date(t)) * 60000);
  }

  function cutoffISO(win) {
    if (win === 'all') return null;
    try {
      const p = zoneParts(new Date());
      let y = p.year, m = p.month, d = p.day;
      if (win === 'week') {
        /* Which weekday that Eastern date is. Plain calendar arithmetic on the date
           itself, so no zone is involved in the question. 0 = Monday. */
        const dow = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
        const back = new Date(Date.UTC(y, m - 1, d - dow));
        y = back.getUTCFullYear(); m = back.getUTCMonth() + 1; d = back.getUTCDate();
      }
      return zoneMidnight(y, m, d).toISOString();
    } catch (e) {
      /* No zone database in this engine. Fall back to the UTC boundary rather than
         returning nothing, because a board with no window at all would quietly show
         all-time numbers under a Today tab. */
      const now = new Date();
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      if (win === 'week') d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
      return d.toISOString();
    }
  }

  /* THE WINDOW IS AN INSTANT AND NOT A STORED DAY COLUMN, and that is on purpose.
     Every index in 62_cfb_leaderboard.sql carries created_at as its last column,
     which is what lets a time window be tested from INSIDE the index rather than as
     a filter with a heap fetch per candidate row. Windowing on any column those
     indexes do not carry turns a two-millisecond board into a quarter of a second.
     Measured on ps_runs at two million rows: 1,081 buffers against 59,917. */
  function scope(opts) {
    const win = (opts && opts.window) || 'all';
    const cut = cutoffISO(win);
    /* The mode is an equality and leads every index, so it goes on every query
       including the counts: a place counted against the wrong competition is worse
       than no place at all. */
    return '&run_mode=eq.' + encodeURIComponent(modeOf(opts && opts.mode)) +
      (cut ? '&created_at=gte.' + encodeURIComponent(cut) : '');
  }

  /* ---------------- submit ----------------
     Sends four numbers about the result and nothing else: regular wins, the national
     ranking, playoff wins and whether a bowl was won. Every other field on the row,
     including the seed, the bye, the bowl tier, the round it ended in and whether it
     was perfect, is derived by cfb_submit_run(). See the header of
     supabase/62_cfb_leaderboard.sql for why that is the shape.

     Resolves to the new row's id, or null. A null is never fatal: the results screen
     is already painted by the time this is called. */
  async function submit(payload) {
    const p = payload || {};
    const body = {
      p_regular_wins:  Math.round(p.regularWins),
      p_national_rank: Math.round(p.nationalRank),
      p_playoff_wins:  Math.round(p.playoffWins || 0),
      p_bowl_won:      !!p.bowlWon,
      p_point_diff:    round1(p.pointDiff),
      p_chemistry_pct: round2(p.chemistryPct),
      p_spend_musd:    round2(p.spendMusd),
      p_respins:       Math.round(p.respins || 0),
      p_sig_wins:      Math.round(p.sigWins || 0),
      p_best_win_rank: p.bestWinRank == null ? null : Math.round(p.bestWinRank),
      p_picks:         p.picks || null,
      p_slots:         p.slots || null,
      p_rng_seed:      p.rngSeed || null,
      p_rng_calls:     p.rngCalls == null ? null : Math.round(p.rngCalls),
      p_squad_fppg:    p.squadFppg == null ? null : round1(p.squadFppg),
      p_structure_mult: p.structureMult == null ? null : roundTo(p.structureMult, 3),
      p_team_rating:   p.teamRating == null ? null : round2(p.teamRating),
      p_overall:       p.overall == null ? null : round2(p.overall),
      p_perfect_pct:   p.perfectPct == null ? null : Math.round(p.perfectPct),
      p_run_mode:      modeOf(p.runMode),
      /* WHICH bowl, as a slug rather than a name. The server keeps it only when a
         bowl was actually played, and the client renders a name by looking the
         slug up in its own table, so nothing that arrives at the database is ever
         displayed back. See supabase/64_cfb_bowl_key.sql. */
      p_bowl_key:      p.bowlKey || null,
    };
    try {
      const res = await timed(base() + 'rpc/cfb_submit_run', {
        method: 'POST', headers: headers(), body: JSON.stringify(body),
      });
      if (!res.ok) return await fail('submit', res);
      const id = await res.json().catch(() => null);
      return typeof id === 'number' ? id : null;
    } catch (e) { return failThrown('submit', e); }
  }

  /* ---------------- is the board there at all ----------------
     One cheap read, used by the diagnostics panel so "the board is offline" can say
     which of the two reasons it is. */
  async function probe() {
    try {
      const res = await timed(base() + TABLE + '?select=id&limit=1',
        { headers: headers({ Prefer: 'count=exact' }) });
      if (!res.ok) { await fail('probe', res); return false; }
      offline = false;
      return true;
    } catch (e) { failThrown('probe', e); return false; }
  }

  /* ---------------- where one season sits ----------------
     Ahead of you means GREATER on a high-to-low board and SMALLER on a low-to-high
     one, so the comparison flips with the direction. That is not a nicety here: the
     ranking axis runs low-to-low-is-better, and counting it the other way would put
     the No. 1 team in the country last.

     Nulls need no excluding: a row with no overall is neither greater than nor less
     than yours, so it falls out of the count on its own, which matches a list that
     also leaves it out.

     Equal seasons share a place, and the list breaks the tie by who got there first. */
  async function placeIn(opts, sort, value) {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) return null;
    const key = SORTS[sort] ? sort : 'record';
    const col = SORTS[key];
    const dir = DIR[key];
    /* Rounded to match what the column HOLDS, or the comparison is against a
       precision the stored rows do not have and the place comes back one out. */
    const v = col === 'overall' ? round2(value) : value;
    try {
      const q = base() + TABLE + '?select=id&limit=1' +
        '&' + col + '=' + (dir === 'asc' ? 'lt.' : 'gt.') + encodeURIComponent(v) +
        scope(opts);
      const res = await timed(q, { headers: headers({ Prefer: 'count=exact' }) });
      if (!res.ok) return await fail('place', res);
      const ahead = countOf(res);
      return ahead === null ? null : ahead + 1;
    } catch (e) { return failThrown('place', e); }
  }

  /* How many seasons are in the window at all, so a place can be shown as "412th of
     9,051" rather than as a bare ordinal nobody can read a meaning into. */
  async function total(opts) {
    try {
      const q = base() + TABLE + '?select=id&limit=1' + scope(opts);
      const res = await timed(q, { headers: headers({ Prefer: 'count=exact' }) });
      if (!res.ok) return await fail('total', res);
      return countOf(res);
    } catch (e) { return failThrown('total', e); }
  }

  /* How many perfect seasons exist, which is the one number worth stating in absolute
     terms rather than as a rank. */
  async function perfectCount(opts) {
    try {
      const q = base() + TABLE + '?select=id&limit=1&perfect=is.true' + scope(opts);
      const res = await timed(q, { headers: headers({ Prefer: 'count=exact' }) });
      if (!res.ok) return await fail('perfect', res);
      return countOf(res);
    } catch (e) { return failThrown('perfect', e); }
  }

  /* The three windows in one go, for the results screen. Parallel rather than
     sequential: three round trips one after another is most of a second on a phone,
     and they do not depend on each other. */
  async function ranks(score, mode) {
    const wins = ['today', 'week', 'all'];
    const out = await Promise.all(wins.map(async (w) => {
      const opts = { window: w === 'today' ? 'day' : w, mode };
      const [place, count] = await Promise.all([
        placeIn(opts, 'record', score), total(opts),
      ]);
      return { window: w, place, total: count };
    }));
    const by = {};
    out.forEach((r) => { by[r.window] = r; });
    return by;
  }

  /* ONE RETRY, AND ONLY EVER ONE. A project that has the college game but has not run
     66_cfb_profile_avatars.sql has no display_school or display_initials, and PostgREST
     answers 400 to the whole select rather than ignoring the two it does not know -- so
     without this the board would be empty on that project rather than merely circle-less.
     The flag is sticky, so the cost is one wasted request per page load and not one per
     query, and it flips only on 400: a 500 or a network failure is not "the columns are
     missing" and must keep reporting itself as what it is.

     `build` takes the column list rather than closing over it, because the retry has to
     produce the same URL with a different select and the rest of the query is different
     for each of the three callers. */
  async function selectRows(build, init) {
    let res = await timed(build(cols()), init);
    if (!res.ok && res.status === 400 && avatarCols) {
      avatarCols = false;
      res = await timed(build(cols()), init);
    }
    return res;
  }

  /* ---------------- the list ---------------- */
  async function top(opts, limit, sort) {
    const key = SORTS[sort] ? sort : 'record';
    const col = SORTS[key];
    const way = DIR[key];
    const q = (c) => base() + TABLE + '?select=' + c +
      '&order=' + col + '.' + way + ',created_at.' + ORDER_TIEBREAK[way] +
      '&limit=' + (limit || 25) + scope(opts) +
      (col !== 'score' ? '&' + col + '=not.is.null' : '');
    try {
      const res = await selectRows(q, { headers: headers() });
      if (!res.ok) return await fail('board', res);
      const rows = await res.json().catch(() => null);
      return Array.isArray(rows) ? rows : null;
    } catch (e) { return failThrown('board', e); }
  }

  /* ---------------- one player's own seasons ----------------
     Everything the trophy case and the career panel need, in one request. Newest
     first, with the exact total in Content-Range so the count is right even when
     there are more seasons than were fetched.

     ORDERED BY created_at RATHER THAN BY ANY MEASURE OF QUALITY, even though the
     panel's headline is a best-seasons list. Sorting by rating in the query would
     return the top N and nothing else, and a career total, a title count and a
     playoff rate cannot be worked out from the best N; they need the whole set. So
     the whole set comes back and the ranking happens on the client.
     cfb_runs_user_idx is (user_id, created_at desc), so this ordering is already an
     index scan. */
  async function mine(userId, limit) {
    if (!userId) return null;
    try {
      const q = (c) => base() + TABLE + '?select=' + c +
        '&user_id=eq.' + encodeURIComponent(userId) +
        '&order=created_at.desc&limit=' + (limit || 500);
      const res = await selectRows(q, { headers: headers({ Prefer: 'count=exact' }) });
      if (!res.ok) return await fail('mine', res);
      const rows = await res.json().catch(() => null);
      if (!Array.isArray(rows)) return null;
      return { rows, total: countOf(res) === null ? rows.length : countOf(res) };
    } catch (e) { return failThrown('mine', e); }
  }

  async function byId(id) {
    if (!id) return null;
    try {
      const q = (c) => base() + TABLE + '?select=' + c + '&id=eq.' +
        encodeURIComponent(id) + '&limit=1';
      const res = await selectRows(q, { headers: headers() });
      if (!res.ok) return await fail('row', res);
      const rows = await res.json().catch(() => null);
      return (Array.isArray(rows) && rows[0]) || null;
    } catch (e) { return failThrown('row', e); }
  }

  /* ---------------- your circle ----------------
     WHAT THIS ACCOUNT HAS CHOSEN, read from profiles rather than from a row of yours,
     because a player who has never finished a season still has a circle and there would be
     no row to read it off. The school is this game's; the initials are the site's, shared
     with the NFL game, which is why they come out of the same avatar_initials column.
     See supabase/66_cfb_profile_avatars.sql. */
  let avatarFnMissing = false;
  async function myAvatar(userId) {
    if (!userId) return null;
    try {
      const q = base() + 'profiles?select=cfb_school,avatar_initials&id=eq.' +
        encodeURIComponent(userId);
      const res = await timed(q, { headers: headers() });
      /* A project one file behind has no such columns, and that is not an error worth
         surfacing: it means the same thing as having chosen nothing. */
      if (!res.ok) {
        if (res.status === 400) return { school: null, initials: null };
        return await fail('avatar', res);
      }
      const rows = await res.json().catch(() => null);
      const r = (Array.isArray(rows) && rows[0]) || {};
      return { school: r.cfb_school || null, initials: r.avatar_initials || null };
    } catch (e) { return failThrown('avatar', e); }
  }

  /* THE ONLY WRITE PATH. cfb_set_avatar() validates the school against its own shape rule
     and strips the initials to at most two of A-Z0-9, then rewrites every one of the
     caller's rows in the same transaction, so the board is never half one circle and half
     another. Nothing here trusts what it sent: the pair the function returns is what was
     actually stored, and that is what the caller renders. */
  async function setAvatar(school, initials) {
    try {
      const res = await timed(base() + 'rpc/cfb_set_avatar', {
        method: 'POST', headers: headers(),
        body: JSON.stringify({ p_school: school || '', p_initials: initials || '' }) });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        lastError = { where: 'avatar', status: res.status, code: (body && body.code) || '',
          message: (body && (body.message || body.hint)) || res.statusText || 'no message' };
        /* NOT offline. A refused school is the database working exactly as intended, and
           marking the whole board unreachable over it would put a "not reachable" notice on
           a leaderboard that is answering every other call. */
        /* THE FUNCTION IS NOT THERE, which is a different thing from the call being refused
           and the one the caller has to tell apart: nothing the player does will make it
           work, so the answer is not "try again". PostgREST says PGRST202 with a 404 when a
           function is missing from its schema cache. */
        if (res.status === 404 || lastError.code === 'PGRST202') avatarFnMissing = true;
        return { error: lastError.message, code: lastError.code, status: res.status,
          missing: avatarFnMissing };
      }
      /* `returns table` comes back as an array of one row. */
      const r = (Array.isArray(body) ? body[0] : body) || {};
      return { school: r.school || null, initials: r.initials || null };
    } catch (e) {
      return { error: (e && e.message) || 'the request did not complete' };
    }
  }

  /* The same arithmetic the generated `score` column does, so the results screen can
     work out its own place without waiting for the row to come back. Kept in step
     with the column definition in 62_cfb_leaderboard.sql BY HAND: if one changes,
     the other has to. The rounding matters, because point_diff is stored to one
     decimal and an unrounded local value would count your own row as ahead of you. */
  function scoreOf(wins, pointDiff) {
    const d = Math.max(0, Math.min(9999, Math.round((round1(pointDiff) + 40) * 100)));
    return Math.round(wins) * 10000 + d;
  }

  window.PS_CFB_BOARD = {
    API_VERSION: 1,
    submit, probe, ranks, placeIn, total, perfectCount, top, mine, byId, scoreOf,
    myAvatar, setAvatar,
    get avatarFnMissing() { return avatarFnMissing; },
    cutoffISO, SORTS, DIR, MODES,
    get offline() { return offline; },
    get lastError() { return lastError; },
    get needsMigration() { return needsMigration; },
    /* Used by the tests to prove a failed board never breaks the results screen. */
    _forceOffline() { offline = true; },
  };
})();
