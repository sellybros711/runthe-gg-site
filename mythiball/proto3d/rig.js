/* MythiBall 3D prototype: the character rig.

   One body, built from a character's entry in sprites/cast.js, so all 68 come
   out of the same code and share every animation. Nothing here is a model
   file: heads are superellipsoids shaped by the cast's hn/hw/hh/taper/jaw,
   limbs are capsules, and hair, hats, beards and props are small primitives.

   The trunk is a hierarchy (root, pelvis, chest, head). The limbs are not:
   each frame a pose names where the hands and feet should be, and a two bone
   IK solve places the upper and lower segments. That is what lets one pose
   table drive a kid and a giant, and what keeps both hands on the bat
   whatever the swing is doing.

   Conventions, which every pose in anim.js depends on:
     the character faces +z in its own frame, up is +y,
     its LEFT is +x and its RIGHT is -x,
     positive x rotation leans forward, positive y rotation turns toward +x. */
import * as THREE from './vendor/three-0.180.0/three.module.min.js';

/* ---------------------------------------------------------------- materials */
const GRAD = (() => {
  const d = new Uint8Array([70, 70, 70, 255, 160, 160, 160, 255, 255, 255, 255, 255]);
  const t = new THREE.DataTexture(d, 3, 1, THREE.RGBAFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true; return t;
})();
const MATS = new Map();
export function toon(color, map) {
  const key = color + (map ? '|' + map.uuid : '');
  let m = MATS.get(key);
  if (!m) { m = new THREE.MeshToonMaterial({ color: new THREE.Color(color), gradientMap: GRAD, map: map || null }); MATS.set(key, m); }
  return m;
}
/* The ink line is the mesh again, pushed out along its normals and drawn from
   the inside. A basic material keeps the scene fog, so a far outline fades with
   the body it belongs to instead of staying black at the horizon. */
const OUT = new Map();
function outlineMat(w) {
  const k = w.toFixed(3);
  let m = OUT.get(k);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color: 0x14121a, side: THREE.BackSide });
    m.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>',
        'vec3 transformed = vec3(position) + normalize(normal) * ' + w.toFixed(4) + ';');
    };
    m.customProgramCacheKey = () => 'ol' + k;
    OUT.set(k, m);
  }
  return m;
}
export const OPTS = { outlines: true };

function shade(hex, f) {
  const c = new THREE.Color(hex); const h = {}; c.getHSL(h);
  c.setHSL(h.h, h.s, Math.max(0, Math.min(1, h.l * f))); return '#' + c.getHexString();
}
const TEX = new Map();
function patternTex(kind, c, c2) {
  const key = kind + c + c2; if (TEX.has(key)) return TEX.get(key);
  const cv = document.createElement('canvas'); cv.width = cv.height = 16;
  const g = cv.getContext('2d'); g.fillStyle = c; g.fillRect(0, 0, 16, 16); g.fillStyle = c2;
  if (kind === 'stripes') for (let x = 0; x < 16; x += 4) g.fillRect(x, 0, 2, 16);
  else if (kind === 'hstripe') for (let y = 0; y < 16; y += 4) g.fillRect(0, y, 16, 2);
  else if (kind === 'plaid' || kind === 'gingham') {
    g.globalAlpha = 0.55; for (let i = 0; i < 16; i += 6) { g.fillRect(i, 0, 2, 16); g.fillRect(0, i, 16, 2); }
  } else if (kind === 'dots' || kind === 'leopard') for (let y = 1; y < 16; y += 5) for (let x = (y % 2) * 2 + 1; x < 16; x += 5) g.fillRect(x, y, 2, 2);
  else if (kind === 'fur') { g.globalAlpha = 0.5; for (let i = 0; i < 18; i++) g.fillRect((i * 7) % 16, (i * 11) % 16, 1, 2); }
  const t = new THREE.CanvasTexture(cv); t.magFilter = t.minFilter = THREE.NearestFilter;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, 2); t.colorSpace = THREE.SRGBColorSpace;
  TEX.set(key, t); return t;
}

/* ---------------------------------------------------------------- geometry */
const GEO = new Map();
function cached(key, make) { let g = GEO.get(key); if (!g) { g = make(); GEO.set(key, g); } return g; }
const unitCap = () => cached('cap', () => new THREE.CapsuleGeometry(1, 1, 4, 10).translate(0, -1.5, 0));
const sphere = (seg = 12) => cached('sph' + seg, () => new THREE.SphereGeometry(1, seg, Math.max(6, seg * 0.75 | 0)));
const box = () => cached('box', () => new THREE.BoxGeometry(1, 1, 1));
const cyl = (top, seg = 12) => cached('cyl' + top + seg, () => new THREE.CylinderGeometry(top, 1, 1, seg));
const cone = (seg = 10) => cached('cone' + seg, () => new THREE.ConeGeometry(1, 1, seg));
const torusG = (t) => cached('tor' + t, () => new THREE.TorusGeometry(1, t, 6, 16));

/* A superellipsoid: n = 2 is a ball, 4 and up a soft block. taper widens the
   top and jaw the bottom, which is how the cast tells Humpty from Frankenstein. */
function superHead(n, taper, jaw, thetaLen) {
  const key = ['sh', n, taper, jaw, thetaLen || 0].join('|');
  return cached(key, () => {
    const g = new THREE.SphereGeometry(1, 18, 14, 0, Math.PI * 2, 0, thetaLen || Math.PI);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const s = Math.pow(Math.pow(Math.abs(x), n) + Math.pow(Math.abs(y), n) + Math.pow(Math.abs(z), n), -1 / n);
      x *= s; y *= s; z *= s;
      const w = y > 0 ? 1 + (taper - 1) * y : 1 + (jaw - 1) * -y;
      p.setXYZ(i, x * w, y, z * w);
    }
    g.computeVertexNormals(); return g;
  });
}
function headSurfZ(n, taper, jaw, ux, uy) {
  const w = uy > 0 ? 1 + (taper - 1) * uy : 1 + (jaw - 1) * -uy;
  const x = ux / w; const r = 1 - Math.pow(Math.abs(x), n) - Math.pow(Math.abs(uy), n);
  return r <= 0 ? 0 : Math.pow(r, 1 / n) * w;
}

