/* Pinball: the rules as a pure, fixed-step simulation.
 *
 * The physics is written here rather than taken from Box2D or matter.js, on
 * purpose: the server replays every run from its input log and must land on
 * the same score as the browser, to the bit. A general engine brings warm
 * starting, sleeping, islands and the engine's own trig, any of which can
 * drift between two runtimes. A ball, some capsules and some circles need
 * none of that: every collision below is one closest-point test, and every
 * trig call goes through shared/dmath.js.
 *
 * NO TUNNELLING, three ways: the ball's speed is capped so a sub-step moves
 * it less than a third of its radius; a flipper sweeps about a unit per
 * sub-step, under half the ball; and every capsule remembers which side the
 * ball was on and only ever pushes it back to that side.
 *
 * Inputs: { f, k } with k one of L1 L0 R1 R0 (a flipper up and down), N (a
 * nudge), and P with { p } (pull and let go of the plunger, power 0..1).
 */
import { CONFIG as C } from './config.js';
import { mulberry32 } from '../../shared/seed.js';
import { gemsFor } from '../../shared/gems.js';
import { replay as replayAny } from '../../shared/replay.js';
import { sin, cos, hypot } from '../../shared/dmath.js';
import { NAMES, ARMS } from './names.js';

export const MAX_FRAMES = C.MAX_FRAMES;
export const MAX_INPUTS = C.MAX_INPUTS;
export const DRAIN_Y = 186;

/* The table's fixed walls, as capsules from (ax, ay) to (bx, by). */
const W = [];
const poly = (pts, tag) => { for (let i = 0; i + 1 < pts.length; i++) W.push({ ax: pts[i][0], ay: pts[i][1], bx: pts[i + 1][0], by: pts[i + 1][1], tag: tag || 'wall' }); };
poly([[4, 132], [4, 30], [8, 16], [18, 7], [32, 3], [50, 2], [68, 3], [82, 7], [91, 14], [97, 27], [97, 186]]);  // left wall, the arch, the lane's outer wall
poly([[4, 132], [27, 157]]);                        // the left guide, onto the flipper
poly([[4, 132], [4, 186]]);                         // the wall under it, so a ball flung below the flippers still drains
poly([[89, 40], [89, 132], [69, 157]]);             // the lane's inner wall, then the right guide
poly([[89, 132], [89, 186]]);
poly([[89, 176], [97, 176]]);                       // the plunger's face
W.push({ ax: 89, ay: 40, bx: 97, by: 33, tag: 'gate' }); // one way: out of the lane, never back in
poly([[11, 112], [22, 138]], 'slingL'); poly([[85, 112], [74, 138]], 'slingR');
poly([[11, 112], [11, 128], [22, 138]]); poly([[85, 112], [85, 128], [74, 138]]);
poly([[39, 8], [39, 20]]); poly([[57, 8], [57, 20]]);   // the posts between the base lanes
/* Each wall's box, grown by the reach of a contact, so a sub-step skips the
   walls the ball is nowhere near. A skipped wall forgets which side the ball
   was on, which is safe: the ball cannot cross a wall it is not near. */
for (const w of W) { const m = 2.4 + 0.9 + 4.5; w.x0 = Math.min(w.ax, w.bx) - m; w.x1 = Math.max(w.ax, w.bx) + m; w.y0 = Math.min(w.ay, w.by) - m; w.y1 = Math.max(w.ay, w.by) + m; }
export const WALLS = W;

export function dailyConfig(seed) {
  const r = mulberry32(seed);
  const pick = (list, n) => { const out = []; while (out.length < n) { const x = list[Math.floor(r() * list.length)]; if (!out.includes(x)) out.push(x); } return out; };
  const bumpers = pick(NAMES, 3), arms = pick(ARMS, 3), hot = Math.floor(r() * 3);
  return { bumpers, arms, hot, rule: bumpers[hot] + ' is the Hot Athlete today. That bumper pays five times.' };
}

function flipperInit(side) {
  const p = side === 'L' ? C.LEFT_PIVOT : C.RIGHT_PIVOT;
  return { side, px: p[0], py: p[1], ang: C.FLIP_REST, w: 0, held: false };
}
/* A flipper's tip, mirrored for the right one. */
export function flipperTip(f, ang) {
  const a = ang == null ? f.ang : ang, m = f.side === 'L' ? 1 : -1;
  return { x: f.px + m * C.FLIP_LEN * cos(a), y: f.py + C.FLIP_LEN * sin(a) };
}

