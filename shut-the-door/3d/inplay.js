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
 *     run.realDur, run.resolveReal (seconds after contact), run.sceneAt(r) (plan time at real r),
 *     run.land { s, real, how, fair } (the ball's first landing, catch, pick up or home run)
 *   ip.prime()                                                    its textures up to the GPU at load (stage.js)
 *   ip.update(s, camera)                                          every frame after contact (s: plan time)
 *   ip.fieldAt(s)                                                 the runners for the scorebar diamond
 *   ip.end(camera)                                                back to the set (the next pitch)
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { planPlay, warp, realAt, BASE, MOUND, wallDist } from './inplay-plan.js?v=9';
import { Crew } from './fielders.js?v=3';
import { buildBallpark } from './ballpark.js?v=9';
// (the same URL stage.js imports, so both share one copy of people.js)
import { kitFor } from './people.js?v=38';
import { look } from './looks.js?v=2';
import { P, FT } from './units.js?v=1';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const ramp = (s, a, b) => smooth((s - a) / (b - a));
const bump = (s, a, b, c, d) => ramp(s, a, b) * (1 - ramp(s, c, d));
const D2R = Math.PI / 180;
// the least of the field the broadcast shows, top to bottom at the point it looks at, in feet (cameraAt):
// a 6 ft man is then at most about an eighth of the frame
const ROOM_FT = 45;
const BALL_D = 2 * 1.45 * 0.0254;     // a baseball across, 7.37 cm (the mesh in gear3d.js baseball())
const BALL_MIN_PX = 2;                // the least a ball in play is drawn across on screen (a floor, not a size)
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
    this.marker = makeMarker(scene);
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
    this.marker.visible = on;
  }

  /** The broadcast's textures up to the GPU at load (stage.js init, behind the home screen): the
      park's 2048 px infield mask, its dirt and seats, the shadow blob. Measured in Chromium (software
      GL), the first broadcast frame uploaded 14 textures and 12 buffers on top of its draw; drawn
      ahead into a target instead, it still compiled a shader per variant the canvas never uses, so
      this only uploads (renderer.initTexture: no draw, nothing on screen). It takes six of the
      fourteen off that frame; the rest are the bodies' bone textures (made on their first draw)
      and textures still loading. A small hitch at the cut remains: stage.js's clock pauses for it. */
  prime() {
    const r = this.renderer, seen = new Set();
    const up = (o) => o.traverse((m) => {
      if (!m.isMesh) return;
      for (const mat of [].concat(m.material)) for (const v of Object.values(mat)) {
        if (!v || !v.isTexture || seen.has(v)) continue;
        seen.add(v);
        if (v.image && (v.image.width || v.image.data)) r.initTexture(v);
      }
    });
    up(this.park);
    for (const f of this.crew.figures) up(f.root);
    up(this.crew.blobs);
    return seen.size;
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
    // the moment the ball first lands, is caught or fielded, or leaves the park (plan time), never
    // after the play is decided: the game's play by play waits for it
    const oc = plan.outcome, ft = oc.firstTouch || {};
    const landS = Math.min(ft.landAt ?? ft.s ?? plan.resolveAt, plan.resolveAt);
    return {
      plan,
      land: { s: landS, real: realAt(plan.edit, landS), how: oc.ball, fair: true },
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
    // ---- the runners first (a tag reaches for the runner where he is drawn)
    this.runnerFigs.forEach((f) => { f.root.visible = false; });
    if (broadcast) for (const r of plan.runners) if (r.fig) { const q = r.track.at(s); if (inView(q.x, q.y, -1)) this.poseRunner(r, s, b); }
    // ---- the fielders
    for (let n = 1; n <= 9; n++) {
      const f = this.fielders[n];
      if (!broadcast || (n === 2 && !A.usesCatcher)) { f.root.visible = false; continue; }
      const q = plan.fielders[n].at(s);
      if (!inView(q.x, q.y, n)) { f.root.visible = false; f.at = { x: q.x, y: q.y }; continue; }
      this.poseFielder(n, f, s, b);
    }
    // the ball in a glove or a hand, or in flight (eased into the glove over its last few hundredths)
    let bp = { x: b.x, y: b.y, z: b.z };
    if (b.by) {
      const f = this.fielders[b.by];
      const thr = f.root.visible && f.throwing ? 'hand' : 'glove';
      if (f.root.visible) bp = f.handPoint(thr);
    } else {
      // a throw leaves from his hand: the hand where it was at the release (posed once, at that
      // moment), its gap to the plan's path closed over the flight, so the ball never jumps out of
      // his hand and still ends in the glove
      const sg = plan.segs.find((x) => x.kind === 'throw' && s >= x.t0 && s < x.t1);
      if (sg) {
        if (!sg.hand) {
          const f = this.fielders[sg.from], seen = f.root.visible;
          // (the runners at that moment too: a throw after a tag starts from the hand that tagged)
          const shown = plan.runners.map((r) => !!(r.fig && r.fig.root.visible));
          for (const r of plan.runners) if (r.fig) this.poseRunner(r, sg.t0 - 1e-3, plan.ballAt(sg.t0 - 1e-3));
          this.poseFielder(sg.from, f, sg.t0 - 1e-3, plan.ballAt(sg.t0 - 1e-3));
          plan.runners.forEach((r, i) => { if (!r.fig) return; if (shown[i]) this.poseRunner(r, s, b); else r.fig.root.visible = false; });
          f.root.updateMatrixWorld(true);
          sg.hand = f.handPoint('hand');
          if (seen) this.poseFielder(sg.from, f, s, b); else f.root.visible = false;
        }
        const k = clamp((s - sg.t0) / (sg.t1 - sg.t0), 0, 1), w = Math.pow(1 - k, 1.5);
        bp = { x: bp.x + (sg.hand.x - sg.a.x) * w, y: bp.y + (sg.hand.y - sg.a.y) * w, z: bp.z + (sg.hand.z - sg.a.z) * w };
      }
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
      // the ball is its true size, 7.37 cm, like the players are real height. Far off, the true size is
      // under a pixel, so it is drawn at least BALL_MIN_PX across, a dot a viewer can follow. That floor
      // is the only thing that ever makes it bigger than it is.
      const H = camera.userData.cssH || 800;
      const d = camera.position.distanceTo(this.ball.position);
      const px = (BALL_D / (2 * d * Math.tan(camera.fov * D2R / 2))) * H;
      this.ball.scale.setScalar(this.ballScale0 * Math.max(1, BALL_MIN_PX / Math.max(0.01, px)));
    } else this.ball.scale.setScalar(this.ballScale0);
    // the figures' soft shadows (the ball has its marker instead)
    this.crew.shadows(broadcast ? { x: b.x, y: b.y, z: 999 } : null);
    this.updateMarker(bp, broadcast, camera);
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
    // a ball he takes (a catch in the air, a throw at a bag): the point, and how far his body is
    // moved so the glove is on it (catchFit, below)
    let take = null, takeW = 0;
    const takingNow = acts.some((a) => (a.kind === 'catch' || a.kind === 'drop' || a.kind === 'receive' || a.kind === 'catch_throw' || a.kind === 'field' || a.kind === 'pickup') && s > a.t - 0.5 && s < a.t + 0.08);
    // the moments he acts
    for (const a of acts) {
      const t = a.t;
      if (a.kind === 'set') spec.crouch = Math.max(spec.crouch, 0.35 * bump(s, t - 0.15, t + 0.05, t + 0.6, t + 0.9));
      if (a.kind === 'field' || a.kind === 'pickup') {
        const k = bump(s, t - 0.38, t - 0.06, t + 0.12, t + 0.45);
        if (k > 0) {
          spec.crouch = Math.max(spec.crouch, 0.95 * k); spec.wide = 0.8 * k; spec.lean = Math.max(spec.lean, 0.75 * k);
          const bp = a.ball || ball;
          glove = { x: bp.x, y: bp.y, z: 0.2 }; gloveW = Math.max(gloveW, k);
          const kw = ramp(s, t - 0.45, t - 0.05) * (1 - ramp(s, t + 0.3, t + 0.9));
          if (kw > takeW) { take = { ...glove, t }; takeW = kw; }
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
          const kw = ramp(s, t - 0.5, t - 0.05) * (1 - ramp(s, t + 0.4, t + 1.2));
          if (kw > takeW) { take = { ...glove, t }; takeW = kw; }
          // he takes it in front of him: he faces where it comes from
          const prev = plan.ballAt(t - 0.25);
          faceYaw = heading(q, prev);
          f.reaching = s < t + 0.02;
          // a high one at the wall: he goes up for it
          if (a.wall || q.z > 6.8) lift = Math.max(lift, Math.max(0, q.z - 6.2) * 0.9 * bump(s, t - 0.3, t, t, t + 0.3));
          if (a.wall || q.z > 7) spec.armsUp = 0;
          // a shoestring catch (the ball under his knees, out of reach bent over): he lays out for it
          if (q.z < 2.4) dive = Math.max(dive, k * clamp((2.8 - q.z) / 1.8, 0.3, 1));
        }
      }
      if (a.kind === 'receive' || a.kind === 'catch_throw' || a.kind === 'tag') {
        const k = bump(s, t - 0.45, t - 0.08, t + 0.15, t + 0.5);
        if (k > 0) {
          // the throw's last point: chest high at the bag
          const seg = plan.segs.find((sg) => sg.kind === 'throw' && Math.abs(sg.t1 - t) < 0.02);
          const q = seg ? seg.b : { x: st.x, y: st.y, z: 4.6 };
          glove = { x: q.x, y: q.y, z: q.z }; gloveW = Math.max(gloveW, k);
          if (seg) { const kw = ramp(s, t - 0.45, t - 0.08) * (1 - ramp(s, t + 0.4, t + 1.0)); if (kw > takeW) { take = { ...glove, t }; takeW = kw; } }
          // at first base on a force: the stretch, the glove side foot out toward the throw, the
          // other on the bag, low and long
          if (a.kind === 'receive' && a.base === 1) {
            const kk = bump(s, t - 0.4, t - 0.12, t + 0.2, t + 0.6);
            const gl = f.glove === 'r' ? 'r' : 'l', ot = gl === 'l' ? 'r' : 'l';
            spec.stride = { [gl]: 0.75 * kk, [ot]: -0.15 * kk };
            spec.crouch = Math.max(spec.crouch, 0.3 * kk); spec.lean = Math.max(spec.lean, 0.45 * kk); spec.wide = Math.max(spec.wide || 0, 0.5 * kk);
          }
          if (seg) faceYaw = heading(st, seg.a);
          f.reaching = s < t + 0.02;
        }
      }
      if (a.kind === 'tag') {
        {
          // the tag: down to the runner as he slides in, the glove (and the ball in it) on him at
          // the moment of the out, then up to show the umpire
          const tt = a.tagAt ?? t, k3 = bump(s, tt - 0.35, tt - 0.05, tt + 0.25, tt + 0.6);
          const r = plan.runners.find((x) => x.from === a.runner);
          if (k3 > 0 && r) {
            const q = r.track.at(Math.min(s, tt));
            spec.crouch = Math.max(spec.crouch, 0.8 * k3);
            // (his hips as he is drawn, sliding in: the tag goes on him there)
            let tg = { x: q.x, y: q.y, z: 0.7 };
            if (r.fig && r.fig.root.visible && r.fig.posedAt === s && s <= tt + 0.02) { r.fig.root.updateMatrixWorld(true); const pj = r.fig.jointPoint('pelvis'); tg = { x: pj.x, y: pj.y, z: Math.max(0.5, pj.z) }; }
            glove = tg; gloveW = Math.max(gloveW, k3);
            // (once the ball is in his glove the tag is what he reaches for)
            const kw = ramp(s, tt - 0.35, tt - 0.03) * (1 - ramp(s, tt + 0.3, tt + 0.8));
            if (s > t + 0.02 && kw > 0) { take = { ...tg, t: tt }; takeW = Math.max(kw, takeW); }
          }
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
          // (the glove stays on a ball he is still taking: a quick release starts after the catch)
          if (gloveW > 0 && s > rel - 0.45 && !takingNow) gloveW *= 1 - w;
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
    // a throw coming to him with no act of its own (the cutoff man taking a throw in): his glove
    // goes to it as at a bag
    for (const sg of plan.segs) {
      if (sg.kind !== 'throw' || sg.to !== n || take && Math.abs(take.t - sg.t1) < 0.05) continue;
      const t = sg.t1, kw = ramp(s, t - 0.45, t - 0.08) * (1 - ramp(s, t + 0.4, t + 1.0));
      if (kw <= takeW) continue;
      const k = bump(s, t - 0.45, t - 0.08, t + 0.15, t + 0.5);
      glove = { x: sg.b.x, y: sg.b.y, z: sg.b.z }; gloveW = Math.max(gloveW, k);
      faceYaw = heading(st, sg.a);
      f.reaching = s < t + 0.02;
      take = { ...glove, t }; takeW = kw;
    }
    // a low one (a liner at his shins, a sinking fly): he gets down to it
    // the throw's windup waits for the ball he is still taking
    if (take && spec.throwW > 0) { spec.throwW *= 1 - takeW; spec.twist = (spec.twist || 0) * (1 - takeW); }
    // a ground ball picked up: up from any dive first
    if (take && take.z < 1) dive *= 1 - takeW;
    if (take && take.z < 3.2) {
      spec.crouch = Math.max(spec.crouch, Math.min(1, (3.4 - take.z) / 2.6) * takeW);
      // (the run's capture gives way: he gets down to it, his stride broken down into the set)
      spec.settle = takeW;
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
    // catchFit: the glove on the ball. The plan puts his body where the ball comes down, and his arm
    // cannot always reach from there (the owner, 2026-10-22: a pop fly came down beside the outfielder
    // who caught it). So, as the ball arrives, his body is moved by what the glove still misses, posed
    // again (the arm then reaches from the new spot) and once more: at the catch the pocket is on the
    // ball (lab/pipeline/check-catch.mjs holds it under 0.15 m). The move comes in over the half
    // second before and goes over the second after, as a gather step, never a jump.
    // A ball above what his arm reaches from there (the arm straight, the glove under it): he steps
    // in under it, his shoulder near enough that the arm reaches it.
    // a ground ball: he fields it out in front of him, a long arm's reach ahead of his feet (the
    // glove on the grass, his back flat), not curled over a ball under his own body
    if (take && takeW > 0 && take.z < 1 && !dive) {
      const D = 1.9, fx = take.x - Math.sin(yaw) * D, fy = take.y - Math.cos(yaw) * D;
      at = { x: at.x + (fx - at.x) * takeW, y: at.y + (fy - at.y) * takeW };
      spec.crouch = Math.max(spec.crouch, 0.9 * takeW); spec.lean = Math.max(spec.lean, 0.95 * takeW); spec.wide = Math.max(spec.wide || 0, 0.9 * takeW);
      f.place(at.x, at.y, yaw, { lift });
      f.pose(spec);
    }
    if (take && takeW > 0) {
      for (let i = 0; i < 4; i++) {
        f.root.updateMatrixWorld(true);
        const g = f.handPoint('glove');
        let mx = (take.x - g.x), my = (take.y - g.y);
        if (take.z - g.z > 0.05) {
          const sh = f.jointPoint(`upperarm_${f.glove || 'l'}`);
          const R = Math.hypot(g.x - sh.x, g.y - sh.y, g.z - sh.z), dz = take.z - sh.z;
          const hd = Math.hypot(take.x - sh.x, take.y - sh.y), want = Math.sqrt(Math.max(0, R * R - dz * dz)) * 0.97;
          if (hd > want && hd > 1e-3) { mx += (take.x - sh.x) / hd * (hd - want); my += (take.y - sh.y) / hd * (hd - want); }
        }
        at = { x: at.x + mx * takeW, y: at.y + my * takeW };
        // a ball under his glove: he gets lower (knees, then the waist)
        if (g.z - take.z > 0.05 && !dive) { spec.lean = Math.min(1.4, (spec.lean || 0) + (g.z - take.z) / 1.8 * takeW); spec.crouch = Math.min(1.35, (spec.crouch || 0) + (g.z - take.z) / 3 * takeW); }
        // still under it with the arm at full stretch: up on his toes, a small hop for a high one
        if (i === 3 && !dive && take.z - g.z > 0.05) lift = Math.max(lift, Math.min(1.5, (take.z - g.z) * 1.05) * takeW);
        f.place(at.x, at.y, yaw, { lift });
        f.pose(spec);
      }
      // the hop needs one more pose with the glove at its height
      if (lift > 0) { f.root.updateMatrixWorld(true); const g = f.handPoint('glove'); if (take.z - g.z > 0.05) { lift += Math.min(1.5, take.z - g.z) * takeW; f.place(at.x, at.y, yaw, { lift }); f.pose(spec); } }
    }
    // a force at a bag: a foot stays on it (the pivot foot, or the back foot of a stretch): the body
    // slides so the nearer foot is on the bag's middle, and the arm reaches from there
    const fa = acts.find((x) => (x.kind === 'receive' || x.kind === 'step') && x.force && x.base && s > x.t - 0.6 && s < x.t + 0.35);
    if (fa) {
      const bag = fa.base === 4 ? { x: 0, y: 0.7 } : BASE[fa.base];
      const kf = ramp(s, fa.t - 0.6, fa.t - 0.15) * (1 - ramp(s, fa.t + 0.1, fa.t + 0.35));
      for (let i = 0; i < 4 && kf > 0; i++) {
        // (the glove to the ball again, then the foot back on the bag: the two settle together)
        if (i && take && takeW > 0) {
          f.root.updateMatrixWorld(true);
          const g = f.handPoint('glove');
          at = { x: at.x + (take.x - g.x) * takeW, y: at.y + (take.y - g.y) * takeW };
          f.place(at.x, at.y, yaw, { lift });
          f.pose(spec);
        }
        f.root.updateMatrixWorld(true);
        const fl = f.jointPoint('foot_l'), fr = f.jointPoint('foot_r');
        const foot = Math.hypot(fl.x - bag.x, fl.y - bag.y) < Math.hypot(fr.x - bag.x, fr.y - bag.y) ? fl : fr;
        // (on the bag: within half a foot of its middle; past that, back onto it)
        const off = Math.hypot(bag.x - foot.x, bag.y - foot.y), need = Math.max(0, off - 0.5) / Math.max(1e-3, off);
        if (need <= 0) continue;
        at = { x: at.x + (bag.x - foot.x) * need * kf, y: at.y + (bag.y - foot.y) * need * kf };
        f.place(at.x, at.y, yaw, { lift });
        f.pose(spec);
      }
    }
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
    f.posedAt = s;
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

  /* ---------------------------------------------------------------- the ball's ground marker */

  /** The marker on the ground under the ball (the owner, 2026-10-22: the ball is hard to follow in
      the air and on throws): a soft dark disc and a thin bright ring, straight under the ball every
      frame, wherever it is (in flight, bouncing, thrown, in a glove). High, it is wide and soft; as
      the ball comes down it shrinks and sharpens, so its size reads the height. Only in the broadcast
      of a ball in play, never on the pitch. Over the wall (the seats are not the field) it goes. One
      quad, no shadow pass. bp: the ball as drawn, field feet. */
  updateMarker(bp, broadcast, camera) {
    const mk = this.marker;
    const out = Math.hypot(bp.x, bp.y) > wallDist(Math.atan2(bp.x, bp.y) / D2R) - 1;
    if (!broadcast || out) { mk.visible = false; return; }
    mk.visible = true;
    // height 0 (on the grass) to 1 (90 ft up and higher)
    const h = clamp(bp.z / 90, 0, 1);
    let dM = 0.55 + 2.6 * Math.sqrt(h);
    // never under a dozen pixels across, so a far camera still shows it
    const H = camera.userData.cssH || 800;
    // on the ground, and on the mound where the ball is over it (ballpark.js: a cone 9 ft round and
    // 10 in high, its 2.6 ft top flat, centred 1.5 ft behind the rubber)
    const dm = Math.hypot(bp.x - MOUND.x, bp.y - MOUND.y - 1.5);
    const g = dm < 2.6 ? 10 / 12 : dm < 9 ? (10 / 12) * (9 - dm) / 6.4 : 0;
    mk.position.copy(P(bp.x, bp.y, g + 0.06));
    const d = camera.position.distanceTo(mk.position);
    const px = dM / (2 * d * Math.tan(camera.fov * D2R / 2)) * H;
    if (px < 12) dM *= 12 / Math.max(0.01, px);
    mk.scale.set(dM, 1, dM);
    mk.material.uniforms.uH.value = h;
    mk.updateMatrixWorld();
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
    // the wide camera's side, chosen once a shot (it never swaps mid shot): the side whose lens holds
    // the shot's middle moment narrower, first base side or third
    if (piece.cam === 'wide' && piece.side == null) {
      // (a shot split for its slow motion beat keeps one side: the run of wide pieces decides together)
      const ed = this.active.plan.edit;
      let i0 = ed.indexOf(piece), i1 = i0;
      while (i0 > 0 && ed[i0 - 1].cam === 'wide' && Math.abs(ed[i0 - 1].s1 - ed[i0].s0) < 1e-6) i0--;
      while (i1 >= 0 && i1 < ed.length - 1 && ed[i1 + 1].cam === 'wide' && Math.abs(ed[i1 + 1].s0 - ed[i1].s1) < 1e-6) i1++;
      const mid = i0 >= 0 ? (ed[i0].s0 + ed[i1].s1) / 2 : (piece.s0 + piece.s1) / 2;
      this.wideSide = -1; const a = this.rawCam('wide', mid, aspect).fov;
      this.wideSide = 1; const b = this.rawCam('wide', mid, aspect).fov;
      this.wideSide = null;
      const def = this.rawCam('wide', mid, aspect).pos.x > 0 ? 1 : -1;
      piece.side = Math.abs(a - b) < 4 ? def : a < b ? -1 : 1;
      // (a shot that holds a throw to first or third is seen from that base's side, down the throw, the
      // stands behind the camera: from across the field that stand is the whole back of the frame)
      const s0 = ed[Math.max(0, i0)].s0, s1 = ed[Math.max(0, i1)].s1;
      const th = this.active.plan.segs.filter((sg) => sg.kind === 'throw' && sg.t1 > s0 && sg.t0 < s1 && Math.abs(sg.b.x) > 30).pop();
      if (th) piece.side = Math.sign(th.b.x);
      if (i0 >= 0) for (let i = i0; i <= i1; i++) ed[i].side = piece.side;
    }
    this.wideSide = piece.cam === 'wide' ? piece.side : null;
    // (one shot is the whole run of pieces of its camera that follow straight on, split or not for the
    // slow motion beat: it smooths across where they meet, or the seam is a jump on screen)
    const ed = this.active.plan.edit;
    let j0 = ed.indexOf(piece), j1 = j0;
    if (j0 >= 0) {
      while (j0 > 0 && ed[j0 - 1].cam === piece.cam && Math.abs(ed[j0 - 1].s1 - ed[j0].s0) < 1e-6) j0--;
      while (j1 < ed.length - 1 && ed[j1 + 1].cam === piece.cam && Math.abs(ed[j1 + 1].s0 - ed[j1].s1) < 1e-6) j1++;
    }
    const r0 = j0 >= 0 ? ed[j0].s0 : piece.s0, r1 = j0 >= 0 ? ed[j1].s1 : piece.s1;
    // (a liner or a climbing ball moves fast: its cameras smooth over less time, so it stays in frame)
    const offs = piece.cam === 'track' || piece.cam === 'sky' ? [-0.1, -0.05, 0, 0.05, 0.1] : [-0.24, -0.12, 0, 0.12, 0.24];
    let pos = { x: 0, y: 0, z: 0 }, lk = { x: 0, y: 0, z: 0 }, fov = 0, n = 0;
    // (weighted to the middle, 1 2 3 2 1: what is a quarter second off pulls less than now)
    const wt = [1, 2, 3, 2, 1];
    let now = null;
    offs.forEach((o, i) => {
      const t = clamp(s + o, r0, r1);
      const c = this.rawCam(piece.cam, t, aspect), k = wt[i];
      if (i === 2) now = { keys: this.lastKeys, margin: c.margin, minFov: c.minFov };
      pos.x += c.pos.x * k; pos.y += c.pos.y * k; pos.z += c.pos.z * k;
      lk.x += c.look.x * k; lk.y += c.look.y * k; lk.z += c.look.z * k;
      fov += c.fov * k; n += k;
    });
    pos = { x: pos.x / n, y: pos.y / n, z: pos.z / n };
    lk = { x: lk.x / n, y: lk.y / n, z: lk.z / n };
    fov /= n;
    // (the smoothed camera still holds the deciding moment of now, which comes and goes by its weight)
    if ((piece.cam === 'wide' || piece.cam === 'follow') && now && now.keys && now.keys.length) fov = Math.max(fov, lensFor(pos, lk, now.keys, aspect, 1.12, now.minFov || 12));
    // the broadcast's room: the frame holds at least ROOM_FT of field, top to bottom where it looks, so
    // the play has its field around it (the base, the runner, the grass between) and a man is a figure in
    // it, not the frame (the owner, 2026-10-24: "it doesn't need to be super zoomed in"). The lens only
    // ever opens for it, and never past 62 degrees for it, so nothing the shot held leaves the frame.
    const dLook = Math.hypot(lk.x - pos.x, lk.y - pos.y, lk.z - pos.z);
    fov = Math.max(fov, Math.min(62, 2 * Math.atan(ROOM_FT / 2 / Math.max(1, dLook)) / D2R));
    // the slow motion beat pushes in, easing in and out over 0.15 s of the scene (not a step at its edges)
    const sl =ed.find((x) => x.rate < 1 && x.cam === piece.cam && x.s0 >= r0 - 1e-6 && x.s1 <= r1 + 1e-6);
    if (sl) fov *= 1 - 0.1 * clamp(Math.min(s - (sl.s0 - 0.15), sl.s1 + 0.15 - s) / 0.15, 0, 1);
    return { pos, look: lk, fov: clamp(fov, 4, 72) };
  }

  /** One camera, unsmoothed: where it is, what it looks at, the field of view that holds the points
      that matter (the ball, the fielder who gets it, a runner, a base). */
  rawCam(cam, s, aspect) {
    const plan = this.active.plan;
    const ball = plan.ballAt(s);
    // (the man with the ball while he has it, the pivot man above all; then the man it goes to)
    const by = (ball.by && plan.fielders[ball.by] ? ball.by : null) || this.focusFielder(s);
    const fp = by ? plan.fielders[by].at(s) : null;
    const pts = [{ x: ball.x, y: ball.y, z: ball.z }];
    // (a long throw in the air: the man taking it comes in with its target, for the last of it)
    const inAir = plan.segs.find((sg) => sg.kind === 'throw' && sg.t0 + 0.12 <= s && sg.t1 - 0.35 > s && Math.hypot(sg.b.x - sg.a.x, sg.b.y - sg.a.y) > 70);
    if (fp && !(inAir && by === inAir.to)) pts.push({ x: fp.x, y: fp.y, z: 0 }, { x: fp.x, y: fp.y, z: 6.5 });
    // the play's deciding moments near now (an out, a run, a runner pulling into his base safe): the
    // runner and his bag are in the shot from a little before until just after
    // (each comes in over half a second, its runner and bag sliding out from the ball to where they are,
    // and goes again over 0.3 s from 0.45 s after, when its own shot is over: the shot widens and narrows with no step, never a pop)
    const keys = [], keyRaw = [], far = { x: 0, y: 0, w: 0, n: 0 };
    const fade = (tq) => clamp((s - (tq - 0.85)) / 0.5, 0, 1) * clamp((tq + 0.75 - s) / 0.3, 0, 1);
    const near = (p, w) => ({ x: ball.x + (p.x - ball.x) * w, y: ball.y + (p.y - ball.y) * w, z: (ball.z || 0) + (p.z - (ball.z || 0)) * w });
    // (two at once at two bases: one camera cannot hold the diamond and still show a man. They go in a
    // fixed order, an out, a run, the hitter safe, then the rest, the earlier first; a run or a safe more
    // than 60 ft from one before it, and no later, takes only the weight that one leaves, so as one goes the next comes
    // in. An out always has its own: a double play's two are both seen)
    const groups = [];
    for (const r of plan.runners) {
      const tq = r.out ? r.outAt : r.scoreAt != null ? r.scoreAt : r.from !== r.to ? r.arrive : null;
      if (tq == null || s < tq - 0.85 || s > tq + 0.75) continue;
      if (r.batter && r.out && plan.kind === 'air_out') continue;   // (the catch is his out: the ball's shot has it)
      const q = r.track.at(s), bag = BASE[r.out ? r.outBase : Math.min(4, r.to)] || BASE[4];
      groups.push({ w: fade(tq), tq, rank: r.out ? 3 : r.scoreAt != null ? 2 : r.batter ? 1.5 : 1, q, bag });
    }
    groups.sort((a, b) => b.rank - a.rank || a.tq - b.tq);
    groups.forEach((g, i) => {
      let w = g.w;
      // (one gives up its claim from 0.2 s after it happened, over 0.3 s, while it is still in the frame)
      if (g.rank < 3) for (let j = 0; j < i; j++) if (groups[j].tq <= g.tq + 0.2 && Math.hypot(g.bag.x - groups[j].bag.x, g.bag.y - groups[j].bag.y) > 60) w *= 1 - Math.min(groups[j].w, clamp((groups[j].tq + 0.5 - s) / 0.3, 0, 1));
      if (w <= 0) return;
      keys.push(near({ x: g.q.x, y: g.q.y, z: 0 }, w), near({ x: g.q.x, y: g.q.y, z: 6 }, w), near({ x: g.bag.x, y: g.bag.y, z: 0 }, w));
      keyRaw.push({ p: { x: g.q.x, y: g.q.y, z: 0 }, w }, { p: { x: g.q.x, y: g.q.y, z: 6 }, w }, { p: { x: g.bag.x, y: g.bag.y, z: 0 }, w });
      // (where the moments are, for a wide shot that leaves the ball for them)
      far.x += (g.q.x + g.bag.x) / 2 * w; far.y += (g.q.y + g.bag.y) / 2 * w; far.w = Math.max(far.w, w); far.n += w;
    });
    // a tag-up: from the catch, the runner leaving his bag (in from the catch, out again after its shot)
    const ca = plan.kind === 'air_out' && plan.events.find((e) => e.kind === 'catch');
    // (the lead runner: two tagging at once at first and third are a frame of the whole diamond)
    const lead = ca && plan.runners.filter((r) => !r.batter && r.to > r.from).sort((a, b) => b.from - a.from)[0];
    if (lead && s > ca.s - 0.2 && s < ca.s + 1.55) for (const r of [lead]) {
      const w = clamp((s - (ca.s - 0.2)) / 0.3, 0, 1) * clamp((ca.s + 1.55 - s) / 0.3, 0, 1);
      const q = r.track.at(s), bag = BASE[r.from];
      keys.push(near({ x: q.x, y: q.y, z: 0 }, w), near({ x: q.x, y: q.y, z: 6 }, w), near({ x: bag.x, y: bag.y, z: 0 }, w));
      keyRaw.push({ p: { x: q.x, y: q.y, z: 0 }, w }, { p: { x: q.x, y: q.y, z: 6 }, w }, { p: { x: bag.x, y: bag.y, z: 0 }, w });
      far.x += (q.x + bag.x) / 2 * w; far.y += (q.y + bag.y) / 2 * w; far.w = Math.max(far.w, w); far.n += w;
    }
    if (far.n) { far.x /= far.n; far.y /= far.n; }
    this.lastKeys = keys;
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
      const ahead = 0.15;
      const th = plan.segs.find((sg) => sg.kind === 'throw' && sg.t0 > s - 0.1 && sg.t0 < s + ahead);
      // (a long one's target comes in as the ball nears it, below: the pivot stays tight until it goes)
      if (th && Math.hypot(th.b.x - th.a.x, th.b.y - th.a.y) <= 70) pts.push({ x: th.b.x, y: th.b.y, z: 0 }, { x: th.b.x, y: th.b.y, z: 6 });
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
      const thNow = plan.segs.find((sg) => sg.kind === 'throw' && sg.t0 <= s && sg.t1 >= s - 0.3);
      // (the throw's target; its thrower only as it leaves his hand, then the camera goes with the ball)
      if (thNow) {
        // (a long throw: the camera goes with the ball, and its target comes in for the last of it)
        const long = Math.hypot(thNow.b.x - thNow.a.x, thNow.b.y - thNow.a.y) > 70;
        if (!long || s > thNow.t1 - 0.35) pts.push({ x: thNow.b.x, y: thNow.b.y, z: 6 });
        if (s < thNow.t0 + 0.12) pts.push({ x: thNow.a.x, y: thNow.a.y, z: 0 });
      }
      // from behind the plate, high, trailing the action at about half its distance (a camera on a
      // wire): close enough that a fielder is a figure, not a speck
      pts.push(...keys);
      if (keys.length) wBall = 0.3;
      const c = centre(pts, wBall);
      const r = Math.hypot(c.x, c.y);
      // (with a deciding moment near, the wire pulls back and up: the bag and the runner beside the ball)
      // (halfway in and high, and 32 ft behind the nearest thing it holds: a pop up behind the plate keeps its distance)
      const near = Math.min(...pts.map((p) => p.y));
      pos = { x: c.x * 0.5, y: Math.min(c.y * 0.5 - 44, near - 32), z: 34 + r * 0.1 };
      // (never back in the seats behind the plate, 56 ft back: it climbs instead of backing up)
      if (pos.y < -46 && c.y > 20) { pos.z += (-46 - pos.y) * 0.6; pos.y = -46; }
      return this.backOff(pos, pts, wBall, aspect, keys.length ? 1.3 : 1.25, 12);
    }
    if (cam === 'track') {
      // low behind the plate, off to the side away from the ball, panning with the liner
      const sd = spray >= 0 ? -1 : 1;
      pos = { x: sd * 40, y: -34, z: 15 };
      pts.push(...keys);
      return this.fit(pos, pts, wBall, aspect, 1.4, 10);
    }
    if (cam === 'wide') {
      // the other angle for a jump cut: high on the side of the field away from the ball (a camera at
      // the edge of the field by the dugout, on a crane that leans in), on the ball, whoever has it,
      // where it is going and the runners near it (the side that holds it all in the narrower lens,
      // the first base side or the third). Everything in it comes and goes by a weight, sliding in
      // from the ball and out again, so the shot moves and never jumps.
      const sd = this.wideSide || (ball.x >= 0 ? -1 : 1);
      const ramp = (a, b) => clamp((s - a) / (b - a), 0, 1);
      const slide = (p, w) => ({ x: ball.x + (p.x - ball.x) * w, y: ball.y + (p.y - ball.y) * w, z: (ball.z || 0) + (p.z - (ball.z || 0)) * w });
      // a throw on its way, or about to be: its target (in half a second before it goes, out after it lands)
      let wTh = 0, th = null;
      for (const sg of plan.segs) if (sg.kind === 'throw') {
        const w = ramp(sg.t0 - 0.5, sg.t0 - 0.2) * (1 - ramp(sg.t1 - 0.1, sg.t1 + 0.2));
        if (w > wTh) { wTh = w; th = sg; }
      }
      if (th) pts.push(slide({ x: th.b.x, y: th.b.y, z: 0 }, wTh), slide({ x: th.b.x, y: th.b.y, z: 6 }, wTh));
      for (const r of plan.runners) {
        // a runner near his deciding moment, or near the ball (the batter pulling into his base above
        // all), until a moment after he is out or scores
        const q = r.track.at(s), tq = r.out ? r.outAt : r.scoreAt != null ? r.scoreAt : r.arrive;
        const end = r.out ? (r.outAt ?? 0) + 0.4 : r.scoreAt != null ? r.scoreAt + 0.3 : Infinity;
        const soon = tq != null ? ramp(tq - 1.0, tq - 0.6) * (1 - ramp(tq + 0.4, tq + 0.7)) : 0;
        const by = 1 - clamp((Math.hypot(q.x - ball.x, q.y - ball.y) - 80) / 30, 0, 1);
        const w = Math.max(soon, by) * (1 - ramp(end, end + 0.3));
        if (w > 0) pts.push(slide({ x: q.x, y: q.y, z: 0 }, w), slide({ x: q.x, y: q.y, z: 6 }, w));
      }
      // a deciding moment far from the ball: the shot leaves the ball for it, the rest drawn in to the
      // runner and his bag as the moment comes on (so it slides there, it never jumps)
      const wa = far.n ? far.w * clamp((Math.hypot(ball.x - far.x, ball.y - far.y) - 40) / 30, 0, 1) : 0;
      const held = pts.map((p) => ({ x: p.x + (far.x - p.x) * wa, y: p.y + (far.y - p.y) * wa, z: p.z * (1 - wa) }));
      // (a moment comes in from where this shot already is, not from the ball: drawn to a moment far
      // away, the ball is out of it, and a moment sliding in from there would jump in from off screen)
      const o = centre(held, 0.35);
      const wk = keyRaw.map((k) => ({ x: o.x + (k.p.x - o.x) * k.w, y: o.y + (k.p.y - o.y) * k.w, z: o.z + (k.p.z - o.z) * k.w }));
      const use = [...held, ...wk];
      this.lastKeys = wk;
      const w0 = keys.length ? 0.15 : 0.35, m0 = keys.length ? 1.4 : 1.25;
      const c = centre(use, w0);
      // (a throw to first or third in the shot: it stays near the dugout, down the line of the throw,
      // second to first or short to first, with the thrower behind the man taking it)
      const lean = 0.5 - 0.35 * (th && Math.abs(th.b.x) > 30 ? wTh : 0);
      // the furthest in it can lean and still hold it all in a lens of 62 degrees; from the edge of the
      // field it climbs, if it must, rather than back into the seats (both found smoothly, by halves)
      // (it stands by the dugout, over the front rows; as it climbs it comes in to the edge of the field,
      // so a high crane looks down on the field and not on the seats under it)
      const A = { x: sd * 105, y: 20 }, E = { x: sd * 88, y: 28 };
      const at = (L, z) => {
        const u = clamp((z - 48) / 20, 0, 1), a = { x: A.x + (E.x - A.x) * u, y: A.y + (E.y - A.y) * u };
        return this.fit({ x: a.x + (c.x - a.x) * L, y: a.y + (c.y - a.y) * L, z }, use, w0, aspect, m0, 16);
      };
      let k = at(lean, 48);
      if (k.fov > 62) {
        if (at(0, 48).fov <= 62) {
          let lo = 0, hi = lean;
          for (let i = 0; i < 12; i++) { const mid = (lo + hi) / 2; if (at(mid, 48).fov <= 62) lo = mid; else hi = mid; }
          k = at(lo, 48);
        } else {
          let lo = 48, hi = 140;
          for (let i = 0; i < 12; i++) { const mid = (lo + hi) / 2; if (at(0, mid).fov <= 62) hi = mid; else lo = mid; }
          k = at(0, hi);
        }
      }
      return k;
    }
    if (cam === 'plate') {
      // low on the first base side, the plate and the runner coming home
      pos = { x: 36, y: 24, z: 4.5 };
      const home = plan.runners.filter((r) => r.to === 4 || (r.out && r.outBase === 4));
      pts.length = 0;
      pts.push({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 6 });
      for (const r of home) { const q = r.track.at(s); if (Math.hypot(q.x, q.y) < 70) pts.push({ x: q.x, y: q.y, z: 0 }, { x: q.x, y: q.y, z: 6 }); }
      if (ball && Math.hypot(ball.x, ball.y) < 60) pts.push({ x: ball.x, y: ball.y, z: ball.z });
      pts.push(...keys.filter((k) => Math.hypot(k.x, k.y) < 75));
      return this.fit(pos, pts, 0.2, aspect, 1.4, 24);
    }
    return this.fit({ x: 0, y: -52, z: 36 }, pts, wBall, aspect, 1.35, 12);
  }

  /** fit(), but a camera close enough to need a lens past 62 degrees backs away from what it holds until it fits. */
  backOff(pos, pts, wBall, aspect, margin, minFov) {
    let k = this.fit(pos, pts, wBall, aspect, margin, minFov);
    for (let i = 0; i < 5 && k.fov > 62; i++) {
      const c = k.look;
      pos = { x: c.x + (pos.x - c.x) * 1.3, y: c.y + (pos.y - c.y) * 1.3, z: c.z + (pos.z - c.z) * 1.3 };
      k = this.fit(pos, pts, wBall, aspect, margin, minFov);
    }
    return k;
  }

  /** Aim from pos at a point between the ball and the rest, wide enough to hold every point. */
  fit(pos, pts, wBall, aspect, margin, minFov) {
    const c = centre(pts, wBall);
    return { pos, look: c, fov: lensFor(pos, c, pts, aspect, margin, minFov), pts, margin, minFov };
  }

  /** Back to the set: everyone hidden, the people back, the camera's own lens. */
  end(camera) {
    const A = this.active;
    if (!A) return;
    this.crew.hide();
    this.park.visible = false;
    this.renderer.shadowMap.autoUpdate = true;
    this.trail.visible = false;
    this.marker.visible = false;
    const pp = this.people;
    pp.batter.root.visible = true;
    pp.catcher.root.visible = true;
    if (this.ball) this.ball.scale.setScalar(this.ballScale0);
    if (camera && A.fov0 != null) { camera.fov = A.fov0; camera.updateProjectionMatrix(); }
    this.active = null;
  }
}

/** The look point: the first point (the ball) weighted wBall against the mean of the rest. */
/** The lens (degrees) that holds every point from pos looking at c, with a margin. */
function lensFor(pos, c, pts, aspect, margin, minFov) {
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
  return Math.max(minFov, fov);
}

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

/** The ball's ground marker: one flat quad, a dark disc with a bright ring, its softness on uH. */
function makeMarker(scene) {
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -8, polygonOffsetUnits: -8,
    uniforms: { uH: { value: 0 }, uRing: { value: new THREE.Color(1.0, 0.96, 0.82) } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: [
      'uniform float uH; uniform vec3 uRing; varying vec2 vUv;',
      'void main(){',
      '  float r = length(vUv - 0.5) * 2.0;',
      // the disc: soft edged when the ball is high, crisp as it comes down
      '  float soft = mix(0.06, 0.5, uH);',
      '  float disc = (1.0 - smoothstep(0.7 - soft, 0.7, r)) * mix(0.6, 0.35, uH);',
      // the ring: thin and bright low, wider and fainter high
      '  float rw = mix(0.05, 0.11, uH);',
      '  float ring = (1.0 - smoothstep(rw * 0.45, rw, abs(r - 0.84))) * mix(0.9, 0.5, uH);',
      '  float a = clamp(disc + ring, 0.0, 1.0);',
      '  if (a < 0.004) discard;',
      '  gl_FragColor = vec4(uRing * (ring / max(1e-3, ring + disc)), a);',
      '}',
    ].join('\n'),
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), mat);
  m.renderOrder = 4; m.frustumCulled = false; m.visible = false;
  scene.add(m);
  return m;
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
