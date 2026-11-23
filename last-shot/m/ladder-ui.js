/* THE LADDER, the page side (Phase 2, 2026-11-13). The levels, their rules
 * and their stars are levels.js; this is only where a player's progress is
 * kept and how the Ladder screen draws it.
 *
 * STORAGE. One localStorage key, last_shot_ladder, shaped
 *   { v: 1, best: { '1-1': 2, ... }, plays: { '1-1': play, ... },
 *     at: { '1-1': ms the play was kept }, days: ['2026-11-15', ...], rev }
 * read through cleanLadder(), which keeps only what it can trust: a known
 * level id, a whole number of stars from 0 to 3, a play whose spots and steps
 * have the right shape, a timestamp, an Eastern date key. Anything else (a hand
 * edit, an older build, a full disk) is dropped, never thrown. days are the
 * Eastern days a Daily shot was filed on this device (the streak, below).
 *
 * THE ACCOUNT'S COPY (2026-11-17). Signed in, the same record also rides in
 * the shared cloud saves (/assets/cloudsave.js, window.RTG_SAVE), game
 * last_shot, slot ladder, beside the playbooks. On load the two merge: per
 * level the best stars win, the kept play is the newer one (at), the days are
 * the union. A change writes localStorage at once, as before, and the cloud at
 * most once per SYNC_MS and on page hide, so a burst of runs is one write.
 * rev is the cloud's progress number: it only goes up, and a write the server
 * refuses as stale is merged with what it holds and sent again. Signed out (or
 * the cloud unreachable) it is local only, exactly as before. Garbage in either
 * copy goes through cleanLadder and never throws.
 *
 * UNLOCKS. 1-1 is always open. Every other level opens once the level before
 * it, in LEVELS order, is won (one star or more). So a chapter's first level
 * opens with the last level of the chapter before it. */
import { LEVELS, CHAPTERS } from './levels.js?b=e8adaf5f5c';
import { SCHEME_NAMES, isZone } from './scenario.js?b=e8adaf5f5c';
import { IDS } from './playbook.js?b=e8adaf5f5c';

export const LADDER_KEY = 'last_shot_ladder';
const KINDS = ['move', 'screen', 'pass', 'shoot'];
const ids = new Set(LEVELS.map(l => l.id));

const num = v => typeof v === 'number' && Number.isFinite(v);
const pt = p => !!p && typeof p === 'object' && num(p.x) && num(p.y);
function goodStep(s) {
  if (!s || typeof s !== 'object' || !KINDS.includes(s.kind)) return false;
  if (s.beat != null && !(Number.isInteger(s.beat) && s.beat > 0 && s.beat < 50)) return false;
  if (s.kind === 'pass') return IDS.includes(s.from) && IDS.includes(s.to);
  if (!IDS.includes(s.who)) return false;
  if (s.kind === 'shoot') return true;
  return Array.isArray(s.pts) && s.pts.length > 0 && s.pts.length < 200 && s.pts.every(pt);
}
/* A play from storage, or null when any part of it is not one. */
export function cleanPlay(p) {
  if (!p || typeof p !== 'object' || !p.spots || typeof p.spots !== 'object') return null;
  if (!IDS.every(id => pt(p.spots[id]))) return null;
  if (!Array.isArray(p.steps) || p.steps.length > 60 || !p.steps.every(goodStep)) return null;
  const out = { spots: {}, steps: JSON.parse(JSON.stringify(p.steps)) };
  for (const id of IDS) out.spots[id] = { x: p.spots[id].x, y: p.spots[id].y };
  if (num(p.goAt)) out.goAt = p.goAt;
  return out;
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS = 400;
export function cleanLadder(raw) {
  const out = { v: 1, best: {}, plays: {}, at: {}, days: [], rev: 0 };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  if (raw.best && typeof raw.best === 'object') {
    for (const [id, n] of Object.entries(raw.best)) if (ids.has(id) && Number.isInteger(n) && n >= 0 && n <= 3) out.best[id] = n;
  }
  if (raw.plays && typeof raw.plays === 'object') {
    for (const [id, p] of Object.entries(raw.plays)) { if (!ids.has(id)) continue; const c = cleanPlay(p); if (c) out.plays[id] = c; }
  }
  if (raw.at && typeof raw.at === 'object') {
    for (const id of Object.keys(out.plays)) { const t = raw.at[id]; if (num(t) && t >= 0) out.at[id] = t; }
  }
  if (Array.isArray(raw.days)) out.days = [...new Set(raw.days.filter(k => typeof k === 'string' && DAY_RE.test(k) && dayNo(k) != null))].sort().slice(-MAX_DAYS);
  if (Number.isInteger(raw.rev) && raw.rev >= 0 && raw.rev < 2e9) out.rev = raw.rev;
  return out;
}

/* Two clean copies as one: the best stars per level, the newer play per
   level (a tie keeps a's), every filed day, the higher rev. */
export function mergeLadder(a, b) {
  const out = cleanLadder(JSON.parse(JSON.stringify(a)));
  const o = cleanLadder(JSON.parse(JSON.stringify(b)));
  for (const [id, n] of Object.entries(o.best)) out.best[id] = Math.max(out.best[id] || 0, n);
  for (const [id, p] of Object.entries(o.plays)) {
    if (!out.plays[id] || (o.at[id] || 0) > (out.at[id] || 0)) { out.plays[id] = p; if (o.at[id] != null) out.at[id] = o.at[id]; else delete out.at[id]; }
  }
  out.days = [...new Set([...out.days, ...o.days])].sort().slice(-MAX_DAYS);
  out.rev = Math.max(out.rev, o.rev);
  return out;
}
/* The same progress, whatever the key order and the rev. */
function bodyOf(d) {
  const sortObj = x => Object.fromEntries(Object.keys(x).sort().map(k => [k, x[k]]));
  return JSON.stringify([sortObj(d.best), sortObj(d.plays), sortObj(d.at), d.days]);
}
export const sameLadder = (a, b) => bodyOf(a) === bodyOf(b);

function readLocal() {
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(LADDER_KEY) || 'null'); } catch (e) { raw = null; }
  return cleanLadder(raw);
}
function writeLocal(d) {
  try { localStorage.setItem(LADDER_KEY, JSON.stringify(d)); return true; } catch (e) { return false; }
}
export const loadLadder = readLocal;
/* Every change goes through here: localStorage now, the account's copy behind it. */
export function saveLadder(d) {
  /* never move rev back: a push may have raised it since d was read */
  const was = readLocal().rev;
  if (!(d.rev >= was)) d.rev = was;
  const ok = writeLocal(d);
  touch();
  return ok;
}
/* The play a level keeps, stamped so the newer one wins a merge. */
export function keepPlay(d, id, p) { d.plays[id] = p; d.at[id] = Date.now(); }

