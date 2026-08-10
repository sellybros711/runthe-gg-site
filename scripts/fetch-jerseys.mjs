/* GENERATOR for arcade/jerseys.js (window.RTG_JERSEYS).
 *
 * WHY: the Number Game (Run The Table) asks "who wore the higher jersey
 * number?". A decade label is ambiguous - Sebastian Telfair wore 3 AND 31 in
 * the 2010s, LeBron wore 23 in Cleveland and 6 in Miami - so the card can't
 * pin the number it's asking about. This builds STINTS instead: one contiguous
 * (team, year-range, number) span per player, e.g.
 *   LeBron James · Cleveland Cavaliers · 2003-2010 · 23
 *   LeBron James · Miami Heat · 2010-2014 · 6
 * Each stint is its own card, so the number shown is always a verifiable fact.
 *
 * SOURCES (all reachable from CI; NFL+NBA also reachable in the dev sandbox):
 *   NFL  nflverse per-season rosters (gsis_id, season, team, jersey_number)
 *   NBA  sportsdataverse ESPN player_season_stats (athlete_id, season, team, jersey)
 *   MLB  statsapi.mlb.com per-team-season rosters (personId, season, team, jersey)
 *        (statsapi is blocked in the dev sandbox, so MLB only populates in CI.)
 *
 * We only build stints for players already in the recognizable former-player
 * pool (former.js) - matched by the id that pool already uses (gsis for NFL,
 * ESPN athlete id for NBA, statsapi personId for MLB) - so the Number Game
 * keeps the same recognizability bar it had before.
 *
 * HOW TO RUN:  node scripts/fetch-jerseys.mjs   (writes arcade/jerseys.js)
 * Run by .github/workflows/jerseys.yml (needs open network for all 3 sports).
 */
import { readFileSync, writeFileSync } from 'fs';

const NOW_YEAR = new Date().getFullYear();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------- fetch utils --------------------------- */
async function csv(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'runthe-arcade/1.0' } });
      if (r.ok) return parseCSV(await r.text());
      if (r.status === 404) return null;
    } catch (e) { /* retry */ }
    await sleep(500 * (i + 1));
  }
  return null;
}
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

const _NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'", '#039': "'" };
function decode(s) {
  if (typeof s !== 'string' || s.indexOf('&') < 0) return s;
  let p;
  do { p = s; s = s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (m, e) => {
    if (e[0] === '#') { const c = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return isFinite(c) ? String.fromCodePoint(c) : m; }
    const k = e.toLowerCase(); return Object.prototype.hasOwnProperty.call(_NAMED, k) ? _NAMED[k] : m;
  }); } while (s !== p);
  return s;
}

// jersey numbers are 0-99 (MLB "00" is real; we keep 0). Reject junk.
function parseNum(v) {
  if (v == null) return null;
  const s = String(v).trim();
  if (!/^\d{1,2}$/.test(s)) return null;
  const n = Number(s);
  return (n >= 0 && n <= 99) ? n : null;
}

/* ------------------------- recognizable pool (former.js) --------------- */
function loadPool() {
  const src = readFileSync('arcade/former.js', 'utf8');
  const m = src.match(/window\.RTG_FORMER\s*=\s*(\{[\s\S]*\});?\s*$/);
  const data = JSON.parse(m[1]);
  // same gate the Number Game applies: team sport, has a number, played into the 1990s+
  const TEAM = { NBA: 1, NFL: 1, MLB: 1 };
  const want = { NFL: new Map(), NBA: new Map(), MLB: new Map() };
  const byNameMLB = new Map();
  const byNameNBA = new Map();   // BBRef/statsapi are matched by name, not id
  const dupNBA = new Set();      // normalized names shared by 2+ players -> ambiguous
  for (const e of data.players) {
    if (!TEAM[e.sport] || !e.j || !e.j.length) continue;
    if (!e.decade || !e.decade.length || e.decade[e.decade.length - 1] < 1990) continue;
    const mm = String(e.id || '').match(/^former:(nfl|nba|mlb):(.+)$/);
    if (!mm) continue;
    const sport = mm[1].toUpperCase(), key = mm[2];
    const rec = { name: decode(e.name), f: e.f || 3 };
    want[sport].set(key, rec);
    if (sport === 'MLB') byNameMLB.set(normName(rec.name), { key, ...rec });
    if (sport === 'NBA') {
      const nn = normName(rec.name);
      if (byNameNBA.has(nn)) dupNBA.add(nn); else byNameNBA.set(nn, { key, ...rec });
    }
  }
  dupNBA.forEach((nn) => byNameNBA.delete(nn));   // drop ambiguous shared names
  return { want, byNameMLB, byNameNBA };
}
const normName = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z]/g, '');

