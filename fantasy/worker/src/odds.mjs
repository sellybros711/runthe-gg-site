/* The odds API client: limits, backoff, and the credit accounting.
 *
 * Every call to the provider goes through here, so there is one place that
 * knows the rules and one place to look when the bill is wrong.
 *
 *
 * HOW CREDITS ARE CHARGED, AND WHY WE COUNT THEM OURSELVES
 * ---------------------------------------------------------------------------
 * The provider bills MARKETS x REGIONS per request, and player props are
 * per-event only. So one sweep of one game at six markets in one region is six
 * credits, and the event LIST endpoint is free.
 *
 * We charge ourselves BEFORE the request and reconcile against the provider's
 * own x-requests-remaining header afterwards. Both, because:
 *
 *   * charging first is what makes the cap a cap. Charging after means a burst
 *     of requests all pass the check before any of them has been counted,
 *     which is the classic way a rate limit fails to limit anything.
 *   * the header is the truth. Our arithmetic is a belief about a pricing rule
 *     read in documentation, and the day the two disagree is the day the
 *     belief is wrong. No amount of re-reading this file would ever reveal
 *     that; only the comparison does.
 *
 *
 * THE RATE LIMIT IS CONSERVATIVE AND UNVERIFIED, AND SAYS SO
 * ---------------------------------------------------------------------------
 * The provider documents a credit allowance and, as far as the brief records,
 * no published requests-per-second limit. api.the-odds-api.com is blocked from
 * the development sandbox, so nothing here has been confirmed against them.
 *
 * So MIN_GAP_MS is a self-imposed floor rather than a measured one: it exists
 * to stop a bug from hammering a third party, not because they asked. It is
 * deliberately loose enough never to slow a real sweep (32 events at 120ms is
 * under four seconds) and tight enough that a runaway loop is throttled rather
 * than amplified. If the provider ever publishes a real number, replace this
 * constant and cite it here.
 */

/* Documented limits and self-imposed ones, in one block so nobody has to hunt.
 *
 *   MIN_GAP_MS      self-imposed. See above.
 *   TIMEOUT_MS      a hot path that hangs is worse than one that fails: the
 *                   next cron tick is a minute away and a hung fetch would
 *                   still be holding the budget it charged itself.
 *   RETRIES         only on the errors that are worth retrying. See below.
 *   BACKOFF_MS      exponential with jitter. The jitter matters because every
 *                   sweep starts on a cron boundary, so without it every
 *                   retry in a tick would land on the same millisecond.
 */
export const LIMITS = {
  MIN_GAP_MS: 120,
  TIMEOUT_MS: 8000,
  RETRIES: 2,
  BACKOFF_MS: [400, 1200],
  BASE: 'https://api.the-odds-api.com/v4',
  SPORT: 'americanfootball_nfl',
};

/* WHICH FAILURES ARE WORTH RETRYING, and the two that are emphatically not.
 *
 *   429  we are being rate limited. Retrying immediately makes it worse, so
 *        this backs off, and the sweep stops for this tick rather than
 *        queueing more.
 *   401  the key is wrong. Retrying a wrong key twice more is two more wrong
 *        answers and, on a provider that counts attempts, two more credits.
 *   422  we asked for something that does not exist. Same reasoning.
 *
 * Retrying a 401 is the specific mistake that turns a typo in a secret into a
 * exhausted allowance overnight. */
const RETRYABLE = new Set([408, 500, 502, 503, 504]);
const FATAL = new Set([401, 403, 422]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* Read the provider's own accounting off the response. Named rather than
 * inlined because the header spellings are the provider's and this is the one
 * place to change if they rename them. */
export function readUsage(res) {
  const num = (h) => {
    const v = res.headers.get(h);
    if (v == null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  return {
    remaining: num('x-requests-remaining'),
    used: num('x-requests-used'),
    last: num('x-requests-last'),
  };
}

/* One client per sweep. Holds the gap timer so successive calls within a tick
 * space themselves without the caller thinking about it. */
export function makeOddsClient({ apiKey, fetchImpl = fetch, now = () => Date.now(), log = () => {} }) {
  if (!apiKey) throw new Error('makeOddsClient: no api key');
  let lastCallAt = 0;

  async function call(path, params) {
    const url = new URL(LIMITS.BASE + path);
    for (const [k, v] of Object.entries(params || {})) {
      if (v != null) url.searchParams.set(k, String(v));
    }
    /* The key goes in the query string because that is the only way this
       provider accepts it. It is therefore in the URL, so the URL must never
       be logged. `safeUrl` below is what gets logged, and every log line in
       this file uses it. */
    url.searchParams.set('apiKey', apiKey);
    const safeUrl = url.toString().replace(/apiKey=[^&]*/, 'apiKey=REDACTED');

    let attempt = 0;
    for (;;) {
      const gap = LIMITS.MIN_GAP_MS - (now() - lastCallAt);
      if (gap > 0) await sleep(gap);
      lastCallAt = now();

      let res, err = null;
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), LIMITS.TIMEOUT_MS);
      try {
        res = await fetchImpl(url.toString(), { signal: ctl.signal });
      } catch (e) {
        err = e;
      } finally {
        clearTimeout(timer);
      }

      if (!err && res.ok) {
        const usage = readUsage(res);
        const body = await res.json();
        return { ok: true, status: res.status, body, usage, safeUrl };
      }

      const status = err ? 0 : res.status;
      const fatal = FATAL.has(status);
      const retryable = !fatal && (err !== null || status === 429 || RETRYABLE.has(status));

      if (!retryable || attempt >= LIMITS.RETRIES) {
        let detail = err ? String(err && err.message || err) : '';
        if (!err) { try { detail = (await res.text()).slice(0, 400); } catch (e) { detail = ''; } }
        log({ at: 'odds.fail', url: safeUrl, status, attempt, fatal, detail });
        return {
          ok: false, status, safeUrl, fatal,
          usage: err ? { remaining: null, used: null, last: null } : readUsage(res),
          error: detail || `http ${status}`,
        };
      }

      /* Exponential with jitter. The jitter is not decoration: a cron tick
         starts every request at the same instant, so a fixed backoff would
         retry them all together and reproduce the burst that caused the 429. */
      const base = LIMITS.BACKOFF_MS[Math.min(attempt, LIMITS.BACKOFF_MS.length - 1)];
      const wait = base + Math.floor(Math.random() * base);
      log({ at: 'odds.retry', url: safeUrl, status, attempt, waitMs: wait });
      await sleep(wait);
      attempt++;
    }
  }

  return {
    /* FREE. The event list costs no credits, which is what makes the ladder
       affordable: knowing when kickoff is must not cost the same as reading a
       market. Called once a tick regardless of what is due. */
    events: () => call(`/sports/${LIMITS.SPORT}/events`, {}),

    /* SIX CREDITS AT SIX MARKETS. The only expensive call in the product. */
    eventOdds: (eventId, markets, regions) => call(
      `/sports/${LIMITS.SPORT}/events/${encodeURIComponent(eventId)}/odds`,
      {
        markets: markets.join(','),
        regions: regions.join(','),
        oddsFormat: 'american',
        dateFormat: 'iso',
      },
    ),
  };
}

/* What one event sweep costs, by the provider's own rule. One line, exported,
 * so the Worker, the planner and the budget all quote the same arithmetic. */
export const sweepCost = (markets, regions) => markets.length * regions.length;
