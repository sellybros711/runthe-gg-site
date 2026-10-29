/* Run The Ropes 3D: the stage.

   The renderer, the bodies, the broadcast camera and the effects, behind a
   small API the match engine in index.html already speaks. The engine moves
   its figures with two calls (poseSet and fmv) and plays every move through
   one (exchange). This file answers all three in 3D, so every routine the
   engine has (a pin, a submission, a count out, a ref bump, a hot tag) plays
   in the ring without being rewritten, and the moves that matter most get a
   real two body clip from moves.js.

   IT DECIDES NOTHING. Who hits whom, for how much, and how the match ends are
   the engine's. A clip only says how a move looks and when its hit lands, and
   it calls the engine's own hit() at that moment, so the damage bar, the log
   and the crowd all move on the frame the body lands.

   THE PIXELS ARE THE POINT. The scene is drawn into a small framebuffer (about
   280 lines tall whatever the screen is) and scaled up by the browser with
   nearest neighbour, so a 3D ring reads as the console pixel art the rest of
   the game is drawn in, and a phone draws a tenth of the pixels it would at
   full resolution. */
import * as THREE from '../../assets/vendor/three-0.180.0/three.module.min.js';
import { Wrestler, lookOf } from './rig.js?v=1';
import { POSES, STAND, get as getPose, lerpPose, alive, ease as EASE, LYING } from './poses.js?v=1';
import { pick } from './moves.js?v=1';
import { HALF, POST, APRON, FLOOR, ROPES, CORNERS } from './dims.js?v=1';

const PI = Math.PI, H = PI / 2;
const POSE_KEYS = ['p', 'pr', 'cr', 'hr', 'lh', 'rh', 'lf', 'rf', 'pl', 'lk', 'rk', 'lfp', 'rfp'];
/* game pixels to ring feet: the engine lays its stage out across ST.W pixels
   with the two home spots at a sixth of it, which lands them about five feet
   either side of centre */
const FT_PER_W = 30;

function resolvePose(spec) {
  if (!spec) return POSES.ready;
  if (typeof spec === 'string') return getPose(spec);
  const base = typeof spec.base === 'string' ? getPose(spec.base) : (spec.base || POSES.ready);
  const out = Object.assign({}, base);
  for (const k of POSE_KEYS) if (spec[k] != null) out[k] = spec[k];
  return out;
}
function keyPose(key) {
  const P = resolvePose(key.pose), over = {};
  let any = false;
  for (const k of POSE_KEYS) if (key[k] != null) { over[k] = key[k]; any = true; }
  return any ? Object.assign({}, P, over) : P;
}
const angLerp = (a, b, t) => { let d = ((b - a + PI) % (2 * PI) + 2 * PI) % (2 * PI) - PI; return a + d * t; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* ------------------------------------------------------------- particles
   Everything the effects throw (impact stars, sweat, dust, confetti) is one
   pool of square points in one draw call. A pixel game's spark is a square. */
class Sparks {
  constructor(n = 420) {
    this.n = n; this.i = 0;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(n * 3); this.col = new Float32Array(n * 3); this.size = new Float32Array(n);
    this.vel = new Float32Array(n * 3); this.life = new Float32Array(n); this.max = new Float32Array(n); this.grav = new Float32Array(n);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    const m = new THREE.ShaderMaterial({
      vertexColors: true, transparent: true, depthWrite: false,
      uniforms: { scale: { value: 300 } },
      vertexShader: 'attribute float size; varying vec3 vC; uniform float scale; void main(){ vC = color; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = size * scale / -mv.z; gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'varying vec3 vC; void main(){ gl_FragColor = vec4(vC, 1.0); }',
    });
    this.points = new THREE.Points(g, m); this.points.frustumCulled = false; this.points.renderOrder = 5;
  }
  emit(p, count, o = {}) {
    const c = new THREE.Color();
    for (let j = 0; j < count; j++) {
      const i = this.i; this.i = (this.i + 1) % this.n;
      const a = Math.random() * PI * 2, e = (o.up || 0.4) + Math.random() * (o.spread || 0.8), sp = (o.speed || 8) * (0.4 + Math.random() * 0.8);
      this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
      this.vel[i * 3] = Math.cos(a) * sp * (o.flat ? 1 : 0.8); this.vel[i * 3 + 1] = o.flat ? Math.random() * 0.6 : e * sp; this.vel[i * 3 + 2] = Math.sin(a) * sp * (o.flat ? 1 : 0.8);
      c.set(o.colors ? o.colors[j % o.colors.length] : '#fff4c0');
      this.col[i * 3] = c.r; this.col[i * 3 + 1] = c.g; this.col[i * 3 + 2] = c.b;
      this.size[i] = (o.size || 0.22) * (0.6 + Math.random() * 0.8); this.max[i] = this.life[i] = (o.life || 0.5) * (0.6 + Math.random() * 0.7); this.grav[i] = o.grav == null ? 22 : o.grav;
    }
  }
  update(dt) {
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) { if (this.size[i]) this.size[i] = 0; continue; }
      this.life[i] -= dt;
      this.vel[i * 3 + 1] -= this.grav[i] * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.vel[i * 3] *= 0.985; this.vel[i * 3 + 2] *= 0.985;
      if (this.pos[i * 3 + 1] < 0.02 && Math.abs(this.pos[i * 3]) < HALF + 1.6 && Math.abs(this.pos[i * 3 + 2]) < HALF + 1.6) { this.pos[i * 3 + 1] = 0.02; this.vel[i * 3 + 1] *= -0.3; }
      if (this.life[i] <= 0) this.size[i] = 0;
    }
    const g = this.points.geometry; g.attributes.position.needsUpdate = true; g.attributes.size.needsUpdate = true; g.attributes.color.needsUpdate = true;
  }
}

