/* Every pitch flies one smooth arc: no turn that comes back, no kink, from his hand to the plate.
 *
 *   node shut-the-door/lab/pipeline/check-pitch-path.mjs            every pack, every pitch, both hitters' sides, two screens
 *   node shut-the-door/lab/pipeline/check-pitch-path.mjs --show N   print N failures in full
 *   node shut-the-door/lab/pipeline/check-pitch-path.mjs --list     every pitch's numbers
 *
 * The owner (2026-10-30): "It looks like it takes unrealistic turns and sometimes even zig zags
 * aggressively." The flight itself was always a constant acceleration (pitch.js flight); the zig zag
 * was the first person lens drawing the ball from his hand onto a path that came in from off the
 * screen, overshooting it and coming back. Now the flight starts under his hand (firstperson.js
 * lensFor, THE START) and the ball is drawn on it, with only his head's own move carried near his hand
 * (lens.carry, nothing at the plate).
 *
 * The game is loaded as a phone (390x844) and as a desktop (1440x900), the mound full screen. For every
 * pack, every arsenal pitch, a right and a left handed hitter (the camera frames his side), and 18
 * crossings (9 cells, each on its centre and missed by a few inches), the pitch is set up the way the
 * game sets it up (stage.js setPitch) and played frame by frame at 60 a second, release to plate:
 *
 *   side    the side view (the flight in the world, pointAt): a constant acceleration, its second
 *           difference the same every frame (CONST_FT), so its height and its run each bend one way
 *   view    his view held still at release (the flight through the camera at the release frame, his
 *           head's later move taken out): the turn from one frame's step to the next never changes
 *           side (over TURN_DEG, smaller turns are a straight line's rounding; a step under STEP_PX is
 *           a ball all but still, its direction the pixel's rounding), and no kink: no frame where its
 *           step changes by KINK_PX and KINK_X times its neighbours' change (a curve's own change,
 *           at an apex or as a ball going away slows on the screen, is smooth)
 *   drawn   the ball the game draws (its position after stage.pose) is its flight plus the lens's carry,
 *           within DRAWN_FT; the carry is his head's own move since release (the camera's), the share
 *           1 - tt / T of it, and nothing at the plate
 *   hand    the ball leaves from his hand: at release it is on his hand on the screen, within HAND_PX
 *   size    the ball on the screen never grows (its drawn size in px, within SIZE_PX)
 *   plate   it crosses the front of the plate on the engine's point (within PLATE_IN), at his time:
 *           the flight time from his own release at his own speed (within TIME_S), and with his
 *           break: the spin's push is 2 pfx / T^2 in each axis and gravity, exactly
 *
 * Any failure prints the pack, the pitch, the hitter's side and the crossing, and the exit code is 1.
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
const GAME = path.join(ROOT, 'shut-the-door');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? +process.argv[i + 1] : d; };
const SHOW = arg('--show', 5), LIST = process.argv.includes('--list');
export const LIMITS = { TURN_DEG: 0.5, STEP_PX: 2, KINK_PX: 3, KINK_X: 2.5, CONST_FT: 1e-6, DRAWN_FT: 1e-4, HAND_PX: 1.5, SIZE_PX: 0.02, PLATE_IN: 0.01, TIME_S: 1e-6 };
const SCREENS = [[390, 844], [1440, 900]].filter(([w]) => !process.argv.includes('--wide') || w > 1000);
const CELLS = [0, 2, 4, 10, 12, 14, 20, 22, 24], MISS = [[0, 0], [0.35, -0.25]];

function loadPlaywright() {
  for (const t of ['playwright', '/opt/node-tools/node_modules/playwright', '/opt/node22/lib/node_modules/playwright']) { try { return require(t); } catch (e) {} }
  throw new Error('playwright not found');
}
const CHROME = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((p) => fs.existsSync(p));
const TYPES = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.html': 'text/html', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary' };
const server = http.createServer((req, res) => {
  let rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  const f = path.join(ROOT, rel);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const browser = await loadPlaywright().chromium.launch(CHROME ? { executablePath: CHROME } : {});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', (e) => console.log('page error', String(e).slice(0, 300)));
await page.route('**/*', (route) => {
  const u = new URL(route.request().url());
  if (u.hostname === '127.0.0.1') return route.continue();
  if (/fonts\./.test(u.hostname)) return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
  if (u.hostname === 'cdn.jsdelivr.net') return route.fulfill({ status: 200, contentType: 'text/javascript', body: '' });
  return route.abort();
});
await page.goto(`http://127.0.0.1:${server.address().port}/shut-the-door/`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.STD_STAGE && window.STD_STAGE.current && window.STD_STAGE.current.loaded && window.STD_STAGE.current.fp && window.STD_STAGE.current.fp.ok, null, { timeout: 400000 });
await page.evaluate(() => { const st = window.STD_STAGE.current; st.renderer.render = () => {}; document.body.appendChild(st.canvas); });

