/* The Arcade Lab API, over a database interface (db-supabase.js in
 * production, db-memory.js in the tests).
 *
 *   GET  me                        the games this account may see (404 if none)
 *   GET  :game/today               date, seed, the day's config, and any result
 *   POST :game/run                 a finished daily, re-simulated here
 *   GET  :game/leaderboard?date=   the day's top scores and the caller's rank
 *   POST claim                     move a guest's runs and gems to the account
 *   POST admin/flag                { flag, mode } (admins only)
 *
 * THE GATE: anybody accessFor() refuses gets the same 404 as an unknown path,
 * so a game's existence is never confirmed to them. Same rule as Stumpire.
 *
 * THE SERVER'S SCORE IS THE SCORE. A run arrives as a seed and an input log;
 * the pure sim replays it and the claimed score must match.
 */
import { GAMES, FLAGS, accessFor } from './registry.js';
import { dateKey, prevDateKey, seedFor, dayNumber } from './shared/seed.js';

const NOT_FOUND = { status: 404, body: { error: 'not_found' } };
const bad = (error, status = 400, extra) => ({ status, body: { error, ...(extra || {}) } });
const ok = body => ({ status: 200, body });

/* Rate limit: this many rejected or accepted posts in the window and the
   caller waits. Counted from the database so it holds across isolates. */
export const RATE = Object.freeze({ WINDOW_MS: 10 * 60 * 1000, MAX_POSTS: 12 });
/* A daily started before midnight may still be filed this long after it. */
export const DAY_GRACE_MS = 20 * 60 * 1000;
/* A run cannot be finished faster than its frames take at 60 Hz, less this. */
export const DURATION_SLACK = 0.8;
export const DURATION_MAX_MS = 6 * 3600 * 1000;

