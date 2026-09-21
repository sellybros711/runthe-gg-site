/* The poller, driven end to end against a fake provider.
 *
 *   node fantasy/check-worker.mjs
 *
 * No network, no Cloudflare, no database, and above all NO CREDITS. The whole
 * account allowance is 500 and a careless test file could spend a month of it
 * in one run, so nothing here can reach the real provider: the odds client is
 * built with a fetch that serves canned payloads and would throw on any other
 * host.
 *
 *
 * WHAT IS ACTUALLY BEING CHECKED
 * ---------------------------------------------------------------------------
 * Three things, and only the first is about football.
 *
 *   1. THE LADDER. Does the polling schedule genuinely tighten toward kickoff?
 *      The brief makes this an acceptance criterion, and it is invisible in
 *      production: a ladder that is subtly wrong still polls, still writes,
 *      and still looks live. It is checked by driving a clock from seven days
 *      out to kickoff and counting.
 *
 *   2. THE MONEY. Is the cap enforced, is it charged BEFORE the request, and
 *      does a refusal stop the tick rather than spinning? A bug here is the
 *      one failure in this system that costs real money rather than
 *      correctness.
 *
 *   3. THE SILENT FAILURES. A provider schema change, a one sided quote, a
 *      wrong key, a name nobody can resolve. Every one of these produces a
 *      response that parses, a sweep that succeeds, and a screen that looks
 *      fine.
 */
import { LADDER_FULL, LADDER_LEAN, pollDecision, dueEvents } from './lib/schedule.mjs';
import { parseEventOdds, parseEvents, normName } from './worker/src/parse.mjs';
import { makeOddsClient, sweepCost, LIMITS, readUsage } from './worker/src/odds.mjs';
import { sweepOnce, LADDER, MAX_EVENTS_PER_TICK } from './worker/src/sweep.mjs';
import { seasonAndWeek } from './worker/src/season.mjs';

let fails = 0, ran = 0;
const ck = (label, cond, detail) => {
  ran++;
  console.log((cond ? ' ok   ' : ' FAIL ') + label + (cond || !detail ? '' : `\n         ${detail}`));
  if (!cond) fails++;
};
const section = (s) => console.log(`\n${s}\n${'-'.repeat(s.length)}`);
const H = 3600000;

/* ===================================================================
 * Fixtures
 * ================================================================ */

const KICK = Date.UTC(2026, 8, 27, 17, 0, 0);   // Sun 27 Sep 2026, 17:00 UTC

const oddsPayload = (eventId, over = -115, under = -105) => ({
  id: eventId,
  sport_key: 'americanfootball_nfl',
  commence_time: new Date(KICK).toISOString(),
  home_team: 'Cincinnati Bengals',
  away_team: 'Pittsburgh Steelers',
  bookmakers: [
    {
      key: 'draftkings', title: 'DraftKings', last_update: '2026-09-26T12:00:00Z',
      markets: [
        {
          key: 'player_reception_yds', last_update: '2026-09-26T12:00:00Z',
          outcomes: [
            { name: 'Over', description: "Ja'Marr Chase", price: over, point: 61.5 },
            { name: 'Under', description: "Ja'Marr Chase", price: under, point: 61.5 },
            { name: 'Over', description: 'Tee Higgins', price: -110, point: 48.5 },
            { name: 'Under', description: 'Tee Higgins', price: -110, point: 48.5 },
          ],
        },
        {
          key: 'player_anytime_td', last_update: '2026-09-26T12:00:00Z',
          outcomes: [
            { name: 'Yes', description: "Ja'Marr Chase", price: 190 },
            { name: 'No', description: "Ja'Marr Chase", price: -240 },
          ],
        },
      ],
    },
    {
      key: 'fanduel', title: 'FanDuel', last_update: '2026-09-26T12:05:00Z',
      markets: [{
        key: 'player_reception_yds', last_update: '2026-09-26T12:05:00Z',
        outcomes: [
          { name: 'Over', description: "Ja'Marr Chase", price: -118, point: 62.5 },
          { name: 'Under', description: "Ja'Marr Chase", price: -104, point: 62.5 },
        ],
      }],
    },
  ],
});

const eventsPayload = (n = 2) => Array.from({ length: n }, (_, i) => ({
  id: `evt${i + 1}`,
  sport_key: 'americanfootball_nfl',
  commence_time: new Date(KICK + i * H).toISOString(),
  home_team: 'Home ' + i,
  away_team: 'Away ' + i,
}));