/* --------------------------------- NFL --------------------------------- */
const NFL_START = 1999;   // jersey_number is reliable from the late 90s on
const NFL_TEAMS = {
  ARI: 'Arizona Cardinals', ATL: 'Atlanta Falcons', BAL: 'Baltimore Ravens', BUF: 'Buffalo Bills',
  CAR: 'Carolina Panthers', CHI: 'Chicago Bears', CIN: 'Cincinnati Bengals', CLE: 'Cleveland Browns',
  DAL: 'Dallas Cowboys', DEN: 'Denver Broncos', DET: 'Detroit Lions', GB: 'Green Bay Packers',
  HOU: 'Houston Texans', IND: 'Indianapolis Colts', JAX: 'Jacksonville Jaguars', JAC: 'Jacksonville Jaguars',
  KC: 'Kansas City Chiefs', LV: 'Las Vegas Raiders', OAK: 'Oakland Raiders', LAC: 'Los Angeles Chargers',
  SD: 'San Diego Chargers', LAR: 'Los Angeles Rams', STL: 'St. Louis Rams', LA: 'Los Angeles Rams',
  MIA: 'Miami Dolphins', MIN: 'Minnesota Vikings', NE: 'New England Patriots', NO: 'New Orleans Saints',
  NYG: 'New York Giants', NYJ: 'New York Jets', PHI: 'Philadelphia Eagles', PIT: 'Pittsburgh Steelers',
  SF: 'San Francisco 49ers', SEA: 'Seattle Seahawks', TB: 'Tampa Bay Buccaneers', TEN: 'Tennessee Titans',
  WAS: 'Washington Commanders', WSH: 'Washington Commanders',
  ARZ: 'Arizona Cardinals', BLT: 'Baltimore Ravens', CLV: 'Cleveland Browns', HST: 'Houston Texans', SL: 'St. Louis Rams'
};
async function buildNFL(want) {
  // obs.set(gsis) -> array of {y, team, num}
  const obs = new Map();
  for (let y = NFL_START; y <= NOW_YEAR; y++) {
    const rows = await csv(`https://github.com/nflverse/nflverse-data/releases/download/rosters/roster_${y}.csv`);
    if (!rows) { await sleep(120); continue; }
    for (const r of rows) {
      const gsis = (r.gsis_id || '').trim();
      if (!gsis || !want.has(gsis)) continue;
      const num = parseNum(r.jersey_number);
      const team = NFL_TEAMS[r.team] || null;
      if (num == null || !team) continue;
      if (!obs.has(gsis)) obs.set(gsis, []);
      obs.get(gsis).push({ y, team, num });
    }
    await sleep(60);
  }
  console.log('NFL: matched', obs.size, 'of', want.size, 'pooled players');
  return toStints(obs, want, 'NFL');
}

