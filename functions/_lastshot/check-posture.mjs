/* The facts that decide whether Last Shot is launched, and what they say today.
 *
 *   node functions/_lastshot/check-posture.mjs
 *
 * LAUNCHED (the launch PR, 2026-11-18). Until then it was tester only: the page
 * and its modules went to a row in stumpire_testers and everybody else got
 * Stumpire's 404. shut-the-door/check-posture.mjs is the launched shape this
 * file follows, and baseball/check-posture.mjs argues why a launch is several
 * edits held to one declaration rather than one edit: any one of them can be
 * reverted alone and nothing else fails.
 *
 *   INDEXED   anybody gets the page (pageGate asks nobody), no robots noindex,
 *             a canonical, a description, the share card (og and twitter, an
 *             image that exists), VideoGame JSON-LD, and in sitemap.xml
 *   LINKED    the home page links it and scripts/newsletter/games.json lists
 *             it (the two go together: scripts/check-home-games.mjs). FALSE
 *             today: the home page card is its own change, after the launch.
 *   ADS       the ad tag on the page (ads.js says what turns on). FALSE today:
 *             the launch went out without ads.
 *
 * WHATEVER THE STATE, these hold:
 *   source never served    _redirects 404s /functions/*, where the code lives
 *   no static folder       /last-shot is the Function's; a root folder would
 *                          fight it
 *   one 404                a path it does not know, and the report for anybody
 *                          but an admin, get Stumpire's notFound(), byte for byte
 *   the report             GET /last-shot/report is for admins only. Asked
 *                          here against the real gate, not read off the source
 *
 * TO CHANGE THE STATE, change INDEXED, LINKED or ADS and make the edits this
 * then asks for, in the same commit. It runs on every PR with no path filter:
 * a link added or removed anywhere on the site is what moves the state.
 *
 * test/gate.test.mjs drives the two Functions side by side; this file holds the
 * repo around them. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pageGate, roundGate, PUBLIC_EVENTS } from './gate.js';
import { PAGE } from './pages.js';
import { memoryDb } from './db-supabase.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '../..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const exists = p => fs.existsSync(path.join(ROOT, p));

/* THE DECLARATIONS. LINKED without INDEXED is refused outright. */
const INDEXED = true;
const LINKED = false;
const ADS = false;

