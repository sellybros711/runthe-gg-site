#!/usr/bin/env node
/* build-register.mjs — every player who ever played, as a CSV for Supabase.
 *
 * scripts/fetch-former.mjs answers "who would a fan recognise?" and is right to.
 * This answers "who ever existed?", which is a different question and the one
 * a deep-cuts game has to be able to settle. Same sources, none of the caps:
 *
 *   NFL   nflverse roster CSVs, 1920 to now  (fetch-former.mjs starts at 1995
 *         and then keeps only 8+ season careers and top-15 picks)
 *   MLB   MLB StatsAPI season rosters, 1876 to now  (fetch-former.mjs asks for
 *         playerPool=qualified&limit=400, i.e. the top 400 of each season)
 *   NBA   Basketball-Reference A-Z player index, every player in league
 *         history, plus per-season totals for the teams they appeared for.
 *         (stats.nba.com is the obvious source and returns 0 rows from GitHub's
 *         runners — it blocks datacenter ranges. BBRef is already scraped from
 *         CI every day by fetch-jerseys.mjs, so it is the proven path.)
 *
 * Writes supabase/player_register.csv. The workflow \copy's it into the
 * player_register table; nothing here touches the database.
 *
 * Every source is best-effort and reports what it got. A league that fails to
 * fetch leaves the others intact rather than failing the run, but the CSV is
 * only written if the total clears MIN_TOTAL — a half-fetched register would
 * silently start telling real players they don't exist, which is the exact bug
 * this is meant to end.
 *
 *   node scripts/build-register.mjs            # all three
 *   node scripts/build-register.mjs --only=nfl
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'supabase/player_register.csv');
const NOW_YEAR = new Date().getUTCFullYear();
const MIN_TOTAL = 30000;          // a complete pull is ~61k; well under that means a source broke
/* Per-league floors, because the total can't see a single dead source: NFL and
   MLB alone clear MIN_TOTAL comfortably, so the run that shipped with NBA at
   zero rows looked healthy. Roughly two-thirds of each league's real count. */
const MIN_BY_SPORT = { NFL: 20000, MLB: 15000, NBA: 3500 };

const only = (process.argv.find((a) => a.startsWith('--only=')) || '').split('=')[1] || '';
const want = (s) => !only || only.split(',').includes(s);

const UA = 'RunTheArcade/1.0 (+https://runthe.gg)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, opts = {}, tries = 3) {
  for (let i = 0; i < tries; i++) {
    let throttled = false;
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA, ...(opts.headers || {}) } });
      if (r.ok) return opts.json ? r.json() : r.text();
      if (r.status === 404) return null;             // a season that doesn't exist yet
      if (r.status === 429) throttled = true;
      else if (r.status < 500) return null;
    } catch (e) { /* network hiccup → retry */ }
    // Backing off 0.4s from a rate limiter just burns another request; sites
    // that throttle by the minute need to be waited out.
    await sleep((throttled ? (opts.throttleWait || 8000) : (opts.backoff || 400)) * (i + 1));
  }
  return null;
}

/* A CSV parser that respects quoted fields — nflverse college names contain
   commas ("Miami, FL"), which a split(',') would shear in half. */
function parseCSV(text) {
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (c !== '\r') cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  if (!rows.length) return [];
  const head = rows.shift().map((h) => h.trim());
  return rows.filter((r) => r.length > 1).map((r) => {
    const o = {}; head.forEach((h, i) => { o[h] = r[i]; }); return o;
  });
}

// ---- name key: must match keyOf() in arcade/sportegories.js exactly ----
const SUFFIX = { jr: 1, sr: 1, ii: 1, iii: 1, iv: 1, v: 1 };
const normTok = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]/g, '');
function nameKey(name) {
  let t = String(name || '').trim().split(/\s+/).map(normTok).filter(Boolean);
  while (t.length > 2 && SUFFIX[t[t.length - 1]]) t.pop();
  if (!t.length) return null;
  return t.length === 1 ? t[0] + '|' + t[0] : t[0] + '|' + t[t.length - 1];
}

