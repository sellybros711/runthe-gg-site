/* Last Shot's one database question, over Supabase's REST API with the
 * service role: is this user on the tester list? stumpire_testers is revoked
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
    }
  };
}

/* The same interface over a map, for the tests and the dev server. */
export function memoryDb(roles = {}) {
  return { async role(uid) { return roles[uid] || null; } };
}
