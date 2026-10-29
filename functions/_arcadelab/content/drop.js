/* Drop Board: the theme validator, the drafter and the snapshot.
 *
 * A theme is seven slots, each an athlete (or team) and a number the dataset
 * holds for it:
 *   { id, title, slots: [{ id, field: 'stat', key: 'mlb_hr', label, value }, x7] }
 *   field 'titles' reads a team's championships (no key).
 * The validator holds every printed value to the record, with the same rigor
 * as Whack the Right Player's: a number a player reads before dropping must be
 * the number the dataset says, or the theme does not ship.
 *
 * Refused, and why:
 *   missing      the record has no such number.
 *   wrong        the printed value is not the record's.
 *   active       a career stat for somebody still playing has moved since the
 *                data was taken, so the printed number would be stale.
 *   unreadable   not a whole number from 1 to 99999, or a label over 16
 *                characters (the slot is narrow).
 *   name         the label must be the record's name or its surname, and the
 *                name must be unique in the dataset.
 *   repeats      two slots with one value or one athlete read as a mistake.
 */
import { get, store, nameCount, nameKey } from './dataset.js';
import VERIFIED from './verified-stats.js';

export const SLOTS = 7;
export const LABEL_MAX = 16;

function recordValue(e, s) {
  if (s.field === 'stat') return e.st && e.st[s.key] != null ? e.st[s.key] : null;
  if (s.field === 'titles') return e.k === 't' ? (e.ti || 0) : null;
  return undefined;
}
function labelOk(e, label) {
  const k = nameKey(label), parts = e.n.split(' ');
  return k === nameKey(e.n) || k === nameKey(parts[parts.length - 1]) || (e.nick && k === nameKey(e.nick));
}
/* Every club a franchise of the league. Satchel Paige's record carries 130
   wins against the 28 a fan finds for his MLB career. */
/* The number a second source agrees with, or undefined. */
const verified = (key, id) => (VERIFIED[key] || {})[id];
const fullRecord = e => (e.tm || []).length > 0 && e.tm.every(t => t.startsWith('team-'));
/* A surname alone is only a name when nobody else well known in the league
   wears it: "Williams" on a rushing board could be DeAngelo or Ricky. */
const surnameOf = n => n.split(' ').pop();
function surnameShared(e) {
  const k = nameKey(surnameOf(e.n));
  return store().list.some(x => x !== e && x.k === 'p' && x.s === e.s && (x.f || 0) >= 4 && nameKey(surnameOf(x.n)) === k);
}

export function validateTheme(t) {
  const errors = [], notes = [];
  if (!t || typeof t.title !== 'string' || t.title.length < 4 || t.title.length > 60) errors.push('The title must be 4 to 60 characters.');
  const slots = (t && t.slots) || [];
  if (slots.length !== SLOTS) { errors.push('A theme has exactly ' + SLOTS + ' slots, this one has ' + slots.length + '.'); return { ok: false, errors, notes }; }
  const ids = new Set(), vals = new Set();
  slots.forEach((s, i) => {
    const at = 'Slot ' + (i + 1) + ': ';
    const e = s && get(s.id);
    if (!e) { errors.push(at + 'unknown id ' + (s && s.id) + '.'); return; }
    if (ids.has(e.id)) errors.push(at + e.n + ' is already on the board.');
    ids.add(e.id);
    if (nameCount(e) > 1) errors.push(at + e.n + ' shares a name with another record.');
    const rv = recordValue(e, s);
    if (rv === undefined) { errors.push(at + 'field must be stat or titles.'); return; }
    if (rv == null) { errors.push(at + e.n + ' has no ' + (s.key || s.field) + ' on record.'); return; }
    if (s.field === 'stat' && (e.act || (e.dc || []).includes(2020))) errors.push(at + e.n + ' may still be active (played in the 2020s), so the career number may have moved since the data was taken.');
    if (s.field === 'stat' && !fullRecord(e)) errors.push(at + e.n + " played in a league whose records are partial (the Negro Leagues, say), so the career number mixes what a fan can look up with what they cannot.");
    if (!(Number.isInteger(s.value) && s.value >= 1 && s.value <= 99999)) errors.push(at + 'the value ' + JSON.stringify(s.value) + ' is not readable: a whole number from 1 to 99999.');
    else if (s.value !== rv) errors.push(at + 'the value ' + s.value + ' is wrong: the record says ' + rv + '.');
    else if (s.field === 'stat' && verified(s.key, e.id) !== s.value) errors.push(at + e.n + "'s " + s.key + ' is not confirmed by a second source (build/verify-stats.py): the index alone has been wrong (Chris Webber 9,123 rebounds for 8,124).');
    if (typeof s.label !== 'string' || !s.label.trim() || s.label.length > LABEL_MAX) errors.push(at + 'the label must be 1 to ' + LABEL_MAX + ' characters.');
    else if (!labelOk(e, s.label)) errors.push(at + 'the label "' + s.label + '" is not ' + e.n + "'s name or surname.");
    else if (nameKey(s.label) !== nameKey(e.n) && !(e.nick && nameKey(s.label) === nameKey(e.nick)) && surnameShared(e)) errors.push(at + 'the label "' + s.label + '" could be somebody else: another well known ' + e.s + ' player has that surname.');
    if (vals.has(s.value)) errors.push(at + 'two slots carry ' + s.value + '.');
    vals.add(s.value);
  });
  const keys = new Set(slots.map(s => s.field + ':' + (s.key || '')));
  if (keys.size > 1) errors.push('Every slot must read the same number (one stat, or titles).');
  return { ok: errors.length === 0, errors, notes };
}

