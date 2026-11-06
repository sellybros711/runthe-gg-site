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
 * For every at bat (postgame.js atBats, the cards on the result):
 *   its link (version 2) decodes to the outing's calls to its last pitch and its first pitch, exactly,
 *     and is its last pitch's link with one number more
 *   clip(spec) plays each of its pitches in order, each the pitch the outing threw from the state it
 *     was thrown in, and nothing else
 *   a span that is not one whole at bat does not play
 * Then malformed and foreign links are refused (decode null, or clip throws), and a link with the
 * rules of a later build does not play. A pitch link made before the at bat clip (version 1, a
 * literal here) decodes to the same spec it always did, and plays the pitch. */
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
const PG = require('../postgame.js');

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
let abs = 0, abPitches = 0, abLong = 0, abSaw = { multi: 0, ch: 0, pa: 0, halves: 0 };
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
  /* the at bats, as the result draws them */
  const own = (await load('data/' + sch.packs[scn.id].file)).scenario;
  const bats = PG.atBats(st.log, own);
  check('the at bats cover the outing (' + scn.id + ')', bats.length > 0 && bats[0].from === 0 && bats[bats.length - 1].to === st.log.length && bats.every((b, i) => i === 0 || b.from === bats[i - 1].to));
  for (const ab of bats) {
    const from = ab.from + 1, to = ab.to, tag = scn.id + ' at bat ' + (ab.index + 1) + ', pitches ' + from + '-' + to;
    const c = api.clipSpec(st.outingId, to, from);
    check('clipSpec of an at bat (' + tag + ')', !!c && typeof c.link === 'string' && /^2\./.test(c.link));
    if (!c) continue;
    const back = CL.decode(c.link);
    check('the at bat link decodes (' + tag + ')', !!back, c.link);
    if (!back) continue;
    check('the at bat link round-trips to the outing\'s calls and its first pitch (' + tag + ')', canon(back.calls) === canon(c.spec.calls) && back.from === from && back.calls.length === to);
    check('the at bat link keeps mode, day, rules and pack', back.mode === c.spec.mode && back.day === c.spec.day && back.rules === c.spec.rules && back.pack === c.spec.pack && (back.mode === 'd' || back.seed === c.spec.seed));
    const one = api.clipSpec(st.outingId, to);
    check('the at bat link is its last pitch\'s link and one number (' + tag + ')', !!one && c.link === '2' + one.link.slice(1).replace(new RegExp('^(\\.[^.]+){' + (back.mode === 'p' || back.mode === 's' ? 5 : 4) + '}'), (h) => h + '.' + from), c.link + ' vs ' + (one && one.link));
    abLong = Math.max(abLong, c.link.length);
    const cl = await api.clip(back);
    check('the at bat plays each of its pitches (' + tag + ')', Array.isArray(cl.pitches) && cl.pitches.length === to - from + 1, cl.pitches && cl.pitches.length);
    if (!Array.isArray(cl.pitches)) continue;
    cl.pitches.forEach((x, k) => {
      const mine = st.log[from - 1 + k];
      check('the at bat\'s pitch is the pitch thrown (' + tag + ', pitch ' + (from + k) + ')', face(x.final) === face(mine), face(x.final) + '\n  vs ' + face(mine));
      check('the at bat\'s pitch is thrown in its own count (' + tag + ', pitch ' + (from + k) + ')', JSON.stringify(x.before.count) === JSON.stringify(mine.countBefore) && x.before.pitchNo === from - 1 + k && x.before.batterIndex === cl.pitches[0].before.batterIndex);
      if (mine.call.ch) abSaw.ch++;
      if (c.spec.calls[from - 1 + k].pa) abSaw.pa++;
    });
    check('the at bat ends where the card ends (' + tag + ')', face(cl.final) === face(st.log[to - 1]) && JSON.stringify(cl.before) === JSON.stringify(cl.pitches[0].before));
    if (cl.before.half && cl.before.half.index > 0) abSaw.halves++;
    if (to > from) {
      abSaw.multi++;
      // not one whole at bat: it starts inside one, or it stops before its end
      let threw = false; try { await api.clip(Object.assign({}, back, { from: from + 1 })); } catch (e) { threw = true; }
      check('an at bat that starts mid at bat does not play (' + tag + ')', threw);
      threw = false; try { await api.clip(Object.assign({}, back, { calls: back.calls.slice(0, -1) })); } catch (e) { threw = true; }
      check('an at bat that stops before its end does not play (' + tag + ')', threw || st.status === 'live');
    }
    abs++; abPitches += to - from + 1;
  }
  check('clips store nothing (' + mode + ')', localStorage.getItem(C.OUTING_KEY) === kept1, 'the kept outing changed');
  if (mode === 'practice') check('practice stores nothing', kept0 === kept1);
}
console.log('clips: ' + pitches + ' pitches over ' + OUTINGS + ' outings (challenged ' + saw.ch + ', pickoffs ' + saw.pa + ', quick ' + saw.ss + ', free aim ' + saw.at + ', second half on ' + saw.halves + ')');
check('the outings reached challenges, pickoffs and quick deliveries', saw.ch > 0 && saw.pa > 0 && saw.ss > 0, JSON.stringify(saw));
console.log('at bat clips: ' + abs + ' at bats, ' + abPitches + ' pitches (more than one pitch ' + abSaw.multi + ', challenged ' + abSaw.ch + ', pickoffs ' + abSaw.pa + ', second half on ' + abSaw.halves + '), longest link ' + abLong + ' characters');
check('the at bats reached several pitches, challenges and pickoffs', abSaw.multi > 0 && abSaw.ch > 0 && abSaw.pa > 0, JSON.stringify(abSaw));

