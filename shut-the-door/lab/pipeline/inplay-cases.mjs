/* Every ball in play the packs can produce, as the in-play checks plan them (check-inplay.mjs, and
 * check-catch.mjs on the posed bodies). Pure: reads data/packs, plans nothing.
 *
 *   for (const c of inplayCases({ all })) c.pack, c.key, c.label, c.st, c.pr, c.hand, c.bases0, c.id
 *
 * Each in-play outcome key (single ... out_popup) has real batted balls (the pack's pitches the library
 * points at) and advancement rows for every base and out state (each row a label and the runners'
 * moves). By default every batted ball is planned once (paired with a row of its kind in turn), and
 * every row is planned with a spread of batted balls (the softest, the hardest, the extremes of
 * angle and spray, and a few between), so each ball and each row is covered. all: every ball with
 * every row of its kind (slow).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const PACKS = path.resolve(HERE, '..', '..', 'data', 'packs');
export const KEYS_IP = ['single', 'double', 'triple', 'home_run', 'error', 'out_ground', 'out_line', 'out_fly', 'out_popup'];

export function* inplayCases({ all = false, packs = null } = {}) {
  for (const f of fs.readdirSync(PACKS).filter((x) => x.endsWith('.json')).sort()) {
    if (packs && !packs.includes(f)) continue;
    const pack = JSON.parse(fs.readFileSync(path.join(PACKS, f), 'utf8'));
    const keys = pack.keys, P = pack.pitches, bats = pack.scenario.batters;
    // the real batted balls of each key, with the hand of a hitter who drew it
    const balls = {};
    pack.library.forEach((lib, bi) => {
      for (const e of Object.values(lib)) for (const row of e.x) row.forEach((ref, k) => {
        if (ref == null || ref < 0 || !KEYS_IP.includes(keys[k])) return;
        const i = Math.floor(ref / 3);
        (balls[keys[k]] ||= new Map()).set(i, bats[bi % bats.length].bats);
      });
    });
    for (const key of KEYS_IP) {
      // the rows, once per (bases before, label, moves): the outs before change nothing on the field
      const rows = [], seen = new Set();
      for (const [st, rr] of Object.entries(pack.advance[key] || {})) for (const r of rr) {
        const k = (+st & 7) + '|' + r[4] + '|' + JSON.stringify(r[5]);
        if (!all && seen.has(k)) continue;
        seen.add(k); rows.push({ st: +st, r });
      }
      const bl = [...(balls[key] || new Map()).entries()];
      if (!rows.length || !bl.length) continue;
      const pairs = [];
      if (all) { for (const b of bl) for (const r of rows) pairs.push([b, r]); }
      else {
        bl.forEach((b, i) => pairs.push([b, rows[i % rows.length]]));
        const spread = spreadOf(bl, P);
        for (const r of rows) for (const b of spread) pairs.push([b, r]);
      }
      for (const [[pi, hand], { st, r }] of pairs) {
        const [, nb, runs, oa, label, moves] = r;
        const outs0 = st >> 3, bases0 = st & 7;
        const pt = P[pi];
        const pr = {
          result: 'in_play', inPlay: { bb: pt[3], ev: pt[4], la: pt[5], spray: pt[6], result: label || 'out' },
          runnerMoves: (moves || []).map(([from, to]) => ({ from, to })), bases: nb, outs: Math.min(3, outs0 + oa), runs, drawn: { id: pt[0] },
        };
        yield { pack: f, key, label, st, moves, ball: pt.slice(3), pr, hand, bases0, id: pt[0] };
      }
    }
  }
}

function spreadOf(bl, P) {
  const pick = new Set();
  const by = (fn) => [...bl].sort((a, b) => fn(P[a[0]]) - fn(P[b[0]]));
  for (const fn of [(p) => p[4] ?? 0, (p) => p[5] ?? 0, (p) => p[6] ?? 0]) {
    const s = by(fn);
    for (const q of [0, 1]) pick.add(s[Math.min(s.length - 1, Math.floor(q * (s.length - 1)))]);
  }
  pick.add(bl[Math.floor(bl.length / 2)]);
  const nul = bl.find((b) => P[b[0]][4] == null || P[b[0]][5] == null || P[b[0]][6] == null);
  if (nul) pick.add(nul);
  return [...pick];
}
