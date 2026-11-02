/* The facts that decide whether Shut The Door is launched, and what they say today.
 *
 *   node shut-the-door/check-posture.mjs
 *
 * LAUNCHED 2026-11-02 (the owner: "Launch shut the door."). Until then it was
 * served and unlisted: noindexed, no ad tag, not in the sitemap, linked from no
 * page and not on the newsletter list. baseball/check-posture.mjs is the
 * launched shape this file follows, and its header argues why a launch is
 * several edits held to one declaration rather than one edit:
 *
 *   INDEXED   no robots noindex, a canonical, in sitemap.xml, the ad tag behind
 *             its Consent Mode defaults (Europe's first), and the shared banner
 *             and rails (/assets/rtg-ads.js, driven by ads.js)
 *   LINKED    the home page links it in the Play today list (both phone and
 *             desktop see that list) and in an All games card, the JSON-LD
 *             ItemList names it, and the newsletter may write about it
 *
 * Any one of those can be reverted alone and nothing else fails: check-adsense
 * SKIPS a noindexed page, so putting the robots tag back would quietly stop the
 * ad tag and its consent order being asked at all. So the state is declared
 * here, once, and every row is asked against the declaration.
 *
 * THE LAB IS NOT LAUNCHED. shut-the-door/lab/ is the 3D lab and its harnesses.
 * Every page in it stays noindexed and out of the sitemap whatever the game is
 * doing, and the game page never links it.
 *
 * TO CHANGE THE STATE, change INDEXED or LINKED and make the edits this then
 * asks for, in the same commit. It runs on every PR with no path filter: a link
 * added or removed anywhere on the site is what moves the state.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(ROOT, p));

/* THE TWO DECLARATIONS. LINKED without INDEXED is refused outright. */
const INDEXED = true;
const LINKED = true;

