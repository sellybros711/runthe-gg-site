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
    unlocks: {}, levels: {}, staff: {}, pg: 0, baskets: cfg.economy.rangeBaskets,
    holes: map.holes.map(h => ({ ord: h.ord, par: h.par, open: map.openAtStart.includes(h.ord),
      green: cfg.stars.greenStart, fairway: cfg.stars.fairwayStart }))
  };
}
/* A course from an older schema, brought forward. One step a version. */
export function migrateCourse(c, cfg) {
  if (!c || typeof c !== 'object') return null;
  if (!c.schema) c.schema = 1;
  if (!c.levels || typeof c.levels !== 'object') c.levels = {};   // a course from before upgrades had levels
  if (!c.staff || typeof c.staff !== 'object') c.staff = {};      // and from before hires
  if (typeof c.pg !== 'number') c.pg = 0;
  if (typeof c.baskets !== 'number') c.baskets = cfg.economy.rangeBaskets;
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
/* ---- levels: everything that can be upgraded ---- */

/* Everything starts at level 1. The cart barn has no level until it is built. */
export function levelOf(S, cfg, id) {
  const u = cfg.economy.upgrades[id];
  if (!u) return 1;
  if (u.needs && (!S.pads[u.needs] || S.pads[u.needs].st !== 'done')) return 0;
  const l = S.levels[id] | 0;
  return l < 1 ? 1 : l > cfg.economy.upgradeMax ? cfg.economy.upgradeMax : l;
}
/* What the next level costs: the base, grown once for each level already bought, to the nearest $5. */
export function upgradeCost(cfg, id, level) {
  let c = cfg.economy.upgrades[id].cost;
  for (let i = 1; i < level; i++) c *= cfg.economy.upgradeGrowth;
  return Math.round(c / 5) * 5;
}
const extra = (S, cfg, id) => { const l = levelOf(S, cfg, id); return l > 1 ? l - 1 : 0; };
/* The numbers the levels change, worked out when a shift starts and after each purchase. */
function applyLevels(S, cfg) {
  const u = cfg.economy.upgrades, sh = cfg.shift, g = cfg.golfers, e = id => extra(S, cfg, id), hot = S.event === 'heat' ? cfg.events.heat.wait : 1;
  S.fx = {
    walk: sh.walk + u.boots.walk * e('boots'), cart: sh.cart + u.my_cart.cart * e('my_cart'), mower: sh.mower + u.shed.mower * e('shed'),
    mow: Math.max(0.5, sh.rings.mow - u.shed.mow * e('shed')),
    checkin: sh.rings.checkin * Math.max(0.2, 1 - u.shop.checkin * e('shop')),
    sendoff: sh.rings.sendoff * Math.max(0.2, 1 - u.starter.sendoff * e('starter')),
    patCounter: (g.patience.counter + u.clubhouse.patience * e('clubhouse')) * hot,
    patTee: (g.patience.tee1 + u.starter.patience * e('starter')) * hot,
    patCourse: g.patience.course + u.putting_green.patience * levelOf(S, cfg, 'putting_green'),
    feeAll: 1 + u.shop.fee * e('shop'),
    rental: u.cart_barn.rental * levelOf(S, cfg, 'cart_barn'),
    pace: Math.max(0.4, g.cartFactor - u.cart_barn.pace * e('cart_barn')),
    tipMax: cfg.economy.tipMax + u.clubhouse.tip * e('clubhouse'),
    design: Math.min(1, cfg.stars.designNeutral + u.gardens.design * e('gardens')),
    practice: u.putting_green.practice * levelOf(S, cfg, 'putting_green'),
    snack: levelOf(S, cfg, 'snack_shack') ? (cfg.economy.snackBase + u.snack_shack.snack * e('snack_shack')) * (S.event === 'heat' ? cfg.events.heat.snack : 1) : 0,
    range: levelOf(S, cfg, 'driving_range') ? cfg.economy.rangeBase + u.driving_range.range * e('driving_range') : 0
  };
}
/* How each thing looks: -1 not built, else a tier that rises every cfg.economy.tierEvery levels. */
export function looksOf(S, cfg, out) {
  const every = cfg.economy.tierEvery;
  for (const id in cfg.economy.upgrades) { const l = levelOf(S, cfg, id); out[id] = l === 0 ? -1 : Math.floor((l - 1) / every); }
  for (const id in cfg.economy.pads) if (cfg.economy.pads[id].kind === 'unlock') out[id + ':st'] = S.pads[id].st;
  for (const id in cfg.economy.staff) out['staff:' + id] = !!S.staff[id];
  return out;
}
/* What one golfer pays for the round: each hole's fee at its level, the shop's share on top, and the cart. */
export function feeOf(S, ctx) {
  const cfg = ctx.cfg, u = cfg.economy.upgrades;
  let f = 0;
  for (const ord of ctx.route.plan) { const up = u['hole_' + ord]; f += cfg.economy.feePerHole * (1 + (up ? up.fee * extra(S, cfg, 'hole_' + ord) : 0)); }
  /* the cart, the snack and the range are paid where they are handed over, not here */
  return f * S.fx.feeAll + (S.pg >= cfg.economy.practiceMinCondition ? S.fx.practice : 0);
}

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
    pads: {}, plot: null, carts: course.unlocks.cart_barn === 'done', levels: Object.assign({}, course.levels), fx: null, padList: [],
    staff: Object.assign({}, course.staff), auto: { checkin: 0, sendoff: 0, keys: 0, snack: 0, range: 0 }, gk: 0,
    pg: course.unlocks.putting_green === 'done' ? (course.pg || cfg.stars.greenStart) : -1, pgMow: 0, baskets: course.baskets, afterT: 0,
    work: { id: null, t: 0 }, event: '', notes: [],
    tally: { bonus: 0, rounds: 0, golfers: 0, fees: 0, refunds: 0, tips: 0, spent: 0, walkOffs: 0, roundS: 0, low: 0, stuck: 0, cutOff: 0, aces: 0, upgrades: 0, extras: 0, hires: 0 },
    log: [], pending: []
  };
  S.rng = S.seed;
  /* The day's event and each group's kind come from their own stream, so the tee sheet is the
     same sheet with or without them. */
  const ev = cfg.events, R2 = { rng: mixSeed(S.seed, 7919) };
  if (no >= ev.fromDay && rngNext(R2) < ev.chance) S.event = rngPick(R2, ev.odds);
  for (const h of course.holes) if (h.open) { S.greens[h.ord] = S.event === 'rain' ? clamp(h.green - ev.rain.greens, 0, 100) : h.green; S.mow[h.ord] = 0; S.teeQ[h.ord] = []; S.busy[h.ord] = 0; }
  if (S.event === 'rain' && S.pg > 0) S.pg = clamp(S.pg - ev.rain.greens, 0, 100);
  for (const id in cfg.economy.pads) {
    const u = course.unlocks[id];
    S.pads[id] = { st: u || 'open', t: 0 };
    if (cfg.economy.pads[id].kind === 'hole' && u === 'clearing') S.plot = makePlot(map, cfg.economy.pads[id].hole);
  }
  applyLevels(S, cfg);
  S.padList = padsOf(S, cfg, map, false);
  /* The tee sheet: bookings scale with the star rating, and with the clubhouse. */
  const g = cfg.golfers;
  const n = Math.max(2, Math.round(g.groupsDay1 * (1 + g.bookingsPerStar * (course.stars - cfg.stars.start))
    * (1 + cfg.economy.upgrades.parking.bookings * extra(S, cfg, 'parking')) * (S.event === 'outing' ? 1 + ev.outing.bookings : 1)));
  const span = (sh.lastTeeS - sh.firstTeeS) / Math.max(1, n - 1);
  for (let i = 0; i < n; i++) addGroup(S, cfg, Math.round((sh.dawnS + sh.firstTeeS + span * i + (rngNext(S) - 0.5) * span * 0.4) * r));
  if (no <= g.gentleDays) for (const q of S.groups) if (q.pace === 'verySlow') q.pace = 'slow';
  if (no > g.gentleDays) for (const q of S.groups) { q.type = rngPick(R2, g.typeOdds); q.pm = g.types[q.type].patience; }
  if (S.event === 'critic') S.groups[Math.floor(rngNext(R2) * S.groups.length)].critic = true;
  /* A thin tee sheet lowers the goal: it is always within reach of good service. */
  let booked = 0;
  for (const q of S.groups) booked += q.size;
  const eco = cfg.economy, share = Math.min(eco.goalShareMax, eco.goalShare + eco.goalShareStep * (no - 1));
  const reach = Math.floor(booked * feeOf(S, { cfg, route: { plan: roundPlan(open, false) } }) * share / 5) * 5;
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
    type: 'regular', pm: 1, critic: false, mk: 0, ms: 0,
    st: 'sched', arrive, x: 0, y: 0, path: [], pi: 0, hi: 0, ord: 0, sent: false, paid: 0,
    wc: 0, wt: 0, wo: 0, wk: 0, ws: 0, t0: 0, t1: 0, shots: null, scores: [], tot: null, check: 0, adv: arrive, cart: false };
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
  else if (t === 'buy') buy(S, ctx, String(c[2]), String(c[3]));
  else if (t === 'end') { if (S.phase === 'after') S.done = true; }
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
  hires(S, ctx, dt);

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
      if (pad.t <= 0) { pad.st = 'done'; pad.t = 0; if (id === 'cart_barn') S.carts = true; if (id === 'putting_green') S.pg = cfg.stars.greenStart; applyLevels(S, cfg); S.padList = padsOf(S, cfg, ctx.map, false); if (ctx.fx) ctx.fx('built', ctx.map.pads[id].x, ctx.map.pads[id].y, id); }
    }
  }
  S.tick++;
  if (S.phase === 'closing') {
    /* the last group is in: the day's numbers are final, and after hours begins */
    if (active > 0 && S.tick >= openEnd + sh.closeMaxS * r) { for (const g of S.groups) if (g.st !== 'gone') { S.tally.cutOff++; g.st = 'gone'; } active = 0; }
    if (active === 0) {
      /* a day that met its goal is won, and a won day pays a bonus */
      const t = S.tally;
      if (t.fees - t.refunds + t.tips + t.extras >= S.goal) { t.bonus = Math.round(S.goal * cfg.economy.goalBonus); S.cash += t.bonus; }
      S.phase = 'after'; S.afterT = S.tick; if (ctx.fx) ctx.fx('closed', S.player.x, S.player.y, 0);
    }
  } else if (S.phase === 'after') {
    /* AFTER HOURS. Nobody on the course and no clock the player can see: walk the property and
       spend. It ends on the player's word ('end'), or at afterMaxS so a shift is never endless. */
    if (S.tick >= S.afterT + sh.afterMaxS * r) S.done = true;
  }
}

