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
import { execFileSync } from 'node:child_process';

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

  /* AND ON THE DOOR, WHICH IS A DIFFERENT FILL. The One Franchise door on the
     front page sets the club's accent as the name's colour over the card
     fill, not over the club's own. wheelColors lifts the accent until it
     clears the PAGE at #0d1117, and the door is a shade lighter, so a club
     that just scraped past there could fail here and nowhere else would say
     so. 3:1 is the bar for the size it is set at (15px bold). Measured worst
     case is the Clippers at 4.15:1.

     THE FILL IS READ OUT OF THE STYLESHEET, never typed here. A number in
     both places is two answers to one question, and this one drifts in the
     direction nobody checks: somebody lightens the door, the contrast gets
     easier, and the guard goes on asserting against a colour that is not on
     the page any more. */
  const pageSrc = fs.readFileSync(path.join(HERE, 'index.html'), 'utf8');
  const doorRule = /\.modedoor button\{background:(#[0-9a-f]{3,6});/i.exec(pageSrc);
  ok(!!doorRule, 'the One Franchise door declares a flat fill this can be measured against');
  const DOOR_FILL = doorRule ? doorRule[1] : '#141a26';
  const flat = [];
  for (const f of E.franchises()) {
    const c = E.contrast(E.clubSkin(f.code).accent, DOOR_FILL);
    if (c < 3) flat.push(`${f.code} ${c.toFixed(2)}:1`);
  }
  ok(flat.length === 0,
    `every club's name reads on the One Franchise door${flat.length ? `\n      ${flat.join('\n      ')}` : ''}`);
}

/* ── THE SHARE CARD'S PALETTE IS A SECOND COPY OF THE POSITION COLOURS ─────
 *
 * The page paints a position pill as a gradient off a CSS custom property. A
 * canvas cannot read one, so the card carries the same colours again as flat
 * hex. Two copies of anything drift, and this pair drifts SILENTLY: the card
 * still renders, it just hands somebody a picture where the centre is a
 * different red from the one they were looking at when they signed him.
 *
 * THE PAIR IS FOUND, NEVER SPELLED OUT, and the first draft of this spelled it
 * out: one regex naming all eight properties in order. That reads the two
 * copies correctly and is a THIRD copy of the same list, so the day the sixth
 * man slot was removed the regex matched nothing and this section reported the
 * page as having no position colours at all. A reader that finds nothing lets
 * every assertion under it pass green, which is how an extractor in this repo
 * has been silently wrong four times.
 *
 * So it reads whatever `POS_COL` names, resolves each one through `:root`, and
 * asks that the card carries exactly that set. A position added or removed is
 * covered with nobody remembering this section exists.
 *
 * Read as text rather than executed, which is all this needs to answer.
 */
{
  const src = fs.readFileSync(path.join(HERE, 'index.html'), 'utf8');

  /* POS_COL is the page's own answer to which positions get painted, and it
     maps each to the custom property that holds its colour. GF and FC share a
     property with another position on purpose, so the SET of properties is
     what matters rather than the count of positions. */
  const colBlock = /var POS_COL = \{([\s\S]*?)\};/.exec(src);
  ok(!!colBlock, 'the page names which positions get a colour');
  const hexBlock = /var POS_HEX = \{([\s\S]*?)\};/.exec(src);
  ok(!!hexBlock, 'the share card carries a flat copy of the position colours');

  if (colBlock && hexBlock) {
    const wantProp = {};
    for (const m of colBlock[1].matchAll(/'?([A-Z0-9]+)'?\s*:\s*'(--[a-z0-9]+)'/gi)) wantProp[m[1]] = m[2];
    ok(Object.keys(wantProp).length >= 5,
      `the position map was read (${Object.keys(wantProp).length} entries)`);

    /* Every custom property declared on :root, which is where the page keeps
       them. EVERY :root BLOCK, not the first one: this page opens with a
       palette-and-fonts block hundreds of lines above the position colours,
       so a reader that stopped at the first brace found no position at all
       and reported a page with no colours on it. */
    const declared = {};
    for (const rb of src.matchAll(/:root\{([\s\S]*?)\}/g)) {
      for (const m of rb[1].matchAll(/(--[a-z0-9]+)\s*:\s*(#[0-9a-f]{3,8})/gi)) {
        declared[m[1]] = m[2];
      }
    }
    ok(Object.keys(declared).length >= 8,
      `the page's custom properties were read (${Object.keys(declared).length})`);
    const missing = Object.entries(wantProp)
      .filter(([, prop]) => !declared[prop]).map(([pos, prop]) => `${pos} wants ${prop}`);
    is(missing, [], 'every painted position has a custom property to paint with');

    const flat = {};
    for (const m of hexBlock[1].matchAll(/'?([A-Z0-9]+)'?\s*:\s*'(#[0-9a-f]{6})'/gi)) flat[m[1]] = m[2];

    /* The card carries the five slots plus the loose eligibility codes that
       have a colour of their own. GF and FC alias, so they are not expected
       on the card: what is asserted is that every colour the card DOES carry
       is the colour the page declares, and that no painted position whose
       property is its own is missing from it. */
    const drift = [];
    for (const [pos, prop] of Object.entries(wantProp)) {
      const own = Object.values(wantProp).filter(x => x === prop).length === 1;
      if (!own) continue;
      const want = (declared[prop] || '').trim().toLowerCase();
      const got = (flat[pos] || '').toLowerCase();
      if (got !== want) drift.push(`${pos}: page ${want || 'missing'}, card ${got || 'missing'}`);
    }
    for (const pos of Object.keys(flat)) {
      if (!wantProp[pos]) drift.push(`${pos}: on the card and painted by nothing`);
    }
    ok(drift.length === 0,
      `the share card paints positions the colour the page does${drift.length ? `\n      ${drift.join('\n      ')}` : ''}`);
  }
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
  /* A club's best SLOTS.length men, which is the roster this game drafts, so
     the sweep asks about the same shape the game plays. */
  const seasonTop = new Map();
  for (const [k, ros] of bySeason) {
    if (ros.length < E.SLOTS.length) continue;
    const s = Number(k.split('|')[0]);
    const core = [...ros].sort((a, b) => b.w - a.w).slice(0, E.SLOTS.length)
      .reduce((a, b) => a + b.w, 0);
    if (!seasonTop.has(s)) seasonTop.set(s, []);
    seasonTop.get(s).push(core);
  }
  const seasonMean = [...seasonTop.entries()]
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

/* Chemistry saturates. A whole roster off one club cannot be worth one link
   times the number of pairs, or stacking one team-season beats every talent
   decision in the draft. */
const bulls = players.filter(p => p.t === 'CHI' && p.s === 1996).slice(0, E.SLOTS.length);
const chem6 = E.resolveChemistry(bulls);
const chem2 = E.resolveChemistry(bulls.slice(0, 2));
ok(chem6.bonus <= E.CHEMISTRY.MAX + 1e-9, 'chemistry never exceeds its ceiling');
ok(chem6.raw > chem6.saturated * 3,
  `every link pays out far less than face value (raw ${chem6.raw.toFixed(1)}, paid ${chem6.saturated.toFixed(2)})`);
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
const best = [...players].sort((x, y) => y.w - x.w).slice(0, E.SLOTS.length);
const worst = [...players].sort((x, y) => x.w - y.w).slice(0, E.SLOTS.length);
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

/* ── ONE FRANCHISE ──────────────────────────────────────────────────────────
 *
 * The club lock. Three things can go wrong here and two of them are silent.
 *
 * THE LINEAGE. A franchise is every code it has ever worn, which is the whole
 * appeal: an Oklahoma City run reaches Gary Payton. Get the walk wrong and a
 * Thunder fan gets eighteen seasons instead of fifty-two and nothing anywhere
 * says so.
 *
 * THE RESERVE FLOOR. cheapestForSlot reads the 200 cheapest men per position
 * ACROSS ALL 16,057 rows, and under a lock not one of them may be drawable. A
 * floor built from the league promises a $2.2M centre off a club this run can
 * never spin, so the budget reads bigger than it is and the draft strands
 * itself at the last slot with no legal player at any price. Nothing throws:
 * sign() refuses and the player is left on a board with six greyed names.
 *
 * SO THE SWEEP ASSERTS THE FLOOR IS ACTUALLY DIFFERENT, and that is not belt
 * and braces. A sweep that only asserts thirty drafts finish would pass on the
 * unlocked floor too, for most clubs, most of the time, and report green on
 * exactly the defect it was written for. Same lesson as check-fullteam's
 * "assert the replaced reading disagreed at least once".
 */
{
  const fr = E.franchises();
  is(fr.length, 30, 'thirty current franchises are offered');
  ok(E.franchiseCodes('OKC').includes('SEA'), 'Oklahoma City reaches Seattle');
  ok(E.franchiseCodes('MEM').includes('VAN'), 'Memphis reaches Vancouver');
  ok(E.franchiseCodes('NOP').includes('CHH'), 'New Orleans reaches the Charlotte Hornets');
  /* The two Charlotte clubs are different franchises and this is the one pair
     in the table that a lineage walk can plausibly merge. The Hornets left for
     New Orleans and the Bobcats took the name later. */
  ok(!E.franchiseCodes('CHO').includes('CHH'), 'the Hornets who left are not the Hornets who stayed');
  ok(E.franchiseCodes('CHO').includes('CHA'), 'Charlotte reaches the Bobcats');
  ok(E.franchiseCodes('ZZZ').length === 1, 'a code with no row is a franchise of one, not a crash');

  let thin = [], stranded = [], floorSame = 0, floorDiff = 0;
  for (const f of fr) {
    const seasons = R.clubSeasons(f.code);
    if (seasons.length < 3) thin.push(f.code + ' ' + seasons.length);

    /* Best available spends the most and is therefore the strategy most likely
       to strand; cheapest exercises the other end of the floor. */
    for (const [label, pick] of [
      ['best', (o) => o.slice().sort((a, b) => b.w - a.w)[0]],
      ['cheap', (o) => o.slice().sort((a, b) => a.p - b.p)[0]],
    ]) {
      const run = R.createRun({ club: f.code, seed: 4242 });
      let guard = 0, broke = null;
      while (run.phase === R.PHASES.DRAFT && guard++ < 40) {
        /* THE SAME RUN, BOTH FLOORS, AFTER EVERY SIGNING. Measured at the
           start they are usually the SAME number, and that is not the lock
           failing: the league's cheapest men sit at the price floor and most
           clubs have somebody there too, so both sums are six times the base.
           11 of 30 differ before a single pick. The pools come apart as a
           draft eats the cheap end of a club that only has fifty seasons in
           it, which is exactly when a floor built from the whole league
           starts promising money that is not there. */
        if (label === 'best') {
          const locked = R.fullFloor(run);
          const open = R.fullFloor({ ...run, club: null });
          /* A smaller pool can never be CHEAPER, so this direction is an
             invariant rather than a sample. It catches the lock being applied
             to the wheel and not to the floor. */
          if (locked < open - 1e-9) {
            stranded.push(`${f.code}: the locked floor came in under the league floor`);
          }
          if (Math.abs(locked - open) < 1e-9) floorSame++; else floorDiff++;
        }
        let draw;
        try { draw = R.spin(run, data); } catch (e) { broke = 'spin: ' + e.message; break; }
        const opts = draw.options.map(k => data.allPlayers[k]).filter(Boolean);
        if (!opts.length) { broke = 'empty board'; break; }
        try { R.sign(run, pick(opts)); } catch (e) { broke = 'sign: ' + e.message; break; }
      }
      if (broke || run.roster.length !== E.SLOTS.length) {
        stranded.push(`${f.code}/${label}: ${broke || 'stalled at ' + run.roster.length}`);
        continue;
      }
      /* Every man really did wear the shirt, which is the mode's one promise. */
      const codes = new Set(E.franchiseCodes(f.code));
      if (!run.roster.every(p => codes.has(p.t))) {
        stranded.push(`${f.code}/${label}: signed somebody off another club`);
      }
    }
  }
  is(thin, [], 'every franchise on offer has at least three drawable seasons');
  is(stranded, [], 'every franchise finishes a draft on both strategies, off its own men');
  /* Measured at 36 of 180 readings. The threshold is 20 rather than 35
     because the number is a property of where the price floor happens to sit
     in each club's cheap end, which a data refresh legitimately moves; what
     would be a bug is it going to zero, which is the lock not being applied
     to the floor at all. */
  ok(floorDiff >= 20,
    `the club lock actually reaches the reserve floor `
    + `(${floorDiff} of ${floorDiff + floorSame} floor readings differ from the league's)`);

  /* The wheel cannot leave the franchise. Asserted on the drawable list rather
     than on a played draft, because a draft only proves the clubs it happened
     to land on. */
  const lk = R.createRun({ club: 'BOS', seed: 7 });
  const codes = new Set(E.franchiseCodes('BOS'));
  ok(R.drawable(lk, data).every(t => codes.has(t.team)), 'a locked wheel never leaves the franchise');
  ok(R.drawable(lk, data).length > 20, 'a locked wheel still has plenty to land on');
  ok(R.drawable(R.createRun({}), data).length > R.drawable(lk, data).length * 5,
    'an unlocked wheel is the whole league');

  let threw = false;
  try { R.createRun({ club: 'NOPE' }); } catch (e) { threw = true; }
  ok(threw, 'a club the table does not know is refused rather than silently emptying the wheel');
}

/* ── DECADES ────────────────────────────────────────────────────────────────
 *
 * ERAS and the era filter in drawable() were written with run.js and nothing
 * on the page could ever set one, so this whole mode shipped unreachable and
 * untested against real data. Two things it inherits from that:
 *
 * THE SPAN IN THE CONSTANT IS NOT THE SPAN IN THE FILE. ERAS.seventies is
 * [1970, 1979] and the data starts in 1974, so a picker printing the constant
 * offers four seasons the wheel can never land on.
 *
 * AND THE RESERVE FLOOR WAS NEVER SCOPED TO IT, for the same reason the club
 * lock's was not: nothing ever ran a restricted draft. An eighties run with a
 * league floor is being promised a 2019 minimum-salary centre.
 */
{
  const eras = Object.keys(E.ERAS);
  is(eras.length, 6, 'six decades');
  const stranded = [], thin = [];
  let floorDiff = 0, floorSame = 0;

  for (const era of eras) {
    const yrs = R.eraSeasons(era);
    if (yrs.length < 4) thin.push(`${era} ${yrs.length}`);
    const span = E.ERAS[era];
    if (yrs.some(y => y < span[0] || y > span[1])) thin.push(`${era} span leaks`);

    for (const [label, pick] of [
      ['best', (o) => o.slice().sort((a, b) => b.w - a.w)[0]],
      ['cheap', (o) => o.slice().sort((a, b) => a.p - b.p)[0]],
    ]) {
      const run = R.createRun({ era, seed: 5150 });
      let guard = 0, broke = null;
      while (run.phase === R.PHASES.DRAFT && guard++ < 40) {
        if (label === 'best') {
          const locked = R.fullFloor(run);
          const open = R.fullFloor({ ...run, era: null });
          if (locked < open - 1e-9) stranded.push(`${era}: the era floor came in under the league floor`);
          if (Math.abs(locked - open) < 1e-9) floorSame++; else floorDiff++;
        }
        let draw;
        try { draw = R.spin(run, data); } catch (e) { broke = 'spin: ' + e.message; break; }
        const opts = draw.options.map(k => data.allPlayers[k]).filter(Boolean);
        if (!opts.length) { broke = 'empty board'; break; }
        try { R.sign(run, pick(opts)); } catch (e) { broke = 'sign: ' + e.message; break; }
      }
      if (broke || run.roster.length !== E.SLOTS.length) {
        stranded.push(`${era}/${label}: ${broke || 'stalled at ' + run.roster.length}`);
        continue;
      }
      if (!run.roster.every(p => p.s >= span[0] && p.s <= span[1])) {
        stranded.push(`${era}/${label}: signed somebody from another decade`);
      }
    }
  }
  is(thin, [], 'every decade on offer has at least four seasons in the data');
  is(stranded, [], 'every decade finishes a draft on both strategies, off its own seasons');
  /* AND THE ERA FLOOR IS THE LEAGUE FLOOR, EVERY TIME, which is the opposite
     of what the club sweep found and is worth writing down rather than
     asserting a difference that does not exist.
     Measured: a decade holds between 1,252 and 3,696 rows and between 34 and
     121 men priced at the minimum, at every position, so the cheapest legal
     bodies cost the same SLOTS.length x $2.0M whether the pool is one decade
     or all of them. 0 of 30 readings differ. So scoping the floor to an era is
     defensive on its own.
     It is NOT defensive when the two locks COMPOSE, and that is the case
     worth keeping it for: the Lakers in the eighties floor at $19.9M against
     the league's $12.0M, so a floor that honoured the club and ignored the
     decade would be quoting $7.9M that this run cannot spend. */
  is(floorDiff, 0, 'an era alone never moves the reserve floor, because every '
    + 'decade holds minimum-priced men at every position');
  /* Six eras times SLOTS.length, derived rather than written: this read 36
     while the roster was six men and the number is about the sweep rather
     than about the game. */
  const eraReadings = 6 * E.SLOTS.length;
  ok(floorSame === eraReadings,
    `all ${eraReadings} era floor readings were taken (${floorSame})`);

  const both = R.createRun({ club: 'LAL', era: 'eighties' });
  const codes = new Set(E.franchiseCodes('LAL'));
  const dr = R.drawable(both, data);
  ok(dr.length > 4 && dr.every(t => codes.has(t.team) && t.season >= 1980 && t.season <= 1989),
    `a club and a decade together are both honoured (${dr.length} Showtime seasons)`);
  const composed = R.fullFloor(both);
  const clubOnly = R.fullFloor({ ...both, era: null });
  ok(composed > clubOnly + 1,
    `composing the two locks moves the floor that neither moves alone `
    + `($${composed.toFixed(1)}M against $${clubOnly.toFixed(1)}M)`);

  let threw = false;
  try { R.createRun({ era: 'the nineteen fifties' }); } catch (e) { threw = true; }
  ok(threw, 'an era nobody declared is refused');
}

/* ── A FIELD THE PAGE READS OFF AN OUTCOME HAS TO BE A FIELD OUTCOMES HAVE ──
 *
 * `out.spendLeft` was read on the results screen and `outcomeOf` has never set
 * it. `undefined > 15` is false, so on every run this game has ever played the
 * branch behind it was dead and the cap advice, which is the central lesson of
 * the whole thing, never once appeared: a draft that finished $88M under the
 * cap was told its roster had no shape. Nothing threw, nothing rendered wrong,
 * and no check could see it.
 *
 * So the whole class is checked rather than the one name. A real outcome is
 * built here and every `out.<field>` in the page has to be one of its keys.
 *
 * TWO NAMES ARE WHITELISTED and both are array methods on a DIFFERENT local
 * called `out`. That is the cost of matching on a variable name, and it is
 * worth paying: the alternative is parsing the page, and a phantom field is
 * exactly what this is for. Rename either local and this list needs a look.
 */
{
  const ARRAY_USES = new Set(['length', 'push']);
  const run = R.createRun({ seed: 31337 });
  let guard = 0;
  while (run.phase === R.PHASES.DRAFT && guard++ < 40) {
    const draw = R.spin(run, data);
    const opts = draw.options.map(k => data.allPlayers[k]).filter(Boolean);
    R.sign(run, opts.slice().sort((a, b) => b.w - a.w)[0]);
  }
  const outcome = R.playSeason(run);
  const keys = new Set(Object.keys(outcome));
  ok(keys.size > 10, `an outcome has fields to check against (${keys.size})`);

  /* COMMENTS COME OUT FIRST, and the first version of this did not do that,
     so it failed on the comment ABOVE the fix explaining what the phantom
     field had been. "If this checker reports a problem inside a comment, that
     is the bug, not the comment", which check-copy.mjs learned twice.
     Block comments only: a line comment strip would eat the rest of any line
     holding a `https://` and could swallow a real read with it. My mention
     was a block comment and so is every long one in this repo. */
  const src = fs.readFileSync(path.join(HERE, 'index.html'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ');
  const read = new Set();
  for (const m of src.matchAll(/\bout\.([A-Za-z_$][\w$]*)/g)) read.add(m[1]);
  const phantom = [...read].filter(f => !keys.has(f) && !ARRAY_USES.has(f)).sort();
  is(phantom, [], 'the results screen reads no field an outcome does not carry');
  /* The scan has to be finding something, or a broken regex passes green.
     Same reason check-numbers records its coverage counts. */
  ok(read.size >= 10, `the outcome scan found real reads (${read.size})`);
}

/* ── THE FLOOR IS UNDER THE CLUB, NOT REPLACED BY IT ────────────────────────
 *
 * The court is a hardwood floor now: seven background layers, of which the
 * top one is a tint on a custom property and the six under it are the wood.
 * Before that it was one flat gradient, and `body.clubbed .court` said
 * `background:` and replaced the lot.
 *
 * SO THE ONE REGRESSION WORTH GUARDING IS A SECOND `background` ON THE CLUB
 * RULE. Write one and every plank goes when a club lands, which is a court
 * that looks perfectly fine in the state a developer opens it in (nothing is
 * drawn until a club reel lands) and flat in the state a player is in for the
 * whole draft. Nothing throws and no other check here opens the page.
 *
 * The other half is the three courts. The home screen, the draft and the
 * results each carry one, and every part of the floor is markup: an apron, a
 * backboard and two corner threes added to one of them and not the others is
 * two courts in one game. Counted rather than named, so the next part added
 * is covered without anybody remembering this section exists.
 */
{
  const src = fs.readFileSync(path.join(HERE, 'index.html'), 'utf8');

  const club = /body\.clubbed \.court\{([^}]*)\}/.exec(src);
  ok(!!club, 'a club still repaints the court');
  if (club) {
    ok(/--floor-tint\s*:/.test(club[1]), 'and it does it through the tint layer');
    ok(!/(^|;)\s*background\s*:/.test(club[1]),
      'and never by replacing the background, which takes the boards with it');
  }

  /* ANCHORED ON THE TINT, because `.court` has three other rules and the
     first of them is an aspect ratio inside a media query. A regex for the
     selector alone reads that one and reports a floor with no boards in it,
     which is what the first draft of this did. */
  const floor = /\n\s*\.court\{([^}]*var\(--floor-tint\)[^}]*)\}/.exec(src);
  ok(!!floor, 'the court draws its own floor');
  if (floor) {
    /* The wood is the planks, the seams and the grain, which is three
       repeating gradients. Counted rather than matched, because their
       periods are tuning and the count is the claim. */
    const repeats = (floor[1].match(/repeating-linear-gradient/g) || []).length;
    ok(repeats >= 3, `and under it a floor made of boards (${repeats} repeats)`);
  }

  const courts = (src.match(/<div class="court[ "]/g) || []).length;
  ok(courts === 3, `three courts on this page (${courts})`);
  for (const part of ['oob', 'bb', 'c3 l', 'c3 r', 'base', 'side']) {
    const n = (src.match(new RegExp('class="' + part + '"', 'g')) || []).length;
    is(n, courts, `every court has its ${part}`);
  }
}

/* ── A STRAIGHT COLUMN OF DIGITS IS A FEATURE, NOT A TYPEFACE ───────────────
 *
 * This page was set in a code face. `--mono` was `ui-monospace` and 39 rules
 * reached for it, which is more than the display face was used, and every one
 * of the 39 was a NUMBER: a price, a record, a scoreline, a win share total,
 * a streak. The Perfect Season, which this game is a reskin of, uses a
 * monospace exactly zero times and sets the same figures in its own faces.
 *
 * What all 39 wanted was for digits to line up in a column, and
 * `font-variant-numeric: tabular-nums` does that in ANY face. Reaching for a
 * typewriter to get a straight line buys a whole voice nobody asked for.
 *
 * TWO THINGS ROT HERE AND BOTH ARE SILENT. A monospace can come back, because
 * it is the reflex for a number and this page has thirty-odd sites where the
 * next one lands. And a rule that asks for `--num` and forgets the feature
 * renders a perfectly good number in a slightly wrong column, which nothing
 * anywhere reports and no screenshot argues with.
 *
 * SO THE SECOND CLAIM IS ABOUT THE PAIR, never about one rule: `--num` is
 * only there to carry the figures, so a rule that names it and no feature is
 * a rule that has forgotten what it is for. Hero figures on the display face
 * are checked the same way, because the display face is the other half of the
 * split and the same reflex misses it.
 *
 * The page's own `--mono` is gone and `how-to-play.html`'s went with it: an
 * unused variable is the next person's invitation.
 */
{
  const pages = ['index.html', 'how-to-play.html'];
  for (const page of pages) {
    const raw = fs.readFileSync(path.join(HERE, page), 'utf8');
    /* Comments out first. This very section names the thing it forbids, and
       the last three extractors in this repo to read a comment as code each
       reported a problem that was a paragraph. */
    const src = raw.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');

    ok(!/monospace/.test(src), `${page} reaches for no code face`);
    ok(!/var\(--mono\)|--mono\s*:/.test(src), `${page} has no mono variable left`);

    /* Every declaration block that sets one of the two number faces. The
       body face is excluded: it is the page's default and is set on plenty
       of things that are prose. */
    const blocks = [...src.matchAll(/\{([^{}]*font-family\s*:\s*var\(--(?:num|display)\)[^{}]*)\}/g)];
    if (page === 'index.html') {
      ok(blocks.length >= 30, `${page}: the font scan found real rules (${blocks.length})`);
    }
    const bare = blocks
      .filter(b => /var\(--num\)/.test(b[1]) && !/tabular-nums/.test(b[1]))
      .map(b => b[1].trim().slice(0, 60));
    is(bare, [], `${page}: every rule on the number face asks for tabular figures`);
  }

  /* The utility class went with the variable. `.mono` pointing at a face that
     is not a monospace is a name that lies to whoever reads the markup. */
  const idx = fs.readFileSync(path.join(HERE, 'index.html'), 'utf8');
  ok(!/class="[^"]*\bmono\b/.test(idx), 'and nothing in the markup is still called mono');
}

/* ── A SHARED RESULT HAS TO SAY WHICH GAME IT WAS, AND THE DAY HAS TO COUNT ─
 *
 * Four things live in this section and every one of them fails in silence.
 *
 * THE TAGLINE. The football game's share card fell through to "Classic Mode.
 * Six spins, one roster" THREE separate times, once per mode added after it
 * was written, and its own CLAUDE.md section records each one. The card
 * rendered perfectly every time; it simply described a game the player had
 * not played. The defence is not a fourth branch, it is a check that every
 * mode's answer is different from every other mode's, so the fifth door
 * cannot inherit the fourth's words either.
 *
 * THE DAY NUMBER. Today's run is one seed for everybody, so the whole mode
 * rests on two people in one group chat computing the same number from the
 * same date. An off-by-one across a daylight saving change gives them
 * different puzzles and neither of them anything to compare, and nothing
 * anywhere throws: both pages play a perfectly good game.
 *
 * THE STREAK. A day counted twice, or a gap that does not reset, is a number
 * that is simply wrong and looks exactly like a number that is right.
 *
 * THE BADGE DIFF. It is the only place in this game that answers "what just
 * happened" rather than "what is true", and asked one line later it answers
 * nothing at all, correctly and uselessly.
 *
 * THE FUNCTIONS ARE LIFTED OUT OF THE SHIPPED PAGE, never copied here. A copy
 * of the arithmetic is a second implementation that agrees with itself, which
 * is the exact failure mythiball's send curve had for as long as its sweep
 * carried a hand-written duplicate of the curve it was sweeping.
 */
{
  const pageSrc = fs.readFileSync(path.join(HERE, 'index.html'), 'utf8');

  /* Brace-matched rather than regexed to a closing line, because two of these
     hold an object literal and a `}` at the start of a line inside one would
     cut the function in half and then fail to parse, which reads as a broken
     page rather than a broken reader. */
  const fnSource = (name) => {
    const head = pageSrc.indexOf('function ' + name + '(');
    if (head < 0) return null;
    let i = pageSrc.indexOf('{', head), depth = 0;
    for (let j = i; j < pageSrc.length; j++) {
      if (pageSrc[j] === '{') depth++;
      else if (pageSrc[j] === '}' && --depth === 0) return pageSrc.slice(head, j + 1);
    }
    return null;
  };
  /* COVERAGE IS HALF THE CHECK. A reader that finds nothing would let every
     assertion below pass vacuously, which is how an extractor in this repo
     has been silently wrong three times. */
  const WANT = ['cardTag', 'dayNumberOf', 'dailySeed', 'dailyRecord',
    'freshBadges', 'bestsSet', 'shareDare'];
  /* NUMWORD is not in WANT because it is not a `function` declaration but a
     `var` holding one, and it is lifted separately below. It is the page's one
     place that turns a roster count into an English word, so every tagline
     here reaches for it and a lift without it throws rather than failing an
     assertion. */
  const missing = WANT.filter(n => !fnSource(n));
  is(missing, [], 'every function this section reads is still in the page');

  const lift = (name, names, vals) =>
    new Function(...names, fnSource(name) + '\nreturn ' + name + ';')(...vals);

  /* NUMWORD, lifted out of its `var` the same way and for the same reason as
     everything else here: a copy of it would agree with itself. */
  const numwordSrc = (() => {
    const head = pageSrc.indexOf('var NUMWORD = function(');
    if (head < 0) return null;
    let i = pageSrc.indexOf('{', head), depth = 0;
    for (let j = i; j < pageSrc.length; j++) {
      if (pageSrc[j] === '{') depth++;
      else if (pageSrc[j] === '}' && --depth === 0) return pageSrc.slice(head, j + 1) + ';';
    }
    return null;
  })();
  ok(!!numwordSrc, 'the page still carries NUMWORD, which every tagline reads');
  const NUMWORD = numwordSrc
    ? new Function(numwordSrc + '\nreturn NUMWORD;')()
    : ((n) => String(n));
  if (numwordSrc) {
    /* IT IS THE ONE PLACE A ROSTER COUNT BECOMES A WORD, so it is asserted to
       answer the roster this game actually drafts. A page saying "six" on a
       five man game is the exact failure it exists to prevent. */
    is(NUMWORD(E.SLOTS.length), ['zero', 'one', 'two', 'three', 'four', 'five',
      'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'][E.SLOTS.length],
      'NUMWORD spells the roster size');
    is(NUMWORD(5, true), 'Five', 'and capitalises for the start of a sentence');
  }

  /* ---- the tagline names the mode ---- */
  if (fnSource('cardTag')) {
    const ERA_NAMES = { eighties: 'The Eighties', nineties: 'The Nineties' };
    const cardTag = lift('cardTag', ['E', 'ERA_NAMES', 'NUMWORD'], [E, ERA_NAMES, NUMWORD]);
    const league = cardTag({});
    const club = cardTag({ club: 'CHI' });
    const era = cardTag({ era: 'eighties' });
    const daily = cardTag({ daily: 12 });
    const all = [league, club, era, daily];
    ok(all.every(s => typeof s === 'string' && s.length > 10),
      'every mode gets a tagline');
    is(new Set(all).size, 4, 'no two modes share a tagline');
    ok(club.includes(E.team('CHI').full), 'the One Franchise tagline names the club');
    ok(era.includes('Eighties'), 'the Decades tagline names the decade');
    ok(daily.includes('12'), "the daily tagline names the day");
    /* THE LEAGUE SENTENCE IS THE ONE THAT FELL THROUGH IN THE OTHER GAME, so
       it is the one asserted to appear nowhere else: a locked run wearing it
       is the whole defect, written as a property rather than as a string. */
    ok(![club, era, daily].some(s => s === league),
      'no locked mode falls through to the league tagline');
  }

  /* ---- the dare ---- */
  if (fnSource('shareDare')) {
    const mk = (r) => lift('shareDare', ['run', 'E', 'NUMWORD'], [r, E, NUMWORD]);
    const plain = mk(null)({ isGOAT: false, titleWon: false });
    const day = mk({ daily: 3 })({ isGOAT: false, titleWon: false });
    ok(plain !== day, 'the daily dares differently from an ordinary run');
    ok(mk(null)({ isGOAT: true, titleWon: true }) !== plain,
      'a 74 win run is dared differently from an ordinary one');
  }

  /* ---- the day number ---- */
  if (fnSource('dayNumberOf')) {
    const epoch = /var DAILY_EPOCH = '(\d{4}-\d{2}-\d{2})'/.exec(pageSrc);
    ok(!!epoch, 'the page declares a daily epoch');
    const dayNumberOf = lift('dayNumberOf', ['DAILY_EPOCH'], [epoch[1]]);
    is(dayNumberOf(epoch[1]), 1, 'the epoch is day 1');

    /* A WHOLE YEAR, ONE DAY AT A TIME, which is the only way to see a
       daylight saving change. The US moves its clocks in March and November,
       and the difference between two LOCAL midnights across those nights is
       23 or 25 hours, which floors to the wrong day and hands two players in
       one group chat different puzzles, with nothing anywhere throwing.
     *
     * IT HAS TO RUN IN A ZONE THAT HAS A CLOCK CHANGE, and that is why this
     * is a child process rather than a loop here. Node reads TZ once, this
     * container runs in UTC, and under UTC the broken version of the
     * function is correct: swapping Date.UTC for a local Date passed the
     * whole suite green. A check that can only pass is worth nothing. */
    /* IT IS SWEPT OVER BOTH KINDS OF EPOCH, and the first draft was not, and
       passed on the broken version. With the epoch in summer the hour a local
       clock loses in March never pushes the division past a day boundary, so
       every answer happens to come out right. With the epoch in WINTER it is
       wrong by a whole day for every summer date. The epoch ships as one
       literal that somebody will move, so the claim has to be that the
       arithmetic is immune to a clock change for ANY epoch, not just for the
       one currently written down. */
    const probe = `
      const out = {};
      out.zone = new Date(2026, 6, 1).getTimezoneOffset()
        !== new Date(2026, 0, 1).getTimezoneOffset();
      for (const EP of ${JSON.stringify([epoch[1], '2026-01-15', '2026-07-15'])}) {
        /* DAILY_EPOCH is a free identifier inside the lifted function, so it
           is rebound per epoch by re-lifting rather than by assignment. */
        const f = new Function('DAILY_EPOCH',
          ${JSON.stringify(fnSource('dayNumberOf'))} + '; return dayNumberOf;')(EP);
        const steps = new Set();
        let prev = null;
        for (let i = 0; i < 400; i++) {
          const d = new Date(Date.UTC(2026, 0, 1) + i * 86400000);
          const n = f(d.toISOString().slice(0, 10));
          if (prev !== null) steps.add(n - prev);
          prev = n;
        }
        out[EP] = { steps: [...steps], epochIsDayOne: f(EP) === 1,
          spring: f('2026-03-09') - f('2026-03-07'),
          autumn: f('2026-11-02') - f('2026-10-31') };
      }
      console.log(JSON.stringify(out));`;
    const walk = JSON.parse(execFileSync(process.execPath, ['-e', probe],
      { env: { ...process.env, TZ: 'America/New_York' }, encoding: 'utf8' }));
    /* The probe reports whether it actually got a zone with a clock change in
       it, because a container with no time zone database silently gives UTC
       and this whole check would then be measuring nothing. */
    ok(walk.zone, 'the day walk really ran in a zone that changes its clocks');
    for (const ep of [epoch[1], '2026-01-15', '2026-07-15']) {
      is(walk[ep].steps, [1],
        `consecutive dates are consecutive days off a ${ep} epoch, across both clock changes`);
      ok(walk[ep].epochIsDayOne, `the ${ep} epoch is its own day 1`);
      is(walk[ep].spring, 2, `the spring change is two days wide off a ${ep} epoch`);
      is(walk[ep].autumn, 2, `the autumn change is two days wide off a ${ep} epoch`);
    }
  }

  /* ---- the seed ---- */
  if (fnSource('dailySeed')) {
    const dailySeed = lift('dailySeed', ['E'], [E]);
    is(dailySeed(7), dailySeed(7), 'one day is one seed');
    const seen = new Set();
    for (let d = 1; d <= 400; d++) seen.add(dailySeed(d));
    /* Not all-distinct, which a 32 bit hash cannot promise and which nothing
       depends on. What matters is that the day is really an input: a seed
       that ignored it would give one value for the whole set. */
    ok(seen.size > 390, `four hundred days give four hundred puzzles (${seen.size})`);
    ok([...seen].every(s => Number.isInteger(s) && s >= 0),
      'every daily seed is a whole non-negative number');
  }

  /* ---- the streak ---- */
  if (fnSource('dailyRecord')) {
    let stored = null, today = 1;
    const dailyRecord = lift('dailyRecord',
      ['todayNumber', 'dailyState', 'dailyPut', 'easternISO', 'headline'],
      [() => today, () => stored, (s) => { stored = s; },
        () => '2026-01-01', () => 'Lost the play-in']);
    const play = (day, wins) => {
      today = day;
      return dailyRecord({ wins, losses: 82 - wins, rating: 50, titleWon: false });
    };
    is(play(1, 40).streak, 1, 'a first daily is a streak of one');
    is(play(2, 44).streak, 2, 'the next day continues it');
    is(play(3, 41).streak, 3, 'and the next');
    /* THE DAY IS THE GUARD, NOT THE COUNT. Playing today twice must not be a
       second day, and the whole mode rests on it: a door that could be
       pressed again would hand out a second attempt at the same puzzle and
       take the comparison with it. */
    is(play(3, 60).streak, 3, 'the same day played twice is still one day');
    is(stored.wins, 41, 'and the second attempt is not filed over the first');
    is(play(5, 50).streak, 1, 'a missed day starts again at one');
    is(stored.bestStreak, 3, 'the best streak survives the reset');
    is(stored.best, 50, 'the best daily record is kept across days');
    is(stored.played, 4, 'and a replayed day is not counted as a run');
  }

  /* ---- what just lit ---- */
  if (fnSource('freshBadges')) {
    const fake = { earned: (c) => (c.runs >= 2 ? [{ id: 'a' }, { id: 'b' }] : [{ id: 'a' }]) };
    const fresh = lift('freshBadges', ['window'], [{ RTF_BADGES: fake }]);
    is(fresh({ runs: 1 }, { runs: 2 }).map(b => b.id), ['b'],
      'only the badge that just lit is reported');
    is(fresh({ runs: 2 }, { runs: 2 }), [], 'a badge already held is not reported again');
    /* A BLOCKED SCRIPT COSTS A ROW, NEVER THE SCREEN. badges.js loads beside
       the page, so it can be absent the same way board.js can in the football
       game, and there it took the whole leaderboard down. */
    is(lift('freshBadges', ['window'], [{}])({}, {}), [],
      'a missing badges.js costs the row and nothing else');
    is(lift('freshBadges', ['window'], [{ RTF_BADGES: { earned(){ throw new Error('x'); } } }])({}, {}),
      [], 'and a throwing one costs the same');

    /* Against the REAL catalog, because the fake above only proves the diff
       and not that the diff is asked of something with badges in it. */
    const B = require(path.join(HERE, 'badges.js'));
    const real = lift('freshBadges', ['window'], [{ RTF_BADGES: B }]);
    const lit = real({}, { runs: 1, rows: [{ w: 40, l: 42 }] });
    ok(lit.length >= 1 && lit.some(b => b.id === 'first-run'),
      'a first finished run lights at least the first badge');
    is(real({ runs: 1, rows: [{ w: 40, l: 42 }] }, { runs: 1, rows: [{ w: 40, l: 42 }] }), [],
      'and the same career against itself lights nothing');
  }

  /* ---- the marks a run sets ---- */
  if (fnSource('bestsSet')) {
    const ERA_NAMES = { eighties: 'The Eighties' };
    const mk = (r, day) => lift('bestsSet',
      ['run', 'E', 'ERA_NAMES', 'dailyState', 'todayNumber', 'dailyIsToday'],
      [r, E, ERA_NAMES, () => day || null, () => 10,
        () => !!(r && r.daily && r.daily === 10)]);
    const outc = (wins, ring) => ({ wins, losses: 82 - wins, titleWon: !!ring });

    /* A FIRST RUN SETS NO RECORD. It is trivially the best of one, and a
       screen congratulating somebody for beating nobody is the unearnable
       badge in reverse. */
    is(mk({})({ runs: 0, bestWins: 0, rings: 0 }, outc(60)).length, 0,
      'a first run claims no career best');
    const beat = mk({})({ runs: 3, bestWins: 50, bestLabel: '50-32', rings: 1 }, outc(60));
    ok(beat.some(m => /Career best/.test(m.text)), 'beating the career best is marked');
    ok(beat.some(m => /50-32/.test(m.text)), 'and it names what was beaten');
    is(mk({})({ runs: 3, bestWins: 60, bestLabel: '60-22', rings: 1 }, outc(60)).length, 0,
      'tying the career best is not beating it');
    ok(mk({})({ runs: 3, bestWins: 70, rings: 0 }, outc(45, true))
      .some(m => m.kind === 'ring'), 'a first ring is marked');
    is(mk({})({ runs: 3, bestWins: 70, rings: 2 }, outc(45, true))
      .filter(m => m.kind === 'ring').length, 0, 'a second ring is not a first one');

    /* A SHELF HAS TO HAVE BEEN STOOD ON. The first Bulls run is the best
       Bulls run by default and saying so is noise. */
    is(mk({ club: 'CHI' })({ runs: 3, bestWins: 70, rings: 1, byClub: {} }, outc(60))
      .filter(m => /Bulls/.test(m.text)).length, 0, 'a first club run claims no club best');
    ok(mk({ club: 'CHI' })({ runs: 3, bestWins: 70, rings: 1,
      byClub: { CHI: { runs: 2, bestWins: 50, bestLabel: '50-32' } } }, outc(60))
      .some(m => /Bulls/.test(m.text)), 'beating a club best is marked');
    ok(mk({ era: 'eighties' })({ runs: 3, bestWins: 70, rings: 1,
      byEra: { eighties: { runs: 2, bestWins: 50, bestLabel: '50-32' } } }, outc(60))
      .some(m => /Eighties/.test(m.text)), 'beating a decade best is marked');

    /* THE STREAK MARK IS READ OFF YESTERDAY, because the run being marked has
       not been filed yet. Read off today it would always be one. */
    const cont = mk({ daily: 10 }, { played: 4, streak: 3, lastDone: 9, best: 70 })
      ({ runs: 3, bestWins: 70, rings: 1 }, outc(60));
    ok(cont.some(m => m.kind === 'streak' && /4 days/.test(m.text)),
      'a continued streak is marked with the day it is about to become');
    is(mk({ daily: 10 }, { played: 4, streak: 3, lastDone: 4, best: 70 })
      ({ runs: 3, bestWins: 70, rings: 1 }, outc(60)).filter(m => m.kind === 'streak').length,
      0, 'a broken streak is not marked at all');

    /* A DRAFT LEFT OVERNIGHT IS NOT TODAY'S RUN. Started on day 9, finished
       on day 10, it carries daily: 9. Marked as today it would claim a
       streak day for a board nobody else was playing; marked as day 9 it
       would walk the streak backwards. It claims neither. */
    is(mk({ daily: 9 }, { played: 4, streak: 3, lastDone: 9, best: 40 })
      ({ runs: 3, bestWins: 70, rings: 1 }, outc(60))
      .filter(m => m.kind === 'streak' || /daily/.test(m.text)).length, 0,
      'a stale daily finished the next day claims no day and no streak');
  }
}

/* ── THE MIGRATION HARDCODES THE ENGINE, AND NOTHING WAS CHECKING IT ───────
 *
 * supabase/108_hoops_leaderboard.sql owns every derived field on a board row,
 * which means it has to know the rules: how long a season is, how many wins
 * reach the play-in and the top six, how many series each bracket is, what 72
 * and 74 mean, and what the cap is. Those are LITERALS in that file, on
 * purpose, so it can be read on its own and pasted into a SQL editor with no
 * dependency. The comment above them says "MUST MATCH hoops/engine.js
 * CONSTANTS" and until this section nothing made that true.
 *
 * IT FAILS IN THE WORST DIRECTION. Move TOP_SIX_WINS in the engine and the
 * game starts producing seasons the server labels with the other seed, or
 * refuses outright for a bracket that is now the wrong length. The page fails
 * soft, so a refused run resolves to null and the screen says the board is not
 * reachable: a live, correct game whose leaderboard quietly stopped accepting
 * anything, reported by nobody, because that is exactly what a board looks
 * like before the migration has been run.
 *
 * The score is the other half. board.js recomputes the stored generated column
 * locally, because the results screen counts the runs ahead of you before the
 * insert has come back, so a client that shifts a differential differently
 * from the column counts against a number that is not in anybody's row.
 */
{
  const sql = fs.readFileSync(path.join(HERE, '..', 'supabase', '108_hoops_leaderboard.sql'), 'utf8');
  const boardSrc = fs.readFileSync(path.join(HERE, 'board.js'), 'utf8');
  const pageSrc = fs.readFileSync(path.join(HERE, 'index.html'), 'utf8');

  /* Read as `NAME constant int := 82;`, which is the one form that file uses.
     A miss answers undefined and fails the comparison below rather than
     passing quietly, which is the right way round for a reader that could be
     looking at a renamed constant. */
  const sqlConst = (name) => {
    const m = new RegExp(name + '\\s+constant\\s+\\w+\\s*:=\\s*([0-9.]+)').exec(sql);
    return m ? Number(m[1]) : undefined;
  };
  const PAIRS = [
    ['RTF_REG_GAMES', E.CONSTANTS.REGULAR_SEASON_GAMES, 'the season length'],
    ['RTF_PLAY_IN_WINS', E.CONSTANTS.PLAY_IN_WINS, 'the play-in line'],
    ['RTF_TOP_SIX_WINS', E.CONSTANTS.TOP_SIX_WINS, 'the top six line'],
    ['RTF_ROUNDS_SEEDED', E.CONSTANTS.PLAYOFF_ROUNDS_SEEDED, 'a seeded bracket'],
    ['RTF_ROUNDS_PLAYIN', E.CONSTANTS.PLAYOFF_ROUNDS_PLAY_IN, 'a play-in bracket'],
    ['RTF_RECORD_WINS', E.CONSTANTS.RECORD_WINS, 'the record'],
    ['RTF_GOAT_WINS', E.CONSTANTS.GOAT_WINS, 'the one nobody has done'],
    ['RTF_CAP_MUSD', E.CONSTANTS.CAP_MUSD, 'the cap'],
  ];
  /* COVERAGE FIRST. A reader that finds nothing lets all eight comparisons
     pass against undefined === undefined, which is how an extractor in this
     repo has been silently wrong three times. */
  ok(PAIRS.every(([n]) => sqlConst(n) !== undefined),
    'the migration still declares every constant this checks'
    + ' (' + PAIRS.filter(([n]) => sqlConst(n) === undefined).map(([n]) => n).join(', ') + ')');
  for (const [name, engineValue, what] of PAIRS) {
    is(sqlConst(name), engineValue, `the migration and the engine agree on ${what}`);
  }

  /* THE DAILY EPOCH LIVES IN TWO FILES and has to, because one is deployed by
     hand and the other by a push. Day 1 meaning two different days is a board
     whose rows are filed under a day nobody else is playing. */
  const pageEpoch = /var DAILY_EPOCH = '(\d{4}-\d{2}-\d{2})'/.exec(pageSrc);
  const sqlEpoch = /RTF_DAILY_EPOCH\s+constant\s+date\s*:=\s*date\s*'(\d{4}-\d{2}-\d{2})'/.exec(sql);
  ok(!!pageEpoch && !!sqlEpoch, 'the page and the migration each declare a daily epoch');
  if (pageEpoch && sqlEpoch) {
    is(sqlEpoch[1], pageEpoch[1], 'and they are the same day');
  }

  /* The slot names the server will accept have to be the slots the game
     drafts, or a legal roster is refused by a regex. */
  const slotList = /where s not in \(([^)]*)\)/.exec(sql);
  ok(!!slotList, 'the migration lists the slots it accepts');
  if (slotList) {
    const named = slotList[1].match(/'([^']+)'/g).map((s) => s.slice(1, -1)).sort();
    is(named, E.SLOTS.slice().sort(), 'and they are the slots the game drafts');
  }

  /* ---- the score, in two places ---- */
  const nums = /wins::int \* (\d+)\s*\+ least\((\d+), greatest\((\d+), round\(\(point_diff \+ (\d+)\) \* (\d+)\)/
    .exec(sql);
  ok(!!nums, 'the score column is still written the way this reads it');
  if (nums) {
    const [, mul, cap, floor, shift, scale] = nums.map(Number);
    const fromSql = (wins, diff) =>
      wins * mul + Math.min(cap, Math.max(floor, Math.round((diff + shift) * scale)));
    /* board.js's own copy, lifted out of the shipped file rather than
       rewritten here, for the reason the whole repo distrusts a second
       implementation: a copy of the arithmetic agrees with itself. */
    const head = boardSrc.indexOf('function scoreOf(');
    let depth = 0, end = -1;
    for (let j = boardSrc.indexOf('{', head); j < boardSrc.length; j++) {
      if (boardSrc[j] === '{') depth++;
      else if (boardSrc[j] === '}' && --depth === 0) { end = j + 1; break; }
    }
    ok(head >= 0 && end > head, 'board.js still has a scoreOf to compare against');
    const roundTo = (n, places) => {
      const f = Math.pow(10, places);
      const v = Number(n) * f;
      return (v < 0 ? -Math.round(-v) : Math.round(v)) / f;
    };
    const scoreOf = new Function('round1',
      boardSrc.slice(head, end) + '\nreturn scoreOf;')((n) => roundTo(n, 1));

    let worst = null;
    for (let w = 0; w <= 82; w++) {
      for (let d = -20; d <= 20; d += 0.1) {
        const diff = roundTo(d, 1);
        if (scoreOf(w, diff) !== fromSql(w, diff) && !worst) worst = [w, diff];
      }
    }
    is(worst, null, 'the client and the column compute the same score everywhere');

    /* AND THE PROPERTY THE SHIFT AND THE CLAMP EXIST FOR. A differential can
       never carry into the wins digit, so a 49 win blowout never outranks a
       50 win grind. Swept rather than spot-checked, because the failure is a
       differential wide enough to reach the next multiple and that is a
       question about the whole range. */
    let carried = null;
    for (let w = 0; w < 82; w++) {
      const best = scoreOf(w, 60), worstNext = scoreOf(w + 1, -60);
      if (best >= worstNext && !carried) carried = [w, best, worstNext];
    }
    is(carried, null, 'one more win always outranks any differential');
  }

  /* THE MODES THE SERVER ACCEPTS ARE THE DOORS THE GAME HAS, and the table's
     own check constraint is the list. A door added to the page and not here
     is a run refused on submit with nothing said to the player. */
  const modeChk = /run_mode in \(([^)]*)\)\)/.exec(sql);
  ok(!!modeChk, 'the table constrains run_mode to a list');
  if (modeChk) {
    const modes = modeChk[1].match(/'([^']+)'/g).map((s) => s.slice(1, -1)).sort();
    is(modes, ['club', 'daily', 'era', 'league'],
      'and it is the four doors the page draws');
    /* The client's own allowlist, which is what stops a caller putting text
       into a query, has to be the same four. */
    const doors = /const DOORS = \[([^\]]*)\]/.exec(boardSrc);
    ok(!!doors, 'board.js has its own list of doors');
    if (doors) {
      is(doors[1].match(/'([^']+)'/g).map((s) => s.slice(1, -1)).sort(), modes,
        'and board.js allows exactly those');
    }
  }
}

