/* Last Shot: playbooks printed, saved and downloaded the way a team wants them.
 *
 *   DEFAULTS                              every option, and its default
 *   withDefaults(opt)                     DEFAULTS with the caller's options on top
 *   pick(book, opt)                       the plays to export, numbered, in order
 *   pages(sc, book, terms, opt)           the pages, drawn: [HTMLCanvasElement]
 *   print(canvases, opt)                  the browser's print dialog ("Save as PDF" keeps it)
 *   download(canvas, filename)            one PNG
 *   playPng(sc, entry, terms, opt)        one play, its frames in a row ("Download this play")
 *
 * The pattern is 4th and What's export.js, built for basketball. A basketball
 * playbook prints a play as numbered frames side by side (1, 2, 3), each one
 * showing where everyone starts and what happens in it, with a line under it
 * that says so. The owner's call (2026-10-30): exporting is extremely
 * customisable, so nearly everything is an option: which plays, their order
 * and numbers, the paper, the layout (cards, a storyboard, a call sheet,
 * wristband cards), how a card shows its frames, what each card says, colour
 * or black and white, line weight, type size and the header.
 *
 * Pages are drawn on canvases at `dpi` dots an inch and printed as images, so
 * what the preview shows is exactly what prints, on any browser.
 *
 * Every number printed comes from the game: the situation from the scenario
 * (scenarioFor), the test numbers from the rows Test it stored. A test whose
 * key no longer matches the play is stale and is left off.
 *
 * ES module, served to the browser from pages.js like the rest of Last Shot. */
import { drawFrame, drawPlay, aspectOf } from './diagram.js';
import { framesOf, scenarioFor, situationKey, playKey } from './playbook.js';
import { captionOf } from './names.js';
import { SCHEME_NAMES } from './scenario.js';

export const PAPER = Object.freeze({ letter: [8.5, 11], legal: [8.5, 14], tabloid: [11, 17], a4: [8.27, 11.69], a5: [5.83, 8.27] });
/* cards to a page, as columns x rows on portrait paper (landscape swaps them) */
export const GRID = Object.freeze({ 1: [1, 1], 2: [1, 2], 4: [2, 2], 6: [2, 3], 8: [2, 4], 12: [3, 4] });
export const LAYOUTS = Object.freeze(['cards', 'storyboard', 'callsheet', 'wristband']);

const FONT = '"DM Sans", Inter, Arial, sans-serif';
const HEAD = 'Outfit, "DM Sans", Arial, sans-serif';
/* A frame narrower than this at print size is too small to read: a row of
   frames wraps to a second row first. */
const MIN_FRAME_IN = 1.3;

export const DEFAULTS = Object.freeze({
  /* which plays */
  plays: 'all',            /* 'all', 'sections' (with sections: [ids]) or 'chosen' (with chosen: [ids]) */
  sections: [], chosen: [],
  order: 'book',           /* 'book', 'section', 'name' */
  numbering: 'continuous', /* 'continuous', 'section' (101, 102, 201 ...), 'none' */
  startAt: 1,
  /* the paper */
  paper: 'letter', landscape: false, margin: 0.4, dpi: 150,
  /* the layout */
  layout: 'cards',         /* 'cards', 'storyboard', 'callsheet', 'wristband' */
  perPage: 4,              /* cards: 1, 2, 4, 6, 8, 12 */
  frames: 'row',           /* cards: 'row' (side by side, wrapping when small), 'grid' (framesAcross wide), 'one' (one layered diagram) */
  framesAcross: 3,         /* 'grid': 2, 3, 4 */
  storyRows: 3,            /* storyboard: plays a page, 2 to 6 */
  callColumns: 2, callThumbs: true,
  bandW: 4.5, bandH: 2.75, bandCols: 3, bandRows: 3, bandCopies: 1, bandText: false, cutLines: true,
  court: 'auto',           /* 'auto' (half court on cards and storyboards, the lane on thumbnails and wristbands), 'half', 'lane' */
  /* what a play shows */
  captions: 'auto',        /* 'auto' (the coach's frame note, else the game's caption), 'notes' (typed only), 'off' */
  showName: true, showNumber: true, showNotes: true, showSection: false, showSituation: true, showStats: false,
  defense: false, letters: 'numbers', stepNumbers: true, ball: true, ghost: false,
  /* the look */
  color: false, weight: 1, fontScale: 1,
  /* the header */
  title: '', team: '', date: true, pageNumbers: true
});
export function withDefaults(o) {
  const r = {};
  for (const k in DEFAULTS) r[k] = o && o[k] !== undefined ? o[k] : DEFAULTS[k];
  r.dpi = Math.max(72, Math.min(600, Number(r.dpi) || 150));
  r.fontScale = Number(r.fontScale) > 0 ? Number(r.fontScale) : 1;
  r.weight = Number(r.weight) > 0 ? Number(r.weight) : 1;
  r.margin = Math.max(0, Number(r.margin) || 0);
  return r;
}

/* ---------- the plays ---------- */

