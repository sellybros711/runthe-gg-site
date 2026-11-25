/* Run The Course: the simulation.
 *
 * One state object, advanced on a fixed tick. Pure and deterministic: no
 * DOM, no clock, no Math.random, and only the maths rng.js allows. The page,
 * the headless script, the tests and the server all run this file. The
 * renderer only reads the state.
 *
 *   newCourse(cfg, map, seed)        a new course: the persistent record
 *   startShift(course, cfg, map)     the state of one shift, from a course
 *   command(S, type, a, b)           queue a player action (the only way in)
 *   step(S, ctx)                     one tick
 *   endShift(S, ctx)                 the result, and the course after it
 *   replay(course, log, cfg, map)    a whole shift from its command log
 *   goalOf(S, ctx)                   the one line that says what to do next
 *
 * ctx is { cfg, map, route, fx }: the config, the map, the route graph built
 * from the open holes, and an optional callback the page uses for effects.
 *
 * Golfers never path-find. They walk a graph made from the hole list, hold a
 * tee until the hole ahead is clear, and a watchdog moves on any group that
 * has not advanced in cfg.shift.watchdogS. A group can never block the course. */
import { rngNext, rngPick, mixSeed, HEADINGS, dist, clamp, checksum } from './rng.js?v=1';
import { holeGeom, playHole } from './shot.js?v=1';

/* ---- the round and the route, both made from the list of open holes ---- */

/* Which holes a round plays, in order. Three holes are played twice. Four to
   eight are played once, then from the start again to reach at least six. A
   nine is played once, or twice for an 18 hole tee time. Eighteen once. */
export function roundPlan(openOrds, twice) {
  const n = openOrds.length, out = openOrds.slice();
  if (n === 0) return out;
  if (n >= 9) return n < 18 && twice ? out.concat(openOrds) : out;
  if (n <= 3) { while (out.length < 6) out.push(...openOrds); return out.slice(0, Math.max(6, n * 2)); }
  for (let i = 0; out.length < 6; i++) out.push(openOrds[i % n]);
  return out;
}

export function buildRoute(map, openOrds) {
  const holes = {};
  for (const h of map.holes) {
    const segs = [];
    let len = 0;
    for (let i = 1; i < h.line.length; i++) {
      const l = dist(h.line[i - 1].x, h.line[i - 1].y, h.line[i].x, h.line[i].y);
      segs.push(l); len += l;
    }
    const tee = h.line[0], green = h.line[h.line.length - 1];
    holes[h.ord] = { ord: h.ord, par: h.par, line: h.line, segs, len, tee, green,
      wait: { x: tee.x + map.teeWait.dx, y: tee.y + map.teeWait.dy } };
  }
  return { holes, open: openOrds.slice(), first: openOrds[0], plan: roundPlan(openOrds, false) };
}
function onLine(h, f, out) {
  let d = clamp(f, 0, 1) * h.len;
  for (let i = 0; i < h.segs.length; i++) {
    if (d <= h.segs[i] || i === h.segs.length - 1) {
      const t = h.segs[i] > 0 ? d / h.segs[i] : 0;
      out.x = h.line[i].x + (h.line[i + 1].x - h.line[i].x) * t;
      out.y = h.line[i].y + (h.line[i + 1].y - h.line[i].y) * t;
      return out;
    }
    d -= h.segs[i];
  }
  return out;
}

/* ---- the course: what persists between shifts ---- */

export function newCourse(cfg, map, seed) {
  return {
    schema: cfg.schema, seed: seed | 0, name: 'Your Course', tier: 'muni',
    cash: cfg.economy.startCash, stars: cfg.stars.start, reviews: [], shiftsFiled: 0,
    unlocks: {},
    holes: map.holes.map(h => ({ ord: h.ord, par: h.par, open: map.openAtStart.includes(h.ord),
      green: cfg.stars.greenStart, fairway: cfg.stars.fairwayStart }))
  };
}
/* A course from an older schema, brought forward. One step a version. */
export function migrateCourse(c, cfg) {
  if (!c || typeof c !== 'object') return null;
  if (!c.schema) c.schema = 1;
  /* schema 1 is the first. A later schema adds its step here. */
  return c.schema === cfg.schema ? c : null;
}
export function starsOf(reviews, cfg) {
  const w = cfg.stars.window, r = reviews.slice(-w);
  let sum = cfg.stars.start * (w - r.length);
  for (const v of r) sum += v;
  return Math.round(sum / w * 100) / 100;
}
export const goalFor = (shiftNo, cfg) => {
  let g = cfg.economy.goalDay1;
  for (let i = 1; i < shiftNo; i++) g *= cfg.economy.goalGrowth;
  return Math.round(g / 10) * 10;
};
export function clockOf(S, cfg) {
  const sh = cfg.shift, r = sh.tick, dawn = sh.dawnS * r, open = sh.openS * r;
  let h;
  if (S.tick < dawn) h = sh.clockOpen - 1 + S.tick / dawn;
  else h = sh.clockOpen + Math.min(1, (S.tick - dawn) / open) * (sh.clockClose - sh.clockOpen);
  const hh = Math.floor(h), mm = Math.floor((h - hh) * 6) * 10;
  return hh + ':' + (mm < 10 ? '0' : '') + mm;
}

