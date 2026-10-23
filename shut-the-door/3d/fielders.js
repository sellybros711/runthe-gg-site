/* The nine fielders and the runners, for the ball in play: light bodies, posed by hand.
 *
 * One body is built once from the catcher's skinned meshes (the same MakeHuman body, rigged the same
 * way): skin, hair, the uniform, the undershirt, socks, belt and shoes merged into ONE skinned mesh,
 * a cap and a glove baked on as rigid parts of it (weighted to the head and the hand). Each figure is
 * that one geometry on its own skeleton, drawn in one draw call with one shared shader: the colour of
 * each part comes from the figure's kit (people.js kitFor: the closer's club for the fielders, the
 * hitters' club for the runners). Eyes, brows and the jersey's words are left off: at broadcast
 * distance they are a pixel or two. Shadows are soft blobs on the grass (the sun's shadow map covers
 * the plate only).
 *
 * The motion (crew.setMotion, assets/fielder.glb, built by lab/pipeline/build_people.py 'fielder'):
 *   the run      Mixamo's Jog Forward, Fast Run and Sprint (the owner's downloads), blended by speed,
 *                in place (the clip's own travel taken out), the stride's phase advanced by the
 *                distance covered, so the feet move as far as the body does
 *   standing     a little of Mixamo's Baseball Milling Idle on the trunk, arms and head
 *   the throw    the trunk and arms of the CMU Graphics Lab's baseball pitch (subject 124, take 1),
 *                its release on the plan's release, quickened for a fielder
 * and procedural posing for everything Mixamo has no clip of: the ready crouch, fielding a grounder,
 * a catch (two bone IK puts the glove's pocket on the ball), taking a throw, a tag, a dive, a leap at
 * the wall, a slide, the legs' stride in a throw. Without the clips the run and the throw are
 * procedural too. Every pose is a pure function of the plan's time, so slow motion and a skip land
 * on the same frame.
 *
 *   const crew = new Crew(scene, catcherPerson)
 *   const f = crew.figure()            a new body (hidden), crew.dress(f, kit, { tone, glove, helmet })
 *   f.place(x, y, yaw, lift)           field feet, yaw in radians (0 faces centre field)
 *   f.pose(spec)                       see Figure.pose
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { aimBone, twoBoneIK, wpos } from './rig.js?v=1';
import { P, FT } from './units.js?v=1';

const PART = { skin: 0, hair: 1, uniform: 2, trim: 3, shoes: 4, belt: 5, cap: 6, gloveL: 7, gloveR: 8, brim: 9 };
const NPART = 10;
const HEIGHT_M = 1.86;                 // a fielder, 6 ft 1
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const lerpV = (a, b, k) => a.clone().lerp(b, k);
const dirL = (a, b, k) => a.clone().lerp(b, k).normalize();

/** What a mesh of the loaded body is, from its material (people.js loadPerson renamed them). */
function partOf(o) {
  const n = (o.material && o.material.name || '').toLowerCase(), part = o.userData.part;
  if (n.includes('eye') || n.includes('lash') || n.includes('brow') || part === 'number' || part === 'gloves') return null;
  if (n === 'skin') return PART.skin;
  if (part === 'uniform') return PART.uniform;
  if (part === 'socks' || part === 'undershirt') return PART.trim;
  if (part === 'belt') return PART.belt;
  if (n.includes('hair') || n.includes('short')) return PART.hair;
  return PART.shoes;
}

/** A rigid piece on one bone, as merged geometry: position and normal in skeleton space. */
function rigid(geo, bone, part) {
  geo = geo.index ? geo : geo;
  const n = geo.attributes.position.count;
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint16Array(n * 4).map((_, i) => (i % 4 === 0 ? bone : 0)), 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(new Float32Array(n * 4).map((_, i) => (i % 4 === 0 ? 1 : 0)), 4));
  geo.setAttribute('part', new THREE.Float32BufferAttribute(new Float32Array(n).fill(part), 1));
  geo.deleteAttribute('uv');
  return geo;
}

