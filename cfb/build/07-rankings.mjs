/* Stage 7, the real historical polls.
 *
 *   CFBD_KEY=... node cfb/build/07-rankings.mjs
 *
 * Writes cfb/data/cfb_rankings.json: { "Alabama-2015": 2, "Clemson-2015": 1, ... }
 * One entry per team-season that finished a season ranked, and nothing for the
 * hundred-odd that did not.
 *
 * WHY THIS EXISTS. The game used to work out its own top 25 by sorting each
 * season's teams on strength_z, a number derived from points scored and allowed.
 * It is a reasonable measure of how a team played and it is not a poll, so the
 * two disagreed loudly and in public. The 2015 board it produced had 13-0 Clemson
 * seventh, 9-3 Baylor third, San Diego State eleventh, and no Michigan State or
 * Iowa at all, when those two finished third and fifth in the country. Beating
 * "No. 3 Baylor" is not a signature win and a fan knows it on sight.
 *
 * So the ranking a player sees is now the ranking that actually happened. It is
 * looked up, never computed, and a team that was never ranked shows no number
 * rather than a made-up one.
 *
 * WHICH POLL, AND FROM WHEN. The last poll of each season, which is the one
 * people mean by "they finished 8th":
 *
 *   2014 onward   the final College Football Playoff rankings where they exist,
 *                 falling back to the final AP poll. CFP is the selection
 *                 authority in the playoff era and is what the bracket in this
 *                 game imitates.
 *   2005 to 2013  the final AP poll. There was no CFP, and AP is the poll with
 *                 unbroken coverage across the whole range this game draws from.
 *
 * The postseason poll is used where CFBD has one, because a team's final ranking
 * is the one written after the bowls. Where a season has no postseason entry the
 * last regular-season week is used instead, which is what the CFP rankings are
 * anyway: they stop at selection.
 *
 * THE KEY IS NEVER STORED. It is read from CFBD_KEY at run time, the same as
 * every other stage, and the responses land in build/.cache which is not
 * committed. Nothing this file writes contains it.
 */

import fs from 'node:fs';
import path from 'node:path';
import { SEASONS, DATA_DIR, cfbdFetchRetry } from './lib.mjs';

/* CFBD spells a few schools differently across endpoints, and a ranking that does
   not join to a team-season is a ranking nobody sees. Every alias here was found
   by the unmatched report at the bottom of this file, not guessed. */
const ALIASES = {
  'Ole Miss': 'Ole Miss',
  'Miami': 'Miami',
  'UL Monroe': 'Louisiana Monroe',
  'Louisiana': 'Louisiana',
  'UT San Antonio': 'UTSA',
  'Southern Mississippi': 'Southern Miss',
  'Hawai\'i': 'Hawai\'i',
  'San José State': 'San José State',
};

function pollRank(polls, wanted) {
  for (const name of wanted) {
    const p = polls.find((x) => x.poll === name);
    if (p && p.ranks && p.ranks.length) return p;
  }
  return null;
}

async function main() {
  const teamSeasons = JSON.parse(
    fs.readFileSync(path.join(DATA_DIR, 'cfb_team_seasons.json'), 'utf8'));
  const byKey = new Map(teamSeasons.map((t) => [t.school + '-' + t.season, t.team_season_id]));

  const out = {};
  const unmatched = new Map();
  let ranked = 0;

  for (const season of SEASONS) {
    let weeks;
    try {
      weeks = await cfbdFetchRetry('/rankings', { year: season },
        `rankings_${season}.json`);
    } catch (e) {
      process.stderr.write(`  ${season}: ${e.message}\n`);
      continue;
    }
    if (!Array.isArray(weeks) || !weeks.length) {
      process.stderr.write(`  ${season}: no rankings returned\n`);
      continue;
    }
    /* The last poll of the season: postseason if there is one, otherwise the
       highest-numbered regular-season week. */
    const post = weeks.filter((w) => w.seasonType === 'postseason');
    const pool = post.length ? post : weeks;
    const last = pool.reduce((a, b) => ((b.week ?? 0) >= (a.week ?? 0) ? b : a));

    /* CFP first in the playoff era, AP everywhere, Coaches only as a last resort. */
    const wanted = season >= 2014
      ? ['Playoff Committee Rankings', 'AP Top 25', 'Coaches Poll']
      : ['AP Top 25', 'Coaches Poll'];
    const poll = pollRank(last.polls || [], wanted);
    if (!poll) { process.stderr.write(`  ${season}: no usable poll\n`); continue; }

    let hit = 0;
    for (const r of poll.ranks) {
      const school = ALIASES[r.school] || r.school;
      const id = byKey.get(school + '-' + season);
      if (!id) {
        unmatched.set(r.school + ' ' + season, (unmatched.get(r.school + ' ' + season) || 0) + 1);
        continue;
      }
      out[id] = r.rank;
      hit++; ranked++;
    }
    process.stderr.write(`  ${season}: ${poll.poll}, ${hit}/${poll.ranks.length} matched\n`);
  }

  /* REFUSE TO WRITE A POLL THIS FILE DOES NOT BELIEVE IN.
     Without this, running the stage with no key writes `{}`: every season fails,
     the loop continues past each failure by design, and an empty object is a
     perfectly valid JSON file. The game would then load it, find it truthy, and
     use it INSTEAD of the fallback, so every team in the league would be unranked
     and the five badges that key off beating a ranked team would be unearnable.
     A poll that ranks nobody is worse than no poll at all, because no poll is
     detected and falls back and this one is not.
     Twenty per season is the floor because every poll here is a top 25 and some
     seasons lose a handful of entries to schools this game does not carry. */
  const floor = SEASONS.length * 20;
  if (Object.keys(out).length < floor) {
    console.error(`REFUSING TO WRITE: only ${Object.keys(out).length} ranked ` +
      `team-seasons, expected at least ${floor}.`);
    console.error('Nothing was written, so the game keeps whatever poll it has.');
    console.error('Check CFBD_KEY and the per-season lines above.');
    process.exit(1);
  }
  fs.writeFileSync(path.join(DATA_DIR, 'cfb_rankings.json'), JSON.stringify(out));
  const kb = (fs.statSync(path.join(DATA_DIR, 'cfb_rankings.json')).size / 1024).toFixed(1);
  console.log(`cfb_rankings.json written (${kb} KB)`);
  console.log(`  ${ranked} ranked team-seasons across ${SEASONS.length} seasons`);
  if (unmatched.size) {
    console.log(`  ${unmatched.size} poll entries did not join to a team-season:`);
    [...unmatched.keys()].slice(0, 25).forEach((k) => console.log('    ' + k));
    console.log('  Add any real school above to ALIASES at the top of this file.');
  }
  /* A spot check a human can read, because a silent join failure is the whole
     risk here and a count does not show it. */
  for (const yr of [2015, 2019, 2023]) {
    const top = Object.entries(out)
      .filter(([id]) => id.endsWith('-' + yr))
      .sort((a, b) => a[1] - b[1]).slice(0, 5)
      .map(([id, r]) => '#' + r + ' ' + id.replace('-' + yr, ''));
    if (top.length) console.log(`  ${yr} top five: ${top.join(', ')}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
