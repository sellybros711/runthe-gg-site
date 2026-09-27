/* THE CAP IS THE CROSSOVER, MEASURED ON THE WEEK'S OWN BOARD.
 *
 * The NFL mode picked its cap by sweeping two real drafting strategies over a real board and
 * taking the round number where they cross (see `football/fantasy/draft.js` over CAP_MUSD):
 *
 *   GREEDY  takes the dearest man it can sign, every pick
 *   BUDGET  holds back a share of the cap for each slot still to fill
 *
 * Below the crossover holding money back wins, so a drafter who never looks at the board is
 * punished. Above it the cap stops binding and spending early is simply right. The one band
 * where a drafter has to LOOK is near the crossing, and that is the cap.
 *
 * A college board is a different board every week: twenty games, forty teams, and a price
 * curve whose top depends on who is playing. So rather than carrying the NFL's $110M across a
 * sport it was never measured on, every build sweeps its own board and writes the answer into
 * the week, where the server and the page both read it. The sweep is seeded, so a rebuild of
 * the same board answers the same cap.
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
export const DRAFT = require('../../../football/fantasy/draft.js');

/* What each slot is worth as a share of the whole, off the dearest man at each position. */
export function shares(pool) {
  const top = {};
  for (const pos of new Set(DRAFT.SLOTS)) {
    top[pos] = Math.max(0, ...pool.filter((p) => p.position === pos).map((p) => p.price_musd));
  }
  const total = DRAFT.SLOTS.reduce((t, s) => t + top[s], 0) || 1;
  return DRAFT.SLOTS.map((s) => top[s] / total);
}

const BOTS = {
  greedy: (board) => board[0],
  budget: (board, ctx) => {
    const room = ctx.cap * ctx.share[ctx.i] + ctx.slack;
    const within = board.filter((p) => p.price_musd <= room);
    return within.length ? within[0] : board[board.length - 1];
  },
};

/** One lineup through the real spin, or null if it stranded. */
export function draftOne(pool, cap, bot, seed, share) {
  const chance = { seed, men: [] };
  for (let i = 0; i < DRAFT.SLOTS.length; i++) {
    const left = cap - DRAFT.spent(chance);
    const taken = chance.men.map((m) => m.player_id);
    const board = DRAFT.spin(pool, i, left, taken, DRAFT.rngOf(seed + i * 0x9E3779B1));
    const can = board.filter((m) => DRAFT.canSign(pool, i, left, m));
    if (!can.length) return null;
    const slack = cap * share.slice(0, i).reduce((t, s) => t + s, 0) - DRAFT.spent(chance);
    chance.men.push(BOTS[bot](can, { cap, i, share, slack: Math.max(0, slack) }));
  }
  return chance;
}

/**
 * Sweep the cap and pick the round number where holding money back stops paying.
 * @returns {{cap:number, table:object[]}}
 */
export function sweepCap(pool, { caps = [80, 85, 90, 95, 100, 105, 110, 115, 120, 125, 130],
  runs = 300 } = {}) {
  const share = shares(pool);
  const table = [];
  for (const cap of caps) {
    const row = { cap, stranded: 0 };
    for (const bot of Object.keys(BOTS)) {
      let t = 0, n = 0, spent = 0;
      for (let k = 0; k < runs; k++) {
        const c = draftOne(pool, cap, bot, 0x5EED + k * 7919, share);
        if (!c) { row.stranded++; continue; }
        t += DRAFT.projected(c); spent += DRAFT.spent(c); n++;
      }
      row[bot] = n ? t / n : 0;
      row[bot + '_spend'] = n ? spent / n / cap : 0;
    }
    row.gap = row.budget - row.greedy;
    table.push(row);
  }
  /* The first cap that strands nobody and where holding back is worth half a point or less.
     If no cap in the sweep crosses, the widest one that strands nobody, so the answer is
     always a board a drafter cannot get stuck on. */
  const safe = table.filter((r) => r.stranded === 0);
  const cross = safe.find((r) => r.gap <= 0.5);
  const pick = cross || safe[safe.length - 1] || table[table.length - 1];
  return { cap: pick.cap, table };
}
