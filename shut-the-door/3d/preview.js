/* The pitch indicator: the break trail from the hand to the spot the player is aiming at, and a
 * landing marker where it crosses the plate.
 *
 * It is the intended path, never the outcome. The flight is pitch.js's own (flight() and
 * cellPoint(), the same math the real pitch flies on) with the arsenal's real velo, pfxX and pfxZ
 * from the pack, aimed at the exact point the player aims at (the cell plus at). The real pitch
 * still lands where the engine's command draw puts it, so nothing here can tell the player where
 * the ball will go. check-pitches.mjs holds the trail and the flight to one shape.
 *
 * How it moves (the console feel, mechanics only, no one's art):
 *   - a pick draws the trail from the hand toward the plate (DRAW_S), a bright head leading it;
 *   - then a comet runs down it every PULSE_S, and the landing marker breathes;
 *   - a change of pitch, or a new aim after a pause, hands off: the old trail fades (FADE_S) while
 *     the new one draws. A drag (calls closer than FOLLOW_MS) moves the trail in place;
 *   - on release it fades out fast (OUT_S), so the real ball is the star;
 *   - prefers-reduced-motion: a static trail and marker, no draw, no comet, no breathing.
 * It asks for frames only while something moves (busy()), at most 30 a second (stage.js), and
 * settles to a still picture SETTLE_S after the last change, so an idle aim costs nothing.
 *
 * The colour is the pitch's colour on the break chart and its button (PITCH_COLORS, by usage, the
 * same list as ui.js: check-pitches holds them equal): one palette, both themes, the brand's signal
 * and data blue first. A dark rim keeps it readable on the sky, the dirt and the catcher alike.
 *
 * From straight behind, a path bends mostly along the line of sight, so a faint dashed second line
 * shows what the bend is against: the same pitch with no spin, out of the same hand at the same speed
 * and angle (Statcast's pfx is over the whole flight, as pitch.js reads it). The gap between their
 * ends is the break the pitch guide prints.
 *
 * The trail and the no spin line are one mesh (one draw call), the marker a second; a handoff
 * draws the old trail for FADE_S more. Ribbons are kept a constant width on screen and drawn over
 * everything; the trail fades in from the hand so it never reads as a band near the camera.
 * Nothing is allocated per frame. screen() hands the same points to the page, in CSS px.
 */
import * as THREE from 'three';
import { flight, cellPoint } from './pitch.js?v=8';
import { FT } from './units.js?v=1';

const N = 56;
export const DRAW_S = 0.34, PULSE_S = 1.25, FADE_S = 0.2, OUT_S = 0.14, SETTLE_S = 8, FOLLOW_MS = 140;
/** The break chart's colours, in usage order (ui.js PITCH_COLORS: keep the two equal). */
export const PITCH_COLORS = ['#ff4f1f', '#2b59ff', '#8b5cf6', '#14b8a6', '#f2b827', '#ec4899', '#64748b'];

