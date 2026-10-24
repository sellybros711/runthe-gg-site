#!/usr/bin/env node
/* THE TRICK SHOT ROOMS' ROUTES: the fairest shortest route through each of the Clubhouse's gyms (gymkinds/trickshot.js).
 *
 *   node golf/putt/trick.mjs                    every room: its fewest strokes, the fairest route of that length
 *   node golf/putt/trick.mjs --only clubhouse2
 *   node golf/putt/trick.mjs --write            and record it: moves and proof in the kind file, trick:<id> in routes.json
 *
 * A trick shot room is a putting puzzle: numbered bottles that go down only in order, then a cup whose lid comes off once
 * the last one is down. The kind's own solve() (the one check-putt runs) finds the fewest strokes on a coarse fan. This
 * then searches finer, on every core, for the route of that length a person plays best: every putt has to knock its
 * bottles down (or drop) with a birdie putt's room for error (a degree of aim, most of a foot of pace, a beat either
 * side), and of those the route whose worst putt fails least often for a person's error (fair.mjs's: 2 degrees, 8% pace,
 * 0.12 s) is kept. Every putt is at full precision.
 *
 * check-putt replays the recorded route (replayTrick) and holds every putt of it to the same two tests.
 */
import fs from 'node:fs';
import os from 'node:os';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { loadGyms } from './gyms-node.mjs';

