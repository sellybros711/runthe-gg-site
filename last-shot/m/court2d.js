/* THE RUN VIEW, PHASE 1: THE TACTICS BOARD (2026-11-19). The owner picked
 * "the hybrid, start the 2D board": a modern, anti-aliased top-down court
 * that reads as a game and as a coaching tool at once. It replaced the pixel
 * art run view (Run The Floor's traced rig), which the owner found "a very
 * retro look". Phase 2 (2026-11-22) hands the release to finish span to the
 * 3D shot cam on a capable device (shotcam.js); this file still draws the
 * play, the answer cutaway, and the whole run anywhere the 3D does not go.
 *
 * WHAT IS ON IT
 *   the floor      light maple boards running toward the basket (the owner's
 *                  maple, 2026-11-19), the lane painted in the home navy,
 *                  crisp lines at any zoom, the far half mirrored past half court
 *   the players    number discs with shoulders, a facing pointer and a stride
 *                  bob, on soft shadows: home navy and gold, away red
 *   the ball       with its height shown by a shadow that drifts off it
 *   the motion     short fading trails behind every body
 *   the make       swish rings off the rim; on a winner, confetti
 * THE COACHING LAYER (everything here is read off the sim, nothing invented)
 *   routes         the coach's drawn routes, faint, lighting up as each runner
 *                  covers them; screen bars; pass lines where the ball went
 *   the screen     the arrow of the cutter's own defender round the screen, with
 *                  a chip for what the scheme had him do (result.scheme, and the
 *                  defender is the one the frames say had the cutter just before)
 *   open space     a ring on the shooter as wide as his space to the closest
 *                  defender, shrinking as the contest closes, then the sim's
 *                  own open value at the release
 *   the read       a chip at the release: the shot caption's word and its make
 *                  chance, the same numbers the readout shows
 *
 * SPEED. Nothing big is drawn twice: the floor (wood, paint, light) is one
 * texture in feet, built once per needed resolution; the lines are one Path2D
 * stroked in feet; the vignette is one canvas per stage size; discs, shadows,
 * the ball and every chip are sprites made once. No shadowBlur per frame (a
 * glow is a wide faint stroke under a thin bright one). The run's routes and
 * how far each is covered at every frame are worked out once, in camStart.
 *
 * Nothing here decides anything; it only draws a frame. */
import { fitView, sizeCanvas, courtLines } from './view.js?b=f3ede3a5eb';
import { COURT } from './court-geo.js?b=f3ede3a5eb';
import { IDS, spotsAfter } from './playbook.js?b=f3ede3a5eb';

export const HOME = { c1: '#1f4e79', c2: '#ffd23f', c3: '#163a5c', lit: '#2f6aa0' };
export const AWAY = { c1: '#d9473a', c2: '#f4efe4', c3: '#a8342a', lit: '#ef6a5c' };
const RIM = COURT.RIM;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const TAU = Math.PI * 2;
const FONT = 'Outfit, system-ui, sans-serif';
const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; };

/* What the scheme had the cutter's man do at the screen, as a chip. */
export const SCHEME_CHIP = { over: 'FOUGHT OVER', under: 'WENT UNDER', switch: 'SWITCHED', matchup: 'SWITCHED',
  zone23: 'ZONE SITS', zone131: 'ZONE SITS', zone32: 'ZONE SITS' };
/* The shot caption's word (sim.js shoot), short, for the read chip. */
export const READ_CHIP = { 'Wide open': 'WIDE OPEN', 'Open look': 'OPEN LOOK', 'Hand in the face': 'HAND UP', 'Contested': 'CONTESTED', 'Bail out': 'BAIL OUT' };
/* The space colours, on the sim's own open thresholds (sim.js shoot). */
const openCol = d => d >= 6 ? '61,220,132' : d >= 4 ? '255,210,63' : d >= 2 ? '255,140,60' : '255,84,72';

/* ---------- the floor ---------- */
/* In feet: the apron round both halves (the far one mirrored at half court). */
const FX0 = -6, FY0 = -5, FW = 62, FH = 104, APRON = '#17263a', SURROUND = '#0f1116';
/* Texture pixels a foot. The shot cam on a phone wants about 50 device
   pixels a foot; the wood is soft enough to take the stretch, and the lines
   are drawn over it as paths, crisp at any zoom. 62 by 104 ft at 28 is 5 M
   pixels, built once a page (warm() builds it while the coach draws). */
