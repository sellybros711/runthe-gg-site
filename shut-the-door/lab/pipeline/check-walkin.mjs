/* The next hitter walks up (3d/walkin.js): he walks into the picture, settles into his own stance, and
 * the pitch to him is exactly as without the walk.
 *
 *   node shut-the-door/lab/pipeline/check-walkin.mjs
 *
 * Plays the game's own 3D mound (3d/stage.js) in headless Chromium, without drawing, at 390x844 and
 * 1440x900, on every hitter of one pack (both hands), on the walk's own clock stepped 1/60 s:
 *   starts   a new hitter after a pitch walks up; the first hitter of an outing (no pitch yet) and
 *            the same hitter again do not
 *   length   it lasts DUR_MIN to DUR_MAX seconds
 *   enters   at its first frame his head, hips and feet are all off the canvas (he walks in, never
 *            appears in the picture)
 *   lands    at its end every bone, his place and facing and the bat are the set's own, value for value
 *            (the set posed again with the walk off)
 *   skate    while he walks, his planted foot (the lower one, within PLANT_M of the ground) moves over
 *            the ground under SKATE m/s, at its worst over the cruise
 *   smooth   no hand, foot, head or the bat's end moves more than JOLT m in a step of 1/60 s (a pop)
 *   skip     a tap on the canvas mid walk ends it there, in the set's pose exactly; a key the same
 *   pitch    a pitch played mid walk starts from the stance: its trace is the same pitch's from the
 *            plain set, value for value
 *   quiet    reduced motion: no walk
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const DUR_MIN = 1.8, DUR_MAX = 3.3, SKATE = 0.35, PLANT_M = 0.03, JOLT = 0.12;

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
  const r = await page.evaluate(async ({ scn, W, H, PLANT_M }) => {
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
      let prevPts = null, prevFeet = null, skate = 0, jolt = 0, joltAt = null;
      const dt = 1 / 60, w = Wk.w;
      for (let s = 0; s <= Wk.dur + 1e-9; s += dt) {
        Wk.clock = s; st.walkApply();
        const P = pts();
        if (prevPts) P.forEach((p, k) => { const d = p.distanceTo(prevPts[k]); if (d > jolt) { jolt = d; joltAt = Math.round(s * 100) / 100 + ' ' + k; } });
        prevPts = P;
        const feet = ['l', 'r'].map((x) => wp(B.bones['foot_' + x]));
        const lo = feet[0].y < feet[1].y ? 0 : 1, ground = w.set.ankle;
        const loP = prevFeet ? (prevFeet[0].y < prevFeet[1].y ? 0 : 1) : -1;
        if (prevFeet && lo === loP && s < w.tCruise && feet[lo].y - ground < PLANT_M && prevFeet[lo].y - ground < PLANT_M) { const v = Math.hypot(feet[lo].x - prevFeet[lo].x, feet[lo].z - prevFeet[lo].z) / dt; if (v > skate) { skate = v; o.skAt = Math.round(s * 1000) / 1000 + ' ' + lo; } }
        prevFeet = feet;
      }
      Wk.clock = Wk.dur; st.walkApply();
      o.lands = diff(dump(), set);
      o.skate = skate; o.jolt = jolt; o.joltAt = joltAt;
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
    window.STD_CHECK_UP = (b, prev) => !walkOf(b, prev);
    return res;
  }, { scn, W, H, PLANT_M });
  // reduced motion: no walk
  await page.emulateMedia({ reducedMotion: 'reduce' });
  r.quiet = await page.evaluate(({ scn }) => { window.STD_STAGE_TEST = { step: 1 / 60, renderEvery: 1, walk: true }; return window.STD_CHECK_UP(scn.batters[0], scn.batters[1]); }, { scn });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const hs = r.hitters, tag = `${W}x${H}`;
  const worst = (k) => hs.reduce((m, o) => (o[k] > m[k] ? o : m), hs[0]);
  ok(hs.every((o) => o.started), `${tag} starts: each of the ${hs.length} hitters walks up after a pitch`);
  ok(r.noFirst && r.noSame, `${tag} starts: not the first hitter of an outing, not the same hitter again`);
  const dmin = Math.min(...hs.map((o) => o.dur)), dmax = Math.max(...hs.map((o) => o.dur));
  ok(dmin >= DUR_MIN && dmax <= DUR_MAX, `${tag} length: ${dmin.toFixed(2)} to ${dmax.toFixed(2)} s (held to ${DUR_MIN}-${DUR_MAX})`);
  ok(hs.every((o) => o.enters), `${tag} enters: off the canvas at the first frame` + (hs.some((o) => !o.enters) ? ` (in view: ${hs.filter((o) => !o.enters).map((o) => o.name).join(', ')})` : ''));
  ok(hs.every((o) => o.lands === 0 && o.endDiff === 0), `${tag} lands: the set's pose at the end, value for value (worst ${Math.max(...hs.map((o) => Math.max(o.lands, o.endDiff)))})`);
  const sk = worst('skate'), jo = worst('jolt');
  ok(sk.skate < SKATE, `${tag} skate: planted foot at most ${sk.skate.toFixed(3)} m/s over the ground (${sk.name}; held under ${SKATE})`);
  ok(jo.jolt < JOLT, `${tag} smooth: at most ${jo.jolt.toFixed(3)} m in a 1/60 s step (${jo.name} at ${jo.joltAt}; held under ${JOLT})`);
  ok(r.tap.ended && r.tap.skipped && r.tap.diff === 0 && r.key.ended && r.key.diff === 0, `${tag} skip: a tap and a key end it in the set's pose (${JSON.stringify([r.tap, r.key])})`);
  ok(r.pitch.same && r.pitch.walkOver && r.pitch.frames > 10, `${tag} pitch: a pitch thrown mid walk is the plain set's, frame for frame (${r.pitch.frames} frames)`);
  ok(r.quiet, `${tag} quiet: no walk under reduced motion`);
  ok(errors.length === 0, `${tag} no page error` + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
  await page.close();
}
await browser.close();
server.close();
console.log(fails ? `\n${fails} failed` : '\nall ok');
process.exit(fails ? 1 : 0);
