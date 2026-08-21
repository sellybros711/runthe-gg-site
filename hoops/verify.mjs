/* Run The Floor: the regression suite and the calibration report.
 *
 *   node hoops/verify.mjs            assert, then print the calibration
 *   node hoops/verify.mjs --drafts 800
 *
 * TWO JOBS, AND THEY ARE DIFFERENT JOBS. The assertions are pass or fail and
 * they guard the rules: a draft may never exceed the cap, a slot may never hold
 * a player who cannot play it, a run must replay identically off its seed. The
 * calibration is a printed distribution and it guards the BALANCE, which no
 * assertion can, because "is 73 wins hard enough" is a question about a curve
 * rather than about a line of code.
 *
 * A game engine with no headless harness gets balanced by feel, one run at a
 * time, in a browser. That is how a game ends up with a difficulty nobody chose.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const E = require(path.join(HERE, 'engine.js'));
const R = require(path.join(HERE, 'run.js'));

const players = JSON.parse(fs.readFileSync(path.join(HERE, 'data', 'players.json'), 'utf8'));
const chemistry = JSON.parse(fs.readFileSync(path.join(HERE, 'data', 'chemistry.json'), 'utf8'));
E.setCuratedChemistry(chemistry);
const data = R.indexData(players);

let pass = 0;
const failures = [];
function ok(cond, what) {
  if (cond) { pass++; return; }
  failures.push(what);
}
function is(actual, expect, what) {
  const a = JSON.stringify(actual), e = JSON.stringify(expect);
  ok(a === e, `${what}\n      expected ${e}, got ${a}`);
}

// ─── the data itself ────────────────────────────────────────────────────────

ok(players.length > 0, 'players.json is not empty');
ok(data.teamSeasons.length >= 6, 'enough team-seasons to fill a roster from');

for (const p of players) {
  if (!(p.i && p.n && p.s && p.t)) { failures.push(`row missing an identity field: ${JSON.stringify(p)}`); break; }
  if (!(p.p > 0)) { failures.push(`${p.n} ${p.s} has no price`); break; }
  if (Math.abs((p.ow + p.dw) - p.w) > 0.051) {
    failures.push(`${p.n} ${p.s}: win shares ${p.w} do not equal ${p.ow} offensive plus ${p.dw} defensive`);
    break;
  }
  if (!E.positionsOf(p).some(pos => E.SLOTS.some(s => E.SLOT_ELIGIBILITY[s].includes(pos)))) {
    failures.push(`${p.n} ${p.s} plays "${p.ep}", which fills no slot in the game`);
    break;
  }
}
pass += 4;

/* EVERY SLOT MUST BE FILLABLE FROM THE DATA, or a draft can reach a state that
   cannot legally finish. It is the cheapest possible bug to introduce (add a
   slot, forget the position) and the most expensive to find, because it only
   shows up on the run that happens to draw badly. */
for (const slot of E.SLOTS) {
  const n = players.filter(p => E.canFillSlot(p, slot)).length;
  ok(n > 0, `at least one player can play ${slot} (found ${n})`);
}

// ─── the rules ──────────────────────────────────────────────────────────────

/* Play a full draft by always taking the best player the board will let you
   sign. This is the greedy strategy the cap is supposed to punish, so it is
   also the one most likely to walk into an illegal state. */
function greedyDraft(seed) {
  const run = R.createRun({ seed });
  let guard = 0;
  while (run.phase === R.PHASES.DRAFT && guard++ < 50) {
    const draw = R.spin(run, data);
    const options = draw.options.map(k => data.allPlayers[k]).filter(Boolean);
    if (!options.length) throw new Error('a draw came back with no signable options');
    options.sort((a, b) => b.w - a.w);
    R.sign(run, options[0]);
  }
  return run;
}

const DRAFTS = (() => {
  const i = process.argv.indexOf('--drafts');
  return i !== -1 ? Number(process.argv[i + 1]) || 400 : 400;
})();

const runs = [];
for (let i = 0; i < DRAFTS; i++) runs.push(greedyDraft(1000 + i));

