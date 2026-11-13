/* THE LADDER, the page side (Phase 2, 2026-11-13). The levels, their rules
 * and their stars are levels.js; this is only where a player's progress is
 * kept and how the Ladder screen draws it.
 *
 * STORAGE. One localStorage key, last_shot_ladder, shaped
 *   { v: 1, best: { '1-1': 2, ... }, plays: { '1-1': play, ... } }
 * read through cleanLadder(), which keeps only what it can trust: a known
 * level id, a whole number of stars from 0 to 3, a play whose spots and steps
 * have the right shape. Anything else (a hand edit, an older build, a full
 * disk) is dropped, never thrown. No cloud sync yet: the main session decides
 * that later (the playbooks' cloudsave is the obvious home for it).
 *
 * UNLOCKS. 1-1 is always open. Every other level opens once the level before
 * it, in LEVELS order, is won (one star or more). So a chapter's first level
 * opens with the last level of the chapter before it. */
import { LEVELS, CHAPTERS } from './levels.js';
import { SCHEME_NAMES, isZone } from './scenario.js';
import { IDS } from './playbook.js';

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

export function cleanLadder(raw) {
  const out = { v: 1, best: {}, plays: {} };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  if (raw.best && typeof raw.best === 'object') {
    for (const [id, n] of Object.entries(raw.best)) if (ids.has(id) && Number.isInteger(n) && n >= 0 && n <= 3) out.best[id] = n;
  }
  if (raw.plays && typeof raw.plays === 'object') {
    for (const [id, p] of Object.entries(raw.plays)) { if (!ids.has(id)) continue; const c = cleanPlay(p); if (c) out.plays[id] = c; }
  }
  return out;
}

export function loadLadder() {
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(LADDER_KEY) || 'null'); } catch (e) { raw = null; }
  return cleanLadder(raw);
}
export function saveLadder(d) {
  try { localStorage.setItem(LADDER_KEY, JSON.stringify(d)); return true; } catch (e) { return false; }
}

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
