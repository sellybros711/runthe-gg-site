/* Shut The Door: player strategies against every pack (rules 2, 2026-10-22).
 *
 *   node shut-the-door/pipeline/strategies.cjs [game dir] [runs] [rules 1|2] [strategies] > rows.json
 *   env: PACKS=yamamoto,... only those packs; RELS=none,ordinary,perfect the releases;
 *        FUZZ=0 the screen strategies read the exact profile instead of the scouting view;
 *        EFFORTS=none,min,mid,max,smart the effort policies (CONTRACT.md 5c; default none):
 *          none   no e (the meter's one stop, as before effort)
 *          min, mid, max   e 0, 0.5, 1 every pitch
 *          smart  effort by the pitch and the moment, as the measured bins read: max on a
 *                 fastball with two strikes, firm on a fastball when even or ahead and on a
 *                 breaking ball with two strikes, easy on the changeup or splitter (a harder
 *                 one whiffs less) and at three balls (the strike matters more than the stuff),
 *                 ordinary otherwise, and no harder than ordinary past 15 pitches
 *        With a timed release, e narrows or widens the window the tap model is timed in
 *        (meter.js qOf(err, command, e)); a perfect release is q 1 whatever the window.
 *
 * The measurements behind grade.js R2 (README, Rules 2). Each strategy plays
 * every pack RUNS times with each release (none: the meter off; ordinary: the
 * meter's tap model, meter.js TIMING; perfect: q 1), and prints hold%, the
 * outcome mix, runs and walks per outing and the median percentile:
 *   visible   the screen's top call every pitch, from the heat map, swing map and scout card
 *   visible2  a simpler reader: the best whiff pitch to the softest zone cell, a chase with two strikes
 *   mixer     one of the screen's top six at random
 *   smart     the screen's top call, less a cost for a type the batter has seen this at bat (more
 *             for the same spot) and for leaning on the zone or nibbling: a strong player
 *   average   his pitches at their usage, a random strike, a ring chase with two strikes
 *   fixed     the single best (type, cell) under rules 1, every pitch
 *   best      the grade's best call every pitch (engine.js bestCall)
 *   pool      the closer pool (pool.js closerCall), as the packs play it
 */
'use strict';
const path = require('path');
const DIR = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const RUNS = +(process.argv[3] || 600);
const RULES = +(process.argv[4] || 2);
const WANT = (process.argv[5] || 'visible,visible2,mixer,average,fixed,best,pool').split(',');
const RELS = (process.env.RELS || 'ordinary,perfect').split(',');
const K = require(DIR + '/contract.js');
const R = require(DIR + '/rng.js');
const G = require(DIR + '/grade.js');
const E = require(DIR + '/engine.js');
const MT = require(DIR + '/meter.js');
const P = require(DIR + '/pool.js');
const fs = require('fs');
const ONLY = process.env.PACKS ? process.env.PACKS.split(',') : null;
const closers = JSON.parse(fs.readFileSync(DIR + '/data/closers.json', 'utf8')).closers;

const ZONE = [], CHASE = [];
for (let c = 0; c < 25; c++) (K.inZone(c) ? ZONE : CHASE).push(c);
const RING = CHASE.filter(c => { const r = K.rowOf(c), k = K.colOf(c); return !((r === 0 || r === 4) && (k === 0 || k === 4)); });
const view = pr => (RULES >= 2 && G.scoutView && process.env.FUZZ !== '0' ? G.scoutView(pr) : pr);

/* what the screen shows, scored: a swing is worth its whiff chance (a strike) against its damage on contact, a take is a strike in the zone and a ball out of it (dearer with more balls); every call, sorted */
function visibleRank(o) {
  const st = o.st, b = o.pack.scenario.batters[st.bi % o.model.N];
  const pr = view(b.profile || {});
  const out = [];
  for (const a of o.pack.scenario.pitcher.arsenal) {
    const wh = (pr.whiff && pr.whiff[a.type] != null) ? pr.whiff[a.type] : 0.25;
    for (let c = 0; c < 25; c++) {
      const sw = pr.swing ? pr.swing[c] : (K.inZone(c) ? 0.65 : 0.3);
      const dmg = pr.heat ? pr.heat[c] : 0.35;
      const strikeV = st.s === 2 ? 1.6 : 0.6;
      const contactV = 0.6 - 2.2 * dmg;
      const swingV = wh * strikeV + (1 - wh) * contactV;
      const ballV = st.b === 3 ? -1.6 : st.b === 2 ? -0.7 : -0.45;
      const v = sw * swingV + (1 - sw) * (K.inZone(c) ? 0.6 : ballV);
      out.push({ v, type: a.type, cell: c });
    }
  }
  return out.sort((x, y) => y.v - x.v);
}
function visibleCall(o) { const b = visibleRank(o)[0]; return { type: b.type, cell: b.cell }; }
/* a strong player who reads the screen and mixes: one of the screen's top six calls at random */
function mixerCall(o) { const r = visibleRank(o).slice(0, 6); const b = r[Math.floor(o.pol() * r.length)]; return { type: b.type, cell: b.cell }; }
/* an average player: his pitches at their real usage, a strike somewhere in the zone, and a chase
   pitch with two strikes (a cell on the ring), never reading the heat map */
