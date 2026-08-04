/* Run The Setlist — scoring v2.
 *
 * THE single source of truth for the numbers. Nothing else in the game may
 * hardcode a scoring constant; import from here. (If a server-side scorer is
 * ever added, it ports this file verbatim rather than re-deriving it.)
 *
 * Per song:
 *   versionScore = round(base * v)
 *   placed       = round(versionScore * placementMult * SCALE)
 *   rarity       = round(rarityBase(gap) * (base/30) * SCALE)
 *   subtotal     = placed + rarity
 *
 * Total = sum(subtotal) + sum(segue bonuses) + completion bonus.
 */

export const SCALE = 1.3;
export const SEGUE_COEF = 0.25;
export const COMPLETION_BONUS = 30;
export const NUM_ROUNDS = 8;

/* Neutral crowd rating used when the CSV leaves crowd_rating blank. elgoose
   has no song ratings, so for Goose this is every row — see DATA_CONTRACT.md. */
export const NEUTRAL_BASE = 30;

/* Version multiplier: a jamchart take and a long take are both worth more. */
export const V_JAMCHART = 0.3;
export const V_LEN_20MIN = 0.2;   // >= 1200s
export const V_LEN_15MIN = 0.1;   // >= 900s
export const LEN_20MIN = 1200;
export const LEN_15MIN = 900;

/* Placement multipliers. */
export const MULT_PERFECT = 1.15;  // song carries every tag the slot wants
export const MULT_PARTIAL = 1.08;  // song carries some of them
export const MULT_NEUTRAL = 0.92;  // no signal either way
export const MULT_CLASH   = 0.65;  // actively wrong for the slot

/* The 8 slots, in draft order, with the tags each one wants. */
export const SLOTS = [
  { i: 0, set: '1', group: 'Set I',  name: 'Opener',   label: 'Set I · Opener',   tags: ['opener'] },
  { i: 1, set: '1', group: 'Set I',  name: 'Mid',      label: 'Set I · Mid',      tags: [] },
  { i: 2, set: '1', group: 'Set I',  name: 'Closer',   label: 'Set I · Closer',   tags: ['closer', 'jam'] },
  { i: 3, set: '2', group: 'Set II', name: 'Opener',   label: 'Set II · Opener',  tags: ['opener', 'jam'] },
  { i: 4, set: '2', group: 'Set II', name: 'Peak',     label: 'Set II · Peak',    tags: ['peak'] },
  { i: 5, set: '2', group: 'Set II', name: 'Breather', label: 'Set II · Breather',tags: ['ballad'] },
  { i: 6, set: '2', group: 'Set II', name: 'Closer',   label: 'Set II · Closer',  tags: ['closer', 'peak'] },
  { i: 7, set: 'E', group: 'Encore', name: 'Encore',   label: 'Encore',           tags: ['encore'] },
];

/* Slots that want energy — a ballad dropped in one of these is a hard clash. */
export const ENERGY_SLOTS = [2, 3, 4, 6];
/* The one slot that wants calm — a jam or peak song here is a hard clash. */
export const BREATHER_SLOT = 5;

/* Rarity tiers, keyed on shows-since-last-played. */
export const RARITY_TIERS = [
  { gap: 100, points: 50 },
  { gap: 50,  points: 35 },
  { gap: 20,  points: 20 },
  { gap: 8,   points: 10 },
];

// ── helpers ──────────────────────────────────────────────────────────────────

export function tagsOf(perf) {
  return String(perf && perf.tags || '').split('|').filter(Boolean);
}

export function isJamchart(perf) {
  const v = perf && perf.is_jamchart;
  return v === 'true' || v === '1' || v === true || v === 1;
}

export function baseOf(perf) {
  const r = perf && perf.crowd_rating;
  return (r === undefined || r === null || r === '') ? NEUTRAL_BASE : Number(r);
}

// ── the model ────────────────────────────────────────────────────────────────