/* ---- one shift ---- */

export function startShift(course, cfg, map) {
  const sh = cfg.shift, r = sh.tick, no = course.shiftsFiled + 1;
  const open = course.holes.filter(h => h.open).map(h => h.ord);
  const S = {
    schema: cfg.schema, v: cfg.version, no, seed: mixSeed(course.seed, no), rng: 0,
    tick: 0, phase: 'dawn', done: false, debug: false,
    cash: course.cash, cash0: course.cash, goal: goalFor(no, cfg),
    stars: course.stars, stars0: course.stars, reviews: course.reviews.slice(),
    open, greens: {}, mow: {},
    player: { x: map.start.x, y: map.start.y, vx: 0, vy: 0, mode: 'walk', dir: -1, gx: 0, gy: 0, go: false, clear: true },
    cart: { x: map.cartPark.x, y: map.cartPark.y }, mower: { x: map.mowerPark.x, y: map.mowerPark.y },
    groups: [], queue: [], teeQ: {}, busy: {}, lastTee: -100000,
    pads: {}, plot: null, carts: course.unlocks.cart_barn === 'done',
    work: { id: null, t: 0 },
    tally: { rounds: 0, golfers: 0, fees: 0, refunds: 0, tips: 0, spent: 0, walkOffs: 0, roundS: 0, low: 0, stuck: 0, cutOff: 0, aces: 0 },
    log: [], pending: []
  };
  S.rng = S.seed;
  for (const h of course.holes) if (h.open) { S.greens[h.ord] = h.green; S.mow[h.ord] = 0; S.teeQ[h.ord] = []; S.busy[h.ord] = 0; }
  for (const id in cfg.economy.pads) {
    const u = course.unlocks[id];
    S.pads[id] = { st: u || 'open', t: 0 };
    if (cfg.economy.pads[id].kind === 'hole' && u === 'clearing') S.plot = makePlot(map, cfg.economy.pads[id].hole);
  }
  /* The tee sheet: bookings scale with the star rating. */
  const g = cfg.golfers;
  const n = Math.max(2, Math.round(g.groupsDay1 * (1 + g.bookingsPerStar * (course.stars - cfg.stars.start))));
  const span = (sh.lastTeeS - sh.firstTeeS) / Math.max(1, n - 1);
  for (let i = 0; i < n; i++) addGroup(S, cfg, Math.round((sh.dawnS + sh.firstTeeS + span * i + (rngNext(S) - 0.5) * span * 0.4) * r));
  /* A thin tee sheet lowers the goal: it is always within reach of good service. */
  let booked = 0;
  for (const q of S.groups) booked += q.size;
  const reach = Math.floor(booked * cfg.economy.feePerHole * roundPlan(open, false).length * cfg.economy.goalShare / 5) * 5;
  if (reach < S.goal) S.goal = reach;
  return S;
}
function addGroup(S, cfg, arrive) {
  const g = cfg.golfers;
  let rr = rngNext(S), size = 1;
  for (let i = 0; i < g.sizeOdds.length; i++) { size = i + 1; rr -= g.sizeOdds[i]; if (rr < 0) break; }
  const golfers = [];
  for (let i = 0; i < size; i++) golfers.push(rngPick(S, g.tierOdds));
  const grp = { id: S.groups.length + 1, size, golfers, pace: rngPick(S, g.paceOdds), look: Math.floor(rngNext(S) * 1000),
    st: 'sched', arrive, x: 0, y: 0, path: [], pi: 0, hi: 0, ord: 0, sent: false, paid: 0,
    wc: 0, wt: 0, wo: 0, t0: 0, t1: 0, shots: null, scores: [], tot: null, check: 0, adv: arrive, cart: false };
  S.groups.push(grp);
  return grp;
}
function makePlot(map, ord) {
  const h = map.holes.find(x => x.ord === ord), pts = [];
  for (let i = 1; i < h.line.length; i++) {
    const a = h.line[i - 1], b = h.line[i], l = dist(a.x, a.y, b.x, b.y), n = Math.max(1, Math.round(l / 6));
    for (let k = i === 1 ? 0 : 1; k <= n; k++) pts.push({ x: a.x + (b.x - a.x) * k / n, y: a.y + (b.y - a.y) * k / n, done: false });
  }
  return { ord, pts, left: pts.length };
}

