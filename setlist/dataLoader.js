/* Segue — band CSV → { shows, segues }.
 *
 * The CSV is the single source of truth for the game. Columns and their
 * meanings are fixed by data/DATA_CONTRACT.md; scripts/setlist/ingest_band.mjs
 * writes them. Column ORDER in the file does not matter here (we read by
 * header name), but the ingester keeps it stable anyway.
 *
 * No PapaParse: this repo has no bundler, and song titles routinely carry
 * commas and quotes ("Hot Tea", 'Arrow > Madhuvan'), so the parser below is a
 * real RFC 4180 one rather than a split(',').
 */

/**
 * Parse RFC 4180 CSV into an array of row objects keyed by the header row.
 * Handles quoted fields containing commas, newlines and doubled quotes.
 */
export function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  let i = 0;

  // Strip a UTF-8 BOM and normalise line endings up front.
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

  while (i < text.length) {
    const c = text[i];

    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        quoted = false; i++; continue;
      }
      field += c; i++; continue;
    }

    if (c === '"') { quoted = true; i++; continue; }
    if (c === ',') { row.push(field); field = ''; i++; continue; }
    if (c === '\r') { i++; continue; }
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }

    field += c; i++;
  }
  // Last field / row, if the file did not end with a newline.
  if (field !== '' || row.length) { row.push(field); rows.push(row); }

  if (!rows.length) return [];
  const header = rows[0].map(h => h.trim());
  const out = [];
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    // Skip blank trailing lines.
    if (cells.length === 1 && cells[0] === '') continue;
    const obj = {};
    for (let c = 0; c < header.length; c++) obj[header[c]] = cells[c] === undefined ? '' : cells[c];
    out.push(obj);
  }
  return out;
}

/** Sort key for a set: numbered sets in order, encores last. */
export function setRank(set) {
  const s = String(set || '').trim().toUpperCase();
  if (!s) return 0;
  if (s.startsWith('E')) return 99 + (Number(s.slice(1)) || 0);
  return Number(s) || 0;
}

/** Human label for a set key: '1' → 'Set I', 'E' → 'Encore'. */
export function setLabel(set) {
  const s = String(set || '').trim().toUpperCase();
  if (s.startsWith('E')) return s.length > 1 ? `Encore ${s.slice(1)}` : 'Encore';
  const roman = { '1': 'I', '2': 'II', '3': 'III', '4': 'IV' }[s];
  return roman ? `Set ${roman}` : `Set ${s}`;
}

/**
 * Build the game's view of a band's history.
 *
 * @param {string} csvText raw contents of e.g. data/goose.csv
 * @returns {{shows: Array, segues: Set<string>, partners: Map, performances: number}}
 *   shows — one entry per concert, songs in running order across all sets
 *   segues — canonical "songIdA|songIdB" pairs the band has actually played
 *            back-to-back with a segue transition
 */
export function loadBand(csvText) {
  const rows = parseCSV(csvText);
  const byShow = new Map();

  for (const r of rows) {
    if (!r.show_id) continue;
    if (!byShow.has(r.show_id)) {
      byShow.set(r.show_id, {
        show_id: r.show_id,
        show_date: r.show_date,
        year: r.year,
        venue: r.venue,
        city: r.city,
        state: r.state,
        songs: [],
      });
    }
    byShow.get(r.show_id).songs.push(r);
  }

  const shows = Array.from(byShow.values());

  for (const show of shows) {
    // Running order: by set, then by position within the set.
    show.songs.sort((a, b) => {
      const d = setRank(a.set) - setRank(b.set);
      return d !== 0 ? d : (Number(a.position) || 0) - (Number(b.position) || 0);
    });
  }
  shows.sort((a, b) => String(a.show_date).localeCompare(String(b.show_date)));

  // A segue is canonical if the band has ever played A directly into B with a
  // segue transition. Collected across the whole history, not per show.
  const segues = new Set();
  for (const show of shows) {
    const s = show.songs;
    for (let i = 0; i < s.length - 1; i++) {
      if (s[i].is_segue !== 'true' && s[i].is_segue !== '1') continue;
      // Only within the same set — a set break is never a segue.
      if (setRank(s[i].set) !== setRank(s[i + 1].set)) continue;
      segues.add(`${s[i].song_id}|${s[i + 1].song_id}`);
      // Remember what THIS take ran into, so the draft screen can show a player
      // "Drive > Bob Don" rather than an unexplained arrow. A segue is only
      // findable if you know what you are looking for.
      s[i].segued_into = s[i + 1].song;
      s[i].segued_into_id = s[i + 1].song_id;
    }
  }

  // Every song a given song has ever run into, so the game can tell a player
  // which of tonight's songs would finish the segue they started.
  const partners = new Map();
  for (const key of segues) {
    const [a, b] = key.split('|');
    if (!partners.has(a)) partners.set(a, new Set());
    partners.get(a).add(b);
  }

  return { shows, segues, partners, performances: rows.length };
}

export default loadBand;
