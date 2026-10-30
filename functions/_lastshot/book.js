/* Playbooks, kept on the player's Run The Games account.
 *
 * The pattern is 4th and What's book.js (sellybros711/runthe-gg-site#829),
 * built for Last Shot. The owner wants the two games to share this code once
 * that PR is on main; until then it is a copy with the same shape, so moving
 * to a shared module is a swap, not a rewrite.
 *
 * A playbook needs an account (the owner's call, 2026-10-30): signed out the
 * page offers sign in and keeps nothing. Signed in, every playbook and the
 * coach's terminology live in the site's shared cloud saves
 * (/assets/cloudsave.js, supabase/103_cloud_saves.sql), game 'last_shot':
 * slot 'index' (the list of books and the terms) and slot 'b-<id>' per book.
 * No new table. A save is at most 512 KB.
 *
 * LOCAL FIRST: an edit writes a copy in this browser at once (under the
 * account's id) and the cloud catches up. Opening reads the copy, then the
 * account, and the newer wins. Each save carries `rev`, raised on every edit;
 * the server refuses an older one and hands back the newer copy, which
 * replaces ours (the page says so).
 *
 * A playbook:
 *   { id, name, rev, updated, team, sections: [{ id, name }], sets: [{ id, name, spots }],
 *     plays: [{ id, name, nameEdited, section, notes, frameNotes: { [beat]: text },
 *               situation: { clock, handler } | null, play, stats, updated }] }
 * stats: { [situationKey]: { byScheme: { switch: { n, w } ... }, test: { key, at, rows } } }
 */
export const GAME = 'last_shot', INDEX = 'index', LS_PREFIX = 'last_shot_pb_', MAX_PLAYS = 300, MAX_BYTES = 512 * 1024;

const now = () => new Date().toISOString();
const copy = o => JSON.parse(JSON.stringify(o));
let idCount = 0;
export function newId() {
  let a = '';
  try { const b = new Uint8Array(6); globalThis.crypto.getRandomValues(b); for (let i = 0; i < 6; i++) a += (b[i] % 36).toString(36); }
  catch (e) { a = (Date.now() % 2176782336).toString(36) + (idCount++).toString(36); }
  return a;
}

/* ---------- the model (pure) ---------- */

export function newBook(name) {
  return { id: newId(), name: String(name || 'My playbook').slice(0, 60), rev: 1, updated: now(), team: '',
    sections: [{ id: newId(), name: 'Plays' }], sets: [], plays: [] };
}
export function newPlay(book, play, opt = {}) {
  return { id: newId(), name: String(opt.name || 'New play').slice(0, 80), nameEdited: !!opt.nameEdited,
    section: opt.section || (book.sections[0] && book.sections[0].id) || null, notes: String(opt.notes || '').slice(0, 500),
    frameNotes: {}, situation: opt.situation || null, play: copy(play), stats: {}, updated: now() };
}
/* Count a run the coach watched, against the scheme the sim actually used. */
export function countRun(entry, sitKey, scheme, win) {
  const st = entry.stats[sitKey] = entry.stats[sitKey] || {};
  const b = st.byScheme = st.byScheme || {};
  const c = b[scheme] = b[scheme] || { n: 0, w: 0 };
  c.n++; if (win) c.w++;
}
export function totals(byScheme) {
  let n = 0, w = 0;
  for (const k in byScheme || {}) { n += byScheme[k].n; w += byScheme[k].w; }
  return { n, w };
}
export function bytesOf(o) { return new TextEncoder().encode(JSON.stringify(o)).length; }

/* A file a coach can keep or hand to another coach. Import gives every
   playbook, section, set and play a fresh id, so it never overwrites anything. */
export const FORMAT = 'last-shot-playbook';
export function exportFile(book, terms) { return JSON.stringify({ format: FORMAT, version: 1, exported: now(), book, terms: terms || null }, null, 1); }
export function importFile(text) {
  const o = JSON.parse(text);
  if (!o || o.format !== FORMAT || !o.book || !Array.isArray(o.book.plays) || !Array.isArray(o.book.sections)) throw new Error('That is not a Last Shot playbook file.');
  const b = copy(o.book), map = {};
  b.id = newId(); b.rev = 1; b.updated = now();
  b.name = String(b.name || 'Imported playbook').slice(0, 60);
  b.sections = b.sections.filter(s => s && s.id).map(s => { const id = newId(); map[s.id] = id; return { id, name: String(s.name || 'Plays').slice(0, 40) }; });
  if (!b.sections.length) b.sections = [{ id: newId(), name: 'Plays' }];
  b.sets = (b.sets || []).filter(f => f && f.spots).map(f => ({ id: newId(), name: String(f.name || 'Set').slice(0, 30), spots: f.spots }));
  b.plays = b.plays.filter(p => p && p.play && p.play.spots && Array.isArray(p.play.steps)).slice(0, MAX_PLAYS).map(p => ({
    id: newId(), name: String(p.name || 'Play').slice(0, 80), nameEdited: !!p.nameEdited, section: map[p.section] || b.sections[0].id,
    notes: String(p.notes || '').slice(0, 500), frameNotes: p.frameNotes && typeof p.frameNotes === 'object' ? p.frameNotes : {},
    situation: p.situation || null, play: p.play, stats: p.stats || {}, updated: now() }));
  b.team = String(b.team || '').slice(0, 60);
  return { book: b, terms: o.terms || null };
}