/** The shared body: one geometry, the bind skeleton, the measurements the poses need. */
function buildTemplate(person) {
  const meshes = person.meshes.filter((m) => m.isSkinnedMesh);
  const sk = meshes[0].skeleton;
  const bindM = meshes[0].bindMatrix.clone();
  const names = sk.bones.map((b) => b.name);
  const index = Object.fromEntries(names.map((n, i) => [n, i]));
  const parts = [];
  for (const m of meshes) {
    const part = partOf(m);
    if (part == null) continue;
    const g = new THREE.BufferGeometry();
    const src = m.geometry;
    // meshopt stores positions and normals quantized: read them out as plain floats
    const f32 = (a) => { const o = new Float32Array(a.count * 3); for (let i = 0; i < a.count; i++) { o[i * 3] = a.getX(i); o[i * 3 + 1] = a.getY(i); o[i * 3 + 2] = a.getZ(i); } return new THREE.Float32BufferAttribute(o, 3); };
    g.setAttribute('position', f32(src.attributes.position));
    g.setAttribute('normal', f32(src.attributes.normal));
    // skinIndex comes as whatever type glTF stored; one type for the merge
    const si = src.attributes.skinIndex, sw = src.attributes.skinWeight;
    const siA = new Uint16Array(si.count * 4), swA = new Float32Array(sw.count * 4);
    for (let i = 0; i < si.count; i++) for (let k = 0; k < 4; k++) { siA[i * 4 + k] = si.getComponent(i, k); swA[i * 4 + k] = sw.getComponent(i, k); }
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(siA, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(swA, 4));
    g.setAttribute('part', new THREE.Float32BufferAttribute(new Float32Array(si.count).fill(part), 1));
    g.setIndex(src.index ? new THREE.Uint32BufferAttribute(Uint32Array.from(src.index.array), 1) : null);
    g.applyMatrix4(m.bindMatrix);              // into skeleton space
    parts.push(g);
  }
  // the bones' bind pose in skeleton space, from the inverse bind matrices. gltfpack quantizes the
  // positions (the skeleton space is then in its integer units): everything is brought to metres
  // here (a 1.8 m body), so the glove, the cap and every offset below can be said in metres
  let world = sk.boneInverses.map((m) => m.clone().invert());
  const box0 = new THREE.Box3();
  for (const g of parts) { g.computeBoundingBox(); box0.union(g.boundingBox); }
  const S = 1.8 / (box0.max.y - box0.min.y);
  const Sm = new THREE.Matrix4().makeScale(S, S, S);
  for (const g of parts) g.applyMatrix4(Sm);
  // (the skeleton space scaled: every bone's frame keeps its own units, so a clip's pelvis travel,
  // given in the root bone's frame, still means what it meant)
  world = world.map((m) => Sm.clone().multiply(m));
  // measure the head and the left hand from the skin they carry (bind pose)
  const merged0 = mergeGeometries(parts.map((g) => (g.index ? g : g)));
  const box = (boneName, minW = 0.5) => {
    const b = new THREE.Box3(), bi = index[boneName], pos = merged0.attributes.position, si = merged0.attributes.skinIndex, sw = merged0.attributes.skinWeight, pt = merged0.attributes.part, v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      if (pt.getX(i) !== PART.skin) continue;
      let w = 0; for (let k = 0; k < 4; k++) if (si.getComponent(i, k) === bi) w += sw.getComponent(i, k);
      if (w >= minW) b.expandByPoint(v.fromBufferAttribute(pos, i));
    }
    return b;
  };
  const all = new THREE.Box3().setFromBufferAttribute(merged0.attributes.position);
  const modelH = all.max.y - all.min.y;
  const head = box('head');
  const hc = head.getCenter(V()), hs = head.getSize(V());
  // the cap: a crown over the top of the skull, a brim out over the brows (the bind pose faces +z)
  const crown = new THREE.SphereGeometry(1, 14, 7, 0, Math.PI * 2, 0, Math.PI * 0.55);
  crown.scale(hs.x * 0.56, hs.y * 0.5, hs.z * 0.6).translate(hc.x, hc.y + hs.y * 0.08, hc.z - hs.z * 0.03);
  const brim = new THREE.CylinderGeometry(hs.x * 0.5, hs.x * 0.5, hs.y * 0.025, 14, 1, false, -Math.PI * 0.42, Math.PI * 0.84);
  brim.scale(1, 1, 1.25).translate(hc.x, hc.y + hs.y * 0.16, hc.z + hs.z * 0.18);
  for (const g of [crown, brim]) g.deleteAttribute('uv');
  parts.push(rigid(crown, index.head, PART.cap), rigid(brim, index.head, PART.brim));
  // the gloves: a leather pad on each hand's palm side, fingers up (one is hidden per figure)
  for (const s of ['l', 'r']) {
    const hb = box(`hand_${s}`, 0.3), c = hb.getCenter(V());
    const hand = world[index[`hand_${s}`]], mid = world[index[`middle_01_${s}`]];
    const hp = V().setFromMatrixPosition(hand), mp = V().setFromMatrixPosition(mid);
    const along = mp.clone().sub(hp).normalize();
    const out = V(s === 'l' ? 1 : -1, 0, 0);           // the A pose: the palm faces the body
    const side = V().crossVectors(along, out).normalize();
    // a fielder's glove is far bigger than the hand: about 28 cm long, 20 wide, a pocket in front of the palm
    const g = new THREE.SphereGeometry(1, 14, 10);
    g.scale(0.09, 0.135, 0.05);
    g.applyMatrix4(new THREE.Matrix4().makeBasis(side, along, out).setPosition(c.clone().addScaledVector(along, 0.075).addScaledVector(out, -0.045)));
    g.deleteAttribute('uv');
    parts.push(rigid(g, index[`hand_${s}`], s === 'l' ? PART.gloveL : PART.gloveR));
  }
  for (const g of parts) {
    if (!g.index) g.setIndex([...Array(g.attributes.position.count).keys()]);
    else if (!(g.index.array instanceof Uint32Array)) g.setIndex(new THREE.Uint32BufferAttribute(Uint32Array.from(g.index.array), 1));
    for (const k of ['position', 'normal']) { const a = g.attributes[k]; if (!(a.array instanceof Float32Array)) g.setAttribute(k, new THREE.Float32BufferAttribute(Float32Array.from(a.array), 3)); }
  }
  const geometry = mergeGeometries(parts);
  geometry.computeBoundingSphere();
  merged0.dispose();
  // where the glove's pocket and the bare hand's ball sit, in each hand's own frame
  const pocket = (s) => {
    const hb = box(`hand_${s}`, 0.3), c = hb.getCenter(V());
    return c.applyMatrix4(world[index[`hand_${s}`]].clone().invert());
  };
  return { geometry, names, index, parents: sk.bones.map((b) => names.indexOf(b.parent && b.parent.name)), world, inverses: world.map((m) => m.clone().invert()), modelH, foot: Math.min(world[index.foot_l].elements[13], world[index.foot_r].elements[13]) - all.min.y, minY: all.min.y, pocketL: pocket('l'), pocketR: pocket('r') };
}

