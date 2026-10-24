/* One pitch: release, flight, the plate, the glove.
 *
 * The flight is Statcast's own model of a pitch: the 9 parameter fit is a constant acceleration in
 * each axis (x(t) = x0 + vx0 t + ax t^2 / 2, the same for y and z), and that is what flight() is.
 * Catcher's view, feet: x toward the catcher's right (the first base side), y toward the mound, z up.
 * ax and az come from the arsenal's real pfx (the pack's pfxX and pfxZ, inches): Statcast's pfx is the
 * spin's push measured over the whole flight, so ax = 2 pfx / T^2 for the flight time T (fitted on
 * real 2024 and 2025 Statcast pitches: pfx sits within about 10% of ax T^2 / 2 from the release,
 * and the old reading, over the last 40 ft only, gave 60% of it and drew every break 1.6x too big).
 * az adds gravity. ay is the drag: about 8% of the speed is gone by the plate (real ay is 25 to 34
 * ft/s^2). vx0 and vz0 are solved so the ball crosses the front of the plate exactly on the given
 * point: the engine's actual for a thrown pitch, the aim point for the preview (preview.js), so both
 * draw one shape. Arm side or glove side is the sign of pfxX and nothing else (a righty's arm side is
 * x < 0); the pitcher's view mirror comes from the camera through P().
 *
 * The release point is the pitcher's own when the pack carries it (facts.release); today it is a
 * stand in for his hand (releaseOf). In the lab the aimed cell and the miss are a sample (play.js,
 * labelled so); in the game they are the engine's. Cells follow CONTRACT.md section 2, catcher's view.
 * After the plate the ball goes where the play sends it: into the glove, off the bat (the real exit
 * velocity, launch angle and spray), off the dirt, off the hitter.
 */
import * as THREE from 'three';
import { P, FT, smooth, clamp01 } from './units.js?v=1';
import * as G from './gear3d.js?v=3';

const G_FT = 32.17;
export const T_RELEASE = 0.8;

/** Contract section 2: a cell's centre, moved by the free aim point at = [u, v] inside it
    (contract.js aimPoint: x + u * 0.553 ft, zn + v / 3), catcher's view, x in feet, z in feet for
    this batter. No at: the centre. */
export function cellPoint(cell, szTop, szBot, at) {
  const r = Math.floor(cell / 5), c = cell % 5;
  const u = at ? clampAim(at[0]) : 0, v = at ? clampAim(at[1]) : 0;
  const x = (c - 2 + u) * 0.553;
  const zn = (3.5 - r + v) / 3; // row 0: 7/6, row 1: 5/6, row 2: 1/2, row 3: 1/6, row 4: -1/6
  return { x, z: szBot + zn * (szTop - szBot) };
}
const clampAim = (k) => (Number.isFinite(k) ? Math.max(-0.5, Math.min(0.5, k)) : 0);

/** Where his hand lets the ball go, catcher's view feet. His own when the pack carries it (release
    { x, z, ext }: Statcast's release_pos_x, release_pos_z and release_extension, the plate's back
    tip 60.5 ft from the rubber); until then a typical release for his hand, labelled so: a lefty
    lets go on the first base side (x > 0), a righty on the third base side. */
export function releaseOf(p) {
  const r = p.release;
  if (r && [r.x, r.z, r.ext].every(Number.isFinite)) return { x: r.x, y: 60.5 - r.ext, z: r.z, assumed: null };
  // PITCHf/x seasons (before 2015) have the point but no extension: his point, a typical extension
  if (r && [r.x, r.z].every(Number.isFinite)) return { x: r.x, y: 54.0, z: r.z, assumed: 'a typical extension (none tracked)' };
  return { x: p.throws === 'L' ? 1.9 : -1.9, y: 54.0, z: 5.6, assumed: 'a stand in release for his hand' };
}

/** The flight from rel (release, feet) to plate (the crossing point at the front of the plate), at
    velo mph out of the hand, with pfxX and pfxZ inches of spin movement over the whole flight. */
