/* WHEN TO POLL, AND WHAT THAT COSTS. One definition, two readers.
 *
 * The Worker runs this ladder. fantasy/plan-budget.mjs prices it. They import
 * the same file, so the number printed by the planner is the number the Worker
 * will actually spend, and there is no second copy to drift.
 *
 * That matters more here than it looks. The brief's instruction is that the
 * polling schedule must never be quietly degraded and the output still
 * presented as live. A ladder written in the Worker and a cost model written
 * in a spreadsheet is exactly how that happens: somebody widens an interval to
 * stay inside budget, the spreadsheet is not updated, and the screen goes on
 * claiming a freshness nobody is paying for.
 *
 *
 * HOW THE PROVIDER CHARGES
 * ---------------------------------------------------------------------------
 * The Odds API bills credits as MARKETS x REGIONS per request, not per
 * request. Player props are available only per event, through
 * /v4/sports/{sport}/events/{eventId}/odds, so one request covers one game.
 *
 *   credits for one sweep of one game = markets x regions
 *
 * At six markets in one region that is six credits a game, a sweep. Sixteen
 * games is 96.
 *
 * NOT VERIFIED FROM THIS SANDBOX. api.the-odds-api.com is blocked by the
 * environment's network policy, which is the same split CLAUDE.md records for
 * Basketball-Reference. The rule above is from the provider's documentation as
 * quoted in the brief. fantasy_poll_runs stores the provider's own
 * x-requests-remaining header beside our arithmetic for exactly this reason:
 * the day the two disagree, they are right and this model is wrong, and that
 * disagreement is the only way we would ever find out.
 */

/* The six markets a fantasy projection is actually built from. Cutting this
 * list is the first lever when budget is tight, and it is the one that costs
 * accuracy rather than freshness: drop receptions and a PPR projection stops
 * being a PPR projection. */
export const MARKETS = [
  'player_pass_yds',
  'player_pass_tds',
  'player_rush_yds',
  'player_receptions',
  'player_reception_yds',
  'player_anytime_td',
];

export const REGIONS = ['us'];

/* Hours before kickoff, and how often to look during that window. The brief's
 * ladder, unchanged. `until` is hours before kickoff at which the band ends,
 * so the first band runs from 168 hours out down to 48. */
export const LADDER_FULL = [
  { fromH: 168, untilH: 48, everyMin: 360 },
  { fromH: 48, untilH: 12, everyMin: 30 },
  { fromH: 12, untilH: 3, everyMin: 5 },
  { fromH: 3, untilH: 0, everyMin: 1 },
];

/* What the same idea looks like when the budget will not carry the ladder
 * above. It is NOT the full ladder with the intervals stretched: it keeps
 * minute-scale attention where the information actually arrives and gives up
 * the long tail of the week, because a line six days out moves for nobody.
 *
 * Whether this is honest to ship depends entirely on the screen saying so.
 * Degrading the schedule is a decision; degrading it silently is the failure
 * the brief names. */
export const LADDER_LEAN = [
  { fromH: 72, untilH: 12, everyMin: 360 },
  { fromH: 12, untilH: 4, everyMin: 60 },
  { fromH: 4, untilH: 0, everyMin: 10 },
];

/* How many times one event is swept under a ladder.
 *
 * Math.floor rather than round: a band from 3 hours out to kickoff at one
 * minute apart is 180 looks, not 181. Off by one here is off by one per event
 * per band, which is 64 credits a week on a full slate, and the kind of error
 * that makes a budget model quietly optimistic. */
export function pollsPerEvent(ladder = LADDER_FULL) {
  return ladder.reduce((n, b) => n + Math.floor(((b.fromH - b.untilH) * 60) / b.everyMin), 0);
}

export function creditsPerSweep(markets = MARKETS.length, regions = REGIONS.length) {
  return markets * regions;
}

/* One event, one week, from first look to kickoff. */
export function creditsPerEvent(ladder = LADDER_FULL, markets = MARKETS.length) {
  return pollsPerEvent(ladder) * creditsPerSweep(markets);
}

/* A whole slate. 16 games is a normal NFL week: 32 teams, one bye-free
 * Sunday. It runs 13 to 16 once byes start, so this is the honest upper end
 * rather than an average. */
export function creditsPerWeek(ladder = LADDER_FULL, markets = MARKETS.length, games = 16) {
  return creditsPerEvent(ladder, markets) * games;
}

/* 4.345 rather than 4, because a month is not four weeks and the difference
 * is 8 percent of the bill. */
export const WEEKS_PER_MONTH = 4.345;

