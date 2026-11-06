/* Shut The Door after the outing (postgame.js): the at bats, the K-Zone and the box line are the
 * engine's own.
 *   node shut-the-door/test/postgame.mjs [--data dir] [--outings N]
 *
 * Plays outings through api.js (the daily on today's pack, practice on other packs) with timed
 * releases, effort, free aim, challenges, pickoffs and quick deliveries, then:
 *   every pitch is in exactly one at bat, in order, and each at bat's hitter is the engine's
 *     (state.batterIndex when its first pitch was thrown)
 *   each pitch is plotted where it CROSSED: the point is log.actual on the pitcher's view, the
 *     plotted cell is the engine's actualCell mirrored by screenCol(), and some pitches cross
 *     away from the cell they were aimed at (so the plot is not the aim)
 *   the daily replayed from storage gives the same at bats and the same plotted points
 *   the box line: pitches and runs are the result's, strikes plus balls the pitches, K, BB, HBP
 *     and hits the at bats' own ends, and the result carries it as result.stats
 *   valid() holds the rules 166's shutdoor_stats_ok holds (the SQL test checks the same cases)
 *   signed in, the daily's line goes to the server once, and only for the outing it keeps */
import { createRequire } from 'module';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const DATA = args.includes('--data') ? args[args.indexOf('--data') + 1] : join(HERE, '..', 'data');
const OUTINGS = args.includes('--outings') ? +args[args.indexOf('--outings') + 1] : 8;

let fails = 0, oks = 0;
function check(name, cond, detail) {
  if (cond) { oks++; return; }
  fails++; console.log('FAIL ' + name + (detail ? ': ' + detail : ''));
}
if (!existsSync(join(DATA, 'schedule.json'))) { console.log('no schedule.json, nothing to check'); process.exit(0); }

