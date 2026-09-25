/* WHAT THE WEEK ACTUALLY SCORED.
 *
 *   node football/build/weekly-results.mjs --season 2026 --week 3
 *   node football/build/weekly-results.mjs --season 2026 --week 3 --write
 *
 * The other half of weekly-pool.mjs. That file builds the board from weeks 1 to N-1 and is
 * forbidden from reading week N. This one reads week N and nothing else, because by the time
 * it runs the week has been played and there is nothing left to predict.
 *
 * ─── A MAN WITH NO ROW SCORED ZERO, AND THAT IS A RESULT RATHER THAN A GAP ─────────────
 *
 * nflverse writes a row for a man who was active and did nothing, and no row at all for one
 * who was inactive, hurt, benched or cut. Both of those are zero on a fantasy lineup, and
 * the difference between them is exactly what a drafter was being asked to judge. So a
 * missing row is written as `played: false, half: 0`, never left out: a scoring pass that
 * skipped him would quietly score a five man lineup and report a total that is not what
 * anybody's team did.
 *
 * ─── THE WEEK IS NOT FINISHED UNTIL THE SCHEDULE SAYS SO ──────────────────────────────
 *
 * Publishing a result mid-Sunday would show somebody a total that goes UP for the rest of
 * the day, which reads as the game being broken rather than as the Monday night game not
 * having kicked off. So the build refuses unless every game in the week has a score, and
 * `--partial` is the deliberate override for looking early.
 *
 * ─── SAME SCORING AS THE PRICE, ASSERTED THE SAME WAY ─────────────────────────────────
 *
 * Half PPR, derived from the same two published columns, with the same identity checked on
 * every build. Paying a lineup in a currency the board was not priced in is the one arithmetic
 * mistake here that nothing on screen would show.
 */

import fs from 'fs';
import path from 'path';
import {
  nflverseCSV, cachedCSV, parseCSVObjects, GAMES_URL, DATA_DIR, round,
} from './lib.mjs';
import { halfPPR, weekGames } from './weekly-pool.mjs';

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
/* Blank means the game has not been played. `Number('')` is 0, which would read as a
   nil-nil draw that already happened: the same trap next-week.mjs carries a note about. */
const scoreOf = (v) => (String(v == null ? '' : v).trim() === '' ? null : num(v));

/** One line for the sheet: what he did, in the order his position is read in. */
export function playLine(r) {
  const bits = [];
  const n = (v) => Math.round(v).toLocaleString('en-US');
  const py = num(r.passing_yards), ry = num(r.rushing_yards), rec = num(r.receptions);
  if (py) bits.push(`${n(py)} pass yds`, `${Math.round(num(r.passing_tds))} TD`);
  if (ry) bits.push(`${n(ry)} rush yds`, `${Math.round(num(r.rushing_tds))} TD`);
  if (rec) bits.push(`${Math.round(rec)} rec`, `${n(num(r.receiving_yards))} yds`,
    `${Math.round(num(r.receiving_tds))} TD`);
  return bits.join(', ');
}

