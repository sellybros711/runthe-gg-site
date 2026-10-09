/* Stumpire's API, as plain functions over a database interface. The Pages
 * Function at functions/api/stumpire/[[path]].js is a thin wrapper around
 * handle(); tests and the local dev server call it with db-memory.js.
 *
 * ALL GAME STATE STAYS ON THE SERVER. Nothing a response carries can tell a
 * player a valid answer or the called list before the at-bat that earns it is
 * over, except the one called answer the rules show as the tell.
 *
 * THE GATE: anybody stumpire_access() does not let in gets a 404 on every
 * route, the same 404 an unknown path gets, so the game's existence is not
 * confirmed to them. Admin routes want the admin role, and 404 otherwise.
 */
import { CONFIG } from './config.js';
import * as G from './game.js';
import { resolve, suggest } from './matcher.js';
import { get, brief } from './entities.js';
import { slateDate, slateNumber } from './slate.js';
import { buildSlate, previewPrompt, frozenRows } from './publish.js';

const NOT_FOUND = { status: 404, body: { error: 'not_found' } };
const ok = body => ({ status: 200, body });
const bad = (error, status = 400) => ({ status, body: { error } });

/* req: { method, path (after /api/stumpire/), query, body, uid, guestId }
   deps: { db, now: () => ms, searchAvg: () => ({ id: n }) } */
export async function handle(req, deps) {
  const { db } = deps;
  const now = deps.now ? deps.now() : Date.now();
  const path = String(req.path || '').replace(/^\/+|\/+$/g, '');
  let access = null;
  try { access = req.uid ? await db.access(req.uid) : ((await db.mode()) === 'public' && req.guestId ? 'player' : null); }
  catch (e) { access = null; }
  if (!access) return NOT_FOUND;
  const isAdmin = access === 'admin';
  const route = req.method + ' ' + path;
  try {
    switch (route) {
      case 'GET me': return ok({ access, guestPlay: (await db.mode()) === 'public' });
      case 'GET search': return ok({ results: suggest(String((req.query && req.query.q) || '')) });
      case 'GET today': return ok(await today(req, deps, now));
      case 'POST pitch': return await pitch(req, deps, now);
      case 'POST answer': return await answerRoute(req, deps, now);
      case 'GET result': return await result(req, deps, now);
      case 'POST challenge': return await challenge(req, deps, now);
      case 'POST claim': return await claim(req, deps);
    }
    if (path.startsWith('admin/')) {
      if (!isAdmin) return NOT_FOUND;
      return await admin(route, req, deps, now);
    }
    return NOT_FOUND;
  } catch (e) {
    if (e && e.code === 'conflict') return bad('conflict', 409);
    return bad(e && e.message ? e.message : 'error', 500);
  }
}

/* ---------- loading ---------- */
async function loadSlate(db, date) {
  const s = await db.slate(date);
  return s || null;
}
async function slateFor(db, s, atBat) {
  // The engine only needs the prompt being played. Rows are frozen.
  const rows = await db.answers(s.slate_date, atBat);
  const map = new Map(rows.map(r => [r.entity_id, r]));
  const prompts = [];
  prompts[atBat] = { id: s.prompt_ids[atBat], league: s.leagues[atBat], type: s.types[atBat], rows: map };
  return { prompts, rows };
}
async function loadPlay(req, db, date, create, s) {
  const who = req.uid ? { uid: req.uid } : { guestId: req.guestId };
  let p = await db.getPlay(date, who);
  if (!p && create) p = await db.createPlay(date, who, G.newPlay(date, s.slate_no));
  return p;
}
async function save(db, play, st) {
  const sm = G.summary(st);
  const v = await db.savePlay(play.id, play.version, st, sm);
  if (v == null) { const e = new Error('conflict'); e.code = 'conflict'; throw e; }
  play.version = v; play.state = st;
}

function tellOf(rows) {
  const called = rows.filter(r => r.called).sort((a, b) => b.expected_share - a.expected_share);
  return called.length ? called[0].name : null;
}
function calledNames(rows) {
  return rows.filter(r => r.called).sort((a, b) => b.expected_share - a.expected_share).map(r => r.name);
}

