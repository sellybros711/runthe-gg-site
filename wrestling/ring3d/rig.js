/* Run The Ropes 3D: the wrestler.

   One body, built from a look the game already saves (pxwrestler.js's normal
   look, which RTR_PX.fromLegacy hands over), so the player, every authored
   character, the opponent and the referee all come out of the same code and
   share every animation. Nothing here is a model file: the head is a soft
   superellipsoid, limbs are capsules, gear is small primitives. That is the
   MythiBall prototype's rig (mythiball/proto3d/rig.js), grown in the one
   direction wrestling needs and baseball never did.

   A WRESTLER LEAVES HIS FEET. A batter stands on the ground, so that rig plants
   his ankles in the root frame. Here a body lies on its back, hangs upside down
   over a shoulder, sits on a top turnbuckle and flies. So the ankles are
   targets in the PELVIS frame, and rotating the pelvis carries the whole body
   with it. Standing poses are given `pl` (plant), which pulls each ankle back
   down onto the canvas after the pelvis has leaned, so a lean does not lift
   the feet off the mat.

   Conventions, which every pose in poses.js and moves.js depends on:
     the body faces +z in its own frame, up is +y,
     its LEFT is +x and its RIGHT is -x,
     positive x rotation leans forward (face toward the mat),
     negative x rotation of the pelvis by PI/2 lays the body on its back
       with the head toward -z. */
import * as THREE from '../../assets/vendor/three-0.180.0/three.module.min.js';

