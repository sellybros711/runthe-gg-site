/* The running game as the scene stages it (3d/inplay-plan.js planSteal and planPickoff), against the
 * engine's call: seeded outings on every pack, every steal (safe or out) and every pickoff (safe or out)
 * the engine makes, each planned, and the moment the runner gets to the bag set against the moment the
 * tag goes on. Safe: he is on the bag a clear beat (GAP) before the tag. Out: the tag is on him a clear
 * beat before he gets there, and the ball not in the glove before he is on the bag. A close call may
 * look close, never the wrong way.
 *
 * Used by check-inplay.mjs (its last section). Pure: the same seeds plan the same plays.
 */
import { createRequire } from 'node:module';
import { readdirSync, readFileSync } from 'node:fs';
import { planSteal, planPickoff, BASE } from '../../3d/inplay-plan.js';

// (a runner doubled off on a ball in play: out before he is back on his bag, he walks off from there)
const doubledOff = (r, p) => p.kind !== 'pickoff' && p.kind !== 'steal' && r.out && r.outBase === r.from && r.outAt != null && r.outAt <= (r.arrive ?? Infinity);

const require = createRequire(import.meta.url);
const G = require('../../grade.js');
const E = require('../../engine.js');

// (seconds: a beat a phone shows, the runner's hand on the bag before the tag, or the tag before it)
export const GAP = 0.15;

/** The first moment he is on the bag: his track within half a foot of where his run ends, or on a slide
    (inplay.js begin: at second or third with the throw near him) his lead foot, `SLIDE_REACH` ahead of it
    once he is laid out (slide: the time his run ends). */
export const SLIDE_REACH = 5;
export function touchAt(tr, to, slide = null) {
  const end = tr.end, bag = BASE[to], reach = slide != null ? SLIDE_REACH : 0.5;
  const near = (p) => Math.hypot(p.x - end.x, p.y - end.y) < reach && Math.hypot(p.x - bag.x, p.y - bag.y) < reach + 3;
  // (laid out from 0.28 s before his run ends, inplay.js runner's slide: his foot is no further ahead before)
  for (let s = slide != null ? Math.max(0, slide - 0.28) : 0; s < 8; s += 0.005) if (near(tr.at(s))) return s;
  return Infinity;
}

/** [{ kind, pack, seed, out, margin, touch, tag, bad }] over `seeds` seeded outings on each pack. */
export function runningCases({ seeds = 40 } = {}) {
  const dir = new URL('../../data/packs/', import.meta.url);
  const out = [];
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
    const pack = JSON.parse(readFileSync(new URL(f, dir), 'utf8'));
    if (!pack.steal) continue;
    const model = new G.Model(pack);
    const bats = (o) => { try { return pack.scenario.batters[o.model.who(o.st)].bats || 'R'; } catch (e) { return 'R'; } };
    for (let sd = 1; sd <= seeds; sd++) {
      const o = E.createOuting(pack, { seed: sd, model });
      if (!o.run) continue;
      let i = 0;
      while (o.status === 'live' && i < 40) {
        // (a pickoff on every other live chance: the safe ones and the out ones)
        if (E.pickoffLive(o) && (sd + i) % 2 === 0) {
          const basesBefore = o.st.bases, b = bats(o);
          const po = E.pickoff(o).pickoff;
          if (!po.balk) out.push(judge('pickoff', f, sd, po.out, po.margin, planPickoff(po, { bats: b, basesBefore }), po.base));
          i++;
          continue;
        }
        const pr = E.throwPitch(o, { type: model.types[(sd + i) % model.types.length], cell: [0, 4, 20, 24, 12][(sd + i) % 5], q: 0.5 }).pitchResult;
        i++;
        const st = pr.steal;
        if (pr.result !== 'in_play' && st && (st.result === 'safe' || st.result === 'out')) out.push(judge('steal ' + st.to, f, sd, st.result === 'out', st.margin, planSteal(pr, { bats: 'R', id: pr.drawn ? pr.drawn.id : String(pr.n) }), st.to));
      }
    }
  }
  // (and every base, call and size of margin the engine can give, whether or not a seed above drew it:
  // a steal of third thrown out, a pickoff at second, a bang bang one either way)
  for (const m of [0, 0.02, 0.06, 0.11, 0.2, 0.4, 0.8, 1.3]) for (const isOut of [false, true]) {
    for (const to of [2, 3]) for (const pop of [1.8, 2.1]) {
      const st = { from: to - 1, to, result: isOut ? 'out' : 'safe', margin: isOut ? -m : m, catcher: { pop }, cover: to === 3 ? 5 : 4 };
      out.push(judge('steal ' + to, 'grid', pop, isOut, st.margin, planSteal({ result: 'ball', steal: st, bases: 1 << (to - 2) }, { bats: 'R', id: 'g' }), to));
    }
    for (const base of [1, 2, 3]) for (const bats of ['R', 'L']) {
      const po = { base, out: isOut, balk: false, margin: isOut ? m : -m };
      out.push(judge('pickoff', 'grid', 0, isOut, po.margin, planPickoff(po, { bats, basesBefore: 1 << (base - 1) }), base));
    }
  }
  return out;
}

