/* How bodies move. Pure functions over plain objects: no DOM, no randomness,
 * no clock but the dt they are handed, so the sim stays deterministic.
 *
 * AN OFFENSIVE PLAYER runs a queue of drawn points (p.path) like a person,
 * not a cursor: he accelerates from a standstill, tops out a little above the
 * tuned pace, eases off into a sharp corner and rounds it instead of snapping,
 * and brakes into the last point so he plants there. p.path keeps its meaning
 * for the sim (the drawn points still to reach, emptied when he arrives), so
 * the step order and the pass timing read it exactly as before.
 *
 * A DEFENDER chases a target point with a reaction lag (the aim trails the
 * target), which is what makes him trail a hard cut and lets a screen open a
 * gap. Close to his spot he slides in his stance, facing his man. Beaten by
 * more than a few feet he turns and runs, faster, until he has caught up.
 *
 * BODIES do not overlap: separate() pushes defenders out of every other body,
 * so a set screen is a wall a defender has to go around. */
import { clampToCourt } from './court-geo.js';

/* Movement tuning with defaults, so an older scenario object still runs.
   Every key can be set in scenario.js tuning. */
export function moveTuning(T = {}) {
  return {
    sprint: T.runTop ?? 1.32,        // top speed as a share of the tuned pace
    accel: T.runAccel ?? 38,         // ft/s/s from a standstill
    decel: T.runDecel ?? 46,         // ft/s/s braking into a corner or a stop
    grip: T.turnGrip ?? 60,          // ft/s/s of sideways force: how tight a turn is at speed
    cut: T.cornerCut ?? 1.8,         // ft: how far before a joint the runner starts the turn
    creep: 0.9,                      // ft/s: the slowest he arrives, so he always gets there
    slide: T.slideShare ?? 0.8,      // a defender's shuffle speed, as a share of his run
    dAccel: T.defAccel ?? 40,        // a defender's first step, ft/s/s
    beat: T.beatGap ?? 3.2,          // ft behind his aim before a defender turns and runs
    settle: 1.4,                     // ft: back inside this, he squares up and slides again
    body: T.bodyR ?? 0.95            // ft: the radius of a body
  };
}

const unit = (x, y) => { const d = Math.hypot(x, y); return d > 1e-9 ? { x: x / d, y: y / d } : { x: 0, y: 0 }; };
const angleBetween = (a, b) => Math.acos(Math.max(-1, Math.min(1, a.x * b.x + a.y * b.y)));
function rotateToward(h, want, maxRad) {
  const cross = h.x * want.y - h.y * want.x, dot = h.x * want.x + h.y * want.y;
  const ang = Math.atan2(cross, dot);
  if (Math.abs(ang) <= maxRad) return { x: want.x, y: want.y };
  const a = Math.sign(ang) * maxRad, c = Math.cos(a), s = Math.sin(a);
  return { x: h.x * c - h.y * s, y: h.x * s + h.y * c };
}

/* Distance still to run: to the next point, then along the rest. */
export function remaining(p) {
  if (!p.path.length) return 0;
  let d = Math.hypot(p.path[0].x - p.pos.x, p.path[0].y - p.pos.y);
  for (let i = 1; i < p.path.length; i++) d += Math.hypot(p.path[i].x - p.path[i - 1].x, p.path[i].y - p.path[i - 1].y);
  return d;
}

/* Move an offensive player along p.path for dt seconds at a tuned pace of
   speed ft/s. Returns true on a tick he passes one of the drawn points.
   Adds p.spd (scalar speed), p.head (unit heading) and p.from (the last
   point passed) to the player, all plain numbers. */
