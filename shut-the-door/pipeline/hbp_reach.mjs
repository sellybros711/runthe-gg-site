/* How far inside a pitch must cross to reach the batter's body: measured on the 3D hitter.
 *
 *   node shut-the-door/pipeline/hbp_reach.mjs            print the tables (contract.js HBP.REACH, 3d/play.js BODY_FAR)
 *   node shut-the-door/pipeline/hbp_reach.mjs --packs N  the first N packs only
 *
 * Rules 11 (contract.js THE REACH): a pitch is a hit by pitch only when its crossing reaches the
 * batter. The batter is the one the game draws: people.js places him with his feet straddling a
 * point STANCE_X ft off the plate's centre on his side (setupBatter, inplay-plan.js), dressed and built for each hitter of
 * the pack (his height and weight, his helmet, his look), in his take (people.js update). So the game
 * page is loaded in Chromium (its own stage and people, drawing nothing), every hitter of every pack
 * is staged on a taken ball the way the game stages one (stage.js prepare), and at the moment the
 * ball crosses (tPlate, and 0.02 s either side) every vertex of his skinned body is read (helmet and
 * gear included, the bat left out: it is a separate object). For each tenth of his own zone's height
 * (zn, 0 the bottom of his zone, 1 the top) it keeps how near the plate's centre his body comes on
 * his side (catcher's view feet), over a ball's whole flight past him (-1.5 to 3 ft deep).
 *
 * REACH, a band's number: the nearest any hitter's body comes in that band or the band either side
 * (a ball is about a band tall), less a baseball's radius (contract.js BALL_IN), rounded down to
 * the hundredth. A ball whose centre crosses at least that far inside can touch somebody's body at
 * that height; one that crosses short of it cannot touch anybody's.
 * BODY_FAR, the scene's: the furthest any hitter's body front sits in that band, rounded up. A hit
 * by pitch the scene draws crosses at least that far inside, so it reaches whoever is batting.
 *
 * Run 2026-11-05 on the 30 packs, 272 hitters: in his zone's height (zn 0 to 0.8) the nearest body
 * is 2.14 ft from the plate's centre (the front hip and thigh), so a ball reaches it from 2.02 ft;
 * his hands, high in his stance, come to 1.48 ft above the zone (zn 1.0) and the helmet's bill to
 * 1.10 ft (zn 1.5); below the zone his legs and feet, 2.01 ft at the lowest. For comparison, the
 * 2,020 hit by pitches of the 2024 regular season (Baseball Savant, plate_x by stand) crossed a
 * median 1.92 ft inside, 5% under 1.2 ft: a real hitter stands a little nearer the plate than the
 * drawn one.
 * Run 2026-11-06 with his feet 2.82 ft off (2.95 before; his hips' midpoint now 28 in off the inside
 * edge a second before release, Statcast's league average stance): every band 0.13 ft nearer, in his
 * zone's height the nearest body 2.01 ft, a ball reaching it from 1.89 ft. contract.js keeps the
 * 2.95 ft table until the rules that take the new one.
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { pinDay } from '../lab/pipeline/checkpoint.mjs';
const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const K = require(path.join(ROOT, 'shut-the-door', 'contract.js'));
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };

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
page.on('pageerror', (e) => console.error('page error', String(e).slice(0, 300)));
await page.route('**/*', (route) => {
  const u = new URL(route.request().url());
  if (u.hostname === '127.0.0.1') return route.continue();
  if (/fonts\./.test(u.hostname)) return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
  return route.abort();
});
await pinDay(page);
await page.goto(`http://127.0.0.1:${server.address().port}/shut-the-door/`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.STD_STAGE && window.STD_STAGE.current && window.STD_STAGE.current.loaded, null, { timeout: 400000 });
await page.evaluate(() => { window.STD_STAGE.current.renderer.render = () => {}; });

const PACKS = path.join(ROOT, 'shut-the-door', 'data', 'packs');
const files = fs.readdirSync(PACKS).filter((f) => f.endsWith('.json')).sort().slice(0, +(arg('--packs') || 999));
const LO = K.HBP.LO, HI = LO + K.HBP.REACH.length - 1;   // the bands, tenths of zn
const all = [];
for (const file of files) {
  const scn = JSON.parse(fs.readFileSync(path.join(PACKS, file), 'utf8')).scenario;
  const got = await page.evaluate(({ scn, LO, HI }) => {
    const st = window.STD_STAGE.current, FT = 0.3048, out = [];
    st.setScenario(scn);
    for (const b of st.facts.batters) {
      st.setBatter(b);
      const ppl = st.people, B = ppl.batter, side = b.bats === 'L' ? 1 : -1;
      const a0 = scn.pitcher.arsenal[0];
      st.prepare({ n: 1, call: { type: a0.type, cell: 12 }, actual: { x: side * 1.6, zn: 0.5 }, actualCell: side > 0 ? 14 : 10, velo: a0.velo || 90,
        batter: 'take', result: 'ball', inPlay: null, countBefore: { b: 0, s: 0 }, count: { b: 1, s: 0 }, outs: 0, bases: 0, runnerMoves: [], runs: 0, paOver: false, drawn: null });
      const pt = st.pitch, near = {}, v = B.root.position.clone();
      for (const dt of [-0.02, 0, 0.02]) {
        ppl.update(pt.tPlate + dt);
        B.root.updateMatrixWorld(true);
        B.root.traverse((o) => {
          if (!o.isMesh || !o.visible || !o.geometry || !o.geometry.attributes.position) return;
          const n = o.geometry.attributes.position.count;
          for (let i = 0; i < n; i++) {
            if (o.isSkinnedMesh) o.getVertexPosition(i, v); else v.fromBufferAttribute(o.geometry.attributes.position, i);
            v.applyMatrix4(o.matrixWorld);
            const ins = side * (-v.x / FT), deep = v.z / FT, zn = (v.y / FT - b.szBot) / (b.szTop - b.szBot);
            if (deep < -1.5 || deep > 3) continue;
            const band = Math.max(LO, Math.min(HI, Math.floor(zn * 10)));
            if (!(band in near) || ins < near[band]) near[band] = ins;
          }
        });
      }
      out.push({ id: b.id, bats: b.bats, near });
    }
    return out;
  }, { scn, LO, HI });
  for (const g of got) all.push({ pack: file, ...g });
  console.error(`${file}: ${got.length} hitters`);
}
await browser.close();
server.close();

const BALL_FT = K.BALL_IN / 12;
const reach = [], far = [];
const mn = (b) => Math.min(...all.map((h) => h.near[b]).filter((x) => x != null));
for (let b = LO; b <= HI; b++) {
  const m = Math.min(mn(b), b > LO ? mn(b - 1) : Infinity, b < HI ? mn(b + 1) : Infinity);
  reach.push(Math.floor((m - BALL_FT) * 100) / 100);
  far.push(Math.ceil(Math.max(...all.map((h) => h.near[b]).filter((x) => x != null)) * 100) / 100);
}
console.log(JSON.stringify({ hitters: all.length, packs: files.length, LO, REACH: reach, BODY_FAR: far }));
const same = JSON.stringify(reach) === JSON.stringify(K.HBP.REACH);
console.log(same ? 'contract.js HBP.REACH matches' : 'contract.js HBP.REACH differs: ' + JSON.stringify(K.HBP.REACH));