/* The only way a player changes anything: a command, stamped with its tick. */
export function command(S, type, a, b) {
  const c = b !== undefined ? [S.tick, type, a, b] : a !== undefined ? [S.tick, type, a] : [S.tick, type];
  S.log.push(c); S.pending.push(c);
}
function applyCommand(S, c, ctx) {
  const p = S.player, t = c[1];
  if (t === 'dir') { const h = c[2] | 0; p.dir = h >= 0 && h < 16 ? h : -1; p.go = false; }
  else if (t === 'goto') {
    const b = ctx.map.bounds, x = +c[2], y = +c[3];
    if (x === x && y === y) { p.gx = clamp(x, b.x0, b.x1); p.gy = clamp(y, b.y0, b.y1); p.go = true; p.dir = -1; }
  }
  else if (t === 'exit') { if (p.mode !== 'walk') { p.mode = 'walk'; p.clear = false; p.vx = 0; p.vy = 0; p.x += 1.8; p.go = false; p.dir = -1; } }
  else if (t === 'cash') { S.debug = true; S.cash += clamp(c[2] | 0, 0, 100000); }
  else if (t === 'spawn') { S.debug = true; addGroup(S, ctx.cfg, S.tick + 1); }
}

const TMP = { x: 0, y: 0 };

export function step(S, ctx) {
  if (S.done) return;
  const cfg = ctx.cfg, sh = cfg.shift, r = sh.tick, dt = 1 / r;
  while (S.pending.length && S.pending[0][0] <= S.tick) applyCommand(S, S.pending.shift(), ctx);

  const dawnEnd = sh.dawnS * r, openEnd = dawnEnd + sh.openS * r;
  if (S.phase === 'dawn' && S.tick >= dawnEnd) S.phase = 'open';
  if (S.phase === 'open' && S.tick >= openEnd) S.phase = 'closing';

  movePlayer(S, ctx, dt);
  work(S, ctx, dt);

  let active = 0;
  for (let i = 0; i < S.groups.length; i++) {
    const g = S.groups[i];
    if (g.st === 'gone') continue;
    if (g.st === 'sched') { if (S.tick >= g.arrive) arriveGroup(S, g, ctx); active++; continue; }
    active++;
    updateGroup(S, g, ctx, dt);
    if (g.st !== 'gone' && S.tick - g.adv > sh.watchdogS * r) {
      /* The watchdog. Nothing legitimate waits this long, so this is a bug
         somewhere else, and the group is sent home rather than left standing. */
      S.tally.stuck++; release(S, g); leave(S, g, ctx, false);
    }
  }
  for (const id in S.pads) {
    const pad = S.pads[id];
    if (pad.st === 'building' && cfg.economy.pads[id].kind === 'unlock') {
      pad.t -= dt;
      if (pad.t <= 0) { pad.st = 'done'; pad.t = 0; if (id === 'cart_barn') S.carts = true; if (ctx.fx) ctx.fx('built', ctx.map.pads[id].x, ctx.map.pads[id].y, id); }
    }
  }
  S.tick++;
  if (S.phase === 'closing') {
    if (active === 0) S.done = true;
    else if (S.tick >= openEnd + sh.closeMaxS * r) {
      for (const g of S.groups) if (g.st !== 'gone') { S.tally.cutOff++; g.st = 'gone'; }
      S.done = true;
    }
  }
}

