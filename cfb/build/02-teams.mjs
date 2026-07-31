/* Stage 2, cfb_team_seasons (the opponent table).
 *
 *   CFBD_KEY=... node cfb/build/02-teams.mjs        (run 01-players.mjs first)
 *
 * Produces data/cfb_team_seasons.{json,csv}: one row per drawable team-season,
 * with scoring/defense distributions, strength z-scores, per-slot eligible
 * player lists, and team colorway data.
 *
 * Also produces:
 *   cfb_team_season_rosters.json, full eligible player lists per slot per team
 *   cfb_league_context.json, per-season league average points allowed
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  SEASONS, POSITIONS, DATA_DIR,
  cfbdFetchRetry, isDrawable,
  mean, stdev, round, writePair,
} from './lib.mjs';
import { correctColors } from './school-colors.mjs';

const SLOTS = ['QB', 'RB', 'WR', 'TE', 'FLEX'];
const SLOT_ELIGIBILITY = {
  QB: ['QB'], RB: ['RB'], WR: ['WR'], TE: ['TE'], FLEX: ['RB', 'WR', 'TE'],
};

async function main() {
  const playersPath = path.join(DATA_DIR, 'cfb_player_seasons.json');
  if (!fs.existsSync(playersPath)) {
    throw new Error('run 01-players.mjs first (data/cfb_player_seasons.json missing)');
  }
  const players = JSON.parse(fs.readFileSync(playersPath, 'utf8'));

  // ─── team colors from CFBD ────────────────────────────────────────────────
  process.stderr.write('loading team colors...\n');
  const teamColors = new Map();
  for (const season of SEASONS) {
    const teams = await cfbdFetchRetry(
      '/teams/fbs',
      { year: season },
      `fbs_teams_${season}.json`,
    );
    for (const t of teams) {
      if (!teamColors.has(t.school)) {
        teamColors.set(t.school, {
          color: t.color || null,
          alternateColor: t.alternateColor || null,
          abbreviation: t.abbreviation || null,
          mascot: t.mascot || null,
          logo: t.logos?.[0] || null,
        });
      }
    }
  }

  // ─── game results ─────────────────────────────────────────────────────────
  process.stderr.write('loading game results...\n');

  /** @type {Map<string, {scored: number[], allowed: number[], w: number, l: number, conf: string}>} */
  const ts = new Map();
  const touch = (key) => {
    let e = ts.get(key);
    if (!e) { e = { scored: [], allowed: [], w: 0, l: 0, conf: '' }; ts.set(key, e); }
    return e;
  };

  let used = 0;
  for (const season of SEASONS) {
    const gamesFile = path.join(path.dirname(new URL(import.meta.url).pathname), '.cache', `games_${season}.json`);
    let games;
    if (fs.existsSync(gamesFile)) {
      games = JSON.parse(fs.readFileSync(gamesFile, 'utf8'));
    } else {
      games = await cfbdFetchRetry(
        '/games',
        { year: season, seasonType: 'regular', classification: 'fbs' },
        `games_${season}.json`,
      );
    }

    for (const g of games) {
      if (g.homePoints === null || g.awayPoints === null) continue;
      if (g.homePoints === undefined || g.awayPoints === undefined) continue;
      const home = Number(g.homePoints);
      const away = Number(g.awayPoints);
      if (isNaN(home) || isNaN(away)) continue;

      const hKey = `${g.homeTeam}-${season}`;
      const aKey = `${g.awayTeam}-${season}`;
      const h = touch(hKey);
      const a = touch(aKey);

      h.scored.push(home); h.allowed.push(away);
      a.scored.push(away); a.allowed.push(home);

      if (home > away) { h.w++; a.l++; }
      else if (away > home) { a.w++; h.l++; }
      // CFB ties are extremely rare in the modern era, treat as 0-win

      h.conf = g.homeConference || h.conf;
      a.conf = g.awayConference || a.conf;

      used++;
    }
    process.stderr.write(`  games ${season}\n`);
  }

  // ─── eligible players per team-season ─────────────────────────────────────
  /** @type {Map<string, Record<string, string[]>>} */
  const eligible = new Map();
  for (const p of players) {
    if (!p.team_season_id) continue;
    let byslot = eligible.get(p.team_season_id);
    if (!byslot) { byslot = {}; eligible.set(p.team_season_id, byslot); }
    for (const slot of SLOTS) {
      if (SLOT_ELIGIBILITY[slot].includes(p.position)) {
        (byslot[slot] ??= []).push(`${p.player_id}|${p.season}`);
      }
    }
  }

  // ─── build rows ───────────────────────────────────────────────────────────
  const rows = [];
  let drawableCount = 0, skippedCount = 0;
  for (const [id, e] of ts) {
    const dashIdx = id.lastIndexOf('-');
    const school = id.slice(0, dashIdx);
    const season = Number(id.slice(dashIdx + 1));
    const conf = e.conf;

    if (!isDrawable(school, season, conf)) { skippedCount++; continue; }
    drawableCount++;

    const gp = e.scored.length;
    if (gp === 0) continue;

    const byslot = eligible.get(id) ?? {};
    const colors = teamColors.get(school) ?? {};

    rows.push({
      team_season_id: id,
      school,
      season,
      display: `${season} ${school}`,
      conference: conf,
      abbreviation: colors.abbreviation || school.slice(0, 4).toUpperCase(),
      mascot: colors.mascot || '',
      /* CFBD's palette, with the handful of schools it gets wrong corrected. See
         school-colors.mjs for which and why. */
      ...correctColors(school, colors.color || '#333333', colors.alternateColor || '#ffffff'),
      games: gp,
      record: `${e.w}-${e.l}`,
      pts_scored_mean: round(mean(e.scored), 2),
      pts_scored_sd: round(stdev(e.scored), 2),
      pts_allowed_mean: round(mean(e.allowed), 2),
      pts_allowed_sd: round(stdev(e.allowed), 2),
      point_diff_pg: round(mean(e.scored) - mean(e.allowed), 3),
      strength_z: 0,
      eligible_qb: (byslot.QB ?? []).length,
      eligible_rb: (byslot.RB ?? []).length,
      eligible_wr: (byslot.WR ?? []).length,
      eligible_te: (byslot.TE ?? []).length,
    });
  }

  // Strength z-score within season
  for (const season of SEASONS) {
    const group = rows.filter((r) => r.season === season);
    if (group.length < 2) continue;
    const mu = mean(group.map((r) => r.point_diff_pg));
    const sd = stdev(group.map((r) => r.point_diff_pg));
    for (const r of group) r.strength_z = round(sd ? (r.point_diff_pg - mu) / sd : 0, 3);
  }

  rows.sort((a, b) => (a.season - b.season) || a.school.localeCompare(b.school));
  const cols = Object.keys(rows[0]);
  const out = writePair('cfb_team_seasons', rows, cols);

  // Roster index
  const rosterIndex = {};
  for (const [id, byslot] of eligible) rosterIndex[id] = byslot;
  fs.writeFileSync(path.join(DATA_DIR, 'cfb_team_season_rosters.json'), JSON.stringify(rosterIndex));

  // League context (per-season average points allowed)
  const leagueAllowed = {};
  for (const season of SEASONS) {
    const g = rows.filter((r) => r.season === season);
    if (g.length) leagueAllowed[season] = round(mean(g.map((r) => r.pts_allowed_mean)), 3);
  }
  fs.writeFileSync(path.join(DATA_DIR, 'cfb_league_context.json'),
    JSON.stringify({ league_avg_pts_allowed_by_season: leagueAllowed }, null, 2));

  // ─── report ─────────────────────────────────────────────────────────────────
  console.log(`cfb_team_seasons: ${rows.length} drawable team-seasons from ${used} games`);
  console.log(`  (${skippedCount} non-drawable team-seasons skipped)`);
  console.log(`wrote ${out.json} (${(out.bytes / 1024).toFixed(0)} KB) + .csv`);
  console.log(`wrote cfb_team_season_rosters.json ` +
    `(${(fs.statSync(path.join(DATA_DIR, 'cfb_team_season_rosters.json')).size / 1024).toFixed(0)} KB)`);
  console.log(`wrote cfb_league_context.json\n`);

  const perSeason = SEASONS.map((s) => rows.filter((r) => r.season === s).length);
  console.log(`teams per season: min ${Math.min(...perSeason)}, max ${Math.max(...perSeason)}, ` +
    `avg ${(perSeason.reduce((a, b) => a + b, 0) / perSeason.length).toFixed(0)}`);

  console.log('\nstrongest team-seasons by point differential:');
  for (const r of [...rows].sort((a, b) => b.strength_z - a.strength_z).slice(0, 8)) {
    console.log(`  z=${r.strength_z.toFixed(2).padStart(5)}  ${r.display.padEnd(30)} ${r.record.padStart(6)}  ` +
      `scored ${r.pts_scored_mean}±${r.pts_scored_sd}  allowed ${r.pts_allowed_mean}±${r.pts_allowed_sd}`);
  }
  console.log('\nweakest:');
  for (const r of [...rows].sort((a, b) => a.strength_z - b.strength_z).slice(0, 3)) {
    console.log(`  z=${r.strength_z.toFixed(2).padStart(5)}  ${r.display.padEnd(30)} ${r.record.padStart(6)}`);
  }

  // Spot check
  const lsu19 = rows.find((r) => r.team_season_id === 'LSU-2019');
  if (lsu19) {
    console.log(`\nbenchmark: ${lsu19.display} ${lsu19.record}, z=${lsu19.strength_z}, ` +
                `scored ${lsu19.pts_scored_mean}, allowed ${lsu19.pts_allowed_mean}`);
  }

  const dead = rows.filter((r) => SLOTS.some((s) =>
    (s === 'FLEX' ? r.eligible_rb + r.eligible_wr + r.eligible_te : r[`eligible_${s.toLowerCase()}`]) === 0));
  console.log(`\n${dead.length} team-seasons have a slot with no eligible player:`);
  for (const r of dead.slice(0, 6)) {
    console.log(`  ${r.display.padEnd(30)} QB${r.eligible_qb} RB${r.eligible_rb} WR${r.eligible_wr} TE${r.eligible_te}`);
  }
  if (dead.length > 6) console.log(`  ... and ${dead.length - 6} more`);

  console.log(`\nleague average points allowed: ` +
    `${leagueAllowed[SEASONS[0]]} (${SEASONS[0]}) -> ${leagueAllowed[SEASONS.at(-1)]} (${SEASONS.at(-1)})`);
}

main().catch((e) => { console.error(e); process.exit(1); });
