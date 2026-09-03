#!/usr/bin/env node
/* check-arcade-shared.mjs: the two modules every typed game now leans on.
 *
 * type.js decides whether someone's answer counts. Get it wrong in the
 * permissive direction and the game is free; get it wrong in the strict
 * direction and you tell a person who knew the answer that they didn't, which
 * is the single worst thing this arcade can do. So the matching rules are
 * pinned here rather than discovered in production.
 *
 * fact.js prints history to the player as fact. Every line has to be
 * derivable from the record, and it has to exist for essentially everyone, or
 * the feature is a blank space most rounds.
 *
 *   node scripts/check-arcade-shared.mjs
 */
import { readFileSync } from 'node:fs';

const R = new URL('../arcade/', import.meta.url).pathname;
const win = {}; globalThis.window = win; globalThis.self = win;
for (const f of ['match/entities.js', 'former.js', 'stars.js', 'awards.js', 'supplement.js', 'data.js'])
  try { new Function('window', 'self', 'module', 'exports', readFileSync(R + f, 'utf8'))(win, win, undefined, undefined); } catch (e) {}
for (const f of ['type.js', 'fact.js'])
  new Function('window', 'self', 'module', 'exports', readFileSync(R + f, 'utf8'))(win, win, undefined, undefined);

const T = win.RTGType, F = win.RTGFact;
const ENT = win.GRID_ENTITIES, KNOWN = ENT.filter(win.RTG_KNOWN);

let pass = 0, fail = 0;
const is = (a, b, what) => {
  if (a === b) { pass++; return; }
  fail++; console.log(`  FAIL ${what}\n       expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
};
const ok = (c, what) => is(!!c, true, what);

// ---------------------------------------------------------------- names ----
// Accepted: the same person, typed the way a person types.
is(T.sameName('ken griffey jr', 'Ken Griffey Jr.'), true, 'suffix and casing');
is(T.sameName('KEN GRIFFEY', 'Ken Griffey Jr.'), true, 'typer omits the suffix');
is(T.sameName('Michael Jeffrey Jordan', 'Michael Jordan'), true, 'middle name ignored');
is(T.sameName("shaquille o'neal", 'Shaquille O’Neal'), true, 'curly vs straight apostrophe');
is(T.sameName('Luka Doncic', 'Luka Dončić'), true, 'accents folded');
is(T.sameName('  Tim   Duncan ', 'Tim Duncan'), true, 'stray whitespace');
// Refused: not enough, or not them.
is(T.sameName('Jordan', 'Michael Jordan'), false, 'a surname alone is a different game');
is(T.sameName('Michael Jordon', 'Michael Jordan'), false, 'misspelling is not a match');
is(T.sameName('Michael Jordan', 'Michael Jones'), false, 'different player');
is(T.hasFullName('Jordan'), false, 'one name is not a full name');
is(T.hasFullName('Griffey Jr'), false, 'a suffix does not count as the second name');
is(T.hasFullName('Michael Jordan'), true, 'two names are');

// ------------------------------------------------------------- colleges ----
is(T.sameCollege('UNC', 'North Carolina'), true, 'initialism alias');
is(T.sameCollege('LSU', 'Louisiana State'), true, 'initialism alias 2');
is(T.sameCollege('university of michigan', 'Michigan'), true, 'institutional words stripped');
is(T.sameCollege('Ohio State University', 'Ohio State'), true, 'trailing University');
is(T.sameCollege('Miami', 'Miami (FL)'), true, 'state-code disambiguator');
// The one that matters: adjacent schools are not the same school.
is(T.sameCollege('Michigan', 'Michigan State'), false, 'Michigan is not Michigan State');
is(T.sameCollege('Ohio', 'Ohio State'), false, 'Ohio is not Ohio State');
is(T.sameCollege('mi', 'Michigan'), false, 'a fragment is not an answer');

// ------------------------------------------------------------ suggester ----
const ps = T.playerSource(KNOWN);
const vals = (q) => ps(q, 8).map((x) => (x && x.value) || x);
is(vals('lebr')[0], 'LeBron James', 'suggest by first name');
ok(vals('jord').includes('Michael Jordan'), 'suggest by last name');
is(ps('l', 8).length, 0, 'a single letter suggests nothing');
ok(vals('gri').length > 1, 'a common prefix returns several');
// A surname match is what someone reaching for a half-remembered name types,
// so it has to outrank a first-name match on the same letters.
ok(vals('jordan')[0] === 'Michael Jordan', 'surname matches rank first');
// The league rides along, because two players share a name more often than
// you would think.
is(ps('lebr', 8)[0].sub, 'NBA', 'suggestions carry their league');
const cs = T.collegeSource(ENT);
is(cs('mich', 7)[0], 'Michigan', 'most-attended school ranks first');
ok(cs('mich', 7).includes('Michigan State'), 'and the neighbours are offered too');

// ------------------------------------------------------------- the fact ----
// A fact for essentially everyone, or the line is a blank space most rounds.
const missing = KNOWN.filter((e) => !F.of(e, { seed: 1 }));
is(missing.length, 0, `every recognisable player has a fact (${missing.length} without)`);
const missingAll = ENT.filter((e) => !F.of(e, { seed: 1 })).length;
ok(missingAll / ENT.length < 0.01, `almost every corpus player has one (${missingAll}/${ENT.length} without)`);

// House style: no em or en dashes anywhere in generated copy. Written as
// escapes so this file does not itself trip the repo's dash checker.
const DASH = new RegExp('[' + String.fromCharCode(8212, 8211) + ']');
const dashed = KNOWN.map((e) => F.of(e, { seed: 1 })).filter((s) => DASH.test(s));
is(dashed.length, 0, 'no em or en dashes in generated facts');

// Fits on a line or two under a result, not a paragraph.
const tooLong = KNOWN.map((e) => F.of(e, { seed: 1 })).filter((s) => s.length > 120);
is(tooLong.length, 0, 'facts stay short enough to sit under a result');

// The same player should not say the identical thing every single time.
let varied = 0;
KNOWN.slice(0, 500).forEach((e) => {
  const s = new Set(); for (let i = 0; i < 6; i++) s.add(F.of(e, { seed: i }));
  if (s.size > 1) varied++;
});
ok(varied / 500 > 0.7, `most players have more than one line (${varied}/500)`);

// skip lets a game suppress what its own round just showed
const alomar = KNOWN.find((e) => e.name === 'Roberto Alomar');
ok(alomar, 'fixture player present');
if (alomar) {
  const withTeams = F.of(alomar, { seed: 3 });
  const without = F.of(alomar, { seed: 3, skip: { teams: 1 } });
  ok(!!without, 'a skipped kind still yields a fact');
  ok(!/franchises in all|Career stops/.test(without), 'and the skipped kind is genuinely gone');
  ok(!!withTeams, 'unskipped still works');
}

// Determinism: the archive replays past days, so the same seed is the same line.
const someone = KNOWN[42];
is(F.of(someone, { seed: 7 }), F.of(someone, { seed: 7 }), 'same seed, same fact');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
