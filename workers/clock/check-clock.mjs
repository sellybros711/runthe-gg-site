/*
 * check-clock.mjs : the clock starts each job exactly when it should, on both sides of a clock
 * change, through Thanksgiving and Christmas, off the site's real schedule.
 *
 *   node workers/clock/check-clock.mjs
 *
 * Walks every five minute tick of a span and counts what clock.mjs says is due. No network.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { due, eastern, TICK_MIN } from './clock.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const games = JSON.parse(fs.readFileSync(path.join(ROOT, 'football/data/nfl_schedule.json'), 'utf8')).games;

let fails = 0;
const ok = (label, cond, extra) => {
  if (!cond) fails++;
  console.log('  ' + (cond ? 'ok  ' : 'FAIL') + '  ' + label + (extra ? '   ' + extra : ''));
};
const STEP = TICK_MIN * 60000;
const walk = (fromIso, toIso, gs = games) => {
  const out = [];
  for (let t = Date.parse(fromIso); t < Date.parse(toIso); t += STEP) {
    for (const d of due(t, gs)) out.push({ t, ...d });
  }
  return out;
};
const iso = (t) => new Date(t).toISOString().slice(0, 16) + 'Z';

console.log('\nTHE TUESDAY BUILD, ON EACH SIDE OF THE CLOCK CHANGE');
for (const [day, utc] of [['2026-10-27', '12:05'], ['2026-11-03', '13:05'], ['2026-11-24', '13:05']]) {
  const builds = walk(day + 'T00:00:00Z', day + 'T23:59:00Z').filter((d) => d.workflow === 'fantasy-pool.yml');
  ok(`${day}: one build, at 8:05 Eastern (${utc} UTC)`,
    builds.length === 1 && iso(builds[0].t) === `${day}T${utc}Z` && builds[0].inputs.catchup === 'true',
    builds.map((b) => iso(b.t)).join(', '));
}
const week = walk('2026-11-16T05:00:00Z', '2026-11-23T05:00:00Z');
ok('one build a week, and only on a Tuesday', week.filter((d) => d.workflow === 'fantasy-pool.yml').length === 1);

console.log('\nTHE WATCHDOG, ON ITS OWN HOURS');
const dogs = week.filter((d) => d.workflow === 'fantasy-watchdog.yml').map((d) => eastern(d.t));
ok('Tuesday 9am to 11pm Eastern, hourly: 15', dogs.filter((e) => e.dow === 2).length === 15);
ok('Wednesday every two hours: 12', dogs.filter((e) => e.dow === 3).length === 12);
ok('Thursday every two hours to 6pm: 10', dogs.filter((e) => e.dow === 4).length === 10);
ok('never on another day', dogs.every((e) => e.dow >= 2 && e.dow <= 4));
ok('always at ten past', dogs.every((e) => e.m === 10));

console.log('\nTHE LIVE SCORER, OFF THE SCHEDULE');
const wk12 = games.filter((g) => g.s === 2026 && g.w === 12 && g.t === 'REG');
const wk16 = games.filter((g) => g.s === 2026 && g.w === 16 && g.t === 'REG');
ok('the schedule has week 12 and week 16 of 2026', wk12.length > 0 && wk16.length > 0,
  `${wk12.length} and ${wk16.length} games`);
for (const [label, gs, from, to] of [
  ['Thanksgiving week', wk12, '2026-11-25T00:00:00Z', '2026-12-02T12:00:00Z'],
  ['Christmas week', wk16, '2026-12-23T00:00:00Z', '2026-12-30T12:00:00Z'],
]) {
  const kicks = [...new Set(gs.map((g) => g.k))];
  const lives = walk(from, to, gs).filter((d) => d.workflow === 'fantasy-live.yml');
  const woken = kicks.filter((k) => lives.some((d) => d.t === Date.parse(k) - 20 * 60000));
  ok(`${label}: woken 20 minutes before every one of ${kicks.length} kickoffs`, woken.length === kicks.length,
    kicks.filter((k) => !woken.includes(k)).join(', '));
  ok(`${label}: and once more 10 minutes after each`, lives.length === kicks.length * 2,
    `${lives.length} wakes for ${kicks.length} kickoffs`);
}
const wed = wk12.filter((g) => eastern(Date.parse(g.k)).dow === 3);
ok('the Thanksgiving Eve game is one of them', wed.length >= 1,
  wed.map((g) => g.a + ' at ' + g.h + ' ' + g.k).join(', '));
ok('a week with no games wakes nothing', walk('2026-11-16T05:00:00Z', '2026-11-23T05:00:00Z', [])
  .every((d) => d.workflow !== 'fantasy-live.yml'));

console.log('\nTHE HEARTBEAT, AND WHO STARTED IT');
const beats = week.filter((d) => d.workflow === 'clock-heartbeat.yml');
ok('the heartbeat beats every hour: 168 a week', beats.length === 168, `${beats.length}`);
ok('every dispatch says source: clock', walk('2026-11-24T00:00:00Z', '2026-11-28T00:00:00Z')
  .every((d) => d.inputs.source === 'clock'));
const offWeek = games.filter((g) => g.s === 2026 && g.w === 9 && g.t === 'REG');
ok('a published schedule with no game that week wakes the live scorer for nothing',
  walk('2026-11-16T05:00:00Z', '2026-11-23T05:00:00Z', offWeek).every((d) => d.workflow !== 'fantasy-live.yml'),
  `${offWeek.length} games of another week`);
for (const f of ['fantasy-pool', 'fantasy-watchdog', 'fantasy-live', 'clock-heartbeat']) {
  const y = fs.readFileSync(path.join(ROOT, '.github/workflows', f + '.yml'), 'utf8');
  ok(`${f}.yml declares the source input (GitHub refuses an undeclared one)`, /\n      source:\n/.test(y));
}

console.log('\nTHE WORKER CALLS GITHUB THE WAY GITHUB WANTS');
{
  const calls = [];
  globalThis.fetch = async (url, opts = {}) => {
    calls.push({ url: String(url), opts });
    if (String(url).includes('nfl_schedule.json')) return new Response(JSON.stringify({ games }), { status: 200 });
    return new Response(null, { status: 204 });
  };
  const { tick } = await import('./index.mjs');
  const done = await tick({ GH_TOKEN: 'test-token' }, Date.parse('2026-11-24T13:05:00Z'));
  const d = calls.find((c) => c.url.includes('/dispatches'));
  ok('Tuesday 8:05 Eastern starts the build (and the heartbeat is not due)', done.length === 1 && /fantasy-pool\.yml.*204/.test(done[0]), done.join(' | '));
  ok('on main, with catchup, through the dispatch API', !!d
    && d.url === 'https://api.github.com/repos/sellybros711/runthe-gg-site/actions/workflows/fantasy-pool.yml/dispatches'
    && JSON.parse(d.opts.body).ref === 'main' && JSON.parse(d.opts.body).inputs.catchup === 'true'
    && JSON.parse(d.opts.body).inputs.source === 'clock');
  ok('with the token and the headers GitHub requires', !!d && d.opts.headers.Authorization === 'Bearer test-token'
    && !!d.opts.headers['User-Agent'] && d.opts.method === 'POST');
  calls.length = 0;
  const none = await tick({ GH_TOKEN: 'x' }, Date.parse('2026-11-17T03:00:00Z'));
  ok('a quiet tick starts nothing', none.length === 0 && !calls.some((c) => c.url.includes('/dispatches')));
}

console.log(fails ? `\n${fails} FAILED` : '\nall ok');
process.exit(fails ? 1 : 0);