/* The plays to export, in order, each with its number and section name. */
export function pick(book, o) {
  const opt = withDefaults(o);
  const secName = {}, secIdx = {};
  (book.sections || []).forEach((s, i) => { secName[s.id] = s.name; secIdx[s.id] = i; });
  const all = book.plays || [];
  let list = all.slice();
  if (opt.plays === 'sections') list = list.filter(p => opt.sections.indexOf(p.section) >= 0);
  if (opt.plays === 'chosen') list = list.filter(p => opt.chosen.indexOf(p.id) >= 0);
  if (opt.order === 'section') list.sort((a, b) => (secIdx[a.section] || 0) - (secIdx[b.section] || 0) || all.indexOf(a) - all.indexOf(b));
  if (opt.order === 'name') list.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  let n = Number.isFinite(+opt.startAt) ? Math.round(+opt.startAt) : 1;
  const perSec = {};
  return list.map(p => {
    let num = '';
    if (opt.numbering === 'continuous') num = String(n++);
    else if (opt.numbering === 'section') { const si = (secIdx[p.section] || 0) + 1; perSec[si] = (perSec[si] || 0) + 1; num = String(si * 100 + perSec[si]); }
    return { entry: p, number: num, section: secName[p.section] || '' };
  });
}

/* The frames worth printing: every frame with a step in it (frame 1 at least). */
export function beatsOf(play) {
  const F = framesOf(play), out = [];
  F.forEach((idx, i) => { if (idx.length) out.push(i + 1); });
  return out.length ? out : [1];
}

/* A frame's line: the coach's note if typed, else the game's caption ('auto'). */
export function captionFor(sc, entry, beat, terms, mode) {
  if (mode === 'off') return '';
  const typed = entry.frameNotes && entry.frameNotes[beat] ? String(entry.frameNotes[beat]).trim() : '';
  if (typed || mode === 'notes') return typed;
  try { return captionOf(sc, entry.play, beat, terms); } catch (e) { return ''; }
}

const who = (sc, id, letters) => (letters === 'positions' && sc.roster && sc.roster[id] ? sc.roster[id].arch : String(id || '').slice(1));

/* "Down 1 · 22.0 · 1 has it": the score from the scenario, the clock and the
   ball from the play's own situation if it has one. */
export function situationLine(sc, entry, letters) {
  const s = scenarioFor(sc, entry.situation), d = s.us - s.them;
  const score = d < 0 ? 'Down ' + -d : d > 0 ? 'Up ' + d : 'Tied';
  return [score, Number(s.clock).toFixed(1), who(s, s.handler, letters) + ' has it'].join(' · ');
}

/* "Switch 48% · Fight over 31% · Go under 52%" from the stored test, or ''
   when there is no test for this situation or it is stale. Every key the
   stored rows hold is printed, so new defenses show up with no change here. */
export function statLine(sc, entry) {
  const key = situationKey(sc, entry.situation);
  const st = entry.stats && entry.stats[key], t = st && st.test;
  if (!t || !t.rows) return '';
  if (t.key && t.key !== playKey(entry.play) + '@' + key) return '';
  const out = [];
  for (const k of Object.keys(t.rows)) {
    const r = t.rows[k];
    if (!r || !(r.n > 0)) continue;
    out.push((SCHEME_NAMES[k] || k.charAt(0).toUpperCase() + k.slice(1)) + ' ' + Math.round(r.w * 100 / r.n) + '%');
  }
  return out.join(' · ');
}

/* ---------- text ---------- */

function font(ctx, weight, px, fam) { ctx.font = weight + ' ' + Math.max(5, px).toFixed(1) + 'px ' + (fam || FONT); }
/* Text that fits a width: shrink a little, then cut with an ellipsis. */
function fit(ctx, text, maxW, px, weight, fam) {
  let size = px;
  font(ctx, weight, size, fam);
  while (ctx.measureText(text).width > maxW && size > px * 0.8) { size -= 0.5; font(ctx, weight, size, fam); }
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '...').width > maxW) t = t.slice(0, -1);
  return t.replace(/\s+$/, '') + '...';
}
/* Words wrapped to a width, at the font already set. */
function wrap(ctx, text, maxW, maxLines) {
  const words = String(text || '').split(/\s+/).filter(Boolean), lines = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w;
    if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t;
  }
  if (cur) lines.push(cur);
  if (maxLines && lines.length > maxLines) {
    const keep = lines.slice(0, maxLines);
    let last = keep[maxLines - 1];
    while (last.length > 1 && ctx.measureText(last + '...').width > maxW) last = last.replace(/\s*\S*$/, '');
    keep[maxLines - 1] = last + '...';
    return keep;
  }
  return lines;
}

/* ---------- one play's frames in a box ---------- */

/* minScale keeps a player's circle about 0.16 inches across however small
   the frame (a thumbnail's a little less), so a 12 up page still reads. */
function diagramOpt(opt, extra) {
  return Object.assign({ color: opt.color, weight: opt.weight, letters: opt.letters, stepNumbers: opt.stepNumbers, defense: opt.defense, ball: opt.ball,
    minScale: opt.dpi * 0.05 }, extra || {});
}
const courtFor = (opt, small) => (opt.court === 'half' || opt.court === 'lane' ? opt.court : small ? 'lane' : 'half');

