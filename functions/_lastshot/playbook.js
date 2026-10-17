/* THE PLAY, AS DRAWN. A play is where the five start and an ordered list of
 * steps. The clipboard (board.js) builds one; the sim runs one; the tests
 * write them by hand.
 *
 *   { spots: { O1: {x,y}, ... },
 *     steps: [ { kind: 'move',   who: 'O2', pts: [{x,y}, ...] },
 *              { kind: 'screen', who: 'O5', pts: [...] },
 *              { kind: 'pass',   from: 'O1', to: 'O2' },
 *              { kind: 'shoot',  who: 'O2' } ] }
 *
 * THE ORDER RULE (the copy a coach reads, ORDER_RULE below, is the short form):
 *
 *   1. Steps run in number order. Each one starts when the one before it is
 *      done: a move when he gets there, a screen once it is set (it then
 *      holds), a pass when it is caught.
 *   2. A cut that runs off a screen starts WITH that screen (or with the
 *      first of a stagger), so the cutter sets up his man while the screener
 *      gets there. He waits a step short of the screen until it is set, then
 *      comes off it shoulder to shoulder.
 *   3. The screener's own next move (the roll, the pop, a second screen)
 *      starts the moment the cutter has used his screen, not when the cut
 *      ends.
 *   4. A pass starts with the step before it and leaves as soon as the passer
 *      is free, timed to land where the receiver's route ends, as he gets
 *      there (at once if he is standing still).
 *   5. The shot goes up on the catch, or when the shooter's own route ends,
 *      after a catch and shoot or pull up gather. Not there by the bail-out
 *      mark and whoever has the ball throws it up.
 *
 * A cut "uses" a screen when its route passes within useReach feet of where
 * the screen is set, the screen was drawn earlier, and the screener has not
 * been given anything else to do in between. */
import { COURT, dist, toRim, isThree } from './court-geo.js';

export const IDS = Object.freeze(['O1', 'O2', 'O3', 'O4', 'O5']);

/* Two sentences for the player. Short, no dashes. */
export const ORDER_RULE = 'Steps run in order. A cut goes with the screen before it, the screener rolls once it is used, and the pass is timed to meet the cutter.';

export function emptyPlay(sc) {
  return { spots: JSON.parse(JSON.stringify(sc.spots)), steps: [] };
}

/* Who has the ball after the steps so far. */
export function holderAfter(sc, steps) {
  let h = sc.handler;
  for (const s of steps) if (s.kind === 'pass' && s.from === h) h = s.to;
  return h;
}

/* Where each player stands once the steps so far have run. */
export function spotsAfter(play, steps) {
  const at = JSON.parse(JSON.stringify(play.spots));
  for (const s of steps) if ((s.kind === 'move' || s.kind === 'screen') && s.pts.length) at[s.who] = { ...s.pts[s.pts.length - 1] };
  return at;
}

export function shooterOf(play) {
  const s = play.steps.find(s => s.kind === 'shoot');
  return s ? s.who : null;
}

/* Every reason a play cannot run, in plain words. Empty means Run It. */
export function problems(sc, play) {
  const out = [];
  const shots = play.steps.filter(s => s && s.kind === 'shoot');
  if (shots.length === 0) out.push('Pick a shooter.');
  if (shots.length > 1) out.push('One shooter only.');
  let h = sc.handler;
  play.steps.forEach((s, i) => {
    if (!s || !s.kind) { out.push('Step ' + (i + 1) + ' is broken.'); return; }
    if (s.kind === 'pass') {
      if (s.from !== h) out.push('Step ' + (i + 1) + ': ' + s.from + ' does not have the ball.');
      else if (s.to === s.from || !IDS.includes(s.to)) out.push('Step ' + (i + 1) + ': pass to a teammate.');
      else h = s.to;
    } else if (s.kind === 'shoot') {
      if (s.who !== h) out.push(s.who + ' needs the ball to shoot.');
      if (i !== play.steps.length - 1) out.push('The shot is the last step.');
    } else if (s.kind === 'move' || s.kind === 'screen') {
      if (!IDS.includes(s.who) || !Array.isArray(s.pts) || !s.pts.length) out.push('Step ' + (i + 1) + ' has no route.');
    } else out.push('Step ' + (i + 1) + ' is broken.');
  });
  return out;
}

/* A stable key for a play, for the seed and the debug panel. */
export function playKey(play) {
  const r = n => Math.round(n * 10) / 10;
  const spots = IDS.map(id => r(play.spots[id].x) + ',' + r(play.spots[id].y)).join(';');
  const steps = play.steps.map(s => s.kind[0] + (s.who || s.from + s.to) + (s.pts ? ':' + s.pts.map(p => r(p.x) + ',' + r(p.y)).join(' ') : '')).join('|');
  return spots + '#' + steps;
}

