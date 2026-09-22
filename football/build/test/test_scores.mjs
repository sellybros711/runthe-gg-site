/* THE SCOREBOARD'S TWO SOURCES, AND WHAT EACH IS ALLOWED TO SAY.
 *
 *   node football/build/test/test_scores.mjs
 *
 * `supabase/test/nfl_scores_test.sql` drives the WRITE and `check-fantasy.mjs` drives the
 * SCREEN. This is the half in between: the parser that turns a feed into rows, and the rule
 * that decides which source answers for which game.
 *
 * ─── IT IS TESTED AGAINST A SAVED PAYLOAD, AND THE PAYLOAD IS HAND WRITTEN ──────────
 *
 * ESPN cannot be reached from the development sandbox, so `espn_sample.json` is a stand-in
 * rather than a capture, and that limit is worth stating at the top of this file rather
 * than leaving somebody to read a green run as proof the feed works:
 *
 *   PROVED HERE   that a payload of the documented shape is read correctly, that every
 *                 malformed event takes its own game out of the answer and no other, and
 *                 that the fallback covers exactly what the feed did not.
 *   NOT PROVED    that ESPN sends a payload of that shape. Only a live run can say.
 *
 * The one thing that makes that survivable is that the fallback is what the sandbox CAN
 * verify, end to end, against the real schedule: with the feed removed entirely, a week
 * still comes out as sixteen games with the right clubs, the right kickoffs and every
 * finished game's real score. A feed that never works costs a quarter and a clock.
 *
 * ─── AND THE SCHEDULE IS THE REAL ONE ───────────────────────────────────────────────
 *
 * `games.csv` off the build cache, not a fixture. Seven of the sample's nine events carry
 * real 2026 week 3 event ids, so the join is the join that runs in life. A fixture schedule
 * would have proved that two files I wrote agree with each other.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cachedCSV, parseCSVObjects, GAMES_URL } from '../lib.mjs';
import { readEvent, readScoreboard } from '../espn.mjs';
import { weekSlate, slateDays, scoreRows, scoresSQL, buildScores } from '../nfl-scores.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE = path.join(HERE, 'espn_sample.json');

let bad = 0;
const ok = (label, cond) => {
  if (cond) console.log('ok    ' + label);
  else { console.log('FAIL  ' + label); bad++; }
};

const SEASON = 2026, WEEK = 3;
const games = parseCSVObjects(await cachedCSV(GAMES_URL, 'games.csv'));
const slate = weekSlate(games, SEASON, WEEK);

/* ─── 1. the slate ──────────────────────────────────────────────────────────────────── */

ok('a week is sixteen games', slate.length === 16);
ok('one row a game and not one a club',
  new Set(slate.map((g) => g.game_id)).size === slate.length);
ok('and thirty two clubs across them',
  new Set(slate.flatMap((g) => [g.away, g.home])).size === 32);
ok('every game has a kickoff', slate.every((g) => g.kick && Number.isFinite(Date.parse(g.kick))));
ok('and they are in kickoff order',
  slate.every((g, i) => i === 0 || Date.parse(slate[i - 1].kick) <= Date.parse(g.kick)));
/* THE JOIN KEY. Without it the feed cannot be matched to a game at all, and the symptom is
   a scoreboard that never leaves the kickoff times. */
ok('every game carries its espn id', slate.every((g) => g.espn && /^\d+$/.test(g.espn)));

/* A DAY IS NOT A WEEK NUMBER, which is the whole reason the fallback request exists. */
ok('the days are the days it is played',
  slateDays(slate).every((d) => /^\d{8}$/.test(d)) && slateDays(slate).length >= 3);

/* ─── 2. the parser ─────────────────────────────────────────────────────────────────── */

const sample = JSON.parse(fs.readFileSync(SAMPLE, 'utf8'));
const live = readScoreboard(sample);

/* FIVE READABLE OUT OF NINE, and only four of those are games of ours. The parser's job is
   to say what a payload contains; deciding which of them we asked about is the caller's,
   and keeping those two apart is what lets the fallback be about one game at a time. */
ok('five of the nine events are readable', live.size === 5);

const atl = live.get('401872948');
ok('a live game is live', atl && atl.state === 'in');
ok('and its score is read the way ESPN writes it',
  atl && atl.away_score === 7 && atl.home_score === 10);
ok('and its clock comes off the COMPETITION, not the event',
  atl && atl.period === 2 && atl.clock === '3:21');

/* The event's own status on that fixture says "pre, 1st, 15:00" and the competition's says
   "in, 2nd, 3:21". Reading the event's copy is how a board freezes at pre-game all
   afternoon with every other field perfect, so it is asserted rather than assumed. */
ok('so a stale event status does not win', atl && atl.state !== 'pre');

const buf = live.get('401872953');
ok('a game that has not kicked off has no score',
  buf && buf.state === 'pre' && buf.away_score === null && buf.home_score === null);
ok('and no quarter and no clock', buf && buf.period === null && buf.clock === null);