/* Lay out frames in w x h: how many across, how big, the caption lines.
   'grid' is framesAcross wide. 'row' keeps every frame side by side, and
   only when that makes a frame narrower than MIN_FRAME_IN does it wrap, to
   whichever number across gives the biggest frames. */
function frameLayout(ctx, w, h, n, A, caps, opt, dpi, fs) {
  const gap = Math.round(dpi * 0.1), lh = Math.round(fs * 1.28), hasCaps = caps.some(Boolean);
  function sized(want) {
    const rows = Math.ceil(n / want), across = opt.frames === 'grid' ? want : Math.ceil(n / rows);
    const cellW = (w - gap * (across - 1)) / across;
    let fw = cellW, fh = cellW / A, lines = [], capH = 0;
    for (let pass = 0; pass < 3; pass++) {
      font(ctx, '600', fs);
      for (let maxL = 4; maxL >= 2; maxL--) {
        lines = caps.map(c => (c ? wrap(ctx, c, fw - 2, maxL) : []));
        capH = hasCaps ? Math.max(0, ...lines.map(l => l.length)) * lh + Math.round(fs * 0.5) : 0;
        fh = Math.min(cellW / A, (h - gap * (rows - 1) - rows * capH) / rows);
        if (fh >= dpi * 0.9) break;
      }
      const nw = Math.max(0, Math.min(cellW, fh * A));
      if (Math.abs(nw - fw) < 1) break;
      fw = nw;
    }
    fh = Math.max(0, fh); fw = Math.min(cellW, fh * A);
    return { across, rows, gap, fw, fh, lines, capH, lh, height: rows * (fh + capH) + gap * (rows - 1) };
  }
  if (opt.frames === 'grid') return sized(Math.max(1, Math.min(n, opt.framesAcross | 0 || 3)));
  let best = sized(n);
  if (best.fw >= MIN_FRAME_IN * dpi - 1) return best;
  for (let a = n - 1; a >= 1; a--) { const L = sized(a); if (L.fw > best.fw + 1) best = L; }
  return best;
}

/* Draw frames (already laid out) with their captions, from x, y: centred
   in w, or from the left edge (align 'left'). */
function drawFrames(ctx, x, y, w, L, sc, it, beats, opt, dpi, fs, court, align) {
  beats.forEach((beat, i) => {
    const c = i % L.across, r = Math.floor(i / L.across);
    const inRow = align === 'left' ? L.across : Math.min(L.across, beats.length - r * L.across);
    const rowW = inRow * L.fw + L.gap * (inRow - 1), x0 = align === 'left' ? x : x + (w - rowW) / 2;
    const fx = Math.round(x0 + c * (L.fw + L.gap)), fy = Math.round(y + r * (L.fh + L.capH + L.gap));
    const fwR = Math.round(L.fw), fhR = Math.round(L.fh);
    ctx.strokeStyle = '#b8b8b8'; ctx.lineWidth = Math.max(1, dpi / 150); ctx.strokeRect(fx + 0.5, fy + 0.5, fwR - 1, fhR - 1);
    drawFrame(ctx, fx + 1, fy + 1, fwR - 2, fhR - 2, sc, it.entry.play, beat, diagramOpt(opt, { court, ghost: opt.ghost && i > 0, label: beats.length > 1 ? String(i + 1) : '' }));
    const lines = L.lines[i] || [];
    ctx.fillStyle = '#222'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; font(ctx, '600', fs);
    lines.forEach((ln, k) => ctx.fillText(ln, fx + 1, fy + fhR + Math.round(fs * 0.4) + k * L.lh));
  });
}

/* What a play says above its frames: the name line, then a line of facts. */
function headLines(sc, it, opt) {
  let name = '';
  if (opt.showNumber && it.number) name += it.number + '  ';
  if (opt.showName) name += it.entry.name || '';
  const facts = [];
  if (opt.showSection && it.section) facts.push(it.section);
  if (opt.showSituation) facts.push(situationLine(sc, it.entry, opt.letters));
  const stats = opt.showStats ? statLine(sc, it.entry) : '';
  return { name: name.trim(), facts: facts.join(' · '), stats: stats ? 'Tested: ' + stats : '' };
}

/* A frame narrower than this falls back to the one layered diagram: three
   frames on a 12 up card are too small to read, one diagram is not. */
const TOO_SMALL_IN = 0.95;

/* The diagrams of one play in w x room from (x, top): its frames, or the one
   layered diagram with the frame captions listed under it. Answers the
   height used. */
