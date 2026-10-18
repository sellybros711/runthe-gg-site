/* Shut The Door: the mound in 3D. window.STD_STAGE, for the game (ui.js).
 *
 * The same surface the old canvas scene and its animation gave the game, so ui.js keeps its flow:
 *   STD_STAGE.supported()            WebGL here? (no: the game keeps its old drawing)
 *   STD_STAGE.preload()              start every download now (the page calls it on the home screen)
 *   const st = STD_STAGE.create(canvas)
 *   st.setScenario(scn)              the pack's scenario: the closer, his arsenal, the hitters
 *   st.setBatter(b)                  each hitter in turn: his real height and weight, his side
 *   st.setTarget(cell)               the catcher sets up on the picked cell (null: the middle)
 *   st.layout(); st.draw()           size to the canvas, draw the set
 *   st.gridRect(), st.toScreen(pp), st.cellCenter(cell)   where the zone is on screen, for the
 *                                    game's own grid and marker (the grid is the game's, shown
 *                                    only while aiming)
 *   st.play({ pr, quick, hooks })    one pitch, driven by the engine's PitchResult (play.js), to
 *                                    the call: hooks.sound(name, delayMs), hooks.call(), and
 *                                    hooks.field(runners) for the scorebar diamond as they run.
 *                                    A tap skips to the end. Resolves when it is over.
 * Everything waits for the downloads: calls made before then are kept and applied when they land.
 */
import * as THREE from 'three';
import { preload } from './load.js?v=5';
import { makeRenderer, buildPark, lightFrom, pitcherEye, webglAvailable } from './park.js?v=2';
import { People } from './people.js?v=13';
import { Pitch } from './pitch.js?v=5';
import { fromResult, motion } from './play.js?v=3';
import { look } from './looks.js?v=1';
import { P } from './units.js?v=1';

const C = () => window.STD_CONTRACT;
// the grid: a column is CELL_FT wide at the plate, and a cell is never under CELL_PX on screen
const CELL_FT = 0.553, CELL_PX = 44.5, MARGIN = 0.02;
const AN = () => window.STD_ANIM;
const TEST = () => window.STD_STAGE_TEST;

/** The scene's facts from the game's scenario (the same shape as the lab's pack facts). */
function factsFrom(scn, extra) {
  const p = scn.pitcher;
  return {
    scenarioId: scn.id,
    pitcher: { name: p.name, throws: p.throws, teamColors: p.teamColors,
      arsenal: p.arsenal.map((a) => ({ type: a.type, name: a.name, velo: a.velo, pfxX: a.pfxX, pfxZ: a.pfxZ, shape: a.shape || (C() && C().SHAPE_OF[a.type]), sigmaFt: a.sigmaFt })) },
    situation: { usHome: !!scn.situation.usHome, inning: scn.situation.inning, half: scn.situation.half },
    release: { x: p.throws === 'L' ? 1.9 : -1.9, y: 54.0, z: 5.6, assumed: 'a stand in release for his hand' },
    batters: scn.batters.map((b) => {
      const bi = extra.bio && extra.bio[b.id];
      return { id: b.id, bats: b.bats, szTop: b.szTop, szBot: b.szBot, heightIn: bi ? bi.heightIn : null, weightLb: bi ? bi.weightLb : null, ...look(b.id) };
    }),
    uniform: extra.uniform,
  };
}

