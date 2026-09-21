#!/usr/bin/env node
/*
 * A SIBLING SCRIPT THAT CHANGED AND KEPT ITS VERSION IS A CRASH ON SOMEBODY ELSE'S PHONE.
 *
 * The game pages load their engine and their run loop as separate files with a hand-written
 * cache-busting query:
 *
 *   <script src="engine.js?v=52"></script>
 *
 * index.html revalidates on every visit and those files do not, so a deploy that changes
 * engine.js without moving the number serves a RETURNING visitor the new page against the
 * JavaScript they already had. Nothing fails at build time and nothing fails on a fresh
 * browser, which is every browser a developer tests in. It fails on the phone of somebody
 * who played yesterday, mid-season, as "E.overallOf is not a function".
 *
 * That is not hypothetical. It shipped: three files changed across three commits, none of
 * the three versions moved, and the crash landed in the main game rather than in the mode
 * being worked on, because the shared engine is shared.
 *
 * WHAT THIS CHECKS. For every versioned local script on every page, the file's hash has to
 * match the hash recorded for the version the page is asking for. Change the file and the
 * hash moves; the version has to move with it, in the same commit.
 *
 *   node scripts/check-cachebust.mjs            verify
 *   node scripts/check-cachebust.mjs --update    record the current state
 *
 * The flow when you change one of these files is: edit it, bump its ?v= in the page, then
 * --update. Two of those three are the point, and the third is what keeps the check honest
 * the next time.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const MANIFEST = path.join(ROOT, 'scripts', 'cachebust.json');
const UPDATE = process.argv.includes('--update');

/* Every page that loads a local script with a version on it. Found rather than listed, so a
   new game cannot be added to the site and left out of this by forgetting a list.
   The path may be beside the page (engine.js), up and over (../match/entities.js) or from
   the site root (/arcade/tokens.js). All three cache separately from the page and all three
   are the bug this file exists for. */
const TAG = /<script[^>]*\ssrc="([A-Za-z0-9_./-]+\.js)\?v=([^"]+)"/g;

/* AND EVERY PAGE THAT IMPORTS ONE AS A MODULE, which this did not see for a year.
 *
 * A `<script src>` is not the only way a page pairs itself with a file that caches
 * separately. setlist/index.html is an ES module and reaches its two siblings with
 *
 *   import { scoreShow, ... } from './scoring.js?v=39';
 *
 * for exactly the reason this checker exists: it shipped a blank page once when v4
 * renamed the scoring exports and a cached index.html met a fresh scoring.js. Those
 * versions were then invisible here, so the check reported "26 versioned scripts ok"
 * on a commit that changed scoring.js and left ?v=39 alone. The failure that would
 * have caused is quieter than a crash: theOneThatGotAway kept its arity across the
 * rewrite, so a returning player's cached copy would have been handed the new
 * argument, found no song_id on it, and silently dropped the card.
 *
 * Both quote styles, and the `./` is optional so the two forms record under the same
 * name as a <script src> would. */
const MOD = /(?:^|[\s({,])(?:import|export)[^;'"]*?from\s*['"]\.?\/?([A-Za-z0-9_.-]+\.js)\?v=([^'"]+)['"]/gm;

function pages(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    if (name === '.git' || name === 'node_modules') continue;
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) { pages(full, out); continue; }
    /* A LEADING __ MEANS A TEST-ONLY FILE, written by a suite and deleted after. It is in
       .gitignore, it is never served, and __authstub.js beside the football game is the
       same convention.

       This used to name __test exactly, and the gap has already been walked into once: a
       smoke copy called __smoke.html was on disk during an --update, so the record file
       learned four scripts belonging to a page that does not exist and the checker failed
       on every run afterwards with "recorded but no longer on the page". Caught in the
       working tree that time. Widened to the prefix, because the next throwaway will not be
       called __test either. */
    if (!name.endsWith('.html') || name.startsWith('__')) continue;
    out.push(full);
  }
  return out;
}

const sha = (file) => crypto.createHash('sha256')
  .update(fs.readFileSync(file)).digest('hex').slice(0, 16);

