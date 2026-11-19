/* The coach record and the moments.
 *
 *   node --test 4th-and-what/test/profile.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const P = require('../profile.js');

const snap = (o) => Object.assign({ win: false, outcome: 'incomplete', distance: 5, callKey: 'cover3', disguised: false, spotY: null, marker: 65, ballOn: 40 }, o);

test('the record counts snaps and conversions, the longest and the signature', () => {
  let p = P.blank();
  p = P.record(p, snap({ win: true, outcome: 'down', spotY: 68, distance: 5 }), { name: 'Stick' }).profile;
  p = P.record(p, snap({}), { name: 'Stick' }).profile;
  p = P.record(p, snap({ win: true, outcome: 'down', spotY: 72, distance: 7 }), { name: 'Mesh' }).profile;
  p = P.record(p, snap({ win: true, outcome: 'down', spotY: 70, distance: 3 }), { name: 'Stick' }).profile;
  assert.deepEqual([p.snaps, p.conv, p.longest], [4, 3, 7]);
  assert.deepEqual(P.signature(p), { name: 'Stick', n: 2 });
});

test('each moment comes off the result, once', () => {
  const r1 = P.record(P.blank(), snap({ win: true, outcome: 'down', distance: 10, callKey: 'cover0', disguised: true, spotY: 75.4, marker: 75 }), {});
  assert.deepEqual(r1.earned.sort(), ['blitz', 'inches', 'long', 'rotation']);
  const r2 = P.record(r1.profile, snap({ win: true, outcome: 'down', distance: 12, callKey: 'cover0', disguised: true, spotY: 80, marker: 77 }), {});
  assert.deepEqual(r2.earned, [], 'never twice');
  const r3 = P.record(r2.profile, snap({ win: true, outcome: 'touchdown', ballOn: 65, spotY: 100, marker: 70 }), { run: 5 });
  assert.deepEqual(r3.earned.sort(), ['house', 'six', 'streak5']);
  assert.equal(r3.profile.bestRun, 5);
  assert.deepEqual(P.record(P.blank(), snap({}), {}).earned, [], 'a stop earns nothing');
  P.MOMENTS.forEach(m => assert.ok(m.name && m.how && ![...(m.name + m.how)].some(c => c.charCodeAt(0) === 0x2013 || c.charCodeAt(0) === 0x2014)));
});