export function flight(rel, plate, velo, pfxX, pfxZ) {
  const yPlate = 17 / 12;
  const v0 = velo * 1.46667, v1 = v0 * 0.92;
  const dist = rel.y - yPlate;
  const T = dist / ((v0 + v1) / 2);
  const ay = (v1 - v0) / T;                   // deceleration along y (toward the plate is -y)
  // the spin's push, constant over the flight, sized so it moves the ball pfx against no spin
  const sx = 2 * (pfxX / 12) / (T * T), sz = 2 * (pfxZ / 12) / (T * T);
  const ax = sx, az = sz - G_FT;
  const vx = (plate.x - rel.x - 0.5 * ax * T * T) / T;
  const vz = (plate.z - rel.z - 0.5 * az * T * T) / T;
  const at = (t) => ({
    x: rel.x + vx * t + 0.5 * ax * t * t,
    y: rel.y - v0 * t - 0.5 * ay * t * t,
    z: rel.z + vz * t + 0.5 * az * t * t,
  });
  return { T, at, ax, az, vx, vz, sx, sz };
}

export class Pitch {
  /** play: see play.js (call, actual, velo); batter: the hitter's facts (zone); m: motion(play). */
  /** opts.overlays false: no aimed and actual markers and no trail. opts.grid false: no 3D grid (the
      game draws its own, while aiming only); it follows overlays unless given. */
  constructor({ scene, facts, play, batter, m, overlays = true, grid = overlays }) {
    this.scene = scene;
    this.overlays = overlays;
    const a = facts.pitcher.arsenal.find((x) => x.type === play.call.type) || facts.pitcher.arsenal[0];
    this.p = { ...a, aimCell: play.call.cell, velo: play.velo ?? a.velo };
    this.play = play; this.m = m || { ball: 'glove' };
    const { szTop, szBot } = batter;
    const aim = cellPoint(play.call.cell, szTop, szBot, play.call.at);
    this.aim = aim;
    this.actual = { x: play.actual.x, z: play.actual.z };
    // the movement of the pitch he threw: the engine's (its effort slice, play.pfxX) or his average
    this.f = flight(facts.release, this.actual, this.p.velo, play.pfxX ?? a.pfxX, play.pfxZ ?? a.pfxZ);
    // the glove: about 3 ft behind the front of the plate, out in front of the catcher's knees
    const yGlove = -1.45;
    const tg = this.timeAtY(yGlove);
    this.tg = tg;
    this.retime(T_RELEASE);
    const g = this.f.at(tg);
    this.catchPoint = P(g.x, Math.max(g.y, yGlove), Math.max(g.z, 0.25));
    const ga = { x: aim.x, z: aim.z + (g.z - this.actual.z) * 0.6 };
    this.aimGlove = P(ga.x, yGlove, ga.z);
    this.after = null;                       // the ball's path after the plate (setAfter)
    this.ball = G.baseball();
    this.ball.visible = false;
    scene.add(this.ball);
    this.buildTracer();
    this.buildMarkers();
    this.buildGrid(batter);
    if (!grid) for (const o of this.grid) o.visible = false;
    if (!overlays) for (const o of [this.aimRing, this.hitDot, this.tracer]) o.visible = false;
    this.spin = new THREE.Vector3(1, 0, 0);
    // backspin for the riding pitches, topspin for the drops, little for a splitter
    const sh = a.shape;
    this.spinRate = (sh === 'drop' ? -2400 : sh === 'split' ? 1300 : sh === 'slide' || sh === 'sweep' ? 2500 : 2300) / 60 * Math.PI * 2;
    this.bounce = this.m.ball === 'dirt' ? this.dirtPath() : null;
  }

