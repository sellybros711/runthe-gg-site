/* The simulation: determinism, routing, the watchdog, the economy step, config as data. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { CONFIG } from '../config.js';
import { MAP } from '../map.js';
import { holesOf, newCourse, startShift, step, endShift, makeCtx, replay, command, roundPlan, buildRoute, goalOf, starsOf, goalFor, stations, migrateCourse, levelOf, upgradeCost, feeOf, shopList, looksOf, placeCard, placeAt } from '../sim.js';
import { makeBot } from '../bot.js';
import { runShifts } from '../headless.mjs';

const clone = o => JSON.parse(JSON.stringify(o));
function play(course, cfg = CONFIG, each) {
  const ctx = makeCtx(course, cfg, MAP), S = startShift(course, cfg, MAP), bot = makeBot();
  while (!S.done) { if (each) each(S, ctx); else bot(S, ctx); step(S, ctx); }
  return { S, ctx, end: endShift(S, ctx, course) };
}

test('the sim uses no clock, no DOM, no Math.random and no engine-dependent maths', () => {
  for (const f of ['sim.js', 'shot.js', 'rng.js', 'bot.js']) {
    const src = fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    const bad = src.match(/Math\.(random|sin|cos|tan|atan2?|asin|acos|pow|exp|log\w*|hypot|cbrt|sinh|cosh|tanh)\b|\*\*|\bDate\b|\bperformance\b|(?<![.\w])document\b|(?<![.\w])window\b|setTimeout|localStorage/);
    assert.equal(bad, null, f + ' uses ' + (bad && bad[0]));
  }
});

test('the same seed and the same commands give the same shift', () => {
  const a = play(newCourse(CONFIG, MAP, 42)), b = play(newCourse(CONFIG, MAP, 42)), c = play(newCourse(CONFIG, MAP, 43));
  assert.deepEqual(a.end, b.end);
  assert.notEqual(a.end.result.checksum, c.end.result.checksum);
});

test('a shift replays from its command log to the same result', () => {
  const course = newCourse(CONFIG, MAP, 7), a = play(course);
  const again = replay(course, clone(a.S.log), CONFIG, MAP);
  assert.deepEqual(again, a.end);
  assert.ok(JSON.stringify(a.S.log).length < 12000, 'the log stays small: ' + JSON.stringify(a.S.log).length + ' bytes');
});

test('a replay refuses a debug command, a bad log and an endless one', () => {
  const course = newCourse(CONFIG, MAP, 7);
  assert.equal(replay(course, [[5, 'cash', 5000]], CONFIG, MAP), null);
  assert.equal(replay(course, [[5, 'spawn']], CONFIG, MAP), null);
  assert.equal(replay(course, [[9, 'dir', 1], [3, 'dir', 2]], CONFIG, MAP), null);
  assert.equal(replay(course, 'nope', CONFIG, MAP), null);
  assert.equal(replay(course, [[1.5, 'dir', 1]], CONFIG, MAP), null);
  assert.equal(replay(course, new Array(7000).fill([1, 'dir', 1]), CONFIG, MAP), null);
  assert.ok(replay(course, [], CONFIG, MAP), 'an empty log is a shift nobody played');
});

test('twenty shifts in a row: no stuck group, none cut off, every replay matches', () => {
  for (const seed of [1, 2, 3]) {
    const { results } = runShifts({ shifts: 20, seed, check: true });
    assert.equal(results.reduce((a, r) => a + r.stuck + r.cutOff, 0), 0, 'seed ' + seed);
  }
});

test('nobody at the controls: every group walks off, nothing sticks, the shift still ends', () => {
  const { results } = runShifts({ shifts: 5, seed: 4, idle: true });
  for (const r of results) { assert.equal(r.stuck + r.cutOff, 0); assert.equal(r.rounds, 0); assert.ok(r.walkOffs >= 2); assert.equal(r.cash, 0); }
});

test('the goal line alone gets a new player through the first shift, goal met', () => {
  for (let i = 1; i <= 120; i++) {
    const seed = i * 7919, { end } = play(newCourse(CONFIG, MAP, seed));
    assert.ok(end.result.goalMet, 'seed ' + seed + ' earned $' + end.result.cash + ' against $' + end.result.goal);
    assert.ok(end.result.rounds >= 2);
  }
});

test('the goal line always says something, with a place to go', () => {
  const course = newCourse(CONFIG, MAP, 3);
  play(course, CONFIG, (S, ctx) => {
    const g = goalOf(S, ctx);
    assert.ok(g && g.text.length > 3 && g.text.length <= 60 && Number.isFinite(g.x) && Number.isFinite(g.y), JSON.stringify(g));
  });
});

test('a round follows what is open', () => {
  assert.deepEqual(roundPlan([1, 2, 3]), [1, 2, 3, 1, 2, 3]);
  assert.deepEqual(roundPlan([1, 2, 3, 4]), [1, 2, 3, 4, 1, 2]);
  assert.deepEqual(roundPlan([1, 2, 3, 4, 5]), [1, 2, 3, 4, 5, 1]);
  assert.deepEqual(roundPlan([1, 2, 3, 4, 5, 6, 7, 8]), [1, 2, 3, 4, 5, 6, 7, 8]);
  const nine = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  assert.deepEqual(roundPlan(nine), nine);
  assert.equal(roundPlan(nine, true).length, 18);
  const all = Array.from({ length: 18 }, (_, i) => i + 1);
  assert.deepEqual(roundPlan(all, true), all);
});

test('the route graph is made from the hole list, for all 18 holes of land', () => {
  const r3 = buildRoute(MAP, [1, 2, 3]), r4 = buildRoute(MAP, [1, 2, 3, 4]);
  assert.equal(r3.plan.length, 6);
  assert.deepEqual(r4.plan, [1, 2, 3, 4, 1, 2]);
  for (const h of MAP.holes) { assert.ok(r3.holes[h.ord].len > 10); assert.ok(r3.holes[h.ord].wait); }
  assert.equal(MAP.holes.length, 9);
  assert.ok(MAP.backNine.x0 > MAP.road.x && MAP.bounds.x1 >= MAP.backNine.x1, 'the back nine tract is inside the camera bounds');
  for (const h of MAP.holes) for (const p of h.line) assert.ok(p.x > MAP.bounds.x0 && p.x < MAP.road.x && p.y > MAP.bounds.y0 && p.y < MAP.bounds.y1);
});

test('opening hole 4 needs no engine change: golfers play it', () => {
  const course = newCourse(CONFIG, MAP, 11);
  course.holes[3].open = true;
  const { end, S } = play(course);
  assert.equal(end.result.stuck + end.result.cutOff, 0);
  assert.ok(S.groups.some(g => g.scores.length === 6 && g.tot), 'a group finished a six hole round over four holes');
});

test('one group to a hole, and a gap between groups sent off tee 1', () => {
  let lastTee = -1e9;
  const seen = new Set();
  play(newCourse(CONFIG, MAP, 5), CONFIG, (S, ctx) => {
    makeBotOnce(S, ctx);
    const on = {};
    for (const g of S.groups) if (g.st === 'play') { assert.ok(!on[g.ord], 'two groups on hole ' + g.ord); on[g.ord] = 1;
      if (g.hi === 0 && !seen.has(g.id)) { seen.add(g.id); assert.ok(g.t0 - lastTee >= CONFIG.shift.teeGapS * CONFIG.shift.tick, 'tee 1 gap'); lastTee = g.t0; } }
  });
});
const bots = new WeakMap();
function makeBotOnce(S, ctx) { if (!bots.has(S)) bots.set(S, makeBot()); bots.get(S)(S, ctx); }

test('the watchdog moves a group that stops advancing, and counts it', () => {
  const course = newCourse(CONFIG, MAP, 6), ctx = makeCtx(course, CONFIG, MAP), S = startShift(course, CONFIG, MAP), bot = makeBot();
  let broke = null;
  while (!S.done) {
    bot(S, ctx); step(S, ctx);
    if (!broke) { broke = S.groups.find(g => g.st === 'play'); if (broke) { broke.t1 = 1e9; S.busy[broke.ord] = broke.id; } }
  }
  const r = endShift(S, ctx, course).result;
  assert.equal(r.stuck, 1, 'the frozen group was counted');
  assert.equal(r.cutOff, 0);
  assert.ok(r.ticks < (CONFIG.shift.dawnS + CONFIG.shift.openS + CONFIG.shift.closeMaxS) * CONFIG.shift.tick, 'and the course carried on');
});

test('the economy: fees at check in, a full refund and a one star review on a walk off, tips at the end', () => {
  const course = newCourse(CONFIG, MAP, 8), { S, end } = play(course);
  const r = end.result;
  assert.equal(r.fees, S.tally.fees - S.tally.refunds);
  assert.equal(r.cash, r.fees + r.tips);
  assert.ok(r.tips <= Math.round(S.tally.fees * CONFIG.economy.tipMax) && r.tips > 0);
  assert.equal(r.cashAfter, course.cash + r.cash + r.bonus - r.spent);
  assert.equal(end.course.cash, r.cashAfter);
  assert.equal(end.course.shiftsFiled, 1);
  /* nobody there: every group walks off, each a refund (nothing was paid) and a one star review */
  const idle = play(newCourse(CONFIG, MAP, 8), CONFIG, () => {});
  assert.equal(idle.end.result.cash, 0);
  assert.equal(idle.end.course.reviews.filter(v => v === CONFIG.stars.walkOffReview).length, idle.end.result.walkOffs);
  assert.ok(idle.end.course.stars < CONFIG.stars.start);
});

