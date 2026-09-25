/*
 * check-numbers.mjs : a number a player reads has to be the number the game plays.
 *
 *   node scripts/check-numbers.mjs            check the guarded pages
 *   node scripts/check-numbers.mjs --list     print every claim it found
 *   node scripts/check-numbers.mjs --update   re-record the coverage counts
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------------
 * The in-game rules sheet in cfb/index.html already gets this right:
 *
 *     const cap = M0(E.CONSTANTS.CAP_MUSD);
 *     const R1  = E.CONSTANTS.RESPIN_LADDER_MUSD.map(M0).join(', then ');
 *
 * So tuning CAP_MUSD rewrites the sheet. It rewrites nothing else. "$11M" is
 * hardcoded twenty-two times across six files (cfb/index.html, cfb/how-to-play.html,
 * the homepage, about.html, cfb/og-source.html, football/index.html), and a static
 * page cannot interpolate. Change the cap and the game charges the new one while
 * every page describing it goes on promising the old one.
 *
 * NOTHING THROWS. Nothing fails. The only symptom is a guide that lies, found by a
 * player who read it and then played something else. This is the same class the
 * Commissioner audit spent two commits on ("five years" on six screens after a term
 * stopped being five seasons), and the lesson written down there was: when a number
 * is in copy, either interpolate it or write the sentence without it. This is the
 * checker for the half of the site that cannot interpolate.
 *
 * THE WORST PLACE TO KEEP A STALE NUMBER IS THE JSON-LD. cfb/how-to-play.html carries
 * a schema.org HowTo block repeating the budget, the re-spin ladder, the game count
 * and the top-twelve rule, and that block is what Google renders in a rich result. It
 * is checked here because copyOf() already reads it: the step text comes out as string
 * literals like any other copy.
 *
 * ---------------------------------------------------------------------------
 * A CLAIM IS CHECKED AGAINST BOTH GAMES, AND THAT IS A DELIBERATE WEAKENING
 * ---------------------------------------------------------------------------
 * cfb/index.html sells the NFL game on its own front page ("legends under the $140M
 * cap, then play all 17 games"), and the homepage describes both. So a page cannot be
 * tied to one engine, and every claim is accepted if it matches EITHER game's value.
 *
 * What that costs: if the two games ever shared a value for a fact, a stale claim
 * about one would be covered by the other. They share none today (11 against 140, 12
 * against 17), and the SHARED list below is checked on every run so that the day they
 * collide is a failure here rather than a silent hole.
 *
 * ---------------------------------------------------------------------------
 * COVERAGE IS HALF THE CHECK
 * ---------------------------------------------------------------------------
 * A regex that finds nothing passes. Reword "$11M NIL budget" to "eleven million in
 * NIL" and this file goes quiet and green while the thing it guards walks away. That
 * failure has already happened twice in this repo, both times in an extractor (see the
 * header of check-copy.mjs), so the counts are RECORDED, the way check-cachebust.mjs
 * records hashes, and a change to any of them has to be looked at and re-recorded:
 *
 *     node scripts/check-numbers.mjs --update
 *
 * A dropped claim and a new one both fail. That is the point: both are somebody
 * editing copy that states a rule, and both deserve thirty seconds of attention.
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { createRequire } from 'module';
import { relative } from 'path';
import { copyOf } from './check-copy.mjs';

const require = createRequire(import.meta.url);
const CFB = require('../cfb/engine.js').CONSTANTS;
const NFL = require('../football/engine.js').CONSTANTS;
/* THE THIRD ENGINE ARRIVED WITH A LAUNCH, and it had to. The home page describes
   every game on the site, so the moment Run The Diamond was linked from it the
   page started making claims ($170M, all 162 games) that neither of the two
   engines above plays, and this file correctly called four correct sentences
   defects. Widening `ok` is the documented cost of one file guarding a page that
   is about more than one game, and it is written up under `the cap` below.
   The game has since come back OFF the home page, and this import stays: it
   allows two values and claims nothing, so it costs nothing while no page states
   them, and it is the edit a relaunch would otherwise have to remember. */
const MLB = require('../baseball/engine.js').CONSTANTS;

/* The player data decides the year range, not a constant: "since 2005" and
   "2005 to 2025" are claims about the file, and the file is what a refresh moves. */
function seasonRange(file) {
  const raw = JSON.parse(readFileSync(new URL(file, import.meta.url), 'utf8'));
  const rows = Array.isArray(raw) ? raw : (raw.players || Object.values(raw)[0]);
  const ys = rows.map((p) => p.season || p.year).filter((y) => typeof y === 'number');
  return { from: Math.min(...ys), to: Math.max(...ys) };
}
const CFB_YEARS = seasonRange('../cfb/data/cfb_player_seasons.json');
const NFL_YEARS = seasonRange('../football/data/player_seasons.json');

const money = (m) => (m < 1 ? '$' + Math.round(m * 1000) + 'K' : '$' + m + 'M');

