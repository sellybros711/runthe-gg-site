#!/usr/bin/env node
/* THE TOUR'S SOLVER, and the routes it leaves behind.
 *
 *   node golf/putt/solve.mjs --tour main              solve every hole, print what par each should carry
 *   node golf/putt/solve.mjs --tour members --only 3,7
 *   node golf/putt/solve.mjs --tour main --write      and write golf/putt/routes.json
 *   node golf/putt/solve.mjs --tour main --jobs 4     in parallel (the default is the core count)
 *
 * A Putt Putt Tour hole is only fair if a skilled player can get round in par - 1 without luck, because
 * under par is the only way on. So every hole is PLAYED by a search: from the tee, a fan of aims and
 * paces (and, on a hole with anything moving, a few moments to strike), then the same from the best
 * places those left the ball, ranked by the walking distance to the cup round the walls, through the
 * tunnels and back over the ramp jumps. A holing putt only counts if the putts either side of it (a
 * degree of aim, most of a foot of pace, a beat either way on a moving hole) mostly hole too.
 *
 * Searching 108 holes takes the best part of an hour, so the search is not what CI runs. It writes the
 * route it found (every putt: aim, pace and the moment it was struck) into routes.json, and
 * check-putt.mjs REPLAYS those, which takes seconds and proves the same thing: this hole can be beaten
 * under par, by this exact line, with room for error on the putt that drops. Change a hole and its
 * route no longer replays, so the check fails until this is run again.
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
const require = createRequire(import.meta.url);
const P = require(process.env.PUTT_SRC || './putt.js');   // PUTT_SRC tries a copy of the holes without touching the real file
const M = P.M;

export function timed(C){ return C.movers.length + C.bridges.length + C.turns.length > 0; }
/* walking distance to the cup over the course, round walls and blocks, back through tunnels and pipes
   and back over a ramp's jump, so a ball short of a gap does not rank behind one that went in the water */
