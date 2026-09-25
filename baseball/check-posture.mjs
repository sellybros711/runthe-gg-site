/* The four facts that decide whether a game is launched, and they move together.
 *
 *   node baseball/check-posture.mjs
 *
 * Run The Diamond is LIVE. That is not one edit, it is four, and each of them is
 * invisible on its own:
 *
 *   indexable              no robots tag telling a crawler to stay away
 *   in sitemap.xml         something points a crawler at it in the first place
 *   carries the ad tag     it is on the surface AdSense reviews, so it has to be
 *                          able to serve one, with the consent defaults in front
 *   linked from the site   a visitor browsing runthe.gg can find it
 *
 * WHY IT IS FOUR AND NOT ONE. Any one of them can be reverted by itself and
 * nothing anywhere fails. A page dropped from the sitemap is still indexable and
 * still linked, so it stays reachable and quietly stops being crawled. A page
 * that keeps its noindex while sitting in the sitemap is a contradiction a
 * crawler reports back to you weeks later. And a launched game with no ad tag is
 * a page in the reviewed surface that cannot serve one, which is exactly what
 * two AdSense rejections were traced to.
 *
 * THE HOLE THIS FILE COVERS THAT check-adsense CANNOT. That checker walks every
 * INDEXABLE page and SKIPS anything noindexed, so putting the robots tag back on
 * this game does not fail it: it quietly stops auditing the game at all, and
 * every other thing it was holding up here (the ad tag, the consent ordering,
 * the policy links) goes unasked with it. A guard that goes quiet when a thing
 * is half reverted is worse than no guard, so the state is declared HERE, once,
 * and the four rows are asked against that declaration rather than against
 * whatever the files happen to say.
 *
 * TO UN-LAUNCH THE GAME, set LIVE to false and put back the four things this
 * then asks for. That is the point: it costs a deliberate edit to a guard rather
 * than a deletion nobody notices. hoops/check-posture.mjs is the same file for
 * the game that has not launched, and its header argues the other side.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/* THE ONE DECLARATION. Everything below is asked against this. */
const LIVE = true;

/* The two pages a reader meets. og-source.html is deliberately not one of them:
   it is the template the share card is rendered from, never a page, and it is
   checked separately at the bottom for staying out of the index either way. */
const PAGES = ['baseball/index.html', 'baseball/how-to-play.html'];
const URLS = ['https://runthe.gg/baseball/', 'https://runthe.gg/baseball/how-to-play.html'];

/* The pages that actually carry navigation. Checked against these rather than
   against the whole repo, because the build scripts, the sitemap and this file
   all obviously mention the game. */
const NAV = ['index.html', '404.html', 'about.html'];

const AD = 'pagead2.googlesyndication.com';
const problems = [];
const state = LIVE ? 'live' : 'unlaunched';

/* ------------------------------------------------------------------ *
 * 1. THE FOUR ROWS, asked of both pages.
 * ------------------------------------------------------------------ */
const sitemap = read('sitemap.xml');

