/* Shut The Door: the built packs, against the contract and the brief's tests.
 *   node shut-the-door/test/packs.mjs                 every pack in data/packs
 *   node shut-the-door/test/packs.mjs path/to/pack.json ...
 *   node shut-the-door/test/packs.mjs --calib         the band calibration lines only
 *
 * Per pack:
 *   the pack against CONTRACT.md (scenario, arsenal, batters, profiles, reveal,
 *   library rows, advancement rows, hold table, pool) and under 1.5 MB
 *   determinism on the real pack
 *   the brief's three tests:
 *     fastballs down the middle grade mostly orange and red (a CALIB line
 *       until the lead rules on the bands; --strict fails on it)
 *     a scripted best-call outing is all green
 *     a scripted median outing lands at the 40th to 60th percentile
 *   and the band spread of the pool's calls (reported, the lead's to read)
 */
import { createRequire } from 'module';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const K = require('../contract.js');
const R = require('../rng.js');
const G = require('../grade.js');
const E = require('../engine.js');
const P = require('../pool.js');

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKS = join(HERE, '..', 'data', 'packs');
const MAX_BYTES = 1.5e6;
const CLOSERS = join(HERE, '..', 'data', 'closers.json');
let closersFull = null;
try { closersFull = JSON.parse(readFileSync(CLOSERS, 'utf8')).closers; } catch (e) { closersFull = null; }

let fails = 0;
function check(name, cond, detail) {
  if (cond) console.log('ok   ' + name);
  else { fails++; console.log('FAIL ' + name + (detail ? ': ' + detail : '')); }
}

/* Release and spin (pipeline/tracking.py, CONTRACT.md 4): for the picture only. A proxy spot is null
   throughout. A tracked pitcher has his release side by his hand (catcher's view: a righty's hand is
   on the third base side, x < 0), a sane height and extension, and on Statcast every pitch type has
   a spin rate of 1,000 to 3,500 rpm and an axis of 0 to 360. PITCHf/x carries x and z only. */
const inR = (v, lo, hi) => Number.isFinite(v) && v >= lo && v <= hi;
function releaseErrs(r, hand, where, statcast) {
  if (!r) return [where + ' has no release'];
  const errs = [];
  const side = hand === 'R' ? r.x < 0 : r.x > 0;
  if (!inR(r.x, -5, 5) || !side) errs.push(`${where} release x ${r.x} for a ${hand} hand`);
  if (!inR(r.z, 3.5, 7.5)) errs.push(`${where} release z ${r.z}`);
  if (statcast ? !inR(r.ext, 4.5, 8.5) : r.ext !== null) errs.push(`${where} extension ${r.ext}`);
  return errs;
}
function trackingErrs(sc) {
  const p = sc.pitcher, errs = [];
  if (!('tracking' in p) || !('release' in p) || !('armAngle' in p)) return ['pitcher lacks tracking, release or armAngle'];
  if (sc.resolution === 'proxy' || !p.tracking) {
    if (sc.resolution !== 'proxy') errs.push('a real spot without tracking');
    if (p.tracking || p.release || p.armAngle !== null) errs.push('a proxy spot carries tracking');
    for (const a of p.arsenal) if (a.release !== null || a.armAngle !== null || a.spin !== null) errs.push('proxy ' + a.type + ' carries release or spin');
    return errs;
  }
  const t = p.tracking, statcast = t.system === 'statcast';
  if (!['statcast', 'pitchfx'].includes(t.system) || statcast !== t.season >= 2015) errs.push('tracking system ' + t.system + ' ' + t.season);
  if (t.season !== p.year && sc.resolution === 'real') errs.push('tracking season ' + t.season + ' for ' + p.year);
  errs.push(...releaseErrs(p.release, p.throws, 'pitcher', statcast));
  const armOk = (v) => (statcast && t.season >= 2020 ? inR(v, -30, 90) : v === null);
  if (!armOk(p.armAngle)) errs.push('pitcher arm angle ' + p.armAngle);
  for (const a of p.arsenal) {
    errs.push(...releaseErrs(a.release, p.throws, a.type, statcast));
    if (!armOk(a.armAngle)) errs.push(a.type + ' arm angle ' + a.armAngle);
    const s = a.spin;
    if (!statcast) { if (s !== null) errs.push(a.type + ' spin before Statcast'); continue; }
    if (!s) { errs.push(a.type + ' has no spin'); continue; }
    if (!inR(s.rate, 1000, 3500) || !Number.isInteger(s.rate)) errs.push(`${a.type} spin rate ${s.rate}`);
    if (!inR(s.axis, 0, 360)) errs.push(`${a.type} spin axis ${s.axis}`);
    if (s.active !== null && !inR(s.active, 0, 100)) errs.push(`${a.type} active spin ${s.active}`);
    if (s.active !== null && !t.active) errs.push(a.type + ' active spin without a source');
  }
  return errs;
}