/* ---------- the account's copy ---------- */
export const CLOUD_GAME = 'last_shot', CLOUD_SLOT = 'ladder';
const SYNC_MS = 30000;
let sync = null;
function cloud() {
  try {
    const S = window.RTG_SAVE;
    if (!S || typeof S.queue !== 'function' || typeof S.all !== 'function') return null;
    if (typeof S.signedIn === 'function' && !S.signedIn()) return null;
    return S;
  } catch (e) { return null; }
}
/* Start once a page knows who is signed in (wait resolves then). onRemote(d)
   hears a merge that changed this browser's copy. ms: the write interval. */
export function startLadderSync({ wait, onRemote, ms } = {}) {
  sync = { dirty: false, timer: null, on: false, ms: ms > 0 ? ms : SYNC_MS, onRemote: onRemote || (() => {}), writes: 0 };
  try {
    window.addEventListener('pagehide', flushLadder);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushLadder(); });
  } catch (e) {}
  return Promise.resolve(wait).catch(() => null).then(pullLadder);
}
/* Read the account's copy and merge it in; push ours when it has more. */
export async function pullLadder() {
  const S = cloud();
  if (!S || !sync) return null;
  let rows = null;
  try { rows = await S.all(CLOUD_GAME); } catch (e) { rows = null; }
  if (!Array.isArray(rows)) return null;
  sync.on = true;
  const row = rows.find(r => r && r.slot === CLOUD_SLOT) || null;
  const local = readLocal();
  const theirs = row ? cleanLadder(row.payload) : null;
  if (theirs && Number.isInteger(row.progress)) theirs.rev = Math.max(theirs.rev, row.progress);
  const merged = theirs ? mergeLadder(local, theirs) : local;
  if (!sameLadder(merged, local) || merged.rev !== local.rev) { writeLocal(merged); if (!sameLadder(merged, local)) sync.onRemote(merged); }
  const empty = !Object.keys(merged.best).length && !Object.keys(merged.plays).length && !merged.days.length;
  if ((theirs ? !sameLadder(merged, theirs) : !empty) || (sync.dirty && !empty)) { sync.dirty = true; return flushLadder(); }
  return merged;
}
function touch() {
  if (!sync) return;
  sync.dirty = true;
  if (!sync.timer) sync.timer = setTimeout(flushLadder, sync.ms);
}
/* Write the account's copy now, if anything changed (page hide, the timer). */
export function flushLadder() {
  if (!sync) return null;
  if (sync.timer) { clearTimeout(sync.timer); sync.timer = null; }
  const S = cloud();
  if (!sync.dirty || !sync.on || !S) return null;
  sync.dirty = false;
  return push(S, 2);
}
function push(S, tries) {
  sync.writes++;
  return Promise.resolve(S.queue(CLOUD_GAME, CLOUD_SLOT, () => {
    const d = readLocal(); d.rev += 1; writeLocal(d);
    return { payload: d, progress: d.rev };
  })).then(r => {
    if (r && r.ok === false && r.payload && tries > 0) {
      /* stale: merge what the account holds, then go again above its rev */
      const theirs = cleanLadder(r.payload);
      if (Number.isInteger(r.progress)) theirs.rev = Math.max(theirs.rev, r.progress);
      const local = readLocal(), m = mergeLadder(local, theirs);
      writeLocal(m);
      if (!sameLadder(m, local)) sync.onRemote(m);
      return push(S, tries - 1);
    }
    return r;
  }, () => null);
}
/* how many writes this page sent (check-ladder.mjs) */
export const ladderWrites = () => (sync ? sync.writes : 0);

