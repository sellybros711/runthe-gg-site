/* The broadcast keeps the play in frame: every out, every run and every hitter reaching his base is on
 * screen, with the ball, the man and the bag in the shot.
 *
 *   node shut-the-door/lab/pipeline/check-frame.mjs              the cases check-inplay plans
 *   node shut-the-door/lab/pipeline/check-frame.mjs --limit N    the first N cases (reported, not held to CEILING)
 *   node shut-the-door/lab/pipeline/check-frame.mjs --show N     print N misses in full
 *   node shut-the-door/lab/pipeline/check-frame.mjs --sample N   about N cases, spread over all of them
 *   node shut-the-door/lab/pipeline/check-frame.mjs --stride N   every Nth case
 *   node shut-the-door/lab/pipeline/check-frame.mjs --resume     pick up a killed run (checkpoint.mjs says how)
 * (the ceilings and floors were measured on every case: a sample is held to the ceilings' rate, which
 * for a ceiling of 0 is 0, and to the same floors, a percentile being a rate already)
 *
 * The owner (2026-10-22): we need to actually see the play unfold, the out or safe visible at the
 * base. So for every case check-inplay plans, staged the way the game stages it (inplay.js begin), the
 * moments that decide the play are found in the plan:
 *   out    a runner put out: the ball (in the glove that makes the out), the runner, the bag
 *   run    a run scores: the runner and home plate
 *   safe   a runner (the hitter above all) pulls into his base safe: the runner and the bag
 *   catch  a ball caught in the air: the ball
 *   tag-up a runner leaving his bag on a catch, a beat after it: the runner and the bag
 * and how big the man who decides it is on the phone (his feet to 6 ft, in px of the 457 px field):
 * the 10th percentile of each moment is held to FLOOR. Every case's cut is checked for a flash too.
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
import { selection, holding, capStr, openCheckpoint } from './checkpoint.mjs';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? +process.argv[i + 1] : d; };
const LIMIT = arg('--limit', Infinity), SHOW = arg('--show', 0);
const ASPECT = 390 / 457, MARGIN = 0.04;
// What is still missed, all of it measured (2026-10-24, after the flash fix): a ceiling that only comes
// down. Every deciding moment is on screen. A flash is a shot under 0.2 s whose camera is neither
// neighbour's, or a piece that runs backwards (3,718 after the framing pass, from two deciding moments a
// few hundredths apart in two cameras): none since inplay-plan.js tidyCut. A change that misses more
// fails; one that misses fewer lowers the number here in the same commit.
const CEILING = { catch: 0, out: 0, run: 0, safe: 0, 'tag-up': 0, flash: 0 };
// How big the man who decides it is, the 10th percentile of his height on the phone's 457 px field: a
// floor that only goes up. Before the framing pass (2026-10-24) it was out 10.6, run 20.6, safe 10.4,
// tag-up 10.5, a speck in a frame of the whole infield; after it 34.6, 44.1, 12.4, 70.7.
// The owner (2026-10-24): "it doesn't need to be super zoomed in". The broadcast now holds at least
// 45 ft of field where it looks (inplay.js ROOM_FT), so the median man came down from 103 px to 58 (out),
// 117 to 61 (run), 78 to 39 (safe) and 96 to 53 (tag-up). That lowered one floor, tag-up, from 86 to 35
// (a tag-up is a runner standing on his bag, the tightest shot there was). The others held where they were.
const FLOOR = { out: 45, run: 44, safe: 14, 'tag-up': 35 };

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
if (process.env.SMALL) await page.evaluate((o) => { window.__SMALL = []; window.__SMALLT = o.t; window.__SMALLW = o.w; }, { t: +(process.env.SMALLT || 14), w: process.env.SMALLW || null });

const SEL = selection({ heldStride: 1, total: [...inplayCases()].length });
const cases = [];
let kc = 0;
for (const c of inplayCases()) { const kk = kc++; if (kk % SEL.stride || Math.floor(kk / SEL.stride) % SEL.shard.n !== SEL.shard.i) continue; if (cases.length >= LIMIT) break; cases.push(c); }
const HOLD = holding({ stride: SEL.stride, heldStride: 1, n: cases.length, heldN: SEL.total, partial: LIMIT !== Infinity || !!process.env.SMALL, shard: SEL.shard });
const rows = [];
const CHUNK = 500;
const CK = openCheckpoint('check-frame', { STRIDE: SEL.stride, LIMIT: String(LIMIT), SHARD: SEL.shard, CHUNK, SMALL: process.env.SMALL || null });
for (let i = 0; i < cases.length; i += CHUNK) {
  if (CK.has(i)) { rows.push(...CK.get(i)); continue; }
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
        if (e.kind === 'catch') {
          moments.push({ what: 'catch', s: e.s, pts: [plan.ballAt(e.s)] });
          // a tag-up: each runner leaving his bag on the catch, a beat after it
          for (const r of plan.runners) if (!r.batter && r.to > r.from && plan.kind === 'air_out') {
            const q = r.track.at(e.s + 0.3);
            moments.push({ what: 'tag-up', s: e.s + 0.3, pts: [{ x: q.x, y: q.y, z: 0 }, { x: q.x, y: q.y, z: 6 }, BASE[r.from]] });
          }
        }
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
        // how tall the man who decides it stands on the phone (px on the 457 px field, his feet to 6 ft)
        const man = m.pts.findIndex((p, i) => p.z === 6 && i > 0 && m.pts[i - 1].z === 0 && m.pts[i - 1].x === p.x && m.pts[i - 1].y === p.y);
        const tall = man > 0 && m.framed ? Math.abs(V(m.pts[man]).project(cam).y - V(m.pts[man - 1]).project(cam).y) / 2 * 457 : null;
        if (window.__SMALL && tall != null && tall < (window.__SMALLT || 14) && (!window.__SMALLW || m.what === window.__SMALLW)) window.__SMALL.push({ tag: c.tag, what: m.what, s: +m.s.toFixed(2), cam: pc.cam, tall: +tall.toFixed(1), k: { pos: k.pos, look: k.look, fov: +k.fov.toFixed(1) }, pts: m.pts, edit: plan.edit.map((p) => p.cam + ' ' + p.s0.toFixed(2) + '-' + p.s1.toFixed(2)).join(' | ') });
        out.push({ tag: c.tag, what: m.what, s: +m.s.toFixed(2), cam: pc.cam, worst: +worst.toFixed(3), tall, miss: m.framed ? null : 'out of frame', at: bad, k: m.framed ? undefined : { pos: k.pos, look: k.look, fov: +k.fov.toFixed(1) }, m, edit: m.framed ? undefined : plan.edit.map((p) => p.cam + ' ' + p.s0.toFixed(2) + '-' + p.s1.toFixed(2)).join(' | '), when: m.framed ? undefined : moments.map((o) => o.what + '@' + o.s.toFixed(2)).join(' ') });
      }
      // a flash: a piece of the cut that runs backwards, or one under 0.2 s whose camera is neither
      // neighbour's (a cut there and straight back again is a blink on a phone, not a shot)
      const ed = plan.edit;
      for (let i = 1; i < ed.length; i++) {
        const p = ed[i], a = ed[i - 1], b = ed[i + 1];
        if (p.s1 < p.s0 - 1e-6 || (p.s1 - p.s0 < 0.2 && p.cam !== a.cam && (!b || p.cam !== b.cam))) { out.push({ tag: c.tag, what: 'flash', s: +p.s0.toFixed(2), miss: 'a ' + (p.s1 - p.s0).toFixed(2) + ' s ' + p.cam + ' shot', edit: ed.map((x) => x.cam + ' ' + x.s0.toFixed(2) + '-' + x.s1.toFixed(2)).join(' | ') }); break; }
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
  CK.put(i, got);
  process.stdout.write(`\r${Math.min(i + CHUNK, cases.length)} of ${cases.length} cases`);
}
console.log('');
CK.close();
if (process.env.SMALL) for (const r of (await page.evaluate(() => window.__SMALL)).slice(0, +process.env.SMALL)) console.log('SMALL', JSON.stringify(r));
const by = {};
for (const r of rows) if (!r.err) { const b = (by[r.what] ||= { n: 0, miss: {} }); b.n++; if (r.miss) b.miss[r.miss] = (b.miss[r.miss] || 0) + 1; }
// (flashes are counted a play at a time, and shown when there are none)
by.flash = { n: cases.length, miss: (by.flash || { miss: {} }).miss };
let fails = 0;
console.log('\nthe moments that decide the play, on the phone\'s screen');
for (const [w, b] of Object.entries(by).sort()) {
  const m = Object.values(b.miss).reduce((a, x) => a + x, 0);
  // (a partial run, --limit, only reports)
  const cap = HOLD.cap(CEILING[w] ?? 0);
  const over = m > cap;
  if (over) fails += Math.ceil(m - cap);
  console.log(`  ${over ? 'FAIL' : 'ok  '} ${w.padEnd(6)} ${String(b.n).padStart(7)}  missed ${m}${cap !== Infinity ? ' (ceiling ' + capStr(cap) + ')' : ''}${m ? ' (' + Object.entries(b.miss).map(([k, v]) => v + ' ' + k).join(', ') + ')' : ''}`);
}
// how big the man is: the 10th percentile and the median of his height on screen, each moment
console.log('\nthe man who decides it, his height on the phone (px of the 457 px field)');
const pct = (a, q) => a[Math.min(a.length - 1, Math.floor(a.length * q))];
for (const w of Object.keys(by).sort()) {
  const t = rows.filter((r) => r.what === w && r.tall != null).map((r) => r.tall).sort((a, b) => a - b);
  if (!t.length) continue;
  const p10 = pct(t, 0.1), cap = HOLD.mode !== 'report' ? FLOOR[w] : undefined, under = cap != null && p10 < cap;
  if (under) fails++;
  console.log(`  ${under ? 'FAIL' : 'ok  '} ${w.padEnd(6)} ${String(t.length).padStart(7)}  10th ${p10.toFixed(1)}${cap != null ? ' (floor ' + cap + ')' : ''}  median ${pct(t, 0.5).toFixed(1)}`);
}
if (SHOW) for (const cm of [...new Set(rows.map((r) => r.cam).filter(Boolean))]) { const t = rows.filter((r) => r.cam === cm && r.tall != null).map((r) => r.tall).sort((a, b) => a - b); if (t.length) console.log(`     by camera ${cm.padEnd(7)} ${String(t.length).padStart(7)}  10th ${pct(t, 0.1).toFixed(1)}  median ${pct(t, 0.5).toFixed(1)}`); }
const errs = rows.filter((r) => r.err);
for (const e of errs.slice(0, 5)) console.log('  threw:', e.tag, e.err);
if (SHOW) for (const r of rows.filter((x) => x.miss).slice(0, SHOW)) console.log(JSON.stringify(r));
console.log(`\n${cases.length} cases, ${rows.filter((r) => !r.err && r.what !== 'flash').length} moments, ${fails} over the ceiling (${HOLD.label})`);
await browser.close();
server.close();
process.exit(fails || errs.length ? 1 : 0);