test('a walk off after paying refunds the whole fee', () => {
  const course = newCourse(CONFIG, MAP, 9), ctx = makeCtx(course, CONFIG, MAP), S = startShift(course, CONFIG, MAP), bot = makeBot();
  let paid = false;
  while (!S.done) { if (!paid) bot(S, ctx); step(S, ctx); if (S.tally.fees > 0) paid = true; }   // check one group in, then stand still
  assert.ok(S.tally.fees > 0 && S.tally.refunds > 0, 'a paid group walked off the tee');
  assert.equal(S.cash, S.cash0 + S.tally.fees - S.tally.refunds + S.tally.tips);
});

test('stars: a new course starts at the start value, and the window is the last forty reviews', () => {
  assert.equal(starsOf([], CONFIG), CONFIG.stars.start);
  assert.equal(starsOf(new Array(40).fill(5), CONFIG), 5);
  assert.equal(starsOf(new Array(80).fill(1).concat(new Array(40).fill(4)), CONFIG), 4);
  assert.ok(starsOf([5], CONFIG) > CONFIG.stars.start);
  assert.equal(goalFor(1, CONFIG), CONFIG.economy.goalDay1);
});

test('a place: its pad opens a card, and buying from the card builds it', () => {
  const course = newCourse(CONFIG, MAP, 1); course.cash = CONFIG.economy.pads.cart_barn.cost;
  const ctx = makeCtx(course, CONFIG, MAP), S = startShift(course, CONFIG, MAP), pad = MAP.places.cart_barn;
  /* from anywhere else, a buy does nothing: the card belongs to the pad */
  command(S, 'buy', 'build', 'cart_barn'); step(S, ctx);
  assert.equal(S.pads.cart_barn.st, 'open'); assert.equal(S.cash, course.cash);
  S.player.x = pad.x; S.player.y = pad.y;
  assert.equal(placeAt(S, ctx), 'cart_barn');
  const card = placeCard(S, ctx, 'cart_barn');
  assert.deepEqual(card.items.map(i => i.kind), ['build']); assert.equal(card.items[0].can, true);
  command(S, 'buy', 'build', 'cart_barn'); step(S, ctx);
  assert.equal(S.pads.cart_barn.st, 'building'); assert.equal(S.cash, 0); assert.equal(S.tally.spent, CONFIG.economy.pads.cart_barn.cost);
  command(S, 'buy', 'build', 'cart_barn'); step(S, ctx);
  assert.equal(S.tally.spent, CONFIG.economy.pads.cart_barn.cost, 'it cannot be bought twice');
  for (let i = 0; i < CONFIG.economy.pads.cart_barn.buildS * CONFIG.shift.tick + 5; i++) step(S, ctx);
  assert.equal(S.pads.cart_barn.st, 'done'); assert.equal(S.carts, true);
  assert.deepEqual(placeCard(S, ctx, 'cart_barn').items.map(i => i.kind), ['up', 'hire'], 'built, its card offers a level and a hire');
  /* no cash, nothing on the card can be bought */
  const poor = newCourse(CONFIG, MAP, 1), P = startShift(poor, CONFIG, MAP);
  assert.equal(placeCard(P, ctx, 'cart_barn').items[0].can, false);
  assert.equal(stations(P, ctx, []).find(x => x.place === 'cart_barn').can, false);
  /* one pad a place, each on the map */
  const pads = stations(P, ctx, [], true).filter(x => x.pad);
  assert.equal(pads.length, Object.keys(CONFIG.economy.places).length);
  for (const id in CONFIG.economy.places) assert.ok(MAP.places[id], id + ' has a pad');
});