/* --------------------------------- NBA --------------------------------- */
// ESPN's jersey history is corrupted (it backfills a player's later number onto
// old seasons - it returns LeBron #6 for his 2005 Cleveland games). The reliable
// source is Basketball-Reference's per-team-season Roster table, whose "No."
// column is the number actually worn that season. We fetch every franchise-season
// page, read (number, player) off the roster, and match players to our pool by
// name. BBRef rate-limits, so keep the crawl slow.
const NBA_START = 2004;
// full franchise team names keyed by BBRef abbreviation (as used in that era)
const BBR_TEAMNAME = {
  ATL: 'Atlanta Hawks', BOS: 'Boston Celtics', BRK: 'Brooklyn Nets', NJN: 'New Jersey Nets',
  CHO: 'Charlotte Hornets', CHA: 'Charlotte Bobcats', CHI: 'Chicago Bulls', CLE: 'Cleveland Cavaliers',
  DAL: 'Dallas Mavericks', DEN: 'Denver Nuggets', DET: 'Detroit Pistons', GSW: 'Golden State Warriors',
  HOU: 'Houston Rockets', IND: 'Indiana Pacers', LAC: 'Los Angeles Clippers', LAL: 'Los Angeles Lakers',
  MEM: 'Memphis Grizzlies', MIA: 'Miami Heat', MIL: 'Milwaukee Bucks', MIN: 'Minnesota Timberwolves',
  NOP: 'New Orleans Pelicans', NOH: 'New Orleans Hornets', NOK: 'New Orleans/Oklahoma City Hornets',
  NYK: 'New York Knicks', OKC: 'Oklahoma City Thunder', SEA: 'Seattle SuperSonics', ORL: 'Orlando Magic',
  PHI: 'Philadelphia 76ers', PHO: 'Phoenix Suns', POR: 'Portland Trail Blazers', SAC: 'Sacramento Kings',
  SAS: 'San Antonio Spurs', TOR: 'Toronto Raptors', UTA: 'Utah Jazz', WAS: 'Washington Wizards'
};
// [abbr, firstEndYear, lastEndYear] - covers relocations/renames within our window
const BBR_SPANS = [
  ['ATL', 2004, 2026], ['BOS', 2004, 2026], ['CHI', 2004, 2026], ['CLE', 2004, 2026],
  ['DAL', 2004, 2026], ['DEN', 2004, 2026], ['DET', 2004, 2026], ['GSW', 2004, 2026],
  ['HOU', 2004, 2026], ['IND', 2004, 2026], ['LAC', 2004, 2026], ['LAL', 2004, 2026],
  ['MEM', 2004, 2026], ['MIA', 2004, 2026], ['MIL', 2004, 2026], ['MIN', 2004, 2026],
  ['NYK', 2004, 2026], ['ORL', 2004, 2026], ['PHI', 2004, 2026], ['PHO', 2004, 2026],
  ['POR', 2004, 2026], ['SAC', 2004, 2026], ['SAS', 2004, 2026], ['TOR', 2004, 2026],
  ['UTA', 2004, 2026], ['WAS', 2004, 2026],
  ['NJN', 2004, 2012], ['BRK', 2013, 2026],           // Nets: New Jersey -> Brooklyn
  ['CHA', 2005, 2014], ['CHO', 2015, 2026],           // Charlotte: Bobcats -> Hornets
  ['NOH', 2004, 2005], ['NOK', 2006, 2007], ['NOP', 2014, 2026],  // NO Hornets/OKC -> Pelicans
  ['NOH', 2008, 2013],
  ['SEA', 2004, 2008], ['OKC', 2009, 2026]            // Sonics -> Thunder
];
async function text(url, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; runthe-arcade/1.0)' } });
      if (r.ok) return await r.text();
      if (r.status === 404) return null;
      if (r.status === 429) await sleep(8000 * (i + 1));   // BBRef throttle
    } catch (e) { /* retry */ }
    await sleep(1500 * (i + 1));
  }
  return null;
}
// pull (number, playerName) pairs out of a BBRef team-season Roster table
function parseBBRRoster(html) {
  const out = [];
  const tbl = html.match(/<table[^>]*id="roster"[\s\S]*?<\/table>/i);
  if (!tbl) return out;
  const rows = tbl[0].match(/<tr[\s\S]*?<\/tr>/gi) || [];
  for (const row of rows) {
    const nm = row.match(/data-stat="number"[^>]*>([\s\S]*?)<\/t[dh]>/i);
    const pm = row.match(/data-stat="player"[^>]*>([\s\S]*?)<\/t[dh]>/i);
    if (!nm || !pm) continue;
    const num = parseNum(nm[1].replace(/<[^>]*>/g, '').trim());
    let name = pm[1].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').replace(/\s*\(TW\)\s*$/i, '').replace(/\*+$/, '').trim();
    name = decode(name);
    if (num == null || !name) continue;
    out.push({ num, name });
  }
  return out;
}
async function buildNBA(want, byName) {
  const obs = new Map();   // pool key -> [{y, team, num}]
  const MAX = Number(process.env.JERSEYS_MAXPAGES || 0);   // >0 caps the crawl for a smoke test
  let pages = 0;
  for (const [abbr, a, b] of BBR_SPANS) {
    for (let y = Math.max(a, NBA_START); y <= Math.min(b, NOW_YEAR); y++) {
      if (MAX && pages >= MAX) { console.log('NBA: hit JERSEYS_MAXPAGES cap', MAX); break; }
      const html = await text(`https://www.basketball-reference.com/teams/${abbr}/${y}.html`);
      pages++;
      await sleep(3200);   // stay under BBRef's ~20 req/min limit
      if (!html) continue;
      const team = BBR_TEAMNAME[abbr] || abbr;
      for (const { num, name } of parseBBRRoster(html)) {
        const hit = byName.get(normName(name));
        if (!hit) continue;
        if (!obs.has(hit.key)) obs.set(hit.key, []);
        obs.get(hit.key).push({ y, team, num });
      }
    }
  }
  console.log('NBA: crawled', pages, 'BBRef pages; matched', obs.size, 'of', want.size, 'pooled players');
  return toStints(obs, want, 'NBA');
}

