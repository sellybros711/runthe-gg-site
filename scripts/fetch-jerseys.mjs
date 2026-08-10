/* GENERATOR for arcade/jerseys.js (window.RTG_JERSEYS).
 *
 * WHY: the Number Game (Run The Table) asks "who wore the higher jersey
 * number?". A decade label is ambiguous - Sebastian Telfair wore 3 AND 31 in
 * the 2010s, LeBron wore 23 in Cleveland and 6 in Miami - so the card can't
 * pin the number it's asking about. This builds STINTS instead: one contiguous
 * (team, year-range, number) span per card, e.g.
 *   LeBron James · Cleveland Cavaliers · 2003-2010 · 23
 *   LeBron James · Miami Heat · 2010-2014 · 6
 * Each stint is its own card, so the number shown is always a verifiable fact.
 *
 * SCOPE: stints are built ONLY for players already in the Number Game's
 * recognizable pool (the exact hiqStar gate the game applies to the merged
 * corpus: entities.js curated + former.js scraped + supplement.js + stars.js
 * overlay). We never introduce a player the game doesn't already show - a star
 * who wore two numbers simply becomes two cards. Matching is by NAME+sport
 * because curated stars (entities.js) use ids like "nba_lebron-james" while the
 * scraped feeds key on gsis / personId; the game joins the same way.
 *
 * SOURCES (all reachable from CI; only NFL is reachable in the dev sandbox):
 *   NFL  nflverse per-season rosters (season, team, jersey_number, full_name)
 *   NBA  Basketball-Reference per-team-season Roster tables ("No." column).
 *        Team-season pages are discovered from each season's league index, so
 *        relocations/renames need no hardcoding. (ESPN's jersey history is
 *        corrupted - it backfills a player's later number onto old seasons.)
 *   MLB  statsapi.mlb.com per-team-season rosters (jerseyNumber, era-accurate
 *        team names via the per-season team list).
 *
 * Years start at 1990, matching the pool's "played into the 1990s+" gate.
 *
 * HOW TO RUN:  node scripts/fetch-jerseys.mjs   (writes arcade/jerseys.js)
 * Run by .github/workflows/jerseys.yml (needs open network for BBRef+statsapi).
 */
import { readFileSync, writeFileSync } from 'fs';

const NOW_YEAR = new Date().getFullYear();
const START = 1990;
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
function parseCSV(t) {
  const rows = []; let f = '', row = [], q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n') { row.push(f); rows.push(row); row = []; f = ''; }
    else if (c !== '\r') f += c;
  }
  if (f.length || row.length) { row.push(f); rows.push(row); }
  if (!rows.length) return [];
  const head = rows[0];
  return rows.slice(1).filter((r) => r.length > 1).map((r) => { const o = {}; head.forEach((h, i) => o[h] = r[i]); return o; });
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
function parseNum(v) {
  if (v == null) return null;
  const s = String(v).trim();
  if (!/^\d{1,2}$/.test(s)) return null;
  const n = Number(s);
  return (n >= 0 && n <= 99) ? n : null;
}
// name key shared with the game's join: strip accents, lowercase, letters only.
// Suffixes (Jr/Sr/III) are KEPT here so Griffey Sr and Jr never collide - this
// is the key the game joins on too.
const nkey = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z]/g, '');
// looser key with a trailing suffix removed, for the generator's row->pool
// match only (a feed may list "Odell Beckham" one year and "Odell Beckham Jr."
// the next). Used only when it maps to exactly one pooled player.
const skey = (s) => nkey(s).replace(/(iii|iv|ii|jr|sr)$/, '');

