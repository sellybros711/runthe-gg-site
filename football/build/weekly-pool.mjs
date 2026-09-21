/* The draftable pool for ONE week of a live season.
 *
 *   node football/build/weekly-pool.mjs --season 2024 --week 8
 *   node football/build/weekly-pool.mjs --season 2026 --week 4 --write
 *
 * Fantasy Challenge drafts men who are playing THIS WEEK, priced on what they have done
 * SO FAR, and is scored on what they actually do. That is three different quantities and
 * this file produces the first two. The third is a lookup after the games.
 *
 * ─── WHY THIS IS NOT 01-players.mjs WITH A FILTER ───────────────────────────────────
 *
 * That script builds one row per player-SEASON, from a season that has finished, over
 * seasons 1999 to 2025, with MIN_GAMES = 8. Every one of those is wrong here. A live week
 * has no finished season, the row is a season TO DATE that changes every Sunday, and in
 * week two nobody has eight games. What carries over is the pricing curve and the argument
 * under it, which is why both are imported rather than copied.
 *
 * ─── HALF PPR, AND WHY IT IS DERIVED RATHER THAN READ ───────────────────────────────
 *
 * nflverse ships `fantasy_points` (standard) and `fantasy_points_ppr` (full) and no half.
 * Half is standard plus half a point a catch. Verified against a real week rather than
 * assumed: over all 1,079 scoring rows of 2024 week 8, `fantasy_points + receptions`
 * reproduces `fantasy_points_ppr` exactly, with no exceptions, so the two published
 * columns really are the same scoring with the reception term switched on. That identity
 * is asserted on every build below, because if it ever stops holding then half PPR stops
 * being derivable and this file must say so rather than quietly paying the wrong number.
 *
 * THE PRICE IS IN THE SAME CURRENCY AS THE SCORE. Everything else on this site is full
 * PPR (`ppr_ppg_mean`), and pricing a man on full PPR while paying him in half PPR would
 * overprice every receiver by about half a catch a game. Cheap to get right, and invisible
 * when wrong, so it is stated here and asserted in the probe.
 *
 * ─── NO LOOKAHEAD, WHICH IS LOAD-BEARING FOR THE MEASUREMENT ────────────────────────
 *
 * The pool for week N is built from weeks 1 to N-1 and from the SCHEDULE. Nothing may read
 * week N's stat rows, and the temptation is real: "everybody who has a row in week N" is
 * one filter away and would be a pool with the future in it. It would silently exclude
 * exactly the men who were inactive, hurt or rested, which are the outcomes this game is
 * asking a player to predict, and every measurement taken against it would say drafting is
 * easier than it is.
 *
 * So availability comes from `games.csv`, which is the schedule and is knowable on the
 * Tuesday. It answers one question: is this man's club playing in week N. It does NOT know
 * about injuries, and that is honest rather than complete: a man who is on the field in
 * the schedule and out in real life scores zero, and knowing which is which is the game.
 */

import fs from 'fs';
import path from 'path';
import {
  POSITIONS, nflverseCSV, cachedCSV, parseCSVObjects, GAMES_URL,
  DATA_DIR, quantileSorted, round,
} from './lib.mjs';
import { BASE_PRICE, MAX_PRICE, PRICE_K, BASELINE_RANK } from './01-players.mjs';

/* The columns this file cannot work without. Named rather than assumed, because nflverse
   renames things between releases and a missing column read as 0 is a silent zero in
   somebody's price rather than an error. */
const NEED = [
  'player_id', 'player_display_name', 'position', 'season', 'week', 'season_type', 'team',
  'fantasy_points', 'fantasy_points_ppr', 'receptions',
  'passing_yards', 'passing_tds', 'rushing_yards', 'rushing_tds', 'receiving_yards',
  'receiving_tds',
];

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/* Half PPR for one weekly row. */
export const halfPPR = (r) => num(r.fantasy_points) + 0.5 * num(r.receptions);

/* ─── the season to date ───────────────────────────────────────────────────────────── */

/**
 * Every REG row before `week`, folded to one row a player.
 *
 * GAMES ARE COUNTED OFF ROWS AND NOT OFF PRODUCTION. nflverse writes a row for a man who
 * was active and did nothing, and dropping those would divide his points by the games he
 * happened to score in, which prices a man who blanked twice as if he had never played.
 */
