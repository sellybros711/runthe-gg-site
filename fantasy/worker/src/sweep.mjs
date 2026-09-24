/* One tick of the hot path.
 *
 * Fetch the event list (free), work out what the ladder says is due, and for
 * each due event: charge the budget, call the provider, parse, resolve names,
 * write. Nothing here runs a model, fits a distribution or simulates anything.
 * If a step needs more than arithmetic it belongs in the cold path.
 *
 *
 * EVERY DEPENDENCY IS INJECTED, WHICH IS THE ONLY REASON THIS IS TESTABLE
 * ---------------------------------------------------------------------------
 * The clock, the odds client and the store all arrive as arguments. That is
 * not ceremony: the behaviour worth checking is what happens at 3 hours out
 * against 3 hours and one minute, what happens when the budget refuses, and
 * what happens when the provider returns a 401. None of those can be reached
 * by running the real thing and waiting, and two of them cost real money to
 * reproduce for real.
 *
 *
 * IT STOPS THE WHOLE TICK ON A BUDGET REFUSAL OR A FATAL ERROR
 * ---------------------------------------------------------------------------
 * Not "skips that event and carries on". A refused budget means the allowance
 * is gone and every remaining event would be refused too, so continuing is a
 * loop that does nothing but write failures. A 401 means the key is wrong, and
 * the same request repeated sixteen times is sixteen wrong answers on a
 * provider that may well count them.
 *
 * A single event failing for its own reasons (a timeout, a 500) does NOT stop
 * the tick, because that is one game having a bad moment and the other fifteen
 * are fine.
 */
import { MARKETS, REGIONS, LADDER_LEAN, dueEvents, pollDecision } from '../../lib/schedule.mjs';
import { parseEvents, parseEventOdds, normName } from './parse.mjs';
import { sweepCost } from './odds.mjs';

/* WHICH LADDER SHIPS, AND WHY IT IS THE LEAN ONE TODAY.
 *
 * The full ladder costs 158,506 credits a month and the account has 500. The
 * lean one costs 17,519, which still does not fit, so the Worker also carries
 * a per-tick event cap and the database carries a hard budget.
 *
 * NONE OF THAT IS ALLOWED TO BE INVISIBLE. fantasy/plan-budget.mjs prices
 * whatever is set here, and the screen reads the budget state, so a schedule
 * the allowance cannot carry is a visible fact rather than a quiet
 * degradation. Changing this line changes the printed cost, because the
 * planner imports the same constant. */
export const LADDER = LADDER_LEAN;

/* At most this many events in one tick. A guard against one tick doing
 * something enormous, not a budget: the budget is the database's, because only
 * the database can be atomic about it. Kickoff order, so if the cap or the
 * budget bites, what gets polled is the game about to start. */
export const MAX_EVENTS_PER_TICK = 8;

/* A row that says what happened, when what happened was not a poll.
 *
 * Failures, empty answers and heartbeats all land here. It never throws: a
 * Worker that cannot write its own diagnostics must still try to do its job,
 * and an error raised while recording an error is the least useful exception
 * there is. */
async function note(store, patch, log = () => {}) {
  try {
    const id = await store.openRun({ eventId: null, markets: [], credits: 0 });
    /* SAYING SO IS THE WHOLE DIFFERENCE. Swallowing this in silence is what
       produced 184 clean ticks and an empty table: the row could not be
       written, nothing threw, and the only record of the attempt was the
       attempt. The log is the one channel that does not depend on the table
       this is trying to write. */
    if (id == null) { log({ at: 'sweep.note.unrecorded', patch: patch.raw && patch.raw.stage }); return; }
    await store.closeRun(id, { rows_written: 0, ...patch });
  } catch (e) {
    log({ at: 'sweep.note.threw', error: String(e && e.message || e) });
  }
}

