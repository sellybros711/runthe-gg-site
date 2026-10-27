/* The ball in play, planned before a frame is drawn: where the ball goes, who fields it, every
 * throw, every runner, and the cut of the broadcast that shows it. Pure: no three.js, no clock, no
 * Math.random. The same PitchResult always plans the same play (a node check runs it on every pack).
 *
 * The engine decides the play (CONTRACT.md section 6): the real batted ball (bb, ev, la, spray),
 * the result label (single ... home_run, out, double_play, sac_fly, fielders_choice, error) and the
 * runners' moves (0 the batter, 1..3 the bases, 4 scored, -1 put out). This file only stages it.
 * The spray is kept as measured (a hit stays fair). The distance is an estimate from exit velocity
 * and launch angle (a drag and lift flight, constants set to Statcast carry: 100 mph at 28 degrees
 * goes about 390 ft), held to the band the result needs: an out in the air is caught, a single
 * falls in front of the outfield or through the infield, a double reaches a gap or the line, a home
 * run clears the wall. Where the fielders stand is ours (no positioning data): a fielder who would
 * catch a ball the engine called a hit starts a step further off, and one who must make a catch
 * starts close enough to make it.
 *
 * Units: feet and seconds, catcher's view (x toward first base, y out to centre field, z up), home
 * plate at the origin, s = seconds after contact.
 *
 *   const p = planPlay(pr, { bats, contact, basesBefore, id })
 *   p.ballAt(s)        { x, y, z, by }    by: the fielder holding it, or null
 *   p.fielders[n]      a Track for positions 1..9 (scoring numbers), p.runners[] the same for runners
 *   p.events           [{ s, kind, ... }] catches, pickups, throws, outs, runs, crowd cues
 *   p.edit             the broadcast cut: [{ s0, s1, cam, rate }] in scene seconds, played in order
 *   p.outcome          what the plan shows, for the checks (verify() compares it with the engine)
 */

const D2R = Math.PI / 180, G = 32.17;
// drag and lift per foot, and the launch angles the lift works over (it rises from LIFT_LO over 14
// degrees and falls to nothing at LIFT_HI over LIFT_FALL): fitted (2026-10-27) to the Statcast carry fit
// the engine uses (contract.js carryOf, R2 0.94) over exit velocity 60-115 mph and launch angle 8-70
// degrees, 188 balls: 11.9 ft rms against it, where the old drag and lift (0.0019, 0.001, tuned on one
// 100 mph ball at 28 degrees) were 43.7 ft, every ball long (93 mph at 16 degrees: 292 ft, Statcast 259)
const KD = 0.002313, KL = 0.001552, LIFT_LO = 11.25, LIFT_HI = 80, LIFT_FALL = 10;
export const BALL_R = 0.12;
export const WALL_H = 8;
export const BASE = [{ x: 0, y: 0 }, { x: 63.64, y: 63.64 }, { x: 0, y: 127.28 }, { x: -63.64, y: 63.64 }, { x: 0, y: 0 }];
export const MOUND = { x: 0, y: 60.5 };
export const NAME = { 1: 'P', 2: 'C', 3: '1B', 4: '2B', 5: '3B', 6: 'SS', 7: 'LF', 8: 'CF', 9: 'RF' };
const OF = [7, 8, 9], IF = [3, 4, 5, 6];
const HITS = { single: 1, double: 2, triple: 3, home_run: 4 };