/* ------------------------------------------------------------------ builds */
const BUILDS = {
  standard: { S: 1, head: 1, leg: 1, arm: 1, wide: 1, belly: 0 },
  kid:     { S: 0.84, head: 1.1, leg: 0.88, arm: 0.92, wide: 0.95, belly: 0 },
  small:   { S: 0.8, head: 1.12, leg: 0.85, arm: 0.9, wide: 0.95, belly: 0.1 },
  lanky:   { S: 1.08, head: 0.95, leg: 1.12, arm: 1.12, wide: 0.86, belly: 0 },
  stocky:  { S: 1.0, head: 1.0, leg: 0.92, arm: 1.0, wide: 1.2, belly: 0.25 },
  giant:   { S: 1.2, head: 1.0, leg: 1.0, arm: 1.05, wide: 1.3, belly: 0.2 },
  round:   { S: 0.95, head: 1.02, leg: 0.88, arm: 0.95, wide: 1.22, belly: 0.9 },
};
const BASE = { headR: 0.66, neck: 0.14, torso: 1.45, shW: 0.62, hipW: 0.3, ua: 0.88, la: 0.82, armR: 0.19, th: 1.0, sh: 0.95, legR: 0.26, foot: 0.55, ankle: 0.13 };

const colorOf = (v, skin, dflt) => (!v ? dflt : v === 'skin' ? skin : v === 'paws' || v === 'hooves' ? null : v === 'bare' ? skin : v);

/* ---------------------------------------------------------------- character */
export class Character {
  constructor(key, spec, opts = {}) {
    this.key = key; this.spec = spec = spec || {};
    const b = BUILDS[spec.build] || BUILDS.standard, body = spec.body || {};
    const S = (spec.scale || 1) * b.S; this.S = S;
    const hscale = b.head * ((body.head || 11) / 11);
    const W = b.wide * ((body.tw || 20) / 20);
    this.D = {
      headR: BASE.headR * hscale * S, neck: BASE.neck * (1 + (body.neck || 0) * 0.5) * S,
      torso: BASE.torso * S * ((body.th || 12) / 12), shW: BASE.shW * W * S, hipW: BASE.hipW * W * S,
      ua: BASE.ua * b.arm * S, la: BASE.la * b.arm * S, armR: BASE.armR * Math.sqrt(W) * S * (spec.build === 'giant' ? 1.25 : 1),
      th: BASE.th * b.leg * S, sh: BASE.sh * b.leg * S, legR: BASE.legR * Math.sqrt(W) * S, foot: BASE.foot * S, ankle: BASE.ankle * S,
      belly: Math.max(b.belly, body.belly || 0), hunch: (body.hunch || 0) * 0.025,
    };
    if (spec.egg) { this.D.headR *= 2.0; this.D.torso *= 0.45; }
    this.D.legL = this.D.th + this.D.sh; this.D.armL = this.D.ua + this.D.la;
    this.lw = 0.035 * Math.max(0.85, S);
    this.root = new THREE.Group(); this.root.name = key;
    this.pelvis = new THREE.Group(); this.chest = new THREE.Group(); this.headG = new THREE.Group();
    this.root.add(this.pelvis); this.pelvis.add(this.chest); this.chest.add(this.headG);
    this.chest.position.y = this.D.torso * 0.62; this.headG.position.y = this.D.torso * 0.38 + this.D.neck + this.D.headR * 0.92;
    this.limbs = {}; this.meshes = [];
    this.build();
    this.bat = this.makeBat(); this.glove = this.makeGlove(); this.prop = this.makeProp();
    this.root.add(this.bat, this.glove); if (this.prop) this.root.add(this.prop);
    this.bat.visible = this.glove.visible = false; if (this.prop) this.prop.visible = false;
    this.lefty = false;
  }

  part(parent, geo, color, pos, scale, rot, opts = {}) {
    const m = new THREE.Mesh(geo, typeof color === 'string' ? toon(color, opts.map) : color);
    if (pos) m.position.set(pos[0], pos[1], pos[2]);
    if (scale) m.scale.set(scale[0], scale[1], scale[2]);
    if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
    m.castShadow = !opts.noShadow;
    parent.add(m); this.meshes.push(m);
    if (!opts.noOutline) { const o = new THREE.Mesh(geo, outlineMat(this.lw / Math.max(0.05, Math.min(m.scale.x, m.scale.y, m.scale.z)) * (opts.olk || 1))); o.userData.outline = true; m.add(o); }
    return m;
  }

