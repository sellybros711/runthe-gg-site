// ace by construction:  node golf/putt/ace.mjs <tour> <n>
// prints the kit (a backstop and a dish, or a bank board and a dish) and the ace line, for PUTT_ACE_SEEDS.
// Ace by construction. Find the putts that pass near the cup, put a backstop board and a dish where
// that ball arrives, and keep the first one that drops with room for error.
import { createRequire } from 'module';
const S = await import('./solve.mjs'); const P = createRequire(import.meta.url)(process.env.PUTT_SRC || './putt.js');
const [tour, n] = process.argv.slice(2), L = P.TOURS[tour].levels[+n - 1], f0 = L.f, h = P.lvKit;
const build = extra => { L.f = T => { const H = f0(T); if (extra) extra(H, T); return H; }; const C = P.buildLevel(+n, tour); L.f = f0; return C; };
const C0 = build(null), TM = S.timed(C0), [cx, cy] = C0.cup, tx = C0.tee[0], ty = C0.tee[1], t = Date.now();
const T0 = TM ? [0, 0.45, 0.9, 1.35, 1.8, 2.25, 2.7, 3.15] : [0];
const near = r => { let m = 1e9, k = -1; r.pts.forEach((p, i) => { const d = Math.hypot(p[0] - cx, p[1] - cy); if (d < m){ m = d; k = i; } }); return [m, k]; };
const fine = (C, a0, f0b, t0) => { for (const dt of TM ? [-0.2, -0.1, 0, 0.1, 0.2] : [0]) for (let da = -1.2; da <= 1.2; da += 0.15) for (let df = -2; df <= 2; df += 0.25){
  const a = a0 + da * Math.PI / 180, ft = Math.min(44, Math.max(3, f0b + df)), tt = Math.max(0, t0 + dt);
  if (S.shot(C, tx, ty, a, ft, tt).holed && S.robust(C, tx, ty, a, ft, tt)) return [[a, ft, tt]]; } return null; };
const cand = [];
for (const t0 of T0) for (let d = 0; d < 360; d++) for (let ft = 4; ft <= 38; ft += 2){ const a = d * Math.PI / 180, r = S.shot(C0, tx, ty, a, ft, t0);
  if (r.water || r.out) continue; const [m, k] = r.holed ? [0, -1] : near(r); if (m < 2.5) cand.push({ m, a, ft, t0, r, k }); }
// prefer moderate pace: a catcher is for a putt that arrives with some life, not a slammed one
cand.sort((p, q) => (p.m + p.ft * 0.02) - (q.m + q.ft * 0.02));
let res = null, used = null; const seen = [];
for (const c of cand){ if (res || seen.length >= 14) break;
  if (seen.some(q => Math.abs(q.a - c.a) < 0.05 && Math.abs(q.ft - c.ft) < 4 && q.t0 === c.t0)) continue; seen.push(c);
  let dx, dy; if (c.k > 0){ const p = c.r.pts, i0 = Math.max(0, c.k - 3), i1 = Math.min(p.length - 1, c.k + 1); dx = p[i1][0] - p[i0][0]; dy = p[i1][1] - p[i0][1]; } else { dx = cx - tx; dy = cy - ty; }
  const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
  for (const kk of [null, [1.7, 1.8, 2.2, 0.15], [2.0, 2.2, 2.6, 0.17]]){
    if (!kk){ const ace = fine(C0, c.a, c.ft, c.t0); if (ace){ res = ace; used = 'none'; break; } continue; }
    const [back, len, bs, ba] = kk, kit = { back, len, bs, ba, dx:+dx.toFixed(3), dy:+dy.toFixed(3) };
    const ex = (H, T) => { const bx = cx + kit.dx * back, by = cy + kit.dy * back; h.board(H, T, bx - kit.dy * len, by + kit.dx * len, bx + kit.dy * len, by - kit.dx * len, 0.35); h.bowl(H, cx, cy, bs, ba); };
    const C = build(ex); const ace = fine(C, c.a, c.ft, c.t0);
    if (ace){ res = ace; used = kit; break; } } }
// BANK BY CONSTRUCTION: where the obvious first putt stops, a board angled by the mirror rule sends a firmer
// putt along that same line off it toward the cup. A dish and a backstop catch it.
if (!res){ const R = JSON.parse(createRequire(import.meta.url)('fs').readFileSync(new URL('./routes.json', import.meta.url), 'utf8'))[tour + ':' + n];
  if (R && R.length >= 2){ const [a1, f1, t1] = R[0], r1 = S.shot(C0, tx, ty, a1, f1, t1), A = r1.rest, pts = r1.pts;
    let k = pts.length - 1; while (k > 0 && Math.hypot(pts[k][0] - A[0], pts[k][1] - A[1]) < 1.2) k--;
    let ix = A[0] - pts[k][0], iy = A[1] - pts[k][1]; const il = Math.hypot(ix, iy) || 1; ix /= il; iy /= il;
    for (const ahead of [0.4, 1.0, 1.8]){ if (res) break;
      const Px = A[0] + ix * ahead, Py = A[1] + iy * ahead; let ox = cx - Px, oy = cy - Py; const ol = Math.hypot(ox, oy); ox /= ol; oy /= ol;
      let nx = ox - ix, ny = oy - iy; const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl; const ux = -ny, uy = nx, half = 1.6;
      const bx = Px - nx * 0.3, by = Py - ny * 0.3;
      for (const [back, len, bs, ba] of [[1.7, 1.8, 2.2, 0.15], [2.0, 2.2, 2.6, 0.17]]){ if (res) break;
        const kit = { bank:[+(bx - ux * half).toFixed(2), +(by - uy * half).toFixed(2), +(bx + ux * half).toFixed(2), +(by + uy * half).toFixed(2)], back, len, bs, ba, dx:+ox.toFixed(3), dy:+oy.toFixed(3) };
        const ex = (H, T) => { h.board(H, T, kit.bank[0], kit.bank[1], kit.bank[2], kit.bank[3], 0.35); const qx = cx + kit.dx * back, qy = cy + kit.dy * back; h.board(H, T, qx - kit.dy * len, qy + kit.dx * len, qx + kit.dy * len, qy - kit.dx * len, 0.35); h.bowl(H, cx, cy, bs, ba); };
        const C = build(ex);
        outer: for (const dt of TM ? [-0.3, -0.15, 0, 0.15, 0.3] : [0]) for (let da = -1.5; da <= 1.5; da += 0.15) for (let ft = f1 + 2; ft <= 44; ft += 0.5){
          const a = a1 + da * Math.PI / 180, tt = Math.max(0, t1 + dt), r = S.shot(C, tx, ty, a, ft, tt);
          if (r.holed && S.robust(C, tx, ty, a, ft, tt)){ res = [[a, ft, tt]]; used = kit; break outer; } } } } } }
console.log(JSON.stringify({ k:tour + ':' + n, ace:res, kit:used, cup:[cx, cy], s:Math.round((Date.now() - t) / 1000) }));
