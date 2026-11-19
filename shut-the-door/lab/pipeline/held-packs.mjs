/* The packs a lab ceiling is held on, one pack at a time, and the rate guard on the packs that came later.
 *
 * Until 2026-11-18 the ceilings of check-gait, check-camera and check-jolt were totals of bad plays over
 * every pack. Thirteen new situations (site PR #1053) added about 77,000 plays, so a total could only be
 * met by raising it, and a raised total would let an old pack get worse unseen. So each ceiling is now
 * held per pack (pack-ceilings.json):
 *
 *   FIRST_THIRTY  the thirty packs on main before them. Each one's ceiling is its own count as main
 *                 measured it (2026-11-18, main 34c15c9e), so their sum is at or under the old total and
 *                 no old pack's allowance is looser than it was.
 *   a later pack  its ceiling is its own count, measured the day it came in, and it must also pass the
 *                 rate guard: on its own ceilings, its bad plays per play, for each metric, no worse than
 *                 the worst of the first thirty for that metric (each old pack's ceiling over its plays,
 *                 the highest of them; the coordinator, 2026-11-18: a guard on the pooled rate fails the old
 *                 packs about as often as the new, so it cannot tell good motion from bad), with room for
 *                 chance: its count at most that rate times its plays, rounded up, plus CHANCE (2) plays
 *                 (the owner, 2026-11-18). A metric none
 *                 of the first thirty ever had is allowed at one play, and listed. A pack that fails it
 *                 fails the check: it is reported by pack and metric, and nothing is raised to let it pass.
 *
 * Every ceiling still only comes down. A pack with no row for a metric is held to none of it.
 */
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

export const FIRST_THIRTY = [
  'std-1988-ws1-eckersley', 'std-2001-ws7-rivera', 'std-2005-nlcs5-lidge', 'std-2007-ws4-papelbon', 'std-2008-alcs7-price',
  'std-2008-krod-sea', 'std-2008-ws5-lidge', 'std-2009-alcs6-rivera', 'std-2010-hoffman-stl', 'std-2010-ws5-wilson',
  'std-2011-rivera-min', 'std-2011-ws6-feliz', 'std-2012-ws4-romo', 'std-2013-alcs6-uehara', 'std-2014-ws7-bumgarner',
  'std-2015-alcs6-davis', 'std-2016-ws7-chapman', 'std-2017-ws2-jansen', 'std-2018-alcs4-kimbrel', 'std-2019-nlwc-hader',
  'std-2021-nlcs6-smith', 'std-2022-ws6-pressly', 'std-2023-hader-stl', 'std-2023-williams-sd', 'std-2023-ws1-sewald',
  'std-2024-ws5-buehler', 'std-2025-diaz-cin', 'std-2025-scott-kc', 'std-2025-ws6-glasnow', 'std-2025-ws7-yamamoto',
];
const OLD = new Set(FIRST_THIRTY);
/** The rate guard's room for chance, in plays (the owner, 2026-11-18). */
export const CHANCE = 2;
/** A pack's id from its file name or id. */
export const packId = (f) => String(f).replace(/\.json$/, '');
export const isFirstThirty = (f) => OLD.has(packId(f));

/** inplayCases' cases in the held order: the first thirty's as main had them (so their case numbers, and
    a stride's picks of them, are main's), then the later packs' in theirs. */
export const heldOrder = (cases) => [...cases.filter((c) => isFirstThirty(c.pack)), ...cases.filter((c) => !isFirstThirty(c.pack))];

const FILE = fileURLToPath(new URL('./pack-ceilings.json', import.meta.url));
/** { check: { plays: { pack: n }, ceiling: { pack: { metric: n } } } } */
export const PACK_CEILINGS = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : {};

/**
 * Hold one check's counts per pack.
 *   check    'gait' | 'camera' | 'jolt' (its entry in pack-ceilings.json)
 *   count    { pack: { metric: plays with one } } as measured
 *   plays    { pack: plays measured }
 *   metrics  every metric the check holds (a pack with no row for one is held to 0)
 *   skip     (metric) => true for a metric that is not held (camera's away)
 * Returns { fails, lines }: lines to print, fails the number of plays over (and of rate guard misses).
 */