/** The material all figures share the program of: a standard material coloured per part. */
function figureMaterial() {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.78, metalness: 0 });
  const kit = Array.from({ length: NPART }, () => new THREE.Color(0.5, 0.5, 0.5));
  m.userData.kit = kit;
  m.userData.hide = { value: new THREE.Vector2(0, 0) };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uKit = { value: kit };
    sh.uniforms.uHide = m.userData.hide;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float part;\nvarying float vPart;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPart = part;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform vec3 uKit[${NPART}];\nuniform vec2 uHide;\nvarying float vPart;`)
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );', `int pi = int(vPart + 0.5);
        if ((pi == ${PART.gloveL} && uHide.x > 0.5) || (pi == ${PART.gloveR} && uHide.y > 0.5)) discard;
        vec3 kc = uKit[0];
        for (int k = 1; k < ${NPART}; k++) if (k == pi) kc = uKit[k];
        vec4 diffuseColor = vec4( kc, opacity );`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\nif (pi == ${PART.skin}) roughnessFactor = 0.55; else if (pi == ${PART.shoes} || pi == ${PART.belt} || pi == ${PART.brim}) roughnessFactor = 0.45;`);
  };
  m.customProgramCacheKey = () => 'std-figure-1';
  return m;
}

const SKIN = [new THREE.Color('#e0b393'), new THREE.Color('#5e3d29')];
const HAIR = new THREE.Color('#1c1712');
const LEATHER = new THREE.Color('#6b3d1f');