const found = {};
for (const page of pages(ROOT)) {
  const html = fs.readFileSync(page, 'utf8');
  const rel = path.relative(ROOT, page);
  for (const re of [TAG, MOD]) {
    for (const m of html.matchAll(re)) {
      /* A leading slash is the SITE root, not the filesystem root. Every arcade game
         reaches its shared scripts that way (/arcade/tokens.js?v=13), and for a year
         this checker resolved that against the page's own directory, got
         arcade/sportegories/arcade/tokens.js, found nothing there and skipped it. So
         eleven pages were covered and fifteen arcade games were not, silently: the
         run said "ok" on commits that changed a shared file, because it was never
         looking at the pages that load it. Found while bumping sportegories.js. */
      const script = m[1].startsWith('/')
        ? path.join(ROOT, m[1].slice(1))
        : path.join(path.dirname(page), m[1]);
      /* A file that is not in the repo is somebody else's bug. */
      if (!fs.existsSync(script)) continue;
      (found[rel] ??= {})[m[1]] = { v: m[2], sha: sha(script) };
    }
  }
}

/* ONE FILE, ONE VERSION, ACROSS EVERY PAGE THAT ASKS FOR IT.
 *
 * The manifest above is per page, which is right for a sibling script but blind to the
 * shared ones: fifteen arcade games load /arcade/tokens.js, and nothing stopped fourteen
 * of them from moving to v=13 while the fifteenth stayed on v=12. The stale page then
 * serves TODAY'S file under YESTERDAY'S URL, so a visitor who has that URL cached keeps
 * the old code on a page written for the new. That is this file's whole subject, arriving
 * from the direction the per-page record cannot see.
 *
 * It was true when this ran: alltime.js was v=3 on nine pages and v=2 on Chain and Roll
 * Call, and auth.js and auth-ui.js were a version behind on /ideas/. Three files, and the
 * check was green, because it was green on eleven pages that load none of them.
 *
 * Bump every page in the same commit. There is no case for two.
 */
const versions = {};
for (const [page, scripts] of Object.entries(found)) {
  for (const [name, cur] of Object.entries(scripts)) {
    if (!name.startsWith('/')) continue;      // a sibling script is nobody else's
    ((versions[name] ??= {})[cur.v] ??= []).push(page);
  }
}
const split = Object.entries(versions).filter(([, byV]) => Object.keys(byV).length > 1);
if (split.length) {
  console.error('\nA shared script is asked for at two different versions.\n');
  for (const [name, byV] of split) {
    console.error('  ' + name);
    for (const [v, pages_] of Object.entries(byV)) {
      console.error(`    v=${v}: ${pages_.join(', ')}`);
    }
  }
  console.error('\nEvery page that loads a shared file has to ask for the same version.');
  console.error('Move the stragglers up to the highest, then run --update.\n');
  process.exit(1);
}

/*
 * AND THE OTHER PAIR OF HAND-WRITTEN NUMBERS, WHICH TOOK THE PROFILE AND THE LEADERBOARD OUT.
 *
 * A `?v=` is not the only number a page keeps about a sibling script. Several of them also
 * pin the API they expect, and refuse the module when it does not match:
 *
 *   const BOARD_VERSION=17;
 *   const B=(window.PS_BOARD&&window.PS_BOARD.API_VERSION===BOARD_VERSION)?window.PS_BOARD:{...
 *
 * THIS IS THE SILENT ONE OF THE TWO. A `?v=` that has not moved fails loudly, as a missing
 * function on somebody's phone. This fails SOFTLY, on purpose: the page falls through to a
 * stub that answers every call with null so that a board.js which is blocked, or a version
 * behind, degrades to "not reachable" rather than taking the game down. That stub is correct
 * and it did its job. What nothing anywhere noticed was that it was reached BY MISTAKE.
 *
 * It shipped. Adding two functions to board.js moved its API_VERSION to 17 and BOARD_VERSION
 * in the page stayed at 16, so every visitor ran on the stub: the leaderboard printed the
 * stub's own lastError ("board.js failed: 0 blocked"), and the profile's runs played and
 * best rating came back as dashes because mine() and ranks() answer null. No error was
 * thrown, no check went red, and the site looked exactly like a site whose network was
 * having a bad day. Reported by a player.
 *
 * FOUND RATHER THAN LISTED, the same rule the rest of this file follows: the pairs are read
 * out of the page, the receiver is resolved through any alias to its global, and the global
 * is resolved to whichever script on that page assigns it. A new game that pins a version
 * this way is covered without anybody remembering to add it here.
 *
 * COVERAGE IS HALF THE CHECK, which is check-numbers.mjs's lesson and it applies harder to a
 * resolver than to a regex. A page that mentions API_VERSION and yields no pair means the
 * reading broke, not that the page is clean, so that is a failure rather than a pass.
 */
