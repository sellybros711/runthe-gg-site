/* WHAT A DRAFTER ACTUALLY SEES, spin by spin, on a real week's board.
 *
 *   node football/build/test/probe_board.mjs
 *   node football/build/test/probe_board.mjs --season 2026 --week 3 --runs 400
 *
 * `probe_cap.mjs` asks whether the cap binds over a whole draft, and on the live board it
 * does: the greedy bot gets through 97% of it and never strands. That is the right answer
 * to the question it asks and it is not the question a player is asking when they say they
 * always have enough for the top men.
 *
 * ─── THE WHEEL ONLY EVER OFFERS AFFORDABLE MEN, BY CONSTRUCTION ─────────────────────
 *
 * `eligible()` filters the position to men this roster can sign AND still fill every
 * remaining slot after, and `spin()` draws from the DEPTH dearest of THOSE. So every man on
 * every board is one the reader can buy, always, at every pick. The reserve floor is what
 * makes that true and it is not optional: a board of men you cannot sign is a screen with
 * no way on, which is the failure that floor exists to prevent.
 *
 * What it costs is that the cap is INVISIBLE. It binds, it decides the lineup, and it never
 * once appears on screen as a refusal. The tension is meant to be that spending early pulls
 * the later boards down, so this measures exactly that: the dearest man offered at each
 * pick, under a drafter who spends and a drafter who saves. If the two sequences are close,
 * the mechanism is real in the totals and imperceptible in the moment, and a mode whose
 * central decision cannot be seen is a mode that reads as having no decision in it.
 *
 * ─── AND WHAT THE BOARD IS MADE OF ──────────────────────────────────────────────────
 *
 * The second half is the price distribution, asked twice: over the whole pool, and over the
 * men the wheel can actually reach. The pool number is the one that looks alarming and the
 * reachable one is the one that matters, because nobody is ever offered the other 250.
 */

import { buildWeeklyPool } from '../weekly-pool.mjs';
import DRAFT from '../../fantasy/draft.js';

const arg = (flag, fallback) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

const SEASON = Number(arg('--season', '2026'));
const WEEK = Number(arg('--week', '3'));
const RUNS = Number(arg('--runs', '400'));

const fix = (v, d = 1) => (Math.round(v * 10 ** d) / 10 ** d).toFixed(d);
const pad = (s, n) => String(s).padStart(n);