function body(ctx, x, top, w, room, sc, it, opt, dpi, fs, terms, align) {
  const play = it.entry.play, beats = beatsOf(play), court = courtFor(opt, false), A = aspectOf(play, court);
  if (room < dpi * 0.3) return 0;
  if (opt.frames !== 'one') {
    const caps = beats.map(b => captionFor(sc, it.entry, b, terms, opt.captions));
    const L = frameLayout(ctx, w, room, beats.length, A, caps, opt, dpi, fs);
    if (beats.length === 1 || L.fw >= TOO_SMALL_IN * dpi) {
      drawFrames(ctx, x, top, w, L, sc, it, beats, opt, dpi, fs, court, align);
      return L.height;
    }
  }
  const lh = Math.round(fs * 1.28);
  const caps = beats.map(b => captionFor(sc, it.entry, b, terms, opt.captions)).map((c, i) => (c && beats.length > 1 ? (i + 1) + '. ' + c : c)).filter(Boolean);
  /* the diagram as big as the captions allow, then the captions at its width */
  let dh = Math.min(room, w / A), list = [];
  for (let pass = 0; pass < 3; pass++) {
    font(ctx, '600', fs);
    list = []; caps.forEach(c => wrap(ctx, c, Math.max(dpi, dh * A) - 2, 2).forEach(l => list.push(l)));
    while (list.length && room - list.length * lh - fs * 0.5 < dpi * 0.9) list = list.slice(0, -1);
    const capH = list.length ? list.length * lh + Math.round(fs * 0.5) : 0;
    dh = Math.min(room - capH, w / A);
  }
  const capH = list.length ? list.length * lh + Math.round(fs * 0.5) : 0;
  const dw = dh * A, dx = Math.round(align === 'left' ? x : x + (w - dw) / 2);
  ctx.strokeStyle = '#b8b8b8'; ctx.lineWidth = Math.max(1, dpi / 150); ctx.strokeRect(dx + 0.5, top + 0.5, Math.round(dw) - 1, Math.round(dh) - 1);
  drawPlay(ctx, dx + 1, top + 1, Math.round(dw) - 2, Math.round(dh) - 2, sc, play, diagramOpt(opt, { court }));
  ctx.fillStyle = '#222'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; font(ctx, '600', fs);
  list.forEach((ln, i) => ctx.fillText(ln, dx + 1, top + dh + Math.round(fs * 0.4) + i * lh));
  return dh + capH;
}

/* One play in a box: the head, the diagrams, the notes. For the cards and
   the one play PNG. */
function playBox(ctx, x, y, w, h, it, opt, dpi, k, terms, scBase) {
  const sc = scenarioFor(scBase, it.entry.situation);
  const fsName = dpi * 0.16 * opt.fontScale * k, fs = dpi * 0.105 * opt.fontScale * k, small = dpi * 0.1 * opt.fontScale * k;
  let top = y;
  const H = headLines(sc, it, opt);
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  if (H.name) { ctx.fillStyle = '#111'; ctx.fillText(fit(ctx, H.name, w, fsName, '800', HEAD), x, top); top += Math.round(fsName * 1.2); }
  const sub = [H.facts, H.stats].filter(Boolean);
  if (sub.length) {
    font(ctx, '600', small);
    const one = sub.join('   ');
    const lines = ctx.measureText(one).width <= w ? [one] : sub;
    ctx.fillStyle = '#555';
    lines.forEach(ln => { ctx.fillText(fit(ctx, ln, w, small, '600'), x, top); top += Math.round(small * 1.3); });
  }
  if (H.name || sub.length) top += Math.round(dpi * 0.06 * k);
  /* notes at the foot, wrapped */
  let notes = [];
  if (opt.showNotes && it.entry.notes) { font(ctx, '400', small); notes = wrap(ctx, it.entry.notes, w, h > dpi * 3 ? 3 : 2); }
  const notesH = notes.length ? notes.length * Math.round(small * 1.3) + Math.round(dpi * 0.05) : 0;
  const used = body(ctx, x, top, w, y + h - top - notesH, sc, it, opt, dpi, fs, terms, 'center');
  let ny = Math.min(top + used + Math.round(dpi * 0.06), y + h - notesH + Math.round(dpi * 0.05));
  ctx.fillStyle = '#444'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  notes.forEach(ln => { font(ctx, '400', small); ctx.fillText(ln, x, ny); ny += Math.round(small * 1.3); });
}

/* One storyboard row: the name, facts and notes in a column on the left, the
   frames across the rest, from the left. */
function storyRow(ctx, x, y, w, h, it, opt, dpi, k, terms, scBase) {
  const sc = scenarioFor(scBase, it.entry.situation);
  const fsName = dpi * 0.16 * opt.fontScale * k, fs = dpi * 0.105 * opt.fontScale * k, small = dpi * 0.1 * opt.fontScale * k;
  const colW = Math.round(Math.min(dpi * 2.2, w * 0.27)), gap = Math.round(dpi * 0.18);
  const H = headLines(sc, it, opt);
  let ty = y;
  const put = (text, weight, px, fam, color, maxL, after) => {
    if (!text) return;
    font(ctx, weight, px, fam); ctx.fillStyle = color; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    const lh = Math.round(px * 1.25), room = Math.floor((y + h - ty) / lh);
    if (room < 1) return;
    wrap(ctx, text, colW, Math.min(maxL, room)).forEach(ln => { ctx.fillText(ln, x, ty); ty += lh; });
    ty += after;
  };
  put(H.name, '800', fsName, HEAD, '#111', 2, Math.round(dpi * 0.04));
  put(H.facts, '600', small, FONT, '#555', 3, Math.round(dpi * 0.02));
  put(H.stats, '600', small, FONT, '#555', 3, Math.round(dpi * 0.06));
  if (opt.showNotes) put(it.entry.notes, '400', small, FONT, '#333', 12, 0);
  body(ctx, x + colW + gap, y, w - colW - gap, h, sc, it, opt, dpi, fs, terms, 'left');
}

