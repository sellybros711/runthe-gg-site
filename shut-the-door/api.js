/* Shut The Door: the four calls the UI makes (CONTRACT.md section 9).
 * window.STD_API, after contract.js, rng.js, grade.js, engine.js, share.js and
 * auth.js. Node: require('./api.js') with configure({ load }).
 *
 *   getScenario(day)                       the day's scenario, without the reveal
 *   startOuting(scenarioId, seed, {mode})  daily: the day's seed, and the stored
 *                                          outing replayed if there is one
 *   throwPitch(outingId, call)             one pitch, graded before it resolves
 *   finishOuting(outingId)                 the result; daily and signed in, submitted once
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
  const SCHEDULE_V = 1;
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
    const number = C.dayNumberOf(day);
    return { pack: sch.rotation[(number - 1) % sch.rotation.length], number };
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
      outings[id] = { o, day: null, number: null };
      return clone(E.publicState(o));
    }
    const cur = current[scenarioId] || { day: C.easternDay(), number: C.dayNumberOf(C.easternDay()) };
    const id = 'daily:' + cur.day + ':' + scenarioId;
    if (outings[id]) return clone(E.publicState(outings[id].o));
    const s = E.seedFor('daily', cur.day);
    const o = E.createOuting(p.pack, { seed: s, mode, model: p.model, outingId: id });
    const rec = { o, day: cur.day, number: cur.number, result: null, submitted: false };
    const saved = readSaved();
    if (saved && saved.day === cur.day && saved.scenarioId === scenarioId && Array.isArray(saved.calls)) {
      for (const c of saved.calls) { if (o.status !== 'live') break; E.throwPitch(o, c); }
      rec.result = saved.result || null;
      rec.submitted = !!saved.submitted;
    }
    outings[id] = rec;
    return clone(E.publicState(o));     // nothing written at pitch 0
  }

  function save(rec) {
    if (rec.o.mode !== 'daily') return;
    writeSaved({ day: rec.day, scenarioId: rec.o.pack.scenario.id, calls: rec.o.calls, result: rec.result, submitted: rec.submitted });
  }

  async function throwPitch(outingId, call) {
    const rec = outings[outingId];
    if (!rec) throw new Error('no such outing');
    const r = E.throwPitch(rec.o, { type: call && call.type, cell: call && call.cell });
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
      const A = AUTH();
      let st = null;
      try { st = A && A.state && A.state(); } catch (e) { st = null; }
      if (st && st.signedIn && A.submit) {
        const r = rec.result;
        const acct = await A.submit({
          day: rec.day, number: rec.number, scenarioId: o.pack.scenario.id, calls: o.calls, outcome: r.outcome,
          pitches: r.pitches, score: r.score, percentile: r.percentile == null ? 0 : r.percentile,
          pitchedLike: r.pitchedLike && r.pitchedLike.name, strip: r.strip,
        });
        if (acct) {
          rec.submitted = true;
          rec.result.account = { streak: acct.streak, best: acct.best, rank: acct.rank == null ? null : acct.rank, players: acct.players };
          save(rec);
        }
      }
    }
    return clone(rec.result);
  }

  const api = { API_VERSION, getScenario, startOuting, throwPitch, finishOuting, configure };
  if (NODE) module.exports = api;
  if (typeof window !== 'undefined') window.STD_API = api;
})();
