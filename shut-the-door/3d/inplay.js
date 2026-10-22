/* The ball in play, on screen: the plan (inplay-plan.js) played through the broadcast cut.
 *
 * After contact the pitcher's view holds for a beat, then the broadcast takes over: the camera the
 * plan's cut names follows the ball (sky, follow, track, wide, plate), the nine fielders in the
 * closer's club kit make exactly the play the engine decided, and the runners run to the engine's
 * bases. The cut's slow motion piece and its jump cuts come from the plan; real time maps to plan
 * time through warp(). Nothing here decides anything: every position is the plan's, at plan time s.
 *
 *   const ip = new InPlay({ scene, renderer, people, facts })   once the people are set up
 *   const run = ip.begin(pr, pitch, { hooks })                   a ball in play: the plan and its clock
 *     run.realDur, run.resolveReal (seconds after contact), run.sceneAt(r) (plan time at real r)
 *   ip.update(s, camera)                                          every frame after contact (s: plan time)
 *   ip.fieldAt(s)                                                 the runners for the scorebar diamond
 *   ip.end(camera)                                                back to the set (the next pitch)
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { planPlay, warp, realAt, BASE, wallDist } from './inplay-plan.js?v=2';
import { Crew } from './fielders.js?v=1';
import { buildBallpark } from './ballpark.js?v=2';
import { kitFor } from './people.js?v=34';
import { look } from './looks.js?v=2';
import { P, FT } from './units.js?v=1';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const ramp = (s, a, b) => smooth((s - a) / (b - a));
const bump = (s, a, b, c, d) => ramp(s, a, b) * (1 - ramp(s, c, d));
const D2R = Math.PI / 180;
// the fielders' and runners' clips (lab/pipeline/build_people.py 'fielder'), with their content hash
// as every asset URL carries one (lab/pipeline/stamp.mjs computes the same)
const MOTION = new URL('./assets/fielder.glb?h=d58d54f7c5', import.meta.url).href;
const OF = [7, 8, 9];
const CYCLE = { fielder: 13.5, runner: 14.5 };          // feet run per full stride cycle (two steps)

/** The angle from a to b the short way round. */
function angDiff(a, b) { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; }
const heading = (from, to) => Math.atan2(to.x - from.x, to.y - from.y);
const _frustum = new THREE.Frustum(), _mat = new THREE.Matrix4(), _sph = new THREE.Sphere();

export class InPlay {
  constructor({ scene, renderer, people, facts }) {
    this.scene = scene;
    this.renderer = renderer;
    this.people = people;
    this.park = buildBallpark(scene, renderer);
    this.crew = new Crew(scene, people.catcher);
    this.fielders = {};
    for (let n = 1; n <= 9; n++) this.fielders[n] = this.crew.figure();
    this.runnerFigs = [0, 1, 2, 3].map(() => this.crew.figure());
    this.trail = makeTrail(scene);
    this.setFacts(facts);
    this.active = null;
    // the clips come after the scene is up; until then (or without them) the motion is procedural
    this.motion = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(MOTION)
      .then((g) => { this.crew.setMotion(g); return true; })
      .catch(() => false);
  }

  /** The kits: the fielders in the closer's club (kitFor 'us'), the runners in the hitters' club. */
  setFacts(facts) {
    this.facts = facts;
    const us = kitFor(facts, 'us'), them = kitFor(facts, 'them');
    for (let n = 1; n <= 9; n++) {
      const glove = n === 1 && facts.pitcher.throws === 'L' ? 'r' : 'l';
      // the catcher in his gear's charcoal: helmet, chest and shins read as a catcher's
      const kit = n === 2 ? { ...us, cap: new THREE.Color('#1d1f22'), trim: new THREE.Color('#1d1f22') } : us;
      this.crew.dress(this.fielders[n], kit, { tone: look(`${facts.scenarioId}:f${n}`).tone, glove, gloveColor: n === 2 ? new THREE.Color('#2a1d14') : null });
    }
    this.runnerFigs.forEach((f, i) => this.crew.dress(f, them, { tone: look(`${facts.scenarioId}:r${i}`).tone, glove: null }));
  }

  /** Everything this module draws, shown for a shader compile (the page compiles before it plays). */
  warm(on) {
    this.park.visible = on;
    for (const f of this.crew.figures) { f.root.visible = on; if (on) f.place(0, 150, 0); }
    this.crew.blobs.visible = on;
    this.trail.visible = on;
  }