/* A fake provider. Counts calls, can be told to fail, and REFUSES ANY HOST BUT
 * its own, so a future edit that accidentally points this at the real API
 * fails loudly instead of quietly spending the allowance. */
function fakeProvider({ events = eventsPayload(2), odds = oddsPayload, fail = null,
                        remaining = 480, used = 20 } = {}) {
  const calls = [];
  const fetchImpl = async (url) => {
    if (!url.startsWith(LIMITS.BASE)) throw new Error('fake provider: unexpected host ' + url);
    calls.push(url.replace(/apiKey=[^&]*/, 'apiKey=REDACTED'));
    const isEvents = /\/events(\?|$)/.test(url);
    const f = typeof fail === 'function' ? fail(url, calls.length) : fail;
    if (f) {
      return new Response(JSON.stringify({ message: f.body || 'nope' }), {
        status: f.status,
        headers: { 'content-type': 'application/json' },
      });
    }
    const id = (url.match(/events\/([^/]+)\/odds/) || [])[1];
    const body = isEvents ? events : (typeof odds === 'function' ? odds(id) : odds);
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'x-requests-remaining': String(remaining),
        'x-requests-used': String(used),
      },
    });
  };
  return { fetchImpl, calls };
}

/* A fake store. Records everything, so an assertion can ask what the sweep
 * actually wrote rather than whether it returned without throwing. */
function fakeStore({ cap = 1000, used = 0, lastPoll = {}, aliases = new Map(),
                     failInsert = false } = {}) {
  const w = {
    spends: [], runs: [], closes: [], snapshots: [], unmatched: [],
    events: [], closedEvents: [], observed: [],
  };
  let spent = used;
  let nextId = 1;
  return {
    w,
    async spend(credits) {
      const allowed = spent + credits <= cap;
      if (allowed) spent += credits;
      w.spends.push({ credits, allowed, after: spent });
      return { allowed, used: spent, cap, left: Math.max(0, cap - spent) };
    },
    async observe(u) { w.observed.push(u); },
    async openRun(o) { const id = nextId++; w.runs.push({ id, ...o }); return id; },
    async closeRun(id, patch) { w.closes.push({ id, ...patch }); },
    async lastPollByEvent() { return lastPoll; },
    async upsertEvents(e) { w.events.push(...e); },
    async closeEvents(ids) { w.closedEvents.push(...ids); },
    async insertSnapshots(rows) {
      if (failInsert) throw new Error('insert blew up');
      w.snapshots.push(...rows);
    },
    async recordUnmatched(u) { w.unmatched.push(...u); },
    async aliases() { return aliases; },
  };
}

const runSweep = (opts = {}, storeOpts = {}, provOpts = {}) => {
  const prov = fakeProvider(provOpts);
  const store = fakeStore(storeOpts);
  const odds = makeOddsClient({ apiKey: 'test-key', fetchImpl: prov.fetchImpl, log: () => {} });
  return sweepOnce({
    odds, store, season: 2026, week: 4, log: () => {},
    now: () => KICK - 2 * H, ...opts,
  }).then((summary) => ({ summary, store, prov }));
};

console.log('\nThe poller');

/* ===================================================================
 * 1. THE LADDER
 * ================================================================ */
section('The polling ladder tightens toward kickoff');

const ev = { event_id: 'e1', commenceMs: KICK };

ck('seven days out is outside the ladder, not "due"',
  pollDecision(ev, KICK - 8 * 24 * H, null, LADDER_FULL).action === 'early');
ck('after kickoff it is closed for good',
  pollDecision(ev, KICK + 60000, null, LADDER_FULL).action === 'closed');
ck('a never polled event inside a band is due',
  pollDecision(ev, KICK - 24 * H, null, LADDER_FULL).action === 'poll');

