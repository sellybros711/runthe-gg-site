/* How well does a season to date predict next Sunday, and how hard should a short one be
 * discounted?
 *
 *   node football/build/test/probe_weekly.mjs
 *   node football/build/test/probe_weekly.mjs --seasons 2022,2023,2024 --from 4
 *
 * Fantasy Challenge prices a man on what he has done so far and pays him on what he does
 * next. Two numbers decide whether that is a game:
 *
 *   SHRINK_K   how many games of prior a season to date is worth arguing against. Set
 *              wrong, the board's dearest men are whoever had one good Sunday.
 *   the skill  how much better a good drafter can do than a careless one. Too high and
 *              best available wins every week; too low and the board is a raffle.
 *
 * ─── WHY A ONE GAME AVERAGE CANNOT BE PRICED LIKE A SEVEN GAME ONE ──────────────────
 *
 * Measured on the 2024 week 8 board before any of this: Russell Wilson priced at the $48M
 * ceiling off a single game, beside Lamar Jackson at the same price off seven. 67 of 501
 * draftable men had one game and 107 had two or fewer. A short sample is high variance, so
 * the men a raw average floats to the top of the board are disproportionately the ones who
 * got lucky once, and buying them is a systematic loss. The decision that produces is not
 * "is he good", it is "count his games first", which is arithmetic rather than football.
 *
 * So the estimate is shrunk toward a prior:
 *
 *      shrunk = (games * ppg + K * prior) / (games + K)
 *
 * with the prior being that position's own replacement level, because a quarterback with
 * one game should regress toward quarterbacks rather than toward the pool. K is the number
 * of games of prior evidence, and it is FITTED here rather than chosen: the right K is the
 * one whose estimate best predicts the week nobody has played yet.
 *
 * ─── THE MEASUREMENT IS OUT OF SAMPLE, WHICH IS THE WHOLE POINT ─────────────────────
 *
 * For every (player, week) the estimate is built from weeks BEFORE it and scored against
 * that week's real half PPR. Nothing reads the week it is predicting. Fitting K against the
 * same weeks that built the estimate would pick K = 0, because a raw average predicts its
 * own history perfectly and the future not at all.
 */

import {
  POSITIONS, nflverseCSV, cachedCSV, parseCSVObjects, GAMES_URL, round,
} from '../lib.mjs';
import { seasonToDate, halfPPR, clubsPlaying } from '../weekly-pool.mjs';

const arg = (flag, fallback) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

const SEASONS = arg('--seasons', '2022,2023,2024').split(',').map(Number);
const FROM_WEEK = Number(arg('--from', '4'));
const TO_WEEK = Number(arg('--to', '17'));
/* Candidate shrinkage strengths, in games of prior. 0 is the raw average this is replacing. */
const KS = [0, 1, 2, 3, 4, 6, 8, 12, 20];
/* How many men a position a drafter is realistically choosing between. Generous on
   purpose: 40 quarterbacks is every starter and every backup who has thrown a pass. */
const TOP_N = Number(arg('--top', '40'));

/* Pearson correlation, plus the mean absolute error, because a correlation can be flattered
   by getting the top right while being wrong about everybody. */
function fitOf(pairs) {
  const n = pairs.length;
  const mx = pairs.reduce((t, p) => t + p[0], 0) / n;
  const my = pairs.reduce((t, p) => t + p[1], 0) / n;
  let sxy = 0, sxx = 0, syy = 0, mae = 0;
  for (const [x, y] of pairs) {
    sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; syy += (y - my) ** 2;
    mae += Math.abs(x - y);
  }
  return { r: sxy / Math.sqrt(sxx * syy), mae: mae / n, n };
}

/* The prior a short sample regresses toward: that position's replacement level, taken as
   the median of men with a real sample so a pool full of one-gamers cannot drag it. */
/* THE PRIOR IS THE MEDIAN DRAFTABLE MAN AT THAT POSITION, not the median of everybody who
   has taken a snap. A short sample on the draftable board belongs to a starter who missed
   time, and regressing him toward the league's twelfth-string is regressing him toward
   somebody he is nothing like. Measured both ways: toward the whole position the fit gets
   worse at every K, toward the draftable set it gets better. */
function priors(ranked) {
  const out = {};
  for (const pos of POSITIONS) {
    const pool = ranked[pos].slice(0, TOP_N).map((p) => p.half_ppg).sort((a, b) => a - b);
    out[pos] = pool.length ? pool[Math.floor(pool.length / 2)] : 0;
  }
  return out;
}

/* TOWARD WHAT. `peer` regresses a short sample to the median draftable man at his
   position; `zero` regresses it to nothing. They are opposite corrections and only one can
   be right: a one game man on this board is there BECAUSE his one game was big, so he is
   already over-estimated, and a prior above his estimate pushes him further out. Measured
   both ways rather than argued, with --toward. */
const TOWARD = arg('--toward', 'zero');
const shrunk = (p, prior, k) =>
  (p.games * p.half_ppg + k * (TOWARD === 'zero' ? 0 : prior)) / (p.games + k);