export function seasonToDate(rows, week) {
  const by = new Map();
  for (const r of rows) {
    if (String(r.season_type) !== 'REG') continue;
    const w = num(r.week);
    if (!(w >= 1 && w < week)) continue;
    if (!POSITIONS.includes(r.position)) continue;
    const id = r.player_id;
    if (!id) continue;
    let p = by.get(id);
    if (!p) {
      p = {
        player_id: id, name: r.player_display_name, position: r.position, team: r.team,
        games: 0, half: 0, pass_yds: 0, pass_td: 0, rush_yds: 0, rush_td: 0,
        rec: 0, rec_yds: 0, rec_td: 0,
      };
      by.set(id, p);
    }
    /* The club is the LATEST one seen, because a man traded in week five plays week six
       for his new team and the schedule question below is asked of where he is now. */
    p.team = r.team || p.team;
    p.games += 1;
    p.half += halfPPR(r);
    p.pass_yds += num(r.passing_yards); p.pass_td += num(r.passing_tds);
    p.rush_yds += num(r.rushing_yards); p.rush_td += num(r.rushing_tds);
    p.rec += num(r.receptions);
    p.rec_yds += num(r.receiving_yards); p.rec_td += num(r.receiving_tds);
  }
  for (const p of by.values()) p.half_ppg = p.games ? p.half / p.games : 0;
  return [...by.values()];
}

/* What a card says. Season to date totals, in the order the position is read in. */
export function statLine(p) {
  const bits = [];
  const n = (v) => Math.round(v).toLocaleString('en-US');
  if (p.pass_yds) bits.push(`${n(p.pass_yds)} pass yds`, `${Math.round(p.pass_td)} TD`);
  if (p.rush_yds) bits.push(`${n(p.rush_yds)} rush yds`, `${Math.round(p.rush_td)} TD`);
  if (p.rec) bits.push(`${Math.round(p.rec)} rec`, `${n(p.rec_yds)} yds`, `${Math.round(p.rec_td)} TD`);
  return bits.join(', ') || 'no production yet';
}

/* ─── who is playing ───────────────────────────────────────────────────────────────── */

/** The set of club codes with a game in this week. Read off the schedule, never off stats. */
export function clubsPlaying(games, season, week) {
  const on = new Set();
  for (const g of games) {
    if (num(g.season) !== season || num(g.week) !== week) continue;
    if (g.game_type && g.game_type !== 'REG') continue;
    if (g.home_team) on.add(g.home_team);
    if (g.away_team) on.add(g.away_team);
  }
  return on;
}

/* ─── pricing ──────────────────────────────────────────────────────────────────────── */

/*
 * THE POOLED BASELINE IS INHERITED AND THE ARGUMENT IS STRONGER HERE. 01-players.mjs
 * prices against one baseline across all four positions rather than a replacement level per
 * position, because this roster is fixed-shape and positional scarcity pricing distorts the
 * one open slot. Fantasy Challenge is QB/RB/RB/WR/WR/TE with no flex at all, so there is not
 * even one open slot: every position is locked, scarcity buys nothing, and equal price
 * should mean equal expected points wherever it is spent.
 *
 * THE RANK IS SCALED TO THE POOL. 150 is the rank of the replacement-level skill player in a
 * finished season of about 380 qualifiers. A live pool after two weeks is a different size,
 * so a fixed 150 would read further down a shallow pool and price everybody high. It is the
 * same FRACTION of the eligible pool instead, which is what 150-of-380 meant.
 */
export const BASELINE_FRACTION = BASELINE_RANK / 380;