test('hole 4: three layouts on its card, the plot follows the one bought, and it opens the next morning', () => {
  const course = newCourse(CONFIG, MAP, 1); course.cash = 9000;
  const ctx = makeCtx(course, CONFIG, MAP), S = startShift(course, CONFIG, MAP), at = MAP.places.hole_4;
  S.player.x = at.x; S.player.y = at.y;
  const card = placeCard(S, ctx, 'hole_4');
  assert.deepEqual(card.items.map(i => i.layout), Object.keys(MAP.layouts[4]));
  assert.equal(new Set(card.items.map(i => i.yards)).size, 3, 'three lengths');
  for (const it of card.items) assert.equal(it.cost, Math.round(CONFIG.economy.pads.hole_4.cost * CONFIG.economy.layouts[it.layout].cost / 5) * 5);
  /* holes 5 and 6 wait their turn */
  assert.equal(placeCard(S, ctx, 'hole_5').st, 'locked'); assert.equal(placeCard(S, ctx, 'hole_5').items.length, 0);
  command(S, 'buy', 'build', 'hole_4:signature'); step(S, ctx);
  assert.equal(S.pads.hole_4.st, 'clearing'); assert.equal(S.layouts[4], 'signature');
  assert.equal(S.cash, course.cash - card.items.find(i => i.layout === 'signature').cost);
  const line = MAP.layouts[4].signature.line, end = line[line.length - 1], last = S.plot.pts[S.plot.pts.length - 1];
  assert.ok(Math.hypot(last.x - end.x, last.y - end.y) < 0.01, 'the plot runs to the signature green');
  assert.equal(S.holes[3].par, MAP.layouts[4].signature.par);
  /* the bot mows it clear; overnight it opens on its layout */
  let c = endShift(S, ctx, course).course, r = null;
  assert.equal(c.unlocks.hole_4, 'clearing'); assert.equal(c.layouts[4], 'signature');
  for (let i = 0; i < 3 && !c.holes[3].open; i++) { const p = play(c); r = p.end.result; c = p.end.course; }
  assert.equal(c.holes[3].open, true); assert.equal(c.unlocks.hole_4, 'done'); assert.deepEqual(r.opened, [4]);
  assert.equal(c.holes[3].par, MAP.layouts[4].signature.par);
  const next = makeCtx(c, CONFIG, MAP);
  assert.deepEqual(next.route.plan, [1, 2, 3, 4, 1, 2]);
  assert.equal(next.geoms[4].hazards.filter(z => z.type === 'water').length, 1, 'its water is in the shot model, in yards');
  assert.equal(next.geoms[4].hazards[0].x, MAP.layouts[4].signature.hazards[0].x * CONFIG.shot.yardsPerUnit);
  /* the next morning hole 5 is for sale, and hole 4 levels up */
  const T = startShift(c, CONFIG, MAP);
  assert.equal(placeCard(T, next, 'hole_5').st, 'open');
  assert.deepEqual(placeCard(T, next, 'hole_4').items.map(i => i.kind), ['up']);
  assert.ok(T.greens[4] >= 0 && T.greens[4] <= 100, 'a new hole has a real green');
});