/** Where a runner stops against his bag (the owner, 2026-11-02: he stops on the base; only the batter
    on first and a runner across the plate run through; a runner doubled off is out before he is back). Each runner who ends by a bag, his path as
    drawn: the plan's track, then the coast inplay.js adds past a run that ends at speed (tau 0.6 s, so
    0.6 x his speed there). Returns a problem for each one carried more than OVERRUN ft past the bag
    along his way in. */
export const OVERRUN = 1.2;
export function overrun(plan) {
  const bad = [];
  for (const r of plan.runners) {
    if (!r.track || r.scoreAt != null || !r.track.legs.length || doubledOff(r, plan)) continue;
    const e = r.track.end;
    const k = [1, 2, 3].find((b) => Math.hypot(e.x - BASE[b].x, e.y - BASE[b].y) < 8);
    if (!k || (r.batter && k === 1)) continue;
    const bag = BASE[k], free = r.track.free;
    // (his way in: from where he was a beat before his run ended)
    const a = r.track.at(Math.max(r.track.legs[0].t0, free - 0.4)), L = Math.hypot(bag.x - a.x, bag.y - a.y);
    if (L < 2) continue;
    const ux = (bag.x - a.x) / L, uy = (bag.y - a.y) / L;
    let worst = -Infinity;
    for (let s = Math.max(0, free - 0.6); s <= free + 1e-6; s += 0.01) { const q = r.track.at(s); worst = Math.max(worst, (q.x - bag.x) * ux + (q.y - bag.y) * uy); }
    const q = r.track.at(free - 1e-3);
    if (q.spd > 4 && q.head != null) worst = Math.max(worst, (e.x + Math.sin(q.head) * q.spd * 0.6 - bag.x) * ux + (e.y + Math.cos(q.head) * q.spd * 0.6 - bag.y) * uy);
    if (worst > OVERRUN) bad.push(`runner from ${r.from} carried ${worst.toFixed(1)} ft past ${k === 2 ? 'second' : k === 3 ? 'third' : 'first'} (wants ${OVERRUN})`);
  }
  return bad;
}

function judge(kind, pack, seed, isOut, margin, plan, base) {
  const r = plan.runners[0];
  // (the slide as inplay.js begin decides it)
  const slide = base >= 2 && (plan.segs.some((sg) => sg.kind === 'throw' && Math.abs(sg.t1 - r.arrive) < 0.6) || (r.out && r.outAt != null && r.arrive - r.outAt < 0.5));
  const touch = touchAt(r.track, base, slide ? r.arrive : null);
  const { tagAt: tag, tBall } = plan.pickoff || plan.steal;
  // (safe also means the ball did not beat him: a glove waiting on the bag with the ball in it reads as
  // out to anyone watching, whenever the tag goes on)
  const bad = isOut ? (tag + GAP > touch + 1e-6 ? `out, but his hand is on the bag ${(tag - touch).toFixed(2)} s before the tag (wants ${GAP})` : null)
    : touch + GAP > tag + 1e-6 ? `safe, but the tag is on him ${(touch - tag).toFixed(2)} s before he is on the bag (wants ${GAP})`
    : touch > tBall + 1e-6 ? `safe, but the ball is in the glove ${(touch - tBall).toFixed(2)} s before he is on the bag` : null;
  const over = overrun(plan);
  return { kind, pack, seed, out: isOut, margin, touch: +touch.toFixed(3), tag: +tag.toFixed(3), ball: +tBall.toFixed(3), bad: bad || over[0] || null };
}
