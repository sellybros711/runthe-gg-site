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


/*
 * Badges are DERIVED from the season's real numbers, never from award ballots.
 *
 * nflverse ships no awards feed, so MVP and All-Pro would have to be a hand
 * written list, and a wrong award on a shipped player card is worse than no
 * award. Everything here is checkable against the stat line printed beside it:
 * where the player finished in the league that year, and round-number milestones
 * a fan would recognize.
 */
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
  { pos: ['QB'], test: (t) => t.passing_yards >= 5000, label: '5,000 yard season' },
  { pos: ['QB'], test: (t) => t.passing_tds >= 40, label: '40 TD passes' },
  { pos: ['RB'], test: (t) => t.rushing_yards >= 2000, label: '2,000 yard season' },
  { pos: ['RB'], test: (t) => t.rushing_yards >= 1500, label: '1,500 yards rushing' },
  { pos: ['WR', 'TE'], test: (t) => t.receiving_yards >= 1500, label: '1,500 yards receiving' },
  { pos: ['WR', 'TE', 'RB'], test: (t) => t.receptions >= 100, label: '100 catches' },
  { pos: ['RB', 'WR', 'TE'], test: (t) => t.rushing_tds + t.receiving_tds >= 15, label: '15 touchdowns' },
];

const ordinal = (n) => (n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`);

/** League rank of every player-season in each headline stat, within its season. */
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
        if (i === 0) r._badges.push({ kind: 'led', text: `Led the NFL in ${h.label}` });
        else if (i < 3) r._badges.push({ kind: 'top', text: `${ordinal(i + 1)} in ${h.label}` });
      });
    }
  }
  for (const r of rows) {
    for (const m of MILESTONES) {
      if (m.pos.includes(r.position) && m.test(r.tot)) r._badges.push({ kind: 'mile', text: m.label });
    }
    // Keep it short: the league finishes first, then one milestone.
    const led = r._badges.filter((x) => x.kind === 'led');
    const top = r._badges.filter((x) => x.kind === 'top');
    const mile = r._badges.filter((x) => x.kind === 'mile');
    r._badges = led.concat(top).slice(0, 2).concat(mile.slice(0, 1)).slice(0, 3);
  }
}

/*
 * Points per game split by HOW they were earned: throwing, running, catching.
 *
 * The sim needs this to reason about the shape of a roster rather than just its
 * total. Standard PPR weights are applied to the season totals and then scaled so
 * the three parts add up to the player's real fantasy_points_ppr, which absorbs
 * the small pieces this ignores (two point conversions, fumbles, return scores).
 */
function modeSplit(t, games, actualPpg) {
  const pass = 0.04 * t.passing_yards + 4 * t.passing_tds - 2 * t.passing_interceptions;
  const rush = 0.1 * t.rushing_yards + 6 * t.rushing_tds;
  const rec = 0.1 * t.receiving_yards + 6 * t.receiving_tds + 1 * t.receptions;
  const raw = pass + rush + rec;
  const perGame = (v) => (games > 0 ? v / games : 0);
  if (raw <= 0) return { pass_ppg: 0, rush_ppg: 0, rec_ppg: 0 };
  // Scale so the parts reconcile with the real per-game figure.
  const k = actualPpg / perGame(raw);
  return {
    pass_ppg: round(perGame(pass) * k, 2),
    rush_ppg: round(perGame(rush) * k, 2),
    rec_ppg: round(perGame(rec) * k, 2),
  };
}

/** The stat line shown beside FPPG, shaped by what the player actually did. */
function statLine(position, t) {
  const n = (v) => v.toLocaleString('en-US');
  const parts = [];
  if (t.attempts >= 50) {
    parts.push(`${n(t.passing_yards)} pass yds`, `${t.passing_tds} TD`, `${t.passing_interceptions} INT`);
  }
  // Skip a rushing line that would read as noise, like a quarterback's -31 yards
  // from taking knees.
  const runs = t.rushing_yards > 0
    && (position === 'RB' ? t.carries > 0 : (t.rushing_yards >= 100 || t.rushing_tds >= 2));
  if (runs) parts.push(`${n(t.rushing_yards)} rush yds`, `${t.rushing_tds} TD`);
  if (t.receptions >= 10 || (['WR', 'TE'].includes(position) && t.receptions > 0)) {
    parts.push(`${t.receptions} rec`, `${n(t.receiving_yards)} yds`, `${t.receiving_tds} TD`);
  }
  return parts.join(', ');
}

/** Raw weekly columns summed into season totals for the player card. */
const STAT_KEYS = [
  'completions', 'attempts', 'passing_yards', 'passing_tds', 'passing_interceptions',
  'carries', 'rushing_yards', 'rushing_tds',
  'receptions', 'targets', 'receiving_yards', 'receiving_tds',
];

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
          tot: Object.fromEntries(STAT_KEYS.map((k) => [k, 0])),
        };
        byPlayerSeason.set(key, e);
      }
      e.weeks.push(Number(r.fantasy_points_ppr) || 0);
      // Season totals, so a player's card can show what he actually did.
      for (const k of STAT_KEYS) e.tot[k] += Number(r[k]) || 0;
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
  const shape = (p) => {
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
      tot: p.tot,
      multi_team: Object.keys(p.teams).length > 1,
    };
  };
  const eligible = raw.filter((p) => p.weeks.length >= MIN_GAMES).map(shape);

  /* EVERY TEAM-SEASON HAS TO BE ABLE TO FIELD A QUARTERBACK, and a tight end.
     MIN_GAMES is there so a weekly spread means something, and it is right for almost
     everyone -- but ten team-seasons came out of it with no quarterback at all, because the
     club used two or three across the year and none of them reached eight games. The 2014
     Titans split Locker, Mettenberger and Whitehurst; the 2016 Bears split Cutler, Hoyer and
     Barkley. Three team-seasons came out with no tight end the same way.

     That matters because the wheel can land on any team-season and QB and TE are DEDICATED
     slots: those seasons could never fill them, and a board with no quarterback on it reads
     as a broken game rather than as history. So the club's primary man at the missing
     position -- most games, then most production -- is admitted even though he is short of
     the threshold. His weekly spread is a noisier estimate than everyone else's, and that is
     the honest cost of the seat existing at all. Nothing hides it: games_played ships as it
     always did, and the player sheet already prints it, so a seven-game season says so.

     Measured cost of admitting the thirteen: no existing player's points or spread move at
     all, and pricing shifts by at most $0.20M on a $3M-$48M scale (median one rounding step),
     because the season baseline and the vor anchors are quantiles that barely feel thirteen
     rows. The pool's total value moves 0.35%. */
  const DEDICATED_SLOTS = ['QB', 'TE'];
  const covered = new Set(eligible.map((p) => `${p.team_season_id}|${p.position}`));
  const spares = raw.filter((p) => p.weeks.length < MIN_GAMES).map(shape)
    .filter((p) => p.team_season_id && DEDICATED_SLOTS.includes(p.position));
  const rescued = new Map();
  for (const p of spares) {
    const key = `${p.team_season_id}|${p.position}`;
    if (covered.has(key)) continue;
    const cur = rescued.get(key);
    const better = !cur || p.games_played > cur.games_played
      || (p.games_played === cur.games_played && p.ppr_ppg_mean > cur.ppr_ppg_mean);
    if (better) rescued.set(key, p);
  }
  for (const p of rescued.values()) eligible.push(p);
  if (rescued.size) {
    process.stderr.write(`admitted ${rescued.size} primary starters below ${MIN_GAMES} games so no `
      + `team-season lacks a dedicated position:\n`);
    for (const p of rescued.values()) {
      process.stderr.write(`  ${p.team_season_id} ${p.position} ${p.name} `
        + `(${p.games_played} games, ${p.ppr_ppg_mean.toFixed(1)} ppg)\n`);
    }
  }

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

  for (const p of eligible) p._badges = [];
  buildBadges(eligible);

  /*
   * EVERY FIELD HERE IS DOWNLOADED BY EVERY VISITOR, so the JSON carries only what
   * the game reads and the CSV keeps the rest for analysis.
   *
   * Measured cost of the four that were dropped, out of a 4,240KB file:
   *   team_display  308KB   duplicate of team_seasons.json's own `display`
   *   multi_team    165KB   never read
   *   draft_round   144KB   never read
   *   vor            96KB   a build-time working value for pricing
   *
   * position_percentile stays, because the target-conflict chemistry link reads it.
   */
  const rows = eligible
    .sort((a, b) => b.vor - a.vor)
    .map((p) => ({
      player_id: p.player_id,
      name: p.name,
      season: p.season,
      franchise: p.franchise,
      team_season_id: p.team_season_id,
      position: p.position,
      games_played: p.games_played,
      ppr_ppg_mean: round(p.ppr_ppg_mean, 2),
      ppr_ppg_sd: round(p.ppr_ppg_sd, 2),
      position_percentile: round(p.position_percentile, 4),
      price_musd: round(p.price_musd, 1),
      fppg: round(p.ppr_ppg_mean, 1),
      ...modeSplit(p.tot, p.games_played, p.ppr_ppg_mean),
      stat_line: statLine(p.position, p.tot),
      badges: p._badges.map((x) => x.text),
      college: bio.get(p.player_id)?.college ?? null,
      draft_year: bio.get(p.player_id)?.draft_year ?? null,
    }));

  // The CSV is for reading by hand, so it keeps the working columns.
  const csvRows = rows.map((r, i) => ({
    ...r,
    team_display: eligible[i].franchise ? franchiseName(eligible[i].franchise, eligible[i].season) : null,
    vor: round(eligible[i].vor, 2),
    draft_round: bio.get(r.player_id)?.draft_round ?? null,
    multi_team: eligible[i].multi_team,
  }));

  const out = writePair('player_seasons', rows, Object.keys(rows[0]), csvRows,
    Object.keys(csvRows[0]));

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
