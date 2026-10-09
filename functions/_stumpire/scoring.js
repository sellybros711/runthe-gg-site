/* Stumpire scoring: read from data, never from judgment.
 *
 *   prior share     an answer's search_avg over the sum across the valid set
 *   expected share  (k * prior + observed) / (k + n), n = real answers logged
 *   depth           the share of the prompt held by answers MORE popular
 *   tier            CONFIG.BANDS on depth
 *
 * All of it is computed when a slate is published and frozen into the rows.
 * Nothing here runs while somebody plays.
 */
import { CONFIG, tierForDepth } from './config.js';

export function blend(prior, observed, n, k = CONFIG.BLEND_K) {
  return (k * prior + observed) / (k + n);
}

/* rows: [{ id, searchAvg, observed }]. Returns new rows with prior, expected,
   depth and tier, most popular first. Ties broken by id so a rebuild is
   reproducible. */
export function grade(rows, k = CONFIG.BLEND_K) {
  const total = rows.reduce((s, r) => s + (r.searchAvg || 0), 0);
  const n = rows.reduce((s, r) => s + (r.observed || 0), 0);
  if (!(total > 0)) throw new Error('no search interest across the valid set');
  const out = rows.map(r => {
    const prior = (r.searchAvg || 0) / total;
    return { ...r, prior, expected: blend(prior, r.observed || 0, n, k) };
  }).sort((a, b) => b.expected - a.expected || (a.id < b.id ? -1 : 1));
  let above = 0;
  for (const r of out) { r.depth = above; r.tier = tierForDepth(above); above += r.expected; }
  return out;
}

export function calledCount(atBatIndex) { return CONFIG.CALLED_BY_AT_BAT[atBatIndex]; }

/* Top N-1 by expected share plus the editor's wildcard. An ARGUABLE answer is
   never called: it is in the set on the benefit of the doubt, and calling it
   would turn that doubt into an out. */
export function calledList(graded, atBatIndex, wildcardId) {
  const n = calledCount(atBatIndex);
  const top = graded.filter(r => !r.arguable).slice(0, n - 1).map(r => r.id);
  const problems = [];
  if (!wildcardId) problems.push('choose a wildcard for the called list');
  else if (!graded.some(r => r.id === wildcardId)) problems.push('the wildcard is not a valid answer');
  else if (graded.some(r => r.id === wildcardId && r.arguable)) problems.push('the wildcard cannot be an arguable answer');
  else if (top.includes(wildcardId)) problems.push('the wildcard is already in the top ' + (n - 1));
  const ids = problems.length ? top : [...top, wildcardId];
  const coverage = graded.filter(r => ids.includes(r.id)).reduce((s, r) => s + r.expected, 0);
  const flag = coverage < CONFIG.CALLED_COVERAGE_LOW ? 'low'
    : coverage > CONFIG.CALLED_COVERAGE_HIGH ? 'high' : null;
  return { ids, coverage, flag, problems };
}

export function bandSizes(graded) {
  const s = { 1: 0, 2: 0, 3: 0, 4: 0 };
  for (const r of graded) s[r.tier]++;
  return s;
}