/* ---------- polylines ---------- */
export const pathLen = pts => pts.reduce((s, p, i) => i ? s + dist(pts[i - 1], p) : 0, 0);

/* The point at arc length a along pts. */
export function pointAt(pts, a) {
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = dist(pts[i - 1], pts[i]);
    if (acc + d >= a) { const k = d ? (a - acc) / d : 0; return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * k, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * k }; }
    acc += d;
  }
  return { ...pts[pts.length - 1] };
}

/* The closest approach of pts to q: { d, along }. */
export function closest(pts, q) {
  let best = { d: dist(pts[0], q), along: 0 }, acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy, L = Math.sqrt(L2);
    const t = L2 ? Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.y - a.y) * dy) / L2)) : 0;
    const d = Math.hypot(q.x - (a.x + t * dx), q.y - (a.y + t * dy));
    if (d < best.d - 1e-9) best = { d, along: acc + t * L };
    acc += L;
  }
  return best;
}

/* The piece of pts between arc lengths a0 and a1, as the points to run to
   (the start point is where he already is, so it is left out). */
function slice(pts, a0, a1) {
  const out = [];
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    acc += dist(pts[i - 1], pts[i]);
    if (acc > a0 + 1e-6 && acc < a1 - 1e-6) out.push({ ...pts[i] });
  }
  out.push(pointAt(pts, a1));
  return out;
}

/* ---------- the plan: what each step waits for ---------- */

/* For every step: where it starts from, the screens a cut runs off, its
   route cut into parts at the screens it waits for, and its start rule.
     start: { mode: 'first' }                  the very first step
            { mode: 'done', of: i }            when step i is done
            { mode: 'with', of: i }            together with step i
            { mode: 'started', of: i }         as soon as step i has started
            { mode: 'used', screen: i, by: j } when cut j has used screen i
   Names come out of the drawing (nameScreen), so the clipboard can label a
   play before it runs and the sim says the same words when it does. */
export function planOf(sc, play) {
  const T = sc.tuning, steps = play.steps;
  const plan = steps.map((s, i) => ({ i, s, from: null, uses: [], parts: null, start: null, group: null, usedBy: [], name: null }));

  // where each route starts, and the screens each cut runs off
  steps.forEach((s, j) => {
    if (s.kind !== 'move' && s.kind !== 'screen') return;
    const from = spotsAfter(play, steps.slice(0, j))[s.who];
    const route = [from, ...s.pts];
    plan[j].from = from; plan[j].route = route; plan[j].len = pathLen(route);
    for (let i = 0; i < j; i++) {
      const sc2 = steps[i];
      if (sc2.kind !== 'screen' || sc2.who === s.who) continue;
      // the screener must still be there: nothing else drawn for him in between
      if (steps.slice(i + 1, j).some(t => (t.kind === 'move' || t.kind === 'screen') && t.who === sc2.who)) continue;
      const at = sc2.pts[sc2.pts.length - 1];
      const c = closest(route, at);
      if (c.d > (T.useReach ?? 5)) continue;
      // a route that only walks away from a screen it starts on is not using it
      if (c.along < 0.5 && dist(route[route.length - 1], at) > dist(from, at) + 1 && dist(from, at) > 2.5) continue;
      plan[j].uses.push({ screen: i, at, along: c.along });
      plan[i].usedBy.push(j);
    }
    plan[j].uses.sort((a, b) => a.along - b.along);
    // cut the route at each wait point
    const parts = [];
    let a0 = 0, waits = [];
    for (const u of plan[j].uses) {
      const w = Math.max(0, u.along - (T.waitBack ?? 2));
      if (w > a0 + 0.3) { parts.push({ pts: slice(route, a0, w), waitFor: waits, a0, a1: w }); a0 = w; waits = []; }
      waits.push(u.screen);
    }
    parts.push({ pts: slice(route, a0, plan[j].len), waitFor: waits, a0, a1: plan[j].len });
    plan[j].parts = parts;
  });

  // start rules
  steps.forEach((s, j) => {
    const p = plan[j];
    if (p.start) return;
    if (j === 0) { p.start = { mode: 'first' }; }
    else if (s.kind === 'pass' || s.kind === 'shoot') p.start = { mode: 'started', of: j - 1 };
    else {
      // the screener's next move: when his screen has been used
      const prior = lastRouteOf(steps, j, s.who);
      const pr = prior != null ? plan[prior] : null;
      const cutJustBefore = pr && steps[prior].kind === 'screen' && pr.usedBy.length && pr.usedBy.includes(j - 1);
      if (cutJustBefore) p.start = { mode: 'used', screen: prior, by: j - 1 };
      else p.start = { mode: 'done', of: j - 1 };
    }
    // a cut and the screens drawn right before it that it runs off go together
    if (s.kind === 'move' || s.kind === 'screen') {
      let k = j - 1;
      const used = new Set(p.uses.map(u => u.screen));
      while (k >= 0 && steps[k].kind === 'screen' && used.has(k) && plan[k].start.mode !== 'used') k--;
      const lead = k + 1;
      if (lead < j) {
        for (let m = lead + 1; m <= j; m++) { plan[m].start = { mode: 'with', of: lead }; plan[m].group = lead; }
        plan[lead].group = lead;
      }
    }
  });
  // a step that waits on "done" of a group member waits on the whole group
  for (const p of plan) if (p.start && p.start.mode === 'done' && plan[p.start.of].group != null) {
    const g = plan[p.start.of].group;
    p.start = { mode: 'done', of: p.start.of, group: plan.filter(q => q.group === g).map(q => q.i) };
  }

  // names for the screens, from the drawing
  steps.forEach((s, j) => {
    for (const u of plan[j].uses) u.name = nameScreen(sc, play, plan, j, u);
    if (plan[j].uses.length) plan[j].name = plan[j].uses.length > 1 ? 'stagger' : plan[j].uses[0].name;
  });
  steps.forEach((s, j) => {
    if (s.kind === 'pass' && isHandoff(play, plan, j)) plan[j].name = 'handoff';
  });
  return plan;
}

