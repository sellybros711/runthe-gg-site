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
import { AWARDS } from './build/fetch-awards.mjs';

const players = JSON.parse(fs.readFileSync(path.join(HERE, 'data', 'players.json'), 'utf8'));
const chemistry = JSON.parse(fs.readFileSync(path.join(HERE, 'data', 'chemistry.json'), 'utf8'));
E.setCuratedChemistry(chemistry);
/* THE PAGE LOADS THIS AND SO MUST THE HARNESS. Franchise data is what turns a
   team code into a name, a founding year and a list of championships, and the
   ring on a player is asserted against it below. Verifying against an engine
   that has never seen it is verifying a different engine from the one that
   ships. */
E.setTeams(JSON.parse(fs.readFileSync(path.join(HERE, 'data', 'teams.json'), 'utf8')));
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

/* ── TWO KINDS OF FAILURE, AND THEY DESERVE DIFFERENT POWERS ────────────────
 *
 * Most of this file asserts INTEGRITY: a draft may never break the cap, a slot
 * may never hold a player who cannot play it, a seed must replay, a rating must
 * be a number. Those are properties of the CODE. They are true or the game is
 * broken, and they block everything, always.
 *
 * The lineup expectations are a different animal. "The 1996 Bulls should come
 * back running the Triangle" is a judgement about a MODEL, calibrated when the
 * only data available was 171 rows somebody typed from memory. Real
 * Basketball-Reference numbers can legitimately move a borderline roster from
 * one identity to a neighbouring one, and when they do, the right response is
 * to look at the real numbers and decide, not to reject the data.
 *
 * So a data refresh runs with --lineups-advisory: the labels are still checked
 * and still printed loudly, but they do not stop ground truth from landing.
 * Everything else still blocks. Running the file with no flag, which is what a
 * pull request does, enforces all of it.
 */
const LINEUPS_ADVISORY = process.argv.includes('--lineups-advisory');
const lineupDrift = [];