/* ---------------- recognizable pool = the game's hiqStar --------------- */
// Load a browser-global file (entities.js / former.js / supplement.js /
// stars.js) by running it with a stub window; return the named global.
function loadGlobal(file, name) {
  const src = readFileSync(file, 'utf8');
  const sandbox = { window: {}, module: { exports: {} } };
  sandbox.self = sandbox.window;
  // eslint-disable-next-line no-new-func
  new Function('window', 'self', 'module', 'exports', src)(sandbox.window, sandbox.self, sandbox.module, sandbox.module.exports);
  return sandbox.window[name] || sandbox.self[name] || sandbox.module.exports;
}
function loadPool() {
  const entities = loadGlobal('arcade/match/entities.js', 'GRID_ENTITIES') || [];
  const former = (loadGlobal('arcade/former.js', 'RTG_FORMER') || {}).players || [];
  const supp = (loadGlobal('arcade/supplement.js', 'RTG_SUPPLEMENT') || {}).players || [];
  const stars = loadGlobal('arcade/stars.js', 'RTG_STARS') || {};

  // merge exactly like data.js: curated wins on identity (name|sport), scraped/
  // supplement backfill the recognizability fields and get added if unseen.
  const ENRICH = ['ns', 'hp', 'decade'];
  const ent = entities.map((e) => Object.assign({}, e));
  const byId = {};
  ent.forEach((e) => { if (e && e.name && e.sport) byId[e.name + '|' + e.sport] = e; });
  function fold(list) {
    for (const p of list) {
      if (!p || !p.name || !p.sport) continue;
      const k = p.name + '|' + p.sport, cur = byId[k];
      if (cur) { ENRICH.forEach((f) => { if ((cur[f] == null || cur[f] === '') && p[f] != null && p[f] !== '') cur[f] = p[f]; }); }
      else { const c = Object.assign({}, p); byId[k] = c; ent.push(c); }
    }
  }
  fold(former); fold(supp);

  // stars overlay: mark .star and bump fame (icons->5, stars->4)
  const starBy = {};
  ent.forEach((e) => { if (e && e.name && e.sport) starBy[e.sport + '|' + nkey(e.name)] = e; });
  ['NBA', 'NFL', 'MLB'].forEach((sp) => {
    const pack = stars[sp]; if (!pack) return;
    (pack.icons || []).forEach((n) => { const e = starBy[sp + '|' + nkey(n)]; if (e) { e.star = true; if ((e.f || 0) < 5) e.f = 5; } });
    (pack.stars || []).forEach((n) => { const e = starBy[sp + '|' + nkey(n)]; if (e) { e.star = true; if ((e.f || 0) < 4) e.f = 4; } });
  });

  // the Number Game's exact recognizability gate (arcade/table hiqStar)
  const TEAM = { NBA: 1, NFL: 1, MLB: 1 };
  function hiqStar(e) {
    if (!TEAM[e.sport] || !e.j || !e.j.length) return false;
    if (e.star) return true;
    const d = e.decade; if (!d || !d.length || d[d.length - 1] < 1990) return false;
    if ((e.f || 0) < 4) return false;
    if (e.sport === 'NFL') return e.hp === 1 && (e.ns || 0) >= 8;
    return (e.ns || 0) >= 8;
  }
  const pool = ent.filter(hiqStar);

  // exact name -> canonical {name, sport}; drop names shared by 2+ pooled players
  const byName = { NBA: new Map(), NFL: new Map(), MLB: new Map() };
  const dup = { NBA: new Set(), NFL: new Set(), MLB: new Set() };
  // loose (suffix-stripped) index, used only when unambiguous
  const loose = { NBA: new Map(), NFL: new Map(), MLB: new Map() };
  const looseDup = { NBA: new Set(), NFL: new Set(), MLB: new Set() };
  for (const e of pool) {
    const rec = { name: decode(e.name), sport: e.sport };
    const k = nkey(e.name);
    if (byName[e.sport].has(k)) dup[e.sport].add(k); else byName[e.sport].set(k, rec);
    const lk = skey(e.name);
    if (lk && lk !== k) { if (loose[e.sport].has(lk)) looseDup[e.sport].add(lk); else loose[e.sport].set(lk, rec); }
    else if (lk) { if (loose[e.sport].has(lk) && loose[e.sport].get(lk) !== rec) looseDup[e.sport].add(lk); else loose[e.sport].set(lk, rec); }
  }
  ['NBA', 'NFL', 'MLB'].forEach((sp) => { dup[sp].forEach((k) => byName[sp].delete(k)); looseDup[sp].forEach((k) => loose[sp].delete(k)); });
  // find a pooled player for a feed name: exact match first, then a unique
  // suffix-stripped fallback (never a collided one).
  function find(sport, name) {
    const b = byName[sport], l = loose[sport]; if (!b) return null;
    return b.get(nkey(name)) || l.get(skey(name)) || null;
  }
  return { find, poolCount: pool.length, counts: { NFL: byName.NFL.size, NBA: byName.NBA.size, MLB: byName.MLB.size } };
}

