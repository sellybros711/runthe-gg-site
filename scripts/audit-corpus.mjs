/* Audit the arcade player corpus for missing and corrupted careers.
 *
 * WHY. A player emailed that Sportegories rejected "Steven Jackson" for the
 * Rams. That turned out to be a franchise-labelling bug (fixed, see
 * check-franchise.mjs), but chasing it surfaced two more classes of wrong that
 * nothing was watching:
 *
 *   MISSING   Bo Jackson is not in the corpus at all. Nor is Sid Luckman, or
 *             Bob Pettit, or Tris Speaker. A category they belong to will keep
 *             refusing them, in the same voice it uses for a wrong answer.
 *   CORRUPTED "Marcus Allen" is one record holding two men: the Hall of Fame
 *             running back (Raiders, Chiefs) and an active 22-year-old Vikings
 *             cornerback. The corpus merges on sport plus name, so any two
 *             players who share both become one person with a spliced career.
 *
 * Both are silent. Nothing crashes, no count looks odd, the game just quietly
 * judges an answer wrong. This prints them so they can be fixed on purpose.
 *
 *   node scripts/audit-corpus.mjs          summary
 *   node scripts/audit-corpus.mjs --full   every row
 *
 * Reads only files already in the repo, so it runs offline.
 */
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const R = (p) => readFileSync(path.join(ROOT, p), 'utf8');
const FULL = process.argv.includes('--full');

const G = {};
new Function('window', 'self', 'module', R('arcade/match/entities.js'))(G, G, {});
for (const f of ['arcade/former.js', 'arcade/rosters.js', 'arcade/supplement.js', 'arcade/stars.js']) {
  new Function('window', 'self', R(f))(G, G);
}
const W = {};
new Function('window', R('arcade/sportegories-data.js'))(W);
const D = W.RTG_SPORTEGORIES_DATA;

const FORMER = (G.RTG_FORMER && G.RTG_FORMER.players) || [];
const ROSTERS = (G.RTG_ROSTERS && G.RTG_ROSTERS.players) || [];
const SUPP = (G.RTG_SUPPLEMENT && G.RTG_SUPPLEMENT.players) || [];
const STARS = G.RTG_STARS || {};

const nk = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();

const inCorpus = new Set(D.players.map((p) => D.sports[p[1]] + '|' + nk(p[0])));

const out = [];
const say = (s) => out.push(s);
const list = (rows, cap) => (FULL || rows.length <= cap ? rows : rows.slice(0, cap).concat([`... and ${rows.length - cap} more (--full)`]));

/* stars.js is a recognizability overlay for several games, so it carries names
   that are famous in sport without ever having been players. They are not
   corpus gaps and should not be reported as such. */
const NOT_PLAYERS = new Set([
  'bill belichick', 'andy reid', 'sean mcvay', 'sean payton', 'mike tomlin', 'john harbaugh',
  'kyle shanahan', 'nick sirianni', 'zac taylor', 'bruce arians', 'pete carroll',
  'mike mccarthy', 'ron rivera', 'trey wingo'
].map(nk));

// ---------------------------------------------------------------- 1) missing
/* A star that does not match the corpus is one of two very different problems.
 *
 * Either the player is genuinely absent (Bo Jackson was), or stars.js spells him
 * differently from the corpus: "Nic Batum" against "Nicolas Batum", "Lu Dort"
 * against "Luguentz Dort", "Melvin Upton Jr." against "B.J. Upton". The second
 * kind is worse than it looks, because stars.js is not just a checklist. It is
 * the recognizability gate the games filter on, so a name that fails to match is
 * a famous player being treated as unrecognizable and quietly dropped from
 * Common Ground and Odd One Out.
 *
 * So look for a near-match before calling anyone missing: same sport, same
 * surname, and a first name where one is a prefix of the other or they share an
 * initial. That separates "go and add him" from "go and fix the spelling". */
const SUFFIXES = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'v']);
// Strip suffixes BEFORE taking a surname, or "Kelly Oubre Jr." files under "jr".
const bare = (s) => nk(s).split(' ').filter((t) => t && !SUFFIXES.has(t));

const bySport = new Map();
for (const p of D.players) {
  const sp = D.sports[p[1]];
  if (!bySport.has(sp)) bySport.set(sp, []);
  bySport.get(sp).push({ name: p[0], t: bare(p[0]) });
}
// one edit apart, which covers Bogdanovic against Bogdanovich
function within1(a, b) {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}
/* A shared first initial is NOT evidence: Josh Howard is not Juwan Howard, and
   James Cook is not Jameel Cook. Only a first name that is a genuine short form
   counts, which in practice means one is a prefix of the other. */