/* ---------- the store (browser) ---------- */

function auth() {
  const A = globalThis.RTG_AUTH, s = A && A.state ? A.state() : null;
  return s && s.signedIn && s.userId ? s : null;
}
const lsKey = uid => LS_PREFIX + uid;
function readLocal(uid) { try { return JSON.parse(globalThis.localStorage.getItem(lsKey(uid)) || 'null'); } catch (e) { return null; } }
function writeLocal(uid, data) { try { globalThis.localStorage.setItem(lsKey(uid), JSON.stringify(data)); } catch (e) {} }

export function createStore(onRemote) {
  let uid = null, data = null;
  const blank = () => ({ index: { rev: 1, books: [], terms: null }, books: {} });
  const save = () => { if (uid) writeLocal(uid, data); };
  const cloud = () => globalThis.RTG_SAVE || null;

  function pushIndex() {
    const S = cloud(); if (!S) return;
    S.queue(GAME, INDEX, () => ({ payload: data.index, progress: data.index.rev })).then(r => {
      if (r && r.ok === false && r.payload) { data.index = r.payload; save(); onRemote && onRemote('index'); }
    });
  }
  function pushBook(id) {
    const S = cloud(); if (!S) return;
    S.queue(GAME, 'b-' + id, () => { const b = data.books[id]; return b ? { payload: b, progress: b.rev } : null; }).then(r => {
      if (r && r.ok === false && r.payload) { data.books[id] = r.payload; save(); onRemote && onRemote('book', id); }
    });
  }
  function touchIndex() {
    data.index.rev++;
    data.index.books = Object.keys(data.books).map(id => { const b = data.books[id]; return { id, name: b.name, updated: b.updated, plays: b.plays.length }; })
      .sort((a, b) => (a.updated < b.updated ? 1 : -1));
    save(); pushIndex();
  }

  return {
    who: auth,
    open() {
      const a = auth(); if (!a) { uid = null; data = null; return Promise.resolve(null); }
      uid = a.userId; data = readLocal(uid) || blank();
      const S = cloud(); if (!S || !S.all) return Promise.resolve(data);
      return S.all(GAME).then(rows => {
        if (!rows || !uid || uid !== a.userId) return data;
        rows.forEach(r => {
          if (!r || !r.payload) return;
          if (r.slot === INDEX) { if ((r.progress || 0) >= (data.index.rev || 0)) data.index = r.payload; }
          else if (r.slot.indexOf('b-') === 0) { const id = r.slot.slice(2), mine = data.books[id]; if (!mine || (r.progress || 0) >= (mine.rev || 0)) data.books[id] = r.payload; }
        });
        Object.keys(data.books).forEach(id => { if (!rows.some(r => r.slot === 'b-' + id)) pushBook(id); });
        const listed = data.index.books.map(b => b.id);
        if (Object.keys(data.books).some(id => !listed.includes(id))) touchIndex();
        save();
        return data;
      }, () => data);
    },
    ready: () => !!data,
    books: () => (data ? Object.keys(data.books).map(id => data.books[id]).sort((a, b) => (a.updated < b.updated ? 1 : -1)) : []),
    book: id => (data && data.books[id]) || null,
    terms: () => (data && data.index.terms) || null,
    setTerms(t) { if (!data) return; data.index.terms = t; data.index.rev++; save(); pushIndex(); },
    /* Every change to a book goes through here: it raises rev and saves it.
       A book over the cloud's 512 KB cap is refused, and the caller says so. */
    put(book) {
      if (!data) return null;
      if (bytesOf(book) > MAX_BYTES) return null;
      book.rev = (book.rev || 0) + 1; book.updated = now();
      data.books[book.id] = book; save(); pushBook(book.id); touchIndex();
      return book;
    },
    remove(id) {
      if (!data || !data.books[id]) return;
      delete data.books[id]; save();
      const S = cloud(); if (S && S.drop) S.drop(GAME, 'b-' + id);
      touchIndex();
    }
  };
}
