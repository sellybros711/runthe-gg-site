/* GENERATOR for arcade/sportegories-data.js  (window.RTG_SPORTEGORIES_DATA)
 *
 * Sportegories is a daily sports Scattergories: a letter is rolled, eight
 * constrained categories appear, and every answer must be a real player's FULL
 * NAME whose first or last name starts with that letter.
 *
 * This script builds the single data file the game needs:
 *   1. A merged player index  - the game corpus (entities.js) unioned with the
 *      recognizable former-players set (former.js), hydrated with awards
 *      (awards.js) and career stats (hlstats/rosterstats/stats.js).
 *   2. A declarative category library - categories are DATA, not code, so they
 *      serialize into this file and are evaluated in the browser by
 *      arcade/sportegories.js. Axes (position x franchise x award x stat
 *      threshold x college x era) combine into hundreds of categories.
 *   3. Per-letter viability - for every category, how many RECOGNIZABLE answers
 *      exist for each letter. The daily generator reads this so a puzzle can
 *      never ask something unanswerable.
 *
 * Fame gate: a category counts as viable for a letter only if enough answers
 * are recognizable (f >= FAME_MIN). Obscure players still SCORE if a player
 * names them - they're just not what we promise solvability on.
 *
 * HOW TO RUN:  node scripts/build-sportegories.mjs
 * Reads only files already in the repo, so it runs offline.
 */
import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const R = (p) => readFileSync(path.join(ROOT, p), 'utf8');

// ---------------------------------------------------------------- load
const G = {};
new Function('window', 'self', 'module', R('arcade/match/entities.js'))(G, G, {});
for (const f of ['arcade/former.js', 'arcade/rosters.js', 'arcade/awards.js', 'arcade/hlstats.js', 'arcade/rosterstats.js', 'arcade/stats.js']) {
  try { new Function('window', 'self', R(f))(G, G); } catch (e) { console.warn('skip ' + f + ': ' + e.message); }
}
const CORPUS = G.GRID_ENTITIES || [];
const FORMER = (G.RTG_FORMER && G.RTG_FORMER.players) || [];
const AWARDS = (G.RTG_AWARDS && G.RTG_AWARDS.players) || {};
const ROSTERS = (G.RTG_ROSTERS && G.RTG_ROSTERS.players) || [];

/* Every active pro belongs in here.
 *
 * The corpus and the former-players set are both curated for RECOGNITION —
 * they answer "who would a fan name?" That is the right question for building
 * a solvable puzzle and the wrong one for judging an answer. Sportegories is a
 * deep-cuts game: a player who dredges up the Bengals' third-year back should
 * be rewarded, not told he made the name up. Chase Brown was sitting in
 * rosters.js the whole time; this file just never opened it.
 *
 * These records come in with fame 0, which is exactly right on both counts:
 * they never enter the solvability promise (that gate is f >= FAME_MIN), and
 * they score at the top rarity tier when someone does name them. */
const THIS_YEAR = new Date().getUTCFullYear();
function fromRoster(p) {
  // ESPN gives seasons of experience, not a debut year, so the span is
  // approximate — good enough for "played in the 2020s", not for anything
  // that turns on an exact year.
  const exp = Math.max(0, Math.min(30, +p.exp || 0));
  const decade = [];
  for (let y = Math.floor((THIS_YEAR - exp) / 10) * 10; y <= THIS_YEAR; y += 10) decade.push(y);
  return {
    name: p.n, sport: p.s, pos: p.p || null, t: p.t ? [p.t] : [], col: p.col || null,
    aw: [], decade, act: 1, f: 0,
    // A roster is a snapshot of TODAY. It says nothing about the four other
    // uniforms a ten-year veteran wore, so a one-team record here is not
    // evidence of a one-team career — see tpart below.
    tpart: exp > 2 ? 1 : 0
  };
}

// ------------------------------------------------------------ normalize
// Token-wise so "A.J." -> "aj" and "Abdul-Jabbar" -> "abduljabbar".
const SUFFIX = { jr: 1, sr: 1, ii: 1, iii: 1, iv: 1, v: 1 };
export function normTok(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}
function tokens(name) {
  return String(name || '').trim().split(/\s+/).map(normTok).filter(Boolean);
}
/* first + last with suffixes and middle names dropped - the identity we match on */
function nameKey(name) {
  let t = tokens(name);
  while (t.length > 2 && SUFFIX[t[t.length - 1]]) t = t.slice(0, -1);
  if (!t.length) return null;
  if (t.length === 1) return { first: t[0], last: t[0] };
  return { first: t[0], last: t[t.length - 1] };
}
const nkFull = (s) => tokens(s).join('');

