/* The Daily Last Shot on the Arcade Lab's daily service: the real API
 * (functions/_arcadelab/api.js) over its in-memory database.
 *
 *   - testers only, behind arcade_last_shot, a 404 to everybody else
 *   - one situation a day for everybody, from the seed
 *   - the server runs the posted play itself: its score is the score
 *   - a forged score, a broken or illegal play, a second run: refused
 *   - the board ranks a win over a loss, then stars, then the look
 *   - the share squares give nothing away */
import test from 'node:test';
import assert from 'node:assert/strict';
import { handle } from '../../_arcadelab/api.js';
import { memoryDb } from '../../_arcadelab/db-memory.js';
import { FLAGS, EXTERNAL, GAMES } from '../../_arcadelab/registry.js';
import { seedFor, dateKey } from '../../_arcadelab/shared/seed.js';
import { simulate } from '../sim.js';
import { dailyConfig, dailyScenario, replay, scoreOf, scoreText, squares, gems, cleanPlay } from '../daily.js';

const T0 = Date.parse('2026-11-14T16:00:00Z');
const DAY = dateKey(T0);
const SEED = seedFor(DAY, 'last-shot');
function setup(flag = 'testers') {
  const clock = { t: T0 };
  const db = memoryDb({ roles: { boss: 'admin', dev: 'tester', dev2: 'tester' }, names: { dev: 'devname', dev2: 'two' },
    flags: Object.fromEntries(FLAGS.map(f => [f, f === 'arcade_last_shot' ? flag : 'off'])), now: () => clock.t });
  const call = (method, path, uid, body, guestId, query) => handle({ method, path, uid, body, guestId, query }, { db, now: () => clock.t });
  return { db, clock, call };
}
const P = (x, y) => ({ x, y });
function playFor(cfg) {
  const sc = dailyScenario(cfg), a = sc.spots.O2;
  const scr = P((a.x + 7) / 2 + 0.5, (a.y + 23) / 2);
  return { sc, play: { spots: sc.spots, goAt: Math.min(sc.clock, 6), steps: [
    { kind: 'screen', who: 'O5', pts: [scr] }, { kind: 'move', who: 'O2', pts: [P(scr.x - 1, scr.y - 1), P(7, 23)] },
    { kind: 'pass', from: 'O1', to: 'O2' }, { kind: 'shoot', who: 'O2' }] } };
}
const runBody = (play, score, extra) => ({ mode: 'daily', dateKey: DAY, seed: SEED, inputs: [play], score, durationMs: 20000, ...extra });

test('Last Shot is an external game: the daily service only, not a Lab page', () => {
  assert.ok(EXTERNAL['last-shot'] && !GAMES['last-shot']);
  assert.ok(FLAGS.includes('arcade_last_shot'));
});

test('a non-tester, a guest and anybody while the flag is off get a 404', async () => {
  const on = setup('testers');
  for (const p of ['last-shot/today', 'last-shot/leaderboard']) {
    assert.equal((await on.call('GET', p, 'nobody')).status, 404);
    assert.equal((await on.call('GET', p, null, null, 'guest-12345678')).status, 404);
  }
  assert.equal((await on.call('GET', 'last-shot/today', 'dev')).status, 200);
  const off = setup('off');
  assert.equal((await off.call('GET', 'last-shot/today', 'dev')).status, 404);
  assert.equal((await off.call('GET', 'last-shot/today', 'boss')).status, 200, 'an admin always sees it');
  const me = (await on.call('GET', 'me', 'dev')).body;
  assert.ok(me.games.some(g => g.id === 'last-shot' && g.path === '/last-shot#daily'));
});

test('one situation a day, the same for everybody', async () => {
  const { call } = setup();
  const a = (await call('GET', 'last-shot/today', 'dev')).body, b = (await call('GET', 'last-shot/today', 'dev2')).body;
  assert.equal(a.seed, SEED); assert.deepEqual(a.config, b.config); assert.deepEqual(a.config, dailyConfig(SEED));
  const c = a.config;
  assert.ok([22, 18, 14, 10, 8, 6].includes(c.clock) && [1, 2, 3].includes(c.down));
  assert.match(c.title, /^Down \d\. \d+ seconds\. /);
  // the days vary
  const days = new Set(Array.from({ length: 30 }, (_, i) => JSON.stringify(dailyConfig(seedFor('2026-12-' + String(i + 1).padStart(2, '0'), 'last-shot')))));
  assert.ok(days.size >= 12, 'distinct days ' + days.size);
});

