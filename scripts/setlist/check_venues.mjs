#!/usr/bin/env node
/* THE ROOMS, CHECKED.
 *
 *   node scripts/setlist/check_venues.mjs
 *
 * Segue's rooms (setlist/venues.js for the rules, setlist/rooms.js for the pictures) fail in ways that
 * render perfectly, so this asks for each of them:
 *
 *   1. Every room has what the stage, the crowd shot and the picker need, and a picture on disk.
 *   2. Every `archive` name is a venue goose_shows.csv actually spells that way, because unlocks join
 *      on it and a typo is a room nobody can earn and nothing reports.
 *   3. A `picks` rule only names a venue with a night the draft can deal. O'Neill's has eighteen shows
 *      and not one with a full timed setlist, so a rule asking for songs from it would be unearnable.
 *   4. The rules evaluate: nothing opens on no shows, everything opens on a fixture that meets every
 *      rule, and each requirement is the thing standing in the way when it alone is missing.
 *   5. No venue name reaches a player. The rooms are named by their pictures and nothing else, so no
 *      csv venue name may appear in a clue, a lore line or a zone, and no archive name anywhere in the
 *      page's copy (its markup and its script with the comments taken out).
 *   6. Neither file reads a score.
 *
 * The other half, that every room actually builds and draws, is scripts/setlist/make_venue_thumbs.mjs,
 * which renders each one and fails on any that throws.
 */
import fs from 'fs';
import path from 'path';
import { VENUE_LIST, TIERS, venueProgress, crowdZones } from '../../setlist/venues.js';
import { ROOMS, RIGS } from '../../setlist/rooms.js';
import { scriptBlocks, stripComments, markupText } from '../check-copy.mjs';

const ROOT = path.resolve(new URL('../..', import.meta.url).pathname);
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
let fails = 0;
const check = (ok, msg) => { if (!ok){ fails++; console.log('FAIL ' + msg); } };

// A small CSV reader: quoted fields, doubled quotes, commas inside quotes.
function parseCSV(text){
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++){
    const c = text[i];
    if (q){ if (c === '"'){ if (text[i + 1] === '"'){ f += '"'; i++; } else q = false; } else f += c; continue; }
    if (c === '"') q = true; else if (c === ','){ row.push(f); f = ''; }
    else if (c === '\n'){ row.push(f); rows.push(row); row = []; f = ''; }
    else if (c !== '\r') f += c;
  }
  if (f || row.length){ row.push(f); rows.push(row); }
  const [hd, ...rest] = rows;
  return rest.filter(r => r.length === hd.length).map(r => Object.fromEntries(hd.map((h, i) => [h, r[i]])));
}
const shows = parseCSV(read('setlist/data/goose_shows.csv'));
const perfs = parseCSV(read('setlist/data/goose.csv'));
const csvVenues = new Set(shows.map(r => r.venue).filter(Boolean));

// The draft deals a show with at least eight songs, every one of them timed (index.html MIN_SONGS_PER_SHOW).
const byShow = new Map();
for (const p of perfs){ if (!byShow.has(p.show_id)) byShow.set(p.show_id, []); byShow.get(p.show_id).push(p); }
const drawable = new Map();
for (const [id, ps] of byShow){
  if (ps.length >= 8 && ps.every(p => Number(p.length_sec) > 0)) drawable.set(ps[0].venue, (drawable.get(ps[0].venue) || []).concat(id));
}
const idsAt = name => shows.filter(r => r.venue === name).map(r => r.show_id);
const venueOf = (() => { const m = new Map(shows.map(r => [r.show_id, r.venue])); return id => m.get(id) || null; })();

// ── 1. shape ────────────────────────────────────────────────────────────────
const KINDS = new Set(['picks', 'shows', 'days', 'dailies', 'pct', 'bustouts', 'segues', 'month', 'late']);
const ids = new Set();
for (const v of VENUE_LIST){
  check(!ids.has(v.id), `${v.id}: id is used twice`); ids.add(v.id);
  check(TIERS.some(t => t.id === v.tier), `${v.id}: tier "${v.tier}" is not a tier`);
  check(typeof v.lore === 'string' && v.lore.length > 5, `${v.id}: no lore line`);
  check(v.zones && v.zones.floor && v.zones.worst, `${v.id}: the crowd card needs zones.floor and zones.worst`);
  check(crowdZones(v.id).length === 6, `${v.id}: crowd zones are not six steps`);
  check(Array.isArray(v.archive), `${v.id}: archive must be a list`);
  if (!v.free){
    check(Array.isArray(v.rule) && v.rule.length, `${v.id}: a room that is not free needs a rule`);
    check(typeof v.clue === 'string' && v.clue.length > 10, `${v.id}: a locked room needs a clue`);
    for (const r of v.rule || []) for (const q of [r, r.or].filter(Boolean)){
      check(KINDS.has(q.k), `${v.id}: unknown rule "${q.k}"`);
      if (q.k === 'month') check(Array.isArray(q.months) && q.months.every(m => m >= 1 && m <= 12), `${v.id}: month rule needs months 1 to 12`);
      else if (q.k !== 'late') check(q.n > 0, `${v.id}: rule "${q.k}" needs n`);
    }
  }
  const R = ROOMS[v.id];
  check(!!R, `${v.id}: rooms.js has no picture of it`);
  if (R){
    check(typeof R.ground === 'function' && typeof R.build === 'function', `${v.id}: a room needs ground and build`);
    check(!!RIGS[R.rig], `${v.id}: rig "${R.rig}" is not a rig`);
    check(R.sky === 'open' || R.sky === 'indoor', `${v.id}: sky must be open or indoor`);
    const F = R.floor || {};
    for (const k of ['y0', 'y1', 'deep', 'back']) check(Number.isFinite(F[k]), `${v.id}: floor.${k} is missing`);
    check(typeof F.half === 'function' && typeof F.gap === 'function', `${v.id}: floor needs half() and gap()`);
    check(F.y0 < F.deep && F.deep <= F.back + 1, `${v.id}: the crowd shot's rail, depth and back are out of order`);
  }
  check(fs.existsSync(path.join(ROOT, `setlist/venues/${v.id}.png`)), `${v.id}: no picture (run scripts/setlist/make_venue_thumbs.mjs)`);
}
for (const k of Object.keys(ROOMS)) check(ids.has(k), `rooms.js draws "${k}", which venues.js does not list`);
check(VENUE_LIST.filter(v => v.free).map(v => v.id).join() === 'lawn', 'the lawn, and only the lawn, is free');

