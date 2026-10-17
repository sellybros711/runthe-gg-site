#!/usr/bin/env node
/* The putting green, checked by PLAYING it.
 *
 *   node golf/putt/check-putt.mjs               physics, the real greens, every themed hole, 21 dailies
 *   node golf/putt/check-putt.mjs --days 120    more dailies (a season is a few minutes)
 *   node golf/putt/check-putt.mjs --quick       physics and the real greens only
 *   node golf/putt/solve.mjs --tour main        what par each Tour hole should carry (the search this replays)
 *
 * A mini-golf hole nobody can make in par renders perfectly. So does one a ball can roll out of
 * through a wall, and one where the ball never stops. None of the three throws, so each hole is
 * played by a solver: a grid of shots from the tee, then a search from the best places they left
 * the ball, ranked by the walking distance to the cup round the walls (not the straight line, or a
 * dogleg ranks the ball beside the wall nearest the cup). Every shot it plays is also watched for
 * the two physics faults: a ball that leaves the course, and one still rolling at the time limit.
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import vm from 'node:vm';
import { replay as replayRoute } from './solve.mjs';
import { hazardRates } from './fair.mjs';
import { loadGyms, kindFiles } from './gyms-node.mjs';
const require = createRequire(import.meta.url);
const P = require('./putt.js');
const M = P.M;
const args = process.argv.slice(2);
const QUICK = args.includes('--quick');
const DAYS = +(args[args.indexOf('--days') + 1] || 21) || 21;

let fails = 0;
const ok = m => console.log('  ok  ', m);
const fail = m => { fails++; console.log('  FAIL', m); };
const claim = (c, m) => c ? ok(m) : fail(m);
const head = s => console.log('\n' + s);

/* ============================================================================ 1. THE PHYSICS */
head('1. THE PHYSICS');
const flat = (stimp, comps) => P.finishCourse({ bounds:[-60, -60, 60, 60], comps:comps || [], stimp, cup:[0, -58], cupR:P.CUP_R, matFn:() => M.GREEN });
for (const s of [9, 11, 13.5]){
  const C = flat(s), r = P.simulate(C, 0, 40, 0, -P.V_STIMP, 0);
  claim(Math.abs((40 - r.rest[1]) - s) < 0.05, `a ball released at 6 ft/s rolls the stimp reading (${s} ft): ${(40 - r.rest[1]).toFixed(2)}`);
}
{
  const C = flat(11), r = P.simulate(C, 0, 30, 0, -P.speedFor(C, 20), 0);
  claim(Math.abs((30 - r.rest[1]) - 20) < 0.05, `speedFor(20 ft) rolls 20 ft on the flat: ${(30 - r.rest[1]).toFixed(2)}`);
  claim(Math.abs(P.feetFor(C, P.speedFor(C, 20)) - 20) < 1e-9, 'feetFor is the inverse of speedFor');
}
{
  const up = flat(11, [{ k:'plane', gx:0, gy:-0.03 }]), dn = flat(11, [{ k:'plane', gx:0, gy:0.03 }]);
  const v = P.speedFor(up, 15), ru = P.simulate(up, 0, 40, 0, -v, 0), rd = P.simulate(dn, 0, 40, 0, -v, 0);
  const du = 40 - ru.rest[1], dd = 40 - rd.rest[1];
  claim(du < 15 && dd > 15, `uphill is shorter (${du.toFixed(1)}) and downhill longer (${dd.toFixed(1)}) than the flat 15 ft`);
  const side = flat(11, [{ k:'plane', gx:0.02, gy:0 }]), rs = P.simulate(side, 0, 40, 0, -P.speedFor(side, 20), 0);
  claim(rs.rest[0] < -0.5, `a green higher on the right breaks the putt left: ${rs.rest[0].toFixed(2)} ft`);
  // a ball on a slope steeper than friction can hold never stops on it, and one on a gentle one does
  const steep = flat(11, [{ k:'plane', gx:0, gy:0.12 }]), rs2 = P.simulate(steep, 0, 0, 0, 0, 0);
  claim(Math.hypot(rs2.rest[0], rs2.rest[1]) > 1, 'a ball set down on a 12% slope rolls away');
  const gent = flat(11, [{ k:'plane', gx:0, gy:0.03 }]), rs3 = P.simulate(gent, 0, 0, 0, 0, 0);
  claim(Math.hypot(rs3.rest[0], rs3.rest[1]) < 0.01, 'a ball set down on a 3% slope stays');
  // STARS: par clears a hole (1), under par 2, an ace 3, and the worlds open on a running total of 40 a world
  { const TR = P.TOURS.main, tp = { lv:1, best:{} };
    claim(P.starsOf(4, 3) === 0 && P.starsOf(3, 3) === 1 && P.starsOf(2, 3) === 2 && P.starsOf(1, 3) === 3 && P.starsOf(1, 2) === 3, 'stars: over par 0, par 1, under par 2, an ace 3');
    for (let n = 1; n <= 17; n++) tp.best[n] = TR.levels[n - 1].par;
    claim(P.frontier(tp, TR) === 18, 'par on every hole walks a world up to its last hole');
    tp.best[18] = TR.levels[17].par;
    claim(P.worldGate(TR, 0) === 40 && P.worldGate(TR, 1) === 80 && P.frontier(tp, TR) === 18, 'a world of pars (18 stars) does not open the next: world 2 opens at 40 stars and world 3 at 80');
    for (let n = 1; n <= 18; n++) tp.best[n] = 1;
    claim(P.starsThrough(tp, TR, 0) === 54 && P.frontier(tp, TR) === 19, 'a perfect world 1 (54 stars) opens world 2');
    for (let n = 19; n <= 36; n++) tp.best[n] = TR.levels[n - 1].par;
    claim(P.starsThrough(tp, TR, 1) === 72 && P.frontier(tp, TR) === 36, '72 stars across two worlds does not open world 3');
    { const t2 = { lv:1, best:{} }; for (let n = 1; n <= 18; n++) t2.best[n] = n <= 4 ? 1 : TR.levels[n - 1].par;
      const s0 = P.starsThrough(t2, TR, 0); claim(s0 === 26 && P.frontier(t2, TR) === 18, 'world 1 at 26 stars does not open world 2');
      for (let n = 5; n <= 11; n++) t2.best[n] = 1;
      claim(P.starsThrough(t2, TR, 0) === 40 && P.frontier(t2, TR) === 19, 'exactly 40 stars opens world 2'); }
    for (let n = 19; n <= 36; n++) tp.best[n] = 1;
    claim(P.frontier(tp, TR) === 37, 'stars spread however a player likes: 108 across two worlds opens world 3');
    for (let n = 28; n <= 36; n++) tp.best[n] = TR.levels[n - 1].par;
    claim(P.worldStars(tp, TR, 1) === 36 && P.starsThrough(tp, TR, 1) === 90 && P.frontier(tp, TR) === 37, 'the running total is what is asked: 54 and 36 open world 3 though world 2 alone is under 40');
    claim(P.worldGate(P.TOURS.members, 0) === 20 && P.worldGate(P.TOURS.members, 1) === 40, 'the Members Tour gates its nine hole worlds at 20 a world');
    claim(P.frontier({ lv:40, best:{} }, TR) === 40, 'a record never loses a hole it already had open'); }
}
{
  const C = P.finishCourse({ bounds:[-20, -20, 20, 20], comps:[], stimp:11, cup:[0, 0], cupR:P.CUP_R, matFn:() => M.GREEN });
  const atCup = v => { const r = P.simulate(C, 0, 6, 0, -Math.sqrt(v * v + 2 * P.fricOf(C, M.GREEN) * 6), 0); return r; };
  claim(atCup(1.5).holed, 'a putt dying at the hole drops');
  claim(!atCup(7).holed, 'a putt arriving at 7 ft/s skips over the hole');
  let vmax = 0; for (let v = 1; v < 8; v += 0.1) if (atCup(v).holed) vmax = v;
  claim(vmax > 4 && vmax < 6, `the fastest centred putt that drops arrives at ${vmax.toFixed(1)} ft/s (real greens: about 4.3 to 5)`);
  const edge = P.simulate(C, 0.17, 6, 0, -P.speedFor(C, 8), 0);
  claim(!edge.holed && edge.ev.some(e => e[1] === 'lip'), 'a firm putt catching the edge lips out');
  const a = P.simulate(C, 0.3, 9, -0.05, -5.2, 0), b = P.simulate(C, 0.3, 9, -0.05, -5.2, 0);
  claim(JSON.stringify(a.pts) === JSON.stringify(b.pts), 'the same putt does the same thing, every time');
}

/* ================================================================= 1b. EVERY REWARD IS A CLOSET ITEM */
/* What the tours pay is worn on the golfer (the owner's call, 2026-10-16): each name maps to one closet item, an old
   name on a saved record still reads as its item, and ownership is the record's alone. The page side (prices, packs,
   boosts, art) is golf/check-boosts.mjs. */
head('1b. EVERY REWARD IS A CLOSET ITEM');
{
  const items = P.rewardItems(), names = items.map(r => r.name), paid = [];
  ['main', 'members'].forEach(t => { const PY = P.PAY[t]; paid.push(...(PY.sigReward || []), ...(PY.worldReward || [])); if (PY.finish) paid.push(PY.finish); if (PY.treat) paid.push(PY.treat.reward); });
  paid.push(P.PAY.secret.allReward);
  const bare = paid.map(n => n.replace(' (Members only)', ''));
  claim(bare.every(n => names.includes(n)) && names.every(n => bare.includes(n)), `every name the tours pay (${paid.length}) is one reward item, and every item is paid by a tour`);
  claim(new Set(items.map(r => r.key)).size === items.length && items.every(r => /^(hw|ew|bl|ct|pu|tp):pp[a-z]+$/.test(r.key)), 'each maps to its own pp item key (cat:id)');
  claim(paid.includes('Hallows Lantern Ball (Members only)') && !paid.some(n => /Jack-o/.test(n)), 'the Members candy bag pays the Hallows Lantern Ball, not a second Jack-o-Lantern');
  const had = globalThis.localStorage, mem = {};
  globalThis.localStorage = { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: k => { delete mem[k]; } };
  const owns = rec => { if (rec) mem.bag_ppt_v1 = JSON.stringify(rec); else delete mem.bag_ppt_v1; return items.filter(r => P.rewardOwned(r.key)).map(r => r.name); };
  claim(owns(null).length === 0, 'a fresh record owns none');
  claim(owns({ v:2, tours:{ main:{ wpaid:{ 0:1 } } } }).join() === 'Clubhouse Visor,Clubhouse Cleats', 'world 1 cleared owns the Clubhouse Visor and the Clubhouse Cleats');
  claim(owns({ v:2, tours:{ main:{ best:{ 18:3 } } } }).join() === 'Clubhouse Visor,Clubhouse Cleats', 'world 1\'s signature hole beaten owns the same two, payout or not (a tester\'s old record)');
  claim(owns({ v:2, tours:{ main:{ best:{ 18:9 } } } }).length === 0, 'the signature hole over par owns nothing');
  const old = { 'Clubhouse Polo':'Clubhouse Cleats', 'Sprinkle Trail':'Sprinkle Ball', 'High Score Celebration':'Pixel Shades', 'Treasure Trail':'Pirate Eyepatch',
    'Eruption Celebration':'Lava Rock Cleats', 'Rainbow Trail':'Aviator Goggles', 'Footprint Trail':'Dino Claw Cleats', 'Thaw Celebration':'Snow Goggles',
    'Phantom Trail (Members only)':'Phantom Mask', 'Jack-o’-Lantern Ball (Members only)':'Hallows Lantern Ball' };
  claim(Object.keys(old).every(o => owns({ v:2, tours:{}, rewards:[o] }).join() === old[o]), 'each old reward name on a saved record owns its new item');
  const nine = {}; for (let i = 1; i <= 9; i++) nine[i] = 1;
  claim(owns({ v:2, tours:{ members:{ treat:nine } } }).join() === 'Hallows Lantern Ball', 'a full candy bag owns the Hallows Lantern Ball');
  const ten = {}; for (let i = 1; i <= P.PAY.secret.ten; i++) ten[i] = 1;
  claim(owns({ v:2, tours:{ secret:{ paid:ten } } }).join() === 'Diamond Putter', `${P.PAY.secret.ten} secret holes beaten owns the Diamond Putter`);
  delete ten[P.PAY.secret.ten]; claim(owns({ v:2, tours:{ secret:{ paid:ten } } }).length === 0, 'one fewer owns nothing');
  const hints = items.map(r => P.rewardHint(r.key));
  claim(hints.every(h => / in Putt Putt\./.test(h) && !new RegExp('[' + String.fromCharCode(8211, 8212) + ']').test(h)), 'every item says where to win it, with no dash');
  if (had === undefined) delete globalThis.localStorage; else globalThis.localStorage = had;
}

/* ======================================================================== 2. THE REAL GREENS */
head('2. THE REAL GREENS');
/* The courses are read out of the game itself, so a course added to the Daily rotation is checked
   here the day it lands. The greens are built from a stand-in for hvGeom with the same shape rules
   (an irregular ellipse in yards); the browser half below builds them off the real one. */
const SRC = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const COURSES = (() => {
  const i = SRC.indexOf('const DAILY_COURSES=') + 20; let d = 0, j = i, q = false;
  for (; j < SRC.length; j++){ const c = SRC[j];
    if (q){ if (c === '\\'){ j++; continue; } if (c === '"') q = false; continue; }
    if (c === '"') q = true; else if (c === '{') d++; else if (c === '}'){ d--; if (!d){ j++; break; } } }
  return vm.runInNewContext('(' + SRC.slice(i, j) + ')');
})();
const keys = Object.keys(COURSES);
claim(keys.length > 30, `${keys.length} courses read from golf/index.html`);
const chars = keys.map(k => [k, P.greenCharacter(COURSES[k])]);
claim(chars.every(([, c]) => c.stimp >= 9.5 && c.stimp <= 14), 'every course rolls between 9.5 and 14 on the stimp');
const st = k => chars.find(c => c[0] === k)[1];
claim(st('Oakmont').stimp > st('Plantation Course at Kapalua').stimp, `Grindstone (${st('Oakmont').stimp.toFixed(1)}) runs faster than Trade Winds (${st('Plantation Course at Kapalua').stimp.toFixed(1)})`);
claim(st('Pinehurst No. 2').crown, 'Longleaf No. 2 has turtleback greens, because its blurb says so');
claim(st('St Andrews Old Course').humps, 'the Auld Links has humps');
function fakeSpec(k, idx){
  const r = P.mulberry(P.hstr(k + ':' + idx)), rx = (12 + r() * 6) * 3, ry = (10 + r() * 6) * 3, ph = [r() * 6.28, r() * 6.28, r() * 6.28], irr = 0.13 + r() * 0.15;
  const mod = (x, y) => { const a = Math.atan2(y / ry, x / rx); return 1 + irr * (Math.sin(a * 3 + ph[0]) * 0.55 + Math.sin(a * 2 + ph[1]) * 0.34 + Math.sin(a * 5 + ph[2]) * 0.22); };
  const ins = (x, y, m) => { const gd = x * x / (rx * rx) + y * y / (ry * ry), gm = mod(x, y); return gd <= gm * gm * m; };
  return { seed:P.hstr(k) ^ idx, name:COURSES[k].v, sub:'Hole ' + (idx + 1), rx, ry, inGreen:(x, y) => ins(x, y, 1), inFringe:(x, y) => ins(x, y, 1.32), wet:null,
    bunkers:[{ x:rx * 1.15, y:ry * 0.2, r:12, ry:9, ph:1 }],
    pins:[[0, ry * 0.5], [0, -ry * 0.5], [-rx * 0.5, 0], [rx * 0.5, 0]], character:P.greenCharacter(COURSES[k]) };
}
let pinsFlat = 0, pinsAll = 0, spotsOk = 0, spotsAll = 0, oneputts = 0, tried = 0, worst = 0, worstAt = '';
const pick = keys;
for (const k of pick){
  for (let h = 0; h < 2; h++){
    const spec = fakeSpec(k, h);
    for (let pin = 0; pin < 4; pin++){
      const C = P.buildReal(spec, { pin });
      pinsAll++;
      const g = Math.hypot(C.field.gx(C.cup[0], C.cup[1]), C.field.gy(C.cup[0], C.cup[1]));
      if (g < 0.03) pinsFlat++; if (g > worst){ worst = g; worstAt = `${k} hole ${h + 1} pin ${pin}`; }
      if (pin !== 0) continue;
      const rnd = P.mulberry(P.hstr(k + h));
      for (const ft of [8, 20, 35]){
        spotsAll++; const sp = P.spotFor(C, ft, rnd); if (!sp) continue; spotsOk++;
        if (ft !== 8) continue;
        // an 8 footer is makeable: somewhere in a fan of aims and weights a putt drops
        tried++;
        const base = Math.atan2(C.cup[1] - sp[1], C.cup[0] - sp[0]);
        let made = false;
        for (let da = -0.7; da <= 0.7 && !made; da += 0.015) for (let f = 2; f <= 16 && !made; f += 0.4){
          const v = P.speedFor(C, f), r = P.simulate(C, sp[0], sp[1], Math.cos(base + da) * v, Math.sin(base + da) * v, 0);
          if (r.holed) made = true; }
        if (made) oneputts++;
      }
    }
  }
}
claim(pinsFlat === pinsAll, `every pin is cut where the green is under 3% (${pinsFlat}/${pinsAll}; steepest ${(worst * 100).toFixed(1)}% at ${worstAt})`);
claim(spotsOk / spotsAll > 0.95, `a ball spot is found at 8, 20 and 35 ft (${spotsOk}/${spotsAll})`);
claim(oneputts === tried, `every 8 footer can be holed (${oneputts}/${tried})`);

/* ======================================================================== 3. MINI GOLF: SOLVED */
/* walking distance to the cup over the course, round walls and blocks, through tunnels */
function geodesic(C){
  const res = 0.5, b = C.bounds, nx = Math.ceil((b[2] - b[0]) / res) + 1, ny = Math.ceil((b[3] - b[1]) / res) + 1;
  const pass = new Uint8Array(nx * ny), D = new Float32Array(nx * ny).fill(1e9);
  const solid = (x, y) => C.blocks.some(r => P.inBlock(r, x, y, 0.1)) || C.bumpers.some(u => Math.hypot(x - u.x, y - u.y) < u.r + 0.1);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++){ const x = b[0] + i * res, y = b[1] + j * res, m = C.mats.at(x, y);
    pass[j * nx + i] = (m !== M.OUT && m !== M.WATER && !solid(x, y)) ? 1 : 0; }
  const idx = (x, y) => Math.round((y - b[1]) / res) * nx + Math.round((x - b[0]) / res);
  const q = [idx(C.cup[0], C.cup[1])]; D[q[0]] = 0;
  // portals run backward for this search: the exit cell reaches the entry cell
  const back = new Map(); C.portals.forEach(p => back.set(idx(p.bx, p.by), idx(p.ax, p.ay)));
  for (let h = 0; h < q.length; h++){ const o = q[h], i = o % nx, j = (o / nx) | 0, d = D[o];
    const nb = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
    for (const [di, dj, w] of nb){ const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= nx || jj >= ny) continue;
      const o2 = jj * nx + ii; if (!pass[o2]) continue; const nd = d + w * res; if (nd < D[o2]){ D[o2] = nd; q.push(o2); } }
    for (const [ex, en] of back){ if (Math.abs((ex % nx) - i) <= 2 && Math.abs(((ex / nx) | 0) - j) <= 2 && D[en] > d + 1){ D[en] = d + 1; q.push(en); } } }
  return (x, y) => { const v = D[idx(x, y)]; return v === undefined ? 1e9 : v; };
}
function playShot(C, x, y, ang, ft, t0){ const v = P.speedFor(C, ft); return P.simulate(C, x, y, Math.cos(ang) * v, Math.sin(ang) * v, t0); }
let escapes = 0, stuck = 0;
function watch(r){ if (r.out) escapes++; if (r.t > 23.9) stuck++; return r; }
/* the fewest strokes the solver finds, up to `cap` */
function solve(C, cap){
  const geo = geodesic(C), t0s = C.movers.length ? [0, 0.9, 1.7] : [0];
  let frontier = [{ x:C.tee[0], y:C.tee[1], t:0 }], aces = 0, total = 0;
  for (let s = 1; s <= cap; s++){
    const next = [];
    for (const f of frontier){
      const fine = s > 1, base = Math.atan2(C.cup[1] - f.y, C.cup[0] - f.x);
      for (const t0 of t0s){
        const angs = [];
        if (fine) for (let a = -1.2; a <= 1.2; a += 0.012) angs.push(base + a);
        for (let a = 0; a < 360; a += fine ? 4 : 2.5) angs.push(a * Math.PI / 180);
        for (const ang of angs) for (let ft = 2; ft <= 46; ft += fine ? 1 : 2){
          const r = watch(playShot(C, f.x, f.y, ang, ft, t0 + f.t)); total++;
          if (r.holed){ if (s === 1) aces++; else return { strokes:s, aces, total }; continue; }
          if (r.water || r.out) continue;
          next.push({ x:r.rest[0], y:r.rest[1], t:f.t + r.t + 2, d:geo(r.rest[0], r.rest[1]) });
        }
      }
      if (s === 1 && aces) return { strokes:1, aces, total };
    }
    next.sort((a, b) => a.d - b.d);
    const keep = []; for (const n of next){ if (keep.length >= 5) break; if (keep.every(k => Math.hypot(k.x - n.x, k.y - n.y) > 1.2)) keep.push(n); }
    frontier = keep;
  }
  return { strokes:Infinity, aces, total };
}
/* THE TOUR'S RULE IS UNDER PAR, so a Tour hole is only fair if a skilled player can get round in
   par - 1 without luck. solve.mjs searches for that line (a holing putt only counts if the putts either
   side of it mostly hole too) and records it in routes.json; this file REPLAYS it, which takes seconds
   rather than the best part of an hour. A hole edited since its route was found fails here until
   `node golf/putt/solve.mjs --tour main --only N --write` is run again. */
