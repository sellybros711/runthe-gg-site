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
 *   INDEXED   anybody gets the page (a static file in last-shot/, built from
 *             the sources and byte for byte the bundle), no robots noindex,
 *             a canonical, a description, the share card (og and twitter, an
 *             image that exists), VideoGame JSON-LD, and in sitemap.xml
 *   LINKED    the home page links it and scripts/newsletter/games.json lists
 *             it (the two go together: scripts/check-home-games.mjs). FALSE
 *             today: the home page card is its own change, after the launch.
 *   ADS       the ad tag on the page, behind its Consent Mode defaults
 *             (Europe's first), the shared banner and rails
 *             (/assets/rtg-ads.js, driven by ads.js), the app and the sheets
 *             ending above the banner, and ads.js carrying the three units
 *             scripts/ad-units.json records for it. TRUE since 2026-11-23
 *             (the owner: "ads on at launch").
 *
 * WHATEVER THE STATE, these hold:
 *   source never served    _redirects 404s /functions/*, where the code lives
 *   served static          the page and its modules are plain files in
 *                          last-shot/ (since 2026-11-19), which only
 *                          build/pages.mjs writes. Before launch the folder
 *                          must not exist: a static file goes to anybody.
 *                          functions/last-shot/ holds e.js and report.js and
 *                          nothing else (a catch all would put every page load
 *                          back on a Function), and there is no root
 *                          _routes.json (it would decide every Function on
 *                          the site). _headers keeps a module a year.
 *   one 404                the report for anybody but an admin, and the events
 *                          refused, get Stumpire's notFound(), byte for byte.
 *                          A path with no file is Pages' own 404 (404.html)
 *   the report             GET /last-shot/report is for admins only. Asked
 *                          here against the real gate, not read off the source
 *
 * TO CHANGE THE STATE, change INDEXED, LINKED or ADS and make the edits this
 * then asks for, in the same commit. It runs on every PR with no path filter:
 * a link added or removed anywhere on the site is what moves the state.
 *
 * test/gate.test.mjs drives the route files beside Stumpire's Function; this
 * file holds the repo around them. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { roundGate, PUBLIC_EVENTS } from './gate.js';
import { PAGE } from './pages.js';
import { staticProblems } from './build/pages.mjs';
import { memoryDb } from './db-supabase.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '../..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const exists = p => fs.existsSync(path.join(ROOT, p));

/* THE DECLARATIONS. LINKED without INDEXED is refused outright. */
const INDEXED = true;
const LINKED = false;
const ADS = true;

const PAGE_URL = 'https://runthe.gg/last-shot/';
const AD = 'pagead2.googlesyndication.com';
const NOINDEX = /name=["']robots["'][^>]*noindex/i;
const problems = [];
const state = INDEXED ? (LINKED ? 'live' : 'served and unlisted') : 'unlaunched';
if (LINKED && !INDEXED) problems.push('LINKED without INDEXED: a page the site sends visitors to while telling crawlers to stay away.');

/* ------------------------------------------------------------------ *
 * 1. THE PAGE, as Pages serves it (last-shot/index.html, built from
 *    web/play.html, the same bytes as pages.js).
 * ------------------------------------------------------------------ */
const SRC = 'functions/_lastshot/web/play.html';
const page = read(SRC);
if (PAGE !== page.replaceAll('__BUILD__', (PAGE.match(/\/last-shot\/m\/client\.js\?b=([^"]+)"/) || [])[1] || '__BUILD__'))
  problems.push('pages.js is not built from ' + SRC + '. Run node functions/_lastshot/build/pages.mjs.');
const open = exists('last-shot');
if (INDEXED && !open) problems.push('there is no last-shot/ folder, so nobody gets the page. INDEXED says anybody does. Run node functions/_lastshot/build/pages.mjs.');
if (!INDEXED && open) problems.push('there is a last-shot/ folder before launch, and a static file goes to anybody.');
if (open) for (const p of staticProblems()) problems.push(p + ' against the sources. Run node functions/_lastshot/build/pages.mjs.');
if (open && read('last-shot/index.html') !== PAGE) problems.push('last-shot/index.html is not the page in pages.js. Run node functions/_lastshot/build/pages.mjs.');
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
    problems.push('the share image is under /last-shot/, which build/pages.mjs owns and rewrites. Serve it from /assets/.');
  const ld = page.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  let doc = null;
  try { doc = ld && JSON.parse(ld[1]); } catch (e) { problems.push(SRC + ' JSON-LD does not parse: ' + e.message); }
  if (!doc || doc['@type'] !== 'VideoGame' || doc.url !== PAGE_URL) problems.push(SRC + ' has no VideoGame JSON-LD naming ' + PAGE_URL + '.');
  if (!PUBLIC_EVENTS) problems.push('gate.js PUBLIC_EVENTS is off, so a guest\'s events are dropped and the report counts only accounts.');
}

/* ADS. shut-the-door/check-posture.mjs asks the same of its page. */
const hasAd = page.includes(AD);
if (!ADS && hasAd) problems.push(SRC + ' carries the AdSense tag while ADS is false.');
if (ADS && !hasAd) problems.push(SRC + ' carries no AdSense tag while ADS is true.');
const ADS_SRC = 'functions/_lastshot/ads.js';
const adsJs = read(ADS_SRC);
const UNITS = { 'last-shot-sticky': /STICKY_SLOT = \{ sticky: '(\d+)' \}/, 'last-shot-rail-left': /RAIL_SLOTS = \{ left: '(\d+)'/, 'last-shot-rail-right': /RAIL_SLOTS = \{[^}]*right: '(\d+)'/ };
const reg = JSON.parse(read('scripts/ad-units.json')).units;
if (!/<script defer src="\/last-shot\/m\/ads\.js\?b=__BUILD__"><\/script>/.test(page)) problems.push(SRC + ' does not load /last-shot/m/ads.js.');
for (const [name, re] of Object.entries(UNITS)) {
  const slot = (adsJs.match(re) || [])[1] || '';
  const real = slot && !/^0+$/.test(slot);
  const u = reg[name];
  if (ADS) {
    if (!real) problems.push(ADS_SRC + ' has no real id for ' + name + ' while ADS is true.');
    else if (!u || u.slot !== slot) problems.push(ADS_SRC + ' carries ' + slot + ' for ' + name + ', and scripts/ad-units.json says ' + (u ? u.slot : 'nothing') + '.');
    else if (u.status !== 'live' || JSON.stringify(u.where) !== '["last-shot/m/ads.js"]') problems.push('scripts/ad-units.json: ' + name + ' should be live, where ["last-shot/m/ads.js"].');
  } else {
    if (real) problems.push(ADS_SRC + ' carries a real id for ' + name + ' while ADS is false.');
    if (u && u.status === 'live') problems.push('scripts/ad-units.json marks ' + name + ' live while ADS is false.');
  }
}
if (hasAd) {
  const consent = page.indexOf("consent','default'");
  const europe = page.search(/gtag\('consent','default',\{[^}]*region:\[/);
  if (consent === -1) problems.push(SRC + ' loads the ad tag with no Consent Mode defaults.');
  else if (page.indexOf(AD) < consent) problems.push(SRC + ' loads the AdSense tag before its Consent Mode defaults.');
  if (europe === -1) problems.push(SRC + ' has no Europe Consent Mode default.');
  else if (page.indexOf(AD) < europe) problems.push(SRC + ' loads the AdSense tag before the Europe consent default.');
  if ((page.match(/gtag\('consent','default'/g) || []).length !== 2) problems.push(SRC + ' should carry exactly one set of consent defaults (Europe, then the rest of the world).');
  if (!/<script src="\/assets\/rtg-ads\.js\?v=\d+"><\/script>/.test(page)) problems.push(SRC + ' does not load /assets/rtg-ads.js, so ads.js has no banner or rails to drive.');
  /* The banner covers nothing: the app, the full screen sheets and the toast end above it. */
  for (const sel of ['.app', '.fsheet']) if (!page.includes('body.rtg-sticky-on ' + sel + '{bottom:var(--sticky-ad-h,0px)}')) problems.push(SRC + ' does not end ' + sel + ' above the bottom banner (body.rtg-sticky-on ' + sel + '{bottom:var(--sticky-ad-h,0px)}).');
  if (!/body\.rtg-sticky-on \.toast\{bottom:calc\(24px \+ var\(--sticky-ad-h,0px\)\)\}/.test(page)) problems.push(SRC + ' does not lift the toast above the bottom banner.');
  if (/data-ad-slot=/.test(page)) problems.push(SRC + ' writes an ad unit into its markup. Last Shot builds its units in ads.js through /assets/rtg-ads.js only.');
  if (/adBreak|adConfig/.test(page + adsJs)) problems.push('Last Shot calls the H5 games ad break. Anything between plays changes play: the owner decides it first.');
}

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
/* Served static: only the two routes are Functions, and Pages builds its own routes. */
const routes = fs.readdirSync(path.join(ROOT, 'functions/last-shot')).sort();
if (JSON.stringify(routes) !== JSON.stringify(['e.js', 'report.js']))
  problems.push('functions/last-shot/ holds ' + routes.join(', ') + '. It holds e.js and report.js only: anything else (a [[path]].js above all) puts the page or its modules back on a Function, one invocation per file.');
if (exists('_routes.json')) problems.push('there is a root _routes.json. It decides every Function on the site, not only Last Shot\'s; Pages builds the right one from functions/.');
const headers = read('_headers');
if (!/^\/last-shot\/m\/\*\n  Cache-Control: public, max-age=31536000, immutable$/m.test(headers)) problems.push('_headers does not keep /last-shot/m/* a year (immutable).');
if (!/^\/last-shot\/\n  Cache-Control: no-cache$/m.test(headers)) problems.push('_headers does not revalidate /last-shot/.');

const route = read('functions/_lastshot/route.js');
const stump = read('functions/arcade/stumpire/[[path]].js');
const notFound = s => (s.match(/async function notFound\(context\) \{[\s\S]*?\n\}/) || [''])[0];
if (!notFound(route) || notFound(route) !== notFound(stump)) problems.push('the Last Shot 404 (functions/_lastshot/route.js) is not byte for byte Stumpire\'s notFound()');
if (!/roundGate\(/.test(route)) problems.push('route.js must answer the events and the report only through roundGate()');
if (!/_stumpire\/cookie\.js/.test(route)) problems.push('route.js must verify the signed cookie, or the report cannot know an admin');
for (const [f, sub] of [['e.js', 'e'], ['report.js', 'report']]) {
  if (!routes.includes(f)) continue;
  const src = read('functions/last-shot/' + f);
  if (!new RegExp(`answer\\(context, '${sub}'\\)`).test(src)) problems.push('functions/last-shot/' + f + ' must answer through route.js answer(context, \'' + sub + '\')');
  if (/pages\.js/.test(src)) problems.push('functions/last-shot/' + f + ' imports the page bundle, which a Function never serves now');
}

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
console.log('  /functions/* is a 404, the page and modules are static (last-shot/, in step), only e.js and report.js are Functions, the 404 is Stumpire\'s, the report is admins only.');
