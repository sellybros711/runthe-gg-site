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
import { planPlay, planSteal, planPickoff, warp, realAt, bagOf, BASE, MOUND, wallDist } from './inplay-plan.js?v=16';
import { Crew } from './fielders.js?v=6';
import { buildBallpark } from './ballpark.js?v=17';
// (the same URL stage.js imports, so both share one copy of people.js)
import { kitFor } from './people.js?v=40';
import { look } from './looks.js?v=3';
import { P, FT } from './units.js?v=1';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const ramp = (s, a, b) => smooth((s - a) / (b - a));
const bump = (s, a, b, c, d) => ramp(s, a, b) * (1 - ramp(s, c, d));
const D2R = Math.PI / 180;
// the least of the field the broadcast shows, top to bottom at the point it looks at, in feet (cameraAt):
// a 6 ft man is then at most about a tenth of the frame (45 ft until the owner, 2026-10-26: "show more of
// the field at once")
const ROOM_FT = 60;
// (the low plate camera is the close one, saved for a run scoring: it keeps the tighter room it had)
const ROOM_PLATE_FT = 46;
const roomOf = (cam) => (cam === 'plate' ? ROOM_PLATE_FT : ROOM_FT);
// the broadcast's cameras that stand still (feet, catcher's view): the high home, high behind the plate
// over the net, the high first and third base cameras (x mirrored for third) over the seats down the line,
// and the low first base camera by the dugout for a run scoring
const HIGH_HOME = { x: 0, y: -115, z: 72 }, HIGH_BASE = { x: 150, y: 45, z: 58 }, LOW_FIRST = { x: 56, y: 32, z: 8 };
// how long an infield play's bag takes to leave the high home's frame once its throw is in (seconds)
const INF_FADE = 1.2;
// the body's coarse copy below this height on screen (CSS px; fielders.js clusterLod)
const LOD_PX = 70;
const BALL_D = 2 * 1.45 * 0.0254;     // a baseball across, 7.37 cm (the mesh in gear3d.js baseball())
const BALL_MIN_PX = 2;                // the least a ball in play is drawn across on screen (a floor, not a size)
// the broadcast camera's moves (cameraAt, shot, track): the director's camera (rawCam) every TRACK_DT of
// real time, eased the way an operator moves a camera. EASE_S is the sigma of the smoothing of where it
// looks, POS_EASE_S of where it stands and RAWFOV_S of the director's lens (seconds of real time, each
// camera its own: the fast ball's cameras less, so a liner or a ball climbing stays in the frame).
// FOV_EASE_S eases what the lens must open by to hold what it must (HOLD_MARGIN round a deciding moment,
// BALL_MARGIN round the ball), and LENS_SCALE is how much of the director's own margin the eased lens
// keeps. A shot that would still turn faster than PAN_MAX degrees a frame at 60 frames a second, or zoom
// sharper than ZOOM_MAX, is eased longer. A throw is held for its last ARRIVE_S. The lens eases into a
// knee from KNEE degrees to 72, the widest. The slow motion beat pushes in over PUSH_S. KICK_MAX is the
// sharpest change of turn (degrees a frame, a frame) a shot may have before it is eased longer.
const TRACK_DT = 1 / 20;
const EASE_S = { follow: 0.3, wide: 0.3, plate: 0.3, sky: 0.12, track: 0.2 };
const FOV_EASE_S = { follow: 0.2, wide: 0.18, plate: 0.15, sky: 0.08, track: 0.1 }, PUSH_S = 0.35, HOLD_MARGIN = 1.1, ARRIVE_S = 0.5, KNEE = 64, LENS_SCALE = 0.75, BALL_MARGIN = 1.2, PAN_MAX = 0.6, KICK_MAX = 0.035, ZOOM_MAX = 0.007;
const RAWFOV_S = { follow: 0.3, wide: 0.25, plate: 0.2, sky: 0.1, track: 0.12 };
const POS_EASE_S = { follow: 0.25, wide: 0.16, plate: 0.12, sky: 0.08, track: 0.08 };
// the fielders' and runners' clips (lab/pipeline/build_people.py 'fielder'), with their content hash
// as every asset URL carries one (lab/pipeline/stamp.mjs computes the same)
const MOTION = new URL('./assets/fielder.glb?h=d58d54f7c5', import.meta.url).href;
const OF = [7, 8, 9];
const CYCLE = { fielder: 13.5, runner: 14.5 };          // feet run per full stride cycle (two steps)

/** The angle from a to b the short way round. */
/** The way a body standing at p faces something at q: toward it, but near it (within a few feet, a ball
    over his head) toward home plate, turning to it as it gets clear, so it never flips round as it passes. */
