/* The aim ball: a small 3D baseball sitting exactly on the aim point at the front of the plate,
 * spinning the way the picked pitch spins. The 2D crosshair (aim.js) is its hit marker.
 *
 * The owner (2026-10-23), after the animated trail: "Instead of lines coming from the side, it should
 * be a 3d animated baseball with the hit marker around it. We can make it smaller. The 3d baseball
 * should be rotating as whatever pitch is selected." So nothing is drawn from the hand any more.
 *
 * WHERE. The aim point is the cell plus the free aim point at (pitch.js cellPoint, the point the
 * thrown pitch's flight is solved to cross when the engine's actual is the aim; check-pitches holds
 * it). The ball is real size (2.9 in) and never under MIN_PX across on screen. It is drawn over
 * everything, so a hitter's hands never hide it. It shows the aim, never the outcome.
 *
 * HOW IT SPINS (spinOf). A spin axis per family, catcher's view, written in arm side and glove side
 * and mirrored for a lefty the same way as the break. The transverse part of the axis is set by the
 * way the family moves (Magnus: the push is spin x velocity, so a ball moving arm side and up spins
 * about (-up, arm side)); the rest of the axis points along the flight (gyro spin, which moves
 * nothing). Four-seam: backspin, a touch arm side, four-seam orientation. Sinker: backspin tilted arm
 * side, two-seam orientation. Cutter: backspin tilted a little glove side, some gyro. Slider: mostly
 * gyro, tilted glove side. Sweeper: sidespin to the glove side. Curveball and knuckle curve: topspin.
 * Changeup: tilted arm side, slower. Splitter and forkball: low spin, a forward tumble. Knuckleball:
 * barely turning. Those are the fallback (labelled FAMILY_DEFAULT), for a pitch the pack has no spin
 * for (before Statcast, 2015, and proxy spots). A pitch with spin {rate, axis, active} (CONTRACT.md
 * section 4) turns about its own axis: Savant's spin_axis is the way the spin moves the ball, catcher's
 * view (0 topspin, 90 the first base side, 180 backspin, 270 the third base side), so the transverse
 * axis is (cos, 0, sin) of it; active spin is the transverse share and the rest is gyro (along the
 * flight, signed like the family's; with no active spin, the family's gyro). Its rate is his real rpm
 * scaled to a readable turn (RPS_PER_RPM: 2,300 rpm turns 1.6 times a second on screen), not
 * the real 2,000 to 2,600 rpm, which would strobe. A change of pitch blends axis and rate (BLEND_S).
 *
 * WHEN. Shown while aiming. On the throw tap it fades out (OUT_S), long before the ball leaves the
 * hand. prefers-reduced-motion: a still ball, no spin, no fades. It asks for frames only while it
 * moves (busy()), the stage caps them at 30 a second, and it slows to a stop SETTLE_S after the last
 * change, so an idle aim draws nothing. One mesh, one draw call, nothing allocated per frame.
 *
 * The page hears the pitch's colour (the break chart's, PITCH_COLORS, by usage, the same list as
 * ui.js) through the stage, and aim.js colours the crosshair with it: one reticle around one ball.
 */
import * as THREE from 'three';
import { cellPoint } from './pitch.js?v=13';
import { FT } from './units.js?v=1';

export const OUT_S = 0.14, BLEND_S = 0.35, SETTLE_S = 8, STOP_S = 0.6, MIN_PX = 11, BALL_IN = 2.9;
/** The break chart's colours, in usage order (ui.js PITCH_COLORS: keep the two equal). */
export const PITCH_COLORS = ['#ff4f1f', '#2b59ff', '#8b5cf6', '#14b8a6', '#f2b827', '#ec4899', '#64748b'];
/** Each pitch type's own colour, Baseball Savant's (ui.js TYPE_COLORS: keep the two equal). PITCH_COLORS
 *  by usage is the fallback for a type not here. */
export const TYPE_COLORS = { FF: '#d22d49', SI: '#fe9d00', FC: '#933f2c', SL: '#eee716', ST: '#ddb33a', SV: '#93afd4', CU: '#00d1ed', KC: '#6236cd', CS: '#0068ff', CH: '#1dbe3a', FS: '#3bacac', FO: '#55ccab', KN: '#3c44cd', SC: '#60db33', EP: '#888888' };