/* What a draft may draw from: who the number is about (positions, by the
   dataset's own names; a hitter's stat is never a pitcher's) and the share of
   the pool's top value a slot must reach, so no slot is a curiosity like a
   slugger's one strikeout. */
const HIT = p => !/Pitcher/.test(p || ''), ARM = p => /Pitcher/.test(p || '');
export const STAT_THEMES = [
  { key: 'mlb_hr', title: 'Career home runs', pos: HIT }, { key: 'mlb_hits', title: 'Career hits', pos: HIT }, { key: 'mlb_sb', title: 'Career stolen bases', pos: HIT },
  { key: 'mlb_wins', title: 'Career wins by a pitcher', pos: ARM }, { key: 'mlb_strikeouts', title: 'Career strikeouts by a pitcher', pos: ARM },
  { key: 'nba_points', title: 'Career NBA points' }, { key: 'nba_rebounds', title: 'Career NBA rebounds' }, { key: 'nba_assists', title: 'Career NBA assists' },
  { key: 'nfl_passtd', title: 'Career touchdown passes', pos: p => p === 'Quarterback' }, { key: 'nfl_rushyds', title: 'Career rushing yards', pos: p => /Running Back|Fullback/.test(p || '') },
  { key: 'nfl_recyds', title: 'Career receiving yards', pos: p => /Wide Receiver|Tight End/.test(p || '') }
  /* No sacks: the record carries half sacks rounded, and wrongly for some
     (Urlacher 40 for 41.5, Tuck 68 for 66.5), and a slot must be a whole
     number, so the board could not show the true figure even when it had it. */
];
const FLOOR_SHARE = 0.08;

/* A draft: seven retired, uniquely named, well known athletes whose values
   spread from low to high, so the board has a real best and worst. The pool
   is cut into seven value bands and a variant takes a different athlete from
   each, so a theme that comes round again is not the same seven names. */
export const VARIANTS = 4;
export function draftTheme(th, variant = 0) {
  let pool = store().list.filter(e => e.k === 'p' && !e.act && !(e.dc || []).includes(2020) && fullRecord(e) && nameCount(e) === 1 && (!th.pos || th.pos(e.pos)) && e.st && Number.isInteger(e.st[th.key]) && e.st[th.key] >= 1 && e.st[th.key] <= 99999 && verified(th.key, e.id) === e.st[th.key]
    && (e.n.length <= LABEL_MAX || !surnameShared(e)));
  const top = Math.max(0, ...pool.map(e => e.st[th.key]));
  pool = pool.filter(e => e.st[th.key] >= top * FLOOR_SHARE)
    .sort((a, b) => (b.f || 0) - (a.f || 0) || a.n.localeCompare(b.n)).slice(0, 60)
    .sort((a, b) => a.st[th.key] - b.st[th.key]);
  const out = [], used = new Set(), L = pool.length;
  for (let i = 0; i < SLOTS && L; i++) {
    // band i is [lo, hi); the top band always ends on the very top, so every board has its giant
    const lo = Math.round(i * L / SLOTS), hi = Math.max(lo + 1, Math.round((i + 1) * L / SLOTS));
    const band = pool.slice(lo, hi).filter(e => !used.has(e.st[th.key]));
    if (!band.length) continue;
    const e = i === SLOTS - 1 ? band[band.length - 1] : band[(variant * 3 + i) % band.length];
    used.add(e.st[th.key]);
    out.push({ id: e.id, field: 'stat', key: th.key, label: e.n.length <= LABEL_MAX ? e.n : surnameOf(e.n).slice(0, LABEL_MAX), value: e.st[th.key] });
  }
  const def = { id: 'drop-' + th.key + (variant ? '-v' + variant : ''), title: th.title, slots: out };
  return { def, report: validateTheme(def) };
}

export function snapshotTheme(def) {
  const rep = validateTheme(def);
  if (!rep.ok) throw new Error('theme ' + def.id + ' does not validate: ' + rep.errors[0]);
  return { themeId: def.id, title: def.title, theme: { title: def.title, slots: def.slots.map(s => ({ label: s.label, value: s.value })) } };
}
