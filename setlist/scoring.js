/* Run The Setlist — scoring v3.
 *
 * THE single source of truth for the numbers. Nothing else in the game may
 * hardcode a scoring constant; import from here. (If a server-side scorer is
 * ever added, it ports this file verbatim rather than re-deriving it.)
 *
 * The player should be able to say, without reading this file, why they scored
 * what they scored. So the model is four questions, and the result screen shows
 * them back in the same order:
 *
 *   SONG       Is this a song people treasure?          → base, from crowd_rating
 *   VERSION    Was this a special night for it?         → multiplier
 *   PLACEMENT  Does it belong in that slot?             → multiplier
 *   FLOW       Do the eight work as one setlist?        → whole-setlist bonus
 *
 *   perSong = round(base * versionMult * placementMult)
 *   total   = sum(perSong) + flow + completion
 *
 * WHAT CHANGED FROM v2, AND WHY
 *
 * v2 measured a 4000-game simulation like this: placement 57%, rarity 36%,
 * segues 1.5%. Three things were wrong with that.
 *
 *   - Every song scored identically. base fell back to a flat 30 for all of
 *     them because elgoose publishes no ratings, so "which song" — the whole
 *     point of the game — was worth nothing. crowd_rating now carries a
 *     jamchart-derived esteem rating (see ingest_band.mjs).
 *   - Rarity was a third of the score. Show gap is real, but it is a fact about
 *     the band's routing, not a judgement the player makes, and it fired in 80%
 *     of slots. It is now one term inside VERSION rather than its own pillar.
 *   - Segues were 1.5%. The most musical thing in the game was noise. They are
 *     now part of FLOW, and they only count inside a set, because a segue
 *     across a set break is not a thing that happens.
 */

export const NUM_ROUNDS = 8;
export const COMPLETION_BONUS = 40;

/* Blank crowd_rating → an ordinary song. Matches NEUTRAL_ESTEEM in the
   ingester, which is what writes the column. */
export const NEUTRAL_BASE = 30;

// ── VERSION ──────────────────────────────────────────────────────────────────
/* What made this particular take worth more than the song's usual outing.
   Additive so a legendary version reads as a stack of reasons, not one number. */
export const V_RECOMMENDED = 0.55;  // jamchart curators flagged it a standout
export const V_JAMCHART    = 0.30;  // written up in the jamcharts at all
export const V_LEN_20MIN   = 0.25;
export const V_LEN_15MIN   = 0.12;
export const LEN_20MIN = 1200;
export const LEN_15MIN = 900;

/* Rarity, as a version term. A song the band had shelved for 100 shows is a
   special night for it — the same kind of claim as "this one ran 22 minutes". */
export const RARITY_TIERS = [
  { gap: 100, mult: 0.40 },
  { gap: 50,  mult: 0.25 },
  { gap: 20,  mult: 0.15 },
  { gap: 8,   mult: 0.07 },
];

// ── PLACEMENT ────────────────────────────────────────────────────────────────
/* Wider than v2's 0.65–1.15. Placement is the decision the player actually
   makes every round, so it has to be able to swing the score. */
export const MULT_PERFECT = 1.30;  // carries every tag the slot wants
export const MULT_PARTIAL = 1.12;  // carries some of them
export const MULT_NEUTRAL = 0.90;  // no signal either way
export const MULT_CLASH   = 0.55;  // actively wrong for the slot

/* The 8 slots, in draft order, with the tags each wants and the energy the slot
   is asking for (see ENERGY below). */
