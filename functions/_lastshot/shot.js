/* SHOT QUALITY. Four things, multiplied:
 *
 *   base     the shooter's make rate for the zone (rim, two, three), open and set
 *   contest  distance to the nearest defender at release, from contestMin
 *            (within contestFrom feet) to contestMax (openAt feet or more)
 *   moving   a jumper on the move is worse; a layup on the move is not
 *   bailout  a shot forced up at the bail-out mark is worse again
 *
 * The product is clamped to [minMake, maxMake] and rolled once. */
import { zoneOf, dist } from './court-geo.js';

export function contestOf(d, T) {
  const f = Math.max(0, Math.min(1, (d - T.contestFrom) / (T.openAt - T.contestFrom)));
  return T.contestMin + (T.contestMax - T.contestMin) * f;
}

export function nearestDefender(pos, defenders) {
  let best = Infinity, who = null;
  for (const x of defenders) { const d = dist(pos, x.pos); if (d < best) { best = d; who = x.id; } }
  return { d: best, who };
}

/* shooter: { pos, arch, speed }. Returns everything the result screen needs. */
export function shotQuality(sc, shooter, defenders, bailout) {
  const T = sc.tuning, A = sc.archetypes[shooter.arch];
  const zone = zoneOf(shooter.pos);
  const near = nearestDefender(shooter.pos, defenders);
  const moving = shooter.speed >= T.movingAt;
  const base = A[zone];
  const contest = contestOf(near.d, T);
  const mov = moving ? (zone === 'three' ? T.movingThree : zone === 'two' ? T.movingTwo : T.movingRim) : 1;
  const bail = bailout ? T.bailout : 1;
  const p = Math.max(T.minMake, Math.min(T.maxMake, base * contest * mov * bail));
  return { zone, points: zone === 'three' ? 3 : 2, open: near.d, by: near.who, moving, bailout: !!bailout, base, contest, p };
}

/* A short word for how open the shot was, used in captions and the reason. */
export function openWord(d) {
  if (d >= 6) return 'wide open';
  if (d >= 4) return 'open';
  if (d >= 2.5) return 'a hand up';
  return 'contested';
}