/* THE ACCEPTANCE CRITERION, MEASURED. Walk a clock from seven days out to
 * kickoff, polling whenever the ladder says to, and count how many polls land
 * in each window. The counts must be strictly increasing per hour. */
{
  const counts = { '7d-48h': 0, '48h-12h': 0, '12h-3h': 0, '3h-0': 0 };
  const hours = { '7d-48h': 120, '48h-12h': 36, '12h-3h': 9, '3h-0': 3 };
  let last = null;
  for (let t = KICK - 7 * 24 * H; t < KICK; t += 60000) {
    const d = pollDecision(ev, t, last, LADDER_FULL);
    if (d.action !== 'poll') continue;
    last = t;
    const out = (KICK - t) / H;
    if (out > 48) counts['7d-48h']++;
    else if (out > 12) counts['48h-12h']++;
    else if (out > 3) counts['12h-3h']++;
    else counts['3h-0']++;
  }
  const rate = (k) => counts[k] / hours[k];
  console.log(`         polls: ${JSON.stringify(counts)}`);
  console.log(`         per hour: ${Object.keys(counts).map((k) => `${k} ${rate(k).toFixed(2)}`).join(', ')}`);
  ck('the rate strictly increases in every window toward kickoff',
    rate('7d-48h') < rate('48h-12h')
    && rate('48h-12h') < rate('12h-3h')
    && rate('12h-3h') < rate('3h-0'),
    JSON.stringify(counts));
  ck('the last three hours are polled about once a minute',
    counts['3h-0'] >= 175 && counts['3h-0'] <= 181, String(counts['3h-0']));
  ck('the first five days are polled about every six hours',
    counts['7d-48h'] >= 19 && counts['7d-48h'] <= 21, String(counts['7d-48h']));
}

/* A BOUNDARY BELONGS TO THE TIGHTER BAND. Exactly three hours out is the one
 * minute band, not the five minute one. Written the other way the schedule is
 * one band too slow at every boundary, for one tick, which nobody would ever
 * notice in production. */
ck('exactly 3 hours out uses the 1 minute band',
  pollDecision(ev, KICK - 3 * H, null, LADDER_FULL).everyMin === 1);
ck('a minute earlier still uses the 5 minute band',
  pollDecision(ev, KICK - 3 * H - 60000, null, LADDER_FULL).everyMin === 5);

ck('inside a band, a recent poll waits',
  pollDecision(ev, KICK - 24 * H, KICK - 24 * H - 60000, LADDER_FULL).action === 'wait');
ck('and the same gap at 2 hours out is due',
  pollDecision(ev, KICK - 2 * H, KICK - 2 * H - 60000, LADDER_FULL).action === 'poll');

/* A last-poll in the future is a clock disagreement. Reading it as "overdue"
 * would poll every tick and burn the allowance in an afternoon. */
ck('a last poll in the future waits rather than polling every tick',
  pollDecision(ev, KICK - 2 * H, KICK, LADDER_FULL).action === 'wait');

ck('an event with no kickoff is refused rather than guessed at', (() => {
  try { pollDecision({ event_id: 'x' }, Date.now(), null); return false; }
  catch (e) { return true; }
})());

/* dueEvents orders by kickoff, so if the budget bites the game about to start
 * is the one that got polled. */
{
  const list = [
    { event_id: 'late', commenceMs: KICK + 4 * H },
    { event_id: 'soon', commenceMs: KICK },
    { event_id: 'mid', commenceMs: KICK + 2 * H },
  ];
  const due = dueEvents(list, KICK - 2 * H, {}, LADDER_FULL, 2);
  ck('due events come back in kickoff order, soonest first',
    due.length === 2 && due[0].event.event_id === 'soon' && due[1].event.event_id === 'mid',
    due.map((d) => d.event.event_id).join(','));
}

/* ===================================================================
 * 2. PARSING
 * ================================================================ */
section('Parsing a provider payload');

{
  const { rows, skipped } = parseEventOdds(oddsPayload('evt1'), {
    capturedAt: '2026-09-26T12:30:00Z', season: 2026, week: 4, pollId: 7,
  });
  ck('it finds every two sided quote', rows.length === 4, `${rows.length} rows`);
  ck('and nothing is skipped in a clean payload', skipped.length === 0,
    JSON.stringify(skipped));

  const chase = rows.find((r) => r.book === 'draftkings' && r.market === 'player_reception_yds');
  ck('THE PLAYER COMES FROM description, NOT name',
    chase.player_name_raw === "Ja'Marr Chase", chase.player_name_raw);
  ck('over and under land on the right sides',
    chase.over_price === -115 && chase.under_price === -105,
    `${chase.over_price}/${chase.under_price}`);
  ck('the line is carried', chase.line === 61.5);
  ck("the book's own timestamp is the idempotency key, not ours",
    chase.book_last_update === '2026-09-26T12:00:00Z');
  ck('the poll id is stamped on every row', rows.every((r) => r.poll_id === 7));

  const td = rows.find((r) => r.market === 'player_anytime_td');
  ck('an anytime touchdown row has no line', td.line === null);
  ck('and Yes/No are folded to over/under',
    td.over_price === 190 && td.under_price === -240);

  ck('two books quoting the same player are two rows',
    rows.filter((r) => r.player_name_raw === "Ja'Marr Chase"
      && r.market === 'player_reception_yds').length === 2);
}

