/* What would flip if the engine scaled the vertical miss and the call's edge distance by each
 * batter's own zone height (szTop - szBot) instead of the pack's kernelZoneFt: the same draws, the same
 * aim, his ordinary pitch (no meter). A report for the owner, not a check.
 *   node shut-the-door/pipeline/zone_flips.cjs shut-the-door
 */
const fs = require('fs'), path = require('path');
const ROOT = process.argv[2];
const K = require(path.join(ROOT, 'contract.js')), R = require(path.join(ROOT, 'rng.js'));
const N = 400;
let tot = { n: 0, cell: 0, call: 0, either: 0 };
const rows = [];
for (const f of fs.readdirSync(path.join(ROOT, 'data/packs')).sort()) {
  const pack = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/packs', f), 'utf8'));
  const sc = pack.scenario, Z = pack.kernelZoneFt;
  const rng = R.mulberry32(R.hashSeed('sz-' + sc.id));
  let n = 0, cell = 0, call = 0, either = 0, zmin = 9, zmax = 0;
  for (const b of sc.batters) {
    const zb = b.szTop - b.szBot; zmin = Math.min(zmin, zb); zmax = Math.max(zmax, zb);
    for (const a of sc.pitcher.arsenal) for (let c = 0; c < 25; c++) for (let i = 0; i < N; i++) {
      const d = R.pitchDraws(rng), t = K.aimPoint(c, null), s = a.sigmaFt;
      const A = { x: t.x + d.missX * s, zn: t.zn + d.missZ * s / Z }, B = { x: A.x, zn: t.zn + d.missZ * s / zb };
      const ca = K.cellAt(A.x, A.zn), cb = K.cellAt(B.x, B.zn);
      const ka = d.library < K.calledStrikeP(K.zoneDist(A.x, A.zn, Z)), kb = d.library < K.calledStrikeP(K.zoneDist(B.x, B.zn, zb));
      n++; if (ca !== cb) cell++; if (ka !== kb) call++; if (ca !== cb || ka !== kb) either++;
    }
  }
  rows.push(`${sc.id.padEnd(26)} zone ${Z} ft, hitters ${zmin.toFixed(2)}-${zmax.toFixed(2)} ft: ${n} pitches, cell ${(100 * cell / n).toFixed(2)}%, call ${(100 * call / n).toFixed(2)}%, either ${(100 * either / n).toFixed(2)}%`);
  tot.n += n; tot.cell += cell; tot.call += call; tot.either += either;
}
console.log(rows.join('\n'));
console.log(`all: ${tot.n} pitches, cell ${(100 * tot.cell / tot.n).toFixed(2)}%, call ${(100 * tot.call / tot.n).toFixed(2)}%, either ${(100 * tot.either / tot.n).toFixed(2)}%`);
