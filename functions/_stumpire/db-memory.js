/* An in-memory Stumpire database with the same interface as db-supabase.js.
 * For tests and the local dev server only. It enforces the rules the SQL
 * enforces that the API leans on: one play a day each, a version check on
 * every save, one challenge per at-bat, and a frozen slate. */
export function memoryDb(opts = {}) {
  const S = {
    mode: opts.mode || 'testers', testers: new Map(Object.entries(opts.testers || {})),
    users: new Map(Object.entries(opts.users || {})),   // username -> uid
    prompts: new Map(), slates: new Map(), answers: [], plays: [], log: [], review: [], challenges: [], seq: 1
  };
  const clone = x => JSON.parse(JSON.stringify(x));
  return {
    _state: S,
    async access(uid) {
      const role = S.testers.get(uid);
      if (role === 'admin') return 'admin';
      if (S.mode === 'off') return null;
      if (role) return 'tester';
      return S.mode === 'public' ? 'player' : null;
    },
    async mode() { return S.mode; },
    async setMode(m) { S.mode = m; },
    async slate(date) { return S.slates.get(date) || null; },
    async answers(date, atBat) { return S.answers.filter(r => r.slate_date === date && r.at_bat === atBat); },
    async getPlay(date, who) {
      const p = S.plays.find(p => p.slate_date === date && (who.uid ? p.user_id === who.uid : p.guest_id === who.guestId));
      return p ? clone(p) : null;
    },
    async createPlay(date, who, state) {
      const ex = await this.getPlay(date, who);
      if (ex) return ex;
      const p = { id: S.seq++, slate_date: date, user_id: who.uid || null, guest_id: who.uid ? null : who.guestId, state, version: 1 };
      S.plays.push(p); return clone(p);
    },
    async playById(id) { const p = S.plays.find(p => p.id === id); return p ? clone(p) : null; },
    async savePlay(id, version, state, sm) {
      const p = S.plays.find(p => p.id === id);
      if (!p || p.version !== version) return null;
      p.state = clone(state); p.version++; Object.assign(p, { bases: sm.bases, outs: sm.outs, strikes: sm.strikes, over: sm.over, won: sm.won });
      return p.version;
    },
    async log(e) { S.log.push({ id: S.seq++, ...e }); },
    async lastLog(playId, atBat) { return [...S.log].reverse().find(l => l.play_id === playId && l.at_bat === atBat) || null; },
    async review(e) { S.review.push({ id: S.seq++, status: 'open', ...e }); },
    async reviewList() { return S.review.filter(r => r.status === 'open'); },
    async nopitchList() { return S.log.filter(l => l.status === 'nopitch').slice(-100).reverse(); },
    async crowd(promptId) {
      const c = {};
      for (const l of S.log) if (l.prompt_id === promptId && l.matched_id && (l.ruling === 'SAFE' || l.ruling === 'OUT')) c[l.matched_id] = (c[l.matched_id] || 0) + 1;
      return Object.entries(c).map(([entity_id, n]) => ({ entity_id, n }));
    },
    async observed(promptId) { const o = {}; for (const r of await this.crowd(promptId)) o[r.entity_id] = r.n; return o; },
    async addChallenge(c) {
      if (S.challenges.some(x => x.play_id === c.play_id && x.at_bat === c.at_bat)) return null;
      const row = { id: S.seq++, status: 'open', ...c }; S.challenges.push(row); return row;
    },
    async challenges() { return S.challenges.filter(c => c.status === 'open'); },
    async challenge(id) { return S.challenges.find(c => c.id === id) || null; },
    async resolveChallenge(id, status, by, resolution) { Object.assign(S.challenges.find(c => c.id === id), { status, resolved_by: by, resolution }); },
    async acceptAnswer(date, atBat, promptId, entityId, name) {
      if (S.answers.some(r => r.slate_date === date && r.at_bat === atBat && r.entity_id === entityId)) return false;
      S.answers.push({ slate_date: date, at_bat: atBat, prompt_id: promptId, entity_id: entityId, name, tier: 1, called: false, arguable: true, expected_share: 0 });
      return true;
    },
    async claim(guestId, uid) {
      let n = 0;
      for (const p of S.plays) if (p.guest_id === guestId && !p.user_id && !S.plays.some(u => u.user_id === uid && u.slate_date === p.slate_date)) { p.user_id = uid; p.guest_id = null; n++; }
      return n;
    },
    async testers() { return [...S.testers.entries()].map(([user_id, role]) => ({ user_id, role, username: [...S.users.entries()].find(([, id]) => id === user_id)?.[0] || null })); },
    async addTester(username, userId, role) {
      const uid = userId || S.users.get(username);
      if (!uid) return null;
      S.testers.set(uid, role); return { user_id: uid, role };
    },
    async removeTester(uid) { return S.testers.delete(uid); },
    async prompts() { return [...S.prompts.values()].map(clone); },
    async savePrompt(d) { S.prompts.set(d.id, clone(d)); },
    async publish(date, no, defs, rows) {
      if (S.slates.has(date)) throw new Error('stumpire: a slate is already published for ' + date);
      S.slates.set(date, { slate_date: date, slate_no: no, prompt_ids: defs.map(d => d.id), prompt_text: defs.map(d => d.text),
        leagues: defs.map(d => d.league), types: defs.map(d => d.type || 'athlete'), frozen: true });
      for (const r of rows) S.answers.push({ slate_date: date, ...r });
    }
  };
}