const reduced = () => { try { return !!(typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; } };
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
const ease = (x) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
// catcher's view feet into the scene, in place (units.js P without the allocation)
const put = (v, x, y, z) => v.set(-x * FT, z * FT, y * FT);
const _dir = new THREE.Vector3(), _toCam = new THREE.Vector3(), _side = new THREE.Vector3(), _v = new THREE.Vector3();

const LINE_VS = 'attribute float a; attribute float s; attribute float k; varying float vA; varying float vS; varying float vK;' +
  ' void main(){ vA = a; vS = s; vK = k; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }';
// k 0: the trail (the pitch's colour, a white hot core, a dark rim, a bright head while it draws, a
// comet after); k 1: the no spin line (faint, dashed, white). Both fade in from the hand.
const LINE_FS = 'uniform vec3 uColor; uniform float uOpacity; uniform float uDraw; uniform float uComet; uniform float uMove;' +
  ' varying float vA; varying float vS; varying float vK; void main(){' +
  ' float e = 1.0 - abs(vA * 2.0 - 1.0);' +
  ' float drawn = step(vS, uDraw);' +
  ' float fade = smoothstep(0.04, 0.4, vS);' +
  ' if (vK > 0.5) {' +
  '  float dash = step(0.38, fract(vS * 11.0));' +
  '  float c = smoothstep(0.35, 0.7, e);' +
  '  gl_FragColor = vec4(vec3(0.96), uOpacity * 0.36 * fade * dash * drawn * mix(0.35 * smoothstep(0.0, 0.35, e), 1.0, c)); return; }' +
  ' float core = smoothstep(0.55, 0.9, e), body = smoothstep(0.22, 0.5, e), rim = smoothstep(0.0, 0.22, e);' +
  ' float head = uMove * exp(-abs(uDraw - vS) * 40.0) * step(uDraw, 0.999);' +
  ' float dc = uComet - vS; float comet = uMove * (dc >= 0.0 ? exp(-dc * 9.0) : exp(dc * 60.0)) * step(0.0, uComet);' +
  ' float glow = clamp(head + comet, 0.0, 1.0);' +
  ' vec3 col = mix(vec3(0.04, 0.05, 0.08), uColor, body);' +
  ' col = mix(col, vec3(1.0), core * (0.45 + 0.55 * glow));' +
  ' float a = mix(0.45 * rim, 1.0, body) * (0.72 + 0.28 * glow);' +
  ' gl_FragColor = vec4(col, uOpacity * fade * drawn * a); }';

const MARK_VS = 'varying vec2 vUv; void main(){ vUv = uv * 2.0 - 1.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }';
// a ring in the pitch's colour with a dark edge, a faint fill, and a second ring breathing out of it
const MARK_FS = 'uniform vec3 uColor; uniform float uOpacity; uniform float uBreath; uniform float uMove; varying vec2 vUv; void main(){' +
  ' float r = length(vUv);' +
  ' float ring = smoothstep(0.075, 0.0, abs(r - 0.42));' +
  ' float edge = smoothstep(0.14, 0.06, abs(r - 0.42));' +
  ' float dot = smoothstep(0.1, 0.04, r);' +
  ' float rb = 0.42 + 0.5 * uBreath;' +
  ' float wave = uMove * smoothstep(0.06, 0.0, abs(r - rb)) * (1.0 - uBreath);' +
  ' float fill = smoothstep(0.42, 0.3, r) * 0.1;' +
  ' vec3 col = mix(vec3(0.04, 0.05, 0.08), uColor, max(ring, wave));' +
  ' col = mix(col, vec3(1.0), dot);' +
  ' float a = max(max(ring, dot), max(0.5 * edge, max(0.75 * wave, fill)));' +
  ' gl_FragColor = vec4(col, uOpacity * a); }';

/** One trail and its no spin line, as one mesh. */
class Line {
  constructor(scene, order) {
    const V = N * 4;   // two ribbons of N points, two vertices each
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(V * 3), 3));
    const a = new Float32Array(V), s = new Float32Array(V), k = new Float32Array(V), idx = [];
    for (let r = 0; r < 2; r++) {
      for (let i = 0; i < N; i++) {
        const o = (r * N + i) * 2;
        a[o] = 0; a[o + 1] = 1; s[o] = s[o + 1] = i / (N - 1); k[o] = k[o + 1] = r;
        if (i < N - 1) idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2);
      }
    }
    geo.setAttribute('a', new THREE.BufferAttribute(a, 1));
    geo.setAttribute('s', new THREE.BufferAttribute(s, 1));
    geo.setAttribute('k', new THREE.BufferAttribute(k, 1));
    geo.setIndex(idx);
    this.u = { uColor: { value: new THREE.Color(1, 1, 1) }, uOpacity: { value: 0 }, uDraw: { value: 1 }, uComet: { value: -1 }, uMove: { value: 1 } };
    this.mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({ transparent: true, depthTest: false, depthWrite: false, uniforms: this.u, vertexShader: LINE_VS, fragmentShader: LINE_FS }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = order;
    this.mesh.visible = false;
    this.pts = Array.from({ length: N }, () => new THREE.Vector3());
    this.ref = Array.from({ length: N }, () => new THREE.Vector3());
    this.end = new THREE.Vector3();
    this.t0 = 0; this.out = null;   // when it began drawing; when it began fading (null: not)
    scene.add(this.mesh);
  }

  /** Face both ribbons to the camera, a constant width on screen (px CSS px for the trail). */
  orient(camera, perPx) {
    const pos = this.mesh.geometry.attributes.position, cam = camera.position;
    for (let r = 0; r < 2; r++) {
      const pts = r ? this.ref : this.pts, px = r ? 2.0 : 4.2;
      for (let i = 0; i < N; i++) {
        const p = pts[i];
        _dir.subVectors(pts[Math.min(N - 1, i + 1)], pts[Math.max(0, i - 1)]).normalize();
        _toCam.subVectors(cam, p);
        const w = (px / 2) * perPx * _toCam.length();
        _side.crossVectors(_dir, _toCam.normalize()).normalize();
        const o = (r * N + i) * 2;
        pos.setXYZ(o, p.x - _side.x * w, p.y - _side.y * w, p.z - _side.z * w);
        pos.setXYZ(o + 1, p.x + _side.x * w, p.y + _side.y * w, p.z + _side.z * w);
      }
    }
    pos.needsUpdate = true;
  }
}

