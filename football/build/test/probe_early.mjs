/* THE PROJECTION WAS FITTED POOLED, AND THE MODE IS PLAYED IN ONE BUCKET AT A TIME.
 *
 *   node football/build/test/probe_early.mjs
 *   node football/build/test/probe_early.mjs --seasons 2022,2023,2024 --from 2 --to 17
 *
 * `probe_projection.mjs` fitted PROJ_LIFT over 6,720 draftable player-weeks and removed the
 * bias exactly. Its default window is weeks 4 to 17, so the shortest sample in it is three
 * games, and the pool it averages over is dominated by men with eight or ten. Week 3 was
 * never in the sample at all.
 *
 * A player does not meet the pool. They meet ONE WEEK, and in that week nearly every man on
 * the board has the same number of games, because a season to date is the same length for
 * everybody who has not been hurt or rested. So "unbiased over the pool" and "unbiased on
 * the screen a player is looking at" are two different claims, and only the first was ever
 * measured.
 *
 * THIS SPLITS THE SAME MEASUREMENT BY GAMES PLAYED and asks it of weeks 2 upward, which is
 * every week the mode can actually be played. If the shipped projection is low in the short
 * buckets and right in the long ones, then it is right about the season and wrong about
 * September, and a reader in September is being told a number that is not theirs.
 *
 * ─── WHY THE PRICE MUST NOT BE TOUCHED TO FIX IT ────────────────────────────────────
 *
 * The shrink toward zero exists to stop two men at one price handing back different points
 * because one of them has played once and the other seven. That is a comparison BETWEEN
 * sample lengths, it was measured, and it is right. Inside a single week there is almost
 * nothing for it to correct, because the lengths are nearly all equal, and a uniform
 * multiplier on every man's estimate cannot move a single price: `pricePool` anchors on the
 * pool's own baseline and its own maximum, so scaling the whole board leaves every `t`
 * exactly where it was.
 *
 * So the price is invariant to the thing the projection is wrong about, and the two can be
 * separated without re-fitting anything the price depends on. That is the finding this file
 * exists to establish, and it is asserted below rather than argued: the board is priced at
 * the shipped shrink and again at every candidate, and the prices are compared.
 */

import {
  POSITIONS, nflverseCSV, cachedCSV, parseCSVObjects, GAMES_URL,
} from '../lib.mjs';
import {
  seasonToDate, halfPPR, clubsPlaying, shrunkPPG, SHRINK_K, pricePool,
  projectedPoints, positionLevels,
} from '../weekly-pool.mjs';

/*
 * PROJ_LIFT IS HISTORY AND IS DECLARED HERE RATHER THAN IMPORTED. It was the flat lift this
 * file argued against, so the pass that won the argument removed it from `weekly-pool.mjs`
 * and left this probe importing a name that no longer existed: it has not run since, and
 * nothing said so, because a probe is a command somebody types rather than a thing CI runs.
 * Found by `probe_price.mjs` needing the same import list.
 *
 * It stays as a candidate because a probe that cannot draw the line it moved off is a probe
 * that cannot show its own result twice. `shipped` below is the projection that ACTUALLY
 * ships now, so the baseline column means what its heading says.
 */
const PROJ_LIFT = 0.54;

const arg = (flag, fallback) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

const SEASONS = arg('--seasons', '2022,2023,2024').split(',').map(Number);
const FROM_WEEK = Number(arg('--from', '2'));
const TO_WEEK = Number(arg('--to', '17'));
const TOP_N = Number(arg('--top', '40'));

const fix = (v, d = 2) => (Math.round(v * 10 ** d) / 10 ** d).toFixed(d);
const pad = (s, n) => String(s).padStart(n);

/* ─── the candidates ────────────────────────────────────────────────────────────────
 *
 * Every one of these answers "what will this man score this week" and NOTHING ELSE. None of
 * them is allowed near the price, which stays on `shrunkPPG` whatever wins here.
 *
 * `ppg` is the raw season to date, which is the number a reader could work out themselves
 * off the stat line on the card, and is therefore the one any other candidate has to beat
 * to be worth existing.
 */
