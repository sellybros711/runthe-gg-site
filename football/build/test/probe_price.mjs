/* DOES THE PRICE PAY FOR THE RIGHT THING?
 *
 *   node football/build/test/probe_price.mjs
 *   node football/build/test/probe_price.mjs --seasons 2026 --from 3 --to 4
 *   node football/build/test/probe_price.mjs --board            today's board, who moves
 *
 * Reported as the price feeling too weighted toward what a man has done all season and not
 * enough toward what he is expected to do THIS week. That is a claim with a measurement
 * behind it, and this file is the measurement.
 *
 * ─── THE TWO NUMBERS, AND WHY THEY ARE DIFFERENT ───────────────────────────────────
 *
 * `shrunkPPG` is what the price runs on: his points a game, shrunk toward ZERO by
 * `SHRINK_K` games of nothing. It is blind to availability. A man who has played two of his
 * club's three games and one who has played all three are the same row to it.
 *
 * `projectedPoints` is what the card prints: how often he PLAYS times what he scores when
 * he does, shrunk toward what his POSITION is doing on this board. It knows about
 * availability, and `probe_early.mjs` is the pass that put it there.
 *
 * So the two came apart the day the projection was refitted, and `weekly-pool.mjs` says so
 * in as many words: not one price moved, because the projection is not an input to any of
 * them. This asks whether that is still the right answer.
 *
 * ─── THE OBJECTIVE IS BIAS, NOT CORRELATION ────────────────────────────────────────
 *
 * `probe_weekly.mjs` already records what happens when this is fitted on r: shrinkage of
 * any kind looks strictly harmful and the thing it exists to fix goes unmeasured. What a
 * price PROMISES is that equal price means equal expected points, which is a statement
 * about bias, so that is what is asked here too.
 *
 * Specifically, and it is the player's own sentence turned into a number: hold the price
 * fixed, and compare what a man who has played every one of his club's games delivers
 * against what a man who has missed one delivers. If the second is lower, the board is
 * systematically overpaying for absence, and no amount of it being a correct summary of
 * September makes that a good price.
 *
 * ─── THE DIAL ──────────────────────────────────────────────────────────────────────
 *
 * One weight, and nothing else in the file moves:
 *
 *      est = (1 - w) * shrunkPPG + w * projectedPoints
 *
 * Both are half PPR points, so the blend is dimensionally sound and every constant
 * downstream (the baseline, the VOR span, the power curve, the ceiling anchor) reads the
 * same quantity it always did. w = 0 is what ships today.
 */

import {
  POSITIONS, nflverseCSV, cachedCSV, parseCSVObjects, GAMES_URL,
} from '../lib.mjs';
import {
  seasonToDate, halfPPR, clubsPlaying, shrunkPPG, projectedPoints, positionLevels, pricePool,
  SHRINK_K, PRICE_PROJ_W,
} from '../weekly-pool.mjs';
import fs from 'fs';

const arg = (flag, fallback) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const SEASONS = arg('--seasons', '2022,2023,2024').split(',').map(Number);
const FROM_WEEK = Number(arg('--from', '3'));
const TO_WEEK = Number(arg('--to', '17'));
const WEIGHTS = arg('--weights', '0,0.25,0.5,0.75,1').split(',').map(Number);
const BOARD_ONLY = process.argv.includes('--board');

const fix = (v, d = 2) => (Number.isFinite(v) ? (Math.round(v * 10 ** d) / 10 ** d).toFixed(d) : '   -');
const pad = (s, n) => String(s).padStart(n);

/* The bands a reader thinks in rather than deciles, because the whole complaint is about
   what a given amount of money buys and $3M and $40M are not the same conversation. */
const BANDS = [[3, 8], [8, 15], [15, 25], [25, 48.01]];
const bandName = (b) => `$${b[0]}-${b[1] === 48.01 ? 48 : b[1]}M`;

/** How much of his club's games he has been there for. Never above one, and a missing
    denominator is availability UNKNOWN rather than availability zero. */
const playShare = (p) => {
  const of = p.played_of || p.games;
  return of > 0 ? Math.min(1, Math.max(0, p.games / of)) : 1;
};

/*
 * THREE CANDIDATES, AND THE MIDDLE ONE IS THE POINT OF THE FILE.
 *
 *   blend   (1-w) * shrunkPPG + w * projectedPoints. The obvious answer: price off the
 *           number the card already prints. It imports BOTH of the projection's
 *           differences from the price, and only one of them was asked for.
 *   plays   shrunkPPG * playShare. Availability alone, with the price's own prior left
 *           exactly where it is.
 *
 * The difference matters because `projectedPoints` shrinks toward the POSITION LEVEL and
 * the price shrinks toward ZERO, and `weekly-pool.mjs` argues that difference at length: a
 * man is on this board BECAUSE his one game was big, so a prior above his estimate pushes
 * him further out. Blending the projection in quietly reverses that for thin samples, so
 * the sample-size bias below is not a formality, it is the cost this could be paying.
 */
const estimate = (p, levels, w) =>
  (1 - w) * shrunkPPG(p) + w * projectedPoints(p, levels);
