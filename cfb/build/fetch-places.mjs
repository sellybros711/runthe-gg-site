/* WHERE EVERY SCHOOL ACTUALLY IS, fetched rather than remembered.
 *
 *   node cfb/build/fetch-places.mjs            writes cfb/data/cfb_places.json
 *   node cfb/build/fetch-places.mjs --check    resolves and reports, writes nothing
 *
 * Commish Simulator wants a map, and a map is a claim about where real places are. Typing
 * eighty-three coordinate pairs from memory is the mistake hoops already made once with
 * seed rosters: plausible numbers, no source, and wrong in ways nothing fails on. A school
 * in the wrong state is a lie the player can see.
 *
 * So the coordinates come from Wikipedia's own coordinate property. The only thing this
 * file decides is WHICH ARTICLE to ask about, and even that is checked: every answer has to
 * land inside the United States and no two schools may share a point, which is what catches
 * a title that quietly redirected somewhere else.
 *
 * The school names in cfb_team_seasons.json are the short ones a fan uses ("Miami", "Army",
 * "Ole Miss"), and several are ambiguous or irregular as article titles. Those are named
 * below. The rest are found by trying the ordinary shapes of an American university's name,
 * which is the permissive-parsing lesson written down in CLAUDE.md: ask for the thing, do
 * not demand one particular spelling of it.
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(new URL('../..', import.meta.url).pathname);

const CHECK = process.argv.includes('--check');
const API = 'https://en.wikipedia.org/w/api.php';
/* Wikipedia asks for a real user agent and it is rude not to send one. */
const UA = 'runthe.gg-cfb-build/1.0 (https://runthe.gg)';

/* NODE'S fetch IGNORES THE PROXY ENVIRONMENT UNLESS TOLD NOT TO, and a sandbox that routes
   outbound traffic through one answers with a bare 403. That looks exactly like Wikipedia
   refusing the request, which is a wrong and expensive thing to believe. Say it instead.
   On a GitHub runner there is no proxy and this never fires. */
if ((process.env.HTTPS_PROXY || process.env.https_proxy) && !process.env.NODE_USE_ENV_PROXY) {
  console.error('An HTTPS proxy is configured but Node will not use it, so every request '
    + 'would come back 403.\nRe-run as:\n\n  NODE_USE_ENV_PROXY=1 node '
    + 'cfb/build/fetch-places.mjs\n');
  process.exit(2);
}

/* THE ONES NO RULE WOULD FIND. Abbreviations, academies, and the two schools whose short
   name belongs to a state or another university entirely. */
const TITLES = {
  'Army': 'United States Military Academy',
  'Navy': 'United States Naval Academy',
  'BYU': 'Brigham Young University',
  /* The university article carries no coordinate, so ask the stadium, which does. */
  'Ole Miss': ['University of Mississippi', 'Vaught-Hemingway Stadium', 'Oxford, Mississippi'],
  'LSU': ['Louisiana State University', 'Baton Rouge, Louisiana'],
  'TCU': 'Texas Christian University',
  'SMU': 'Southern Methodist University',
  'UCF': 'University of Central Florida',
  'UCLA': 'University of California, Los Angeles',
  'USC': 'University of Southern California',
  'UNLV': 'University of Nevada, Las Vegas',
  'NC State': 'North Carolina State University',
  'California': 'University of California, Berkeley',
  'Georgia Tech': 'Georgia Institute of Technology',
  'Virginia Tech': 'Virginia Tech',
  'Penn State': 'Pennsylvania State University',
  /* "Miami" is a city in Florida and a university in Ohio. The one that plays in the ACC
     is the private one in Coral Gables. */
  'Miami': 'University of Miami',
  /* "Washington" is a state, a city, and a president. */
  'Washington': 'University of Washington',
  'Pittsburgh': 'University of Pittsburgh',
  'Colorado': 'University of Colorado Boulder',
  'Texas': 'University of Texas at Austin',
  'Illinois': 'University of Illinois Urbana-Champaign',
  'Maryland': 'University of Maryland, College Park',
  'Minnesota': 'University of Minnesota',
  'Missouri': 'University of Missouri',
  'Nebraska': 'University of Nebraska-Lincoln',
  'Tennessee': 'University of Tennessee',
  'Arkansas': 'University of Arkansas',
  'North Carolina': 'University of North Carolina at Chapel Hill',
  'Wisconsin': 'University of Wisconsin-Madison',
};

/* The ordinary shapes, tried in order, for everybody else. */
function candidates(school) {
  var named = TITLES[school];
  if (named) return Array.isArray(named) ? named : [named];
  const out = [];
  if (/ State$/.test(school)) out.push(school + ' University');
  out.push('University of ' + school);
  out.push(school + ' University');
  out.push(school);
  return out;
}

