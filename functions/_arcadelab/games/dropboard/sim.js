/* Drop Board: the rules as a pure, fixed-step simulation.
 * An input is { f, x }: drop the puck at x (board units), legal while a drop
 * is waiting. Pegs, walls and dividers are circle and segment tests; no
 * physics engine, so there is no sleeping to disable and nothing that can
 * differ between the browser and the server. */
import { CONFIG as C } from './config.js';
import { mulberry32, streamFor } from '../../shared/seed.js';
import { GEMS_FOR_DAILY } from '../../shared/gems.js';
import { replay as replayAny } from '../../shared/replay.js';
import { hypot } from '../../shared/dmath.js';

export const MAX_FRAMES = C.MAX_FRAMES;
export const MAX_INPUTS = C.DROPS;
const SLOT_W = C.WIDTH / C.SLOTS;

export function pegs() {
  const out = [];
  for (let r = 0; r < C.PEG_ROWS; r++) {
    const y = C.PEG_TOP + r * C.PEG_DY, off = r % 2 ? C.PEG_DX / 2 : 0;
    for (let x = C.PEG_DX / 2 + off - C.PEG_DX; x <= C.WIDTH; x += C.PEG_DX) {
      // no peg so near a wall that the puck could wedge between them
      const clear = C.PEG_R + 2 * C.PUCK_R + 0.8;
      if (x > clear && x < C.WIDTH - clear) out.push({ x, y, row: r });
    }
  }
  return out;
}
const PEGS = pegs();

/* The day's board: the theme's slots shuffled by the seed, a Double slot and a
   Bumper peg. A theme comes from the server (an editor wrote and validated it);
   without one the sim still runs, on numbered slots, for the tests. */
export function layout(seed, theme) {
  const r = mulberry32(seed);
  const src = theme && theme.slots ? theme.slots : Array.from({ length: C.SLOTS }, (_, i) => ({ label: 'Slot ' + (i + 1), value: (i + 1) * 10 }));
  const order = src.map((s, i) => ({ s, k: r() + i * 1e-9 })).sort((a, b) => a.k - b.k).map(o => o.s);
  const double = Math.floor(r() * C.SLOTS);
  const mid = PEGS.filter(p => p.row >= 3 && p.row <= 8 && p.x > 15 && p.x < 85);
  const bumper = PEGS.indexOf(mid[Math.floor(r() * mid.length)]);
  return { slots: order.map(o => ({ label: o.label, value: o.value, sub: o.sub || '' })), double, bumper };
}

/* A Drop Board day is a published theme, never derived from the seed alone. */
export function dailyConfig() { return null; }

export function bestWorst(L) {
  const vals = L.slots.map((s, i) => s.value * (i === L.double ? 2 : 1));
  return { best: Math.max(...vals) * C.DROPS, worst: Math.min(...vals) * C.DROPS };
}

export function create(seed, cfg) {
  const L = layout(seed, cfg && cfg.theme);
  return { seed, L, frame: 0, drop: 0, phase: 'ready', phaseFrame: 0, x: 50, y: C.DROP_Y, vx: 0, vy: 0, slow: 0, nudges: 0,
    results: [], score: 0, over: false, events: [], ...bestWorst(L) };
}

export function applyInput(s, inp) {
  if (s.phase !== 'ready' || s.over) return false;
  const x = inp.x;
  if (!(typeof x === 'number' && isFinite(x) && x >= C.DROP_MIN && x <= C.DROP_MAX)) return false;
  const r = streamFor(s.seed, 'drop' + s.drop);
  s.x = x; s.y = C.DROP_Y; s.vx = (r() * 2 - 1) * C.DROP_JITTER; s.vy = 0; s.slow = 0; s.nudges = 0;
  s.phase = 'fall'; s.phaseFrame = 0;
  s.events.push({ type: 'drop' });
  return true;
}
export function waiting(s) { return s.phase === 'ready'; }

function bounceCircle(s, cxp, cyp, rad, e, keep, minOut) {
  const dx = s.x - cxp, dy = s.y - cyp, d = hypot(dx, dy), m = rad + C.PUCK_R;
  if (d >= m || d < 1e-9) return false;
  const nx = dx / d, ny = dy / d;
  s.x = cxp + nx * m; s.y = cyp + ny * m;
  const vn = s.vx * nx + s.vy * ny;
  if (vn < 0) {
    const tx = s.vx - vn * nx, ty = s.vy - vn * ny;
    let out = -vn * e;
    if (minOut && out < minOut) out = minOut;
    s.vx = tx * keep + out * nx; s.vy = ty * keep + out * ny;
  }
  return true;
}

