/* A number a player reads has to be the number Run The Diamond plays.
 *
 *   node baseball/check-numbers.mjs            the two pages
 *   node baseball/check-numbers.mjs --list     every claim it found
 *   node baseball/check-numbers.mjs --update   re-record the coverage counts
 *
 * The cap was written out by hand TWELVE times across baseball/index.html and
 * baseball/how-to-play.html, and nothing held any of them to CAP_MUSD. Four of the
 * twelve are in a `<head>`: the meta description, the og and twitter descriptions,
 * and a JSON-LD block. THE JSON-LD IS THE WORST PLACE TO KEEP A STALE NUMBER,
 * because that block is what Google renders in a rich result, so the wrong figure
 * gets read by people who never open the page.
 *
 * Change the cap and the game charges the new one while every sentence describing
 * it promises the old one. Nothing throws. The only symptom is a guide that lies,
 * found by a player. THIS GAME HAS ALREADY HAD ITS CAP SWEPT ONCE.
 *
 * `index.html` now interpolates what it can (`.capn`, filled by capSync at boot) and
 * this file holds the half that cannot interpolate at all: a `<head>` is parsed
 * before any script runs, and how-to-play.html loads no engine.
 *
 * WHY THIS IS BASEBALL'S OWN FILE AND NOT A ROW IN scripts/check-numbers.mjs.
 * That one accepts a claim if it matches EITHER the college or the NFL game, which
 * its own header calls a deliberate weakening: those two pages sell each other, so
 * a page cannot be tied to one engine. Adding a third game there would loosen every
 * claim for the two already in it. Hoops made the same call for the same reason and
 * keeps its number check in verify.mjs.
 *
 * AND THIS PAGE DOES DESCRIBE THE OTHER TWO GAMES, which the first draft of this
 * file assumed it did not, and which its own first run disproved: the modes sheet
 * ends in a cross-promo carrying "Six legends under a $140M cap, then all 17 games"
 * and "College football, 2005 to 2025 ... twelve games". Three engines, one page.
 *
 * So a claim is ATTRIBUTED rather than unioned: a sentence that names another game
 * is checked against THAT game's constants, and everything else against baseball's.
 * That is strictly stronger than the shared file's rule, because a wrong NFL cap in
 * a baseball cross-promo still fails here, where a union would wave it through. It
 * also closes a hole neither file covered: scripts/check-numbers.mjs never reads
 * /baseball/, so until now nothing at all held those two sentences.
 *
 * COVERAGE IS HALF THE CHECK. A regex that finds nothing passes. Reword "$170M cap"
 * to "a hundred and seventy million" and this file goes quiet and green while the
 * thing it guards walks away, which is how an extractor in this repo has been
 * silently wrong four times. The counts are RECORDED in numbers.json beside this
 * file, so a dropped claim and a new one both fail, and both want a re-record.
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { createRequire } from 'module';
import { copyOf } from '../scripts/check-copy.mjs';

/* ── THE JSON-LD IS READ AS JSON, NOT AS PROSE ──
   check-copy's walker finds these strings and its `looksLikeProse` filter then
   drops them, and the reason is worth knowing because it is backwards: that filter
   requires 90% of a string's characters to be in a "plain" class, and DIGITS ARE
   NOT IN THAT CLASS. So the more numbers a sentence carries the likelier it is to
   be discarded, which is the wrong way round for the corpus a number checker reads.
   Measured on the block below: 0.8939 against a threshold of 0.9, four numbers.

   For body copy it costs nothing, because `markupText` reaches the same sentence by
   the other path. A `<head>`'s JSON-LD is only ever inside a `<script>`, so the
   prose filter is the ONLY thing standing between it and the checker, and it is
   the block Google renders in a rich result.

   Parsing it is also simply better than a heuristic: it is structured data, so
   every string value can be walked exactly rather than guessed at. Left in this
   file rather than pushed into check-copy, because widening that filter admits SVG
   paths and style attributes (measured: 307 new strings across the guarded pages,
   most of them markup) and narrowing it again by excluding tags is the `</` filter
   that once hid twenty dashes. That is a deliberate pass on a shared file, not a
   thing to do in passing. */
