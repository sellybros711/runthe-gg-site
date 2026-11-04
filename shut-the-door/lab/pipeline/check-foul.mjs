/* Every foul the engine calls, as the scene draws it (3d/foul.js): the ball off the bat flies foul and
 * stays in foul ground, back into the backstop or the seats behind it, or out past a line into the low
 * wall or the stands, and never out over fair ground toward the field.
 *
 *   node shut-the-door/lab/pipeline/check-foul.mjs            seeded outings on every pack, and the grid
 *   node shut-the-door/lab/pipeline/check-foul.mjs --seeds N  N seeded outings a pack (default 30)
 *   node shut-the-door/lab/pipeline/check-foul.mjs --show N   print the first N problems in full
 *
 * The owner (2026-11-03): "When a foul ball is hit, the ball looks like it is hit in play. It needs to
 * go backwards or sideways like a foul ball does." Until then every foul in the game flew one path,
 * 65 mph at 62 degrees nearly straight back (the engine gives a foul no batted ball, and the old
 * reading fell back to that): from the pitcher's eye a ball shooting straight up over the hitter,
 * still climbing when the pitch ended, which is a pop up in play.
 *
 * The cases: every foul in `seeds` seeded outings on every pack (the engine's own PitchResult: the
 * drawn pitch's id, the pitch's number, where it crossed, the hitter's side), each met at three points
 * along the plate (out in front, over it, deep), at the height it crossed. And the grid: each of the
 * four shapes forced, for a hitter of each side, at every crossing of GX, over 60 ids each (so the
 * hash spreads each shape over its whole range of speed, angle and curl).
 *
 * Fails when, at any moment of its flight (to foul.js SPAN, 4 s):
 *   it is more than NEAR ft from the plate's back point and not in foul ground (behind the back point
 *     or outside the lines)
 *   it leaves the bat less than MIN_FOUL degrees foul of a line (or not behind the plate)
 *   it is beyond the front of the stands (the backstop, the low wall) without having gone over it, or
 *     in the seats below them, or below the ground
 *   it goes through the backstop net (beyond it below the net's top)
 *   it goes higher than TOP ft, or leaves the bat slower than 50 mph or faster than 105
 *   at the end of the scene's play (TAIL s after contact, stage.js) it hangs near the hitter: not yet
 *     LEFT ft from the plate nor landed (on the ground, the seats, the dugout)
 * and, over the seeded fouls, when the shapes do not mix (any shape under MIX of them), when a pick
 * is not the same twice, or when a foul would start the ball in play broadcast (only in_play or a
 * steal safe or out stages one, stage.js playOnce: no fielder chases a foul).
 */
import { createRequire } from 'node:module';
import { readdirSync, readFileSync } from 'node:fs';
import { foulLaunch, foulFlight, foulAt, foulFront, isFoul, SHAPES, BALL_R, NET_ARC, NET_H, PAD_H, WALL_LOW, SEAT_RISE } from '../../3d/foul.js';

const require = createRequire(import.meta.url);
const G = require('../../grade.js');
const E = require('../../engine.js');

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? +process.argv[i + 1] : d; };
const SEEDS = arg('--seeds', 30), SHOW = arg('--show', 0);
export const NEAR = 12, MIN_FOUL = 10, TOP = 120, TAIL = 1.5, LEFT = 40, MIX = 0.06;
const GX = [-1.5, -1.1, -0.75, -0.4, 0, 0.4, 0.75, 1.1, 1.5];
// where along the plate it is met (catcher's view y, feet: out in front, over it, deep)
const MEET_Y = [2.6, 1.0, -0.6];

/** What is wrong with one foul's drawn flight: a list of problems (empty when it is right). */
export function judge(L, c) {
  const bad = [];
  if (!(L.ev >= 50 && L.ev <= 105)) bad.push(`off the bat at ${L.ev} mph`);
  const a = Math.abs(L.spray);
  if (!(a >= 45 + MIN_FOUL)) bad.push(`leaves the bat ${(a - 45).toFixed(1)} degrees foul (wants ${MIN_FOUL})`);
  const fl = foulFlight(c, L), p = { x: 0, y: 0, z: 0 };
  const overAt = (fl.hits.find((h) => h.what === 'over' || h.what === 'dugout') || { t: Infinity }).t;
  let top = 0;
  for (let i = 0; i < fl.n; i++) {
    const t = i * fl.dt, x = fl.xyz[i * 3], y = fl.xyz[i * 3 + 1], z = fl.xyz[i * 3 + 2];
    const r = Math.hypot(x, y), th = Math.atan2(x, y) * 180 / Math.PI;
    top = Math.max(top, z);
    if (r > NEAR && !isFoul(x, y)) { bad.push(`in fair ground ${r.toFixed(0)} ft out at ${t.toFixed(2)} s (${x.toFixed(1)}, ${y.toFixed(1)})`); break; }
    if (z < BALL_R - 1e-3) { bad.push(`under the ground at ${t.toFixed(2)} s`); break; }
    if (Math.abs(th) > 45) {
      const f = foulFront(th), past = r - f;
      if (past > 1 && t < overAt) { bad.push(`through the front of the stands at ${t.toFixed(2)} s (${past.toFixed(1)} ft past it, ${z.toFixed(1)} ft up)`); break; }
      const wallTop = Math.abs(th) >= NET_ARC ? PAD_H : WALL_LOW;
      if (past > 1 && t >= overAt && fl.hits.some((h) => h.what === 'over') && z < wallTop + SEAT_RISE * past - 0.5) { bad.push(`into the seats at ${t.toFixed(2)} s`); break; }
    }
  }
  for (const h of fl.hits) if (h.what === 'over') {
    const q = foulAt(fl, h.t, p), th = Math.abs(Math.atan2(q.x, q.y) * 180 / Math.PI);
    if (th >= NET_ARC && q.z < NET_H) bad.push(`over the net at ${q.z.toFixed(1)} ft (the net is ${NET_H})`);
  }
  if (top > TOP) bad.push(`goes ${top.toFixed(0)} ft up (wants under ${TOP})`);
  const e = foulAt(fl, TAIL, p), landed = fl.hits.some((h) => h.t <= TAIL && ['ground', 'roll', 'seats', 'dugout', 'net', 'wall'].includes(h.what));
  if (Math.hypot(e.x, e.y) < LEFT && !landed && e.z < 20) bad.push(`still by the plate when the play ends (${e.x.toFixed(0)}, ${e.y.toFixed(0)}, ${e.z.toFixed(0)})`);
  const end = foulAt(fl, 1e9, p);
  if (Math.hypot(end.x, end.y) > NEAR && !isFoul(end.x, end.y)) bad.push('ends in fair ground');
  return { bad, end: fl.end, top };
}