/** The outfield wall, feet from home at a spray angle: 330 down the lines, 400 to centre. */
export function wallDist(spray) {
  const a = Math.min(1, Math.abs(spray) / 45);
  return 330 + 70 * (1 - Math.pow(a, 1.6));
}
export const pol = (deg, r) => ({ x: r * Math.sin(deg * D2R), y: r * Math.cos(deg * D2R) });
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const sprayOf = (p) => Math.atan2(p.x, p.y) / D2R;
const rad = (p) => Math.hypot(p.x, p.y);
const lerp = (a, b, k) => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** FNV-1a of a string: the picks that must replay the same (never the engine's stream). */
function hash(s) { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function rnd(id, k) { return (hash(id + ':' + k) % 10007) / 10007; }

/** Where the nine stand at the pitch (generic depths; a small turn toward the hitter's pull side). */
export function spots(bats) {
  const pull = bats === 'L' ? 4 : -4;
  return {
    1: { x: 0, y: 56 }, 2: { x: 0, y: -2.85 },
    3: pol(37 + pull * 0.3, 108), 4: pol(13 + pull, 148), 5: pol(-36 + pull * 0.3, 110), 6: pol(-13 + pull, 148),
    7: pol(-28 + pull, 285), 8: pol(0 + pull, 315), 9: pol(28 + pull, 285),
  };
}

/* ------------------------------------------------------------------ motion along a path */

/** How long a run of d feet takes, top speed v, acceleration a, from rest and/or to rest. */
function runTime(d, v, a, fromRest, toRest) {
  const ta = v / a, k = (fromRest ? 1 : 0) + (toRest ? 1 : 0);
  if (!k) return d / v;
  const dRamp = k * 0.5 * v * ta;
  if (d >= dRamp) return d / v + k * ta / 2;
  // never reaches top speed: a triangle (or a half one)
  return k === 2 ? 2 * Math.sqrt(d / a) : Math.sqrt(2 * d / a);
}

/** The share of a leg covered at share tau of its time: ramps of share al (start) and be (end). */
function along(tau, al, be) {
  tau = clamp(tau, 0, 1);
  const A = 1 - al / 2 - be / 2;
  let s;
  if (tau < al) s = 0.5 * tau * tau / al;
  else if (tau <= 1 - be) s = al / 2 + (tau - al);
  else { const r = 1 - tau; s = A - 0.5 * r * r / be; }
  return clamp(s / A, 0, 1);
}
function speedShare(tau, al, be) {
  const A = 1 - al / 2 - be / 2;
  const v = tau < al ? tau / al : tau > 1 - be ? (1 - tau) / be : 1;
  return v / A;
}

/** A figure's path: legs of movement and the actions on it. Pure functions of s. */
// a run at full speed pulled up short of a wait pulls up over this long (seconds, Track.settle)
const STOP_S = 0.3;

export class Track {
  constructor(at, opts = {}) {
    this.start = { x: at.x, y: at.y };
    this.legs = [];
    this.acts = [];
    this.v = opts.v ?? 24; this.a = opts.a ?? 18;
    this.face0 = opts.face ?? null;
  }
  get end() { const l = this.legs[this.legs.length - 1]; return l ? l.b : this.start; }
  get free() { const l = this.legs[this.legs.length - 1]; return l ? l.t1 : -Infinity; }
  /** Run through the points (no stop between them) starting at t0; returns the arrival time. */
  run(t0, pts, o = {}) {
    const v = o.v ?? this.v, a = o.a ?? this.a;
    if (this.legs.length) t0 = Math.max(t0, this.free);
    let from = this.end;
    const fromRest = o.fromRest ?? true, toRest = o.toRest ?? true;
    const seg = []; let total = 0;
    for (const p of pts) { const d = dist(from, p); if (d > 1e-3) { seg.push([from, p, d]); total += d; } from = p; }
    if (!seg.length) return t0;
    const T = runTime(total, v, a, fromRest, toRest);
    const ta = Math.min(v / a, T / (fromRest && toRest ? 2 : 1));
    const al = fromRest ? ta / T : 0, be = toRest ? ta / T : 0;
    const group = { t0, T, total, al, be };
    let acc = 0;
    for (const [p, q, d] of seg) { this.legs.push({ t0, t1: t0 + T, a: p, b: q, f0: acc / total, f1: (acc + d) / total, g: group, d }); acc += d; }
    return t0 + T;
  }
  /** Arrive at p exactly at time t1 (a slower run if there is time to spare), leaving no sooner than t0. */
  arrive(t0, p, t1, o = {}) {
    if (this.legs.length) t0 = Math.max(t0, this.free);
    const d = dist(this.end, p);
    const v = o.v ?? this.v;
    const fast = runTime(d, v, this.a, true, o.toRest ?? true);
    if (t1 - t0 <= fast) {
      // no time to pull up: he runs through the spot (arriving at full speed)
      if (o.toRest !== false && t1 - t0 < fast) return this.run(t0, [p], { ...o, toRest: false });
      return this.run(t0, [p], o);
    }
    // find the top speed that takes exactly t1 - t0 (bisection; runTime falls with v)
    let lo = 1, hi = v;
    for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (runTime(d, m, this.a, true, o.toRest ?? true) > t1 - t0) lo = m; else hi = m; }
    return this.run(t0, [p], { ...o, v: hi });
  }
  /** A run that ends at full speed with nothing straight on after it (a wait, or a run that starts
      from rest) pulls up over its last STOP_S instead, in the same time to the same spot: from full
      speed to standing in one frame was a pop of the whole body (lab/pipeline/check-jolt.mjs). The
      last run is left as it is: past it the bodies carry on and slow by themselves. */
  settle() {
    const groups = [...new Set(this.legs.map((l) => l.g))];
    for (let i = 0; i < groups.length - 1; i++) {
      const g = groups[i], nx = groups[i + 1];
      if (g.be > 0 || (nx.t0 < g.t0 + g.T + 0.02 && nx.al === 0)) continue;
      // (its top speed rises to fit the stop into the same time, by no more than a sixth)
      g.be = Math.min(STOP_S / g.T, 2 * (1 - g.al / 2) * (1 - 1 / 1.15));
    }
  }
  /** Stay where he is until t (whatever comes next starts no sooner). */
  hold(t) { const e = this.end; if (t > this.free) this.run(t, [{ x: e.x + 0.02, y: e.y }], { v: 1 }); }
  act(t, kind, extra = {}) { this.acts.push({ t, kind, ...extra }); this.acts.sort((a, b) => a.t - b.t); return t; }
  /** Position, speed (ft/s), heading (radians, 0 = +y, toward +x positive) and distance run so far. */
  at(s) {
    let pos = this.start, spd = 0, head = null, run = 0;
    const groups = new Set();
    for (const l of this.legs) {
      if (s < l.t0) break;
      const g = l.g, tau = (s - g.t0) / g.T, f = along(tau, g.al, g.be);
      if (!groups.has(g)) { groups.add(g); run += g.total * f; }
      if (f >= l.f0 - 1e-9 && (f <= l.f1 + 1e-9 || s >= l.t1)) {
        const k = l.f1 > l.f0 ? clamp((f - l.f0) / (l.f1 - l.f0), 0, 1) : 1;
        pos = lerp(l.a, l.b, k);
        if (tau < 1) { spd = g.total / g.T * speedShare(tau, g.al, g.be); head = Math.atan2(l.b.x - l.a.x, l.b.y - l.a.y); }
        else { spd = 0; head = Math.atan2(l.b.x - l.a.x, l.b.y - l.a.y); }
      } else if (s >= l.t1) { pos = l.b; head = Math.atan2(l.b.x - l.a.x, l.b.y - l.a.y); }
    }
    return { x: pos.x, y: pos.y, spd, head, run };
  }
  /** The last action at or before s (and the next one), for the poses. */
  actAt(s) {
    let prev = null, next = null;
    for (const a of this.acts) { if (a.t <= s) prev = a; else { next = a; break; } }
    return { prev, next };
  }
}

/* ------------------------------------------------------------------ the ball */

/** The ball in the air: drag and backspin lift (none on a low liner), sampled each 1/120 s until it
    lands, or meets the wall (off it below WALL_H, over it above). */
function simAir(v, la, spray, z0, scale = 1, stopAt = null) {
  const dt = 1 / 120, lift = clamp((la - LIFT_LO) / 14, 0, 1) * clamp((LIFT_HI - la) / LIFT_FALL, 0, 1) * KL;
  const u = { x: Math.sin(spray * D2R), y: Math.cos(spray * D2R) };
  let vv = v * scale;
  let vh = vv * Math.cos(la * D2R), vz = vv * Math.sin(la * D2R);
  let h = 0, z = z0, t = 0;
  const T = [0], H = [0], Z = [z0];
  let wall = null, over = false, bounced = false;
  const fair = Math.abs(spray) <= 45.5, W = wallDist(spray);
  while (t < 12) {
    const s = Math.hypot(vh, vz);
    const ah = -KD * s * vh - lift * s * vz, az = -KD * s * vz + lift * s * Math.abs(vh) - G;
    vh += ah * dt; vz += az * dt; h += vh * dt; z += vz * dt; t += dt;
    if (fair && !wall && h >= W) {
      wall = { t, z, h: W };
      if (z > WALL_H + BALL_R) over = true;
      else { h = W - 0.5; vh = -Math.abs(vh) * 0.3; bounced = true; }
    }
    if (over && h > W + 5) {
      // the seats rise behind the wall: about one foot up for every two back
      const seat = WALL_H + (h - W - 5) * 0.5;
      if (z <= seat) { T.push(t); H.push(h); Z.push(seat); break; }
    }
    T.push(t); H.push(h); Z.push(Math.max(z, BALL_R));
    if (z <= BALL_R && vz < 0) break;
    if (stopAt != null && h >= stopAt) break;
  }
  return { T, H, Z, u, wall, over, bounced, land: { t, h, z }, vhEnd: vh, vzEnd: vz };
}

/** The same flight, coarser and storing nothing: how far it carries (or that it left the park). */
function carry(v, la, spray, z0, scale) {
  const dt = 1 / 60, lift = clamp((la - LIFT_LO) / 14, 0, 1) * clamp((LIFT_HI - la) / LIFT_FALL, 0, 1) * KL, W = wallDist(spray), fair = Math.abs(spray) <= 45.5;
  const vv = v * scale;
  let vh = vv * Math.cos(la * D2R), vz = vv * Math.sin(la * D2R), h = 0, z = z0, t = 0;
  while (t < 12) {
    const s = Math.sqrt(vh * vh + vz * vz);
    const ah = -KD * s * vh - lift * s * vz, az = -KD * s * vz + lift * s * Math.abs(vh) - G;
    vh += ah * dt; vz += az * dt; h += vh * dt; z += vz * dt; t += dt;
    if (fair && h >= W) return z > WALL_H + BALL_R ? { h: W + 40, over: true } : { h: W, wall: true };
    if (z <= BALL_R && vz < 0) return { h };
  }
  return { h };
}

function sampleAir(f, t) {
  const { T, H, Z } = f;
  if (t <= 0) return { h: H[0], z: Z[0] };
  const i = Math.min(T.length - 2, Math.floor(t * 120));
  if (i < 0) return { h: H[0], z: Z[0] };
  const k = clamp((t - T[i]) / (T[i + 1] - T[i] || 1), 0, 1);
  return { h: H[i] + (H[i + 1] - H[i]) * k, z: Z[i] + (Z[i + 1] - Z[i]) * k };
}

/** A ground ball: it bounces lower each hop and slows on the grass (speed falls e^-mu t). */
function groundPath(V, spray, z0, la, mu) {
  const u = { x: Math.sin(spray * D2R), y: Math.cos(spray * D2R) };
  const tDown = la > 0 ? 0.08 + la * 0.012 : 0.06;
  const hop0 = clamp(0.18 + Math.max(0, la + 8) * 0.012, 0.12, 0.42);
  const hops = []; let t = tDown, d = hop0;
  for (let k = 0; k < 6; k++) { hops.push([t, d]); t += d; d *= 0.55; }
  const Wl = wallDist(spray) - 1.5;
  const rr = (s) => { const r = V / mu * (1 - Math.exp(-mu * Math.max(0, s))); return r > Wl ? Wl - Math.min(12, (r - Wl) * 0.25) : r; };
  return {
    u, V, mu,
    r: rr,
    speed: (s) => V * Math.exp(-mu * Math.max(0, s)),
    z: (s) => {
      if (s < tDown) return z0 + (BALL_R - z0) * (s / tDown) + (la > 0 ? 4 * la * 0.04 * (s / tDown) * (1 - s / tDown) : 0);
      for (const [h0, dd] of hops) if (s >= h0 && s < h0 + dd) { const k = (s - h0) / dd; return BALL_R + 4 * 4.02 * dd * dd * k * (1 - k) * 0.25 * 4; }
      return BALL_R;
    },
  };
}

/* ------------------------------------------------------------------ reach */

/** How far a fielder can get in time tt (reaction first, then a run with acceleration). */
function reach(tt, react, v, a) {
  const t = tt - react;
  if (t <= 0) return 0;
  const ta = v / a;
  return t < ta ? 0.5 * a * t * t : v * (t - ta / 2);
}
const SPEED = (n) => (OF.includes(n) ? { v: 28, a: 19, react: 0.32 } : n === 2 ? { v: 20, a: 15, react: 0.35 } : n === 1 ? { v: 22, a: 16, react: 0.3 } : { v: 25, a: 19, react: 0.18 });

/* ------------------------------------------------------------------ the plan */

const INF = 1e9;

/** The plan of one ball in play. pr: the engine's PitchResult (in_play). o: { bats, contact
    {x,y,z} feet (where the bat met it), basesBefore (bitmask; derived from the moves when left
    out), id (the drawn pitch's id, for the plan's own picks) }. */
export function planPlay(pr, o = {}) {
  const ip = pr.inPlay || {};
  const id = o.id || (pr.drawn && pr.drawn.id) || 'x';
  const label = ip.result || 'out';
  const moves = (pr.runnerMoves || []).map((m) => ({ from: m.from, to: m.to }));
  if (!moves.some((m) => m.from === 0)) moves.push({ from: 0, to: -1 });
  const before = o.basesBefore ?? basesBefore(pr);
  const batterMove = moves.find((m) => m.from === 0);
  const hit = HITS[label] || 0;
  // the batted ball: a missing measurement takes a typical value for its kind (and says so)
  let bb = ip.bb || (hit ? 'line' : 'fly');
  const guess = [];
  const DEF = { ground: [86, -6], line: [96, 15], fly: [93, 33], popup: [78, 56] };
  let ev = ip.ev, la = ip.la, spray = ip.spray;
  if (ev == null) { ev = DEF[bb][0] - 6 + 12 * rnd(id, 'ev'); guess.push('ev'); }
  if (la == null) { la = DEF[bb][1] - 3 + 6 * rnd(id, 'la'); guess.push('la'); }
  if (spray == null) { spray = -35 + 70 * rnd(id, 'spray'); guess.push('spray'); }
  const batterOut = batterMove.to === -1;
  // what kind of play the scene shows
  let kind;
  if (label === 'home_run') kind = 'hr';
  else if (hit) kind = bb === 'ground' ? 'ground_hit' : 'air_hit';
  else if (bb === 'ground') kind = 'ground_play';
  else kind = batterOut ? 'air_out' : 'air_drop';
  // a hit stays fair; a ground ball is never foul (an out on one was fielded in fair ground)
  if (hit || bb === 'ground') spray = clamp(spray, -43.5, 43.5);
  // foul pop ups behind the plate stay inside the backstop
  const contact = o.contact || { x: (o.bats === 'L' ? 0.3 : -0.3), y: 1.2, z: 2.6 };
  const z0 = clamp(contact.z, 1, 5);
  const ctx = { pr, o, id, label, moves, before, hit, bb, ev, la, spray, kind, contact, z0, bats: o.bats || 'R' };
  // the outs before the pitch: the engine gives the outs after it and every runner put out on it
  ctx.outs0 = Math.max(0, Math.min(2, (pr.outs ?? 0) - moves.filter((m) => m.to === -1).length));
  const F = spots(ctx.bats);
  ctx.F = F;
  const p = { kind, label, bb, ev, la, spray, guess, events: [], segs: [], fielders: {}, runners: [], notes: [] };
  ctx.p = p;
  const tracks = {};
  for (let n = 1; n <= 9; n++) tracks[n] = new Track(F[n], { v: SPEED(n).v, a: SPEED(n).a });
  p.fielders = tracks;
  ctx.T = tracks;

  // ---- the ball's first path, and who gets it first
  if (kind === 'ground_hit' || kind === 'ground_play') planGround(ctx);
  else planAir(ctx);

  // ---- the runners
  planRunners(ctx);
  // a run that scores after a catch: the throw home, a step late
  if (kind === 'air_out' && ctx.catchAt && !ctx.putouts?.length) {
    const sc = p.runners.find((r) => r.scoreAt != null);
    if (sc && OF.includes(ctx.catchAt.n)) {
      const from = ctx.catchAt.q, home = basePoint(4, 'bag'), fly = dist(from, home) / 125 + 0.1;
      // (by a tenth to a third of a second, never the same twice: the slide beats the tag, or only just)
      const rel = Math.max(ctx.catchAt.s + 0.55, sc.scoreAt + 0.1 + 0.25 * rnd(ctx.id, 'late') - fly);
      // the catcher out to the plate for it, and the cutoff man in line between them
      ctx.T[2].run(Math.max(0.6, ctx.T[2].free === -Infinity ? 0.6 : ctx.T[2].free), [home], { toRest: true, v: 12 });
      if (dist(from, home) > 150) {
        const cm = cutMan(ctx.catchAt.n, 4, 2), cp = lerp(from, home, 0.68);
        ctx.T[cm].arrive(SPEED(cm).react, cp, Math.max(SPEED(cm).react + 1.2, rel + 0.2), { toRest: true });
        ctx.T[cm].act(rel + fly * 0.68, 'cover', { cutoff: true, from });
      }
      throwBall(ctx, ctx.catchAt.n, 2, rel, from, home, fly);
      ctx.lastHolder = 2;
    }
  }
  // ---- everyone else on the field
  planRest(ctx);
  // ---- no run stops dead
  for (let n = 1; n <= 9; n++) if (p.fielders[n]) p.fielders[n].settle();
  for (const r of p.runners) if (r.track && r.track.settle) r.track.settle();
  // ---- the cut
  planEdit(ctx);
  p.segs.sort((a, b) => a.t0 - b.t0);
  p.ballAt = (s) => ballAt(p, s);
  p.outcome = outcomeOf(ctx);
  return p;
}

/** A steal (rules 7, CONTRACT.md 5i: pr.steal, on a ball or a strike), staged as a play from the catch:
    the runner already gone with the pitch, the catcher's throw down (his own pop time, catch to glove),
    the cover man on the bag, the slide and the tag, safe or out by the engine's margin (seconds, plus is
    safe by). Plan time 0 is the catch. Nothing here decides anything: the engine's result and margin
    are what it shows. Returns a plan of the same shape planPlay returns (kind 'steal'). */
export function planSteal(pr, o = {}) {
  const st = pr.steal, id = o.id || (pr.drawn && pr.drawn.id) || 'x';
  const from = st.from, to = st.to, out = st.result === 'out';
  const F = spots(o.bats || 'R');
  const p = { kind: 'steal', label: 'steal', bb: null, ev: null, la: null, spray: to === 3 ? -30 : 0, guess: [], events: [], segs: [], fielders: {}, runners: [], notes: [], flight: null };
  const T = {};
  for (let n = 1; n <= 9; n++) T[n] = new Track(F[n], { v: SPEED(n).v, a: SPEED(n).a });
  p.fielders = T;
  const ctx = { p, T, F, pr, o, id, kind: 'steal', label: 'steal', moves: [], spray: p.spray, bats: o.bats || 'R', outs0: 0 };
  // the catcher: the ball in his glove at 0, up and throwing; the ball in the cover man's glove at his
  // pop time (Savant's, catch to glove at second; a throw to third is shorter)
  const home = { x: 0, y: -1.5 }, bag = basePoint(to, 'bag');
  const pop = clamp(st.catcher && st.catcher.pop ? st.catcher.pop : 2.0, 1.75, 2.3) * (to === 3 ? 0.8 : 1);
  const fly = dist(home, bag) / 122 + 0.05, rel = pop - fly;
  p.segs.push({ kind: 'held', t0: 0, by: 2, t1: null });
  T[2].act(0, 'catch_throw', { from: home });
  const cov = st.cover || (to === 3 ? 5 : 4);
  // (the cover man broke for the bag when the runner went, with the pitch: at the catch he is well on
  // his way, and on the bag a beat before the ball)
  T[cov] = p.fielders[cov] = new Track(lerp(F[cov], basePoint(to, 'bag'), 0.45), { v: SPEED(cov).v, a: SPEED(cov).a });
  const onBag = T[cov].arrive(0, basePoint(to, 'bag'), Math.max(0.6, pop - 0.35), { toRest: true });
  T[cov].act(onBag, 'cover', { base: to });
  ctx.cover = { [cov + ':' + to]: onBag };
  throwBall(ctx, 2, cov, rel, home, { ...bag, z: 2.2 }, fly);
  const tBall = rel + fly;
  // the runner: off with the pitch (at the catch he is a third of the way), at the bag by the margin
  const lead = leadOff(from), path = basePath(from, to);
  const tr = new Track(lerp(lead, BASE[to], 0.3), { v: 27, a: 16 });
  const margin = Number.isFinite(st.margin) ? st.margin : (out ? -0.1 : 0.1);
  const arrive = Math.max(0.9, tBall - margin);
  tr.arrive(0, path[path.length - 1], arrive, { toRest: true, v: 29 });
  const r = { from, to, track: tr, out, batter: false, safeAt: out ? null : to, arrive };
  // the tag: on him as he gets there, or the instant the ball does
  const tagAt = Math.max(arrive, tBall) + 0.03;
  T[cov].act(tagAt, 'tag', { base: to, runner: from });
  if (out) { r.outAt = tagAt; r.outBase = to; p.events.push({ s: tagAt, kind: 'out', base: to, runner: from }); }
  p.runners.push(r);
  // whoever else is on stays on his bag
  for (const b of [1, 2, 3]) if (b !== from && pr.bases != null && (pr.bases & (1 << (b - 1))) && b !== to) {
    const t2 = new Track(leadOff(b), { v: 27, a: 16 });
    t2.run(0.3, [lerp(leadOff(b), BASE[b], 0.5)], { v: 8, toRest: true });
    p.runners.push({ from: b, to: b, track: t2, out: false, batter: false, safeAt: b, arrive: t2.free });
  }
  ctx.firstTouch = { s: 0, n: 2, how: 'catch', at: home, fell: false };
  ctx.lastHolder = cov;
  for (let n = 1; n <= 9; n++) T[n].settle();
  for (const x of p.runners) x.track.settle();
  // the cut: the pitcher's view a beat, then the high home on the throw down and the bag, one shot; a
  // bang bang one slowed at the tag
  const CUT = 0.2, end = tagAt + 1.1;
  const pieces = [{ s0: 0, s1: CUT, cam: 'pitcher', rate: 1 }, { s0: CUT, s1: end, cam: 'follow', rate: 1, m: tagAt }];
  if (Math.abs(margin) < 0.12) {
    const out2 = [];
    for (const pc of pieces) {
      const a = tagAt - 0.3, b = tagAt + 0.15;
      if (pc.cam === 'pitcher' || b <= pc.s0 || a >= pc.s1) { out2.push(pc); continue; }
      out2.push({ ...pc, s1: a }, { ...pc, s0: a, s1: b, rate: 0.38 }, { ...pc, s0: b });
    }
    pieces.splice(0, pieces.length, ...out2);
    p.decisive = { s: tagAt, kind: 'bang' };
    p.events.push({ s: tagAt, kind: 'crowd', cue: 'big' });
  } else p.decisive = null;
  p.edit = pieces;
  p.realDur = pieces.reduce((acc, x) => acc + (x.s1 - x.s0) / x.rate, 0);
  p.dur = pieces[pieces.length - 1].s1;
  p.resolveAt = tagAt + 0.05;
  p.steal = { from, to, out, tagAt, tBall, arrive, margin };
  p.events.sort((a, b) => a.s - b.s);
  p.segs.sort((a, b) => a.t0 - b.t0);
  p.ballAt = (s) => ballAt(p, s);
  p.outcome = outcomeOf(ctx);
  return p;
}

/** A pickoff throw (rules 7, CONTRACT.md 5i: { base, out, balk, margin, runs? } with the bases before
    it), staged from the pitcher's move: he steps off and throws over, the runner dives back, the man on
    the bag tags, and the engine's call stands (margin seconds, plus is safe by). On a balk every runner
    then moves up a base. Plan time 0 is his move. Returns a plan of planPlay's shape (kind 'pickoff'). */
export function planPickoff(po, o = {}) {
  const base = po.base, out = !!po.out, id = o.id || 'po' + (po.n ?? 0);
  const F = spots(o.bats || 'R');
  const cov = base === 1 ? 3 : base === 3 ? 5 : (o.bats === 'L' ? 6 : 4);
  // (the man holding a runner on is on the bag already; a middle infielder breaks in behind him)
  if (base === 1) F[3] = { x: BASE[1].x - 1.5, y: BASE[1].y + 1.5 };
  if (base === 3) F[5] = { x: BASE[3].x + 6, y: BASE[3].y - 3 };
  if (base === 2) F[cov] = lerp(F[cov], BASE[2], 0.5);
  const p = { kind: 'pickoff', label: 'pickoff', bb: null, ev: null, la: null, spray: base === 3 ? -40 : base === 1 ? 40 : 0, guess: [], events: [], segs: [], fielders: {}, runners: [], notes: [], flight: null };
  const T = {};
  for (let n = 1; n <= 9; n++) T[n] = new Track(F[n], { v: SPEED(n).v, a: SPEED(n).a });
  p.fielders = T;
  const ctx = { p, T, F, o, id, kind: 'pickoff', label: 'pickoff', moves: [], spray: p.spray, bats: o.bats || 'R', outs0: 0 };
  const bag = basePoint(base, 'bag'), rubber = { x: 0, y: 59.5 };
  const onBag = base === 1 ? 0 : T[cov].arrive(0.1, bag, 0.75, { toRest: true });
  if (base !== 1) T[cov].act(onBag, 'cover', { base });
  const fly = dist(rubber, bag) / 115 + 0.05, rel = Math.max(0.55, onBag - fly + 0.25);
  p.segs.push({ kind: 'held', t0: 0, by: 1, t1: null });
  T[1].act(0, 'set');
  throwBall(ctx, 1, cov, rel, rubber, { ...bag, z: 1.6 }, fly);
  const tBall = rel + fly;
  // the runner: a lead off the bag, back on the move, a dive in to beat it (or not, by the margin)
  const lead = lerp(BASE[base], BASE[Math.min(4, base + 1)], base === 3 ? 0.14 : 0.15);
  const tr = new Track(lead, { v: 27, a: 16 });
  const margin = Number.isFinite(po.margin) ? po.margin : (out ? -0.08 : 0.25);
  const back = Math.max(0.5, tBall - margin);
  tr.arrive(0.2, BASE[base], back, { toRest: true, v: 24 });
  const r = { from: base, to: out ? -1 : base, track: tr, out, batter: false, safeAt: out ? null : base, arrive: back };
  const tagAt = Math.max(back, tBall) + 0.03;
  T[cov].act(tagAt, 'tag', { base, runner: base });
  if (out) { r.outAt = tagAt; r.outBase = base; p.events.push({ s: tagAt, kind: 'out', base, runner: base }); }
  p.runners.push(r);
  // the others: a step off and back. A balk moves every runner up a base once it is called.
  const bases = o.basesBefore || (1 << (base - 1));
  for (const b of [1, 2, 3]) if (b !== base && (bases & (1 << (b - 1)))) {
    const t2 = new Track(leadOff(b), { v: 27, a: 16 });
    t2.run(0.3, [lerp(leadOff(b), BASE[b], 0.6)], { v: 8, toRest: true });
    p.runners.push({ from: b, to: b, track: t2, out: false, batter: false, safeAt: b, arrive: t2.free });
  }
  if (po.balk) for (const x of p.runners) {
    if (x.out) continue;
    const nx = Math.min(4, x.from + 1);
    x.arrive = x.track.run(Math.max(x.track.free, tagAt + 0.5), [BASE[nx]], { v: 20, toRest: true });
    x.to = nx; x.safeAt = nx < 4 ? nx : null;
    if (nx === 4) x.scoreAt = x.arrive;
  }
  ctx.firstTouch = { s: 0, n: 1, how: 'catch', at: rubber, fell: false };
  ctx.lastHolder = cov;
  for (let n = 1; n <= 9; n++) T[n].settle();
  for (const x of p.runners) x.track.settle();
  // (a balk: the call and the first strides of the walk up; the diamond on the scorebar has the rest)
  const end = tagAt + (po.balk ? 2.6 : 1.0);
  const pieces = [{ s0: 0, s1: end, cam: 'follow', rate: 1, m: tagAt }];
  if (Math.abs(margin) < 0.12) {
    const a = tagAt - 0.3, b = tagAt + 0.15;
    pieces.splice(0, 1, { ...pieces[0], s1: a }, { ...pieces[0], s0: a, s1: b, rate: 0.38 }, { ...pieces[0], s0: b });
    p.decisive = { s: tagAt, kind: 'bang' };
    p.events.push({ s: tagAt, kind: 'crowd', cue: 'big' });
  } else p.decisive = null;
  p.edit = pieces;
  p.realDur = pieces.reduce((acc, x) => acc + (x.s1 - x.s0) / x.rate, 0);
  p.dur = pieces[pieces.length - 1].s1;
  p.resolveAt = tagAt + 0.05;
  p.pickoff = { base, out, tagAt, tBall, back, margin, balk: !!po.balk };
  p.events.sort((a, b) => a.s - b.s);
  p.segs.sort((a, b) => a.t0 - b.t0);
  p.ballAt = (s) => ballAt(p, s);
  p.outcome = outcomeOf(ctx);
  return p;
}

/** Bases occupied before the play, from the moves and the bases after (a runner who did not move
    is still on his base). */
export function basesBefore(pr) {
  let b = 0;
  const moved = new Set();
  for (const m of pr.runnerMoves || []) if (m.from >= 1 && m.from <= 3) { b |= 1 << (m.from - 1); moved.add(m.from); }
  const targets = new Set((pr.runnerMoves || []).filter((m) => m.to >= 1 && m.to <= 3).map((m) => m.to));
  for (const bs of [1, 2, 3]) if ((pr.bases & (1 << (bs - 1))) && !targets.has(bs) && !moved.has(bs)) b |= 1 << (bs - 1);
  return b;
}

/* ---- ground balls ---- */

function planGround(ctx) {
  const { p, T, F, spray, la, ev, z0, kind, id } = ctx;
  const mu = 0.24;
  let V = ev * 1.4667 * Math.cos(clamp(la, -30, 30) * D2R) * 0.86;
  const infieldHit = kind === 'ground_hit' && ctx.hit === 1 && (V / mu < 190 || ev < 62);
  if (kind === 'ground_hit' && !infieldHit) V = Math.max(V, 280 * mu);   // through the infield and on into the outfield
  if (kind === 'ground_play' && V / mu < 40) V = 40 * mu;                 // a dribbler still leaves the plate
  const g = groundPath(V, spray, z0, la, mu);
  const at = (s) => { const r = g.r(s); return { x: ctx.contact.x * Math.max(0, 1 - s * 4) + g.u.x * r, y: ctx.contact.y * Math.max(0, 1 - s * 4) + g.u.y * r }; };
  ctx.groundAt = at;
  // who can reach it, and when (the first time each fielder's reach covers the ball)
  const cands = [1, 2, 3, 4, 5, 6];
  const firstReach = (n, start) => {
    const sp = SPEED(n);
    for (let s = 0.05; s < 6; s += 1 / 60) {
      const b = at(s);
      if (dist(start, b) <= reach(s, sp.react, sp.v, sp.a) + 3) return { s, b };
      if (g.speed(s) < 4 && s > 2.5) break;
    }
    return null;
  };
  // the catcher fields only what dies in front of the plate
  const order = (n) => (n === 2 ? 1 : 0);
  let best = null;
  for (const n of cands) {
    const r = firstReach(n, F[n]);
    if (!r) continue;
    if (n === 2 && rad(r.b) > 25) continue;
    if (n === 1 && rad(r.b) > 75) continue;
    if (!best || r.s + order(n) < best.s + order(best.n)) best = { n, ...r };
  }
  const throughTo = () => {
    // the hit goes through: any infielder who would get there starts a step further off, and dives
    for (const n of [1, 3, 4, 5, 6]) {
      for (let guard = 0; guard < 40; guard++) {
        const r = firstReach(n, F[n]);
        if (!r || rad(r.b) > 175) break;
        // move him away from the ball's line, sideways
        const side = Math.sign(F[n].x * g.u.y - F[n].y * g.u.x) || 1;
        const nx = { x: g.u.y * side, y: -g.u.x * side };
        F[n] = { x: F[n].x + nx.x * 3, y: F[n].y + nx.y * 3 };
      }
      T[n].start = { ...F[n] };
    }
  };
  if (kind === 'ground_hit' && !infieldHit) {
    throughTo();
    // the nearest infielder lunges at it as it goes by
    let near = null;
    for (const n of [3, 4, 5, 6]) {
      let m = INF, ms = 0;
      for (let s = 0.05; s < 2.5; s += 1 / 60) { const d = dist(F[n], at(s)); if (d < m) { m = d; ms = s; } }
      if (!near || m < near.m) near = { n, m, s: ms };
    }
    if (near && near.m < 30) {
      const b = at(near.s), tgt = lerp(F[near.n], b, Math.min(1, (near.m - 4) / near.m));
      T[near.n].run(SPEED(near.n).react, [tgt], { toRest: true });
      T[near.n].act(near.s - 0.1, 'dive', { to: b });
    }
    // an outfielder cuts it off as it rolls
    const of = retrieveRolling(ctx, at, g, 0);
    p.segs.push({ kind: 'ground', t0: 0, t1: of.s, g, at });
    p.events.push({ s: 0.2, kind: 'crowd', cue: 'rise' });
    ctx.firstTouch = { s: of.s, n: of.n, how: 'pickup', at: of.b, fell: true };
    afterRetrieve(ctx, of.n, of.s, of.b);
    return;
  }
  if (!best && kind === 'ground_play') {
    // nobody gets there from where we had them: the infielder with the least to make up started
    // closer to where it was hit (positioning is ours, the out is the engine's)
    let near = null;
    for (const n of [3, 4, 5, 6]) {
      const sp = SPEED(n);
      for (let s = 0.3; s < 4; s += 1 / 30) {
        const b = at(s); if (rad(b) > 165) break;
        const short = dist(F[n], b) - reach(s, sp.react, sp.v, sp.a) - 3;
        if (!near || short < near.short) near = { n, s, b, short };
      }
    }
    const nn = near.n, d = dist(F[nn], near.b) || 1;
    F[nn] = lerp(F[nn], near.b, Math.min(1, (near.short + 3) / d));
    T[nn].start = { ...F[nn] };
    const r = firstReach(nn, F[nn]);
    best = r ? { n: nn, ...r } : { n: nn, s: near.s, b: near.b };
  }
  if (!best) best = { n: 1, s: 1.5, b: at(1.5) };
  const n = best.n, sp = SPEED(n);
  // he gets to the spot a beat before the ball and fields it in front of him
  const b = best.b;
  const stand = lerp(F[n], b, Math.max(0, (dist(F[n], b) - 1.5) / Math.max(1e-3, dist(F[n], b))));
  T[n].arrive(sp.react, stand, Math.max(sp.react + 0.2, best.s - 0.12), { toRest: true });
  T[n].act(best.s - 0.25, 'set');
  T[n].act(best.s, 'field', { ball: b });
  p.segs.push({ kind: 'ground', t0: 0, t1: best.s, g, at });
  ctx.firstTouch = { s: best.s, n, how: 'field', at: b, fell: true };
  if (kind === 'ground_play' && ctx.label === 'error' && !ctx.moves.some((m) => m.to === -1)) {
    // the error: it goes off his glove, he chases it down
    const away = { x: b.x + g.u.x * 7 + g.u.y * 4, y: b.y + g.u.y * 7 - g.u.x * 4 };
    p.segs.push({ kind: 'bobble', t0: best.s, t1: best.s + 0.55, a: { ...b, z: 1.2 }, b: { ...away, z: BALL_R } });
    T[n].act(best.s + 0.02, 'bobble');
    const pick = T[n].run(best.s + 0.35, [lerp(stand, away, 0.85)], { v: 14 }) + 0.1;
    T[n].act(pick, 'pickup', { ball: away });
    p.segs.push({ kind: 'loose', t0: best.s + 0.55, t1: pick, at: away });
    p.events.push({ s: best.s + 0.05, kind: 'crowd', cue: 'groan_or_cheer', good: false });
    ctx.firstTouch.error = true;
    holdThenThrow(ctx, n, pick, lerp(stand, away, 0.85), true);
    return;
  }
  holdThenThrow(ctx, n, best.s, stand, false);
}

/** The ball fielded by n at time s at point at: the throws for every putout in turn, or a late one. */
function holdThenThrow(ctx, n, s, at, late) {
  const { p, moves } = ctx;
  const outs = putouts(ctx).filter((o) => o.base !== null);
  let holder = n, t = s, pos = at;
  p.segs.push({ kind: 'held', t0: t, by: holder, t1: null });
  ctx.holds = [{ by: holder, t0: t }];
  const done = [];
  // infield single: the throw to first is late
  const infieldHit = ctx.kind === 'ground_hit';
  if (!outs.length) {
    // nobody is out: a throw that is too late (to first on an infield hit or a fielder's choice), or
    // nothing (he holds it)
    // (never to first when the batter is already out on a catch: on an error with the ball caught,
    // that throw went while the play's own throw was still to come, and the ball left his hand twice)
    const batterOut = moves.some((m) => m.from === 0 && m.to === -1);
    const target = (infieldHit || ctx.label === 'fielders_choice' || ctx.label === 'error') && !batterOut ? 1 : null;
    if (target && !late) {
      const cov = coverer(ctx, target, holder);
      const tgtPt = basePoint(target, 'in');
      const ready = coverArrive(ctx, cov, target, t);
      const fly = dist(pos, tgtPt) / 118 + 0.06;
      const runnerAt = ctx.batterArrival ?? 4.4;
      const rel = Math.max(t + 0.6, ready - fly + 0.05, runnerAt + 0.12 - fly);
      throwBall(ctx, holder, cov, rel, pos, tgtPt, fly);
      ctx.lateThrow = { base: target, arrive: rel + fly };
      holder = cov; t = rel + fly;
    }
    ctx.lastHolder = holder;
    return;
  }
  for (const o of outs) {
    const cov = coverer(ctx, o.base, holder, done);
    const tgtPt = basePoint(o.base, o.base === 1 ? 'in' : 'bag');
    if (cov === holder || dist(pos, tgtPt) < 22) {
      // close enough to take it himself (and a tag he makes himself waits for the runner too)
      runnerEta(ctx, o);
      const arr = ctx.T[holder].run(t + 0.05, [tgtPt], { v: 22 });
      o.force = isForce(ctx, o);
      ctx.T[holder].act(arr, o.force ? 'step' : 'tag', { base: o.base, self: true, force: o.force, runner: o.from });
      o.ballAt = arr; o.by = holder;
      t = arr; pos = tgtPt;
      p.segs.push({ kind: 'held', t0: t, by: holder, t1: null });
    } else {
      const ready = coverArrive(ctx, cov, o.base, t);
      const fly = dist(pos, tgtPt) / (OF.includes(holder) ? 125 : 118) + 0.06;
      // the glove to the hand, a crow hop and his feet set (a pivot is quicker): then it goes. He never stands
      // holding it (it waited to beat the batter by only a step, so a routine grounder sat in his
      // hand for a second and a half; the owner, 2026-10-22: the players need to throw the ball)
      const transfer = done.length ? 0.32 : 0.65 + 0.25 * rnd(ctx.id, 'step');
      let rel = Math.max(t + transfer, ready - fly + 0.05);
      // a runner already on, thrown out further round: by a step or two at the bag, not standing
      // half a base path away when the ball gets there (the owner, 2026-10-22: the out visible at the
      // base). The throw waits on his run, never on the batter's (that one is a routine out)
      // (the hitter too, when he is out past first, trying for one more)
      if (runnerEta(ctx, o)) rel = Math.max(rel, o.eta - fly - (0.25 + 0.35 * rnd(ctx.id, 'bag' + o.from)));
      o.force = isForce(ctx, o);
      const far = OF.includes(holder) ? dist(pos, tgtPt) : 0;
      if (far > 240) {
        // a long one: the relay man goes out in line, takes it chest high, turns and throws on
        const rm = cutMan(holder, o.base, cov), rp = lerp(pos, tgtPt, 0.45);
        const rArr = ctx.T[rm].run(SPEED(rm).react, [rp], { toRest: true });
        ctx.T[rm].act(rArr, 'cover', { relay: true });
        const f1 = dist(pos, rp) / 125 + 0.06, f2 = dist(rp, tgtPt) / 118 + 0.06;
        rel = Math.max(rel - (f1 + 0.32 + f2 - fly), rArr - f1 + 0.05, t + transfer);
        throwBall(ctx, holder, rm, rel, pos, rp, f1);
        const rel2 = rel + f1 + 0.32;
        ctx.T[rm].hold(rel2);
        ctx.forceTo = o.force ? o.base : null;
        throwBall(ctx, rm, cov, rel2, rp, tgtPt, f2);
        ctx.forceTo = null;
        ctx.T[cov].act(rel2 + f2, o.force ? 'receive' : 'tag', { base: o.base, force: o.force, runner: o.from });
        o.ballAt = rel2 + f2; o.by = cov;
        holder = cov; t = rel2 + f2; pos = tgtPt;
      } else {
        if (far > 150) {
          // the cutoff man in line, a third of the way from the bag: the throw comes through him
          const cm = cutMan(holder, o.base, cov), cp = lerp(pos, tgtPt, 0.68);
          ctx.T[cm].arrive(SPEED(cm).react, cp, Math.max(SPEED(cm).react + 1.2, rel + 0.2), { toRest: true });
          ctx.T[cm].act(rel + fly * 0.68, 'cover', { cutoff: true, from: pos });
          ctx.T[cm].hold(rel + fly * 0.68 + 0.2);
        }
        ctx.forceTo = o.force ? o.base : null;
        throwBall(ctx, holder, cov, rel, pos, tgtPt, fly);
        ctx.forceTo = null;
        ctx.T[cov].act(rel + fly, o.force ? 'receive' : 'tag', { base: o.base, force: o.force, runner: o.from });
        o.ballAt = rel + fly; o.by = cov;
        holder = cov; t = rel + fly; pos = tgtPt;
      }
      backUp(ctx, o.base, holder, pos, t);
    }
    // (a tag: the next throw waits for the tag itself, as the runner gets there. He gets there no sooner
    // than his run at full speed, and a runner thrown out is slowed to reach the bag just after the ball,
    // by the margin planRunners draws: the tag is then, and the ball stays in the glove for it. Waiting
    // on the full speed run alone, the ball went on to first and the tag was made with an empty glove.)
    if (!o.force && o.eta != null && o.ballAt != null) {
      const margin = 0.08 + 0.45 * rnd(ctx.id, 'out' + o.from);
      const tagAt = Math.max(o.ballAt + 0.12, Math.max(o.etaBag ?? o.eta, o.ballAt + margin) - 0.06);
      t = Math.max(t, tagAt + 0.05);
    }
    done.push(o);
    p.events.push({ s: o.ballAt, kind: 'out', base: o.base, runner: o.from, by: o.by, force: !!o.force });
  }
  ctx.putouts = done;
  ctx.lastHolder = holder;
  void moves;
}

/** Is the out at base o.base a force (a foot on the bag) or a tag (the glove on the runner)? The hitter
    at first is forced; a runner on is forced to the next base when every base behind him is taken;
    a runner doubled off his own bag after a catch is put out at the bag too. Anything else is a tag. */
function isForce(ctx, o) {
  if (o.from === 0) return o.base === 1;
  if (o.base === o.from) return true;
  if (o.base !== o.from + 1 || ctx.kind === 'air_out') return false;
  for (let b = 1; b < o.from; b++) if (!(ctx.before & (1 << (b - 1)))) return false;
  return true;
}

/** A man backing up a throw to base b: behind the bag in line with the throw, if he is free. First:
    the right fielder (the catcher with the bases empty on a ball on the ground); second: the centre
    fielder; third: the left fielder; home: the pitcher. */
function backUp(ctx, b, receiver, at, tArrive) {
  const pick = b === 1 ? (ctx.before ? [9] : [2, 9]) : b === 2 ? [8] : b === 3 ? [7] : [1];
  // (never a man who has a part with the ball in this play)
  const busy = (x) => x === receiver || ctx.T[x].acts.some((a) => ['catch', 'drop', 'field', 'pickup', 'receive', 'catch_throw', 'tag', 'step', 'throw', 'reach'].includes(a.kind));
  const n = pick.find((x) => !busy(x));
  if (!n) return;
  const T = ctx.T[n];
  if (T.free > tArrive - 0.4 && T.legs.length) return;
  const ball = ctx.firstTouch ? ctx.firstTouch.at : { x: 0, y: 150 };
  const dir = { x: at.x - ball.x, y: at.y - ball.y }, L = Math.hypot(dir.x, dir.y) || 1;
  const q = { x: at.x + dir.x / L * 35, y: at.y + dir.y / L * 35 };
  T.run(Math.max(SPEED(n).react, T.free === -Infinity ? 0 : T.free), [q], { toRest: true });
  T.act(tArrive, 'cover', { backup: b });
}

/** The cutoff or relay man for a throw from outfielder n to base b, never the man covering it. */
function cutMan(n, b, cov) {
  const pick = b === 4 ? (n === 7 ? [5, 6, 1] : [3, 1, 4]) : b === 3 ? [6, 4, 1] : n === 9 ? [4, 6, 1] : [6, 4, 1];
  return pick.find((x) => x !== cov && x !== n);
}

/** The base a fielder stands on to take a throw (first base: the inside corner, toward home). */
function basePoint(b, how) {
  const q = BASE[b];
  if (b === 1) return how === 'in' ? { x: q.x - 1.5, y: q.y + 1.0 } : q;
  if (b === 2) return { x: q.x + 1.2, y: q.y - 1.2 };
  if (b === 3) return { x: q.x + 1.0, y: q.y + 1.0 };
  return { x: 1.5, y: 1.0 };
}

/** Who takes the throw at base b. */
function coverer(ctx, b, holder, done = []) {
  const right = ctx.spray >= 0;
  const want = b === 1 ? [3, 1, 4] : b === 2 ? (right ? [6, 4] : [4, 6]) : b === 3 ? [5, 6] : [2, 1];
  for (const n of want) if (n !== holder || done.length) if (n !== holder) return n;
  return want[0];
}

/** Send a coverer to base b (once): the time he is there. */
function coverArrive(ctx, n, b, from) {
  ctx.cover = ctx.cover || {};
  const key = n + ':' + b;
  if (ctx.cover[key] != null) return ctx.cover[key];
  const T = ctx.T[n], sp = SPEED(n);
  const start = Math.max(sp.react, T.free === -Infinity ? sp.react : T.free);
  const arr = T.run(start, [basePoint(b, 'bag')], { toRest: true });
  T.act(arr, 'cover', { base: b });
  ctx.cover[key] = arr;
  void from;
  return arr;
}

function throwBall(ctx, from, to, rel, a, b, fly) {
  // a throw to a man on a bag for a force: to his glove out in front of the bag toward the throw,
  // chest high, where he takes it with a foot on the bag
  const fb = [1, 2, 3, 4].find((k) => dist(b, basePoint(k, 'bag')) < 0.5 || (k === 1 && dist(b, basePoint(1, 'in')) < 0.5));
  if (fb && ctx.forceTo === fb) {
    const bag = fb === 4 ? { x: 0, y: 0.7 } : BASE[fb], L = dist(a, bag) || 1;
    b = { x: bag.x + (a.x - bag.x) / L * 1.5, y: bag.y + (a.y - bag.y) / L * 1.5, z: 4.4 };
  }
  const T = ctx.T[from];
  T.act(rel - 0.32, 'throw', { rel, to: b, dur: 0.6 });
  ctx.p.segs.push({ kind: 'throw', t0: rel, t1: rel + fly, a: { ...a, z: 6 }, b: { ...b, z: b.z ?? 4.6 }, from, to });
  ctx.p.segs.push({ kind: 'held', t0: rel + fly, by: to, t1: null });
  ctx.T[to].act(rel + fly, ctx.T[to].acts.some((x) => x.kind === 'receive' && Math.abs(x.t - rel - fly) < 1e-3) ? 'receive' : 'catch_throw', { from: a });
  ctx.p.events.push({ s: rel, kind: 'throw', from, to });
  ctx.p.events.push({ s: rel + fly, kind: 'glove', by: to });
}

/** When runner o (thrown out further round) gets to the bag he is out at: o.eta at full speed into it,
    o.etaBag pulling up on it as planRunners runs him. False when he is not running on (a force on the
    batter at first, a runner doubled off). */
function runnerEta(ctx, o) {
  if (!(o.from >= 1 && o.base > o.from || o.from === 0 && o.base > 1)) return false;
  const bat = o.from === 0, v = bat ? 26.5 : 27;
  let d = 0, prev = bat ? { x: ctx.bats === 'L' ? 2.95 : -2.95, y: 0.4 } : leadOff(o.from);
  for (const q of bat ? [...roundFirst(), ...basePath(1, o.base)] : basePath(o.from, o.base)) { d += dist(prev, q); prev = q; }
  const go = ctx.catchAt && ctx.kind === 'air_out' ? ctx.catchAt.s + 0.08 : bat ? 0.28 : 0.15;
  o.eta = go + runTime(d, v, 16, true, false);
  o.etaBag = go + runTime(d, v, 16, true, true);
  // (a runner held halfway on a fly with fewer than two out: on from there when it drops)
  if (!bat && ctx.kind === 'air_hit' && ctx.outs0 < 2 && ctx.landAt != null) {
    const half = dist(leadOff(o.from), BASE[o.from + 1]) * 0.5, t0 = Math.max(go + runTime(half, 22, 16, true, true), ctx.landAt - 0.7);
    o.eta = t0 + runTime(d - half, 27, 16, true, false);
    o.etaBag = t0 + runTime(d - half, 27, 16, true, true);
  }
  return true;
}

/** The runners put out on the play, in the order the throws go (the lead runner first, the batter
    at first base last), and the base each is out at. */
function putouts(ctx) {
  const { moves, kind, hit, before } = ctx;
  const outs = [];
  for (const m of moves) {
    if (m.to !== -1) continue;
    let base;
    if (kind === 'ground_play' || kind === 'ground_hit') base = m.from === 0 ? 1 : m.from + 1;
    else if (kind === 'air_out') base = m.from === 0 ? null : (ctx.deep ? m.from + 1 : m.from);   // the catch puts the batter out
    else if (kind === 'air_drop') base = m.from === 0 ? 1 : m.from + 1;
    else base = Math.min(4, m.from + hit + 1);   // a hit: thrown out trying for one more
    outs.push({ from: m.from, base: base == null ? null : Math.min(4, base) });
  }
  void before;
  // the order: the batter's first base (a force) last; the rest by the base, lead runner first
  return outs.sort((a, b) => (a.from === 0) - (b.from === 0) || (b.base ?? 0) - (a.base ?? 0));
}

/** An outfielder runs down a ball rolling on the grass: where and when he gets it. */
function retrieveRolling(ctx, at, g, t0) {
  const { F } = ctx;
  let best = null;
  for (const n of OF) {
    const sp = SPEED(n);
    for (let s = t0 + 0.4; s < t0 + 9; s += 1 / 30) {
      const b = at(s);
      const d = dist(F[n], b);
      if (d <= reach(s, sp.react, sp.v, sp.a) + 2) { if (!best || s < best.s) best = { n, s, b }; break; }
    }
  }
  if (!best) best = { n: 8, s: t0 + 4, b: at(t0 + 4) };
  const sp = SPEED(best.n);
  const stand = lerp(F[best.n], best.b, Math.max(0, (dist(F[best.n], best.b) - 2) / Math.max(1e-3, dist(F[best.n], best.b))));
  ctx.T[best.n].arrive(sp.react, stand, best.s - 0.05, { toRest: true });
  ctx.T[best.n].act(best.s - 0.3, 'set');
  ctx.T[best.n].act(best.s, 'pickup', { ball: best.b });
  void g;
  return best;
}

/* ---- the ball in the air ---- */

function planAir(ctx) {
  const { p, T, F, spray, la, ev, z0, kind, hit, label } = ctx;
  const v = ev * 1.4667;
  const fair = Math.abs(spray) <= 45;
  const W = wallDist(spray);
  const pop = ctx.bb === 'popup';
  // the band the result needs, feet from home
  let band;
  if (kind === 'hr') band = [W + 18, W + 75];
  else if (kind === 'air_hit') {
    const ofd = 270;
    if (hit === 1) band = ctx.bb === 'line' ? [140, ofd - 30] : [125, ofd - 45];
    else if (hit === 2) band = [Math.max(ofd + 25, W - 70), W - 4];
    else band = [W - 45, W - 4];
  } else {
    // an out (or a drop): pop ups stay in or near the infield; foul ones behind the plate stay short
    // (a pop up comes down where its own flight takes it, in the infield or just past it: no longer
    // pinned to 185 ft, where the old long carry held most of them)
    if (pop) band = Math.abs(spray) > 90 ? [12, 45] : [20, 240];
    else if (ctx.bb === 'line') band = [80, W - 20];
    // (a towering one, over 50 degrees, comes down shallower: its own carry, Statcast's, is short)
    else band = [la > 50 ? 90 : 150, W - 6];
  }
  // fly the measured ball; hold its distance to the band by scaling its speed (the angles stay)
  const natural = simAir(v, la, spray, z0);
  // (rules 6 and on: the engine's own carry for the real ball, Statcast's distance, is where it lands)
  const real = ctx.pr.inPlay && Number.isFinite(ctx.pr.inPlay.carry) && kind !== 'hr' ? ctx.pr.inPlay.carry : null;
  const nat = real != null ? real : natural.over ? natural.wall.h + 40 : natural.land.h;
  // (a ball hit nearly straight up keeps its own carry when short: a pop up is not sped up to reach
  // somewhere, it comes down where it comes down)
  const want = la > 70 && nat < band[0] ? nat : clamp(nat, band[0], band[1]);
  let f = natural, scale = 1;
  if (Math.abs(nat - want) > 1 || (kind === 'hr' && !natural.over) || (kind !== 'hr' && natural.over)) {
    let lo = 0.3, hi = 2.2;
    for (let i = 0; i < 18; i++) {
      const m = (lo + hi) / 2, c = carry(v, la, spray, z0, m);
      const h = c.over ? (kind === 'hr' ? W + 40 : W + 100) : c.h;
      if (h < want) lo = m; else hi = m;
    }
    scale = (lo + hi) / 2;
    f = simAir(v, la, spray, z0, scale);
    if (kind === 'hr' && !f.over) { for (let k = 0; k < 20 && !f.over; k++) { scale *= 1.03; f = simAir(v, la, spray, z0, scale); } }
    if (kind !== 'hr' && f.over) { for (let k = 0; k < 40 && f.over; k++) { scale *= 0.98; f = simAir(v, la, spray, z0, scale); } }
  }
  p.scale = scale;
  const u = f.u;
  const airAt = (s) => { const q = sampleAir(f, s); return { x: ctx.contact.x + u.x * q.h, y: ctx.contact.y + u.y * q.h, z: q.z }; };
  ctx.airAt = airAt; ctx.flight = f;
  p.flight = { land: airAt(f.land.t), tLand: f.land.t, wall: f.wall, over: f.over, apex: Math.max(...f.Z) };
  if (kind === 'hr') {
    p.segs.push({ kind: 'air', t0: 0, t1: f.land.t, at: airAt });
    p.segs.push({ kind: 'gone', t0: f.land.t, t1: INF, at: airAt(f.land.t) });
    p.events.push({ s: 0.25, kind: 'crowd', cue: 'rise' });
    p.events.push({ s: f.wall.t, kind: 'crowd', cue: 'roar', over: true });
    ctx.overAt = f.wall.t;
    // the outfielders go back to the wall and watch it go
    for (const n of OF) {
      const tgt = { x: ctx.contact.x + u.x * (W - 6), y: ctx.contact.y + u.y * (W - 6) };
      const near = dist(F[n], tgt) < 140;
      if (near) { T[n].run(SPEED(n).react, [lerp(F[n], tgt, Math.min(1, 0.9))], { toRest: true }); T[n].act(f.wall.t - 0.2, 'leap_miss', { at: tgt }); }
    }
    ctx.firstTouch = { s: f.wall.t, how: 'over', at: airAt(f.wall.t) };
    ctx.lastHolder = null;
    return;
  }
  // where a fielder can take it: a point on its way down, under 8 ft (a liner: anywhere under 8 ft)
  const catchable = (s) => { const q = airAt(s); if (q.z > 8.2 || q.z < 0.6) return null; const q2 = airAt(s + 0.02); return (q2.z < q.z || ctx.bb === 'line') ? q : null; };
  const tEnd = f.bounced ? f.wall.t : f.land.t;
  const who = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  const pick = () => {
    let best = null;
    for (const n of who) {
      const sp = SPEED(n);
      for (let s = 0.25; s <= tEnd + 1e-6; s += 1 / 60) {
        const q = catchable(s); if (!q) continue;
        if (n === 2 && rad(q) > 70 && Math.abs(ctx.spray) < 60) break;
        const d = dist(F[n], q);
        if (d <= reach(s, sp.react, sp.v, sp.a) + 3) {
          // an outfielder coming in has it over an infielder going out
          // (a pop up is the infielders' and the catcher's: they call off an outfielder short of the
          // grass's edge, and the pitcher gives way to anyone)
          const popIn = pop && rad(q) < 200;
          const pri = s + (OF.includes(n) ? (popIn ? 0.6 : -0.4) : popIn && n !== 1 ? -0.5 : 0) + (n === 2 && Math.abs(ctx.spray) < 90 && !popIn ? 0.6 : 0) + (n === 1 ? 0.8 : 0);
          if (!best || pri < best.pri) best = { n, s, q, pri };
          break;
        }
      }
    }
    return best;
  };
  const tLand = f.land.t;
  if (kind === 'air_out' || kind === 'air_drop') {
    let best = pick();
    if (!best || best.s > tEnd - 0.02) {
      // nobody reaches it from where we had them: the nearest one started closer. The catch is at
      // glove height on the way down.
      let sC = tEnd - 0.05;
      for (let ss = 0.3; ss < tEnd; ss += 1 / 60) { const c = airAt(ss), c2 = airAt(ss + 0.02); if (c.z <= 4.5 && c2.z < c.z) { sC = ss; break; } }
      const q = airAt(sC);
      let nb = null;
      for (const n of who) {
        if (n === 2 && rad(q) > 70 && Math.abs(spray) < 60) continue;
        const d = dist(F[n], q); if (!nb || d < nb.d) nb = { n, d };
      }
      const sp = SPEED(nb.n), can = reach(sC, sp.react, sp.v, sp.a);
      F[nb.n] = lerp(q, F[nb.n], Math.min(1, (can * 0.8) / Math.max(1e-3, nb.d)));
      T[nb.n].start = { ...F[nb.n] };
      best = pick();
      if (!best || best.n !== nb.n && best.s > sC) best = { n: nb.n, s: sC, q };
    }
    const n = best.n, sp = SPEED(n);
    // he takes it a little before it reaches the ground (glove height) or as it comes to him
    let s = best.s, q = best.q;
    for (let ss = best.s; ss < tEnd; ss += 1 / 60) {
      const c = catchable(ss);
      if (!c) continue;
      if (dist(F[n], c) > reach(ss, sp.react, sp.v, sp.a) + 3) break;
      if (c.z <= 6.2 && c.z >= 2.5) { s = ss; q = c; break; }
      if (c.z < 2.5) break;
    }
    const stand = { x: q.x, y: q.y };
    const deep = rad(stand) > W - 22 && OF.includes(n);
    ctx.deep = rad(stand) > 200;
    // (a routine one: he gets there and settles under it, a second or more before it comes down, as a
    // real fielder does; one he has to run down he takes on the run, as before)
    const need = sp.react + runTime(dist(F[n], stand), sp.v, sp.a, true, true);
    const settle = !deep && ctx.bb !== 'line' && need < s - 1.2 ? Math.max(need + 0.15, s - 1.6) : null;
    // (a runner on third tagging: an outfielder with the time sets up a few steps behind the catch and comes
    // in through it, his momentum toward the plate, as a strong arm does to throw through)
    const tagHome = kind === 'air_out' && OF.includes(n) && settle != null && ctx.moves.some((m) => m.from === 3 && (m.to === 4 || m.to === -1));
    if (tagHome) {
      const toHome = { x: -stand.x, y: -stand.y }, dl = Math.hypot(toHome.x, toHome.y) || 1;
      const behind = { x: stand.x - toHome.x / dl * 7, y: stand.y - toHome.y / dl * 7 };
      T[n].arrive(sp.react, behind, Math.max(need + 0.15, s - 1.4), { toRest: true, v: sp.v });
      T[n].hold(s - 0.55);
      T[n].arrive(s - 0.55, stand, s, { toRest: false, v: 18 });
    } else {
      const t1 = settle != null ? settle : Math.max(sp.react + 0.4, s - (deep ? 0.04 : 0.35));
      const nLegs = T[n].legs.length;
      const arrive = T[n].arrive(sp.react, stand, t1, { toRest: !deep, v: sp.v });
      // (there early and at rest, he waits under it: whatever he does next starts at the catch, never
      // before it. One who could only run through the spot takes it on the run instead, there exactly at
      // the catch: held there he stopped dead in a frame, check-jolt.mjs)
      if (!deep && arrive < s) {
        if (Math.abs(arrive - t1) < 1e-3) T[n].hold(s);
        else { T[n].legs.length = nLegs; T[n].arrive(sp.react, stand, s, { toRest: false, v: sp.v }); }
      }
    }
    T[n].act(s - 0.45, 'reach', { ball: q });
    T[n].act(s, kind === 'air_drop' ? 'drop' : 'catch', { ball: q, high: q.z, wall: deep });
    p.segs.push({ kind: 'air', t0: 0, t1: s, at: airAt });
    p.events.push({ s: 0.25, kind: 'crowd', cue: rad(q) > 250 ? 'rise' : 'murmur' });
    p.events.push({ s, kind: kind === 'air_drop' ? 'drop' : 'catch', by: n, z: q.z, wall: deep });
    p.events.push({ s, kind: 'glove', by: n });
    ctx.catchAt = { s, n, q, deep };
    ctx.firstTouch = { s, n, how: kind === 'air_drop' ? 'drop' : 'catch', at: q, fell: false, z: q.z };
    if (kind === 'air_drop') {
      // off the glove and on the grass, picked up a stride away
      const away = { x: q.x + 4, y: q.y - 3 };
      p.segs.push({ kind: 'bobble', t0: s, t1: s + 0.5, a: { ...q, z: q.z }, b: { ...away, z: BALL_R } });
      T[n].act(s + 0.02, 'bobble');
      const pk = T[n].run(s + 0.3, [lerp(stand, away, 0.8)], { v: 12 }) + 0.1;
      T[n].act(pk, 'pickup', { ball: away });
      p.segs.push({ kind: 'loose', t0: s + 0.5, t1: pk, at: away });
      ctx.firstTouch.error = ctx.label === 'error';
      if (ctx.label === 'fielders_choice') ctx.firstTouch.trap = true;
      holdThenThrow(ctx, n, pk, lerp(stand, away, 0.8), false);
      return;
    }
    holdThenThrow(ctx, n, s, stand, false);
    return;
  }
  // ---- a hit that falls in: nobody gets there in time
  for (let guard = 0; guard < 60; guard++) {
    const b = pick();
    if (!b) break;
    // a step further off for whoever would have had it (sideways from the ball's line, and deeper
    // for an infielder, shallower for an outfielder on a ball over his head)
    const n = b.n;
    const q = b.q, d = dist(F[n], q) || 1;
    const away = { x: (F[n].x - q.x) / d, y: (F[n].y - q.y) / d };
    F[n] = { x: F[n].x + away.x * 4, y: F[n].y + away.y * 4 };
    T[n].start = { ...F[n] };
  }
  const land = airAt(tEnd);
  p.segs.push({ kind: 'air', t0: 0, t1: tEnd, at: airAt });
  p.events.push({ s: 0.25, kind: 'crowd', cue: rad(land) > 250 ? 'rise' : 'murmur' });
  p.events.push({ s: tEnd, kind: f.bounced ? 'wall' : 'lands', at: land });
  // the nearest fielders chase it, the closest arriving just as it lands (a dive on a sinking liner)
  const chasers = who.filter((n) => n !== 2).map((n) => ({ n, d: dist(F[n], land) })).sort((a, b) => a.d - b.d);
  const c0 = chasers[0];
  // then it rolls: off the grass (or back off the wall) and the chaser runs it down
  const lh = f.bounced ? Math.max(30, W - 0.5) : rad({ x: land.x - ctx.contact.x, y: land.y - ctx.contact.y });
  const back = f.bounced ? -1 : 1;
  const vRoll = f.bounced ? 14 : Math.max(18, Math.abs(f.vhEnd) * 0.5), mu = f.bounced ? 1.6 : 1.1;
  const rollAt = (s) => {
    const k = Math.max(0, s - tEnd);
    let r = lh + back * (vRoll / mu) * (1 - Math.exp(-mu * k));
    const Wl = wallDist(spray) - 1;
    if (r > Wl) r = Wl - (r - Wl) * 0.3;
    return { x: ctx.contact.x + u.x * r, y: ctx.contact.y + u.y * r };
  };
  const rollZ = (s) => { const k = s - tEnd; const h0 = Math.min(6, Math.abs(f.vzEnd) * 0.08); return k < 0.5 ? BALL_R + 4 * h0 * (k / 0.5) * (1 - k / 0.5) : BALL_R; };
  const sp0 = SPEED(c0.n);
  let pk = null;
  for (let s = tEnd + 0.25; s < tEnd + 8; s += 1 / 30) {
    const b = rollAt(s);
    if (dist(F[c0.n], b) <= reach(s, sp0.react, sp0.v, sp0.a) + 2) { pk = { s: Math.max(s, tEnd + 0.35), b }; break; }
  }
  if (!pk) pk = { s: tEnd + 2, b: rollAt(tEnd + 2) };
  const stand = lerp(F[c0.n], pk.b, Math.max(0, (dist(F[c0.n], pk.b) - 2) / Math.max(1e-3, dist(F[c0.n], pk.b))));
  T[c0.n].arrive(sp0.react, stand, pk.s - 0.05, { toRest: true });
  T[c0.n].act(pk.s - 0.3, 'set');
  T[c0.n].act(pk.s, 'pickup', { ball: pk.b });
  if (dist(F[c0.n], land) < 60 && !f.bounced && ctx.bb === 'line') T[c0.n].act(tEnd - 0.15, 'dive_short', { at: land });
  p.segs.push({ kind: 'roll', t0: tEnd, t1: pk.s, at: (s) => ({ ...rollAt(s), z: rollZ(s) }) });
  ctx.firstTouch = { s: pk.s, n: c0.n, how: 'pickup', at: pk.b, fell: true, landAt: tEnd, land };
  ctx.landAt = tEnd;
  afterRetrieve(ctx, c0.n, pk.s, pk.b);
}

/** A hit picked up in the outfield (or the infield): the throw in, to the base where a runner is
    out, or to the cutoff man. */
function afterRetrieve(ctx, n, s, at) {
  const outs = putouts(ctx).filter((o) => o.base != null);
  if (outs.length) { holdThenThrow(ctx, n, s, at, false); return; }
  ctx.p.segs.push({ kind: 'held', t0: s, by: n, t1: null });
  // the throw in: to second (or third on an extra base hit) through the cutoff man's spot
  const lead = Math.max(...ctx.moves.filter((m) => m.to >= 1 && m.to <= 3).map((m) => m.to), 1);
  const tb = Math.min(3, lead + 1);
  const cov = tb === 3 ? 5 : ctx.spray >= 0 ? 4 : 6;
  const cut = rad(at) > 200 ? lerp(at, basePoint(tb, 'bag'), 0.45) : basePoint(tb, 'bag');
  const T = ctx.T[cov];
  const arr = T.run(SPEED(cov).react + 0.3, [cut], { toRest: true });
  T.act(arr, 'cover', { base: tb });
  const fly = dist(at, cut) / 120 + 0.06;
  const rel = Math.max(s + 0.55, arr - fly + 0.1);
  throwBall(ctx, n, cov, rel, at, cut, fly);
  ctx.lastHolder = cov;
}

/* ---- runners ---- */

/** The path from base a to base b (rounding the bases between) as points. */
function basePath(a, b, start) {
  const pts = [];
  for (let k = a + 1; k <= b; k++) {
    const q = BASE[k];
    if (k < b) {
      // rounding: swing out a few feet before the bag, touch its inside corner
      const prev = BASE[k - 1], dir = { x: q.x - prev.x, y: q.y - prev.y }, L = Math.hypot(dir.x, dir.y);
      const out = { x: q.x - 0 * 1, y: q.y };
      const ox = q.x - 0, oy = q.y - 63.64, ol = Math.hypot(ox, oy) || 1;
      pts.push({ x: q.x - dir.x / L * 12 + ox / ol * 5, y: q.y - dir.y / L * 12 + oy / ol * 5 });
      pts.push(out);
    } else pts.push(q);
  }
  void start;
  return pts;
}

function planRunners(ctx) {
  const { p, moves, kind, before, o, pr } = ctx;
  const bats = ctx.bats;
  const box = { x: bats === 'L' ? 2.95 : -2.95, y: 0.4 };
  const hr = kind === 'hr';
  const putMap = new Map((ctx.putouts || []).map((x) => [x.from, x]));
  // the outfield catch decides when runners may go (they tag up), and when the batter is out
  const caught = ctx.catchAt && kind === 'air_out';
  const runners = [];
  // the runners already on: those who move, and those who stay
  const on = [];
  for (const b of [3, 2, 1]) if (before & (1 << (b - 1))) on.push(b);
  for (const b of on) if (!moves.some((m) => m.from === b)) moves.push({ from: b, to: b });
  moves.sort((a, b) => b.from - a.from);
  for (const m of moves) {
    const isB = m.from === 0;
    const start = isB ? box : leadOff(m.from);
    const tr = new Track(start, { v: hr ? 21 : isB ? 26.5 : 27, a: 16 });
    const r = { from: m.from, to: m.to, track: tr, out: m.to === -1, batter: isB, safeAt: m.to >= 1 ? m.to : null };
    runners.push(r);
    const po = putMap.get(m.from);
    const go0 = isB ? 0.28 : 0.15;
    if (hr) {
      // the trot: the batter last, the others a beat ahead of him, everyone round to home
      // (the batter's trot is the clock: each runner ahead of him crosses half a second apart, just
      // before he does, so the cut to the plate shows every run score)
      const t0 = isB ? 0.9 : 0.6;
      const pts = isB ? [BASE[1], ...basePath(1, 4)] : basePath(m.from, 4);
      if (isB) { const end = tr.run(t0, pts, { v: 19.5, fromRest: true, toRest: true }); r.arrive = end; r.scoreAt = end; continue; }
      runners.push(r);
      r.hrPts = pts;
      runners.pop();
      r.hrLater = true;
      continue;
    }
    const air = kind === 'air_out' || kind === 'air_drop' || kind === 'air_hit';
    if (m.to === m.from) {
      const off = leadOff(m.from), next = BASE[Math.min(4, m.from + 1)];
      // two out: he runs on contact whatever the ball. When the play makes the third out (the catch,
      // or the throw beating the hitter) he pulls up short of the next bag and jogs back to his own
      const third = ctx.outs0 === 2 && (pr.outs ?? 0) >= 3 ? (caught ? ctx.catchAt.s : Math.max(0, ...(ctx.putouts || []).map((x) => x.ballAt ?? 0))) : 0;
      if (third > 0.5) {
        tr.arrive(0.15, lerp(off, next, 0.85), Math.max(1.2, third + 0.2), { toRest: true });
        r.arrive = tr.run(Math.max(tr.free, third + 0.6), [BASE[m.from]], { v: 9, toRest: true });
        continue;
      }
      // stays: on a ground ball a step off and back; on a fly with fewer than two out he goes partway
      // (farther on a deep one), watches, and goes back to the bag once it is caught or played
      // (a fly caught with fewer than two out: he tags, on the bag at the catch, and bluffs: a few hard
      // strides toward the next bag as the ball is caught, a stop, and back)
      if (caught && ctx.outs0 < 2) {
        const tc = ctx.catchAt.s;
        tr.run(0.2, [BASE[m.from]], { v: 9, toRest: true });
        tr.hold(tc + 0.08);
        const fake = lerp(BASE[m.from], next, m.from === 3 ? 0.2 : 0.15);
        tr.run(tc + 0.08, [fake], { fromRest: true, toRest: true, v: 22 });
        r.arrive = tr.run(tr.free + 0.25, [BASE[m.from]], { v: 12, toRest: true });
        r.bluff = true;
        continue;
      }
      const deep = air && ctx.flight ? clamp((p.flight && p.flight.land ? rad(p.flight.land) : 200) / 300, 0, 1) : 0;
      const half = lerp(off, next, air ? 0.2 + 0.2 * deep : 0.12);
      const t1 = tr.run(0.3, [half], { v: air ? 16 : 12 });
      r.arrive = tr.run(Math.max(t1 + 0.2, (ctx.firstTouch ? ctx.firstTouch.s : 1) + 0.1), [BASE[m.from]], { v: 14 });
      continue;
    }
    if (caught) {
      if (isB) {
        // the batter runs it out until the catch, then peels off
        const tc = ctx.catchAt.s;
        const pts = [BASE[1]];
        tr.run(go0, pts, { toRest: true });
        tr.stopAt = tc + 0.4;
        r.arrive = null; r.outAt = tc; r.outBase = null;
        continue;
      }
      if (m.to === -1) {
        const ob = po ? po.base : m.from;
        if (ob === m.from) {
          // doubled off: he was off with the crack, and the throw beats him back
          const wentTo = lerp(BASE[m.from], BASE[m.from + 1], 0.42);
          tr.run(go0, [wentTo], { toRest: true });
          const back = po && po.ballAt ? po.ballAt + 0.18 + 0.25 * rnd(ctx.id, 'dbl') : ctx.catchAt.s + 1.6;
          tr.arrive(Math.max(ctx.catchAt.s + 0.15, tr.free), BASE[m.from], back, { v: 26 });
          r.arrive = back; r.outAt = po ? po.ballAt : back; r.outBase = m.from;
        } else {
          // tagged and went: thrown out at the next base
          // (a step late, bang bang: the throw beats him by a few hundredths to a fifth of a second)
          const tAt = po && po.ballAt ? po.ballAt + 0.06 + 0.16 * rnd(ctx.id, 'tag') : ctx.catchAt.s + 3;
          tr.arrive(ctx.catchAt.s + 0.08, BASE[ob], tAt, { v: 27, toRest: true });
          r.arrive = tAt; r.outAt = po ? po.ballAt : tAt; r.outBase = ob;
        }
        continue;
      }
      // tags up: back on the bag as the ball goes up, and gone the instant it is caught (never before)
      const pts = basePath(m.from, m.to);
      tr.run(0.2, [BASE[m.from]], { v: 9, toRest: true });
      const end = tr.run(Math.max(tr.free, ctx.catchAt.s + 0.08), pts, { fromRest: true, toRest: true });
      r.arrive = end; if (m.to === 4) r.scoreAt = end;
      continue;
    }
    // everything else: they run at the crack
    if (m.to === -1) {
      const ob = po ? po.base : Math.min(4, (isB ? 1 : m.from + 1));
      const thru = { x: BASE[1].x + 12, y: BASE[1].y + 12 };
      // the batter out at first runs through the bag; out further on, he went round first
      const pts = isB ? (ob === 1 ? [thru] : [...roundFirst(), ...basePath(1, ob)]) : basePath(m.from, ob);
      const goal = isB && ob === 1 ? BASE[1] : BASE[ob];
      // (a fly with fewer than two out: halfway first, as every runner on does)
      const hold = !isB && kind === 'air_hit' && ctx.outs0 < 2 && ctx.landAt != null;
      const go = (v) => {
        tr.legs = [];
        if (hold) {
          tr.run(go0, [lerp(leadOff(m.from), BASE[Math.min(4, m.from + 1)], 0.5)], { v: 22, toRest: true });
          tr.run(Math.max(tr.free, ctx.landAt - 0.7), pts, { fromRest: true, toRest: true, v });
        } else tr.run(go0, pts, { toRest: true, v });
      };
      go(undefined);
      // thrown out: the ball gets there first (by a step, or by a mile)
      const ball = po && po.ballAt != null ? po.ballAt : timeAtPoint(tr, goal);
      const margin = 0.08 + 0.45 * rnd(ctx.id, 'out' + m.from);
      if (timeAtPoint(tr, goal) < ball + margin) {
        // slower along the same path, so he reaches the bag just after the ball
        let lo = 4, hi = tr.v;
        for (let i = 0; i < 24; i++) {
          const v = (lo + hi) / 2;
          go(v);
          if (timeAtPoint(tr, goal) < ball + margin) hi = v; else lo = v;
        }
        go(lo);
      }
      r.arrive = timeAtPoint(tr, goal);
      r.outAt = ball; r.outBase = ob;
      continue;
    }
    const pts = isB ? (m.to === 1 ? [{ x: BASE[1].x + 12, y: BASE[1].y + 12 }] : [BASE[1], ...basePath(1, m.to)].filter((q, i) => i > 0 || m.to > 1)) : basePath(m.from, m.to);
    if (isB && m.to > 1) { pts.splice(0, pts.length, ...[...roundFirst(), ...basePath(1, m.to)]); }
    let end;
    if (!isB && kind === 'air_hit' && ctx.outs0 < 2 && ctx.landAt != null) {
      // a fly that might be caught, fewer than two out: halfway, and on as soon as it is clear it
      // drops (a beat before it lands: a fielder short of it is plain by then)
      const half = lerp(leadOff(m.from), BASE[Math.min(4, m.from + 1)], 0.5);
      tr.run(go0, [half], { v: 22, toRest: true });
      end = tr.run(Math.max(tr.free, ctx.landAt - 0.7), pts, { fromRest: true, toRest: true });
    } else end = tr.run(go0, pts, { toRest: true });
    if (isB && m.to === 1) {
      // safe at first: through the bag, beating the throw if there was one
      const late = ctx.lateThrow;
      let at1 = timeAtPoint(tr, BASE[1]);
      if (late && at1 > late.arrive - 0.1) { tr.legs = []; tr.arrive(go0, { x: BASE[1].x + 12, y: BASE[1].y + 12 }, late.arrive - 0.15 + 0.45, { toRest: true }); at1 = timeAtPoint(tr, BASE[1]); end = tr.free; }
      if (kind === 'air_hit' || kind === 'ground_hit' && !ctx.lateThrow) {
        // a single to the outfield: he rounds the bag and stops a few feet past it
        tr.legs = [];
        const ro = { x: BASE[1].x + 4, y: BASE[1].y + 14 };
        end = tr.run(go0, [{ x: BASE[1].x - 6, y: BASE[1].y - 9 }, BASE[1], ro], { toRest: true });
        end = tr.run(end + 0.25, [BASE[1]], { v: 8 });
      }
      r.arrive = Math.min(end, at1 + 0.6);
      r.firstAt = at1;
      continue;
    }
    r.arrive = end; if (m.to === 4) r.scoreAt = end;
  }
  // the home run's runners, timed off the batter's trot
  const hb = runners.find((r) => r.batter);
  const ahead = runners.filter((r) => r.hrLater).sort((a, b) => b.from - a.from);
  ahead.forEach((r, i) => {
    const want = hb.scoreAt - 1.5 + i * 0.45;
    const d = r.hrPts.reduce((acc, q, k) => acc + dist(k ? r.hrPts[k - 1] : r.track.start, q), 0);
    const v = clamp(d / Math.max(1, want - 0.6 - 0.9), 9, 21);
    const end = r.track.run(Math.max(0.6, want - runTime(d, v, 16, true, true)), r.hrPts, { v, fromRest: true, toRest: true });
    r.arrive = end; r.scoreAt = end;
  });
  // nobody passes the runner ahead of him (a hitter racing round behind a runner held halfway on a
  // fly): the one behind runs at the pace that keeps him behind, his whole run eased by one factor
  const order = runners.filter((r) => !r.hrLater).sort((a, b) => b.from - a.from);
  for (let i = 1; i < order.length; i++) {
    const back = order[i];
    if (passes(back, order.slice(0, i), pr)) {
      const at0 = back.track.at.bind(back.track);
      let k = 1;
      for (; k > 0.5 && passes(back, order.slice(0, i), pr); k -= 0.04) {
        const kk = k - 0.04;
        back.track.at = (t) => { const q = at0(t * kk); return { ...q, spd: q.spd * kk }; };
      }
      const f = back.track.at === at0 ? 1 : 1 / Math.max(0.5, k);
      for (const key of ['arrive', 'scoreAt', 'firstAt']) if (back[key] != null && !(back.out && key === 'arrive' && back.outAt != null)) back[key] *= f;
      if (back.track.stopAt != null) back.track.stopAt *= f;
    }
  }
  // the order in time of everything that ends a runner's part
  for (const r of runners) {
    if (r.scoreAt != null) p.events.push({ s: r.scoreAt, kind: 'run', runner: r.from });
    if (r.batter) ctx.batterArrival = r.firstAt ?? r.arrive;
  }
  p.runners = runners;
  // a tag play: the ball beats him, the fielder waits on the bag and the out is the tag itself, as the
  // runner gets there (a force is out the moment the ball is in the glove on the bag)
  for (const e of p.events) {
    if (e.kind !== 'out' || e.force) continue;
    const r = runners.find((x) => x.from === e.runner);
    if (!r || r.arrive == null) continue;
    const tagAt = Math.max(e.s + 0.12, r.arrive - 0.06);
    const a = ctx.T[e.by].acts.find((x) => x.kind === 'tag' && Math.abs(x.t - e.s) < 1e-3);
    if (a) a.tagAt = tagAt;
    const po = (ctx.putouts || []).find((x) => x.from === e.runner);
    if (po) po.tagAt = tagAt;
    e.ballAt = e.s; e.s = tagAt; r.outAt = tagAt;
  }
  void o;
}

/** The batter's way to first on an extra base hit: he cuts the corner on his way round. */
function roundFirst() { return [{ x: BASE[1].x - 10, y: BASE[1].y - 14 }, { x: BASE[1].x + 4, y: BASE[1].y - 2 }]; }
/** Does runner r (behind) pass any of the runners ahead while both still run? (verify() holds the same) */
function passes(r, ahead, pr) {
  for (const f of ahead) {
    let pb = r.from, pf = f.from;
    for (let t = 0; t <= 16; t += 0.05) {
      pb = pathProg(r.track.at(t), pb); pf = pathProg(f.track.at(t), pf);
      const live = (x) => !(x.out && x.outAt != null && t >= x.outAt) && !(x.scoreAt != null && t >= x.scoreAt - 0.05);
      if (live(r) && live(f) && pb > pf + 0.02) return true;
    }
  }
  return false;
}
/** A place on the base paths (0 home .. 4 home again) for a point, followed along from prev. */
function pathProg(q, prev) {
  let best = { d: Infinity, p: prev };
  for (let k = Math.floor(prev); k <= Math.min(3, Math.floor(prev) + 1); k++) {
    const a = BASE[k], b = BASE[k + 1], dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy;
    const u = clamp(((q.x - a.x) * dx + (q.y - a.y) * dy) / L2, 0, 1);
    const d = Math.hypot(a.x + dx * u - q.x, a.y + dy * u - q.y);
    if (d < best.d - 1e-6) best = { d, p: k + u };
  }
  return best.p;
}

function leadOff(b) {
  const q = BASE[b], nx = BASE[Math.min(4, b + 1)];
  return lerp(q, nx, b === 3 ? 0.11 : 0.13);
}
function timeAtPoint(tr, q) {
  // the first leg that passes within 1.5 ft of q, and the moment on it (the run's profile inverted)
  for (const l of tr.legs) {
    const dx = l.b.x - l.a.x, dy = l.b.y - l.a.y, L2 = dx * dx + dy * dy || 1;
    const k = clamp(((q.x - l.a.x) * dx + (q.y - l.a.y) * dy) / L2, 0, 1);
    if (Math.hypot(l.a.x + dx * k - q.x, l.a.y + dy * k - q.y) > 1.5) continue;
    const g = l.g, want = l.f0 + (l.f1 - l.f0) * k;
    let lo = 0, hi = 1;
    for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (along(m, g.al, g.be) < want) lo = m; else hi = m; }
    return g.t0 + g.T * hi;
  }
  return INF;
}

