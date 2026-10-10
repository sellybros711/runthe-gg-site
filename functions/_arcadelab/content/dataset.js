/* The athlete dataset the Arcade Lab's content is checked against: Stumpire's,
 * read through Stumpire's own modules, so a prompt here and a prompt there are
 * judged by one definition of every field. Server only: the browser never
 * loads the dataset, it plays the snapshot a slate froze at publish. */
import { store, get, tag, posParent } from '../../_stumpire/entities.js';
import { test, coverageProblems, validSet, fieldsOf } from '../../_stumpire/query.js';
import { key } from '../../_stumpire/normalize.js';
import { CONFIG as SCONF } from '../../_stumpire/config.js';

export { store, get, tag, posParent, test, coverageProblems, validSet, fieldsOf, SCONF };

/* Two records with one name cannot be told apart on a card, so neither may
   be asked about. Counted across every league. */
let NAMES = null;
export function nameCount(e) {
  if (!NAMES) { NAMES = new Map(); for (const x of store().list) { const k = key(x.n); NAMES.set(k, (NAMES.get(k) || 0) + 1); } }
  return NAMES.get(key(e.n)) || 0;
}
export const nameKey = key;

/* "QB", "SS", "PF": the short position a card shows. */
export function posShort(e) { return e && e.k === 'p' ? (tag(e).split(' · ')[0] || '') : ''; }

/* The first season a field can be trusted for a league, as Stumpire records it. */
export function coverageFrom(league, field) {
  const lc = (SCONF.LEAGUE_COVERAGE || {})[league] || {};
  const c = field in lc ? lc[field] : SCONF.FIELD_COVERAGE[field];
  return c ? c.from : Infinity;
}

/* How often an athlete is looked up: a tie-break when drafting, so a draft
   leads with names people know.
   The caller hands the table in (setLookups): a JSON import needs an import
   attribute that Cloudflare's build image cannot parse. */
let LOOKUPS = {};
export function setLookups(values) { LOOKUPS = values || {}; }
export function lookups(e) { return LOOKUPS[e.id] || 0; }
