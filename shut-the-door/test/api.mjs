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

console.log(fails ? `${fails} FAILED` : 'all ok');
process.exit(fails ? 1 : 0);