function shapeChecks(pack, file) {
  const id = pack.scenario.id;
  const sc = pack.scenario;
  const errs = [];
  const need = (o, keys, where) => { for (const k of keys) if (!(k in o)) errs.push(`${where} lacks ${k}`); };
  need(pack, ['v', 'scenario', 'library', 'advance', 'hold', 'kernel' in pack ? 'kernel' : 'kernelZoneFt', 'pool', 'reveal', 'pitches', 'keys'], 'pack');
  need(sc, ['id', 'title', 'setup', 'pitcher', 'situation', 'batters', 'realFaced', 'resolution', 'sources'], 'scenario');
  if ('reveal' in sc) errs.push('scenario carries the reveal');
  const ars = sc.pitcher.arsenal;
  const usage = ars.reduce((a, x) => a + x.usage, 0);
  if (Math.abs(usage - 1) > 1e-6) errs.push('arsenal usage sums to ' + usage);
  for (const a of ars) {
    need(a, ['type', 'name', 'usage', 'velo', 'pfxX', 'pfxZ', 'shape', 'command', 'sigmaFt'], 'arsenal ' + a.type);
    if (!K.PITCH_TYPES.includes(a.type)) errs.push('pitch type ' + a.type);
    if (K.SHAPE_OF[a.type] !== a.shape) errs.push('shape of ' + a.type);
    if (!(a.command >= 20 && a.command <= 80)) errs.push('command ' + a.command);
    // effort (CONTRACT.md 5c): his own five fifths of speed, slowest first, or the league's spread on his average
    const st = a.stuff;
    if (!st || !['his', 'league'].includes(st.src) || !['velo', 'pfxX', 'pfxZ'].every(k => Array.isArray(st[k]) && st[k].length === 5 && st[k].every(x => typeof x === 'number'))) errs.push('stuff of ' + a.type);
    else if (!st.velo.every((v, i) => i === 0 || v >= st.velo[i - 1]) || Math.abs(st.velo[2] - a.velo) > 1.5) errs.push('stuff speeds of ' + a.type + ' ' + st.velo.join(' '));
    else if (st.src === 'his' && !(st.n >= 40)) errs.push('stuff of ' + a.type + ' is his own on ' + st.n + ' pitches');
  }
  errs.push(...trackingErrs(sc));
  const s = sc.situation;
  const lead = s.score.us - s.score.them;
  if (!(lead >= 1)) errs.push('us does not lead');
  if (s.walkOffLive !== (!s.usHome && s.inning >= 9)) errs.push('walkOffLive does not follow the rule');
  if (sc.batters.length < 9) errs.push('fewer than 9 batters');
  if (sc.realFaced > sc.batters.length) errs.push('realFaced past the batters');
  if (!['real', 'proxy'].includes(sc.resolution)) errs.push('resolution');
  if (sc.resolution === 'real' && sc.pitcher.year < 2008) errs.push('real before 2008');
  if (sc.resolution === 'proxy' && sc.pitcher.year >= 2008) errs.push('proxy from 2008 on');
  for (const b of sc.batters) {
    need(b, ['id', 'name', 'bats', 'line', 'szTop', 'szBot', 'profile', 'profileTier'], 'batter ' + b.name);
    const p = b.profile;
    if (!p || p.heat.length !== 25 || p.swing.length !== 25) errs.push('profile grids of ' + b.name);
    if (!['L', 'R'].includes(b.bats)) errs.push('bats of ' + b.name);
    for (const a of ars) if (!(a.type in p.whiff)) errs.push(`whiff ${a.type} for ${b.name}`);
    if (sc.resolution === 'proxy' && !String(b.id).startsWith('retro:')) errs.push('proxy id ' + b.id);
  }
  const rv = pack.reveal;
  need(rv, ['outcome', 'pitches', 'runs', 'summary', 'plateAppearances'], 'reveal');
  if (rv.pitches == null && !rv.pitchesNote) errs.push('null reveal pitches without a note');
  if (!K.OUTCOMES.includes(rv.outcome)) errs.push('reveal outcome');
  // the library: every row sums to 1000, every key with a chance has a real pitch
  for (let bi = 0; bi < sc.batters.length; bi++) {
    for (const a of ars) {
      const e = pack.library[bi][a.type];
      for (let c = 0; c < 25; c++) {
        for (let b = 0; b < 4; b++) {
          const row = e.p[c][b];
          const sum = row.reduce((x, y) => x + y, 0);
          if (sum !== 1000) { errs.push(`row sum ${sum} at ${bi} ${a.type} ${c} ${b}`); break; }
          row.forEach((v, k) => { if (v > 0 && !(e.x[c][k] >= 0)) errs.push(`no pitch for ${pack.keys[k]} at ${bi} ${a.type} ${c}`); });
        }
      }
    }
  }
  // advancement rows: sum to 1, conserve runners
  for (const cat of G.IN_PLAY) for (let o = 0; o < 3; o++) for (let b = 0; b < 8; b++) {
    const rows = pack.advance[cat][o * 8 + b];
    if (!rows) { errs.push(`no advance ${cat} ${o} ${b}`); continue; }
    const sum = rows.reduce((x, r) => x + r[0], 0);
    if (Math.abs(sum - 1) > 1e-3) errs.push(`advance ${cat} ${o} ${b} sums ${sum}`);
    const nb = n => [1, 2, 4].filter(m => n & m).length;
    for (const r of rows) if (o + r[3] < 3 && nb(r[1]) + r[2] + r[3] !== nb(b) + 1) errs.push(`advance ${cat} ${o} ${b} does not conserve`);
  }
  // the lesson's pro examples: well formed (pipeline/check_pros.py checks each
  // against the library)
  const pr = pack.pros;
  if (!pr || !pr.rows) errs.push('no pros');
  else for (const [key, rows] of Object.entries(pr.rows)) {
    const [principle, bucket, platoon, fam] = key.split('|');
    if (!require('../lesson.js').PRINCIPLES.includes(principle) || !G.BUCKETS.includes(bucket) || !['same', 'opp'].includes(platoon)) errs.push('pros key ' + key);
    for (const r of rows) {
      if (r.length !== 13 || pr.pitchers[r[0]] == null || pr.batters[r[1]] == null || !/^\d+:\d+:\d+$/.test(r[12])) { errs.push('pros row ' + key); break; }
      if (K.FAMILY_OF[r[8]] !== fam || G.BUCKETS[G.bucketOf(r[4], r[5])] !== bucket) { errs.push('pros row out of its key ' + key); break; }
    }
  }
  const model = new G.Model(pack);
  if (pack.v !== E.PACK_VERSION) errs.push(`pack format ${pack.v}, the engine reads ${E.PACK_VERSION}`);
  // a slot for every margin from 0 (tied: the inning goes on) to the starting lead
  if (pack.hold.h.length !== model.N * 12 * 3 * 8 * (model.M + 1)) errs.push('hold table size');
  if (pack.hold.h.some(v => v == null)) errs.push('hold table has a hole');
  // a tied state is valued on the tie's goal: three outs before they go ahead
  const tieStart = { ...model.startState(), margin: 0 };
  const tv = model.solve(tieStart).hold;
  if (!(tv > 0 && tv < 1)) errs.push('a tied start is not a probability: ' + tv);
  // the reveal: the end rules say the real outing ran to its result
  if (rv.outcome === 'tie_held' && rv.runs !== lead) errs.push('a held tie whose runs are not the lead');
  if (rv.outcome === 'door_shut' && !(rv.runs < lead)) errs.push('a door shut that gave up the lead');
  if ((rv.outcome === 'walk_off' || rv.outcome === 'doors_open') && !(rv.runs > lead)) errs.push('a blown lead that never went behind');
  if (rv.outcome === 'walk_off' && !s.walkOffLive) errs.push('a walk-off with the walk-off off');
  if (rv.outcome === 'doors_open' && s.walkOffLive) errs.push("door's open with the walk-off live");
  if (sc.realFaced !== rv.plateAppearances.length) errs.push(`realFaced ${sc.realFaced}, the reveal has ${rv.plateAppearances.length}`);
  const po = pack.build && pack.build.pool && pack.build.pool.outcomes;
  if (!po || K.OUTCOMES.some(k => !(k in po))) errs.push('the pool report lacks an outcome');
  if (!(pack.pool.scores.length >= 2000)) errs.push('pool has ' + pack.pool.scores.length + ' runs');
  for (let i = 1; i < pack.pool.scores.length; i++) if (pack.pool.scores[i] < pack.pool.scores[i - 1]) { errs.push('pool scores unsorted'); break; }
  const bytes = statSync(file).size;
  check(`${id}: the pack holds the contract (${(bytes / 1e6).toFixed(2)} MB)`, !errs.length && bytes < MAX_BYTES, errs.slice(0, 5).join('; '));
}