const mem = {};
globalThis.localStorage = { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: k => { delete mem[k]; } };
const sent = [];
let signedIn = false, taken = true;
globalThis.window = { STD_AUTH: {
  state: () => (signedIn ? { ready: true, signedIn: true, userId: 'u1' } : { ready: true, signedIn: false }),
  submit: async (row) => { sent.push(['submit', row]); return { taken, streak: 1, best: 1, rank: 1, players: 1, keptScore: row.score }; },
  submitStats: async (row) => { sent.push(['stats', row]); return { data: { taken: true } }; },
  myDay: async () => null,
} };
const load = async p => JSON.parse(readFileSync(join(DATA, p.replace(/^data\//, '').replace(/\?v=\d+$/, '')), 'utf8'));
const api = require('../api.js');
api.configure({ load });
const PG = require('../postgame.js');
const C = require('../contract.js');
const R = require('../rng.js');

async function playOne(scn, mode, k) {
  const rnd = R.mulberry32(4000 + k);
  let st = await api.startOuting(scn.id, mode === 'practice' ? 91 + k : null, { mode });
  const who = [];
  const types = scn.pitcher.arsenal.map(a => a.type);
  for (let i = 0; i < 80 && st.status === 'live'; i++) {
    const call = { type: types[Math.floor(rnd() * types.length)], cell: Math.floor(rnd() * 25), q: Math.round(rnd() * 100) / 100 };
    if (rnd() < 0.5) call.e = Math.round(rnd() * 60) / 100;
    if (rnd() < 0.6) call.at = [Math.round((rnd() - 0.5) * 80) / 100, Math.round((rnd() - 0.5) * 80) / 100];
    if (st.run && st.run.on.some(Boolean) && rnd() < 0.4) call.ss = 1;
    who.push(st.batterIndex);
    st = (await api.throwPitch(st.outingId, call)).state;
    if (st.abs && st.abs.challengeLive && rnd() < 0.6) st = (await api.challenge(st.outingId)).state;
    if (st.run && st.run.pickoff.live && rnd() < 0.35) st = (await api.pickoff(st.outingId)).state;
  }
  return { st, who };
}

const sch = JSON.parse(readFileSync(join(DATA, 'schedule.json'), 'utf8'));
const ids = Object.keys(sch.packs);
const saw = { pitches: 0, abs: 0, off: 0, halves: 0, kinds: {}, codes: {} };
for (let k = 0; k < OUTINGS; k++) {
  const mode = k === 0 ? 'daily' : 'practice';
  const base = await api.getScenario();
  const scn = k === 0 ? base : Object.assign({}, base, { id: ids[(k * 5) % ids.length] });
  if (k > 0) { const p = await load('data/' + sch.packs[scn.id].file); Object.assign(scn, { pitcher: p.scenario.pitcher, batters: p.scenario.batters, halves: p.scenario.halves }); }
  const { st, who } = await playOne(scn, mode, k);
  const log = st.log, strip = st.strip;
  const abs = PG.atBats(log, scn, strip);
  const flat = abs.flatMap(a => a.pitches);
  check('every pitch in one at bat, in order (' + scn.id + ')', flat.length === log.length && flat.every((p, i) => p.n === i + 1));
  abs.forEach((a, j) => {
    check('the at bat\'s hitter is the engine\'s (' + scn.id + ' AB ' + (j + 1) + ')', a.batter === who[a.from], a.batter + ' vs ' + who[a.from]);
    check('the at bat has the hitter\'s name', a.name === scn.batters[a.batter].name);
    check('every at bat ends in words', typeof a.word === 'string' && a.word.length > 0 && /^[A-Z]/.test(a.word), a.word);
    saw.codes[a.code || '-'] = (saw.codes[a.code || '-'] || 0) + 1;
    if (a.half > 0) saw.halves++;
  });
  flat.forEach((p, i) => {
    const e = log[i];
    check('plotted where it crossed', JSON.stringify(p.actual) === JSON.stringify(e.actual) && JSON.stringify(p.at) === JSON.stringify(PG.point(e.actual)));
    // the plotted cell, read back off the picture: the engine's actualCell, mirrored
    const sc = Math.min(4, Math.floor(p.at[0] * 5 + 1e-9)), row = Math.min(4, Math.floor(p.at[1] * 5 + 1e-9));
    const edge = Math.abs(p.at[0] * 5 - Math.round(p.at[0] * 5)) < 1e-6 || Math.abs(p.at[1] * 5 - Math.round(p.at[1] * 5)) < 1e-6;
    if (!edge) check('the plotted cell is the engine\'s, mirrored (' + scn.id + ' pitch ' + p.n + ')', sc === C.screenCol(e.actualCell) && row === C.rowOf(e.actualCell), sc + ',' + row + ' vs cell ' + e.actualCell);
    check('the type, speed, count and band are the log\'s and the strip\'s', p.type === e.call.type && p.velo === e.velo && JSON.stringify(p.count) === JSON.stringify(e.countBefore) && p.band === strip[i]);
    check('the mark is the result\'s', p.kind === PG.KIND[e.result], e.result);
    if (e.actualCell !== e.call.cell) saw.off++;
    if (e.challenge) saw.abs++;
    saw.kinds[p.kind] = (saw.kinds[p.kind] || 0) + 1;
    saw.pitches++;
  });
  const res = await api.finishOuting(st.outingId);
  const b = PG.box(log, res);
  check('the box line\'s pitches and runs are the result\'s (' + scn.id + ')', b.p === res.pitches && b.r === res.runs, JSON.stringify(b) + ' runs ' + res.runs);
  check('strikes and balls add up', b.s + b.b === b.p && b.strikePct === Math.round(100 * b.s / b.p));
  const ended = (c) => abs.filter(a => a.code === c).length;
  check('K, BB and HBP are the at bats\' ends', b.k === ended('K') && b.bb === ended('BB') && b.hbp === log.filter(p => p.result === 'hit_by_pitch').length);
  check('hits are the at bats\' ends', b.h === ['1B', '2B', '3B', 'HR'].reduce((n, c) => n + ended(c), 0));
  check('plate appearances are the at bats', b.pa === abs.length && b.fps === abs.filter(a => a.pitches[0].kind !== 'ball' && a.pitches[0].kind !== 'hbp').length);
  if (st.line && st.line.them) {
    const H = st.line.them.H != null ? st.line.them.H : null;
    if (H != null) check('hits are the line score\'s', b.h === H, b.h + ' vs ' + H);
  }
  check('the result carries the summary', JSON.stringify(res.stats) === JSON.stringify(PG.summary(log, res)) && PG.valid(res.stats, res.pitches), JSON.stringify(res.stats));
  if (mode === 'daily') {
    // the daily again: replayed from storage, the same at bats and the same points
    const again = await api.startOuting(scn.id, null, { mode: 'daily' });
    const abs2 = PG.atBats(again.log, scn, again.strip);
    check('the replayed daily plots the same at bats', JSON.stringify(abs2) === JSON.stringify(abs));
  }
}
console.log('postgame: ' + saw.pitches + ' pitches over ' + OUTINGS + ' outings (crossed off the aimed cell ' + saw.off + ', challenged ' + saw.abs + ', at bats in a later half ' + saw.halves + ')');
console.log('  marks ' + JSON.stringify(saw.kinds) + '  ends ' + JSON.stringify(saw.codes));
check('some pitches crossed away from where they were aimed', saw.off > 0);
check('every mark came up', ['called', 'ball', 'swing', 'foul', 'inplay'].every(k => saw.kinds[k] > 0), JSON.stringify(saw.kinds));

/* valid(): the cases 166's test holds the SQL check to */
const good = { v: 1, p: 14, s: 10, b: 4, k: 2, bb: 1, h: 1, r: 0, hbp: 0, pa: 5, fps: 3 };
const w = (o) => Object.assign({}, good, o);
check('a real line passes', PG.valid(good, 14));
for (const [why, bad, n] of [['other pitches', good, 13], ['strikes and balls', w({ s: 11 }), 14], ['a string', w({ k: '2' }), 14], ['a fraction', w({ k: 2.5 }), 14],
  ['a negative', w({ k: -1 }), 14], ['an extra key', w({ x: 1 }), 14], ['another version', w({ v: 2 }), 14], ['more ends than at bats', w({ k: 3, bb: 1, h: 2 }), 14],
  ['first-pitch strikes', w({ fps: 6 }), 14], ['an array', [1], 14], ['nothing', null, 14]]) {
  check('valid refuses ' + why, !PG.valid(bad, n));
}
const miss = Object.assign({}, good); delete miss.fps;
check('valid refuses a missing key', !PG.valid(miss, 14));
check('the board line', PG.line(good) === '14 P · 10 S · 2 K · 1 H · 0 R' && PG.line(null) === '' && PG.line({ v: 1 }) === '');
const two = PG.sum([good, w({ p: 9, s: 5, h: 2, r: 2, pa: 4, fps: 2, k: 0 })]);
check('a run adds up', two && two.p === 23 && two.s === 15 && two.h === 3 && two.r === 2 && PG.line(two).startsWith('23 P'));
check('a run with a situation missing its line has none', PG.sum([good, null]) === null && PG.sum([]) === null);

/* signed in: the daily's line goes once, only for the outing the server keeps */
for (const t of [true, false]) {
  for (const key of Object.keys(mem)) delete mem[key];
  sent.length = 0; signedIn = true; taken = t;
  api.configure({ load });
  const scn = await api.getScenario();
  const { st } = await playOne(scn, 'daily', 99);
  await api.finishOuting(st.outingId);
  await api.finishOuting(st.outingId);
  await new Promise(r => setTimeout(r, 20));
  const stats = sent.filter(x => x[0] === 'stats');
  if (t) check('signed in: the daily\'s line is sent once, the result\'s own', stats.length === 1 && PG.valid(stats[0][1].stats, st.log.length) && stats[0][1].day === scn.day, JSON.stringify(sent.map(x => x[0])));
  else check('a post that lost the race sends no line', stats.length === 0, JSON.stringify(sent.map(x => x[0])));
}

console.log(`${oks} ok, ${fails} failed`);
process.exit(fails ? 1 : 0);
