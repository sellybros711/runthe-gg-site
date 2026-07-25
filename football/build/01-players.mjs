/* Stage 1, player_seasons.
 *
 *   node football/build/01-players.mjs
 *
 * Produces data/player_seasons.{json,csv}: one row per eligible player-season,
 * with weekly PPR mean/SD and a price.
 *
 * PRICING, value over replacement, not raw percentile.
 * ----------------------------------------------------
 * The GDD priced on percentile within position-and-season. That decouples price
 * from payoff, because price came from *relative* rank while the sim pays
 * *absolute* fantasy points. It opened two exploits, both measured on real data:
 *
 *   1. Cross-position. At the same percentile a TE and a WR cost the same, but
 *      the WR scores far more (2007: p99 TE 15.7 ppg vs p99 WR 21.2 ppg, both
 *      $46.7M). Optimal play was always "punt TE to the $3M floor, spend at
 *      RB/QB", and FLEX was never a TE.
 *   2. Cross-era. The best QB of every season priced at the cap maximum
 *      regardless of output, 2001 Jeff Garcia (18.6 ppg) cost the same $48.0M
 *      as 2013 Peyton Manning (25.6 ppg). "Never draft from a low-scoring era"
 *      was free money.
 *
 * Both vanish if price is a function of production over positional replacement:
 *
 *      VOR   = ppg - replacement_ppg(position, season)
 *      price = BASE + (MAX-BASE) * clamp(VOR / VOR_REF, 0, 1) ^ K
 *
 * Price then depends only on VOR, so equal VOR costs equal money whatever the
 * position or the year, verified in the report this script prints. The GDD's
 * era-fairness intent survives, relocated: replacement level is computed per
 * season, so a high-scoring era raises its own bar, but it does so in absolute
 * points and therefore never decouples price from payoff.
 *
 * VOR_REF is the 99th-percentile VOR over the whole pool, not the maximum. The
 * maximum is a lone outlier (Marshall Faulk 2001) and anchoring on it compressed
 * every other player into the bottom of the price range, which stopped the cap
 * from binding at all.
 *
 * K is 1.8, not the GDD's 3.0. Convexity now sits on VOR, which is already
 * right-skewed, rather than on a uniform percentile. At K=3 the top saturated,
 * VOR 8 and VOR 16 both priced ~$47M, so the best available was always correct.
 * The GDD's "lower k toward 2.4" tuning note does not transfer to this curve.
 */

import {
  SEASONS, POSITIONS, MIN_GAMES, nflverseCSV, parseCSVObjects,
  mean, stdev, quantileSorted, round, writePair,
  franchiseId, franchiseName,
} from './lib.mjs';

// ─── pricing constants ───────────────────────────────────────────────────────

export const BASE_PRICE = 3.0;
export const MAX_PRICE = 48.0;
export const PRICE_K = 1.8;

/**
 * Baseline = the Nth-best skill player-season that year, pooled across ALL
 * positions rather than computed per position.
 *
 * Positional replacement (the standard fantasy VOR approach) is wrong here. It
 * is built for a real draft, where you choose which position to spend on across
 * many roster spots and scarcity is the whole point. This roster is fixed-shape:
 * five of six slots are position-locked, so scarcity pricing buys nothing and
 * actively distorts the one slot that is open. With per-position replacement,
 * a TE and an RB at equal VOR still had unequal points (TE replacement sat
 * ~1.5 ppg lower), so FLEX quietly still preferred an RB.
 *
 * A single pooled baseline makes price a function of absolute points above a
 * common reference, so equal price means equal expected points everywhere,
 * across positions, across eras, and at FLEX. QBs come out systematically
 * pricier than TEs, which is correct: they score more, and you must field both.
 *
 * A fixed rank rather than a quantile, because the eligible tail deepens over
 * time (105 qualifying WRs in 2007, 153 in 2023) and a quantile would drift
 * with tail depth rather than with scoring.
 */
export const BASELINE_RANK = 150;

/** Which drafted slot each position may fill. */
export const SLOT_ELIGIBILITY = {
  QB: ['QB'], RB: ['RB'], WR: ['WR'], TE: ['TE'], FLEX: ['RB', 'WR', 'TE'],
};

// ─── load ────────────────────────────────────────────────────────────────────