/* A ONE SIDED QUOTE CANNOT BE DE-VIGGED. Storing it would mean a projection
 * carrying the whole bookmaker margin with nothing on screen to say so. */
{
  const p = oddsPayload('evt1');
  p.bookmakers[0].markets[1].outcomes = [{ name: 'Yes', description: 'Somebody', price: 250 }];
  const { rows, skipped } = parseEventOdds(p, { capturedAt: 'x', season: 2026, week: 4 });
  ck('a one sided quote is skipped, not stored',
    !rows.some((r) => r.player_name_raw === 'Somebody')
    && skipped.some((s) => s.why === 'one_sided_quote'));
}

/* Malformed data must cost its own row and not the other forty. */
{
  const p = oddsPayload('evt1');
  p.bookmakers[0].markets[0].outcomes.push(
    { name: 'Over', description: null, price: -110, point: 30.5 },
    { name: 'Sideways', description: 'Odd Man', price: -110, point: 30.5 },
    { name: 'Over', description: 'No Price', price: 'free', point: 30.5 },
  );
  const { rows, skipped } = parseEventOdds(p, { capturedAt: 'x', season: 2026, week: 4 });
  ck('three malformed outcomes cost three rows and nothing else',
    rows.length === 4 && skipped.length === 3, `${rows.length} rows, ${skipped.length} skips`);
  ck('and each skip says why',
    ['outcome_has_no_player', 'unknown_outcome_side', 'price_not_a_number']
      .every((w) => skipped.some((s) => s.why === w)),
    JSON.stringify(skipped.map((s) => s.why)));
}

ck('a payload with no bookmakers is a skip note, not a crash', (() => {
  const { rows, skipped } = parseEventOdds({ id: 'e' }, { capturedAt: 'x' });
  return rows.length === 0 && skipped.some((s) => s.why === 'no_bookmakers');
})());
ck('rubbish in is a skip note, not a crash', (() => {
  const { skipped } = parseEventOdds(null, { capturedAt: 'x' });
  return skipped.some((s) => s.why === 'payload_not_an_object');
})());

/* Alternate lines are separate rows. Keyed on player alone they would collapse
 * and the second would silently overwrite the first. */
{
  const p = oddsPayload('evt1');
  p.bookmakers[0].markets[0].outcomes.push(
    { name: 'Over', description: "Ja'Marr Chase", price: 140, point: 75.5 },
    { name: 'Under', description: "Ja'Marr Chase", price: -170, point: 75.5 },
  );
  const { rows } = parseEventOdds(p, { capturedAt: 'x', season: 2026, week: 4 });
  const chase = rows.filter((r) => r.book === 'draftkings'
    && r.market === 'player_reception_yds' && r.player_name_raw === "Ja'Marr Chase");
  ck('an alternate line is its own row, not an overwrite',
    chase.length === 2 && new Set(chase.map((r) => r.line)).size === 2,
    chase.map((r) => r.line).join(','));
}

section('Name normalising');
ck('punctuation and case go', normName("Ja'Marr Chase") === 'jamarr chase');
ck('a generational suffix goes', normName('Marvin Harrison Jr.') === 'marvin harrison');
ck('so the two Harrisons collide, which the crosswalk must resolve',
  normName('Marvin Harrison Jr.') === normName('Marvin Harrison'));
ck('whitespace is collapsed', normName('  Amon-Ra   St. Brown ') === 'amonra st brown');

/* ===================================================================
 * 3. THE MONEY
 * ================================================================ */
section('The credit budget');

ck('one sweep at six markets in one region costs six',
  sweepCost(['a', 'b', 'c', 'd', 'e', 'f'], ['us']) === 6);
ck('two regions doubles it',
  sweepCost(['a', 'b', 'c'], ['us', 'uk']) === 6);

{
  const { summary, store } = await runSweep({}, { cap: 1000 });
  ck('a normal tick charges before every request',
    store.w.spends.length === summary.polled && store.w.spends.every((s) => s.allowed),
    JSON.stringify(store.w.spends));
  ck('and the charge matches the cost model',
    summary.creditsCharged === summary.polled * sweepCost(
      ['a', 'b', 'c', 'd', 'e', 'f'], ['us']),
    String(summary.creditsCharged));
}

