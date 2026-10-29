/* Hoop Shoot: the rules as a pure, fixed-step simulation.
 * An input is { f, a, p }: shoot at aim a (radians) with power p (0..1),
 * legal while the clock runs and the rack has fed the next ball. Several
 * balls can be in the air at once. The rim is a ring (the true shape a ball
 * meets) and the glass a plane; both are circle tests, no engine. */
import { CONFIG as C } from './config.js';
import { mulberry32, streamFor } from '../../shared/seed.js';
import { gemsFor } from '../../shared/gems.js';
import { replay as replayAny } from '../../shared/replay.js';
import { sin, cos, hypot, PI } from '../../shared/dmath.js';

export const MAX_FRAMES = C.MAX_FRAMES;
export const MAX_INPUTS = C.MAX_INPUTS;

export function dailyConfig(seed) {
  const r = mulberry32(seed);
  const kind = r() < 0.5 ? 'sine' : 'sweep';
  const amp = Math.round((C.MOVE_AMP[0] + r() * (C.MOVE_AMP[1] - C.MOVE_AMP[0])) * 10) / 10;
  const period = Math.round(C.MOVE_PERIOD[0] + r() * (C.MOVE_PERIOD[1] - C.MOVE_PERIOD[0]));
  const phase = r() < 0.5 ? 0 : 0.5;
  return { move: { kind, amp, period, phase },
    rule: 'The hoop holds still for 20 seconds, then ' + (kind === 'sine' ? 'glides' : 'sweeps') + ' side to side, ' + (period < 220 ? 'fast' : 'slowly') + '.' };
}

/* The hoop's x on a frame. Still, then moving, starting from the middle. */
export function hoopX(day, frame) {
  if (frame < C.STILL_FRAMES) return 0;
  const m = day.move, t = (frame - C.STILL_FRAMES) / m.period + m.phase;
  if (m.kind === 'sine') return m.amp * sin(2 * PI * t) * (m.phase ? -1 : 1);
  const u = t - Math.floor(t);                        // a triangle wave
  return m.amp * (u < 0.25 ? 4 * u : u < 0.75 ? 2 - 4 * u : 4 * u - 4);
}

export function create(seed, cfg) {
  const day = cfg && cfg.move ? cfg : dailyConfig(seed);
  return { seed, day, frame: 0, reload: 0, shots: 0, balls: [], made: 0, score: 0, streak: 0, fireLeft: 0,
    blocks: new Array(C.BLOCKS).fill(0), log: [], over: false, events: [], hx: 0 };
}

export function applyInput(s, inp) {
  if (s.over || s.frame >= C.CLOCK_FRAMES || s.reload > 0) return false;
  const { a, p } = inp;
  if (!(typeof a === 'number' && isFinite(a) && Math.abs(a) <= C.MAX_AIM + 1e-9)) return false;
  if (!(typeof p === 'number' && isFinite(p) && p >= 0 && p <= 1)) return false;
  const v = C.V_MIN + p * (C.V_MAX - C.V_MIN), ce = cos(C.ELEVATION);
  const money = s.shots % C.MONEY_EVERY === C.MONEY_EVERY - 1;
  let fire = false;
  if (s.fireLeft > 0) { fire = true; s.fireLeft--; }
  const r = streamFor(s.seed, 'shot' + s.shots);
  s.balls.push({ id: s.shots, x: 0, y: 0, z: C.RELEASE_Z, vx: v * ce * sin(a), vy: v * ce * cos(a), vz: v * sin(C.ELEVATION),
    age: 0, rim: false, board: false, done: false, money, fire, at: s.frame, pull: 0.35 + 0.65 * r() });
  s.shots++;
  s.reload = C.RELOAD_FRAMES;
  s.events.push({ type: 'shot', money, fire });
  return true;
}

function finishBall(s, b, made) {
  b.done = true;
  let pts = 0, kind = null;
  if (made) {
    kind = !b.rim && !b.board ? 'swish' : b.board ? 'glass' : 'rim';
    pts = kind === 'swish' ? C.SWISH : C.BASKET;
    if (b.money) pts *= C.MONEY_MULT;
    if (b.fire) pts += C.FIRE_BONUS;
    s.made++; s.score += pts; s.streak++;
    const blk = Math.min(C.BLOCKS - 1, Math.floor(b.at / (C.CLOCK_FRAMES / C.BLOCKS)));
    s.blocks[blk]++;
    if (s.streak >= C.FIRE_AFTER && s.streak % C.FIRE_AFTER === 0) { s.fireLeft = C.FIRE_SHOTS; s.events.push({ type: 'fire' }); }
  } else { s.streak = 0; }
  s.log.push({ id: b.id, made, kind, pts });
  s.events.push({ type: made ? 'make' : 'miss', kind, pts, money: b.money, fire: b.fire, x: b.x, y: b.y, z: b.z });
}