const REG = new Map();            // id -> record
function add(rec) {
  const key = nameKey(rec.name);
  if (!key || !rec.name) return;
  const cur = REG.get(rec.id);
  if (cur) {                      // merge seasons/teams across years
    rec.teams.forEach((t) => { if (!cur.teams.includes(t)) cur.teams.push(t); });
    // A record with no season contributes no season — 9999/0 sentinels would
    // otherwise leak out as a career that ran from the year 9999.
    if (rec.first) cur.first = Math.min(cur.first || rec.first, rec.first);
    if (rec.last) cur.last = Math.max(cur.last || rec.last, rec.last);
    // positions accumulate: a season page may know the specific one the career
    // index only knew the family of
    if (rec.pos) cur.pos = mergePos(String(cur.pos || '').split('|').concat(rec.pos.split('|')));
    cur.college = cur.college || rec.college;
    return;
  }
  REG.set(rec.id, { ...rec, name_key: key });
}

// ---------------------------------------------------------------- NFL
const NFL_TEAMS = {
  ARI: 'Arizona Cardinals', ATL: 'Atlanta Falcons', BAL: 'Baltimore Ravens', BUF: 'Buffalo Bills',
  CAR: 'Carolina Panthers', CHI: 'Chicago Bears', CIN: 'Cincinnati Bengals', CLE: 'Cleveland Browns',
  DAL: 'Dallas Cowboys', DEN: 'Denver Broncos', DET: 'Detroit Lions', GB: 'Green Bay Packers',
  HOU: 'Houston Texans', IND: 'Indianapolis Colts', JAX: 'Jacksonville Jaguars', KC: 'Kansas City Chiefs',
  LV: 'Las Vegas Raiders', OAK: 'Las Vegas Raiders', LAC: 'Los Angeles Chargers', SD: 'Los Angeles Chargers',
  LA: 'Los Angeles Rams', LAR: 'Los Angeles Rams', STL: 'Los Angeles Rams', MIA: 'Miami Dolphins',
  MIN: 'Minnesota Vikings', NE: 'New England Patriots', NO: 'New Orleans Saints', NYG: 'New York Giants',
  NYJ: 'New York Jets', PHI: 'Philadelphia Eagles', PIT: 'Pittsburgh Steelers', SEA: 'Seattle Seahawks',
  SF: 'San Francisco 49ers', TB: 'Tampa Bay Buccaneers', TEN: 'Tennessee Titans', HST: 'Houston Texans',
  WAS: 'Washington Commanders', WSH: 'Washington Commanders',
};
/* nflverse gives position codes; the categories are written in words. Map at
   ingest so the register speaks the same vocabulary as the game. */
const NFL_POS = {
  QB: 'Quarterback', RB: 'Running Back', FB: 'Fullback', WR: 'Wide Receiver', TE: 'Tight End',
  T: 'Offensive Lineman', OT: 'Offensive Lineman', G: 'Offensive Lineman', OG: 'Offensive Lineman',
  C: 'Offensive Lineman', OL: 'Offensive Lineman', LS: 'Offensive Lineman',
  DE: 'Defensive Lineman', DT: 'Defensive Lineman', NT: 'Defensive Lineman', DL: 'Defensive Lineman',
  LB: 'Linebacker', ILB: 'Linebacker', OLB: 'Linebacker', MLB: 'Linebacker',
  CB: 'Cornerback', DB: 'Cornerback', S: 'Safety', SS: 'Safety', FS: 'Safety',
  K: 'Kicker', PK: 'Kicker', P: 'Punter',
};
const posNFL = (p) => (p ? (NFL_POS[String(p).toUpperCase()] || null) : null);

async function buildNFL() {
  let seasons = 0;
  for (let y = 1920; y <= NOW_YEAR; y++) {
    const txt = await get(`https://github.com/nflverse/nflverse-data/releases/download/rosters/roster_${y}.csv`);
    if (!txt) continue;
    seasons++;
    for (const r of parseCSV(txt)) {
      const name = (r.full_name || r.player_name || '').trim();
      if (!name) continue;
      // gsis_id is stable across a career; fall back to the name so a player
      // without one still lands (they merge by id, so a missing id would
      // otherwise split one career into a record per season).
      const gid = (r.gsis_id || '').trim();
      add({
        id: 'nfl:' + (gid || nameKey(name)),
        sport: 'NFL', name,
        pos: posNFL((r.position || '').trim()),
        college: (r.college || '').trim() || null,
        teams: [NFL_TEAMS[r.team] || r.team || null].filter(Boolean),
        first: y, last: y, active: y >= NOW_YEAR - 1,
      });
    }
    await sleep(60);
  }
  return seasons;
}

