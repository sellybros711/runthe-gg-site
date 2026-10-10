/* Turning prompt definitions into a frozen slate. Used by the authoring API
 * (preview and publish) and by build/seed-slate.mjs, so the rows a tester
 * plays against are built by exactly one function.
 *
 * A prompt definition:
 *   { id, text, league, type: 'athlete'|'team', set: true (team prompts),
 *     years: [from, to], where: [...predicates], wildcard: entityId,
 *     arguable: [entityIds] }
 *
 * ARGUABLE answers are added to the valid set if the query left them out,
 * and carry the flag: benefit of the doubt, capped at a single, reviewed.
 */
import { validSet } from './query.js';
import { grade, calledList, calledCount } from './scoring.js';
import { checkPrompt, checkSlate } from './validate.js';
import { get } from './entities.js';

/* searchAvg: { id: number }. observed: { id: count } for this prompt. */
function hash(s) { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

/* wildcard 'auto' (or none, when opts.autoWildcard): an answer from just past
   the called list, ranks N to 3N, picked by the seed so a date always picks the
   same one. An editor pins a wildcard by writing an entity id instead. */
export function autoWildcard(graded, atBatIndex, seed) {
  const n = calledCount(atBatIndex);
  const pool = graded.filter(r => !r.arguable).slice(n - 1, n * 3);
  return pool.length ? pool[hash(seed) % pool.length].id : null;
}

export function previewPrompt(def, atBatIndex, searchAvg, observed = {}, opts = {}) {
  let ents = [];
  let errors = [];
  try { ents = validSet(def); } catch (e) { errors.push(e.message); }
  const seen = new Set(ents.map(e => e.id));
  const arguable = new Set(def.arguable || []);
  for (const id of arguable) {
    const e = get(id);
    if (!e) errors.push('arguable id ' + id + ' is not in the dataset');
    else if (!seen.has(id)) { ents.push(e); seen.add(id); }
  }
  let missing = 0;
  const rows = ents.map(e => {
    const s = searchAvg[e.id];
    if (!(s > 0)) missing++;
    return { id: e.id, name: e.n, searchAvg: s > 0 ? s : 0, observed: observed[e.id] || 0, arguable: arguable.has(e.id) };
  });
  let graded = [], called = null;
  if (rows.some(r => r.searchAvg > 0)) {
    graded = grade(rows.filter(r => r.searchAvg > 0));
    let wc = def.wildcard;
    if (wc === 'auto' || (!wc && opts.autoWildcard)) {
      wc = autoWildcard(graded, atBatIndex, (opts.seed || '') + '|' + def.id);
      def = { ...def, wildcard: wc };
    }
    called = calledList(graded, atBatIndex, wc);
    const ids = new Set(called.ids);
    for (const r of graded) r.called = ids.has(r.id);
  }
  const check = checkPrompt(def, graded, called, atBatIndex, { missingSearch: missing });
  check.errors.unshift(...errors);
  return { def, atBatIndex, graded, called, check };
}

/* The five definitions in at-bat order. Returns { ok, errors, prompts } where
   each prompt carries the frozen rows to insert. */
export function buildSlate(defs, searchAvg, observedFor = () => ({}), opts = {}) {
  const prompts = defs.map((d, i) => previewPrompt(d, i, searchAvg, observedFor(d.id), opts));
  const errors = [...checkSlate(defs)];
  prompts.forEach((p, i) => p.check.errors.forEach(e => errors.push('at-bat ' + (i + 1) + ' (' + p.def.text + '): ' + e)));
  return { ok: !errors.length, errors, prompts, defs: prompts.map(p => p.def) };
}

/* The row shape the database stores, one per valid answer. */
export function frozenRows(p) {
  return p.graded.map(r => ({
    entity_id: r.id, name: r.name, prior_share: r.prior, observed_count: r.observed,
    expected_share: r.expected, depth: r.depth, tier: r.tier, called: !!r.called, arguable: !!r.arguable
  }));
}
