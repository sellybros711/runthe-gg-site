/* The Worker: a cron trigger, and nothing else.
 *
 * Cloudflare Workers rather than GitHub Actions cron, for the reason the brief
 * gives and which is not negotiable for this product: GitHub's scheduled
 * workflows are routinely ten to thirty minutes late and are dropped entirely
 * under load. A tool whose whole claim is freshness cannot be built on a clock
 * that is sometimes half an hour wrong.
 *
 * WHAT RUNS HERE IS DELIBERATELY SMALL. Fetch, de-vig, apply precomputed
 * priors, write. No model, no simulation, no fitting over a season of game
 * logs. Anything that needs Python or more than a couple of seconds belongs in
 * the cold path, where being slow is free.
 *
 *
 * THERE IS NO fetch HANDLER THAT DOES ANYTHING USEFUL
 * ---------------------------------------------------------------------------
 * A Worker with an HTTP handler that triggers a sweep is a URL that spends
 * money, reachable by anybody who finds it. The temptation to add one "just to
 * test it" is exactly how that happens, so the handler exists and answers 404
 * to everything, and testing is done by fantasy/check-worker.mjs against a
 * fake provider instead.
 *
 * `wrangler dev --test-scheduled` is the way to fire a real tick by hand.
 */
import { sweepOnce } from './sweep.mjs';
import { makeOddsClient } from './odds.mjs';
import { makeStore } from './store.mjs';
import { seasonAndWeek } from './season.mjs';

/* STRUCTURED, ONE JSON OBJECT PER LINE. `wrangler tail` and the Cloudflare
 * dashboard both show these, and a line that is already JSON can be filtered
 * without anybody writing a parser at 11am on a Sunday. */
const logger = (runId) => (o) => {
  try { console.log(JSON.stringify({ run: runId, t: new Date().toISOString(), ...o })); }
  catch (e) { console.log(JSON.stringify({ run: runId, at: 'log.failed' })); }
};

export default {
  async scheduled(event, env, ctx) {
    const runId = Math.random().toString(36).slice(2, 10);
    const log = logger(runId);

    /* MISSING CONFIGURATION IS A LOUD FAILURE, NEVER A QUIET NO-OP. A Worker
       deployed without its secrets would otherwise tick every minute forever,
       do nothing, and look exactly like a Worker that is working during an
       offseason. */
    const missing = ['ODDS_API_KEY', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE']
      .filter((k) => !env[k]);
    if (missing.length) {
      log({ at: 'boot.missing_config', missing });
      throw new Error('fantasy worker is missing: ' + missing.join(', '));
    }

    const { season, week } = seasonAndWeek(new Date(event.scheduledTime || Date.now()));

    /* OBSERVE OR LIVE, and observe is the default in wrangler.toml.
     *
     * A poller that starts spending the moment it is deployed gives nobody a
     * chance to look at what it decided first, and on a 500 credit allowance
     * the first evening can be a third of the month. So the deploy that turns
     * it on is a deliberate one: `--var FANTASY_MODE:live`.
     *
     * ANYTHING THAT IS NOT EXACTLY 'live' IS OBSERVE. A typo, an unset var, a
     * value of 'true', all of them cost nothing. The failure that matters here
     * is spending by accident, so the safe reading is the default one. */
    const observeOnly = String(env.FANTASY_MODE || 'observe').toLowerCase() !== 'live';
    log({ at: 'tick.start', cron: event.cron, season, week, mode: observeOnly ? 'observe' : 'live' });

    const store = makeStore({
      url: env.SUPABASE_URL, serviceKey: env.SUPABASE_SERVICE_ROLE, log,
    });

    try {
      const summary = await sweepOnce({
        odds: makeOddsClient({ apiKey: env.ODDS_API_KEY, log }),
        store, season, week, log, observeOnly,
      });
      log({ at: 'tick.done', ...summary });
    } catch (e) {
      /* RETHROWN AFTER LOGGING. Cloudflare marks a scheduled run as failed only
         if the handler throws, and a failed run is what shows up in the
         dashboard without anybody going looking. Swallowing it here would make
         every tick look successful. */
      log({ at: 'tick.threw', error: String(e && e.message || e), stack: String(e && e.stack || '') });

      /* THE LAST HOLE IN "NEVER SILENT", and it is the one the first deploy
         would have fallen into. sweep.mjs records a failed or empty event
         list, but a throw anywhere else (a refused database write, a bad
         response shape, anything unforeseen) ends the tick with nothing
         written, which is the state that reads as "not running".
         
         So the handler tries once to leave a row saying it threw. Best
         effort and wrapped, because if the database is what threw then this
         will throw too, and an exception raised while recording an exception
         helps nobody. */
      try {
        const id = await store.openRun({ eventId: null, markets: [], credits: 0 });
        await store.closeRun(id, {
          ok: false,
          rows_written: 0,
          error: 'tick threw: ' + String(e && e.message || e).slice(0, 300),
          raw: { mode: observeOnly ? 'observe' : 'live', stage: 'throw' },
        });
      } catch (e2) {
        log({ at: 'tick.threw.unrecorded', error: String(e2 && e2.message || e2) });
      }

      throw e;
    }
  },

  /* Answers nothing, on purpose. See the header. */
  async fetch() {
    return new Response('', { status: 404 });
  },
};
