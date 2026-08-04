/* Former-player ingestion pipeline -> arcade/former.js (window.RTG_FORMER).
 *
 * Builds a large, shared dataset of RECOGNIZABLE former players that the
 * combinatorial games (Career, Table, Odd One, Match, Crossword, Word Search)
 * merge in alongside the hand-curated corpus (entities.js) and the live
 * current rosters (rosters.js). Run by .github/workflows/former.yml on a
 * schedule (Actions runners have open network); also runnable locally:
 *   node scripts/fetch-former.mjs
 *
 * NOTABILITY (per the product bar): a player is kept only if they are
 * "somewhat recognizable" — either a HIGH DRAFT PICK or they recorded at
 * least TWO notable (qualified) seasons. Fan-lore names from older eras clear
 * the two-season bar naturally.
 *
 * Output objects match the GRID_ENTITIES shape so games can merge with no
 * adapter: {id,name,sport,f,t:[teams chrono],j:[jerseys],pos,decade:[...],nat}.
 * Extra fields (ns = notable seasons, hp = high pick) are ignored by games.
 *
 * v1 covers MLB (statsapi.mlb.com, keyless). NFL (nflverse) and NBA (ESPN
 * core) follow the same season-accumulation pattern and land next.
 */
import { writeFileSync } from 'fs';

const NOW_YEAR = new Date().getFullYear();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function j(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'runthe-arcade/1.0' } });
      if (r.ok) return await r.json();
      if (r.status === 404) return null;
    } catch (e) { /* retry */ }
    await sleep(400 * (i + 1));
  }
  return null;
}

function decadesFromSeasons(seasons) {
  const set = {};
  seasons.forEach((y) => { set[Math.floor(y / 10) * 10] = 1; });
  return Object.keys(set).map(Number).sort((a, b) => a - b);
}
// statsapi uses "USA"/"Dominican Republic"; corpus uses "United States". Align
// the common one so nationality categories don't split across data sources.
function normNat(c) {
  if (!c) return null;
  if (c === 'USA' || c === 'United States of America') return 'United States';
  return c;
}

/* ----------------------------- MLB (statsapi) --------------------------- */
const MLB_START = 1920;             // deep enough for fan lore, recent enough to be recognizable
const MLB_DRAFT_START = 1965;       // MLB draft began in 1965
const MLB_BASE = 'https://statsapi.mlb.com/api/v1';

async function buildMLB() {
  // playerId -> { name, teams:{name:firstSeason}, seasons:Set, ns, group }
  const acc = new Map();
  function note(split, group) {
    const p = split.player; if (!p || !p.id) return;
    let e = acc.get(p.id);
    if (!e) { e = { name: p.fullName, teams: {}, seasons: {}, ns: 0, group }; acc.set(p.id, e); }
    const yr = Number(split.season);
    if (!e.seasons[yr]) { e.seasons[yr] = 1; e.ns++; }      // count each notable season once
    const tn = split.team && split.team.name;
    if (tn && (e.teams[tn] == null || yr < e.teams[tn])) e.teams[tn] = yr;
  }

  for (let y = MLB_START; y <= NOW_YEAR; y++) {
    for (const group of ['hitting', 'pitching']) {
      const d = await j(`${MLB_BASE}/stats?stats=season&group=${group}&season=${y}&playerPool=qualified&limit=400&sportId=1`);
      const splits = d && d.stats && d.stats[0] && d.stats[0].splits;
      if (splits) splits.forEach((s) => note(s, group));
      await sleep(120);
    }
  }

  // High draft picks (round 1) — kept even without two qualified seasons.
  const highPick = new Map();  // id -> pickNumber
  for (let y = MLB_DRAFT_START; y <= NOW_YEAR; y++) {
    const d = await j(`${MLB_BASE}/draft/${y}`);
    const rounds = d && d.drafts && d.drafts.rounds;
    if (rounds) rounds.forEach((rd) => {
      if (String(rd.round) !== '1') return;
      (rd.picks || []).forEach((pk) => {
        const per = pk.person; if (per && per.id && !highPick.has(per.id)) highPick.set(per.id, pk.pickNumber || 999);
      });
    });
    await sleep(120);
  }

  // Candidates: >=2 notable seasons OR a first-round pick.
  const candidates = [];
  for (const [id, e] of acc) if (e.ns >= 2 || highPick.has(id)) candidates.push(id);
  for (const [id] of highPick) if (!acc.has(id)) candidates.push(id);   // pick with no qualified season

  // Batch-fetch people detail (position, jersey, birth country, debut).
  const detail = new Map();
  for (let i = 0; i < candidates.length; i += 100) {
    const ids = candidates.slice(i, i + 100).join(',');
    const d = await j(`${MLB_BASE}/people?personIds=${ids}`);
    (d && d.people ? d.people : []).forEach((p) => detail.set(p.id, p));
    await sleep(120);
  }

  const players = [];
  for (const id of candidates) {
    const e = acc.get(id) || {};
    const p = detail.get(id) || {};
    const name = (p.fullName || e.name || '').trim();
    if (!name) continue;
    const teams = Object.keys(e.teams || {}).sort((a, b) => e.teams[a] - e.teams[b]);
    const seasons = Object.keys(e.seasons || {}).map(Number);
    if (p.mlbDebutDate) { const dy = Number(String(p.mlbDebutDate).slice(0, 4)); if (dy) seasons.push(dy); }
    const decade = decadesFromSeasons(seasons.length ? seasons : [NOW_YEAR]);
    const ns = e.ns || 0, hp = highPick.has(id);
    const pick = hp ? highPick.get(id) : null;
    // fame heuristic: everyone here is recognizable (3); bump longevity / very
    // high picks toward 4 so they surface in the fame>=4 games too.
    let f = 3;
    if (ns >= 6 || (hp && pick && pick <= 10)) f = 4;
    players.push({
      id: 'former:mlb:' + id,
      name,
      sport: 'MLB',
      f,
      t: teams,
      j: (p.primaryNumber != null && p.primaryNumber !== '') ? [Number(p.primaryNumber)] : [],
      pos: (p.primaryPosition && (p.primaryPosition.name)) || null,
      decade,
      nat: normNat(p.birthCountry),
      ns, hp: hp ? 1 : 0
    });
  }
  console.log('MLB former:', players.length, 'candidates from', acc.size, 'qualified players +', highPick.size, 'first-round picks');
  return players;
}

/* --------------------------------- main -------------------------------- */
const players = [];
try { players.push(...await buildMLB()); } catch (e) { console.error('MLB build failed:', e.message); }

// De-dupe by name+sport, keeping the entry with more team history.
const byKey = new Map();
for (const p of players) {
  const k = p.name + '|' + p.sport;
  const cur = byKey.get(k);
  if (!cur || (p.t.length > cur.t.length)) byKey.set(k, p);
}
const out = Array.from(byKey.values()).sort((a, b) => (a.name < b.name ? -1 : 1));

const file =
  '/* GENERATED by scripts/fetch-former.mjs. Do not edit. Recognizable former\n' +
  ' * players (high draft pick OR >=2 notable seasons) for the arcade games. */\n' +
  'window.RTG_FORMER = ' + JSON.stringify({
    updated: new Date().toISOString().slice(0, 10),
    count: out.length,
    players: out
  }) + ';\n';
writeFileSync('arcade/former.js', file);
console.log('wrote arcade/former.js:', out.length, 'former players');