/*
 * ─── A SHORT SAMPLE IS NOT THE SAME EVIDENCE, AND THE FIX IS THE OPPOSITE OF THE
 *     OBVIOUS ONE ─────────────────────────────────────────────────────────────────────
 *
 * Priced on the raw average, 2024 week 8 put Russell Wilson at the $48M ceiling off ONE
 * game, beside Lamar Jackson at the same price off seven. Measured out of sample over 42
 * weeks of 2022 to 2024, on the draftable men only (top 40 a position, because nobody
 * drafts the other 400 and the whole-pool average is theirs):
 *
 *      games played   estimate   actually scored
 *      1                  8.19              2.98
 *      6 or more         11.72              9.99
 *
 * So two men at one price hand back 3.5 points differently for no reason but sample
 * length. That is not a decision, it is a chore: count his games before you look at him.
 *
 * THE OBVIOUS FIX IS WRONG AND WAS MEASURED WRONG TWICE BEFORE THIS LANDED.
 *
 * First, regressing a short sample toward its position's median made every measure worse,
 * monotonically. The reason is selection: a man is ON this board because his one game was
 * big, so he is ALREADY over-estimated, and a prior above his estimate pushes him further
 * out. Toward the peer median the gap goes 3.48 to 6.95 rather than closing.
 *
 * Second, K was fitted on CORRELATION, which asks whether the board is in the right order.
 * What this pricing promises is that equal price means equal expected points, which is a
 * question about BIAS. Fitted on r, shrinkage of any kind looked strictly harmful and the
 * thing it exists to fix went unmeasured.
 *
 * Toward ZERO, fitted on the bias, one constant wins on all three at once, which is rare
 * enough to be worth stating as evidence the correction is real rather than a curve fit:
 *
 *                    gap (1g against 6+)      r       mean abs error
 *      raw                        3.48    0.4314               6.47
 *      K = 2 toward zero          0.12    0.4524               5.89
 *
 * It is one line and it reads as what it is: every man is treated as though he also had
 * SHRINK_K games of nothing. A seven game sample keeps 78% of its average and a one game
 * sample keeps a third. The optimum is shallow (K of 1 and 3 give gaps of 0.55 and 0.22),
 * so this is a flat middle rather than a knife edge.
 *
 * THE CARD STILL SHOWS THE REAL STATS. What is adjusted is the PRICE, which is the game's
 * own opinion of the evidence. A reader sees "264 pass yds, 2 TD" and a price that says
 * one Sunday is one Sunday, and deciding whether that is wrong is the whole point.
 *
 * Re-fit rather than nudged if the scoring or the pool shape changes:
 *   node football/build/test/probe_weekly.mjs --toward zero
 */
export const SHRINK_K = 2;
export const shrunkPPG = (p) => (p.games * p.half_ppg) / (p.games + SHRINK_K);

export function pricePool(men) {
  for (const p of men) p.est_ppg = shrunkPPG(p);
  const desc = men.map((p) => p.est_ppg).sort((a, b) => b - a);
  const rank = Math.max(1, Math.round(desc.length * BASELINE_FRACTION));
  const baseline = desc[Math.min(desc.length - 1, rank - 1)] ?? 0;

  for (const p of men) p.vor = p.est_ppg - baseline;

  const asc = men.map((p) => p.vor).sort((a, b) => a - b);
  const lo = quantileSorted(asc, 0.01);
  const ref = quantileSorted(asc, 0.99);
  const span = ref - lo;

  for (const p of men) {
    /* A pool with no spread at all cannot be priced, and week one of a season where
       everybody has one game is the case that produces it. Flat is the honest answer. */
    const t = span > 0 ? (p.vor - lo) / span : 0;
    p.price_musd = round(
      BASE_PRICE + (MAX_PRICE - BASE_PRICE) * Math.pow(Math.min(1, Math.max(0, t)), PRICE_K), 1);
  }
  return { baseline: round(baseline, 2), vorLo: round(lo, 2), vorRef: round(ref, 2), rank };
}

/* ─── the build ────────────────────────────────────────────────────────────────────── */

/**
 * @param season  the league year
 * @param week    the week being drafted FOR. Only weeks before it are read.
 * @param minGames how many games a man must already have played to be draftable.
 */
