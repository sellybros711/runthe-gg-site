/* The broadcast camera moves like a TV camera: eased, never whipped, every shot long enough to read, the
 * ball on screen through its flight and no cut while a throw is in the air.
 *
 *   node shut-the-door/lab/pipeline/check-camera.mjs              every STRIDE-th case check-inplay plans
 *   node shut-the-door/lab/pipeline/check-camera.mjs --stride N   every Nth case (1: all of them)
 *   node shut-the-door/lab/pipeline/check-camera.mjs --limit N    the first N of those (reported, not held)
 *   node shut-the-door/lab/pipeline/check-camera.mjs --show N     print N of each kind of miss in full
 *   node shut-the-door/lab/pipeline/check-camera.mjs --sample N   about N cases (held at the ceilings' rate)
 *   node shut-the-door/lab/pipeline/check-camera.mjs --resume     pick up a killed run (checkpoint.mjs says how)
 *
 * The ceilings were measured on every case (--stride 1), the held set: that run is held to them as they
 * are, and the nightly runs it. A bare run (every 10th case) or any --sample is a subset of it, held to
 * the same rate (checkpoint.mjs: a ceiling of C over 58,498 plays is C * n / 58,498 over n).
 *
 * The owner (2026-10-26, on an iPhone): "the camera is super messed up when the ball is hit, and the
 * sequence of events feels off, not smooth, and very hard to follow visually." check-frame holds the
 * deciding moments in the frame; this holds the motion between them. Each case is staged the way the
 * game stages it (inplay.js begin) and played at 60 frames a second of real time through the cut
 * (warp: the slow motion beat slowed, a jump cut a new shot), the camera read off inplay.js cameraAt on
 * the phone's field (390x457). A shot is a run of frames on one camera with no jump in scene time. In
 * a shot, frame to frame:
 *   whip     the look turning faster than WHIP_DEG a frame (a pan a viewer loses the field in)
 *   jerk     the look's turn, the camera's travel or the lens changing speed by more than its ceiling
 *            in one frame (ANG_JERK degrees, POS_JERK feet, FOV_JERK in the log of the lens's width, as the eye reads a zoom; a
 *            second difference): a
 *            jump or a start with no ease
 *   lost     the ball off screen on a frame of its flight (in the air, on the ground, thrown) in a shot
 *            on the ball (follow, sky, track), or over the last half second of a throw to the bag a
 *            runner's shot is about (inplay-plan.js bagOf: the out, the run, the runner safe there)
 *   away     the ball off screen in a runner's shot (wide, plate) the cut went to on purpose while the
 *            ball rolls, flies or is thrown on elsewhere: counted and shown, not held
 * And at each cut:
 *   short    a shot under MIN_SHOT_S of real time (too short to read)
 *   mid-throw a cut while a throw is in the air (its target still unseen), past the first 30% of its
 *            flight (a cut just after the release, when the shot before has its moment then, goes to a
 *            shot that holds the ball in the air)
 * Each is counted as the plays that have one, held to CEILING: a ceiling that only comes down.
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { inplayCases } from './inplay-cases.mjs';
import { selection, holding, capStr, openCheckpoint } from './checkpoint.mjs';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? +process.argv[i + 1] : d; };
const ONLY = (() => { const i = process.argv.indexOf('--only'); return i > 0 ? process.argv[i + 1] : null; })();
const SEL = selection({ heldStride: 1, defaultStride: 10, total: [...inplayCases()].length });
const STRIDE = SEL.stride, LIMIT = arg('--limit', Infinity), SHOW = arg('--show', 0);
const ASPECT = 390 / 457;
const LIM = { WHIP_DEG: 1.0, ANG_JERK: 0.1, POS_JERK: 0.5, FOV_JERK: 0.02, MIN_SHOT_S: 0.55 };
// The broadcast's pan caps (the owner, 2026-10-26: "a true broadcast feel... not pan so fast"): a pan of
// at most 1 degree a frame (60 degrees a second, a third of the old 3), its change of speed 0.1 a frame a
// frame (a fifth of 0.5), the camera's travel 0.5 ft (half of 1.0) and the zoom 0.02 (from 0.05).
// Measured on every case, --stride 1, 2026-10-27, with the high home, high base and low first base cameras
// (inplay.js): whip 321 of 58,498 plays (high base camera shots that must turn from the ball to a runner's
// bag, at 1.0-1.1 degrees a frame), jerk 86, lost 7 (balls hit behind the plate, in a plate shot). Lower
// these as they are fixed, never raise them.
const CEILING = { whip: 321, jerk: 86, lost: 7, short: 0, 'mid-throw': 0, away: Infinity };

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
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
page.on('pageerror', (e) => console.log('page error', String(e).slice(0, 300)));
await page.route('**/*', (route) => {
  const u = new URL(route.request().url());
  if (u.hostname === '127.0.0.1') return route.continue();
  if (/fonts\./.test(u.hostname)) return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
  if (u.hostname === 'cdn.jsdelivr.net') return route.fulfill({ status: 200, contentType: 'text/javascript', body: '' });
  return route.abort();
});
await page.goto(`http://127.0.0.1:${server.address().port}/shut-the-door/`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.STD_STAGE && window.STD_STAGE.current && window.STD_STAGE.current.loaded, null, { timeout: 400000 });
await page.evaluate(() => { window.STD_STAGE.current.renderer.render = () => {}; });
// (the plan module the page loaded, for warp and bagOf)
const warpUrl = await page.evaluate(() => performance.getEntriesByType('resource').map((e) => e.name).find((n) => /inplay-plan\.js/.test(n)));
await page.evaluate(async (u) => { window.__plan = await import(u); }, warpUrl);