/* ── THE BOX SCORE ADDS UP, OR IT IS NOT A BOX SCORE ────────────────────────
 *
 * Six identities, and all six are the kind a reader checks by eye in two
 * seconds. A box score whose field goals do not produce its points, or whose
 * minutes do not fill the game, is the most obvious wrong thing this site
 * could print, so every one of them is asserted over a real season rather
 * than on a fixture.
 *
 * IT IS A DECOMPOSITION AND THE FIRST ASSERTION IS THE ONE THAT SAYS SO. The
 * points column has to equal the scoreline resolveGame already settled. That
 * is what stops this becoming a second model of the same game, which is the
 * fault verify caught once already when the animated season and the instant
 * season disagreed off one seed.
 */
{
  const run = R.createRun({ seed: 8191 });
  let guard = 0;
  while (run.phase === R.PHASES.DRAFT && guard++ < 40) {
    const draw = R.spin(run, data);
    const opts = draw.options.map(k => data.allPlayers[k]).filter(Boolean);
    R.sign(run, opts.slice().sort((a, b) => b.w - a.w)[0]);
  }
  const tagged = run.roster.map((p, i) => ({ ...p, _slot: E.SLOTS[run.slotIndex[i]] }));
  R.playSeason(run);

  const rng = E.createSeededRNG(4242);
  const bad = { sum: [], identity: [], attempts: [], minutes: [], quarters: [], level: [] };
  let otSeen = 0, lines = 0;

  for (const gm of run.season) {
    const ot = gm.ot || 0;
    const box = E.gameBox(tagged, gm.yourPoints, rng, ot);

    const pts = box.reduce((s, l) => s + l.pts, 0);
    if (pts !== gm.yourPoints) bad.sum.push(`${pts} against a ${gm.yourPoints} point game`);

    const mins = box.reduce((s, l) => s + l.min, 0);
    if (mins !== 240 + ot * 25) bad.minutes.push(`${mins} for ${4 + ot} periods`);
    for (const l of box) {
      lines++;
      /* Two pointers, threes and free throws are his points. Nothing else. */
      if (2 * (l.fgm - l.tpm) + 3 * l.tpm + l.ftm !== l.pts) {
        bad.identity.push(`${l.n}: ${l.fgm}fg ${l.tpm}3p ${l.ftm}ft is not ${l.pts}`);
      }
      if (l.fgm > l.fga || l.tpm > l.tpa || l.tpm > l.fgm || l.ftm > l.fta) {
        bad.attempts.push(`${l.n} made more than he took`);
      }
      if (l.min > 48 + ot * 5 || l.min < 1) bad.minutes.push(`${l.n} played ${l.min}`);
      if (l.pts < 0 || l.reb < 0 || l.ast < 0) bad.attempts.push(`${l.n} went negative`);
    }

    const q = E.quarterLines(gm.yourPoints, gm.oppPoints, ot, rng);
    const sum = (a) => a.reduce((x, y) => x + y, 0);
    if (sum(q.yours) !== gm.yourPoints || sum(q.theirs) !== gm.oppPoints) {
      bad.quarters.push(`${sum(q.yours)}-${sum(q.theirs)} against ${gm.yourPoints}-${gm.oppPoints}`);
    }
    if (q.yours.length !== 4 + ot || q.names.length !== 4 + ot) {
      bad.quarters.push(`${q.yours.length} periods for ${ot} overtimes`);
    }
    if (ot) {
      otSeen++;
      /* THE ONE THAT IS NOT OBVIOUS. resolveGame breaks a tie by adding points
         to one side, so a game that went to overtime WAS level at the buzzer.
         Quarters that do not add up to a tie there are describing a different
         game from the one on the scoreboard. */
      if (sum(q.yours.slice(0, 4)) !== sum(q.theirs.slice(0, 4))) {
        bad.level.push(`${sum(q.yours.slice(0, 4))}-${sum(q.theirs.slice(0, 4))} at the end of regulation`);
      }
      if (q.yours.slice(4).some(v => v <= 0) || q.theirs.slice(4).some(v => v <= 0)) {
        bad.level.push('somebody was shut out of an overtime');
      }
    }
  }

  ok(lines > 400, `enough box score lines to be worth checking (${lines})`);
  is(bad.sum.slice(0, 2), [], 'the points column is the scoreline');
  is(bad.identity.slice(0, 2), [], "a man's shooting line produces his points");
  is(bad.attempts.slice(0, 2), [], 'nobody makes more than he takes');
  is(bad.minutes.slice(0, 2), [], 'the minutes column fills the game and nobody plays past the clock');
  is(bad.quarters.slice(0, 2), [], 'the quarters are the scoreline');
  ok(otSeen > 0, `overtime games in the sample to check (${otSeen})`);
  is(bad.level.slice(0, 2), [], 'an overtime game was level at the end of regulation');

  /* apportionCapped is the piece with real arithmetic in it and it was wrong
     on 73% of inputs when it pinned both bounds in one pass. Swept rather
     than sampled through a season, because the failure needs a particular
     shape of weights: three men who want almost nothing beside three who want
     everything. */
  {
     const swept = E.createSeededRNG(7);
     let broke = 0;
     for (let t = 0; t < 20000; t++) {
       const w = Array.from({ length: 6 }, () => Math.max(1, 10 + E.normal(swept) * 14));
       const ot = t % 7 === 0 ? 1 : 0;
       const total = 240 + ot * 25, hi = 48 + ot * 5, lo = E.BOX.MIN_FLOOR;
       const outp = E.apportionCapped(total, w, lo, hi);
       if (outp.reduce((s, v) => s + v, 0) !== total) broke++;
       else if (outp.some(v => v > hi || v < lo)) broke++;
     }
     is(broke, 0, 'a capped split hits its total inside its bounds, over 20,000 draws');
     /* Asked for something the bounds cannot hold, it has to stop rather than
        spin. Both directions, because the repair loop runs both ways. */
     is(E.apportionCapped(50, [1, 1, 1, 1, 1, 1], 18, 48), [18, 18, 18, 18, 18, 18],
       'a total below the floors settles on the floors');
     is(E.apportionCapped(400, [1, 1, 1, 1, 1, 1], 18, 48), [48, 48, 48, 48, 48, 48],
       'a total above the ceilings settles on the ceilings');
  }

  /* THE SAME GAME, OPENED TWICE, IS THE SAME GAME. gameDetail draws off the
     run's seed and the game's own address rather than a shared stream, which
     is what makes that true across a reload. A box score that rewrote itself
     every time the sheet opened would be a game that cannot remember what
     happened in it. */
  const ref = { kind: 'season', index: 12 };
  const a = R.gameDetail(run, ref), b = R.gameDetail(run, ref);
  ok(a && JSON.stringify(a.box) === JSON.stringify(b.box),
    'opening one game twice shows the same box score');
  const other = R.gameDetail(run, { kind: 'season', index: 13 });
  ok(other && JSON.stringify(a.box) !== JSON.stringify(other.box),
    'two different games are two different box scores');
  is(R.gameDetail(run, { kind: 'season', index: 9999 }), null, 'a game that is not there is null');
  is(R.gameDetail(run, { kind: 'playoff', round: 99, game: 0 }), null, 'so is a round that is not there');
  is(R.gameDetail(run, null), null, 'and so is nothing at all');

  /* THE WALK IS CHRONOLOGICAL, and the first version was not: it listed the
     playoffs first because that is the order the results screen draws them,
     so Next on a play-in game went back to game 3 of the regular season. */
  let outOfOrder = 0, lastIdx = -1, seenPlayoff = false, walked = 0;
  for (const g of R.bigGames(run)) {
    walked++;
    if (g.kind === 'season') {
      if (seenPlayoff || g.index <= lastIdx) outOfOrder++;
      lastIdx = g.index;
    } else seenPlayoff = true;
  }
  ok(walked > 10, `the big games list has something in it (${walked})`);
  is(outOfOrder, 0, 'the big games walk forwards through the season and into the playoffs');
  /* Every one of them has to open, or a Next lands on a blank sheet. */
  const dead = R.bigGames(run).filter(g => !R.gameDetail(run, g)).length;
  is(dead, 0, 'every game the walk offers actually opens');

  /* THE BEST NIGHT IS THE BEST NIGHT, checked against a brute force sweep of
     every game rather than against itself. It is the one number on the
     results screen derived by scanning the whole run, so an off-by-one in the
     scan would name the second best game and nothing would look wrong. */
  const night = R.bestNight(run);
  ok(!!night, 'a finished run has a best night');
  let top = -1;
  for (let i = 0; i < run.season.length; i++) {
    for (const l of R.gameDetail(run, { kind: 'season', index: i }).box) {
      if (l.pts > top) top = l.pts;
    }
  }
  if (run.playoffs && run.playoffs.rounds) {
    run.playoffs.rounds.forEach((rd, r) => (rd.games || []).forEach((g, gi) => {
      for (const l of R.gameDetail(run, { kind: 'playoff', round: r, game: gi }).box) {
        if (l.pts > top) top = l.pts;
      }
    }));
  }
  is(night.pts, top, 'the best night named is the best night there was');
  /* And it has to open on the game it claims, showing that man with that
     line. A link to the wrong game is the quietest way for this to be wrong. */
  const there = R.gameDetail(run, night.ref);
  ok(!!there, 'the best night links to a game that opens');
  ok(there && there.box.some(l => l.n === night.n && l.pts === night.pts),
    'the game it links to is the one he had that night in');
  is(R.bestNight(R.createRun({ seed: 1 })), null, 'a run with no season has no best night');
  is(R.bestNight(null), null, 'and neither does nothing at all');
}

/* THE ALL TIME RANK INSERTS YOUR TEAM, SO THE DENOMINATOR HAS TO COUNT IT.
   A roster below every real team-season ranks length + 1, and the page was
   printing "1404th of 1403 all time". Both ends asserted, because the top end
   is wrong by the same one and looks like nothing. */
{
  const table = data.ratingTable;
  ok(table && table.length > 1000, `a rating table to rank against (${table.length})`);
  is(E.nationalRank(table[table.length - 1] + 50, table), 1, 'better than everything ranks first');
  is(E.nationalRank(table[0] - 50, table), table.length + 1,
    'worse than everything ranks one past the table, which is what the page must divide by');
}

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