/* --------------------------------- MLB --------------------------------- */
// statsapi is blocked in the dev sandbox; this only yields data in CI.
async function buildMLB(want, byName) {
  const obs = new Map();  // personId -> [{y, team, num}]
  // Walk every team's full-season roster for each year; jerseyNumber is on the
  // roster entry. personId matches the former:mlb:<personId> ids directly. We
  // pull the team list PER SEASON so relocations/renames get an era-accurate
  // name (2003 -> "Florida Marlins", not "Miami Marlins").
  const probe = await j('https://statsapi.mlb.com/api/v1/teams?sportId=1');
  if (!probe || !probe.teams || !probe.teams.length) { console.log('MLB: statsapi unreachable - skipping'); return []; }
  const MLB_START = 1995;
  for (let y = MLB_START; y <= NOW_YEAR; y++) {
    const tResp = await j(`https://statsapi.mlb.com/api/v1/teams?sportId=1&season=${y}`);
    const teams = (tResp && tResp.teams ? tResp.teams : []).filter((t) => t && t.id);
    for (const t of teams) {
      const d = await j(`https://statsapi.mlb.com/api/v1/teams/${t.id}/roster?rosterType=fullSeason&season=${y}`);
      const roster = d && d.roster ? d.roster : [];
      for (const e of roster) {
        const pid = e && e.person && e.person.id != null ? String(e.person.id) : null;
        if (!pid) continue;
        const num = parseNum(e.jerseyNumber);
        if (num == null) continue;
        const team = decode(t.name || '');
        if (!team) continue;
        // match either by personId (primary) or by name (in case ids drift)
        if (!want.has(pid)) {
          const nm = normName(e.person.fullName);
          if (!byName.has(nm)) continue;
        }
        const key = want.has(pid) ? pid : byName.get(normName(e.person.fullName)).key;
        if (!obs.has(key)) obs.set(key, []);
        obs.get(key).push({ y, team, num });
      }
      await sleep(25);
    }
    console.log('MLB', y, 'done; matched so far', obs.size);
  }
  console.log('MLB: matched', obs.size, 'of', want.size, 'pooled players');
  return toStints(obs, want, 'MLB');
}

