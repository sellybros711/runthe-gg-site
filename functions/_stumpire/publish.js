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
import { grade, calledList } from './scoring.js';
import { checkPrompt, checkSlate } from './validate.js';
import { get } from './entities.js';

/* searchAvg: { id: number }. observed: { id: count } for this prompt. */
export function previewPrompt(def, atBatIndex, searchAvg, observed = {}) {
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
    called = calledList(graded, atBatIndex, def.wildcard);
    const ids = new Set(called.ids);
    for (const r of graded) r.called = ids.has(r.id);
  }
  const check = checkPrompt(def, graded, called, atBatIndex, { missingSearch: missing });
  check.errors.unshift(...errors);
  return { def, atBatIndex, graded, called, check };
}

/* The five definitions in at-bat order. Returns { ok, errors, prompts } where
   each prompt carries the frozen rows to insert. */
export function buildSlate(defs, searchAvg, observedFor = () => ({})) {
  const prompts = defs.map((d, i) => previewPrompt(d, i, searchAvg, observedFor(d.id)));
  const errors = [...checkSlate(defs)];
  prompts.forEach((p, i) => p.check.errors.forEach(e => errors.push('at-bat ' + (i + 1) + ' (' + p.def.text + '): ' + e)));
  return { ok: !errors.length, errors, prompts };
}

/* The row shape the database stores, one per valid answer. */
export function frozenRows(p) {
  return p.graded.map(r => ({
    entity_id: r.id, name: r.name, prior_share: r.prior, observed_count: r.observed,
    expected_share: r.expected, depth: r.depth, tier: r.tier, called: !!r.called, arguable: !!r.arguable
  }));
}