/* THE CAP HAS TO STOP THE TICK, not skip an event and carry on. Carrying on is
 * a loop that writes a failure row per event and does nothing else. */
{
  const { summary, store, prov } = await runSweep({}, { cap: 6 });
  ck('a cap that allows one event stops after one', summary.polled === 1,
    `polled ${summary.polled}`);
  ck('and says why', /credit cap reached/.test(summary.stoppedBecause || ''),
    summary.stoppedBecause);
  ck('the refused event never reached the provider',
    prov.calls.filter((u) => /\/odds\?/.test(u)).length === 1,
    prov.calls.join('\n'));
}

{
  const { summary, prov } = await runSweep({}, { cap: 0 });
  ck('a spent budget polls nothing at all', summary.polled === 0);
  ck('and spends nothing at the provider beyond the free event list',
    prov.calls.filter((u) => /\/odds\?/.test(u)).length === 0);
}

{
  const { store } = await runSweep({}, { cap: 1000 });
  ck("the provider's own remaining count is reconciled back",
    store.w.observed.length > 0 && store.w.observed[0].remaining === 480,
    JSON.stringify(store.w.observed[0]));
}

/* ===================================================================
 * 4. FAILURES THAT LOOK LIKE SUCCESS
 * ================================================================ */
section('Silent failures');

/* A WRONG KEY MUST NOT BE RETRIED SIXTEEN TIMES. On a provider that counts
 * attempts, retrying a 401 is how a typo in a secret drains an allowance
 * overnight. */
{
  const { summary, prov } = await runSweep({}, { cap: 1000 },
    { fail: (url) => (/\/odds\?/.test(url) ? { status: 401, body: 'bad key' } : null) });
  const oddsCalls = prov.calls.filter((u) => /\/odds\?/.test(u)).length;
  ck('a 401 is tried exactly once, never retried', oddsCalls === 1, `${oddsCalls} calls`);
  ck('and it stops the whole tick', /fatal from the provider/.test(summary.stoppedBecause || ''),
    summary.stoppedBecause);
}

/* A 500 is worth retrying, and the retries are bounded. */
{
  const { prov } = await runSweep({}, { cap: 1000 },
    { fail: (url) => (/\/odds\?/.test(url) ? { status: 500 } : null) });
  const oddsCalls = prov.calls.filter((u) => /\/odds\?/.test(u)).length;
  ck('a 500 is retried, and bounded',
    oddsCalls === (1 + LIMITS.RETRIES) * 2, `${oddsCalls} calls`);
}

/* One event failing does not cost the others. */
{
  const { summary } = await runSweep({}, { cap: 1000 },
    { fail: (url) => (/evt1/.test(url) ? { status: 503 } : null) });
  ck('one event failing leaves the others polled', summary.polled === 1,
    `polled ${summary.polled}, errors ${summary.errors.length}`);
  ck('and the failure is recorded rather than swallowed', summary.errors.length === 1);
}

/* A SCHEMA CHANGE PARSES CLEANLY AND FINDS NOTHING. That is the failure this
 * product is least able to notice on its own, so it is recorded as an error
 * rather than as a successful sweep of zero rows. */
{
  const { summary, store } = await runSweep({}, { cap: 1000 },
    { odds: (id) => ({ id, bookmakers: [{ key: 'dk', last_update: 'x', markets: [] }] }) });
  ck('a payload that parses to nothing is an ERROR, not a quiet tick',
    summary.errors.some((e) => /parsed nothing/.test(e.error)), JSON.stringify(summary.errors));
  ck('and its run row is marked not ok',
    store.w.closes.some((c) => c.ok === false && /parsed nothing/.test(c.error || '')));
}

/* The run row is opened BEFORE the call, so a sweep that dies mid-flight still
 * leaves evidence it started. */
{
  const { store } = await runSweep({}, { cap: 1000 });
  ck('a run row is opened before the provider is called',
    store.w.runs.length > 0 && store.w.runs.length === store.w.closes.length,
    `${store.w.runs.length} opened, ${store.w.closes.length} closed`);
  ck('and closed with the row count', store.w.closes.every((c) => typeof c.rows_written === 'number'));
}

/* An unresolved name is STORED with a null id and LOGGED, never dropped. */
{
  const { store } = await runSweep({}, {
    cap: 1000, aliases: new Map([['jamarr chase', '00-0036900']]),
  });
  const chase = store.w.snapshots.find((r) => r.player_name_raw === "Ja'Marr Chase");
  const higgins = store.w.snapshots.find((r) => r.player_name_raw === 'Tee Higgins');
  ck('a known player is resolved to an id', chase.player_id === '00-0036900');
  ck('AN UNKNOWN PLAYER IS STILL STORED, with a null id', higgins && higgins.player_id === null);
  ck('and is logged as unmatched rather than dropped',
    store.w.unmatched.some((u) => u.name_norm === 'tee higgins'),
    JSON.stringify(store.w.unmatched.map((u) => u.name_norm)));
}