function expectLineup(cond, what) {
  if (cond) { pass++; return; }
  (LINEUPS_ADVISORY ? lineupDrift : failures).push(what);
}
function isLineup(actual, expect, what) {
  const a = JSON.stringify(actual), e = JSON.stringify(expect);
  expectLineup(a === e, `${what}\n      expected ${e}, got ${a}`);
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

/* ── EVERY CLUB THE WHEEL CAN LAND ON HAS TO BE VISIBLE ─────────────────────
 *
 * When the reels stop, both boxes take that club's colors. The published hex
 * is not usable as-is on a #0d1117 page: San Antonio's black and Brooklyn's
 * black disappear into it, and a dark second color (Chicago's black on
 * Chicago's red) is a border nobody can see. engine.js floors each color into a
 * range that shows and lifts the band until it is measurably clear of the fill.
 *
 * WHY THIS IS ASSERTED AND NOT EYEBALLED. The failures are per-club and there
 * are 45 of them, so the way this breaks is that somebody corrects one club's
 * hex, it renders fine for the club they were looking at, and the Hornets go
 * back to being one flat teal rectangle with a seam in it. Three clubs failed
 * exactly that way on the first pass and none of them was the one on screen.
 *
 * 2.6:1 for the band and 4.5:1 for the text are the bars engine.js works to.
 * The fill is deliberately NOT asserted against the page: a club that wears
 * black should read black, and the band is what draws the box for those.
 */
{
  const inPlay = [...new Set(players.map((p) => p.t))].sort();
  ok(inPlay.length > 20, `enough clubs in the data to be worth checking (${inPlay.length})`);
  const dim = [];
  for (const code of inPlay) {
    const skin = E.clubSkin(code);
    if (!/^#[0-9a-f]{6}$/i.test(skin.bg) || !/^#[0-9a-f]{6}$/i.test(skin.accent)) {
      dim.push(`${code}: ${skin.bg} / ${skin.accent} is not a color`);
      continue;
    }
    const band = E.contrast(skin.accent, skin.bg);
    const text = E.contrast(skin.on, skin.bg);
    if (band < 2.6) dim.push(`${code} band ${band.toFixed(2)}:1 on its own fill`);
    if (text < 4.5) dim.push(`${code} text ${text.toFixed(2)}:1 on its own fill`);
  }
  ok(dim.length === 0, `every club reads on the dark page${dim.length ? `\n      ${dim.join('\n      ')}` : ''}`);

  /* A club in the data with no entry falls back to a grey nobody chose, which
     is not a crash and is not the club either. */
  const uncolored = inPlay.filter((c) => !E.TEAM_COLORS[c]);
  ok(uncolored.length === 0, `every club in the data has its own colors${uncolored.length ? ` (missing ${uncolored.join(', ')})` : ''}`);
}

/* ── HARDWARE ──────────────────────────────────────────────────────────────
 *
 * Awards are DECORATION: the engine never reads them and no rating moves
 * because a player has one. That is exactly why they need asserting. A field
 * nothing computes with can be wrong for a year without a single number
 * looking odd, and the failure mode is showing a visitor a false claim about a
 * real person, which is the one thing this data must never do.
 *
 * The ring is checked hardest because it is the one the game DERIVES rather
 * than fetches, from the title years in teams.json. Its first version filed
 * 1978 under WAS and 1979 under OKC, so the Bullets and the Sonics won those
 * championships and nobody on either roster was told.
 */
{
  /* THE LIST LIVES IN ONE PLACE. It was written out here as well and that is
     three copies of it with the fetcher and the page, which is three chances
     for a new award to be added to two of them. The page cannot import this
     (it is one self-contained script by site convention), so the page's copy is
     checked against this one below instead of trusted. */
  const CODES = new Set(AWARDS.map((a) => a.code));
  const RANK = AWARDS.map((a) => a.code);

  const bad = [];
  let decorated = 0, rings = 0;
  for (const p of players) {
    if (!p.aw) continue;
    decorated++;
    if (!Array.isArray(p.aw)) { bad.push(`${p.n} ${p.s}: aw is not a list`); continue; }
    for (const code of p.aw) {
      if (!CODES.has(code)) bad.push(`${p.n} ${p.s}: "${code}" is not an award this game knows`);
    }
    if (new Set(p.aw).size !== p.aw.length) bad.push(`${p.n} ${p.s} won the same award twice`);
    /* SORTED AT BUILD TIME, once, because the page shows the first entry as the
       best one and does no ranking of its own. An unsorted list silently
       promotes an All-Star nod over an MVP on the tile. */
    const ranks = p.aw.map((c) => RANK.indexOf(c));
    for (let i = 1; i < ranks.length; i++) {
      if (ranks[i] < ranks[i - 1]) { bad.push(`${p.n} ${p.s}: ${p.aw.join(',')} is not in prestige order`); break; }
    }
    if (p.aw.includes('ring')) {
      rings++;
      if (!E.wonTitle(p.t, p.s)) bad.push(`${p.n} has a ring for ${p.s} ${p.t}, which won nothing`);
    } else if (E.wonTitle(p.t, p.s)) {
      bad.push(`${p.n} played for the ${p.s} champions and has no ring`);
    }
    if (bad.length > 6) break;
  }
  ok(bad.length === 0, `every award on a player is one this game knows${bad.length ? `\n      ${bad.join('\n      ')}` : ''}`);

  /* EVERY TITLE SEASON IN RANGE MUST REACH SOMEBODY. A ring that joins to no
     roster is the WSB/OKC bug, and it is invisible: the count just comes back
     a little lower than it should and nothing fails. */
  const seasons = [...new Set(players.map((p) => p.s))];
  const lo = Math.min(...seasons), hi = Math.max(...seasons);
  const won = new Set(players.filter((p) => p.aw && p.aw.includes('ring')).map((p) => p.s));
  const silent = seasons.filter((s) => ![...won].includes(s)).sort();
  ok(silent.length === 0,
    `every season from ${lo} to ${hi} has a champion in the data`
    + (silent.length ? ` (${silent.length} do not: ${silent.slice(0, 8).join(', ')})` : ''));
  ok(rings > 300, `enough champions to be a real answer (${rings} player-seasons)`);

  /* Not a blocking check: the individual honours arrive from a fetch that runs
     in CI, so a working tree that has never run it legitimately has rings only.
     Reported so that state is visible rather than mistaken for a broken join. */
  /* THE PAGE HAS TO KNOW EVERY CODE THE PIPELINE CAN WRITE. It carries its own
     copy of the labels because it is one self-contained file, so an award added
     to the fetcher and not to the page renders as a raw "smoy" on a gold plate.
     Read as text rather than executed, which is all this needs to answer. */
  const pageSrc = fs.readFileSync(path.join(HERE, 'index.html'), 'utf8');
  const labels = /var AWARD_LABEL = \{([\s\S]*?)\};/.exec(pageSrc);
  ok(!!labels, 'the page has an award label table');
  if (labels) {
    const unnamed = AWARDS.map((a) => a.code)
      .filter((c) => !new RegExp(`\\b${c}\\s*:`).test(labels[1]));
    ok(unnamed.length === 0,
      `the page can name every award the pipeline writes${unnamed.length ? ` (missing ${unnamed.join(', ')})` : ''}`);
  }

  const solo = players.filter((p) => p.aw && p.aw.some((c) => c !== 'ring')).length;
  if (!solo) {
    console.log('  note: rings only. hoops/build/fetch-awards.mjs has not run against this data yet,');
    console.log(`        so ${decorated} player-seasons carry a championship and none carry an MVP.`);
  }
}

/* ── WIN SHARES HAVE TO BE THE SEASON'S, AND THE FILE HAS TO SAY SO ────────
 *
 * Win shares are the currency. Price, draft value, team rating and every
 * target in the calibration block are computed from this one column, so a
 * column that is quietly the WRONG NUMBER breaks the whole game while every
 * other assertion in this file still passes.
 *
 * That is not hypothetical. The first real fetch shipped a file in which
 * Michael Jordan's 72 win season carried 4.7 win shares instead of 20.4, Karl
 * Malone's 1996 carried 2.5 instead of 16.3, and Nikola Jokic's 2022 carried
 * 0.7 instead of 15.2. A Basketball-Reference season page also carries the
 * PLAYOFF table, the scrape read every row on the page, and the playoff row
 * for a player overwrote his regular season one. Anybody whose club played a
 * postseason game got priced off a fortnight in May.
 *
 * Nothing failed. The draft was legal, the seasons replayed, every rating was
 * a number, and the game was unplayable for a reason no assertion could name:
 * the calibration simply said a perfect draft was a 27 win team.
 *
 * So the shape of the distribution is asserted directly, against the league
 * this data is supposed to be. These are deliberately loose. They are not a
 * calibration, they are a smoke alarm, and the number they are set to catch is
 * a whole league of great seasons that arrived two thirds too small.
 */
{
  const best = Math.max(...players.map(p => p.w));
  const rate = (n) => players.filter(p => p.w >= n).length / players.length;
  const mean = players.reduce((s, p) => s + p.w, 0) / players.length;
  const pct = (v) => (v * 100).toFixed(2) + '%';

  /* AS A RATE, NOT A COUNT, because this file is built from two populations of
     very different size and both have to pass. The real league is 16,000 rows;
     the hand-entered seed is 171 rows of nothing but all-time greats, so it
     runs several times richer. A count calibrated for either one is a landmine
     for the other.

     THE NUMBERS ARE MEASURED, NOT ESTIMATED, and the difference cost a run.
     The 12 win share floor was first set at 2% from a back-of-the-envelope
     guess that history holds around 700 such seasons. A clean league actually
     measures 1.79%, about five and a half players a year, and the guess failed
     a dataset that was right. The floors below sit at roughly two thirds of
     what a real league measures: low enough not to fail honest data, and still
     an order of magnitude above the broken file, which sat at 0.02% and 0.14%.

     Note which way the evidence ran when they disagreed. The six named seasons
     below all PASSED on that run, and they are the direct check on the column;
     the rate is an aggregate that can be wrong about the league without being
     wrong about the data. So the threshold moved, not the data. */
  ok(best >= 18,
    `the best season in the data is a real MVP season (${best} win shares, want 18+)`);
  ok(rate(15) >= 0.004,
    `15 win share seasons occur at a believable rate (${pct(rate(15))} of rows, want 0.4%+)`);
  ok(rate(12) >= 0.012,
    `and 12 win share seasons (${pct(rate(12))} of rows, want 1.2%+)`);
  ok(mean >= 2.5,
    `the average qualifying player is worth a real amount (${mean.toFixed(2)} win shares, want 2.5+)`);

  /* AND A HANDFUL BY NAME, because the counts above can be satisfied by a file
     that is right in aggregate and wrong for exactly the players a fan will
     look up first. Every one of these clubs played deep into a postseason,
     which is precisely the population the bug above corrupted. The floor is
     far below each man's real figure on purpose: this catches a collapse, not
     a revision. */
  const GREATS = [
    ['jordami01', 1996, 20.4], ['onealsh01', 2000, 18.6], ['duncati01', 2003, 16.5],
    ['malonka01', 1996, 16.3], ['jokicni01', 2022, 15.2], ['curryst01', 2016, 17.9],
  ];
  for (const [id, s, real] of GREATS) {
    const row = players.find(p => p.i === id && p.s === s);
    if (!row) continue;              // a short fetch need not contain that year
    ok(row.w >= real * 0.6,
      `${row.n} ${s} is priced off his season, not his postseason `
      + `(${row.w} win shares, real season was about ${real})`);
  }

  /* NO SEASON MAY BE WORTH LESS THAN THE OTHERS FOR NOT HAPPENING.
   *
   * Win shares count wins contributed, and four of these fifty-two seasons were
   * not 82 games: the 1999 lockout played 50, the 2012 lockout 66, COVID ended
   * 2020 between 63 and 75 by club, and 2021 played 72. Untouched, every player
   * in those years arrives worth a third less for the same basketball, and
   * Allen Iverson's MVP-calibre 1999 reads as a rotation guard.
   *
   * build-players.mjs normalizes each club to an 82 game schedule. This is the
   * assertion that says it happened, and it is written against the SHAPE of the
   * league rather than against a list of lockout years, so the next shortened
   * season is caught without anybody remembering to add it. */
  const bySeason = new Map();
  for (const p of players) {
    const k = `${p.s}|${p.t}`;
    if (!bySeason.has(k)) bySeason.set(k, []);
    bySeason.get(k).push(p);
  }
  const seasonTop6 = new Map();
  for (const [k, ros] of bySeason) {
    if (ros.length < 6) continue;
    const s = Number(k.split('|')[0]);
    const six = [...ros].sort((a, b) => b.w - a.w).slice(0, 6).reduce((a, b) => a + b.w, 0);
    if (!seasonTop6.has(s)) seasonTop6.set(s, []);
    seasonTop6.get(s).push(six);
  }
  const seasonMean = [...seasonTop6.entries()]
    .map(([s, v]) => [s, v.reduce((a, b) => a + b, 0) / v.length]);
  if (seasonMean.length >= 10) {
    const all = seasonMean.map(([, v]) => v).sort((a, b) => a - b);
    const median = all[Math.floor(all.length / 2)];
    /* 0.82 of the median is well below normal year-to-year drift, which runs
       about 0.90 to 1.05 across five decades, and well above an unnormalized
       50 game season, which lands at 0.62. */
    const thin = seasonMean.filter(([, v]) => v < median * 0.82);
    ok(thin.length === 0,
      'every season is worth a full season of win shares'
      + (thin.length
        ? `\n      ${thin.map(([s, v]) => `${s} at ${v.toFixed(1)} against a median of ${median.toFixed(1)}`).join('\n      ')}`
        : ''));
  }
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

/* WHICH MAN IS MISSING, AND WHAT HE IS PROBABLY CALLED INSTEAD.
 *
 * "a player in that lineup is not in the data" is a message that costs a
 * twenty minute round trip to act on, because the data only exists after a CI
 * fetch and the failure does not say which of six ids to look at. Three of
 * these fired on the first real run and all three were slugs I had typed
 * wrong.
 *
 * A Basketball-Reference id is the first five letters of the surname, the
 * first two of the forename, and a two digit tiebreaker: grantho01 is Horace
 * Grant, and the 01 becomes 02 when somebody got there first. So a miss is
 * nearly always a right stem with a wrong tail, and the data itself can be
 * asked who owns that stem. */
const missingFrom = (ids) => {
  const out = [];
  for (const [id, s] of ids) {
    if (players.some(p => p.i === id && p.s === s)) continue;
    const stem = id.replace(/\d+$/, '');
    const sameStem = [...new Set(players.filter(p => p.i.startsWith(stem)).map(p => `${p.i} ${p.n}`))];
    const inLeague = players.some(p => p.i === id);
    out.push(`${id} in ${s}: `
      + (inLeague ? 'that id exists but not in that season'
        : sameStem.length ? `no such id. Same stem in the data: ${sameStem.join(', ')}`
          : 'no such id, and nothing shares its stem'));
  }
  return out;
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
    ['princta01', 2004], ['wallara01', 2004], ['wallabe01', 2004], ['willico02', 2004]]],
  // PG John Stockton, SG Jeff Hornacek, SF Bryon Russell, PF Karl Malone, C Greg Ostertag, 6th Howard Eisley
  ['the 1998 Jazz', 'Pick and Roll', [['stockjo01', 1998], ['hornaje01', 1998],
    ['russebr01', 1998], ['malonka01', 1998], ['ostergr01', 1998], ['eisleho01', 1998]]],
  // PG Chris Paul, SG James Harden, SF Trevor Ariza, PF P.J. Tucker, C Clint Capela, 6th Eric Gordon
  ['the 2018 Rockets', 'Moreyball', [['paulch01', 2018], ['hardeja01', 2018],
    ['arizatr01', 2018], ['tuckepj01', 2018], ['capelca01', 2018], ['gordoer01', 2018]]],
  // PG Stephen Curry, SG Klay Thompson, SF Harrison Barnes, PF Draymond Green, C Andrew Bogut, 6th Andre Iguodala
  ['the 2016 Warriors', 'Pace and Space', [['curryst01', 2016], ['thompkl01', 2016],
    ['barneha02', 2016], ['greendr01', 2016], ['bogutan01', 2016], ['iguodan01', 2016]]],
  // PG Jamal Murray, SG Kentavious Caldwell-Pope, SF Michael Porter Jr., PF Aaron Gordon, C Nikola Jokic, 6th Bruce Brown
  ['the 2023 Nuggets', 'Point Centre', [['murraja01', 2023], ['caldwke01', 2023],
    ['portemi01', 2023], ['gordoaa01', 2023], ['jokicni01', 2023], ['brownbr01', 2023]]],
  /* THE EXPECTATION WAS WRONG HERE, NOT THE MODEL, and it is worth saying so
     rather than quietly editing the string. This was written down as Bully Ball
     because Shaquille O'Neal averaged 28.7 and the ball went inside, which is
     true. But Phil Jackson coached this team and installed the triangle in
     1999, so the triangle is what they actually ran: a dominant wing, a post to
     play through, and the floor divided strong side and weak side. The model
     read Kobe at 9.2 offensive win shares, Shaq in the post, no lead guard
     creating (5.47) and no spacing (0.999), and called it the triangle.
     That is the right answer to the question a fan would ask. */
  // PG Derek Fisher, SG Kobe Bryant, SF Rick Fox, PF Horace Grant, C Shaquille O'Neal, 6th Robert Horry
  ['the 2001 Lakers', 'The Triangle', [['fishede01', 2001], ['bryanko01', 2001],
    ['foxri01', 2001], ['grantho01', 2001], ['onealsh01', 2001], ['horryro01', 2001]]],
  /* WHICH LEAVES BULLY BALL WITH NOTHING TO PROVE IT, so here is a team that is
     unambiguously it and unambiguously not the triangle. Moses Malone led the
     league in rebounding, Philadelphia went 65-17 and swept the finals, and
     nobody has ever described that offense as a read out of the post. */
  // PG Maurice Cheeks, SG Andrew Toney, SF Julius Erving, PF Bobby Jones, C Moses Malone, 6th Clint Richardson
  ['the 1983 Sixers', 'Bully Ball', [['cheekma01', 1983], ['toneyan01', 1983],
    ['ervinju01', 1983], ['jonesbo01', 1983], ['malonmo01', 1983], ['richacl01', 1983]]],
  /* And a second Grit and Grind, because the threshold that separates it from
     everything else was moved on the evidence of exactly two teams. */
  // PG Doc Rivers, SG John Starks, SF Charles Smith, PF Charles Oakley, C Patrick Ewing, 6th Anthony Mason
  ['the 1993 Knicks', 'Grit and Grind', [['riverdo01', 1993], ['starkjo01', 1993],
    ['smithch01', 1993], ['oaklech01', 1993], ['ewingpa01', 1993], ['masonan01', 1993]]],
];

