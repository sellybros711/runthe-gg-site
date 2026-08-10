/* Elite-award ingestion pipeline -> arcade/awards.js (window.RTG_AWARDS).
 *
 * Enriches the corpus with real recognizability signals so the games no
 * longer have to guess who's famous from career length alone. Emits a
 * small map {SPORT|normalized name: {aw:['MVP','Pro Bowl',...]}} that
 * data.js merges onto matching entities alongside the star overlay.
 *
 * SOURCES
 *   MLB  statsapi.mlb.com — the award list is DISCOVERED from /api/v1/awards
 *        rather than hardcoded, then recipients are hydrated per season.
 *        (The previous hardcoded id list is why this shipped 0 rows: those
 *        ids are not what the endpoint actually serves.)
 *   NBA  en.wikipedia.org category membership.
 *   NFL  en.wikipedia.org category membership.
 *
 * Wikipedia categories rather than sports-reference HTML: the reference
 * sites rate-limit and block CI runners, and their honors tables live
 * inside HTML comments, so a scraper against them is both fragile and
 * likely to be refused. A category listing is a keyless paginated JSON
 * API whose members are exactly the article titles we want - the player
 * names - with no table parsing at all.
 *
 * SAFETY. Every source reports its own count, and the run FAILS loudly if
 * a sport contributes nothing or if the new dataset is drastically smaller
 * than the one already committed. Silently overwriting awards.js with an
 * empty file is what let the last breakage sit unnoticed. Override with
 * --force when a shrink is genuinely intended.
 *
 * Called by .github/workflows/awards.yml (monthly cron). Local run:
 *   node scripts/fetch-awards.mjs [--force] [--only=NBA,NFL]
 */
import { writeFileSync, readFileSync, existsSync } from 'fs';

const ARGV = process.argv.slice(2);
const FORCE = ARGV.includes('--force');
const ONLY = (ARGV.find((a) => a.startsWith('--only=')) || '').slice(7)
  .split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
const NOW_YEAR = new Date().getFullYear();
const UA = 'runthe-arcade-awards/2.0 (+https://runthe.gg; contact RunTheGames@outlook.com)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* Fixed-size worker pool. The first version of this walked ~4,600 statsapi
 * season endpoints one at a time with a sleep between each, which spent
 * twenty-odd minutes doing nothing but waiting on round trips and blew the
 * workflow's timeout. Latency-bound work wants concurrency, not patience. */
async function mapPool(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  }));
  return out;
}

async function req(url, tries = 3) {
  let last = '';
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
      if (r.ok) return await r.json();
      // statsapi answers 500, not 404, for an award/season pair it does not
      // serve - a permanent "no", so retrying it just triples the cost.
      if (r.status === 404 || r.status === 500) return null;
      last = 'HTTP ' + r.status;
    } catch (e) { last = e.message; }
    await sleep(500 * (i + 1));
  }
  if (last) process.stderr.write('  ! ' + last + '  ' + url + '\n');
  return null;
}

/* Must stay byte-identical in effect to data.js's normName, or every key
 * misses. data.js strips accents too; keep the two in step. */