test('a hole bought before there was a choice opens on its classic layout', () => {
  const c = newCourse(CONFIG, MAP, 4); c.unlocks.hole_4 = 'building'; delete c.layouts;
  const m = migrateCourse(c, CONFIG), { end } = play(m);
  assert.equal(end.course.holes[3].open, true); assert.equal(end.course.layouts[4], 'classic');
  assert.deepEqual(holesOf(MAP, end.course.layouts)[3].line, MAP.layouts[4].classic.line);
  assert.deepEqual(MAP.layouts[4].classic.line, MAP.holes[3].line, 'classic is the map\'s own line');
  for (const o of [4, 5, 6]) assert.equal(MAP.layouts[o].classic.par, MAP.holes[o - 1].par);
});

test('the layouts trade: short plays fast and earns least, signature earns most', () => {
  const geo = key => { const c = newCourse(CONFIG, MAP, 1); c.layouts = { 4: key, 5: key, 6: key }; return holesOf(MAP, c.layouts).slice(3, 6); };
  const par = key => geo(key).reduce((a, h) => a + h.par, 0);
  assert.ok(par('short') < par('classic') && par('classic') < par('signature'), 'pars ' + par('short') + ' ' + par('classic') + ' ' + par('signature'));
  const L = CONFIG.economy.layouts;
  assert.ok(L.short.fee < L.classic.fee && L.classic.fee < L.signature.fee);
  assert.ok(L.short.design < L.classic.design && L.classic.design < L.signature.design);
  assert.ok(geo('signature').every(h => h.hazards.length >= 1) && geo('signature').some(h => h.hazards.some(z => z.type === 'water')));
  /* every layout's tee is its hole's tee, and every hazard sits within reach of its line */
  for (const o of [4, 5, 6]) for (const key in MAP.layouts[o]) {
    const l = MAP.layouts[o][key];
    assert.deepEqual(l.line[0], MAP.holes[o - 1].line[0]);
    for (const z of l.hazards) { let best = 1e9; for (let i = 1; i < l.line.length; i++) { const a = l.line[i - 1], b = l.line[i], vx = b.x - a.x, vy = b.y - a.y, t = Math.max(0, Math.min(1, ((z.x - a.x) * vx + (z.y - a.y) * vy) / (vx * vx + vy * vy))); best = Math.min(best, Math.hypot(z.x - a.x - vx * t, z.y - a.y - vy * t)); } assert.ok(best < 6, o + ' ' + key + ' hazard ' + best); }
  }
});

test('going Public: it waits for six holes and the stars, then pays more from the next morning', () => {
  const c = newCourse(CONFIG, MAP, 6), T = CONFIG.economy.tiers.public;
  for (const o of [4, 5, 6]) { c.unlocks['hole_' + o] = 'done'; c.layouts[o] = 'classic'; c.holes[o - 1].open = true; }
  c.shiftsFiled = 20; c.cash = T.cost + 500;
  const ctx = makeCtx(c, CONFIG, MAP), at = MAP.places.clubhouse;
  /* too few stars: the step is on the card, locked */
  c.stars = T.stars - 0.5; let S = startShift(c, CONFIG, MAP); S.player.x = at.x; S.player.y = at.y;
  let it = placeCard(S, ctx, 'clubhouse').items.find(i => i.kind === 'tier');
  assert.ok(it && it.locked && !it.can);
  command(S, 'buy', 'tier', 'public'); step(S, ctx); assert.equal(S.tier, 'muni');
  /* too few holes */
  const few = clone(c); few.stars = 4; few.holes[5].open = false; few.unlocks.hole_6 = 'clearing';
  S = startShift(few, CONFIG, MAP); assert.ok(placeCard(S, makeCtx(few, CONFIG, MAP), 'clubhouse').items.find(i => i.kind === 'tier').locked);
  /* ready */
  c.stars = T.stars + 0.5; S = startShift(c, CONFIG, MAP); S.player.x = at.x; S.player.y = at.y;
  it = placeCard(S, ctx, 'clubhouse').items.find(i => i.kind === 'tier');
  assert.ok(it.can && !it.locked);
  const fee0 = feeOf(S, ctx);
  command(S, 'buy', 'tier', 'public'); step(S, ctx);
  assert.equal(S.tier, 'public'); assert.equal(S.cash, c.cash - T.cost);
  assert.equal(feeOf(S, ctx), fee0, 'the day already booked plays at the old prices');
  while (!S.done) { step(S, ctx); if (S.phase === 'after') command(S, 'end'); }
  const next = endShift(S, ctx, c).course;
  assert.equal(next.tier, 'public');
  const P = startShift(next, CONFIG, MAP), M = startShift(Object.assign(clone(next), { tier: 'muni' }), CONFIG, MAP);
  assert.equal(Math.round(feeOf(P, ctx) * 1000), Math.round(feeOf(M, ctx) * T.fee * 1000));
  assert.ok(P.groups.length > M.groups.length, 'more groups book a public course');
  assert.ok(P.goal > M.goal);
  /* league players only at a public course */
  const kinds = new Set();
  for (let seed = 1; seed < 60; seed++) { const k = clone(next); k.seed = seed; for (const g of startShift(k, CONFIG, MAP).groups) kinds.add(g.type); }
  assert.ok(kinds.has('league'));
  for (let seed = 1; seed < 60; seed++) { const k = clone(next); k.seed = seed; k.tier = 'muni'; for (const g of startShift(k, CONFIG, MAP).groups) assert.notEqual(g.type, 'league'); }
});

test('mowing restores a green, and a day wears it down', () => {
  const course = newCourse(CONFIG, MAP, 2), { S, end } = play(course);
  for (const ord of S.open) assert.equal(S.greens[ord], 100, 'green ' + ord + ' was mown');
  for (const h of end.course.holes) if (h.open) assert.equal(h.green, 100 - CONFIG.stars.greenDecay);
});