/* ---------- pages ---------- */

function canvas(w, h) {
  const c = globalThis.document.createElement('canvas');
  c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
  const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
  return c;
}
function newPage(opt) {
  const size = PAPER[opt.paper] || PAPER.letter, wIn = opt.landscape ? size[1] : size[0], hIn = opt.landscape ? size[0] : size[1];
  const c = canvas(wIn * opt.dpi, hIn * opt.dpi);
  c.inches = [wIn, hIn];
  return c;
}
function dateText(opt) {
  if (typeof opt.date === 'string' && opt.date.trim()) return opt.date.trim();
  return opt.date ? new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '';
}
/* The header across the top of a page; answers where the content starts. */
function header(c, opt, book) {
  const x = c.getContext('2d'), dpi = opt.dpi, m = opt.margin * dpi;
  const title = String(opt.title || book.name || ''), right = [opt.team || book.team || '', dateText(opt)].filter(Boolean).join(' · ');
  let y = m;
  if (title || right) {
    const fs = dpi * 0.17 * opt.fontScale;
    x.textBaseline = 'alphabetic';
    font(x, '600', fs * 0.72);
    const rw = right ? x.measureText(right).width : 0;
    x.fillStyle = '#111'; x.textAlign = 'left';
    x.fillText(fit(x, title, c.width - m * 2 - rw - dpi * 0.3, fs, '800', HEAD), m, y + fs * 0.85);
    if (right) { x.textAlign = 'right'; x.fillStyle = '#444'; font(x, '600', fs * 0.72); x.fillText(right, c.width - m, y + fs * 0.85); }
    y += fs * 1.15;
    x.strokeStyle = '#111'; x.lineWidth = Math.max(1, dpi / 75); x.beginPath(); x.moveTo(m, y); x.lineTo(c.width - m, y); x.stroke();
    y += dpi * 0.12;
  }
  return Math.round(y);
}
const footRoom = opt => (opt.pageNumbers ? opt.dpi * 0.2 : 0);
/* Page numbers go on last, once the count is known. */
function number(pages, opt) {
  if (!opt.pageNumbers) return pages;
  pages.forEach((c, i) => {
    const x = c.getContext('2d'), dpi = opt.dpi, m = opt.margin * dpi;
    x.fillStyle = '#555'; x.textAlign = 'center'; x.textBaseline = 'bottom'; font(x, '600', dpi * 0.09 * opt.fontScale);
    x.fillText(pages.length > 1 ? 'Page ' + (i + 1) + ' of ' + pages.length : 'Page 1', c.width / 2, c.height - Math.max(m * 0.5, dpi * 0.12));
  });
  return pages;
}
function chunks(items, per) {
  const out = [];
  for (let i = 0; i < items.length; i += per) out.push(items.slice(i, i + per));
  return out.length ? out : [[]];
}

function cardPages(sc, book, terms, items, opt) {
  const g = GRID[opt.perPage] || GRID[4], cols = opt.landscape ? g[1] : g[0], rows = opt.landscape ? g[0] : g[1];
  const dpi = opt.dpi;
  return chunks(items, cols * rows).map(group => {
    const c = newPage(opt), x = c.getContext('2d'), m = opt.margin * dpi;
    const top = header(c, opt, book), bottom = c.height - m - footRoom(opt);
    const gap = dpi * 0.14, cw = (c.width - m * 2 - gap * (cols - 1)) / cols, ch = (bottom - top - gap * (rows - 1)) / rows;
    /* type shrinks a little on small cards, so a 12 up page still reads */
    const k = Math.max(0.72, Math.min(1.15, Math.min(cw / (dpi * 3.6), ch / (dpi * 3.2))));
    group.forEach((it, i) => {
      const cx = Math.round(m + (i % cols) * (cw + gap)), cy = Math.round(top + Math.floor(i / cols) * (ch + gap));
      x.strokeStyle = '#111'; x.lineWidth = Math.max(1, dpi / 100); x.strokeRect(cx + 0.5, cy + 0.5, Math.round(cw) - 1, Math.round(ch) - 1);
      const pad = Math.round(dpi * 0.09 * k);
      playBox(x, cx + pad, cy + pad, Math.round(cw) - pad * 2, Math.round(ch) - pad * 2, it, opt, dpi, k, terms, sc);
    });
    return c;
  });
}

