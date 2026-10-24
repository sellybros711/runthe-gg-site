/* The pitcher in first person: you are him. His glove low in the glove side corner at the set (with
 * his breathing and a small pump of the glove), and on the throw his throwing arm and the ball
 * through the frame, then the follow-through. His head's own motion is the camera's (park.js
 * pitcherEye); this is the body you see.
 *
 *   const fp = new FirstPerson(canvas, env)   a transparent canvas laid over the scene's, its own
 *                                            small renderer: the idle glove draws here alone, at 30
 *                                            frames a second, and the park is never drawn again for it
 *   fp.setPitcher(facts, kit)               his hand, his arm slot, his skin tone, his club's sleeve
 *   fp.layout(w, h, safe, zone, panels)     the canvas in CSS px, the HUD's safe rect, the zone's grid
 *                                            box on screen, the HUD's panels on the canvas (without a
 *                                            safe rect): the glove keeps out of all of them
 *   fp.pose(t)                              play time t (0: the set; T_RELEASE: the ball leaves his hand)
 *   fp.render(camera)                       the scene's camera, for the sun's direction
 *   fp.lensFor(pitch, eye, camera)          the ball out of his hand (THE LENS, below)
 *
 * HIS ARM. The slot is his own: Savant's arm angle (pitcher.armAngle, degrees over the horizontal)
 * when the pack has it, else the angle of his release point over his shoulder, else a three quarter
 * 40 degrees. The arm comes in along that angle from his arm side, the ball leaves his hand at
 * T_RELEASE, and the arm goes down his arm side into the follow-through, never across the zone.
 * Mirrored for a lefty. The sleeve is his club's undershirt (people.js kitFor, the closer's side), the
 * skin his tone (looks.js, from his name: never his real look, as for the hitters).
 *
 * THE LENS. The scene's lens is long (the hitter large on a phone, a few degrees wide), so the real
 * release point, a couple of feet in front of his eyes and out to his arm side, is far off the
 * screen, and a ball drawn there would fill it. The arm is drawn with a natural lens (30 degrees each
 * way across the short side) and the ball leaves his hand where his hand is on that screen. From
 * there it is drawn onto its own path: its distance from where it will cross the plate shrinks like a
 * ball going away from you, its direction turns onto the path's, its size eases onto its own, and at
 * lens.join (a fifth of a second or so, well before the plate) it is exactly on its path, with the
 * same speed on screen, from then on. The flight itself (pitch.js flight) is never changed: the
 * crossing, the trail from the join and the markers are the pitch's own.
 */
import * as THREE from 'three';
import { smooth, clamp01 } from './units.js?v=1';
import { spline, reducedMotion, SUN } from './park.js?v=4';
import { baseball } from './gear3d.js?v=3';
import { look } from './looks.js?v=2';
import { assetUrl } from './load.js?v=7';
import { T_RELEASE } from './pitch.js?v=9';

const HALF = THREE.MathUtils.degToRad(30), TAN = Math.tan(HALF);   // the arm's lens, each way across the short side
const GLOVE_M = 0.30;            // the glove, heel to fingertips, metres
const BALL_M = 2.9 * 0.0254;     // a baseball's diameter, metres
const UPPER = 0.30, FORE = 0.27; // his arm, metres
const SKIN_LIGHT = new THREE.Color('#d8a184'), SKIN_DARK = new THREE.Color('#5a3a2a');

/* The glove through the delivery, from the set: [t, toward the screen's middle (units), up (units),
   further away (m), the fingers tipped forward (degrees)]. A unit is half the screen's short side.
   It lifts a little with his leg, goes out toward the target, tucks to his chest as the arm comes
   through (off the bottom of the screen), and comes back up into his fielding stance. */
const GLOVE_KEYS = [
  [0.00, 0.00, 0.00, 0.00, 0],
  [0.28, 0.05, 0.12, 0.00, 5],
  [0.50, 0.10, 0.18, 0.05, 12],
  [0.68, -0.06, -0.40, 0.00, 20],
  [0.86, -0.30, -1.40, -0.04, 28],
  [1.06, -0.40, -1.90, -0.04, 30],
  [1.32, -0.10, -0.85, 0.00, 12],
  [1.58, 0.00, -0.28, 0.00, 4],
];
/* His throwing hand (the ball in it) around release, r = t - T_RELEASE: [r, along the slot (units
   out from the release point, + toward where it came from), down the arm side (units), depth (m)].
   In along his slot from off the screen, the ball out at r = 0, then down his arm side. */
