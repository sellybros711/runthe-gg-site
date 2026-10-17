/* Shut The Door is served and unlisted until the owner puts it live.
 *
 *   node shut-the-door/check-posture.mjs
 *
 * Anyone handed runthe.gg/shut-the-door can play it. Nothing on the site points
 * at it and nothing invites a crawler in. This holds the five facts that keep it
 * that way: noindexed, no ad tag, not in the sitemap, linked from no page that
 * carries navigation, and not on the newsletter's list of games.
 *
 * Launching it is a deliberate edit to THIS FILE in the same commit as the
 * launch (baseball/check-posture.mjs is the launched shape). It runs on every PR
 * with no path filter: a link added anywhere on the site is what would launch it,
 * and a filter on shut-the-door/** would never see that.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(ROOT, p));

/* THE TWO DECLARATIONS, as baseball/check-posture.mjs has them. Both false
   until the owner launches it. */
const INDEXED = false;
const LINKED = false;

const problems = [];
if (LINKED && !INDEXED) problems.push('LINKED without INDEXED: a page the site sends visitors to while telling crawlers to stay away.');

const PAGES = ['shut-the-door/index.html'];
if (!exists(PAGES[0])) {
  problems.push('shut-the-door/index.html does not exist yet, so there is nothing to hold.');
} else {
  for (const p of PAGES) {
    const page = read(p);
    const noindex = /name=["']robots["'][^>]*noindex/i.test(page);
    if (!INDEXED && !noindex) problems.push(`${p} is not noindexed.`);
    if (INDEXED && noindex) problems.push(`${p} is noindexed, but INDEXED is true.`);
    if (!INDEXED && page.includes('pagead2.googlesyndication.com')) problems.push(`${p} carries the AdSense tag before launch.`);
  }
}

const inSitemap = read('sitemap.xml').includes('/shut-the-door');
if (!INDEXED && inSitemap) problems.push('sitemap.xml lists /shut-the-door before launch.');
if (INDEXED && !inSitemap) problems.push('INDEXED is true and sitemap.xml does not list /shut-the-door.');

/* Linked from nowhere: every html page outside the game itself. */
function htmlFiles(dir) {
  const out = [];
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === 'shut-the-door') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...htmlFiles(p));
    else if (e.name.endsWith('.html')) out.push(p);
  }
  return out;
}
const linkers = htmlFiles('.').filter((p) => /href=["'][^"']*shut-the-door/i.test(read(p)));
if (!LINKED && linkers.length) problems.push(`linked before launch from: ${linkers.join(', ')}.`);
if (LINKED && !linkers.includes('index.html')) problems.push('LINKED is true and the home page does not link /shut-the-door.');

/* The newsletter list takes a game the day it goes on the home page. */
if (exists('scripts/newsletter/games.json')) {
  const onList = read('scripts/newsletter/games.json').includes('shut-the-door');
  if (!LINKED && onList) problems.push('scripts/newsletter/games.json lists Shut The Door before it is on the home page.');
}

if (problems.length) {
  console.error(`Shut The Door posture: ${problems.length} problem(s)\n`);
  for (const p of problems) console.error('  ' + p);
  console.error('\nIf one of these is now intentional, change INDEXED or LINKED in this file in the same commit.');
  process.exit(1);
}
console.log(`Shut The Door posture: ${INDEXED ? 'indexed' : 'noindexed, no ad tag, not in the sitemap'}, ${LINKED ? 'linked' : 'linked from nowhere, not on the newsletter list'}.`);