/* A storyboard: one play a row, its frames across, captions under them. */
function storyPages(sc, book, terms, items, opt) {
  const per = Math.max(2, Math.min(6, opt.storyRows | 0 || 3)), dpi = opt.dpi;
  const o = Object.assign({}, opt, { frames: opt.frames === 'one' ? 'one' : 'row' });
  return chunks(items, per).map(group => {
    const c = newPage(opt), x = c.getContext('2d'), m = opt.margin * dpi;
    const top = header(c, opt, book), bottom = c.height - m - footRoom(opt);
    const gap = dpi * 0.16, rh = (bottom - top - gap * (per - 1)) / per, w = c.width - m * 2;
    const k = Math.max(0.8, Math.min(1.1, rh / (dpi * 2.6)));
    group.forEach((it, i) => {
      const ry = Math.round(top + i * (rh + gap));
      if (i > 0) { x.strokeStyle = '#999'; x.lineWidth = Math.max(1, dpi / 150); x.beginPath(); x.moveTo(m, ry - gap / 2); x.lineTo(m + w, ry - gap / 2); x.stroke(); }
      storyRow(x, m, ry, w, Math.round(rh), it, o, dpi, k, terms, sc);
    });
    return c;
  });
}

/* A call sheet: plays by section, in columns, each a line with a small diagram. */
function callSheet(sc, book, terms, items, opt) {
  const out = [], dpi = opt.dpi, m = opt.margin * dpi, gap = dpi * 0.18, cols = Math.max(1, Math.min(4, opt.callColumns | 0 || 2));
  const court = courtFor(opt, true);
  let c = null, x = null, col = 0, y = 0, top = 0, bottom = 0, cw = 0;
  const fs = dpi * 0.12 * opt.fontScale, small = dpi * 0.088 * opt.fontScale;
  const textRows = (opt.showSituation ? 1 : 0) + (opt.showStats ? 1 : 0);
  const rowH = Math.round(opt.callThumbs ? dpi * 0.78 * Math.max(1, opt.fontScale) : fs * 1.6 + textRows * small * 1.3 + dpi * 0.04);
  function page() {
    c = newPage(opt); x = c.getContext('2d'); top = header(c, opt, book);
    bottom = c.height - m - footRoom(opt);
    cw = (c.width - m * 2 - gap * (cols - 1)) / cols; col = 0; y = top; out.push(c);
  }
  function room(hh) { if (y + hh > bottom) { col++; y = top; if (col >= cols) page(); } }
  page();
  let last = null;
  items.forEach(it => {
    const s2 = scenarioFor(sc, it.entry.situation);
    if (it.section !== last) {
      room(fs * 1.9 + rowH);
      const cx = m + col * (cw + gap);
      x.fillStyle = opt.color ? '#22324d' : '#111'; x.fillRect(cx, y, cw, fs * 1.55);
      x.fillStyle = '#fff'; x.textBaseline = 'middle'; x.textAlign = 'left';
      x.fillText(fit(x, (it.section || 'Plays').toUpperCase(), cw - dpi * 0.1, fs, '800', HEAD), cx + dpi * 0.05, y + fs * 0.8);
      y += fs * 1.75; last = it.section;
    }
    room(rowH);
    const cx = m + col * (cw + gap);
    let tx = cx + dpi * 0.03;
    if (opt.callThumbs) {
      const th = rowH - Math.round(dpi * 0.06), tw = Math.round(th * aspectOf(it.entry.play, court));
      x.strokeStyle = '#bbb'; x.lineWidth = 1; x.strokeRect(cx + 0.5, y + 0.5, tw, th);
      drawPlay(x, cx + 1, y + 1, tw - 1, th - 1, s2, it.entry.play, diagramOpt(opt, { court, minScale: dpi * 0.036 }));
      tx = cx + tw + dpi * 0.08;
    }
    const tw2 = cx + cw - tx;
    const label = (opt.showNumber && it.number ? it.number + '  ' : '') + (it.entry.name || '');
    const lines = [];
    if (opt.showSituation) lines.push(situationLine(s2, it.entry, opt.letters));
    if (opt.showStats) { const st = statLine(sc, it.entry); if (st) lines.push(st); }
    const blockH = fs * 1.15 + lines.length * small * 1.3, by = y + (rowH - Math.round(dpi * 0.04) - blockH) / 2;
    x.fillStyle = '#111'; x.textBaseline = 'top'; x.textAlign = 'left';
    x.fillText(fit(x, label, tw2, fs, '700'), tx, by);
    x.fillStyle = '#555';
    lines.forEach((ln, i) => x.fillText(fit(x, ln, tw2, small, '600'), tx, by + fs * 1.15 + i * small * 1.3));
    x.strokeStyle = '#ddd'; x.lineWidth = 1; x.beginPath(); x.moveTo(cx, y + rowH - 2); x.lineTo(cx + cw, y + rowH - 2); x.stroke();
    y += rowH;
  });
  return out;
}

/* Wristband cards: a grid of numbered cells at a set size, as many to a page
   as fit, with cut lines. bandText prints names only, no diagrams. */
