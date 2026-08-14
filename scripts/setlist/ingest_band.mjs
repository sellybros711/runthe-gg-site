/* Segue — build a band CSV from elgoose.net.
 *
 *   node scripts/setlist/ingest_band.mjs               # → setlist/data/goose.csv
 *   node scripts/setlist/ingest_band.mjs --probe       # what does the API return?
 *   node scripts/setlist/ingest_band.mjs --out /tmp/goose.csv
 *   node scripts/setlist/ingest_band.mjs --limit 200   # last 200 shows only
 *   node scripts/setlist/ingest_band.mjs --from 2019 --to 2024
 *   node scripts/setlist/ingest_band.mjs --artist 8    # Orebolo instead of Goose
 *   node scripts/setlist/ingest_band.mjs --key XXXX    # or ELGOOSE_API_KEY
 *
 * START WITH --probe. It fetches one year, prints the field names the API
 * actually returns, and tells you whether the mapping below still holds. If a
 * full run produces a suspiciously small file or a sanity warning, probe first
 * and fix the pick() calls rather than guessing.
 *
 * Writes the columns named in setlist/data/DATA_CONTRACT.md, in that order.
 *
 * elgoose.net schema (verified against the live API — do not "fix" the field
 * names, they are deliberately unlike ours):
 *   show_id · showdate · song_id · songname · setnumber (NOT "set") · position
 *   tracktime ("mm:ss") · transition (" > " / " -> ") · isjamchart (0/1, on the
 *   row itself) · isoriginal (1 = original, 0 = cover) · original_artist ("" for
 *   originals) · venuename · city · state
 *
 * elgoose.net hosts MANY bands, not just Goose (Orebolo, Vasudo, Great Blue,
 * Umphrey's McGee, Dead & Company...). Two consequences, both learned the hard
 * way — the first version of this script tripped over both and silently wrote a
 * file that was half other people's shows and stopped in 2022:
 *   - Every response mixes artists. Rows MUST be filtered on artist_id
 *     (ARTIST_ID below, 1 = Goose) or the CSV is a mongrel.
 *   - The API caps ANY single response at ROW_CAP (4000) rows with no error and
 *     no next-page link — it just stops. /setlists.json and
 *     /setlists/artist_id/1.json both blow straight through that cap, so
 *     neither can ever return a complete history. Only the per-year route stays
 *     comfortably under it, which is why this fetches year by year.
 *
 * The API also rate-limits by returning an empty 200 rather than a 429, so a
 * bare loop silently drops whole years. getJSON retries empties with backoff.
 *
 * Three things the source schema forces:
 *   - No gap field exists. show_gap is COMPUTED as the number of shows between
 *     this play and the song's previous one (0 on debut).
 *   - No song ratings exist. crowd_rating is written BLANK; the game falls back
 *     to a neutral base (scoring.js NEUTRAL_BASE).
 *   - tracktime is on every row, so length is a strong per-version signal.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dir, '..', '..');

const API = 'https://elgoose.net/api/v2';

// Hard server-side cap on rows in a single response. Not documented and not
// signalled in the payload — the array just ends. Any response landing on this
// number exactly should be treated as truncated, not complete.
const ROW_CAP = 4000;

// Gap between year requests. The whole run is ~13 requests, so this costs a few
// seconds and is the difference between a complete file and a silently short one.
const YEAR_DELAY_MS = 600;

// ── tag thresholds ───────────────────────────────────────────────────────────
// elgoose carries no "this song is a ballad" field, so the six tags the game
// scores against are inferred from each song's own history. These are proxies,
// not ground truth — tune them here and regenerate.
const TAGS = {
  MIN_PLAYS: 3,          // below this a song has no role tags at all
  OPENER_RATE: 0.20,     // opens a set this often → 'opener'
  CLOSER_RATE: 0.20,     // closes a set this often → 'closer'
  ENCORE_RATE: 0.20,     // lands in an encore this often → 'encore'
  ENCORE_MIN_PLAYS: 2,   // encores are rare; allow a lower bar
  JAM_RATE: 0.15,        // jamcharted this often → 'jam'
  JAM_MEDIAN_LEN: 900,   // ...or typically runs 15 min+
  PEAK_JAM_RATE: 0.25,   // the big ones: jamcharted often AND long
  PEAK_MEDIAN_LEN: 720,
  BALLAD_MEDIAN_LEN: 330, // typically under 5:30, never jamcharted → 'ballad'
  BALLAD_MAX_CLOSER_RATE: 0.10,
};

// ── args ─────────────────────────────────────────────────────────────────────
function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const OUT = resolve(repoRoot, arg('out', 'setlist/data/goose.csv'));
const LIMIT = Number(arg('limit', 0)) || 0;
const KEY = arg('key', process.env.ELGOOSE_API_KEY || '');
const FROM = Number(arg('from', 2014));   // Goose's first setlist on the site is 2014
const TO = Number(arg('to', new Date().getFullYear()));
const PROBE = process.argv.includes('--probe');

/* ---------------------------------------------------------------------------
 * --strict : every warning becomes a failure.
 * ---------------------------------------------------------------------------
 * FOR UNATTENDED RUNS, and it exists because this script's whole degraded-output
 * story is `console.warn` followed by writing the file and exiting 0. That is
 * right for a person, who reads the output and decides. It is exactly wrong for
 * a scheduled job, which reads nothing: a throttled year, a truncated year or a
 * jamchart outage would each commit a quietly broken CSV over a good one.
 *
 * The three that matter, all of which the header already documents as real:
 *   - a year that failed or came back empty. The API throttles by answering an
 *     empty 200 rather than a 429, so this is the common one, and it silently
 *     removes a whole year of shows.
 *   - a year that hit the 4000-row cap. The array just ends; the year is
 *     incomplete and nothing in the payload says so.
 *   - jamcharts unavailable. crowd_rating goes blank, which means every song
 *     scores identically. That is the exact bug v2 shipped with.
 *
 * Collected rather than thrown at the point of failure, so one run reports
 * everything wrong with it instead of one thing at a time.
 */
