/* Every catch in every pack's balls in play, on the posed bodies: the glove on the ball.
 *
 *   node shut-the-door/lab/pipeline/check-catch.mjs              the cases check-inplay plans
 *   node shut-the-door/lab/pipeline/check-catch.mjs --limit N    the first N cases (a quick look)
 *   node shut-the-door/lab/pipeline/check-catch.mjs --show N     print the N worst catches in full
 *   node shut-the-door/lab/pipeline/check-catch.mjs --json FILE  every measured catch, for a closer look
 *   node shut-the-door/lab/pipeline/check-catch.mjs --sample N   about N cases, spread over all of them
 *   node shut-the-door/lab/pipeline/check-catch.mjs --stride N   every Nth case
 *   node shut-the-door/lab/pipeline/check-catch.mjs --resume     pick up a killed run (checkpoint.mjs says how)
 * (every limit here is per catch, with no ceiling, so a sample is held exactly as the full run is)
 *
 * check-inplay.mjs holds the plan to the engine (who catches it, where, when). This holds the picture to
 * the plan: the owner saw a pop fly land beside the outfielder who caught it (2026-10-22). So the game
 * page is loaded in Chromium (its own stage, people and fielders, drawing nothing), every case is
 * staged the way the game stages it (inplay.js begin), and at every moment a fielder takes the ball
 * (each 'glove' event: a catch in the air, a throw taken at a bag) the scene is posed at that moment
 * (inplay.js update, every body) and the distance from the glove's pocket (Figure.handPoint) to the ball
 * the plan has there, an instant before, is measured. Every throw is measured at its release too: the
 * throwing hand an instant before against the ball as drawn an instant after. A ground ball fielded or picked up is measured
 * too (the 'field' and 'pickup' moments, the glove against the ball on the ground). A hit that falls
 * in must land clear of every glove (CLEAR_M). Over LIMIT_M on a held moment (HELD) is a failure.
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { inplayCases } from './inplay-cases.mjs';
import { selection, openCheckpoint } from './checkpoint.mjs';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? +process.argv[i + 1] : d; };
const LIMIT = arg('--limit', Infinity), SHOW = arg('--show', 0);
const JSON_OUT = process.argv.includes('--json') ? process.argv[process.argv.indexOf('--json') + 1] : null;
export const LIMIT_M = 0.15;
// a hit that falls in lands at least this far from every glove
export const CLEAR_M = 0.5;
// an out on a force: a foot within this of the bag's middle (a base is 15 in square); on a tag, the glove
// within this of the runner
export const FOOT_FT = 1.3, TAG_M = 0.45;
// the moments held to LIMIT_M (a kind left out is measured and printed as todo)
const HELD = ['catch in the air', 'drop', 'throw taken', 'release', 'ground ball fielded', 'picked up'];
const FT = 0.3048;
// the routine fly share (reported, not held): of the outs in the air on a ball the engine calls routine
// (contract.js routineOf: a popup, or a fly at 30 degrees and up off the bat at 80-95 mph), how many the
// catcher takes within ROUTINE_FT of where he stood at the pitch (a few steps), and within twice that
const ROUTINE_FT = 15;
const { routineOf } = require(path.join(ROOT, 'shut-the-door', 'contract.js'));

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
// the clips (fielder.glb) in, so the bodies run and reach as the game shows them; nothing drawn
await page.evaluate(async () => {
  const st = window.STD_STAGE.current;
  await st.inplay.motion;
  st.renderer.render = () => {};
  st.inplay.ownCamera = false;
});

const SEL = selection({ heldStride: 1, total: [...inplayCases()].length });
const cases = [];
let kc = 0;
for (const c of inplayCases()) { const kk = kc++; if (kk % SEL.stride || Math.floor(kk / SEL.stride) % SEL.shard.n !== SEL.shard.i) continue; if (cases.length >= LIMIT) break; cases.push(c); }
const rows = [];
const CHUNK = 400;
const CK = openCheckpoint('check-catch', { STRIDE: SEL.stride, LIMIT: String(LIMIT), SHARD: SEL.shard, CHUNK });
for (let i = 0; i < cases.length; i += CHUNK) {
  if (CK.has(i)) { rows.push(...CK.get(i)); continue; }
  const part = cases.slice(i, i + CHUNK).map((c) => ({ pr: c.pr, hand: c.hand, align: c.align, routine: routineOf(c.pr.inPlay.bb, c.pr.inPlay.ev, c.pr.inPlay.la, c.pr.inPlay.spray) === 'air', tag: `${c.pack} ${c.key}/${c.label} st ${c.st} ball ${JSON.stringify(c.ball)} moves ${JSON.stringify(c.moves)}` }));
  const got = await page.evaluate((part) => {
    const st = window.STD_STAGE.current, ip = st.inplay, out = [];
    const facts0 = ip.facts;
    const ball = st.pitch.ball;
    const stub = { after: { t0: 0 }, f: { at: () => ({ x: 0, y: 1.2, z: 2.6 }) }, ball, overlays: false };
    for (const c of part) {
      ip.facts = { ...facts0, batter: { ...facts0.batter, bats: c.hand } };
      let run;
      try { run = ip.begin(c.pr, stub, { align: c.align }); } catch (e) { out.push({ tag: c.tag, err: String(e) }); continue; }
      const plan = run.plan, seen = new Set();
      // how far the catcher went for an out in the air: from where he stood at the pitch to the catch
      if (plan.kind === 'air_out') { const e = plan.events.find((x) => x.kind === 'catch'); if (e) { const tr = plan.fielders[e.by], at = tr.at(e.s); out.push({ tag: c.tag, what: 'air out', n: e.by, routine: c.routine, movedFt: Math.hypot(at.x - tr.start.x, at.y - tr.start.y) }); } }
      const moments = plan.events.filter((e) => e.kind === 'glove').map((e) => ({ s: e.s, n: e.by, what: plan.events.some((x) => x.kind === 'catch' && Math.abs(x.s - e.s) < 1e-6) ? 'catch in the air' : plan.events.some((x) => x.kind === 'drop' && Math.abs(x.s - e.s) < 1e-6) ? 'drop' : 'throw taken' }));
      // every throw leaves from his hand: the hand an instant before the release, the ball an instant after
      for (const sg of plan.segs) if (sg.kind === 'throw') moments.push({ s: sg.t0, n: sg.from, what: 'release', release: sg });
      for (let n = 1; n <= 9; n++) for (const a of plan.fielders[n].acts) if (a.kind === 'field' || a.kind === 'pickup') moments.push({ s: a.t, n, what: a.kind === 'field' ? 'ground ball fielded' : 'picked up', at: a.ball });
      // a hit that falls in: where it lands, every glove is clear of it
      const ft = plan.outcome.firstTouch || {};
      if (plan.outcome.ball === 'fell' && ft.landAt != null) {
        const s = ft.landAt;
        ip.update(s, st.camera);
        const b = plan.ballAt(s - 1e-3);
        let near = Infinity, who = null;
        for (let n = 1; n <= 9; n++) { const f = ip.fielders[n]; if (!f.root.visible) continue; f.root.updateMatrixWorld(true); const g = f.handPoint('glove'); const d = Math.hypot(g.x - b.x, g.y - b.y, g.z - b.z); if (d < near) { near = d; who = n; } }
        out.push({ tag: c.tag, what: 'hit lands', n: who, s: +s.toFixed(3), clearFt: near, ball: [b.x, b.y, b.z].map((v) => +v.toFixed(2)) });
      }
      // every out: a force has the man with the ball on the bag (a foot within FOOT_FT of its middle), a
      // tag has his glove on the runner (within TAG_M of the runner's hips or feet)
      const BASES = [{ x: 0, y: 0.7 }, { x: 63.64, y: 63.64 }, { x: 0, y: 127.28 }, { x: -63.64, y: 63.64 }, { x: 0, y: 0.7 }];
      for (const e of plan.events) if (e.kind === 'out' && e.by && e.base) {
        ip.update(e.s, st.camera);
        const f = ip.fielders[e.by];
        f.root.updateMatrixWorld(true);
        if (e.force) {
          const bag = BASES[e.base];
          const d = Math.min(...['foot_l', 'foot_r', 'ball_l', 'ball_r'].map((j) => { const q = f.jointPoint(j); return Math.hypot(q.x - bag.x, q.y - bag.y); }));
          out.push({ tag: c.tag, what: 'force: foot on the bag', n: e.by, s: +e.s.toFixed(3), footFt: d, base: e.base });
        } else {
          const r = plan.runners.find((x) => x.from === e.runner);
          if (!r || !r.fig || !r.fig.root.visible) { out.push({ tag: c.tag, what: 'tag: glove on the runner', n: e.by, s: +e.s.toFixed(3), tagFt: 99, base: e.base, why: 'runner not drawn' }); continue; }
          r.fig.root.updateMatrixWorld(true);
          const g = f.handPoint('glove');
          const d = Math.min(...['pelvis', 'thigh_l', 'thigh_r', 'calf_l', 'calf_r', 'foot_l', 'foot_r', 'hand_l', 'hand_r', 'spine_02'].map((j) => { const q = r.fig.jointPoint(j); return Math.hypot(q.x - g.x, q.y - g.y, q.z - g.z); }));
          out.push({ tag: c.tag, what: 'tag: glove on the runner', n: e.by, s: +e.s.toFixed(3), tagFt: d, base: e.base });
        }
      }
      for (const m of moments) {
        const k = m.n + ':' + m.s.toFixed(4);
        if (seen.has(k)) continue;
        seen.add(k);
        ip.update(m.release ? m.s - 1e-3 : m.s, st.camera);
        const f = ip.fielders[m.n];
        f.root.updateMatrixWorld(true);
        const g = f.handPoint(m.release ? 'hand' : 'glove');
        let b = m.at ? { ...m.at, z: m.at.z ?? 0.12 } : plan.ballAt(m.s - 1e-3);
        // a release: the ball as drawn an instant after it, against the hand an instant before
        if (m.release) { ip.update(m.s + 1e-3, st.camera); const v = ip.ball.position; b = { x: -v.x / 0.3048, y: v.z / 0.3048, z: v.y / 0.3048 }; }
        const fp = plan.fielders[m.n].at(m.s);
        out.push({ tag: c.tag, what: m.what, n: m.n, s: +m.s.toFixed(3), dFt: Math.hypot(g.x - b.x, g.y - b.y, g.z - b.z), ballZ: +b.z.toFixed(2), bodyToBallFt: +Math.hypot(fp.x - b.x, fp.y - b.y).toFixed(2), glove: [g.x, g.y, g.z].map((v) => +v.toFixed(2)), ball: [b.x, b.y, b.z].map((v) => +v.toFixed(2)) });
      }
      ip.end(st.camera);
    }
    ip.facts = facts0;
    return out;
  }, part);
  rows.push(...got);
  CK.put(i, got);
  process.stdout.write(`\r${Math.min(i + CHUNK, cases.length)} of ${cases.length} cases`);
}
console.log('');
CK.close();
const errs = rows.filter((r) => r.err);
const hits = rows.filter((r) => r.what === 'hit lands');
const outsF = rows.filter((r) => r.footFt != null), outsT = rows.filter((r) => r.tagFt != null);
const airOuts = rows.filter((r) => r.what === 'air out');
const meas = rows.filter((r) => !r.err && r.what !== 'hit lands' && r.what !== 'air out' && r.footFt == null && r.tagFt == null);
const by = {};
for (const r of meas) (by[r.what] ||= []).push(r.dFt * FT);
let fails = 0;
console.log(`\nglove to ball at the moment he takes it (metres; limit ${LIMIT_M})`);
for (const [w, d] of Object.entries(by).sort()) {
  d.sort((a, b) => a - b);
  const q = (x) => d[Math.floor(x * (d.length - 1))].toFixed(3);
  const over = d.filter((x) => x > LIMIT_M).length;
  const held = HELD.includes(w);
  if (held) fails += over;
  console.log(`  ${over ? (held ? 'FAIL' : 'todo') : 'ok  '} ${w.padEnd(20)} ${String(d.length).padStart(7)}  median ${q(0.5)}  90th ${q(0.9)}  99th ${q(0.99)}  worst ${q(1)}  over ${over}`);
}
// the outs: a foot on the bag for a force, the glove on the runner for a tag
for (const [rs, key, lim, name] of [[outsF, 'footFt', FOOT_FT * FT, 'force: foot on bag'], [outsT, 'tagFt', TAG_M, 'tag: glove on runner']]) {
  const d = rs.map((r) => r[key] * FT).sort((a, b) => a - b);
  if (!d.length) continue;
  const over = d.filter((x) => x > lim).length;
  fails += over;
  console.log(`  ${over ? 'FAIL' : 'ok  '} ${name.padEnd(20)} ${String(d.length).padStart(7)}  median ${d[Math.floor(0.5 * (d.length - 1))].toFixed(3)}  90th ${d[Math.floor(0.9 * (d.length - 1))].toFixed(3)}  worst ${d[d.length - 1].toFixed(3)}  over ${lim.toFixed(2)} m: ${over}`);
}
if (SHOW) for (const r of [...outsF.filter((r) => r.footFt > FOOT_FT), ...outsT.filter((r) => r.tagFt * FT > TAG_M)].slice(0, SHOW)) console.log(JSON.stringify(r));
// a hit falls in clear of every glove
const cl = hits.map((r) => r.clearFt * FT).sort((a, b) => a - b);
const tooNear = cl.filter((x) => x < CLEAR_M).length;
fails += tooNear;
if (cl.length) console.log(`  ${tooNear ? 'FAIL' : 'ok  '} ${'hit lands, clear by'.padEnd(20)} ${String(cl.length).padStart(7)}  nearest glove: least ${cl[0].toFixed(3)}  10th ${cl[Math.floor(0.1 * (cl.length - 1))].toFixed(3)}  median ${cl[Math.floor(0.5 * (cl.length - 1))].toFixed(3)}  under ${CLEAR_M}: ${tooNear}`);
for (const e of errs.slice(0, 5)) console.log('  threw:', e.tag, e.err);
// the routine fly share (reported): where the fielders stand (inplay-plan.js alignment) decides it
for (const [name, rs] of [['routine fly share', airOuts.filter((r) => r.routine)], ['every out in the air', airOuts]]) {
  const d = rs.map((r) => r.movedFt).sort((a, b) => a - b);
  if (!d.length) continue;
  const pct = (k) => (100 * d.filter((x) => x <= k).length / d.length).toFixed(1) + '%';
  console.log(`  info ${name.padEnd(20)} ${String(d.length).padStart(7)}  caught within ${ROUTINE_FT} ft of his spot ${pct(ROUTINE_FT)}, within ${2 * ROUTINE_FT} ft ${pct(2 * ROUTINE_FT)}, median run ${d[Math.floor(0.5 * (d.length - 1))].toFixed(1)} ft`);
}
if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify(meas));
if (SHOW) for (const r of meas.sort((a, b) => b.dFt - a.dFt).slice(0, SHOW)) console.log(JSON.stringify({ ...r, dM: +(r.dFt * FT).toFixed(3) }));
console.log(`\n${cases.length} cases, ${meas.length} catches, ${hits.length} hits landing, ${fails} failing${errs.length ? ', ' + errs.length + ' threw' : ''}`);
await browser.close();
server.close();
process.exit(fails || errs.length ? 1 : 0);