  build() {
    const s = this.spec, D = this.D;
    const skin = s.skin || '#f0c49c';
    const top = s.top || { c: '#d0d0d0' };
    const topC = top.c || '#d0d0d0';
    const pat = ['stripes', 'hstripe', 'plaid', 'gingham', 'dots', 'leopard', 'fur'].includes(top.p) ? patternTex(top.p, topC, top.c2 || shade(topC, 0.7)) : null;
    const sleeve = colorOf(s.sleeve, skin, topC);
    const forearm = colorOf(s.forearm, skin, sleeve);
    const pants = colorOf(s.pants, skin, '#3a3a48');
    const handC = s.hands || skin;
    const shoeC = s.shoes === 'paws' ? (s.hands || shade(skin, 0.8)) : s.shoes === 'hooves' ? '#2a2020' : s.shoes === 'bare' ? skin : (s.shoes || '#2a2420');
    this.colors = { skin, topC, sleeve, forearm, pants, handC, shoeC };

    /* pelvis and chest */
    const hipY = D.legL + D.ankle;
    this.hipY = hipY;
    if (!s.egg) {
      this.part(this.pelvis, sphere(), pants, [0, 0.02, 0], [D.hipW * 1.35, D.torso * 0.24, D.hipW * 1.05]);
      this.part(this.chest, sphere(14), topC, [0, -D.torso * 0.1, 0.02], [D.shW * 0.92, D.torso * 0.5, D.shW * 0.62 + D.belly * 0.12 * this.S], null, { map: pat });
      if (D.belly > 0.05) this.part(this.chest, sphere(), topC, [0, -D.torso * 0.32, D.shW * 0.25], [D.shW * 0.75, D.torso * 0.3, D.shW * 0.55 * (0.6 + D.belly * 0.5)], null, { map: pat });
      /* shoulders as balls, so a raised arm does not open a gap in the jacket */
      for (const sd of [1, -1]) this.part(this.chest, sphere(), sleeve, [sd * D.shW * 0.82, D.torso * 0.24, 0], [D.armR * 1.35, D.armR * 1.3, D.armR * 1.3]);
      if (top.collar) this.part(this.chest, torusG(0.4), top.collar, [0, D.torso * 0.36, 0], [D.shW * 0.42, D.shW * 0.3, D.shW * 0.42], [Math.PI / 2, 0, 0]);
      if (top.tie) this.part(this.chest, box(), top.tie, [0, D.torso * 0.12, D.shW * 0.6], [0.12 * this.S, D.torso * 0.32, 0.06 * this.S]);
      if (top.p === 'vest' || top.p === 'coat' || top.p === 'jacket' || top.p === 'apron' || top.p === 'bib' || top.p === 'overalls')
        this.part(this.chest, box(), top.c2 || shade(topC, 1.3), [0, -D.torso * 0.12, D.shW * 0.56], [D.shW * 0.55, D.torso * 0.62, 0.06 * this.S], null, { noOutline: true });
      if (top.p === 'toga' || top.p === 'sash') this.part(this.chest, box(), top.c2 || '#e8bc3a', [0, -D.torso * 0.05, D.shW * 0.04], [D.shW * 0.2, D.torso * 1.05, D.shW * 1.3], [0, 0, 0.7], { noOutline: true });
      if (top.p === 'buttons') for (let i = 0; i < 3; i++) this.part(this.chest, sphere(6), top.c2 || '#e8bc3a', [0, D.torso * (0.16 - i * 0.16), D.shW * 0.62], [0.05 * this.S, 0.05 * this.S, 0.05 * this.S], null, { noOutline: true });
      const belt = s.belt || s.eggBelt;
      if (belt) { this.part(this.pelvis, cyl(1), belt, [0, D.torso * 0.2, 0], [D.hipW * 1.42, 0.14 * this.S, D.hipW * 1.12]);
        if (s.buckle) this.part(this.pelvis, box(), s.buckle, [0, D.torso * 0.2, D.hipW * 1.12], [0.16 * this.S, 0.13 * this.S, 0.05 * this.S], null, { noOutline: true }); }
      if (s.skirt) {
        const sk = s.skirt, len = sk.long ? D.legL * 0.95 : Math.min(D.legL * 0.75, (sk.l || 5) * 0.11 * this.S);
        const fl = (sk.flare || 1.2) * (sk.long ? 1.55 : 1.1);
        this.skirt = this.part(this.pelvis, cyl(1 / fl, 14), sk.c, [0, -len / 2 + D.torso * 0.15, 0], [D.hipW * 1.5 * fl, len, D.hipW * 1.25 * fl]);
        if (sk.hem) this.part(this.skirt, cyl(1, 14), sk.hem, [0, -0.47, 0], [1.01, 0.08, 1.01], null, { noOutline: true });
      }
      if (s.cape) this.part(this.chest, box(), s.cape, [0, -D.torso * 0.35, -D.shW * 0.55], [D.shW * 1.7, D.torso * 1.25, 0.05 * this.S]);
      if (s.wings) { const wc = s.wings.c || '#ffffff', ws = (s.wings.size || 1) * this.S;
        for (const sd of [1, -1]) this.part(this.chest, sphere(), wc, [sd * D.shW * 0.9, D.torso * 0.25, -D.shW * 0.75], [0.9 * ws, 0.55 * ws, 0.05 * ws], [0, sd * 0.5, sd * 0.4]); }
      if (s.tail) { const tc = s.tail.c || skin;
        const t = this.part(this.pelvis, unitCap(), tc, [0, 0, -D.hipW * 1.05], [0.1 * this.S * (s.tail.w || 1), 0.55 * this.S * (s.tail.size || 1), 0.1 * this.S * (s.tail.w || 1)], [-2.2, 0, 0]);
        if (s.tail.tip) this.part(t, sphere(8), s.tail.tip, [0, -2.2, 0], [1.6, 0.6, 1.6], null, { noOutline: true }); }
      if (s.spikes) for (let i = 0; i < 4; i++) this.part(this.chest, cone(5), s.spikes, [0, D.torso * (0.3 - i * 0.2), -D.shW * 0.6], [0.1 * this.S, 0.25 * this.S, 0.1 * this.S], [-1.2, 0, 0]);
    }
    /* neck */
    if (!s.headless && !s.egg) this.part(this.chest, unitCap(), skin, [0, D.torso * 0.38 + D.neck * 0.9, 0], [D.headR * 0.32, D.neck * 0.5, D.headR * 0.32], null, { noOutline: true });

    /* limbs: built at unit length and stretched every frame by the IK */
    const seg = (name, r, color, parent) => { this.limbs[name] = this.part(parent || this.root, unitCap(), color, null, [r, 1, r]); this.limbs[name].userData.r = r; };
    seg('luA', D.armR, sleeve); seg('ruA', D.armR, sleeve);
    seg('llA', D.armR * 0.9, forearm); seg('rlA', D.armR * 0.9, forearm);
    seg('luL', D.legR, pants); seg('ruL', D.legR, pants);
    seg('llL', D.legR * 0.88, s.socks || pants); seg('rlL', D.legR * 0.88, s.socks || pants);
    for (const sd of ['l', 'r']) {
      this.limbs[sd + 'H'] = this.part(this.root, sphere(10), handC, null, [D.armR * 1.25, D.armR * 1.25, D.armR * 1.25]);
      const f = new THREE.Group(); this.root.add(f); this.limbs[sd + 'F'] = f;
      this.part(f, sphere(10), shoeC, [0, D.ankle * 0.45, D.foot * 0.28], [D.legR * 1.05, D.ankle * 0.75, D.foot * 0.62]);
    }
    if (!s.headless) this.buildHead();
  }

