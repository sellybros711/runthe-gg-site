/* A foul ball, off the bat to where it ends: the shape the scene draws it in, and its flight through
 * the park (the ground, the backstop's padding and net, the low wall down each line and the net along
 * it past the dugouts, the dugouts and the seats). Pure: no three.js, no clock, no Math.random, so a node check
 * (lab/pipeline/check-foul.mjs) runs every foul the engine calls through exactly what the scene draws.
 *
 * The engine says only that the pitch was fouled off (pr.result 'foul': no batted ball rides on it,
 * CONTRACT.md section 6), so the scene picks the shape, and picks it from what the call already
 * carries: an FNV-1a hash of the drawn pitch's id and the pitch's number in the outing, never a draw,
 * so a replay fouls it off the same way. Four shapes:
 *
 *   back     straight back, a liner into the backstop net (or just over it into the seats)
 *   pop      popped up behind, high over the net into the seats behind the plate
 *   pulled   met early, pulled hard foul past third (a right handed hitter) or first (a lefty),
 *            on the ground or in the air, into the low wall or over it into the stands
 *   sliced   met late, sliced foul the other way, curling further foul into the stands
 *
 * Where the pitch is tilts the pick, as a hitter's timing does: a pitch inside is met early and more
 * often pulled, one away is met late and more often sliced the other way. Every shape leaves the bat
 * at least 16 degrees foul of the line (or behind the plate) and curls only further foul, so the ball
 * is in foul ground a few feet out of the plate and stays there (check-foul.mjs holds it to that).
 *
 * Units: feet and seconds, catcher's view (x toward first base, y out to centre field, z up), home
 * plate's back point at the origin. Spray in degrees from centre field, + toward right field.
 */

const D2R = Math.PI / 180;
const MPH = 1.46667;
export const BALL_R = 0.12;
// the park's foul ground (ballpark.js, stands.js): the backstop 56 ft behind the plate, its padding
// 5 ft and the net over it to 37 ft on the arc within 54.4 degrees of straight back (stands.js, 34 x
// 1.6 degrees); elsewhere the low wall 4 ft, open below 3.4 ft at the dugouts; the seats rise half a
// foot a foot behind the wall
export const BACKSTOP = 56;
export const PAD_H = 5, NET_H = 37, NET_ARC = 180 - 34 * 1.6;
export const WALL_LOW = 4, DUGOUT = [76, 100], DUGOUT_H = 3.4, SEAT_RISE = 0.5;
/* THE NETTING (the owner, 2026-11-05: "there needs to be a net that protects the fans from foul balls
   like a real stadium"). As in every MLB park since 2020, the backstop net is carried on along both lines
   past the far end of each dugout (to NET_TO degrees from centre field, the dugouts end at 76), on top
   of the low wall, a fine dark mesh on thin poles with a cable along its top. Its top falls from the
   backstop's NET_H to NET_END at its far end (netTop). A ball that meets it below the top drops dead
   off it to the ground in front; one above it flies on into the seats. ballpark.js draws it from netTop,
   so the ball and the net are one surface. */
export const NET_TO = 70, NET_END = 26, NET_DUG = 32;
/** The top of the low wall (or the backstop's padding) at |th| = a degrees: 4 ft down the lines, rising
    to the padding's 5 ft round the backstop (ballpark.js draws the wall and the seats on it). */
export function frontTop(a) {
  a = Math.abs(a);
  if (a >= NET_ARC) return PAD_H;
  const k = Math.max(0, Math.min(1, (a - 110) / (NET_ARC - 110)));
  return WALL_LOW + (PAD_H - WALL_LOW) * k * k * (3 - 2 * k);
}
/** The top of the net at |th| = a degrees (feet up from the field), or 0 where there is none. */
export function netTop(a) {
  a = Math.abs(a);
  if (a < NET_TO) return 0;
  if (a >= NET_ARC) return NET_H;
  // the far end to the plate end of the dugout, then up to the backstop's height
  if (a <= DUGOUT[1]) return NET_END + (NET_DUG - NET_END) * (a - NET_TO) / (DUGOUT[1] - NET_TO);
  const k = (a - DUGOUT[1]) / (NET_ARC - DUGOUT[1]);
  return NET_DUG + (NET_H - NET_DUG) * k * k * (3 - 2 * k);
}

/** The front of the stands past the foul lines (|th| > 45 degrees from centre field): the low wall
    45 ft off each line, no further than 330 ft, swung round to the backstop from 100 to 128 degrees.
    ballpark.js frontAt draws its wall here, so the ball and the wall are one line. */
export function foulFront(th) {
  const a = Math.abs(th);
  const line = 45 / Math.sin((a - 45) * D2R || 1e-3);
  const d = Math.min(330, line);
  const k = a <= 100 ? 0 : a >= 128 ? 1 : ((a - 100) / 28) ** 2 * (3 - 2 * (a - 100) / 28);
  return d + (BACKSTOP - d) * k;
}