/* the brief's tests ------------------------------------------------------------ */

function playOut(pack, model, seed, chooser) {
  const o = E.createOuting(pack, { seed, mode: 'practice', model });
  let guard = 0;
  while (o.status === 'live' && guard++ < 200) E.throwPitch(o, chooser(o));
  return o;
}

function calibration(pack) {
  const id = pack.scenario.id;
  const model = new G.Model(pack);
  const ars = pack.scenario.pitcher.arsenal;
  const hard = ars.filter(a => K.FAMILY_OF[a.type] === 'hard').sort((a, b) => b.usage - a.usage)[0] || ars[0];
  const mid = { green: 0, yellow: 0, orange: 0, red: 0 };
  let allGreen = true;
  for (let seed = 1; seed <= 40; seed++) {
    for (const g of playOut(pack, model, seed, () => ({ type: hard.type, cell: 12 })).grades) mid[g.band]++;
    const ob = playOut(pack, model, 1000 + seed, o => E.bestCall(o));   // rules 2: the grade's best call, with the history
    if (!ob.grades.every(g => g.band === 'green')) allGreen = false;
  }
  const tot = mid.green + mid.yellow + mid.orange + mid.red;
  const midShare = (mid.orange + mid.red) / tot;
  // a scripted median outing: a closer from the pool, drawn at random, with
  // seeds the pool never used. The median of their percentiles.
  const closers = closersFull;
  const pcts = [];
  if (closers) {
    const pick = R.mulberry32(99);
    for (let i = 0; i < 400; i++) {
      const c = closers[Math.floor(pick() * closers.length)];
      const policy = R.mulberry32(R.hashSeed(`${id}|median|${i}`));
      const o = playOut(pack, model, R.hashSeed(`${id}|median-seed|${i}`), oo => P.closerCall(c, oo, policy));
      pcts.push(E.percentileOf(E.outingScore(o), pack.pool.scores));
    }
  }
  pcts.sort((a, b) => a - b);
  const median = pcts.length ? pcts[Math.floor(pcts.length / 2)] : null;
  return { id, mid, midShare, allGreen, median, pool: pack.build && pack.build.pool, startHold: pack.build && pack.build.startHold };
}

