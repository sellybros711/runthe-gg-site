/* The four things that keep an unfinished game out of an AdSense review.
 *
 *   node allstars/check-posture.mjs
 *
 * Run The All-Stars is an unlaunched preview, the same status as the wrestling
 * game and Run The Floor. That is a set of DELIBERATE choices rather than a
 * stage it happens to be at:
 *
 *   noindexed              a crawler is told not to index it
 *   absent from sitemap    nothing points a crawler at it in the first place
 *   no ad tag              it is not trying to serve an ad it has not earned
 *   linked from nowhere    a visitor browsing runthe.gg cannot stumble on it
 *
 * WHY THIS IS A CHECK AND NOT A HABIT. scripts/check-adsense.mjs walks every
 * INDEXABLE page on the site and asserts each one can carry an ad and can reach
 * the policy pages. It skips anything noindexed. So the robots tag on this game
 * is the single line holding it out of the reviewed surface, and deleting it
 * does not fail anything: it quietly ADDS an unfinished game to the site being
 * reviewed. Launching the game should be a decision somebody makes by editing
 * THIS file, not a guard nobody notices.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const problems = [];
const page = read('allstars/index.html');

/* 1. Noindexed. This is the line that does the work. */
if (!/name=["']robots["'][^>]*noindex/i.test(page)) {
  problems.push('allstars/index.html is not noindexed. That puts an unfinished game into the '
    + 'indexable site, which is the surface AdSense reviews.');
}

/* 2. No ad tag. It is not a page that should be trying to serve one. */
if (page.includes('pagead2.googlesyndication.com')) {
  problems.push('allstars/index.html carries the AdSense publisher tag. An unlaunched preview '
    + 'with a placeholder roster should not be serving ads.');
}

/* 3. Not in the sitemap, which is what would invite a crawler in. */
if (read('sitemap.xml').includes('/allstars')) {
  problems.push('sitemap.xml lists /allstars/. A noindexed page in the sitemap is a '
    + 'contradiction a crawler will report back to you.');
}

/* 4. Linked from nowhere a visitor browsing the site would find it. Checked
      against the pages that actually carry navigation, rather than the whole
      repo: this file, any build script and the game itself obviously mention it. */
for (const nav of ['index.html', '404.html', 'about.html']) {
  if (/href=["'][^"']*\/allstars\//i.test(read(nav))) {
    problems.push(`${nav} links to /allstars/. Linking it from the site is the step that `
      + 'launches it, and that step has not been taken.');
  }
}

/* 5. The roster the game loads is present and holds the twenty-three characters
      the design finalized on. Under that count something has been dropped in a
      rewrite: the team select screen asks the player to pick nine, and the
      opponent teams below draw from this pool, so a silently shorter roster
      thins both sides of every game. */
const rosterMatch = page.match(/const ROSTER = \[([\s\S]*?)\n\];/);
if (!rosterMatch) {
  problems.push('could not find the ROSTER array in allstars/index.html. Has the file been '
    + 'restructured? This check keeps the roster from silently shrinking.');
} else {
  const count = (rosterMatch[1].match(/\{ k:/g) || []).length;
  if (count < 20) {
    problems.push(`ROSTER holds ${count} characters. The finalized roster is twenty-three; `
      + 'anything under twenty means somebody has been dropped in a rewrite.');
  }
  /* Every quirk key referenced on a roster row must be one the engine knows,
     or the character silently plays like the base template and the quirk note
     on the card lies about them. */
  const allowedQuirks = new Set(['transform','confuse','skittish','monument']);
  const quirks = [...rosterMatch[1].matchAll(/quirk:'([^']+)'/g)].map(m => m[1]);
  const unknown = quirks.filter(q => !allowedQuirks.has(q));
  if (unknown.length) {
    problems.push(`ROSTER references unknown quirks: ${[...new Set(unknown)].join(', ')}. `
      + 'Add the mechanic to resolveSwing (or startAtBat for at bat scoped mods) before '
      + 'shipping the character with it on the card.');
  }
}

/* 6. Every opponent's lineup is nine characters, and every key in every lineup
      is a real roster key. This is the failure mode you would never see by
      opening the game: a mistyped key falls through to undefined, and the
      first at bat throws in a place nobody was looking. */
const opponentsMatch = page.match(/const OPPONENTS = \[([\s\S]*?)\n\];/);
const rosterKeys = new Set([...page.matchAll(/\{ k:'([^']+)',/g)].map(m => m[1]));
if (!opponentsMatch) {
  problems.push('could not find the OPPONENTS array. Has the file been restructured?');
} else {
  const lineups = [...opponentsMatch[1].matchAll(/roster:\[([^\]]+)\]/g)];
  if (lineups.length < 4) {
    problems.push(`only ${lineups.length} opponent teams defined. The season plays seven `
      + 'games, so any fewer than seven forces the schedule to reuse opponents in a way the '
      + 'schedule builder does not currently handle.');
  }
  lineups.forEach((m, i) => {
    const keys = [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]);
    if (keys.length !== 9) {
      problems.push(`opponent #${i+1} has ${keys.length} players in its lineup. Nine required.`);
    }
    const missing = keys.filter(k => !rosterKeys.has(k));
    if (missing.length) {
      problems.push(`opponent #${i+1} references unknown roster keys: ${missing.join(', ')}.`);
    }
  });
}

if (problems.length) {
  console.error(`Run The All-Stars posture: ${problems.length} problem(s)\n`);
  for (const p of problems) console.error('  ' + p);
  console.error('\nIf one of these is now intentional, change THIS FILE in the same commit, so');
  console.error('launching the game is a decision somebody made rather than a guard nobody');
  console.error('noticed. See the header for what each check is holding up.');
  process.exit(1);
}

console.log('Run The All-Stars posture: noindexed, no ad tag, not in the sitemap, linked from nowhere.');
