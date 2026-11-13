/* Life at the set (3d/idle.js): it runs while the pitch is aimed, and the pitch is exactly as without it.
 *
 *   node shut-the-door/lab/pipeline/check-idle.mjs
 *
 * Plays the game's own 3D mound (3d/stage.js) in headless Chromium, without drawing, on one pack's
 * first left and right handed hitter:
 *   runs     with the mound on screen, the stage's own loop (idleRun) moves the batter, his bat, the
 *            catcher and the umpire: each moves
 *   step     no two in step: on the life's own clock, stepped every 40 ms from 0 to 30 s, the closest
 *            two of the three correlate under 0.9 in every 3 s window (one starting each second), so
 *            the reading never depends on how fast the runner draws
 *   hush     with the meter up (stage.hush) the loop draws nothing
 *   planted  every foot stays on its spot (under 1 mm) and the bat stays in both hands (the top hand
 *            on the bat within 1 mm of where the set held it), on the stage's loop and over the 30 s
 *   exact    a pitch played from a set with the life on screen, against the same pitch with the life
 *            off: every bone of the three, the bat and the ball are the same, value for value, at
 *            every frame from the end of the ease (IDLE.OUT, at most half the time to the release)
 *            on, the release and the swing included; and the first frame starts where the set was
 *            drawn (it does move: the ease is there)
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

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
const browser = await loadPlaywright().chromium.launch({ executablePath: CHROME, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
await page.goto(BASE);
await page.waitForFunction(() => window.STD_STAGE && window.STD_STAGE.current && window.STD_STAGE.current.loaded, null, { timeout: 180000 });

let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'ok   ' : 'FAIL ') + msg); if (!cond) fails++; };
const scn = JSON.parse(fs.readFileSync(path.join(ROOT, 'shut-the-door', 'data', 'packs', packs[packs.length - 1]), 'utf8')).scenario;

const r = await page.evaluate(async ({ scn }) => {
  const st = window.STD_STAGE.current, C = window.STD_CONTRACT;
  const cv = st.canvas;
  // the draws are counted and skipped; the canvas reads as shown (the home screen hides it)
  // (a frame is one stage draw: the scene and his first person pass are two renderer calls)
  let draws = 0;
  st.renderer.render = () => {};
  const draw0 = st.render.bind(st);
  st.render = () => { draws++; draw0(); };
  Object.defineProperty(cv, 'clientWidth', { get: () => 390, configurable: true });
  Object.defineProperty(cv, 'clientHeight', { get: () => 844, configurable: true });
  st.setScenario(scn);
  const roles = ['batter', 'catcher', 'umpire'];
  const dump = () => {
    const out = [];
    for (const k of roles) { const p = st.people[k]; for (const [b] of p.bind) out.push(...b.position.toArray(), ...b.quaternion.toArray()); }
    const bat = st.people.batter.bat; out.push(...bat.position.toArray(), ...bat.quaternion.toArray());
    if (st.pitch && st.pitch.ball) out.push(...st.pitch.ball.position.toArray());
    return out;
  };
  const wp = (o) => { o.updateMatrixWorld(true); return o.getWorldPosition(new o.position.constructor()); };
  const frames = (ms) => new Promise((res) => { const t0 = performance.now(); const f = () => (performance.now() - t0 >= ms ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); });
  const res = [];
  for (const bats of ['L', 'R']) {
    const b = scn.batters.find((x) => x.bats === bats);
    if (!b) continue;
    const o = { name: b.name, bats };
    window.STD_STAGE_TEST = undefined;
    st.dirty = true;
    st.setBatter(b);
    // (a new hitter after a pitch walks up first, stage.js walkStart; this is the life at the set, so the
    // walk is skipped to his stance, as a tap does. check-walkin.mjs holds the walk itself)
    st.walkEnd();
    st.draw();
    // the set as posed, then the life over it for 3 s of the stage's own loop
    st.idleLift();
    const P = st.people, B = P.batter;
    const feet0 = roles.flatMap((k) => ['l', 'r'].map((s) => wp(P[k].bones['foot_' + s])));
    const bat0 = B.bat.matrixWorld.clone(), inv0 = bat0.clone().invert();
    const top0 = wp(B.bones.hand_r).applyMatrix4(inv0);
    const series = { batter: [], bat: [], catcher: [], umpire: [] };
    let footMax = 0, gripMax = 0;
    const d0 = draws, t0 = performance.now();
    st.idleRun();
    while (performance.now() - t0 < 3000) {
      await frames(40);
      series.batter.push(wp(B.bones.spine_03).x + wp(B.bones.pelvis).z);
      series.bat.push(new B.bat.position.constructor(0, 0.75, 0).applyMatrix4(B.bat.matrixWorld).y);
      series.catcher.push(wp(P.catcher.bones.pelvis).x + wp(P.catcher.bones.hand_l).y);
      series.umpire.push(wp(P.umpire.bones.pelvis).x + wp(P.umpire.bones.head).z);
      const feet = roles.flatMap((k) => ['l', 'r'].map((s) => wp(P[k].bones['foot_' + s])));
      feet.forEach((f, i) => { footMax = Math.max(footMax, f.distanceTo(feet0[i])); });
      const inv = B.bat.matrixWorld.clone().invert();
      gripMax = Math.max(gripMax, wp(B.bones.hand_r).applyMatrix4(inv).distanceTo(top0));
    }
    o.drawsPerS = (draws - d0) / ((performance.now() - t0) / 1000);
    const range = (a) => Math.max(...a) - Math.min(...a);
    o.moves = Object.fromEntries(Object.entries(series).map(([k, a]) => [k, range(a)]));
    const corr = (a, b) => { const n = Math.min(a.length, b.length), ma = a.reduce((s, x) => s + x, 0) / n, mb = b.reduce((s, x) => s + x, 0) / n; let ab = 0, aa = 0, bb = 0; for (let i = 0; i < n; i++) { ab += (a[i] - ma) * (b[i] - mb); aa += (a[i] - ma) ** 2; bb += (b[i] - mb) ** 2; } return Math.abs(ab / Math.sqrt(aa * bb || 1)); };
    // out of step, on the life's own clock (not the wall clock, so a slow runner reads the same): the
    // set's life stepped every 40 ms from 0 to 30 s, and the closest two of the three correlated over
    // every 3 s window, one starting each second; the worst window is the reading
    const I0 = st.idle, STEP = 0.04, SPAN = 30, WIN = 75, HOP = 25;
    const ds = { batter: [], catcher: [], umpire: [] };
    for (let i = 0; i <= Math.round(SPAN / STEP); i++) {
      I0.clock = i * STEP;
      st.idleApply();
      ds.batter.push(wp(B.bones.spine_03).x + wp(B.bones.pelvis).z);
      ds.catcher.push(wp(P.catcher.bones.pelvis).x + wp(P.catcher.bones.hand_l).y);
      ds.umpire.push(wp(P.umpire.bones.pelvis).x + wp(P.umpire.bones.head).z);
      // planted over the whole span too
      const feet = roles.flatMap((k) => ['l', 'r'].map((s) => wp(P[k].bones['foot_' + s])));
      feet.forEach((f, j) => { footMax = Math.max(footMax, f.distanceTo(feet0[j])); });
      const inv = B.bat.matrixWorld.clone().invert();
      gripMax = Math.max(gripMax, wp(B.bones.hand_r).applyMatrix4(inv).distanceTo(top0));
    }
    const close = (a, b, c) => Math.max(corr(a, b), corr(a, c), corr(b, c));
    o.windows = [];
    for (let s = 0; s + WIN <= ds.batter.length; s += HOP) {
      const w = (a) => a.slice(s, s + WIN);
      o.windows.push([s * STEP, close(w(ds.batter), w(ds.catcher), w(ds.umpire))]);
    }
    o.corr = Math.max(...o.windows.map((w) => w[1]));
    o.corrAt = o.windows.find((w) => w[1] === o.corr)[0];
    o.footMax = footMax; o.gripMax = gripMax;
    // hushed: nothing draws
    st.hush(true);
    const d1 = draws;
    await frames(500);
    o.hushDraws = draws - d1;
    st.hush(false);
    // the cost of one life step (restore the set, lay the life), JS only
    const I = st.idle, n = 200, c0 = I.clock, tA = performance.now();
    for (let i = 0; i < n; i++) { I.clock = c0 + i * 0.04; st.idleApply(); }
    o.stepMs = (performance.now() - tA) / n;
    // the pitch: a swing in play, against the same pitch with the life off
    const a = scn.pitcher.arsenal[0];
    const pr = { n: 1, call: { type: a.type, cell: 12 }, actual: { x: 0.1, zn: 0.4 }, actualCell: C.cellAt(0.1, 0.4), velo: a.velo, batter: 'swing', result: 'foul',
      inPlay: { bb: 'ground', ev: 92, la: 4, spray: -44, result: 'out', text: 'out' }, countBefore: { b: 0, s: 0 }, count: { b: 0, s: 1 }, outs: 0, bases: 0, runnerMoves: [], runs: 0, paOver: false };
    const run = async (life) => {
      window.STD_STAGE_IDLE = life ? undefined : false;
      st.lastN = 0;
      st.dirty = true; st.draw();
      if (life) { st.idle.clock = 2.7; st.render(); }
      const atSet = dump();
      window.STD_STAGE_TEST = { step: 1 / 30, renderEvery: 1, idle: true };
      const rows = [];
      const orig = st.sample.bind(st);
      st.sample = (t) => { rows.push([t, dump()]); return orig(t); };
      await st.play({ pr, hooks: {} });
      st.sample = orig;
      window.STD_STAGE_TEST = undefined;
      window.STD_STAGE_IDLE = undefined;
      return { atSet, rows, tRel: st.pitch.tRel };
    };
    const on = await run(true), off = await run(false);
    const out = Math.min(0.3, 0.5 * on.tRel);
    let same = 0, diff = 0, firstDiff = null, eased = 0, rel = false;
    const n2 = Math.min(on.rows.length, off.rows.length);
    for (let i = 0; i < n2; i++) {
      const [t, A] = on.rows[i], [t2, Bv] = off.rows[i];
      if (t !== t2) { firstDiff = firstDiff || 'clock ' + t + ' vs ' + t2; diff++; continue; }
      const eq = A.length === Bv.length && A.every((v, j) => v === Bv[j]);
      if (t >= out - 1e-9) { if (eq) same++; else { diff++; firstDiff = firstDiff || 't=' + t; } if (t >= on.tRel) rel = true; } else if (!eq) eased++;
    }
    const first = on.rows[0][1];
    o.startJump = Math.max(...first.slice(0, -3).map((v, j) => Math.abs(v - on.atSet[j])));
    o.exact = { same, diff, firstDiff, eased, rel, frames: n2, out, tRel: on.tRel };
    res.push(o);
  }
  return res;
}, { scn });

for (const o of r) {
  const tag = `${o.name} (${o.bats})`;
  ok(Object.values(o.moves).every((m) => m > 0.002) && o.drawsPerS > 5, `${tag} runs: the batter ${(o.moves.batter * 1000).toFixed(1)} mm, the bat's end ${(o.moves.bat * 1000).toFixed(1)} mm, the catcher ${(o.moves.catcher * 1000).toFixed(1)} mm, the umpire ${(o.moves.umpire * 1000).toFixed(1)} mm, ${o.drawsPerS.toFixed(1)} draws a second`);
  ok(o.drawsPerS <= 26, `${tag} capped: ${o.drawsPerS.toFixed(1)} draws a second (at most 25)`);
  ok(o.windows.length >= 28 && o.corr < 0.9, `${tag} out of step: over ${o.windows.length} windows of 3 s on the life's clock (0 to 30 s), the closest two correlate at most ${o.corr.toFixed(2)} (the window from ${o.corrAt.toFixed(0)} s)`);
  console.log('     windows ' + o.windows.filter((w) => [0, 3, 6, 10, 20, 27].includes(Math.round(w[0]))).map((w) => `${w[0].toFixed(0)}s ${w[1].toFixed(2)}`).join(', '));
  ok(o.hushDraws === 0, `${tag} hush: ${o.hushDraws} draws with the meter up`);
  ok(o.footMax < 0.001 && o.gripMax < 0.001, `${tag} planted: feet ${(o.footMax * 1000).toFixed(2)} mm, top hand on the bat ${(o.gripMax * 1000).toFixed(2)} mm`);
  const e = o.exact;
  ok(e.diff === 0 && e.same > 20 && e.rel && e.eased > 0, `${tag} exact: ${e.same} frames from ${e.out.toFixed(2)} s on identical to the pitch without it (release at ${e.tRel.toFixed(2)} s), ${e.diff} differ${e.firstDiff ? ' (first ' + e.firstDiff + ')' : ''}, ${e.eased} eased before`);
  ok(o.startJump < 0.05, `${tag} the pitch starts where the set was drawn: largest change on its first frame ${o.startJump.toFixed(4)}`);
  console.log(`     one life step ${o.stepMs.toFixed(2)} ms (JS, this machine)`);
}
if (errors.length) { console.log('page errors: ' + errors.join(' | ')); fails++; }
console.log(fails ? `check-idle: ${fails} FAILED` : 'check-idle: ok');
await browser.close();
server.close();
process.exit(fails ? 1 : 0);