/* ------------------------------------------------------------- materials */
const GRAD = (() => {
  const d = new Uint8Array([88, 88, 88, 255, 170, 170, 170, 255, 255, 255, 255, 255]);
  const t = new THREE.DataTexture(d, 3, 1, THREE.RGBAFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true; return t;
})();
export { GRAD };
const MATS = new Map();
function toon(color, map) {
  const key = color + (map ? '|' + map.uuid : '');
  let m = MATS.get(key);
  if (!m) { m = new THREE.MeshToonMaterial({ color: new THREE.Color(color), gradientMap: GRAD, map: map || null }); MATS.set(key, m); }
  return m;
}
const INK_C = 0x120f18;
const OUT = new Map();
function outlineMat(w) {
  const k = w.toFixed(3);
  let m = OUT.get(k);
  if (!m) { m = new THREE.MeshBasicMaterial({ color: INK_C, side: THREE.BackSide }); m.userData.w = w; OUT.set(k, m); }
  return m;
}

/* -------------------------------------------------------------- baking
   Built as a few dozen primitives, each with its own ink hull, then baked into
   one skinned mesh for the vertex-coloured body, one per textured material and
   one for the ink, so a wrestler costs three or four draw calls rather than
   eighty. Every animated node is a bone and every piece is bound rigidly to the
   node it hung from, so posing still goes through the same Object3Ds. A node
   that is switched off (the belt, the entrance robe) collapses to nothing. */
const EMPTY = new THREE.BufferGeometry();
const TOON_VC = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: GRAD, vertexColors: true });
const INK = new THREE.MeshBasicMaterial({ color: INK_C, side: THREE.BackSide });
const ZERO16 = new Float32Array(16);
class VisSkeleton extends THREE.Skeleton {
  constructor(bones, top) { super(bones, bones.map(() => new THREE.Matrix4())); this.top = top; }
  update() {
    super.update();
    const B = this.bones;
    for (let i = 0; i < B.length; i++) {
      let o = B[i], vis = true; while (o && o !== this.top) { if (!o.visible) { vis = false; break; } o = o.parent; }
      if (!vis) this.boneMatrices.set(ZERO16, i * 16);
    }
  }
}
function mergeSkinned(list, colorOf, push) {
  let nv = 0, ni = 0;
  for (const { m } of list) { const g = m.geometry; nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), col = colorOf ? new Float32Array(nv * 3) : null, uv = new Float32Array(nv * 2);
  const si = new Uint16Array(nv * 4), sw = new Float32Array(nv * 4), idx = new Uint32Array(ni);
  let vo = 0, io = 0;
  const M = new THREE.Matrix4(), N = new THREE.Matrix3(), v = new THREE.Vector3(), n = new THREE.Vector3();
  for (const { m, bone, inv } of list) {
    let g = m.geometry; if (!g.attributes.normal) { g = g.clone(); g.computeVertexNormals(); }
    M.multiplyMatrices(inv, m.matrixWorld); N.getNormalMatrix(M);
    const P = g.attributes.position, Nn = g.attributes.normal, U = g.attributes.uv, w = push ? push(m) : 0, c = colorOf ? colorOf(m) : null;
    for (let i = 0; i < P.count; i++) {
      const k = vo + i;
      n.fromBufferAttribute(Nn, i).normalize();
      v.fromBufferAttribute(P, i).addScaledVector(n, w).applyMatrix4(M);
      pos[k * 3] = v.x; pos[k * 3 + 1] = v.y; pos[k * 3 + 2] = v.z;
      n.applyMatrix3(N).normalize(); nor[k * 3] = n.x; nor[k * 3 + 1] = n.y; nor[k * 3 + 2] = n.z;
      if (col) { col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b; }
      if (U) { uv[k * 2] = U.getX(i); uv[k * 2 + 1] = U.getY(i); }
      si[k * 4] = bone; sw[k * 4] = 1;
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) idx[io + i] = g.index.getX(i) + vo;
    else for (let i = 0; i < P.count; i++) idx[io + i] = i + vo;
    vo += P.count; io += g.index ? g.index.count : P.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (col) out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
  out.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

/* ------------------------------------------------------------- colour */
function shade(hex, f) { const c = new THREE.Color(hex), h = {}; c.getHSL(h); c.setHSL(h.h, h.s, Math.max(0, Math.min(1, h.l * f))); return '#' + c.getHexString(); }
function lumOf(hex) { const c = new THREE.Color(hex); return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b; }

/* The look's colour tables are pxwrestler.js's, read off window.RTR_PX when it
   is there and copied here for a page (the lab, a node check) that has no
   RTR_PX, so a look's skin index means the same thing in both. */
const SKINS = ['#f7dcc4', '#f1c7a5', '#e3ad86', '#d19a6d', '#bd8458', '#a26c43', '#875637', '#6c432a', '#55321f', '#3f2416'];
const HAIR_COLORS = ['#1b1714', '#3b2618', '#6a4425', '#8a3b1d', '#d6b05a', '#e8e2cf', '#9a9a96', '#c2302f', '#3a6fd8', '#2fa86a', '#e06aa8'];
const HAIRBASE = { undercut: 'slick', wild: 'long', bun: 'short', curls: 'afro', fauxhawk: 'mohawk', braids: 'dreads', halfshave: 'short',
  frosted: 'spiky', waist: 'long', widow: 'slick', flames: 'spiky', hornhair: 'spiky', swoop: 'slick' };

/* ------------------------------------------------------------- textures */
const TEX = new Map();
function canvasTex(key, w, h, draw, rep) {
  if (TEX.has(key)) return TEX.get(key);
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv); t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; if (rep) t.repeat.set(rep[0], rep[1]); t.colorSpace = THREE.SRGBColorSpace;
  TEX.set(key, t); return t;
}
/* the referee's shirt: black and white stripes running down the body */
const refStripes = () => canvasTex('ref', 16, 4, (g) => { for (let x = 0; x < 16; x++) { g.fillStyle = (x >> 2) & 1 ? '#1d1d22' : '#f2efe8'; g.fillRect(x, 0, 1, 4); } }, [5, 1]);
/* a gear pattern, drawn in the gear and trim colours */
function patTex(kind, c, t) {
  return canvasTex('pat|' + kind + c + t, 16, 16, (g) => {
    g.fillStyle = c; g.fillRect(0, 0, 16, 16); g.fillStyle = t;
    if (kind === 'stripe' || kind === 'pinstripe') for (let x = 0; x < 16; x += kind === 'stripe' ? 8 : 4) g.fillRect(x, 0, 1, 16);
    else if (kind === 'stars' || kind === 'polka') for (let y = 2; y < 16; y += 6) for (let x = (y % 4) + 1; x < 16; x += 6) g.fillRect(x, y, 2, 2);
    else if (kind === 'check') for (let y = 0; y < 16; y += 4) for (let x = (y % 8 ? 4 : 0); x < 16; x += 8) g.fillRect(x, y, 4, 4);
    else if (kind === 'flame' || kind === 'bolt' || kind === 'zigzag') for (let x = 0; x < 16; x++) { const h = 3 + ((x * 7) % 5); g.fillRect(x, 16 - h, 1, h); }
    else if (kind === 'tigerstripe' || kind === 'camo' || kind === 'scales' || kind === 'web') for (let i = 0; i < 12; i++) g.fillRect((i * 5) % 16, (i * 7) % 16, 3, 1);
    else if (kind === 'split') g.fillRect(8, 0, 8, 16);
    else if (kind === 'gold' || kind === 'royal') { g.fillRect(0, 0, 16, 2); g.fillRect(0, 14, 16, 2); }
    else if (kind === 'gradient') for (let y = 0; y < 16; y++) { g.globalAlpha = y / 16; g.fillRect(0, y, 16, 1); }
  }, [1, 1]);
}
/* a tattoo sleeve: a few dark marks over the skin */
function inkTex(skin) {
  return canvasTex('ink|' + skin, 16, 16, (g) => {
    g.fillStyle = skin; g.fillRect(0, 0, 16, 16); g.fillStyle = shade(skin, 0.42);
    for (let i = 0; i < 9; i++) g.fillRect((i * 5 + 1) % 16, (i * 3) % 16, 3, 1 + (i % 2));
  }, [1, 2]);
}

/* ------------------------------------------------------------- geometry */
const GEO = new Map();
function cached(key, make) { let g = GEO.get(key); if (!g) { g = make(); GEO.set(key, g); } return g; }
const unitCap = () => cached('cap', () => new THREE.CapsuleGeometry(1, 1, 4, 10).translate(0, -1.5, 0));
const sphere = (seg = 12) => cached('sph' + seg, () => new THREE.SphereGeometry(1, seg, Math.max(6, seg * 0.75 | 0)));
const box = () => cached('box', () => new THREE.BoxGeometry(1, 1, 1));
const cyl = (top, seg = 12) => cached('cyl' + top + seg, () => new THREE.CylinderGeometry(top, 1, 1, seg));
const cone = (seg = 8) => cached('cone' + seg, () => new THREE.ConeGeometry(1, 1, seg));
const torusG = (t) => cached('tor' + t, () => new THREE.TorusGeometry(1, t, 6, 16));
function superHead(n, jaw, thetaLen) {
  return cached(['sh', n, jaw, thetaLen || 0].join('|'), () => {
    const g = new THREE.SphereGeometry(1, 16, 12, 0, Math.PI * 2, 0, thetaLen || Math.PI);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const s = Math.pow(Math.pow(Math.abs(x), n) + Math.pow(Math.abs(y), n) + Math.pow(Math.abs(z), n), -1 / n);
      x *= s; y *= s; z *= s;
      const w = y > 0 ? 1 : 1 + (jaw - 1) * -y;
      p.setXYZ(i, x * w, y, z * w);
    }
    g.computeVertexNormals(); return g;
  });
}

/* ------------------------------------------------------------- builds
   The five builds, as multipliers on one standard body. A giant has more leg
   and more of everything, a super heavyweight carries his weight in the
   middle. h is the head; it barely changes, which is what makes a giant look
   big rather than scaled. */
const BUILDS = {
  cruiser:  { S: 0.94, leg: 1.0, arm: 0.98, wide: 0.86, belly: 0, head: 1.0, limb: 0.86 },
  athletic: { S: 1.0, leg: 1.0, arm: 1.0, wide: 1.0, belly: 0, head: 1.0, limb: 1.0 },
  heavy:    { S: 1.02, leg: 0.97, arm: 1.0, wide: 1.16, belly: 0.35, head: 1.02, limb: 1.14 },
  super:    { S: 1.04, leg: 0.94, arm: 0.98, wide: 1.32, belly: 0.95, head: 1.04, limb: 1.26 },
  giant:    { S: 1.17, leg: 1.05, arm: 1.04, wide: 1.14, belly: 0.25, head: 0.98, limb: 1.18 },
};
const BASE = { headR: 0.56, neck: 0.26, torso: 1.9, shW: 0.82, hipW: 0.42, ua: 1.12, la: 1.02, armR: 0.215, th: 1.46, sh: 1.38, legR: 0.3, foot: 0.62, ankle: 0.22 };