test('the cart: walking into it rides it, about three times faster, and Leave gets out', () => {
  const course = newCourse(CONFIG, MAP, 2), ctx = makeCtx(course, CONFIG, MAP), S = startShift(course, CONFIG, MAP);
  command(S, 'goto', MAP.cartPark.x, MAP.cartPark.y);
  for (let i = 0; i < 60; i++) step(S, ctx);
  assert.equal(S.player.mode, 'cart');
  const x0 = S.player.x; command(S, 'dir', 0);
  for (let i = 0; i < 30; i++) step(S, ctx);
  const v = Math.hypot(S.player.vx, S.player.vy);
  assert.ok(Math.abs(v - CONFIG.shift.cart) < 0.2 && S.player.x - x0 > 25, 'cart speed ' + v);
  assert.ok(CONFIG.shift.cart / CONFIG.shift.walk > 2.5);
  command(S, 'dir', -1); step(S, ctx);
  assert.ok(Math.hypot(S.player.vx, S.player.vy) > 1, 'it drifts on');
  command(S, 'exit'); step(S, ctx);
  assert.equal(S.player.mode, 'walk');
  for (let i = 0; i < 5; i++) step(S, ctx);
  assert.equal(S.player.mode, 'walk', 'and does not climb straight back in');
});

test('the player cannot walk through the clubhouse or off the property', () => {
  const course = newCourse(CONFIG, MAP, 2), ctx = makeCtx(course, CONFIG, MAP), S = startShift(course, CONFIG, MAP);
  command(S, 'dir', 4);
  for (let i = 0; i < 100; i++) { step(S, ctx); const p = S.player, b = MAP.clubhouse; assert.ok(!(Math.abs(p.x - b.x) < b.w / 2 && Math.abs(p.y - b.y) < b.d / 2)); }
  command(S, 'dir', 12);
  for (let i = 0; i < 400; i++) step(S, ctx);
  assert.ok(S.player.y >= MAP.bounds.y0);
});

test('changing a config value changes the game, with no code edit', () => {
  const base = play(newCourse(CONFIG, MAP, 12)).end.result;
  const fee = clone(CONFIG); fee.economy.feePerHole = 2;
  assert.ok(play(newCourse(fee, MAP, 12), fee).end.result.fees > base.fees * 1.6, 'double the fee, about double the fees');
  const slow = clone(CONFIG); slow.golfers.holeS = { 3: 18, 4: 26, 5: 34 };
  assert.ok(play(newCourse(slow, MAP, 12), slow).end.result.avgRoundS > base.avgRoundS);
  const busy = clone(CONFIG); busy.golfers.groupsDay1 = 8;
  assert.equal(startShift(newCourse(busy, MAP, 12), busy, MAP).groups.length, 8);
  const pad = clone(CONFIG); pad.economy.pads.cart_barn.cost = 5;
  const course = newCourse(pad, MAP, 12), ctx = makeCtx(course, pad, MAP), S = startShift(course, pad, MAP);
  assert.equal(placeCard(S, ctx, 'cart_barn').items[0].cost, 5);
});

test('save and load: a course survives JSON, and an unknown schema is refused', () => {
  const a = play(newCourse(CONFIG, MAP, 21)).end.course;
  const b = migrateCourse(JSON.parse(JSON.stringify(a)), CONFIG);
  assert.deepEqual(b, a);
  assert.deepEqual(play(b).end, play(a).end, 'the next shift is the same from either copy');
  assert.equal(migrateCourse({ schema: 99 }, CONFIG), null);
  assert.equal(migrateCourse(null, CONFIG), null);
});

test('upgrades: every level costs more, raises what it says, and stops at the top', () => {
  const U = CONFIG.economy.upgrades, max = CONFIG.economy.upgradeMax;
  for (const id in U) {
    assert.ok(Object.values(CONFIG.economy.places).some(p => p.ups.includes(id)), id + ' is on a place\'s card');
    for (let l = 1; l < max - 1; l++) assert.ok(upgradeCost(CONFIG, id, l + 1) > upgradeCost(CONFIG, id, l), id + ' level ' + l);
    assert.equal(upgradeCost(CONFIG, id, 1), U[id].cost);
  }
  const course = newCourse(CONFIG, MAP, 3); course.unlocks.cart_barn = 'done';
  const ctx = makeCtx(course, CONFIG, MAP), base = startShift(course, CONFIG, MAP);
  const top = JSON.parse(JSON.stringify(course)); for (const id in U) top.levels[id] = max;
  const S = startShift(top, CONFIG, MAP);
  assert.ok(feeOf(S, ctx) > feeOf(base, ctx) * 1.5, 'a maxed course earns more a golfer: ' + feeOf(base, ctx) + ' to ' + feeOf(S, ctx));
  assert.ok(S.fx.walk > base.fx.walk && S.fx.cart > base.fx.cart && S.fx.mower > base.fx.mower && S.fx.mow < base.fx.mow);
  assert.ok(S.fx.checkin < base.fx.checkin && S.fx.checkin > 0 && S.fx.sendoff < base.fx.sendoff && S.fx.sendoff > 0);
  assert.ok(S.fx.patCounter > base.fx.patCounter && S.fx.patTee > base.fx.patTee && S.fx.pace < base.fx.pace);
  assert.ok(S.groups.length > base.groups.length, 'a bigger parking lot books more groups');
  assert.ok(shopList(S, ctx).filter(i => i.kind === 'up').every(i => i.done && !i.can), 'nothing levels past the top');
  const list = shopList(base, ctx);
  assert.ok(list.length >= 12 && list[0].cost <= list[1].cost, 'the list is cheapest first');
  assert.equal(levelOf(base, CONFIG, 'boots'), 1);
  const fresh = startShift(newCourse(CONFIG, MAP, 3), CONFIG, MAP);
  assert.equal(levelOf(fresh, CONFIG, 'cart_barn'), 0, 'the cart barn has no level until it is built');
  assert.ok(!placeCard(fresh, ctx, 'cart_barn').items.some(i => i.kind === 'up'));
});