/* ---------------------------------------------------------------------------
 * The facts.
 *
 * `find` pulls candidate numbers out of a sentence. `near` is what has to be beside
 * one for it to be a claim about this fact rather than a number that happens to look
 * like it: football/index.html alone carries thirty different dollar figures, almost
 * none of them the cap. `ok` is every value that is currently true in either game.
 *
 * WORDS COUNT AS NUMBERS. "twelve-team playoff", "top four seeds" and "two running
 * backs" are all claims, and a checker that only reads digits would pass every one of
 * them for ever. WORD maps the ones this copy actually uses.
 * ------------------------------------------------------------------------- */
const WORD = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14,
  fifteen: 15, sixteen: 16, seventeen: 17,
};
const num = (s) => (WORD[String(s).toLowerCase()] ?? Number(s));

const FACTS = [
  {
    id: 'the cap',
    find: /\$[\d.]+M/g,
    /* TIGHT, 26 characters either side, because football/index.html carries thirty
       dollar figures and three of them are the cap. A sentence-wide window read
       "even when he plays like $40M. That gap is cap you never spend" as a claim
       about the salary cap, which is a simile about one player. */
    window: 26,
    near: /NIL|salary cap|\bcap\b|budget|to spend|signings/i,
    /* A price, a valuation or a rung on the ladder is not the cap. */
    notBefore: /\b(like|worth|at|costs|for)\s+$/i,
    notNear: /,\s*then\s*\$/,
    ok: [money(CFB.CAP_MUSD), money(NFL.CAP_MUSD), money(MLB.CAP_MUSD), '$280M'],
    why: 'CAP_MUSD in cfb, football and baseball engine.js ($280M is Full Team)',
  },
  {
    id: 'the re-spin ladder',
    /* THE WHOLE RUN, not the amounts one at a time. Every rung is written as
       "$500K, then $1M, then $1.5M", so matching the run is what tells a rung
       apart from the cap in the same sentence. Both games, both pages, one shape. */
    find: /\$[\d.]+[MK], then \$[\d.]+[MK], then \$[\d.]+[MK]/g,
    near: /./,
    all: /\$[\d.]+[MK]/g,
    /* BASEBALL IS DELIBERATELY NOT IN THIS ONE, and the collision check is what
       said so. Its ladder is $5M, $10M, $15M, which is the NFL game's ladder
       exactly, so adding it puts two games on one set of values and a stale
       claim about one would then be accepted as a correct claim about the other.
       That is the hole this file's header warns about, arriving for real.
       It buys nothing to pay for: no guarded page claims baseball's ladder,
       because the baseball pages are not on PAGES and the home page describes
       the game without pricing a re-spin. The cap and the season are added above
       because the home page really does state both, and neither collides. */
    ok: [...CFB.RESPIN_LADDER_MUSD.map(money), ...NFL.RESPIN_LADDER_MUSD.map(money)],
    why: 'RESPIN_LADDER_MUSD',
  },
  {
    id: 'the season',
    find: /\b(\d+)[- ]game(?:s|\b)|\ball (\d+) games\b/g,
    /* NOT a bare "games". The homepage says "5 games live" about the arcade, which is
       a count of products and not the length of anybody's season. */
    near: /season|play all|regular/i,
    ok: [CFB.REGULAR_SEASON_GAMES, NFL.REGULAR_SEASON_GAMES, MLB.REGULAR_SEASON_GAMES],
    why: 'REGULAR_SEASON_GAMES',
  },
  {
    id: 'the playoff field',
    find: /\btop (\d+|twelve|fourteen|sixteen)\b|\b(\d+|twelve|fourteen|sixteen)-team playoff\b/gi,
    near: /playoff|country|field|bracket/i,
    ok: [CFB.PLAYOFF_TEAMS, NFL.PLAYOFF_TEAMS].filter((v) => v != null),
    why: 'PLAYOFF_TEAMS',
  },
  {
    id: 'the byes',
    find: /\btop (\w+) seeds?\b/gi,
    near: /seed|bye|first round/i,
    ok: [CFB.PLAYOFF_BYES, NFL.PLAYOFF_BYES].filter((v) => v != null),
    why: 'PLAYOFF_BYES',
  },
  {
    id: 'the running back cap',
    find: /\b(\w+) running backs\b/gi,
    near: /running backs/i,
    ok: [CFB.POSITION_MAX && CFB.POSITION_MAX.RB, NFL.POSITION_MAX && NFL.POSITION_MAX.RB]
      .filter((v) => v != null),
    why: 'POSITION_MAX.RB',
  },
  {
    id: 'the seasons on the wheel',
    find: /\bsince (\d{4})\b|\b(\d{4}) to (\d{4})\b/g,
    near: /season|year|draft/i,
    ok: [CFB_YEARS.from, CFB_YEARS.to, NFL_YEARS.from, NFL_YEARS.to],
    /* THE OVERLAP IS EXPECTED HERE AND NOWHERE ELSE. Both datasets run to the same
       last season, because both are refreshed to the season just played, so the
       collision check below would fire on 2025 for ever. What this fact still
       catches is the end that moves: a refresh that adds 2026 to one game leaves
       every "2005 to 2025" on the site a year out of date, and that is the case
       worth failing on. The two START years are different and stay checked. */
    overlapOk: 'both games are current through the same season, by definition',
    why: 'the first and last season in cfb/data/cfb_player_seasons.json ('
      + CFB_YEARS.from + '-' + CFB_YEARS.to + ') and football/data/player_seasons.json ('
      + NFL_YEARS.from + '-' + NFL_YEARS.to + ')',
  },
];

