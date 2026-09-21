/* HOW FRESH IS YEAR 50, MEASURED RATHER THAN ARGUED.
 *
 *   node cfb/build/test/commish/probe_longrun.mjs
 *   node cfb/build/test/commish/probe_longrun.mjs --years 80 --runs 40
 *
 * A probe, not a test: it asserts nothing and fails nothing. It plays long terms the way
 * test_docket's fixture bot does (middle-ish option, no strategy) and reports what a
 * commissioner actually MEETS as the years pile up.
 *
 * The question it answers is the one nobody can answer by reading docket.js: a hundred items
 * is a big file to write and a small number to live inside for fifty years. Nine beats a year
 * is 450 rulings in fifty seasons, against a catalog of 100 that repeats on a recency penalty
 * which fully lapses after two seasons. So the ceiling on distinct content is known; what is
 * NOT known without playing it is how fast a run reaches that ceiling, how much of the catalog
 * a run never sees at all because its ledger never satisfied a when(), and whether the sport
 * itself keeps drifting or settles.
 *
 * Read the three blocks at the bottom in this order:
 *   REACH      how many of the hundred a run has met by year 5, 10, 25, 50
 *   REPEAT     how many times the average run has re-argued the same item by then
 *   DRIFT      how far the ledger has travelled from where it started, per era
 */
import { createRequire } from 'module';
import path from 'path';
import { leagueTeams } from './league.mjs';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(import.meta.dirname, '../../../..');
const L = require(ROOT + '/cfb/commish/ledger.js');
const B = require(ROOT + '/cfb/commish/blocs.js');
const D = require(ROOT + '/cfb/commish/docket.js');
const F = require(ROOT + '/cfb/commish/frontier.js');
const SIT = require(ROOT + '/cfb/commish/situation.js');
const E = require(ROOT + '/cfb/engine.js');
const teams = leagueTeams(ROOT);

/* WHICH COMMISSIONER THE BOT IS PLAYING, because the answer to "is the last rung reachable"
   depends entirely on who is asking. `--bold` takes the sport-changing option whenever one is
   on the desk, which is the ceiling: if THIS commissioner cannot reach the colony in fifty
   years, nobody can, and the chain is too long. The default is random, which is the floor and
   is the more useful number for the ordinary question of whether year 50 is fresh. */
const BOLD = process.argv.indexOf('--bold') >= 0;

const arg = (k, d) => {
  const i = process.argv.indexOf('--' + k);
  return i >= 0 ? Number(process.argv[i + 1]) : d;
};
const YEARS = arg('years', 50);
const RUNS = arg('runs', 30);
const MARKS = [5, 10, 25, YEARS].filter((y, i, a) => a.indexOf(y) === i && y <= YEARS);

/* THE SPORT AS IT STANDS, flattened to the paths a ruling can write, so two worlds can be
   compared without caring what shape the ledger is. Only scalars: a membership map moves for
   reasons that are not rulings. */
function flat(w, pre, out) {
  out = out || {}; pre = pre || '';
  for (const k in w) {
    if (k === 'membership' || k === 'history' || k === 'start' || k === 'seen') continue;
    const v = w[k];
    if (v && typeof v === 'object' && !Array.isArray(v)) flat(v, pre + k + '.', out);
    else if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'string') out[pre + k] = v;
  }
  return out;
}
function drift(a, b) {
  let moved = 0, total = 0;
  for (const k in a) { total++; if (String(a[k]) !== String(b[k])) moved++; }
  return { moved, total };
}

/* ONE LONG RUN. Removal is IGNORED here on purpose: the question is what the CONTENT does
   over fifty years, and a bot that gets itself sacked in year six answers a different one.
   A real free or pro player can be removed, and that is the mode working. */
function longRun(seed) {
  const rng = E.createSeededRNG(E.hashSeed('probe|' + seed));
  let w = L.createWorld({ year: 2025, membership: L.membershipFrom(teams, 2025), seed });
  w.termSeasons = YEARS + 1;
  const first = flat(w);
  const seen = new Map();          // item id -> times ruled
  const byYear = [];               // per year: distinct so far, repeats so far
  let empty = 0, threw = 0;
  for (let y = 0; y < YEARS; y++) {
    for (let bt = 0; bt < L.BEATS.length; bt++) {
      /* SIT.build, WHICH IS WHAT THE PAGE CALLS. The first cut of this probe guessed at
         SIT.read, got undefined, and handed every item a null situation. Thirty of the
         hundred are gated on sit.ripe alone, so they came back UNREACHED and the probe was
         about to report a third of the docket as dead content. A probe that builds the
         world differently from the page measures a game nobody plays. */
      let item = null;
      try {
        item = D.pick(w, L, rng, SIT.build(w, L, {}));
      } catch (e) { item = null; threw++; }
      if (!item) { empty++; w = L.advance(w); continue; }
      seen.set(item.id, (seen.get(item.id) || 0) + 1);
      /* THE BOLD COMMISSIONER TAKES THE DOOR EVERY TIME ONE IS OFFERED. `opens` is on exactly
         one option of each rung, so this is not a strategy the bot had to be taught: it is
         "say yes to the thing that changes what the sport is". */
      const opener = BOLD && item.options.find((o) => o.edit && o.edit.opens);
      const option = opener || item.options[Math.floor(rng() * item.options.length)];
      const dials = {};
      for (const d of item.dials || []) {
        const opts = D.settings(d, true);
        dials[d.id] = opts[Math.floor(rng() * opts.length)];
      }
      try {
        const edit = D.resolve(item, option.id, dials);
        w = L.applyOutcome(L.applyEdit(w, edit), edit, B.deltas(w, edit));
      } catch (e) { threw++; }
      w = L.advance(w);
    }
    const ruled = [...seen.values()].reduce((t, n) => t + n, 0);
    byYear.push({
      distinct: seen.size, ruled, drift: drift(first, flat(w)).moved,
      era: F.eraOf(w), crossed: F.crossed(w).length, room: B.roomOf(w).length,
      /* PATHS IS COUNTED FRESH EACH YEAR, not against the opening total, because that is the
         whole point of a frontier: the denominator grows. A sport that crossed six of them
         has more ledger than it started with, and measuring the new fields against the old
         total is how you would miss that they exist. */
      paths: Object.keys(flat(w)).length,
    });
  }
  return {
    byYear, seen, empty, threw, paths: drift(first, flat(w)).total,
    frontier: Object.keys(w.frontier || {}),
  };
}

