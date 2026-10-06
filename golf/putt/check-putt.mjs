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
  const solid = (x, y) => C.blocks.some(r => x > r.x0 - 0.1 && x < r.x1 + 0.1 && y > r.y0 - 0.1 && y < r.y1 + 0.1) || C.bumpers.some(u => Math.hypot(x - u.x, y - u.y) < u.r + 0.1);
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
  const TM = P.TOURS.main, TB = P.TOURS.members, Cn = P.PAY;
  claim(TM.levels.length === 90 && TM.worlds.length === 5 && TM.per === 18, `the main tour is 90 holes in ${TM.worlds.length} worlds of ${TM.per}`);
  claim(TB.levels.length === 18 && TB.worlds.length === 2 && TB.per === 9 && TB.members, `the Members Tour is 18 holes in ${TB.worlds.length} worlds of ${TB.per}`);
  claim(TM.worlds.every(W => P.CAL_THEMES.indexOf(W.theme) < 0), 'the main tour wears none of the calendar themes, which belong to the passes (' + TM.worlds.map(W => W.theme).join(', ') + ')');
  for (const TR of [TM, TB]){
    claim(TR.levels.every((L, i) => !!L.sig === ((i + 1) % TR.per === 0)), `${TR.name}: the last hole of each world, and only it, is a signature hole`);
    claim(TR.levels.every((L, i) => i === 0 || L.par >= 3), `${TR.name}: no par under 3`);
    const shapes = new Set(), secrets = {}, wet = [];
    for (let n = 1; n <= TR.levels.length; n++){ const L = TR.levels[n - 1], C = P.buildLevel(n, TR.id), name = `${TR.id} ${n} ${P.levelName(n, TR.id)}`;
      shapes.add(JSON.stringify((C.polys || [C.poly]).map(q => q.map(p => p.map(v => Math.round(v * 2))))) + C.cup.join() + C.bumpers.length + C.blocks.length + C.movers.length + C.zones.length + C.portals.length + C.loops.length + C.ramps.length);
      // EVERY HOLE HAS SOMETHING IN IT: an obstacle, a puzzle or a moving part, never bare carpet
      const kit = C.bumpers.length + C.blocks.length + C.movers.length + C.portals.length + C.loops.length + C.ramps.length + C.bridges.length + C.turns.length + (C.belts || []).length + (C.mill ? 1 : 0) + C.zones.length;
      claim(kit > 0, `${name}: has an obstacle`);
      claim(C.mats.at(C.tee[0], C.tee[1]) === M.GREEN && C.mats.at(C.cup[0], C.cup[1]) === M.GREEN, `${name}: tee and cup on the carpet`);
      /* THE OBVIOUS ROUTE never goes through the hole's secret, and it is a birdie: par is that route
         plus one. A hole with a secret also carries the secret route, which has to be strictly shorter
         and has to use it, so the hole that rewards looking harder really does pay in strokes. */
      const line = ROUTES[TR.id + ':' + n], why = line ? replayRoute(C, line, 'obvious') : 'no route recorded';
      claim(!why && (line.length === L.par - 1 || (L.par === 3 && line.length === 1)), `${name}: the obvious route is a birdie: ${line ? line.length : '?'} putts against par ${L.par}, with room for error` + (why ? ': ' + why : ''));
      if ((C.secret || []).length){ secrets[n] = 1; const sl = ROUTES[TR.id + ':' + n + ':sc'], sw = sl ? replayRoute(C, sl, 'secret') : 'no secret route recorded';
        claim(!sw && line && sl.length < line.length, `${name}: the secret line is shorter: ${sl ? sl.length : '?'} putts against ${line ? line.length : '?'}` + (sw ? ': ' + sw : '')); }
      // A PERSON IS A COUPLE OF DEGREES OFF. No putt on the obvious route may put that person in the water or off the course more than a third of the time
      if (line && !why){ const hz = hazardRates(C, line, 80), worst = Math.max(...hz); wet.push(worst); claim(worst <= 0.34, `${name}: a slightly off putt on the obvious route stays dry (${hz.map(h => Math.round(h * 100) + '%').join(' ')})`); } }
    claim(TR.worlds.every((W, w) => { let k = 0; for (let n = w * TR.per + 1; n <= (w + 1) * TR.per; n++) k += secrets[n] || 0; return k * 3 >= TR.per; }), `${TR.name}: at least a third of every world's holes hide a secret line (${Object.keys(secrets).length} in all)`);
    const wm = wet.reduce((a, b) => a + b, 0) / Math.max(1, wet.length);
    claim(wm <= 0.1, `${TR.name}: on average the worst putt of a hole goes wet or out ${Math.round(wm * 100)}% of the time for a slightly off player`);
    claim(shapes.size === TR.levels.length, `${TR.name}: no two holes share a layout (${shapes.size} distinct)`);
    // HARDER AS IT GOES: each world packs more into a hole than the one before, and asks for more putts
    const per = (fn) => TR.worlds.map((W, w) => { let t = 0; for (let n = w * TR.per + 1; n <= (w + 1) * TR.per; n++) t += fn(n); return t / TR.per; });
    const kitAvg = per(n => { const C = P.buildLevel(n, TR.id); return C.bumpers.length + C.blocks.length + C.movers.length + C.portals.length + C.loops.length + C.ramps.length + C.bridges.length + C.turns.length + (C.belts || []).length + (C.mill ? 1 : 0) + C.zones.length; });
    const parAvg = per(n => TR.levels[n - 1].par);
    claim(kitAvg.every((a, w) => !w || a > kitAvg[w - 1]), `${TR.name}: more set pieces a hole world by world (${kitAvg.map(a => a.toFixed(2)).join(', ')})`);
    claim(parAvg[parAvg.length - 1] > parAvg[0], `${TR.name}: the last world asks for more putts than the first (par ${parAvg.map(a => a.toFixed(2)).join(', ')})`);
  }
  const mw = TM.levels.filter(L => !L.sig).length / 5 * Cn.main.hole + Cn.main.sig + TM.per * Cn.main.ace + Cn.main.world;
  claim(mw * 5 === 20000, `the main tour pays exactly 20,000 coins (${mw} a world)`);
  claim(Cn.members.exclusive && Cn.members.hole > Cn.main.hole && Cn.members.sig > Cn.main.sig && /Members only/.test(Cn.members.finish), 'the Members Tour pays more a hole and carries rewards only members can earn');
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
    await pg.evaluate(() => { sbUsername = 'CSel8'; });
    claim(await pg.evaluate(() => puttOn() && homeModeList().some(m => m.id === 'putt')), 'signed in as a tester: the door is there');
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
    const box = await pg.locator('.pt-stage canvas').boundingBox();
    const before = await pg.evaluate(() => window.RTT_PUTT._state().play.ball.slice());
    await pg.mouse.move(box.x + box.width / 2, box.y + box.height * 0.5); await pg.mouse.down();
    await pg.mouse.move(box.x + box.width / 2, box.y + box.height * 0.5 + 120, { steps:6 }); await pg.mouse.up();
    await pg.waitForFunction(() => { const P = window.RTT_PUTT._state().play; return P.state !== 'roll' && P.strokes >= 1; }, null, { timeout:30000 });
    const after = await pg.evaluate(() => { const P = window.RTT_PUTT._state().play; return { ball:P.ball, strokes:P.strokes, state:P.state }; });
    claim(after.strokes >= 1 && (after.state === 'done' || Math.hypot(after.ball[0] - before[0], after.ball[1] - before[1]) > 1), `a pull back and release putts the ball (${after.strokes} stroke, ${after.state})`);
    const dres = await pg.evaluate(() => { const S = window.RTT_PUTT._state(), P = S.play, C = P.C; P.t0 = performance.now() - 12345; P.strokes = 2; P.state = 'done';
      Object.keys(localStorage).filter(x => x.indexOf('bag_ppt_v1') === 0).forEach(k0 => { const s0 = JSON.parse(localStorage.getItem(k0)); s0.daily = {}; localStorage.setItem(k0, JSON.stringify(s0)); });
      window.RTT_PUTT._dailyFinish(2, C.par, Math.round(performance.now() - P.t0)); const d = Object.keys(localStorage).filter(x => x.indexOf('bag_ppt_v1') === 0).map(k => Object.values(JSON.parse(localStorage.getItem(k)).daily || {}).find(v => v.done)).find(Boolean); return { ms:d && d.ms, txt:document.body.innerText }; });
    claim(dres.ms >= 12345 && dres.ms < 14000 && /0:12\.\d/.test(dres.txt), `a finished daily keeps its time and the result shows it (${dres.ms} ms)`);
    claim(await pg.evaluate(() => homeModeList().map(m => m.id).indexOf('putt') === 1), 'the Putt Putt Tour card comes second, right after Play 18');
    // ---- THE TOUR'S RULES, through the page. Each life is real: a fresh record for a fresh account.
    await pg.evaluate(() => { const st = window.RTT_PUTT._state(); if (st && st.play && st.play.strokes) { st.round.mode = 'x'; } document.querySelector('.pt-ov') && window.RTT_PUTT.close(); sbUser = { id:'chk' }; localStorage.removeItem('bag_ppt_v1@chk'); openPutt(); });
    await pg.waitForSelector('.pp-map [data-lv="1"]');
    claim(await pg.evaluate(() => document.querySelectorAll('.pp-lv').length === 90 && document.querySelectorAll('.pp-lv.lock').length === 89 && document.querySelectorAll('.pp-lv.sig').length === 5), 'the map shows 90 levels, five signature holes, and only level 1 open');
    await pg.waitForFunction(() => document.querySelectorAll('.pp-land').length === 5, null, { timeout:15000 }).catch(() => {});
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
    claim(await pg.evaluate(() => /Hole 1-1 · Par 3 · 2 left to beat par/.test(document.querySelector('.pt-hd span').textContent)), 'a Tour hole says how many strokes are left to beat par');
    for (let k = 0; k < 3; k++) await putt(0.04);
    await pg.waitForSelector('.pp-pop');
    claim(/Over par/.test(await pg.textContent('.pp-pop')) && (await rec()).lives === 2, 'over par ends the hole the moment par strokes are gone, and takes a life');
    await pg.click('.pp-pop [data-a="again"]');
    const [pw, pa] = await pg.evaluate(() => { const P = window.RTT_PUTT._state().play, C = P.C, a0 = Math.atan2(C.cup[1] - P.ball[1], C.cup[0] - P.ball[0]);
      for (let da = 0; da <= 0.6; da += 0.004) for (const a of [a0 + da, a0 - da]) for (let p = 0.1; p < 1; p += 0.005){ const v = window.RTT_PUTT.speedFor(C, p * 42); if (window.RTT_PUTT.simulate(C, P.ball[0], P.ball[1], Math.cos(a) * v, Math.sin(a) * v, 0).holed) return [p, a]; } return [null, null]; });
    claim(pw != null, 'the first hole can be aced');
    await putt(pw, pa); await pg.waitForSelector('.pp-pop');
    const r1 = await rec();
    const pop1 = await pg.textContent('.pp-pop');
    const t1 = (r1.tours || {}).main || {};
    claim(r1.v === 2 && /HOLE IN ONE/.test(pop1) && t1.lv === 2 && t1.ace && t1.ace[1] && r1.lives === 2, 'under par beats the hole, opens the next, and an ace is marked gold (in the main tour\'s own record)');
    await pg.click('.pp-pop [data-a="again"]');
    await putt(pw, pa); await pg.waitForSelector('.pp-pop');
    claim(/Coins land the first time only/.test(await pg.textContent('.pp-pop')), 'a replay pays nothing');
    // two more over pars: the last life goes, the 24 hour clock starts, and the sheet offers a refill for money and nothing for coins
    await pg.click('.pp-pop [data-a="next"]');
    for (let t = 0; t < 2; t++){ for (let k = 0; k < 3; k++) await putt(0.03); await pg.waitForSelector('.pp-pop'); await pg.click('.pp-pop [data-a="again"]'); }
    await pg.waitForSelector('.pp-sheet');
    const r2 = await rec();
    claim(r2.lives === 0 && Math.abs(r2.refillAt - Date.now() - 24 * 3600e3) < 120e3 && /\$0\.99/.test(await pg.textContent('.pp-sheet')) && !/coin/i.test(await pg.textContent('.pp-sheet')), 'out of lives: a 24 hour clock, a money refill, no coin price');
    await pg.click('.pp-sheet [data-free]'); await pg.waitForSelector('.pp-map');
    claim((await rec()).lives === 3, 'a tester can refill for free while the checkout is not built');
    // THE MEMBERS TOUR IS THE TOUR PASS HOLDER'S: shut without a pass, a sheet that sells nothing for coins,
    // and a tester can look inside without one
    await pg.click('.pp-tabs [data-tab="members"]'); await pg.waitForSelector('.pp-memsh');
    const ms = await pg.textContent('.pp-memsh');
    claim(/Members only/.test(await pg.evaluate(() => JSON.stringify(window.RTT_PUTT.PAY.members))) && /Get Tour Pass/.test(ms) && !/\d+ coins? to (buy|unlock)/i.test(ms) && await pg.evaluate(() => !document.querySelector('.pp-mem .pp-lv')), 'without a pass the Members tab opens a sheet about the Tour Pass, not the holes');
    await pg.click('.pp-memsh [data-prev]'); await pg.waitForSelector('.pp-mem .pp-map [data-lv="1"]');
    claim(await pg.evaluate(() => document.querySelectorAll('.pp-lv').length === 18 && document.querySelectorAll('.pp-lv.sig').length === 2), 'a tester previews the Members Tour: 18 holes, two signature holes');
    await pg.click('.pp-tabs [data-tab="main"]'); await pg.waitForSelector('.pp-map [data-lv="90"]');
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
        const clear = (x, y) => (C.bumpers || []).every(u => Math.hypot(u.x - x, u.y - y) > u.r + 1.4) && (C.blocks || []).every(r => x < r.x0 - 1.2 || x > r.x1 + 1.2 || y < r.y0 - 3 || y > r.y1 + 3)
          && (C.movers || []).every(m => m.k !== 'spin' || Math.hypot(m.x - x, m.y - y) > m.len + 1) && (C.portals || []).every(p => Math.hypot(p.ax - x, p.ay - y) > 2 && Math.hypot(p.bx - x, p.by - y) > 2.5)
          && (!C.mill || (Math.hypot(C.mill.x - x, C.mill.y - y) > 7 && !(Math.abs(C.mill.x - x) < 3 && y < C.mill.y && y > C.mill.y - 11)))
          // a ramp's lip and kicker stand up off the carpet, a loop stands over its chute, and a river is drawn
          // with its banks: what is behind them in the picture is the set piece, not carpet
          && (C.ramps || []).every(R => { const u = (x - R.x) * R.dx + (y - R.y) * R.dy, v = -(x - R.x) * R.dy + (y - R.y) * R.dx; return u < -(R.len || 1.8) - 2.5 || u > 1 || Math.abs(v) > R.w / 2 + 1; })
          && (C.loops || []).every(L => Math.hypot(L.x - x, L.y - y) > L.r + 3)
          && (C.rivers || []).every(rv => (rv.pts || rv.path || []).every((q, k, A) => { if (!k) return true; const a = A[k - 1], dx = q[0] - a[0], dy = q[1] - a[1], l2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / l2)); return Math.hypot(x - a[0] - dx * t, y - a[1] - dy * t) > (rv.w || 1.8) / 2 + 1.6; }));   // the tower stands 7 ft tall, so it covers the carpet behind it in the picture
        let tried = 0, bad = 0; globalThis.__badAt = null;
        for (let y = C.bounds[1]; y < C.bounds[3]; y += 1.7) for (let x = C.bounds[0]; x < C.bounds[2]; x += 1.3){
          if (C.mats.at(x, y) !== P.M.GREEN || !clear(x, y)) continue; let edge = false; for (const [dx, dy] of [[0.9, 0], [-0.9, 0], [0, 0.9], [0, -0.9]]) if (C.mats.at(x + dx, y + dy) !== P.M.GREEN) edge = true; if (edge) continue;
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
      out.ms.sort((x, y) => x - y); out.med = Math.round(out.ms[out.ms.length >> 1]); out.max = Math.round(out.ms[out.ms.length - 1]);
      return out; });
    claim(!!v3, 'the 3D hole module loaded');
    if (v3){
      claim(v3.n === 72 + 90 + 18 && v3.magenta.length === 0, `all ${v3.n} themed and Tour holes draw in 3D with no unknown material` + (v3.magenta.length ? ': ' + v3.magenta.slice(0, 4).join('; ') : ''));
      claim(v3.off.length === 0, 'the projection puts open carpet on carpet in every picture, so the ball rolls on what is drawn' + (v3.off.length ? ': ' + v3.off.slice(0, 4).join('; ') : ''));
      claim(v3.sliceDiff === 0 && v3.slices > 20, `rendered a little at a time (${v3.slices} steps) it is the same picture, pixel for pixel` + (v3.sliceDiff ? ': ' + v3.sliceDiff + ' differ' : ''));
      claim(v3.med < 600, `a hole renders in ${v3.med}ms at the median (${v3.max}ms the slowest), on this machine`);
    }
    // a hole in 3D, through the game; and a render that throws draws the hole flat rather than nothing
    await pg.evaluate(() => { if (!document.querySelector('.pt-ov')) openPutt(); window.RTT_PUTT._level(23); });
    await pg.waitForFunction(() => { const P = window.RTT_PUTT._state().play; return P && (P.v3 || P.art); }, null, { timeout:60000 });
    claim(await pg.evaluate(() => !!window.RTT_PUTT._state().play.v3), 'a Tour hole plays in 3D');
    await pg.evaluate(() => { const D3 = window.RTT_PUTT_3D; window.__keep = D3.render; D3.render = () => { throw new Error('probe'); }; window.RTT_PUTT._state().v3c = {}; window.RTT_PUTT._state().v3job = null; window.RTT_PUTT._level(34); });
    await pg.waitForFunction(() => { const P = window.RTT_PUTT._state().play; return P && (P.v3 || P.art); }, null, { timeout:60000 });
    claim(await pg.evaluate(() => { const P = window.RTT_PUTT._state().play; return !P.v3 && !!P.art; }), 'a 3D render that throws falls back to the flat hole');
    await pg.evaluate(() => { window.RTT_PUTT_3D.render = window.__keep; });
    claim(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
    await b.close(); srv.close();
  }
}
console.log(fails ? `\n${fails} FAILED` : '\nall good');
process.exit(fails ? 1 : 0);
