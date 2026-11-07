/* The change of hitter (3d/walkin.js): the next hitter walks into the picture and settles into his own
 * stance, after a strikeout the last one walks out of it first, and the pitch is exactly as without them.
 *
 *   node shut-the-door/lab/pipeline/check-walkin.mjs
 *
 * Plays the game's own 3D mound (3d/stage.js) in headless Chromium, without drawing, at 390x844 and
 * 1440x900, on every hitter of one pack (both hands), on the walk's own clock stepped 1/60 s:
 *   starts   a new hitter after a pitch walks up; the first hitter of an outing (no pitch yet) and
 *            the same hitter again do not
 *   length   it lasts DUR_MIN to DUR_MAX seconds (a walk in alone; on a phone the frame is tight, so he
 *            comes into it close to the box)
 *   enters   at its first frame his head, hips and feet are all off the canvas (he walks in, never
 *            appears in the picture)
 *   lands    at its end every bone, his place and facing and the bat are the set's own, value for value
 *            (the set posed again with the walk off)
 *   skate    while he walks, a planted foot (within PLANT_M of the ground for PLANT_N frames running)
 *            moves over the ground under SKATE m/s, away from its touch down and push off
 *   smooth   no hand, foot, head or the bat's end moves more than JOLT m in a step of 1/60 s (a pop)
 *   bat      on every frame of every walk in and walk off (a right and a left handed hitter at each size):
 *            the bat's handle stays in his bottom hand (its distance from the hand within HANDLE_M of the
 *            stance's); it never points at the plate, ahead of him or out to his side (within LEVEL_DEG of
 *            level, its barrel must point back of him); carried in one hand (his hands GRIP_OFF apart, the
 *            two handed weight it is laid with under 0.05) its barrel is within DOWN_DEG of straight down; and it turns at
 *            most ROT_DEG in a step of 1/60 s (a snap fails)
 *   clear    the bat's barrel stays CLEAR_M from the centre of his head (a helmet's half width, the
 *            barrel's radius and a margin): it turns into his grip behind his head, never through his helmet
 *   skip     a tap on the canvas mid walk ends it there, in the set's pose exactly; a key the same
 *   pitch    a pitch played mid walk starts from the stance: its trace is the same pitch's from the
 *            plain set, value for value
 *   walk out after a strikeout (a right and a left handed hitter striking out): the ghost takes his pose
 *            exactly, walks out of the frame and goes; nothing on him moves more than JOLT in a step;
 *            the two hitters keep SEP_M apart (pelvis to pelvis: their arms never meet); all of it,
 *            out and in, is over in TOTAL_MAX seconds and ends in the next hitter's set exactly
 *   quiet    reduced motion: no walk
 *   body     the skin, the collar, the spine, neck and shoulder joints, the shoulders' width and the
 *            pelvis' tilt held to check-deform's own limits (its probe, deform-probe.js) through the
 *            whole walk, at 390x844, a right and a left handed hitter
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const PLANT_N = 10, PLANT_EDGE = 3, SEP_M = 0.7, HANDLE_M = 0.03, LEVEL_DEG = 25, DOWN_DEG = 55, ROT_DEG = 8, TOTAL_MAX = 3.5, CLEAR_M = 0.18, DUR_MIN = 1.2, DUR_MAX = 3.3, SKATE = 0.35, PLANT_M = 0.03, JOLT = 0.12;

function loadPlaywright() {
  for (const t of ['playwright', '/opt/node-tools/node_modules/playwright', '/opt/node22/lib/node_modules/playwright']) { try { return require(t); } catch (e) { /* next */ } }
  throw new Error('playwright not found');
}
const CHROME = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium'].find((p) => fs.existsSync(p));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary' };
const server = http.createServer((req, res) => {
  let rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  const f = path.join(ROOT, rel);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}/shut-the-door/`;

const packs = fs.readdirSync(path.join(ROOT, 'shut-the-door', 'data', 'packs')).filter((f) => f.endsWith('.json')).sort();
const scn = JSON.parse(fs.readFileSync(path.join(ROOT, 'shut-the-door', 'data', 'packs', packs[packs.length - 1]), 'utf8')).scenario;
const browser = await loadPlaywright().chromium.launch({ executablePath: CHROME, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] });

let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'ok   ' : 'FAIL ') + msg); if (!cond) fails++; };

for (const [W, H] of [[390, 844], [1440, 900]]) {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text().slice(0, 300)); });
  await page.goto(BASE);
  await page.waitForFunction(() => window.STD_STAGE && window.STD_STAGE.current && window.STD_STAGE.current.loaded, null, { timeout: 180000 });
  await page.evaluate(() => window.STD_STAGE.current.inplay.motion);
  await page.waitForFunction(() => { const s = window.STD_STAGE.current; return s.walkClips && s.ghost3d; }, null, { timeout: 180000 });
  const r = await page.evaluate(async ({ scn, W, H, PLANT_M, LEVEL_DEG, PLANT_N, PLANT_EDGE }) => {
    const st = window.STD_STAGE.current, C = window.STD_CONTRACT;
    const cv = st.canvas;
    // the draws skipped; the canvas reads as shown at the page's size (the home screen hides it)
    st.renderer.render = () => {};
    Object.defineProperty(cv, 'clientWidth', { get: () => W, configurable: true });
    Object.defineProperty(cv, 'clientHeight', { get: () => H, configurable: true });
    window.STD_STAGE_TEST = { step: 1 / 60, renderEvery: 1, walk: true };
    st.setScenario(scn);
    st.layout();
    const V = st.camera.position.constructor;
    const wp = (o) => { o.updateMatrixWorld(true); return o.getWorldPosition(new V()); };
    const dump = () => {
      const B = st.people.batter, out = [];
      for (const [b] of B.bind) out.push(...b.position.toArray(), ...b.quaternion.toArray());
      out.push(...B.root.position.toArray(), ...B.root.quaternion.toArray(), ...B.bat.position.toArray(), ...B.bat.quaternion.toArray());
      return out;
    };
    const diff = (a, b) => (a.length !== b.length ? Infinity : Math.max(0, ...a.map((x, i) => Math.abs(x - b[i]))));
    // the hitter b up after prev, with the walk (walk true: its loop stopped, the test steps its clock) or
    // without it (the set as it would be with no walk at all: the same calls in the same order)
    const upAfter = (b, prev, walk) => {
      st.pitched = false; st.walkEnd(); st.batterId = null; st.setBatter(prev);
      st.pitched = walk; st.setBatter(b); st.draw();
      if (st.walk && st.walk.raf) { cancelAnimationFrame(st.walk.raf); st.walk.raf = 0; }
      return st.walk;
    };
    const setOf = (b, prev) => { upAfter(b, prev, false); return dump(); };
    const walkOf = (b, prev) => upAfter(b, prev, true);
    // the bat on one frame against its rules (bat above); m: the running worst, set: the stance's handle gap
    const WI = await import('./3d/walkin.js?v=1');
    const batTrack = (P, w, s, m) => {
      const bat = P.bat, hand = P.bones['hand_' + (P.bottom || 'l')], top = P.bones['hand_' + ((P.bottom || 'l') === 'l' ? 'r' : 'l')];
      bat.updateMatrixWorld(true);
      const handle = new V(0, 0.055, 0).applyMatrix4(bat.matrixWorld), hp = hand.getWorldPosition(new V());
      const gapH = handle.distanceTo(hp);
      if (m.handle0 == null) m.handle0 = gapH;
      m.handle = Math.max(m.handle || 0, Math.abs(gapH - m.handle0));
      const q = bat.getWorldQuaternion(new bat.quaternion.constructor()), b = new V(0, 1, 0).applyQuaternion(q);
      const left = P.bones.thigh_l.getWorldPosition(new V()).sub(P.bones.thigh_r.getWorldPosition(new V())).setY(0).normalize();
      const fwd = new V().crossVectors(left, new V(0, 1, 0)).normalize();
      const level = Math.asin(Math.abs(b.y)) * 180 / Math.PI, h = b.clone().setY(0).normalize();
      if (level < LEVEL_DEG && h.dot(fwd) > -0.3) { m.bad = (m.bad || 0) + 1; if (!m.badAt) m.badAt = Math.round(s * 100) / 100; }
      const hold = w.batK ?? WI.holdWeight(w, s), gap = hp.distanceTo(top.getWorldPosition(new V()));
      if (hold < 0.05 && gap > 0.3) { const down = Math.acos(Math.max(-1, Math.min(1, -b.y))) * 180 / Math.PI; if (down > (m.down || 0)) { m.down = down; m.downAt = Math.round(s * 100) / 100; } }
      if (m.q) { const r = m.q.angleTo(q) * 180 / Math.PI; if (r > (m.rot || 0)) { m.rot = r; m.rotAt = Math.round(s * 100) / 100; } }
      m.q = q;
    };
    const onCanvas = (p) => { const v = p.clone().project(st.cam0); return v.z < 1 && Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1; };
    const res = { hitters: [] };
    const bs = scn.batters;
    for (let i = 0; i < bs.length; i++) {
      const b = bs[i], prev = bs[(i + bs.length - 1) % bs.length];
      const o = { name: b.name, bats: b.bats };
      const set = setOf(b, prev);
      const Wk = walkOf(b, prev);
      o.started = !!Wk;
      if (!Wk) { res.hitters.push(o); continue; }
      const B = st.people.batter;
      Wk.clock = 0; st.walkApply();
      o.dur = Wk.dur;
      o.enters = ['head', 'pelvis', 'foot_l', 'foot_r'].every((k) => !onCanvas(wp(B.bones[k])));
      const pts = () => [...['hand_l', 'hand_r', 'foot_l', 'foot_r', 'head'].map((k) => wp(B.bones[k])), new V(0, 0.84, 0).applyMatrix4(B.bat.matrixWorld)];
      const series = [];
      let prevPts = null, prevFeet = null, skate = 0, jolt = 0, joltAt = null, near = Infinity, nearAt = null;
      // the barrel (from 0.3 m up the bat to its end) to the centre of his head
      const headGap = () => {
        const h = wp(B.bones.head), a = new V(0, 0.3, 0).applyMatrix4(B.bat.matrixWorld), e = new V(0, 0.86, 0).applyMatrix4(B.bat.matrixWorld);
        const ab = e.clone().sub(a), t = Math.max(0, Math.min(1, h.clone().sub(a).dot(ab) / ab.lengthSq()));
        return a.addScaledVector(ab, t).distanceTo(h);
      };
      st.walkLift();
      const gapSet = headGap();
      const dt = 1 / 60, w = Wk.in;
      o.bat = {};
      for (let s = 0; s <= Wk.dur + 1e-9; s += dt) {
        Wk.clock = s; st.walkApply();
        if (s < Wk.dur) batTrack(B, w, s, o.bat);
        const P = pts();
        if (prevPts) P.forEach((p, k) => { const d = p.distanceTo(prevPts[k]); if (d > jolt) { jolt = d; joltAt = Math.round(s * 100) / 100 + ' ' + k; } });
        prevPts = P;
        const feet = ['l', 'r'].map((x) => wp(B.bones['foot_' + x]));
        if (s < Wk.dur - 0.5) series.push({ s, feet });
        prevFeet = feet;
        const g = headGap();
        if (g < near) { near = g; nearAt = Math.round(s * 100) / 100; }
      }
      // a planted foot: one within PLANT_M of the ground (the set's ankle) for at least PLANT_N frames in
      // a row; its speed over the ground in the middle of that (PLANT_EDGE frames in from each end: the
      // heel's touch down and the toe's push off roll the foot, they do not slide it)
      for (const k of [0, 1]) {
        let run = [];
        const flush = () => {
          if (run.length >= PLANT_N) for (let j = PLANT_EDGE + 1; j < run.length - PLANT_EDGE; j++) {
            const a = run[j - 1].feet[k], b = run[j].feet[k], v = Math.hypot(b.x - a.x, b.z - a.z) / dt;
            if (v > skate) { skate = v; o.skAt = Math.round(run[j].s * 1000) / 1000 + ' ' + k; }
          }
          run = [];
        };
        for (const f of series) { if (f.feet[k].y - Wk.in.set.ankle < PLANT_M) run.push(f); else flush(); }
        flush();
      }
      // (the cost of a frame's pose, JS only: reported, not judged)
      const c0 = performance.now();
      for (let j = 0; j < 60; j++) { Wk.clock = (j / 60) * Wk.dur; st.walkApply(); }
      o.layMs = (performance.now() - c0) / 60;
      Wk.clock = Wk.dur; st.walkApply();
      o.lands = diff(dump(), set);
      o.skate = skate; o.jolt = jolt; o.joltAt = joltAt; o.near = near; o.nearAt = nearAt; o.gapSet = gapSet;
      st.walkEnd();
      o.endDiff = diff(dump(), set);
      res.hitters.push(o);
    }
    // the first hitter of an outing (nothing pitched yet) and the same hitter again: no walk
    st.pitched = false; st.walkEnd(); st.batterId = null; st.setBatter(bs[1]);
    res.noFirst = !st.walk;
    st.pitched = true; st.setBatter(bs[1]);
    res.noSame = !st.walk;
    // a tap mid walk, then a key
    const b0 = bs[0], set0 = setOf(b0, bs[1]);
    for (const how of ['tap', 'key']) {
      const Wk = walkOf(b0, bs[1]);
      Wk.clock = 0; st.walkApply();
      Wk.clock = Wk.dur * 0.5; st.walkApply();
      if (how === 'tap') cv.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      else document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
      res[how] = { ended: !st.walk, skipped: !!(st.walked && st.walked.skipped), diff: diff(dump(), set0) };
    }
    // a pitch played mid walk against the same pitch from the plain set
    const a = scn.pitcher.arsenal[0];
    const pr = { n: 1, call: { type: a.type, cell: 12 }, actual: { x: 0.1, zn: 0.5 }, actualCell: C.cellAt(0.1, 0.5), velo: a.velo, batter: 'swing', result: 'swinging_strike',
      inPlay: null, countBefore: { b: 0, s: 0 }, count: { b: 0, s: 1 }, outs: 0, bases: 0, runnerMoves: [], runs: 0, paOver: false };
    window.STD_STAGE_TEST = { step: 1 / 30, renderEvery: 1 };
    setOf(b0, bs[1]); st.idle && (st.idle.on = false);
    await st.play({ pr, quick: true });
    const plain = st.trace.s;
    window.STD_STAGE_TEST = { step: 1 / 30, renderEvery: 1, walk: true };
    const Wk = walkOf(b0, bs[1]);
    Wk.clock = 0; st.walkApply();
    Wk.clock = Wk.dur * 0.4; st.walkApply();
    window.STD_STAGE_TEST = { step: 1 / 30, renderEvery: 1 };
    st.idle && (st.idle.on = false);
    await st.play({ pr, quick: true });
    const mid = st.trace.s;
    res.pitch = { frames: plain.length, same: JSON.stringify(plain) === JSON.stringify(mid), walkOver: !st.walk };
    // a strikeout ends the at bat: the hitter walks out (the ghost) and the next one walks in; for a
    // right and a left handed hitter striking out, each followed by the next in the order
    res.outs = [];
    for (const hand of ['R', 'L']) {
      window.STD_STAGE_TEST = { step: 1 / 30, renderEvery: 1 };
      const ai = bs.findIndex((x) => x.bats === hand), A = bs[ai], Bn = bs[(ai + 1) % bs.length], prevA = bs[(ai + bs.length - 1) % bs.length];
      setOf(A, prevA);
      st.ghostFor = null; st.ghostDress();
      await new Promise((r) => { const f = () => (st.ghostFor === A.id ? r() : setTimeout(f, 50)); f(); });
      const k = { n: 2, call: { type: scn.pitcher.arsenal[0].type, cell: 22 }, actual: { x: 0.1, zn: -0.05 }, actualCell: C.cellAt(0.1, -0.05), velo: scn.pitcher.arsenal[0].velo, batter: 'swing', result: 'swinging_strike',
        inPlay: null, countBefore: { b: 0, s: 2 }, count: { b: 0, s: 3 }, outs: 1, bases: 0, runnerMoves: [], runs: 0, paOver: true };
      await st.play({ pr: k, quick: true });
      window.STD_STAGE_TEST = { step: 1 / 60, renderEvery: 1, walk: true };
      const G = st.ghost3d.batter, B = st.people.batter;
      // the swap: the ghost takes his pose exactly, before anything moves
      const before = B.bind.map(([b]) => b.getWorldPosition(new V()));
      st.setBatter(Bn); st.draw();
      const Wk = st.walk; const out = { name: A.name, next: Bn.name, hand, started: !!(Wk && Wk.out) };
      if (Wk) { cancelAnimationFrame(Wk.raf); Wk.raf = 0; }
      if (out.started) {
        Wk.clock = 0; st.walkApply();
        const gb = G.bind.map(([b]) => b.getWorldPosition(new V()));
        out.swap = Math.max(...gb.map((v, i) => v.distanceTo(before[i])));
        out.shown = G.root.visible;
        let prev = null, jolt = 0, joltAt = null, sep = Infinity;
        out.bat = {}; out.batIn = {};
        for (let s = 0; s <= Wk.dur + 1e-9; s += 1 / 60) {
          Wk.clock = s; st.walkApply();
          const P = [...['hand_l', 'hand_r', 'foot_l', 'foot_r', 'head'].map((x) => G.bones[x].getWorldPosition(new V())), new V(0, 0.84, 0).applyMatrix4(G.bat.matrixWorld)];
          if (prev && G.root.visible) P.forEach((p, i) => { const d = p.distanceTo(prev[i]); if (d > jolt) { jolt = d; joltAt = Math.round(s * 100) / 100 + ' ' + i; } });
          prev = P;
          if (G.root.visible && s < Wk.out.dur) {
            batTrack(G, Wk.out, s, out.bat);
            const a = G.bones.pelvis.getWorldPosition(new V()).setY(0), c = B.bones.pelvis.getWorldPosition(new V()).setY(0);
            sep = Math.min(sep, a.distanceTo(c));
          }
          if (Wk.in && s < Wk.dur) batTrack(B, Wk.in, Math.max(0, s - Wk.inAt), out.batIn);
        }
        out.jolt = jolt; out.joltAt = joltAt; out.dur = Wk.dur; out.outDur = Wk.out.dur; out.leaves = !!Wk.out.leaves; out.sep = sep;
        Wk.clock = Wk.dur; st.walkApply();
        st.walkEnd();
        out.hidden = !G.root.visible;
        out.total = st.walked.dur;
        out.endDiff = diff(dump(), setOf(Bn, A));
      }
      res.outs.push(out);
    }
    window.STD_CHECK_UP = (b, prev) => !walkOf(b, prev);
    return res;
  }, { scn, W, H, PLANT_M, LEVEL_DEG, PLANT_N, PLANT_EDGE });
  // reduced motion: no walk
  await page.emulateMedia({ reducedMotion: 'reduce' });
  r.quiet = await page.evaluate(({ scn }) => { window.STD_STAGE_TEST = { step: 1 / 60, renderEvery: 1, walk: true }; return window.STD_CHECK_UP(scn.batters[0], scn.batters[1]); }, { scn });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  if (W === 390) {
    // the body through the walk, on check-deform's probe and limits (LIM there: stretch 1.6, squash
    // 0.6, the hinges 2.5 and 0.15, the collar 2 cm, the joints 2% over their limit, the shoulders'
    // width 8%, the pelvis' tilt 12 degrees; the skate and travel limits are a stance's, not a walk's)
    await page.evaluate(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'deform-probe.js'), 'utf8'));
    for (const bats of ['R', 'L']) {
      const d = await page.evaluate(async ({ scn, bats }) => {
        const st = window.STD_STAGE.current, T = await import('three');
        window.STD_STAGE_TEST = { step: 1 / 60, renderEvery: 1, walk: true };
        const i = scn.batters.findIndex((x) => x.bats === bats), b = scn.batters[i], prev = scn.batters[(i + 1) % scn.batters.length];
        st.pitched = false; st.walkEnd(); st.batterId = null; st.setBatter(prev); st.pitched = true; st.setBatter(b); st.draw();
        const Wk = st.walk; cancelAnimationFrame(Wk.raf); Wk.raf = 0;
        Wk.clock = 0; st.walkApply();
        window.__lab = { THREE: T, people: { batter: st.people.batter }, poseAt: (t) => { Wk.clock = t; st.walkApply(); } };
        const r = window.__deformProbe({ people: ['batter'], t0: 0, t1: Wk.dur - 1e-3, dt: 1 / 30, series: false });
        st.walkEnd();
        return { name: b.name, w: r.batter.worst, k: r.batter.kin };
      }, { scn, bats });
      const w = d.w, k = d.k, bad = [];
      if (w.stretch.v > 1.6) bad.push('stretch ' + w.stretch.v.toFixed(2) + ' ' + w.stretch.bone);
      if (w.squash.v < 0.6) bad.push('squash ' + w.squash.v.toFixed(2) + ' ' + w.squash.bone);
      if (w.creaseStretch.v > 2.5) bad.push('crease stretch ' + w.creaseStretch.v.toFixed(2));
      if (w.creaseSquash.v < 0.15) bad.push('crease squash ' + w.creaseSquash.v.toFixed(2));
      if (w.collar.v > 0.02) bad.push('collar ' + w.collar.v.toFixed(3));
      if (w.joint.v > 1.02) bad.push('joint ' + w.joint.bone + ' ' + (w.joint.v * 100).toFixed(0) + '%');
      if (1 - k.width.lo.v > 0.08 || k.width.hi.v - 1 > 0.08) bad.push('shoulder width ' + k.width.lo.v.toFixed(3) + '-' + k.width.hi.v.toFixed(3));
      if (k.pelvis.tilt.v > 12) bad.push('pelvis tilt ' + k.pelvis.tilt.v.toFixed(1));
      ok(!bad.length, `${W}x${H} body: ${d.name} (${bats}) stretch ${w.stretch.v.toFixed(2)}, squash ${w.squash.v.toFixed(2)}, joints ${(w.joint.v * 100).toFixed(0)}% (${w.joint.bone}), collar ${(w.collar.v * 100).toFixed(1)} cm, pelvis tilt ${k.pelvis.tilt.v.toFixed(1)}` + (bad.length ? ': ' + bad.join(', ') : ''));
    }
  }
  const hs = r.hitters, tag = `${W}x${H}`;
  const worst = (k) => hs.reduce((m, o) => (o[k] > m[k] ? o : m), hs[0]);
  ok(hs.every((o) => o.started), `${tag} starts: each of the ${hs.length} hitters walks up after a pitch`);
  ok(r.noFirst && r.noSame, `${tag} starts: not the first hitter of an outing, not the same hitter again`);
  const dmin = Math.min(...hs.map((o) => o.dur)), dmax = Math.max(...hs.map((o) => o.dur));
  ok(dmin >= DUR_MIN && dmax <= DUR_MAX, `${tag} length: ${dmin.toFixed(2)} to ${dmax.toFixed(2)} s (held to ${DUR_MIN}-${DUR_MAX})`);
  ok(hs.every((o) => o.enters), `${tag} enters: off the canvas at the first frame` + (hs.some((o) => !o.enters) ? ` (in view: ${hs.filter((o) => !o.enters).map((o) => o.name).join(', ')})` : ''));
  ok(hs.every((o) => o.lands === 0 && o.endDiff === 0), `${tag} lands: the set's pose at the end, value for value (worst ${Math.max(...hs.map((o) => Math.max(o.lands, o.endDiff)))})`);
  const sk = worst('skate'), jo = worst('jolt');
  ok(sk.skate < SKATE, `${tag} skate: planted foot at most ${sk.skate.toFixed(3)} m/s over the ground (${sk.name} at ${sk.skAt}; held under ${SKATE})`);
  ok(jo.jolt < JOLT, `${tag} smooth: at most ${jo.jolt.toFixed(3)} m in a 1/60 s step (${jo.name} at ${jo.joltAt}; held under ${JOLT})`);
  const cl = hs.reduce((m, o) => (o.near < m.near ? o : m), hs[0]);
  ok(hs.every((o) => o.near >= CLEAR_M), `${tag} clear: the barrel at least ${cl.near.toFixed(3)} m from his head's centre (${cl.name} at ${cl.nearAt} s; his stance ${cl.gapSet.toFixed(3)}; held to ${CLEAR_M})`);
  ok(r.tap.ended && r.tap.skipped && r.tap.diff === 0 && r.key.ended && r.key.diff === 0, `${tag} skip: a tap and a key end it in the set's pose (${JSON.stringify([r.tap, r.key])})`);
  ok(r.pitch.same && r.pitch.walkOver && r.pitch.frames > 10, `${tag} pitch: a pitch thrown mid walk is the plain set's, frame for frame (${r.pitch.frames} frames)`);
  console.log(`     ${tag} cost: the walk's pose ${(hs.reduce((a, o) => a + o.layMs, 0) / hs.length).toFixed(2)} ms of JS a frame here (reported only)`);
  const batOk = (m) => m.handle <= HANDLE_M && !m.bad && (m.down || 0) <= DOWN_DEG && (m.rot || 0) <= ROT_DEG;
  const batSay = (m) => `handle ${(m.handle * 100).toFixed(1)} cm, ${m.bad || 0} frames level ahead or aside${m.badAt != null ? ' (first at ' + m.badAt + ' s)' : ''}, carried ${(m.down || 0).toFixed(0)} deg off down${m.downAt != null ? ' at ' + m.downAt + ' s' : ''}, turn ${(m.rot || 0).toFixed(1)} deg a step at ${m.rotAt} s`;
  for (const hand of ['R', 'L']) {
    const hh = hs.filter((o) => o.bats === hand);
    const worst = hh.reduce((m, o) => (!batOk(o.bat) || (o.bat.rot || 0) > (m.bat.rot || 0) ? o : m), hh[0]);
    ok(hh.every((o) => batOk(o.bat)), `${tag} bat, walk in (${hand}, ${hh.length} hitters): worst ${worst.name}: ${batSay(worst.bat)}`);
  }
  for (const O of r.outs) {
    const who = `${O.name} (${O.hand}) then ${O.next}`;
    ok(O.started && O.shown && O.swap < 1e-6, `${tag} walk out: ${who}: after a strikeout he walks out on the ghost, taking his pose exactly (${O.swap})`);
    ok(O.started && O.leaves && O.hidden, `${tag} walk out: ${who}: out of the frame in ${O.outDur && O.outDur.toFixed(2)} s, then the ghost goes`);
    ok(O.started && O.jolt < JOLT, `${tag} walk out: ${who}: at most ${O.jolt && O.jolt.toFixed(3)} m in a 1/60 s step (at ${O.joltAt}; held under ${JOLT})`);
    ok(O.started && O.sep >= SEP_M, `${tag} walk out: ${who}: the two hitters at least ${O.sep && O.sep.toFixed(2)} m apart (held to ${SEP_M})`);
    ok(O.started && batOk(O.bat), `${tag} bat, walk out: ${who}: ${O.bat ? batSay(O.bat) : ''}`);
    ok(O.started && batOk(O.batIn), `${tag} bat, walk in after it: ${who}: ${O.batIn ? batSay(O.batIn) : ''}`);
    ok(O.started && O.total <= TOTAL_MAX, `${tag} walk out and in: ${who}: ${O.total && O.total.toFixed(2)} s in all (held to ${TOTAL_MAX})`);
    ok(O.started && O.endDiff === 0, `${tag} walk out and in: ${who}: the set's pose at the end, value for value (${O.endDiff})`);
  }
  ok(r.quiet, `${tag} quiet: no walk under reduced motion`);
  ok(errors.length === 0, `${tag} no page error` + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
  await page.close();
}
await browser.close();
server.close();
console.log(fails ? `\n${fails} failed` : '\nall ok');
process.exit(fails ? 1 : 0);
