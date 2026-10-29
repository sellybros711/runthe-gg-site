import test from 'node:test';
import assert from 'node:assert/strict';
import { handle, RATE } from '../api.js';
import { memoryDb } from '../db-memory.js';
import { pageGate } from '../gate.js';
import { GAMES, FLAGS } from '../registry.js';
import { seedFor, dateKey } from '../shared/seed.js';
import { playLog } from './helpers.mjs';

const T0 = Date.parse('2026-10-10T16:00:00Z');
const DAY = dateKey(T0);
function setup(flag = 'testers') {
  const clock = { t: T0 };
  const db = memoryDb({ roles: { boss: 'admin', dev: 'tester', dev2: 'tester' }, names: { dev: 'devname', dev2: 'two' },
    flags: Object.fromEntries(FLAGS.map(f => [f, f === 'arcade_roll_ball' ? flag : 'off'])), now: () => clock.t });
  const call = (method, path, uid, body, guestId, query) => handle({ method, path, uid, body, guestId, query }, { db, now: () => clock.t });
  return { db, clock, call };
}
const ROUTES = [['GET', 'me'], ['GET', 'roll-ball/today'], ['POST', 'roll-ball/run'], ['GET', 'roll-ball/leaderboard'],
  ['POST', 'claim'], ['POST', 'admin/flag'], ['GET', 'admin/flags'], ['GET', 'nonsense'], ['GET', 'pinball/today']];
const goodRun = (bot = 1) => { const seed = seedFor(DAY, 'roll-ball'), r = playLog(seed, bot); return { mode: 'daily', dateKey: DAY, seed, inputs: r.log, score: r.score, durationMs: Math.ceil(r.frames * 1000 / 60) + 500 }; };

test('a non-tester and a guest get a 404 on every API route, every game', async () => {
  const { call } = setup();
  for (const g of Object.keys(GAMES)) for (const p of ['today', 'run', 'leaderboard']) ROUTES.push([p === 'run' ? 'POST' : 'GET', g + '/' + p]);
  for (const [m, p] of ROUTES) {
    assert.equal((await call(m, p, 'nobody', {})).status, 404, 'nobody ' + m + ' ' + p);
    assert.equal((await call(m, p, null, {}, 'guest-12345678')).status, 404, 'guest ' + m + ' ' + p);
    assert.equal((await call(m, p, null, {})).status, 404, 'anonymous ' + m + ' ' + p);
  }
});

test('a tester gets 200 while the flag is on, and a 404 while it is off', async () => {
  const on = setup('testers');
  assert.equal((await on.call('GET', 'me', 'dev')).status, 200);
  assert.equal((await on.call('GET', 'roll-ball/today', 'dev')).status, 200);
  assert.equal((await on.call('GET', 'roll-ball/leaderboard', 'dev')).status, 200);
  const off = setup('off');
  assert.equal((await off.call('GET', 'me', 'dev')).status, 404);
  assert.equal((await off.call('GET', 'roll-ball/today', 'dev')).status, 404);
  assert.equal((await off.call('GET', 'roll-ball/today', 'boss')).status, 200, 'an admin always sees it');
});

test('an admin flips a flag; nobody else can reach the admin routes', async () => {
  const { call } = setup('off');
  assert.equal((await call('POST', 'admin/flag', 'dev', { flag: 'arcade_roll_ball', mode: 'testers' })).status, 404);
  assert.equal((await call('POST', 'admin/flag', 'boss', { flag: 'arcade_roll_ball', mode: 'testers' })).status, 200);
  assert.equal((await call('GET', 'roll-ball/today', 'dev')).status, 200);
  assert.equal((await call('POST', 'admin/flag', 'boss', { flag: 'arcade_roll_ball', mode: 'wide' })).status, 400);
});

test('today hands back the same seed and config for everybody', async () => {
  const { call } = setup();
  const a = (await call('GET', 'roll-ball/today', 'dev')).body, b = (await call('GET', 'roll-ball/today', 'dev2')).body;
  assert.equal(a.seed, b.seed); assert.deepEqual(a.config, b.config); assert.equal(a.seed, seedFor(DAY, 'roll-ball'));
  assert.equal(a.played, null);
});

test('a real run is scored by the server, and gems are paid once', async () => {
  const { call, db } = setup();
  const body = goodRun();
  const r = await call('POST', 'roll-ball/run', 'dev', body);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.result.score, body.score);
  assert.ok(r.body.gems >= 5);
  assert.equal(db.ledger.length, 1);
  assert.equal(db.runs[0].tester, true, 'tester runs are marked');
  const again = await call('POST', 'roll-ball/run', 'dev', body);
  assert.equal(again.status, 409);
  assert.equal(db.ledger.length, 1);
  const today = (await call('GET', 'roll-ball/today', 'dev')).body;
  assert.equal(today.played.score, body.score);
});