async function loadWeekly() {
  /** @type {Map<string, {rows: object[]}>} keyed player_id|season */
  const byPlayerSeason = new Map();
  for (const season of SEASONS) {
    const text = await nflverseCSV('stats_player', `stats_player_week_${season}.csv`);
    for (const r of parseCSVObjects(text)) {
      // Regular season only. Playoff weeks would inflate good players' game
      // counts and mix a different opponent distribution into the variance.
      if (r.season_type !== 'REG') continue;
      if (!POSITIONS.includes(r.position)) continue;
      const key = `${r.player_id}|${season}`;
      let e = byPlayerSeason.get(key);
      if (!e) {
        e = {
          player_id: r.player_id,
          name: r.player_display_name,
          position: r.position,
          season,
          weeks: [],
          teams: {},
        };
        byPlayerSeason.set(key, e);
      }
      e.weeks.push(Number(r.fantasy_points_ppr) || 0);
      // A traded player appears under more than one team. Attribute the
      // player-season to whichever team he played the most games for; that team
      // is what the wheel will offer him under.
      const t = r.team;
      if (t) e.teams[t] = (e.teams[t] || 0) + 1;
    }
    process.stderr.write(`  weekly ${season} \r`);
  }
  return [...byPlayerSeason.values()];
}

async function loadBio() {
  const text = await nflverseCSV('players', 'players.csv');
  const bio = new Map();
  for (const r of parseCSVObjects(text)) {
    if (!r.gsis_id) continue;
    bio.set(r.gsis_id, {
      college: r.college_name || null,
      draft_year: r.draft_year ? Number(r.draft_year) : null,
      draft_round: r.draft_round ? Number(r.draft_round) : null,
    });
  }
  return bio;
}

// ─── build ───────────────────────────────────────────────────────────────────

