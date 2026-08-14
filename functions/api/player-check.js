/* Live player lookup (Cloudflare Pages Function)
 *
 * POST /api/player-check   body: { names: ["Chase Brown", ...] }
 *   → { players: { "chase brown": <profile|null>, ... } }
 *
 * Sportegories grades against a 9,400-player corpus. Real athletes outside it
 * used to be told "No player by that name", which is both wrong and unfair —
 * Chase Brown is a Bengals running back, he just isn't in our file. This
 * endpoint answers the only question the corpus can't: does this person exist,
 * and what are the facts of their career?
 *
 * It is a deliberately dumb proxy. It returns raw Wikidata labels and lets the
 * client decide what they mean, so all the game-specific mapping lives in
 * arcade/livecheck.js where it can be unit-tested without a network.
 *
 * Profile shape:
 *   { found, qid, name, occupations:[], sports:[], positions:[],
 *     teams:[{name,start,end}], colleges:[], awards:[], died:bool }
 */

const WD = 'https://www.wikidata.org/w/api.php';
const UA = 'RunTheArcade/1.0 (https://runthe.gg; sportegories answer verification)';

const MAX_NAMES = 10;
const MAX_NAME_LEN = 60;
const EDGE_TTL = 60 * 60 * 24 * 7;   // careers don't change hourly

/* Claims we read off an entity. */
const P_OCCUPATION = 'P106';
const P_SPORT = 'P641';
const P_TEAM = 'P54';
const P_POSITION = 'P413';
const P_COLLEGE = 'P69';
const P_AWARD = 'P166';
const P_DEATH = 'P570';
const Q_START = 'P580';
const Q_END = 'P582';

export async function onRequestPost(context) {
  const { request } = context;
  try {
    let body = {};
    try { body = await request.json(); } catch (e) {}
    const names = Array.isArray(body.names) ? body.names : [];
    const clean = [];
    const seen = Object.create(null);
    for (const raw of names) {
      const s = String(raw == null ? '' : raw).trim().replace(/\s+/g, ' ');
      if (!s || s.length > MAX_NAME_LEN) continue;
      const k = s.toLowerCase();
      if (seen[k]) continue;
      seen[k] = 1;
      clean.push(s);
      if (clean.length >= MAX_NAMES) break;
    }
    if (!clean.length) return json({ players: {} });

    const players = {};
    // One search per name, then a single batched entity read. Search can't be
    // batched; everything after it can.
    const hits = await Promise.all(clean.map((n) => searchName(n)));
    const ids = [];
    hits.forEach((h) => h.forEach((q) => { if (ids.indexOf(q) < 0) ids.push(q); }));

    const entities = await getEntities(ids, 'claims|labels');

    // Pick, per name, the first candidate that actually looks like an athlete.
    const chosen = {};
    const refs = [];
    clean.forEach((n, i) => {
      const q = hits[i].find((id) => isAthlete(entities[id]));
      chosen[n.toLowerCase()] = q || null;
      if (q) collectRefs(entities[q], refs);
    });

    const labels = await getLabels(refs);

    clean.forEach((n) => {
      const k = n.toLowerCase();
      const q = chosen[k];
      players[k] = q ? profileOf(q, entities[q], labels) : { found: false };
    });

    return json({ players }, 200, EDGE_TTL);
  } catch (e) {
    // Fail soft and say so: the caller keeps its corpus-only verdict rather
    // than showing the player a broken screen.
    return json({ error: 'lookup_failed', detail: String(e && e.message || e) }, 502);
  }
}

/* ---------- Wikidata ---------- */

async function wd(params) {
  const u = new URL(WD);
  u.searchParams.set('format', 'json');
  u.searchParams.set('formatversion', '2');
  for (const k in params) u.searchParams.set(k, params[k]);
  const r = await fetch(u.toString(), {
    headers: { 'User-Agent': UA, 'Accept': 'application/json' },
    cf: { cacheTtl: EDGE_TTL, cacheEverything: true },
  });
  if (!r.ok) throw new Error('wikidata ' + r.status);
  return r.json();
}

async function searchName(name) {
  const j = await wd({ action: 'wbsearchentities', search: name, language: 'en', uselang: 'en', type: 'item', limit: '6' });
  return (j.search || []).map((s) => s.id);
}

