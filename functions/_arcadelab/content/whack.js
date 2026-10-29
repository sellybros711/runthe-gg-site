/* Whack the Right Player: the prompt validator, the drafter and the slate.
 *
 * A prompt is an editor's claim that a list of athletes fits and another
 * list does not:
 *   { id, title, query: { league, type: 'athlete', years: [from, to], where: [...] },
 *     correct: [ids], decoys: [ids] }
 * The query is Stumpire's language (functions/_stumpire/query.js), evaluated
 * over the whole dataset. THE RULE IS THAT AN AMBIGUOUS CARD NEVER SHIPS. A
 * player who knows the answer must never be struck for it, so anything that
 * is not certain is refused, and the editor reads why in plain words.
 *
 * Every check, and why it is there:
 *   coverage     the fields the query reads must be complete for its years
 *                (Stumpire's FIELD_COVERAGE). Career stats never are, so a
 *                stat prompt is refused outright.
 *   correct      every correct card passes the query.
 *   decoy        every decoy fails it.
 *   name         nobody shares a name with anybody in the dataset: a card
 *                is a name, and two records with one name are two answers.
 *   fame         nobody below FAME_MIN: a card nobody has heard of tests luck.
 *   era          a decoy must have played inside the prompt's years and
 *                after every field it is judged on became complete.
 *   gap          a decoy missing the field it fails on is a hole, not a no.
 *                A famous decoy with no awards at all is a likely hole too.
 *   near miss    a decoy within NEAR_MISS of a numeric line, or one short of a
 *                count, is too close to call.
 *   counts       enough of each to fill three rounds without repeats wearing thin.
 */
import { CONFIG as C } from '../games/whack/config.js';
import { get, store, test, coverageProblems, validSet, nameCount, nameKey, posShort, posParent, coverageFrom, fieldsOf, lookups } from './dataset.js';

const leaves = (where, out = []) => { for (const p of where || []) { if (p.k === 'all' || p.k === 'any') leaves(p.of, out); else if (p.k === 'not') leaves([p.p], out); else out.push(p); } return out; };
const fmt = e => e.n + ' (' + e.id + ')';

function decoyGaps(e, q) {
  const why = [];
  for (const p of leaves(q.where)) {
    if (p.k === 'pos' && !e.pos) why.push('no position on record');
    if ((p.k === 'team' || p.k === 'teams') && !(e.tm && e.tm.length)) why.push('no teams on record');
    if (p.k === 'teams' && (e.tm || []).filter(t => t.startsWith('team-')).length === p.min - 1) why.push('one team short of ' + p.min);
    if (p.k === 'col' && !e.col) why.push('no college on record');
    if (p.k === 'decade' && !(e.dc && e.dc.length)) why.push('no seasons on record');
    if (p.k === 'award' && !(e.aw && e.aw.length) && (e.f || 0) >= 4) why.push('a famous player with no awards on record, which looks like a gap in the data');
    if (p.k === 'stat') {
      const v = e.st && e.st[p.v];
      if (v == null) why.push('no ' + p.v + ' on record');
      else if (v < p.min && v >= p.min * (1 - C.NEAR_MISS)) why.push(p.v + ' ' + v + ' is within ' + Math.round(C.NEAR_MISS * 100) + '% of ' + p.min);
    }
  }
  return why;
}

function inYears(e, q) {
  const lo = Math.floor(q.years[0] / 10) * 10, hi = q.years[1];
  return (e.dc || []).some(d => d >= lo && d <= hi);
}
function eraProblem(e, q) {
  const fields = new Set(); for (const p of q.where || []) fieldsOf(p, fields);
  let from = q.years[0];
  for (const f of fields) from = Math.max(from, coverageFrom(q.league, f));
  const first = Math.min(...(e.dc || [9999]));
  // a decade is all we know of a career, so one that may have begun before
  // the data is complete could hold the very award the record is missing
  if (first < from) return 'may have played before ' + from + ', when the data this prompt reads is not complete';
  if (!inYears(e, q)) return 'did not play in ' + q.years[0] + '-' + q.years[1];
  return null;
}

/* A coarse position group, the unit a fan reasons in: nobody thinks a
   shortstop might have won the Cy Young, and nobody needs to.  */
const NFL_GROUP = { 'Quarterback': 'QB', 'Running Back': 'RB', 'Fullback': 'RB', 'Wide Receiver': 'WR', 'Tight End': 'TE',
  'Center': 'OL', 'Guard': 'OL', 'Offensive Lineman': 'OL', 'Offensive Tackle': 'OL',
  'Defensive End': 'DL', 'Defensive Tackle': 'DL', 'Defensive Lineman': 'DL', 'Linebacker': 'LB',
  'Cornerback': 'DB', 'Safety': 'DB', 'Defensive Back': 'DB', 'Kicker': 'K', 'Place Kicker': 'K', 'Punter': 'K', 'Long Snapper': 'K' };
export function posGroup(e) {
  if (!e.pos) return null;
  if (e.s === 'MLB') return /Pitcher/.test(e.pos) ? 'P' : 'H';
  if (e.s === 'NFL') return NFL_GROUP[e.pos] || e.pos;
  return posParent()[e.pos] || e.pos;
}

