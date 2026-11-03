/* Last Shot: a play drawn the way a coach prints it.
 *
 *   drawFrame(ctx, x, y, w, h, sc, play, beat, opt)   one storyboard frame
 *   drawPlay(ctx, x, y, w, h, sc, play, opt)          every frame layered as one diagram
 *   boundsOf(play, court), aspectOf(play, court)      the feet a drawing shows, and its shape
 *
 * Every print and export uses these: the cards, the storyboard, the call
 * sheet thumbnails, the wristband and the one play PNG. The pattern is 4th and
 * What's diagram.js, drawn the way the clipboard (board.js) draws: O's as
 * circles with a number, X's toward the rim from their man, a move as a line
 * with an arrow, a screen as a line ending in a short bar, a pass dashed, the
 * shot as a wavy line to the rim, small numbered circles for the step order,
 * a dot for the ball. On white, fitted to the box it is given, so a wristband
 * cell and a full page show the same play.
 *
 * A frame shows everyone where they stand as it opens (spotsAfter the steps
 * of earlier frames) and the steps drawn in it. Step numbers run on across
 * frames: frame 2 starts at the count after frame 1. All the frames of one
 * play share one crop, so the floor does not jump from frame to frame.
 *
 * opt (all optional):
 *   color        true for colour, false for black and white (the default)
 *   weight       line weight: 1 normal, 0.7 thin, 1.5 bold
 *   letters      'numbers' (1 to 5, the default), 'positions' (PG, SG ...) or false
 *   stepNumbers  the small numbered circles (default true)
 *   defense      the X's (default false)
 *   ball         the ball dot (default true)
 *   ghost        the frame before, faint (drawFrame only, default false)
 *   court        'half' (the default) or 'lane' (cropped to the lane and arc)
 *   label        text in the box's top left corner (the frame's number)
 *   minScale     pixels a foot the players and lines never shrink below, so a
 *                small frame stays readable (the court still fits the box)
 *
 * ES module, served to the browser from pages.js like the rest of Last Shot. */
import { COURT, dist } from './court-geo.js';
import { courtLines } from './view.js';
import { IDS, spotsAfter, holderAfter, framesOf, stepsBefore } from './playbook.js';
import { startSpots } from './defense.js';

const FONT = '"DM Sans", Inter, Arial, sans-serif';
const HEAD = 'Outfit, "DM Sans", Arial, sans-serif';

/* Sizes in feet, so a drawing scales as one piece. */
const R = 1.6;        // a player's circle
const NR = 1.05;      // a step number's circle
const LW = 0.36;      // a route line at weight 1

const INK = {
  color: { ink: '#22324d', shot: '#d8452f', def: '#c8392a', ball: '#e8742a', court: 'rgba(34,50,77,.30)', rim: '#e0533d', board: 'rgba(34,50,77,.6)', ghost: 0.2 },
  bw: { ink: '#111111', shot: '#111111', def: '#666666', ball: '#111111', court: 'rgba(0,0,0,.26)', rim: '#444444', board: '#555555', ghost: 0.18 }
};

/* ---------- the feet a drawing shows ---------- */

function contentBox(play) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  const add = p => { if (!p) return; x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); };
  for (const id of IDS) add(play.spots[id]);
  for (const s of play.steps) if (s && s.pts) s.pts.forEach(add);
  return { x0, x1, y0, y1 };
}

/* The half court with room for a circle on its edge, or the lane and arc
   grown to hold everything the play draws. Feet: y 0 is the baseline, at the
   top of the drawing. */
export function boundsOf(play, court) {
  const m = R + 0.4;
  if (court !== 'lane') return { x0: -m, x1: COURT.W + m, y0: -m, y1: COURT.H + m };
  const c = contentBox(play);
  return {
    x0: Math.max(-m, Math.min(1.5, c.x0 - m - 0.6)),
    x1: Math.min(COURT.W + m, Math.max(COURT.W - 1.5, c.x1 + m + 0.6)),
    y0: -m,
    y1: Math.min(COURT.H + m, Math.max(30.5, c.y1 + m + 0.8))
  };
}
export function aspectOf(play, court) { const b = boundsOf(play, court); return (b.x1 - b.x0) / (b.y1 - b.y0); }

/* ---------- drawing helpers ---------- */

/* s scales the court; g (never under minScale) scales the players, lines
   and numbers drawn on it. */