const ARM_KEYS = [
  [-0.24, 2.60, 0.00, 0.30],
  [-0.15, 1.70, 0.00, 0.40],
  [-0.06, 0.62, 0.00, 0.52],
  [0.00, 0.00, 0.00, 0.58],
  [0.07, -0.10, 0.75, 0.55],
  [0.20, -0.15, 2.20, 0.45],
  [0.30, -0.10, 3.00, 0.40],
];
const ARM_ON = [-0.17, 0.24];    // when any of the arm can be on screen
/* His throwing shoulder, metres from his eyes (x toward his arm side, y up, z toward the plate), as
   his trunk turns through: back, square at release, over the front leg. */
const SHOULDER_KEYS = [
  [-0.24, 0.30, -0.20, -0.12],
  [0.00, 0.17, -0.16, 0.06],
  [0.20, 0.03, -0.34, 0.14],
  [0.30, 0.00, -0.38, 0.16],
];

/** His arm slot, degrees over the horizontal. */
export function armSlot(p, rel) {
  if (p && Number.isFinite(p.armAngle)) return Math.max(-10, Math.min(95, p.armAngle));
  // his own release point (not the stand in): its angle over a shoulder about 4.9 ft up and 0.6 ft
  // out at release (a stride's height on the mound's slope)
  if (rel && !rel.assumed) return THREE.MathUtils.radToDeg(Math.atan2(rel.z - 4.9, Math.max(0.2, Math.abs(rel.x) - 0.6)));
  return 40;
}

function leather(tex, color) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.6, map: tex.map, normalMap: tex.normal, normalScale: new THREE.Vector2(0.7, 0.7) });
  return m;
}

/** A fielder's glove for the left hand: fingers up (+y), the pocket facing +z, the thumb to +x. */
function gloveModel(mat, dark, lace) {
  const g = new THREE.Group();
  // the palm and heel: an egg, flat at the back, the pocket pressed into the front
  const pg = new THREE.SphereGeometry(1, 28, 20), pos = pg.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const r2 = x * x + y * y;
    if (z > 0) z -= 0.6 * Math.max(0, 1 - r2 * 1.4) * z;
    x *= 1 + 0.12 * y;
    pos.setXYZ(i, x * 0.08, y * 0.092, z * 0.045);
  }
  pg.computeVertexNormals();
  g.add(new THREE.Mesh(pg, mat));
  // four finger stalls, fanned, cupped toward the pocket (pinky at -x, index next to the thumb)
  const stall = new THREE.CapsuleGeometry(0.021, 1, 4, 12);
  const tips = [];
  [[-0.045, 0.112, 0.08], [-0.015, 0.132, 0.03], [0.015, 0.137, -0.02], [0.044, 0.125, -0.07]].forEach(([x, len, fan]) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.055, -0.004);
    pivot.rotation.set(0.2, 0, fan);
    const f = new THREE.Mesh(stall, mat);
    f.scale.set(1, len, 1); f.position.y = len / 2;
    pivot.add(f);
    g.add(pivot);
    pivot.updateMatrix();
    tips.push(new THREE.Vector3(0, len + 0.01, 0).applyMatrix4(pivot.matrix));
  });
  // the thumb, out to the side and up
  const tp = new THREE.Group();
  tp.position.set(0.062, -0.025, 0.006);
  tp.rotation.set(0.25, 0, -0.62);
  const th = new THREE.Mesh(new THREE.CapsuleGeometry(0.021, 0.085, 4, 12), mat);
  th.position.y = 0.06; tp.add(th); g.add(tp);
  tp.updateMatrix();
  const thumbTip = new THREE.Vector3(0, 0.12, 0).applyMatrix4(tp.matrix);
  // the web between the thumb and the index finger
  const web = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.075, 0.01), dark);
  web.position.set(0.072, 0.1, 0.02); web.rotation.set(0.15, 0, -0.32); g.add(web);
  // the lace round the tips, and the wrist strap
  const curve = new THREE.CatmullRomCurve3([thumbTip, tips[3], tips[2], tips[1], tips[0]]);
  g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 0.0035, 5, false), lace));
  const strap = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.054, 0.035, 24, 1, true), dark);
  strap.position.set(0, -0.092, -0.004); g.add(strap);
  return g;
}