/* ------------------------------------------------------------- the body */
export class Wrestler {
  /* look: a normal pxwrestler look. opts.entrance: build the entrance gear */
  constructor(look, opts = {}) {
    this.look = look = Object.assign({}, look || {});
    const b = BUILDS[look.build] || BUILDS.athletic, S = b.S, F = look.figure === 'f';
    this.S = S; this.F = F; this.B = b;
    const W = b.wide * (F ? 0.9 : 1);
    this.D = {
      headR: BASE.headR * b.head * (F ? 0.96 : 1), neck: BASE.neck * S, torso: BASE.torso * S * (F ? 0.96 : 1),
      shW: BASE.shW * W * S * (F ? 0.9 : 1), hipW: BASE.hipW * S * (F ? 1.06 : 1) * Math.sqrt(W),
      ua: BASE.ua * b.arm * S, la: BASE.la * b.arm * S, armR: BASE.armR * b.limb * S * (F ? 0.86 : 1),
      th: BASE.th * b.leg * S, sh: BASE.sh * b.leg * S, legR: BASE.legR * b.limb * S * (F ? 0.92 : 1),
      foot: BASE.foot * S, ankle: BASE.ankle * S, belly: b.belly,
    };
    const D = this.D;
    D.legL = D.th + D.sh; D.armL = D.ua + D.la; D.hipY = D.legL + D.ankle;
    this.lw = 0.045 * Math.max(0.9, S);
    this.root = new THREE.Group();
    this.pelvis = new THREE.Group(); this.chest = new THREE.Group(); this.headG = new THREE.Group();
    this.root.add(this.pelvis); this.pelvis.add(this.chest); this.chest.add(this.headG);
    this.chest.position.y = D.torso * 0.5;
    this.headG.position.y = D.torso * 0.5 + D.neck + D.headR * 0.86;
    this.limbs = {}; this.meshes = [];
    this.build(opts);
    this.bake();
    this.setEntrance(false);
    this.setBelt(look.belt && look.belt !== 'none' ? look.belt : null);
  }

  part(parent, geo, color, pos, scale, rot, opts = {}) {
    const m = new THREE.Mesh(geo, typeof color === 'string' ? toon(color, opts.map) : color);
    if (pos) m.position.set(pos[0], pos[1], pos[2]);
    if (scale) m.scale.set(scale[0], scale[1], scale[2]);
    if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
    m.castShadow = !opts.noShadow;
    parent.add(m); this.meshes.push(m);
    if (!opts.noOutline) {
      const o = new THREE.Mesh(geo, outlineMat(this.lw / Math.max(0.05, Math.min(m.scale.x, m.scale.y, m.scale.z)) * (opts.olk || 1)));
      o.userData.outline = true; m.add(o);
    }
    return m;
  }

