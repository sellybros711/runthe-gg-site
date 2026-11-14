/* Last Shot's database calls, over Supabase's REST API with the service
 * role: is this user on the tester list, store the tester round's events,
 * and read its report. stumpire_testers is revoked
 * from browser roles (supabase/133_stumpire.sql), so only a Function asks. */
export function supabaseDb(env) {
  const base = env.SUPABASE_URL.replace(/\/+$/, '') + '/rest/v1/';
  const h = { apikey: env.SUPABASE_SERVICE_ROLE, Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE };
  return {
    async role(uid) {
      const r = await fetch(base + 'stumpire_testers?user_id=eq.' + encodeURIComponent(uid) + '&select=role', { headers: h });
      if (!r.ok) throw new Error('db ' + r.status);
      const rows = await r.json();
      return (rows[0] && rows[0].role) || null;
    },
    /* The tester round's events (supabase/170). Fire and forget. */
    async insertEvents(rows) {
      const r = await fetch(base + 'game_events', { method: 'POST', headers: { ...h, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify(rows) });
      if (!r.ok) throw new Error('db ' + r.status);
    },
    async report(game, since, until, excludeAdmins) {
      const r = await fetch(base + 'rpc/game_round_report', { method: 'POST', headers: { ...h, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_game: game, p_since: since, p_until: until, p_exclude_admins: excludeAdmins }) });
      if (!r.ok) throw new Error('db ' + r.status);
      return r.json();
    }
  };
}

/* The same interface over a map, for the tests and the dev server. */
export function memoryDb(roles = {}, report = null) {
  const events = [];
  return {
    events,
    async role(uid) { return roles[uid] || null; },
    async insertEvents(rows) { events.push(...rows); },
    async report(game, since, until, excludeAdmins) { return report ? report(game, since, until, excludeAdmins) : null; }
  };
}