function checkHole(C, label){
  claim(C.mats.at(C.tee[0], C.tee[1]) === M.GREEN && C.mats.at(C.cup[0], C.cup[1]) === M.GREEN, `${label}: the tee and the cup are on the carpet`);
  const r = solve(C, C.par);
  claim(r.strokes <= C.par, `${label}: holed in ${r.strokes === Infinity ? 'more than ' + C.par : r.strokes} (par ${C.par}, ${r.total} shots searched)`);
  return r;
}
if (!QUICK){
  head('3. EVERY THEMED HOLE, PLAYED TO PAR');
  for (const th of P.CAL_THEMES){
    const holes = P.themedCourse(th);
    claim(holes.length === 9 && P.THEMES[th].holes.length === 9, `${P.THEMES[th].name} has nine holes and nine names`);
    let par = 0;
    for (const d of holes){ const C = P.buildFrom(d); par += C.par; checkHole(C, `${P.THEMES[th].name} ${d.n} ${d.name} (${d.tpl})`); }
    claim(par >= 20 && par <= 28, `${P.THEMES[th].name} plays to a par of ${par}`);
  }
  head('3b. BOTH TOURS: EVERY HOLE BEATEN UNDER PAR, WITHOUT LUCK, BY ITS RECORDED ROUTE');
  const ROUTES = JSON.parse(fs.readFileSync(new URL('./routes.json', import.meta.url), 'utf8'));
  /* THREE STARS HAS TO BE MAKEABLE. It is two under par, so on a par 3 it is the ace. Of the routes a
     hole carries (the obvious one, the secret one, and the ace the solver looks for apart, :3), one has
     to reach three stars and replay with the room for error every recorded putt gets. A star a player
     can see and never earn is the unearnable badge in a different coat. */
  const threeStars = (TR, n, C, L) => { const want = P.threeOf(L.par, L.three);
    const ok = ['', ':sc', ':3'].map(k => ROUTES[TR.id + ':' + n + k]).filter(l => l && l.length <= want).find(l => !replayRoute(C, l));
    claim(!!ok && P.starsOf(ok.length, L.par, L.three) === 3, `${TR.id} ${n} ${P.levelName(n, TR.id)}: three stars (${want === 1 ? 'an ace' : want + ' strokes'}) has a route that replays with room for error`); };
  const TM = P.TOURS.main, TB = P.TOURS.members, Cn = P.PAY;
  claim(TM.levels.length === 198 && TM.worlds.length === 11 && TM.per === 18, `the main tour is 198 holes in ${TM.worlds.length} worlds of ${TM.per}`);
  claim(TB.levels.length === 18 && TB.worlds.length === 2 && TB.per === 9 && TB.members, `the Members Tour is 18 holes in ${TB.worlds.length} worlds of ${TB.per}`);
  claim(TM.worlds.every(W => P.CAL_THEMES.indexOf(W.theme) < 0), 'the main tour wears none of the calendar themes, which belong to the passes (' + TM.worlds.map(W => W.theme).join(', ') + ')');
  for (const TR of [TM, TB]){
    claim(TR.levels.every((L, i) => !!L.sig === ((i + 1) % TR.per === 0)), `${TR.name}: the last hole of each world, and only it, is a signature hole`);
    claim(TR.levels.every((L, i) => i === 0 || L.par >= 3), `${TR.name}: no par under 3`);
    const shapes = new Set(), secrets = {}, wet = [];
    for (let n = 1; n <= TR.levels.length; n++){ const L = TR.levels[n - 1], C = P.buildLevel(n, TR.id), name = `${TR.id} ${n} ${P.levelName(n, TR.id)}`;
      shapes.add(JSON.stringify((C.polys || [C.poly]).map(q => q.map(p => p.map(v => Math.round(v * 2))))) + C.cup.join() + C.bumpers.length + C.blocks.length + C.movers.length + C.zones.length + C.portals.length + C.loops.length + C.ramps.length);
      // EVERY HOLE HAS SOMETHING IN IT: an obstacle, a puzzle or a moving part, never bare carpet
      const kit = C.bumpers.length + C.blocks.length + C.movers.length + C.portals.length + C.loops.length + C.ramps.length + C.bridges.length + C.turns.length + (C.belts || []).length + (C.ferries || []).length + (C.mill ? 1 : 0) + C.zones.length;
      claim(kit > 0, `${name}: has an obstacle`);
      claim(C.mats.at(C.tee[0], C.tee[1]) === M.GREEN && C.mats.at(C.cup[0], C.cup[1]) === M.GREEN, `${name}: tee and cup on the carpet`);
      /* THE OBVIOUS ROUTE never goes through the hole's secret, and it is a birdie: par is that route
         plus one. A hole with a secret also carries the secret route, which has to be strictly shorter
         and has to use it, so the hole that rewards looking harder really does pay in strokes. */
      const line = ROUTES[TR.id + ':' + n], why = line ? replayRoute(C, line, 'obvious') : 'no route recorded';
      claim(!why && (line.length === L.par - 1 || (L.par === 3 && line.length === 1)), `${name}: the obvious route is a birdie: ${line ? line.length : '?'} putts against par ${L.par}, with room for error` + (why ? ': ' + why : ''));
      if ((C.secret || []).length){ secrets[n] = 1; const sl = ROUTES[TR.id + ':' + n + ':sc'], sw = sl ? replayRoute(C, sl, 'secret') : 'no secret route recorded';
        claim(!sw && line && sl.length < line.length, `${name}: the secret line is shorter: ${sl ? sl.length : '?'} putts against ${line ? line.length : '?'}` + (sw ? ': ' + sw : '')); }
      threeStars(TR, n, C, L);
      // A PERSON IS A COUPLE OF DEGREES OFF. No putt on the obvious route may put that person in the water or off the course more than a third of the time
      if (line && !why){ const hz = hazardRates(C, line, 80), worst = Math.max(...hz); wet.push(worst); claim(worst <= 0.34, `${name}: a slightly off putt on the obvious route stays dry (${hz.map(h => Math.round(h * 100) + '%').join(' ')})`); } }
    /* NO TUNNELS. A pipe that carried the ball out of sight to a spot beside the cup handed out aces and
       read as a trick, so the tours have none: tiers are joined by a ramp lane (climb) or a jump, and a long
       hole's secret is a kicker in plain sight. Every world still hides at least one secret line. */
    /* The Members worlds are nine holes each, every cup in a pen, so a shortcut that saves a stroke rarely
       exists there; the Members Tour as a whole keeps at least one. The main tour asks it of every world. */
    if (TR.members) claim(Object.keys(secrets).length >= 1, `${TR.name}: the tour hides at least one secret line (${Object.keys(secrets).length} in all)`);
    else claim(TR.worlds.every((W, w) => { let k = 0; for (let n = w * TR.per + 1; n <= (w + 1) * TR.per; n++) k += secrets[n] || 0; return k >= 1; }), `${TR.name}: every world hides at least one secret line (${Object.keys(secrets).length} in all)`);
    { const tun = []; for (let n = 1; n <= TR.levels.length; n++) if (P.buildLevel(n, TR.id).portals.length) tun.push(n); claim(!tun.length, `${TR.name}: no hole carries a tunnel` + (tun.length ? ' (' + tun.join(', ') + ')' : '')); }
    { const bad = TR.levels.map((L, i) => L.three && L.three !== L.par - 1 ? i + 1 : 0).filter(Boolean); claim(!bad.length, `${TR.name}: a hole's own three-star target is a birdie, never easier` + (bad.length ? ' (' + bad.join(', ') + ')' : '')); }
    const wm = wet.reduce((a, b) => a + b, 0) / Math.max(1, wet.length);
    claim(wm <= 0.1, `${TR.name}: on average the worst putt of a hole goes wet or out ${Math.round(wm * 100)}% of the time for a slightly off player`);
    claim(shapes.size === TR.levels.length, `${TR.name}: no two holes share a layout (${shapes.size} distinct)`);
    // HARDER AS IT GOES: each world packs more into a hole than the one before, and asks for more putts
    const per = (fn) => TR.worlds.map((W, w) => { let t = 0; for (let n = w * TR.per + 1; n <= (w + 1) * TR.per; n++) t += fn(n); return t / TR.per; });
    // a rail or a curb is something to aim at, not a set piece, so a thin block is not counted
    const kitAvg = per(n => { const C = P.buildLevel(n, TR.id); return C.bumpers.length + C.blocks.filter(r => Math.min(r.x1 - r.x0, r.y1 - r.y0) > 0.7).length + C.movers.length + C.portals.length + C.loops.length + C.ramps.length + C.bridges.length + C.turns.length + (C.belts || []).length + (C.ferries || []).length + (C.mill ? 1 : 0) + C.zones.length; });
    const parAvg = per(n => TR.levels[n - 1].par);
    claim(kitAvg.every((a, w) => !w || a > kitAvg[w - 1]), `${TR.name}: more set pieces a hole world by world (${kitAvg.map(a => a.toFixed(2)).join(', ')})`);
    claim(parAvg[parAvg.length - 1] > parAvg[0], `${TR.name}: the last world asks for more putts than the first (par ${parAvg.map(a => a.toFixed(2)).join(', ')})`);
  }
  /* THE LAB: the tester-only prototype world. Same rule as the tours (the obvious route is a birdie
     with room for error, a slightly off putt stays dry), and it pays nothing, so it can never be a
     way round the tour's economy. */
  { const TL = P.TOURS.lab;
    claim(TL && TL.lab && TL.levels.length === 8 && TL.worlds.length === 1 && TL.per === 8, 'the Lab is one world of eight prototype holes');
    claim(['hole', 'sig', 'ace', 'world'].every(k => Cn.lab[k] === 0), 'the Lab pays nothing');
    for (let n = 1; n <= TL.levels.length; n++){ const L = TL.levels[n - 1], C = P.buildLevel(n, 'lab'), name = `lab ${n} ${P.levelName(n, 'lab')}`;
      const line = ROUTES['lab:' + n], why = line ? replayRoute(C, line, 'obvious') : 'no route recorded';
      claim(!why && (line.length === L.par - 1 || (L.par === 3 && line.length === 1)), `${name}: the obvious route is a birdie: ${line ? line.length : '?'} putts against par ${L.par}` + (why ? ': ' + why : ''));
      if (line && !why){ const hz = hazardRates(C, line, 80), worst = Math.max(...hz); claim(worst <= 0.34, `${name}: a slightly off putt stays dry (${hz.map(h => Math.round(h * 100) + '%').join(' ')})`); }
      threeStars(TL, n, C, L); }
    // THE SWITCH: shut until the plate is rolled over, and the recorded route rolls over it
    const C = P.buildLevel(5, 'lab'), dr = C.movers.find(m => m.k === 'door'), v = P.speedFor(C, 30);
    const bl = Math.hypot(0 - C.tee[0], -18.8 - C.tee[1]), blind = P.simulate(C, C.tee[0], C.tee[1], (0 - C.tee[0]) / bl * v, (-18.8 - C.tee[1]) / bl * v, 0);
    claim(!!dr && blind.pts.every(p => p[1] > -19.3) && !blind.ev.some(e => e[1] === 'plate'), 'the Switch door holds a putt that never touched its plate');
    const sl = ROUTES['lab:5'], f = sl && sl[0], sv = f && P.speedFor(C, f[1]), first = f && P.simulate(C, C.tee[0], C.tee[1], Math.cos(f[0]) * sv, Math.sin(f[0]) * sv, f[2]);
    claim(!!first && first.ev.some(e => e[1] === 'plate') && first.pts.some(p => p[1] < -19.3), 'the Switch route rolls over the plate and through the door it opened');
    /* THE FERRY: the recorded first putt rolls onto the deck, rides it across and is put ashore on the landing
       past the left dock (x < -6). The same putt struck when the deck is at the far dock goes in the hazard. */
    const Cf = P.buildLevel(7, 'lab'), fl = ROUTES['lab:7'], f1 = fl && fl[0], fv = f1 && P.speedFor(Cf, f1[1]);
    const ride = f1 && P.simulate(Cf, Cf.tee[0], Cf.tee[1], Math.cos(f1[0]) * fv, Math.sin(f1[0]) * fv, f1[2]), away = f1 && P.simulate(Cf, Cf.tee[0], Cf.tee[1], Math.cos(f1[0]) * fv, Math.sin(f1[0]) * fv, f1[2] + Cf.ferries[0].move + Cf.ferries[0].dwell);
    claim(!!ride && ride.ev.some(e => e[1] === 'deck') && !ride.water && ride.rest[0] < -6 && !!away && away.water, `the Ferry carries the ball across and puts it ashore, and the same putt with the deck away goes in (ashore at x ${ride ? ride.rest[0].toFixed(1) : '?'}, away wet ${away && away.water})`); }
  /* THE SECRET HOLES: one a world, in the main tour's world order, each in its own place (C.scene). Same rule as
     the tours: the recorded route is a birdie with room for error, a slightly off putt stays dry, three stars is
     makeable. They are free and pay once, and ten beaten wins the Diamond Putter. */
  { const TS = P.TOURS.secret;
    claim(TS && TS.secret && TS.levels.length === TM.worlds.length && TS.per === 1 && TS.worlds.every((W, w) => W.theme === TM.worlds[w].theme), `one secret hole a world, in the tour's world order (${TS ? TS.levels.length : 0})`);
    claim(Cn.secret && Cn.secret.hole > 0 && Cn.secret.ten === 10 && Cn.secret.allReward === 'Diamond Putter', 'a secret hole pays the first time it is beaten, and ten beaten win the Diamond Putter');
    const scenes = new Set();
    for (let n = 1; n <= TS.levels.length; n++){ const L = TS.levels[n - 1], C = P.buildLevel(n, 'secret'), name = `secret ${n} ${P.levelName(n, 'secret')}`; scenes.add(C.scene);
      const line = ROUTES['secret:' + n], why = line ? replayRoute(C, line, 'obvious') : 'no route recorded';
      claim(!why && (line.length === L.par - 1 || (L.par === 3 && line.length === 1)), `${name}: the obvious route is a birdie: ${line ? line.length : '?'} putts against par ${L.par}` + (why ? ': ' + why : ''));
      if (line && !why){ const hz = hazardRates(C, line, 80), worst = Math.max(...hz); claim(worst <= 0.34, `${name}: a slightly off putt stays dry (${hz.map(h => Math.round(h * 100) + '%').join(' ')})`); }
      threeStars(TS, n, C, L); }
    claim(scenes.size === TS.levels.length && ![...scenes].includes(undefined), `every secret hole is played in a place of its own (${[...scenes].join(', ')})`); }
  const mw = TM.levels.filter(L => !L.sig).length / TM.worlds.length * Cn.main.hole + Cn.main.sig + TM.per * Cn.main.ace + Cn.main.world;
  claim(mw === 4000, `the main tour pays 4,000 coins a world, ${mw * P.TOURS.main.worlds.length} in all (${mw} a world)`);
  claim(Cn.members.exclusive && Cn.members.hole > Cn.main.hole && Cn.members.sig > Cn.main.sig && /Members only/.test(Cn.members.finish), 'the Members Tour pays more a hole and carries rewards only members can earn');
  // HALLOWS NIGHT IS ITS OWN, NOT HARDER: one trick a hole, so no Hallows hole carries more set pieces than the
  // busiest hole of the tour's middle worlds, it asks no more putts than they do, and the trick or treat bonus is there
  { const T = Cn.members.treat, kit = n => { const C = P.buildLevel(n, 'members'); return C.movers.length + C.loops.length + C.ramps.length + C.bridges.length + C.turns.length + (C.rivers || []).length + (C.mill ? 1 : 0) + C.zones.filter(z => z.m === M.WATER).length; };
    const hh = []; for (let n = 1; n <= TB.per; n++) hh.push(kit(n));
    claim(hh.every(k => k <= 2) && TB.levels.slice(0, TB.per).every(L => L.par <= (L.sig ? 4 : 3)), `Hallows Night: one trick a hole, at most two moving or wet pieces (${hh.join(' ')}), par 3 and a par 4 signature`);
    claim(T && T.w === 0 && T.each > 0 && T.all > 0 && /Members only/.test(T.reward), 'Hallows Night pays a trick or treat bonus under par, and a members-only reward for all nine'); }
  head(`4. ${DAYS} DAILY HOLES FROM TODAY`);
  const day0 = new Date(Date.UTC(2026, 9, 1));
  const themesSeen = new Set();
  for (let i = 0; i < DAYS; i++){
    const d = new Date(day0.getTime() + i * 86400000), key = d.toISOString().slice(0, 10), desc = P.dailyHole(key);
    themesSeen.add(desc.theme);
    claim(desc.theme === P.themeForDay(key), `${key} is ${desc.theme}`);
    // THE DAILY IS A TOUR HOLE IN THE DAY'S CLOTHES, and the tour's own route beats it in them
    const C = P.buildFrom(desc), line = ROUTES['main:' + desc.tour], why = line ? replayRoute(C, line) : 'no route';
    claim(desc.tour >= 19 && desc.tour <= 90 && C.T === P.THEMES[desc.theme] && C.par === P.TOURS.main.levels[desc.tour - 1].par && !why && line.length < C.par,
      `${key} ${desc.name}: tour hole ${desc.tour} dressed as ${desc.theme}, par ${C.par}, beaten in ${line ? line.length : '?'} by its route` + (why ? ': ' + why : ''));
  }
  const dealt = new Set(), c0 = Math.floor(Date.UTC(2026, 9, 6) / 86400000 / 72) * 72;
  for (let i = 0; i < 72; i++) dealt.add(P.dailyLevel(new Date((c0 + i) * 86400000).toISOString().slice(0, 10)));
  claim(dealt.size === 72, `one cycle of 72 days deals all 72 tour holes from worlds 2 to 5, each once (${dealt.size})`);
  // THE WINDMILL'S SAILS BLOCK ITS DOOR, AND NOTHING DIES UNDER THE HOUSE. A ball that stopped in the
  // tunnel was out of sight under the tower, and the golfer was drawn standing on the roof to putt it.
  { const C = P.buildLevel(4, 'main'), bl = C.movers.find(m => m.k === 'blade');
    let open = 0, n = 0; for (let t = 0; t < 20; t += 0.02){ n++; if (!P.moverAt(bl, t).length) open++; }
    claim(!!bl && !C.movers.some(m => m.k === 'spin') && open / n > 0.3 && open / n < 0.85, `the Windmill's door is blocked by its own sails, open ${Math.round(open / n * 100)}% of the time, with no flat spinner on the carpet`);
    let inside = 0, tot = 0;
    for (let t0 = 0; t0 < 6; t0 += 0.25) for (const ft of [15, 16, 17, 18, 19, 20, 21, 22]){ const r = P.simulate(C, C.tee[0], C.tee[1], 0, -P.speedFor(C, ft), t0); tot++;
      const e = r.pts[r.pts.length - 1]; if (Math.abs(e[0]) < 1.1 && e[1] < bl.y - 0.35 && e[1] > bl.y - 3.85) inside++; }
    claim(inside === 0, `${tot} putts at the door at every pace and moment: none comes to rest inside the house (${inside})`); }
  const yr = new Set(); for (let i = 0; i < 365; i++){ const d = new Date(day0.getTime() + i * 86400000); yr.add(P.themeForDay(d.toISOString().slice(0, 10))); }
  claim(yr.size === P.CAL_THEMES.length && P.CAL_THEMES.every(t => yr.has(t)), `a year of dailies wears every calendar theme (${[...yr].join(', ')})`);
  claim(P.themeForDay('2026-10-31') === 'haunted' && P.themeForDay('2026-11-26') === 'harvest' && P.themeForDay('2026-12-25') === 'winter', 'Halloween is haunted, Thanksgiving is harvest, Christmas is winter');
  head('5. NOTHING ESCAPES, NOTHING ROLLS FOR EVER');
  claim(escapes === 0, `no shot left the course through a wall (${escapes})`);
  claim(stuck === 0, `no shot was still rolling at the time limit (${stuck})`);
}
/* ============================================================== 5b. THE TRAIL GYMS, PROVEN */
/* A GYM NOBODY CAN SOLVE LOOKS EXACTLY LIKE ONE THEY CAN. So every gym of every kind (gyms.js, the registry, and a kind
   file a world in gymkinds/) is searched to the end by its kind's own solver: every state a player can reach, the
   fewest moves to the vault, and from every one of those states either the vault is still reachable or the state says
   it is stuck, so the frame lights Restart (push: the lever is still reachable, or the walk test the game uses to offer
   its own reset says it is out of reach). The fewest moves are recorded in the gym (moves, proof), and the recorded
   proof is played move by move to the vault. Unsolvable fails; so does a softlock, and a stale record. A new kind file
   is in all of this the moment it exists (gyms-node.mjs lists the folder). */
head('5b. THE TRAIL GYMS, PROVEN');
const GYMS = loadGyms(), KFILES = kindFiles(), PAGE = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
{ const byWorld = {}, kindsOf = {};
  for (const G of GYMS.GYMS){ const K = GYMS.kindOf(G); if (G.world){ (byWorld[G.world] = byWorld[G.world] || []).push(G); (kindsOf[G.world] = kindsOf[G.world] || new Set()).add(G.kind); }
    const s = GYMS.solve(G), a = GYMS.audit(G), Q = GYMS.parse(G), pf = GYMS.proof(G), s0 = GYMS.init(G), k0 = GYMS.key(G, s0);
    console.log(`        ${G.id} ${G.name} (${G.kind}${G.world ? ', ' + G.world : ', in no world'}): ${G.rows[0].length} x ${G.rows.length} tiles` + (Q.barrels ? `, ${Q.barrels.length} barrels, ${Q.holes.length} holes` : '') + `, ${s.states} states, fewest moves ${s.moves}`);
    claim(s.ok, `${G.id} ${G.name} is solvable from its gate` + (s.ok ? '' : ': ' + s.why));
    claim(s.ok && s.moves === G.moves, `${G.id}: its recorded fewest moves are the solver's (${G.moves} recorded, ${s.moves} found)`);
    // the recorded proof, played: every move a real one, the last opens the vault (or solves it), and nothing before it does
    { let st = s0, real = true, end = -1; const evs = [];
      pf.forEach((m, i) => { const r = GYMS.act(G, st, m), done = r.ev === 'open' || GYMS.won(G, r.s); evs.push(r.ev);
        if (done && end < 0) end = i; if (i < pf.length - 1 && (r.s === st || r.ev === 'reset' || r.ev === 'exit' || r.ev === 'bump')) real = false; st = r.s; });
      claim(pf.length === G.moves && real && end === pf.length - 1, `${G.id}: the recorded proof plays ${G.moves} moves to the vault`); }
    claim(a.ok, `${G.id}: no softlock in ${a.states} states (${a.dead} need the lever after a wrong move, ${a.stuck} shut the lever off and get the game's reset button, ${a.missed} missed, ${a.alarms} false alarms)`);
    /* the lever (and Restart, which is the same reset) puts every piece back: from a state with pieces moved, a step
       into the lever is the start again, and the start is the solvable one. A kind with no steps has only Restart. */
    { let s1 = s0; for (const m of pf.slice(0, Math.min(12, pf.length - 1))) s1 = GYMS.act(G, s1, m).s;
      const moved = GYMS.key(G, GYMS.place(G, s1, Q.start)) !== k0;
      let back = GYMS.key(G, GYMS.init(G)) === k0;
      if (GYMS.input(G) === 'step'){ const lv = Q.lever, adj = [0, 1, 2, 3].map(d => { const c = lv % Q.W + GYMS.DIRS[d][0], r = ((lv / Q.W) | 0) + GYMS.DIRS[d][1]; return [d, r * Q.W + c]; })
          .filter(x => x[1] >= 0 && x[1] < Q.cell.length && x[1] !== Q.gate && Q.cell[x[1]] !== '#' && (!K.deck || K.deck(G, s1, x[1])));
        const at = adj[0], r = at && GYMS.step(G, GYMS.place(G, s1, at[1]), (at[0] + 2) % 4); back = back && !!r && r.ev === 'reset' && GYMS.key(G, r.s) === k0; }
      claim(moved && back && s.ok, `${G.id}: the lever puts every piece back where it started, and that start is the solvable one`); }
    claim(G.say.length === 3 && G.say.every(l => l.length > 20 && !l.split('').some(ch => ch.charCodeAt(0) === 8211 || ch.charCodeAt(0) === 8212)), `${G.id}: the civilian has a nudge, a plainer line after two resets and a warmer one after five`);
    { const gl = GYMS.goal(G); claim(typeof gl === 'string' && gl.length >= 8 && gl.length <= 70 && /\.$/.test(gl) && !gl.split('').some(ch => ch.charCodeAt(0) === 8211 || ch.charCodeAt(0) === 8212), `${G.id}: its goal line, always in the panel, is one short line ("${gl}")`); }
    if (G.world === 'pirate'){ claim(G.mech[0] === 'barrel', `${G.id}: Pirate Cove's gyms are its barrels first`); claim(G.kind === 'push', `${G.id}: Pirate Cove's gyms are the push kind`); } }
  for (const w in byWorld){ const gs = byWorld[w], legs = gs.map(g => g.leg).sort((a, b) => a - b), keep = gs.find(g => g.leg === 18), mid = gs.find(g => g.leg !== 18);
    claim(gs.length === 2 && legs[1] === 18 && legs[0] >= 7 && legs[0] <= 11 && keep.keeper && keep.mech.length === 2 && mid.mech.length === 1,
      `${w}: two gyms, one mid-world (hole ${legs[0]}) and a gatekeeper on the trail into hole 18 that pairs its barrels with an earlier world's ${keep.mech[1]}`);
    claim(mid.pay === 500 && keep.pay === 1000 && keep.moves > mid.moves, `${w}: the vaults pay ${mid.pay} and ${keep.pay} coins, and the gatekeeper is the longer solve (${mid.moves}, ${keep.moves})`); }
  // EVERY WORLD A DIFFERENT KIND (the owner, 2026-10-17): a world's two gyms are one kind, and no kind is in two worlds
  { const ws = Object.keys(kindsOf), one = ws.every(w => kindsOf[w].size === 1), all = ws.map(w => [...kindsOf[w]][0]);
    claim(one && new Set(all).size === all.length, `every world's gyms are one kind of puzzle, and no two worlds share a kind (${ws.map(w => w + ' ' + [...kindsOf[w]].join('+')).join(', ')})`); }
  /* A KIND IS ITS OWN FILE WITH ONE GLOBAL (the KINDS README in gyms.js): each file in gymkinds/, run alone, publishes
     exactly one global, RTT_GYMKIND_<ID> for the id it declares, with the interface the frame calls. A kind with gyms
     in a world is loaded on the page; the worked example is in no world and is not. */
  for (const f of KFILES){ const ctx = { console }; ctx.globalThis = ctx; vm.createContext(ctx); const before = new Set(Object.keys(ctx));
    vm.runInContext(fs.readFileSync(new URL('./gymkinds/' + f, import.meta.url), 'utf8'), ctx); const added = Object.keys(ctx).filter(k => !before.has(k)), K = ctx[added[0]] || {};
    const iface = ['parse', 'init', 'key', 'act', 'moves', 'proof', 'enc', 'goal', 'view'].every(n => typeof K[n] === 'function') && ['step', 'tap', 'own'].indexOf(K.input) >= 0 && Array.isArray(K.gyms);
    const live = (K.gyms || []).some(g => g.world), tag = new RegExp('<script defer src="putt/gymkinds/' + f.replace('.', '\\.') + '\\?v=[^"]+"></script>').test(PAGE);
    claim(added.length === 1 && added[0] === 'RTT_GYMKIND_' + String(K.id).toUpperCase() && f === K.id + '.js' && iface && (K.gyms || []).every(g => g.kind === K.id),
      `gymkinds/${f}: one function wrapper publishing one global, ${added.join(', ')}, the ${K.input} kind '${K.id}' with the frame's interface`);
    claim(live ? tag : !tag && K.gyms.every(g => g.test && !g.world), `gymkinds/${f}: ` + (live ? 'its gyms are in a world, and golf/index.html loads it' : 'a test kind in no world, and the page does not load it')); }
  claim(GYMS.MASTER.badges === 22 && GYMS.MASTER.wired === false, 'all 22 badges unlock the Puzzle Master, recorded and not yet wired (its art waits for the owner)'); }
/* ============================================================== 6. THE PAGE, IN A BROWSER */
/* The node half proves the module. This half proves the door: that it is shut for everybody but
   the testers, that the greens are built off the page's REAL hvGeom for every course in the
   rotation, and that a putt struck through the screen moves the ball. Served from a throwaway
   static server so the relative script path resolves exactly as it does on the site. */