const packs = fs.readdirSync(path.join(GAME, 'data/packs')).filter((f) => f.endsWith('.json')).sort()
  .map((f) => ({ id: f.replace(/\.json$/, ''), scn: JSON.parse(fs.readFileSync(path.join(GAME, 'data/packs', f))).scenario }));

const rows = [];
for (const [W, H] of SCREENS) {
  for (const { id, scn } of packs) {
    const got = await page.evaluate(({ scn, W, H, CELLS, MISS, L }) => {
      const st = window.STD_STAGE.current, out = [];
      st.canvas.style.cssText = `position:fixed;left:0;top:0;width:${W}px;height:${H}px;display:block;z-index:9999`;
      st.setScenario(scn);
      const sides = ['R', 'L'].map((s) => scn.batters.find((b) => b.bats === s)).filter(Boolean);
      const turnOf = (a, b, c) => { let t = Math.atan2(c[1] - b[1], c[0] - b[0]) - Math.atan2(b[1] - a[1], b[0] - a[0]); return Math.atan2(Math.sin(t), Math.cos(t)) * 180 / Math.PI; };
      for (const bat of sides) {
        st.setBatter(bat); st.layout();
        const fz = st.facts.batter;
        for (const a of st.facts.pitcher.arsenal) for (const cell of CELLS) for (const [mx, mz] of MISS) {
          const r = Math.floor(cell / 5), c = cell % 5;
          const x = (c - 2) * 0.553 + mx * (c < 2 ? -1 : 1), z = fz.szBot + (3.5 - r) / 3 * (fz.szTop - fz.szBot) + mz;
          st.setPitch({ call: { type: a.type, cell, at: null }, actual: { x, z }, velo: a.velo, pfxX: null, pfxZ: null, batter: 'take', result: 'ball', inPlay: null });
          const pt = st.pitch, f = pt.f, T = f.T, lens = pt.lens, cam = st.camera, cssW = W, cssH = H;
          const tag = `${a.type} vs ${bat.bats} cell ${cell}${mx ? ' missed' : ''}`;
          const bad = [];
          if (!lens) { out.push({ tag, bad: ['no first person lens: the ball is not drawn from his hand'] }); continue; }
          const px = (v, c2) => { const p = v.clone().project(c2); return [(p.x + 1) / 2 * cssW, (1 - p.y) / 2 * cssH]; };
          // his view held still at release
          const still = cam.clone(); st.eye.update(pt.tRel, still); still.updateMatrixWorld(); still.updateProjectionMatrix();
          const N = Math.max(4, Math.round(T * 60)), dt = T / N;
          const view = [], world = [];
          let carryOff = 0, kink = 0, lastSide = 0, turns = 0, maxSize = Infinity, grew = 0, drawn = 0, hand = 0;
          for (let i = 0; i <= N; i++) {
            const tt = i * dt;
            const w = pt.pointAt(tt); world.push(w); view.push(px(w, still));
            st.pose(pt.tRel + tt);
            const want = pt.pointAt(tt).add(lens.carry(tt, w.clone()));
            // the carry is his head's own move since release, the share 1 - tt / T of it
            const head = cam.position.clone().sub(still.position).multiplyScalar(1 - Math.min(1, tt / T));
            carryOff = Math.max(carryOff, head.distanceTo(lens.carry(tt, w.clone())) / 0.3048);
            drawn = Math.max(drawn, pt.ball.position.distanceTo(want) / 0.3048);
            const d = cam.position.distanceTo(pt.ball.position);
            const size = 0.0737 / (2 * d * Math.tan(cam.fov * Math.PI / 360)) * cssH * pt.ball.scale.x;
            if (size > maxSize + L.SIZE_PX) grew = Math.max(grew, size - maxSize);
            maxSize = Math.min(maxSize, size);
            if (i === 0) { const b = px(pt.ball.position, cam); hand = Math.hypot(b[0] - lens.hand.x, b[1] - lens.hand.y); }
          }
          const tv = [];
          const step = (p, q) => Math.hypot(q[0] - p[0], q[1] - p[1]);
          // (a turn between steps under STEP_PX is a ball all but still on the screen: its direction is
          // the pixel's rounding, not a path)
          for (let i = 1; i < N; i++) tv.push(step(view[i - 1], view[i]) < L.STEP_PX || step(view[i], view[i + 1]) < L.STEP_PX ? null : turnOf(view[i - 1], view[i], view[i + 1]));
          for (const t of tv) { if (t == null || Math.abs(t) < L.TURN_DEG) continue; const s = Math.sign(t); if (lastSide && s !== lastSide) turns++; lastSide = s; }
          // a kink: the change of its step in one frame (the second difference, px a frame a frame) a
          // spike over its neighbours', where a curve's own (an apex, the fall of a ball going away)
          // changes smoothly
          const acc = [];
          for (let i = 1; i < N; i++) acc.push(Math.hypot(view[i + 1][0] - 2 * view[i][0] + view[i - 1][0], view[i + 1][1] - 2 * view[i][1] + view[i - 1][1]));
          for (let i = 1; i + 1 < acc.length; i++) {
            const nb = Math.max(0.25, (acc[i - 1] + acc[i + 1]) / 2);
            if (acc[i] >= L.KINK_PX && acc[i] / nb >= L.KINK_X) kink = Math.max(kink, acc[i]);
          }
          // the side view: the flight's second difference, the same every frame
          let cst = 0;
          const a0 = world[2].clone().sub(world[1].clone().multiplyScalar(2)).add(world[0]);
          for (let i = 1; i < N; i++) { const ai = world[i + 1].clone().sub(world[i].clone().multiplyScalar(2)).add(world[i - 1]); cst = Math.max(cst, ai.distanceTo(a0) / 0.3048); }
          const end = f.at(T), plate = Math.hypot(end.x - x, end.z - z) * 12, yErr = Math.abs(end.y - 17 / 12) * 12;
          const carryEnd = lens.carry(T, world[0].clone()).length() / 0.3048;
          // his time: the flight from his own release at his own speed (pitch.js flight from rel)
          const T0 = (pt.rel.y - 17 / 12) / (0.96 * a.velo * 1.46667);
          const sx = 2 * (a.pfxX / 12) / (T * T), sz = 2 * (a.pfxZ / 12) / (T * T);
          if (turns) bad.push(`turns back ${turns}x in his view`);
          if (kink) bad.push(`a kink: its step changes ${kink.toFixed(1)} px in one frame`);
          if (cst > L.CONST_FT) bad.push(`not one constant acceleration from the side (${cst.toExponential(1)} ft)`);
          if (drawn > L.DRAWN_FT) bad.push(`drawn ${drawn.toFixed(4)} ft off its flight and carry`);
          if (carryOff > L.DRAWN_FT) bad.push(`its carry is ${carryOff.toFixed(4)} ft off his head's move`);
          if (carryEnd > L.DRAWN_FT) bad.push(`still carried ${carryEnd.toFixed(4)} ft at the plate`);
          if (hand > L.HAND_PX) bad.push(`leaves ${hand.toFixed(1)} px off his hand`);
          if (grew) bad.push(`grows ${grew.toFixed(2)} px on the screen`);
          if (plate > L.PLATE_IN || yErr > L.PLATE_IN) bad.push(`crosses ${plate.toFixed(3)} in off the engine's point`);
          if (Math.abs(T0 - T) > L.TIME_S || Math.abs(pt.tPlate - pt.tRel - T) > L.TIME_S) bad.push(`reaches the plate in ${T.toFixed(4)} s, not his ${T0.toFixed(4)} s`);
          if (Math.abs(f.ax - sx) > 1e-9 || Math.abs(f.az - (sz - 32.17)) > 1e-9) bad.push('not his break');
          out.push({ tag, bad, T, turns, kink, cst, drawn, hand, grew, view: bad.length ? view.map((q) => q.map((v) => Math.round(v * 10) / 10)) : null });
        }
      }
      return out;
    }, { scn, W, H, CELLS, MISS, L: LIMITS });
    for (const g of got) rows.push({ ...g, where: `${W}x${H} ${id} ${g.tag}` });
    process.stdout.write(`${W}x${H} ${id}: ${got.length} pitches, ${got.filter((g) => g.bad.length).length} failing\n`);
  }
}
await browser.close(); server.close();

const fails = rows.filter((r) => r.bad.length);
if (LIST) for (const r of rows) console.log(r.where, JSON.stringify({ T: r.T, turns: r.turns, kink: r.kink, cst: r.cst, drawn: r.drawn, hand: r.hand, grew: r.grew }));
for (const r of fails.slice(0, SHOW)) { console.log('FAIL', r.where + ':', r.bad.join('; ')); if (process.argv.includes('--trace')) console.log('  his view, px a frame:', r.view.map((q) => q.join(',')).join(' ')); }
console.log(`${rows.length} pitches: ${fails.length} failing (turning back, kinks, off the hand, growing, off the plate, off his time)`);
process.exit(fails.length ? 1 : 0);
