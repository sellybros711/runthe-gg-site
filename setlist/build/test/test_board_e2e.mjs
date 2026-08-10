/* board.js against the real segue_submit_run(), through a stand-in for PostgREST.
 *
 *   node setlist/build/test/postgrest_stub.mjs 5556 seguetest &
 *   node setlist/build/test/test_board_e2e.mjs http://localhost:5556
 *
 * WHAT THIS IS FOR. test_leaderboard.sql proves the FUNCTION refuses what it
 * should. This proves the seam either side of it: that board.js builds the URLs
 * and payloads the server actually understands, that a rejection comes back as a
 * readable lastError rather than a silent null, and that a submit which cannot
 * land still leaves a caller with a true rank instead of a made-up one.
 *
 * board.js is a plain script, not a module, so it is loaded by giving it a
 * `window` and importing it for its side effect. Same trick cfb's parity test uses.
 */
const BASE = process.argv[2] || 'http://localhost:5556';
const ALICE = '11111111-1111-1111-1111-111111111111';

global.window = { SEGUE_BOARD_URL: BASE };
/* THE TOKEN IS THE WHOLE OF AUTH HERE. The stub reads the bearer as auth.uid(),
   so swapping this is how a test signs in and out. */
let TOKEN = null;
global.window.SEGUE_AUTH = { token: () => TOKEN };
await import('../../board.js');
const B = global.window.SEGUE_BOARD;

let failures = 0;
const ok = (name, cond, extra) => {
  if (!cond) failures++;
  console.log(`  ${cond ? 'ok  ' : 'FAIL'}  ${name}${extra ? '   ' + extra : ''}`);
};

/* A coherent show. Seven songs, 858 points: 500 + 180 + 60 and four breadth
   cards worth 34, 32, 26 and 26. Same fixture the SQL suite uses, so a change to
   the card values breaks both. */
const show = (over) => Object.assign({
  band: 'goose', total: 858, songPts: 500, timePts: 180, flowPts: 60,
  breadthPts: 118, cards: ['cover', 'bustout', 'jamchart', 'bigjam'],
  bestTotal: 1200, songs: 7, segues: 2, sandwiches: 1, covers: 1, jamcharts: 1,
  bustouts: 1, cooldowns: 1, longestSec: 1400, respins: 0, secondsUsed: 8000,
  shows: ['e1', 'e2', 'e3'],
  picks: ['e1:a', 'e1:b', 'e1:c', 'e2:d', 'e2:e', 'e2:f', 'e3:g'],
}, over || {});

/* A NONCE PER RUN, so the suite is re-runnable against the same database.
   segue_submit_run() swallows a repeat of the same picks at the same score
   inside a minute, which is exactly right in production and would otherwise make
   a second run of this file compare against rows the first one left behind: the
   claim case in particular would be handed an already-owned show and read as a
   failure that is really just yesterday's success. */
const RUN = Date.now().toString(36);
const uniq = (n) => ({ picks: Array.from({ length: 7 }, (_, i) => `u${RUN}${n}:${i}`) });

console.log('\nsubmitting');
TOKEN = null;
const guestId = await B.submit(show(uniq(1)));
ok('a guest show records', typeof guestId === 'number', guestId);
ok('and reports no error', B.lastError === null);
ok('and the board is not marked offline', B.offline === false);

TOKEN = ALICE;
const mineId = await B.submit(show(uniq(2)));
ok('a signed-in show records', typeof mineId === 'number', mineId);

console.log('\na payload the server refuses');
const bad = await B.submit(show(Object.assign(uniq(3), { total: 9999 })));
ok('a submit that does not add up returns null', bad === null);
ok('and keeps the server\'s own words', /not the sum of its parts/.test(
  (B.lastError && B.lastError.message) || ''), B.lastError && B.lastError.message);
/* A 4xx IS NOT RETRIED, which is the difference between a rejected payload and a
   dropped request. Nothing to assert on the wire from here, but the run above
   returning promptly rather than after three backoffs is the observable half. */

console.log('\nreading the board');
B._forceOffline && null;   // not used here; the flag is checked below on its own
const rows = await B.top({ band: 'goose', named: true }, 10, 'score', 'desc');
ok('the board reads', Array.isArray(rows), rows && rows.length + ' rows');
ok('and lists only named shows', (rows || []).every(r => r.display_name));
/* NOT A LITERAL NAME. The name lives in profiles and test_leaderboard.sql has a
   rename case that legitimately changes it, so asserting a spelling here makes
   this suite depend on whether that one ran. What is actually under test is that
   the SERVER put a name on the row: the client never sends one, so a non-empty
   name can only have come out of profiles. */
