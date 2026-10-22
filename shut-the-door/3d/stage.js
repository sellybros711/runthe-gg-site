/* Shut The Door: the mound in 3D, for the game (ui.js), reached through boot.js (window.STD_STAGE).
 *
 * The same surface the old canvas scene and its animation gave the game, so ui.js keeps its flow:
 *   const st = await STD_STAGE.create(canvas)   (making it starts every download)
 *   st.setScenario(scn)              the pack's scenario: the closer, his arsenal, the hitters
 *   st.setBatter(b)                  each hitter in turn: his real height and weight, his side
 *   st.setTarget(cell)               the catcher sets up on the picked cell (null: the middle)
 *   st.layout(); st.draw()           size to the canvas, draw the set
 *   st.gridRect(), st.toScreen(pp), st.cellCenter(cell)   where the zone is on screen, for the
 *                                    game's own grid and marker (the grid is the game's, shown
 *                                    only while aiming)
 *   st.setPreview({ type, cell })   the break preview: a ghost trail from the hand to the cell's
 *                                    centre, the pitch's real shape (preview.js); null hides it
 *   st.previewPoints()               that trail on the canvas in CSS px, for the grid's thin line
 *   st.play({ pr, quick, hooks })    one pitch, driven by the engine's PitchResult (play.js), to
 *                                    the call: hooks.sound(name, delayMs), hooks.call(), and
 *                                    hooks.field(runners) for the scorebar diamond as they run.
 *                                    A tap skips to the end. Resolves when it is over.
 *                                    A ball in play is followed into the field (inplay.js): the
 *                                    broadcast cut, the fielders, the runners, hooks.call when the
 *                                    plan says the play is decided, hooks.field from the 3D runners.
 * Everything waits for the downloads: calls made before then are kept and applied when they land.
 */
import * as THREE from 'three';
import { preload } from './load.js?v=7';
import { makeRenderer, buildPark, lightFrom, pitcherEye } from './park.js?v=3';
import { People } from './people.js?v=35';
import { Pitch } from './pitch.js?v=7';
import { fromResult, motion } from './play.js?v=7';
import { look } from './looks.js?v=2';
import { P } from './units.js?v=1';
import { InPlay } from './inplay.js?v=3';
import { Ghost } from './preview.js?v=1';

const C = () => window.STD_CONTRACT;
// the grid: a column is CELL_FT wide at the plate, and a cell is never under CELL_PX on screen
const CELL_FT = 0.553, CELL_PX = 38, MARGIN = 0.03, ROOM = 1.04;
const AN = () => window.STD_ANIM;
const TEST = () => window.STD_STAGE_TEST;