function movePlayer(S, ctx, dt) {
  const p = S.player, sh = ctx.cfg.shift, map = ctx.map;
  const speed = p.mode === 'cart' ? sh.cart : p.mode === 'mower' ? sh.mower : sh.walk;
  let wx = 0, wy = 0;
  if (p.go) {
    const d = dist(p.x, p.y, p.gx, p.gy);
    if (d < 0.5) p.go = false;
    else {
      /* Tap to travel walks straight, and round a building by its nearest corner. */
      let tx = p.gx, ty = p.gy;
      if (around(p, tx, ty, map.clubhouse, TMP) || around(p, tx, ty, map.shed, TMP)) { tx = TMP.x; ty = TMP.y; }
      const dd = dist(p.x, p.y, tx, ty) || 1;
      wx = (tx - p.x) / dd * speed; wy = (ty - p.y) / dd * speed;
      if (tx === p.gx && ty === p.gy && d < speed * dt) { wx = (p.gx - p.x) / dt; wy = (p.gy - p.y) / dt; }
    }
  } else if (p.dir >= 0) { wx = HEADINGS[p.dir][0] * speed; wy = HEADINGS[p.dir][1] * speed; }
  const k = p.mode === 'cart' ? sh.cartDrift : p.mode === 'mower' ? sh.mowerDrift : 1;
  p.vx += (wx - p.vx) * k; p.vy += (wy - p.vy) * k;
  if (p.vx * p.vx + p.vy * p.vy < 0.0004) { p.vx = 0; p.vy = 0; }
  p.x += p.vx * dt; p.y += p.vy * dt;
  pushOut(p, map.clubhouse); pushOut(p, map.shed);
  p.x = clamp(p.x, map.bounds.x0, map.bounds.x1); p.y = clamp(p.y, map.bounds.y0, map.bounds.y1);
  if (p.mode === 'cart') { S.cart.x = p.x; S.cart.y = p.y; }
  else if (p.mode === 'mower') { S.mower.x = p.x; S.mower.y = p.y; }
  else {
    const dc = dist(p.x, p.y, S.cart.x, S.cart.y), dm = dist(p.x, p.y, S.mower.x, S.mower.y);
    if (!p.clear) { if (dc > sh.leaveR && dm > sh.leaveR) p.clear = true; }
    else if (dc < sh.enterR) { p.mode = 'cart'; p.x = S.cart.x; p.y = S.cart.y; p.go = false; if (ctx.fx) ctx.fx('ride', p.x, p.y, 'cart'); }
    else if (dm < sh.enterR) { p.mode = 'mower'; p.x = S.mower.x; p.y = S.mower.y; p.go = false; if (ctx.fx) ctx.fx('ride', p.x, p.y, 'mower'); }
  }
  /* Mowing: the mower on a green restores it after enough contact. */
  if (p.mode === 'mower') {
    const R = map.draw.greenR;
    for (let i = 0; i < S.open.length; i++) {
      const ord = S.open[i], gr = ctx.route.holes[ord].green;
      if (S.greens[ord] < 100 && dist(p.x, p.y, gr.x, gr.y) <= R) {
        S.mow[ord] += dt;
        if (S.mow[ord] >= sh.rings.mow) { S.greens[ord] = 100; S.mow[ord] = 0; if (ctx.fx) ctx.fx('mown', gr.x, gr.y, ord); }
      }
    }
    if (S.plot && S.plot.left > 0) {
      for (const q of S.plot.pts) if (!q.done && dist(p.x, p.y, q.x, q.y) < 3) { q.done = true; S.plot.left--; }
      if (S.plot.left === 0) { for (const id in S.pads) if (S.pads[id].st === 'clearing') S.pads[id].st = 'building'; if (ctx.fx) ctx.fx('cleared', p.x, p.y, S.plot.ord); }
    }
  }
}
/* Does the straight walk from (ax, ay) to (bx, by) cross the box, grown by m? */
function crosses(ax, ay, bx, by, box, m) {
  const x0 = box.x - box.w / 2 - m, x1 = box.x + box.w / 2 + m, y0 = box.y - box.d / 2 - m, y1 = box.y + box.d / 2 + m;
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dy = by - ay;
  if (dx === 0) { if (ax <= x0 || ax >= x1) return false; }
  else { let a = (x0 - ax) / dx, b = (x1 - ax) / dx; if (a > b) { const c = a; a = b; b = c; } if (a > t0) t0 = a; if (b < t1) t1 = b; }
  if (dy === 0) { if (ay <= y0 || ay >= y1) return false; }
  else { let a = (y0 - ay) / dy, b = (y1 - ay) / dy; if (a > b) { const c = a; a = b; b = c; } if (a > t0) t0 = a; if (b < t1) t1 = b; }
  return t0 < t1;
}
/* If the box is in the way, the corner to walk to first (into out). */
function around(p, gx, gy, box, out) {
  if (!crosses(p.x, p.y, gx, gy, box, 0.75)) return false;
  const m = 1.5, hw = box.w / 2 + m, hd = box.d / 2 + m;
  let best = 1e9, found = false;
  for (let i = 0; i < 4; i++) {
    const cx = box.x + (i & 1 ? hw : -hw), cy = box.y + (i & 2 ? hd : -hd);
    if (crosses(p.x, p.y, cx, cy, box, 0.75)) continue;
    const c = dist(p.x, p.y, cx, cy) + dist(cx, cy, gx, gy) + (crosses(cx, cy, gx, gy, box, 0.75) ? 1000 : 0);
    if (c < best) { best = c; out.x = cx; out.y = cy; found = true; }
  }
  return found;
}
function pushOut(p, box) {
  const m = 0.7, x0 = box.x - box.w / 2 - m, x1 = box.x + box.w / 2 + m, y0 = box.y - box.d / 2 - m, y1 = box.y + box.d / 2 + m;
  if (p.x <= x0 || p.x >= x1 || p.y <= y0 || p.y >= y1) return;
  const l = p.x - x0, rr = x1 - p.x, b = p.y - y0, t = y1 - p.y, mn = Math.min(l, rr, b, t);
  if (mn === l) p.x = x0; else if (mn === rr) p.x = x1; else if (mn === b) p.y = y0; else p.y = y1;
}