function wristbands(sc, book, terms, items, opt) {
  const out = [], dpi = opt.dpi, court = courtFor(opt, true);
  const bc = Math.max(1, opt.bandCols | 0), br = Math.max(1, opt.bandRows | 0);
  const bw = Math.round(opt.bandW * dpi), bh = Math.round(opt.bandH * dpi), per = bc * br;
  const all = [];
  chunks(items, per).forEach(b => { for (let k = 0; k < Math.max(1, opt.bandCopies | 0); k++) all.push(b); });
  const probe = newPage(opt), m = opt.margin * dpi, gap = Math.round(dpi * 0.16);
  const headH = header(canvas(probe.width, probe.height), opt, book) - m;
  const across = Math.max(1, Math.floor((probe.width - m * 2 + gap) / (bw + gap)));
  const down = Math.max(1, Math.floor((probe.height - m * 2 - headH - footRoom(opt) + gap) / (bh + gap)));
  for (let p = 0; p < all.length; p += across * down) {
    const c = newPage(opt), x = c.getContext('2d'), top = header(c, opt, book) + Math.round(gap / 2);
    const used = Math.min(across, all.length - p), left = Math.round((c.width - (used * bw + (used - 1) * gap)) / 2);
    all.slice(p, p + across * down).forEach((band, k) => {
      const bx = left + (k % across) * (bw + gap), by = top + Math.floor(k / across) * (bh + gap);
      if (opt.cutLines) { x.setLineDash([dpi * 0.06, dpi * 0.05]); x.strokeStyle = '#888'; x.lineWidth = 1; x.strokeRect(bx - gap / 2, by - gap / 2, bw + gap, bh + gap); x.setLineDash([]); }
      x.strokeStyle = '#111'; x.lineWidth = Math.max(1, dpi / 100); x.strokeRect(bx, by, bw, bh);
      const cw = bw / bc, chh = bh / br;
      band.forEach((it, j) => {
        const s2 = scenarioFor(sc, it.entry.situation);
        const cx = bx + (j % bc) * cw, cy = by + Math.floor(j / bc) * chh;
        x.strokeStyle = '#999'; x.lineWidth = 1; x.strokeRect(cx, cy, cw, chh);
        const name = opt.bandText || opt.showName ? it.entry.name || '' : '';
        if (opt.bandText) {
          const fsB = Math.min(chh * 0.3, dpi * 0.2) * opt.fontScale, pad = dpi * 0.05;
          x.fillStyle = '#111'; x.textBaseline = 'middle'; x.textAlign = 'left';
          let nx = cx + pad;
          if (it.number) { font(x, '800', fsB * 1.1, HEAD); x.fillText(it.number, nx, cy + chh / 2); nx += x.measureText(it.number).width + fsB * 0.45; }
          font(x, '700', fsB);
          const lines = wrap(x, name, cx + cw - pad - nx, 2);
          lines.forEach((ln, i) => x.fillText(ln, nx, cy + chh / 2 + (i - (lines.length - 1) / 2) * fsB * 1.15));
          return;
        }
        const fs = Math.min(chh * 0.16, dpi * 0.11) * opt.fontScale, pad = Math.max(2, dpi * 0.025);
        const label = (it.number ? it.number + '  ' : '') + name;
        x.fillStyle = '#111'; x.textBaseline = 'top'; x.textAlign = 'left';
        if (label.trim()) x.fillText(fit(x, label.trim(), cw - pad * 2, fs, '800'), cx + pad, cy + pad);
        const dy = cy + pad + (label.trim() ? fs * 1.15 : 0), dh = cy + chh - pad - dy;
        if (dh > 4) drawPlay(x, cx + pad, dy, cw - pad * 2, dh, s2, it.entry.play, diagramOpt(opt, { court, minScale: dpi * 0.036 }));
      });
    });
    out.push(c);
  }
  return out;
}

/* Every page for the options, drawn at opt.dpi. */
export function pages(sc, book, terms, o) {
  const opt = withDefaults(o), items = pick(book, opt);
  let out;
  if (opt.layout === 'callsheet') out = callSheet(sc, book, terms, items, opt);
  else if (opt.layout === 'wristband') out = wristbands(sc, book, terms, items, opt);
  else if (opt.layout === 'storyboard') out = storyPages(sc, book, terms, items, opt);
  else out = cardPages(sc, book, terms, items, opt);
  return number(out, opt);
}

/* One play: its frames in a row (wrapping past five), the name and facts
   above, the notes below. For "Download this play". */
