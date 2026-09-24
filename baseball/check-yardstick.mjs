#!/usr/bin/env node
/*
 * One roster is graded on ONE scale, whether or not you cut anybody.
 * =================================================================
 * `run._simState.rating` is the yardstick: it feeds `titleEdge` inside
 * generatePlayoffs and it feeds the all-time rank on the results screen.
 * engine.js says in as many words that squadRating and teamRating may not do
 * each other's job, and for a while a third number was doing both.
 *
 * `advanceGame` seeds the state with `squadRating(roster)`. `rebuildSimState`
 * replaced it with `overallRating(teamWinPct(offense, defense))`, which is
 * teamRating's inputs through squadRating's tail. Only `cutPlayer` and
 * `acceptTrade` reach that rebuild, so it was exactly Cap Survivor and the
 * Trade Machine, and cutting is Cap Survivor's whole loop: the market puts you
 * over the cap and the sheet reopens until you are under. Nobody had to go
 * looking for it.
 *
 * WHAT IT COST, driven over 25 Cap Survivor runs cutting the cheapest man: the
 * team got genuinely worse on 25 of 25 (shownRating always fell) and the
 * yardstick still ROSE a mean of 8.8 points, moving the all-time rank a mean of
 * 282 places BETTER. The direction was arbitrary rather than generous, because
 * the two are different scales: over 180 rosters the swap ran a median +15.1 and
 * from -2.9 to +34.1. The Trade Machine takes three trades a run and finished on
 * a mean all-time rank of SEVENTH of 2,594 real team-seasons.
 *
 * NOTHING THREW, and nothing could. Every rating involved is a valid rating and
 * every roster is a legal roster.
 *
 * SO THIS ASKS THE REBUILT STATE AND NEVER THE SOURCE. Reading run.js for the
 * name of a function would pass the day somebody writes the same third number a
 * different way, which is how this arrived in the first place. It cuts a real
 * player on a real run and reads what the run is then graded on.
 *
 *   node baseball/check-yardstick.mjs
 *   node baseball/check-yardstick.mjs 40     a bigger sample
 */
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const require_ = createRequire(import.meta.url);
const E = require_(path.join(DIR, 'engine.js'));
const R = require_(path.join(DIR, 'run.js'));
const DATA = R.indexData(require_(path.join(DIR, 'data/players.json')));

const RUNS = Number(process.argv[2] || 20);
let fails = 0, checks = 0;
const ok = (m) => { checks++; console.log('  ok    ' + m); };
const bad = (m, d) => { checks++; fails++; console.log('  FAIL  ' + m); if (d) console.log('        ' + d); };
const claim = (c, m, d) => (c ? ok(m) : bad(m, d));

function drafted(seed, opts) {
  const run = R.createRun({ seed, ...opts });
  if (run.tradeMachine) return R.dealRoster(run, DATA) ? run : null;
  let g = 0;
  while (run.phase === R.PHASES.DRAFT && g++ < 400) {
    try { R.spin(run, DATA); } catch (_) { break; }
    const board = (run.currentDraw.options || []).map((k) => DATA.allPlayers[k])
      .filter(Boolean).filter((p) => !R.blockFor(run, p));
    if (!board.length) break;
    /* Hold a pro-rata share back for every slot still open, which is the
       strategy that actually builds a team rather than stranding the tail. */
    const open = Math.max(1, R.openSlots(run).length);
    const allow = (R.spendable(run) / open) * 1.3;
    const afford = board.filter((p) => p.p <= allow);
    const pick = (afford.length ? afford : board).reduce((a, b) => (b.w > a.w ? b : a));
    try { R.sign(run, pick); } catch (_) { break; }
  }
  return run.phase === R.PHASES.SEASON ? run : null;
}

console.log('\n1. A cut moves the yardstick the way it moves the team');

/* THE TEAM HAS TO ACTUALLY GET WORSE, or the section proves nothing. A cut that
   left the squad alone would make every claim below vacuously true. */
let n = 0, worse = 0, rose = 0, sumY = 0, sumRank = 0, biggest = 0;
for (let s = 1; s <= RUNS; s++) {
  const run = drafted(s * 104729, { capSurvivor: true });
  if (!run) continue;
  R.advanceGame(run, 0);
  const yBefore = run._simState.rating;
  const shownBefore = run._simState.shownRating;
  const rankBefore = E.nationalRank(yBefore, DATA.ratingTable);

  let idx = -1, low = Infinity;
  run.roster.forEach((p, i) => { if (!p._repl && p.p < low) { low = p.p; idx = i; } });
  if (idx < 0) continue;
  R.cutPlayer(run, idx);

  const yAfter = run._simState.rating;
  const shownAfter = run._simState.shownRating;
  const rankAfter = E.nationalRank(yAfter, DATA.ratingTable);

  n++;
  if (shownAfter < shownBefore) worse++;
  if (yAfter > yBefore + 1e-9) rose++;
  sumY += yAfter - yBefore;
  sumRank += rankBefore - rankAfter;
  biggest = Math.max(biggest, Math.abs(yAfter - yBefore));
}