  build(opts) {
    const L = this.look, D = this.D, S = this.S;
    const skin = typeof L.skin === 'string' ? L.skin : SKINS[Math.max(0, Math.min(SKINS.length - 1, L.skin | 0))] || SKINS[3];
    const hairC = typeof L.hc === 'string' ? L.hc : HAIR_COLORS[L.hc | 0] || HAIR_COLORS[0];
    const ref = L.ref === true;
    const gear = L.gear || '#c6392c', trim = L.trim || '#f2d27a';
    const bootC = L.bootc || (ref ? '#1d1d22' : shade(gear, 0.8));
    const pattern = L.pattern && L.pattern !== 'solid' ? patTex(L.pattern, gear, trim) : null;
    const bottom = L.bottom || 'trunks', top = ref ? 'ref' : (L.top || 'none');
    const tat = L.tattoo && L.tattoo !== 'none' ? L.tattoo : null;
    const armTex = tat && /sleeve|both|full|tribal|barbwire/.test(tat) ? inkTex(skin) : null;
    this.colors = { skin, hairC, gear, trim, bootC };

    /* what covers each part of the body */
    const legCover = ref ? '#1d1d22' : bottom === 'trunks' ? skin : bottom === 'singlet' ? skin : gear;
    const covered = ['tee', 'rash', 'suit', 'gi', 'armor', 'ref'].includes(top);
    const tankish = ['tank', 'crop', 'harness'].includes(top) || bottom === 'singlet' || (this.F && top === 'none');
    const fullTank = (top === 'tank' || top === 'harness' || bottom === 'singlet') && !covered;
    const chestC = top === 'ref' ? '#ffffff' : covered ? (top === 'gi' ? '#ece6da' : top === 'armor' ? shade(gear, 0.7) : gear) : fullTank ? (top === 'harness' ? '#26232a' : gear) : skin;
    const upperArmC = top === 'ref' ? '#1d1d22' : covered && top !== 'ref' ? chestC : skin;
    const shirtMap = top === 'ref' ? refStripes() : (covered && pattern ? pattern : null);
    const tallBoot = ['tall', 'kick', 'combat', 'cowboy', 'hightop', 'platform', 'steel', 'spiked'].includes(L.boots || 'tall');
    const shinC = tallBoot ? bootC : legCover;
    const footC = L.boots === 'wraps' ? shade(skin, 0.95) : bootC;
    this.mat = { chestC, upperArmC, legCover, shinC, footC };

    /* pelvis: the trunks or the tights, then a waistband in the trim colour */
    const hip = this.part(this.pelvis, sphere(), ref ? '#1d1d22' : gear, [0, 0.02, 0], [D.hipW * 1.45, D.torso * 0.2, D.hipW * 1.1], null, { map: covered ? null : pattern });
    hip.userData.k = 'hip';
    if (!ref) this.part(this.pelvis, cyl(1), trim, [0, D.torso * 0.16, 0], [D.hipW * 1.46, 0.09 * S, D.hipW * 1.12], null, { noOutline: true });

    /* chest: one soft mass, a belly under it for the big men, a chest piece
       or top over it, and shoulders as balls so a raised arm leaves no gap */
    const cw = D.shW * 0.95, cd = D.shW * 0.58 + D.belly * 0.12;
    /* THE TORSO IS A V. One ellipsoid read as a mannequin's barrel, so the chest
       is a wide mass high up, the waist a narrower one under it, and the traps
       climb from the shoulders to the neck. A heavier build fills the waist out
       until the V is gone, which is what a super heavyweight looks like. */
    const waistW = cw * (0.66 + D.belly * 0.32) * (this.F ? 0.9 : 1);
    this.part(this.chest, sphere(14), chestC, [0, D.torso * 0.12, 0], [cw, D.torso * 0.38, cd], null, { map: shirtMap });
    this.part(this.chest, sphere(12), chestC, [0, -D.torso * 0.24, 0], [waistW, D.torso * 0.34, cd * (0.86 + D.belly * 0.2)], null, { map: shirtMap });
    if (!this.F) this.part(this.chest, sphere(10), covered ? chestC : skin, [0, D.torso * 0.4, -cd * 0.12], [cw * 0.62, D.torso * 0.14, cd * 0.62], null, { noOutline: true });
    if (D.belly > 0.05) this.part(this.chest, sphere(), chestC, [0, -D.torso * 0.32, D.shW * 0.2], [cw * 0.86, D.torso * 0.32, cd * (0.9 + D.belly * 0.35)]);
    if (!covered && tankish && !fullTank) {
      const tc = this.F && top === 'none' ? gear : (top === 'harness' ? '#26232a' : gear);
      if (top === 'crop' || (this.F && top === 'none')) this.part(this.chest, sphere(12), tc, [0, D.torso * 0.12, 0.02], [cw * 1.04, D.torso * 0.24, cd * 1.06], null, { noOutline: true, map: pattern });
      else this.part(this.chest, sphere(12), tc, [0, -D.torso * 0.08, 0], [cw * 1.03, D.torso * 0.5, cd * 1.05], null, { noOutline: true, map: pattern });
    }
    if (!covered && !tankish && !this.F) {
      /* bare chest: two pecs and a hint of the abs, darker than the skin */
      for (const sd of [1, -1]) this.part(this.chest, sphere(), shade(skin, 0.9), [sd * cw * 0.42, D.torso * 0.2, cd * 0.64], [cw * 0.48, D.torso * 0.15, cd * 0.42], null, { noOutline: true });
      if (D.belly < 0.3) for (let r = 0; r < 2; r++) for (const sd of [1, -1]) this.part(this.chest, sphere(6), shade(skin, 0.86), [sd * waistW * 0.3, -D.torso * (0.1 + r * 0.17), cd * 0.78], [waistW * 0.28, D.torso * 0.075, cd * 0.2], null, { noOutline: true });
    }
    if (tat && /chest|both|full|glyph/.test(tat)) this.part(this.chest, box(), shade(skin, 0.45), [0, D.torso * 0.1, cd * 0.96], [cw * 0.5, D.torso * 0.22, 0.02], null, { noOutline: true });
    if (top === 'sash') this.part(this.chest, box(), gear, [0, -D.torso * 0.02, 0], [D.shW * 0.24, D.torso * 1.1, cd * 2.1], [0, 0, 0.62], { noOutline: true });
    for (const sd of [1, -1]) this.part(this.chest, sphere(), upperArmC, [sd * D.shW * 0.9, D.torso * 0.31, 0], [D.armR * 1.75, D.armR * 1.6, D.armR * 1.6]);
    if (L.acc === 'armorpad' || L.acc === 'spikes' || top === 'armor') for (const sd of [1, -1]) this.part(this.chest, sphere(), trim, [sd * D.shW * 0.9, D.torso * 0.42, 0], [D.armR * 2, D.armR * 1.1, D.armR * 1.8]);
    if (L.acc === 'chain' || L.acc === 'necklace') this.part(this.chest, torusG(0.18), '#e8bc3a', [0, D.torso * 0.36, cd * 0.4], [D.shW * 0.42, D.shW * 0.36, D.shW * 0.42], [Math.PI / 2.4, 0, 0], { noOutline: true });
    /* the neck */
    this.part(this.chest, unitCap(), skin, [0, D.torso * 0.5 + D.neck * 1.1, 0], [D.headR * 0.42 * (1 + D.belly * 0.2), D.neck * 0.45, D.headR * 0.42], null, { noOutline: true });

    /* limbs: built at unit length and stretched every frame by the IK */
    const seg = (name, r, color, map, belly) => {
      const m = this.limbs[name] = this.part(this.root, unitCap(), color, null, [r, 1, r], null, { map }); m.userData.r = r;
      /* a muscle belly on the bone: it rides the segment's stretch, so a bicep stays
         a bicep whatever length the IK hands the arm. Centred on the axis, because
         the segment's twist about its own length is not controlled. */
      if (belly) this.part(m, sphere(10), belly.c || color, [0, -belly.y, 0], [belly.w, belly.l, belly.w], null, { map, noOutline: true });
      return m;
    };
    const bic = { y: 1.2, w: 1.16, l: 1.0 }, fore = { y: 0.85, w: 1.1, l: 0.95 }, quad = { y: 1.15, w: 1.12, l: 1.15 }, calf = { y: 0.95, w: 1.12, l: 0.9 };
    seg('luA', D.armR, upperArmC, armTex && !covered ? armTex : null, bic); seg('ruA', D.armR, upperArmC, null, bic);
    const foreC = top === 'suit' || top === 'gi' || top === 'rash' ? chestC : skin;
    seg('llA', D.armR * 0.84, foreC, null, fore); seg('rlA', D.armR * 0.84, foreC, null, fore);
    const legMap = bottom === 'trunks' || ref ? null : pattern;
    seg('luL', D.legR, legCover, legMap, quad); seg('ruL', D.legR, legCover, legMap, quad);
    seg('llL', D.legR * 0.8, shinC, null, tallBoot ? { y: 0.9, w: 1.12, l: 1.0 } : calf); seg('rlL', D.legR * 0.8, shinC, null, tallBoot ? { y: 0.9, w: 1.12, l: 1.0 } : calf);
    /* trunks are briefs, not a ball: a cuff of the gear colour down the top of each thigh */
    if (bottom === 'trunks' && !ref) for (const n of ['luL', 'ruL']) this.part(this.limbs[n], sphere(10), gear, [0, -0.32, 0], [1.2, 0.4, 1.2], null, { map: pattern, noOutline: true });
    const handC = L.wrists === 'gloves' ? '#26232a' : skin;
    for (const sd of ['l', 'r']) {
      this.limbs[sd + 'H'] = this.part(this.root, sphere(10), handC, null, [D.armR * 1.45, D.armR * 1.5, D.armR * 1.35]);
      const f = new THREE.Group(); this.root.add(f); this.limbs[sd + 'F'] = f;
      this.part(f, sphere(10), footC, [0, D.ankle * 0.45, D.foot * 0.32], [D.legR * 1.0, D.ankle * 0.85, D.foot * 0.7]);
      if (tallBoot || L.boots === 'low' || L.boots === 'sneaks') this.part(f, cyl(1, 10), footC, [0, D.ankle * 1.1, 0], [D.legR * 0.86, D.ankle * 1.3, D.legR * 0.9], null, { noOutline: true });
      if (tallBoot) this.part(f, cyl(1, 10), trim, [0, D.ankle * 2.3, 0], [D.legR * 0.98, 0.07 * S, D.legR * 0.98], null, { noOutline: true });
      /* knee and elbow nodes, placed on the joint every frame, for pads */
      const k = new THREE.Group(); this.root.add(k); this.limbs[sd + 'K'] = k;
      if (L.knees === 'pads' || (L.knees === 'one' && sd === 'l')) this.part(k, sphere(10), shade(gear, 0.6), [0, 0, D.legR * 0.35], [D.legR * 1.2, D.legR * 1.15, D.legR * 0.9]);
      const e = new THREE.Group(); this.root.add(e); this.limbs[sd + 'E'] = e;
      if (L.elbows === 'both' || (L.elbows === 'pad' && sd === 'r')) this.part(e, sphere(8), '#26232a', [0, 0, 0], [D.armR * 1.15, D.armR * 1.15, D.armR * 1.15], null, { noOutline: true });
      if (L.wrists === 'tape' || L.wrists === 'bands') { const w = new THREE.Group(); this.root.add(w); this.limbs[sd + 'W'] = w;
        this.part(w, cyl(1, 8), L.wrists === 'tape' ? '#f2efe8' : trim, [0, 0, 0], [D.armR * 0.98, 0.12 * S, D.armR * 0.98], null, { noOutline: true }); }
    }
    this.buildHead(skin, hairC);
    this.buildGear(gear, trim);
  }

