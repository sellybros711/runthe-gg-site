/*
 * badges.js - the cabinet for Run The Floor.
 *
 * DERIVED, NEVER STORED. Every badge here is computed from the career the game
 * already keeps: the cumulative sets it has always counted, and a compact row
 * per finished run. Nothing is written when a badge is earned, which buys two
 * things worth having:
 *
 *   - a badge cannot drift out of step with the career, because it IS the
 *     career, read a different way.
 *   - adding a badge needs no migration and no change to the recorder. Write
 *     the test, and every run already on the device answers it.
 *
 * WHAT IS AND IS NOT RETROACTIVE, said plainly because a player will notice.
 * The career has always counted clubs and shapes, so those collections fill in
 * for somebody who has been playing for weeks. Seasons, colleges, hardware and
 * the one-off feats need the per-run rows, which start the day this ships. The
 * cabinet says so rather than letting somebody wonder why their ring is missing.
 *
 * THIS IS THE FOOTBALL GAME'S achievements.js SHRUNK TO FIT. That one derives
 * from server-side leaderboard rows and follows an account between devices.
 * There is no account here yet, so this reads localStorage and is therefore
 * lost with the site data, exactly like the career record it sits beside. The
 * page says that too.
 *
 * OLD CAREERS HAVE HOLES. Fields were added over time, so every test has to
 * treat a missing key as "not known" rather than as zero. That is what `num`,
 * `set` and `rows` below are for, and it is why almost every test is written
 * against a filtered list rather than a raw count.
 *
 * Headless and dependency-free, so the catalog can be tested in node against
 * real careers. Browser: window.RTF_BADGES. Node: require('./badges.js').
 */