const STRICT = process.argv.includes('--strict');
const degraded = [];
const degrade = (msg) => { degraded.push(msg); console.warn(`  ${msg}`); };

// elgoose artist ids: 1 Goose · 8 Orebolo · 2 Vasudo · 3 Great Blue.
// Pass --artist '' to keep every band (almost never what you want).
const ARTIST_ID = String(arg('artist', '1')).trim();

// ── fetch ────────────────────────────────────────────────────────────────────
function withKey(url) {
  if (!KEY) return url;
  return url + (url.includes('?') ? '&' : '?') + `apikey=${encodeURIComponent(KEY)}`;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchOnce(url) {
  let res;
  try {
    res = await fetch(withKey(url), { headers: { accept: 'application/json' } });
  } catch (e) {
    throw new Error(`network: ${e.message} — ${url}`);
  }
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${url}`);

  const text = await res.text();
  let body;
  try { body = JSON.parse(text); }
  catch { throw new Error(`not JSON (got ${text.slice(0, 60).replace(/\s+/g, ' ')}…) — ${url}`); }

  // elgoose wraps results as { error, error_message, data }. Some endpoints
  // return a bare array. Accept either, and treat error:true as fatal.
  if (body && body.error && body.error !== '0' && body.error_message) {
    throw new Error(`API said: ${body.error_message} — ${url}`);
  }
  const data = Array.isArray(body) ? body : body && (body.data || body.setlists);
  if (!Array.isArray(data)) {
    throw new Error(`unexpected payload shape (keys: ${Object.keys(body || {}).join(', ') || 'none'}) — ${url}`);
  }
  return data;
}

/**
 * fetchOnce with backoff.
 *
 * The API throttles by handing back an empty 200 instead of a 429, so an empty
 * array is retried like an error when the caller says a year should have rows.
 * Without this, a clean-looking run quietly loses whole years — 2021, 2023 and
 * 2025 all came back empty on one pass and full on the next.
 */
async function getJSON(url, { tries = 6, retryEmpty = false } = {}) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    if (i) await sleep(1000 * 2 ** (i - 1));   // 1s, 2s, 4s, 8s, 16s
    try {
      const data = await fetchOnce(url);
      if (data.length || !retryEmpty) return data;
      lastErr = new Error(`empty response (likely throttled) — ${url}`);
    } catch (e) {
      lastErr = e;
    }
  }
  if (retryEmpty) return [];   // caller reports the gap in context
  throw lastErr;
}

/**
 * Every setlist row the site has for ARTIST_ID, fetched year by year.
 *
 * Deliberately NOT using /setlists.json or /setlists/artist_id/<id>.json: both
 * exceed ROW_CAP for Goose and get silently truncated (the bulk route returns
 * 4000 rows of 18 different bands ending in 2022). Per-year is the only route
 * whose responses stay under the cap, and each year is checked against it so a
 * future band that outgrows it fails loudly instead of quietly.
 */
async function fetchAllRows() {
  const out = [];
  const failures = [];
  const empty = [];
  const truncated = [];

  for (let y = FROM; y <= TO; y++) {
    // Pace the loop. Fired back to back, the API starts returning empty 200s
    // around the tenth request and the backoff alone cannot dig out of it.
    if (y > FROM) await sleep(YEAR_DELAY_MS);
    try {
      // Years in range are expected to have shows, so retry an empty response.
      const rows = await getJSON(`${API}/setlists/showyear/${y}.json`, { retryEmpty: true });
      if (!rows.length) { empty.push(y); console.warn(`  ${y}: 0 rows after retries`); continue; }
      if (rows.length >= ROW_CAP) truncated.push(y);

      const mine = ARTIST_ID ? rows.filter(r => String(r.artist_id) === ARTIST_ID) : rows;
      out.push(...mine);
      console.log(
        `  ${y}: ${String(mine.length).padStart(4)} rows` +
        (ARTIST_ID ? ` (of ${rows.length} across all artists)` : '') +
        (rows.length >= ROW_CAP ? '  <-- AT ROW CAP, TRUNCATED' : '')
      );
    } catch (e) {
      failures.push(y);
      console.warn(`  ${y}: ${e.message}`);
    }
  }

  const span = TO - FROM + 1;
  if (failures.length + empty.length === span) {
    throw new Error(
      `every year from ${FROM} to ${TO} came back empty or failed. The endpoint ` +
      `shape has probably changed — run with --probe to see what the API returns.`
    );
  }
  if (failures.length) degrade(`${failures.length} year(s) failed: ${failures.join(', ')}`);
  if (empty.length) {
    degrade(`${empty.length} year(s) returned nothing: ${empty.join(', ')}`);
    console.warn('  If the band was active then, this is throttling — just run it again.');
  }
  if (truncated.length) {
    degrade(`${truncated.join(', ')} hit the ${ROW_CAP}-row cap and are INCOMPLETE.`);
    console.warn('  Split those years further (the API has no paging) before trusting the file.');
  }
  if (ARTIST_ID && !out.length) {
    throw new Error(
      `rows were returned but none had artist_id ${ARTIST_ID}. Check the id ` +
      `(--artist) — run --probe to see which artists the API is serving.`
    );
  }
  return out;
}

/**
 * The community jamcharts: which performances the curators wrote up, which they
 * flagged "recommended", and the note explaining why. One small endpoint for
 * the whole archive, joined back onto the setlist rows by uniqueid.
 *
 * A failure here degrades rather than breaks — the CSV still builds, just
 * without the esteem ratings and the notes, so it says so loudly.
 */
async function fetchJamcharts() {
  const map = new Map();
  try {
    const rows = await getJSON(`${API}/jamcharts.json`, { retryEmpty: true });
    const mine = ARTIST_ID ? rows.filter(r => String(r.artist_id) === ARTIST_ID) : rows;
    for (const r of mine) {
      map.set(String(r.uniqueid), {
        recommended: String(r.isrecommended) === '1',
        note: decodeEntities(r.jamchartnote || '').replace(/\s+/g, ' ').trim(),
      });
    }
    console.log(`  ${map.size} jamchart entries`);
  } catch (e) {
    degrade(`jamcharts unavailable (${e.message})`);
    console.warn('  crowd_rating and jamchart_note will be blank — scoring falls back to neutral.');
  }
  return map;
}

/**
 * Print what the API actually returns for one year, without writing anything.
 * The fastest way to find out whether the field mapping below still holds.
 */
async function probe() {
  const year = Number(arg('probe-year', TO - 1));
  const url = `${API}/setlists/showyear/${year}.json`;
  console.log(`Probing ${url}\n`);
  const rows = await getJSON(url, { retryEmpty: true });
  console.log(`${rows.length} rows returned.${rows.length >= ROW_CAP ? '  <-- AT ROW CAP, TRUNCATED' : ''}\n`);
  if (!rows.length) return;

  // Which bands are in here? Every response mixes them, so this is the check
  // that matters most before trusting a run.
  const byArtist = new Map();
  for (const r of rows) {
    const k = `${r.artist_id} ${r.artist}`;
    byArtist.set(k, (byArtist.get(k) || 0) + 1);
  }
  console.log(`Artists in this response (filtering on artist_id ${ARTIST_ID || '— none, keeping all'}):`);
  for (const [k, n] of [...byArtist].sort((a, b) => b[1] - a[1])) {
    const id = k.split(' ')[0];
    console.log(`  ${String(n).padStart(4)}  ${k}${id === ARTIST_ID ? '   <-- kept' : ''}`);
  }
  console.log();

  console.log('Field names on the first row:');
  console.log('  ' + Object.keys(rows[0]).join('\n  '));
  console.log('\nFirst row verbatim:');
  console.log(JSON.stringify(rows[0], null, 2));

  const need = ['show_id', 'showdate', 'song_id', 'songname', 'setnumber', 'position',
                'tracktime', 'transition', 'isjamchart', 'isoriginal', 'venuename', 'artist_id'];
  const missing = need.filter(f => !(f in rows[0]));
  console.log(missing.length
    ? `\nMISSING expected fields: ${missing.join(', ')}\n` +
      `Update the pick() calls in main() to the names listed above.`
    : '\nAll expected fields present — the mapping in this script still holds.');
}

/** Warn loudly when a column came out empty across the board. */
function sanityCheck(rows) {
  const checks = [
    ['venue', r => r.venue],
    ['length_sec', r => r.length_sec],
    ['song_id', r => r.song_id],
    ['set', r => r.set],
  ];
  const notes = [];
  for (const [name, get] of checks) {
    const filled = rows.filter(r => get(r) !== '' && get(r) !== undefined).length;
    const pct = rows.length ? Math.round(filled / rows.length * 100) : 0;
    if (pct < 50) notes.push(`  ${name}: only ${pct}% of rows have a value`);
  }
  const jamcharts = rows.filter(r => r.is_jamchart === 'true').length;
  const segues = rows.filter(r => r.is_segue === 'true').length;
  if (!jamcharts) notes.push('  is_jamchart: no row is flagged — check the isjamchart field name');
  if (!segues) notes.push('  is_segue: no row is flagged — check the transition field name');

  if (notes.length) {
    console.warn('\nSANITY CHECK — these columns look wrong, the CSV may be degraded:');
    notes.forEach(n => degraded.push(n.trim()) || console.warn(n));
    console.warn('Run with --probe to compare against the live field names.');
  } else {
    console.log('  sanity check passed — venue, length, jamcharts and segues all present');
  }
}

// ── field helpers ────────────────────────────────────────────────────────────

/**
 * The API returns HTML-encoded text ("Thompson&#039;s Point", "The Hollow Bar
 * &amp; Kitchen"). Left alone it reaches the CSV verbatim and the UI escapes the
 * ampersand a second time, so a player literally reads "Bar &amp; Kitchen".
 * The contract says these columns hold display text, so decode here — one pass,
 * so a decoded "&" can never be re-read as the start of another entity.
 */
function decodeEntities(s) {
  const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  return String(s == null ? '' : s).replace(
    /&(?:#(\d+)|#[xX]([0-9a-fA-F]+)|([a-zA-Z]+));/g,
    (m, dec, hex, name) => {
      if (dec) return String.fromCodePoint(Number(dec));
      if (hex) return String.fromCodePoint(parseInt(hex, 16));
      return name.toLowerCase() in named ? named[name.toLowerCase()] : m;
    }
  );
}

const pick = (row, ...names) => {
  for (const n of names) {
    const v = row[n];
    if (v !== undefined && v !== null && v !== '') return decodeEntities(v);
  }
  return '';
};

function toSeconds(tracktime) {
  const s = String(tracktime || '').trim();
  if (!s) return '';
  const parts = s.split(':').map(Number);
  if (parts.some(Number.isNaN)) return '';
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return '';
}

/** elgoose setnumber: 1/2/3 for sets, 'e'/'E'/'encore' for encores. */
function normaliseSet(setnumber) {
  const s = String(setnumber == null ? '' : setnumber).trim();
  if (!s) return '1';
  if (/^e/i.test(s)) {
    const n = s.replace(/[^0-9]/g, '');
    return n && n !== '1' ? `E${n}` : 'E';
  }
  return s;
}

/** " > " and " -> " are segues; ", " is not. */
function isSegue(transition) {
  const t = String(transition || '').trim();
  return t === '>' || t === '->' || t === '→';
}

const truthy = v => v === 1 || v === '1' || v === true || v === 'true';

function median(nums) {
  const a = nums.filter(n => Number.isFinite(n) && n > 0).sort((x, y) => x - y);
  if (!a.length) return 0;
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : Math.round((a[m - 1] + a[m]) / 2);
}

// ── song esteem → crowd_rating ───────────────────────────────────────────────
/*
 * crowd_rating is the game's "how much do people treasure this song" number,
 * with NEUTRAL_ESTEEM meaning ordinary. elgoose publishes no song ratings, so
 * it is derived from the community's own jamcharts: how many versions of a song
 * the curators wrote up, and how many of those they flagged "recommended".
 *
 * Checked against the fan Jam of the Year brackets (six annual community-voted
 * events): of the nine songs known to have won or been most-nominated, eight
 * land in the top 18 of the 91 charted songs. The outlier is A Western Sun,
 * which won in 2021 and has been played far less since. That is close enough to
 * treat jamchart standing as a stand-in for fan esteem — and unlike the
 * brackets, which live in PDFs on sites that block automated fetching, it comes
 * down the same API as everything else and refreshes with the data.
 */
export const NEUTRAL_ESTEEM = 30;   // must match scoring.js NEUTRAL_BASE
const ESTEEM_MAX = 75;              // the very top of the jamcharts
const ESTEEM_REC_WEIGHT = 2;        // a "recommended" version counts double

function esteemBySong(rows) {
  const tally = new Map();
  for (const r of rows) {
    if (r.is_jamchart !== 'true') continue;
    if (!tally.has(r.song_id)) tally.set(r.song_id, 0);
    tally.set(r.song_id, tally.get(r.song_id) + 1 + (r.is_recommended === 'true' ? ESTEEM_REC_WEIGHT : 0));
  }
  // Rank-free scaling: the top song sets the ceiling, everything else lands in
  // proportion. Songs the curators never wrote up stay neutral rather than
  // being punished — plenty of well-loved songs are simply not jam vehicles.
  const top = Math.max(1, ...tally.values());
  const out = new Map();
  for (const [id, n] of tally) {
    out.set(id, Math.round(NEUTRAL_ESTEEM + (ESTEEM_MAX - NEUTRAL_ESTEEM) * Math.sqrt(n / top)));
  }
  return out;
}

function rarityTier(gap) {
  const g = Number(gap) || 0;
  if (g >= 100) return 50;
  if (g >= 50) return 35;
  if (g >= 20) return 20;
  if (g >= 8) return 10;
  return 0;
}

// ── CSV writing ──────────────────────────────────────────────────────────────
const COLUMNS = [
  'show_id', 'show_date', 'year', 'venue', 'city', 'state', 'set', 'position',
  'song', 'song_id', 'is_cover', 'original_artist', 'length_sec', 'show_gap',
  'times_played', 'rarity_rating', 'crowd_rating', 'is_jamchart', 'is_recommended',
  'jamchart_note', 'transition', 'is_segue', 'tags',
];

function csvCell(v) {
  const s = v === undefined || v === null ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// ── transform ────────────────────────────────────────────────────────────────
/**
 * Raw elgoose-shaped rows → the CSV text described in DATA_CONTRACT.md.
 * Exported so the sample-data generator runs through this exact pipeline
 * rather than a second copy of the gap/tag rules.
 *
 * @param {Array<object>} raw   rows using elgoose field names
 * @param {{limit?: number, quiet?: boolean}} [opts]
 * @returns {{csv: string, shows: number, performances: number, songs: number}}
 */
export function buildCSV(raw, opts = {}) {
  const limit = opts.limit || 0;
  const say = opts.quiet ? () => {} : (...a) => console.log(...a);
  const jamcharts = opts.jamcharts || new Map();

  // Normalise into our shape, dropping rows with nothing to key on.
  const rows = [];
  for (const r of raw) {
    const showId = pick(r, 'show_id', 'showid');
    const date = String(pick(r, 'showdate', 'show_date')).slice(0, 10);
    const song = pick(r, 'songname', 'song');
    if (!showId || !date || !song) continue;

    // Jamchart curation for THIS performance, keyed on the row's uniqueid.
    const jc = jamcharts.get(String(pick(r, 'uniqueid'))) || null;

    rows.push({
      show_id: String(showId),
      show_date: date,
      year: date.slice(0, 4),
      venue: pick(r, 'venuename', 'venue'),
      city: pick(r, 'city'),
      state: pick(r, 'state'),
      set: normaliseSet(pick(r, 'setnumber', 'set')),
      position: Number(pick(r, 'position')) || 0,
      song: String(song),
      song_id: String(pick(r, 'song_id', 'songid') || song.toLowerCase().replace(/[^a-z0-9]+/g, '-')),
      is_cover: truthy(r.isoriginal) ? 'false' : 'true',
      original_artist: pick(r, 'original_artist', 'originalartist'),
      length_sec: toSeconds(pick(r, 'tracktime', 'duration')),
      is_jamchart: truthy(r.isjamchart) ? 'true' : 'false',
      is_recommended: jc && jc.recommended ? 'true' : 'false',
      jamchart_note: jc ? jc.note : '',
      transition: String(pick(r, 'transition') || '').trim(),
    });
  }
  rows.forEach(r => { r.is_segue = isSegue(r.transition) ? 'true' : 'false'; });
  if (!opts.quiet) sanityCheck(rows);

  // Group into shows, ordered by date; songs ordered by set then position.
  const setRank = s => (/^E/i.test(s) ? 99 + (Number(s.slice(1)) || 0) : Number(s) || 0);
  const byShow = new Map();
  for (const r of rows) {
    if (!byShow.has(r.show_id)) byShow.set(r.show_id, []);
    byShow.get(r.show_id).push(r);
  }
  let shows = Array.from(byShow.entries())
    .map(([show_id, songs]) => ({
      show_id,
      show_date: songs[0].show_date,
      songs: songs.sort((a, b) => (setRank(a.set) - setRank(b.set)) || (a.position - b.position)),
    }))
    .sort((a, b) => a.show_date.localeCompare(b.show_date));

  if (limit) shows = shows.slice(-limit);
  say(`  ${shows.length} shows`);

  // Pass 1 — per-song history: gap, play count, and the stats tags derive from.
  const stats = new Map();  // song_id → aggregate
  const lastShowIdx = new Map();

  shows.forEach((show, showIdx) => {
    // A song played twice in one night still counts once for gap purposes.
    const seenTonight = new Set();

    show.songs.forEach((r, idx) => {
      const id = r.song_id;

      if (!stats.has(id)) {
        stats.set(id, { plays: 0, setPlays: 0, opens: 0, closes: 0, encores: 0, jams: 0, lengths: [] });
      }
      const st = stats.get(id);

      // gap = shows between this play and the previous one; 0 on debut.
      if (!seenTonight.has(id)) {
        const prev = lastShowIdx.get(id);
        r.show_gap = prev === undefined ? 0 : Math.max(0, showIdx - prev - 1);
        lastShowIdx.set(id, showIdx);
        seenTonight.add(id);
      } else {
        r.show_gap = 0;
      }

      st.plays += 1;
      r.times_played = st.plays;
      r.rarity_rating = rarityTier(r.show_gap);

      // Role stats: is this the first/last song of its set?
      // Encores are excluded — they are usually a single song, which would
      // otherwise read as both an opener and a closer and tag every encore
      // staple as both.
      const isEncore = /^E/i.test(r.set);
      if (isEncore) {
        st.encores += 1;
      } else {
        const prevRow = show.songs[idx - 1];
        const nextRow = show.songs[idx + 1];
        if (!prevRow || prevRow.set !== r.set) st.opens += 1;
        if (!nextRow || nextRow.set !== r.set) st.closes += 1;
        st.setPlays += 1;
      }
      if (r.is_jamchart === 'true') st.jams += 1;
      const len = Number(r.length_sec);
      if (Number.isFinite(len) && len > 0) st.lengths.push(len);
    });
  });

  // Pass 2 — tags, per song, from the whole history.
  const tagsFor = new Map();
  for (const [id, st] of stats) {
    const t = [];
    const rate = n => (st.plays ? n / st.plays : 0);
    // Opener/closer are rates over non-encore plays only.
    const setRate = n => (st.setPlays ? n / st.setPlays : 0);
    const medLen = median(st.lengths);
    const jamRate = rate(st.jams);
    const closerRate = setRate(st.closes);

    if (st.plays >= TAGS.MIN_PLAYS) {
      if (setRate(st.opens) >= TAGS.OPENER_RATE) t.push('opener');
      if (closerRate >= TAGS.CLOSER_RATE) t.push('closer');
      if (jamRate >= TAGS.JAM_RATE || medLen >= TAGS.JAM_MEDIAN_LEN) t.push('jam');
      if (jamRate >= TAGS.PEAK_JAM_RATE && medLen >= TAGS.PEAK_MEDIAN_LEN) t.push('peak');
      if (medLen > 0 && medLen <= TAGS.BALLAD_MEDIAN_LEN && st.jams === 0
          && closerRate < TAGS.BALLAD_MAX_CLOSER_RATE) t.push('ballad');
    }
    if (st.plays >= TAGS.ENCORE_MIN_PLAYS && rate(st.encores) >= TAGS.ENCORE_RATE) t.push('encore');

    tagsFor.set(id, t.join('|'));
  }

  // Write.
  const esteem = esteemBySong(rows);
  const out = [COLUMNS.join(',')];
  let performances = 0;
  for (const show of shows) {
    for (const r of show.songs) {
      r.tags = tagsFor.get(r.song_id) || '';
      r.crowd_rating = esteem.get(r.song_id) || '';   // blank → scoring's neutral
      out.push(COLUMNS.map(c => csvCell(r[c])).join(','));
      performances += 1;
    }
  }

  const tagged = Array.from(tagsFor.values()).filter(Boolean).length;
  say(`  ${tagged} of ${stats.size} songs carry at least one tag`);
  const rec = rows.filter(r => r.is_recommended === 'true').length;
  say(`  ${esteem.size} songs carry a jamchart-derived esteem rating`);
  say(`  ${rows.filter(r => r.is_jamchart === 'true').length} jamcharted versions, ${rec} of them "recommended"`);

  return {
    csv: out.join('\n') + '\n',
    shows: shows.length,
    performances,
    songs: stats.size,
  };
}

// ── main ─────────────────────────────────────────────────────────────────────
async function main() {
  if (PROBE) return probe();

  console.log(`Fetching setlists from elgoose.net (artist_id ${ARTIST_ID || 'all'}, ${FROM}–${TO})...`);
  const raw = await fetchAllRows();
  if (!raw.length) throw new Error('No rows returned — nothing to write.');
  console.log(`  ${raw.length} raw rows`);

  const jamcharts = await fetchJamcharts();
  const { csv, shows, performances, songs } = buildCSV(raw, { limit: LIMIT, jamcharts });

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, csv, 'utf8');

  console.log(`\nWrote ${OUT}`);
  console.log(`  ${performances} performances · ${shows} shows · ${songs} distinct songs`);

  // Measured against the live API in Aug 2026, Goose only, 2014–2026. The site
  // lists ~855 Goose shows but only ~655 carry a setlist (the rest are
  // announced-but-unplayed dates), so shows-with-songs is the number to watch.
  if (ARTIST_ID === '1' && !LIMIT) {
    console.log('\nExpect roughly 7.5k performances across ~655 shows for Goose.');
    if (performances < 6000 || shows < 550) {
      console.warn('That is well short — a year was probably throttled. Re-run; it is not sticky.');
    }
  }
  console.log('If the counts are far off, run with --probe before trusting the file.');
}

// Only fetch when run directly — importing this file just gets buildCSV.
if (import.meta.url === `file://${process.argv[1]}`) {
  main()
    .then(() => {
      /* THE FILE IS ALREADY WRITTEN by the time this runs, and that is
         deliberate: a human running without --strict still wants the partial
         file to look at. Under --strict the non-zero exit is what stops the
         caller committing it, and the workflow leaves the working tree dirty
         and untouched rather than trying to undo the write. */
      if (STRICT && degraded.length) {
        console.error(`\nFailed: --strict, and this run was degraded:`);
        degraded.forEach(d => console.error(`  - ${d}`));
        console.error('\nThe file was written but should NOT be committed. ' +
          'Most of these are throttling; run it again.');
        process.exit(1);
      }
    })
    .catch(e => { console.error(`\nFailed: ${e.message}`); process.exit(1); });
}