const estimatePlays = (p) => shrunkPPG(p) * playShare(p);

/**
 * Price a pool under a blend weight. `pricePool` reads `half_ppg` and `games` through
 * `shrunkPPG`, so a candidate estimate is injected the way `probe_early.mjs` injects one:
 * scale `half_ppg` so that `shrunkPPG` lands on the number wanted. Measured rather than
 * asserted, because a second copy of the price curve would agree with itself.
 */
function priceUnder(men, levels, rule) {
  const copy = men.map((p) => ({ ...p }));
  /* A BLEND ASKS FOR ITS WEIGHT AND NEVER FAKES ONE. `pricePool` takes the weight, so a
     blend is one argument; only a candidate that is not a blend at all has to be injected,
     and it is injected against an explicit w = 0 so nothing is applied twice. */
  if (rule.w != null) {
    pricePool(copy, levels, rule.w);
    return copy.map((p) => p.price_musd);
  }
  for (const p of copy) {
    const want = rule.f(p, levels);
    p.half_ppg = (want * (p.games + SHRINK_K)) / Math.max(1, p.games);
  }
  pricePool(copy, levels, 0);
  return copy.map((p) => p.price_musd);
}

/*
 * EVERY RULE STATES ITS OWN WEIGHT, INCLUDING THE BASELINE, and that is not tidiness. The
 * first draft wrote the baseline as `f: null`, meaning "price it the way the build does",
 * which was right for exactly as long as the build priced at zero. The moment `PRICE_PROJ_W`
 * shipped at 0.25 that column became the blend, so this file would have measured the new
 * default against itself and reported a defect it had just fixed as untouched. It was caught
 * by `pricePool`'s own guard rather than by reading, which is luck.
 *
 * So the baseline is `w = 0` written out, the probe is independent of what ships, and moving
 * the constant cannot move this file's idea of what it is comparing against.
 */
const RULES = [
  { name: 'w=0', w: 0 },
  ...[0.25, 0.5, 0.75, 1].map((w) => ({ name: `blend ${w}`, w })),
  { name: 'plays', f: (p) => estimatePlays(p) },
];

const main = async () => {
  const games = parseCSVObjects(await cachedCSV(GAMES_URL, 'games.csv'));

  if (BOARD_ONLY) return board();

  /* One row a draftable man a week: his price under every weight, whether he had played
     every game his club had, and what he actually scored that week. */
  const rows = [];
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

      /* HIS CLUB'S GAMES, off the schedule and never `week - 1`, because a bye is a week
         nobody could have played in and reading it as a missed game would invent absence
         for a third of the league every Sunday. */
      const clubGames = new Map();
      for (const g of games) {
        if (Number(g.season) !== season) continue;
        if (!(Number(g.week) >= 1 && Number(g.week) < week)) continue;
        if (g.game_type && g.game_type !== 'REG') continue;
        for (const t of [g.home_team, g.away_team]) {
          if (t) clubGames.set(t, (clubGames.get(t) || 0) + 1);
        }
      }

      const eligible = todate.filter((p) => p.games >= 1 && playing.has(p.team));
      if (eligible.length < 50) continue;
      for (const p of eligible) p.played_of = clubGames.get(p.team) || p.games;
      weeks++;

      const levels = positionLevels(eligible);
      const priced = RULES.map((rule) => priceUnder(eligible, levels, rule));

      eligible.forEach((p, i) => {
        rows.push({
          of: p.played_of,
          games: p.games,
          every: p.games >= p.played_of,
          actual: actual.get(`${p.player_id}|${week}`) ?? 0,
          prices: priced.map((list) => list[i]),
        });
      });
    }
  }

  console.log(`\n${rows.length} draftable player-weeks over ${weeks} weeks, `
    + `${SEASONS.join(', ')} weeks ${FROM_WEEK} to ${TO_WEEK}\n`);

  const missed = rows.filter((r) => !r.every).length;
  console.log(`men who had missed at least one of their club's games: `
    + `${fix(100 * missed / rows.length, 1)}% of the board\n`);

  /*
   * A CELL IS ONLY A READING IF BOTH ARMS ARE REAL. The two groups are not the same size in
   * any band and the smaller one is what the comparison rests on, so a band holding four
   * absent men says nothing about absence however many present ones sit beside it. Printed
   * as a dash rather than a number, because a noisy figure in a table like this is read as
   * evidence by whoever looks at it next.
   */
  const ARM_MIN = 40;

  const table = (title, note, split) => {
    console.log(title);
    console.log(`  ${note}\n`);
    const head = pad('band', 10) + pad('n', 7) + pad('arms', 12)
      + RULES.map((r) => pad(r.name, 11)).join('');
    console.log(head);
    console.log('-'.repeat(head.length));
    const totals = RULES.map(() => ({ num: 0, den: 0 }));
    for (const b of BANDS) {
      let armTxt = '';
      const cells = RULES.map((rule, ri) => {
        const inBand = rows.filter((r) => r.prices[ri] >= b[0] && r.prices[ri] < b[1]);
        const a = inBand.filter(split);
        const c = inBand.filter((r) => !split(r));
        if (ri === 0) armTxt = `${c.length}/${a.length}`;
        if (a.length < ARM_MIN || c.length < ARM_MIN) return '-';
        const mean = (x) => x.reduce((t, r) => t + r.actual, 0) / x.length;
        const gap = mean(a) - mean(c);
        const wgt = Math.min(a.length, c.length);
        totals[ri].num += gap * wgt;
        totals[ri].den += wgt;
        return `${gap >= 0 ? '+' : ''}${fix(gap, 2)}`;
      });
      const n = rows.filter((r) => r.prices[0] >= b[0] && r.prices[0] < b[1]).length;
      console.log(pad(bandName(b), 10) + pad(n, 7) + pad(armTxt, 12)
        + cells.map((c) => pad(c, 11)).join(''));
    }
    console.log('-'.repeat(head.length));
    console.log(pad('WEIGHTED', 10) + pad('', 19)
      + totals.map((t) => pad(t.den
        ? `${t.num / t.den >= 0 ? '+' : ''}${fix(t.num / t.den, 2)}` : '-', 11)).join(''));
    console.log();
  };

  /* THE COMPLAINT, AS A NUMBER. */
  table('AT EQUAL PRICE: HAS MISSED A GAME, AGAINST HAS PLAYED EVERY ONE',
    'negative means the board overpays for the man who misses games',
    (r) => !r.every);

  /*
   * THE CONTROL, AND IT IS WHAT DECIDES THIS RATHER THAN THE TABLE ABOVE. `SHRINK_K` was
   * fitted on exactly this axis and took the gap from 3.48 to 0.12, so a fix for
   * availability that re-opens it has moved the defect rather than removed it.
   */
  table("AT EQUAL PRICE: A THIN SAMPLE, AGAINST A SETTLED ONE (the shrink's own axis)",
    'negative means the board overpays for the man with two good games and nothing else',
    (r) => r.games <= 2);

  console.log('HOW FAR THE BOARD MOVES, against what ships today');
  const moveHead = pad('', 12) + RULES.map((r) => pad(r.name, 11)).join('');
  console.log(moveHead);
  const meanAbs = RULES.map((r, ri) =>
    rows.reduce((t, x) => t + Math.abs(x.prices[ri] - x.prices[0]), 0) / rows.length);
  const worst = RULES.map((r, ri) =>
    rows.reduce((t, x) => Math.max(t, Math.abs(x.prices[ri] - x.prices[0])), 0));
  console.log(pad('mean move', 12) + meanAbs.map((v) => pad(`$${fix(v, 2)}M`, 11)).join(''));
  console.log(pad('worst move', 12) + worst.map((v) => pad(`$${fix(v, 1)}M`, 11)).join(''));
  console.log();
};