/* ---- stand-to-work rings ---- */

/* Every ring on the property, and whether it has work right now. */
export function stations(S, ctx, out) {
  const map = ctx.map, sh = ctx.cfg.shift, pads = ctx.cfg.economy.pads;
  out.length = 0;
  const head = S.queue.length ? S.groups[S.queue[0] - 1] : null;
  out.push({ id: 'checkin', x: map.counter.x, y: map.counter.y, r: sh.ringR, secs: sh.rings.checkin, can: !!head && head.st === 'queue' });
  out.push({ id: 'sendoff', x: map.teeRing.x, y: map.teeRing.y, r: sh.ringR, secs: sh.rings.sendoff, can: !!unsent(S, ctx) });
  for (const id in pads) {
    const st = S.pads[id].st;
    if (st === 'open' || st === 'building' || st === 'clearing') {
      out.push({ id, x: map.pads[id].x, y: map.pads[id].y, r: sh.padR, secs: sh.rings.pad, pad: true, st,
        can: st === 'open' && S.cash >= pads[id].cost });
    }
  }
  return out;
}
function unsent(S, ctx) {
  const q = S.teeQ[ctx.route.first];
  if (!q) return null;
  for (let i = 0; i < q.length; i++) { const g = S.groups[q[i] - 1]; if (g.hi === 0 && !g.sent) return g; }
  return null;
}
const ST = [];
function work(S, ctx, dt) {
  const p = S.player, w = S.work;
  let at = null;
  if (p.mode !== 'mower') {
    stations(S, ctx, ST);
    for (let i = 0; i < ST.length; i++) if (ST[i].can && dist(p.x, p.y, ST[i].x, ST[i].y) <= ST[i].r) { at = ST[i]; break; }
  }
  if (!at) { w.id = null; w.t = 0; return; }
  if (w.id !== at.id) { w.id = at.id; w.t = 0; }
  w.t += dt;
  if (w.t < at.secs) return;
  w.id = null; w.t = 0;
  if (at.id === 'checkin') checkIn(S, ctx);
  else if (at.id === 'sendoff') { const g = unsent(S, ctx); if (g) { g.sent = true; g.adv = S.tick; if (ctx.fx) ctx.fx('sent', at.x, at.y, g.id); } }
  else buyPad(S, ctx, at.id);
}
function checkIn(S, ctx) {
  const cfg = ctx.cfg, g = S.groups[S.queue.shift() - 1], map = ctx.map;
  g.paid = g.size * cfg.economy.feePerHole * ctx.route.plan.length;
  S.cash += g.paid; S.tally.fees += g.paid;
  g.check = S.tick; g.adv = S.tick; g.st = 'toTee'; g.ord = ctx.route.plan[0];
  g.path = map.waypoints.toTee.concat([ctx.route.holes[g.ord].wait]); g.pi = 0;
  if (ctx.fx) ctx.fx('cash', map.counter.x, map.counter.y, g.paid);
  requeue(S, ctx);
}
function buyPad(S, ctx, id) {
  const pad = ctx.cfg.economy.pads[id];
  if (S.pads[id].st !== 'open' || S.cash < pad.cost) return;
  S.cash -= pad.cost; S.tally.spent += pad.cost;
  if (pad.kind === 'hole') { S.pads[id].st = 'clearing'; S.plot = makePlot(ctx.map, pad.hole); }
  else { S.pads[id].st = 'building'; S.pads[id].t = pad.buildS; }
  if (ctx.fx) ctx.fx('pad', ctx.map.pads[id].x, ctx.map.pads[id].y, id);
}

/* ---- groups ---- */