function jsonLdStrings(file) {
  const raw = readFileSync(file, 'utf8');
  const out = [];
  for (const m of raw.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    let data;
    /* A block that will not parse is a broken block, and saying so is better than
       quietly checking nothing: this is the one place on the page whose readers are
       machines. */
    try { data = JSON.parse(m[1]); }
    catch (e) { out.push({ bad: file + ': JSON-LD does not parse: ' + e.message }); continue; }
    (function walk(v) {
      if (typeof v === 'string') { out.push(v); return; }
      if (Array.isArray(v)) { v.forEach(walk); return; }
      if (v && typeof v === 'object') { Object.values(v).forEach(walk); }
    })(data);
  }
  return out;
}

const require = createRequire(import.meta.url);
const ACH = require('./achievements.js');

const PAGES = ['baseball/index.html', 'baseball/how-to-play.html'];
const LEDGER = new URL('numbers.json', import.meta.url);

/* The seasons a pool actually holds, so "1901 to 2025" is checked against the data
   rather than against a memory of it. The end of every one of these moves. */
function seasonRange(file, key) {
  const raw = JSON.parse(readFileSync(new URL(file, import.meta.url), 'utf8'));
  const rows = Array.isArray(raw) ? raw : (raw.rows || raw.players || []);
  let lo = Infinity, hi = -Infinity;
  for (const r of rows) {
    const s = r[key] != null ? r[key] : r.season;
    if (typeof s === 'number') { if (s < lo) lo = s; if (s > hi) hi = s; }
  }
  return [lo, hi];
}

/* The three engines this page can be talking about. Baseball is the default and the
   other two are reached only by a sentence that names them. */
const ENGINES = {
  mlb: {
    name: 'baseball', C: require('./engine.js').CONSTANTS,
    slots: require('./engine.js').SLOTS.length,
    years: seasonRange('data/players.json', 's'),
  },
  nfl: {
    name: 'football', C: require('../football/engine.js').CONSTANTS,
    slots: (require('../football/engine.js').SLOTS || []).length,
    years: seasonRange('../football/data/player_seasons.json', 'season'),
  },
  cfb: {
    name: 'college', C: require('../cfb/engine.js').CONSTANTS,
    slots: (require('../cfb/engine.js').SLOTS || []).length,
    years: seasonRange('../cfb/data/cfb_player_seasons.json', 'season'),
  },
};

/* WHICH GAME IS THIS SENTENCE ABOUT. Read off the sentence rather than off the page,
   because the cross-promo puts all three on one page and a page-wide answer would
   hand baseball's constants to a paragraph about the NFL. */
/* CASE MATTERS HERE, and the first draft got it wrong in the direction that reports
   a correct page as broken: how-to-play's og description ends "chase the perfect
   season", which is a phrase, and a case-insensitive test read it as the NFL game's
   TITLE and then held a baseball sentence to football's cap. A game's name is a
   proper noun; "NFL" and "NIL" are initialisms and are unambiguous either way. */
function engineFor(s) {
  if (/\bNFL\b/.test(s) || /The Perfect Season/.test(s)) return ENGINES.nfl;
  if (/\bNIL\b|\bCFB\b/.test(s) || /College football|Perfect College/.test(s)) return ENGINES.cfb;
  return ENGINES.mlb;
}

const WORD = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30,
  forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
/* "Thirty-six" is two words and one number. */
function wordNum(s) {
  const t = String(s).toLowerCase().trim().replace(/\s+/g, '-');
  if (WORD[t] != null) return WORD[t];
  const m = t.match(/^(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)-(\w+)$/);
  if (m && WORD[m[1]] != null && WORD[m[2]] != null) return WORD[m[1]] + WORD[m[2]];
  const n = Number(t.replace(/,/g, ''));
  return Number.isFinite(n) ? n : NaN;
}

const badgeCount = (ACH.CATALOGUE || ACH.CATALOG || []).length;