/** A right hand gripping a ball: the back of the hand toward +z (toward his eyes at release), the
    fingers up (+y), the ball in front of the fingertips (-z). Its origin is the middle of the palm. */
function handModel(skin, ball) {
  const g = new THREE.Group();
  const palm = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), skin);
  palm.scale.set(0.043, 0.05, 0.017); g.add(palm);
  const seg = new THREE.CapsuleGeometry(0.0095, 1, 3, 8);
  const finger = (x, y, len, curl, splay) => {
    const p = new THREE.Group(); p.position.set(x, y, 0); p.rotation.set(-curl, 0, splay);
    const f = new THREE.Mesh(seg, skin); f.scale.set(1, len, 1); f.position.y = len / 2; p.add(f); g.add(p);
  };
  // index and middle over the ball, ring and pinky tucked at its side, the thumb under it
  finger(-0.012, 0.045, 0.072, 0.75, 0.05);
  finger(0.012, 0.045, 0.076, 0.75, -0.05);
  finger(0.03, 0.04, 0.05, 1.6, -0.2);
  finger(0.044, 0.032, 0.04, 1.8, -0.35);
  finger(-0.036, 0.0, 0.055, 1.1, 0.9);
  ball.position.set(0, 0.105, -0.03);
  g.add(ball);
  return g;
}

/** A limb: a closed cylinder stretched between two points each frame, rounded by spheres at the
    joints. */
function limb(mat, r0, r1) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, 1, 18, 1, false), mat);
  m.userData.set = (a, b) => {
    const d = new THREE.Vector3().subVectors(b, a), len = d.length();
    m.position.addVectors(a, b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(UP, d.divideScalar(len || 1));
    m.scale.set(1, len, 1);
  };
  return m;
}
const UP = new THREE.Vector3(0, 1, 0);

/** Two bone reach from a to the target, the elbow toward pole: the joint. Out of reach, a is pulled
    in (the arm straight). */
function reachTo(a, target, l1, l2, pole) {
  const d = new THREE.Vector3().subVectors(target, a);
  let len = d.length();
  if (len > l1 + l2 - 0.004) { a.addScaledVector(d.normalize(), len - (l1 + l2 - 0.004)); d.subVectors(target, a); len = d.length(); }
  const dir = d.normalize();
  const along = (l1 * l1 - l2 * l2 + len * len) / (2 * len), up = Math.sqrt(Math.max(0, l1 * l1 - along * along));
  const perp = pole.clone().addScaledVector(dir, -pole.dot(dir)).normalize();
  return a.clone().addScaledVector(dir, along).addScaledVector(perp, up);
}

