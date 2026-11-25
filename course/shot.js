/* Run The Course: the shot model, and a round with nobody watching.
 *
 * A golfer's hole is played shot by shot. Each shot aims at the next node on
 * the hole's ideal line and lands with a normally distributed side and
 * distance error, a share of the shot's length. The lie changes the next
 * shot. On the green it is putts: one putt from d feet is the tier's
 * constant over d, capped.
 *
 * playRounds() plays N rounds for a skill on a course design with no player
 * present. Course rating and slope, test rounds, idle earnings, visits and
 * league scoring all stand on it later.
 *
 * Works in yards. Pure: no DOM, no clock, and only the maths rng.js allows. */
import { rngNext, rngNormal, dist } from './rng.js?v=1';

/* A hole's geometry in yards, from its map line (world units). */
export function holeGeom(hole, cfg, hazards) {
  const k = cfg.shot.yardsPerUnit;
  const pts = hole.line.map(p => ({ x: p.x * k, y: p.y * k }));
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += dist(pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y);
  return { ord: hole.ord, par: hole.par, pts, yards: Math.round(len), hazards: hazards || hole.hazards || [] };
}

function offLine(pts, x, y) {
  let best = 1e9;
  for (let i = 1; i < pts.length; i++) {
    const ax = pts[i - 1].x, ay = pts[i - 1].y, bx = pts[i].x, by = pts[i].y;
    const vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy;
    let t = l2 > 0 ? ((x - ax) * vx + (y - ay) * vy) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const d = dist(x, y, ax + vx * t, ay + vy * t);
    if (d < best) best = d;
  }
  return best;
}
function hazardAt(hazards, x, y) {
  for (const h of hazards) if (dist(x, y, h.x, h.y) <= h.r) return h;
  return null;
}

/* One golfer, one hole. Returns the strokes, each shot's landing spot (in
   yards, for the picture), the putts and the balls lost. */
export function playHole(S, geom, tier, cfg) {
  const sc = cfg.shot, pts = geom.pts, pin = pts[pts.length - 1];
  let x = pts[0].x, y = pts[0].y, lie = 'tee', seg = 0, strokes = 0, lost = 0, putts = 0;
  const shots = [];
  while (strokes < sc.maxStrokes) {
    const dPin = dist(x, y, pin.x, pin.y);
    if (dPin <= sc.greenR) {
      const feet = dPin * 3 < 1 ? 1 : dPin * 3;
      const p1 = Math.min(sc.puttCap, tier.putt / feet);
      const over = feet - sc.threePutt.from;
      const p3 = over > 0 ? Math.min(0.6, over * sc.threePutt.per * (sc.threePutt.skill / tier.putt)) : 0;
      const r = rngNext(S);
      putts = r < p1 ? 1 : r > 1 - p3 ? 3 : 2;
      strokes += putts;
      break;
    }
    while (seg < pts.length - 2 && dist(x, y, pts[seg + 1].x, pts[seg + 1].y) < 40) seg++;
    const aim = pts[seg + 1];
    const dAim = dist(x, y, aim.x, aim.y);
    let reach = tier.max, err = 1;
    if (lie === 'rough') { reach *= sc.rough.dist; err = sc.rough.error; }
    if (lie === 'bunker') { reach *= sc.bunker.dist; err = sc.bunker.error; }
    strokes++;
    if (lie === 'bunker' && rngNext(S) < tier.bunkerStay) { shots.push({ x, y, lie }); continue; }
    let len = dAim < reach ? dAim : reach;
    if (lie === 'trees' && rngNext(S) < sc.trees.block) { len = Math.min(len, sc.trees.punch); }
    else if (len > sc.shortFrom && rngNext(S) < tier.mishit) len *= sc.mishitDist;
    let sidePct = tier.side * err, distPct = tier.dist * err;
    if (len < sc.shortFrom) { if (sidePct < tier.short) sidePct = tier.short; if (distPct < tier.short) distPct = tier.short; }
    const ux = dAim > 0 ? (aim.x - x) / dAim : 0, uy = dAim > 0 ? (aim.y - y) / dAim : 1;
    const along = len * (1 + rngNormal(S) * distPct), side = len * rngNormal(S) * sidePct;
    const nx = x + ux * along - uy * side, ny = y + uy * along + ux * side;
    const hz = hazardAt(geom.hazards, nx, ny);
    if (hz && hz.type === 'water') {
      /* a penalty stroke, a lost ball, and a drop on the near bank */
      strokes += sc.water.penalty; lost++;
      const dh = dist(x, y, hz.x, hz.y) || 1;
      x = hz.x + (x - hz.x) / dh * (hz.r + 3); y = hz.y + (y - hz.y) / dh * (hz.r + 3);
      lie = 'rough';
      shots.push({ x, y, lie: 'water' });
      continue;
    }
    x = nx; y = ny;
    if (hz) lie = hz.type;
    else if (dist(x, y, pin.x, pin.y) <= sc.greenR) lie = 'green';
    else lie = offLine(pts, x, y) <= sc.fairwayHalf ? 'fairway' : 'rough';
    shots.push({ x, y, lie });
  }
  return { strokes, shots, putts, lost };
}

/* N rounds for one skill tier over a list of hole geometries, nobody present. */
export function playRounds(seed, geoms, tierName, cfg, n) {
  const S = { rng: seed | 0 }, tier = cfg.shot.tiers[tierName];
  let sum = 0, low = 1e9, high = 0, lost = 0;
  const perHole = geoms.map(() => 0);
  for (let r = 0; r < n; r++) {
    let total = 0;
    for (let i = 0; i < geoms.length; i++) {
      const h = playHole(S, geoms[i], tier, cfg);
      total += h.strokes; perHole[i] += h.strokes; lost += h.lost;
    }
    sum += total; if (total < low) low = total; if (total > high) high = total;
  }
  return { rounds: n, average: sum / n, low, high, lostPerRound: lost / n, perHole: perHole.map(v => v / n) };
}

/* The calibration course: a hazard-light par 72. Four par 3s, ten par 4s,
   four par 5s, each a straight line with one landing node. */
export function testCourse(cfg) {
  const k = cfg.shot.yardsPerUnit, out = [];
  const add = (par, yards) => out.push(holeGeom({ ord: out.length + 1, par,
    line: par === 3 ? [{ x: 0, y: 0 }, { x: 0, y: yards / k }]
      : [{ x: 0, y: 0 }, { x: 0, y: yards / k * 0.6 }, { x: 0, y: yards / k }] }, cfg));
  for (let i = 0; i < 18; i++) {
    const m = i % 9;
    if (m === 2 || m === 6) add(3, 150 + (i % 4) * 12);
    else if (m === 4 || m === 8) add(5, 500 + (i % 3) * 15);
    else add(4, 360 + (i % 5) * 14);
  }
  return out;
}