const PPF = 28;
function rnd(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
/* Maple boards, baseline to baseline: a tile of 8 ft at 64 pixels a foot,
   boards 3 inches wide, staggered butt joints, faint grain. */
let WOOD = null;
function wood() {
  if (WOOD) return WOOD;
  const PPF = 64, N = PPF * 8, cv = mk(N, N), g = cv.getContext('2d'), r = rnd(7), pw = PPF / 4, tone = [226, 186, 134];
  for (let i = 0; i < N / pw; i++) {
    let y = -r() * N;
    while (y < N) {
      const len = (2 + r() * 5) * PPF, v = (r() - 0.5) * 22, warm = (r() - 0.5) * 10;
      const c = [tone[0] + v + warm, tone[1] + v, tone[2] + v - warm].map(q => clamp(Math.round(q), 0, 255));
      for (const yy of [y, y - N, y + N]) {
        g.fillStyle = 'rgb(' + c + ')'; g.fillRect(i * pw, yy, pw, len);
        for (let k = 0; k < 4; k++) { g.fillStyle = 'rgba(' + (r() < 0.5 ? '90,55,25' : '255,240,210') + ',' + (0.05 + r() * 0.07) + ')'; g.fillRect(i * pw + r() * pw, yy, 0.6 + r() * 1.2, len); }
        g.fillStyle = 'rgba(70,40,15,.28)'; g.fillRect(i * pw, yy + len - 1, pw, 1.2);
      }
      y += len;
    }
    g.fillStyle = 'rgba(70,40,15,.16)'; g.fillRect(i * pw, 0, 1, N);
  }
  return (WOOD = cv);
}
let FLOOR = null;
function floorTex() {
  if (FLOOR) return FLOOR;
  const ppf = PPF, cv = mk(FW * ppf, FH * ppf), g = cv.getContext('2d');
  g.setTransform(ppf, 0, 0, ppf, -FX0 * ppf, -FY0 * ppf);
  g.fillStyle = APRON; g.fillRect(FX0, FY0, FW, FH);
  const pat = g.createPattern(wood(), 'repeat');
  pat.setTransform(new DOMMatrix().scale(1 / 64));
  g.fillStyle = pat; g.fillRect(0, 0, COURT.W, COURT.H * 2);
  // the lane in the home navy, both ends, and the centre circle
  const lx = RIM.x - COURT.LANE / 2;
  g.fillStyle = 'rgba(31,78,121,.86)';
  g.fillRect(lx, 0, COURT.LANE, COURT.FT); g.fillRect(lx, COURT.H * 2 - COURT.FT, COURT.LANE, COURT.FT);
  g.beginPath(); g.arc(RIM.x, COURT.H, 6, 0, TAU); g.fill();
  // a soft pool of light on the paint
  const pool = g.createRadialGradient(RIM.x, 12, 0, RIM.x, 12, 30);
  pool.addColorStop(0, 'rgba(255,248,230,.20)'); pool.addColorStop(0.6, 'rgba(255,248,230,.05)'); pool.addColorStop(1, 'rgba(255,248,230,0)');
  g.fillStyle = pool; g.fillRect(RIM.x - 30, -18, 60, 60);
  return (FLOOR = cv);
}
/* Build the floor (and the wood under it) before the first Run It, when the
   page is idle, so the tap never waits on it. */
export function warm() {
  if (typeof document === 'undefined' || FLOOR) return;
  const go = () => { try { floorTex(); } catch (e) { /* built on the first draw instead */ } };
  if (typeof requestIdleCallback === 'function') requestIdleCallback(go, { timeout: 1500 }); else setTimeout(go, 300);
}
/* The lines, both halves, as one path in feet. */
let LINES = null;
function lines() {
  if (LINES) return LINES;
  const p = new Path2D();
  for (const mirror of [false, true]) for (const L of courtLines()) L.forEach((q, i) => { const y = mirror ? COURT.H * 2 - q.y : q.y; if (i) p.lineTo(q.x, y); else p.moveTo(q.x, y); });
  return (LINES = p);
}
let VIG = null;
function vignette(W, H) {
  if (VIG && VIG.width === W && VIG.height === H) return VIG;
  const cv = mk(W, H), g = cv.getContext('2d');
  const v = g.createRadialGradient(W / 2, H * 0.45, Math.min(W, H) * 0.35, W / 2, H * 0.45, Math.max(W, H) * 0.75);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.42)');
  g.fillStyle = v; g.fillRect(0, 0, W, H);
  return (VIG = cv);
}

/* ---------- sprites ---------- */
const MIPS = [32, 64, 128];
const mip = px => MIPS.find(m => m >= px) || MIPS[MIPS.length - 1];
let SPR = new Map();
/* A player disc, upright (the number stays readable whichever way he faces). */
function disc(team, label, px) {
  const n = mip(px), key = team + label + n;
  let cv = SPR.get(key);
  if (cv) return cv;
  const T = team === 'home' ? HOME : AWAY, g = (cv = mk(n, n)).getContext('2d'), c = n / 2, r = n / 2 - 1;
  const gr = g.createLinearGradient(c - r, c - r, c + r, c + r);
  gr.addColorStop(0, T.lit); gr.addColorStop(1, T.c1);
  g.fillStyle = gr; g.beginPath(); g.arc(c, c, r - n * 0.05, 0, TAU); g.fill();
  g.strokeStyle = T.c2; g.lineWidth = n * 0.075; g.stroke();
  if (label) {
    g.fillStyle = T.c2; g.font = '800 ' + Math.round(n * 0.56) + 'px ' + FONT;
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(label, c, c + n * 0.03);
  }
  SPR.set(key, cv);
  return cv;
}
/* A soft round shadow. */
function blob() {
  let cv = SPR.get('blob');
  if (cv) return cv;
  const g = (cv = mk(64, 64)).getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(10,6,2,.42)'); gr.addColorStop(0.55, 'rgba(10,6,2,.18)'); gr.addColorStop(1, 'rgba(10,6,2,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  SPR.set('blob', cv);
  return cv;
}
function ballSprite(px) {
  const n = mip(px), key = 'ball' + n;
  let cv = SPR.get(key);
  if (cv) return cv;
  const g = (cv = mk(n, n)).getContext('2d'), c = n / 2, r = n / 2 - 1;
  const gr = g.createRadialGradient(c - r * 0.35, c - r * 0.4, r * 0.1, c, c, r);
  gr.addColorStop(0, '#ffb066'); gr.addColorStop(0.6, '#f07a22'); gr.addColorStop(1, '#b4480c');
  g.fillStyle = gr; g.beginPath(); g.arc(c, c, r, 0, TAU); g.fill();
  SPR.set(key, cv);
  return cv;
}
/* A chip: bold capitals on a rounded slab, made once per text and size. */
function chipSprite(text, bg, fg, px, dpr) {
  const key = 'chip' + text + bg + fg + px + dpr;
  let cv = SPR.get(key);
  if (cv) return cv;
  const f = '800 ' + px * dpr + 'px ' + FONT, pad = 6 * dpr;
  const m = mk(1, 1).getContext('2d'); m.font = f;
  const w = Math.ceil(m.measureText(text).width + px * 1.3 * dpr), h = Math.ceil(px * 1.9 * dpr);
  const g = (cv = mk(w + pad * 2, h + pad * 2)).getContext('2d');
  g.shadowColor = 'rgba(0,0,0,.35)'; g.shadowBlur = 5 * dpr; g.shadowOffsetY = 1.5 * dpr;
  g.fillStyle = bg; g.beginPath(); g.roundRect(pad, pad, w, h, h * 0.28); g.fill();
  g.shadowColor = 'transparent'; g.fillStyle = fg; g.font = f; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, pad + w / 2, pad + h / 2 + dpr);
  cv.cw = w / dpr; cv.ch = h / dpr; cv.pad = pad / dpr;
  SPR.set(key, cv);
  return cv;
}
/* Discs and chips carry text: draw them again once the page's font is in. */
if (typeof document !== 'undefined' && document.fonts && document.fonts.addEventListener) {
  document.fonts.addEventListener('loadingdone', () => { SPR = new Map(); });
}

/* ---------- the run, worked out once ---------- */
/* The coach's routes (a smooth curve through his points, sampled every half
   foot), the passes as the sim threw them, the screens as the sim used them,
   and how far along its route each runner is at every frame. */
