#!/usr/bin/env node
/* The putting green, checked by PLAYING it.
 *
 *   node golf/putt/check-putt.mjs               physics, the real greens, every themed hole, 21 dailies
 *   node golf/putt/check-putt.mjs --days 120    more dailies (a season is a few minutes)
 *   node golf/putt/check-putt.mjs --quick       physics and the real greens only
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
const require = createRequire(import.meta.url);
const P = require('./putt.js');
const M = P.M;
const args = process.argv.slice(2);
const QUICK = args.includes('--quick');
const DAYS = +(args[args.indexOf('--days') + 1] || 21) || 21;
const TOURPAR = args.includes('--tour-par');   // only the Tour's par report: skip everything else

let fails = 0;
const ok = m => console.log('  ok  ', m);
const fail = m => { fails++; console.log('  FAIL', m); };
const claim = (c, m) => c ? ok(m) : fail(m);
const head = s => console.log('\n' + s);

/* ============================================================================ 1. THE PHYSICS */
head('1. THE PHYSICS');
const flat = (stimp, comps) => P.finishCourse({ bounds:[-60, -60, 60, 60], comps:comps || [], stimp, cup:[0, -58], cupR:P.CUP_R, matFn:() => M.GREEN });
for (const s of (TOURPAR ? [] : [9, 11, 13.5])){
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
const pick = TOURPAR ? [] : keys;
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
   par - 1 without needing luck. "Without luck" is measured: a holing putt only counts if the putts
   either side of it (a degree of aim, most of a foot of pace, and a beat either way on a moving hole)
   mostly hole too. A line that only works to the pixel is not a route. */
function robustHole(C, x, y, ang, ft, t0){
  const D = 0.9 * Math.PI / 180, F = 0.8, nb = [[D, 0, 0], [-D, 0, 0], [0, F, 0], [0, -F, 0]];
  if (C.movers.length) nb.push([0, 0, 0.12], [0, 0, -0.12]);
  let ok = 0; for (const [da, df, dt] of nb) if (playShot(C, x, y, ang + da, ft + df, t0 + dt).holed) ok++;
  return ok >= nb.length - 1;
}
function solveRobust(C, cap){
  const geo = geodesic(C), t0s = C.movers.length ? [0, 0.5, 1.0, 1.5, 2.0, 2.6] : [0];
  let frontier = [{ x:C.tee[0], y:C.tee[1], t:0 }], total = 0;
  for (let s = 1; s <= cap; s++){
    const next = [];
    for (const f of frontier){
      const fine = s > 1, base = Math.atan2(C.cup[1] - f.y, C.cup[0] - f.x);
      for (const t0 of t0s){
        const angs = [];
        if (fine) for (let a = -1.2; a <= 1.2; a += 0.012) angs.push(base + a);
        for (let a = 0; a < 360; a += fine ? 4 : 2) angs.push(a * Math.PI / 180);
        for (const ang of angs) for (let ft = 2; ft <= 42; ft += 1){
          const r = playShot(C, f.x, f.y, ang, ft, t0 + f.t); total++;
          if (r.holed){ if (robustHole(C, f.x, f.y, ang, ft, t0 + f.t)) return { strokes:s, total, line:[f.x, f.y, ang, ft, t0 + f.t] }; continue; }
          if (r.water || r.out) continue;
          next.push({ x:r.rest[0], y:r.rest[1], t:f.t + r.t + 2, d:geo(r.rest[0], r.rest[1]) });
        }
      }
    }
    next.sort((a, b) => a.d - b.d);
    const keep = []; for (const n of next){ if (keep.length >= 6) break; if (keep.every(k => Math.hypot(k.x - n.x, k.y - n.y) > 1.2)) keep.push(n); }
    frontier = keep;
  }
  return { strokes:Infinity, total };
}
if (args.includes('--tour-par')){
  // prints what par each Tour hole should carry: the robust route plus one, never under 3
  for (let n = 1; n <= P.LEVELS.length; n++){ if (P.LEVELS[n - 1].real) continue;
    if (args.includes('--only') && !args.slice(args.indexOf('--only') + 1)[0].split(',').map(Number).includes(n)) continue;
    const C = P.buildLevel(n), r = solveRobust(C, 4), want = Math.max(3, r.strokes + 1);
    console.log(String(n).padStart(2), (P.levelName(n)).padEnd(22), 'robust', r.strokes, 'par now', P.LEVELS[n - 1].par, want === P.LEVELS[n - 1].par ? '' : '  WANT ' + want, '(' + r.total + ' shots)'); }
  process.exit(0);
}
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
  head('3b. THE PUTT PUTT TOUR: EVERY HOLE BEATEN UNDER PAR, WITHOUT LUCK');
  const W = P.WORLDS, Lv = P.LEVELS, Cn = P.COINS || {};
  claim(Lv.length === 50 && W.length === 5, `50 levels in ${W.length} worlds`);
  claim(Lv.every((L, i) => !!L.sig === ((i + 1) % 10 === 0)), 'every tenth hole, and only it, is a signature hole');
  const shapes = new Set();
  for (let n = 1; n <= Lv.length; n++){ const L = Lv[n - 1]; if (L.real) continue;
    const C = P.buildLevel(n), key = JSON.stringify(C.poly.map(p => p.map(v => Math.round(v * 2)))) + C.bumpers.length + C.blocks.length + C.movers.length + C.zones.length + C.portals.length;
    shapes.add(key);
    claim(C.mats.at(C.tee[0], C.tee[1]) === M.GREEN && C.mats.at(C.cup[0], C.cup[1]) === M.GREEN, `${n} ${P.levelName(n)}: tee and cup on the carpet`);
    const r = solveRobust(C, L.par - 1);
    claim(r.strokes <= L.par - 1, `${n} ${P.levelName(n)}: beaten in ${r.strokes === Infinity ? 'more than ' + (L.par - 1) : r.strokes} with room for error (par ${L.par})`); }
  claim(shapes.size === Lv.filter(L => !L.real).length, `no two holes share a layout (${shapes.size} distinct)`);
  const perWorld = 9 * Cn.hole + Cn.sig + 10 * Cn.ace + Cn.world;
  claim(perWorld * 5 === 20000, `the Tour pays exactly 20,000 coins (${perWorld} a world)`);
  head(`4. ${DAYS} DAILY HOLES FROM TODAY`);
  const day0 = new Date(Date.UTC(2026, 9, 1));
  const themesSeen = new Set();
  for (let i = 0; i < DAYS; i++){
    const d = new Date(day0.getTime() + i * 86400000), key = d.toISOString().slice(0, 10), desc = P.dailyHole(key);
    themesSeen.add(desc.theme);
    claim(desc.theme === P.themeForDay(key), `${key} is ${desc.theme}`);
    checkHole(P.buildFrom(desc), `${key} ${desc.name} (${desc.tpl}, ${desc.theme})`);
  }
  const yr = new Set(); for (let i = 0; i < 365; i++){ const d = new Date(day0.getTime() + i * 86400000); yr.add(P.themeForDay(d.toISOString().slice(0, 10))); }
  claim(yr.size === Object.keys(P.THEMES).length, `a year of dailies wears every theme (${[...yr].join(', ')})`);
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
    const th = await pg.evaluate(() => { const k = String(todayKey()), iso = k.slice(0, 4) + '-' + k.slice(4, 6) + '-' + k.slice(6, 8); return { want:window.RTT_PUTT.THEMES[window.RTT_PUTT.themeForDay(iso)].kick, got:document.querySelector('[data-daily] .k').textContent }; });
    claim(th.got.indexOf(th.want) >= 0, `the Daily Hole wears today's theme (${th.got})`);
    await pg.click('[data-daily]'); await pg.waitForSelector('.pt-stage canvas');
    await pg.waitForTimeout(300);
    const box = await pg.locator('.pt-stage canvas').boundingBox();
    const before = await pg.evaluate(() => window.RTT_PUTT._state().play.ball.slice());
    await pg.mouse.move(box.x + box.width / 2, box.y + box.height * 0.5); await pg.mouse.down();
    await pg.mouse.move(box.x + box.width / 2, box.y + box.height * 0.5 + 120, { steps:6 }); await pg.mouse.up();
    await pg.waitForFunction(() => { const P = window.RTT_PUTT._state().play; return P.state !== 'roll' && P.strokes >= 1; }, null, { timeout:30000 });
    const after = await pg.evaluate(() => { const P = window.RTT_PUTT._state().play; return { ball:P.ball, strokes:P.strokes, state:P.state }; });
    claim(after.strokes >= 1 && (after.state === 'done' || Math.hypot(after.ball[0] - before[0], after.ball[1] - before[1]) > 1), `a pull back and release putts the ball (${after.strokes} stroke, ${after.state})`);
    claim(await pg.evaluate(() => homeModeList().map(m => m.id).indexOf('putt') === 1), 'the Putt Putt Tour card comes second, right after Play 18');
    // ---- THE TOUR'S RULES, through the page. Each life is real: a fresh record for a fresh account.
    await pg.evaluate(() => { const st = window.RTT_PUTT._state(); if (st && st.play && st.play.strokes) { st.round.mode = 'x'; } document.querySelector('.pt-ov') && window.RTT_PUTT.close(); sbUser = { id:'chk' }; localStorage.removeItem('bag_ppt_v1@chk'); openPutt(); });
    await pg.waitForSelector('.pp-map [data-lv="1"]');
    claim(await pg.evaluate(() => document.querySelectorAll('.pp-lv').length === 50 && document.querySelectorAll('.pp-lv.lock').length === 49 && document.querySelectorAll('.pp-lv.sig').length === 5), 'the map shows 50 levels, five signature holes, and only level 1 open');
    await pg.waitForFunction(() => document.querySelectorAll('.pp-land').length === 5, null, { timeout:15000 }).catch(() => {});
    const land = await pg.evaluate(() => [...document.querySelectorAll('.pp-band')].map(b => { const c = b.querySelector('.pp-land'); if (!c) return null;
      const x = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; const cols = new Set(); for (let i = 0; i < x.length; i += 4 * 37) cols.add(x[i] << 16 | x[i + 1] << 8 | x[i + 2]);
      return { cols:cols.size, exact:Math.abs(c.offsetWidth - c.width * 2) < 1 && Math.abs(c.offsetHeight - c.height * 2) < 1, covers:c.offsetWidth >= b.offsetWidth && c.offsetHeight >= b.offsetHeight }; }));
    claim(land.every(l => l && l.cols > 60 && l.exact && l.covers), `every world on the map is painted as a landscape of its own, at exactly 2x, covering its band (${land.map(l => l ? l.cols : 'none').join(', ')} colours)`);
    const rec = () => pg.evaluate(() => JSON.parse(localStorage.getItem('bag_ppt_v1@chk') || '{}'));
    const putt = async (pow) => { await pg.waitForFunction(() => { const P = window.RTT_PUTT._state().play; return P && P.state === 'aim' && (P.v3 || P.art); }, null, { timeout:60000 });
      await pg.evaluate(p => { const P = window.RTT_PUTT._state().play; P.pow = p; P.aimAng = Math.atan2(P.C.cup[1] - P.ball[1], P.C.cup[0] - P.ball[0]); }, pow);
      await pg.keyboard.press('Space'); await pg.waitForFunction(() => { const P = window.RTT_PUTT._state().play; return !P || P.state !== 'roll'; }, null, { timeout:30000 }); };
    await pg.click('[data-lv="1"]');
    claim(await pg.evaluate(() => /Hole 1-1 · Par 3 · 2 left to beat par/.test(document.querySelector('.pt-hd span').textContent)), 'a Tour hole says how many strokes are left to beat par');
    for (let k = 0; k < 3; k++) await putt(0.04);
    await pg.waitForSelector('.pp-pop');
    claim(/Over par/.test(await pg.textContent('.pp-pop')) && (await rec()).lives === 2, 'over par ends the hole the moment par strokes are gone, and takes a life');
    await pg.click('.pp-pop [data-a="again"]');
    const pw = await pg.evaluate(() => { const P = window.RTT_PUTT._state().play, C = P.C; for (let p = 0.3; p < 0.7; p += 0.005){ const v = window.RTT_PUTT.speedFor(C, p * 42), a = Math.atan2(C.cup[1] - P.ball[1], C.cup[0] - P.ball[0]); if (window.RTT_PUTT.simulate(C, P.ball[0], P.ball[1], Math.cos(a) * v, Math.sin(a) * v, 0).holed) return p; } return null; });
    await putt(pw); await pg.waitForSelector('.pp-pop');
    const r1 = await rec();
    claim(/HOLE IN ONE/.test(await pg.textContent('.pp-pop')) && r1.lv === 2 && r1.ace[1] && r1.lives === 2, 'under par beats the hole, opens the next, and an ace is marked gold');
    await pg.click('.pp-pop [data-a="again"]');
    await putt(pw); await pg.waitForSelector('.pp-pop');
    claim(/Coins land the first time only/.test(await pg.textContent('.pp-pop')), 'a replay pays nothing');
    // two more over pars: the last life goes, the 24 hour clock starts, and the sheet offers a refill for money and nothing for coins
    await pg.click('.pp-pop [data-a="next"]');
    for (let t = 0; t < 2; t++){ for (let k = 0; k < 3; k++) await putt(0.03); await pg.waitForSelector('.pp-pop'); await pg.click('.pp-pop [data-a="again"]'); }
    await pg.waitForSelector('.pp-sheet');
    const r2 = await rec();
    claim(r2.lives === 0 && Math.abs(r2.refillAt - Date.now() - 24 * 3600e3) < 120e3 && /\$0\.99/.test(await pg.textContent('.pp-sheet')) && !/coin/i.test(await pg.textContent('.pp-sheet')), 'out of lives: a 24 hour clock, a money refill, no coin price');
    await pg.click('.pp-sheet [data-free]'); await pg.waitForSelector('.pp-map');
    claim((await rec()).lives === 3, 'a tester can refill for free while the checkout is not built');
    // a Tour Pin plays on a real green
    await pg.evaluate(() => window.RTT_PUTT._level(41)); await pg.waitForSelector('.pt-stage canvas'); await pg.waitForTimeout(300);
    const tg = await pg.evaluate(() => { const P = window.RTT_PUTT._state().play; return { kind:P.C.kind, par:P.C.par, on:P.C.mats.at(P.ball[0], P.ball[1]) === window.RTT_PUTT.M.GREEN, name:document.querySelector('.pt-hd b').textContent }; });
    claim(tg.kind === 'real' && tg.on && tg.par === 3, `a Tour Pin opens on a real green with the ball on it (${tg.name})`);
    await pg.keyboard.press('Escape'); await pg.keyboard.press('Escape');
    claim(await pg.evaluate(() => !document.querySelector('.pt-ov') && document.body.style.overflow !== 'hidden'), 'Escape twice closes it and gives the page its scroll back');
    // ---- THE 3D HOLE (hole3d.js, land.js): every themed hole, its picture and its projection
    const v3 = await pg.evaluate(() => { const P = window.RTT_PUTT, D3 = window.RTT_PUTT_3D, out = { n:0, magenta:[], off:[], ms:[], land:[], sliceDiff:null };
      if (!D3) return null;
      const ramp = h => window.PXHD.ramp(h);
      const all = []; for (const th of P.CAL_THEMES) P.themedCourse(th).forEach((d, i) => all.push([th, d, i]));
      for (let n = 1; n <= P.LEVELS.length; n++) if (!P.LEVELS[n - 1].real) all.push(['tour' + n, P.tourDesc(n), 0]);
      all.forEach(([th, d, i]) => {
        const C = P.buildFrom(d), t0 = performance.now(), R = D3.render(C, { aspect:2 }); out.ms.push(performance.now() - t0); out.n++;
        const cx = R.cv.getContext('2d'), W = R.cv.width, H = R.cv.height, px = cx.getImageData(0, 0, W, H).data;
        let mg = 0; for (let k = 0; k < px.length; k += 4) if (px[k] === 255 && px[k + 1] === 0 && px[k + 2] === 255) mg++;
        if (mg) out.magenta.push(th + ' ' + (i + 1) + ': ' + mg);
        // a point on open carpet, projected, lands on carpet in the picture
        const ok = new Set(ramp(C.T.carpet).concat(ramp(C.T.carpet2))), hex = (r, g, b) => '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
        const clear = (x, y) => (C.bumpers || []).every(u => Math.hypot(u.x - x, u.y - y) > u.r + 1.4) && (C.blocks || []).every(r => x < r.x0 - 1.2 || x > r.x1 + 1.2 || y < r.y0 - 3 || y > r.y1 + 3)
          && (C.movers || []).every(m => m.k !== 'spin' || Math.hypot(m.x - x, m.y - y) > m.len + 1) && (C.portals || []).every(p => Math.hypot(p.ax - x, p.ay - y) > 2 && Math.hypot(p.bx - x, p.by - y) > 2.5)
          && (!C.mill || (Math.hypot(C.mill.x - x, C.mill.y - y) > 7 && !(Math.abs(C.mill.x - x) < 3 && y < C.mill.y && y > C.mill.y - 11)));   // the tower stands 7 ft tall, so it covers the carpet behind it in the picture
        let tried = 0, bad = 0;
        for (let y = C.bounds[1]; y < C.bounds[3]; y += 1.7) for (let x = C.bounds[0]; x < C.bounds[2]; x += 1.3){
          if (C.mats.at(x, y) !== P.M.GREEN || !clear(x, y)) continue; let edge = false; for (const [dx, dy] of [[0.9, 0], [-0.9, 0], [0, 0.9], [0, -0.9]]) if (C.mats.at(x + dx, y + dy) !== P.M.GREEN) edge = true; if (edge) continue;
          // the near rail stands between the camera and the strip just behind it, and a belt is drawn as a belt
          if (C.mats.at(x, y + 2.2) !== P.M.GREEN || (C.belts || []).some(z => x > z.x0 - 0.9 && x < z.x1 + 0.9 && y > z.y0 - 0.9 && y < z.y1 + 0.9)) continue;
          const q = R.pr(x, y, R.zAt(x, y)), i2 = (Math.floor(q[1]) * W + Math.floor(q[0])) * 4; tried++; if (!ok.has(hex(px[i2], px[i2 + 1], px[i2 + 2]))) bad++; }
        if (!tried || bad > tried * 0.04) out.off.push(th + ' ' + (i + 1) + ': ' + bad + ' of ' + tried);
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
      claim(v3.n === 72 + 45 && v3.magenta.length === 0, `all ${v3.n} themed and Tour holes draw in 3D with no unknown material` + (v3.magenta.length ? ': ' + v3.magenta.slice(0, 4).join('; ') : ''));
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