function faceToward(p, q) {
  const toQ = heading(p, q), home = heading(p, { x: 0, y: 0 });
  const w = smooth((Math.hypot(q.x - p.x, q.y - p.y) - 4) / 12);
  return home + angDiff(home, toQ) * w;
}
/** A facing turned from a toward b by weight w (0..1), the short way round. */
function turnTo(a, b, w) { return a + angDiff(a, b) * clamp(w * 1.5, 0, 1); }
function angDiff(a, b) { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; }
const heading = (from, to) => Math.atan2(to.x - from.x, to.y - from.y);
const _frustum = new THREE.Frustum(), _mat = new THREE.Matrix4(), _sph = new THREE.Sphere(), _v3 = new THREE.Vector3();

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
      fourteen off that frame; the bodies' bone textures (three.js makes one on a body's first draw)
      are made and uploaded here too (2026-10-26). What remains is textures still loading. */
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
    // (and each body's bone texture, which three.js makes on that body's first draw: a fielder first in
    // the frame mid pan, the right fielder on a ball to right, was a new texture made and uploaded then)
    for (const f of this.crew.figures) {
      const sk = f.mesh && f.mesh.skeleton;
      if (!sk) continue;
      if (!sk.boneTexture) sk.computeBoneTexture();
      if (sk.boneTexture && !seen.has(sk.boneTexture)) { seen.add(sk.boneTexture); r.initTexture(sk.boneTexture); }
    }
    return seen.size;
  }

  /** A ball in play: plan it from the engine's PitchResult and the pitch as the scene threw it. */
  begin(pr, pitch, o = {}) {
    const b = this.facts.batter;
    const contact = pitch.after ? pitch.f.at(pitch.after.t0) : { x: 0, y: 1.2, z: 2.6 };
    // (a steal on a ball or a strike, rules 7: its own plan, from the catch)
    const steal = pr.result !== 'in_play' && pr.steal && (pr.steal.result === 'safe' || pr.steal.result === 'out');
    // (and a pickoff throw between pitches: pr is { pickoff, basesBefore }, stage.js pickoff)
    const po = pr.pickoff && pr.result == null ? pr.pickoff : null;
    const plan = po ? planPickoff(po, { bats: b.bats, basesBefore: pr.basesBefore }) : steal ? planSteal(pr, { bats: b.bats, id: pr.drawn ? pr.drawn.id : String(pr.n ?? 'x') }) : planPlay(pr, { bats: b.bats, contact, id: pr.drawn ? pr.drawn.id : String(pr.n ?? 'x') });
    this.active = { pr, plan, pitch, hooks: o.hooks || {}, fired: 0, cam: null, fov0: null };
    this.ball = pitch.ball;
    this.ballScale0 = this.ball.scale.x;
    // who holds the ball next, at each moment (for the camera)
    this.active.holds = plan.segs.filter((sg) => sg.kind === 'held').map((sg) => ({ t: sg.t0, by: sg.by }));
    // an infield play's bags, every throw's to the infield (for the high home camera, rawCam)
    const ft0 = (plan.outcome && plan.outcome.firstTouch) || {};
    const infPlay = (plan.kind === 'ground_play' || plan.kind === 'ground_hit') && ft0.n != null && ft0.n <= 6 && Math.hypot(ft0.at ? ft0.at.x : 0, ft0.at ? ft0.at.y : 0) < 160;
    // (and a bag a runner is out, scores or pulls in safe at, from 1.6 s before, when another moment comes
    // within a second of it at a bag across the diamond: one high shot holds the two together)
    this.active.steal = steal || !!po;
    // (a steal: home and the bag he steals, the throw down and the tag in the high home's one shot; a
    // pickoff: the rubber and the bag)
    if (po) this.active.infield = [{ x: 0, y: 60.5, t1: 99 }, { ...BASE[po.base], t1: 99 }];
    else if (steal) this.active.infield = [{ x: 0, y: 0, t1: 99 }, { ...BASE[pr.steal.to], t1: 99 }];
    else this.active.infield = infPlay ? [
      ...plan.segs.filter((sg) => sg.kind === 'throw' && Math.hypot(sg.b.x, sg.b.y) < 135).map((sg) => ({ x: sg.b.x, y: sg.b.y, t1: sg.t1 })),
      ...crowded(plan.runners.map((r) => { const tq = r.out ? r.outAt : r.scoreAt != null ? r.scoreAt : r.from !== r.to ? r.arrive : null, bag = BASE[r.out ? r.outBase : Math.min(4, r.to)]; return tq != null && tq < 100 && bag ? { x: bag.x, y: bag.y, t1: tq, t0: tq - 1.6 } : null; }).filter(Boolean)),
    ] : [];
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
      // (a steal has no ball landing: the play by play waits for nothing but its call)
      land: steal || po ? null : { s: landS, real: realAt(plan.edit, landS), how: oc.ball, fair: true },
      steal,
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
    // (a steal: the hitter is still in the box, bat in hand)
    pp.batter.root.visible = !broadcast || !!A.steal;
    if (pp.batter.bat && broadcast && !A.steal) {
      // he let go of the bat on his way: it lies in the dirt by the box
      const side = this.facts.batter.bats === 'L' ? 1 : -1;
      pp.batter.bat.position.copy(P(side * 3.6, 1.8, 0.11));
      pp.batter.bat.rotation.set(0, side * 0.5, Math.PI / 2);
      pp.batter.bat.updateMatrixWorld(true);
    }
    if (pt.overlays) for (const o of [pt.tracer, pt.aimRing, pt.hitDot]) o.visible = !broadcast;
    pp.catcher.root.visible = !(broadcast && A.usesCatcher);
    this.park.visible = broadcast;
    // (the backstop net's three poles stand between the high home camera and the field: on television a
    // net's cables are lost in the distance, so the broadcast leaves them out)
    if (!this.netPoles) this.netPoles = this.scene.getObjectsByProperty('name', 'netPole');
    for (const o of this.netPoles) o.visible = !broadcast;
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
    // ---- each body's detail for its size on screen: a man under LOD_PX tall is drawn from the coarse body
    // (fielders.js clusterLod, a tenth of the triangles). The wide high shots hold every fielder at once,
    // and the full body is some 30k triangles a man for a figure twenty pixels tall
    if (broadcast) {
      const H = camera.userData.cssH || 800, k = H / (2 * Math.tan(camera.fov * D2R / 2));
      for (const f of this.crew.figures) if (f.root.visible) this.crew.detail(f, 1.85 * k / Math.max(1, camera.position.distanceTo(f.root.position)), LOD_PX);
    }
    // (and the set's umpire, behind the plate in the high home's frame: his mask is a cage of a dozen
    // pieces, each a draw, under a pixel across on a man that small. It is left off while he is)
    const ump = this.people.umpire;
    if (ump && ump.mask) {
      const k = (camera.userData.cssH || 800) / (2 * Math.tan(camera.fov * D2R / 2));
      ump.mask.visible = !(broadcast && 1.85 * k / Math.max(1, camera.position.distanceTo(ump.root.getWorldPosition(_v3))) < LOD_PX);
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

  poseFielder(n, f, s, ball, probe = null) {
    const plan = this.active.plan, tr = plan.fielders[n];
    const st = tr.at(s);
    const acts = tr.acts;
    // every ball he takes (a catch, a ground ball, a throw at a bag, a tag, a throw in to the cutoff
    // man), and when: the fit is solved once at that moment, and comes in and goes from it (below)
    const TAKES = ['catch', 'drop', 'field', 'pickup', 'receive', 'catch_throw', 'tag'];
    const tookAt = (a) => (a.kind === 'tag' ? a.tagAt ?? a.t : a.t);
    const takes = [];
    // (one ball is one take: a throw caught at a bag is a catch_throw and a receive at one moment)
    for (const a of acts) if (TAKES.includes(a.kind) && !takes.some((x) => Math.abs(x.t - tookAt(a)) < 0.02)) takes.push({ key: a, t: tookAt(a) });
    for (const sg of plan.segs) if (sg.kind === 'throw' && sg.to === n && !takes.some((x) => Math.abs(x.t - sg.t1) < 0.05)) takes.push({ key: sg, t: sg.t1 });
    // a run that ends at full speed (an outfielder running a ball down) does not stop dead: he
    // carries on a few strides and slows (short of the wall)
    let glide = 0;
    // (a ground ball taken on the run carries him on too: the fit at the take is solved once and kept,
    // so the glide no longer pulls against it)
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
    // (how much he is running: a set, getting down to a ball, gives way to his stride at speed)
    const moving = smooth((spd - 4) / 10);
    const spec = { run: { phase: this.crew.clips ? tr.phase.at(s) + 2 * Math.PI * glide / this.crew.clips.run.strideFt : 2 * Math.PI * st.run / CYCLE.fielder, amp: clamp(spd / 26, 0, 1.1) }, crouch: 0, lean: 0, idleT: s + n * 0.83, look: { x: ball.x, y: ball.y, z: ball.z }, lookW: spd > 6 ? 0.55 : 1 };
    // ready at the pitch, standing tall once he is out of it
    const inf = !OF.includes(n);
    spec.crouch = (inf ? 0.32 : 0.18) * (1 - ramp(s, 0.15, 0.6));
    spec.lean = (inf ? 0.25 : 0.12) * (1 - ramp(s, 0.15, 0.6));
    // where he looks and faces when he is not running: the ball, or (holding it) the infield
    let lookPt = { x: ball.x, y: ball.y };
    if (ball.by === n) lookPt = { x: 0, y: 70 };
    // (a ball right over him, a throw passing above his head: facing it would turn him half round in a
    // frame as it crosses, so near him he faces the plate and turns to it as it goes on)
    let faceYaw = ball.by === n ? faceToward(st, lookPt) : this.faceTrail(st, s);
    f.throwing = false; f.reaching = false;
    let gloveW = 0, glove = null, handW = 0, hand = null, lift = 0, dive = 0;
    // a ball he takes (a catch in the air, a throw at a bag): the point, and how far his body is
    // moved so the glove is on it (catchFit, below)
    let take = null, takeW = 0;
    // (a tag too, at its own moment: the throw that follows it waits for the glove to be on the runner)
    // (by a weight that eases off after the take: a switch at its edge dropped the glove from the ball
    // to his side in one frame, lab/pipeline/check-jolt.mjs)
    let takingNow = 0;
    for (const a of acts) if (TAKES.includes(a.kind)) takingNow = Math.max(takingNow, bump(s, tookAt(a) - 0.5, tookAt(a) - 0.48, tookAt(a) + 0.02, tookAt(a) + 0.22));
    // the moments he acts
    for (const a of acts) {
      const t = a.t;
      if (a.kind === 'set') spec.crouch = Math.max(spec.crouch, 0.35 * bump(s, t - 0.15, t + 0.05, t + 0.6, t + 0.9) * (1 - moving));
      if (a.kind === 'field' || a.kind === 'pickup') {
        const k = bump(s, t - 0.38, t - 0.06, t + 0.12, t + 0.45);
        // (the fit comes in on its own weight, from before his reach starts: set only with the reach, it
        // came in part way at once and jumped him toward the ball, lab/pipeline/check-jolt.mjs)
        const bp = a.ball || ball;
        const kw = ramp(s, t - 0.45, t - 0.05) * (1 - ramp(s, t + 0.3, t + 0.9));
        if (kw > takeW && s <= t + 1e-6) { take = { x: bp.x, y: bp.y, z: 0.2, t, key: a }; takeW = kw; }
        if (k > 0) {
          spec.crouch = Math.max(spec.crouch, 0.95 * k); spec.wide = 0.8 * k; spec.lean = Math.max(spec.lean, 0.75 * k);
          glove = { x: bp.x, y: bp.y, z: 0.2 }; gloveW = Math.max(gloveW, k);
          hand = { x: bp.x, y: bp.y, z: 1.0 }; handW = 0.7 * k;
          faceYaw = turnTo(faceYaw, heading(st, plan.ballAt(t - 0.3)), k);
          f.reaching = true;
        }
      }
      if (a.kind === 'catch' || a.kind === 'drop') {
        const k = ramp(s, t - 0.5, t - 0.05) * (1 - ramp(s, t + 0.25, t + 0.7));
        if (k > 0) {
          const q = a.ball;
          glove = { x: q.x, y: q.y, z: q.z }; gloveW = Math.max(gloveW, k);
          const kw = ramp(s, t - 0.5, t - 0.05) * (1 - ramp(s, t + 0.4, t + 1.2));
          if (kw > takeW && s <= t + 1e-6) { take = { ...glove, t, key: a }; takeW = kw; }
          // he takes it in front of him: he faces where it comes from
          const prev = plan.ballAt(t - 0.25);
          faceYaw = turnTo(faceYaw, heading(q, prev), k);
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
          if (seg) { const kw = ramp(s, t - 0.45, t - 0.08) * (1 - ramp(s, t + 0.4, t + 1.0)); if (kw > takeW && s <= t + 1e-6) { take = { ...glove, t, key: a }; takeW = kw; } }
          // at first base on a force: the stretch, the glove side foot out toward the throw, the
          // other on the bag, low and long
          if (a.kind === 'receive' && a.base === 1) {
            const kk = bump(s, t - 0.4, t - 0.12, t + 0.2, t + 0.6);
            const gl = f.glove === 'r' ? 'r' : 'l', ot = gl === 'l' ? 'r' : 'l';
            spec.stride = { [gl]: 0.75 * kk, [ot]: -0.15 * kk };
            spec.crouch = Math.max(spec.crouch, 0.3 * kk); spec.lean = Math.max(spec.lean, 0.45 * kk); spec.wide = Math.max(spec.wide || 0, 0.5 * kk);
          }
          if (seg) faceYaw = turnTo(faceYaw, heading(st, seg.a), k);
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
            // (the part of him nearest the bag as he is drawn, sliding in, his lead foot or hand: the
            // tag goes on what gets there first. His hips, four to nine feet back on a slide, had the
            // fielder lunge his whole body at them.)
            const bag = a.base === 4 ? { x: 0, y: 0.7 } : BASE[a.base] || q;
            let tg = { x: q.x, y: q.y, z: 0.7 };
            // (after the tag too: the glove stays on the part of him it touched as he lies on the bag. Back
            // on his track's end it jumped a man's length in a frame, check-jolt.mjs)
            if (r.fig && r.fig.root.visible && r.fig.posedAt === s) {
              r.fig.root.updateMatrixWorld(true);
              let best = null;
              for (const j of ['foot_l', 'foot_r', 'calf_l', 'calf_r', 'hand_l', 'hand_r', 'pelvis']) { if (!r.fig.bones[j]) continue; const pj = r.fig.jointPoint(j), d = Math.hypot(pj.x - bag.x, pj.y - bag.y); if (!best || d < best.d) best = { d, p: pj }; }
              if (best) tg = { x: best.p.x, y: best.p.y, z: Math.max(0.4, best.p.z) };
            }
            // (the glove goes to him only once the ball is in it: before the catch it is on the throw,
            // and from the catch it carries over to him)
            if (s > t + 1e-6) {
              const kc = ramp(s, t, Math.max(t + 0.08, tt));
              glove = glove ? { x: glove.x + (tg.x - glove.x) * kc, y: glove.y + (tg.y - glove.y) * kc, z: glove.z + (tg.z - glove.z) * kc } : tg;
              gloveW = Math.max(gloveW, k3);
            }
            // (once the ball is in his glove the tag is what he reaches for)
            const kw = ramp(s, tt - 0.35, tt - 0.03) * (1 - ramp(s, tt + 0.3, tt + 0.8));
            // (it takes over from the throw he caught, coming in from then to the tag, not all at once)
            const kin = ramp(s, t, Math.max(t + 0.06, tt));
            if (s > t + 1e-6 && s <= tt + 1e-6 && kw * kin > 0) { take = { ...tg, t: tt, key: a }; takeW = Math.max(kw * kin, takeW); }
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
          faceYaw = turnTo(faceYaw, heading(st, a.to), w);
          spec.look = { x: a.to.x, y: a.to.y, z: 4 };
          f.throwing = s < rel;
          // (the glove stays on a ball he is still taking: a quick release starts after the catch)
          if (gloveW > 0) gloveW *= 1 - w * (1 - takingNow) * ramp(s, rel - 0.47, rel - 0.43);
        }
      }
      if (a.kind === 'dive' || a.kind === 'dive_short') {
        const at = a.to || a.at;
        let k = ramp(s, t - 0.18, t + 0.12) * (1 - ramp(s, t + 0.75, t + 1.35));
        // (a ball he then picks up: he is up for it, and stays up. Undone only while that pickup was
        // his take, the dive came back whole in the frame after it, laid out flat in one frame at a
        // ball he already had, lab/pipeline/check-jolt.mjs)
        const up = acts.find((b) => b.t > t && (b.kind === 'field' || b.kind === 'pickup'));
        if (up) k *= 1 - ramp(s, up.t - 0.45, up.t - 0.05);
        if (k > 0) {
          dive = Math.max(dive, k);
          faceYaw = turnTo(faceYaw, heading(st, at), k);
          glove = { x: at.x, y: at.y, z: 0.6 }; gloveW = Math.max(gloveW, k);
        }
      }
      if (a.kind === 'leap_miss') {
        const k = bump(s, t - 0.3, t - 0.02, t + 0.05, t + 0.4);
        if (k > 0) { lift = Math.max(lift, 2.2 * k); spec.armsUp = k; faceYaw = turnTo(faceYaw, heading(st, a.at), k); }
      }
    }
    // a throw coming to him with no act of its own (the cutoff man taking a throw in): his glove
    // goes to it as at a bag
    for (const sg of plan.segs) {
      if (sg.kind !== 'throw' || sg.to !== n || take && Math.abs(take.t - sg.t1) < 0.05) continue;
      const t = sg.t1, kw = ramp(s, t - 0.45, t - 0.08) * (1 - ramp(s, t + 0.4, t + 1.0));
      if (kw <= takeW || s > t + 1e-6) continue;
      const k = bump(s, t - 0.45, t - 0.08, t + 0.15, t + 0.5);
      glove = { x: sg.b.x, y: sg.b.y, z: sg.b.z }; gloveW = Math.max(gloveW, k);
      faceYaw = turnTo(faceYaw, heading(st, sg.a), k);
      f.reaching = s < t + 0.02;
      take = { ...glove, t, key: sg }; takeW = kw;
    }
    // a low one (a liner at his shins, a sinking fly): he gets down to it
    // the throw's windup waits for the ball he is still taking
    if (take && spec.throwW > 0) { spec.throwW *= 1 - takeW; spec.twist = (spec.twist || 0) * (1 - takeW); }
    // a ground ball picked up: up from any dive first
    if (take && take.z < 1) dive *= 1 - takeW;
    if (take && take.z < 3.2) {
      spec.crouch = Math.max(spec.crouch, Math.min(1, (3.4 - take.z) / 2.6) * takeW);
      // (the run's capture gives way: he gets down to it, his stride broken down into the set)
      // (only as he slows: charging a slow roller he scoops it on the run, his stride going on under
      // him and his trunk bent down to it, the knees giving a little at the scoop (a crouched body
      // broken down at speed slid along the grass, check-jolt.mjs))
      const dip = take.z < 1 ? bump(s, take.t - 0.18, take.t - 0.05, take.t + 0.03, take.t + 0.15) : 0;
      spec.settle = takeW * (1 - moving + moving * dip);
      if (take.z < 1) spec.bend = takeW * moving;
    }
    // the ball held: glove and ball together in front of his chest, whatever reach is easing off
    // (and through the first of his throw's windup, giving way over it: switched off whole as the windup's
    // weight began, the glove dropped from his chest in a frame, check-jolt.mjs)
    // (it eases back to what the glove did without it, the reach of a pickup still on, never to nothing)
    const early = f.throwing ? 1 - clamp((spec.throwW || 0) / 0.3, 0, 1) : 1;
    if (ball.by === n && early > 0) {
      const fw = { x: Math.sin(faceYaw), y: Math.cos(faceYaw) };
      const chest = { x: st.x + fw.x * 1.0, y: st.y + fw.y * 1.0, z: 3.9 };
      const k = glove ? gloveW : 0, g0 = glove, w0 = glove ? gloveW : 0;
      let hg = glove ? { x: chest.x + (glove.x - chest.x) * k, y: chest.y + (glove.y - chest.y) * k, z: chest.z + (glove.z - chest.z) * k } : chest;
      const hw = Math.max(0.85, k) * (spec.throwW > 0 ? 1 - spec.throwW : 1);
      if (early < 1 && g0) hg = { x: g0.x + (hg.x - g0.x) * early, y: g0.y + (hg.y - g0.y) * early, z: g0.z + (hg.z - g0.z) * early };
      glove = hg;
      gloveW = w0 + (hw - w0) * early;
    }
    // the fit runs up to the moment he takes the ball; after it, what it did then is carried (below)
    if (take && s > take.t + 1e-6) { take = null; takeW = 0; }
    // facing: his run's heading while running, else where his attention is
    const w = smooth((spd - 3) / 8);
    let yaw = faceYaw;
    if (st.head != null && w > 0) {
      // (through a corner of his path, the way he goes over a fifth of a second either side, so he
      // leans round it, never a right angle in a frame, lab/pipeline/check-jolt.mjs)
      let hd = st.head;
      if (!glide) { const a = tr.at(Math.max(0, s - 0.1)), b = tr.at(s + 0.1); if (Math.hypot(b.x - a.x, b.y - a.y) > 1) hd = heading(a, b); }
      yaw = faceYaw + angDiff(faceYaw, hd) * w;
    }
    // getting down to the ball he took eases out after it over a third of a second, never popping up the
    // frame after the ball is in (check-jolt.mjs); first, so what the fit added goes on top as it did
    if (!take) {
      const tk = takes.filter((x) => x.t <= s - 1e-6 && s < x.t + 0.35).pop();
      const c = tk && this.carriedFit(n, f, tk.key, tk.t);
      if (c && c.z != null && c.z < 3.2) {
        const post = 1 - ramp(s, tk.t, tk.t + 0.35);
        spec.crouch = Math.max(spec.crouch || 0, Math.min(1, (3.4 - c.z) / 2.6) * post);
        const dip = c.z < 1 ? bump(s, tk.t - 0.18, tk.t - 0.05, tk.t + 0.03, tk.t + 0.15) : 0;
        spec.settle = Math.max(spec.settle || 0, post * (1 - moving + moving * dip));
        if (c.z < 1) spec.bend = Math.max(spec.bend || 0, post * moving);
      }
    }
    // where he stands: his track, and what the fit did at every ball he has taken. That stays with him:
    // the move until he runs on (it goes as his own run takes him, never a slide where he stands), the
    // hop landing, the crouch easing. Dropped, it was a jump of up to nine feet (check-jolt.mjs).
    let at = { x: st.x, y: st.y };
    for (const tk of takes) {
      if (tk.t > s - 1e-6) continue;
      const c = this.carriedFit(n, f, tk.key, tk.t);
      if (!c) continue;
      const kd = Math.exp(-Math.max(0, st.run - c.run) / 4), kp = 1 - ramp(s, tk.t, tk.t + 0.4);
      at = { x: at.x + c.dx * kd, y: at.y + c.dy * kd };
      lift = Math.max(lift, c.lift * (1 - ramp(s, tk.t, tk.t + 0.3)));
      spec.lean = (spec.lean || 0) + c.dLean * kp; spec.crouch = (spec.crouch || 0) + c.dCrouch * kp; spec.wide = Math.max(spec.wide || 0, c.wide * kp);
    }
    const base0 = { ...at }, lean0 = spec.lean || 0, crouch0 = spec.crouch || 0;
    spec.glove = glove; spec.gloveW = gloveW; spec.hand = hand; spec.handW = handW; spec.dive = dive;
    if (!probe) {
      // the ball he is about to take: the fit solved at that moment (where his body has to be for the
      // glove to be on it), come in by the take's weight on top of his own run. Solved here and now
      // instead, it dragged him to the ball well ahead of his legs and he slid there (check-jolt.mjs).
      if (take && takeW > 0) {
        const c = this.carriedFit(n, f, take.key, take.t);
        if (c) {
          at = { x: at.x + c.dx * takeW, y: at.y + c.dy * takeW };
          lift = Math.max(lift, c.lift * takeW);
          spec.lean = (spec.lean || 0) + c.dLean * takeW; spec.crouch = (spec.crouch || 0) + c.dCrouch * takeW; spec.wide = Math.max(spec.wide || 0, c.wide * takeW);
        }
      }
      // the tag's lunge is a step, never a slide. The fit moves his body to the runner between the catch and
      // the tag (a bang bang tag gives it a tenth of a second); with both feet on the dirt they went with it,
      // planted and sliding (check-jolt.mjs). So the foot away from the runner stays where it stood until the
      // tag is down and then comes up under him, and the other steps out toward the runner, off the dirt.
      const tagTk = dive ? null : takes.find((x) => x.key.kind === 'tag' && s > x.key.t + 1e-6 && s < x.t + 0.5);
      const cT = tagTk && this.carriedFit(n, f, tagTk.key, tagTk.t);
      if (cT && cT.yaw != null && Math.hypot(cT.dx, cT.dy) > 0.05) {
        const t0 = tagTk.key.t, t1 = tagTk.t;
        // (how much of the fit's move he has made now: the take's weight up to the tag, all of it after)
        const k = take && take.key === tagTk.key ? takeW : s > t1 ? Math.exp(-Math.max(0, st.run - cT.run) / 4) : 0;
        const p = ramp(s, t0, t1), q = ramp(s, t1 + 0.15, t1 + 0.4);
        const lead = -cT.dx * Math.cos(cT.yaw) + cT.dy * Math.sin(cT.yaw) >= 0 ? 'l' : 'r', trail = lead === 'l' ? 'r' : 'l';
        const kl = smooth(p) - k, kt = -k * (1 - smooth(q));
        spec.plant = {
          w: 1 - moving,
          [lead]: { x: cT.dx * kl, y: cT.dy * kl, z: 0.35 * Math.sin(Math.PI * p) },
          [trail]: { x: cT.dx * kt, y: cT.dy * kt, z: 0.3 * Math.sin(Math.PI * q) },
        };
      }
      f.place(at.x, at.y, yaw, { lift });
      f.pose(spec);
      // a force with the ball already in his hand (he steps on the bag himself): the foot to the bag
      const fs = acts.find((x) => x.kind === 'step' && x.force && x.base && s > x.t - 0.6 && s < x.t + 0.35);
      if (fs) this.pinFoot(f, fs, s, at, yaw, lift, spec, null, 0);
      return null;
    }
    // ---- the solve, at the moment he takes the ball (carriedFit): the glove on it
    f.place(at.x, at.y, yaw, { lift });
    f.pose(spec);
    // a fielder stands a step back of the ball he catches, so the glove takes it in front of him
    const reachBack = (take && f.reaching && glove && gloveW > 0 && !dive) ? gloveW : 0;
    if (reachBack > 0) at = { x: at.x - Math.sin(yaw) * 1.1 * reachBack, y: at.y - Math.cos(yaw) * 1.1 * reachBack };
    // catchFit: the glove on the ball. The plan puts his body where the ball comes down, and his arm
    // cannot always reach from there (the owner, 2026-10-22: a pop fly came down beside the outfielder
    // who caught it). So his body is moved by what the glove still misses, posed again (the arm then
    // reaches from the new spot) and once more: at the catch the pocket is on the ball
    // (lab/pipeline/check-catch.mjs holds it under 0.15 m).
    // A ball above what his arm reaches from there (the arm straight, the glove under it): he steps
    // in under it, his shoulder near enough that the arm reaches it.
    // a ground ball: he fields it out in front of him, a long arm's reach ahead of his feet (the
    // glove on the grass, his back flat), not curled over a ball under his own body
    let wide = 0;
    if (take && takeW > 0 && take.z < 1 && !dive) {
      const D = 1.9, fx = take.x - Math.sin(yaw) * D, fy = take.y - Math.cos(yaw) * D;
      at = { x: at.x + (fx - at.x) * takeW, y: at.y + (fy - at.y) * takeW };
      spec.crouch = Math.max(spec.crouch, 0.9 * takeW); spec.lean = Math.max(spec.lean, 0.95 * takeW); spec.wide = Math.max(spec.wide || 0, 0.9 * takeW);
      wide = 0.9 * takeW;
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
    if (fa) at = this.pinFoot(f, fa, s, at, yaw, lift, spec, take, takeW);
    return { dx: at.x - base0.x, dy: at.y - base0.y, lift, dLean: (spec.lean || 0) - lean0, dCrouch: (spec.crouch || 0) - crouch0, wide, run: st.run, z: take ? take.z : null, yaw };
  }

  /** A force at a bag: the nearer foot onto the bag's middle (the glove kept on a ball he is taking),
      the body moved by what it misses; returns where he stands. */
  pinFoot(f, fa, s, at, yaw, lift, spec, take, takeW) {
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
    return at;
  }

  /** The way a body at p turns to the ball: toward where it has been over the last half second, not
      where it is this instant (his eyes are on it at once, his body comes round after: a hit past the
      mound spun the pitcher half round in a tenth of a second, check-jolt.mjs). */
  faceTrail(p, s) {
    const plan = this.active.plan;
    let x = 0, y = 0;
    for (const d of [0.1, 0.2, 0.3, 0.4, 0.5]) {
      const q = plan.ballAt(Math.max(0, s - d)), a = faceToward(p, q);
      x += Math.sin(a); y += Math.cos(a);
    }
    return Math.hypot(x, y) > 1e-6 ? Math.atan2(x, y) : faceToward(p, plan.ballAt(s));
  }

  /** What the fit does to fielder n's body at the moment t he takes a ball (an act, or a throw in with
      no act of its own; posed then, once, and kept on it): his move off his track, a hop, the extra
      crouch, lean and stance. */
  carriedFit(n, f, key, t) {
    // (by fielder and moment: one tag act takes the throw at one moment and makes the tag at another)
    const memo = '_fit' + n + '@' + t.toFixed(4);
    if (key[memo] !== undefined) return key[memo];
    key[memo] = null;
    // (solved with the runners where they are at that moment, whichever frame asks first: a tag goes
    // on the runner as he is drawn then; the runners are put back as they were after)
    const plan = this.active.plan, b = plan.ballAt(t);
    const was = plan.runners.map((r) => r.fig ? { vis: r.fig.root.visible, at: r.fig.posedAt } : null);
    for (const r of plan.runners) if (r.fig) this.poseRunner(r, t, b);
    key[memo] = this.poseFielder(n, f, t, b, true);
    plan.runners.forEach((r, i) => {
      if (!r.fig) return;
      if (was[i].vis && was[i].at != null) this.poseRunner(r, was[i].at, plan.ballAt(was[i].at)); else r.fig.root.visible = false;
    });
    return key[memo];
  }

  /* ---------------------------------------------------------------- the runners */

  poseRunner(r, s, ball) {
    const f = r.fig, tr = r.track;
    let ss = s;
    if (tr.stopAt != null && s > tr.stopAt) ss = tr.stopAt + 0.3 * (1 - Math.exp(-(s - tr.stopAt) / 0.3));
    const st = tr.at(ss);
    let x = st.x, y = st.y, spd = ss === s ? st.spd : st.spd * Math.exp(-(s - tr.stopAt) / 0.3), head = st.head, run = st.run;
    // (his heading through a corner of his path, rounding a base: the way he goes over a fifth of a
    // second either side, so he leans round it. The leg's own heading turned him a right angle in one
    // frame, lab/pipeline/check-jolt.mjs)
    if (head != null && spd > 3) {
      const a = tr.at(Math.max(0, ss - 0.1)), b = tr.at(ss + 0.1);
      if (Math.hypot(b.x - a.x, b.y - a.y) > 1) head = heading(a, b);
    }
    // a run that ends at full speed (through first base) carries him on and slows over a few strides,
    // never a dead stop in a frame (check-jolt.mjs)
    if (tr.legs.length && ss === s && s > tr.free && !(r.scoreAt != null && s > r.scoreAt)) {
      const e = tr.at(tr.free - 1e-3);
      if (e.spd > 4 && e.head != null) {
        const k = s - tr.free, tau = 0.6, d = e.spd * tau * (1 - Math.exp(-k / tau));
        x += Math.sin(e.head) * d; y += Math.cos(e.head) * d;
        spd = e.spd * Math.exp(-k / tau); head = e.head; run = st.run + d;
      }
    }
    // out: he walks off toward his dugout (the third base side)
    const off = r.out ? Math.max(r.arrive ?? 0, r.outAt ?? 0) + 0.7 : null;
    let walk = 0;
    if (off != null && s > off) {
      const k = s - off, to = { x: -95, y: 25 }, d0 = heading(st, to);
      const dist = 4.5 * Math.max(0, k - 0.25) * Math.min(1, k / 0.6);
      x += Math.sin(d0) * dist; y += Math.cos(d0) * dist;
      spd = 4.5 * Math.min(1, k / 0.6); head = d0; run = st.run + dist; walk = 1;
    }
    // scored: he carries on through the plate from where he crossed it, at the speed he crossed it,
    // slows and bends off toward his dugout (it once started from the end of his track, a few feet on,
    // and at a third of his speed: a jump at the plate, lab/pipeline/check-jolt.mjs)
    if (r.scoreAt != null && s > r.scoreAt && !walk) {
      // (his speed there carries on and fades; a jog of 6 ft/s builds under it)
      const k = s - r.scoreAt, p0 = r.track.at(r.scoreAt), v0 = p0.spd || 0, tau = 0.9, J = 6, tj = 0.6;
      const d0 = heading(BASE[3], BASE[4]) - 0.5, h0 = p0.head ?? d0;
      const dir = h0 + angDiff(h0, d0) * smooth(Math.min(1, k / 0.8));
      const dist = v0 * tau * (1 - Math.exp(-k / tau)) + J * (k - tj * (1 - Math.exp(-k / tj)));
      x = p0.x + Math.sin(dir) * dist; y = p0.y + Math.cos(dir) * dist;
      spd = v0 * Math.exp(-k / tau) + J * (1 - Math.exp(-k / tj)); head = dir; run = p0.run + dist;
    }
    const lead = s < 0.25 && r.from >= 1;
    const ph = this.crew.clips ? r.phase.at(ss) + 2 * Math.PI * (run - st.run) / this.crew.clips.jog.strideFt : 2 * Math.PI * run / CYCLE.runner + r.from;
    const spec = { idleT: s + r.from * 1.1, run: { phase: ph, trot: this.active.plan.kind === 'hr', amp: walk ? 0.22 : clamp(spd / 26, 0, 1.1) }, crouch: lead ? 0.3 : 0, wide: lead ? 0.6 : 0, lean: walk ? 0.1 : 0, look: { x: ball.x, y: ball.y, z: ball.z } };
    // the slide: feet first over his last few strides, down a beat, then up
    if (r.slide != null) {
      const t = r.slide, k = bump(s, t - 0.5, t - 0.28, t + 0.55, t + 1.0);
      if (k > 0) { spec.slide = k; spec.run.amp *= 1 - k; }
    }
    // (his run's heading at speed, the ball as he slows to a stop: blended by speed, so pulling up on a
    // bag with the ball behind him he turns to it, never a half turn in one frame)
    const toBall = this.faceTrail({ x, y }, s);
    let yaw = toBall;
    if (head != null) {
      // (the ball straight behind him, half a turn from his run: the turn goes the way he is already
      // turning, the last way he faced, never one way in a frame and the other in the next, a half
      // turn back and forth at a bag with the ball behind him, lab/pipeline/check-jolt.mjs)
      let d = angDiff(toBall, head);
      const w = smooth((spd - 0.5) / 4);
      if (r.faceYaw != null && Math.abs(d) > 2.6) {
        const alt = d - Math.sign(d) * 2 * Math.PI;
        if (Math.abs(angDiff(r.faceYaw, toBall + alt * w)) < Math.abs(angDiff(r.faceYaw, toBall + d * w))) d = alt;
      }
      yaw = toBall + d * w;
    }
    if (spec.slide > 0 && r.slide != null) { const dir = heading(r.track.at(r.slide - 0.6), r.track.at(r.slide)); yaw = yaw + angDiff(yaw, dir) * spec.slide; }
    if (lead) yaw = heading({ x, y }, BASE[Math.min(4, r.from + 1)]) - Math.PI / 2 * (r.from === 2 ? 0.5 : 1);
    r.faceYaw = yaw;
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

  /** The camera of a piece of the cut at plan time s: its shot's eased move (shot, track), read at the
      shot's own real time. */
  cameraAt(piece, s, aspect) {
    const tk = this.shot(piece, aspect);
    if (!tk) return this.rawCam(piece.cam, s, aspect);
    // the shot's own clock: real seconds since it began (the slow motion beat runs slower through it)
    const r = clamp(realAt(this.active.plan.edit, s) - tk.r0, 0, tk.dur);
    // (between its samples a cubic through four of them: straight lines between would change speed at
    // every sample, a tremor at 60 frames a second)
    const u = r / TRACK_DT, i = Math.min(tk.n - 2, Math.floor(u)), f = clamp(u - i, 0, 1);
    const a = Math.max(0, i - 1), d = Math.min(tk.n - 1, i + 2);
    const cr = (p0, p1, p2, p3) => p1 + 0.5 * f * (p2 - p0 + f * (2 * p0 - 5 * p1 + 4 * p2 - p3 + f * (3 * (p1 - p2) + p3 - p0)));
    const V3 = (A) => ({ x: cr(A[a].x, A[i].x, A[i + 1].x, A[d].x), y: cr(A[a].y, A[i].y, A[i + 1].y, A[d].y), z: cr(A[a].z, A[i].z, A[i + 1].z, A[d].z) });
    const fov = cr(tk.fov[a], tk.fov[i], tk.fov[i + 1], tk.fov[d]);
    return { pos: V3(tk.pos), look: V3(tk.look), fov: clamp(fov, 4, 72) };
  }

  /** The shots' camera moves worked out ahead, one a call (stage.js calls it every frame from the
      throw to contact): each takes a few milliseconds, and the first frame of a shot that had to work
      its move out then was a hitch on a phone at every cut. */
  prepare(aspect) {
    const A = this.active;
    if (!A) return false;
    for (const pc of A.plan.edit) {
      if (pc.cam === 'pitcher') continue;
      const had = A.tracks && A.tracks.size;
      this.shot(pc, aspect);
      if ((A.tracks && A.tracks.size) !== had) return true;
    }
    return false;
  }

  /** The camera move of the shot a piece is in (made the first time it is asked for). */
  shot(piece, aspect) {
    // the wide camera's side, chosen once a shot (it never swaps mid shot): the side whose lens holds
    // the shot's middle moment narrower, first base side or third
    if (piece.cam === 'wide' && piece.side == null) {
      // (a shot split for its slow motion beat keeps one side: the run of wide pieces decides together)
      const ed = this.active.plan.edit;
      let i0 = ed.indexOf(piece), i1 = i0;
      while (i0 > 0 && ed[i0 - 1].cam === 'wide' && Math.abs(ed[i0 - 1].s1 - ed[i0].s0) < 1e-6) i0--;
      while (i1 >= 0 && i1 < ed.length - 1 && ed[i1 + 1].cam === 'wide' && Math.abs(ed[i1 + 1].s0 - ed[i1].s1) < 1e-6) i1++;
      const q0 = i0 >= 0 ? ed[i0].s0 : piece.s0, q1 = i0 >= 0 ? ed[i1].s1 : piece.s1, mid = (q0 + q1) / 2;
      // (the widest lens each side needs across the whole shot, not only its middle: a throw late in
      // it, which the shot must hold, can need the other side)
      // (a crane that must climb to hold it all counts against its side: its lens is at the cap)
      // (and the broadcast's room counts: a crane right by the bag must open wide to show its 45 ft)
      // (and how far it must turn across the shot: a camera that stands still pans to what it cannot hold,
      // and the side that turns least is the steadier shot)
      const widest = (sd) => {
        this.wideSide = sd; let m = 0; const dirs = [];
        for (const f of [0, 0.1, 0.3, 0.5, 0.7, 0.9, 1]) {
          const c = this.rawCam('wide', q0 + (q1 - q0) * f, aspect), d = Math.hypot(c.look.x - c.pos.x, c.look.y - c.pos.y, c.look.z - c.pos.z) || 1;
          dirs.push({ x: (c.look.x - c.pos.x) / d, y: (c.look.y - c.pos.y) / d, z: (c.look.z - c.pos.z) / d });
          const room = 2 * Math.atan(ROOM_FT / 2 / Math.max(1, d)) / D2R;
          m = Math.max(m, Math.max(c.fov, Math.min(62, room)) + Math.max(0, c.pos.z - HIGH_BASE.z));
        }
        let turn = 0;
        for (const a of dirs) for (const b of dirs) turn = Math.max(turn, Math.acos(clamp(a.x * b.x + a.y * b.y + a.z * b.z, -1, 1)) / D2R);
        return m + turn;
      };
      const a = widest(-1), b = widest(1);
      this.wideSide = null;
      const def = this.rawCam('wide', mid, aspect).pos.x > 0 ? 1 : -1;
      piece.side = Math.abs(a - b) < 4 ? def : a < b ? -1 : 1;
      // (a shot that holds a throw to first or third is seen from that base's side, down the throw, the
      // stands behind the camera: from across the field that stand is the whole back of the frame)
      const s0 = ed[Math.max(0, i0)].s0, s1 = ed[Math.max(0, i1)].s1;
      const th = this.active.plan.segs.filter((sg) => sg.kind === 'throw' && sg.t1 > s0 && sg.t0 < s1 && Math.abs(sg.b.x) > 30).pop();
      // (unless that side cannot hold the shot nearly as well: a throw from deep left to third with the
      // hitter at first is the whole infield and the left field corner from the third base side)
      if (th && (Math.sign(th.b.x) > 0 ? b : a) <= Math.min(a, b) + 10) piece.side = Math.sign(th.b.x);
      if (i0 >= 0) for (let i = i0; i <= i1; i++) ed[i].side = piece.side;
    }
    this.wideSide = piece.cam === 'wide' ? piece.side : null;
    // (one shot is the whole run of pieces of its camera that follow straight on, split or not for the
    // slow motion beat: it is one move of the camera across where they meet, or the seam is a jump)
    const ed = this.active.plan.edit;
    let j0 = ed.indexOf(piece), j1 = j0;
    if (j0 < 0) return null;
    while (j0 > 0 && ed[j0 - 1].cam === piece.cam && Math.abs(ed[j0 - 1].s1 - ed[j0].s0) < 1e-6) j0--;
    while (j1 < ed.length - 1 && ed[j1 + 1].cam === piece.cam && Math.abs(ed[j1 + 1].s0 - ed[j1].s1) < 1e-6) j1++;
    const key = j0 + ':' + aspect.toFixed(4);
    const tracks = this.active.tracks || (this.active.tracks = new Map());
    let tk = tracks.get(key);
    if (!tk) {
      // (eased as little as keeps it from whipping: a shot whose look would turn faster than PAN_MAX
      // degrees a frame at 60 frames a second, change its turn sharper than KICK_MAX, or whose zoom would
      // change speed sharper than ZOOM_MAX, is eased again, longer, the lens holding what it must)
      // (and one that cannot hold a ball it must, eased that long, tries it quicker)
      const bad = (t) => t.short * 100 + t.miss * 100 + Math.max(0, t.pan - PAN_MAX) * 400 + Math.max(0, t.kick - KICK_MAX) * 400 + Math.max(0, t.zoom - ZOOM_MAX) * 100;
      const search = () => {
        let best = null;
        for (const k of [1, 1.4, 2, 3, 4.5, 6.5, 0.6]) {
          const t = this.track(ed, j0, j1, aspect, k);
          if (!best || bad(t) < bad(best)) best = t;
          if (bad(t) === 0) break;
        }
        return best;
      };
      tk = search();
      // (a high base camera that cannot hold its shot's moments from its side tries the other side whole)
      if (piece.cam === 'wide' && tk.miss > 0) {
        this.wideSide = -piece.side;
        const other = search();
        if (bad(other) < bad(tk)) { tk = other; for (let i = j0; i <= j1; i++) ed[i].side = -piece.side; }
        this.wideSide = piece.side;
      }
      tracks.set(key, tk);
    }
    return tk;
  }

  /** One shot's camera move, worked out once before it comes up (the plan is known whole, so the move
      is too; stage.js asks for them while the pitch is in the air, prepare): the director's camera
      (rawCam) every TRACK_DT of real time, then eased the way a camera operator moves, a smoothing that
      looks as far ahead as behind (no lag on the ball). The lens is worked out after, from where the
      eased camera stands and looks: the director's lens, eased, opened wherever that would leave out
      what the shot must hold (the deciding moment near now, the ball in a shot on the ball, a throw
      arriving at the shot's own bag), from the widest shortfall within reach, so it opens before it is
      needed and closes after. slow stretches every easing (shot: a shot that would whip). Returns the
      move and its fastest turn (pan), its sharpest zoom (zoom) and how many samples it could not hold
      a ball it had to (short). */
  track(ed, j0, j1, aspect, slow = 1) {
    const cam = ed[j0].cam, plan = this.active.plan;
    const r0 = realAt(ed, ed[j0].s0);
    let dur = 0;
    for (let j = j0; j <= j1; j++) dur += (ed[j].s1 - ed[j].s0) / ed[j].rate;
    const n = Math.max(2, Math.ceil(dur / TRACK_DT) + 1);
    // scene time at real time r into the shot
    const sAt = (r) => {
      let acc = 0;
      for (let j = j0; j <= j1; j++) { const d = (ed[j].s1 - ed[j].s0) / ed[j].rate; if (r <= acc + d || j === j1) return Math.min(ed[j].s1, ed[j].s0 + (r - acc) * ed[j].rate); acc += d; }
      return ed[j1].s1;
    };
    // (a plate shot with a throw home in it is seen from high behind the plate, all of it, a little to
    // the side away from where the throw comes from, so the plate and the throw are one look)
    const thP = cam === 'plate' && plan.segs.find((sg) => sg.kind === 'throw' && sg.t1 > ed[j0].s0 && sg.t0 < ed[j1].s1 && Math.hypot(sg.b.x, sg.b.y) < 12);
    this.plateHigh = thP ? (thP.a.x > 0 ? -1 : 1) : 0;
    // (and one with a runner's moment at another bag in it, the hitter safe at first as a run scores: the
    // low camera by first base has that bag beside it, out of its frame; from high behind the plate both are in)
    if (cam === 'plate' && !this.plateHigh) {
      const s0 = ed[j0].s0 - 0.85, s1 = ed[j1].s1 + 0.45;
      const other = plan.runners.some((r) => { const tq = r.out ? r.outAt : r.scoreAt != null ? r.scoreAt : r.from !== r.to ? r.arrive : null; const b = r.out ? r.outBase : r.to; return tq != null && tq >= s0 && tq <= s1 && b >= 1 && b <= 3; });
      if (other) this.plateHigh = -1;
    }
    // every camera is running all along, the cut only picks one: the move is worked out from a little
    // before the shot to a little after (as far as the smoothing reaches), so a shot opens on a camera
    // already in its move, not one jolted into it
    // (a broadcast camera turns and zooms; it hardly travels: its place drifts over POS_EASE_S while its
    // look follows the play over EASE_S)
    const sig = slow * (EASE_S[cam] || 0.25) / TRACK_DT, psig = slow * (POS_EASE_S[cam] || 0.3) / TRACK_DT, P = Math.ceil(2.5 * Math.max(sig, psig));
    const sOf = (i) => (i < 0 ? Math.max(0, ed[j0].s0 + i * TRACK_DT * ed[j0].rate) : i >= n ? ed[j1].s1 + (i - n + 1) * TRACK_DT * ed[j1].rate : sAt(Math.min(dur, i * TRACK_DT)));
    const all = [];
    // (the bag each moment of the shot is about, for its throws: the piece's deciding moment)
    const bagAt = (s) => { let pc = ed[j0]; for (let j = j0; j <= j1; j++) if (s >= ed[j].s0 - 1e-6) pc = ed[j]; return bagOf(plan, pc.m); };
    // (a throw that leaves after this shot is over is none of its business, nor a moment before it began)
    this.shotEnd = ed[j1].s1; this.shotStart = ed[j0].s0;
    // (a broadcast camera is framed before the director takes it and settles before he leaves it: the
    // move is the shot's own, at rest at either end, never a pan the cut lands in the middle of)
    for (let i = -P; i < n + P; i++) {
      const s = sOf(clamp(i, 0, n - 1)), bag = bagAt(s);
      this.shotBag = bag;
      const c = this.rawCam(cam, s, aspect);
      all.push({ s, pos: c.pos, look: c.look, fov: c.fov, pts: c.pts, keys: (this.lastKeys || []).slice(), bag, margin: c.margin || 1.25, minFov: c.minFov || 12 });
    }
    this.shotBag = null; this.shotEnd = null; this.shotStart = null;
    const raw = all.slice(P, P + n).map((x) => {
      // what the eased shot must hold: the deciding moments near now (the director's keys, as the old
      // camera held them), and the ball in flight in a shot on the ball; the rest of what the director
      // framed is the lens it eases from, not a promise
      const b = plan.ballAt(x.s), must = x.keys.slice();
      // the ball in flight is always in a shot on the ball; in a runner's shot (cut to him on purpose, the
      // ball may roll or fly on elsewhere) a throw is, for the last of its flight, as it arrives (not one
      // behind the camera)
      // (and where it is half a sample either side: a thrown ball covers ground between samples)
      const near = (ds) => { const q = plan.ballAt(x.s + ds); return q.by || q.gone ? null : { x: q.x, y: q.y, z: q.z }; };
      const bAll = !b.by && !b.gone ? [{ x: b.x, y: b.y, z: b.z }, near(-TRACK_DT / 2), near(TRACK_DT / 2)].filter(Boolean).map((q) => ({ ...q, ball: true })) : [];
      if (bAll.length && (cam === 'follow' || cam === 'sky' || cam === 'track')) must.push(...bAll);
      return { ...x, must, b, bAll };
    });
    const posAll = gauss(all.map((x) => x.pos), psig);
    const pos = posAll.slice(P, P + n);
    const look = gauss(all.map((x) => x.look), sig).slice(P, P + n);
    // the lens: the director's own, eased; then wherever the eased camera would leave out something it
    // must hold (inside the frame, with HOLD_MARGIN), the shortfall eased back in, from the widest
    // shortfall within reach so it opens before it is needed and closes after (never under it). And
    // the broadcast's room: at least ROOM_FT of field where it looks (the owner, 2026-10-24: "it
    // doesn't need to be super zoomed in"), never past 62 degrees for it.
    // (a lens moves as the eye reads a zoom, by how much bigger or smaller things get: it is eased on the
    // log of its width, so a zoom from 16 degrees to 32 takes as long as one from 36 to 72)
    const fsig = slow * (FOV_EASE_S[cam] || 0.1) / TRACK_DT, R = Math.max(1, Math.ceil(3 * fsig));
    const lw = (f) => Math.log(Math.tan(f * D2R / 2)), fw = (l) => 2 * Math.atan(Math.exp(l)) / D2R;
    const ease = (a) => gauss(a.map((_, i) => { let m = -Infinity; for (let j = Math.max(0, i - R); j <= Math.min(n - 1, i + R); j++) m = Math.max(m, a[j]); return { x: m, y: 0, z: 0 }; }), fsig, R).map((v) => v.x);
    const needOf = () => raw.map((x, i) => {
      // (not one behind the camera, nor one passing within a few strides of the lens: no lens holds that)
      const m = x.must.filter((p) => ((p.x - pos[i].x) * (look[i].x - pos[i].x) + (p.y - pos[i].y) * (look[i].y - pos[i].y) + (p.z - pos[i].z) * (look[i].z - pos[i].z)) > 1 &&
        Math.hypot(p.x - pos[i].x, p.y - pos[i].y, p.z - pos[i].z) > 20);
      const dLook = Math.hypot(look[i].x - pos[i].x, look[i].y - pos[i].y, look[i].z - pos[i].z);
      const room = Math.min(62, 2 * Math.atan(roomOf(cam) / 2 / Math.max(1, dLook)) / D2R);
      // (the ball, fast and small, with a wider margin: between two samples it covers ground)
      const mb = m.filter((p) => p.ball), mk = m.filter((p) => !p.ball);
      const nv = clamp(Math.max(lensFor(pos[i], look[i], mk, aspect, HOLD_MARGIN, 4), mb.length ? lensFor(pos[i], look[i], mb, aspect, BALL_MARGIN, 4) : 0, room), 4, 72);
      return nv;
    });
    // (the director's lens, worked out again from where the eased camera actually is: a raw camera that
    // jumps closer and back would otherwise leave the eased one, between, with a lens for elsewhere)
    const lensRaw = all.map((x, i) => (x.pts && x.pts.length ? Math.min(Math.max(x.fov, 72), lensFor(posAll[i], x.look, x.pts, aspect, x.margin * LENS_SCALE, x.minFov)) : x.fov));
    // (and the broadcast's room is the director's too: the lens it eases from never zooms in past it)
    const roomAll = all.map((x, i) => { const p0 = posAll[i]; return Math.min(62, 2 * Math.atan(roomOf(cam) / 2 / Math.max(1, Math.hypot(x.look.x - p0.x, x.look.y - p0.y, x.look.z - p0.z))) / D2R); });
    let fov = gauss(lensRaw.map((f, i) => ({ x: lw(clamp(Math.max(f, roomAll[i]), 4, 80)), y: 0, z: 0 })), slow * (RAWFOV_S[cam] || 0.1) / TRACK_DT).slice(P, P + n).map((v) => fw(v.x));
    // the slow motion beat pushes in a tenth, easing in and out over PUSH_S of real time either side
    const sl = ed.find((x, j) => j >= j0 && j <= j1 && x.rate < 1);
    if (sl) {
      const ra = realAt(ed, sl.s0) - r0, rb = realAt(ed, sl.s1) - r0;
      fov = fov.map((v, i) => { const rr = i * TRACK_DT; return v * (1 - 0.1 * smooth((rr - (ra - PUSH_S)) / PUSH_S) * smooth((rb + PUSH_S - rr) / PUSH_S)); });
    }
    const base = fov;
    const hold = (need) => { const back = ease(base.map((v, i) => Math.max(0, lw(need[i]) - lw(v)))); return base.map((v, i) => fw(lw(v) + back[i])); };
    fov = hold(needOf());
    // and a throw to the bag this shot is about (bagOf: the out, the run, the runner safe there) is seen
    // arriving, the last ARRIVE_S of its flight
    let more = false;
    raw.forEach((x, i) => {
      const th = this.throwIn(x.s), bg = x.bag;
      if (th && !x.b.by && bg && Math.hypot(th.b.x - bg.x, th.b.y - bg.y) < 20) { x.must.push(...x.bAll); more = true; }
    });
    let short = 0;
    let ndF = null;
    if (more) { const nd = needOf(); fov = hold(nd); short = raw.filter((x, i) => nd[i] >= 71.9 && x.must.some((q) => q.ball)).length; ndF = nd; }
    // (its fastest turn, a frame at 60 frames a second, from sample to sample, and its sharpest change of
    // turn away from the shot's first and last tenth of a second)
    let pan = 0, kick = 0;
    const dirs = look.map((l, i) => { const d = { x: l.x - pos[i].x, y: l.y - pos[i].y, z: l.z - pos[i].z }, m = Math.hypot(d.x, d.y, d.z) || 1; return { x: d.x / m, y: d.y / m, z: d.z / m }; });
    for (let i = 2; i < n - 2; i++) kick = Math.max(kick, Math.hypot(dirs[i + 1].x - 2 * dirs[i].x + dirs[i - 1].x, dirs[i + 1].y - 2 * dirs[i].y + dirs[i - 1].y, dirs[i + 1].z - 2 * dirs[i].z + dirs[i - 1].z) / D2R * ((1 / 60) / TRACK_DT) ** 2);
    for (let i = 1; i < n; i++) {
      const a = { x: look[i].x - pos[i].x, y: look[i].y - pos[i].y, z: look[i].z - pos[i].z }, b = { x: look[i - 1].x - pos[i - 1].x, y: look[i - 1].y - pos[i - 1].y, z: look[i - 1].z - pos[i - 1].z };
      const c = (a.x * b.x + a.y * b.y + a.z * b.z) / (Math.hypot(a.x, a.y, a.z) * Math.hypot(b.x, b.y, b.z) || 1);
      pan = Math.max(pan, Math.acos(clamp(c, -1, 1)) / D2R * (1 / 60) / TRACK_DT);
    }
    // (the widest lens is reached softly, never a hard stop: a knee from KNEE degrees to 72)
    fov = fov.map((f) => (f > KNEE ? KNEE + (72 - KNEE) * Math.tanh((f - KNEE) / (72 - KNEE)) : Math.max(4, f)));
    // (and the samples whose lens, past the knee, no longer holds what it must: an ease that slow is too slow)
    const ndM = ndF || needOf();
    const miss = ndM.reduce((m, v, i) => m + (v > fov[i] + 0.5 ? 1 : 0), 0);
    // (and its sharpest change of zoom, on the log of the lens's width, a frame at 60 frames a second)
    let zoom = 0;
    const lt = fov.map((f) => Math.log(Math.tan(f * D2R / 2)));
    for (let i = 1; i < n - 1; i++) zoom = Math.max(zoom, Math.abs(lt[i + 1] - 2 * lt[i] + lt[i - 1]) * ((1 / 60) / TRACK_DT) ** 2);
    return { r0, dur, n, pos, look, fov, pan, kick, zoom, short, miss };
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
    // (sliding out from about its release, and in again for its last half second, by a weight: on and
    // off it was a jump of the camera)
    if (fp) {
      let wF = 1;
      for (const sg of plan.segs) if (sg.kind === 'throw' && sg.to === by && Math.hypot(sg.b.x - sg.a.x, sg.b.y - sg.a.y) > 70 && s > sg.t0 - 0.3 && s < sg.t1) {
        wF = Math.min(wF, 1 - clamp((s - (sg.t0 - 0.2)) / 0.3, 0, 1) + clamp((s - (sg.t1 - 0.6)) / 0.3, 0, 1));
      }
      wF = clamp(wF, 0, 1);
      if (wF > 0) pts.push({ x: ball.x + (fp.x - ball.x) * wF, y: ball.y + (fp.y - ball.y) * wF, z: 0 }, { x: ball.x + (fp.x - ball.x) * wF, y: ball.y + (fp.y - ball.y) * wF, z: 6.5 * wF + (ball.z || 0) * (1 - wF) });
    }
    // the play's deciding moments near now (an out, a run, a runner pulling into his base safe): the
    // runner and his bag are in the shot from a little before until just after
    // (each comes in over half a second, its runner and bag sliding out from the ball to where they are,
    // and goes again over 0.3 s from 0.45 s after, when its own shot is over: the shot widens and narrows with no step, never a pop)
    const keys = [], keyRaw = [], far = { x: 0, y: 0, w: 0, n: 0 };
    const FO = 0.3;
    const fade = (tq) => clamp((s - (tq - 0.85)) / 0.5, 0, 1) * clamp((tq + 0.45 + FO - s) / FO, 0, 1);
    const near = (p, w) => ({ x: ball.x + (p.x - ball.x) * w, y: ball.y + (p.y - ball.y) * w, z: (ball.z || 0) + (p.z - (ball.z || 0)) * w });
    // (two at once at two bases: one camera cannot hold the diamond and still show a man. They go in a
    // fixed order, an out, a run, the hitter safe, then the rest, the earlier first; a run or a safe more
    // than 60 ft from one before it, and no later, takes only the weight that one leaves, so as one goes the next comes
    // in. An out always has its own: a double play's two are both seen)
    const groups = [];
    for (const r of plan.runners) {
      const tq = r.out ? r.outAt : r.scoreAt != null ? r.scoreAt : r.from !== r.to ? r.arrive : null;
      // (a moment shown before this shot began is the shot before's: it does not pull this one about)
      if (tq == null || s < tq - 0.85 || s > tq + 0.45 + FO || (this.shotStart != null && tq < this.shotStart - 0.05)) continue;
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
    if (lead && s > ca.s - 0.2 && s < ca.s + 1.55 && !(this.shotStart != null && ca.s + 0.3 < this.shotStart - 0.05)) for (const r of [lead]) {
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
      // a throw coming and in the air: its target in the frame, and its thrower as it leaves his hand,
      // each sliding in from the ball and out again by a weight (points that came and went on a frame
      // were jumps of the director's camera). A long one's target comes in only for the last of it:
      // the camera goes with the ball, the pivot stays tight until it goes.
      const rp = (a, b) => clamp((s - a) / (b - a), 0, 1);
      const slideF = (p, w) => ({ x: ball.x + (p.x - ball.x) * w, y: ball.y + (p.y - ball.y) * w, z: (ball.z || 0) + (p.z - (ball.z || 0)) * w });
      for (const sg of plan.segs) {
        if (sg.kind !== 'throw' || s < sg.t0 - 0.4 || s > sg.t1 + 0.6) continue;
        const long = Math.hypot(sg.b.x - sg.a.x, sg.b.y - sg.a.y) > 70;
        const wT = (long ? rp(sg.t1 - 0.55, sg.t1 - 0.3) : rp(sg.t0 - 0.35, sg.t0 - 0.1)) * (1 - rp(sg.t1, sg.t1 + 0.3));
        if (wT > 0) pts.push(slideF({ x: sg.b.x, y: sg.b.y, z: 0 }, wT), slideF({ x: sg.b.x, y: sg.b.y, z: 6 }, wT));
        const wA = rp(sg.t0 - 0.3, sg.t0 - 0.1) * (1 - rp(sg.t0 + 0.05, sg.t0 + 0.3));
        if (wA > 0) pts.push(slideF({ x: sg.a.x, y: sg.a.y, z: 0 }, wA));
      }
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
      // an infield play: the bags it throws to are in the frame from contact (a broadcast's high home holds
      // the fielder, the ball and the base together, so the throw is no pan), a runner's bag from a moment
      // before he gets there (in over 0.8 s), each out again over INF_FADE after
      for (const q of this.active.infield || []) {
        const w = (q.t0 == null ? 1 : clamp((s - q.t0) / 0.8, 0, 1)) * (1 - clamp((s - (q.t1 + 0.4)) / INF_FADE, 0, 1));
        if (w > 0) pts.push(slideF({ x: q.x, y: q.y, z: 0 }, w), slideF({ x: q.x, y: q.y, z: 6 }, w));
      }
      pts.push(...keys);
      if (keys.length) wBall = 0.3;
      // the high home camera: high behind the plate, where it stays. It turns and zooms; it never travels
      // (the camera on a wire that trailed the play at half its distance moved the whole park past the
      // lens on every fly ball)
      pos = { ...HIGH_HOME };
      // (a ball up over the backstop, behind the plate: the camera is further back still, so it stays
      // in front of the lens)
      const back = Math.min(...pts.map((p) => p.y)) - 60;
      if (back < pos.y) pos.y = back;
      return this.fit(pos, pts, wBall, aspect, keys.length ? 1.3 : 1.25, 12);
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
      // (not while a throw comes in to the bag this shot is about: the ball arriving is the shot then)
      let wBag = 0;
      const bag = this.shotBag;
      if (bag) for (const sg of plan.segs) if (sg.kind === 'throw' && sg.t0 < (this.shotEnd ?? Infinity) && Math.hypot(sg.b.x - bag.x, sg.b.y - bag.y) < 20) wBag = Math.max(wBag, ramp(sg.t0 - 0.5, sg.t0 - 0.2) * (1 - ramp(sg.t1 - 0.1, sg.t1 + 0.2)));
      const wa = far.n ? far.w * clamp((Math.hypot(ball.x - far.x, ball.y - far.y) - 40) / 30, 0, 1) * (1 - wBag) : 0;
      const held = pts.map((p) => ({ x: p.x + (far.x - p.x) * wa, y: p.y + (far.y - p.y) * wa, z: p.z * (1 - wa) }));
      // (a moment comes in from where this shot already is, not from the ball: drawn to a moment far
      // away, the ball is out of it, and a moment sliding in from there would jump in from off screen)
      const o = centre(held, 0.35);
      const wk = keyRaw.map((k) => ({ x: o.x + (k.p.x - o.x) * k.w, y: o.y + (k.p.y - o.y) * k.w, z: o.z + (k.p.z - o.z) * k.w }));
      const use = [...held, ...wk];
      this.lastKeys = wk;
      const w0 = keys.length ? 0.15 : 0.35, m0 = keys.length ? 1.4 : 1.25;
      const c = centre(use, w0);
      // the high first or third base camera: it stands where it stands, over the seats down the line, and
      // turns and zooms (it leaned in from the dugout before, a crane flying across the field mid shot).
      // A moment it cannot hold in a lens of 62 degrees: it climbs, by halves, rather than back into the seats
      const A = { x: sd * HIGH_BASE.x, y: HIGH_BASE.y }, E = { x: sd * 88, y: 28 };
      const at = (z) => {
        const u = clamp((z - HIGH_BASE.z) / 20, 0, 1), a = { x: A.x + (E.x - A.x) * u, y: A.y + (E.y - A.y) * u };
        return this.fit({ x: a.x, y: a.y, z }, use, w0, aspect, m0, 16);
      };
      let k = at(HIGH_BASE.z);
      if (k.fov > 62) {
        let lo = HIGH_BASE.z, hi = 140;
        for (let i = 0; i < 12; i++) { const mid = (lo + hi) / 2; if (at(mid).fov <= 62) hi = mid; else lo = mid; }
        k = at(hi);
      }
      return k;
    }
    if (cam === 'plate') {
      // low on the first base side, the plate and the runner coming home
      // (a throw in the air: it rises behind the plate, high, to see the ball come in as well as the
      // plate; low by first base the throw would come from behind it)
      // (decided once a shot, track: a camera does not fly across the field mid shot)
      const hs = this.plateHigh || 0;
      pos = hs ? { x: hs * 14, y: -72, z: 40 } : { ...LOW_FIRST };
      const home = plan.runners.filter((r) => r.to === 4 || (r.out && r.outBase === 4));
      pts.length = 0;
      pts.push({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 6 });
      const coming = [];
      for (const r of home) { const q = r.track.at(s); if (Math.hypot(q.x, q.y) < 70) coming.push({ x: q.x, y: q.y, z: 0 }, { x: q.x, y: q.y, z: 6 }); }
      pts.push(...coming);
      if (ball && Math.hypot(ball.x, ball.y) < 60) pts.push({ x: ball.x, y: ball.y, z: ball.z });
      // (from high behind the plate, third, first and second are in reach too)
      const near = keys.filter((k) => Math.hypot(k.x, k.y) < (hs ? 135 : 75));
      pts.push(...near);
      // (what it must hold: the runners coming in to the plate, and the moments in its reach; one at
      // first base is not this camera's)
      this.lastKeys = [...coming, ...near];
      return this.fit(pos, pts, 0.2, aspect, 1.4, 24);
    }
    return this.fit({ x: 0, y: -52, z: 36 }, pts, wBall, aspect, 1.35, 12);
  }

  /** The throw in its last ARRIVE_S of flight at s (and a little before), or null. */
  throwIn(s) {
    for (const sg of this.active.plan.segs) if (sg.kind === 'throw' && s >= sg.t1 - ARRIVE_S - 0.1 && s <= sg.t1) return sg;
    return null;
  }

  /** fit(), but a camera close enough to need a lens past 62 degrees backs away from what it holds until it fits. */
  backOff(pos, pts, wBall, aspect, margin, minFov) {
    const k = this.fit(pos, pts, wBall, aspect, margin, minFov);
    if (k.fov <= 62) return k;
    // (the least distance that does, found by halves: steps of a fixed size made the camera jump back
    // and in again as the lens it needed crossed 62)
    const c = k.look, at = (f) => this.fit({ x: c.x + (pos.x - c.x) * f, y: c.y + (pos.y - c.y) * f, z: c.z + (pos.z - c.z) * f }, pts, wBall, aspect, margin, minFov);
    let lo = 1, hi = 3.7;
    if (at(hi).fov > 62) return at(hi);
    for (let i = 0; i < 14; i++) { const mid = (lo + hi) / 2; if (at(mid).fov > 62) lo = mid; else hi = mid; }
    return at(hi);
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
    for (const o of this.netPoles || []) o.visible = true;
    this.renderer.shadowMap.autoUpdate = true;
    this.trail.visible = false;
    this.marker.visible = false;
    const pp = this.people;
    pp.batter.root.visible = true;
    pp.catcher.root.visible = true;
    if (pp.umpire && pp.umpire.mask) pp.umpire.mask.visible = true;
    if (this.ball) this.ball.scale.setScalar(this.ballScale0);
    if (camera && A.fov0 != null) { camera.fov = A.fov0; camera.updateProjectionMatrix(); }
    this.active = null;
  }
}


/** The moments (bags at times t1) that have another within a second at a bag more than 60 ft away. */
function crowded(ms) {
  return ms.filter((a) => ms.some((b) => b !== a && Math.abs(b.t1 - a.t1) < 1 && Math.hypot(a.x - b.x, a.y - b.y) > 60));
}

/** A gaussian smoothing of a run of points (sigma in samples), its ends held: what lies past either
    end is taken as the end itself, so the move starts and stops at rest. */
function gauss(a, sig, reach) {
  const n = a.length, R = reach || Math.max(1, Math.ceil(3 * sig)), w = [];
  for (let k = -R; k <= R; k++) w.push(Math.exp(-0.5 * (k / Math.max(1e-6, sig)) ** 2));
  return a.map((_, i) => {
    let x = 0, y = 0, z = 0, t = 0;
    for (let k = -R; k <= R; k++) { const p = a[clamp(i + k, 0, n - 1)], q = w[k + R]; x += p.x * q; y += p.y * q; z += p.z * q; t += q; }
    return { x: x / t, y: y / t, z: z / t };
  });
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
