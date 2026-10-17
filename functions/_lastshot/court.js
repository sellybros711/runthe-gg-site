/* THE LIVE COURT. Plays back the sim's frames on a top-down pixel half court
 * in Run The Floor's house style: hardwood in a five step ramp (cool
 * shadows, warm lights, light from the upper left), cream lines, an orange
 * rim. The floor is painted once at low resolution (PX pixels per foot) and
 * scaled up with smoothing off, so every pixel is crisp.
 *
 * Players are pixel tokens in the same ramp: ours in home colours, theirs in
 * away colours. Nothing here decides anything; it only draws a frame. */
import { fitView, sizeCanvas, courtLines } from './view.js';
import { COURT } from './court-geo.js';
import { IDS } from './playbook.js';

const PX = 4;   // pixels per foot on the low resolution floor
export const HOME = { c1: '#1f4e79', c2: '#ffd23f' };
export const AWAY = { c1: '#E0533D', c2: '#f4efe4' };

/* hoops/baller.js ramp(): dark cool, dark, base, light, light warm. Copied
   (not imported) so Last Shot never depends on a hoops file loading. */
export function ramp(hex) {
  const c = hexRgb(hex), cool = hexRgb('#2a2a68'), warm = hexRgb('#fff7dc');
  const mix = (a, b, t) => rgbHex(a.map((v, i) => Math.round(v + (b[i] - v) * t)));
  const dark = c.map(v => v * 0.72);
  return [mix(dark, cool, 0.35), rgbHex(dark.map(Math.round)), hex, mix(c, warm, 0.22), mix(c, warm, 0.45)];
}
const hexRgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const rgbHex = a => '#' + a.map(v => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('');

let FLOOR = null;
function floor() {
  if (FLOOR) return FLOOR;
  const W = COURT.W * PX, H = COURT.H * PX;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const wood = ramp('#c48a52');
  // boards run across the floor, a seam every 3 pixels, joints staggered
  for (let y = 0; y < H; y++) {
    const band = Math.floor(y / 3);
    g.fillStyle = wood[1 + ((band * 7) % 3)];
    g.fillRect(0, y, W, 1);
    if (y % 3 === 2) { g.fillStyle = wood[0]; g.globalAlpha = 0.35; g.fillRect(0, y, W, 1); g.globalAlpha = 1; }
    const j = ((band * 37) % 23) * 4;
    for (let x = j; x < W; x += 92) { g.fillStyle = wood[0]; g.fillRect(x, y, 1, 1); }
  }
  // the lane, painted
  const lane = ramp('#9a4a24');
  g.fillStyle = lane[2]; g.globalAlpha = 0.55;
  g.fillRect((COURT.RIM.x - COURT.LANE / 2) * PX, 0, COURT.LANE * PX, COURT.FT * PX);
  g.globalAlpha = 1;
  // lines, one pixel at a time so nothing is anti aliased
  g.fillStyle = '#f2ead6';
  for (const line of courtLines()) for (let i = 1; i < line.length; i++) pixLine(g, line[i - 1].x * PX, line[i - 1].y * PX, line[i].x * PX, line[i].y * PX);
  // backboard and rim
  g.fillStyle = '#eef2f6'; g.fillRect((COURT.RIM.x - 3) * PX, 4 * PX - 1, 6 * PX, 2);
  const r = ramp('#e2551d');
  for (let a = 0; a < 64; a++) {
    const t = a / 64 * Math.PI * 2;
    g.fillStyle = r[t < Math.PI ? 1 : 3];
    g.fillRect(Math.round(COURT.RIM.x * PX + Math.cos(t) * 3), Math.round(COURT.RIM.y * PX + Math.sin(t) * 3), 1, 1);
  }
  FLOOR = cv;
  return cv;
}

function pixLine(g, x0, y0, x1, y1) {
  const n = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)));
  for (let i = 0; i <= n; i++) { const t = n ? i / n : 0; g.fillRect(Math.round(x0 + (x1 - x0) * t), Math.round(y0 + (y1 - y0) * t), 1, 1); }
}