export function create(seed, cfg) {
  const day = cfg && Array.isArray(cfg.bumpers) ? cfg : dailyConfig(seed);
  const s = { seed, day, frame: 0, ball: 0, score: 0, mult: 1, over: false, events: [],
    flippers: [flipperInit('L'), flipperInit('R')], lanes: [false, false, false], targets: [true, true, true], targetReset: 0,
    perBall: [], ballScore: 0, ballStart: 0 };
  serve(s);
  return s;
}

function serve(s) {
  s.b = { x: C.LANE_X, y: C.LANE_REST_Y, vx: 0, vy: 0, inLane: true, rest: true, ramp: 0, side: new Map() };
  s.saveUntil = -1; s.nudges = 0; s.tilt = false; s.slow = 0;
}

function award(s, pts, why) {
  if (s.tilt) return;
  const v = pts * s.mult;
  s.score += v; s.ballScore += v;
  s.events.push({ type: 'score', pts: v, why });
}

export function applyInput(s, inp) {
  if (s.over) return false;
  const k = inp.k, b = s.b;
  if (k === 'L1' || k === 'L0' || k === 'R1' || k === 'R0') {
    const f = s.flippers[k[0] === 'L' ? 0 : 1], h = k[1] === '1';
    if (f.held === h) return false;
    f.held = h;
    if (h && !s.tilt) s.events.push({ type: 'flip', side: k[0] });
    return true;
  }
  if (k === 'P') {
    if (!b.rest) return false;
    const p = inp.p;
    if (!(typeof p === 'number' && isFinite(p) && p >= 0 && p <= 1)) return false;
    b.rest = false;
    b.vy = -(C.PLUNGE_MIN + p * (C.PLUNGE_MAX - C.PLUNGE_MIN));
    if (s.saveUntil < 0) s.saveUntil = s.frame + C.BALL_SAVE_FRAMES;
    s.events.push({ type: 'plunge' });
    return true;
  }
  if (k === 'N') {
    if (b.inLane || b.ramp || s.tilt) return false;
    s.nudges++;
    if (s.nudges > C.NUDGES_PER_BALL) { s.tilt = true; s.events.push({ type: 'tilt' }); return true; }
    b.vy -= C.NUDGE_UP; b.vx += (b.x < 48 ? 1 : -1) * C.NUDGE_SIDE;
    s.events.push({ type: 'nudge', left: C.NUDGES_PER_BALL - s.nudges });
    return true;
  }
  return false;
}
export function waiting(s) { return s.b.rest; }

/* Push the ball out of a capsule, back to the side it came from, and bounce
   it off the capsule's surface, which may itself be moving (a flipper).
   Answers how fast the ball hit it, or 0 for no contact. */
function capsule(b, key, ax, ay, bx, by, rr, e, w, px, py) {
  const ex = bx - ax, ey = by - ay, L2 = ex * ex + ey * ey;
  let t = ((b.x - ax) * ex + (b.y - ay) * ey) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
  const qx = ax + ex * t, qy = ay + ey * t;
  let nx = b.x - qx, ny = b.y - qy, d = hypot(nx, ny);
  const m = C.BALL_R + rr;
  const side = ex * (b.y - ay) - ey * (b.x - ax) >= 0 ? 1 : -1;
  const was = b.side.get(key);
  if (d >= m) { if (d > m + 4) b.side.delete(key); else b.side.set(key, side); return 0; }
  if (was && was !== side && t > 0 && t < 1) {
    const Ln = Math.sqrt(L2);     // it crossed the line in one sub-step: put it back
    nx = -ey / Ln * was; ny = ex / Ln * was;
  } else {
    if (d < 1e-9) { nx = -ey; ny = ex; d = Math.sqrt(L2); }
    nx /= d; ny /= d;
    b.side.set(key, side);
  }
  b.x = qx + nx * m; b.y = qy + ny * m;
  const svx = w ? -w * (qy - py) : 0, svy = w ? w * (qx - px) : 0;
  const rvx = b.vx - svx, rvy = b.vy - svy, vn = rvx * nx + rvy * ny;
  if (vn < 0) { b.vx = rvx - (1 + e) * vn * nx + svx; b.vy = rvy - (1 + e) * vn * ny + svy; return -vn; }
  return 0.0001;
}