const URL = 'https://runthe.gg/shut-the-door/';
const AD = 'pagead2.googlesyndication.com';
const NOINDEX = /name=["']robots["'][^>]*noindex/i;
const problems = [];
const state = INDEXED ? (LINKED ? 'live' : 'served and unlisted') : 'unlaunched';
if (LINKED && !INDEXED) problems.push('LINKED without INDEXED: a page the site sends visitors to while telling crawlers to stay away.');

/* ------------------------------------------------------------------ *
 * 1. THE PAGE.
 * ------------------------------------------------------------------ */
const PAGE = 'shut-the-door/index.html';
if (!exists(PAGE)) {
  problems.push(`${PAGE} does not exist, so there is nothing to hold.`);
} else {
  const page = read(PAGE);
  const noindex = NOINDEX.test(page);
  const hasAd = page.includes(AD);
  if (!INDEXED && !noindex) problems.push(`${PAGE} is not noindexed.`);
  if (INDEXED && noindex) problems.push(`${PAGE} is noindexed while this file says the game is indexed. check-adsense stops auditing a noindexed page, and the ad tag and its consent order go unasked with it.`);
  if (!INDEXED && hasAd) problems.push(`${PAGE} carries the AdSense tag before launch.`);
  if (INDEXED) {
    if (!hasAd) problems.push(`${PAGE} carries no AdSense tag. An indexable page on a site reviewed as a whole has to be able to serve one.`);
    if (!new RegExp(`rel=["']canonical["'][^>]*href=["']${URL}["']`).test(page)) problems.push(`${PAGE} has no canonical pointing at ${URL}.`);
    if (!/property=["']og:image["']/.test(page)) problems.push(`${PAGE} has no og:image, so a shared link has no picture.`);
    if (!/<script src="\/assets\/rtg-ads\.js\?v=\d+"><\/script>/.test(page)) problems.push(`${PAGE} does not load /assets/rtg-ads.js, so ads.js has no banner or rails to drive.`);
    if (!/<script src="ads\.js\?v=\d+"><\/script>/.test(page)) problems.push(`${PAGE} does not load ads.js.`);
  }
  /* The order, asked whenever the tag is there: privacy.html promises no
     advertising cookie before the CMP answers. */
  if (hasAd) {
    const consent = page.indexOf("consent','default'");
    const europe = page.search(/gtag\('consent','default',\{[^}]*region:\[/);
    if (consent === -1) problems.push(`${PAGE} loads the ad tag with no Consent Mode defaults.`);
    else if (page.indexOf(AD) < consent) problems.push(`${PAGE} loads the AdSense tag before its Consent Mode defaults.`);
    if (europe === -1) problems.push(`${PAGE} has no Europe Consent Mode default.`);
    else if (page.indexOf(AD) < europe) problems.push(`${PAGE} loads the AdSense tag before the Europe consent default.`);
    if ((page.match(/gtag\('consent','default'/g) || []).length !== 2) problems.push(`${PAGE} should carry exactly one set of consent defaults (Europe, then the rest of the world).`);
  }
}

const sitemap = read('sitemap.xml');
const inSitemap = sitemap.includes(URL);
if (!INDEXED && sitemap.includes('/shut-the-door')) problems.push('sitemap.xml lists /shut-the-door before launch.');
if (INDEXED && !inSitemap) problems.push(`INDEXED is true and sitemap.xml does not list ${URL}.`);

/* ------------------------------------------------------------------ *
 * 2. THE LAB STAYS OUT, launched or not.
 * ------------------------------------------------------------------ */
function htmlFiles(dir, skipGame) {
  const out = [];
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    if (e.name.startsWith('.') || e.name === 'node_modules' || (skipGame && e.name === 'shut-the-door')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...htmlFiles(p, skipGame));
    else if (e.name.endsWith('.html')) out.push(p);
  }
  return out;
}
if (exists('shut-the-door/lab')) {
  for (const p of htmlFiles('shut-the-door/lab', false)) {
    if (!NOINDEX.test(read(p))) problems.push(`${p} is not noindexed. The lab is not part of the launch.`);
  }
}
if (sitemap.includes('/shut-the-door/lab')) problems.push('sitemap.xml lists the lab. The lab is not part of the launch.');
if (exists(PAGE) && /href=["'][^"']*lab\//i.test(read(PAGE))) problems.push(`${PAGE} links the lab.`);

/* ------------------------------------------------------------------ *
 * 3. LINKED FROM THE SITE, or not.
 * ------------------------------------------------------------------ */
const linkers = htmlFiles('.', true).filter((p) => /href=["'][^"']*shut-the-door/i.test(read(p)));
if (!LINKED && linkers.length) problems.push(`linked before launch from: ${linkers.join(', ')}.`);

const home = read('index.html');
const hasRow = /<li><a class="trow [^"]*" href="\/shut-the-door\/"/i.test(home);
const hasCard = /<article class="feat std[^"]*"[^>]*>\s*<a class="feat-link" href="\/shut-the-door\/"/i.test(home);
let inLd = false;
for (const [, body] of home.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
  let doc;
  try { doc = JSON.parse(body); } catch (e) { problems.push(`index.html has a JSON-LD block that does not parse: ${e.message}`); continue; }
  for (const node of doc['@graph'] || []) {
    if (node['@type'] === 'ItemList' && (node.itemListElement || []).some((e) => String(e.url || '') === URL)) inLd = true;
  }
}
if (LINKED) {
  /* The Play today row is a plain <li> (not .today-new), so it shows on a phone's
     swipe strip and in the desktop list alike. */
  if (!hasRow) problems.push('index.html has no Play today row (.trow) for /shut-the-door/. That list is the hub on both phone and desktop.');
  if (!hasCard) problems.push('index.html has no All games card (<article class="feat std">) for /shut-the-door/. The sport filter works on those cards.');
  if (!inLd) problems.push(`the home page JSON-LD ItemList does not name ${URL}. That block is what a crawler reads as the list of games here.`);
} else if (hasRow || hasCard || inLd) {
  problems.push('index.html carries Shut The Door (a row, a card or the JSON-LD) while this file says it is not linked.');
}

/* The newsletter list takes a game the day it goes on the home page. */
if (exists('scripts/newsletter/games.json')) {
  const onList = JSON.parse(read('scripts/newsletter/games.json')).games.some((g) => g.dir === 'shut-the-door');
  if (!LINKED && onList) problems.push('scripts/newsletter/games.json lists Shut The Door before it is on the home page.');
  if (LINKED && !onList) problems.push('scripts/newsletter/games.json does not list Shut The Door, and it is on the home page. The newsletter cannot write about it.');
}

if (problems.length) {
  console.error(`Shut The Door posture (declared ${state}): ${problems.length} problem(s)\n`);
  for (const p of problems) console.error('  ' + p);
  console.error(`\nINDEXED is ${INDEXED} and LINKED is ${LINKED} at the top of this file. If the state has really`);
  console.error('changed, change that line in the same commit as the edits it asks for.');
  process.exit(1);
}
console.log(`Shut The Door posture (${state}): `
  + (INDEXED ? 'indexable with a canonical, in the sitemap, ad tag behind its consent defaults, '
             : 'noindexed, no ad tag, not in the sitemap, ')
  + (LINKED ? 'on the home page (Play today and All games), in the JSON-LD and on the newsletter list.'
            : 'linked from nowhere, not on the newsletter list.'));
console.log('  the lab stays noindexed, out of the sitemap and unlinked from the game.');