function lastRouteOf(steps, j, who) {
  for (let i = j - 1; i >= 0; i--) if ((steps[i].kind === 'move' || steps[i].kind === 'screen') && steps[i].who === who) return i;
  return null;
}

/* What a coach would call the screen at plan[j].uses[u]. */
export function nameScreen(sc, play, plan, j, u) {
  const steps = play.steps, s = steps[j], P = plan[j];
  if (P.uses.length > 1) return 'stagger';
  const holder = holderAfter(sc, steps.slice(0, j));
  const sStep = steps[u.screen], screenerFrom = plan[u.screen].from;
  if (holder === s.who) {
    // a ball screen: what does the screener do next?
    const next = steps.findIndex((t, k) => k > j && (t.kind === 'move' || t.kind === 'screen') && t.who === sStep.who);
    if (next >= 0) {
      const end = steps[next].pts[steps[next].pts.length - 1];
      if (toRim(end) <= 9) return 'pick and roll';
      if (isThree(end) || toRim(end) >= 17) return 'pick and pop';
    }
    return 'ball screen';
  }
  const route = P.route, S = u.at;
  const before = pointAt(route, Math.max(0, u.along - 4)), goal = route[route.length - 1];
  const ball = spotsAfter(play, steps.slice(0, j))[holder];
  const inward = toRim(goal) < toRim(before) - 5;
  if (inward) {
    const highPost = Math.abs(S.x - COURT.RIM.x) < 10 && S.y > 12 && S.y < 25;
    return before.y >= 21 && highPost ? 'UCLA screen' : 'back screen';
  }
  if (before.y < 15 && goal.y < 19 && Math.abs(goal.x - before.x) > 8) return 'cross screen';
  // a flare: the screen is on the ball side and he fades away from the ball
  const away = dist(goal, ball) > dist(before, ball) + 3 && dist(S, ball) < dist(before, ball) + 1;
  if (away && toRim(goal) >= toRim(before) - 2 && Math.abs(goal.x - before.x) > Math.abs(goal.y - before.y) * 0.6) return 'flare screen';
  const downward = screenerFrom ? S.y < screenerFrom.y - 1 : true;
  if (toRim(goal) > toRim(before) + 2 || goal.y > before.y + 3) {
    if (before.y < 12 && downward) return 'pin-down';
    return 'down screen';
  }
  return 'screen';
}

/* A pass to a man running right past the passer: a dribble handoff. */
function isHandoff(play, plan, j) {
  const s = play.steps[j];
  const at = spotsAfter(play, play.steps.slice(0, j));
  let r = null;
  for (let k = j - 1; k >= 0; k--) { const t = play.steps[k]; if ((t.kind === 'move' || t.kind === 'screen') && t.who === s.to) { r = plan[k]; break; } }
  if (!r || !r.route) return false;
  const c = closest(r.route, at[s.from]);
  return c.d <= 4 && c.along > 2 && c.along < r.len - 1;
}

/* For the clipboard: a short label per step ('pin-down', 'roll', 'handoff'),
   or null. */
export function labelsOf(sc, play) {
  let plan;
  try { plan = planOf(sc, play); } catch (e) { return play.steps.map(() => null); }
  return plan.map(p => {
    if (p.name) return p.name;
    if (p.start && p.start.mode === 'used') {
      const end = p.s.pts[p.s.pts.length - 1];
      return toRim(end) <= 9 ? 'roll' : isThree(end) || toRim(end) >= 17 ? 'pop' : null;
    }
    return null;
  });
}