function arriveGroup(S, g, ctx) {
  const map = ctx.map;
  g.st = 'toQueue'; g.x = map.gate.x; g.y = map.gate.y; g.adv = S.tick;
  S.queue.push(g.id); requeue(S, ctx);
}
function requeue(S, ctx) {
  const q = ctx.map.queue;
  for (let i = 0; i < S.queue.length; i++) {
    const g = S.groups[S.queue[i] - 1];
    g.path = [{ x: q.x + q.dx * i, y: q.y + q.dy * i }]; g.pi = 0;
  }
}
function walk(g, speed, dt) {
  let left = speed * dt;
  while (g.pi < g.path.length) {
    const t = g.path[g.pi], d = dist(g.x, g.y, t.x, t.y);
    if (d > left) { g.x += (t.x - g.x) / d * left; g.y += (t.y - g.y) / d * left; return false; }
    g.x = t.x; g.y = t.y; left -= d; g.pi++;
  }
  return true;
}
function release(S, g) {
  let i = S.queue.indexOf(g.id); if (i >= 0) S.queue.splice(i, 1);
  for (const ord in S.teeQ) { i = S.teeQ[ord].indexOf(g.id); if (i >= 0) S.teeQ[ord].splice(i, 1); if (S.busy[ord] === g.id) S.busy[ord] = 0; }
}
function walkOff(S, g, ctx) {
  release(S, g); requeue(S, ctx);
  if (g.paid) { S.cash -= g.paid; S.tally.refunds += g.paid; if (ctx.fx) ctx.fx('refund', g.x, g.y, g.paid); g.paid = 0; }
  S.tally.walkOffs++;
  S.reviews.push(ctx.cfg.stars.walkOffReview); S.stars = starsOf(S.reviews, ctx.cfg);
  if (ctx.fx) ctx.fx('walkoff', g.x, g.y, g.id);
  g.st = 'off'; g.path = [ctx.map.gate]; g.pi = 0; g.adv = S.tick;
}
function leave(S, g, ctx, finished) {
  g.st = finished ? 'leave' : 'off'; g.path = finished ? [ctx.map.shopExit, ctx.map.gate] : [ctx.map.gate]; g.pi = 0; g.adv = S.tick;
}
function updateGroup(S, g, ctx, dt) {
  const cfg = ctx.cfg, gc = cfg.golfers, sh = cfg.shift, st = g.st;
  const speed = g.cart ? sh.golferCart : sh.golferWalk;
  if (st === 'toQueue') { if (walk(g, speed, dt)) { g.st = 'queue'; g.adv = S.tick; } }
  else if (st === 'queue') { walk(g, speed, dt); g.wc += dt; if (g.wc >= gc.patience.counter) walkOff(S, g, ctx); }
  else if (st === 'toTee' || st === 'toNext') {
    if (walk(g, speed, dt)) { g.st = 'teeWait'; g.adv = S.tick; S.teeQ[g.ord].push(g.id); }
  }
  else if (st === 'teeWait') {
    const q = S.teeQ[g.ord], first = g.hi === 0;
    if (q[0] === g.id && !S.busy[g.ord] && (!first || g.sent)
      && (!first || S.tick - S.lastTee >= sh.teeGapS * sh.tick)) { q.shift(); teeOff(S, g, ctx); return; }
    if (first) { g.wt += dt; if (g.wt >= gc.patience.tee1) walkOff(S, g, ctx); }
    else { g.wo += dt; if (g.wo >= gc.patience.course) walkOff(S, g, ctx); }
  }
  else if (st === 'play') {
    const h = ctx.route.holes[g.ord];
    onLine(h, (S.tick - g.t0) / (g.t1 - g.t0), TMP); g.x = TMP.x; g.y = TMP.y;
    if (S.tick >= g.t1) holeOut(S, g, ctx);
  }
  else if (st === 'leave') {
    const was = g.pi;
    const done = walk(g, speed, dt);
    if (was === 0 && g.pi > 0) settle(S, g, ctx);
    if (done) g.st = 'gone';
  }
  else if (st === 'off') { if (walk(g, speed, dt)) g.st = 'gone'; }
}
function teeOff(S, g, ctx) {
  const cfg = ctx.cfg, gc = cfg.golfers, h = ctx.route.holes[g.ord], r = cfg.shift.tick;
  S.busy[g.ord] = g.id; g.st = 'play'; g.adv = S.tick; g.cart = S.carts;
  if (g.hi === 0) S.lastTee = S.tick;
  const geom = ctx.geoms[g.ord];
  g.shots = [];
  const strokes = [];
  for (let i = 0; i < g.size; i++) {
    const res = playHole(S, geom, cfg.shot.tiers[g.golfers[i]], cfg);
    strokes.push(res.strokes); g.shots.push(res.shots);
    if (res.strokes === 1) S.tally.aces++;
  }
  g.scores.push(strokes);
  const secs = gc.holeS[h.par] * gc.sizeFactor[g.size - 1] * gc.paceFactor[g.pace] * (g.cart ? gc.cartFactor : 1);
  g.t0 = S.tick; g.t1 = S.tick + Math.max(1, Math.round(secs * r));
  g.x = h.tee.x; g.y = h.tee.y;
  if (ctx.fx) ctx.fx('tee', h.tee.x, h.tee.y, g.id);
}
function holeOut(S, g, ctx) {
  S.busy[g.ord] = 0; g.hi++; g.adv = S.tick; g.shots = null;
  const plan = ctx.route.plan;
  if (g.hi >= plan.length) {
    const tot = [];
    for (let i = 0; i < g.size; i++) { let t = 0; for (const s of g.scores) t += s[i]; tot.push(t); }
    g.tot = tot;
    leave(S, g, ctx, true);
    return;
  }
  g.ord = plan[g.hi]; g.st = 'toNext'; g.path = [ctx.route.holes[g.ord].wait]; g.pi = 0;
}
/* A finished group passes the shop: the review, the tip, the day's numbers. */
function settle(S, g, ctx) {
  const cfg = ctx.cfg, gc = cfg.golfers, w = cfg.stars.weights, r = cfg.shift.tick;
  let cond = 0;
  for (const ord of S.open) cond += S.greens[ord];
  cond = cond / (S.open.length * 100);
  const service = 1 - (g.wc / gc.patience.counter + g.wt / gc.patience.tee1) / 2;
  const pace = 1 - g.wo / gc.patience.course;
  const score = clamp(w.condition * cond + w.pace * pace + w.service * service + w.design * cfg.stars.designNeutral, 0, 1);
  const tip = Math.round(g.paid * cfg.economy.tipMax * score);
  S.cash += tip; S.tally.tips += tip;
  S.reviews.push(Math.round((1 + 4 * score) * 10) / 10); S.stars = starsOf(S.reviews, cfg);
  S.tally.rounds++; S.tally.golfers += g.size; S.tally.roundS += (S.tick - g.check) / r;
  for (const t of g.tot) if (!S.tally.low || t < S.tally.low) S.tally.low = t;
  if (ctx.fx) ctx.fx('tip', ctx.map.shopExit.x, ctx.map.shopExit.y, tip);
}