export async function handle(req, ctx) {
  const { db, now } = ctx;
  const parts = String(req.path || '').split('/').filter(Boolean);
  const who = req.uid ? { uid: req.uid } : (req.guestId ? { guestId: req.guestId } : null);
  const role = req.uid ? await db.role(req.uid) : null;
  const flags = await db.flags();

  if (parts.length === 1 && parts[0] === 'me' && req.method === 'GET') {
    const games = Object.values(GAMES)
      .map(g => ({ g, access: accessFor(role, flags[g.flag]) }))
      .filter(x => x.access && (x.access !== 'player' || who))
      .map(x => ({ id: x.g.id, name: x.g.name, path: x.g.path, desc: x.g.desc, access: x.access, flag: flags[x.g.flag] || 'off' }));
    if (!games.length) return NOT_FOUND;
    return ok({ games, role, gems: who ? await db.gemTotal(who) : 0 });
  }
  if (parts.length === 1 && parts[0] === 'claim' && req.method === 'POST') {
    if (!req.uid || !role) return NOT_FOUND;
    const g = req.body && req.body.guestId;
    if (!g || !/^[A-Za-z0-9-]{8,64}$/.test(g)) return bad('bad_guest');
    return ok({ moved: await db.claim(g, req.uid) });
  }
  if (parts[0] === 'admin') {
    if (role !== 'admin') return NOT_FOUND;
    if (parts[1] === 'flag' && req.method === 'POST') {
      const b = req.body || {};
      if (!FLAGS.includes(b.flag) || !['off', 'testers', 'public'].includes(b.mode)) return bad('bad_flag');
      await db.setFlag(b.flag, b.mode);
      return ok({ flag: b.flag, mode: b.mode });
    }
    if (parts[1] === 'flags' && req.method === 'GET') return ok({ flags });
    return NOT_FOUND;
  }

  const game = GAMES[parts[0]];
  if (!game || parts.length !== 2) return NOT_FOUND;
  const access = accessFor(role, flags[game.flag]);
  if (!access || !who) return NOT_FOUND;
  const tester = access !== 'player';
  const sim = game.sim;
  const t = now();
  const today = dateKey(t);

  if (parts[1] === 'today' && req.method === 'GET') {
    const seed = seedFor(today, game.id);
    const run = await db.getRun(who, game.id, today);
    return ok({ game: game.id, dateKey: today, dayNumber: dayNumber(today), seed, config: sim.dailyConfig(seed),
      played: run ? resultOf(sim, run) : null, gems: await db.gemTotal(who) });
  }

  if (parts[1] === 'leaderboard' && req.method === 'GET') {
    const date = /^\d{4}-\d{2}-\d{2}$/.test((req.query || {}).date || '') ? req.query.date : today;
    const top = await db.board(game.id, date, 20, tester);
    const mine = await db.getRun(who, game.id, date);
    let rank = null;
    if (mine && req.uid) rank = (await db.countAbove(game.id, date, mine.score, tester)) + 1;
    return ok({ date, top: top.map(r => ({ name: r.username || 'Player', score: r.score, me: !!req.uid && r.user_id === req.uid })),
      me: mine ? { score: mine.score, rank } : null, total: await db.countAll(game.id, date, tester) });
  }

  if (parts[1] === 'run' && req.method === 'POST') {
    const b = req.body || {};
    const reject = async (reason, extra, status = 400) => {
      await db.reject({ user_id: req.uid || null, guest_id: req.uid ? null : req.guestId, game_id: game.id, reason,
        detail: { ...(extra || {}), claimed: b.score } });
      return bad(reason, status, extra);
    };
    if (await db.recentPosts(who, t - RATE.WINDOW_MS) >= RATE.MAX_POSTS) return bad('slow_down', 429);
    if (b.mode !== 'daily') return reject('daily_only');
    let day = today;
    if (b.dateKey && b.dateKey !== today) {
      if (b.dateKey === prevDateKey(today) && dateKey(t - DAY_GRACE_MS) === b.dateKey) day = b.dateKey;
      else return reject('stale_day', { today });
    }
    const seed = seedFor(day, game.id);
    if (b.seed !== seed) return reject('wrong_seed');
    if (await db.getRun(who, game.id, day)) return reject('already_played', null, 409);
    if (!Array.isArray(b.inputs) || JSON.stringify(b.inputs).length > 20000) return reject('bad_inputs');
    const r = sim.replay(seed, b.inputs);
    if (r.error) return reject(r.error);
    if (b.score !== r.score) return reject('score_mismatch', { server: r.score });
    const simMs = r.frames * 1000 / 60;
    const dur = Number(b.durationMs);
    if (!isFinite(dur) || dur < simMs * DURATION_SLACK || dur > DURATION_MAX_MS) return reject('implausible_duration', { simMs: Math.round(simMs) });
    const gems = sim.gems(r.score);
    const id = await db.insertRun({
      user_id: req.uid || null, guest_id: req.uid ? null : req.guestId, game_id: game.id, date_key: day, mode: 'daily',
      seed, score: r.score, detail_json: r.detail, input_log_json: b.inputs, duration_ms: Math.round(dur),
      gems_awarded: gems, client_version: String(b.clientVersion || '').slice(0, 40), tester
    });
    if (!id) return reject('already_played', null, 409);
    await awardGems(db, { user_id: req.uid || null, guest_id: req.uid ? null : req.guestId, amount: gems,
      reason: game.id + ' daily', game_id: game.id, run_id: id, tester });
    const run = await db.getRun(who, game.id, day);
    return ok({ result: resultOf(sim, run), gems: await db.gemTotal(who) });
  }
  return NOT_FOUND;
}

/* The shared gem service. Idempotent per run: the ledger refuses a second
   row for the same run_id, so a retried post can never pay twice. */
export async function awardGems(db, row) {
  if (!(row.amount > 0)) return false;
  return db.awardGems(row);
}

function resultOf(sim, run) {
  return { score: run.score, scoreText: sim.scoreText(run.score), detail: run.detail_json, squares: sim.squares(run.detail_json),
    gems: run.gems_awarded, dateKey: run.date_key, dayNumber: dayNumber(run.date_key) };
}
