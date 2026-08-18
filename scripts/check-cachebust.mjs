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
   new game cannot be added to the site and left out of this by forgetting a list. */
const TAG = /<script[^>]*\ssrc="([A-Za-z0-9_.-]+\.js)\?v=([^"]+)"/g;

function pages(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    if (name === '.git' || name === 'node_modules') continue;
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) { pages(full, out); continue; }
    /* __test*.html is an instrumented copy written by a suite and deleted after; it is in
       .gitignore and is never served. */
    if (!name.endsWith('.html') || name.startsWith('__test')) continue;
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
  for (const m of html.matchAll(TAG)) {
    const script = path.join(path.dirname(page), m[1]);
    /* Only files that live beside the page. A missing one is somebody else's bug. */
    if (!fs.existsSync(script)) continue;
    (found[rel] ??= {})[m[1]] = { v: m[2], sha: sha(script) };
  }
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