for (const rel of PAGES) {
  const src = read(rel);
  const noindexed = /name=["']robots["'][^>]*noindex/i.test(src);

  if (LIVE && noindexed) {
    problems.push(`${rel} is noindexed while this file says the game is live. A crawler `
      + 'is being told to stay away from a game the home page links to, and check-adsense '
      + 'stops auditing this page the moment that tag is there.');
  }
  if (!LIVE && !noindexed) {
    problems.push(`${rel} is indexable while this file says the game is unlaunched. That `
      + 'puts an unfinished game into the surface AdSense reviews.');
  }

  const hasAd = src.includes(AD);
  if (LIVE && !hasAd) {
    problems.push(`${rel} carries no AdSense publisher tag. It is an indexable page on a `
      + 'site that is reviewed as a whole, so it has to be able to serve one.');
  }
  if (!LIVE && hasAd) {
    problems.push(`${rel} carries the AdSense publisher tag on an unlaunched game.`);
  }

  /* The ORDER, which is the half only this file still asks once the game is
     noindexed. privacy.html promises no advertising cookie is set before the CMP
     answers, and a page that loads adsbygoogle.js with nothing in front of it
     breaks that promise with nothing on screen to say so. */
  if (hasAd) {
    const consent = src.indexOf("consent','default'");
    if (consent === -1) {
      problems.push(`${rel} loads the ad tag with no Consent Mode defaults anywhere.`);
    } else if (src.indexOf(AD) < consent) {
      problems.push(`${rel} loads the AdSense tag BEFORE its Consent Mode defaults. The `
        + 'defaults have to be queued first or the first ad request goes out ungoverned.');
    }
  }
}

for (const url of URLS) {
  const listed = sitemap.includes(url);
  if (LIVE && !listed) {
    problems.push(`sitemap.xml does not list ${url}. The page is indexable and linked, so `
      + 'nothing is broken and it quietly never gets crawled, which is the slowest '
      + 'possible way to find out.');
  }
  if (!LIVE && listed) {
    problems.push(`sitemap.xml lists ${url} for an unlaunched game.`);
  }
}

/* ------------------------------------------------------------------ *
 * 2. LINKED FROM THE SITE, or not, depending.
 * ------------------------------------------------------------------ */
const linkedFrom = NAV.filter((nav) => /href=["'][^"']*\/baseball\//i.test(read(nav)));
if (LIVE && !linkedFrom.length) {
  problems.push(`none of ${NAV.join(', ')} links to /baseball/. Linking it from the site is `
    + 'the step that launches it, and the rest of this file says it is launched.');
}
if (!LIVE && linkedFrom.length) {
  problems.push(`${linkedFrom.join(', ')} links to /baseball/ on an unlaunched game.`);
}

/* THE HOME PAGE REACHES A VISITOR TWICE AND THE TWO DO NOT OVERLAP. Tiles are the
   phone home screen and cards are the desktop one: `.gtiles{display:none}` until
   640px, and `.games > .feat{display:none}` from 640px down. So a link added to
   only one of them is a game that exists on one kind of device, which renders
   perfectly and is invisible to every other check here. */
const home = read('index.html');
if (LIVE) {
  if (!/<a class="gtile[^"]*baseball[^"]*"/i.test(home)) {
    problems.push('index.html has no .gtile for baseball. Tiles are the phone home screen, '
      + 'so without one the game cannot be found on a phone at all.');
  }
  if (!/<article class="feat[^"]*baseball[^"]*"/i.test(home)) {
    problems.push('index.html has no .feat card for baseball. Cards are the desktop home '
      + 'screen, so without one the game cannot be found on a desktop at all.');
  }
}

/* ------------------------------------------------------------------ *
 * 3. THE STRUCTURED DATA IS THE HOME PAGE'S OTHER ANSWER.
 *
 * The JSON-LD graph carries its own list of the games on this site, and it is
 * what Google renders rather than the markup beside it. A game launched in the
 * markup and missing from the graph is the stale-number trap in its worst place:
 * nothing fails, the page is right, and the structured data quietly says the
 * site has five games.
 * ------------------------------------------------------------------ */
if (LIVE) {
  const blocks = [...home.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  let listed = false;
  let parsed = 0;
  for (const [, body] of blocks) {
    let doc;
    try { doc = JSON.parse(body); } catch (e) {
      problems.push(`index.html has a JSON-LD block that does not parse: ${e.message}`);
      continue;
    }
    parsed++;
    for (const node of doc['@graph'] || []) {
      if (node['@type'] !== 'ItemList') continue;
      if ((node.itemListElement || []).some((e) => String(e.url || '').includes('/baseball/'))) {
        listed = true;
      }
    }
  }
  if (!parsed) {
    problems.push('found no parseable JSON-LD on index.html, so this check is not checking '
      + 'anything. Has the block moved?');
  } else if (!listed) {
    problems.push('the home page JSON-LD ItemList does not name /baseball/. That block is '
      + 'what a search engine reads as the list of games on this site, so the game is '
      + 'launched everywhere except the one place a crawler is told to look.');
  }
}

/* ------------------------------------------------------------------ *
 * 4. THE SHARE CARD TEMPLATE IS NOT A PAGE, EITHER WAY.
 *
 * og-source.html is rendered to og.png by baseball/build/og.mjs and is never
 * served to anybody. It stays noindexed and out of the sitemap whatever the game
 * is doing, because a launch is about the game and this is a build input. Left
 * indexable it becomes a page with a headline, no navigation and no reason to
 * exist, and check-adsense would then correctly start demanding an ad tag on it.
 * ------------------------------------------------------------------ */
const ogSrc = read('baseball/og-source.html');
if (!/name=["']robots["'][^>]*noindex/i.test(ogSrc)) {
  problems.push('baseball/og-source.html is not noindexed. It is the template the share '
    + 'card is rendered from, not a page, and it stays out of the index whether or not '
    + 'the game is launched.');
}
if (sitemap.includes('og-source')) {
  problems.push('sitemap.xml lists baseball/og-source.html, which is a build input.');
}

/* ------------------------------------------------------------------ *
 * 5. THE GAME HAS SOMETHING TO PLAY.
 *
 * Deliberately the only data claim here: baseball/check-franchise.mjs already
 * holds the club codes to the franchise table and check-labels.mjs holds the
 * prices to the pool, and a second implementation of either would be the thing
 * those files exist to prevent. What is left is the one question a posture check
 * has to ask before saying a game is live, which is whether the file the page
 * fetches is there and is a pool rather than an empty array.
 * ------------------------------------------------------------------ */
const pool = JSON.parse(read('baseball/data/players.json'));
const rows = Array.isArray(pool) ? pool : (pool.players || []);
if (rows.length < 1000) {
  problems.push(`baseball/data/players.json holds ${rows.length} rows. Twelve slots cannot `
    + 'be filled off that, and a launched game pointing at an empty pool is a blank board.');
}

/* ------------------------------------------------------------------ */
if (problems.length) {
  console.error(`Run The Diamond posture (declared ${state}): ${problems.length} problem(s)\n`);
  for (const p of problems) console.error('  ' + p);
  console.error(`\nLIVE is ${LIVE} at the top of this file. If the game's state has really`);
  console.error('changed, change that line in the same commit as the four edits, so launching');
  console.error('or un-launching is a decision somebody made rather than a guard nobody read.');
  process.exit(1);
}

console.log(LIVE
  ? 'Run The Diamond posture: indexable, in the sitemap, ad tag behind its consent defaults, '
    + 'linked from the home page on both phone and desktop, and named in the JSON-LD.'
  : 'Run The Diamond posture: noindexed, no ad tag, not in the sitemap, linked from nowhere.');
console.log(`  ${rows.length.toLocaleString()} player-seasons in the pool.`);
console.log('  og-source.html is a build input and stays out of the index either way.');
