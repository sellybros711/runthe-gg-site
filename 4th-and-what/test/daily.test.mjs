/* The daily 4th down: the plays, the schedule and the copy.
 *
 *   node --test 4th-and-what/test/daily.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const D = require('../daily.js'), E = require('../engine.js'), C = require('../config.js');
const DATA = require('../data/fourths.json');
const P = DATA.plays;

test('the list: real crucial 4th downs, enough for well over a year', () => {
  assert.ok(P.length >= 365, P.length + ' plays');
  assert.ok(/nflverse/.test(DATA.source), 'the source is credited');
  const ids = new Set(P.map(p => p.id));
  assert.equal(ids.size, P.length, 'no play twice');
  for (const p of P) {
    assert.ok(p.togo >= 1 && p.togo <= p.ballOn && p.ballOn >= 1 && p.ballOn <= 99, 'a real spot and distance: ' + p.id);
    assert.ok(p.kind === 'run' || p.kind === 'pass', 'they went for it: ' + p.id);
    assert.ok(p.desc.length > 10 && NAMEOK(p.off) && NAMEOK(p.def), 'a line and two teams: ' + p.id);
    assert.ok(!/PENALTY|REVERSED|NULLIFIED/i.test(p.desc), 'no play a flag or a review undid: ' + p.id);
  }
  assert.ok(P.some(p => p.round === 'Super Bowl' && /Burton pass/.test(p.desc)), 'the Philly Special is in');
  const conv = P.filter(p => p.conv).length / P.length;
  assert.ok(conv > 0.35 && conv < 0.65, 'made and stopped about even: ' + conv.toFixed(2));
});
function NAMEOK(t) { return D.name(t) !== t; }

test('one play a day, the same for everybody, none twice in a year', () => {
  assert.equal(D.numberOf(D.EPOCH), 1);
  assert.equal(D.dayOf(new Date('2026-11-01T03:00:00Z')), '2026-10-31', 'the Eastern day, not UTC');
  assert.equal(D.dayOf(new Date('2026-11-01T05:00:00Z')), '2026-11-01');
  const seen = new Set();
  for (let n = 1; n <= 365; n++) seen.add(D.playFor(P, n).id);
  assert.equal(seen.size, 365, 'a year of different plays');
  assert.equal(D.playFor(P, 12).id, D.playFor(P, 12).id, 'the same day gives the same play');
  assert.equal(D.seedFor('2026-11-05'), D.seedFor('2026-11-05'), 'and the same defense');
  assert.notEqual(D.seedFor('2026-11-05'), D.seedFor('2026-11-06'));
  /* the first hundred days are the hundred biggest plays */
  const top = new Set(P.slice(0, 100).map(p => p.id));
  for (let n = 1; n <= 100; n++) assert.ok(top.has(D.playFor(P, n).id), 'day ' + n + ' is from the top hundred');
});

test('the copy comes from the row', () => {
  const p = P.find(x => x.round === 'Super Bowl' && /Burton pass/.test(x.desc));
  assert.equal(D.roundText(p), 'Super Bowl LII');
  assert.equal(D.teamsText(p), 'Eagles vs Patriots');
  assert.equal(D.downText(p), '4th & Goal');
  assert.equal(D.spotText(p), 'the NE 1');
  assert.equal(D.clockText(p), 'Q2 · 0:38');
  assert.ok(/^88-T\.Burton pass/.test(D.realText(p)), 'the line without its clock or formation: ' + D.realText(p));
  assert.equal(D.verdictText(p), 'They scored.');
  assert.equal(D.roundText({ round: 'Super Bowl', season: 2015 }), 'Super Bowl 50');
  assert.equal(D.code('LV', 2016), 'OAK'); assert.equal(D.code('LAC', 2012), 'SD'); assert.equal(D.code('LA', 2001), 'STL');
  assert.equal(D.conf('SEA', 2001), 'AFC'); assert.equal(D.conf('SEA', 2014), 'NFC');
  for (let n = 1; n <= 400; n++) {
    const q = D.playFor(P, n);
    const all = [D.roundText(q), D.teamsText(q), D.spotText(q), D.clockText(q), D.scoreText(q), D.downText(q), D.realText(q), D.verdictText(q)].join(' ');
    assert.ok(![...all].some(c => c.charCodeAt(0) === 0x2013 || c.charCodeAt(0) === 0x2014), 'no dashes: ' + q.id);
    assert.ok(!/undefined|NaN/.test(all), 'every field filled: ' + q.id + ' ' + all);
  }
});

test('every day plays: the engine runs each real situation', () => {
  for (let n = 1; n <= 120; n++) {
    const q = D.playFor(P, n);
    const sc = Object.assign({}, C.SCENARIO, { down: 4, distance: Math.min(q.togo, q.ballOn), ballOn: q.ballOn });
    const play = { formation: 'gun3x1', moved: {}, routes: [], blocks: [], targets: [], handoff: { to: 'RB', path: [[2, 0.5], [2, 8]] } };
    const r = E.run(sc, play, D.seedFor('day' + n));
    assert.ok(r.frames.length > 5 && typeof r.win === 'boolean', 'day ' + n);
    assert.equal(r.distance, Math.min(q.togo, q.ballOn));
  }
});

test('the share line has no spoiler and says how it compares', () => {
  const p = P.find(x => x.conv);
  const t = D.shareText(p, 7, { win: true, yards: 6 });
  assert.ok(/Daily #7/.test(t) && /same as the real thing/.test(t) && /runthe\.gg/.test(t));
  assert.ok(/they made it/.test(D.shareText(p, 7, { win: false, yards: 1 })));
});
