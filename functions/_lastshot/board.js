/* THE CLIPBOARD. A whiteboard half court where the coach draws the play.
 *
 *   no tool  drag a player to set where he starts (before he has a route)
 *   Move     drag from a player to draw his route (bends become segments)
 *   Screen   the same, and the route ends in a set screen (a short bar)
 *   Pass     tap the man with the ball, then a teammate (a dashed line)
 *   Shoot    tap the man with the ball to make him the shooter (a wavy line)
 *
 * Pointer events only, so a thumb and a mouse are the same input. Every step
 * is numbered in the order it was drawn, which is the order it runs. */
import { fitView, sizeCanvas, courtLines } from './view.js';
import { COURT, dist } from './court-geo.js';
import { IDS, holderAfter, spotsAfter, shooterOf, problems } from './playbook.js';

const HIT = 3.4;          // feet: how close a tap must land to a player
const MIN_ROUTE = 2.5;    // feet: shorter than this is a tap, not a route

export function createBoard(cv, sc, getPlay, setPlay, ui) {
  let tool = null, drag = null, pickFrom = null, V = null;

  const play = () => getPlay();
  const steps = () => play().steps;
  const commit = p => { setPlay(p); draw(); };

  function hitPlayer(ft, at) {
    let best = null, bd = HIT;
    for (const id of IDS) { const d = dist(ft, at[id]); if (d < bd) { bd = d; best = id; } }
    return best;
  }

  function locked() {
    if (shooterOf(play())) { ui.hint('The shot is the last step. Undo to add more.'); return true; }
    return false;
  }

  function down(e) {
    if (!V) return;
    cv.setPointerCapture && cv.setPointerCapture(e.pointerId);
    const ft = V.ft({ x: e.offsetX, y: e.offsetY });
    const at = spotsAfter(play(), steps());
    const who = hitPlayer(ft, at);
    if (!tool) {
      if (!who) return;
      if (steps().some(s => s.who === who || s.from === who || s.to === who)) { ui.hint(who + ' already has a job. Undo or Clear to move him.'); return; }
      drag = { kind: 'spot', who };
      return;
    }
    if (tool === 'move' || tool === 'screen') {
      if (!who) { ui.hint('Start the route on a player.'); return; }
      if (locked()) return;
      drag = { kind: tool, who, pts: [at[who]], raw: [at[who]] };
      return;
    }
    if (tool === 'pass') {
      if (locked()) return;
      const h = holderAfter(sc, steps());
      if (!pickFrom) {
        if (who !== h) { ui.hint(h + ' has the ball. Tap him first.'); return; }
        pickFrom = h; ui.hint('Now tap who gets it.'); draw(); return;
      }
      if (!who || who === pickFrom) { pickFrom = null; ui.hint('Pass cancelled.'); draw(); return; }
      const p = clone(play()); p.steps.push({ kind: 'pass', from: pickFrom, to: who }); pickFrom = null;
      ui.hint(''); commit(p); return;
    }
    if (tool === 'shoot') {
      if (locked()) return;
      const h = holderAfter(sc, steps());
      if (who !== h) { ui.hint(who ? who + ' needs the ball. Pass to him first.' : 'Tap ' + h + '. He has the ball.'); return; }
      const p = clone(play()); p.steps.push({ kind: 'shoot', who }); ui.hint(''); commit(p);
    }
  }

  function move(e) {
    if (!drag || !V) return;
    const ft = clampFt(V.ft({ x: e.offsetX, y: e.offsetY }));
    if (drag.kind === 'spot') {
      const p = clone(play()); p.spots[drag.who] = ft; setPlay(p); draw(); return;
    }
    const last = drag.raw[drag.raw.length - 1];
    if (dist(last, ft) >= 0.6) { drag.raw.push(ft); drag.pts = simplify(drag.raw, 1.3); draw(); }
  }

  function up() {
    if (!drag) return;
    const d = drag; drag = null;
    if (d.kind === 'spot') { commit(play()); return; }
    const pts = simplify(d.raw, 1.3).slice(1);
    const len = pathLen([d.raw[0], ...pts]);
    if (len < MIN_ROUTE) { ui.hint('Drag farther to draw a route.'); draw(); return; }
    const p = clone(play()); p.steps.push({ kind: d.kind, who: d.who, pts: pts.map(r1) });
    ui.hint(''); commit(p);
  }

  cv.addEventListener('pointerdown', down);
  cv.addEventListener('pointermove', move);
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', () => { drag = null; draw(); });

  /* ---------- drawing ---------- */
  function draw() {
    const { w, h, ctx } = sizeCanvas(cv);
    V = fitView(w, h, 12);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#fbfaf6'; ctx.fillRect(0, 0, w, h);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // the floor
    ctx.strokeStyle = 'rgba(34,50,77,.35)'; ctx.lineWidth = 1.5;
    for (const line of courtLines()) poly(ctx, line.map(V.px));
    const rim = V.px(COURT.RIM);
    ctx.strokeStyle = '#E0533D'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(rim.x, rim.y, 0.75 * V.s, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = 'rgba(34,50,77,.6)'; ctx.lineWidth = 3;
    poly(ctx, [V.px({ x: COURT.RIM.x - 3, y: 4 }), V.px({ x: COURT.RIM.x + 3, y: 4 })]);

    // the steps, in order
    const p = play();
    const before = [];
    p.steps.forEach((s, i) => {
      const at = spotsAfter(p, before);
      drawStep(ctx, s, at, i + 1);
      before.push(s);
    });
    if (drag && drag.kind !== 'spot') drawRoute(ctx, drag.pts, drag.kind, 'rgba(34,50,77,.55)');

    // defenders where they start (their own spots follow the starting floor)
    for (const [xid, man] of Object.entries(sc.matchups)) {
      const m = p.spots[man], r = COURT.RIM, L = dist(m, r) || 1;
      const g = Math.min(4, L * 0.5);
      drawX(ctx, V.px({ x: m.x + (r.x - m.x) / L * g, y: m.y + (r.y - m.y) / L * g }));
    }
    // players: where they start, ghosted where they end up
    const end = spotsAfter(p, p.steps);
    const holder = holderAfter(sc, p.steps);
    for (const id of IDS) {
      if (dist(end[id], p.spots[id]) > 0.5) drawO(ctx, V.px(end[id]), id, { ghost: true });
      drawO(ctx, V.px(p.spots[id]), id, { ball: id === sc.handler, picked: pickFrom === id });
    }
    if (holder !== sc.handler && !shooterOf(p)) ring(ctx, V.px(end[holder]), '#E8742A');
    ui.changed(p);
  }

  function drawStep(ctx, s, at, n) {
    const ink = '#22324d';
    if (s.kind === 'move' || s.kind === 'screen') {
      const pts = [at[s.who], ...s.pts];
      drawRoute(ctx, pts, s.kind, ink);
      num(ctx, V.px(midOf(pts)), n);
    } else if (s.kind === 'pass') {
      const a = V.px(at[s.from]), b = V.px(at[s.to]);
      ctx.strokeStyle = ink; ctx.lineWidth = 2.2; ctx.setLineDash([7, 6]);
      poly(ctx, [a, b]); ctx.setLineDash([]);
      arrow(ctx, a, b, ink);
      num(ctx, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, n);
    } else if (s.kind === 'shoot') {
      const a = V.px(at[s.who]), b = V.px(COURT.RIM);
      wavy(ctx, a, b, '#E0533D');
      num(ctx, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, n, '#E0533D');
    }
  }

  function drawRoute(ctx, ptsFt, kind, ink) {
    const pts = ptsFt.map(V.px);
    ctx.strokeStyle = ink; ctx.lineWidth = 2.6;
    poly(ctx, pts);
    const a = pts[pts.length - 2] || pts[0], b = pts[pts.length - 1];
    if (kind === 'screen') {
      const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L, k = 0.9 * V.s * 1.4;
      ctx.lineWidth = 3.4; poly(ctx, [{ x: b.x + nx * k, y: b.y + ny * k }, { x: b.x - nx * k, y: b.y - ny * k }]);
    } else arrow(ctx, a, b, ink);
  }

  /* ---------- public ---------- */
  return {
    draw,
    setTool(t) { tool = tool === t ? null : t; pickFrom = null; drag = null; draw(); return tool; },
    get tool() { return tool; },
    undo() { const p = clone(play()); p.steps.pop(); pickFrom = null; commit(p); },
    clear() { const p = clone(play()); p.steps = []; pickFrom = null; commit(p); },
    problems: () => problems(sc, play()),
    view: () => V
  };
}

/* ---------- helpers ---------- */
const clone = o => JSON.parse(JSON.stringify(o));
const r1 = p => ({ x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 });
const clampFt = p => ({ x: Math.max(0.5, Math.min(COURT.W - 0.5, p.x)), y: Math.max(0.5, Math.min(COURT.H - 0.5, p.y)) });
const pathLen = pts => pts.reduce((s, p, i) => i ? s + dist(pts[i - 1], p) : 0, 0);
function midOf(pts) {
  const L = pathLen(pts) / 2; let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = dist(pts[i - 1], pts[i]);
    if (acc + d >= L) { const k = (L - acc) / (d || 1); return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * k, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * k }; }
    acc += d;
  }
  return pts[pts.length - 1];
}

