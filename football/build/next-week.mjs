/* WHICH WEEK IS ABOUT TO BE PLAYED?
 *
 *   node football/build/next-week.mjs
 *   node football/build/next-week.mjs --week 5
 *
 * Prints `2026 5` and, under GitHub Actions, writes `season` and `week` to $GITHUB_OUTPUT.
 *
 * ASKED OF THE SCHEDULE, NOT OF THE CALENDAR. The earliest week of the current season in
 * which NOT ONE game has been played is the week about to be played. Counting weeks from a
 * start date is the obvious alternative and it is wrong every time a game is postponed,
 * flexed, or played on a Friday or a Saturday in December.
 *
 * NOT-ONE-PLAYED RATHER THAN ANY-UNPLAYED, and the difference is a game that gets moved. A
 * week with one postponement in it has an unplayed game in it for as long as the
 * postponement lasts, so "the first week with an unplayed game" would stop on that week and
 * rebuild the same board every Tuesday until somebody noticed. A week nobody has played is
 * unambiguous.
 *
 * `home_score` IS BLANK FOR A GAME NOT YET PLAYED, and `Number('')` is 0 rather than NaN,
 * which is why scoreOf() exists instead of a bare Number(). Read the naive way, every
 * future game looks like a nil-nil draw that has already happened, the season reads as
 * finished in September, and the job exits saying so.
 *
 * THE SEASON IS THE LATEST ONE IN THE FILE, and not the calendar year, because the league
 * year turns over in September and the file is the thing that knows.
 *
 * IF EVERY GAME HAS A RESULT the season is over, and this says so and exits non-zero rather
 * than building week 18 again every Tuesday until somebody notices.
 */

import { cachedCSV, parseCSVObjects, GAMES_URL } from './lib.mjs';
import fs from 'fs';

const arg = (flag) => {
  const i = process.argv.indexOf(flag);
  const v = i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : '';
  return v.trim();
};

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
/* A score, or null when the game has not been played. Blank is the schedule's way of
   saying "no result", and it must not read as zero. */
const scoreOf = (v) => (String(v == null ? '' : v).trim() === '' ? null : num(v));
const played = (g) => scoreOf(g.home_score) != null && scoreOf(g.away_score) != null;

const games = parseCSVObjects(await cachedCSV(GAMES_URL, 'games.csv'))
  .filter((g) => !g.game_type || g.game_type === 'REG');
if (!games.length) { console.error('no regular season games in the schedule'); process.exit(1); }

const season = Math.max(...games.map((g) => num(g.season) || 0));
const mine = games.filter((g) => num(g.season) === season);

const asked = num(arg('--week'));
let week = asked;
if (!week) {
  const weeks = [...new Set(mine.map((g) => num(g.week)))].filter((w) => w).sort((a, b) => a - b);
  const fresh = weeks.filter((w) => !mine.some((g) => num(g.week) === w && played(g)));
  if (!fresh.length) {
    console.error(`every week of ${season} has been started. `
      + 'The season is over, so there is no week to build.');
    process.exit(1);
  }
  week = fresh[0];
}

const inWeek = mine.filter((g) => num(g.week) === week);
if (!inWeek.length) {
  console.error(`${season} has no week ${week}`);
  process.exit(1);
}

console.log(`${season} ${week}   (${inWeek.length} games)`);
if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `season=${season}\nweek=${week}\n`);
}