  buildHead(skin, hairC) {
    const L = this.look, D = this.D, H = this.headG, R = D.headR;
    const jaw = 1 + (this.B.wide - 1) * 0.6 + (this.F ? -0.08 : 0.05);
    const sx = R * (this.F ? 0.9 : 0.94), sy = R, sz = R * 0.95;
    this.part(H, superHead(2.5, jaw), skin, null, [sx, sy, sz]);
    const at = (ux, uy, out = 0) => { const r = Math.max(0, 1 - Math.pow(Math.abs(ux), 2.5) - Math.pow(Math.abs(uy), 2.5)); return [ux * sx, uy * sy, Math.pow(r, 1 / 2.5) * sz + out]; };
    const masked = L.mask && L.mask !== 'none';
    const mc = L.gear || '#c6392c', mt = L.trim || '#f2d27a';
    /* the mask is a second shell, a hair larger than the head */
    if (masked) {
      const full = L.mask !== 'half';
      this.part(H, superHead(2.5, jaw, full ? Math.PI : Math.PI * 0.55), mc, null, [sx * 1.06, sy * 1.05, sz * 1.06], null, { noOutline: true });
      for (const ex of [-0.38, 0.38]) this.part(H, sphere(8), mt, at(ex, 0.12, 0.01), [R * 0.26, R * 0.2, R * 0.08], null, { noOutline: true });
      if (L.mask === 'demon' || L.mask === 'bull' || L.mask === 'dragon') for (const sd of [1, -1]) this.part(H, cone(6), mt, [sd * sx * 0.6, sy * 0.85, 0], [R * 0.16, R * 0.5, R * 0.16], [0, 0, -sd * 0.5]);
    }
    /* eyes and brows: dark marks, read from three metres in pixels */
    const scowl = L.mood === 'scowl' ? 0.32 : L.mood === 'grin' ? -0.12 : 0.12;
    for (const ex of [-0.36, 0.36]) {
      this.part(H, box(), '#f6f2ea', at(ex, 0.08, -0.03), [R * 0.3, R * 0.2, R * 0.07], null, { noOutline: true, noShadow: true });
      this.part(H, box(), '#100d14', at(ex * 0.92, 0.06, 0.0), [R * 0.15, R * 0.2, R * 0.06], null, { noOutline: true, noShadow: true });
      if (!masked) this.part(H, box(), shade(hairC, 0.7), at(ex, 0.33, 0.01), [R * 0.4, R * 0.12, R * 0.07], [0, 0, ex > 0 ? -scowl : scowl], { noOutline: true, noShadow: true });
    }
    if (L.shades) this.part(H, box(), '#141218', at(0, 0.12, 0.03), [R * 1.4, R * 0.22, R * 0.1], null, { noOutline: true });
    if (!masked) {
      this.part(H, box(), shade(skin, 0.8), at(0, -0.1, 0.03), [R * 0.18, R * 0.24, R * 0.16], null, { noOutline: true });   /* the nose */
      this.part(H, box(), shade(skin, 0.55), at(0, -0.42, 0), [R * (L.mood === 'grin' ? 0.46 : 0.34), R * 0.06, R * 0.05], null, { noOutline: true });
      /* face paint, the few that read at this size */
      if (L.paint === 'skull') this.part(H, superHead(2.5, jaw, Math.PI * 0.62), '#ece8de', [0, 0, 0.02], [sx * 1.02, sy * 1.02, sz * 1.02], [0.4, 0, 0], { noOutline: true });
      if (L.paint === 'bars' || L.paint === 'visor') this.part(H, box(), '#18151c', at(0, 0.1, 0.02), [R * 1.5, R * 0.12, R * 0.08], null, { noOutline: true });
      if (L.paint === 'split') this.part(H, superHead(2.5, jaw), '#ece8de', [sx * 0.02, 0, 0], [sx * 0.52, sy * 1.01, sz * 1.01], null, { noOutline: true });
      if (L.paint === 'crimson') this.part(H, box(), '#9b1b1b', at(0.2, 0.55, 0.02), [R * 0.2, R * 0.5, R * 0.05], null, { noOutline: true });
    }
    /* ears */
    if (!masked) for (const sd of [1, -1]) this.part(H, sphere(6), shade(skin, 0.92), [sd * sx * 0.98, sy * 0.02, -sz * 0.05], [R * 0.13, R * 0.22, R * 0.12], null, { noOutline: true });
    this.buildFacial(at, hairC, masked);
    if (!masked || L.mask === 'half') this.buildHair(sx, sy, sz, R, hairC, masked);
  }

