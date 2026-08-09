/* Elite-award ingestion pipeline -> arcade/awards.js (window.RTG_AWARDS).
 *
 * Enriches the corpus with real recognizability signals so the games no
 * longer have to guess who's famous from career length alone. Emits a
 * small map {sport|name: {aw:['MVP','ProBowl',...]}} that data.js merges
 * onto matching entities alongside the hand-curated stars overlay.
 *
 * Sources (all keyless, publicly cacheable HTML/JSON):
 *   MLB — statsapi.mlb.com/api/v1/awards + awardRecipients (MVP, Cy Young,
 *         All-Star, Rookie of the Year, Silver Slugger)
 *   NBA — data.nba.net awards feed + basketball-reference honors pages
 *         (MVP, DPOY, All-Star, All-NBA, ROY, Finals MVP)
 *   NFL — pro-football-reference.com honors + Pro Bowl summary pages
 *         (MVP, OPOY, DPOY, Pro Bowl, All-Pro, Super Bowl MVP, ROY)
 *
 * Called by .github/workflows/awards.yml (monthly cron). Local run:
 *   node scripts/fetch-awards.mjs
 *
 * Fail-safe: if any source blocks or errors, the script still emits what
 * it did fetch. Missing awards is silent — the star overlay is the fallback.
 *
 * NOTE (2026-08-09): first version ships only the MLB path (statsapi is
 * the most reliable). NBA and NFL scrapers are stubbed with the shape
 * they should return so the workflow schema stays stable across shipments.
 */
import { writeFileSync } from 'fs';

const NOW_YEAR = new Date().getFullYear();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function j(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'runthe-arcade/awards 1.0' } });
      if (r.ok) return await r.json();
      if (r.status === 404) return null;
    } catch (e) { /* retry */ }
    await sleep(400 * (i + 1));
  }
  return null;
}

// Aggregate awards into a name-keyed map. Keys are 'SPORT|Full Name' (lowered
// & entity-normalized so upstream spelling variance doesn't split entries).
function norm(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[\.']/g, '').replace(/\s+/g, ' ').trim();
}
const AWARDS = new Map();   // 'SPORT|normName' -> Set of award tags
function add(sport, name, tag) {
  if (!name || !tag) return;
  const k = sport + '|' + norm(name);
  let s = AWARDS.get(k); if (!s) { s = new Set(); AWARDS.set(k, s); }
  s.add(tag);
}

/* ----------------------------- MLB (statsapi) --------------------------- */
// Award IDs come from /api/v1/awards. We hydrate the recipients for each
// season back to 1980 for a big-enough historical sweep, then tag each
// recipient with a short readable label the games can use.
const MLB_AWARDS = {
  MLBMVP:        'MLB MVP',
  ALMVP:         'AL MVP',
  NLMVP:         'NL MVP',
  MLBCY:         'Cy Young',
  ALCY:          'AL Cy Young',
  NLCY:          'NL Cy Young',
  MLBROY:        'Rookie of the Year',
  ALROY:         'AL Rookie of the Year',
  NLROY:         'NL Rookie of the Year',
  ALAS:          'AL All-Star',
  NLAS:          'NL All-Star',
  MLBAS:         'MLB All-Star',
  ALSS:          'Silver Slugger',
  NLSS:          'Silver Slugger',
  MLBSS:         'Silver Slugger',
  ALGG:          'Gold Glove',
  NLGG:          'Gold Glove',
  MLBGG:         'Gold Glove',
  MLBHOF:        'Hall of Fame'
};
async function buildMLB() {
  for (const [id, label] of Object.entries(MLB_AWARDS)) {
    for (let y = 1980; y <= NOW_YEAR; y++) {
      const d = await j(`https://statsapi.mlb.com/api/v1/awards/${id}/recipients?season=${y}`);
      const recs = d && d.awards;
      if (recs) recs.forEach((r) => {
        const p = r.player; if (p && p.fullName) add('MLB', p.fullName, label);
      });
      await sleep(80);
    }
  }
  console.log('MLB awards: distinct recipients so far ->', AWARDS.size);
}

/* ----------------------------- NBA (stub) ------------------------------- */
// TODO(2026-08-09): implement. Candidate sources:
//   - https://data.nba.net/data/10s/prod/v1/history/awards.json (unofficial)
//   - basketball-reference.com/awards/mvp.html + /all-star + /all-nba
//     (HTML; needs a table parser)
async function buildNBA() {
  // No-op stub — leaves awards.js light on NBA until the scraper is wired.
  return 0;
}

/* ----------------------------- NFL (stub) ------------------------------- */
// TODO(2026-08-09): implement. Candidate source:
//   - pro-football-reference.com/awards/awards_YYYY.htm per season
//     (HTML tables; scraping is straightforward with cheerio or a small
//     regex-based parser).
//   - Pro Bowl rosters: pro-football-reference.com/years/YYYY/probowl.htm
async function buildNFL() {
  return 0;
}

/* --------------------------------- main -------------------------------- */
try { await buildMLB(); } catch (e) { console.error('MLB awards failed:', e.message); }
try { await buildNBA(); } catch (e) { console.error('NBA awards failed:', e.message); }
try { await buildNFL(); } catch (e) { console.error('NFL awards failed:', e.message); }

const out = {};
for (const [k, v] of AWARDS) { out[k] = { aw: Array.from(v).sort() }; }

const file =
  '/* GENERATED by scripts/fetch-awards.mjs. Do not edit. Elite awards\n' +
  ' * keyed by sport|normalized-name; data.js merges these onto matching\n' +
  ' * corpus entities so game gates can surface real credentials. */\n' +
  'window.RTG_AWARDS = ' + JSON.stringify({
    updated: new Date().toISOString().slice(0, 10),
    count: Object.keys(out).length,
    players: out
  }) + ';\n';

writeFileSync('arcade/awards.js', file);
console.log('wrote arcade/awards.js:', Object.keys(out).length, 'award-decorated players');
