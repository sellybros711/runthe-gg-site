/* 4th and What is served and unlisted until the owner puts it live.
 *
 *   node 4th-and-what/check-posture.mjs
 *
 * Anyone handed runthe.gg/4th-and-what can play it. Nothing on the site
 * points at it and nothing invites a crawler in. This holds the facts that
 * keep it that way: noindexed, no ad tag, not in the sitemap, linked from no
 * page and named in no script outside its own folder, and not on the
 * newsletter's list of games.
 *
 * This is Shut The Door's posture (the owner's call for both games,
 * 2026-10-17): the Run The Floor pattern before its launch, not the tester
 * gate. baseball/check-posture.mjs is the launched shape.
 *
 * LAUNCHING IT IS A DELIBERATE EDIT TO THIS FILE, in the same commit as the
 * launch: flip INDEXED and LINKED, add the home page tile and the sitemap
 * entry, take the noindex off, and put it on scripts/newsletter/games.json.
 * It runs on every PR with no path filter: a link added anywhere on the site
 * is what would launch it, and a filter on 4th-and-what/** would never see it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(ROOT, p));

/* THE TWO DECLARATIONS. Both false until the owner launches it. */
const INDEXED = false;
const LINKED = false;

const NAME = '4th-and-what';
const problems = [];
if (LINKED && !INDEXED) problems.push('LINKED without INDEXED: a page the site sends visitors to while telling crawlers to stay away.');

const page = read(NAME + '/index.html');
const noindex = /name=["']robots["'][^>]*noindex/i.test(page);
if (!INDEXED && !noindex) problems.push(NAME + '/index.html is not noindexed.');
if (INDEXED && noindex) problems.push(NAME + '/index.html is noindexed, but INDEXED is true.');
if (!INDEXED && page.includes('pagead2.googlesyndication.com')) problems.push(NAME + '/index.html carries the AdSense tag before launch.');

const inSitemap = read('sitemap.xml').includes('/' + NAME);
if (!INDEXED && inSitemap) problems.push('sitemap.xml lists /' + NAME + ' before launch.');
if (INDEXED && !inSitemap) problems.push('INDEXED is true and sitemap.xml does not list /' + NAME + '.');

/* Linked from nowhere: every page and script outside the game's own folder.
   Scripts too, because a home page tile or a nav entry is often built in
   JavaScript (arcade/nav.js, the hub's tester row). The checks and docs that
   name it on purpose are skipped: this file's folder, CI workflows, the
   check scripts, and the agent's own spec. */
const SKIP_DIRS = new Set(['.git', 'node_modules', NAME, '.github', 'supabase', 'docs']);
const SKIP_FILES = new Set(['.claude/agents/4th-and-what.md', 'scripts/check-dashes.mjs', 'scripts/check-copy.mjs', 'scripts/cachebust.json']);
function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    if (e.name.startsWith('.') && e.name !== '.claude') continue;
    if (SKIP_DIRS.has(e.name)) continue;
    const p = dir === '.' ? e.name : path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (/\.(html|js|mjs|json|xml|txt)$/.test(e.name) && !SKIP_FILES.has(p)) out.push(p);
  }
  return out;
}
const linkers = walk('.').filter((p) => {
  const s = read(p);
  return s.includes('/' + NAME) || s.includes(NAME + '/');
});
const homeLinks = linkers.includes('index.html');
if (!LINKED && linkers.length) problems.push('named before launch in: ' + linkers.join(', ') + '.');
if (LINKED && !homeLinks) problems.push('LINKED is true and the home page does not link /' + NAME + '.');

/* The newsletter list takes a game the day it goes on the home page. */
if (exists('scripts/newsletter/games.json')) {
  const onList = read('scripts/newsletter/games.json').includes(NAME);
  if (!LINKED && onList) problems.push('scripts/newsletter/games.json lists 4th and What before it is on the home page.');
}

/* No tester gate, no Function: it is a plain public folder, by design. */
if (exists('functions/' + NAME) || exists('functions/_4thandwhat')) problems.push('a Pages Function for 4th and What exists; it is a public unlisted folder, not a gated one.');

if (problems.length) {
  console.error('4th and What posture: ' + problems.length + ' problem(s)\n');
  for (const p of problems) console.error('  ' + p);
  console.error('\nIf one of these is now intentional, change INDEXED or LINKED in this file in the same commit.');
  process.exit(1);
}
console.log('4th and What posture: ' + (INDEXED ? 'indexed' : 'noindexed, no ad tag, not in the sitemap') + ', ' + (LINKED ? 'linked' : 'linked from nowhere, not on the newsletter list') + '.');