let capBusts = 0, wrongSlot = 0, dupes = 0, overdrawn = 0, positionStacks = 0;
for (const run of runs) {
  const spend = run.roster.reduce((s, p) => s + p.p, 0) + E.respinFees(run.respinsUsed);
  if (spend > E.CONSTANTS.CAP_MUSD + 1e-9) capBusts++;
  if (run.roster.length !== E.SLOTS.length) wrongSlot++;

  run.slotIndex.forEach((slotIdx, k) => {
    if (!E.canFillSlot(run.roster[k], E.SLOTS[slotIdx])) wrongSlot++;
  });
  if (new Set(run.slotIndex).size !== run.slotIndex.length) wrongSlot++;
  if (new Set(run.usedPlayers).size !== run.usedPlayers.length) dupes++;

  const drawn = {};
  for (const id of run.usedTeamSeasons) drawn[id] = (drawn[id] || 0) + 1;
  if (Object.values(drawn).some(n => n > R.TUNING.MAX_DRAWS_PER_TEAM_SEASON)) overdrawn++;

  const byPos = {};
  for (const p of run.roster) {
    const primary = p.pp || E.positionsOf(p)[0];
    byPos[primary] = (byPos[primary] || 0) + 1;
  }
  if (Object.values(byPos).some(n => n > E.POSITION_MAX)) positionStacks++;
}

is(capBusts, 0, `no draft exceeds the $${E.CONSTANTS.CAP_MUSD}M cap (${DRAFTS} drafts)`);
is(wrongSlot, 0, 'every roster is complete and every player is in a slot he can play');
is(dupes, 0, 'no player is signed twice in one run');
is(overdrawn, 0, `no team-season gives up more than ${R.TUNING.MAX_DRAWS_PER_TEAM_SEASON} players`);
is(positionStacks, 0, `no roster holds more than ${E.POSITION_MAX} of one position`);

/* A run is replayed from its seed, not stored. Two runs off the same seed have
   to be the same run, or a saved game comes back as a different game. */
const a = greedyDraft(4242);
const b = greedyDraft(4242);
is(a.roster.map(p => `${p.i}|${p.s}`), b.roster.map(p => `${p.i}|${p.s}`),
  'the same seed drafts the same roster');
const seasonA = R.playSeason(a);
const seasonB = R.playSeason(b);
is(seasonA.record, seasonB.record, 'the same seed plays the same season');

/* THE TWO WAYS TO PLAY A SEASON HAVE TO AGREE. playSeason runs all 82 at once
   and advanceGame walks them one at a time for an animated screen, off the same
   seed and the same RNG stream. They are separate code that must produce the
   same season, and right now only the first one is wired to the page, so the
   second is exactly where a divergence would sit unnoticed until the day
   somebody switched the UI over to it. */
const atOnce = greedyDraft(8181);
const oneByOne = greedyDraft(8181);
const bulkOutcome = R.playSeason(atOnce);

const walked = [];
for (let g = 0; ; g++) {
  const res = R.advanceGame(oneByOne, g);
  if (!res) break;
  walked.push(res);
}
const walkedOutcome = R.finalizeSeason(oneByOne);

is(walked.length, E.CONSTANTS.REGULAR_SEASON_GAMES, 'walking a season game by game plays all 82');
is(walkedOutcome.record, bulkOutcome.record,
  'playSeason and advanceGame produce the same record off the same seed');
is(atOnce.season.map(g => `${g.yourPoints}-${g.oppPoints}`),
   oneByOne.season.map(g => `${g.yourPoints}-${g.oppPoints}`),
  'and the same 82 scorelines, game for game');
is(walkedOutcome.titleWon, bulkOutcome.titleWon, 'and the same postseason');
ok(oneByOne._simState === undefined, 'finalizeSeason clears the sim state it built');