const NUM = (s) => (/^\d+$/.test(String(s).trim()) ? Number(s) : null);
/* `API_VERSION: 17` or `API_VERSION: RUN_API_VERSION` with the const declared above it. */
function moduleVersion(src) {
  const m = src.match(/API_VERSION\s*:\s*([A-Za-z0-9_]+)/);
  if (!m) return null;
  const n = NUM(m[1]);
  if (n !== null) return n;
  const d = src.match(new RegExp('\\b(?:const|let|var)\\s+' + m[1] + '\\s*=\\s*(\\d+)'));
  return d ? Number(d[1]) : null;
}
const pins = [];
let pairs = 0;
for (const page of pages(ROOT)) {
  const html = fs.readFileSync(page, 'utf8');
  const rel = path.relative(ROOT, page);
  /* A page that COMPARES an API_VERSION is a page that pins one. A page that merely mentions
     the words (the stub below the comparison writes `API_VERSION:BOARD_VERSION` into itself)
     is not, so the coverage rule keys on the comparison rather than on the word. */
  if (!/\.API_VERSION\s*===?/.test(html) && !/===?\s*[A-Za-z_$][\w$.]*\.API_VERSION/.test(html)) continue;
  /* Both directions of the comparison, and == or ===. The receiver is whatever is on the
     other side of the dot: `window.PS_BOARD`, `PS_BOARD` or an alias like `E`. */
  /* NAMED `pinned`, NOT `want`. The manifest below is a top-level const called want, and a
     block-scoped shadow of it inside this loop is legal, silent and exactly the kind of thing
     somebody later reads as the manifest. */
  const pinned = new Map();                     // CONST -> Set(receiver)
  const add = (k, v) => (pinned.get(k) ?? pinned.set(k, new Set()).get(k)).add(v);
  for (const m of html.matchAll(/([A-Za-z_$][\w$.]*)\.API_VERSION\s*===?\s*([A-Z][A-Z0-9_]*)/g))
    add(m[2], m[1]);
  for (const m of html.matchAll(/([A-Z][A-Z0-9_]*)\s*===?\s*([A-Za-z_$][\w$.]*)\.API_VERSION/g))
    add(m[1], m[2]);
  /* THE READING BROKE RATHER THAN THE PAGE BEING CLEAN. A resolver that yields nothing is
     green, and that is how an extractor in this repo has gone quiet twice already. */
  if (!pinned.size) {
    pins.push({ page: rel, name: '(nothing)',
      why: 'this page compares an API_VERSION and the check could not read the pair' });
    continue;
  }
  /* The scripts this page loads, versioned or not: a pinned module need not be versioned. */
  const srcs = [...html.matchAll(/<script[^>]*\ssrc="([A-Za-z0-9_./-]+\.js)(?:\?[^"]*)?"/g)]
    .map((m) => (m[1].startsWith('/') ? path.join(ROOT, m[1].slice(1))
      : path.join(path.dirname(page), m[1])))
    .filter((f) => fs.existsSync(f));
  for (const [name, receivers] of pinned) {
    const dec = html.match(new RegExp('\\b(?:const|let|var)\\s+' + name + '\\s*=\\s*(\\d+)\\s*;'));
    if (!dec) { pins.push({ page: rel, name, why: 'the page pins a version it never declares' }); continue; }
    const at = Number(dec[1]);
    for (const receiver of receivers) {
      /* RESOLVED BY WHO SETS IT, NOT BY WHAT IT IS CALLED. This first asked for a PS_
         prefix, which is the football game's convention and nobody else's: hoops exports
         RTF_ENGINE and RTF_RUN, so the check reported that it could not tell which module
         E was on a page that is perfectly correct. A naming convention is not a fact about
         the code; which file assigns the global is. */
      let g = receiver.replace(/^window\./, '');
      /* AND A MODULE THAT WRITES THROUGH ITS IIFE PARAMETER IS STILL SETTING IT, which is
         the same lesson as the PS_ prefix one line up, arriving at a second spelling. The
         site's one-file modules are written
         `(function (root) { ... root.X = api; })(typeof self !== 'undefined' ? self : this)`,
         so `window.X =` never appears in them and this reported that nothing sets a global
         a file plainly sets. It is not loosened to any receiver: the name has to be the
         parameter that function was handed the global object as. */
      const putsGlobal = (src, n) => {
        if (new RegExp('window\\.' + n + '\\s*=[^=]').test(src)) return true;
        const iife = src.match(
          /\(\s*function\s*\(\s*([A-Za-z_$][\w$]*)\s*\)[\s\S]*\}\s*\)\s*\(\s*typeof\s+(?:self|globalThis)[^)]*\)\s*;?\s*$/);
        return !!iife && new RegExp('\\b' + iife[1] + '\\.' + n + '\\s*=[^=]').test(src);
      };
      const setter = (n) => srcs.find((f) => putsGlobal(fs.readFileSync(f, 'utf8'), n));
      let file = setter(g);
      if (!file) {
        /* Then it is an alias: `var E = window.RTF_ENGINE, R = window.RTF_RUN;` */
        const al = html.match(new RegExp('\\b' + g + '\\s*=\\s*window\\.([A-Z][A-Z0-9_]*)'));
        if (al) { g = al[1]; file = setter(g); }
      }
      if (!file) { pins.push({ page: rel, name, why: 'nothing on this page sets window.' + g }); continue; }
      const got = moduleVersion(fs.readFileSync(file, 'utf8'));
      const script = path.relative(ROOT, file);
      if (got === null) { pins.push({ page: rel, name, why: script + ' declares no API_VERSION' }); continue; }
      if (got !== at) {
        pins.push({ page: rel, name,
          why: `the page wants ${at} and ${script} is ${got}, so every visitor gets the stub` });
      }
      pairs++;
    }
  }
}
if (pins.length) {
  console.error('\nA page and its module disagree about the API version.\n');
  for (const p of pins) console.error(`  ${p.page} -> ${p.name}\n    ${p.why}`);
  console.error('\nThis one does NOT throw. The page falls through to its offline stub, so the');
  console.error('game keeps working and the leaderboard, the profile and the meters all go');
  console.error('quiet as though the network were down. Move the number in the page to match');
  console.error('the module, in the same commit that changed the module.\n');
  process.exit(1);
}