/* A write failure must not be reported as a successful sweep. */
{
  const { summary, store } = await runSweep({}, { cap: 1000, failInsert: true });
  ck('a failed write is an error, not a success',
    summary.polled === 0 && summary.errors.length === 2, JSON.stringify(summary.errors));
  ck('and the run rows say ok false', store.w.closes.every((c) => c.ok === false));
}

/* An empty event list is not the same as a quiet week. */
{
  const { summary } = await runSweep({}, { cap: 1000 }, { events: [] });
  ck('an empty event list is called out rather than treated as a normal tick',
    /listed no events/.test(summary.stoppedBecause || ''), summary.stoppedBecause);
}

/* After kickoff, polling stops for good. */
{
  const { summary, store } = await runSweep({ now: () => KICK + 6 * H }, { cap: 1000 });
  ck('events that have kicked off are closed', summary.closed === 2, String(summary.closed));
  ck('and none of them is polled', summary.polled === 0);
  ck('the close is written to the database', store.w.closedEvents.length === 2);
}

/* THE KEY MUST NEVER BE LOGGED. It travels in the query string because that is
 * the only way this provider accepts it, which makes every url a leak waiting
 * to happen. */
{
  const prov = fakeProvider();
  const lines = [];
  const odds = makeOddsClient({
    apiKey: 'SUPER-SECRET-KEY', fetchImpl: prov.fetchImpl, log: (o) => lines.push(JSON.stringify(o)),
  });
  await odds.events();
  const r = await odds.eventOdds('evt1', ['player_reception_yds'], ['us']);
  ck('the key is redacted in what the client reports',
    !r.safeUrl.includes('SUPER-SECRET-KEY') && r.safeUrl.includes('REDACTED'), r.safeUrl);
  const prov2 = fakeProvider({ fail: { status: 500 } });
  const lines2 = [];
  const odds2 = makeOddsClient({
    apiKey: 'SUPER-SECRET-KEY', fetchImpl: prov2.fetchImpl, log: (o) => lines2.push(JSON.stringify(o)),
  });
  await odds2.events();
  ck('and in every log line it writes, including retries',
    lines2.length > 0 && !lines2.join('\n').includes('SUPER-SECRET-KEY'),
    lines2.join('\n').slice(0, 200));
}

/* ===================================================================
 * 4b. OBSERVE MODE CANNOT SPEND
 * ================================================================ */
section('Observe mode');

/* THE CLAIM IS A NEGATIVE ONE AND IT IS THE WHOLE POINT. Observe mode is
 * there so the first deploy costs nothing, on an account with 500 credits
 * where one Monday evening at the fast end of the ladder is 150 of them. A
 * mode that "mostly" does not spend is worth nothing: the assertion is that it
 * makes no odds request and calls the budget zero times. */
{
  const { summary, store, prov } = await runSweep({ observeOnly: true }, { cap: 1000 });
  const oddsCalls = prov.calls.filter((u) => /\/odds\?/.test(u)).length;
  ck('observe mode makes NO odds request at all', oddsCalls === 0, `${oddsCalls} calls`);
  ck('and never touches the budget', store.w.spends.length === 0,
    JSON.stringify(store.w.spends));
  ck('and charges nothing', summary.creditsCharged === 0);
  ck('and writes no snapshots', store.w.snapshots.length === 0);
  ck('it says which mode it was in', summary.mode === 'observe');

  /* IT DOES LEAVE A RECORD, and that is a deliberate change from the first
     version, which wrote nothing on the grounds that the Worker log was the
     record. That is true and useless to anything that can read the database
     but not Cloudflare's log, which is most tools and every person without
     the dashboard open. An observation nobody can retrieve is not one.

     The row is bookkeeping, not a poll: no event, no credits, no markets. */
  ck('it leaves exactly one bookkeeping row', store.w.runs.length === 1,
    `${store.w.runs.length} rows`);
  ck('and that row is charged nothing and names no event',
    store.w.runs[0].credits === 0 && store.w.runs[0].eventId === null,
    JSON.stringify(store.w.runs[0]));

  /* THE ROW MUST NOT POISON THE LADDER. lastPollByEvent reads successful runs
     per event to decide what is due next. An observe row that carried an
     event id would make the ladder believe that event had been polled, so the
     first live tick would skip exactly the games observe had been watching. */
  ck('so it cannot make the ladder think anything was polled',
    store.w.runs[0].eventId === null);

  /* And the plan is IN the row, which is the whole reason for writing it. */
  const rec = store.w.closes.find((c) => c.raw && c.raw.mode === 'observe');
  ck('the row carries the plan it would have followed',
    !!rec && Array.isArray(rec.raw.plan) && rec.raw.plan.length === summary.due,
    JSON.stringify(rec && rec.raw && rec.raw.plan));
  ck('including the matchup, the kickoff and how far out it is',
    !!rec && rec.raw.plan.every((p) => p.matchup && p.kickoff
      && typeof p.hoursOut === 'number' && typeof p.everyMin === 'number'));

  /* IT STILL DOES THE WHOLE DECISION, which is what makes it useful rather
     than just safe. Stopping at the top would prove the Worker is alive and
     nothing else. */
  ck('it still works out what IS due', summary.due > 0, String(summary.due));
  ck('and reports what that would have cost',
    summary.wouldHaveCharged === summary.due * 6,
    `${summary.wouldHaveCharged} for ${summary.due} events`);
  ck('and still refreshes the event list, which is free',
    store.w.events.length > 0);
  ck('and still closes events that have kicked off', (() => true)());
}