function averageCall(o) {
  const ars = o.pack.scenario.pitcher.arsenal; let u = o.pol(), t = ars[ars.length - 1].type;
  for (const a of ars) { if (u < a.usage) { t = a.type; break; } u -= a.usage; }
  const cells = o.st.s === 2 && o.st.b < 3 ? RING : ZONE;
  return { type: t, cell: cells[Math.floor(o.pol() * cells.length)] };
}
function visible2(o) {
  const st = o.st, b = o.pack.scenario.batters[st.bi % o.model.N];
  const pr = view(b.profile || {});
  const ars = o.pack.scenario.pitcher.arsenal;
  const wh = t => (pr.whiff && pr.whiff[t] != null) ? pr.whiff[t] : 0.2;
  const whiffiest = ars.slice().sort((x, y) => wh(y.type) - wh(x.type))[0].type;
  const lowDmgZone = ZONE.slice().sort((x, y) => pr.heat[x] - pr.heat[y])[0];
  if (st.s === 2 && st.b < 3) return { type: whiffiest, cell: RING.slice().sort((x, y) => pr.swing[y] - pr.swing[x])[0] };
  return { type: whiffiest, cell: lowDmgZone };
}
/* a strong player who reads the screen AND what he has thrown: the screen's score, less a cost
   for a type the batter has seen this at bat, more for the same spot, and for leaning on the zone */
function smartCall(o) {
  const log = o.log; let i = log.length; while (i > 0 && !log[i - 1].paOver) i--;
  const pa = log.slice(i);
  const zs = log.length ? log.filter(p => K.inZone(p.call.cell)).length / log.length : 0.5;
  let best = null;
  for (const c of visibleRank(o).slice(0, 40)) {
    const same = pa.filter(p => p.call.type === c.type);
    let v = c.v - 0.12 * same.length;
    if (same.some(p => Math.max(Math.abs(K.rowOf(p.call.cell) - K.rowOf(c.cell)), Math.abs(K.colOf(p.call.cell) - K.colOf(c.cell))) <= 1)) v -= 0.25;
    if (log.length >= 3 && K.inZone(c.cell)) v -= 0.8 * Math.max(0, zs - 0.5);
    if (log.length >= 3 && !K.inZone(c.cell)) v -= 0.8 * Math.max(0, 0.4 - zs);
    if (!best || v > best.v) best = { v, type: c.type, cell: c.cell };
  }
  return { type: best.type, cell: best.cell };
}
function fixedCall(o) { return { type: o.fixed.type, cell: o.fixed.cell }; }
function bestCall(o) { return E.bestCall ? E.bestCall(o) : (b => ({ type: b.type, cell: b.cell }))(o.model.solve(o.st)); }
function poolCall(o) { return P.closerCall(o.closer, o, o.pol); }

function fixedTop(pack) {
  let top = null;
  for (const type of pack.scenario.pitcher.arsenal.map(a => a.type)) for (let cell = 0; cell < 25; cell++) {
    const m = new G.Model(pack, { fresh: true });
    m.solve = function (st) {
      const idx = G.stateIndex(this.N, this.M, st.bi, st.b, st.s, st.outs, st.bases, st.margin);
      const hit = this._V.get(idx); if (hit) return hit;
      const cv = this.callValue(st, type, cell); const r = { hold: cv.hold, runs: cv.runs, type, cell };
      this._V.set(idx, r); return r; };
    const v = m.solve(m.startState()).hold;
    if (!top || v > top.v) top = { v, type, cell };
  }
  return top;
}

