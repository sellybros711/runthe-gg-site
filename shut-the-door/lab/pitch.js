/* One pitch: release, flight, the plate, the glove.
 *
 * The flight uses the arsenal's real numbers from the pack (velo and pfx, through assets/pitch.json):
 * the spin's push is a constant acceleration sized so the pitch moves pfx inches against a spinless
 * pitch over its last 40 ft (Statcast's definition), gravity on top, and drag takes about 8% of the
 * speed by the plate. The release point is a stand in (not in the pack). The aimed cell and the miss
 * are a sample, labelled so in pitch.json. Cells follow CONTRACT.md section 2, catcher's view.
 */
import * as THREE from 'three';
import { P, FT, smooth, clamp01 } from './units.js';
import * as G from './gear3d.js';

const G_FT = 32.17;
export const T_RELEASE = 0.8;

/** Contract section 2: a cell's centre, catcher's view, x in feet, z in feet for this batter. */
export function cellPoint(cell, szTop, szBot) {
  const r = Math.floor(cell / 5), c = cell % 5;
  const x = (c - 2) * 0.553;
  const zn = (3.5 - r) / 3; // row 0: 7/6, row 1: 5/6, row 2: 1/2, row 3: 1/6, row 4: -1/6
  return { x, z: szBot + zn * (szTop - szBot) };
}

export function flight(rel, plate, velo, pfxX, pfxZ) {
  const yPlate = 17 / 12;
  const v0 = velo * 1.46667, v1 = v0 * 0.92;
  const dist = rel.y - yPlate;
  const T = dist / ((v0 + v1) / 2);
  const ay = (v1 - v0) / T;                   // deceleration along y (toward the plate is -y)
  // time spent in the last 40 ft
  const tAt = (y) => { // solve rel.y - v0 t - 0.5 ay t^2 = y  (ay < 0 slows it)
    const a = -0.5 * ay, b = -v0, c = rel.y - y; // a t^2 + b t + c = 0 with motion toward -y
    const disc = b * b - 4 * a * c;
    return (-b - Math.sqrt(Math.max(0, disc))) / (2 * a);
  };
  const t40 = T - tAt(40);
  const sx = 2 * (pfxX / 12) / (t40 * t40), sz = 2 * (pfxZ / 12) / (t40 * t40);
  const ax = sx, az = sz - G_FT;
  const vx = (plate.x - rel.x - 0.5 * ax * T * T) / T;
  const vz = (plate.z - rel.z - 0.5 * az * T * T) / T;
  const at = (t) => ({
    x: rel.x + vx * t + 0.5 * ax * t * t,
    y: rel.y - v0 * t - 0.5 * ay * t * t,
    z: rel.z + vz * t + 0.5 * az * t * t,
  });
  return { T, at, ax, az, vx, vz };
}

export class Pitch {
  constructor({ scene, facts, mode }) {
    this.scene = scene;
    const p = facts.pitches[mode === 'take' ? 'take' : 'swing'];
    this.p = p;
    const { szTop, szBot } = facts.batter;
    const aim = cellPoint(p.aimCell, szTop, szBot);
    this.aim = aim;
    this.actual = { x: aim.x + p.missFt.x, z: aim.z + p.missFt.z };
    this.f = flight(facts.release, this.actual, p.velo, p.pfxX, p.pfxZ);
    this.tRel = T_RELEASE;
    this.tPlate = this.tRel + this.f.T;
    // the glove: about 2.4 ft behind the front of the plate, where the catcher meets it
    const yGlove = -2.0;
    const tg = this.timeAtY(yGlove);
    this.tCatch = this.tRel + tg;
    const g = this.f.at(tg);
    this.catchPoint = P(g.x, g.y, g.z);
    const ga = { x: aim.x, z: aim.z + (g.z - this.actual.z) * 0.6 };
    this.aimGlove = P(ga.x, yGlove, ga.z);
    this.ball = G.baseball();
    this.ball.visible = false;
    scene.add(this.ball);
    this.buildTracer();
    this.buildMarkers();
    this.spin = new THREE.Vector3(1, 0, 0);
    // backspin for the splitter (little of it), topspin for the curveball
    this.spinRate = (p.type === 'CU' ? -2400 : p.type === 'FS' ? 1300 : 2300) / 60 * Math.PI * 2;
  }