  /** A pitch in the dirt: it lands short of the plate, kicks up and goes into the catcher's chest. */
  dirtPath() {
    let lo = 0, hi = this.f.T;
    for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (this.f.at(mid).z > 0.12) lo = mid; else hi = mid; }
    const tb = (lo + hi) / 2, b = this.f.at(tb), b2 = this.f.at(tb + 0.001);
    const v = { x: (b2.x - b.x) / 0.001 * 0.75, y: (b2.y - b.y) / 0.001 * 0.7, z: -(b2.z - b.z) / 0.001 * 0.42 };
    return { tb, b, v };
  }

  /** The ball's path after the plate: off the bat, back into the screen, off the hitter. contact
      is the flight time it is met at; path(dt) gives catcher view feet dt after that. */
  setAfter(kind, contactT, opts = {}) {
    const c = this.f.at(contactT);
    const ip = opts.inPlay || {};
    const mph = (v) => v * 1.46667;
    let ev, la, spray;
    if (kind === 'play') { ev = ip.ev ?? 85; la = ip.la ?? 10; spray = ip.spray ?? 0; }
    else if (kind === 'back') { ev = 65; la = 62; spray = 180 + (opts.lefty ? -12 : 12); }
    else if (kind === 'pulled') { ev = ip.ev ?? 80; la = ip.la ?? 8; spray = (opts.lefty ? 1 : -1) * 54; }
    else if (kind === 'hbp') {
      // off his body: it drops away toward the pitcher's side of the plate
      const side = opts.lefty ? -1 : 1;     // away from the hitter, catcher's view x
      this.after = { t0: contactT, c, vel: { x: side * 5, y: 7, z: 4 }, ground: false };
      return;
    } else return;
    const v = mph(ev), D = Math.PI / 180;
    const vel = { x: v * Math.cos(la * D) * Math.sin(spray * D), y: v * Math.cos(la * D) * Math.cos(spray * D), z: v * Math.sin(la * D) };
    const ground = kind === 'play' && (ip.bb === 'ground' || la < 2);
    this.after = { t0: contactT, c, vel, ground };
  }

  afterAt(dt) {
    const { c, vel, ground } = this.after;
    // drag: the speed falls about a third over the first two seconds
    const k = 0.2, s = (1 - Math.exp(-k * dt)) / k;
    let x = c.x + vel.x * s, y = c.y + vel.y * s, z = c.z + vel.z * s - 16.1 * dt * dt;
    if (z < 0.12) {
      // on the ground: it bounces lower each time and rolls (a few hops, then along the grass)
      let tt = 0, pz = c.z, vz = vel.z, vx = vel.x, vy = vel.y, px = c.x, py = c.y, left = dt;
      for (let hop = 0; hop < 6 && left > 0; hop++) {
        const a = -16.1, disc = vz * vz - 4 * a * (pz - 0.12);
        const th = (-vz - Math.sqrt(Math.max(0, disc))) / (2 * a);
        if (th >= left || !(th > 0)) { px += vx * left; py += vy * left; pz = Math.max(0.12, pz + vz * left + a * left * left); left = 0; break; }
        px += vx * th; py += vy * th; pz = 0.12; vz = -(vz + 2 * a * th) * (ground ? 0.38 : 0.3); vx *= 0.82; vy *= 0.82; left -= th;
      }
      if (left > 0) { px += vx * left; py += vy * left; }
      x = px; y = py; z = pz;
      void tt;
    }
    return { x, y, z };
  }

  /** Take this pitch's ball, trail, grid and markers out of the scene (the next pitch has its own). */
  dispose() {
    for (const o of [this.ball, this.tracer, this.aimRing, this.hitDot, ...(this.grid || [])]) {
      if (!o) continue;
      this.scene.remove(o);
      o.traverse((x) => { if (x.geometry) x.geometry.dispose(); if (x.material && x.material.map && x.material.map.isCanvasTexture) x.material.map.dispose(); if (x.material) x.material.dispose(); });
    }
  }

  /** Move the whole pitch in time: release at tRel (the pitcher's capture sets it). */
  retime(tRel) {
    this.tRel = tRel;
    this.tPlate = tRel + this.f.T;
    this.tCatch = tRel + this.tg;
  }

  timeAtY(y) {
    let lo = 0, hi = this.f.T * 1.3;
    for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (this.f.at(m).y > y) lo = m; else hi = m; }
    return (lo + hi) / 2;
  }

  /** The ball t seconds after release: in flight, off the bat, or off the dirt. */
  ballAt(t) {
    if (this.after && t > this.after.t0) { const s = this.afterAt(t - this.after.t0); return P(s.x, s.y, s.z); }
    if (this.bounce && t > this.bounce.tb) {
      const { tb, b, v } = this.bounce, d = t - tb;
      const z = Math.max(0.12, b.z + v.z * d - 16.1 * d * d);
      return P(b.x + v.x * d, Math.max(b.y + v.y * d, -1.9), z);
    }
    return this.pointAt(t);
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
    this.tracer.material.uniforms.uOpacity.value = t > this.tRel + (this.lens ? this.lens.join : 0) ? 0.55 * fade : 0;
    const pos = this.tracer.geometry.attributes.position, a = this.tracer.geometry.attributes.a;
    const cam = camera.position;
    // (the trail starts where the ball joins its own path, under the first person lens)
    const tStart = Math.max(this.lens ? this.lens.join : 0, tf - this.f.T * 1.0);
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

  /** The 5x5 target grid (contract section 2) on the front plane of the plate, in catcher's view
      coordinates through P(): the pitcher's view mirror comes from the camera. Faint, shown only
      while aiming, gone before the ball leaves the hand. The aimed cell is filled a touch. */
  buildGrid({ szTop, szBot }) {
    const yF = 17 / 12, cw = 0.553, h = (szTop - szBot) / 3;
    const xs = [-2.5, -1.5, -0.5, 0.5, 1.5, 2.5].map((k) => k * cw);
    const zs = [-1, 0, 1, 2, 3, 4].map((k) => szBot + k * h);
    const pts = [], zone = [];
    for (const x of xs) pts.push(P(x, yF, zs[0]), P(x, yF, zs[5]));
    for (const z of zs) pts.push(P(xs[0], yF, z), P(xs[5], yF, z));
    const zx = [xs[1], xs[4]], zz = [zs[1], zs[4]];
    zone.push(P(zx[0], yF, zz[0]), P(zx[1], yF, zz[0]), P(zx[1], yF, zz[0]), P(zx[1], yF, zz[1]),
      P(zx[1], yF, zz[1]), P(zx[0], yF, zz[1]), P(zx[0], yF, zz[1]), P(zx[0], yF, zz[0]));
    const mk = (arr, op) => {
      const l = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(arr),
        new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthTest: false, depthWrite: false }));
      l.userData.op = op; l.renderOrder = 7; this.scene.add(l); return l;
    };
    this.grid = [mk(pts, 0.22), mk(zone, 0.5)];
    const r = Math.floor(this.p.aimCell / 5), c = this.p.aimCell % 5;
    const x0 = xs[c], x1 = xs[c + 1], z1 = zs[5 - r], z0 = zs[4 - r];
    const cell = new THREE.Mesh(new THREE.BufferGeometry().setFromPoints([P(x0, yF, z0), P(x1, yF, z0), P(x1, yF, z1), P(x0, yF, z0), P(x1, yF, z1), P(x0, yF, z1)]),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthTest: false, depthWrite: false, side: THREE.DoubleSide }));
    cell.userData.op = 0.14; cell.renderOrder = 7; this.scene.add(cell);
    this.grid.push(cell);
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
    // in the air until the glove has it; off the bat or off the dirt it flies on, out of the frame
    const free = this.after || this.bounce;
    const end = free ? this.tRel + 6 : this.tCatch + 0.02;
    const inFlight = t >= this.tRel && t <= end;
    const inHand = t < this.tRel && this.handPoint;
    this.ball.visible = inFlight || !!inHand;
    if (this.hidden && t > this.hidden) this.ball.visible = false;
    if (inHand) this.ball.position.copy(this.handPoint());
    if (inFlight) {
      const tt = t - this.tRel;
      this.ball.position.copy(free ? this.ballAt(tt) : this.pointAt(Math.min(tt, this.tCatch - this.tRel)));
      this.ball.rotation.x = tt * this.spinRate;
      // the first person lens (firstperson.js): out of his hand, the ball is drawn from where his
      // hand is on screen onto its own path, which it joins at lens.join (well before the plate)
      if (this.lens) { this.ball.scale.setScalar(1); if (camera && tt < this.lens.join) this.lens.place(tt, this.ball, camera); }
    }
    if (camera) {
      this.updateTracer(t, camera);
      for (const m of [this.aimRing, this.hitDot]) m.lookAt(camera.position);
    }
    // aiming: the grid is up until a beat before release, then gone for the pitch
    const aiming = 1 - smooth(clamp01((t - (this.tRel - 0.45)) / 0.25));
    for (const g of this.grid) g.material.opacity = g.userData.op * aiming;
    if (!this.overlays) return;
    const show = 1 - smooth(clamp01((t - this.tPlate - 1.0) / 0.7));
    this.aimRing.material.opacity = 0.42 * smooth(clamp01(t / 0.4)) * show;
    this.hitDot.material.opacity = 0.8 * smooth(clamp01((t - this.tPlate) / 0.08)) * show;
  }
}