/* A TRADED PLAYER HAS TWO ROWS IN ONE SEASON, AND BOTH ARE REAL.
 *
 * This is the assertion the hand-entered seed could never have produced, and
 * the first real data run died on it: keyed on id and season alone, the two
 * rows of a February trade collide, the lookup table keeps whichever was
 * written last, and a board built from one club resolves to the other club's
 * row. The player is then offered at a slot his colliding twin cannot play, and
 * signing him throws "no slot" from a code path that is correct.
 *
 * The seed has no traded players in it, so this is built by hand rather than
 * drawn from the data: the point is to keep the property true no matter what
 * the data happens to contain today.
 */
{
  const base = players[0];
  const mid = { ...base, i: 'tradedguy01', s: 2011, t: 'DEN', pp: 'PG', ep: 'PG;G' };
  const end = { ...base, i: 'tradedguy01', s: 2011, t: 'NYK', pp: 'C', ep: 'C;FC' };

  ok(E.pkey(mid) !== E.pkey(end),
    'the same man on two clubs in one season gets two different keys');

  const idx = E.indexData([...players, mid, end]);
  ok(idx.allPlayers[E.pkey(mid)] && idx.allPlayers[E.pkey(end)],
    'and both rows survive indexing rather than one overwriting the other');
  is(idx.allPlayers[E.pkey(mid)].t, 'DEN', 'the first club resolves to the first club');
  is(idx.allPlayers[E.pkey(end)].t, 'NYK', 'and the second to the second');

  /* And the thing that must NOT change: signing one still takes the other off
     the board, because a run may not hold the same man twice. That is blocked
     on the player id, not on this key. */
  const run = R.createRun({ seed: 1 });
  run.roster.push(mid);
  run.slotIndex.push(0);
  run.usedPlayers.push(mid.i);
  is(R.blockFor(run, end), R.BLOCK.DRAFTED,
    'and signing one club version still blocks the other, by player id');
}

/* THE ROWS A REAL LEAGUE HAS THAT A HAND-WRITTEN SEED NEVER WILL.
 *
 * Every row in the seed is a rotation player from a good team, because somebody
 * chose them. A real dataset is mostly not that: a third of it has NEGATIVE win
 * shares, plenty of defensive centres attempt no three-pointers at all, and some
 * players barely shoot. Each of those is a division or a ratio somewhere in the
 * fit model, and each is a chance to produce NaN, which does not throw. It
 * propagates: one NaN in a spacing index becomes a NaN rating, a NaN win
 * probability, and a season of scorelines that are all "NaN-NaN".
 *
 * So the awkward rows are constructed rather than waited for. */
{
  /* THE SEASON ON EACH OF THESE IS LOAD-BEARING, and getting it wrong made this
     whole block pass for the wrong reason. players.json is sorted by season, so
     players[0..5] are all 1972 rows, and spacingIndex returns early for any
     season before the three-point line existed: the awkward rows never reached
     the division they were written to exercise. Removing the divide-by-zero
     guard from the engine did not fail this test until the seasons were pinned
     to the modern era. */
  const modern = { s: 2020 };
  const awkward = [
    { ...players[0], ...modern, i: 'neg01', w: -2.1, ow: -1.4, dw: -0.7 },   // negative value
    { ...players[1], ...modern, i: 'noshot01', fga: 0, tpa: 0, pts: 0 },     // never shoots
    { ...players[2], ...modern, i: 'nothree01', tpa: 0 },                    // no range at all
    { ...players[3], ...modern, i: 'zero01', ow: 0, dw: 0, w: 0, fga: 0, tpa: 0, ast: 0, reb: 0, blk: 0, stl: 0 },
    { ...players[4], i: 'old01', s: 1974 },                                  // before the line
    { ...players[5], i: 'new01', s: 2025 },                                  // the modern game
  ];
  const six = awkward.map((p, i) => ({ ...p, _slot: E.SLOTS[i] }));

  for (const p of awkward) {
    ok(Number.isFinite(E.spacingIndex(p)), `spacing index is a number for ${p.i}`);
  }

  const fit = E.rosterFit(six);
  const chem = E.resolveChemistry(six);
  const ortg = E.rosterOffense(six, chem.bonus, fit.bonus);
  const drtg = E.rosterDefense(six, chem.bonus);

  ok(Number.isFinite(fit.bonus), 'a roster of awkward rows still produces a real fit number');
  ok(Object.values(fit.parts).every(Number.isFinite), 'and every component of it is a number');
  ok(Number.isFinite(chem.bonus), 'chemistry survives them');
  ok(Number.isFinite(ortg) && Number.isFinite(drtg), 'and both ratings come out finite');

  const season = E.playRun(awkward, E.createSeededRNG(31337), E.SLOTS, data.oppPool);
  ok(Number.isFinite(season.rating), 'a season played by that roster has a real rating');
  ok(season.season.every(g => Number.isFinite(g.yourPoints) && Number.isFinite(g.oppPoints)),
    'and all 82 scorelines are numbers rather than NaN');
}