function smooth(pts) {
  // the same curve the board draws: through the midpoints, quadratic at each corner
  const out = [pts[0]];
  const quad = (a, c, b) => { for (let i = 1; i <= 8; i++) { const t = i / 8, u = 1 - t; out.push({ x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y }); } };
  let from = pts[0];
  for (let i = 1; i < pts.length - 1; i++) { const mid = { x: (pts[i].x + pts[i + 1].x) / 2, y: (pts[i].y + pts[i + 1].y) / 2 }; quad(from, pts[i], mid); from = mid; }
  if (pts.length > 1) out.push(pts[pts.length - 1]);
  // resample every half foot
  const S = [out[0]], len = [0];
  let L = 0;
  for (let i = 1; i < out.length; i++) {
    const a = out[i - 1], b = out[i], d = Math.hypot(b.x - a.x, b.y - a.y);
    if (d < 1e-6) continue;
    const n = Math.max(1, Math.ceil(d / 0.5));
    for (let k = 1; k <= n; k++) { S.push({ x: lerp(a.x, b.x, k / n), y: lerp(a.y, b.y, k / n) }); len.push(L + d * k / n); }
    L += d;
  }
  return { pts: S, len, L: Math.max(L, 1e-3) };
}
function project(r, x, y) {
  let bd = 1e9, bs = 0;
  for (let i = 1; i < r.pts.length; i++) {
    const a = r.pts[i - 1], b = r.pts[i], dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy;
    const t = L2 ? clamp(((x - a.x) * dx + (y - a.y) * dy) / L2, 0, 1) : 0;
    const d = Math.hypot(x - (a.x + t * dx), y - (a.y + t * dy));
    if (d < bd) { bd = d; bs = r.len[i - 1] + t * (r.len[i] - r.len[i - 1]); }
  }
  return { d: bd, s: bs };
}
/* The frame at or just before game time T (frames run from the most time
   left to the least). */
export function frameAt(F, T) {
  let lo = 0, hi = F.length - 1;
  if (T >= F[0].t) return 0;
  if (T <= F[hi].t) return hi;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (F[m].t >= T) lo = m; else hi = m; }
  return lo;
}
export function planRun(run) {
  if (!run || !run.res || !run.play) return null;
  const res = run.res, play = run.play, F = res.frames, steps = play.steps || [];
  const routes = [], passes = [];
  steps.forEach((s, j) => {
    if ((s.kind === 'move' || s.kind === 'screen') && s.pts && s.pts.length) {
      const from = spotsAfter(play, steps.slice(0, j))[s.who];
      if (!from) return;
      const sm = smooth([from, ...s.pts]), end = s.pts[s.pts.length - 1], prev = s.pts.length > 1 ? s.pts[s.pts.length - 2] : from;
      const path = new Path2D(); sm.pts.forEach((p, i) => i ? path.lineTo(p.x, p.y) : path.moveTo(p.x, p.y));
      routes.push(Object.assign(sm, { kind: s.kind, who: s.who, i: IDS.indexOf(s.who), path, end, ang: Math.atan2(end.y - prev.y, end.x - prev.x), k: new Float32Array(F.length) }));
    }
  });
  // how far each runner has covered his routes, one route at a time, in order
  for (let w = 0; w < 5; w++) {
    const mine = routes.filter(r => r.i === w);
    let ptr = 0, best = 0;
    for (let f = 0; f < F.length; f++) {
      const fr = F[f];
      while (ptr < mine.length) {
        const r = mine[ptr], q = project(r, fr.o[2 * w], fr.o[2 * w + 1]);
        if (q.d < 3.5) best = Math.max(best, q.s / r.L);
        const set = r.kind === 'screen' && fr.s.some(s => s[0] === IDS[w]);
        if (best > 0.97 || set) { r.k.fill(1, f); ptr++; best = 0; continue; }
        r.k[f] = best;
        break;
      }
    }
  }
  // the passes as thrown: from where the ball left to where it was caught
  let n = 0;
  for (const s of steps) {
    if (s.kind !== 'pass') continue;
    const p = (res.passes || []).filter(q => q.from === s.from && q.to === s.to)[passes.filter(q => q.from === s.from && q.to === s.to).length];
    const order = n++;
    if (!p) { passes.push({ from: s.from, to: s.to, order, at: null }); continue; }
    const a = frameAt(F, p.at), fa = F[a];
    let b = a;
    while (b < F.length - 1 && F[b].h !== s.to && F[b].h == null) b++;
    passes.push({ from: s.from, to: s.to, order, at: p.at, ia: a, ib: b, a: { x: fa.b[0], y: fa.b[1] }, b: { x: F[b].b[0], y: F[b].b[1] }, lost: !!p.lost });
  }
  // the screens as used: the cutter's own man just before, and his path round it
  const uses = [];
  for (const u of res.screens || []) {
    const i0 = Math.max(0, frameAt(F, u.t + 0.05) - 1), j = F[i0].m.indexOf(u.cutter);
    if (j < 0) continue;
    const a = frameAt(F, u.t + 0.4), b = frameAt(F, u.t - 1.1);
    const path = [];
    for (let f = a; f <= b; f++) path.push({ x: F[f].x[2 * j], y: F[f].x[2 * j + 1], f });
    uses.push({ t: u.t, j, path, word: SCHEME_CHIP[res.scheme] || String(res.schemeName || '').toUpperCase() });
  }
  // the shot: who, from where, the read
  const ev = (res.events || []).find(e => e.shot);
  const shot = res.shot && res.shooter ? {
    who: res.shooter, i: IDS.indexOf(res.shooter), at: res.shotAt, open: ev ? ev.open : res.shot.open,
    read: ev ? (READ_CHIP[ev.text] || String(ev.text).toUpperCase()) + (ev.p != null ? ' · ' + Math.round(ev.p * 100) + '%' : '') : null,
    from: (() => { const f = F.find(q => q.sk != null); return f ? { x: f.b[0], y: f.b[1] } : null; })(),
    since: (() => { const p = (res.passes || []).filter(q => q.to === res.shooter && !q.lost).pop(); return p ? p.at : res.shotAt + 1.5; })()
  } : null;
  return { res, F, routes, passes, uses, shot, winner: res.how === 'make' && res.outcome === 'win' };
}

/* After the last frame the ball plays out from the rim: a make drops
   through and bounces under the basket, a miss kicks off the rim one way
   or the other (the seed picks which, so a replay looks the same). Shared
   with the 3D shot cam (shotcam3d.js), so both views send it the same way.
   out: { x, y, z } in feet, z the board's height (it starts at the floor). */