/** Foul ground: behind the plate's back point or outside the lines (x and y in feet). */
export const isFoul = (x, y) => y < 0 || Math.abs(x) > y;

/** FNV-1a of a string, then MurmurHash3's finaliser (FNV alone barely moves its high bits for ids
    that differ in one character): the picks that must replay the same. */
export function hashStr(s) {
  let h = 2166136261;
  for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return h >>> 0;
}

export const SHAPES = ['back', 'pop', 'pulled', 'sliced'];
// each shape's launch: exit velocity (mph), launch angle and the angle foul (degrees; for back and
// pop, off straight back), each a range a hash spreads over; curl, the sideways pull of the spin
// (ft/s^2, always further foul)
const LAUNCH = {
  back: { ev: [72, 90], la: [18, 40], off: [0, 22], curl: [0, 0] },
  pop: { ev: [58, 70], la: [48, 62], off: [14, 50], curl: [0, 4] },
  pulled: { ev: [82, 100], la: [-6, 24], foul: [17, 50], curl: [6, 14] },
  sliced: { ev: [70, 88], la: [10, 36], foul: [16, 44], curl: [8, 16] },
};

/** The foul's shape and launch: { shape, ev, la, spray, curl, shift }.
      id     the drawn pitch's id (pr.drawn.id), else anything fixed for the call
      n      the pitch's number in the outing (pr.n)
      x      where it crossed, catcher's view feet (pr.actual.x)
      bats   'L' or 'R' (the hitter's side as the scene stands him)
      shape  a shape to force (the lab's &foul=, or foul_back)
    shift is when it is met against the plain contact (seconds: early to pull, late to slice). */
export function foulLaunch({ id, n, x, bats, shape }) {
  const lefty = bats === 'L', pull = lefty ? 1 : -1;
  const key = `${id ?? '-'}:${n ?? 0}`;
  const u = (salt) => hashStr(`${key}:${salt}`) / 4294967296;
  // inside to him is toward his side of the plate (a righty stands on the third base side, x < 0)
  const ins = Math.max(-1, Math.min(1, ((lefty ? 1 : -1) * (Number.isFinite(x) ? x : 0)) / 0.8));
  if (!SHAPES.includes(shape)) {
    const w = { back: 0.34, pop: 0.14, pulled: 0.26 + 0.14 * ins, sliced: 0.26 - 0.14 * ins };
    let r = u('shape');
    shape = 'sliced';
    for (const s of SHAPES) { if (r < w[s]) { shape = s; break; } r -= w[s]; }
  }
  const L = LAUNCH[shape], at = (rg, salt) => rg[0] + (rg[1] - rg[0]) * u(salt);
  const ev = at(L.ev, 'ev'), la = at(L.la, 'la'), curl = at(L.curl, 'curl');
  let spray;
  if (shape === 'back' || shape === 'pop') {
    // straight back drifts to either side; a pop up behind drifts the other way from his pull
    const side = shape === 'pop' ? -pull : (u('side') < 0.5 ? -1 : 1);
    spray = side * (180 - at(L.off, 'off'));
  } else {
    const side = shape === 'pulled' ? pull : -pull;
    spray = side * (45 + at(L.foul, 'foul'));
  }
  const shift = shape === 'pulled' ? -0.045 : 0.004;
  return { shape, ev: r1(ev), la: r1(la), spray: r1(spray), curl: r1(curl), shift };
}
const r1 = (v) => Math.round(v * 10) / 10;

/* THE FLIGHT. Stepped at 1/480 s from the contact point c (catcher's view feet) for SPAN seconds, kept
   every other step: air drag (the speed falls about a third over two seconds, as pitch.js afterAt),
   gravity, the spin's curl sideways (further foul), and the park: it bounces on the ground lower each
   time and then rolls; it comes off the padding or drops dead off the net; at a dugout below its roof
   it goes in and stops; over the wall it flies on until it comes down on the seats, and stops there. */
export const SPAN = 4, STEP = 1 / 480;
const K_DRAG = 0.2;

