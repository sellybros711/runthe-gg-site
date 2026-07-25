/* The Perfect Season — shared build helpers.
 *
 * Every build script fetches from nflverse-data releases into a local cache
 * (build/.cache, gitignored) so a rebuild is reproducible and offline-repeatable.
 *
 * NOTE ON CSV PARSING: do not replace parseCSV with line.split(','). nflverse
 * ships quoted fields that contain commas — headshot_url holds
 * ".../upload/f_auto,q_auto/..." — and a naive split silently shifts every
 * column after it, producing plausible-looking but wrong numbers rather than
 * an error. This bit us once already.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const BUILD_DIR = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = path.join(BUILD_DIR, '..', 'data');
export const CACHE_DIR = path.join(BUILD_DIR, '.cache');

/** Era floor. nflverse weekly stats and play-by-play begin in 1999. */
export const FIRST_SEASON = 1999;
export const LAST_SEASON = 2025;
export const SEASONS = Array.from(
  { length: LAST_SEASON - FIRST_SEASON + 1 },
  (_, i) => FIRST_SEASON + i,
);

/** Skill positions the game drafts. */
export const POSITIONS = ['QB', 'RB', 'WR', 'TE'];

/** Below this many games the weekly variance estimate is noise. */
export const MIN_GAMES = 8;

// ─── franchises ──────────────────────────────────────────────────────────────

/*
 * Never join on a raw team abbreviation. The two upstream sources disagree, and
 * they disagree inconsistently:
 *
 *   - stats_player uses ERA codes for 1999-2002 (OAK, SD, STL) but CURRENT codes
 *     from 2003 on. LaDainian Tomlinson's 2006 season is coded "LAC" though he
 *     was a San Diego Charger; Randy Moss's 2005 is "LV" though he was an
 *     Oakland Raider.
 *   - games.csv uses era codes throughout (OAK through 2019, SD through 2016,
 *     STL through 2015).
 *   - Jacksonville appears as both JAC and JAX, overlapping in 2001-2002.
 *
 * A naive (team, season) join silently loses these franchises for large spans,
 * which would show up as missing team-seasons — dead wheel entries and absent
 * opponents — rather than as an error. Everything is normalized to franchise_id
 * on ingest, and display names come from (franchise, season), never from the
 * code in the data.
 */

