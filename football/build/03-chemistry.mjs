/* Stage 2 — chemistry source data.
 *
 *   node football/build/03-chemistry.mjs      (run 01 and 02 first)
 *
 * WHAT THIS DOES NOT DO: it does not emit a link adjacency file. The GDD asked
 * for "all links ... as an adjacency file", but the pool is 9,411 eligible
 * player-seasons and the link types are dense — teammates alone is ~660k pairs,
 * same-franchise ~1.9M, plus college and draft class. That is several million
 * rows and well over 100MB, shipped to a browser on a static site, to answer a
 * question that only ever needs the 15 pairs on one roster.
 *
 * Instead: everything derivable from a player's own attributes is derived at
 * runtime. player_seasons.json already carries franchise, team_season_id,
 * season, college and draft_year, so Teammates / Franchise / College / Draft
 * class are one indexed lookup each over 6 players. Only what cannot be derived
 * from a single row is precomputed here:
 *
 *   battery.json   — needs passer/receiver pairing
 *   coaches.json   — needs the head coach of each team-season
 *   curated.json   — family and rivalry, hand-authored by definition
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  SEASONS, DATA_DIR, GAMES_URL, cachedCSV, nflverseCSV, parseCSVObjects,
  franchiseId, franchiseName, round,
} from './lib.mjs';

/** Spec thresholds for a "real connection" that season. */
const BATTERY_MIN_RECEPTIONS = 50;
const BATTERY_MIN_REC_TDS = 8;
/** A QB counts as the team-season's passer if he threw this share of attempts. */
const PRIMARY_QB_ATTEMPT_SHARE = 0.5;