function physics(s, h) {
  s.vy += C.GRAVITY * h;
  const sp = hypot(s.vx, s.vy);
  if (sp > C.MAX_SPEED) { s.vx *= C.MAX_SPEED / sp; s.vy *= C.MAX_SPEED / sp; }
  s.x += s.vx * h; s.y += s.vy * h;
  for (let i = 0; i < PEGS.length; i++) {
    const p = PEGS[i];
    if (Math.abs(p.y - s.y) > 6 || Math.abs(p.x - s.x) > 6) continue;
    const bump = i === s.L.bumper;
    if (bounceCircle(s, p.x, p.y, C.PEG_R, bump ? C.BUMPER_E : C.PEG_E, C.PEG_KEEP, bump ? C.BUMPER_MIN : 0) && bump) s.events.push({ type: 'bumper' });
  }
  for (let k = 1; k < C.SLOTS; k++) {          // dividers: a column of circles is a segment test that cannot tunnel
    const dx0 = k * SLOT_W;
    if (Math.abs(s.x - dx0) > C.PUCK_R + 1 || s.y < C.DIVIDER_TOP - C.PUCK_R) continue;
    bounceCircle(s, dx0, Math.max(C.DIVIDER_TOP, Math.min(C.HEIGHT, s.y)), C.DIVIDER_R, C.WALL_E, 0.9, 0);
  }
  if (s.x < C.PUCK_R) { s.x = C.PUCK_R; s.vx = Math.abs(s.vx) * C.WALL_E; }
  if (s.x > C.WIDTH - C.PUCK_R) { s.x = C.WIDTH - C.PUCK_R; s.vx = -Math.abs(s.vx) * C.WALL_E; }
}

export function step(s) {
  s.events = [];
  s.frame++; s.phaseFrame++;
  if (s.phase === 'fall') {
    const h = C.DT / C.SUB;
    for (let k = 0; k < C.SUB; k++) physics(s, h);
    // a stalled puck is nudged, the same way every time
    if (hypot(s.vx, s.vy) < C.STALL_SPEED) { if (++s.slow >= C.STALL_FRAMES) { s.vx += (s.x < C.WIDTH / 2 ? 1 : -1) * C.NUDGE * (1 + 0.25 * (s.nudges % 3)); s.vy -= C.NUDGE * 0.4; s.slow = 0; s.nudges++; s.events.push({ type: 'nudge' }); } }
    else s.slow = 0;
    if (s.y >= C.SLOT_Y) {
      const slot = Math.max(0, Math.min(C.SLOTS - 1, Math.floor(s.x / SLOT_W)));
      const sl = s.L.slots[slot], dbl = slot === s.L.double, pts = sl.value * (dbl ? 2 : 1);
      s.score += pts;
      s.results.push({ slot, pts, dbl });
      s.phase = 'settle'; s.phaseFrame = 0; s.vx = 0; s.vy = 0;
      s.events.push({ type: 'result', slot, pts, dbl, label: sl.label });
    }
  } else if (s.phase === 'settle' && s.phaseFrame >= C.SETTLE_FRAMES) {
    s.drop++;
    if (s.drop >= C.DROPS) { s.over = true; s.phase = 'over'; s.events.push({ type: 'over' }); }
    else { s.phase = 'ready'; s.phaseFrame = 0; s.x = 50; s.y = C.DROP_Y; s.events.push({ type: 'next' }); }
  }
}

/* A slot's tier for the share line, by where its value sits in the day. */
export function tierOf(pts, best, worst) {
  const per = (pts * C.DROPS - worst) / Math.max(1, best - worst);
  return per >= 0.66 ? 'high' : per >= 0.33 ? 'mid' : 'low';
}
export function detail(s) {
  return { results: s.results.map(r => ({ ...r, tier: tierOf(r.pts, s.best, s.worst) })), best: s.best, worst: s.worst, double: s.L.double };
}
export function replay(seed, inputs, cfg) { return replayAny({ create, applyInput, step, detail, waiting, MAX_FRAMES, MAX_INPUTS }, seed, inputs, cfg); }
export function gems(score, cfg, d) {
  const best = d ? d.best : 1, worst = d ? d.worst : 0;
  const share = (score - worst) / Math.max(1, best - worst);
  let b = 0; for (const x of C.GEM_SHARE_BANDS) if (share >= x.at) b = x.bonus;
  return GEMS_FOR_DAILY + b;
}
export function squares(d) { return (d.results || []).map(r => r.tier === 'high' ? '🟩' : r.tier === 'mid' ? '🟨' : '⬛'); }
export function scoreText(score) { return String(score); }
