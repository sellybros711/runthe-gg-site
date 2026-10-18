/* The people must not tear or warp as they move.
 *
 *   node shut-the-door/lab/pipeline/check-deform.mjs            the swing and the take
 *   node shut-the-door/lab/pipeline/check-deform.mjs --series   and print every frame
 *
 * Plays the lab scene frame by frame (30 per second) in headless Chromium and, with CPU skinning,
 * fails when, on the batter, catcher or umpire:
 *   a visible skin edge (skin not under a garment) stretches past 1.6x or squashes under 0.6x
 *   its rest length; at the hinges (elbow, wrist, knee, ankle, the skull on the neck), where real
 *   skin stretches over the outside of a full bend and folds on the inside, past 2.5x or under 0.15x;
 *   the fingers are printed, not judged (a gripping knuckle folds flat, and is a few pixels)
 * The garments are measured too and printed, not judged: cloth stretches where cloth would
 * (the crotch seam as the legs part, the armpit as the arm lifts) and only a cloth simulation
 * would hold those to 1.6x.
 *   the shirt's collar moves more than 2 cm off the skin under it (the neck coming away)
 *   a spine, neck or head joint leaves its anatomical limit (twist about its own axis, swing):
 *     each spine segment 15 deg twist and 30 swing, neck and head 40 each, neck plus head 70 twist
 * And the body moving as one (added after the owner's next test, 2026-10-18: "the shoulders and hip
 * movements need to be corrected"):
 *   the width across the deltoids stays within 8% of its bind pose (no collapsed or pinched shoulder)
 *   a planted foot skates no more than 1 cm; the pelvis tilts under 12 deg and travels under 40 cm
 *   the batter's swing is a kinetic chain: the hips' turn peaks before the shoulders', and at foot
 *   strike the shoulders are still closed 30 to 50 deg against the hips
 * It prints the worst frame and bone of each. Written after the owner's phone test (2026-10-18):
 * "the body warps as it swings. The neck almost disconnects from the body."
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
const SERIES = process.argv.includes('--series');
const LIM = { stretch: 1.6, squash: 0.6, creaseStretch: 2.5, creaseSquash: 0.15, collar: 0.02, joint: 1.02,
  width: 0.08, skate: 0.01, tilt: 12, travel: 0.4, sepLo: 30, sepHi: 50 };   // joints are clamped at their limit: 2% is rounding

function loadPlaywright() {
  for (const t of ['playwright', '/opt/node-tools/node_modules/playwright', '/opt/node22/lib/node_modules/playwright']) { try { return require(t); } catch (e) { /* next */ } }
  throw new Error('playwright not found');
}
const CHROME = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((p) => fs.existsSync(p));
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const f = path.join(ROOT, rel);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  const ext = path.extname(f);
  res.writeHead(200, { 'content-type': ext === '.js' ? 'text/javascript' : ext === '.html' ? 'text/html' : ext === '.json' ? 'application/json' : 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const browser = await loadPlaywright().chromium.launch({ executablePath: CHROME, args: ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader'] });
const probe = fs.readFileSync(path.join(HERE, 'deform-probe.js'), 'utf8');
let failed = 0;
for (const [label, q] of [['swing', ''], ['take', 'take=1']]) {
  const page = await browser.newPage({ viewport: { width: 200, height: 300 } });
  page.on('pageerror', (e) => { console.log('page error', String(e)); failed++; });
  await page.goto(`http://127.0.0.1:${server.address().port}/shut-the-door/lab/index.html?${q}&t=0&dpr=1`);
  await page.waitForFunction(() => window.__lab && window.__lab.ready, null, { timeout: 180000 });
  await page.evaluate(probe);
  const r = await page.evaluate((o) => window.__deformProbe(o), { people: ['batter', 'catcher', 'umpire'], t0: 0, t1: 3.4, dt: 1 / 30, series: SERIES });
  for (const [who, x] of Object.entries(r)) {
    const w = x.worst;
    const bad = [];
    if (w.stretch.v > LIM.stretch) bad.push('stretch');
    if (w.squash.v < LIM.squash) bad.push('squash');
    if (w.creaseStretch.v > LIM.creaseStretch) bad.push('crease stretch');
    if (w.creaseSquash.v < LIM.creaseSquash) bad.push('crease squash');
    if (w.collar.v > LIM.collar) bad.push('collar');
    if (w.joint.v > LIM.joint) bad.push('joint');
    const k = x.kin;
    if (1 - k.width.lo.v > LIM.width || k.width.hi.v - 1 > LIM.width) bad.push('shoulder width');
    for (const sd of ['l', 'r']) if (k.feet[sd].skate.v > LIM.skate) bad.push(`foot ${sd} skates`);
    if (k.pelvis.tilt.v > LIM.tilt) bad.push('pelvis tilt');
    if (k.pelvis.travel > LIM.travel) bad.push('pelvis slides');
    const q = k.sequence;
    if (q) {
      if (q.leadMs <= 0) bad.push('shoulders peak before hips');
      if (q.separation < LIM.sepLo || q.separation > LIM.sepHi) bad.push('separation at foot strike');
    }
    failed += bad.length;
    console.log(`${label} ${who}: ${bad.length ? 'FAIL ' + bad.join(', ') : 'ok'}`);
    console.log(`  stretch max ${w.stretch.v.toFixed(2)} at t=${w.stretch.t?.toFixed(2)} (${w.stretch.bone})`);
    console.log(`  squash  min ${w.squash.v.toFixed(2)} at t=${w.squash.t?.toFixed(2)} (${w.squash.bone}${w.squash.at ? ', height ' + w.squash.at[1].toFixed(2) + ' m' : ''})`);
    console.log(`  creases stretch max ${w.creaseStretch.v.toFixed(2)} at t=${w.creaseStretch.t?.toFixed(2)} (${w.creaseStretch.bone}), squash min ${w.creaseSquash.v.toFixed(2)} at t=${w.creaseSquash.t?.toFixed(2)} (${w.creaseSquash.bone})`);
 console.log(`  fingers stretch max ${w.fingerStretch.v.toFixed(2)}, squash min ${w.fingerSquash.v.toFixed(2)} (reported only)`);
    console.log(`  cloth   stretch max ${w.clothStretch.v.toFixed(2)} at t=${w.clothStretch.t?.toFixed(2)}, squash min ${w.clothSquash.v.toFixed(2)} at t=${w.clothSquash.t?.toFixed(2)} (reported only)`);
    console.log(`  collar  gap ${(w.collar.v * 100).toFixed(1)} cm at t=${w.collar.t?.toFixed(2)} (${x.collarVerts} collar vertices)`);
    console.log(`  joints  worst ${(w.joint.v * 100).toFixed(0)}% of limit at t=${w.joint.t?.toFixed(2)}: ${w.joint.bone} twist ${w.joint.twist} swing ${w.joint.swing}`);
    console.log(`  shoulders width ${(k.width.lo.v * 100).toFixed(1)}% (t=${k.width.lo.t.toFixed(2)}) to ${(k.width.hi.v * 100).toFixed(1)}% (t=${k.width.hi.t.toFixed(2)}) of rest; thinnest deltoid ${(k.width.cap.v * 100).toFixed(0)}% (${k.width.cap.side}, t=${k.width.cap.t.toFixed(2)}, reported only)`);
    for (const sd of ['l', 'r']) { const f = k.feet[sd].skate; console.log(`  foot ${sd}  skate ${(f.v * 100).toFixed(1)} cm${f.t != null ? ` at t=${f.t.toFixed(2)} (${f.part}, planted at ${f.from.toFixed(2)})` : ''}`); }
    console.log(`  pelvis  tilt ${k.pelvis.tilt.v.toFixed(1)} deg at t=${k.pelvis.tilt.t.toFixed(2)}, travel ${(k.pelvis.travel * 100).toFixed(0)} cm`);
    if (q) console.log(`  chain   hips peak ${q.hipPeak.v.toFixed(0)} deg/s at t=${q.hipPeak.t.toFixed(3)}, shoulders ${q.shoulderPeak.v.toFixed(0)} deg/s at t=${q.shoulderPeak.t.toFixed(3)} (lead ${q.leadMs.toFixed(0)} ms); foot strike t=${q.strike.toFixed(2)}, separation ${q.separation.toFixed(0)} deg (max ${q.maxSeparation.toFixed(0)}); turn hips ${q.hipTurn.toFixed(0)}, shoulders ${q.shoulderTurn.toFixed(0)}`);
    if (SERIES && x.series) for (const s of x.series) console.log('   ', s.join(' '));
  }
  await page.close();
}
await browser.close();
server.close();
console.log(failed ? `\ncheck-deform: ${failed} problem(s)` : '\ncheck-deform: ok');
process.exit(failed ? 1 : 0);
