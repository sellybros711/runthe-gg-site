/* The coin economy, headless.
 *
 *   node hoops/check-economy.mjs            the ledger, the daily rule, the merge, the faucet
 *   node hoops/check-economy.mjs --quick    without the career sweep
 *
 * The plan is hoops/design/ECONOMY.md. What this holds:
 *   1. a key pays once, whatever replays it
 *   2. the daily rule: three careers full, the fourth a quarter, by CAREER
 *      not by season; Classic runs three; Conquest capped
 *   3. two devices merge exactly: nothing earned is lost, nothing pays twice,
 *      and merging is order free and idempotent
 *   4. a spend refuses below the balance and a keyed purchase charges once
 *   5. compaction keeps the balance and stops a folded key counting twice
 *   6. the prices are Run The Tour's
 *   7. a measured career pays what the plan says (the faucet is the design)
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const X = require('./economy.js');
const QUICK = process.argv.includes('--quick');

let fails = 0, passes = 0;
const ok = (c, msg) => { if (c) passes++; else { fails++; console.log('FAIL ' + msg); } };
const T0 = Date.parse('2026-10-11T16:00:00Z');   /* noon Eastern */
const H = 3600e3;

/* 1. a key pays once */
{
  const w = X.fresh();
  const a = X.award(w, 'dd:2026-10-11', 900, 'dd', { t: T0 });
  const b = X.award(w, 'dd:2026-10-11', 900, 'dd', { t: T0 + H });
  ok(a.paid && a.amount === 900, '1 the first award pays in full');
  ok(!b.paid, '1 the same key pays nothing the second time');
  ok(X.balance(w) === 900, '1 the balance is the one award (' + X.balance(w) + ')');
  ok(!X.award(w, 'x', 0, '').paid && !X.award(w, '', 50, '').paid, '1 nothing for nothing');
}

/* 2. the daily rule */
{
  const w = X.fresh();
  /* five careers, two seasons each, then their finishes, interleaved in time */
  let t = T0, got = {};
  for (let c = 0; c < 5; c++) for (let y = 0; y < 2; y++) { const r = X.award(w, 'cs:seed' + c + ':' + (2027 + y), 1000, 'career', { t: t += 60e3 }); got['s' + c + y] = r.amount; }
  for (let c = 0; c < 5; c++) got['f' + c] = X.award(w, 'cf:seed' + c, 1000, 'career', { t: t += 60e3 }).amount;
  ok(got.s00 === 1000 && got.s21 === 1000 && got.f2 === 1000, '2 the first three careers pay full, every season and the finish');
  ok(got.s30 === 250 && got.s41 === 250 && got.f3 === 250 && got.f4 === 250, '2 the fourth and fifth careers pay a quarter');
  /* a career's later seasons stay in its slot: career 0 is still one of the first three */
  ok(X.award(w, 'cs:seed0:2030', 1000, 'career', { t: t += 60e3 }).amount === 1000, '2 a career keeps its slot all day');
  /* the next Eastern day starts over */
  ok(X.award(w, 'cs:seed9:2027', 1000, 'career', { t: T0 + 24 * H }).amount === 1000, '2 a new day pays full again');
  /* runs: three a day */
  const r = X.fresh(), am = [];
  for (let i = 0; i < 5; i++) am.push(X.award(r, 'run:' + i, 400, 'run', { t: T0 + i }).amount);
  ok(am.join() === '400,400,400,100,100', '2 Classic runs pay full three times a day (' + am.join() + ')');
  /* Conquest is capped by coins */
  const q = X.fresh(); let qs = 0;
  for (let i = 0; i < 50; i++) qs += X.award(q, 'cq:a:' + i, 40, 'cq', { t: T0 + i }).amount;
  ok(qs === X.CQ_DAY_CAP, '2 Conquest stops at its day cap (' + qs + ')');
  ok(X.award(X.fresh(), 'k', 1000, 'run', { t: T0, easy: true }).amount === 500, '2 Easy pays half');
  /* the day is Eastern: 11pm Eastern and 1am Eastern are two days */
  ok(X.dayOf(Date.parse('2026-10-12T03:00:00Z')) === '2026-10-11' && X.dayOf(Date.parse('2026-10-12T05:00:00Z')) === '2026-10-12', '2 the day rolls at Eastern midnight');
}

/* 3. two devices merge exactly */
{
  const base = X.fresh();
  X.award(base, 'welcome', X.WELCOME, 'welcome', { t: T0 });
  const A = JSON.parse(JSON.stringify(base)), B = JSON.parse(JSON.stringify(base));
  X.award(A, 'run:a1', 400, 'run', { t: T0 + 1 }); X.award(A, 'dd:2026-10-11', 900, 'dd', { t: T0 + 2 });
  X.award(B, 'run:b1', 300, 'run', { t: T0 + 3 }); X.award(B, 'dd:2026-10-11', 900, 'dd', { t: T0 + 4 });
  const M = X.merge(A, B), N = X.merge(B, A);
  ok(X.balance(M) === X.WELCOME + 400 + 300 + 900, '3 nothing earned on either device is lost, and the shared daily pays once (' + X.balance(M) + ')');
  ok(JSON.stringify(M) === JSON.stringify(N), '3 the merge is order free');
  ok(JSON.stringify(X.merge(M, M)) === JSON.stringify(M) && X.balance(X.merge(M, A)) === X.balance(M), '3 the merge is idempotent');
  /* the max rule golf uses would lose one side: prove the ledger does not */
  ok(X.balance(M) > Math.max(X.balance(A), X.balance(B)), '3 better than taking the larger total');
}