const MY_NAME = (rows || []).map(r => r.display_name).find(Boolean);
ok('the row carries a name the client never sent', !!MY_NAME, MY_NAME);

const byPct = await B.top({ band: 'goose', named: true }, 10, 'pct', 'desc');
ok('the percentage board reads', Array.isArray(byPct));
ok('and skips shows with no ceiling on them',
  (byPct || []).every(r => r.pct_of_best !== null));

const asc = await B.top({ band: 'goose', named: true }, 10, 'score', 'asc');
ok('the reversed board reads', Array.isArray(asc));
if (rows && asc && rows.length > 1) {
  ok('and is genuinely the other way round',
    asc[0].total <= rows[0].total);
}

console.log('\nranking');
const place = await B.placeIn({ band: 'goose', named: true }, 'score', 858);
ok('a place comes back', typeof place === 'number', '#' + place);
const tot = await B.total({ band: 'goose' });
ok('a total comes back', typeof tot === 'number', tot + ' shows');
/* THE COUNT INCLUDES GUEST SHOWS AND THE LIST DOES NOT, which is the difference
   between "how many shows were drafted" and "who is on the board". */
const named = await B.total({ band: 'goose', named: true });
ok('the named count is not the whole count', named <= tot, `${named} of ${tot}`);

const r3 = await B.ranks('goose', 'score', 858);
ok('all three windows answer', r3 && r3.day && r3.week && r3.all);
ok('today is inside this week', r3.day.total <= r3.week.total);
ok('this week is inside all time', r3.week.total <= r3.all.total);

console.log('\nanother band is another board');
await B.submit(show(Object.assign(uniq(4), { band: 'phish' })));
const gooseTotal = await B.total({ band: 'goose' });
const phishTotal = await B.total({ band: 'phish' });
ok('each band counts only its own', gooseTotal !== phishTotal,
  `goose ${gooseTotal}, phish ${phishTotal}`);

console.log('\nclaiming the show you played as a guest');
TOKEN = null;
const orphan = await B.submit(show(uniq(5)));
TOKEN = ALICE;
ok('a guest show can be claimed', (await B.claim(orphan)) === true);
ok('and cannot be claimed twice', (await B.claim(orphan)) === false);

console.log('\nyour own history');
const mine = await B.mine(ALICE, 500);
ok('the history reads', mine && Array.isArray(mine.rows), mine && mine.rows.length + ' rows');
ok('and every row is under the one name', (mine.rows || []).every(r => r.display_name === MY_NAME));
ok('and reports a real total', typeof mine.total === 'number');
ok('a history with no user id is null', (await B.mine(null)) === null);

console.log('\nthe shows you were at');
TOKEN = ALICE;
const a1 = await B.syncAttended('goose', ['777', '888']);
ok('a sync stores and returns', Array.isArray(a1) && a1.includes('777') && a1.includes('888'));
const a2 = await B.syncAttended('goose', ['999']);
ok('a later sync merges rather than replaces',
  a2.includes('777') && a2.includes('888') && a2.includes('999'));
ok('unmarking is its own call', (await B.forgetAttended('goose', '888')) === true);
const a3 = await B.syncAttended('goose', []);
ok('and the show is gone', !a3.includes('888'));
ok('while the others stayed', a3.includes('777') && a3.includes('999'));

TOKEN = null;
ok('a guest gets nothing back', (await B.syncAttended('goose', ['1'])) === null);

console.log('\nthe probe');
const p = await B.probe();
ok('the read half answers', p.read && p.read.ok === true);
ok('the write half is refused for the right reason', p.write && p.write.healthy === true,
  p.write && p.write.message);

console.log('\nfailing soft');
global.window.SEGUE_BOARD_URL = 'http://127.0.0.1:1';   // nothing listening
ok('an unreachable board returns null rather than throwing',
  (await B.top({ band: 'goose' }, 10, 'score', 'desc')) === null);
ok('and says so', B.offline === true);
ok('and keeps a reason worth reading', !!(B.lastError && B.lastError.message),
  B.lastError && B.lastError.message);

console.log(`\n${failures ? failures + ' check(s) failed' : 'all checks passed'}`);
process.exit(failures ? 1 : 0);