// ------------------------------------------------------------ merge pool
const pool = new Map();                       // sport|normfull -> record
function put(e, fromCorpus) {
  const k = e.sport + '|' + nkFull(e.name);
  const cur = pool.get(k);
  if (!cur) {
    pool.set(k, {
      name: e.name, sport: e.sport, pos: e.pos || null, t: (e.t || []).slice(),
      col: e.col || null, aw: (e.aw || []).slice(), decade: (e.decade || []).slice(),
      act: e.act === 1 ? 1 : 0, hof: e.hof ? 1 : 0, dp: typeof e.dp === 'number' ? e.dp : null,
      f: e.f || 0, ids: e.id ? [e.id] : [], corpus: fromCorpus ? 1 : 0,
      tpart: e.tpart ? 1 : 0
    });
    return;
  }
  // A curated record carries a real career, so it clears the roster snapshot's
  // "we only know today's team" caveat.
  if (!e.tpart) cur.tpart = 0;
  // keep the richer record
  if (!cur.pos && e.pos) cur.pos = e.pos;
  if (!cur.col && e.col) cur.col = e.col;
  /* Union the team lists, do not keep whichever source happened to be longest.
     Three sources name the same franchise differently, so "longest wins" threw
     away real clubs: Steven Jackson came out of here holding the Rams tag from
     one source and losing the other source's, which is half of why the Rams
     category refused him. A club named by any source is a club he played for. */
  for (const t of (e.t || [])) if (t && !cur.t.includes(t)) cur.t.push(t);
  if ((e.decade || []).length > cur.decade.length) cur.decade = (e.decade || []).slice();
  if (e.act === 1) cur.act = 1;
  if (e.hof) cur.hof = 1;
  if (cur.dp == null && typeof e.dp === 'number') cur.dp = e.dp;
  if ((e.f || 0) > cur.f) cur.f = e.f || 0;
  if (e.id && !cur.ids.includes(e.id)) cur.ids.push(e.id);
  if (fromCorpus) cur.corpus = 1;
  if (e.aw) for (const a of e.aw) if (!cur.aw.includes(a)) cur.aw.push(a);
}
CORPUS.forEach((e) => put(e, true));
FORMER.forEach((e) => put(e, false));
ROSTERS.forEach((p) => put(fromRoster(p), false));

// awards are keyed "SPORT|normalized name"
for (const [key, val] of Object.entries(AWARDS)) {
  const i = key.indexOf('|'); if (i < 0) continue;
  const rec = pool.get(key.slice(0, i) + '|' + nkFull(key.slice(i + 1)));
  if (!rec) continue;
  for (const a of val.aw || []) if (!rec.aw.includes(a)) rec.aw.push(a);
}
// hall-of-fame flag lives in awards for many players
for (const rec of pool.values()) if (rec.aw.includes('Hall of Fame')) rec.hof = 1;

// career stats are keyed by CORPUS id only
const STATVALS = {};
for (const src of [G.RTG_HLSTATS, G.RTG_ROSTERSTATS, G.RTG_STATS]) {
  const s = (src && src.stats) || src || {};
  for (const k of Object.keys(s)) { STATVALS[k] = STATVALS[k] || {}; Object.assign(STATVALS[k], s[k].vals || {}); }
}
for (const rec of pool.values()) {
  const st = {};
  for (const k of Object.keys(STATVALS)) {
    for (const id of rec.ids) { const v = STATVALS[k][id]; if (v != null) { st[k] = v; break; } }
  }
  if (Object.keys(st).length) rec.st = st;
}

const PLAYERS = [...pool.values()].filter((p) => nameKey(p.name));

/* ------------------------------------------------------- one franchise, one name
 *
 * A player emailed in: letter J, category "Played for the St. Louis Rams",
 * answer "Steven Jackson", told it did not fit. He rushed for 10,135 yards
 * there.
 *
 * The corpus carried the Rams as TWO teams. 197 players were filed under "Los
 * Angeles Rams" and 201 under "St. Louis Rams", and the split was not by era:
 * Kurt Warner, Marshall Faulk, Isaac Bruce, Torry Holt and Jackson, the entire
 * Greatest Show on Turf and none of whom ever played a down for the Rams in
 * Los Angeles, were all filed under Los Angeles. The two labels were never two
 * eras, they were two upstream sources disagreeing, so every category built on
 * either one rejected roughly half of the franchise's actual players. The same
 * hole sat under the Raiders, Chargers, Athletics, Angels, Braves, Dodgers,
 * Nets, Grizzlies, Sonics and a dozen more.
 *
 * Since the data cannot tell the eras apart, the categories must stop claiming
 * to. Relocations collapse to the bare nickname, which is true of every player
 * in the merged set: "Played for the Rams" is right for Eric Dickerson and for
 * Cooper Kupp. Where the nickname changed too, the current full name is the
 * canonical one, because a franchise that renamed is still the same franchise.
 *
 * Deliberately an explicit list and not a heuristic. Same-nickname pairs that
 * are NOT one franchise sit right next to these in the data and must never be
 * merged: the NFL Arizona Cardinals and the MLB St. Louis Cardinals, the NFL
 * Cleveland Browns and the MLB St. Louis Browns, the MLB Colorado Rockies and
 * the NHL club of the same name, and a long row of Negro League Giants, Stars
 * and Sox. */
