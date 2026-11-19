/*
 * clock.mjs : WHAT IS DUE NOW, decided in Eastern time. No network, no secrets, so a check can
 * drive it with any instant and any schedule.
 *
 * WHY A CLOCK OUTSIDE GITHUB (the owner's approval, 2026-11-16, Advisor rec 1). GitHub's cron is
 * best effort. The Tuesday 8am Fantasy build first ran at 18:55 and 19:10 UTC on 11-03 and 11-10,
 * the watchdog ran once out of eleven hourly ticks on several Tuesdays, and the live scorer's
 * first Thursday had six firings and ran none. The week opened on time only because the owner
 * pressed Run workflow. Cloudflare's cron triggers run on time, so this Worker wakes the jobs,
 * and the jobs keep their own GitHub crons as a second net. Every one of them is safe to start
 * twice: a catch-up never rebuilds a live week, the watchdog only dispatches a week that is not
 * live, and the live scorer's concurrency group queues a second run behind the first.
 *
 * EASTERN, DECIDED HERE. A cron string is UTC and knows nothing of daylight saving, which is why
 * fantasy-pool.yml lists two entries per slot and asks which one fired. Here the tick is every
 * five minutes and the decision reads the New York wall clock, so a clock change moves nothing.
 */

export const TICK_MIN = 5;

/** The New York wall clock at an instant: weekday (0 Sunday), hour, minute. */
export function eastern(ms) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', minute: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(new Date(ms));
  const get = (t) => parts.find((p) => p.type === t).value;
  const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
  return { dow, h: Number(get('hour')), m: Number(get('minute')) };
}

/* True in the one tick that starts at minute `m` of a matching hour. */
const at = (ny, m) => ny.m >= m && ny.m < m + TICK_MIN;

/*
 * EVERY DISPATCH SAYS `source: clock`, so ci-health can tell the clock's runs from a person
 * pressing Run workflow (QA's rule, 2026-11-16), and every workflow here declares that input.
 *
 * THE JOBS ON THE WALL CLOCK. One list, so the College Football agent can add its own here.
 * `when` is asked of the New York clock; it must be true in exactly one tick per run wanted.
 */
export const WALL_JOBS = [
  /* THE HEARTBEAT, hourly at twenty past, so ci-health can tell a stopped clock from a quiet
     one: every job here also has a GitHub cron behind it, which would keep a dead clock green. */
  { workflow: 'clock-heartbeat.yml', inputs: {}, why: 'the heartbeat',
    when: (ny) => at(ny, 20) },
  /* The week opens Tuesday 8am Eastern (the owner's call, 2026-10-27). Five past, so nflverse's
     overnight refresh has the Monday night game in. catchup: never rebuilds a live week. */
  { workflow: 'fantasy-pool.yml', inputs: { catchup: 'true' }, why: 'the Tuesday build',
    when: (ny) => ny.dow === 2 && ny.h === 8 && at(ny, 5) },
  /* The watchdog's own hours, the same ones fantasy-watchdog.yml lists: hourly Tuesday from
     9am, every two hours Wednesday, and Thursday to the early evening. It dispatches the build
     only if the week is not live, so most of these do nothing. Ten past, the first tick
     after the seven past its own cron uses. */
  { workflow: 'fantasy-watchdog.yml', inputs: {}, why: 'the watchdog',
    when: (ny) => at(ny, 10) && ((ny.dow === 2 && ny.h >= 9)
      || (ny.dow === 3 && ny.h % 2 === 0) || (ny.dow === 4 && ny.h % 2 === 0 && ny.h <= 18)) },

  /* COLLEGE FANTASY (the College Football Agent's). The week opens Monday 11am Eastern, five
     past so Saturday's box scores and the week's lines are in. `write` because a college build
     dispatched without it is a dry run; `catchup` because it must never rebuild a live week
     (cfb-fantasy-pool.yml's guard reads the pointer off main). The same run builds the Playoff
     once the regular season is over and the bracket is set. */
  { workflow: 'cfb-fantasy-pool.yml', inputs: { write: 'true', catchup: 'true' }, why: 'the college Monday build',
    when: (ny) => ny.dow === 1 && ny.h === 11 && at(ny, 5) },
  /* The college watchdog's hours, as cfb-fantasy-watchdog.yml lists them: hourly Monday from
     noon, every two hours Tuesday and Wednesday, Thursday to mid afternoon. Never before Monday
     noon: on Sunday the next week already reads as next. A quarter past, clear of the NFL's. */
  { workflow: 'cfb-fantasy-watchdog.yml', inputs: {}, why: 'the college watchdog',
    when: (ny) => at(ny, 15) && ((ny.dow === 1 && ny.h >= 12)
      || ((ny.dow === 2 || ny.dow === 3) && ny.h % 2 === 0) || (ny.dow === 4 && ny.h % 2 === 0 && ny.h <= 14)) },
];

/*
 * THE LIVE SCORER, woken off the schedule rather than off a weekday: twenty minutes before
 * every kickoff, and once more ten minutes after it in case the first start was lost. Once one
 * run is going it keeps itself awake through the games (fantasy-live.yml), and a run with no
 * game near it exits in about twenty seconds. Kickoffs are UTC instants in nfl_schedule.json,
 * so this half needs no time zone at all.
 */
export const LIVE_OFFSETS_MIN = [-20, 10];

export function liveDue(nowMs, games) {
  const tick = TICK_MIN * 60000;
  const hits = new Set();
  for (const g of games || []) {
    const k = Date.parse(g.k);
    if (!Number.isFinite(k)) continue;
    for (const off of LIVE_OFFSETS_MIN) {
      const t = k + off * 60000;
      if (t <= nowMs && nowMs < t + tick) hits.add(g.k);
    }
  }
  return [...hits].sort();
}

/**
 * Everything due at this instant, each workflow at most once. `cfbKicks` is the college slate's
 * kickoffs (the `kicks` on cfb/data/fantasy/now.json, ISO strings), which wake the college live
 * scorer the same way: twenty minutes before each, and ten after.
 */
export function due(nowMs, games, cfbKicks = []) {
  const ny = eastern(nowMs);
  const out = [];
  for (const j of WALL_JOBS) {
    if (j.when(ny)) out.push({ workflow: j.workflow, inputs: { ...j.inputs, source: 'clock' }, why: j.why });
  }
  const kicks = liveDue(nowMs, games);
  if (kicks.length) {
    out.push({ workflow: 'fantasy-live.yml', inputs: { source: 'clock' }, why: 'kickoff ' + kicks.join(', ') });
  }
  const ckicks = liveDue(nowMs, (cfbKicks || []).map((k) => ({ k })));
  if (ckicks.length) {
    out.push({ workflow: 'cfb-fantasy-live.yml', inputs: { source: 'clock' }, why: 'college kickoff ' + ckicks.join(', ') });
  }
  return out;
}
