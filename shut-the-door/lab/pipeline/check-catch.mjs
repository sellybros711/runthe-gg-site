/* Every catch in every pack's balls in play, on the posed bodies: the glove on the ball.
 *
 *   node shut-the-door/lab/pipeline/check-catch.mjs              the cases check-inplay plans
 *   node shut-the-door/lab/pipeline/check-catch.mjs --limit N    the first N cases (a quick look)
 *   node shut-the-door/lab/pipeline/check-catch.mjs --show N     print the N worst catches in full
 *   node shut-the-door/lab/pipeline/check-catch.mjs --json FILE  every measured catch, for a closer look
 *
 * check-inplay.mjs holds the plan to the engine (who catches it, where, when). This holds the picture to
 * the plan: the owner saw a pop fly land beside the outfielder who caught it (2026-10-22). So the game
 * page is loaded in Chromium (its own stage, people and fielders, drawing nothing), every case is
 * staged the way the game stages it (inplay.js begin), and at every moment a fielder takes the ball
 * (each 'glove' event: a catch in the air, a throw taken at a bag) the scene is posed at that moment
 * (inplay.js update, every body) and the distance from the glove's pocket (Figure.handPoint) to the ball
 * the plan has there, an instant before, is measured. Every throw is measured at its release too: the
 * throwing hand an instant before against the ball as drawn an instant after. A ground ball fielded or picked up is measured
 * too (the 'field' and 'pickup' moments, the glove against the ball on the ground), as todo until the
 * fielding motion is built (HELD). A hit that falls in must land clear of every glove (CLEAR_M). Over
 * LIMIT_M on a held moment is a failure.
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
const JSON_OUT = process.argv.includes('--json') ? process.argv[process.argv.indexOf('--json') + 1] : null;
export const LIMIT_M = 0.15;
// a hit that falls in lands at least this far from every glove
export const CLEAR_M = 0.5;
// the moments held to LIMIT_M. A ground ball fielded or picked up is measured and printed as todo:
// the fielding motion is the next change (the owner's step 2, 2026-10-22), and it joins this list then
const HELD = ['catch in the air', 'drop', 'throw taken', 'release'];
const FT = 0.3048;

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

const cases = [];
for (const c of inplayCases()) { if (cases.length >= LIMIT) break; cases.push(c); }
const rows = [];
const CHUNK = 400;
for (let i = 0; i < cases.length; i += CHUNK) {
  const part = cases.slice(i, i + CHUNK).map((c) => ({ pr: c.pr, hand: c.hand, tag: `${c.pack} ${c.key}/${c.label} st ${c.st} ball ${JSON.stringify(c.ball)} moves ${JSON.stringify(c.moves)}` }));
  const got = await page.evaluate((part) => {
    const st = window.STD_STAGE.current, ip = st.inplay, out = [];
    const facts0 = ip.facts;
    const ball = st.pitch.ball;
    const stub = { after: { t0: 0 }, f: { at: () => ({ x: 0, y: 1.2, z: 2.6 }) }, ball, overlays: false };
    for (const c of part) {
      ip.facts = { ...facts0, batter: { ...facts0.batter, bats: c.hand } };
      let run;
      try { run = ip.begin(c.pr, stub, {}); } catch (e) { out.push({ tag: c.tag, err: String(e) }); continue; }
      const plan = run.plan, seen = new Set();
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
  process.stdout.write(`\r${Math.min(i + CHUNK, cases.length)} of ${cases.length} cases`);
}
console.log('');
const errs = rows.filter((r) => r.err);
const hits = rows.filter((r) => r.what === 'hit lands');
const meas = rows.filter((r) => !r.err && r.what !== 'hit lands');
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
// a hit falls in clear of every glove
const cl = hits.map((r) => r.clearFt * FT).sort((a, b) => a - b);
const tooNear = cl.filter((x) => x < CLEAR_M).length;
fails += tooNear;
if (cl.length) console.log(`  ${tooNear ? 'FAIL' : 'ok  '} ${'hit lands, clear by'.padEnd(20)} ${String(cl.length).padStart(7)}  nearest glove: least ${cl[0].toFixed(3)}  10th ${cl[Math.floor(0.1 * (cl.length - 1))].toFixed(3)}  median ${cl[Math.floor(0.5 * (cl.length - 1))].toFixed(3)}  under ${CLEAR_M}: ${tooNear}`);
for (const e of errs.slice(0, 5)) console.log('  threw:', e.tag, e.err);
if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify(meas));
if (SHOW) for (const r of meas.sort((a, b) => b.dFt - a.dFt).slice(0, SHOW)) console.log(JSON.stringify({ ...r, dM: +(r.dFt * FT).toFixed(3) }));
console.log(`\n${cases.length} cases, ${meas.length} catches, ${hits.length} hits landing, ${fails} failing${errs.length ? ', ' + errs.length + ' threw' : ''}`);
await browser.close();
server.close();
process.exit(fails || errs.length ? 1 : 0);