export const SLOTS = [
  { i: 0, set: '1', group: 'Set I',  name: 'Opener',   label: 'Set I · Opener',    tags: ['opener'],          want: 3 },
  { i: 1, set: '1', group: 'Set I',  name: 'Mid',      label: 'Set I · Mid',       tags: [],                  want: 3 },
  { i: 2, set: '1', group: 'Set I',  name: 'Closer',   label: 'Set I · Closer',    tags: ['closer', 'jam'],   want: 4 },
  { i: 3, set: '2', group: 'Set II', name: 'Opener',   label: 'Set II · Opener',   tags: ['opener', 'jam'],   want: 4 },
  { i: 4, set: '2', group: 'Set II', name: 'Peak',     label: 'Set II · Peak',     tags: ['peak'],            want: 5 },
  { i: 5, set: '2', group: 'Set II', name: 'Breather', label: 'Set II · Breather', tags: ['ballad'],          want: 1 },
  { i: 6, set: '2', group: 'Set II', name: 'Closer',   label: 'Set II · Closer',   tags: ['closer', 'peak'],  want: 5 },
  { i: 7, set: 'E', group: 'Encore', name: 'Encore',   label: 'Encore',            tags: ['encore'],          want: 3 },
];

export const ENERGY_SLOTS = [2, 3, 4, 6];
export const BREATHER_SLOT = 5;

// ── FLOW ─────────────────────────────────────────────────────────────────────
/* A setlist is not eight independent picks, and this is the part of the score
   that knows that. Three things a real setlist does: it segues, it has a shape,
   and it does not play the same card eight times. */

/* A true segue is worth a lot — it is the hardest thing to land, because the
   pair has to be one the band has actually played back to back. */
export const SEGUE_POINTS = 45;

/* Energy, 1 (quietest) to 5 (biggest), inferred from the same tags the slots
   ask for. Used only for the arc — placement still runs off tags. */
export const ENERGY = { ballad: 1, opener: 3, closer: 4, jam: 4, peak: 5, encore: 3 };
export const ENERGY_DEFAULT = 3;

/* Arc: how closely the setlist's energy follows what the slots asked for.
   Perfect shape pays ARC_MAX; every point of deviation costs ARC_PENALTY. */
export const ARC_MAX = 60;
export const ARC_PENALTY = 5;

/* Variety: eight jams in a row is not a setlist. Pays when the picks span a
   range of roles, taxes when one tag dominates. */
export const VARIETY_MAX = 30;
export const VARIETY_MIN_ROLES = 4;   // distinct tags needed for full marks

// ── helpers ──────────────────────────────────────────────────────────────────

export function tagsOf(perf) {
  return String(perf && perf.tags || '').split('|').filter(Boolean);
}

const flag = v => v === 'true' || v === '1' || v === true || v === 1;
export function isJamchart(perf) { return flag(perf && perf.is_jamchart); }
export function isRecommended(perf) { return flag(perf && perf.is_recommended); }

export function baseOf(perf) {
  const r = perf && perf.crowd_rating;
  return (r === undefined || r === null || r === '') ? NEUTRAL_BASE : Number(r);
}

export function rarityMult(gap) {
  const g = Number(gap) || 0;
  for (const t of RARITY_TIERS) if (g >= t.gap) return t.mult;
  return 0;
}

// ── the model ────────────────────────────────────────────────────────────────

/**
 * Version multiplier, plus the reasons behind it so the result screen can show
 * its working rather than a bare number.
 * @returns {{mult:number, reasons:Array<{label:string, mult:number}>}}
 */
export function versionParts(perf) {
  const reasons = [];
  if (isRecommended(perf)) reasons.push({ label: 'Recommended version', mult: V_RECOMMENDED });
  else if (isJamchart(perf)) reasons.push({ label: 'Jamchart version', mult: V_JAMCHART });

  const len = Number(perf && perf.length_sec) || 0;
  if (len >= LEN_20MIN) reasons.push({ label: '20+ minutes', mult: V_LEN_20MIN });
  else if (len >= LEN_15MIN) reasons.push({ label: '15+ minutes', mult: V_LEN_15MIN });

  const rm = rarityMult(perf && perf.show_gap);
  if (rm) reasons.push({ label: `${Number(perf.show_gap)}-show gap`, mult: rm });

  return { mult: 1 + reasons.reduce((a, r) => a + r.mult, 0), reasons };
}

