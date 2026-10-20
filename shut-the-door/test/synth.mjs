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
const G = require('../grade.js');
const E = require('../engine.js');

const TYPES = [
  { type: 'FF', name: 'four-seam', usage: 0.55, velo: 97.5, pfxX: -7, pfxZ: 16, shape: 'ride', command: 55, sigmaFt: 0.42 },
  { type: 'SL', name: 'slider', usage: 0.33, velo: 87.5, pfxX: 4, pfxZ: 1, shape: 'slide', command: 50, sigmaFt: 0.48 },
  { type: 'CH', name: 'changeup', usage: 0.12, velo: 89.0, pfxX: -12, pfxZ: 6, shape: 'fade', command: 40, sigmaFt: 0.58 },
];

/* Outcome chances for one (type, cell, bucket, batter power), keyed like G.KEYS. */
function chances(type, cell, bucket, power) {
  const zone = K.inZone(cell), heart = cell === 12, two = bucket === 3, behind = bucket === 2;
  const breaking = type !== 'FF';
  const o = {};
  let weak, hard;
  if (!zone) {
    const down = K.rowOf(cell) === 4;
    const chase = (two ? 0.38 : 0.25) + (breaking && down ? 0.12 : 0);
    o.ball = (1 - chase) * 0.99; o.hit_by_pitch = (1 - chase) * 0.01;
    o.swinging_strike = chase * (breaking ? 0.55 : 0.35);
    o.foul = chase * 0.25;
    const ip = chase - o.swinging_strike - o.foul;
    weak = ip * 0.85; hard = ip * 0.15 * power;
  } else {
    const swing = (two ? 0.85 : behind ? 0.75 : 0.62) + (heart ? 0.08 : 0);
    o.called_strike = 1 - swing;
    o.swinging_strike = swing * (breaking ? 0.28 : 0.16) * (heart ? 0.6 : 1);
    o.foul = swing * 0.38;
    const ip = swing - o.swinging_strike - o.foul;
    const hs = Math.min(0.95, (heart ? (type === 'FF' ? 0.65 : 0.55) : 0.24) * power);
    weak = ip * (1 - hs); hard = ip * hs;
  }
  const add = (k, v) => { o[k] = (o[k] || 0) + v; };
  add('out_ground', weak * 0.45); add('out_popup', weak * 0.15); add('out_fly', weak * 0.2); add('single', weak * 0.17); add('error', weak * 0.03);
  add('out_line', hard * 0.22); add('out_fly', hard * 0.18); add('single', hard * 0.25); add('double', hard * 0.17); add('triple', hard * 0.03); add('home_run', hard * 0.15);
  return o;
}

/* Per mille, summing to 1000 by largest remainder. */
function permille(o) {
  const raw = G.KEYS.map(k => (o[k] || 0) * 1000);
  const tot = raw.reduce((a, b) => a + b, 0);
  const scaled = raw.map(x => x * 1000 / tot);
  const out = scaled.map(Math.floor);
  let left = 1000 - out.reduce((a, b) => a + b, 0);
  const order = scaled.map((x, i) => [x - Math.floor(x), i]).sort((a, b) => b[0] - a[0]);
  for (let i = 0; left > 0; i++, left--) out[order[i % order.length][1]]++;
  return out;
}

const BB = { single: 'line', double: 'line', triple: 'fly', home_run: 'fly', error: 'ground',
  out_ground: 'ground', out_line: 'line', out_fly: 'fly', out_popup: 'popup' };

