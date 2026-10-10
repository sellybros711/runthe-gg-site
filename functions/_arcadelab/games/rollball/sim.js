/* Roll-Ball: the rules as a pure, fixed-step simulation.
 *
 * No DOM, no wall clock, no Math.random. The browser steps it at 60 Hz and the
 * server replays the same input log through the same code, so the score the
 * player saw is the score the server records, and a forged one does not match.
 *
 * An input is { f, a, p }: at the start of frame f, throw at angle a
 * (radians, 0 is straight) with power p (0..1). A throw is only legal while
 * the phase is 'ready'.
 */
import { CONFIG as C, LAYOUTS, HOT_ZONES } from './config.js';
import { mulberry32, streamFor } from '../../shared/seed.js';
import { gemsFor } from '../../shared/gems.js';
import { sin, cos, atan2, hypot } from '../../shared/dmath.js';
import { replay as replayAny } from '../../shared/replay.js';

export const MAX_FRAMES = C.MAX_FRAMES;
export const MAX_INPUTS = C.BALLS;

export const GAME_ID = C.GAME_ID;
export const NAME = C.NAME;

/* What a seed means for the day: the board and the hot ring. */
export function dailyConfig(seed) {
  const r = mulberry32(seed);
  const layout = LAYOUTS[Math.floor(r() * LAYOUTS.length)];
  const hot = HOT_ZONES[Math.floor(r() * HOT_ZONES.length)];
  return { layoutId: layout.id, hot, rule: ruleLine(layout, hot) };
}

const ZONE_WORD = { '1B': 'Single', '2B': 'Double', '3B': 'Triple' };
export function ruleLine(layout, hot) {
  const slides = layout.pockets.filter(p => p.slide).length;
  const mover = slides === 2 ? ' Both pockets slide.' : slides === 1 ? ' One home run pocket slides.' : '';
  return layout.name + '. The ' + ZONE_WORD[hot] + ' ring is hot for +1 base.' + mover;
}

export function layoutOf(id) { return LAYOUTS.find(l => l.id === id) || LAYOUTS[0]; }

/* Where a pocket is on a given frame. */
export function pocketAt(p, frame) {
  if (!p.slide) return { x: p.x, y: p.y };
  const t = frame / p.slide.period + p.slide.phase;
  return { x: p.x + p.slide.amp * sin(2 * Math.PI * t), y: p.y };
}

export function create(seed, cfg) {
  const day = dailyConfig(seed);
  return {
    seed, day, layout: layoutOf(day.layoutId), frame: 0,
    ball: 0, phase: 'ready', phaseFrame: 0,
    x: 0, y: 0, z: 0, vx: 0, vy: 0,
    air: null, results: [], score: 0, over: false, events: []
  };
}

/* Throw the current ball. Returns false (and changes nothing) if not legal. */
export function throwBall(s, a, p) {
  if (s.phase !== 'ready' || s.over) return false;
  if (!(typeof a === 'number' && isFinite(a) && Math.abs(a) <= C.MAX_ANGLE + 1e-9)) return false;
  if (!(typeof p === 'number' && isFinite(p) && p >= 0 && p <= 1)) return false;
  const v = C.V_MIN + p * (C.V_MAX - C.V_MIN);
  s.x = 0; s.y = 0; s.z = 0;
  s.vx = v * sin(a); s.vy = v * cos(a);
  s.phase = 'lane'; s.phaseFrame = 0;
  return true;
}

function decel(s, a) {
  const sp = hypot(s.vx, s.vy);
  if (sp === 0) return 0;
  const ns = Math.max(0, sp - a * C.DT);
  s.vx *= ns / sp; s.vy *= ns / sp;
  return ns;
}

function ringZone(L, x, y) {
  const d = hypot(x - L.ring.x, y - L.ring.y);
  const [r1, r2, r3] = L.ring.r;
  return d <= r3 ? '3B' : d <= r2 ? '2B' : d <= r1 ? '1B' : 'F';
}

function finish(s, zone, why) {
  const base = C.BASES[zone];
  const hot = zone === s.day.hot;
  const bases = Math.min(C.MAX_BASES, base + (hot ? C.HOT_BONUS : 0));
  s.results.push({ zone, bases, hot, why: why || null });
  s.score += bases;
  s.phase = 'settle'; s.phaseFrame = 0;
  s.vx = s.vy = 0; s.z = 0;
  s.events.push({ type: 'result', zone, bases, hot, ball: s.ball });
}

