/* WHAT CAP MAKES THE FANTASY CHALLENGE DRAFT A DECISION?
 *
 *   node football/build/test/probe_cap.mjs
 *   node football/build/test/probe_cap.mjs --season 2026 --week 3
 *
 * The cap is the only number in draft.js that is not either a shape (six slots) or a
 * readability call (five men a board). It decides everything about how the mode plays, and
 * the two ways it can be wrong are opposite and both silent:
 *
 *   TOO HIGH   every board's dearest man is affordable, so the whole draft is "take the top
 *              option", six times. No decision, and nothing on screen says so.
 *   TOO LOW    the reserve floor eats the board, every spin offers the same replacement
 *              men, and the wheel decides the lineup rather than the drafter.
 *
 * So it is measured against three bots, at every cap, on a real week's pool:
 *
 *   TOP        always takes the dearest man offered. The careless drafter, and also the
 *              ceiling: nobody can beat him by accident.
 *   VALUE      takes the best projected points per million. The thrifty drafter.
 *   RANDOM     takes one of the five at random. The floor, and the one that says how much
 *              of the outcome the wheel is deciding on its own.
 *
 * WHAT A GOOD CAP LOOKS LIKE. The gap between TOP and RANDOM is how much drafting is worth
 * at all. The gap between VALUE and TOP is whether there is a second way to play it: a cap
 * where spending everything is simply right has one strategy, and a cap where thrift always
 * wins has one strategy wearing a different hat. What is wanted is the band where the two
 * trade places, because that is the band where a drafter has to look at the board.
 *
 * AND THE CAP MUST BIND. `top spends` is the share of the cap the careless bot gets through.
 * At 100% he is hitting the wall on every draft and the cap is the game; under about 90% he
 * is not even reaching it and the cap is decoration.
 */

import { buildWeeklyPool } from '../weekly-pool.mjs';
import DRAFT from '../../fantasy/draft.js';

const arg = (flag, fallback) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

const SEASON = Number(arg('--season', '2026'));
const WEEK = Number(arg('--week', '3'));
const RUNS = Number(arg('--runs', '600'));
const CAPS = (arg('--caps', '70,80,90,100,110,125,150,200')).split(',').map(Number);

/*
 * THE BOTS, each a function from a board to the man it signs.
 *
 * VALUE IS DEGENERATE AND IS KEPT TO SAY SO. Points per million always picks the cheapest
 * man on the board, at every cap, because the price curve is convex by design
 * (PRICE_K = 1.8): a man twice as good costs more than twice as much. So "best value" is
 * the floor of the board, every time, and the bot finishes 25 points behind. That is not a
 * strategy the mode failed to reward, it is the pricing working, and anybody who reaches
 * for a ratio here should see the row before they do.
 *
 * BUDGET IS THE ONE THAT ASKS THE REAL QUESTION. Greedy-dearest spends what it has as early
 * as it can, which in a fixed-shape lineup means the quarterback eats the cap and the last
 * two slots take whatever is left. A budget bot holds back a share for each remaining slot,
 * sized by what that position actually costs in this pool. If greedy beats it the draft has
 * no allocation in it and the cap should be tighter; if it beats greedy there is a second
 * way to play.
 */
const share = (pool) => {
  /* What each slot is worth as a fraction of the whole, taken off the dearest man at each
     position, so the split follows the week's own board rather than a typed table. */
  const top = {};
  for (const pos of new Set(DRAFT.SLOTS)) {
    top[pos] = Math.max(...pool.filter((p) => p.position === pos).map((p) => p.price_musd));
  }
  const total = DRAFT.SLOTS.reduce((t, s) => t + top[s], 0);
  return DRAFT.SLOTS.map((s) => top[s] / total);
};

const BOTS = {
  top: (board) => board[0],
  value: (board) => board.slice().sort((a, b) =>
    (b.proj / Math.max(1, b.price_musd)) - (a.proj / Math.max(1, a.price_musd)))[0],
  random: (board, rnd) => board[Math.floor(rnd() * board.length)],
  budget: (board, rnd, ctx) => {
    const room = ctx.cap * ctx.share[ctx.i] + ctx.slack;
    const within = board.filter((p) => p.price_musd <= room);
    /* Nothing inside the share means the share was wrong for this board, and refusing to
       sign is not an option, so it takes the cheapest rather than stranding. */
    return within.length ? within[0] : board[board.length - 1];
  },
};

/* One whole lineup, played through the real spin. The cap is passed rather than read off
   DRAFT.CAP_MUSD, because the whole point of this file is to sweep it, and reading the
   shipped constant would measure one cell and print it eight times. That is the bug
   FULL_OPTIMAL_CACHE had. */
