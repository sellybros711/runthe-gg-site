/* Every swing the engine says met the ball, on the posed hitter: the ball on the bat.
 *
 *   node shut-the-door/lab/pipeline/check-contact.mjs              every pack's cases and the grid
 *   node shut-the-door/lab/pipeline/check-contact.mjs --quick      the grid alone, on two packs
 *   node shut-the-door/lab/pipeline/check-contact.mjs --show N     print the N worst cases in full
 *   node shut-the-door/lab/pipeline/check-contact.mjs --json FILE  every measured case
 *
 * The owner (2026-10-23): "I threw a low pitch, batter swung high and it said foul ball." So the game
 * page is loaded in Chromium (its own stage and people, drawing nothing) and every pitch the engine
 * can say was hit is staged the way the game stages it (stage.js prepare, people.js setPlay), then
 * the hitter is posed at the moment the ball is met (people.js update at tPlate + meetBall) and the
 * ball is measured against the bat as it is drawn (gear3d.js bat: its real radius along its length).
 *
 * The cases: every foul, foul tip, swinging strike and ball in play in every pack (the pack's own
 * batted ball, launch and spray, its pitch and speed, a hitter of the pack in turn), each put at a
 * point of GRID in turn (the packs do not carry where a pitch crossed). And the grid itself: every
 * point of GRID (the zone and the chase round it, catcher's view) for a hitter of each side and each
 * of the three swings, as a grounder, a liner, a fly, a pop up, a foul pulled, a foul back, a foul
 * tip and a swing and a miss.
 *
 * GAP: from the ball's surface to the bat's surface (0 is touching; under 0 the ball is into the
 * wood). Fails when:
 *   a ball in play is more than LIM.play from the barrel (21 in out from the knob to the end)
 *   a foul is more than LIM.foul from the bat, a foul tip more than LIM.tip
 *   a swing and a miss comes nearer than LIM.miss anywhere through the swing
 *   a ball met sinks more than LIM.into into the wood
 *   the batted ball's first moment is not where it was met (FIRST m)
 * Printed beside it: where on the bat it was met (inches from the sweet spot, 28 in up) and the
 * sweet spot's speed then, by height band (low, middle, high in his zone) and by his side.
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? +process.argv[i + 1] : d; };
const QUICK = process.argv.includes('--quick'), SHOW = arg('--show', 0);
const JSON_OUT = process.argv.includes('--json') ? process.argv[process.argv.indexOf('--json') + 1] : null;
export const LIM = { play: 0.05, foul: 0.05, tip: 0.03, miss: 0.15, into: 0.03 };
const FIRST = 0.01;
// catcher's view feet: x across the plate, zn up the hitter's zone (0 its bottom, 1 its top)
const GX = [-1.5, -1.1, -0.75, -0.4, 0, 0.4, 0.75, 1.1, 1.5];
const GZ = [-0.35, -0.1, 0.15, 0.4, 0.6, 0.85, 1.1, 1.35];
const GRID = GZ.flatMap((zn) => GX.map((x) => ({ x, zn })));
// the grid's batted balls: [result, bb, ev, la, spray] (spray is pulled for a right handed hitter
// at negative degrees; the case turns it for a lefty)
const KINDS = [
  ['in_play', 'ground', 92, -8, -15], ['in_play', 'line', 101, 14, 5], ['in_play', 'fly', 97, 32, 18], ['in_play', 'popup', 78, 58, -4],
  ['foul', 'ground', 88, 6, -50], ['foul', 'popup', 72, 62, 0], ['foul_tip', null, null, null, null], ['swinging_strike', null, null, null, null],
];

function loadPlaywright() {
  for (const t of ['playwright', '/opt/node-tools/node_modules/playwright', '/opt/node22/lib/node_modules/playwright']) { try { return require(t); } catch (e) { /* next */ } }
  throw new Error('playwright not found');
}
const CHROME = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium'].find((p) => fs.existsSync(p));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary' };
const server = http.createServer((req, res) => {
  let rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  const f = path.join(ROOT, rel);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));