/* Advance one fixed step. */
export function step(s) {
  s.events = [];
  s.frame++;
  s.phaseFrame++;
  const L = s.layout;
  if (s.phase === 'lane') {
    decel(s, C.LANE_FRICTION);
    s.x += s.vx * C.DT; s.y += s.vy * C.DT;
    if (s.x > C.LANE_HALF) { s.x = 2 * C.LANE_HALF - s.x; s.vx = -Math.abs(s.vx) * C.WALL_E; s.vy *= C.WALL_E + (1 - C.WALL_E) * 0.6; s.events.push({ type: 'rail' }); }
    if (s.x < -C.LANE_HALF) { s.x = -2 * C.LANE_HALF - s.x; s.vx = Math.abs(s.vx) * C.WALL_E; s.vy *= C.WALL_E + (1 - C.WALL_E) * 0.6; s.events.push({ type: 'rail' }); }
    if (s.vy <= 0) return finish(s, 'F', 'short');
    if (s.y >= C.LIP_Y) {
      const sp = hypot(s.vx, s.vy);
      if (sp < C.MIN_LIP_SPEED) return finish(s, 'F', 'short');
      const r = streamFor(s.seed, 'ball' + s.ball);
      const jc = (r() * 2 - 1) * C.CARRY_JITTER, ja = (r() * 2 - 1) * C.ANGLE_JITTER;
      const ang = atan2(s.vx, s.vy) + ja;
      const carry = sp * C.CARRY_S * (1 + jc);
      s.air = { x0: s.x, y0: s.y, x1: s.x + carry * sin(ang), y1: s.y + carry * cos(ang), sp, ang, hop: r() };
      s.phase = 'air'; s.phaseFrame = 0;
      s.events.push({ type: 'launch' });
    }
    return;
  }
  if (s.phase === 'air') {
    const A = s.air, t = s.phaseFrame / C.FLIGHT_FRAMES;
    s.x = A.x0 + (A.x1 - A.x0) * t; s.y = A.y0 + (A.y1 - A.y0) * t;
    s.z = C.ARC_HEIGHT * 4 * t * (1 - t);
    if (s.phaseFrame >= C.FLIGHT_FRAMES) {
      s.z = 0; s.x = A.x1; s.y = A.y1;
      if (Math.abs(s.x) > C.BOARD_HALF) return finish(s, 'F', 'side');
      if (s.y > C.BOARD_BACK) return finish(s, 'F', 'long');
      if (s.y < C.BOARD_FRONT) return finish(s, 'F', 'short');
      const v = A.sp * C.ROLL_KEEP;
      s.vx = v * sin(A.ang); s.vy = v * cos(A.ang);
      s.phase = 'roll'; s.phaseFrame = 0;
      s.events.push({ type: 'land' });
    }
    return;
  }
  if (s.phase === 'roll') {
    s.x += s.vx * C.DT; s.y += s.vy * C.DT;
    for (const p of L.pockets) {
      const c = pocketAt(p, s.frame);
      if (hypot(s.x - c.x, s.y - c.y) < C.POCKET_R) { s.x = c.x; s.y = c.y; return finish(s, 'HR'); }
    }
    if (Math.abs(s.x) > C.BOARD_HALF) return finish(s, 'F', 'side');
    if (s.y > C.BOARD_BACK) return finish(s, 'F', 'long');
    if (decel(s, C.BOARD_FRICTION) > 0) return;
    /* At rest. A ball sitting on a ring line hops one way or the other,
       decided by this ball's own seeded draw. */
    const dx = s.x - L.ring.x, dy = s.y - L.ring.y, d = hypot(dx, dy) || 1;
    for (const r of L.ring.r) {
      if (Math.abs(d - r) < C.EDGE_BAND) {
        const nd = s.air.hop < 0.5 ? r - C.HOP : r + C.HOP;
        s.x = L.ring.x + dx / d * nd; s.y = L.ring.y + dy / d * nd;
        break;
      }
    }
    return finish(s, ringZone(L, s.x, s.y));
  }
  if (s.phase === 'settle') {
    if (s.phaseFrame >= C.SETTLE_FRAMES) {
      s.ball++;
      s.x = 0; s.y = 0; s.z = 0; s.air = null;
      if (s.ball >= C.BALLS) { s.over = true; s.phase = 'over'; s.events.push({ type: 'over' }); }
      else { s.phase = 'ready'; s.phaseFrame = 0; s.events.push({ type: 'next', ball: s.ball }); }
    }
    return;
  }
  /* 'ready' and 'over' only tick the clock (a sliding pocket keeps moving). */
}

/* The per-game breakdown the server stores. */
export function detail(s) {
  const zones = new Set(s.results.map(r => r.zone));
  const cycle = ['1B', '2B', '3B', 'HR'].every(z => zones.has(z));
  return { results: s.results.map(r => ({ zone: r.zone, bases: r.bases, hot: r.hot })), cycle, layout: s.day.layoutId, hot: s.day.hot };
}

export function gems(score) { return gemsFor(score, C.GEM_BANDS); }
export function bands() { return C.GEM_BANDS; }

const SQ = { '1B': '🟩', '2B': '🟨', '3B': '🟧', HR: '🟥', F: '⬛' };
export function squares(d) { return (d.results || []).map(r => SQ[r.zone]); }
export function scoreText(score) { return score + '/' + (C.BALLS * C.MAX_BASES); }

/* The contract shared/replay.js plays. */
export function applyInput(s, inp) { return throwBall(s, inp.a, inp.p); }
export function waiting(s) { return s.phase === 'ready'; }

/* Replay a whole run from its log. The server's only source of truth. */
export function replay(seed, inputs) {
  if (!Array.isArray(inputs) || inputs.length !== C.BALLS) return { error: 'bad_inputs' };
  return replayAny({ create, applyInput, step, detail, waiting, MAX_FRAMES, MAX_INPUTS }, seed, inputs);
}
