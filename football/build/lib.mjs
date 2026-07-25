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
