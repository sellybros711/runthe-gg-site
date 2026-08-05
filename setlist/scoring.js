/* Run The Setlist — scoring v4.
 *
 * THE single source of truth for the numbers. Nothing else in the game may
 * hardcode a scoring constant; import from here.
 *
 * WHAT CHANGED FROM v3
 *
 * v3 gave the player eight named slots to fill. Real bands are not handed eight
 * slots — they are handed a stage and a curfew. v4 replaces the slots with time
 * budgets, so the decision every round becomes the one a band actually makes:
 * spend twenty-two minutes on this, or keep the room for what is coming.
 *
 * The budgets are the archive's own medians, not invented (see sets.mjs work in
 * DATA_CONTRACT.md): Goose's Set I runs 75:07 across 7 songs, Set II 70:13
 * across 5, and the encore 10:58 across 1.
 *
 * A song's ROLE is now positional rather than a slot you assign it to. The first
 * song of a set is the opener; the last is the closer; the encore is the encore.
 * You cannot know which song will close a set until you close it, which is the
 * point — you are committing without the whole picture, same as the band.
 *
 * Five things score, and the result screen shows them in this order:
 *
 *   SONG       is this a song people treasure?      base, from crowd_rating
 *   VERSION    was this a special night for it?     multiplier
 *   PLACEMENT  does it suit where it landed?        multiplier
 *   TIME       did you use the stage you were given?
 *   FLOW       do the picks work as one show?
 */

export const NEUTRAL_BASE = 30;

// ── the show ─────────────────────────────────────────────────────────────────
/* Budgets are the archive's medians. maxSongs caps a set so a run of four-minute
   songs cannot turn a set into a twelve-song sprint — real Set Is top out around
   eight. The encore also collects whatever time the two sets left behind. */
export const SETS = [
  { key: '1', label: 'Set I',  seconds: 75 * 60, maxSongs: 8 },
  { key: '2', label: 'Set II', seconds: 70 * 60, maxSongs: 8 },
  { key: 'E', label: 'Encore', seconds: 10 * 60, maxSongs: 3 },
];
export const ENCORE_INDEX = 2;

/* A hard cap so a pathological run of very short songs cannot make a session
   endless. Reached only if every set fills to maxSongs. */
export const MAX_ROUNDS = SETS.reduce((a, s) => a + s.maxSongs, 0);

// ── VERSION ──────────────────────────────────────────────────────────────────
export const V_RECOMMENDED = 0.55;
export const V_JAMCHART    = 0.30;
export const V_LEN_20MIN   = 0.25;
export const V_LEN_15MIN   = 0.12;
export const LEN_20MIN = 1200;
export const LEN_15MIN = 900;

export const RARITY_TIERS = [
  { gap: 100, mult: 0.40 },
  { gap: 50,  mult: 0.25 },
  { gap: 20,  mult: 0.15 },
  { gap: 8,   mult: 0.07 },
];

// ── PLACEMENT ────────────────────────────────────────────────────────────────
export const MULT_PERFECT = 1.30;
export const MULT_PARTIAL = 1.12;
export const MULT_NEUTRAL = 0.90;
export const MULT_CLASH   = 0.55;

/* What each position in a set is asking for. Resolved at scoring time, once the
   set is closed and it is known which song actually ended up where. */
export function roleAt(setIdx, songIdx, setLength) {
  if (SETS[setIdx].key === 'E') return { name: 'Encore', tags: ['encore'], energy: 3 };
  const last = songIdx === setLength - 1;
  if (songIdx === 0) return { name: 'Opener', tags: ['opener'], energy: 3 };
  if (last) return {
    name: 'Closer',
    tags: setIdx === 1 ? ['closer', 'peak'] : ['closer', 'jam'],
    energy: setIdx === 1 ? 5 : 4,
  };
  // Set II's back half is where a peak belongs; everywhere else is open ground,
  // and a ballad sitting mid-set is a breather rather than a mistake.
  const late = songIdx >= Math.ceil((setLength - 1) * 0.6);
  if (setIdx === 1 && late) return { name: 'Peak', tags: ['peak'], energy: 5 };
  return { name: 'Mid', tags: [], energy: 3 };
}

