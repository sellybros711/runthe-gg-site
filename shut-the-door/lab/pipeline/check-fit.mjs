/* The headgear must be worn: on the head, not floating, not in it, and fixed to it.
 *
 *   node shut-the-door/lab/pipeline/check-fit.mjs            every hitter of every pack
 *   node shut-the-door/lab/pipeline/check-fit.mjs --quick    the first left and right handed hitter of one pack
 *
 * Plays the game's own 3D mound (3d/stage.js) in headless Chromium, without drawing: for every pack
 * in data/packs, every hitter in it (his height, weight and side, so every build the game shows),
 * and every kind of pitch result (the swing, the take, the check, the flinch from a hit by pitch,
 * fouls, balls in play), it poses each frame (10 a second, to the end of the play) and measures
 * each worn piece (3d/headgear.js fitNow) against the skin the head bone carries in that frame:
 *   the largest gap from the piece's resting surface (the padding, the mask's pads, the cap's
 *   band, the harness) to the skin under it stays under 6 mm (it rests on the head, it does not
 *   float), nothing goes into the head by more than 3 mm, and the piece's place on the head bone
 *   never changes between frames (no lag, no slide).
 * The batting helmet is measured for every hitter; the catcher's helmet and mask and the umpire's
 * cap and mask for the first left and right handed hitter of each pack (they do not change with
 * the hitter's build; the umpire's slot follows his side). Written after the owner's phone test
 * (2026-10-19): "the helmets ... look like they are floating".
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const QUICK = process.argv.includes('--quick');
const GAP = 0.006, DEEP = 0.003;

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

let fails = 0, worst = { gap: -1, deep: 1 };
for (const file of QUICK ? packs.slice(-1) : packs) {
  const scn = JSON.parse(fs.readFileSync(path.join(ROOT, 'shut-the-door', 'data', 'packs', file), 'utf8')).scenario;
  const r = await page.evaluate(async ({ scn, quick, GAP, DEEP }) => {
    // the very module the stage loaded (its URL, version and all)
    const HG = await import(performance.getEntriesByType('resource').map((e) => e.name).find((n) => /\/3d\/headgear\.js/.test(n)));
    const st = window.STD_STAGE.current, C = window.STD_CONTRACT;
    st.setScenario(scn);
    const plays = [
      ['ball', 'take', 3, { b: 0, s: 0 }, null, { x: 1.4, zn: 0.5 }],
      ['ball', 'take', 20, { b: 1, s: 0 }, null, { x: 0.2, zn: -1.1 }],
      ['ball', 'take', 9, { b: 1, s: 2 }, null, { x: 0.8, zn: -0.15 }],
      ['called_strike', 'take', 18, { b: 0, s: 0 }, null, { x: 0.5, zn: 0.2 }],
      ['swinging_strike', 'swing', 22, { b: 0, s: 1 }, null, { x: 0.1, zn: 0.0 }],
      ['foul', 'swing', 7, { b: 1, s: 1 }, { bb: 'popup', ev: 70, la: 60, spray: 0 }, { x: 0.05, zn: 0.8 }],
      ['foul', 'swing', 11, { b: 1, s: 1 }, { bb: 'ground', ev: 92, la: 4, spray: -44 }, { x: -0.3, zn: 0.4 }],
      ['foul_tip', 'swing', 12, { b: 2, s: 1 }, null, { x: 0.0, zn: 0.6 }],
      ['in_play', 'swing', 17, { b: 0, s: 0 }, { bb: 'ground', ev: 95, la: -6, spray: 12 }, { x: 0.1, zn: 0.3 }],
      ['in_play', 'swing', 12, { b: 0, s: 0 }, { bb: 'line', ev: 104, la: 14, spray: -20 }, { x: 0.0, zn: 0.5 }],
      ['in_play', 'swing', 7, { b: 0, s: 0 }, { bb: 'fly', ev: 99, la: 31, spray: 25 }, { x: 0.0, zn: 0.8 }],
      ['in_play', 'swing', 7, { b: 0, s: 0 }, { bb: 'popup', ev: 80, la: 58, spray: 5 }, { x: 0.1, zn: 0.9 }],
      ['hit_by_pitch', 'take', 14, { b: 0, s: 0 }, null, { x: 0, zn: 0.4 }],
    ];
    const firstL = scn.batters.find((b) => b.bats === 'L'), firstR = scn.batters.find((b) => b.bats === 'R');
    const hitters = quick ? [firstL, firstR].filter(Boolean) : scn.batters;
    const out = [];
    for (const b of hitters) {
      st.setBatter(b);
      const P = st.people;
      const pieces = [['helmet', P.batter, P.batter.helmet]];
      if (b === firstL || b === firstR) pieces.push(['catcher helmet', P.catcher, P.catcher.helmet], ['umpire cap', P.umpire, P.umpire.cap], ['umpire mask', P.umpire, P.umpire.mask]);
      const acc = Object.fromEntries(pieces.map(([n]) => [n, { gap: -1, deep: 1, rigid: true, frames: 0, at: null }]));
      for (const [i, [result, batter, cell, countBefore, inPlay, at]] of plays.entries()) {
        const a = scn.pitcher.arsenal[i % scn.pitcher.arsenal.length];
        const x = result === 'hit_by_pitch' ? (b.bats === 'L' ? 1 : -1) * 1.55 : at.x;
        const pr = { n: i + 1, call: { type: a.type, cell }, actual: { x, zn: at.zn }, actualCell: C.cellAt(x, at.zn), velo: a.velo, batter, result,
          inPlay: inPlay && { ...inPlay, result: 'out', text: 'out' }, countBefore, count: countBefore, outs: 0, bases: 0, runnerMoves: [], runs: 0, paOver: false };
        const { tEnd } = st.prepare(pr);
        for (let t = 0; t <= tEnd; t += 0.1) {
          st.pose(t);
          for (const [n, p, g] of pieces) {
            const f = HG.fitNow(p, g), A = acc[n];
            if (!f.n) continue;
            A.frames++;
            if (f.maxGap > A.gap) { A.gap = f.maxGap; A.gapAt = `${result}${inPlay ? ' ' + inPlay.bb : ''} t=${t.toFixed(1)} at ${f.worstAt}`; }
            if (f.minGap < A.deep) { A.deep = f.minGap; A.deepAt = `${result}${inPlay ? ' ' + inPlay.bb : ''} t=${t.toFixed(1)} at ${f.deepAt}`; }
            if (!f.rigid) A.rigid = false;
          }
        }
      }
      out.push({ id: b.id, name: b.name, bats: b.bats, heightIn: st.facts.batter.heightIn, weightLb: st.facts.batter.weightLb, acc });
    }
    return out;
  }, { scn, quick: QUICK, GAP, DEEP });
  for (const h of r) {
    for (const [n, A] of Object.entries(h.acc)) {
      const ok = A.frames > 0 && A.gap < GAP && A.deep > -DEEP && A.rigid;
      if (!ok) fails++;
      worst.gap = Math.max(worst.gap, A.gap); worst.deep = Math.min(worst.deep, A.deep);
      console.log(`${ok ? 'ok  ' : 'FAIL'} ${file.replace('.json', '')} ${h.name} (${h.bats}, ${h.heightIn ?? '-'} in, ${h.weightLb ?? '-'} lb) ${n}: gap ${(A.gap * 1000).toFixed(1)} mm (${A.gapAt}), into ${(Math.max(0, -A.deep) * 1000).toFixed(1)} mm (${A.deepAt}), ${A.rigid ? 'fixed to the head' : 'MOVED on the head'}, ${A.frames} frames`);
    }
  }
}
console.log(`\nworst gap ${(worst.gap * 1000).toFixed(1)} mm (limit ${GAP * 1000}), deepest ${(Math.max(0, -worst.deep) * 1000).toFixed(1)} mm (limit ${DEEP * 1000})`);
if (errors.length) { console.log('page errors: ' + errors.join(' | ')); fails++; }
console.log(fails ? `check-fit: ${fails} FAILED` : 'check-fit: ok');
await browser.close();
server.close();
process.exit(fails ? 1 : 0);