// ─── the basketball ─────────────────────────────────────────────────────────

/* THE FIT MODEL, CHECKED AGAINST TEAMS PEOPLE ALREADY HAVE OPINIONS ABOUT.
 *
 * This is the part of the game that claims to be about basketball rather than
 * about a value number, and the only honest way to test that claim is to hand
 * it real lineups and see whether it says what a fan would say. Every one of
 * these is the actual starting five plus the actual sixth man, and every
 * expected answer is what that team is known for.
 *
 * These assertions have already earned their place several times over. They
 * caught the 2018 Rockets being labelled Showtime off Harden's assist average,
 * the 1986 Celtics being labelled Moreyball, the 2016 Warriors being labelled
 * Point Centre because Draymond Green is eligible at centre, and the 1996 Bulls
 * being excluded from the triangle because Luc Longley averaged 9.1 rather than
 * 12. A model that gets these wrong is not a basketball model, whatever its
 * calibration report says.
 */
/* BY PLAYER ID, NEVER BY NAME. Basketball-Reference renders names with their
   diacritics, so the real dataset holds "Nikola Jokic" with an accent on the c
   and "Manu Ginobili" with one on the o. A lookup by name silently finds
   nothing, and an assertion that silently finds nothing is an assertion that
   passes for the wrong reason or fails for a reason that has nothing to do with
   basketball. The slug is stable and is the key everything else joins on. */
const lineup = (ids) => {
  const rows = ids.map(([id, s]) => players.find(p => p.i === id && p.s === s));
  if (rows.some(r => !r)) return null;
  return rows.map((p, i) => ({ ...p, _slot: E.SLOTS[i] }));
};

/* PG, SG, SF, PF, C, sixth man, in that order. */
const KNOWN = [
  // PG Steve Kerr, SG Michael Jordan, SF Scottie Pippen, PF Dennis Rodman, C Luc Longley, 6th Toni Kukoc
  ['the 1996 Bulls', 'The Triangle', [['kerrst01', 1996], ['jordami01', 1996],
    ['pippesc01', 1996], ['rodmade01', 1996], ['longllu01', 1996], ['kukocto01', 1996]]],
  // PG Magic Johnson, SG Byron Scott, SF James Worthy, PF A.C. Green, C Kareem Abdul-Jabbar, 6th Michael Cooper
  ['the 1987 Lakers', 'Showtime', [['johnsma02', 1987], ['scottby01', 1987],
    ['worthja01', 1987], ['greenac01', 1987], ['abdulka01', 1987], ['coopemi01', 1987]]],
  // PG Isiah Thomas, SG Joe Dumars, SF Mark Aguirre, PF Dennis Rodman, C Bill Laimbeer, 6th Vinnie Johnson
  ['the 1989 Pistons', 'Grit and Grind', [['thomais01', 1989], ['dumarjo01', 1989],
    ['aguirma01', 1989], ['rodmade01', 1989], ['laimbbi01', 1989], ['johnsvi01', 1989]]],
  // PG Chauncey Billups, SG Richard Hamilton, SF Tayshaun Prince, PF Rasheed Wallace, C Ben Wallace, 6th Corliss Williamson
  ['the 2004 Pistons', 'Grit and Grind', [['billuch01', 2004], ['hamilri01', 2004],
    ['princta01', 2004], ['wallara01', 2004], ['wallabe01', 2004], ['williaco01', 2004]]],
  // PG John Stockton, SG Jeff Hornacek, SF Bryon Russell, PF Karl Malone, C Greg Ostertag, 6th Howard Eisley
  ['the 1998 Jazz', 'Pick and Roll', [['stockjo01', 1998], ['hornaje01', 1998],
    ['russebr01', 1998], ['malonka01', 1998], ['ostergr01', 1998], ['eisleho01', 1998]]],
  // PG Chris Paul, SG James Harden, SF Trevor Ariza, PF P.J. Tucker, C Clint Capela, 6th Eric Gordon
  ['the 2018 Rockets', 'Moreyball', [['paulch01', 2018], ['hardeja01', 2018],
    ['arizatr01', 2018], ['tuckepj01', 2018], ['capelcl01', 2018], ['gordoer01', 2018]]],
  // PG Stephen Curry, SG Klay Thompson, SF Harrison Barnes, PF Draymond Green, C Andrew Bogut, 6th Andre Iguodala
  ['the 2016 Warriors', 'Pace and Space', [['curryst01', 2016], ['thompkl01', 2016],
    ['barneha02', 2016], ['greendr01', 2016], ['bogutan01', 2016], ['iguodan01', 2016]]],
  // PG Jamal Murray, SG Kentavious Caldwell-Pope, SF Michael Porter Jr., PF Aaron Gordon, C Nikola Jokic, 6th Bruce Brown
  ['the 2023 Nuggets', 'Point Centre', [['murraja01', 2023], ['caldwke01', 2023],
    ['portemi01', 2023], ['gordoaa01', 2023], ['jokicni01', 2023], ['brownbr01', 2023]]],
  // PG Derek Fisher, SG Kobe Bryant, SF Rick Fox, PF Horace Grant, C Shaquille O'Neal, 6th Robert Horry
  ['the 2001 Lakers', 'Bully Ball', [['fishede01', 2001], ['bryanko01', 2001],
    ['foxri01', 2001], ['granth01', 2001], ['onealsh01', 2001], ['horryro01', 2001]]],
];