function draftOne(pool, cap, pick, seed, shares) {
  const rnd = DRAFT.rngOf(seed);
  const chance = { seed, men: [] };
  for (let i = 0; i < DRAFT.SLOTS.length; i++) {
    const left = cap - DRAFT.spent(chance);
    const taken = chance.men.map((m) => m.player_id);
    const board = DRAFT.spin(pool, i, left, taken, DRAFT.rngOf(seed + i * 0x9E3779B1));
    if (!board.length) return null;          /* stranded, which must never happen */
    /* `slack` is what earlier slots underspent, handed forward. Without it a budget bot
       that was offered nothing good at quarterback would never spend that money at all. */
    const slack = cap * shares.slice(0, i).reduce((t, s) => t + s, 0) - DRAFT.spent(chance);
    chance.men.push(pick(board, rnd, { cap, i, share: shares, slack: Math.max(0, slack) }));
  }
  return chance;
}

const mean = (a) => a.reduce((t, x) => t + x, 0) / a.length;
const pct = (a, q) => {
  const s = a.slice().sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
};

const built = await buildWeeklyPool({ season: SEASON, week: WEEK });
const pool = built.pool;
const SHARES = share(pool);

console.log(`${SEASON} week ${WEEK}: ${pool.length} draftable, `
  + `${RUNS} lineups a bot a cap, ${DRAFT.DRAW} men a board, depth ${DRAFT.DEPTH}`);
console.log(`the reserve floor for a whole lineup is `
  + `$${DRAFT.SLOTS.map((_, i) => 0).length && DRAFT.reserveAfter(pool, -1).toFixed(1)}M`);

console.log(`\n  the share of the cap each slot is held to by the budget bot: `
  + DRAFT.SLOTS.map((s, i) => `${s} ${(100 * SHARES[i]).toFixed(0)}%`).join('  '));
console.log('\n  cap    TOP    BUDGET   VALUE  RANDOM   top-random   budget-top   '
  + 'top spends   stranded');
for (const cap of CAPS) {
  const out = {};
  let stranded = 0;
  for (const name of Object.keys(BOTS)) {
    const got = [];
    const spends = [];
    for (let r = 0; r < RUNS; r++) {
      const c = draftOne(pool, cap, BOTS[name], 1000 + r, SHARES);
      if (!c) { stranded++; continue; }
      got.push(DRAFT.projected(c));
      spends.push(DRAFT.spent(c));
    }
    out[name] = { proj: mean(got), spend: mean(spends), best: pct(got, 0.99) };
  }
  console.log(`  ${String(cap).padStart(3)}  `
    + `${out.top.proj.toFixed(1).padStart(5)} `
    + `${out.budget.proj.toFixed(1).padStart(8)} `
    + `${out.value.proj.toFixed(1).padStart(7)} `
    + `${out.random.proj.toFixed(1).padStart(7)} `
    + `${(out.top.proj - out.random.proj).toFixed(1).padStart(12)} `
    + `${(out.budget.proj - out.top.proj).toFixed(1).padStart(12)} `
    + `${(100 * out.top.spend / cap).toFixed(0).padStart(11)}% `
    + `${String(stranded).padStart(10)}`);
}

/* THE BEST OF FIVE IS WHAT A PLAYER ACTUALLY SUBMITS, so the spread of one draft is not the
   spread of an entry. Reported separately because it is the number that says how much of
   the result the wheel is deciding, which is the cost of the per-player board. */
console.log('\nAND WHAT THE FIVE CHANCES ARE WORTH, at the shipped cap:');
for (const name of ['top', 'budget', 'value', 'random']) {
  const ones = [], fives = [];
  for (let r = 0; r < RUNS; r++) {
    const five = [];
    for (let c = 0; c < DRAFT.CHANCES; c++) {
      const got = draftOne(pool, DRAFT.CAP_MUSD, BOTS[name],
        50000 + r * DRAFT.CHANCES + c, SHARES);
      if (got) five.push(DRAFT.projected(got));
    }
    if (!five.length) continue;
    ones.push(five[0]);
    fives.push(Math.max(...five));
  }
  const sd = (a) => Math.sqrt(mean(a.map((x) => (x - mean(a)) ** 2)));
  console.log(`  ${name.padEnd(7)} one draft ${mean(ones).toFixed(1)} `
    + `(sd ${sd(ones).toFixed(2)})   best of ${DRAFT.CHANCES} `
    + `${mean(fives).toFixed(1)} (sd ${sd(fives).toFixed(2)})`);
}
