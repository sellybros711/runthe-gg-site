import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { handle } from '../api.js';
import { memoryDb } from '../db-memory.js';
import { slateDate } from '../slate.js';
import { seedMemory, SEARCH } from '../build/seed-slate.mjs';
import { render } from '../build/pages.mjs';
import { sign, verify } from '../cookie.js';

const T0 = Date.parse('2026-10-09T16:00:00Z');
async function setup(mode = 'testers') {
  const db = memoryDb({ mode, testers: { admin: 'admin', tester: 'tester' }, users: { boss: 'admin', dev: 'tester', other: 'nobody' } });
  const built = await seedMemory(db, slateDate(T0));
  const clock = { t: T0 };
  const call = (method, path, uid, body, guestId, query) =>
    handle({ method, path, uid, body, guestId, query }, { db, now: () => clock.t, searchAvg: () => SEARCH.values });
  return { db, built, clock, call };
}
const ROUTES = [['GET', 'me'], ['GET', 'today'], ['POST', 'pitch'], ['POST', 'answer'], ['GET', 'result'], ['POST', 'challenge'],
  ['GET', 'search'], ['POST', 'claim'], ['GET', 'admin/testers'], ['POST', 'admin/publish'], ['GET', 'admin/challenges'], ['GET', 'nonsense']];

test('a non-tester and a guest get a 404 on every route', async () => {
  const { call } = await setup();
  for (const [m, p] of ROUTES) {
    assert.equal((await call(m, p, 'nobody', {}, null, { q: 'lebron' })).status, 404, 'nobody ' + m + ' ' + p);
    assert.equal((await call(m, p, null, {}, 'guest-12345678', { q: 'lebron' })).status, 404, 'guest ' + m + ' ' + p);
  }
});

test('a tester plays but every admin route is a 404', async () => {
  const { call } = await setup();
  assert.equal((await call('GET', 'me', 'tester')).status, 200);
  for (const p of ['admin/testers', 'admin/challenges', 'admin/prompts', 'admin/review', 'admin/nopitch'])
    assert.equal((await call('GET', p, 'tester')).status, 404, p);
  assert.equal((await call('POST', 'admin/publish', 'tester', {})).status, 404);
});

test('testers are added and removed without a deploy; mode off shuts them out', async () => {
  const { call } = await setup();
  assert.equal((await call('GET', 'me', 'nobody')).status, 404);
  assert.equal((await call('POST', 'admin/testers', 'admin', { username: 'other' })).status, 200);
  assert.equal((await call('GET', 'me', 'nobody')).status, 200);
  assert.equal((await call('DELETE', 'admin/testers', 'admin', { userId: 'nobody' })).status, 200);
  assert.equal((await call('GET', 'me', 'nobody')).status, 404);
  await call('POST', 'admin/mode', 'admin', { mode: 'off' });
  assert.equal((await call('GET', 'today', 'tester')).status, 404);
  assert.equal((await call('GET', 'me', 'admin')).status, 200, 'an admin still gets in to author');
});

test('nothing leaks before it is earned', async () => {
  const { call, built } = await setup();
  const v0 = (await call('GET', 'today', 'tester')).body;
  assert.equal(v0.current.status, 'pending');
  assert.equal(v0.current.prompt, undefined, 'the prompt waits for the pitch');
  const v = (await call('POST', 'pitch', 'tester')).body;
  const text = JSON.stringify(v);
  const p0 = built.prompts[0];
  const called = p0.graded.filter(r => r.called).map(r => r.name);
  const tell = v.current.tell;
  assert.ok(called.includes(tell), 'the tell is a called answer');
  assert.equal(tell, p0.graded.find(r => r.called).name, 'and the most popular one');
  for (const n of called) if (n !== tell) assert.ok(!text.includes(n), 'called answer ' + n + ' leaked');
  for (const r of p0.graded.slice(0, 40)) assert.ok(!text.includes(r.id), 'valid id ' + r.id + ' leaked');
  assert.equal(v.current.calledCount, 3);
  const s = (await call('GET', 'search', 'tester', null, null, { q: 'derek' })).body.results;
  assert.ok(s.every(x => Object.keys(x).join() === 'id,name,tag'), 'typeahead carries no grade or validity');
});