/* A decoy is plausible when its position group is a real share of the
   people who fit. A shared team used to count too, and almost everybody
   shares a team with somebody, so it meant nothing. */
function plausibleGroups(correct) {
  const n = {}; for (const c of correct) { const g = posGroup(c); if (g) n[g] = (n[g] || 0) + 1; }
  return new Set(Object.keys(n).filter(g => n[g] >= correct.length * C.PLAUSIBLE_GROUP_MIN));
}
function plausibleFor(e, groups) { return groups.has(posGroup(e)); }

export function validatePrompt(def) {
  const errors = [], notes = [];
  const q = def && def.query;
  if (!def || typeof def.title !== 'string' || !/^Hit every \S/.test(def.title) || def.title.length > 70)
    errors.push('The title must start "Hit every" and be at most 70 characters.');
  if (!q || !['NFL', 'NBA', 'MLB'].includes(q.league) || q.type !== 'athlete') { errors.push('The query needs league NFL, NBA or MLB and type athlete.'); return { ok: false, errors, notes }; }
  // a query that cannot run stops here; a bad title is reported with everything else
  const before = errors.length;
  try { for (const p of coverageProblems(q)) errors.push('Coverage: ' + p + '.'); }
  catch (e) { errors.push('The query does not parse: ' + e.message + '.'); return { ok: false, errors, notes }; }
  if (errors.length > before) return { ok: false, errors, notes };
  let valid;
  try { valid = new Set(validSet(q).map(e => e.id)); } catch (e) { errors.push('The query does not run: ' + e.message + '.'); return { ok: false, errors, notes }; }

  const seen = new Set();
  const check = (ids, kind) => {
    const out = [];
    for (const id of ids || []) {
      if (seen.has(id)) { errors.push(kind + ' ' + id + ' is listed twice.'); continue; }
      seen.add(id);
      const e = get(id);
      if (!e) { errors.push(kind + ' ' + id + ' is not in the dataset.'); continue; }
      if (e.k !== 'p' || e.s !== q.league) { errors.push(kind + ' ' + fmt(e) + ' is not a ' + q.league + ' athlete.'); continue; }
      if (nameCount(e) > 1) { errors.push(kind + ' ' + fmt(e) + ': another record has the same name.'); continue; }
      if ((e.f || 0) < C.FAME_MIN) { errors.push(kind + ' ' + fmt(e) + ' is too obscure to ask about (fame ' + (e.f || 0) + ').'); continue; }
      if (kind === 'Correct' && !valid.has(id)) { errors.push('Correct ' + fmt(e) + ' does not fit the query.'); continue; }
      if (kind === 'Decoy') {
        if (valid.has(id) || (q.where || []).every(p => test(e, p))) { errors.push('Decoy ' + fmt(e) + ' fits the query.'); continue; }
        if ((e.f || 0) < C.DECOY_FAME_MIN) { errors.push('Decoy ' + fmt(e) + ' is not famous enough to be a fair wrong answer (fame ' + (e.f || 0) + '): a decoy nobody has heard of tests luck, not knowledge.'); continue; }
        if (e.act) { errors.push('Decoy ' + fmt(e) + ' is still active: a season the data does not have yet could make them a winner.'); continue; }
        const era = eraProblem(e, q);
        if (era) { errors.push('Decoy ' + fmt(e) + ' is borderline: ' + era + '.'); continue; }
        const gaps = decoyGaps(e, q);
        if (gaps.length) { errors.push('Decoy ' + fmt(e) + ' is borderline: ' + gaps.join('; ') + '.'); continue; }
      }
      out.push(e);
    }
    return out;
  };
  const correct = check(def.correct, 'Correct');
  const decoys = check(def.decoys, 'Decoy');
  const ck = new Set(correct.map(e => nameKey(e.n)));
  for (const d of decoys) if (ck.has(nameKey(d.n))) errors.push('Decoy ' + fmt(d) + ' shares a name with a correct card.');
  const groups = plausibleGroups(correct);
  const plausible = decoys.filter(d => plausibleFor(d, groups));
  if (correct.length < C.MIN_CORRECT) errors.push('Needs at least ' + C.MIN_CORRECT + ' correct cards that pass every check, has ' + correct.length + '.');
  if (decoys.length < C.MIN_DECOYS) errors.push('Needs at least ' + C.MIN_DECOYS + ' decoys that pass every check, has ' + decoys.length + '.');
  if (plausible.length < C.MIN_PLAUSIBLE) errors.push('Needs at least ' + C.MIN_PLAUSIBLE + ' plausible decoys (a position group that wins this, ' + [...groups].join(', ') + '), has ' + plausible.length + '.');
  notes.push(valid.size + ' athletes in the dataset fit this query.');
  return { ok: errors.length === 0, errors, notes, counts: { correct: correct.length, decoys: decoys.length, plausible: plausible.length, fit: valid.size },
    plausible: plausible.map(e => e.id) };
}