/* ------------------------------ obs -> stints -------------------------- */
// group a player's yearly (team,num) obs into contiguous spans, then keep the
// longest span per distinct (team,num) so one number for one team = one card.
function spansFor(arr) {
  const byTN = new Map();
  for (const o of arr) { const tn = o.team + '|' + o.num; (byTN.get(tn) || byTN.set(tn, []).get(tn)).push(o.y); }
  const spans = [];
  for (const [tn, years] of byTN) {
    years.sort((a, b) => a - b);
    const [team, numS] = tn.split('|'); const num = Number(numS);
    let s = years[0], prev = years[0];
    for (let i = 1; i < years.length; i++) { if (years[i] <= prev + 1) { prev = years[i]; continue; } spans.push({ team, num, y0: s, y1: prev }); s = years[i]; prev = years[i]; }
    spans.push({ team, num, y0: s, y1: prev });
  }
  const best = new Map();
  for (const sp of spans) { const k = sp.team + '|' + sp.num; const c = best.get(k); if (!c || (sp.y1 - sp.y0) > (c.y1 - c.y0)) best.set(k, sp); }
  return [...best.values()];
}
function emit(out, obs, sport) {
  for (const [k, arr] of obs) {
    const meta = arr._meta;
    for (const sp of spansFor(arr)) out.push({ name: meta.name, sport, team: sp.team, y0: sp.y0, y1: sp.y1, num: sp.num });
  }
}
function record(obs, hit, y, team, num) {
  const k = hit.sport + '|' + nkey(hit.name);
  let a = obs.get(k); if (!a) { a = []; a._meta = hit; obs.set(k, a); }
  a.push({ y, team, num });
}

/* --------------------------------- NFL --------------------------------- */
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
  TEN2: 'Tennessee Titans', HOU1: 'Houston Oilers', WAS: 'Washington Commanders', WSH: 'Washington Commanders',
  ARZ: 'Arizona Cardinals', BLT: 'Baltimore Ravens', CLV: 'Cleveland Browns', HST: 'Houston Texans', SL: 'St. Louis Rams',
  PHO: 'Phoenix Cardinals', RAM: 'Los Angeles Rams', RAI: 'Los Angeles Raiders'
};
async function buildNFL(find) {
  const obs = new Map();
  for (let y = START; y <= NOW_YEAR; y++) {
    const rows = await csv(`https://github.com/nflverse/nflverse-data/releases/download/rosters/roster_${y}.csv`);
    if (!rows) { await sleep(120); continue; }
    for (const r of rows) {
      const hit = find('NFL', r.full_name || ''); if (!hit) continue;
      const num = parseNum(r.jersey_number);
      const team = NFL_TEAMS[r.team] || null;
      if (num == null || !team) continue;
      if (num === 0 && y < 2023) continue;   // #0 was illegal in the NFL until 2023; a 0 here is a data artifact
      record(obs, hit, y, team, num);
    }
    await sleep(50);
  }
  const out = []; emit(out, obs, 'NFL');
  console.log('NFL:', obs.size, 'players ->', out.length, 'stints');
  return out;
}

