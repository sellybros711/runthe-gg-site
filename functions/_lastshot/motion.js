/* How bodies move. Pure functions over plain objects: no DOM, no randomness.
 *
 * An offensive player walks a queue of points at a fixed speed. A defender
 * chases a target point with a reaction lag and a top speed, which is what
 * makes him trail a hard cut and lets a screen open a gap. */
import { clampToCourt } from './court-geo.js';

/* Move an offensive player along p.path for dt seconds. Returns true on the
   tick the player reaches the end of a segment. */
export function advanceRunner(p, dt, speed) {
  let left = speed * dt, ended = false;
  const was = { x: p.pos.x, y: p.pos.y };
  while (left > 0 && p.path.length) {
    const t = p.path[0], dx = t.x - p.pos.x, dy = t.y - p.pos.y, d = Math.hypot(dx, dy);
    if (d <= left) { p.pos = { x: t.x, y: t.y }; p.path.shift(); left -= d; ended = true; p.segEnds++; }
    else { p.pos = { x: p.pos.x + dx / d * left, y: p.pos.y + dy / d * left }; left = 0; }
  }
  p.vel = { x: (p.pos.x - was.x) / dt, y: (p.pos.y - was.y) / dt };
  return ended;
}

/* Chase a target with a lag: the defender heads for where his target was a
   moment ago, capped at his top speed. hold (0 to 1) slows him, for a
   defender caught on a screen. */
export function advanceDefender(x, target, dt, speed, lag, hold) {
  const k = Math.min(1, dt / Math.max(dt, lag));
  x.aim = { x: x.aim.x + (target.x - x.aim.x) * k, y: x.aim.y + (target.y - x.aim.y) * k };
  const dx = x.aim.x - x.pos.x, dy = x.aim.y - x.pos.y, d = Math.hypot(dx, dy);
  const step = Math.min(d, speed * (1 - (hold || 0)) * dt);
  const was = x.pos;
  x.pos = d > 1e-9 ? clampToCourt({ x: x.pos.x + dx / d * step, y: x.pos.y + dy / d * step }) : x.pos;
  x.vel = { x: (x.pos.x - was.x) / dt, y: (x.pos.y - was.y) / dt };
}

export const speedOf = b => Math.hypot(b.vel.x, b.vel.y);
