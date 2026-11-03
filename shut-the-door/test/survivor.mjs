/* Shut The Door api.js: the vote, Survivor, the archive and the Pro gate (CONTRACT.md 16 and 17),
 * through the page's calls, against a stand-in server with the rules of
 * supabase/160_shut_the_door_vote_survivor.sql, on a clock set inside the vote's days.
 *   node shut-the-door/test/survivor.mjs
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

/* the clock: noon Eastern on a day inside the vote */
const TODAY = '2026-11-20';
const RealDate = Date, FIX = RealDate.parse(TODAY + 'T17:00:00Z');
globalThis.Date = class extends RealDate {
  constructor(...a) { if (a.length) super(...a); else super(FIX); }
  static now() { return FIX; }
};

const mem = {};
globalThis.localStorage = { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: k => { delete mem[k]; } };
const wipe = () => { for (const k of Object.keys(mem)) delete mem[k]; };

const C = require('../contract.js');
const E = require('../engine.js');
const M = require('../modes.js');
const sched = JSON.parse(readFileSync(join(DATA, 'schedule.json'), 'utf8'));
const load = async p => JSON.parse(readFileSync(join(DATA, p.replace(/^data\//, '').replace(/\?v=\d+$/, '')), 'utf8'));
check('the clock is set inside the vote', C.easternDay() === TODAY && TODAY >= M.VOTE.EPOCH);

/* the stand-in server: 160's rules, in memory */
const S = { votes: {}, locks: {}, outings: {}, runs: {}, archive: {}, pro: false, up: true, user: null };
const tomorrow = M.addDays(TODAY, 1);
const listeners = [];
const auth = {
  state: () => ({ ready: true, waiting: false, signedIn: !!S.user, userId: S.user }),
  onChange: f => { listeners.push(f); return () => {}; },
  async submit(row) {
    if (!S.up) return null;
    const k = S.user + '|' + row.day;
    if (row.day >= M.VOTE.EPOCH && row.scenarioId !== lock(row.day)) return null;     // refused: not the day's
    const taken = !S.outings[k];
    if (taken) S.outings[k] = JSON.parse(JSON.stringify(row));
    return { taken, streak: 1, best: 1, rank: 1, players: 1, keptScore: S.outings[k].score };
  },
  async myDay(d) { return S.up && S.user ? S.outings[S.user + '|' + d] || null : null; },
  async vote(d) {
    if (!S.up) return null;
    const c = M.candidates(sched, d);
    if (!c) return { day: d, open: false, candidates: null, canVote: false, why: 'no vote for that day' };
    const mine = S.user ? (S.votes[d] || {})[S.user] || null : null;
    const w = d <= TODAY ? lock(d) : null;
    const tally = () => { const v = Object.values(S.votes[d] || {}); return { a: v.filter(x => x === c[0]).length, b: v.filter(x => x === c[1]).length }; };
    let why = null, can = false;
    if (d !== tomorrow) why = 'voting is closed';
    else if (!S.user) why = 'sign in to vote';
    else if (mine) why = 'you voted';
    else if (!S.outings[S.user + '|' + TODAY]) why = 'finish today\'s daily to vote';
    else can = true;
    return { day: d, open: d === tomorrow, candidates: c, myVote: mine, votes: w || mine ? tally() : null, winner: w, canVote: can, why };
  },
  async voteCast(d, pack) {
    if (!S.up) return null;
    const v = await auth.vote(d);
    if (!v.canVote && !v.myVote) return { error: v.why };
    if (!v.candidates.includes(pack)) return { error: 'not a candidate' };
    S.votes[d] = S.votes[d] || {};
    if (!S.votes[d][S.user]) S.votes[d][S.user] = pack;
    return { data: await auth.vote(d) };
  },
  async entitlements() { return S.up ? { signedIn: !!S.user, pro: S.pro, archive: S.pro, survivorRuns: S.pro ? null : 1 } : null; },
  async survivorState(d) {
    if (!S.up || !S.user) return null;
    const runs = (S.runs[S.user + '|' + d] || []);
    return { day: d, pro: S.pro, runs: JSON.parse(JSON.stringify(runs)), canStart: !runs.some(r => !r.over) && (S.pro || !runs.length) };
  },
  async survivorStart(d) {
    if (!S.up) return null;
    const k = S.user + '|' + d, runs = S.runs[k] = S.runs[k] || [];
    if (!runs.some(r => !r.over)) {
      if (runs.length && !S.pro) return { error: 'one run a day' };
      runs.push({ run: runs.length, saves: 0, points: 0, over: false, entries: [] });
    }
    return { data: await auth.survivorState(d) };
  },
  async survivorPost(row) {
    if (!S.up) return null;
    const r = (S.runs[S.user + '|' + row.day] || []).find(x => x.run === row.run);
    if (!r) return { error: 'no such run' };
    if (row.index < r.entries.length) return { data: await auth.survivorState(row.day) };
    if (r.over || row.index !== r.entries.length) return { error: 'out of order' };
    r.entries.push({ scenarioId: row.scenarioId, calls: row.calls, outcome: row.outcome, pitches: row.pitches, score: row.score });
    r.saves += row.outcome === 'door_shut' ? 1 : 0; r.points += row.score; r.over = row.outcome !== 'door_shut';
    return { data: await auth.survivorState(row.day) };
  },
  async survivorBoard() { return []; },
  async archiveSubmit(row) {
    if (!S.up) return null;
    if (!S.pro) return { error: 'the archive is for Pro' };
    const k = S.user + '|' + row.day, taken = !S.archive[k];
    if (taken) S.archive[k] = row;
    return { data: { taken } };
  },
};
function lock(d) {
  if (S.locks[d]) return S.locks[d];
  const c = M.candidates(sched, d), v = Object.values(S.votes[d] || {});
  const a = v.filter(x => x === c[0]).length, b = v.filter(x => x === c[1]).length;
  return (S.locks[d] = b > a ? c[1] : c[0]);
}
globalThis.window = { STD_AUTH: auth };
const signIn = u => { S.user = u; listeners.slice().forEach(f => f(auth.state())); };

function freshApi() {
  for (const k of Object.keys(require.cache)) if (k.endsWith('api.js')) delete require.cache[k];
  const api = require('../api.js');
  api.configure({ load });
  return api;
}
async function playBest(api, st) {
  let s = st, g = 0;
  while (s.status === 'live' && g++ < 150) {
    s = (await api.throwPitch(s.outingId, Object.assign({ cell: 12, type: null }, await bestOf(s)))).state;
  }
  return s;
}
/* the grade's best call in a live state, from the pack (what a strong player throws) */
const packCache = {};
async function bestOf(st) {
  const id = st.scenarioId;
  if (!packCache[id]) {
    const pack = await load('packs/' + id + '.json');
    packCache[id] = { pack };
  }
  const P = packCache[id];
  const o = E.replay(P.pack, st.seed, st.log.map(p => p.call), { mode: 'practice' });
  return E.bestCall(o);
}

/* ---- the day's situation with the vote ---- */
S.locks[TODAY] = M.candidates(sched, TODAY)[1];     // the vote went to B today
{
  S.up = false;
  let api = freshApi();
  const off = await api.getScenario(TODAY);
  check('the server cannot be reached: the day is candidate A, the default, and says so',
    off.id === M.candidates(sched, TODAY)[0] && off.pick === 'default');
  S.up = true;
  api = freshApi();
  const on = await api.getScenario(TODAY);
  check('the server locked B: the day is B, from the vote', on.id === M.candidates(sched, TODAY)[1] && on.pick === 'vote');
  S.up = false;
  api = freshApi();
  const kept = await api.getScenario(TODAY);
  check('once known, the lock is kept on the device: offline later it is still B', kept.id === on.id && kept.pick === 'vote');
  S.up = true;
  const before = await api.getScenario('2026-10-30');
  check('a day before the vote is the schedule\'s own (daily #5)', before.id === sched.days['2026-10-30'].pack && !before.pick);
}

/* ---- the vote for tomorrow ---- */
{
  wipe();
  let api = freshApi();
  let v = await api.vote();
  check('the vote is for tomorrow, two cards from the schedule, a guest cannot vote',
    v.day === tomorrow && v.open && v.candidates.length === 2 && v.candidates[0].id === M.candidates(sched, tomorrow)[0]
    && !!v.candidates[0].title && v.canVote === false && v.why === 'sign in to vote');
  signIn('v1');
  v = await api.vote();
  check('signed in, before today\'s daily: no vote yet, and why', v.canVote === false && v.why === 'finish today\'s daily to vote' && v.votes === null);
  let cast = await api.castVote(v.candidates[1].id);
  check('a cast before the daily is refused with the server\'s words', cast.error === 'finish today\'s daily to vote' && !cast.myVote);
  // play today's daily (B) to the end
  const sc = await api.getScenario(TODAY);
  const st = await playBest(api, await api.startOuting(sc.id, null, { mode: 'daily' }));
  const res = await api.finishOuting(st.outingId);
  check('today\'s daily is the vote\'s B, and it posts', sc.id === S.locks[TODAY] && res.account && res.account.taken === true);
  v = await api.vote();
  check('after the daily, the vote is open to this player', v.canVote === true);
  cast = await api.castVote(v.candidates[1].id);
  check('the vote is cast: my vote B, the tally shows once you voted', !cast.error && cast.myVote === v.candidates[1].id && cast.votes && cast.votes.b === 1);
  const again = await api.castVote(v.candidates[0].id);
  check('one vote a player: the first stands', again.myVote === v.candidates[1].id && again.votes.a === 0);
  S.up = false;
  const off = await api.vote();
  check('offline: the same two candidates, no vote possible', off.offline && off.candidates[1].id === v.candidates[1].id && off.canVote === false);
  S.up = true;
}

/* ---- Survivor ---- */
{
  wipe();
  S.user = null;
  let api = freshApi();
  let st = await api.survivorState();
  check('Survivor, signed out: a run can start, nothing played', st.canStart && st.index === 0 && st.saves === 0 && st.signedIn === false);
  let s = await api.survivorStart();
  const at0 = M.survivorAt(sched, TODAY, 0, 0);
  check('the first situation is the day\'s run 0, index 0, on its own seed', s.run === 0 && s.index === 0 && s.scenario.id === at0.pack && s.state.seed === at0.seed && !('reveal' in s.scenario));
  // a pitch, then a reload: the situation resumes where it stood
  const one = await api.throwPitch(s.state.outingId, Object.assign({ cell: 12 }, await bestOf(s.state)));
  api = freshApi();
  const back = await api.survivorStart();
  check('a reload resumes the situation where it stood', back.index === 0 && back.state.pitchNo === 1 && JSON.stringify(back.state.log) === JSON.stringify(one.state.log));
  // play the run out
  let cur = back, results = [], g = 0;
  while (g++ < 12) {
    const end = await playBest(api, cur.state);
    const r = await api.finishOuting(end.outingId);
    results.push(r);
    check(`situation ${cur.index}: ${cur.scenario.id} ends ${r.outcome}, the run stands at ${r.survivor.saves}`,
      r.survivor.index === cur.index && r.survivor.saves === results.filter(x => x.outcome === 'door_shut').length && r.survivor.over === (r.outcome !== 'door_shut'));
    if (r.survivor.over) break;
    cur = await api.survivorStart();
    const at = M.survivorAt(sched, TODAY, 0, cur.index);
    if (!(cur.scenario.id === at.pack && cur.state.seed === at.seed)) { check('the next situation is the run\'s next', false); break; }
  }
  // the best call every pitch can hold a long time; end the run with a blown save by hand: heart
  // fastballs, situation after situation, until one is blown (a heart fastball can still hold one)
  for (let k = 0; k < 10 && !(results.length && results[results.length - 1].survivor.over); k++) {
    let x = await api.survivorStart(), y = x.state, h = 0;
    while (y.status === 'live' && h++ < 150) y = (await api.throwPitch(y.outingId, { type: x.scenario.pitcher.arsenal[0].type, cell: 12 })).state;
    const r = await api.finishOuting(y.outingId);
    results.push(r);
  }
  const last = results[results.length - 1];
  check('a blown lead ends the run (a held tie counts as blown, as in the daily)', last.outcome !== 'door_shut' && last.survivor.over);
  let threw = null;
  try { await api.survivorStart(); } catch (e) { threw = e.message; }
  check('signed out: one run a day on this device', threw === 'one run a day');
  st = await api.survivorState();
  check('the state says the run is over, with its saves', st.over && st.saves === results.filter(x => x.outcome === 'door_shut').length && st.canStart === false);

  // signing in puts the run on the account, once
  signIn('s1');
  for (let i = 0; i < 40 && !(S.runs['s1|' + TODAY] || []).length; i++) await new Promise(r => setTimeout(r, 5));
  for (let i = 0; i < 40 && (S.runs['s1|' + TODAY] || [{ entries: [] }])[0].entries.length < results.length; i++) await new Promise(r => setTimeout(r, 5));
  const srun = (S.runs['s1|' + TODAY] || [])[0];
  check('a sign-in puts the run played signed out on the account, every situation in order',
    srun && srun.run === 0 && srun.entries.length === results.length && srun.over && srun.saves === st.saves);
  const claim2 = await api.survivorClaim();
  check('and only once', claim2.posted === false && S.runs['s1|' + TODAY].length === 1);

  // another device, same account: the run shows from the server, and no second run for free
  wipe();
  api = freshApi();
  const st2 = await api.survivorState();
  check('another device reads the run from the account', st2.saves === st.saves && st2.over && st2.entries.length === results.length && st2.canStart === false);
  threw = null;
  try { await api.survivorStart(); } catch (e) { threw = e.message; }
  check('free: one run a day, on every device', threw === 'one run a day');

  // Pro (the gate switched on by a stand-in): a new run, its own sequence
  S.pro = true;
  const p1 = await api.survivorStart();
  const at1 = M.survivorAt(sched, TODAY, 1, 0);
  check('Pro: a second run once the first is over, run 1 on its own sequence', p1.run === 1 && p1.index === 0 && p1.scenario.id === at1.pack && p1.state.seed === at1.seed);
  S.pro = false;
}

/* ---- the archive ---- */
{
  wipe();
  S.user = 'a1';
  let api = freshApi();
  const ent = await api.entitlements();
  check('Pro answers false: no archive, one run a day', ent.pro === false && ent.archive === false && ent.survivorRuns === 1);
  const past = '2026-11-02';
  const sc = await api.getScenario(past);
  let threw = null;
  try { await api.startOuting(sc.id, null, { mode: 'archive', day: past }); } catch (e) { threw = e.message; }
  check('the archive is for Pro', threw === 'the archive is for Pro');
  S.pro = true;
  const st = await api.startOuting(sc.id, null, { mode: 'archive', day: past });
  check('Pro: a past daily plays on that day\'s own seed', st.mode === 'archive' && st.seed === E.seedFor('daily', past));
  const end = await playBest(api, st);
  const before = Object.keys(S.outings).length;
  const r = await api.finishOuting(end.outingId);
  check('it is kept, and never posted to the daily board', r.archive && r.archive.kept && Object.keys(S.outings).length === before && !r.account);
  threw = null;
  try { await api.startOuting(sc.id, null, { mode: 'archive', day: TODAY }); } catch (e) { threw = e.message; }
  check('today is not the archive', threw === 'not an archive day');
  S.pro = false;
}

console.log(fails ? `${fails} FAILED` : 'all ok');
process.exit(fails ? 1 : 0);