test('the gem service is idempotent per run', async () => {
  const { db } = setup();
  const { awardGems } = await import('../api.js');
  assert.equal(await awardGems(db, { user_id: 'dev', amount: 7, reason: 'x', game_id: 'roll-ball', run_id: 99, tester: true }), true);
  assert.equal(await awardGems(db, { user_id: 'dev', amount: 7, reason: 'x', game_id: 'roll-ball', run_id: 99, tester: true }), false);
  assert.equal(await db.gemTotal({ uid: 'dev' }), 7);
});

test('a forged score is refused and logged, and pays nothing', async () => {
  const { call, db } = setup();
  const body = goodRun(2);
  const r = await call('POST', 'roll-ball/run', 'dev', { ...body, score: body.score + 1 });
  assert.equal(r.status, 400); assert.equal(r.body.error, 'score_mismatch');
  assert.equal(db.runs.length, 0); assert.equal(db.ledger.length, 0);
  assert.equal(db.rejections[0].reason, 'score_mismatch');
  const fake = await call('POST', 'roll-ball/run', 'dev', { ...body, inputs: body.inputs.map(x => ({ ...x, p: 1 })), score: 36 });
  assert.equal(fake.status, 400);
});

test('a wrong seed, a practice post, a stale day and an impossible duration are refused', async () => {
  const { call, clock } = setup();
  const body = goodRun(3);
  assert.equal((await call('POST', 'roll-ball/run', 'dev', { ...body, seed: body.seed + 1 })).body.error, 'wrong_seed');
  assert.equal((await call('POST', 'roll-ball/run', 'dev', { ...body, mode: 'practice' })).body.error, 'daily_only');
  assert.equal((await call('POST', 'roll-ball/run', 'dev', { ...body, durationMs: 1000 })).body.error, 'implausible_duration');
  assert.equal((await call('POST', 'roll-ball/run', 'dev', { ...body, dateKey: '2026-10-01' })).body.error, 'stale_day');
  clock.t = Date.parse('2026-10-11T04:05:00Z');   // five minutes past Eastern midnight
  const late = await call('POST', 'roll-ball/run', 'dev', body);
  assert.equal(late.status, 200, 'a daily started before midnight still files: ' + JSON.stringify(late.body));
});

test('posting is rate limited', async () => {
  const { call } = setup();
  const body = goodRun(4);
  let last;
  for (let i = 0; i <= RATE.MAX_POSTS; i++) last = await call('POST', 'roll-ball/run', 'dev', { ...body, score: -1 });
  assert.equal(last.status, 429);
});

test('the leaderboard ranks by score and names the caller', async () => {
  const { call } = setup();
  const a = goodRun(5), b = goodRun(6);
  await call('POST', 'roll-ball/run', 'dev', a);
  await call('POST', 'roll-ball/run', 'dev2', b);
  const lb = (await call('GET', 'roll-ball/leaderboard', 'dev')).body;
  assert.equal(lb.total, 2);
  assert.ok(lb.top[0].score >= lb.top[1].score);
  assert.ok(lb.top.some(x => x.me && x.name === 'devname'));
  assert.equal(lb.me.rank, a.score >= b.score ? 1 : 2);
});

test('in public mode a guest plays, stays off the board, and is claimed on sign in', async () => {
  const { call, db } = setup('public');
  const body = goodRun(8);
  const r = await call('POST', 'roll-ball/run', null, body, 'guest-abcdefgh');
  assert.equal(r.status, 200);
  assert.equal(db.runs[0].tester, false, 'a public run is not a tester run');
  assert.equal((await call('GET', 'roll-ball/leaderboard', null, {}, 'guest-abcdefgh')).body.total, 0);
  const c = await call('POST', 'claim', 'dev', { guestId: 'guest-abcdefgh' });
  assert.equal(c.body.moved, 1);
  assert.equal(await db.gemTotal({ uid: 'dev' }), r.body.gems);
});

test('the page gate: 404 for nobody, the page for a tester, modules follow the game', async () => {
  const { db } = setup('testers');
  for (const sub of ['roll-ball', 'm/games/rollball/sim.js', 'm/shared/seed.js']) {
    assert.equal(await pageGate(sub, 'nobody', db), null, 'nobody ' + sub);
    assert.equal(await pageGate(sub, null, db), null, 'anonymous ' + sub);
    assert.ok(await pageGate(sub, 'dev', db), 'tester ' + sub);
  }
  assert.equal(await pageGate('m/api.js', 'dev', db), null, 'no server file is served');
  assert.equal(await pageGate('m/db-supabase.js', 'boss', db), null);
  assert.equal(await pageGate('nonsense', 'boss', db), null);
  const off = setup('off');
  assert.equal(await pageGate('roll-ball', 'dev', off.db), null);
  assert.ok(await pageGate('roll-ball', 'boss', off.db));
});