test('upgrades: a level is bought from the place\'s card, and it carries to the next day', () => {
  const course = newCourse(CONFIG, MAP, 4); course.cash = 20;
  const ctx = makeCtx(course, CONFIG, MAP), S = startShift(course, CONFIG, MAP), pad = MAP.places.clubhouse, walk0 = S.fx.walk;
  S.player.x = pad.x; S.player.y = pad.y;
  for (let i = 0; i < 30; i++) step(S, ctx);
  assert.equal(S.levels.boots, undefined, 'standing on a pad buys nothing by itself');
  command(S, 'buy', 'up', 'boots'); step(S, ctx);
  assert.equal(S.levels.boots, 2); assert.equal(S.cash, 0); assert.ok(S.fx.walk > walk0); assert.equal(S.tally.upgrades, 1);
  command(S, 'buy', 'up', 'boots'); step(S, ctx);
  assert.equal(S.levels.boots, 2, 'no cash, no second level');
  command(S, 'buy', 'up', 'shop'); step(S, ctx);
  assert.equal(S.levels.shop, undefined, 'the pro shop is not on the clubhouse\'s card');
  while (S.phase !== 'after') step(S, ctx);
  command(S, 'end'); step(S, ctx);
  assert.equal(S.done, true);
  const end = endShift(S, ctx, course);
  assert.equal(end.course.levels.boots, 2);
  assert.equal(startShift(end.course, CONFIG, MAP).fx.walk, walk0 + CONFIG.economy.upgrades.boots.walk);
});

test('upgrades: cash never goes below zero, even when a paid group walks off after a spend', () => {
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    let c = newCourse(CONFIG, MAP, seed);
    for (let d = 0; d < 12; d++) {
      const ctx = makeCtx(c, CONFIG, MAP), S = startShift(c, CONFIG, MAP), bot = makeBot();
      while (!S.done) { bot(S, ctx); step(S, ctx); assert.ok(S.cash >= 0, 'seed ' + seed + ' day ' + (d + 1) + ' cash ' + S.cash); }
      c = endShift(S, ctx, c).course;
    }
    assert.ok(Object.keys(c.levels).length >= 3, 'twelve days buy a few upgrades');
  }
});

test('a course saved before upgrades existed still loads, at level 1', () => {
  const old = newCourse(CONFIG, MAP, 5); delete old.levels;
  const c = migrateCourse(JSON.parse(JSON.stringify(old)), CONFIG);
  assert.deepEqual(c.levels, {});
  assert.equal(levelOf(startShift(c, CONFIG, MAP), CONFIG, 'shop'), 1);
});

test('new buildings: built, each has a look and a number of its own', () => {
  const plain = newCourse(CONFIG, MAP, 6); plain.unlocks.cart_barn = 'done';
  const built = JSON.parse(JSON.stringify(plain)); for (const id of ['putting_green', 'snack_shack', 'driving_range']) built.unlocks[id] = 'done';
  const A = startShift(plain, CONFIG, MAP), B = startShift(built, CONFIG, MAP);
  assert.equal(A.fx.snack, 0); assert.equal(A.fx.range, 0); assert.equal(A.fx.practice, 0);
  assert.ok(B.fx.snack > 0 && B.fx.range > 0 && B.fx.practice > 0 && B.fx.patCourse > A.fx.patCourse);
  const looks = looksOf(B, CONFIG, {});
  assert.equal(looks['snack_shack:st'], 'done'); assert.equal(looks.snack_shack, 0);
  assert.equal(looksOf(A, CONFIG, {}).snack_shack, -1, 'not built, no look');
});

test('gardens raise the design part of a review, the clubhouse the tip, the parking lot the bookings', () => {
  const a = newCourse(CONFIG, MAP, 7), b = JSON.parse(JSON.stringify(a)); b.levels.gardens = 10; b.levels.clubhouse = 10; b.levels.parking = 10;
  const A = startShift(a, CONFIG, MAP), B = startShift(b, CONFIG, MAP);
  assert.ok(B.fx.design > A.fx.design && B.fx.design <= 1); assert.ok(B.fx.tipMax > A.fx.tipMax); assert.ok(B.groups.length > A.groups.length);
  assert.equal(looksOf(B, CONFIG, {}).gardens, 3); assert.equal(looksOf(A, CONFIG, {}).gardens, 0);
});

test('a filed shift replays well inside the server\'s 10 ms of CPU, late in the game too', () => {
  let c = newCourse(CONFIG, MAP, 3), worst = 0;
  for (let d = 0; d < 40; d++) {
    const ctx = makeCtx(c, CONFIG, MAP), S = startShift(c, CONFIG, MAP), bot = makeBot();
    while (!S.done) { bot(S, ctx); step(S, ctx); }
    if (d >= 30) { let best = 1e9; for (let k = 0; k < 4; k++) { const t = process.hrtime.bigint(); replay(c, S.log, CONFIG, MAP); best = Math.min(best, Number(process.hrtime.bigint() - t) / 1e6); } worst = Math.max(worst, best); }
    c = endShift(S, ctx, c).course;
  }
  assert.ok(worst < 6, 'the slowest replay took ' + worst.toFixed(2) + ' ms');
});

