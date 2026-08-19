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
        /* The curators' note about the night. Written on ONE row of the show
           rather than all eleven (see COLUMNS in ingest_band.mjs: repeating it
           costs 436KB raw), so it is hoisted here by scanning for whichever row
           carries it. Nothing depends on that being the first. */
        notes: '',
      });
    }
    const show = byShow.get(r.show_id);
    if (!show.notes && r.show_notes) show.notes = r.show_notes;
    show.songs.push(r);
  }

  const shows = Array.from(byShow.values());

  /* Multi-night runs. A third of this band's shows are one night of two or
     more at the same venue, and "night 2 of 3" is how anybody who was there
     would describe it — the second night of a run is a different thing from a
     one-off, and players who know the band know it. Consecutive calendar
     dates at the same venue, which is what a run is. */
  {
    const key = s => `${s.venue}|${s.city}|${s.state}`;
    const day = d => Math.floor(Date.parse(`${d}T00:00:00Z`) / 86400000);
    const byVenue = new Map();
    for (const s of shows) {
      if (!s.venue) continue;
      if (!byVenue.has(key(s))) byVenue.set(key(s), []);
      byVenue.get(key(s)).push(s);
    }
    for (const list of byVenue.values()) {
      list.sort((a, b) => String(a.show_date).localeCompare(String(b.show_date)));
      let i = 0;
      while (i < list.length) {
        let j = i;
        while (j + 1 < list.length && day(list[j + 1].show_date) === day(list[j].show_date) + 1) j++;
        const of = j - i + 1;
        if (of > 1) for (let k = i; k <= j; k++) list[k].run = { night: k - i + 1, of };
        i = j + 1;
      }
    }
  }

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
  // ...and how many times. 1210 of the band's 1440 pairs have happened exactly
  // once, but Seekers pt I > pt II has happened 56 times because that is how
  // the song is written. Scoring needs to tell those apart.
  const segueCounts = new Map();
  for (const show of shows) {
    const s = show.songs;
    for (let i = 0; i < s.length - 1; i++) {
      if (s[i].is_segue !== 'true' && s[i].is_segue !== '1') continue;
      // Only within the same set — a set break is never a segue.
      if (setRank(s[i].set) !== setRank(s[i + 1].set)) continue;
      const key = `${s[i].song_id}|${s[i + 1].song_id}`;
      segues.add(key);
      segueCounts.set(key, (segueCounts.get(key) || 0) + 1);
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

  /* ---------------------------------------------------------------------
   * WHICH VERSION THIS IS, which is the thing the game is actually about.
   * ---------------------------------------------------------------------
   * You do not pick "Echo of a Rose". You pick the one from a particular
   * night, and across 114 plays that song runs anywhere from 1:00 to 44:24.
   * Measured across the 166 songs with five or more plays, the longest
   * version of a song is a MEDIAN of 2.7 times the shortest, and 13.8 times
   * at the 90th percentile. "You played Echo of a Rose" says almost nothing;
   * "you played the 44 minute one" is the whole story.
   *
   * So every performance learns where it sits among its own siblings: its
   * rank by length, out of how many. Computed once here, off the same rows
   * the rest of the loader walks, rather than by the UI on every render.
   *
   * Rank 1 is the LONGEST. Songs played once get {rank:1, of:1}, which the UI
   * reads as "nothing to compare it to" rather than "the best ever".
   */
  const byySong = new Map();
  for (const show of shows) {
    for (const p of show.songs) {
      const len = Number(p.length_sec) || 0;
      if (!p.song_id || !len) continue;
      if (!byySong.has(p.song_id)) byySong.set(p.song_id, []);
      byySong.get(p.song_id).push(p);
    }
  }
  for (const takes of byySong.values()) {
    takes.sort((a, b) => (Number(b.length_sec) || 0) - (Number(a.length_sec) || 0));
    const of = takes.length;
    const med = Number(takes[Math.floor(of / 2)].length_sec) || 0;
    /* TIES SHARE A RANK, so two identical 8:12 takes are both "4th of 30"
       rather than one of them being arbitrarily 5th. */
    let rank = 0, prev = null;
    takes.forEach((p, i) => {
      const len = Number(p.length_sec) || 0;
      if (len !== prev) { rank = i + 1; prev = len; }
      p.version_rank = rank;
      p.version_of = of;
      /* THE TYPICAL LENGTH, so a rank can gain a feel. "3rd longest of 60"
         says where it sits; "usually 19:46, you got 29:38" says what that
         MEANS. Median rather than mean because a single 44-minute outlier
         drags an average somewhere no real version lives. */
      p.version_median = med;
    });
  }

  return { shows, segues, segueCounts, partners, performances: rows.length };
}

export default loadBand;