  /** A ball in play: plan it from the engine's PitchResult and the pitch as the scene threw it. */
  begin(pr, pitch, o = {}) {
    const b = this.facts.batter;
    const contact = pitch.after ? pitch.f.at(pitch.after.t0) : { x: 0, y: 1.2, z: 2.6 };
    const plan = planPlay(pr, { bats: b.bats, contact, id: pr.drawn ? pr.drawn.id : String(pr.n ?? 'x') });
    this.active = { pr, plan, pitch, hooks: o.hooks || {}, fired: 0, cam: null, fov0: null };
    this.ball = pitch.ball;
    this.ballScale0 = this.ball.scale.x;
    // who holds the ball next, at each moment (for the camera)
    this.active.holds = plan.segs.filter((sg) => sg.kind === 'held').map((sg) => ({ t: sg.t0, by: sg.by }));
    // the set's catcher is posed for the pitch (his rise after contact ends in a crouch half undone):
    // in the broadcast a fielder in his place stands, watches and plays
    this.active.usesCatcher = true;
    plan.runners.forEach((r, i) => {
      r.fig = this.runnerFigs[i] || null;
      // a close play at second, third or home: he slides in (a throw gets there within half a second
      // of him, or he is out there)
      const at = r.out ? r.outBase : r.to;
      r.slide = null;
      if (r.arrive != null && at >= 2 && at <= 4 && !(plan.kind === 'hr')) {
        const close = plan.segs.some((sg) => sg.kind === 'throw' && Math.abs(sg.t1 - r.arrive) < 0.6 && Math.hypot(sg.b.x - BASE[at].x, sg.b.y - BASE[at].y) < 12);
        if (close || (r.out && r.outAt != null && r.arrive - r.outAt < 0.5)) r.slide = r.arrive;
      }
    });
    return {
      plan,
      realDur: plan.realDur,
      resolveReal: realAt(plan.edit, plan.resolveAt),
      sceneAt: (r) => warp(plan.edit, r).s,
      piece: (r) => warp(plan.edit, r).piece,
    };
  }

  /** Each body's stride phase over the play, from its speed (fielders and runners): made once the
      clips are in (their strides set it). */
  phases() {
    const A = this.active, plan = A.plan;
    if (A.phased === !!this.crew.clips) return;
    A.phased = !!this.crew.clips;
    const T1 = plan.dur + 3, trot = plan.kind === 'hr';
    for (let n = 1; n <= 9; n++) { const tr = plan.fielders[n]; tr.phase = this.crew.phaseTable((t) => tr.at(t).spd, 0, T1, false); }
    for (const r of plan.runners) r.phase = this.crew.phaseTable((t) => r.track.at(t).spd, 0, T1, trot);
  }