  buildFacial(at, hairC, masked) {
    const L = this.look, R = this.D.headR, H = this.headG, f = L.facial || 'none';
    if (f === 'none' || (masked && L.mask !== 'half')) return;
    const bc = shade(hairC, 0.95);
    if (f === 'stache' || f === 'handlebar') this.part(H, box(), bc, at(0, -0.28, 0.03), [R * (f === 'handlebar' ? 0.75 : 0.5), R * 0.1, R * 0.12], null, { noOutline: true });
    if (f === 'goatee' || f === 'soul') this.part(H, box(), bc, at(0, -0.62, 0.02), [R * 0.3, R * (f === 'soul' ? 0.12 : 0.26), R * 0.14], null, { noOutline: true });
    if (f === 'beard' || f === 'longbeard' || f === 'mutton') {
      const long = f === 'longbeard';
      this.part(H, sphere(10), bc, [0, -R * (long ? 0.72 : 0.5), R * 0.42], [R * 0.78, R * (long ? 0.62 : 0.42), R * 0.5]);
      if (f !== 'mutton') this.part(H, box(), bc, at(0, -0.28, 0.03), [R * 0.6, R * 0.12, R * 0.12], null, { noOutline: true });
    }
    if (f === 'stubble') this.part(H, sphere(10), shade(this.colors.skin, 0.78), [0, -R * 0.38, R * 0.3], [R * 0.82, R * 0.42, R * 0.62], null, { noOutline: true });
  }

  buildHair(sx, sy, sz, R, hc, masked) {
    const L = this.look, H = this.headG, raw = L.hair || 'short', s = HAIRBASE[raw] || raw;
    if (s === 'bald') return;
    const dye = raw === 'frosted' ? '#f2e6a8' : raw === 'flames' ? '#ef6a1f' : null;
    /* a cap of hair over the crown, a little bigger than the head */
    const capTheta = { buzz: 1.05, short: 1.15, slick: 1.2, long: 1.45, mohawk: 0.7, pony: 1.2, afro: 1.3, mullet: 1.35, topknot: 1.1, dreads: 1.4, spiky: 1.1 }[s] || 1.15;
    const thick = s === 'buzz' ? 1.03 : s === 'afro' ? 1.35 : 1.08;
    if (s !== 'mohawk') this.part(H, superHead(2.5, 1, capTheta), hc, [0, sy * 0.06, -sz * 0.04], [sx * thick, sy * thick, sz * thick], [-0.18, 0, 0]);
    if (s === 'afro') this.part(H, sphere(12), hc, [0, sy * 0.55, -sz * 0.15], [sx * 1.45, sy * 1.0, sz * 1.35]);
    if (s === 'mohawk') this.part(H, box(), dye || hc, [0, sy * 1.0, -sz * 0.05], [R * 0.24, R * 0.62, R * 1.7], [-0.2, 0, 0]);
    if (s === 'spiky' || raw === 'hornhair') for (let i = 0; i < 6; i++) { const a = (i / 5 - 0.5) * 2.0;
      this.part(H, cone(5), dye || hc, [Math.sin(a) * sx * 0.62, sy * 0.92, -Math.cos(a) * sz * 0.2], [R * 0.16, R * 0.5, R * 0.16], [-0.3, 0, -a * 0.5]); }
    if (s === 'long' || s === 'mullet' || s === 'dreads') {
      const len = raw === 'waist' ? 2.6 : s === 'mullet' ? 1.1 : 1.6;
      this.part(H, box(), hc, [0, -sy * (0.2 + len * 0.3), -sz * 0.7], [sx * 1.7, sy * len, sz * 0.5]);
      if (s === 'long' || s === 'dreads') for (const sd of [1, -1]) this.part(H, box(), hc, [sd * sx * 0.92, -sy * (0.1 + len * 0.2), -sz * 0.2], [sx * 0.3, sy * len * 0.75, sz * 0.8]);
    }
    if (s === 'pony') this.part(H, unitCap(), hc, [0, sy * 0.2, -sz * 1.0], [R * 0.2, R * 0.4, R * 0.2], [-2.6, 0, 0]);
    if (s === 'topknot' || raw === 'bun') this.part(H, sphere(8), hc, [0, sy * 1.12, -sz * 0.2], [R * 0.32, R * 0.3, R * 0.32]);
  }

  /* the belt and the entrance gear: nodes that can be switched on and off */
  buildGear(gear, trim) {
    const D = this.D, S = this.S;
    this.beltNode = new THREE.Group(); this.pelvis.add(this.beltNode);
    this.part(this.beltNode, cyl(1, 14), '#e2ad38', [0, D.torso * 0.18, 0], [D.hipW * 1.52, 0.3 * S, D.hipW * 1.2]);
    this.part(this.beltNode, box(), '#f7d774', [0, D.torso * 0.18, D.hipW * 1.2], [0.62 * S, 0.44 * S, 0.08 * S], null, { noOutline: true });
    this.shoulderBelt = new THREE.Group(); this.chest.add(this.shoulderBelt);
    this.part(this.shoulderBelt, box(), '#e2ad38', [0, 0, 0], [D.shW * 0.3, D.torso * 1.15, D.shW * 1.35], [0, 0, 0.62]);
    this.part(this.shoulderBelt, box(), '#f7d774', [D.shW * 0.25, D.torso * 0.08, D.shW * 0.7], [0.55 * S, 0.4 * S, 0.08 * S], null, { noOutline: true });
    /* the entrance robe or jacket: a flared skirt from the chest and full sleeves */
    const ent = this.look.entrance && this.look.entrance !== 'none' ? this.look.entrance : 'robe';
    const ec = ent === 'cape' ? gear : shade(gear, 1.08);
    this.entNode = new THREE.Group(); this.chest.add(this.entNode);
    if (ent === 'cape') this.part(this.entNode, box(), ec, [0, -D.torso * 0.55, -D.shW * 0.68], [D.shW * 2.1, D.torso * 1.7, 0.08 * S]);
    else {
      const long = ent === 'robe' || ent === 'duster';
      this.part(this.entNode, cyl(0.72, 14), ec, [0, -D.torso * (long ? 0.95 : 0.35), -D.shW * 0.02], [D.shW * 1.2, D.torso * (long ? 2.0 : 1.2), D.shW * 0.92]);
      this.part(this.entNode, torusG(0.35), trim, [0, D.torso * 0.42, 0], [D.shW * 0.62, D.shW * 0.5, D.shW * 0.62], [Math.PI / 2, 0, 0], { noOutline: true });
    }
  }

