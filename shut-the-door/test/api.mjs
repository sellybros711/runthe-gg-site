/* Shut The Door api.js: the four calls and the daily's promises (CONTRACT.md
 * section 9, and B1 in section 14).
 *   node shut-the-door/test/api.mjs [--data dir]     (default: shut-the-door/data)
 *
 * With a stand-in localStorage and a stand-in STD_AUTH:
 *   getScenario has no reveal and carries the schedule's day and number
 *   opening the page (startOuting at pitch 0) writes nothing
 *   a pitch is stored, and a reload replays the stored calls to the same state
 *   finishOuting returns the same result every time, submits once when signed
 *   in, and submits a guest's result once after they sign in
 *   practice is never stored or submitted
 */
import { createRequire } from 'module';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const DATA = args.includes('--data') ? args[args.indexOf('--data') + 1] : join(HERE, '..', 'data');

let fails = 0;
function check(name, cond, detail) {
  if (cond) console.log('ok   ' + name);
  else { fails++; console.log('FAIL ' + name + (detail ? ': ' + detail : '')); }
}

if (!existsSync(join(DATA, 'schedule.json'))) { console.log('no schedule.json, nothing to check'); process.exit(0); }

const mem = {};
globalThis.localStorage = {
  getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: k => { delete mem[k]; },
};
const submits = [];
let signedIn = false;
globalThis.window = {
  STD_AUTH: {
    state: () => ({ ready: true, waiting: false, signedIn }),
    submit: async row => { submits.push(row); return { taken: submits.length === 1, streak: 1, best: 1, rank: 1, players: 1 }; },
  },
};
const load = async p => JSON.parse(readFileSync(join(DATA, p.replace(/^data\//, '').replace(/\?v=\d+$/, '')), 'utf8'));

function freshApi() {
  for (const k of Object.keys(require.cache)) if (k.endsWith('api.js')) delete require.cache[k];
  const api = require('../api.js');
  api.configure({ load });
  return api;
}

const C = require('../contract.js');
const sched = JSON.parse(readFileSync(join(DATA, 'schedule.json'), 'utf8'));
const day = Object.keys(sched.days)[2];
let api = freshApi();
const sc = await api.getScenario(day);
check('getScenario has no reveal', !('reveal' in sc));
check('getScenario carries the schedule\'s day and number', sc.day === day && sc.number === sched.days[day].number && sc.id === sched.days[day].pack);

let st = await api.startOuting(sc.id, null, { mode: 'daily' });
check('opening the page writes nothing', !(C.OUTING_KEY in mem) && st.pitchNo === 0 && st.status === 'live');
check('the daily seed is the day\'s', st.seed === require('../engine.js').seedFor('daily', day));

const types = sc.pitcher.arsenal.map(a => a.type);
const r1 = await api.throwPitch(st.outingId, { type: types[0], cell: 12 });
check('a pitch is stored', JSON.parse(mem[C.OUTING_KEY]).calls.length === 1);
const r2 = await api.throwPitch(st.outingId, { type: types[types.length - 1], cell: 22, q: 0.83 });
{
  const kept = JSON.parse(mem[C.OUTING_KEY]).calls;
  check('the release rides on the call: a timed pitch is stored with its q, an untimed one without', kept[1].q === 0.83 && !('q' in kept[0]));
  check('the pitch result carries the call\'s q and its spread', r2.pitchResult.call.q === 0.83 && r2.pitchResult.spread === C.spreadOf(0.83) && r1.pitchResult.spread === 1);
  let refused = false;
  try { await api.throwPitch(st.outingId, { type: types[0], cell: 12, q: 2 }); } catch (e) { refused = true; }
  check('a q outside 0..1 is refused and nothing is stored', refused && JSON.parse(mem[C.OUTING_KEY]).calls.length === 2);
}

api = freshApi();
await api.getScenario(day);
const again = await api.startOuting(sc.id, null, { mode: 'daily' });
check('a reload replays the stored calls to the same state (the release too)', JSON.stringify(again.log) === JSON.stringify(r2.state.log) && again.pitchNo === 2 && again.log[1].call.q === 0.83);

let guard = 0, last = again;
while (last.status === 'live' && guard++ < 150) last = (await api.throwPitch(again.outingId, { type: types[0], cell: 18 })).state;
check('the outing ends', last.status === 'over');
const a = await api.finishOuting(again.outingId);
const b = await api.finishOuting(again.outingId);
check('finishOuting returns the same result every time', JSON.stringify(a) === JSON.stringify(b));
check('a guest is not submitted', submits.length === 0 && !a.account);
check('the result carries the share text', typeof a.share === 'string' && a.share.startsWith(C.SHARE_TITLE + ' #' + sc.number));
signedIn = true;
const c = await api.finishOuting(again.outingId);
const d = await api.finishOuting(again.outingId);
check('a guest who signs in is submitted once', submits.length === 1 && c.account && d.account && c.account.streak === 1);
check('what is submitted is the outing', submits[0].calls.length === a.pitches && submits[0].day === day && submits[0].score === a.score);
check('the submitted calls carry the release', submits[0].calls[1].q === 0.83 && !('q' in submits[0].calls[0]));
api = freshApi();
await api.getScenario(day);
const st3 = await api.startOuting(sc.id, null, { mode: 'daily' });
const e = await api.finishOuting(st3.outingId);
check('after a reload the result is the same and not submitted again', submits.length === 1 && e.score === a.score && e.account && e.account.streak === 1);

const before = mem[C.OUTING_KEY];
const pr = await api.startOuting(sc.id, 12345, { mode: 'practice' });
await api.throwPitch(pr.outingId, { type: types[0], cell: 12 });
check('practice is never stored', mem[C.OUTING_KEY] === before && pr.mode === 'practice' && pr.seed === 12345);

/* the tie rule through the four calls: a run that ties leaves the state live,
   and three outs then end it tie_held, in the result and its share text */
{
  const submitted = submits.length;
  let seen = null;
  for (let seed = 1; seed <= 300 && !seen; seed++) {
    const p = await api.startOuting(sc.id, seed, { mode: 'practice' });
    let s = p, tiedLive = false, g = 0;
    while (s.status === 'live' && g++ < 150) {
      s = (await api.throwPitch(p.outingId, { type: types[seed % types.length], cell: [12, 7, 17, 6, 18, 16, 8][seed % 7] })).state;
      if (s.status === 'live' && s.score.us === s.score.them) tiedLive = true;
    }
    if (tiedLive && s.status === 'over' && s.score.us === s.score.them) seen = { s, res: await api.finishOuting(p.outingId), seed };
  }
  check('a run that ties leaves the outing live', !!seen);
  if (seen) {
    const { s, res } = seen;
    check(`a tie, then three outs: the outing ends tie_held (practice seed ${seen.seed}, ${s.score.us}-${s.score.them})`, res.outcome === 'tie_held', res.outcome);
    check('the result is one of the contract\'s outcomes, and its share text says it',
      C.OUTCOMES.includes(res.outcome) && res.share.includes(C.OUTCOME_LABEL[res.outcome].toLowerCase()), res.share);
    check('practice after a tie is never submitted', submits.length === submitted);
  }
}

/* rules 4: the pitcher's side's challenge (contract.js ABS), a call of its own */
{
  let made = null;
  for (let seed = 1; seed <= 300 && !made; seed++) {
    const p = await api.startOuting(sc.id, seed, { mode: 'practice' });
    let s = p, guard = 0;
    while (s.status === 'live' && guard++ < 60 && !made) {
      const r = await api.throwPitch(p.outingId, { type: types[guard % types.length], cell: [6, 8, 16, 18, 2, 22][guard % 6], q: 0.5 });
      s = r.state;
      if (s.abs && s.abs.challengeLive) {
        const c = await api.challenge(p.outingId);
        made = { r, c };
      }
    }
  }
  check('rules 4: the state says when a challenge is live, and the challenge call answers with the pitch and the state',
    !!made && made.c.pitchResult.challenge && made.c.pitchResult.challenge.by === 'pitcher'
    && made.c.state.abs.events.length >= 1 && made.c.state.abs.challengeLive === false
    && made.c.state.abs.left.pitcher === (made.c.pitchResult.challenge.overturned ? C.ABS.PER_SIDE : C.ABS.PER_SIDE - 1));
}

/* rules 7: the pickoff, a call of its own between pitches, kept on the last call (CONTRACT.md 5i) */
{
  let made = null;
  for (let seed = 1; seed <= 300 && !made; seed++) {
    const p = await api.startOuting(sc.id, seed, { mode: 'practice' });
    let s = p, guard = 0;
    while (s.status === 'live' && guard++ < 60 && !made) {
      const r = await api.throwPitch(p.outingId, { type: types[guard % types.length], cell: [6, 8, 16, 18, 2, 22][guard % 6], q: 0.5, ss: 1 });
      s = r.state;
      if (s.run && s.run.pickoff.live) made = { r, k: await api.pickoff(p.outingId) };
    }
  }
  check('rules 7: the state says when a pickoff is live, and the pickoff call answers with the throw and the state',
    !!made && typeof made.k.pickoff.out === 'boolean' && made.k.state.run.pickoffs.length === 1
    && (made.k.pickoff.out || made.k.state.run.pickoff.left === C.STEAL.DISENGAGE - 1));
}

/* The board end to end (159_shut_the_door_boards.sql), against a stand-in server that keeps the
   first post per (user, day) and answers the kept row, as the real one does. Today's daily:
   a guest finishes, sees it pending, signs in and it posts once by itself; a second device signed
   in replays the kept outing and posts nothing; a device that played before it could ask loses
   the race and is told which outing counts; yesterday's unposted result is never pending today. */
{
  const server = { rows: {}, posts: 0 };
  let user = null;
  const listeners = [];
  const auth = {
    state: () => ({ ready: true, waiting: false, signedIn: !!user, userId: user }),
    onChange: (f) => { listeners.push(f); return () => {}; },
    submit: async (row) => {
      server.posts++;
      const k = user + '|' + row.day, taken = !server.rows[k];
      if (taken) server.rows[k] = { day: row.day, scenarioId: row.scenarioId, calls: JSON.parse(JSON.stringify(row.calls)), score: row.score, outcome: row.outcome };
      return { taken, streak: 1, best: 1, rank: 1, players: 1, keptScore: server.rows[k].score, keptOutcome: server.rows[k].outcome };
    },
    myDay: async (d) => (user && server.rows[user + '|' + d]) || null,
  };
  const signIn = (u) => { user = u; listeners.slice().forEach(f => f(auth.state())); };
  const wipe = () => { for (const k of Object.keys(mem)) delete mem[k]; };
  const playOut = async (a, id, cell) => {
    let s = null, g = 0;
    do { s = (await a.throwPitch(id, { type: types[0], cell })).state; } while (s.status === 'live' && g++ < 150);
    return s;
  };
  const today = C.easternDay();
  window.STD_AUTH = auth;
  wipe();

  // device A, signed out: play today's daily to the end
  let A = freshApi();
  let tsc = await A.getScenario(today);
  const tTypes = tsc.pitcher.arsenal.map(x => x.type);
  types.length = 0; types.push(...tTypes);
  let o = await A.startOuting(tsc.id, null, { mode: 'daily' });
  await playOut(A, o.outingId, 18);
  const ra = await A.finishOuting(o.outingId);
  const pend = A.pending();
  check('signed out: the finished daily is pending, with its score, for the sign-in prompt',
    !!pend && pend.day === today && pend.score === ra.score && pend.outcome === ra.outcome && server.posts === 0);
  check('signed out: claim answers null and posts nothing', (await A.claim()) === null && server.posts === 0);

  // signing in posts it by itself, once
  signIn('u1');
  for (let i = 0; i < 20 && A.pending(); i++) await new Promise(r => setTimeout(r, 5));
  check('a sign-in posts the pending daily by itself', server.posts === 1 && !!server.rows['u1|' + today] && A.pending() === null);
  const again2 = await A.claim();
  check('claim after that posts nothing more', again2 && again2.posted === false && server.posts === 1);
  const rb = await A.finishOuting(o.outingId);
  check('the result now carries the account, taken', rb.account && rb.account.taken === true && rb.score === ra.score);

  // device B, same account, nothing stored: it replays the kept outing and posts nothing
  wipe();
  let B = freshApi();
  await B.getScenario(today);
  const ob = await B.startOuting(tsc.id, null, { mode: 'daily' });
  check('a second device signed in opens on the kept outing, over, from the account',
    ob.status === 'over' && ob.fromAccount === true && ob.pitchNo === server.rows['u1|' + today].calls.length);
  const rbb = await B.finishOuting(ob.outingId);
  check('and shows the same result, with nothing posted again', rbb.score === ra.score && rbb.outcome === ra.outcome && server.posts === 1);

  // device C, same account, played before it could ask (the account did not answer): told which counts
  wipe();
  const myDay = auth.myDay;
  auth.myDay = async () => null;
  let Cc = freshApi();
  await Cc.getScenario(today);
  const oc = await Cc.startOuting(tsc.id, null, { mode: 'daily' });
  await playOut(Cc, oc.outingId, 6);
  const rc = await Cc.finishOuting(oc.outingId);
  auth.myDay = myDay;
  check('a device that loses the race is told: taken false, and the score that counts',
    rc.account && rc.account.taken === false && rc.account.keptScore === ra.score && server.posts === 2);

  // the day boundary: yesterday's unposted result is never pending today
  wipe();
  user = null;
  const yday = new Date(Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1, +today.slice(8, 10)) - 86400000).toISOString().slice(0, 10);
  mem[C.OUTING_KEY] = JSON.stringify({ v: 1, day: yday, scenarioId: tsc.id, calls: [], result: { score: 500, outcome: 'door_shut', pitches: 9 }, submitted: false });
  const D = freshApi();
  check('yesterday\'s unposted result is not pending today', D.pending() === null);
  signIn('u2');
  check('and a sign-in does not post it', (await D.claim()).posted === false && server.posts === 2);
}

/* rules 8 (CONTRACT.md 5j): the closer's outing to the end of the game starts with a whole day's
   daily (api.js FULL_CLOSE_FROM). Chapman 2016 was the daily on 2026-10-30, played as one half under
   rules 7; on his next turn the daily is both halves, the card between them on the pitch that ends
   the 8th, and the state the 9th's */
{
  for (const k of Object.keys(mem)) delete mem[k];
  signedIn = false;
  const days = Object.keys(sched.days).filter(d => sched.days[d].pack === 'std-2016-ws7-chapman');
  const before = days.find(d => d < '2026-10-31'), after = days.find(d => d >= '2026-10-31');
  const Q = freshApi();
  const s7 = await Q.getScenario(before);
  const o7 = await Q.startOuting(s7.id, null, { mode: 'daily' });
  const t7 = s7.pitcher.arsenal.map(a => a.type);
  let last = null;
  for (let i = 0; i < 60 && (!last || last.state.status === 'live'); i++) last = await Q.throwPitch(o7.outingId, { type: t7[i % t7.length], cell: 12 });
  check(`rules 8: the daily before ${'2026-10-31'} (${before}, Chapman) is played as it was: rules 7, one half`,
    last.state.status === 'over' && last.pitchResult.call.r === 7 && !last.state.halves.length && o7.half.of === 1);
  for (const k of Object.keys(mem)) delete mem[k];
  const Q2 = freshApi();
  const s8 = await Q2.getScenario(after);
  check('rules 8: Chapman\'s spot is two halves, his team\'s real 9th between, and no reveal', s8.halves.length === 2 && s8.between.length === 1 && !('reveal' in s8) && !('reveal1' in s8));
  const o8 = await Q2.startOuting(s8.id, null, { mode: 'daily' });
  let card = null, r = null;
  for (let i = 0; i < 200 && !card && (!r || r.state.status === 'live'); i++) {
    r = await Q2.throwPitch(o8.outingId, { type: 'SL', cell: 22 });
    card = r.pitchResult.halfOver || null;
  }
  check(`rules 8: on his next turn (${after}) the 8th ends with the card and the 9th is set`, !!card && r.state.half.inning === 9 && r.state.outs === 0
    && r.state.halves.length === 1 && r.pitchResult.call.r === 8 && card.between.abbr === 'CHC' && card.between.pas.length === 4 && card.next.leadoff.name);
  // a reload replays to the same 9th
  const Q3 = freshApi();
  await Q3.getScenario(after);
  const back = await Q3.startOuting(s8.id, null, { mode: 'daily' });
  check('rules 8: a reload resumes in the 9th, the card kept', back.half.inning === 9 && back.halves.length === 1 && back.pitchNo === r.state.pitchNo);
}

console.log(fails ? `${fails} FAILED` : 'all ok');
process.exit(fails ? 1 : 0);
