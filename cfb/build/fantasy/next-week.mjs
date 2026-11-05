/* WHICH COLLEGE WEEK IS ABOUT TO BE PLAYED?
 *
 *   node cfb/build/fantasy/next-week.mjs
 *   node cfb/build/fantasy/next-week.mjs --season 2026
 *
 * Prints `2026 11` and, under GitHub Actions, writes `season` and `week` to $GITHUB_OUTPUT.
 * The answer is pool.mjs's own `nextWeek`, so the watchdog, the build's guard and the build
 * itself can never disagree about which week is next.
 *
 * THREE ENDINGS, AND THEY MEAN DIFFERENT THINGS:
 *   0   a week to build, printed.
 *   2   the season is over (no week left with a slate in it). Nothing to watch.
 *   1   anything else, ESPN unreachable above all. That fails the run on purpose: read as
 *       "season over", a dropped connection would hide the one week the watchdog is for.
 */
import fs from 'node:fs';
import { nextWeek } from './pool.mjs';
import { scoreboardWeek } from './espn.mjs';

const arg = (flag) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1].trim() : '';
};

/* AN UNREADABLE SCOREBOARD IS "COULD NOT TELL", NEVER "SEASON OVER". espn.mjs answers null
   when every host fails rather than throwing, and nextWeek reads a null week 1 as an empty
   calendar and a null later week as a week with no slate. Either way a dropped connection
   would come out as the season over, or as the wrong week. So every fetch is watched, and one
   null anywhere fails the run. */
const unread = [];
const watched = async (season, week) => {
  const r = await scoreboardWeek(season, week);
  if (!r) unread.push(week);
  return r;
};

const season = Number(arg('--season') || new Date().getUTCFullYear());
let week;
try {
  week = await nextWeek(season, Date.now(), watched);
} catch (e) {
  const msg = String((e && e.message) || e);
  if (unread.length) {
    console.error(`could not read the scoreboard for week ${unread.join(', ')}: ${msg}`);
    process.exit(1);
  }
  if (/no week with a slate/.test(msg)) {
    console.log(`no week to build: ${msg}`);
    process.exit(2);
  }
  console.error(`could not work out the next week: ${msg}`);
  process.exit(1);
}

if (unread.length) {
  console.error(`could not read the scoreboard for week ${unread.join(', ')}, so week ${week} may be wrong`);
  process.exit(1);
}
console.log(`${season} ${week}`);
if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `season=${season}\nweek=${week}\n`);
}