function nearMatch(sport, name) {
  const t = bare(name);
  if (t.length < 2) return null;
  const first = t[0], last = t[t.length - 1];
  for (const c of (bySport.get(sport) || [])) {
    if (c.t.length < 2) continue;
    if (!within1(last, c.t[c.t.length - 1])) continue;
    const cf = c.t[0];
    if (cf === first) return c.name;
    if (first.length >= 2 && cf.length >= 2 && (cf.startsWith(first) || first.startsWith(cf))) return c.name;
  }
  return null;
}

const missing = [], misspelt = [];
for (const sport of Object.keys(STARS)) {
  for (const tier of ['icons', 'stars']) {
    for (const name of (STARS[sport][tier] || [])) {
      const key = sport + '|' + nk(name);
      if (NOT_PLAYERS.has(nk(name))) continue;
      if (inCorpus.has(key)) continue;
      if (missing.some((m) => m.key === key) || misspelt.some((m) => m.key === key)) continue;
      const near = nearMatch(sport, name);
      if (near) misspelt.push({ key, sport, tier, name, near });
      else missing.push({ key, sport, tier, name });
    }
  }
}
const totalStars = Object.keys(STARS).reduce((a, s) => a + (STARS[s].icons || []).length + (STARS[s].stars || []).length, 0);

say(`\n1a) STARS NAMED DIFFERENTLY FROM THE CORPUS  ${misspelt.length} of ${totalStars}`);
say('   stars.js is the recognizability gate, not just a checklist, so a name');
say('   that does not match means a famous player is being filtered OUT of');
say('   Common Ground and Odd One Out as unrecognizable. Fix the spelling.');
for (const r of list(misspelt.map((m) => `     ${m.sport}  "${m.name}"  ->  corpus has "${m.near}"`), 40)) say(r);

say(`\n1b) STARS GENUINELY ABSENT FROM THE CORPUS  ${missing.length} of ${totalStars}`);
say('   No near match on surname. These need adding to arcade/supplement.js.');
for (const g of ['icons', 'stars']) {
  const rows = missing.filter((m) => m.tier === g);
  if (!rows.length) continue;
  say(`   ${g.toUpperCase()} (${rows.length}):`);
  for (const r of list(rows.map((m) => `     ${m.sport}  ${m.name}`), 30)) say(r);
}

// ------------------------------------------------------------- 2) supplement
const suppMissing = SUPP.filter((p) => !inCorpus.has(p.sport + '|' + nk(p.name)));
say(`\n2) HAND-CURATED SUPPLEMENT NOT REACHING THE CORPUS  ${suppMissing.length} of ${SUPP.length}`);
say('   arcade/supplement.js exists precisely to add recognizable role players.');
say('   If this number is not zero the generator is not loading it.');
for (const r of list(suppMissing.map((p) => `     ${p.sport}  ${p.name}`), 12)) say(r);

// -------------------------------------------------------------- 3) collisions
/* Two people, one record. The merge key is sport + name, so a Hall of Famer and
   a rookie who happen to share a name become a single spliced career: Marcus
   Allen ends up a running back who is also a cornerback, with the Chiefs and
   the Vikings and none of his eleven Raiders years.

   College is a weak signal on its own because the two sources spell schools
   differently (Ole Miss / Mississippi, LSU / Louisiana State), so it is
   reported separately rather than treated as proof. */
const SIDE = {
  Quarterback: 'off', 'Running Back': 'off', Fullback: 'off', 'Wide Receiver': 'off',
  'Tight End': 'off', 'Offensive Lineman': 'off', 'Offensive Tackle': 'off', Guard: 'off', Center: 'off',
  Cornerback: 'def', Safety: 'def', Linebacker: 'def', 'Defensive End': 'def',
  'Defensive Tackle': 'def', 'Defensive Lineman': 'def',
  Kicker: 'st', 'Place Kicker': 'st', Punter: 'st', 'Long Snapper': 'st'
};
const formerBy = new Map();
for (const p of FORMER) formerBy.set(p.sport + '|' + nk(p.name), p);