/* Ramer Douglas Peucker: a freehand drag becomes a few straight segments. */
export function simplify(pts, eps) {
  if (pts.length < 3) return pts.slice();
  const a = pts[0], b = pts[pts.length - 1];
  let idx = 0, best = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = perp(pts[i], a, b);
    if (d > best) { best = d; idx = i; }
  }
  if (best <= eps) return [a, b];
  return [...simplify(pts.slice(0, idx + 1), eps).slice(0, -1), ...simplify(pts.slice(idx), eps)];
}
function perp(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy);
  if (!L) return Math.hypot(p.x - a.x, p.y - a.y);
  return Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x) / L;
}

function poly(ctx, pts) { ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.stroke(); }
function arrow(ctx, a, b, ink) {
  const ang = Math.atan2(b.y - a.y, b.x - a.x), k = 9;
  ctx.fillStyle = ink; ctx.beginPath(); ctx.moveTo(b.x, b.y);
  ctx.lineTo(b.x - Math.cos(ang - 0.45) * k, b.y - Math.sin(ang - 0.45) * k);
  ctx.lineTo(b.x - Math.cos(ang + 0.45) * k, b.y - Math.sin(ang + 0.45) * k); ctx.closePath(); ctx.fill();
}
function wavy(ctx, a, b, ink) {
  const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L, n = Math.max(3, Math.round(L / 14));
  ctx.strokeStyle = ink; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(a.x, a.y);
  for (let i = 1; i <= n * 8; i++) { const t = i / (n * 8), w = Math.sin(t * n * Math.PI * 2) * 4 * (1 - t); ctx.lineTo(a.x + dx * t + nx * w, a.y + dy * t + ny * w); }
  ctx.stroke();
}
function num(ctx, p, n, ink = '#22324d') {
  ctx.fillStyle = '#fff'; ctx.strokeStyle = ink; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(p.x, p.y, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = ink; ctx.font = '700 10px DM Sans, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(String(n), p.x, p.y + 0.5);
}
function drawO(ctx, p, id, o = {}) {
  ctx.globalAlpha = o.ghost ? 0.28 : 1;
  ctx.fillStyle = '#fff'; ctx.strokeStyle = '#22324d'; ctx.lineWidth = 2.2;
  ctx.beginPath(); ctx.arc(p.x, p.y, 13, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#22324d'; ctx.font = '800 12px Outfit, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(id, p.x, p.y + 0.5);
  if (o.ball && !o.ghost) { ctx.fillStyle = '#E8742A'; ctx.beginPath(); ctx.arc(p.x + 10, p.y - 10, 5, 0, Math.PI * 2); ctx.fill(); }
  ctx.globalAlpha = 1;
  if (o.picked) ring(ctx, p, '#E8742A');
}
function ring(ctx, p, c) { ctx.strokeStyle = c; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(p.x, p.y, 17, 0, Math.PI * 2); ctx.stroke(); }
function drawX(ctx, p) {
  ctx.strokeStyle = '#E0533D'; ctx.lineWidth = 3; const k = 7;
  poly(ctx, [{ x: p.x - k, y: p.y - k }, { x: p.x + k, y: p.y + k }]);
  poly(ctx, [{ x: p.x + k, y: p.y - k }, { x: p.x - k, y: p.y + k }]);
}