export class Ghost {
  constructor(scene) {
    this.scene = scene;
    this.lines = [new Line(scene, 9), new Line(scene, 9)];
    this.cur = 0;
    const mg = new THREE.PlaneGeometry(1, 1);
    this.mu = { uColor: { value: new THREE.Color(1, 1, 1) }, uOpacity: { value: 0 }, uBreath: { value: 0 }, uMove: { value: 1 } };
    this.marker = new THREE.Mesh(mg, new THREE.ShaderMaterial({ transparent: true, depthTest: false, depthWrite: false, uniforms: this.mu, vertexShader: MARK_VS, fragmentShader: MARK_FS }));
    this.marker.frustumCulled = false;
    this.marker.renderOrder = 10;
    this.marker.visible = false;
    scene.add(this.marker);
    this.on = false;          // shown (or drawing); false once hidden or released
    this.last = 0;            // the last set(), seconds
    this.key = null;          // the pitch type on the trail
    this.outAt = null;        // release: when the fade out began
  }

  get line() { return this.lines[this.cur]; }
  /** The trail's points and the no spin line's, scene metres (check-pitches reads them). */
  get path() { return { pts: this.line.pts }; }
  get ref() { return { pts: this.line.ref }; }

  /** The trail from the release to the aim point (a cell, plus at = [u, v] inside it), for this
      pitch (an arsenal entry: type, velo, pfxX, pfxZ) and this hitter's zone, in color (a CSS hex). */
  set({ release, pitch, cell, at, szTop, szBot, color }) {
    const t = now(), still = reduced();
    const f = flight(release, cellPoint(cell, szTop, szBot, at), pitch.velo, pitch.pfxX || 0, pitch.pfxZ || 0);
    const follow = this.on && this.outAt == null && pitch.type === this.key && (t - this.last) * 1000 < FOLLOW_MS;
    let L = this.line;
    if (!follow && this.on && this.outAt == null && !still) {
      // hand off: the old trail fades out, the new one draws on the other mesh
      L.out = t;
      this.cur = 1 - this.cur;
      L = this.line;
    } else if (!follow) {
      for (const o of this.lines) { o.out = null; o.mesh.visible = false; }
    }
    if (!follow) { L.t0 = t; L.out = null; }
    for (let i = 0; i < N; i++) {
      const tt = f.T * i / (N - 1), p = f.at(tt), d = 0.5 * tt * tt;
      put(L.pts[i], p.x, p.y, p.z);
      put(L.ref[i], p.x - f.sx * d, p.y, p.z - f.sz * d);
    }
    L.end.copy(L.pts[N - 1]);
    L.u.uColor.value.set(color || PITCH_COLORS[0]);
    this.mu.uColor.value.set(color || PITCH_COLORS[0]);
    L.mesh.visible = true;
    this.marker.visible = true;
    this.marker.position.copy(L.end);
    this.on = true; this.outAt = null; this.key = pitch.type; this.last = t;
    this.tick(t);
  }