function circle(b, cx0, cy0, rad, kick) {
  const dx = b.x - cx0, dy = b.y - cy0, d = hypot(dx, dy), m = rad + C.BALL_R;
  if (d >= m || d < 1e-9) return false;
  const nx = dx / d, ny = dy / d;
  b.x = cx0 + nx * m; b.y = cy0 + ny * m;
  const vn = b.vx * nx + b.vy * ny, out = Math.max(-vn * 0.5, kick);
  b.vx += (out - vn) * nx; b.vy += (out - vn) * ny;
  return true;
}

function subStep(s, h) {
  const b = s.b;
  for (const f of s.flippers) {
    const want = f.held && !s.tilt ? C.FLIP_UP : C.FLIP_REST, st = C.FLIP_SPEED * h, a0 = f.ang;
    f.ang = Math.abs(want - f.ang) <= st ? want : f.ang + (want > f.ang ? st : -st);
    f.w = (f.ang - a0) / h * (f.side === 'L' ? 1 : -1);
  }
  if (b.ramp || b.rest) return;
  b.vy += C.GRAVITY * h;
  const damp = 1 - C.BALL_DAMP * h;
  b.vx *= damp; b.vy *= damp;
  const sp = hypot(b.vx, b.vy);
  if (sp > C.MAX_SPEED) { b.vx *= C.MAX_SPEED / sp; b.vy *= C.MAX_SPEED / sp; }
  b.x += b.vx * h; b.y += b.vy * h;
  if (b.inLane && b.x < 89 - C.BALL_R) b.inLane = false;

  for (let i = 0; i < W.length; i++) {
    const w = W[i];
    if (b.x < w.x0 || b.x > w.x1 || b.y < w.y0 || b.y > w.y1) continue;
    if (w.tag === 'gate' && (b.vy < 0 || b.inLane)) continue;
    const hit = capsule(b, i, w.ax, w.ay, w.bx, w.by, C.WALL_R, C.WALL_E, 0, 0, 0);
    if (hit > 25 && (w.tag === 'slingL' || w.tag === 'slingR')) {
      const ex = w.bx - w.ax, ey = w.by - w.ay, L = hypot(ex, ey), sg = w.tag === 'slingL' ? 1 : -1;
      b.vx += sg * ey / L * C.SLING_KICK; b.vy -= sg * ex / L * C.SLING_KICK;
      award(s, C.PTS.sling, 'sling'); s.events.push({ type: 'sling', side: w.tag });
    }
  }
  s.flippers.forEach((f, i) => {
    const t = flipperTip(f);
    capsule(b, 'f' + i, f.px, f.py, t.x, t.y, C.FLIP_R, C.FLIP_E, f.w, f.px, f.py);
  });
  C.BUMPERS.forEach((p, i) => {
    if (circle(b, p[0], p[1], C.BUMPER_R, C.BUMPER_KICK)) {
      const hot = i === s.day.hot;
      award(s, C.PTS.bumper * (hot ? C.PTS.hot : 1), hot ? 'hot' : 'bumper');
      s.events.push({ type: 'bumper', i, hot });
    }
  });
  C.TARGETS.forEach((y, i) => {
    if (!s.targets[i]) return;
    if (capsule(b, 't' + i, C.TARGETS_X, y[0], C.TARGETS_X, y[1], 0.8, 0.4, 0, 0, 0)) {
      s.targets[i] = false; award(s, C.PTS.target, 'target'); s.events.push({ type: 'target', i });
      if (s.targets.every(x => !x)) {
        award(s, C.PTS.bank, 'bank');
        if (s.mult < C.MULT_MAX) s.mult++;
        s.targetReset = 0; s.events.push({ type: 'bank', mult: s.mult });
      }
    }
  });
  // a pull too weak to clear the lane rolls back onto the plunger
  if (b.inLane && b.y >= C.LANE_REST_Y && b.vy >= 0 && b.vy < 30) { b.rest = true; b.x = C.LANE_X; b.y = C.LANE_REST_Y; b.vx = 0; b.vy = 0; }
}