test('after hours: the day ends on the player\'s word, not on the last group', () => {
  const course = newCourse(CONFIG, MAP, 2), ctx = makeCtx(course, CONFIG, MAP), S = startShift(course, CONFIG, MAP), bot = makeBot();
  while (S.phase !== 'after') { bot(S, ctx); step(S, ctx); }
  assert.equal(S.done, false, 'the last group is in and the day is still going');
  assert.ok(S.groups.every(g => g.st === 'gone'));
  const cash = S.cash, earned = S.tally.fees - S.tally.refunds + S.tally.tips + S.tally.extras;
  for (let i = 0; i < 200; i++) step(S, ctx);
  assert.equal(S.done, false, 'after hours has no clock the player can see');
  assert.equal(S.cash, cash); assert.equal(S.tally.fees - S.tally.refunds + S.tally.tips + S.tally.extras, earned, 'nothing is earned after hours');
  command(S, 'end'); step(S, ctx);
  assert.equal(S.done, true);
  /* an 'end' before closing does nothing */
  const T = startShift(course, CONFIG, MAP); command(T, 'end'); step(T, ctx); assert.equal(T.done, false);
  /* nobody at the controls: after hours still ends, at its longest */
  const I = startShift(course, CONFIG, MAP); let n = 0; while (!I.done && n++ < 20000) step(I, ctx);
  assert.equal(I.done, true);
});

test('a hire runs a station for you, slower than you would', () => {
  const U = 'u', course = newCourse(CONFIG, MAP, 3), hired = JSON.parse(JSON.stringify(course)); hired.staff.clerk = 1; hired.staff.starter = 1; hired.staff.greenskeeper = 1;
  const ctx = makeCtx(hired, CONFIG, MAP), S = startShift(hired, CONFIG, MAP);
  while (!S.done) { step(S, ctx); if (S.phase === 'after') command(S, 'end'); }      // nobody at the controls at all
  const r = endShift(S, ctx, hired).result;
  assert.ok(r.rounds >= 3, 'the clerk and the starter got groups round: ' + r.rounds);
  assert.ok(r.cash > 0);
  for (const ord of S.open) assert.ok(S.greens[ord] >= CONFIG.economy.greenskeeperCut, 'the greenskeeper cut green ' + ord);
  for (const ord of S.open) assert.ok(S.greens[ord] < 100, 'but not as well as you would');
  assert.ok(CONFIG.economy.staffSpeed < 1 && CONFIG.economy.staffDelayS > 0);
  /* hiring: from the place's card, once */
  const rich = JSON.parse(JSON.stringify(course)); rich.cash = 1000;
  const H = startShift(rich, CONFIG, MAP); H.player.x = MAP.places.shop.x; H.player.y = MAP.places.shop.y;
  command(H, 'buy', 'hire', 'clerk'); step(H, ctx);
  assert.equal(H.staff.clerk, 1); assert.equal(H.cash, 1000 - CONFIG.economy.staff.clerk.cost); assert.equal(H.tally.hires, 1);
  command(H, 'buy', 'hire', 'clerk'); step(H, ctx);
  assert.equal(H.cash, 1000 - CONFIG.economy.staff.clerk.cost, 'nobody is hired twice');
  while (H.phase !== 'after') step(H, ctx); command(H, 'end'); step(H, ctx);
  assert.equal(endShift(H, ctx, rich).course.staff.clerk, 1, 'a hire is kept');
});

test('hands on: cart keys, the snack shack and the range each need a hand, or a hire', () => {
  const base = newCourse(CONFIG, MAP, 6); for (const id of ['cart_barn', 'snack_shack', 'driving_range']) base.unlocks[id] = 'done';
  const run = (course, hands) => { const ctx = makeCtx(course, CONFIG, MAP), S = startShift(course, CONFIG, MAP), bot = makeBot(); while (!S.done) { if (hands) bot(S, ctx); else if (S.phase === 'after') command(S, 'end'); step(S, ctx); } return S; };
  /* a clerk and a starter get groups round, but nobody is at the barn, the shack or the range */
  const alone = JSON.parse(JSON.stringify(base)); alone.staff.clerk = 1; alone.staff.starter = 1; alone.baskets = 0;
  const A = run(alone, false);
  assert.ok(A.tally.rounds >= 3);
  assert.equal(A.tally.extras, 0, 'no keys handed, nothing served, no balls: nothing extra earned');
  assert.ok(A.groups.every(g => !g.cart), 'nobody got a cart');
  assert.equal(A.tally.stuck + A.tally.cutOff, 0, 'and nobody was left standing at the barn or the shack');
  /* hire the three and it all runs */
  const staffed = JSON.parse(JSON.stringify(alone)); staffed.staff.attendant = 1; staffed.staff.cook = 1; staffed.staff.range_hand = 1;
  const B = run(staffed, false);
  assert.ok(B.tally.extras > 0); assert.ok(B.groups.some(g => g.cart)); assert.equal(B.baskets <= CONFIG.economy.rangeBaskets, true);
  /* or do it by hand: the goal line sends the player to each */
  const C = run(base, true);
  assert.ok(C.tally.extras > 0, 'by hand, the extras come in');
  assert.equal(C.tally.stuck + C.tally.cutOff, 0);
});