/** @type {{id:string, conf:'AFC'|'NFC', div:string, codes:string[], names:[number,string][]}[]} */
export const FRANCHISES = [
  { id: 'BUF', conf: 'AFC', div: 'East',  codes: ['BUF'], names: [[0, 'Buffalo Bills']] },
  { id: 'MIA', conf: 'AFC', div: 'East',  codes: ['MIA'], names: [[0, 'Miami Dolphins']] },
  { id: 'NE',  conf: 'AFC', div: 'East',  codes: ['NE'],  names: [[0, 'New England Patriots']] },
  { id: 'NYJ', conf: 'AFC', div: 'East',  codes: ['NYJ'], names: [[0, 'New York Jets']] },
  { id: 'BAL', conf: 'AFC', div: 'North', codes: ['BAL'], names: [[0, 'Baltimore Ravens']] },
  { id: 'CIN', conf: 'AFC', div: 'North', codes: ['CIN'], names: [[0, 'Cincinnati Bengals']] },
  { id: 'CLE', conf: 'AFC', div: 'North', codes: ['CLE'], names: [[0, 'Cleveland Browns']] },
  { id: 'PIT', conf: 'AFC', div: 'North', codes: ['PIT'], names: [[0, 'Pittsburgh Steelers']] },
  // Houston entered the league in 2002; it has 24 drawable seasons, not 27.
  { id: 'HOU', conf: 'AFC', div: 'South', codes: ['HOU'], names: [[0, 'Houston Texans']] },
  { id: 'IND', conf: 'AFC', div: 'South', codes: ['IND'], names: [[0, 'Indianapolis Colts']] },
  { id: 'JAX', conf: 'AFC', div: 'South', codes: ['JAX', 'JAC'], names: [[0, 'Jacksonville Jaguars']] },
  { id: 'TEN', conf: 'AFC', div: 'South', codes: ['TEN'], names: [[0, 'Tennessee Titans']] },
  { id: 'DEN', conf: 'AFC', div: 'West',  codes: ['DEN'], names: [[0, 'Denver Broncos']] },
  { id: 'KC',  conf: 'AFC', div: 'West',  codes: ['KC'],  names: [[0, 'Kansas City Chiefs']] },
  { id: 'LV',  conf: 'AFC', div: 'West',  codes: ['LV', 'OAK'],
    names: [[0, 'Oakland Raiders'], [2020, 'Las Vegas Raiders']] },
  { id: 'LAC', conf: 'AFC', div: 'West',  codes: ['LAC', 'SD'],
    names: [[0, 'San Diego Chargers'], [2017, 'Los Angeles Chargers']] },
  { id: 'DAL', conf: 'NFC', div: 'East',  codes: ['DAL'], names: [[0, 'Dallas Cowboys']] },
  { id: 'NYG', conf: 'NFC', div: 'East',  codes: ['NYG'], names: [[0, 'New York Giants']] },
  { id: 'PHI', conf: 'NFC', div: 'East',  codes: ['PHI'], names: [[0, 'Philadelphia Eagles']] },
  { id: 'WAS', conf: 'NFC', div: 'East',  codes: ['WAS', 'WSH'],
    names: [[0, 'Washington Redskins'], [2020, 'Washington Football Team'], [2022, 'Washington Commanders']] },
  { id: 'CHI', conf: 'NFC', div: 'North', codes: ['CHI'], names: [[0, 'Chicago Bears']] },
  { id: 'DET', conf: 'NFC', div: 'North', codes: ['DET'], names: [[0, 'Detroit Lions']] },
  { id: 'GB',  conf: 'NFC', div: 'North', codes: ['GB'],  names: [[0, 'Green Bay Packers']] },
  { id: 'MIN', conf: 'NFC', div: 'North', codes: ['MIN'], names: [[0, 'Minnesota Vikings']] },
  { id: 'ATL', conf: 'NFC', div: 'South', codes: ['ATL'], names: [[0, 'Atlanta Falcons']] },
  { id: 'CAR', conf: 'NFC', div: 'South', codes: ['CAR'], names: [[0, 'Carolina Panthers']] },
  { id: 'NO',  conf: 'NFC', div: 'South', codes: ['NO'],  names: [[0, 'New Orleans Saints']] },
  { id: 'TB',  conf: 'NFC', div: 'South', codes: ['TB'],  names: [[0, 'Tampa Bay Buccaneers']] },
  { id: 'ARI', conf: 'NFC', div: 'West',  codes: ['ARI'], names: [[0, 'Arizona Cardinals']] },
  { id: 'LAR', conf: 'NFC', div: 'West',  codes: ['LAR', 'LA', 'STL'],
    names: [[0, 'St. Louis Rams'], [2016, 'Los Angeles Rams']] },
  { id: 'SF',  conf: 'NFC', div: 'West',  codes: ['SF'],  names: [[0, 'San Francisco 49ers']] },
  // Seattle played in the AFC West until the 2002 realignment; the modern
  // alignment is canonical for division structure per the design.
  { id: 'SEA', conf: 'NFC', div: 'West',  codes: ['SEA'], names: [[0, 'Seattle Seahawks']] },
];

const CODE_TO_FRANCHISE = new Map();
for (const f of FRANCHISES) for (const c of f.codes) CODE_TO_FRANCHISE.set(c, f.id);

/** Canonical franchise id for any abbreviation either source might emit. */
export function franchiseId(code) {
  const id = CODE_TO_FRANCHISE.get(code);
  if (!id) throw new Error(`unmapped team code "${code}" — add it to FRANCHISES`);
  return id;
}

