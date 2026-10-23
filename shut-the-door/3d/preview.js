/* The break preview: a ghost trail from the release to the spot the player is aiming at.
 *
 * It is the intended path, never the outcome. The flight is pitch.js's own (flight() and
 * cellPoint(), the same math the real pitch flies on) with the arsenal's real velo, pfxX and pfxZ
 * from the pack, aimed at the exact point the player aims at (the cell plus at). The real pitch
 * still lands where the engine's command draw puts it, so nothing here can tell the player where
 * the ball will go. check-pitches.mjs holds the two to one shape.
 *
 * From straight behind, a path that bends mostly bends along the line of sight, so a second, fainter
 * line shows what the bend is against: the same pitch with no spin, out of the same hand at the same
 * speed and angle (Statcast's pfx is measured over the whole flight, as pitch.js reads it), which
 * ends pfx inches from the spot. The two leave the hand together and split toward the plate, and the
 * gap between their ends is the break the pitch guide prints.
 *
 * Each line is a ribbon kept a constant width on screen (its width grows with the distance from the
 * camera), drawn over everything, so it reads as a thin quiet line near the plate and never as a fat
 * band near the camera. screen() hands the same points to the page, in CSS px, for the thin lines
 * the game draws on its own grid.
 */
import * as THREE from 'three';
import { flight, cellPoint } from './pitch.js?v=8';
import { P } from './units.js?v=1';

const N = 56;

class Ribbon {
  /** px: width on screen in CSS px; op: opacity; fadeIn: fade in over the first part; dashes: along it */
  constructor(scene, { px, op, fadeIn, dashes, order }) {
    this.px = px;
    this.pts = [];
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 2 * 3), 3));
    geo.setAttribute('a', new THREE.BufferAttribute(new Float32Array(N * 2), 1));
    geo.setAttribute('s', new THREE.BufferAttribute(new Float32Array(N * 2), 1));
    const idx = [];
    for (let i = 0; i < N - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    geo.setIndex(idx);
    const a = geo.attributes.a, s = geo.attributes.s;
    for (let i = 0; i < N; i++) { a.setX(i * 2, 0); a.setX(i * 2 + 1, 1); s.setX(i * 2, i / (N - 1)); s.setX(i * 2 + 1, i / (N - 1)); }
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthTest: false, depthWrite: false,
      uniforms: { uOpacity: { value: op }, uFade: { value: fadeIn ? 1 : 0 }, uDash: { value: dashes } },
      vertexShader: 'attribute float a; attribute float s; varying float vA; varying float vS; void main(){ vA = a; vS = s; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      // a light core with a dark rim (it reads on the sky, the dirt and the catcher alike), broken
      // into dashes so it reads as a ghost and not as the ball's own trail
      fragmentShader: 'uniform float uOpacity; uniform float uFade; uniform float uDash; varying float vA; varying float vS; void main(){' +
        ' float e = 1.0 - abs(vA * 2.0 - 1.0);' +
        ' float core = smoothstep(0.42, 0.62, e);' +
        ' float rim = smoothstep(0.0, 0.3, e);' +
        ' float dash = 0.5 + 0.5 * step(0.32, fract(vS * uDash));' +
        ' float fade = mix(1.0, smoothstep(0.08, 0.55, vS), uFade);' +
        ' vec3 c = mix(vec3(0.05, 0.06, 0.09), vec3(1.0, 0.97, 0.9), core);' +
        ' gl_FragColor = vec4(c, uOpacity * fade * dash * mix(0.4 * rim, 1.0, core)); }',
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = order;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  orient(camera, hPx) {
    if (!this.mesh.visible || !this.pts.length) return;
    const pos = this.mesh.geometry.attributes.position, cam = camera.position, pts = this.pts;
    const perPx = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) / Math.max(1, hPx);
    const dir = new THREE.Vector3(), toCam = new THREE.Vector3(), side = new THREE.Vector3();
    for (let i = 0; i < N; i++) {
      const p = pts[i];
      dir.subVectors(pts[Math.min(N - 1, i + 1)], pts[Math.max(0, i - 1)]).normalize();
      toCam.subVectors(cam, p);
      const w = (this.px / 2) * perPx * toCam.length();
      side.crossVectors(dir, toCam.normalize()).normalize();
      pos.setXYZ(i * 2, p.x - side.x * w, p.y - side.y * w, p.z - side.z * w);
      pos.setXYZ(i * 2 + 1, p.x + side.x * w, p.y + side.y * w, p.z + side.z * w);
    }
    pos.needsUpdate = true;
  }

  screen(camera, w, h) {
    const out = [], v = new THREE.Vector3();
    for (const p of this.pts) {
      v.copy(p).project(camera);
      if (v.z > 1) continue;
      out.push({ x: (v.x + 1) / 2 * w, y: (1 - v.y) / 2 * h });
    }
    return out;
  }

  dispose(scene) { scene.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh.material.dispose(); }
}

export class Ghost {
  constructor(scene) {
    this.scene = scene;
    this.path = new Ribbon(scene, { px: 3.2, op: 0.85, fadeIn: true, dashes: 22, order: 9 });
    this.ref = new Ribbon(scene, { px: 2.0, op: 0.4, fadeIn: true, dashes: 9, order: 8 });
  }

  /** The path from the release to the aim point (a cell, plus at = [u, v] inside it), for this
      pitch (an arsenal entry: velo, pfxX, pfxZ) and this hitter's zone, and the same pitch with no
      spin out of the same hand. */
  set({ release, pitch, cell, at, szTop, szBot }) {
    const f = flight(release, cellPoint(cell, szTop, szBot, at), pitch.velo, pitch.pfxX || 0, pitch.pfxZ || 0);
    this.path.pts = [];
    this.ref.pts = [];
    for (let i = 0; i < N; i++) {
      const t = f.T * i / (N - 1), p = f.at(t), d = 0.5 * t * t;
      this.path.pts.push(P(p.x, p.y, p.z));
      this.ref.pts.push(P(p.x - f.sx * d, p.y, p.z - f.sz * d));
    }
    this.path.mesh.visible = this.ref.mesh.visible = true;
  }

  hide() { this.path.mesh.visible = this.ref.mesh.visible = false; }
  get visible() { return this.path.mesh.visible; }

  /** Face the ribbons to the camera, a constant width on screen. hPx: the canvas height in CSS px. */
  orient(camera, hPx) { this.path.orient(camera, hPx); this.ref.orient(camera, hPx); }

  /** Both lines on the canvas, in CSS px: { path, ref }, or null when hidden. */
  screen(camera, w, h) {
    if (!this.visible) return null;
    return { path: this.path.screen(camera, w, h), ref: this.ref.screen(camera, w, h) };
  }

  dispose() { this.path.dispose(this.scene); this.ref.dispose(this.scene); }
}