export function holdByPack({ check, count, plays, metrics, skip = () => false }) {
  const rec = PACK_CEILINGS[check] || { plays: {}, ceiling: {} };
  const lines = [];
  let fails = 0;
  const packs = [...new Set([...Object.keys(rec.ceiling), ...Object.keys(plays)])].sort();
  for (const p of packs) {
    if (!(p in plays)) { lines.push(`  FAIL ${p}: has a ceiling but no plays were measured`); fails++; continue; }
    if (!(p in rec.ceiling)) { lines.push(`  FAIL ${p}: no ceiling recorded (pack-ceilings.json)`); fails++; continue; }
    if (rec.plays[p] !== plays[p]) { lines.push(`  FAIL ${p}: ${plays[p]} plays, its ceilings were measured on ${rec.plays[p]}`); fails++; continue; }
    const over = [];
    for (const m of metrics) {
      if (skip(m)) continue;
      const got = (count[p] && count[p][m]) || 0, cap = rec.ceiling[p][m] || 0;
      if (got > cap) { over.push(`${m} ${got} (ceiling ${cap})`); fails += got - cap; }
    }
    if (over.length) lines.push(`  FAIL ${p.padEnd(26)} ${over.join(', ')}`);
  }
  // the rate guard: a later pack's ceiling no worse per play than the worst of the first thirty for that
  // metric (a run over its ceiling has already failed above, and a run at or under it is at or under its
  // rate), with room for chance: at most the worst rate times his plays, rounded up, plus CHANCE plays (the
  // owner, 2026-11-18). A metric none of the first thirty ever had: one play is allowed, and listed
  const worst = {}, worstOf = {};
  for (const m of metrics) {
    worst[m] = 0; worstOf[m] = null;
    for (const p of FIRST_THIRTY) {
      const n = rec.plays[p] || 0, c = (rec.ceiling[p] && rec.ceiling[p][m]) || 0;
      if (n && c / n > worst[m]) { worst[m] = c / n; worstOf[m] = p; }
    }
  }
  const guard = [], allowed = [];
  for (const p of packs) {
    if (isFirstThirty(p) || !(p in rec.ceiling)) continue;
    for (const m of metrics) {
      if (skip(m)) continue;
      const n = rec.plays[p] || 0, c = rec.ceiling[p][m] || 0;
      if (!n || !c) continue;
      if (worstOf[m] == null) {
        if (c === 1) allowed.push(`  note rate ${p.padEnd(26)} ${m}: 1 of ${n} plays, a row none of the first thirty had (one play allowed)`);
        else guard.push(`  FAIL rate ${p.padEnd(26)} ${m}: ${c} of ${n} plays, a row none of the first thirty had (one play allowed)`);
      } else if (c > Math.ceil(worst[m] * n - 1e-9) + CHANCE) {
        guard.push(`  FAIL rate ${p.padEnd(26)} ${m}: ${c} of ${n} plays (${(c / n * 100).toFixed(3)}%), allowed ${Math.ceil(worst[m] * n - 1e-9) + CHANCE} (the first thirty's worst ${(worst[m] * 100).toFixed(3)}%, ${worstOf[m]}, plus ${CHANCE})`);
      }
    }
  }
  fails += guard.length;
  const nOld = packs.filter(isFirstThirty).length;
  lines.push(`  per pack: ${packs.length} packs (${nOld} of the first thirty, ${packs.length - nOld} later), ${lines.filter((l) => l.includes('FAIL')).length} over a ceiling`);
  lines.push(...allowed, ...guard, `  rate guard: ${guard.length ? guard.length + ' over the worst of the first thirty' : 'every later pack at or under the worst of the first thirty'}, per metric${allowed.length ? `; ${allowed.length} new row${allowed.length > 1 ? 's' : ''} at one play` : ''}`);
  return { fails, lines };
}

/** The ceilings a run measured, for pack-ceilings.json (printed under PACK_CEILING=1). */
export function measured(count, plays, metrics, skip = () => false) {
  const ceiling = {};
  for (const p of Object.keys(plays).sort()) { ceiling[p] = {}; for (const m of [...metrics].sort()) if (!skip(m) && count[p] && count[p][m]) ceiling[p][m] = count[p][m]; }
  return { plays: Object.fromEntries(Object.entries(plays).sort()), ceiling };
}