  buildHead() {
    const s = this.spec, D = this.D, body = s.body || {}, H = this.headG, R = D.headR;
    const n = s.egg ? 2 : (body.hn || 2.4), taper = body.taper || 1, jaw = body.jaw || 1;
    const hw = body.hw || 1, hh = (body.hh || 1) * (s.egg ? 1.25 : 1);
    const sx = R * hw, sy = R * hh * 0.95, sz = R * 0.92;
    this.headDims = { n, taper, jaw, sx, sy, sz };
    const skin = this.colors.skin;
    this.part(H, superHead(n, taper, jaw), skin, null, [sx, sy, sz]);
    const at = (ux, uy, out = 0) => [ux * sx, uy * sy, headSurfZ(n, taper, jaw, ux, uy) * sz + out];
    const an = s.animal;
    const dark = '#1a1418';
    const hairC = (s.hair && s.hair.c) || dark;
    /* eyes */
    if (!s.bandage) {
      const ey = s.eyeY != null ? -s.eyeY * 0.4 + 0.08 : 0.08, es = (s.eyeSize || 1) * R * 0.17;
      const eyeXs = s.cyclops ? [0] : [-0.36, 0.36];
      for (const ex of eyeXs) {
        const p = at(ex, ey, -es * 0.25), big = s.cyclops ? 1.6 : 1;
        if (!s.dotEyes) this.part(H, sphere(10), '#fbfaf6', p, [es * big, es * 1.15 * big, es * 0.6 * big], null, { noOutline: true });
        const pupil = this.part(H, sphere(8), s.eyeGlow || s.eyes || '#1a1418', [p[0], p[1] - es * 0.1, p[2] + es * 0.45 * big], [es * 0.55 * big, es * 0.7 * big, es * 0.3], null, { noOutline: true, noShadow: true });
        if (s.eyeGlow) pupil.material = new THREE.MeshBasicMaterial({ color: s.eyeGlow });
        if (s.brow !== false) {
          const bc = typeof s.brow === 'string' ? s.brow : shade(hairC, 0.85), tilt = s.angry ? 0.35 : s.sad ? -0.3 : 0;
          this.part(H, box(), bc, at(ex, ey + 0.32, -0.02), [es * (s.bushy ? 2.6 : 2.1), es * (s.bushy ? 0.65 : 0.4), es * 0.5], [0, 0, ex > 0 ? -tilt : tilt], { noOutline: true });
        }
      }
      if (s.shades) for (const ex of [-0.36, 0.36]) this.part(H, box(), '#1a1418', at(ex, 0.08, 0.02), [R * 0.36, R * 0.22, R * 0.08], null, { noOutline: true });
      if (s.glasses) for (const ex of [-0.36, 0.36]) this.part(H, torusG(0.18), '#2a2a30', at(ex, 0.08, 0.04), [R * 0.18, R * 0.18, R * 0.18], null, { noOutline: true });
      if (s.patch) this.part(H, box(), '#141418', at(0.36, 0.08, 0.02), [R * 0.3, R * 0.28, R * 0.06], null, { noOutline: true });
      if (s.monocle) this.part(H, torusG(0.18), '#e8bc3a', at(0.36, 0.08, 0.05), [R * 0.2, R * 0.2, R * 0.2], null, { noOutline: true });
    } else {
      this.part(H, superHead(n, taper, jaw), '#f2eee6', null, [sx * 1.04, sy * 1.03, sz * 1.04], null, { noOutline: true });
    }
    /* face below the eyes */
    if (an) {
      const mc = an.muzzle || shade(skin, 1.2), snout = an.snout != null ? an.snout : 0.5;
      if (an.kind === 'beak') this.part(H, cone(8), an.beak || '#f6d040', at(0, -0.2, R * 0.2), [R * 0.28, R * (0.4 + snout * 0.5), R * 0.28], [Math.PI / 2, 0, 0]);
      else {
        const mz = this.part(H, sphere(12), mc, at(0, -0.32, R * (0.05 + snout * 0.35)), [R * 0.48, R * 0.36, R * (0.32 + snout * 0.35)]);
        if (an.nose !== undefined || an.kind !== 'ape') this.part(H, sphere(8), an.nose || '#1a1414', [mz.position.x, mz.position.y + R * 0.12, mz.position.z + R * (0.25 + snout * 0.3)], [R * 0.13, R * 0.1, R * 0.1], null, { noOutline: true });
      }
      const ec = an.earC || skin, ears = an.ears;
      for (const sd of [1, -1]) {
        if (ears === 'point') this.part(H, cone(4), ec, [sd * sx * 0.55, sy * 0.95, 0], [R * 0.24, R * 0.5, R * 0.14], [0, 0, -sd * 0.25]);
        else if (ears === 'round') this.part(H, sphere(10), ec, [sd * sx * 0.7, sy * 0.8, 0], [R * 0.28, R * 0.28, R * 0.12]);
        else if (ears === 'long') this.part(H, unitCap(), ec, [sd * sx * 0.32, sy * 0.8, 0], [R * 0.16, R * 0.9, R * 0.08], [Math.PI, 0, sd * 0.15]);
        else if (ears === 'side') this.part(H, sphere(8), an.inner || ec, [sd * sx * 1.02, 0, 0], [R * 0.16, R * 0.24, R * 0.12]);
        else if (ears === 'floppy') this.part(H, sphere(8), ec, [sd * sx * 0.95, -sy * 0.05, 0], [R * 0.14, R * 0.4, R * 0.18], [0, 0, sd * 0.4]);
        else if (ears === 'fin') this.part(H, cone(3), ec, [sd * sx * 0.9, sy * 0.3, -R * 0.1], [R * 0.2, R * 0.5, R * 0.06], [0, 0, -sd * 0.9]);
      }
    } else if (!s.noNose && !s.bandage) {
      const nz = (s.nose || 1);
      this.part(H, sphere(8), shade(skin, 0.86), at(0, -0.16, R * 0.06 * nz), [R * 0.12 * Math.min(nz, 1.4), R * 0.12, R * 0.12 * nz], null, { noOutline: true });
      if (s.pointEars || true) for (const sd of [1, -1]) this.part(H, sphere(8), skin, [sd * sx * (s.pointEars ? 1.0 : 0.98), 0, 0], [R * 0.12, R * (s.pointEars ? 0.26 : 0.18), R * 0.12], s.pointEars ? [0, 0, -sd * 0.4] : null, { noOutline: true });
    }
    if (!s.noMouth && !s.bandage && !(an && an.kind === 'beak')) {
      const smile = s.mood === 'smile' || s.mood === 'happy' || s.mood === 'cheer';
      this.part(H, box(), '#4a1a20', at(0, an ? -0.55 : -0.42, -0.01), [R * (smile ? 0.34 : 0.22), R * (smile ? 0.08 : 0.05), R * 0.06], null, { noOutline: true });
    }
    if (s.blush !== false && !an) for (const sd of [1, -1]) this.part(H, sphere(6), typeof s.blush === 'string' ? s.blush : '#f08a8a', at(sd * 0.52, -0.22, -0.03), [R * 0.12, R * 0.07, R * 0.04], null, { noOutline: true, noShadow: true });
    if (s.bolts) for (const sd of [1, -1]) this.part(H, cyl(1, 6), '#8a8e98', [sd * sx, -sy * 0.45, 0], [R * 0.09, R * 0.4, R * 0.09], [0, 0, Math.PI / 2]);
    if (s.pipe) this.part(H, box(), '#5a3a1a', at(0.25, -0.5, R * 0.18), [R * 0.08, R * 0.08, R * 0.45]);
    if (s.fangs) for (const sd of [1, -1]) this.part(H, cone(4), '#ffffff', at(sd * 0.1, -0.5, 0), [R * 0.04, R * -0.1, R * 0.04], null, { noOutline: true });

    this.buildBeard(at); this.buildHair(); this.buildHat();
  }