/* ---- the fielders not in the play ---- */

function planRest(ctx) {
  const { T, F, kind } = ctx;
  const busy = new Set();
  for (const n of Object.keys(T)) if (T[n].legs.length || T[n].acts.length) busy.add(+n);
  const ball = ctx.firstTouch ? ctx.firstTouch.at : { x: 0, y: 150 };
  const tB = ctx.firstTouch ? ctx.firstTouch.s : 2;
  for (let n = 1; n <= 9; n++) {
    if (busy.has(n)) continue;
    const sp = SPEED(n), tr = T[n];
    if (n === 2) continue;   // the real catcher stays at the plate
    if (IF.includes(n)) {
      // a few steps toward the ball, then to his base if a runner may come to it
      const b = n === 3 ? 1 : n === 5 ? 3 : n === 6 && ctx.spray < 0 ? null : 2;
      if (b && (kind !== 'air_out' || n === 3)) { const arr = tr.run(sp.react + 0.1, [basePoint(b, 'bag')], { toRest: true }); tr.act(arr, 'cover', { base: b }); }
      else tr.run(sp.react, [lerp(F[n], ball, 8 / Math.max(8, dist(F[n], ball)))], { toRest: true, v: 10 });
    } else if (n === 1) {
      // backs up a base or drifts toward the line
      tr.run(0.4, [{ x: 4, y: 52 }], { v: 8, toRest: true });
    } else {
      // outfielders back up the play: toward the ball, stopping well short
      const d = dist(F[n], ball), go = Math.min(d - 35, kind === 'ground_play' ? 25 : 70);
      if (go > 4) tr.run(sp.react + 0.15, [lerp(F[n], ball, go / d)], { toRest: true, v: kind === 'ground_play' ? 14 : 22 });
    }
    void tB;
  }
}