claim(n > 0, `${n} Cap Survivor runs reached a season and took a cut`, 'none did');

/* NON-VACUITY, and it is not all of them on purpose. Cutting the cheapest man
   usually weakens the squad and occasionally does not: he can already be near
   replacement level, and losing him can leave the chemistry or the roster shape
   slightly better off. Measured at 19 of 20. What the section needs is that the
   cut is doing real damage most of the time, not that it never fails to. */
claim(worse >= n * 0.8, `the cut made the team genuinely worse on ${worse} of ${n}`,
  `only ${worse} of ${n}, so the claims below would be close to vacuous`);

/* THE ONE THAT CATCHES A SWAP OF SCALES. Both numbers measure the same team, so
   a cut that lowers the shown rating may not raise the yardstick. The old third
   number raised it on three runs of five. A magnitude threshold was tried here
   first and was not founded: losing one of the nine bats really can move
   squadRating eight points, so the direction is the claim and the size is not. */
claim(rose === 0, 'and the yardstick never rose for it',
  `it rose on ${rose} of ${n}, mean ${(sumY / n).toFixed(1)} points`);
claim(sumRank <= 0, 'so the all-time rank never improved for losing a player',
  `it improved by a mean of ${Math.round(sumRank / n)} places`);

console.log('\n2. The rebuild writes the same formula advanceGame seeds');

/* Asked of the VALUE and not of the source text: the defect was a third number
   spelled differently, so a name match would have passed straight through it. */
let same = 0, tried = 0;
for (let s = 1; s <= Math.max(6, Math.floor(RUNS / 2)); s++) {
  const run = drafted(s * 7919, { capSurvivor: true });
  if (!run) continue;
  R.advanceGame(run, 0);
  const seeded = run._simState.rating;
  const fresh = E.squadRating(run.roster);
  tried++;
  if (Math.abs(seeded - fresh) < 1e-9) same++;
}
claim(tried > 0 && same === tried,
  `the seeded yardstick IS squadRating on all ${tried}`, `${same} of ${tried}`);

let agree = 0, both = 0;
for (let s = 1; s <= Math.max(6, Math.floor(RUNS / 2)); s++) {
  const run = drafted(s * 7919, { capSurvivor: true });
  if (!run) continue;
  R.advanceGame(run, 0);
  let idx = -1, low = Infinity;
  run.roster.forEach((p, i) => { if (!p._repl && p.p < low) { low = p.p; idx = i; } });
  if (idx < 0) continue;
  R.cutPlayer(run, idx);
  both++;
  if (Math.abs(run._simState.rating - E.squadRating(run.roster)) < 1e-9) agree++;
}
claim(both > 0 && agree === both,
  `and so is the REBUILT one, after a cut, on all ${both}`,
  `${agree} of ${both}: the rebuild is writing a different number again`);

console.log('\n3. The Trade Machine is not ranked among the best ever for trading');

/* It accepts three offers a run, so it rebuilds three times. On the old number
   it finished on a mean all-time rank of 7th of 2,594 real team-seasons. */
let ranks = [], top50 = 0;
for (let s = 1; s <= Math.max(8, Math.floor(RUNS / 2)); s++) {
  const run = drafted(s * 104729, { tradeMachine: true });
  if (!run) continue;
  let g = 0;
  while (run.phase === R.PHASES.SEASON && g < E.CONSTANTS.REGULAR_SEASON_GAMES) {
    const w = R.tradeAt(run, g);
    if (w) {
      const offs = R.tradeOffers(run, DATA, g);
      if (offs && offs.length) { try { R.acceptTrade(run, DATA, offs[0]); } catch (_) {} }
      else R.declineTrades(run, g, w);
    }
    try { R.advanceGame(run, g); } catch (_) { break; }
    g++;
  }
  const out = R.finalizeSeason(run);
  if (!out || out.allTimeRank == null) continue;
  ranks.push(out.allTimeRank);
  if (out.allTimeRank <= 50) top50++;
}
const mean = ranks.length ? ranks.reduce((a, b) => a + b, 0) / ranks.length : 0;
claim(ranks.length > 0, `${ranks.length} Trade Machine runs finished a season`, 'none did');
claim(mean > 50, `the mean all-time rank is ${Math.round(mean)}, not the top fifty`,
  `mean ${Math.round(mean)}: every run is being called one of the best team-seasons ever`);
claim(top50 <= ranks.length / 2, 'and most runs are not in the top fifty of all time',
  `${top50} of ${ranks.length} were`);

console.log(`\n${fails ? fails + ' of ' + checks + ' checks FAILED' : 'All ' + checks + ' checks passed.'}`);
process.exit(fails ? 1 : 0);