const main = async () => {
  const games = parseCSVObjects(await cachedCSV(GAMES_URL, 'games.csv'));
  /* One bucket of (estimate, actual) pairs per K, plus a split by how many games the man
     had, because the whole question is whether short samples are being over-trusted. */
  const all = new Map(KS.map((k) => [k, []]));
  const byGames = new Map(KS.map((k) => [k, new Map()]));
  const top = new Map(KS.map((k) => [k, []]));
  const byGamesTop = new Map(KS.map((k) => [k, new Map()]));
  let weeks = 0, rowsUsed = 0, draftableUsed = 0;

  for (const season of SEASONS) {
    const rows = parseCSVObjects(await nflverseCSV('stats_player', `stats_player_week_${season}.csv`));
    /* This week's actual, looked up only after the estimate is built. */
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
      weeks++;

      /* MEASURED WHERE THE GAME IS PLAYED, WHICH IS THE TOP OF THE BOARD.
         The first draft of this probe took every man with a game and reported that
         shrinkage made prediction monotonically worse and that ONE GAME men had the
         LOWEST error of any bucket. Both readings were the population rather than the
         model: a man with one game through week seven is overwhelmingly a bench player,
         his average is near zero, his next Sunday is near zero, and predicting nothing
         for a nobody is easy. 9,632 of 20,121 player-weeks were deep bench, so the
         average was theirs. Nobody drafts them, and a roster of six is only ever taken
         off the expensive end. So the pool is cut to the men a drafter would actually be
         choosing between, per position, and the whole-pool figure is kept beside it
         because the contrast is the finding. */
      const ranked = {};
      for (const pos of POSITIONS) {
        ranked[pos] = todate.filter((p) => p.position === pos && playing.has(p.team))
          .sort((a, b) => b.half_ppg - a.half_ppg);
      }
      const pri = priors(ranked);

      for (const p of todate) {
        if (!playing.has(p.team)) continue;
        /* A man with no row in week N did not play: he scores zero and that is a real
           outcome a drafter is exposed to, not a missing measurement. */
        const y = actual.get(`${p.player_id}|${week}`) ?? 0;
        const draftable = ranked[p.position].indexOf(p) < TOP_N;
        rowsUsed++;
        if (draftable) draftableUsed++;
        for (const k of KS) {
          const x = shrunk(p, pri[p.position], k);
          all.get(k).push([x, y]);
          if (draftable) top.get(k).push([x, y]);
          const bucket = p.games >= 6 ? '6+' : String(p.games);
          const m = draftable ? byGamesTop.get(k) : byGames.get(k);
          if (!m.has(bucket)) m.set(bucket, []);
          m.get(bucket).push([x, y]);
        }
      }
    }
  }

  console.log(`seasons ${SEASONS.join(', ')}  weeks ${FROM_WEEK} to ${TO_WEEK}  shrinking toward ${TOWARD.toUpperCase()}`);
  console.log(`${weeks} weeks, ${rowsUsed.toLocaleString('en-US')} player-weeks, `
    + `${draftableUsed.toLocaleString('en-US')} of them in the top ${TOP_N} a position. Out of sample.`);

  /*
   * CALIBRATION IS THE OBJECTIVE, NOT CORRELATION, and picking the wrong one picked the
   * wrong K. Correlation asks whether the board is in the right ORDER. What this pricing
   * promises is that equal price means equal expected points, which is a question about
   * BIAS: at a given price, does a man with one game deliver what a man with seven does.
   * Fitted on r, shrinkage looked strictly harmful (0.4314 at K=0 falling to 0.2809 at 20)
   * while the thing it was added to fix went unmeasured. The gap below is the fix's own
   * subject: the miss on a one game man minus the miss on a six game man, which is the
   * points a drafter loses for no reason other than sample length.
   */
  const bucketBias = (m) => {
    const out = {};
    for (const b of ['1', '2', '3', '4', '5', '6+']) {
      const rows = m.get(b);
      if (!rows || rows.length < 50) continue;
      out[b] = rows.reduce((t, r) => t + (r[1] - r[0]), 0) / rows.length;
    }
    return out;
  };

  console.log('\nDRAFTABLE men. How far short of its estimate each sample length lands:');
  console.log('   K      1g      2g      3g      4g      5g     6+g     GAP(1g vs 6+)      r     mae');
  let best = null;
  for (const k of KS) {
    const bias = bucketBias(byGamesTop.get(k));
    const f = fitOf(top.get(k));
    const gap = Math.abs((bias['1'] ?? 0) - (bias['6+'] ?? 0));
    if (!best || gap < best.gap) best = { k, gap, f, bias };
    const cells = ['1', '2', '3', '4', '5', '6+']
      .map((b) => (bias[b] == null ? '    -  ' : bias[b].toFixed(2).padStart(7))).join(' ');
    console.log(`  ${String(k).padStart(2)} ${cells}   ${gap.toFixed(2).padStart(12)}   `
      + `${f.r.toFixed(4)}  ${f.mae.toFixed(2)}`);
  }

  console.log(`\nflattest gap at K = ${best.k}: `
    + `${best.gap.toFixed(2)} points between a one game man and a six game man,`);
  console.log(`  against ${Math.abs((bucketBias(byGamesTop.get(0))['1'] ?? 0)
    - (bucketBias(byGamesTop.get(0))['6+'] ?? 0)).toFixed(2)} unshrunk. `
    + `Ranking cost: r ${fitOf(top.get(0)).r.toFixed(4)} to ${best.f.r.toFixed(4)}.`);
  console.log(`\nSHRINK_K = ${best.k}`);
};

main().catch((e) => { console.error(e); process.exit(1); });
