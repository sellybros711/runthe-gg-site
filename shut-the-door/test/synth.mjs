/* A synthetic pack for the engine tests. FICTIONAL: no real player, no real
 * pitch. It has the shape a built pack has (grade.js header) and a simple,
 * sensible model: the heart of the zone is hit hard, the edges get called
 * strikes and weak contact, chase cells are mostly balls with some whiffs, and
 * two-strike counts swing more. Deterministic: the same options give the same
 * pack.
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const K = require('../contract.js');
const R = require('../rng.js');

const TYPES = [
  { type: 'FF', name: 'four-seam', usage: 0.55, velo: 97.5, pfxX: -7, pfxZ: 16, shape: 'ride', command: 55, sigmaFt: 0.42 },
  { type: 'SL', name: 'slider', usage: 0.33, velo: 87.5, pfxX: 4, pfxZ: 1, shape: 'slide', command: 50, sigmaFt: 0.48 },
  { type: 'CH', name: 'changeup', usage: 0.12, velo: 89.0, pfxX: -12, pfxZ: 6, shape: 'fade', command: 40, sigmaFt: 0.58 },
];
const BUCKETS = ['even', 'ahead', 'behind', 'two_strikes'];

/* Outcome weights for one (type, cell, bucket, batter power). */
function weights(type, cell, bucket, power) {
  const zone = K.inZone(cell);
  const heart = cell === 12;
  const two = bucket === 'two_strikes';
  const behind = bucket === 'behind';
  const breaking = type !== 'FF';
  if (!zone) {
    const down = K.rowOf(cell) === 4;
    const chase = (two ? 0.38 : 0.25) + (breaking && down ? 0.12 : 0);
    const whiff = chase * (breaking ? 0.55 : 0.35);
    const foul = chase * 0.25;
    const inplay = chase - whiff - foul;
    return { ball: 1 - chase, swinging_strike: whiff, foul, weak: inplay * 0.85, hard: inplay * 0.15 * power };
  }
  const swing = (two ? 0.85 : behind ? 0.75 : 0.62) + (heart ? 0.08 : 0);
  const whiff = swing * (breaking ? 0.28 : 0.16) * (heart ? 0.6 : 1);
  const foul = swing * 0.38;
  const inplay = swing - whiff - foul;
  const hardShare = (heart ? (type === 'FF' ? 0.65 : 0.55) : 0.24) * power;
  return { called_strike: 1 - swing, swinging_strike: whiff, foul, weak: inplay * (1 - hardShare), hard: inplay * hardShare };
}

/* Each 'weak' or 'hard' contact becomes a batted ball with a fixed split. */
const WEAK = [['out', 'ground', 0.45], ['out', 'popup', 0.15], ['out', 'fly', 0.2], ['single', 'ground', 0.17], ['error', 'ground', 0.03]];
const HARD = [['out', 'line', 0.22], ['out', 'fly', 0.18], ['single', 'line', 0.25], ['double', 'line', 0.17], ['triple', 'fly', 0.03], ['home_run', 'fly', 0.15]];

export function synthPack(opts = {}) {
  const lead = opts.lead ?? 1;
  const nBatters = opts.batters ?? 9;
  const perList = opts.perList ?? 200;
  const pitches = [];
  const index = new Map();
  function pitchId(row) {
    const k = row.slice(2).join('|');
    if (index.has(k)) return index.get(k);
    const id = pitches.length;
    pitches.push([`synth:${id}`, ...row.slice(1)]);
    index.set(k, id);
    return id;
  }
  const batters = [];
  const library = [];
  for (let bi = 0; bi < nBatters; bi++) {
    const power = (opts.power ?? 1.1) * (0.8 + 0.5 * ((bi * 37) % 9) / 8);
    const bats = bi % 3 === 1 ? 'L' : 'R';
    batters.push({
      id: `synth-${bi}`, name: `Synth Batter ${bi + 1}`, bats, line: '.250/.320/.420, 15 HR',
      szTop: 3.4, szBot: 1.6, profileTier: 'batter',
      profile: { chase: 0.3, zoneSwing: 0.68, whiff: { FF: 0.2, SL: 0.33, CH: 0.3 }, heat: new Array(25).fill(0.3), swing: new Array(25).fill(0.5), notes: [] },
    });
    const lib = {};
    for (const t of TYPES) {
      lib[t.type] = [];
      for (let cell = 0; cell < 25; cell++) {
        const per = [];
        for (const bucket of BUCKETS) {
          const w = weights(t.type, cell, bucket, power);
          // expand the weights into perList pitches by largest remainder
          const items = [];
          for (const [res, p] of Object.entries(w)) {
            if (res === 'weak' || res === 'hard') {
              for (const [hit, bb, q] of (res === 'weak' ? WEAK : HARD)) items.push([`in_play|${hit}|${bb}|${res}`, p * q]);
            } else items.push([res, p]);
          }
          const n = items.map(([k, p]) => [k, p * perList]);
          const out = [];
          for (const [k, x] of n) for (let i = 0; i < Math.floor(x); i++) out.push(k);
          const rem = n.map(([k, x]) => [k, x - Math.floor(x)]).sort((a, b) => b[1] - a[1]);
          for (let i = 0; out.length < perList; i++) out.push(rem[i % rem.length][0]);
          per.push(out.map(k => {
            const [res, hit, bb, hard] = k.split('|');
            const row = res === 'in_play'
              ? [null, t.velo, 'in_play', bb, hard === 'hard' ? 101 : 82, bb === 'ground' ? -5 : bb === 'popup' ? 55 : 22, 0, hit]
              : [null, t.velo, res, null, null, null, null, null];
            return [pitchId(row), 0];
          }));
        }
        lib[t.type].push(per);
      }
    }
    library.push(lib);
  }
  const scenario = {
    id: 'std-synth-1', day: '2026-10-20', number: 1, title: 'Synthetic', setup: 'synthetic test scenario.',
    pitcher: { name: 'Synth Closer', team: 'Synth', teamColors: ['#123456', '#abcdef'], year: 2024, throws: 'R', arsenal: TYPES },
    situation: { inning: 9, half: 'bottom', outs: opts.outs ?? 0, bases: opts.bases ?? 0, score: { us: 3 + lead, them: 3 }, usHome: false, walkOffLive: opts.walkOffLive ?? true },
    batters, realFaced: 3, resolution: 'real', sources: ['synthetic'],
  };
  return {
    v: 1, scenario, kernelZoneFt: 1.9, pitches, library, advance: synthAdvance(),
    pool: { scores: opts.poolScores || [], closers: opts.closers || [] },
    reveal: { outcome: 'door_shut', pitches: 12, runs: 0, summary: 'synthetic', plateAppearances: [] },
  };
}

