/* Where each hitter's fielders shade, from his own batted balls in the packs (3d/shade-data.js).
 *
 *   node shut-the-door/lab/pipeline/build-shade.mjs           write 3d/shade-data.js
 *   node shut-the-door/lab/pipeline/build-shade.mjs --check   fail if it is not what the packs give
 *   node shut-the-door/lab/pipeline/build-shade.mjs --list    print every hitter's numbers
 *
 * The data. A pack's library points each outcome at a real pitch, his own where he has one (tier
 * 'batter': his own pitches against this hand, that season and the one before; README, the tiers). So
 * the balls in play of tier 'batter' in a hitter's library are his own real batted balls, with Statcast
 * (or PITCHf/x) spray, exit velocity and launch angle, and they are the balls the engine draws for him.
 * The league's are the tier 'league' balls (that pitch type, a pitcher of this hand, a hitter of this side).
 *
 * The numbers, per hitter with profileTier 'batter' (a hitter without his own profile, and every proxy
 * spot, stands in the standard alignment, inplay-plan.js spots):
 *   g  his ground balls' mean spray against the league's for his side, degrees (the infield turns by it)
 *   a  his fly balls' and line drives' mean spray against the league's, degrees (the outfield turns by it)
 *   d  his fly balls' and line drives' mean carry against the league's, feet (contract.js carryOf,
 *      the engine's own Statcast fit; the outfield plays deeper or shallower by it)
 * Each is shrunk toward the league (0) by how many balls he has, empirical Bayes: the spread of the
 * true differences between hitters (tau^2, the variance of the raw differences less their sampling
 * variance) against his own sampling variance (the pooled spread of one ball, over his count). Both are
 * measured here from the packs; no constant is chosen by hand. A hitter with few balls moves little.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const GAME = path.resolve(HERE, '..', '..');
const PACKS = path.join(GAME, 'data', 'packs');
const OUT = path.join(GAME, '3d', 'shade-data.js');
const { carryOf } = require(path.join(GAME, 'contract.js'));
const { wallDist } = await import('../../3d/inplay-plan.js');
const KEYS_IP = ['single', 'double', 'triple', 'home_run', 'error', 'out_ground', 'out_line', 'out_fly', 'out_popup'];
const TIER = { batter: 0, similar: 1, league: 2 };

/** Every pack's hitters: his own balls and the league's balls for his side. */
function gather() {
  const hitters = [], league = { L: { g: [], a: [], d: [], o: [] }, R: { g: [], a: [], d: [], o: [] } };
  for (const f of fs.readdirSync(PACKS).filter((x) => x.endsWith('.json')).sort()) {
    const pack = JSON.parse(fs.readFileSync(path.join(PACKS, f), 'utf8'));
    const id = pack.scenario.id, keys = pack.keys, P = pack.pitches, bats = pack.scenario.batters;
    const coef = pack.runners && pack.runners.dist ? pack.runners.dist.coef : null;
    const lgSeen = new Set();
    pack.library.forEach((lib, bi) => {
      if (bi >= bats.length) return;
      const b = bats[bi], own = new Set();
      for (const e of Object.values(lib)) for (const row of e.x) row.forEach((ref, k) => {
        if (ref == null || ref < 0 || !KEYS_IP.includes(keys[k])) return;
        const i = Math.floor(ref / 3), t = ref % 3;
        if (t === TIER.batter) own.add(i);
        else if (t === TIER.league && !lgSeen.has(b.bats + i)) { lgSeen.add(b.bats + i); add(league[b.bats], P[i], coef); }
      });
      const mine = { g: [], a: [], d: [], o: [] };
      for (const i of [...own].sort((x, y) => x - y)) add(mine, P[i], coef);
      hitters.push({ pack: id, id: String(b.id), name: b.name, bats: b.bats, tier: b.profileTier, mine });
    });
  }
  return { hitters, league };
}
function add(to, p, coef) {
  const [, , , bb, ev, la, spray] = p;
  if (spray == null) return;
  if (bb === 'ground') to.g.push(spray);
  else if (bb === 'fly' || bb === 'line') {
    to.a.push(spray);
    const c = carryOf(ev, la, coef);
    if (c != null) to.d.push(c);
    // the outfield's balls: fair, carried past the infield dirt (its arc is 155 ft out to centre) and short
    // of the wall (a home run is nobody's). A fly ball with no tracked speed (2010-2012) counts for its
    // spray only (carry null)
    if (Math.abs(spray) <= 45 && (c == null ? bb === 'fly' : c >= 155 && c < wallDist(spray))) to.o.push([spray, c]);
  }
}

/** Three outfielders for weighted balls [[spray, carry, w]]: the 1D three-median of the spray (each
    fielder the weighted median of the balls nearer him than the others, Lloyd's steps from the thirds),
    each at the weighted median carry of his balls, that weight wd for a league ball. */
function outfield(balls) {
  const pts = balls.slice().sort((x, y) => x[0] - y[0]);
  const W = pts.reduce((s, p) => s + p[2], 0);
  const wmed = (arr, k, wi) => { const a = arr.slice().sort((x, y) => x[k] - y[k]); const t = a.reduce((s, p) => s + p[wi], 0) / 2; let acc = 0; for (const p of a) { acc += p[wi]; if (acc >= t) return p[k]; } return a[a.length - 1][k]; };
  const q = (f) => { let acc = 0; for (const p of pts) { acc += p[2]; if (acc >= f * W) return p[0]; } return pts[pts.length - 1][0]; };
  let c = [q(1 / 6), q(1 / 2), q(5 / 6)];
  let parts = [];
  for (let it = 0; it < 50; it++) {
    parts = [[], [], []];
    for (const p of pts) { let j = 0; for (let k = 1; k < 3; k++) if (Math.abs(p[0] - c[k]) < Math.abs(p[0] - c[j])) j = k; parts[j].push(p); }
    const nc = parts.map((ps, j) => (ps.length ? wmed(ps, 0, 2) : c[j]));
    if (nc.every((v, j) => v === c[j])) break;
    c = nc;
  }
  return c.map((a, j) => { const ps = parts[j].filter((p) => p[1] != null); return [Math.round(a * 10) / 10, Math.round(wmed(ps, 1, 3) * 10) / 10]; });
}
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;

