/* THE WEEKLY CHALLENGE'S OWN CLIENT.
 *
 * `supabase/109_fantasy_challenge.sql` is the record and this is the only thing that talks
 * to it. Five calls: submit a lineup, read your own, read the board, read your place, count
 * the entries.
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
     `PGRST202` has been told nothing. */
  const SAY = (j, fallback) => {
    const m = j && typeof j.message === 'string' ? j.message.trim() : '';
    return (m && m.length < 140 && !/^[A-Z0-9_]+$/.test(m)) ? m : fallback;
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

  root.PS_FANTASY = {
    /* 1: the entry, the board and the two ways to ask where you came. */
    API_VERSION: 1,
    submit, mine, standings, myPlace, entryCount,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.PS_FANTASY;
})(typeof self !== 'undefined' ? self : this);
