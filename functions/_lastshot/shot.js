/* SHOT QUALITY. Four things, multiplied:
 *
 *   base     the shooter's make rate for the zone (rim, two, three), open and
 *            set, from his archetype (scenario.js)
 *   contest  distance to the nearest defender at release, read off a table
 *            at 0, 2, 4 and 6 feet (6 or more is open). At the rim the
 *            defender's size counts: a C at the rim on a guard is a wall, a
 *            guard switched onto a C is a speed bump.
 *   moving   a pull up off the dribble is worse than a catch and shoot, a
 *            catch on the run a little worse; a layup on the move is not
 *   bailout  a shot forced up at the bail-out mark is worse again
 *
 * The product is clamped to [minMake, maxMake] and rolled once by the sim. */
import { zoneOf, dist } from './court-geo.js';

/* Piecewise linear over [0, 2, 4, 6] feet. */
export function contestOf(d, table) {
  const t = table || [0.68, 0.78, 0.9, 1.0];
  if (d >= 6) return t[3];
  const i = Math.max(0, Math.min(2, Math.floor(d / 2))), k = Math.max(0, d - i * 2) / 2;
  return t[i] + (t[i + 1] - t[i]) * k;
}

export function nearestDefender(pos, defenders) {
  let best = Infinity, who = null, arch = null;
  for (const x of defenders) { const d = dist(pos, x.pos); if (d < best) { best = d; who = x.id; arch = x.arch || null; } }
  return { d: best, who, arch };
}

/* shooter: { pos, arch, pullup, running }. defenders: [{ id, pos, arch }].
   Returns everything the result screen needs. */
export function shotQuality(sc, shooter, defenders, bailout) {
  const T = sc.tuning, A = sc.archetypes[shooter.arch];
  const zone = zoneOf(shooter.pos);
  const near = nearestDefender(shooter.pos, defenders);
  const base = A[zone];
  let contest;
  if (zone === 'rim') {
    const f = contestOf(near.d, T.contestRim);
    const edge = ((T.size && T.size[near.arch]) || 3) - ((T.size && T.size[shooter.arch]) || 3);
    const k = Math.max(0.35, Math.min(1.6, 1 + (T.sizeEdge ?? 0.18) * edge));
    contest = 1 - (1 - f) * k;
  } else contest = contestOf(near.d, T.contestJumper);
  const pullup = !!shooter.pullup && zone !== 'rim', running = !!shooter.running && !pullup && zone !== 'rim';
  const mov = pullup ? (zone === 'three' ? T.pullupThree : T.pullupTwo) : running ? (zone === 'three' ? T.runningThree : T.runningTwo) : 1;
  const bail = bailout ? T.bailout : 1;
  const p = Math.max(T.minMake, Math.min(T.maxMake, base * contest * mov * bail));
  return { zone, points: zone === 'three' ? 3 : 2, open: near.d, by: near.who, byArch: near.arch, moving: pullup || running, pullup, running, bailout: !!bailout, base, contest, p };
}

/* A short word for how open the shot was, used in captions and the reason. */
export function openWord(d) {
  if (d >= 6) return 'wide open';
  if (d >= 4) return 'open';
  if (d >= 2) return 'a hand up';
  return 'contested';
}
