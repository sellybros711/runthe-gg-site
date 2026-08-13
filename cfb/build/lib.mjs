/* CFB Perfect Season, shared build helpers.
 *
 * Every build script fetches from the CFBD API into a local cache
 * (build/.cache, gitignored) so a rebuild is reproducible and offline-repeatable.
 *
 * The API key is read from the CFBD_KEY environment variable at build time and
 * must NEVER be committed to the repo.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const BUILD_DIR = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = path.join(BUILD_DIR, '..', 'data');
export const CACHE_DIR = path.join(BUILD_DIR, '.cache');

export const FIRST_SEASON = 2005;
export const LAST_SEASON = 2025;
export const SEASONS = Array.from(
  { length: LAST_SEASON - FIRST_SEASON + 1 },
  (_, i) => FIRST_SEASON + i,
);

export const POSITIONS = ['QB', 'RB', 'WR', 'TE'];

/** Below this many games the weekly variance estimate is noise. */
export const MIN_GAMES = 6;

// ─── names ──────────────────────────────────────────────────────────────────

/*
 * NAMES ARE PRINTED, SO THEY HAVE TO BE RIGHT. The API title-cases what it sends,
 * which is correct for almost every name and wrong for two shapes of it: a Scottish
 * or Irish Mc, which loses the capital on the syllable after it, and a Roman-numeral
 * suffix, which comes back as "Ii". Both are mechanical and both are fixed by rule
 * here rather than by listing the players they happen to hit, so a name that arrives
 * in a later season is fixed on the way in.
 *
 * OVERRIDES ARE THE OTHER KIND. A rule cannot know that a name is simply misspelled
 * at the source, so those are listed one at a time, keyed on exactly what arrives.
 * Keep this short and keep every entry checkable.
 */
const NAME_OVERRIDES = {
  /* Spelled Isiah. The stats feed has carried "Isaih" for every one of his four
     seasons, so it is the source and not one bad row. */
  'Isaih Pacheco': 'Isiah Pacheco',
};

export function fixName(name) {
  const raw = String(name || '').trim();
  if (!raw) return raw;
  if (NAME_OVERRIDES[raw]) return NAME_OVERRIDES[raw];
  return raw
    .split(/\s+/)
    .map((w) => {
      /* Mcmillan to McMillan. Left alone when the letter after Mc is already a capital,
         so a correctly cased name is never touched. */
      const mc = w.match(/^(Mc)([a-z])(.*)\.?$/);
      if (mc) return mc[1] + mc[2].toUpperCase() + mc[3];
      /* A trailing Roman numeral, which is a suffix and not a word. Bounded at eight so
         this can never fire on a name that merely starts with those letters. */
      if (/^(i{1,3}|iv|v|vi{1,3})$/i.test(w) && w.length <= 8) return w.toUpperCase();
      return w;
    })
    .join(' ');
}

/* Suffixes are not surnames. "Michael Penix Jr." is Penix, and a naive split on spaces
   makes him "Jr.", which is how the chemistry rail came to say "Sr. threw Robiskie 8
   touchdowns". Kept identical to lastName() in cfb/index.html on purpose: the label is
   baked at build time and the field chip is drawn at run time, and a player seeing two
   different surnames for one man would be right to trust neither. */
const SUFFIX = /^(jr|sr|ii|iii|iv|v)\.?$/i;

export function lastName(name) {
  const parts = String(name || '').trim().split(/\s+/).filter((w) => !SUFFIX.test(w));
  return parts[parts.length - 1] || String(name || '');
}

// ─── CFBD API ───────────────────────────────────────────────────────────────

const CFBD_BASE = 'https://api.collegefootballdata.com';

function cfbdKey() {
  const key = process.env.CFBD_KEY;
  if (!key) throw new Error('CFBD_KEY environment variable is required');
  return key;
}

/**
 * Fetch from the CFBD API with file-based caching.
 * `cacheName` is a unique filename for this request.
 */
export async function cfbdFetch(endpoint, params, cacheName) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const cached = path.join(CACHE_DIR, cacheName);
  if (fs.existsSync(cached) && fs.statSync(cached).size > 0) {
    return JSON.parse(fs.readFileSync(cached, 'utf8'));
  }
  const qs = new URLSearchParams(params).toString();
  const url = `${CFBD_BASE}${endpoint}${qs ? '?' + qs : ''}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${cfbdKey()}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`CFBD ${endpoint} ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  fs.writeFileSync(cached, JSON.stringify(data));
  return data;
}

