/* A Stumpire challenge, ruled on the spot.
 *
 * A strike in Stumpire is always a real player the slate did not list for the
 * prompt, so a challenge is a factual claim about one known person: "he WAS a
 * Pro Bowl linebacker". This looks him up live and rules on the prompt's own
 * query:
 *
 *   upheld   the record confirms every part of the query. The challenge is
 *            settled at once, exactly as an admin upholding it would settle it.
 *   denied   the record contradicts part of it (another league, a team he
 *            never played for). Settled at once.
 *   unsure   the record cannot settle it, which is most award prompts:
 *            Wikidata lists a fraction of the Pro Bowls and All-Star games that
 *            happened. The challenge stays open for the admin, as before.
 *   offline  Wikidata did not answer. The challenge stays open.
 *
 * The reading is Sportegories' (arcade/livecheck.js), because the two games
 * share one vocabulary: Stumpire's datasets were built from the Sportegories
 * index, so its positions, awards and colleges ARE Sportegories' names, and a
 * franchise id resolves to the team name Sportegories keys on. A predicate
 * that does not translate (a career stat, a team's title count) is unknown,
 * never false, so it can only ever leave a challenge open.
 *
 * Absence is never a denial: livecheck.js treats a missing award as unknown,
 * and so does everything here. Only a positive contradiction denies. */
import { athletesNamed } from '../_sportegories/challenge.js';

/* One Stumpire predicate to one Sportegories predicate, or null. */
export function translate(p, getEntity, D) {
  switch (p.k) {
    case 'pos':    return D.pos.includes(p.v) ? { k: 'pos', v: p.v } : null;
    case 'award':  return D.awards.includes(p.v) ? { k: 'award', v: p.v } : null;
    case 'col':    return D.cols.includes(p.v) ? { k: 'col', v: p.v } : null;
    case 'decade': return { k: 'decade', v: p.v };
    case 'act':    return { k: 'act' };
    case 'draft1': return { k: 'draft1' };
    case 'teams':  return { k: 'teams', min: p.min };
    case 'team': {
      const t = getEntity(p.v);
      return t && D.teams.includes(t.n) ? { k: 'team', v: t.n } : null;
    }
    default: return null;                      // stat, titles, conf, division, founded
  }
}

/* True, false or null for a Wikidata profile against a Stumpire predicate. */
export function judge(s, p, ctx) {
  if (p.k === 'all') {
    let unknown = false;
    for (const q of p.of) { const v = judge(s, q, ctx); if (v === false) return false; if (v === null) unknown = true; }
    return unknown ? null : true;
  }
  if (p.k === 'any') {
    let unknown = false;
    for (const q of p.of) { const v = judge(s, q, ctx); if (v === true) return true; if (v === null) unknown = true; }
    return unknown ? null : false;
  }
  if (p.k === 'not') { const v = judge(s, p.p, ctx); return v === null ? null : !v; }
  const q = translate(p, ctx.getEntity, ctx.D);
  if (!q) return null;
  return ctx.LC.verdict(s, q, {});
}

/* entity: the Stumpire record that was struck. def: the prompt { league,
   type, years, where }. deps: { SP, LC, wiki, getEntity }. */
export async function liveRule(entity, def, deps) {
  const { SP, LC, wiki, getEntity } = deps;
  if (!entity || !def) return { verdict: 'unsure', msg: 'Sent to the umpire’s booth.' };
  if (entity.k !== 'p' || def.type === 'team') return { verdict: 'unsure', msg: 'Sent to the umpire’s booth.' };
  // The league is our own record and it is never wrong about which sport a man played.
  if (entity.s !== def.league) return { verdict: 'denied', msg: entity.n + ' is ' + (entity.s === 'NFL' ? 'an' : 'a') + ' ' + entity.s + ' player.' };

  /* The years are the prompt's, judged on our own decades the way the slate
     was built (query.js inYears). Upholding on the query alone would let a
     1980s Pro Bowler into "played after 1995". */
  if (Array.isArray(def.years) && (entity.dc || []).length) {
    const lo = Math.floor(def.years[0] / 10) * 10, hi = def.years[1];
    if (!entity.dc.some((d) => d >= lo && d <= hi)) {
      return { verdict: 'denied', msg: 'The call stands. ' + entity.n + ' played outside this prompt’s years.' };
    }
  }

  const D = SP.data();
  const key = SP.nameKey(entity.n);
  let profiles;
  try { profiles = await athletesNamed(entity.n, key, wiki, SP); }
  catch (e) { return { verdict: 'offline', msg: 'Couldn’t reach the record books. The umpire will look at the tape.' }; }
  if (!profiles.length) return { verdict: 'unsure', msg: 'Couldn’t find him in the record books. Sent to the umpire’s booth.' };

  const ctx = { D, LC, getEntity };
  const where = { k: 'all', of: def.where || [] };
  let sawFalse = false, sawNull = false;
  for (const prof of profiles) {
    const v = judge(LC.shape(prof, D), where, ctx);
    if (v === true) return { verdict: 'upheld', qid: prof.qid || null, wdName: prof.name || null,
      msg: 'Overturned. The record books say ' + entity.n + ' fits. We fixed the slate.' };
    if (v === false) sawFalse = true; else sawNull = true;
  }
  if (sawFalse && !sawNull) return { verdict: 'denied', qid: profiles[0].qid || null, wdName: profiles[0].name || null,
    msg: 'The call stands. The record books say ' + entity.n + ' does not fit.' };
  return { verdict: 'unsure', msg: 'The record books can’t settle it. Sent to the umpire’s booth.' };
}