// ---------------------------------------------------------------- MLB
async function buildMLB() {
  let seasons = 0;
  for (let y = 1876; y <= NOW_YEAR; y++) {
    const d = await get(`https://statsapi.mlb.com/api/v1/sports/1/players?season=${y}`, { json: true });
    if (!d || !Array.isArray(d.people)) continue;
    seasons++;
    for (const p of d.people) {
      const name = (p.fullName || '').trim();
      if (!name) continue;
      add({
        id: 'mlb:' + p.id,
        sport: 'MLB', name,
        pos: (p.primaryPosition && p.primaryPosition.name) || null,
        college: null,                       // StatsAPI carries school only sporadically
        teams: [(p.currentTeam && p.currentTeam.name) || null].filter(Boolean),
        first: y, last: y, active: y >= NOW_YEAR - 1,
      });
    }
    await sleep(60);
  }
  return seasons;
}

// ---------------------------------------------------------------- NBA
/* Basketball-Reference, in two passes:
     1. the A-Z player indexes (26 pages) — every player who ever appeared,
        with career span, position and college. This alone is the register.
     2. per-season totals (one page per season) — which teams each of them
        actually played for, which the index doesn't carry.
   Pass 2 joins on BBRef's own player slug, which both tables expose as
   data-append-csv, so there is no name matching to get wrong.
   BBRef throttles around 20 requests/minute; BBR_WAIT matches the cadence
   fetch-jerseys.mjs has been running at daily without being blocked. */
const BBR = 'https://www.basketball-reference.com';
// The cadence fetch-jerseys.mjs has run at daily without being blocked.
// Overridable so scripts/check-register.mjs can drive the whole two-pass walk
// against a stubbed fetch without waiting eight minutes for it.
const BBR_WAIT = Number(process.env.BBR_WAIT || 3200);
const NBA_START = 1947;              // the BAA's first season, per BBRef

/* Index pages mark players active in the current season with <strong>, which is
   the only "still playing" signal on the page. Detected before tags are
   stripped, so it has to be read off the raw cell. */
function decode(s) {
  return String(s || '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ').trim();
}
const strip = (h) => decode(String(h || '').replace(/<[^>]*>/g, ''));

/* Every BBRef stats table tags its cells with data-stat, in both <th> and <td>,
   and every player row carries that player's slug in data-append-csv. Rows are
   picked out by the slug rather than by locating a table by id and reading
   columns by position: BBRef renames table ids and columns between redesigns
   (team_id became team_name_abbr in 2024) and buries secondary tables inside
   HTML comments, and each of those would turn a working scrape into a silent
   zero. A row with a player slug in it is a player, in every era of the site. */
const uncomment = (h) => String(h || '').replace(/<!--/g, '').replace(/-->/g, '');
function bbrRows(html) {
  return (uncomment(html).match(/<tr[\s\S]*?<\/tr>/gi) || []).map((tr) => {
    const slug = /data-append-csv="([a-z0-9.'-]+)"/i.exec(tr);
    if (!slug) return null;
    const cells = {};
    const re = /data-stat="([a-z0-9_]+)"[^>]*>([\s\S]*?)<\/t[dh]>/gi;
    let m;
    while ((m = re.exec(tr))) cells[m[1]] = m[2];
    return { cells, slug: slug[1], raw: tr };
  }).filter(Boolean);
}
const cell = (r, ...names) => {
  for (const n of names) if (r.cells[n] != null) return strip(r.cells[n]);
  return '';
};
/* A cell holding a list of links — colleges, for a player who transferred.
   Taking the link texts rather than splitting the rendered string keeps schools
   whose own name has a comma in it intact. */