/** The flight: { dt, n, xyz: Float32Array (x, y, z per sample), hits: [{ t, what }], end } */
export function foulFlight(c, launch) {
  const v = launch.ev * MPH, la = launch.la * D2R, sp = launch.spray * D2R;
  let x = c.x, y = c.y, z = Math.max(BALL_R, c.z);
  let vx = v * Math.cos(la) * Math.sin(sp), vy = v * Math.cos(la) * Math.cos(sp), vz = v * Math.sin(la);
  // the curl pushes it further foul: sideways to its way, away from the field
  const out = Math.sign(launch.spray) || 1;
  const N = Math.round(SPAN / STEP);
  const keep = 2, xyz = new Float32Array((N / keep + 1) * 3);
  const hits = [];
  let state = 'air', front = null, k = 0, netted = false;
  const put = () => { xyz[k * 3] = x; xyz[k * 3 + 1] = y; xyz[k * 3 + 2] = z; k++; };
  put();
  for (let i = 1; i <= N; i++) {
    const t = i * STEP;
    if (state === 'air' || state === 'over' || state === 'ground') {
      const h = Math.hypot(vx, vy);
      if (h > 1e-6 && launch.curl && state !== 'ground') {
        // perpendicular to the way it goes, on the foul side
        const px = vy / h, py = -vx / h;
        vx += out * px * launch.curl * STEP; vy += out * py * launch.curl * STEP;
      }
      const dragK = Math.exp(-K_DRAG * STEP);
      vx *= dragK; vy *= dragK; vz *= dragK;
      if (state === 'ground') {
        // rolling: the grass slows it
        const s = Math.hypot(vx, vy), f = Math.max(0, s - 9 * STEP) / (s || 1);
        vx *= f; vy *= f; vz = 0;
      } else vz -= 32.17 * STEP;
      const px0 = x, py0 = y, pz0 = z;
      x += vx * STEP; y += vy * STEP; z += vz * STEP;
      // the ground
      if (state !== 'over' && z < BALL_R) {
        z = BALL_R;
        if (vz < -2.5) { vz = -vz * 0.36; vx *= 0.82; vy *= 0.82; hits.push({ t, what: 'ground' }); }
        else { vz = 0; if (state === 'air') { state = 'ground'; hits.push({ t, what: 'roll' }); } }
      }
      // the front of the stands
      const r = Math.hypot(x, y), th = Math.atan2(x, y) / D2R;
      if (state !== 'over' && Math.abs(th) > 45 && r >= foulFront(th)) {
        const a = Math.abs(th), wallTop = frontTop(a), nt = netTop(a);
        // (a ball already off the net and dropping down it, at its far end: the end pole and the net's
        // edge, wrapped round it, still hold it)
        const top = Math.max(wallTop, nt, netted && a >= NET_TO - 4 ? NET_END : 0), onNet = z > wallTop;
        if (a < NET_ARC && a >= DUGOUT[0] && a <= DUGOUT[1] && z < DUGOUT_H) {
          // into the dugout, under its roof: it drops in and is gone
          x = px0; y = py0; z = pz0; state = 'dugout'; hits.push({ t, what: 'dugout' });
        } else if (z < top) {
          // off the padding, or into the net, which gives and takes nearly all of it: it drops down the
          // face of the net to the ground in front
          const e = onNet ? 0.1 : 0.32;
          const g = frontNormal(th, r);
          const vn = vx * g.x + vy * g.y;
          // (a ball already dropping down its face only brushes it again: nothing more is taken off it)
          const blow = vn > 4;
          if (vn > 0) { vx -= (1 + e) * vn * g.x; vy -= (1 + e) * vn * g.y; if (blow) { vx *= onNet ? 0.1 : 0.6; vy *= onNet ? 0.1 : 0.6; vz = onNet ? Math.min(vz * 0.2, 0) : vz * 0.8; } }
          x = px0 - g.x * 0.05; y = py0 - g.y * 0.05;
          if (blow) hits.push({ t, what: onNet ? 'net' : 'wall' });
          if (onNet) netted = true;
        } else { state = 'over'; front = { th, r }; hits.push({ t, what: 'over' }); }
      }
      if (state === 'over') {
        // over the wall: down on the seats, which rise behind it
        const r2 = Math.hypot(x, y), th2 = Math.atan2(x, y) / D2R;
        const f0 = foulFront(th2), wallTop = frontTop(th2);
        const seat = wallTop + SEAT_RISE * Math.max(0, r2 - f0);
        if (z < seat) { z = seat; state = 'seats'; hits.push({ t, what: 'seats' }); }
      }
    }
    if (i % keep === 0) put();
  }
  void front;
  return { dt: STEP * keep, n: k, xyz, hits, end: state };
}

/** The front's outward normal at (th, r), on the ground plane. */
function frontNormal(th, r) {
  // f(x, y) = |p| - front(angle of p), its gradient by a small step either way
  const f = (px, py) => Math.hypot(px, py) - foulFront(Math.atan2(px, py) / D2R);
  const px = r * Math.sin(th * D2R), py = r * Math.cos(th * D2R), e = 0.05;
  const gx = (f(px + e, py) - f(px - e, py)) / (2 * e), gy = (f(px, py + e) - f(px, py - e)) / (2 * e);
  const L = Math.hypot(gx, gy) || 1;
  return { x: gx / L, y: gy / L };
}

/** Where the foul is dt seconds after contact (catcher's view feet), held at its last point. */
export function foulAt(fl, dt, out = { x: 0, y: 0, z: 0 }) {
  const f = Math.max(0, dt) / fl.dt, i = Math.min(fl.n - 1, Math.floor(f)), j = Math.min(fl.n - 1, i + 1), w = Math.min(1, f - i);
  const a = fl.xyz;
  out.x = a[i * 3] + (a[j * 3] - a[i * 3]) * w;
  out.y = a[i * 3 + 1] + (a[j * 3 + 1] - a[i * 3 + 1]) * w;
  out.z = a[i * 3 + 2] + (a[j * 3 + 2] - a[i * 3 + 2]) * w;
  return out;
}