test('a whole game: rulings, reveal, result, share line', async () => {
  const { call, built, clock } = await setup();
  await call('POST', 'pitch', 'tester');
  const p0 = built.prompts[0];
  // NO PITCH costs nothing
  let r = (await call('POST', 'answer', 'tester', { text: 'qqzzxx vvbb' })).body;
  assert.equal(r.ruling, 'NO_PITCH'); assert.equal(r.strikes, 0);
  // a strike: a real player who is not a valid answer
  r = (await call('POST', 'answer', 'tester', { text: 'Tom Brady' })).body;
  assert.equal(r.ruling, 'STRIKE'); assert.equal(r.strikes, 1); assert.equal(r.reveal, undefined);
  // a deep valid answer, capped by the strike
  const deep = p0.graded.find(r => r.tier === 4);
  r = (await call('POST', 'answer', 'tester', { entityId: deep.id })).body;
  assert.equal(r.ruling, 'SAFE'); assert.equal(r.tier, 3);
  assert.equal(typeof r.rarity, 'number', 'a ruled answer says how common it was');
  assert.deepEqual(r.reveal.called.slice().sort(), p0.graded.filter(x => x.called).map(x => x.name).sort(), 'the called list arrives after the at-bat');
  // at-bat 2: a called answer is an out
  await call('POST', 'pitch', 'tester');
  const c = built.prompts[1].graded.find(x => x.called);
  r = (await call('POST', 'answer', 'tester', { entityId: c.id })).body;
  assert.equal(r.ruling, 'OUT');
  // at-bat 3: the clock runs out three times
  await call('POST', 'pitch', 'tester');
  for (let k = 0; k < 3; k++) { clock.t += 33000; r = (await call('POST', 'answer', 'tester', { timeout: true })).body; }
  assert.ok(r.strikeout && r.expired);
  // at-bats 4 and 5: singles
  for (const i of [3, 4]) {
    await call('POST', 'pitch', 'tester');
    const easy = built.prompts[i].graded.find(x => !x.called && x.tier === 1);
    r = (await call('POST', 'answer', 'tester', { entityId: easy.id })).body;
    assert.equal(r.ruling, 'SAFE');
  }
  assert.ok(r.state.over); assert.ok(r.state.won, 'two outs after five at-bats is a win');
  const res = (await call('GET', 'result', 'tester')).body;
  assert.equal(res.final, true);
  assert.equal(res.summary.bases, 5);
  assert.match(res.share, /^Stumpire #\d+\n3️⃣ ❌ ❌ 1️⃣ 1️⃣\nScore 70 · 1 R · 3 H · 0 HR · 1 K$/);
  assert.equal(res.summary.score, 70); assert.equal(res.summary.runs, 1);
  assert.deepEqual(res.box.map(b => b.hit || b.out), [3, 'OUT', 'K', 1, 1]);
  assert.equal(res.streak, 1, 'a finished game today is a streak of one');
  assert.equal(res.rank, 1); assert.equal(res.field, 1);
  const bd = (await call('GET', 'board', 'tester')).body;
  assert.equal(bd.top[0].score, 70); assert.ok(bd.top[0].me); assert.equal(bd.me.rank, 1);
  assert.equal(res.crowd.length, 5);
  assert.equal((await call('POST', 'answer', 'tester', { text: 'x' })).status, 409, 'a finished game takes no more answers');
});

test('the clock is the server\'s: a late answer is a strike whatever it says', async () => {
  const { call, built, clock } = await setup();
  await call('POST', 'pitch', 'tester');
  clock.t += 40000;
  const good = built.prompts[0].graded.find(x => !x.called).id;
  const r = (await call('POST', 'answer', 'tester', { entityId: good })).body;
  assert.equal(r.ruling, 'STRIKE'); assert.ok(r.expired);
});

test('picker pauses the clock on the server', async () => {
  const { call, clock } = await setup();
  await call('POST', 'pitch', 'tester');
  clock.t += 5000;
  const r = (await call('POST', 'answer', 'tester', { text: 'Ken Griffey' })).body;
  assert.equal(r.ruling, 'PICKER'); assert.ok(r.picker.length >= 2);
  clock.t += 60000;
  const v = (await call('GET', 'today', 'tester')).body;
  assert.equal(v.current.remainingMs, 25000); assert.equal(v.current.paused, true);
  const p = (await call('POST', 'answer', 'tester', { entityId: r.picker[0].id })).body;
  assert.ok(['SAFE', 'STRIKE', 'OUT'].includes(p.ruling));
  assert.equal(p.expired, false);
});

test('two writes at once: the stale one is refused with a 409', async () => {
  const { call, db } = await setup();
  await call('POST', 'pitch', 'tester');
  const save = db.savePlay.bind(db);
  let once = true;
  db.savePlay = async (id, v, st, sm) => { if (once) { once = false; await save(id, v, st, sm); } return save(id, v, st, sm); };
  assert.equal((await call('POST', 'answer', 'tester', { text: 'Tom Brady' })).status, 409);
});

test('a challenge is queued, and upholding it restores the result and fixes the slate', async () => {
  const { call, db, built } = await setup();
  await call('POST', 'pitch', 'tester');
  for (const n of ['Tom Brady', 'LeBron James', 'Peyton Manning']) await call('POST', 'answer', 'tester', { text: n });
  let v = (await call('GET', 'today', 'tester')).body;
  assert.equal(v.outs, 1);
  const ch = (await call('POST', 'challenge', 'tester', { atBat: 0, note: 'Manning was robbed' })).body;
  assert.equal(ch.challenge.status, 'open');
  assert.equal((await call('POST', 'challenge', 'tester', { atBat: 0 })).status, 409, 'one challenge per at-bat');
  const open = (await call('GET', 'admin/challenges', 'admin')).body.challenges;
  assert.equal(open.length, 1);
  const res = (await call('POST', 'admin/challenges/resolve', 'admin', { id: open[0].id, upheld: true, resolution: 'test' })).body;
  assert.equal(res.status, 'upheld');
  v = (await call('GET', 'today', 'tester')).body;
  assert.equal(v.outs, 0, 'the strikeout out is taken off the board');
  assert.equal(v.history[0].ruling, 'SAFE');
  assert.equal(v.history[0].tier, 1);
  const added = (await db.answers(slateDate(T0), 0)).find(r => r.entity_id === 'nfl-peyton-manning-1990');
  assert.ok(added && added.arguable && added.tier === 1, 'later players get the benefit of the doubt too');
  void built;
});

test('a guest play joins the account that signs in (public mode)', async () => {
  const { call } = await setup('public');
  await call('POST', 'pitch', null, null, 'guest-abcdef12');
  assert.equal((await call('GET', 'today', null, null, 'guest-abcdef12')).body.current.status, 'live');
  const c = (await call('POST', 'claim', 'nobody', { guestId: 'guest-abcdef12' })).body;
  assert.equal(c.claimed, 1);
  assert.equal((await call('GET', 'today', 'nobody')).body.current.status, 'live', 'the account carries on where the guest left off');
});

test('admin preview and publish refuse a broken slate and freeze a good one', async () => {
  const { call } = await setup();
  const pv = (await call('POST', 'admin/preview', 'admin', { prompt: { id: 'x', text: 'x', league: 'NBA', type: 'athlete', years: [1990, 2025], where: [{ k: 'award', v: 'NBA MVP' }] }, atBat: 0 })).body;
  assert.ok(pv.errors.length, 'NBA MVP has too few answers for at-bat 1');
  const { slateFor } = await import('../build/seed-slate.mjs');
  const ids = slateFor('2026-10-11').defs.map(d => d.id);
  const bad = (await call('POST', 'admin/publish', 'admin', { date: '2026-10-11', promptIds: [ids[0], ids[0], ids[2], ids[3], ids[4]] })).body;
  assert.equal(bad.published, false);
  const okp = (await call('POST', 'admin/publish', 'admin', { date: '2026-10-11', promptIds: ids })).body;
  assert.equal(okp.published, true);
  assert.equal((await call('POST', 'admin/publish', 'admin', { date: '2026-10-11', promptIds: ids })).status, 500, 'a date is published once');
});

test('pages.js matches web/*.html', () => {
  assert.equal(fs.readFileSync(new URL('../pages.js', import.meta.url), 'utf8'), render(), 'run node functions/_stumpire/build/pages.mjs');
});

test('the page cookie is signed, expires, and refuses tampering', async () => {
  const c = await sign('s3cret', 'u-1', T0);
  assert.equal(await verify('s3cret', c, T0 + 1000), 'u-1');
  assert.equal(await verify('other', c, T0), null);
  assert.equal(await verify('s3cret', c.replace('u-1', 'u-2'), T0), null);
  assert.equal(await verify('s3cret', c, T0 + 13 * 3600 * 1000), null);
  assert.equal(await verify(undefined, c, T0), null, 'no secret, no page');
});

test('a streak counts days in a row, alive through yesterday', async () => {
  const { streakFrom } = await import('../api.js');
  assert.equal(streakFrom(['2026-10-10', '2026-10-09', '2026-10-08', '2026-10-06'], '2026-10-10'), 3);
  assert.equal(streakFrom(['2026-10-09', '2026-10-08'], '2026-10-10'), 2, 'today not yet played');
  assert.equal(streakFrom(['2026-10-07'], '2026-10-10'), 0);
  assert.equal(streakFrom(['2026-11-01', '2026-10-31'], '2026-11-01'), 2, 'across a month');
});