/* A simple advancement table. Rows: [p, basesAfter, runs, outsAdded, label]. */
export function synthAdvance() {
  const adv = {};
  const cats = ['single', 'double', 'triple', 'home_run', 'error', 'out_ground', 'out_line', 'out_fly', 'out_popup'];
  for (const c of cats) adv[c] = {};
  const on = (b, n) => !!(b & (1 << (n - 1)));
  for (let outs = 0; outs < 3; outs++) for (let b = 0; b < 8; b++) {
    const k = outs * 8 + b;
    const n = [1, 2, 3].filter(x => on(b, x)).length;
    adv.home_run[k] = [[1, 0, n + 1, 0, 'home_run']];
    adv.triple[k] = [[1, 4, n, 0, 'triple']];
    {
      const r = (on(b, 2) ? 1 : 0) + (on(b, 3) ? 1 : 0);
      if (on(b, 1)) adv.double[k] = [[0.6, 6, r, 0, 'double'], [0.4, 2, r + 1, 0, 'double']];
      else adv.double[k] = [[1, 2, r, 0, 'double']];
    }
    for (const cat of ['single', 'error']) {
      const label = cat === 'error' ? 'error' : 'single';
      const r3 = on(b, 3) ? 1 : 0;
      if (on(b, 2)) {
        const nb = 1 | (on(b, 1) ? 2 : 0);
        adv[cat][k] = [[0.6, nb, r3 + 1, 0, label], [0.4, nb | 4, r3, 0, label]];
      } else adv[cat][k] = [[1, 1 | (on(b, 1) ? 2 : 0), r3, 0, label]];
    }
    if (outs === 2) {
      for (const c of ['out_ground', 'out_line', 'out_fly', 'out_popup']) adv[c][k] = [[1, b, 0, 1, 'out']];
      continue;
    }
    adv.out_line[k] = [[1, b, 0, 1, 'out']];
    adv.out_popup[k] = [[1, b, 0, 1, 'out']];
    if (on(b, 3)) adv.out_fly[k] = [[0.6, b & 3, 1, 1, 'sac_fly'], [0.4, b, 0, 1, 'out']];
    else adv.out_fly[k] = [[1, b, 0, 1, 'out']];
    if (on(b, 1)) {
      // double play: the batter and the runner from first; the others move up one
      const dpAfter = on(b, 2) ? 4 : 0;
      const dpRuns = on(b, 3) && outs === 0 ? 1 : 0;
      adv.out_ground[k] = [
        [0.45, dpAfter, dpRuns, 2, 'double_play'],
        [0.55, (b & 6) | 1, 0, 1, 'fielders_choice'],
      ];
    } else {
      const r3 = on(b, 3) ? 1 : 0;
      adv.out_ground[k] = [[1, on(b, 2) ? 4 : 0, r3, 1, 'out']];
    }
  }
  // the third out never scores: zero the runs on any row that ends the half
  for (const c of cats) for (const k in adv[c]) {
    const outs = Math.floor(+k / 8);
    adv[c][k] = adv[c][k].map(r => (outs + r[3] >= 3 ? [r[0], r[1], 0, r[3], r[4]] : r));
  }
  return adv;
}

/* A seeded stream for picking test calls. */
export function testRng(seed) { return R.mulberry32(seed); }