/* ---- the cut ---- */

function planEdit(ctx) {
  const p = ctx.p, kind = ctx.kind, ev = p.events;
  const ft = ctx.firstTouch || { s: 2 };
  const lastOut = Math.max(-1, ...ev.filter((e) => e.kind === 'out').map((e) => e.s));
  const runs = ev.filter((e) => e.kind === 'run').map((e) => e.s).sort((a, b) => a - b);
  const runnerDone = Math.max(0, ...p.runners.filter((r) => !r.out && r.arrive != null && r.arrive < 100).map((r) => r.arrive));
  const throws = ev.filter((e) => e.kind === 'throw').map((e) => e.s);
  const ballDone = Math.max(ft.s, ...ev.filter((e) => e.kind === 'glove').map((e) => e.s));
  // the pitcher's view holds a beat after contact, but the cut comes before anyone touches the ball
  // (a comeback liner caught at a quarter second was caught off screen)
  const CUT = Math.min(0.3, Math.max(0.1, ft.s - 0.15));
  const pieces = [{ s0: 0, s1: CUT, cam: 'pitcher', rate: 1 }];
  let decisive = null, slow = null;
  const add = (cam, s0, s1) => { if (s1 > s0 + 0.05) pieces.push({ s0, s1, cam, rate: 1 }); };
  if (kind === 'hr') {
    const tw = ctx.overAt;
    add('sky', CUT, Math.min(1.15, tw - 0.8));
    add('follow', Math.max(pieces[pieces.length - 1].s1, tw - 2.6), Math.min(p.flight.tLand, tw + 0.6));
    decisive = { s: tw, kind: 'over' };
    slow = [tw - 0.3, tw + 0.18];
    // the trot, cut to the last of it: the runs crossing home
    const bat = p.runners.find((r) => r.batter);
    const first = runs.length ? runs[0] : bat.scoreAt;
    const s0 = Math.max(first - 0.8, bat.scoreAt - 2.1);
    add('plate', s0, bat.scoreAt + 0.5);
    p.resolveAt = tw + 0.1;
  } else {
    // beats: the moments worth seeing, each a window of scene time with a camera. Windows that touch
    // play straight through; a gap is a jump cut (always to another camera). Over the budget, the
    // least needed go first.
    const groundish = kind === 'ground_play' || kind === 'ground_hit';
    const beats = [];
    const touch = ctx.catchAt ? ctx.catchAt.s : ctx.landAt != null ? ctx.landAt : ft.s;
    // the broadcast's camera plan (the owner, 2026-10-26: "a true broadcast feel... show more of the
    // field at once and not pan so fast"): the high home camera ('follow', high behind the plate) is the
    // game camera from contact, a ball on the ground, a liner and a fly ball alike, and holds the infield
    // play whole (the fielder, the ball, the base) in one shot. The high first and third base cameras
    // ('wide') take a runner's moment the high home cannot hold with the ball, the low plate camera a run
    // scoring out of its frame, and the low angle behind the plate ('sky') only a home run or a towering fly.
    const ballCam = 'follow';
    // (a towering one, over four seconds up and down, is cut as before: the low angle on its climb, then
    // the high home on its way down to the man under it)
    if (!groundish && touch - CUT > 4.2) {
      const skyEnd = Math.min(Math.max(CUT + 0.6, apexTime(ctx) * 0.7), 1.4, touch - 0.8);
      beats.push({ s0: CUT, s1: skyEnd, cam: 'sky', pri: 9 });
      beats.push({ s0: Math.max(skyEnd, touch - 2.1), s1: touch + 0.55, cam: 'follow', pri: 9 });
    } else beats.push({ s0: CUT, s1: Math.max(touch + 0.55, CUT + 1.6), cam: 'follow', pri: 9 });
    // (an infield play: fielded by an infielder on the infield, the high home's one shot)
    const infPlay = groundish && ft.n != null && ft.n <= 6 && Math.hypot(ft.at ? ft.at.x : 0, ft.at ? ft.at.y : 0) < 160;
    // the ball picked up after a hit, and the throw in
    if (ft.s > touch + 0.2) beats.push({ s0: ft.s - 0.8, s1: ft.s + 0.4, cam: ballCam, pri: 3 });
    // every putout: the throw and the tag or the bag
    for (const po of (ctx.putouts || [])) {
      const thr = ev.filter((e) => e.kind === 'throw' && e.s <= po.ballAt + 1e-6).pop();
      // (a tag play: until the tag, after the ball is in)
      const outT = po.tagAt ?? po.ballAt;
      // (the relay of a double play is seen from the side: down the line, the pivot man and the man
      // taking it one behind the other in a narrow frame, not side by side across a phone, so the
      // pivot's tight shot cuts to it as the ball leaves instead of pulling back to the whole infield)
      const sg = thr && p.segs.find((x) => x.kind === 'throw' && Math.abs(x.t0 - thr.s) < 1e-6);
      const relay = (ctx.putouts || []).indexOf(po) > 0;
      const long = relay && sg && Math.hypot(sg.b.x - sg.a.x, sg.b.y - sg.a.y) > 70;
      // (on the ground the high home holds it all, the plate too: one shot)
      beats.push({ s0: (thr ? thr.s : po.ballAt) - 0.35, s1: outT + 0.45, cam: infPlay ? 'follow' : po.base === 4 ? 'plate' : long ? 'wide' : 'follow', pri: 8, m: outT });
    }
    // a tag-up: the catch, then straight to the runner leaving his bag on it (the umpire's look)
    if (ctx.catchAt && kind === 'air_out') {
      const tg = p.runners.filter((r) => !r.batter && r.to > r.from);
      if (tg.length) beats.push({ s0: ctx.catchAt.s + 0.12, s1: ctx.catchAt.s + 1.2, cam: 'wide', pri: 7, m: ctx.catchAt.s + 0.3, tagUp: true });
    }
    // runs that score
    // (in an infield play the high home has the plate under it already)
    for (const r of runs) beats.push({ s0: r - 0.9, s1: r + 0.4, cam: infPlay && r < ft.s + 4 ? 'follow' : 'plate', pri: 7, m: r });
    // every runner pulling into his base safe (the hitter on a hit above all): the owner, 2026-10-22,
    // wants to see the play unfold, the out or the safe at the base
    for (const r of p.runners) {
      if (r.out || !(r.to >= 1 && r.to <= 3) || r.arrive == null || r.from === r.to || r.arrive <= 0.8) continue;
      // (an infield play's runners are in the high home's frame with it; a ball in the outfield leaves them to the base cameras)
      beats.push({ s0: r.arrive - 1.1, s1: r.arrive + 0.4, cam: infPlay ? 'follow' : 'wide', pri: r.from === 0 && ctx.hit ? 7 : 6, m: r.arrive });
    }
    const build = (list) => {
      list = list.slice().sort((x, y) => x.s0 - y.s0);
      const out = [{ s0: 0, s1: CUT, cam: 'pitcher', rate: 1 }];
      for (const bt of list) {
        const cur = out[out.length - 1];
        if (bt.s1 <= cur.s1 + 0.05) {
          // a deciding moment inside a longer shot from another camera (a run scoring while the
          // follow camera stays on the ball): cut to it, then back
          // (unless the shot it would cut holds its own deciding moment there: that one stays)
          if (bt.cam !== cur.cam && bt.pri >= 6 && !(cur.m != null && cur.m >= bt.s0 - 0.2 && cur.m <= bt.s1 + 0.2)) {
            const tail = { ...cur, s0: bt.s1 };
            if (bt.s0 > cur.s0 + 0.4) { cur.s1 = bt.s0; out.push({ s0: bt.s0, s1: bt.s1, cam: bt.cam, rate: 1, m: bt.m }); }
            // (it starts with the shot: it opens the shot, the rest follows)
            else { out.pop(); out.push({ s0: cur.s0, s1: bt.s1, cam: bt.cam, rate: 1, m: bt.m }); }
            if (tail.s1 - tail.s0 > 0.4) out.push(tail);
          }
          continue;
        }
        if (bt.s0 <= cur.s1 + (bt.cam === cur.cam && infPlay ? 2.0 : 1.0)) {
          // continuous: the same camera runs on; a new one takes over from where the last ended
          if (bt.cam === cur.cam || cur.cam === 'pitcher' && false) { cur.s1 = bt.s1; if (bt.m != null) cur.m = bt.m; }
          else if (cur.m != null && bt.m != null && bt.m > cur.m + 0.3) {
            // two deciding moments in two shots: the cut between them, each moment in its own
            const cutAt = Math.min(cur.s1, Math.max(cur.m + 0.15, (cur.m + bt.m) / 2));
            cur.s1 = cutAt;
            out.push({ s0: cutAt, s1: bt.s1, cam: bt.cam, rate: 1, m: bt.m });
          } else if (cur.m == null && bt.m != null && bt.s0 < cur.s1 && bt.s0 > cur.s0 + 0.3) {
            // the ball's shot gives way when a deciding moment's shot begins
            cur.s1 = bt.s0;
            out.push({ s0: bt.s0, s1: bt.s1, cam: bt.cam, rate: 1, m: bt.m });
          } else out.push({ s0: cur.s1, s1: bt.s1, cam: bt.cam, rate: 1, m: bt.m });
        } else {
          let cam = bt.cam;
          // (a jump cut changes camera, but a deciding moment keeps the one that shows it)
          if (cam === cur.cam && (bt.m == null || cam === 'follow')) cam = cam === 'wide' ? 'follow' : 'wide';
          out.push({ s0: bt.s0, s1: bt.s1, cam, rate: 1, m: bt.m });
        }
      }
      return out;
    };
    const realOf = (pcs) => pcs.reduce((acc, x) => acc + (x.s1 - x.s0), 0);
    let list = beats.slice();
    if (globalThis.__BEATS) globalThis.__BEATS.push(beats.map((b) => ({ ...b })));
    let pcs = build(list);
    // (5.4 s cut the hitter's run to first and the runs off the end of most hits: now the whole play)
    const BUDGET = 7.2;
    // (a deciding moment, pri 6 and up: an out, a run, a runner safe at his base, is never dropped)
    while (realOf(pcs) > BUDGET && list.some((x) => x.pri < 6)) {
      const lo = Math.min(...list.map((x) => x.pri));
      if (lo >= 6) break;
      const drop = list.filter((x) => x.pri === lo).pop();
      list = list.filter((x) => x !== drop);
      pcs = build(list);
    }
    // still long (a hang time of five seconds and a run): trim the ball's own beat from the front
    if (realOf(pcs) > BUDGET + 0.6) {
      const over = realOf(pcs) - BUDGET;
      const main = pcs.find((x) => x.cam !== 'pitcher' && x.cam !== 'sky' && x.s1 - x.s0 > 2.2);
      // (never past a deciding moment in it: the trim takes only the run up to it)
      const ms = list.filter((b) => b.m != null && main && b.m >= main.s0 && b.m <= main.s1).map((b) => b.m);
      // (nor past the catch or the ball's landing: the one shot from contact holds it)
      if (main && touch >= main.s0 && touch <= main.s1) ms.push(touch);
      if (main) main.s0 = Math.min(main.s1 - 1.6, main.s0 + over, ms.length ? Math.min(...ms) - 0.7 : Infinity);
    }
    pieces.splice(0, pieces.length, ...pcs);
    const lastOut2 = lastOut;
    // the decisive moment, slowed: a catch at the wall, a diving or close play, a run that scores
    const inCut = (t) => pieces.some((x) => x.s0 <= t && x.s1 >= t);
    if (ctx.catchAt && (ctx.catchAt.deep || ctx.catchAt.q.z > 6.5)) { decisive = { s: ctx.catchAt.s, kind: 'catch' }; slow = [ctx.catchAt.s - 0.4, ctx.catchAt.s + 0.2]; }
    else if (lastOut2 > 0 && ctx.putouts && ctx.putouts.length >= 2 && inCut(lastOut2)) { decisive = { s: lastOut2, kind: 'double_play' }; slow = [lastOut2 - 0.3, lastOut2 + 0.15]; }
    else if (runs.length && inCut(runs[0])) { decisive = { s: runs[0], kind: 'run' }; slow = [runs[0] - 0.3, runs[0] + 0.2]; }
    else if (lastOut2 > 0 && inCut(lastOut2)) { const r = p.runners.find((x) => x.outAt === lastOut2); if (r && r.arrive - lastOut2 < 0.25) { decisive = { s: lastOut2, kind: 'bang' }; slow = [lastOut2 - 0.3, lastOut2 + 0.15]; } }
    if (!decisive && kind === 'air_hit' && ctx.flight && ctx.flight.bounced) { decisive = { s: ctx.landAt, kind: 'wall' }; slow = [ctx.landAt - 0.3, ctx.landAt + 0.15]; }
    // the play by play line comes up when the play is decided
    p.resolveAt = ctx.catchAt ? ctx.catchAt.s + 0.1 : lastOut > 0 ? lastOut + 0.05 : ctx.landAt != null ? ctx.landAt + 0.1 : ctx.batterArrival ? Math.min(ctx.batterArrival, ft.s + 1.5) : ft.s + 0.2;
    if (!inCut(p.resolveAt)) p.resolveAt = pieces[pieces.length - 1].s0;
    void throws; void ballDone; void runnerDone;
  }
  // no flash, no rewind: a shot under 0.4 s that follows straight on from another is no shot on a phone,
  // just a blink of another camera (two deciding moments a few hundredths apart in two cameras left one
  // a 0.06 s tail), so the shot before holds on through it; and the cut never runs scene time
  // backwards (a cut placed between two moments before its own shot began made a piece that ended
  // before it started, and the next one replayed the play). The shot that holds on frames the moment
  // it took in (inplay.js brings each deciding moment into whatever shot is on).
  throwSafe(pieces, p);
  tidyCut(pieces, p.segs);
  // (tidying can lay a short shot's start back into a throw: once more, then tidy what that left)
  throwSafe(pieces, p);
  tidyCut(pieces, p.segs);
  // the slow motion piece: split whatever piece holds it
  if (slow) {
    const out = [];
    for (const pc of pieces) {
      if (slow[1] <= pc.s0 || slow[0] >= pc.s1) { out.push(pc); continue; }
      const a = Math.max(pc.s0, slow[0]), b = Math.min(pc.s1, slow[1]);
      if (a > pc.s0) out.push({ ...pc, s1: a });
      out.push({ ...pc, s0: a, s1: b, rate: 0.38 });
      if (b < pc.s1) out.push({ ...pc, s0: b });
    }
    pieces.splice(0, pieces.length, ...out);
  }
  p.edit = pieces;
  p.decisive = decisive;
  p.realDur = pieces.reduce((a, x) => a + (x.s1 - x.s0) / x.rate, 0);
  p.dur = pieces[pieces.length - 1].s1;
  // crowd cues that go with the decisive moment
  if (decisive) p.events.push({ s: decisive.s, kind: 'crowd', cue: decisive.kind === 'over' || decisive.kind === 'run' ? 'roar' : 'big' });
  for (const e of p.events) if (e.kind === 'out') e.crowd = true;
  p.events.sort((a, b) => a.s - b.s);
}