export function build() {
  const { hitters, league } = gather();
  const base = { L: {}, R: {} };
  for (const h of ['L', 'R']) for (const k of ['g', 'a', 'd']) base[h][k] = mean(league[h][k]);
  const used = hitters.filter((h) => h.tier === 'batter');
  const fit = {};
  for (const k of ['g', 'a', 'd']) {
    // one ball's spread about his own mean, pooled over every hitter with two or more
    let ss = 0, df = 0;
    for (const h of used) { const x = h.mine[k]; if (x.length < 2) continue; const m = mean(x); for (const v of x) ss += (v - m) * (v - m); df += x.length - 1; }
    const s2 = ss / df;
    // the true spread between hitters: the raw differences' variance less their sampling variance
    const raw = used.filter((h) => h.mine[k].length >= 2).map((h) => ({ d: mean(h.mine[k]) - base[h.bats][k], v: s2 / h.mine[k].length }));
    const md = mean(raw.map((r) => r.d));
    const tau2 = Math.max(0, mean(raw.map((r) => (r.d - md) * (r.d - md))) - mean(raw.map((r) => r.v)));
    fit[k] = { s2, tau2, hitters: raw.length };
  }
  const table = {};
  for (const h of used) {
    const e = { bats: h.bats };
    for (const k of ['g', 'a', 'd']) {
      const x = h.mine[k];
      if (x.length < 2 || !fit[k].tau2) { e[k] = 0; continue; }
      const w = fit[k].tau2 / (fit[k].tau2 + fit[k].s2 / x.length);
      e[k] = Math.round(w * (mean(x) - base[h.bats][k]) * 10) / 10;
    }
    // the outfield: his own balls (weight 1) and the league's for his side, worth the prior's count of
    // balls in all (one ball's variance over the true spread between hitters: s2 / tau2), in spray and
    // in carry each
    const lg = league[h.bats].o, n0a = fit.a.s2 / fit.a.tau2, n0d = fit.d.s2 / fit.d.tau2;
    e.of = outfield([...h.mine.o.map(([a, d]) => [a, d, 1, 1]), ...lg.map(([a, d]) => [a, d, n0a / lg.length, n0d / lg.length])]);
    e.n = [h.mine.g.length, h.mine.o.length];
    (table[h.pack] ||= {})[h.id] = e;
  }
  return { table, fit, base, hitters };
}

function render(table, fit, base) {
  const r1 = (v) => Math.round(v * 10) / 10;
  const lines = [
    '/* GENERATED by lab/pipeline/build-shade.mjs from data/packs. Do not edit by hand: rebuild it (and',
    ' * build-shade.mjs --check holds it to the packs, in check-inplay.mjs).',
    ' *',
    ' * Each hitter\'s shading, by pack and MLBAM id: g his ground balls\' mean spray against the league\'s for',
    ' * his side (degrees, shrunk toward the league by how many he has); of the left, centre and right',
    ' * fielders\' [spray, depth] from his air balls the outfield takes (with the league\'s as the prior);',
    ' * n his own balls (ground, outfield air).',
    ' * A hitter not here stands in the standard alignment.',
    ` * League means: L ground ${r1(base.L.g)}, air ${r1(base.L.a)}, carry ${r1(base.L.d)}; R ground ${r1(base.R.g)}, air ${r1(base.R.a)}, carry ${r1(base.R.d)}.`,
    ` * Shrinkage: ${['g', 'a', 'd'].map((k) => `${k} one ball sd ${r1(Math.sqrt(fit[k].s2))}, between hitters sd ${r1(Math.sqrt(fit[k].tau2))} (${fit[k].hitters} hitters)`).join('; ')}.`,
    ' */',
    'export const SHADE = {',
  ];
  for (const [pk, hs] of Object.entries(table).sort()) {
    lines.push(`  '${pk}': {`);
    for (const [id, e] of Object.entries(hs).sort()) lines.push(`    '${id}': { bats: '${e.bats}', g: ${e.g}, of: ${JSON.stringify(e.of).replace(/,/g, ', ')}, n: [${e.n.join(', ')}] },`);
    lines.push('  },');
  }
  lines.push('};', '');
  return lines.join('\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { table, fit, base, hitters } = build();
  const text = render(table, fit, base);
  if (process.argv.includes('--list')) {
    for (const h of hitters) { const e = table[h.pack] && table[h.pack][h.id]; console.log(h.pack.padEnd(26), h.name.padEnd(22), h.bats, e ? `g ${e.g} of ${JSON.stringify(e.of)} n ${e.n}` : 'standard (' + h.tier + ')'); }
    console.log(fit, base);
  }
  if (process.argv.includes('--check')) {
    const now = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
    if (now !== text) { console.log('FAIL 3d/shade-data.js is not what the packs give: node shut-the-door/lab/pipeline/build-shade.mjs'); process.exit(1); }
    console.log('ok   3d/shade-data.js matches the packs');
  } else if (!process.argv.includes('--list')) { fs.writeFileSync(OUT, text); console.log('wrote', path.relative(process.cwd(), OUT)); }
}
