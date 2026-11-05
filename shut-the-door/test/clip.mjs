/* Shut The Door clips (clip.js, api.js clipSpec and clip): a pitch's link round-trips, and played
 * again from the link it is the pitch the outing threw.
 *   node shut-the-door/test/clip.mjs [--data dir] [--outings N]
 *
 * Plays outings through api.js (dailies on real packs, practice on its own seed) with timed releases,
 * effort, free aim, challenges, pickoffs and quick deliveries when they come up. For every pitch:
 *   the link decodes to the outing's own calls, exactly
 *   clip(spec) gives the state the pitch was thrown in, and the pitch as it stands (result, count,
 *     outs, bases, runs, where it crossed, its speed), field for field
 *   nothing is stored: the daily's kept outing is the same before and after every clip
 * Then malformed and foreign links are refused (decode null, or clip throws), and a link with the
 * rules of a later build does not play. */
import { createRequire } from 'module';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const DATA = args.includes('--data') ? args[args.indexOf('--data') + 1] : join(HERE, '..', 'data');
const OUTINGS = args.includes('--outings') ? +args[args.indexOf('--outings') + 1] : 6;

let fails = 0, oks = 0;
function check(name, cond, detail) {
  if (cond) { oks++; return; }
  fails++; console.log('FAIL ' + name + (detail ? ': ' + detail : ''));
}
if (!existsSync(join(DATA, 'schedule.json'))) { console.log('no schedule.json, nothing to check'); process.exit(0); }