for (const [who, expected, names] of KNOWN) {
  const six = lineup(names);
  if (!six) { failures.push(`${who}: a player in that lineup is not in the data`); continue; }
  const f = E.rosterFit(six);
  is(f.system && f.system.name, expected, `${who} plays ${expected}`);
}

/* EVERY REAL LINEUP GETS AN IDENTITY. A roster that matches nothing is allowed
   and is information, but if actual championship teams match nothing then the
   thresholds are set for rosters that do not exist. */
const unnamed = KNOWN.filter(([, , names]) => {
  const six = lineup(names);
  return six && !E.rosterFit(six).system;
});
is(unnamed.length, 0, 'every real championship lineup is recognised as something');

/* THE BALL ONLY BOUNCES ONCE, and it has to be the largest single thing the fit
   model says. Six players who each carried their own offense cannot carry one
   together, and if that is cheap then the draft has no shape. */
const hogs = lineup([['jordami01', 1996], ['hardeja01', 2018], ['bryanko01', 2001],
  ['malonka01', 1998], ['onealsh01', 2001], ['goodrga01', 1972]]);
if (hogs) {
  const f = E.rosterFit(hogs);
  ok(f.profile.shots > E.FIT.SHOT_BUDGET + 25,
    `six ball-dominant stars want far more shots than exist (${f.profile.shots.toFixed(0)})`);
  ok(f.bonus <= E.FIT.MIN + 1e-9, 'and the fit model charges them its full penalty');
  is(f.system && f.system.name, 'Too Many Mouths', 'and names the problem rather than a system');
}

/* SPACING IS MEASURED AGAINST THE PLAYER'S OWN ERA. The three-point line did not
   exist before 1980, so a 1972 roster attempting zero of them is a fact about
   the league and not a flaw in the roster. Punishing it would be the single
   most obviously wrong thing this model could do. */
const preThree = lineup([['westje01', 1972], ['goodrga01', 1972], ['mcmilji01', 1972],
  ['hairsha01', 1972], ['chambwi01', 1972], ['robinfl01', 1972]]);
if (preThree) {
  const f = E.rosterFit(preThree);
  is(f.profile.tpa, 0, 'the 1972 Lakers attempted no three-pointers, because nobody could');
  ok(f.parts.spacing >= 0, 'and they are not docked a single point for spacing');
  ok(E.spacingIndex(preThree[0]) === 1.0, 'a player from before the line reads as era-neutral');
}