const PACKS = path.join(ROOT, 'shut-the-door', 'data', 'packs');
let packs = fs.readdirSync(PACKS).filter((f) => f.endsWith('.json')).sort();
if (QUICK) packs = [packs[0], packs[packs.length - 1]];
const browser = await loadPlaywright().chromium.launch({ executablePath: CHROME, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
await page.goto(`http://127.0.0.1:${server.address().port}/shut-the-door/`);
await page.waitForFunction(() => window.STD_STAGE && window.STD_STAGE.current && window.STD_STAGE.current.loaded, null, { timeout: 400000 });
await page.evaluate(() => { window.STD_STAGE.current.renderer.render = () => {}; });

// FNV-1a: a pack's ball goes to a grid point by its id, the same every run
const hashId = (s) => { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };

const rows = [];
const covered = new Set();
for (const [pi, file] of packs.entries()) {
  const pack = JSON.parse(fs.readFileSync(path.join(PACKS, file), 'utf8'));
  const scn = pack.scenario, bats = scn.batters, ars = scn.pitcher.arsenal;
  // the pack's own cases, by hitter (each hitter is dressed once)
  const byHitter = bats.map(() => []);
  let n = 0;
  if (!QUICK) for (const p of pack.pitches) {
    const [id, velo, result, bb, ev, la, spray] = p;
    if (!['foul', 'foul_tip', 'in_play', 'swinging_strike'].includes(result)) continue;
    const h = hashId(id);
    // a swing and a miss is measured through the whole swing: one in four of them (they are many)
    if (result === 'swinging_strike' && h % 4) continue;
    const at = GRID[h % GRID.length];
    byHitter[n++ % bats.length].push({ src: 'pack', result, velo, type: ars[(h >>> 8) % ars.length].type, at, inPlay: result === 'in_play' || (result === 'foul' && la != null) ? { bb, ev, la, spray, result: 'out', text: 'out' } : null, id });
  }
  // the grid: the first hitter of each side and swing not yet covered by an earlier pack
  const lookOf = await page.evaluate((scn) => { const st = window.STD_STAGE.current; st.setScenario(scn); return st.facts.batters.map((b) => b.swing); }, scn);
  bats.forEach((b, bi) => {
    const k = b.bats + lookOf[bi];
    if (covered.has(k)) return;
    covered.add(k);
    for (const at of GRID) for (const [result, bb, ev, la, spray] of KINDS) {
      byHitter[bi].push({ src: 'grid', result, velo: ars[0].velo, type: ars[0].type, at, inPlay: bb ? { bb, ev, la, spray: b.bats === 'L' ? -spray : spray, result: 'out', text: 'out' } : null, id: null });
    }
  });
  for (const [bi, cases] of byHitter.entries()) {
    if (!cases.length) continue;
    const got = await page.evaluate(({ b, cases }) => {
      const st = window.STD_STAGE.current, C = window.STD_CONTRACT;
      st.setBatter(b);
      const ppl = st.people, B = ppl.batter;
      // the batter alone is posed (the catcher and umpire are not measured)
      const keep = [ppl.catcher, ppl.umpire];
      ppl.catcher = null; ppl.umpire = null;
      const IN = 0.0254, R_BALL = 0.0366, SWEET = 28 * IN;
      const PROF = [[0, 0], [0.62, 0], [0.66, 0.15], [0.56, 0.32], [0.47, 0.42], [0.47, 9], [0.5, 13], [0.62, 17], [0.9, 21], [1.18, 24], [1.28, 27], [1.3, 31], [1.3, 33.4], [1.2, 33.85], [0.9, 34]];
      const radius = (y) => { const yi = y / IN; for (let i = 1; i < PROF.length; i++) if (yi <= PROF[i][1]) { const [r0, y0] = PROF[i - 1], [r1, y1] = PROF[i]; return (r0 + (r1 - r0) * (yi - y0) / Math.max(1e-6, y1 - y0)) * IN; } return 0.9 * IN; };
      const up = B.bat.position.clone().set(0, 1, 0);   // (three.js is the page's own module)
      // the ball's surface to the bat's surface, over the bat from y0 to y1 (m out from the knob)
      const gapTo = (ball, y0, y1) => {
        const knob = B.bat.position, ax = up.clone().applyQuaternion(B.bat.quaternion);
        let best = { gap: Infinity, y: 0 };
        for (let y = y0; y <= y1 + 1e-9; y += 0.004) {
          const d = ball.distanceTo(knob.clone().addScaledVector(ax, y)) - radius(y) - R_BALL;
          if (d < best.gap) best = { gap: d, y };
        }
        return best;
      };
      const out = [];
      for (const c of cases) {
        const cell = C.cellAt(c.at.x, c.at.zn);
        const pr = { n: 1, call: { type: c.type, cell }, actual: { x: c.at.x, zn: c.at.zn }, actualCell: cell, velo: c.velo, batter: 'swing', result: c.result,
          inPlay: c.inPlay, countBefore: { b: 1, s: 1 }, count: { b: 1, s: 1 }, outs: 0, bases: 0, runnerMoves: [], runs: 0, paOver: false, drawn: c.id ? { id: c.id } : null };
        st.prepare(pr);
        const pt = st.pitch, m = st.m;
        const row = { poses: B.aimPoses, err: B.aimErr, aim: B.aim && [B.aim.drop, B.aim.side, B.aim.lean, B.aim.dip, B.aim.yaw, B.aim.hands.length(), B.aim.shift, B.aim.yT].map((v) => +v.toFixed(2)), src: c.src, result: c.result, bb: c.inPlay ? c.inPlay.bb : null, bats: b.bats, swing: B.clip.replace(/R$/, ''), clip: B.clip, x: c.at.x, zn: c.at.zn, id: c.id };
        if (c.result === 'swinging_strike') {
          // the nearest the bat comes to the ball through the swing
          let g = Infinity, at = 0;
          for (let t = pt.tPlate - 0.16; t <= pt.tPlate + 0.06; t += 1 / 240) {
            ppl.update(t);
            const r = gapTo(pt.pointAt(t - pt.tRel), 0, 34 * IN);
            if (r.gap < g) { g = r.gap; at = t - pt.tPlate; }
          }
          row.gap = g; row.at = at;
        } else {
          const tMeet = pt.tPlate + (B.meetBall ?? m.contactShift);
          ppl.update(tMeet);
          const ball = pt.pointAt(tMeet - pt.tRel);
          const r = gapTo(ball, c.result === 'in_play' ? 21 * IN : 0, 34 * IN);
          row.gap = r.gap; row.fromSweet = (r.y - SWEET) / IN;
          // the sweet spot's speed there (mph)
          const ax = up.clone().applyQuaternion(B.bat.quaternion), s0 = B.bat.position.clone().addScaledVector(ax, SWEET);
          ppl.update(tMeet + 1 / 240);
          const ax1 = up.clone().applyQuaternion(B.bat.quaternion), s1 = B.bat.position.clone().addScaledVector(ax1, SWEET);
          row.mph = s1.distanceTo(s0) * 240 * 2.23694;
          // the batted ball's first moment is where it was met
          if (pt.after) {
            const t0 = pt.tRel + pt.after.t0;
            row.first = Math.abs(t0 - tMeet) * 1000 + pt.ballAt(pt.after.t0 + 1e-4).distanceTo(ball);
          }
        }
        out.push(row);
      }
      ppl.catcher = keep[0]; ppl.umpire = keep[1];
      return out;
    }, { b: bats[bi], cases });
    rows.push(...got);
    process.stdout.write(`\r${file} ${rows.length} cases   `);
  }
}
console.log('');

const band = (r) => (r.zn < 1 / 3 ? 'low' : r.zn > 2 / 3 ? 'high' : 'middle');
const q = (d, x) => d[Math.floor(x * (d.length - 1))];
const stat = (d) => { d = [...d].sort((a, b) => a - b); return d.length ? `${String(d.length).padStart(6)}  median ${q(d, 0.5).toFixed(3)}  90th ${q(d, 0.9).toFixed(3)}  worst ${d[d.length - 1].toFixed(3)}` : '     0'; };
const statMiss = (d) => { d = [...d].sort((a, b) => a - b); return d.length ? `${String(d.length).padStart(6)}  nearest ${d[0].toFixed(3)}  10th ${q(d, 0.1).toFixed(3)}  median ${q(d, 0.5).toFixed(3)}` : '     0'; };
let fails = 0;
const groups = [['in play', 'in_play', LIM.play], ['foul', 'foul', LIM.foul], ['foul tip', 'foul_tip', LIM.tip]];
console.log(`\nball to bat at the moment it is met (gap, surface to surface, metres)`);
for (const [name, res, lim] of groups) {
  const rs = rows.filter((r) => r.result === res);
  const over = rs.filter((r) => r.gap > lim).length, into = rs.filter((r) => r.gap < -LIM.into).length;
  fails += over + into;
  console.log(`  ${over || into ? 'FAIL' : 'ok  '} ${name.padEnd(9)} ${stat(rs.map((r) => r.gap))}  over ${lim}: ${over}  into the wood past ${LIM.into}: ${into}`);
  for (const bn of ['low', 'middle', 'high']) for (const s of ['L', 'R']) {
    const g = rs.filter((r) => band(r) === bn && r.bats === s);
    if (g.length) console.log(`         ${(bn + ' ' + s).padEnd(9)} ${stat(g.map((r) => r.gap))}`);
  }
}
const ms = rows.filter((r) => r.result === 'swinging_strike');
const near = ms.filter((r) => r.gap < LIM.miss).length;
fails += near;
console.log(`  ${near ? 'FAIL' : 'ok  '} ${'whiff'.padEnd(9)} ${statMiss(ms.map((r) => r.gap))}  under ${LIM.miss}: ${near}`);
for (const bn of ['low', 'middle', 'high']) for (const s of ['L', 'R']) {
  const g = ms.filter((r) => band(r) === bn && r.bats === s);
  if (g.length) console.log(`         ${(bn + ' ' + s).padEnd(9)} ${statMiss(g.map((r) => r.gap))}`);
}
const ip = rows.filter((r) => r.result === 'in_play');
console.log(`\nwhere on the bat a ball in play is met (inches from the sweet spot, + toward the end): ${stat(ip.map((r) => Math.abs(r.fromSweet)))}`);
console.log(`the sweet spot's speed at contact (mph):  ${stat(rows.filter((r) => r.mph != null).map((r) => r.mph))}`);
const po = rows.filter((r) => r.poses != null).map((r) => r.poses).sort((a, b) => a - b);
if (po.length) console.log(`the aim's solve, poses per pitch (people.js aimSwing): median ${q(po, 0.5)}  90th ${q(po, 0.9)}  99th ${q(po, 0.99)}  worst ${po[po.length - 1]}`);
const fr = rows.filter((r) => r.first != null), badFirst = fr.filter((r) => r.first > FIRST).length;
fails += badFirst;
console.log(`${badFirst ? 'FAIL' : 'ok  '} the batted ball leaves from where it was met: ${fr.length} cases, ${badFirst} off by over ${FIRST} m`);
if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify(rows));
if (SHOW) {
  const lim = (r) => (r.result === 'swinging_strike' ? LIM.miss - r.gap : r.gap - LIM[r.result === 'in_play' ? 'play' : r.result === 'foul' ? 'foul' : 'tip']);
  for (const r of [...rows].sort((a, b) => lim(b) - lim(a)).slice(0, SHOW)) console.log(JSON.stringify(r));
}
for (const e of errors.slice(0, 5)) console.log('page error:', e);
console.log(`\n${rows.length} cases, ${fails} failing${errors.length ? ', ' + errors.length + ' page errors' : ''}`);
await browser.close();
server.close();
process.exit(fails || errors.length ? 1 : 0);