/* ---------- the Daily streak ----------
   Consecutive Eastern days with a filed scored shot. Today's filing extends
   it; with today not filed yet, a streak through yesterday still stands; a
   missed day ends it (0). best is the longest run ever kept here. */
function dayNo(k) {
  const m = DAY_RE.test(k) ? Date.UTC(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10)) : NaN;
  return Number.isFinite(m) ? Math.round(m / 86400000) : null;
}
export function markDay(d, key) {
  if (typeof key !== 'string' || dayNo(key) == null || d.days.includes(key)) return false;
  d.days = [...d.days, key].sort().slice(-MAX_DAYS);
  return true;
}
export function streakOf(days, today) {
  const set = new Set((days || []).map(dayNo).filter(n => n != null)), t = dayNo(today);
  let best = 0, run = 0, prev = null;
  for (const n of [...set].sort((a, b) => a - b)) { run = prev != null && n === prev + 1 ? run + 1 : 1; prev = n; if (run > best) best = run; }
  let now = 0;
  if (t != null) { let k = set.has(t) ? t : t - 1; while (set.has(k)) { now++; k--; } }
  return { now, best };
}
export const streakLine = st => (st.now ? st.now + ' day streak' : 'No streak') + ' · Best ' + st.best;

export const indexOf = id => LEVELS.findIndex(l => l.id === id);
export function isOpen(d, id) {
  const i = indexOf(id);
  if (i < 0) return false;
  return i === 0 || (d.best[LEVELS[i - 1].id] || 0) >= 1;
}
export const nextOf = id => LEVELS[indexOf(id) + 1] || null;
export const starsIn = (d, list = LEVELS) => list.reduce((s, l) => s + (d.best[l.id] || 0), 0);
export const maxStars = (list = LEVELS) => list.length * 3;

/* What a player reads about a level. */
export const downOf = l => (l.sit.down || 1);
export const clockLine = l => l.sit.clock.toFixed(1) + ' · Down ' + downOf(l);
export const scoutLine = l => (l.scheme ? 'Scout: ' + SCHEME_NAMES[l.scheme] + (isZone(l.scheme) ? '' : ' on screens') : '');
export const starText = n => '★'.repeat(n) + '☆'.repeat(3 - n);

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

/* The Ladder screen into root. pick(level) opens a level. */
export function renderLadder(root, d, pick) {
  root.innerHTML = '';
  const head = el('div', 'lhead');
  head.appendChild(el('h2', null, 'Ladder'));
  head.appendChild(el('p', 'lsum', starsIn(d) + ' of ' + maxStars() + ' stars'));
  root.appendChild(head);
  for (const ch of CHAPTERS) {
    const list = LEVELS.filter(l => l.chapter === ch.id);
    const sec = el('section', 'chap');
    sec.dataset.chapter = String(ch.id);
    const h = el('div', 'chead');
    h.appendChild(el('b', null, ch.name));
    h.appendChild(el('span', 'cstars', starsIn(d, list) + ' of ' + maxStars(list) + ' ★'));
    sec.appendChild(h);
    sec.appendChild(el('p', 'cnote', ch.note));
    const grid = el('div', 'tiles');
    for (const l of list) {
      const open = isOpen(d, l.id), n = d.best[l.id] || 0;
      const b = el('button', 'tile' + (open ? '' : ' locked') + (n === 3 ? ' full' : ''));
      b.dataset.level = l.id;
      b.disabled = !open;
      b.setAttribute('aria-label', l.id + ' ' + l.title + (open ? ', ' + n + ' of 3 stars' : ', locked'));
      const top = el('span', 'trow');
      top.appendChild(el('span', 'tid', l.id));
      top.appendChild(el('span', 'tstars', open ? starText(n) : 'Locked'));
      b.appendChild(top);
      b.appendChild(el('span', 'ttitle', l.title));
      b.appendChild(el('span', 'tsit', clockLine(l)));
      if (l.scheme) b.appendChild(el('span', 'tscout', scoutLine(l)));
      if (open) b.addEventListener('click', () => pick(l));
      grid.appendChild(b);
    }
    sec.appendChild(grid);
    root.appendChild(sec);
  }
}