  buildBeard(at) {
    const b = this.spec.beard; if (!b) return; const H = this.headG, R = this.D.headR, c = b.c;
    if (b.s === 'full' || b.s === 'long') {
      this.part(H, sphere(12), c, at(0, -0.55, -R * 0.35), [R * 0.82, R * 0.55, R * 0.62]);
      if (b.s === 'long') this.part(H, sphere(10), c, at(0, -1.0, -R * 0.4), [R * 0.55, R * 0.7, R * 0.4]);
    }
    if (b.s === 'mustache' || b.s === 'handlebar' || b.s === 'full' || b.s === 'long')
      this.part(H, unitCap(), c, at(0, -0.3, R * 0.06), [R * 0.1, R * (b.s === 'handlebar' ? 0.32 : 0.22), R * 0.1], [0, 0, Math.PI / 2], { noOutline: b.s !== 'handlebar' });
    if (b.s === 'goatee') this.part(H, sphere(8), c, at(0, -0.85, -R * 0.05), [R * 0.18, R * 0.24, R * 0.16]);
    if (b.s === 'stubble') this.part(H, sphere(12), shade(this.colors.skin, 0.8), at(0, -0.5, -R * 0.38), [R * 0.72, R * 0.42, R * 0.55], null, { noOutline: true });
  }