export class Crew {
  constructor(scene, person) {
    this.scene = scene;
    this.t = buildTemplate(person);
    this.figures = [];
    // the soft shadows: one instanced quad for every figure and the ball
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), grd = g.createRadialGradient(32, 32, 2, 32, 32, 31);
    grd.addColorStop(0, 'rgba(0,0,0,0.55)'); grd.addColorStop(0.55, 'rgba(0,0,0,0.3)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c);
    this.blobs = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 }), 24);
    this.blobs.renderOrder = 3; this.blobs.frustumCulled = false; this.blobs.count = 0;
    this.blobs.visible = false;
    scene.add(this.blobs);
    this._m = new THREE.Matrix4();
  }

  /** The clips (assets/fielder.glb, parsed): their tracks by bone, and for each run its stride (the
      distance its own capture travels in one cycle, taken out so it runs in place). */
  setMotion(gltf) {
    const names = this.t.names, idx = Object.fromEntries(names.map((n, i) => [n, i]));
    const LOOP = { sprint: 16 / 30, run: 16 / 30, jog: 25 / 30 };
    const clips = {};
    for (const a of gltf.animations) {
      const tracks = [];
      for (const tr of a.tracks) {
        const [node, prop] = tr.name.split('.');
        if (!(node in idx) || (prop !== 'quaternion' && prop !== 'position')) continue;
        if (prop === 'position' && node !== 'pelvis') continue;
        tracks.push({ i: idx[node], q: prop === 'quaternion', interp: tr.createInterpolant() });
      }
      const c = { name: a.name, dur: a.duration, period: LOOP[a.name] || a.duration, tracks };
      // the pelvis' travel over one cycle (a run goes forward; it is taken out, the bob kept)
      const pt = tracks.find((x) => !x.q);
      if (pt) {
        const p0 = V().fromArray(pt.interp.evaluate(0)), p1 = V().fromArray(pt.interp.evaluate(c.period));
        c.p0 = p0; c.drift = LOOP[a.name] ? p1.clone().sub(p0) : V();
      }
      clips[a.name] = c;
    }
    this.clips = clips;
    // a stride (two steps) in field feet, at this body's size
    const rs = new THREE.Vector3().setFromMatrixScale(this.t.world[this.t.index.Root]).x;   // the root bone's frame
    const sc = rs * HEIGHT_M / this.t.modelH;
    for (const k of ['sprint', 'run', 'jog']) if (clips[k]) clips[k].strideFt = clips[k].drift.length() * sc / FT;
  }

  /** The run's mix at a speed (feet a second): weights of jog, run and sprint, and the stride that
      mix covers. A trot is the jog whatever the speed. */
  runMix(v, trot) {
    const C = this.clips;
    let w;
    if (trot) w = { jog: 1, run: 0, sprint: 0 };
    else if (v < 9) w = { jog: 1, run: 0, sprint: 0 };
    else if (v < 16) { const k = smooth((v - 9) / 7); w = { jog: 1 - k, run: k, sprint: 0 }; }
    else { const k = smooth((v - 16) / 7); w = { jog: 0, run: 1 - k, sprint: k }; }
    const stride = w.jog * C.jog.strideFt + w.run * C.run.strideFt + w.sprint * C.sprint.strideFt;
    return { w, stride };
  }

  /** A body's phase through its stride at each moment (radians), from its speed along the plan: a
      table over the play, so the phase advances with the distance at the stride its speed calls for. */
  phaseTable(speedAt, t0, t1, trot) {
    const dt = 1 / 60, n = Math.ceil((t1 - t0) / dt) + 2, out = new Float32Array(n);
    let ph = 0;
    for (let i = 0; i < n; i++) {
      out[i] = ph;
      const v = speedAt(t0 + i * dt);
      if (this.clips) ph += 2 * Math.PI * v * dt / this.runMix(v, trot).stride;
    }
    return { t0, dt, out, at: (t) => { const x = clamp((t - t0) / dt, 0, n - 1.001), i = Math.floor(x); return out[i] + (out[i + 1] - out[i]) * (x - i); } };
  }

  /** A new body on its own skeleton (hidden until placed). */
  figure() {
    const T = this.t;
    const bones = T.names.map((n) => { const b = new THREE.Bone(); b.name = n; return b; });
    const root = new THREE.Group();
    T.names.forEach((n, i) => {
      const p = T.parents[i];
      const local = p < 0 ? T.world[i].clone() : T.world[p].clone().invert().multiply(T.world[i]);
      local.decompose(bones[i].position, bones[i].quaternion, bones[i].scale);
      (p < 0 ? root : bones[p]).add(bones[i]);
    });
    const mat = figureMaterial();
    const mesh = new THREE.SkinnedMesh(T.geometry, mat);
    mesh.bind(new THREE.Skeleton(bones, T.inverses.map((m) => m.clone())), new THREE.Matrix4());
    mesh.boundingSphere = new THREE.Sphere(V(0, T.minY + T.modelH / 2, 0), T.modelH * 0.9);
    mesh.castShadow = false; mesh.receiveShadow = false;
    root.add(mesh);
    root.visible = false;
    this.scene.add(root);
    const f = new Figure(this, root, mesh, Object.fromEntries(bones.map((b) => [b.name, b])));
    this.figures.push(f);
    return f;
  }

  /** Colour a figure: kit from people.js kitFor, tone 0..1 the skin, glove 'l' | 'r' | null, the cap
      a batting helmet's colour on a runner (kit.cap either way). */
  dress(f, kit, o = {}) {
    const k = f.mesh.material.userData.kit;
    k[PART.skin].copy(SKIN[0]).lerp(SKIN[1], o.tone ?? 0.3);
    k[PART.hair].copy(HAIR);
    k[PART.uniform].copy(kit.base);
    k[PART.trim].copy(kit.trim);
    k[PART.shoes].set('#1a1a1a');
    k[PART.belt].copy(kit.belt);
    k[PART.cap].copy(kit.cap);
    k[PART.brim].copy(kit.cap).multiplyScalar(0.8);
    k[PART.gloveL].copy(LEATHER); k[PART.gloveR].copy(LEATHER);
    if (o.glove === 'l') f.mesh.material.userData.kit[PART.gloveL].copy(o.gloveColor || LEATHER);
    f.mesh.material.userData.hide.value.set(o.glove === 'l' ? 0 : 1, o.glove === 'r' ? 0 : 1);
    f.glove = o.glove || null;
    f.scale = (o.heightM ?? HEIGHT_M) / this.t.modelH;
  }

  /** The blobs under every visible figure, and one under the ball (fainter, smaller as it climbs). */
  shadows(ball) {
    let n = 0;
    const m = this._m, q = new THREE.Quaternion(), s = V();
    for (const f of this.figures) {
      if (!f.root.visible || n >= 23) continue;
      const pel = f.at;
      s.set(0.95, 1, 0.95);
      m.compose(P(pel.x, pel.y, 0.03), q, s);
      this.blobs.setMatrixAt(n++, m);
    }
    if (ball && ball.z < 70) {
      const r = 0.12 + Math.min(0.5, ball.z * 0.012);
      s.set(r, 1, r);
      m.compose(P(ball.x, ball.y, 0.035), q, s);
      this.blobs.setMatrixAt(n++, m);
    }
    this.blobs.count = n;
    this.blobs.instanceMatrix.needsUpdate = true;
    this.blobs.visible = n > 0;
  }

  hide() { for (const f of this.figures) f.root.visible = false; this.blobs.visible = false; }
}

/* ------------------------------------------------------------------ one body */