async function main() {
  const raw = await loadWeekly();
  process.stderr.write('\n');
  const bio = await loadBio();

  // Eligibility: enough games for the weekly variance estimate to mean anything.
  const eligible = raw
    .filter((p) => p.weeks.length >= MIN_GAMES)
    .map((p) => {
      const code = Object.entries(p.teams).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
      // Normalize immediately: the raw code is not a reliable key (see lib.mjs).
      const franchise = code ? franchiseId(code) : null;
      return {
        player_id: p.player_id,
        name: p.name,
        season: p.season,
        franchise,
        team_season_id: franchise ? `${franchise}-${p.season}` : null,
        position: p.position,
        games_played: p.weeks.length,
        ppr_ppg_mean: mean(p.weeks),
        ppr_ppg_sd: stdev(p.weeks),
        multi_team: Object.keys(p.teams).length > 1,
      };
    });

  // Baseline per season, pooled across positions, in absolute PPG.
  const baseline = new Map();
  for (const season of SEASONS) {
    const desc = eligible
      .filter((p) => p.season === season)
      .map((p) => p.ppr_ppg_mean)
      .sort((a, b) => b - a);
    if (!desc.length) continue;
    baseline.set(season, desc[Math.min(desc.length - 1, BASELINE_RANK - 1)]);
  }

  for (const p of eligible) {
    p.baseline_ppg = baseline.get(p.season) ?? 0;
    p.vor = p.ppr_ppg_mean - p.baseline_ppg;
  }

  // Anchor the curve on robust quantiles at BOTH ends. Clamping the bottom at
  // VOR=0 put 72% of the pool at the $3M floor, where points-per-dollar is
  // effectively infinite, which rebuilt the "one star and five scrubs" exploit
  // the cap is supposed to prevent. Anchoring on the 1st percentile keeps price
  // discriminating all the way down.
  const vorAsc = eligible.map((p) => p.vor).sort((a, b) => a - b);
  const VOR_LO = quantileSorted(vorAsc, 0.01);
  const VOR_REF = quantileSorted(vorAsc, 0.99);

  const priceOf = (vor) => {
    const t = (vor - VOR_LO) / (VOR_REF - VOR_LO);
    return BASE_PRICE + (MAX_PRICE - BASE_PRICE) * Math.pow(Math.min(1, Math.max(0, t)), PRICE_K);
  };

  for (const p of eligible) {
    p.price_musd = priceOf(p.vor);
    // Kept for display and for the chemistry "target conflict" rule, which is
    // defined on within-position-season percentile.
    const peers = eligible
      .filter((q) => q.season === p.season && q.position === p.position)
      .map((q) => q.ppr_ppg_mean)
      .sort((a, b) => a - b);
    p.position_percentile = peers.filter((v) => v < p.ppr_ppg_mean).length / Math.max(1, peers.length - 1);
  }

  const rows = eligible
    .sort((a, b) => b.vor - a.vor)
    .map((p) => ({
      player_id: p.player_id,
      name: p.name,
      season: p.season,
      franchise: p.franchise,
      team_season_id: p.team_season_id,
      team_display: p.franchise ? franchiseName(p.franchise, p.season) : null,
      position: p.position,
      games_played: p.games_played,
      ppr_ppg_mean: round(p.ppr_ppg_mean, 2),
      ppr_ppg_sd: round(p.ppr_ppg_sd, 2),
      vor: round(p.vor, 2),
      position_percentile: round(p.position_percentile, 4),
      price_musd: round(p.price_musd, 1),
      college: bio.get(p.player_id)?.college ?? null,
      draft_year: bio.get(p.player_id)?.draft_year ?? null,
      draft_round: bio.get(p.player_id)?.draft_round ?? null,
      multi_team: p.multi_team,
    }));

  const cols = Object.keys(rows[0]);
  const out = writePair('player_seasons', rows, cols);

  // ─── report ────────────────────────────────────────────────────────────────
  console.log(`player_seasons: ${rows.length} eligible player-seasons ` +
              `(${SEASONS[0]}-${SEASONS.at(-1)}, >=${MIN_GAMES} REG games)`);
  console.log(`baseline = rank ${BASELINE_RANK} skill player each season ` +
              `(${baseline.get(1999).toFixed(1)} ppg in 1999 -> ${baseline.get(2025).toFixed(1)} ppg in 2025)`);
  console.log(`VOR anchors: p01 ${VOR_LO.toFixed(2)}  p99 ${VOR_REF.toFixed(2)}   K=${PRICE_K}`);
  console.log(`wrote ${out.json} (${(out.bytes / 1024).toFixed(0)} KB) + .csv\n`);

  const byPos = {};
  for (const p of rows) (byPos[p.position] ??= []).push(p);
  console.log('per position:');
  for (const pos of POSITIONS) {
    const g = byPos[pos] ?? [];
    const prices = g.map((p) => p.price_musd).sort((a, b) => a - b);
    console.log(`  ${pos}  n=${String(g.length).padStart(4)}  ` +
      `median $${quantileSorted(prices, 0.5).toFixed(1)}M  ` +
      `p90 $${quantileSorted(prices, 0.9).toFixed(1)}M  ` +
      `max $${prices.at(-1).toFixed(1)}M`);
  }

  // The test that matters: at equal PRICE, do you get equal POINTS regardless
  // of position? If yes there is no cross-position arbitrage, and FLEX (which
  // accepts RB/WR/TE) is genuinely open.
  console.log('\nFLEX neutrality, at equal price, expected ppg by position:');
  for (const budget of [5, 10, 20, 35]) {
    const line = POSITIONS.map((pos) => {
      const near = (byPos[pos] ?? [])
        .filter((p) => Math.abs(p.price_musd - budget) <= 1.0);
      if (!near.length) return `${pos},`;
      return `${pos} ${mean(near.map((p) => p.ppr_ppg_mean)).toFixed(1)}`;
    }).join('   ');
    console.log(`  ~$${String(budget).padStart(2)}M: ${line}`);
  }

  // Does the cap force choices? Cost of buying the best available at each slot.
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
  console.log(`\nall-best roster costs $${dream.toFixed(0)}M against the $100M cap, ` +
              `${dream > 100 ? 'choices forced' : 'CAP DOES NOT BIND'}`);

  console.log('\nmost expensive player-seasons:');
  for (const p of rows.slice(0, 8)) {
    console.log(`  $${p.price_musd.toFixed(1).padStart(5)}M  ${p.position} ${p.name} ${p.season} ` +
                `(${p.ppr_ppg_mean} ppg, VOR ${p.vor})`);
  }

  const atFloor = rows.filter((p) => p.price_musd <= BASE_PRICE + 0.001).length;
  console.log(`\n${atFloor} player-seasons (${(100 * atFloor / rows.length).toFixed(0)}%) sit at the ` +
              `$${BASE_PRICE}M floor, the streamer/replacement band.`);
  console.log(`${rows.filter((p) => p.multi_team).length} player-seasons involve a mid-season trade ` +
              `(attributed to the team with most games).`);
}

main().catch((e) => { console.error(e); process.exit(1); });