function physics(s, b, hx, h) {
  b.vz -= C.GRAVITY * h;
  // the pull toward a near miss, only on the way down and only just above the rim
  const dx0 = b.x - hx, dy0 = b.y - C.HOOP_Y, dh0 = hypot(dx0, dy0);
  if (b.vz < 0 && b.z > C.RIM_Z && b.z < C.RIM_Z + 1.2 && dh0 < C.RIM_R + C.BALL_R && dh0 > 1e-6) {
    const m = C.MAGNET * b.pull * h / dh0;
    b.vx -= dx0 * m; b.vy -= dy0 * m;
  }
  const pz = b.z;
  b.x += b.vx * h; b.y += b.vy * h; b.z += b.vz * h;
  // the rim: the nearest point of the ring to the ball's centre
  const dx = b.x - hx, dy = b.y - C.HOOP_Y, dh = hypot(dx, dy) || 1e-9;
  const rx = hx + dx / dh * C.RIM_R, ry = C.HOOP_Y + dy / dh * C.RIM_R;
  const nx = b.x - rx, ny = b.y - ry, nz = b.z - C.RIM_Z, d = Math.sqrt(nx * nx + ny * ny + nz * nz);
  if (d < C.BALL_R && d > 1e-9) {
    const ux = nx / d, uy = ny / d, uz = nz / d, vn = b.vx * ux + b.vy * uy + b.vz * uz;
    if (vn < 0) {
      const tx = b.vx - vn * ux, ty = b.vy - vn * uy, tz = b.vz - vn * uz;
      b.vx = tx * C.RIM_KEEP - vn * C.RIM_E * ux; b.vy = ty * C.RIM_KEEP - vn * C.RIM_E * uy; b.vz = tz * C.RIM_KEEP - vn * C.RIM_E * uz;
      if (!b.rim) s.events.push({ type: 'rim' });
      b.rim = true;
    }
    const push = C.BALL_R - d;
    b.x += ux * push; b.y += uy * push; b.z += uz * push;
  }
  // the glass
  const boardY = C.HOOP_Y + C.RIM_R + C.BOARD_GAP;
  if (b.y + C.BALL_R > boardY && b.vy > 0 && Math.abs(b.x - hx) < C.BOARD_HALF && b.z > C.BOARD_LO && b.z < C.BOARD_HI) {
    b.y = boardY - C.BALL_R; b.vy = -b.vy * C.BOARD_E;
    if (!b.board) s.events.push({ type: 'glass' });
    b.board = true;
  }
  // through the hoop: crossing the rim plane downward inside the ring
  if (pz >= C.RIM_Z && b.z < C.RIM_Z && b.vz < 0) {
    const dd = hypot(b.x - hx, b.y - C.HOOP_Y);
    if (dd < C.RIM_R - C.BALL_R * 0.35) return finishBall(s, b, true);
  }
  if (b.z < 0 || b.y > boardY + 3 || b.y < -4 || Math.abs(b.x - hx) > 14) return finishBall(s, b, false);
}

export function step(s) {
  s.events = [];
  s.frame++;
  if (s.reload > 0) s.reload--;
  const h = C.DT / C.SUB;
  for (let k = 0; k < C.SUB; k++) {
    const hx = hoopX(s.day, s.frame - 1 + (k + 1) / C.SUB);
    for (const b of s.balls) if (!b.done) physics(s, b, hx, h);
  }
  s.hx = hoopX(s.day, s.frame);
  for (const b of s.balls) if (!b.done && ++b.age > C.BALL_LIFE) finishBall(s, b, false);
  s.balls = s.balls.filter(b => !b.done || s.frame - b.at < 4);
  if (s.frame === C.CLOCK_FRAMES) s.events.push({ type: 'horn' });
  if (s.frame >= C.CLOCK_FRAMES && !s.balls.some(b => !b.done)) { s.over = true; s.events.push({ type: 'over' }); }
}

export function detail(s) {
  const kinds = { swish: 0, rim: 0, glass: 0 };
  for (const l of s.log) if (l.made) kinds[l.kind]++;
  return { shots: s.shots, made: s.made, blocks: s.blocks, kinds, move: s.day.move };
}
export function replay(seed, inputs, cfg) { return replayAny({ create, applyInput, step, detail, MAX_FRAMES, MAX_INPUTS }, seed, inputs, cfg); }
export function gems(score) { return gemsFor(score, C.GEM_BANDS); }
export function squares(d) { return (d.blocks || []).map(n => n >= 3 ? '🟩' : n >= 1 ? '🟨' : '⬛'); }
export function scoreText(score) { return String(score); }