const runs = [];
for (let i = 0; i < RUNS; i++) runs.push(longRun(100 + i));

const mean = (a) => a.reduce((t, n) => t + n, 0) / a.length;
const pad = (s, n) => String(s).padEnd(n);
const num = (n, d) => (Math.round(n * (d ? 10 : 1)) / (d ? 10 : 1)).toFixed(d || 0);

console.log('\n' + RUNS + ' runs of ' + YEARS + ' seasons, ' + D.ITEMS.length + ' items in the docket');
console.log('(' + (YEARS * L.BEATS.length) + ' rulings a run, against a catalog of ' + D.ITEMS.length + ')');

console.log('\nREACH   how much of the docket a run has met');
console.log('  ' + pad('by year', 10) + pad('distinct', 11) + pad('of catalog', 13) + 'never met');
for (const y of MARKS) {
  const d = mean(runs.map((r) => r.byYear[y - 1].distinct));
  console.log('  ' + pad(y, 10) + pad(num(d, 1), 11)
    + pad(num((d / D.ITEMS.length) * 100, 1) + '%', 13) + num(D.ITEMS.length - d, 1));
}

console.log('\nREPEAT  how often the same argument comes back');
console.log('  ' + pad('by year', 10) + pad('rulings', 10) + pad('per item', 11) + 'new this era');
let prev = 0;
for (const y of MARKS) {
  const ruled = mean(runs.map((r) => r.byYear[y - 1].ruled));
  const dist = mean(runs.map((r) => r.byYear[y - 1].distinct));
  console.log('  ' + pad(y, 10) + pad(num(ruled, 0), 10) + pad(num(ruled / dist, 1) + 'x', 11)
    + num(dist - prev, 1));
  prev = dist;
}

console.log('\nDRIFT   how far the sport has moved, and how much sport there is to move');
console.log('  ' + pad('by year', 10) + pad('paths moved', 14) + pad('of', 7) + 'ledger size');
for (const y of MARKS) {
  const d = mean(runs.map((r) => r.byYear[y - 1].drift));
  const p = mean(runs.map((r) => r.byYear[y - 1].paths));
  console.log('  ' + pad(y, 10) + pad(num(d, 1), 14) + pad(runs[0].paths, 7) + num(p, 1));
}

/* THE QUESTION THIS FILE WAS EXTENDED TO ANSWER. A frontier is only worth the code if a term
   can actually reach one, and the last rung is only worth writing if a fifty year term can
   reach IT. Both halves are failures and they are different failures: nobody crossing
   anything means the gates are too tight, and everybody reaching the colony by year 12 means
   the chain is not a chain. */
console.log('\nFRONTIER   ' + (BOLD ? 'a commissioner who says yes to every door' : 'an ordinary run'));
console.log('  ' + pad('by year', 10) + pad('era', 7) + pad('crossed', 10) + 'room');
for (const y of MARKS) {
  console.log('  ' + pad(y, 10)
    + pad(num(mean(runs.map((r) => r.byYear[y - 1].era)), 1), 7)
    + pad(num(mean(runs.map((r) => r.byYear[y - 1].crossed)), 1), 10)
    + num(mean(runs.map((r) => r.byYear[y - 1].room)), 1));
}
const reached = {};
runs.forEach((r) => r.frontier.forEach((id) => { reached[id] = (reached[id] || 0) + 1; }));
console.log('\n  ' + pad('frontier', 14) + pad('era', 6) + 'runs that crossed it, of ' + RUNS);
F.FRONTIERS.forEach((f) => {
  const n = reached[f.id] || 0;
  console.log('  ' + (n ? '  ' : ' !') + pad(f.id, 12) + pad(f.era, 6)
    + num(n, 0) + '  ' + num((n / RUNS) * 100, 0) + '%');
});

/* WHICH ITEMS NOBODY EVER MEETS is the other half of reach, and it is the actionable half:
   an item no run reaches is content that was written and is not being read. */
const everSeen = new Set();
runs.forEach((r) => r.seen.forEach((_, id) => everSeen.add(id)));
const never = D.ITEMS.map((i) => i.id).filter((id) => !everSeen.has(id));
console.log('\nUNREACHED  items no run met in ' + (RUNS * YEARS) + ' seasons: ' + never.length);
if (never.length) console.log('  ' + never.join('\n  '));

const emptyBeats = mean(runs.map((r) => r.empty));
console.log('\nEMPTY BEATS  ' + num(emptyBeats, 1) + ' of ' + (YEARS * L.BEATS.length)
  + ' had nothing eligible');
const threwAt = runs.reduce((t, r) => t + r.threw, 0);
if (threwAt) console.log('THREW  ' + threwAt + ' times across all runs');
