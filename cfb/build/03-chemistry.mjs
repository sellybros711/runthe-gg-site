/* Stage 3, chemistry source data.
 *
 *   CFBD_KEY=... node cfb/build/03-chemistry.mjs      (run 01 and 02 first)
 *
 * Same approach as football/build/03-chemistry.mjs: everything derivable from
 * a player's own attributes is derived at runtime. Only what cannot be derived
 * from a single row is precomputed here:
 *
 *   cfb_battery.json, QB-receiver pairing data
 *   cfb_coaches.json, head coach of each team-season
 *   cfb_curated.json, family and rivalry, hand-authored
 *
 * Runtime-derived chemistry links (from cfb_player_seasons.json fields):
 *   Teammates   = same team_season_id
 *   Program     = same school, different season
 *   Home state  = same home_state
 *   Conference  = same conference
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  SEASONS, DATA_DIR,
  cfbdFetchRetry, round,
} from './lib.mjs';

const BATTERY_MIN_RECEPTIONS = 40;
const BATTERY_MIN_REC_TDS = 6;
const PRIMARY_QB_ATTEMPT_SHARE = 0.5;

async function main() {
  const players = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'cfb_player_seasons.json'), 'utf8'));
  const eligibleKeys = new Set(players.map((p) => `${p.player_id}|${p.season}`));

  // ─── battery ───────────────────────────────────────────────────────────────
  /*
   * Same approximation as the NFL version: attribute a receiver's season to
   * the team-season's primary passer. In college, split QB seasons are more
   * common (injury, transfer, competition), so the majority-threshold filter
   * is important.
   */
  process.stderr.write('building battery links...\n');

  // We need per-game passing data to identify primary QBs.
  // Re-parse the cached game player stats.
  const qbAttempts = new Map(); // team_season_id -> Map(playerId -> attempts)
  const teamAttempts = new Map(); // team_season_id -> total attempts
  const recvStats = new Map(); // playerId|season -> {rec, recTd, tsid, name}

  for (const season of SEASONS) {
    const gamesFile = path.join(path.dirname(new URL(import.meta.url).pathname), '.cache', `games_${season}.json`);
    if (!fs.existsSync(gamesFile)) continue;
    const games = JSON.parse(fs.readFileSync(gamesFile, 'utf8'));
    const weeks = [...new Set(games.map((g) => g.week))].sort((a, b) => a - b);

    for (const week of weeks) {
      const gpFile = path.join(path.dirname(new URL(import.meta.url).pathname), '.cache', `game_players_${season}_w${week}.json`);
      if (!fs.existsSync(gpFile)) continue;
      const data = JSON.parse(fs.readFileSync(gpFile, 'utf8'));

      for (const game of data) {
        for (const team of game.teams) {
          const tsid = `${team.team}-${season}`;
          const passingCat = team.categories.find((c) => c.name === 'passing');
          const receivingCat = team.categories.find((c) => c.name === 'receiving');

          if (passingCat) {
            const attType = passingCat.types.find((t) => t.name === 'C/ATT');
            if (attType) {
              for (const ath of attType.athletes) {
                if (!ath.id || ath.id.startsWith('-')) continue;
                const parts = ath.stat.split('/');
                const att = Number(parts[1]) || 0;
                if (att > 0) {
                  if (!qbAttempts.has(tsid)) qbAttempts.set(tsid, new Map());
                  const m = qbAttempts.get(tsid);
                  m.set(ath.id, (m.get(ath.id) || 0) + att);
                  teamAttempts.set(tsid, (teamAttempts.get(tsid) || 0) + att);
                }
              }
            }
          }

          if (receivingCat) {
            const recType = receivingCat.types.find((t) => t.name === 'REC');
            const tdType = receivingCat.types.find((t) => t.name === 'TD');
            if (recType) {
              for (const ath of recType.athletes) {
                if (!ath.id || ath.id.startsWith('-')) continue;
                const key = `${ath.id}|${season}`;
                let e = recvStats.get(key);
                if (!e) { e = { rec: 0, recTd: 0, tsid, name: ath.name }; recvStats.set(key, e); }
                e.rec += Number(ath.stat) || 0;
              }
            }
            if (tdType) {
              for (const ath of tdType.athletes) {
                if (!ath.id || ath.id.startsWith('-')) continue;
                const key = `${ath.id}|${season}`;
                let e = recvStats.get(key);
                if (e) e.recTd += Number(ath.stat) || 0;
              }
            }
          }
        }
      }
    }
    process.stderr.write(`  battery ${season}\n`);
  }

  const primaryQB = new Map();
  for (const [tsid, m] of qbAttempts) {
    const total = teamAttempts.get(tsid) || 0;
    if (!total) continue;
    const [key, att] = [...m.entries()].sort((a, b) => b[1] - a[1])[0];
    const share = att / total;
    if (share >= PRIMARY_QB_ATTEMPT_SHARE) primaryQB.set(tsid, { key, share });
  }

  const nameOf = new Map(players.map((p) => [`${p.player_id}|${p.season}`, p.name]));
  const posOf = new Map(players.map((p) => [`${p.player_id}|${p.season}`, p.position]));
  const battery = {};
  let pairs = 0, skippedSplit = 0;
  const splitSeen = new Set();

  for (const [key, e] of recvStats) {
    if (!eligibleKeys.has(key)) continue;
    const pos = posOf.get(key);
    if (!['WR', 'TE'].includes(pos)) continue;
    if (e.rec < BATTERY_MIN_RECEPTIONS && e.recTd < BATTERY_MIN_REC_TDS) continue;
    const qb = primaryQB.get(e.tsid);
    if (!qb) { if (!splitSeen.has(e.tsid)) { splitSeen.add(e.tsid); skippedSplit++; } continue; }
    const qbKey = `${qb.key}|${key.split('|')[1]}`;
    if (!eligibleKeys.has(qbKey)) continue;
    const season = Number(key.split('|')[1]);
    const qbName = nameOf.get(qbKey) ?? '';
    const label = e.recTd >= BATTERY_MIN_REC_TDS
      ? `${qbName.split(' ').pop()} threw ${e.name.split(' ').pop()} ${e.recTd} touchdowns in ${season}`
      : `${qbName.split(' ').pop()} threw ${e.name.split(' ').pop()} ${e.rec} catches in ${season}`;
    (battery[qbKey] ??= []).push({ receiver: key, receptions: e.rec, rec_tds: e.recTd, label });
    pairs++;
  }
  for (const list of Object.values(battery)) list.sort((a, b) => b.rec_tds - a.rec_tds || b.receptions - a.receptions);
  fs.writeFileSync(path.join(DATA_DIR, 'cfb_battery.json'), JSON.stringify(battery));

  // ─── coaches ───────────────────────────────────────────────────────────────
  process.stderr.write('loading coaches...\n');
  const coaches = {};
  let coachCount = 0;
  for (const season of SEASONS) {
    const data = await cfbdFetchRetry(
      '/coaches',
      { year: season },
      `coaches_${season}.json`,
    );
    for (const coach of data) {
      for (const s of coach.seasons) {
        if (s.year !== season) continue;
        const tsid = `${s.school}-${season}`;
        if (!coaches[tsid]) {
          coaches[tsid] = {
            hc: `${coach.firstName} ${coach.lastName}`,
            oc: null,
          };
          coachCount++;
        }
      }
    }
    process.stderr.write(`  coaches ${season}\n`);
  }
  fs.writeFileSync(path.join(DATA_DIR, 'cfb_coaches.json'), JSON.stringify(coaches));

  // ─── curated ───────────────────────────────────────────────────────────────
  const curated = {
    family: [
      { a: 'Peyton Manning', b: 'Eli Manning', kind: 'brothers', label: 'Manning brothers' },
      { a: 'Peyton Manning', b: 'Arch Manning', kind: 'uncle/nephew', label: 'Manning family' },
      { a: 'Eli Manning', b: 'Arch Manning', kind: 'uncle/nephew', label: 'Manning family' },
      { a: 'Travis Etienne', b: "D'Joun Etienne", kind: 'brothers', label: 'Etienne brothers' },
      { a: 'Brock Bowers', b: 'Brayden Bowers', kind: 'brothers', label: 'Bowers brothers' },
      { a: 'Trey Lance', b: 'Bryce Lance', kind: 'brothers', label: 'Lance brothers' },
      { a: "Ja'Marr Chase", b: "Ja'Lynn Polk", kind: 'cousins', label: 'Chase & Polk cousins' },
    ],
    rivalry: [
      { a: 'Alabama', b: 'Auburn', label: 'Iron Bowl' },
      { a: 'Michigan', b: 'Ohio State', label: 'The Game' },
      { a: 'Texas', b: 'Oklahoma', label: 'Red River Rivalry' },
      { a: 'USC', b: 'UCLA', label: 'LA Crosstown Rivalry' },
      { a: 'Notre Dame', b: 'USC', label: 'Notre Dame vs USC' },
      { a: 'Florida', b: 'Georgia', label: "World's Largest Outdoor Cocktail Party" },
      { a: 'Florida', b: 'Florida State', label: 'Florida vs Florida State' },
      { a: 'Clemson', b: 'South Carolina', label: 'Palmetto Bowl' },
      { a: 'Georgia', b: 'Georgia Tech', label: 'Clean, Old-Fashioned Hate' },
      { a: 'LSU', b: 'Alabama', label: 'LSU-Alabama' },
      { a: 'Oregon', b: 'Oregon State', label: 'Civil War' },
      { a: 'Oklahoma', b: 'Oklahoma State', label: 'Bedlam' },
      { a: 'Army', b: 'Navy', label: 'Army-Navy' },
      { a: 'Miami', b: 'Florida State', label: 'Miami-FSU' },
      { a: 'Penn State', b: 'Ohio State', label: 'Penn State-Ohio State' },
      { a: 'Wisconsin', b: 'Minnesota', label: "Paul Bunyan's Axe" },
    ],
  };
  fs.writeFileSync(path.join(DATA_DIR, 'cfb_curated.json'), JSON.stringify(curated, null, 2));

  // ─── report ─────────────────────────────────────────────────────────────────
  const kb = (f) => (fs.statSync(path.join(DATA_DIR, f)).size / 1024).toFixed(0);
  console.log(`cfb_battery.json  ${pairs} pairs across ${Object.keys(battery).length} QB-seasons (${kb('cfb_battery.json')} KB)`);
  console.log(`  skipped ${skippedSplit} team-seasons with no majority passer`);
  console.log(`cfb_coaches.json  ${coachCount} team-seasons (${kb('cfb_coaches.json')} KB)`);
  console.log(`cfb_curated.json  ${curated.family.length} family, ${curated.rivalry.length} rivalry (${kb('cfb_curated.json')} KB)`);

  // Spot checks
  const joe19 = Object.entries(battery).find(([k]) => {
    const name = nameOf.get(k);
    return name && name.includes('Burrow') && k.includes('2019');
  });
  if (joe19) {
    console.log('\nspot check, 2019 LSU battery (Joe Burrow):');
    for (const l of joe19[1]) console.log(`  ${l.label}`);
  }

  const most = Object.entries(battery).sort((a, b) =>
    (b[1][0]?.rec_tds ?? 0) - (a[1][0]?.rec_tds ?? 0)).slice(0, 4);
  console.log('\nhighest-TD batteries in the pool:');
  for (const [qbKey, list] of most) {
    console.log(`  ${nameOf.get(qbKey) ?? qbKey}: ${list[0].label}`);
  }

  console.log('\nderived at runtime (not precomputed):');
  console.log('  Teammates  = same team_season_id');
  console.log('  Program    = same school, different season');
  console.log('  Home state = same home_state');
  console.log('  Conference = same conference');
  const totalKB = ['cfb_battery.json', 'cfb_coaches.json', 'cfb_curated.json']
    .reduce((s, f) => s + Number(kb(f)), 0);
  console.log(`\nchemistry payload: ${totalKB} KB total`);
}

main().catch((e) => { console.error(e); process.exit(1); });