/* ---- the end of a shift ---- */

export function makeCtx(course, cfg, map) {
  const open = course.holes.filter(h => h.open).map(h => h.ord), route = buildRoute(map, open), geoms = {};
  for (const h of map.holes) geoms[h.ord] = holeGeom(h, cfg);
  return { cfg, map, route, geoms, fx: null };
}
export function endShift(S, ctx, course) {
  const cfg = ctx.cfg, t = S.tally;
  const result = {
    no: S.no, seed: S.seed, v: S.v, rounds: t.rounds, golfers: t.golfers,
    cash: t.fees - t.refunds + t.tips, fees: t.fees - t.refunds, tips: t.tips, spent: t.spent,
    walkOffs: t.walkOffs, avgRoundS: t.rounds ? Math.round(t.roundS / t.rounds * 10) / 10 : 0, low: t.low, aces: t.aces,
    stars0: S.stars0, stars: S.stars, goal: S.goal, goalMet: t.fees - t.refunds + t.tips >= S.goal,
    stuck: t.stuck, cutOff: t.cutOff, cashAfter: S.cash, ticks: S.tick
  };
  const next = JSON.parse(JSON.stringify(course));
  next.cash = S.cash; next.reviews = S.reviews.slice(-cfg.stars.window); next.stars = S.stars; next.shiftsFiled = S.no;
  for (const id in S.pads) { const st = S.pads[id].st; if (st !== 'open') next.unlocks[id] = st === 'building' && cfg.economy.pads[id].kind === 'unlock' ? 'done' : st; }
  for (const h of next.holes) if (h.open) {
    h.green = clamp(S.greens[h.ord] - cfg.stars.greenDecay, 0, 100);
    h.fairway = clamp(h.fairway - cfg.stars.fairwayDecay, 0, 100);
  }
  /* Canonical: a course that came back from the database has its keys in another order. */
  result.checksum = checksum(JSON.stringify([result, next.cash, next.stars, Object.keys(next.unlocks).sort().map(k => [k, next.unlocks[k]]),
    next.holes.map(h => [h.ord, h.open, h.green, h.fairway])]));
  return { result, course: next };
}

/* A whole shift from its command log, with nobody at the controls: what the
   server runs to check a filed shift. Returns null on a log it will not run. */
export function replay(course, log, cfg, map, maxLog) {
  if (!Array.isArray(log) || log.length > (maxLog || 6000)) return null;
  const ctx = makeCtx(course, cfg, map), S = startShift(course, cfg, map), sh = cfg.shift;
  const cap = (sh.dawnS + sh.openS + sh.closeMaxS) * sh.tick + 10;
  let last = 0;
  for (const c of log) {
    if (!Array.isArray(c) || c.length < 2 || c.length > 4 || !Number.isInteger(c[0]) || c[0] < last || c[0] > cap) return null;
    if (c[1] !== 'dir' && c[1] !== 'goto' && c[1] !== 'exit') return null;   // a debug tool's shift is never filed
    last = c[0];
    S.pending.push(c);
  }
  while (!S.done && S.tick <= cap) step(S, ctx);
  if (!S.done) return null;
  return endShift(S, ctx, course);
}

/* ---- the goal line: the next thing to do, always ---- */