const FACTS = [
  {
    id: 'the cap',
    find: /\$([\d.]+)M/g,
    /* TIGHT, because a page about a draft is full of dollar figures: a player's
       price, a roster's spend and the money left are all $NNN M and none of them is
       the cap. 30 characters either side, and the keyword has to be in that window
       rather than merely on the page. */
    window: 30,
    near: /\bcap\b|budget|to spend|to fill|share a/i,
    /* A price or a valuation is not the cap. */
    notBefore: /\b(like|worth|at|costs?|for|spent|paid)\s+$/i,
    ok: (e) => [e.C.CAP_MUSD],
    why: 'CAP_MUSD',
  },
  {
    id: 'the season',
    find: /\b([\d,]+)[- ]games?\b/g,
    near: /season|simulate|play|regular/i,
    /* A playoff series is games too, and so is a win total. */
    notNear: /series|win|won/i,
    ok: (e) => [e.C.REGULAR_SEASON_GAMES],
    why: 'REGULAR_SEASON_GAMES',
  },
  {
    id: 'the roster',
    find: /\b([\w-]+)\b(?=[^.]{0,40}\b(?:spots?|positions?|legends?|players|slots?)\b)/gi,
    near: /draft|fill|roster|lineup|spots?|positions?|legends?/i,
    /* ONE IS NEVER A ROSTER SIZE. "You draft one player who fits an open spot" is
       how many you take per SPIN, and it matched this rule and was reported as a
       twelve-man roster written as 1. No game here fields a roster of one, so the
       number itself is what tells the two sentences apart. */
    skip: (v) => v === 1,
    ok: (e) => [e.slots],
    why: 'SLOTS.length',
  },
  {
    id: 'the anchor innings',
    /* A starter over this many innings is priced on what he did in this many, which
       is the fourth reason a WAR lookup disagrees with a tile. The moment it was
       written into a sentence it became a number that can go stale, which is what
       this file is for. */
    find: /\b(\d+) innings\b/gi,
    near: /priced|price|starter|threw|WAR/i,
    ok: (e) => [e.C.ANCHOR_IP],
    why: 'ANCHOR_IP',
  },
  {
    id: 'the badge catalog',
    find: /\b([\w-]+)\s+badges\b/gi,
    near: /badge/i,
    ok: () => [badgeCount],
    why: 'the length of CATALOGUE in baseball/achievements.js',
  },
  {
    id: 'the season range',
    /* Both spellings, because the head writes "1901-2025" and the prose writes
       "1901 to 2025". A HYPHEN AND NOT AN EN DASH: the first draft of this offered
       both and the dash checker failed on its own regex literal, which is correct,
       and the alternative was dead anyway. A guarded page cannot contain an en dash. */
    find: /\b(19\d\d|20\d\d)\s*(?:to|-)\s*(19\d\d|20\d\d)\b/g,
    near: /season|MLB|from|every|built on|roster|football/i,
    ok: (e) => e.years,
    why: 'the first and last season in the pool',
  },
];

/* ------------------------------------------------------------------------- */
const args = process.argv.slice(2);
const list = args.includes('--list');
const update = args.includes('--update');

const wrong = [];
const counts = {};
const seen = [];