/* 4. spending */
{
  const w = X.fresh();
  X.award(w, 'g', 20000, 'x', { t: T0 });
  ok(!X.spend(w, 'buy:legend', X.PRICE.legendary, 'item').ok, '4 a price over the balance is refused');
  ok(X.spend(w, 'buy:tee', X.PRICE.common, 'item').ok && X.balance(w) === 5000, '4 a price under it is charged');
  ok(X.spend(w, 'buy:tee', X.PRICE.common, 'item').ok && X.balance(w) === 5000, '4 the same purchase is charged once');
  /* two devices spend the same coins offline: the merge goes negative and the shop refuses */
  const A = JSON.parse(JSON.stringify(w)), B = JSON.parse(JSON.stringify(w));
  X.spend(A, 'buy:a', 5000, 'item'); X.spend(B, 'buy:b', 5000, 'item');
  const M = X.merge(A, B);
  ok(X.balance(M) === -5000 && !X.spend(M, 'buy:c', 1, 'item').ok, '4 a merge that overspent refuses the next spend');
  ok(X.balance(M, 6000) === 1000, '4 paid coins (the server number) add to the balance');
}

/* 5. compaction */
{
  const w = X.fresh();
  for (let i = 0; i < 2500; i++) X.award(w, 'k' + i, 10, 'x', { t: T0 - 90 * 24 * H + i });
  X.award(w, 'new', 10, 'x', { t: T0 });
  const before = X.balance(w), other = JSON.parse(JSON.stringify(w));
  X.compact(w, 'phone', T0);
  ok(X.balance(w) === before, '5 compaction keeps the balance (' + X.balance(w) + ' vs ' + before + ')');
  ok(Object.keys(w.e).length < 10, '5 compaction folds the old entries');
  /* a device that never compacted still lists the folded keys: merged, they must not count twice */
  ok(X.balance(X.merge(w, other)) === before, '5 a folded key does not count twice after a merge (' + X.balance(X.merge(w, other)) + ')');
}

/* 6. Run The Tour's prices */
{
  ok(X.PACKS.street.price === 8000 && X.PACKS.league.price === 22000 && X.PACKS.hof.price === 45000 && X.PACKS.season.price === 30000, '6 the packs are golf\'s');
  ok(X.PRICE.common === 15000 && X.PRICE.rare === 45000 && X.PRICE.epic === 110000 && X.PRICE.legendary === 275000, '6 the item prices are golf\'s');
  ok(X.DUPE_REFUND.legendary === 25000 && X.EXCHANGE_COST === 10 && X.LEG_EXCHANGE_COINS === 25000, '6 duplicates and the exchange are golf\'s');
  ok(X.priceOf({ slot: 'idle', rarity: 'common' }) === X.PRICE.rare && X.priceOf({ rarity: 'rare', earn: true }) === 0, '6 an idle prices a step up and an earned item is never sold');
}

/* 7. the faucet, measured against real careers */
if (!QUICK) {
  const C = require('./career.js'), ROWS = require('./data/players.json');
  const rf = new URL('./data/rosters.json', import.meta.url), tf = new URL('./data/ratings.json', import.meta.url);
  const league = C.seedLeague(ROWS, C.withRatings(fs.existsSync(rf) ? JSON.parse(fs.readFileSync(rf, 'utf8')) : null, fs.existsSync(tf) ? JSON.parse(fs.readFileSync(tf, 'utf8')) : null));
  const E = require('./engine.js');
  const N = 40, coins = [];
  for (let i = 0; i < N; i++) {
    const L = C.generateRoad({ seed: 'econ' + i, league, start: 'gen', legend: true });
    const r = E.createSeededRNG(E.hashSeed('econ-pol' + i));
    let g = 0;
    while (!L.retired && g++ < 5000) { if (L.pending.length) C.choose(L, Math.floor(r() * L.pending[0].options.length)); else C.step(L); }
    coins.push((L.history || []).reduce((n, h) => n + X.seasonCoins(h), 0) + X.finishCoins(''));
  }
  const mean = coins.reduce((a, b) => a + b, 0) / N;
  console.log('  a career pays ' + Math.round(mean) + ' coins on average before badges (min ' + Math.min(...coins) + ', max ' + Math.max(...coins) + ')');
  ok(mean > 4200 && mean < 6800, '7 a career pays about 5,200 before its badges, the plan\'s figure (' + Math.round(mean) + ')');
  /* a typical day: two careers and the dailies is the $1.99 bucket, about 15,000 */
  const day = 2 * mean + X.dailyDraftCoins({ madePlayoffs: true, seriesWon: 1 }) + X.fixCoins(0.35) + X.passesCoins(true, false) + 3 * X.RATE.quest + X.RATE.questAll + 300;
  ok(day > 12500 && day < 17500, '7 a typical day earns about 15,000 (' + Math.round(day) + ')');
}

console.log((fails ? 'FAILED ' : 'ok ') + passes + ' passed, ' + fails + ' failed');
process.exit(fails ? 1 : 0);
