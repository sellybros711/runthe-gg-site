/* Stage 3, team_seasons (the opponent table).
 *
 *   node football/build/02-teams.mjs        (run 01-players.mjs first)
 *
 * Produces data/team_seasons.{json,csv}: one row per drawable team-season, with
 * the two distributions the sim needs from an opponent, their weekly scoring
 * and their weekly defense, plus a within-season strength z-score used by
 * schedule normalization, and the per-slot eligible player lists the wheel needs
 * to avoid dead spins.
 *
 * Scores come from nfldata games.csv, regular season only, so the mean/SD
 * describe a normal week rather than mixing in playoff opponents.
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  SEASONS, POSITIONS, DATA_DIR, GAMES_URL, cachedCSV, parseCSVObjects,
  mean, stdev, round, writePair, franchiseId, franchiseName, divisionKey,
  FRANCHISES,
} from './lib.mjs';

const SLOTS = ['QB', 'RB', 'WR', 'TE', 'FLEX'];
const SLOT_ELIGIBILITY = {
  QB: ['QB'], RB: ['RB'], WR: ['WR'], TE: ['TE'], FLEX: ['RB', 'WR', 'TE'],
};

async function main() {
  const playersPath = path.join(DATA_DIR, 'player_seasons.json');
  if (!fs.existsSync(playersPath)) {
    throw new Error('run 01-players.mjs first (data/player_seasons.json missing)');
  }
  const players = JSON.parse(fs.readFileSync(playersPath, 'utf8'));

  const text = await cachedCSV(GAMES_URL, 'games.csv');
  const games = parseCSVObjects(text);

  /** @type {Map<string, {scored:number[], allowed:number[], w:number, l:number, t:number}>} */
  const ts = new Map();
  const touch = (key) => {
    let e = ts.get(key);
    if (!e) { e = { scored: [], allowed: [], w: 0, l: 0, t: 0 }; ts.set(key, e); }
    return e;
  };

  let used = 0;
  for (const g of games) {
    if (g.game_type !== 'REG') continue;
    const season = Number(g.season);
    if (!SEASONS.includes(season)) continue;
    // Unplayed or cancelled games have blank scores. 2022 legitimately has 271
    // regular-season results rather than 272 (Bills-Bengals was abandoned).
    if (g.away_score === '' || g.home_score === '') continue;
    const away = Number(g.away_score);
    const home = Number(g.home_score);
    const a = touch(`${franchiseId(g.away_team)}-${season}`);
    const h = touch(`${franchiseId(g.home_team)}-${season}`);
    a.scored.push(away); a.allowed.push(home);
    h.scored.push(home); h.allowed.push(away);
    if (home > away) { h.w++; a.l++; } else if (away > home) { a.w++; h.l++; } else { h.t++; a.t++; }
    used++;
  }

  // Eligible players per team-season, bucketed by the slot they can fill.
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

  const rows = [];
  for (const [id, e] of ts) {
    const [franchise, seasonStr] = [id.slice(0, id.lastIndexOf('-')), id.slice(id.lastIndexOf('-') + 1)];
    const season = Number(seasonStr);
    const gp = e.scored.length;
    const byslot = eligible.get(id) ?? {};
    rows.push({
      team_season_id: id,
      franchise,
      season,
      display: `${season} ${franchiseName(franchise, season)}`,
      division: divisionKey(franchise),
      games: gp,
      record: e.t ? `${e.w}-${e.l}-${e.t}` : `${e.w}-${e.l}`,
      pts_scored_mean: round(mean(e.scored), 2),
      pts_scored_sd: round(stdev(e.scored), 2),
      pts_allowed_mean: round(mean(e.allowed), 2),
      pts_allowed_sd: round(stdev(e.allowed), 2),
      point_diff_pg: round(mean(e.scored) - mean(e.allowed), 3),
      // filled below, once season means are known
      strength_z: 0,
      eligible_qb: (byslot.QB ?? []).length,
      eligible_rb: (byslot.RB ?? []).length,
      eligible_wr: (byslot.WR ?? []).length,
      eligible_te: (byslot.TE ?? []).length,
    });
  }

  // Strength = point differential per game, z-scored WITHIN its season, so a
  // 2000 team and a 2023 team are comparable despite league-wide scoring drift.
  for (const season of SEASONS) {
    const group = rows.filter((r) => r.season === season);
    if (group.length < 2) continue;
    const mu = mean(group.map((r) => r.point_diff_pg));
    const sd = stdev(group.map((r) => r.point_diff_pg));
    for (const r of group) r.strength_z = round(sd ? (r.point_diff_pg - mu) / sd : 0, 3);
  }

  rows.sort((a, b) => (a.season - b.season) || a.franchise.localeCompare(b.franchise));
  const cols = Object.keys(rows[0]);
  const out = writePair('team_seasons', rows, cols);

  // The wheel needs the full eligible lists, not just counts; ship them
  // separately so team_seasons stays small and human-readable.
  const rosterIndex = {};
  for (const [id, byslot] of eligible) rosterIndex[id] = byslot;
  fs.writeFileSync(path.join(DATA_DIR, 'team_season_rosters.json'), JSON.stringify(rosterIndex));

  // ─── report ────────────────────────────────────────────────────────────────
  console.log(`team_seasons: ${rows.length} rows from ${used} regular-season games`);
  console.log(`wrote ${out.json} (${(out.bytes / 1024).toFixed(0)} KB) + .csv`);
  console.log(`wrote team_season_rosters.json ` +
    `(${(fs.statSync(path.join(DATA_DIR, 'team_season_rosters.json')).size / 1024).toFixed(0)} KB)\n`);

  const expect = FRANCHISES.length * SEASONS.length;
  const houstonMissing = SEASONS.filter((s) => s < 2002).length; // HOU did not exist
  console.log(`expected ${expect} - ${houstonMissing} (Houston pre-2002) = ${expect - houstonMissing}` +
              ` -> got ${rows.length} ${rows.length === expect - houstonMissing ? 'ok' : 'FAIL INVESTIGATE'}`);

  const per = SEASONS.map((s) => rows.filter((r) => r.season === s).length);
  const odd = SEASONS.filter((s, i) => per[i] !== (s < 2002 ? 31 : 32));
  console.log(`teams per season: ${odd.length ? 'unexpected in ' + odd.join(',') : '31 pre-2002, 32 from 2002 ok'}`);

  console.log('\nstrongest team-seasons by point differential:');
  for (const r of [...rows].sort((a, b) => b.strength_z - a.strength_z).slice(0, 5)) {
    console.log(`  z=${r.strength_z.toFixed(2)}  ${r.display.padEnd(30)} ${r.record.padStart(6)}  ` +
      `scored ${r.pts_scored_mean}±${r.pts_scored_sd}  allowed ${r.pts_allowed_mean}±${r.pts_allowed_sd}`);
  }
  console.log('\nweakest:');
  for (const r of [...rows].sort((a, b) => a.strength_z - b.strength_z).slice(0, 3)) {
    console.log(`  z=${r.strength_z.toFixed(2)}  ${r.display.padEnd(30)} ${r.record.padStart(6)}`);
  }

  const ne07 = rows.find((r) => r.team_season_id === 'NE-2007');
  console.log(`\nbenchmark: ${ne07.display} ${ne07.record}, z=${ne07.strength_z}, ` +
              `scored ${ne07.pts_scored_mean}, allowed ${ne07.pts_allowed_mean}`);

  const dead = rows.filter((r) => SLOTS.some((s) =>
    (s === 'FLEX' ? r.eligible_rb + r.eligible_wr + r.eligible_te : r[`eligible_${s.toLowerCase()}`]) === 0));
  console.log(`\n${dead.length} team-seasons have a slot with no eligible player ` +
              `(the wheel must filter these per slot, not globally):`);
  for (const r of dead.slice(0, 6)) {
    console.log(`  ${r.display.padEnd(30)} QB${r.eligible_qb} RB${r.eligible_rb} WR${r.eligible_wr} TE${r.eligible_te}`);
  }
  if (dead.length > 6) console.log(`  ... and ${dead.length - 6} more`);

  const leagueAllowed = {};
  for (const season of SEASONS) {
    const g = rows.filter((r) => r.season === season);
    leagueAllowed[season] = round(mean(g.map((r) => r.pts_allowed_mean)), 3);
  }
  fs.writeFileSync(path.join(DATA_DIR, 'league_context.json'),
    JSON.stringify({ league_avg_pts_allowed_by_season: leagueAllowed }, null, 2));
  console.log(`\nleague average points allowed: ${leagueAllowed[1999]} (1999) -> ${leagueAllowed[2025]} (2025)`);
  console.log('wrote league_context.json, per-season, not one global constant, so');
  console.log('1999-era and 2020s opponents are not systematically mispriced.');
}

main().catch((e) => { console.error(e); process.exit(1); });
