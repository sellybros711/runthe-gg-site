/* A challenged strike is ruled live and remembered.
 *
 * The real API over the in-memory store, the real ruling (livecheck.js) over
 * the real Sportegories engine and data, and Wikidata answered by canned items
 * through the same shaping code the live route uses. No network.
 *
 * The slate's first prompt is "A Pro Bowl wide receiver who played after
 * 1995". Adam Humphries is a receiver our data holds with no Pro Bowl; the
 * canned record gives him one, so a challenge on him is overturned. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { handle } from '../api.js';
import { memoryDb } from '../db-memory.js';
import { slateDate, slateNumber } from '../slate.js';
import { seedMemory, rowsOf, SEARCH } from '../build/seed-slate.mjs';
import { get } from '../entities.js';
import { CONFIG } from '../config.js';
import { liveRule, translate } from '../livecheck.js';
import { parseData } from '../../_sportegories/engine.js';
import { wikidata } from '../../api/player-check.js';

const require = createRequire(import.meta.url);
const SP = require('../../../arcade/sportegories.js');
const LC = require('../../../arcade/livecheck.js');
SP.setData(parseData(fs.readFileSync(new URL('../../../arcade/sportegories-data.js', import.meta.url), 'utf8')));
LC.setEngine(SP);

/* ---------- canned Wikidata ---------- */
const LABELS = { Q19204627: 'American football player', Qwr: 'wide receiver', Qqb: 'quarterback', Qpb: 'Pro Bowl', Qdal: 'Dallas Cowboys', Qbuc: 'Tampa Bay Buccaneers' };
const snak = (q) => ({ mainsnak: { datavalue: { value: { id: q } } } });
function item(id, name, { pos, awards = [], teams = [] }) {
  return { id, labels: { en: { value: name } }, claims: { P106: [snak('Q19204627')], P413: [snak(pos)], P166: awards.map(snak), P54: teams.map(snak) } };
}
let WD = {}, wikiCalls = 0, down = false;
const wiki = {
  ...wikidata,
  async searchName(n) { wikiCalls++; if (down) throw new Error('wikidata 503'); return (WD[n.toLowerCase()] || []).map((e) => e.id); },
  async getEntities(ids) {
    const out = {};
    for (const q of ids) {
      const e = Object.values(WD).flat().find((x) => x.id === q);
      out[q] = e || (LABELS[q] ? { id: q, labels: { en: { value: LABELS[q] } } } : { id: q, missing: '' });
    }
    return out;
  },
  async getLabels(ids) { const o = {}; ids.forEach((q) => { if (LABELS[q]) o[q] = LABELS[q]; }); return o; }
};
function reset() {
  wikiCalls = 0; down = false;
  WD = {
    'adam humphries': [item('Q1', 'Adam Humphries', { pos: 'Qwr', awards: ['Qpb'], teams: ['Qbuc'] })],
    'peyton manning': [item('Q2', 'Peyton Manning', { pos: 'Qqb', awards: ['Qpb'] })],
    'albert wilson': [item('Q3', 'Albert Wilson', { pos: 'Qwr', awards: [] })]
  };
}

const T0 = Date.parse('2026-10-09T16:00:00Z');
async function setup(extra = {}) {
  reset();
  const testers = { admin: 'admin' }, users = {};
  for (const u of ['a', 'b', 'c', 'd', 'e', 'f', 'g']) { testers[u] = 'tester'; users[u] = u; }
  const db = memoryDb({ mode: 'testers', testers, users });
  const built = await seedMemory(db, slateDate(T0));
  const clock = { t: T0 };
  const liveCheck = (e, def) => liveRule(e, def, { SP, LC, wiki, getEntity: get });
  const call = (method, path, uid, body) => handle({ method, path, uid, body }, { db, now: () => clock.t, searchAvg: () => SEARCH.values, liveCheck, ...extra });
  return { db, built, clock, call };
}
/* Strike out at-bat 0 with `last` as the third strike, so the challenge is about him. */
async function strikeOut(call, uid, last) {
  await call('POST', 'pitch', uid);
  for (const n of ['Tom Brady', 'Patrick Mahomes', last]) await call('POST', 'answer', uid, { text: n });
  const v = (await call('GET', 'today', uid)).body;
  assert.equal(v.outs, 1, 'struck out');
  return v;
}