export function advanceRunner(p, dt, speed, T) {
  const M = moveTuning(T);
  const top = speed * M.sprint;
  const was = { x: p.pos.x, y: p.pos.y };
  let ended = false;
  if (p.spd == null) p.spd = 0;
  if (!p.from || p.routeOf !== p.path) { p.from = { x: p.pos.x, y: p.pos.y }; p.routeOf = p.path; }
  if (!p.path.length) { p.spd = 0; p.vel = { x: 0, y: 0 }; return false; }
  if (!p.head || p.spd < 0.5) {
    // standing: he can face anywhere, so he faces where he is going
    const u = unit(p.path[0].x - p.pos.x, p.path[0].y - p.pos.y);
    if (u.x || u.y) p.head = u;
  }

  // Cut the corner: within cut feet of a joint, start on the next leg.
  const cutOf = () => {
    if (p.path.length < 2) return 0;
    const a = p.from, b = p.path[0], c = p.path[1];
    return Math.min(M.cut, 0.45 * Math.hypot(b.x - a.x, b.y - a.y), 0.45 * Math.hypot(c.x - b.x, c.y - b.y));
  };
  while (p.path.length > 1 && Math.hypot(p.path[0].x - p.pos.x, p.path[0].y - p.pos.y) <= cutOf() + 1e-9) {
    p.from = p.path.shift(); p.routeOf = p.path; ended = true; p.segEnds = (p.segEnds || 0) + 1;
  }

  const t = p.path[0], d = Math.hypot(t.x - p.pos.x, t.y - p.pos.y);
  let want = unit(t.x - p.pos.x, t.y - p.pos.y);
  let cornerV = top, theta = 0;
  if (p.path.length > 1) {
    const n = unit(p.path[1].x - t.x, p.path[1].y - t.y), c = cutOf();
    theta = angleBetween(want, n);
    // a reversal is run at a bit under half speed, a right angle at about two thirds
    cornerV = top * Math.max(0.42, 1 - 0.62 * theta / Math.PI);
    // lean into the next leg as the joint comes up
    // (never on a hairpin: leaning away from the point there would circle it)
    const w = Math.max(0, Math.min(1, 1 - (d - c) / Math.max(0.5, c * 1.5))) * 0.55 * Math.max(0, 1 - theta / (0.75 * Math.PI));
    if (w > 0) want = unit(want.x * (1 - w) + n.x * w, want.y * (1 - w) + n.y * w);
  }

  // Turn: tight at a walk, wide at a sprint.
  const turnRate = M.grip / Math.max(p.spd, 2.5);
  p.head = rotateToward(p.head || want, want, turnRate * dt);
  const err = angleBetween(p.head, want);

  // How fast he may go right now.
  let vMax = top;
  vMax = Math.min(vMax, Math.sqrt(2 * M.decel * remaining(p)) + M.creep);                  // plant at the end
  if (p.path.length > 1) vMax = Math.min(vMax, Math.sqrt(cornerV * cornerV + 2 * M.decel * Math.max(0, d - cutOf())));
  vMax *= Math.max(0.12, Math.cos(Math.min(err, Math.PI / 2)));                            // facing the wrong way: turn first
  const up = M.accel * (1 - 0.45 * p.spd / Math.max(top, 1));
  p.spd = vMax > p.spd ? Math.min(vMax, p.spd + up * dt) : Math.max(vMax, p.spd - 2 * M.decel * dt);

  const step = p.spd * dt;
  if (step >= d - 1e-9 || (p.path.length === 1 && d < 0.06)) {
    p.pos = { x: t.x, y: t.y };
    p.from = p.path.shift(); p.routeOf = p.path; ended = true; p.segEnds = (p.segEnds || 0) + 1;
  } else {
    p.pos = { x: p.pos.x + p.head.x * step, y: p.pos.y + p.head.y * step };
  }
  if (!p.path.length) p.spd = Math.min(p.spd, M.creep);
  p.vel = { x: (p.pos.x - was.x) / dt, y: (p.pos.y - was.y) / dt };
  return ended;
}

/* Chase a target with a lag: the defender heads for where his target was a
   moment ago. hold (0 to 1) slows him, for a defender caught on a screen.
   T is the tuning (for the movement keys); omitted, the defaults apply.
   Adds x.run (true while he has turned to run) and x.spd. */
