/* The Arcade Lab's admin routes, for the admin page at /arcade/lab/admin/.
 * api.js has already refused anybody who is not an admin (with a 404).
 *
 *   GET  prompts?game=whack|drop-board     every prompt or theme, with its last report
 *   POST validate  { game, def }           run the validator, save nothing
 *   POST prompts   { game, def }           save a draft (validated; any edit is a draft again)
 *   POST draft     { game }                Claude's drafts from the templates, as drafts
 *   POST status    { id, status }          approve (only if it validates now) or reject
 *   POST preview   { game, date, ids }     the snapshot a publish would freeze
 *   POST publish   { game, date, ids }     freeze it into arcade_slates (never changed after)
 *   GET  slates?game=                      what is published
 *   GET  reports                           "this was wrong" reports, newest first
 *
 * An editor approves every prompt. A draft never reaches a slate.
 */
const ok = body => ({ status: 200, body });
const bad = (error, status = 400, extra) => ({ status, body: { error, ...(extra || {}) } });
const KIND = { whack: 'whack', 'drop-board': 'drop' };

function tools(C, game) {
  if (KIND[game] === 'whack') return { validate: C.whack.validatePrompt, drafts: () => C.whack.TEMPLATES.map(C.whack.draftPrompt),
    snapshot: defs => C.whack.snapshotSlate(defs), count: 3 };
  if (KIND[game] === 'drop') return { validate: C.drop.validateTheme, drafts: () => C.drop.STAT_THEMES.map(C.drop.draftTheme),
    snapshot: defs => C.drop.snapshotTheme(defs[0]), count: 1 };
  return null;
}
const ID = /^[a-z0-9][a-z0-9-]{2,60}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function admin(parts, req, ctx) {
  const { db } = ctx;
  const b = req.body || {}, q = req.query || {};
  const what = parts[0];
  if (what === 'reports' && req.method === 'GET') return ok({ reports: await db.reports() });
  const game = req.method === 'GET' ? q.game : b.game;
  if (what === 'status' && req.method === 'POST') {
    const p = await db.prompt(b.id);
    if (!p) return bad('unknown_prompt', 404);
    if (b.status === 'rejected') { await db.setPromptStatus(p.id, 'rejected', req.uid, p.report); return ok({ id: p.id, status: 'rejected' }); }
    if (b.status !== 'approved') return bad('bad_status');
    const T = tools(await ctx.content(), p.game_id);
    const report = T.validate(p.def);
    if (!report.ok) { await db.setPromptStatus(p.id, 'draft', null, report); return bad('does_not_validate', 422, { report }); }
    await db.setPromptStatus(p.id, 'approved', req.uid, report);
    return ok({ id: p.id, status: 'approved', report });
  }
  if (!KIND[game]) return bad('bad_game');
  if (what === 'prompts' && req.method === 'GET') return ok({ prompts: await db.prompts(game) });
  if (what === 'slates' && req.method === 'GET') return ok({ slates: await db.slates(game) });
  const C = await ctx.content();
  const T = tools(C, game);
  if (what === 'validate' && req.method === 'POST') return ok({ report: T.validate(b.def) });
  if (what === 'prompts' && req.method === 'POST') {
    const def = b.def || {};
    if (!ID.test(def.id || '')) return bad('bad_id');
    const report = T.validate(def);
    await db.upsertPrompt({ id: def.id, game_id: game, def, status: 'draft', report, drafted_by: 'editor' });
    return ok({ id: def.id, status: 'draft', report });
  }
  if (what === 'draft' && req.method === 'POST') {
    const have = new Set((await db.prompts(game)).map(p => p.id));
    const made = [];
    for (const { def, report } of T.drafts()) {
      if (have.has(def.id)) continue;
      await db.upsertPrompt({ id: def.id, game_id: game, def, status: 'draft', report, drafted_by: 'claude' });
      made.push({ id: def.id, ok: report.ok });
    }
    return ok({ drafted: made });
  }
  if ((what === 'preview' || what === 'publish') && req.method === 'POST') {
    const ids = Array.isArray(b.ids) ? b.ids : [];
    if (ids.length !== T.count) return bad('needs_' + T.count + '_ids');
    if (!DATE.test(b.date || '')) return bad('bad_date');
    const rows = [];
    for (const id of ids) {
      const p = await db.prompt(id);
      if (!p || p.game_id !== game) return bad('unknown_prompt', 404, { id });
      if (what === 'publish' && p.status !== 'approved') return bad('not_approved', 422, { id });
      rows.push(p);
    }
    let payload;
    try { payload = T.snapshot(rows.map(r => r.def)); } catch (e) { return bad('does_not_validate', 422, { message: e.message }); }
    if (what === 'preview') return ok({ payload });
    if (await db.slate(game, b.date)) return bad('already_published', 409);
    const saved = await db.insertSlate({ game_id: game, date_key: b.date, payload, source_ids: ids, published_by: req.uid });
    if (!saved) return bad('already_published', 409);
    return ok({ published: { game, date: b.date }, payload });
  }
  return { status: 404, body: { error: 'not_found' } };
}
