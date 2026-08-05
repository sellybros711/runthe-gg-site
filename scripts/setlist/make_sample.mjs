/* Run The Setlist — synthetic sample data.
 *
 *   node scripts/setlist/make_sample.mjs      # → setlist/data/sample.csv
 *
 * This is INVENTED data for a band that does not exist. It exists so the game
 * is playable and the CSV → dataLoader → scoring pipeline is testable without
 * the real band data. It is never presented to players as real: the band is
 * labelled "Sample Band (test data)" in the picker.
 *
 * It runs through buildCSV() from ingest_band.mjs, so the gap, segue and tag
 * rules exercised here are the same ones the real ingester applies.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCSV } from './ingest_band.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dir, '..', '..', 'setlist', 'data', 'sample.csv');

// Deterministic RNG so regenerating gives byte-identical output.
function mulberry32(a) {
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(20260804);
const pickOne = arr => arr[Math.floor(rng() * arr.length)];
const between = (lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));

/* Songs, with the *behaviour* each one should end up exhibiting. The tags in
   the output are still derived by buildCSV from the generated history — this
   table only shapes how each song tends to get played. */
const SONGS = [
  // id,                 title,                role,      typical length (s)
  ['sample-first-light', 'First Light',        'opener',  [420, 620]],
  ['sample-dial-tone',   'Dial Tone',          'opener',  [380, 540]],
  ['sample-radio-hymn',  'Radio Hymn',         'opener',  [300, 460]],
  ['sample-long-way',    'The Long Way Down',  'peak',    [900, 1500]],
  ['sample-undertow',    'Undertow',           'peak',    [840, 1380]],
  ['sample-glass-canyon','Glass Canyon',       'peak',    [960, 1620]],
  ['sample-freight',     'Freight and Salvage','jam',     [700, 1100]],
  ['sample-wildfire',    'Wildfire',           'jam',     [660, 1020]],
  ['sample-cassette',    'Cassette Summer',    'jam',     [620, 980]],
  ['sample-porch-light', 'Porch Light',        'ballad',  [200, 300]],
  ['sample-november',    'November Letters',   'ballad',  [220, 320]],
  ['sample-slow-tide',   'Slow Tide',          'ballad',  [180, 290]],
  ['sample-last-call',   'Last Call',          'closer',  [520, 840]],
  ['sample-hammer',      'Hammer and Tongs',   'closer',  [560, 900]],
  ['sample-tall-grass',  'Tall Grass',         'closer',  [480, 780]],
  ['sample-goodnight',   'Goodnight Marlene',  'encore',  [260, 400]],
  ['sample-one-more',    'One More Round',     'encore',  [300, 460]],
  ['sample-static',      'Static in the Wire', 'mid',     [340, 560]],
  ['sample-blue-hour',   'Blue Hour',          'mid',     [360, 580]],
  ['sample-paperweight', 'Paperweight',        'mid',     [320, 520]],
  ['sample-crosstown',   'Crosstown',          'mid',     [380, 600]],
  ['sample-ember',       'Ember',              'mid',     [400, 640]],
  ['sample-ninth-ward',  'Ninth Ward',         'mid',     [340, 540]],
  ['sample-honest-work', 'Honest Work',        'mid',     [300, 480]],
  ['sample-cold-open',   'Cold Open',          'rare',    [420, 700]],
  ['sample-airplane',    'Airplane Mode',      'rare',    [380, 620]],
  ['sample-detour',      'Detour',             'rare',    [440, 720]],
];

// A few covers, to exercise is_cover / original_artist.
const COVERS = new Map([
  ['sample-goodnight', 'The Marlenes'],
  ['sample-cold-open', 'Bettye Vaughn'],
]);

const byRole = role => SONGS.filter(s => s[2] === role);

const VENUES = [
  ['The Fillmore', 'San Francisco', 'CA'],
  ['Red Rocks Amphitheatre', 'Morrison', 'CO'],
  ['The Capitol Theatre', 'Port Chester', 'NY'],
  ['Orpheum Theatre', 'Boston', 'MA'],
  ['The Salt Shed', 'Chicago', 'IL'],
  ['Ryman Auditorium', 'Nashville', 'TN'],
  ['The Anthem', 'Washington', 'DC'],
  ['Mission Ballroom', 'Denver', 'CO'],
];

const SHOW_COUNT = 40;
const START = new Date(Date.UTC(2024, 4, 3));   // 2024-05-03

function dateFor(i) {
  const d = new Date(START.getTime());
  // Cluster into runs: mostly 1-3 day hops, occasionally a longer break.
  d.setUTCDate(d.getUTCDate() + Math.round(i * 5.5));
  return d.toISOString().slice(0, 10);
}

/** Pick n distinct songs from a pool, avoiding anything already used tonight. */
function draw(pool, n, used) {
  const out = [];
  const avail = pool.filter(s => !used.has(s[0]));
  while (out.length < n && avail.length) {
    const idx = Math.floor(rng() * avail.length);
    const s = avail.splice(idx, 1)[0];
    used.add(s[0]);
    out.push(s);
  }
  return out;
}

const raw = [];

for (let i = 0; i < SHOW_COUNT; i++) {
  const [venuename, city, state] = VENUES[i % VENUES.length];
  const showdate = dateFor(i);
  const show_id = `sample-${String(i + 1).padStart(3, '0')}`;
  const used = new Set();

  // Set I: opener, 3-4 mid, closer.
  const set1 = [
    ...draw(byRole('opener'), 1, used),
    ...draw([...byRole('mid'), ...byRole('ballad')], between(3, 4), used),
    ...draw(byRole('closer'), 1, used),
  ];
  // Set II: opener/jam, peak, breather, jam, closer.
  const set2 = [
    ...draw([...byRole('opener'), ...byRole('jam')], 1, used),
    ...draw(byRole('peak'), 1, used),
    ...draw(byRole('ballad'), 1, used),
    ...draw([...byRole('jam'), ...byRole('mid')], between(1, 2), used),
    ...draw(byRole('closer'), 1, used),
  ];
  // Encore: usually one, sometimes two. Rarities surface here occasionally.
  const encore = [
    ...draw(byRole('encore'), 1, used),
    ...(rng() < 0.18 ? draw(byRole('rare'), 1, used) : []),
  ];

  const emit = (songs, setnumber) => {
    songs.forEach((s, idx) => {
      const [song_id, songname, role, [lo, hi]] = s;
      const isLast = idx === songs.length - 1;
      // Segues cluster inside set II and never on the last song of a set.
      const segueChance = setnumber === '2' ? 0.45 : 0.18;
      const transition = !isLast && rng() < segueChance ? '>' : (isLast ? '' : ',');
      // Jamcharts follow the song's nature, not the roll of a die alone.
      const jamProne = role === 'peak' ? 0.55 : role === 'jam' ? 0.28 : 0.02;
      const secs = between(lo, hi);

      raw.push({
        show_id,
        showdate,
        venuename, city, state,
        setnumber,
        position: idx + 1,
        songname,
        song_id,
        tracktime: `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`,
        transition,
        isjamchart: rng() < jamProne ? 1 : 0,
        isoriginal: COVERS.has(song_id) ? 0 : 1,
        original_artist: COVERS.get(song_id) || '',
      });
    });
  };

  emit(set1, '1');
  emit(set2, '2');
  emit(encore, 'e');
}

const { csv, shows, performances, songs } = buildCSV(raw, { quiet: true });
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, csv, 'utf8');

console.log(`Wrote ${OUT}`);
console.log(`  ${performances} performances · ${shows} shows · ${songs} distinct songs`);
