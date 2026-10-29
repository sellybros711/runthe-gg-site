/* The rules a prompt and a slate must pass before they can be published.
 * The authoring tool shows these; the publish endpoint refuses on any error.
 * Warnings (a called list outside the coverage band) are shown, not blocking.
 */
import { CONFIG } from './config.js';
import { coverageProblems } from './query.js';
import { bandSizes } from './scoring.js';

/* q: the prompt's query. graded: scoring.grade output. called: calledList output. */
export function checkPrompt(q, graded, called, atBatIndex, opts = {}) {
  const errors = [...coverageProblems(q)], warnings = [];
  if (!CONFIG.LEAGUES.includes(q.league)) errors.push('league must be one of ' + CONFIG.LEAGUES.join(', '));
  const n = graded.length, bands = bandSizes(graded);
  if (opts.missingSearch) errors.push(opts.missingSearch + ' valid answers have no search_avg');
  if (q.type === 'team') {
    if (n < CONFIG.TEAM_MIN_VALID) errors.push('a team prompt needs ' + CONFIG.TEAM_MIN_VALID + ' valid answers, it has ' + n);
    if (bands[4] < CONFIG.TEAM_MIN_HOMERS) errors.push('a team prompt needs a home run answer');
  } else {
    if (n < CONFIG.ATHLETE_MIN_VALID) errors.push('needs ' + CONFIG.ATHLETE_MIN_VALID + ' valid answers, it has ' + n);
    if (bands[4] < CONFIG.ATHLETE_MIN_HOMERS) errors.push('needs ' + CONFIG.ATHLETE_MIN_HOMERS + ' home run answers, it has ' + bands[4]);
    const r = CONFIG.RAMP[atBatIndex];
    if (r && (n < r.min || n > r.max))
      errors.push('at-bat ' + (atBatIndex + 1) + ' wants ' + r.min + (r.max === Infinity ? ' or more' : '-' + r.max) + ' valid answers, it has ' + n);
  }
  if (called) {
    errors.push(...called.problems);
    if (called.flag) warnings.push('called answers hold ' + Math.round(called.coverage * 100) + '% of expected share');
  }
  if (q.type === 'team' && !q.set) errors.push('a team prompt has to be flagged set: true');
  return { errors, warnings, bands, n };
}

/* prompts: the five queries in at-bat order. */
export function checkSlate(prompts) {
  const errors = [];
  if (prompts.length !== CONFIG.AT_BATS) errors.push('a slate has ' + CONFIG.AT_BATS + ' prompts, this has ' + prompts.length);
  const ids = prompts.map(p => p.id).filter(Boolean);
  if (new Set(ids).size !== ids.length) errors.push('a prompt appears twice');
  const by = {};
  for (const p of prompts) by[p.league] = (by[p.league] || 0) + 1;
  for (const l of CONFIG.LEAGUES) {
    if (!by[l]) errors.push('needs at least one ' + l + ' prompt');
    if (by[l] > CONFIG.LEAGUE_MAX_PER_SLATE) errors.push('no more than ' + CONFIG.LEAGUE_MAX_PER_SLATE + ' ' + l + ' prompts');
  }
  const teamN = prompts.filter(p => p.type === 'team').length;
  if (teamN > CONFIG.TEAM_MAX_PER_SLATE) errors.push('at most ' + CONFIG.TEAM_MAX_PER_SLATE + ' team prompt a slate');
  return errors;
}
