/*
 * board.js - the leaderboard client for Segue: The Setlist Builder.
 *
 * Talks to the Supabase REST API directly with fetch, the same way the football and
 * college games do, rather than pulling in the supabase-js bundle. Every call here
 * is one of a handful of shapes and none of them needs a client library:
 *
 *   submit a show         POST /rpc/segue_submit_run
 *   count better shows    GET  /segue_runs?total=gt.N     + Prefer: count=exact
 *   list the top rows     GET  /segue_runs?order=total.desc&limit=N
 *   your own history      GET  /segue_runs?user_id=eq.U
 *   the shows you were at POST /rpc/segue_sync_attended
 *
 * EVERY FUNCTION FAILS SOFT. If supabase/67_setlist_leaderboard.sql has not been
 * run, or the network is down, or the table is renamed, each call resolves to null
 * and `SEGUE_BOARD.offline` goes true. The game then says the board is not
 * reachable, which is the truth, instead of showing a made-up rank. Nothing here is
 * ever allowed to break a finished show.
 *
 * The anon key is public by design: it is already in the page source of every other
 * game on this site, and the table's RLS lets it read and lets it call one function.
 * It cannot insert, update or delete a row directly.
 */
(function () {
  'use strict';

  const SB_URL = 'https://jcrrxqfpdelrmvjuihnm.supabase.co';
  const SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpjcnJ4cWZwZGVscm12anVpaG5tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3OTY5NjIsImV4cCI6MjA5NjM3Mjk2Mn0.wyjoZpa2yRW-l38-KMGqBvEgTlW9v1KheNye7csWAlM';

  /* Overridable so a test harness can point the whole module at a local stand-in for
     PostgREST without touching the shipped constants. */
  const base = () => (window.SEGUE_BOARD_URL || SB_URL) + '/rest/v1/';

  const TIMEOUT_MS = 15000;
  const TABLE = 'segue_runs';

  /* Columns the board list needs, named explicitly rather than select=*, so the rows
     stay small and adding a column to the table does not silently grow every board
     request. */
  const ROW_COLS = 'id,created_at,display_name,band,total,pct_of_best,best_total,' +
    'songs,segues,sandwiches,covers,jamcharts,bustouts,cards,cards_got,' +
    'longest_sec,respins,seconds_used';

  /* THE TWO AXES, and which column each one orders on. Named here rather than taking
     a column name from the caller, so nothing can put an arbitrary string into an
     order= parameter.

     WHY THERE ARE TWO, which is the one design decision in this file worth reading.
     The shows are DRAWN AT RANDOM from the archive. A player handed three nights of
     jamcharts and twenty-minute versions will out-total a better player handed three
     thin ones, every time. So `total` is partly a measure of the draw.

     `pct_of_best` is not. bestPossible() replays the exact shows that player drew, in
     the order they came up, and searches for the best line through them; the
     percentage of that they actually took asks how well they played the night they
     were given. A thin night played perfectly beats a great night played badly. Point
     a competitive player at that board. */
  const SORTS = { score: 'total', pct: 'pct_of_best' };

  /* THE TIEBREAK REVERSES WITH THE SORT, and that is a performance decision as much
     as a design one. Every index in 67_setlist_leaderboard.sql is
     (band, <axis> desc, created_at asc), and Postgres can read an index backwards
     only when EVERY sort key reverses together: `total asc, created_at asc` is a
     backward scan plus an Incremental Sort, while `total asc, created_at desc` is a
     clean backward scan. That is why there is no ascending twin of any index.

     It reads correctly too: on a worst-first board, ties going to the most recent
     show is the natural way round. */
  const ORDER_TIEBREAK = { desc: 'asc', asc: 'desc' };

  let offline = false;

  /* THE LAST THING THAT WENT WRONG, kept rather than thrown away. Everything here
     fails soft and silently, which is right for the player and useless for working
     out why nothing is being recorded: a failed submit looks exactly like a healthy
     board with nobody on it. PostgREST answers a rejected call with a JSON body
     carrying a code and a message, and that body is the whole diagnosis. */
  let lastError = null;

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

  /* THE SIGNED-IN USER'S TOKEN, WHEN THERE IS ONE.
     Sending the anon key while somebody is signed in would leave auth.uid() null
     inside segue_submit_run(), so their show would record as a guest and their name
     would never appear on it. The apikey header stays the anon key either way, which
     is what PostgREST wants; only the bearer changes. */
  const headers = (extra) => {
    const tok = (window.SEGUE_AUTH && window.SEGUE_AUTH.token && window.SEGUE_AUTH.token())
      || SB_ANON;
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
     unparseable header is a failure, NOT a zero: reading it as zero would rank
     everybody first. */
  function countOf(res) {
    const cr = res.headers.get('content-range') || '';
    const total = cr.split('/')[1];
    if (!total || total === '*') return null;
    const n = parseInt(total, 10);
    return Number.isFinite(n) ? n : null;
  }

  /* ---------------- the windows ----------------
     ONE FIXED ZONE, because a board where everyone's day starts at a different
     moment is not one board. Eastern, matching the rest of the site. */
  const ZONE = 'America/New_York';

  function zoneParts(d) {
    const f = new Intl.DateTimeFormat('en-US', {
      timeZone: ZONE, hourCycle: 'h23', year: 'numeric', month: '2-digit',
      day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const p = {};
    for (const part of f.formatToParts(d)) if (part.type !== 'literal') p[part.type] = +part.value;
    return p;
  }

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
        const dow = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;   // 0 = Monday
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

  /* ---------------- every band is its own competition ----------------
     Not one board with a flag on it. Different archives, different songs, different
     reachable totals; mixed together neither band's board would mean anything. band
     leads every index for exactly this reason.

     NAMED SHOWS ONLY, when asked for. A guest show is a real draft and counts towards
     how many have been played, but it carries no name, so listing it puts a row of
     Anonymous on a board whose whole job is to say who did what. Every ranking call
     asks for this and the activity count deliberately does not, which is the
     difference between "how many shows were drafted" and "who is on the board". */
  function scope(opts) {
    opts = opts || {};
    let f = '&band=eq.' + encodeURIComponent(opts.band || 'goose');
    if (opts.named) f += '&display_name=not.is.null';
    const cut = cutoffISO(opts.win || 'all');
    if (cut) f += '&created_at=gte.' + encodeURIComponent(cut);
    return f;
  }

  /* ---------------- submit ----------------
     Sends the four component totals and lets the server insist they add up, sends
     which breadth cards were won and lets the server say what they were worth, and
     sends nothing at all that it could work out itself.

     Returns the new row id, or null if it did not go through. A null here is not an
     error the player should see: their show still happened.

     RETRIED, because a lost submit is how a real show goes unrecorded. The count
     queries can fail soft and silent all day: a rank that does not draw costs
     nothing. A submit that does not land loses the show, and on mobile the single
     most common reason is a dropped or timed-out request, not a rejected one. So a
     submit that THREW or came back 5xx is tried again, up to three times with a
     widening gap. A 4xx is deterministic: the payload is wrong and no number of
     retries changes that, so it fails straight through with the server's reason
     kept. */
  async function submit(p) {
    const body = JSON.stringify({
      p_band: p.band,
      p_total: p.total,
      p_song_pts: p.songPts,
      p_time_pts: p.timePts,
      p_flow_pts: p.flowPts,
      p_breadth_pts: p.breadthPts,
      p_cards: p.cards || [],
      p_best_total: p.bestTotal ?? null,
      p_songs: p.songs,
      p_segues: p.segues || 0,
      p_sandwiches: p.sandwiches || 0,
      p_covers: p.covers || 0,
      p_jamcharts: p.jamcharts || 0,
      p_bustouts: p.bustouts || 0,
      p_cooldowns: p.cooldowns || 0,
      p_longest_sec: p.longestSec || 0,
      p_respins: p.respins || 0,
      p_seconds_used: p.secondsUsed || 0,
      p_shows: p.shows || null,
      p_picks: p.picks,
      p_rng_seed: p.rngSeed || null,
    });
    const ATTEMPTS = 3;
    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
      try {
        const res = await timed(base() + 'rpc/segue_submit_run', {
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
        if (res.status < 500) return await fail('submit', res);
        await fail('submit', res);        // 5xx: record it, then fall through to retry
      } catch (e) {
        failThrown('submit', e);          // network/timeout: record it, then retry
      }
      if (attempt < ATTEMPTS - 1) {
        await new Promise((r) => setTimeout(r, 500 * Math.pow(2, attempt)));
      }
    }
    return null;   // lastError already holds the final failure
  }

  /* ---------------- the probe ----------------
     Answers "is the database set up" without writing anything, by sending a show the
     function is guaranteed to refuse: nought songs. Three outcomes, each of which
     names its own cause.

       400 with "a show has 1..19 songs"  the function is there and working
       404 PGRST202                       the SQL has not been run, or PostgREST has
                                          not reloaded its schema cache
       401 or 403                         anon cannot execute it, so the grant at the
                                          bottom of the SQL did not apply

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
      /* EVERY PARAMETER IS SENT, even though most are defaulted, because PostgREST
         resolves an overload by the set of keys in the body: a probe that omits some
         could resolve to a different function than the game calls and report a
         healthy setup for one the game cannot reach. */
      const res = await timed(base() + 'rpc/segue_submit_run', {
        method: 'POST', headers: headers(),
        body: JSON.stringify({
          p_band: 'probe', p_total: 0, p_song_pts: 0, p_time_pts: 0, p_flow_pts: 0,
          p_breadth_pts: 0, p_cards: [], p_best_total: null, p_songs: 0, p_segues: 0,
          p_sandwiches: 0, p_covers: 0, p_jamcharts: 0, p_bustouts: 0, p_cooldowns: 0,
          p_longest_sec: 0, p_respins: 0, p_seconds_used: 0, p_shows: null,
          p_picks: [], p_rng_seed: null,
        }),
      });
      const body = await res.json().catch(() => null);
      out.write = { status: res.status, ok: res.ok,
        code: (body && body.code) || '',
        message: (body && (body.message || body.hint)) || res.statusText || '' };
      out.write.healthy = res.status === 400 && /a show has/.test(out.write.message);
    } catch (e) {
      out.write = { status: 0, code: 'network', message: (e && e.message) || 'failed' };
    }
    return out;
  }

  /* ---------------- rank ----------------
     Rank is the count of strictly better shows plus one, computed from the board
     rather than from this show's own insert. That ordering means a failed submit
     shows a correct rank instead of collapsing to "1 of 1".

     Ties: two shows with the same score share a rank here, and the board list breaks
     them by who got there first. That is deliberate. Counting created_at into the
     rank would mean a player's rank silently worsens as later people tie them, which
     reads as the board being wrong. */
  async function placeIn(opts, sort, value) {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) return null;
    const col = SORTS[sort] || SORTS.score;
    try {
      const q = base() + TABLE + '?select=id&limit=1' +
        '&' + col + '=gt.' + encodeURIComponent(value) + scope(opts);
      const res = await timed(q, { headers: headers({ Prefer: 'count=exact' }) });
      if (!res.ok) return await fail('place', res);
      const ahead = countOf(res);
      return ahead === null ? null : ahead + 1;
    } catch (e) { return failThrown('place', e); }
  }

  async function total(opts) {
    try {
      const q = base() + TABLE + '?select=id&limit=1' + scope(opts);
      const res = await timed(q, { headers: headers({ Prefer: 'count=exact' }) });
      if (!res.ok) return await fail('total', res);
      return countOf(res);
    } catch (e) { return failThrown('total', e); }
  }

  /* All three windows, on whichever axis is asked for. Six index-only counts in
     parallel; there is no batching RPC here yet and at this board's size there does
     not need to be. */
  async function ranks(band, sort, value) {
    const wins = ['day', 'week', 'all'];
    const got = await Promise.all(wins.map((win) => {
      const o = { band, win, named: true };
      return Promise.all([placeIn(o, sort, value), total(o)]);
    }));
    const out = {};
    wins.forEach((k, i) => {
      const [rank, tot] = got[i];
      out[k] = (rank === null || tot === null) ? null : { rank, total: Math.max(tot, rank) };
    });
    return out;
  }

  /* ---------------- the board itself ----------------
     sort is 'score' or 'pct', dir is 'desc' or 'asc'. Both are looked up rather than
     interpolated, and the tiebreak always runs the same direction: whoever got there
     first is listed first, whichever way the board is pointed.

     Rows sorted by percentage skip the ones with no percentage on them. A show
     recorded without a ceiling has a null there, and PostgREST would sort nulls to
     one end of the list, so a low-to-high board would open on a page of blanks. */
  async function top(opts, limit, sort, dir) {
    const col = SORTS[sort] || SORTS.score;
    const way = dir === 'asc' ? 'asc' : 'desc';
    const url = base() + TABLE + '?select=' + ROW_COLS +
      '&order=' + col + '.' + way + ',created_at.' + ORDER_TIEBREAK[way] +
      '&limit=' + (limit || 25) + scope(opts) +
      (col !== 'total' ? '&' + col + '=not.is.null' : '');
    try {
      const res = await timed(url, { headers: headers() });
      if (!res.ok) return await fail('board', res);
      const rows = await res.json().catch(() => null);
      return Array.isArray(rows) ? rows : null;
    } catch (e) { return failThrown('board', e); }
  }

  /* ---------------- one player's own shows ----------------
     Everything the profile needs, in one request. Newest first, with the exact total
     in the Content-Range header, so the count is right even when there are more shows
     than were fetched and the panel can say which it is.

     ORDERED BY created_at RATHER THAN BY SCORE, even though the panel's headline is a
     best-shows list. Sorting by score in the query would return the top N and nothing
     else, and a career total, an average and a cards-collected set cannot be worked
     out from the best N shows; they need the whole set. So the whole set comes back
     and the ranking happens here. segue_runs_user_idx is (user_id, created_at desc),
     so this is the one ordering that is already an index scan. */
  async function mine(userId, limit) {
    if (!userId) return null;
    try {
      const q = base() + TABLE + '?select=' + ROW_COLS +
        '&user_id=eq.' + encodeURIComponent(userId) +
        '&order=created_at.desc&limit=' + (limit || 500);
      const res = await timed(q, { headers: headers({ Prefer: 'count=exact' }) });
      if (!res.ok) return await fail('mine', res);
      const rows = await res.json().catch(() => null);
      if (!Array.isArray(rows)) {
        lastError = { where: 'mine', status: res.status, code: 'shape',
          message: 'the call succeeded but did not return a list of shows' };
        return null;
      }
      const tot = countOf(res);
      return { rows, total: tot === null ? rows.length : tot,
               capped: rows.length >= (limit || 500) };
    } catch (e) { return failThrown('mine', e); }
  }

  /* The show you drafted before you signed in, taken over now that you are. Returns
     false if it was already owned, which is what stops an id in a URL being enough to
     claim somebody else's. */
  async function claim(id) {
    if (!id) return false;
    try {
      const res = await timed(base() + 'rpc/segue_claim_run', {
        method: 'POST', headers: headers(), body: JSON.stringify({ p_id: id }) });
      if (!res.ok) { await fail('claim', res); return false; }
      return (await res.json().catch(() => false)) === true;
    } catch (e) { failThrown('claim', e); return false; }
  }

  /* ---------------- the shows you were at ----------------
     MERGES, never replaces. segue_sync_attended() takes this browser's list, adds
     anything it does not already have, and hands back the union for the band, which
     the caller writes straight back into localStorage. Both sides are additions a
     real person made and there is no version of "resolving" that should lose one.

     Answers null when nobody is signed in or the call did not go through, which the
     caller reads as "carry on with the local list" rather than as an empty list. */
  async function syncAttended(band, shows) {
    try {
      const res = await timed(base() + 'rpc/segue_sync_attended', {
        method: 'POST', headers: headers(),
        body: JSON.stringify({ p_band: band, p_shows: shows || [] }) });
      if (!res.ok) return await fail('attended', res);
      const out = await res.json().catch(() => null);
      return Array.isArray(out) ? out : null;
    } catch (e) { return failThrown('attended', e); }
  }

  /* Unmarking is its own call, for the reason the merge above explains: an absence
     from a synced list is not a removal. */
  async function forgetAttended(band, showId) {
    try {
      const res = await timed(base() + 'rpc/segue_forget_attended', {
        method: 'POST', headers: headers(),
        body: JSON.stringify({ p_band: band, p_show: String(showId) }) });
      if (!res.ok) { await fail('attended', res); return false; }
      return (await res.json().catch(() => false)) === true;
    } catch (e) { failThrown('attended', e); return false; }
  }

  window.SEGUE_BOARD = {
    API_VERSION: 1,
    submit, top, mine, ranks, placeIn, total, claim, probe, cutoffISO,
    syncAttended, forgetAttended,
    SORTS,
    get offline() { return offline; },
    get lastError() { return lastError; },
    /* Used by the tests to prove a failed board never breaks the results screen. */
    _forceOffline() { offline = true; },
  };
})();
