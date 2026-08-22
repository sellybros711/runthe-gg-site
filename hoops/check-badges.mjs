/* The badge catalog, against simulated careers.
 *
 *   node hoops/check-badges.mjs
 *   node hoops/check-badges.mjs --runs 600
 *
 * WHY THIS EXISTS. The first cut of badges.js asked for three things that
 * cannot happen in this game: six decorated players on one roster (the most
 * ever seen is four), a chemistry bonus of +2 (the most is 1.67), and missing
 * the playoffs with a rating of 80 (the best rating that has ever missed is
 * 64). None of that failed anything. The cabinet rendered, the squares stayed
 * dim, and the only symptom was three achievements nobody would ever earn,
 * which is not difficulty, it is content that does not exist.
 *
 * So the shape-of-one-run badges are asserted REACHABLE against real
 * simulated seasons, played SIX different ways so the check is not measuring
 * one strategy's blind spot. Two of those six exist only because the first four
 * had exactly that blind spot: nothing was chasing chemistry and nothing was
 * building under the cap, so two perfectly good badges looked unreachable. The volume badges (finish fifty runs, win five
 * titles, collect thirty clubs) are deliberately not asserted that way: they
 * are reachable by definition and a simulation long enough to prove it would
 * take longer than the suite deserves. What IS asserted about them is that
 * their counter moves, which is the way they would actually break.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const E = require(path.join(HERE, 'engine.js'));
const R = require(path.join(HERE, 'run.js'));
const B = require(path.join(HERE, 'badges.js'));

const read = (f) => JSON.parse(fs.readFileSync(path.join(HERE, 'data', f), 'utf8'));
const players = read('players.json');
E.setTeams(read('teams.json'));
E.setCuratedChemistry(read('chemistry.json'));
const data = R.indexData(players);

/* 900 AND NOT 400, and the number was found rather than picked. The rarest
   one-run badge is Moneyball, which a strategy deliberately building under
   $80M reaches about once in ninety attempts; a strategy that is not trying
   never reaches it at all. At 400 runs each strategy gets 67 tries and the
   check failed. At 900 it passes.
   THIS IS NOT A FLAKY TEST. The seeds are fixed and every run is deterministic,
   so the set either contains a Moneyball roster or it does not, the same way
   every time. If the data or the engine changes enough to move that, this
   failing is the correct outcome and the number to look at is the threshold in
   badges.js, not this one. */
const argRuns = (() => {
  const i = process.argv.indexOf('--runs');
  return i !== -1 ? Number(process.argv[i + 1]) || 900 : 900;
})();

let pass = 0;
const failures = [];
const ok = (cond, what) => { if (cond) pass++; else failures.push(what); };

/* ── playing a run, four ways ─────────────────────────────────────────────
 * One strategy is one shape of roster. Best-available never leaves money on
 * the table, cheapest never spends it, and neither of them would ever have
 * found out whether a badge about a $70M roster is reachable. */
const STRATEGIES = {
  'best available': (o) => o.slice().sort((a, b) => b.w - a.w)[0],
  cheapest: (o) => o.slice().sort((a, b) => a.p - b.p)[0],
  'best value': (o) => o.slice().sort((a, b) => (b.w / Math.max(2, b.p)) - (a.w / Math.max(2, a.p)))[0],
  'most decorated': (o) => o.slice().sort((a, b) =>
    ((b.aw || []).length - (a.aw || []).length) || (b.w - a.w))[0],

  /* THESE TWO EXIST BECAUSE THE FIRST FOUR HAD A BLIND SPOT, and it looked
     exactly like a broken badge. Neither "field a roster worth +1.5 chemistry"
     nor "win 50 games under $80M" was reachable across 400 runs, and the honest
     reading was not that the thresholds were too hard: it was that no strategy
     here was TRYING to do either thing, and a person would. A bot that always
     signs the best man on the board will never deliberately reunite two
     team-mates, and one that never looks at the cap will never build cheap.
     Adding the strategies a player would use is the fix; loosening a threshold
     to suit a bot would have made the badge easier for everybody to hide a gap
     in this file. */
  'chemistry hunter': (o, run) => o.slice().sort((a, b) =>
    (R.previewSigning(run, b).delta - R.previewSigning(run, a).delta) || (b.w - a.w))[0],
  'spread the cap': (o, run) => {
    const share = R.remaining(run) / Math.max(1, R.slotsLeft(run));
    const within = o.filter((p) => p.p <= share * 1.15);
    return (within.length ? within : o).slice().sort((a, b) => b.w - a.w)[0];
  },
  /* Deliberately building UNDER the cap rather than to it, which is the only
     way the cheap-roster badges are ever reached and something no other
     strategy here does. Targets $80M of the $134M. */
  'build cheap': (o, run) => {
    const spent = E.CONSTANTS.CAP_MUSD - R.remaining(run);
    const share = Math.max(2, (80 - spent) / Math.max(1, R.slotsLeft(run)));
    const within = o.filter((p) => p.p <= share * 1.25);
    return (within.length ? within : o).slice().sort((a, b) => b.w - a.w)[0];
  },
};