export async function sweepOnce({
  odds, store, now = () => Date.now(), log = () => {},
  season, week,
  markets = MARKETS, regions = REGIONS,
  ladder = LADDER, maxEvents = MAX_EVENTS_PER_TICK,
  observeOnly = false,
}) {
  const t0 = now();
  const summary = {
    startedAt: new Date(t0).toISOString(),
    mode: observeOnly ? 'observe' : 'live',
    due: 0, polled: 0, rows: 0, skipped: 0, closed: 0,
    creditsCharged: 0, wouldHaveCharged: 0, stoppedBecause: null, errors: [],
  };

  /* 1. The event list. Free, so it runs on every tick regardless of what is
        due, and it is what keeps kickoff times current when a game is moved. */
  const evRes = await odds.events();
  if (!evRes.ok) {
    summary.stoppedBecause = `event list failed: ${evRes.error}`;
    log({ at: 'sweep.events.failed', status: evRes.status, error: evRes.error });
    await note(store, {
      ok: false,
      error: `event list failed: ${evRes.status} ${String(evRes.error).slice(0, 300)}`,
      raw: { mode: observeOnly ? 'observe' : 'live', stage: 'events', status: evRes.status },
    }, log);
    return summary;
  }
  const { events, skipped: evSkips } = parseEvents(evRes.body, season, week);
  if (evSkips.length) log({ at: 'sweep.events.skipped', count: evSkips.length, sample: evSkips[0] });

  /* A VALID RESPONSE WITH NOTHING IN IT IS NOT A QUIET WEEK. The provider
     returns an empty array in the offseason, and it also returns one if the
     sport key changes under us. They are told apart by nothing in the payload,
     so it is logged as a distinct event rather than being indistinguishable
     from a normal tick with no games due. */
  if (!events.length) {
    summary.stoppedBecause = 'the provider listed no events';
    log({ at: 'sweep.events.empty', raw: Array.isArray(evRes.body) ? evRes.body.length : 'not an array' });
    await note(store, {
      ok: false,
      error: 'the provider listed no events',
      raw: {
        mode: observeOnly ? 'observe' : 'live',
        stage: 'events',
        returned: Array.isArray(evRes.body) ? evRes.body.length : typeof evRes.body,
        skipped: evSkips.slice(0, 5),
      },
    }, log);
    return summary;
  }
  await store.upsertEvents(events);

  /* 2. Anything that has kicked off stops being polled, for good. */
  const t = now();
  const closed = events
    .filter((e) => pollDecision(e, t, null, ladder).action === 'closed')
    .map((e) => e.event_id);
  if (closed.length) {
    await store.closeEvents(closed);
    summary.closed = closed.length;
  }

  /* 3. What the ladder says is due. */
  const lastPoll = await store.lastPollByEvent();
  const live = events.filter((e) => !closed.includes(e.event_id));
  const due = dueEvents(live, t, lastPoll, ladder, maxEvents);
  summary.due = due.length;
  if (!due.length) {
    log({ at: 'sweep.nothing.due', events: live.length });
    /* A HEARTBEAT, four times an hour, on the quarter.
    
       A quiet tick is the normal state: most minutes have nothing due, and
       writing a row for each would be 1,440 a day saying nothing happened.
       Writing NONE is worse, and this is the mistake the first version made: a
       database with no rows in it reads identically whether the Worker is
       ticking happily with nothing to do or is not running at all. Those are
       the two states somebody checking on a Sunday morning most needs to tell
       apart.
    
       Stateless, on the minute, so it needs no read to decide and lands
       exactly four times an hour however many Workers are ticking. */
    const min = new Date(t).getUTCMinutes();
    if (min % 15 === 0) {
      await note(store, {
        ok: true,
        error: null,
        raw: {
          mode: observeOnly ? 'observe' : 'live',
          stage: 'heartbeat',
          eventsLive: live.length,
          nextKickoff: live.length
            ? new Date(Math.min(...live.map((e) => e.commenceMs))).toISOString()
            : null,
        },
      }, log);
    }
    return summary;
  }

  /* OBSERVE MODE STOPS HERE, and stopping HERE rather than earlier is the
     whole point of it.
     
     Everything above this line is free: the event list costs no credits and
     the ladder is arithmetic. So an observe tick does the entire decision, on
     real events with real kickoff times, and reports exactly what it would
     have spent and on what. What it skips is only the part that costs money.
     
     A mode that stopped at the top would tell you the Worker is alive and
     nothing else. This one tells you the schedule is right BEFORE the first
     credit is spent, which on a 500 credit allowance is the difference between
     finding out now and finding out on a Sunday morning. */
  const cost = sweepCost(markets, regions);
  if (observeOnly) {
    summary.wouldHaveCharged = due.length * cost;

    /* A DURABLE RECORD, not just a log line, on the quarter hour.

       The first version of observe mode wrote nothing and said so: "the log is
       the whole record until it goes live." That is true and it is useless to
       anybody who cannot reach the Worker's log, which includes every tool
       that can read the database. An observation nobody can retrieve is not an
       observation.

       event_id is null, which keeps it out of lastPollByEvent()'s answer: that
       function reads runs per event to decide what is due, and an observe row
       must never make the ladder think an event was polled.

       AND THAT NULL IS WHY THE FIRST GUARD HERE COULD NEVER FIRE. It was
       `if (due.length)`, with a comment saying a row a minute for a week is
       ten thousand rows saying nothing happened. In observe mode the plan is
       NEVER empty: nothing is ever recorded against an event, so the ladder
       finds every event never polled, so every event is due, on every tick,
       for ever. The condition was written as though it were about a quiet
       week and it is about a mode that has no quiet ticks by construction.
       Measured after two and a half days: 3,268 rows, one a minute, which is
       exactly the number the comment forbade.

       So it lands on the quarter, the same stateless rule the heartbeat uses,
       and for the same reason: no read to decide, four an hour however the
       ticks fall. 96 rows a day rather than 1,440. What that costs is up to
       fifteen minutes of delay before a game moving into a tighter band shows
       up here, which is nothing against a ladder whose fastest rung is ten
       minutes, and the Worker log still carries every tick. */
    const observeMin = new Date(t).getUTCMinutes();
    if (due.length && observeMin % 15 === 0) {
      const runId = await store.openRun({
        eventId: null, markets: [], credits: 0,
      }).catch(() => null);
      /* NOT SILENTLY, which is what this line was for a whole evening. */
      if (runId == null) log({ at: 'sweep.observe.unrecorded' });
      await store.closeRun(runId, {
        ok: true,
        rows_written: 0,
        error: null,
        raw: {
          mode: 'observe',
          wouldHaveCharged: summary.wouldHaveCharged,
          creditsPerSweep: cost,
          eventsLive: live.length,
          plan: due.map(({ event, decision }) => ({
            event: event.event_id,
            matchup: `${event.away_team} at ${event.home_team}`,
            kickoff: event.commence_time,
            hoursOut: Number(decision.hoursOut.toFixed(2)),
            everyMin: decision.everyMin,
          })),
        },
      });
    }

    log({
      at: 'sweep.observe',
      wouldPoll: due.map(({ event, decision }) => ({
        event: event.event_id,
        matchup: `${event.away_team} at ${event.home_team}`,
        kickoff: event.commence_time,
        hoursOut: Number(decision.hoursOut.toFixed(2)),
        everyMin: decision.everyMin,
        why: decision.reason,
      })),
      wouldHaveCharged: summary.wouldHaveCharged,
      creditsPerSweep: cost,
      eventsLive: live.length,
    });
    summary.ms = now() - t0;
    return summary;
  }

  /* The crosswalk, once for the tick rather than per event. */
  let aliases = new Map();
  try { aliases = await store.aliases(); } catch (e) {
    log({ at: 'sweep.aliases.failed', error: String(e.message || e) });
  }

  /* 4. The expensive part. */
  for (const { event, decision } of due) {
    /* THE RUN ROW IS OPENED FIRST, AND NOT BEING ABLE TO OPEN ONE STOPS THE
       TICK. Written the other way round this is a money leak, and it is not a
       small one.

       lastPollByEvent() reads this table to decide what is due. A poll that
       spends six credits and writes no run row is a poll the ladder cannot
       see, so the next tick finds the same event never polled and polls it
       again, and the tick after that, once a minute at six credits each. The
       whole 500 credit allowance goes in under ninety minutes, on one game,
       while every tick reports success. That is the state the database was
       actually in tonight: the run row could not be written, and the only
       reason nothing was spent is that the mode happened to be observe.

       Opening first also means a refusal costs nothing at all rather than
       burning a charge against a poll that never happens. The charge still
       lands BEFORE the request, which is the rule that matters: it stops every
       event in this loop passing a check none of them had been counted
       against. */
    const runId = await store.openRun({
      eventId: event.event_id, markets, credits: cost,
    }).catch(() => null);
    if (runId == null) {
      summary.stoppedBecause = 'could not open a run row, so nothing was polled';
      log({ at: 'sweep.openRun.failed', event: event.event_id });
      break;
    }

    let budget;
    try {
      budget = await store.spend(cost);
    } catch (e) {
      summary.stoppedBecause = `budget check failed: ${e.message || e}`;
      log({ at: 'sweep.budget.error', error: String(e.message || e) });
      /* CREDITS BACK TO ZERO ON THE ROW. It was opened claiming the cost of a
         poll that is not going to happen, and a table that says six credits
         were charged for a request nobody made is a table the cap cannot be
         trusted against. */
      await store.closeRun(runId, {
        ok: false, credits_charged: 0,
        error: `budget check failed: ${String(e.message || e).slice(0, 300)}`,
      });
      break;
    }
    if (!budget.allowed) {
      summary.stoppedBecause = `credit cap reached: ${budget.used} of ${budget.cap}`;
      log({ at: 'sweep.budget.refused', used: budget.used, cap: budget.cap });
      /* AND THE CAP BITING IS NOW IN THE TABLE. Before this it was in the
         Worker log alone, so a poller stopped dead by its own allowance looked
         from the database exactly like a poller that was not running. */
      await store.closeRun(runId, {
        ok: false, credits_charged: 0,
        error: `credit cap reached: ${budget.used} of ${budget.cap}`,
      });
      break;
    }
    summary.creditsCharged += cost;

    const res = await odds.eventOdds(event.event_id, markets, regions);
    await store.observe(res.usage);

    if (!res.ok) {
      summary.errors.push({ event: event.event_id, status: res.status, error: res.error });
      await store.closeRun(runId, {
        ok: false, http_status: res.status, error: String(res.error).slice(0, 500),
        vendor_remaining: res.usage.remaining, vendor_used: res.usage.used,
      });
      log({ at: 'sweep.event.failed', event: event.event_id, status: res.status, fatal: res.fatal });
      /* Fatal means the key or the request shape is wrong, which will be just
         as wrong for the next fifteen events. */
      if (res.fatal) {
        summary.stoppedBecause = `fatal from the provider: ${res.status}`;
        break;
      }
      continue;
    }

    const capturedAt = new Date(now()).toISOString();
    const { rows, skipped } = parseEventOdds(res.body, {
      capturedAt, season, week, pollId: runId,
    });

    /* Resolve names against the crosswalk. An unresolved name still gets its
       quote STORED, with player_id null, because throwing the data away is how
       you end up unable to backfill once somebody works out who it was. */
    const unmatched = [];
    for (const r of rows) {
      const id = aliases.get(r.player_name_norm);
      if (id) r.player_id = id;
      else {
        unmatched.push({
          name_raw: r.player_name_raw, name_norm: r.player_name_norm,
          market: r.market, event_id: r.event_id,
        });
      }
    }

    /* A PARSE THAT FINDS NOTHING AND SKIPS NOTHING IS A SCHEMA CHANGE, not a
       quiet market. It is recorded as an error on the run rather than as a
       successful sweep of zero rows, because the second is what a provider
       renaming a field looks like and it would otherwise never be noticed. */
    const empty = rows.length === 0 && skipped.length === 0;
    if (empty) {
      summary.errors.push({ event: event.event_id, error: 'parsed nothing at all' });
      log({ at: 'sweep.parse.empty', event: event.event_id });
    }

    try {
      await store.insertSnapshots(rows);
      if (unmatched.length) await store.recordUnmatched(unmatched);
    } catch (e) {
      summary.errors.push({ event: event.event_id, error: String(e.message || e) });
      await store.closeRun(runId, {
        ok: false, error: String(e.message || e).slice(0, 500), rows_written: 0,
        vendor_remaining: res.usage.remaining, vendor_used: res.usage.used,
      });
      log({ at: 'sweep.write.failed', event: event.event_id, error: String(e.message || e) });
      continue;
    }

    await store.closeRun(runId, {
      ok: !empty,
      http_status: res.status,
      rows_written: rows.length,
      vendor_remaining: res.usage.remaining,
      vendor_used: res.usage.used,
      error: empty ? 'parsed nothing at all' : null,
      raw: res.body,
    });

    summary.polled += 1;
    summary.rows += rows.length;
    summary.skipped += skipped.length;
    log({
      at: 'sweep.event.ok', event: event.event_id, rows: rows.length,
      skipped: skipped.length, unmatched: unmatched.length,
      hoursOut: Number(decision.hoursOut.toFixed(2)),
      creditsLeft: budget.left,
    });
  }

  summary.ms = now() - t0;
  return summary;
}

export { normName };