function view(X, Y, W, H, b, minScale) {
  const s = Math.min(W / (b.x1 - b.x0), H / (b.y1 - b.y0));
  const ox = X + (W - (b.x1 - b.x0) * s) / 2 - b.x0 * s, oy = Y + (H - (b.y1 - b.y0) * s) / 2 - b.y0 * s;
  return { s, g: Math.max(s, Math.min(minScale || 0, s * 1.8)), px: p => ({ x: ox + p.x * s, y: oy + p.y * s }) };
}
function poly(ctx, pts) { ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.stroke(); }
function pathLen(pts) { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); return L; }
function pointAt(pts, t) {
  const L = pathLen(pts) * t; let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    if (acc + d >= L) { const k = d ? (L - acc) / d : 0; return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * k, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * k }; }
    acc += d;
  }
  return pts[pts.length - 1];
}
/* Pull the end of a segment back by `by` pixels (so an arrow stops at a circle). */
function shorten(a, b, by) {
  const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy);
  if (L <= by * 1.5) return b;
  return { x: b.x - dx / L * by, y: b.y - dy / L * by };
}
function arrow(ctx, a, b, ink, k) {
  const ang = Math.atan2(b.y - a.y, b.x - a.x);
  ctx.fillStyle = ink; ctx.beginPath(); ctx.moveTo(b.x, b.y);
  ctx.lineTo(b.x - Math.cos(ang - 0.42) * k, b.y - Math.sin(ang - 0.42) * k);
  ctx.lineTo(b.x - Math.cos(ang + 0.42) * k, b.y - Math.sin(ang + 0.42) * k);
  ctx.closePath(); ctx.fill();
}
function wavy(ctx, a, b, ink, lw, amp) {
  const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
  const n = Math.max(3, Math.round(L / (amp * 3.4)));
  ctx.strokeStyle = ink; ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(a.x, a.y);
  for (let i = 1; i <= n * 10; i++) { const t = i / (n * 10), w = Math.sin(t * n * Math.PI * 2) * amp * (1 - t * 0.85); ctx.lineTo(a.x + dx * t + nx * w, a.y + dy * t + ny * w); }
  ctx.stroke();
}

function setup(opt) {
  const o = opt || {};
  return {
    pal: o.color ? INK.color : INK.bw,
    wt: o.weight > 0 ? o.weight : 1,
    letters: o.letters === undefined || o.letters === true ? 'numbers' : o.letters,
    stepNumbers: o.stepNumbers !== false,
    defense: !!o.defense,
    ball: o.ball !== false,
    ghost: !!o.ghost,
    court: o.court === 'lane' ? 'lane' : 'half',
    label: o.label == null ? '' : String(o.label),
    minScale: Number(o.minScale) > 0 ? Number(o.minScale) : 0
  };
}