export function creditsPerMonth(ladder = LADDER_FULL, markets = MARKETS.length, games = 16) {
  return Math.round(creditsPerWeek(ladder, markets, games) * WEEKS_PER_MONTH);
}

/* How long an allowance lasts, in weeks, under a given plan. Infinity when the
 * plan costs nothing, which only happens if somebody sets markets to zero. */
export function weeksOfRunway(allowance, ladder = LADDER_FULL, markets = MARKETS.length, games = 16) {
  const perWeek = creditsPerWeek(ladder, markets, games);
  return perWeek > 0 ? allowance / perWeek : Infinity;
}

/* ---------------------------------------------------------------------------
 * The decision the Worker makes every minute
 * ------------------------------------------------------------------------ */

/* Should this event be polled right now?
 *
 * Pure, and it takes `now` rather than reading the clock, which is what makes
 * it testable at all. The alternative is a function that can only be checked
 * by waiting, and the whole point of the ladder is behaviour at times that are
 * hours apart.
 *
 * EVERYTHING IS UTC MILLISECONDS. The brief flags timezones as where the bugs
 * will be, and it is right: this is the one place in the system where being an
 * hour out is both easy and completely invisible, because an hour-wrong ladder
 * still polls, still writes, and still looks live. So nothing here parses a
 * date, formats one, or knows what a timezone is. Eastern exists only at the
 * edge, for display.
 *
 * Four answers, not two, and the fourth is the one a two-state version would
 * lose:
 *
 *   poll      it is due
 *   wait      inside a band, polled recently enough
 *   early     further out than the ladder's first band, so not yet watched
 *   closed    kicked off, and never polled again
 *
 * `early` and `wait` both mean "not now" and they mean different things to a
 * reader: early is a game nobody is watching yet, wait is a game being watched.
 * A UI that showed them the same would say a Thursday game is being tracked on
 * the Monday before.
 */
export function pollDecision(event, now, lastPollAt = null, ladder = LADDER_FULL) {
  const kickoff = Number(event.commenceMs ?? event.commence_time_ms ?? NaN);
  if (!Number.isFinite(kickoff)) {
    throw new Error('pollDecision: event needs commenceMs in UTC milliseconds');
  }

  const msOut = kickoff - now;
  if (msOut <= 0) return { action: 'closed', reason: 'kicked off' };

  const hoursOut = msOut / 3600000;

  /* The first band whose window contains this moment. Bands are written
     outermost first, so the first match is the coarsest that applies and the
     last is the tightest. `<=` on fromH and `>` on untilH, so a moment exactly
     on a boundary belongs to the TIGHTER band: at exactly 3 hours out the
     right answer is the one-minute band, not the five-minute one. Written the
     other way the schedule would be one band too slow at every boundary, for
     one tick, which is a bug nobody would ever notice. */
  let band = null;
  for (const b of ladder) {
    if (hoursOut <= b.fromH && hoursOut > b.untilH) { band = b; break; }
  }
  if (!band) return { action: 'early', hoursOut, reason: 'outside the ladder' };

  if (lastPollAt == null) {
    return { action: 'poll', hoursOut, everyMin: band.everyMin, reason: 'never polled' };
  }

  const sinceMin = (now - lastPollAt) / 60000;
  /* A last poll in the FUTURE means a clock disagreement between the Worker
     and the database, and the safe reading is that it was polled. Treating a
     negative gap as "long overdue" would poll every tick and burn the budget
     in an afternoon, which is exactly the failure the cap exists for and not
     one worth reaching. */
  if (sinceMin < 0) return { action: 'wait', hoursOut, everyMin: band.everyMin, sinceMin };
  if (sinceMin >= band.everyMin) {
    return { action: 'poll', hoursOut, everyMin: band.everyMin, sinceMin, reason: 'due' };
  }
  return { action: 'wait', hoursOut, everyMin: band.everyMin, sinceMin };
}

/* Which events to sweep on this tick, cheapest first to decide and in kickoff
 * order to spend. Kickoff order matters when the budget runs out mid-tick: the
 * game about to start is the one whose lines are moving.
 *
 * The cap is a COUNT, not a credit total, and it is a guard against one tick
 * doing something enormous rather than the budget itself. The budget is the
 * database's job, because only the database can be atomic about it. */
export function dueEvents(events, now, lastPollByEvent = {}, ladder = LADDER_FULL, cap = 32) {
  const due = [];
  for (const e of events) {
    const d = pollDecision(e, now, lastPollByEvent[e.event_id] ?? null, ladder);
    if (d.action === 'poll') due.push({ event: e, decision: d });
  }
  due.sort((a, b) => a.event.commenceMs - b.event.commenceMs);
  return due.slice(0, cap);
}