/* --------------------------------- NBA --------------------------------- */
// discover each season's team-season pages from the league index (no hardcoded
// franchise abbreviations), then read the "No." column off each Roster table.
function parseBBRRoster(html) {
  const out = [];
  const tbl = html.match(/<table[^>]*id="roster"[\s\S]*?<\/table>/i);
  if (!tbl) return out;
  for (const row of (tbl[0].match(/<tr[\s\S]*?<\/tr>/gi) || [])) {
    const nm = row.match(/data-stat="number"[^>]*>([\s\S]*?)<\/t[dh]>/i);
    const pm = row.match(/data-stat="player"[^>]*>([\s\S]*?)<\/t[dh]>/i);
    if (!nm || !pm) continue;
    const num = parseNum(nm[1].replace(/<[^>]*>/g, '').trim());
    const name = decode(pm[1].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').replace(/\s*\(TW\)\s*$/i, '').replace(/\*+$/, '').trim());
    if (num == null || !name) continue;
    out.push({ num, name });
  }
  return out;
}
function parseSeasonTeams(html, year) {
  const seen = {}, out = [];
  const re = new RegExp('href="/teams/([A-Z]{3})/' + year + '\\.html"[^>]*>([^<]+)</a>', 'g');
  let m;
  while ((m = re.exec(html))) { if (!seen[m[1]]) { seen[m[1]] = 1; out.push({ abbr: m[1], name: decode(m[2].trim()) }); } }
  return out;
}
async function buildNBA(find) {
  const obs = new Map();
  let pages = 0;
  const MAX = Number(process.env.JERSEYS_MAXPAGES || 0);
  for (let y = START; y <= NOW_YEAR; y++) {
    const idx = await text(`https://www.basketball-reference.com/leagues/NBA_${y}.html`);
    await sleep(3200);
    if (!idx) continue;
    const teams = parseSeasonTeams(idx, y);
    for (const t of teams) {
      if (MAX && pages >= MAX) break;
      const html = await text(`https://www.basketball-reference.com/teams/${t.abbr}/${y}.html`);
      pages++; await sleep(3200);
      if (!html) continue;
      for (const { num, name } of parseBBRRoster(html)) {
        const hit = find('NBA', name); if (!hit) continue;
        record(obs, hit, y, t.name, num);
      }
    }
    if (MAX && pages >= MAX) { console.log('NBA: hit JERSEYS_MAXPAGES cap', MAX); break; }
  }
  const out = []; emit(out, obs, 'NBA');
  console.log('NBA:', pages, 'BBRef pages,', obs.size, 'players ->', out.length, 'stints');
  return out;
}

/* --------------------------------- MLB --------------------------------- */
async function buildMLB(find) {
  const obs = new Map();
  const probe = await j('https://statsapi.mlb.com/api/v1/teams?sportId=1');
  if (!probe || !probe.teams || !probe.teams.length) { console.log('MLB: statsapi unreachable - skipping'); return []; }
  for (let y = START; y <= NOW_YEAR; y++) {
    const tResp = await j(`https://statsapi.mlb.com/api/v1/teams?sportId=1&season=${y}`);
    const teams = (tResp && tResp.teams ? tResp.teams : []).filter((t) => t && t.id);
    for (const t of teams) {
      const d = await j(`https://statsapi.mlb.com/api/v1/teams/${t.id}/roster?rosterType=fullSeason&season=${y}`);
      for (const e of (d && d.roster ? d.roster : [])) {
        const nm = e && e.person && e.person.fullName;
        const hit = nm && find('MLB', nm); if (!hit) continue;
        const num = parseNum(e.jerseyNumber); if (num == null) continue;
        record(obs, hit, y, decode(t.name || ''), num);
      }
      await sleep(20);
    }
  }
  const out = []; emit(out, obs, 'MLB');
  console.log('MLB:', obs.size, 'players ->', out.length, 'stints');
  return out;
}

/* --------------------------------- main -------------------------------- */
const { find, poolCount, counts } = loadPool();
console.log('pool (hiqStar):', poolCount, '| matchable names: NFL', counts.NFL, 'NBA', counts.NBA, 'MLB', counts.MLB);

const ONLY = (process.env.JERSEYS_ONLY || '').toUpperCase();
const run = (s) => !ONLY || ONLY === s;
const stints = [];
if (run('NFL')) try { stints.push(...await buildNFL(find)); } catch (e) { console.error('NFL failed:', e.message); }
if (run('NBA')) try { stints.push(...await buildNBA(find)); } catch (e) { console.error('NBA failed:', e.message); }
if (run('MLB')) try { stints.push(...await buildMLB(find)); } catch (e) { console.error('MLB failed:', e.message); }

stints.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : a.y0 - b.y0));
const bySport = {}; stints.forEach((s) => bySport[s.sport] = (bySport[s.sport] || 0) + 1);
const players = new Set(stints.map((s) => s.sport + '|' + nkey(s.name))).size;
console.log('stints:', stints.length, bySport, '| distinct players:', players);

const file =
  '/* GENERATED by scripts/fetch-jerseys.mjs. Do not edit.\n' +
  ' * Per-player jersey STINTS for the Number Game: one (team, year-range,\n' +
  ' * number) span per card, so the number asked about is never ambiguous.\n' +
  ' * Built only for players already in the game\'s recognizable pool. */\n' +
  'window.RTG_JERSEYS = ' + JSON.stringify({ updated: new Date().toISOString().slice(0, 10), count: stints.length, stints }) + ';\n';
const outFile = ONLY ? `arcade/jerseys.${ONLY.toLowerCase()}.test.js` : 'arcade/jerseys.js';
writeFileSync(outFile, file);
console.log('wrote', outFile);