function movePlayer(S, ctx, dt) {
  const p = S.player, sh = ctx.cfg.shift, map = ctx.map;
  const speed = p.mode === 'cart' ? S.fx.cart : p.mode === 'mower' ? S.fx.mower : S.fx.walk;
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
        if (S.mow[ord] >= S.fx.mow) { S.greens[ord] = 100; S.mow[ord] = 0; if (ctx.fx) ctx.fx('mown', gr.x, gr.y, ord); }
      }
    }
    if (S.pg >= 0 && S.pg < 100 && dist(p.x, p.y, map.puttingGreen.x, map.puttingGreen.y) <= map.puttingGreen.r) {
      S.pgMow += dt;
      if (S.pgMow >= S.fx.mow) { S.pg = 100; S.pgMow = 0; if (ctx.fx) ctx.fx('mown', map.puttingGreen.x, map.puttingGreen.y, 0); }
    }
    if (S.plot && S.plot.left > 0) {
      for (const q of S.plot.pts) if (!q.done && dist(p.x, p.y, q.x, q.y) < 3) { q.done = true; S.plot.left--; }
      if (S.plot.left === 0) { for (const id in S.pads) if (S.pads[id].st === 'clearing') S.pads[id].st = 'building'; S.padList = padsOf(S, ctx.cfg, map, false); if (ctx.fx) ctx.fx('cleared', p.x, p.y, S.plot.ord); }
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

/* THE STATIONS. Each is a ring the player stands in to do the work, and each can be handed to a
   hire. A station exists once its place is built.
     checkin  the counter: check the group at the head of the queue in
     sendoff  tee 1: send the next group off
     keys     the cart barn: hand cart keys to the group waiting for them
     snack    the snack shack: serve the group waiting there
     range    the driving range: refill the ball baskets */
const RINGS = ['checkin', 'sendoff', 'keys', 'snack', 'range'];
function ringAt(S, map, id) {
  if (id === 'checkin') return map.counter;
  if (id === 'sendoff') return map.teeRing;
  if (id === 'keys') return S.carts ? map.keys.ring : null;
  if (id === 'snack') return S.pads.snack_shack && S.pads.snack_shack.st === 'done' ? map.snack.ring : null;
  return S.pads.driving_range && S.pads.driving_range.st === 'done' ? map.rangeRing : null;
}
function waiting(S, st) { for (let i = 0; i < S.groups.length; i++) if (S.groups[i].st === st) return S.groups[i]; return null; }
function ringCan(S, ctx, id, forHire) {
  if (id === 'checkin') { const h = S.queue.length ? S.groups[S.queue[0] - 1] : null; return !!h && h.st === 'queue'; }
  if (id === 'sendoff') return !!unsent(S, ctx);
  if (id === 'keys') return !!waiting(S, 'keys');
  if (id === 'snack') return !!waiting(S, 'snack');
  /* you can top the baskets up any time; a hire waits until half are gone */
  return forHire ? S.baskets * 2 <= ctx.cfg.economy.rangeBaskets : S.baskets < ctx.cfg.economy.rangeBaskets;
}
function ringSecs(S, cfg, id) { return id === 'checkin' ? S.fx.checkin : id === 'sendoff' ? S.fx.sendoff : cfg.shift.rings[id]; }
function ringDo(S, ctx, id) {
  const map = ctx.map;
  if (id === 'checkin') checkIn(S, ctx);
  else if (id === 'sendoff') { const g = unsent(S, ctx); if (g) { g.sent = true; g.adv = S.tick; if (ctx.fx) ctx.fx('sent', map.teeRing.x, map.teeRing.y, g.id); } }
  else if (id === 'keys') { const g = waiting(S, 'keys'); if (g) { g.cart = true; extra$(S, ctx, Math.round(g.size * S.fx.rental * kind(ctx, g).spend), map.keys.ring); toTee(S, g, ctx); } }
  else if (id === 'snack') { const g = waiting(S, 'snack'); if (g) { extra$(S, ctx, Math.round(g.size * S.fx.snack * kind(ctx, g).spend), map.snack.ring); toNext(S, g, ctx); } }
  else { S.baskets = ctx.cfg.economy.rangeBaskets; if (ctx.fx) ctx.fx('filled', map.rangeRing.x, map.rangeRing.y, 0); }
}
const kind = (ctx, g) => ctx.cfg.golfers.types[g.type];
function extra$(S, ctx, n, at) { if (n > 0) { S.cash += n; S.tally.extras += n; if (ctx.fx) ctx.fx('cash', at.x, at.y, n); } }

/* Every ring on the property and whether it has work right now, then every place's pad. */
export function stations(S, ctx, out, labels) {
  const map = ctx.map, sh = ctx.cfg.shift;
  out.length = 0;
  for (let i = 0; i < RINGS.length; i++) {
    const at = ringAt(S, map, RINGS[i]);
    if (at) out.push({ id: RINGS[i], x: at.x, y: at.y, r: sh.ringR, secs: ringSecs(S, ctx.cfg, RINGS[i]), can: ringCan(S, ctx, RINGS[i], false) });
  }
  /* the pads change only when something is bought or built, so they are kept (padsOf) and only `can` is worked out here */
  const list = labels ? padsOf(S, ctx.cfg, map, true) : S.padList;
  for (let i = 0; i < list.length; i++) { const q = list[i]; q.can = S.cash >= q.cost; out.push(q); }
  return out;
}

/* ---- places: one pad each, and what its card offers ---- */

/* What a place's card holds right now: something to build, things to level, someone to hire. */
export function placeCard(S, ctx, pid) {
  const cfg = ctx.cfg, eco = cfg.economy, pl = eco.places[pid], at = ctx.map.places[pid], items = [];
  if (!pl) return null;
  const st = pl.build ? S.pads[pl.build].st : 'done';
  if (pl.build && st === 'open') items.push({ kind: 'build', id: pl.build, name: eco.pads[pl.build].name, cost: eco.pads[pl.build].cost, can: S.cash >= eco.pads[pl.build].cost, done: false });
  if (st === 'done') {
    for (const id of pl.ups) {
      const l = levelOf(S, cfg, id), full = l >= eco.upgradeMax, cost = full ? 0 : upgradeCost(cfg, id, l);
      items.push({ kind: 'up', id, name: eco.upgrades[id].name, level: l, max: eco.upgradeMax, cost, can: !full && S.cash >= cost, done: full });
    }
    if (pl.hire) { const h = eco.staff[pl.hire], has = !!S.staff[pl.hire]; items.push({ kind: 'hire', id: pl.hire, name: h.name, cost: has ? 0 : h.cost, can: !has && S.cash >= h.cost, done: has }); }
  }
  return { id: pid, name: pl.name, x: at.x, y: at.y, st, items };
}
/* Every place's pad as it stands now. `cost` is the cheapest thing left to buy there. */
function padsOf(S, cfg, map, labels) {
  const out = [], ctx = { cfg, map };
  for (const pid in cfg.economy.places) {
    const card = placeCard(S, ctx, pid);
    let cost = Infinity;
    for (const it of card.items) if (!it.done && it.cost < cost) cost = it.cost;
    out.push({ id: 'place:' + pid, place: pid, x: card.x, y: card.y, r: cfg.shift.padR, pad: true, st: card.st, cost, can: false,
      label: !labels ? '' : card.st === 'open' ? 'Build ' + card.name + ' · ' + money(cost) : card.st === 'clearing' ? card.name + ': mow it clear' : card.st === 'building' ? card.name + ': building' : card.name });
  }
  return out;
}
/* Which place is the player standing on? (the page opens its card) */
export function placeAt(S, ctx) {
  const p = S.player;
  if (p.mode === 'mower') return null;
  for (const pid in ctx.map.places) { const at = ctx.map.places[pid]; if (dist(p.x, p.y, at.x, at.y) <= ctx.cfg.shift.padR) return pid; }
  return null;
}
/* Buying is a command like any other, and only from the place's own pad. */
function buy(S, ctx, kind, id) {
  const cfg = ctx.cfg, eco = cfg.economy, pid = placeAt(S, ctx);
  if (!pid) return;
  const card = placeCard(S, ctx, pid), it = card.items.find(v => v.kind === kind && v.id === id);
  if (!it || !it.can) return;
  S.cash -= it.cost; S.tally.spent += it.cost;
  if (kind === 'build') {
    const pad = eco.pads[id];
    if (pad.kind === 'hole') { S.pads[id].st = 'clearing'; S.plot = makePlot(ctx.map, pad.hole); }
    else { S.pads[id].st = 'building'; S.pads[id].t = pad.buildS; }
    if (ctx.fx) ctx.fx('pad', card.x, card.y, id);
  } else if (kind === 'up') {
    S.levels[id] = it.level + 1; S.tally.upgrades++;
    applyLevels(S, cfg);
    if (ctx.fx) ctx.fx('up', card.x, card.y, id);
  } else {
    S.staff[id] = 1; S.tally.hires++;
    if (ctx.fx) ctx.fx('hire', card.x, card.y, id);
  }
  S.padList = padsOf(S, cfg, ctx.map, false);
}

function unsent(S, ctx) {
  const q = S.teeQ[ctx.route.first];
  if (!q) return null;
  for (let i = 0; i < q.length; i++) { const g = S.groups[q[i] - 1]; if (g.hi === 0 && !g.sent) return g; }
  return null;
}
/* The player's own work: stand in a ring with work in it and the ring fills. */
function work(S, ctx, dt) {
  const p = S.player, w = S.work, map = ctx.map, sh = ctx.cfg.shift;
  let at = null;
  if (p.mode !== 'mower') {
    for (let i = 0; i < RINGS.length; i++) {
      const c = ringAt(S, map, RINGS[i]);
      if (c && dist(p.x, p.y, c.x, c.y) <= sh.ringR && ringCan(S, ctx, RINGS[i], false)) { at = RINGS[i]; break; }
    }
  }
  if (!at) { w.id = null; w.t = 0; return; }
  if (w.id !== at) { w.id = at; w.t = 0; }
  w.t += dt;
  if (w.t < ringSecs(S, ctx.cfg, at)) return;
  w.id = null; w.t = 0; S.auto[at] = 0;
  ringDo(S, ctx, at);
}
/* The hires: each watches one station, takes a beat to notice, and works slower than you do. */
function hires(S, ctx, dt) {
  const eco = ctx.cfg.economy, staff = eco.staff;
  for (const role in staff) {
    if (!S.staff[role]) continue;
    const id = staff[role].station;
    if (id === 'mow') {
      /* the greenskeeper cuts at dawn, one green at a time, and never quite as well as you */
      if (S.phase !== 'dawn') continue;
      S.gk += dt;
      if (S.gk < eco.greenskeeperS) continue;
      S.gk = 0;
      let did = false;
      for (const ord of S.open) if (S.greens[ord] < eco.greenskeeperCut) { S.greens[ord] = eco.greenskeeperCut; did = true; const g = ctx.route.holes[ord].green; if (ctx.fx) ctx.fx('mown', g.x, g.y, ord); break; }
      if (!did && S.pg >= 0 && S.pg < eco.greenskeeperCut) S.pg = eco.greenskeeperCut;
      continue;
    }
    if (!ringAt(S, ctx.map, id) || !ringCan(S, ctx, id, true)) { S.auto[id] = 0; continue; }
    S.auto[id] += dt;
    if (S.auto[id] >= eco.staffDelayS + ringSecs(S, ctx.cfg, id) / eco.staffSpeed) { S.auto[id] = 0; ringDo(S, ctx, id); }
  }
}
function checkIn(S, ctx) {
  const eco = ctx.cfg.economy, g = S.groups[S.queue.shift() - 1], map = ctx.map;
  g.paid = Math.round(g.size * feeOf(S, ctx));
  S.cash += g.paid; S.tally.fees += g.paid;
  g.check = S.tick; g.adv = S.tick; g.ord = ctx.route.plan[0];
  if (ctx.fx) ctx.fx('cash', map.counter.x, map.counter.y, g.paid);
  /* range balls: a basket a golfer, while there are baskets */
  if (S.fx.range > 0 && S.baskets > 0) { const n = g.size < S.baskets ? g.size : S.baskets; S.baskets -= n; extra$(S, ctx, Math.round(n * S.fx.range * kind(ctx, g).spend), map.rangeRing); }
  /* with a cart barn, the group stops for keys on the way to the tee */
  if (S.carts) { g.st = 'toKeys'; g.path = [map.waypoints.toTee[0], map.keys.spot]; g.pi = 0; }
  else { g.st = 'toTee'; g.path = map.waypoints.toTee.concat([ctx.route.holes[g.ord].wait]); g.pi = 0; }
  requeue(S, ctx);
}
function toTee(S, g, ctx) { g.st = 'toTee'; g.adv = S.tick; g.path = [ctx.map.waypoints.toTee[1], ctx.route.holes[g.ord].wait]; g.pi = 0; }
function toNext(S, g, ctx) { g.st = 'toNext'; g.adv = S.tick; g.path = [ctx.route.holes[g.ord].wait]; g.pi = 0; }

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
/* One group's review: its stars into the rating (a critic's count several times), and a note the day's card can read. */
function review(S, g, cfg, stars, why) {
  const n = g.critic ? cfg.events.critic.weight : 1;
  for (let i = 0; i < n; i++) S.reviews.push(stars);
  S.stars = starsOf(S.reviews, cfg);
  S.notes.push({ id: g.id, type: g.type, critic: g.critic, size: g.size, stars, why });
}
function walkOff(S, g, ctx, why) {
  release(S, g); requeue(S, ctx);
  if (g.paid) {
    /* a full refund, but never more than is in the till: cash cannot go below zero */
    const back = g.paid < S.cash ? g.paid : S.cash;
    S.cash -= back; S.tally.refunds += back; if (ctx.fx) ctx.fx('refund', g.x, g.y, back); g.paid = 0;
  }
  S.tally.walkOffs++;
  review(S, g, ctx.cfg, ctx.cfg.stars.walkOffReview, why);
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
  else if (st === 'queue') { walk(g, speed, dt); g.wc += dt; if (g.wc >= S.fx.patCounter * g.pm) walkOff(S, g, ctx, 'counter'); }
  else if (st === 'toKeys') { if (walk(g, speed, dt)) { g.st = 'keys'; g.adv = S.tick; } }
  else if (st === 'keys') { g.wk += dt; if (g.wk >= cfg.economy.keysWaitS) { g.mk = 1; toTee(S, g, ctx); } }      // nobody came: they walk the round
  else if (st === 'toSnack') { if (walk(g, speed, dt)) { g.st = 'snack'; g.adv = S.tick; } }
  else if (st === 'snack') { g.ws += dt; if (g.ws >= cfg.economy.snackWaitS) { g.ms = 1; toNext(S, g, ctx); } }  // nobody came: they go on hungry
  else if (st === 'toTee' || st === 'toNext') {
    if (walk(g, speed, dt)) { g.st = 'teeWait'; g.adv = S.tick; S.teeQ[g.ord].push(g.id); }
  }
  else if (st === 'teeWait') {
    const q = S.teeQ[g.ord], first = g.hi === 0;
    if (q[0] === g.id && !S.busy[g.ord] && (!first || g.sent)
      && (!first || S.tick - S.lastTee >= sh.teeGapS * sh.tick)) { q.shift(); teeOff(S, g, ctx); return; }
    if (first) { g.wt += dt; if (g.wt >= S.fx.patTee * g.pm) walkOff(S, g, ctx, 'tee'); }
    else { g.wo += dt; if (g.wo >= S.fx.patCourse) walkOff(S, g, ctx, 'course'); }
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
  S.busy[g.ord] = g.id; g.st = 'play'; g.adv = S.tick;
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
  const secs = gc.holeS[h.par] * gc.sizeFactor[g.size - 1] * gc.paceFactor[g.pace] * gc.types[g.type].pace * (g.cart ? S.fx.pace : 1);
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
  g.ord = plan[g.hi];
  /* the turn: half way round, the group stops at the snack shack */
  if (S.fx.snack > 0 && g.hi === (plan.length >> 1)) { g.st = 'toSnack'; g.ws = 0; g.path = [ctx.map.snack.spot]; g.pi = 0; return; }
  toNext(S, g, ctx);
}
/* A finished group passes the shop: the review, the tip, the day's numbers. */
function settle(S, g, ctx) {
  const cfg = ctx.cfg, gc = cfg.golfers, ty = gc.types[g.type], w = ty.weights || cfg.stars.weights, r = cfg.shift.tick;
  let cond = 0;
  for (const ord of S.open) cond += S.greens[ord];
  cond = cond / (S.open.length * 100);
  const service = 1 - (g.wc / (S.fx.patCounter * g.pm) + g.wt / (S.fx.patTee * g.pm)) / 2;
  const pace = 1 - g.wo / S.fx.patCourse;
  const score = clamp(w.condition * cond + w.pace * pace + w.service * service + w.design * S.fx.design - cfg.stars.missPenalty * (g.mk + g.ms), 0, 1);
  const tip = Math.round(g.paid * S.fx.tipMax * score * ty.tip);
  /* what the review says: happy, or the worst of the day (a service they went without, if nothing else was poor) */
  let why = 'great';
  if (score < cfg.stars.happy) {
    why = cond <= pace && cond <= service ? 'greens' : pace <= service ? 'pace' : 'wait';
    const low = cond < pace ? (cond < service ? cond : service) : (pace < service ? pace : service);
    if (low >= cfg.stars.happy || (g.mk + g.ms > 0 && low >= 0.5)) why = g.mk ? 'keys' : g.ms ? 'snack' : 'plain';
  }
  S.cash += tip; S.tally.tips += tip;
  review(S, g, cfg, Math.round((1 + 4 * score) * 10) / 10, why);
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
    cash: t.fees - t.refunds + t.tips + t.extras, fees: t.fees - t.refunds, tips: t.tips, extras: t.extras, spent: t.spent,
    upgrades: t.upgrades, hires: t.hires, walkOffs: t.walkOffs, avgRoundS: t.rounds ? Math.round(t.roundS / t.rounds * 10) / 10 : 0, low: t.low, aces: t.aces,
    event: S.event, bonus: t.bonus,
    stars0: S.stars0, stars: S.stars, goal: S.goal, goalMet: t.fees - t.refunds + t.tips + t.extras >= S.goal,
    stuck: t.stuck, cutOff: t.cutOff, cashAfter: S.cash, ticks: S.tick
  };
  const next = JSON.parse(JSON.stringify(course));
  next.levels = Object.assign({}, S.levels); next.staff = Object.assign({}, S.staff);
  next.pg = S.pg < 0 ? 0 : clamp(S.pg - cfg.stars.greenDecay, 0, 100);
  next.baskets = S.staff.range_hand ? cfg.economy.rangeBaskets : S.baskets;
  next.cash = S.cash; next.reviews = S.reviews.slice(-cfg.stars.window); next.stars = S.stars; next.shiftsFiled = S.no;
  for (const id in S.pads) { const st = S.pads[id].st; if (st !== 'open') next.unlocks[id] = st === 'building' && cfg.economy.pads[id].kind === 'unlock' ? 'done' : st; }
  for (const h of next.holes) if (h.open) {
    const up = cfg.economy.upgrades['hole_' + h.ord];
    h.green = clamp(S.greens[h.ord] - Math.max(0, cfg.stars.greenDecay - (up ? up.decay * extra(S, cfg, 'hole_' + h.ord) : 0)), 0, 100);
    h.fairway = clamp(h.fairway - cfg.stars.fairwayDecay, 0, 100);
  }
  /* Canonical: a course that came back from the database has its keys in another order. */
  result.checksum = checksum(JSON.stringify([result, next.cash, next.stars, Object.keys(next.unlocks).sort().map(k => [k, next.unlocks[k]]), Object.keys(next.levels).sort().map(k => [k, next.levels[k]]), Object.keys(next.staff).sort(), next.pg, next.baskets,
    next.holes.map(h => [h.ord, h.open, h.green, h.fairway])]));
  return { result, course: next };
}

/* A whole shift from its command log, with nobody at the controls: what the
   server runs to check a filed shift. Returns null on a log it will not run. */
export function replay(course, log, cfg, map, maxLog) {
  if (!Array.isArray(log) || log.length > (maxLog || 6000)) return null;
  const ctx = makeCtx(course, cfg, map), S = startShift(course, cfg, map), sh = cfg.shift;
  const cap = (sh.dawnS + sh.openS + sh.closeMaxS + sh.afterMaxS) * sh.tick + 10;
  let last = 0;
  for (const c of log) {
    if (!Array.isArray(c) || c.length < 2 || c.length > 4 || !Number.isInteger(c[0]) || c[0] < last || c[0] > cap) return null;
    if (c[1] !== 'dir' && c[1] !== 'goto' && c[1] !== 'exit' && c[1] !== 'buy' && c[1] !== 'end') return null;   // a debug tool's shift is never filed
    last = c[0];
    S.pending.push(c);
  }
  while (!S.done && S.tick <= cap) step(S, ctx);
  if (!S.done) return null;
  return endShift(S, ctx, course);
}

/* ---- the goal line: the next thing to do, always ---- */

const money = n => '$' + n;
const SAY = {
  checkin: ['Check in the group. Stand at the counter.', 'A group is at the counter. Drive back.'],
  sendoff: ['Send the group off. Stand by tee 1.', 'A group is on tee 1. Drive over.'],
  keys: ['Hand out cart keys. Stand at the barn.', 'A group wants cart keys. Drive over.'],
  snack: ['Serve the group. Stand at the Snack Shack.', 'A group is at the Snack Shack. Drive over.']
};
export function goalOf(S, ctx) {
  const cfg = ctx.cfg, eco = cfg.economy, map = ctx.map, p = S.player;
  /* which station needs a hand soonest? One a hire is running is theirs. */
  const head = S.queue.length ? S.groups[S.queue[0] - 1] : null;
  let need = null, left = 1e9;
  const want = (id, role, g, l) => { if (g && !S.staff[role] && l < left) { need = id; left = l; } };
  const atC = head && head.st === 'queue' ? head : null, atT = unsent(S, ctx), atK = waiting(S, 'keys'), atS = waiting(S, 'snack');
  want('checkin', 'clerk', atC, atC ? S.fx.patCounter * atC.pm - atC.wc : 0);
  want('sendoff', 'starter', atT, atT ? S.fx.patTee * atT.pm - atT.wt : 0);
  want('keys', 'attendant', atK, atK ? eco.keysWaitS - atK.wk : 0);
  want('snack', 'cook', atS, atS ? eco.snackWaitS - atS.ws : 0);
  const spot = need ? ringAt(S, map, need) : null;
  if (p.mode === 'mower') {
    if (spot) {
      /* park clear of the ring */
      const px = need === 'checkin' ? map.mowerHome.x : spot.x - 4.5, py = need === 'checkin' ? map.mowerHome.y : spot.y + 3;
      if (dist(p.x, p.y, px, py) < 1.5) return { key: 'park', text: 'Leave the mower. Tap Leave.', x: p.x, y: p.y, act: 'exit' };
      return { key: 'park:' + need, text: SAY[need][1], x: px, y: py };
    }
    if (!S.staff.greenskeeper || S.phase !== 'dawn') {
      /* greens in hole order: the loop ends at the green nearest the shop */
      for (const ord of S.open) if (S.greens[ord] < 100) { const g = ctx.route.holes[ord].green; return { key: 'mow:' + ord, text: 'Mow green ' + ord + '. Park on it.', x: g.x, y: g.y }; }
      if (S.pg >= 0 && S.pg < 100) return { key: 'mow:pg', text: 'Mow the putting green. Park on it.', x: map.puttingGreen.x, y: map.puttingGreen.y };
    }
    if (S.plot && S.plot.left > 0) { const q = S.plot.pts.find(v => !v.done); return { key: 'clear:' + S.plot.left, text: 'Mow the overgrowth on hole ' + S.plot.ord + '.', x: q.x, y: q.y }; }
    if (dist(p.x, p.y, map.mowerHome.x, map.mowerHome.y) < 1.5) return { key: 'park', text: 'Greens are cut. Tap Leave.', x: p.x, y: p.y, act: 'exit' };
    return { key: 'home', text: 'Greens are cut. Drive back to the shop.', x: map.mowerHome.x, y: map.mowerHome.y };
  }
  if (S.done) return { key: 'done', text: 'The day is done.', x: p.x, y: p.y };
  if (need) return { key: need, text: SAY[need][0], x: spot.x, y: spot.y };
  if (S.phase === 'after') {
    /* AFTER HOURS: the cheapest thing you can afford, then the day's end */
    const list = shopList(S, ctx), buyIt = it => ({ key: 'buy:' + it.kind + ':' + it.id + ':' + (it.level || 0), text: 'After hours. Open the ' + it.place + ' pad.', x: it.x, y: it.y, act: 'buy', kind: it.kind, id: it.id });
    /* the next big thing is a hire or a building. Buy it when you can; until then only small levels,
       so the cash for it is not frittered away (eco.saveShare of its price is the most a level may cost). */
    const big = list.find(it => !it.done && it.kind !== 'up');
    if (big && big.can) return buyIt(big);
    for (const it of list) if (it.can && it.kind === 'up' && (!big || it.cost <= big.cost * eco.saveShare)) return buyIt(it);
    if (S.plot && S.plot.left > 0) return { key: 'mower2', text: 'After hours. Take the mower to hole ' + S.plot.ord + '.', x: S.mower.x, y: S.mower.y };
    if (big) return { key: 'end', text: 'After hours. ' + money(big.cost - S.cash) + ' to go for the ' + big.name + '. End the day.', x: p.x, y: p.y, act: 'end' };
    return { key: 'end', text: 'After hours. End the day.', x: p.x, y: p.y, act: 'end' };
  }
  if (S.plot && S.plot.left > 0 && S.phase === 'dawn') return { key: 'mower2', text: 'Take the mower to hole ' + S.plot.ord + '.', x: S.mower.x, y: S.mower.y };
  if (S.phase === 'dawn' && !S.staff.greenskeeper) {
    for (const ord of S.open) if (S.greens[ord] < 100) return { key: 'mower', text: 'Greens need a cut. Walk to the mower.', x: S.mower.x, y: S.mower.y };
  }
  for (const g of S.groups) if (g.st === 'toTee' && !S.staff.starter) return { key: 'totee', text: 'A group is walking to tee 1. Meet them.', x: map.teeRing.x, y: map.teeRing.y };
  /* a quiet moment: the range baskets, if they are yours to fill */
  const rr = ringAt(S, map, 'range');
  if (rr && !S.staff.range_hand && S.baskets * 2 <= eco.rangeBaskets) return { key: 'range', text: 'The range is low on balls. Refill it.', x: rr.x, y: rr.y };
  if (head && !S.staff.clerk) return { key: 'wait', text: 'A group is walking in. Wait at the counter.', x: map.counter.x, y: map.counter.y };
  let next = null;
  for (const g of S.groups) if (g.st === 'sched' && (!next || g.arrive < next.arrive)) next = g;
  if (next) return { key: 'next', text: 'Next group soon. Wait at the counter.', x: map.counter.x, y: map.counter.y };
  return { key: 'closing', text: 'Last groups are finishing.', x: map.counter.x, y: map.counter.y };
}

/* Everything that can be bought, cheapest first, for the page's Course Book, the results card and the goal line. */
export function shopList(S, ctx) {
  const out = [];
  for (const pid in ctx.cfg.economy.places) {
    const card = placeCard(S, ctx, pid);
    for (const it of card.items) { it.place = card.name; it.pid = pid; it.x = card.x; it.y = card.y; out.push(it); }
  }
  out.sort((a, b) => (a.done ? 1 : 0) - (b.done ? 1 : 0) || a.cost - b.cost);
  return out;
}

/* The next groups on the tee sheet, for the HUD strip. */
export function sheetOf(S, n, out) {
  out.length = 0;
  for (const g of S.groups) { if (g.st === 'sched' || g.st === 'toQueue' || g.st === 'queue') out.push(g); if (out.length >= n) break; }
  return out;
}