/* ----------------------------- obs -> stints --------------------------- */
// Collapse a player's yearly (team,num) observations into contiguous stints.
// A gap of >1 season with the same team+num starts a new stint (a return
// engagement). We then de-dupe identical (team,num) stints keeping the longest,
// so a player who wore one number for one team appears once even across a gap.
function toStints(obs, want, sport) {
  const out = [];
  for (const [key, arr] of obs) {
    const meta = want.get(key); if (!meta) continue;
    arr.sort((a, b) => a.y - b.y || a.num - b.num);
    // build (team,num) -> ordered year list
    const spans = [];
    // group consecutive years sharing the same (team,num)
    const byTN = new Map();
    for (const o of arr) {
      const tn = o.team + '|' + o.num;
      if (!byTN.has(tn)) byTN.set(tn, []);
      byTN.get(tn).push(o.y);
    }
    for (const [tn, years] of byTN) {
      years.sort((a, b) => a - b);
      const [team, numS] = tn.split('|'); const num = Number(numS);
      let s = years[0], prev = years[0];
      for (let i = 1; i < years.length; i++) {
        if (years[i] <= prev + 1) { prev = years[i]; continue; }
        spans.push({ team, num, y0: s, y1: prev }); s = years[i]; prev = years[i];
      }
      spans.push({ team, num, y0: s, y1: prev });
    }
    // de-dupe identical team+num, keep the longest span
    const best = new Map();
    for (const sp of spans) {
      const k = sp.team + '|' + sp.num;
      const c = best.get(k);
      if (!c || (sp.y1 - sp.y0) > (c.y1 - c.y0)) best.set(k, sp);
    }
    for (const sp of best.values()) {
      out.push({ id: 'former:' + sport.toLowerCase() + ':' + key, name: meta.name, sport, f: meta.f, team: sp.team, num: sp.num, y0: sp.y0, y1: sp.y1 });
    }
  }
  return out;
}

/* --------------------------------- main -------------------------------- */
const { want, byNameMLB, byNameNBA } = loadPool();
console.log('pool: NFL', want.NFL.size, 'NBA', want.NBA.size, 'MLB', want.MLB.size);

const ONLY = (process.env.JERSEYS_ONLY || '').toUpperCase();   // "NFL"/"NBA"/"MLB" to limit a CI test run
const run = (s) => !ONLY || ONLY === s;

const stints = [];
if (run('NFL')) try { stints.push(...await buildNFL(want.NFL)); } catch (e) { console.error('NFL failed:', e.message); }
if (run('NBA')) try { stints.push(...await buildNBA(want.NBA, byNameNBA)); } catch (e) { console.error('NBA failed:', e.message); }
if (run('MLB')) try { stints.push(...await buildMLB(want.MLB, byNameMLB)); } catch (e) { console.error('MLB failed:', e.message); }

stints.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : a.y0 - b.y0));
const bySport = {};
stints.forEach((s) => { bySport[s.sport] = (bySport[s.sport] || 0) + 1; });
console.log('stints:', stints.length, bySport);

const file =
  '/* GENERATED by scripts/fetch-jerseys.mjs. Do not edit.\n' +
  ' * Per-player jersey STINTS for the Number Game: one (team, year-range,\n' +
  ' * number) span per card, so the number asked about is never ambiguous. */\n' +
  'window.RTG_JERSEYS = ' + JSON.stringify({
    updated: new Date().toISOString().slice(0, 10),
    count: stints.length,
    stints
  }) + ';\n';
const outFile = ONLY ? `arcade/jerseys.${ONLY.toLowerCase()}.test.js` : 'arcade/jerseys.js';
writeFileSync(outFile, file);
console.log('wrote', outFile + ':', stints.length, 'stints');