/* What the client may know right now. */
async function view(db, s, play, now) {
  const st = play.state;
  const out = {
    slate: { date: s.slate_date, no: s.slate_no }, total: CONFIG.AT_BATS, clockMs: CONFIG.CLOCK_MS,
    atBat: st.i, outs: st.outs, over: st.over, won: st.won, summary: G.summary(st), history: []
  };
  for (let i = 0; i < st.ab.length; i++) {
    const a = st.ab[i];
    if (a.s !== 'done') continue;
    const rows = await db.answers(s.slate_date, i);
    out.history.push({ atBat: i, prompt: s.prompt_text[i], league: s.leagues[i], ruling: a.r.ruling, tier: a.r.tier,
      answer: a.r.id ? (a.r.name || (get(a.r.id) || {}).n || null) : null, strikeout: !!a.r.strikeout,
      strikes: a.strikes, called: calledNames(rows) });
  }
  const ab = G.current(st);
  if (ab) {
    const cur = { status: ab.s, strikes: ab.strikes, maxTier: G.maxTier(ab.strikes), league: s.leagues[st.i], type: s.types[st.i] };
    if (ab.s === 'live') {
      const rows = await db.answers(s.slate_date, st.i);
      cur.prompt = s.prompt_text[st.i];
      cur.calledCount = rows.filter(r => r.called).length;
      cur.tell = tellOf(rows);
      cur.remainingMs = G.remaining(ab, now);
      cur.paused = !!ab.pausedAt;
    }
    out.current = cur;
  }
  if (st.over) out.share = G.shareLine(st);
  return out;
}

/* ---------- player routes ---------- */
async function today(req, deps, now) {
  const date = slateDate(now);
  const s = await loadSlate(deps.db, date);
  if (!s) return { noSlate: true, date, no: slateNumber(date) };
  const play = await loadPlay(req, deps.db, date, true, s);
  return view(deps.db, s, play, now);
}

async function pitch(req, deps, now) {
  const date = slateDate(now);
  const s = await loadSlate(deps.db, date);
  if (!s) return bad('no_slate', 404);
  const play = await loadPlay(req, deps.db, date, true, s);
  const st = play.state;
  const r = G.start(st, now);
  if (r.error) return bad(r.error, 409);
  await save(deps.db, play, st);
  return ok(await view(deps.db, s, play, now));
}

async function answerRoute(req, deps, now) {
  const date = slateDate(now);
  const s = await loadSlate(deps.db, date);
  if (!s) return bad('no_slate', 404);
  const play = await loadPlay(req, deps.db, date, false, s);
  if (!play) return bad('not_started', 409);
  const st = play.state, i = st.i;
  const b = req.body || {};
  const input = b.entityId ? { entityId: String(b.entityId) } : b.timeout ? { timeout: true }
    : { text: String(b.text || '').slice(0, CONFIG.RAW_INPUT_MAX) };
  if (!G.current(st)) return bad('game_over', 409);
  const sl = await slateFor(deps.db, s, i);
  const res = G.answer(st, input, sl, resolve, now);
  if (res.error) return bad(res.error, 409);
  await save(deps.db, play, st);
  if (res.log) {
    await deps.db.log({ slate_date: date, at_bat: i, prompt_id: s.prompt_ids[i], play_id: play.id,
      raw: (res.log.raw || '').slice(0, 60), matched_id: res.log.matched, status: res.log.status,
      via: res.log.via, ruling: res.ruling }).catch(() => {});
  }
  if (res.review) {
    await deps.db.review({ slate_date: date, at_bat: i, prompt_id: s.prompt_ids[i], entity_id: res.review.id,
      play_id: play.id, reason: res.review.reason }).catch(() => {});
  }
  const out = { ruling: res.ruling, tier: res.tier != null ? res.tier : null, strikes: res.strikes,
    strikeout: !!res.strikeout, expired: !!res.expired, reason: res.reason || null };
  if (res.picker) out.picker = res.picker;
  if (res.match) out.answer = brief(get(res.match));
  if (res.atBatOver) out.reveal = { called: calledNames(sl.rows) };
  out.state = await view(deps.db, s, play, now);
  return ok(out);
}