const hard = [], soft = [];
for (const r of ROSTERS) {
  const key = r.s + '|' + nk(r.n);
  const f = formerBy.get(key);
  if (!f) continue;
  const fs = SIDE[f.pos], rs = SIDE[r.p];
  const posClash = fs && rs && fs !== rs;
  // A career that ended last century cannot be a 20-something on a roster now.
  const lastDecade = Array.isArray(f.decade) && f.decade.length ? Math.max(...f.decade) : null;
  const eraClash = lastDecade !== null && lastDecade <= 2000 && (r.age == null || r.age < 45);
  const row = `     ${r.s}  ${f.name}` +
    `\n         former: ${f.pos || '?'}, ${(f.decade || []).join('/') || 'no decades'}, fame ${f.f}` +
    `\n         roster: ${r.p || '?'}, ${r.t || '?'}, age ${r.age == null ? '?' : r.age}`;
  if (posClash || eraClash) hard.push({ key, row, why: [posClash && 'position', eraClash && 'era'].filter(Boolean).join(' + ') });
  else if (f.col && r.col && nk(f.col) !== nk(r.col)) soft.push(`     ${r.s}  ${f.name}  (${f.col} vs ${r.col})`);
}
/* These used to be merged. The generator now treats a name as a bucket of
   people, so each of these should appear in the corpus MORE THAN ONCE. Any that
   still resolve to a single record means the split rule missed a pair. */
const countByName = new Map();
for (const p of D.players) {
  const k = D.sports[p[1]] + '|' + nk(p[0]);
  countByName.set(k, (countByName.get(k) || 0) + 1);
}
const stillMerged = hard.filter((h) => (countByName.get(h.key) || 0) < 2);
say(`\n3) NAMES SHARED BY MORE THAN ONE PERSON  ${hard.length} found, ${stillMerged.length} still merged`);
say('   The corpus keys on sport plus name, so these used to collapse into one');
say('   spliced career. Each should now exist as separate people. Anything in');
say('   "still merged" is a pair the split rule did not catch.');
for (const h of list(stillMerged.map((h) => h.row + `\n         clash: ${h.why}`), 15)) say(h);
say(`   WORTH A LOOK (${soft.length}): different college, which is usually just the two`);
say('   sources spelling a school differently, but sometimes is two men.');
for (const s of list(soft, 10)) say(s);

// ------------------------------------------------------------ 4) thin careers
/* A one-club career is only suspicious for someone we KNOW is famous, and even
   then plenty are real (Al Kaline, Alan Trammell). Scoped to stars.js names so
   this is a short review list rather than 655 rows nobody will read. Marcus
   Allen is the shape being hunted: a household name carrying one club because
   the source stopped reading after his last stop. */
const starNames = new Set();
for (const sport of Object.keys(STARS)) {
  for (const tier of ['icons', 'stars']) for (const n of (STARS[sport][tier] || [])) starNames.add(sport + '|' + nk(n));
}
/* Read the BUILT corpus, not former.js. A repair added to supplement.js fixes
   the player without touching the source, so auditing the source would keep
   reporting names that are already correct in the game. */
const DEC0 = D.dec0 || 1900;
const decadesOf = (p) => { let n = 0; for (let b = p[6] || 0; b; b >>= 1) n += b & 1; return n; };
const thin = D.players.filter((p) => starNames.has(D.sports[p[1]] + '|' + nk(p[0])) &&
  (p[3] || []).length <= 1 && decadesOf(p) >= 3)
  .map((p) => ({ sport: D.sports[p[1]], name: p[0], t: (p[3] || []).map((i) => D.teams[i]), decade: [] }));
say(`\n4) HOUSEHOLD NAMES WITH ONE CLUB ACROSS 3+ DECADES  ${thin.length}`);
say('   Some of these are genuine one-club careers. The rest are a source that');
say('   stopped reading, and every category on the missing club refuses them.');
for (const r of list(thin.map((p) => `     ${p.sport}  ${p.name}  (${(p.t || []).join(', ') || 'NO TEAMS'})`), 30)) say(r);

// --------------------------------------------------------------- 5) no teams
/* Only team sports. A golfer with no franchise is a golfer, not a defect. */
const TEAM_SPORTS = new Set(['NBA', 'NFL', 'MLB', 'NHL', 'WNBA', 'Soccer']);
const noTeams = D.players.filter((p) => !(p[3] || []).length && p[8] >= 3 && TEAM_SPORTS.has(D.sports[p[1]]));
say(`\n5) TEAM-SPORT RECORDS WITH NO CLUB AT ALL  ${noTeams.length}`);
say('   These can never satisfy any franchise category.');
for (const r of list(noTeams.map((p) => `     ${D.sports[p[1]]}  ${p[0]}  (fame ${p[8]})`), 25)) say(r);

// ------------------------------------------------------------------- summary
console.log(out.join('\n'));
console.log('\n---------------------------------------------------------------');
console.log(`corpus ${D.players.length} players · ${D.teams.length} teams · ${D.cats.length} categories`);
console.log(`stars misnamed ${misspelt.length} · stars absent ${missing.length} · supplement gap ${suppMissing.length} · shared names ${hard.length} (${stillMerged.length} still merged) · one-club ${thin.length} · teamless ${noTeams.length}`);
