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

/** Who each club plays in this week, read off the schedule. club code -> opponent code. */
export function opponentsIn(games, season, week) {
  const by = new Map();
  for (const g of games) {
    if (num(g.season) !== season || num(g.week) !== week) continue;
    if (g.game_type && g.game_type !== 'REG') continue;
    if (!g.home_team || !g.away_team) continue;
    by.set(g.home_team, g.away_team);
    by.set(g.away_team, g.home_team);
  }
  return by;
}

/*
 * A kickoff, as an instant.
 *
 * THE SCHEDULE IS IN EASTERN AND THE OFFSET IS NOT A CONSTANT. `gameday` and `gametime` are
 * wall clock in America/New_York, and the season crosses a clock change in early November,
 * so a hardcoded -04:00 puts every game from week ten on an hour out. An hour is enough to
 * lock a week after the Thursday game has kicked off, which is the one error here that
 * costs somebody an entry.
 *
 * So the offset is ASKED rather than assumed: read the wall clock back out of a guessed
 * instant in that zone and correct by whatever it is off by. One pass is enough, because the
 * correction is a whole number of minutes and no kickoff sits on a transition boundary.
 */
const ET = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York', hour12: false,
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
});
export function easternInstant(day, time) {
  if (!day || !time) return null;
  const want = Date.parse(`${day}T${time}:00Z`);
  if (!Number.isFinite(want)) return null;
  const p = Object.fromEntries(ET.formatToParts(new Date(want)).map((x) => [x.type, x.value]));
  /* Hour 24 is midnight in this formatter's output, which reads as a day ahead. */
  const hour = p.hour === '24' ? '00' : p.hour;
  const got = Date.parse(`${p.year}-${p.month}-${p.day}T${hour}:${p.minute}:00Z`);
  return new Date(want + (want - got)).toISOString();
}

/** Every club's week: who they play, whether at home, and when it kicks off. */
export function weekGames(games, season, week) {
  const by = new Map();
  for (const g of games) {
    if (num(g.season) !== season || num(g.week) !== week) continue;
    if (g.game_type && g.game_type !== 'REG') continue;
    if (!g.home_team || !g.away_team) continue;
    const kick = easternInstant(g.gameday, g.gametime);
    by.set(g.home_team, { opp: g.away_team, home: true, kick });
    by.set(g.away_team, { opp: g.home_team, home: false, kick });
  }
  return by;
}

/* ─── what a defense has been giving up ────────────────────────────────────────────── */

/**
 * Half PPR allowed per game, by defense and position, over weeks 1 to `week - 1`.
 *
 * COUNTED OFF THE SCHEDULE AND NOT OFF THE STAT ROWS, which is the same no-lookahead rule
 * the pool is built under and is also the only way to get the denominator right. Summing
 * rows gives the points; dividing by the number of DISTINCT weeks that defense has played
 * gives the per game figure. Count games by summing rows instead and a defense that faced
 * four receivers one week and two the next has played six games.
 *
 * @returns {{allowed: Map<string, {games:number, pts:number}>, league: Map<string, number>}}
 *          keyed `DEF|POS`, plus the league mean allowed per game at each position.
 */