/** No cut while a throw is in the air (the owner, 2026-10-26: the throw, then the base and the result,
    each beat its moment, none over another). A cut that falls while a throw flies moves to the nearest
    edge of the throw that keeps both shots' own deciding moments in them: before the release (the shot
    after takes the throw, from the hand) or a beat after the catch (the shot before holds it to the
    glove). Of the two it picks the one whose shot holds that throw (the ball's own cameras, the plate
    for a throw home, a runner's shot for a throw to his own bag). Only the cut moves: no shot runs
    over another's moment. Pieces are { s0, s1, cam, rate, m }, in order. */
const THROW_HOLD = 0.25, PRE_RELEASE = 0.05, EARLY_THROW = 0.3;
function throwSafe(pieces, p) {
  const throws = p.segs.filter((sg) => sg.kind === 'throw');
  const inAir = (t) => throws.find((sg) => t > sg.t0 + 0.03 && t < sg.t1 - 0.03);
  const home = (sg) => Math.hypot(sg.b.x, sg.b.y) < 12;
  const toBag = (pc, sg) => { const b = bagOf(p, pc.m); return !!b && Math.hypot(sg.b.x - b.x, sg.b.y - b.y) < 20; };
  const holds = (pc, sg) => pc.cam === 'follow' || pc.cam === 'track' || pc.cam === 'sky' || (pc.cam === 'plate' && home(sg)) || toBag(pc, sg);
  // (each shot's deciding moments: every out, run and runner safe, and a tag-up, inside it as built)
  const all = [];
  for (const r of p.runners) { const tq = r.out ? r.outAt : r.scoreAt != null ? r.scoreAt : r.from !== r.to ? r.arrive : null; if (tq != null) all.push(tq); }
  const ca = p.events.find((e) => e.kind === 'catch');
  if (ca && p.runners.some((r) => !r.batter && r.to > r.from)) all.push(ca.s + 0.3);
  for (const pc of pieces) pc.ms = all.filter((t) => t >= pc.s0 - 1e-6 && t <= pc.s1 + 1e-6);
  // (a piece's own m can be a moment outside it, a cut away and back again: only what is in it counts)
  const first = (pc) => (pc.ms.length ? Math.min(...pc.ms) : null), last = (pc) => (pc.ms.length ? Math.max(...pc.ms) : null);
  for (let guard = 0; guard < 4; guard++) {
    let moved = false;
    for (let i = 1; i < pieces.length; i++) {
      const A = pieces[i - 1], B = pieces[i];
      if (A.cam === 'pitcher') continue;
      const th = inAir(A.s1) || inAir(B.s0);
      if (!th || A.earlyCut === th) continue;
      // (a jump cut skips dead time between the two shots: that time stays out. Only the edges move, each
      // within its own side: the shot before holds the throw to the glove as far as the gap allows, and
      // the shot after starts before the release, so it takes the throw from the hand)
      if (B.s0 - A.s1 > 0.05) {
        const e0 = th.t0 - PRE_RELEASE, l0 = th.t1 + THROW_HOLD;
        if (th === inAir(A.s1)) { const to = Math.min(B.s0, l0); if (to > A.s1 + 1e-6) { A.s1 = to; moved = true; } }
        if (th === inAir(B.s0)) { const to = Math.max(A.s1, e0); if (to < B.s0 - 1e-6) { B.s0 = to; moved = true; } }
        continue;
      }
      // (the beat after the catch shortens, to a twentieth of a second at least, when the next shot's
      // moment comes that soon after it)
      const early = th.t0 - PRE_RELEASE, bF0 = first(B), late = bF0 == null ? th.t1 + THROW_HOLD : clamp(bF0 - 0.2, th.t1 + 0.05, th.t1 + THROW_HOLD);
      // (a shot keeps its moment with a fifth of a second around it)
      const aL = last(A), bF = first(B);
      // (two runners' shots at bags far apart are two shots: one crane cannot hold both, so the one
      // before never holds on into the other's)
      const ba = bagOf(p, aL), bb = bagOf(p, bF);
      const apart = A.cam === 'wide' && B.cam === 'wide' && ba && bb && Math.hypot(ba.x - bb.x, ba.y - bb.y) > 80;
      const okEarly = (aL == null || aL <= early - 0.2) && (bF == null || bF >= early);
      const okLate = !apart && (bF == null || bF >= late + 0.2) && (aL == null || aL <= late) && late < B.s1 - 0.1;
      // (a shot that holds this throw keeps it to the glove when the next shot's moment is the throw's own
      // arrival: a runner doubled off his bag is the tag-up shot's to show, not a cut's)
      const arrival = !apart && bF != null && bF >= th.t1 - 0.1 && bF <= late && toBag(B, th) && A.cam !== 'track' && A.cam !== 'sky' && B.ms.every((t) => t <= late);
      // (and an early cut that would leave the shot before too short to read is no option when the late one is)
      const shortA = early - A.s0 < MIN_SHOT;
      const useLate = (holds(A, th) && (okLate || arrival)) || (okLate && (!okEarly || shortA)) ? true : okEarly ? false : holds(A, th) && !apart;
      // (neither: the shot before has its moment just as the throw leaves. It shows it, and the cut comes
      // in the throw's first stretch, EARLY_THROW of its flight at most, to a shot that holds the ball in
      // the air: the ball has only just left the hand, and the next shot picks it up on its way)
      const soon = th.t0 + EARLY_THROW * (th.t1 - th.t0);
      if (!useLate && !okEarly && aL != null && aL + 0.15 <= soon && holds(B, th) && (bF == null || bF >= soon)) {
        const cut = Math.max(aL + 0.15, early);
        A.s1 = cut; B.s0 = cut; A.earlyCut = th; moved = true;
        continue;
      }
      if (useLate) { A.s1 = Math.max(A.s1, late); B.s0 = Math.max(B.s0, late); A.ms = A.ms.concat(B.ms.filter((t) => t < B.s0)); B.ms = B.ms.filter((t) => t >= B.s0); if (B.s0 >= B.s1 - 1e-6) { if (A.m == null) A.m = B.m; A.ms = A.ms.concat(B.ms); A.s1 = Math.max(A.s1, B.s1); pieces.splice(i, 1); i--; } }
      else { A.s1 = Math.max(A.s0, Math.min(A.s1, early)); B.s0 = Math.min(B.s0, early); if (B.s0 < A.s1) B.s0 = A.s1; B.ms = B.ms.concat(A.ms.filter((t) => t > A.s1)); A.ms = A.ms.filter((t) => t <= A.s1); if (A.s1 <= A.s0 + 1e-6) { pieces.splice(i - 1, 1); i--; } }
      moved = true;
    }
    if (!moved) break;
  }
}

