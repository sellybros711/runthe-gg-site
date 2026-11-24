/* The league the career checks play: a frozen copy of the rosters and ratings.
 *
 * A new career joins today's real rosters (hoops/data/rosters.json, rewritten
 * by the roster workflow every Monday) and that stays the game's rule. The
 * checks do not follow it. Every weekly refresh reshuffled which of their
 * sample careers met a rare card, ending or way out, and four times a refresh
 * turned hoops-checks red with no change to the game (2026-10-19 to 11-09).
 * The owner's call (2026-11-24): the refresh moves the draft modes and new
 * careers, never the checks. So check-career, check-story, sim-career and
 * check-economy read build/fixtures/league/, frozen from data/ on 2026-11-24.
 * check-rosters still reads the live file: it is the check of the file.
 *
 * RE-FREEZE when the data rolls to a new season (players.json gains a year):
 * copy data/rosters.json and data/ratings.json over the two files here. This
 * throws rather than let seedLeague drop a stale roster season in silence.
 */
import fs from 'node:fs';

const DIR = new URL('./fixtures/league/', import.meta.url);
const read = (f) => JSON.parse(fs.readFileSync(new URL(f, DIR), 'utf8'));

export const CHECK_ROSTERS = read('rosters.json');
export const CHECK_RATINGS = read('ratings.json');

export function checkLeague(C, rows) {
  const lg = C.seedLeague(rows, C.withRatings(CHECK_ROSTERS, CHECK_RATINGS));
  if (lg.rs !== +CHECK_ROSTERS.season) {
    throw new Error(`hoops/build/fixtures/league is the ${CHECK_ROSTERS.season} season, but the data's newest is ${lg.latest}: re-freeze it from hoops/data (see check-league.mjs)`);
  }
  return lg;
}