/* mulberry32, the same stream `draft.js` builds its chances on. */
const rngOf = (seed) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const main = async () => {
  const built = await buildWeeklyPool({ season: SEASON, week: WEEK, minGames: 1 });
  const pool = built.pool;
  const { SLOTS, CAP_MUSD } = DRAFT;

  console.log(`${SEASON} week ${WEEK}: ${pool.length} draftable, `
    + `${RUNS} drafts a bot, cap $${CAP_MUSD}M\n`);

  /* ─── what is on the board at all ─────────────────────────────────────────────────── */
  const bands = [[3, 3.6], [3.6, 6], [6, 12], [12, 25], [25, 99]];
  const share = (men, lo, hi) =>
    men.filter((p) => p.price_musd >= lo && p.price_musd < hi).length / men.length;

  /* The men the wheel can reach on a fresh roster: the DEPTH dearest at each slot. Nobody
     is ever offered anybody else, so this is the board as a reader meets it. */
  const reachable = [];
  for (const pos of new Set(SLOTS)) {
    const men = pool.filter((p) => p.position === pos)
      .sort((a, b) => b.price_musd - a.price_musd)
      .slice(0, DRAFT.depthFor(pool, pos));
    reachable.push(...men);
  }

  console.log('WHAT THE BOARD IS MADE OF, by price band:');
  console.log(`  ${'band'.padEnd(14)}${pad('whole pool', 12)}${pad('the wheel reaches', 20)}`);
  for (const [lo, hi] of bands) {
    console.log(`  ${(`$${lo} to $${hi === 99 ? '48' : hi}M`).padEnd(14)}`
      + `${pad(`${fix(share(pool, lo, hi) * 100)}%`, 12)}`
      + `${pad(`${fix(share(reachable, lo, hi) * 100)}%`, 20)}`);
  }
  console.log(`  ${'men'.padEnd(14)}${pad(pool.length, 12)}${pad(reachable.length, 20)}`);

  /* ─── what a drafter is offered, pick by pick ─────────────────────────────────────── */
  /*
   * TWO BOTS ON THE SAME SEED, so the only difference between the two sequences below is
   * what the first bot spent. A shared seed is what makes the comparison a measurement of
   * the cap rather than of two different wheels.
   */
  const BOTS = {
    spends: (board) => board[0],
    saves: (board) => board[board.length - 1],
  };
  const out = {};
  for (const name of Object.keys(BOTS)) {
    out[name] = { top: SLOTS.map(() => 0), all: SLOTS.map(() => 0), n: 0, proj: 0, spent: 0 };
  }

  for (let run = 0; run < RUNS; run++) {
    for (const [name, pick] of Object.entries(BOTS)) {
      const chance = { seed: (run * 2654435761) >>> 0, men: [] };
      let ok = true;
      for (let i = 0; i < SLOTS.length; i++) {
        const board = DRAFT.boardFor(pool, chance, i);
        if (!board.length) { ok = false; break; }
        out[name].top[i] += board[0].price_musd;
        out[name].all[i] += board.reduce((t, p) => t + p.price_musd, 0) / board.length;
        chance.men.push(pick(board));
      }
      if (!ok) continue;
      out[name].n++;
      out[name].proj += DRAFT.projected(chance);
      out[name].spent += DRAFT.spent(chance);
    }
  }

  console.log('\nTHE DEAREST MAN OFFERED AT EACH PICK, on the same seeds.');
  console.log('  A cap that is felt pulls the second sequence above the first.');
  console.log(`  ${'bot'.padEnd(10)}${SLOTS.map((s, i) => pad(`${s}${i + 1}`, 8)).join('')}`
    + `${pad('projected', 12)}${pad('spent', 9)}`);
  for (const name of Object.keys(BOTS)) {
    const o = out[name];
    console.log(`  ${name.padEnd(10)}`
      + `${o.top.map((v) => pad(`$${fix(v / o.n)}`, 8)).join('')}`
      + `${pad(fix(o.proj / o.n), 12)}`
      + `${pad(`${fix(o.spent / o.n / CAP_MUSD * 100)}%`, 9)}`);
  }
  {
    const a = out.spends, b = out.saves;
    console.log(`  ${'the gap'.padEnd(10)}`
      + a.top.map((v, i) => pad(`$${fix(b.top[i] / b.n - v / a.n)}`, 8)).join(''));
  }

  console.log('\nTHE SPREAD WITHIN ONE BOARD: dearest minus cheapest of the five offered.');
  console.log(`  ${'bot'.padEnd(10)}${SLOTS.map((s, i) => pad(`${s}${i + 1}`, 8)).join('')}`);
  for (const name of Object.keys(BOTS)) {
    const o = out[name];
    console.log(`  ${name.padEnd(10)}`
      + o.top.map((v, i) => pad(`$${fix(v / o.n - (2 * o.all[i] / o.n - v / o.n))}`, 8)).join(''));
  }

  /* ─── and what would make it bite ─────────────────────────────────────────────────── */
  /*
   * REACH IS WHAT DECIDES WHETHER THE CAP IS EVER SEEN, and it is a second dial beside the
   * cap itself. A spin draws DRAW of the DEPTH dearest affordable men, so the dearest man
   * OFFERED is about the DEPTH/(DRAW+1)th best at that position: at a depth of forty, the
   * seventh, which on this board is $24M against a $48M ceiling. A cap of ninety is never
   * going to be felt against a seventh best quarterback, and no cap sweep can find that,
   * because the cap sweep asks about the whole draft and this is about one press.
   *
   * `out of reach` is the share of picks where the board held a man this roster could not
   * sign. It is ZERO today, by construction, and it is the one number here that is about
   * what the screen says rather than about what the totals come to.
   */
  const REACHES = [12, 20, 40];
  const CAPS = [60, 70, 80, 90];
  console.log('\nWHAT WOULD MAKE THE CAP VISIBLE. `dearest at QB1` is the best man the wheel'
    + '\noffers on the first press, and `out of reach` counts boards holding a man the'
    + '\nroster cannot sign. Greedy, same seeds.');
  console.log(`  ${'depth'.padEnd(7)}${pad('cap', 6)}${pad('dearest at QB1', 17)}`
    + `${pad('out of reach', 14)}${pad('greedy spends', 15)}${pad('stranded', 10)}`);
  for (const depth of REACHES) {
    for (const cap of CAPS) {
      let first = 0, reach = 0, picks = 0, spend = 0, runs = 0, strand = 0;
      for (let run = 0; run < RUNS; run++) {
        const chance = { seed: (run * 2654435761) >>> 0, men: [] };
        let ok = true;
        for (let i = 0; i < SLOTS.length; i++) {
          /* The spin is rebuilt here rather than called, because DEPTH and the cap are
             module constants in draft.js and this is asking what a DIFFERENT pair would
             do. Same arithmetic, same order, same rng stream. */
          const rnd = rngOf((chance.seed + i * 0x9E3779B1) >>> 0);
          const spent = chance.men.reduce((t, m) => t + m.price_musd, 0);
          const ceiling = cap - spent - DRAFT.reserveAfter(pool, i);
          const taken = chance.men.map((m) => m.player_id);
          const men = pool.filter((p) => p.position === SLOTS[i]
            && taken.indexOf(p.player_id) < 0)
            .sort((a, b) => b.price_musd - a.price_musd);
          const top = men.slice(0, Math.min(depth, DRAFT.clubsIn(pool)
            * SLOTS.filter((s) => s === SLOTS[i]).length));
          const board = [];
          const bag = top.slice();
          for (let n = 0; n < DRAFT.DRAW && bag.length; n++) {
            board.push(bag.splice(Math.floor(rnd() * bag.length), 1)[0]);
          }
          board.sort((a, b) => b.price_musd - a.price_musd);
          /*
           * THE RESERVE FLOOR STAYS AND MOVES ONTO THE BOARD RATHER THAN OFF IT. Drawn
           * from the best men at the slot with no affordability filter, a board can come
           * up with nothing on it a roster can sign, which is the empty screen the floor
           * exists to prevent: measured this way it strands all four hundred drafts. So
           * one seat is GUARANTEED affordable, filled with the dearest man in range if the
           * draw produced none. The other four are allowed to be out of reach, which is
           * the entire point: a cap nobody is ever refused by is a cap nobody feels.
           */
          let can = board.filter((p) => p.price_musd <= ceiling + 1e-9);
          if (!can.length) {
            const swap = men.find((p) => p.price_musd <= ceiling + 1e-9);
            if (!swap) { ok = false; break; }
            board[board.length - 1] = swap;
            can = [swap];
          }
          picks++;
          if (can.length < board.length) reach++;
          if (i === 0) first += board[0].price_musd;
          chance.men.push(can[0]);
        }
        if (!ok) { strand++; continue; }
        runs++;
        spend += chance.men.reduce((t, m) => t + m.price_musd, 0);
      }
      console.log(`  ${String(depth).padEnd(7)}${pad(`$${cap}`, 6)}`
        + `${pad(`$${fix(first / RUNS)}M`, 17)}`
        + `${pad(`${fix(reach / Math.max(1, picks) * 100)}%`, 14)}`
        + `${pad(runs ? `${fix(spend / runs / cap * 100)}%` : '-', 15)}`
        + `${pad(strand, 10)}`);
    }
  }
};

main().catch((e) => { console.error(e); process.exit(1); });
