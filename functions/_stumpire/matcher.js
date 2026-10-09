/* Stumpire's answer engine. THE GAME MUST NEVER REJECT A CORRECT ANSWER, so
 * this file's job is to turn whatever was typed into a person or a team, or
 * to say plainly that it could not (NO PITCH, no penalty) or that it needs
 * the player to pick (the picker). It never decides validity: that is a
 * question about the prompt, answered by the game against frozen rows.
 *
 * Order, first hit wins:
 *   1. a tapped suggestion's id
 *   2. an exact name, then an exact alias (nickname, former or maiden name,
 *      initials, a team's old name), then the same words in another order
 *   3. a surname on its own, when it names one person (several: the picker)
 *   4. fuzzy, above CONFIG.FUZZY_MIN; a near tie goes to the picker
 *   5. NO PITCH
 *
 * Narrowing by the prompt's LEAGUE and TYPE is allowed because both are on
 * screen. Narrowing by whether a candidate is a valid answer is NOT: that would
 * tell the player the answer before the ruling.
 */
import { CONFIG } from './config.js';
import { key, sortedKey, tokens, fold, similarity, trigrams, suffixOf } from './normalize.js';
import { store, get, brief } from './entities.js';

let IDX = null;
let IDX_FOR = null;

function push(map, k, id) {
  if (!k) return;
  let a = map.get(k);
  if (!a) map.set(k, a = []);
  if (!a.includes(id)) a.push(id);
}

export function buildIndex(list) {
  const names = new Map(), aliases = new Map(), sorted = new Map(), sur = new Map();
  const keys = [];              // [key, id] for fuzzy
  const grams = new Map();      // trigram -> indexes into keys
  const search = [];            // typeahead rows
  const addFuzzy = (k, id) => {
    const i = keys.length; keys.push([k, id]);
    for (const g of trigrams(k)) { let a = grams.get(g); if (!a) grams.set(g, a = []); a.push(i); }
  };
  for (const e of list) {
    const forms = [e.n];
    if (e.k === 't') {
      if (e.city && e.nick) forms.push(e.city + ' ' + e.nick);
    }
    for (const f of forms) { push(names, key(f), e.id); addFuzzy(key(f), e.id); }
    for (const a of (e.a || [])) { push(aliases, key(a), e.id); addFuzzy(key(a), e.id); }
    push(sorted, sortedKey(e.n), e.id);
    if (e.k === 'p') { const t = tokens(e.n); if (t.length > 1) push(sur, t[t.length - 1], e.id); }
    search.push({ id: e.id, name: e.n, f: fold(e.n), k: key(e.n),
      alt: (e.a || []).map(a => ({ f: fold(a), k: key(a) })) });
  }
  search.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : (a.id < b.id ? -1 : 1)));
  return { names, aliases, sorted, sur, keys, grams, search };
}

function idx() {
  const s = store();
  if (IDX_FOR !== s) { IDX = buildIndex(s.list); IDX_FOR = s; }
  return IDX;
}

/* Keep the candidates in the prompt's league and of the prompt's type, if
   any are; otherwise keep them all (an off-league answer is a strike, not a
   no pitch, and the player deserves to hear which). */
function narrow(ids, ctx) {
  let out = ids.slice();
  if (ctx && ctx.league) { const n = out.filter(id => (get(id) || {}).s === ctx.league); if (n.length) out = n; }
  if (ctx && ctx.type) {
    const want = ctx.type === 'team' ? 't' : 'p';
    const n = out.filter(id => (get(id) || {}).k === want); if (n.length) out = n;
  }
  return out;
}

function options(ids) {
  return ids.map(id => brief(get(id))).filter(Boolean)
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : (a.tag < b.tag ? -1 : 1)))
    .slice(0, CONFIG.PICKER_MAX);
}

function decide(ids, via, ctx, sfx) {
  let c = narrow(ids, ctx);
  if (sfx && c.length > 1) {
    const n = c.filter(id => suffixOf((get(id) || {}).n || '') === sfx);
    if (n.length) c = n;
  }
  if (c.length === 1) return { status: 'match', id: c[0], via };
  if (c.length > 1 && c.length <= CONFIG.PICKER_MAX) return { status: 'picker', via, options: options(c) };
  if (c.length > CONFIG.PICKER_MAX) return { status: 'nopitch', reason: 'too_many', via };
  return null;
}

/* input: { entityId } or { text }. ctx: { league, type }. */
export function resolve(input, ctx = {}) {
  const I = idx();
  if (input && input.entityId) {
    return get(input.entityId) ? { status: 'match', id: input.entityId, via: 'id' }
      : { status: 'nopitch', reason: 'unknown_id' };
  }
  const raw = String((input && input.text) || '').slice(0, CONFIG.RAW_INPUT_MAX);
  const k = key(raw);
  if (!k || k.length < 2) return { status: 'nopitch', reason: 'empty' };

  for (const [map, kk, via] of [[I.names, k, 'exact'], [I.aliases, k, 'alias'], [I.sorted, sortedKey(raw), 'order']]) {
    const hit = map.get(kk);
    if (hit && hit.length) { const d = decide(hit, via, ctx, suffixOf(raw)); if (d) return d; }
  }

  const toks = tokens(raw);
  if (toks.length === 1) {
    const hit = I.sur.get(toks[0]);
    if (hit && hit.length) { const d = decide(hit, 'surname', ctx); if (d && d.status !== 'nopitch') return d; }
  }

  // Fuzzy: block on shared trigrams, score with edit distance.
  const g = trigrams(k);
  const counts = new Map();
  for (const t of g) for (const i of (I.grams.get(t) || [])) counts.set(i, (counts.get(i) || 0) + 1);
  const need = Math.max(1, Math.floor(g.size * 0.3));
  const best = new Map();
  for (const [i, c] of counts) {
    if (c < need) continue;
    const [kk, id] = I.keys[i];
    const sc = similarity(k, kk);
    if (sc >= CONFIG.FUZZY_MIN && sc > (best.get(id) || 0)) best.set(id, sc);
  }
  if (best.size) {
    let ranked = [...best.entries()];
    const keepIds = new Set(narrow(ranked.map(r => r[0]), ctx));
    ranked = ranked.filter(r => keepIds.has(r[0])).sort((a, b) => b[1] - a[1]);
    const top = ranked[0][1];
    const close = ranked.filter(r => r[1] >= top - CONFIG.PICKER_GAP).map(r => r[0]);
    if (close.length === 1) return { status: 'match', id: close[0], via: 'fuzzy', score: top };
    return { status: 'picker', via: 'fuzzy', options: options(close) };
  }
  return { status: 'nopitch', reason: 'no_match' };
}

/* Typeahead over the WHOLE dataset, alphabetical, never by popularity. */
export function suggest(prefix, limit = CONFIG.TYPEAHEAD_MAX) {
  const q = fold(prefix), qk = key(prefix);
  if (q.replace(/ /g, '').length < CONFIG.TYPEAHEAD_MIN_CHARS) return [];
  const hit = r => {
    const forms = [{ f: r.f, k: r.k }, ...r.alt];
    for (const x of forms) {
      if (x.f.startsWith(q) || x.k.startsWith(qk)) return true;
      if (!q.includes(' ') && x.f.split(' ').some(w => w.startsWith(q))) return true;
    }
    return false;
  };
  const out = [];
  for (const r of idx().search) {
    if (!hit(r)) continue;
    out.push(brief(get(r.id)));
    if (out.length >= limit) break;
  }
  return out;
}
