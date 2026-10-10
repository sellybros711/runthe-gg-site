/* Stumpire's database, over Supabase's REST API with the service role.
 * The key never leaves the Pages Function: it comes from env and is only
 * ever sent to env.SUPABASE_URL. */
export function supabaseDb(env) {
  const base = env.SUPABASE_URL + '/rest/v1/';
  const H = { apikey: env.SUPABASE_SERVICE_ROLE, Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE, 'Content-Type': 'application/json' };
  async function req(method, path, body, extra = {}) {
    const r = await fetch(base + path, { method, headers: { ...H, ...extra }, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await r.text();
    const data = text ? JSON.parse(text) : null;
    if (!r.ok) { const e = new Error((data && data.message) || ('supabase ' + r.status)); e.status = r.status; e.pg = data && data.code; throw e; }
    return data;
  }
  const rpc = (fn, args) => req('POST', 'rpc/' + fn, args || {});
  const q = encodeURIComponent;
  return {
    async access(uid) { return rpc('stumpire_access', { p_uid: uid }); },
    async mode() { const r = await req('GET', 'stumpire_settings?key=eq.mode&select=value'); return (r[0] && r[0].value) || 'off'; },
    async setMode(m) { await req('PATCH', 'stumpire_settings?key=eq.mode', { value: m }); },
    async slate(date) { const r = await req('GET', 'stumpire_slates?slate_date=eq.' + q(date) + '&select=*'); return r[0] || null; },
    async answers(date, atBat) { return req('GET', 'stumpire_prompt_answers?slate_date=eq.' + q(date) + '&at_bat=eq.' + atBat + '&select=*'); },
    async getPlay(date, who) {
      const f = who.uid ? 'user_id=eq.' + q(who.uid) : 'guest_id=eq.' + q(who.guestId);
      const r = await req('GET', 'stumpire_plays?slate_date=eq.' + q(date) + '&' + f + '&select=id,state,version');
      return r[0] || null;
    },
    async createPlay(date, who, state) {
      try {
        const r = await req('POST', 'stumpire_plays?select=id,state,version',
          { slate_date: date, user_id: who.uid || null, guest_id: who.uid ? null : who.guestId, state }, { Prefer: 'return=representation' });
        return r[0];
      } catch (e) { if (e.pg === '23505') return this.getPlay(date, who); throw e; }
    },
    async playById(id) { const r = await req('GET', 'stumpire_plays?id=eq.' + id + '&select=id,state,version'); return r[0] || null; },
    async savePlay(id, version, state, sm) {
      const base = { p_id: id, p_version: version, p_state: state, p_bases: sm.bases, p_outs: sm.outs, p_strikes: sm.strikes, p_over: sm.over, p_won: sm.won };
      /* The score columns come with 134. A database still on 133 has no _v2,
         and the save must not fail over a leaderboard column. */
      try { return await rpc('stumpire_save_play_v2', { ...base, p_score: sm.score || 0, p_runs: sm.runs || 0, p_hits: sm.hits || 0, p_hr: sm.hr || 0, p_ks: sm.k || 0 }); }
      catch (e) { if (e.status === 404 || e.pg === 'PGRST202' || e.pg === '42883') return rpc('stumpire_save_play', base); throw e; }
    },
    /* Every finished, signed in play for a day, best first. Testers only for
       now, so the whole day fits in one read. */
    async board(date) {
      let rows;
      try { rows = await req('GET', 'stumpire_plays?slate_date=eq.' + q(date) + '&over=eq.true&user_id=not.is.null&select=user_id,score,bases,outs,strikes,runs,hits,hr,ks,updated_at&order=score.desc,bases.desc,outs.asc,strikes.asc,updated_at.asc&limit=500'); }
      catch (e) { rows = await req('GET', 'stumpire_plays?slate_date=eq.' + q(date) + '&over=eq.true&user_id=not.is.null&select=user_id,bases,outs,strikes,updated_at&order=bases.desc,outs.asc,strikes.asc,updated_at.asc&limit=500'); }
      if (!rows.length) return [];
      const p = await req('GET', 'profiles?select=id,username&id=in.(' + [...new Set(rows.map(r => r.user_id))].join(',') + ')');
      const by = Object.fromEntries(p.map(x => [x.id, x.username]));
      return rows.map(r => ({ ...r, username: by[r.user_id] || null }));
    },
    async playedDates(uid) {
      const r = await req('GET', 'stumpire_plays?user_id=eq.' + q(uid) + '&over=eq.true&select=slate_date&order=slate_date.desc&limit=120');
      return r.map(x => x.slate_date);
    },
    async log(e) { await req('POST', 'stumpire_answer_log', e, { Prefer: 'return=minimal' }); },
    async lastLog(playId, atBat) {
      const r = await req('GET', 'stumpire_answer_log?play_id=eq.' + playId + '&at_bat=eq.' + atBat + '&order=id.desc&limit=1&select=raw,matched_id');
      return r[0] || null;
    },
    async review(e) { await req('POST', 'stumpire_review', e, { Prefer: 'return=minimal' }); },
    async reviewList() { return req('GET', 'stumpire_review?status=eq.open&order=id.desc&limit=200&select=*'); },
    async nopitchList() { return req('GET', 'stumpire_answer_log?status=eq.nopitch&order=id.desc&limit=100&select=created_at,prompt_id,raw'); },
    async crowd(promptId) { return rpc('stumpire_observed', { p_prompt_id: promptId }); },
    async observed(promptId) { const o = {}; for (const r of await this.crowd(promptId)) o[r.entity_id] = Number(r.n); return o; },
    async addChallenge(c) {
      try { const r = await req('POST', 'stumpire_challenges?select=id', c, { Prefer: 'return=representation' }); return r[0]; }
      catch (e) { if (e.pg === '23505') return null; throw e; }
    },
    async challenges() { return req('GET', 'stumpire_challenges?status=eq.open&order=id.asc&select=*'); },
    async challenge(id) { const r = await req('GET', 'stumpire_challenges?id=eq.' + id + '&select=*'); return r[0] || null; },
    async resolveChallenge(id, status, by, resolution) {
      await req('PATCH', 'stumpire_challenges?id=eq.' + id, { status, resolved_by: by, resolution, resolved_at: new Date().toISOString() });
    },
    /* 136. A database without it answers 404 here; the callers treat a
       throw as "nothing remembered" and carry on. */
    async ruling(promptId, entityId) {
      const r = await req('GET', 'stumpire_rulings?prompt_id=eq.' + q(promptId) + '&entity_id=eq.' + q(entityId) + '&select=verdict,source,qid,created_at,updated_at&limit=1');
      return r[0] || null;
    },
    async putRuling(row) {
      await req('POST', 'stumpire_rulings?on_conflict=prompt_id,entity_id', { ...row, updated_at: new Date().toISOString() },
        { Prefer: 'resolution=merge-duplicates,return=minimal' });
    },
    async rulings(promptId) {
      const r = await req('GET', 'stumpire_rulings?prompt_id=eq.' + q(promptId) + '&verdict=eq.upheld&select=entity_id&limit=500');
      return r.map(x => x.entity_id);
    },
    async acceptAnswer(date, atBat, promptId, entityId, name) {
      return rpc('stumpire_accept_answer', { p_date: date, p_at_bat: atBat, p_prompt_id: promptId, p_entity_id: entityId, p_name: name });
    },
    async claim(guestId, uid) { return rpc('stumpire_claim', { p_guest: guestId, p_uid: uid }); },
    async testers() {
      const t = await req('GET', 'stumpire_testers?select=user_id,role,note,added_at&order=added_at.asc');
      if (!t.length) return t;
      const p = await req('GET', 'profiles?select=id,username&id=in.(' + t.map(x => x.user_id).join(',') + ')');
      const by = Object.fromEntries(p.map(x => [x.id, x.username]));
      return t.map(x => ({ ...x, username: by[x.user_id] || null }));
    },
    async addTester(username, userId, role, note) {
      let uid = userId;
      if (!uid && username) { const p = await req('GET', 'profiles?select=id&username=eq.' + q(username)); uid = p[0] && p[0].id; }
      if (!uid) return null;
      await req('POST', 'stumpire_testers?on_conflict=user_id', { user_id: uid, role, note }, { Prefer: 'resolution=merge-duplicates,return=minimal' });
      return { user_id: uid, role };
    },
    async removeTester(uid) { await req('DELETE', 'stumpire_testers?user_id=eq.' + q(uid)); return true; },
    async prompts() {
      const r = await req('GET', 'stumpire_prompts?select=*&order=created_at.asc');
      return r.map(p => ({ id: p.id, text: p.text, league: p.league, type: p.type, wildcard: p.wildcard, arguable: p.arguable, status: p.status, ...p.query }));
    },
    async savePrompt(d) {
      const row = { id: d.id, text: d.text, league: d.league, type: d.type || 'athlete', wildcard: d.wildcard || null,
        arguable: d.arguable || [], query: { years: d.years, where: d.where || [], set: !!d.set }, updated_at: new Date().toISOString() };
      await req('POST', 'stumpire_prompts?on_conflict=id', row, { Prefer: 'resolution=merge-duplicates,return=minimal' });
    },
    async publish(date, no, defs, rows, by) {
      return rpc('stumpire_publish_slate', { p_date: date, p_no: no, p_prompt_ids: defs.map(d => d.id), p_text: defs.map(d => d.text),
        p_leagues: defs.map(d => d.league), p_types: defs.map(d => d.type || 'athlete'), p_rows: rows, p_by: by || null });
    }
  };
}