const cases = [];
let k = 0;
for (const c of inplayCases()) { const kk = k++; if (kk % STRIDE || Math.floor(kk / STRIDE) % SEL.shard.n !== SEL.shard.i) continue; if (ONLY && !`${c.pack} ${c.key}/${c.label} st ${c.st}`.includes(ONLY)) continue; if (cases.length >= LIMIT) break; cases.push(c); }
const rows = [], dist = { ang: [], angJ: [], posJ: [], fovJ: [], shot: [], fov: [] };
const CHUNK = 300;
const CK = openCheckpoint('check-camera', { STRIDE, LIMIT: String(LIMIT), ONLY, SHARD: SEL.shard, CHUNK });
for (let i = 0; i < cases.length; i += CHUNK) {
  if (CK.has(i)) { const got = CK.get(i); rows.push(...got.out); for (const k2 of Object.keys(got.stats)) (dist[k2] ||= []).push(...got.stats[k2]); continue; }
  const part = cases.slice(i, i + CHUNK).map((c) => ({ pr: c.pr, hand: c.hand, align: c.align, tag: `${c.pack} ${c.key}/${c.label} st ${c.st} ball ${JSON.stringify(c.ball)} moves ${JSON.stringify(c.moves)}` }));
  const got = await page.evaluate(({ part, ASPECT, LIM }) => {
    const st = window.STD_STAGE.current, ip = st.inplay, out = [], warp = window.__plan.warp;
    const facts0 = ip.facts;
    const stub = { after: { t0: 0 }, f: { at: () => ({ x: 0, y: 1.2, z: 2.6 }) }, ball: st.pitch.ball, overlays: false };
    const cam = st.camera.clone();
    const FT = 0.3048, V = (p) => cam.position.clone().set(-p.x * FT, (p.z || 0) * FT, p.y * FT);
    const D = 180 / Math.PI, sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }), len = (a) => Math.hypot(a.x, a.y, a.z);
    const unit = (a) => { const l = len(a) || 1; return { x: a.x / l, y: a.y / l, z: a.z / l }; };
    const d2 = (a, b, c) => len({ x: a.x - 2 * b.x + c.x, y: a.y - 2 * b.y + c.y, z: a.z - 2 * b.z + c.z });
    const stats = { ang: [], angJ: [], posJ: [], fovJ: [], shot: [], fov: [] };
    for (const c of part) {
      ip.facts = { ...facts0, batter: { ...facts0.batter, bats: c.hand } };
      let run;
      try { run = ip.begin(c.pr, stub, { align: c.align }); } catch (e) { out.push({ tag: c.tag, err: String(e) }); continue; }
      const plan = run.plan, ed = plan.edit, miss = {};
      const note = (what, at, info) => { if (!miss[what]) miss[what] = { at: +at.toFixed(3), ...info }; };
      const shots = [];
      let shot = null;
      const N = Math.ceil(plan.realDur * 60);
      for (let f = 0; f <= N; f++) {
        const r = Math.min(plan.realDur, f / 60), w = warp(ed, r), s = w.s, pc = w.piece;
        const jump = shot && (pc.cam !== shot.cam || Math.abs(s - shot.sLast) > 1.5 / 60 + 1e-6);
        if (!shot || jump) { shot = { cam: pc.cam, f0: f, s0: s, sLast: s, fr: [] }; shots.push(shot); }
        shot.sLast = s; shot.f1 = f; shot.s1 = s;
        if (pc.cam === 'pitcher') continue;
        const k = ip.cameraAt(pc, s, ASPECT);
        const dir = unit(sub(k.look, k.pos));
        shot.fr.push({ pos: k.pos, dir, fov: k.fov, s, slow: pc.rate < 1 });
        stats.fov.push(k.fov); (stats['fov_' + pc.cam] ||= []).push(k.fov);
        // the ball, through its flight
        const b = plan.ballAt(s);
        if (!b.by && !b.gone) {
          cam.position.copy(V(k.pos)); cam.fov = k.fov; cam.aspect = ASPECT; cam.updateProjectionMatrix();
          cam.lookAt(V(k.look)); cam.updateMatrixWorld();
          const v = V(b).project(cam);
          if (Math.abs(v.x) > 1 || Math.abs(v.y) > 1 || v.z > 1) {
            let sg = null; for (const x of plan.segs) if (s >= x.t0) sg = x;
            // (a runner's shot, wide or at the plate, cut to on purpose while the ball rolls or flies on
            // elsewhere, is away from the ball, not lost: only a throw must be seen there)
            // (a throw arriving at the bag the shot is about: its deciding moment's, inplay-plan.js bagOf)
            const bag = window.__plan.bagOf(plan, pc.m);
            const arriving = sg && sg.kind === 'throw' && s >= sg.t1 - 0.5 && bag && Math.hypot(sg.b.x - bag.x, sg.b.y - bag.y) < 20;
            const onBall = pc.cam === 'follow' || pc.cam === 'sky' || pc.cam === 'track' || arriving;
            note(onBall ? 'lost' : 'away', r, { s: +s.toFixed(2), cam: pc.cam, seg: sg ? sg.kind : '-', v: [+v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(3)], fov: +k.fov.toFixed(1), ball: [Math.round(b.x), Math.round(b.y), Math.round(b.z)], pos: [Math.round(k.pos.x), Math.round(k.pos.y), Math.round(k.pos.z)] });
          }
        }
      }
      for (const sh of shots) {
        const fr = sh.fr, n = fr.length;
        if (sh.cam !== 'pitcher') stats.shot.push((sh.f1 - sh.f0 + 1) / 60);
        for (let j = 1; j < n; j++) {
          const a = Math.acos(Math.max(-1, Math.min(1, fr[j].dir.x * fr[j - 1].dir.x + fr[j].dir.y * fr[j - 1].dir.y + fr[j].dir.z * fr[j - 1].dir.z))) * D;
          stats.ang.push(a);
          if (a > LIM.WHIP_DEG) note('whip', (sh.f0 + j) / 60, { cam: sh.cam, deg: +a.toFixed(2), s: +fr[j].s.toFixed(2) });
          // (motion is held from a tenth of a second into a shot to a tenth before its end: a cut lands
          // on a camera already moving, as a broadcast cuts on motion, and the eye takes that long to
          // find its feet in a new shot)
          if (j >= 6 && j < n - 7) {
            const aj = d2(fr[j + 1].dir, fr[j].dir, fr[j - 1].dir) * D, pj = d2(fr[j + 1].pos, fr[j].pos, fr[j - 1].pos), lt = (f) => Math.log(Math.tan(f * Math.PI / 360)), fj = Math.abs(lt(fr[j + 1].fov) - 2 * lt(fr[j].fov) + lt(fr[j - 1].fov));
            stats.angJ.push(aj); stats.posJ.push(pj); stats.fovJ.push(fj);
            if (aj > LIM.ANG_JERK || pj > LIM.POS_JERK || fj > LIM.FOV_JERK) note('jerk', (sh.f0 + j) / 60, { cam: sh.cam, ang: +aj.toFixed(3), pos: +pj.toFixed(3), fov: +fj.toFixed(4), s: +fr[j].s.toFixed(2) });
          }
        }
      }
      // the cuts: every shot (after the pitcher's view) long enough, none while a throw is in the air
      for (let j = 1; j < shots.length; j++) {
        const a = shots[j - 1], b = shots[j], last = j === shots.length - 1;
        const len = (b.f1 - b.f0 + 1) / 60;
        if (len < LIM.MIN_SHOT_S && !last) note('short', b.f0 / 60, { cam: b.cam, len: +len.toFixed(2) });
        // (the throw's first stretch, EARLY_THROW of its flight, is allowed when the shot before has its
        // deciding moment just then: inplay-plan.js throwSafe cuts there only to a shot that holds the ball)
        const mid = (t, sg) => t > sg.t0 + Math.max(0.05, 0.3 * (sg.t1 - sg.t0)) + 0.02 && t < sg.t1 - 0.05;
        const th = plan.segs.find((sg) => sg.kind === 'throw' && (mid(a.s1, sg) || mid(b.s0, sg)));
        if (th && a.cam !== 'pitcher') note('mid-throw', b.f0 / 60, { from: a.cam, to: b.cam, cut: +a.s1.toFixed(2) + '>' + b.s0.toFixed(2), throw: th.t0.toFixed(2) + '-' + th.t1.toFixed(2) });
      }
      out.push({ tag: c.tag, miss, edit: ed.map((p) => p.cam + ' ' + p.s0.toFixed(2) + '-' + p.s1.toFixed(2) + (p.rate < 1 ? ' slow' : '')).join(' | ') });
      ip.end(st.camera);
    }
    ip.facts = facts0;
    // (the distributions, thinned so the page hands back little)
    const thin = (a) => a.sort((x, y) => x - y).filter((_, i) => i % 7 === 0);
    return { out, stats: { ang: thin(stats.ang), angJ: thin(stats.angJ), posJ: thin(stats.posJ), fovJ: thin(stats.fovJ), shot: stats.shot, fov: thin(stats.fov), ...Object.fromEntries(Object.keys(stats).filter((x) => x.startsWith('fov_')).map((x) => [x, thin(stats[x])])) } };
  }, { part, ASPECT, LIM });
  rows.push(...got.out);
  for (const k2 of Object.keys(got.stats)) (dist[k2] ||= []).push(...got.stats[k2]);
  CK.put(i, got);
  process.stdout.write(`\r${Math.min(i + CHUNK, cases.length)} of ${cases.length} cases`);
}
console.log('');
CK.close();
const HOLD = holding({ stride: STRIDE, heldStride: 1, n: cases.length, heldN: SEL.total, partial: LIMIT !== Infinity || ONLY != null, shard: SEL.shard });
const pct = (a, q) => { const b = a.slice().sort((x, y) => x - y); return b.length ? b[Math.min(b.length - 1, Math.floor(b.length * q))] : 0; };
console.log('per frame at 60 fps: median, 99th, 99.9th, max');
for (const [k2, u] of [['ang', 'deg turn'], ['angJ', 'deg turn change'], ['posJ', 'ft travel change'], ['fovJ', 'log lens change']]) console.log(`  ${k2.padEnd(5)} ${pct(dist[k2], 0.5).toFixed(3)} ${pct(dist[k2], 0.99).toFixed(3)} ${pct(dist[k2], 0.999).toFixed(3)} ${dist[k2].reduce((a, x) => Math.max(a, x), 0).toFixed(3)}  (${u})`);
console.log(`  lens: median ${pct(dist.fov, 0.5).toFixed(1)}, 90th ${pct(dist.fov, 0.9).toFixed(1)}, at 70 or more ${(dist.fov.filter((x) => x >= 70).length / Math.max(1, dist.fov.length) * 100).toFixed(1)}% of frames; by camera ${Object.keys(dist).filter((x) => x.startsWith('fov_')).map((x) => x.slice(4) + ' ' + pct(dist[x], 0.5).toFixed(1)).join(', ')}`);
console.log(`  shots: ${dist.shot.length}, real seconds 10th ${pct(dist.shot, 0.1).toFixed(2)} median ${pct(dist.shot, 0.5).toFixed(2)}`);
let fails = 0;
console.log('\nplays with a miss');
for (const w of Object.keys(CEILING)) {
  const m = rows.filter((r) => r.miss && r.miss[w]);
  const cap = HOLD.cap(CEILING[w]), over = m.length > cap;
  if (over) fails += Math.ceil(m.length - cap);
  const byCam = {};
  for (const r of m) { const c2 = r.miss[w].cam || r.miss[w].to || '-'; byCam[c2] = (byCam[c2] || 0) + 1; }
  console.log(`  ${over ? 'FAIL' : 'ok  '} ${w.padEnd(9)} ${String(m.length).padStart(6)} of ${rows.length}${cap !== Infinity ? ' (ceiling ' + capStr(cap) + ')' : ''}  ${JSON.stringify(byCam)}`);
  for (const r of m.slice(0, SHOW)) console.log('     ', r.tag, JSON.stringify(r.miss[w]), '|', r.edit);
}
const errs = rows.filter((r) => r.err);
for (const e of errs.slice(0, 5)) console.log('  threw:', e.tag, e.err);
console.log(`\n${cases.length} cases, ${fails} over the ceiling (${HOLD.label})`);
await browser.close();
server.close();
process.exit(fails || errs.length ? 1 : 0);
