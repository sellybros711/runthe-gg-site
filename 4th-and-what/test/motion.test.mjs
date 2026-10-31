/* Pre-snap motion, play action, the defense's plans, and the game from any
 * down, distance and spot.
 *
 *   node --test 4th-and-what/test/motion.test.mjs */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { PLAYBOOK, VARIANTS } from '../build/tune.mjs';
const require = createRequire(import.meta.url);
const E = require('../engine.js'), C = require('../config.js'), F = require('../formations.js');
const T = C.TUNING;
const at = (o) => Object.assign({}, C.SCENARIO, o);
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, msg + ': ' + a + ' against ' + b);
const idx = (r, id) => r.ids.findIndex(x => x.id === id);

const JET = VARIANTS['jet slant flat'].play;
const PA = VARIANTS['pa deep shot'].play;
const ORBIT = VARIANTS['orbit inside zone'].play;

test('motion and play action are deterministic, frame for frame', () => {
  for (const play of [JET, PA, ORBIT, Object.assign({}, JET, { playAction: true })]) for (const d of [1, 5, 15]) for (const s of [3, 99, 4242]) {
    const a = JSON.stringify(E.run(at({ distance: d }), play, s)), b = JSON.stringify(E.run(at({ distance: d }), play, s));
    assert.equal(a, b, 'distance ' + d + ' seed ' + s);
  }
});

test('the motion man runs his motion before the snap and starts from its end', () => {
  const r = E.run(at({ distance: 5 }), JET, 7);
  const i = idx(r, 'SLOT'), from = JET.moved.SLOT, end = JET.motion.pts[JET.motion.pts.length - 1];
  assert.ok(r.pre.length > 10, 'there are pre-snap frames');
  assert.equal(r.pre[r.pre.length - 1].t, 0, 'the pre-snap ends at the snap');
  assert.ok(r.pre[0].t < 0 && r.pre.every((f, k) => k === 0 || f.t > r.pre[k - 1].t), 'time runs up to the snap');
  assert.equal(r.pre[0].p.length, 22);
  near(r.pre[0].p[i][0], r.BX + from[0], 0.01, 'he starts where he lined up');
  near(r.pre[0].p[i][1], r.Y0 + from[1], 0.01, 'he starts where he lined up');
  near(r.pre[r.pre.length - 1].p[i][0], r.BX + end[0], 0.01, 'the motion ends at its last point');
  /* at the snap he is where the motion ended, and already moving */
  near(r.frames[0].p[i][0], r.BX + end[0], 0.5, 'the snap is from the motion end');
  near(r.frames[0].p[i][1], r.Y0 + end[1], 0.5, 'the snap is from the motion end');
  const moved = Math.hypot(r.frames[0].p[i][0] - (r.BX + end[0]), r.frames[0].p[i][1] - (r.Y0 + end[1]));
  const still = E.run(at({ distance: 5 }), Object.assign({}, JET, { motion: null, moved: { SLOT: end } }), 7);
  const fromRest = Math.hypot(still.frames[0].p[i][0] - (still.BX + end[0]), still.frames[0].p[i][1] - (still.Y0 + end[1]));
  assert.ok(moved > fromRest + 0.05, 'a running start: ' + moved + ' in the first step against ' + fromRest + ' from rest');
  /* everybody else is set through the motion */
  const j = idx(r, 'CB1');
  assert.ok(r.pre.every(f => f.p[j][0] === r.pre[0].p[j][0] && f.p[j][1] === r.pre[0].p[j][1]), 'the defense is set');
  near(r.motion.time, (r.pre.length - 1) * r.dt, 0.001, 'the motion time');
  assert.deepEqual(r.motion.to, end);
  /* without motion there is no pre-snap */
  assert.deepEqual(E.run(at({ distance: 5 }), PLAYBOOK['slant flat'], 7).pre, []);
});

test('the defense aligns to the formation before the motion', () => {
  const pl = E.plans(at({ distance: 5 }), JET, 'cover3');
  const want = F.defense(JET.formation, JET.moved, 5);
  assert.deepEqual(pl.map(d => d.id), want.map(d => d.id));
  pl.forEach((d, k) => { near(d.at[0], want[k].at[0], 0.01, d.id); near(d.at[1], want[k].at[1], 0.01, d.id); });
  /* lining up at the motion's end instead would draw a different defense */
  const end = JET.motion.pts[JET.motion.pts.length - 1];
  const other = F.defense(JET.formation, { SLOT: end }, 5);
  assert.notDeepEqual(other.map(d => d.id + d.at), want.map(d => d.id + d.at));
  /* man coverage is matched at the snap: somebody has the motion man */
  const man = E.plans(at({ distance: 5 }), JET, 'cover1');
  assert.ok(man.some(d => d.plan === 'man' && d.man === 'SLOT'), 'the motion man is covered at the snap');
});