if (UPDATE) {
  fs.writeFileSync(MANIFEST, JSON.stringify(found, null, 2) + '\n');
  const n = Object.values(found).reduce((t, o) => t + Object.keys(o).length, 0);
  console.log(`recorded ${n} versioned scripts across ${Object.keys(found).length} pages`);
  process.exit(0);
}

if (!fs.existsSync(MANIFEST)) {
  console.error('no scripts/cachebust.json. Run: node scripts/check-cachebust.mjs --update');
  process.exit(1);
}
const want = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));

const bad = [];
for (const [page, scripts] of Object.entries(found)) {
  for (const [name, cur] of Object.entries(scripts)) {
    const rec = (want[page] || {})[name];
    if (!rec) { bad.push({ page, name, why: 'not recorded yet', cur }); continue; }
    if (rec.sha === cur.sha && rec.v === cur.v) continue;
    if (rec.sha === cur.sha) { bad.push({ page, name, why: 'version moved but the file did not', cur, rec }); continue; }
    bad.push({ page, name, why: rec.v === cur.v ? 'FILE CHANGED, VERSION DID NOT' : 'version moved, needs recording', cur, rec });
  }
}
/* A script that stopped being versioned, or a page that went away, leaves a stale entry. */
for (const [page, scripts] of Object.entries(want)) {
  for (const name of Object.keys(scripts)) {
    if (!(found[page] || {})[name]) bad.push({ page, name, why: 'recorded but no longer on the page' });
  }
}

if (!bad.length) {
  const n = Object.values(found).reduce((t, o) => t + Object.keys(o).length, 0);
  console.log(`cache versions ok: ${n} versioned scripts match what the pages ask for`);
  console.log(`api versions ok: ${pairs} page/module pins agree`);
  process.exit(0);
}

console.error('\nCache-busting versions are out of step.\n');
for (const b of bad) {
  console.error(`  ${b.page} -> ${b.name}`);
  console.error(`    ${b.why}`);
  if (b.cur && b.rec) console.error(`    page asks v=${b.cur.v} (file ${b.cur.sha}), recorded v=${b.rec.v} (file ${b.rec.sha})`);
  else if (b.cur) console.error(`    page asks v=${b.cur.v} (file ${b.cur.sha})`);
}
console.error('\nIf a file changed: bump its ?v= in the page, then run');
console.error('  node scripts/check-cachebust.mjs --update');
console.error('Both in the same commit as the change, or a returning visitor gets the new');
console.error('page against the old script.\n');
process.exit(1);