class Stage {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = makeRenderer(canvas, 2);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(10, 1, 0.05, 900);
    this.eye = pitcherEye(this.camera);
    this.park = buildPark(this.scene, this.renderer);
    this.is3d = true;
    this.cell = null;
    this.t = 0;
    this.ready = this.init();
  }

  async init() {
    const a = await preload({ game: true });
    this.extra = { uniform: a.facts.uniform, bio: a.facts.bio };
    this.gltfs = a.gltfs;
    lightFrom(this.scene, this.renderer, a.env);
    if (this.scn) this.applyScenario();
    this.loaded = true;
    await this.renderer.compileAsync(this.scene, this.camera);
    this.layout();
    this.draw();
    return this;
  }

  setScenario(scn) {
    if (scn === this.scn) return;
    this.scn = scn;
    if (this.loaded) this.applyScenario();
  }

  applyScenario() {
    if (this.people) {
      for (const p of [this.people.batter, this.people.catcher, this.people.umpire]) if (p) this.scene.remove(p.root);
      if (this.people.batter && this.people.batter.bat) this.scene.remove(this.people.batter.bat);
    }
    if (this.pitch) { this.pitch.dispose(); this.pitch = null; }
    this.facts = factsFrom(this.scn, this.extra);
    this.people = new People({ scene: this.scene, facts: this.facts });
    this.people.setup(this.gltfs);
    if (this.batterId != null) this.applyBatter();
  }

  setBatter(b) {
    this.batterId = b.id;
    this.bat = b;
    this.zone = { szTop: b.szTop, szBot: b.szBot, bats: b.bats };
    this.eye.setSide(b.bats);
    if (this.loaded && this.facts) this.applyBatter();
    this.layout();
  }

  applyBatter() {
    const f = this.facts.batters.find((x) => x.id === this.batterId) || this.facts.batters[0];
    this.facts.batter = f;
    this.people.setBatter(f);
    this.preview();
  }

  setTarget(cell) {
    this.cell = cell;
    if (this.loaded && this.facts && this.facts.batter) this.preview();
  }

  /** The set: everyone in their stance, the catcher set up on the target, no ball yet. */
  preview() {
    const f = this.facts.batter, c = C();
    const cell = this.cell == null ? 12 : this.cell;
    const tg = c ? c.targetOf(cell) : { x: 0, zn: 0.5 };
    const z = f.szBot + tg.zn * (f.szTop - f.szBot);
    const play = { call: { type: this.facts.pitcher.arsenal[0].type, cell }, actual: { x: tg.x, z }, velo: null, batter: 'take', result: 'ball', inPlay: null };
    this.setPitch(play);
    this.pose(0);
    this.render();
  }

  setPitch(play) {
    if (this.pitch) this.pitch.dispose();
    const m = motion(play, this.facts.batter);
    this.pitch = new Pitch({ scene: this.scene, facts: this.facts, play, batter: this.facts.batter, m, overlays: false });
    this.people.setPlay(this.pitch, play, m);
    this.m = m;
  }

  pose(t) {
    this.t = t;
    this.eye.update(t);
    if (this.pitch) this.pitch.update(t, this.camera);
    if (this.people && this.people.batter && this.people.batter.chain) this.people.update(t, 0);
  }

  render() { this.renderer.render(this.scene, this.camera); }

  layout() {
    const w = this.canvas.clientWidth || this.canvas.width, h = this.canvas.clientHeight || this.canvas.height;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.eye.resize(w, h);
    this.eye.update(this.t);
    if (this.loaded) { this.fit(); this.render(); }
  }

  /** frame (ignored: the 3D scene keeps its own state). After a pitch, back to the set. */
  draw() {
    if (!this.loaded) return;
    if (this.dirty && this.facts && this.facts.batter) { this.dirty = false; this.preview(); return; }
    this.render();
  }

  /** A plate point (catcher's view x in feet, zn normalised to this hitter) on the canvas, in CSS px. */
  toScreen(pp) {
    const zb = this.zone || { szTop: 3.4, szBot: 1.6 };
    const z = zb.szBot + pp.zn * (zb.szTop - zb.szBot);
    const v = P(pp.x, 17 / 12, z).project(this.camera);
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    return { x: (v.x + 1) / 2 * w, y: (1 - v.y) / 2 * h };
  }

  cellCenter(cell) { return this.toScreen(C().targetOf(cell)); }

  /** The 5x5 grid's box on the canvas: the zone's three columns and rows and one more each side. */
  gridRect() {
    const zb = this.zone || { szTop: 3.4, szBot: 1.6 };
    const third = 1 / 3, cw = CELL_FT;
    const a = this.toScreen({ x: -2.5 * cw, zn: -third }), b = this.toScreen({ x: 2.5 * cw, zn: 1 + 2 * third });
    void zb;
    return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
  }

  /** Where each figure lands on the canvas in CSS px, from its skinned vertices, for the framing
      and the browser check: the batter (with his helmet), his bat, the catcher and the umpire. */
  figureBoxes(samples = 4000) {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight, v = new THREE.Vector3();
    const box = (objs) => {
      const b = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
      for (const o of objs) if (o) o.traverse((m) => {
        if (!m.isMesh || !m.visible) return;
        const pos = m.geometry.attributes.position, step = Math.max(1, Math.floor(pos.count / samples));
        m.updateMatrixWorld();
        for (let i = 0; i < pos.count; i += step) {
          m.getVertexPosition(i, v);
          v.applyMatrix4(m.matrixWorld).project(this.camera);
          const x = (v.x + 1) / 2 * w, y = (1 - v.y) / 2 * h;
          b.x0 = Math.min(b.x0, x); b.x1 = Math.max(b.x1, x); b.y0 = Math.min(b.y0, y); b.y1 = Math.max(b.y1, y);
        }
      });
      return b;
    };
    const P = this.people;
    return { batter: box([P.batter.root]), bat: box([P.batter.bat]), catcher: box([P.catcher.root]), umpire: box([P.umpire.root]), W: w, H: h };
  }

  /** Fit the frame to the people in the set: everyone in, with a margin, and as close as that
      allows, but never so wide that a cell of the grid is under CELL_PX (a thumb). On a narrow
      phone that wins: the frame keeps the hitter and his feet, and lets the top of the bat and
      the catcher's far side go first. On a short screen the bodies win: nobody loses his head. */
  fit() {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (!w || !h || !this.people || !this.people.batter || !this.people.batter.chain) return;
    const eye = this.eye;
    eye.fit = null;
    const maxFw = Math.min(eye.preset().fw, (w * CELL_FT) / CELL_PX);
    for (let it = 0; it < 3; it++) {
      eye.resize(w, h); eye.update(0);
      const f = { ...eye.frame }, fb = this.figureBoxes(800);
      const u = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
      for (const k of ['batter', 'bat', 'catcher', 'umpire']) {
        const b = fb[k];
        u.x0 = Math.min(u.x0, b.x0); u.x1 = Math.max(u.x1, b.x1); u.y0 = Math.min(u.y0, b.y0); u.y1 = Math.max(u.y1, b.y1);
      }
      // px per foot on the plate, both ways (screen x and y against plate x and height)
      const o = P(f.x, 0, f.z).project(this.camera), ox = P(f.x + 1, 0, f.z).project(this.camera), oz = P(f.x, 0, f.z + 1).project(this.camera);
      const kx = (ox.x - o.x) / 2 * w, kz = -(oz.y - o.y) / 2 * h;
      const ftPx = f.fw / w;
      const need = Math.max((u.x1 - u.x0) * ftPx / (1 - 2 * MARGIN), (u.y1 - u.y0) * ftPx / (1 - 2 * MARGIN) * w / h);
      // the bodies (not the bat) always fit top to bottom, even if a short screen's cells get smaller
      const by0 = Math.min(fb.batter.y0, fb.catcher.y0, fb.umpire.y0), by1 = Math.max(fb.batter.y1, fb.catcher.y1, fb.umpire.y1);
      const needBody = (by1 - by0) * ftPx / (1 - 2 * MARGIN) * w / h;
      const fw = Math.max(Math.min(need, maxFw), needBody), sc = f.fw / fw;
      // the content's box after the zoom (it scales about the canvas centre)
      const z = (a, c) => c + (a - c) * sc;
      const n = { x0: z(u.x0, w / 2), x1: z(u.x1, w / 2), y0: z(u.y0, h / 2), y1: z(u.y1, h / 2) };
      // too wide for the canvas (a narrow phone): the hitter stays whole, the catcher's far side goes
      const fitsH = n.x1 - n.x0 <= w * (1 - 2 * MARGIN);
      const bRight = fb.batter.x0 + fb.batter.x1 > fb.catcher.x0 + fb.catcher.x1;
      const cx = fitsH ? (n.x0 + n.x1) / 2 - w / 2 : bRight ? n.x1 - w * (1 - MARGIN) : n.x0 - w * MARGIN;
      const fitsV = n.y1 - n.y0 <= h * (1 - 2 * MARGIN);
      const cy = fitsV ? (n.y0 + n.y1) / 2 - h / 2 : n.y1 - h * (1 - MARGIN);
      eye.fit = { x: f.x + cx / (kx * sc), z: f.z + cy / (kz * sc), fw };
    }
    eye.resize(w, h); eye.update(this.t);
  }

  /** Where things are this frame, for the browser check's trace of a play: the ball, the bat's
      tip, the hitter's pelvis, the umpire's hands, and whether any overlay is up. */
  sample(t) {
    const B = this.people.batter, U = this.people.umpire, pt = this.pitch;
    const r = (v) => v.toArray().map((n) => Math.round(n * 1000) / 1000);
    const at = (o) => r(o.getWorldPosition(new THREE.Vector3()));
    return {
      t: Math.round(t * 1000) / 1000,
      ball: pt.ball.visible ? at(pt.ball) : null,
      tip: B.bat ? r(new THREE.Vector3(0, 0.75, 0).applyMatrix4(B.bat.matrixWorld)) : null,
      pel: at(B.bones.pelvis), uR: at(U.bones.hand_r), uL: at(U.bones.hand_l),
      overlay: [pt.tracer, pt.aimRing, pt.hitDot, ...(pt.grid || [])].some((o) => o && o.visible),
    };
  }

  /** One pitch to the call. */
  async play(opts) {
    await this.ready;
    const pr = opts.pr, hooks = opts.hooks || {};
    const play = fromResult(pr, this.facts.batter);
    this.setPitch(play);
    const pt = this.pitch, m = this.m;
    const speed = opts.quick ? 1.8 : 1;
    const resultAt = pt.after ? pt.tRel + pt.after.t0 : pt.tCatch;
    const inPlay = pr.result === 'in_play';
    const tail = inPlay ? 2.0 : pr.result === 'foul' ? 1.5 : pr.result === 'hit_by_pitch' ? 1.5 : m.ump === 'strike' ? 1.3 : 0.9;
    const tEnd = resultAt + tail;
    // the runners on the scorebar diamond, on the same clock the old drawing used (ms from the start)
    const track = AN() && AN().runnerTrack ? AN().runnerTrack(pr, (resultAt + (inPlay ? 0.26 : 0.22)) * 1000, (inPlay ? 1150 : 700)) : null;
    if (hooks.sound) hooks.sound('whoosh', pt.tRel * 1000 / speed);
    // what the browser check reads back: the play's reading and a few frames of it
    const trace = this.trace = { n: pr.n, result: pr.result, bb: pr.inPlay ? pr.inPlay.bb : null, m: { ...m }, check: play.check, dirt: play.dirt,
      bats: this.facts.batter.bats, resultAt, tEnd, frames: 0, skipped: false, s: [] };
    const keep = (t) => { if (trace.s.length < 400) trace.s.push(this.sample(t)); };
    return new Promise((done) => {
      let start = null, lastT = -1, raf = 0, finished = false, popped = false, called = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        cancelAnimationFrame(raf);
        document.removeEventListener('pointerdown', skip, true);
        if (!called) { called = true; if (hooks.call) hooks.call(); }
        if (track && track.running && hooks.field) hooks.field(track.at(1e9).runners);
        trace.skipped = lastT < tEnd;
        this.pose(tEnd);
        this.render();
        keep(tEnd);
        this.dirty = true;
        done();
      };
      const skip = (e) => { if (e && e.target && e.target.closest && e.target.closest('header, .sheet')) return; finish(); };
      const tick = (now) => {
        if (finished) return;
        if (start == null) start = now;
        // the browser check can step the clock (window.STD_STAGE_TEST = { step, renderEvery }): a software
        // GL draws a frame in a second, so a real clock would show it two frames of a pitch
        const t = TEST() ? trace.frames * TEST().step * speed : (now - start) / 1000 * speed;
        lastT = t;
        if (!popped && t >= resultAt) {
          popped = true;
          const caught = ['ball', 'called_strike', 'swinging_strike', 'foul_tip'].includes(pr.result);
          if (hooks.sound) hooks.sound(caught ? 'pop' : pr.result === 'hit_by_pitch' ? 'thud' : 'crack');
        }
        if (!called && t >= resultAt + 0.12) { called = true; if (hooks.call) hooks.call(); }
        if (track && track.running && t >= resultAt && hooks.field) hooks.field(track.at(t * 1000).runners);
        this.pose(Math.min(t, tEnd));
        if (!TEST() || trace.frames % (TEST().renderEvery || 1) === 0) this.render();
        trace.frames++;
        keep(Math.min(t, tEnd));
        if (t >= tEnd) { finish(); return; }
        raf = requestAnimationFrame(tick);
      };
      document.addEventListener('pointerdown', skip, true);
      raf = requestAnimationFrame(tick);
    });
  }
}

let theStage = null;
window.STD_STAGE = {
  supported: webglAvailable,
  preload: () => preload({ game: true }),
  create(canvas) { if (!theStage || theStage.canvas !== canvas) theStage = new Stage(canvas); return theStage; },
  get current() { return theStage; },
};
// the downloads start as soon as this module runs: on the home screen, before the mound is opened
if (webglAvailable()) window.STD_STAGE.preload();
window.dispatchEvent(new Event('std-stage'));
