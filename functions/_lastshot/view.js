/* Feet to pixels, shared by the clipboard and the court so a play lands on
 * the floor exactly where it was drawn. The baseline is at the top of the
 * screen and half court at the bottom: the coach's view of a clipboard. */
import { COURT } from './court-geo.js';

export function fitView(cssW, cssH, pad = 10) {
  const s = Math.min((cssW - pad * 2) / COURT.W, (cssH - pad * 2) / COURT.H);
  const ox = (cssW - COURT.W * s) / 2, oy = (cssH - COURT.H * s) / 2;
  return {
    s, ox, oy, w: cssW, h: cssH,
    px: p => ({ x: ox + p.x * s, y: oy + p.y * s }),
    ft: q => ({ x: (q.x - ox) / s, y: (q.y - oy) / s })
  };
}

/* Size a canvas to its box at the device's pixel ratio. Returns the CSS size. */
export function sizeCanvas(cv) {
  const r = cv.getBoundingClientRect(), dpr = Math.min(3, window.devicePixelRatio || 1);
  const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { w, h, ctx, dpr };
}

/* The court's lines in feet: [ [ {x,y}, ... ], ... ] polylines. */
export function courtLines() {
  const { W, H, RIM, R3, CORNER_X, CORNER_Y, LANE, FT, FTR } = COURT;
  const L = [];
  L.push([{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H }, { x: 0, y: 0 }]);
  const lx = RIM.x - LANE / 2, rx = RIM.x + LANE / 2;
  L.push([{ x: lx, y: 0 }, { x: lx, y: FT }, { x: rx, y: FT }, { x: rx, y: 0 }]);
  const arc = (cx, cy, r, a0, a1, n = 40) => Array.from({ length: n + 1 }, (_, i) => { const a = a0 + (a1 - a0) * i / n; return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r }; });
  L.push(arc(RIM.x, FT, FTR, 0, Math.PI));
  // the three point line: corners, then the arc
  const a = Math.asin((CORNER_Y - RIM.y) / R3);
  const three = [{ x: CORNER_X, y: 0 }, { x: CORNER_X, y: CORNER_Y }, ...arc(RIM.x, RIM.y, R3, Math.PI - a, a, 60), { x: W - CORNER_X, y: CORNER_Y }, { x: W - CORNER_X, y: 0 }];
  L.push(three);
  L.push(arc(RIM.x, RIM.y, 4, 0, Math.PI, 20));
  L.push(arc(RIM.x, H, 6, Math.PI, Math.PI * 2));
  return L;
}