/* The family defaults (the fallback for a pitch with no spin in the pack). arm, up: the direction the
   spin pushes the ball (arm side and up, in the pitcher's hand frame, before mirroring); gyro: the
   share of the spin along the flight; rps: a readable turn on screen; grip: the seam orientation. */
export const FAMILY_DEFAULT = Object.freeze({
  FF: { arm: 0.3, up: 1, gyro: 0.1, rps: 1.6, grip: 4 },
  SI: { arm: 0.85, up: 0.55, gyro: 0.15, rps: 1.5, grip: 2 },
  FC: { arm: -0.45, up: 0.9, gyro: 0.45, rps: 1.6, grip: 4 },
  SL: { arm: -0.8, up: 0.15, gyro: 0.85, rps: 1.8, grip: 4 },
  ST: { arm: -1, up: 0.05, gyro: 0.25, rps: 1.7, grip: 4 },
  SV: { arm: -0.8, up: -0.6, gyro: 0.3, rps: 1.7, grip: 4 },
  CU: { arm: -0.3, up: -1, gyro: 0.2, rps: 1.8, grip: 4 },
  KC: { arm: -0.3, up: -1, gyro: 0.2, rps: 1.8, grip: 4 },
  CH: { arm: 0.75, up: 0.55, gyro: 0.25, rps: 1.0, grip: 2 },
  FS: { arm: 0.35, up: -0.4, gyro: 0.35, rps: 0.45, grip: 2 },
  FO: { arm: 0.3, up: -0.5, gyro: 0.35, rps: 0.4, grip: 2 },
  KN: { arm: 0, up: 1, gyro: 0, rps: 0.08, grip: 4 },
});

/** The spin of a pitch type for a hand: { axis: unit vector, catcher's view (x to the first base
    side, y toward the mound, z up), rps, grip }. The ball turns right handed about axis. Magnus:
    the push is axis x velocity, velocity is about -y, so the push is (axis.z, 0, -axis.x). */
export const RPS_PER_RPM = 1.6 / 2300, RPS_MIN = 0.05, RPS_MAX = 2.4;
/** pitch: an arsenal entry ({type, spin}) or a bare type (the family default). */
export function spinOf(pitch, hand) {
  const type = typeof pitch === 'string' ? pitch : pitch && pitch.type;
  const d = FAMILY_DEFAULT[type] || FAMILY_DEFAULT.FF;
  const armX = hand === 'L' ? 1 : -1;            // a righty's arm side is the third base side, x < 0
  const sp = pitch && typeof pitch === 'object' ? pitch.spin : null;
  if (sp && Number.isFinite(sp.axis) && Number.isFinite(sp.rate)) {
    const th = sp.axis * Math.PI / 180;
    const act = Number.isFinite(sp.active) ? Math.max(0, Math.min(1, sp.active / 100)) : Math.sqrt(Math.max(0, 1 - d.gyro * d.gyro));
    const gy = Math.sqrt(Math.max(0, 1 - act * act));
    // push (sin, -cos) = (axis.z, -axis.x): axis.x = cos, axis.z = sin
    const axis = { x: Math.cos(th) * act, y: gy * -armX, z: Math.sin(th) * act };
    const rps = Math.max(RPS_MIN, Math.min(RPS_MAX, sp.rate * RPS_PER_RPM));
    return { axis, rps, grip: d.grip, src: 'his spin' };
  }
  const mx = d.arm * armX, mz = d.up, m = Math.hypot(mx, mz) || 1;
  const t = Math.sqrt(Math.max(0, 1 - d.gyro * d.gyro));
  // push (mx, mz) = (axis.z, -axis.x): axis.x = -mz, axis.z = mx; the gyro part along the flight,
  // mirrored for a lefty like everything else
  const axis = { x: -mz / m * t, y: d.gyro * -armX, z: mx / m * t };
  return { axis, rps: d.rps, grip: d.grip, src: 'family default' };
}

