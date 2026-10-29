/* A Sportegories challenge, ruled on the spot.
 *
 * A player who thinks the card got them wrong presses Challenge. This file
 * decides, live, and remembers the answer:
 *
 *   upheld     the record books say the answer fits. It scores, and the
 *              ruling is saved so no later card marks it wrong.
 *   denied     the record books say it does not. Saved too, so the same
 *              challenge is answered at once next time.
 *   unsure     the record books cannot settle it (a career total, an award
 *              Wikidata does not list). Nothing is saved as a ruling; the
 *              answer goes to answer_gaps (78) for a person to look at.
 *   offline    Wikidata did not answer. Nothing is saved and nothing is said
 *              about the answer, because we never got to ask.
 *
 * WHY THE SERVER RULES AND NOT THE PAGE. A ruling is shared: one upheld
 * challenge changes the card for everybody after it. A page that could write
 * "upheld" could make any name count for any category, so the page only asks.
 * What it asks about is re-checked here against the game's own rules (the
 * letter, a full name) and against a public source the page cannot touch.
 *
 * Unlike Stumpire, whose challenges wait in a queue for an admin, this rules at
 * once, because a Sportegories answer is a factual claim a public record can
 * settle (did he play for the Lakers, did he go to Duke), not a judgement call.
 * The claims that cannot be settled that way are exactly the ones that come
 * back unsure.
 *
 * Every dependency is injected, so scripts/check-sportegories-challenge.mjs
 * runs the whole thing in node against canned Wikidata answers. */

export const DENIED_TTL_DAYS = 30;   // a denial is re-asked after this: Wikidata grows

export function ruleKey(SP, answer) { return SP.nameKey(answer); }

/* deps: { SP, LC, wiki, db, now }
 *   SP    arcade/sportegories.js with its data set
 *   LC    arcade/livecheck.js with setEngine(SP) done
 *   wiki  { searchName, getEntities, getLabels, isAthlete, collectRefs, profileOf }
 *   db    { get(key, label), put(row), gap(row) } or null (no memory) */
export async function rule(body, deps) {
  const { SP, LC, wiki, db } = deps;
  const now = deps.now || Date.now();
  const D = SP.data();
  const answer = String((body && body.answer) || '').trim().replace(/\s+/g, ' ');
  const letter = String((body && body.letter) || '').trim().toUpperCase();
  const cat = Number(body && body.cat);
  const label = String((body && body.label) || '');

  if (!answer || answer.length > 60) return { verdict: 'refused', msg: 'Nothing to challenge.' };
  if (!/^[A-Z]$/.test(letter)) return { verdict: 'refused', msg: 'Nothing to challenge.' };
  if (!Number.isInteger(cat) || !D.cats[cat]) return { verdict: 'refused', msg: 'Nothing to challenge.' };
  // The page and this server ship together, so a label that disagrees with the
  // index is a page cached from an older build. Rule on nothing rather than on
  // the wrong category.
  if (D.cats[cat].l !== label) return { verdict: 'stale', msg: 'This card is out of date. Reload to challenge.' };

  /* The game's own rules are not challengeable. A wrong letter is wrong
     whoever the man is, and a surname alone is not an answer. */
  const puz = { letter, cats: [{ i: cat, label }] };
  const r = SP.check(puz, 0, answer, {});
  if (r.reason === 'empty' || r.reason === 'fullname' || r.reason === 'letter') {
    return { verdict: 'refused', msg: r.msg || 'That one is against the rules, not the record books.' };
  }
  if (r.ok) return { verdict: 'upheld', msg: 'That one counts.', already: true };

  const key = SP.nameKey(answer);
  const def = D.cats[cat];

  /* Memory first. An admin's ruling is final and is never written over; an
     upheld one stands; a denial is trusted for DENIED_TTL_DAYS and then asked
     again, because the public record keeps filling in. */
  let prior = null;
  if (db) { try { prior = await db.get(key, def.l); } catch (e) { prior = null; } }
  if (prior && prior.source === 'admin') return said(prior, true);
  if (prior && prior.verdict === 'upheld') return said(prior, true);
  if (prior && prior.verdict === 'denied' &&
      now - Date.parse(prior.updated_at || prior.created_at || 0) < DENIED_TTL_DAYS * 864e5) {
    return said(prior, true);
  }

  /* The live look. Every athlete the search returns is judged, not just the
     first: a name is often two people, and the category may fit only one of
     them, which is the same "any same-named man" rule check() runs on our
     own file. A candidate must share the typed surname, so a search that
     wanders to somebody else entirely cannot rule on this answer. */
  let profiles;
  try { profiles = await athletesNamed(answer, key, wiki, SP); }
  catch (e) { return { verdict: 'offline', msg: 'Couldn’t reach the record books. Try again in a minute.' }; }

  let best = null, sawFalse = false, sawNull = false;
  const gapKinds = [];
  for (const prof of profiles) {
    const s = LC.shape(prof, D);
    const gaps = {};
    const v = LC.verdict(s, def.p, gaps);
    if (v === true) { best = prof; break; }
    if (v === false) sawFalse = true;
    if (v === null) { sawNull = true; (gaps.kinds || []).forEach((k) => { if (gapKinds.indexOf(k) < 0) gapKinds.push(k); }); }
  }

  const base = { answer_key: key, as_typed: answer.slice(0, 60), category: def.l, letter, source: 'wikidata' };
  if (best) {
    const row = { ...base, verdict: 'upheld', qid: best.qid || null, wd_name: best.name || null };
    if (db) { try { await db.put(row); } catch (e) {} }
    return { verdict: 'upheld', msg: 'Challenge won. ' + (best.name || answer) + ' fits. We fixed our records.', qid: row.qid };
  }
  if (sawFalse && !sawNull) {
    const row = { ...base, verdict: 'denied', qid: (profiles[0] && profiles[0].qid) || null, wd_name: (profiles[0] && profiles[0].name) || null };
    if (db) { try { await db.put(row); } catch (e) {} }
    return { verdict: 'denied', msg: 'We checked. The record books say no.' };
  }
  if (db) {
    try { await db.gap({ answer: answer.slice(0, 60), category: def.l, letter, kind: 'unverified', gaps: ['challenge'].concat(gapKinds).slice(0, 6).join(',') }); } catch (e) {}
  }
  if (!profiles.length) return { verdict: 'unsure', msg: 'Couldn’t find them in the record books. We logged it for a person to check.' };
  return { verdict: 'unsure', msg: 'The record books can’t settle this one. We logged it for a person to check.' };
}