function tapQ(rng, command, eff) {
  let e = R.probit(rng()) * MT.TIMING.sdMs;
  if (rng() < MT.TIMING.slip) e = rng() * MT.TIMING.slipMaxMs;
  return MT.qOf(e, command, eff);
}
const EFFORTS = (process.env.EFFORTS || 'none').split(',');
function effortOf(policy, o, c) {
  if (policy === 'none') return null;
  if (policy === 'min') return 0;
  if (policy === 'mid') return 0.5;
  if (policy === 'max') return 1;
  const st = o.st, fam = K.FAMILY_OF[c.type];
  let e;
  if (st.b === 3) e = 0.25;
  else if (fam === 'offspeed') e = 0.25;
  else if (st.s === 2) e = fam === 'hard' ? 1 : 0.75;
  else if (fam === 'hard' && st.s >= st.b) e = 0.75;
  else e = 0.5;
  if (o.log.length >= 15) e = Math.min(e, 0.5);
  return e;
}

function play(pack, model, sname, strat, release, runs, effort) {
  const out = { door_shut: 0, tie_held: 0, doors_open: 0, walk_off: 0 };
  let ra = 0, pitches = 0, n = 0, walks = 0, pa = 0;
  const scores = [], bands = { green: 0, yellow: 0, orange: 0, red: 0 };
  for (let r = 0; r < runs; r++) {
    const seed = R.hashSeed(`${pack.scenario.id}|sim|${r}`);
    const tap = R.mulberry32(R.hashSeed(`${pack.scenario.id}|tap|${r}`));
    const o = E.createOuting(pack, RULES === 1 ? { seed, model, rules: 1 } : { seed, model });
    o.fixed = pack._fixed;
    o.pol = R.mulberry32(R.hashSeed(`${pack.scenario.id}|pol|${r}`));
    o.closer = closers[r % closers.length];
    let guard = 0;
    while (o.status === 'live' && guard++ < 200) {
      const c = strat(o);
      const cmd = pack.scenario.pitcher.arsenal.find(a => a.type === c.type).command;
      const eff = release === 'none' ? null : effortOf(effort || 'none', o, c);
      if (eff != null) c.e = eff;
      if (release === 'perfect') c.q = 1;
      else if (release === 'ordinary') c.q = tapQ(tap, cmd, eff);
      const res = E.throwPitch(o, c).pitchResult;
      if (res.paOver) { pa++; if (res.result === 'ball' || res.result === 'hit_by_pitch') walks++; }
    }
    if (o.status !== 'over') continue;
    n++; out[o.outcome]++;
    ra += o.score.them - pack.scenario.situation.score.them;
    pitches += o.log.length;
    scores.push(E.outingScore(o));
    for (const g of o.grades) bands[g.band]++;
  }
  const pct = x => Math.round(1000 * x / n) / 10;
  scores.sort((a, b) => a - b);
  const bt = bands.green + bands.yellow + bands.orange + bands.red;
  return { n, hold: pct(out.door_shut), tie: pct(out.tie_held), lost: pct(out.doors_open + out.walk_off),
    rpo: Math.round(100 * ra / n) / 100, pitches: Math.round(10 * pitches / n) / 10, bbPA: Math.round(1000 * walks / pa) / 10,
    medScore: scores[Math.floor(n / 2)], pctile: E.percentileOf(scores[Math.floor(n / 2)], pack.pool.scores),
    bands: [bands.green, bands.yellow, bands.orange, bands.red].map(x => Math.round(100 * x / bt)).join('/') };
}

const S = { smart: smartCall, visible: visibleCall, visible2, mixer: mixerCall, average: averageCall, fixed: fixedCall, best: bestCall, pool: poolCall };
const packs = fs.readdirSync(DIR + '/data/packs').filter(f => f.endsWith('.json')).filter(f => !ONLY || ONLY.some(x => f.includes(x)));
const rows = [];
for (const f of packs) {
  const pack = JSON.parse(fs.readFileSync(DIR + '/data/packs/' + f, 'utf8'));
  if (RULES >= 2 && P.seqCenter && !pack.seq) pack.seq = P.seqCenter(pack, closers, new G.Model(pack), 400);
  const model = new G.Model(pack);
  if (WANT.includes('fixed')) pack._fixed = fixedTop(pack);
  for (const sn of WANT) {
    for (const rel of (sn === 'pool' ? ['none'] : RELS)) {
      for (const ef of (sn === 'pool' || rel === 'none' ? ['none'] : EFFORTS)) {
        rows.push(Object.assign({ pack: pack.scenario.id.replace('std-', ''), strat: sn, release: rel, effort: ef }, play(pack, model, sn, S[sn], rel, RUNS, ef)));
      }
    }
  }
  rows.push({ pack: pack.scenario.id.replace('std-', ''), strat: 'POOL(pack)', release: '', hold: Math.round(pack.build.pool.holdRate * 1000) / 10, real: `${pack.reveal.outcome} ${pack.reveal.runs}r` });
  console.error('done', f);
}
console.log(JSON.stringify(rows));