const FRANCHISE = {
  // NFL: moved, kept the nickname
  'St. Louis Rams': 'Rams', 'Los Angeles Rams': 'Rams',
  'San Diego Chargers': 'Chargers', 'Los Angeles Chargers': 'Chargers',
  'Oakland Raiders': 'Raiders', 'Las Vegas Raiders': 'Raiders', 'Los Angeles Raiders': 'Raiders',
  // NFL: moved and renamed
  'Houston Oilers': 'Tennessee Titans', 'Tennessee Oilers': 'Tennessee Titans',
  'Baltimore Colts': 'Indianapolis Colts',
  // NBA: moved, kept the nickname
  'New Jersey Nets': 'Nets', 'Brooklyn Nets': 'Nets',
  'Vancouver Grizzlies': 'Grizzlies', 'Memphis Grizzlies': 'Grizzlies',
  'San Diego Clippers': 'Clippers', 'Los Angeles Clippers': 'Clippers', 'LA Clippers': 'Clippers',
  // NBA: moved and/or renamed
  'Seattle SuperSonics': 'Oklahoma City Thunder',
  'Washington Bullets': 'Washington Wizards',
  'Charlotte Bobcats': 'Charlotte Hornets',
  'New Orleans Hornets': 'New Orleans Pelicans',
  'Kansas City Kings': 'Sacramento Kings',
  'New Orleans Jazz': 'Utah Jazz',
  // MLB: moved, kept the nickname
  'Boston Braves': 'Braves', 'Milwaukee Braves': 'Braves', 'Atlanta Braves': 'Braves',
  'Brooklyn Dodgers': 'Dodgers', 'Los Angeles Dodgers': 'Dodgers',
  'Philadelphia Athletics': 'Athletics', 'Kansas City Athletics': 'Athletics', 'Oakland Athletics': 'Athletics',
  'California Angels': 'Angels', 'Anaheim Angels': 'Angels', 'Los Angeles Angels': 'Angels',
  'Florida Marlins': 'Marlins', 'Miami Marlins': 'Marlins',
  // MLB: renamed in place
  'Tampa Bay Devil Rays': 'Tampa Bay Rays',
  'Cleveland Indians': 'Cleveland Guardians',
  // MLB: moved and renamed
  'Montreal Expos': 'Washington Nationals',
  'Seattle Pilots': 'Milwaukee Brewers',
  'St. Louis Browns': 'Baltimore Orioles'
};
// One upstream row arrived as "NO/Oklahoma City\r\n Hornets". Collapse the
// whitespace before anything keys off the string.
const tidy = (t) => String(t == null ? '' : t).replace(/\s+/g, ' ').trim();
const franchise = (t) => { const s = tidy(t); return FRANCHISE[s] || s; };
for (const p of PLAYERS) {
  const seen = new Set();
  p.t = p.t.map(franchise).filter((t) => t && !seen.has(t) && seen.add(t));
}

// --------------------------------------------------------- lookup tables
const uniq = (arr) => [...new Set(arr.filter(Boolean))].sort();
const TEAMS = uniq(PLAYERS.flatMap((p) => p.t));
const COLS = uniq(PLAYERS.map((p) => p.col));
const POSN = uniq(PLAYERS.map((p) => p.pos));
const AWDS = uniq(PLAYERS.flatMap((p) => p.aw));
const SPORTS = uniq(PLAYERS.map((p) => p.sport));
const iT = new Map(TEAMS.map((v, i) => [v, i]));
const iC = new Map(COLS.map((v, i) => [v, i]));
const iP = new Map(POSN.map((v, i) => [v, i]));
const iA = new Map(AWDS.map((v, i) => [v, i]));
const iS = new Map(SPORTS.map((v, i) => [v, i]));
const DEC0 = 1900;
const decBits = (ds) => ds.reduce((m, d) => m | (1 << Math.max(0, Math.round((d - DEC0) / 10))), 0);