  /** The play at plan time s (seconds after contact): everyone placed and posed, the ball, the cut. */
  update(s, camera) {
    const A = this.active;
    if (!A) return;
    const plan = A.plan;
    this.phases();
    const piece = pieceAt(plan.edit, s);
    const broadcast = piece.cam !== 'pitcher';
    // ---- the cut: the broadcast hides the set's own hitter (a runner takes his place) and, when the
    // catcher is in the play, the set's catcher (a fielder takes his)
    const pp = this.people, pt = A.pitch;
    pp.batter.root.visible = !broadcast;
    if (pp.batter.bat && broadcast) {
      // he let go of the bat on his way: it lies in the dirt by the box
      const side = this.facts.batter.bats === 'L' ? 1 : -1;
      pp.batter.bat.position.copy(P(side * 3.6, 1.8, 0.11));
      pp.batter.bat.rotation.set(0, side * 0.5, Math.PI / 2);
      pp.batter.bat.updateMatrixWorld(true);
    }
    if (pt.overlays) for (const o of [pt.tracer, pt.aimRing, pt.hitDot]) o.visible = !broadcast;
    pp.catcher.root.visible = !(broadcast && A.usesCatcher);
    this.park.visible = broadcast;
    // the sun's shadow map covers the plate only: in the broadcast it is not drawn again each frame
    this.renderer.shadowMap.autoUpdate = !broadcast;
    // ---- the ball
    const b = plan.ballAt(s);
    // ---- the camera (a page with its own camera, the lab's free one, keeps it: ip.ownCamera = false)
    if (broadcast && this.ownCamera !== false) {
      if (A.fov0 == null) A.fov0 = camera.fov;
      const c = this.cameraAt(piece, s, camera.aspect);
      camera.position.copy(P(c.pos.x, c.pos.y, c.pos.z));
      camera.lookAt(P(c.look.x, c.look.y, c.look.z));
      camera.fov = c.fov;
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
    } else if (this.ownCamera !== false && A.fov0 != null) { camera.fov = A.fov0; camera.updateProjectionMatrix(); A.fov0 = null; }
    // only the bodies in the frame are posed (and whoever has the ball, or is about to)
    _frustum.setFromProjectionMatrix(_mat.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    const nx = this.nextCatch(s);
    // (nobody is drawn within a few strides of the lens: a body filling the frame is never the shot)
    const camF = { x: -camera.position.x / FT, y: camera.position.z / FT };
    const inView = (x, y, n) => this.ownCamera === false || Math.hypot(x - camF.x, y - camF.y) > 14 && (n === b.by || (nx && n === nx.by) || _frustum.intersectsSphere(_sph.set(P(x, y, 3), 2.2)));
    // ---- the fielders
    for (let n = 1; n <= 9; n++) {
      const f = this.fielders[n];
      if (!broadcast || (n === 2 && !A.usesCatcher)) { f.root.visible = false; continue; }
      const q = plan.fielders[n].at(s);
      if (!inView(q.x, q.y, n)) { f.root.visible = false; f.at = { x: q.x, y: q.y }; continue; }
      this.poseFielder(n, f, s, b);
    }
    // ---- the runners
    this.runnerFigs.forEach((f) => { f.root.visible = false; });
    if (broadcast) for (const r of plan.runners) if (r.fig) { const q = r.track.at(s); if (inView(q.x, q.y, -1)) this.poseRunner(r, s, b); }
    // the ball in a glove or a hand, or in flight (eased into the glove over its last few hundredths)
    let bp = { x: b.x, y: b.y, z: b.z };
    if (b.by) {
      const f = this.fielders[b.by];
      const thr = f.root.visible && f.throwing ? 'hand' : 'glove';
      if (f.root.visible) bp = f.handPoint(thr);
    } else {
      const nx = this.nextCatch(s);
      if (nx && nx.t - s < 0.06 && nx.t > s) {
        const f = this.fielders[nx.by];
        if (f.root.visible && f.reaching) { const g = f.handPoint('glove'); const k = smooth(1 - (nx.t - s) / 0.06); bp = { x: bp.x + (g.x - bp.x) * k, y: bp.y + (g.y - bp.y) * k, z: bp.z + (g.z - bp.z) * k }; }
      }
    }
    if (broadcast || s > 0) {
      this.ball.position.copy(P(bp.x, bp.y, bp.z));
      this.ball.visible = true;
      this.ball.rotation.x = s * 90;
    }
    if (broadcast) {
      // the ball never shrinks under a few pixels (a white dot a viewer can follow)
      const H = camera.userData.cssH || 800;
      const d = camera.position.distanceTo(this.ball.position);
      const px = (0.0738 / (2 * d * Math.tan(camera.fov * D2R / 2))) * H;
      this.ball.scale.setScalar(this.ballScale0 * Math.max(1, 4.5 / Math.max(0.01, px)));
    } else this.ball.scale.setScalar(this.ballScale0);
    this.crew.shadows(broadcast ? { x: b.x, y: b.y, z: b.by ? 99 : b.z } : null);
    if (!broadcast) this.crew.blobs.visible = false;
    // ---- the trail behind a ball in the air
    this.updateTrail(s, camera, broadcast);
    // ---- cues: a glove pop on every catch, the crowd's on the hooks
    const ev = plan.events;
    while (A.fired < ev.length && ev[A.fired].s <= s) {
      const e = ev[A.fired++];
      if (e.kind === 'glove' && A.hooks.sound) A.hooks.sound('pop');
      if (e.kind === 'crowd' && A.hooks.crowd) A.hooks.crowd(e.cue);
    }
    A.s = s;
  }

  /** Jump to the end without firing what was skipped. */
  skipTo(s) { const A = this.active; if (!A) return; while (A.fired < A.plan.events.length && A.plan.events[A.fired].s <= s) A.fired++; }

  /** The next time a fielder takes the ball (a catch or a throw arriving), after s. */
  nextCatch(s) {
    for (const h of this.active.holds) if (h.t > s) return h;
    return null;
  }

  /** Who the play is about at s: the fielder who will have the ball next, or who has it. */
  focusFielder(s) {
    const hs = this.active.holds;
    for (const h of hs) if (h.t >= s - 0.05) return h.by;
    return hs.length ? hs[hs.length - 1].by : null;
  }

  /* ---------------------------------------------------------------- the fielders */

  poseFielder(n, f, s, ball) {
    const plan = this.active.plan, tr = plan.fielders[n];
    const st = tr.at(s);
    const acts = tr.acts;
    // a run that ends at full speed (an outfielder running a ball down) does not stop dead: he
    // carries on a few strides and slows (short of the wall)
    let glide = 0;
    if (tr.legs.length && s > tr.free) {
      const e = tr.at(tr.free - 1e-3);
      if (e.spd > 4 && e.head != null) {
        const k = s - tr.free, tau = 0.32, d = e.spd * tau * (1 - Math.exp(-k / tau));
        const nx = st.x + Math.sin(e.head) * d, ny = st.y + Math.cos(e.head) * d;
        const r = Math.hypot(nx, ny), lim = wallDist(Math.atan2(nx, ny) / D2R) - 2.5;
        const kk = r > lim ? Math.max(0, (lim - Math.hypot(st.x, st.y)) / Math.max(1e-3, r - Math.hypot(st.x, st.y))) : 1;
        st.x += (nx - st.x) * kk; st.y += (ny - st.y) * kk;
        st.spd = e.spd * Math.exp(-k / tau) * kk; st.head = e.head; glide = d * kk;
      }
    }
    const spd = st.spd;
    const spec = { run: { phase: this.crew.clips ? tr.phase.at(s) + 2 * Math.PI * glide / this.crew.clips.run.strideFt : 2 * Math.PI * st.run / CYCLE.fielder, amp: clamp(spd / 26, 0, 1.1) }, crouch: 0, lean: 0, idleT: s + n * 0.83, look: { x: ball.x, y: ball.y, z: ball.z }, lookW: spd > 6 ? 0.55 : 1 };
    // ready at the pitch, standing tall once he is out of it
    const inf = !OF.includes(n);
    spec.crouch = (inf ? 0.32 : 0.18) * (1 - ramp(s, 0.15, 0.6));
    spec.lean = (inf ? 0.25 : 0.12) * (1 - ramp(s, 0.15, 0.6));
    // where he looks and faces when he is not running: the ball, or (holding it) the infield
    let lookPt = { x: ball.x, y: ball.y };
    if (ball.by === n) lookPt = { x: 0, y: 70 };
    let faceYaw = heading(st, lookPt);
    f.throwing = false; f.reaching = false;
    let gloveW = 0, glove = null, handW = 0, hand = null, lift = 0, dive = 0;
    // the moments he acts
    for (const a of acts) {
      const t = a.t;
      if (a.kind === 'set') spec.crouch = Math.max(spec.crouch, 0.35 * bump(s, t - 0.15, t + 0.05, t + 0.6, t + 0.9));
      if (a.kind === 'field' || a.kind === 'pickup') {
        const k = bump(s, t - 0.38, t - 0.06, t + 0.12, t + 0.45);
        if (k > 0) {
          spec.crouch = Math.max(spec.crouch, 0.95 * k); spec.wide = 0.8 * k; spec.lean = Math.max(spec.lean, 0.75 * k);
          const bp = a.ball || ball;
          glove = { x: bp.x, y: bp.y, z: 0.35 }; gloveW = Math.max(gloveW, k);
          hand = { x: bp.x, y: bp.y, z: 1.0 }; handW = 0.7 * k;
          faceYaw = heading(st, plan.ballAt(t - 0.3));
          f.reaching = true;
        }
      }
      if (a.kind === 'catch' || a.kind === 'drop') {
        const k = ramp(s, t - 0.5, t - 0.05) * (1 - ramp(s, t + 0.25, t + 0.7));
        if (k > 0) {
          const q = a.ball;
          glove = { x: q.x, y: q.y, z: q.z }; gloveW = Math.max(gloveW, k);
          // he takes it in front of him: he faces where it comes from
          const prev = plan.ballAt(t - 0.25);
          faceYaw = heading(q, prev);
          f.reaching = s < t + 0.02;
          // a high one at the wall: he goes up for it
          if (a.wall || q.z > 6.8) lift = Math.max(lift, Math.max(0, q.z - 6.2) * 0.9 * bump(s, t - 0.3, t, t, t + 0.3));
          if (a.wall || q.z > 7) spec.armsUp = 0;
        }
      }
      if (a.kind === 'receive' || a.kind === 'catch_throw' || a.kind === 'tag') {
        const k = bump(s, t - 0.45, t - 0.08, t + 0.15, t + 0.5);
        if (k > 0) {
          // the throw's last point: chest high at the bag
          const seg = plan.segs.find((sg) => sg.kind === 'throw' && Math.abs(sg.t1 - t) < 0.02);
          const q = seg ? seg.b : { x: st.x, y: st.y, z: 4.6 };
          glove = { x: q.x, y: q.y, z: q.z }; gloveW = Math.max(gloveW, k);
          if (seg) faceYaw = heading(st, seg.a);
          f.reaching = s < t + 0.02;
          if (a.kind === 'tag') { const k3 = bump(s, t, t + 0.12, t + 0.5, t + 0.8); spec.crouch = Math.max(spec.crouch, 0.7 * k3); if (k3 > 0) { glove = { x: st.x - 1.5, y: st.y + 1.5, z: 0.6 }; gloveW = Math.max(gloveW, k3); } }
        }
      }
      if (a.kind === 'cover') {
        const k = ramp(s, t - 0.3, t + 0.1);
        if (k > 0 && spd < 4) spec.crouch = Math.max(spec.crouch, 0.18 * k);
      }
      if (a.kind === 'throw') {
        const rel = a.rel;
        const w = bump(s, rel - 0.55, rel - 0.32, rel + 0.35, rel + 0.7);
        if (w > 0) {
          spec.throwW = w;
          spec.throw = s < rel ? clamp((s - (rel - 0.4)) / 0.4, 0, 1) * 1 : 1 + clamp((s - rel) / 0.32, 0, 1);
          const k = spec.throw;
          spec.twist = k < 1 ? -1.0 + 1.4 * smooth(clamp((k - 0.3) / 0.7, 0, 1)) : 0.4 + 0.5 * smooth(k - 1);
          spec.twist *= w;
          spec.lean = Math.max(spec.lean, (k < 1 ? 0.1 + 0.3 * smooth(k) : 0.4 + 0.25 * smooth(k - 1)) * w);
          // the stride toward the target and the weight onto it (a crow hop is not built yet)
          spec.stride = { l: 0.62 * smooth(clamp(k, 0, 1)) * w, r: -0.45 * smooth(clamp(k, 0, 1)) * w };
          spec.crouch = Math.max(spec.crouch, 0.16 * w * Math.sin(Math.PI * clamp(k / 2, 0, 1)));
          if (f.glove === 'r') spec.stride = { l: spec.stride.r, r: spec.stride.l };
          faceYaw = heading(st, a.to);
          spec.look = { x: a.to.x, y: a.to.y, z: 4 };
          f.throwing = s < rel;
          if (gloveW > 0 && s > rel - 0.45) gloveW *= 1 - w;
        }
      }
      if (a.kind === 'dive' || a.kind === 'dive_short') {
        const at = a.to || a.at;
        const k = ramp(s, t - 0.18, t + 0.12) * (1 - ramp(s, t + 0.75, t + 1.35));
        if (k > 0) {
          dive = Math.max(dive, k);
          faceYaw = heading(st, at);
          glove = { x: at.x, y: at.y, z: 0.6 }; gloveW = Math.max(gloveW, k);
        }
      }
      if (a.kind === 'leap_miss') {
        const k = bump(s, t - 0.3, t - 0.02, t + 0.05, t + 0.4);
        if (k > 0) { lift = Math.max(lift, 2.2 * k); spec.armsUp = k; faceYaw = heading(st, a.at); }
      }
    }
    // the ball held: glove and ball together in front of his chest, whatever reach is easing off
    if (ball.by === n && !f.throwing) {
      const fw = { x: Math.sin(faceYaw), y: Math.cos(faceYaw) };
      const chest = { x: st.x + fw.x * 1.0, y: st.y + fw.y * 1.0, z: 3.9 };
      const k = glove ? gloveW : 0;
      glove = glove ? { x: chest.x + (glove.x - chest.x) * k, y: chest.y + (glove.y - chest.y) * k, z: chest.z + (glove.z - chest.z) * k } : chest;
      gloveW = Math.max(0.85, k) * (spec.throwW > 0 ? 1 - spec.throwW : 1);
    }
    // facing: his run's heading while running, else where his attention is
    const w = smooth((spd - 3) / 8);
    let yaw = faceYaw;
    if (st.head != null && w > 0) yaw = faceYaw + angDiff(faceYaw, st.head) * w;
    // a fielder stands a step back of the ball he catches, so the glove takes it in front of him
    let at = { x: st.x, y: st.y };
    const reachBack = (f.reaching && glove && gloveW > 0 && !dive) ? gloveW : 0;
    if (reachBack > 0) {
      const gy = heading(st, glove);
      const d = Math.min(1.4, Math.hypot(glove.x - st.x, glove.y - st.y) + 1.1);
      at = { x: st.x - Math.sin(yaw) * 1.1 * reachBack + 0 * gy, y: st.y - Math.cos(yaw) * 1.1 * reachBack };
      void d;
    }
    spec.glove = glove; spec.gloveW = gloveW; spec.hand = hand; spec.handW = handW; spec.dive = dive;
    f.place(at.x, at.y, yaw, { lift });
    f.pose(spec);
  }

  /* ---------------------------------------------------------------- the runners */

  poseRunner(r, s, ball) {
    const f = r.fig, tr = r.track;
    let ss = s;
    if (tr.stopAt != null && s > tr.stopAt) ss = tr.stopAt + 0.3 * (1 - Math.exp(-(s - tr.stopAt) / 0.3));
    const st = tr.at(ss);
    let x = st.x, y = st.y, spd = ss === s ? st.spd : st.spd * Math.exp(-(s - tr.stopAt) / 0.3), head = st.head, run = st.run;
    // out: he walks off toward his dugout (the third base side)
    const off = r.out ? Math.max(r.arrive ?? 0, r.outAt ?? 0) + 0.7 : null;
    let walk = 0;
    if (off != null && s > off) {
      const k = s - off, to = { x: -95, y: 25 }, d0 = heading(st, to);
      const dist = 4.5 * Math.max(0, k - 0.25) * Math.min(1, k / 0.6);
      x += Math.sin(d0) * dist; y += Math.cos(d0) * dist;
      spd = 4.5 * Math.min(1, k / 0.6); head = d0; run = st.run + dist; walk = 1;
    }
    // scored: he carries on through the plate and slows, toward his dugout
    if (r.scoreAt != null && s > r.scoreAt && !walk) {
      const k = s - r.scoreAt, d0 = heading(BASE[3], BASE[4]) - 0.5;
      const dist = 9 * (1 - Math.exp(-k / 0.9)) + 3.5 * Math.max(0, k - 0.6);
      const e = r.track.at(r.scoreAt + 5);
      x = e.x + Math.sin(d0) * dist; y = e.y + Math.cos(d0) * dist;
      spd = 9 * Math.exp(-k / 0.9) / 0.9 + (k > 0.6 ? 3.5 : 0); head = d0; run = st.run + dist;
    }
    const lead = s < 0.25 && r.from >= 1;
    const ph = this.crew.clips ? r.phase.at(ss) + 2 * Math.PI * (run - st.run) / this.crew.clips.jog.strideFt : 2 * Math.PI * run / CYCLE.runner + r.from;
    const spec = { idleT: s + r.from * 1.1, run: { phase: ph, trot: this.active.plan.kind === 'hr', amp: walk ? 0.22 : clamp(spd / 26, 0, 1.1) }, crouch: lead ? 0.3 : 0, wide: lead ? 0.6 : 0, lean: walk ? 0.1 : 0, look: { x: ball.x, y: ball.y, z: ball.z } };
    // the slide: feet first over his last few strides, down a beat, then up
    if (r.slide != null) {
      const t = r.slide, k = bump(s, t - 0.5, t - 0.28, t + 0.55, t + 1.0);
      if (k > 0) { spec.slide = k; spec.run.amp *= 1 - k; }
    }
    let yaw = head != null && spd > 1.5 ? head : heading({ x, y }, { x: ball.x, y: ball.y });
    if (spec.slide > 0 && r.slide != null) { const dir = heading(r.track.at(r.slide - 0.6), r.track.at(r.slide)); yaw = yaw + angDiff(yaw, dir) * spec.slide; }
    if (lead) yaw = heading({ x, y }, BASE[Math.min(4, r.from + 1)]) - Math.PI / 2 * (r.from === 2 ? 0.5 : 1);
    f.place(x, y, yaw, {});
    f.pose(spec);
  }

  /** The runners for the scorebar diamond (ui.js hudRunners): a place on the paths (0 home, 1..3
      the bases, 4 home again), from where each 3D runner is. */
  fieldAt(s) {
    const A = this.active;
    if (!A) return null;
    const list = [];
    for (const r of A.plan.runners) {
      const st = r.track.at(r.track.stopAt != null ? Math.min(s, r.track.stopAt) : s);
      let p = pathPlace(st, r.from);
      const out = r.out && r.outAt != null && s >= r.outAt;
      const scored = r.scoreAt != null && s >= r.scoreAt;
      if (scored) p = 4;
      list.push({ p, out, alpha: out ? Math.max(0.35, 1 - (s - r.outAt) / 0.6) : scored ? 0.5 : 1, from: r.from, to: r.to });
    }
    return list;
  }

  /* ---------------------------------------------------------------- the trail */

  updateTrail(s, camera, broadcast) {
    const A = this.active, tr = this.trail;
    const air = A.plan.segs.find((sg) => sg.kind === 'air');
    if (!broadcast || !air) { tr.visible = false; return; }
    const end = Math.min(s, air.t1);
    const fade = 1 - ramp(s, air.t1 + 0.1, air.t1 + 0.9);
    if (fade <= 0 || end <= 0.02) { tr.visible = false; return; }
    tr.visible = true;
    const pos = tr.geometry.attributes.position, al = tr.geometry.attributes.a;
    const N = pos.count / 2, cam = camera.position;
    // about 2.5 px wide at its head whatever the lens (half width in metres per metre away)
    const perM = 1.25 * 2 * Math.tan(camera.fov * D2R / 2) / (camera.userData.cssH || 800);
    const t0 = Math.max(0, end - 2.4);
    let prev = air.at(t0);
    for (let i = 0; i < N; i++) {
      const u = i / (N - 1), t = t0 + (end - t0) * u;
      const q = air.at(t), q2 = air.at(t + 0.01);
      const p = P(q.x, q.y, q.z), p2 = P(q2.x, q2.y, q2.z);
      const dir = p2.sub(p).normalize();
      const toCam = cam.clone().sub(p);
      const w = perM * toCam.length() * (0.3 + 0.7 * u);
      const side = new THREE.Vector3().crossVectors(dir, toCam.normalize()).normalize();
      pos.setXYZ(i * 2, p.x - side.x * w, p.y - side.y * w, p.z - side.z * w);
      pos.setXYZ(i * 2 + 1, p.x + side.x * w, p.y + side.y * w, p.z + side.z * w);
      al.setX(i * 2, u); al.setX(i * 2 + 1, u);
      prev = q;
    }
    void prev;
    pos.needsUpdate = true; al.needsUpdate = true;
    tr.material.uniforms.uOpacity.value = 0.7 * fade;
  }

  /* ---------------------------------------------------------------- the cameras */

  /** The camera of a piece of the cut at plan time s, smoothed over a few samples inside the piece. */
  cameraAt(piece, s, aspect) {
    // (a liner or a climbing ball moves fast: its cameras smooth over less time, so it stays in frame)
    const offs = piece.cam === 'track' || piece.cam === 'sky' ? [-0.1, -0.05, 0, 0.05, 0.1] : [-0.24, -0.12, 0, 0.12, 0.24];
    let pos = { x: 0, y: 0, z: 0 }, lk = { x: 0, y: 0, z: 0 }, fov = 0, n = 0;
    for (const o of offs) {
      const t = clamp(s + o, piece.s0, piece.s1);
      const c = this.rawCam(piece.cam, t, aspect);
      pos.x += c.pos.x; pos.y += c.pos.y; pos.z += c.pos.z;
      lk.x += c.look.x; lk.y += c.look.y; lk.z += c.look.z;
      fov += c.fov; n++;
    }
    pos = { x: pos.x / n, y: pos.y / n, z: pos.z / n };
    lk = { x: lk.x / n, y: lk.y / n, z: lk.z / n };
    fov /= n;
    if (piece.rate < 1) fov *= 0.86;           // the slow motion beat pushes in
    return { pos, look: lk, fov: clamp(fov, 4, 62) };
  }

  /** One camera, unsmoothed: where it is, what it looks at, the field of view that holds the points
      that matter (the ball, the fielder who gets it, a runner, a base). */
  rawCam(cam, s, aspect) {
    const plan = this.active.plan;
    const ball = plan.ballAt(s);
    const by = this.focusFielder(s);
    const fp = by ? plan.fielders[by].at(s) : null;
    const pts = [{ x: ball.x, y: ball.y, z: ball.z }];
    if (fp) pts.push({ x: fp.x, y: fp.y, z: 0 }, { x: fp.x, y: fp.y, z: 6.5 });
    let pos, wBall = 0.6;
    const spray = plan.spray;
    if (cam === 'sky') {
      pos = { x: -spray * 0.25, y: -34, z: 7 };
      pts.length = 1;
      pts.push({ x: 0, y: 0, z: 3 });
      wBall = 0.9;
      return this.fit(pos, pts, wBall, aspect, 1.6, 16);
    }
    if (cam === 'follow') {
      // a throw coming: its target is in the frame
      const ahead = 0.6;
      const th = plan.segs.find((sg) => sg.kind === 'throw' && sg.t0 > s - 0.1 && sg.t0 < s + ahead);
      if (th) pts.push({ x: th.b.x, y: th.b.y, z: 0 }, { x: th.b.x, y: th.b.y, z: 6 });
      // a ball in the air: where it comes down (or leaves the park) is in the frame, so the sky has
      // a field under it; a home run keeps the wall and the outfielder who went back for it
      if (plan.flight && !ball.by) {
        const w = plan.flight.wall, land = plan.flight.land;
        const q = plan.kind === 'hr' && w ? { x: plan.flight.land.x * 0 + ball.x, y: ball.y } : land;
        if (plan.kind === 'hr' && w) {
          const u = { x: Math.sin(spray * D2R), y: Math.cos(spray * D2R) };
          pts.push({ x: u.x * (w.h - 25), y: u.y * (w.h - 25), z: 0 }, { x: u.x * w.h, y: u.y * w.h, z: 10 });
          for (const n of OF) { const f = plan.fielders[n]; if (f.acts.some((a) => a.kind === 'leap_miss')) { const q2 = f.at(s); pts.push({ x: q2.x, y: q2.y, z: 0 }); } }
        } else if (q && s < (plan.flight.tLand ?? 9) + 0.5) pts.push({ x: q.x, y: q.y, z: 0 });
      }
      // the runner a throw is racing (put out, or safe by a step): he is in the shot
      for (const r of plan.runners) {
        const tq = r.out ? r.outAt : r.arrive;
        if (tq == null || r.from === r.to) continue;
        const thr = plan.segs.some((sg) => sg.kind === 'throw' && sg.t0 < s + 0.6 && sg.t1 > s - 0.4);
        if (thr && tq > s - 0.4 && tq < s + 1.0) { const q = r.track.at(s); pts.push({ x: q.x, y: q.y, z: 0 }, { x: q.x, y: q.y, z: 6 }); }
      }
      const thNow = plan.segs.find((sg) => sg.kind === 'throw' && sg.t0 <= s && sg.t1 >= s - 0.3);
      if (thNow) pts.push({ x: thNow.b.x, y: thNow.b.y, z: 6 }, { x: thNow.a.x, y: thNow.a.y, z: 0 });
      // from behind the plate, high, trailing the action at about half its distance (a camera on a
      // wire): close enough that a fielder is a figure, not a speck
      const c = centre(pts, wBall);
      const r = Math.hypot(c.x, c.y);
      pos = { x: c.x * 0.42, y: c.y * 0.42 - 48, z: 30 + r * 0.07 };
      return this.fit(pos, pts, wBall, aspect, 1.3, 12);
    }
    if (cam === 'track') {
      // low behind the plate, off to the side away from the ball, panning with the liner
      const sd = spray >= 0 ? -1 : 1;
      pos = { x: sd * 40, y: -34, z: 15 };
      return this.fit(pos, pts, wBall, aspect, 1.4, 10);
    }
    if (cam === 'wide') {
      // the other angle for a jump cut: high on the side of the field away from the ball (a camera
      // over the dugout), on the ball, whoever has it, where it is going and the runners near it
      const sd = ball.x >= 0 ? -1 : 1;
      pos = { x: sd * 105, y: 20, z: 42 };
      const th = plan.segs.find((sg) => sg.kind === 'throw' && sg.t1 > s - 0.1 && sg.t0 < s + 1.2);
      if (th) pts.push({ x: th.b.x, y: th.b.y, z: 0 }, { x: th.b.x, y: th.b.y, z: 6 });
      for (const r of plan.runners) {
        if (r.out && s > (r.outAt ?? 0) + 0.4) continue;
        const q = r.track.at(s);
        // every runner still in the play (the batter pulling into his base above all)
        if (r.scoreAt != null && s > r.scoreAt + 0.3) continue;
        pts.push({ x: q.x, y: q.y, z: 0 }, { x: q.x, y: q.y, z: 6 });
      }
      return this.fit(pos, pts, 0.35, aspect, 1.3, 12);
    }
    if (cam === 'plate') {
      // low on the first base side, the plate and the runner coming home
      pos = { x: 36, y: 24, z: 4.5 };
      const home = plan.runners.filter((r) => r.to === 4 || (r.out && r.outBase === 4));
      pts.length = 0;
      pts.push({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 6 });
      for (const r of home) { const q = r.track.at(s); if (Math.hypot(q.x, q.y) < 70) pts.push({ x: q.x, y: q.y, z: 0 }, { x: q.x, y: q.y, z: 6 }); }
      if (ball && Math.hypot(ball.x, ball.y) < 60) pts.push({ x: ball.x, y: ball.y, z: ball.z });
      return this.fit(pos, pts, 0.2, aspect, 1.4, 24);
    }
    return this.fit({ x: 0, y: -52, z: 36 }, pts, wBall, aspect, 1.35, 12);
  }

  /** Aim from pos at a point between the ball and the rest, wide enough to hold every point. */
  fit(pos, pts, wBall, aspect, margin, minFov) {
    const c = centre(pts, wBall);
    // the angles of every point off the line of sight
    const f = { x: c.x - pos.x, y: c.y - pos.y, z: c.z - pos.z };
    const L = Math.hypot(f.x, f.y, f.z) || 1;
    const fw = { x: f.x / L, y: f.y / L, z: f.z / L };
    let rt = { x: fw.y, y: -fw.x, z: 0 }; const rl = Math.hypot(rt.x, rt.y) || 1; rt = { x: rt.x / rl, y: rt.y / rl, z: 0 };
    const up = { x: rt.y * fw.z - rt.z * fw.y, y: rt.z * fw.x - rt.x * fw.z, z: rt.x * fw.y - rt.y * fw.x };
    let need = 0;
    for (const p of pts) {
      const d = { x: p.x - pos.x, y: p.y - pos.y, z: p.z - pos.z };
      const z = Math.max(1, d.x * fw.x + d.y * fw.y + d.z * fw.z);
      const h = Math.abs(d.x * rt.x + d.y * rt.y + d.z * rt.z) / z, v = Math.abs(d.x * up.x + d.y * up.y + d.z * up.z) / z;
      need = Math.max(need, v, h / aspect);
    }
    const fov = 2 * Math.atan(need * margin) / D2R;
    return { pos, look: c, fov: Math.max(minFov, fov) };
  }

  /** Back to the set: everyone hidden, the people back, the camera's own lens. */
  end(camera) {
    const A = this.active;
    if (!A) return;
    this.crew.hide();
    this.park.visible = false;
    this.renderer.shadowMap.autoUpdate = true;
    this.trail.visible = false;
    const pp = this.people;
    pp.batter.root.visible = true;
    pp.catcher.root.visible = true;
    if (this.ball) this.ball.scale.setScalar(this.ballScale0);
    if (camera && A.fov0 != null) { camera.fov = A.fov0; camera.updateProjectionMatrix(); }
    this.active = null;
  }
}

/** The look point: the first point (the ball) weighted wBall against the mean of the rest. */
function centre(pts, wBall) {
  const rest = pts.slice(1);
  const r = rest.length ? rest.reduce((a, p) => ({ x: a.x + p.x / rest.length, y: a.y + p.y / rest.length, z: a.z + p.z / rest.length }), { x: 0, y: 0, z: 0 }) : pts[0];
  return { x: pts[0].x * wBall + r.x * (1 - wBall), y: pts[0].y * wBall + r.y * (1 - wBall), z: pts[0].z * wBall + r.z * (1 - wBall) };
}

/** The piece of the cut that plan time s falls in. */
function pieceAt(edit, s) {
  for (const pc of edit) if (s <= pc.s1 + 1e-9 && s >= pc.s0 - 1e-9) return pc;
  return s < edit[0].s0 ? edit[0] : edit[edit.length - 1];
}

/** A place on the base paths (0 home .. 4 home) for a point on the field, from a runner who started at base b0. */
function pathPlace(q, b0) {
  let best = { d: Infinity, p: b0 };
  for (let k = Math.max(0, b0); k < 4; k++) {
    const a = BASE[k], b = BASE[k + 1], dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy;
    const u = clamp(((q.x - a.x) * dx + (q.y - a.y) * dy) / L2, 0, 1);
    const d = Math.hypot(a.x + dx * u - q.x, a.y + dy * u - q.y);
    if (d < best.d - 1e-6) best = { d, p: k + u };
  }
  return best.p;
}

function makeTrail(scene) {
  const N = 96;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 2 * 3), 3));
  geo.setAttribute('a', new THREE.BufferAttribute(new Float32Array(N * 2), 1));
  const idx = [];
  for (let i = 0; i < N - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  geo.setIndex(idx);
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uOpacity: { value: 0 }, uColor: { value: new THREE.Color(1.0, 0.9, 0.62) } },
    vertexShader: 'attribute float a; varying float vA; void main(){ vA = a; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform float uOpacity; uniform vec3 uColor; varying float vA; void main(){ gl_FragColor = vec4(uColor * uOpacity * (0.15 + 0.85 * vA * vA), 1.0); }',
  });
  const m = new THREE.Mesh(geo, mat);
  m.frustumCulled = false; m.renderOrder = 5; m.visible = false;
  scene.add(m);
  return m;
}