export async function buildWeeklyResults({ season, week, partial = false, maxAgeMs }) {
  const games = parseCSVObjects(await cachedCSV(GAMES_URL, 'games.csv', { maxAgeMs }));
  const sched = weekGames(games, season, week);
  if (!sched.size) throw new Error(`the schedule has no week ${week} of ${season}`);

  const inWeek = games.filter((g) => num(g.season) === season && num(g.week) === week
    && (!g.game_type || g.game_type === 'REG'));
  const unplayed = inWeek.filter((g) => scoreOf(g.home_score) == null);
  if (unplayed.length && !partial) {
    throw new Error(`week ${week} of ${season} is not finished: `
      + `${unplayed.length} of ${inWeek.length} games still to play `
      + `(${unplayed.map((g) => `${g.away_team} at ${g.home_team}`).join(', ')}). `
      + 'Pass --partial to build it anyway.');
  }

  const rows = parseCSVObjects(
    await nflverseCSV('stats_player', `stats_player_week_${season}.csv`, { maxAgeMs }));
  const scored = new Map();
  let checked = 0;
  for (const r of rows) {
    if (String(r.season_type) !== 'REG') continue;
    /* The identity half PPR stands on, asserted here as well as in the pool, because this
       is the file that PAYS on it. */
    if (Math.abs((num(r.fantasy_points) + num(r.receptions)) - num(r.fantasy_points_ppr)) > 0.02) {
      throw new Error(`half PPR is no longer derivable: ${r.player_display_name} `
        + `week ${r.week}`);
    }
    checked++;
    if (num(r.week) !== week || !r.player_id) continue;
    scored.set(r.player_id, {
      player_id: r.player_id,
      half: round(halfPPR(r), 1),
      line: playLine(r),
    });
  }
  if (!checked) throw new Error('no REG rows to check the half PPR identity against');

  /*
   * ─── THE SCHEDULE SAYING A GAME IS OVER IS NOT THE STATS BEING IN ──────────────────
   *
   * `games.csv` carries a final score the moment a game ends. nflverse's player rows for
   * that game land some minutes later. Between those two moments the week looks FINISHED
   * off the schedule and is missing a club's worth of scoring, and marking it final there
   * settles the week on incomplete stats: every screen says the result is in while the
   * board is still climbing, and `fantasy_mark_results` will not un-say it.
   *
   * It cost nothing before this, because the Tuesday build runs two days after the last
   * whistle. It is a live path defect, and the live path is the one that runs at the exact
   * minute the Monday night game ends.
   *
   * So final means both: the schedule has every game played AND every club that played has
   * somebody with a row. Measured on a real snapshot of week 2 taken at 11:25pm ET on the
   * Sunday, the stats held 28 of the 32 clubs, which is exactly the state this refuses.
   */
  const clubsPlayed = new Set();
  for (const g of inWeek) {
    if (scoreOf(g.home_score) == null) continue;
    if (g.home_team) clubsPlayed.add(g.home_team);
    if (g.away_team) clubsPlayed.add(g.away_team);
  }
  const clubsScored = new Set();
  for (const r of rows) {
    if (String(r.season_type) !== 'REG' || num(r.week) !== week) continue;
    if (r.team) clubsScored.add(r.team);
  }
  const missing = [...clubsPlayed].filter((t) => !clubsScored.has(t)).sort();

  return {
    season, week,
    final: !unplayed.length && !missing.length,
    /* Named rather than folded into `final`, so a caller can say WHY a finished week is not
       being marked final yet, and so the live workflow's log answers the question this
       whole design is trying to measure: how far behind the stats run the whistle. */
    awaiting_stats: missing,
    /* Which clubs nflverse has written. The live path reads this to decide whose points
       still have to come from ESPN's box score, because a club nflverse has written is a
       club whose numbers are the ones that pay. */
    scored_clubs: [...clubsScored].sort(),
    games: inWeek.length,
    played: inWeek.length - unplayed.length,
    /* Keyed by player id, because the page looks up the six men it already holds rather
       than walking a list. A man with no entry scored zero and did not play. */
    scores: Object.fromEntries([...scored].map(([id, s]) => [id, [s.half, s.line]])),
  };
}

/* ─── cli ──────────────────────────────────────────────────────────────────────────── */

const arg = (flag, fallback) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

if (process.argv[1] && process.argv[1].endsWith('weekly-results.mjs')) {
  const season = Number(arg('--season', '2026'));
  const week = Number(arg('--week', '3'));
  const built = await buildWeeklyResults({
    season, week,
    partial: process.argv.includes('--partial'),
    /* `--fresh` IS WHAT THE LIVE PATH PASSES. Without it the cache never expires, which is
       right for a finished season and is a board that never moves for one being played. */
    maxAgeMs: process.argv.includes('--fresh') ? 0 : undefined,
  });
  const ids = Object.keys(built.scores);
  console.log(`${season} week ${week}: ${built.played} of ${built.games} games played`
    + (built.final ? ', final' : ', STILL BEING PLAYED'));
  console.log(`  ${ids.length} men with a row`);
  if (built.awaiting_stats.length) {
    console.log(`  waiting on stats for ${built.awaiting_stats.length} club`
      + `${built.awaiting_stats.length === 1 ? '' : 's'} whose game is over: `
      + built.awaiting_stats.join(', '));
  }
  const top = ids.map((id) => [id, built.scores[id]])
    .sort((a, b) => b[1][0] - a[1][0]).slice(0, 6);
  console.log('\n  the six best half PPR days of the week:');
  const pool = (() => {
    const f = path.join(DATA_DIR, `weekly_${season}_w${week}.json`);
    if (!fs.existsSync(f)) return {};
    const p = JSON.parse(fs.readFileSync(f, 'utf8'));
    return Object.fromEntries(p.pool.map((m) => [m.player_id, m]));
  })();
  for (const [id, [half, line]] of top) {
    const m = pool[id];
    console.log(`    ${String(half).padStart(5)}  ${(m ? m.name : id).padEnd(22)}`
      + `${m ? ('$' + m.price_musd + 'M').padStart(7) : '      -'}  ${line}`);
  }

  if (process.argv.includes('--write')) {
    const name = `results_${season}_w${week}.json`;
    fs.writeFileSync(path.join(DATA_DIR, name), JSON.stringify(built, null, 1));
    console.log(`\n  wrote ${name}`);
  }
}
