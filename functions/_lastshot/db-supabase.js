/* Last Shot's database calls, over Supabase's REST API with the service
 * role: is this user on the tester list, store the tester round's events,
 * and read its report. stumpire_testers is revoked
 * from browser roles (supabase/133_stumpire.sql), so only a Function asks. */
/* The tester list, remembered for ROLE_MS per worker isolate (2026-11-16): a
   page load asks for the page and some 30 modules, and each asked the
   database. A removed tester keeps access for at most ROLE_MS. */
export const ROLE_MS = 60000;
const roles = new Map();
export function forgetRoles() { roles.clear(); }

export function supabaseDb(env) {
  const base = env.SUPABASE_URL.replace(/\/+$/, '') + '/rest/v1/';
  const h = { apikey: env.SUPABASE_SERVICE_ROLE, Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE };
  return {
    async role(uid) {
      const hit = roles.get(uid), now = Date.now();
      if (hit && now - hit.at < ROLE_MS) return hit.role;
      const r = await fetch(base + 'stumpire_testers?user_id=eq.' + encodeURIComponent(uid) + '&select=role', { headers: h });
      if (!r.ok) throw new Error('db ' + r.status);
      const rows = await r.json();
      const role = (rows[0] && rows[0].role) || null;
      if (roles.size > 2000) roles.clear();
      roles.set(uid, { role, at: now });
      return role;
    },
    /* The tester round's events: supabase/175's last_shot_events_add (an
       account, a device or both; capped; trims old rows). Until 175 has run,
       an account's rows go straight into 170's table as before, so a tester
       is never dropped by the order the SQL runs in. */
    async insertEvents(uid, device, rows) {
      const r = await fetch(base + 'rpc/last_shot_events_add', { method: 'POST', headers: { ...h, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_user: uid, p_device: device, p_rows: rows }) });
      if (r.ok) return;
      if (r.status !== 404 || !uid) throw new Error('db ' + r.status);
      const old = await fetch(base + 'game_events', { method: 'POST', headers: { ...h, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify(rows.map(x => ({ ...x, user_id: uid, game: 'last-shot' }))) });
      if (!old.ok) throw new Error('db ' + old.status);
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
    async insertEvents(uid, device, rows) { events.push(...rows.map(r => ({ ...r, user_id: uid, device_id: device, game: 'last-shot' }))); },
    async report(game, since, until, excludeAdmins) { return report ? report(game, since, until, excludeAdmins) : null; }
  };
}