const CANDIDATES = {
  /* what ships today: plays x rate, per position. This file is the pass that put it there. */
  shipped: (p, ctx) => projectedPoints(p, ctx.level),
  /* what shipped BEFORE it, and what the argument was against */
  'flat lift': (p) => Math.max(0, shrunkPPG(p) + PROJ_LIFT),
  /* the stat line divided by the games, and no opinion at all */
  raw: (p) => p.half_ppg,
  /* the raw average with the pooled lift on it */
  'raw+lift': (p) => Math.max(0, p.half_ppg + PROJ_LIFT),
};

/* A shrink toward a LEVEL rather than toward zero, at several strengths. The level is the
   draftable board's own mean for that position, which is knowable on the Tuesday and is the
   honest "what does a man like this usually do". Zero is not that: nobody on a draftable
   board is expected to score nothing, and shrinking toward it is a statement about PRICE
   (how much evidence is there) wearing the clothes of a statement about POINTS. */
for (const k of [1, 2, 4]) {
  CANDIDATES[`toward level K=${k}`] = (p, ctx) =>
    Math.max(0, (p.games * p.half_ppg + k * (ctx.level.get(p.position) || 0)) / (p.games + k));
}

/*
 * THE SHRINK AT ITS OWN STRENGTH, plus the lift. Same shape as what ships, with the one
 * constant that decides how hard a short sample is discounted fitted for THIS job rather
 * than inherited from the price. If the projection only needs a gentler shrink then this is
 * the smallest possible fix and nothing else has to change.
 */
for (const k of [0.5, 0.75, 1, 1.5]) {
  CANDIDATES[`shrink K=${k}`] = (p) =>
    Math.max(0, (p.games * p.half_ppg) / (p.games + k) + PROJ_LIFT);
}