const X = V(1, 0, 0), Y = V(0, 1, 0);
// the trunk, arms and head: what the throw and the idle lay on (the legs stay the run's or our own)
const UPPER = new Set(['spine_01', 'spine_02', 'spine_03', 'neck_01', 'head', 'clavicle_l', 'clavicle_r', 'deltoid_l', 'deltoid_r',
  ...['l', 'r'].flatMap((s) => ['upperarm', 'upperarm_twist', 'lowerarm', 'lowerarm_twist', 'hand', 'index_01', 'index_02', 'index_03', 'middle_01', 'middle_02', 'middle_03', 'ring_01', 'ring_02', 'ring_03', 'pinky_01', 'pinky_02', 'pinky_03', 'thumb_01', 'thumb_02', 'thumb_03'].map((b) => `${b}_${s}`))]);
const _q = new THREE.Quaternion();

export class Figure {
  constructor(crew, root, mesh, bones) {
    Object.assign(this, { crew, root, mesh, bones });
    this.bind = Object.values(bones).map((b) => [b, b.position.clone(), b.quaternion.clone()]);
    this.list = crew.t.names.map((n) => bones[n]);
    this.qa = this.list.map(() => new THREE.Quaternion()); this.qb = this.list.map(() => new THREE.Quaternion());
    this.qp = this.list.map(() => new THREE.Quaternion());
    this.at = { x: 0, y: 0 };
    this.scale = HEIGHT_M / crew.t.modelH;
    root.updateMatrixWorld(true);
    const B = bones;
    this.len = {
      thigh: wpos(B.thigh_l).distanceTo(wpos(B.calf_l)), shin: wpos(B.calf_l).distanceTo(wpos(B.foot_l)),
      upper: wpos(B.upperarm_l).distanceTo(wpos(B.lowerarm_l)), fore: wpos(B.lowerarm_l).distanceTo(wpos(B.hand_l)),
      hip: wpos(B.pelvis).y, shoulder: wpos(B.upperarm_l).y,
    };
    this.ankle0 = Math.min(wpos(B.foot_l).y, wpos(B.foot_r).y);
  }

  /** Where the figure stands (field feet) and which way it faces (yaw 0: centre field; + toward
      first base), lift (feet) off the ground, pitch (radians, a dive leans the whole body forward). */
  place(x, y, yaw, o = {}) {
    this.at = { x, y };
    this.yaw = yaw;
    this.root.visible = true;
    this.o = o;
  }

  /** Model frame: the body faces +z, its left is +x, metres of the model (scale 1), standing at the origin. */
  toModel(fieldPt) {
    // field feet (x, y, z) to the model frame of this figure where it stands now
    const dx = fieldPt.x - this.at.x, dy = fieldPt.y - this.at.y;
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    // world: -x right... the figure faces field heading yaw: forward f = (sin yaw, cos yaw), its left l = (-cos yaw, sin yaw)
    const fwd = dx * s + dy * c, left = -dx * c + dy * s;
    const v = V(left * FT / this.scale, ((fieldPt.z ?? 0) * FT - (this.lift || 0)) / this.scale + (this.g0 || 0), fwd * FT / this.scale);
    // a dive pitches the body about the root: a target is aimed at in that pitched frame (the glove
    // reached the right spot before the body was laid out, and the dive then carried it off)
    if (this.pitch) v.applyAxisAngle(X, -this.pitch);
    return v;
  }

  /** Model frame point to field feet (x, y, z). */
  toField(v) {
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    const left = v.x * this.scale / FT, fwd = v.z * this.scale / FT;
    return { x: this.at.x + fwd * s - left * c, y: this.at.y + fwd * c + left * s, z: (v.y - (this.g0 || 0)) * this.scale / FT + (this.lift || 0) / FT };
  }

