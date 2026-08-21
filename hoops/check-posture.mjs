/* The three things that keep an unfinished game out of an AdSense review.
 *
 *   node hoops/check-posture.mjs
 *
 * Run The Floor is an unlaunched preview, and that is a set of DELIBERATE
 * choices rather than a stage it happens to be at:
 *
 *   noindexed              a crawler is told not to index it
 *   absent from sitemap    nothing points a crawler at it in the first place
 *   no ad tag              it is not trying to serve an ad it has not earned
 *   linked from nowhere    a visitor browsing runthe.gg cannot stumble on it
 *
 * WHY IT IS A CHECK AND NOT A HABIT. scripts/check-adsense.mjs walks every
 * INDEXABLE page on the site and asserts each one can carry an ad and can reach
 * the policy pages. It skips anything noindexed. So the robots tag on this game
 * is the single line holding it out of the reviewed surface, and deleting it
 * does not fail anything: it quietly ADDS an unfinished game to the site being
 * reviewed, and check-adsense then starts demanding an ad tag on it, and the
 * obvious way to make that complaint go away is to add one. Two AdSense
 * rejections have already been traced to pages that quietly failed that audit.
 *
 * The same reasoning is why scripts/setlist/check_data.mjs asserts the opposite
 * three facts about Segue, which IS launched. Either way the point is that
 * changing a game's discoverability should take a deliberate edit to a guard,
 * not a deletion nobody notices.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const problems = [];
const page = read('hoops/index.html');

// 1. Noindexed. This is the line that does the work.
if (!/name=["']robots["'][^>]*noindex/i.test(page)) {
  problems.push('hoops/index.html is not noindexed. That puts an unfinished game into the '
    + 'indexable site, which is the surface AdSense reviews.');
}

// 2. No ad tag. It is not a page that should be trying to serve one.
if (page.includes('pagead2.googlesyndication.com')) {
  problems.push('hoops/index.html carries the AdSense publisher tag. An unlaunched preview '
    + 'with placeholder data should not be serving ads.');
}

// 3. Not in the sitemap, which is what would invite a crawler in.
if (read('sitemap.xml').includes('/hoops')) {
  problems.push('sitemap.xml lists /hoops/. A noindexed page in the sitemap is a '
    + 'contradiction a crawler will report back to you.');
}

/* 4. Linked from nowhere a visitor browsing the site would find it. Checked
      against the pages that actually carry navigation, rather than the whole
      repo: the build scripts and this file obviously mention it. */
for (const nav of ['index.html', '404.html', 'about.html']) {
  if (/href=["'][^"']*\/hoops\//i.test(read(nav))) {
    problems.push(`${nav} links to /hoops/. Linking it from the site is the step that `
      + 'launches it, and that step has not been taken.');
  }
}

// 5. The data the game loads is present and is not empty.
const players = JSON.parse(read('hoops/data/players.json'));
if (!Array.isArray(players) || players.length < 50) {
  problems.push(`hoops/data/players.json holds ${players.length || 0} rows. The game cannot `
    + 'fill a six man roster out of that.');
}

if (problems.length) {
  console.error(`Run The Floor posture: ${problems.length} problem(s)\n`);
  for (const p of problems) console.error('  ' + p);
  console.error('\nIf one of these is now intentional, change THIS FILE in the same commit, so');
  console.error('launching the game is a decision somebody made rather than a guard nobody');
  console.error('noticed. See the header for what each check is holding up.');
  process.exit(1);
}

console.log('Run The Floor posture: noindexed, no ad tag, not in the sitemap, linked from nowhere.');
console.log(`  ${players.length} player-seasons loaded.`);
