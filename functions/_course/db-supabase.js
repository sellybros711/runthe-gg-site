/* Run The Course's database calls, over Supabase's REST API with the service
 * role. The three functions are supabase/187_course.sql, granted to the
 * service role only: no browser role can read or write a course. */
export function supabaseDb(env, fetchFn = fetch) {
  const base = env.SUPABASE_URL.replace(/\/+$/, '') + '/rest/v1/rpc/';
  const h = { apikey: env.SUPABASE_SERVICE_ROLE, Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE, 'Content-Type': 'application/json' };
  async function rpc(name, args) {
    const r = await fetchFn(base + name, { method: 'POST', headers: h, body: JSON.stringify(args) });
    if (!r.ok) throw new Error('db ' + r.status);
    return r.json();
  }
  return {
    open: (uid, seed, holes) => rpc('course_open', { p_user: uid, p_seed: seed, p_holes: holes }),
    file: (uid, f) => rpc('course_shift_file', { p_user: uid, p_shift_no: f.no, p_seed: f.seed, p_config_version: f.v, p_result: f.result,
      p_cash: f.cash, p_stars: f.stars, p_state: f.state, p_conditions: f.conditions, p_checksum: f.checksum, p_verified: f.verified }),
    events: (uid, device, rows) => rpc('course_events_add', { p_user: uid, p_device: device, p_rows: rows })
  };
}

/* The same interface over a map, for the tests and the dev server. It keeps
   the rules 187 keeps: one course an account, and a shift files once, in order. */
export function memoryDb() {
  const courses = new Map(), eventRows = [], shifts = [];
  const view = c => JSON.parse(JSON.stringify({ course: { id: c.id, name: c.name, logo: null, tier: c.tier, cash: c.cash, stars: c.stars,
    schema_version: 1, config_version: 1, seed: c.seed, shifts_filed: c.shifts_filed, state: c.state }, holes: c.holes }));
  return {
    courses, eventRows, shifts, writes: 0,
    async open(uid, seed, holes) {
      if (!uid) return null;
      if (!courses.has(uid)) {
        courses.set(uid, { id: 'c-' + uid, name: 'Your Course', tier: 'muni', cash: 0, stars: 2, seed, shifts_filed: 0, state: {},
          holes: holes.map(x => ({ ord: x.ord, par: x.par, template: x.template, open: !!x.open, design_version: 1, mastery: 0, design_points: 6, layout: {}, condition: x.condition || {} })) });
        this.writes++;
      }
      return view(courses.get(uid));
    },
    async file(uid, f) {
      const c = courses.get(uid);
      if (!c) return null;
      if (f.no !== c.shifts_filed + 1) return { filed: false, cash: c.cash, stars: c.stars, shifts_filed: c.shifts_filed };
      shifts.push({ uid, ...f }); this.writes++;
      c.cash = f.cash; c.stars = f.stars; c.shifts_filed = f.no; c.state = f.state || c.state;
      for (const x of f.conditions || []) { const hole = c.holes.find(v => v.ord === x.ord); if (hole) hole.condition = x.condition; }
      return { filed: true, cash: c.cash, stars: c.stars, shifts_filed: c.shifts_filed };
    },
    async events(uid, device, rows) { eventRows.push(...rows.map(r => ({ ...r, user_id: uid, device_id: device, game: 'course' }))); return rows.length; }
  };
}