export const FRANCHISE_BY_ID = new Map(FRANCHISES.map((f) => [f.id, f]));

/** Era-correct name, e.g. ("LAC", 2006) -> "San Diego Chargers". */
export function franchiseName(id, season) {
  const f = FRANCHISE_BY_ID.get(id);
  if (!f) throw new Error(`unknown franchise "${id}"`);
  let name = f.names[0][1];
  for (const [from, n] of f.names) if (season >= from) name = n;
  return name;
}

export const divisionKey = (id) => {
  const f = FRANCHISE_BY_ID.get(id);
  return `${f.conf} ${f.div}`;
};

// ─── CSV ─────────────────────────────────────────────────────────────────────

/** Quote-aware CSV parse. Returns an array of string arrays. */
export function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else { quoted = false; }
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); field = ''; rows.push(row); row = []; }
    else if (c !== '\r') field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/** Parse into objects keyed by header name. */
export function parseCSVObjects(text) {
  const rows = parseCSV(text);
  if (!rows.length) return [];
  const header = rows[0];
  return rows.slice(1).map((r) => {
    const o = {};
    for (let i = 0; i < header.length; i++) o[header[i]] = r[i];
    return o;
  });
}

/** Serialize rows (array of objects) to CSV using `columns` order. */
export function toCSV(rows, columns) {
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [
    columns.join(','),
    ...rows.map((r) => columns.map((c) => esc(r[c])).join(',')),
  ].join('\n') + '\n';
}

// ─── fetch with cache ────────────────────────────────────────────────────────

/**
 * nflverse release asset, cached under build/.cache.
 *
 * The maintained release is `stats_player` (assets named
 * stats_player_week_<year>.csv), which covers 1999-2025 under one schema. The
 * older `player_stats` release stops carrying recent seasons; we verified the
 * two agree on fantasy_points_ppr before switching.
 */
export async function nflverseCSV(release, asset) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const cached = path.join(CACHE_DIR, asset);
  if (fs.existsSync(cached) && fs.statSync(cached).size > 0) {
    return fs.readFileSync(cached, 'utf8');
  }
  const url = `https://github.com/nflverse/nflverse-data/releases/download/${release}/${asset}`;
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`fetch ${asset}: HTTP ${res.status}`);
  const text = await res.text();
  if (!text.startsWith('player_id') && !text.includes(',')) {
    throw new Error(`fetch ${asset}: unexpected body`);
  }
  fs.writeFileSync(cached, text);
  return text;
}

/** Any URL, cached under build/.cache by `name`. */
export async function cachedCSV(url, name) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const cached = path.join(CACHE_DIR, name);
  if (fs.existsSync(cached) && fs.statSync(cached).size > 0) {
    return fs.readFileSync(cached, 'utf8');
  }
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`fetch ${name}: HTTP ${res.status}`);
  const text = await res.text();
  fs.writeFileSync(cached, text);
  return text;
}

/** Game results 1999-present: game_id, season, week, teams, scores. */
export const GAMES_URL =
  'https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv';

// ─── stats ───────────────────────────────────────────────────────────────────

export const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;

/** Sample standard deviation (n-1). Returns 0 for a single observation. */
export function stdev(a) {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1));
}

/** Value at fractional rank q in an ascending-sorted array. */
export function quantileSorted(sorted, q) {
  if (!sorted.length) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))));
  return sorted[i];
}

export const round = (v, dp = 2) => Number(v.toFixed(dp));

/** Write JSON + CSV together so the pair can never drift (RunThePitch pattern). */
export function writePair(basename, rows, columns) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const json = path.join(DATA_DIR, `${basename}.json`);
  const csv = path.join(DATA_DIR, `${basename}.csv`);
  fs.writeFileSync(json, JSON.stringify(rows));
  fs.writeFileSync(csv, toCSV(rows, columns));
  return { json, csv, bytes: fs.statSync(json).size };
}