function norm(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[\.']/g, '').replace(/\s+/g, ' ').trim();
}

const AWARDS = new Map();            // 'SPORT|normName' -> Set of tags
function add(sport, name, tag) {
  if (!name || !tag) return false;
  const k = sport + '|' + norm(name);
  let s = AWARDS.get(k);
  if (!s) { s = new Set(); AWARDS.set(k, s); }
  s.add(tag);
  return true;
}

/* ---------------------------- Wikipedia categories ---------------------- */
const WIKI = 'https://en.wikipedia.org/w/api.php';

// Article titles carry disambiguators the corpus never has:
//   "Chris Johnson (running back)" -> "Chris Johnson"
// Anything that isn't a person's article (lists, seasons, templates) is
// dropped rather than guessed at.
function titleToName(t) {
  const bare = String(t).replace(/\s*\([^)]*\)\s*$/, '').trim();
  if (!bare || bare.length > 48) return null;
  if (/^(List|Category|Template|Portal|Index|Timeline|History|Comparison)\b/i.test(bare)) return null;
  if (!/^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'.\- ]+$/.test(bare)) return null;
  if (bare.split(/\s+/).length < 2) return null;      // a person has at least two words
  return bare;
}

async function catMembers(category) {
  const out = [];
  let cont = '';
  for (let page = 0; page < 20; page++) {
    const url = WIKI + '?action=query&format=json&formatversion=2&list=categorymembers' +
      '&cmtitle=' + encodeURIComponent('Category:' + category) +
      '&cmnamespace=0&cmlimit=500' + (cont ? '&cmcontinue=' + encodeURIComponent(cont) : '');
    const d = await req(url);
    const rows = d && d.query && d.query.categorymembers;
    if (!rows) break;
    rows.forEach((r) => { const n = titleToName(r.title); if (n) out.push(n); });
    cont = d.continue && d.continue.cmcontinue;
    if (!cont) break;
    await sleep(120);
  }
  return out;
}

// Wikipedia renames categories, and guessing their exact titles is how the
// first live run lost every NBA and NFL award except the halls of fame - the
// enumeration worked, the title just didn't exist. So don't guess: search the
// Category namespace, then accept a hit only if it contains every word that
// identifies the award and none that would make it the wrong league or the
// wrong sport. A resolution that fails prints its candidates, so a rename is a
// one-line diff next time rather than another silent zero.
//
// { q: search phrase, must: [required substrings], not: [disqualifiers], tag }
const NO_WOMEN = ['wnba', 'women', "women's", 'girls'];
const NO_AMATEUR = ['college', 'ncaa', 'high school', 'euroleague', 'canadian football'];
const NBA_CATS = [
  { q: 'NBA Most Valuable Player Award winners', must: ['most valuable player'], not: NO_WOMEN.concat(NO_AMATEUR, ['finals', 'all-star game']), tag: 'NBA MVP' },
  { q: 'NBA Finals Most Valuable Player Award winners', must: ['finals', 'most valuable player'], not: NO_WOMEN.concat(NO_AMATEUR), tag: 'Finals MVP' },
  { q: 'NBA All-Star Game Most Valuable Player Award winners', must: ['all-star', 'most valuable player'], not: NO_WOMEN.concat(NO_AMATEUR), tag: 'All-Star Game MVP' },
  { q: 'NBA Defensive Player of the Year Award winners', must: ['defensive player of the year'], not: NO_WOMEN.concat(NO_AMATEUR, ['football']), tag: 'Defensive Player of the Year' },
  { q: 'NBA Rookie of the Year Award winners', must: ['rookie of the year'], not: NO_WOMEN.concat(NO_AMATEUR, ['football', 'baseball']), tag: 'Rookie of the Year' },
  { q: 'NBA Sixth Man of the Year Award winners', must: ['sixth man'], not: NO_WOMEN.concat(NO_AMATEUR), tag: 'Sixth Man of the Year' },
  { q: 'National Basketball Association All-Stars', must: ['all-star'], not: NO_WOMEN.concat(NO_AMATEUR, ['most valuable player', 'game']), tag: 'NBA All-Star' },
  { q: 'Naismith Memorial Basketball Hall of Fame inductees', must: ['hall of fame'], not: NO_WOMEN.concat(NO_AMATEUR), tag: 'Hall of Fame' }
];
const NFL_CATS = [
  { q: 'National Football League Most Valuable Player Award winners', must: ['most valuable player'], not: NO_WOMEN.concat(NO_AMATEUR, ['super bowl', 'pro bowl', 'basketball', 'baseball']), tag: 'NFL MVP' },
  { q: 'Super Bowl Most Valuable Player Award winners', must: ['super bowl', 'most valuable player'], not: NO_WOMEN, tag: 'Super Bowl MVP' },
  { q: 'NFL Offensive Player of the Year Award winners', must: ['offensive player of the year'], not: NO_WOMEN.concat(NO_AMATEUR, ['rookie']), tag: 'Offensive Player of the Year' },
  { q: 'NFL Defensive Player of the Year Award winners', must: ['defensive player of the year'], not: NO_WOMEN.concat(NO_AMATEUR, ['rookie', 'basketball']), tag: 'Defensive Player of the Year' },
  { q: 'NFL Offensive Rookie of the Year Award winners', must: ['offensive rookie of the year'], not: NO_WOMEN.concat(NO_AMATEUR), tag: 'Offensive Rookie of the Year' },
  { q: 'NFL Defensive Rookie of the Year Award winners', must: ['defensive rookie of the year'], not: NO_WOMEN.concat(NO_AMATEUR), tag: 'Defensive Rookie of the Year' },
  { q: 'National Conference Pro Bowl players', must: ['pro bowl'], not: NO_WOMEN, tag: 'Pro Bowl' },
  { q: 'American Conference Pro Bowl players', must: ['pro bowl'], not: NO_WOMEN, tag: 'Pro Bowl' },
  { q: 'Pro Football Hall of Fame inductees', must: ['hall of fame'], not: NO_WOMEN.concat(['college']), tag: 'Hall of Fame' }
];
const MLB_CATS = [
  { q: 'Major League Baseball Most Valuable Player Award winners', must: ['most valuable player'], not: NO_WOMEN.concat(NO_AMATEUR, ['world series', 'all-star game', 'league championship']), tag: 'MLB MVP' },
  { q: 'Cy Young Award winners', must: ['cy young'], not: [], tag: 'Cy Young' },
  { q: 'Major League Baseball Rookie of the Year Award winners', must: ['rookie of the year'], not: NO_WOMEN.concat(NO_AMATEUR, ['football', 'basketball']), tag: 'Rookie of the Year' },
  { q: 'Gold Glove Award winners', must: ['gold glove'], not: [], tag: 'Gold Glove' },
  { q: 'Silver Slugger Award winners', must: ['silver slugger'], not: [], tag: 'Silver Slugger' },
  { q: 'Major League Baseball All-Stars', must: ['all-star'], not: NO_WOMEN.concat(NO_AMATEUR, ['most valuable player', 'game']), tag: 'MLB All-Star' },
  { q: 'National Baseball Hall of Fame inductees', must: ['hall of fame'], not: NO_WOMEN.concat(['college']), tag: 'Hall of Fame' },
  { q: 'World Series Most Valuable Player Award winners', must: ['world series', 'most valuable player'], not: NO_WOMEN, tag: 'World Series MVP' }
];

const RESOLVED = new Map();
async function resolveCategory(spec) {
  if (RESOLVED.has(spec.q)) return RESOLVED.get(spec.q);
  const d = await req(WIKI + '?action=query&format=json&formatversion=2&list=search' +
    '&srnamespace=14&srlimit=12&srsearch=' + encodeURIComponent(spec.q));
  const hits = ((d && d.query && d.query.search) || []).map((h) => String(h.title).replace(/^Category:/, ''));
  const ok = hits.find((t) => {
    const l = t.toLowerCase();
    return spec.must.every((m) => l.includes(m)) && !spec.not.some((n) => l.includes(n));
  }) || null;
  if (!ok) console.log('  ??   nothing matched "' + spec.q + '"; candidates: ' + (hits.join(' | ') || '(none)'));
  RESOLVED.set(spec.q, ok);
  return ok;
}

async function buildFromCats(sport, specs) {
  let total = 0;
  const titles = await mapPool(specs, 3, (spec) => resolveCategory(spec));
  const got = await mapPool(specs, 3, (spec, i) => (titles[i] ? catMembers(titles[i]) : []));
  specs.forEach((spec, i) => {
    const names = got[i] || [];
    names.forEach((n) => { if (add(sport, n, spec.tag)) total++; });
    console.log('  ' + sport + '  ' + String(names.length).padStart(5) + '  ' + spec.tag +
      '  <- ' + (titles[i] || 'UNRESOLVED'));
  });
  return total;
}


/* -------------------------------- MLB ----------------------------------- */
// The endpoint publishes its own award catalogue; take the ids from there so
// a renamed or added award is picked up instead of quietly missed.
const MLB_WANT = /(most valuable player|cy young|rookie of the year|all-star|silver slugger|gold glove|hall of fame|world series most valuable)/i;
function mlbLabel(name) {
  const n = String(name);
  if (/hall of fame/i.test(n)) return 'Hall of Fame';
  if (/world series most valuable/i.test(n)) return 'World Series MVP';
  if (/most valuable player/i.test(n)) return 'MLB MVP';
  if (/cy young/i.test(n)) return 'Cy Young';
  if (/rookie of the year/i.test(n)) return 'Rookie of the Year';
  if (/silver slugger/i.test(n)) return 'Silver Slugger';
  if (/gold glove/i.test(n)) return 'Gold Glove';
  if (/all-star/i.test(n)) return 'MLB All-Star';
  return null;
}
// statsapi publishes hundreds of awards, including minor-league and per-club
// ones. Hydrating every match back to 1980 is thousands of round trips, so the
// list is capped - and what the cap drops is printed, because a silent
// truncation reads as "covered everything" when it isn't.
const MLB_MAX_AWARDS = 40;
const PROBE_YEARS = [2024, 2019, 2014, 2009, 2004, 1999];   // spread, so a defunct-but-real award still lands
// statsapi's catalogue is mostly MINOR league: the first run burned its whole
// budget on ids like SLMSAS and TLPLOY (Southern League, Texas League), every
// one of which 500s and yields nothing. Filter to the majors when the payload
// says which sport an award belongs to, and - because that field may be absent
// or renamed - probe each survivor across six spread seasons before committing
// to a full sweep. A wrong filter then costs six requests, not forty-seven.
function isMajors(a) {
  var s = a.sportId != null ? a.sportId : (a.sport && a.sport.id);
  var l = a.leagueId != null ? a.leagueId : (a.league && a.league.id);
  if (s != null) return s === 1;
  if (l != null) return l === 103 || l === 104;   // AL / NL
  return true;                                    // no sport field at all -> let the probe decide
}
async function buildMLB() {
  const cat = await req('https://statsapi.mlb.com/api/v1/awards');
  const all = (cat && cat.awards) || [];
  console.log('  MLB  statsapi published ' + all.length + ' awards');
  if (all.length) console.log('  MLB  award record shape: ' + Object.keys(all[0]).join(','));

  let named = all.filter((a) => a && a.id && MLB_WANT.test(a.name || '') && mlbLabel(a.name));
  const majors = named.filter(isMajors);
  console.log('  MLB  ' + named.length + ' match by name, ' + majors.length + ' of those look major-league');

  // probe
  const probed = await mapPool(majors, 8, async (a) => {
    const hits = await mapPool(PROBE_YEARS, 3, (y) =>
      req('https://statsapi.mlb.com/api/v1/awards/' + encodeURIComponent(a.id) + '/recipients?season=' + y, 1));
    return hits.some((d) => d && d.awards && d.awards.length);
  });
  const dead = majors.filter((a, i) => !probed[i]);
  let wanted = majors.filter((a, i) => probed[i]);
  if (dead.length) console.log('  MLB  ' + dead.length + ' served nothing on probe, skipped: ' + dead.map((a) => a.id).join(', '));
  if (wanted.length > MLB_MAX_AWARDS) {
    console.log('  MLB  capping at ' + MLB_MAX_AWARDS + ', SKIPPING: ' + wanted.slice(MLB_MAX_AWARDS).map((a) => a.id).join(', '));
    wanted = wanted.slice(0, MLB_MAX_AWARDS);
  }

  const years = [];
  for (let y = 1980; y <= NOW_YEAR; y++) years.push(y);
  console.log('  MLB  hydrating ' + wanted.length + ' awards x ' + years.length + ' seasons');

  let total = 0;
  for (const a of wanted) {
    const label = mlbLabel(a.name);
    let got = 0;
    const pages = await mapPool(years, 8, (y) =>
      req('https://statsapi.mlb.com/api/v1/awards/' + encodeURIComponent(a.id) + '/recipients?season=' + y, 1));
    pages.forEach((d) => {
      ((d && d.awards) || []).forEach((r) => {
        const p = r && r.player;
        if (p && p.fullName && add('MLB', p.fullName, label)) { got++; total++; }
      });
    });
    console.log('  MLB  ' + String(got).padStart(5) + '  ' + a.id + '  ' + label);
  }
  return total;
}

/* --------------------------------- main --------------------------------- */
function want(sport) { return !ONLY.length || ONLY.includes(sport); }

const report = {};
if (want('MLB')) {
  // statsapi is opt-in. Its /awards/{id}/recipients endpoint returned zero rows
  // for every award on two live runs - first with hardcoded ids, then with ids
  // discovered from its own catalogue and probed - while answering 500 for most
  // of them. Wikipedia carries MLB completely (MVP, Cy Young, ROY, Gold Glove,
  // Silver Slugger, All-Star, World Series MVP, Hall of Fame), so the default
  // path is the one that actually produces data. --statsapi re-enables the
  // other, for the day it starts serving again.
  if (ARGV.includes('--statsapi')) {
    try { report.MLB = await buildMLB(); } catch (e) { console.error('MLB statsapi failed:', e.message); report.MLB = 0; }
    if (!report.MLB) console.error('MLB via statsapi produced nothing - Wikipedia categories follow');
  }
  try { report.MLB = (report.MLB || 0) + await buildFromCats('MLB', MLB_CATS); }
  catch (e) { console.error('MLB failed:', e.message); }
}
if (want('NBA')) {
  try { report.NBA = await buildFromCats('NBA', NBA_CATS); } catch (e) { console.error('NBA failed:', e.message); report.NBA = 0; }
}
if (want('NFL')) {
  try { report.NFL = await buildFromCats('NFL', NFL_CATS); } catch (e) { console.error('NFL failed:', e.message); report.NFL = 0; }
}

const out = {};
const perSport = {};
for (const [k, v] of AWARDS) {
  out[k] = { aw: Array.from(v).sort() };
  const s = k.split('|')[0];
  perSport[s] = (perSport[s] || 0) + 1;
}
console.log('\ndistinct award-decorated players by sport:', perSport);

// Refuse to shrink the committed dataset into nothing by accident.
let prev = 0;
try {
  if (existsSync('arcade/awards.js')) {
    const m = /"count":(\d+)/.exec(readFileSync('arcade/awards.js', 'utf8'));
    if (m) prev = parseInt(m[1], 10);
  }
} catch (e) {}

const total = Object.keys(out).length;
const missing = ['MLB', 'NBA', 'NFL'].filter((s) => want(s) && !perSport[s]);
if (!FORCE && missing.length) {
  console.error('\nFAIL: no rows for ' + missing.join(', ') + '. Refusing to write a dataset ' +
    'that would silently drop a whole sport. Fix the source, or pass --force.');
  process.exit(1);
}
if (!FORCE && prev && total < prev * 0.5) {
  console.error('\nFAIL: ' + total + ' rows is less than half the committed ' + prev +
    '. Refusing to overwrite. Pass --force if the shrink is intended.');
  process.exit(1);
}

const file =
  '/* GENERATED by scripts/fetch-awards.mjs. Do not edit. Elite awards\n' +
  ' * keyed by sport|normalized-name; data.js merges these onto matching\n' +
  ' * corpus entities so game gates can surface real credentials. */\n' +
  'window.RTG_AWARDS = ' + JSON.stringify({
    updated: new Date().toISOString().slice(0, 10),
    count: total,
    bySport: perSport,
    players: out
  }) + ';\n';

writeFileSync('arcade/awards.js', file);
console.log('wrote arcade/awards.js:', total, 'award-decorated players (was ' + prev + ')');