// conference groupings (college axis)
const CONF = {
  SEC: ['Alabama', 'Georgia', 'Florida', 'Louisiana State', 'Auburn', 'Tennessee', 'Kentucky', 'Texas A&M', 'Mississippi', 'Missouri', 'Arkansas', 'South Carolina', 'Vanderbilt', 'Mississippi State', 'Oklahoma', 'Texas'],
  'Big Ten': ['Ohio State', 'Michigan', 'Penn State', 'Wisconsin', 'Iowa', 'Nebraska', 'Michigan State', 'Minnesota', 'Illinois', 'Indiana', 'Purdue', 'Northwestern', 'Maryland', 'Rutgers', 'Southern California', 'UCLA', 'Oregon', 'Washington'],
  ACC: ['Clemson', 'Florida State', 'Miami (FL)', 'North Carolina', 'Duke', 'Virginia', 'Virginia Tech', 'Georgia Tech', 'Pittsburgh', 'Syracuse', 'Louisville', 'Boston College', 'Wake Forest', 'North Carolina State'],
  'Big 12': ['Baylor', 'Texas Christian', 'Oklahoma State', 'Kansas', 'Kansas State', 'Iowa State', 'West Virginia', 'Texas Tech', 'Cincinnati', 'Houston']
};

// ------------------------------------------------------- category library
/* A category is DATA. Predicate kinds:
 *   sport, pos, team, award, col, conf, stat(min), decade, act, draft1, teams(min)
 * `all:[...]` intersects them. The runtime evaluates the same shapes. */
const CATS = [];
let cid = 0;
const add = (label, pred, tag) => CATS.push({ i: cid++, l: label, p: pred, g: tag });

// -- position (per sport)
const POS_BY_SPORT = {};
PLAYERS.forEach((p) => { if (p.pos && p.sport) (POS_BY_SPORT[p.sport] = POS_BY_SPORT[p.sport] || new Set()).add(p.pos); });
for (const sp of ['NBA', 'NFL', 'MLB']) {
  for (const ps of [...(POS_BY_SPORT[sp] || [])].sort()) {
    const base = { all: [{ k: 'sport', v: sp }, { k: 'pos', v: ps }] };
    const n = PLAYERS.filter((p) => test(p, base)).length;
    // A bare position is a filter, not a puzzle - "NBA Center" asks nothing.
    // Keep it only as a wide anchor, and hang the interesting variants off it.
    if (n >= 25) add(`${sp} ${ps}`, base, 'pos');
    const hooks = [
      [`Hall of Fame ${ps}`, { all: [...base.all, { k: 'award', v: 'Hall of Fame' }] }],
      [`Active ${sp} ${ps}`, { all: [...base.all, { k: 'act' }] }],
      [`${ps} who played for 3+ teams`, { all: [...base.all, { k: 'teams', min: 3 }] }],
      [`${ps} who never left one franchise`, { all: [...base.all, { k: 'teamsMax', max: 1 }] }],
      [`${ps} whose career spanned 3 decades`, { all: [...base.all, { k: 'decades', min: 3 }] }]
    ];
    hooks.forEach(([l, pr]) => { if (PLAYERS.filter((p) => test(p, pr)).length >= 14) add(l, pr, 'pos'); });
  }
}
// -- franchise (any team with a real body of players)
const teamCount = {};
PLAYERS.forEach((p) => p.t.forEach((t) => { teamCount[t] = (teamCount[t] || 0) + 1; }));
/* Roster sizes differ wildly by sport - an NFL franchise churns through far
 * more players than an NBA one - so a single cutoff silently made this a
 * football-and-baseball game. Gate per sport instead. */
const teamSport = {};
PLAYERS.forEach((p) => p.t.forEach((t) => {
  (teamSport[t] = teamSport[t] || {})[p.sport] = (teamSport[t][p.sport] || 0) + 1;
}));
const sportOfTeam = (t) => Object.entries(teamSport[t] || {}).sort((a, b) => b[1] - a[1])[0]?.[0];
const TEAM_MIN = { NBA: 38, NFL: 75, MLB: 75 };
const BIG_TEAMS = Object.entries(teamCount)
  .filter(([t, n]) => n >= (TEAM_MIN[sportOfTeam(t)] || 999)).map(([t]) => t);
/* Nicknames are ambiguous once you shorten them ("Red Sox"/"White Sox" both end
 * in "Sox", both New York clubs, both LA clubs), so label with the full name. */
BIG_TEAMS.forEach((t) => add(`Played for the ${t}`, { k: 'team', v: t }, 'team'));
/* Franchise x accolade. This is where the pool gets its depth AND its
 * character: "Hall of Famer who played for the Steelers" is a real question a
 * fan enjoys, and it multiplies one flat axis (86 franchises) into hundreds of
 * specific categories. Without these the library leaned on a handful of very
 * broad categories, and the same few showed up every fourth day. */