  /** The pose. spec (all optional):
      run      { phase (radians), amp 0..1 }      the stride, its size from the speed
      crouch   0..1    knees and hips bent (ready 0.35, fielding a grounder 1)
      wide     0..1    feet apart (fielding)
      lean     radians the trunk forward
      twist    radians the trunk turned (a throw closes it, negative, then opens it)
      stride   { l, r } radians: a leg out in front (+) or back (-) when not running
      glove    a field point { x, y, z } the glove's pocket goes to, or null (arms from the run/ready)
      gloveW   0..1
      hand     a field point the bare hand goes to
      handW    0..1
      throw    0..1..2 the throwing arm: 0 back and up, 1 release out in front, 2 follow through
      throwW   0..1
      look     a field point he looks at
      dive     0..1    the body laid out forward (the root pitched), arms out to the glove
      armsUp   0..1    a leap: arms straight up
      slide    0..1    feet first into a bag: legs out in front, the trunk laid back, the seat on the dirt */
  pose(spec) {
    const B = this.bones, root = this.root;
    for (const [b, p, q] of this.bind) { b.position.copy(p); b.quaternion.copy(q); }
    root.position.set(0, 0, 0); root.quaternion.identity(); root.scale.setScalar(1);
    root.updateMatrixWorld(true);
    const sp = spec;
    const clips = this.crew.clips;
    const run = sp.run || { phase: 0, amp: 0 };
    // with the clips the stride is the capture's (laid over this standing pose below)
    const aRun = clamp(run.amp, 0, 1.2), a = clips ? 0 : aRun;
    const useThrowClip = clips && clips.throw && sp.throwW > 0 && this.glove !== 'r';   // (the capture throws right handed)
    const crouch = sp.crouch || 0, wide = sp.wide || 0;
    const lean = (sp.lean || 0) + 0.2 * a - 0.95 * (sp.slide || 0);
    // ---- the trunk: lean forward, turn
    const tw = useThrowClip ? 0 : (sp.twist || 0), runTw = 0.12 * a * Math.sin(run.phase);
    rotY(B.pelvis, tw * 0.35 - runTw * 0.6);
    rotX(B.spine_01, lean * 0.35); rotX(B.spine_02, lean * 0.35); rotX(B.spine_03, lean * 0.3);
    rotY(B.spine_02, tw * 0.35 + runTw * 0.5); rotY(B.spine_03, tw * 0.3 + runTw * 0.5);
    // ---- the legs
    for (const s of ['l', 'r']) {
      const side = s === 'l' ? 1 : -1;
      const ph = run.phase + (s === 'l' ? 0 : Math.PI);
      // running: the thigh swings (more forward than back), the knee folds through the swing
      let th = (0.22 * a) + (0.3 + 0.35 * a) * a * Math.sin(ph);
      let kn = a > 0 ? (0.25 + 1.25 * Math.pow(0.5 + 0.5 * Math.cos(ph - 0.4), 1.6)) * a : 0;
      // standing: a crouch bends hips and knees together (the shins tip forward, the hips go back)
      th += crouch * 1.05 + (sp.stride ? sp.stride[s] || 0 : 0);
      kn += crouch * 1.75 + (sp.stride ? Math.max(0, -(sp.stride[s] || 0)) * 0.6 : 0);
      if (sp.slide > 0) {
        // the lead leg straight out in front, the other folded under it
        const k = sp.slide, lead = s === 'l';
        th = th * (1 - k) + (lead ? 1.45 : 1.25) * k;
        kn = kn * (1 - k) + (lead ? 0.1 : 1.9) * k;
      }
      const splay = 0.06 + 0.22 * wide + 0.08 * crouch;
      aimBone(B[`thigh_${s}`], B[`calf_${s}`], V(splay * side, -Math.cos(th), Math.sin(th)));
      aimBone(B[`calf_${s}`], B[`foot_${s}`], V(splay * side * 0.4, -Math.cos(th - kn), Math.sin(th - kn)));
      // the foot: level on the ground, the toe down as it comes off it
      const toe = a > 0 ? 0.35 * a * Math.max(0, -Math.sin(ph)) : 0;
      aimBone(B[`foot_${s}`], B[`ball_${s}`], V(side * 0.08 * (crouch + wide), -0.25 - toe, 1));
    }
    // ---- the arms: hanging, swinging with the stride, or reaching
    for (const s of ['l', 'r']) {
      const side = s === 'l' ? 1 : -1;
      const ph = run.phase + (s === 'l' ? Math.PI : 0);
      const sw = 0.9 * a * Math.sin(ph);
      const hangOut = 0.16 + 0.25 * crouch;
      const fwd0 = 0.25 * crouch + lean * 0.6;
      const up = V(hangOut * side, -Math.cos(sw + fwd0), Math.sin(sw + fwd0));
      const elbow = 0.35 + 1.1 * a + 0.4 * crouch;
      const fo = V(hangOut * side * 0.4 - 0.12 * side * a, -Math.cos(sw + fwd0 + elbow), Math.sin(sw + fwd0 + elbow));
      aimBone(B[`upperarm_${s}`], B[`lowerarm_${s}`], up);
      aimBone(B[`lowerarm_${s}`], B[`hand_${s}`], fo);
    }
    // a throw: the throwing arm is the one without the glove
    const thr = this.glove === 'r' ? 'l' : 'r', gl = thr === 'l' ? 'r' : 'l', ts = thr === 'l' ? 1 : -1;
    if (sp.throwW > 0 && !useThrowClip) {
      const k = clamp(sp.throw, 0, 2);
      // three keys: cocked (behind, up), release (high in front), follow (across, down)
      const U0 = V(0.85 * ts, 0.35, -0.55), F0 = V(0.1 * ts, 1, -0.25);
      const U1 = V(0.35 * ts, 0.55, 0.8), F1 = V(0.1 * ts, 0.35, 1);
      const U2 = V(-0.35 * ts, -0.75, 0.6), F2 = V(-0.65 * ts, -0.55, 0.45);
      const U = k < 1 ? dirL(U0, U1, smooth(k)) : dirL(U1, U2, smooth(k - 1));
      const F = k < 1 ? dirL(F0, F1, smooth(k)) : dirL(F1, F2, smooth(k - 1));
      blendAim(B[`upperarm_${thr}`], B[`lowerarm_${thr}`], U, sp.throwW);
      blendAim(B[`lowerarm_${thr}`], B[`hand_${thr}`], F, sp.throwW);
      // the glove arm points at the target as he closes, then tucks
      const gU = k < 1 ? dirL(V(-0.15 * ts, 0.15, 1), V(-0.1 * ts, -0.3, 0.6), smooth(k)) : dirL(V(-0.1 * ts, -0.3, 0.6), V(-0.25 * ts, -0.9, 0.1), smooth(k - 1));
      const gF = k < 1 ? dirL(V(-0.1 * ts, 0.15, 1), V(0.4 * ts, -0.1, 0.7), smooth(k)) : dirL(V(0.4 * ts, -0.1, 0.7), V(0.3 * ts, 0.3, 0.6), smooth(k - 1));
      if (!sp.glove || !(sp.gloveW > 0)) {
        blendAim(B[`upperarm_${gl}`], B[`lowerarm_${gl}`], gU, sp.throwW);
        blendAim(B[`lowerarm_${gl}`], B[`hand_${gl}`], gF, sp.throwW);
      }
    }
    if (sp.armsUp > 0) {
      for (const s of ['l', 'r']) {
        const side = s === 'l' ? 1 : -1;
        blendAim(B[`upperarm_${s}`], B[`lowerarm_${s}`], V(0.15 * side, 1, 0.15), sp.armsUp);
        blendAim(B[`lowerarm_${s}`], B[`hand_${s}`], V(0.05 * side, 1, 0.1), sp.armsUp);
      }
    }
    // ---- the clips over the standing pose: the run by speed, a little idle life, the throw's trunk and arms
    if (clips) this.layerClips(sp, aRun, useThrowClip);
    // ---- on the ground: where the soles are in this pose (the lowest foot at its bind height)
    root.updateMatrixWorld(true);
    const low = Math.min(wpos(B.foot_l).y, wpos(B.foot_r).y, wpos(B.ball_l).y + 0.03, wpos(B.ball_r).y + 0.03);
    this.g0 = low - (this.ankle0 - this.crew.t.minY);       // the ground's height in the model frame
    if (sp.slide > 0) {
      // sliding, the seat is on the dirt: the ground is just under the hips
      const seat = wpos(B.pelvis).y - 0.13 / this.scale;
      this.g0 += (seat - this.g0) * sp.slide;
    }
    this.lift = ((this.o && this.o.lift) || 0) * FT;
    this.pitch = (sp.dive || 0) * 1.32;
    // ---- hands to points (two bone IK), the glove's pocket on its target
    if (sp.glove && sp.gloveW > 0 && this.glove) this.reachTo(this.glove, this.toModel(sp.glove), sp.gloveW, true);
    if (sp.hand && sp.handW > 0) this.reachTo(this.glove === 'r' ? 'l' : 'r', this.toModel(sp.hand), sp.handW, false);
    // ---- the head: toward what he watches
    if (sp.look) this.lookAt(this.toModel(sp.look), sp.lookW ?? 1);
    // ---- now the real place: field position, heading, scale. A dive pitches the body forward about
    // the feet, laid out over the grass toward the ball
    const sc = this.scale, w = P(this.at.x, this.at.y, 0);
    root.scale.setScalar(sc);
    root.quaternion.setFromAxisAngle(Y, -this.yaw);
    if (this.pitch > 0) root.quaternion.multiply(_q.setFromAxisAngle(X, this.pitch));
    root.position.set(w.x, -this.g0 * sc + this.lift, w.z);
    root.updateMatrixWorld(true);
  }