if (!args.includes('--no-browser')){
  let chromium = null;
  try { ({ chromium } = await import('playwright')); } catch (e) {}
  if (!chromium){
    if (process.env.CI) fail('Playwright is not installed, so the page was not checked');
    else console.log('\n6. THE PAGE: skipped (no Playwright here; CI installs it)');
  } else {
    head('6. THE PAGE, IN A BROWSER');
    const http = await import('node:http'), path = await import('node:path');
    const ROOT = new URL('../../', import.meta.url).pathname;
    const TYPES = { '.html':'text/html', '.js':'text/javascript', '.json':'application/json', '.png':'image/png', '.css':'text/css', '.webmanifest':'application/json' };
    const srv = http.createServer((q, r) => { const u = decodeURIComponent(q.url.split('?')[0]); let f = path.join(ROOT, u); if (f.endsWith('/')) f += 'index.html';
      fs.readFile(f, (e, d) => { if (e){ r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type':TYPES[path.extname(f)] || 'application/octet-stream' }); r.end(d); }); });
    await new Promise(res => srv.listen(0, res));
    const base = 'http://127.0.0.1:' + srv.address().port;
    const b = await chromium.launch(), pg = await b.newPage({ viewport:{ width:390, height:844 } });
    const errs = []; pg.on('pageerror', e => errs.push(e.message));
    await pg.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
    await pg.goto(base + '/golf/', { waitUntil:'domcontentloaded' });
    await pg.waitForFunction(() => window.RTT_PUTT && typeof puttOn === 'function', null, { timeout:30000 });
    // the mode opens on the 3D world (home()); the map checks below ask for the map first, and the world has its own section
    await pg.evaluate(() => { window.RTT_PUTT_MAPFIRST = true; });
    claim(await pg.evaluate(() => !document.querySelector('.pt-ov')), 'loading the module draws nothing');
    // A PLAIN SCRIPT'S TOP LEVEL FUNCTION IS A GLOBAL. hole3d.js once declared render() unwrapped and
    // replaced the game's own screen painter, so every tap on the site threw and nothing responded,
    // while every claim in this file stayed green because none of them redraws the home screen.
    // So: once every deferred module has run, the game must still be able to draw a screen and move to another.
    await pg.waitForFunction(() => window.RTT_PUTT_3D && window.RTT_PUTT_LAND && window.PXHD, null, { timeout:30000 });
    claim(await pg.evaluate(() => { try{ const n0 = errs0(); S.overlay = null; S.screen = 'title'; render(); document.querySelector('#rttnav [data-nav="daily"]').click(); return S.screen !== 'title' && document.body.innerText.length > 0; }catch(e){ return false; } function errs0(){ return 0; } }),
      'with every module loaded, the game still draws its home screen and a tab still moves it on');
    claim(await pg.evaluate(() => !puttOn() && !homeModeList().some(m => m.id === 'putt')), 'signed out: no door');
    await pg.evaluate(() => { sbUser = { id:'x' }; sbUsername = 'somebody'; });
    claim(await pg.evaluate(() => !puttOn() && !homeModeList().some(m => m.id === 'putt')), 'signed in as anybody else: no door');
    claim(await pg.evaluate(() => typeof PUTT_LIVE !== 'undefined' && PUTT_LIVE === false), 'PUTT_LIVE is false, so this is still a preview');
    // a tester who is NOT on PUTT_ALL_ACCESS, so every gate below is the one an ordinary player meets
    await pg.evaluate(() => { sbUsername = 'SlimeyB3'; });
    claim(await pg.evaluate(() => puttOn() && homeModeList().some(m => m.id === 'putt')), 'signed in as a tester: the door is there');
    // A tester holds the Tour Pass by default (passTester). Everything below tests the player with no pass, so
    // the tester's pass is put away for the rest of the check.
    claim(await pg.evaluate(() => { const on = dailyPassActive() && puttHost().passActive(); sbUsername = 'somebody'; const off = !dailyPassActive(); sbUsername = 'SlimeyB3'; passTester = () => false; return on && off && !dailyPassActive(); }),
      'a tester holds the Tour Pass by default, and nobody else does');
    // EVERY HOLE OPEN for the accounts on PUTT_ALL_ACCESS, asked and never written: the record keeps the real hole
    const aa = await pg.evaluate(() => { const P = window.RTT_PUTT, T = P.TOURS.main, tp = { lv:1, best:{} }, o = {}; P.close && P.close(); P.summary(puttHost());
      o.plain = { all:P.allAccess(), open40:P.opened(T, tp, 40), shown:P.revealed(T, 5, { tours:{ main:tp }, rv:[] }) };
      sbUsername = 'RunnyJ';
      o.all = { all:P.allAccess(), open:P.opened(T, tp, T.levels.length), shown:P.revealed(T, T.worlds.length - 1, { tours:{ main:tp }, rv:[] }), lv:tp.lv, frontier:P.frontier(tp, T) };
      sbUsername = 'SlimeyB3'; return o; });
    claim(!aa.plain.all && !aa.plain.open40 && !aa.plain.shown, 'a tester off the list meets the gates: hole 40 is shut and world 6 is under cloud');
    claim(aa.all.all && aa.all.open && aa.all.shown, 'an account on PUTT_ALL_ACCESS has every hole open and every world shown');
    claim(aa.all.lv === 1 && aa.all.frontier === 1, 'and the record still says the hole really reached, so taking the account off the list puts the gates back');
    // every course in the rotation, built off the real hvGeom
    const real = await pg.evaluate(() => { const P = window.RTT_PUTT, h = puttHost(), bad = [];
      let n = 0;
      for (const k of DAILY_KEYS){ for (const idx of [0, 11]){ const spec = P.fromHost(h, k, idx);
        for (let pin = 0; pin < spec.pins.length; pin++){ const C = P.buildReal(spec, { pin }); n++;
          if (C.mats.at(C.cup[0], C.cup[1]) !== P.M.GREEN) bad.push(k + ' ' + (idx + 1) + ' pin ' + pin + ' off the green');
          if (pin === 0 && !P.spotFor(C, 12, P.mulberry(7))) bad.push(k + ' ' + (idx + 1) + ' no 12 ft spot'); } } }
      return { n, bad }; });
    claim(real.bad.length === 0, `${real.n} real pins across the rotation, every one on its green with a 12 footer to putt` + (real.bad.length ? ': ' + real.bad.slice(0, 4).join('; ') : ''));
    // the daily wears today's theme, read off the game's own day key
    await pg.evaluate(() => openPutt());
    await pg.waitForSelector('.pt-ov [data-daily]');
    const th = await pg.evaluate(() => { const k = String(todayKey()), iso = k.slice(0, 4) + '-' + k.slice(4, 6) + '-' + k.slice(6, 8); return { want:window.RTT_PUTT.THEMES[window.RTT_PUTT.themeForDay(iso)].name, got:document.querySelector('[data-daily] .m').textContent }; });
    claim(th.got.indexOf(th.want) >= 0, `the Daily Hole wears today's theme (${th.got})`);
    await pg.click('[data-daily]'); await pg.waitForSelector('.pt-stage canvas');
    await pg.waitForTimeout(300);
    // THE DAILY HOLE IS TIMED: the clock is on screen, it runs, and a finished daily keeps its time
    const ck = await pg.evaluate(() => document.querySelector('[data-dclock]') && document.querySelector('[data-dclock]').textContent);
    await pg.waitForTimeout(400);
    const ck2 = await pg.evaluate(() => document.querySelector('[data-dclock]') && document.querySelector('[data-dclock]').textContent);
    claim(ck && ck2 && ck !== ck2 && /^\d+:\d\d\.\d$/.test(ck2), `the Daily Hole shows a running clock (${ck} then ${ck2})`);
    // A GOLFER OVER THE CUP IS DRAWN FAINT: stood at the tee he covers nothing, stood at the cup he covers it
    const far = await pg.evaluate(() => window.RTT_PUTT._covers());
    const near = await pg.evaluate(async () => { const P = window.RTT_PUTT._state().play, keep = P.ball.slice(); P.ball = [P.C.cup[0] + 0.4, P.C.cup[1]];
      let v = null; for (let i = 0; i < 60 && !v; i++){ await new Promise(r => setTimeout(r, 50)); v = window.RTT_PUTT._covers(); } P.ball = keep; return v; });
    claim(far === false && near === true, `the golfer covers the cup only when he stands over it, and is drawn faint then (tee ${far}, at the cup ${near})`);
    const box = await pg.locator('.pt-stage canvas').boundingBox();
    const before = await pg.evaluate(() => window.RTT_PUTT._state().play.ball.slice());
    // A RELEASE NOBODY HEARS STILL PUTTS: pulled back past the window's edge and let go outside the browser,
    // the page sees the window lose focus and never a pointerup. Read as a release, or the game freezes.
    await pg.mouse.move(box.x + box.width / 2, box.y + box.height * 0.5); await pg.mouse.down();
    await pg.mouse.move(box.x + box.width / 2, box.y + box.height * 0.5 + 120, { steps:6 });
    await pg.evaluate(() => window.dispatchEvent(new Event('blur')));
    await pg.waitForFunction(() => { const P = window.RTT_PUTT._state().play; return P.state !== 'roll' && P.strokes >= 1; }, null, { timeout:30000 });
    const after = await pg.evaluate(() => { const P = window.RTT_PUTT._state().play; return { ball:P.ball, strokes:P.strokes, state:P.state }; });
    await pg.mouse.up();
    claim(after.strokes >= 1 && (after.state === 'done' || Math.hypot(after.ball[0] - before[0], after.ball[1] - before[1]) > 1), `a pull back let go outside the window still putts the ball (${after.strokes} stroke, ${after.state})`);
    if (after.state === 'aim'){
      await pg.mouse.move(box.x + box.width / 2, box.y + box.height * 0.5); await pg.mouse.down();
      await pg.mouse.move(box.x + box.width / 2, box.y + box.height * 0.5 + 120, { steps:6 }); await pg.mouse.up();
      await pg.waitForFunction(n => { const P = window.RTT_PUTT._state().play; return P.state !== 'roll' && (P.strokes > n || P.state === 'done'); }, after.strokes, { timeout:30000 });
      claim(await pg.evaluate(n => window.RTT_PUTT._state().play.strokes > n, after.strokes), 'a pull back and release putts the ball');
    }
    // A DESKTOP NEVER ZOOMS IN: the whole hole stays on screen, and Overview has nothing to put back
    const dres = await pg.evaluate(() => { const S = window.RTT_PUTT._state(), P = S.play, C = P.C; P.t0 = performance.now() - 12345; P.strokes = 2; P.state = 'done';
      Object.keys(localStorage).filter(x => x.indexOf('bag_ppt_v1') === 0).forEach(k0 => { const s0 = JSON.parse(localStorage.getItem(k0)); s0.daily = {}; localStorage.setItem(k0, JSON.stringify(s0)); });
      window.RTT_PUTT._dailyFinish(2, C.par, Math.round(performance.now() - P.t0)); const d = Object.keys(localStorage).filter(x => x.indexOf('bag_ppt_v1') === 0).map(k => Object.values(JSON.parse(localStorage.getItem(k)).daily || {}).find(v => v.done)).find(Boolean); return { ms:d && d.ms, txt:document.body.innerText }; });
    claim(dres.ms >= 12345 && dres.ms < 14000 && /0:12\.\d/.test(dres.txt), `a finished daily keeps its time and the result shows it (${dres.ms} ms)`);
    claim(await pg.evaluate(() => homeModeList().map(m => m.id).indexOf('putt') === 1), 'the Putt Putt Tour card comes second, right after Play 18');
    // THE DAILY TAB: the card only asks while today is unplayed, the calendar has every day back to CAL_BACK,
    // a missed day is shut without the Tour Pass, and a day played late pays but never moves the streak.
    const calk = await pg.evaluate(async () => { const wait = async q => { for (let t = 0; t < 100 && !document.querySelector(q); t++) await new Promise(r => setTimeout(r, 50)); return !!document.querySelector(q); };
      const k = String(todayKey()), td = k.slice(0, 4) + '-' + k.slice(4, 6) + '-' + k.slice(6, 8), add = n => new Date(Date.parse(td + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
      const seed = daily => { localStorage.setItem('bag_ppt_v1@cal', JSON.stringify({ v:2, daily, streak:{ n:2, last:add(-1), best:2 }, tours:{ main:{ lv:1, best:{}, ace:{}, paid:{}, wpaid:{} } } })); };
      const out = {}; window.RTT_PUTT.close(); sbUser = { id:'cal' };
      seed({ [add(-1)]:{ s:3, par:3, done:1 } }); openPutt(); await wait('.pp-tabs [data-tab="daily"]'); out.cardUnplayed = !!document.querySelector('[data-daily]'); window.RTT_PUTT.close();
      seed({ [add(-1)]:{ s:3, par:3, done:1 }, [td]:{ s:2, par:3, done:1 } }); openPutt(); await wait('.pp-tabs [data-tab="daily"]'); out.cardPlayed = !!document.querySelector('[data-daily]');
      document.querySelector('.pp-tabs [data-tab="daily"]').click(); await wait('.pp-cday');
      out.days = document.querySelectorAll('.pp-cday').length; out.todayDone = document.querySelector('.pp-cday[data-day="' + td + '"]').classList.contains('done');
      out.lockN = document.querySelectorAll('.pp-cday.lock').length; document.querySelector('.pp-cday[data-day="' + add(-3) + '"]').click(); await wait('.pp-memsh');
      out.sheet = !!document.querySelector('.pp-memsh'); out.noRound = !document.querySelector('.pt-stage canvas'); document.querySelector('.pp-memsh [data-n]').click();
      window.RTT_PUTT._state().calPreview = true; document.querySelector('.pp-cday[data-day="' + add(-3) + '"]').click(); await wait('.pt-stage canvas');
      const R = window.RTT_PUTT._state().round; out.pastRound = R && R.mode === 'pdaily' && R.day === add(-3) && R.past;
      window.RTT_PUTT._state().play.state = 'done'; window.RTT_PUTT._dailyFinish(2, 3, 9000);
      const st = JSON.parse(localStorage.getItem('bag_ppt_v1@cal')); out.late = st.daily[add(-3)] && st.daily[add(-3)].late === 1; out.streak = st.streak.n; out.last = st.streak.last === add(-1);
      window.RTT_PUTT.close(); sbUser = { id:'chk' }; return out; });
    claim(calk.cardUnplayed && !calk.cardPlayed, `the Daily card shows while today is unplayed and goes once it is played (${calk.cardUnplayed}, ${calk.cardPlayed})`);
    claim(calk.days >= 60 && calk.todayDone, `the Daily tab is a calendar of ${calk.days} days with today marked played`);
    claim(calk.lockN > 0 && calk.sheet && calk.noRound, 'without the Tour Pass a missed day is shut, and pressing it opens the Pass sheet rather than a hole');
    claim(calk.pastRound && calk.late && calk.streak === 2 && calk.last, `a Pass holder plays a missed day, and it is filed late without moving the streak (streak ${calk.streak})`);
    // THE WALK TO THE NEXT HOLE IS A PLACE (trail.js): Next opens a 3D trail of the world, walked with a stick,
    // with a waypoint on the hole ahead. No coin lies loose: chests are hidden off the path, and opening one throws
    // its coins onto the ground to be walked over and paid into the account. A chest behind a locked gate and its
    // key, and a golden ball, are picked up and kept in the Tour record; walking through the arch opens the hole; Skip goes straight there.
    // Where two worlds meet a wall stands across the land: with the stars its door opens, short of them it holds.
    const wk = await pg.evaluate(async () => { const out = {}, sleep = ms => new Promise(r => setTimeout(r, ms)), seed = (s, lv) => { const best = {}; for (let n = 1; n <= 18; n++) best[n] = s;
      localStorage.setItem('bag_ppt_v1@walk', JSON.stringify({ v:2, met:['clubhouse', 'school', 'candy'], tours:{ main:{ lv, best, ace:{}, paid:{}, wpaid:{} } } })); };   // greeters met: their section is below
      const S = () => window.RTT_PUTT._state(), T = () => window.RTT_PUTT._trail(), rec = () => (JSON.parse(localStorage.getItem('bag_ppt_v1@walk')).trail || {});
      const open = async n => { window.RTT_PUTT._walkTo(n); for (let i = 0; i < 400 && !T(); i++) await sleep(50); await sleep(150); return T(); };
      const visit = async (t, x, y) => { t.goTo(x, y + 0.05); await sleep(120); };
      window.RTT_PUTT.close(); sbUser = { id:'walk' }; seed(1, 19); openPutt(); await sleep(300);
      // NO TWO WALKS ALIKE: the shapes and where the chests are hidden change from trail to trail
      const plans = []; for (let f = 1; f < 18; f++) plans.push(window.RTT_PUTT._trailPlan(f));
      out.styles = new Set(plans.map(p => p.style)).size; out.clrs = new Set(plans.map(p => p.clrKind + (p.spur.length ? 's' : 'h'))).size;
      const cpos = p => JSON.stringify(p.items.filter(t => t.k === 'chest').map(t => [t.x | 0, t.y | 0]));
      out.sameCoins = plans.slice(1).filter((p, i) => cpos(p) === cpos(plans[i])).length;
      out.looseCoins = plans.reduce((n, p) => n + p.items.filter(t => t.k === 'coin').length, 0);
      out.oneChest = plans.every(p => p.items.filter(t => t.k === 'chest').length === 1);
      out.offPath = plans.every(p => p.items.filter(t => t.k === 'chest' && !t.main).every(t => p.walkD(t.x, t.y) > 4));
      out.drops = plans.every(p => p.items.filter(t => t.k === 'chest').every(t => t.drops.length >= 4));
      const fromL = 1 + plans.findIndex(p => p.fence), fromT = 1 + plans.findIndex(p => p.items.some(t => t.k === 'trinket'));
      let t = await open(fromL);
      out.trail = !!t && S().screen === 'trail' && !S().round && !!document.querySelector('.pp-tcv');
      out.mark = !!document.querySelector('.pp-pin.on,.pp-way.on');
      const p0 = t.pos(); t.stick(0, -1); await sleep(900); t.stick(0, 0); const p1 = t.pos(); out.moved = p0[1] - p1[1];
      // THE STICK IS FOR A TOUCH SCREEN: on a desktop there is none on screen, a drag does not walk him, and the keys do
      out.noStick = !matchMedia('(pointer: coarse)').matches && !document.querySelector('.pp-stick');
      await sleep(400); { const bx = document.querySelector('.pp-tcv').parentNode, r = bx.getBoundingClientRect(), q0 = t.pos(), ev = (ty, x, y) => new PointerEvent(ty, { pointerId:7, clientX:x, clientY:y, bubbles:true, cancelable:true });
        bx.dispatchEvent(ev('pointerdown', r.left + r.width / 2, r.top + r.height / 2)); window.dispatchEvent(ev('pointermove', r.left + r.width / 2, r.top + r.height / 2 - 60));
        await sleep(600); window.dispatchEvent(ev('pointerup', r.left + r.width / 2, r.top + r.height / 2 - 60)); const q1 = t.pos(); out.dragStill = Math.hypot(q1[0] - q0[0], q1[1] - q0[1]) < 0.05;
        window.dispatchEvent(new KeyboardEvent('keydown', { code:'ArrowDown', key:'ArrowDown', bubbles:true })); await sleep(600); window.dispatchEvent(new KeyboardEvent('keyup', { code:'ArrowDown', key:'ArrowDown', bubbles:true }));
        const q2 = t.pos(); out.keyWalk = Math.hypot(q2[0] - q1[0], q2[1] - q1[1]); }
      const P = t.plan(), its = t.items(), key = its.find(i => i.k === 'key'), chest = its.find(i => i.k === 'chest' && i.main), gold = its.find(i => i.k === 'golden'), K = 'main:' + (fromL + 1);
      const paid = []; const h0 = S().host, c0 = h0.coins; h0.coins = (n, l) => { paid.push(n); };
      const coinsOf = c => its.filter(i => i.k === 'coin' && i.ch === c);
      // what there is to find is listed on screen, each with its own picture
      out.list = [...document.querySelectorAll('[data-tlist] span')].map(e => e.textContent); out.listImgs = document.querySelectorAll('[data-tlist] img').length;
      out.locked = !!P.fence && !!key && !!chest; await visit(t, chest.x, chest.y + 2.4); out.shutChest = !(rec()[K] && (rec()[K].ch || []).indexOf(chest.id) >= 0);
      // the chest: nothing on the ground until it is opened, then its coins land round it and are walked over
      out.buried = coinsOf(chest).every(c => !c.out);
      await visit(t, key.x, key.y); await visit(t, P.lockGate.x, P.lockGate.y); await visit(t, chest.x, chest.y + 2.0); await sleep(2600);
      const cc = coinsOf(chest), stand = [chest.x, chest.y + 2.05], left = cc.slice().sort((a, b) => Math.hypot(b.x - stand[0], b.y - stand[1]) - Math.hypot(a.x - stand[0], a.y - stand[1]))[0], hc = cc.filter(c => c !== left && Math.hypot(c.x - left.x, c.y - left.y) > 1.6); out.burst = cc.length >= 4 && cc.every(c => c.out);
      const bal0 = (document.querySelector('[data-bal]') || {}).textContent;
      for (const c of hc) await visit(t, c.x, c.y);
      const got = cc.filter(c => c.done).length; out.hidCoins = hc.every(c => c.done) && !left.done; out.paid = got > 0 && paid.reduce((a, b) => a + b, 0) === got * window.RTT_PUTT_TRAIL.COIN_V && paid.length === got;
      await visit(t, gold.x, gold.y); out.flying = t.fx(); out.bub0 = !document.querySelector('[data-bub]') || document.querySelector('[data-bub]').hidden || !/olden/.test(document.querySelector('[data-bub]').textContent); await sleep(1400); out.landed = t.fx() === 0 && !!document.querySelector('[data-gold].pp-bump'); h0.coins = c0;
      out.listGot = document.querySelectorAll('[data-tlist] span.got').length;
      const r = rec()[K] || {}; out.coin = hc.every(c => (r.c || []).indexOf(c.id) >= 0); out.key = r.key === 1; out.chest = (r.ch || []).indexOf(chest.id) >= 0; out.gold = r.g === 1; out.bub = (document.querySelector('[data-bub]') || {}).textContent || '';
      // walking through the arch opens the hole
      await visit(t, P.cx(0), 2.5); t.stick(0, -1); for (let i = 0; i < 40 && !(S().round && S().round.lv === fromL + 1); i++) await sleep(50); out.reached = S().round && S().round.lv; out.want = fromL + 1;
      // what was picked up stays picked up
      t = await open(fromL); const it2 = t.items(), lc = it2.find(i => i.id === left.id);
      out.kept = hc.length > 0 && it2.filter(i => i.k === 'coin' && hc.some(c => c.id === i.id)).every(i => i.done) && it2.find(i => i.k === 'chest').done && lc.out && !lc.done;
      document.querySelector('[data-skip]').click(); await sleep(80); { const sw0 = document.querySelector('.pp-skipw [data-skip]'); if (sw0){ sw0.click(); await sleep(80); } } out.skipTo = S().round && S().round.lv;
      // a trail that still holds rewards warns before Skip leaves it: Keep walking stays, Skip anyway goes
      t = await open(fromT); document.querySelector('.pp-trail [data-skip]').click(); await sleep(80);
      const sw = document.querySelector('.pp-skipw'); out.warn = !!sw && /still has/.test(sw.textContent);
      if (sw) sw.querySelector('[data-n]').click(); await sleep(60); out.stay = !document.querySelector('.pp-skipw') && !!window.RTT_PUTT._trail();
      document.querySelector('.pp-trail [data-skip]').click(); await sleep(80); const sw2 = document.querySelector('.pp-skipw [data-skip]'); if (sw2) sw2.click(); await sleep(80);
      out.gone = !window.RTT_PUTT._trail();
      // the rare things: a trinket and whatever else that trail carries, into the record and the Bag
      t = await open(fromT); const rares = t.items().filter(i => i.k === 'trinket' || i.k === 'part' || i.k === 'life');
      for (const it of rares) await visit(t, it.x, it.y);
      const st2 = JSON.parse(localStorage.getItem('bag_ppt_v1@walk')); out.tk = (st2.tk || []).length; out.rk = rares.map(i => i.k).join(',');
      out.parts = ((st2.pp || {}).parts || []).length; out.bank = (st2.bank || []).length;
      window.RTT_PUTT._bag(); await sleep(60); out.bagTk = document.querySelectorAll('.pp-bag .pp-btk i.on').length; const bs = document.querySelector('.pp-bag [data-n]'); if (bs) bs.click();
      // the world door, with the stars
      t = await open(18); const G = t.plan().gate; out.cross = !!G;
      await visit(t, G.x, G.y + 4); t.stick(0, -1); for (let i = 0; i < 60 && !out.doorOpen; i++){ await sleep(50); if (document.querySelector('.pp-door.fill')) out.doorOpen = true; }
      for (let i = 0; i < 80 && !(t.gate() && t.gate().open && !document.querySelector('.pp-door')); i++) await sleep(50);
      t.stick(0, -1); await sleep(1100); out.passed = t.pos()[1] < G.y - 1; t.stick(0, 0);
      await visit(t, t.plan().cx(0), 2.5); t.stick(0, -1); for (let i = 0; i < 60 && !(S().round && S().round.lv === 19); i++) await sleep(50); out.through = S().round && S().round.lv;
      // and without
      window.RTT_PUTT.close(); seed(2, 18); openPutt(); await sleep(300); t = await open(18); const G2 = t.plan().gate;
      await visit(t, G2.x, G2.y + 4); t.stick(0, -1); for (let i = 0; i < 80 && !out.shutTxt; i++){ await sleep(50); const sm = document.querySelector('.pp-door small'); if (sm) out.shutTxt = sm.textContent; }
      for (let i = 0; i < 100 && document.querySelector('.pp-door'); i++) await sleep(50);
      t.stick(0, -1); await sleep(900); t.stick(0, 0); out.held = t.pos()[1] > G2.y && S().screen === 'trail';
      // the golfer on the map is a door into the walk too
      window.RTT_PUTT.close(); seed(1, 19); openPutt(); await sleep(300); const me = document.querySelector('.pp-me.tap'); if (me) me.click(); for (let i = 0; i < 400 && !T(); i++) await sleep(50); out.tap = S().screen === 'trail';
      window.RTT_PUTT.close(); sbUser = { id:'chk' }; return out; });
    claim(wk.styles >= 3 && wk.clrs >= 3 && wk.sameCoins === 0, `seventeen trails take at least three shapes and three kinds of clearing, and no two hide their chests in the same places (${wk.styles}, ${wk.clrs}, ${wk.sameCoins})`);
    claim(wk.looseCoins === 0 && wk.oneChest && wk.offPath && wk.drops, `no coin lies loose on a trail: every trail has one chest, a hidden one off the path, with coins to throw (${wk.looseCoins} loose)`);
    claim(wk.listImgs >= 3 && wk.listImgs === wk.list.length && wk.list.some(x => /Chest/.test(x)) && wk.list.some(x => /Golden ball/.test(x)) && wk.list.some(x => /Key/.test(x)) && wk.listGot >= 3, `the trail lists every find with its own picture, and ticks them off (${JSON.stringify(wk.list)}, ${wk.listGot} ticked)`);
    claim(wk.buried && wk.burst && wk.hidCoins && wk.paid, `opening the chest throws its coins onto the ground, and each one walked over is paid into the account (${JSON.stringify([wk.buried, wk.burst, wk.hidCoins, wk.paid])})`);
    claim(wk.tk === 1 && wk.bagTk === 1 && (wk.rk.indexOf('part') < 0 || wk.parts === 1) && (wk.rk.indexOf('life') < 0 || wk.bank === 1), `a trinket and the rare things on its trail are kept, and the Bag shows them (${wk.rk}: ${wk.tk}, ${wk.parts}, ${wk.bank}, bag ${wk.bagTk})`);
    claim(wk.trail && wk.mark && wk.moved > 3, `Next opens the trail with the golfer and a waypoint, and the stick walks him (${wk.trail}, ${wk.mark}, ${(wk.moved || 0).toFixed(1)} ft)`);
    claim(wk.noStick && wk.dragStill && wk.keyWalk > 1, `on a desktop there is no stick on screen and a drag does not walk him; the arrow keys do (${wk.noStick}, ${wk.dragStill}, ${(wk.keyWalk || 0).toFixed(1)} ft)`);
    claim(wk.locked && wk.shutChest && wk.coin && wk.key && wk.chest && wk.gold && /Golden ball/.test(wk.bub), `the coins, the key, the chest it opens and the golden ball are picked up and kept (${JSON.stringify([wk.coin, wk.key, wk.chest, wk.gold, wk.bub])})`);
    claim(wk.flying > 0 && wk.landed && wk.bub0, `a find does not just vanish: it pops up and flies to the top of the screen, which pulses as it lands, and the bubble waits until it has (${wk.flying}, ${wk.landed}, ${wk.bub0})`);
    claim(wk.warn && wk.stay && wk.gone, `Skip on a trail that still holds rewards warns first, Keep walking stays on the trail, and skipping anyway leaves it (${wk.warn}, ${wk.stay}, ${wk.gone})`);
    claim(wk.reached === wk.want && wk.kept && wk.skipTo === wk.want, `walking through the arch opens the hole, what was picked up stays picked up, a coin left on the ground is still there, and Skip goes straight there (${wk.reached}, ${wk.kept}, ${wk.skipTo})`);
    claim(wk.cross && wk.doorOpen && wk.passed && wk.through === 19, `with the stars, the world door on the trail opens and he walks on into World 2 (${wk.doorOpen}, ${wk.passed}, hole ${wk.through})`);
    claim(/Need \d+ more/.test(wk.shutTxt || '') && wk.held, `short of the stars, the door stays shut, says how many more, and he cannot walk past it (${wk.shutTxt})`);
    claim(wk.tap, 'tapping the golfer on the map starts the walk to the next hole');
    /* A CREEK ACROSS THE LAND, crossed on a bridge. Over the whole main tour: the walk is never wet, nothing to
       pick up lies in the water, every crossing has its bridge and its deck is dry, and the creeks come in the
       worlds' own kinds. Then he really walks across one: the deck holds him and the water either side does not. */
    const cr = await pg.evaluate(async () => { const out = { n:0, kinds:{}, wet:0, inWater:0, bridges:0, crossings:0, dryDeck:true }, sleep = ms => new Promise(r => setTimeout(r, ms)), best = {};
      for (let n = 1; n <= 198; n++) best[n] = 3;
      localStorage.setItem('bag_ppt_v1@walk', JSON.stringify({ v:2, met:['clubhouse', 'temple', 'pirate', 'canyon', 'volcano', 'dino', 'sky', 'neon', 'school', 'iceage', 'candy'], tours:{ main:{ lv:198, best, ace:{}, paid:{}, wpaid:{} } } }));
      window.RTT_PUTT.close(); sbUser = { id:'walk' }; openPutt(); await sleep(300);
      let firstWater = 0;
      for (let f = 1; f < 198; f++){ const P = window.RTT_PUTT._trailPlan(f);
        for (const p of P.path){ const o = P.poolAt(p[0], p[1]); if ((o && o.k === 'water') || P.seaAt(p[0], p[1])) out.wet++; }
        if (!P.creek) continue; out.n++; out.kinds[P.creek.k] = 1; if (P.creek.k === 'water' && !firstWater) firstWater = f;
        out.crossings += P.creek.xs.length; out.bridges += P.things.filter(t => t.k === 'bridge').length;
        out.inWater += P.items.filter(t => P.poolAt(t.x, t.y)).length;
        for (const c of P.creek.xs) if (P.poolAt(c.x, c.y) || !P.deckAt(c.x, c.y)) out.dryDeck = false; }
      if (firstWater){ window.RTT_PUTT._walkTo(firstWater); for (let i = 0; i < 400 && !window.RTT_PUTT._trail(); i++) await sleep(50); await sleep(200);
        const t = window.RTT_PUTT._trail(), P = t.plan(), c = P.creek.xs[0], side = (x, y) => Math.sign(y - P.creek.cy(x));
        // back from the bridge on the path, then walk along it
        t.goTo(c.x - c.t[0] * (c.half + 2.5), c.y - c.t[1] * (c.half + 2.5)); await sleep(150); const s0 = side(...t.pos());
        t.stick(c.t[0], c.t[1]); await sleep(1600); t.stick(0, 0); out.over = side(...t.pos()) !== s0;
        // and off the side of the deck: the water holds him
        // set down on the crossing and left until the walk across has stopped carrying him: a busy page can drift him a
        // fraction of a foot toward the bank, where a slanted creek leaves dry land beside the deck
        for (let i = 0; i < 30; i++){ t.goTo(c.x, c.y); await sleep(150); const q = t.pos(); if (Math.hypot(q[0] - c.x, q[1] - c.y) < 0.03) break; }
        // the creek crosses the path at a slant, so on one side of the crossing the bank can come right up to the deck:
        // he is pushed off the side where the deck meets water, read off the ground from where he actually stands
        const q0 = t.pos(), sideTo = sg => { for (let d = 0.1; d < 5; d += 0.1){ const x = q0[0] - c.t[1] * sg * d, y = q0[1] + c.t[0] * sg * d;
            if (P.poolAt(x, y)) return d; if (!P.deckAt(x, y)) return 99; } return 99; },
          sg = sideTo(1) <= sideTo(-1) ? 1 : -1, nx = -c.t[1] * sg, ny = c.t[0] * sg;
        // pushed square off that side of the deck he reaches its edge and never sets foot in the water. Held against the
        // water he may slide along the edge and off the end of the bridge onto the bank (how soon depends on the frame
        // rate), which is walking, not swimming, so how far he ends up is not asked
        let dry = true, far = 0; t.stick(nx, ny); for (let k = 0; k < 12; k++){ await sleep(100); const q = t.pos(); if (P.poolAt(q[0], q[1])) dry = false; far = Math.max(far, (q[0] - q0[0]) * nx + (q[1] - q0[1]) * ny); } t.stick(0, 0);
        out.held = dry && far > 1; out.hi = [dry, +far.toFixed(2), firstWater, sg]; }
      window.RTT_PUTT.close(); sbUser = { id:'chk' }; return out; });
    claim(cr.n >= 25 && Object.keys(cr.kinds).length >= 3 && cr.wet === 0 && cr.inWater === 0 && cr.bridges === cr.crossings && cr.dryDeck,
      `creeks cross ${cr.n} trails of the tour in ${Object.keys(cr.kinds).join(', ')}: the walk is never wet, nothing lies in the water, and every crossing has a dry bridge (${cr.wet} wet, ${cr.inWater} in water, ${cr.bridges}/${cr.crossings} bridged)`);
    claim(cr.over && cr.held, `he walks across a bridge, and the water beside the deck holds him (${cr.over}, ${cr.held}, ${JSON.stringify(cr.hi)})`);
    /* THE PUZZLES (trail.js puzzle()). About half the trails carry one, of four kinds, and each pays its coin bonus out of
       its own chest. Every kind is played here for real: the three lights lit, the spot dug, the plate stepped on and
       the pen's gate beaten, the crate jammed against its rock and then pushed the right way. Each asks the thing it is
       about, never only that it ended: a prize that turns up before its puzzle is done, a gate that never shuts, a crate
       that goes either way, all fail here. And the local on a puzzle trail gives its clue. */
    const pzr = await pg.evaluate(async () => { const out = { n:0, pz:0, kinds:{}, drops:true, solo:true }, sleep = ms => new Promise(r => setTimeout(r, ms)), best = {}, TR = window.RTT_PUTT_TRAIL;
      for (let n = 1; n <= 198; n++) best[n] = 3;
      localStorage.setItem('bag_ppt_v1@pzl', JSON.stringify({ v:2, met:['clubhouse', 'temple', 'pirate', 'canyon', 'volcano', 'dino', 'sky', 'neon', 'school', 'iceage', 'candy'], tours:{ main:{ lv:198, best, ace:{}, paid:{}, wpaid:{} } } }));
      window.RTT_PUTT.close(); sbUser = { id:'pzl' }; openPutt(); await sleep(300);
      const S = () => window.RTT_PUTT._state(), T = () => window.RTT_PUTT._trail(), rec = () => (JSON.parse(localStorage.getItem('bag_ppt_v1@pzl')).trail || {}), first = {};
      for (let f = 1; f < 198; f++){ const P = window.RTT_PUTT._trailPlan(f); out.n++; const pz = P.puzzle; if (!pz) continue; out.pz++; out.kinds[pz.k] = (out.kinds[pz.k] || 0) + 1;
        const pr = P.items.filter(t => t.k === 'prize'); if (pr.length !== 1 || pr[0].drops.length !== TR.PZ_COINS) out.drops = false;
        if (!pz.clue || P.items.filter(t => t.k === 'chest').length !== 1) out.solo = false;
        if (!first[pz.k] && f % 18 && !P.spec.greet && P.items.some(t => t.k === 'npc')) first[pz.k] = f; }
      out.first = first;
      // reopening the mode makes a new host, so the payout is watched on whichever host is current
      const paid = []; let hk = null, hc = null; const hook = () => { const h = S().host; if (h !== hk){ if (hk) hk.coins = hc; hk = h; hc = h.coins; h.coins = n => { paid.push(n); }; } };
      const open = async n => { window.RTT_PUTT.close(); openPutt(); await sleep(200); hook(); window.RTT_PUTT._walkTo(n); for (let i = 0; i < 600 && !T(); i++) await sleep(50); await sleep(200); hook(); return T(); };
      const visit = async (t, x, y, ms) => { t.goTo(x, y); await sleep(ms || 140); };
      const collectAll = async (t, prize) => { await sleep(2600); const cs = t.items().filter(c => c.k === 'coin' && c.ch && c.ch.id === prize.id); for (const c of cs) await visit(t, c.x, c.y, 90); return cs; };
      const away = t => { const P = t.plan(); t.goTo(P.path[0][0], P.path[0][1]); };
      // the local gives the clue
      if (first.fire){ const t = await open(first.fire), P = t.plan(), npc = t.items().find(i => i.k === 'npc');
        await visit(t, npc.x, npc.y + 8, 200); await visit(t, npc.x, npc.y + 2.6, 260); out.clue = t.bubble().indexOf(P.puzzle.clue) >= 0;
        // a bubble stays over the one who said it: walk off while the local is still talking and it does not follow
        { const at = () => { const v = t.view(), b = document.querySelector('[data-bub]'), q = t.scr(npc.x, npc.y, 0); return { bx:parseFloat(b.style.left), nx:q[0] / (window.devicePixelRatio || 1), hid:b.hidden }; };
          const a0 = at(); await visit(t, npc.x + 3.2, npc.y + 2.6, 300); const a1 = at();
          out.bubStays = !a1.hid && Math.abs((a1.bx - a1.nx) - (a0.bx - a0.nx)) < 2 && t.bubble().indexOf(P.puzzle.clue) >= 0; }
        // the lights: no prize until all three are lit, then it opens and pays
        const its = t.items(), prize = its.find(i => i.k === 'prize'), fires = its.filter(i => i.k === 'fire');
        await visit(t, prize.x, prize.y + 2); out.fireHidden = !prize.done && !t.pz().shown;
        for (let i = 0; i < 2; i++) await visit(t, fires[i].x, fires[i].y + 1.2); await visit(t, prize.x, prize.y + 2); out.twoLit = !t.pz().shown && !prize.done;
        await visit(t, fires[2].x, fires[2].y + 1.2); out.allLit = t.pz().shown; paid.length = 0;
        await visit(t, prize.x, prize.y + 2); out.fireOpen = prize.done; const cs = await collectAll(t, prize);
        out.firePaid = paid.reduce((a, b) => a + b, 0); out.fireWant = cs.length * TR.COIN_V; out.fireRec = (rec()['main:' + (first.fire + 1)] || {}).pz === 1;
        // and it stays solved
        const t2 = await open(first.fire); out.fireKept = t2.pz().solved && t2.items().find(i => i.k === 'prize').done; }
      // the dig: stand where the footprints stop and the chest comes up
      if (first.dig){ const t = await open(first.dig), P = t.plan(), prize = t.items().find(i => i.k === 'prize');
        await visit(t, prize.x, prize.y + 1.5); out.digHidden = !prize.done && !t.pz().shown;
        paid.length = 0; await visit(t, P.puzzle.spot[0], P.puzzle.spot[1], 900); out.dug = t.pz().shown && prize.done; const cs = await collectAll(t, prize); out.digPaid = paid.reduce((a, b) => a + b, 0) === cs.length * TR.COIN_V && cs.length > 0; }
      // the plate: the gate is shut, the plate opens it for a while, it shuts again, and once the chest is open it stays open
      if (first.plate){ const t = await open(first.plate), P = t.plan(), pen = P.pen, pl = P.puzzle.plate, gx = pen.x, gyy = pen.y + pen.r, prize = t.items().find(i => i.k === 'prize');
        away(t); await sleep(120); out.shut = t.blocked(gx, gyy);
        await visit(t, pl.x, pl.y, 200); away(t); await sleep(120); out.opened = !t.blocked(gx, gyy);
        await sleep(pl.t * 1000 + 400); out.shutAgain = t.blocked(gx, gyy);
        await visit(t, pl.x, pl.y, 200); paid.length = 0; await visit(t, pen.x, pen.y + 1.9, 200); out.plateOpen = prize.done; const cs = await collectAll(t, prize);
        away(t); await sleep(pl.t * 1000 + 400); out.staysOpen = !t.blocked(gx, gyy); out.platePaid = paid.reduce((a, b) => a + b, 0) === cs.length * TR.COIN_V && cs.length > 0; }
      // the crate: pushed toward its rock it jams, pushed from the rock's side it clears the gap
      if (first.push){ const t = await open(first.push), P = t.plan(), pen = P.pen, C = t.pz().crate, gx = pen.x, gyy = pen.y + pen.r, prize = t.items().find(i => i.k === 'prize'), H = 0.8 + 0.55;
        out.blockedAtFirst = t.blocked(gx, gyy);
        await visit(t, C.x - C.rock * (H + 0.06), C.y); t.stick(C.rock, 0); await sleep(1200); t.stick(0, 0); out.jam = +Math.abs(C.x - C.x0).toFixed(2); out.stillShut = t.blocked(gx, gyy);
        await visit(t, C.x + C.rock * (H + 0.06), C.y); t.stick(-C.rock, 0); await sleep(1800); t.stick(0, 0); out.pushed = +Math.abs(C.x - C.x0).toFixed(2); out.cleared = !t.blocked(gx, gyy);
        paid.length = 0; await visit(t, pen.x, pen.y + 1.9, 200); out.pushOpen = prize.done; const cs = await collectAll(t, prize); out.pushPaid = paid.reduce((a, b) => a + b, 0) === cs.length * TR.COIN_V && cs.length > 0; }
      if (hk) hk.coins = hc; window.RTT_PUTT.close(); sbUser = { id:'chk' }; return out; });
    claim(pzr.pz / pzr.n > 0.4 && pzr.pz / pzr.n < 0.65 && Object.keys(pzr.kinds).length === 4 && Object.values(pzr.kinds).every(v => v >= 8), `about half the trails carry a puzzle, of all four kinds (${pzr.pz} of ${pzr.n}: ${JSON.stringify(pzr.kinds)})`);
    claim(pzr.drops && pzr.solo, `every puzzle has a clue and its own chest of coins, and its trail still has its one chest`);
    claim(pzr.clue, `the local on a puzzle trail gives its clue`);
    claim(pzr.bubStays, `a local's speech bubble stays over the local when the golfer walks away, never following the golfer`);
    claim(pzr.fireHidden && pzr.twoLit && pzr.allLit && pzr.fireOpen && pzr.firePaid > 0 && pzr.firePaid === pzr.fireWant && pzr.fireRec && pzr.fireKept, `the three lights: no chest until all three are lit, then it opens, pays, and stays solved (${JSON.stringify([pzr.fireHidden, pzr.twoLit, pzr.allLit, pzr.fireOpen, pzr.firePaid, pzr.fireRec, pzr.fireKept])})`);
    claim(pzr.digHidden && pzr.dug && pzr.digPaid, `the footprints: the chest is buried until he stands where they stop, then it comes up and pays (${JSON.stringify([pzr.digHidden, pzr.dug, pzr.digPaid])})`);
    claim(pzr.shut && pzr.opened && pzr.shutAgain && pzr.plateOpen && pzr.staysOpen && pzr.platePaid, `the plate: the pen's gate is shut, opens off the plate, shuts again, and stays open once the chest is had (${JSON.stringify([pzr.shut, pzr.opened, pzr.shutAgain, pzr.plateOpen, pzr.staysOpen, pzr.platePaid])})`);
    claim(pzr.blockedAtFirst && pzr.jam <= 0.65 && pzr.stillShut && pzr.pushed >= 1.7 && pzr.cleared && pzr.pushOpen && pzr.pushPaid, `the crate: pushed toward its rock it jams (${pzr.jam} ft), pushed from the rock's side it clears the gap (${pzr.pushed} ft), and the chest pays (${JSON.stringify([pzr.blockedAtFirst, pzr.stillShut, pzr.cleared, pzr.pushOpen, pzr.pushPaid])})`);
    /* THE GYMS ON THEIR TRAILS (gyms.js, trail.js, putt.js). Every gym the tour carries stands on its trail clear of the
       walk, its gate a few steps off the path and reachable, the trail still walkable from start to arch, with its
       civilian at the gate and its vault on the list; and a world with gyms has none of the small puzzles. Then a gym is
       played for real: walked into at its gate, a wrong push undone with the lever (twice, so the civilian's plainer
       line comes), walked out of and back into, and solved by its recorded proof, one tile a step. The vault pays its
       coins once and the badge is kept; opened again the gym shows as it was left solved. */
    const gyr = await pg.evaluate(async () => { const out = { trails:[] }, sleep = ms => new Promise(r => setTimeout(r, ms)), best = {}, GL = window.RTT_PUTT_GYMS;
      for (let n = 1; n <= 198; n++) best[n] = 3;
      localStorage.setItem('bag_ppt_v1@gyc', JSON.stringify({ v:2, met:['clubhouse', 'temple', 'pirate', 'canyon', 'volcano', 'dino', 'sky', 'neon', 'school', 'iceage', 'candy'], tours:{ main:{ lv:198, best, ace:{}, paid:{}, wpaid:{} } } }));
      window.RTT_PUTT.close(); sbUser = { id:'gyc' }; openPutt(); await sleep(300);
      const segMin = (P, x, y) => { let m = 1e9; for (let i = 0; i < P.path.length - 1; i++){ const a = P.path[i], c = P.path[i + 1], dx = c[0] - a[0], dy = c[1] - a[1], L = dx * dx + dy * dy || 1e-9, u = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / L)); m = Math.min(m, Math.hypot(x - a[0] - dx * u, y - a[1] - dy * u)); } return m; };
      const want = GL.GYMS.map(g => g.id).sort().join(), got = []; out.pzGymWorld = 0;
      for (let f = 1; f < 198; f++){ const P = window.RTT_PUTT._trailPlan(f); if (P.puzzle && GL.GYMS.some(g => g.world === P.spec.theme)) out.pzGymWorld++; if (!P.spec.gym) continue; got.push(P.spec.gym);
        const G = P.gym, o = { f, id:P.spec.gym, has:!!G }; out.trails.push(o); if (!G) continue;
        let near = 1e9; for (let y = G.y0; y <= G.y0 + G.d; y += 0.5) for (let x = G.x0; x <= G.x0 + G.w; x += 0.5) near = Math.min(near, segMin(P, x, y));
        o.clear = +near.toFixed(2); o.gateOff = +segMin(P, G.ax, G.ay).toFixed(2);
        const FL = P._fl, G0 = FL.flood(false); o.gateReach = FL.near(G0, G.ax, G.ay + 0.3, 0.9); o.archReach = FL.near(G0, P.arch.x, 1.2, 2);
        o.inside = P.items.filter(t => t.k !== 'vault' && P.inGym(t.x, t.y, 0.3)).length + P.things.filter(t => t.k !== 'gym' && P.inGym(t.x, t.y, 0.3)).length;
        o.civ = !!P.civ && FL.near(G0, P.civ.x, P.civ.y + 1.4, 1.2); o.vault = P.items.some(t => t.k === 'vault'); o.leftNames = window.RTT_PUTT._trailLeft ? window.RTT_PUTT._trailLeft(f + 1) : null; }
      out.all = got.sort().join() === want;
      // play the first gym
      const paid = []; let hk = null, hc = null; const S = () => window.RTT_PUTT._state(), T = () => window.RTT_PUTT._trail();
      const packs = [], hook = () => { const h = S().host; if (h !== hk){ if (hk){ hk.coins = hc; delete hk.pack; } hk = h; hc = h.coins; h.coins = n => { paid.push(n); }; h.pack = (tier) => { packs.push(tier); return 1; }; } };
      const open = async n => { window.RTT_PUTT.close(); openPutt(); await sleep(200); hook(); window.RTT_PUTT._walkTo(n); for (let i = 0; i < 900 && !T(); i++) await sleep(50); await sleep(300); hook(); return T(); };
      const idle = async t => { for (let i = 0; i < 200 && t.gymBusy(); i++) await sleep(20); };
      const play = async (t, ds) => { for (const d of ds){ await idle(t); t.gymStep(d); await sleep(30); } await idle(t); };
      const enter = async t => { const G = t.plan().gym; t.goTo(G.ax, G.ay + 0.25); t.stick(0, -1); for (let i = 0; i < 60 && !t.gym().in; i++) await sleep(40); t.stick(0, 0); await idle(t); return t.gym().in; };
      // the way to the lever from where he stands: a search over the gym's own steps, ending in a reset
      const toLever = t => { const g = t.gym(), seen = new Set([GL.key(g.G, g.s)]), q = [[g.s, []]];
        while (q.length){ const [s, ds] = q.shift(); for (let d = 0; d < 4; d++){ const r = GL.step(g.G, s, d); if (r.ev === 'reset') return ds.concat([d]); if (r.ev !== 'walk' || seen.has(GL.key(g.G, r.s))) continue; seen.add(GL.key(g.G, r.s)); q.push([r.s, ds.concat([d])]); } } return null; };
      const f0 = out.trails.find(o => o.has); if (!f0) return out;
      const t = await open(f0.f), G = t.gym().G, proof = GL.proof(G);
      out.entered = await enter(t); out.startOk = t.gym().s.p === GL.parse(G).start;
      await play(t, proof.slice(0, 10)); const moved = t.gym().s.b.join() !== GL.init(G).b.join();
      for (let k = 0; k < 2; k++){ const way = toLever(t); if (!way) break; await play(t, way); }
      out.reset = moved && t.gym().resets === 2 && GL.key(G, t.gym().s) === GL.key(G, GL.init(G));
      // in the room the line is in the docked panel, and the trail's bubble is not shown
      await sleep(200); out.plain = t.bubble() === G.say[1] && t.gymSays() === G.say[1] && document.querySelector('.pp-bub').hidden;
      // out through the gate, and the civilian says the plainer line to him outside too
      await play(t, [2]); await sleep(200); out.left = !t.gym().in;
      const cv = t.plan().civ; t.goTo(cv.x + 5, cv.y + 4); await sleep(250); t.goTo(cv.x - 1.6, cv.y + 1.2); await sleep(400); out.civSays = t.bubble() === G.say[1];
      out.reentered = await enter(t); paid.length = 0;
      await play(t, proof); await sleep(2200);
      out.solved = t.gym().solved && t.items().find(i => i.k === 'vault').done; out.paid = paid.reduce((a, b) => a + b, 0); out.pay = G.pay; out.packs = packs.slice(); out.keeper = !!G.keeper;
      const rec = JSON.parse(localStorage.getItem('bag_ppt_v1@gyc')); out.badge = (rec.gym || []).indexOf(G.id) >= 0;
      out.msg = t.bubble();
      // again: no second payout, and the gym shows solved
      await play(t, [2, 2]); paid.length = 0; await sleep(100);
      const t2 = await open(f0.f), g2 = t2.gym(); out.keptSolved = g2.solved && g2.s.f > 0 && t2.items().find(i => i.k === 'vault').done;
      await enter(t2); await play(t2, proof); await sleep(600); out.paidAgain = paid.reduce((a, b) => a + b, 0);
      out.leftAfter = window.RTT_PUTT._trailLeft ? window.RTT_PUTT._trailLeft(f0.f + 1) : null;
      out.packsAgain = packs.length;
      if (hk){ hk.coins = hc; delete hk.pack; } window.RTT_PUTT.close(); sbUser = { id:'chk' }; return out; });
    claim(gyr.all && gyr.trails.length && gyr.trails.every(o => o.has), `every gym in gyms.js stands on its trail (${gyr.trails.map(o => o.id + ' on the trail into ' + (o.f + 1)).join(', ')})`);
    claim(gyr.trails.every(o => o.clear > 2.2 + 1.2 && o.gateOff < 9.5 && o.inside === 0), `each gym is clear of the walk, its gate a few steps off the path, and nothing else stands in it (${JSON.stringify(gyr.trails.map(o => [o.clear, o.gateOff, o.inside]))})`);
    claim(gyr.trails.every(o => o.gateReach && o.archReach && o.civ && o.vault), `each gym's gate and civilian can be walked to and its trail is still walkable to the arch, its vault on the list (${JSON.stringify(gyr.trails.map(o => [o.gateReach, o.archReach, o.civ, o.vault]))})`);
    claim(gyr.pzGymWorld === 0, `a world with gyms carries none of the small trail puzzles (${gyr.pzGymWorld})`);
    claim(gyr.trails.every(o => !o.leftNames || o.leftNames.indexOf('a gym') >= 0) && gyr.leftAfter && gyr.leftAfter.indexOf('a gym') < 0, `skipping a gym's trail warns that its gym is left, and not once it is solved (${JSON.stringify(gyr.leftAfter)})`);
    claim(gyr.entered && gyr.startOk && gyr.reset, `walked into at its gate he moves a tile a step, and the lever puts every piece back (${JSON.stringify([gyr.entered, gyr.startOk, gyr.reset])})`);
    claim(gyr.plain && gyr.civSays, `after two resets the civilian's plainer line comes, in the gym's docked panel and at the gate (${JSON.stringify([gyr.plain, gyr.civSays])})`);
    claim(gyr.left && gyr.reentered && gyr.solved && gyr.paid === gyr.pay && gyr.badge, `out through the gate and in again, the recorded proof solves it: the vault opens, pays ${gyr.paid} of ${gyr.pay} coins and the badge is kept`);
    claim(gyr.keptSolved && gyr.paidAgain === 0, `opened again the gym shows solved, barrels down in their holes, and its vault never pays twice (${gyr.paidAgain})`);
    claim(gyr.packs.length === 1 && gyr.packs[0] === (gyr.keeper ? 'tour' : 'base') && gyr.packsAgain === 1, `the vault pays a free pack once: a Pro Shop pack for a world's first gym, a Tour pack for its gatekeeper (${JSON.stringify(gyr.packs)}, ${gyr.packsAgain} in all)`);
    // THE GATEKEEPER GUARDS THE WORLD'S LAST HOLE (the owner, 2026-10-17), and CHESTS ROLL THEIR ODDS once, fixed
    const gk = await pg.evaluate(async () => { const out = {}, sleep = ms => new Promise(r => setTimeout(r, ms)), GL = window.RTT_PUTT_GYMS, K = 'bag_ppt_v1@gk';
      const keep = GL.GYMS.filter(g => g.keeper), mid = GL.GYMS.filter(g => !g.keeper), W = window.RTT_PUTT._trailPlan; out.keepers = keep.length;
      const n = (() => { for (let f = 1; f < 198; f++){ const P = W(f); if (P.spec.gym === keep[0].id) return f + 1; } return 0; })(); out.n = n;
      const best = {}; for (let i = 1; i < n; i++) best[i] = 3;
      const rec = (gym) => localStorage.setItem(K, JSON.stringify({ v:2, lives:9, l9:1, back:[], gym, tours:{ main:{ lv:n, best, ace:{}, paid:{}, wpaid:{} } } }));
      window.RTT_PUTT.close(); sbUser = { id:'gk' }; window.RTT_PUTT_MAPFIRST = true; rec([]); openPutt(); await sleep(400);
      out.blocks = !!window.RTT_PUTT._keeperBlocks(n); window.RTT_PUTT._level(n, 'main'); await sleep(200);
      const sh = [...document.querySelectorAll('.pp-sheet .t')].map(e => e.textContent).join('|'); out.sheet = sh.indexOf(keep[0].name) >= 0; out.notPlaying = window.RTT_PUTT._state().screen !== 'play';
      out.walkBtn = !!document.querySelector('.pp-sheet [data-walk]');
      window.RTT_PUTT.close(); rec([keep[0].id]); openPutt(); await sleep(300); out.openAfter = !window.RTT_PUTT._keeperBlocks(n);
      best[n] = 4; window.RTT_PUTT.close(); rec([]); openPutt(); await sleep(300); out.playedStaysOpen = !window.RTT_PUTT._keeperBlocks(n);
      // chest odds: fixed for a key, and near the table over many chests
      const R = window.RTT_PUTT._chestRoll, cnt = { coins:0, haul:0, item:0, pack:0 }; out.fixed = R('main:7', 'ch0') === R('main:7', 'ch0');
      for (let i = 0; i < 4000; i++) cnt[R('main:' + (i % 198 + 1), 'ch' + i)]++; out.cnt = cnt;
      const h = window.RTT_PUTT._state().host, hp = h.pack, hi = h.commonItem; h.pack = () => 0; h.commonItem = () => null;
      let k = null; for (let i = 0; i < 4000 && !k; i++) if (R('main:' + (i % 198 + 1), 'x' + i) === 'pack') k = ['main:' + (i % 198 + 1), 'x' + i];
      out.fallback = k ? window.RTT_PUTT._chestLuck(k[0], k[1], 600) : null;
      h.pack = () => 1; out.packMsg = k ? window.RTT_PUTT._chestLuck(k[0], k[1], 600) : null; h.pack = hp; h.commonItem = hi;
      window.RTT_PUTT.close(); localStorage.removeItem(K); sbUser = { id:'chk' }; return out; });
    claim(gk.keepers >= 1 && gk.n > 0 && gk.blocks && gk.sheet && gk.notPlaying && gk.walkBtn, `the gatekeeper guards the world's last hole: Hole ${gk.n} asks for it to be solved first, with a way to walk to it (${JSON.stringify(gk)})`);
    claim(gk.openAfter && gk.playedStaysOpen, `solved, the hole opens; a hole already played is never taken away (${JSON.stringify([gk.openAfter, gk.playedStaysOpen])})`);
    claim(gk.fixed && gk.cnt.coins > 2900 && gk.cnt.coins < 3350 && gk.cnt.haul > 450 && gk.cnt.haul < 750 && gk.cnt.item > 120 && gk.cnt.item < 290 && gk.cnt.pack > 40 && gk.cnt.pack < 130, `a chest's roll is fixed, and over 4,000 chests the odds come out near 78/15/5/2 (${JSON.stringify(gk.cnt)})`);
    claim(gk.fallback && gk.fallback.coins === 1200 && gk.packMsg && gk.packMsg.coins === 0 && /pack/.test(gk.packMsg.msg), `a lucky pack that cannot land is a big haul instead (${JSON.stringify([gk.fallback, gk.packMsg])})`);
    /* NOTHING COVERS THE BOARD (the owner, 2026-10-17, of a phone screenshot of The Cargo Hold with the civilian's
       bubble over the grid: "text should not be covering the game like this"). On a phone (390 x 844, touch) and a
       desktop (1440 x 900), in a gatekeeper's room: out on the trail the civilian's bubble stays off the room and its
       gate; in the room the docked panel, its goal line, its controls and the pad sit outside the board (the room as
       drawn), the stick and the bubble are not shown, the whole room is on the screen and the buttons are big enough to
       hit. UNDO puts back the state before the last move exactly and is not a reset (the civilian counts resets);
       RESTART is the start, and is undone like any move; Z and R do the same from the keys. On the desktop the gym is
       then solved from its start, and nothing the vault pays with lands over the board. */
    const lay = {};
    for (const [vw, vh, touch] of [[390, 844, true], [1440, 900, false]]){
      const cx = await b.newContext({ viewport:{ width:vw, height:vh }, hasTouch:touch, isMobile:touch, deviceScaleFactor:touch ? 2 : 1 }), p2 = await cx.newPage();
      p2.on('pageerror', e => errs.push(e.message)); await p2.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
      await p2.goto(base + '/golf/', { waitUntil:'domcontentloaded' });
      await p2.waitForFunction(() => window.RTT_PUTT && window.RTT_PUTT_3D && window.RTT_PUTT_GYMS && typeof puttOn === 'function' && document.readyState === 'complete', null, { timeout:60000 });
      lay[vw] = await p2.evaluate(async (desk) => { const out = {}, sleep = ms => new Promise(r => setTimeout(r, ms)), GL = window.RTT_PUTT_GYMS, K = 'bag_ppt_v1@lay', best = {};
        for (let n = 1; n <= 198; n++) best[n] = 3;
        localStorage.setItem(K, JSON.stringify({ v:2, lives:9, met:['clubhouse', 'temple', 'pirate', 'canyon', 'volcano', 'dino', 'sky', 'neon', 'school', 'iceage', 'candy'], tours:{ main:{ lv:198, best, ace:{}, paid:{}, wpaid:{} } } }));
        window.RTT_PUTT_MAPFIRST = true; sbUser = { id:'lay' }; sbUsername = 'SlimeyB3'; passTester = () => false; openPutt(); await sleep(400);
        const G = GL.GYMS.find(g => g.keeper && g.world); let f = 0; for (let i = 1; i < 198 && !f; i++) if (window.RTT_PUTT._trailPlan(i).spec.gym === G.id) f = i;
        window.RTT_PUTT._walkTo(f); const T = () => window.RTT_PUTT._trail(); for (let i = 0; i < 900 && !T(); i++) await sleep(50); await sleep(600);
        const t = T(), hit = (a, c) => !!a && !!c && a.left < c.right && a.right > c.left && a.top < c.bottom && a.bottom > c.top;
        const idle = async () => { for (let i = 0; i < 200 && t.gymBusy(); i++) await sleep(20); };
        const play = async ds => { for (const d of ds){ await idle(); t.gymStep(d); await sleep(30); } await idle(); };
        const key = code => { window.dispatchEvent(new KeyboardEvent('keydown', { code, key:code.slice(3).toLowerCase(), bubbles:true })); window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles:true })); };
        // out on the trail, walked up to the civilian
        const cv = t.plan().civ; t.goTo(cv.x + 5, cv.y + 4); await sleep(250); t.goTo(cv.x - 1.6, cv.y + 1.2); await sleep(900);
        let R = t.gymRects(); out.civ = { says:t.bubble() === GL.clue(G, 0), clear:!!R.bubble && !hit(R.bubble, R.board) };
        // in, and where everything is
        const Gp = t.plan().gym; t.goTo(Gp.ax, Gp.ay + 0.25); t.stick(0, -1); for (let i = 0; i < 60 && !t.gym().in; i++) await sleep(40); t.stick(0, 0); await idle(); await sleep(1200);
        R = t.gymRects(); out.in = t.gym().in; out.board = R.board; out.kk = [R.kk, R.kkBase];
        out.covered = ['panel', 'goal', 'say', 'controls', 'pad', 'stick', 'bubble'].filter(k => hit(R[k], R.board)).concat(R.buttons.filter(x => hit(x, R.board)).map(() => 'a button'));
        out.missing = ['panel', 'goal', 'say', 'controls', 'pad'].filter(k => !R[k]).concat(R.buttons.some(x => !x) ? ['a button'] : []);
        out.hidden = !R.stick && !R.bubble && [...document.querySelectorAll('.pp-rbar,.pp-tgoal')].every(e => !e.offsetParent);
        out.onScreen = R.board.left >= 0 && R.board.top >= 0 && R.board.right <= innerWidth && R.board.bottom <= innerHeight;
        out.goal = document.querySelector('[data-ggoal]').textContent === GL.goal(G); out.big = R.buttons.every(x => x && x.bottom - x.top >= 44) && [...document.querySelectorAll('[data-gpad] button')].every(e => e.getBoundingClientRect().height >= 40);
        // undo: one move back, exactly, and no reset counted
        const pf = GL.proof(G), g = () => t.gym(), k = () => GL.key(G, g().s), k0 = GL.key(G, GL.init(G));
        await play(pf.slice(0, 3)); const before = k(), r0 = g().resets, n0 = g().n; await play(pf.slice(3, 5)); const mid = k();
        if (desk) key('KeyZ'); else document.querySelector('[data-gundo]').click(); await sleep(120); const one = k();
        if (desk) key('KeyZ'); else document.querySelector('[data-gundo]').click(); await sleep(120);
        out.undo = { moved:mid !== before, stepped:one !== mid && one !== before, back:k() === before, resets:g().resets === r0, n:g().n === n0, undos:g().undos, at:GL.me(G, g().s) };
        // restart (the button, or R), and undone
        if (desk) key('KeyR'); else document.querySelector('[data-grestart]').click(); await sleep(150);
        out.restart = { start:k() === k0, resets:g().resets === r0 + 1, moves:g().n === 0 };
        if (desk) key('KeyZ'); else document.querySelector('[data-gundo]').click(); await sleep(120); out.restart.undone = k() === before;
        // the pad steps him (a press, as a thumb does)
        { const s1 = k(), bt = document.querySelector('[data-gpad] [data-d="' + pf[3] + '"]'), r1 = bt.getBoundingClientRect(), o = { bubbles:true, clientX:r1.left + 10, clientY:r1.top + 10, pointerId:9 };
          bt.dispatchEvent(new PointerEvent('pointerdown', o)); await sleep(60); bt.dispatchEvent(new PointerEvent('pointerup', o)); await idle(); await sleep(60); out.pad = k() !== s1 && g().n === n0 + 1; }
        if (desk){ document.querySelector('[data-grestart]').click(); await sleep(150); await play(pf); await sleep(2800);
          const toasts = [...document.querySelectorAll('[role=status]')].map(e => e.getBoundingClientRect());
          out.won = g().solved; out.toastsOver = toasts.filter(x => hit(x, R.board)).length; out.wonLine = /solved/.test(t.gymSays()) && document.querySelector('.pp-bub').hidden; }
        window.RTT_PUTT.close(); localStorage.removeItem(K); return out; }, !touch);
      await cx.close(); }
    for (const w of [390, 1440]){ const L = lay[w], nm = w === 390 ? 'on a 390 x 844 phone' : 'on a 1440 x 900 desktop';
      claim(L.civ.says && L.civ.clear, `${nm}, out on the trail the civilian's bubble stays off the gym's room and gate (${JSON.stringify(L.civ)})`);
      claim(L.in && !L.covered.length && !L.missing.length && L.hidden && L.onScreen && L.goal && L.big, `${nm}, in the room nothing covers the board: the panel, goal line, controls and pad sit outside it, the stick is hidden, the whole room is on screen at zoom ${L.kk[0]} (${JSON.stringify({ covered:L.covered, missing:L.missing, hidden:L.hidden, onScreen:L.onScreen, goal:L.goal, big:L.big, board:L.board })})`);
      claim(L.undo.moved && L.undo.stepped && L.undo.back && L.undo.resets && L.undo.n, `${nm}, Undo (${w === 390 ? 'the button' : 'Z'}) puts back the state before each move exactly and is not counted as a reset (${JSON.stringify(L.undo)})`);
      claim(L.restart.start && L.restart.resets && L.restart.moves && L.restart.undone && L.pad, `${nm}, Restart (${w === 390 ? 'the button' : 'R'}) is the start and counts as a reset, Undo takes it back, and the pad steps him (${JSON.stringify([L.restart, L.pad])})`); }
    claim(lay[1440].won && lay[1440].toastsOver === 0 && lay[1440].wonLine, `solved, the vault says what it paid in the panel, and no toast lands over the board (${JSON.stringify([lay[1440].won, lay[1440].toastsOver, lay[1440].wonLine])})`);
    /* A KIND OF ANOTHER INPUT, PLAYED BY TAPS: the worked example (gymkinds/example.js, a tap kind in no world) is put
       on Pirate Cove's mid-world trail for the length of this check and played in a real room by tapping its tiles on
       the screen: the frame highlights what a tap changes, Undo takes a tap back, and the winning tap opens the vault. */
    const ex = await pg.evaluate(async () => { const out = {}, sleep = ms => new Promise(r => setTimeout(r, ms)), GL = window.RTT_PUTT_GYMS, K = 'bag_ppt_v1@ex', best = {};
      await new Promise((res, rej) => { const sc = document.createElement('script'); sc.src = 'putt/gymkinds/example.js?v=check'; sc.onload = res; sc.onerror = rej; document.head.appendChild(sc); });
      GL.rescan(); const E = GL.byId('example1'), M = GL.GYMS.find(g => g.world === 'pirate' && !g.keeper), w0 = [E.world, E.leg, M.leg]; E.world = 'pirate'; E.leg = M.leg; M.leg = -1;
      try{ for (let n = 1; n <= 198; n++) best[n] = 3;
        localStorage.setItem(K, JSON.stringify({ v:2, lives:9, met:['clubhouse', 'temple', 'pirate', 'canyon', 'volcano', 'dino', 'sky', 'neon', 'school', 'iceage', 'candy'], tours:{ main:{ lv:198, best, ace:{}, paid:{}, wpaid:{} } } }));
        window.RTT_PUTT.close(); sbUser = { id:'ex' }; openPutt(); await sleep(300); const h = window.RTT_PUTT._state().host, hc = h.coins, hp = h.pack; h.coins = () => {}; h.pack = () => 1;
        let f = 0; for (let i = 1; i < 198 && !f; i++) if (window.RTT_PUTT._trailPlan(i).spec.gym === E.id) f = i; out.f = f;
        window.RTT_PUTT._walkTo(f); const T = () => window.RTT_PUTT._trail(); for (let i = 0; i < 900 && !T(); i++) await sleep(50); await sleep(500);
        const t = T(), Gp = t.plan().gym; t.goTo(Gp.ax, Gp.ay + 0.25); t.stick(0, -1); for (let i = 0; i < 60 && !t.gym().in; i++) await sleep(40); t.stick(0, 0); await sleep(600);
        const g = () => t.gym(), k = () => GL.key(E, g().s), box = document.querySelector('.pp-tbox').getBoundingClientRect();
        const tap = async i => { const q = t.gymXY(i), p = t.scr(q[0], q[1], 0.45), v = t.view(), dpr = v.W / box.width, o = { bubbles:true, clientX:box.left + p[0] / dpr, clientY:box.top + p[1] / dpr, pointerId:5, isPrimary:true };
          const el = document.elementFromPoint(o.clientX, o.clientY); el.dispatchEvent(new PointerEvent('pointerdown', o)); await sleep(40); el.dispatchEvent(new PointerEvent('pointerup', o)); await sleep(300); };
        const pf = GL.proof(E); out.inp = g().inp; out.hot = t.gymHot().hot.join() === GL.parse(E).lamps.join();
        await tap(pf[0]); const one = k(); out.tapped = one !== GL.key(E, GL.init(E)); t.gymUndo(); await sleep(100); out.undone = k() === GL.key(E, GL.init(E)) && g().resets === 0;
        for (const i of pf) await tap(i); await sleep(2400); out.won = GL.won(E, g().s) && g().solved && /solved/.test(t.gymSays());
        h.coins = hc; h.pack = hp; }
      finally { E.world = w0[0]; E.leg = w0[1]; M.leg = w0[2]; window.RTT_PUTT.close(); localStorage.removeItem(K); sbUser = { id:'chk' }; }
      return out; });
    claim(ex.f > 0 && ex.inp === 'tap' && ex.hot && ex.tapped && ex.undone && ex.won, `the worked example kind plays in a real room by tapping: what a tap changes is lit, Undo takes a tap back, the winning tap opens the vault (${JSON.stringify(ex)})`);
    // THE WORLD IS WHERE THE MODE OPENS. Opening the Tour drops the player's own golfer onto the trail to the
    // next hole, with Map top right, and the map's close goes back to the world. The first trail of every
    // world has its greeter, who walks up and talks the first time and waits by the path after.
    const wo = await pg.evaluate(async () => { const out = {}, sleep = ms => new Promise(r => setTimeout(r, ms)), K = 'bag_ppt_v1@world';
      const S = () => window.RTT_PUTT._state(), T = () => window.RTT_PUTT._trail();
      window.RTT_PUTT.close(); window.RTT_PUTT_MAPFIRST = false; sbUser = { id:'world' }; localStorage.removeItem(K); openPutt();
      for (let i = 0; i < 600 && !T(); i++) await sleep(50);
      out.world = !!T() && S().screen === 'trail' && !!document.querySelector('.pp-wv [data-mapb]') && !!document.querySelector('.pp-wv .pp-tgoal');
      out.ban = !!document.querySelector('.pp-wban');
      out.host = !!(T() && T().host());
      for (let i = 0; i < 200 && !document.querySelector('.pp-gd'); i++) await sleep(50);
      out.talk = !!document.querySelector('.pp-gd') && T().host().ph === 'talk' && /Pro Pete/.test(document.querySelector('.pp-gdn').textContent);
      out.face = !!(document.querySelector('.pp-gdp.pic') && document.querySelector('.pp-gdp.pic').style.backgroundImage);
      const p0 = T().pos(); T().stick(0, -1); await sleep(400); out.held = Math.abs(T().pos()[1] - p0[1]) < 0.05; T().stick(0, 0);
      for (let i = 0; i < 60 && document.querySelector('.pp-gd'); i++){ document.querySelector('.pp-gd').dispatchEvent(new PointerEvent('pointerdown', { bubbles:true })); await sleep(40); }
      out.done = !document.querySelector('.pp-gd') && T().host().ph === 'idle';
      out.met = (JSON.parse(localStorage.getItem(K)).met || []).indexOf('clubhouse') >= 0;
      await sleep(100); out.talkBtn = !!document.querySelector('[data-talk]:not([hidden])');
      document.querySelector('[data-mapb]').click(); await sleep(150); out.map = S().screen === 'menu' && !!document.querySelector('.pp-toworld');
      document.querySelector('.pp-toworld').click(); for (let i = 0; i < 400 && !T(); i++) await sleep(50); await sleep(200);
      out.back = S().screen === 'trail' && T().host() && T().host().ph === 'idle' && !document.querySelector('.pp-gd');
      // the world is alive: things fly and drift round him, and Pirate Cove has ships sailing on its own sea
      out.alive = T().life().flyers > 0 && T().life().motes > 0;
      window.RTT_PUTT._walkTo(73); for (let i = 0; i < 600 && !(T() && T().life().theme === 'pirate'); i++) await sleep(50); await sleep(300);
      const L3 = T().life(), P3 = T().plan(); out.ships = L3.ships.length; out.afloat = L3.ships.every(q => q.y < P3.b[1] || q.y > P3.b[3] || P3.seaAt(q.x, q.y));
      const y0 = L3.ships[0].y; await sleep(700); out.sails = Math.abs(T().life().ships[0].y - y0) > 0.5;
      // every world's first trail has its greeter, on both tours
      out.greeters = []; for (let w = 0; w < 11; w++){ const P = window.RTT_PUTT._trailPlan(w * 18); out.greeters.push(!!(P.spec.greet && P.items.some(t => t.k === 'host'))); }
      for (let w = 0; w < 2; w++){ const P = window.RTT_PUTT._trailPlan(w * 9, 'members'); out.greeters.push(!!(P.spec.greet && P.items.some(t => t.k === 'host'))); }
      out.notMid = !window.RTT_PUTT._trailPlan(5).spec.greet;
      out.secrets = []; out.secretElse = []; out.secretAt = [];
      for (let w = 0; w < 11; w++){ const f = window.RTT_PUTT._secretFrom(w + 1), P = window.RTT_PUTT._trailPlan(f); out.secretAt.push(f - w * 18 + 1);
        out.secrets.push(!!(P.secret && P.secret.i === w + 1 && P.spur2 && P.spur2.length > 1 && P.secret.reach && P.items.some(t => t.k === 'npc'))); }
      for (let f = 0; f < 198; f++) if (window.RTT_PUTT._trailPlan(f).secret && out.secretAt[Math.floor(f / 18)] !== f % 18 + 1) out.secretElse.push(f + 1);
      window.RTT_PUTT.close(); window.RTT_PUTT_MAPFIRST = true; sbUser = { id:'chk' }; return out; });
    claim(wo.world && wo.ban && wo.host, `opening the Tour drops the golfer into the world on the trail to the next hole, with its title card and Map top right (${wo.world}, ${wo.ban}, ${wo.host})`);
    claim(wo.talk && wo.face && wo.held, `the world's greeter walks up and talks, with their face in the box, and walking waits for them (${wo.talk}, ${wo.face}, ${wo.held})`);
    claim(wo.done && wo.met && wo.talkBtn, `tapping through the talk lets the golfer go, it is kept on the record, and Talk plays it again (${wo.done}, ${wo.met}, ${wo.talkBtn})`);
    claim(wo.map && wo.back, `Map opens the map and its World button goes back into the world, where the greeter does not start over (${wo.map}, ${wo.back})`);
    claim(wo.alive && wo.ships === 2 && wo.afloat && wo.sails, `the world is alive round him, and two pirate ships sail Pirate Cove's sea (${wo.alive}, ${wo.ships}, ${wo.afloat}, ${wo.sails})`);
    claim(wo.secrets.every(Boolean) && !wo.secretElse.length, `every world has one walk with a second path to a secret way in that can be walked to, with a local on it, and no other walk has one (${wo.secrets.map(Number).join('')}${wo.secretElse.length ? ', also on ' + wo.secretElse.join(' ') : ''})`);
    claim(wo.secretAt.every(k => k > 1 && k <= 18) && new Set(wo.secretAt).size === wo.secretAt.length, `the secrets sit on a different walk in each world, never its first (${wo.secretAt.join(' ')})`);
    claim(wo.greeters.every(Boolean) && wo.notMid, `all eleven worlds and both Members worlds have a greeter on their first trail, and only there (${wo.greeters.map(Number).join('')})`);
    // THE HOLES AT EACH END OF A WALK ARE THE REAL HOLES: the one you just played behind you, the next one past the arch,
    // each drawn from its own compiled course, with its cup where the course puts it
    const ft = await pg.evaluate(() => { const P = window.RTT_PUTT._trailPlan(17), f = P.feet || [];
      const to = f[0], fr = f[1], cupAt = o => { const r = P.footAt(o.cup[0], o.cup[1]); return r && r.c; };
      const carpet = o => { let n = 0; for (let j = 0; j < o.f.H; j += 3) for (let i = 0; i < o.f.W; i += 3){ const c = o.f.codes[j * o.f.W + i]; if (c === 1 || c === 2) n++; } return n; };
      const P0 = window.RTT_PUTT._trailPlan(0);
      return { n:f.length, to:to && to.f.n, from:fr && fr.f.n, ahead:to && to.Y0 + to.h < P.start.y, behind:fr && fr.Y0 > P.start.y, cups:[cupAt(to), cupAt(fr)], carpet:[carpet(to), carpet(fr)], first:(P0.feet || []).length, len:P.L }; });
    claim(ft.n === 2 && ft.to === 18 && ft.from === 17 && ft.ahead && ft.behind && ft.cups[0] === 12 && ft.cups[1] === 12 && ft.carpet[0] > 20 && ft.carpet[1] > 20 && ft.first === 1 && ft.len <= 110,
      `a walk from 17 to 18 has the real hole 17 behind him and hole 18 past the arch, each with its own carpet and cup (${JSON.stringify(ft)})`);
    // STARTING A HOLE FROM THE MAP WARNS when its trail still holds rewards, and only then
    const sk = await pg.evaluate(async () => { const out = {}, sleep = ms => new Promise(r => setTimeout(r, ms)), K = 'bag_ppt_v1@skw', S = () => window.RTT_PUTT._state();
      window.RTT_PUTT.close(); window.RTT_PUTT_MAPFIRST = true; sbUser = { id:'skw' };
      localStorage.setItem(K, JSON.stringify({ v:2, lives:3, met:['clubhouse'], tours:{ main:{ lv:3, best:{ 1:2, 2:2 }, ace:{}, paid:{}, wpaid:{} } } }));
      openPutt(); for (let i = 0; i < 100 && !document.querySelector('.pp-map [data-lv="3"]'); i++) await sleep(50);
      out.left = window.RTT_PUTT._left('main', 3).length;
      document.querySelector('.pp-map [data-lv="3"]').click(); await sleep(60); const w = document.querySelector('.pp-skipw');
      out.warn = !!w && /forfeit/i.test(w.innerText) && !!w.querySelector('[data-walk]'); out.still = S().screen !== 'play';
      w && w.querySelector('[data-n]').click(); out.cancel = !document.querySelector('.pp-skipw') && S().screen !== 'play';
      document.querySelector('.pp-map [data-lv="2"]').click(); for (let i = 0; i < 100 && S().screen !== 'play'; i++) await sleep(50);
      out.replay = S().screen === 'play' && !document.querySelector('.pp-skipw');
      window.RTT_PUTT.close(); openPutt(); for (let i = 0; i < 100 && !document.querySelector('.pp-map [data-lv="3"]'); i++) await sleep(50);
      document.querySelector('.pp-map [data-lv="3"]').click(); await sleep(60); document.querySelector('.pp-skipw [data-walk]').click();
      for (let i = 0; i < 400 && !window.RTT_PUTT._trail(); i++) await sleep(50); out.walk = S().screen === 'trail';
      window.RTT_PUTT.close(); openPutt(); for (let i = 0; i < 100 && !document.querySelector('.pp-map [data-lv="3"]'); i++) await sleep(50);
      document.querySelector('.pp-map [data-lv="3"]').click(); await sleep(60); document.querySelector('.pp-skipw [data-skip]').click();
      for (let i = 0; i < 100 && S().screen !== 'play'; i++) await sleep(50); out.skip = S().screen === 'play';
      window.RTT_PUTT.close(); localStorage.removeItem(K); sbUser = { id:'chk' }; return out; });
    claim(sk.left > 0 && sk.warn && sk.still && sk.cancel && sk.replay && sk.walk && sk.skip,
      `a hole started from the map warns that its trail's rewards are forfeit; Walk goes to the trail, Play goes to the hole, and a hole already beaten does not warn (${JSON.stringify(sk)})`);
    // THE WORLDS AHEAD ARE UNDER CLOUD. No name of a world not yet reached shows on the map, the home card or the
    // walk; the gate shut leaves the clouds; the gate with its stars parts them, and only then is the world named.
    const cl = await pg.evaluate(async () => { const out = {}, sleep = ms => new Promise(r => setTimeout(r, ms)), K = 'bag_ppt_v1@cld', T = () => window.RTT_PUTT._trail();
      const hidden = /Lost Temple|Pirate Cove|Canyon Mine|Volcano Island|Dino Valley|Sky Islands|Neon Arcade|Schoolyard|Ice Age|Candy Works|Front Steps/;
      const rec = (lv, s) => { const best = {}; for (let n = 1; n <= 18; n++) best[n] = s; return { v:2, lives:3, met:['clubhouse'], tours:{ main:{ lv:lv, best:best, ace:{}, paid:{}, wpaid:{} } } }; };
      window.RTT_PUTT.close(); window.RTT_PUTT_MAPFIRST = true; sbUser = { id:'cld' };
      // short of the stars: 18 pars is 18 stars, under the 40 the gate asks
      localStorage.setItem(K, JSON.stringify(rec(18, 3))); openPutt(); for (let i = 0; i < 100 && !document.querySelector('.pp-map [data-lv="1"]'); i++) await sleep(50);
      out.map = !hidden.test(document.body.innerText) && document.querySelectorAll('.pp-cloudo').length === 10 && !document.querySelector('.pp-map [data-lv="19"]');
      out.card = window.RTT_PUTT.summary().world === 'The Clubhouse';
      window.RTT_PUTT._walkTo(18); for (let i = 0; i < 400 && !T(); i++) await sleep(30); await sleep(200);
      out.walk = !hidden.test(document.body.innerText) && T().clouds() === 'on';
      T().goTo(T().plan().gate.x, T().plan().gate.y + 2); for (let i = 0; i < 100 && !document.querySelector('.pp-door'); i++) await sleep(30);
      const d0 = document.querySelector('.pp-door'); out.shut = !!d0 && d0.getAttribute('data-door') === 'clouds' && !hidden.test(d0.innerText);
      for (let i = 0; i < 200 && document.querySelector('.pp-door'); i++) await sleep(30); await sleep(300); out.stays = T().clouds() === 'on' && !(JSON.parse(localStorage.getItem(K)).rv || []).length;
      // with the stars: the door opens on it, the clouds part and the world is named
      window.RTT_PUTT.close(); localStorage.setItem(K, JSON.stringify(rec(19, 1))); openPutt(); await sleep(300);
      window.RTT_PUTT._walkTo(18); for (let i = 0; i < 400 && !T(); i++) await sleep(30); await sleep(200);
      out.before = !/Schoolyard/.test(document.querySelector('.pp-tgoal').textContent);
      T().goTo(T().plan().gate.x, T().plan().gate.y + 2); for (let i = 0; i < 100 && !document.querySelector('.pp-door'); i++) await sleep(30);
      out.named = /Schoolyard/.test((document.querySelector('.pp-door') || {}).textContent || '');
      const seen = []; for (let i = 0; i < 200; i++){ const c = T() && T().clouds(); if (seen[seen.length - 1] !== c) seen.push(c); if (c === 'off') break; await sleep(30); }
      out.parts = seen.join(','); for (let i = 0; i < 150 && !/Schoolyard/.test(document.querySelector('.pp-tgoal').textContent); i++) await sleep(30);
      out.after = /Schoolyard/.test(document.querySelector('.pp-tgoal').textContent) && (JSON.parse(localStorage.getItem(K)).rv || []).indexOf('main:1') >= 0;
      // THE GREETER STOPPED A HAIR SHORT OF TALKING, FOR EVER. Held 3.2 ft and a ten millionth away, they have to talk
      // a greeter waits on their own side of the gate, so walk through it first
      for (let i = 0; i < 100 && document.querySelector('.pp-door'); i++) await sleep(30);
      const hp = T().host(); if (hp) T().goTo(hp.x, Math.min(T().plan().gate.y - 2, hp.y + 10));
      for (let i = 0; i < 300 && !(T().host() && T().host().ph === 'come'); i++) await sleep(20);
      const h = T().host(); out.come = !!h && h.ph === 'come';
      for (let i = 0; i < 25 && T().host().ph === 'come'; i++){ const q = T().host(); T().goTo(q.x, q.y + 3.2000001); await sleep(16); }
      out.talks = T().host().ph === 'talk';
      window.RTT_PUTT.close(); localStorage.removeItem(K); sbUser = { id:'chk' }; return out; });
    claim(cl.map && cl.card && cl.walk && cl.shut && cl.stays, `the worlds ahead are under cloud: no name of one on the map, the home card or the walk, and a shut gate leaves them hidden (${JSON.stringify(cl)})`);
    claim(cl.before && cl.named && /parting/.test(cl.parts) && /off$/.test(cl.parts) && cl.after, `with the stars the gate opens, the clouds part and only then is the world named (${cl.parts})`);
    claim(cl.come && cl.talks, `a greeter who reaches talking distance talks, rather than stopping a hair short and holding the golfer for ever (${cl.come}, ${cl.talks})`);
    // A PLANT IS WALKED THROUGH, and it bends away from him and springs back once he is past
    const pl = await pg.evaluate(async () => { const out = {}, sleep = ms => new Promise(r => setTimeout(r, ms)), K = 'bag_ppt_v1@plt', T = () => window.RTT_PUTT._trail();
      window.RTT_PUTT.close(); window.RTT_PUTT_MAPFIRST = true; sbUser = { id:'plt' };
      localStorage.setItem(K, JSON.stringify({ v:2, lives:3, met:['clubhouse'], tours:{ main:{ lv:3, best:{ 1:2, 2:2 }, ace:{}, paid:{}, wpaid:{} } } }));
      openPutt(); await sleep(300); window.RTT_PUTT._walkTo(2); for (let i = 0; i < 400 && !T(); i++) await sleep(30); await sleep(300);
      const P = T().plan(), ps = T().plants(); out.n = ps.length; const q = ps.filter(p => p.y > 10 && p.y < P.L - 10)[0];
      out.noWall = !!q && !P.cols.some(c => Math.hypot(c.x - q.x, c.y - q.y) < 0.05);
      T().goTo(q.x - 0.6, q.y + 0.1); let mx = 0; for (let i = 0; i < 20; i++){ await sleep(30); const b = T().plants().find(p => p.x === q.x).b; mx = Math.max(mx, Math.abs(b)); }
      out.bent = mx > 0.1; out.inside = T().plants().find(p => p.x === q.x).in;
      T().goTo(q.x + 6, q.y + 0.1); await sleep(1500); out.back = Math.abs(T().plants().find(p => p.x === q.x).b) < 0.02;
      window.RTT_PUTT.close(); localStorage.removeItem(K); sbUser = { id:'chk' }; return out; });
    claim(pl.n > 10 && pl.noWall && pl.bent && pl.inside && pl.back, `bushes and ferns are walked through, bend away from him and spring back once he is past (${JSON.stringify(pl)})`);
    // SPARE LIVES FILL THE HEARTS (the owner, 2026-10-17). On this device: below the max a spare goes straight in and
    // cancels the clock due back last; with the hearts full it waits as +N, and fills the next life lost.
    const sf = await pg.evaluate(async () => { const out = {}, sleep = ms => new Promise(r => setTimeout(r, ms)), K = 'bag_ppt_v1@sfill', now = Date.now(),
        rec = o => JSON.stringify(Object.assign({ v:2, l9:1, lt:now, tours:{ main:{ lv:3, best:{ 1:2, 2:2 }, ace:{}, paid:{}, wpaid:{} } } }, o)), get = () => JSON.parse(localStorage.getItem(K));
      window.RTT_PUTT.close(); sbUser = { id:'sfill' };
      localStorage.setItem(K, rec({ lives:6, back:[now + 3600e3, now + 7200e3, now + 10800e3], refillAt:now + 3600e3, bank:['life:9', 'life:12'] }));
      openPutt(); for (let i = 0; i < 60 && get().lives !== 8; i++) await sleep(50);
      let st = get(); out.lives = st.lives; out.clocks = st.back.length; out.kept = st.back[0] === now + 3600e3; out.filled = (st.bfill || []).length;
      window.RTT_PUTT.close();
      localStorage.setItem(K, rec({ lives:9, back:[], refillAt:null, bank:['life:9', 'life:12', 'life:15'], bfill:['life:9', 'life:12'] }));
      openPutt(); await sleep(1300); out.chip = (document.querySelector('.pt-ov .pp-hbank') || {}).textContent || '';
      const bag = window.RTT_PUTT._state().ov.querySelector('[data-bag]'); if (bag){ bag.click(); await sleep(60); } out.bag = /1 saved/.test((document.querySelector('.pp-bag') || {}).textContent || '');
      const bn = document.querySelector('.pp-bag [data-n]'); if (bn) bn.click();
      window.RTT_PUTT._lose(); for (let i = 0; i < 40 && get().lives !== 9; i++) await sleep(50); await sleep(1100);
      st = get(); out.after = st.lives; out.afterClocks = st.back.length; out.left = (st.bfill || []).length; out.chipGone = !document.querySelector('.pt-ov .pp-hbank');
      window.RTT_PUTT.close(); localStorage.removeItem(K); sbUser = { id:'chk' }; return out; });
    claim(sf.lives === 8 && sf.clocks === 1 && sf.kept && sf.filled === 2, `below the max, spares go straight into the hearts and cancel the clocks due back last (6 and 2 spares: ${JSON.stringify(sf)})`);
    claim(sf.chip === '+1' && sf.bag, `with the hearts full a spare waits, shown as +1 and in the Bag (${JSON.stringify([sf.chip, sf.bag])})`);
    claim(sf.after === 9 && sf.afterClocks === 0 && sf.left === 3 && sf.chipGone, `a life lost with a spare waiting is filled straight away (${JSON.stringify(sf)})`);
    // SIGNED IN, a spare fills a heart on the server (150), keyed by its id: the page takes the server's answer, and a
    // second device holding the same spare is told it was used and given nothing.
    const sv = await pg.evaluate(async () => { const sb0 = sb, calls = [], hr = h => new Date(Date.now() + h * 3600e3).toISOString(), K = 'bag_ppt_v1@ssrv',
        row = { lives:6, back:[hr(1), hr(2), hr(3)], used:[] }, ans = u => ({ data:[{ lives:row.lives, refill_at:row.back[0] || null, max_lives:9, back_at:row.back.slice(), used:u }], error:null });
      sb = { rpc(fn, a){ calls.push(fn + (a && a.p_spare ? ':' + a.p_spare : ''));
        if (fn === 'putt_lives_state') return Promise.resolve(ans());
        if (fn === 'putt_lives_spare'){ const was = row.used.includes(a.p_spare); if (!was && row.lives < 9){ row.used.push(a.p_spare); row.back.pop(); row.lives++; return Promise.resolve(ans(true)); } return Promise.resolve(ans(was)); }
        if (fn === 'ps_save_get') return Promise.resolve({ data:[], error:null });
        if (fn === 'ps_save_put') return Promise.resolve({ data:[{ ok:true }], error:null });
        return Promise.resolve({ data:null, error:{ message:'no' } }); } };
      const dev = async (spares, lives) => { window.RTT_PUTT.close(); localStorage.setItem(K, JSON.stringify({ v:2, l9:1, lives, back:[], lt:Date.now(), bank:spares, tours:{ main:{ lv:3, best:{}, ace:{}, paid:{}, wpaid:{} } } }));
        sbUser = { id:'ssrv' }; openPutt(); for (let t = 0; t < 80 && calls.filter(c => /^putt_lives_spare/.test(c)).length < spares.length; t++) await new Promise(r => setTimeout(r, 50));
        await new Promise(r => setTimeout(r, 200)); return JSON.parse(localStorage.getItem(K)); };
      const a = await dev(['life:9', 'life:12'], 6), srvA = row.lives;
      const b = await dev(['life:9', 'life:12'], 8), srvB = row.lives;
      window.RTT_PUTT.close(); localStorage.removeItem(K); sb = sb0; sbUser = { id:'chk' };
      return { pageA:a.lives, fillA:(a.bfill || []).length, srvA, pageB:b.lives, fillB:(b.bfill || []).length, srvB, sent:calls.filter(c => /^putt_lives_spare/.test(c)) }; });
    claim(sv.srvA === 8 && sv.pageA === 8 && sv.fillA === 2, `signed in, spares fill hearts on the server and the page shows its answer (server ${sv.srvA}, page ${sv.pageA})`);
    claim(sv.srvB === 8 && sv.pageB === 8 && sv.fillB === 2, `a second device holding the same spares gets nothing more (server ${sv.srvB}, page ${sv.pageB}, ${sv.sent.join(' ')})`);
    // A DATABASE WITHOUT 150 cannot fill a heart, so a spare can still be held at nought: the out of lives sheet offers it,
    // it plays a hole, and losing it spends it and not the server's lives. And a built putter is equipped from the Bag.
    const sp = await pg.evaluate(async () => { const out = {}, sleep = ms => new Promise(r => setTimeout(r, ms)), K = 'bag_ppt_v1@spare';
      window.RTT_PUTT.close(); sbUser = { id:'spare' };
      localStorage.setItem(K, JSON.stringify({ v:2, l9:1, lsrv:true, lives:0, back:Array.from({ length:9 }, () => Date.now() + 3600e3), refillAt:Date.now() + 3600e3, lt:Date.now(), bank:['life:9'], pp:{ parts:['scope:0', 'scope:1', 'scope:2', 'bank:0'] }, tours:{ main:{ lv:3, best:{ 1:2, 2:2 }, ace:{}, paid:{}, wpaid:{} } } }));
      openPutt(); await sleep(300);
      window.RTT_PUTT._state().ov.querySelector('[data-lv="3"]').click(); await sleep(150);
      out.sheet = !!document.querySelector('.pp-oolf [data-spare]'); document.querySelector('.pp-oolf [data-spare]').click(); await sleep(200);
      let st = JSON.parse(localStorage.getItem(K)); out.used = st.bused;
      window.RTT_PUTT._state().ov.querySelector('[data-lv="3"]').click(); await sleep(80); const skw = document.querySelector('.pp-skipw [data-skip]'); if (skw) skw.click();
      for (let i = 0; i < 100 && window.RTT_PUTT._state().screen !== 'play'; i++) await sleep(50); out.play = window.RTT_PUTT._state().screen === 'play';
      window.RTT_PUTT._lose(); st = JSON.parse(localStorage.getItem(K)); out.spent = st.bspent; out.lives = st.lives;
      // the built Scope Putter goes into the closet and is equipped, for both games; the Bank Shot (one part) does not
      window.RTT_PUTT.close(); openPutt(); await sleep(200);
      out.owned = !!coinState().owned['pu:scope'] && !coinState().owned['pu:bank']; out.on = puttEquippedId(); out.boost = accBoost().put || 0;
      const cb = window.RTT_PUTT._state().ov.querySelector('[data-closet]'); out.closetBtn = !!cb; if (cb) cb.click(); await sleep(60);
      out.rows = document.querySelectorAll('.pp-bag .pp-bput').length; out.thumbs = document.querySelectorAll('.pp-bag .pp-pth .sthumb').length;
      out.eqBtn = !!document.querySelector('.pp-bag [data-peq="scope"]') && !document.querySelector('.pp-bag [data-peq="bank"]');
      const so = document.querySelector('.pp-bag [data-peq="stock"]'); if (so) so.click(); await sleep(60); out.stock = puttEquippedId(); out.reach = window.RTT_PUTT._state().host.putter();
      const sc = document.querySelector('.pp-bag [data-peq="scope"]'); if (sc) sc.click(); await sleep(60); out.back = puttEquippedId(); out.reach2 = window.RTT_PUTT._state().host.putter();
      out.full = !!document.querySelector('.pp-bag [data-full]');
      window.RTT_PUTT.close(); S.look.putter = 'stock'; sbUser = { id:'chk' }; return out; });
    claim(sp.sheet && sp.used === 1 && sp.play && sp.spent === 1 && sp.lives === 0, `with no server to fill a heart, out of lives a saved spare is offered, plays a hole, and losing it spends it and not the server's lives (${JSON.stringify(sp)})`);
    claim(sp.owned && sp.on === 'scope' && sp.boost >= 2, `a putter built from its three parts goes into the closet, equipped, and adds its Putting boost in the Tour; one part builds nothing (${JSON.stringify([sp.owned, sp.on, sp.boost])})`);
    claim(sp.closetBtn && sp.rows >= 11 && sp.thumbs === sp.rows && sp.eqBtn && sp.stock === 'stock' && sp.reach === 0 && sp.back === 'scope' && sp.reach2 === 2 && sp.full, `the closet opens in Putt Putt: every putter with its picture, equip any owned one, and the full closet one tap away (${JSON.stringify(sp)})`);
    // ---- THE TOUR'S RULES, through the page. Each life is real: a fresh record for a fresh account.
    await pg.evaluate(() => { const st = window.RTT_PUTT._state(); if (st && st.play && st.play.strokes) { st.round.mode = 'x'; } document.querySelector('.pt-ov') && window.RTT_PUTT.close(); sbUser = { id:'chk' }; localStorage.removeItem('bag_ppt_v1@chk'); openPutt(); });
    await pg.waitForSelector('.pp-map [data-lv="1"]');
    claim(await pg.evaluate(() => document.querySelectorAll('.pp-lv').length === 18 && document.querySelectorAll('.pp-lv.lock').length === 17 && document.querySelectorAll('.pp-lv.sig').length === 1 && document.querySelectorAll('.pp-cloudo').length === 10), 'the map shows world 1\'s 18 holes, its signature hole and only level 1 open, with the ten worlds ahead under cloud');
    // A RECORD SAVED SIGNED OUT IS CLAIMED, NEVER LOST. A player reached hole 18 and came back to hole 1, because
    // the record is keyed by account and a session that opened before sign-in resolved played under the bare key.
    const mrg = await pg.evaluate(async () => { window.RTT_PUTT.close(); const best = {}; for (let n = 1; n <= 17; n++) best[n] = 2;
      localStorage.setItem('bag_ppt_v1', JSON.stringify({ v:2, tours:{ main:{ lv:18, best, ace:{}, paid:{}, wpaid:{} } } })); sbUser = { id:'mrg' }; localStorage.removeItem('bag_ppt_v1@mrg'); openPutt();
      for (let t = 0; t < 100 && !document.querySelector('.pp-map [data-lv="1"]'); t++) await new Promise(r => setTimeout(r, 50));
      const open = document.querySelectorAll('.pp-lv:not(.lock)').length, bare = localStorage.getItem('bag_ppt_v1'); window.RTT_PUTT.close();
      sbUser = { id:'chk' }; localStorage.removeItem('bag_ppt_v1@chk'); openPutt(); return { open, bare }; });
    await pg.waitForSelector('.pp-map [data-lv="1"]');
    claim(mrg.open >= 18 && mrg.bare === null, `a signed-in account claims the holes played signed out (${mrg.open} open, bare key ${mrg.bare === null ? 'cleared' : 'left'})`);
    // THE RECORD IS THE ACCOUNT'S. A stand-in server keeps 103's progress rule, and no request leaves the page.
    // A fresh browser for an account the server knows starts at the server's hole with the server's lives.
    const cld = await pg.evaluate(async () => { window.RTT_PUTT.close(); const store = {}, calls = [], sb0 = sb;
      const best = {}; for (let n = 1; n <= 29; n++) best[n] = 3;
      store.tour = { progress:30, payload:{ v:2, lt:Date.now() - 60000, lives:1, refillAt:null, tours:{ main:{ lv:30, best, ace:{}, paid:{}, wpaid:{} } }, daily:{}, rewards:[] } };
      sb = { rpc(fn, a){ calls.push(fn); const cur = store[a.p_slot];
        if (fn === 'ps_save_get') return Promise.resolve({ data:cur ? [{ slot:a.p_slot, progress:cur.progress, payload:cur.payload }] : [], error:null });
        if (fn === 'ps_save_put'){ if (cur && cur.progress > a.p_progress) return Promise.resolve({ data:[{ ok:false, slot:a.p_slot, progress:cur.progress, payload:cur.payload }], error:null });
          store[a.p_slot] = { progress:a.p_progress, payload:JSON.parse(JSON.stringify(a.p_payload)) }; return Promise.resolve({ data:[{ ok:true, slot:a.p_slot, progress:a.p_progress, payload:a.p_payload }], error:null }); }
        return Promise.resolve({ data:null, error:{ message:'no' } }); } };
      sbUser = { id:'cld' }; localStorage.removeItem('bag_ppt_v1@cld'); openPutt();
      for (let t = 0; t < 100 && document.querySelectorAll('.pp-lv:not(.lock)').length < 30; t++) await new Promise(r => setTimeout(r, 50));
      const open = document.querySelectorAll('.pp-lv:not(.lock)').length, local = JSON.parse(localStorage.getItem('bag_ppt_v1@cld') || '{}');
      // a stale copy pushed from another device is refused, merged and sent again, so nothing is lost on either side
      store.tour.payload.tours.main.ace = { 7:1 }; store.tour.progress += 1; window.RTT_PUTT._lose();
      for (let t = 0; t < 60 && !(store.tour.payload.tours.main.lv >= 30 && JSON.parse(localStorage.getItem('bag_ppt_v1@cld')).tours.main.ace[7]); t++) await new Promise(r => setTimeout(r, 50));
      const after = JSON.parse(localStorage.getItem('bag_ppt_v1@cld')), srv = store.tour; window.RTT_PUTT.close(); sb = sb0;
      return { open, lives:local.lives, gets:calls.filter(c => c === 'ps_save_get').length, puts:calls.filter(c => c === 'ps_save_put').length, ace:!!after.tours.main.ace[7], srvLv:srv.payload.tours.main.lv, srvLives:srv.payload.lives }; });
    claim(cld.open >= 30 && cld.lives === 3 && cld.gets >= 1, `a fresh browser takes the account's place and lives from the server, an old record's one life read as a heart of three (${cld.open} open, ${cld.lives} lives)`);
    claim(cld.ace && cld.srvLv >= 30 && cld.puts >= 2 && cld.srvLives === 2, `a save the server refuses is merged with what it holds and sent again (ace kept ${cld.ace}, server at hole ${cld.srvLv} with ${cld.srvLives} lives)`);
    // THE GAME OPENS ON THE TRAIL, AND THE ACCOUNT'S RECORD LANDS AFTER IT. A tester's progress read as reset to
    // level 1: a browser whose copy was behind drew the trail to hole 1 and never looked again once the server's
    // answer arrived. The stand-in answers late on purpose, so the first screen is the stale one.
    const lat = await pg.evaluate(async () => { const sb0 = sb, mf = window.RTT_PUTT_MAPFIRST, best = {}; for (let n = 1; n <= 29; n++) best[n] = 3;
      const payload = { v:2, tours:{ main:{ lv:30, best, ace:{}, paid:{}, wpaid:{} } }, daily:{}, rewards:[] };
      sb = { rpc(fn){ if (fn === 'ps_save_get') return new Promise(r => setTimeout(() => r({ data:[{ slot:'tour', progress:60, payload }], error:null }), 600));
        if (fn === 'ps_save_put') return Promise.resolve({ data:[{ ok:true }], error:null });
        return Promise.resolve({ data:null, error:{ message:'no' } }); } };
      window.RTT_PUTT_MAPFIRST = false; sbUser = { id:'lat' }; localStorage.removeItem('bag_ppt_v1@lat'); openPutt();
      // the hole the trail leads to, read off its own goal line (Hole N), so the claim holds on any version of the page
      const goal = () => { const g = document.querySelector('.pp-tgoal b'), m = g && /Hole (\d+)/.exec(g.textContent); return m ? +m[1] : null; };
      for (let t = 0; t < 40 && goal() == null; t++) await new Promise(r => setTimeout(r, 25));
      const first = goal();
      for (let t = 0; t < 80 && goal() !== 30; t++) await new Promise(r => setTimeout(r, 50));
      const after = goal(), scr = window.RTT_PUTT._state().screen;
      // a browser that refuses every write keeps the session's progress in memory, and still sends it up
      const sent = []; sb = { rpc(fn, a){ if (fn === 'ps_save_put') sent.push(a.p_payload); return Promise.resolve({ data:fn === 'ps_save_put' ? [{ ok:true }] : [], error:null }); } };
      const set0 = Storage.prototype.setItem; Storage.prototype.setItem = function(k, v){ if (/^bag_ppt_v1@lat/.test(k)) throw new Error('QuotaExceededError'); return set0.call(this, k, v); };
      window.RTT_PUTT._lose(); localStorage.removeItem('bag_ppt_v1@lat'); const s1 = window.RTT_PUTT.summary(puttHost()); await new Promise(r => setTimeout(r, 100));
      Storage.prototype.setItem = set0; window.RTT_PUTT.close(); sb = sb0; window.RTT_PUTT_MAPFIRST = mf;
      return { first, after, scr, lv:s1.lv, sentLv:sent.length ? sent[sent.length - 1].tours.main.lv : null }; });
    claim(lat.first === 1 && lat.after === 30 && lat.scr === 'trail', `the trail moves on to the account's hole when its record lands after the first screen (hole ${lat.first}, then ${lat.after})`);
    claim(lat.lv === 30 && lat.sentLv === 30, `a browser that refuses to save keeps the record in memory and still sends it to the account (hole ${lat.lv}, sent ${lat.sentLv})`);
    // LIVES ARE THE SERVER'S (138, 146). A fresh browser takes the server's lives and their clocks, a lost life is
    // spent there, and a device clock wound past them fills nothing: only the server's answer does.
    const lvs = await pg.evaluate(async () => { const sb0 = sb, calls = [], soon = () => new Date(Date.now() + 3600e3).toISOString(),
        row = { lives:0, back:Array.from({ length:9 }, soon) }, ans = () => ({ data:[{ lives:row.lives, refill_at:row.back[0] || null, max_lives:9, back_at:row.back.slice() }], error:null });
      sb = { rpc(fn, a){ calls.push(fn);
        if (fn === 'putt_lives_state') return Promise.resolve(ans());
        if (fn === 'putt_lives_spend'){ if (row.lives > 0){ row.lives--; row.back.push(new Date(Date.now() + 24 * 3600e3).toISOString()); } return Promise.resolve(ans()); }
        if (fn === 'ps_save_get') return Promise.resolve({ data:[], error:null });
        if (fn === 'ps_save_put') return Promise.resolve({ data:[{ ok:true }], error:null });
        return Promise.resolve({ data:null, error:{ message:'no' } }); } };
      sbUser = { id:'lvs' }; localStorage.removeItem('bag_ppt_v1@lvs'); openPutt();
      for (let t = 0; t < 100 && !calls.includes('putt_lives_state'); t++) await new Promise(r => setTimeout(r, 50));
      await new Promise(r => setTimeout(r, 100));
      const k = 'bag_ppt_v1@lvs', a = JSON.parse(localStorage.getItem(k) || '{}');
      a.refillAt = Date.now() - 1000; a.back = (a.back || []).map(() => Date.now() - 1000); localStorage.setItem(k, JSON.stringify(a));
      const wound = window.RTT_PUTT.summary(puttHost()).lives;
      row.lives = 2; row.back = Array.from({ length:7 }, soon); await window.RTT_PUTT.sync(puttHost()); window.RTT_PUTT._lose();
      for (let t = 0; t < 40 && !calls.includes('putt_lives_spend'); t++) await new Promise(r => setTimeout(r, 50));
      await new Promise(r => setTimeout(r, 100));
      const after = JSON.parse(localStorage.getItem(k)); window.RTT_PUTT.close(); sb = sb0;
      return { first:a.lives, wound, spent:calls.includes('putt_lives_spend'), after:after.lives, srv:row.lives, clocks:(after.back || []).length }; });
    claim(lvs.first === 0 && lvs.wound === 0, `a fresh browser takes the server's lives, and a wound clock does not refill them (${lvs.first}, then ${lvs.wound})`);
    claim(lvs.spent && lvs.srv === 1 && lvs.after === 1 && lvs.clocks === 8, `a lost life is spent on the server, with a clock of its own (server ${lvs.srv}, browser ${lvs.after}, ${lvs.clocks} clocks)`);
    // A GUEST WALKS THE OPENING WORLD AND PLAYS NO TOUR HOLE (the owner, 2026-10-16). A hole asks them to sign in,
    // the Daily Hole stays open, and a guest never sees a coin count.
    const gst = await pg.evaluate(async () => {
      localStorage.removeItem('bag_ppt_v1'); sbUser = null; window.RTT_PUTT.open(puttHost());
      for (let t = 0; t < 100 && !document.querySelector('.pp-map [data-lv="1"]'); t++) await new Promise(r => setTimeout(r, 50));
      const S0 = window.RTT_PUTT._state(), pill = !!document.querySelector('.pp-hdr [data-bal]');
      window.RTT_PUTT._level(1, 'main'); const sh = document.querySelector('.pp-sheet'), txt = sh ? sh.innerText : '';
      const walkBtn = !!document.querySelector('.pp-sheet [data-walk]'), notPlayed = S0.screen !== 'play';
      document.querySelector('.pp-sheet [data-n]').click();
      document.querySelector('.pp-map [data-lv="3"]').click(); await new Promise(r => setTimeout(r, 100));
      const tap = S0.screen === 'trail' ? 'trail' : document.querySelector('.pp-sheet [data-walk]') ? 'sheet' : S0.screen;
      window.RTT_PUTT.close(); window.RTT_PUTT.open(puttHost());
      for (let t = 0; t < 100 && !document.querySelector('.pp-map [data-lv="1"]'); t++) await new Promise(r => setTimeout(r, 50));
      const dcb = document.querySelector('[data-daily]'), card = (dcb || {}).innerText || ''; if (dcb) dcb.click(); await new Promise(r => setTimeout(r, 150));
      const S1 = window.RTT_PUTT._state(), daily = S1.screen === 'play' && !!S1.round && !document.querySelector('.pp-sheet [data-in]');
      if (S1.round) window.RTT_PUTT._dailyFinish(3, 3, 30000); const res = S1.ov.innerText;
      window.RTT_PUTT.close(); window.RTT_PUTT.open(puttHost());
      for (let t = 0; t < 100 && !document.querySelector('.pp-map [data-lv="1"]'); t++) await new Promise(r => setTimeout(r, 50));
      window.RTT_PUTT._level(19, 'main'); const deep = !!document.querySelector('.pp-sheet [data-in]') && !document.querySelector('.pp-sheet [data-walk]');
      document.querySelector('.pp-sheet [data-in]').click();
      const toAcct = !document.querySelector('.pt-ov') && S.overlay === 'account' && S.acctMode === 'signin'; S.overlay = null; render();
      localStorage.removeItem('bag_ppt_v1'); localStorage.removeItem('bag_ppt_v1@chk'); sbUser = { id:'chk' }; openPutt();
      return { pill, txt, walkBtn, notPlayed, tap, card, res, daily, deep, toAcct }; });
    await pg.waitForSelector('.pp-map [data-lv="1"]');
    claim(gst.notPlayed && /Sign in to play/.test(gst.txt) && gst.walkBtn, `a guest's hole 1 asks them to sign in and offers to keep walking (${JSON.stringify(gst.txt.slice(0, 60))})`);
    claim(gst.tap === 'trail' || gst.tap === 'sheet', `a guest tapping hole 3 on the map walks to it, never plays it (${gst.tap})`);
    claim(gst.deep && gst.toAcct, `past the opening world the sheet offers no walk, and Sign in opens the sign in sheet (${gst.deep}, ${gst.toAcct})`);
    claim(gst.daily, `a guest can still play the Daily Hole (${gst.daily})`);
    claim(!gst.pill && !/\bcoins?\b|\+\d/i.test(gst.card) && /Sign in to collect your coins/.test(gst.res) && !/\+\d+ coins/.test(gst.res), `a guest sees no coin count: no wallet, the Daily card ${JSON.stringify(gst.card.slice(-30))}, the result says sign in`);
    { const tr = fs.readFileSync(new URL('./trail.js', import.meta.url), 'utf8');
      claim(/if \(!api\.guestCoins\) floatText\('\+' \+ COIN_V/.test(tr) && /if \(!api\.guestCoins\) floatText\('\+' \+ BRK_V/.test(tr) && /api\.guestCoins \? 'Sign in' : '\+' \+ coinsGot/.test(tr),
        'a guest\'s trail floats no +coins and its counter reads Sign in'); }
    // every world painted means every world revealed: a record that has walked through all eleven gates
    await pg.evaluate(() => { window.RTT_PUTT.close(); const K = 'bag_ppt_v1@chk', st = JSON.parse(localStorage.getItem(K)) || { v:2, tours:{} }; st.rv = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(w => 'main:' + w); localStorage.setItem(K, JSON.stringify(st)); openPutt(); });
    await pg.waitForSelector('.pp-map [data-lv="1"]');
    await pg.waitForFunction(() => document.querySelectorAll('.pp-land').length === 11, null, { timeout:15000 }).catch(() => {});
    const land = await pg.evaluate(() => [...document.querySelectorAll('.pp-band')].map(b => { const c = b.querySelector('.pp-land'); if (!c) return null;
      const x = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; const cols = new Set(); for (let i = 0; i < x.length; i += 4 * 37) cols.add(x[i] << 16 | x[i + 1] << 8 | x[i + 2]);
      return { cols:cols.size, exact:Math.abs(c.offsetWidth - c.width * 2) < 1 && Math.abs(c.offsetHeight - c.height * 2) < 1, covers:c.offsetWidth >= b.offsetWidth && c.offsetHeight >= b.offsetHeight }; }));
    // LEVEL 1 SITS CLEAR OF THE TABS AND THE WORLD CHIP. Scrolled to the bottom, the first badge and the
    // label under it must not touch either; a player sent a screenshot of level 1 under the tabs.
    const clash = await pg.evaluate(() => { const m = document.querySelector('.pp-map'); m.scrollTop = m.scrollHeight;
      const r = el => el.getBoundingClientRect(), b = r(document.querySelector('[data-lv="1"]')), lab = document.querySelector('[data-lv="1"] span'), lb = lab ? r(lab) : b;
      const bot = Math.max(b.bottom, lb.bottom), hits = ['.pp-tabs', '.pp-wchip'].filter(q => { const t = r(document.querySelector(q)); return t.height && bot > t.top && b.top < t.bottom && b.right > t.left && b.left < t.right; });
      return hits; });
    claim(clash.length === 0, 'scrolled to the bottom, level 1 clears the tabs and the world chip' + (clash.length ? ': under ' + clash.join(', ') : ''));
    claim(land.every(l => l && l.cols > 60 && l.exact && l.covers), `every world on the map is painted as a landscape of its own, at exactly 2x, covering its band (${land.map(l => l ? l.cols : 'none').join(', ')} colours)`);
    const rec = () => pg.evaluate(() => JSON.parse(localStorage.getItem('bag_ppt_v1@chk') || '{}'));
    // a putt at a power, straight at the cup unless an aim is given (a hole with something in the way is aced round it)
    const putt = async (pow, ang) => { await pg.waitForFunction(() => { const P = window.RTT_PUTT._state().play; return P && P.state === 'aim' && (P.v3 || P.art); }, null, { timeout:60000 });
      await pg.evaluate(([p, a]) => { const P = window.RTT_PUTT._state().play; P.pow = p; P.aimAng = a != null ? a : Math.atan2(P.C.cup[1] - P.ball[1], P.C.cup[0] - P.ball[0]); }, [pow, ang == null ? null : ang]);
      await pg.keyboard.press('Space'); await pg.waitForFunction(() => { const P = window.RTT_PUTT._state().play; return !P || P.state !== 'roll'; }, null, { timeout:30000 }); };
    await pg.click('[data-lv="1"]');
    claim(await pg.evaluate(() => /Hole 1-1 · Par 3 · 3 strokes left/.test(document.querySelector('.pt-hd span').textContent)), 'a Tour hole says how many strokes are left');
    await putt(0.04);
    // EVERY PUTT IS SAVED: the hole in progress is in the record, and opening the game again lands back in it
    const mid = await rec(), cur = mid.cur || {};
    const back = await pg.evaluate(async () => { const b0 = window.RTT_PUTT._state().play.ball.slice(); window.RTT_PUTT.close(); window.RTT_PUTT.open(puttHost());
      const S2 = window.RTT_PUTT._state(), P = S2.play; return { screen:S2.screen, s:P && P.strokes, d:P ? Math.hypot(P.ball[0] - b0[0], P.ball[1] - b0[1]) : 99 }; });
    claim(cur.n === 1 && cur.s === 1 && ((mid.tours.main.tries || {})[1] === 1) && back.screen === 'play' && back.s === 1 && back.d < 0.01,
      `every putt is saved, an attempt is counted, and reopening resumes the hole with the ball where it lay (cur ${JSON.stringify(cur)}, back ${JSON.stringify(back)})`);
    for (let k = 0; k < 2; k++) await putt(0.04);
    await pg.waitForSelector('.pp-pop');
    claim(!(await rec()).cur, 'a finished hole leaves nothing to resume');
    { const r0 = await rec(); claim(/Over par/.test(await pg.textContent('.pp-pop')) && r0.lives === 8 && (r0.back || []).length === 1 && Math.abs(r0.back[0] - Date.now() - 24 * 3600e3) < 120e3, `over par ends the hole the moment par strokes are gone, and takes one of nine lives, back in 24 hours (${r0.lives} left)`); }
    { const hs = await pg.evaluate(() => [...document.querySelectorAll('.pp-pop .pp-lives .pp-h')].map(h => h.getAttribute('title')));
      claim(hs.length === 3 && hs[0] === '3 of 3' && hs[1] === '3 of 3' && hs[2] === '2 of 3', `nine lives are three hearts of three, the last heart emptying from the top (${hs.join(', ')})`); }
    await pg.click('.pp-pop [data-a="again"]');
    const [pw, pa] = await pg.evaluate(() => { const P = window.RTT_PUTT._state().play, C = P.C, a0 = Math.atan2(C.cup[1] - P.ball[1], C.cup[0] - P.ball[0]);
      for (let da = 0; da <= 0.6; da += 0.004) for (const a of [a0 + da, a0 - da]) for (let p = 0.1; p < 1; p += 0.005){ const v = window.RTT_PUTT.speedFor(C, p * 42); if (window.RTT_PUTT.simulate(C, P.ball[0], P.ball[1], Math.cos(a) * v, Math.sin(a) * v, 0).holed) return [p, a]; } return [null, null]; });
    claim(pw != null, 'the first hole can be aced');
    await putt(pw, pa); await pg.waitForSelector('.pp-pop');
    const r1 = await rec();
    const pop1 = await pg.textContent('.pp-pop');
    const t1 = (r1.tours || {}).main || {};
    claim(r1.v === 2 && /HOLE IN ONE/.test(pop1) && t1.lv === 2 && t1.ace && t1.ace[1] && r1.lives === 8, 'under par beats the hole, opens the next, and an ace is marked gold (in the main tour\'s own record)');
    await pg.click('.pp-pop [data-a="again"]');
    await putt(pw, pa); await pg.waitForSelector('.pp-pop');
    claim(/Coins land the first time only/.test(await pg.textContent('.pp-pop')), 'a replay pays nothing');
    // two more over pars, with the record down to its last two lives: the last one goes, every lost life is on its
    // own clock, and the sheet shows the next one back, sells nothing for coins or money, and offers the Tour Pass
    await pg.evaluate(() => { const k = 'bag_ppt_v1@chk', a = JSON.parse(localStorage.getItem(k)); a.lives = 2; a.back = Array.from({ length:7 }, () => Date.now() + 3 * 3600e3); a.lt = Date.now(); localStorage.setItem(k, JSON.stringify(a)); });
    await pg.click('.pp-pop [data-a="next"]'); await pg.waitForFunction(() => { const S = window.RTT_PUTT._state(); return S.screen === 'play' || window.RTT_PUTT._trail(); }, null, { timeout:60000 }); if (await pg.$('.pp-trail [data-skip]')) await pg.click('.pp-trail [data-skip]'); if (await pg.$('.pp-skipw [data-skip]')) await pg.click('.pp-skipw [data-skip]');
    // paid lives are offered every time a life goes, and the hearts open the Lives sheet (the owner, 2026-10-17).
    // PUTT_SHOTS=<dir> saves a picture of each, for a person to look at.
    const livesOn0 = /^var PUTT_LIVES_ENABLED = true;$/m.test(fs.readFileSync(new URL('./putt.js', import.meta.url), 'utf8'));
    for (let t = 0; t < 2; t++){ for (let k = 0; k < 3; k++) await putt(0.03); await pg.waitForSelector('.pp-pop');
      if (t === 0){
        const ob = await pg.$$eval('.pp-pop [data-buy]', (bs) => bs.map((b) => b.getAttribute('data-buy')));
        claim(livesOn0 ? ob.join() === 'nine,three' : ob.length === 0, `over par: the paid lives are offered when a life goes, nine first (${ob.join() || 'none'})`);
        if (process.env.PUTT_SHOTS) await pg.screenshot({ path: process.env.PUTT_SHOTS + '/over-par.png' });
        await pg.click('.pt-ov .pp-hearts'); const ls = await pg.waitForSelector('.pp-livesh', { timeout:5000 }).catch(() => null);
        const lb = ls ? await pg.$$eval('.pp-livesh [data-buy]', (bs) => bs.map((b) => b.getAttribute('data-buy'))) : [];
        claim(!!ls && (livesOn0 ? lb.join() === 'nine,three' : lb.length === 0), `the hearts open the Lives sheet, with the paid lives (${ls ? lb.join() || 'none' : 'no sheet'})`);
        if (process.env.PUTT_SHOTS && ls) await pg.screenshot({ path: process.env.PUTT_SHOTS + '/lives-sheet.png' });
        if (ls) await pg.click('.pp-livesh [data-n]');
        // lives bought over the max are full hearts and a red +N, never more hearts than the max holds. Only an
        // account's lives (the server's, lsrv) go over: a device's own record is redone from its clocks.
        const was = await pg.evaluate(() => { const k = 'bag_ppt_v1@chk', a = JSON.parse(localStorage.getItem(k)), w = { lives: a.lives, lsrv: a.lsrv, back: a.back }; a.lives = window.RTT_PUTT.LIVES_MAX() + 5; a.back = []; a.lsrv = true; localStorage.setItem(k, JSON.stringify(a)); return w; });
        await pg.click('.pt-ov .pp-hearts'); await pg.waitForSelector('.pp-livesh');
        const ov5 = await pg.evaluate(() => ({ more: (document.querySelector('.pp-livesh .pp-hmore') || {}).textContent, hearts: document.querySelectorAll('.pp-livesh .pp-lives .pp-h').length,
          full: document.querySelectorAll('.pp-livesh .pp-lives .pp-h.on').length, max: window.RTT_PUTT.LIVES_MAX() }));
        claim(ov5.more === '+5' && ov5.hearts === ov5.max / 3 && ov5.full === ov5.hearts, `five over the max: full hearts and a red +5 (${JSON.stringify(ov5)})`);
        if (process.env.PUTT_SHOTS) await pg.screenshot({ path: process.env.PUTT_SHOTS + '/over-max.png' });
        await pg.click('.pp-livesh [data-n]');
        await pg.evaluate((w) => { const k = 'bag_ppt_v1@chk', a = JSON.parse(localStorage.getItem(k)); a.lives = w.lives; a.back = w.back; if (w.lsrv) a.lsrv = w.lsrv; else delete a.lsrv; localStorage.setItem(k, JSON.stringify(a)); }, was);
      }
      await pg.click('.pp-pop [data-a="again"]'); }
    await pg.waitForSelector('.pp-sheet');
    const r2 = await rec();
    // the only money on the sheet is the paid lives (the owner, 2026-10-17): nine then three, at LIVES_BUY's prices,
    // and only while PUTT_LIVES_ENABLED is on. Everything else on it is still free: no coin price, no other price.
    { const tx = await pg.textContent('.pp-sheet'), last = Math.max.apply(null, r2.back || [0]);
      const buys = await pg.$$eval('.pp-sheet [data-buy]', (bs) => bs.map((b) => b.textContent));
      const livesOn = /^var PUTT_LIVES_ENABLED = true;$/m.test(fs.readFileSync(new URL('./putt.js', import.meta.url), 'utf8'));
      const want = livesOn ? await pg.evaluate(() => (window.RTT_PUTT.LIVES_BUY || []).map((p) => window.RTT_PUTT.buyLabel(p))) : [];
      const rest = buys.reduce((t, b) => t.replace(b, ''), tx);
      claim(r2.lives === 0 && (r2.back || []).length === 9 && Math.abs(last - Date.now() - 24 * 3600e3) < 120e3 && Math.abs(r2.refillAt - Date.now() - 3 * 3600e3) < 120e3
        && /Next life in/.test(tx) && !/\$|coin/i.test(rest) && !!(await pg.$('.pp-sheet [data-pass]')),
        `out of lives: each life on its own clock, the next one back shown, no price in coins or money but the paid lives, and the Tour Pass on offer (${(r2.back || []).length} clocks)`);
      claim(buys.length === want.length && (!livesOn || want.length === 2) && buys.every((b, i) => b.indexOf(want[i]) === 0),
        `out of lives: the paid lives, when on, are nine then three at the catalog's prices (${buys.map((b) => b.split('·')[1]).join(', ') || 'off'})`); }
    await pg.click('.pp-sheet [data-free]'); await pg.waitForSelector('.pp-map');
    claim((await rec()).lives === 9, 'a tester can refill for free');
    // EVERYBODY CAN WALK HALLOWS NIGHT, AND PLAYING IT IS THE PASS'S: without a pass the Members tab opens the
    // Members world (here, the map: this section runs map first), and walking up to a hole opens a sheet that
    // sells nothing for coins and sends the player to the free tour
    await pg.click('.pp-tabs [data-tab="members"]'); await pg.waitForSelector('.pp-mem .pp-map [data-lv="1"]');
    claim(await pg.evaluate(() => document.querySelectorAll('.pp-lv').length === 9 && document.querySelectorAll('.pp-lv.sig').length === 1 && document.querySelectorAll('.pp-cloudo').length === 1 && !/Harvest Moon/.test(document.querySelector('.pp-map').innerText)), 'without a pass the Members tab still shows Hallows Night: its nine holes and their signature hole, and the second world under cloud, unnamed');
    await pg.click('.pp-mem .pp-map [data-lv="1"]'); await pg.waitForSelector('.pp-memsh');
    const ms = await pg.textContent('.pp-memsh');
    claim(/Members only/.test(await pg.evaluate(() => JSON.stringify(window.RTT_PUTT.PAY.members))) && /Get Tour Pass/.test(ms) && !/\d+ coins? to (buy|unlock)/i.test(ms) && /Putt Putt Tour is free/.test(ms) && !!(await pg.$('.pp-memsh [data-main]')) && await pg.evaluate(() => window.RTT_PUTT._state().screen !== 'play'), 'a hole on Hallows Night without a pass opens a sheet about the Tour Pass that also offers the free tour, and the hole does not start');
    await pg.click('.pp-memsh [data-main]'); await pg.waitForSelector('.pp-map [data-lv="90"]');
    await pg.keyboard.press('Escape'); await pg.keyboard.press('Escape');
    claim(await pg.evaluate(() => !document.querySelector('.pt-ov') && document.body.style.overflow !== 'hidden'), 'Escape twice closes it and gives the page its scroll back');
    // ---- THE 3D HOLE (hole3d.js, land.js): every themed hole, its picture and its projection
    const v3 = await pg.evaluate(() => { const P = window.RTT_PUTT, D3 = window.RTT_PUTT_3D, out = { n:0, magenta:[], off:[], ms:[], land:[], sliceDiff:null };
      if (!D3) return null;
      const ramp = h => window.PXHD.ramp(h);
      const all = []; for (const th of P.CAL_THEMES) P.themedCourse(th).forEach((d, i) => all.push([th, d, i]));
      for (const tid of ['main', 'members']) for (let n = 1; n <= P.TOURS[tid].levels.length; n++) all.push([tid + n, P.tourDesc(n, null, tid), 0]);
      all.forEach(([th, d, i]) => {
        const C = P.buildFrom(d), t0 = performance.now(), R = D3.render(C, { aspect:2 }); out.ms.push(performance.now() - t0); out.n++;
        const cx = R.cv.getContext('2d'), W = R.cv.width, H = R.cv.height, px = cx.getImageData(0, 0, W, H).data;
        let mg = 0; for (let k = 0; k < px.length; k += 4) if (px[k] === 255 && px[k + 1] === 0 && px[k + 2] === 255) mg++;
        if (mg) out.magenta.push(th + ' ' + (i + 1) + ': ' + mg);
        // a point on open carpet, projected, lands on carpet in the picture
        const ok = new Set(ramp(C.T.carpet).concat(ramp(C.T.carpet2))), hex = (r, g, b) => '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
        const clear = (x, y) => (C.bumpers || []).every(u => Math.hypot(u.x - x, u.y - y) > u.r + 1.4) && (C.blocks || []).every(r => x < r.x0 - 1.2 || x > r.x1 + 1.2 || y < r.y0 - 3 - Math.max(0, -R.zAt(x, y)) * 1.4 || y > r.y1 + 3)
          && (C.movers || []).every(m => m.k !== 'spin' || Math.hypot(m.x - x, m.y - y) > m.len + 1) && (C.portals || []).every(p => Math.hypot(p.ax - x, p.ay - y) > 2 && Math.hypot(p.bx - x, p.by - y) > 2.5)
          && (!C.mill || (Math.hypot(C.mill.x - x, C.mill.y - y) > 7 && !(Math.abs(C.mill.x - x) < 3 && y < C.mill.y && y > C.mill.y - 11)))
          // a ramp's lip and kicker stand up off the carpet, a loop stands over its chute, and a river is drawn
          // with its banks: what is behind them in the picture is the set piece, not carpet
          && (C.ramps || []).every(R => { const u = (x - R.x) * R.dx + (y - R.y) * R.dy, v = -(x - R.x) * R.dy + (y - R.y) * R.dx; return u < -(R.len || 1.8) - 2.5 || u > 1 || Math.abs(v) > R.w / 2 + 1; })
          && (C.loops || []).every(L => Math.hypot(L.x - x, L.y - y) > L.r + 3)
          && (C.rivers || []).every(rv => (rv.pts || rv.path || []).every((q, k, A) => { if (!k) return true; const a = A[k - 1], dx = q[0] - a[0], dy = q[1] - a[1], l2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / l2)); return Math.hypot(x - a[0] - dx * t, y - a[1] - dy * t) > (rv.w || 1.8) / 2 + 1.6; }));   // the tower stands 7 ft tall, so it covers the carpet behind it in the picture
        let tried = 0, bad = 0; globalThis.__badAt = null;
        for (let y = C.bounds[1]; y < C.bounds[3]; y += 1.7) for (let x = C.bounds[0]; x < C.bounds[2]; x += 1.3){
          if (C.mats.at(x, y) !== P.M.GREEN || !clear(x, y)) continue; let edge = false; for (const [dx, dy] of [[0.9, 0], [-0.9, 0], [0, 0.9], [0, -0.9], [0, -1.4]]) if (C.mats.at(x + dx, y + dy) !== P.M.GREEN) edge = true; if (edge) continue;
          // the far rail stands on the plinth, so its front face covers a little more of the strip in front of it
          // the near rail stands between the camera and the strip just behind it, and a belt is drawn as a belt
          // and a sunken room's near wall is taller by the drop, so it hides more
          const drop = Math.max(0, -R.zAt(x, y)); if (C.mats.at(x, y + 2.2) !== P.M.GREEN || C.mats.at(x, y + 2.2 + drop * 1.4) !== P.M.GREEN || (C.belts || []).some(z => x > z.x0 - 0.9 && x < z.x1 + 0.9 && y > z.y0 - 0.9 && y < z.y1 + 0.9)) continue;
          const q = R.pr(x, y, R.zAt(x, y)), i2 = (Math.floor(q[1]) * W + Math.floor(q[0])) * 4; tried++; if (!ok.has(hex(px[i2], px[i2 + 1], px[i2 + 2]))){ bad++; (globalThis.__badAt = globalThis.__badAt || []).push(x.toFixed(1) + ',' + y.toFixed(1)); } }
        if (!tried || bad > tried * 0.04) out.off.push(th + ' ' + (i + 1) + ': ' + bad + ' of ' + tried + (globalThis.__badAt ? ' at ' + globalThis.__badAt.join(' ') : ''));
        // the land round it is built, not bare: a good share of the picture outside the course is something other than the plain ground
        if (i === 0) out.land.push(th);
      });
      // the same hole, rendered a few milliseconds at a time, is the same picture
      const C = P.buildFrom(P.themedCourse('haunted')[3]), a = D3.render(C, { aspect:2 }), step = D3.slices(P.buildFrom(P.themedCourse('haunted')[3]), { aspect:2 });
      let r = null, n = 0; while (!(r = step(2))) n++;
      const A = a.cv.getContext('2d').getImageData(0, 0, a.cv.width, a.cv.height).data, Bv = r.cv.getContext('2d').getImageData(0, 0, r.cv.width, r.cv.height).data;
      let diff = a.cv.width === r.cv.width && a.cv.height === r.cv.height ? 0 : -1; if (!diff) for (let k = 0; k < A.length; k++) if (A[k] !== Bv[k]) diff++;
      out.sliceDiff = diff; out.slices = n;
      // the console look (on by default) is the same picture sliced or in one go, and costs little more
      { const fa = D3.render(P.buildFrom(P.themedCourse('haunted')[3]), { aspect:2, fx:true }), fs = D3.slices(P.buildFrom(P.themedCourse('haunted')[3]), { aspect:2, fx:true }); let fr = null; while (!(fr = fs(2))); 
        const FA = fa.cv.getContext('2d').getImageData(0, 0, fa.cv.width, fa.cv.height).data, FB = fr.cv.getContext('2d').getImageData(0, 0, fr.cv.width, fr.cv.height).data;
        let fd = fa.cv.width === fr.cv.width && fa.cv.height === fr.cv.height ? 0 : -1; if (!fd) for (let k = 0; k < FA.length; k++) if (FA[k] !== FB[k]) fd++;
        out.fxDiff = fd; out.fxSky = !!(fa.sky && fa.bg); const fms = [];
        for (let n2 = 1; n2 <= 198; n2 += 18){ const t1 = performance.now(); D3.render(P.buildFrom(P.tourDesc(n2, null, 'main')), { aspect:2, fx:true }); fms.push(performance.now() - t1); }
        fms.sort((x, y) => x - y); out.fxMed = Math.round(fms[fms.length >> 1]); }
      out.ms.sort((x, y) => x - y); out.med = Math.round(out.ms[out.ms.length >> 1]); out.max = Math.round(out.ms[out.ms.length - 1]);
      return out; });
    claim(!!v3, 'the 3D hole module loaded');
    if (v3){
      claim(v3.n === 72 + 198 + 18 && v3.magenta.length === 0, `all ${v3.n} themed and Tour holes draw in 3D with no unknown material` + (v3.magenta.length ? ': ' + v3.magenta.slice(0, 4).join('; ') : ''));
      claim(v3.off.length === 0, 'the projection puts open carpet on carpet in every picture, so the ball rolls on what is drawn' + (v3.off.length ? ': ' + v3.off.slice(0, 4).join('; ') : ''));
      claim(v3.sliceDiff === 0 && v3.slices > 20, `rendered a little at a time (${v3.slices} steps) it is the same picture, pixel for pixel` + (v3.sliceDiff ? ': ' + v3.sliceDiff + ' differ' : ''));
      claim(v3.med < 600, `a hole renders in ${v3.med}ms at the median (${v3.max}ms the slowest), on this machine`);
      claim(v3.fxDiff === 0 && v3.fxSky, 'the console look is the same picture sliced or in one go, and hands back its sky and stage colour' + (v3.fxDiff ? ': ' + v3.fxDiff + ' differ' : ''));
      claim(v3.fxMed < 900, `with the console look a Tour hole renders in ${v3.fxMed}ms at the median, on this machine`);
    }
    // a hole in 3D, through the game; and a render that throws draws the hole flat rather than nothing
    await pg.evaluate(() => { if (!document.querySelector('.pt-ov')) openPutt(); window.RTT_PUTT._level(23); });
    await pg.waitForFunction(() => { const P = window.RTT_PUTT._state().play; return P && (P.v3 || P.art); }, null, { timeout:60000 });
    claim(await pg.evaluate(() => !!window.RTT_PUTT._state().play.v3), 'a Tour hole plays in 3D');
    await pg.setViewportSize({ width:1280, height:760 }); await pg.waitForTimeout(2600);
    const land3 = await pg.evaluate(() => { const S = window.RTT_PUTT._state(), c = S.play.camNow || {}; return { wide:S.cv.width > S.cv.height, follow:!!c.follow }; });
    claim(land3.wide && !land3.follow, `a landscape screen keeps the whole hole in view (${JSON.stringify(land3)})`);
    // the top right says what each star costs, and every row is true by the stars rule itself
    const tgt = await pg.evaluate(() => { const T = window.RTT_PUTT, S = T._state(), L = T.tourOf('main').levels[S.round.lv - 1], par = S.play.C.par;
      const rows = [...document.querySelectorAll('.pt-stars div')].map(d => [d.querySelector('i').textContent.length, +d.querySelector('b').textContent]);
      return { par, rows, ok:rows.length >= 2 && rows.every(r => T.starsOf(r[1], par, L.three) === r[0]) && rows[rows.length - 1][1] === par && rows[0][0] === 3 }; });
    claim(tgt.ok, `a Tour hole shows the strokes each star costs, and each row matches the stars rule (${JSON.stringify(tgt)})`);
    await pg.setViewportSize({ width:390, height:844 }); await pg.waitForTimeout(300);
    await pg.evaluate(() => { const D3 = window.RTT_PUTT_3D; window.__keep = D3.render; D3.render = () => { throw new Error('probe'); }; window.RTT_PUTT._state().v3c = {}; window.RTT_PUTT._state().v3job = null; window.RTT_PUTT._level(34); });
    await pg.waitForFunction(() => { const P = window.RTT_PUTT._state().play; return P && (P.v3 || P.art); }, null, { timeout:60000 });
    claim(await pg.evaluate(() => { const P = window.RTT_PUTT._state().play; return !P.v3 && !!P.art; }), 'a 3D render that throws falls back to the flat hole');
    await pg.evaluate(() => { window.RTT_PUTT_3D.render = window.__keep; });
    /* ACHIEVEMENTS IN THE TROPHY ROOM. Putt Putt hands the page its own list, built from its worlds, so a new world
       brings its set with it; they are read off the record, so a player has what they already did; the Rep ranks sit
       on fixed points, so adding achievements never drops anybody a rank; G.O.A.T. is the Pro Tour's own; and the
       tour keeps growing, so nothing says "every world" (owner, 2026-10-15). */
    const ac = await pg.evaluate(() => { const T = window.RTT_PUTT, r = {}, keepU = sbUser, keepN = sbUsername, keepOn = puttOn;
      sbUser = { id:'achk' }; sbUsername = 'achk'; puttOn = () => true;
      r.tiers = REP_TIERS.map(t => t.at).join(',');
      const best = {}, ace = {}; for (let n = 1; n <= 18; n++) best[n] = 1; ace[1] = 1;
      localStorage.setItem(acctKey('bag_ppt_v1'), JSON.stringify({ v:2, tours:{ main:{ lv:19, best, ace, paid:{}, wpaid:{} } } }));
      const fresh = evaluateAch().map(a => a.id), defs = T.achDefs(), worlds = Math.ceil(T.summary(puttHost()).levels / 18);
      r.perWorld = defs.filter(d => /^pp_wc_/.test(d.id)).length === worlds && defs.filter(d => /^pp_wp_/.test(d.id)).length === worlds;
      r.retro = ['pp_holes_10', 'pp_worlds_1', 'pp_perfect_1', 'pp_aces_1', 'pp_wc_clubhouse', 'pp_wp_clubhouse'].every(id => fresh.indexOf(id) >= 0);
      r.notYet = fresh.indexOf('pp_wc_school') < 0 && fresh.indexOf('pp_holes_25') < 0;
      r.inRoom = ACH.filter(a => a.pp).length === defs.length + ACH_TWO_TOURS.length && ACH_BY_CAT.some(c => c.cat === 'Putt Putt Worlds');
      r.goat = ACH_TOUR_TOTAL === ACH.filter(a => !a.pp).length && achTourCount() <= ACH_TOUR_TOTAL;
      r.words = ACH.filter(a => a.pp && (/every world|all (the )?worlds/i.test(a.name + ' ' + a.desc) || [...a.name + a.desc].some(c => c.charCodeAt(0) === 8211 || c.charCodeAt(0) === 8212))).map(a => a.id);   // the two dashes, by code
      localStorage.removeItem(acctKey('bag_ach')); localStorage.removeItem(acctKey('bag_ppt_v1')); sbUser = keepU; sbUsername = keepN; puttOn = keepOn;
      return r; });
    claim(ac.tiers === '0,391,978,1760,2737,3910,5279,6843,8602,10557,12903,15640,18377,21505,24633,28152,31671,35190,37732', `the Tour Rep ranks sit on fixed points, where they were before Putt Putt's achievements (${ac.tiers})`);
    claim(ac.perWorld && ac.inRoom, 'each Putt Putt world brings its own achievements, and they and the Two Tours ones are in the Trophy Room');
    claim(ac.retro && ac.notYet, 'Putt Putt achievements are read off the record: a cleared, perfect world unlocks its own at once, and only those');
    claim(ac.goat, 'G.O.A.T. counts the Pro Tour achievements alone, so a new Putt Putt world never moves it');
    claim(ac.words.length === 0, 'no Putt Putt achievement says "every world" or carries a dash' + (ac.words.length ? ': ' + ac.words.join(', ') : ''));
    /* ONE PROGRESSION. With Putt Putt the day's quests carry its Daily Hole and the week's challenges a Putt Putt slot,
       and what is played here feeds them and the one play streak; without it nothing changes. A guest's coins are held
       on the browser and paid once at sign-in, not dropped. */
    const pg2 = await pg.evaluate(() => { const r = {}, keepU = sbUser, keepN = sbUsername, keepOn = puttOn;
      try{ localStorage.removeItem('bag_coins_held'); }catch(e){}
      sbUser = null; puttOn = () => true; const H = puttHost(); H.coins(60, 'chk'); r.held = heldGuestCoins();
      sbUser = { id:'pchk' }; sbUsername = 'pchk'; const b0 = coinBalance(); flushHeldCoins(); r.gain = coinBalance() - b0; r.once = flushHeldCoins() === 0 && heldGuestCoins() === 0;
      r.quest = dailyQuestDefs().some(d => d.k === 'putt'); const pp = weeklySet().filter(c => c.mode === 'putt'); r.slot = pp.length === 1 && weeklySet().length === 4;
      H.quest(pp[0].metric, pp[0].target); r.week = !!weekChal().done[pp[0].id]; H.questDaily(); r.dq = !!dailyQuests().putt;
      H.dayPlayed(); r.streak = (LS.get(acctKey('bag_streak'), {}) || {}).last === todayKey();
      puttOn = () => false; r.off = dailyQuestDefs().length === 4 && weeklySet().length === 4;
      sbUser = keepU; sbUsername = keepN; puttOn = keepOn; return r; });
    claim(pg2.held === 60 && pg2.gain === 60 && pg2.once, `a guest's Putt Putt coins are held and paid once at sign-in (${JSON.stringify(pg2)})`);
    claim(pg2.quest && pg2.slot && pg2.week && pg2.dq && pg2.streak, 'with Putt Putt the daily quests carry its Daily Hole, the week\'s fourth challenge is Putt Putt\'s (still four, the same payouts), and both count, as does the play streak');
    claim(pg2.off, 'without Putt Putt the daily quests and weekly challenges are as they were');
    /* THE DAILY HOLE BOARD (148_putt_daily_board.sql). A round played on its day posts once with the golfer's look,
       a late one never does, the card draws the day's rows with the player's own marked, and a server without the
       board yet says so instead of breaking. */
    const db = await pg.evaluate(async () => { const keepSb = sb, keepU = sbUser, keepOn = puttOn, calls = []; let mode = 'rows';
      sb = { rpc:(fn, args) => { calls.push([fn, args]); if (mode === 'down') return Promise.resolve({ error:{ message:'no such function' } });
        return Promise.resolve({ data: fn === 'putt_daily_board' ? [{ rank:1, username:'one', strokes:1, par:3, ms:5000, look:null, mine:false, players:2 }, { rank:2, username:'me', strokes:2, par:3, ms:9000, look:null, mine:true, players:2 }] : true }); } };
      sbUser = { id:'dchk' }; puttOn = () => true; const T = window.RTT_PUTT, S = T._state(), k = String(todayKey()), day = /^\d{8}$/.test(k) ? k.slice(0, 4) + '-' + k.slice(4, 6) + '-' + k.slice(6, 8) : k;
      const clear = () => Object.keys(localStorage).filter(x => x.indexOf('bag_ppt_v1') === 0).forEach(k0 => { const s0 = JSON.parse(localStorage.getItem(k0)); s0.daily = {}; localStorage.setItem(k0, JSON.stringify(s0)); });
      const r = {}; clear(); S.round = { mode:'pdaily', day:day }; T._dailyFinish(2, 3, 9000); await new Promise(x => setTimeout(x, 300));
      const sub = calls.filter(c => c[0] === 'putt_daily_submit'); r.posted = sub.length === 1 && sub[0][1].p_day === day && sub[0][1].p_strokes === 2 && !!sub[0][1].p_look;
      r.rows = S.ov.querySelectorAll('.pp-drow').length === 2 && !!S.ov.querySelector('.pp-drow.me');
      clear(); calls.length = 0; const y = new Date(Date.parse(day + 'T12:00:00Z') - 86400000).toISOString().slice(0, 10); S.round = { mode:'pdaily', day:y }; T._dailyFinish(2, 3, 9000); await new Promise(x => setTimeout(x, 300));
      r.lateQuiet = !calls.some(c => c[0] === 'putt_daily_submit');
      clear(); mode = 'down'; S.round = { mode:'pdaily', day:day }; T._dailyFinish(2, 3, 9000); await new Promise(x => setTimeout(x, 300));
      r.down = /on its way/.test((S.ov.querySelector('[data-rows]') || {}).textContent || '');
      clear(); sb = keepSb; sbUser = keepU; puttOn = keepOn; return r; });
    claim(db.posted && db.rows, `a Daily Hole played on its day posts to the board once, with the golfer's look, and the card shows the day's rows (${JSON.stringify(db)})`);
    claim(db.lateQuiet, 'a Daily Hole played late from the calendar never posts');
    claim(db.down, 'a server without the board yet says it is on its way, and nothing breaks');
    // THE LOCKED GATE IS PART OF ITS FENCE: built to the gap and drawn at the land's size on a smoothed walk (it once stood at half)
    await pg.evaluate(async () => { window.RTT_PUTT.close(); openPutt(); await new Promise(r => setTimeout(r, 300)); window.RTT_PUTT._walkTo(65); });
    await pg.waitForFunction(() => window.RTT_PUTT._trail && window.RTT_PUTT._trail() && window.RTT_PUTT._trail().plan(), null, { timeout:120000 });
    const lk = await pg.evaluate(() => window.RTT_PUTT._trail().lockFt());
    claim(!!lk && Math.abs(lk.ft / lk.box - 1) < 0.2, `the locked gate is drawn at its real size, as wide as its fence's gap (${JSON.stringify(lk)})`);
    await pg.evaluate(() => { window.RTT_PUTT.close(); });
    // the celebration: a putt that drops is a cheer before the card, an ace a longer one, and the stock ball is white
    await pg.evaluate(() => { if (!document.querySelector('.pt-ov')) openPutt(); window.RTT_PUTT._level(1); });
    await pg.waitForFunction(() => { const P = window.RTT_PUTT._state().play; return P && P.state === 'aim'; }, null, { timeout:120000 });
    const ch = await pg.evaluate(() => new Promise(res => { const S = window.RTT_PUTT._state(); window.RTT_PUTT._putt(4.34586983746588, 37); let c0 = null, saw = false;
      const tick = () => { const st = S.play && S.play.state; if (st === 'cheer'){ saw = true; if (c0 == null) c0 = performance.now(); }
        if (c0 != null && (S.screen !== 'play' || st === 'done')) return res({ saw, ms:Math.round(performance.now() - c0), sunk:!!S.play.sunk }); requestAnimationFrame(tick); }; requestAnimationFrame(tick); }));
    claim(ch.saw && ch.ms >= 1800 && ch.ms < 4000, `a hole in one is celebrated for about two seconds before the card (${JSON.stringify(ch)})`);
    claim(ch.sunk === true, 'a ball that dropped stays gone: it is never drawn back on the cup behind the card');
    claim(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
    await b.close(); srv.close();
  }
}
console.log(fails ? `\n${fails} FAILED` : '\nall good');
process.exit(fails ? 1 : 0);