const PAGE_URL = 'https://runthe.gg/last-shot/';
const AD = 'pagead2.googlesyndication.com';
const NOINDEX = /name=["']robots["'][^>]*noindex/i;
const problems = [];
const state = INDEXED ? (LINKED ? 'live' : 'served and unlisted') : 'unlaunched';
if (LINKED && !INDEXED) problems.push('LINKED without INDEXED: a page the site sends visitors to while telling crawlers to stay away.');

/* ------------------------------------------------------------------ *
 * 1. THE PAGE, as the Function sends it (pages.js, built from web/play.html).
 * ------------------------------------------------------------------ */
const SRC = 'functions/_lastshot/web/play.html';
const page = read(SRC);
if (PAGE !== page.replaceAll('__BUILD__', (PAGE.match(/\/last-shot\/m\/client\.js\?b=([^"]+)"/) || [])[1] || '__BUILD__'))
  problems.push('pages.js is not built from ' + SRC + '. Run node functions/_lastshot/build/pages.mjs.');
const guest = pageGate('', null);
const open = !!(guest && guest.body === PAGE);
if (INDEXED && !open) problems.push('a guest does not get the page from pageGate. INDEXED says anybody does.');
if (!INDEXED && open) problems.push('a guest gets the page from pageGate before launch.');
const noindex = NOINDEX.test(page);
if (!INDEXED && !noindex) problems.push(SRC + ' is not noindexed.');
if (INDEXED) {
  if (noindex) problems.push(SRC + ' is noindexed while this file says the game is indexed.');
  if (/TESTERS ONLY/i.test(page)) problems.push(SRC + ' still says TESTERS ONLY.');
  if (!new RegExp(`<link rel="canonical" href="${PAGE_URL}">`).test(page)) problems.push(SRC + ' has no canonical pointing at ' + PAGE_URL + '.');
  if (!/<meta name="description" content="[^"]{50,}">/.test(page)) problems.push(SRC + ' has no meta description.');
  for (const tag of ['og:title', 'og:description', 'og:url', 'og:image'])
    if (!new RegExp(`property="${tag}" content="[^"]+"`).test(page)) problems.push(SRC + ' has no ' + tag + '.');
  for (const tag of ['twitter:card', 'twitter:title', 'twitter:image'])
    if (!new RegExp(`name="${tag}" content="[^"]+"`).test(page)) problems.push(SRC + ' has no ' + tag + '.');
  if (!page.includes(`property="og:url" content="${PAGE_URL}"`)) problems.push(SRC + ' og:url is not ' + PAGE_URL + '.');
  /* the share image is a file this repo serves */
  for (const m of page.matchAll(/(?:og:image|twitter:image)" content="https:\/\/runthe\.gg\/([^"?]+)/g))
    if (!exists(m[1])) problems.push(SRC + ' points its share image at /' + m[1] + ', which is not in the repo.');
  if (/(?:og:image|twitter:image)" content="https:\/\/runthe\.gg\/last-shot\//.test(page))
    problems.push('the share image is under /last-shot/, which the Function answers with a 404. Serve it from /assets/.');
  const ld = page.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  let doc = null;
  try { doc = ld && JSON.parse(ld[1]); } catch (e) { problems.push(SRC + ' JSON-LD does not parse: ' + e.message); }
  if (!doc || doc['@type'] !== 'VideoGame' || doc.url !== PAGE_URL) problems.push(SRC + ' has no VideoGame JSON-LD naming ' + PAGE_URL + '.');
  if (!PUBLIC_EVENTS) problems.push('gate.js PUBLIC_EVENTS is off, so a guest\'s events are dropped and the report counts only accounts.');
}

/* ADS. */
const hasAd = page.includes(AD);
if (!ADS && hasAd) problems.push(SRC + ' carries the AdSense tag while ADS is false.');
if (ADS && !hasAd) problems.push(SRC + ' carries no AdSense tag while ADS is true.');

/* The sitemap. */
const sitemap = read('sitemap.xml');
if (INDEXED && !sitemap.includes('<loc>' + PAGE_URL + '</loc>')) problems.push('INDEXED is true and sitemap.xml does not list ' + PAGE_URL + '.');
if (!INDEXED && /last-shot/i.test(sitemap)) problems.push('sitemap.xml lists /last-shot before launch.');

/* ------------------------------------------------------------------ *
 * 2. LINKED FROM THE SITE, or not.
 * ------------------------------------------------------------------ */
const home = read('index.html');
const onHome = /href=["'][^"']*\/last-shot/i.test(home);
const onList = JSON.parse(read('scripts/newsletter/games.json')).games.some(g => g.dir === 'functions/_lastshot');
if (LINKED) {
  if (!onHome) problems.push('LINKED is true and index.html does not link /last-shot/.');
  if (!onList) problems.push('LINKED is true and scripts/newsletter/games.json does not list functions/_lastshot.');
} else {
  if (onHome) problems.push('index.html links /last-shot/ while LINKED is false. Flip LINKED here in the same commit.');
  if (onList) problems.push('scripts/newsletter/games.json lists Last Shot while LINKED is false. It goes on that list the day it goes on the home page.');
}

/* ------------------------------------------------------------------ *
 * 3. WHATEVER THE STATE.
 * ------------------------------------------------------------------ */
if (!/^\/functions\/\*\s+\/404\.html\s+404\s*$/m.test(read('_redirects'))) problems.push('_redirects no longer 404s /functions/*');
if (exists('last-shot')) problems.push('there is a last-shot/ folder at the site root. /last-shot is the Function\'s; serve files from /assets/.');

const fn = read('functions/last-shot/[[path]].js');
const stump = read('functions/arcade/stumpire/[[path]].js');
const notFound = s => (s.match(/async function notFound\(context\) \{[\s\S]*?\n\}/) || [''])[0];
if (!notFound(fn) || notFound(fn) !== notFound(stump)) problems.push('the Last Shot 404 is not byte for byte Stumpire\'s notFound()');
if (!/pageGate\(/.test(fn) || /\bPAGE\b/.test(fn.replace(/\/\*[\s\S]*?\*\//g, ''))) problems.push('the Function must answer the page only through pageGate()');
if (!/roundGate\(/.test(fn)) problems.push('the Function must answer the events and the report only through roundGate()');
if (!/_stumpire\/cookie\.js/.test(fn)) problems.push('the Function must verify the signed cookie, or the report cannot know an admin');

/* The report: admins only, asked against the real gate. */
const db = memoryDb({ t: 'tester', a: 'admin', p: 'player' });
for (const uid of [null, undefined, '', 'stranger', 'p', 't']) {
  if ((await roundGate({ method: 'GET', sub: 'report', uid, query: {}, nowMs: Date.now() }, db)) !== null)
    problems.push('GET /last-shot/report answers ' + JSON.stringify(uid ?? null) + '. It is for admins only.');
}
const adm = await roundGate({ method: 'GET', sub: 'report', uid: 'a', query: {}, nowMs: Date.now() }, db);
if (!adm || adm.status !== 200) problems.push('GET /last-shot/report does not answer an admin.');
else if (!NOINDEX.test(adm.body)) problems.push('the report is not noindexed.');
if ((await roundGate({ method: 'POST', sub: 'report', uid: 'a', query: {}, nowMs: Date.now() }, db)) !== null) problems.push('the report answers a POST.');

if (problems.length) {
  console.error(`Last Shot posture (declared ${state}): ${problems.length} problem(s)\n`);
  for (const p of problems) console.error('  ' + p);
  console.error(`\nINDEXED is ${INDEXED}, LINKED is ${LINKED} and ADS is ${ADS} at the top of this file. If the state`);
  console.error('has really changed, change that line in the same commit as the edits it asks for.');
  process.exit(1);
}
console.log(`Last Shot posture (${state}): `
  + (INDEXED ? 'anybody gets the page, indexable with a canonical, share card and JSON-LD, in the sitemap, guests\' events on, '
             : 'tester only, noindexed, not in the sitemap, ')
  + (LINKED ? 'on the home page and the newsletter list, ' : 'not on the home page or the newsletter list yet, ')
  + (ADS ? 'ad tag on.' : 'no ad tag.'));
console.log('  /functions/* is a 404, no root folder, the 404 is Stumpire\'s, the report is admins only.');
