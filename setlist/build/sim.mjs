/* Segue: play whole games with simple strategies and report how the scoring treats them.
 *
 *   node setlist/build/sim.mjs [games=200] [--best]
 *
 * Every game draws shows the way the page does (no repeats, MIN_SONGS_PER_SHOW), and
 * each strategy plays the SAME draw sequence, so differences between rows are the
 * strategy and not the luck. --best also runs bestPossible() per game and reports
 * each strategy as a percentage of that ceiling, which is what pct_of_best stores.
 *
 * What to read: the gap between Random and Smart is how much skill is worth. The
 * spread of one strategy across draws is how much luck is worth.
 */
import { readFileSync } from 'node:fs';
import { loadBand } from '../dataLoader.js';
import {
  SETS, MAX_ROUNDS, canPlace, wouldStrand, danglingSegue, closesSandwich,
  setFull, scorePerf, roleAt, scoreShow, bestPossible, lenOf,
} from '../scoring.js';

const N = Number(process.argv.find(a => /^\d+$/.test(a)) || 200);
const WITH_BEST = process.argv.includes('--best');
const data = loadBand(readFileSync(new URL('../data/goose.csv', import.meta.url), 'utf8'));
const pool = data.shows.filter(s => s.songs.length >= 8 && s.songs.every(p => lenOf(p) > 0));

function rng(a){ return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

function legal(st, show){
  const si = st.closed.findIndex((c, i) => !c && !setFull(st.sets, i));
  if (si < 0) return { si, songs: [] };
  const taken = new Set(st.sets.flat().map(p => p.song_id));
  return { si, songs: show.songs.filter(p =>
    (!taken.has(p.song_id) || closesSandwich(st.sets[si], p, data.segues))
    && canPlace(st.sets, si, p, st.closed, [0, 0, 0])
    && !wouldStrand(st.sets, si, p, st.closed, [0, 0, 0])) };
}
const total = st => scoreShow(st.sets, data.segues, [0, 0, 0], data.segueCounts, data.suites).total;

const STRATS = {
  Random: (st, songs, r) => songs[Math.floor(r() * songs.length)],
  Longest: (st, songs) => songs.slice().sort((a, b) => lenOf(b) - lenOf(a))[0],
  'Best song': (st, songs, r, si) => {
    const role = roleAt(si, st.sets[si].length, st.sets[si].length + 1);
    return songs.slice().sort((a, b) => scorePerf(b, role).subtotal - scorePerf(a, role).subtotal)[0];
  },
  // One step of lookahead on the real total: the best a careful player does without planning.
  Smart: (st, songs, r, si) => {
    let best = null, bv = -Infinity;
    for (const p of songs){
      st.sets[si].push(p); const v = total(st); st.sets[si].pop();
      if (v > bv){ bv = v; best = p; }
    }
    return best;
  },
};

function play(strat, order, seed){
  const r = rng(seed);
  const st = { sets: [[], [], []], closed: [false, false, false] };
  const drafted = [];
  for (let round = 0; round < MAX_ROUNDS && round < order.length; round++){
    const show = order[round];
    let { si, songs } = legal(st, show);
    // Nothing fits: close the set and try the next one with the same show, like a player would.
    while (si >= 0 && !songs.length){
      if (danglingSegue(st.sets, si) && si < 2){ /* forfeits it */ }
      st.closed[si] = true;
      ({ si, songs } = legal(st, show));
    }
    if (si < 0) break;
    const p = STRATS[strat](st, songs, r, si);
    st.sets[si].push(p);
    drafted.push({ show, perf: p, si });
    if (setFull(st.sets, si) && !danglingSegue(st.sets, si)) st.closed[si] = true;
  }
  const res = scoreShow(st.sets, data.segues, [0, 0, 0], data.segueCounts, data.suites);
  return { res, drafted };
}

const out = Object.fromEntries(Object.keys(STRATS).map(k => [k, { tot: [], pct: [], parts: [] }]));
const master = rng(12345);
for (let g = 0; g < N; g++){
  const order = pool.slice().sort(() => master() - .5).slice(0, MAX_ROUNDS);
  for (const k of Object.keys(STRATS)){
    const { res, drafted } = play(k, order, g * 7 + 1);
    out[k].tot.push(res.total);
    out[k].parts.push([res.songTotal, res.timeTotal, res.flowTotal, res.breadthTotal]);
    if (WITH_BEST){
      const b = bestPossible(drafted, data.segues, data.segueCounts, [0, 0, 0], data.suites);
      out[k].pct.push(b ? res.total / Math.max(res.total, b.total) : 1);
    }
  }
}
const mean = a => a.reduce((x, y) => x + y, 0) / (a.length || 1);
const sd = a => { const m = mean(a); return Math.sqrt(mean(a.map(x => (x - m) ** 2))); };
const q = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(p * (s.length - 1))]; };
console.log(`${N} games, same draws for every strategy\n`);
console.log('strategy     mean   sd   p10   p90   song  time  flow  breadth' + (WITH_BEST ? '   %best' : ''));
for (const [k, v] of Object.entries(out)){
  const parts = [0, 1, 2, 3].map(i => mean(v.parts.map(p => p[i])).toFixed(0).padStart(5));
  console.log(k.padEnd(11), mean(v.tot).toFixed(0).padStart(5), sd(v.tot).toFixed(0).padStart(4),
    String(q(v.tot, .1)).padStart(5), String(q(v.tot, .9)).padStart(5), parts.join(' '),
    WITH_BEST ? (100 * mean(v.pct)).toFixed(1).padStart(7) : '');
}
const pooled = Object.values(out).flatMap(v => v.tot);
console.log(`\npooled quartiles (the grade cuts): p25 ${q(pooled, .25)}  p75 ${q(pooled, .75)}`);
if (WITH_BEST) console.log(`random play, median % of best: ${(100 * q(out.Random.pct, .5)).toFixed(0)}`);
