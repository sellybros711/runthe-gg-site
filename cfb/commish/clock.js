/*
 * clock.js : the free tier's one season a day, as the page sees it.
 *
 * THE RULE. A signed in account that has not bought Commissioner Mode plays one season,
 * then waits twenty four hours for the next. A term is five seasons, so a free term takes
 * five days and it is a whole term rather than a demo that stops. An account holding
 * cfb_premium is never metered and never asked to wait.
 *
 * WHERE THE ANSWER COMES FROM, AND WHY NOT FROM HERE. Every question this module asks is
 * answered by supabase/104_commish_free_clock.sql, which reads premium_unlocks itself.
 * Nothing in this file decides who is paying and nothing in this file decides when the
 * wait is over: it asks, it waits, and it draws. That is the same rule the entitlement
 * already follows and it is the only version that survives a private window.
 *
 * WHAT THIS MODULE IS CAREFUL ABOUT IS THE FAILURE, because it is a GATE rather than a
 * decoration and the two want opposite things.
 *
 *   splits.js resolves null on any failure and the screen simply shows no percentage.
 *   That is right: the worst case is a missing sentence.
 *
 *   A gate has no such luxury. Null has to mean something, and the two choices are not
 *   symmetric:
 *
 *     FAIL CLOSED  a blocked request, a flaky train tunnel or an ad blocker locks a
 *                  player out of a game they can see, with a countdown they cannot
 *                  refresh and no way to tell them why. It reads as broken software.
 *     FAIL OPEN    the same blip hands somebody a season they had not waited for.
 *
 * It fails OPEN, and the reasoning is that the two mistakes cost different things. A
 * wrongly granted season costs a fraction of one sale from somebody who was very likely
 * not going to buy in that moment anyway. A wrongly refused season costs the trust of a
 * player who was engaged enough to come back, and the mode never gets another look. The
 * limit is worth having; it is not worth being wrong about in that direction.
 *
 * IT IS NOT A HOLE, because the spend is the same call. A client that cannot reach the
 * server to be told it is locked also cannot reach it to have its clock started, so the
 * next successful call finds the clock exactly where it was. Somebody who stays offline
 * plays free and also records nothing, keeps no board place and finishes no term that
 * counts, which is a worse deal than paying and a much worse deal than being online.
 *
 *   PS_CFB_COMMISH_CLOCK.state(force)   ask, and cache the answer for this screen
 *   PS_CFB_COMMISH_CLOCK.spend()        take a season, and start the wait
 *   PS_CFB_COMMISH_CLOCK.remaining()    milliseconds left, off the SERVER's clock
 *   PS_CFB_COMMISH_CLOCK.countdown()    that, as "5h 12m"
 *   PS_CFB_COMMISH_CLOCK.termDone()     a contract ended, count it against the free one
 */
