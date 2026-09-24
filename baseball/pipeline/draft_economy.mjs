#!/usr/bin/env node
/*
 * WHAT A REBUILT POOL DOES TO THE DRAFT.
 * ======================================
 * `pool_shape.py` asks whether a rebuilt pool is the same KIND of thing: the
 * row counts, the columns, the newest season each one reaches. It cannot see
 * the question `split_stints` actually asks, which is whether the pool still
 * plays the same game.
 *
 * The price curve is CONVEX (1.5 * war^1.6), so half a season's WAR costs much
 * less than half the price. Splitting a traded man's season into one row per
 * club therefore fills the board with cheap production, and cheap production is
 * exactly what the cap is there to make somebody choose between.
 *
 * THE NUMBER THAT MATTERS IS THE GAP. `probe_cap`'s own argument, recorded in
 * CLAUDE.md: a bot that takes the best man every time against one that holds a
 * pro-rata share back for every open slot. At the shipped $170M that gap is
 * about +11 rating points to holding money back, and it closes as the cap
 * loosens. A gap near zero is a draft with no decision in it, because taking the
 * best man every time has become simply right.
 *
 * So this is the step the workflow's own header tells a person to run by hand,
 * run by the workflow instead: the runner is the only machine in the project
 * that has both pools, and a dry run whose artifact nobody can reach proves
 * nothing at all.
 *
 *   node baseball/pipeline/draft_economy.mjs <pool.json> [other.json] [runs]
 */
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GAME = path.join(HERE, '..');
const require = createRequire(import.meta.url);
const E = require(path.join(GAME, 'engine.js'));
E.setCuratedChemistry(require(path.join(GAME, 'data/chemistry.json')));
const R = require(path.join(GAME, 'run.js'));

const args = process.argv.slice(2);
const pools = args.filter((a) => a.endsWith('.json'));
const RUNS = Number(args.find((a) => !a.endsWith('.json')) || 70);

if (!pools.length) {
  console.log('Give it a pool. See the header.');
  process.exit(1);
}

/* The two strategies the cap was solved against, plus the one that exists to
   show that a ratio is not a third strategy: the price curve is convex, so
   points per dollar always takes the cheapest man on the board. */
const BOTS = {
  'best available': (o) => o.sort((a, b) => b.w - a.w)[0],
  'holds money back': (o, run) => {
    const rem = R.remaining(run), left = R.slotsLeft(run);
    const lim = Math.max((rem / Math.max(1, left)) * 2.1, 6);
    const f = o.filter((p) => p.p <= lim);
    return (f.length ? f : o).sort((a, b) => b.w - a.w)[0];
  },
  'value per dollar': (o) => o.sort((a, b) => (b.w / Math.max(1, b.p)) - (a.w / Math.max(1, a.p)))[0],
};

function economy(poolPath) {
  const pool = require(path.resolve(poolPath));
  const rows = pool.players || pool;
  const DATA = R.indexData(pool);

  /* How many player-seasons arrive on more than one row, which is the whole of
     what split_stints changes about the shape. */
  const perSeason = new Map();
  for (const r of rows) {
    const k = r.i + '|' + r.s;
    perSeason.set(k, (perSeason.get(k) || 0) + 1);
  }
  const split = [...perSeason.values()].filter((n) => n > 1).length;
  const tot = rows.filter((r) => r.t === 'TOT').length;

  console.log(`\n${path.basename(poolPath)}`);
  console.log(`  ${rows.length.toLocaleString()} rows, ${perSeason.size.toLocaleString()} distinct player-seasons`
    + `, ${split.toLocaleString()} of them on more than one row, ${tot.toLocaleString()} combined rows`);

  const rating = {};
  for (const name of Object.keys(BOTS)) {
    const rats = [], spend = [], oct = [], title = [];
    let stranded = 0;
    for (let i = 0; i < RUNS; i++) {
      const run = R.createRun({ seed: E.hashSeed('econ-' + name + '-' + i) });
      let ok = true;
      while (R.slotsLeft(run) > 0) {
        try { R.spin(run, DATA); } catch (_) { ok = false; break; }
        const opts = (run.currentDraw.options || []).map((k) => DATA.allPlayers[k]).filter(Boolean);
        const can = opts.filter((p) => R.canFinishAfter(run, p));
        if (!can.length) { ok = false; break; }
        try { R.sign(run, BOTS[name](can, run)); } catch (_) { ok = false; break; }
      }
      if (!ok) { stranded++; continue; }
      if (run.phase !== R.PHASES.SEASON) continue;
      const spent = E.CONSTANTS.CAP_MUSD - R.remaining(run);
      let o = null;
      try { o = R.playSeason(run); } catch (_) {}
      if (!o || o.shownRating == null) continue;
      rats.push(o.shownRating); spend.push(spent);
      oct.push(o.madePlayoffs ? 1 : 0); title.push(o.titleWon ? 1 : 0);
    }
    const m = (a) => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);
    rating[name] = m(rats);
    console.log(`  ${name.padEnd(17)} rating ${m(rats).toFixed(1).padStart(5)}`
      + ` | spends ${(100 * m(spend) / E.CONSTANTS.CAP_MUSD).toFixed(0).padStart(3)}% of the cap`
      + ` | October ${(100 * m(oct)).toFixed(0).padStart(3)}%`
      + ` | titles ${(100 * m(title)).toFixed(1).padStart(4)}%`
      + ` | stranded ${stranded}`);
  }
  const gap = rating['holds money back'] - rating['best available'];
  console.log(`  THE GAP: ${gap >= 0 ? '+' : ''}${gap.toFixed(1)} rating points to holding money back`);
  return gap;
}

const gaps = pools.map(economy);
if (gaps.length > 1) {
  const d = gaps[0] - gaps[1];
  console.log(`\nthe gap moves ${(d >= 0 ? '+' : '') + d.toFixed(1)} points from the second pool to the first.`);
}
console.log('\nCLAUDE.md records the gap at about +11 points at this cap, and that it closes');
console.log('as the cap loosens. A gap near zero is a draft with no decision left in it.');