export function playPng(sc, entry, terms, o) {
  const opt = withDefaults(Object.assign({}, o, { frames: o && o.frames === 'one' ? 'one' : o && o.frames === 'grid' ? 'grid' : 'row' }));
  const dpi = opt.dpi, play = entry.play, beats = beatsOf(play);
  const s2 = scenarioFor(sc, entry.situation), court = courtFor(opt, false), A = aspectOf(play, court);
  const across = opt.frames === 'one' ? 1 : opt.frames === 'grid' ? Math.max(1, Math.min(beats.length, opt.framesAcross | 0 || 3)) : Math.min(beats.length, 5);
  const rows = opt.frames === 'one' ? 1 : Math.ceil(beats.length / across);
  const fw = Math.round(dpi * (opt.frames === 'one' ? 4.2 : 3)), gap = Math.round(dpi * 0.1), pad = Math.round(dpi * 0.2);
  const w = pad * 2 + across * fw + gap * (across - 1);
  /* measure the captions and notes for the height */
  const probe = canvas(10, 10).getContext('2d');
  const fs = dpi * 0.105 * opt.fontScale, small = dpi * 0.1 * opt.fontScale;
  font(probe, '600', fs);
  const capLines = opt.frames === 'one'
    ? beats.reduce((n, b, i) => { const c = captionFor(s2, entry, b, terms, opt.captions); return n + (c ? wrap(probe, (beats.length > 1 ? (i + 1) + '. ' : '') + c, w - pad * 2, 2).length : 0); }, 0)
    : Math.max(0, ...beats.map(b => wrap(probe, captionFor(s2, entry, b, terms, opt.captions), fw - 2, 4).length));
  font(probe, '400', small);
  const noteLines = opt.showNotes && entry.notes ? wrap(probe, entry.notes, w - pad * 2, 3).length : 0;
  const H = headLines(s2, { entry, number: '' }, opt);
  const headH = (H.name ? dpi * 0.16 * opt.fontScale * 1.2 : 0) + ([H.facts, H.stats].filter(Boolean).length * small * 1.3) + dpi * 0.06;
  const lh = Math.round(fs * 1.28);
  const capH = capLines ? capLines * lh + fs * 0.5 : 0;
  const bodyH = opt.frames === 'one' ? fw / A + capH : rows * (fw / A + capH) + gap * (rows - 1);
  const h = Math.ceil(pad * 2 + headH + bodyH + dpi * 0.06 + (noteLines ? noteLines * small * 1.3 + dpi * 0.05 : 0)) + 2;
  const c = canvas(w, h), x = c.getContext('2d');
  const o2 = opt.frames === 'one' ? opt : Object.assign({}, opt, { frames: 'grid', framesAcross: across });
  playBox(x, pad, pad, w - pad * 2, h - pad * 2, { entry, number: '', section: '' }, o2, dpi, 1, terms, sc);
  return c;
}

/* ---------- out to the printer or a file ---------- */

function blobUrl(c) {
  return new Promise(res => {
    if (c.toBlob) c.toBlob(b => res(b ? URL.createObjectURL(b) : c.toDataURL('image/png')), 'image/png');
    else res(c.toDataURL('image/png'));
  });
}

/* Print the pages as they were drawn, from a hidden frame, so the app's own
   page is never touched. Each canvas is one sheet, edge to edge (the margin
   is already in the drawing). Answers a promise once the dialog is open. */
export function print(canvases, o) {
  const opt = withDefaults(o), doc = globalThis.document;
  const list = Array.isArray(canvases) ? canvases : [canvases];
  const size = PAPER[opt.paper] || PAPER.letter;
  const inches = list[0] && list[0].inches ? list[0].inches : opt.landscape ? [size[1], size[0]] : size;
  const old = doc.getElementById('lsPrintFrame'); if (old) old.remove();
  return Promise.all(list.map(blobUrl)).then(urls => new Promise(resolve => {
    const f = doc.createElement('iframe');
    f.id = 'lsPrintFrame'; f.setAttribute('aria-hidden', 'true'); f.tabIndex = -1;
    f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    doc.body.appendChild(f);
    const w = f.contentWindow, d = w.document;
    d.open();
    d.write('<!doctype html><html><head><meta charset="utf-8"><title>' + String(opt.title || 'Playbook').replace(/[<&>]/g, '') + '</title><style>' +
      '@page{size:' + inches[0] + 'in ' + inches[1] + 'in;margin:0}html,body{margin:0;padding:0;background:#fff}' +
      'img{display:block;width:' + inches[0] + 'in;height:' + inches[1] + 'in;break-after:page;page-break-after:always}img:last-child{break-after:auto;page-break-after:auto}' +
      '</style></head><body>' + urls.map(u => '<img alt="" src="' + u + '">').join('') + '</body></html>');
    d.close();
    const imgs = Array.from(d.images);
    const go = () => {
      const done = () => { urls.forEach(u => { if (u.indexOf('blob:') === 0) URL.revokeObjectURL(u); }); f.remove(); };
      w.addEventListener('afterprint', () => globalThis.setTimeout(done, 100));
      globalThis.setTimeout(() => { w.focus(); w.print(); resolve(); }, 50);
    };
    Promise.all(imgs.map(i => (i.complete ? Promise.resolve() : new Promise(r => { i.onload = i.onerror = r; })))).then(go);
  }));
}

/* Save one canvas as a PNG file. */
export function download(canvas, filename) {
  return blobUrl(canvas).then(u => {
    const a = globalThis.document.createElement('a');
    a.href = u; a.download = filename || 'play.png';
    globalThis.document.body.appendChild(a); a.click(); a.remove();
    if (u.indexOf('blob:') === 0) globalThis.setTimeout(() => URL.revokeObjectURL(u), 2000);
  });
}

/* A file name from a play or book name: "Box Pin 2" -> "box-pin-2". */
export function slug(s) { return String(s || 'play').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'play'; }

/* The fonts the pages draw with, loaded before drawing (the page already
   links them; this waits for them so the first preview is not in Arial). */
export function ready() {
  const F = globalThis.document && globalThis.document.fonts;
  if (!F || !F.load) return Promise.resolve();
  return Promise.all(['800 20px Outfit', '400 14px "DM Sans"', '600 14px "DM Sans"', '700 14px "DM Sans"'].map(f => F.load(f).catch(() => null))).then(() => undefined);
}