async function result(req, deps, now) {
  const date = (req.query && req.query.date) || slateDate(now);
  const s = await loadSlate(deps.db, date);
  if (!s) return bad('no_slate', 404);
  const play = await loadPlay(req, deps.db, date, false, s);
  if (!play) return bad('no_play', 404);
  const v = await view(deps.db, s, play, now);
  if (!play.state.over) return ok({ ...v, final: false });
  // After the game: what real players said, as flavor only. Never a grade.
  const crowd = [];
  for (let i = 0; i < CONFIG.AT_BATS; i++) {
    const counts = await deps.db.crowd(s.prompt_ids[i]).catch(() => []);
    const total = counts.reduce((t, c) => t + c.n, 0);
    crowd.push(counts.sort((a, b) => b.n - a.n).slice(0, 5).map(c => ({ name: (get(c.entity_id) || {}).n || c.entity_id, pct: total ? Math.round(100 * c.n / total) : 0 })));
  }
  return ok({ ...v, final: true, share: G.shareLine(play.state), crowd });
}

async function challenge(req, deps, now) {
  const date = slateDate(now);
  const s = await loadSlate(deps.db, date);
  if (!s) return bad('no_slate', 404);
  const play = await loadPlay(req, deps.db, date, false, s);
  if (!play) return bad('no_play', 404);
  const b = req.body || {};
  const i = Number(b.atBat);
  const ab = play.state.ab[i];
  if (!ab || (ab.s !== 'done' && !(ab.s === 'live' && ab.strikes > 0))) return bad('nothing_to_challenge');
  const last = await deps.db.lastLog(play.id, i).catch(() => null);
  const row = await deps.db.addChallenge({
    play_id: play.id, user_id: req.uid || null, slate_date: date, at_bat: i, prompt_id: s.prompt_ids[i],
    entity_id: (ab.r && ab.r.id) || (last && last.matched_id) || null, raw: last ? last.raw : null,
    ruling: ab.s === 'done' ? (ab.r.strikeout ? 'STRIKEOUT' : ab.r.ruling) : 'STRIKE',
    note: b.note ? String(b.note).slice(0, 280) : null
  });
  if (!row) return bad('already_challenged', 409);
  return ok({ challenge: { id: row.id, status: 'open' } });
}

async function claim(req, deps) {
  if (!req.uid || !req.body || !req.body.guestId) return bad('sign_in');
  const n = await deps.db.claim(String(req.body.guestId), req.uid);
  return ok({ claimed: n });
}

/* ---------- admin ---------- */
async function admin(route, req, deps, now) {
  const { db } = deps;
  const b = req.body || {};
  const sa = deps.searchAvg ? deps.searchAvg() : {};
  switch (route) {
    case 'GET admin/testers': return ok({ testers: await db.testers(), mode: await db.mode() });
    case 'POST admin/testers': {
      const r = await db.addTester(b.username ? String(b.username) : null, b.userId || null, b.role === 'admin' ? 'admin' : 'tester', b.note || null);
      return r ? ok({ added: r }) : bad('no_such_user', 404);
    }
    case 'DELETE admin/testers':
      if (b.userId === req.uid) return bad('you_cannot_remove_yourself');
      return ok({ removed: await db.removeTester(String(b.userId)) });
    case 'POST admin/mode':
      if (!['off', 'testers', 'public'].includes(b.mode)) return bad('bad_mode');
      await db.setMode(b.mode); return ok({ mode: b.mode });
    case 'GET admin/prompts': return ok({ prompts: await db.prompts() });
    case 'POST admin/prompts': {
      const d = b.prompt || {};
      if (!d.id || !/^[a-z0-9-]{3,60}$/.test(d.id)) return bad('id must be 3-60 lowercase letters, digits and hyphens');
      if (!d.text) return bad('text is required');
      await db.savePrompt(d); return ok({ saved: d.id });
    }
    case 'POST admin/preview': {
      const d = b.prompt || {};
      const at = Math.max(0, Math.min(4, Number(b.atBat) || 0));
      const observed = d.id ? await db.observed(d.id).catch(() => ({})) : {};
      const p = previewPrompt(d, at, sa, observed);
      return ok({
        count: p.graded.length, bands: p.check.bands, errors: p.check.errors, warnings: p.check.warnings,
        called: p.called ? { coverage: p.called.coverage, flag: p.called.flag, names: p.called.ids.map(id => (get(id) || {}).n) } : null,
        sample: p.graded.slice(0, 60).map(r => ({ id: r.id, name: r.name, expected: r.expected, depth: r.depth, tier: r.tier, called: !!r.called, arguable: !!r.arguable }))
      });
    }
    case 'POST admin/publish': {
      const date = String(b.date || slateDate(now));
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return bad('bad date');
      const all = await db.prompts();
      const defs = (b.promptIds || []).map(id => all.find(p => p.id === id));
      if (defs.length !== CONFIG.AT_BATS || defs.some(d => !d)) return bad('pick five saved prompts');
      const obs = {};
      for (const d of defs) obs[d.id] = await db.observed(d.id).catch(() => ({}));
      const built = buildSlate(defs, sa, id => obs[id] || {});
      if (!built.ok) return ok({ published: false, errors: built.errors });
      const rows = [];
      built.prompts.forEach((p, i) => frozenRows(p).forEach(r => rows.push({ ...r, at_bat: i, prompt_id: p.def.id })));
      await db.publish(date, slateNumber(date), defs, rows, req.uid);
      return ok({ published: true, date, no: slateNumber(date), rows: rows.length });
    }
    case 'GET admin/challenges': return ok({ challenges: await db.challenges() });
    case 'POST admin/challenges/resolve': return await resolveChallenge(req, deps, now);
    case 'GET admin/review': return ok({ review: await db.reviewList() });
    case 'GET admin/nopitch': return ok({ nopitch: await db.nopitchList() });
  }
  return NOT_FOUND;
}

