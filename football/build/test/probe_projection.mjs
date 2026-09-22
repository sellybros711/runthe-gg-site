/* Is there a PROJECTION here worth the name, or is the season to date already the answer?
 *
 *   node football/build/test/probe_projection.mjs
 *   node football/build/test/probe_projection.mjs --seasons 2022,2023,2024 --from 4 --top 40
 *
 * Fantasy Challenge prices a man on his season to date mixed with a projection for the week
 * he is about to play, and shows that projection as the only number on the card that is
 * about the future. So the projection has to exist, and it has to be measurably better than
 * the season to date, or it is a second decimal place on the same figure dressed up as a
 * forecast.
 *
 * ─── NOBODY WILL SELL US ONE, SO IT IS BUILT ────────────────────────────────────────
 *
 * Every published weekly projection is licensed, and the free feeds that look like one are
 * scrapes of a licensed feed. What is free is nflverse, which is the play by play and the
 * box scores, so a projection here can only be made of things that are already in the data
 * by Tuesday morning:
 *
 *   FORM       the shrunk season to date, which is what the price already runs on
 *   MATCHUP    what this week's opponent has been giving up to this position
 *   RECENCY    the last few games weighted over the season's average
 *
 * All three are honest. None of them knows about an injury, a coordinator change or the
 * weather, and that is the game rather than a gap: the drafter does know, and the whole
 * skill surface is the distance between what the board can see and what they can.
 *
 * ─── AND TWO OF THE THREE ARE WORTH NOTHING, WHICH IS THE RESULT ────────────────────
 *
 * Measured over 6,720 draftable player-weeks across 2022 to 2024, mean absolute error
 * against what the man actually scored:
 *
 *      the season to date alone                      5.887
 *      plus the best matchup term found              5.878   (0.009 better)
 *      plus the best recency term found              5.867   (0.021 better)
 *
 * Neither is a real term. A tenth of a point would be arguable and two hundredths is the
 * noise floor, so both are LEFT OUT rather than shipped small: a term in the price that
 * moves nothing is a constant somebody will re-tune one day believing it does something.
 *
 * THE RECENCY TERM IS WORSE THAN USELESS FOR A NUMBER THAT IS PRINTED, which is the finding
 * worth keeping. It buys 0.021 of mean error and takes the BIAS from +0.54 to +1.06: the
 * last three games of a draftable man run hot, so weighting them tells every reader their
 * lineup will score more than it does. Order and level are two different questions and this
 * number is read as points.
 *
 * WHAT THE MATCHUP NULL DOES NOT SAY. It does not say the matchup is irrelevant to
 * football. It says that a defense's own allowed-to-position figure, over the handful of
 * games it has played by the time the pool is built, carries almost nothing about next
 * Sunday once the player's own form is known. That is the well-worn finding about
 * defense-versus-position and it is reproduced here rather than taken on trust, because the
 * alternative was to ship it at some plausible weight and never know.
 *
 * So the projection is the season to date, corrected for level. That is a smaller thing
 * than the word suggests and it is the honest one.
 *
 * ─── EVERY TERM HAS TO EARN ITS PLACE OUT OF SAMPLE ─────────────────────────────────
 *
 * The estimate for (player, week N) is built from weeks 1 to N-1 and scored against what he
 * actually did in week N. Nothing reads week N. Measured on the DRAFTABLE men only, for the
 * reason probe_weekly.mjs sets out at length: 9,632 of 20,121 player-weeks are deep bench
 * whose average and whose next Sunday are both near zero, and predicting nothing for a
 * nobody is easy enough to swamp every finding with people nobody drafts.
 *
 * Both dials are fitted on MEAN ABSOLUTE ERROR and read beside the correlation, because
 * this number is shown to a player as points rather than used to sort a board. A
 * projection whose ranking is perfect and whose level is six points high is a projection
 * that lies to everybody who reads it.
 */

import {
  POSITIONS, nflverseCSV, cachedCSV, parseCSVObjects, GAMES_URL,
} from '../lib.mjs';
import {
  seasonToDate, halfPPR, clubsPlaying, opponentsIn, allowedToDate, shrunkPPG, SHRINK_K,
} from '../weekly-pool.mjs';

const arg = (flag, fallback) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

const SEASONS = arg('--seasons', '2022,2023,2024').split(',').map(Number);
const FROM_WEEK = Number(arg('--from', '4'));
const TO_WEEK = Number(arg('--to', '17'));
const TOP_N = Number(arg('--top', '40'));

/* How much of the matchup to believe, 0 being none of it. */
const WS = [0, 0.1, 0.2, 0.3, 0.5, 0.75, 1];
/* How many games of league-average prior a defense's own allowed figure is argued against.
   Shrinking a DEFENSE toward the league mean is the right direction, which is the opposite
   of the player case in probe_weekly.mjs and is not a contradiction: a defense is in the
   pool because it exists, not because it had one loud week, so there is no selection
   pushing its figure out and a prior at the middle is a prior at the truth. */