export function allowedToDate(rows, week) {
  const allowed = new Map();
  const weeksOf = new Map();
  for (const r of rows) {
    if (String(r.season_type) !== 'REG') continue;
    const w = num(r.week);
    if (!(w >= 1 && w < week)) continue;
    if (!POSITIONS.includes(r.position)) continue;
    const def = r.opponent_team;
    if (!def) continue;
    if (!weeksOf.has(def)) weeksOf.set(def, new Set());
    weeksOf.get(def).add(w);
    const k = `${def}|${r.position}`;
    const cur = allowed.get(k) || { games: 0, pts: 0 };
    cur.pts += halfPPR(r);
    allowed.set(k, cur);
  }
  for (const [k, v] of allowed) v.games = (weeksOf.get(k.split('|')[0]) || new Set()).size;

  const league = new Map();
  for (const pos of POSITIONS) {
    let pts = 0, games = 0;
    for (const [k, v] of allowed) {
      if (k.endsWith(`|${pos}`)) { pts += v.pts; games += v.games; }
    }
    league.set(pos, games ? pts / games : 0);
  }
  return { allowed, league };
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

/*
 * ─── THE PROJECTION IS HOW OFTEN HE PLAYS TIMES WHAT HE SCORES WHEN HE DOES ────────
 *
 *   node football/build/test/probe_early.mjs
 *
 * The card shows no overall and no rating. What the review screen shows is the lineup's
 * projected half PPR total, and six men add up to it, so it has to be right in LEVEL and
 * not only in order. That is a different demand from the price above it, and the two were
 * being answered by one function.
 *
 * WHAT SHIPPED WAS `shrunkPPG + 0.54` AND IT WAS A THIRD LOW IN SEPTEMBER. The lift was
 * fitted over 6,720 draftable player-weeks from week four on, so it removed the bias of the
 * POOL. A player does not meet the pool. They meet one week, and inside one week nearly
 * every man has the same number of games, so a correction fitted at the pool's average
 * sample length is the right correction at exactly one point of the season. Measured out of
 * sample over 2022 to 2024, what the board actually scored against what it was told:
 *
 *      games played      1      2      3      4      5     6+
 *      shipped bias  +3.20  +1.93  +1.02  +0.48  -0.03  -0.16
 *
 * Right about October, a third low about September. At two games, which is what week three
 * is, that is 11.6 points on a six man lineup projected at 35.8. Reported by a player as
 * the projection feeling too low to be half PPR, and they were right.
 *
 * ─── AND THE SHRINK WAS AVAILABILITY WEARING A SAMPLE SIZE COSTUME ─────────────────
 *
 * The shrink toward ZERO won its fit because zero is where a man who is not on the field
 * scores. That is not an argument about evidence, it is an argument about whether he plays,
 * and the two only look alike because a man with two games in week ten has missed eight.
 * Split apart, the second one is almost the whole effect. Grouped by the share of his
 * club's games a man has already played:
 *
 *      share of his club's games    under .5    .5 to .8    .8 to 1    every one
 *      he scores this much of his
 *        own average                  0.404       0.605      0.739        0.914
 *      and he blanks                  59.6%       39.0%      24.1%         8.9%
 *
 * The first row is one minus the second to three decimals, at every share. So it is not a
 * discount, it is the chance he is out there: a man who has missed Sundays misses more, and
 * what he scores on one he is absent for is nothing.
 *
 * Held to men who have played EVERY one of their club's games, the games effect on the
 * LEVEL all but vanishes and what is left is an ordinary shrink for a thin sample.
 *
 * ─── SO THERE ARE TWO TERMS AND THEY ANSWER TWO QUESTIONS ──────────────────────────
 *
 *   plays   the share of his club's games he has already played
 *   rate    the season to date shrunk toward what his POSITION is doing on this board
 *
 * THE PRIOR IS THE PART THAT WAS MISSING. `shrunkPPG` is a shrinkage estimator with its
 * prior set to zero, which is why it needed a constant bolted on the end, and why that
 * constant could only ever be right at one sample length: the prior's own contribution is
 * K*M/(g+K) and it SHRINKS as the sample grows, where a bolted-on constant does not. Put it
 * back and the correction sizes itself.
 *
 * PER POSITION AND NOT ONE LEVEL FOR EVERYBODY, because one level shrinks a tight end up
 * toward a quarterback's rate and a quarterback down toward a tight end's, on the same
 * board, at the same time. Measured, one global level over-projects both ends of a week
 * three board and the position's own level lands both.
 *
 * FITTED ON TWO SEASONS AND REPORTED ON THE THIRD, rotating which was held out. The level
 * multiple came back 0.800 on all three rotations, and K at 2.25, 2.50 and 2.50 against the
 * SHRINK_K of 2 the price already carries, so it is pinned to that rather than given a
 * second constant of its own. Pinning costs nothing: the worst mis-calibrated cell moves
 * 2.03 to 2.01, 3.21 to 3.49 and 1.96 to 1.65 across the three held out seasons.
 *
 * What it buys, on a held out season, worst cell being the worst any (sample length x
 * height on the board) group is out by:
 *
 *                  1      2      3      4      5     6+   worst cell   mean abs error
 *      shipped  +3.45  +2.18  +1.39  +0.90  +0.24  +0.17         5.59             6.03
 *      this     +0.12  +0.26  +0.01  +0.31  -0.26  +0.08         2.01             5.81
 *
 * Better on the error as well as on the bias, which is worth stating because a calibration
 * fix usually costs accuracy and this one does not.
 *
 * ─── THE PRICE WAS NOT TOUCHED, AND THAT LEFT THE BOARD OVERPAYING FOR ABSENCE ─────
 *
 *   node football/build/test/probe_price.mjs
 *
 * This section used to end here, saying the price still runs on `shrunkPPG` and the
 * projection is not an input to any of it. Reported by a player as the price feeling too
 * weighted toward what a man has done all season and not enough toward what he is expected
 * to do this week, and they were right, with a number behind it.
 *
 * `shrunkPPG` is BLIND TO AVAILABILITY. A man who has played two of his club's three games
 * and a man who has played all three are the same row to it, and the shrink toward zero
 * only discounts him for having a thin SAMPLE, which is a different question. Measured over
 * 21,291 draftable player-weeks of 2022 to 2024, holding the price band fixed:
 *
 *      a man who had missed one of his club's games scored 2.87 points LESS
 *      that week than a man at the same price who had played every one
 *
 * That is most of a seventh of a six man lineup, paid for and not delivered, and it is
 * worst exactly where it costs most: the $25-48M band ran -8.21.
 *
 * Nothing could report it. Every price was a correct summary of September, every projection
 * on every card was right, and the two simply disagreed about a man in a way no screen put
 * side by side.
 *
 * ─── SO THE PRICE READS BOTH, AT `PRICE_PROJ_W` ────────────────────────────────────
 *
 *      est = (1 - w) * shrunkPPG + w * projectedPoints
 *
 * Both are half PPR points, so the blend is dimensionally sound and every constant below it
 * (the baseline, the VOR span, the power curve, the ceiling anchor) reads the quantity it
 * always did.
 *
 * WHY A QUARTER, WHICH IS THE PART TO READ BEFORE MOVING IT. Three things bound it and
 * they close from both sides. Availability bias, the rank agreement between price and
 * projection on the live week 3 board, and the cap sweep on that same board:
 *
 *      w                       0        0.25      0.5       0.75      1
 *      absence gap         -2.87      -2.53     -2.15     -1.68     -1.39
 *      thin sample gap     -1.25      -1.25     -1.28     -1.33     -1.42
 *      price/proj rank      .896       .943      .980      .994      .999
 *      budget - top at 90   +1.3       +2.4      +3.5         -         -
 *      top - random at 90   11.2        9.7       7.3         -         -
 *
 * THE TOP OF THE RANGE IS RULED OUT BY THE CARD. At 0.75 and past it the price IS the
 * projection in rank, and the whole reason the projection was refitted was to stop it being
 * a restatement of the price. The residual between the two is the decision this mode is
 * built around, and pricing off the projection deletes it.
 *
 * THE MIDDLE IS RULED OUT BY THE CAP, and that is the one that cost a measurement rather
 * than an argument. `probe_cap.mjs` picks $90M because it is the band where spending
 * everything and holding money back trade places; at 0.5 the budget bot is 3.5 points clear
 * there and the crossover has walked to about 105, which is the one-strategy shape that
 * sweep exists to refuse. What drafting is worth at all falls with it, 11.2 to 7.3.
 *
 * None of that is the blend being wrong. A more accurate price against a CONVEX price curve
 * genuinely does reward spreading money, so better pricing moves that band. The honest
 * answer at 0.5 would be to move the cap with it, and that is a bigger change than this one
 * and not one to make in the middle of a season: the cap is on every published week row, so
 * moving it makes two weeks of results incomparable.
 *
 * AND THE CONTROL IS WHAT SAYS 0.25 IS SAFE RATHER THAN MERELY SMALL. `SHRINK_K` was fitted
 * on sample size and took that gap from 3.48 to 0.12, so a fix for availability that
 * re-opens it has moved the defect rather than removed it. At 0.25 that axis does not move
 * at all, to two decimals; by w = 1 it is -1.42 and drifting. A cheaper looking candidate,
 * `shrunkPPG * playShare`, was measured too and is worse on BOTH axes at once (-2.06 and
 * -1.43), because it discounts a thin sample twice.
 *
 * WHAT IT ACTUALLY DOES TO A BOARD, which is the half a reader can see. On week 3, 217 of
 * 414 men move by more than a million and only SIX move by more than three, and those six
 * are the men who missed a game: Zay Flowers goes $12.1M to $7.7M. That is the shape this
 * is meant to have. At 0.5 it is 97 men past three million, which is a rebuild rather than
 * an adjustment.
 *
 * IT DOES NOT CLOSE THE GAP AND IS NOT MEANT TO. -2.87 to -2.53 is an eighth of a defect
 * this file now knows the size of. Going further is available and costs the cap; that is a
 * decision about the mode rather than about the pricing, so it is written down here rather
 * than taken quietly.
 */
export const PRICE_PROJ_W = 0.25;

/** How many REG games each club has already played before `week`, read off the schedule. */
export function clubGamesToDate(games, season, week) {
  const by = new Map();
  for (const g of games) {
    if (num(g.season) !== season || !(num(g.week) >= 1 && num(g.week) < week)) continue;
    if (g.game_type && g.game_type !== 'REG') continue;
    for (const t of [g.home_team, g.away_team]) {
      if (t) by.set(t, (by.get(t) || 0) + 1);
    }
  }
  return by;
}

/* How many men a position the LEVEL is read over. The same reach `draft.js` gives the
   wheel, because the level is meant to be what a draftable man at this position is doing
   and the draftable men are the ones the wheel can offer. */
export const PROJ_DEPTH = 40;

/* How much of that level a thin sample is argued toward. Fitted three ways, 0.800 every
   time. */
export const PROJ_LEVEL = 0.80;

/** Mean raw half PPG of the top PROJ_DEPTH men at each position. pos -> number. */
export function positionLevels(men) {
  const out = new Map();
  for (const pos of POSITIONS) {
    const top = men.filter((p) => p.position === pos)
      .sort((a, b) => b.half_ppg - a.half_ppg).slice(0, PROJ_DEPTH);
    out.set(pos, top.length ? top.reduce((t, p) => t + p.half_ppg, 0) / top.length : 0);
  }
  return out;
}

/**
 * @param p       a season to date row, carrying `played_of`: his club's games so far.
 * @param levels  what positionLevels() answered for this board.
 */
export const projectedPoints = (p, levels) => {
  /* A man cannot have played more games than his club, and a missing denominator means a
     club with no schedule read, which is availability unknown rather than availability
     zero. Never below zero and never above one. */
  const of = p.played_of || p.games;
  const plays = of > 0 ? Math.min(1, Math.max(0, p.games / of)) : 1;
  const level = PROJ_LEVEL * ((levels && levels.get(p.position)) || 0);
  return Math.max(0, plays * ((p.games * p.half_ppg + SHRINK_K * level) / (p.games + SHRINK_K)));
};

/**
 * @param men     the eligible board, each row carrying `played_of` when a blend is asked for
 * @param levels  what `positionLevels()` answered for this board, or null for no blend
 * @param w       the blend weight, defaulting to what ships. A caller that wants a DIFFERENT
 *                weight passes one rather than scaling `half_ppg` to fake an estimate, which
 *                is what `probe_price.mjs` did until this parameter existed: the injection
 *                round-tripped through `shrunkPPG` correctly and then got blended a second
 *                time by this function, so every column of that probe was reading one weight
 *                to its right and the baseline was reading the shipped default.
 *
 * THE LEVELS ARE REQUIRED RATHER THAN OPTIONAL, and that is the whole guard. `projectedPoints`
 * falls back to `plays = 1` when `played_of` is missing and to a level of 0 when the map is,
 * so a caller that forgot either would get a board priced as though nobody had ever missed a
 * game: no error, a perfectly ordinary set of prices, and the exact defect this exists to fix
 * still sitting in it. That is the shape this repo keeps finding, so it throws.
 */
export function pricePool(men, levels = null, w = PRICE_PROJ_W) {
  if (w > 0) {
    if (!levels) {
      throw new Error('pricePool: a blend weight is set, so positionLevels() must be passed. '
        + 'Without them every man prices as though he had played every game.');
    }
    const blind = men.filter((p) => !p.played_of);
    if (blind.length) {
      throw new Error(`pricePool: ${blind.length} of ${men.length} men have no played_of, `
        + `so their availability would read as perfect (first: ${blind[0].name}).`);
    }
  }
  for (const p of men) {
    p.est_ppg = w > 0
      ? (1 - w) * shrunkPPG(p) + w * projectedPoints(p, levels)
      : shrunkPPG(p);
  }
  const desc = men.map((p) => p.est_ppg).sort((a, b) => b - a);
  const rank = Math.max(1, Math.round(desc.length * BASELINE_FRACTION));
  const baseline = desc[Math.min(desc.length - 1, rank - 1)] ?? 0;

  for (const p of men) p.vor = p.est_ppg - baseline;

  const asc = men.map((p) => p.vor).sort((a, b) => a - b);
  const lo = quantileSorted(asc, 0.01);
  /*
   * THE TOP OF THE BOARD IS THE BEST MAN ON IT, AND NOT A QUANTILE, which is where this
   * departs from 01-players.mjs and the reason is the size of the pool.
   *
   * A finished season priced across 1999 to 2025 has tens of thousands of rows, so the 99th
   * percentile is deep enough that the men above it are a handful of the greatest seasons
   * ever played and clamping them together costs nothing. One week's board is about 500 men,
   * so the 99th percentile is FIVE men in, and measured over twelve weeks of 2022 to 2024 it
   * put four to seven men on the ceiling every single week, at one price, with up to 7.6
   * points of projection between them.
   *
   * That is the shape with no decision in it. The dearest slot on the board becomes "take
   * the highest projection", which is arithmetic rather than football, and it is the same
   * fault the shrink above was added to remove at the other end of the board.
   *
   * Anchored at the maximum, exactly one man reaches $48M, every week, by construction, and
   * the men behind him separate: 48 / 37 / 36 / 27 where it used to read 48 / 48 / 48 / 48.
   * It is a single order statistic and therefore the most outlier-prone anchor there is,
   * which is a real cost and the right one to pay here: a week with one runaway leader
   * SHOULD price everybody else cheaper, because that is what that week is.
   */
  const ref = asc[asc.length - 1];
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
  const sched = weekGames(games, season, week);

  /* THE WEEK LOCKS AT THE FIRST KICKOFF, not at the Sunday one. A Thursday game is a real
     game and a lineup submitted after it has started is a lineup submitted knowing how one
     of its men did. One lock for the week, and it is the earliest whistle in it. */
  const kicks = [...sched.values()].map((g) => g.kick).filter(Boolean).sort();
  if (!kicks.length) throw new Error(`week ${week} of ${season} has no kickoff times`);

  const todate = seasonToDate(rows, week);
  /* THE BOARD IS PRICED AGAINST ITSELF. A man whose club is idle is not on it, so he is not
     in the pricing either, and that is not tidiness: the anchors above are the cheapest and
     the dearest man ON THE BOARD, so a leader sitting out a bye would otherwise set a
     ceiling nobody draftable could reach and the whole week would have no $48M man in it. */
  const played = todate.filter((p) => p.games >= minGames);
  const eligible = played.filter((p) => playing.has(p.team));
  if (!eligible.length) throw new Error(`nobody is draftable in week ${week} of ${season}`);

  /* HOW MANY GAMES HIS CLUB HAS ALREADY PLAYED, which is what turns "two games" into
     availability. Read off the schedule rather than as `week - 1`, because a bye is a week
     nobody could have played in and counting it as a miss would mark half the league unfit
     every October. */
  const clubGames = clubGamesToDate(games, season, week);
  for (const p of eligible) p.played_of = clubGames.get(p.team) || p.games;

  /* What each position is doing on THIS board, which is what a thin sample is argued
     toward. Read over the eligible men, so a bye week narrows it by itself. */
  const levels = positionLevels(eligible);

  /* BOTH OF THE ABOVE USED TO BE COMPUTED BELOW THIS LINE, and moving them up is half of
     what `PRICE_PROJ_W` needed. The price now reads availability, so a board priced before
     `played_of` exists is one where nobody has ever missed a game: no error, ordinary
     looking prices, and the defect intact. `pricePool` throws rather than trusting this
     order to be remembered, and the two of them together are the fix. */
  const anchors = pricePool(eligible, levels);

  const pool = eligible.map((p) => ({
    player_id: p.player_id,
    name: p.name,
    position: p.position,
    team: p.team,
    games: p.games,
    /* How many his club has played, so the card can say one of two rather than one, and so
       a reader can see the availability the projection is reading. */
    played_of: p.played_of,
    half_ppg: round(p.half_ppg, 2),
    /* What the PRICE was set against: the average discounted for how little of it there
       is. Carried on the row because the probe re-fits against it and a second copy of
       the arithmetic is how a curve and its sweep come apart. Never shown to a player. */
    est_ppg: round(p.est_ppg, 2),
    /* THE ONE NUMBER ON THE CARD ABOUT THE FUTURE, and the only rating of any kind this
       mode shows. One decimal, because it is points and a player will add six of them up. */
    proj: round(projectedPoints(p, levels), 1),
    half_total: round(p.half, 1),
    price_musd: p.price_musd,
    stat_line: statLine(p),
    /* THE MATCHUP, WHICH IS THE ONE THING ON THE CARD THE PRICE DID NOT READ. Measured, a
       defense's own allowed-to-position figure is worth nothing as a projection term (see
       probe_projection.mjs), so this is not here as a number the game has an opinion about.
       It is here because a reader does: they know who is hurt, who is starting and what the
       weather is doing, and none of that reaches the board. */
    opp: (sched.get(p.team) || {}).opp || '',
    home: !!(sched.get(p.team) || {}).home,
    kick: (sched.get(p.team) || {}).kick || null,
  }));

  return {
    season, week, minGames,
    ...anchors,
    checked,
    clubs_playing: playing.size,
    /* How many men with a game already played were left off because their club is idle.
       Reported rather than shipped, because the bye trap is removed at the door here and a
       reader of this file should be able to see how big the door was. */
    idle: played.length - eligible.length,
    locks_at: kicks[0],
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
  const on = built.pool;

  console.log(`${season} week ${week}: built from weeks 1 to ${week - 1}`);
  console.log(`  half PPR identity held on ${built.checked.toLocaleString('en-US')} REG rows`);
  console.log(`  ${built.clubs_playing} clubs playing, `
    + `${on.length} draftable, ${built.idle} left off for a bye`);
  console.log(`  locks at ${built.locks_at} (the first kickoff of the week)`);
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
      + `$${String(p.price_musd).padStart(5)}M  proj ${String(p.proj).padStart(4)}  `
      + `${p.half_ppg} half PPG   ${p.stat_line}`);
  }

  if (process.argv.includes('--write')) {
    const name = `weekly_${season}_w${week}.json`;
    fs.writeFileSync(path.join(DATA_DIR, name), JSON.stringify(built, null, 1));

    /*
     * WHICH WEEK IS LIVE IS WRITTEN HERE AND READ BY THE PAGE, never typed into it. A week
     * number in the markup is a hand-written number beside a generated file, which is the
     * shape this repo keeps a checker for. One command ships a week.
     *
     * ─── AND IT ONLY EVER GOES FORWARD ────────────────────────────────────────────────
     *
     * Building an OLD week is an ordinary thing to want: to re-price it, to check a change
     * against a week whose results are known, to make a fixture. Every one of those used to
     * repoint the live week backwards as a side effect, and the symptom is the whole mode
     * silently serving a week that finished a fortnight ago. Nothing throws, the page boots,
     * the board is a real board. Found by doing it while building a fixture for the live
     * scoreboard, which is the only reason it is guarded rather than written up as a
     * near miss.
     *
     * The pointer is NOT moved rather than the build refused: the week's own JSON is still
     * wanted, and it is the pointer that was never asked for.
     */
    const nowFile = path.join(DATA_DIR, 'fantasy_now.json');
    const was = fs.existsSync(nowFile)
      ? JSON.parse(fs.readFileSync(nowFile, 'utf8')) : null;
    const back = was && (was.season > season
      || (was.season === season && was.week > week));
    if (back) {
      console.log(`\n  wrote ${name}`);
      console.log(`  LEFT fantasy_now.json ALONE: it points at ${was.season} week ${was.week}, `
        + `and this is week ${week}.`);
      console.log('  Nothing moves the live week backwards. Edit it by hand if that is '
        + 'really what you want.');
    } else {
      fs.writeFileSync(nowFile,
        JSON.stringify({ season, week, file: name, locks_at: built.locks_at }, null, 1) + '\n');
      console.log(`\n  wrote ${name} and fantasy_now.json`);
    }
  }
}
