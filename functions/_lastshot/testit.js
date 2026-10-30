/* Test it: a play against every defense, with no picture.
 *
 *   testPlay(sc, play, { runs }) -> { key, rows: { switch: { n, w, made, avgShotAt }, ... }, all: { n, w } }
 *
 * Each scheme gets `runs` possessions (40 by default), seeds 1 to runs mixed
 * with the play's key, and simulate(..., { scheme }) forces the scheme after
 * rolling it, so every run is exactly a run the game could have dealt. The
 * same play always tests the same. The result carries the play's key; when
 * the play or its situation changes, the stored result is stale.
 *
 * DEFENSES is the list Test it walks. Zones (2-3, 1-3-1, 3-2, match-up) join
 * it in the next PR (the owner's call, 2026-10-30): each is one more key the
 * sim understands, and one more row here. */
import { simulate } from './sim.js';
import { SCHEMES, SCHEME_NAMES } from './scenario.js';
import { playKey, situationKey } from './playbook.js';
import { hashStr } from './rng.js';

export const DEFENSES = SCHEMES;
export const DEFENSE_NAMES = SCHEME_NAMES;
export const RUNS = 40;

export const testKey = (sc, play, sit) => playKey(play) + '@' + situationKey(sc, sit);

export function testPlay(sc, play, opt = {}) {
  const runs = opt.runs || RUNS, base = hashStr(playKey(play));
  const rows = {};
  let N = 0, W = 0;
  for (const d of DEFENSES) {
    const r = { n: 0, w: 0, made: 0, shotAtSum: 0, shots: 0 };
    for (let i = 1; i <= runs; i++) {
      const res = simulate(sc, play, (base ^ Math.imul(i, 0x9E3779B1)) >>> 0, { scheme: d });
      r.n++; if (res.outcome === 'win') r.w++;
      if (res.shot) { r.shots++; r.shotAtSum += res.shotAt; if (res.shot.made) r.made++; }
    }
    rows[d] = { n: r.n, w: r.w, made: r.made, avgShotAt: r.shots ? Math.round(r.shotAtSum / r.shots * 10) / 10 : null };
    N += r.n; W += r.w;
  }
  return { rows, all: { n: N, w: W }, runs };
}