const KDS = [0, 2, 4, 8, 16];
/* How much of the recent form to believe over the season's own average. */
const AS = [0, 0.15, 0.3, 0.5, 0.75, 1];
/* How many games count as recent. */
const RECENT_N = Number(arg('--recent', '3'));

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

function fitOf(pairs) {
  const n = pairs.length;
  const mx = pairs.reduce((t, p) => t + p[0], 0) / n;
  const my = pairs.reduce((t, p) => t + p[1], 0) / n;
  let sxy = 0, sxx = 0, syy = 0, mae = 0, bias = 0;
  for (const [x, y] of pairs) {
    sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; syy += (y - my) ** 2;
    mae += Math.abs(x - y); bias += y - x;
  }
  return { r: sxy / Math.sqrt(sxx * syy), mae: mae / n, bias: bias / n, n };
}

/* The last R games a man played, most recent first. Games rather than weeks, so a bye or a
   missed Sunday does not count as a zero he never had the chance to score in. */
function recentLogs(rows, week) {
  const by = new Map();
  for (const r of rows) {
    if (String(r.season_type) !== 'REG') continue;
    const w = num(r.week);
    if (!(w >= 1 && w < week)) continue;
    if (!r.player_id) continue;
    if (!by.has(r.player_id)) by.set(r.player_id, []);
    by.get(r.player_id).push([w, halfPPR(r)]);
  }
  for (const log of by.values()) log.sort((a, b) => b[0] - a[0]);
  return by;
}

