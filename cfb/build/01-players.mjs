/* Stage 1, cfb_player_seasons.
 *
 *   CFBD_KEY=... node cfb/build/01-players.mjs
 *
 * Fetches per-game player stats from the CFBD API, computes PPR fantasy points
 * per game, aggregates to season-level mean/SD, and prices via a VOR curve
 * scaled to the $11M NIL budget.
 *
 * PRICING: same value-over-replacement approach as the NFL game, scaled 10×
 * smaller to fit the NIL budget. See football/build/01-players.mjs for the
 * full rationale on why VOR pricing eliminates cross-position and cross-era
 * arbitrage.
 */

import fs from 'node:fs';
import path from 'node:path';

import {
  SEASONS, POSITIONS, MIN_GAMES, DATA_DIR, BUILD_DIR,
  cfbdFetchRetry, isDrawable,
  mean, stdev, quantileSorted, round, writePair,
} from './lib.mjs';
import { secondPosition } from './dual-positions.mjs';

// ─── pricing constants (NIL scale, 10× smaller than NFL) ────────────────────

export const BASE_PRICE = 0.3;
export const MAX_PRICE = 4.8;
export const PRICE_K = 1.8;
export const BASELINE_RANK = 120;

export const SLOT_ELIGIBILITY = {
  QB: ['QB'], RB: ['RB'], WR: ['WR'], TE: ['TE'], FLEX: ['RB', 'WR', 'TE'],
};

// ─── badges ─────────────────────────────────────────────────────────────────

const HEADLINE = [
  { key: 'passing_yards',   pos: ['QB'], label: 'passing yards' },
  { key: 'passing_tds',     pos: ['QB'], label: 'passing TDs' },
  { key: 'rushing_yards',   pos: ['RB', 'WR', 'QB'], label: 'rushing yards' },
  { key: 'rushing_tds',     pos: ['RB', 'WR', 'QB'], label: 'rushing TDs' },
  { key: 'receiving_yards', pos: ['WR', 'TE', 'RB'], label: 'receiving yards' },
  { key: 'receiving_tds',   pos: ['WR', 'TE', 'RB'], label: 'receiving TDs' },
  { key: 'receptions',      pos: ['WR', 'TE', 'RB'], label: 'catches' },
];

const MILESTONES = [
  { pos: ['QB'], test: (t) => t.passing_yards >= 4000, label: '4,000 yard season' },
  { pos: ['QB'], test: (t) => t.passing_tds >= 35, label: '35 TD passes' },
  { pos: ['QB'], test: (t) => t.passing_yards >= 5000, label: '5,000 yard season' },
  { pos: ['RB'], test: (t) => t.rushing_yards >= 1500, label: '1,500 yard season' },
  { pos: ['RB'], test: (t) => t.rushing_yards >= 2000, label: '2,000 yard season' },
  { pos: ['WR', 'TE'], test: (t) => t.receiving_yards >= 1200, label: '1,200 yards receiving' },
  { pos: ['WR', 'TE'], test: (t) => t.receiving_yards >= 1500, label: '1,500 yards receiving' },
  { pos: ['WR', 'TE', 'RB'], test: (t) => t.receptions >= 80, label: '80 catches' },
  { pos: ['RB', 'WR', 'TE'], test: (t) => t.rushing_tds + t.receiving_tds >= 15, label: '15 touchdowns' },
  { pos: ['RB', 'WR', 'TE'], test: (t) => t.rushing_tds + t.receiving_tds >= 20, label: '20 touchdowns' },
];

