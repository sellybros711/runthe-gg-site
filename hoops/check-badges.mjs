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
    /* The page's madePlayoffs(): a play-in loss is not the playoffs. */
    po: !!(run.playoffs && run.playoffs.rounds.length
      && (run.playoffs.rounds[0].round !== 'Play-In' || run.playoffs.rounds[0].won)),
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
/* Seeds per shape bot for the system sweep below. 110 puts the rarest system
   (the Death Lineup, which wants a roster with no rebounder, real spacing,
   real hands and real volume from the arc) at single figures out of about a
   thousand, which is rare rather than absent. Drafts only, so it is seconds.
   --quick cuts it the way it cuts the badge sweep. */
const SYSTEM_DRAFTS = argRuns < 900 ? 55 : 110;

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
  if (rowOf(run).po) career.playoffs++;
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

/* ── AND EVERY SYSTEM HAS TO BE REACHABLE TOO ────────────────────────────
 *
 * This file exists because a badge nobody can earn throws no error and breaks
 * no test. A SYSTEM nobody can be named is the same thing wearing a different
 * coat, and there was no guard for it, so two of the fourteen shipped dead:
 *
 *   Twin Towers      fired on 175 of 800 drafts when the roster was six men
 *                    and on 0 of 800 at five, because it asked for two men
 *                    ELIGIBLE AT CENTRE and a starting five has one centre
 *                    slot. Killed by the roster change, reported by nobody.
 *   The Death Lineup asked for no man whose position is centre, which the
 *                    centre slot makes impossible. Dead at six men as well,
 *                    so it had never once been named.
 *
 * Both were found by a player saying you can still go big or small with a
 * starting five, which is true, and which the game had quietly stopped being
 * able to say.
 *
 * IT DRAFTS AND DOES NOT PLAY, which is why it can afford its own bots. A
 * system is a property of the roster, so no season has to be simulated: a
 * thousand drafts here cost a fraction of the sweep above. And it needs its
 * own bots, because the seven strategies above are all about MONEY and a
 * system is about shape: not one of them would ever chase threes, steals or
 * the glass, and four of the fourteen are unreachable to all seven. That is
 * the badge sweep's own lesson, which added two strategies rather than
 * loosening two thresholds.
 *
 * A SYSTEM REPORTED UNREACHED IS THE SAME QUESTION A BADGE REPORTED UNREACHED
 * IS. Either the roster cannot produce it, in which case rewrite what it
 * tests, or no bot here is trying, in which case add the one a player would
 * use. Never move a threshold to suit a bot.
 *
 * FIRST MATCH WINS in detectSystem, so a rung can also be reachable and always
 * shadowed by a looser one above it. That is what the counts are printed for,
 * and it is what sent Twin Towers above Pick and Roll. */
{
  const pa = (v, s) => E.paceAdjust(v || 0, s);
  const SHAPES = {
    'best available': (o) => o.slice().sort((a, b) => b.w - a.w)[0],
    cheapest: (o) => o.slice().sort((a, b) => a.p - b.p)[0],
    'the glass': (o) => o.slice().sort((a, b) => pa(b.reb, b.s) - pa(a.reb, a.s))[0],
    shooters: (o) => o.slice().sort((a, b) => pa(b.tpa, b.s) - pa(a.tpa, a.s))[0],
    'ball hogs': (o) => o.slice().sort((a, b) => pa(b.fga, b.s) - pa(a.fga, a.s))[0],
    passers: (o) => o.slice().sort((a, b) => pa(b.ast, b.s) - pa(a.ast, a.s))[0],
    hands: (o) => o.slice().sort((a, b) => pa(b.stl, b.s) - pa(a.stl, a.s))[0],
    'the post': (o) => o.slice().sort((a, b) => pa(b.pts, b.s) - pa(a.pts, a.s))[0],
    spacing: (o) => o.slice().sort((a, b) => E.spacingIndex(b) - E.spacingIndex(a))[0],
  };
  const shapeNames = Object.keys(SHAPES);
  const seen = new Map();
  let drafted = 0;
  for (let i = 0; i < SYSTEM_DRAFTS * shapeNames.length; i++) {
    const pick = SHAPES[shapeNames[i % shapeNames.length]];
    const run = R.createRun({ seed: 90000 + i });
    let guard = 0, fine = true;
    try {
      while (run.phase === R.PHASES.DRAFT && guard++ < 50) {
        const draw = R.spin(run, data);
        const options = draw.options.map((k) => data.allPlayers[k]).filter(Boolean);
        if (!options.length) { fine = false; break; }
        R.sign(run, pick(options, run));
      }
    } catch (e) { fine = false; }
    if (!fine || run.roster.length !== E.SLOTS.length) continue;
    drafted++;
    const s = E.detectSystem(run.roster);
    if (s) seen.set(s.key, (seen.get(s.key) || 0) + 1);
  }
  ok(drafted > SYSTEM_DRAFTS * shapeNames.length * 0.9,
    `enough drafts completed to judge the systems on (${drafted})`);

  const dead = E.SYSTEMS.map((s) => s.key).filter((k) => !seen.has(k));
  ok(dead.length === 0,
    `every system can be named${dead.length
      ? `\n      never named across ${drafted} drafts ${shapeNames.length} ways: ${dead.join(', ')}\n`
        + '      A system nobody reaches is not a rare system. Either the roster cannot\n'
        + '      produce it, in which case rewrite what it tests, or no bot above is\n'
        + '      trying, in which case add the one a player would use.'
      : ''}`);
  if (process.argv.includes('--systems')) {
    console.log(`\n  ${drafted} drafts, ${shapeNames.length} ways`);
    for (const s of E.SYSTEMS) console.log(`    ${s.key.padEnd(18)} ${String(seen.get(s.key) || 0).padStart(5)}`);
  }
}

/* ── a key a caller compares against has to be a key a system has ──────────
 *
 * `coachReport` tested `archetype.key === 'hero_ball'` to print "Leans hard on
 * <name>", and no system has ever had that key: the one it means is `iso`,
 * which is the second most common label a drafted roster gets. So that
 * weakness had never printed once. Same class as the results screen reading
 * `out.spendLeft` off an outcome that has no such field, and just as silent,
 * because an `undefined` compares false rather than throwing. */
{
  const known = new Set(E.SYSTEMS.map((s) => s.key));
  const src = fs.readFileSync(path.join(HERE, 'engine.js'), 'utf8');
  const compared = [...src.matchAll(/archetype\.key\s*===\s*'([^']+)'/g)].map((m) => m[1]);
  ok(compared.length > 0, `the engine compares a system key somewhere (${compared.length})`);
  const strangers = compared.filter((k) => !known.has(k));
  ok(strangers.length === 0,
    `every system key a caller names is a real one${strangers.length
      ? `\n      no system has the key: ${strangers.join(', ')}` : ''}`);
}

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