/* A top-down pixel player: a shaded disc in the ramp, a trim pip, a number. */
const TOKENS = new Map();
function token(c1, c2, label, size) {
  const key = c1 + c2 + label + size;
  if (TOKENS.has(key)) return TOKENS.get(key);
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const g = cv.getContext('2d'), R = ramp(c1), h = size / 2, r = h - 1;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = x + 0.5 - h, dy = y + 0.5 - h, d = Math.hypot(dx, dy);
    if (d > r) continue;
    const lit = (-dx - dy) / (r * 1.4);
    g.fillStyle = d > r - 1 ? R[0] : lit > 0.45 ? R[4] : lit > 0.1 ? R[3] : lit > -0.35 ? R[2] : R[1];
    g.fillRect(x, y, 1, 1);
  }
  g.fillStyle = c2; g.font = '700 ' + Math.round(size * 0.5) + 'px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(label, h, h + 1);
  TOKENS.set(key, cv);
  return cv;
}

export function createCourt(cv) {
  let V = null;
  function draw(fr, opts = {}) {
    const { w, h, ctx } = sizeCanvas(cv);
    V = fitView(w, h, 12);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#3a2a20'; ctx.fillRect(0, 0, w, h);
    ctx.drawImage(floor(), V.ox, V.oy, COURT.W * V.s, COURT.H * V.s);
    if (!fr) return;
    const size = Math.max(10, Math.round(V.s * 2.6));
    // set screens: a short shadow bar under the screener
    for (const [id, x, y] of fr.s || []) { const p = V.px({ x, y }); ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(p.x - size * 0.7, p.y + size * 0.45, size * 1.4, 3); }
    const shadow = (p) => { ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.beginPath(); ctx.ellipse(p.x + 2, p.y + size * 0.42, size * 0.42, size * 0.18, 0, 0, Math.PI * 2); ctx.fill(); };
    const people = [];
    for (let i = 0; i < 5; i++) people.push({ p: V.px({ x: fr.x[i * 2], y: fr.x[i * 2 + 1] }), img: token(AWAY.c1, AWAY.c2, 'X', size) });
    for (let i = 0; i < 5; i++) people.push({ p: V.px({ x: fr.o[i * 2], y: fr.o[i * 2 + 1] }), img: token(HOME.c1, HOME.c2, IDS[i].slice(1), size), id: IDS[i] });
    people.sort((a, b) => a.p.y - b.p.y);
    for (const q of people) { shadow(q.p); ctx.drawImage(q.img, Math.round(q.p.x - size / 2), Math.round(q.p.y - size / 2), size, size); }
    // the ball: in a hand, in the air, or on its way to the rim
    const b = V.px({ x: fr.b[0], y: fr.b[1] });
    const lift = fr.b[2] * V.s * 0.6;
    const br = Math.max(3, Math.round(V.s * 0.55 + fr.b[2] * 0.15));
    const off = fr.h ? size * 0.35 : 0;
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.arc(b.x + off, b.y + off * 0.6, br * 0.8, 0, Math.PI * 2); ctx.fill();
    const R = ramp('#e2762a');
    ctx.fillStyle = R[2]; ctx.fillRect(Math.round(b.x + off - br), Math.round(b.y - lift - br), br * 2, br * 2);
    ctx.fillStyle = R[4]; ctx.fillRect(Math.round(b.x + off - br), Math.round(b.y - lift - br), br, br);
    ctx.fillStyle = '#3a1606'; ctx.fillRect(Math.round(b.x + off - br), Math.round(b.y - lift), br * 2, 1);
    if (opts.debug) debug(ctx, fr);
  }
  function debug(ctx, fr) {
    ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
      const xp = V.px({ x: fr.x[i * 2], y: fr.x[i * 2 + 1] }), m = IDS.indexOf(fr.m[i]);
      const op = V.px({ x: fr.o[m * 2], y: fr.o[m * 2 + 1] });
      ctx.beginPath(); ctx.moveTo(xp.x, xp.y); ctx.lineTo(op.x, op.y); ctx.stroke();
    }
  }
  return { draw, view: () => V };
}