const broken = [];
for (const page of PAGES) {
  if (!existsSync(page)) { wrong.push([page, { id: 'the page', why: 'it is in PAGES' }, '', 'missing', '']); continue; }
  const ld = jsonLdStrings(page);
  ld.filter((x) => x && x.bad).forEach((x) => broken.push(x.bad));
  const corpus = [...new Set([...copyOf(page), ...ld.filter((x) => typeof x === 'string')])];
  for (const s of corpus) {
    for (const fact of FACTS) {
      fact.find.lastIndex = 0;
      let m;
      while ((m = fact.find.exec(s))) {
        const w = fact.window || 70;
        const before = s.slice(Math.max(0, m.index - w), m.index);
        const window = before + s.slice(m.index, m.index + m[0].length + w);
        if (!fact.near.test(window)) continue;
        if (fact.notBefore && fact.notBefore.test(before)) continue;
        if (fact.notNear && fact.notNear.test(window)) continue;
        const claims = m.slice(1).filter((x) => x !== undefined);
        /* A word that is not a number at all is not a claim. `the roster` matches any
           word before "players", so "MLB legends" and "real players" reach here and
           mean nothing: they are skipped rather than reported as a wrong count.
           SKIPPED BEFORE THE COUNT, or the coverage ledger fills with matches that
           were never claims and drifts on any rewording of the prose around them. */
        const nums = claims.map(wordNum)
          .filter((v) => Number.isFinite(v) && !(fact.skip && fact.skip(v)));
        if (!nums.length) continue;
        const key = page + ' :: ' + fact.id;
        counts[key] = (counts[key] || 0) + 1;
        const eng = engineFor(s);
        seen.push([page, fact.id, m[0].trim(), s]);
        const allowed = fact.ok(eng);
        for (const v of nums) {
          if (!allowed.some((o) => Number(o) === v)) wrong.push([page, fact, m[0].trim(), v, s, eng]);
        }
      }
    }
  }
}

if (list) {
  seen.forEach(([p, id, hit, s]) => {
    console.log(p + '  [' + id + ']  ' + hit);
    console.log('    ' + s.slice(0, 120));
  });
  console.log('\n' + seen.length + ' claims across ' + Object.keys(counts).length + ' page/fact pairs');
  process.exit(0);
}

if (update) {
  writeFileSync(LEDGER, JSON.stringify(counts, null, 2) + '\n');
  console.log('recorded ' + Object.keys(counts).length + ' page/fact pairs, '
    + Object.values(counts).reduce((a, b) => a + b, 0) + ' claims');
  process.exit(0);
}

let bad = 0;

if (broken.length) {
  bad += broken.length;
  console.log('\nA JSON-LD block does not parse, so nothing in it is being checked:\n');
  broken.forEach((b) => console.log('  ' + b));
}

if (wrong.length) {
  bad += wrong.length;
  console.log('\n' + wrong.length + ' number' + (wrong.length === 1 ? '' : 's')
    + ' a player reads that the game does not play.\n');
  for (const [p, fact, hit, v, s, eng] of wrong) {
    console.log('  ' + p + '  (' + fact.id + ')');
    console.log('    says ' + JSON.stringify(hit) + ', which reads as ' + v);
    /* The engine is NAMED, because the sentence is what chose it: a claim reported
       against the wrong game is the attribution being wrong rather than the page. */
    console.log('    the ' + (eng ? eng.name : '?') + ' game plays: '
      + (eng && fact.ok ? fact.ok(eng).join(' or ') : '?') + '   [' + fact.why + ']');
    console.log('    ' + String(s).slice(0, 130));
  }
}

/* ---- the coverage ---- */
const before = existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, 'utf8')) : null;
if (!before) {
  console.log('\nNo baseball/numbers.json yet. Record it with:');
  console.log('  node baseball/check-numbers.mjs --update\n');
  process.exit(1);
}
const keys = [...new Set([...Object.keys(before), ...Object.keys(counts)])].sort();
const drift = keys.filter((k) => (before[k] || 0) !== (counts[k] || 0));
if (drift.length) {
  bad += drift.length;
  console.log('\nThe claims on the page moved. A claim that stops being found is a claim');
  console.log('that stopped being checked, so this is a failure and not a note.\n');
  for (const k of drift) console.log('  ' + k + ': recorded ' + (before[k] || 0) + ', found ' + (counts[k] || 0));
  console.log('\nIf that is the intended wording, re-record it:');
  console.log('  node baseball/check-numbers.mjs --update');
}

const total = Object.values(counts).reduce((a, b) => a + b, 0);
console.log('');
console.log(bad
  ? bad + ' problem' + (bad === 1 ? '' : 's')
  : 'numbers ok: ' + total + ' claims across ' + PAGES.length + ' pages agree with the engine');
process.exit(bad ? 1 : 0);