const TEAM_HOOKS = [
  ['Hall of Fame', (t) => `Hall of Famer who played for the ${t}`],
  ['NBA All-Star', (t) => `NBA All-Star who played for the ${t}`],
  ['MLB All-Star', (t) => `MLB All-Star who played for the ${t}`],
  ['Pro Bowl', (t) => `Pro Bowler who played for the ${t}`]
];
BIG_TEAMS.forEach((t) => {
  TEAM_HOOKS.forEach(([aw, mk]) => {
    const pr = { all: [{ k: 'team', v: t }, { k: 'award', v: aw }] };
    if (PLAYERS.filter((p) => test(p, pr)).length >= 12) add(mk(t), pr, 'team');
  });
  // the journeyman cut: passed through here, and through plenty of others
  const jr = { all: [{ k: 'team', v: t }, { k: 'teams', min: 4 }] };
  if (PLAYERS.filter((p) => test(p, jr)).length >= 14)
    add(`Played for the ${t} and 3 other franchises`, jr, 'team');
  // the loyalist cut: this club and nobody else
  const lo = { all: [{ k: 'team', v: t }, { k: 'teamsMax', max: 1 }] };
  if (PLAYERS.filter((p) => test(p, lo)).length >= 12)
    add(`Spent an entire career with the ${t}`, lo, 'team');
});

// -- two-franchise (only pairs with a real intersection)
const RIVALS = [
  ['New York Yankees', 'Boston Red Sox'], ['Dallas Cowboys', 'San Francisco 49ers'],
  ['New England Patriots', 'Denver Broncos'], ['Los Angeles Dodgers', 'San Francisco Giants'],
  ['Chicago Cubs', 'St. Louis Cardinals'], ['Green Bay Packers', 'Chicago Bears'],
  ['New York Mets', 'Atlanta Braves'], ['Pittsburgh Steelers', 'Philadelphia Eagles'],
  ['Los Angeles Lakers', 'Boston Celtics'], ['Chicago Bulls', 'New York Knicks']
];
RIVALS.forEach(([a, b]) => {
  if (!iT.has(a) || !iT.has(b)) return;
  const n = PLAYERS.filter((p) => p.t.includes(a) && p.t.includes(b)).length;
  if (n >= 12) add(`Played for BOTH the ${a} and the ${b}`,
    { all: [{ k: 'team', v: a }, { k: 'team', v: b }] }, 'two');
});
// -- awards ("Pro Bowl winner" reads wrong; selections aren't won)
const AW_LABEL = {
  'Hall of Fame': 'Hall of Famer', 'Pro Bowl': 'Pro Bowler',
  'NBA All-Star': 'NBA All-Star', 'MLB All-Star': 'MLB All-Star'
};
AWDS.forEach((a) => {
  const n = PLAYERS.filter((p) => p.aw.includes(a)).length;
  if (n >= 30) add(AW_LABEL[a] || `${a} winner`, { k: 'award', v: a }, 'award');
});
add('MVP winner (any sport)', { k: 'awardRe', v: 'MVP' }, 'award');
add('Rookie of the Year', { k: 'awardRe', v: 'Rookie of the Year' }, 'award');
// -- college
const AN = (s) => (/^(SEC|ACC|A|E|I|O|U)/.test(s) ? 'an' : 'a');
Object.keys(CONF).forEach((c) => add(`Played at ${AN(c)} ${c} school`, { k: 'conf', v: c }, 'col'));
const colCount = {};
PLAYERS.forEach((p) => { if (p.col) colCount[p.col] = (colCount[p.col] || 0) + 1; });
Object.entries(colCount).filter(([, n]) => n >= 18).forEach(([c]) => add(`Played college at ${c}`, { k: 'col', v: c }, 'col'));
// -- stat thresholds
const STAT_STEPS = [
  ['mlb_hr', 'career home runs', [200, 300, 400, 500]], ['mlb_hits', 'career hits', [1500, 2000, 2500, 3000]],
  ['mlb_rbi', 'career RBIs', [800, 1000, 1500]], ['mlb_sb', 'career stolen bases', [200, 300, 400]],
  ['mlb_strikeouts', 'pitcher strikeouts', [1500, 2000, 3000]], ['mlb_wins', 'pitcher wins', [100, 150, 200]],
  ['nfl_rushyds', 'rushing yards', [5000, 8000, 10000]], ['nfl_passyds', 'passing yards', [20000, 30000, 40000]],
  ['nfl_passtd', 'passing TDs', [150, 200, 300]], ['nfl_recyds', 'receiving yards', [6000, 8000, 10000]],
  ['nfl_receptions', 'career receptions', [400, 500, 700]], ['nfl_sacks', 'career sacks', [50, 75, 100]],
  ['nfl_tackles', 'career tackles', [500, 800]], ['nba_points', 'NBA points', [10000, 15000, 20000]]
];
STAT_STEPS.forEach(([key, label, steps]) => steps.forEach((min) => {
  const n = PLAYERS.filter((p) => p.st && p.st[key] >= min).length;
  if (n >= 12) add(`${min.toLocaleString()}+ ${label}`, { k: 'stat', v: key, min }, 'stat');
}));
// -- era & status
/* Bare decades are gone. "Played in the 2010s" matched thousands of players
 * and filled 10% of every card's slots with the least interesting question the
 * game can ask. What survives is the SHAPE of a career: spanning two named
 * decades, or lasting three, or never leaving one town. */