(function () {
  'use strict';

  const SB_URL = 'https://jcrrxqfpdelrmvjuihnm.supabase.co';
  const SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpjcnJ4cWZwZGVscm12anVpaG5tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3OTY5NjIsImV4cCI6MjA5NjM3Mjk2Mn0.wyjoZpa2yRW-l38-KMGqBvEgTlW9v1KheNye7csWAlM';

  /* THE THIRD COPY OF THIS TRANSPORT, and that is the house pattern rather than an
     oversight: board.js has one, splits.js has one and says so in its own comment, and
     each is about twenty lines with no shared state. A common module would have to be
     loaded by three pages in the right order to save them, which is a worse trade than
     the duplication. Overridable so a test can point at a local stand-in, exactly as
     board.js and splits.js allow. */
  const base = () => (typeof window !== 'undefined' && window.PS_CFB_BOARD_URL
    ? window.PS_CFB_BOARD_URL : SB_URL) + '/rest/v1/rpc/';

  /* Shorter than the board's fifteen seconds. This one stands between a player and the
     next season, so a long hang is indistinguishable from a broken button. */
  const TIMEOUT_MS = 6000;

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

  /* Resolves the answer, or null for "could not ask". Every caller below turns null into
     the open door, in one place, so the fail direction is a single decision rather than
     one per call site. */
  function call(fn) {
    if (typeof fetch !== 'function') return Promise.resolve(null);
    let url;
    try { url = base() + fn; } catch (e) { return Promise.resolve(null); }
    return timed(url, { method: 'POST', headers: headers(), body: '{}' })
      .then((res) => {
        if (!res.ok) return null;
        return res.json().then((j) => j, () => null);
      })
      .catch(() => null);
  }

  /* The SQL returns a one row table, which PostgREST hands back as an array of one. */
  const row = (j) => (Array.isArray(j) ? j[0] : j) || null;

  /* THE OPEN DOOR, and the only place null becomes a decision. Written as a function
     rather than a constant so nobody can hold a reference to it and mutate the cache. */
  const OPEN = () => ({ pro: false, locked: false, nextAt: null, seasons: 0, terms: 0,
    offline: true });

  function shape(j) {
    const r = row(j);
    if (!r) return OPEN();
    /* SKEW, MEASURED ONCE PER ANSWER. The deadline is the server's and the countdown runs
       on the device, and the two disagree: a phone an hour fast would show an hour less
       than the wait really is, and a phone a day slow would show a deadline that never
       arrives. Every answer carries the server's own now, so the gap between the two
       clocks is known and the countdown is drawn through it. This is the same reason
       ps_eastern_reset() exists in 99_daily_attempts.sql. */
    const serverNow = r.now_at ? Date.parse(r.now_at) : NaN;
    return {
      pro: !!r.pro,
      locked: !!r.locked,
      nextAt: r.next_at ? Date.parse(r.next_at) : null,
      seasons: Number(r.seasons) || 0,
      /* FINISHED CONTRACTS. The free tier gets one; what is bought is the renewal. Pro
         always reads zero, because nothing is counted for an account with no cap. */
      terms: Number(r.terms) || 0,
      skew: isFinite(serverNow) ? serverNow - Date.now() : 0,
      offline: false,
    };
  }

  /* Cached for the screen, because a year in review paints its button more than once and
     each paint must not be a round trip. `force` is for after a spend and after a
     purchase, where the cached answer is precisely the wrong one. */
  let cached = null;
  /* THE REQUEST IN FLIGHT IS CACHED TOO, not just the answer. Caching only the result
     looks right and is not: `cached` is set when the promise RESOLVES, so two callers in
     the same tick both find it null and both go to the network. That is exactly what the
     gate does, because it paints more than once on the way through an auth change, and the
     symptom is two identical requests for one answer rather than anything visibly wrong.
     Cleared on settle so a later caller gets a fresh one. */
  let inflight = null;
  function state(force) {
    if (cached && !force) return Promise.resolve(cached);
    if (inflight && !force) return inflight;
    inflight = call('commish_clock_state').then((j) => {
      cached = shape(j); inflight = null; return cached;
    }, (e) => { inflight = null; throw e; });
    return inflight;
  }

  /* Take a season. Resolves the state AFTER the spend, with `ok` saying whether it was
     allowed. A null answer is the open door and is reported as ok, for the reason in the
     header: the same outage that stopped this being refused also stopped the clock being
     started, so nothing is lost but the count. */
  function spend() {
    return call('commish_clock_spend').then((j) => {
      const r = row(j);
      const st = shape(j);
      st.ok = r ? !!r.ok : true;
      cached = st;
      return st;
    });
  }

  /* A TERM ENDED. Counted for a free account and ignored for a paying one, by the server
     rather than by this call. Resolves the new state so the ending screen can draw what
     comes next without a second round trip.
     NOT GUARDED HERE. The page already stops one term being filed twice (`careerLogged` on
     the save, which survives the reload of a finished ending), and that is the same event,
     so the guard belongs in the one place that knows a term's identity. A second call is a
     second contract as far as this module is concerned, and that is correct. */
  function termDone() {
    return call('commish_term_done').then((j) => {
      const r = row(j);
      /* Unreachable is the open door here as everywhere else, but the shape differs: this
         one has no clock in its answer, so the cached state is left alone rather than
         replaced with a half empty one. A term that could not be filed is a term the next
         successful state() call will simply not know about, which is the open direction. */
      if (!r) return { pro: false, terms: 0, offline: true };
      if (cached) cached.terms = Number(r.terms) || 0;
      return { pro: !!r.pro, terms: Number(r.terms) || 0, offline: false };
    });
  }

  /* Forget everything, for a sign out or a switch of account on the same tab. Without
     this the next account inherits the last one's clock until something forces a read. */
  function forget() { cached = null; inflight = null; }

  /* Milliseconds until the next season, through the measured skew, floored at zero. */
  function remaining(st) {
    const s = st || cached;
    if (!s || !s.locked || !s.nextAt) return 0;
    return Math.max(0, s.nextAt - (Date.now() + (s.skew || 0)));
  }

  /* "5h 12m", or "48s" in the last minute, because a countdown that reads 0m for sixty
     seconds looks stuck at exactly the moment somebody is watching it. */
  function countdown(st) {
    const ms = remaining(st);
    if (ms <= 0) return '';
    const total = Math.ceil(ms / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    if (h > 0) return h + 'h ' + m + 'm';
    if (m > 0) return m + 'm ' + (s < 10 ? '0' : '') + s + 's';
    return s + 's';
  }

  /* CAN THIS ACCOUNT START A SEASON RIGHT NOW, read only.
   *
   * IT IS NOT THE THING THAT DECIDES, and the difference matters enough to say twice. The
   * mode decides by SPENDING, because only the server can, and seasonWall() reads ok off
   * that answer. This is for a screen that wants to offer the store instead of sending
   * somebody through a door it already knows is shut: the front page's Commish card.
   * Being wrong here costs a wasted tap. Being wrong there would cost a season.
   *
   * TWO WAYS TO BE STOPPED and the card cannot tell them apart, nor does it need to:
   *   locked      today's season is spent, next_at is in the future
   *   terms >= 1  the one free contract is finished, which is the same test the mode
   *               makes at freeCareerEnd()
   *
   * FAILS OPEN like everything else in this file, and here the argument is even easier:
   * an unknown answer sends somebody to the mode, which asks the server properly and
   * draws the right screen either way. The worst case is the behaviour that shipped
   * before this existed. */
  function blocked(st) {
    const s = st || cached;
    if (!s || s.offline) return false;
    if (s.pro) return false;
    return !!s.locked || (Number(s.terms) || 0) >= 1;
  }

  const api = {
    API_VERSION: 1,
    state: state, spend: spend, termDone: termDone, forget: forget,
    remaining: remaining, countdown: countdown, blocked: blocked,
    get cached() { return cached; },
  };

  if (typeof window !== 'undefined') window.PS_CFB_COMMISH_CLOCK = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