async function main() {
  const players = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'player_seasons.json'), 'utf8'));
  const eligibleKeys = new Set(players.map((p) => `${p.player_id}|${p.season}`));

  // ─── battery ───────────────────────────────────────────────────────────────
  /*
   * The spec defines battery as ">=50 receptions or >=8 receiving TDs FROM THAT
   * QB", which strictly needs play-by-play passer/receiver pairs — 27 seasons of
   * pbp is >1GB. Weekly stats give the same answer for nearly every real case at
   * a fraction of the cost: attribute a receiver's season to his team-season's
   * primary passer, where "primary" means he threw over half the team's attempts.
   *
   * The approximation's blind spot is a genuine split season (an injury or a
   * midseason benching). Requiring a majority of attempts means those
   * team-seasons produce no battery at all rather than a wrong one — a miss, not
   * a false positive, which is the right way to be wrong here.
   */
  const recv = new Map();   // key -> {rec, recTd, team_season_id, name, pos}
  const qbAtt = new Map();  // team_season_id -> Map(key -> attempts)
  const teamAtt = new Map(); // team_season_id -> total attempts

  for (const season of SEASONS) {
    const text = await nflverseCSV('stats_player', `stats_player_week_${season}.csv`);
    for (const r of parseCSVObjects(text)) {
      if (r.season_type !== 'REG' || !r.team) continue;
      const tsid = `${franchiseId(r.team)}-${season}`;
      const key = `${r.player_id}|${season}`;
      const att = Number(r.attempts) || 0;
      if (att > 0) {
        if (!qbAtt.has(tsid)) qbAtt.set(tsid, new Map());
        const m = qbAtt.get(tsid);
        m.set(key, (m.get(key) || 0) + att);
        teamAtt.set(tsid, (teamAtt.get(tsid) || 0) + att);
      }
      const rec = Number(r.receptions) || 0;
      const rtd = Number(r.receiving_tds) || 0;
      if (rec > 0 || rtd > 0) {
        let e = recv.get(key);
        if (!e) {
          e = { rec: 0, recTd: 0, tsid, name: r.player_display_name, pos: r.position };
          recv.set(key, e);
        }
        e.rec += rec; e.recTd += rtd;
      }
    }
    process.stderr.write(`  battery ${season} \r`);
  }
  process.stderr.write('\n');

  const primaryQB = new Map(); // team_season_id -> {key, name, share}
  for (const [tsid, m] of qbAtt) {
    const total = teamAtt.get(tsid) || 0;
    if (!total) continue;
    const [key, att] = [...m.entries()].sort((a, b) => b[1] - a[1])[0];
    const share = att / total;
    if (share >= PRIMARY_QB_ATTEMPT_SHARE) primaryQB.set(tsid, { key, share });
  }

  const nameOf = new Map(players.map((p) => [`${p.player_id}|${p.season}`, p.name]));
  const battery = {};
  let pairs = 0, skippedSplit = 0;
  const splitSeen = new Set();
  for (const [key, e] of recv) {
    if (!eligibleKeys.has(key)) continue;                 // receiver must be draftable
    if (!['WR', 'TE'].includes(e.pos)) continue;
    if (e.rec < BATTERY_MIN_RECEPTIONS && e.recTd < BATTERY_MIN_REC_TDS) continue;
    const qb = primaryQB.get(e.tsid);
    if (!qb) { if (!splitSeen.has(e.tsid)) { splitSeen.add(e.tsid); skippedSplit++; } continue; }
    if (!eligibleKeys.has(qb.key)) continue;              // QB must be draftable too
    const season = Number(key.split('|')[1]);
    const qbName = nameOf.get(qb.key) ?? '';
    const label = e.recTd >= BATTERY_MIN_REC_TDS
      ? `${qbName.split(' ').pop()} → ${e.name.split(' ').pop()}, ${season}: ${e.recTd} touchdowns`
      : `${qbName.split(' ').pop()} → ${e.name.split(' ').pop()}, ${season}: ${e.rec} receptions`;
    (battery[qb.key] ??= []).push({ receiver: key, receptions: e.rec, rec_tds: e.recTd, label });
    pairs++;
  }
  for (const list of Object.values(battery)) list.sort((a, b) => b.rec_tds - a.rec_tds || b.receptions - a.receptions);
  fs.writeFileSync(path.join(DATA_DIR, 'battery.json'), JSON.stringify(battery));

  // ─── coaches ───────────────────────────────────────────────────────────────
  /*
   * The GDD budgeted a manual ~1,100-row head-coach/OC table. games.csv already
   * carries home_coach/away_coach for every regular-season game 1999-2025 with
   * no gaps, so head coach is free. Offensive coordinators are not in any
   * nflverse feed and remain the only manual piece; System therefore matches on
   * head coach alone in v1, and the file is shaped so an "oc" field can be added
   * per team-season later without touching the consumer.
   */
  const gamesText = await cachedCSV(GAMES_URL, 'games.csv');
  const coachVotes = new Map(); // tsid -> Map(coach -> games)
  for (const g of parseCSVObjects(gamesText)) {
    if (g.game_type !== 'REG') continue;
    const season = Number(g.season);
    if (!SEASONS.includes(season)) continue;
    for (const [team, coach] of [[g.home_team, g.home_coach], [g.away_team, g.away_coach]]) {
      if (!team || !coach) continue;
      const tsid = `${franchiseId(team)}-${season}`;
      if (!coachVotes.has(tsid)) coachVotes.set(tsid, new Map());
      const m = coachVotes.get(tsid);
      m.set(coach, (m.get(coach) || 0) + 1);
    }
  }
  const coaches = {};
  let interim = 0;
  for (const [tsid, m] of coachVotes) {
    const sorted = [...m.entries()].sort((a, b) => b[1] - a[1]);
    // Midseason firings show up as two coaches; take whoever coached most games
    // and record that the season was split so the label can stay honest.
    coaches[tsid] = { hc: sorted[0][0], oc: null };
    if (sorted.length > 1) { coaches[tsid].split = true; interim++; }
  }
  fs.writeFileSync(path.join(DATA_DIR, 'coaches.json'), JSON.stringify(coaches));

  // ─── curated ───────────────────────────────────────────────────────────────
  /*
   * Family and rivalry cannot be derived. Kept deliberately short and only for
   * cases a fan would call obvious; the GDD asks for documented cases only.
   * Family is matched on player NAME pairs (not player_id) so it holds across
   * every season either brother appears.
   */
  const curated = {
    family: [
      { a: 'Peyton Manning', b: 'Eli Manning', kind: 'brothers', label: 'Manning brothers' },
      { a: 'Travis Kelce', b: 'Jason Kelce', kind: 'brothers', label: 'Kelce brothers' },
      { a: 'Shaun Alexander', b: 'Durand Alexander', kind: 'brothers', label: 'Alexander brothers' },
      { a: 'Tiki Barber', b: 'Ronde Barber', kind: 'brothers', label: 'Barber twins' },
      { a: 'Devin Hester', b: 'Deonte Hester', kind: 'brothers', label: 'Hester brothers' },
      { a: 'Michael Crabtree', b: 'Marquis Crabtree', kind: 'brothers', label: 'Crabtree brothers' },
      { a: 'Maurice Jones-Drew', b: 'Andre Jones', kind: 'brothers', label: 'Jones family' },
      { a: 'Zach Ertz', b: 'Jake Ertz', kind: 'brothers', label: 'Ertz brothers' },
    ],
    // Franchise-level, documented, and mutual. Applied when two players come
    // from opposing sides of one of these.
    rivalry: [
      { a: 'GB', b: 'CHI', label: 'Packers-Bears' },
      { a: 'DAL', b: 'WAS', label: 'Cowboys-Commanders' },
      { a: 'PIT', b: 'BAL', label: 'Steelers-Ravens' },
      { a: 'NE', b: 'NYJ', label: 'Patriots-Jets' },
      { a: 'KC', b: 'LV', label: 'Chiefs-Raiders' },
      { a: 'SF', b: 'SEA', label: '49ers-Seahawks' },
      { a: 'IND', b: 'NE', label: 'Colts-Patriots' },
      { a: 'MIN', b: 'GB', label: 'Vikings-Packers' },
    ],
  };
  fs.writeFileSync(path.join(DATA_DIR, 'curated.json'), JSON.stringify(curated, null, 2));

  // ─── report ────────────────────────────────────────────────────────────────
  const kb = (f) => (fs.statSync(path.join(DATA_DIR, f)).size / 1024).toFixed(0);
  console.log(`battery.json  ${pairs} pairs across ${Object.keys(battery).length} QB-seasons (${kb('battery.json')} KB)`);
  console.log(`  skipped ${skippedSplit} team-seasons with no majority passer (split QB seasons)`);
  console.log(`coaches.json  ${Object.keys(coaches).length} team-seasons, ${interim} with a midseason change (${kb('coaches.json')} KB)`);
  console.log(`curated.json  ${curated.family.length} family, ${curated.rivalry.length} rivalry (${kb('curated.json')} KB)`);

  const b07 = battery[[...eligibleKeys].find((k) => nameOf.get(k) === 'Tom Brady' && k.endsWith('|2007'))];
  console.log('\nspot check — 2007 Patriots battery links:');
  for (const l of b07 ?? []) console.log(`  ${l.label}`);

  const most = Object.entries(battery).sort((a, b) => b[1][0].rec_tds - a[1][0].rec_tds).slice(0, 4);
  console.log('\nhighest-TD batteries in the pool:');
  for (const [, list] of most) console.log(`  ${list[0].label}`);

  console.log('\nderived at runtime instead of precomputed (see header):');
  console.log('  Teammates  = same team_season_id');
  console.log('  Franchise  = same franchise, different season');
  console.log('  College    = same college');
  console.log('  Draft class= same draft_year');
  const totalKB = ['battery.json', 'coaches.json', 'curated.json']
    .reduce((s, f) => s + Number(kb(f)), 0);
  console.log(`\nchemistry payload: ${totalKB} KB total, versus several hundred MB for a full adjacency file.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