const cle = live.get('401872949');
ok('a final past the fourth is overtime', cle && cle.state === 'post' && cle.overtime === true);
ok('and a final in the fourth is not',
  live.get('401872954') && live.get('401872954').overtime === false);
ok('a final has no clock', cle && cle.period === null && cle.clock === null);

/* EACH OF THESE TAKES ITS OWN GAME OUT AND NOTHING ELSE. The fixture attaches them to real
   week 3 games so the fallback has somewhere to catch them. */
ok('a state nobody draws is dropped', !live.has('401872950'));
ok('a competition with one side is dropped', !live.has('401872951'));
ok('a score that will not parse is dropped', !live.has('401872952'));
ok('an event with no id is dropped', [...live.keys()].every((k) => k !== 'undefined'));
ok('and an event we did not ask about is simply not ours', live.has('999999999'));

ok('readEvent answers null rather than throwing on nothing',
  readEvent(null) === null && readEvent({}) === null && readEvent({ id: 1 }) === null);
ok('and readScoreboard answers an empty map on nothing',
  readScoreboard(null).size === 0 && readScoreboard({ events: 'no' }).size === 0);

/* ─── 3. which source answers ───────────────────────────────────────────────────────── */

const rows = scoreRows(slate, live);
const by = (id) => rows.find((r) => r.game_id === id);

ok('every game gets a row', rows.length === slate.length);
ok('the feed answers the four it could', rows.filter((r) => r.source === 'espn').length === 4);
ok('and the schedule answers the rest',
  rows.filter((r) => r.source !== 'espn').length === 12);

ok('a live game carries the feed\'s clock',
  by('2026_03_ATL_GB').state === 'in' && by('2026_03_ATL_GB').clock === '3:21');

/* THE MALFORMED THREE ARE THE POINT OF THIS SECTION. A half read event must leave its game
   on the schedule's answer rather than putting half a scoreline on the board. */
for (const id of ['2026_03_CIN_PIT', '2026_03_HOU_IND', '2026_03_KC_MIA']) {
  const r = by(id);
  ok(`${id} falls back whole`, r.source !== 'espn' && r.away_score === null
    && r.home_score === null && r.state === 'pre');
}

/* ─── 4. THE NAMES ARE OURS ─────────────────────────────────────────────────────────── */
//
// ESPN writes WSH and LAR where the schedule writes WAS and LA. Nothing in a row may come
// from the feed's idea of a club, because a join by club code silently drops those two
// every week and reads as a pair of byes.

const codes = new Set(rows.flatMap((r) => [r.away, r.home]));
ok('the schedule\'s own codes are what is written',
  codes.has('WAS') && codes.has('LA') && !codes.has('WSH') && !codes.has('LAR'));
ok('and every row names two different clubs', rows.every((r) => r.away !== r.home));

/* ─── 5. the feed never answering at all ────────────────────────────────────────────── */
//
// The verifiable half, and the one this sandbox can be sure of. With no feed, a week is
// still the right sixteen games with the right kickoffs, and every game the schedule has a
// final score for is final.

const alone = scoreRows(slate, new Map());
ok('with no feed there is still a whole slate', alone.length === 16);
ok('and every row still knows when it kicks off', alone.every((r) => r.kick));
ok('and nothing claims a score it does not have',
  alone.every((r) => (r.state === 'post') === (r.away_score != null)));

/* Driven against a week that HAS been played, where `games.csv` carries every final score,
   so the fallback's live half is exercised against real numbers rather than against nulls. */
const played = scoreRows(weekSlate(games, SEASON, 2), new Map());
ok('a week already played comes back final without any feed',
  played.length > 0 && played.every((r) => r.state === 'post'));
ok('with real scores on it',
  played.every((r) => Number.isFinite(r.away_score) && Number.isFinite(r.home_score)));
ok('and the schedule is what says it went to overtime',
  played.every((r) => typeof r.overtime === 'boolean'));

/* ─── 6. the statement ──────────────────────────────────────────────────────────────── */

const sql = scoresSQL(SEASON, WEEK, rows);
ok('one statement for the whole slate',
  sql.split('select public.nfl_put_games').length === 2);
ok('and nothing else in it', !/insert|update |delete/i.test(sql));
ok('the payload survives the round trip',
  JSON.parse(sql.match(/'(\[.*\])'::jsonb/)[1].replace(/''/g, "'")).length === 16);
ok('an empty slate writes no statement', scoresSQL(SEASON, WEEK, []) === '');

/* ─── 7. the whole job, off a file ──────────────────────────────────────────────────── */

const built = await buildScores({ season: SEASON, week: WEEK, games, espnFile: SAMPLE });
ok('buildScores reads a saved payload', built.how === 'file' && built.matched === 4);
ok('and composes the same sixteen rows', built.rows.length === 16);
ok('a week that does not exist is not an error',
  (await buildScores({ season: 1999, week: 99, games })).rows.length === 0);

console.log(bad ? `\n${bad} FAILED` : '\nevery claim passed.');
process.exit(bad ? 1 : 0);
