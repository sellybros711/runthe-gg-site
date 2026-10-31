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

  const API_VERSION = 1;
  const SCHEDULE_V = 15;
  /* Rules 8 (the closer's outing to the end of the game, engine.js 11) starts with a whole day's
     daily, never partway through one: a daily of a day before this is played as rules 7 (the
     first half alone), so everybody on one day's board plays one game. Set it to the day after
     the deploy if the deploy lands on a day whose pack has more than one half. */
  const FULL_CLOSE_FROM = '2026-10-31';
  const STORE_V = 1;
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
    const e = entryFor(sch, d);
    const p = await loadPack(e.pack);
    const sc = clone(p.pack.scenario);
    delete sc.reveal;
    sc.day = d;
    sc.number = e.number;
    sc.preview = !!e.preview;
    current[sc.id] = { day: d, number: e.number };
    return sc;
  }

  async function startOuting(scenarioId, seed, opts) {
    const mode = opts && opts.mode === 'practice' ? 'practice' : 'daily';
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
    const rules = resume && resume.calls.length ? E.rulesOf(resume.calls) : cur.day < FULL_CLOSE_FROM ? G.STEAL_RULES : undefined;
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
    if (!rec.result) {
      const res = E.finishOuting(o);
      res.share = SH().text(res, rec.number != null ? rec.number : o.pack.scenario.number);
      rec.result = res;
      save(rec);
    }
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
      const e = entryFor(sch, saved.day);
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

  const api = { API_VERSION, getScenario, startOuting, throwPitch, challenge, pickoff, finishOuting, pending, claim, configure };
  // a sign-in posts the day's finished daily by itself (the board and the result read it after)
  try {
    const A = AUTH();
    let was = !!signedInUser();
    if (A && A.onChange) A.onChange((st) => {
      const now = !!(st && st.signedIn);
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