/* An upheld challenge fixes the data and restores the player's result.
   - The answer, if the slate missed it, joins today's slate as a benefit of
     the doubt single (stumpire_accept_answer), so later players get it too.
   - The challenged at-bat loses the strike it was charged and becomes a hit
     at the frozen tier or a single, whichever is higher. A strikeout out is
     taken off the board, and a game it ended is reopened.
   The alias or missing fact itself is fixed in the repo (data/aliases.json,
   data/fixes.json) and rebuilt, which the resolution text records. */
async function resolveChallenge(req, deps, now) {
  const { db } = deps;
  const b = req.body || {};
  const c = await db.challenge(Number(b.id));
  if (!c || c.status !== 'open') return bad('no_open_challenge', 404);
  const upheld = !!b.upheld;
  if (upheld) {
    const play = await db.playById(c.play_id);
    const s = await loadSlate(db, c.slate_date);
    const st = play.state, ab = st.ab[c.at_bat];
    const entity = b.entityId || c.entity_id;
    const e = entity ? get(entity) : null;
    let frozen = null;
    if (e) {
      const rows = await db.answers(c.slate_date, c.at_bat);
      frozen = rows.find(r => r.entity_id === e.id) || null;
      if (!frozen) await db.acceptAnswer(c.slate_date, c.at_bat, c.prompt_id, e.id, e.n);
    }
    const wasOut = ab.s === 'done' && ab.r.ruling === 'OUT';
    ab.strikes = Math.max(0, (ab.strikes || 0) - 1);
    const tier = Math.max(1, Math.min(frozen && !frozen.called ? frozen.tier : 1, G.maxTier(ab.strikes)));
    if (ab.s === 'done') {
      ab.r = { ruling: 'SAFE', tier, id: e ? e.id : ab.r.id, name: e ? e.n : ab.r.name, restored: true };
      if (wasOut) st.outs = Math.max(0, st.outs - 1);
      if (st.over && st.outs < CONFIG.OUTS_TO_END && st.i < CONFIG.AT_BATS) { st.over = false; st.won = false; }
      if (st.over) st.won = st.i >= CONFIG.AT_BATS && st.outs < CONFIG.OUTS_TO_END;
    }
    await save(db, play, st);
    void s;
  }
  await db.resolveChallenge(c.id, upheld ? 'upheld' : 'denied', req.uid, b.resolution ? String(b.resolution).slice(0, 280) : null);
  return ok({ id: c.id, status: upheld ? 'upheld' : 'denied' });
}
