/* A prompt's query: which entities are valid answers. A small declarative
 * language rather than code, so a prompt is data an editor writes in the
 * authoring tool and the server stores.
 *
 *   { league: 'NBA', type: 'athlete', years: [1980, 2025],
 *     where: [ { k: 'award', v: 'NBA All-Star' }, { k: 'not', p: { k: 'award', v: 'NBA MVP' } } ] }
 *
 * Predicate kinds and the dataset field each one reads (that field must be
 * complete for every year the prompt covers, CONFIG.FIELD_COVERAGE):
 *   pos v      position, or a position under it (Point Guard proves Guard)   pos
 *   team v     played for franchise id v (team-nba-bulls)                     team
 *   teams min  played for at least min franchises                            teams
 *   award v    holds award v                                                 award
 *   stat v min career stat v at least min (nba_points 20000)                 stat
 *   decade v   active in the decade starting v                               decade
 *   act        active now                                                    act
 *   draft1     a number one overall pick                                     draft1
 *   col v      college v                                                     col
 *   titles min/max, conf v, division v, founded min/max   (team prompts)
 *   not p, any [..], all [..]                                                (the fields of what they wrap)
 */
import { CONFIG } from './config.js';
import { store, posParent } from './entities.js';

const FIELD = {
  pos: 'pos', team: 'team', teams: 'teams', award: 'award', stat: 'stat', decade: 'decade',
  act: 'act', draft1: 'draft1', col: 'col', titles: 'titles', conf: 'conf', division: 'division',
  founded: 'founded'
};

function posProves(have, want) {
  const pp = posParent();
  return !!have && (have === want || pp[have] === want);
}
const inRange = (x, p) => x != null && (p.min == null || x >= p.min) && (p.max == null || x <= p.max);

export function test(e, p) {
  switch (p.k) {
    case 'all': return p.of.every(q => test(e, q));
    case 'any': return p.of.some(q => test(e, q));
    case 'not': return !test(e, p.p);
    case 'pos': return posProves(e.pos, p.v) || posProves(e.rp, p.v);
    case 'team': return (e.tm || []).includes(p.v);
    case 'teams': return (e.tm || []).filter(t => t.startsWith('team-')).length >= p.min;
    case 'award': return (e.aw || []).includes(p.v);
    case 'stat': return !!e.st && e.st[p.v] != null && e.st[p.v] >= p.min;
    case 'decade': return (e.dc || []).includes(p.v);
    case 'act': return !!e.act;
    case 'draft1': return !!e.d1;
    case 'col': return e.col === p.v;
    case 'titles': return inRange(e.ti || 0, p);
    case 'conf': return e.cf === p.v;
    case 'division': return e.dv === p.v;
    case 'founded': return inRange(e.fy, p);
    default: throw new Error('unknown predicate ' + p.k);
  }
}

export function fieldsOf(p, out = new Set()) {
  if (p.k === 'all' || p.k === 'any') p.of.forEach(q => fieldsOf(q, out));
  else if (p.k === 'not') fieldsOf(p.p, out);
  else { if (!FIELD[p.k]) throw new Error('unknown predicate ' + p.k); out.add(FIELD[p.k]); }
  return out;
}

/* Fields the prompt leans on that are not complete for its years. */
export function coverageProblems(q) {
  const problems = [];
  const from = q.years && q.years[0];
  if (!Array.isArray(q.years) || q.years.length !== 2 || !(from <= q.years[1]))
    return ['the prompt needs years: [from, to]'];
  const fields = new Set();
  for (const p of q.where || []) fieldsOf(p, fields);
  const awards = [];
  const walk = p => { if (p.k === 'all' || p.k === 'any') p.of.forEach(walk); else if (p.k === 'not') walk(p.p); else if (p.k === 'award') awards.push(p.v); };
  (q.where || []).forEach(walk);
  for (const a of awards) {
    if (!(a in CONFIG.AWARD_COVERAGE)) continue;
    const c = CONFIG.AWARD_COVERAGE[a];
    if (!c) problems.push('the award ' + a + ' is not complete enough to author against');
    else if (from < c.from) problems.push('the award ' + a + ' is only complete from ' + c.from);
  }
  for (const f of fields) {
    const c = CONFIG.FIELD_COVERAGE[f];
    if (!c) problems.push(f + ' is not complete enough to author against');
    else if (from < c.from) problems.push(f + ' is only complete from ' + c.from + ' and the prompt starts at ' + from);
  }
  return problems;
}

/* Every entity the query accepts. */
export function validSet(q, list = store().list) {
  const want = q.type === 'team' ? 't' : 'p';
  return list.filter(e => e.s === q.league && e.k === want && (q.where || []).every(p => test(e, p)));
}