const main = async () => {
  const games = parseCSVObjects(await cachedCSV(GAMES_URL, 'games.csv'));

  /* rows of { games, pos, ppg, actual, est: {name -> number} } */
  const rows = [];
  /* week key -> { shipped: [prices], candidate: [prices] } so the invariance claim below is
     measured on real boards rather than asserted from the algebra. */
  const priceRuns = [];
  let weeks = 0;

  for (const season of SEASONS) {
    const stat = parseCSVObjects(
      await nflverseCSV('stats_player', `stats_player_week_${season}.csv`));
    const actual = new Map();
    for (const r of stat) {
      if (String(r.season_type) !== 'REG') continue;
      actual.set(`${r.player_id}|${r.week}`, halfPPR(r));
    }

    for (let week = FROM_WEEK; week <= TO_WEEK; week++) {
      const playing = clubsPlaying(games, season, week);
      if (!playing.size) continue;
      const todate = seasonToDate(stat, week);
      if (todate.length < 50) continue;
      weeks++;

      /* The draftable board: the top men a position among clubs with a game, which is the
         set `probe_projection` measures on and the set anybody actually drafts from. */
      const board = [];
      for (const pos of POSITIONS) {
        const men = todate.filter((p) => p.position === pos && playing.has(p.team))
          .sort((a, b) => b.half_ppg - a.half_ppg).slice(0, TOP_N);
        board.push(...men);
      }
      if (!board.length) continue;

      /* HOW MANY GAMES HIS CLUB HAS ALREADY PLAYED, off the schedule, which is what makes
         "he has two games" mean different things in week 3 and in week 10. Read here rather
         than as `week - 1`, because a bye is a week nobody could have played in. */
      const clubGames = new Map();
      for (const g of games) {
        if (Number(g.season) !== season || !(Number(g.week) >= 1 && Number(g.week) < week)) continue;
        if (g.game_type && g.game_type !== 'REG') continue;
        for (const t of [g.home_team, g.away_team]) {
          if (t) clubGames.set(t, (clubGames.get(t) || 0) + 1);
        }
      }

      const level = new Map();
      for (const pos of POSITIONS) {
        const men = board.filter((p) => p.position === pos);
        level.set(pos, men.length
          ? men.reduce((t, p) => t + p.half_ppg, 0) / men.length : 0);
      }
      const ctx = { level };

      for (const p of board) {
        const est = {};
        for (const [name, f] of Object.entries(CANDIDATES)) est[name] = f(p, ctx);
        rows.push({
          season, week,
          of: clubGames.get(p.team) || p.games,
          /* What this POSITION is doing on this week's board. A single global level shrinks
             a tight end up toward a quarterback's rate and a quarterback down toward a
             tight end's, which is wrong at both ends of the same board at once. */
          poslevel: level.get(p.position) || 0,
          games: p.games, pos: p.position, ppg: p.half_ppg,
          actual: actual.get(`${p.player_id}|${week}`) ?? 0,
          est,
        });
      }

      /* THE INVARIANCE CLAIM, MEASURED. The whole eligible pool is priced as the build
         prices it, then priced again with every man's estimate replaced by a candidate's,
         and the two price lists are compared man for man. If the price moves, the candidate
         is not free and this file has no business recommending it. */
      if (weeks % 8 === 1) {
        const eligible = todate.filter((p) => p.games >= 1 && playing.has(p.team));
        if (eligible.length > 50) {
          const priceOf = (f) => {
            const copy = eligible.map((p) => ({ ...p }));
            /* pricePool reads `half_ppg` and `games` through shrunkPPG, so a candidate is
               injected by overriding est_ppg after the fact is not possible. It is measured
               the only honest way: the pool is priced normally, and then priced again with
               half_ppg scaled so shrunkPPG lands on the candidate's number. */
            if (f) {
              for (const p of copy) {
                const want = f(p, ctx);
                p.half_ppg = (want * (p.games + SHRINK_K)) / Math.max(1, p.games);
              }
            }
            /* w = 0 EXPLICITLY. The price carries its own blend weight now, so a call that
               left it to the default would price these two lists under a rule this section
               is not asking about and the invariance claim would be measuring that instead. */
            pricePool(copy, positionLevels(copy), 0);
            return copy.map((p) => p.price_musd);
          };
          priceRuns.push({ base: priceOf(null), alt: priceOf(CANDIDATES.raw) });
        }
      }
    }
  }

  const bucketOf = (g) => (g >= 6 ? '6+' : String(g));
  const BUCKETS = ['1', '2', '3', '4', '5', '6+'];
  const names = Object.keys(CANDIDATES);

  console.log(`seasons ${SEASONS.join(', ')}  weeks ${FROM_WEEK} to ${TO_WEEK}`);
  console.log(`${weeks} weeks, ${rows.length.toLocaleString('en-US')} draftable player-weeks,`
    + ` top ${TOP_N} a position. Out of sample.\n`);

  /* ─── what a man in each bucket actually does ─────────────────────────────────────── */
  console.log('WHAT THE BOARD ACTUALLY SCORES, by how many games it has played');
  console.log('  games      n   raw ppg   actually scored   shipped proj   shipped bias');
  for (const b of BUCKETS) {
    const r = rows.filter((x) => bucketOf(x.games) === b);
    if (!r.length) continue;
    const mean = (f) => r.reduce((t, x) => t + f(x), 0) / r.length;
    const act = mean((x) => x.actual);
    const ship = mean((x) => x.est.shipped);
    console.log(`  ${pad(b, 5)} ${pad(r.length.toLocaleString('en-US'), 6)}`
      + `   ${pad(fix(mean((x) => x.ppg)), 7)}   ${pad(fix(act), 15)}`
      + `   ${pad(fix(ship), 12)}   ${pad((act - ship >= 0 ? '+' : '') + fix(act - ship), 12)}`);
  }

  /* ─── every candidate, in every bucket ───────────────────────────────────────────── */
  console.log('\nBIAS (what he scored minus what we told them), by bucket.'
    + ' Zero is the target.');
  console.log(`  ${'candidate'.padEnd(18)}${BUCKETS.map((b) => pad(b, 8)).join('')}`
    + `${pad('pooled', 9)}`);
  for (const name of names) {
    const cells = BUCKETS.map((b) => {
      const r = rows.filter((x) => bucketOf(x.games) === b);
      if (!r.length) return pad('-', 8);
      const v = r.reduce((t, x) => t + (x.actual - x.est[name]), 0) / r.length;
      return pad((v >= 0 ? '+' : '') + fix(v, 2), 8);
    });
    const pooled = rows.reduce((t, x) => t + (x.actual - x.est[name]), 0) / rows.length;
    console.log(`  ${name.padEnd(18)}${cells.join('')}`
      + `${pad((pooled >= 0 ? '+' : '') + fix(pooled, 2), 9)}`);
  }

  console.log('\nMEAN ABSOLUTE ERROR, by bucket. Lower is better, and the spread between'
    + ' candidates is the noise floor.');
  console.log(`  ${'candidate'.padEnd(18)}${BUCKETS.map((b) => pad(b, 8)).join('')}`
    + `${pad('pooled', 9)}`);
  for (const name of names) {
    const cells = BUCKETS.map((b) => {
      const r = rows.filter((x) => bucketOf(x.games) === b);
      if (!r.length) return pad('-', 8);
      return pad(fix(r.reduce((t, x) => t + Math.abs(x.actual - x.est[name]), 0) / r.length), 8);
    });
    const pooled = rows.reduce((t, x) => t + Math.abs(x.actual - x.est[name]), 0) / rows.length;
    console.log(`  ${name.padEnd(18)}${cells.join('')}${pad(fix(pooled), 9)}`);
  }

  /* ─── what the data actually says the map is ──────────────────────────────────────── */
  /*
   * A MEAN BIAS IS NOT A CALIBRATION, and this is the section that says so. Every candidate
   * above is some multiple of the season to date plus a constant, and a mean bias can be
   * removed by moving either one. Which of the two is wrong decides whether the fix is a
   * lift or a slope, and a lift applied to a slope problem is right in the middle of the
   * board and wrong at both ends, which is where a drafter is looking.
   */
  console.log('\nWHAT THE MAP ACTUALLY IS: least squares of what he scored on his raw'
    + ' season to date.');
  console.log('  games      n    slope   intercept   the shrink offers');
  for (const b of BUCKETS) {
    const r = rows.filter((x) => bucketOf(x.games) === b);
    if (r.length < 30) continue;
    const mx = r.reduce((t, x) => t + x.ppg, 0) / r.length;
    const my = r.reduce((t, x) => t + x.actual, 0) / r.length;
    let sxy = 0, sxx = 0;
    for (const x of r) { sxy += (x.ppg - mx) * (x.actual - my); sxx += (x.ppg - mx) ** 2; }
    const a = sxy / sxx;
    const g = r.reduce((t, x) => t + x.games, 0) / r.length;
    console.log(`  ${pad(b, 5)} ${pad(r.length.toLocaleString('en-US'), 6)}`
      + `   ${pad(fix(a, 3), 6)}   ${pad(fix(my - a * mx, 2), 9)}`
      + `   ${pad(fix(g / (g + SHRINK_K), 3), 17)}`);
  }

  /* ─── and whether the error is the same everywhere on the board ───────────────────── */
  console.log('\nBIAS BY WHERE HE SITS ON THE BOARD, at 2 games, which is what week 3 is.');
  console.log('  A LIFT MOVES ALL FIVE ROWS BY THE SAME AMOUNT. A slope does not.');
  {
    const r = rows.filter((x) => bucketOf(x.games) === '2').sort((a, b) => a.ppg - b.ppg);
    const fifth = Math.floor(r.length / 5);
    console.log(`  ${'raw ppg band'.padEnd(16)}${pad('n', 6)}${pad('scored', 9)}`
      + names.map((n) => pad(n.slice(0, 10), 12)).join(''));
    for (let i = 0; i < 5; i++) {
      const g = r.slice(i * fifth, i === 4 ? r.length : (i + 1) * fifth);
      if (!g.length) continue;
      const act = g.reduce((t, x) => t + x.actual, 0) / g.length;
      const cells = names.map((n) => {
        const v = act - g.reduce((t, x) => t + x.est[n], 0) / g.length;
        return pad((v >= 0 ? '+' : '') + fix(v, 2), 12);
      });
      console.log(`  ${(`${fix(g[0].ppg, 1)} to ${fix(g[g.length - 1].ppg, 1)}`).padEnd(16)}`
        + `${pad(g.length, 6)}${pad(fix(act), 9)}${cells.join('')}`);
    }
  }

  /* ─── the lineup, which is what a player reads ────────────────────────────────────── */
  console.log('\nA SIX MAN LINEUP IS SIX OF THESE ADDED UP, so the bias is multiplied by six.');
  console.log('  Off a bucket-2 board, the shipped projection is out by:');
  {
    const r = rows.filter((x) => bucketOf(x.games) === '2');
    const v = r.reduce((t, x) => t + (x.actual - x.est.shipped), 0) / Math.max(1, r.length);
    console.log(`    ${fix(v * 6, 1)} points on a lineup, `
      + `against a mean lineup projection of about ${fix(r.reduce((t, x) => t + x.est.shipped, 0)
        / Math.max(1, r.length) * 6, 1)}`);
  }

  /* ─── is the games effect really about AVAILABILITY ───────────────────────────────── */
  /*
   * THE SHRINK'S WHOLE STORY IS EVIDENCE: two games is a thin sample, so believe less of it.
   * That predicts a SLOPE that rises with the sample and nothing else. The fit above says
   * the slope barely moves and the LEVEL moves a lot, which is a different mechanism
   * wearing the same number.
   *
   * The obvious candidate is that a man with two games in week ten has MISSED some, and a
   * man who has missed games misses more. He is not a thin sample of a good player, he is a
   * player who is often not on the field, and what he scores on a Sunday he is absent for
   * is zero. If that is the mechanism then the games effect should vanish once availability
   * is held fixed, and `share` is what holds it: how many of his club's games he has played.
   */
  console.log('\nIS IT EVIDENCE OR IS IT AVAILABILITY? Held to men who have played EVERY'
    + " one of their club's games.");
  console.log('  games      n   raw ppg   scored   slope   intercept   blanked');
  for (const b of BUCKETS) {
    const r = rows.filter((x) => bucketOf(x.games) === b && x.games >= x.of);
    if (r.length < 30) continue;
    const mx = r.reduce((t, x) => t + x.ppg, 0) / r.length;
    const my = r.reduce((t, x) => t + x.actual, 0) / r.length;
    let sxy = 0, sxx = 0;
    for (const x of r) { sxy += (x.ppg - mx) * (x.actual - my); sxx += (x.ppg - mx) ** 2; }
    const a = sxy / sxx;
    const zero = r.filter((x) => x.actual <= 0).length / r.length;
    console.log(`  ${pad(b, 5)} ${pad(r.length.toLocaleString('en-US'), 6)}`
      + `   ${pad(fix(mx), 7)}   ${pad(fix(my), 6)}   ${pad(fix(a, 3), 5)}`
      + `   ${pad(fix(my - a * mx, 2), 9)}   ${pad(`${fix(zero * 100, 1)}%`, 7)}`);
  }
  console.log('\n  and the men who have already missed one:');
  console.log('  share      n   raw ppg   scored   ratio   blanked');
  for (const [lab, lo, hi] of [['under .5', 0, 0.5], ['.5 to .8', 0.5, 0.8],
    ['.8 to 1', 0.8, 0.999], ['every one', 0.999, 9]]) {
    const r = rows.filter((x) => x.of > 0 && x.games / x.of >= lo && x.games / x.of < hi);
    if (r.length < 30) continue;
    const mx = r.reduce((t, x) => t + x.ppg, 0) / r.length;
    const my = r.reduce((t, x) => t + x.actual, 0) / r.length;
    const zero = r.filter((x) => x.actual <= 0).length / r.length;
    console.log(`  ${lab.padEnd(9)} ${pad(r.length.toLocaleString('en-US'), 6)}`
      + `   ${pad(fix(mx), 7)}   ${pad(fix(my), 6)}   ${pad(fix(my / mx, 3), 5)}`
      + `   ${pad(`${fix(zero * 100, 1)}%`, 7)}`);
  }

  /* ─── the week 3 question, asked exactly ──────────────────────────────────────────── */
  /*
   * A SHARE AND A PPG BAND ARE THE TWO THINGS A CARD SHOWS, so this is the calibration
   * table for the screen a player is actually looking at: an ever-present man, two games in,
   * at each height on the board. If a single multiple of his own average lands every row,
   * then the projection is one constant and the shrink was never the right shape.
   */
  console.log('\nTHE WEEK 3 BOARD, EXACTLY: ever-present men with two games.');
  console.log('  raw ppg band         n   raw ppg   scored   ratio   blanked   shipped');
  {
    const r = rows.filter((x) => x.games === 2 && x.of === 2).sort((a, b) => a.ppg - b.ppg);
    const fifth = Math.max(1, Math.floor(r.length / 5));
    for (let i = 0; i < 5; i++) {
      const g = r.slice(i * fifth, i === 4 ? r.length : (i + 1) * fifth);
      if (g.length < 10) continue;
      const mean = (f) => g.reduce((t, x) => t + f(x), 0) / g.length;
      const mx = mean((x) => x.ppg), my = mean((x) => x.actual);
      console.log(`  ${(`${fix(g[0].ppg, 1)} to ${fix(g[g.length - 1].ppg, 1)}`).padEnd(16)}`
        + `${pad(g.length, 6)}   ${pad(fix(mx), 7)}   ${pad(fix(my), 6)}`
        + `   ${pad(fix(my / mx, 3), 5)}   `
        + `${pad(`${fix(g.filter((x) => x.actual <= 0).length / g.length * 100, 1)}%`, 7)}`
        + `   ${pad(fix(mean((x) => x.est.shipped)), 7)}`);
    }
    const top = r.slice(-25);
    const m = (f) => top.reduce((t, x) => t + f(x), 0) / top.length;
    console.log(`\n  the 25 loudest of them: ${fix(m((x) => x.ppg))} raw ppg,`
      + ` scored ${fix(m((x) => x.actual))}, told ${fix(m((x) => x.est.shipped))}`);
  }

  /* ─── the sweep, on one set of seasons and reported on another ────────────────────── */
  /*
   * THE FORM IS THE SHIPPED ONE WITH ITS PRIOR PUT BACK. What ships is
   *
   *     (g * ppg) / (g + K)  +  LIFT
   *
   * which is a shrinkage estimator toward ZERO with a constant bolted on the end. A
   * shrinkage estimator toward a level M is
   *
   *     (g * ppg + K * M) / (g + K)
   *
   * and the two are the same thing except that the second one's intercept, K*M/(g+K), gets
   * SMALLER as the sample grows, where the bolted-on constant does not. That is the whole
   * defect: a man with two games and a man with ten are given the same correction, and only
   * one of them needs it. PROJ_LIFT was fitted pooled, so it is the right correction at the
   * pool's average sample length and at no other.
   *
   * Both constants are swept together, because they trade: a harder shrink wants a higher
   * level to shrink toward. FITTED ON THE SEASONS IN --fit AND REPORTED ON THE REST, so a
   * two parameter fit over six buckets cannot pass by memorising them.
   */
  const FIT = arg('--fit', '2022,2023').split(',').map(Number);
  const fitRows = rows.filter((x) => FIT.includes(x.season));
  const outRows = rows.filter((x) => !FIT.includes(x.season));
  const score = (set, f) => {
    let worst = 0, mae = 0;
    for (const b of BUCKETS) {
      const r = set.filter((x) => bucketOf(x.games) === b);
      if (r.length < 30) continue;
      worst = Math.max(worst,
        Math.abs(r.reduce((t, x) => t + (x.actual - f(x)), 0) / r.length));
    }
    for (const x of set) mae += Math.abs(x.actual - f(x));
    return { worst, mae: mae / set.length };
  };

  if (fitRows.length && outRows.length) {
    /*
     * THE MODEL IS TWO TERMS AND THEY ANSWER TWO DIFFERENT QUESTIONS.
     *
     *   plays   how often he is on the field at all, off the share of his club's games he
     *           has already played. The measurement above is as clean as anything in this
     *           repo: the ratio of what a group scores to its own average is 1 minus that
     *           group's blank rate, to three decimal places, at every share.
     *   rate    what he scores when he is, which is the shrunk season to date WITH ITS
     *           PRIOR, so a thin sample is pulled toward a level rather than toward nothing.
     *
     * A floor under `plays` rather than share alone, because an ever-present man still
     * blanks about one Sunday in eleven and a share of 1.0 would promise he never does.
     */
    const build = (k, m, floor, perPos) => (x) => {
      const share = x.of > 0 ? Math.min(1, x.games / x.of) : 1;
      const plays = Math.min(1, floor + (1 - floor) * share);
      const level = perPos ? m * x.poslevel : m;
      return Math.max(0, plays * ((x.games * x.ppg + k * level) / (x.games + k)));
    };
    /* Calibration is asked of every cell a card can be in, not of the pool: a games bucket
       crossed with a height on the board. A model right in the mean and wrong at the top is
       what ships today, and a pooled objective cannot tell the two apart. */
    const cells = (set) => {
      const out = [];
      for (const b of BUCKETS) {
        const r = set.filter((x) => bucketOf(x.games) === b).sort((a, c) => a.ppg - c.ppg);
        if (r.length < 60) continue;
        const third = Math.floor(r.length / 3);
        out.push(r.slice(0, third), r.slice(third, 2 * third), r.slice(2 * third));
      }
      return out.filter((c) => c.length >= 20);
    };
    const fitCells = cells(fitRows);
    const outCells = cells(outRows);
    const worstOf = (cs, f) => Math.max(...cs.map((c) =>
      Math.abs(c.reduce((t, x) => t + (x.actual - f(x)), 0) / c.length)));

    const fitOne = (perPos) => {
      let best = null;
      for (let k = 0.5; k <= 5.01; k += 0.25) {
        const hi = perPos ? 1.5 : 12;
        const step = perPos ? 0.025 : 0.25;
        for (let m = 0; m <= hi + 1e-9; m += step) {
          for (let floor = 0; floor <= 0.61; floor += 0.05) {
            const f = build(k, m, floor, perPos);
            const w = worstOf(fitCells, f);
            if (!best || w < best.w) best = { k, m, floor, perPos, f, w };
          }
        }
      }
      return best;
    };
    const flat = fitOne(false);
    const best = fitOne(true);

    console.log(`\nTHE SWEEP. Fitted on ${FIT.join(', ')},`
      + ` reported on ${[...new Set(outRows.map((x) => x.season))].join(', ')}.`);
    console.log(`  one level for everybody: K = ${fix(flat.k, 2)} toward ${fix(flat.m, 2)},`
      + ` floor ${fix(flat.floor, 2)}`);
    console.log(`  the position's own level: K = ${fix(best.k, 2)} toward`
      + ` ${fix(best.m, 3)} x what the position is doing, floor ${fix(best.floor, 2)}`);
    console.log(`  (what ships is K = ${SHRINK_K} toward 0, a flat +${PROJ_LIFT},`
      + ' and no availability term at all)');

    /*
     * AND THE SHRINK'S OWN STRENGTH, REUSED. K comes back at 2.25 to 2.50 across the three
     * rotations and the price already carries a SHRINK_K of 2, so the question worth asking
     * is whether the projection needs a second one. If pinning it costs nothing then this
     * whole fix is ONE new constant (how much of the position's level to shrink toward) plus
     * the availability term, and the number that decides how hard a thin sample is
     * discounted stays a single number for the whole mode.
     */
    const pinned = build(SHRINK_K, best.m, best.floor, true);
    const arms = [
      ['shipped', (x) => x.est.shipped],
      ['one level', flat.f],
      ['position level', best.f],
      [`K pinned to ${SHRINK_K}`, pinned],
    ];
    console.log('\n  BIAS ON THE HELD OUT SEASON, by bucket:');
    console.log(`  ${'candidate'.padEnd(16)}${BUCKETS.map((b) => pad(b, 8)).join('')}`
      + `${pad('worst cell', 12)}${pad('mae', 8)}`);
    for (const [name, f] of arms) {
      const cs = BUCKETS.map((b) => {
        const r = outRows.filter((x) => bucketOf(x.games) === b);
        if (r.length < 30) return pad('-', 8);
        const v = r.reduce((t, x) => t + (x.actual - f(x)), 0) / r.length;
        return pad((v >= 0 ? '+' : '') + fix(v, 2), 8);
      });
      const s = score(outRows, f);
      console.log(`  ${name.padEnd(16)}${cs.join('')}`
        + `${pad(fix(worstOf(outCells, f)), 12)}${pad(fix(s.mae), 8)}`);
    }

    console.log('\n  A WEEK 3 BOARD ON THE HELD OUT SEASON: ever-present, two games.');
    console.log(`  ${'raw ppg band'.padEnd(16)}${pad('n', 5)}${pad('scored', 9)}`
      + `${pad('shipped', 10)}${pad('one level', 12)}${pad('position level', 16)}`);
    const w3 = outRows.filter((x) => x.games === 2 && x.of === 2)
      .sort((a, b) => a.ppg - b.ppg);
    const fifth = Math.max(1, Math.floor(w3.length / 5));
    for (let i = 0; i < 5; i++) {
      const g = w3.slice(i * fifth, i === 4 ? w3.length : (i + 1) * fifth);
      if (g.length < 8) continue;
      const mean = (f) => g.reduce((t, x) => t + f(x), 0) / g.length;
      console.log(`  ${(`${fix(g[0].ppg, 1)} to ${fix(g[g.length - 1].ppg, 1)}`).padEnd(16)}`
        + `${pad(g.length, 5)}${pad(fix(mean((x) => x.actual)), 9)}`
        + `${pad(fix(mean((x) => x.est.shipped)), 10)}${pad(fix(mean(flat.f)), 12)}${pad(fix(mean(best.f)), 16)}`);
    }

    /*
     * AND THE NUMBER A PLAYER ACTUALLY READS is six of these added up, because the card
     * shows a projection a man and the review screen shows the lineup's total. A six man
     * half PPR lineup is a figure anybody who plays fantasy football already has in their
     * head, so this is the one row here that can be checked against a reader's instinct
     * rather than against another column.
     */
    console.log('\n  THE LINEUP TOTAL, which is the number anybody who plays fantasy knows.'
      + '\n  Off a two game board, the best affordable man at each slot:');
    const SHAPE = ['QB', 'RB', 'RB', 'WR', 'WR', 'TE'];
    const byWeek = new Map();
    for (const x of outRows) {
      if (x.games !== 2 || x.of !== 2) continue;
      const k = `${x.season}|${x.week}`;
      if (!byWeek.has(k)) byWeek.set(k, []);
      byWeek.get(k).push(x);
    }
    let lu = 0, lsh = 0, lnew = 0, n = 0;
    for (const men of byWeek.values()) {
      const picked = [];
      for (const pos of SHAPE) {
        const pool = men.filter((x) => x.pos === pos && !picked.includes(x))
          .sort((a, b) => b.ppg - a.ppg);
        if (pool[0]) picked.push(pool[0]);
      }
      if (picked.length !== 6) continue;
      lu += picked.reduce((t, x) => t + x.actual, 0);
      lsh += picked.reduce((t, x) => t + x.est.shipped, 0);
      lnew += picked.reduce((t, x) => t + best.f(x), 0);
      n++;
    }
    if (n) {
      console.log(`    over ${n} weeks: it scored ${fix(lu / n, 1)}`);
      console.log(`      shipped projected ${fix(lsh / n, 1)}, `
        + `plays x rate projects ${fix(lnew / n, 1)}`);
    }
  }

  /* ─── and the price does not move ─────────────────────────────────────────────────── */
  console.log('\nTHE PRICE IS INVARIANT TO ALL OF THIS, measured on'
    + ` ${priceRuns.length} real boards:`);
  let worst = 0, total = 0, n = 0;
  for (const run of priceRuns) {
    for (let i = 0; i < run.base.length; i++) {
      const d = Math.abs(run.base[i] - run.alt[i]);
      worst = Math.max(worst, d); total += d; n++;
    }
  }
  console.log(`  ${n.toLocaleString('en-US')} prices compared at the shipped shrink and at`
    + ' the raw average');
  console.log(`  worst single price moved $${fix(worst, 2)}M, mean move $${fix(total / n, 3)}M`);
  console.log('  (not zero, because a man with a BYE or a missed Sunday has fewer games than');
  console.log('   the board around him, and he is the only thing the shrink moves in-week)');
};

main().catch((e) => { console.error(e); process.exit(1); });