  setBelt(kind) { this.beltNode.visible = kind === 'waist'; this.shoulderBelt.visible = kind === 'shoulder'; this.belt = kind; }
  setEntrance(on) { this.entNode.visible = !!on; }

  bake() {
    const units = [this.root, this.pelvis, this.chest, this.headG, this.beltNode, this.shoulderBelt, this.entNode, ...Object.values(this.limbs)].filter(Boolean);
    const uset = new Set(units);
    this.root.updateMatrixWorld(true);
    const inv = new Map(units.map((u) => [u, new THREE.Matrix4().copy(u.matrixWorld).invert()]));
    const unitOf = (o) => { if (uset.has(o)) return o; let p = o.parent; while (p && !uset.has(p)) p = p.parent; return p; };
    const buckets = new Map(), found = [];
    this.root.traverse((o) => { if (o.isMesh && !o.userData.baked) found.push(o); });
    for (const m of found) {
      const u = unitOf(m); if (!u) continue;
      const key = m.userData.outline ? 'ink' : (m.material.isMeshToonMaterial && !m.material.map) ? 'vc' : m.material.uuid;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push({ m, bone: units.indexOf(u), inv: inv.get(u) });
    }
    const skel = new VisSkeleton(units, this.root);
    this.baked = [];
    for (const [key, b] of buckets) {
      const ink = key === 'ink', vc = key === 'vc';
      const geo = mergeSkinned(b, vc ? (m) => m.material.color : null, ink ? (m) => m.material.userData.w || 0 : null);
      const sm = new THREE.SkinnedMesh(geo, ink ? INK : vc ? TOON_VC : b[0].m.material);
      sm.bind(skel, new THREE.Matrix4());
      sm.frustumCulled = false; sm.castShadow = !ink; sm.userData.baked = true;
      if (ink) sm.userData.outline = true;
      this.root.add(sm); this.baked.push(sm);
    }
    for (const m of found) {
      if (uset.has(m)) { m.geometry = EMPTY; m.material = TOON_VC; m.castShadow = false; m.userData.baked = true; m.isMesh = false; m.type = 'Object3D'; }
      else m.parent.remove(m);
    }
    this.meshes = [];
  }

  dispose() { for (const sm of this.baked || []) sm.geometry.dispose(); if (this.baked && this.baked[0]) this.baked[0].skeleton.dispose(); }

  /* ------------------------------------------------------------ posing
     Pose fields (poses.js writes them):
       p    pelvis [x, y, z] in the root frame. x and z in feet of a standard
            body, y as a share of straight leg height (1 is standing tall)
       pr   pelvis rotation, cr chest rotation (on the pelvis), hr head (on the chest), YXZ
       lh, rh  hand targets in the chest frame, feet from the shoulder line's middle
       lf, rf  ankle targets in the PELVIS frame, from the hip line's middle:
            x, z in feet of a standard body, y as a share of leg length (-1 is a straight leg down)
       pl   plant, 0 to 1: how far the ankles are pulled down onto the floor of the root frame
       lk, rk  knee pole bias forward (positive bends the knee toward the face side)
     A missing field is the standing pose's. */
  apply(P) {
    const D = this.D, S = this.S;
    const v3 = this._v || (this._v = { a: new THREE.Vector3(), b: new THREE.Vector3(), c: new THREE.Vector3(), q: new THREE.Quaternion(), m: new THREE.Matrix4(), e: new THREE.Euler() });
    const p = P.p || [0, 1, 0], pr = P.pr || Z3, cr = P.cr || Z3, hr = P.hr || Z3;
    this.pelvis.position.set(p[0] * S, D.legL * p[1] + D.ankle * Math.min(1, p[1] + 0.2), p[2] * S);
    this.pelvis.rotation.set(pr[0], pr[1], pr[2], 'YXZ');
    this.chest.rotation.set(cr[0], cr[1], cr[2], 'YXZ');
    this.headG.rotation.set(hr[0], hr[1], hr[2], 'YXZ');
    this.pelvis.updateMatrix(); this.chest.updateMatrix(); this.headG.updateMatrix();
    /* everything below is in the root frame: the limbs hang off the root */
    const pelM = this.pelvis.matrix;
    const chestM = new THREE.Matrix4().multiplyMatrices(pelM, this.chest.matrix);
    const chestQ = new THREE.Quaternion().setFromRotationMatrix(chestM);
    const pelQ = new THREE.Quaternion().setFromRotationMatrix(pelM);
    const at = (M, x, y, z) => new THREE.Vector3(x, y, z).applyMatrix4(M);
    const shY = D.torso * 0.32;
    const lS = at(chestM, D.shW * 0.86, shY, 0), rS = at(chestM, -D.shW * 0.86, shY, 0);
    const shC = at(chestM, 0, shY, 0);
    const lh = P.lh || STAND_LH, rh = P.rh || STAND_RH;
    const lT = shC.clone().add(new THREE.Vector3(lh[0], lh[1], lh[2]).multiplyScalar(S).applyQuaternion(chestQ));
    const rT = shC.clone().add(new THREE.Vector3(rh[0], rh[1], rh[2]).multiplyScalar(S).applyQuaternion(chestQ));
    const back = new THREE.Vector3(0, -0.3, -1).applyQuaternion(chestQ);
    this.ik('luA', 'llA', lS, lT, D.ua, D.la, back.clone().add(new THREE.Vector3(0.7, 0, 0).applyQuaternion(chestQ)), 'lH', 'lE', 'lW');
    this.ik('ruA', 'rlA', rS, rT, D.ua, D.la, back.clone().add(new THREE.Vector3(-0.7, 0, 0).applyQuaternion(chestQ)), 'rH', 'rE', 'rW');
    /* legs: ankle targets in the pelvis frame, then planted */
    const lf = P.lf || STAND_LF, rf = P.rf || STAND_RF, pl = P.pl == null ? 1 : P.pl;
    const hipLine = -D.legR * 0.15;
    const lHip = at(pelM, D.hipW * 0.78, hipLine, 0), rHip = at(pelM, -D.hipW * 0.78, hipLine, 0);
    /* Two rules no pose may break. An ankle never goes through the canvas (a
       blend from lying to standing points the pelvis frame's down at the floor
       from a pelvis a foot off it, and the target lands two feet under), and it
       never reaches past the leg, because the foot is drawn AT the target and a
       target the shin cannot reach is a foot hanging off on its own. */
    const floor = (this.floorY == null ? 0 : this.floorY) + D.ankle * 0.6, reach = (D.th + D.sh) * 0.995;
    const legT = (f, hipP) => {
      const t = at(pelM, f[0] * S, f[1] * D.legL + hipLine, f[2] * S);
      if (pl > 0) { const g = D.ankle; t.y = t.y + (g - t.y) * pl; }
      if (t.y < floor) t.y = floor;
      const d = t.clone().sub(hipP), L = d.length();
      if (L > reach) t.copy(hipP).add(d.multiplyScalar(reach / L));
      return t;
    };
    const lA = legT(lf, lHip), rA = legT(rf, rHip);
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(pelQ);
    this.ik('luL', 'llL', lHip, lA, D.th, D.sh, fwd.clone().multiplyScalar(1 + (P.lk || 0)).add(new THREE.Vector3(0.12, 0, 0).applyQuaternion(pelQ)), null, 'lK');
    this.ik('ruL', 'rlL', rHip, rA, D.th, D.sh, fwd.clone().multiplyScalar(1 + (P.rk || 0)).add(new THREE.Vector3(-0.12, 0, 0).applyQuaternion(pelQ)), null, 'rK');
    /* the feet: they follow the shin, and lie flat when planted */
    for (const [sd, A, sh] of [['l', lA, 'llL'], ['r', rA, 'rlL']]) {
      const f = this.limbs[sd + 'F']; f.position.copy(A).add(new THREE.Vector3(0, -D.ankle, 0).applyQuaternion(pl > 0.5 ? IDQ : pelQ));
      if (pl > 0.5) { v3.e.set(P[sd + 'fp'] || 0, pr[1] + (P[sd + 'fy'] || 0), 0, 'YXZ'); f.quaternion.setFromEuler(v3.e); }
      else f.quaternion.copy(pelQ).multiply(v3.q.setFromEuler(v3.e.set(P[sd + 'fp'] || 0.2, P[sd + 'fy'] || 0, 0)));
    }
  }