const money = n => '$' + n;
export function goalOf(S, ctx) {
  const cfg = ctx.cfg, map = ctx.map, p = S.player, pads = cfg.economy.pads, gc = cfg.golfers;
  const head = S.queue.length ? S.groups[S.queue[0] - 1] : null;
  const atCounter = head && head.st === 'queue' ? head : null, atTee = unsent(S, ctx);
  let need = null;
  if (atCounter && atTee) need = (gc.patience.counter - atCounter.wc) < (gc.patience.tee1 - atTee.wt) ? 'checkin' : 'sendoff';
  else if (atCounter) need = 'checkin'; else if (atTee) need = 'sendoff';
  const spot = need === 'checkin' ? map.counter : need === 'sendoff' ? map.teeRing : null;
  if (p.mode === 'mower') {
    if (spot) {
      /* park clear of the ring and of the walk between the stations */
      const px = need === 'checkin' ? map.mowerHome.x : spot.x - 4.5, py = need === 'checkin' ? map.mowerHome.y : spot.y + 3;
      if (dist(p.x, p.y, px, py) < 1.5) return { key: 'park', text: 'Leave the mower. Tap Leave.', x: p.x, y: p.y, act: 'exit' };
      return { key: 'park:' + need, text: need === 'checkin' ? 'A group is at the counter. Drive back.' : 'A group is on tee 1. Drive over.', x: px, y: py };
    }
    /* greens in hole order: the loop ends at the green nearest the shop */
    for (const ord of S.open) if (S.greens[ord] < 100) { const g = ctx.route.holes[ord].green; return { key: 'mow:' + ord, text: 'Mow green ' + ord + '. Park on it.', x: g.x, y: g.y }; }
    if (S.plot && S.plot.left > 0) { const q = S.plot.pts.find(v => !v.done); return { key: 'clear:' + S.plot.left, text: 'Mow the overgrowth on hole ' + S.plot.ord + '.', x: q.x, y: q.y }; }
    if (dist(p.x, p.y, map.mowerHome.x, map.mowerHome.y) < 1.5) return { key: 'park', text: 'Greens are cut. Tap Leave.', x: p.x, y: p.y, act: 'exit' };
    return { key: 'home', text: 'Greens are cut. Drive back to the shop.', x: map.mowerHome.x, y: map.mowerHome.y };
  }
  if (S.done) return { key: 'done', text: 'The day is done.', x: p.x, y: p.y };
  if (need === 'checkin') return { key: 'checkin', text: 'Check in the group. Stand at the counter.', x: map.counter.x, y: map.counter.y };
  if (need === 'sendoff') return { key: 'sendoff', text: 'Send the group off. Stand by tee 1.', x: map.teeRing.x, y: map.teeRing.y };
  if (S.phase === 'dawn') {
    for (const ord of S.open) if (S.greens[ord] < 100) return { key: 'mower', text: 'Greens need a cut. Walk to the mower.', x: S.mower.x, y: S.mower.y };
  }
  for (const id in pads) if (S.pads[id].st === 'open' && S.cash >= pads[id].cost) {
    return { key: 'pad:' + id, text: 'Stand on the ' + pads[id].name + ' pad. ' + money(pads[id].cost) + '.', x: map.pads[id].x, y: map.pads[id].y };
  }
  if (S.plot && S.plot.left > 0) return { key: 'mower2', text: 'Take the mower to hole ' + S.plot.ord + '.', x: S.mower.x, y: S.mower.y };
  for (const g of S.groups) if (g.st === 'toTee') return { key: 'totee', text: 'A group is walking to tee 1. Meet them.', x: map.teeRing.x, y: map.teeRing.y };
  if (head) return { key: 'wait', text: 'A group is walking in. Wait at the counter.', x: map.counter.x, y: map.counter.y };
  let next = null;
  for (const g of S.groups) if (g.st === 'sched' && (!next || g.arrive < next.arrive)) next = g;
  if (next) return { key: 'next', text: 'Next group soon. Wait at the counter.', x: map.counter.x, y: map.counter.y };
  for (const id in pads) if (S.pads[id].st === 'open') {
    const left = pads[id].cost - S.cash;
    return { key: 'save:' + id, text: money(left) + ' to go for the ' + pads[id].name + '.', x: map.counter.x, y: map.counter.y };
  }
  return { key: 'closing', text: 'Last groups are finishing.', x: map.counter.x, y: map.counter.y };
}

/* The next groups on the tee sheet, for the HUD strip. */
export function sheetOf(S, n, out) {
  out.length = 0;
  for (const g of S.groups) { if (g.st === 'sched' || g.st === 'toQueue' || g.st === 'queue') out.push(g); if (out.length >= n) break; }
  return out;
}
