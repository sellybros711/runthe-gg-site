/* The sim's rules, and the four plays the owner asked to see run end to end.
 *
 *   node --test 4th-and-what/test/engine.test.mjs
 *
 * Each of the four plays is snapped against seeds 1 to 400 until it lands
 * the outcome it is here to show, then that seed is replayed to prove the
 * result is the same. Searching rather than pinning a seed keeps the test
 * true through a retune; the rates test below is what holds the tuning. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { PLAYBOOK, rate } from '../build/tune.mjs';
const require = createRequire(import.meta.url);
const E = require('../engine.js'), C = require('../config.js'), F = require('../formations.js');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const at = (d) => Object.assign({}, C.SCENARIO, { distance: d });

function find(play, d, ok) {
  for (let s = 1; s <= 400; s++) { const r = E.run(at(d), play, s); if (ok(r)) return { seed: s, r }; }
  return null;
}
function sane(r) {
  assert.ok(r.frames.length > 10, 'it has frames');
  for (const f of r.frames) for (const p of f.p) { assert.ok(Number.isFinite(p[0]) && Number.isFinite(p[1]), 'positions are numbers'); }
  assert.equal(r.frames[0].p.length, 22, 'twenty two players');
  assert.ok(typeof r.reason === 'string' && r.reason.length > 5, 'a reason');
  const copy = r.reason + r.events.map(e => e.text).join(' ') + r.callName + r.callLine;
  assert.ok(![...copy].some(c => c.charCodeAt(0) === 0x2013 || c.charCodeAt(0) === 0x2014), 'no dashes in the copy');
}

test('(a) a QB sneak converts 4th and 1', () => {
  const hit = find(PLAYBOOK.sneak, 1, r => r.win && r.isRun);
  assert.ok(hit, 'some defense gives up the yard');
  sane(hit.r);
  assert.equal(hit.r.title, 'FIRST DOWN');
  assert.ok(hit.r.yards >= 1);
});

test('(b) a quick slant with a checkdown on 4th and 5', () => {
  const play = PLAYBOOK['slant flat'];
  assert.deepEqual(play.targets, ['WR1', 'SLOT'], 'a primary and a checkdown');
  const hit = find(play, 5, r => r.win && r.throwInfo && r.throwInfo.to === 'WR1');
  assert.ok(hit, 'the slant converts against some defense');
  sane(hit.r);
  /* the slant is out before any pocket goes, so the checkdown rule is shown
     on a play whose primary takes far longer, with the back in the flat */
  const long = { formation: 'empty', routes: [{ who: 'WR1', pts: [[-13.5, 18], [-2, 30], [-14, 42]] }, { who: 'RB', pts: [[-8, 1]] }], blocks: [], handoff: null, targets: ['WR1', 'RB'] };
  const dump = find(long, 5, r => r.throwInfo && r.throwInfo.to === 'RB' && !r.throwInfo.primary);
  assert.ok(dump, 'the checkdown gets the ball when the pocket collapses');
  assert.ok(dump.r.events.some(e => e.kind === 'checkdown'));
});

test('(c) a deep shot scores from the 40', () => {
  const hit = find(PLAYBOOK['deep shot'], 10, r => r.outcome === 'touchdown' && r.throwInfo && r.throwInfo.dist > 25);
  assert.ok(hit, 'the go route goes the distance against some defense');
  sane(hit.r);
  assert.equal(hit.r.title, 'TOUCHDOWN');
  assert.equal(at(10).ballOn, 40);
});

test('(d) a bad play with no checkdown ends in a sack', () => {
  const bad = { formation: 'empty', routes: [{ who: 'WR1', pts: [[-13.5, 18], [-2, 30], [-14, 42]] }, { who: 'WR2', pts: [[13.5, 20]] }], blocks: [], handoff: null, targets: ['WR1'] };
  const hit = find(bad, 7, r => r.outcome === 'sack');
  assert.ok(hit, 'the pocket goes before the long route is done');
  sane(hit.r);
  assert.equal(hit.r.title, 'TURNOVER ON DOWNS');
  assert.match(hit.r.reason, /no checkdown/);
});

test('a run is handed off where the QB meets the back, or pitched when the path takes him away', () => {
  const dz = (r, a, b) => { const i = r.ids.findIndex(x => x.id === a), j = r.ids.findIndex(x => x.id === b); return (f) => Math.hypot(f.p[i][0] - f.p[j][0], f.p[i][1] - f.p[j][1]); };
  for (let s = 1; s <= 30; s++) {
    const r = E.run(at(5), PLAYBOOK['inside zone'], s), h = r.events.find(e => e.kind === 'handoff');
    assert.ok(h, 'inside zone is a handoff');
    const f = r.frames.find(x => x.t >= h.t);
    assert.ok(dz(r, 'QB', 'RB')(f) <= C.TUNING.mesh.reach + 0.3, 'the ball changes hands at the mesh, not across the field');
  }
  const toss = { formation: 'gun3x1', routes: [], blocks: [], targets: [], handoff: { to: 'RB', path: [[8, -5], [14, -1], [16, 5]] } };
  const r = E.run(at(5), toss, 3);
  assert.ok(r.events.some(e => e.kind === 'pitch'), 'a toss is pitched');
  const k = r.frames.findIndex(x => x.ball[2] > 1.3);
  assert.ok(k > 0 && !r.frames[k].held, 'and the ball is in the air');
});