/** Fetch with retry on transient failures (429, 5xx). */
export async function cfbdFetchRetry(endpoint, params, cacheName, retries = 3) {
  for (let i = 0; i <= retries; i++) {
    try {
      return await cfbdFetch(endpoint, params, cacheName);
    } catch (e) {
      const status = e.message.match(/CFBD .+ (\d+)/)?.[1];
      if (i < retries && (status === '429' || Number(status) >= 500)) {
        const wait = Math.pow(2, i + 1) * 1000;
        process.stderr.write(`  retry ${i + 1}/${retries} after ${wait}ms (${status})\n`);
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      throw e;
    }
  }
}

// ─── conferences & programs ─────────────────────────────────────────────────

/*
 * Power conferences across the 2005-2025 window. Conference realignment means
 * a program's conference changes over time; the API returns the conference as
 * it was that season, so we don't need to track historical membership here, 
 * we just need to know which conference NAMES count as "power".
 *
 * Notable G5 programs are individually allowlisted for seasons where they had
 * a historically significant run (undefeated, major bowl win, etc.).
 */
export const POWER_CONFERENCES = new Set([
  'SEC', 'Big Ten', 'Big 12', 'ACC', 'Pac-12', 'Pac-10',
  // Post-2024 realignment: Pac-12 contracted, some teams joined Big 12/Big Ten
  // The API returns the correct conference per season, so both names work.
]);

/**
 * Notable G5 team-seasons to include alongside Power conference teams.
 * These are historically significant seasons that a college football fan
 * would expect to see in the game (undefeated seasons, major bowl winners,
 * NY6 bowl appearances, etc.).
 */
export const NOTABLE_G5 = new Set([
  // Boise State
  'Boise State-2005', 'Boise State-2006', 'Boise State-2007', 'Boise State-2008',
  'Boise State-2009', 'Boise State-2010', 'Boise State-2011', 'Boise State-2014',
  'Boise State-2019', 'Boise State-2024',
  // UCF
  'UCF-2013', 'UCF-2017', 'UCF-2018',
  // Utah (before joining Pac-12 in 2011)
  'Utah-2005', 'Utah-2008', 'Utah-2009', 'Utah-2010',
  // TCU (before joining Big 12 in 2012)
  'TCU-2005', 'TCU-2006', 'TCU-2007', 'TCU-2008', 'TCU-2009', 'TCU-2010', 'TCU-2011',
  // Cincinnati
  'Cincinnati-2009', 'Cincinnati-2021',
  // Houston
  'Houston-2011', 'Houston-2015', 'Houston-2016',
  // Memphis
  'Memphis-2019',
  // Western Michigan
  'Western Michigan-2016',
  // Coastal Carolina
  'Coastal Carolina-2020',
  // Marshall
  'Marshall-2014',
  // Northern Illinois
  'Northern Illinois-2012',
  // Appalachian State
  'Appalachian State-2019',
  // San Diego State
  'San Diego State-2015',
  // Tulane
  'Tulane-2022',
  // Liberty
  'Liberty-2023',
  // James Madison
  'James Madison-2023',
  // UNLV
  'UNLV-2024',
  // Army
  'Army-2024',
  // Navy
  'Navy-2019',
  // SMU (before joining ACC)
  'SMU-2019', 'SMU-2022',
]);

/**
 * Whether a team-season should be in the drawable pool.
 * `conf` is the team's conference that season as returned by the CFBD API.
 * `school` is the full school name, `season` is the year.
 */
export function isDrawable(school, season, conf) {
  if (POWER_CONFERENCES.has(conf)) return true;
  if (conf === 'FBS Independents') {
    // Notre Dame and BYU are always included as independents
    if (school === 'Notre Dame' || school === 'BYU') return true;
  }
  return NOTABLE_G5.has(`${school}-${season}`);
}

// ─── CSV ────────────────────────────────────────────────────────────────────

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

// ─── stats ──────────────────────────────────────────────────────────────────

export const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;

export function stdev(a) {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1));
}

export function quantileSorted(sorted, q) {
  if (!sorted.length) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))));
  return sorted[i];
}

export const round = (v, dp = 2) => Number(v.toFixed(dp));

export function writePair(basename, rows, columns, csvRows, csvColumns) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const json = path.join(DATA_DIR, `${basename}.json`);
  const csv = path.join(DATA_DIR, `${basename}.csv`);
  fs.writeFileSync(json, JSON.stringify(rows));
  fs.writeFileSync(csv, toCSV(csvRows ?? rows, csvColumns ?? columns));
  return { json, csv, bytes: fs.statSync(json).size };
}