const reduced = () => { try { return !!(typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; } };
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
const ease = (x) => { const k = Math.min(1, Math.max(0, x)); return k * k * (3 - 2 * k); };
const X = new THREE.Vector3(1, 0, 0);
const _v = new THREE.Vector3(), _w = new THREE.Vector3();

/* A baseball's seam (the two lobe curve on the sphere) painted on an equirectangular map: white
   leather, a wide red seam and its stitches, bold enough to read the turn at a dozen pixels. */
function ballTexture() {
  if (typeof document === 'undefined') return null;
  const W = 512, H = 256, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#f4f1e8'; g.fillRect(0, 0, W, H);
  const a = 0.75, b = 0.25, k = 2 * Math.sqrt(a * b);
  const uv = (t) => {
    const x = a * Math.cos(t) + b * Math.cos(3 * t), y = a * Math.sin(t) - b * Math.sin(3 * t), z = k * Math.sin(2 * t);
    const r = Math.hypot(x, y, z);
    // three.js sphere uv: u from atan2(z, -x) around y, v from y; the curve's z axis is the sphere's y
    return [((Math.atan2(y / r, -x / r) / (2 * Math.PI)) + 1) % 1 * W, (0.5 - Math.asin(z / r) / Math.PI) * H];
  };
  g.lineCap = 'round';
  for (const [w, col] of [[13, '#7a0a10'], [6, '#d1222b']]) {
    g.strokeStyle = col; g.lineWidth = w;
    for (let i = 0; i < 400; i++) {
      const p = uv(i / 400 * Math.PI * 2), q = uv((i + 1) / 400 * Math.PI * 2);
      if (Math.abs(p[0] - q[0]) > W / 2) continue;
      g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(q[0], q[1]); g.stroke();
    }
  }
  g.strokeStyle = '#4a0408'; g.lineWidth = 3;
  for (let i = 0; i < 96; i++) {
    const p = uv(i / 96 * Math.PI * 2), q = uv((i + 0.02) / 96 * Math.PI * 2);
    const ang = Math.atan2(q[1] - p[1], q[0] - p[0]) + Math.PI / 2;
    g.beginPath(); g.moveTo(p[0] - Math.cos(ang) * 9, p[1] - Math.sin(ang) * 9); g.lineTo(p[0] + Math.cos(ang) * 9, p[1] + Math.sin(ang) * 9); g.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

export class Ghost {
  constructor(scene) {
    this.scene = scene;
    const map = ballTexture();
    this.mat = new THREE.MeshBasicMaterial({ map, color: map ? 0xffffff : 0xf4f1e8, transparent: true, opacity: 0, depthTest: false, depthWrite: false });
    // the leather lit softly from above: a basic material with a baked shade keeps it one cheap draw
    this.mat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vShade;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvShade = 0.62 + 0.38 * clamp(dot(normalize(mat3(modelMatrix) * normal), normalize(vec3(-0.3, 0.8, 0.5))), 0.0, 1.0);');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vShade;')
        .replace('#include <opaque_fragment>', 'outgoingLight *= vShade;\n#include <opaque_fragment>');
    };
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(0.5, 28, 18), this.mat);
    this.ball.renderOrder = 11;
    this.ball.frustumCulled = false;
    this.ball.visible = false;
    scene.add(this.ball);
    this.r = BALL_IN / 2 / 12 * FT;   // radius, metres
    this.pos = this.ball.position;
    // the spin: an axis (world), a rate, a turn angle; blending from the last pitch's
    this.axis = new THREE.Vector3(-1, 0, 0); this.axis0 = new THREE.Vector3(-1, 0, 0); this.axis1 = new THREE.Vector3(-1, 0, 0);
    this.grip = new THREE.Quaternion(); this.grip0 = new THREE.Quaternion(); this.grip1 = new THREE.Quaternion();
    this.rps = 0; this.rps0 = 0; this.rps1 = 0;
    this.angle = 0; this.tPrev = null; this.blendAt = -1;
    this.on = false; this.outAt = null; this.last = 0; this.key = null; this.shown = 0;
  }

  /** The ball on the aim point (a cell, plus at = [u, v] inside it) for this pitch (an arsenal
      entry: type) thrown by this hand ('R' or 'L'), in this hitter's zone. color: the pitch's. */
  set({ pitch, hand, cell, at, szTop, szBot, color }) {
    const t = now(), aim = cellPoint(cell, szTop, szBot, at);
    this.pos.set(-aim.x * FT, aim.z * FT, (17 / 12) * FT);
    this.aim = aim;
    this.color = color || PITCH_COLORS[0];
    const sp = pitch.spin;
    const key = pitch.type + (hand || 'R') + (sp ? ':' + sp.axis + ':' + sp.rate + ':' + sp.active : '');
    if (key !== this.key) {
      const s = spinOf(pitch, hand);
      this.spin = s;
      // catcher's view to the scene (P(): x -> -x, y -> z, z -> y; a proper rotation, so an axis
      // maps like a point)
      this.axis1.set(-s.axis.x, s.axis.z, s.axis.y).normalize();
      // the grip: the seam curve's own axis (the sphere's y) across the spin for a four-seam, along
      // it for a two-seam, so four or two seams cross each turn
      if (s.grip === 2) _w.copy(this.axis1);
      else { _w.crossVectors(this.axis1, X); if (_w.lengthSq() < 1e-6) _w.set(0, 0, 1); _w.normalize(); }
      this.grip1.setFromUnitVectors(_v.set(0, 1, 0), _w);
      const fresh = !this.on || this.outAt != null || reduced();
      this.axis0.copy(fresh ? this.axis1 : this.axis); this.grip0.copy(fresh ? this.grip1 : this.grip);
      this.rps0 = fresh ? s.rps : this.rps; this.rps1 = s.rps;
      this.blendAt = fresh ? -1 : t;
      if (fresh) { this.axis.copy(this.axis1); this.grip.copy(this.grip1); this.rps = s.rps; }
      this.key = key;
    }
    if (!this.on || this.outAt != null) { this.shown = t; this.tPrev = null; }
    this.ball.visible = true;
    this.on = true; this.outAt = null; this.last = t;
    this.tick(t);
  }

  /** Gone at once (a new hitter, the outing over). */
  hide() { this.on = false; this.outAt = null; this.key = null; this.ball.visible = false; }

  /** The pitch is thrown: a quick fade out of the way (instant with reduced motion). */
  release() {
    if (!this.on) return;
    if (reduced()) { this.hide(); return; }
    this.outAt = now();
  }

  get visible() { return this.on && this.outAt == null; }

  /** Still moving at time t (seconds)? The stage asks for frames only while this is true. */
  busy(t = now()) {
    if (!this.on) return false;
    if (this.outAt != null) return true;
    if (reduced()) return false;
    return t - this.last < SETTLE_S + STOP_S;
  }

  /** Move the spin, the blend and the fades to time t (seconds). */
  tick(t = now()) {
    if (!this.on) return;
    const still = reduced();
    if (this.blendAt >= 0) {
      const k = ease((t - this.blendAt) / BLEND_S);
      this.axis.copy(this.axis0).lerp(this.axis1, k).normalize();
      this.grip.copy(this.grip0).slerp(this.grip1, k);
      this.rps = this.rps0 + (this.rps1 - this.rps0) * k;
      if (k >= 1) this.blendAt = -1;
    }
    // it slows to a stop SETTLE_S after the last change (an idle aim draws nothing)
    const idle = t - this.last - SETTLE_S, slow = idle > 0 ? 1 - ease(idle / STOP_S) : 1;
    const dt = this.tPrev == null ? 0 : Math.min(0.1, Math.max(0, t - this.tPrev));
    this.tPrev = t;
    if (!still) this.angle = (this.angle + dt * this.rps * slow * Math.PI * 2) % (Math.PI * 2);
    this.ball.quaternion.setFromAxisAngle(this.axis, this.angle).multiply(this.grip);
    const fin = still ? 1 : ease((t - this.shown) / 0.12);
    const out = this.outAt != null ? 1 - ease((t - this.outAt) / OUT_S) : 1;
    this.mat.opacity = fin * out;
    if (this.outAt != null && out <= 0) this.hide();
  }

  /** Real size, and never under MIN_PX across on screen. hPx: the canvas height in CSS px. */
  orient(camera, hPx) {
    if (!this.ball.visible) return;
    const perPx = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) / Math.max(1, hPx);
    const minR = (MIN_PX / 2) * perPx * camera.position.distanceTo(this.pos);
    this.ball.scale.setScalar(2 * Math.max(this.r, minR));
  }

  /** The aim ball draws no line on the page's grid any more. */
  screen() { return null; }

  dispose() { this.scene.remove(this.ball); this.ball.geometry.dispose(); if (this.mat.map) this.mat.map.dispose(); this.mat.dispose(); }
}