function playRun(seed, pick) {
  const run = R.createRun({ seed });
  let guard = 0;
  while (run.phase === R.PHASES.DRAFT && guard++ < 50) {
    const draw = R.spin(run, data);
    const options = draw.options.map((k) => data.allPlayers[k]).filter(Boolean);
    if (!options.length) return null;
    R.sign(run, pick(options, run));
  }
  if (run.roster.length < E.SLOTS.length) return null;
  R.playSeason(run);
  return run;
}

/* The row index.html writes. Kept here as one function so the check and the
   page cannot disagree about what a row means; if this drifts from the
   recorder, the badges are being tested against a shape the game never
   produces. check-badges asserts the field names against the page below. */
function rowOf(run) {
  const out = run.outcome;
  const last = (run.playoffs && run.playoffs.rounds.length)
    ? run.playoffs.rounds[run.playoffs.rounds.length - 1] : null;
  const awards = {};
  let decorated = 0, top = 0, pairs = 0;
  for (let a = 0; a < run.roster.length; a++) {
    const p = run.roster[a];
    if (p.p > top) top = p.p;
    const aw = p.aw || [];
    if (aw.length) decorated++;
    for (const k of aw) awards[k] = 1;
    for (let b = a + 1; b < run.roster.length; b++) {
      if (run.roster[b].t === p.t && run.roster[b].s === p.s) pairs++;
    }
  }
  return {
    w: out.wins, l: out.losses, ring: !!out.titleWon,
    po: !!(run.playoffs && run.playoffs.rounds.length),
    rating: Math.round(out.rating),
    chem: out.chemistry && typeof out.chemistry.bonus === 'number'
      ? Math.round(out.chemistry.bonus * 100) / 100 : 0,
    spend: Math.round((E.CONSTANTS.CAP_MUSD - R.remaining(run)) * 10) / 10,
    left: Math.round(R.remaining(run) * 10) / 10,
    top: Math.round(top * 10) / 10,
    pairs,
    aw: Object.keys(awards),
    decorated,
    swept: !!(last && !last.won && last.oppWins === 4 && last.yourWins === 0),
    lostFinals: !!(last && !last.won && last.round === 'NBA Finals'),
  };
}

/* ── one long career, played every way ───────────────────────────────────── */
const career = {
  version: 1, runs: 0, rings: 0, playoffs: 0, bestWins: 0, bestRating: 0,
  totalWins: 0, totalLosses: 0, clubs: {}, shapes: {}, beat72: 0,
  seasons: {}, colleges: {}, rows: [],
};
const names = Object.keys(STRATEGIES);
let played = 0;
for (let i = 0; i < argRuns; i++) {
  const run = playRun(70000 + i, STRATEGIES[names[i % names.length]]);
  if (!run) continue;
  played++;
  const out = run.outcome;
  career.runs++;
  career.totalWins += out.wins;
  career.totalLosses += out.losses;
  if (out.titleWon) career.rings++;
  if (out.beatRecord) career.beat72++;
  if (run.playoffs && run.playoffs.rounds.length) career.playoffs++;
  if (out.wins > career.bestWins) career.bestWins = out.wins;
  if (out.rating > career.bestRating) career.bestRating = out.rating;
  const shape = out.structure && out.structure.archetype ? out.structure.archetype.name : null;
  if (shape) career.shapes[shape] = (career.shapes[shape] || 0) + 1;
  for (const p of run.roster) {
    career.clubs[E.teamName(p.t)] = (career.clubs[E.teamName(p.t)] || 0) + 1;
    career.seasons[p.s] = (career.seasons[p.s] || 0) + 1;
    if (p.col) career.colleges[p.col] = (career.colleges[p.col] || 0) + 1;
  }
  career.rows.push(rowOf(run));
}
ok(played > argRuns * 0.9, `enough runs completed to judge on (${played} of ${argRuns})`);