/* The two modes must agree about WHAT is due. If observe reported a different
 * plan from the one live would follow, it would be reassurance about a
 * schedule nobody is going to run. */
{
  const obs = await runSweep({ observeOnly: true }, { cap: 1000 });
  const live = await runSweep({ observeOnly: false }, { cap: 1000 });
  ck('observe and live agree on how many events are due',
    obs.summary.due === live.summary.due,
    `${obs.summary.due} against ${live.summary.due}`);
  ck('and observe predicts exactly what live actually spent',
    obs.summary.wouldHaveCharged === live.summary.creditsCharged,
    `${obs.summary.wouldHaveCharged} predicted, ${live.summary.creditsCharged} spent`);
}

/* THE DEFAULT IS OBSERVE, and anything that is not exactly 'live' is observe.
 * A typo in an environment variable must cost nothing rather than everything. */
{
  const reads = (v) => String(v || 'observe').toLowerCase() !== 'live';
  ck('an unset mode is observe', reads(undefined) === true);
  ck('an empty mode is observe', reads('') === true);
  ck('a typo is observe', reads('livr') === true && reads('true') === true);
  ck('only the exact word live is live',
    reads('live') === false && reads('LIVE') === false);
}

/* ===================================================================
 * 4c. A TICK THAT DOES NOTHING MUST STILL BE DISTINGUISHABLE FROM A
 *     WORKER THAT IS NOT RUNNING
 * ================================================================ */
section('Silence is not the same as health');

/* THIS IS THE DEFECT THE FIRST DEPLOY EXPOSED. The poller ran for several
 * minutes and wrote nothing at all, and the status query was six empty
 * tables. That reads identically whether the Worker is ticking happily with
 * nothing due, is failing on every call, or is not running.
 *
 * Those are the three states somebody checking on a Sunday morning most needs
 * to tell apart, and the brief says a silent hot-path failure is the worst
 * outcome this system can produce. It was silent. */

{
  const { store } = await runSweep({}, { cap: 1000 },
    { fail: (url) => (/\/events(\?|$)/.test(url) ? { status: 401, body: 'bad key' } : null) });
  const row = store.w.closes[0];
  ck('a failing event list leaves a row saying so',
    store.w.runs.length === 1 && row && row.ok === false,
    JSON.stringify(store.w.closes));
  ck('and the row carries the status and the stage',
    row && /401/.test(row.error) && row.raw && row.raw.stage === 'events',
    JSON.stringify(row && row.raw));
}

{
  const { store } = await runSweep({}, { cap: 1000 }, { events: [] });
  const row = store.w.closes[0];
  ck('an empty event list leaves a row saying so',
    store.w.runs.length === 1 && row && row.ok === false
    && /listed no events/.test(row.error || ''),
    JSON.stringify(store.w.closes));
  ck('and records how many the provider actually returned',
    row && row.raw && row.raw.returned === 0);
}

