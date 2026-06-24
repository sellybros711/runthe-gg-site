// mergeChangelog.js — merge the 2026 rating changelog (roster-update metadata)
// onto the new FINAL roster JSON, and carry over community-request entries.
//
//   IN  : new FINAL.json (raw rosters, no roster-update fields)
//   IN  : changelog .md  (Player (Country): old → new — reason, grouped by date)
//   IN  : old _4.json    (source of the 4 community-request entries)
//   OUT : data/world_cup_full_rosters_1966_2026_4.json  (convertData IN_PATH)
const fs = require('fs');
const path = require('path');

const UPLOADS = '/root/.claude/uploads/3327b054-5e6f-528e-8f9b-73fec84c411b';
const NEW_JSON = path.join(UPLOADS, '4ac42f0a-world_cup_full_rosters_1966_2026_FINAL.json');
const MD = path.join(UPLOADS, '5a9154a1-2026_WC_rating_changelog.md');
const OLD_JSON = path.join(__dirname, '..', 'data', 'world_cup_full_rosters_1966_2026_4.json');
const OUT_JSON = OLD_JSON; // overwrite the convertData IN_PATH

const norm = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// changelog country -> data country
const COUNTRY = {
  'usa': 'United States', 'united states': 'United States',
  "côte d'ivoire": 'Ivory Coast', "cote d'ivoire": 'Ivory Coast',
  'congo dr': 'DR Congo', 'dr congo': 'DR Congo',
  'bosnia': 'Bosnia and Herzegovina', 'bosnia and herzegovina': 'Bosnia and Herzegovina',
};
const fixCountry = c => COUNTRY[norm(c)] || c;

// ---- parse changelog ----
const md = fs.readFileSync(MD, 'utf8');
let curDate = null;
const updates = []; // {name, country, old, neu, date, reason}
for (const raw of md.split('\n')) {
  const line = raw.trim();
  const dm = line.match(/^##\s*📅?\s*(June \d+)/) || line.match(/^##\s*🔼?\s*(June \d+)/);
  if (dm) {
    // map "June 11" -> 2026-06-11
    const d = dm[1].match(/June (\d+)/);
    curDate = d ? `2026-06-${String(+d[1]).padStart(2, '0')}` : null;
    continue;
  }
  // - Player (Country): old → new — reason
  const m = line.match(/^-\s+(.+?)\s+\(([^)]+)\):\s*(\d+)\s*→\s*(\d+)\s*[—-]+\s*(.+)$/);
  if (m && curDate) {
    updates.push({
      name: m[1].trim(), country: fixCountry(m[2]),
      old: +m[3], neu: +m[4], date: curDate, reason: m[5].trim(),
    });
  }
}
console.log('Parsed', updates.length, 'changelog updates across dates.');

// collapse per player: baseline = earliest old, date = latest, note = latest reason
const perPlayer = new Map(); // key name|country -> {baseline, lastDate, lastReason, lastNew}
for (const u of updates) {
  const key = norm(u.name) + '|' + norm(u.country);
  const cur = perPlayer.get(key);
  if (!cur) { perPlayer.set(key, { u, baseline: u.old, lastDate: u.date, lastReason: u.reason, lastNew: u.neu }); continue; }
  // baseline stays earliest old (updates are in chronological order, so first wins)
  if (u.date >= cur.lastDate) { cur.lastDate = u.date; cur.lastReason = u.reason; cur.lastNew = u.neu; }
}
console.log('Distinct players updated:', perPlayer.size);

// ---- load data ----
const data = JSON.parse(fs.readFileSync(NEW_JSON, 'utf8'));
const idx2026 = data.filter(r => +r.wc_year === 2026);

function findRow(name, country) {
  const nn = norm(name), nc = norm(country);
  let m = idx2026.filter(r => norm(r.player_name) === nn && norm(r.country) === nc);
  if (m.length === 1) return m[0];
  if (m.length === 0) m = idx2026.filter(r => norm(r.player_name) === nn);
  return m.length === 1 ? m[0] : (m[0] || null);
}

let applied = 0, mismatch = 0, notfound = [];
for (const [key, p] of perPlayer) {
  const row = findRow(p.u.name, p.u.country);
  if (!row) { notfound.push(p.u.name + ' (' + p.u.country + ')'); continue; }
  if (+row.wc_overall !== p.lastNew) {
    mismatch++;
    console.warn('  MISMATCH', p.u.name, p.u.country, 'changelog final', p.lastNew, 'vs FINAL.json', row.wc_overall);
  }
  row.pre_wc_overall = p.baseline;
  row.wc_date = p.lastDate;
  row.wc_note = p.lastReason;
  applied++;
}
console.log('Applied roster-update metadata to', applied, 'players. mismatches:', mismatch, 'not found:', notfound.length);
if (notfound.length) console.log('  NOT FOUND:', notfound.join('; '));

// ---- carry over community-request entries from old file ----
const old = JSON.parse(fs.readFileSync(OLD_JSON === OUT_JSON ? OLD_JSON : OLD_JSON, 'utf8'));
const community = old.filter(r => r.is_community_request);
let crApplied = 0;
for (const c of community) {
  const m = data.filter(r => +r.wc_year === +c.wc_year && r.player_name === c.player_name && r.country === c.country);
  if (m.length !== 1) { console.warn('  community match issue:', c.player_name, m.length); continue; }
  m[0].pre_wc_overall = c.pre_wc_overall;
  m[0].wc_note = c.wc_note;
  m[0].wc_date = c.wc_date || null;
  m[0].is_community_request = true;
  crApplied++;
}
console.log('Carried over', crApplied, 'community-request entries.');

fs.writeFileSync(OUT_JSON, JSON.stringify(data));
console.log('Wrote', OUT_JSON, '(' + (fs.statSync(OUT_JSON).size / 1048576).toFixed(2) + ' MB)');