// with avoid, the secret zones are walls: a search told to find the obvious line must not rank a ball
// sitting by a secret pipe's mouth as nearly home, or it spends every slot it has beside a door it may not use
export function geodesic(C, avoid){
  const Z = avoid ? (C.secret || []) : [], inZ = (x, y) => Z.some(z => x >= z.x0 - 0.3 && x <= z.x1 + 0.3 && y >= z.y0 - 0.3 && y <= z.y1 + 0.3);
  const res = 0.5, b = C.bounds, nx = Math.ceil((b[2] - b[0]) / res) + 1, ny = Math.ceil((b[3] - b[1]) / res) + 1;
  const pass = new Uint8Array(nx * ny), D = new Float64Array(nx * ny).fill(1e9);   // 64 bit: a heap entry read back against a 32 bit copy of itself looks stale, and the search stops spreading
  const solid = (x, y) => C.blocks.some(r => P.inBlock(r, x, y, 0.1)) || C.bumpers.some(u => Math.hypot(x - u.x, y - u.y) < u.r + 0.1);
  const deck = (x, y) => C.bridges.some(r => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++){ const x = b[0] + i * res, y = b[1] + j * res, m = C.mats.at(x, y);
    pass[j * nx + i] = ((m !== M.OUT && m !== M.WATER) || deck(x, y)) && !solid(x, y) && !inZ(x, y) ? 1 : 0; }
  const idx = (x, y) => { const i = Math.round((x - b[0]) / res), j = Math.round((y - b[1]) / res); return (i < 0 || j < 0 || i >= nx || j >= ny) ? -1 : j * nx + i; };
  const near = (x, y) => { let o = idx(x, y); if (o >= 0 && pass[o]) return o; for (let r = 1; r < 4; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++){ o = idx(x + di * res, y + dj * res); if (o >= 0 && pass[o]) return o; } return -1; };
  // the jumps a search can take backward: a tunnel's exit reaches its mouth, a landing reaches its lip
  const back = [];
  C.portals.forEach(p => { if (inZ(p.ax, p.ay)) return; const a = near(p.bx, p.by), e = near(p.ax, p.ay); if (a >= 0 && e >= 0) back.push([a, e, 1]); });
  C.ramps.forEach(R => { const e = near(R.x - R.dx * 0.6, R.y - R.dy * 0.6); if (e < 0) return;
    for (let k = 1.5; k <= 9; k += 0.5) for (const s of [-0.5, 0, 0.5]){ const a = near(R.x + R.dx * k - R.dy * s * R.w, R.y + R.dy * k + R.dx * s * R.w); if (a >= 0) back.push([a, e, k * 0.6]); } });
  C.loops.forEach(L => { const a = near(L.x + L.dx * 0.8, L.y + L.dy * 0.8), e = near(L.x - L.dx * 0.8, L.y - L.dy * 0.8); if (a >= 0 && e >= 0) back.push([a, e, 1.6]); });
  const outOf = new Map(); back.forEach(([a, e, w]) => { if (!outOf.has(a)) outOf.set(a, []); outOf.get(a).push([e, w]); });
  const start = near(C.cup[0], C.cup[1]); if (start < 0) return () => 1e9;
  // a Dijkstra over the grid with the jumps as extra edges (a binary heap keeps it quick)
  const heap = [[0, start]]; D[start] = 0;
  const push = (d, o) => { heap.push([d, o]); let i = heap.length - 1; while (i){ const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length){ heap[0] = last; let i = 0; for (;;){ const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  const nb = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
  while (heap.length){ const [d, o] = pop(); if (d > D[o]) continue; const i = o % nx, j = (o / nx) | 0;
    for (const [di, dj, w] of nb){ const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= nx || jj >= ny) continue; const o2 = jj * nx + ii; if (!pass[o2]) continue;
      const nd = d + w * res; if (nd < D[o2]){ D[o2] = nd; push(nd, o2); } }
    const ex = outOf.get(o); if (ex) for (const [e, w] of ex){ const nd = d + w; if (nd < D[e]){ D[e] = nd; push(nd, e); } } }
  return (x, y) => { const o = near(x, y); return o < 0 ? 1e9 : D[o]; };
}
export function shot(C, x, y, ang, ft, t0){ const v = P.speedFor(C, ft); return P.simulate(C, x, y, Math.cos(ang) * v, Math.sin(ang) * v, t0); }
/* does this putt go through one of the hole's secrets (see secret() in putt.js) */
export function touches(C, r){ const Z = C.secret || []; if (!Z.length) return false;
  return r.pts.some(p => Z.some(z => p[0] >= z.x0 && p[0] <= z.x1 && p[1] >= z.y0 && p[1] <= z.y1)); }
// a holing putt only counts if the putts either side of it mostly hole too
export function robust(C, x, y, ang, ft, t0){
  const D = 0.9 * Math.PI / 180, F = 0.8, nb = [[D, 0, 0], [-D, 0, 0], [0, F, 0], [0, -F, 0]];
  if (timed(C)) nb.push([0, 0, 0.12], [0, 0, -0.12]);
  let ok = 0; for (const [da, df, dt] of nb) if (shot(C, x, y, ang + da, ft + df, t0 + dt).holed) ok++;
  return ok >= nb.length - 1;
}
/* a putt that leaves the ball short of the cup is only a good one to plan on if a person's ordinary miss
   (a degree and a half of aim, most of a foot of pace, a beat early or late on a moving hole) does not put it
   in the water or off the course. Without this the search happily times a drawbridge to the last frame it is
   down, and the route it records is one a player goes wet on half the time. */
export function safe(C, x, y, ang, ft, t0){
  const D = 1.5 * Math.PI / 180, F = Math.max(0.8, ft * 0.08), nb = [[D, 0, 0], [-D, 0, 0], [0, F, 0], [0, -F, 0]];
  if (timed(C)) nb.push([0, 0, 0.15], [0, 0, -0.15]);
  for (const [da, df, dt] of nb){ const r = shot(C, x, y, ang + da, Math.min(44, Math.max(2, ft + df)), t0 + dt); if (r.water || r.out) return false; }
  return true;
}
/* the fewest strokes with room for error, up to cap, and the line that does it */
export function solve(C, cap, stats, avoid){
  // strike moments on a moving hole: a step that is not a fraction of any common period, so a windmill
  // turning once a second is not met at the same two phases over and over
  // the line is kept at full precision: on a moving hole a rounded strike time or aim is a different putt
  const geo = geodesic(C, avoid), T0 = timed(C) ? [0, 0.35, 0.7, 1.05, 1.4, 1.75, 2.1] : [0];
  let frontier = [{ x:C.tee[0], y:C.tee[1], t:0, line:[] }], total = 0;
  for (let s = 1; s <= cap; s++){
    const byKey = new Map();
    for (const f of frontier){
      const fine = s > 1, base = Math.atan2(C.cup[1] - f.y, C.cup[0] - f.x), angs = [];
      if (fine) for (let a = -1.0; a <= 1.0; a += 0.014) angs.push(base + a);
      for (let a = 0; a < 360; a += fine ? 5 : (timed(C) ? 2 : 1)) angs.push(a * Math.PI / 180);
      for (const dt of T0){ const t0 = f.t + dt;
        for (const ang of angs) for (let ft = 2; ft <= 44; ft += 1){
          const r = shot(C, f.x, f.y, ang, ft, t0); total++;
          if (stats){ if (r.out) stats.out++; if (r.t > 23.9) stats.stuck++; }
          if (avoid && touches(C, r)) continue;
          if (r.holed){ if (robust(C, f.x, f.y, ang, ft, t0)) return { strokes:s, total, line:f.line.concat([[ang, ft, t0]]) }; continue; }
          if (r.water || r.out) continue;
          // a few ways of reaching each place are kept, so the safe one is still there when the first was not
          const key = Math.round(r.rest[0] * 3) + ',' + Math.round(r.rest[1] * 3) + ',' + (timed(C) ? Math.round(r.t) : 0);
          let g = byKey.get(key); if (!g){ g = []; byKey.set(key, g); } if (g.length >= 4) continue;
          g.push({ x:r.rest[0], y:r.rest[1], t:t0 + r.t + 2, d:geo(r.rest[0], r.rest[1]), line:f.line.concat([[ang, ft, t0]]), from:f, shot:[ang, ft, t0] });
        }
      }
    }
    const groups = [...byKey.values()].sort((a, b) => a[0].d - b[0].d), keep = [], risky = [];
    for (const g of groups){ if (keep.length >= 6) break; const n0 = g[0]; if (!keep.every(k => Math.hypot(k.x - n0.x, k.y - n0.y) > 1.2)) continue;
      const n = g.find(c => safe(C, c.from.x, c.from.y, c.shot[0], c.shot[1], c.shot[2])); if (n) keep.push(n); else if (risky.length < 6) risky.push(n0); }
    // nowhere safe to go: fall back to the risky places, so a hole with no safe line still reports one
    for (const n of risky){ if (keep.length >= 6) break; keep.push(n); }
    frontier = keep;
    if (process.env.PUTT_TRACE) console.log('  after', s, 'the best places:', keep.map(k => `(${k.x.toFixed(1)},${k.y.toFixed(1)}) ${k.d.toFixed(1)}ft`).join('  '));
  }
  return { strokes:Infinity, total };
}
/* THREE STARS IS TWO UNDER PAR, so on a par 3 it is the ace, and it has to be a putt a player can make.
   The search from the tee above steps a degree and a foot at a time and only keeps a putt that holes ON
   that grid, which misses most aces: a bank that drops is a window under a degree wide. So this sweeps
   the same fan, keeps every putt that passes within two feet of the cup, and searches finely round the
   closest of them. A putt only counts if robust() passes, the room for error every recorded putt gets. */
export function aceSearch(C){
  const TM = timed(C), T0 = TM ? [0, 0.3, 0.6, 0.9, 1.2, 1.5, 1.8, 2.1, 2.4, 2.7] : [0], [cx, cy] = C.cup, tx = C.tee[0], ty = C.tee[1];
  const near = r => { let m = 1e9; for (const p of r.pts){ const d = Math.hypot(p[0] - cx, p[1] - cy); if (d < m) m = d; } return m; };
  const cand = []; let total = 0;
  for (const t0 of T0) for (let d = 0; d < 360; d++) for (let ft = 2; ft <= 44; ft++){ const a = d * Math.PI / 180, r = shot(C, tx, ty, a, ft, t0); total++;
    if (r.water || r.out) continue; const m = r.holed ? 0 : near(r); if (m < 2) cand.push([m, a, ft, t0]); }
  cand.sort((p, q) => p[0] - q[0]);
  const seen = [];
  for (const [, a0, f0, t0] of cand.slice(0, 80)){
    if (seen.some(q => Math.abs(q[0] - a0) < 0.03 && Math.abs(q[1] - f0) < 2 && q[2] === t0)) continue; seen.push([a0, f0, t0]);
    for (const dt of TM ? [-0.2, -0.1, 0, 0.1, 0.2] : [0]) for (let da = -1.5; da <= 1.5; da += 0.15) for (let df = -1.5; df <= 1.5; df += 0.25){
      const a = a0 + da * Math.PI / 180, ft = Math.min(44, f0 + df), t = Math.max(0, t0 + dt); total++;
      if (shot(C, tx, ty, a, ft, t).holed && robust(C, tx, ty, a, ft, t)) return { strokes:1, total, line:[[a, ft, t]] }; } }
  return { strokes:Infinity, total };
}
/* replay a recorded route: every putt in it rests where the next is struck, nothing goes in the water
   or out, the last one drops, and it has room for error. Returns null if it holds, or why it does not. */
export function replay(C, line, want){
  let x = C.tee[0], y = C.tee[1], hit = false;
  for (let i = 0; i < line.length; i++){ const [ang, ft, t0] = line[i], r = shot(C, x, y, ang, ft, t0);
    if (touches(C, r)){ if (want === 'obvious') return `putt ${i + 1} goes through the secret`; hit = true; }
    if (want === 'secret' && i === line.length - 1 && r.holed && !hit) return 'it never goes through the secret';
    if (r.water || r.out) return `putt ${i + 1} goes ${r.water ? 'in the water' : 'out'}`;
    if (i === line.length - 1){ if (!r.holed) return `putt ${i + 1} does not drop`; if (!robust(C, x, y, ang, ft, t0)) return `putt ${i + 1} drops but only to the pixel`; return null; }
    if (r.holed) return `putt ${i + 1} drops early`;
    x = r.rest[0]; y = r.rest[1]; }
  return 'no putts';
}

if (isMainThread && process.argv[1] && process.argv[1].endsWith('solve.mjs')){
  const args = process.argv.slice(2), tour = args.includes('--tour') ? args[args.indexOf('--tour') + 1] : 'main', TR = P.TOURS[tour];
  if (!TR){ console.log('no tour ' + tour); process.exit(1); }
  const only = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',').map(Number) : null;
  const jobs = args.includes('--jobs') ? +args[args.indexOf('--jobs') + 1] : Math.max(1, os.cpus().length);
  const cap = args.includes('--cap') ? +args[args.indexOf('--cap') + 1] : 0;
  const ns = []; for (let n = 1; n <= TR.levels.length; n++) if (!only || only.includes(n)) ns.push(n);
  const out = {}, ROUTES = new URL('./routes.json', import.meta.url);
  let pending = ns.slice(), live = 0, done = 0;
  // each hole is written the moment it is solved, so a run that is stopped keeps what it found
  // two solves can run at once (a long signature hole on one tour, a batch on the other), so the read and
  // write of routes.json happen under a lock directory, or one run writes back a copy missing the other's holes
  const LOCK = new URL('./routes.lock', import.meta.url);
  const locked = fn => { for (let i = 0; i < 400; i++){ try { fs.mkdirSync(LOCK); break; } catch (e){ const t = Date.now() + 25; while (Date.now() < t); } }
    try { fn(); } finally { try { fs.rmdirSync(LOCK); } catch (e){} } };
  const save = n => locked(() => saveNow(n));
  const saveNow = n => { const all = fs.existsSync(ROUTES) ? JSON.parse(fs.readFileSync(ROUTES, 'utf8')) : {}, m = out[n];
    if (m && m.line) all[tour + ':' + n] = m.line; else delete all[tour + ':' + n];
    if (m && m.sc) all[tour + ':' + n + ':sc'] = m.sc; else delete all[tour + ':' + n + ':sc'];
    if (m && m.three) all[tour + ':' + n + ':3'] = m.three; else delete all[tour + ':' + n + ':3'];
    const keys = Object.keys(all).sort((a, b) => a.split(':')[0].localeCompare(b.split(':')[0]) || (+a.split(':')[1] - +b.split(':')[1]) || a.length - b.length);
    fs.writeFileSync(ROUTES, '{\n' + keys.map(k => '  ' + JSON.stringify(k) + ':' + JSON.stringify(all[k])).join(',\n') + '\n}\n'); };
  const t0 = Date.now();
  await new Promise(res => {
    const go = () => { if (!pending.length && !live) return res();
      while (live < jobs && pending.length){ const n = pending.shift(); live++;
        const w = new Worker(new URL(import.meta.url), { workerData:{ tour, n, cap } });
        w.on('message', m => { out[n] = m; done++; if (args.includes('--write')) save(n); const L = TR.levels[n - 1], want = Math.max(3, m.strokes + 1);
          const scTxt = (P.buildLevel(n, tour).secret || []).length ? (m.sc ? `  shortcut ${m.sc.length}` : '  SHORTCUT NOT FOUND') : '';
          const tw = P.threeOf(want, L.three), best3 = Math.min(m.strokes, m.sc ? m.sc.length : Infinity, m.three ? 1 : Infinity);
          const thTxt = best3 <= tw ? `  3 stars in ${best3}` : '  3 STARS NOT FOUND';
          console.log(String(n).padStart(3), P.levelName(n, tour).padEnd(24), 'obvious', m.strokes, 'par now', L.par, want === L.par ? '' : '  WANT ' + want, scTxt, thTxt, m.onReal ? '  REAL COURSE: ' + m.onReal : '', `(${m.total} shots, ${m.secs}s)`); });
        w.on('error', e => { console.log(n, 'ERROR', e.message); });
        w.on('exit', () => { live--; go(); }); } };
    go(); });
  console.log(`\n${done} holes in ${Math.round((Date.now() - t0) / 1000)}s`);
  if (args.includes('--write')) console.log('wrote', ROUTES.pathname);
} else if (!isMainThread){
  const { tour, n, cap } = workerData, C = P.buildLevel(n, tour), L = P.TOURS[tour].levels[n - 1], t = Date.now();
  /* THE OBVIOUS ROUTE is the best line that never goes through the hole's secret, and it sets par. A
     hole with a secret is searched again free, one stroke short of the obvious route, and that line has to
     be found (and so has to use the secret). */
  const avoid = (C.secret || []).length > 0;
  // search one stroke past par - 1, so a hole that is too hard says by how much
  const r = solve(C, cap || Math.max(L.par, 3), null, avoid);
  const s = avoid && r.line && r.strokes > 1 ? solve(C, r.strokes - 1) : null;
  /* THREE STARS: two under the par this hole should carry. A par 3 the search did not already ace gets
     the fine ace search, recorded as :3; a longer hole has to make it on its secret line. */
  const par = Math.max(3, r.strokes + 1), best = Math.min(r.strokes, s && s.line ? s.line.length : Infinity);
  // PUTT_ACE_SEEDS names a JSON file of lines found earlier ({"main:7":[[ang, ft, t0]]}): a seed that still drops
  // with room for error is taken as it is, so a re-solve after a small change does not search the fan again
  const seeds = process.env.PUTT_ACE_SEEDS ? JSON.parse(fs.readFileSync(process.env.PUTT_ACE_SEEDS, 'utf8')) : {}, sd = seeds[tour + ':' + n];
  const seeded = sd && sd.length === 1 && !replay(C, sd) ? { strokes:1, total:0, line:sd } : null;
  const a = par === 3 && best > 1 && !L.three ? (seeded || aceSearch(C)) : null;
  const onReal = null;
  parentPort.postMessage({ strokes:r.strokes, total:r.total + (s ? s.total : 0) + (a ? a.total : 0), line:r.line || null, sc:s && s.line ? s.line : null, three:a && a.line ? a.line : null, onReal, secs:Math.round((Date.now() - t) / 1000) });
}