async function getEntities(ids, props) {
  const out = {};
  for (let i = 0; i < ids.length; i += 50) {
    const j = await wd({ action: 'wbgetentities', ids: ids.slice(i, i + 50).join('|'), props: props, languages: 'en' });
    Object.assign(out, j.entities || {});
  }
  return out;
}

async function getLabels(ids) {
  const uniq = [];
  ids.forEach((q) => { if (q && uniq.indexOf(q) < 0) uniq.push(q); });
  const ents = await getEntities(uniq, 'labels');
  const out = {};
  for (const q in ents) {
    const l = ents[q] && ents[q].labels && ents[q].labels.en;
    if (l) out[q] = l.value;
  }
  return out;
}

/* ---------- shaping ---------- */

function claims(e, pid) {
  return (e && e.claims && e.claims[pid]) || [];
}
function idOf(st) {
  const v = st && st.mainsnak && st.mainsnak.datavalue && st.mainsnak.datavalue.value;
  return v && v.id ? v.id : null;
}
function yearOf(st, pid) {
  const q = st && st.qualifiers && st.qualifiers[pid];
  const t = q && q[0] && q[0].datavalue && q[0].datavalue.value && q[0].datavalue.value.time;
  if (!t) return null;
  const m = /^[+-](\d{4})/.exec(t);
  return m ? parseInt(m[1], 10) : null;
}

/* Occupations that mean "this is a person who played a sport". Guards against
 * a name search landing on a city, a song, or the athlete's father. */
const ATHLETE_OCC = {
  Q3665646: 1,   // basketball player
  Q19204627: 1,  // American football player
  Q10871364: 1,  // baseball player
  Q11774891: 1,  // ice hockey player
  Q937857: 1,    // association football player
  Q10833314: 1,  // tennis player
  Q11303721: 1,  // golfer
  Q10843402: 1,  // swimmer
  Q11513337: 1,  // athletics competitor
  Q13381863: 1,  // boxer
  Q10842936: 1,  // racing driver
  Q2309784: 1,   // sport cyclist
  Q4009406: 1,   // sportsperson
  Q13381376: 1,  // mixed martial artist
  Q13474373: 1,  // professional wrestler
};
function isAthlete(e) {
  if (!e || e.missing !== undefined) return false;
  if (claims(e, P_TEAM).length) return true;
  if (claims(e, P_SPORT).length && claims(e, P_POSITION).length) return true;
  return claims(e, P_OCCUPATION).some((st) => ATHLETE_OCC[idOf(st)]);
}

function collectRefs(e, out) {
  [P_OCCUPATION, P_SPORT, P_TEAM, P_POSITION, P_COLLEGE, P_AWARD].forEach((p) => {
    claims(e, p).forEach((st) => { const q = idOf(st); if (q) out.push(q); });
  });
}

function labelsFor(e, pid, labels) {
  const out = [];
  claims(e, pid).forEach((st) => {
    const l = labels[idOf(st)];
    if (l && out.indexOf(l) < 0) out.push(l);
  });
  return out;
}

function profileOf(qid, e, labels) {
  const teams = [];
  claims(e, P_TEAM).forEach((st) => {
    const l = labels[idOf(st)];
    if (!l) return;
    teams.push({ name: l, start: yearOf(st, Q_START), end: yearOf(st, Q_END) });
  });
  return {
    found: true,
    qid: qid,
    name: (e.labels && e.labels.en && e.labels.en.value) || '',
    occupations: labelsFor(e, P_OCCUPATION, labels),
    sports: labelsFor(e, P_SPORT, labels),
    positions: labelsFor(e, P_POSITION, labels),
    colleges: labelsFor(e, P_COLLEGE, labels),
    awards: labelsFor(e, P_AWARD, labels),
    teams: teams,
    died: claims(e, P_DEATH).length > 0,
  };
}

/* Pages only routes onRequest*; these are here so scripts/check-livecheck.mjs
 * can exercise the claim parsing without reaching Wikidata. */
export const _test = { profileOf, isAthlete, yearOf, idOf };

function json(obj, status, ttl) {
  const h = { 'content-type': 'application/json; charset=utf-8' };
  if (ttl) h['cache-control'] = 'public, max-age=' + ttl;
  return new Response(JSON.stringify(obj), { status: status || 200, headers: h });
}