test('the vocabulary translates: every predicate the seed prompts use reaches Sportegories', () => {
  const D = SP.data();
  const seed = JSON.parse(fs.readFileSync(new URL('../prompts/seed.json', import.meta.url), 'utf8')).prompts;
  const missing = [];
  const walk = (p) => {
    if (p.k === 'all' || p.k === 'any') return p.of.forEach(walk);
    if (p.k === 'not') return walk(p.p);
    if (['stat', 'titles', 'conf', 'division', 'founded'].includes(p.k)) return;   // unknown by design
    if (!translate(p, get, D)) missing.push(JSON.stringify(p));
  };
  seed.forEach((d) => (d.where || []).forEach(walk));
  assert.deepEqual(missing, [], 'a seed predicate that never translates can never be ruled live');
});

test('a challenged strike the record confirms is overturned on the spot', async () => {
  const { call, db } = await setup();
  await strikeOut(call, 'a', 'Adam Humphries');
  const r = (await call('POST', 'challenge', 'a', { atBat: 0 })).body;
  assert.equal(r.challenge.status, 'upheld', r.msg);
  assert.match(r.msg, /Overturned/);
  assert.equal(r.state.outs, 0, 'the strikeout out comes off the board');
  assert.equal(r.state.history[0].ruling, 'SAFE');
  const c = (await db.challenge(r.challenge.id));
  assert.equal(c.status, 'upheld'); assert.match(c.resolution, /^auto: wikidata Q1/);
  assert.equal((await db.challenges()).length, 0, 'nothing left in the admin queue');
  const mem = await db.ruling('nfl-wr-pro-bowl', 'nfl-adam-humphries-2010');
  assert.equal(mem.verdict, 'upheld'); assert.equal(mem.qid, 'Q1');
});

test('a won challenge is remembered on the next slate that deals the prompt', async () => {
  const { call, db, built, clock } = await setup();
  await strikeOut(call, 'a', 'Adam Humphries');
  await call('POST', 'challenge', 'a', { atBat: 0 });
  // tomorrow, the same five prompts, published fresh from the build: no Humphries row
  clock.t = T0 + 864e5;
  const d2 = slateDate(clock.t);
  await db.publish(d2, slateNumber(d2), built.defs, rowsOf(built));
  assert.ok(!(await db.answers(d2, 0)).some((x) => x.entity_id === 'nfl-adam-humphries-2010'), 'the fresh slate does not list him');
  await call('POST', 'pitch', 'b');
  const before = wikiCalls;
  const r = (await call('POST', 'answer', 'b', { text: 'Adam Humphries' })).body;
  assert.equal(r.ruling, 'SAFE', 'remembered: he counts with no challenge');
  assert.equal(r.tier, 1, 'as the benefit-of-the-doubt single');
  assert.equal(wikiCalls, before, 'and nobody asked Wikidata');
});

test('a strike the record contradicts is denied on the spot, and remembered', async () => {
  const { call, db } = await setup();
  await strikeOut(call, 'a', 'Peyton Manning');
  const r = (await call('POST', 'challenge', 'a', { atBat: 0 })).body;
  assert.equal(r.challenge.status, 'denied', r.msg);
  assert.equal(r.state.outs, 1, 'the out stands');
  assert.equal((await db.ruling('nfl-wr-pro-bowl', 'nfl-peyton-manning-1990')).verdict, 'denied');
  // a second player's challenge on him is answered from memory
  await strikeOut(call, 'b', 'Peyton Manning');
  const n = wikiCalls;
  const r2 = (await call('POST', 'challenge', 'b', { atBat: 0 })).body;
  assert.equal(r2.challenge.status, 'denied'); assert.equal(wikiCalls, n, 'memory, not Wikidata');
});

