/* Last Shot's playbooks, on the plumbing both coaching games share:
 * /assets/playbook.js (window.RTG_PLAYBOOK; the owner asked for one copy,
 * 2026-11-02). This file is the basketball half: the game's key and limits,
 * what a play carries (its situation and frame notes), and the sets a coach
 * saves. The store, the file and the model live in the shared module.
 *
 * A playbook needs an account (the owner's call, 2026-10-30). Signed in,
 * books and the terminology live in the shared cloud saves, game 'last_shot':
 * slot 'index' and one 'b-<id>' slot per book, a local copy first and the
 * account behind it, rev deciding a conflict (see /assets/playbook.js). A
 * save is at most 512 KB.
 *
 * A playbook:
 *   { id, name, rev, updated, team, sections: [{ id, name }], sets: [{ id, name, spots }],
 *     plays: [{ id, name, nameEdited, section, notes, frameNotes: { [beat]: text },
 *               situation: { clock, handler } | null, play, stats, updated }] }
 * stats: { [situationKey]: { byScheme: { switch: { n, w } ... }, test: { key, at, rows } } }
 */
export const GAME = 'last_shot', LS_PREFIX = 'last_shot_pb_', MAX_PLAYS = 300, MAX_BYTES = 512 * 1024;
export const FORMAT = 'last-shot-playbook';
const P = () => globalThis.RTG_PLAYBOOK;

export const newId = () => P().newId();
export const bytesOf = o => P().bytesOf(o);
export const newBook = name => P().newBook(name, { sets: [] });
export const newPlay = (book, play, opt = {}) => P().newPlay(book, play, opt,
  { frameNotes: {}, situation: opt.situation || null });
/* Count a run the coach watched, against the scheme the sim actually used. */
export const countRun = (entry, sitKey, scheme, win) => P().countRun(entry, sitKey, scheme, win, 'byScheme');
export const totals = byScheme => P().totals(byScheme);

export const exportFile = (book, terms) => P().exportFile(book, terms, { format: FORMAT });
export function importFile(text) {
  return P().importFile(text, {
    format: FORMAT, label: 'Last Shot', maxPlays: MAX_PLAYS,
    keepPlay: p => !!(p && p.play && p.play.spots && Array.isArray(p.play.steps)),
    lists: { sets: f => (f && f.spots ? { name: f.name || 'Set', spots: f.spots } : null) },
    mapPlay: (src, base) => Object.assign(base, {
      frameNotes: src.frameNotes && typeof src.frameNotes === 'object' ? src.frameNotes : {},
      situation: src.situation || null })
  });
}

export const createStore = onRemote => P().createStore({ game: GAME, prefix: LS_PREFIX, maxBytes: MAX_BYTES, onRemote });