export class FirstPerson {
  constructor(canvas, env) {
    this.main = canvas;
    this.ok = false;
    this.clock = 0;
    this.t = 0;
    this.settle = Infinity;
    this.hidden = false;
    this.side = 1;
    const ov = this.canvas = document.createElement('canvas');
    ov.className = 'fp';
    ov.setAttribute('aria-hidden', 'true');
    Object.assign(ov.style, { position: 'absolute', left: '0px', top: '0px', width: '100%', height: '100%', pointerEvents: 'none', background: 'transparent' });
    canvas.parentNode.insertBefore(ov, canvas.nextSibling);
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas: ov, alpha: true, antialias: true, premultipliedAlpha: true });
    } catch (e) { ov.remove(); return; }
    const r = this.renderer;
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.AgXToneMapping;
    r.toneMappingExposure = 1.0;
    r.setClearColor(0x000000, 0);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.02, 10);
    if (env) {
      const pm = new THREE.PMREMGenerator(r);
      this.scene.environment = pm.fromEquirectangular(env).texture;
      this.scene.environmentIntensity = 0.8;
      pm.dispose();
    }
    this.sun = new THREE.DirectionalLight(0xffdcb8, 3.0);
    this.scene.add(this.sun, new THREE.HemisphereLight(0xbcd2ff, 0x5a4a35, 0.35));
    // a soft fill from his own side (his body lit by the sky behind him, not left a silhouette)
    this.fill = new THREE.DirectionalLight(0xfff2e6, 1.1);
    this.fill.position.set(-0.4, 1, 0.6);
    this.scene.add(this.fill);
    const tl = new THREE.TextureLoader();
    const lm = tl.load(assetUrl('tex/leather_color.webp')); lm.colorSpace = THREE.SRGBColorSpace;
    const ln = tl.load(assetUrl('tex/leather_normal.webp'));
    const kn = tl.load(assetUrl('tex/knit_normal.webp')); kn.wrapS = kn.wrapT = THREE.RepeatWrapping; kn.repeat.set(3, 3);
    this.mats = {
      leather: leather({ map: lm, normal: ln }, 0xb07a48),
      dark: leather({ map: lm, normal: ln }, 0x4a3020),
      lace: new THREE.MeshStandardMaterial({ color: 0x3a2618, roughness: 0.7 }),
      sleeve: new THREE.MeshStandardMaterial({ color: 0x1b2a44, roughness: 0.85, normalMap: kn, normalScale: new THREE.Vector2(0.35, 0.35) }),
      jersey: new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.85, normalMap: kn, normalScale: new THREE.Vector2(0.35, 0.35) }),
      skin: new THREE.MeshStandardMaterial({ color: SKIN_LIGHT.clone(), roughness: 0.55 }),
    };
    const M = this.mats;
    // the glove and the forearm under it
    this.glove = gloveModel(M.leather, M.dark, M.lace);
    this.gloveArm = limb(M.sleeve, 0.044, 0.04);
    this.scene.add(this.glove, this.gloveArm);
    // the throwing arm: shoulder, upper arm (the jersey's sleeve then the undershirt), elbow, forearm, hand
    this.ball = baseball();
    this.ball.castShadow = false;
    this.ball.scale.setScalar(BALL_M / (2.9 * 0.0254));
    this.hand = handModel(M.skin, this.ball);
    this.upper = limb(M.sleeve, 0.048, 0.042);
    this.cuff = limb(M.jersey, 0.062, 0.058);
    this.fore = limb(M.sleeve, 0.04, 0.029);
    this.elbow = new THREE.Mesh(new THREE.SphereGeometry(0.042, 16, 12), M.sleeve);
    this.wrist = new THREE.Mesh(new THREE.SphereGeometry(0.027, 12, 10), M.skin);
    this.arm = new THREE.Group();
    this.arm.add(this.hand, this.upper, this.cuff, this.fore, this.elbow, this.wrist);
    this.scene.add(this.arm);
    this.v = [];
    this.ok = true;
  }

  /** His hand, slot, tone and sleeve. kit: the closer's side (people.js kitFor 'us'). */
  setPitcher(facts, kit) {
    if (!this.ok) return;
    const p = facts.pitcher;
    this.side = p.throws === 'L' ? -1 : 1;
    this.slot = THREE.MathUtils.degToRad(armSlot(p, facts.release));
    const tone = look(p.name || 'pitcher').tone;
    this.mats.skin.color.copy(SKIN_LIGHT).lerp(SKIN_DARK, tone);
    if (kit) {
      this.mats.sleeve.color.copy(kit.undershirt);
      this.mats.jersey.color.copy(kit.base);
    }
    // a righty's glove is on his left hand (the model's); a lefty's is the mirror, as is his hand
    this.glove.scale.x = this.side;
    this.hand.scale.x = this.side;
    this.place();
  }

  /** Where things go on this screen. safe: the HUD's insets (CSS px) or null; zone: the aim grid's
      box on the canvas (stage.gridRect). */
  layout(w, h, safe, zone, panels) {
    if (!this.ok || !w || !h) return;
    this.w = w; this.h = h; this.safe = safe || null; this.zone = zone || null; this.panels = panels || null;
    this.renderer.setSize(w, h, false);
    this.unit = Math.min(w, h) / 2;
    this.camera.aspect = w / h;
    this.camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan((h / 2) / this.unit * TAN));
    this.camera.updateProjectionMatrix();
    this.place();
  }

  /** CSS px and a depth (m) to a point in front of his eyes. */
  at(sx, sy, d, out = new THREE.Vector3()) {
    const k = d * TAN / this.unit;
    return out.set((sx - this.w / 2) * k, (this.h / 2 - sy) * k, -d);
  }

  /** The glove's place at the set and the arm's path, from the layout. */
  place() {
    if (!this.w) return;
    const { w, h, unit, side } = this;
    let bottom = h - (this.safe ? Math.max(0, this.safe.bottom || 0) : 0);
    // the glove: a third of a phone's width, a quarter of a wide screen's height, in his glove side
    // corner, two thirds of it over the bottom (or the HUD's dock)
    const s = Math.min(0.36 * w, 0.26 * h);
    let gx = side > 0 ? 0.42 * s : w - 0.42 * s;
    // no safe rect from the page: keep off the HUD's own panels (layout's panels). A dock along the
    // bottom, it stands on; a tall panel in the corner, it goes beside, toward the middle
    if (!this.safe && this.panels && this.panels.length) {
      const over = (x, floor) => this.panels.filter((p) => p.x1 > x - 0.5 * s && p.x0 < x + 0.5 * s && p.y1 > floor - 0.7 * s && p.y0 < floor);
      const hit = over(gx, h);
      if (hit.length) {
        const top = Math.min(...hit.map((p) => p.y0));
        if (h - top <= 0.3 * h) bottom = top;
        else {
          gx = side > 0 ? Math.max(...hit.map((p) => p.x1)) + 0.5 * s : Math.min(...hit.map((p) => p.x0)) - 0.5 * s;
          const again = over(gx, h);
          if (again.length) bottom = Math.min(...again.map((p) => p.y0));
        }
      }
    }
    let gy = bottom - 0.16 * s;
    // never over the zone's grid: lower it until it clears
    const z = this.zone;
    if (z && gx + 0.5 * s > z.x && gx - 0.5 * s < z.x + z.w) gy = Math.max(gy, z.y + z.h + 10 + 0.5 * s);
    this.gloveRoom = z && gx + 0.5 * s > z.x && gx - 0.5 * s < z.x + z.w ? Math.max(0, (gy - 0.5 * s) - (z.y + z.h + 10)) / unit : Infinity;
    this.gloveDepth = GLOVE_M * unit / (s * TAN);
    this.gloveAt = { x: gx, y: gy };
    // the release point on screen: out along his slot from the zone's middle, inside the screen
    const zc = z ? { x: z.x + z.w / 2, y: z.y + z.h / 2 } : { x: w / 2, y: h / 2 };
    this.dir = { x: side * Math.cos(this.slot ?? 0.7), y: -Math.sin(this.slot ?? 0.7) };
    const H = { x: zc.x + this.dir.x * 0.95 * unit, y: zc.y + this.dir.y * 0.95 * unit };
    H.x = Math.max(0.1 * w, Math.min(0.9 * w, H.x));
    H.y = Math.max(0.1 * h, Math.min(bottom - 0.12 * h, H.y));
    this.H = H;
  }

  /** The ball's place in his hand on screen at play time t (CSS px), its size (px) and depth (m). */
  gripAt(t) {
    const r = t - T_RELEASE, k = spline(ARM_KEYS, r, this.v);
    const u = this.unit, d = this.dir;
    // along the slot (back toward where the arm came from), then down his arm side
    const x = this.H.x + d.x * k[0] * u + this.side * 0.35 * Math.min(1, k[1]) * u;
    const y = this.H.y + d.y * k[0] * u + k[1] * u;
    return { x, y, depth: k[2], px: BALL_M * u / (k[2] * TAN) };
  }

  pose(t) {
    if (!this.ok || !this.w) return;
    this.t = t;
    const red = reducedMotion();
    const u = this.unit, side = this.side;
    // ---- the glove
    const g = spline(GLOVE_KEYS, Math.max(0, t), []);
    // back to the set by the end of the pitch (the eye's own window, park.js)
    if (t > 0) {
      const s0 = Math.max(1.6, this.settle - 0.8), s1 = Math.max(s0 + 0.3, this.settle - 0.1);
      if (t > s0) { const k = smooth(Math.min(1, (t - s0) / (s1 - s0))); for (let j = 0; j < 4; j++) g[j] *= 1 - k; }
    }
    // his breathing and a small pump of the glove every few seconds, at the set only
    const still = 1 - smooth(clamp01(t / 0.15));
    if (!red && still > 0) {
      const c = this.clock;
      const pump = Math.sin(Math.PI * clamp01(((c % 5.3) - 4.4) / 0.6)) ** 2;
      g[1] += still * (0.012 * Math.sin(c * 2 * Math.PI / 3.9) + 0.03 * pump);
      g[3] += still * 6 * pump;
    }
    g[1] = Math.min(g[1], this.gloveRoom);
    const gd = this.gloveDepth + g[2];
    const gp = this.at(this.gloveAt.x + side * g[0] * u, this.gloveAt.y - g[1] * u, gd);
    this.glove.position.copy(gp);
    // fingers up, a little forward and in toward the middle; the pocket turned toward his arm side
    // and his eyes
    const fy = new THREE.Vector3(side * 0.3, 0.86, -0.4).normalize();
    fy.applyAxisAngle(new THREE.Vector3(1, 0, 0), -THREE.MathUtils.degToRad(g[3]));
    const fz = new THREE.Vector3(side * 0.8, 0.05, 0.6).normalize();
    fz.addScaledVector(fy, -fz.dot(fy)).normalize();
    const fx = new THREE.Vector3().crossVectors(fy, fz);
    this.glove.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(fx, fy, fz));
    this.glove.visible = !this.hidden;
    // his forearm down out of the frame from the strap, toward his body
    const wristG = new THREE.Vector3(0, -0.1, -0.004).applyMatrix4(this.glove.matrix.compose(this.glove.position, this.glove.quaternion, this.glove.scale));
    const elbowG = wristG.clone().add(new THREE.Vector3(-side * 0.08, -0.3, 0.12));
    this.gloveArm.userData.set(elbowG, wristG);
    this.gloveArm.visible = !this.hidden;
    // ---- the throwing arm, around release only
    const r = t - T_RELEASE;
    const on = !this.hidden && t > 0 && r > ARM_ON[0] && r < ARM_ON[1];
    this.arm.visible = on;
    if (!on) return;
    const gr = this.gripAt(t);
    const grip = this.at(gr.x, gr.y, gr.depth);
    const sh = spline(SHOULDER_KEYS, r, []);
    const S = new THREE.Vector3(side * sh[0], sh[1], -sh[2]);
    // the hand: fingers along the arm (shoulder to ball), the back of the hand toward his eyes; after
    // the ball is gone the wrist snaps down and the hand turns over
    const hy = grip.clone().sub(S).normalize();
    const hz = new THREE.Vector3(0, 0, 1).addScaledVector(hy, -hy.z).normalize();
    const hx = new THREE.Vector3().crossVectors(hy, hz);
    const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(hx, hy, hz));
    if (r > 0) {
      const k = smooth(clamp01(r / 0.09));
      q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -1.1 * k));
      q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -side * 0.9 * k));
    }
    this.hand.quaternion.copy(q);
    const ballLocal = new THREE.Vector3(0, 0.105, -0.03);
    this.hand.position.copy(grip).sub(ballLocal.clone().applyQuaternion(q));
    // the ball is in his hand until it leaves it (then it is the scene's: pitch.js and the lens)
    this.ball.visible = r < 0;
    const W = new THREE.Vector3(0, -0.055, 0).applyQuaternion(q).add(this.hand.position);
    const E = reachTo(S, W, UPPER, FORE, new THREE.Vector3(side * 0.7, -1, 0.35));
    this.upper.userData.set(S, E);
    this.cuff.userData.set(S, S.clone().lerp(E, 0.35));
    this.fore.userData.set(E, W);
    this.elbow.position.copy(E);
    this.wrist.position.copy(W);
  }

  /** Draw (the scene's camera gives the sun's direction in his view). */
  render(camera) {
    if (!this.ok || !this.w) return;
    if (camera && SUN.dir) {
      const inv = camera.quaternion.clone().invert();
      this.sun.position.copy(SUN.dir).applyQuaternion(inv).multiplyScalar(5);
    }
    this.renderer.render(this.scene, this.camera);
  }

  /** THE LENS for one pitch (see the header): { join, place(tt, ball, camera) } for pitch.js, or
      null. eye: the stage's pitcherEye (his head at release); camera: the scene's. */
  lensFor(pitch, eye, camera) {
    if (!this.ok || !this.w || !this.H) return null;
    const W = this.w, Hh = this.h;
    const cam = camera.clone();
    eye.update(pitch.tRel, cam);
    cam.updateMatrixWorld(); cam.updateProjectionMatrix();
    const px = (pt, c) => { const v = pt.clone().project(c); return { x: (v.x + 1) / 2 * W, y: (1 - v.y) / 2 * Hh }; };
    const g = this.gripAt(pitch.tRel), hand = { x: g.x, y: g.y };
    const cross = (c) => px(pitch.pointAt(pitch.f.T), c);
    const c0 = cross(cam);
    const off = (tt, c, cc) => { const p = px(pitch.pointAt(tt), c); return { x: p.x - cc.x, y: p.y - cc.y }; };
    const mH = Math.hypot(hand.x - c0.x, hand.y - c0.y);
    const o0 = off(0, cam, c0), o1 = off(0.02, cam, c0);
    const m0 = Math.hypot(o0.x, o0.y), m1 = Math.hypot(o1.x, o1.y);
    // the true path's distance from the crossing falls like 1 / (tt + tau0)
    const tau0 = m0 > m1 * 1.0001 ? 0.02 / (m0 / m1 - 1) : 0.02;
    // the join: the first moment the true path is on screen and as near the crossing as a ball easing
    // in from the hand (mH e^(-tt / (tt + tau0))) would be: there both distance and speed agree
    const T = pitch.f.T;
    let join = 0.6 * T;
    for (let tt = 0.04; tt < 0.6 * T; tt += 0.002) {
      const p = px(pitch.pointAt(tt), cam), o = { x: p.x - c0.x, y: p.y - c0.y };
      const inside = p.x > 0.04 * W && p.x < 0.96 * W && p.y > 0.04 * Hh && p.y < 0.96 * Hh;
      if (inside && Math.hypot(o.x, o.y) <= mH * Math.exp(-tt / (tt + tau0))) { join = tt; break; }
    }
    const lam = 1 / (join + tau0);
    const ang = (o) => Math.atan2(o.y, o.x);
    let dTheta = Math.atan2(hand.y - c0.y, hand.x - c0.x) - ang(o0);
    dTheta = Math.atan2(Math.sin(dTheta), Math.cos(dTheta));
    const sHand = g.px;
    const v = new THREE.Vector3();
    const self = this;
    return {
      join,
      hand, mH,
      /** Put the ball where the lens draws it, tt seconds out of his hand. */
      place(tt, ball, c) {
        if (self.hidden) return;
        const cH = c.userData.cssH || Hh;
        const cc = cross(c), q = pitch.pointAt(tt), p = px(q, c);
        const o = { x: p.x - cc.x, y: p.y - cc.y }, mT = Math.hypot(o.x, o.y);
        const s = clamp01(tt / join);
        const kA = smooth(s), kM = smooth(clamp01((s - 0.5) / 0.5));
        const mE = mH * Math.exp(-lam * tt);
        const m = Math.exp((1 - kM) * Math.log(Math.max(mE, 1e-3)) + kM * Math.log(Math.max(mT, 1e-3)));
        const th = ang(o) + dTheta * (1 - kA);
        const sx = cc.x + m * Math.cos(th), sy = cc.y + m * Math.sin(th);
        // its own size there, and the size the lens gives it
        const dist = c.position.distanceTo(q);
        const sTrue = BALL_M / (2 * dist * Math.tan(THREE.MathUtils.degToRad(c.fov) / 2)) * cH;
        const sLens = sHand * (m / mH);
        const size = Math.exp((1 - kA) * Math.log(sLens) + kA * Math.log(sTrue));
        v.copy(q).project(c);
        v.x = sx / W * 2 - 1; v.y = 1 - sy / Hh * 2;
        v.unproject(c);
        ball.position.copy(v);
        ball.scale.setScalar(size / sTrue);
      },
    };
  }
}