/* And pace translation runs the other way: a 1972 per-game line is inflated by
   nineteen more possessions a night than this game is played at. */
ok(E.paceAdjust(20, 1972) < 19, 'a 1972 counting stat is deflated to the modern game');
ok(E.paceAdjust(20, 1999) > 20, 'and a 1999 one is inflated');

/* Chemistry saturates. Six players off one club cannot be worth six times one
   link, or stacking one team-season beats every talent decision in the draft. */
const bulls = players.filter(p => p.t === 'CHI' && p.s === 1996).slice(0, 6);
const chem6 = E.resolveChemistry(bulls);
const chem2 = E.resolveChemistry(bulls.slice(0, 2));
ok(chem6.bonus <= E.CHEMISTRY.MAX + 1e-9, 'chemistry never exceeds its ceiling');
ok(chem6.raw > chem6.saturated * 3,
  `nineteen links pay out far less than they are worth face value (raw ${chem6.raw.toFixed(1)}, paid ${chem6.saturated.toFixed(2)})`);
/* The property that actually matters: adding four more players to a pair
   TRIPLES the link count many times over and cannot triple the payout. */
ok((chem6.bonus / chem2.bonus) < (chem6.links.length / chem2.links.length) / 3,
  `the payout grows far slower than the link count (${chem2.links.length} links to ${chem6.links.length}, ${chem2.bonus.toFixed(2)} to ${chem6.bonus.toFixed(2)})`);

/* CHEMISTRY AND SHAPE MUST NOT OUTWEIGH TALENT. This is the assertion that
   would have caught the ported-from-baseball multiplier: at a Pythagorean
   exponent of 13.91 a 15% bonus is worth about 30 wins, which is more than the
   entire difference between the best and worst rosters the cap can buy. Both
   terms are capped in rating points, and a point of net rating is about 2.7
   wins, so the pair of them together can never be worth more than about 11
   wins. */
const chemCeilingWins = (E.CHEMISTRY.MAX + E.FIT.MAX) * 2.7;
ok(chemCeilingWins < 15,
  `chemistry and shape together are worth under 15 wins (${chemCeilingWins.toFixed(1)})`);

/* The curated family link has to survive the trip through the data. Mychal and
   Klay Thompson never shared a club, a season or a college, so this link exists
   only because chemistry.json says so, which makes it the one that proves the
   curated path works at all. */
const mychal = players.find(p => p.i === 'thompmy01');
const klay = players.find(p => p.i === 'thompkl01');
ok(!!mychal && !!klay, 'both Thompsons are in the data');
if (mychal && klay) {
  const links = E.pairLinks(mychal, klay);
  ok(links.some(l => l.type === 'family'), 'a curated family link fires across eras');
}

/* Better roster, better season. Not on any single run, which is variance, but
   over a hundred of them, which is the model. */
const best = [...players].sort((x, y) => y.w - x.w).slice(0, 6);
const worst = [...players].sort((x, y) => x.w - y.w).slice(0, 6);
const meanWins = (roster) => {
  let total = 0;
  for (let i = 0; i < 60; i++) {
    total += E.playRun(roster, E.createSeededRNG(7000 + i), E.SLOTS, data.oppPool).record.wins;
  }
  return total / 60;
};
const bestWins = meanWins(best), worstWins = meanWins(worst);
ok(bestWins > worstWins + 20,
  `the best six average far more wins than the worst six (${bestWins.toFixed(1)} vs ${worstWins.toFixed(1)})`);

/* Every roster plays a real number of games and ends up somewhere real. */
const sample = E.playRun(best, E.createSeededRNG(99), E.SLOTS, data.oppPool);
is(sample.record.wins + sample.record.losses, E.CONSTANTS.REGULAR_SEASON_GAMES,
  'a season is exactly 82 games');
ok(sample.season.every(g => g.yourPoints !== g.oppPoints), 'no game ends in a tie');
ok(sample.season.every(g => g.yourPoints >= 50 && g.oppPoints >= 50), 'no scoreline is impossible');

// ─── the report ─────────────────────────────────────────────────────────────