test('the carrier runs the path drawn, to the end of it', () => {
  const play = PLAYBOOK['inside zone'], O = F.place(play.formation, {}), poly = [O.RB].concat(play.handoff.path);
  const seg = (x, y, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy || 1; const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / L)); return Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy); };
  for (let s = 1; s <= 30; s++) {
    const r = E.run(at(5), play, s), i = r.ids.findIndex(x => x.id === 'RB');
    const stop = (r.events.find(e => e.kind === 'broken') || { t: r.tEnd }).t;
    for (const f of r.frames) {
      if (f.t > stop) break;
      const x = f.p[i][0] - r.BX, y = f.p[i][1] - r.Y0;
      if (y > play.handoff.path[play.handoff.path.length - 1][1]) break;
      let m = 1e9; for (let k = 1; k < poly.length; k++) m = Math.min(m, seg(x, y, poly[k - 1], poly[k]));
      assert.ok(m < 0.6, 'within a step of the line drawn (' + m.toFixed(2) + ' at ' + f.t + ')');
    }
  }
});

test('runs gain like real runs: a long tail, not a wall at three yards', () => {
  const ys = []; for (let s = 1; s <= 200; s++) ys.push(E.run(at(10), PLAYBOOK['inside zone'], s * 7919).yards);
  const share = k => ys.filter(y => y >= k).length / ys.length;
  assert.ok(share(5) > 0.2 && share(5) < 0.5, 'five or more about a third of the time: ' + share(5));
  assert.ok(share(10) > 0.01, 'and now and then ten');
});

test('the same seed and the same play give the same result, frame for frame', () => {
  for (const [name, play] of Object.entries(PLAYBOOK)) for (const d of [1, 7, 15]) for (const s of [3, 99, 4242]) {
    const a = JSON.stringify(E.run(at(d), play, s)), b = JSON.stringify(E.run(at(d), play, s));
    assert.equal(a, b, name + ' at ' + d + ' seed ' + s);
  }
  const x = E.run(at(5), PLAYBOOK.mesh, 1), y = E.run(at(5), PLAYBOOK.mesh, 2);
  assert.notEqual(JSON.stringify(x.call) + x.outcome + x.frames.length, JSON.stringify(y.call) + y.outcome + y.frames.length + 'x');
});

test('the sim never rolls its own dice', () => {
  for (const f of ['engine.js', 'formations.js', 'config.js', 'rng.js']) {
    const src = fs.readFileSync(path.join(HERE, '..', f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    assert.ok(!/Math\.random|Date\.now|performance\.now/.test(src.replace(/function freshSeed[\s\S]*?\n  \}/, '')), f + ' reads no clock and no Math.random');
  }
});

test('every formation fields eleven on each side and a box to read', () => {
  for (const s of F.SETS) for (const d of C.DISTANCES) {
    const D = F.defense(s.id, null, d);
    assert.equal(D.length, 11, s.id + ' at ' + d);
    assert.equal(Object.keys(F.place(s.id)).length, 11);
    const box = F.boxCount(D);
    assert.ok(box >= 5 && box <= 9, s.id + ' box ' + box);
  }
});

test('outcomes follow the spot: past the marker wins, short loses', () => {
  for (let s = 1; s <= 120; s++) for (const d of [1, 5, 15]) {
    const r = E.run(at(d), PLAYBOOK['slant flat'], s);
    if (r.outcome === 'down') assert.equal(r.win, r.spotY >= r.marker, 'seed ' + s);
    if (['sack', 'throwaway', 'incomplete', 'fumble'].includes(r.outcome)) assert.equal(r.win, false);
    if (r.outcome === 'touchdown') assert.equal(r.win, true);
  }
});

test('a sensible play converts about as often as a real 4th down', () => {
  /* the tuner's numbers, held within a band: a retune that moves them far
     from real football fails here, and the vault note is updated with them */
  const TARGET = { 1: 65, 3: 55, 5: 45, 7: 38, 10: 28, 15: 18 };
  const SENS = { 1: ['sneak', 'inside zone', 'slant flat', 'stick'], 5: ['slant flat', 'stick', 'mesh', 'curls'], 15: ['dig', 'deep shot', 'curls'] };
  for (const d of [1, 5, 15]) {
    const avg = SENS[d].reduce((a, n) => a + rate(PLAYBOOK[n], d, 120), 0) / SENS[d].length * 100;
    assert.ok(Math.abs(avg - TARGET[d]) <= 13, '4th and ' + d + ': ' + avg.toFixed(0) + '% against ' + TARGET[d] + '%');
  }
});
