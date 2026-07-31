/*
 * board.js - the leaderboard client for The Perfect Season.
 *
 * Talks to the Supabase REST API directly with fetch, the same way the soccer
 * game's leaderboard does, rather than pulling in the supabase-js bundle. Every
 * call here is one of five shapes, and none of them needs a client library:
 *
 *   submit a run          POST /rpc/ps_submit_run
 *   count better runs     GET  /ps_runs?score=gt.N       + Prefer: count=exact
 *   count runs in window  GET  /ps_runs?created_at=gte.T + Prefer: count=exact
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

  const TIMEOUT_MS = 15000;
  const TABLE = 'ps_runs';

  /* Columns the board list needs. Named explicitly rather than select=*, so the
     rows stay small and adding a column to the table does not silently grow every
     board request. */
  /* Two column lists, and the reason is a real deployment hazard rather than
     tidiness. display_name arrives with 51_football_accounts.sql, and PostgREST
     answers a select naming a column the table does not have with a 400, which would
     take the WHOLE board down on a project that had run 50 and not yet 51: not a
     missing name, an empty leaderboard. So a 400 that names the column falls back to
     the list without it, once, and remembers. Same shape as the pre-migration retries
     in the soccer client. */
  /* `run_mode` is NOT in an optional set the way display_name is, and deliberately. Those
     exist because a board can still be useful with a column missing: no names is a board
     of Anonymous rows, no avatar pair is a board of derived colours. run_mode is what every
     board query filters ON, so a project without it cannot answer a board request at all
     and there is nothing to fall back to. 57_football_run_mode.sql is required, and the
     diagnostic names it rather than pretending a retry could help.

     AND IT IS run_mode AND NOT mode, which is not a style preference. A column called
     `mode` sent the whole board down with

         400 42809. WITHIN GROUP is required for ordered-set aggregate mode

     on a query that calls no function at all. PostgREST lets you filter on a computed
     column, so when its schema cache does not have the column, either because the migration
     has not run or because the cache has not reloaded since it did, it resolves the name as
     a function and emits an unqualified mode(ps_runs). Postgres then finds pg_catalog.mode(),
     the ordered-set aggregate, and complains it was called without WITHIN GROUP. Reproduced
     exactly against a real database. Any column named after a built-in aggregate can do this;
     run_mode collides with nothing, and a stale cache now says the column is missing, which
     is the truth and is actionable. */
  const BASE_COLS = 'id,created_at,wins,losses,games,title_won,perfect,made_playoffs,' +
    'seed_label,point_diff,chemistry_pct,spend_musd,respins,franchise,run_mode,picks,slots,' +
    'squad_fppg,structure_mult,team_rating,perfect_pct';
  /* TWO OPTIONAL SETS, DROPPED SEPARATELY, and the separateness is the whole point.
     display_name arrives with 51_football_accounts.sql and the avatar pair with
     53_football_profile_avatars.sql, so there is a real state in between where the name is
     there and the avatar is not. Dropping all three on the first 400 would take the names
     off a board that has them, for the length of time it takes somebody to get round to
     running the second file. So the avatar pair goes first, and only a complaint that names
     the name column drops that too. */
  let namesColumn = true;          // until the database says otherwise
  let avatarColumns = true;
  /* A THIRD DROPPABLE SET, for the same reason as the other two: these arrive with
     61_football_trade_machine.sql, and until it is run a project is in a real state where
     the names and avatars are there and these are not. Only the badge cabinet reads them,
     so losing them costs a few Trade Machine badges rather than the board. */
  let tradeColumns = true;
  const rowCols = () => BASE_COLS + (namesColumn ? ',display_name' : '') +
    (avatarColumns ? ',display_color,display_initials' : '') +
    (tradeColumns ? ',gm_rating,trade_moves' : '');
  const missingCol = (body, re) => {
    const m = (body && body.message) || '';
    return re.test(m) && /does not exist/i.test(m);
  };
  const missingAvatarColumn = (body) => missingCol(body, /display_color|display_initials/);
  const missingNameColumn = (body) => missingCol(body, /display_name/);
  const missingTradeColumn = (body) => missingCol(body, /gm_rating|trade_moves/);
  /* Not retried, only remembered, for the reason above BASE_COLS. Set so the connection
     check can say which file to run instead of "the board cannot be read".

     TWO SHAPES, because the same missing column shows up two different ways. If PostgREST
     knows the column is absent it says so and this is an ordinary "does not exist". If its
     cache is stale it guesses the name is a function instead, and Postgres answers about an
     aggregate; that is 42809 and it names no column at all. Both mean the same thing to a
     player, so both point at the same file. */
  const missingModeColumn = (body) => missingCol(body, /\brun_mode\b/)
    || /ordered-set aggregate/i.test((body && body.message) || '');
  let modeColumnMissing = false;

  /* The two things a board can be sorted by, and the column each one orders on.
     Named here rather than taking a column name from the caller, so nothing can
     put an arbitrary string into an order= parameter. */
  const SORTS = {
    record: 'score',
    rating: 'team_rating',
  };

  /* THE TIEBREAK REVERSES WITH THE SORT, and that is a performance decision as much
     as a design one. Every index here is (run_mode, <axis> desc, created_at asc), and
     Postgres can read an index backwards only when EVERY sort key reverses together:
     `score asc, created_at asc` is a backward scan plus an Incremental Sort, while
     `score asc, created_at desc` is a clean backward scan. Measured 0.234ms against
     0.060ms at 2M rows, which is why there is no ascending twin of any index.

     It reads correctly too: on a worst-first board, ties going to the most recent run
     is the natural way round. */
  const ORDER_TIEBREAK = { desc: 'asc', asc: 'desc' };

  let offline = false;

  /* THE LAST THING THAT WENT WRONG, kept rather than thrown away.
     Every call in here failed soft and silently, which is right for the player and
     useless for working out why nothing is being recorded: a failed submit looked
     exactly like a healthy board with nobody on it. PostgREST answers a rejected
     call with a JSON body carrying a code and a message, and that body is the whole
     diagnosis, so it is kept and shown. */
  let lastError = null;
  /* Set when the board had to fall back to the pre-accounts column list, so the
     diagnostics can name the file to run instead of leaving it to be guessed. */
  let needsAccountsMigration = false;
  /* Same idea one file along: set when the board had to drop the avatar columns, so the
     diagnostics can name 53 instead of leaving it to be guessed. */
  let needsAvatarMigration = false;
  /* Set when ps_set_avatar itself is missing, which is 53 and 54 not having been run at all,
     or run without PostgREST reloading its schema cache. */
  let avatarFnMissing = false;
  async function fail(where, res) {
    offline = true;
    let body = null;
    try { body = await res.json(); } catch (e) { body = null; }
    lastError = {
      where,
      status: res.status,
      code: (body && body.code) || '',
      message: (body && (body.message || body.hint)) || res.statusText || 'no message',
    };
    return null;
  }
  function failThrown(where, e) {
    offline = true;
    lastError = { where, status: 0, code: 'network',
      message: (e && e.message) || 'the request did not complete' };
    return null;
  }

  /* One decimal place, matching round(p_point_diff, 1) in ps_submit_run(). Declared
     up here because both submit() and scoreOf() need it and submit() is defined
     first. */
  const round1 = (n) => Math.round(Number(n) * 10) / 10;
  /* Two, matching the numeric(6,2) team_rating column. The column type does the
     rounding on the way in, so a place counted against an unrounded local rating
     counts your own row as ahead of you: 73.456 stored as 73.46 is greater than
     73.456. Same trap as the point_diff rounding in scoreOf, one column over. */
  const round2 = (n) => Math.round(Number(n) * 100) / 100;

  /* THE SIGNED-IN USER'S TOKEN, WHEN THERE IS ONE.
     Sending the anon key while somebody is signed in would leave auth.uid() null
     inside ps_submit_run(), so their run would record as a guest and their name would
     never appear on it. The apikey header stays the anon key either way, which is what
     PostgREST wants; only the bearer changes. */
  const headers = (extra) => {
    const tok = (window.PS_AUTH && window.PS_AUTH.token && window.PS_AUTH.token()) || SB_ANON;
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
     EASTERN, NOT UTC, AND NOT THE VIEWER'S OWN CLOCK.

     One fixed zone, because a board where everyone's day starts at a different moment
     is not one board. It was UTC, which put the reset at 8pm Eastern the evening
     before: "Today" filled up during Sunday evening and the week rolled over while
     Sunday was still being played. Eastern is where the sport is, so that is the
     clock the windows keep. The week still starts Monday, now Monday at midnight
     Eastern, which is the moment Sunday ends.

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

  /* The instant a given Eastern calendar day began.
     Iterated, because the offset is read at one instant and applied at another, and on
     the two days a year the clocks move those are not the same offset. One pass lands
     within an hour; the second uses the offset that actually applies at the candidate
     and lands exactly. */
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
      /* No zone database in this engine. Fall back to the old UTC boundary rather than
         returning nothing, because a board with no window at all would quietly show
         all-time numbers under a Today tab. */
      const now = new Date();
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      if (win === 'week') d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
      return d.toISOString();
    }
  }


  /* ---------------- WHY THE WINDOW IS STILL AN INSTANT AND NOT A DAY ----------------
     The obvious way to make a 500-row windowed board cheap is to stop comparing
     created_at against a boundary instant and compare a stored Eastern-day column
     against a date: Today becomes an equality, and an equality can lead an index.
     That was built, measured against the real schema at 2,000,000 rows, and thrown
     away, because it is 30 times slower on the board it was meant to speed up.

     The reason is the reason created_at is the last column of every index in
     50_football_perfect_season.sql. On the rating axis for this week, with the
     created_at boundary:

       Index Cond: (daily = false AND team_rating IS NOT NULL AND created_at >= ...)
       1,081 buffers, 9.0ms

     and with a run_date column the rating index does not carry:

       Index Cond: (daily = false AND team_rating IS NOT NULL)
       Filter:     (run_date >= ...)      Rows Removed by Filter: 58,777
       59,917 buffers, 251.9ms

     The window has to be a column the sort index already contains, or it stops being
     an index condition and becomes a heap fetch per candidate row. created_at is in
     every one of those indexes. A new column would be in none of them, and adding it
     to all of them to save nothing is how a table ends up paying write cost on every
     insert for indexes nobody needed.

     Measured on the same 2M rows, the deep page on the shipped indexes:

       rating, today, 500 rows     2.0ms
       rating, this week, 500      2.7ms
       record, today, 500          2.3ms
       count ahead of you, today   1.3ms

     So this needs no schema change at all, which is the whole point of writing it down
     here: the next person to notice that a range scan cannot lead an index will have
     the same good idea, and this is the measurement that says not to. */

  /* ---------------- free play and each club are separate competitions ----------------
     Not one board with a flag on it. A One Franchise run draws from ONE club's
     twenty-odd seasons, so six men off that roster share a franchise by construction
     and chemistry fires on almost every one of them. Ratings come out far above what
     the open draft produces. Mixed together, the free board would be nothing but club
     runs and the club runs would be ranked against a game they were not playing.

     mode is 'free' or 'club'. A club scope also carries `franchise`, and that is the
     whole difference: thirty-two boards, each one club, each windowed on created_at
     exactly like the free board.

     WHY A CLUB BOARD STILL WINDOWS ON created_at rather than being all-time only. The
     club indexes are (franchise, <axis> desc, created_at asc) partial on run_mode='club', so
     created_at is IN the index and Today is an index condition, not a filter. A window
     costs nothing here for the same reason it costs nothing on the free board, which is
     written out at length above. All-time only would have been less code and a worse
     board: after a month nobody new can reach the top of it. */
  function scope(opts) {
    opts = opts || {};
    const club = opts.mode === 'club' && opts.franchise;
    const eraMode = opts.mode === 'era' && opts.era;
    let f = '&run_mode=eq.' + (eraMode ? 'era' : club ? 'club' : 'free');
    if (club) f += '&franchise=eq.' + encodeURIComponent(opts.franchise);
    if (eraMode) f += '&era=eq.' + encodeURIComponent(opts.era);
    /* NAMED RUNS ONLY, when asked for. A guest run is a real draft and counts towards how
       many have been played, but it carries no name, so listing it puts a row of Anonymous
       on a board whose whole job is to say who did what. Every ranking call asks for this
       and the activity count deliberately does not, which is the difference between "how
       many drafts happened" and "who is on the board".

       ps_runs_named_score_idx and ps_runs_named_rating_idx are partial indexes over exactly
       these rows, and they are why this is free. Measured at 2,000,000 rows of which 20 were
       named, which is the shape a young board really has: as a plain filter the top-500 read
       scanned 666,726 rows in 246ms; against the partial index it is 0.03ms off 16kB. */
    if (opts.named && namesColumn) f += '&display_name=not.is.null';
    const cut = cutoffISO(opts.win || 'all');
    if (cut) f += '&created_at=gte.' + encodeURIComponent(cut);
    return f;
  }

  /* ---------------- submit ----------------
     Sends only what the server cannot derive. wins, losses, games, the seed label
     and the perfect flag are all recomputed in ps_submit_run() from regular_wins
     and playoff_wins, so there is no way for this call to disagree with the row
     that lands in the table.

     Returns the new row id, or null if it did not go through. A null here is not
     an error the player should see: their season still happened. */
  /* RETRIED, because a lost submit is how a real season goes unrecorded. The count
     queries can fail soft and silent all day: a rank that does not draw costs nothing.
     A submit that does not land loses the run, and on mobile the single most common
     reason is a dropped or timed-out request, not a rejected one. So a submit that
     THREW (network, timeout) or came back 5xx is tried again, up to three times with
     a widening gap. A 4xx is deterministic: the payload is wrong and no number of
     retries changes that, so it fails straight through with the server's reason kept. */
  async function submit(payload) {
    const args = {
      p_regular_wins: payload.regularWins,
      p_playoff_wins: payload.playoffWins,
      p_point_diff: round1(payload.pointDiff),
      p_chemistry_pct: payload.chemistryPct,
      p_spend_musd: payload.spendMusd,
      p_respins: payload.respins || 0,
      p_franchise: payload.franchise || null,
      p_era: payload.era || null,
      /* WHITELISTED, NOT PASSED THROUGH, so an unknown mode records as free play rather
         than being rejected by the server's check and losing the run. 'trade' was missing
         from this list, which is why every Trade Machine season until now went onto the
         free-play board: a different game, ranked against six-pick drafts. */
      p_mode: payload.mode === 'era' ? 'era'
        : payload.mode === 'club' ? 'club'
        : payload.mode === 'trade' ? 'trade' : 'free',
      p_picks: payload.picks,
      p_slots: payload.slots || null,
      p_seed: payload.seed || null,
      p_rng_calls: payload.rngCalls || null,
      p_squad_fppg: payload.squadFppg ?? null,
      p_structure_mult: payload.structureMult ?? null,
      p_team_rating: payload.teamRating ?? null,
      p_perfect_pct: payload.perfectPct ?? null,
    };
    /* ADDED ONLY WHEN THERE IS SOMETHING TO SAY, which is a compatibility decision and not
       a tidiness one. PostgREST resolves an RPC by the set of keys in the body, so sending
       a parameter the installed function does not have is a 404 rather than an ignored
       field: naming these unconditionally would break EVERY submit on a database that has
       not run 61_football_trade_machine.sql. Sent only for a Trade Machine run, the worst
       case is that trade runs fail there, which is what they already do today. */
    if (payload.gmRating != null) args.p_gm_rating = payload.gmRating;
    if (payload.tradeMoves != null) args.p_trade_moves = payload.tradeMoves;
    const body = JSON.stringify(args);
    const ATTEMPTS = 3;
    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
      try {
        const res = await timed(base() + 'rpc/ps_submit_run', {
          method: 'POST', headers: headers(), body,
        });
        if (res.ok) {
          const id = await res.json().catch(() => null);
          if (typeof id !== 'number') {
            lastError = { where: 'submit', status: res.status, code: 'shape',
              message: 'the call succeeded but did not return a row id' };
            return null;
          }
          lastError = null;
          return id;
        }
        /* 4xx: the server rejected the payload itself. Retrying sends the same bytes
           to the same rule, so stop and keep the reason. */
        if (res.status < 500) return await fail('submit', res);
        await fail('submit', res);   // 5xx: record it, then fall through to retry
      } catch (e) {
        failThrown('submit', e);     // network/timeout: record it, then retry
      }
      if (attempt < ATTEMPTS - 1) {
        await new Promise((r) => setTimeout(r, 500 * Math.pow(2, attempt)));
      }
    }
    return null;   // lastError already holds the final failure
  }

  /* ---------------- the probe ----------------
     Answers "is the database set up" without writing anything, by sending a run the
     function is guaranteed to refuse: 99 regular wins in a 17 game season. Three
     outcomes, each of which names its own cause:

       400 with "regular wins must be 0..17"  the function is there and working
       404 PGRST202                           the SQL has not been run, or PostgREST
                                              has not reloaded its schema cache
       401 or 403                             anon cannot execute it, so the grant
                                              at the bottom of the SQL did not apply

     A read is tested separately, because reads passing while writes fail is exactly
     the state that looks like an empty board. */
  async function probe() {
    const out = { read: null, write: null };
    try {
      const res = await timed(base() + TABLE + '?select=id&limit=1',
        { headers: headers({ Prefer: 'count=exact' }) });
      out.read = { status: res.status, ok: res.ok, count: countOf(res) };
      if (!res.ok) out.read.message = ((await res.json().catch(() => ({}))).message) || '';
    } catch (e) { out.read = { status: 0, ok: false, message: (e && e.message) || 'failed' }; }
    try {
      const res = await timed(base() + 'rpc/ps_submit_run', {
        method: 'POST', headers: headers(),
        body: JSON.stringify({
          p_regular_wins: 99, p_playoff_wins: 0, p_point_diff: 0, p_chemistry_pct: 0,
          /* p_mode is sent so the probe exercises the SAME signature a real submit
             does. PostgREST picks an overload by the argument names in the body, so a
             probe that omits it could resolve to a different function than the game
             uses and report a healthy setup for one the game cannot call. */
          p_spend_musd: 0, p_respins: 0, p_franchise: null, p_mode: 'free',
          p_picks: ['probe:2001', 'probe:2002', 'probe:2003', 'probe:2004',
                    'probe:2005', 'probe:2006'],
          p_slots: null, p_seed: null, p_rng_calls: null, p_squad_fppg: null,
          p_structure_mult: null, p_team_rating: null, p_perfect_pct: null,
        }),
      });
      const body = await res.json().catch(() => null);
      out.write = { status: res.status, ok: res.ok,
        code: (body && body.code) || '',
        message: (body && (body.message || body.hint)) || res.statusText || '' };
      /* Refused for the reason it should be refused for: everything is wired up. */
      out.write.healthy = res.status === 400 && /regular wins must be/.test(out.write.message);
    } catch (e) {
      out.write = { status: 0, code: 'network', message: (e && e.message) || 'failed' };
    }
    return out;
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
  async function rankIn(opts, score) {
    try {
      const q = base() + TABLE + '?select=id&limit=1&score=gt.' + encodeURIComponent(score) +
        scope(opts);
      const res = await timed(q, { headers: headers({ Prefer: 'count=exact' }) });
      if (!res.ok) return await fail('rank', res);
      const better = countOf(res);
      return better === null ? null : better + 1;
    } catch (e) { return failThrown('rank', e); }
  }

  async function total(opts) {
    try {
      const q = base() + TABLE + '?select=id&limit=1' + scope(opts);
      const res = await timed(q, { headers: headers({ Prefer: 'count=exact' }) });
      if (!res.ok) return await fail('total', res);
      return countOf(res);
    } catch (e) { return failThrown('total', e); }
  }

  /* How many 20-0 seasons the table holds, across every mode and every player, named
     or guest. The `perfect` column is set by ps_submit_run() only when a run wins the
     title with no loss on it, so this is the honest count of the thing the how-to-play
     screen calls never done. Fails soft to null like everything else here. */
  async function perfectCount() {
    try {
      const q = base() + TABLE + '?select=id&limit=1&perfect=is.true';
      const res = await timed(q, { headers: headers({ Prefer: 'count=exact' }) });
      if (!res.ok) return await fail('perfect', res);
      return countOf(res);
    } catch (e) { return failThrown('perfect', e); }
  }

  /* All three windows in one call when ps_rank_windows() exists (60_football_rank_windows.sql),
     falling back to six individual queries when it does not. One HTTP round trip instead of
     six makes the difference on mobile, where the old approach regularly timed out. */
  let batchSupported = true;
  async function ranksBatch(score, mode, franchise, era) {
    if (!batchSupported) return null;
    try {
      const m = (mode === 'era' && era) ? 'era' : (mode === 'club' && franchise) ? 'club' : 'free';
      const res = await timed(base() + 'rpc/ps_rank_windows', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
          p_score: score,
          p_mode: m,
          p_franchise: franchise || null,
          p_era: era || null,
          p_day_cut: cutoffISO('day'),
          p_week_cut: cutoffISO('week'),
        }),
      });
      if (!res.ok) { batchSupported = false; return null; }
      const r = await res.json();
      if (!r || typeof r !== 'object') { batchSupported = false; return null; }
      return r;
    } catch (e) { batchSupported = false; return null; }
  }

  async function ranks(score, mode, franchise, era) {
    const batch = await ranksBatch(score, mode, franchise, era);
    if (batch) return batch;
    const of = (win) => {
      if (mode === 'era' && era) return { mode: 'era', era, win, named: true };
      if (mode === 'club' && franchise) return { mode: 'club', franchise, win, named: true };
      return { mode: 'free', win, named: true };
    };
    const scopes = [['day', of('day')], ['week', of('week')], ['all', of('all')]];
    const got = await Promise.all(scopes.map(([, o]) =>
      Promise.all([rankIn(o, score), total(o)])));
    const out = {};
    scopes.forEach(([k], i) => {
      const [rank, tot] = got[i];
      out[k] = (rank === null || tot === null) ? null : { rank, total: Math.max(tot, rank) };
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
  async function top(opts, limit, sort, dir) {
    const col = SORTS[sort] || SORTS.record;
    const way = dir === 'asc' ? 'asc' : 'desc';
    const url = () => base() + TABLE + '?select=' + rowCols() +
      '&order=' + col + '.' + way + ',created_at.' + ORDER_TIEBREAK[way] +
      '&limit=' + (limit || 10) + scope(opts) +
      (col !== 'score' ? '&' + col + '=not.is.null' : '');
    try {
      let res = await timed(url(), { headers: headers() });
      /* UP TO THREE RETRIES, one per optional set, narrowest first. Each pass reads the
         body before deciding, so a genuinely broken query still surfaces as itself rather
         than being mistaken for a schema one file behind. The loop cannot run away: each
         branch permanently clears the flag that let it in. */
      for (let pass = 0; pass < 3 && !res.ok && res.status === 400; pass++) {
        const body = await res.json().catch(() => null);
        if (tradeColumns && missingTradeColumn(body)) {
          tradeColumns = false;
        } else if (avatarColumns && missingAvatarColumn(body)) {
          avatarColumns = false;
          needsAvatarMigration = true;
        } else if (namesColumn && missingNameColumn(body)) {
          namesColumn = false;
          needsAccountsMigration = true;
        } else {
          /* Remembered, not retried. There is no board without this column, so the only
             useful thing left is to name the file that adds it. */
          if (missingModeColumn(body)) modeColumnMissing = true;
          offline = true;
          lastError = { where: 'board', status: 400, code: (body && body.code) || '',
            message: (body && body.message) || 'bad request' };
          return null;
        }
        res = await timed(url(), { headers: headers() });
      }
      if (!res.ok) return await fail('board', res);
      const rows = await res.json().catch(() => null);
      return Array.isArray(rows) ? rows : null;
    } catch (e) { return failThrown('board', e); }
  }

  /* ---------------- where one run sits on the board that is showing ----------------
     rankIn() answers this for the record board and nothing else, because `score` is the
     only ranking column the client can work out for itself. That was enough while the
     pinned row only appeared on a descending record board. It is not enough now: the
     row is meant to be there on every board, so it needs the number that describes the
     list it is sitting under, whichever axis and whichever direction that list is in.

     Ahead of you means greater on a high-to-low board and smaller on a low-to-high one,
     so the comparison flips with the direction. Nulls need no excluding: a row with no
     team_rating is neither greater than nor less than yours, so it falls out of the
     count on its own, which matches a list that also leaves it out.

     Same tie rule as rankIn: equal runs share a place, and the list breaks the tie by
     who got there first. */
  async function placeIn(opts, sort, dir, value) {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) return null;
    const col = SORTS[sort] || SORTS.record;
    const v = col === 'team_rating' ? round2(value) : value;
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

  /* ---------------- one player's own runs ----------------
     Everything the profile's career panel needs, in one request. Newest first, with the
     exact total in the Content-Range header, so the count is right even when there are
     more runs than were fetched and the panel can say which it is.

     ORDERED BY created_at RATHER THAN BY RATING, even though the panel's headline is a
     best-drafts list. Sorting by rating in the query would return the top N and nothing
     else, and a career total, a perfect-season count and a playoff rate cannot be worked
     out from the best N runs; they need the whole set. So the whole set comes back and the
     ranking happens here. ps_runs_user_idx is (user_id, created_at desc), so this is the
     one ordering that is already an index scan.

     BASE_COLS, without display_name: these are your own runs and the panel never prints a
     name on them.

     ONE RETRY, and only for the trade pair. It used to need none, and that is no longer
     true: these are the rows the badge cabinet is derived from, so gm_rating and
     trade_moves have to come back here or every Trade Machine badge reads as unearned on a
     database that has them. Nothing else in this call is optional, so a 400 that is not
     about those two columns is still a plain failure. */
  async function mine(userId, limit) {
    if (!userId) return null;
    try {
      const cols = () => BASE_COLS + (tradeColumns ? ',gm_rating,trade_moves' : '');
      const q = () => base() + TABLE + '?select=' + cols() +
        '&user_id=eq.' + encodeURIComponent(userId) +
        '&order=created_at.desc&limit=' + (limit || 500);
      let res = await timed(q(), { headers: headers({ Prefer: 'count=exact' }) });
      if (!res.ok && res.status === 400 && tradeColumns) {
        const body = await res.json().catch(() => null);
        if (missingTradeColumn(body)) {
          tradeColumns = false;
          res = await timed(q(), { headers: headers({ Prefer: 'count=exact' }) });
        }
      }
      if (!res.ok) return await fail('mine', res);
      const rows = await res.json().catch(() => null);
      if (!Array.isArray(rows)) {
        lastError = { where: 'mine', status: res.status, code: 'shape',
          message: 'the call succeeded but did not return a list of runs' };
        return null;
      }
      /* A null count is not a zero, for the same reason it is not in countOf: it means the
         header could not be read, so the row count is the honest fallback. */
      const total = countOf(res);
      return { rows, total: total === null ? rows.length : total, capped: rows.length >= (limit || 500) };
    } catch (e) { return failThrown('mine', e); }
  }

  /* ---------------- your own colour and initials ----------------
     Read straight off profiles, which 10_accounts.sql makes world-readable because the
     things on it are what a public leaderboard prints. Only ever read for yourself here,
     because the board rows carry everybody else's already: asking profiles per row would
     be the join 51 and 53 both explain not doing.

     Answers null for "could not read", which the settings form treats as "leave the fields
     as the defaults" rather than as "they have chosen nothing". */
  async function myAvatar(userId) {
    if (!userId) return null;
    try {
      const q = base() + 'profiles?select=avatar_color,avatar_initials&id=eq.' +
        encodeURIComponent(userId);
      const res = await timed(q, { headers: headers() });
      /* A project that has not run 53 yet has no such columns, and that is not an error
         worth surfacing: it is the same "one file behind" state top() handles, and the
         answer is the same, which is that nothing has been chosen. */
      if (!res.ok) { if (res.status === 400) return { color: null, initials: null }; 
        return await fail('avatar', res); }
      const rows = await res.json().catch(() => null);
      const r = (Array.isArray(rows) && rows[0]) || {};
      return { color: r.avatar_color || null, initials: r.avatar_initials || null };
    } catch (e) { return failThrown('avatar', e); }
  }

  /* THE ONLY WRITE PATH. ps_set_avatar validates the colour against its own list and strips
     the initials to at most two of A-Z0-9, then rewrites every one of the caller's rows in
     the same transaction, so the board never shows one player in two colours. What it
     returns is what it stored, which is what the caller should then draw: sending 'xyz' and
     rendering 'xyz' while the database holds 'XY' is how a settings screen starts lying. */
  async function setAvatar(color, initials) {
    try {
      const res = await timed(base() + 'rpc/ps_set_avatar', {
        method: 'POST', headers: headers(),
        body: JSON.stringify({ p_color: color || '', p_initials: initials || '' }) });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        lastError = { where: 'avatar', status: res.status, code: (body && body.code) || '',
          message: (body && (body.message || body.hint)) || res.statusText || 'no message' };
        /* NOT offline. A refused colour is the database working exactly as intended, and
           marking the whole board unreachable over it would put a "not reachable" notice on
           a leaderboard that is answering every other call. */
        /* THE FUNCTION IS NOT THERE, which is a different thing from the call being refused,
           and the one the caller has to be able to tell apart: nothing the player does will
           make it work, so the answer is not "try again". PostgREST says PGRST202 with a 404
           when a function is missing from its schema cache. Remembered, so the diagnostics
           can name the file rather than leaving the raw sentence about a schema cache to be
           shown to somebody who is here to play a game. */
        if (res.status === 404 || lastError.code === 'PGRST202') avatarFnMissing = true;
        return { error: lastError.message, code: lastError.code, status: res.status,
          missing: avatarFnMissing };
      }
      /* `returns table` comes back as an array of one row. */
      const r = (Array.isArray(body) ? body[0] : body) || {};
      return { color: r.color || null, initials: r.initials || null };
    } catch (e) {
      return { error: (e && e.message) || 'the request did not complete' };
    }
  }

  /* One row by id, so a player who is nowhere near the top page can still be
     pinned under the list. */
  async function byId(id) {
    try {
      const q = base() + TABLE + '?select=' + rowCols() + '&id=eq.' + encodeURIComponent(id);
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
    API_VERSION: 9,
    submit, ranks, rankIn, placeIn, total, perfectCount, top, mine, byId, scoreOf, cutoffISO,
    SORTS, probe, myAvatar, setAvatar,
    get offline() { return offline; },
    get lastError() { return lastError; },
    get needsAccountsMigration() { return needsAccountsMigration; },
    get needsAvatarMigration() { return needsAvatarMigration; },
    get avatarFnMissing() { return avatarFnMissing; },
    get modeColumnMissing() { return modeColumnMissing; },
    /* Used by the tests to prove a failed board never breaks the results screen. */
    _forceOffline() { offline = true; },
  };
})();