/** The bag a runner's shot is about: the base of the deciding moment at m (an out, a run, a runner
    safe, or a runner tagging up off his bag a beat after a catch), or null. Feet, catcher's view. */
export function bagOf(p, m) {
  if (m == null) return null;
  for (const r of p.runners) {
    const tq = r.out ? r.outAt : r.scoreAt != null ? r.scoreAt : r.arrive;
    if (tq != null && Math.abs(tq - m) < 0.05) return BASE[r.out ? r.outBase : Math.min(4, r.to)] || null;
  }
  const ca = p.events.find((e) => e.kind === 'catch');
  if (ca && Math.abs(ca.s + 0.3 - m) < 0.05) { const r = p.runners.filter((x) => !x.batter && x.to > x.from).sort((x, y) => y.from - x.from)[0]; if (r) return BASE[r.from]; }
  return null;
}

/** The cut, in order: never backwards, no shot under MIN_SHOT (folded into the one before it, or
    lengthened back into the gap before a jump cut). Pieces are { s0, s1, cam, rate, m }. */
const MIN_SHOT = 0.6;
function tidyCut(pieces, segs = []) {
  const flying = (t) => segs.some((sg) => sg.kind === 'throw' && t > sg.t0 + 0.03 && t < sg.t1 - 0.03);
  const out = [pieces[0]];
  for (let k = 1; k < pieces.length; k++) {
    const src = pieces[k];
    const pc = { ...src }, prev = out[out.length - 1];
    if (pc.s0 < prev.s1) pc.s0 = prev.s1;                       // (never back over what was shown)
    // (a shot is the run of pieces of one camera that follow straight on: two beats of the wide camera
    // back to back are one shot, however short each)
    let end = pc.s1;
    for (let j = k + 1; j < pieces.length && pieces[j].cam === pc.cam && Math.abs(pieces[j].s0 - end) < 1e-6; j++) end = pieces[j].s1;
    if (end - pc.s0 >= MIN_SHOT) { out.push(pc); continue; }
    if (pc.s1 <= pc.s0) continue;                               // (nothing left of it)
    // (straight on from a shot with room to spare, and a moment of its own: the cut comes earlier, so it
    // is long enough to read)
    const cut = pc.s1 - MIN_SHOT;
    if (pc.s0 - prev.s1 < 1e-6 && prev.cam !== 'pitcher' && pc.m != null && cut - prev.s0 >= MIN_SHOT && (prev.m == null || prev.m <= cut - 0.15) && !flying(cut)) {
      prev.s1 = cut; pc.s0 = cut; out.push(pc); continue;
    }
    if (pc.s0 - prev.s1 < 1e-6 && prev.cam !== 'pitcher') {
      // straight on from the shot before: that camera holds on through it
      prev.s1 = pc.s1;
      if (pc.m != null && prev.m == null) prev.m = pc.m;
      continue;
    }
    // after a jump cut (or the pitcher's view): it starts earlier, into the gap, to make a shot
    pc.s0 = Math.max(prev.s1, pc.s1 - MIN_SHOT);
    if (pc.s1 - pc.s0 < MIN_SHOT && pc.s0 - prev.s1 < 1e-6 && prev.cam !== 'pitcher') { prev.s1 = pc.s1; continue; }
    out.push(pc);
  }
  // (a short one straight after the pitcher's view, with nothing before it to hold on: the shot after
  // it starts where it did instead)
  for (let i = 1; i < out.length - 1; i++) {
    const pc = out[i], nx = out[i + 1];
    if (pc.s1 - pc.s0 < MIN_SHOT && out[i - 1].cam === 'pitcher' && nx.s0 - pc.s1 < 1e-6) { nx.s0 = pc.s0; if (pc.m != null && nx.m == null) nx.m = pc.m; out.splice(i, 1); i--; }
    // (or, with a jump cut after it, it runs on into the gap until it is long enough to read)
    else if (pc.s1 - pc.s0 < MIN_SHOT && out[i - 1].cam === 'pitcher' && nx.s0 - pc.s1 > 1e-6) pc.s1 = Math.min(nx.s0, pc.s0 + MIN_SHOT);
  }
  pieces.splice(0, pieces.length, ...out);
}