  /** Sample a clip at time t into q (local quaternions by bone index); its pelvis position into pos. */
  sample(c, t, q, pos) {
    for (const tr of c.tracks) {
      const v = tr.interp.evaluate(t);
      if (tr.q) q[tr.i].set(v[0], v[1], v[2], v[3]);
      else if (pos) pos.set(v[0], v[1], v[2]);
    }
  }

  layerClips(sp, aRun, useThrow) {
    const C = this.crew.clips, L = this.list, n = L.length;
    const qp = this.qp, qa = this.qa, qb = this.qb;
    for (let i = 0; i < n; i++) qp[i].copy(L[i].quaternion);
    const pel = this.bones.pelvis, pelP = pel.position.clone();
    const runW = smooth(aRun * 4) * (1 - (sp.slide || 0));
    let any = false;
    if (runW > 0.001) {
      // the mix of runs at this speed, each at the same share of its cycle
      const v = aRun * 26, mix = this.crew.runMix(v, sp.run.trot);
      const u = ((sp.run.phase / (2 * Math.PI)) % 1 + 1) % 1;
      let wsum = 0;
      const pos = V(), pa = V();
      for (const k of ['jog', 'run', 'sprint']) {
        const w = mix.w[k], c = C[k];
        if (!(w > 0.001) || !c) continue;
        for (let i = 0; i < n; i++) qb[i].copy(qp[i]);
        this.sample(c, u * c.period, qb, pa);
        // in place: the cycle's travel out, the bob kept
        pa.sub(c.drift.clone().multiplyScalar(u)).sub(c.p0);
        const k2 = w / (wsum + w);
        for (let i = 0; i < n; i++) { if (wsum === 0) qa[i].copy(qb[i]); else qa[i].slerp(qb[i], k2); }
        pos.lerp(pa, wsum === 0 ? 1 : k2);
        wsum += w;
      }
      for (let i = 0; i < n; i++) L[i].quaternion.copy(qp[i]).slerp(qa[i], runW);
      pel.position.copy(pelP).addScaledVector(pos, runW);
      any = true;
    } else if (C.idle && !(sp.crouch > 0.15) && !(sp.throwW > 0)) {
      // standing: a little of the idle's life on the trunk, arms and head (its feet wander, so not those)
      const t = ((sp.idleT || 0) % (2 * C.idle.dur));
      for (let i = 0; i < n; i++) qa[i].copy(qp[i]);
      this.sample(C.idle, t < C.idle.dur ? t : 2 * C.idle.dur - t, qa, null);
      for (let i = 0; i < n; i++) if (UPPER.has(L[i].name)) L[i].quaternion.slerp(qa[i], 0.45);
      any = true;
    }
    if (useThrow) {
      // the pitch's trunk and arms, its release (0.9 s into the clip) on the plan's
      const c = C.throw, t = clamp(0.9 + (sp.throw - 1) * 0.55, 0, c.dur);
      for (let i = 0; i < n; i++) qa[i].copy(L[i].quaternion);
      this.sample(c, t, qa, null);
      for (let i = 0; i < n; i++) if (UPPER.has(L[i].name)) L[i].quaternion.slerp(qa[i], sp.throwW);
      any = true;
    }
    if (any) this.root.updateMatrixWorld(true);
  }