function determinism(pack) {
  const model = new G.Model(pack);
  const rng = R.mulberry32(7);
  const types = model.types;
  const calls = Array.from({ length: 80 }, () => ({ type: types[Math.floor(rng() * types.length)], cell: Math.floor(rng() * 25) }));
  const a = JSON.stringify(E.replay(pack, 4242, calls, { model: new G.Model(pack) }).log);
  const b = JSON.stringify(E.replay(pack, 4242, calls, { model }).log);
  check(`${pack.scenario.id}: the same seed and calls give the same outing`, a === b);
}

/* run ---------------------------------------------------------------------------- */

const args = process.argv.slice(2);
const calibOnly = args.includes('--calib');
const strict = args.includes('--strict');
function calib(name, cond, detail) { console.log((cond ? 'calib ok   ' : 'CALIB miss ') + name + (detail ? ': ' + detail : '')); }
let files = args.filter(a => !a.startsWith('--'));
if (!files.length) {
  try { files = readdirSync(PACKS).filter(f => f.endsWith('.json')).map(f => join(PACKS, f)); } catch (e) { files = []; }
}
if (!files.length) { console.log('no packs to check'); process.exit(0); }
const rows = [];
let bitten = false;
for (const f of files) {
  const pack = JSON.parse(readFileSync(f, 'utf8'));
  if (!calibOnly) { shapeChecks(pack, f); determinism(pack); }
  // the release and spin check bites: a hand on the wrong side, a spin rate past 3,500 and an axis
  // past 360 on a copy of the first Statcast pitcher are each caught
  if (!calibOnly && !bitten && pack.scenario.pitcher.tracking && pack.scenario.pitcher.tracking.system === 'statcast') {
    bitten = true;
    const bad = (fn) => { const sc = JSON.parse(JSON.stringify(pack.scenario)); fn(sc.pitcher); return trackingErrs(sc).length > 0; };
    check(`${pack.scenario.id}: the release and spin check catches a wrong side, a fast spin and an axis past 360`,
      bad((p) => { p.release.x = -p.release.x; }) && bad((p) => { p.arsenal[0].spin.rate = 3600; }) &&
      bad((p) => { p.arsenal[0].spin.axis = 400; }) && bad((p) => { p.arsenal[0].spin = null; }) && !bad(() => {}));
  }
  const c = calibration(pack);
  rows.push(c);
  // A calibration line until the lead rules on the bands (CONTRACT.md section 14:
  // retuned on the real packs, reported before contract.js changes). --strict
  // makes it a failure.
  (strict ? check : calib)(`${c.id}: fastballs down the middle grade mostly orange and red`, c.midShare > 0.5, JSON.stringify(c.mid));
  check(`${c.id}: a scripted best-call outing is all green`, c.allGreen);
  check(`${c.id}: a scripted median outing lands at the 40th to 60th percentile`, c.median != null && c.median >= 40 && c.median <= 60, 'median ' + c.median);
}
console.log('\nband spread of the closer pool\'s calls, per scenario:');
for (const c of rows) {
  const b = c.pool ? c.pool.bands : {};
  const t = Object.values(b).reduce((x, y) => x + y, 0) || 1;
  const pc = k => Math.round((b[k] || 0) / t * 100);
  console.log(`  ${c.id.padEnd(26)} green ${pc('green')}%  yellow ${pc('yellow')}%  orange ${pc('orange')}%  red ${pc('red')}%  ` +
    `| heart fastballs orange+red ${Math.round(c.midShare * 100)}% | start hold ${c.startHold}% | pool holds ${c.pool && Math.round(c.pool.holdRate * 100)}% | median outing ${c.median}th`);
}
console.log(fails ? `${fails} FAILED` : 'all ok');
process.exit(fails ? 1 : 0);