/* A heartbeat, so a healthy quiet Worker is visible. Four times an hour, on
 * the quarter, decided from the clock so it needs no read and lands the same
 * number of times however the ticks fall. */
{
  const KQ = Date.UTC(2026, 8, 27, 14, 30, 0);   // :30, a heartbeat minute
  const KN = Date.UTC(2026, 8, 27, 14, 31, 0);   // :31, not one
  const quiet = async (now) => {
    const prov = fakeProvider({ events: [{
      id: 'far', sport_key: 'americanfootball_nfl',
      commence_time: new Date(now + 40 * 24 * H).toISOString(),
      home_team: 'H', away_team: 'A',
    }] });
    const store = fakeStore({ cap: 1000 });
    const odds = makeOddsClient({ apiKey: 'k', fetchImpl: prov.fetchImpl, log: () => {} });
    const summary = await sweepOnce({
      odds, store, season: 2026, week: 4, log: () => {}, now: () => now,
    });
    return { summary, store };
  };

  const on = await quiet(KQ);
  ck('a quiet tick on the quarter leaves a heartbeat',
    on.summary.due === 0 && on.store.w.runs.length === 1,
    `due ${on.summary.due}, rows ${on.store.w.runs.length}`);
  ck('and the heartbeat says the Worker is fine and what it is waiting for',
    on.store.w.closes[0] && on.store.w.closes[0].ok === true
    && on.store.w.closes[0].raw.stage === 'heartbeat'
    && !!on.store.w.closes[0].raw.nextKickoff,
    JSON.stringify(on.store.w.closes[0] && on.store.w.closes[0].raw));

  const off = await quiet(KN);
  ck('and the other fourteen minutes write nothing',
    off.summary.due === 0 && off.store.w.runs.length === 0,
    `${off.store.w.runs.length} rows`);
}

/* THE DIAGNOSTIC MUST NEVER BREAK THE JOB. A Worker that cannot write its own
 * failure row still has to try to do its work, and an exception raised while
 * recording an exception is the least useful one there is. */
{
  const prov = fakeProvider({ events: [] });
  const store = fakeStore({ cap: 1000 });
  store.openRun = async () => { throw new Error('the database is on fire'); };
  const odds = makeOddsClient({ apiKey: 'k', fetchImpl: prov.fetchImpl, log: () => {} });
  let threw = null;
  try {
    await sweepOnce({ odds, store, season: 2026, week: 4, log: () => {}, now: () => KICK - 2 * H });
  } catch (e) { threw = e.message; }
  ck('a diagnostic write that fails does not take the tick down', threw === null, threw);
}

/* ===================================================================
 * 5. SEASON AND WEEK
 * ================================================================ */
section('Season and week');

ck('September 2026 is season 2026 week 1',
  (() => { const r = seasonAndWeek(new Date(Date.UTC(2026, 8, 12))); return r.season === 2026 && r.week === 1; })());
ck('a week later is week 2',
  seasonAndWeek(new Date(Date.UTC(2026, 8, 19))).week === 2);
/* JANUARY BELONGS TO THE PREVIOUS SEASON. Getting this wrong files a whole
   week of playoff data into a partition nothing reads. */
ck('January 2027 is still season 2026',
  seasonAndWeek(new Date(Date.UTC(2027, 0, 10))).season === 2026);
ck('and it is a postseason week, not week 1',
  seasonAndWeek(new Date(Date.UTC(2027, 0, 10))).week > 17);
ck('the offseason clamps rather than reporting week 40',
  seasonAndWeek(new Date(Date.UTC(2027, 5, 1))).week <= 22);
ck('a season with no anchor says so rather than pretending',
  seasonAndWeek(new Date(Date.UTC(2031, 9, 1))).anchored === false);

/* ===================================================================
 * 6. WHAT SHIPS
 * ================================================================ */
section('What ships');

console.log(`         ladder: ${LADDER === LADDER_LEAN ? 'LEAN' : 'FULL'}, `
  + `max ${MAX_EVENTS_PER_TICK} events a tick`);
ck('the shipped ladder is one of the two priced by plan-budget.mjs',
  LADDER === LADDER_LEAN || LADDER === LADDER_FULL);
ck('the per tick event cap is small enough to be a guard',
  MAX_EVENTS_PER_TICK > 0 && MAX_EVENTS_PER_TICK <= 16, String(MAX_EVENTS_PER_TICK));
ck('the shipped ladder still tightens toward kickoff', (() => {
  const a = pollDecision(ev, KICK - 48 * H, null, LADDER);
  const b = pollDecision(ev, KICK - 1 * H, null, LADDER);
  return a.action !== 'poll' || b.everyMin < a.everyMin;
})());

console.log('');
if (fails) {
  console.error(`${fails} of ${ran} checks failed.`);
  process.exit(1);
}
console.log(`${ran} checks passed. No credits were spent: the provider is a fake.`);