  buildHair() {
    const h = this.spec.hair; if (!h || h.s === 'bald') return; const H = this.headG, d = this.headDims, R = this.D.headR;
    const c = h.c, capS = [d.sx * 1.07, d.sy * 1.06, d.sz * 1.08];
    const capThetas = { short: 1.25, slick: 1.15, flat: 1.1, spiky: 1.2, curly: 1.35, wild: 1.4, long: 1.55, flow: 1.6, pigtails: 1.4, bun: 1.3, mane: 1.5, flame: 1.1, snakes: 1.2 };
    const cap = this.part(H, superHead(d.n, d.taper, d.jaw, capThetas[h.s] || 1.25), c, [0, 0, -d.sz * 0.04], capS, [-0.35, 0, 0]);
    const blob = (x, y, z, r) => this.part(H, sphere(8), c, [x, y, z], [r, r, r]);
    if (h.s === 'flat') this.part(H, box(), c, [0, d.sy * 0.95, -d.sz * 0.05], [d.sx * 1.9, d.sy * 0.35, d.sz * 1.9]);
    if (h.s === 'curly' || h.s === 'wild') for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2; blob(Math.cos(a) * d.sx * 0.7, d.sy * (0.75 + 0.15 * Math.sin(a * 3)), Math.sin(a) * d.sz * 0.7 - d.sz * 0.1, R * (h.s === 'wild' ? 0.36 : 0.3)); }
    if (h.s === 'spiky' || h.s === 'flame') for (let i = 0; i < 7; i++) { const a = (i / 6 - 0.5) * 1.8;
      this.part(H, cone(5), i % 2 && h.s === 'flame' ? '#f6d040' : c, [Math.sin(a) * d.sx * 0.65, d.sy * 1.05, -d.sz * 0.1 - Math.cos(a) * 0.1], [R * 0.2, R * (h.s === 'flame' ? 0.75 : 0.45), R * 0.2], [-0.3, 0, -a * 0.6]); }
    if (h.s === 'long' || h.s === 'flow') this.part(H, sphere(12), c, [0, -d.sy * 0.55, -d.sz * 0.55], [d.sx * 1.0, d.sy * (h.s === 'flow' ? 1.25 : 1.05), d.sz * 0.45]);
    if (h.s === 'bun') blob(0, d.sy * 0.85, -d.sz * 0.65, R * 0.36);
    if (h.s === 'pigtails') for (const sd of [1, -1]) blob(sd * d.sx * 1.05, -d.sy * 0.15, -d.sz * 0.2, R * 0.3);
    if (h.s === 'mane') this.part(H, torusG(0.5), c, [0, -d.sy * 0.05, -d.sz * 0.25], [d.sx * 1.15, d.sy * 1.15, d.sz * 0.8]);
    if (h.s === 'snakes') for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2;
      this.part(H, unitCap(), i % 2 ? c : shade(c, 1.25), [Math.cos(a) * d.sx * 0.85, d.sy * 0.6, Math.sin(a) * d.sz * 0.85], [R * 0.09, R * 0.5, R * 0.09], [Math.sin(a) * 2.2, 0, -Math.cos(a) * 2.2]); }
    this.hairCap = cap;
  }

  buildHat() {
    const t = this.spec.hat; if (!t) return; this.hat = new THREE.Group(); this.headG.add(this.hat);
    const H = this.hat, d = this.headDims, R = this.D.headR, c = t.c, c2 = t.c2 || t.band || shade(c, 0.75);
    const capS = [d.sx * 1.12, d.sy * 1.1, d.sz * 1.12];
    const crownTop = d.sy * 0.8;
    switch (t.s) {
      case 'top': this.part(H, cyl(1, 14), c, [0, crownTop + R * 0.55 * (t.tall || 1), 0], [d.sx * 0.78, R * 1.1 * (t.tall || 1), d.sz * 0.78]);
        this.part(H, cyl(1, 16), c, [0, crownTop, 0], [d.sx * 1.25, R * 0.07, d.sz * 1.25]);
        if (t.band) this.part(H, cyl(1, 14), t.band, [0, crownTop + R * 0.12, 0], [d.sx * 0.8, R * 0.16, d.sz * 0.8], null, { noOutline: true }); break;
      case 'straw': case 'floppy': case 'fedora': case 'tyrolean':
        this.part(H, cyl(0.85, 14), c, [0, crownTop + R * 0.25, 0], [d.sx * 0.85, R * 0.55, d.sz * 0.85]);
        this.part(H, cyl(1, 18), c, [0, crownTop, 0], [d.sx * (t.s === 'floppy' ? 1.7 : t.s === 'straw' ? 1.6 : 1.35), R * 0.06, d.sz * (t.s === 'floppy' ? 1.7 : 1.4)], [t.s === 'floppy' ? 0.15 : 0, 0, 0]);
        if (t.band) this.part(H, cyl(0.9, 14), t.band, [0, crownTop + R * 0.08, 0], [d.sx * 0.86, R * 0.14, d.sz * 0.86], null, { noOutline: true });
        if (t.feather) this.part(H, unitCap(), t.feather, [d.sx * 0.6, crownTop + R * 0.3, 0], [R * 0.06, R * 0.45, R * 0.06], [0, 0, -0.9]); break;
      case 'beanie': case 'bandana': case 'hood': case 'headband': case 'sailor': {
        const th = t.s === 'headband' ? 0.9 : t.s === 'hood' ? 1.8 : 1.3;
        if (t.s === 'headband') this.part(H, torusG(0.25), c, [0, d.sy * 0.35, 0], [d.sx * 1.02, d.sz * 1.02, R * 0.4], [Math.PI / 2 + 0.15, 0, 0]);
        else this.part(H, superHead(d.n, d.taper, d.jaw, th), c, [0, 0, -d.sz * 0.05], capS, [t.s === 'hood' ? -0.6 : -0.25, 0, 0]);
        if (t.s === 'beanie') { H.children[H.children.length - 1].scale.y *= 1.22; this.part(H, torusG(0.3), c2, [0, d.sy * 0.22, -d.sz * 0.06], [d.sx * 1.0, d.sz * 1.0, R * 0.45], [Math.PI / 2 + 0.3, 0, 0]); }
        if (t.s === 'sailor') this.part(H, cyl(1, 14), c, [0, crownTop, 0], [d.sx * 0.9, R * 0.25, d.sz * 0.9]);
        if (t.dots) for (let i = 0; i < 5; i++) this.part(H, sphere(6), t.dots, [Math.cos(i) * d.sx * 0.7, d.sy * 0.75, Math.sin(i) * d.sz * 0.7], [R * 0.08, R * 0.08, R * 0.08], null, { noOutline: true });
        if (t.coins) for (let i = 0; i < 5; i++) this.part(H, cyl(1, 8), t.coins, [(i - 2) * d.sx * 0.35, d.sy * 0.2, d.sz * 1.0 - Math.abs(i - 2) * 0.1], [R * 0.08, R * 0.02, R * 0.08], [Math.PI / 2, 0, 0], { noOutline: true });
        break; }
      case 'santa': case 'witch': case 'feathercap': {
        this.part(H, cone(14), c, [0, crownTop + R * 0.7, -R * 0.1], [d.sx * 0.85, R * (t.s === 'witch' ? 2.2 * (t.tall || 1) : 1.6), d.sz * 0.85], [-0.25, 0, t.s === 'santa' ? 0.35 : 0]);
        if (t.s === 'santa') { this.part(H, torusG(0.4), '#f6f3ee', [0, crownTop, 0], [d.sx * 0.95, d.sz * 0.95, R * 0.5], [Math.PI / 2, 0, 0]); this.part(H, sphere(8), '#f6f3ee', [d.sx * 0.6, crownTop + R * 1.35, -R * 0.4], [R * 0.2, R * 0.2, R * 0.2]); }
        if (t.s === 'witch') this.part(H, cyl(1, 18), c, [0, crownTop, 0], [d.sx * 1.6, R * 0.06, d.sz * 1.6]);
        if (t.feather) this.part(H, unitCap(), t.feather, [d.sx * 0.5, crownTop + R * 0.5, 0], [R * 0.06, R * 0.5, R * 0.06], [0, 0, -0.7]); break; }
      case 'tricorn': this.part(H, cyl(0.7, 3), c, [0, crownTop + R * 0.15, 0], [d.sx * 1.45, R * 0.45, d.sz * 1.45], [0, Math.PI, 0]);
        if (t.skull) this.part(H, sphere(6), t.skull, [0, crownTop + R * 0.2, d.sz * 0.75], [R * 0.12, R * 0.12, R * 0.05], null, { noOutline: true }); break;
      case 'crown': this.part(H, cyl(1.1, 8), c, [0, crownTop + R * 0.1, 0], [d.sx * 0.8, R * 0.4, d.sz * 0.8]);
        for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; this.part(H, cone(4), c, [Math.sin(a) * d.sx * 0.8, crownTop + R * 0.42, Math.cos(a) * d.sz * 0.8], [R * 0.1, R * 0.28, R * 0.1], null, { noOutline: true }); }
        if (t.gem) this.part(H, sphere(6), t.gem, [0, crownTop + R * 0.1, d.sz * 0.85], [R * 0.1, R * 0.1, R * 0.06], null, { noOutline: true }); break;
      case 'laurel': case 'flowers': case 'grapes':
        for (let i = 0; i < 11; i++) { const a = (i / 10 - 0.5) * 3.6; this.part(H, sphere(6), i % 3 === 0 && c2 ? (t.s === 'laurel' ? c : c2) : c, [Math.sin(a) * d.sx * 0.98, d.sy * 0.35, -Math.cos(a) * d.sz * 0.98], [R * 0.14, R * 0.1, R * 0.08], [0, a, 0.6], { noOutline: true }); } break;
      case 'spikes': for (let i = 0; i < 7; i++) { const a = (i / 6 - 0.5) * 2.4; this.part(H, cone(4), c, [Math.sin(a) * d.sx * 0.8, d.sy * 0.75, -Math.cos(a) * d.sz * 0.3], [R * 0.12, R * 0.6, R * 0.12], [0, 0, -a * 0.5]); } break;
      case 'horns': case 'goathorns': for (const sd of [1, -1]) this.part(H, cone(6), c, [sd * d.sx * 0.55, d.sy * 0.95, -R * 0.1], [R * 0.13, R * 0.6, R * 0.13], [-0.4, 0, -sd * (t.s === 'goathorns' ? 0.9 : 0.45)]); break;
      case 'greek': case 'winged': this.part(H, superHead(d.n, d.taper, d.jaw, 1.3), c, [0, 0, -d.sz * 0.05], capS, [-0.3, 0, 0]);
        if (t.crest) this.part(H, box(), t.crest, [0, crownTop + R * 0.2, -R * 0.1], [R * 0.12, R * 0.4, d.sz * 1.7]);
        if (t.s === 'winged') for (const sd of [1, -1]) this.part(H, sphere(8), '#f6f3ec', [sd * d.sx * 1.05, d.sy * 0.4, -R * 0.1], [R * 0.05, R * 0.25, R * 0.5], [0.4, 0, 0]); break;
      case 'bow': for (const sd of [1, -1]) this.part(H, sphere(8), c, [sd * R * 0.22 + d.sx * 0.45, d.sy * 0.8, 0], [R * 0.22, R * 0.16, R * 0.1]); break;
      case 'helmet': this.part(H, superHead(2.2, 1, 1, 1.45), c, [0, d.sy * 0.04, -d.sz * 0.04], [d.sx * 1.14, d.sy * 1.12, d.sz * 1.16], [-0.3, 0, 0]);
        this.part(H, sphere(10), c, [0, d.sy * 0.18, d.sz * 0.98], [d.sx * 0.72, R * 0.06, d.sz * 0.42], [0.15, 0, 0]);
        this.part(H, sphere(10), c, [this.lefty ? -d.sx * 0.9 : d.sx * 0.9, -d.sy * 0.15, 0], [R * 0.18, R * 0.4, R * 0.36]); break;
      case 'deerstalker': this.part(H, superHead(d.n, d.taper, d.jaw, 1.3), c, [0, 0, -d.sz * 0.05], capS, [-0.25, 0, 0]);
        for (const sd of [1, -1]) this.part(H, sphere(8), c, [0, d.sy * 0.3, sd * d.sz * 1.05], [d.sx * 0.5, R * 0.05, R * 0.25]); break;
      default: this.part(H, superHead(d.n, d.taper, d.jaw, 1.3), c, [0, 0, -d.sz * 0.05], capS, [-0.25, 0, 0]);
    }
  }

  /* The batter wears a helmet unless he already wears something, the game's
     rule: a hat is part of who somebody is. */
  setHelmet(on, color) {
    if (on && !this.spec.hat && !this.helmet && !this.spec.egg && !this.spec.headless && !(this.spec.hair && (this.spec.hair.s === 'flame' || this.spec.hair.s === 'snakes'))) {
      const keep = this.hat; this.spec = Object.assign({}, this.spec, { hat: { s: 'helmet', c: color || '#1f3f7a' } });
      this.buildHat(); this.helmet = this.hat; this.hat = keep; this.spec = Object.assign({}, this.spec, { hat: undefined });
      if (this.hairCap) this.hairCap.visible = false;
    }
    if (this.helmet) { this.helmet.visible = !!on; if (this.hairCap) this.hairCap.visible = !on; }
  }

  makeBat() {
    const g = new THREE.Group(), L = 2.9 * Math.max(0.9, this.S);
    const geo = cached('bat', () => new THREE.CylinderGeometry(0.11, 0.045, 1, 10).translate(0, 0.5, 0));
    const m = new THREE.Mesh(geo, toon('#c89a5a')); m.scale.set(1, L, 1); m.castShadow = true; g.add(m);
    const o = new THREE.Mesh(geo, outlineMat(0.03)); o.userData.outline = true; m.add(o);
    const knob = new THREE.Mesh(sphere(8), toon('#7a5230')); knob.scale.set(0.07, 0.04, 0.07); g.add(knob);
    const tape = new THREE.Mesh(cyl(1, 8), toon('#2a2a30')); tape.scale.set(0.055, L * 0.22, 0.055); tape.position.y = L * 0.12; g.add(tape);
    g.userData.L = L; return g;
  }
  makeGlove() {
    const g = new THREE.Group(), s = this.D.armR * 2.1;
    const m = new THREE.Mesh(sphere(12), toon('#8a5228')); m.scale.set(s * 0.95, s * 1.05, s * 0.5); m.castShadow = true; g.add(m);
    const o = new THREE.Mesh(sphere(12), outlineMat(0.035 / s)); o.userData.outline = true; m.add(o);
    const pocket = new THREE.Mesh(sphere(10), toon('#5a3418')); pocket.scale.set(s * 0.6, s * 0.65, s * 0.2); pocket.position.z = s * 0.38; g.add(pocket);
    const web = new THREE.Mesh(box(), toon('#c48a48')); web.scale.set(s * 0.5, s * 0.45, s * 0.08); web.position.set(0, s * 0.75, s * 0.15); g.add(web);
    return g;
  }
  makeProp() {
    const p = this.spec.prop; if (!p) return null; const g = new THREE.Group(), S = this.S, c = p.c;
    const add = (geo, col, pos, sc, rot) => { const m = new THREE.Mesh(geo, toon(col)); m.position.set(...pos); m.scale.set(...sc); if (rot) m.rotation.set(...rot); m.castShadow = true; g.add(m);
      const o = new THREE.Mesh(geo, outlineMat(0.03 / Math.min(...sc))); o.userData.outline = true; m.add(o); return m; };
    switch (p.k) {
      case 'axe': add(cyl(1, 8), '#8a5a2a', [0, 1.2 * S, 0], [0.07, 2.6 * S, 0.07]); add(box(), '#b8bcc8', [0.25 * S, 2.3 * S, 0], [0.55 * S, 0.45 * S, 0.06]); break;
      case 'torch': add(cyl(1.3, 8), '#e8bc3a', [0, 0.7 * S, 0], [0.09, 1.4 * S, 0.09]); add(cone(8), '#f6a030', [0, 1.65 * S, 0], [0.22 * S, 0.5 * S, 0.22 * S]); break;
      case 'trident': case 'bident': case 'spear': case 'staff': case 'scepter': case 'caduceus':
        add(cyl(1, 8), c || '#e8bc3a', [0, 1.4 * S, 0], [0.06, 3 * S, 0.06]);
        if (p.k === 'trident' || p.k === 'bident') for (const x of (p.k === 'trident' ? [-0.18, 0, 0.18] : [-0.12, 0.12])) add(cone(4), c || '#e8bc3a', [x * S, 3.05 * S, 0], [0.06 * S, 0.35 * S, 0.06 * S]);
        else add(sphere(8), p.top || '#3ab0c8', [0, 2.95 * S, 0], [0.16 * S, 0.16 * S, 0.16 * S]); break;
      case 'bolt': add(box(), '#f6e070', [0, 1 * S, 0], [0.18 * S, 1.6 * S, 0.08], [0, 0, 0.35]); break;
      case 'sword': case 'cutlass': add(box(), '#c8ccd8', [0, 1.1 * S, 0], [0.12 * S, 1.8 * S, 0.04]); add(box(), c || '#8a5a2a', [0, 0.2 * S, 0], [0.4 * S, 0.08 * S, 0.08]); break;
      default: add(sphere(10), c || '#e8bc3a', [0, 0.3 * S, 0], [0.3 * S, 0.3 * S, 0.3 * S]);
    }
    return g;
  }

  setOutlines(on) { this.root.traverse((o) => { if (o.userData.outline) o.visible = on; }); }

  /* ------------------------------------------------------------ posing */
  /* Pose fields (anim.js writes them):
       p   pelvis [x, y, z]: x and z in feet for a standard body, y as a share
           of straight leg height (1 is standing tall)
       pr  pelvis rotation, cr chest rotation (on the pelvis), hr head (on the chest)
       lh, rh  hand targets, chest frame, feet from the chest centre
       lf, rf  ankle targets, root frame, feet; y is lift off the ground
       bat {g, d}  grip point and barrel direction, root frame; the hands ride it
       glove, showBat, prop  what is held
       reach  a world point the glove hand goes to, for a catch */
  apply(P) {
    const D = this.D, S = this.S, v = (a) => new THREE.Vector3(a[0], a[1], a[2]);
    this.pelvis.position.set(P.p[0] * S, (D.legL * P.p[1]) + D.ankle + D.legR * 0.2, P.p[2] * S);
    this.pelvis.rotation.set(P.pr[0], P.pr[1], P.pr[2], 'YXZ');
    this.chest.rotation.set(P.cr[0] + D.hunch, P.cr[1], P.cr[2], 'YXZ');
    this.headG.rotation.set(P.hr[0] - D.hunch * 0.7, P.hr[1], P.hr[2], 'YXZ');
    this.root.updateMatrixWorld(true);
    const rootInv = new THREE.Matrix4().copy(this.root.matrixWorld).invert();
    const toRoot = (obj, local) => local.clone().applyMatrix4(obj.matrixWorld).applyMatrix4(rootInv);
    const chestQ = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().extractRotation(this.chest.matrixWorld)).premultiply(new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().extractRotation(rootInv)));
    const shY = D.torso * 0.24;
    const lS = toRoot(this.chest, new THREE.Vector3(D.shW * 0.82, shY, 0)), rS = toRoot(this.chest, new THREE.Vector3(-D.shW * 0.82, shY, 0));
    const chestC = toRoot(this.chest, new THREE.Vector3(0, shY, 0));
    let lT, rT;
    if (P.bat && this.bat.visible) {
      const g = v(P.bat.g).multiplyScalar(S), d = v(P.bat.d).normalize();
      this.bat.position.copy(g).addScaledVector(d, -0.15 * S);
      this.bat.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
      /* a righty's bottom hand is the left; P.top says which hand is up the bat */
      const lo = g.clone(), hi = g.clone().addScaledVector(d, 0.3 * S);
      if (this.lefty) { rT = lo; lT = hi; } else { lT = lo; rT = hi; }
      if (P.bunt) { if (this.lefty) lT = g.clone().addScaledVector(d, 1.1 * S); else rT = g.clone().addScaledVector(d, 1.1 * S); }
    } else {
      lT = chestC.clone().add(v(P.lh).multiplyScalar(S).applyQuaternion(chestQ));
      rT = chestC.clone().add(v(P.rh).multiplyScalar(S).applyQuaternion(chestQ));
    }
    if (P.reach) { const r = P.reach.clone().applyMatrix4(rootInv); if (this.lefty) rT = r; else lT = r; }
    const back = new THREE.Vector3(0, -0.4, -1).applyQuaternion(chestQ);
    this.ik('luA', 'llA', lS, lT, D.ua, D.la, back.clone().add(new THREE.Vector3(0.6, 0, 0).applyQuaternion(chestQ)), 'lH');
    this.ik('ruA', 'rlA', rS, rT, D.ua, D.la, back.clone().add(new THREE.Vector3(-0.6, 0, 0).applyQuaternion(chestQ)), 'rH');
    /* legs */
    const pelQ = new THREE.Quaternion().setFromEuler(this.pelvis.rotation);
    const lHip = this.pelvis.position.clone().add(new THREE.Vector3(D.hipW * 0.75, -D.legR * 0.2, 0).applyQuaternion(pelQ));
    const rHip = this.pelvis.position.clone().add(new THREE.Vector3(-D.hipW * 0.75, -D.legR * 0.2, 0).applyQuaternion(pelQ));
    const knee = new THREE.Vector3(0, 0, 1).applyQuaternion(pelQ);
    const lA = new THREE.Vector3(P.lf[0] * S, P.lf[1] * S + D.ankle, P.lf[2] * S), rA = new THREE.Vector3(P.rf[0] * S, P.rf[1] * S + D.ankle, P.rf[2] * S);
    this.ik('luL', 'llL', lHip, lA, D.th, D.sh, knee.clone().add(new THREE.Vector3(0.15, 0, 0)), null);
    this.ik('ruL', 'rlL', rHip, rA, D.th, D.sh, knee.clone().add(new THREE.Vector3(-0.15, 0, 0)), null);
    for (const [sd, A, yaw] of [['l', lA, P.lfy], ['r', rA, P.rfy]]) {
      const f = this.limbs[sd + 'F']; f.position.copy(A).add(new THREE.Vector3(0, -D.ankle, 0));
      f.rotation.set(P[sd + 'fp'] || 0, (yaw != null ? yaw : P.pr[1] * 0.6), 0, 'YXZ');
    }
    /* what is held */
    this.glove.visible = !!P.glove;
    if (P.glove) { const h = this.limbs[this.lefty ? 'rH' : 'lH']; this.glove.position.copy(h.position);
      this.glove.quaternion.copy(h.quaternion).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI, 0, 0))); }
    if (this.prop) { this.prop.visible = !!P.prop; if (P.prop) { const h = this.limbs[this.lefty ? 'lH' : 'rH']; this.prop.position.copy(h.position).add(new THREE.Vector3(0, -0.6 * S, 0)); this.prop.rotation.set(0.15, 0, 0.1); } }
    if (this.skirt) this.skirt.rotation.x = -P.pr[0] * 0.5;
  }

  /* Two bone IK. The elbow or knee goes on the side the pole points to; the
     segments are capsules, so twist about their own axis does not matter. */
  ik(upper, lower, S0, T, a, b, pole, hand) {
    const d0 = T.clone().sub(S0); let d = d0.length(); const u = d0.normalize();
    d = Math.max(Math.abs(a - b) + 1e-3, Math.min(a + b - 1e-3, d));
    const x = (a * a + d * d - b * b) / (2 * d), h = Math.sqrt(Math.max(0, a * a - x * x));
    const pv = pole.clone().sub(u.clone().multiplyScalar(pole.dot(u))); if (pv.lengthSq() < 1e-6) pv.set(0, 0, 1); pv.normalize();
    const E = S0.clone().addScaledVector(u, x).addScaledVector(pv, h);
    const W = S0.clone().addScaledVector(u, d);
    this.seg(this.limbs[upper], S0, E); this.seg(this.limbs[lower], E, W);
    if (hand) { const hm = this.limbs[hand]; hm.position.copy(W); hm.quaternion.copy(this.limbs[lower].quaternion); }
  }
  seg(m, A, B) {
    const dir = B.clone().sub(A); const L = dir.length(); const r = m.userData.r;
    m.position.copy(A); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir.normalize());
    /* unitCap spans y 0 to -3 (radius 1 caps): stretch so the segment, caps
       included, reaches from joint to joint */
    m.scale.set(r, Math.max(0.01, (L) / 3), r);
  }

  worldOf(name) { return this.limbs[name].getWorldPosition(new THREE.Vector3()); }
}

export function buildCharacter(key, spec, opts) { const c = new Character(key, spec, opts); c.setOutlines(OPTS.outlines); return c; }
