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
for (const f of ['arcade/former.js', 'arcade/awards.js', 'arcade/hlstats.js', 'arcade/rosterstats.js', 'arcade/stats.js']) {
  try { new Function('window', 'self', R(f))(G, G); } catch (e) { console.warn('skip ' + f + ': ' + e.message); }
}
const CORPUS = G.GRID_ENTITIES || [];
const FORMER = (G.RTG_FORMER && G.RTG_FORMER.players) || [];
const AWARDS = (G.RTG_AWARDS && G.RTG_AWARDS.players) || {};

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
      f: e.f || 0, ids: e.id ? [e.id] : [], corpus: fromCorpus ? 1 : 0
    });
    return;
  }
  // keep the richer record
  if (!cur.pos && e.pos) cur.pos = e.pos;
  if (!cur.col && e.col) cur.col = e.col;
  if ((e.t || []).length > cur.t.length) cur.t = (e.t || []).slice();
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
    const n = PLAYERS.filter((p) => p.sport === sp && p.pos === ps).length;
    if (n >= 25) add(`${sp} ${ps}`, { all: [{ k: 'sport', v: sp }, { k: 'pos', v: ps }] }, 'pos');
  }
}
// -- franchise (any team with a real body of players)
const teamCount = {};
PLAYERS.forEach((p) => p.t.forEach((t) => { teamCount[t] = (teamCount[t] || 0) + 1; }));
const BIG_TEAMS = Object.entries(teamCount).filter(([, n]) => n >= 60).map(([t]) => t);
/* Nicknames are ambiguous once you shorten them ("Red Sox"/"White Sox" both end
 * in "Sox", both New York clubs, both LA clubs), so label with the full name. */
BIG_TEAMS.forEach((t) => add(`Played for the ${t}`, { k: 'team', v: t }, 'team'));
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
[1960, 1970, 1980, 1990, 2000, 2010, 2020].forEach((d) => add(`Played in the ${d}s`, { k: 'decade', v: d }, 'era'));
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
    default: return false;
  }
}

// ------------------------------------------------- per-letter viability
const FAME_MIN = 3;          // "recognizable" floor for the solvability promise
const MIN_ANSWERS = 3;       // a category needs this many recognizable answers
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const initialsOf = (p) => { const k = nameKey(p.name); return k ? [...new Set([k.first[0], k.last[0]])] : []; };
PLAYERS.forEach((p) => { p._i = initialsOf(p); });

const viability = {};        // catIndex -> { letter: recognizableCount }
CATS.forEach((c) => {
  const hits = PLAYERS.filter((p) => test(p, c.p));
  const by = {};
  hits.forEach((p) => { if ((p.f || 0) >= FAME_MIN) p._i.forEach((L) => { by[L] = (by[L] || 0) + 1; }); });
  const all = {};
  hits.forEach((p) => p._i.forEach((L) => { all[L] = (all[L] || 0) + 1; }));
  c.n = hits.length;
  c.t = hits.length >= 250 ? 0 : hits.length >= 80 ? 1 : hits.length >= 20 ? 2 : 3;  // tier
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
    (p.act ? 1 : 0) | (p.dp === 1 ? 2 : 0),
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
  players: compact,
  cats: CATS.map((c) => ({ i: c.i, l: c.l, p: c.p, g: c.g, n: c.n, t: c.t })),
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
console.log('playable letters  ' + PLAYABLE.length + '  ' + PLAYABLE.join(''));
console.log('  per letter      ' + LETTERS.filter(L => byLetter[L].length).map((L) => L + ':' + byLetter[L].length).join(' '));
console.log('data file         ' + (size / 1024).toFixed(0) + ' KB  -> arcade/sportegories-data.js');