/* Adjacent pairs are a long career; the non-adjacent ones are a REALLY long
 * career, and a better question for it. */
[[1980, 1990], [1990, 2000], [2000, 2010], [2010, 2020],
 [1980, 2000], [1990, 2010], [2000, 2020]].forEach(([a, b]) =>
  add(`Played in both the ${a}s and the ${b}s`,
      { all: [{ k: 'decade', v: a }, { k: 'decade', v: b }] }, 'era'));
add('Career spanned 3 different decades', { k: 'decades', min: 3 }, 'era');
add('Career spanned 4 different decades', { k: 'decades', min: 4 }, 'era');
add('Never played for another franchise', { k: 'teamsMax', max: 1 }, 'journey');
add('Played for exactly two franchises', { k: 'teamsExact', n: 2 }, 'journey');
add('Played for 6+ franchises', { k: 'teams', min: 6 }, 'journey');
add('Active player today', { k: 'act' }, 'era');
add('#1 overall draft pick', { k: 'draft1' }, 'draft');
add('Played for 3+ franchises', { k: 'teams', min: 3 }, 'journey');
add('Played for 4+ franchises', { k: 'teams', min: 4 }, 'journey');
// -- stacked combos (the ones that make people think)
const COMBO = [
  ['Hall of Famer who played for the Yankees', { all: [{ k: 'award', v: 'Hall of Fame' }, { k: 'team', v: 'New York Yankees' }] }],
  ['MVP who played for the Lakers', { all: [{ k: 'awardRe', v: 'MVP' }, { k: 'team', v: 'Los Angeles Lakers' }] }],
  ['Active quarterback', { all: [{ k: 'pos', v: 'Quarterback' }, { k: 'act' }] }],
  ['Hall of Fame pitcher', { all: [{ k: 'pos', v: 'Pitcher' }, { k: 'award', v: 'Hall of Fame' }] }],
  ['Pro Bowler who played for the Cowboys', { all: [{ k: 'award', v: 'Pro Bowl' }, { k: 'team', v: 'Dallas Cowboys' }] }],
  ['NBA All-Star from an SEC school', { all: [{ k: 'award', v: 'NBA All-Star' }, { k: 'conf', v: 'SEC' }] }],
  ['Gold Glove winner who played in the 1990s', { all: [{ k: 'award', v: 'Gold Glove' }, { k: 'decade', v: 1990 }] }],
  ['Active player who has played for 3+ teams', { all: [{ k: 'act' }, { k: 'teams', min: 3 }] }],
  ['Quarterback who played for 3+ franchises', { all: [{ k: 'pos', v: 'Quarterback' }, { k: 'teams', min: 3 }] }],
  ['Hall of Famer from a Big Ten school', { all: [{ k: 'award', v: 'Hall of Fame' }, { k: 'conf', v: 'Big Ten' }] }]
];
COMBO.forEach(([l, p]) => add(l, p, 'combo'));

/* ---- basketball expansion ----
 * The generic axes under-serve the NBA: fewer franchises clear any roster
 * threshold, its counting stats are still thin (the CI job that fills them
 * keeps coming back empty), and college categories skew football because
 * football rosters are enormous. So build NBA-scoped categories explicitly. */
const NBA = { k: 'sport', v: 'NBA' };
const nbaAdd = (label, pred, tag) => {
  const n = PLAYERS.filter((p) => test(p, pred)).length;
  if (n >= 18) add(label, pred, tag);
};
[[1980, 1990], [1990, 2000], [2000, 2010], [2010, 2020],
 [1980, 2000], [1990, 2010], [2000, 2020]].forEach(([a, b]) =>
  nbaAdd(`NBA player who played in both the ${a}s and the ${b}s`,
         { all: [NBA, { k: 'decade', v: a }, { k: 'decade', v: b }] }, 'era'));
nbaAdd('NBA career spanning 3 decades', { all: [NBA, { k: 'decades', min: 3 }] }, 'era');
nbaAdd('NBA player who never left one franchise', { all: [NBA, { k: 'teamsMax', max: 1 }] }, 'journey');
// 'NBA All-Star' already exists as a plain award category; adding an
// NBA-scoped clone put two identical-reading labels in the same pool.
nbaAdd('NBA Hall of Famer', { all: [NBA, { k: 'award', v: 'Hall of Fame' }] }, 'award');
nbaAdd('NBA MVP or Finals MVP', { all: [NBA, { k: 'awardRe', v: 'MVP' }] }, 'award');
nbaAdd('NBA Rookie of the Year', { all: [NBA, { k: 'awardRe', v: 'Rookie of the Year' }] }, 'award');
['Duke', 'Kentucky', 'North Carolina', 'UCLA', 'Kansas', 'Michigan State', 'Arizona', 'Connecticut', 'Indiana', 'Louisville', 'Syracuse', 'Michigan']
  .forEach((c) => nbaAdd(`NBA player out of ${c}`, { all: [NBA, { k: 'col', v: c }] }, 'col'));