const mem = {};
globalThis.localStorage = { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: k => { delete mem[k]; } };
globalThis.window = { STD_AUTH: { state: () => ({ ready: true, signedIn: false }) } };
const load = async p => JSON.parse(readFileSync(join(DATA, p.replace(/^data\//, '').replace(/\?v=\d+$/, '')), 'utf8'));
const api = require('../api.js');
api.configure({ load });
const CL = require('../clip.js');
const C = require('../contract.js');
const R = require('../rng.js');

/* the pitch as a player reads it: what the clip must reproduce */
const face = (p) => p && JSON.stringify({ n: p.n, type: p.call.type, cell: p.call.cell, result: p.result, count: p.count, countBefore: p.countBefore, outs: p.outs, bases: p.bases, runs: p.runs, paOver: p.paOver,
  actual: p.actual, velo: p.velo, inPlay: p.inPlay ? p.inPlay.result : null, challenge: p.challenge || null, steal: p.steal || null, drawn: p.drawn });
/* a call's fields in one order (the engine appends ch and pa when they are made) */
const canon = (calls) => JSON.stringify(calls.map(c => Object.fromEntries(Object.keys(c).sort().map(k => [k, c[k]]))));

async function playOne(scn, mode, k) {
  const rnd = R.mulberry32(1000 + k);
  const st0 = await api.startOuting(scn.id, mode === 'practice' ? 77 + k : null, { mode });
  let st = st0;
  const states = [st0];
  const types = scn.pitcher.arsenal.map(a => a.type);
  for (let i = 0; i < 60 && st.status === 'live'; i++) {
    const call = { type: types[Math.floor(rnd() * types.length)], cell: Math.floor(rnd() * 25), q: Math.round(rnd() * 100) / 100 };
    if (rnd() < 0.5) call.e = Math.round(rnd() * 60) / 100;
    if (rnd() < 0.6) call.at = [Math.round((rnd() - 0.5) * 80) / 100, Math.round((rnd() - 0.5) * 80) / 100];
    if (st.run && st.run.on.some(Boolean) && rnd() < 0.4) call.ss = 1;
    const r = await api.throwPitch(st.outingId, call);
    st = r.state;
    if (st.abs && st.abs.challengeLive && rnd() < 0.6) st = (await api.challenge(st.outingId)).state;
    if (st.run && st.run.pickoff.live && rnd() < 0.3) st = (await api.pickoff(st.outingId)).state;
    states.push(st);
  }
  return st;
}

const sch = JSON.parse(readFileSync(join(DATA, 'schedule.json'), 'utf8'));
const ids = Object.keys(sch.packs);
let pitches = 0, saw = { ch: 0, pa: 0, ss: 0, at: 0, halves: 0 };
for (let k = 0; k < OUTINGS; k++) {
  // a daily on the day's pack (today's real outing), then practice on other packs
  const mode = k === 0 ? 'daily' : 'practice';
  const scn = k === 0 ? await api.getScenario() : Object.assign({}, await api.getScenario(), { id: ids[(k * 7) % ids.length] });
  if (k > 0) { const p = await load('data/' + sch.packs[scn.id].file); scn.pitcher = p.scenario.pitcher; }
  const kept0 = localStorage.getItem(C.OUTING_KEY);
  const st = await playOne(scn, mode, k);
  const kept1 = localStorage.getItem(C.OUTING_KEY);
  for (let n = 1; n <= st.log.length; n++) {
    const c = api.clipSpec(st.outingId, n);
    check('clipSpec ' + n, !!c && typeof c.link === 'string');
    if (!c) continue;
    const back = CL.decode(c.link);
    check('the link decodes (' + scn.id + ' ' + n + ')', !!back, c.link);
    if (!back) continue;
    check('the link round-trips to the outing\'s calls (' + scn.id + ' ' + n + ')', canon(back.calls) === canon(c.spec.calls), c.link + ' ' + JSON.stringify(c.spec.calls.slice(-1)) + ' vs ' + JSON.stringify(back.calls.slice(-1)));
    check('the link keeps mode, day, rules and pack', back.mode === c.spec.mode && back.day === c.spec.day && back.rules === c.spec.rules && back.pack === c.spec.pack && (back.mode === 'd' || back.seed === c.spec.seed));
    const cl = await api.clip(back);
    const mine = st.log[n - 1];
    check('the clip is the pitch thrown (' + scn.id + ' pitch ' + n + ')', face(cl.final) === face(mine), face(cl.final) + '\n  vs ' + face(mine));
    // the state before: the state after the pitch before it, or the outing's start
    const prev = n > 1 ? st.log[n - 2] : null;
    check('the clip starts from the count it was thrown in', JSON.stringify(cl.before.count) === JSON.stringify(mine.countBefore) && cl.before.pitchNo === n - 1);
    if (prev) check('the clip starts after the pitch before', cl.before.log.length === n - 1 && face(cl.before.log[n - 2]) === face(prev));
    if (mine.call.ch || mine.challenge && mine.challenge.by === 'pitcher') saw.ch++;
    if (c.spec.calls[n - 1].pa) saw.pa++;
    if (c.spec.calls[n - 1].ss) saw.ss++;
    if (c.spec.calls[n - 1].at) saw.at++;
    if (cl.before.half && cl.before.half.index > 0) saw.halves++;
    pitches++;
  }
  check('clips store nothing (' + mode + ')', localStorage.getItem(C.OUTING_KEY) === kept1, 'the kept outing changed');
  if (mode === 'practice') check('practice stores nothing', kept0 === kept1);
}
console.log('clips: ' + pitches + ' pitches over ' + OUTINGS + ' outings (challenged ' + saw.ch + ', pickoffs ' + saw.pa + ', quick ' + saw.ss + ', free aim ' + saw.at + ', second half on ' + saw.halves + ')');
check('the outings reached challenges, pickoffs and quick deliveries', saw.ch > 0 && saw.pa > 0 && saw.ss > 0, JSON.stringify(saw));

/* refused */
const good = '1.d.20261105.10.' + ids[0] + '.FF12q62';
check('a well formed link decodes', !!CL.decode(good));
for (const bad of ['', 'x', '2.d.20261105.10.' + ids[0] + '.FF12', '1.z.20261105.10.' + ids[0] + '.FF12', '1.d.2026115.10.' + ids[0] + '.FF12', '1.d.20261105.10.' + ids[0],
  '1.d.20261105.10.' + ids[0] + '.FF25', '1.d.20261105.10.' + ids[0] + '.FF12q101', '1.d.20261105.10.' + ids[0] + '.FF12qq', '1.d.20261105.10.' + ids[0] + '.FF12q5q6', '1.d.20261105.10.' + ids[0] + '.FF12a60_0',
  '1.d.20261105.10.' + ids[0] + '.ff12', '1.d.20261105.10.Std.FF12', '1.p.20261105.10.' + ids[0] + '.FF12', '1.d.20261105.10.' + ids[0] + '.FF12p0', '1.d.20261105.10.' + ids[0] + '.' + Array(200).fill('FF1').join('.')]) {
  check('a malformed link is refused: ' + bad.slice(0, 60), CL.decode(bad) === null);
}
const rej = async (text, why) => { let threw = false; try { await api.clip(CL.decode(text)); } catch (e) { threw = true; } check('a link that cannot play is refused: ' + why, threw); };
await rej('1.d.20261105.10.std-no-such-pack.FF12', 'a pack the schedule does not list');
await rej('1.d.20261105.99.' + ids[0] + '.FF12', 'rules of a later build');
await rej('1.d.20261105.10.' + ids[0] + '.KN12', 'a pitch not in his arsenal');
await rej('1.d.20261105.10.' + ids[0] + '.FF12e50', 'effort without a release');

console.log(`${oks} ok, ${fails} failed`);
process.exit(fails ? 1 : 0);