console.log(`\n${pass} assertions passed` + (failures.length ? `, ${failures.length} FAILED` : ''));
if (failures.length) {
  for (const f of failures) console.error('  FAIL: ' + f);
  process.exit(1);
}

console.log(`\nCALIBRATION over ${runs.length} greedy drafts (always take the best man on the board).`);
console.log('Greedy is the strategy the cap is meant to punish, so these are a FLOOR on');
console.log('what a thinking player should reach, not a picture of the median run.\n');

const seasons = runs.map((run, i) => {
  const r = E.playRun(run.roster, E.createSeededRNG(20000 + i),
    run.slotIndex.map(k => E.SLOTS[k]), data.oppPool);
  return { ...r, spend: run.roster.reduce((s, p) => s + p.p, 0) };
});

const wins = seasons.map(s => s.record.wins).sort((x, y) => x - y);
const ratings = seasons.map(s => s.rating).sort((x, y) => x - y);
const spends = seasons.map(s => s.spend).sort((x, y) => x - y);
const q = (arr, p) => arr[Math.floor((arr.length - 1) * p)];
const pct = (n) => `${(100 * n / seasons.length).toFixed(1)}%`;

console.log(`  wins      p10 ${q(wins, 0.1)} · median ${q(wins, 0.5)} · p90 ${q(wins, 0.9)} · best ${q(wins, 1)}`);
console.log(`  rating    p10 ${q(ratings, 0.1)} · median ${q(ratings, 0.5)} · p90 ${q(ratings, 0.9)}`);
console.log(`  spend     p10 $${q(spends, 0.1).toFixed(1)}M · median $${q(spends, 0.5).toFixed(1)}M · p90 $${q(spends, 0.9).toFixed(1)}M of $${E.CONSTANTS.CAP_MUSD}M`);
console.log(`  playoffs  ${pct(seasons.filter(s => s.seed.made).length)}`);
console.log(`  title     ${pct(seasons.filter(s => s.titleWon).length)}`);
console.log(`  beat 72   ${pct(seasons.filter(s => s.beatRecord).length)}`);

const arch = {};
for (const s of seasons) {
  const k = s.structure.archetype.name;
  arch[k] = (arch[k] || 0) + 1;
}
console.log('  shapes    ' + Object.entries(arch).sort((x, y) => y[1] - x[1])
  .map(([k, n]) => `${k} ${pct(n)}`).join(' · '));

const chems = seasons.map(s => s.chemistry.bonus).sort((x, y) => x - y);
const shapes = seasons.map(s => s.structure.bonus).sort((x, y) => x - y);
console.log(`  chemistry median +${q(chems, 0.5).toFixed(2)} · p90 +${q(chems, 0.9).toFixed(2)} · ceiling +${E.CHEMISTRY.MAX} rating points`);
console.log(`  fit       median ${q(shapes, 0.5).toFixed(2)} · p10 ${q(shapes, 0.1).toFixed(2)} · floor ${E.FIT.MIN} rating points`);

/* The two ratings, so the difficulty dial is visible rather than inferred from
   the win column. League average is 113 at both ends by definition. */
const ortgs = seasons.map(s => s.ortg).sort((x, y) => x - y);
const drtgs = seasons.map(s => s.drtg).sort((x, y) => x - y);
console.log(`  ratings   offense ${q(ortgs, 0.5).toFixed(1)} · defense ${q(drtgs, 0.5).toFixed(1)} · net ${(q(ortgs, 0.5) - q(drtgs, 0.5)).toFixed(1)} (league average is ${E.CONSTANTS.LEAGUE_RTG} at both ends)`);

const pool = data.oppPool;
const poolNet = (list) => list.reduce((s, o) => s + (o.ortg - o.drtg), 0) / (list.length || 1);
console.log(`  slate     ${pool.contenders.length} contenders at net ${poolNet(pool.contenders).toFixed(1)} · ${pool.marquee.length} marquee at net ${poolNet(pool.marquee).toFixed(1)}`);