function apexTime(ctx) {
  const f = ctx.flight; let m = 0, mt = 0;
  for (let i = 0; i < f.Z.length; i++) if (f.Z[i] > m) { m = f.Z[i]; mt = f.T[i]; }
  return mt;
}

/** Real seconds since contact to scene seconds since contact, through the cut (and back). */
export function warp(edit, r) {
  let acc = 0;
  for (const pc of edit) {
    const d = (pc.s1 - pc.s0) / pc.rate;
    if (r <= acc + d) return { s: pc.s0 + (r - acc) * pc.rate, piece: pc };
    acc += d;
  }
  const last = edit[edit.length - 1];
  return { s: last.s1, piece: last };
}
export function realAt(edit, s) {
  let acc = 0;
  for (const pc of edit) {
    if (s <= pc.s1) return acc + Math.max(0, s - pc.s0) / pc.rate;
    acc += (pc.s1 - pc.s0) / pc.rate;
  }
  return acc;
}

/* ---- the ball, at any moment ---- */

export function ballAt(p, s) {
  let cur = null;
  for (const sg of p.segs) if (s >= sg.t0) cur = sg;
  if (!cur) cur = p.segs[0];
  const t = s;
  switch (cur.kind) {
    case 'air': return { ...cur.at(Math.min(t, cur.t1)), by: null };
    case 'ground': { const q = cur.at(Math.min(t, cur.t1)); return { x: q.x, y: q.y, z: cur.g.z(Math.min(t, cur.t1)), by: null }; }
    case 'roll': return { ...cur.at(Math.min(t, cur.t1)), by: null };
    case 'bobble': { const k = clamp((t - cur.t0) / (cur.t1 - cur.t0), 0, 1); return { x: cur.a.x + (cur.b.x - cur.a.x) * k, y: cur.a.y + (cur.b.y - cur.a.y) * k, z: cur.a.z + (cur.b.z - cur.a.z) * k + 3 * k * (1 - k), by: null }; }
    case 'loose': return { x: cur.at.x, y: cur.at.y, z: BALL_R, by: null };
    case 'throw': {
      const k = clamp((t - cur.t0) / (cur.t1 - cur.t0), 0, 1), T = cur.t1 - cur.t0;
      return { x: cur.a.x + (cur.b.x - cur.a.x) * k, y: cur.a.y + (cur.b.y - cur.a.y) * k, z: cur.a.z + (cur.b.z - cur.a.z) * k + 4 * (G * T * T / 8) * k * (1 - k), by: null };
    }
    case 'held': { const f = p.fielders[cur.by].at(t); return { x: f.x, y: f.y, z: 3.6, by: cur.by }; }
    case 'gone': return { ...cur.at, by: null, gone: true };
    default: return { x: 0, y: 0, z: 0, by: null };
  }
}