test('motion is made legal: an eligible man, a path that stays behind the line', () => {
  const up = Object.assign({}, PLAYBOOK['slant flat'], { motion: { who: 'SLOT', pts: [[-6, 3]] } });
  const r = E.run(at({ distance: 5 }), up, 1);
  assert.deepEqual(r.motion.to, [-6, -0.5], 'a motion that ends past the line is clamped behind it');
  const qb = Object.assign({}, PLAYBOOK['slant flat'], { motion: { who: 'QB', pts: [[3, -5]] } });
  assert.equal(E.run(at({ distance: 5 }), qb, 1).motion, null, 'the QB never motions');
  assert.equal(E.run(at({ distance: 5 }), Object.assign({}, qb, { motion: { who: 'LT', pts: [[-6, -1]] } }), 1).motion, null, 'nor a lineman');
  /* the route is named from where he is at the snap */
  assert.equal(E.routeName(r.motion.to, [[-6, 4], [-10, 8]]), E.routeName([-6, -0.5], [[-6, 4], [-10, 8]]));
});

test('play action: the fake, no throw before it, and the backers bite', () => {
  let saw = 0;
  for (let s = 1; s <= 40; s++) {
    const r = E.run(at({ distance: 5 }), PA, s);
    assert.ok(r.playAction);
    assert.ok(r.events.some(e => e.kind === 'fake' && e.text === 'Play action.'), 'the caption');
    const th = r.events.find(e => e.kind === 'throw');
    if (th) { assert.ok(th.t >= T.pa.fake, 'no throw before the fake: ' + th.t); saw++; }
  }
  assert.ok(saw > 0);
  /* the fake costs pocket time */
  const a = E.run(at({ distance: 5 }), PLAYBOOK['deep shot'], 11), b = E.run(at({ distance: 5 }), PA, 11);
  if (a.pocket > T.pocket.min + T.pa.pocket && a.pocket < T.pocket.max) near(b.pocket, a.pocket - T.pa.pocket, 0.011, 'pocket');
  /* a zone backer steps up to the fake */
  const i = idx(b, 'LB1'), z = E.run(at({ distance: 5 }), PA, 11, { call: 'cover3' }), z0 = E.run(at({ distance: 5 }), PLAYBOOK['deep shot'], 11, { call: 'cover3' });
  const k = Math.round(0.4 / z.dt);
  assert.ok(z.frames[k].p[i][1] < z0.frames[k].p[i][1] - 0.3, 'he bit');
  /* ignored on a run */
  const run = E.run(at({ distance: 1 }), Object.assign({}, PLAYBOOK['inside zone'], { playAction: true }), 5);
  assert.equal(run.playAction, false);
  assert.equal(JSON.stringify(run.frames), JSON.stringify(E.run(at({ distance: 1 }), PLAYBOOK['inside zone'], 5).frames));
});

test('plans() is the setup run() plays, for every call', () => {
  for (const play of [PLAYBOOK['slant flat'], PLAYBOOK.mesh, PLAYBOOK['inside zone'], JET, PA, ORBIT]) for (const d of [1, 5, 15]) for (const key of E.CALL_KEYS) {
    const pl = E.plans(at({ distance: d }), play, key), r = E.run(at({ distance: d }), play, 31, { call: key });
    assert.deepEqual(pl, r.plans, key + ' at ' + d);
    assert.equal(pl.length, 11);
    for (const p of pl) {
      assert.ok(['rush', 'man', 'zone'].includes(p.plan));
      if (p.plan === 'man') assert.ok(F.ELIGIBLE.includes(p.man), 'a man defender has an eligible man');
      if (p.plan === 'zone') assert.ok(Array.isArray(p.mark), 'a zone defender has a landmark');
      if (p.plan === 'rush') assert.equal(p.mark, null);
    }
    const rush = pl.filter(p => p.plan === 'rush').length;
    assert.equal(rush, r.call.rushers, 'the rushers are the call');
    /* the alignment is where the picture starts */
    const f = r.pre.length ? r.pre[0] : null;
    if (f) pl.forEach(p => { const j = idx(r, p.id); near(f.p[j][0], r.BX + p.at[0], 0.011, p.id); near(f.p[j][1], r.Y0 + p.at[1], 0.011, p.id); });
  }
});

test('the down changes only the call, and 4th down calls as before', () => {
  const rnd = (s) => { let x = s; return () => { x = (x * 16807) % 2147483647; return x / 2147483647; }; };
  for (const d of [1, 5, 10]) for (let s = 1; s < 50; s++) {
    assert.deepEqual(E.rollCall(T, d, 7, rnd(s), 4), E.rollCall(T, d, 7, rnd(s)), 'down 4 is the default');
  }
  /* the same call forced on any down plays the same */
  const a = E.run(at({ down: 1, distance: 5 }), PLAYBOOK.mesh, 9, { call: 'cover2' }), b = E.run(at({ down: 4, distance: 5 }), PLAYBOOK.mesh, 9, { call: 'cover2' });
  assert.equal(JSON.stringify(a.frames), JSON.stringify(b.frames));
  /* early downs blitz less */
  let b1 = 0, b4 = 0;
  for (let s = 1; s <= 400; s++) { if (E.run(at({ down: 1, distance: 5 }), PLAYBOOK.mesh, s).call.blitz) b1++; if (E.run(at({ distance: 5 }), PLAYBOOK.mesh, s).call.blitz) b4++; }
  assert.ok(b1 < b4, 'first down ' + b1 + ', fourth down ' + b4);
  assert.equal(a.downNum, 1); assert.equal(a.down, '1st and 5'); assert.equal(b.title === 'TURNOVER ON DOWNS' || b.win, true);
  if (!a.win) assert.equal(a.title, a.outcome === 'fumble' ? 'FUMBLE' : 'SHORT OF THE STICKS');
});