test('what the record cannot settle waits for the admin, and is not remembered', async () => {
  const { call, db } = await setup();
  await strikeOut(call, 'a', 'Albert Wilson');          // a receiver with no Pro Bowl listed
  const r = (await call('POST', 'challenge', 'a', { atBat: 0 })).body;
  assert.equal(r.challenge.status, 'open', r.msg);
  assert.equal(r.state, undefined, 'nothing changed, so no new state');
  assert.equal((await db.challenges()).length, 1, 'in the admin queue');
  assert.equal(await db.ruling('nfl-wr-pro-bowl', 'nfl-albert-wilson-2010'), null);
});

test('Wikidata down leaves the challenge open', async () => {
  const { call, db } = await setup();
  await strikeOut(call, 'a', 'Adam Humphries');
  down = true;
  const r = (await call('POST', 'challenge', 'a', { atBat: 0 })).body;
  assert.equal(r.challenge.status, 'open');
  assert.equal((await db.challenges()).length, 1);
  assert.equal(await db.ruling('nfl-wr-pro-bowl', 'nfl-adam-humphries-2010'), null);
});

test('the prompt\'s years are ours and a career outside them is denied without a lookup', async () => {
  const e = get('nfl-steve-largent-1970');
  const def = { league: 'NFL', type: 'athlete', years: [1995, 2025], where: [{ k: 'award', v: 'Pro Bowl' }] };
  reset();
  const r = await liveRule(e, def, { SP, LC, wiki, getEntity: get });
  assert.equal(r.verdict, 'denied'); assert.equal(wikiCalls, 0);
  const nba = await liveRule(get('nba-chris-paul-2000'), def, { SP, LC, wiki, getEntity: get });
  assert.equal(nba.verdict, 'denied', 'another league is denied on our own record');
});

test('an admin ruling is remembered as final and the live check never overturns it', async () => {
  const { call, db } = await setup();
  await strikeOut(call, 'a', 'Albert Wilson');
  const c = (await call('POST', 'challenge', 'a', { atBat: 0 })).body.challenge;
  await call('POST', 'admin/challenges/resolve', 'admin', { id: c.id, upheld: false, resolution: 'no Pro Bowl' });
  assert.equal((await db.ruling('nfl-wr-pro-bowl', 'nfl-albert-wilson-2010')).source, 'admin');
  WD['albert wilson'] = [item('Q3', 'Albert Wilson', { pos: 'Qwr', awards: ['Qpb'] })];   // the record now says yes
  // and the ruling is old, so only its being an admin's can keep it from a fresh look
  const read = db.ruling.bind(db);
  db.ruling = async (p, e) => { const r = await read(p, e); return r && { ...r, updated_at: '2020-01-01T00:00:00Z' }; };
  await strikeOut(call, 'b', 'Albert Wilson');
  const n = wikiCalls;
  const r = (await call('POST', 'challenge', 'b', { atBat: 0 })).body;
  assert.equal(r.challenge.status, 'denied', 'the admin ruling stands'); assert.equal(wikiCalls, n);
});

test('a challenge on a called out is the game\'s own rule and goes to the admin', async () => {
  const { call, built, db } = await setup();
  const called = built.prompts[0].graded.find((x) => x.called);
  await call('POST', 'pitch', 'a');
  await call('POST', 'answer', 'a', { entityId: called.id });
  const r = (await call('POST', 'challenge', 'a', { atBat: 0 })).body;
  assert.equal(r.challenge.status, 'open'); assert.equal(wikiCalls, 0);
  assert.equal((await db.challenges()).length, 1);
});

test('LIVE_CHALLENGE off puts every challenge back in the queue', async () => {
  assert.equal(CONFIG.LIVE_CHALLENGE, true, 'it ships on (Stumpire is testers only)');
  const { call, db } = await setup({ liveChallenge: false });
  await strikeOut(call, 'a', 'Adam Humphries');
  const r = (await call('POST', 'challenge', 'a', { atBat: 0 })).body;
  assert.equal(r.challenge.status, 'open'); assert.equal(wikiCalls, 0);
  assert.equal((await db.challenges()).length, 1);
});