/* Claude's drafts: a starting list per template, which an editor must review
   and approve. Correct cards are the best known that fit; decoys are the best
   known that pass every decoy check, plausible ones first. */
export const TEMPLATES = [
  { title: 'Hit every Cy Young winner', query: { league: 'MLB', type: 'athlete', years: [1956, 2025], where: [{ k: 'award', v: 'Cy Young' }] } },
  { title: 'Hit every MLB MVP', query: { league: 'MLB', type: 'athlete', years: [1956, 2025], where: [{ k: 'award', v: 'MLB MVP' }] } },
  { title: 'Hit every World Series MVP', query: { league: 'MLB', type: 'athlete', years: [1956, 2025], where: [{ k: 'award', v: 'World Series MVP' }] } },
  { title: 'Hit every NBA MVP', query: { league: 'NBA', type: 'athlete', years: [1956, 2025], where: [{ k: 'award', v: 'NBA MVP' }] } },
  { title: 'Hit every NBA Finals MVP', query: { league: 'NBA', type: 'athlete', years: [1969, 2025], where: [{ k: 'award', v: 'Finals MVP' }] } },
  { title: 'Hit every Sixth Man of the Year', query: { league: 'NBA', type: 'athlete', years: [1983, 2025], where: [{ k: 'award', v: 'Sixth Man of the Year' }] } },
  { title: 'Hit every NBA Defensive Player of the Year', query: { league: 'NBA', type: 'athlete', years: [1983, 2025], where: [{ k: 'award', v: 'Defensive Player of the Year' }] } },
  { title: 'Hit every NFL MVP', query: { league: 'NFL', type: 'athlete', years: [1995, 2025], where: [{ k: 'award', v: 'NFL MVP' }] } },
  { title: 'Hit every Super Bowl MVP', query: { league: 'NFL', type: 'athlete', years: [1995, 2025], where: [{ k: 'award', v: 'Super Bowl MVP' }] } },
  { title: 'Hit every NFL Defensive Player of the Year', query: { league: 'NFL', type: 'athlete', years: [1995, 2025], where: [{ k: 'award', v: 'Defensive Player of the Year' }] } },
  { title: 'Hit every NFL Offensive Rookie of the Year', query: { league: 'NFL', type: 'athlete', years: [1995, 2025], where: [{ k: 'award', v: 'Offensive Rookie of the Year' }] } }
];

const SLUG = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export function draftPrompt(t) {
  const q = t.query;
  const fitting = validSet(q).filter(e => nameCount(e) === 1 && (e.f || 0) >= C.FAME_MIN).sort((a, b) => (b.f || 0) - (a.f || 0) || lookups(b) - lookups(a) || a.n.localeCompare(b.n));
  const correct = fitting.slice(0, 18);
  const fitIds = new Set(validSet(q).map(e => e.id));
  const groups = plausibleGroups(correct);
  const pool = store().list.filter(e => e.k === 'p' && e.s === q.league && !e.act && !fitIds.has(e.id) && nameCount(e) === 1 && (e.f || 0) >= C.DECOY_FAME_MIN
    && !eraProblem(e, q) && !decoyGaps(e, q).length && !(q.where || []).every(p => test(e, p)));
  pool.sort((a, b) => (b.f || 0) - (a.f || 0) || lookups(b) - lookups(a) || a.n.localeCompare(b.n));
  // mostly real questions, plus famous players from elsewhere on the field
  // for the early rounds to ramp from (see PLAUSIBLE_SHARE)
  const pl = pool.filter(e => plausibleFor(e, groups)), other = pool.filter(e => !plausibleFor(e, groups));
  const decoys = [...pl.slice(0, 18), ...other.slice(0, 8)];
  if (decoys.length < 26) decoys.push(...pl.slice(18, 18 + 26 - decoys.length));
  const def = { id: 'whack-' + SLUG(t.title), title: t.title, query: q, correct: correct.map(e => e.id), decoys: decoys.map(e => e.id) };
  return { def, report: validatePrompt(def) };
}

/* The snapshot a slate freezes: everything a card shows and whether it fits,
   so nothing about a published day ever reads the dataset again. */
export function snapshotRound(def) {
  const rep = validatePrompt(def);
  if (!rep.ok) throw new Error('prompt ' + def.id + ' does not validate: ' + rep.errors[0]);
  const pl = new Set(rep.plausible);
  const card = (id, ok) => { const e = get(id); return { id, n: e.n, pos: posShort(e), ok, plausible: !ok && pl.has(id) }; };
  return { promptId: def.id, title: def.title, league: def.query.league,
    cards: [...def.correct.map(id => card(id, true)), ...def.decoys.map(id => card(id, false))] };
}
export function snapshotSlate(defs) {
  if (!Array.isArray(defs) || defs.length !== C.ROUNDS) throw new Error('a slate is ' + C.ROUNDS + ' prompts, easiest first');
  if (new Set(defs.map(d => d.id)).size !== defs.length) throw new Error('a slate uses three different prompts');
  return { rounds: defs.map(snapshotRound) };
}