for (const [who, expected, names] of KNOWN) {
  const six = lineup(names);
  if (!six) {
    (LINEUPS_ADVISORY ? lineupDrift : failures)
      .push(`${who}: a player in that lineup is not in the data\n`
        + missingFrom(names).map(m => `      ${m}`).join('\n'));
    continue;
  }
  const f = E.rosterFit(six);
  isLineup(f.system && f.system.name, expected, `${who} plays ${expected}`);
}

/* EVERY REAL LINEUP GETS AN IDENTITY. A roster that matches nothing is allowed
   and is information, but if actual championship teams match nothing then the
   thresholds are set for rosters that do not exist. */
const unnamed = KNOWN.filter(([, , names]) => {
  const six = lineup(names);
  return six && !E.rosterFit(six).system;
});
isLineup(unnamed.length, 0, 'every real championship lineup is recognised as something');

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
  isLineup(f.system && f.system.name, 'Too Many Mouths', 'and names the problem rather than a system');
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

/* PRINTED BEFORE THE EXIT, deliberately. The drift is the most useful thing in
   this log after a data refresh, and burying it behind an unrelated integrity
   failure means the one run that fetched real numbers tells you nothing about
   what they did to the model. Printed whether or not it is empty, because "the
   labels did not move" is itself the answer somebody is looking for. */
