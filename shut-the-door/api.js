/* Shut The Door: the four calls the UI makes (CONTRACT.md section 9).
 * window.STD_API, after contract.js, rng.js, grade.js, engine.js, share.js and
 * auth.js. Node: require('./api.js') with configure({ load }).
 *
 *   getScenario(day)                       the day's scenario, without the reveal
 *   startOuting(scenarioId, seed, {mode})  daily: the day's seed, and the stored
 *                                          outing replayed if there is one
 *   throwPitch(outingId, call)             one pitch, graded before it resolves. call is
 *                                          {type, cell} plus q, the release, when timed,
 *                                          and at, the free aim's point in the cell
 *   finishOuting(outingId)                 the result; daily and signed in, submitted once
 *   pending()                              today's finished daily not yet on the board, or null
 *   claim()                                signed in: post that daily now, once (also run on sign-in)
 *
 * All of it runs in the browser from the day's pack (data/schedule.json, then
 * data/packs/<id>.json), as every daily on the site does. The engine is pure;
 * this file holds the outings, the storage and the account calls.
 *
 * THE DAILY (CONTRACT.md sections 9 and 14, B1)
 *   The seed is hashSeed('shut-the-door-' + day): the same for everyone, so the
 *   same calls meet the same luck. The outing is kept in localStorage
 *   (OUTING_KEY) as {v, day, scenarioId, calls, result, submitted} after every
 *   pitch, and a reload replays the calls. Opening the page writes nothing:
 *   startOuting never writes at pitch 0. finishOuting on an outing that is over
 *   returns the same result every time and submits at most once (a guest who
 *   signs in later is submitted on the next call; the server keeps the first).
 *
 * TWO DEVICES (159_shut_the_door_boards.sql). Signed in, startOuting asks the
 *   server for the day's kept outing (STD_AUTH.myDay). If there is one, it is
 *   the day's outing on every device: its calls replay to the same result under
 *   the day's seed, and nothing is posted again. A post that loses a race says
 *   so: result.account.taken is false and keptScore is the one that counts.
 *
 * SIGNED OUT, THEN SIGNED IN. pending() says a finished daily is waiting to be
 *   posted (the UI's "sign in to save your score"). claim() posts it once, the
 *   same Eastern day only, and runs by itself when STD_AUTH says you signed in.
 *
 * PRACTICE ("run it back"): any seed, never stored, never submitted.
 *
 * DATA VERSIONS. The schedule is fetched with SCHEDULE_V and each pack with the
 * `v` the schedule gives it, so a rebuilt pack is a new URL. A change to a pack
 * bumps its `v` in schedule.json, and a change to schedule.json bumps
 * SCHEDULE_V here (CLAUDE.md: the edit, the bump and the record, in one commit).
 */