/* ─── today's live board, which is the thing the reader is actually looking at ────── */
function board() {
  const file = `football/data/weekly_${arg('--season', '2026')}_w${arg('--week', '3')}.json`;
  const pool = JSON.parse(fs.readFileSync(file, 'utf8'));
  const men = pool.pool.map((p) => ({ ...p }));
  const levels = positionLevels(men);

  console.log(`\n${file}: ${men.length} men\n`);

  /* Where the two numbers disagree most, by name, because this is the half a reader can
     check against their own opinion of the player. */
  const rank = (key) => {
    const order = [...men].sort((a, b) => b[key] - a[key]);
    const at = new Map();
    order.forEach((p, i) => at.set(p.player_id, i + 1));
    return at;
  };
  const byPrice = rank('price_musd');
  const byProj = rank('proj');

  const gaps = men.map((p) => ({
    p, d: byPrice.get(p.player_id) - byProj.get(p.player_id),
  })).sort((a, b) => a.d - b.d);

  const show = (label, list) => {
    console.log(label);
    for (const { p, d } of list) {
      const plays = p.played_of ? p.games / p.played_of : 1;
      console.log(`  ${pad(p.name.slice(0, 22), 22)} ${pad(p.position, 3)}  `
        + `$${pad(fix(p.price_musd, 1), 5)}M  proj ${pad(fix(p.proj, 1), 5)}  `
        + `${p.games} of ${p.played_of} games  `
        + `${plays < 1 ? 'MISSED' : '      '}  rank ${d > 0 ? '+' : ''}${d}`);
    }
    console.log();
  };
  /* Rank 1 is the dearest and rank 1 is also the highest projection, so a man whose PRICE
     rank is far ahead of his PROJECTION rank is one the board is charging for something the
     card does not expect him to deliver. That is `d` negative. Written the other way round
     first, and the two lists read perfectly well swapped, which is the whole reason this
     comment is here. */
  show('DEAR FOR WHAT THE CARD PROJECTS (priced well above where his projection ranks)',
    gaps.slice(0, 8));
  show('CHEAP FOR WHAT THE CARD PROJECTS', gaps.slice(-8).reverse());

  const miss = men.filter((p) => p.played_of && p.games < p.played_of);
  console.log(`${miss.length} of ${men.length} priced men have missed a game `
    + `(${fix(100 * miss.length / men.length, 1)}%)\n`);
}

main();
