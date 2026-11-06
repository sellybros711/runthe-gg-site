/* Every run starts and stops the way a player's does: the speed of every fielder, runner and base umpire as
 * drawn (Track.drawn: inplay-plan.js legDrawn), on every case check-inplay plans, 60 times a second.
 *
 *   node shut-the-door/lab/pipeline/check-gait.mjs              every case (pure: a few minutes)
 *   node shut-the-door/lab/pipeline/check-gait.mjs --sample N   about N of them (held at the ceilings' rate)
 *   node shut-the-door/lab/pipeline/check-gait.mjs --show N     print N of the worst of each
 *
 * The owner (2026-11-04): "It looks weird when players stop and start running." Drawn as the plan times it,
 * a straight ramp, every start had its whole push in its first frame (19 ft/s^2 for a fielder, 16 for a
 * runner) and lost it in one frame at top speed, every stop the same way round, and a pull up before a wait
 * braked from a sprint to standing in a third of a second (70 to 95 ft/s^2, three times what legs can do).
 * Four things are counted, on each run of each track, by who (fielder, runner, umpire):
 *
 *   moved   a body away from where the plan has him (the straight ramps) at one of his own moments: a
 *           catch, a throw, a throw taken, a cover, a reach, a tag; a runner's arrival, out, run and slide.
 *           Held to none: the drawn run is the plan's to the inch wherever the play is decided.
 *   kink    his acceleration changing by more than KINK ft/s^2 from one frame to the next while he runs (a
 *           push or a brake that comes in or goes in a frame)
 *   brake   a pull up harder than BRAKE ft/s^2 at its hardest (a dead stop: sprint to standing in a stride)
 *   push    a start harder than PUSH ft/s^2 at its hardest (one and a half times what a sprinter's first step
 *           gives)
 *
 * A drawn ramp's hardest push or brake is about one and a half times the straight ramp's even one (the same
 * change of speed in the same time, eased in and out), so a mild pull up can be harder at its peak than as
 * planned; what it loses is the step (and a ramp already hard as planned stays as planned, inplay-plan.js
 * HARD_PUSH, HARD_BRAKE). Every 20th case, 2026-11-04 (100,848 runs), main to this: the largest change in a
 * frame, median 16.3 to 3.3 ft/s^2; runs with a kink 98,047 to 11,905; peak push median 19.0 to 27.3 ft/s^2;
 * dead stops 875 to 566.
 *
 * A run that ends at full speed with nothing after it (inplay.js carries the body on and slows it) is not
 * counted at its end. Plays with each are held to CEILING, a ceiling that only comes down. The straight ramps
 * left are the runs with one of his own moments inside a ramp (a runner tagged as he pulls up), kept as
 * planned so the play is decided where the plan decides it.
 */
import { inplayCases } from './inplay-cases.mjs';
import { planPlay } from '../../3d/inplay-plan.js';
import { selection, holding, capStr } from './checkpoint.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? +process.argv[i + 1] : d; };
const SHOW = arg('--show', 0);
const all = [...inplayCases()];
const SEL = selection({ heldStride: 1, total: all.length });
export const FPS = 60, KINK = 8, BRAKE = 90, PUSH = 45, MOVED_FT = 0.01;
// measured on every case, 2026-11-04 (165,935 plays). Main before it, drawn straight: kink fielder 165,935
// (every play), kink runner 165,935, kink umpire 36,477, brake fielder 4,866, brake runner 10,133, push 0,
// moved 0. A ceiling that only comes down
// (kink fielder 81,432 to 76,958, 2026-11-06: a timed run with time to spare jogs, its push and pull up
// scaled to its pace, inplay-plan.js Track.arrive)
const CEILING = {
  'brake fielder': 3857,
  'brake runner': 6849,
  'kink fielder': 76958,
  'kink runner': 102480,
};

