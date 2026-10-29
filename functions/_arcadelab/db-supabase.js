/* The Arcade Lab database over Supabase's REST API with the service role.
 * The key never leaves the Pages Function. Every table is RLS'd with no
 * policies and revoked from browser roles (supabase/134_arcade_lab.sql). */
export function supabaseDb(env) {
  const base = env.SUPABASE_URL + '/rest/v1/';
  const H = { apikey: env.SUPABASE_SERVICE_ROLE, Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE, 'Content-Type': 'application/json' };
  async function req(method, path, body, extra = {}) {
    const r = await fetch(base + path, { method, headers: { ...H, ...extra }, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await r.text();
    const data = text ? JSON.parse(text) : null;
    if (!r.ok) { const e = new Error((data && data.message) || ('supabase ' + r.status)); e.status = r.status; e.pg = data && data.code; throw e; }
    return { data, headers: r.headers };
  }
  const get = async p => (await req('GET', p)).data;
  const rpc = async (fn, args) => (await req('POST', 'rpc/' + fn, args || {})).data;
  const q = encodeURIComponent;
  const whoF = who => who.uid ? 'user_id=eq.' + q(who.uid) : 'guest_id=eq.' + q(who.guestId);
  async function count(path) {
    const r = await req('GET', path + '&select=id&limit=1', undefined, { Prefer: 'count=exact', Range: '0-0' });
    const cr = r.headers.get('content-range') || '';
    const n = Number(cr.split('/')[1]);
    return isFinite(n) ? n : 0;
  }
  const scope = (game, date, tester) => 'arcade_runs?game_id=eq.' + q(game) + '&date_key=eq.' + q(date) +
    '&mode=eq.daily&user_id=not.is.null&restarted=eq.false' + (tester ? '' : '&tester=eq.false');
  return {
    async role(uid) { const r = await get('stumpire_testers?user_id=eq.' + q(uid) + '&select=role'); return (r[0] && r[0].role) || null; },
    async flags() { const o = {}; for (const r of await get('arcade_lab_flags?select=flag,mode')) o[r.flag] = r.mode; return o; },
    async setFlag(f, m) { await req('PATCH', 'arcade_lab_flags?flag=eq.' + q(f), { mode: m, updated_at: new Date().toISOString() }); },
    async getRun(who, game, date) {
      const r = await get('arcade_runs?' + whoF(who) + '&game_id=eq.' + q(game) + '&date_key=eq.' + q(date) + '&mode=eq.daily&select=*');
      return r[0] || null;
    },
    async insertRun(row) {
      try { return (await req('POST', 'arcade_runs?select=id', row, { Prefer: 'return=representation' })).data[0].id; }
      catch (e) { if (e.pg === '23505') return null; throw e; }
    },
    async awardGems(row) {
      try { await req('POST', 'gem_ledger', row, { Prefer: 'return=minimal' }); return true; }
      catch (e) { if (e.pg === '23505') return false; throw e; }
    },
    async gemTotal(who) { return Number(await rpc('arcade_gem_total', { p_uid: who.uid || null, p_guest: who.uid ? null : who.guestId })) || 0; },
    async board(game, date, limit, tester) { return rpc('arcade_lab_board', { p_game: game, p_date: date, p_limit: limit, p_tester: !!tester }); },
    async countAbove(game, date, score, tester) { return count(scope(game, date, tester) + '&score=gt.' + score); },
    async countAll(game, date, tester) { return count(scope(game, date, tester)); },
    async reject(row) { await req('POST', 'arcade_run_rejections', row, { Prefer: 'return=minimal' }); },
    async recentPosts(who, sinceMs) {
      const since = q(new Date(sinceMs).toISOString());
      return (await count('arcade_run_rejections?' + whoF(who) + '&created_at=gte.' + since))
        + (await count('arcade_runs?' + whoF(who) + '&created_at=gte.' + since));
    },
    async start(who, game, date) { return Number(await rpc('arcade_lab_start', { p_who: who, p_game: game, p_date: date })) || 1; },
    async starts(who, game, date) {
      const r = await get('arcade_starts?who=eq.' + q(who) + '&game_id=eq.' + q(game) + '&date_key=eq.' + q(date) + '&select=starts');
      return (r[0] && r[0].starts) || 0;
    },
    async slate(game, date) { const r = await get('arcade_slates?game_id=eq.' + q(game) + '&date_key=eq.' + q(date) + '&select=*'); return r[0] || null; },
    async lastSlate(game, before) {
      const r = await get('arcade_slates?game_id=eq.' + q(game) + '&date_key=lt.' + q(before) + '&select=*&order=date_key.desc&limit=1');
      return r[0] || null;
    },
    async slates(game) { return get('arcade_slates?game_id=eq.' + q(game) + '&select=game_id,date_key,source_ids,published_at&order=date_key.desc&limit=60'); },
    async insertSlate(row) {
      try { await req('POST', 'arcade_slates', row, { Prefer: 'return=minimal' }); return true; }
      catch (e) { if (e.pg === '23505') return false; throw e; }
    },
    async prompts(game) { return get('arcade_prompts?game_id=eq.' + q(game) + '&select=*&order=updated_at.desc'); },
    async prompt(id) { const r = await get('arcade_prompts?id=eq.' + q(id) + '&select=*'); return r[0] || null; },
    async upsertPrompt(row) {
      await req('POST', 'arcade_prompts?on_conflict=id', { ...row, approved_by: null, updated_at: new Date().toISOString() },
        { Prefer: 'resolution=merge-duplicates,return=minimal' });
    },
    async setPromptStatus(id, status, uid, report) {
      await req('PATCH', 'arcade_prompts?id=eq.' + q(id), { status, approved_by: uid || null, report: report || {}, updated_at: new Date().toISOString() });
    },
    async report(row) {
      try { await req('POST', 'arcade_reports', row, { Prefer: 'return=minimal' }); return true; }
      catch (e) { if (e.pg === '23505') return false; throw e; }
    },
    async reports() { return get('arcade_reports?select=*&order=created_at.desc&limit=200'); },
    async claim(guest, uid) { return Number(await rpc('arcade_lab_claim', { p_guest: guest, p_uid: uid })) || 0; }
  };
}