export function advanceDefender(x, target, dt, speed, lag, hold, T) {
  const M = moveTuning(T);
  const k = Math.min(1, dt / Math.max(dt, lag));
  x.aim = { x: x.aim.x + (target.x - x.aim.x) * k, y: x.aim.y + (target.y - x.aim.y) * k };
  const dx = x.aim.x - x.pos.x, dy = x.aim.y - x.pos.y, d = Math.hypot(dx, dy);
  if (!x.vel) x.vel = { x: 0, y: 0 };
  if (d > M.beat) x.run = true;
  else if (d < M.settle) x.run = false;
  const top = speed * (x.run ? 1 : M.slide) * (1 - (hold || 0));
  // arrive: ease off as the spot comes up, so he does not overshoot and wobble
  const vWant = Math.min(top, Math.sqrt(2 * M.dAccel * 0.8 * d));
  const u = unit(dx, dy);
  const gx = u.x * vWant - x.vel.x, gy = u.y * vWant - x.vel.y, g = Math.hypot(gx, gy);
  const most = M.dAccel * dt;
  const f = g > most ? most / g : 1;
  x.vel = { x: x.vel.x + gx * f, y: x.vel.y + gy * f };
  const was = x.pos;
  x.pos = clampToCourt({ x: x.pos.x + x.vel.x * dt, y: x.pos.y + x.vel.y * dt });
  x.vel = { x: (x.pos.x - was.x) / dt, y: (x.pos.y - was.y) / dt };
  x.spd = Math.hypot(x.vel.x, x.vel.y);
}

/* Where a defender caught on a screen is stuck: pressed against the
   screener's body, on the side he came from. */
export function pinBehind(x, screener, T) {
  const M = moveTuning(T);
  const u = unit(x.pos.x - screener.x, x.pos.y - screener.y);
  const v = u.x || u.y ? u : { x: 0, y: 1 };
  return { x: screener.x + v.x * (2 * M.body + 0.05), y: screener.y + v.y * (2 * M.body + 0.05) };
}

/* No two bodies in one place. Offensive players run their routes and do not
   give way, so a set screen is a wall; a defender is pushed out of any body
   he overlaps, and two defenders share the push. Deterministic: a fixed
   order, a fixed number of passes. */
export function separate(offense, defense, T) {
  const M = moveTuning(T), min = 2 * M.body;
  for (let pass = 0; pass < 2; pass++) {
    for (const x of defense) {
      for (const o of offense) {
        const dx = x.pos.x - o.pos.x, dy = x.pos.y - o.pos.y, d = Math.hypot(dx, dy);
        if (d >= min) continue;
        const u = d > 1e-6 ? { x: dx / d, y: dy / d } : { x: 0, y: 1 };
        x.pos = clampToCourt({ x: o.pos.x + u.x * min, y: o.pos.y + u.y * min });
      }
    }
    for (let i = 0; i < defense.length; i++) for (let j = i + 1; j < defense.length; j++) {
      const a = defense[i], b = defense[j];
      const dx = b.pos.x - a.pos.x, dy = b.pos.y - a.pos.y, d = Math.hypot(dx, dy);
      if (d >= min) continue;
      const u = d > 1e-6 ? { x: dx / d, y: dy / d } : { x: 1, y: 0 }, push = (min - d) / 2;
      a.pos = clampToCourt({ x: a.pos.x - u.x * push, y: a.pos.y - u.y * push });
      b.pos = clampToCourt({ x: b.pos.x + u.x * push, y: b.pos.y + u.y * push });
    }
  }
}

/* Turn a facing angle (radians) toward another at no more than rate rad/s. */
export function turnFace(cur, want, rate, dt) {
  if (cur == null) return want;
  let a = want - cur;
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  const m = rate * dt;
  return cur + Math.max(-m, Math.min(m, a));
}

export const speedOf = b => Math.hypot(b.vel.x, b.vel.y);
