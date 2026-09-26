/* THE WEEKLY CHALLENGE'S OWN CLIENT.
 *
 * `supabase/109_fantasy_challenge.sql` is the record and this is the only thing that talks
 * to it. Five calls: submit a lineup, read your own, read the board, read your place, count
 * the entries. And since 119, one more write: swap a man who is ruled out.
 *
 * ─── IT IS NOT board.js AND MUST NOT BECOME IT ────────────────────────────────────────
 *
 * Every call in `board.js` FAILS SOFT and resolves to null, and its header argues for that
 * at length: a leaderboard that does not draw costs nothing, because the season it is
 * reading was already recorded. That is right for a board and wrong for an ENTRY. Nothing
 * else records a fantasy lineup, so a submit that quietly resolves to null is a player who
 * believes they are in a competition they are not in, and with a prize on it that is the
 * worst thing this page could do.
 *
 * So the reads fail soft and the WRITE does not. `submit` answers one of exactly three
 * things and the caller has to handle all three:
 *
 *   { ok: true }                 in, and the row is there
 *   { ok: false, why: '...' }    refused, and the server's own sentence says why
 *   { ok: null }                 nobody knows, including this page
 *
 * ─── AND THE THIRD ONE IS RECONCILED RATHER THAN GUESSED ──────────────────────────────
 *
 * A request can land, write the row, and lose its answer on the way back. Read as a
 * failure that is a player told to try again on a week they are already entered in, who
 * then meets "you have already entered this week" and reads the whole mode as broken. So an
 * unknown answer is followed by ASKING: `mine()` is the one thing that can settle it, and a
 * row coming back is an entry however the submit looked.
 *
 * ─── THE VERSION PAIR ─────────────────────────────────────────────────────────────────
 *
 * `FANTASY_API` here against `NEED_FANTASY` in the page. A stale `?v=` fails loudly as a
 * missing function; this one falls through to a stub that answers null to everything, which
 * for the READS looks exactly like a bad network day. It cannot for the write: the stub's
 * submit answers `{ ok: false }` with a sentence rather than null, because a page that
 * cannot reach its own module must not let anybody press a button that does nothing.
 */
