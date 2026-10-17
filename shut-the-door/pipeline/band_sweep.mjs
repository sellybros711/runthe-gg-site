/* The band thresholds, measured on the real packs (for the lead: contract.js
 * owns BANDS, and a change goes through the lead with this evidence).
 *
 *   node shut-the-door/pipeline/band_sweep.mjs [packs...] [--relative]
 *
 * --relative grades lost / (the mean lost over every call in that state): how
 * much of the possible damage the call did, whatever the leverage.
 *
 * For each pack: the points lost by (a) a fastball down the middle on every
 * pitch, over 40 outings, and (b) the closer pool's calls (each closer in
 * data/closers.json, 20 outings each). Then, for a grid of thresholds
 * (green <= g, yellow <= y, orange <= o, red above), the brief's test (heart
 * fastballs mostly orange and red), and the pool's spread. Prints the current
 * bands and the best few candidates.
 */
import { createRequire } from 'module';
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));
const GAME = join(HERE, '..');
const K = require(join(GAME, 'contract.js'));
const R = require(join(GAME, 'rng.js'));
const G = require(join(GAME, 'grade.js'));
const E = require(join(GAME, 'engine.js'));
const P = require(join(GAME, 'pool.js'));

let files = process.argv.slice(2).filter(a => !a.startsWith('--'));
if (!files.length) files = readdirSync(join(GAME, 'data', 'packs')).map(f => join(GAME, 'data', 'packs', f));
const closers = JSON.parse(readFileSync(join(GAME, 'data', 'closers.json'), 'utf8')).closers;

function play(pack, model, seed, chooser) {
  const o = E.createOuting(pack, { seed, mode: 'practice', model });
  let g = 0;
  while (o.status === 'live' && g++ < 200) E.throwPitch(o, chooser(o));
  return o;
}

const REL = process.argv.includes('--relative');
files = files.filter(f => !f.startsWith('--'));
const meanCache = new Map();
function meanLost(model, st) {
  const k = G.stateIndex(model.N, model.M, st.bi, st.b, st.s, st.outs, st.bases, st.margin);
  if (meanCache.has(model) && meanCache.get(model).has(k)) return meanCache.get(model).get(k);
  const best = model.solve(st).hold;
  let sum = 0, n = 0;
  for (const t of model.types) for (let c = 0; c < 25; c++) { sum += (best - model.callValue(st, t, c).hold) * 100; n++; }
  if (!meanCache.has(model)) meanCache.set(model, new Map());
  meanCache.get(model).set(k, sum / n);
  return sum / n;
}
/* the lost of each pitch, absolute or relative to the state's mean lost */
function losses(o, model) {
  return o.grades.map((g, i) => (REL ? g.lost / Math.max(1e-6, meanLost(model, o.before[i])) : g.lost));
}
const data = [];
for (const f of files) {
  const pack = JSON.parse(readFileSync(f, 'utf8'));
  const model = new G.Model(pack);
  const ars = pack.scenario.pitcher.arsenal;
  const hard = ars.filter(a => K.FAMILY_OF[a.type] === 'hard').sort((a, b) => b.usage - a.usage)[0] || ars[0];
  const heart = [], pool = [];
  for (let s = 1; s <= 40; s++) heart.push(...losses(play(pack, model, 5000 + s, () => ({ type: hard.type, cell: 12 })), model));
  closers.forEach((c, ci) => {
    for (let r = 0; r < 20; r++) {
      const policy = R.mulberry32(R.hashSeed(`sweep|${ci}|${r}`));
      pool.push(...losses(play(pack, model, R.hashSeed(`sweep-seed|${ci}|${r}`), o => P.closerCall(c, o, policy)), model));
    }
  });
  data.push({ id: pack.scenario.id, heart, pool });
}

const band = (l, t) => (l <= t[0] ? 0 : l <= t[1] ? 1 : l <= t[2] ? 2 : 3);
function evaluate(t) {
  const rows = data.map(d => {
    const h = [0, 0, 0, 0], p = [0, 0, 0, 0];
    d.heart.forEach(l => h[band(l, t)]++);
    d.pool.forEach(l => p[band(l, t)]++);
    const hn = d.heart.length, pn = d.pool.length;
    return { id: d.id, heartOR: (h[2] + h[3]) / hn, pool: p.map(x => x / pn) };
  });
  const minHeart = Math.min(...rows.map(r => r.heartOR));
  const passHeart = rows.filter(r => r.heartOR > 0.5).length;
  const mean = [0, 1, 2, 3].map(i => rows.reduce((a, r) => a + r.pool[i], 0) / rows.length);
  return { t, rows, minHeart, passHeart, mean };
}
const pc = x => Math.round(x * 100);
function show(e, label) {
  console.log(`\n${label}: green <= ${e.t[0]}, yellow <= ${e.t[1]}, orange <= ${e.t[2]}`);
  console.log(`  heart fastballs mostly orange and red in ${e.passHeart} of ${e.rows.length} packs (lowest ${pc(e.minHeart)}%)`);
  console.log(`  pool calls, mean over packs: green ${pc(e.mean[0])}%, yellow ${pc(e.mean[1])}%, orange ${pc(e.mean[2])}%, red ${pc(e.mean[3])}%`);
  for (const r of e.rows) console.log(`    ${r.id.padEnd(26)} heart o+r ${pc(r.heartOR)}%   pool ${r.pool.map(pc).join('/')}`);
}

if (!REL) show(evaluate(K.BANDS.slice(0, 3).map(b => b.maxLost)), 'current');
const cands = [];
const GS = REL ? [0.05, 0.1, 0.15, 0.2, 0.25] : [0.1, 0.15, 0.2, 0.25, 0.3, 0.4];
const YS = REL ? [0.2, 0.3, 0.4, 0.5] : [0.3, 0.4, 0.5, 0.6, 0.75, 1.0];
const OS = REL ? [0.5, 0.6, 0.75, 1.0, 1.25, 1.5] : [0.8, 1.0, 1.25, 1.5, 2.0, 2.5, 3.0];
for (const g of GS)
  for (const y of YS)
    for (const o of OS) {
      if (!(g < y && y < o)) continue;
      const e = evaluate([g, y, o]);
      // want: every pack passes the heart test; the pool spread near 35/30/22/13
      const target = [0.35, 0.3, 0.22, 0.13];
      const dist = e.mean.reduce((a, m, i) => a + (m - target[i]) ** 2, 0);
      cands.push({ e, ok: e.passHeart === e.rows.length, dist });
    }
cands.sort((a, b) => (b.ok - a.ok) || (a.dist - b.dist));
const tries = process.argv.filter(a => a.startsWith('--try=')).map(a => a.slice(6).split(',').map(Number));
if (tries.length) { tries.forEach(t => show(evaluate(t), 'try')); process.exit(0); }
cands.slice(0, 3).forEach((c, i) => show(c.e, `candidate ${i + 1}`));
