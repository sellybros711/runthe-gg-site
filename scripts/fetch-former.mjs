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
 * Covers MLB (statsapi.mlb.com) and NFL (nflverse CSVs), both keyless. NBA
 * (ESPN core) follows the same season-accumulation pattern and lands next;
 * until then NBA former players come from the curated corpus.
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

async function csv(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'runthe-arcade/1.0' } });
      if (r.ok) return parseCSV(await r.text());
      if (r.status === 404) return null;
    } catch (e) { /* retry */ }
    await sleep(400 * (i + 1));
  }
  return null;
}
// minimal RFC-4180-ish CSV -> array of row objects keyed by header
function parseCSV(text) {
  const rows = []; let field = '', row = [], inq = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inq) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inq = false; }
      else field += c;
    } else if (c === '"') inq = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return [];
  const head = rows[0];
  return rows.slice(1).filter((r) => r.length > 1).map((r) => {
    const o = {}; head.forEach((h, idx) => { o[h] = r[idx]; }); return o;
  });
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

/* ----------------------------- NFL (nflverse) --------------------------- */
// From 1995 on the team abbreviations are unambiguous (no LA Raiders / LA Rams
// clash), which keeps team names clean and recognizable.
const NFL_START = 1995;
const NFL_TEAMS = {
  ARI:'Arizona Cardinals', ATL:'Atlanta Falcons', BAL:'Baltimore Ravens', BUF:'Buffalo Bills',
  CAR:'Carolina Panthers', CHI:'Chicago Bears', CIN:'Cincinnati Bengals', CLE:'Cleveland Browns',
  DAL:'Dallas Cowboys', DEN:'Denver Broncos', DET:'Detroit Lions', GB:'Green Bay Packers',
  HOU:'Houston Texans', IND:'Indianapolis Colts', JAX:'Jacksonville Jaguars', JAC:'Jacksonville Jaguars',
  KC:'Kansas City Chiefs', LV:'Las Vegas Raiders', OAK:'Oakland Raiders', LAC:'Los Angeles Chargers',
  SD:'San Diego Chargers', LAR:'Los Angeles Rams', STL:'St. Louis Rams', LA:'Los Angeles Rams',
  MIA:'Miami Dolphins', MIN:'Minnesota Vikings', NE:'New England Patriots', NO:'New Orleans Saints',
  NYG:'New York Giants', NYJ:'New York Jets', PHI:'Philadelphia Eagles', PIT:'Pittsburgh Steelers',
  SF:'San Francisco 49ers', SEA:'Seattle Seahawks', TB:'Tampa Bay Buccaneers', TEN:'Tennessee Titans',
  WAS:'Washington Commanders', WSH:'Washington Commanders'
};
const NFL_POS = {
  QB:'Quarterback', RB:'Running Back', FB:'Fullback', HB:'Running Back', WR:'Wide Receiver',
  TE:'Tight End', T:'Offensive Lineman', OT:'Offensive Lineman', G:'Offensive Lineman',
  OG:'Offensive Lineman', C:'Offensive Lineman', OL:'Offensive Lineman', DE:'Defensive Lineman',
  DT:'Defensive Lineman', NT:'Defensive Lineman', DL:'Defensive Lineman', EDGE:'Defensive Lineman',
  LB:'Linebacker', ILB:'Linebacker', OLB:'Linebacker', MLB:'Linebacker', CB:'Cornerback',
  DB:'Cornerback', S:'Safety', SS:'Safety', FS:'Safety', K:'Kicker', PK:'Kicker', P:'Punter', LS:'Long Snapper'
};
function posNFL(p) { if (!p) return null; return NFL_POS[String(p).toUpperCase()] || p; }

async function buildNFL() {
  const acc = new Map();                        // gsis||name -> record
  const keyOf = (id, name) => id || ('nm:' + name);
  for (let y = NFL_START; y <= NOW_YEAR; y++) {
    const rows = await csv(`https://github.com/nflverse/nflverse-data/releases/download/rosters/roster_${y}.csv`);
    if (!rows) { await sleep(150); continue; }
    for (const r of rows) {
      const name = (r.full_name || '').trim(); if (!name) continue;
      const k = keyOf((r.gsis_id || '').trim(), name);
      let e = acc.get(k);
      if (!e) { e = { name, teams: {}, seasons: {}, jerseys: {}, pos: null }; acc.set(k, e); }
      const tn = NFL_TEAMS[r.team] || r.team || null;
      if (tn && (e.teams[tn] == null || y < e.teams[tn])) e.teams[tn] = y;
      e.seasons[y] = 1;
      const jn = (r.jersey_number != null && r.jersey_number !== '') ? Number(r.jersey_number) : null;
      if (jn != null && !isNaN(jn)) e.jerseys[jn] = 1;
      if (r.position) e.pos = r.position;        // ascending years -> latest wins
    }
    await sleep(150);
  }
  const highPick = new Map();
  const draft = await csv('https://github.com/nflverse/nflverse-data/releases/download/draft_picks/draft_picks.csv');
  if (draft) for (const d of draft) {
    const overall = Number(d.pick || d.overall || 0);
    if (!overall || overall > 64) continue;      // rounds 1-2 = high pick
    const k = keyOf((d.gsis_id || '').trim(), (d.pfr_player_name || d.player_name || d.full_name || '').trim());
    if (!highPick.has(k)) highPick.set(k, overall);
  }
  const players = [];
  for (const [k, e] of acc) {
    const nseason = Object.keys(e.seasons).length;
    const hp = highPick.has(k), pick = hp ? highPick.get(k) : null;
    if (nseason < 3 && !hp) continue;            // notable: 3+ seasons OR high pick
    const teams = Object.keys(e.teams).sort((a, b) => e.teams[a] - e.teams[b]);
    let f = 3; if (nseason >= 8 || (hp && pick && pick <= 15)) f = 4;
    players.push({
      id: 'former:nfl:' + k, name: e.name, sport: 'NFL', f, t: teams,
      j: Object.keys(e.jerseys).map(Number).sort((a, b) => a - b).slice(0, 4),
      pos: posNFL(e.pos), decade: decadesFromSeasons(Object.keys(e.seasons).map(Number)),
      nat: null, ns: nseason, hp: hp ? 1 : 0
    });
  }
  console.log('NFL former:', players.length, 'from', acc.size, 'rostered +', highPick.size, 'high picks');
  return players;
}

/* --------------------------------- main -------------------------------- */
const players = [];
try { players.push(...await buildMLB()); } catch (e) { console.error('MLB build failed:', e.message); }
try { players.push(...await buildNFL()); } catch (e) { console.error('NFL build failed:', e.message); }

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