(function (root) {
  'use strict';

  const SB_URL = 'https://jcrrxqfpdelrmvjuihnm.supabase.co';
  const SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpjcnJ4cWZwZGVscm12anVpaG5tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3OTY5NjIsImV4cCI6MjA5NjM3Mjk2Mn0.wyjoZpa2yRW-l38-KMGqBvEgTlW9v1KheNye7csWAlM';
  const TIMEOUT_MS = 9000;

  const base = () => (root.PS_FANTASY_URL || SB_URL) + '/rest/v1/';
  /* The bearer is the signed in session when there is one, exactly as board.js does it:
     sending the anon key while somebody is signed in leaves auth.uid() null inside the
     function, so their entry would be refused as a stranger's. */
  const headers = () => {
    const tok = (root.PS_AUTH && root.PS_AUTH.token && root.PS_AUTH.token()) || SB_ANON;
    return { apikey: SB_ANON, Authorization: 'Bearer ' + tok,
      'Content-Type': 'application/json' };
  };

  function timed(url, opts) {
    const ctl = typeof AbortController === 'function' ? new AbortController() : null;
    const t = setTimeout(() => { if (ctl) ctl.abort(); }, TIMEOUT_MS);
    return fetch(url, Object.assign({ signal: ctl ? ctl.signal : undefined }, opts))
      .finally(() => clearTimeout(t));
  }

  /** A read. Null is "no opinion", never "there is nothing there". */
  async function rpc(name, body) {
    try {
      const res = await timed(base() + 'rpc/' + name,
        { method: 'POST', headers: headers(), body: JSON.stringify(body || {}) });
      if (!res.ok) return null;
      return await res.json();
    } catch (e) { return null; }
  }

  /* ─── the write ─────────────────────────────────────────────────────────────────── */

  /* WHAT THE SERVER SAYS IS WHAT THE PLAYER READS, and that is a decision rather than
     laziness. Every refusal in `fantasy_submit` is already a sentence written for a person
     ("entries for that week are closed", "that lineup is over the cap"), so translating
     them here would be a second copy of nine strings that drifts the first time one is
     edited. What this does is refuse to pass on anything that does not look like one:
     PostgREST puts its own machinery in `code` and `details`, and a reader who is shown
     `PGRST202` has been told nothing.

     THE TEST USED TO BE "SHORT, AND NOT AN ALL-CAPS CODE", AND THAT LET MACHINERY THROUGH.
     `column p.display_name does not exist` is 36 characters of lower case English and
     passed both halves, so a player pressing submit was shown the inside of the database.
     It is a real sentence about a real fault and it is not a sentence for them.

     `code` IS THE HONEST DISCRIMINATOR AND IT NEEDS NO COPY OF ANY STRING. A message
     written for a person got there through `raise exception` in `fantasy_submit`, which is
     SQLSTATE `P0001`. Everything Postgres raises about itself carries its own class
     instead: a missing column is 42703, a missing function 42883, a denied table 42501,
     and PostgREST's own refusals are `PGRST...`. So the rule is a PROPERTY of how the
     message was produced rather than a list of the nine sentences, which is what keeps
     this from becoming the second copy the paragraph above refuses to write.

     AND THE MACHINERY IS NOT THROWN AWAY, it is moved. Reading the raw code and message
     off a player's screenshot is exactly how the `display_name` fault was found in one
     round, so it goes to the console: a developer opening it gets the whole answer, and
     nobody is shown a column name mid-draft. */
  const SAY = (j, fallback) => {
    const m = j && typeof j.message === 'string' ? j.message.trim() : '';
    if (j && j.code !== 'P0001') {
      try { console.warn('fantasy_submit refused:', j.code, m); } catch (e) {}
      return fallback;
    }
    return (m && m.length < 140) ? m : fallback;
  };

  async function submit(season, week, picks) {
    if (!Array.isArray(picks) || !picks.length) {
      return { ok: false, why: 'That lineup has nobody in it.' };
    }
    let res;
    try {
      res = await timed(base() + 'rpc/fantasy_submit', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ p_season: season, p_week: week, p_picks: picks }),
      });
    } catch (e) {
      /* NOT RETRIED HERE. A submit is not idempotent from the page's side: the second
         attempt of a request that already landed is refused as a second entry, and the
         caller would have to unpick that anyway. Asking is the honest retry. */
      return { ok: null };
    }
    if (res.ok) return { ok: true };
    /* A 5xx is the server having a bad moment and says nothing about whether the row
       landed. A 4xx is the function refusing, which it only does before writing. */
    if (res.status >= 500) return { ok: null };
    let j = null;
    try { j = await res.json(); } catch (e) {}
    return { ok: false, why: SAY(j, 'That lineup was not accepted.') };
  }

  /* ─── the swap ──────────────────────────────────────────────────────────────────── */

  /* THE SECOND WRITE, AND IT HAS THE SAME THREE ANSWERS AS THE FIRST. `fantasy_swap` (119)
     replaces a man who is ruled out, before his game, with a man at his position whose game
     has not started, and every clause of that is decided from rows on the server. The page
     only offers what it expects the server to take.

     A LOST ANSWER IS RECONCILED BY ASKING, exactly as a submit is. A swap that landed and
     lost its reply is a lineup already holding the new man, and pressing again would be
     refused as "that player is not in your lineup", which reads as the mode being broken.
     So `{ok:null}` asks `mine()` and answers from the picks. */
  async function swap(season, week, outId, inId) {
    let res;
    try {
      res = await timed(base() + 'rpc/fantasy_swap', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ p_season: season, p_week: week, p_out: outId, p_in: inId }),
      });
    } catch (e) {
      res = null;
    }
    if (res && res.ok) return { ok: true };
    if (res && res.status < 500) {
      let j = null;
      try { j = await res.json(); } catch (e) {}
      return { ok: false, why: SAY(j, 'That swap was not accepted.') };
    }
    const m = await mine(season, week);
    if (m && Array.isArray(m.picks)) {
      if (m.picks.includes(inId) && !m.picks.includes(outId)) return { ok: true };
      if (m.picks.includes(outId)) return { ok: null };
    }
    return { ok: null };
  }

  /* ─── the reads ─────────────────────────────────────────────────────────────────── */

  /** Your own entry, or null for "no opinion", or false for "you have not entered". */
  async function mine(season, week) {
    const j = await rpc('fantasy_my_entry', { p_season: season, p_week: week });
    if (j == null) return null;
    return j.length ? j[0] : false;
  }

  /** The board. Empty until the week locks, which is the server's rule and not this one. */
  async function standings(season, week, limit) {
    const j = await rpc('fantasy_standings',
      { p_season: season, p_week: week, p_limit: limit || 50 });
    return Array.isArray(j) ? j : null;
  }

  async function myPlace(season, week) {
    const j = await rpc('fantasy_my_place', { p_season: season, p_week: week });
    if (j == null) return null;
    return j.length ? j[0] : false;
  }

  async function entryCount(season, week) {
    const j = await rpc('fantasy_entry_count', { p_season: season, p_week: week });
    return typeof j === 'number' ? j : null;
  }

  /*
   * THE WHOLE BOARD IN ONE CALL, which is what a screen that POLLS needs.
   *
   * `standings` and `myPlace` are still here and still correct, and a screen that asks once
   * should go on using them. This one exists because the live board asks three questions
   * every twenty seconds (the rows, the reader's place against everybody, how far into the
   * week the scoring has got) and three round trips a tick, per reader, is three times the
   * cost of the thing being measured.
   *
   * IT IS A WRAPPER ON THE SERVER AND NOT A FOURTH QUERY, so the ordering is still written
   * once. See 110_fantasy_live.sql.
   *
   * FAILS SOFT LIKE EVERY OTHER READ HERE. A poll that cannot reach the server answers null
   * and the page keeps the board it already has: a leaderboard that blanked itself on one
   * bad request would flash empty every time a phone changed cell tower.
   */
  async function board(season, week, limit) {
    const j = await rpc('fantasy_board',
      { p_season: season, p_week: week, p_limit: limit || 50 });
    return (j && typeof j === 'object' && Array.isArray(j.rows)) ? j : null;
  }

  /*
   * WHAT EVERY MAN HAS SCORED SO FAR THIS WEEK, which is what the lineups under the board's
   * rows read. `fantasy_results` is public on purpose (110 grants it): a man's points are a
   * fact about a football game rather than about anybody's entry. A plain table read, one
   * row a man who has played, about four hundred at the most. Fails soft like every read.
   */
  async function results(season, week) {
    try {
      const res = await timed(base() + 'fantasy_results?select=player_id,half_ppr'
        + '&season=eq.' + Number(season) + '&week=eq.' + Number(week), { headers: headers() });
      if (!res.ok) return null;
      const j = await res.json();
      return Array.isArray(j) ? j : null;
    } catch (e) { return null; }
  }

  /*
   * ─── WHERE YOU FINISHED, ONCE THE WEEK IS OVER ─────────────────────────────────────
   *
   * One call answers the whole popup: whether this reader entered, where they came, out of
   * how many, and whether there is a promotion code with their name on it. Everything in it
   * is about `auth.uid()`, so there is nothing here that says anything about anybody else.
   *
   * NULL MEANS "NO OPINION" AND FALSE MEANS "NOTHING TO SAY", which are different answers
   * and the page draws neither the same way. A week that is not scored yet, or a reader who
   * never entered, is a legitimate nothing: the popup simply does not open. An unreachable
   * server is null, and the page tries again on the next visit rather than telling somebody
   * they finished nowhere.
   */
  async function myResult(season, week) {
    const j = await rpc('fantasy_my_result', { p_season: season, p_week: week });
    if (!Array.isArray(j)) return null;
    return j.length ? j[0] : false;
  }

  /* SEEN IS THE SERVER'S, not this browser's, which is the whole reason it is a call at all.
     Kept in localStorage it would be per device: a reader who entered on a phone and came
     back on a laptop would be told twice, and one who cleared site data would be told for
     ever. FAILS SOFT, because the cost of a lost ack is one repeated popup and the cost of
     blocking on it is a sheet that will not close. */
  async function ackResult(season, week) {
    const j = await rpc('fantasy_ack_result', { p_season: season, p_week: week });
    return j === true;
  }

  /* Every week this account placed in, for the profile. No code in it: a profile is a record
     of what somebody did rather than a place to keep a voucher. */
  async function myWins() {
    const j = await rpc('fantasy_my_wins', {});
    return Array.isArray(j) ? j : null;
  }

  root.PS_FANTASY = {
    /* 1: the entry, the board and the two ways to ask where you came.
       2: `board`, one call for a board that polls while the games are on.
       3: where you finished once it is settled, the ack that shows it once, and the wins a
          profile carries.
       `results` rides on 3 rather than bumping it: the page asks for it only if it is
       there, so a page a version ahead of a cached copy of this file still draws.
       `swap` rides on 3 for the same reason: the page offers a swap only if `F.swap` is
       there, so a stale copy of this file costs the offer and never the page. */
    API_VERSION: 3,
    submit, mine, standings, myPlace, entryCount, board, results,
    myResult, ackResult, myWins, swap,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.PS_FANTASY;
})(typeof self !== 'undefined' ? self : this);