/* ------------------------------------------------------------- a figure */
class Fig {
  constructor(stage, k) {
    this.stage = stage; this.k = k; this.w = null; this.visible = false;
    this.pos = new THREE.Vector3(); this.yaw = 0; this.roll = 0;
    this.pose = POSES.ready; this.from = null;          /* a transition in progress */
    this.phase = Math.random() * 5; this.hurt = 0; this.glow = 0;
    this.script = null;                                 /* set while a clip drives the body */
    this.face = null;                                   /* a figure key to face, or null */
    this.side = k === 'opp' ? 1 : -1;
  }
  setLook(look) {
    const key = JSON.stringify(look || {});
    if (this.w && this.lookKey === key) return;
    if (this.w) { this.stage.figGroup.remove(this.w.root); this.w.dispose(); }
    this.lookKey = key;
    this.w = new Wrestler(lookOf(look));
    this.stage.figGroup.add(this.w.root);
    this.w.root.visible = this.visible;
    if (this.belt) this.w.setBelt(this.belt);
  }
  show(on) { this.visible = !!on; if (this.w) this.w.root.visible = this.visible; }
  /* move toward a pose and a spot over ms (already divided by the speed) */
  go(poseName, target, ms) {
    const P = resolvePose(poseName || this.poseName || 'ready');
    let dur = Math.max(0.001, ms / 1000);
    const wasLying = LYING.has(this.poseName), nowLying = LYING.has(poseName);
    /* getting up off the canvas is never instant: through a knee, at least half a second */
    if (wasLying && !nowLying && poseName) { this.mid = POSES.kneel; dur = Math.max(dur, 0.55); } else this.mid = null;
    this.from = { pose: this.cur || this.pose, pos: this.pos.clone(), yaw: this.yaw, roll: this.roll, t: 0, dur };
    this.pose = P; if (poseName) this.poseName = poseName;
    if (target) { this.tpos = target.pos || this.pos.clone(); this.tyaw = target.yaw == null ? this.yaw : target.yaw; this.troll = target.roll || 0; }
    else { this.tpos = this.pos.clone(); this.tyaw = this.yaw; this.troll = this.roll; }
  }
  snap(pos, yaw) { this.pos.copy(pos); if (yaw != null) this.yaw = yaw; this.tpos = this.pos.clone(); this.tyaw = this.yaw; this.from = null; }
  update(dt) {
    if (!this.w || !this.visible) return;
    this.phase += dt;
    if (this.script) return;  /* the clip player poses it */
    let P = this.pose;
    if (this.from) {
      const f = this.from; f.t += dt; const u = clamp(f.t / f.dur, 0, 1), e = EASE.inout(u);
      if (this.mid) P = e < 0.5 ? lerpPose(f.pose, this.mid, e * 2) : lerpPose(this.mid, this.pose, e * 2 - 1);
      else P = lerpPose(f.pose, this.pose, e);
      this.pos.lerpVectors(f.pos, this.tpos, e); this.yaw = angLerp(f.yaw, this.tyaw, e); this.roll = f.roll + (this.troll - f.roll) * e;
      if (u >= 1) this.from = null;
    } else if (this.face) {
      const o = this.stage.figs[this.face];
      if (o && o.visible && !LYING.has(this.poseName) && this.poseName !== 'runBack' && this.poseName !== 'climb') {
        const want = Math.atan2(o.pos.x - this.pos.x, o.pos.z - this.pos.z);
        this.yaw = angLerp(this.yaw, want, Math.min(1, dt * 6));
      }
    }
    this.cur = P;
    this.applyNow(alive(P, this.phase, this.hurt));
    /* HELD IS HELD. The engine's own routines (a triple threat steal, over the top
       in a rumble) put a body in held or vert with a height in pixels. A body
       cannot hang in the air by itself, so it hangs off whoever is lifting it:
       its pelvis rides above the lifter's chest, or his hands when he presses. */
    if ((this.poseName === 'held' || this.poseName === 'vert') && !this.from) {
      const o = this.stage.figs[this.face || (this.k === 'me' ? 'opp' : 'me')];
      if (o && o.w && o.visible && ['lift', 'press', 'grapple', 'lockup', 'carry'].includes(o.poseName)) {
        const top = o.w.point(o.poseName === 'press' ? 'hands' : 'chest');
        top.y += (o.poseName === 'press' ? 0.5 : 1.15) * o.w.S;
        const pl = this.w.pelvis.position.clone().applyAxisAngle(UPV, this.yaw);
        this.pos.copy(top.sub(pl)); this.w.root.position.copy(this.pos);
        this.yaw = o.yaw + Math.PI / 2; this.w.root.rotation.y = this.yaw;
      }
    }
  }
  applyNow(P) {
    /* a figure standing on the canvas or the floor outside stands on its own
       root, so a foot stops there; a body up on a turnbuckle or held has none */
    const grounded = Math.abs(this.pos.y) < 0.6 || Math.abs(this.pos.y - FLOOR) < 0.6;
    this.w.floorY = grounded ? 0 : -99;
    this.w.apply(P);
    this.w.root.position.copy(this.pos);
    this.w.root.rotation.set(0, this.yaw, this.roll, 'YXZ');
  }
}

