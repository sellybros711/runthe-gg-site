/* An in-memory Arcade Lab database for the tests and the dev server. It keeps
 * the same rules the SQL does: one daily per player per game per day, and one
 * gem award per run. */
export function memoryDb(opts = {}) {
  const roles = { ...(opts.roles || {}) };              // uid -> 'admin' | 'tester'
  const flags = { ...(opts.flags || {}) };              // flag -> mode
  const names = { ...(opts.names || {}) };
  const runs = [], ledger = [], rejections = [];
  const starts = new Map(), slates = [], prompts = new Map(), reports = [];
  let nextId = 1;
  const clock = opts.now || Date.now;
  const same = (r, who) => who.uid ? r.user_id === who.uid : r.guest_id === who.guestId;
  return {
    runs, ledger, rejections, slateRows: slates, promptRows: prompts, reportRows: reports,
    async start(who, game, date) { const k = who + '|' + game + '|' + date; starts.set(k, (starts.get(k) || 0) + 1); return starts.get(k); },
    async starts(who, game, date) { return starts.get(who + '|' + game + '|' + date) || 0; },
    async slate(game, date) { return slates.find(x => x.game_id === game && x.date_key === date) || null; },
    async lastSlate(game, before) { return slates.filter(x => x.game_id === game && x.date_key < before).sort((a, b) => b.date_key < a.date_key ? -1 : 1)[0] || null; },
    async slates(game) { return slates.filter(x => x.game_id === game).map(x => ({ ...x })); },
    async insertSlate(row) {
      if (slates.some(x => x.game_id === row.game_id && x.date_key === row.date_key)) return false;
      slates.push(Object.freeze({ ...row, payload: JSON.parse(JSON.stringify(row.payload)) })); return true;
    },
    async prompts(game) { return [...prompts.values()].filter(p => p.game_id === game); },
    async prompt(id) { return prompts.get(id) || null; },
    async upsertPrompt(row) { prompts.set(row.id, { ...row }); },
    async setPromptStatus(id, status, uid, report) { const p = prompts.get(id); if (p) Object.assign(p, { status, approved_by: uid, report }); },
    async report(row) {
      const same = r => (r.user_id || r.guest_id) === (row.user_id || row.guest_id) && r.game_id === row.game_id && r.date_key === row.date_key && r.athlete_id === row.athlete_id;
      if (reports.some(same)) return false; reports.push({ ...row, id: reports.length + 1, status: 'open', created_at: clock() }); return true;
    },
    async reports() { return reports.slice().reverse(); },
    async role(uid) { return roles[uid] || null; },
    async flags() { return { ...flags }; },
    async setFlag(f, m) { flags[f] = m; },
    async getRun(who, game, date) { return runs.find(r => same(r, who) && r.game_id === game && r.date_key === date && r.mode === 'daily') || null; },
    async insertRun(row) {
      if (runs.some(r => r.mode === 'daily' && r.game_id === row.game_id && r.date_key === row.date_key &&
        (row.user_id ? r.user_id === row.user_id : r.guest_id === row.guest_id))) return null;
      const r = { ...row, id: nextId++, created_at: clock() }; runs.push(r); return r.id;
    },
    async awardGems(row) {
      if (row.run_id != null && ledger.some(l => l.run_id === row.run_id)) return false;
      ledger.push({ ...row, id: ledger.length + 1 }); return true;
    },
    async gemTotal(who) { return ledger.filter(l => same(l, who)).reduce((a, l) => a + l.amount, 0); },
    async board(game, date, limit, tester) {
      return runs.filter(r => r.game_id === game && r.date_key === date && r.mode === 'daily' && r.user_id && !r.restarted && (tester || !r.tester))
        .sort((a, b) => b.score - a.score || a.id - b.id).slice(0, limit)
        .map(r => ({ user_id: r.user_id, username: names[r.user_id] || null, score: r.score }));
    },
    async countAbove(game, date, score, tester) {
      return runs.filter(r => r.game_id === game && r.date_key === date && r.mode === 'daily' && r.user_id && !r.restarted && (tester || !r.tester) && r.score > score).length;
    },
    async countAll(game, date, tester) {
      return runs.filter(r => r.game_id === game && r.date_key === date && r.mode === 'daily' && r.user_id && !r.restarted && (tester || !r.tester)).length;
    },
    async reject(row) { rejections.push({ ...row, created_at: clock() }); },
    async recentPosts(who, sinceMs) {
      return rejections.filter(r => (who.uid ? r.user_id === who.uid : r.guest_id === who.guestId) && r.created_at >= sinceMs).length
        + runs.filter(r => same(r, who) && r.created_at >= sinceMs).length;
    },
    async claim(guest, uid) {
      let moved = 0;
      for (const r of runs) if (r.guest_id === guest) {
        if (runs.some(x => x.user_id === uid && x.game_id === r.game_id && x.date_key === r.date_key && x.mode === r.mode)) continue;
        r.user_id = uid; r.guest_id = null; moved++;
      }
      for (const l of ledger) if (l.guest_id === guest) { l.user_id = uid; l.guest_id = null; }
      return moved;
    }
  };
}
