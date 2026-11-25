/* Run The Course: the server side of a save, as pure functions so the tests
 * can drive them (functions/api/course/[[path]].js is the glue).
 *
 *   GET  /api/course/state?seed=N   the account's course (made on the first visit)
 *   POST /api/course/shift          file one shift: { no, v, checksum, log }
 *   GET  /api/course/e              the events probe: { on }
 *   POST /api/course/e              a batch of events (events.js)
 *
 * THE SERVER OWNS CASH, STARS AND UNLOCKS. A filed shift is the player's
 * command log, nothing else. The server re-runs it with the game's own
 * simulation (course/sim.js, the same file the page runs) from the course it
 * has stored, and files ITS numbers. The page's checksum is only compared,
 * to say whether the two agreed. The shift number must be the next one, so a
 * retry or a second tab changes nothing.
 *
 * A course belongs to a signed in account. A guest plays on the device and
 * the page files those shifts, in order, after signing in. */
import { CONFIG } from '../../course/config.js';
import { MAP } from '../../course/map.js';
import { newCourse, replay } from '../../course/sim.js';
import { cleanBatch, allowed } from './events.js';

export const MAX_BODY = 200000;
const json = (status, body) => ({ status, json: body });

/* A database row (supabase/187 course_open) as the sim's course object. */
export function toCourse(row) {
  const c = row.course, st = c.state || {};
  return {
    schema: c.schema_version, seed: c.seed, name: c.name, tier: c.tier,
    cash: Number(c.cash), stars: Number(c.stars), reviews: Array.isArray(st.reviews) ? st.reviews : [], shiftsFiled: c.shifts_filed,
    unlocks: st.unlocks || {},
    holes: row.holes.map(h => ({ ord: h.ord, par: h.par, open: h.open, green: Number(h.condition.green), fairway: Number(h.condition.fairway) }))
  };
}
function seedHoles() {
  return newCourse(CONFIG, MAP, 0).holes.map(h => ({ ord: h.ord, par: h.par, template: MAP.holes[h.ord - 1].template, open: h.open,
    condition: { green: h.green, fairway: h.fairway } }));
}
const seedOf = v => { const n = Number(v); return Number.isInteger(n) && n >= -2147483648 && n <= 2147483647 ? n : null; };

export async function handle({ method, sub, query, body, uid, country }, db, cfg = CONFIG, map = MAP) {
  const s = String(sub || '').replace(/\/+$/, '');
  if (s === 'e') {
    if (method === 'GET') return json(200, { on: allowed(country) });
    if (method !== 'POST') return json(405, { error: 'method' });
    const batch = cleanBatch(body);
    if (batch && allowed(country) && (uid || batch.device)) { try { await db.events(uid, batch.device, batch.rows); } catch (e) { /* a failed write is dropped, never shown */ } }
    return { status: 204, json: null };
  }
  if (s !== 'state' && s !== 'shift') return json(404, { error: 'not found' });
  if (!uid) return json(401, { error: 'sign in' });
  let row = null;
  try {
    const seed = seedOf(query && query.seed);
    row = await db.open(uid, seed === null ? (Math.random() * 4294967296) | 0 : seed, seedHoles());
  } catch (e) { return json(503, { error: 'database' }); }
  if (!row || !row.course) return json(503, { error: 'database' });
  const course = toCourse(row);
  if (s === 'state') return method === 'GET' ? json(200, { course }) : json(405, { error: 'method' });

  if (method !== 'POST') return json(405, { error: 'method' });
  if (!body || typeof body !== 'object') return json(400, { error: 'body' });
  if (body.no !== course.shiftsFiled + 1) return json(409, { error: 'shift', course });
  if (body.v !== cfg.version || course.schema !== cfg.schema) return json(400, { error: 'version' });
  const end = replay(course, body.log, cfg, map);
  if (!end) return json(400, { error: 'log' });
  const r = end.result, c = end.course;
  let filed = null;
  try {
    filed = await db.file(uid, {
      no: r.no, seed: r.seed, v: r.v,
      result: { rounds: r.rounds, cash: r.cash, tips: r.tips, walk_offs: r.walkOffs, avg_round_s: r.avgRoundS, low_round: r.low || null },
      cash: c.cash, stars: c.stars, state: { reviews: c.reviews, unlocks: c.unlocks },
      conditions: c.holes.filter(h => h.open).map(h => ({ ord: h.ord, condition: { green: h.green, fairway: h.fairway } })),
      checksum: r.checksum, verified: 'replay'
    });
  } catch (e) { return json(503, { error: 'database' }); }
  if (!filed || !filed.filed) {
    /* somebody else filed this number first (a second tab): hand back what is stored */
    try { const again = await db.open(uid, 0, seedHoles()); return json(409, { error: 'shift', course: toCourse(again) }); } catch (e) { return json(503, { error: 'database' }); }
  }
  return json(200, { ok: true, match: r.checksum === body.checksum, course: c, result: r });
}
