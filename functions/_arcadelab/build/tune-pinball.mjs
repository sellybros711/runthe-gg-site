/* Pinball probe: a bot plays real balls through the real sim and reports
 * whether the table holds together. It is the stress test the brief asks for:
 *   - no ball ever leaves the table (no tunnelling through a wall or flipper)
 *   - no ball sits slow for six seconds outside a cradle
 *   - replay of a recorded run lands on the same score, and how long it takes
 * Run: node functions/_arcadelab/build/tune-pinball.mjs [balls] */
import * as P from '../games/pinball/sim.js';
import { CONFIG as C } from '../games/pinball/config.js';
import { mulberry32 } from '../shared/seed.js';

const N = Number(process.argv[2] || 1000);
const MAIN = import.meta.url === 'file://' + process.argv[1];

/* A bot that reads the ball and flips; skill 0..1 changes its timing error. */
export function playGame(seed, skill, opts = {}) {
  const s = P.create(seed), r = mulberry32(seed ^ 0x9e3779b9), inputs = [];
  const give = inp => { if (P.applyInput(s, { f: s.frame, ...inp })) inputs.push({ f: s.frame, ...inp }); };
  const holdUntil = [0, 0];
  let maxSlow = 0, escapes = 0, lowest = 0;
  while (!s.over && s.frame < P.MAX_FRAMES) {
    const b = s.b;
    if (P.waiting(s)) give({ k: 'P', p: opts.fullPlunge ? 1 : Math.floor(r() * 100) / 100 });
    for (let i = 0; i < 2; i++) {
      const f = s.flippers[i], key = i ? 'R' : 'L';
      const near = b.y > 138 && b.y < 166 && b.vy > -20 && (i === 0 ? b.x < 49 && b.x > 22 : b.x > 47 && b.x < 74);
      if (!f.held && near && r() < 0.15 + 0.6 * skill) { give({ k: key + '1' }); holdUntil[i] = s.frame + 6 + Math.floor(r() * 10); }
      else if (f.held && s.frame >= holdUntil[i]) give({ k: key + '0' });
    }
    if (opts.nudge && r() < 0.002) give({ k: 'N' });
    P.step(s);
    if (!s.b.rest && (s.b.x < 4 - 1 || s.b.x > 97 + 1 || s.b.y < -1)) escapes++;
    maxSlow = Math.max(maxSlow, s.slow);
  }
  return { s, inputs, maxSlow, escapes };
}

/* Fast balls fired every way from open table, with the flippers flapping:
   the tunnelling test. A crossing is the ball ending a frame on the other side
   of a wall or flipper than it began it, inside the segment's length. */
function blast(n) {
  const r = mulberry32(91);
  const segs = s => [...P.WALLS.filter(w => w.tag !== 'gate').map(w => [w.ax, w.ay, w.bx, w.by]),
    ...s.flippers.map(f => { const t = P.flipperTip(f); return [f.px, f.py, t.x, t.y]; })];
  const sideOf = (g, x, y) => { const ex = g[2] - g[0], ey = g[3] - g[1]; return { t: ((x - g[0]) * ex + (y - g[1]) * ey) / (ex * ex + ey * ey), s: Math.sign(ex * (y - g[1]) - ey * (x - g[0])) }; };
  let crossings = 0, escapes = 0, frames = 0;
  for (let i = 0; i < n; i++) {
    const s = P.create(1000 + i);
    s.b.rest = false; s.b.inLane = false;
    s.b.x = 10 + r() * 76; s.b.y = 25 + r() * 80;   // open table, above the slings
    const a = r() * Math.PI * 2; s.b.vx = Math.cos(a) * C.MAX_SPEED; s.b.vy = Math.sin(a) * C.MAX_SPEED;
    for (let f = 0; f < 240; f++) {
      if (f % 7 === 0) { s.flippers[0].held = r() < 0.5; s.flippers[1].held = r() < 0.5; }
      const before = segs(s).map(g => sideOf(g, s.b.x, s.b.y));
      P.step(s); frames++;
      if (s.ball > 0 || s.over) break;
      if (s.b.x < 3 || s.b.x > 98 || s.b.y < -1) { escapes++; break; }
      segs(s).forEach((g, k) => { const a2 = sideOf(g, s.b.x, s.b.y), b1 = before[k];
        if (b1.s && b1.t > 0.05 && b1.t < 0.95 && a2.t > 0.05 && a2.t < 0.95 && a2.s !== b1.s) crossings++; });
    }
  }
  return { balls: n, frames, crossings, escapes };
}

if (MAIN) main();
export { blast };
function main() {
const t0 = Date.now();
const out = [];
for (const skill of [0.2, 0.6, 1]) {
  let balls = 0, esc = 0, maxSlow = 0, scores = [], life = [];
  for (let g = 0; balls < N / 3; g++) {
    const res = playGame(5000 + g * 7 + skill * 1000, skill, { nudge: true });
    balls += res.s.perBall.length; esc += res.escapes; maxSlow = Math.max(maxSlow, res.maxSlow);
    scores.push(res.s.score); res.s.perBall.forEach(b => life.push(b.frames / 60));
  }
  scores.sort((a, b) => a - b); life.sort((a, b) => a - b);
  const q = (a, p) => a[Math.floor(a.length * p)];
  out.push(`skill ${skill}: ${balls} balls, escapes ${esc}, longest slow ${(maxSlow / 60).toFixed(2)}s, ball life p50 ${q(life, .5).toFixed(1)}s p90 ${q(life, .9).toFixed(1)}s, score p50 ${q(scores, .5)} p90 ${q(scores, .9)}`);
}
console.log(out.join('\n'));
console.log('blast', JSON.stringify(blast(N)));
const g = playGame(4242, 0.7, { nudge: true });
const t1 = performance.now(); const rep = P.replay(4242, g.inputs); const t2 = performance.now();
console.log('replay', rep.score === g.s.score ? 'matches' : 'MISMATCH ' + rep.score + ' vs ' + g.s.score, 'frames', rep.frames, 'inputs', g.inputs.length, 'ms', (t2 - t1).toFixed(1));
console.log('total s', ((Date.now() - t0) / 1000).toFixed(1));
}