const problems = [], byShape = Object.fromEntries(SHAPES.map((s) => [s, 0])), ends = {};
let n = 0, fouls = 0, failed = 0;
const take = (src, L, c, extra) => {
  n++;
  const j = judge(L, c);
  ends[j.end] = (ends[j.end] || 0) + 1;
  if (j.bad.length) { failed++; if (problems.length < 2000) problems.push({ src, L, c, ...extra, bad: j.bad }); }
};

// the engine's fouls, seeded outings on every pack
const dir = new URL('../../data/packs/', import.meta.url);
const perPack = [];
for (const f of readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
  const pack = JSON.parse(readFileSync(new URL(f, dir), 'utf8'));
  const model = new G.Model(pack);
  const batterOf = (o) => { try { return pack.scenario.batters[o.model.who(o.st)] || {}; } catch (e) { return {}; } };
  let k = 0, bad0 = failed;
  for (let sd = 1; sd <= SEEDS; sd++) {
    const o = E.createOuting(pack, { seed: sd, model });
    let i = 0;
    while (o.status === 'live' && i < 60) {
      const b = batterOf(o);
      const pr = E.throwPitch(o, { type: model.types[(sd + i) % model.types.length], cell: [12, 6, 8, 16, 18, 2, 22, 10, 14][(sd + i) % 9], q: 0.5 }).pitchResult;
      i++;
      if (pr.result !== 'foul') continue;
      k++; fouls++;
      const id = pr.drawn ? pr.drawn.id : null, bats = b.bats || 'R';
      const L = foulLaunch({ id, n: pr.n, x: pr.actual.x, bats });
      const again = foulLaunch({ id, n: pr.n, x: pr.actual.x, bats });
      if (JSON.stringify(L) !== JSON.stringify(again)) problems.push({ src: f, bad: ['the pick is not the same twice'] }), failed++;
      byShape[L.shape]++;
      // (no broadcast: stage.js stages one for a ball in play or a steal safe or out, and nothing else)
      if (pr.inPlay || (pr.steal && (pr.steal.result === 'safe' || pr.steal.result === 'out'))) { failed++; problems.push({ src: f, bad: ['a foul that would start the ball in play broadcast'] }); }
      const zt = b.szTop ?? 3.4, zb = b.szBot ?? 1.6, z = zb + pr.actual.zn * (zt - zb);
      for (const y of MEET_Y) take(f, L, { x: pr.actual.x, y, z }, { seed: sd, n: pr.n, id });
    }
  }
  perPack.push([f, k, failed - bad0]);
}

// the grid: every shape, both sides, every crossing, many ids
let grid = 0;
for (const shape of SHAPES) for (const bats of ['R', 'L']) for (const x of GX) for (let k = 0; k < 60; k++) {
  const L = foulLaunch({ id: `grid:${k}`, n: k, x, bats, shape });
  for (const y of MEET_Y) for (const z of [0.6, 2.5, 4.4]) { take('grid', L, { x, y, z }); grid++; }
}

for (const [f, k, b] of perPack) console.log(`${b ? 'FAIL' : 'ok  '} ${f}: ${k} fouls, ${b} flights wrong`);
const mixBad = SHAPES.filter((s) => fouls && byShape[s] / fouls < MIX);
console.log(`shapes over ${fouls} seeded fouls: ${SHAPES.map((s) => `${s} ${(100 * byShape[s] / Math.max(1, fouls)).toFixed(0)}%`).join(', ')}${mixBad.length ? `  FAIL: under ${MIX * 100}%: ${mixBad.join(', ')}` : ''}`);
console.log(`where they end (4 s): ${Object.entries(ends).map(([k, v]) => `${k} ${v}`).join(', ')}`);
for (const p of problems.slice(0, Math.max(SHOW, Math.min(8, problems.length)))) console.log('  ', JSON.stringify(p));
const ok = !failed && !mixBad.length && fouls > 0;
console.log(`${ok ? 'ok  ' : 'FAIL'} check-foul: ${n} flights (${fouls} seeded fouls x ${MEET_Y.length} meet points, ${grid} grid), ${failed} wrong`);
process.exit(ok ? 0 : 1);