export function ballAfter(fr, after, out) {
  out.x = fr.b[0]; out.y = fr.b[1]; out.z = fr.b[2] || 0;
  if (!after) return out;
  const t = after.t;
  if (after.made) {
    if (t < 0.22) { out.x = RIM.x; out.y = RIM.y; out.z = 3 * (1 - t / 0.22); return out; }
    const u = t - 0.22;
    out.x = RIM.x; out.y = RIM.y + Math.min(1.6, u * 3.2); out.z = bounce(u, 3.2); return out;
  }
  const side = (after.seed % 3) - 1, ang = Math.PI / 2 + side * 0.75 + ((after.seed >> 3) % 7 - 3) * 0.08;
  const reach = Math.min(1, t / 1.1) * 8;
  out.x = RIM.x + Math.cos(ang) * reach; out.y = RIM.y + Math.sin(ang) * reach; out.z = bounce(t, 4.5);
  return out;
}
export function bounce(t, h0) {
  let h = h0, start = 0, dur = Math.sqrt(2 * h / 32) * 2;
  for (let n = 0; n < 5; n++) {
    if (t < start + dur) { const u = (t - start) / dur; return 4 * h * u * (1 - u); }
    start += dur; h *= 0.45; dur = Math.sqrt(2 * h / 32) * 2;
  }
  return 0;
}