const main = async () => {
  const games = parseCSVObjects(await cachedCSV(GAMES_URL, 'games.csv'));

  /* One bucket of (estimate, actual) pairs per candidate setting. */
  const mat = new Map();
  for (const w of WS) for (const k of KDS) mat.set(`${w}|${k}`, []);
  const rec = new Map(AS.map((a) => [a, []]));
  const byPos = new Map(POSITIONS.map((p) => [p, []]));
  let weeks = 0, used = 0;

  for (const season of SEASONS) {
    const rows = parseCSVObjects(await nflverseCSV('stats_player', `stats_player_week_${season}.csv`));
    const actual = new Map();
    for (const r of rows) {
      if (String(r.season_type) !== 'REG') continue;
      actual.set(`${r.player_id}|${r.week}`, halfPPR(r));
    }

    for (let week = FROM_WEEK; week <= TO_WEEK; week++) {
      const playing = clubsPlaying(games, season, week);
      if (!playing.size) continue;
      const todate = seasonToDate(rows, week);
      if (todate.length < 100) continue;
      const opp = opponentsIn(games, season, week);
      const { allowed, league } = allowedToDate(rows, week);
      const logs = recentLogs(rows, week);
      weeks++;

      const ranked = {};
      for (const pos of POSITIONS) {
        ranked[pos] = todate.filter((p) => p.position === pos && playing.has(p.team))
          .sort((a, b) => b.half_ppg - a.half_ppg);
      }

      for (const pos of POSITIONS) {
        for (const p of ranked[pos].slice(0, TOP_N)) {
          const y = actual.get(`${p.player_id}|${week}`) ?? 0;
          const base = shrunkPPG(p);
          byPos.get(pos).push([base, y]);
          used++;

          /* THE MATCHUP. A ratio rather than a difference, because a quarterback and a tight
             end give up wildly different totals and a defense two points above average
             against tight ends is a much bigger deal than two points against quarterbacks. */
          const d = allowed.get(`${opp.get(p.team)}|${pos}`);
          const mean = league.get(pos) || 0;
          for (const kd of KDS) {
            /* No opponent found means a club with no game, which the playing filter above
               has already removed, so this is the neutral answer rather than a hole. */
            const ratio = (mean > 0 && d && d.games)
              ? ((d.games * (d.pts / d.games)) + kd * mean) / ((d.games + kd) * mean)
              : 1;
            for (const w of WS) {
              mat.get(`${w}|${kd}`).push([base * (1 + w * (ratio - 1)), y]);
            }
          }

          /* THE RECENCY. The same shrink toward zero the season figure gets, because a man
             with two recent games is the same short sample problem one level down. */
          const log = (logs.get(p.player_id) || []).slice(0, RECENT_N);
          const rp = log.length
            ? (log.reduce((t, g) => t + g[1], 0)) / (log.length + SHRINK_K) : 0;
          for (const a of AS) rec.get(a).push([(1 - a) * base + a * rp, y]);
        }
      }
    }
  }

  console.log(`seasons ${SEASONS.join(', ')}  weeks ${FROM_WEEK} to ${TO_WEEK}`);
  console.log(`${weeks} weeks, ${used.toLocaleString('en-US')} draftable player-weeks, `
    + `top ${TOP_N} a position. Out of sample.`);

  const line = (label, f) => `  ${label.padEnd(22)} mae ${f.mae.toFixed(3)}   `
    + `r ${f.r.toFixed(4)}   bias ${f.bias >= 0 ? '+' : ''}${f.bias.toFixed(3)}`;

  const flat = fitOf(mat.get(`0|0`));
  console.log(`\nTHE SEASON TO DATE ON ITS OWN, which every term below has to beat:`);
  console.log(line('form only', flat));

  console.log('\nMATCHUP. How much of what the opponent has allowed to believe:');
  let bestM = null;
  for (const kd of KDS) {
    const cells = WS.map((w) => {
      const f = fitOf(mat.get(`${w}|${kd}`));
      if (!bestM || f.mae < bestM.f.mae) bestM = { w, kd, f };
      return f.mae.toFixed(3).padStart(8);
    }).join('');
    console.log(`  defense prior ${String(kd).padStart(2)}g  ${cells}`);
  }
  console.log(`  ${' '.repeat(17)}${WS.map((w) => `w=${w}`.padStart(8)).join('')}`);
  console.log(line(`best: w ${bestM.w}, prior ${bestM.kd}g`, bestM.f));

  console.log(`\nRECENCY. The last ${RECENT_N} games weighted over the season's average:`);
  let bestR = null;
  for (const a of AS) {
    const f = fitOf(rec.get(a));
    if (!bestR || f.mae < bestR.f.mae) bestR = { a, f };
    console.log(line(`weight ${a}`, f));
  }

  const gain = (f) => (flat.mae - f.mae).toFixed(3);
  console.log(`\nAgainst the season to date alone: matchup buys ${gain(bestM.f)} points of `
    + `mean error, recency buys ${gain(bestR.f)}.`);
  console.log('A term that buys under about 0.05 is noise and should not be in the price.');

  /*
   * ─── THE LEVEL, WHICH IS A DIFFERENT QUESTION FROM THE RANKING ────────────────────
   *
   * Everything above asks whether the board is in a better ORDER. This number is not only
   * used to order a board: it is PRINTED on a card as points, and six of them are added up
   * and shown as what a lineup is projected to score. So it has to be right in level as
   * well as in order, and the shrink toward zero that makes the price fair guarantees it is
   * not: every man is treated as though he also played SHRINK_K games of nothing, so every
   * man's estimate is pulled down.
   *
   * a + b * est, fitted here and then carried as two constants, is the whole correction. It
   * cannot change anybody's rank, because it is monotone in est, so nothing above is
   * disturbed and nothing about the price moves.
   */
  console.log('\nTHE LEVEL. What the shown number is off by, before any correction:');
  const pooled = mat.get('0|0');
  for (const pos of POSITIONS) {
    const rows = byPos.get(pos);
    if (!rows || rows.length < 100) continue;
    const f = fitOf(rows);
    console.log(line(pos, f));
  }
  /* Three candidate corrections, and the SIMPLEST ONE WINS on the numbers rather than on
     taste. Least squares fits a slope as well as an offset, and a slope under 1 flattens
     the board: it takes the top men down toward the middle, which removes the bias and buys
     back mean error, because least squares minimises the SQUARE and this number is read as
     points. A flat offset cannot flatten anything: it is the same shift for everybody, so
     the order, the spread and every price are untouched and the only thing that moves is
     the level, which is the only thing that was wrong. */
  const n = pooled.length;
  const mx = pooled.reduce((t, p) => t + p[0], 0) / n;
  const my = pooled.reduce((t, p) => t + p[1], 0) / n;
  let sxy = 0, sxx = 0;
  for (const [x, y] of pooled) { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; }
  const b = sxy / sxx;
  const a = my - b * mx;
  console.log(line('least squares a+b*est', fitOf(pooled.map(([x, y]) => [a + b * x, y]))));

  const off = my - mx;
  console.log(line(`one offset, +${off.toFixed(3)}`, fitOf(pooled.map(([x, y]) => [x + off, y]))));

  const perPos = {};
  const shifted = [];
  for (const pos of POSITIONS) {
    const rows = byPos.get(pos) || [];
    if (!rows.length) { perPos[pos] = 0; continue; }
    perPos[pos] = rows.reduce((t, p) => t + (p[1] - p[0]), 0) / rows.length;
    for (const [x, y] of rows) shifted.push([x + perPos[pos], y]);
  }
  console.log(line('an offset a position', fitOf(shifted)));

  console.log(`\nleast squares:  a ${a.toFixed(3)}  b ${b.toFixed(4)}`);
  console.log(`one offset:     +${off.toFixed(3)}`);
  console.log('a position:     '
    + POSITIONS.map((p) => `${p} +${perPos[p].toFixed(3)}`).join('   '));
};

main().catch((e) => { console.error(e); process.exit(1); });