function links(r, name) {
  const out = [];
  const re = /<a\b[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(r.cells[name] || ''))) { const t = strip(m[1]); if (t && out.indexOf(t) < 0) out.push(t); }
  return out;
}

/* BBRef positions are the coarse family (G / F / C, or "F-C" for a swingman).
   Split rather than collapse: an F-C genuinely is both a forward and a centre,
   and arcade/livecheck.js knows that a bare "Guard" can't settle a "Point
   Guard" category either way. */
/* Two grains live in these pages. The A-Z index states a career as G / F / C;
   the per-season totals name the actual position, PG / SG / SF / PF / C, for
   every modern season. The categories ask for "NBA Shooting Guard", and a bare
   "Guard" cannot settle that either way — so an answer like Rodney McGruder
   came back as a real player we could not verify, and scored nothing. Take the
   specific grain wherever the season pages offer it. */
const NBA_POS = {
  PG: 'Point Guard', SG: 'Shooting Guard', SF: 'Small Forward', PF: 'Power Forward',
  G: 'Guard', F: 'Forward', C: 'Center',
};
const SPECIFIC_POS = { 'Point Guard': 1, 'Shooting Guard': 1, 'Small Forward': 1, 'Power Forward': 1 };
const posNBA = (p) => String(p || '').split(/[-\/]/)
  .map((x) => NBA_POS[x.trim().toUpperCase()]).filter(Boolean).join('|') || null;
/* Merge what the season pages saw into what the index said. A specific
   position always beats the family it belongs to — "Shooting Guard" replaces
   "Guard" rather than sitting beside it — because the pair reads as two
   different positions to the grader. */
const FAMILY_OF = { 'Point Guard': 'Guard', 'Shooting Guard': 'Guard',
                    'Small Forward': 'Forward', 'Power Forward': 'Forward' };
function mergePos(list) {
  const seen = [];
  list.filter(Boolean).forEach((p) => { if (seen.indexOf(p) < 0) seen.push(p); });
  const specific = seen.filter((p) => SPECIFIC_POS[p]);
  if (!specific.length) return seen.join('|') || null;
  const covered = {};
  specific.forEach((p) => { covered[FAMILY_OF[p]] = 1; });
  return seen.filter((p) => SPECIFIC_POS[p] || !covered[p]).join('|') || null;
}

async function bbr(url) {
  const html = await get(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; runthe-arcade/1.0)' },
    backoff: 1500, throttleWait: 8000,
  }, 4);
  await sleep(BBR_WAIT);
  return html;
}

async function buildNBA() {
  // ---- pass 1: who ever played ----
  const bySlug = new Map();
  let pages = 0;
  for (const L of 'abcdefghijklmnopqrstuvwxyz') {
    const html = await bbr(`${BBR}/players/${L}/`);
    if (!html) continue;
    pages++;
    const rows = bbrRows(html);
    if (!rows.length) console.warn(`::warning::NBA index /players/${L}/ parsed 0 players.`);
    for (const r of rows) {
      const name = cell(r, 'player');
      if (!name) continue;
      const to = parseInt(cell(r, 'year_max'), 10) || null;
      bySlug.set(r.slug, name);
      add({
        id: 'nba:' + r.slug,
        sport: 'NBA', name,
        pos: posNBA(cell(r, 'pos')),
        college: links(r, 'colleges').join('|') || null,
        teams: [],
        first: parseInt(cell(r, 'year_min'), 10) || null,
        last: to,
        // BBRef bolds players active in the current season; the year is the
        // backstop for the weeks before a new season's pages fill in.
        active: /<strong>/i.test(r.cells.player || '') || (to != null && to >= NOW_YEAR - 1),
      });
    }
  }
  if (!bySlug.size) {
    console.warn('::warning::NBA index returned nothing — skipping the season pass.');
    return 0;
  }

  // ---- pass 2: and for whom ----
  for (let y = NBA_START; y <= NOW_YEAR; y++) {
    const idx = await bbr(`${BBR}/leagues/NBA_${y}.html`);
    if (!idx) continue;                       // no season played (e.g. a lockout year page 404s)
    pages++;
    // Era-accurate names, straight off that season's index, so relocations and
    // renames (Seattle → Oklahoma City, New Jersey → Brooklyn) need no table.
    const teamName = {};
    const re = new RegExp('href="/teams/([A-Z]{3})/' + y + '\\.html"[^>]*>([^<]+)</a>', 'g');
    let m;
    while ((m = re.exec(idx))) if (!teamName[m[1]]) teamName[m[1]] = decode(m[2]);

    const totals = await bbr(`${BBR}/leagues/NBA_${y}_totals.html`);
    if (!totals) continue;
    pages++;
    let hits = 0;
    for (const r of bbrRows(totals)) {
      if (!bySlug.has(r.slug)) continue;
      const abbr = cell(r, 'team_name_abbr', 'team_id');
      // A traded player gets a combined "2TM" line plus one line per real team;
      // the combined line names no team, so it is simply skipped.
      const name = teamName[abbr];
      if (!name) continue;
      hits++;
      // Teams and the season's position. The index already stated the career
      // span, and it is the authority: a season page can name a year the index
      // doesn't cover (a player listed on a roster who never appeared), and
      // taking the wider of the two would quietly stretch careers.
      add({ id: 'nba:' + r.slug, sport: 'NBA', name: bySlug.get(r.slug),
            teams: [name], pos: posNBA(cell(r, 'pos')), first: null, last: null });
    }
    if (!hits) console.warn(`::warning::NBA ${y} totals matched no players to a team.`);
  }
  console.log(`NBA  ${pages} BBRef pages, ${bySlug.size} players`);
  return bySlug.size;
}

