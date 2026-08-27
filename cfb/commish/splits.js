/*
 * splits.js - what every other commissioner did with the same item.
 *
 * The number this module fetches is the most shareable thing in the mode. "I ran college
 * football for five years and finished with a B" is a screenshot nobody opens. "68% of
 * commissioners paid the players. I didn't." is an argument, and an argument travels.
 *
 * Two halves, kept apart on purpose:
 *
 *   THE TRANSPORT      talks to supabase/95_commish_choices.sql over PostgREST, the same
 *                      way cfb/board.js talks to the leaderboard, and FAILS SOFT at every
 *                      step. A missing migration, a dead network, an ad blocker eating the
 *                      request: all of them resolve to null, `offline` goes true, and the
 *                      reaction screen simply does not draw a split. Nothing in here is
 *                      ever allowed to hold up a ruling.
 *
 *   THE SENTENCE       phrase() is pure. It takes a split and the option you picked and
 *                      returns what to say about it, which means the wording is testable
 *                      in node without a database, a browser or a network. The way this
 *                      feature goes wrong is not a failed request, it is telling somebody
 *                      "100% of commissioners agreed with you" off a sample of one.
 *
 * WHY A FLOOR, AND WHY IT SAYS SOMETHING ANYWAY
 * Under MIN_SHOW rulings a percentage is noise dressed as a fact: three people is 33%
 * increments. So below the floor the module reports the OTHER true thing, which is that
 * the item is new and you are early. That is worth reading, and it means the feature is
 * alive on the day it ships instead of dead until some item crosses eight votes.
 */
