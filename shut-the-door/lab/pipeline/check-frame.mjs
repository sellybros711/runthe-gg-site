/* The broadcast keeps the play in frame: every out, every run and every hitter reaching his base is on
 * screen, with the ball, the man and the bag in the shot.
 *
 *   node shut-the-door/lab/pipeline/check-frame.mjs              the cases check-inplay plans
 *   node shut-the-door/lab/pipeline/check-frame.mjs --limit N    the first N cases (reported, not held to CEILING)
 *   node shut-the-door/lab/pipeline/check-frame.mjs --show N     print N misses in full
 *
 * The owner (2026-10-22): we need to actually see the play unfold, the out or safe visible at the
 * base. So for every case check-inplay plans, staged the way the game stages it (inplay.js begin), the
 * moments that decide the play are found in the plan:
 *   out    a runner put out: the ball (in the glove that makes the out), the runner, the bag
 *   run    a run scores: the runner and home plate
 *   safe   a runner (the hitter above all) pulls into his base safe: the runner and the bag
 *   catch  a ball caught in the air: the ball
 * and the broadcast camera the cut has at that moment (inplay.js cameraAt, the phone's 390x457 field)
 * must hold every point inside the frame (a margin of 4% each side). Two moments at once in two places
 * cannot share one camera: a moment is covered when one within 0.8 s of it is on screen. A
 * moment that falls in a jump cut's gap (no camera has it) is a miss: it happened off screen.
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { inplayCases } from './inplay-cases.mjs';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? +process.argv[i + 1] : d; };
const LIMIT = arg('--limit', Infinity), SHOW = arg('--show', 0);
const ASPECT = 390 / 457, MARGIN = 0.04;
// What is still missed, all of it measured (2026-10-23): a ceiling that only comes down. Outs are all
// on screen. The rest are camera solves at the frame's edge (a foul pop caught behind the plate with a
// runner doubled off at first; two runners safe at two bases a second apart). A change that misses
// more fails; one that misses fewer lowers the number here in the same commit.
const CEILING = { catch: 69, out: 0, run: 60, safe: 126 };

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

const cases = [];
for (const c of inplayCases()) { if (cases.length >= LIMIT) break; cases.push(c); }
const rows = [];
const CHUNK = 500;
for (let i = 0; i < cases.length; i += CHUNK) {
  const part = cases.slice(i, i + CHUNK).map((c) => ({ pr: c.pr, hand: c.hand, tag: `${c.pack} ${c.key}/${c.label} st ${c.st} ball ${JSON.stringify(c.ball)} moves ${JSON.stringify(c.moves)}` }));
  const got = await page.evaluate(({ part, ASPECT, MARGIN }) => {
    const st = window.STD_STAGE.current, ip = st.inplay, out = [];
    const facts0 = ip.facts;
    const stub = { after: { t0: 0 }, f: { at: () => ({ x: 0, y: 1.2, z: 2.6 }) }, ball: st.pitch.ball, overlays: false };
    const cam = st.camera.clone();
    const FT = 0.3048, V = (p) => cam.position.clone().set(-p.x * FT, (p.z || 0) * FT, p.y * FT);
    const BASE = [{ x: 0, y: 0 }, { x: 63.64, y: 63.64 }, { x: 0, y: 127.28 }, { x: -63.64, y: 63.64 }, { x: 0, y: 0 }];
    for (const c of part) {
      ip.facts = { ...facts0, batter: { ...facts0.batter, bats: c.hand } };
      let run;
      try { run = ip.begin(c.pr, stub, {}); } catch (e) { out.push({ tag: c.tag, err: String(e) }); continue; }
      const plan = run.plan, moments = [];
      for (const e of plan.events) {
        if (e.kind === 'out') {
          const r = plan.runners.find((x) => x.from === e.runner);
          const pts = [{ ...plan.ballAt(e.s), z: 4 }, BASE[e.base]];
          if (r) { const q = r.track.at(e.s); pts.push({ x: q.x, y: q.y, z: 0 }, { x: q.x, y: q.y, z: 6 }); }
          moments.push({ what: 'out', s: e.s, pts });
        }
        if (e.kind === 'run') {
          const r = plan.runners.find((x) => x.from === e.runner);
          const q = r ? r.track.at(e.s) : BASE[4];
          moments.push({ what: 'run', s: e.s, pts: [{ x: q.x, y: q.y, z: 0 }, { x: q.x, y: q.y, z: 6 }, BASE[4]] });
        }
        if (e.kind === 'catch') moments.push({ what: 'catch', s: e.s, pts: [plan.ballAt(e.s)] });
      }
      // every runner who moves up and is safe, the hitter on a hit above all
      for (const r of plan.runners) {
        if (r.out || !(r.to >= 1 && r.to <= 3) || r.arrive == null || r.from === r.to) continue;
        const p = r.track.at(r.arrive);
        moments.push({ what: 'safe', s: r.arrive, pts: [{ x: p.x, y: p.y, z: 0 }, { x: p.x, y: p.y, z: 6 }, BASE[r.to]] });
      }
      for (const m of moments) {
        const pc = plan.edit.find((p) => m.s >= p.s0 - 1e-6 && m.s <= p.s1 + 1e-6);
        if (!pc) { const end = plan.edit[plan.edit.length - 1].s1; out.push({ tag: c.tag, what: m.what, s: +m.s.toFixed(2), miss: m.s > end ? 'after the cut ends' : 'off screen (a jump cut)', edit: plan.edit.map((p) => p.cam + ' ' + p.s0.toFixed(2) + '-' + p.s1.toFixed(2)).join(' | ') }); continue; }
        if (pc.cam === 'pitcher') { out.push({ tag: c.tag, what: m.what, s: +m.s.toFixed(2), miss: "in the pitcher's view" }); continue; }
        const k = ip.cameraAt(pc, m.s, ASPECT);
        cam.position.copy(V(k.pos)); cam.fov = k.fov; cam.aspect = ASPECT; cam.updateProjectionMatrix();
        cam.lookAt(V(k.look)); cam.updateMatrixWorld();
        let worst = 0, bad = null;
        for (const p of m.pts) {
          const v = V(p).project(cam);
          const o = Math.max(Math.abs(v.x), Math.abs(v.y), v.z > 1 ? 9 : 0);
          if (o > worst) { worst = o; bad = p; }
        }
        m.framed = worst <= 1 - MARGIN;
        out.push({ tag: c.tag, what: m.what, s: +m.s.toFixed(2), cam: pc.cam, worst: +worst.toFixed(3), miss: m.framed ? null : 'out of frame', at: bad, k: m.framed ? undefined : { pos: k.pos, look: k.look, fov: +k.fov.toFixed(1) }, m, edit: m.framed ? undefined : plan.edit.map((p) => p.cam + ' ' + p.s0.toFixed(2) + '-' + p.s1.toFixed(2)).join(' | '), when: m.framed ? undefined : moments.map((o) => o.what + '@' + o.s.toFixed(2)).join(' ') });
      }
      // two things at once in two places (a run scores as the hitter reaches first): one camera can
      // hold only one, so a moment is covered when one within 0.8 s of it is on screen
      for (const r of out) if (r.m && r.miss === 'out of frame' && moments.some((o) => o !== r.m && o.framed && Math.abs(o.s - r.m.s) <= 0.8)) r.miss = null;
      for (const r of out) delete r.m;
      ip.end(st.camera);
    }
    ip.facts = facts0;
    return out;
  }, { part, ASPECT, MARGIN });
  rows.push(...got);
  process.stdout.write(`\r${Math.min(i + CHUNK, cases.length)} of ${cases.length} cases`);
}
console.log('');
const by = {};
for (const r of rows) if (!r.err) { const b = (by[r.what] ||= { n: 0, miss: {} }); b.n++; if (r.miss) b.miss[r.miss] = (b.miss[r.miss] || 0) + 1; }
let fails = 0;
console.log('\nthe moments that decide the play, on the phone\'s screen');
for (const [w, b] of Object.entries(by).sort()) {
  const m = Object.values(b.miss).reduce((a, x) => a + x, 0);
  // (a partial run, --limit, only reports)
  const cap = LIMIT === Infinity ? CEILING[w] ?? 0 : Infinity;
  const over = m > cap;
  if (over) fails += m - cap;
  console.log(`  ${over ? 'FAIL' : 'ok  '} ${w.padEnd(6)} ${String(b.n).padStart(7)}  missed ${m}${cap !== Infinity ? ' (ceiling ' + cap + ')' : ''}${m ? ' (' + Object.entries(b.miss).map(([k, v]) => v + ' ' + k).join(', ') + ')' : ''}`);
}
const errs = rows.filter((r) => r.err);
for (const e of errs.slice(0, 5)) console.log('  threw:', e.tag, e.err);
if (SHOW) for (const r of rows.filter((x) => x.miss).slice(0, SHOW)) console.log(JSON.stringify(r));
console.log(`\n${cases.length} cases, ${rows.length - errs.length} moments, ${fails} over the ceiling`);
await browser.close();
server.close();
process.exit(fails || errs.length ? 1 : 0);