/* THE CEILING, which is the number the balance actually hangs on. Greedy above
   is the floor; this is the strongest legal six the cap could have bought out
   of the same draws, which is what a player who thinks about it is chasing. If
   a data refresh moves the game, it moves here first: a fuller dataset holds
   more cheap useful players, so the cap buys more, so the ceiling rises.
 *
 * WHAT IT SHOULD SAY. The best possible draft should be a title favorite and
 * not a certainty (a ring in roughly one run in ten), and 72 wins should be
 * rare enough to be worth chasing. Read these two lines after every refresh. */
const ceilings = [];
for (let i = 0; i < 60; i++) {
  const squad = R.bestPossibleSquad(runs[i], data);
  if (!squad || squad.lineup.length !== E.SLOTS.length) continue;
  const ids = new Set(squad.lineup.map(p => p.i));
  if (ids.size !== squad.lineup.length) { failures.push('bestPossibleSquad fielded one player twice'); break; }
  if (squad.spend > E.CONSTANTS.CAP_MUSD) { failures.push('bestPossibleSquad broke the cap'); break; }

  let wins = 0, titles = 0, record = 0, rating = 0;
  for (let k = 0; k < 40; k++) {
    const out = E.playRun(squad.lineup, E.createSeededRNG(60000 + i * 40 + k), E.SLOTS, data.oppPool);
    wins += out.record.wins;
    if (out.titleWon) titles++;
    if (out.beatRecord) record++;
    rating = out.rating;
  }
  ceilings.push({ wins: wins / 40, titlePct: 100 * titles / 40, recordPct: 100 * record / 40, rating,
    ws: squad.bestWs, spend: squad.spend });
}

if (failures.length) {
  for (const f of failures) console.error('  FAIL: ' + f);
  process.exit(1);
}

if (ceilings.length) {
  const mean = (f) => ceilings.reduce((s, c) => s + f(c), 0) / ceilings.length;
  const ceilWins = mean(c => c.wins);
  const ceilTitle = mean(c => c.titlePct);
  const ceilRecord = mean(c => c.recordPct);

  console.log(`\n  CEILING over ${ceilings.length} drafts, the best legal six the cap could have bought from the same draws:`);
  console.log(`    wins ${ceilWins.toFixed(1)} · rating ${mean(c => c.rating).toFixed(1)} · spend $${mean(c => c.spend).toFixed(0)}M · win shares ${mean(c => c.ws).toFixed(1)}`);
  console.log(`    title ${ceilTitle.toFixed(1)}% · beat 72 ${ceilRecord.toFixed(1)}%`);

  /* WHAT THESE NUMBERS ARE SUPPOSED TO SAY, written down rather than
     remembered, because the data underneath them is going to change and the
     person who runs the fetch is not necessarily the person who tuned this. */
  const targets = [
    ['ceiling wins', ceilWins, 58, 66, 'a perfect draft should be a 60 win team'],
    ['ceiling title', ceilTitle, 6, 18, 'a ring in roughly one perfect run in ten'],
    ['ceiling beats 72', ceilRecord, 0.5, 6, 'the record has to be reachable and rare'],
    ['greedy wins', q(wins, 0.5), 40, 50, 'best-available alone should miss the top six seed'],
  ];
  const off = targets.filter(([, v, lo, hi]) => v < lo || v > hi);

  console.log('\n  TARGETS');
  for (const [what, v, lo, hi, why] of targets) {
    const mark = (v < lo || v > hi) ? 'OFF ' : 'ok  ';
    console.log(`    ${mark}${what}: ${Number(v).toFixed(1)}, want ${lo} to ${hi}. ${why}`);
  }

  if (off.length) {
    console.log(`
  ${off.length} of ${targets.length} are outside their band, and on the hand-entered SEED that is
  expected rather than alarming. The seed is 171 players off 22 all-time teams, so
  it holds no cheap useful player: every roster in it is one or two stars and four
  minimum contracts, and the cap cannot buy a 60 win six out of that. The finished
  dataset is a whole league, most of it average, which is exactly where a $12M
  starter worth 7 win shares comes from.

  SO: re-read this block after the first real fetch, before touching a constant.
  If the ceiling is still short of its band on real data, the dial is CAP_MUSD and
  the two REPLACEMENT ratings in engine.js, in that order.`);
  }
}
console.log('');