Object.keys(CONF).forEach((c) => nbaAdd(`NBA player from ${AN(c)} ${c} school`, { all: [NBA, { k: 'conf', v: c }] }, 'col'));
nbaAdd('Active NBA player', { all: [NBA, { k: 'act' }] }, 'era');
nbaAdd('NBA player who played for 3+ teams', { all: [NBA, { k: 'teams', min: 3 }] }, 'journey');
nbaAdd('NBA player who played for 4+ teams', { all: [NBA, { k: 'teams', min: 4 }] }, 'journey');
nbaAdd('NBA #1 overall draft pick', { all: [NBA, { k: 'draft1' }] }, 'draft');
[10000, 15000, 20000].forEach((min) =>
  nbaAdd(`${min.toLocaleString()}+ career NBA points`, { k: 'stat', v: 'nba_points', min }, 'stat'));
// marquee NBA franchise pairs
[['Los Angeles Lakers', 'Boston Celtics'], ['Chicago Bulls', 'New York Knicks'], ['Los Angeles Lakers', 'Miami Heat'],
 ['Golden State Warriors', 'Brooklyn Nets'], ['Boston Celtics', 'Philadelphia 76ers']]
  .forEach(([a, b]) => {
    if (!iT.has(a) || !iT.has(b)) return;
    nbaAdd(`Played for BOTH the ${a} and the ${b}`, { all: [{ k: 'team', v: a }, { k: 'team', v: b }] }, 'two');
  });

// ------------------------------------------------------------- evaluate
function test(p, pr) {
  if (pr.all) return pr.all.every((x) => test(p, x));
  switch (pr.k) {
    case 'sport': return p.sport === pr.v;
    case 'pos': return p.pos === pr.v;
    case 'team': return p.t.includes(pr.v);
    case 'award': return p.aw.includes(pr.v);
    case 'awardRe': return p.aw.some((a) => a.includes(pr.v));
    case 'col': return p.col === pr.v;
    case 'conf': return !!p.col && (CONF[pr.v] || []).includes(p.col);
    case 'stat': return !!p.st && p.st[pr.v] != null && p.st[pr.v] >= pr.min;
    case 'decade': return p.decade.includes(pr.v);
    case 'act': return p.act === 1;
    case 'draft1': return p.dp === 1;
    case 'teams': return p.t.length >= pr.min;
    // Never counts a roster snapshot: one team listed today is not a career
    // spent in one town.
    case 'teamsMax': return !p.tpart && p.t.length > 0 && p.t.length <= pr.max;
    // teamsMax is AT MOST n, which is right for the one-franchise categories
    // ("never left" is teamsMax 1) and wrong for any label that says a number
    // out loud. "Played for exactly two franchises" ran on teamsMax 2, so it
    // accepted every one-franchise player and listed Bill Russell and David
    // Robinson as answers you could have given.
    case 'teamsExact': return !p.tpart && p.t.length === pr.n;
    case 'decades': return new Set(p.decade).size >= pr.min;
    default: return false;
  }
}

// ------------------------------------------------- per-letter viability
const FAME_MIN = 3;          // "recognizable" floor for the solvability promise
const MIN_ANSWERS = 3;       // a category needs this many recognizable answers
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const initialsOf = (p) => { const k = nameKey(p.name); return k ? [...new Set([k.first[0], k.last[0]])] : []; };
PLAYERS.forEach((p) => { p._i = initialsOf(p); });

/* Which sport a category really belongs to. Most are implicit rather than
 * declared ("300+ home runs" is MLB; "Played at an SEC school" is nobody's),
 * so derive it from who actually answers: one sport owning 70%+ of the
 * recognizable answers makes it that sport's category, otherwise it's ANY.
 * The daily generator uses this to balance the sport mix. */
function sportOf(hits) {
  const known = hits.filter((p) => (p.f || 0) >= FAME_MIN);
  const base = known.length >= 8 ? known : hits;
  if (!base.length) return 'ANY';
  const n = {};
  base.forEach((p) => { n[p.sport] = (n[p.sport] || 0) + 1; });
  const [top, cnt] = Object.entries(n).sort((a, b) => b[1] - a[1])[0];
  return cnt / base.length >= 0.7 ? top : 'ANY';
}

