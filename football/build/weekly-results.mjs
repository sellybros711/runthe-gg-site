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

export async function buildWeeklyResults({ season, week, partial = false }) {
  const games = parseCSVObjects(await cachedCSV(GAMES_URL, 'games.csv'));
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

  const rows = parseCSVObjects(await nflverseCSV('stats_player', `stats_player_week_${season}.csv`));
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

  return {
    season, week,
    final: !unplayed.length,
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
    season, week, partial: process.argv.includes('--partial'),
  });
  const ids = Object.keys(built.scores);
  console.log(`${season} week ${week}: ${built.played} of ${built.games} games played`
    + (built.final ? ', final' : ', STILL BEING PLAYED'));
  console.log(`  ${ids.length} men with a row`);
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