const ordinal = (n) => (n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`);

function buildBadges(rows) {
  const bySeason = {};
  for (const r of rows) (bySeason[r.season] ??= []).push(r);

  for (const season of Object.keys(bySeason)) {
    const group = bySeason[season];
    for (const h of HEADLINE) {
      const ranked = group
        .filter((r) => h.pos.includes(r.position) && r.tot[h.key] > 0)
        .sort((a, b) => b.tot[h.key] - a.tot[h.key]);
      ranked.forEach((r, i) => {
        if (i === 0) r._badges.push({ kind: 'led', text: `Led FBS in ${h.label}` });
        else if (i < 3) r._badges.push({ kind: 'top', text: `${ordinal(i + 1)} in FBS in ${h.label}` });
      });
    }
  }
  for (const r of rows) {
    for (const m of MILESTONES) {
      if (m.pos.includes(r.position) && m.test(r.tot)) r._badges.push({ kind: 'mile', text: m.label });
    }
    const led = r._badges.filter((x) => x.kind === 'led');
    const top = r._badges.filter((x) => x.kind === 'top');
    const mile = r._badges.filter((x) => x.kind === 'mile');
    r._badges = led.concat(top).slice(0, 2).concat(mile.slice(0, 1)).slice(0, 3);
  }
}

// ─── mode split ─────────────────────────────────────────────────────────────

function modeSplit(t, games, actualPpg) {
  const pass = 0.04 * t.passing_yards + 4 * t.passing_tds - 2 * t.passing_interceptions;
  const rush = 0.1 * t.rushing_yards + 6 * t.rushing_tds;
  const rec = 0.1 * t.receiving_yards + 6 * t.receiving_tds + 1 * t.receptions;
  const raw = pass + rush + rec;
  const perGame = (v) => (games > 0 ? v / games : 0);
  if (raw <= 0) return { pass_ppg: 0, rush_ppg: 0, rec_ppg: 0 };
  const k = actualPpg / perGame(raw);
  return {
    pass_ppg: round(perGame(pass) * k, 2),
    rush_ppg: round(perGame(rush) * k, 2),
    rec_ppg: round(perGame(rec) * k, 2),
  };
}

function statLine(position, t) {
  const n = (v) => v.toLocaleString('en-US');
  const parts = [];
  if (t.completions >= 30) {
    parts.push(`${n(t.passing_yards)} pass yds`, `${t.passing_tds} TD`, `${t.passing_interceptions} INT`);
  }
  const runs = t.rushing_yards > 0
    && (position === 'RB' ? t.carries > 0 : (t.rushing_yards >= 100 || t.rushing_tds >= 2));
  if (runs) parts.push(`${n(t.rushing_yards)} rush yds`, `${t.rushing_tds} TD`);
  if (t.receptions >= 8 || (['WR', 'TE'].includes(position) && t.receptions > 0)) {
    parts.push(`${t.receptions} rec`, `${n(t.receiving_yards)} yds`, `${t.receiving_tds} TD`);
  }
  return parts.join(', ');
}

const STAT_KEYS = [
  'completions', 'attempts', 'passing_yards', 'passing_tds', 'passing_interceptions',
  'carries', 'rushing_yards', 'rushing_tds',
  'receptions', 'receiving_yards', 'receiving_tds',
];

// ─── CFBD game stats parser ─────────────────────────────────────────────────

/**
 * Parse CFBD /games/players response into flat per-player-game records.
 * The API returns: game → teams[] → categories[] → types[] → athletes[].
 * We flatten this into { playerId, playerName, team, gameId, stats }.
 */
function parseGamePlayers(gamesData) {
  const records = [];
  for (const game of gamesData) {
    const gameId = game.id;
    for (const team of game.teams) {
      const teamName = team.team;
      const byPlayer = new Map();

      for (const cat of team.categories) {
        for (const type of cat.types) {
          for (const ath of type.athletes) {
            if (!ath.id || ath.id.startsWith('-')) continue;
            let p = byPlayer.get(ath.id);
            if (!p) {
              p = { playerId: ath.id, playerName: ath.name, team: teamName, gameId, stats: {} };
              byPlayer.set(ath.id, p);
            }
            const key = `${cat.name}_${type.name}`;
            p.stats[key] = ath.stat;
          }
        }
      }

      for (const p of byPlayer.values()) records.push(p);
    }
  }
  return records;
}

/** Compute PPR fantasy points from a parsed game-player record. */
function computeFantasyPPR(stats) {
  const num = (key) => {
    const v = stats[key];
    if (v === undefined || v === null) return 0;
    return Number(v) || 0;
  };

  // Passing C/ATT comes as "13/18", parse both
  let completions = 0, passAttempts = 0;
  const catt = stats['passing_C/ATT'];
  if (catt && typeof catt === 'string') {
    const parts = catt.split('/');
    completions = Number(parts[0]) || 0;
    passAttempts = Number(parts[1]) || 0;
  }

  const passYds = num('passing_YDS');
  const passTDs = num('passing_TD');
  const passINTs = num('passing_INT');
  const rushYds = num('rushing_YDS');
  const rushTDs = num('rushing_TD');
  const carries = num('rushing_CAR');
  const rec = num('receiving_REC');
  const recYds = num('receiving_YDS');
  const recTDs = num('receiving_TD');

  const ppr = 0.04 * passYds + 4 * passTDs - 2 * passINTs
            + 0.1 * rushYds + 6 * rushTDs
            + 0.1 * recYds + 6 * recTDs + 1 * rec;

  return {
    ppr,
    completions, attempts: passAttempts,
    passing_yards: passYds, passing_tds: passTDs, passing_interceptions: passINTs,
    carries, rushing_yards: rushYds, rushing_tds: rushTDs,
    receptions: rec, receiving_yards: recYds, receiving_tds: recTDs,
  };
}

// ─── load ───────────────────────────────────────────────────────────────────

async function loadPositions() {
  process.stderr.write('loading positions (season stats + rosters + inference)...\n');
  const positions = new Map();

  // Source 1: season-level stats (best coverage for 2007+)
  for (const season of SEASONS) {
    for (const category of ['passing', 'rushing', 'receiving']) {
      const data = await cfbdFetchRetry(
        '/stats/player/season',
        { year: season, seasonType: 'regular', category },
        `season_stats_${category}_${season}.json`,
      );
      for (const row of data) {
        if (!row.playerId || !row.position) continue;
        const pos = row.position;
        if (!POSITIONS.includes(pos)) continue;
        const key = `${row.playerId}|${season}`;
        if (!positions.has(key)) {
          positions.set(key, { position: pos, team: row.team, conference: row.conference });
        }
      }
    }
    process.stderr.write(`  season stats ${season} \r`);
  }
  process.stderr.write('\n');

  // Source 2: rosters (fills in older years where season stats are sparse)
  for (const season of SEASONS) {
    const data = await cfbdFetchRetry(
      '/roster',
      { year: season },
      `roster_${season}.json`,
    );
    for (const p of data) {
      if (!p.id || !p.position) continue;
      const pos = p.position;
      if (!POSITIONS.includes(pos)) continue;
      const key = `${p.id}|${season}`;
      if (!positions.has(key)) {
        positions.set(key, { position: pos, team: p.team, conference: null });
      }
    }
    process.stderr.write(`  rosters ${season} \r`);
  }
  process.stderr.write('\n');
  return positions;
}

/**
 * Infer position from game stats when neither season stats nor roster has it.
 * Uses the accumulated season totals to distinguish QB/RB/WR/TE.
 */
function inferPosition(tot) {
  if (tot.attempts >= 50 && tot.passing_yards >= 200) return 'QB';
  if (tot.carries >= 30 && tot.rushing_yards >= 100
      && tot.receptions < tot.carries) return 'RB';
  if (tot.receptions >= 10) return 'WR';
  if (tot.carries >= 20) return 'RB';
  return null;
}

async function loadRosters() {
  process.stderr.write('loading rosters for home state data...\n');
  const playerInfo = new Map();

  for (const season of SEASONS) {
    const data = await cfbdFetchRetry(
      '/roster',
      { year: season },
      `roster_${season}.json`,
    );
    for (const p of data) {
      if (!p.id) continue;
      const existing = playerInfo.get(String(p.id));
      playerInfo.set(String(p.id), {
        homeState: p.homeState || existing?.homeState || null,
        homeCity: p.homeCity || existing?.homeCity || null,
        year: p.year || existing?.year || null,
      });
    }
    process.stderr.write(`  rosters ${season} \r`);
  }
  process.stderr.write('\n');
  return playerInfo;
}

async function loadGameStats() {
  process.stderr.write('loading per-game player stats...\n');

  /** @type {Map<string, {weeks: number[], teams: Record<string, number>, tot: Record<string, number>, name: string}>} */
  const byPlayerSeason = new Map();

  for (const season of SEASONS) {
    // Determine how many weeks this season had
    const games = await cfbdFetchRetry(
      '/games',
      { year: season, seasonType: 'regular', classification: 'fbs' },
      `games_${season}.json`,
    );
    const weeks = [...new Set(games.map((g) => g.week))].sort((a, b) => a - b);

    for (const week of weeks) {
      const data = await cfbdFetchRetry(
        '/games/players',
        { year: season, week, seasonType: 'regular', classification: 'fbs' },
        `game_players_${season}_w${week}.json`,
      );

      const records = parseGamePlayers(data);
      for (const rec of records) {
        const fp = computeFantasyPPR(rec.stats);
        // Skip players with essentially no offensive contribution
        if (fp.ppr === 0 && fp.completions === 0 && fp.receptions === 0
            && fp.carries === 0 && fp.rushing_yards === 0) continue;

        const key = `${rec.playerId}|${season}`;
        let e = byPlayerSeason.get(key);
        if (!e) {
          e = {
            player_id: rec.playerId,
            name: rec.playerName,
            season,
            weeks: [],
            teams: {},
            tot: Object.fromEntries(STAT_KEYS.map((k) => [k, 0])),
          };
          byPlayerSeason.set(key, e);
        }
        e.weeks.push(fp.ppr);
        // Accumulate season totals
        e.tot.completions += fp.completions;
        e.tot.attempts += fp.attempts;
        e.tot.passing_yards += fp.passing_yards;
        e.tot.passing_tds += fp.passing_tds;
        e.tot.passing_interceptions += fp.passing_interceptions;
        e.tot.carries += fp.carries;
        e.tot.rushing_yards += fp.rushing_yards;
        e.tot.rushing_tds += fp.rushing_tds;
        e.tot.receptions += fp.receptions;
        e.tot.receiving_yards += fp.receiving_yards;
        e.tot.receiving_tds += fp.receiving_tds;
        // Track which team they played for most
        const t = rec.team;
        if (t) e.teams[t] = (e.teams[t] || 0) + 1;
      }
    }
    process.stderr.write(`  game stats ${season} (${weeks.length} weeks)\n`);
  }
  return [...byPlayerSeason.values()];
}

// ─── build ──────────────────────────────────────────────────────────────────

async function main() {
  const positions = await loadPositions();
  const rosterInfo = await loadRosters();
  const raw = await loadGameStats();

  // Assign positions: season stats / roster first, then infer from game stats
  let posFromApi = 0, posInferred = 0, posSkipped = 0;
  const withPosition = raw.filter((p) => {
    const key = `${p.player_id}|${p.season}`;
    const info = positions.get(key);
    if (info && POSITIONS.includes(info.position)) {
      p.position = info.position;
      p.apiTeam = info.team || Object.entries(p.teams).sort((a, b) => b[1] - a[1])[0]?.[0];
      p.apiConference = info.conference;
      posFromApi++;
      return true;
    }
    const inferred = inferPosition(p.tot);
    if (inferred) {
      p.position = inferred;
      p.apiTeam = Object.entries(p.teams).sort((a, b) => b[1] - a[1])[0]?.[0];
      p.apiConference = null;
      posInferred++;
      return true;
    }
    posSkipped++;
    return false;
  });

  process.stderr.write(`positions: ${posFromApi} from API, ${posInferred} inferred, ${posSkipped} skipped\n`);

  // Build team->conference lookup from cached games data for players missing conference
  const teamConfLookup = new Map();
  for (const season of SEASONS) {
    const gamesFile = path.join(BUILD_DIR, '.cache', `games_${season}.json`);
    if (fs.existsSync(gamesFile)) {
      const games = JSON.parse(fs.readFileSync(gamesFile, 'utf8'));
      for (const g of games) {
        if (g.homeTeam && g.homeConference) teamConfLookup.set(`${g.homeTeam}|${season}`, g.homeConference);
        if (g.awayTeam && g.awayConference) teamConfLookup.set(`${g.awayTeam}|${season}`, g.awayConference);
      }
    }
  }

  // Fill in missing conferences
  for (const p of withPosition) {
    if (!p.apiConference && p.apiTeam) {
      p.apiConference = teamConfLookup.get(`${p.apiTeam}|${p.season}`) || null;
    }
  }

  // Eligibility: enough games for the weekly variance estimate to mean anything
  const eligible = withPosition
    .filter((p) => p.weeks.length >= MIN_GAMES)
    .map((p) => {
      const team = Object.entries(p.teams).sort((a, b) => b[1] - a[1])[0]?.[0] ?? p.apiTeam;
      return {
        player_id: p.player_id,
        name: p.name,
        season: p.season,
        school: team,
        team_season_id: team ? `${team}-${p.season}` : null,
        position: p.position,
        conference: p.apiConference,
        games_played: p.weeks.length,
        ppr_ppg_mean: mean(p.weeks),
        ppr_ppg_sd: stdev(p.weeks),
        tot: p.tot,
        multi_team: Object.keys(p.teams).length > 1,
        home_state: rosterInfo.get(String(p.player_id))?.homeState ?? null,
      };
    });

  // Filter to drawable team-seasons (P5 + notable G5)
  const drawable = eligible.filter((p) =>
    isDrawable(p.school, p.season, p.conference));

  console.log(`eligible: ${eligible.length} total, ${drawable.length} from drawable programs`);

  // Baseline per season, pooled across positions, in absolute PPG
  const baseline = new Map();
  for (const season of SEASONS) {
    const desc = drawable
      .filter((p) => p.season === season)
      .map((p) => p.ppr_ppg_mean)
      .sort((a, b) => b - a);
    if (!desc.length) continue;
    baseline.set(season, desc[Math.min(desc.length - 1, BASELINE_RANK - 1)]);
  }

  for (const p of drawable) {
    p.baseline_ppg = baseline.get(p.season) ?? 0;
    p.vor = p.ppr_ppg_mean - p.baseline_ppg;
  }

  const vorAsc = drawable.map((p) => p.vor).sort((a, b) => a - b);
  const VOR_LO = quantileSorted(vorAsc, 0.01);
  const VOR_REF = quantileSorted(vorAsc, 0.99);

  const priceOf = (vor) => {
    const t = (vor - VOR_LO) / (VOR_REF - VOR_LO);
    return BASE_PRICE + (MAX_PRICE - BASE_PRICE) * Math.pow(Math.min(1, Math.max(0, t)), PRICE_K);
  };

  for (const p of drawable) {
    p.price_musd = priceOf(p.vor);
    const peers = drawable
      .filter((q) => q.season === p.season && q.position === p.position)
      .map((q) => q.ppr_ppg_mean)
      .sort((a, b) => a - b);
    p.position_percentile = peers.filter((v) => v < p.ppr_ppg_mean).length / Math.max(1, peers.length - 1);
  }

  for (const p of drawable) p._badges = [];
  buildBadges(drawable);

  const rows = drawable
    .sort((a, b) => b.vor - a.vor)
    .map((p) => ({
      player_id: p.player_id,
      name: p.name,
      season: p.season,
      school: p.school,
      team_season_id: p.team_season_id,
      position: p.position,
      conference: p.conference,
      games_played: p.games_played,
      ppr_ppg_mean: round(p.ppr_ppg_mean, 2),
      ppr_ppg_sd: round(p.ppr_ppg_sd, 2),
      position_percentile: round(p.position_percentile, 4),
      price_musd: round(p.price_musd, 1),
      fppg: round(p.ppr_ppg_mean, 1),
      ...modeSplit(p.tot, p.games_played, p.ppr_ppg_mean),
      stat_line: statLine(p.position, p.tot),
      badges: p._badges.map((x) => x.text),
      home_state: p.home_state,
    }))
    /* A second position for the men who played two. CFBD carries one position
       per player and applies it to every season of their career, so this is
       derived from what they actually did: see cfb/build/dual-positions.mjs,
       which owns the rule and can also be run on its own against the built
       file. Applied last, because it reads the per-phase splits above. */
    .map((r) => { const alt = secondPosition(r); return alt ? { ...r, alt_position: alt } : r; });

  const csvRows = rows.map((r, i) => ({
    ...r,
    vor: round(drawable.sort((a, b) => b.vor - a.vor)[i].vor, 2),
    multi_team: drawable.sort((a, b) => b.vor - a.vor)[i].multi_team,
  }));

  const out = writePair('cfb_player_seasons', rows, Object.keys(rows[0]), csvRows,
    Object.keys(csvRows[0]));

  // ─── report ─────────────────────────────────────────────────────────────────
  console.log(`\ncfb_player_seasons: ${rows.length} eligible player-seasons ` +
              `(${SEASONS[0]}-${SEASONS.at(-1)}, >=${MIN_GAMES} games, P5 + notable G5)`);
  if (baseline.has(SEASONS[0]) && baseline.has(SEASONS.at(-1))) {
    console.log(`baseline = rank ${BASELINE_RANK} skill player each season ` +
                `(${baseline.get(SEASONS[0]).toFixed(1)} ppg in ${SEASONS[0]} -> ` +
                `${baseline.get(SEASONS.at(-1)).toFixed(1)} ppg in ${SEASONS.at(-1)})`);
  }
  console.log(`VOR anchors: p01 ${VOR_LO.toFixed(2)}  p99 ${VOR_REF.toFixed(2)}   K=${PRICE_K}`);
  console.log(`wrote ${out.json} (${(out.bytes / 1024).toFixed(0)} KB) + .csv\n`);

  const byPos = {};
  for (const p of rows) (byPos[p.position] ??= []).push(p);
  console.log('per position:');
  for (const pos of POSITIONS) {
    const g = byPos[pos] ?? [];
    const prices = g.map((p) => p.price_musd).sort((a, b) => a - b);
    if (!prices.length) { console.log(`  ${pos}  n=   0`); continue; }
    console.log(`  ${pos}  n=${String(g.length).padStart(4)}  ` +
      `median $${quantileSorted(prices, 0.5).toFixed(1)}M  ` +
      `p90 $${quantileSorted(prices, 0.9).toFixed(1)}M  ` +
      `max $${prices.at(-1).toFixed(1)}M`);
  }

  console.log('\nFLEX neutrality, at equal price, expected ppg by position:');
  for (const budget of [0.5, 1.0, 2.0, 3.5]) {
    const line = POSITIONS.map((pos) => {
      const near = (byPos[pos] ?? [])
        .filter((p) => Math.abs(p.price_musd - budget) <= 0.15);
      if (!near.length) return `${pos},`;
      return `${pos} ${mean(near.map((p) => p.ppr_ppg_mean)).toFixed(1)}`;
    }).join('   ');
    console.log(`  ~$${budget.toFixed(1)}M: ${line}`);
  }

  const bestAt = (positions, taken) => (rows
    .filter((p) => positions.includes(p.position) && !taken.has(`${p.player_id}|${p.season}`))
    .sort((a, b) => b.ppr_ppg_mean - a.ppr_ppg_mean)[0]);
  const taken = new Set();
  let dream = 0;
  for (const [, allowed] of Object.entries(SLOT_ELIGIBILITY)) {
    const c = bestAt(allowed, taken);
    if (!c) continue;
    taken.add(`${c.player_id}|${c.season}`);
    dream += c.price_musd;
  }
  console.log(`\nall-best roster costs $${dream.toFixed(1)}M against the $11M cap, ` +
              `${dream > 14 ? 'choices forced' : 'CAP DOES NOT BIND'}`);

  console.log('\nmost expensive player-seasons:');
  for (const p of rows.slice(0, 8)) {
    console.log(`  $${p.price_musd.toFixed(1).padStart(4)}M  ${p.position} ${p.name} ${p.season} ` +
                `(${p.ppr_ppg_mean} ppg)`);
  }

  const atFloor = rows.filter((p) => p.price_musd <= BASE_PRICE + 0.001).length;
  console.log(`\n${atFloor} player-seasons (${(100 * atFloor / rows.length).toFixed(0)}%) sit at the ` +
              `$${BASE_PRICE}M floor.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