const viability = {};        // catIndex -> { letter: recognizableCount }
CATS.forEach((c) => {
  const hits = PLAYERS.filter((p) => test(p, c.p));
  c.s = sportOf(hits);
  const by = {};
  hits.forEach((p) => { if ((p.f || 0) >= FAME_MIN) p._i.forEach((L) => { by[L] = (by[L] || 0) + 1; }); });
  const all = {};
  hits.forEach((p) => p._i.forEach((L) => { all[L] = (all[L] || 0) + 1; }));
  /* Tier is a promise about how hard a category FEELS, so it counts the
     answers a fan could actually produce, not every name in the file. Once the
     active rosters landed, raw counts stopped meaning anything: "NFL Safety"
     gained 200 special-teamers nobody can name and would have been relabelled
     an anchor. Recognizable answers only. */
  const known = hits.filter((p) => (p.f || 0) >= FAME_MIN);
  c.n = known.length;
  // Thresholds re-fit to recognizable counts so the anchor/mid/hard/spice mix
  // stays what it was before the rosters landed (~10/21/54/15).
  c.t = known.length >= 203 ? 0 : known.length >= 67 ? 1 : known.length >= 13 ? 2 : 3;  // tier
  viability[c.i] = by;
  c._all = all;
});

// a letter is playable if enough categories can serve it
const byLetter = {};
LETTERS.forEach((L) => {
  const ok = CATS.filter((c) => (viability[c.i][L.toLowerCase()] || 0) >= MIN_ANSWERS);
  byLetter[L] = ok.map((c) => c.i);
});
const PLAYABLE = LETTERS.filter((L) => byLetter[L].length >= 12);

// ------------------------------------------------------------- emit
const compact = PLAYERS.map((p) => {
  const rec = [
    p.name,
    iS.get(p.sport),
    p.pos ? iP.get(p.pos) : -1,
    p.t.map((t) => iT.get(t)),
    p.col ? iC.get(p.col) : -1,
    p.aw.map((a) => iA.get(a)),
    decBits(p.decade),
    (p.act ? 1 : 0) | (p.dp === 1 ? 2 : 0) | (p.tpart ? 4 : 0),
    p.f || 0
  ];
  if (p.st) rec.push(p.st);
  return rec;
});

const payload = {
  updated: new Date().toISOString().slice(0, 10),
  dec0: DEC0,
  fameMin: FAME_MIN, minAnswers: MIN_ANSWERS,
  sports: SPORTS, teams: TEAMS, cols: COLS, pos: POSN, awards: AWDS, conf: CONF,
  /* Ships so livecheck.js can resolve an OUTSIDE player's teams too. It builds
     its team lookup from `teams`, which no longer contains "St. Louis Rams", so
     without this a register player's Rams years would simply be dropped and the
     category would answer "cannot tell" instead of yes. One map, one file, no
     second copy to drift. */
  alias: FRANCHISE,
  players: compact,
  cats: CATS.map((c) => ({ i: c.i, l: c.l, p: c.p, g: c.g, n: c.n, t: c.t, s: c.s })),
  viab: viability,
  letters: PLAYABLE,
  byLetter
};

const banner = '/* GENERATED by scripts/build-sportegories.mjs. Do not edit by hand.\n' +
  ' * Sportegories: merged player index + declarative category library +\n' +
  ' * per-letter solvability. Consumed by arcade/sportegories.js. */\n';
writeFileSync(path.join(ROOT, 'arcade/sportegories-data.js'),
  banner + 'window.RTG_SPORTEGORIES_DATA = ' + JSON.stringify(payload) + ';\n');

// ------------------------------------------------------------- report
const size = Buffer.byteLength(JSON.stringify(payload));
console.log('players           ' + PLAYERS.length + '  (corpus ' + PLAYERS.filter(p => p.corpus).length + ', former ' + PLAYERS.filter(p => !p.corpus).length + ')');
console.log('teams/colleges    ' + TEAMS.length + ' / ' + COLS.length);
console.log('awards/positions  ' + AWDS.length + ' / ' + POSN.length);
console.log('categories        ' + CATS.length);
const tiers = [0, 0, 0, 0]; CATS.forEach((c) => tiers[c.t]++);
console.log('  by tier         anchor ' + tiers[0] + ', mid ' + tiers[1] + ', hard ' + tiers[2] + ', spice ' + tiers[3]);
const gTag = {}; CATS.forEach((c) => gTag[c.g] = (gTag[c.g] || 0) + 1);
console.log('  by axis         ' + Object.entries(gTag).map(([k, v]) => k + ':' + v).join(', '));
const gSp = {}; CATS.forEach((c) => gSp[c.s] = (gSp[c.s] || 0) + 1);
console.log('  by sport        ' + Object.entries(gSp).sort((a,b)=>b[1]-a[1]).map(([k, v]) => k + ':' + v).join(', '));
console.log('playable letters  ' + PLAYABLE.length + '  ' + PLAYABLE.join(''));
console.log('  per letter      ' + LETTERS.filter(L => byLetter[L].length).map((L) => L + ':' + byLetter[L].length).join(' '));
console.log('data file         ' + (size / 1024).toFixed(0) + ' KB  -> arcade/sportegories-data.js');