/* ---------- the court ---------- */
export function createCourt2d(cv) {
  let V = null, last = null, D = null;
  const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const confetti = (() => { const r = rnd(9), out = []; for (let i = 0; i < 120; i++) out.push({ x: r(), sp: 60 + r() * 120, ph: r() * 6, y: r(), c: ['#ffd23f', '#2f6aa0', '#ffffff', '#ffd23f'][i % 4] }); return out; })();
  const spray = (() => { const r = rnd(3), out = []; for (let i = 0; i < 18; i++) out.push({ a: r() * TAU, v: 2 + r() * 5, g: 200 + r() * 55 | 0 }); return out; })();
  const chips = [];   // this frame's chips, placed so none sits on another

  /* THE CAMERA (2026-11-17, kept as the pixel court had it). While a play
     runs (opts.cam) the view frames every body, the ball and the rim, padded,
     as big as the stage allows, never smaller than the whole court fit and
     never more than ZOOM times it, easing after the action. With reduced
     motion it holds one frame for the whole run (the box of every frame). Past
     half court the floor goes on, mirrored. The clipboard never uses it: a
     play drawn there lands on the court at the same feet (view.js). */
  const ZOOM = 2.2, EASE = 3.2;
  let cam = null;
  function boxOf(list) {
    let x0 = RIM.x - 3, x1 = RIM.x + 3, y0 = RIM.y - 1, y1 = RIM.y + 2;
    const at = (x, y) => { if (!Number.isFinite(x) || !Number.isFinite(y)) return; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; };
    for (const fr of list) {
      for (let i = 0; i < 10; i += 2) { at(fr.o[i], fr.o[i + 1]); at(fr.x[i], fr.x[i + 1]); }
      if (fr.b) at(fr.b[0], fr.b[1]);
    }
    // the discs lie flat, so the pad is the same all round (a little more for a chip above)
    return { x0: x0 - 3, x1: x1 + 3, y0: y0 - 4, y1: y1 + 3 };
  }
  function aim(b, w, h) {
    const full = Math.min((w - 24) / COURT.W, (h - 24) / COURT.H);
    const s = Math.max(full, Math.min(full * (b.shot ? SHOT_ZOOM : ZOOM), w / (b.x1 - b.x0), h / (b.y1 - b.y0)));
    const hw = w / (2 * s), hh = h / (2 * s);
    let cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
    /* room to spare up and down goes below the action (toward half court,
       where the card docks), never above the baseline */
    if (2 * hh > b.y1 - b.y0) cy = b.shot ? cy + hh * 0.18 : b.y0 + hh;
    const lo = hw - 1, hi = COURT.W + 1 - hw;
    cx = lo <= hi ? Math.max(lo, Math.min(hi, cx)) : COURT.W / 2;
    cy = Math.max(hh - (b.shot ? 2 : 8), Math.min(COURT.H * 2 - hh, cy));
    return { cx, cy, s };
  }
  /* THE SHOT CAM (2026-11-19). Once the ball is up, the frame is the shooter,
     the ball and the rim only, up to SHOT_ZOOM times the whole court fit, and
     the camera eases in on it. Reduced motion keeps its one box. */
  const SHOT_ZOOM = 3.4;
  function shotBox(fr, f) {
    let x0 = Math.min(RIM.x - 2, f.x), x1 = Math.max(RIM.x + 2, f.x), y0 = Math.min(RIM.y - 1, f.y), y1 = Math.max(RIM.y + 2, f.y);
    if (fr.b && Number.isFinite(fr.b[0]) && Number.isFinite(fr.b[1])) { x0 = Math.min(x0, fr.b[0]); x1 = Math.max(x1, fr.b[0]); y0 = Math.min(y0, fr.b[1]); y1 = Math.max(y1, fr.b[1]); }
    return { x0: x0 - 3.5, x1: x1 + 3.5, y0: y0 - 4.5, y1: y1 + 4, shot: true };
  }
  const VV = { s: 1, ox: 0, oy: 0, w: 1, h: 1, px(p) { return { x: this.ox + p.x * this.s, y: this.oy + p.y * this.s }; }, ft(q) { return { x: (q.x - this.ox) / this.s, y: (q.y - this.oy) / this.s }; } };
  function camView(w, h, fr, focus) {
    const box = cam.fixed || (focus ? shotBox(fr, focus) : boxOf([fr]));
    const want = aim(box, w, h), now = performance.now();
    if (!cam.at || cam.w !== w || cam.h !== h) cam.at = want;
    else {
      const k = 1 - Math.exp(-Math.min(0.1, (now - cam.t) / 1000) * EASE), a = cam.at;
      a.cx += (want.cx - a.cx) * k; a.cy += (want.cy - a.cy) * k; a.s = Math.exp(Math.log(a.s) + (Math.log(want.s) - Math.log(a.s)) * k);
    }
    cam.t = now; cam.w = w; cam.h = h;
    const { cx, cy, s } = cam.at;
    VV.s = s; VV.ox = w / 2 - cx * s; VV.oy = h / 2 - cy * s; VV.w = w; VV.h = h;
    return VV;
  }
  /* A new run. frames: every frame it will show (for the reduced motion box).
     run: { res, play }, for the coaching layer (no run, no layer). */
  function camStart(frames, run) {
    cam = { at: null, t: 0, fixed: reduce && frames && frames.length ? boxOf(frames) : null };
    D = planRun(run);
  }

  /* ---------- drawing helpers, in feet unless they say so ---------- */
  let ctx = null, K = 1, DPR = 1;
  const feet = () => ctx.setTransform(K, 0, 0, K, DPR * V.ox, DPR * V.oy);
  const screen = () => ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  const sx = x => V.ox + x * V.s, sy = y => V.oy + y * V.s;   // feet to CSS px
  const px1 = n => n / V.s;                                    // CSS px to feet

  function floor(w, h) {
    ctx.fillStyle = SURROUND; ctx.fillRect(0, 0, w, h);
    feet();
    ctx.drawImage(floorTex(), FX0, FY0, FW, FH);
    ctx.strokeStyle = 'rgba(255,255,255,.94)'; ctx.lineWidth = Math.max(2 / 12, px1(1.1)); ctx.lineJoin = 'round';
    ctx.stroke(lines());
  }

  function hoop(after) {
    const made = after && after.made, t = after ? after.t : 0, s1 = px1(1);
    const shake = after && !made && t < 0.3 && !reduce ? Math.sin(t * 60) * 0.12 : 0;
    // the board and its post
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(22.2, 4.15, 6, 0.5);
    ctx.fillStyle = '#f7f7f4'; ctx.strokeStyle = '#1b1d22'; ctx.lineWidth = Math.max(0.06, s1);
    ctx.beginPath(); ctx.roundRect(22, 3.7, 6, 0.35, 0.1); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#c9cbd0'; ctx.fillRect(24.85, 4.05, 0.3, 0.5);
    const cx = RIM.x + shake, cy = RIM.y, hot = made && t < 0.9;
    // the net, gold for a beat on a make
    ctx.strokeStyle = hot ? 'rgba(255,214,90,.95)' : 'rgba(255,255,255,.75)'; ctx.lineWidth = Math.max(0.04, s1 * 0.8);
    ctx.beginPath();
    for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; ctx.moveTo(cx + Math.cos(a) * 0.72, cy + Math.sin(a) * 0.72); ctx.lineTo(cx + Math.cos(a + 0.4) * 0.4, cy + Math.sin(a + 0.4) * 0.4); }
    ctx.moveTo(cx + 0.42, cy); ctx.arc(cx, cy, 0.42, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = '#ff6a1f'; ctx.lineWidth = Math.max(0.16, s1 * 1.4);
    ctx.beginPath(); ctx.arc(cx, cy, 0.75, 0, TAU); ctx.stroke();
    if (made && t < 1.2) {
      // the swish: two rings out from the rim and a spray of light
      for (const d of [0, 0.18]) {
        const u = reduce ? 0.35 : clamp((t - d) / 0.9, 0, 1);
        if (u <= 0 || u >= 1) continue;
        ctx.strokeStyle = 'rgba(255,214,90,' + ((1 - u) * 0.9).toFixed(3) + ')'; ctx.lineWidth = (1 - u) * 0.5 + s1;
        ctx.beginPath(); ctx.arc(cx, cy, 0.9 + u * 7, 0, TAU); ctx.stroke();
      }
      if (!reduce) {
        const u = clamp(t / 0.8, 0, 1);
        if (u < 1) for (const p of spray) {
          ctx.fillStyle = 'rgba(255,' + p.g + ',120,' + (1 - u).toFixed(3) + ')';
          ctx.beginPath(); ctx.arc(cx + Math.cos(p.a) * p.v * u, cy + Math.sin(p.a) * p.v * u, Math.max(px1(1), 0.12 * (1 - u)), 0, TAU); ctx.fill();
        }
      }
    }
  }

  /* Trails: the last 0.9 s of every body, fading, three strokes a team. */
  function trails(fi) {
    const F = D.F, span = 0.9, T = F[fi].t;
    let j0 = fi;
    while (j0 > 0 && F[j0 - 1].t <= T + span) j0--;
    if (fi - j0 < 2) return;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (let team = 0; team < 2; team++) {
      for (let band = 0; band < 3; band++) {
        const a = j0 + Math.floor((fi - j0) * band / 3), b = j0 + Math.floor((fi - j0) * (band + 1) / 3);
        if (b <= a) continue;
        const u = (band + 1) / 3;
        ctx.strokeStyle = team ? 'rgba(217,71,58,' + (u * u * 0.5).toFixed(3) + ')' : 'rgba(40,110,180,' + (u * u * 0.55).toFixed(3) + ')';
        ctx.lineWidth = 0.25 + 1.0 * u;
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
          const arr = team ? 'x' : 'o';
          for (let f = a; f <= b; f++) { const P = F[f][arr]; if (f === a) ctx.moveTo(P[2 * i], P[2 * i + 1]); else ctx.lineTo(P[2 * i], P[2 * i + 1]); }
        }
        ctx.stroke();
      }
    }
  }

  /* The coach's routes: faint and dashed as drawn, lit up as they are run. */
  /* a glow: a wide faint stroke under a thin bright one (path null: the current path) */
  function glowStroke(path, core, glow, w) {
    ctx.strokeStyle = glow; ctx.lineWidth = w * 2.6; if (path) ctx.stroke(path); else ctx.stroke();
    ctx.strokeStyle = core; ctx.lineWidth = w; if (path) ctx.stroke(path); else ctx.stroke();
  }
  /* the first k of a route, as the current path */
  function tracePart(r, k) {
    const L = k * r.L;
    ctx.beginPath(); ctx.moveTo(r.pts[0].x, r.pts[0].y);
    for (let i = 1; i < r.pts.length; i++) {
      if (r.len[i] <= L) { ctx.lineTo(r.pts[i].x, r.pts[i].y); continue; }
      const q = (L - r.len[i - 1]) / Math.max(1e-6, r.len[i] - r.len[i - 1]);
      ctx.lineTo(lerp(r.pts[i - 1].x, r.pts[i].x, q), lerp(r.pts[i - 1].y, r.pts[i].y, q));
      break;
    }
  }
  function cap(r, style, w) {
    const { x, y } = r.end, c = Math.cos(r.ang), s = Math.sin(r.ang);
    ctx.strokeStyle = style; ctx.fillStyle = style; ctx.lineWidth = w;
    ctx.beginPath();
    if (r.kind === 'screen') { ctx.moveTo(x + s * 1.1, y - c * 1.1); ctx.lineTo(x - s * 1.1, y + c * 1.1); ctx.stroke(); }
    else { ctx.moveTo(x + c * 0.25, y + s * 0.25); ctx.lineTo(x - c * 0.9 + s * 0.6, y - s * 0.9 - c * 0.6); ctx.lineTo(x - c * 0.9 - s * 0.6, y - s * 0.9 + c * 0.6); ctx.closePath(); ctx.fill(); }
  }
  function routes(fi, u, fr, shotUp) {
    const lw = Math.max(0.22, px1(2.2));
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const r of D.routes) {
      const k = lerp(r.k[fi], r.k[Math.min(r.k.length - 1, fi + 1)], u);
      ctx.setLineDash([0.6, 0.5]); ctx.strokeStyle = 'rgba(255,255,255,.30)'; ctx.lineWidth = lw * 0.8; ctx.stroke(r.path); ctx.setLineDash([]);
      if (k < 1) cap(r, 'rgba(255,255,255,.38)', lw);
      if (k <= 0) continue;
      const on = k < 1, set = r.kind === 'screen' && fr.s && fr.s.some(s => s[0] === r.who);
      if (k < 1) tracePart(r, k);
      glowStroke(k < 1 ? null : r.path, on ? 'rgba(130,232,255,.98)' : 'rgba(150,225,255,.62)', on ? 'rgba(80,210,255,.22)' : 'rgba(80,210,255,.10)', lw);
      if (k >= 1) {
        if (set && !shotUp) { cap(r, 'rgba(255,214,90,.35)', lw * 3); cap(r, '#ffe27a', lw * 1.3); }
        else cap(r, 'rgba(150,225,255,.62)', lw);
      }
    }
    // the passes: the next one faint between the two, a thrown one where the ball went
    const T = fr.t;
    let pending = true;
    for (const p of D.passes) {
      if (p.at == null || T > p.at) {
        if (!pending) continue;
        pending = false;
        const a = IDS.indexOf(p.from), b = IDS.indexOf(p.to);
        if (fr.h !== p.from) continue;
        ctx.setLineDash([0.9, 0.6]); ctx.strokeStyle = 'rgba(255,214,90,.40)'; ctx.lineWidth = lw * 0.8;
        ctx.beginPath(); ctx.moveTo(fr.o[2 * a], fr.o[2 * a + 1]); ctx.lineTo(fr.o[2 * b], fr.o[2 * b + 1]); ctx.stroke(); ctx.setLineDash([]);
        continue;
      }
      const inAir = fi < p.ib, ex = inAir ? fr.b[0] : p.b.x, ey = inAir ? fr.b[1] : p.b.y;
      ctx.setLineDash([0.9, 0.6]);
      ctx.strokeStyle = p.lost ? 'rgba(255,84,72,.25)' : 'rgba(255,190,40,.22)'; ctx.lineWidth = lw * 2.2;
      ctx.beginPath(); ctx.moveTo(p.a.x, p.a.y); ctx.lineTo(ex, ey); ctx.stroke();
      ctx.strokeStyle = p.lost ? 'rgba(255,84,72,.95)' : 'rgba(255,214,90,.95)'; ctx.lineWidth = lw * 0.85; ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  /* The defense at the screen: the cutter's man's path round it, in red. */
  function schemes(fi, fr, shotUp) {
    if (shotUp) return;
    const T = fr.t;
    for (const u of D.uses) {
      if (T > u.t + 0.4 || !u.path.length) continue;
      const fade = clamp((T - (u.t - 2.8)) / 0.6, 0, 1);
      if (fade <= 0) continue;
      let n = 0;
      while (n < u.path.length && u.path[n].f <= fi) n++;
      if (n < 2) continue;
      ctx.globalAlpha = fade;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); for (let i = 0; i < n; i++) { const p = u.path[i]; if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); }
      const lw = Math.max(0.24, px1(2.4));
      ctx.strokeStyle = 'rgba(255,60,60,.22)'; ctx.lineWidth = lw * 2.8; ctx.stroke();
      ctx.strokeStyle = 'rgba(255,82,82,.95)'; ctx.lineWidth = lw; ctx.stroke();
      // the head, pointing the way he went
      let k = Math.max(0, n - 5); const b = u.path[n - 1];
      while (k < n - 1 && Math.hypot(b.x - u.path[k].x, b.y - u.path[k].y) > 2.5) k++;
      const a = u.path[Math.max(0, Math.min(k, n - 2))];
      if (Math.hypot(b.x - a.x, b.y - a.y) > 0.3) {
        const ang = Math.atan2(b.y - a.y, b.x - a.x), c = Math.cos(ang), s = Math.sin(ang), hx = b.x + c * 1.4, hy = b.y + s * 1.4;
        ctx.fillStyle = 'rgba(255,82,82,.95)'; ctx.beginPath();
        ctx.moveTo(hx + c * 0.6, hy + s * 0.6); ctx.lineTo(hx - c * 0.6 + s * 0.6, hy - s * 0.6 - c * 0.6); ctx.lineTo(hx - c * 0.6 - s * 0.6, hy - s * 0.6 + c * 0.6); ctx.closePath(); ctx.fill();
      }
      ctx.globalAlpha = 1;
      chips.push({ x: b.x, y: b.y - 2.6, text: u.word, bg: '#e5403a', fg: '#fff', a: fade, side: -1 });
    }
  }

  /* Open space: a ring on the shooter out to the closest defender. */
  function openRing(fr, after) {
    const S = D.shot;
    if (!S || S.i < 0 || fr.t > S.since + 0.05) return;
    const x = fr.o[2 * S.i], y = fr.o[2 * S.i + 1];
    let bd = 1e9, bx = 0, by = 0;
    for (let j = 0; j < 5; j++) { const d = Math.hypot(fr.x[2 * j] - x, fr.x[2 * j + 1] - y); if (d < bd) { bd = d; bx = fr.x[2 * j]; by = fr.x[2 * j + 1]; } }
    const up = fr.sk != null || !!after, k = up ? (after ? 1 : clamp(fr.sk / 0.15, 0, 1)) : 0;
    const d = clamp(lerp(bd, S.open, k), 1.6, 12), c = openCol(d);
    ctx.fillStyle = 'rgba(' + c + ',.14)'; ctx.beginPath(); ctx.arc(x, y, d, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(' + c + ',.95)'; ctx.lineWidth = Math.max(0.15, px1(1.6));
    ctx.setLineDash([0.5, 0.35]); ctx.stroke(); ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(bx, by); ctx.stroke();
    if (up && S.read) {
      const t = after ? after.t : 0, a = t < 0.9 ? 1 : clamp(1 - (t - 0.9) / 0.25, 0, 1);
      if (a > 0) chips.push({ x, y: y + d + 1.2, text: S.read, bg: 'rgb(' + c + ')', fg: '#111', a, side: 1 });
    }
  }

  /* A player: shadow, shoulders and hands turned to his facing, the facing
     pointer, then the disc upright with his number. */
  function body(x, y, face, team, label, pose, bob, hot) {
    const T = team === 'home' ? HOME : AWAY, r = (team === 'home' ? 1.2 : 1.12) * (1 + bob);
    feet();
    ctx.drawImage(blob(), x + 0.35 - r * 1.9, y + 0.55 - r * 1.9, r * 3.8, r * 3.8);
    if (hot) {
      ctx.strokeStyle = 'rgba(255,200,40,.28)'; ctx.lineWidth = Math.max(0.5, px1(5)); ctx.beginPath(); ctx.arc(x, y, r * 1.38, 0, TAU); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,210,63,.98)'; ctx.lineWidth = Math.max(0.16, px1(1.6)); ctx.stroke();
    }
    const a = face * Math.PI / 180, c = Math.cos(a) * K, s = Math.sin(a) * K;
    ctx.setTransform(c, s, -s, c, DPR * V.ox + K * x, DPR * V.oy + K * y);
    ctx.fillStyle = T.c3; ctx.beginPath(); ctx.roundRect(-0.48 * r, -1.28 * r, 0.96 * r, 2.56 * r, 0.48 * r); ctx.fill();
    ctx.fillStyle = '#6b4a35';
    const H = HANDS[pose];
    if (H) {
      ctx.beginPath();
      for (let n = 0; n < H.length; n += 2) { ctx.moveTo((H[n] + 0.26) * r, H[n + 1] * r); ctx.arc(H[n] * r, H[n + 1] * r, 0.26 * r, 0, TAU); }
      ctx.fill();
    }
    ctx.fillStyle = T.c2; ctx.beginPath(); ctx.moveTo(1.42 * r, 0); ctx.lineTo(1.08 * r, -0.32 * r); ctx.lineTo(1.08 * r, 0.32 * r); ctx.closePath(); ctx.fill();
    feet();
    ctx.drawImage(disc(team, label, 2 * r * K), x - r, y - r, 2 * r, 2 * r);
  }

  function ball(b, spin) {
    const z = Math.max(0, b.z || 0), x = b.x, y = b.y;
    feet();
    const sr = (0.45 + z * 0.03) * 1.6, al = 1 / (1 + z * 0.12);
    ctx.globalAlpha = al; ctx.drawImage(blob(), x + z * 0.22 - sr, y + z * 0.32 - sr, sr * 2, sr * 2); ctx.globalAlpha = 1;
    const r = 0.48 + z * 0.045;
    ctx.drawImage(ballSprite(2 * r * K), x - r, y - r, 2 * r, 2 * r);
    const a = spin || 0, c = Math.cos(a) * K, s = Math.sin(a) * K;
    ctx.setTransform(c, s, -s, c, DPR * V.ox + K * x, DPR * V.oy + K * y);
    ctx.strokeStyle = 'rgba(40,16,4,.7)'; ctx.lineWidth = Math.max(r * 0.1, px1(0.7));
    ctx.beginPath(); ctx.moveTo(-r, 0); ctx.lineTo(r, 0); ctx.moveTo(0, -r); ctx.lineTo(0, r); ctx.stroke();
    ctx.beginPath(); ctx.arc(-r * 1.35, 0, r, -0.75, 0.75); ctx.stroke(); ctx.beginPath(); ctx.arc(r * 1.35, 0, r, Math.PI - 0.75, Math.PI + 0.75); ctx.stroke();
    feet();
  }

  const ballAt = (fr, after, out) => ballAfter(fr, after, out);

  /* Chips last, in CSS pixels, kept on the stage, clear of the caption at
     the foot and the readout at the top, and clear of each other. */
  function drawChips(w, h) {
    screen();
    const px = w >= 700 ? 14 : 12, top = h * 0.15, bot = h * 0.76, placed = [];
    for (const c of chips) {
      const sp = chipSprite(c.text, c.bg, c.fg, px, DPR), cw = sp.cw, ch = sp.ch;
      let X = clamp(sx(c.x), 8 + cw / 2, w - 8 - cw / 2), Y = clamp(sy(c.y), top + ch / 2, bot - ch / 2);
      for (let tries = 0; tries < 6; tries++) {
        const hit = placed.find(p => Math.abs(p.x - X) < (p.w + cw) / 2 + 4 && Math.abs(p.y - Y) < (p.h + ch) / 2 + 3);
        if (!hit) break;
        Y = hit.y + c.side * ((hit.h + ch) / 2 + 4);
        if (Y < top + ch / 2 || Y > bot - ch / 2) { Y = clamp(Y, top + ch / 2, bot - ch / 2); X = clamp(hit.x + (X < w / 2 ? 1 : -1) * ((hit.w + cw) / 2 + 6), 8 + cw / 2, w - 8 - cw / 2); }
      }
      placed.push({ x: X, y: Y, w: cw, h: ch });
      ctx.globalAlpha = c.a;
      ctx.drawImage(sp, X - cw / 2 - sp.pad, Y - ch / 2 - sp.pad, sp.width / DPR, sp.height / DPR);
      ctx.globalAlpha = 1;
    }
    chips.length = 0;
  }

  function drawConfetti(t, w, h) {
    screen();
    if (reduce) t = 1.2;   // reduced motion: a still scatter, nothing falls
    for (const p of confetti) {
      const y = -20 - p.y * h * 0.6 + t * p.sp * 1.6;
      if (y > h + 20) continue;
      const x = p.x * w + Math.sin(t * 2 + p.ph) * 18, a = t * 4 + p.ph, sc = Math.cos(t * 6 + p.ph);
      const c = Math.cos(a) * DPR, s = Math.sin(a) * DPR;
      ctx.setTransform(c, s, -s * sc, c * sc, DPR * x, DPR * y);
      ctx.fillStyle = p.c; ctx.fillRect(-4, -2.5, 8, 5);
    }
    screen();
  }

  const B = { x: 0, y: 0, z: 0 };
  /* where the hands are, by pose, in disc radii (x toward his facing) */
  const HANDS = { shoot: [0.9, -0.3, 0.95, 0.25], arms: [0.75, -1.2, 0.75, 1.2], contest: [1.15, -0.35], catch: [1.05, -0.45, 1.05, 0.45] };
  const POSE_O = { 4: 'shoot', 5: 'arms', 6: 'catch', 8: 'catch' };
  /* opts: cam (the run's camera), focus (where the shot went up: the shot
     cam), after ({ t, made, seed }: the ball playing out), spin (ball turns),
     hold (the Go at hold: the clock is not game time yet), debug. */
  function draw(fr, opts = {}) {
    last = () => draw(fr, opts);
    const sz = sizeCanvas(cv), w = sz.w, h = sz.h;
    ctx = sz.ctx; DPR = sz.dpr;
    const focus = opts.focus && fr && (fr.sk != null || opts.after) ? opts.focus : null;
    V = opts.cam && cam && fr ? camView(w, h, fr, focus) : fitView(w, h, 12);
    K = DPR * V.s;
    ctx.imageSmoothingEnabled = true;
    floor(w, h);
    if (!fr) { hoop(null); screen(); ctx.drawImage(vignette(cv.width, cv.height), 0, 0, w, h); return; }
    const after = opts.after || null, shotUp = fr.sk != null || !!after;
    const run = D && D.F && D.F.length ? D : null;
    let fi = 0, u = 0;
    if (run && !opts.hold) {
      fi = frameAt(run.F, fr.t);
      const a = run.F[fi], b = run.F[fi + 1];
      u = b && a.t > b.t ? clamp((a.t - fr.t) / (a.t - b.t), 0, 1) : 0;
    }
    if (run && !reduce && !opts.hold) trails(fi);
    if (run) {
      // in the hold the frame's clock is the hold's, not the game's: read the first frame
      const at = opts.hold ? run.F[0] : fr;
      routes(fi, u, at, shotUp); openRing(at, after);
    }
    hoop(after);
    for (let j = 0; j < 5; j++) {
      const code = fr.k ? fr.k[5 + j] : 0, g = fr.g ? fr.g[5 + j] / 100 : 0;
      const bob = !reduce && (code === 1 || code === 2) ? Math.sin(g * Math.PI * 4) * 0.05 : 0;
      body(fr.x[2 * j], fr.x[2 * j + 1], fr.f ? fr.f[5 + j] : 90, 'away', '', code === 4 ? 'contest' : code === 0 || code === 3 ? 'arms' : '', bob, false);
    }
    for (let i = 0; i < 5; i++) {
      const code = fr.k ? fr.k[i] : 0, g = fr.g ? fr.g[i] / 100 : 0;
      let bob = 0;
      if (!reduce) bob = code === 1 || code === 2 ? Math.sin(g * Math.PI * 4) * 0.05 : code === 4 && fr.sk != null ? Math.sin(Math.PI * Math.min(1, fr.sk * 2.2)) * 0.18 : 0;
      body(fr.o[2 * i], fr.o[2 * i + 1], fr.f ? fr.f[i] : 270, 'home', String(i + 1), POSE_O[code] || '', bob, fr.h === IDS[i]);
    }
    // the defense's answer to the screen goes over the bodies, as a telestrator draws it
    if (run) { feet(); schemes(fi, opts.hold ? run.F[0] : fr, shotUp); }
    if (run && run.shot && run.shot.from && shotUp) {
      // the shot's line, from the hands to where the ball is
      ballAt(fr, after, B);
      const lw = Math.max(0.22, px1(2.4));
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(run.shot.from.x, run.shot.from.y); ctx.lineTo(after ? RIM.x : B.x, after ? RIM.y : B.y);
      ctx.strokeStyle = 'rgba(255,170,30,.22)'; ctx.lineWidth = lw * 2.6; ctx.stroke();
      ctx.strokeStyle = 'rgba(255,214,90,.95)'; ctx.lineWidth = lw; ctx.stroke();
    }
    ballAt(fr, after, B);
    if (!after || after.t < 6) ball(B, (opts.spin || 0) * 0.6);
    if (opts.debug) debug(fr);
    screen();
    ctx.drawImage(vignette(cv.width, cv.height), 0, 0, w, h);
    drawChips(w, h);
    if (after && after.made && run && run.winner && after.t > 0.2) drawConfetti(after.t - 0.2, w, h);
  }

  function debug(fr) {
    feet();
    ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = px1(1);
    for (let i = 0; i < 5; i++) {
      const m = IDS.indexOf(fr.m[i]);
      if (m < 0) continue;
      ctx.beginPath(); ctx.moveTo(fr.x[i * 2], fr.x[i * 2 + 1]); ctx.lineTo(fr.o[m * 2], fr.o[m * 2 + 1]); ctx.stroke();
    }
  }

  /* THE ANSWER CUTAWAY: their end of the floor, tinted, after an early make.
     No sim, nothing decided here: their shooter at a spot for the shot they
     need (a three or a two), one of ours closing out, and the ball up from
     his hands to the rim, then played out like ours (through, or off).
       o: { kind: 'two'|'three', seed, k: 0 to 1 of the flight, after: null or { t, made, seed } } */
  const AB = { x: 0, y: 0, z: 0 };
  function drawAnswer(o) {
    last = () => drawAnswer(o);
    const sz = sizeCanvas(cv), w = sz.w, h = sz.h;
    ctx = sz.ctx; DPR = sz.dpr;
    V = fitView(w, h, 12); K = DPR * V.s;
    ctx.imageSmoothingEnabled = true;
    floor(w, h);
    feet();
    ctx.fillStyle = 'rgba(110,22,12,.32)'; ctx.fillRect(FX0, FY0, FW, FH);
    const seed = o.seed >>> 0, ang = Math.PI * (0.3 + ((seed % 97) / 97) * 0.4);
    const r = o.kind === 'three' ? COURT.R3 + 1.5 : 14;
    const from = { x: RIM.x + Math.cos(ang) * r, y: RIM.y + Math.sin(ang) * r };
    const close = { x: from.x + (RIM.x - from.x) * 0.16, y: from.y + (RIM.y - from.y) * 0.16 };
    const face = Math.round(Math.atan2(RIM.y - from.y, RIM.x - from.x) * 180 / Math.PI + 360) % 360;
    const after = o.after || null;
    hoop(after);
    const up = !reduce && o.k < 0.35 && !after ? Math.sin(Math.PI * Math.min(1, o.k / 0.35)) * 0.18 : 0;
    body(close.x, close.y, (face + 180) % 360, 'home', '', 'arms', 0, false);
    body(from.x, from.y, face, 'away', '', o.k < 0.2 && !after ? 'shoot' : '', up, false);
    if (after) ballAt({ b: [RIM.x, RIM.y, 0] }, after, AB);
    else {
      const k = clamp(o.k, 0, 1), far = Math.hypot(RIM.x - from.x, RIM.y - from.y);
      const rel = o.kind === 'three' ? 7.5 : 7, peak = 2.4 + far * 0.2;
      AB.x = from.x + (RIM.x - from.x) * k; AB.y = from.y + (RIM.y - from.y) * k; AB.z = rel * (1 - k) * (1 - k * 0.4) + 4 * peak * k * (1 - k);
    }
    ball(AB, (o.k || 0) * 12);
    screen();
    ctx.drawImage(vignette(cv.width, cv.height), 0, 0, w, h);
  }

  /* redraw: the last picture again (a resize, a card coming up) */
  return { draw, drawAnswer, camStart, redraw: () => { if (last) last(); }, view: () => V };
}