/* ---- what the plan shows, against what the engine decided ---- */

function outcomeOf(ctx) {
  const p = ctx.p;
  const end = p.dur;
  const runners = p.runners.map((r) => {
    const at = r.track.at(1e6);
    let base = null;
    for (let b = 1; b <= 4; b++) if (dist(at, BASE[b]) < 3 || (b === 1 && dist(at, { x: BASE[1].x + 12, y: BASE[1].y + 12 }) < 3)) base = b;
    return { from: r.from, to: r.to, out: r.out, base, scored: r.scoreAt != null, scoreAt: r.scoreAt ?? null, outAt: r.outAt ?? null, arrive: r.arrive ?? null };
  });
  const ft = ctx.firstTouch || {};
  return {
    kind: ctx.kind,
    ball: ctx.kind === 'hr' ? 'over' : ft.how === 'catch' ? 'caught' : ft.how === 'drop' ? 'dropped' : ft.fell && ctx.kind === 'air_hit' ? 'fell' : ft.how === 'field' ? 'fielded' : ft.how === 'pickup' ? (ctx.kind === 'air_hit' ? 'fell' : 'through') : 'none',
    firstTouch: ft, lastHolder: ctx.lastHolder ?? null, putouts: (ctx.putouts || []).map((x) => ({ from: x.from, base: x.base, ballAt: x.ballAt })),
    runners, end, realDur: p.realDur, resolveAt: p.resolveAt, wall: p.flight ? p.flight.wall : null, over: p.flight ? p.flight.over : false,
  };
}

/** Does the plan show what the engine decided? A list of problems (empty: it does). */
export function verify(pr, plan) {
  const bad = [];
  const o = plan.outcome, ip = pr.inPlay || {};
  const label = ip.result;
  const hit = HITS[label] || 0;
  const moves = pr.runnerMoves || [];
  const batterOut = moves.some((m) => m.from === 0 && m.to === -1) || !moves.some((m) => m.from === 0);
  // no runner passes the runner ahead of him (MLB rule 5.09(b)(9)): along the base paths, while both
  // are still running (not yet out, not yet across the plate), the one behind stays behind
  // (followed along in time: only the leg he is on or the next, so home plate as base 0 and as
  // base 4 never confuse the two)
  const prog = (q, prev) => {
    let best = { d: Infinity, p: prev };
    for (let k = Math.floor(prev); k <= Math.min(3, Math.floor(prev) + 1); k++) {
      const a = BASE[k], b = BASE[k + 1], dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy;
      const u = clamp(((q.x - a.x) * dx + (q.y - a.y) * dy) / L2, 0, 1);
      const d = Math.hypot(a.x + dx * u - q.x, a.y + dy * u - q.y);
      if (d < best.d - 1e-6) best = { d, p: k + u };
    }
    return best.p;
  };
  const live = (r, t) => !(r.out && r.outAt != null && t >= r.outAt) && !(r.scoreAt != null && t >= r.scoreAt - 0.05);
  const rs = plan.runners.slice().sort((a, b) => a.from - b.from);
  passing: for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) {
    const back = rs[i], front = rs[j];
    let pb = back.from, pf = front.from;
    for (let t = 0; t <= plan.dur + 2; t += 0.05) {
      pb = prog(back.track.at(t), pb); pf = prog(front.track.at(t), pf);
      if (!live(back, t) || !live(front, t)) continue;
      if (pb > pf + 0.02) { bad.push(`the runner from ${back.from} passes the runner from ${front.from} at ${t.toFixed(2)} s`); break passing; }
    }
  }
  // every throw is taken by a man already there: at the bag (or his spot in line) before it arrives
  for (const sg of plan.segs) if (sg.kind === 'throw') {
    const q = plan.fielders[sg.to].at(sg.t1 - 0.1);
    // (on a bag he takes it out in front: where the throw ends, or the bag itself)
    const d = Math.min(Math.hypot(q.x - sg.b.x, q.y - sg.b.y), ...BASE.map((b) => Math.hypot(q.x - b.x, q.y - b.y) + (Math.hypot(sg.b.x - b.x, sg.b.y - b.y) < 3 ? 0 : 99)));
    if (d > 3) bad.push(`${NAME[sg.to]} is ${d.toFixed(1)} ft from where the throw arrives, a beat before it does`);
  }
  // every throw leaves the hand of the man holding the ball (never a second throw from a man whose
  // first is still in the air)
  for (const sg of plan.segs) if (sg.kind === 'throw') { const b = ballAt(plan, sg.t0 - 1e-3); if (b.by !== sg.from) bad.push(`a throw from ${NAME[sg.from]} at ${sg.t0.toFixed(2)} s while ${b.by ? NAME[b.by] : 'nobody'} has the ball`); }
  // a tag is made with the ball: the man who tags holds it as he does
  for (const e of plan.events) if (e.kind === 'out' && !e.force && e.by) { const b = ballAt(plan, e.s); if (b.by !== e.by) bad.push(`${NAME[e.by]} tags the runner from ${e.runner} at ${e.s.toFixed(2)} s while ${b.by ? NAME[b.by] : 'nobody'} has the ball`); }
  // the ball
  if (label === 'home_run') {
    if (o.ball !== 'over' || !o.wall || o.wall.z <= WALL_H + BALL_R) bad.push('home run does not clear the wall');
  } else if (hit) {
    if (o.ball !== 'fell' && o.ball !== 'through' && !(o.kind === 'ground_hit' && o.firstTouch.how === 'field')) bad.push(`a ${label} was not a hit on screen (${o.ball})`);
    if (plan.flight && plan.flight.over) bad.push(`a ${label} left the park`);
    if (o.kind === 'air_hit' && o.firstTouch.landAt != null && o.firstTouch.s < o.firstTouch.landAt) bad.push('a hit in the air was touched before it landed');
  } else if (batterOut && o.kind !== 'ground_play') {
    if (o.ball !== 'caught') bad.push(`an out in the air was not caught (${o.ball})`);
    if (o.firstTouch.z != null && (o.firstTouch.z < 0.5 || o.firstTouch.z > 9)) bad.push(`caught at ${o.firstTouch.z.toFixed(1)} ft`);
    if (plan.flight && plan.flight.over) bad.push('an out left the park');
  } else if (o.kind === 'ground_play') {
    if (o.ball !== 'fielded') bad.push(`a ground ball out was not fielded (${o.ball})`);
  }
  if (o.firstTouch && o.firstTouch.n) {
    const f = plan.fielders[o.firstTouch.n].at(o.firstTouch.s), q = o.firstTouch.at;
    if (q && Math.hypot(f.x - q.x, f.y - q.y) > 6) bad.push(`fielder ${NAME[o.firstTouch.n]} is ${Math.hypot(f.x - q.x, f.y - q.y).toFixed(1)} ft from the ball when he takes it`);
  }
  // putouts: the ball beats every runner who is out
  for (const r of o.runners) {
    if (!r.out) continue;
    if (r.from === 0 && o.kind === 'air_out') continue;
    const po = o.putouts.find((x) => x.from === r.from);
    if (!po || po.ballAt == null) { bad.push(`runner from ${r.from} is out with no putout`); continue; }
    if (r.arrive != null && r.arrive < po.ballAt) bad.push(`runner from ${r.from} beats the ball (${r.arrive.toFixed(2)} < ${po.ballAt.toFixed(2)}) but is out`);
  }
  // the bases at the end
  let shown = 0, scored = 0;
  for (const r of o.runners) {
    if (r.out) continue;
    if (r.to === 4) { if (r.base !== 4) bad.push(`runner from ${r.from} should score, ends at ${r.base}`); else scored++; continue; }
    if (r.base !== r.to) bad.push(`runner from ${r.from} should end on ${r.to}, ends on ${r.base}`);
    else if (r.to >= 1 && r.to <= 3) shown |= 1 << (r.to - 1);
  }
  if (pr.outs < 3 && shown !== pr.bases) bad.push(`bases shown ${shown} but the engine has ${pr.bases}`);
  const movesScored = moves.filter((m) => m.to === 4).length;
  if (scored !== movesScored) bad.push(`${scored} cross the plate, the moves have ${movesScored}`);
  if (!(plan.realDur > 1.5 && plan.realDur < 12)) bad.push(`it runs ${plan.realDur.toFixed(1)} s`);
  return bad;
}