test('the putting green charges only while it is kept', () => {
  const c = newCourse(CONFIG, MAP, 7); c.unlocks.putting_green = 'done'; c.pg = 100;
  const ctx = makeCtx(c, CONFIG, MAP), good = startShift(c, CONFIG, MAP);
  const bad = startShift(Object.assign(JSON.parse(JSON.stringify(c)), { pg: CONFIG.economy.practiceMinCondition - 1 }), CONFIG, MAP);
  assert.ok(feeOf(good, ctx) > feeOf(bad, ctx));
  assert.equal(startShift(newCourse(CONFIG, MAP, 7), CONFIG, MAP).pg, -1, 'not built, no green');
});

/* ---- step 2: kinds of group, the day's event, reviews you can read, a day won or lost ---- */
const later = (seed, no) => { const c = newCourse(CONFIG, MAP, seed); c.shiftsFiled = no - 1; return c; };
function withEvent(name) {
  for (let seed = 1; seed < 400; seed++) { const c = later(seed, 5), S = startShift(c, CONFIG, MAP); if (S.event === name) return c; }
  throw new Error('no seed gives ' + name);
}

test('day 1 is plain: no event, every group a regular', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const S = startShift(newCourse(CONFIG, MAP, seed), CONFIG, MAP);
    assert.equal(S.event, '');
    assert.ok(S.groups.every(g => g.type === 'regular' && g.pm === 1 && !g.critic));
  }
});

test('later days draw every kind of group and every event, and the tee sheet is the same sheet', () => {
  const kinds = new Set(), events = new Set();
  for (let seed = 1; seed <= 200; seed++) { const S = startShift(later(seed, 6), CONFIG, MAP); events.add(S.event); for (const g of S.groups) kinds.add(g.type); }
  assert.deepEqual([...kinds].sort(), Object.keys(CONFIG.golfers.typeOdds).sort());
  assert.deepEqual([...events].sort(), ['', ...Object.keys(CONFIG.events.odds)].sort());
  /* kinds and events come from their own stream: with events off, the arrivals and sizes do not move */
  const off = clone(CONFIG); off.events.chance = 0;
  const c = withEvent('heat'), a = startShift(c, CONFIG, MAP), b = startShift(c, off, MAP);
  assert.deepEqual(a.groups.map(g => [g.arrive, g.size, g.pace]), b.groups.map(g => [g.arrive, g.size, g.pace]));
});

test('each event does what it says', () => {
  const off = clone(CONFIG); off.events.chance = 0;
  let c = withEvent('outing');
  assert.ok(startShift(c, CONFIG, MAP).groups.length > startShift(c, off, MAP).groups.length, 'an outing books more groups');
  c = withEvent('rain');
  const wet = startShift(c, CONFIG, MAP), dry = startShift(c, off, MAP);
  for (const ord of wet.open) assert.equal(wet.greens[ord], Math.max(0, dry.greens[ord] - CONFIG.events.rain.greens));
  c = withEvent('heat');
  assert.equal(startShift(c, CONFIG, MAP).fx.patTee, startShift(c, off, MAP).fx.patTee * CONFIG.events.heat.wait);
  assert.equal(startShift(c, CONFIG, MAP).fx.patCourse, startShift(c, off, MAP).fx.patCourse);
  c = withEvent('critic');
  const S = startShift(c, CONFIG, MAP);
  assert.equal(S.groups.filter(g => g.critic).length, 1);
  /* nobody at the counter: the critic walks off too, and that review counts `weight` times */
  const idle = play(c, CONFIG, () => {});
  assert.equal(idle.S.reviews.length - c.reviews.length, idle.end.result.walkOffs + CONFIG.events.critic.weight - 1);
});

test('a group in a rush gives up sooner than a tourist', () => {
  const c = later(3, 6), ctx = makeCtx(c, CONFIG, MAP), S = startShift(c, CONFIG, MAP);
  S.groups.forEach((g, i) => { g.type = i % 2 ? 'rush' : 'tourist'; g.pm = CONFIG.golfers.types[g.type].patience; });
  while (!S.done) step(S, ctx);
  const waited = t => { const v = S.groups.filter(g => g.type === t).map(g => g.wc); return v.reduce((a, b) => a + b, 0) / v.length; };
  assert.ok(waited('rush') < waited('tourist'), waited('rush') + ' against ' + waited('tourist'));
});

test('every group leaves a review you can read', () => {
  const { S, end } = play(later(11, 6));
  assert.equal(S.notes.length, end.result.rounds + end.result.walkOffs);
  const WHY = ['great', 'greens', 'pace', 'wait', 'keys', 'snack', 'plain', 'counter', 'tee', 'course'];
  for (const n of S.notes) { assert.ok(WHY.includes(n.why), n.why); assert.ok(n.stars >= 1 && n.stars <= 5); assert.ok(CONFIG.golfers.types[n.type]); }
  const idle = play(later(11, 6), CONFIG, () => {});
  assert.ok(idle.S.notes.length > 0 && idle.S.notes.every(n => n.why === 'counter' && n.stars === CONFIG.stars.walkOffReview));
});

test('a day that meets its goal is won and pays the bonus; a lost day pays none', () => {
  const won = play(newCourse(CONFIG, MAP, 5)).end.result;
  assert.ok(won.goalMet);
  assert.equal(won.bonus, Math.round(won.goal * CONFIG.economy.goalBonus));
  const lost = play(newCourse(CONFIG, MAP, 5), CONFIG, () => {}).end.result;
  assert.ok(!lost.goalMet);
  assert.equal(lost.bonus, 0);
});