export function step(s) {
  s.events = [];
  s.frame++;
  const b = s.b, h = C.DT / C.SUB;
  if (b.ramp && --b.ramp === 0) {
    b.x = C.RAMP_OUT.x; b.y = C.RAMP_OUT.y; b.vx = C.RAMP_OUT.vx; b.vy = C.RAMP_OUT.vy; b.side = new Map();
    s.events.push({ type: 'rampOut' });
  }
  if (s.frame >= MAX_FRAMES) { s.over = true; s.events.push({ type: 'over' }); return; }
  const px = b.x;
  for (let k = 0; k < C.SUB; k++) subStep(s, h);
  if (!s.targets.some(x => x) && ++s.targetReset >= C.TARGET_RESET_FRAMES) { s.targets = [true, true, true]; s.events.push({ type: 'targetsUp' }); }

  // the base lanes at the top, rolled through on the way down
  C.LANES.forEach((x, i) => {
    if (!s.lanes[i] && b.vy > 0 && Math.abs(b.x - x) < 4 && b.y > C.LANE_Y[0] && b.y < C.LANE_Y[1]) {
      s.lanes[i] = true; award(s, C.PTS.lane, 'lane'); s.events.push({ type: 'lane', i, all: s.lanes.every(Boolean) });
    }
  });
  // the Home Run ramp: in its mouth, going up hard enough
  const R = C.RAMP_IN;
  if (!b.ramp && !b.rest && b.x > R.x0 && b.x < R.x1 && b.y > R.y0 && b.y < R.y1 && b.vy < -R.minUp && px > R.x0 - 4) {
    b.ramp = C.RAMP_FRAMES; b.vx = 0; b.vy = 0;
    if (s.lanes.every(Boolean)) { award(s, C.PTS.allBases, 'homer'); s.lanes = [false, false, false]; s.events.push({ type: 'homer' }); }
    else { award(s, C.PTS.ramp, 'ramp'); s.events.push({ type: 'ramp' }); }
  }

  // nothing sits still for long, unless it is cradled on a raised flipper
  const cradled = s.flippers.some(f => {
    if (!f.held || s.tilt) return false; const t = flipperTip(f);
    return hypot(b.x - (f.px + t.x) / 2, b.y - (f.py + t.y) / 2) < C.FLIP_LEN * 0.6 + C.BALL_R;
  });
  if (!b.rest && !b.ramp && !cradled && hypot(b.vx, b.vy) < C.STUCK_SPEED) {
    s.slow++;
    if (s.slow === C.STUCK_PULSE_FRAMES || s.slow === C.STUCK_PULSE2_FRAMES) {
      const k = s.slow === C.STUCK_PULSE_FRAMES ? 1 : 1.8;
      b.vy -= 110 * k; b.vx += (b.x < 48 ? 1 : -1) * 45 * k; s.events.push({ type: 'search' });
    } else if (s.slow >= C.STUCK_RESCUE_FRAMES) {
      b.x = 48; b.y = 30; b.vx = 0; b.vy = 20; b.inLane = false; b.side = new Map(); s.slow = 0; s.events.push({ type: 'rescue' });
    }
  } else s.slow = 0;

  // the drain
  if (b.y > DRAIN_Y + C.BALL_R) {
    if (s.frame <= s.saveUntil) { serve(s); s.saveUntil = 0; s.events.push({ type: 'saved' }); return; }
    const lit = s.lanes.filter(Boolean).length;
    if (lit) award(s, lit * C.PTS.laneEnd, 'bonus');
    s.perBall.push({ score: s.ballScore, frames: s.frame - s.ballStart });
    s.events.push({ type: 'drain', ball: s.ball, score: s.ballScore });
    s.ball++;
    if (s.ball >= C.BALLS) { s.over = true; s.events.push({ type: 'over' }); return; }
    serve(s); s.ballStart = s.frame; s.ballScore = 0; s.lanes = [false, false, false];
  }
}

export function detail(s) { return { perBall: s.perBall, mult: s.mult, hot: s.day.bumpers[s.day.hot] }; }
export function replay(seed, inputs, cfg) { return replayAny({ create, applyInput, step, detail, waiting, MAX_FRAMES, MAX_INPUTS }, seed, inputs, cfg); }
export function gems(score) { return gemsFor(score, C.GEM_BANDS); }
/* One square a ball: green for a big ball, yellow for an ordinary one, black for a quick drain. */
export function squares(d) { return (d.perBall || []).map(b => b.score >= 5000 ? '🟩' : b.frames < 20 * 60 && b.score < 1000 ? '⬛' : '🟨'); }
export function scoreText(score) { return score.toLocaleString('en-US'); }