  /** Gone at once (a new hitter, the outing over). */
  hide() {
    this.on = false; this.outAt = null; this.key = null;
    for (const o of this.lines) { o.mesh.visible = false; o.out = null; }
    this.marker.visible = false;
  }

  /** The pitch is thrown: a quick fade out of the way (instant with reduced motion). */
  release() {
    if (!this.on) return;
    if (reduced()) { this.hide(); return; }
    this.outAt = now();
  }

  get visible() { return this.on && this.outAt == null; }

  /** Still moving at time t (seconds)? The stage asks for frames only while this is true. */
  busy(t = now()) {
    if (!this.on && !this.lines.some((o) => o.mesh.visible)) return false;
    if (this.outAt != null) return true;
    if (reduced()) return false;
    return t - this.last < SETTLE_S || this.lines.some((o) => o.out != null);
  }

  /** Move every animation to time t (seconds): uniforms only. */
  tick(t = now()) {
    const still = reduced();
    const settled = !still && t - this.last >= SETTLE_S;
    const gone = this.outAt != null ? 1 - ease((t - this.outAt) / OUT_S) : 1;
    for (let i = 0; i < 2; i++) {
      const L = this.lines[i], u = L.u;
      if (!L.mesh.visible) continue;
      u.uMove.value = still || settled ? 0 : 1;
      if (L.out != null) {
        const k = 1 - ease((t - L.out) / FADE_S);
        u.uOpacity.value = 0.95 * k * gone; u.uComet.value = -1;
        if (k <= 0) { L.mesh.visible = false; L.out = null; }
        continue;
      }
      const dt = t - L.t0;
      const draw = still ? 1 : ease(dt / DRAW_S);
      u.uDraw.value = draw;
      u.uOpacity.value = 0.95 * gone;
      u.uComet.value = still || settled || dt < DRAW_S ? -1 : ((dt - DRAW_S) % PULSE_S) / PULSE_S * 1.25;
    }
    // the marker: it pops in as the trail lands, then breathes in time with the comet
    const L = this.line, dt = t - L.t0;
    const land = still ? 1 : ease((dt - DRAW_S * 0.8) / 0.18);
    const ph = still || settled || dt < DRAW_S ? 0 : (((dt - DRAW_S) % PULSE_S) / PULSE_S);
    this.mu.uBreath.value = ph;
    this.mu.uMove.value = still || settled ? 0 : 1;
    this.mu.uOpacity.value = 0.95 * land * gone;
    this.marker.scale.setScalar((0.9 + 0.18 * (1 - land)) * FT);
    if (this.outAt != null && gone <= 0) this.hide();
  }

  /** Face everything to the camera, a constant width on screen. hPx: the canvas height in CSS px. */
  orient(camera, hPx) {
    const perPx = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) / Math.max(1, hPx);
    for (const L of this.lines) if (L.mesh.visible) L.orient(camera, perPx);
    if (this.marker.visible) this.marker.quaternion.copy(camera.quaternion);
  }

  /** Both lines on the canvas, in CSS px: { path, ref }, or null when hidden. */
  screen(camera, w, h) {
    if (!this.visible) return null;
    const pr = (pts) => {
      const out = [];
      for (const p of pts) {
        _v.copy(p).project(camera);
        if (_v.z > 1) continue;
        out.push({ x: (_v.x + 1) / 2 * w, y: (1 - _v.y) / 2 * h });
      }
      return out;
    };
    return { path: pr(this.line.pts), ref: pr(this.line.ref) };
  }

  dispose() {
    for (const o of [...this.lines.map((l) => l.mesh), this.marker]) { this.scene.remove(o); o.geometry.dispose(); o.material.dispose(); }
  }
}