/* The pages that state a rule. Wider than check-copy.mjs's list, because the homepage
   and about.html describe both games to somebody who has not opened either. */
const PAGES = [
  'cfb/index.html',
  'cfb/how-to-play.html',
  'cfb/og-source.html',
  'football/index.html',
  'football/how-to-play.html',
  'index.html',
  'about.html',
];

const LEDGER = new URL('numbers.json', import.meta.url);

/* ------------------------------------------------------------------------- */
const args = process.argv.slice(2);
const list = args.includes('--list');
const update = args.includes('--update');

const wrong = [];
const counts = {};
const seen = [];

for (const page of PAGES) {
  if (!existsSync(page)) continue;
  for (const s of copyOf(page)) {
    for (const fact of FACTS) {
      fact.find.lastIndex = 0;
      let m;
      while ((m = fact.find.exec(s))) {
        /* The keyword has to be beside the number, not merely on the same page. */
        const w = fact.window || 70;
        const before = s.slice(Math.max(0, m.index - w), m.index);
        const window = before + s.slice(m.index, m.index + m[0].length + w);
        if (!fact.near.test(window)) continue;
        if (fact.notBefore && fact.notBefore.test(before)) continue;
        if (fact.notNear && fact.notNear.test(window)) continue;
        const key = page + ' :: ' + fact.id;
        counts[key] = (counts[key] || 0) + 1;
        /* Every value the match carries. `all` pulls them out of a run (the re-spin
           ladder is three rungs in one match); otherwise it is the capture groups,
           because one alternation can hold two ("2005 to 2025" is both ends). */
        const vals = fact.all
          ? (m[0].match(fact.all) || [])
          : m.slice(1).filter((x) => x !== undefined);
        const claims = vals.length ? vals : [m[0]];
        seen.push([page, fact.id, m[0].trim(), s]);
        for (const c of claims) {
          const v = /^\$/.test(String(c)) ? String(c) : num(c);
          const good = fact.ok.some((o) => String(o) === String(v));
          if (!good) wrong.push([page, fact, m[0].trim(), v, s]);
        }
      }
    }
  }
}

if (list) {
  seen.forEach(([p, id, hit, s]) => {
    console.log(relative('.', p) + '  [' + id + ']  ' + hit);
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

/* ---- the values ---- */
if (wrong.length) {
  bad += wrong.length;
  console.log('\n' + wrong.length + ' number' + (wrong.length === 1 ? '' : 's')
    + ' a player reads that the game does not play.\n');
  for (const [p, fact, hit, v, s] of wrong) {
    console.log('  ' + relative('.', p) + '  (' + fact.id + ')');
    console.log('    says ' + JSON.stringify(hit) + ', which reads as ' + v);
    console.log('    the game plays: ' + fact.ok.join(' or ') + '   [' + fact.why + ']');
    console.log('    ' + s.slice(0, 130));
  }
}

/* ---- the coverage ---- */
const before = existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, 'utf8')) : null;
if (!before) {
  console.log('\nNo scripts/numbers.json yet. Record it with:');
  console.log('  node scripts/check-numbers.mjs --update\n');
  process.exit(1);
}
const drift = [];
for (const k of new Set([...Object.keys(before), ...Object.keys(counts)])) {
  const was = before[k] || 0, now = counts[k] || 0;
  if (was !== now) drift.push([k, was, now]);
}
if (drift.length) {
  bad += drift.length;
  console.log('\n' + drift.length + ' page' + (drift.length === 1 ? '' : 's')
    + ' state a rule a different number of times than recorded.\n');
  console.log('This is not automatically wrong. It is the half of this check that');
  console.log('catches a claim REWORDED out of reach of the patterns, which would');
  console.log('otherwise pass silently for ever. Read each one, then re-record:\n');
  for (const [k, was, now] of drift) {
    console.log('  ' + k + '   recorded ' + was + ', found ' + now
      + (now === 0 ? '   (the claim is gone, or no longer matches)' : ''));
  }
  console.log('\n  node scripts/check-numbers.mjs --update');
}

/* ---- the two games must not collide ---- */
const collide = FACTS.filter((f) => !f.overlapOk
  && new Set(f.ok.map(String)).size < f.ok.length);
if (collide.length) {
  bad += collide.length;
  console.log('\nTwo games now share a value, so this check has a hole in it:\n');
  for (const f of collide) console.log('  ' + f.id + ': ' + f.ok.join(', '));
  console.log('\nA claim about one game is now accepted as a claim about the other.');
  console.log('Split the fact per page, or accept the hole on purpose and say so here.');
}

if (bad) {
  console.log('\nSee CLAUDE.md. --list prints every claim this reads.\n');
  process.exit(1);
}
console.log('numbers ok: ' + seen.length + ' claims across ' + PAGES.length
  + ' pages all match the engine');