function drawCourt(ctx, V, P, wt) {
  ctx.strokeStyle = P.court; ctx.lineWidth = Math.max(0.75, V.s * 0.14 * Math.sqrt(wt));
  for (const line of courtLines()) poly(ctx, line.map(V.px));
  const rim = V.px(COURT.RIM);
  ctx.strokeStyle = P.rim; ctx.lineWidth = Math.max(1, V.s * 0.2);
  ctx.beginPath(); ctx.arc(rim.x, rim.y, 0.75 * V.s, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = P.board; ctx.lineWidth = Math.max(1.2, V.s * 0.32);
  poly(ctx, [V.px({ x: COURT.RIM.x - 3, y: 4 }), V.px({ x: COURT.RIM.x + 3, y: 4 })]);
}

/* One step's line, from where everyone stands just before it. Answers the
   polyline (pixels) a number can sit on. `circles` are the pixel centres of
   the players drawn in this box, so a pass stops at the receiver's circle. */
function drawStep(ctx, V, P, wt, s, at, circles, alpha) {
  const lw = Math.max(1, V.g * LW * wt), k = Math.max(4, V.g * (1.15 + 0.25 * wt));
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = P.ink; ctx.lineWidth = lw; ctx.setLineDash([]);
  let line = null;
  if ((s.kind === 'move' || s.kind === 'screen') && s.pts && s.pts.length && at[s.who]) {
    const pts = [at[s.who], ...s.pts].map(V.px);
    line = pts;
    const a = pts[pts.length - 2], b = pts[pts.length - 1];
    if (s.kind === 'screen') {
      poly(ctx, pts);
      const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L, h = V.g * 1.35;
      ctx.lineWidth = lw * 1.45; poly(ctx, [{ x: b.x + nx * h, y: b.y + ny * h }, { x: b.x - nx * h, y: b.y - ny * h }]);
    } else {
      /* stop the line a touch short so the arrow's point is sharp */
      const end = shorten(a, b, lw * 0.6);
      poly(ctx, pts.slice(0, -1).concat([shorten(a, end, k * 0.6)]));
      arrow(ctx, a, end, P.ink, k);
    }
  } else if (s.kind === 'pass' && at[s.from] && at[s.to]) {
    const a = V.px(at[s.from]), b0 = V.px(at[s.to]);
    const hit = circles.some(c => Math.hypot(c.x - b0.x, c.y - b0.y) < 0.5);
    const b = hit ? shorten(a, b0, V.g * (R + 0.35)) : b0;
    ctx.setLineDash([Math.max(3, V.g * 1.1), Math.max(2.5, V.g * 0.85)]);
    poly(ctx, [a, shorten(a, b, k * 0.6)]); ctx.setLineDash([]);
    arrow(ctx, a, b, P.ink, k);
    line = [a, b];
  } else if (s.kind === 'shoot' && at[s.who]) {
    const a = V.px(at[s.who]), rim = V.px(COURT.RIM);
    const b = shorten(a, rim, V.g * 0.9);
    wavy(ctx, a, b, P.shot, lw, Math.max(1.5, V.g * 0.75));
    line = [a, b];
  }
  ctx.globalAlpha = 1;
  return line;
}

/* Where a step's number goes: along its line, clear of the players and of
   the numbers already placed. */
function numberSpot(line, V, taken) {
  const clear = V.g * (R + NR + 0.15), apart = V.g * (NR * 2 + 0.2);
  const tries = [0.5, 0.4, 0.6, 0.3, 0.7, 0.22, 0.78, 0.15, 0.85];
  for (const t of tries) {
    const p = pointAt(line, t);
    if (taken.players.every(c => Math.hypot(c.x - p.x, c.y - p.y) > clear) && taken.nums.every(c => Math.hypot(c.x - p.x, c.y - p.y) > apart)) return p;
  }
  return pointAt(line, 0.5);
}
function drawNum(ctx, V, P, p, n, ink) {
  const r = V.g * NR;
  ctx.fillStyle = '#fff'; ctx.strokeStyle = ink; ctx.lineWidth = Math.max(0.8, V.g * 0.16);
  ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = ink; ctx.font = '700 ' + Math.max(6, r * (n > 9 ? 1.05 : 1.3)).toFixed(1) + 'px ' + FONT;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(String(n), p.x, p.y + r * 0.06);
}
function drawO(ctx, V, P, sc, id, p, cfg, alpha) {
  const q = V.px(p), r = V.g * R;
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#fff'; ctx.strokeStyle = P.ink; ctx.lineWidth = Math.max(1, V.g * 0.26 * Math.sqrt(cfg.wt));
  ctx.beginPath(); ctx.arc(q.x, q.y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  if (cfg.letters) {
    const pos = cfg.letters === 'positions';
    const text = pos ? ((sc.roster && sc.roster[id] && sc.roster[id].arch) || id.slice(1)) : id.slice(1);
    const size = r * (text.length > 1 ? 0.95 : 1.25);
    ctx.fillStyle = P.ink; ctx.font = '800 ' + Math.max(6, size).toFixed(1) + 'px ' + HEAD;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, q.x, q.y + r * 0.06);
  }
  ctx.globalAlpha = 1;
  return q;
}
function drawBall(ctx, V, P, p) {
  const q = V.px(p), r = V.g * R;
  ctx.fillStyle = P.ball; ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(1, V.g * 0.18);
  ctx.beginPath(); ctx.arc(q.x + r * 0.78, q.y - r * 0.78, r * 0.42, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
}
function drawX(ctx, V, P, p, wt) {
  const q = V.px(p), k = V.g * 1.05;
  ctx.strokeStyle = P.def; ctx.lineWidth = Math.max(1, V.g * 0.34 * Math.sqrt(wt));
  poly(ctx, [{ x: q.x - k, y: q.y - k }, { x: q.x + k, y: q.y + k }]);
  poly(ctx, [{ x: q.x + k, y: q.y - k }, { x: q.x - k, y: q.y + k }]);
}
/* The defense where it lines up against `at`, with `holder` on the ball,
   placed by the sim's own rule (defense.js), as the clipboard does. */
function drawDefense(ctx, V, P, sc, at, holder, wt) {
  let xs = null;
  try { xs = startSpots({ ...sc, handler: holder }, { spots: at }); } catch (e) { xs = null; }
  if (!xs) return;
  for (const xid of Object.keys(sc.matchups || {})) if (xs[xid]) drawX(ctx, V, P, xs[xid], wt);
}
function drawLabel(ctx, x, y, w, h, P, text) {
  if (!text) return;
  const fs = Math.max(9, Math.min(w, h) * 0.075);
  ctx.font = '800 ' + fs.toFixed(1) + 'px ' + HEAD;
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillStyle = '#fff'; ctx.fillRect(x, y, ctx.measureText(text).width + fs * 0.75, fs * 1.35);
  ctx.fillStyle = P.ink; ctx.fillText(text, x + fs * 0.35, y + fs * 0.25);
}

/* The first step number of frame `beat`: one more than every step before it. */
function firstNumber(play, beat) {
  const F = framesOf(play);
  let n = 1;
  for (let b = 1; b < beat && b <= F.length; b++) n += F[b - 1].length;
  return n;
}

/* Steps `idx` (indices into play.steps) drawn as lines, then numbered from
   n0. Answers the placed numbers for drawing on top later. */
function laySteps(ctx, V, P, cfg, play, idx, n0, circles, alpha, numbered) {
  const nums = [];
  idx.forEach((i, k) => {
    const s = play.steps[i];
    const at = spotsAfter(play, play.steps.slice(0, i));
    const line = drawStep(ctx, V, P, cfg.wt, s, at, circles, alpha);
    if (line && numbered) nums.push({ line, n: n0 + k, ink: s.kind === 'shoot' ? P.shot : P.ink });
  });
  return nums;
}
function placeNums(ctx, V, P, nums, circles) {
  const taken = { players: circles, nums: [] };
  for (const m of nums) { const p = numberSpot(m.line, V, taken); taken.nums.push(p); m.at = p; }
  for (const m of nums) drawNum(ctx, V, P, m.at, m.n, m.ink);
}

/* ---------- public ---------- */

/* One storyboard frame, fitted to the box. Answers the next step number. */
export function drawFrame(ctx, X, Y, W, H, sc, play, beat, opt) {
  const cfg = setup(opt), P = cfg.pal;
  beat = Math.max(1, beat | 0);
  const F = framesOf(play, beat);
  const idx = F[beat - 1] || [];
  const before = stepsBefore(play, beat);
  const at = spotsAfter(play, before);
  const holder = holderAfter(sc, before);
  const V = view(X, Y, W, H, boundsOf(play, cfg.court), cfg.minScale);

  ctx.save();
  ctx.beginPath(); ctx.rect(X, Y, W, H); ctx.clip();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  drawCourt(ctx, V, P, cfg.wt);

  const circles = IDS.filter(id => at[id]).map(id => V.px(at[id]));
  if (cfg.ghost && beat > 1) {
    const prev = stepsBefore(play, beat - 1), pat = spotsAfter(play, prev);
    laySteps(ctx, V, P, cfg, play, F[beat - 2] || [], 0, [], P.ghost, false);
    for (const id of IDS) if (pat[id] && at[id] && dist(pat[id], at[id]) > 0.5) drawO(ctx, V, P, sc, id, pat[id], cfg, P.ghost);
  }
  if (cfg.defense) drawDefense(ctx, V, P, sc, at, holder, cfg.wt);
  const nums = laySteps(ctx, V, P, cfg, play, idx, firstNumber(play, beat), circles, 1, cfg.stepNumbers);
  for (const id of IDS) if (at[id]) drawO(ctx, V, P, sc, id, at[id], cfg, 1);
  if (cfg.ball && at[holder]) drawBall(ctx, V, P, at[holder]);
  placeNums(ctx, V, P, nums, circles);
  drawLabel(ctx, X, Y, W, H, P, cfg.label);
  ctx.restore();
  return firstNumber(play, beat) + idx.length;
}

/* The whole play as one diagram: the five where they start, every frame's
   steps layered in order (later frames on top), numbered straight through. */
export function drawPlay(ctx, X, Y, W, H, sc, play, opt) {
  const cfg = setup(opt), P = cfg.pal;
  const V = view(X, Y, W, H, boundsOf(play, cfg.court), cfg.minScale);
  const at = play.spots;
  ctx.save();
  ctx.beginPath(); ctx.rect(X, Y, W, H); ctx.clip();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  drawCourt(ctx, V, P, cfg.wt);
  const circles = IDS.filter(id => at[id]).map(id => V.px(at[id]));
  if (cfg.defense) drawDefense(ctx, V, P, sc, at, sc.handler, cfg.wt);
  let nums = [], n = 1;
  for (const idx of framesOf(play)) { nums = nums.concat(laySteps(ctx, V, P, cfg, play, idx, n, circles, 1, cfg.stepNumbers)); n += idx.length; }
  for (const id of IDS) if (at[id]) drawO(ctx, V, P, sc, id, at[id], cfg, 1);
  if (cfg.ball && at[sc.handler]) drawBall(ctx, V, P, at[sc.handler]);
  placeNums(ctx, V, P, nums, circles);
  drawLabel(ctx, X, Y, W, H, P, cfg.label);
  ctx.restore();
}