(function () {
  'use strict';
  const NODE = typeof module !== 'undefined' && module.exports;
  const C = NODE ? require('./contract.js') : window.STD_CONTRACT;
  const R = NODE ? require('./rng.js') : window.STD_RNG;
  const G = NODE ? require('./grade.js') : window.STD_GRADE;
  const E = NODE ? require('./engine.js') : window.STD_ENGINE;
  const SH = () => (NODE ? require('./share.js') : window.STD_SHARE);
  const AUTH = () => (typeof window !== 'undefined' ? window.STD_AUTH : null);
  const M = NODE ? require('./modes.js') : window.STD_MODES;

  const API_VERSION = 1;
  const SCHEDULE_V = 13;
  const STORE_V = 1;
  const PICKS_KEY = 'std_picks_v1';         // vote days the server has locked: {day: pack}
  const SURVIVOR_KEY = 'std_survivor_v1';   // today's run on this device
  const ARCHIVE_KEY = 'std_archive_v1';     // past dailies played from the archive: {day: {scenarioId, calls, result}}
  const SERVER_WAIT_MS = 4000;              // the page never waits longer than this on the account
  const BASE = 'data/';

  let loader = (path) => fetch(path).then((r) => {
    if (!r.ok) throw new Error('could not load ' + path);
    return r.json();
  });
  let schedule = null;
  const packs = {};       // id -> {pack, model}
  const current = {};     // scenarioId -> {day, number}
  const outings = {};     // outingId -> {o, day, number, result, submitted}
  let practiceN = 0;

  function configure(opts) { if (opts && opts.load) loader = opts.load; }

  const clone = (x) => JSON.parse(JSON.stringify(x));

  function store() {
    try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch (e) { return null; }
  }
  function readSaved() {
    const s = store();
    if (!s) return null;
    try { const v = JSON.parse(s.getItem(C.OUTING_KEY) || 'null'); return v && v.v === STORE_V ? v : null; } catch (e) { return null; }
  }
  function writeSaved(v) {
    const s = store();
    if (!s) return;
    try { s.setItem(C.OUTING_KEY, JSON.stringify(Object.assign({ v: STORE_V }, v))); } catch (e) {}
  }

  function readKey(k) {
    const st = store();
    if (!st) return null;
    try { const v = JSON.parse(st.getItem(k) || 'null'); return v && v.v === STORE_V ? v : null; } catch (e) { return null; }
  }
  function writeKey(k, v) {
    const st = store();
    if (!st) return;
    try { st.setItem(k, JSON.stringify(Object.assign({ v: STORE_V }, v))); } catch (e) {}
  }
  /* A server call with a deadline: its answer, or null (no account module, no answer, a failure). */
  async function ask(name) {
    const A = AUTH();
    if (!A || typeof A[name] !== 'function') return null;
    const args = Array.prototype.slice.call(arguments, 1);
    try {
      return await Promise.race([Promise.resolve(A[name].apply(A, args)), new Promise(r => setTimeout(() => r(null), SERVER_WAIT_MS))]);
    } catch (e) { return null; }
  }

  async function loadSchedule() {
    if (!schedule) schedule = await loader(BASE + 'schedule.json?v=' + SCHEDULE_V);
    return schedule;
  }

  /* The day's entry: the schedule's own, or the rotation past its end. */
  function entryFor(sch, day) {
    if (sch.days && sch.days[day]) return sch.days[day];
    // the rotation runs from the epoch, and backwards before it: the days before launch show the
    // scenarios before #1 in turn, so a new game each day now. number stays 1 there for the server
    // the previews walk the rotation they were served from (schedule.json previewRotation, the
    // first ten), so a longer rotation never moves a day already played
    const offset = C.dayOffsetOf(day);
    const rot = offset < 0 && sch.previewRotation ? sch.previewRotation : sch.rotation, L = rot.length;
    const number = C.dayNumberOf(day);
    return { pack: rot[((offset % L) + L) % L], number, preview: offset < 0 };
  }

  /* The day's entry with the vote: from VOTE.EPOCH on, the pack the server locked for the day
     (kept on the device once known), else the default, candidate A (modes.js). A day not begun
     yet has no lock, so it reads as its default. */
  async function dayEntry(sch, day) {
    if (!M.voteOpen(day)) return entryFor(sch, day);
    const number = C.dayNumberOf(day);
    const picks = (readKey(PICKS_KEY) || {}).days || {};
    if (picks[day]) return { pack: picks[day], number, preview: false, pick: 'vote' };
    if (day <= C.easternDay()) {
      const v = await ask('vote', day);
      if (v && v.winner && sch.packs[v.winner]) {
        const keep = Object.assign({}, picks, { [day]: v.winner });
        const recent = Object.keys(keep).sort().slice(-40);
        writeKey(PICKS_KEY, { days: Object.fromEntries(recent.map(d => [d, keep[d]])) });
        return { pack: v.winner, number, preview: false, pick: 'vote' };
      }
    }
    return { pack: M.defaultPack(sch, day), number, preview: false, pick: 'default' };
  }

  async function loadPack(id) {
    if (packs[id]) return packs[id];
    const sch = await loadSchedule();
    const meta = sch.packs[id];
    if (!meta) throw new Error('no such scenario: ' + id);
    const pack = await loader(BASE + meta.file + '?v=' + meta.v);
    if (pack.v !== E.PACK_VERSION) throw new Error('pack format ' + pack.v + ', engine reads ' + E.PACK_VERSION);
    packs[id] = { pack, model: new G.Model(pack) };
    return packs[id];
  }

  async function getScenario(day) {
    const d = day || C.easternDay();
    const sch = await loadSchedule();
    const e = await dayEntry(sch, d);
    const p = await loadPack(e.pack);
    const sc = clone(p.pack.scenario);
    delete sc.reveal;
    sc.day = d;
    sc.number = e.number;
    sc.preview = !!e.preview;
    // from the vote's first day: 'vote' when the server locked it, 'default' when it could not say
    if (e.pick) sc.pick = e.pick;
    current[sc.id] = { day: d, number: e.number };
    return sc;
  }

  async function startOuting(scenarioId, seed, opts) {
    const mode = opts && ['practice', 'archive'].includes(opts.mode) ? opts.mode : 'daily';
    if (mode === 'archive') return startArchive(scenarioId, opts && opts.day);
    const p = await loadPack(scenarioId);
    if (mode === 'practice') {
      const s = seed == null ? R.practiceSeed(Date.now() + ':' + practiceN) : (seed >>> 0);
      const id = 'practice:' + s + ':' + (++practiceN);
      const o = E.createOuting(p.pack, { seed: s, mode, model: p.model, outingId: id });
      // one practice outing at a time: the page only ever plays the newest, and each kept one held
      // its whole log and every pitch's context (about 200 KB) for the life of the page
      for (const k of Object.keys(outings)) if (k.startsWith('practice:')) delete outings[k];
      outings[id] = { o, day: null, number: null };
      return clone(E.publicState(o));
    }
    const cur = current[scenarioId] || { day: C.easternDay(), number: C.dayNumberOf(C.easternDay()) };
    const id = 'daily:' + cur.day + ':' + scenarioId;
    if (outings[id]) return clone(E.publicState(outings[id].o));
    const s = E.seedFor('daily', cur.day);
    const saved = readSaved();
    const resume = saved && saved.day === cur.day && saved.scenarioId === scenarioId && Array.isArray(saved.calls) ? saved : null;
    // an outing begun before rules 2 shipped (its calls carry no r) finishes under the rules it began with
    const rules = resume && resume.calls.length ? E.rulesOf(resume.calls) : undefined;
    const o = E.createOuting(p.pack, { seed: s, mode, model: p.model, outingId: id, rules });
    const rec = { o, day: cur.day, number: cur.number, result: null, submitted: false };
    if (resume) {
      for (const c of resume.calls) { if (o.status !== 'live') break; E.throwPitch(o, c); }
      rec.result = resume.result || null;
      rec.submitted = !!resume.submitted;
      rec.by = resume.by || null;
    }
    outings[id] = rec;
    // signed in: the day may already be kept on the account from another device. That outing is
    // the day's, here too: replay its calls (the same seed, so the same result), never post again
    const kept = await keptDay(cur.day);
    if (kept && kept.scenarioId === scenarioId && Array.isArray(kept.calls) && kept.calls.length
        && JSON.stringify(kept.calls) !== JSON.stringify(rec.o.calls)) {
      const k = E.createOuting(p.pack, { seed: s, mode, model: p.model, outingId: id, rules: E.rulesOf(kept.calls) });
      for (const c of kept.calls) { if (k.status !== 'live') break; E.throwPitch(k, c); }
      rec.o = k; rec.result = null; rec.submitted = true; rec.by = signedInUser(); rec.fromAccount = true;
      save(rec);
    } else if (kept && JSON.stringify(kept.calls) === JSON.stringify(rec.o.calls)) {
      rec.submitted = true;
    }
    const out = clone(E.publicState(rec.o));
    if (rec.fromAccount) out.fromAccount = true;     // the UI may say "played on another device"
    return out;                                      // nothing written at pitch 0
  }

  function signedInUser() {
    const A = AUTH();
    let st = null;
    try { st = A && A.state && A.state(); } catch (e) { st = null; }
    return st && st.signedIn ? (st.userId || 'signed-in') : null;
  }

  /* The caller's kept outing for a day, or null: signed out, no row, or no answer within
     KEPT_WAIT_MS (the page never waits long on the account to show the day). */
  const KEPT_WAIT_MS = 4000;
  async function keptDay(day) {
    const A = AUTH();
    if (!signedInUser() || !A || !A.myDay) return null;
    try {
      return await Promise.race([Promise.resolve(A.myDay(day)), new Promise(r => setTimeout(() => r(null), KEPT_WAIT_MS))]) || null;
    } catch (e) { return null; }
  }

  function save(rec) {
    if (rec.o.mode === 'survivor') return saveSurvivorLive(rec);
    if (rec.o.mode === 'archive') return saveArchive(rec);
    if (rec.o.mode !== 'daily') return;
    writeSaved({ day: rec.day, scenarioId: rec.o.pack.scenario.id, calls: rec.o.calls, result: rec.result, submitted: rec.submitted, by: rec.by || null });
  }

  async function throwPitch(outingId, call) {
    const rec = outings[outingId];
    if (!rec) throw new Error('no such outing');
    // at, the free aim's point in the cell (catcher's view [u, v]), rides along for the engine to keep or refuse
    const c = Object.assign({ type: call && call.type, cell: call && call.cell }, call && call.at != null ? { at: call.at } : null);
    if (call && call.q != null) c.q = call.q;     // the release (contract.js RELEASE); absent is 1.0x
    if (call && call.e != null) c.e = call.e;     // the effort (contract.js EFFORT); absent is his ordinary pitch
    if (call && call.at != null) c.at = call.at;  // the free aim point (contract.js aimAt); absent is the cell's centre
    if (call && call.ss === 1) c.ss = 1;          // rules 7: a quick delivery (CONTRACT.md 5i)
    const r = E.throwPitch(rec.o, c);
    save(rec);
    return clone(r);
  }

  /* rules 4: the pitcher's side challenges the last pitch's called ball (contract.js ABS). Only
     right away: before the next throw and before the result. Returns the pitch as it now stands
     and the state (state.abs: challenges left, whether one is live, the events). */
  async function challenge(outingId) {
    const rec = outings[outingId];
    if (!rec) throw new Error('no such outing');
    if (rec.result) throw new Error('the outing is finished');
    const r = E.challengePitch(rec.o);
    save(rec);
    return clone(r);
  }

  /* rules 7: a pickoff throw to the lead runner's base, between pitches (CONTRACT.md 5i). Returns
     the throw ({base, out, balk, margin, ...}) and the state (state.run: who is on, whether a
     pickoff is live, the disengagements left). Kept on the last call as pa, so a reload replays it. */
  async function pickoff(outingId) {
    const rec = outings[outingId];
    if (!rec) throw new Error('no such outing');
    if (rec.result) throw new Error('the outing is finished');
    const r = E.pickoff(rec.o);
    save(rec);
    return clone(r);
  }

  async function finishOuting(outingId) {
    const rec = outings[outingId];
    if (!rec) throw new Error('no such outing');
    const o = rec.o;
    if (o.status !== 'over') throw new Error('the outing is not over');
    if (o.mode === 'survivor') return finishSurvivor(rec);
    if (!rec.result) {
      const res = E.finishOuting(o);
      res.share = SH().text(res, rec.number != null ? rec.number : o.pack.scenario.number);
      rec.result = res;
      save(rec);
    }
    if (o.mode === 'archive') return finishArchive(rec);
    if (o.mode === 'daily' && !rec.submitted) {
      if (!rec.posting) rec.posting = post(rec).finally(() => { rec.posting = null; });
      await rec.posting;
    }
    return clone(rec.result);
  }

  /* One post of a finished daily, signed in. The server keeps the first post for (user, day). */
  async function post(rec) {
    const o = rec.o, A = AUTH();
    let st = null;
    try { st = A && A.state && A.state(); } catch (e) { st = null; }
    if (!(st && st.signedIn && A.submit)) return;
    const r = rec.result;
    const acct = await A.submit({
      day: rec.day, number: rec.number, scenarioId: o.pack.scenario.id, calls: o.calls, outcome: r.outcome,
      pitches: r.pitches, score: r.score, percentile: r.percentile == null ? 0 : r.percentile,
      pitchedLike: r.pitchedLike && r.pitchedLike.name, strip: r.strip,
    });
    if (!acct) return;                 // could not ask: the next call tries again
    rec.submitted = true;
    rec.by = st.userId || 'signed-in';
    // taken false: this account already has the day from another device, and that one counts
    rec.result.account = { streak: acct.streak, best: acct.best, rank: acct.rank == null ? null : acct.rank, players: acct.players,
      taken: acct.taken !== false, keptScore: acct.keptScore == null ? null : acct.keptScore };
    save(rec);
  }

  /* Today's finished daily that is not on the board yet: {day, number, scenarioId, score, outcome,
     pitches} or null. For the UI's prompt to sign in and save the score. Only today's (Eastern),
     the owner's rule: same day, not already posted. */
  function pending() {
    const saved = readSaved();
    if (!saved || saved.submitted || !saved.result || saved.day !== C.easternDay()) return null;
    const r = saved.result;
    return { day: saved.day, number: C.dayNumberOf(saved.day), scenarioId: saved.scenarioId, score: r.score, outcome: r.outcome, pitches: r.pitches };
  }

  /* Signed in: post today's finished daily once. Answers {posted, account} ({posted: false} when
     there is nothing to post or the server did not answer; posted true with account.taken false
     when the day was already kept from another device), or null signed out. Runs by itself when
     STD_AUTH reports a sign-in, and is safe to call again. */
  async function claim() {
    if (!signedInUser()) return null;
    if (!pending()) return { posted: false };
    const saved = readSaved();
    try {
      const sch = await loadSchedule();
      const e = await dayEntry(sch, saved.day);
      if (e.pack !== saved.scenarioId) return { posted: false };
      if (!current[saved.scenarioId]) current[saved.scenarioId] = { day: saved.day, number: e.number };
      const id = 'daily:' + saved.day + ':' + saved.scenarioId;
      if (!outings[id]) await startOuting(saved.scenarioId, null, { mode: 'daily' });
      const rec = outings[id];
      if (!rec || rec.o.status !== 'over') return { posted: false };
      const res = await finishOuting(id);
      return { posted: !!(rec.submitted && res.account), account: res.account || null };
    } catch (e) { return { posted: false }; }
  }

  /* ---------------- what this player may play (160) ---------------- */

  /* {signedIn, pro, archive, survivorRuns}: survivorRuns null is unlimited. Pro answers false for
     everyone until payments exist (shutdoor_is_pro). Signed out or offline: the free allowance. */
  async function entitlements() {
    const e = signedInUser() ? await ask('entitlements') : null;
    if (e && typeof e === 'object') return { signedIn: !!e.signedIn, pro: !!e.pro, archive: !!e.archive, survivorRuns: e.survivorRuns == null ? null : e.survivorRuns };
    return { signedIn: !!signedInUser(), pro: false, archive: false, survivorRuns: 1 };
  }

  /* ---------------- the vote for tomorrow (CONTRACT.md section 16) ---------------- */

  /* A pack's card, for the two choices: {id, title, pitcher, team, year, throws, situation, resolution}
     from the schedule (build_schedule.mjs), so the vote never downloads a pack. */
  function cardOf(sch, id) {
    const m = sch.packs[id];
    return Object.assign({ id }, (m && m.card) || {});
  }
  function voteShape(sch, d, srv, err) {
    const local = M.voteOpen(d) ? M.candidates(sch, d) : null;
    const ids = (srv && Array.isArray(srv.candidates) && srv.candidates) || local;
    const tomorrow = M.addDays(C.easternDay(), 1);
    const out = {
      day: d,
      open: srv ? !!srv.open : !!(local && d === tomorrow),
      candidates: ids ? ids.map(id => cardOf(sch, id)) : [],
      myVote: srv ? srv.myVote || null : null,
      votes: srv && srv.votes ? { a: srv.votes.a, b: srv.votes.b } : null,
      winner: srv ? srv.winner || null : null,
      canVote: srv ? !!srv.canVote : false,
      why: srv ? srv.why || null : (ids ? 'could not reach the server' : 'no vote for that day'),
      offline: !srv,
    };
    if (err) out.error = err;
    return out;
  }
  /* The vote for a day (default tomorrow): {day, open, candidates [card A, card B], myVote,
     votes {a, b} | null, winner, canVote, why, offline}. votes show once you voted or the day
     is locked. Offline the candidates still come (modes.js), and canVote is false. */
  async function vote(day) {
    const sch = await loadSchedule();
    const d = day || M.addDays(C.easternDay(), 1);
    return voteShape(sch, d, await ask('vote', d));
  }
  /* Cast this player's one vote for tomorrow. Signed in, after finishing today's daily. Answers
     the vote as vote() does, with error set (the server's words) when it was refused. */
  async function castVote(scenarioId) {
    const sch = await loadSchedule();
    const d = M.addDays(C.easternDay(), 1);
    if (!signedInUser()) return voteShape(sch, d, await ask('vote', d), 'sign in to vote');
    const r = await ask('voteCast', d, scenarioId);
    if (r && r.data) return voteShape(sch, d, r.data);
    return voteShape(sch, d, await ask('vote', d), (r && r.error) || 'could not reach the server');
  }

  /* ---------------- the archive (Pro): any past daily, kept, never on the board ---------------- */

  async function startArchive(scenarioId, day) {
    const today = C.easternDay();
    if (!day || day >= today || day < C.EPOCH) throw new Error('not an archive day');
    const ent = await entitlements();
    if (!ent.archive) throw new Error('the archive is for Pro');
    const sch = await loadSchedule();
    const e = await dayEntry(sch, day);
    if (e.pack !== scenarioId) throw new Error('that is not the day\'s situation');
    const p = await loadPack(scenarioId);
    const id = 'archive:' + day + ':' + scenarioId;
    if (outings[id]) return clone(E.publicState(outings[id].o));
    const seed = E.seedFor('daily', day);     // the day's own luck, as it was
    const kept = ((readKey(ARCHIVE_KEY) || {}).days || {})[day];
    const resume = kept && kept.scenarioId === scenarioId && Array.isArray(kept.calls) ? kept : null;
    const o = E.createOuting(p.pack, { seed, mode: 'archive', model: p.model, outingId: id, rules: resume && resume.calls.length ? E.rulesOf(resume.calls) : undefined });
    if (resume) for (const c of resume.calls) { if (o.status !== 'live') break; E.throwPitch(o, c); }
    outings[id] = { o, day, number: e.number, result: resume ? resume.result || null : null, submitted: !!(resume && resume.submitted) };
    return clone(E.publicState(o));
  }
  function saveArchive(rec) {
    const all = (readKey(ARCHIVE_KEY) || {}).days || {};
    all[rec.day] = { scenarioId: rec.o.pack.scenario.id, calls: rec.o.calls, result: rec.result, submitted: !!rec.submitted };
    const keep = Object.keys(all).sort().slice(-60);
    writeKey(ARCHIVE_KEY, { days: Object.fromEntries(keep.map(d => [d, all[d]])) });
  }
  async function finishArchive(rec) {
    if (!rec.submitted && signedInUser()) {
      const r = rec.result;
      const a = await ask('archiveSubmit', { day: rec.day, scenarioId: rec.o.pack.scenario.id, calls: rec.o.calls, outcome: r.outcome,
        pitches: r.pitches, score: r.score, percentile: r.percentile == null ? 0 : r.percentile });
      if (a && a.data) { rec.submitted = true; rec.result.archive = { kept: true, taken: !!a.data.taken }; save(rec); }
    }
    return clone(rec.result);
  }

  /* ---------------- Survivor: a run of saves (CONTRACT.md section 17) ---------------- */

  /* The device's run: {day, run, entries [{scenarioId, calls, outcome, pitches, score}], live
     {index, calls} | null, posted (entries the server holds)}. */
  function readRun() {
    const r = readKey(SURVIVOR_KEY);
    return r && r.day === C.easternDay() ? r : null;
  }
  function writeRun(r) { writeKey(SURVIVOR_KEY, r); }
  function runSummary(run) {
    const saves = run.entries.filter(e => e.outcome === M.SURVIVOR.CONTINUES).length;
    const over = run.entries.some(e => e.outcome !== M.SURVIVOR.CONTINUES);
    return { run: run.run, index: run.entries.length, saves, points: run.entries.reduce((a, e) => a + e.score, 0), over };
  }
  /* The server's live (or last) run for today, as the device's shape. */
  function fromServer(st, day) {
    if (!st || !Array.isArray(st.runs) || !st.runs.length) return null;
    const r = st.runs.find(x => !x.over) || st.runs[st.runs.length - 1];
    return { day, run: r.run, entries: (r.entries || []).map(e => ({ scenarioId: e.scenarioId, calls: e.calls, outcome: e.outcome, pitches: e.pitches, score: e.score })),
      live: null, posted: (r.entries || []).length, server: true };
  }

  /* Today's Survivor: {day, signedIn, pro, run, index, saves, points, over, canStart, entries,
     runs (the server's, signed in), offline}. entries are the finished situations of the run
     shown: {scenarioId, title, outcome, pitches, score}. */
  async function survivorState() {
    const day = C.easternDay();
    const sch = await loadSchedule();
    const ent = await entitlements();
    const srv = ent.signedIn ? await ask('survivorState', day) : null;
    let run = readRun();
    const sr = fromServer(srv, day);
    if (sr && !(run && run.run === sr.run && run.entries.length >= sr.entries.length)) run = Object.assign(sr, { live: null });
    const sum = run ? runSummary(run) : { run: null, index: 0, saves: 0, points: 0, over: false };
    const canStart = srv ? !!srv.canStart || !!(run && !sum.over)
      : !run || !sum.over;     // signed out: one run a day on this device
    return Object.assign(sum, {
      day, signedIn: ent.signedIn, pro: ent.pro, canStart,
      entries: run ? run.entries.map(e => ({ scenarioId: e.scenarioId, title: cardOf(sch, e.scenarioId).title || null, outcome: e.outcome, pitches: e.pitches, score: e.score })) : [],
      runs: srv && Array.isArray(srv.runs) ? srv.runs.map(r => ({ run: r.run, saves: r.saves, points: r.points, over: r.over })) : [],
      offline: ent.signedIn && !srv,
    });
  }

  /* Start today's run, or go on with it: the next situation of the live run (resumed where it
     stood after a reload or on another device). Pro may start a new run once the last is over.
     Answers {run, index, saves, scenario (no reveal), state}. Throws 'one run a day' when the
     allowance is used. */
  async function survivorStart() {
    const day = C.easternDay();
    const sch = await loadSchedule();
    let run = readRun();
    if (signedInUser()) {
      const r = await ask('survivorStart', day);
      if (r && r.error) throw new Error(r.error);
      const sr = r && r.data ? fromServer(r.data, day) : null;
      if (sr) {
        // the server's live run wins, unless this device is further along the same run
        const sameRun = run && run.run === sr.run && run.entries.length >= sr.entries.length;
        run = sameRun ? Object.assign(run, { posted: Math.max(run.posted || 0, sr.posted) }) : sr;
      }
    }
    // a run that is over stays over: signed out, or when the server could not be asked
    if (run && runSummary(run).over) throw new Error('one run a day');
    if (!run) run = { day, run: 0, entries: [], live: null, posted: 0 };
    writeRun(run);
    return openSituation(sch, run);
  }

  async function openSituation(sch, run) {
    const i = run.entries.length;
    const at = M.survivorAt(sch, run.day, run.run, i);
    const p = await loadPack(at.pack);
    const id = 'survivor:' + run.day + ':' + run.run + ':' + i;
    let rec = outings[id];
    if (!rec) {
      const live = run.live && run.live.index === i && Array.isArray(run.live.calls) ? run.live.calls : null;
      const o = E.createOuting(p.pack, { seed: at.seed, mode: 'survivor', model: p.model, outingId: id, rules: live && live.length ? E.rulesOf(live) : undefined });
      if (live) for (const c of live) { if (o.status !== 'live') break; E.throwPitch(o, c); }
      for (const k of Object.keys(outings)) if (k.startsWith('survivor:') && k !== id) delete outings[k];
      rec = outings[id] = { o, day: run.day, number: null, result: null, submitted: false, survivor: { run: run.run, index: i } };
    }
    const sc = clone(p.pack.scenario);
    delete sc.reveal;
    sc.day = run.day;
    sc.number = null;
    sc.survivor = { run: run.run, index: i };
    return { run: run.run, index: i, saves: runSummary(run).saves, scenario: sc, state: clone(E.publicState(rec.o)) };
  }

  function saveSurvivorLive(rec) {
    const run = readRun();
    if (!run || run.run !== rec.survivor.run || run.entries.length !== rec.survivor.index) return;
    run.live = { index: rec.survivor.index, calls: rec.o.calls };
    writeRun(run);
  }

  /* A finished situation: the result as the daily's (no share line), plus survivor {run, index,
     saves, over, posted}. A door shut goes on (survivorStart opens the next); anything else ends
     the run. Posted to the server signed in, in order. */
  async function finishSurvivor(rec) {
    if (!rec.result) {
      const res = E.finishOuting(rec.o);
      rec.result = res;
      const run = readRun() || { day: rec.day, run: rec.survivor.run, entries: [], live: null, posted: 0 };
      if (run.run === rec.survivor.run && run.entries.length === rec.survivor.index) {
        run.entries.push({ scenarioId: rec.o.pack.scenario.id, calls: rec.o.calls, outcome: res.outcome, pitches: res.pitches, score: res.score });
        run.live = null;
        writeRun(run);
      }
    }
    const run = readRun();
    const posted = await postRun(run);
    const sum = run ? runSummary(run) : { saves: 0, over: true };
    rec.result.survivor = { run: rec.survivor.run, index: rec.survivor.index, saves: sum.saves, over: sum.over, posted };
    return clone(rec.result);
  }

  /* Every finished situation of the device's run the server does not hold yet, in order. True
     when the server holds them all (signed in), false otherwise. */
  async function postRun(run) {
    if (!run || !signedInUser()) return false;
    while ((run.posted || 0) < run.entries.length) {
      const i = run.posted || 0, e = run.entries[i];
      const r = await ask('survivorPost', { day: run.day, run: run.run, index: i, scenarioId: e.scenarioId, calls: e.calls, outcome: e.outcome, pitches: e.pitches, score: e.score });
      if (!r || r.error || !r.data) return false;
      run.posted = i + 1;
      writeRun(run);
    }
    return true;
  }

  /* Signed in: put today's run played signed out on the account, once, when the account has no
     run today (the owner's rule: same day, not already kept). {posted} or null signed out. */
  async function survivorClaim() {
    if (!signedInUser()) return null;
    const run = readRun();
    if (!run || run.server || !run.entries.length || (run.posted || 0) >= run.entries.length) return { posted: false };
    const st = await ask('survivorState', run.day);
    if (!st || (Array.isArray(st.runs) && st.runs.length)) return { posted: false };
    const r = await ask('survivorStart', run.day);
    if (!r || !r.data) return { posted: false };
    run.run = 0; run.posted = 0; run.server = true;
    writeRun(run);
    return { posted: await postRun(run) };
  }

  /* The day's Survivor board: rows {rank, username, saves, points, over, mine, players}, run 0 of
     each player. null on failure. */
  async function survivorBoard(day, limit) {
    const r = await ask('survivorBoard', day || C.easternDay(), limit);
    return Array.isArray(r) ? r : null;
  }

  const api = { API_VERSION, getScenario, startOuting, throwPitch, challenge, pickoff, finishOuting, pending, claim,
    vote, castVote, entitlements, survivorState, survivorStart, survivorClaim, survivorBoard, configure };
  // a sign-in posts the day's finished daily by itself (the board and the result read it after)
  try {
    const A = AUTH();
    let was = !!signedInUser();
    if (A && A.onChange) A.onChange((st) => {
      const now = !!(st && st.signedIn);
      if (now && !was) survivorClaim().catch(() => null);
      if (now && !was) claim().then((r) => {
        if (r && r.posted && typeof window !== 'undefined' && window.dispatchEvent && typeof CustomEvent === 'function') {
          window.dispatchEvent(new CustomEvent('std-claimed', { detail: r }));
        }
      });
      was = now;
    });
  } catch (e) {}
  if (NODE) module.exports = api;
  if (typeof window !== 'undefined') window.STD_API = api;
})();
