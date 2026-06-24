// buildRosterUpdates.js — emit the Roster Updates feed as ONE ENTRY PER UPGRADE.
//
// The roster page renders one row per object here, so a player who was upgraded
// on several matchdays appears once per upgrade (e.g. Cyle Larin Jun 12 + Jun 18).
// Source of truth = the 2026 changelog .md (each "- Player (Country): old → new
// — reason" bullet is one event), plus the community-request corrections carried
// in the merged raw JSON.
//
//   OUT: data/roster_updates.json   (fetched by the page)
//   OUT: data/roster_updates.js     (window.ROSTER_UPDATES — file:// fallback)
const fs = require('fs');
const path = require('path');

const MD = '/root/.claude/uploads/3327b054-5e6f-528e-8f9b-73fec84c411b/5a9154a1-2026_WC_rating_changelog.md';
const RAW = path.join(__dirname, '..', 'data', 'world_cup_full_rosters_1966_2026_4.json');
const PLAYERS = path.join(__dirname, '..', 'data', 'players_all.json');
const OUT_JSON = path.join(__dirname, '..', 'data', 'roster_updates.json');
const OUT_JS = path.join(__dirname, '..', 'data', 'roster_updates.js');

const norm = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const COUNTRY = {
  'usa': 'united states', 'united states': 'united states',
  "côte d'ivoire": 'ivory coast', "cote d'ivoire": 'ivory coast', 'ivory coast': 'ivory coast',
  'congo dr': 'dr congo', 'dr congo': 'dr congo',
  'bosnia': 'bosnia and herzegovina', 'bosnia and herzegovina': 'bosnia and herzegovina',
};
const ncountry = c => COUNTRY[norm(c)] || norm(c);

// index players by normalized name+country (and name alone) for position/canonical lookup
const players = JSON.parse(fs.readFileSync(PLAYERS, 'utf8'));
const p2026 = players.filter(p => +p.year === 2026);
function lookup(name, country) {
  const nn = norm(name), nc = ncountry(country);
  let m = p2026.filter(p => norm(p.name) === nn && ncountry(p.country) === nc);
  if (m.length !== 1) m = p2026.filter(p => norm(p.name) === nn);
  return m[0] || null;
}

// ---- parse changelog into individual events ----
const md = fs.readFileSync(MD, 'utf8');
let curDate = null;
const events = [];
for (const raw of md.split('\n')) {
  const line = raw.trim();
  const dm = line.match(/^##\s*[^\w]*\s*(June \d+)/);
  if (dm) {
    const d = dm[1].match(/June (\d+)/);
    curDate = d ? `2026-06-${String(+d[1]).padStart(2, '0')}` : null;
    continue;
  }
  const m = line.match(/^-\s+(.+?)\s+\(([^)]+)\):\s*(\d+)\s*→\s*(\d+)\s*[—-]+\s*(.+)$/);
  if (!m || !curDate) continue;
  const name = m[1].trim(), country = m[2].trim();
  const pl = lookup(name, country);
  events.push({
    name: pl ? pl.name : name,
    country: pl ? pl.country : country,
    year: 2026,
    position: pl ? pl.position : '',
    pre_wc_overall: +m[3],
    wc_overall: +m[4],
    wc_date: curDate,
    wc_note: m[5].trim(),
  });
  if (!pl) console.warn('  no player match for', name, '(' + country + ')');
}
console.log('Parsed', events.length, 'individual upgrade events.');

// ---- community-request corrections (undated) from the merged raw JSON ----
const raw = JSON.parse(fs.readFileSync(RAW, 'utf8'));
const community = raw.filter(r => r.is_community_request);
for (const c of community) {
  const pl = players.find(p => +p.year === +c.wc_year && p.name === c.player_name && norm(p.country) === ncountry(c.country));
  events.push({
    name: c.player_name,
    country: pl ? pl.country : c.country,
    year: +c.wc_year,
    position: pl ? pl.position : '',
    pre_wc_overall: +c.pre_wc_overall,
    wc_overall: +c.wc_overall,
    wc_date: null,
    wc_note: c.wc_note || '',
    is_community: true,
  });
}
console.log('Added', community.length, 'community-request entries. Total:', events.length);

fs.writeFileSync(OUT_JSON, JSON.stringify(events));
fs.writeFileSync(OUT_JS, `window.ROSTER_UPDATES = ${JSON.stringify(events)};\n`);
console.log('Wrote', OUT_JSON, 'and', OUT_JS);
