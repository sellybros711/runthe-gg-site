/* Who may see the world: a row in stumpire_testers (tester or admin), the one tester list every
 * gated game shares. Read with the service role, which never leaves the Function. Not
 * stumpire_access(): that follows Stumpire's own mode, and taking Stumpire public must never open
 * this. */
export function supabaseDb(env){
  return {
    async role(uid){
      const r = await fetch(env.SUPABASE_URL + '/rest/v1/stumpire_testers?user_id=eq.' + encodeURIComponent(uid) + '&select=role',
        { headers: { apikey: env.SUPABASE_SERVICE_ROLE, Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE } });
      if (!r.ok) throw new Error('supabase ' + r.status);
      const rows = await r.json(); return (rows[0] && rows[0].role) || null;
    }
  };
}
export const isTester = role => role === 'tester' || role === 'admin';