test('the next snap follows the spot', () => {
  for (let s = 1; s <= 60; s++) {
    const r = E.run(at({ down: 2, distance: 7, ballOn: 40 }), PLAYBOOK.curls, s);
    if (r.outcome === 'touchdown' || r.outcome === 'fumble' || r.outcome === 'safety') { assert.equal(r.next, null); continue; }
    if (r.win) assert.deepEqual(r.next, { down: 1, distance: 10, ballOn: 40 - r.yards });
    else assert.deepEqual(r.next, { down: 3, distance: 7 - r.yards, ballOn: 40 - r.yards });
  }
  const last = E.run(at({ distance: 15 }), PLAYBOOK.sneak, 3);
  if (!last.win) assert.equal(last.next, null, 'a failed 4th down ends the drive');
});

test('any spot: from the own 1 to the opponent 1, everybody stays on the field', () => {
  const plays = Object.values(PLAYBOOK).concat([JET, PA, ORBIT]);
  for (const ballOn of [99, 95, 50, 12, 3, 1]) for (const distance of [1, 10, 99]) for (const play of plays) for (const s of [2, 77]) {
    const r = E.run(at({ ballOn, distance }), play, s);
    assert.ok(r.distance <= ballOn, 'the distance is capped by the goal line');
    assert.equal(r.goal, r.distance >= ballOn);
    for (const f of r.pre.concat(r.frames)) for (const p of f.p) {
      assert.ok(Number.isFinite(p[0]) && Number.isFinite(p[1]));
      assert.ok(p[1] >= -10.5 && p[1] <= 110.5, 'inside the end lines: ' + p[1] + ' from the ' + ballOn);
      assert.ok(p[0] >= -1 && p[0] <= E.FIELD_W + 1, 'inside the sidelines: ' + p[0]);
    }
    assert.ok(['touchdown', 'down', 'sack', 'throwaway', 'incomplete', 'fumble', 'safety'].includes(r.outcome), r.outcome);
    if (r.outcome === 'touchdown') assert.ok(r.win);
    const copy = r.reason + r.events.map(e => e.text).join(' ') + r.situation;
    assert.ok(![...copy].some(c => c.charCodeAt(0) === 0x2013 || c.charCodeAt(0) === 0x2014), 'no dashes');
  }
  const g = E.run(at({ ballOn: 3, distance: 10 }), PLAYBOOK.sneak, 1);
  assert.equal(g.distance, 3); assert.equal(g.down, '4th and goal'); assert.equal(g.marker, 100);
});

test('a safety from the own 1', () => {
  /* in the shotgun on his own 1, the QB sets up in the end zone: a long route, no checkdown, nobody kept in */
  const bad = { formation: 'empty', routes: [{ who: 'WR1', pts: [[-13.5, 18], [-2, 30], [-14, 42]] }, { who: 'WR2', pts: [[13.5, 20]] }], blocks: [], handoff: null, targets: ['WR1'] };
  let hit = null;
  for (let s = 1; s <= 200 && !hit; s++) { const r = E.run(at({ ballOn: 99, distance: 10, down: 3 }), bad, s); if (r.outcome === 'safety') hit = r; }
  assert.ok(hit, 'a sack in the end zone is a safety');
  assert.equal(hit.title, 'SAFETY');
  assert.equal(hit.win, false);
  assert.equal(hit.next, null);
  assert.ok(hit.spotY <= 0);
  assert.match(hit.reason, /Safety\./);
  assert.ok(hit.events.some(e => e.kind === 'safety'));
  /* the same sack from the 40 is only a sack */
  for (let s = 1; s <= 60; s++) assert.notEqual(E.run(at({ distance: 10 }), bad, s).outcome, 'safety');
});

test('situationName says the down, the distance and the spot', () => {
  assert.equal(E.situationName(3, 7, 72), '3rd and 7 · Own 28');
  assert.equal(E.situationName(4, 3, 3), '4th and Goal · Opp 3');
  assert.equal(E.situationName(1, 10, 40), '1st and 10 · Opp 40');
  assert.equal(E.situationName(2, 10, 50), '2nd and 10 · Midfield');
  assert.equal(E.situationName(1, 10, 99), '1st and 10 · Own 1');
  assert.equal(E.situationName(1, 10, 1), '1st and Goal · Opp 1');
  assert.equal(E.situationName(4, 99, 99), '4th and Goal · Own 1');
  assert.equal(E.situationName(3, 15, 90), '3rd and 15 · Own 10');
  assert.equal(E.run(at({ down: 3, distance: 7, ballOn: 72 }), PLAYBOOK.mesh, 1).situation, '3rd and 7 · Own 28');
});