const got = new Set(B.earned(career).map((b) => b.id));
const all = B.evaluate(career);

/* ── every badge about ONE RUN has to be reachable ───────────────────────── */
const SHAPE_BADGES = ['playoffs', 'spend-it', 'chemistry', 'reunion', 'mvp',
  'all-decorated', 'no-hardware', 'swept', 'flop', 'lost-finals', 'sixty',
  'thrift', 'cheap-ring', 'ring'];
const unreachable = SHAPE_BADGES.filter((id) => !got.has(id));
ok(unreachable.length === 0,
  `every one-run badge is reachable${unreachable.length
    ? `\n      never earned across ${played} runs: ${unreachable.join(', ')}\n`
      + '      A badge nobody can earn is not a hard badge. Loosen the threshold in\n'
      + '      badges.js until this passes, and put the measured number in the comment.'
    : ''}`);

/* ── the volume badges are checked by their counter, not by earning them ─── */
const COUNTERS = [
  ['runs', career.runs], ['rings', career.rings],
  ['clubs collected', Object.keys(career.clubs).length],
  ['seasons collected', Object.keys(career.seasons).length],
  ['colleges collected', Object.keys(career.colleges).length],
  ['shapes collected', Object.keys(career.shapes).length],
  ['games played', career.totalWins + career.totalLosses],
];
for (const [what, n] of COUNTERS) ok(n > 0, `the career counts ${what} (${n})`);

/* ── the catalog itself has to be well formed ────────────────────────────── */
const ids = all.map((b) => b.id);
ok(new Set(ids).size === ids.length, 'every badge id is unique');
ok(all.every((b) => b.name && b.why), 'every badge has a name and a reason');
ok(all.every((b) => ['bronze', 'silver', 'gold', 'ring'].includes(b.tier)),
  'every badge has a known tier');
ok(all.every((b) => !b.collection || b.need > 1), 'every collection has something to collect');
ok(B.evaluate({}).every((b) => !b.got),
  'a career with nothing in it has earned nothing');
ok(B.evaluate(null).length === all.length, 'a missing career does not throw');

/* ── the page writes the fields this file reads ──────────────────────────── */
{
  const src = fs.readFileSync(path.join(HERE, 'index.html'), 'utf8');
  const sample = rowOf({ roster: [], outcome: { wins: 0, losses: 0, rating: 0, chemistry: { bonus: 0 } },
    playoffs: null });
  const missing = Object.keys(sample).filter((k) => !new RegExp(`\\b${k}:`).test(src));
  ok(missing.length === 0,
    `the page records every field the badges read${missing.length ? ` (missing ${missing.join(', ')})` : ''}`);
}

/* ── the report ──────────────────────────────────────────────────────────── */
console.log(`\nBADGES over ${played} runs, played four ways.\n`);
const rank = { ring: 0, gold: 1, silver: 2, bronze: 3 };
for (const b of all.slice().sort((a, c) => (rank[a.tier] - rank[c.tier]) || a.name.localeCompare(c.name))) {
  const mark = b.got ? 'x' : ' ';
  const prog = b.need > 1 ? `${b.have}/${b.need}` : '';
  console.log(`  [${mark}] ${b.tier.padEnd(7)}${b.name.padEnd(28)}${prog}`);
}
console.log(`\n  ${got.size} of ${all.length} earned by a machine that was not trying.`);
console.log('  The ones left are the collections and the feats, which is the point:');
console.log('  a cabinet finished on day one is a cabinet with nothing in it.\n');

if (failures.length) {
  console.error(`${pass} assertions passed, ${failures.length} FAILED\n`);
  for (const f of failures) console.error(`  FAIL: ${f}`);
  process.exit(1);
}
console.log(`${pass} assertions passed`);