(function () {
  'use strict';

  const SB_URL = 'https://jcrrxqfpdelrmvjuihnm.supabase.co';
  const SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpjcnJ4cWZwZGVscm12anVpaG5tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3OTY5NjIsImV4cCI6MjA5NjM3Mjk2Mn0.wyjoZpa2yRW-l38-KMGqBvEgTlW9v1KheNye7csWAlM';

  /* Overridable so a test can point the module at a local stand-in without touching the
     shipped constants, exactly as board.js allows. */
  const base = () => (typeof window !== 'undefined' && window.PS_CFB_BOARD_URL ? window.PS_CFB_BOARD_URL : SB_URL) + '/rest/v1/rpc/';

  /* A ruling must not wait on a percentage. Shorter than the board's fifteen seconds
     because the board is painting a results screen and this is decorating one that has
     already painted. */
  const TIMEOUT_MS = 6000;

  /* ── the floor ────────────────────────────────────────────────────────────────
     Eight is where the increments stop being embarrassing: one vote moves a share of
     eight by 12 points, a share of three by 33. It is not where the number becomes
     TRUE, it is where it stops being a lie of precision. */
  const MIN_SHOW = 8;

  /* Under this you were nearly alone, which is the version worth putting on a card.
     Fifteen rather than a third, because a three-way item splits at 33 by construction
     and "you were in the minority" is not interesting when there are three minorities. */
  const RARE_PCT = 15;
  /* And over this, everybody did what you did, which is its own kind of fact. */
  const CONSENSUS_PCT = 70;

  let offline = false;

  /* ── the sentence ─────────────────────────────────────────────────────────────
     PURE. Takes what the server said and what you picked, returns what to say. Nothing
     in here touches the network, the page, or a clock.

     Comes back as parts rather than as a string so the page can set the number in the
     big face and the rest in the small one, and so a share card can take the same
     numbers and lay them out completely differently. `line` is the fallback for
     anywhere that just wants a sentence. */
  function phrase(split, optionId) {
    if (!split || typeof split !== 'object') return null;
    const counts = split.counts || {};
    let total = 0;
    for (const k in counts) {
      if (Object.prototype.hasOwnProperty.call(counts, k)) {
        const v = Number(counts[k]);
        if (Number.isFinite(v) && v > 0) total += v;
      }
    }
    /* THE SERVER'S TOTAL IS NOT TRUSTED OVER THE COUNTS IT SENT. They come from the same
       query so they agree, and if they ever stop agreeing the percentages have to add up
       to a hundred on the screen in front of somebody, which means the counts win. */
    const mine = Number(counts[optionId]);
    const n = Number.isFinite(mine) ? mine : 0;

    if (total < MIN_SHOW) {
      return {
        early: true, total: total, pct: null, stance: 'early', rare: false,
        line: total <= 1
          ? 'Nobody else has ruled on this yet.'
          : 'You are among the first to rule on this.',
      };
    }

    const pct = Math.round((n / total) * 100);
    /* WHICH SIDE OF THE ROOM YOU ARE ON, decided against the biggest option rather than
       against 50%, because three options mean the winner can take 40. Ties count as
       with: if you are level with the leader you are not the odd one out. */
    let top = 0;
    for (const k in counts) {
      if (Object.prototype.hasOwnProperty.call(counts, k)) {
        const v = Number(counts[k]);
        if (Number.isFinite(v) && v > top) top = v;
      }
    }
    const stance = n >= top ? 'with' : 'against';
    const rare = pct < RARE_PCT;

    let line;
    if (rare) line = 'Only ' + pct + '% of commissioners did that.';
    else if (pct >= CONSENSUS_PCT) line = pct + '% of commissioners did the same.';
    else if (stance === 'with') line = pct + '% of commissioners agreed, more than any other call.';
    else line = pct + '% of commissioners did the same. Most went another way.';

    return {
      early: false, total: total, pct: pct, stance: stance, rare: rare, line: line,
    };
  }

  /* THE SPLIT ITSELF, AS BARS, for a page that wants to show all three shares rather
     than just yours. Sorted biggest first and yours flagged, because "you took the one
     nobody took" is the reading, and a fixed docket order buries it. */
  function bars(split, optionId, labels) {
    if (!split) return [];
    const counts = split.counts || {};
    const out = [];
    let total = 0;
    for (const k in counts) {
      if (Object.prototype.hasOwnProperty.call(counts, k)) {
        const v = Number(counts[k]);
        if (Number.isFinite(v) && v > 0) { out.push({ id: k, n: v }); total += v; }
      }
    }
    if (!total) return [];
    out.forEach((r) => {
      r.pct = Math.round((r.n / total) * 100);
      r.mine = r.id === optionId;
      r.label = (labels && labels[r.id]) || r.id;
    });
    out.sort((a, b) => (b.n - a.n) || (a.id < b.id ? -1 : 1));
    return out;
  }

  /* ── the transport ───────────────────────────────────────────────────────────
     The signed-in user's token when there is one, or the anon key. Sending the anon key
     while somebody is signed in leaves auth.uid() null inside commish_rule(), so their
     ruling records as nobody's and their own splits never come back. Same reasoning,
     same shape, as headers() in cfb/board.js. */
  function headers() {
    const A = typeof window !== 'undefined' ? window.PS_CFB_AUTH : null;
    const tok = (A && A.token && A.token()) || SB_ANON;
    return {
      apikey: SB_ANON,
      Authorization: 'Bearer ' + tok,
      'Content-Type': 'application/json',
    };
  }

  function timed(url, opts) {
    const ctl = typeof AbortController === 'function' ? new AbortController() : null;
    const t = setTimeout(() => { if (ctl) ctl.abort(); }, TIMEOUT_MS);
    return fetch(url, Object.assign({ signal: ctl ? ctl.signal : undefined }, opts))
      .then((r) => { clearTimeout(t); return r; })
      .catch((e) => { clearTimeout(t); throw e; });
  }

  /* EVERY CALL RESOLVES. None of them reject and none of them throw, because every call
     site is decorating a screen that has already painted and the correct behaviour when
     this is unreachable is silence. `offline` is how the page can say so if it wants to,
     and it is never reset by a later success on purpose: one failure means the split
     shown next to it may be stale, and the page should not flip between confident and
     apologetic mid-term. */
  function call(fn, body) {
    if (typeof fetch !== 'function') { offline = true; return Promise.resolve(null); }
    let url;
    try { url = base() + fn; } catch (e) { offline = true; return Promise.resolve(null); }
    return timed(url, { method: 'POST', headers: headers(), body: JSON.stringify(body || {}) })
      .then((res) => {
        if (!res.ok) { offline = true; return null; }
        return res.json().then((j) => j, () => { offline = true; return null; });
      })
      .catch(() => { offline = true; return null; });
  }

  /* Record a ruling and get the item's split back in one trip, INCLUDING your own vote,
     which is why the write and the read are one function in the SQL rather than two.
     Resolves null if it could not be recorded or could not be read. */
  const rule = (itemId, optionId) =>
    call('commish_rule', { p_item: String(itemId), p_option: String(optionId) });

  /* Read one without writing, for a screen that wants to show the split before you have
     ruled. Nothing uses this yet; it exists because the SQL grants it and a caller that
     wanted it would otherwise reach for rule() and cast a vote by accident. */
  const split = (itemId) => call('commish_split', { p_item: String(itemId) });

  /* Many at once, for the end of a term. The cap matches the one in the SQL, which
     raises rather than truncating: a silently short answer would report a term as more
     ordinary than it was. */
  const MAX_BATCH = 120;
  function many(itemIds) {
    const ids = [];
    const seen = {};
    (itemIds || []).forEach((id) => {
      const s = String(id);
      if (!seen[s]) { seen[s] = 1; ids.push(s); }
    });
    if (!ids.length) return Promise.resolve({});
    if (ids.length > MAX_BATCH) return Promise.resolve(null);
    return call('commish_splits', { p_items: ids });
  }

  /* What you ruled last time, across every item you have ever seen. */
  const mine = () => call('commish_my_rulings', {});

  /* ── finished terms, and the doctrine each one had ───────────────────────────
     supabase/96_commish_terms.sql, and it lives here rather than in a module of its own
     because it is the same transport: the same anon key, the same bearer, the same
     resolve-to-null-on-anything. A second file would be a second copy of all of that, and
     the way two copies of a transport go wrong is that one of them keeps sending the anon
     key after somebody signs in.

     WHAT THIS IS FOR is the other half of the same idea. rule() asks what everybody did
     with one item; finishTerm() asks what everybody's whole term added up to, and answers
     with the two numbers worth reading at the end: how many commissioners came out the same
     way as you, and where your term stands among them. */
  const finishTerm = (t) => call('commish_finish_term', {
    p_doctrine: String(t.doctrine),
    p_axes: t.axes,
    p_score: t.score == null ? null : Math.round(t.score),
    p_grade: t.grade || null,
    p_removed: !!t.removed,
    p_years: Math.round(t.years || 0),
    p_rulings: Math.round(t.rulings || 0),
    p_champions: Math.round(t.champions || 0),
  });
  /* Read the split without recording a term, for a screen that wants to show the shape of
     the room before you have finished one. */
  const doctrineSplit = () => call('commish_doctrine_split', {});
  /* THE BOARD IS PER DOCTRINE AND THAT IS THE POINT. One board by score rewards upsetting
     nobody, because the way to do well on six report cards at once is to take no side. Nine
     boards ask a better question: of the people who believe what you believe, who did it
     best. */
  const doctrineBoard = (id, limit) => call('commish_doctrine_board', {
    p_doctrine: String(id), p_limit: Math.max(1, Math.min(50, limit || 20)),
  });
  const myTerms = (limit) => call('commish_my_terms', {
    p_limit: Math.max(1, Math.min(50, limit || 20)),
  });

  const api = {
    API_VERSION: 1,
    MIN_SHOW: MIN_SHOW, RARE_PCT: RARE_PCT, CONSENSUS_PCT: CONSENSUS_PCT,
    MAX_BATCH: MAX_BATCH,
    phrase: phrase, bars: bars,
    rule: rule, split: split, many: many, mine: mine,
    finishTerm: finishTerm, doctrineSplit: doctrineSplit,
    doctrineBoard: doctrineBoard, myTerms: myTerms,
    get offline() { return offline; },
  };

  if (typeof window !== 'undefined') window.PS_CFB_SPLITS = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