// ---------------------------------------------------------------- run
const csvCell = (v) => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};

/* scripts/check-register.mjs imports the parsers and asserts them against saved
   BBRef markup. Neither Basketball-Reference nor Supabase is reachable from the
   dev sandbox, so a fixture is the only way to catch a scrape that silently
   returns nothing before it reaches a workflow run. */
export const _test = { bbrRows, cell, links, posNBA, mergePos, nameKey, parseCSV, decode, csvCell, buildNBA, REG };
if (process.env.REGISTER_SELFTEST) { /* parsers only — no network, no CSV */ }
else await main();

async function main() {
const report = {};
if (want('nfl')) { report.nfl = await buildNFL(); console.log('NFL  seasons fetched:', report.nfl); }
if (want('mlb')) { report.mlb = await buildMLB(); console.log('MLB  seasons fetched:', report.mlb); }
if (want('nba')) { report.nba = await buildNBA(); console.log('NBA  rows fetched:', report.nba); }

const rows = [...REG.values()];
const bySport = {};
rows.forEach((r) => { bySport[r.sport] = (bySport[r.sport] || 0) + 1; });
console.log('\nregister:', rows.length.toLocaleString(), 'players', JSON.stringify(bySport));

const short = Object.keys(MIN_BY_SPORT)
  .filter((s) => want(s.toLowerCase()) && (bySport[s] || 0) < MIN_BY_SPORT[s])
  .map((s) => `${s} ${bySport[s] || 0} < ${MIN_BY_SPORT[s]}`);
if (short.length || (!only && rows.length < MIN_TOTAL)) {
  console.error(`::error::partial register — refusing to write it. ` +
    (short.length ? short.join('; ') : `total ${rows.length} < ${MIN_TOTAL}`) +
    `. An empty or half-empty register tells real players they don't exist, ` +
    `which is the bug this job exists to prevent — the table keeps its last good load.`);
  process.exit(1);
}

mkdirSync(path.dirname(OUT), { recursive: true });
const head = 'id,sport,name,name_key,pos,college,teams,first_season,last_season,active\n';
const body = rows.map((r) => [
  r.id, r.sport, r.name, r.name_key, r.pos, r.college,
  r.teams.join('|'), r.first || '', r.last || '', r.active ? 'true' : 'false',
].map(csvCell).join(',')).join('\n');
writeFileSync(OUT, head + body + '\n');
console.log('wrote', path.relative(ROOT, OUT), '—', (Buffer.byteLength(head + body) / 1048576).toFixed(1), 'MB');
}