export function synthPack(opts = {}) {
  const lead = opts.lead ?? 1;
  const nBatters = opts.batters ?? 9;
  const pitches = [];
  const pIndex = {};
  function pitchFor(type, key) {
    const id = `${type}|${key}`;
    if (pIndex[id] != null) return pIndex[id];
    const velo = TYPES.find(t => t.type === type).velo;
    let res = key, bb = null, ev = null, la = null, spray = null;
    if (G.IN_PLAY.includes(key)) {
      res = 'in_play'; bb = BB[key]; ev = key === 'home_run' ? 105 : 90; la = bb === 'ground' ? -5 : bb === 'popup' ? 55 : bb === 'line' ? 15 : 30; spray = -10;
    }
    pitches.push([`synth:${pitches.length}`, velo, res, bb, ev, la, spray]);
    pIndex[id] = pitches.length - 1;
    return pIndex[id];
  }
  const batters = [], library = [];
  for (let bi = 0; bi < nBatters; bi++) {
    const power = (opts.power ?? 1.1) * (0.8 + 0.5 * ((bi * 37) % 9) / 8);
    batters.push({
      id: `synth-${bi}`, name: `Synth Batter ${bi + 1}`, bats: bi % 3 === 1 ? 'L' : 'R', line: '.250/.320/.420, 15 HR',
      szTop: 3.4, szBot: 1.6, profileTier: 'batter',
      profile: { chase: 0.3, zoneSwing: 0.68, whiff: { FF: 0.2, SL: 0.33, CH: 0.3 }, heat: new Array(25).fill(0.3), swing: new Array(25).fill(0.5), notes: [] },
    });
    const lib = {};
    for (const t of TYPES) {
      const p = [], x = [];
      for (let cell = 0; cell < 25; cell++) {
        const rows = [0, 1, 2, 3].map(b => permille(chances(t.type, cell, b, power)));
        p.push(rows);
        x.push(G.KEYS.map((k, i) => (rows.some(r => r[i] > 0) ? pitchFor(t.type, k) * 3 + (bi % 3) : -1)));
      }
      lib[t.type] = { p, x };
    }
    library.push(lib);
  }
  if (opts.override) opts.override(library, pitches, pitchFor);
  const scenario = {
    id: 'std-synth-1', day: '2026-10-20', number: 1, title: 'Synthetic', setup: 'synthetic test scenario.',
    pitcher: { name: 'Synth Closer', team: 'Synth', teamColors: ['#123456', '#abcdef'], year: 2024, throws: 'R', arsenal: TYPES },
    situation: { inning: 9, half: 'bottom', outs: opts.outs ?? 0, bases: opts.bases ?? 0, score: { us: 3 + lead, them: 3 }, usHome: false, walkOffLive: opts.walkOffLive ?? true },
    batters, realFaced: 3, resolution: 'real', sources: ['synthetic'],
  };
  return {
    v: E.PACK_VERSION, keys: G.KEYS.slice(), scenario, kernelZoneFt: 1.9, pitches, library, advance: synthAdvance(),
    pool: { scores: opts.poolScores || [], closers: opts.closers || [] },
    reveal: { outcome: 'door_shut', pitches: 12, runs: 0, summary: 'synthetic', plateAppearances: [] },
  };
}

/* A simple advancement table with moves. Rows: [p, basesAfter, runs, outsAdded, label, moves]. */
export function synthAdvance() {
  const adv = {};
  for (const c of G.IN_PLAY) adv[c] = {};
  const on = (b, n) => !!(b & (1 << (n - 1)));
  /* apply a plan (base -> destination) to the runners and the batter */
  function play(bases, plan, label) {
    let nb = 0, runs = 0, outs = 0;
    const moves = [];
    for (const from of [3, 2, 1, 0]) {
      if (from > 0 && !on(bases, from)) continue;
      const to = plan(from);
      if (to === from) { nb |= 1 << (from - 1); continue; }
      moves.push([from, to]);
      if (to === 4) runs++; else if (to === -1) outs++; else nb |= 1 << (to - 1);
    }
    return { nb, runs, outs, moves, label };
  }
  for (let outs = 0; outs < 3; outs++) for (let b = 0; b < 8; b++) {
    const k = outs * 8 + b;
    const rows = {};
    const P = (cat, p, r) => { (rows[cat] = rows[cat] || []).push([p, r.nb, r.runs, r.outs, r.label, r.moves]); };
    P('home_run', 1, play(b, () => 4, 'home_run'));
    P('triple', 1, play(b, f => (f === 0 ? 3 : 4), 'triple'));
    P('double', 0.6, play(b, f => (f === 0 ? 2 : f === 1 ? 3 : 4), 'double'));
    P('double', 0.4, play(b, f => (f === 0 ? 2 : 4), 'double'));
    for (const cat of ['single', 'error']) {
      P(cat, 0.6, play(b, f => (f === 0 ? 1 : f === 1 ? 2 : 4), cat));
      P(cat, 0.4, play(b, f => (f === 0 ? 1 : f === 1 ? 2 : f === 2 ? 3 : 4), cat));
    }
    P('out_line', 1, play(b, f => (f === 0 ? -1 : f), 'out'));
    P('out_popup', 1, play(b, f => (f === 0 ? -1 : f), 'out'));
    if (on(b, 3) && outs < 2) {
      P('out_fly', 0.6, play(b, f => (f === 0 ? -1 : f === 3 ? 4 : f), 'sac_fly'));
      P('out_fly', 0.4, play(b, f => (f === 0 ? -1 : f), 'out'));
    } else P('out_fly', 1, play(b, f => (f === 0 ? -1 : f), 'out'));
    if (on(b, 1) && outs < 2) {
      P('out_ground', 0.45, play(b, f => (f === 0 || f === 1 ? -1 : f === 3 && outs === 0 ? 4 : f === 2 ? 3 : f), 'double_play'));
      P('out_ground', 0.55, play(b, f => (f === 1 ? -1 : f === 0 ? 1 : f), 'fielders_choice'));
    } else {
      P('out_ground', 1, play(b, f => (f === 0 ? -1 : f === 3 && outs < 2 ? 4 : f === 2 && !on(b, 3) ? 3 : f), 'out'));
    }
    for (const cat in rows) {
      // the third out never scores
      adv[cat][k] = rows[cat].map(r => (outs + r[3] >= 3 ? [r[0], r[1], 0, r[3], r[4], r[5].map(([f, t]) => [f, t === 4 ? f : t]).filter(([f, t]) => f !== t)] : r));
    }
  }
  return adv;
}

/* A seeded stream for picking test calls. */
export function testRng(seed) { return R.mulberry32(seed); }