/* THE CONTINENTAL UNITED STATES, generously drawn. Every school in this data plays in it,
   so anything outside is a wrong article rather than a surprising campus. */
const US = { latMin: 24.0, latMax: 49.5, lonMin: -125.5, lonMax: -66.5 };
const inUS = (c) => c && c.lat >= US.latMin && c.lat <= US.latMax
  && c.lon >= US.lonMin && c.lon <= US.lonMax;

/* ONE ARTICLE AT A TIME, THROUGH THE CACHED ENDPOINT. The action API answers a batch of
   titles in instalments AND throttles a script that asks for many at once: through this
   sandbox's proxy it went to 429 after three requests and resolved twenty of eighty-three
   even with exponential backoff. The REST summary endpoint is served from Wikimedia's CDN,
   carries the same coordinate, and answers one page per request without complaint.

   Slower, and it does not matter: this runs when somebody changes the school list, which is
   roughly never, and the answers are cached on disk so a re-run costs nothing. */
const CACHE = ROOT + '/cfb/build/.cache/places.json';
let cache = {};
try { cache = JSON.parse(fs.readFileSync(CACHE, 'utf8')); } catch (e) {}
function saveCache() {
  try {
    fs.mkdirSync(path.dirname(CACHE), { recursive: true });
    fs.writeFileSync(CACHE, JSON.stringify(cache, null, 0));
  } catch (e) {}
}

async function summary(title) {
  if (Object.prototype.hasOwnProperty.call(cache, title)) return cache[title];
  const url = 'https://en.wikipedia.org/api/rest_v1/page/summary/'
    + encodeURIComponent(title.replace(/ /g, '_'));
  let got = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    let r;
    try {
      r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'application/json' } });
    } catch (e) { r = null; }
    if (r && r.status === 404) { got = null; break; }
    if (r && r.ok) {
      const d = await r.json();
      const c = d.coordinates;
      got = c ? { title: d.title || title, lat: c.lat, lon: c.lon } : null;
      break;
    }
    await new Promise((res) => setTimeout(res, 1200 * Math.pow(2, attempt)));
  }
  /* ONLY SUCCESSES ARE CACHED. A transient failure written to the cache is permanent: LSU
     has coordinates and came back empty once, and every re-run then read the cached null
     and reported a school with no location. A miss costs one request next time. */
  if (got) cache[title] = got;
  return got;
}

/* Try a school's candidate titles in order and take the first that lands in the country. */
async function placeOf(school, tries) {
  for (const t of tries) {
    const g = await summary(t);
    await new Promise((res) => setTimeout(res, 120));
    if (g && inUS(g)) return g;
  }
  return null;
}

const teams = JSON.parse(fs.readFileSync(ROOT + '/cfb/data/cfb_team_seasons.json', 'utf8'));
const schools = Array.from(new Set(teams.map((t) => t.school))).sort();
console.log('resolving ' + schools.length + ' schools');

const places = {};
const missing = [];
let done = 0;
for (const s of schools) {
  const hit = await placeOf(s, candidates(s));
  done++;
  if (done % 10 === 0) { saveCache(); console.log('  ' + done + '/' + schools.length); }
  if (!hit) { missing.push(s + '  (tried ' + candidates(s).join(' | ') + ')'); continue; }
  places[s] = {
    lat: Math.round(hit.lat * 10000) / 10000,
    lon: Math.round(hit.lon * 10000) / 10000,
    source: hit.title,
  };
}
saveCache();

/* TWO SCHOOLS AT ONE POINT MEANS ONE OF THEM IS THE WRONG ARTICLE, which is exactly how a
   bad title fails: quietly, with a real coordinate attached. */
const seen = {}, dupes = [];
for (const s in places) {
  const k = places[s].lat.toFixed(2) + ',' + places[s].lon.toFixed(2);
  if (seen[k]) dupes.push(seen[k] + ' and ' + s + ' both at ' + k);
  seen[k] = s;
}

console.log('resolved ' + Object.keys(places).length + ' of ' + schools.length);
if (missing.length) { console.log('\nNOT RESOLVED:'); missing.forEach((m) => console.log('  ' + m)); }
if (dupes.length) { console.log('\nSAME POINT:'); dupes.forEach((d) => console.log('  ' + d)); }

if (CHECK) { process.exit(missing.length || dupes.length ? 1 : 0); }
if (missing.length || dupes.length) {
  console.log('\nNothing written. Name the unresolved ones in TITLES and run again.');
  process.exit(1);
}
fs.writeFileSync(ROOT + '/cfb/data/cfb_places.json', JSON.stringify(places, null, 0) + '\n');
console.log('wrote cfb/data/cfb_places.json');
