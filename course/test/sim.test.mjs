/* The simulation: determinism, routing, the watchdog, the economy step, config as data. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { CONFIG } from '../config.js';
import { MAP } from '../map.js';
import { newCourse, startShift, step, endShift, makeCtx, replay, command, roundPlan, buildRoute, goalOf, starsOf, goalFor, stations, migrateCourse, levelOf, upgradeCost, feeOf, shopList, looksOf } from '../sim.js';
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
  assert.equal(r.cashAfter, course.cash + r.cash - r.spent);
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

test('the pad: standing on it with the cash buys it, builds it, and golfers ride', () => {
  const course = newCourse(CONFIG, MAP, 1); course.cash = CONFIG.economy.pads.cart_barn.cost;
  const { S, end } = play(course);
  assert.ok(S.tally.spent >= CONFIG.economy.pads.cart_barn.cost);
  assert.equal(end.course.unlocks.cart_barn, 'done');
  const next = startShift(end.course, CONFIG, MAP);
  assert.equal(next.carts, true);
  /* not enough cash: the ring has no work */
  const poor = newCourse(CONFIG, MAP, 1), ctx = makeCtx(poor, CONFIG, MAP), P = startShift(poor, CONFIG, MAP);
  const st = stations(P, ctx, []).find(x => x.id === 'cart_barn');
  assert.equal(st.can, false);
});

test('hole 4: buying it starts the clearing, and the mower clears the plot', () => {
  const course = newCourse(CONFIG, MAP, 1); course.cash = 5000; course.unlocks.cart_barn = 'done';
  const { end } = play(course);
  assert.ok(['clearing', 'building'].includes(end.course.unlocks.hole_4), 'bought: ' + end.course.unlocks.hole_4);
  let c = end.course;
  for (let i = 0; i < 3 && c.unlocks.hole_4 !== 'building'; i++) c = play(c).end.course;
  assert.equal(c.unlocks.hole_4, 'building');
  assert.equal(c.holes[3].open, false, 'opening the hole is a later phase');
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
  const slow = clone(CONFIG); slow.golfers.holeS = { 3: 28, 4: 40, 5: 52 };
  assert.ok(play(newCourse(slow, MAP, 12), slow).end.result.avgRoundS > base.avgRoundS);
  const busy = clone(CONFIG); busy.golfers.groupsDay1 = 8;
  assert.equal(startShift(newCourse(busy, MAP, 12), busy, MAP).groups.length, 8);
  const pad = clone(CONFIG); pad.economy.pads.cart_barn.cost = 5;
  const course = newCourse(pad, MAP, 12), ctx = makeCtx(course, pad, MAP), S = startShift(course, pad, MAP); S.cash = 5;
  assert.match(goalOf(Object.assign(S, { phase: 'open', greens: { 1: 100, 2: 100, 3: 100 }, groups: [] }), ctx).text, /\$5\./);
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
    assert.ok(MAP.upgradePads[id], id + ' has a pad on the map');
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
  assert.ok(!stations(S, ctx, [], true).some(st => st.up), 'a maxed thing has no pad left');
  assert.ok(shopList(S, ctx).filter(i => i.kind === 'level').every(i => i.done && !i.can));
  const list = shopList(base, ctx);
  assert.ok(list.length >= 12 && list[0].cost <= list[1].cost, 'the list is cheapest first');
  assert.equal(levelOf(base, CONFIG, 'boots'), 1);
  const fresh = startShift(newCourse(CONFIG, MAP, 3), CONFIG, MAP);
  assert.equal(levelOf(fresh, CONFIG, 'cart_barn'), 0, 'the cart barn has no level until it is built');
  assert.ok(!stations(fresh, ctx, [], true).some(st => st.up === 'cart_barn'));
});

test('upgrades: standing on a pad with the cash buys one level, and it carries to the next day', () => {
  const course = newCourse(CONFIG, MAP, 4); course.cash = 20;
  const ctx = makeCtx(course, CONFIG, MAP), S = startShift(course, CONFIG, MAP), pad = MAP.upgradePads.boots, walk0 = S.fx.walk;
  S.player.x = pad.x; S.player.y = pad.y;
  for (let i = 0; i < 30; i++) step(S, ctx);
  assert.equal(S.levels.boots, 2); assert.equal(S.cash, 0); assert.ok(S.fx.walk > walk0); assert.equal(S.tally.upgrades, 1);
  for (let i = 0; i < 60; i++) step(S, ctx);
  assert.equal(S.levels.boots, 2, 'no cash, no second level');
  while (!S.done) step(S, ctx);
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

test('new buildings: the putting green, the snack shack and the range each add income once built', () => {
  const plain = newCourse(CONFIG, MAP, 6); plain.unlocks.cart_barn = 'done';
  const built = JSON.parse(JSON.stringify(plain)); for (const id of ['putting_green', 'snack_shack', 'driving_range']) built.unlocks[id] = 'done';
  const ctx = makeCtx(plain, CONFIG, MAP), A = startShift(plain, CONFIG, MAP), B = startShift(built, CONFIG, MAP);
  assert.equal(A.fx.snack, 0); assert.equal(A.fx.range, 0); assert.equal(A.fx.practice, 0);
  assert.ok(B.fx.snack > 0 && B.fx.range > 0 && B.fx.practice > 0 && B.fx.patCourse > A.fx.patCourse);
  assert.ok(feeOf(B, ctx) > feeOf(A, ctx));
  const bot = makeBot(); while (!B.done) { bot(B, ctx); step(B, ctx); }
  assert.ok(B.tally.extras > 0, 'snacks were sold at the turn');
  const r = endShift(B, ctx, built).result;
  assert.equal(r.cash, r.fees + r.tips + r.extras);
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