// ── 2 and 3. the archive ───────────────────────────────────────────────────
for (const v of VENUE_LIST){
  for (const a of v.archive) check(csvVenues.has(a), `${v.id}: "${a}" is not a venue in goose_shows.csv`);
  if (!v.free) check(v.archive.length > 0, `${v.id}: a room has to be a room the band played`);
  const picks = (v.rule || []).flatMap(r => [r, r.or]).filter(q => q && q.k === 'picks');
  if (picks.length){
    const n = v.archive.reduce((s, a) => s + (drawable.get(a) || []).length, 0);
    check(n > 0, `${v.id}: asks for songs from nights the draft never deals (no drawable show at ${v.archive.join(', ')})`);
  }
}

// ── 4. the rules ───────────────────────────────────────────────────────────
const none = venueProgress([], venueOf);
check(none.filter(p => p.open).map(p => p.id).join() === 'lawn', 'with no shows, only the lawn is open');
/* A fixture that meets everything: shows on many days, a December night at 2am, a 99% night with
   bustouts and segues, dailies, and five picks from every room's own nights. */
function fixture(drop){
  const rows = [];
  for (let i = 0; i < 80; i++){
    const d = new Date(Date.UTC(2025, 11, 1 + (i % 28), 7, 0));     // 2am Eastern in December
    d.setUTCDate(d.getUTCDate() + Math.floor(i / 28) * 31);
    rows.push({ created_at: d.toISOString(), band: 'goose', pct_of_best: 99, bustouts: 6, segues: 9,
      rng_seed: `daily:${d.toISOString().slice(0, 10)}`, picks: [] });
  }
  for (const v of VENUE_LIST) for (const a of v.archive){
    const id = (drawable.get(a) || idsAt(a))[0];
    for (let k = 0; k < 5; k++) rows[k].picks.push(`${id}:${k + 1}`);
  }
  return drop ? drop(rows) : rows;
}
const all = venueProgress(fixture(), venueOf);
check(all.every(p => p.open), `a fixture meeting every rule opens every room (closed: ${all.filter(p => !p.open).map(p => p.id).join(', ')})`);
// Each room's picks really are what it reads: take its own picks away and a picks-only gate closes.
for (const v of VENUE_LIST){
  const gate = (v.rule || []).find(r => r.k === 'picks' && !r.or);
  if (!gate) continue;
  const names = new Set(v.archive);
  const rows = fixture(rs => rs.map(r => Object.assign({}, r, { picks: r.picks.filter(k => !names.has(venueOf(k.split(':')[0]))) })));
  const p = venueProgress(rows, venueOf).find(x => x.id === v.id);
  check(!p.open, `${v.id}: still opens with no songs from its own nights`);
}
// Too few shows keeps a shows-gated room shut.
for (const v of VENUE_LIST){
  const gate = (v.rule || []).find(r => r.k === 'shows' && !r.or);
  if (!gate) continue;
  const p = venueProgress(fixture(rs => rs.slice(0, gate.n - 1).map(r => Object.assign({}, r, { picks: rs.flatMap(x => x.picks) }))), venueOf)
    .find(x => x.id === v.id);
  check(!p.open, `${v.id}: opens on ${gate.n - 1} shows, under its own ${gate.n}`);
}

// ── 5. no names on screen ──────────────────────────────────────────────────
const lower = s => s.toLowerCase();
// Names short or generic enough to be ordinary words are not a leak ("The Met", "Octave").
const distinctive = [...csvVenues].filter(n => n.length >= 9 && /\s/.test(n));
for (const v of VENUE_LIST){
  const said = lower([v.clue, v.lore, v.zones.floor, v.zones.worst, TIERS.find(t => t.id === v.tier).label].join(' | '));
  for (const n of distinctive) check(!said.includes(lower(n)), `${v.id}: player copy names a venue ("${n}")`);
}
const page = read('setlist/index.html');
const copy = lower(markupText(page).join(' | ') + ' | ' + scriptBlocks(page).map(stripComments).join('\n'));
for (const v of VENUE_LIST) for (const a of v.archive) check(!copy.includes(lower(a)), `index.html names a room's venue in its copy ("${a}")`);

// ── 6. a renderer reads no score ───────────────────────────────────────────
for (const f of ['setlist/venues.js', 'setlist/rooms.js'])
  check(!/scoring\.js|scoreShow|scorePerf/.test(stripComments(read(f))), `${f} reads the scoring`);

console.log(fails ? `\n${fails} problem(s) with the rooms.` : `The rooms check out: ${VENUE_LIST.length} rooms, ${[...drawable.keys()].length} venues with drawable nights.`);
process.exit(fails ? 1 : 0);