export async function buildWeeklyPool({ season, week, minGames = 1 }) {
  const text = await nflverseCSV('stats_player', `stats_player_week_${season}.csv`);
  const rows = parseCSVObjects(text);
  if (!rows.length) throw new Error(`no rows in stats_player_week_${season}.csv`);

  /* Coverage is half the check: a renamed column read as 0 is a silent wrong price. */
  const missing = NEED.filter((c) => !(c in rows[0]));
  if (missing.length) throw new Error(`nflverse is missing columns: ${missing.join(', ')}`);

  /* The identity half PPR stands on, asserted on every build rather than trusted. */
  let checked = 0;
  for (const r of rows) {
    if (String(r.season_type) !== 'REG') continue;
    if (Math.abs((num(r.fantasy_points) + num(r.receptions)) - num(r.fantasy_points_ppr)) > 0.02) {
      throw new Error(`half PPR is no longer derivable: ${r.player_display_name} `
        + `week ${r.week} standard ${r.fantasy_points} + ${r.receptions} rec `
        + `!= ppr ${r.fantasy_points_ppr}`);
    }
    checked++;
  }
  if (!checked) throw new Error('no REG rows to check the half PPR identity against');

  const games = parseCSVObjects(await cachedCSV(GAMES_URL, 'games.csv'));
  const playing = clubsPlaying(games, season, week);
  if (!playing.size) throw new Error(`the schedule has no week ${week} of ${season}`);

  const todate = seasonToDate(rows, week);
  const eligible = todate.filter((p) => p.games >= minGames);

  const anchors = pricePool(eligible);

  const pool = eligible.map((p) => ({
    player_id: p.player_id,
    name: p.name,
    position: p.position,
    team: p.team,
    games: p.games,
    half_ppg: round(p.half_ppg, 2),
    /* What the PRICE was set against: the average discounted for how little of it there
       is. Carried on the row because the probe re-fits against it and a second copy of
       the arithmetic is how a curve and its sweep come apart. Never shown to a player. */
    est_ppg: round(p.est_ppg, 2),
    half_total: round(p.half, 1),
    price_musd: p.price_musd,
    stat_line: statLine(p),
    /* Read off the schedule. A man whose club is idle is not draftable this week, which is
       the bye trap removed at the door rather than priced. */
    playing: playing.has(p.team),
  }));

  return {
    season, week, minGames,
    ...anchors,
    checked,
    clubs_playing: playing.size,
    pool,
  };
}

/* ─── cli ──────────────────────────────────────────────────────────────────────────── */

const arg = (flag, fallback) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

if (process.argv[1] && process.argv[1].endsWith('weekly-pool.mjs')) {
  const season = Number(arg('--season', '2024'));
  const week = Number(arg('--week', '8'));
  const minGames = Number(arg('--min-games', '1'));
  const built = await buildWeeklyPool({ season, week, minGames });
  const on = built.pool.filter((p) => p.playing);

  console.log(`${season} week ${week}: built from weeks 1 to ${week - 1}`);
  console.log(`  half PPR identity held on ${built.checked.toLocaleString('en-US')} REG rows`);
  console.log(`  ${built.clubs_playing} clubs playing, `
    + `${on.length} draftable of ${built.pool.length} with a game already played`);
  console.log(`  baseline rank ${built.rank} = ${built.baseline} half PPG, `
    + `VOR anchors ${built.vorLo} to ${built.vorRef}`);

  for (const pos of POSITIONS) {
    const men = on.filter((p) => p.position === pos).sort((a, b) => b.price_musd - a.price_musd);
    if (!men.length) continue;
    const at = (i) => (men[i] ? `$${men[i].price_musd}M` : '   -  ');
    console.log(`  ${pos.padEnd(3)} ${String(men.length).padStart(4)} men   `
      + `dearest ${at(0)}   12th ${at(11)}   36th ${at(35)}`);
  }

  console.log('\n  the six dearest men on the board:');
  for (const p of on.sort((a, b) => b.price_musd - a.price_musd).slice(0, 6)) {
    console.log(`    ${p.position.padEnd(3)} ${p.name.padEnd(20)} `
      + `$${String(p.price_musd).padStart(5)}M  ${p.half_ppg} half PPG   ${p.stat_line}`);
  }

  if (process.argv.includes('--write')) {
    const out = path.join(DATA_DIR, `weekly_${season}_w${week}.json`);
    fs.writeFileSync(out, JSON.stringify(built, null, 1));
    console.log(`\n  wrote ${out}`);
  }
}
