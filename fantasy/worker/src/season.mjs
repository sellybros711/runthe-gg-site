/* Which NFL season and week it is.
 *
 * A season is named for the calendar year it STARTS in, so January 2027 is
 * still season 2026. Getting that wrong writes a whole week of January data
 * into the wrong partition, where it is not lost but is invisible to every
 * query the product makes.
 *
 * EVERYTHING HERE IS UTC. The brief flags timezones as where the bugs will be.
 * A week boundary in local time would move twice a year and the symptom would
 * be one week of data split across two.
 *
 * WEEK 1 IS ANCHORED TO A DATE PER SEASON, and there is no arithmetic that
 * gets this right without one: the NFL opens on the Thursday after Labor Day,
 * which is not a fixed date and not derivable from the year alone. So the
 * anchors are written down. A season with no anchor falls back to the closest
 * earlier one plus arithmetic, which will be a week out eventually, and says
 * so in the returned value rather than pretending.
 */

/* Kickoff of week 1, UTC, per season. Add a line each August. */
const WEEK1 = {
  2025: Date.UTC(2025, 8, 4),   // Thu 4 Sep 2025
  2026: Date.UTC(2026, 8, 10),  // Thu 10 Sep 2026
  2027: Date.UTC(2027, 8, 9),   // Thu 9 Sep 2027
};

const WEEK_MS = 7 * 24 * 3600 * 1000;

export function seasonAndWeek(date = new Date()) {
  const ms = date.getTime();
  const y = date.getUTCFullYear();

  /* January and February belong to the previous season. March through August
     are the offseason and belong to the season about to start, which is what
     makes a preseason poll land in the right partition. */
  const season = date.getUTCMonth() <= 1 ? y - 1 : y;

  const anchor = WEEK1[season];
  if (anchor == null) {
    return { season, week: 1, anchored: false };
  }
  if (ms < anchor) return { season, week: 1, anchored: true };

  /* Clamped at 22, which covers 18 regular season weeks plus the postseason.
     Uncapped, a poll in June would report week 40 and file rows under a week
     nothing will ever read. */
  const week = Math.min(22, Math.floor((ms - anchor) / WEEK_MS) + 1);
  return { season, week, anchored: true };
}
