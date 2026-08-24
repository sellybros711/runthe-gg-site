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
import { readFileSync, writeFileSync, mkdirSync } from 'fs';

// Include the current season so the Number Game reflects live rosters (offseason
// moves and mid-season trades). This job is re-run on a schedule (see
// .github/workflows/jerseys.yml) to keep it current.
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
/* RTG_KNOWN, straight out of arcade/data.js rather than copied. data.js hangs
   it off the global after folding former.js into GRID_ENTITIES, and it bails
   early unless that global is a real array, so it gets an empty one: we only
   want the function, and the function is pure. */
function loadKnown() {
  const sandbox = { window: { GRID_ENTITIES: [] }, module: { exports: {} } };
  sandbox.self = sandbox.window;
  for (const f of ['arcade/awards.js', 'arcade/data.js']) {
    // eslint-disable-next-line no-new-func
    new Function('window', 'self', 'module', 'exports', readFileSync(f, 'utf8'))(
      sandbox.window, sandbox.self, sandbox.module, sandbox.module.exports);
  }
  return sandbox.window.RTG_KNOWN || null;
}

function loadPool() {
  const entities = loadGlobal('arcade/match/entities.js', 'GRID_ENTITIES') || [];
  const former = (loadGlobal('arcade/former.js', 'RTG_FORMER') || {}).players || [];
  const supp = (loadGlobal('arcade/supplement.js', 'RTG_SUPPLEMENT') || {}).players || [];
  const stars = loadGlobal('arcade/stars.js', 'RTG_STARS') || {};
  const awards = loadGlobal('arcade/awards.js', 'RTG_AWARDS') || {};
  const RTG_KNOWN = loadKnown();
  if (!RTG_KNOWN) throw new Error('arcade/data.js did not export RTG_KNOWN');

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

  // Collapse same-person duplicates the SAME way data.js does, so a stint is
  // always emitted under the spelling the game keeps (else e.g. Odell Beckham's
  // #13 years, scraped as "Odell Beckham", would orphan against the kept
  // "Odell Beckham Jr."). Accent/punctuation variants merge; suffixes are kept
  // so father/son pairs stay distinct; ALIAS handles verified suffix mismatches.
  const ALIAS = {
    'NBA|Jimmy Butler III': 'Jimmy Butler', 'NFL|Robert Griffin': 'Robert Griffin III',
    'NFL|Odell Beckham': 'Odell Beckham Jr.', 'MLB|Nolan Ryan Jr.': 'Nolan Ryan'
  };
  const dnorm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[.']/g, '').replace(/\s+/g, ' ').trim();
  const dseen = {}, deduped = [];
  for (const e of ent) {
    const nm = ALIAS[e.sport + '|' + e.name] || e.name;
    const dk = e.sport + '|' + dnorm(nm), prev = dseen[dk];
    if (prev) { if (Array.isArray(e.t)) { if (!Array.isArray(prev.t)) prev.t = []; e.t.forEach((tm) => { if (prev.t.indexOf(tm) < 0) prev.t.push(tm); }); } continue; }
    dseen[dk] = e; deduped.push(e);
  }
  ent.length = 0; ent.push(...deduped);

  /* awards overlay, exactly as data.js merges it: for a lot of players the
     only accolade on file lives in awards.js, and the gate below reads e.aw. */
  if (awards.players) {
    ent.forEach((e) => {
      if (!e || !e.name || !e.sport) return;
      const rec = awards.players[e.sport + '|' + String(e.name).toLowerCase()];
      if (!rec || !rec.aw || !rec.aw.length) return;
      if (!e.aw) e.aw = [];
      const have = {}; e.aw.forEach((t) => { have[t] = 1; });
      rec.aw.forEach((t) => { if (!have[t]) e.aw.push(t); });
    });
  }

  // stars overlay: mark .star and bump fame (icons->5, stars->4)
  const starBy = {};
  ent.forEach((e) => { if (e && e.name && e.sport) starBy[e.sport + '|' + nkey(e.name)] = e; });
  ['NBA', 'NFL', 'MLB'].forEach((sp) => {
    const pack = stars[sp]; if (!pack) return;
    (pack.icons || []).forEach((n) => { const e = starBy[sp + '|' + nkey(n)]; if (e) { e.star = true; if ((e.f || 0) < 5) e.f = 5; } });
    (pack.stars || []).forEach((n) => { const e = starBy[sp + '|' + nkey(n)]; if (e) { e.star = true; if ((e.f || 0) < 4) e.f = 4; } });
  });

  /* WHO GETS STINTS. This used to be a hand-copied version of the Number
     Game's old gate, and the game moved on: it asks RTG_KNOWN now, which wants
     a real accolade rather than eight seasons of service. The copy kept the
     old longevity rule, so anybody who is famous for a trophy rather than a
     long career never entered the scrape. Jason Varitek, two Gold Gloves and
     seven notable seasons, was one of them, which is why Chain could not put
     him on the 2010 Red Sox next to Adrian Beltre. It cost 533 MLB players.

     Reading the shared test instead means the pool moves with the arcade
     automatically, and it costs nothing to fetch: the feeds are walked per
     team-season either way, so a wider pool matches more rows out of pages we
     were already downloading.

     Two conditions of our own remain. The corpus jersey list is NOT one of
     them any more: the number comes from the feed, so requiring e.j only
     dropped players whose corpus row happened to lack it. */
  const TEAM = { NBA: 1, NFL: 1, MLB: 1 };
  /* The union of both tests, not a swap. This file is an INPUT to several
     games and each applies its own gate on top, so the honest job here is to
     be a superset: taking RTG_KNOWN alone would have dropped ~600 NFL players
     whose stints are already in the file, on the strength of a rule that might
     move again next month. Adding to it costs nothing and loses nothing. */
  function longService(e) {
    if (e.star) return true;
    if ((e.f || 0) < 4) return false;
    if (e.sport === 'NFL') return e.hp === 1 && (e.ns || 0) >= 8;
    return (e.ns || 0) >= 8;
  }
  function poolGate(e) {
    if (!TEAM[e.sport]) return false;
    // the feeds start at 1990, so a career that ended before then can only
    // mismatch a modern namesake
    const d = e.decade;
    if (!d || !d.length || d[d.length - 1] < 1990) return false;
    return RTG_KNOWN(e) || longService(e);
  }
  const pool = ent.filter(poolGate);

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
/* THE WHOLE ROSTER, NOT JUST THE FAMOUS PART.
 * Every fetch below already parses each team-season page in full and then
 * throws away any name that is not in the recognizable pool. That is right for
 * the Number Game, whose cards are one player each, and wrong for Roll Call,
 * which asks "who else was on that squad" and then had to ask WIKIDATA,
 * because its own file held six names off a fifteen-man roster. A third party
 * answers that question loosely: it accepted Boris Diaw for the 2009-10 Spurs
 * (he arrived in 2012) and could not confirm Tiago Splitter, who was there.
 *
 * So the raw rows are kept too, keyed by sport|team|year. No fame gate at all:
 * a deep cut is the entire point of the mode. Pruned at write time to the
 * team-seasons that can actually become boards, or this would be six figures
 * of rows nobody asks about. */
const rosters = new Map();
function roster(sport, y, team, num, name) {
  const k = sport + '|' + team + '|' + y;
  let a = rosters.get(k); if (!a) { a = []; rosters.set(k, a); }
  a.push({ name, num });
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
      const num = parseNum(r.jersey_number);
      const team = NFL_TEAMS[r.team] || null;
      if (num == null || !team) continue;
      if (num === 0 && y < 2023) continue;   // #0 was illegal in the NFL until 2023; a 0 here is a data artifact
      roster('NFL', y, team, num, String(r.full_name || '').trim());   // everyone, gate-free
      const hit = find('NFL', r.full_name || ''); if (!hit) continue;
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
        roster('NBA', y, t.name, num, name);          // everyone, gate-free
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
        const num = parseNum(e.jerseyNumber);
        if (nm && num != null) roster('MLB', y, decode(t.name || ''), num, decode(nm));
        const hit = nm && find('MLB', nm); if (!hit) continue;
        if (num == null) continue;
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
console.log('pool:', poolCount, '| matchable names: NFL', counts.NFL, 'NBA', counts.NBA, 'MLB', counts.MLB);

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

/* ---- full rosters, for the team-seasons that can become Roll Call boards ----
 * PRUNED AND SHARDED, because the honest version of this file is 3 MB. Every
 * team-season since 1990 is 120,000 roster rows and an NFL squad alone is
 * seventy men; nobody is asked about most of them and no phone should download
 * them. Two cuts bring it to a sane size without ever narrowing an ANSWER:
 *
 *   1. only the seasons that can become a board. A board needs enough pooled
 *      players to print slots against, so the floor here mirrors the game's
 *      MIN_ROSTER, one lower, because this file has to be a SUPERSET of what
 *      build-teammates.mjs picks. Strict here would silently starve a real
 *      board of its deep cuts, which is the bug this whole file exists to fix.
 *   2. one file per sport. Roll Call plays one board at a time and a board is
 *      one league, so the page pulls the shard it needs and never the other
 *      two.
 *
 * Names are pooled and referenced by index: a man on eight rosters is one
 * string, not eight.
 *
 * Deduped on (name, number) within a season: a mid-season signing appears on
 * two rows of the same page and Roll Call would print him twice. */
const ROSTER_FLOOR = 5;
const pooledPer = new Map();
for (const st of stints) {
  for (let y = st.y0; y <= st.y1; y++) {
    const k = st.sport + '|' + st.team + '|' + y;
    pooledPer.set(k, (pooledPer.get(k) || 0) + 1);
  }
}
for (const sp of ['NBA', 'NFL', 'MLB']) {
  if (!run(sp)) continue;
  const names = [], iN = new Map();
  const nameIdx = (n) => { let i = iN.get(n); if (i == null) { i = names.length; names.push(n); iN.set(n, i); } return i; };
  const teams = [], iT = new Map();
  const teamIdx = (t) => { let i = iT.get(t); if (i == null) { i = teams.length; teams.push(t); iT.set(t, i); } return i; };
  const out = {};
  let rows = 0, seasons = 0;
  for (const [k, arr] of rosters) {
    if (!k.startsWith(sp + '|')) continue;
    if ((pooledPer.get(k) || 0) < ROSTER_FLOOR) continue;
    const bar = k.indexOf('|'), bar2 = k.lastIndexOf('|');
    const team = k.slice(bar + 1, bar2), year = +k.slice(bar2 + 1);
    const seen = new Set(), list = [];
    for (const r of arr) {
      const dk = nkey(r.name) + '|' + r.num;
      if (!r.name || seen.has(dk)) continue;
      seen.add(dk); list.push([nameIdx(r.name), r.num]);
    }
    if (!list.length) continue;
    list.sort((a, b) => a[1] - b[1] || (names[a[0]] < names[b[0]] ? -1 : 1));
    (out[teamIdx(team)] || (out[teamIdx(team)] = {}))[year] = list;
    rows += list.length; seasons++;
  }
  const body = JSON.stringify({ updated: new Date().toISOString().slice(0, 10), sport: sp,
                                seasons, rows, names, teams, r: out });
  const f =
    '/* GENERATED by scripts/fetch-jerseys.mjs. Do not edit.\n' +
    ' * FULL ' + sp + ' rosters, no recognizability gate, for the team-seasons that\n' +
    ' * can become Roll Call boards. This is the answer key that mode judges a\n' +
    ' * typed name against. Without it a deep cut had to be put to Wikidata,\n' +
    ' * which answers a SEASON question loosely: it accepted Boris Diaw for the\n' +
    ' * 2009-10 Spurs, who signed in 2012, and could not confirm Tiago Splitter,\n' +
    ' * who was there.\n' +
    ' * Shape: { names:[...], teams:[...], r:{ teamIdx: { year: [[nameIdx, number], ...] } } }\n' +
    ' * Loaded on demand by the game: one board is one league. */\n' +
    'window.RTG_ROSTERS_' + sp + ' = ' + body + ';\n';
  const rosterOut = 'arcade/rosters/' + sp.toLowerCase() + '.js';
  try { mkdirSync('arcade/rosters', { recursive: true }); } catch (e) {}
  writeFileSync(rosterOut, f);
  console.log('wrote', rosterOut, '|', seasons, 'team-seasons,', rows, 'roster rows,',
              Math.round(body.length / 1024) + ' KB');
}
