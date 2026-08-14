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
 *   NBA   stats.nba.com commonallplayers, every player in league history
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
const MIN_TOTAL = 30000;          // a complete pull is ~56k; well under that means a source broke

const only = (process.argv.find((a) => a.startsWith('--only=')) || '').split('=')[1] || '';
const want = (s) => !only || only.split(',').includes(s);

const UA = 'RunTheArcade/1.0 (+https://runthe.gg)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, opts = {}, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA, ...(opts.headers || {}) } });
      if (r.ok) return opts.json ? r.json() : r.text();
      if (r.status === 404) return null;             // a season that doesn't exist yet
      if (r.status < 500 && r.status !== 429) return null;
    } catch (e) { /* network hiccup → retry */ }
    await sleep(400 * (i + 1));
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
    cur.first = Math.min(cur.first || 9999, rec.first || 9999);
    cur.last = Math.max(cur.last || 0, rec.last || 0);
    cur.pos = cur.pos || rec.pos;
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
/* stats.nba.com refuses requests that don't look like a browser, and blocks
   some datacenter ranges outright. Best-effort: if it declines, the other two
   leagues still land and the log says so. */
async function buildNBA() {
  const season = `${NOW_YEAR - 1}-${String(NOW_YEAR % 100).padStart(2, '0')}`;
  const d = await get(
    `https://stats.nba.com/stats/commonallplayers?IsOnlyCurrentSeason=0&LeagueID=00&Season=${season}`,
    { json: true, headers: {
      Referer: 'https://www.nba.com/', Origin: 'https://www.nba.com',
      'Accept-Language': 'en-US,en;q=0.9', Accept: 'application/json, text/plain, */*',
    } });
  const rs = d && d.resultSets && d.resultSets[0];
  if (!rs) return 0;
  const ix = {}; rs.headers.forEach((h, i) => { ix[h] = i; });
  for (const row of rs.rowSet) {
    const last = row[ix.DISPLAY_LAST_COMMA_FIRST] || '';
    const name = last.includes(',')
      ? last.split(',').map((s) => s.trim()).reverse().join(' ')
      : (row[ix.DISPLAY_FIRST_LAST] || '').trim();
    if (!name) continue;
    add({
      id: 'nba:' + row[ix.PERSON_ID],
      sport: 'NBA', name, pos: null, college: null,
      teams: [row[ix.TEAM_NAME] ? `${row[ix.TEAM_CITY]} ${row[ix.TEAM_NAME]}`.trim() : null].filter(Boolean),
      first: Number(row[ix.FROM_YEAR]) || null,
      last: Number(row[ix.TO_YEAR]) || null,
      active: Number(row[ix.TO_YEAR]) >= NOW_YEAR - 1,
    });
  }
  return rs.rowSet.length;
}

// ---------------------------------------------------------------- run
const csvCell = (v) => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};

const report = {};
if (want('nfl')) { report.nfl = await buildNFL(); console.log('NFL  seasons fetched:', report.nfl); }
if (want('mlb')) { report.mlb = await buildMLB(); console.log('MLB  seasons fetched:', report.mlb); }
if (want('nba')) { report.nba = await buildNBA(); console.log('NBA  rows fetched:', report.nba); }

const rows = [...REG.values()];
const bySport = {};
rows.forEach((r) => { bySport[r.sport] = (bySport[r.sport] || 0) + 1; });
console.log('\nregister:', rows.length.toLocaleString(), 'players', JSON.stringify(bySport));

if (!only && rows.length < MIN_TOTAL) {
  console.error(`::error::only ${rows.length} players — a source must have failed. ` +
    `Refusing to write a partial register (min ${MIN_TOTAL}).`);
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