if (LINEUPS_ADVISORY) {
  if (lineupDrift.length) {
    console.log(`\n${lineupDrift.length} LINEUP LABEL(S) MOVED under this data:\n`);
    for (const d of lineupDrift) console.log('  ~ ' + d);
    console.log(`
  These are advisory on a data refresh and blocking everywhere else. Real numbers
  can legitimately move a borderline roster to a neighbouring identity, so the
  next step is to LOOK at the roster and decide whether the model or the
  expectation is wrong. Do not just update the expectation to whatever came out.`);
  } else {
    console.log('\nEvery lineup label held under this data.');
  }
}

/* THE FAILURES ARE PRINTED HERE AND THE EXIT HAPPENS AFTER THE REPORT.
 *
 * This used to exit on the spot, which meant one failing assertion hid the
 * calibration block entirely, and the calibration block is the thing somebody
 * tuning this engine has actually come to read. A short-season guard firing on
 * the data layer would suppress every number about the balance, so the run that
 * told you something was wrong told you nothing about what.
 *
 * Same coupling as the draft step and the lineup labels: one kind of failure
 * silencing an unrelated kind of information. The exit code is unchanged, so
 * nothing that gates on it behaves differently. */
if (failures.length) {
  for (const f of failures) console.error('  FAIL: ' + f);
  console.error('\nThe calibration below still printed, because a failure here does not make');
  console.error('the balance numbers less worth reading.');
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
  /* A HUNDRED AND TWENTY SEASONS PER DRAFT, not forty, and the reason is that
     two of the four targets are RATES near a band edge. Beating 72 is supposed
     to happen a few percent of the time, so at forty seasons a draft the whole
     measurement carried enough binomial noise to move it across its own
     threshold between runs: 6.2 and 5.3 against a limit of 6.0 on two
     neighbouring cap settings. A target that flips on the seed is not a target.
     The expensive part of a ceiling draft is the knapsack, and that still runs
     once per draft, so this costs a couple of seconds. */
  for (let k = 0; k < 120; k++) {
    const out = E.playRun(squad.lineup, E.createSeededRNG(60000 + i * 120 + k), E.SLOTS, data.oppPool);
    wins += out.record.wins;
    if (out.titleWon) titles++;
    if (out.beatRecord) record++;
    rating = out.rating;
  }
  ceilings.push({ wins: wins / 120, titlePct: 100 * titles / 120, recordPct: 100 * record / 120, rating,
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
    ['ceiling title', ceilTitle, 6, 18,
      'a real 60 win club took the ring 20% of the time; a drafted six has no bench, so this sits a little under'],
    ['ceiling beats 72', ceilRecord, 0.5, 6, 'the record has to be reachable and rare'],
    ['greedy wins', q(wins, 0.5), 40, 50, 'best-available alone should miss the top six seed'],
  ];
  const off = targets.filter(([, v, lo, hi]) => v < lo || v > hi);

  console.log('\n  TARGETS');
  for (const [what, v, lo, hi, why] of targets) {
    const mark = (v < lo || v > hi) ? 'OFF ' : 'ok  ';
    console.log(`    ${mark}${what}: ${Number(v).toFixed(1)}, want ${lo} to ${hi}. ${why}`);
  }

  if (!off.length) {
    console.log(`
  All four inside their bands. Every number above is anchored to something real
  rather than to a preference, so if one drifts, go and look at what moved:

    the ratings   fitted to 22 real NBA records at 3.5 wins rms, with the
                  league-average club pinned to 41 wins
    the bracket   fitted to the actual title rate of every team-season in the
                  data, read off the championship years in teams.json
    the prices    a market score off the counting stats, so value and cost are
                  no longer the same number and the board has bargains in it
    the cap       swept across its whole range, not nudged

  THE GAP IS THE POINT. A thoughtless draft lands around ${q(wins, 0.5).toFixed(0)} wins and a perfect
  one around ${ceilWins.toFixed(0)}. That spread is what a player's basketball knowledge is worth,
  and it was six wins when price was a function of value. Watch it: if it
  narrows, the draft has stopped being a decision, whatever else still passes.`);
  }

  if (off.length) {
    console.log(`
  ${off.length} of ${targets.length} are outside their band. Read this before moving a constant.

  EVERY ONE OF THESE IS ANCHORED TO SOMETHING MEASURED, so the first question is
  never "which constant do I move" but "which anchor moved".

    the ratings   fitted to 22 real NBA records at 3.5 wins rms, league-average
                  club pinned to 41 wins. Rating all 1403 team-seasons puts the
                  2012 Bobcats last at 10.5 wins and the 1996 Bulls first at
                  73.8, neither of which was a fit target.
    the bracket   ROUND_NET and TITLE.SERIES_SD are fitted to the real title
                  rate of every team-season, read off the championship years in
                  teams.json: 20.3% for a 60 to 65 win club, 8.6% at 55 to 60,
                  3.8% at 50 to 55, 1.4% at 45 to 50.
    the prices    a market score off the counting stats, deliberately NOT a
                  function of win shares.
    the cap       swept across its whole range each time one of the above moved.

  THE ONE TO WATCH IS THE GAP between greedy and ceiling. It is what a player's
  basketball knowledge is worth, and it was SIX WINS while price was a monotone
  function of value: every player was the same deal, the board held no bargains,
  and clicking the biggest number was near optimal. Pricing on fame instead took
  it to about seventeen. If a change narrows it again the draft has quietly
  stopped being a decision, and no other target in this list will say so.

  REFIT, DO NOT NUDGE. These trade off against each other, which is exactly why
  the previous rating set could be uniformly fifteen wins low without any single
  number looking wrong.`);
  }
}
console.log('');