const GL = loadGyms(), K = GL.kind('trickshot');
// fair.mjs's person, copied: fair.mjs runs its own work when loaded off the main thread (check-putt holds the two equal)
export const NOISE = { aim:2 * Math.PI / 180, pace:0.08, t:0.12 };
export function gym(id){ return GL.byId(id); }
export function rooms(){ return GL.GYMS.filter(G => G.kind === 'trickshot'); }
/* one putt in a room with tk bottles down */
export function tshot(G, x, y, a, ft, t, tk){ return K.roll(G, x, y, tk, { a, ft, t }); }
const did = (G, r, want) => !r.water && !r.out && (want > G.bottles.length ? r.holed : (r.tk | 0) >= want && !r.holed);
function rng(seed){ let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function gauss(r){ let u = 0, v = 0; while (!u) u = r(); while (!v) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
/* how often a person's version of this putt fails to do its job (seeded, so a number moves only when the room does) */
export function failRate(G, x, y, a, ft, t, tk, want, N = 160, seed = 9001){ const r = rng(seed); let bad = 0;
  for (let k = 0; k < N; k++){ const s = tshot(G, x, y, a + gauss(r) * NOISE.aim, Math.max(1, ft * (1 + gauss(r) * NOISE.pace)), Math.max(0, t + gauss(r) * NOISE.t), tk); if (!did(G, s, want)) bad++; }
  return bad / N; }
/* a route, replayed: each putt does what it did when recorded (knocks bottles down, or drops) with room for error, the
   last drops, and it is inside the limit. null if it holds, or why it does not. */
export function replayTrick(G, line){ const n = G.bottles.length; let s = GL.init(G);
  if (!line || !line.length) return 'no putts'; if (line.length > G.limit) return `${line.length} putts is over the room's limit of ${G.limit}`;
  for (let i = 0; i < line.length; i++){ const m = line[i], o = K.after(G, s, m), r = o.r, last = i === line.length - 1;
    if (r.water || r.out) return `putt ${i + 1} goes out`;
    if (last){ if (!r.holed) return `putt ${i + 1} does not drop`; if (!K.robust(G, s, m, n + 1)) return `putt ${i + 1} drops but only to the pixel`; return null; }
    if (r.holed) return `putt ${i + 1} drops early`;
    if ((r.tk | 0) <= s.tk) return `putt ${i + 1} knocks nothing down`;
    if (!K.robust(G, s, m, r.tk)) return `putt ${i + 1} knocks bottle ${r.tk} down but only to the pixel`;
    s = o.s; }
  return 'no putts'; }
/* each putt of a route: how often a person's version of it fails to do its job */
export function trickRates(G, line, N = 160){ const n = G.bottles.length, out = []; let s = GL.init(G);
  line.forEach((m, i) => { const o = K.after(G, s, m), want = i === line.length - 1 ? n + 1 : (o.r.tk | 0); out.push(failRate(G, s.x, s.y, m.a, m.ft, m.t, s.tk, want, N, 9001 + i * 77)); s = o.s; });
  return out; }
export const banksOf = r => K.banksOf(r);

/* THE FINE SEARCH, a place at a time on a worker: a fan a degree apart and paces two feet apart (eight moments where
   something moves); of each outcome a sample is tested for room for error and a person's error. */
export function expand(G, f){ const n = G.bottles.length, TM = K.timed(G), T0 = TM ? [0, 0.4, 0.8, 1.2, 1.6, 2.0, 2.4, 2.8] : [0], cands = [], out = []; let total = 0;
  for (const dt of T0) for (let d = 0; d < 360; d++){ const a = d * Math.PI / 180;
    for (let ft = 3; ft <= 33; ft += 2){ const t = f.s.t + dt, r = tshot(G, f.s.x, f.s.y, a, ft, t, f.s.tk); total++;
      if (r.water || r.out) continue; const want = r.holed ? n + 1 : (r.tk | 0); if (!r.holed && want <= f.s.tk) continue;
      if (G.banks && !r.holed && K.banksOf(r) !== G.banks) continue;
      cands.push({ a, ft, t, want }); } }
  const by = {}; for (const c of cands) (by[c.want] = by[c.want] || []).push(c);
  for (const w of Object.keys(by)){ const L = by[w], step = Math.max(1, Math.floor(L.length / 120)); let kept = 0;
    for (let i = 0; i < L.length && kept < 16; i += step){ const c = L[i], m = { a:c.a, ft:c.ft, t:c.t };
      if (!K.robust(G, f.s, m, c.want)) continue; const fr = failRate(G, f.s.x, f.s.y, c.a, c.ft, c.t, f.s.tk, c.want, 50); if (fr > 0.3) continue; kept++;
      out.push({ s:K.after(G, f.s, m).s, line:f.line.concat([m]), worst:Math.max(f.worst, fr) }); } }
  return { nodes:out, total }; }
export async function fairest(G, cap, opt = {}){ const KEEP = opt.keep || 8, jobs = opt.jobs || Math.max(1, os.cpus().length);
  const pool = []; for (let i = 0; i < jobs; i++) pool.push(new Worker(new URL(import.meta.url), { workerData:{ id:G.id } }));
  const run = (w, f) => new Promise(res => { w.once('message', res); w.postMessage(f); });
  let front = [{ s:GL.init(G), line:[], worst:0 }], total = 0, best = null;
  try { for (let depth = 1; depth <= cap; depth++){ const q = front.slice(), got = [];
      await Promise.all(pool.map(async w => { while (q.length){ const r = await run(w, q.shift()); total += r.total; got.push(...r.nodes); } }));
      const fin = got.filter(g => g.s.h), next = got.filter(g => !g.s.h);
      if (fin.length){ fin.sort((p, q2) => p.worst - q2.worst); best = { strokes:depth, line:fin[0].line, worst:fin[0].worst, total }; break; }
      next.sort((p, q2) => (q2.s.tk - p.s.tk) || (p.worst - q2.worst)); front = [];
      for (const nd of next){ if (front.length >= KEEP) break; if (front.some(k => k.s.tk === nd.s.tk && Math.hypot(k.s.x - nd.s.x, k.s.y - nd.s.y) < 0.8)) continue; front.push(nd); }
      if (opt.trace) console.log('  after', depth, front.map(k => `${k.s.tk} down at (${k.s.x.toFixed(1)},${k.s.y.toFixed(1)}) worst ${Math.round(k.worst * 100)}%`).join('  '));
      if (!front.length) break; } }
  finally { pool.forEach(w => w.terminate()); }
  return best || { strokes:Infinity, total }; }
if (!isMainThread && workerData && workerData.id){ const G = GL.byId(workerData.id); parentPort.on('message', f => parentPort.postMessage(expand(G, f))); }

if (isMainThread && process.argv[1] && process.argv[1].endsWith('trick.mjs')){
  const args = process.argv.slice(2), only = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',') : null;
  const KFILE = new URL('./gymkinds/trickshot.js', import.meta.url), ROUTES = new URL('./routes.json', import.meta.url);
  for (const G of rooms()){ if (only && !only.includes(G.id)) continue; const t = Date.now();
    const s = GL.solve(G), fr = s.ok ? await fairest(G, s.moves, { trace:args.includes('--trace') }) : null;
    console.log(G.id.padEnd(11), G.name.padEnd(16), 'fewest', s.ok ? s.moves : 'NONE', 'recorded', G.moves, 'limit', G.limit, s.ok && G.limit !== s.moves + 2 ? '  WANT LIMIT ' + (s.moves + 2) : '', `(${Math.round((Date.now() - t) / 1000)}s)`);
    if (!fr || !fr.line){ console.log('   no fair route of', s.moves, 'strokes'); continue; }
    if (fr.strokes < s.moves) console.log('   THE FINE SEARCH FOUND', fr.strokes, 'STROKES: solve() misses it');
    const line = fr.line, hz = trickRates(G, line), pf = K.enc(line);
    console.log('   proof', pf); console.log('   a person fails:', hz.map(h => Math.round(h * 100) + '%').join(' '), '  replay:', replayTrick(G, line) || 'ok');
    if (args.includes('--write') && fr.strokes === s.moves){
      let src = fs.readFileSync(KFILE, 'utf8'); const at = src.indexOf("{ id:'" + G.id + "'"), m0 = src.indexOf('moves:', at), p1 = src.indexOf("',", src.indexOf("proof:'", at)) + 2;
      src = src.slice(0, m0) + 'moves:' + s.moves + ', proof:\'' + pf + '\',' + src.slice(p1); fs.writeFileSync(KFILE, src);
      const all = JSON.parse(fs.readFileSync(ROUTES, 'utf8')); all['trick:' + G.id] = JSON.parse(pf);
      fs.writeFileSync(ROUTES, '{\n' + Object.keys(all).map(k => '  ' + JSON.stringify(k) + ':' + JSON.stringify(all[k])).join(',\n') + '\n}\n');
      console.log('   wrote', G.id, 'into gymkinds/trickshot.js and routes.json'); } }
}
