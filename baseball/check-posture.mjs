/* The four facts that decide whether a game is launched, and what they say today.
 *
 *   node baseball/check-posture.mjs
 *
 * Run The Diamond is SERVED AND UNLISTED, which is Segue's row in CLAUDE.md's
 * table rather than hoops'. It is indexable, in the sitemap and carrying its ad
 * tag, and the home page does not link it. Somebody handed the URL or finding it
 * in search can play it; somebody browsing runthe.gg will not stumble on it. It
 * was launched with a home page link for a day and the owner took the link back
 * off, so the four facts below are TWO declarations now rather than one:
 *
 *   INDEXED   the first three rows (robots, sitemap, ad tag), which move together
 *   LINKED    the fourth (the home page tile and card, the JSON-LD, the nav)
 *
 * They move separately because the owner can want one without the other, and
 * does today. What must never happen is a mixture INSIDE either group.
 *
 * Launched, it is four edits, and each of them is invisible on its own:
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
 * TO CHANGE THE STATE, change INDEXED or LINKED and make the edits this then
 * asks for. That is the point: it costs a deliberate edit to a guard rather than
 * a deletion nobody notices. LINKED on its own is what relaunching on the home
 * page means, and the launch commit (e1b7ec63) is the home page it restores. hoops/check-posture.mjs is the same file for
 * the game that has not launched, and its header argues the other side.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/* THE TWO DECLARATIONS. Everything below is asked against these. LINKED without
   INDEXED is refused outright: a page the home page sends visitors to while
   telling crawlers to stay away is the contradiction this file exists for. */
const INDEXED = true;
const LINKED = false;

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
const state = INDEXED ? (LINKED ? 'live' : 'served and unlisted') : 'unlaunched';
if (LINKED && !INDEXED) {
  problems.push('LINKED is true and INDEXED is false. The home page would send visitors '
    + 'to a game that tells a crawler to stay away. Pick one state.');
}

/* ------------------------------------------------------------------ *
 * 1. THE FOUR ROWS, asked of both pages.
 * ------------------------------------------------------------------ */
const sitemap = read('sitemap.xml');

for (const rel of PAGES) {
  const src = read(rel);
  const noindexed = /name=["']robots["'][^>]*noindex/i.test(src);

  if (INDEXED && noindexed) {
    problems.push(`${rel} is noindexed while this file says the game is indexed. `
      + 'check-adsense stops auditing this page the moment that tag is there, and the ad '
      + 'tag and its consent ordering go unasked with it.');
  }
  if (!INDEXED && !noindexed) {
    problems.push(`${rel} is indexable while this file says the game is unlaunched. That `
      + 'puts an unfinished game into the surface AdSense reviews.');
  }

  const hasAd = src.includes(AD);
  if (INDEXED && !hasAd) {
    problems.push(`${rel} carries no AdSense publisher tag. It is an indexable page on a `
      + 'site that is reviewed as a whole, so it has to be able to serve one.');
  }
  if (!INDEXED && hasAd) {
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
  if (INDEXED && !listed) {
    problems.push(`sitemap.xml does not list ${url}. The page is indexable, so `
      + 'nothing is broken and it quietly never gets crawled, which is the slowest '
      + 'possible way to find out.');
  }
  if (!INDEXED && listed) {
    problems.push(`sitemap.xml lists ${url} for an unlaunched game.`);
  }
}

/* ------------------------------------------------------------------ *
 * 2. LINKED FROM THE SITE, or not, depending.
 * ------------------------------------------------------------------ */
const linkedFrom = NAV.filter((nav) => /href=["'][^"']*\/baseball\//i.test(read(nav)));
if (LINKED && !linkedFrom.length) {
  problems.push(`none of ${NAV.join(', ')} links to /baseball/. Linking it from the site is `
    + 'the step that launches it, and the rest of this file says it is launched.');
}
if (!LINKED && linkedFrom.length) {
  problems.push(`${linkedFrom.join(', ')} links to /baseball/, and this file says the game `
    + 'is not on the site\'s own pages yet.');
}

/* THE HOME PAGE REACHES A VISITOR TWICE AND THE TWO DO NOT OVERLAP. Tiles are the
   phone home screen and cards are the desktop one: `.gtiles{display:none}` until
   640px, and `.games > .feat{display:none}` from 640px down. So a link added to
   only one of them is a game that exists on one kind of device, which renders
   perfectly and is invisible to every other check here. */
const home = read('index.html');
const hasTile = /<a class="gtile[^"]*baseball[^"]*"/i.test(home);
const hasCard = /<article class="feat[^"]*baseball[^"]*"/i.test(home);
if (!LINKED && (hasTile || hasCard)) {
  problems.push(`index.html carries a baseball ${hasTile ? 'tile' : 'card'} while this file says `
    + 'the game is not on the home page. Half a link is a game that exists on one kind of '
    + 'device.');
}
if (LINKED) {
  if (!hasTile) {
    problems.push('index.html has no .gtile for baseball. Tiles are the phone home screen, '
      + 'so without one the game cannot be found on a phone at all.');
  }
  if (!hasCard) {
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
{
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
  } else if (!LINKED && listed) {
    problems.push('the home page JSON-LD ItemList names /baseball/ while the page itself does '
      + 'not link it. A search engine would be told about a game the reader cannot find.');
  } else if (LINKED && !listed) {
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
  console.error(`\nINDEXED is ${INDEXED} and LINKED is ${LINKED} at the top of this file. If the state has really`);
  console.error('changed, change that line in the same commit as the four edits, so launching');
  console.error('or un-launching is a decision somebody made rather than a guard nobody read.');
  process.exit(1);
}

console.log(`Run The Diamond posture (${state}): `
  + (INDEXED ? 'indexable, in the sitemap, ad tag behind its consent defaults, '
             : 'noindexed, no ad tag, not in the sitemap, ')
  + (LINKED ? 'linked from the home page on both phone and desktop, and named in the JSON-LD.'
            : 'and not linked from the home page, the nav or the JSON-LD.'));
console.log(`  ${rows.length.toLocaleString()} player-seasons in the pool.`);
console.log('  og-source.html is a build input and stays out of the index either way.');