export function versionMult(perf) { return versionParts(perf).mult; }

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

/** Loudest energy any of a song's tags implies. */
export function energyOf(perf) {
  const t = tagsOf(perf);
  if (!t.length) return ENERGY_DEFAULT;
  return Math.max(...t.map(x => ENERGY[x] === undefined ? ENERGY_DEFAULT : ENERGY[x]));
}

/** Full breakdown for one performance in one slot. */
export function scorePerf(perf, slotIdx) {
  const base = baseOf(perf);
  const v = versionParts(perf);
  const fit = slotFit(perf && perf.tags, slotIdx);
  const pm = placementMult(perf && perf.tags, slotIdx);
  const subtotal = Math.round(base * v.mult * pm);
  return {
    base,
    versionMult: v.mult,
    versionReasons: v.reasons,
    fit,
    placementMult: pm,
    subtotal,
  };
}

export function segueKey(a, b) { return `${a.song_id}|${b.song_id}`; }

/** True when slots i / i+1 hold a canonical segue AND sit in the same set. */
export function hasSegue(slots, i, segues) {
  const a = slots[i], b = slots[i + 1];
  if (!a || !b || !segues) return false;
  if (SLOTS[i].set !== SLOTS[i + 1].set) return false;   // no segue across a set break
  return segues.has(segueKey(a, b));
}

/**
 * How well the eight work together, independent of what each is worth alone.
 * @returns {{total:number, segues:Array, arc:number, variety:number, roles:Array}}
 */
export function scoreFlow(slots, segues) {
  const filled = slots.filter(Boolean);

  const segueHits = [];
  for (let i = 0; i < NUM_ROUNDS - 1; i++) {
    if (hasSegue(slots, i, segues)) segueHits.push({ from: i, to: i + 1, points: SEGUE_POINTS });
  }

  // Arc — deviation from the shape the slots asked for, averaged over the
  // slots actually filled so a partial setlist is not punished for being short.
  let arc = 0;
  if (filled.length) {
    let dev = 0;
    slots.forEach((p, i) => { if (p) dev += Math.abs(energyOf(p) - SLOTS[i].want); });
    arc = Math.max(0, Math.round(ARC_MAX * (filled.length / NUM_ROUNDS) - dev * ARC_PENALTY));
  }

  // Variety — how many distinct roles the setlist covers.
  const roles = [...new Set(filled.flatMap(tagsOf))];
  const variety = Math.round(VARIETY_MAX * Math.min(1, roles.length / VARIETY_MIN_ROLES)
    * (filled.length / NUM_ROUNDS));

  return {
    total: segueHits.reduce((a, s) => a + s.points, 0) + arc + variety,
    segues: segueHits,
    arc,
    variety,
    roles,
  };
}

/**
 * Score a full (or partial) setlist.
 * @param {Array} slots  length-8 array of performance rows or null
 * @param {Set}   segues canonical "songIdA|songIdB" pairs
 */
export function scoreSetlist(slots, segues) {
  const songs = [];
  let songTotal = 0;

  for (let i = 0; i < NUM_ROUNDS; i++) {
    if (!slots[i]) { songs.push(null); continue; }
    const s = scorePerf(slots[i], i);
    songs.push(s);
    songTotal += s.subtotal;
  }

  const flow = scoreFlow(slots, segues);
  const completion = slots.filter(Boolean).length === NUM_ROUNDS ? COMPLETION_BONUS : 0;

  return {
    total: songTotal + flow.total + completion,
    songs,
    songTotal,
    flow,
    segues: flow.segues,   // kept for callers that only want the segue list
    completion,
  };
}

/** Convenience: just the number. */
export function calcTotal(slots, segues) {
  return scoreSetlist(slots, segues).total;
}