  timeAtY(y) {
    let lo = 0, hi = this.f.T * 1.3;
    for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (this.f.at(m).y > y) lo = m; else hi = m; }
    return (lo + hi) / 2;
  }

  pointAt(t) { const s = this.f.at(t); return P(s.x, s.y, s.z); }

  buildTracer() {
    const N = 64;
    this.N = N;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 2 * 3), 3));
    geo.setAttribute('a', new THREE.BufferAttribute(new Float32Array(N * 2), 1));
    const idx = [];
    for (let i = 0; i < N - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    geo.setIndex(idx);
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uOpacity: { value: 0 }, uColor: { value: new THREE.Color(1.0, 0.86, 0.55) } },
      vertexShader: 'attribute float a; varying float vA; void main(){ vA = a; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform float uOpacity; uniform vec3 uColor; varying float vA; void main(){ float e = 1.0 - abs(vA * 2.0 - 1.0); gl_FragColor = vec4(uColor * e * uOpacity, 1.0); }',
    });
    // a = across the ribbon (0..1) times the fade along it; packed as across + along in one float is
    // not enough, so the fade lives in the width: the ribbon narrows toward its tail
    this.tracer = new THREE.Mesh(geo, mat);
    this.tracer.frustumCulled = false;
    this.tracer.renderOrder = 5;
    this.scene.add(this.tracer);
  }

  updateTracer(t, camera) {
    const tf = clamp01((t - this.tRel) / this.f.T) * this.f.T;
    const fade = 1 - smooth(clamp01((t - this.tPlate - 0.9) / 0.8));
    this.tracer.material.uniforms.uOpacity.value = t > this.tRel ? 0.55 * fade : 0;
    const pos = this.tracer.geometry.attributes.position, a = this.tracer.geometry.attributes.a;
    const cam = camera.position;
    const tStart = Math.max(0, tf - this.f.T * 1.0);
    for (let i = 0; i < this.N; i++) {
      const s = i / (this.N - 1);
      const tt = tStart + (tf - tStart) * s;
      const p = this.pointAt(tt);
      const p2 = this.pointAt(tt + 0.002);
      const dir = p2.sub(p).normalize();
      const toCam = cam.clone().sub(p).normalize();
      const side = new THREE.Vector3().crossVectors(dir, toCam).normalize();
      const w = 0.012 * (0.35 + 0.65 * s);
      pos.setXYZ(i * 2, p.x - side.x * w, p.y - side.y * w, p.z - side.z * w);
      pos.setXYZ(i * 2 + 1, p.x + side.x * w, p.y + side.y * w, p.z + side.z * w);
      a.setX(i * 2, 0); a.setX(i * 2 + 1, 1);
    }
    pos.needsUpdate = true; a.needsUpdate = true;
  }

  buildMarkers() {
    // aimed: a thin ring. Actual: a small solid dot. Both on the front plane of the plate.
    const yF = 17 / 12;
    const ringM = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false });
    this.aimRing = new THREE.Mesh(new THREE.RingGeometry(0.035, 0.042, 40), ringM);
    this.aimRing.position.copy(P(this.aim.x, yF, this.aim.z));
    const dotM = new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0, depthWrite: false });
    this.hitDot = new THREE.Mesh(new THREE.CircleGeometry(0.022, 24), dotM);
    this.hitDot.position.copy(P(this.actual.x, yF, this.actual.z));
    for (const m of [this.aimRing, this.hitDot]) { m.renderOrder = 6; this.scene.add(m); }
  }

  update(t, camera) {
    const inFlight = t >= this.tRel && t <= this.tCatch + 0.02;
    this.ball.visible = inFlight;
    if (inFlight) {
      const tt = t - this.tRel;
      this.ball.position.copy(this.pointAt(Math.min(tt, this.tCatch - this.tRel)));
      this.ball.rotation.x = tt * this.spinRate;
    }
    if (camera) {
      this.updateTracer(t, camera);
      for (const m of [this.aimRing, this.hitDot]) m.lookAt(camera.position);
    }
    const show = 1 - smooth(clamp01((t - this.tPlate - 1.0) / 0.7));
    this.aimRing.material.opacity = 0.42 * smooth(clamp01(t / 0.4)) * show;
    this.hitDot.material.opacity = 0.8 * smooth(clamp01((t - this.tPlate) / 0.08)) * show;
  }
}
