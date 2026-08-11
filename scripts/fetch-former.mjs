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
 * Covers all three leagues, all keyless: MLB (statsapi.mlb.com), NFL
 * (nflverse CSVs) and NBA (ESPN core season leaders).
 */
import { writeFileSync } from 'fs';


/* Whitelist of hand-curated names we always keep even if auto-scraped fame
 * comes back as 3. Ensures Bob Pettit / Jim Kelly / Rod Carew / Christy
 * Mathewson etc. survive the "drop fame-3 for wire size" cull below. */
import { readFileSync as _rfs } from 'fs';
const WHITELIST = (() => {
  try {
    const src = _rfs('arcade/stars.js', 'utf8');
    const grab = (name) => {
      const m = src.match(new RegExp(name + '\\s*=\\s*\\[([^\\]]*)\\]'));
      if (!m) return [];
      return [...m[1].matchAll(/'([^']*)'/g)].map((x) => x[1]);
    };
    const norm = (s) => s.toLowerCase().replace(/[\\.\\']/g, '').trim();
    const out = { NBA: new Set(), NFL: new Set(), MLB: new Set() };
    for (const sp of ['NBA', 'NFL', 'MLB']) {
      [...grab(sp + '_ICONS'), ...grab(sp + '_STARS')].forEach((n) => out[sp].add(norm(n)));
    }
    return out;
  } catch (e) { return { NBA: new Set(), NFL: new Set(), MLB: new Set() }; }
})();
const _wnorm = (s) => String(s || '').toLowerCase().replace(/[\.\']/g, '').trim();
const isWhitelisted = (sport, name) => (WHITELIST[sport] || new Set()).has(_wnorm(name));

// ESPN's core API serves display strings HTML-encoded ("Texas A&amp;M",
// "William &amp; Mary"), while the MLB Stats API returns them plain. Left as-is
// they render literally as "TEXAS A&AMP;M" in-game and split one school into two
// pool entries. Decode every string field once at generation so the data is
// always clean regardless of source. Handles the entities ESPN actually emits
// plus numeric refs; safe to run on already-plain text (no entities -> no-op).
const _NAMED_ENTS = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'", '#039': "'" };
function decodeEntities(s) {
  if (typeof s !== 'string' || s.indexOf('&') < 0) return s;
  let prev;
  do { // loop to collapse double-encoding ("&amp;amp;" -> "&amp;" -> "&")
    prev = s;
    s = s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (m, ent) => {
      if (ent[0] === '#') {
        const code = ent[1] === 'x' || ent[1] === 'X'
          ? parseInt(ent.slice(2), 16) : parseInt(ent.slice(1), 10);
        return isFinite(code) ? String.fromCodePoint(code) : m;
      }
      const k = ent.toLowerCase();
      return Object.prototype.hasOwnProperty.call(_NAMED_ENTS, k) ? _NAMED_ENTS[k] : m;
    });
  } while (s !== prev);
  return s;
}
// Recursively decode string leaves of a player record (name, col, pos, teams[]).
function decodeRecord(p) {
  for (const k in p) {
    const v = p[k];
    if (typeof v === 'string') p[k] = decodeEntities(v);
    else if (Array.isArray(v)) p[k] = v.map((x) => (typeof x === 'string' ? decodeEntities(x) : x));
  }
  return p;
}

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

// statsapi position names -> the corpus's convention, so MLB former players
// match current/corpus players in the games (position column, Match lanes).
const MLB_POS = {
  'Outfielder': 'Outfielder', 'Outfield': 'Outfielder', 'Left Field': 'Outfielder',
  'Center Field': 'Outfielder', 'Right Field': 'Outfielder',
  'First Base': 'First Baseman', 'Second Base': 'Second Baseman', 'Third Base': 'Third Baseman',
  'Shortstop': 'Shortstop', 'Catcher': 'Catcher', 'Pitcher': 'Pitcher',
  'Designated Hitter': 'Designated Hitter', 'Infielder': 'Infielder'
};
function posMLB(p) { if (!p) return null; return MLB_POS[p] || p; }

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

  // Candidates: >=2 qualified seasons. Unlike the NBA/NFL, MLB first-round
  // draft picks are mostly unknown prospects (many never reach the majors), so
  // a high pick ALONE does not qualify — the player must have actually produced
  // two qualified seasons. This drops the no-team draft-bust noise entirely.
  const candidates = [];
  for (const [id, e] of acc) if (e.ns >= 2) candidates.push(id);

  // Batch-fetch people detail (position, jersey, birth country, debut).
  // hydrate=education adds high-school/college history -> college for Alma
  // Mater. Players with no US college (common for international signings)
  // simply come back without one and Alma's pool filter skips them.
  const detail = new Map();
  for (let i = 0; i < candidates.length; i += 100) {
    const ids = candidates.slice(i, i + 100).join(',');
    const d = await j(`${MLB_BASE}/people?personIds=${ids}&hydrate=education`);
    (d && d.people ? d.people : []).forEach((p) => detail.set(p.id, p));
    await sleep(120);
  }
  // most recent college on record (the school a player is known for); the
  // education shape has drifted before, so accept the common name keys.
  function colMLB(p) {
    const ed = p && p.education;
    const cs = ed && (ed.colleges || ed.college);
    if (!Array.isArray(cs) || !cs.length) return null;
    const c = cs[cs.length - 1];
    return (c && (c.schoolName || c.name || c.school)) || null;
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
    if (f < 4 && !isWhitelisted('MLB', name)) continue;   // recognizable-tier or curated star
    players.push({
      id: 'former:mlb:' + id,
      name,
      sport: 'MLB',
      f,
      t: teams,
      j: (p.primaryNumber != null && p.primaryNumber !== '') ? [Number(p.primaryNumber)] : [],
      pos: posMLB((p.primaryPosition && p.primaryPosition.name) || null),
      decade,
      nat: normNat(p.birthCountry),
      col: colMLB(p),
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
  WAS:'Washington Commanders', WSH:'Washington Commanders',
  // nflverse/GSIS abbreviation variants
  ARZ:'Arizona Cardinals', BLT:'Baltimore Ravens', CLV:'Cleveland Browns', HST:'Houston Texans',
  SL:'St. Louis Rams'
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
      if (!e) { e = { name, teams: {}, seasons: {}, jerseys: {}, pos: null, col: null }; acc.set(k, e); }
      const tn = NFL_TEAMS[r.team] || r.team || null;
      if (tn && (e.teams[tn] == null || y < e.teams[tn])) e.teams[tn] = y;
      e.seasons[y] = 1;
      const jn = (r.jersey_number != null && r.jersey_number !== '') ? Number(r.jersey_number) : null;
      if (jn != null && !isNaN(jn)) e.jerseys[jn] = 1;
      if (r.position) e.pos = r.position;        // ascending years -> latest wins
      if (r.college && !e.col) e.col = r.college;   // college for Alma Mater
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
    if (f < 4 && !isWhitelisted('NFL', e.name)) continue;
    if (posNFL(e.pos) === 'Long Snapper') continue;   // no one recognizes long snappers - keep them out of every game
    players.push({
      id: 'former:nfl:' + k, name: e.name, sport: 'NFL', f, t: teams, col: e.col || null,
      j: Object.keys(e.jerseys).map(Number).sort((a, b) => a - b).slice(0, 4),
      pos: posNFL(e.pos), decade: decadesFromSeasons(Object.keys(e.seasons).map(Number)),
      nat: null, ns: nseason, hp: hp ? 1 : 0
    });
  }
  console.log('NFL former:', players.length, 'from', acc.size, 'rostered +', highPick.size, 'high picks');
  return players;
}

/* ----------------------------- NBA (ESPN core) -------------------------- */
// Season statistical leaders are inherently the recognizable players, so a
// player who leads any category in >=2 seasons clears the bar. ESPN's core API
// is $ref-heavy; athlete/team/position refs are resolved once and cached.
const NBA_START = 1980;                 // 3-point era onward = recognizable
const NBA_BASE = 'https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba';

async function buildNBA() {
  const acc = new Map();                // athleteRef -> { seasons:{}, ns, teamRefs:{} }
  const teamName = new Map(), posName = new Map();
  async function resolveTeam(ref) {
    if (!ref) return null;
    if (teamName.has(ref)) return teamName.get(ref);
    const d = await j(ref); const nm = (d && (d.displayName || d.name)) || null;
    teamName.set(ref, nm); await sleep(30); return nm;
  }
  async function resolvePos(a) {
    const p = a && a.position; if (!p) return null;
    if (p.displayName || p.name) return p.displayName || p.name;
    if (p.$ref) {
      if (posName.has(p.$ref)) return posName.get(p.$ref);
      const d = await j(p.$ref); const nm = (d && (d.displayName || d.name)) || null;
      posName.set(p.$ref, nm); await sleep(30); return nm;
    }
    return null;
  }
  // ESPN's core API serves `college` as a bare $ref (never an inline name), so
  // the old inline read always produced null -> zero retired NBA players in
  // Alma Mater. Resolve and cache it like teams/positions (~350 unique refs).
  const colNameNBA = new Map();
  async function resolveCollege(a) {
    const c = a && a.college; if (!c) return null;
    if (c.name || c.shortName) return c.name || c.shortName;
    if (c.$ref) {
      if (colNameNBA.has(c.$ref)) return colNameNBA.get(c.$ref);
      const d = await j(c.$ref); const nm = (d && (d.name || d.shortName || d.displayName)) || null;
      colNameNBA.set(c.$ref, nm); await sleep(30); return nm;
    }
    return null;
  }

  for (let y = NBA_START; y <= NOW_YEAR; y++) {
    const d = await j(`${NBA_BASE}/seasons/${y}/types/2/leaders`);
    const cats = d && d.categories;
    if (cats) for (const c of cats) for (const L of (c.leaders || [])) {
      const ref = L.athlete && L.athlete.$ref; if (!ref) continue;
      // The athlete $ref is SEASON-SCOPED (.../seasons/2015/athletes/1966), so
      // key by the athlete id, not the ref, or every season looks like a new
      // player and nobody ever reaches two seasons.
      const m = ref.match(/\/athletes\/(\d+)/); if (!m) continue;
      const aid = m[1];
      let e = acc.get(aid);
      if (!e) { e = { seasons: {}, ns: 0, teamRefs: {} }; acc.set(aid, e); }
      if (!e.seasons[y]) { e.seasons[y] = 1; e.ns++; }
      const tref = L.team && L.team.$ref;
      if (tref && (e.teamRefs[tref] == null || y < e.teamRefs[tref])) e.teamRefs[tref] = y;
    }
    await sleep(80);
  }

  const players = [];
  for (const [aid, e] of acc) {
    if (e.ns < 2) continue;                        // >=2 leader seasons
    const a = await j(`${NBA_BASE}/athletes/${aid}`); await sleep(30);
    if (!a) continue;
    const name = (a.displayName || a.fullName || ((a.firstName || '') + ' ' + (a.lastName || ''))).trim();
    if (!name) continue;
    const teamRefs = Object.keys(e.teamRefs).sort((x, z) => e.teamRefs[x] - e.teamRefs[z]);
    const teams = [];
    for (const tr of teamRefs) { const nm = await resolveTeam(tr); if (nm && teams.indexOf(nm) < 0) teams.push(nm); }
    const jn = (a.jersey != null && a.jersey !== '') ? Number(a.jersey) : null;
    let f = 3; if (e.ns >= 6) f = 4;
    if (f < 4 && !isWhitelisted('NBA', name)) continue;
    players.push({
      id: 'former:nba:' + aid, name, sport: 'NBA', f, t: teams,
      j: (jn != null && !isNaN(jn)) ? [jn] : [], pos: await resolvePos(a),
      decade: decadesFromSeasons(Object.keys(e.seasons).map(Number)),
      nat: normNat(a.birthPlace && a.birthPlace.country),
      col: await resolveCollege(a), ns: e.ns, hp: 0
    });
  }
  console.log('NBA former:', players.length, 'from', acc.size, 'leader athletes');
  return players;
}

/* --------------------------------- main -------------------------------- */
const players = [];
try { players.push(...await buildMLB()); } catch (e) { console.error('MLB build failed:', e.message); }
try { players.push(...await buildNFL()); } catch (e) { console.error('NFL build failed:', e.message); }
try { players.push(...await buildNBA()); } catch (e) { console.error('NBA build failed:', e.message); }

// Normalize away any HTML entities from the source APIs before de-duping, so a
// school like "Texas A&M" can't survive as two distinct spellings.
players.forEach(decodeRecord);

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
