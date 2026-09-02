#!/usr/bin/env node
/*
 * BUMP A SCRIPT'S CACHE VERSION ON EVERY PAGE THAT ASKS FOR IT, AND RECORD IT.
 *
 * This exists for the robots. Six workflows regenerate a .js data file on a
 * schedule and commit it: rosters, former, jerseys, awards, rosterstats and the
 * Sportegories corpus. Every one of those files is loaded by a page with a
 * hand-written ?v= on it, so a refresh that leaves the number alone hands a
 * returning visitor yesterday's roster against today's page. Nobody was ever
 * going to hand-bump a file a cron job writes at 6am, and until check-cachebust
 * learned to resolve /arcade/... paths, nothing noticed.
 *
 * So the bots call this instead. It takes the highest version any page is
 * currently asking for, adds one, writes that to every page that loads the
 * file, and re-records the manifest.
 *
 *   node scripts/bump-cachebust.mjs arcade/rosters.js
 *   node scripts/bump-cachebust.mjs arcade/former.js arcade/awards.js
 *
 * Call it only when the file actually changed. A bump with no change is a
 * pointless re-download for everybody who already has the file, and
 * check-cachebust will refuse it as "version moved but the file did not".
 *
 * Versions have to be integers here. Two pages use a date stamp
 * (engine.js?v=20260723m); those are hand-written and no robot touches them, so
 * this refuses rather than guessing what the next one would be.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const targets = process.argv.slice(2);
if (!targets.length) {
  console.error('usage: node scripts/bump-cachebust.mjs <path/to/script.js> [...]');
  process.exit(2);
}

function pages(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    if (name === '.git' || name === 'node_modules') continue;
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) { pages(full, out); continue; }
    if (!name.endsWith('.html') || name.startsWith('__')) continue;
    out.push(full);
  }
  return out;
}
const HTML = pages(ROOT);

let touched = 0;
for (const target of targets) {
  const rel = path.relative(ROOT, path.resolve(ROOT, target)).split(path.sep).join('/');
  if (!fs.existsSync(path.join(ROOT, rel))) {
    console.error(`no such file: ${rel}`);
    process.exit(1);
  }

  /* Which pages ask for it, and how. The same file is reached as /arcade/x.js
     from a game and as ../match/x.js from its neighbour, so match on where the
     src RESOLVES rather than on how it is spelt. */
  const hits = [];
  for (const page of HTML) {
    const html = fs.readFileSync(page, 'utf8');
    const re = /(<script[^>]*\ssrc=")([A-Za-z0-9_./-]+\.js)(\?v=)([^"]+)(")/g;
    for (const m of html.matchAll(re)) {
      const resolved = m[2].startsWith('/')
        ? path.join(ROOT, m[2].slice(1))
        : path.join(path.dirname(page), m[2]);
      if (path.relative(ROOT, resolved).split(path.sep).join('/') !== rel) continue;
      hits.push({ page, src: m[2], v: m[4] });
    }
  }
  if (!hits.length) { console.log(`${rel}: no page versions it, nothing to bump`); continue; }

  const nums = hits.map((h) => h.v);
  if (nums.some((v) => !/^\d+$/.test(v))) {
    console.error(`${rel}: version is not a number (${[...new Set(nums)].join(', ')}). Bump it by hand.`);
    process.exit(1);
  }
  const next = Math.max(...nums.map(Number)) + 1;

  for (const page of [...new Set(hits.map((h) => h.page))]) {
    let html = fs.readFileSync(page, 'utf8');
    for (const h of hits.filter((x) => x.page === page)) {
      html = html.split(`${h.src}?v=${h.v}"`).join(`${h.src}?v=${next}"`);
    }
    fs.writeFileSync(page, html);
  }
  console.log(`${rel}: v=${[...new Set(nums)].join('/')} -> v=${next} on ${new Set(hits.map((h) => h.page)).size} page(s)`);
  touched++;
}

if (touched) {
  execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'check-cachebust.mjs'), '--update'],
               { stdio: 'inherit' });
}