function said(row, cached) {
  if (row.verdict === 'upheld') return { verdict: 'upheld', msg: 'Challenge won. That one counts.', cached, qid: row.qid || null };
  return { verdict: 'denied', msg: 'We checked. The record books say no.', cached };
}

export async function athletesNamed(answer, key, wiki, SP) {
  const hits = await wiki.searchName(answer);
  if (!hits.length) return [];
  const ents = await wiki.getEntities(hits, 'claims|labels');
  const last = String(key || '').split('|')[1] || '';
  const picked = hits.filter((q) => {
    const e = ents[q];
    if (!wiki.isAthlete(e)) return false;
    const nm = e.labels && e.labels.en && e.labels.en.value;
    const k = nm ? SP.nameKey(nm) : null;
    return !!k && k.split('|')[1] === last;
  });
  if (!picked.length) return [];
  const refs = [];
  picked.forEach((q) => wiki.collectRefs(ents[q], refs));
  const labels = await wiki.getLabels(refs);
  return picked.map((q) => wiki.profileOf(q, ents[q], labels));
}

/* The memory, over Supabase REST with the service role. The table is not
   readable by anon or authenticated (135): a ruling reaches a page only
   through GET on the route, and only the upheld ones. */
export function supabaseMemory(env, fetchFn) {
  if (!env || !env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE) return null;
  const f = fetchFn || fetch;
  const base = env.SUPABASE_URL.replace(/\/$/, '') + '/rest/v1/';
  const H = { apikey: env.SUPABASE_SERVICE_ROLE, Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE, 'Content-Type': 'application/json' };
  const enc = encodeURIComponent;
  return {
    async get(key, label) {
      const r = await f(base + 'sportegories_rulings?answer_key=eq.' + enc(key) + '&category=eq.' + enc(label) +
        '&select=verdict,source,qid,created_at,updated_at&limit=1', { headers: H });
      if (!r.ok) return null;
      const a = await r.json();
      return (a && a[0]) || null;
    },
    async put(row) {
      // Never over an admin's ruling: the filter on the conflict path is the
      // database's job (135's trigger), this just keeps the request honest.
      await f(base + 'sportegories_rulings?on_conflict=answer_key,category', {
        method: 'POST', headers: { ...H, Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ ...row, updated_at: new Date().toISOString() })
      });
    },
    async gap(row) {
      await f(base + 'answer_gaps', { method: 'POST', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify(row) });
    },
    async upheld(labels) {
      if (!labels.length) return [];
      const list = labels.map((l) => '"' + String(l).replace(/"/g, '') + '"').join(',');
      const r = await f(base + 'sportegories_rulings?verdict=eq.upheld&category=in.(' + enc(list) + ')&select=answer_key,category&limit=500', { headers: H });
      if (!r.ok) return [];
      const a = await r.json();
      return Array.isArray(a) ? a.map((x) => ({ a: x.answer_key, c: x.category })) : [];
    }
  };
}