const dt = 1 / FPS;
const by = {}, worst = {};
let n = 0;
const note = (key, plays, v, tag) => { const b = (by[key] ||= { plays: 0, worst: 0 }); if (!plays.has(key)) { plays.add(key); b.plays++; } if (v > b.worst) b.worst = v; (worst[key] ||= []).push({ v, tag }); };
for (let i = 0; i < all.length; i += SEL.stride) {
  const c = all[i];
  const p = planPlay(c.pr, { bats: c.hand, basesBefore: c.bases0, id: c.id, ...c.align });
  n++;
  const plays = new Set(), tag = `#${i} ${c.pack} ${c.key}/${c.label} st ${c.st}`;
  const bodies = [];
  for (let k = 1; k <= 9; k++) {
    const tr = p.fielders[k], m = [];
    for (const a of tr.acts) m.push(a.t, a.tagAt);
    for (const sg of p.segs) if (sg.kind === 'throw') { if (sg.from === k) m.push(sg.t0); if (sg.to === k) m.push(sg.t1 - 0.1, sg.t1); }
    bodies.push(['fielder', tr, m]);
  }
  for (const r of p.runners) if (r.track && r.track.legs) bodies.push(['runner', r.track, [r.arrive, r.outAt, r.scoreAt, r.firstAt, r.slide]]);
  for (const k of [1, 2, 3]) if (p.umps && p.umps[k]) bodies.push(['umpire', p.umps[k], p.umps[k].acts.map((a) => a.t)]);
  for (const [who, tr, moments] of bodies) {
    // at his own moments: drawn against planned (the same track read as the plan reads it)
    for (const t of moments) {
      if (typeof t !== 'number' || !isFinite(t) || t > 100) continue;
      const a = tr.at(t); tr.drawn = false; const b = tr.at(t); tr.drawn = true;
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d > MOVED_FT) note(`moved ${who}`, plays, d, tag);
    }
    const groups = [...new Set(tr.legs.map((l) => l.g))];
    groups.forEach((g, gi) => {
      const last = gi === groups.length - 1, endsAtSpeed = !((g.dbe ?? g.be) > 0);
      const nx = groups[gi + 1], straightOn = nx && nx.t0 - (g.t0 + g.T) < 0.02 && !(nx.al > 0);
      const t1 = g.t0 + g.T - (endsAtSpeed && (last || !straightOn) ? 2 * dt : 0);
      let v0 = null, a0 = null, peakA = 0, peakB = 0, kink = 0;
      for (let t = g.t0; t <= t1 + 1e-9; t += dt) {
        const v = tr.at(t).spd;
        if (v0 != null) {
          const a = (v - v0) / dt;
          if (a0 != null) kink = Math.max(kink, Math.abs(a - a0));
          peakA = Math.max(peakA, a); peakB = Math.max(peakB, -a); a0 = a;
        }
        v0 = v;
      }
      if (g.total / g.T < 3) return;
      if (kink > KINK) note(`kink ${who}`, plays, kink, tag);
      if (peakB > BRAKE) note(`brake ${who}`, plays, peakB, tag);
      if (peakA > PUSH) note(`push ${who}`, plays, peakA, tag);
    });
  }
  if (n % 2000 === 0) process.stdout.write(`\r${n} cases`);
}
const HOLD = holding({ stride: SEL.stride, heldStride: 1, n, heldN: all.length, partial: false, shard: SEL.shard });
const held = HOLD.mode !== 'report';
let fails = 0;
console.log(`\nruns as drawn at ${FPS} frames a second, ${n} plays (every ${SEL.stride === 1 ? '' : SEL.stride + 'th '}case)`);
const keys = new Set([...Object.keys(by), ...Object.keys(CEILING), 'moved fielder', 'moved runner', 'moved umpire']);
for (const key of [...keys].sort()) {
  const b = by[key] || { plays: 0, worst: 0 };
  const cap = key.startsWith('moved') ? 0 : held ? HOLD.cap(CEILING[key] ?? 0) : Infinity;
  const over = b.plays > cap;
  if (over) fails += Math.ceil(b.plays - cap);
  const unit = key.startsWith('moved') ? 'ft' : 'ft/s^2';
  console.log(`  ${over ? 'FAIL' : 'ok  '} ${key.padEnd(16)} ${String(b.plays).padStart(7)} plays${cap !== Infinity ? ' (ceiling ' + capStr(cap) + ')' : ''}  worst ${b.worst.toFixed(key.startsWith('moved') ? 3 : 1)} ${unit}`);
}
if (SHOW) for (const [k, w] of Object.entries(worst)) for (const x of w.sort((a, b) => b.v - a.v).slice(0, SHOW)) console.log(`  ${k}: ${x.v.toFixed(2)} ${x.tag}`);
if (process.env.GAIT_CEILING) console.log('\nCEILING = ' + JSON.stringify(Object.fromEntries(Object.entries(by).filter(([k]) => !k.startsWith('moved')).map(([k, b]) => [k, b.plays]).sort())));
console.log(`\n${n} plays, ${fails} over the ceiling (${HOLD.label})`);
process.exit(fails ? 1 : 0);