/** The scene's facts from the game's scenario (the same shape as the lab's pack facts). */
function factsFrom(scn, extra) {
  const p = scn.pitcher;
  return {
    scenarioId: scn.id, title: scn.title,
    pitcher: { name: p.name, team: p.team, throws: p.throws, teamColors: p.teamColors,
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
    const mk = (k) => { window.STD_STAGE.marks[k] = Math.round(performance.now()); };
    mk('created');
    const a = await preload({ game: true });
    mk('assets');
    mk('preloaded');
    this.extra = { uniform: a.facts.uniform, bio: a.facts.bio };
    this.gltfs = a.gltfs;
    lightFrom(this.scene, this.renderer, a.env);
    mk('lit');
    if (this.scn) this.applyScenario();
    mk('people');
    if (this.inplay) this.inplay.warm(true);
    await this.renderer.compileAsync(this.scene, this.camera);
    if (this.inplay) this.inplay.warm(false);
    // one draw now compiles what compileAsync leaves (the shadow pass); on the home screen the canvas
    // is hidden, so nobody sees it
    this.render();
    mk('compiled');
    this.loaded = true;
    this.layout();
    mk('framed');
    this.draw();
    this.applyGhost();
    return this;
  }

  setScenario(scn) {
    if (scn === this.scn) return;
    this.scn = scn;
    if (this.gltfs) this.applyScenario();
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
    // the fielders and runners for a ball in play: built once from the catcher's body, dressed for
    // this scenario's two clubs
    if (!this.inplay) {
      this.inplay = new InPlay({ scene: this.scene, renderer: this.renderer, people: this.people, facts: this.facts });
      if (this.loaded) { this.inplay.warm(true); this.renderer.compile(this.scene, this.camera); this.inplay.warm(false); }
    } else { this.inplay.people = this.people; this.inplay.setFacts(this.facts); }
    if (this.batterId != null) this.applyBatter();
  }

  setBatter(b) {
    // the same hitter again (the home screen dressed him already): only the frame, from the set (a
    // play may have run since: framed where it ended, a hitter knocked down was framed lying there)
    if (b.id === this.batterId && this.facts && this.facts.batter && this.facts.batter.id === b.id) {
      if (this.dirty && this.loaded) { this.dirty = false; this.preview(); }
      this.layout();
      return;
    }
    this.batterId = b.id;
    this.bat = b;
    this.zone = { szTop: b.szTop, szBot: b.szBot, bats: b.bats };
    this.eye.setSide(b.bats);
    if (this.facts) this.applyBatter();
    this.layout();
  }

  applyBatter() {
    const f = this.facts.batters.find((x) => x.id === this.batterId) || this.facts.batters[0];
    this.facts.batter = f;
    this.people.setBatter(f);
    this.preview();
    this.applyGhost();
  }

  setTarget(cell) {
    this.cell = cell;
    if (this.loaded && this.facts && this.facts.batter) this.preview();
  }

  /** The break preview (the intended path, never the outcome): spec { type, cell } or null. */
  setPreview(spec) {
    this.ghostSpec = spec || null;
    this.applyGhost();
  }

  applyGhost() {
    if (!this.loaded || !this.facts || !this.facts.batter) return;
    const s = this.ghostSpec;
    if (!s) { if (this.ghost && this.ghost.visible) { this.ghost.hide(); this.soon(); } return; }
    const a = this.facts.pitcher.arsenal.find((x) => x.type === s.type);
    if (!a) return;
    if (!this.ghost) this.ghost = new Ghost(this.scene);
    const b = this.facts.batter;
    this.ghost.set({ release: this.facts.release, pitch: a, cell: s.cell == null ? 12 : s.cell, szTop: b.szTop, szBot: b.szBot });
    this.soon();
  }

  previewPoints() {
    if (!this.ghost || !this.ghost.visible) return null;
    return this.ghost.screen(this.camera, this.canvas.clientWidth, this.canvas.clientHeight);
  }

  /** The set: everyone in their stance, the catcher set up on the target, no ball yet. */
  preview() {
    if (this.inplay && this.inplay.active) this.inplay.end(this.camera);
    const f = this.facts.batter, c = C();
    const cell = this.cell == null ? 12 : this.cell;
    const tg = c ? c.targetOf(cell) : { x: 0, zn: 0.5 };
    const z = f.szBot + tg.zn * (f.szTop - f.szBot);
    const play = { call: { type: this.facts.pitcher.arsenal[0].type, cell }, actual: { x: tg.x, z }, velo: null, batter: 'take', result: 'ball', inPlay: null };
    this.setPitch(play);
    this.pose(0);
    if (this.loaded) this.soon();
  }

  setPitch(play) {
    if (this.pitch) this.pitch.dispose();
    const m = motion(play, this.facts.batter);
    this.pitch = new Pitch({ scene: this.scene, facts: this.facts, play, batter: this.facts.batter, m, grid: false });
    this.people.setPlay(this.pitch, play, m);
    this.m = m;
  }

  pose(t) {
    this.t = t;
    this.eye.update(t);
    if (this.pitch) this.pitch.update(t, this.camera);
    if (this.people && this.people.batter && this.people.batter.chain) this.people.update(t, 0);
  }

  render() {
    if (this.ghost && this.ghost.visible) this.ghost.orient(this.camera, this.canvas.clientHeight);
    this.renderer.render(this.scene, this.camera);
  }

  /** A frame on the next animation frame, once, however many changes asked for one (a tap on take
      the mound sizes, frames and sets the hitter: one frame, not one each). */
  soon() {
    if (this.soonId) return;
    this.soonId = requestAnimationFrame(() => {
      this.soonId = 0;
      this.render();
      if (!window.STD_STAGE.marks.drawn && this.canvas.clientWidth) window.STD_STAGE.marks.drawn = Math.round(performance.now());
    });
  }

  layout() {
    const w = this.canvas.clientWidth || this.canvas.width, h = this.canvas.clientHeight || this.canvas.height;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.eye.resize(w, h);
    this.camera.userData.cssH = h;
    this.eye.update(this.t);
    if (this.loaded) { this.fit(); this.soon(); }
  }

  /** frame (ignored: the 3D scene keeps its own state). After a pitch, back to the set. */
  draw() {
    if (!this.loaded) return;
    if (this.dirty && this.facts && this.facts.batter) { this.dirty = false; this.preview(); } else this.soon();
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
    // five rows of a third each, from a third under the zone to a third over it (it read 1 + 2 * third,
    // a grid a fifth too tall, so a cell's centre sat off the zone's: the break preview ends on it)
    const a = this.toScreen({ x: -2.5 * cw, zn: -third }), b = this.toScreen({ x: 2.5 * cw, zn: 1 + third });
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
        // a skinned vertex is read through the skeleton's bone matrices, which three.js refreshes
        // only when it draws: without this the box was the last frame drawn (after a fall, the
        // hitter lying on the ground, and the frame fitted to him there)
        if (m.isSkinnedMesh) m.skeleton.update();
        for (let i = 0; i < pos.count; i += step) {
          m.getVertexPosition(i, v);
          v.applyMatrix4(m.matrixWorld).project(this.camera);
          const x = (v.x + 1) / 2 * w, y = (1 - v.y) / 2 * h;
          b.x0 = Math.min(b.x0, x); b.x1 = Math.max(b.x1, x); b.y0 = Math.min(b.y0, y); b.y1 = Math.max(b.y1, y);
        }
      });
      return b;
    };
    const pp = this.people;
    // home plate: its five corners (feet, catcher's view; y toward the mound)
    const plate = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity }, hp = 17 / 24;
    for (const [x, y] of [[-hp, 2 * hp], [hp, 2 * hp], [hp, hp], [-hp, hp], [0, 0]]) {
      const q = P(x, y, 0).project(this.camera), sx = (q.x + 1) / 2 * w, sy = (1 - q.y) / 2 * h;
      plate.x0 = Math.min(plate.x0, sx); plate.x1 = Math.max(plate.x1, sx); plate.y0 = Math.min(plate.y0, sy); plate.y1 = Math.max(plate.y1, sy);
    }
    // and the dirt in front of it, so the plate sits in the frame and not on its edge
    const a = P(0, 2 * hp + 1.5, 0).project(this.camera), ax = (a.x + 1) / 2 * w, ay = (1 - a.y) / 2 * h;
    const apron = { x0: ax, x1: ax, y0: ay, y1: ay };
    return { batter: box([pp.batter.root]), bat: box([pp.batter.bat]), catcher: box([pp.catcher.root]), umpire: box([pp.umpire.root]), plate, apron, W: w, H: h };
  }

  /** Fit the frame to the set: the hitter, the catcher, the umpire and home plate all in, with a
      margin and a little room, as the lab frames it, but never so wide that a cell of the grid is
      under CELL_PX (38 px; the owner approved the lab's looser frame over a thumb sized 44). If a
      phone is too narrow even so, the hitter stays whole and the catcher's far side goes first. On
      a short screen the bodies win over the cell size: nobody loses his head. */
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
      for (const k of ['batter', 'bat', 'catcher', 'umpire', 'plate', 'apron']) {
        const b = fb[k];
        u.x0 = Math.min(u.x0, b.x0); u.x1 = Math.max(u.x1, b.x1); u.y0 = Math.min(u.y0, b.y0); u.y1 = Math.max(u.y1, b.y1);
      }
      // px per foot on the plate, both ways (screen x and y against plate x and height)
      const o = P(f.x, 0, f.z).project(this.camera), ox = P(f.x + 1, 0, f.z).project(this.camera), oz = P(f.x, 0, f.z + 1).project(this.camera);
      const kx = (ox.x - o.x) / 2 * w, kz = -(oz.y - o.y) / 2 * h;
      const ftPx = f.fw / w;
      const need = ROOM * Math.max((u.x1 - u.x0) * ftPx / (1 - 2 * MARGIN), (u.y1 - u.y0) * ftPx / (1 - 2 * MARGIN) * w / h);
      // the bodies (not the bat) always fit top to bottom, even if a short screen's cells get smaller
      const by0 = Math.min(fb.batter.y0, fb.catcher.y0, fb.umpire.y0), by1 = Math.max(fb.batter.y1, fb.catcher.y1, fb.umpire.y1, fb.apron.y1);
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
      tip, the hitter's pelvis, the umpire's hands, whether the 3D grid is up (never, in the game),
      and the opacity of the trail and of the aimed and actual markers. */
  sample(t) {
    const B = this.people.batter, U = this.people.umpire, pt = this.pitch;
    const r = (v) => v.toArray().map((n) => Math.round(n * 1000) / 1000);
    const at = (o) => r(o.getWorldPosition(new THREE.Vector3()));
    return {
      t: Math.round(t * 1000) / 1000,
      ball: pt.ball.visible ? at(pt.ball) : null,
      tip: B.bat ? r(new THREE.Vector3(0, 0.75, 0).applyMatrix4(B.bat.matrixWorld)) : null,
      pel: at(B.bones.pelvis), uR: at(U.bones.hand_r), uL: at(U.bones.hand_l),
      grid: (pt.grid || []).some((o) => o.visible),
      trail: pt.tracer.visible ? Math.round(pt.tracer.material.uniforms.uOpacity.value * 100) / 100 : 0,
      aimed: pt.aimRing.visible ? Math.round(pt.aimRing.material.opacity * 100) / 100 : 0,
      actual: pt.hitDot.visible ? Math.round(pt.hitDot.material.opacity * 100) / 100 : 0,
    };
  }

  /** A still of one pitch from its PitchResult, for screenshots: 'flight' is most of the way to the
      plate (the trail behind it), 'crossed' just after it (aimed against actual). */
  still(pr, when) {
    this.setPitch(fromResult(pr, this.facts.batter));
    const pt = this.pitch;
    this.pose(when === 'crossed' ? pt.tPlate + 0.35 : pt.tRel + 0.8 * (pt.tPlate - pt.tRel));
    this.render();
    this.dirty = true;
  }

  /** A pitch set up but not played (for check-fit.mjs, which poses it frame by frame itself):
      its end time. */
  prepare(pr) {
    this.setPitch(fromResult(pr, this.facts.batter));
    const pt = this.pitch, resultAt = pt.after ? pt.tRel + pt.after.t0 : pt.tCatch;
    this.dirty = true;
    return { tEnd: resultAt + 2.0, resultAt };
  }

  /** One pitch to the call. */
  async play(opts) {
    await this.ready;
    const pr = opts.pr, hooks = opts.hooks || {};
    // the preview is the aim, not the pitch: gone before the ball leaves the hand
    this.ghostSpec = null;
    if (this.ghost) this.ghost.hide();
    const play = fromResult(pr, this.facts.batter);
    this.setPitch(play);
    const pt = this.pitch, m = this.m;
    const speed = opts.quick ? 1.8 : 1;
    const resultAt = pt.after ? pt.tRel + pt.after.t0 : pt.tCatch;
    const inPlay = pr.result === 'in_play';
    // a ball in play: the broadcast of the plan (inplay.js) runs from contact, on its own clock
    // (slow motion and jump cuts), real seconds after contact to plan seconds through run.sceneAt
    const run = inPlay && this.inplay && pt.after ? this.inplay.begin(pr, pt, { hooks }) : null;
    // (knocked down by a pitch, he stays down for a beat)
    const tail = run ? run.realDur + 0.6 : inPlay ? 2.0 : pr.result === 'foul' ? 1.5 : pr.result === 'hit_by_pitch' ? (m.fall ? 2.6 : 1.5) : m.ump === 'strike' ? 1.3 : 0.9;
    const tEnd = resultAt + tail;
    const callAt = run ? resultAt + run.resolveReal : resultAt + 0.12;
    const sceneT = (t) => (run && t > resultAt ? resultAt + run.sceneAt(t - resultAt) : t);
    // the runners on the scorebar diamond: the 3D runners themselves after a ball in play, else the
    // clock the old drawing used (ms from the start)
    const track = run ? { running: true, at: (ms) => ({ runners: this.inplay.fieldAt(Math.max(0, sceneT(ms / 1000) - resultAt)) }) }
      : AN() && AN().runnerTrack ? AN().runnerTrack(pr, (resultAt + (inPlay ? 0.26 : 0.22)) * 1000, (inPlay ? 1150 : 700)) : null;
    if (hooks.sound) hooks.sound('whoosh', pt.tRel * 1000 / speed);
    // what the browser check reads back: the play's reading and a few frames of it
    const trace = this.trace = { n: pr.n, result: pr.result, bb: pr.inPlay ? pr.inPlay.bb : null, m: { ...m }, check: play.check, dirt: play.dirt,
      zn: pr.actual ? pr.actual.zn : null, drawn: pr.drawn ? pr.drawn.id : null, bats: this.facts.batter.bats, resultAt, tEnd, frames: 0, skipped: false, s: [] };
    const keep = (t) => { if (trace.s.length < 400) trace.s.push(this.sample(t)); };
    return new Promise((done) => {
      let start = null, lastT = -1, raf = 0, finished = false, popped = false, called = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        cancelAnimationFrame(raf);
        document.removeEventListener('pointerdown', skip, true);
        if (!called) { called = true; if (hooks.call) hooks.call(); }
        if (track && track.running && hooks.field) hooks.field(track.at(tEnd * 1000).runners);
        trace.skipped = lastT < tEnd;
        const te = sceneT(tEnd);
        if (run) this.inplay.skipTo(te - resultAt);
        this.pose(te);
        if (run) this.inplay.update(te - resultAt, this.camera);
        this.render();
        keep(te);
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
        if (!called && t >= callAt) { called = true; if (hooks.call) hooks.call(); }
        if (track && track.running && t >= resultAt && hooks.field) hooks.field(track.at(t * 1000).runners);
        const ts = sceneT(Math.min(t, tEnd));
        this.pose(ts);
        if (run && ts > resultAt) this.inplay.update(ts - resultAt, this.camera);
        if (!TEST() || trace.frames % (TEST().renderEvery || 1) === 0) this.render();
        trace.frames++;
        keep(ts);
        if (t >= tEnd) { finish(); return; }
        raf = requestAnimationFrame(tick);
      };
      document.addEventListener('pointerdown', skip, true);
      raf = requestAnimationFrame(tick);
    });
  }
}

/** The stage on this canvas (boot.js keeps the one the page made). */
export function create(canvas) { return new Stage(canvas); }