  /** Two bone IK of one arm to a model frame point, the glove's pocket (or the hand) on it. */
  reachTo(s, target, w, pocket) {
    const B = this.bones, side = s === 'l' ? 1 : -1;
    const sh = wpos(B[`upperarm_${s}`]);
    // keep it within reach: an arm never stretches
    const reachMax = (this.len.upper + this.len.fore) * 0.97;
    const d = target.clone().sub(sh);
    if (d.length() > reachMax) target = sh.clone().addScaledVector(d.normalize(), reachMax);
    const pole = sh.clone().add(V(side * 0.5, -0.6, -0.35));
    const off = pocket ? (s === 'l' ? this.crew.t.pocketL : this.crew.t.pocketR) : null;
    let tgt = target.clone();
    const save = [B[`upperarm_${s}`], B[`lowerarm_${s}`], B[`hand_${s}`]].map((b) => b.quaternion.clone());
    for (let it = 0; it < (off ? 2 : 1); it++) {
      [B[`upperarm_${s}`], B[`lowerarm_${s}`], B[`hand_${s}`]].forEach((b, i) => b.quaternion.copy(save[i]));
      B[`upperarm_${s}`].updateMatrixWorld(true);
      twoBoneIK(B[`upperarm_${s}`], B[`lowerarm_${s}`], B[`hand_${s}`], tgt, pole, w);
      if (!off) break;
      B[`hand_${s}`].updateMatrixWorld(true);
      const pk = off.clone().applyMatrix4(B[`hand_${s}`].matrixWorld);
      tgt.add(target.clone().sub(pk).multiplyScalar(w));
    }
  }

  /** A bone's joint, in field feet, as posed (the shoulder, for the reach at a catch). */
  jointPoint(name) {
    const v = new THREE.Vector3().setFromMatrixPosition(this.bones[name].matrixWorld);
    return { x: -v.x / FT, y: v.z / FT, z: v.y / FT };
  }

  /** The glove's pocket (or the throwing hand), in field feet, as posed. */
  handPoint(which) {
    const s = which === 'glove' ? this.glove || 'l' : (this.glove === 'r' ? 'l' : 'r');
    const off = which === 'glove' ? (s === 'l' ? this.crew.t.pocketL : this.crew.t.pocketR) : (s === 'l' ? this.crew.t.pocketL : this.crew.t.pocketR);
    const v = off.clone().applyMatrix4(this.bones[`hand_${s}`].matrixWorld);
    return { x: -v.x / FT, y: v.z / FT, z: v.y / FT };
  }

  lookAt(target, w) {
    const B = this.bones;
    const h = wpos(B.head);
    const d = target.clone().sub(h);
    const yaw = clamp(Math.atan2(d.x, d.z), -1.3, 1.3) * w;
    const pitch = clamp(-Math.atan2(d.y, Math.hypot(d.x, d.z)), -0.9, 0.7) * w;
    rotY(B.neck_01, yaw * 0.45); rotY(B.head, yaw * 0.55);
    rotX(B.neck_01, pitch * 0.4); rotX(B.head, pitch * 0.6);
  }
}

function rotX(b, a) { if (!a) return; rotWorld(b, X, a); }
function rotY(b, a) { if (!a) return; rotWorld(b, Y, a); }
const _pq = new THREE.Quaternion(), _bq = new THREE.Quaternion();
function rotWorld(bone, axis, a) {
  bone.parent.getWorldQuaternion(_pq);
  bone.getWorldQuaternion(_bq);
  _q.setFromAxisAngle(axis, a).multiply(_bq);
  bone.quaternion.copy(_pq.invert().multiply(_q));
  bone.updateMatrixWorld(true);
}
function blendAim(bone, child, dir, w) {
  if (w <= 0) return;
  aimBone(bone, child, dir, Math.min(1, w));
}

export { PART };
