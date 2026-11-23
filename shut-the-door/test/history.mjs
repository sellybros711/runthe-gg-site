/* Shut The Door api.js: your history, a Pro perk (supabase/182_shut_the_door_history.sql), through the
 * page's calls, against a stand-in server with 182's rules. Each kept outing is played here on the real
 * engine and the real packs, on its own seed, and historyOpen must rebuild the same result from its calls
 * without writing today's daily or posting anything.
 *   node shut-the-door/test/history.mjs
 */
import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = join(HERE, '..', 'data');

let fails = 0;
function check(name, cond, detail) {
  if (cond) console.log('ok   ' + name);
  else { fails++; console.log('FAIL ' + name + (detail ? ': ' + detail : '')); }
}

/* the clock: noon Eastern */
const TODAY = '2026-11-20';
const RealDate = Date, FIX = RealDate.parse(TODAY + 'T17:00:00Z');
globalThis.Date = class extends RealDate {
  constructor(...a) { if (a.length) super(...a); else super(FIX); }
  static now() { return FIX; }
};
const mem = {};
globalThis.localStorage = { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: k => { delete mem[k]; } };

const C = require('../contract.js');
const E = require('../engine.js');
const G = require('../grade.js');
const M = require('../modes.js');
const sched = JSON.parse(readFileSync(join(DATA, 'schedule.json'), 'utf8'));
const load = async p => JSON.parse(readFileSync(join(DATA, p.replace(/^data\//, '').replace(/\?v=\d+$/, '')), 'utf8'));
const packs = {};
async function packOf(id) {
  if (!packs[id]) { const pack = await load('packs/' + id + '.json'); packs[id] = { pack, model: new G.Model(pack) }; }
  return packs[id];
}

/* one outing played to its end on the engine: the grade's best call at the cell it names, a strong
   player's outing, so a Survivor run gets past its first spot */
async function play(id, seed, mode) {
  const p = await packOf(id);
  const o = E.createOuting(p.pack, { seed, mode, model: p.model });
  let g = 0;
  while (o.status === 'live' && g++ < 150) {
    const b = E.bestCall(o);
    E.throwPitch(o, { type: b.type, cell: b.cell });
  }
  const r = E.finishOuting(o);
  return { calls: o.calls.map(c => Object.assign({}, c)), outcome: r.outcome, pitches: r.pitches, score: r.score, percentile: r.percentile == null ? 0 : Math.round(r.percentile) };
}

/* the stand-in server: 182's two reads over the rows 153 and 160 keep */
const S = { pro: false, up: true, user: null, outings: [], runs: [], asked: [] };
const auth = {
  state: () => ({ ready: true, waiting: false, signedIn: !!S.user, userId: S.user }),
  onChange: () => () => {},
  async submit() { S.asked.push('submit'); return null; },
  async survivorPost() { S.asked.push('survivorPost'); return null; },
  async archiveSubmit() { S.asked.push('archiveSubmit'); return null; },
  async entitlements() { return S.up ? { signedIn: !!S.user, pro: S.pro, archive: S.pro, survivorRuns: S.pro ? null : 1 } : null; },
  async history(before, days) {
    S.asked.push('history');
    if (!S.up) return null;
    if (!S.user) return null;
    if (!S.pro) return { pro: false, items: [], more: false, oldest: null };
    const mine = S.outings.filter(o => o.user === S.user && (!before || o.day < before));
    const runs = S.runs.filter(r => r.user === S.user && (!before || r.day < before));
    const all = [...new Set([...mine, ...runs].map(x => x.day))].sort().reverse();
    const kept = all.slice(0, Math.max(1, Math.min(60, days || 30)));
    const last = kept[kept.length - 1] || null;
    const items = [
      ...mine.filter(o => kept.includes(o.day)).map(o => ({ at: o.at, kind: 'daily', day: o.day, number: o.number, scenarioId: o.scenarioId, outcome: o.outcome, pitches: o.pitches, score: o.score, percentile: o.percentile })),
      ...runs.filter(r => kept.includes(r.day)).map(r => ({ at: r.at, kind: 'survivor', day: r.day, run: r.run, saves: r.saves, points: r.points, over: r.over,
        spots: r.entries.map((e, i) => ({ index: i, scenarioId: e.scenarioId, outcome: e.outcome, pitches: e.pitches, score: e.score })) })),
    ].sort((a, b) => (a.day === b.day ? b.at - a.at : a.day < b.day ? 1 : -1));
    return { pro: true, items, more: all.some(d => last && d < last), oldest: last };
  },
  async historyOuting(day, run, index) {
    if (!S.up || !S.user || !S.pro) return null;
    if (run == null) {
      const o = S.outings.find(x => x.user === S.user && x.day === day);
      return o ? { kind: 'daily', day, number: o.number, run: null, index: null, scenarioId: o.scenarioId, calls: o.calls, outcome: o.outcome, pitches: o.pitches, score: o.score, percentile: o.percentile } : null;
    }
    const r = S.runs.find(x => x.user === S.user && x.day === day && x.run === run);
    const e = r && r.entries[index];
    return e ? { kind: 'survivor', day, number: null, run, index, scenarioId: e.scenarioId, calls: e.calls, outcome: e.outcome, pitches: e.pitches, score: e.score, percentile: null } : null;
  },
};
globalThis.window = { STD_AUTH: auth };
const api = require('../api.js');
api.configure({ load });

/* the kept rows: two dailies on their days' seeds, one Survivor run on modes.js's spots, and a
   stranger's daily */
const D1 = '2026-11-12', D2 = '2026-11-17';
async function keepDaily(user, day, at) {
  const id = sched.rotation[(C.dayNumberOf(day) - 1) % sched.rotation.length];
  const r = await play(id, E.seedFor('daily', day), 'daily');
  S.outings.push(Object.assign({ user, day, number: C.dayNumberOf(day), scenarioId: id, at }, r));
}
await keepDaily('u1', D1, 1);
await keepDaily('u1', D2, 2);
await keepDaily('u2', D2, 3);
const run = { user: 'u1', day: D2, run: 0, entries: [], saves: 0, points: 0, over: false, at: 4 };
for (let i = 0; i < 4 && !run.over; i++) {
  const at = M.survivorAt(sched, D2, 0, i);
  const r = await play(at.pack, at.seed, 'survivor');
  run.entries.push({ scenarioId: at.pack, calls: r.calls, outcome: r.outcome, pitches: r.pitches, score: r.score });
  run.saves += r.outcome === 'door_shut' ? 1 : 0; run.points += r.score; run.over = r.outcome !== 'door_shut';
}
S.runs.push(run);
check('the stand-in run has at least one spot', run.entries.length >= 1);

/* 1. signed out: nothing is asked */
let h = await api.history();
check('signed out: no rows, not Pro, nothing asked', !h.signedIn && !h.pro && h.items.length === 0 && !S.asked.includes('history'));
let threw = null;
try { await api.historyOpen({ kind: 'daily', day: D1 }); } catch (e) { threw = e.message; }
check('signed out: an outing does not open', !!threw);

/* 2. signed in, not Pro: the locked answer */
S.user = 'u1';
h = await api.history();
check('not Pro: no rows', h.signedIn && !h.pro && h.items.length === 0 && !h.offline);
threw = null;
try { await api.historyOpen({ kind: 'daily', day: D1 }); } catch (e) { threw = e.message; }
check('not Pro: an outing does not open', !!threw);

/* 3. Pro */
S.pro = true;
h = await api.history();
check('Pro: the dailies and the run, nothing of the stranger\'s', h.pro && h.items.length === 3, JSON.stringify(h.items.map(x => x.kind + x.day)));
check('Pro: newest first', h.items[0].kind === 'survivor' && h.items[0].day === D2 && h.items[1].kind === 'daily' && h.items[1].day === D2 && h.items[2].day === D1);
const d2 = h.items[1];
check('Pro: a daily carries its card from the schedule', d2.card && d2.card.pitcher === sched.packs[d2.scenarioId].card.pitcher && d2.card.situation);
check('Pro: a run carries its spots with their cards', h.items[0].spots.length === run.entries.length && h.items[0].spots.every(s => s.card && s.card.title));

const before = JSON.stringify(mem);
const o1 = await api.historyOpen({ kind: 'daily', day: D1 });
const k1 = S.outings[0];
check('a daily opens to the result the server kept', o1.result.outcome === k1.outcome && o1.result.score === k1.score && o1.result.pitches === k1.pitches);
check('its state is over, with every call', o1.state.status === 'over' && o1.state.pitchNo === k1.pitches);
check('its scenario has no reveal, and its own day and number', !o1.scenario.reveal && o1.scenario.day === D1 && o1.scenario.number === k1.number);
const again = await api.finishOuting(o1.state.outingId);
check('finishOuting on it answers the same result', again.score === k1.score && again.outcome === k1.outcome);
check('its pitches play as clips', !!api.clipSpec(o1.state.outingId, 1) && !!api.clipSpec(o1.state.outingId, k1.calls.length));
threw = null;
try { await api.throwPitch(o1.state.outingId, k1.calls[0]); } catch (e) { threw = e.message; }
check('it takes no new pitch', !!threw);
check('nothing written on the device', JSON.stringify(mem) === before);
check('nothing posted', !S.asked.some(a => a !== 'history'));

for (const s of h.items[0].spots) {
  const os = await api.historyOpen({ kind: 'survivor', day: D2, run: 0, index: s.index });
  const e = run.entries[s.index];
  check('Survivor spot ' + s.index + ' opens to its kept result', os.result.outcome === e.outcome && os.result.score === e.score && os.scenario.survivor.index === s.index && os.scenario.number === null);
}
check('still nothing written or posted', JSON.stringify(mem) === before && !S.asked.some(a => a !== 'history'));

/* a doctored row, a spot out of its place, a day not kept */
S.outings[0].score += 1;
threw = null;
try { await api.historyOpen({ kind: 'daily', day: D1 }); } catch (e) { threw = e.message; }
check('a kept score the calls do not make does not open', /does not replay/.test(threw || ''), threw);
S.outings[0].score -= 1;
const real = run.entries[0].scenarioId;
run.entries[0].scenarioId = sched.rotation.find(id => id !== real);
threw = null;
try { await api.historyOpen({ kind: 'survivor', day: D2, run: 0, index: 0 }); } catch (e) { threw = e.message; }
check('a Survivor spot that is not the run\'s does not open', !!threw);
run.entries[0].scenarioId = real;
threw = null;
try { await api.historyOpen({ kind: 'daily', day: '2026-11-13' }); } catch (e) { threw = e.message; }
check('a day not kept does not open', !!threw);

/* the pages */
const page = await (async () => { const r = await auth.history(null, 1); return r; })();
check('the stand-in pages like 182 (one day, more remain)', page.more && page.oldest === D2);
h = await api.history(D2);
check('the next page is the older day', h.items.length === 1 && h.items[0].day === D1 && !h.more);

/* the server down */
S.up = false;
h = await api.history();
check('no answer: offline, no rows', h.offline && h.items.length === 0);

console.log(fails ? fails + ' failed' : 'all history checks passed');
process.exit(fails ? 1 : 0);