  ik(upper, lower, S0, T, a, b, pole, hand, mid, wrist) {
    const d0 = T.clone().sub(S0); let d = d0.length(); const u = d0.normalize();
    d = Math.max(Math.abs(a - b) + 1e-3, Math.min(a + b - 1e-3, d));
    const x = (a * a + d * d - b * b) / (2 * d), h = Math.sqrt(Math.max(0, a * a - x * x));
    const pv = pole.clone().sub(u.clone().multiplyScalar(pole.dot(u))); if (pv.lengthSq() < 1e-6) pv.set(0, 0, 1); pv.normalize();
    const E = S0.clone().addScaledVector(u, x).addScaledVector(pv, h);
    const W = S0.clone().addScaledVector(u, d);
    this.seg(this.limbs[upper], S0, E); this.seg(this.limbs[lower], E, W);
    if (hand) { const hm = this.limbs[hand]; hm.position.copy(W); hm.quaternion.copy(this.limbs[lower].quaternion); }
    if (mid && this.limbs[mid]) { const k = this.limbs[mid]; k.position.copy(E); k.quaternion.copy(this.limbs[lower].quaternion); }
    if (wrist && this.limbs[wrist]) { const w = this.limbs[wrist]; w.position.copy(E).lerp(W, 0.86); w.quaternion.copy(this.limbs[lower].quaternion); }
  }
  seg(m, A, B) {
    const dir = B.clone().sub(A), L = dir.length(), r = m.userData.r;
    m.position.copy(A); m.quaternion.setFromUnitVectors(DOWN, dir.normalize());
    m.scale.set(r, Math.max(0.01, L / 3), r);
  }

  /* a named point of the posed body, in world space */
  point(name) {
    this.root.updateMatrixWorld(true);
    const v = new THREE.Vector3();
    if (name === 'pelvis') return this.pelvis.getWorldPosition(v);
    if (name === 'chest') return this.chest.getWorldPosition(v);
    if (name === 'head') return this.headG.getWorldPosition(v);
    if (name === 'hands') { const a = this.limbs.lH.getWorldPosition(new THREE.Vector3()), b = this.limbs.rH.getWorldPosition(v); return a.add(b).multiplyScalar(0.5); }
    if (this.limbs[name]) return this.limbs[name].getWorldPosition(v);
    return this.root.getWorldPosition(v);
  }
  height() { return this.D.hipY + this.D.torso + this.D.neck + this.D.headR * 2; }
}
const Z3 = [0, 0, 0];
const DOWN = new THREE.Vector3(0, -1, 0);
const IDQ = new THREE.Quaternion();
const STAND_LH = [0.52, -1.75, 0.18], STAND_RH = [-0.52, -1.75, 0.18];
const STAND_LF = [0.42, -0.99, 0.04], STAND_RF = [-0.42, -0.99, 0.04];

/* the look the game hands over can be legacy or new; normalise through
   RTR_PX when it is loaded, else take it as it is */
export function lookOf(L) {
  const PX = typeof window !== 'undefined' && window.RTR_PX;
  if (!L) return PX ? PX.normal({}) : {};
  if (L.attire === 'ref') { const o = PX ? PX.fromLegacy(L) : Object.assign({}, L); o.ref = true; return o; }
  return PX ? (L.v === 2 ? PX.normal(L) : PX.fromLegacy(L)) : L;
}
export { SKINS, HAIR_COLORS, shade, lumOf };