// ── TIME ─────────────────────────────────────────────────────────────────────
/* Points for using the stage you were given. Linear on purpose: "you used 82% of
   Set I, you get 82% of its time points" is a sentence a player can hold in their
   head, and it makes leaving fifteen minutes unplayed feel exactly as bad as it
   is. Overrunning is impossible — the game will not let a song that does not fit
   be placed — so there is no over-run branch to reason about. */
export const TIME_POINTS_PER_SET = 100;

/* Below this, a set reads as short-changed and the fan headline says so. */
export const SHORT_SET_RATIO = 0.80;

// ── FLOW ─────────────────────────────────────────────────────────────────────
export const SEGUE_POINTS = 45;
export const ENERGY = { ballad: 1, opener: 3, closer: 4, jam: 4, peak: 5, encore: 3 };
export const ENERGY_DEFAULT = 3;
export const ARC_MAX = 60;
/* Average energy miss, in ENERGY units, at which the arc is worth nothing.
   Energies run 1-5, so an average miss of 2 is genuinely shapeless. */
export const ARC_ZERO_AT = 2;
export const VARIETY_MAX = 30;
export const VARIETY_MIN_ROLES = 4;

// ── helpers ──────────────────────────────────────────────────────────────────
export function tagsOf(perf) {
  return String(perf && perf.tags || '').split('|').filter(Boolean);
}
const flag = v => v === 'true' || v === '1' || v === true || v === 1;
export function isJamchart(perf) { return flag(perf && perf.is_jamchart); }
export function isRecommended(perf) { return flag(perf && perf.is_recommended); }
export function lenOf(perf) { return Number(perf && perf.length_sec) || 0; }

export function baseOf(perf) {
  const r = perf && perf.crowd_rating;
  return (r === undefined || r === null || r === '') ? NEUTRAL_BASE : Number(r);
}

export function rarityMult(gap) {
  const g = Number(gap) || 0;
  for (const t of RARITY_TIERS) if (g >= t.gap) return t.mult;
  return 0;
}