/* ------------------------------------------------------------- the stage */
export class Stage {
  constructor(host, opts = {}) {
    this.host = host; this.opts = opts;
    this.speed = 1; this.lines = opts.lines || 280;
    const cv = document.createElement('canvas');
    cv.className = 'r3d-canvas';
    cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;image-rendering:pixelated;image-rendering:crisp-edges;pointer-events:none;z-index:2;';
    host.appendChild(cv); this.canvas = cv;
    const r = new THREE.WebGLRenderer({ canvas: cv, antialias: false, alpha: false, powerPreference: 'high-performance' });
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.shadowMap.enabled = opts.quality !== 'low'; r.shadowMap.type = THREE.BasicShadowMap; r.toneMapping = THREE.NoToneMapping;
    this.r = r;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#0b0a10');
    this.cam = new THREE.PerspectiveCamera(34, 1, 0.5, 400);
    this.figGroup = new THREE.Group(); this.scene.add(this.figGroup);
    this.sparks = new Sparks(); this.scene.add(this.sparks.points);
    this.shadowBlobs = {};
    this.figs = {}; for (const k of ['me', 'opp', 'ref', 'extra']) this.figs[k] = new Fig(this, k);
    this.figs.me.face = 'opp'; this.figs.opp.face = 'me'; this.figs.ref.face = null;
    this.camState = { focus: new THREE.Vector3(0, 2.4, 0), dist: 34, height: 15, yaw: 0, fov: 34 };
    this.camWant = { mode: 'match', t: 0 };
    this.shakeAmp = 0; this.flashV = 0; this.timeScale = 1; this.slowUntil = 0; this.mood = { heat: 0.3, flash: 0, entering: false };
    this.clock = 0; this.arena = null; this.wide = false;
    this.flash = document.createElement('div');
    this.flash.style.cssText = 'position:absolute;inset:0;background:#fff;opacity:0;pointer-events:none;z-index:3;transition:opacity .25s;';
    host.appendChild(this.flash);
    this.resize();
    this._ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => this.resize()) : null;
    if (this._ro) this._ro.observe(host);
    this._loop = this._loop.bind(this); this._last = performance.now(); this.running = true;
    /* manual: a check steps the clock itself, so a frame is the same frame every run */
    if (!opts.manual) requestAnimationFrame(this._loop);
  }

  async setArena(theme, name, opts = {}) {
    if (this.arena) { this.scene.remove(this.arena.group); this.arena.dispose(); this.arena = null; }
    try {
      const mod = await import('./arena.js?v=1');
      this.arena = mod.buildArena(theme, { name, cage: !!opts.cage, quality: this.opts.quality || 'high' });
      this.scene.add(this.arena.group);
      this.arena.setCage(!!this.cageOn); this.arena.hangPrize(this.prize || null);
      if (this.arena.fog) { this.scene.fog = new THREE.Fog(this.arena.fog.color, this.arena.fog.near, this.arena.fog.far); this.scene.background = new THREE.Color(this.arena.fog.color); }
    } catch (e) { console.warn('ring3d: arena failed', e); this.fallbackRing(); }
  }
  fallbackRing() {
    const g = new THREE.Group();
    const mat = new THREE.Mesh(new THREE.BoxGeometry(APRON * 2, 0.3, APRON * 2), new THREE.MeshLambertMaterial({ color: '#6a6e78' }));
    mat.position.y = -0.15; mat.receiveShadow = true; g.add(mat);
    g.add(new THREE.HemisphereLight('#ffffff', '#202030', 1.6));
    this.arena = { group: g, update() {}, ropeHit() {}, setCage() {}, hangPrize() {}, dispose() {} };
    this.scene.add(g);
  }

  resize() {
    const w = Math.max(1, this.host.clientWidth), h = Math.max(1, this.host.clientHeight);
    const pr = Math.min(1, this.lines / h);
    this.r.setPixelRatio(pr); this.r.setSize(w, h, false);
    this.cam.aspect = w / h; this.cam.updateProjectionMatrix();
    this.sparks.points.material.uniforms.scale.value = h * pr / (2 * Math.tan(this.cam.fov * PI / 360));
  }

  /* ---------- the engine's API, figure by figure ---------- */
  look(k, L) { const f = this.figs[k]; f.setLook(L); return f; }
  show(k, on) { this.figs[k].show(on); }
  belt(k, kind) { const f = this.figs[k]; f.belt = kind; if (f.w) f.w.setBelt(kind); }
  entrance(k, on) { const f = this.figs[k]; if (f.w) f.w.setEntrance(on); }
  /* fmv's options in game units: x pixels from centre, up pixels, rot degrees, sc scale */
  move(k, o, ms, W) {
    const f = this.figs[k]; if (!f.w) return;
    const pose = o.pose || f.poseName || 'ready';
    const pos = this.gameToRing(k, o, W, pose);
    let yaw = null;
    if (k === 'ref') yaw = Math.atan2(-pos.x, -pos.z - 2);
    else if (pose === 'runBack') yaw = (f.side < 0 ? -H : H);
    else if (LYING.has(pose)) yaw = f.side < 0 ? H : -H;
    else if (pose !== 'climb') { const o2 = this.figs[f.face]; if (o2 && o2.visible) yaw = Math.atan2(o2.pos.x - pos.x, o2.pos.z - pos.z); }
    if (pose === 'climb') yaw = this.cornerYaw;
    const roll = o.rot ? -o.rot * PI / 180 * 0.6 : 0;
    f.go(pose, { pos, yaw, roll: LYING.has(pose) ? 0 : roll }, ms / this.speed);
  }
  gameToRing(k, o, W, pose) {
    const f = this.figs[k];
    W = W || 760;
    const wide = !!o.wide;
    const x = o.x == null ? (f.tpos ? f.tpos.x : f.pos.x) : o.x / W * FT_PER_W / (wide ? 0.74 : 1);
    const z = k === 'ref' ? -3.4 : k === 'extra' ? 1.2 : (k === 'me' ? 0.35 : -0.35);
    const up = o.up || 0, sc = o.sc == null ? 1 : o.sc;
    /* parked off stage for an entrance: out on the apron in his own corner, so the walk in is a
       climb through the ropes rather than a figure appearing in the middle of the ring */
    if (!wide && o.x != null && Math.abs(o.x) > W * 0.5 && k !== 'ref') { const sx = Math.sign(o.x); return new THREE.Vector3(sx * (HALF + 1.0), 0, sx < 0 ? 4.5 : -4.5); }
    /* on the floor outside: the engine shrinks the figure and drops it */
    if (k !== 'ref' && (up < -2 || (wide && Math.abs(x) > HALF + 0.5))) {
      const sx = Math.sign(x || f.side) || 1;
      return new THREE.Vector3(sx * (APRON + 2.4 + Math.min(2, Math.abs(x) - HALF - 1 > 0 ? 1 : 0)), FLOOR, z);
    }
    if (pose === 'climb') {
      const c = this.nearCorner(x, z);
      this.cornerYaw = Math.atan2(-c.x, -c.z);
      return new THREE.Vector3(c.x * 0.93, 3.25, c.z * 0.93);
    }
    if (up > 0 && (pose === 'held' || pose === 'vert')) return new THREE.Vector3(clamp(x, -HALF + 0.8, HALF - 0.8), 0, z);
    const air = pose === 'dive' ? up / W * FT_PER_W * 1.4 : 0;
    return new THREE.Vector3(clamp(x, -HALF + 0.6, HALF - 0.6), air, z);
  }
  nearCorner(x, z) {
    let best = null, bd = 1e9;
    for (const [cx, cz] of CORNERS) { const d = (cx - x) ** 2 + (cz - z) ** 2 + (cz < 0 ? 0 : 60); if (d < bd) { bd = d; best = { x: cx, z: cz }; } }
    return best;
  }
  setWide(on) { this.wide = !!on; }
  setCage(on) { this.cageOn = !!on; if (this.arena) this.arena.setCage(this.cageOn); }
  setPrize(kind) { this.prize = kind || null; if (this.arena) this.arena.hangPrize(this.prize); }
  /* an impact the engine places by its own x (a share of the stage width): on whoever stands nearest */
  impactX(xs, power) {
    const x = xs * FT_PER_W / (this.wide ? 0.74 : 1); let best = null, bd = 1e9;
    for (const k of ['me', 'opp', 'extra']) { const f = this.figs[k]; if (!f.visible || !f.w) continue; const d = Math.abs(f.pos.x - x); if (d < bd) { bd = d; best = f; } }
    if (best) this.impactAt(best, power);
  }
  dustFig(k) { const f = this.figs[k]; if (f.w && f.visible) this.dust(f.w.point('pelvis').setY(0.05), 1.2); }
  /* fountains of sparks off the two near posts, for an entrance */
  pyro() {
    for (const sx of [-1, 1]) this.sparks.emit(new THREE.Vector3(sx * POST, 5.2, POST), 70, { colors: ['#fff3b0', '#ffd34a', '#ff8a3a'], speed: 9, up: 1.4, spread: 0.6, life: 1.1, size: 0.22, grav: 14 });
    this.mood.flash = 1;
  }

  /* ---------- a whole move, both bodies ---------- */
  play(family, name, A, D, hooks = {}) {
    const fa = this.figs[A], fd = this.figs[D];
    if (!fa.w || !fd.w) return Promise.resolve();
    const choice = pick(family, name);
    /* the move frame: A where he stands, facing D, shifted so the move fits inside the ropes */
    const O = new THREE.Vector3(fa.pos.x, 0, fa.pos.z);
    let ex = new THREE.Vector3(fd.pos.x - fa.pos.x, 0, fd.pos.z - fa.pos.z);
    if (ex.lengthSq() < 0.5) ex.set(fa.side < 0 ? 1 : -1, 0, 0);
    ex.normalize();
    /* ez is +z of the move frame: world +z when A faces +x, so the frame turns with phi below */
    const ez = new THREE.Vector3(-ex.z, 0, ex.x);
    const toWall = (p, d) => { /* distance along d from p to the rope line */
      let best = 1e9;
      for (const [ax, lim] of [['x', HALF], ['z', HALF]]) { const dv = d[ax], pv = p[ax]; if (Math.abs(dv) > 1e-3) { const t = ((dv > 0 ? lim : -lim) - pv) / dv; if (t > 0 && t < best) best = t; } }
      return best;
    };
    const back = clamp(toWall(O, ex.clone().negate()) - 0.6, 1.2, 5.5);
    let ctx = { back, fwd: 0, top: 3.25 };
    /* shift along ex so the far end of the move (about 4.6 ft past D) stays inside */
    const reach = 2.6 + 2.2, room = toWall(O, ex) - 0.6;
    if (room < reach) O.addScaledVector(ex, room - reach);
    ctx.fwd = clamp(toWall(O, ex) - 0.5, 3.4, 9);
    if (choice.family === 'aerial') {
      /* the corner nearest where he will lie, a back one so the camera sees the climb,
         and he lies about four feet out from it: a real flyer picks the turnbuckle
         over his man, not the one across the ring */
      const dguess = O.clone().addScaledVector(ex, 2.6);
      let c = null, bd = 1e9;
      for (const [cx, cz] of CORNERS) { if (cz > 0) continue; const d = (cx - dguess.x) ** 2 + (cz - dguess.z) ** 2; if (d < bd) { bd = d; c = { x: cx, z: cz }; } }
      const cw = new THREE.Vector3(c.x * 0.93, 0, c.z * 0.93), inw = new THREE.Vector3(-c.x, 0, -c.z).normalize();
      const dpos = cw.clone().addScaledVector(inw, 4.6);
      const toM = (v) => { const d = v.clone().sub(O); return [d.dot(ex), d.dot(ez)]; };
      ctx.corner = toM(cw); const ci = toM(cw.clone().addScaledVector(inw, 1.6)); ctx.cin = [ctx.corner[0] - ci[0], ctx.corner[1] - ci[1]];
      const dm = toM(dpos); ctx.dx = dm[0]; ctx.dz = dm[1];
      const ux = ctx.corner[0] - ci[0], uz = ctx.corner[1] - ci[1];
      ctx.cyaw = Math.atan2(-uz, ux);
      ctx.dyaw = Math.atan2(-(ctx.dz - ctx.corner[1]), ctx.dx - ctx.corner[0]);
    }
    const clip = choice.make(ctx);
    const phi = Math.atan2(-ex.z, ex.x);
    const toWorld = (x, y, z) => O.clone().addScaledVector(ex, x).addScaledVector(ez, z).setY(y);
    const yawW = (a) => phi + H + a;
    /* hand the bodies to the clip; blend from where they are into its first frame */
    const preA = { pose: fa.cur || fa.pose, pos: fa.pos.clone(), yaw: fa.yaw }, preD = { pose: fd.cur || fd.pose, pos: fd.pos.clone(), yaw: fd.yaw };
    fa.script = fd.script = clip; fa.from = fd.from = null;
    const big = !!hooks.big, fin = !!hooks.finisher;
    return new Promise((resolve) => {
      const job = { clip, t: -0.18, fired: new Set(), A: fa, D: fd, preA, preD, toWorld, yawW, ex, resolve, big, fin, hooks, family: choice.family, variant: choice.variant };
      this.job = job;
      /* A MOVE NEVER HOLDS THE MATCH. Frames stop in a background tab, and the old
         SVG ring ran on timers that do not, so a clock that only advanced on frames
         would leave the match waiting on a move nobody can see. This finishes it on
         a timer: every hit still lands, in order, and the bodies take their last frame. */
      job.guard = setTimeout(() => { if (this.job === job) this.finishJob(job); }, ((clip.dur + 0.4) / Math.max(0.25, this.speed)) * 1000 * 2.5 + 400);
      if (fin) this.cue({ cam: 'finisher' }, job);
      else if (big) this.cue({ cam: 'low' }, job);
    });
  }
  sampleActor(keys, t, actor, job, other) {
    let i = 0; while (i < keys.length - 2 && keys[i + 1].t <= t) i++;
    const a = keys[i], b = keys[Math.min(i + 1, keys.length - 1)];
    const span = b.t - a.t;
    let u = span > 0 ? clamp((t - a.t) / span, 0, 1) : 1;
    u = (EASE[b.ease] || EASE.inout)(u);
    if (t >= keys[keys.length - 1].t) { u = 1; }
    const P = lerpPose(keyPose(a), keyPose(b), u);
    const yaw = angLerp(a.yaw, b.yaw, u);
    const free = (key) => job.toWorld(key.x, key.y || 0, key.z || 0);
    /* grounded keys stand on their own root; a body held or in the air has no floor */
    actor.w.floorY = (a.on || b.on || (a.y || 0) > 0.6 || (b.y || 0) > 0.6) ? -99 : 0;
    actor.w.apply(alive(P, actor.phase, 0));
    const yw = job.yawW(yaw);
    let pos;
    const attached = (key) => {
      const op = other.w.point(key.on === 'hands' ? 'hands' : key.on);
      const off = new THREE.Vector3().addScaledVector(job.ex, key.off[0] * other.w.S).setY(key.off[1] * other.w.S).addScaledVector(new THREE.Vector3(-job.ex.z, 0, job.ex.x), key.off[2] || 0);
      const target = op.add(off);
      const pl = actor.w.pelvis.position.clone().applyAxisAngle(UP, yw);
      return target.sub(pl);
    };
    if (a.on && b.on) pos = attached(u < 0.5 ? a : b).clone();
    else if (b.on) pos = free(a).lerp(attached(b), u);
    else if (a.on) pos = attached(a).lerp(free(b), u);
    else pos = free(a).lerp(free(b), u);
    if (!a.on && !b.on && (b.y || 0) === 0 && (a.y || 0) === 0) pos.y = 0;
    /* a blend out of a lift is on the canvas before its keys say so: once the
       body is down there, its floor comes back (the pelvis does not move, so the
       position worked out off it still holds) */
    if (actor.w.floorY < -50 && pos.y < 0.6) { actor.w.floorY = -pos.y; actor.w.apply(alive(P, actor.phase, 0)); }
    actor.pos.copy(pos); actor.yaw = yw; actor.roll = 0;
    actor.cur = P;
    actor.w.root.position.copy(pos); actor.w.root.rotation.set(0, yw, 0, 'YXZ');
  }
  stepJob(dt) {
    const job = this.job; if (!job) return;
    job.t += dt;
    const { clip, A, D } = job;
    if (job.t < 0) {
      /* the lead in: from where they stood into the clip's first frame */
      const u = EASE.inout(1 + job.t / 0.18);
      for (const [fig, pre, keys] of [[A, job.preA, clip.A], [D, job.preD, clip.D]]) {
        const k0 = keys[0], P = lerpPose(pre.pose, keyPose(k0), u);
        const tp = job.toWorld(k0.x, k0.y || 0, k0.z || 0);
        fig.pos.lerpVectors(pre.pos, tp, u); fig.yaw = angLerp(pre.yaw, job.yawW(k0.yaw), u);
        fig.applyNow(alive(P, fig.phase, 0)); fig.cur = P;
      }
      return;
    }
    this.sampleActor(clip.A, job.t, A, job, D);
    this.sampleActor(clip.D, job.t, D, job, A);
    for (const c of clip.fx || []) if (job.t >= c.t && !job.fired.has(c)) { job.fired.add(c); this.cue(c, job); }
    if (job.t >= clip.dur) { this.finishJob(job); }
  }
  finishJob(job) {
    const { clip, A, D } = job;
    if (this.job !== job) return;
    clearTimeout(job.guard);
    for (const c of clip.fx || []) if (!job.fired.has(c)) { job.fired.add(c); if (c.hit != null) this.cue({ hit: c.hit }, job); }
    if (job.t < clip.dur) { job.t = clip.dur; this.sampleActor(clip.A, clip.dur, A, job, D); this.sampleActor(clip.D, clip.dur, D, job, A); }
    {
      A.script = D.script = null; A.pose = A.cur; D.pose = D.cur;
      A.tpos = A.pos.clone(); D.tpos = D.pos.clone(); A.tyaw = A.yaw; D.tyaw = D.yaw;
      A.poseName = lastPoseName(clip.A); D.poseName = lastPoseName(clip.D);
      this.job = null; this.camWant = { mode: 'match', t: this.clock };
      job.resolve();
    }
  }
  cue(c, job) {
    if (c.hit != null && job && job.hooks.hit) { try { job.hooks.hit(c.hit); } catch (e) { console.warn(e); } this.impactAt(job.D, c.hit + (job.big ? 1 : 0)); }
    if (c.shake) this.shake(c.shake * (job && job.big ? 1.3 : 1));
    if (c.dust) { const f = c.dust === 'A' ? job.A : job.D; this.dust(f.w.point('pelvis').setY(0.05), c.dust === 'D' && job.big ? 1.6 : 1); }
    if (c.rope && this.arena) { const f = job.A, side = this.ropeSide(f.pos); if (side) this.arena.ropeHit(side, c.s || 0.8); }
    if (c.slow) { this.timeScale = c.slow; this.slowUntil = this.clock + (c.d || 0.2) * (job && job.fin ? 2.2 : 1); }
    if (c.cam) { this.camWant = { mode: c.cam, t: this.clock, job }; }
  }
  ropeSide(p) {
    const ax = Math.abs(p.x), az = Math.abs(p.z);
    if (Math.max(ax, az) < HALF - 2.2) return null;
    return ax > az ? (p.x > 0 ? 'e' : 'w') : (p.z > 0 ? 's' : 'n');
  }

  /* ---------- effects ---------- */
  impactAt(fig, power = 1) {
    if (!fig || !fig.w) return;
    const p = fig.w.point('chest');
    const n = 10 + power * 10;
    this.sparks.emit(p, n, { colors: ['#fff6cf', '#ffd34a', '#ff8a3a', '#ffffff'], speed: 7 + power * 3, life: 0.35, size: 0.26, grav: 4 });
    this.sparks.emit(p, 6 + power * 3, { colors: ['#cfe6ff', '#ffffff'], speed: 5, life: 0.6, size: 0.14, up: 0.6 });
    if (power >= 2) { this.flashScreen(0.35); this.mood.flash = 1; }
  }
  impact(k, power) { this.impactAt(this.figs[k], power); }
  dust(p, s = 1) { this.sparks.emit(p, Math.round(16 * s), { colors: ['#d8cfbf', '#bfb5a2', '#efe8da'], speed: 4.5 * s, life: 0.55, size: 0.3, flat: true, grav: 2 }); }
  shake(a) { this.shakeAmp = Math.min(1.4, this.shakeAmp + a * 0.5); }
  flashScreen(a = 0.6) { const f = this.flash; f.style.transition = 'none'; f.style.opacity = String(a); requestAnimationFrame(() => { f.style.transition = 'opacity .28s'; f.style.opacity = '0'; }); }
  confetti() { this.sparks.emit(new THREE.Vector3(0, 12, 0), 160, { colors: ['#ffd34a', '#ffffff', '#ff5a5a', '#5ab0ff'], speed: 6, up: 0.1, spread: 0.4, life: 2.4, size: 0.2, grav: 3 }); }
  setMood(m) { Object.assign(this.mood, m); }
  setCamera(mode) { this.camWant = { mode, t: this.clock }; }

  /* ---------- the broadcast camera ----------
     A hard camera across the ring, framing whoever is involved and pulling in
     or out to fit them, cutting closer or lower on the moments that earn it.
     It eases toward its target rather than snapping, except a cut, which a
     real director uses on purpose. */
  directCamera(dt) {
    const S = this.camState, mode = this.camWant.mode, job = this.camWant.job || this.job;
    const live = ['me', 'opp', 'extra'].map((k) => this.figs[k]).filter((f) => f.visible && f.w);
    let fx = 0, fz = 0, fy = 2.4, minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
    for (const f of live) { const p = f.pos; fx += p.x; fz += p.z; minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); }
    if (live.length) { fx /= live.length; fz /= live.length; } else { minX = maxX = minZ = maxZ = 0; }
    const spread = Math.max(maxX - minX, (maxZ - minZ) * 1.3, 4);
    let want = { fx, fy: 2.8, fz, dist: 15 + spread * 1.05, height: 6.8, yaw: 0, fov: 34 };
    const elapsed = this.clock - (this.camWant.t || 0);
    let auto = mode;
    if (mode === 'match' && !this.job) {
      const poses = ['me', 'opp'].map((k2) => this.figs[k2].poseName);
      if (poses.includes('pin')) auto = 'pin';
      else if (poses.includes('submit')) auto = 'hold';
      else if (poses.includes('raised') || this.figs.ref.poseName === 'refRaise') auto = 'pose';
    }
    if (auto === 'entrance') want = { fx: fx * 0.6, fy: 3, fz: fz + 2, dist: 30, height: 11, yaw: Math.sin(this.clock * 0.25) * 0.25, fov: 34 };
    else if (auto === 'wide' || this.wide) want = { fx: fx * 0.5, fy: 1, fz: 0, dist: 44, height: 18, yaw: 0, fov: 36 };
    else if (auto === 'low' || auto === 'hold') want = { fx, fy: auto === 'hold' ? 2.4 : 3.4, fz, dist: Math.max(18, 16 + spread * 1.05), height: auto === 'hold' ? 4.6 : 3.4, yaw: 0.18, fov: 34 };
    else if (auto === 'pin') want = { fx, fy: 1.1, fz, dist: 15, height: 3.6, yaw: -0.22, fov: 34 };
    else if (auto === 'face') { const a = job ? job.A : this.figs.me; want = { fx: a.pos.x, fy: 4.2, fz: a.pos.z, dist: 14, height: 4.8, yaw: 0.12, fov: 34 }; }
    else if (auto === 'corner' || auto === 'air') want = { fx: fx * 0.7, fy: auto === 'air' ? 4.6 : 4, fz: fz * 0.7, dist: 28 + spread * 0.6, height: 8, yaw: 0.22 * Math.sign(fx || 1), fov: 36 };
    else if (auto === 'finisher') want = { fx, fy: 3, fz, dist: 17 + spread * 0.7, height: 5, yaw: -0.4 + elapsed * 0.22, fov: 36 };
    else if (auto === 'pose') want = { fx, fy: 3.6, fz, dist: 18, height: 5.5, yaw: Math.sin(this.clock * 0.3) * 0.3, fov: 34 };
    const k = 1 - Math.exp(-dt * (mode === 'finisher' ? 3 : 2.4));
    S.focus.x += (want.fx - S.focus.x) * k; S.focus.y += (want.fy - S.focus.y) * k; S.focus.z += (want.fz - S.focus.z) * k;
    S.dist += (want.dist - S.dist) * k; S.height += (want.height - S.height) * k; S.yaw = angLerp(S.yaw, want.yaw, k); S.fov += (want.fov - S.fov) * k;
    const c = this.cam;
    if (this.camFixed) { c.position.fromArray(this.camFixed.pos); c.lookAt(...this.camFixed.look); if (c.fov !== 34) { c.fov = 34; c.updateProjectionMatrix(); } return; }
    c.position.set(S.focus.x + Math.sin(S.yaw) * S.dist, S.focus.y + S.height, S.focus.z + Math.cos(S.yaw) * S.dist);
    if (this.shakeAmp > 0.001) {
      const a = this.shakeAmp * 0.35;
      c.position.x += (Math.random() - 0.5) * a; c.position.y += (Math.random() - 0.5) * a;
      this.shakeAmp *= Math.exp(-dt * 7);
    }
    c.lookAt(S.focus.x, S.focus.y, S.focus.z);
    if (Math.abs(c.fov - S.fov) > 0.01) { c.fov = S.fov; c.updateProjectionMatrix(); }
  }

  _loop(now) {
    if (!this.running) return;
    requestAnimationFrame(this._loop);
    /* A move keeps wall clock time even when frames are slow (software WebGL, a
       tired phone): the match engine's own waits are timers, so a clip that ran
       at render speed would fall behind them. Only the camera and the sparks
       take a small step, because they are the parts that jump. */
    const dt = Math.min(0.25, (now - this._last) / 1000); this._last = now;
    /* hidden: keep a move's clock running (the match is waiting on it) but draw nothing */
    if (!this.canvas.isConnected || !this.host.offsetWidth) { this.stepJob(dt * this.speed); return; }
    this.frame(dt);
  }
  frame(dt) {
    if (this.clock > this.slowUntil) this.timeScale += (1 - this.timeScale) * Math.min(1, dt * 8);
    const sdt = dt * this.speed * this.timeScale;
    this.clock += dt;
    this.stepJob(sdt);
    for (const k in this.figs) this.figs[k].update(sdt);
    const vdt = Math.min(dt, 0.05);
    this.sparks.update(vdt);
    if (this.arena) this.arena.update(vdt, this.clock, this.mood);
    this.mood.flash *= Math.exp(-dt * 4);
    this.directCamera(vdt);
    this.r.render(this.scene, this.cam);
  }

  dispose() {
    this.running = false; if (this._ro) this._ro.disconnect();
    if (this.arena) this.arena.dispose();
    for (const k in this.figs) if (this.figs[k].w) this.figs[k].w.dispose();
    this.r.dispose(); this.canvas.remove(); this.flash.remove();
  }
}
const UP = new THREE.Vector3(0, 1, 0), UPV = UP;
function lastPoseName(keys) { const p = keys[keys.length - 1].pose; return typeof p === 'string' ? p : (p && p.base) || null; }