/* a pitch link from before the at bat clip (version 1): the same spec as ever, and it plays one pitch */
const OLD = '1.d.20261105.10.' + ids[0] + '.FF12q62a3_-4.SL7q85e40c';
const oldSpec = CL.decode(OLD);
check('an old pitch link decodes exactly as it did', JSON.stringify(oldSpec) === JSON.stringify({ mode: 'd', day: '2026-11-05', rules: 10, pack: ids[0],
  calls: [{ type: 'FF', cell: 12, q: 0.62, at: [0.03, -0.04], r: 10 }, { type: 'SL', cell: 7, q: 0.85, e: 0.4, r: 10, ch: 1 }] }), JSON.stringify(oldSpec));
check('an old pitch link encodes back to itself', !!oldSpec && CL.encode(oldSpec) === OLD);
const OLD_P = '1.p.20261105.10.' + ids[0] + '.25.FF12q62';
const oldP = CL.decode(OLD_P);
check('an old practice pitch link decodes exactly as it did', JSON.stringify(oldP) === JSON.stringify({ mode: 'p', day: '2026-11-05', rules: 10, pack: ids[0], seed: 77, calls: [{ type: 'FF', cell: 12, q: 0.62, r: 10 }] }) && CL.encode(oldP) === OLD_P, JSON.stringify(oldP));
/* and a played one: today's first pitch, from a link written the old way by hand, plays the pitch alone */
{
  const st0 = await api.startOuting((await api.getScenario()).id, 5, { mode: 'practice' });
  const types = (await api.getScenario()).pitcher.arsenal.map(a => a.type);
  const r1 = await api.throwPitch(st0.outingId, { type: types[0], cell: 12, q: 0.5 });
  const r2 = r1.state.status === 'live' ? await api.throwPitch(st0.outingId, { type: types[0], cell: 7, q: 0.7 }) : null;
  const n = r2 ? 2 : 1, mine = (r2 || r1).state.log[n - 1];
  const sc0 = await api.getScenario();
  const hand = '1.p.' + C.easternDay().replace(/-/g, '') + '.' + r1.state.rules + '.' + sc0.id + '.5.' + types[0] + '12q50' + (r2 ? '.' + types[0] + '7q70' : '');
  check('a hand written version 1 link is the page\'s own pitch link', hand === api.clipSpec(st0.outingId, n).link, hand + ' vs ' + api.clipSpec(st0.outingId, n).link);
  const cl = await api.clip(CL.decode(hand));
  check('an old pitch link plays the pitch alone', !cl.pitches && face(cl.final) === face(mine));
}

/* refused */
const good = '1.d.20261105.10.' + ids[0] + '.FF12q62';
check('a well formed link decodes', !!CL.decode(good));
const goodAb = '2.d.20261105.10.' + ids[0] + '.2.FF12q62.SL7q85';
check('a well formed at bat link decodes', !!CL.decode(goodAb) && CL.decode(goodAb).from === 2 && CL.encode(CL.decode(goodAb)) === goodAb);
for (const bad of ['2.d.20261105.10.' + ids[0] + '.FF12', '2.d.20261105.10.' + ids[0] + '.0.FF12', '2.d.20261105.10.' + ids[0] + '.3.FF12.FF7', '2.d.20261105.10.' + ids[0] + '.01.FF12',
  '2.d.20261105.10.' + ids[0] + '.1', '2.p.20261105.10.' + ids[0] + '.1.FF12', '2.d.20261105.10.' + ids[0] + '.x.FF12', '3.d.20261105.10.' + ids[0] + '.1.FF12']) {
  check('a malformed at bat link is refused: ' + bad.slice(0, 60), CL.decode(bad) === null);
}
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