export function fmtClock(sec) {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// ── budgets ──────────────────────────────────────────────────────────────────
/**
 * How much stage time each set actually has, given what the earlier sets left.
 * Only the encore inherits leftovers — that is the whole reason to think about
 * pace rather than just filling.
 *
 * A set only hands its leftovers over once it is CLOSED. An open set has not
 * left anything behind yet, it is simply still being played. Without that, an
 * untouched night reports an encore budget of 2h35m, which is nonsense to show
 * a player mid-game.
 *
 * @param {Array<Array>} sets    three arrays of performance rows
 * @param {Array<boolean>} closed which sets are finished; defaults to all of
 *   them, which is the right reading when scoring a finished show.
 */
export function budgets(sets, closed) {
  const out = SETS.map(s => s.seconds);
  let spare = 0;
  for (let i = 0; i < ENCORE_INDEX; i++) {
    if (closed && !closed[i]) continue;
    const used = (sets[i] || []).reduce((a, p) => a + lenOf(p), 0);
    spare += Math.max(0, SETS[i].seconds - used);
  }
  out[ENCORE_INDEX] += spare;
  return out;
}

/** Seconds still available in a set. */
export function remaining(sets, i, closed) {
  const used = (sets[i] || []).reduce((a, p) => a + lenOf(p), 0);
  return budgets(sets, closed)[i] - used;
}

/** Can this song still go into this set? */
export function canPlace(sets, i, perf, closed) {
  const len = lenOf(perf);
  if (!len) return false;                                  // untimed songs cannot be spent
  if ((sets[i] || []).length >= SETS[i].maxSongs) return false;
  return len <= remaining(sets, i, closed);
}

/** A set is done when it is full or nothing left could fit. */
export function setFull(sets, i) {
  return (sets[i] || []).length >= SETS[i].maxSongs;
}

// ── the model ────────────────────────────────────────────────────────────────
export function versionParts(perf) {
  const reasons = [];
  if (isRecommended(perf)) reasons.push({ label: 'Recommended version', mult: V_RECOMMENDED });
  else if (isJamchart(perf)) reasons.push({ label: 'Jamchart version', mult: V_JAMCHART });

  const len = lenOf(perf);
  if (len >= LEN_20MIN) reasons.push({ label: '20+ minutes', mult: V_LEN_20MIN });
  else if (len >= LEN_15MIN) reasons.push({ label: '15+ minutes', mult: V_LEN_15MIN });

  const rm = rarityMult(perf && perf.show_gap);
  if (rm) reasons.push({ label: `${Number(perf.show_gap)}-show gap`, mult: rm });

  return { mult: 1 + reasons.reduce((a, r) => a + r.mult, 0), reasons };
}
export function versionMult(perf) { return versionParts(perf).mult; }

/** How well a song's tags suit the role it ended up in. */
export function roleFit(tags, role) {
  const t = Array.isArray(tags) ? tags : String(tags || '').split('|').filter(Boolean);
  const want = role.tags || [];
  if (!want.length) {
    // Mid-set. A ballad here is the breather a real set needs, not a misfire.
    return t.includes('ballad') ? 'ok' : 'neutral';
  }
  if (want.every(x => t.includes(x))) return 'great';
  if (t.some(x => want.includes(x))) return 'ok';
  if (t.includes('ballad') && role.energy >= 4) return 'bad';
  return 'neutral';
}

export function placementMult(tags, role) {
  switch (roleFit(tags, role)) {
    case 'great': return MULT_PERFECT;
    case 'ok':    return MULT_PARTIAL;
    case 'bad':   return MULT_CLASH;
    default:      return MULT_NEUTRAL;
  }
}

export function energyOf(perf) {
  const t = tagsOf(perf);
  if (!t.length) return ENERGY_DEFAULT;
  return Math.max(...t.map(x => ENERGY[x] === undefined ? ENERGY_DEFAULT : ENERGY[x]));
}

/** Full breakdown for one performance, given the role it landed in. */
export function scorePerf(perf, role) {
  const base = baseOf(perf);
  const v = versionParts(perf);
  const fit = roleFit(perf && perf.tags, role);
  const pm = placementMult(perf && perf.tags, role);
  return {
    base,
    versionMult: v.mult,
    versionReasons: v.reasons,
    role: role.name,
    fit,
    placementMult: pm,
    subtotal: Math.round(base * v.mult * pm),
  };
}

export function segueKey(a, b) { return `${a.song_id}|${b.song_id}`; }

// ── fan reaction ─────────────────────────────────────────────────────────────
/* Short, punchy, and earned — each line is keyed to something the player
   actually did, so it reads as a review rather than a fortune cookie. Ordered
   most specific first; the first match wins. */
export const HEADLINES = [
  { id: 'perfect',   when: s => s.overallRatio >= 0.96 && s.segues >= 2,
    text: 'Not a second wasted. Not a segue missed.' },
  { id: 'tothewire', when: s => s.overallRatio >= 0.96,
    text: 'Played the curfew like a fourth instrument.' },
  { id: 'full',      when: s => s.overallRatio >= 0.93 && s.avgLen >= 780,
    text: 'Heavy, patient, and right up to the curfew.' },
  { id: 'full2',     when: s => s.overallRatio >= 0.93,
    text: 'Every minute spent. Nobody checked a watch.' },
  { id: 'tight',     when: s => s.overallRatio >= 0.88 && s.segues >= 2,
    text: 'Stitched together. Barely a gap all night.' },
  { id: 'good',      when: s => s.overallRatio >= 0.88,
    text: 'Ran it close. A few minutes left in the tank.' },
  { id: 'encorebig', when: s => s.setRatios[2] >= 0.9 && s.encoreSongs >= 2,
    text: 'Banked the time and blew it all on the encore.' },
  { id: 'shortall',  when: s => s.overallRatio < 0.7,
    text: 'Left the fans wanting more. And wanting a full set.' },
  { id: 'short',     when: s => s.overallRatio < 0.82,
    text: "Ended early. The house lights came up on a confused room." },
  { id: 'set1thin',  when: s => s.setRatios[0] < SHORT_SET_RATIO,
    text: 'Set I ran out of road. Set II had to carry it.' },
  { id: 'set2thin',  when: s => s.setRatios[1] < SHORT_SET_RATIO,
    text: 'Front-loaded the night and coasted home.' },
  { id: 'noencore',  when: s => s.encoreSongs === 0,
    text: 'No encore. Bold. The parking lot had opinions.' },
  { id: 'jamheavy',  when: s => s.avgLen >= 900,
    text: 'Four songs an hour. The heads loved it.' },
  { id: 'sprint',    when: s => s.avgLen > 0 && s.avgLen <= 420,
    text: 'Sixteen songs, no breathing room. A greatest-hits sprint.' },
  { id: 'seguerun',  when: s => s.segues >= 3,
    text: 'Barely stopped to tune. One long exhale.' },
  { id: 'solid',     when: () => true,
    text: 'A good night. Not one they will bootleg forever.' },
];

/** Per-set reaction, same idea at set scale. */
export function setNote(ratio, songs) {
  if (songs === 0) return 'Never happened.';
  if (ratio >= 0.97) return 'Filled to the curfew.';
  if (ratio >= 0.9) return 'Paced about right.';
  if (ratio >= SHORT_SET_RATIO) return 'A little room left on the table.';
  if (ratio >= 0.6) return 'Cut short — the crowd noticed.';
  return 'Barely a set.';
}

// ── scoring a whole show ─────────────────────────────────────────────────────
/**
 * @param {Array<Array>} sets  three arrays of performance rows, in running order
 * @param {Set} segues canonical "songIdA|songIdB" pairs
 */
export function scoreShow(sets, segues) {
  const s = [sets[0] || [], sets[1] || [], sets[2] || []];
  const bud = budgets(s);

  // Songs, scored against the role each ended up in.
  const perSet = s.map((songs, si) => songs.map((p, i) => ({
    perf: p,
    role: roleAt(si, i, songs.length),
    score: scorePerf(p, roleAt(si, i, songs.length)),
  })));
  const songTotal = perSet.flat().reduce((a, x) => a + x.score.subtotal, 0);

  // Time — per set, and only for sets that had a budget to spend.
  const time = s.map((songs, i) => {
    const used = songs.reduce((a, p) => a + lenOf(p), 0);
    const ratio = bud[i] > 0 ? Math.min(1, used / bud[i]) : 0;
    return {
      label: SETS[i].label,
      used, budget: bud[i], ratio,
      songs: songs.length,
      points: Math.round(TIME_POINTS_PER_SET * ratio),
      note: setNote(ratio, songs.length),
    };
  });
  const timeTotal = time.reduce((a, t) => a + t.points, 0);

  // Flow — segues only count between songs adjacent inside one set.
  const segueHits = [];
  s.forEach((songs, si) => {
    for (let i = 0; i < songs.length - 1; i++) {
      if (segues && segues.has(segueKey(songs[i], songs[i + 1]))) {
        segueHits.push({ set: si, from: i, to: i + 1, points: SEGUE_POINTS,
          a: songs[i].song, b: songs[i + 1].song });
      }
    }
  });

  const all = perSet.flat();
  let dev = 0;
  all.forEach(x => { dev += Math.abs(energyOf(x.perf) - x.role.energy); });
  const avgDev = all.length ? dev / all.length : 0;
  const arc = all.length
    ? Math.max(0, Math.round(ARC_MAX * (1 - avgDev / ARC_ZERO_AT))) : 0;

  const roles = [...new Set(all.flatMap(x => tagsOf(x.perf)))];
  const variety = all.length
    ? Math.round(VARIETY_MAX * Math.min(1, roles.length / VARIETY_MIN_ROLES)) : 0;

  const flowTotal = segueHits.reduce((a, x) => a + x.points, 0) + arc + variety;

  // The fan headline.
  const totalBudget = bud.reduce((a, b) => a + b, 0);
  const totalUsed = s.flat().reduce((a, p) => a + lenOf(p), 0);
  const stats = {
    overallRatio: totalBudget ? totalUsed / totalBudget : 0,
    setRatios: time.map(t => t.ratio),
    encoreSongs: s[2].length,
    segues: segueHits.length,
    avgLen: all.length ? totalUsed / all.length : 0,
    songs: all.length,
  };
  const headline = (HEADLINES.find(h => h.when(stats)) || HEADLINES[HEADLINES.length - 1]).text;

  return {
    total: songTotal + timeTotal + flowTotal,
    songTotal, timeTotal, flowTotal,
    perSet, time, arc, variety, roles,
    segues: segueHits,
    headline, stats,
    totalUsed, totalBudget,
  };
}

export function calcTotal(sets, segues) { return scoreShow(sets, segues).total; }