/** Version multiplier for one performance: jamchart status + how long it ran. */
export function versionMult(perf) {
  const len = Number(perf && perf.length_sec) || 0;
  let v = 1;
  if (isJamchart(perf)) v += V_JAMCHART;
  if (len >= LEN_20MIN) v += V_LEN_20MIN;
  else if (len >= LEN_15MIN) v += V_LEN_15MIN;
  return v;
}

/** What this take of the song is worth before placement and rarity. */
export function versionScore(perf) {
  return Math.round(baseOf(perf) * versionMult(perf));
}

/** How well a song's tags suit a slot: 'great' | 'ok' | 'neutral' | 'bad'. */
export function slotFit(tags, slotIdx) {
  const t = Array.isArray(tags) ? tags : String(tags || '').split('|').filter(Boolean);
  const want = (SLOTS[slotIdx] || {}).tags || [];
  if (!want.length) return 'neutral';
  if (want.every(x => t.includes(x))) return 'great';
  if (t.some(x => want.includes(x))) return 'ok';
  if (t.includes('ballad') && ENERGY_SLOTS.includes(slotIdx)) return 'bad';
  if ((t.includes('jam') || t.includes('peak')) && slotIdx === BREATHER_SLOT) return 'bad';
  return 'neutral';
}

export function placementMult(tags, slotIdx) {
  switch (slotFit(tags, slotIdx)) {
    case 'great': return MULT_PERFECT;
    case 'ok':    return MULT_PARTIAL;
    case 'bad':   return MULT_CLASH;
    default:      return MULT_NEUTRAL;
  }
}

export function rarityBase(gap) {
  const g = Number(gap) || 0;
  for (const t of RARITY_TIERS) if (g >= t.gap) return t.points;
  return 0;
}

/** Full breakdown for one performance in one slot. */
export function scorePerf(perf, slotIdx) {
  const base = baseOf(perf);
  const vs = versionScore(perf);
  const placed = Math.round(vs * placementMult(perf.tags, slotIdx) * SCALE);
  const rarity = Math.round(rarityBase(perf.show_gap) * (base / NEUTRAL_BASE) * SCALE);
  return { versionScore: vs, placed, rarity, subtotal: placed + rarity };
}

/** Bonus for two songs that really do segue into each other on record. */
export function segueBonus(a, b) {
  return Math.round(SEGUE_COEF * (versionScore(a) + versionScore(b)) * SCALE);
}

export function segueKey(a, b) {
  return `${a.song_id}|${b.song_id}`;
}

/** True when the pair sitting in slots i / i+1 is a canonical segue. */
export function hasSegue(slots, i, segues) {
  const a = slots[i], b = slots[i + 1];
  return !!(a && b && segues && segues.has(segueKey(a, b)));
}

/**
 * Score a full (or partial) setlist.
 * @param {Array} slots  length-8 array of performance rows or null
 * @param {Set}   segues canonical "songIdA|songIdB" pairs
 * @returns {{total:number, songs:Array, segues:Array, completion:number}}
 */
export function scoreSetlist(slots, segues) {
  const songs = [];
  let total = 0;

  for (let i = 0; i < NUM_ROUNDS; i++) {
    if (!slots[i]) { songs.push(null); continue; }
    const s = scorePerf(slots[i], i);
    songs.push(s);
    total += s.subtotal;
  }

  const segueHits = [];
  for (let i = 0; i < NUM_ROUNDS - 1; i++) {
    if (!hasSegue(slots, i, segues)) continue;
    const points = segueBonus(slots[i], slots[i + 1]);
    segueHits.push({ from: i, to: i + 1, points });
    total += points;
  }

  const completion = slots.filter(Boolean).length === NUM_ROUNDS ? COMPLETION_BONUS : 0;
  total += completion;

  return { total, songs, segues: segueHits, completion };
}

/** Convenience: just the number. */
export function calcTotal(slots, segues) {
  return scoreSetlist(slots, segues).total;
}