test('the server runs the play: a true score files once, pays gems and boards', async () => {
  const { call } = setup();
  const cfg = dailyConfig(SEED), { sc, play } = playFor(cfg);
  const truth = scoreOf(simulate(sc, play, SEED));
  assert.equal(replay(SEED, [play], cfg).score, truth);
  const forged = await call('POST', 'last-shot/run', 'dev', runBody(play, truth + 1));
  assert.equal(forged.status, 400); assert.equal(forged.body.error, 'score_mismatch');
  const r = await call('POST', 'last-shot/run', 'dev', runBody(play, truth));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.result.score, truth);
  assert.equal(r.body.result.scoreText, scoreText(truth));
  assert.equal(r.body.gems, gems(truth));
  assert.equal((await call('POST', 'last-shot/run', 'dev', runBody(play, truth))).status, 409, 'one a day');
  const today = (await call('GET', 'last-shot/today', 'dev')).body;
  assert.equal(today.played.score, truth);
  const board = (await call('GET', 'last-shot/leaderboard', 'dev')).body;
  assert.equal(board.top[0].score, truth); assert.equal(board.me.rank, 1);
});

test('a broken or illegal play is refused', async () => {
  const { call } = setup();
  const cfg = dailyConfig(SEED), { play } = playFor(cfg);
  const cases = [
    [{ ...play, steps: play.steps.slice(0, 3) }, 'illegal_play'],
    [{ ...play, spots: { ...play.spots, O3: { x: 400, y: 2 } } }, 'bad_play'],
    [{ ...play, steps: [{ kind: 'teleport', who: 'O2' }] }, 'bad_play'],
    [{ ...play, goAt: 'soon' }, 'bad_play']
  ];
  for (const [bad, why] of cases) {
    const r = await call('POST', 'last-shot/run', 'dev', runBody(bad, 0));
    assert.equal(r.body.error, why, JSON.stringify(r.body));
  }
  assert.equal((await call('POST', 'last-shot/run', 'dev', { ...runBody(play, 0), inputs: [play, play] })).body.error, 'bad_inputs');
  assert.equal((await call('POST', 'last-shot/run', 'dev', { ...runBody(play, 0), seed: SEED + 1 })).body.error, 'wrong_seed');
});

test('only what the sim reads rides into the run', () => {
  const cfg = dailyConfig(SEED), { play } = playFor(cfg);
  const dirty = { ...play, extra: 'x', steps: play.steps.map(s => ({ ...s, beat: 2, note: 'hi' })) };
  const clean = cleanPlay(dirty);
  assert.equal(clean.extra, undefined);
  assert.ok(clean.steps.every(s => s.beat === undefined && s.note === undefined));
  assert.equal(replay(SEED, [dirty], cfg).score, replay(SEED, [play], cfg).score);
});

test('the score ranks a win, then stars, then the look; the share gives nothing away', () => {
  const win = (stars, p) => scoreOf({ outcome: 'win', shot: { p, bailout: false }, shotAt: stars === 3 ? 2.8 : 4, how: 'make' });
  assert.ok(win(1, 0.3) > scoreOf({ outcome: 'lose', shot: { p: 0.9 } }), 'any win beats any loss');
  assert.ok(win(3, 0.55) > win(2, 0.9), 'stars before the look');
  assert.equal(scoreText(1372), 'Won · 3 stars · 72% look');
  assert.equal(scoreText(1144), 'Won · 1 star · 44% look');
  assert.equal(scoreText(37), 'Lost · 37% look');
  assert.deepEqual(squares({ outcome: 'win', stars: 2 }), ['⭐', '⭐', '⬛']);
  assert.deepEqual(squares({ outcome: 'lose', stars: 0 }), ['⬛', '⬛', '⬛']);
  assert.ok(gems(1372) > gems(1144) && gems(1144) > gems(10));
});