'use strict';
(function() {

const BADGES_API_VERSION = 1;

/* ---------------- small helpers ---------------- */

const num = (v) => (typeof v === 'number' && isFinite(v) ? v : 0);
const set = (c, key) => (c && c[key] && typeof c[key] === 'object') ? c[key] : {};
const rows = (c) => (c && Array.isArray(c.rows)) ? c.rows : [];
const count = (c, key) => Object.keys(set(c, key)).length;
const any = (c, test) => rows(c).some(test);
const tally = (c, test) => rows(c).filter(test).length;

/* How many of a thing there are to collect. Read from the data at boot where
   the page can, so a season landing in the data next July moves the target
   rather than leaving a collection permanently one short. */
let TOTALS = { seasons: 52, clubs: 45, shapes: 14 };
function setTotals(t) {
  if (!t) return;
  TOTALS = {
    seasons: num(t.seasons) || TOTALS.seasons,
    clubs: num(t.clubs) || TOTALS.clubs,
    shapes: num(t.shapes) || TOTALS.shapes,
  };
}

/* ---------------- the catalog ----------------
 *
 * Each badge is { id, name, why, tier, got(career) -> bool } and, for a
 * collection, a `progress(career) -> [have, need]` so the cabinet can show how
 * far along something is rather than a locked square with no information in it.
 *
 * WHY THERE ARE COLLECTIONS AND NOT THREE HUNDRED ONE-OFF RULES. A player who
 * turns up for a month needs something still left to chase in month two, and a
 * cabinet of hand-written jokes is finished long before then. The 52 seasons
 * and the 45 franchises are a small ask each and a long, pleasant grind taken
 * together, which is the shape a collection should have. The hand-written ones
 * are the ones with a piece of basketball in them.
 *
 * TIERS: 'bronze' is a first step, 'silver' is a habit, 'gold' is a feat and
 * 'ring' is the handful somebody will actually brag about.
 *
 * EVERY THRESHOLD BELOW WAS MEASURED, NOT CHOSEN, and the first pass got three
 * of them wrong in the direction that matters: it asked for things that cannot
 * happen. Across 2,800 simulated runs under four different drafting strategies,
 * no roster ever had six decorated players (the most was four), no roster ever
 * reached +2 chemistry (the most was 1.67), and the best rating that ever
 * missed the playoffs was 64, not 80. A badge nobody can earn is not a hard
 * badge, it is a bug that looks like content. check-badges.mjs re-runs that
 * measurement, so moving a number here without re-running it will be caught.
 */

function tiered(idBase, name, why, key, totalKey, marks) {
  return marks.map((need, i) => ({
    id: idBase + '-' + need,
    name: typeof name === 'function' ? name(need) : name,
    why: typeof why === 'function' ? why(need) : why,
    tier: ['bronze', 'silver', 'gold', 'ring'][Math.min(i, 3)],
    collection: true,
    progress: (c) => [Math.min(count(c, key), need), need],
    got: (c) => count(c, key) >= need,
    _totalKey: totalKey,
  }));
}

const CATALOG = [
  /* ---- the first steps ---- */
  { id: 'first-run', name: 'Tip-off', why: 'Finish your first run.', tier: 'bronze',
    got: (c) => num(c.runs) >= 1 },
  { id: 'ten-runs', name: 'Regular', why: 'Finish ten runs.', tier: 'silver',
    got: (c) => num(c.runs) >= 10 },
  { id: 'fifty-runs', name: 'Season ticket', why: 'Finish fifty runs.', tier: 'gold',
    got: (c) => num(c.runs) >= 50 },

  /* ---- the collections ---- */
  ...tiered('clubs', (n) => n >= 45 ? 'The whole league' : 'Scout ' + n + ' clubs',
    (n) => 'Sign a player from ' + n + ' different franchises.', 'clubs', 'clubs',
    [5, 15, 30, 45]),
  ...tiered('seasons', (n) => n >= 52 ? 'Every season since 1974' : 'Draft from ' + n + ' seasons',
    (n) => 'Sign a player from ' + n + ' different seasons.', 'seasons', 'seasons',
    [5, 15, 30, 52]),
  ...tiered('shapes', (n) => n >= 14 ? 'Every system' : 'Run ' + n + ' systems',
    (n) => 'Field ' + n + ' different roster identities.', 'shapes', 'shapes',
    [3, 6, 10, 14]),
  ...tiered('colleges', 'Recruiter',
    (n) => 'Sign players out of ' + n + ' different colleges.', 'colleges', null,
    [10, 40, 100]),

  /* ---- the decades, which is a collection with six members and a nice name ---- */
  { id: 'decades', name: 'Across the eras', why: 'Sign a player from all six decades.',
    tier: 'silver', collection: true,
    progress: (c) => [DECADES.filter((d) => decadeHit(c, d)).length, DECADES.length],
    got: (c) => DECADES.every((d) => decadeHit(c, d)) },

  /* ---- winning ---- */
  { id: 'playoffs', name: 'In the field', why: 'Reach the playoffs.', tier: 'bronze',
    got: (c) => num(c.playoffs) >= 1 },
  { id: 'ring', name: 'Champions', why: 'Win the title.', tier: 'ring',
    got: (c) => num(c.rings) >= 1 },
  { id: 'threepeat', name: 'Dynasty', why: 'Win three titles.', tier: 'ring',
    got: (c) => num(c.rings) >= 3 },
  { id: 'sixty', name: 'Sixty win team', why: 'Win 60 games in a season.', tier: 'silver',
    got: (c) => num(c.bestWins) >= 60 },
  { id: 'record', name: 'Better than 72', why: 'Beat the 1996 Bulls.', tier: 'ring',
    got: (c) => num(c.beat72) >= 1 },

  /* ---- the ones with basketball in them ---- */
  { id: 'spend-it', name: 'Spent to the dollar', why: 'Finish a draft with under $500k left.',
    tier: 'bronze', got: (c) => any(c, (r) => num(r.left) >= 0 && num(r.left) < 0.5) },
  /* MEASURED, and the first number was fantasy. "Win 50 games under $80M" came
     back at 2 runs in 1,111 deliberate cheap builds, which is rarer than most
     of the ring badges and was never meant to be. Reaching the playoffs on that
     budget is the same idea, is worth saying, and happens often enough that
     somebody chasing it will get there. */
  { id: 'thrift', name: 'Moneyball', why: 'Reach the playoffs with a roster under $80M.',
    tier: 'gold', got: (c) => any(c, (r) => r.po && num(r.spend) > 0 && num(r.spend) < 80) },
  { id: 'cheap-ring', name: 'No superstars', why: 'Win the title with nobody over $45M.',
    tier: 'ring', got: (c) => any(c, (r) => r.ring && num(r.top) > 0 && num(r.top) <= 45) },
  { id: 'chemistry', name: 'They knew each other', why: 'Field a roster worth +1.5 chemistry.',
    tier: 'gold', got: (c) => any(c, (r) => num(r.chem) >= 1.5) },
  { id: 'reunion', name: 'Reunion', why: 'Sign two men from the same club and season.',
    tier: 'silver', got: (c) => any(c, (r) => num(r.pairs) >= 1) },
  { id: 'mvp', name: 'Signed an MVP', why: 'Sign a player from his MVP season.',
    tier: 'silver', got: (c) => any(c, (r) => (r.aw || []).indexOf('mvp') >= 0) },
  { id: 'all-decorated', name: 'Four of the best',
    why: 'Field four players who each won something that season.', tier: 'gold',
    got: (c) => any(c, (r) => num(r.decorated) >= 4) },
  { id: 'no-hardware', name: 'Nobody you have heard of',
    why: 'Reach the playoffs with a roster carrying no hardware at all.', tier: 'gold',
    got: (c) => any(c, (r) => r.po && num(r.decorated) === 0) },

  /* ---- the ones that hurt ---- */
  { id: 'swept', name: 'Swept', why: 'Lose a playoff series 0-4.', tier: 'bronze',
    got: (c) => any(c, (r) => r.swept) },
  { id: 'flop', name: 'On paper', why: 'Miss the playoffs with a rating of 60 or better.',
    tier: 'silver', got: (c) => any(c, (r) => !r.po && num(r.rating) >= 60) },
  { id: 'lost-finals', name: 'So close', why: 'Lose in the Finals.', tier: 'silver',
    got: (c) => any(c, (r) => r.lostFinals) },

  /* ---- persistence ---- */
  { id: 'five-rings', name: 'The cabinet', why: 'Win five titles.', tier: 'ring',
    got: (c) => num(c.rings) >= 5 },
  { id: 'hundred-wins', name: 'A thousand games', why: 'Play a thousand regular season games.',
    tier: 'gold', got: (c) => num(c.totalWins) + num(c.totalLosses) >= 1000 },
];

const DECADES = [1970, 1980, 1990, 2000, 2010, 2020];
function decadeHit(c, d) {
  const seasons = Object.keys(set(c, 'seasons')).map(Number);
  return seasons.some((s) => s >= d && s < d + 10);
}

/* A collection's target moves with the data. tiered() marks are fixed numbers
   so the badge names read as promises ("Draft from 30 seasons"), but the top
   tier of each is meant to BE the whole set, so it is corrected here rather
   than hardcoded twice. */
function catalog() {
  return CATALOG.map((b) => {
    if (!b._totalKey || !TOTALS[b._totalKey]) return b;
    const total = TOTALS[b._totalKey];
    const marks = { clubs: 45, seasons: 52, shapes: 14 };
    if (!b.id.endsWith('-' + marks[b._totalKey])) return b;
    if (total === marks[b._totalKey]) return b;
    return { ...b, progress: (c) => [Math.min(count(c, b._totalKey === 'shapes' ? 'shapes' : b._totalKey), total), total],
      got: (c) => count(c, b._totalKey === 'shapes' ? 'shapes' : b._totalKey) >= total };
  });
}

/** Every badge, with whether this career has it and how far along it is. */
function evaluate(career) {
  const c = career || {};
  return catalog().map((b) => {
    const got = !!b.got(c);
    const p = b.progress ? b.progress(c) : null;
    return { id: b.id, name: b.name, why: b.why, tier: b.tier,
      collection: !!b.collection, got, have: p ? p[0] : (got ? 1 : 0),
      need: p ? p[1] : 1 };
  });
}

function earned(career) { return evaluate(career).filter((b) => b.got); }

const publicAPI = {
  API_VERSION: BADGES_API_VERSION,
  catalog, evaluate, earned, setTotals,
  get TOTAL() { return CATALOG.length; },
};

if (typeof module !== 'undefined' && module.exports) module.exports = publicAPI;
if (typeof window !== 'undefined') window.RTF_BADGES = publicAPI;
})();
