/* Segue — scoring v4.
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
 * Six things score, and the result screen shows them in this order:
 *
 *   SONG       is this a song people treasure?      base, from crowd_rating
 *   VERSION    was this a special night for it?     multiplier
 *   PLACEMENT  does it suit where it landed?        multiplier
 *   TIME       did you use the stage you were given?
 *   FLOW       do the picks work as one show?       segues + energy arc
 *   BREADTH    what did the night actually contain? five cards
 *
 * WHAT CHANGED IN v5
 *
 * Segues were a dominant strategy. A player who ignored song quality and
 * chased links alone beat one picking the best song every round by 16%, while
 * playing worse songs. Three changes, measured over 500 simulated shows each:
 *
 *   - a link is scaled by how routine that pair is for the band, and by how
 *     many the night has already had (see FLOW below);
 *   - Variety, which random play, greedy play and segue farming ALL scored a
 *     perfect 30 out of 30 on, is replaced by BREADTH, which can be missed;
 *   - Flow and Breadth are siblings, so each scoresheet heading equals the
 *     rows printed under it.
 *
 * Segues fell from 21% of a farmer's score to 10%, and the farmer's edge over
 * a song-picker from +170 to +57. Shows containing no cover at all fell from
 * 52% to 1% — without a penalty, just a card worth having.
 */

export const NEUTRAL_BASE = 30;

// ── the show ─────────────────────────────────────────────────────────────────
/* Budgets are the archive's medians. maxSongs caps a set so a run of four-minute
   songs cannot turn a set into a twelve-song sprint — real Set Is top out around
   eight. Time a set does not use carries into the NEXT one, so Set I's leftovers
   are Set II's to spend and Set II's reach the encore. */
export const SETS = [
  { key: '1', label: 'Set I',  seconds: 75 * 60, maxSongs: 8 },
  { key: '2', label: 'Set II', seconds: 70 * 60, maxSongs: 8 },
  { key: 'E', label: 'Encore', seconds: 10 * 60, maxSongs: 3 },
];
export const ENCORE_INDEX = 2;

/* A hard cap so a pathological run of very short songs cannot make a session
   endless. Reached only if every set fills to maxSongs. */
export const MAX_ROUNDS = SETS.reduce((a, s) => a + s.maxSongs, 0);

// ── RESPINS ──────────────────────────────────────────────────────────────────
/* You can reject the show you drew and spin again — but stage time is the only
   currency here, so that is what it costs, taken out of the set you are building.
   Escalating, so a first look is cheap and a fourth is not offered at all: the
   point is a real decision, not a reroll button you mash until you like the show.
   Five minutes is most of a short song; fifteen is a jam you will never play. */
export const RESPIN_COSTS = [5 * 60, 10 * 60, 15 * 60];

/** What the next respin costs, or null when there are none left. */
export function respinCost(used) {
  return used < RESPIN_COSTS.length ? RESPIN_COSTS[used] : null;
}

/** Can the current set afford another spin? */
export function canRespin(sets, i, used, closed, spent) {
  const cost = respinCost(used);
  if (cost === null) return false;
  return remaining(sets, i, closed, spent) >= cost;
}

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
export const TIME_POINTS_PER_SET = 65;

/* Below this, a set reads as short-changed and the fan headline says so. */
export const SHORT_SET_RATIO = 0.80;

// ── FLOW ─────────────────────────────────────────────────────────────────────
/*
 * ONLY A TAKE THAT ACTUALLY SEGUED CAN START ONE.
 *
 * This was wrong at first and it made the arrow a lie. Scoring asked only "is
 * A|B a canonical pair", which is a fact about the SONG — so a take that ran
 * into the next song and a take that ended cleanly behaved identically, and
 * 94% of un-arrowed performances could start a segue too. A player picking
 * arrows on purpose got nothing for it: 12 arrow picks bought 1.8 segues.
 *
 * Now the arrow means what it says. A segue starts only from a performance
 * that did not finish, which is also why placing one commits you to landing it
 * (see wouldStrand) — you have left a song hanging mid-jam.
 *
 * Grading is additive on top of that.
 */
export const SEGUE_POINTS = 34;         // the pair is canonical for this band
export const SEGUE_EXACT_BONUS = 26;    // ...and it is the pair THAT take played
export const SEGUE_CHAIN_BONUS = 18;    // per link past the second in a run
export const SANDWICH_BONUS = 70;       // A > B > A, closed

/* ── SUITES ──────────────────────────────────────────────────────────────────
 *
 * Jive I > Jive II > Jive Lee. Seekers on the Ridge pt I > pt II. One piece of
 * music in several movements, and putting one back together is the best thing
 * a setlist builder can do with this catalogue.
 *
 * THE MODEL HAD THESE EXACTLY BACKWARDS. familiarityMult discounts a pair by
 * how often the band plays it, which is right for an ordinary segue and wrong
 * for a suite: the whole point of a suite is that it is always played that way.
 * Seekers pt I > pt II is the MOST PLAYED PAIR IN THE ARCHIVE at 57 times, so
 * it sat on the 0.30 floor and scored 18 out of a possible 60. Jive I > Jive
 * Lee, 33 times, the same 18. The two most canonical links in the catalogue
 * paid less than a pair the band had thrown together once.
 *
 * So a suite link is exempt from BOTH brakes and paid a bonus on top. The
 * brakes exist to stop segue farming, and they cannot be farmed away here:
 * suites are a closed set of 8 songs in 3 families, and you only get one if
 * the shows you are dealt happen to offer two movements in consecutive rounds.
 * Simulated over 6000 games: a two-part suite is linkable in 52.8% of them and
 * a three-part in 2.65%. The band itself has managed a full Jive twice in 660
 * shows, which is the number this is priced against.
 */
export const SUITE_BONUS = 55;          // per link between movements of one piece
export const SUITE_FULL_BONUS = 90;     // once, for carrying a suite past two parts

/*
 * TWO BRAKES ON SEGUE FARMING.
 *
 * A player who ignored song quality and chased links alone was scoring 16%
 * higher than one picking the best song every round, while playing WORSE
 * songs — 5.3 segues a show against 1.4. That is a dominant strategy, and the
 * two reasons are worth separating.
 *
 * 1. Not every pair is an achievement. 1210 of the band's 1440 canonical
 *    pairs have happened exactly once; 25 have happened five times or more.
 *    Seekers on the Ridge pt I > pt II has happened 56 times because it is one
 *    song in two halves. Rebuilding that is not insight, and it should not pay
 *    like Yeti > Pumped Up Kicks. Familiarity scales the whole link.
 *
 * 2. Five segues in a night is not five times one segue. Past the second link
 *    each one pays less, so a couple of well-chosen ones stay worth chasing
 *    and a farmed row of them stops running away with the show.
 */
/*
 * THE COOLDOWN.
 *
 * A band that plays a peak and then plays another peak has not built
 * anything — the room has nowhere left to go. The move is to come down
 * afterwards and let people breathe.
 *
 * Both halves are defined from the data rather than from taste. A BIG song is
 * energy 5 or fifteen minutes and up; a BREATHER is energy 3 or less AND no
 * more than 60% of the big one's running time. Across the archive the band
 * has 1286 big songs and follows 38% of them with a genuine breather — often
 * enough that a player can aim for it, rare enough that it is a choice.
 *
 * The first cut keyed on tags alone and fired 0.59 times a show, which is not
 * a mechanic, it is a rounding error. Length is what carries the signal:
 * only 7.5% of takes are tagged peak, but 18% run past fifteen minutes.
 *
 * Small on purpose. Unlike a segue it costs nothing to attempt, so it must
 * not pay like one.
 */
export const PEAK_ENERGY = 5;
export const COOLDOWN_BREATHER_ENERGY = 3;
export const COOLDOWN_LENGTH_RATIO = 0.6;
export const COOLDOWN_BONUS = 20;

/* Under three minutes is a tease, not a song — 2.5% of takes. */
export const TEASE_SECONDS = 180;

/** Is this song a peak the room needs to come down from? */
export function isBigMoment(perf) {
  return energyOf(perf) >= PEAK_ENERGY || lenOf(perf) >= LEN_15MIN;
}

/** Every big-song → breather pair inside a set. */
export function cooldowns(sets) {
  const hits = [];
  (sets || []).forEach((songs, si) => {
    for (let i = 0; i < (songs || []).length - 1; i++) {
      const a = songs[i], b = songs[i + 1];
      if (!isBigMoment(a)) continue;
      if (energyOf(b) > COOLDOWN_BREATHER_ENERGY) continue;
      if (lenOf(b) > lenOf(a) * COOLDOWN_LENGTH_RATIO) continue;
      hits.push({ set: si, from: i, to: i + 1, points: COOLDOWN_BONUS,
        a: a.song, b: b.song });
    }
  });
  return hits;
}

export const SEGUE_FAMILIAR_FLOOR = 0.30;
export const SEGUE_FAMILIAR_K = 0.55;
/** How much a link is worth given how often the band has played that pair. */
export function familiarityMult(timesPlayed) {
  const n = Math.max(1, Number(timesPlayed) || 1);
  return Math.max(SEGUE_FAMILIAR_FLOOR, 1 / (1 + SEGUE_FAMILIAR_K * Math.log2(n)));
}
export const SEGUE_DECAY_FREE = 2;      // first two links pay in full
export const SEGUE_DECAY_STEP = 0.22;
export const SEGUE_DECAY_FLOOR = 0.25;
/** How much the nth scoring link of the show is worth. */
export function segueDecay(n) {
  if (n <= SEGUE_DECAY_FREE) return 1;
  return Math.max(SEGUE_DECAY_FLOOR, 1 - SEGUE_DECAY_STEP * (n - SEGUE_DECAY_FREE));
}

/*
 * MONOTONY: THREE OF THE SAME THING, UNCONNECTED.
 *
 * The band runs three-plus songs of one kind in 23% of shows. A player who
 * only follows the points does it in 90% of them, up to six deep. So the
 * scoring was pushing people into a set that never changes gear, and it was
 * almost always jams: of 102 same-kind runs in the archive, 101 are jams.
 *
 * But "three jams in a row" is the wrong thing to punish, and the archive is
 * what says so. When the band DOES stack three jams, they weld them together:
 *
 *                          links inside the run    that band's own baseline
 *   the band                      62%                      46%
 *   a points-chasing player       27%                      25%
 *
 * The band's long jam runs are a suite, well clear of their own segue rate.
 * The player's sit exactly at baseline, which means the jams landing together
 * is incidental — they are stacking the best-scoring cards and those happen
 * to all be jams. A segued jam suite is the best thing in this band. Three
 * unconnected jams is a set that never breathes.
 *
 * So a real segue RESETS the run, which puts this rule on the same side as
 * the segue bonus instead of fighting it.
 *
 * It is a multiplier on the song's own points rather than a flat deduction,
 * like familiarityMult and segueDecay above: stacking three BIG jams should
 * cost more than stacking three small ones, since that is the play worth
 * discouraging, and a multiplier cannot drive a score negative. It escalates
 * because the fourth and fifth need to hurt more than the third — a flat hit
 * on the third gets absorbed and the pile carries on.
 */
/** Tags that describe what a song IS. opener/closer/encore describe where it
    sat in its source show, so they are not a kind of song for this purpose. */
export const MONO_KINDS = ['jam', 'peak', 'ballad'];
/** The run length at which the penalty starts. */
export const MONO_AT = 3;
/** What the 3rd, 4th and 5th-or-later song of a run keeps. */
export const MONO_MULTS = [0.75, 0.55, 0.40];

/**
 * How deep into an unbroken same-kind run this song sits. 1 means it starts
 * one. A song is only part of the run if the WHOLE run shares one kind, so
 * jam, jam+peak, peak is three songs and no run.
 *
 * @param {Array} songs one set, in running order
 * @param {number} i    the index being scored
 * @param {Set} segues  canonical pairs; a real segue resets the run
 */
export function monotonyRun(songs, i, segues) {
  const kindsOf = p => tagsOf(p).filter(t => MONO_KINDS.includes(t));
  let shared = kindsOf(songs[i]);
  if (!shared.length) return { depth: 1, kind: null };
  let depth = 1;
  for (let k = i - 1; k >= 0; k--) {
    // Welded to what came before, so this is a suite and the count restarts.
    if (segues && segues.has(segueKey(songs[k], songs[k + 1]))) break;
    const next = kindsOf(songs[k]).filter(t => shared.includes(t));
    if (!next.length) break;
    shared = next;
    depth++;
  }
  return { depth, kind: shared[0] };
}
export function monotonyDepth(songs, i, segues) {
  return monotonyRun(songs, i, segues).depth;
}

/** What a song at that depth keeps of its own points. */
export function monotonyMult(depth) {
  if (depth < MONO_AT) return 1;
  return MONO_MULTS[Math.min(depth - MONO_AT, MONO_MULTS.length - 1)];
}

/* A set never ends mid-segue: across 1135 real Goose sets, not one closes on a
   song marked as segueing out. So the game will not let you either — and a
   song is refused when placing it would leave no room to land it. */
export const MIN_LANDING_SECONDS = 180;

/** Would placing this song leave the set unable to follow it? */
export function wouldStrand(sets, i, perf, closed, spent) {
  if (String(perf && perf.is_segue) !== 'true') return false;
  const after = (sets[i] || []).length + 1;
  if (after >= SETS[i].maxSongs) return true;                     // no slot to land in
  return remaining(sets, i, closed, spent) - lenOf(perf) < MIN_LANDING_SECONDS;
}

/** Is the set currently ending on an unresolved segue? */
export function danglingSegue(sets, i) {
  const set = sets[i] || [];
  if (!set.length) return null;
  const last = set[set.length - 1];
  return String(last.is_segue) === 'true' ? last : null;
}

/**
 * A sandwich: the song already sits earlier in this set and the song now
 * closing back into it is a canonical pair. This is the one case where
 * repeating a song is right rather than a mistake — play it, jam out, go
 * somewhere else, come back.
 */
export function closesSandwich(set, perf, segues) {
  if (!set || set.length < 2) return false;
  const last = set[set.length - 1];
  if (!segues || !segues.has(segueKey(last, perf))) return false;
  return set.slice(0, -1).some(p => p.song_id === perf.song_id);
}
export const ENERGY = { ballad: 1, opener: 3, closer: 4, jam: 4, peak: 5, encore: 3 };
export const ENERGY_DEFAULT = 3;
export const ARC_MAX = 60;
/* Average energy miss, in ENERGY units, at which the arc is worth nothing.
   Energies run 1-5, so an average miss of 2 is genuinely shapeless. */
export const ARC_ZERO_AT = 2;

/*
 * BREADTH — five things a night can have, worth points for having them.
 *
 * Variety used to be the whole of this, and it was dead: random play, greedy
 * play and segue-farming ALL scored 30 out of 30. A category nobody can fail
 * is not a category, it is a constant.
 *
 * These replace it, and each one is a different reason to leave the obvious
 * pick alone. The cover card is the pointed one: a player optimising song
 * points alone played zero covers in 52% of shows, so it is a real cost to
 * ignore. 96% of drawable shows have a cover on offer, so it is always a
 * choice rather than a dice roll — and the three of these you can reach are
 * worth more than the segues you would farm instead.
 */
export const BREADTH_BUSTOUT_GAP = 50;
export const BREADTH_BIG_JAM = 1200;    // 20 minutes
/*
 * THE FULL SPECTRUM.
 *
 * This asked for five of the six roles and fired for 67-71% of shows no
 * matter how well they were played, which makes it a participation prize
 * rather than a card. The reason is that ENCORE is nearly free (you always
 * play one) so "five" really meant "four plus the encore you were going to
 * play anyway".
 *
 * All six is the real thing, and it gets HARDER the better you play: 21% of
 * careless shows manage it against 10% of sharp ones. That inversion is the
 * whole point. Ballads are 2% of the archive and score badly, so a player
 * chasing points drops them (38% of careless shows contain one, 17% of sharp
 * ones). A tester who deliberately hunts all six was doing the most
 * interesting thing in the game and getting nothing for it.
 *
 * It is the biggest card now, and the miss line names the roles you are
 * short, because "you got everything but a ballad" is a thing a player can
 * act on and "the night only did one thing" is not.
 */
export const ROLE_KINDS = ['opener', 'jam', 'peak', 'ballad', 'closer', 'encore'];
export const BREADTH_ROLES = ROLE_KINDS.length;

/** "an opener", "a ballad" — the roles start with both vowels and consonants. */
const article = word => (/^[aeiou]/i.test(word) ? 'an' : 'a');

/** Which of the six kinds a night never played. */
export function rolesMissing(songs) {
  const had = new Set((songs || []).flatMap(tagsOf));
  return ROLE_KINDS.filter(r => !had.has(r));
}
export const BREADTH = [
  { id: 'cover',    points: 34, label: 'A cover',
    blurb: 'Somebody else\'s song, made yours',
    has: songs => songs.some(p => flag(p.is_cover)),
    missed: 'No covers. Every song was one of their own' },
  { id: 'bustout',  points: 32, label: 'A bustout',
    blurb: `Not played for ${BREADTH_BUSTOUT_GAP}+ shows`,
    has: songs => songs.some(p => (Number(p.show_gap) || 0) >= BREADTH_BUSTOUT_GAP),
    missed: 'Nothing anybody had been waiting for' },
  { id: 'jamchart', points: 26, label: 'A jamchart version',
    blurb: 'A take the archive flagged',
    has: songs => songs.some(p => flag(p.is_jamchart)),
    missed: 'No version the archive thought worth flagging' },
  { id: 'bigjam',   points: 26, label: 'A 20-minute jam',
    blurb: 'One song given the whole room',
    has: songs => songs.some(p => lenOf(p) >= BREADTH_BIG_JAM),
    missed: 'Nothing ran long enough to get lost in' },
  { id: 'roles',    points: 44, label: 'Every kind of song',
    blurb: 'An opener, a jam, a peak, a ballad, a closer and an encore',
    has: songs => rolesMissing(songs).length === 0,
    missed: 'The night only ever did one thing',
    // Names what is missing, so the card teaches the chase instead of just
    // withholding points.
    detail: songs => {
      const gone = rolesMissing(songs);
      if (!gone.length) return null;
      if (gone.length >= 4) return `Only ${BREADTH_ROLES - gone.length} of the six kinds`;
      const list = gone.length === 1 ? gone[0]
        : `${gone.slice(0, -1).join(', ')} or ${gone[gone.length - 1]}`;
      return `Everything except ${article(gone[0])} ${list}`;
    } },
];
export const BREADTH_MAX = BREADTH.reduce((a, b) => a + b.points, 0);

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
 *
 * TIME CASCADES FORWARD, ONE SET AT A TIME. Finish Set I five minutes early and
 * those five minutes are Set II's to spend; whatever Set II then leaves over
 * (its own plus anything it inherited and did not use) goes to the encore. It
 * used to skip the middle: both sets paid straight into the encore, so time
 * banked in Set I could only ever be spent on a ten-minute slot at the end of
 * the night. Running short early is a real decision now, because the set you
 * are about to play is where it lands.
 *
 * A set only hands its leftovers over once it is CLOSED. An open set has not
 * left anything behind yet, it is simply still being played. Without that, an
 * untouched night reports an encore budget of 2h35m, which is nonsense to show
 * a player mid-game. And because the carry is a chain, an open set stops it
 * dead: while Set I is still going, Set II's inheritance is not decided, so the
 * encore's cannot be either.
 *
 * @param {Array<Array>} sets    three arrays of performance rows
 * @param {Array<boolean>} closed which sets are finished; defaults to all of
 *   them, which is the right reading when scoring a finished show.
 */
export function budgets(sets, closed, spent) {
  const out = SETS.map((s, i) => s.seconds - ((spent && spent[i]) || 0));
  let carry = 0;
  for (let i = 0; i < SETS.length; i++) {
    out[i] += carry;
    if (i === ENCORE_INDEX) break;          // nothing flows out of the encore
    // No `closed` at all means a finished show, where every set has closed.
    if (closed && !closed[i]) break;        // still open: it has banked nothing yet
    const used = (sets[i] || []).reduce((a, p) => a + lenOf(p), 0);
    carry = Math.max(0, out[i] - used);
  }
  return out;
}

/** Seconds still available in a set. */
export function remaining(sets, i, closed, spent) {
  const used = (sets[i] || []).reduce((a, p) => a + lenOf(p), 0);
  return budgets(sets, closed, spent)[i] - used;
}

/** Can this song still go into this set? */
export function canPlace(sets, i, perf, closed, spent) {
  const len = lenOf(perf);
  if (!len) return false;                                  // untimed songs cannot be spent
  if ((sets[i] || []).length >= SETS[i].maxSongs) return false;
  return len <= remaining(sets, i, closed, spent);
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
export function scorePerf(perf, role, mono = 1) {
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
    monotonyMult: mono,
    subtotal: Math.round(base * v.mult * pm * mono),
  };
}

export function segueKey(a, b) { return `${a.song_id}|${b.song_id}`; }

// ── fan reaction ─────────────────────────────────────────────────────────────
/* Short, punchy, and earned — each line is keyed to something the player
   actually did, so it reads as a review rather than a fortune cookie. Ordered
   most specific first; the first match wins. */
/*
 * THE FAN HEADLINE.
 *
 * These were all about the clock, and it made them a lie. Only 6 of 16 could
 * ever fire across 400 simulated shows, and all 6 were timing lines — because
 * the game ends a set when nothing else fits, so the tenth percentile of
 * shows still uses 93% of the stage. Everything gated above 0.93 fired for
 * almost everyone and everything below it was dead code.
 *
 * So the order is now: the most SPECIFIC true thing about the night wins.
 * A show that rebuilt a once-ever transition gets told about that, not about
 * its curfew management. Timing lines are the fallback, not the lead, and the
 * generic close is last. Measured after the rewrite — see heads.mjs.
 */
export const HEADLINES = [
  /* ORDERED BY MEASURED RARITY, not by how rare the condition sounds. Whatever
     sits at the top is what most players will read, so the top has to be the
     thing almost nobody does — and twice now the intuition was wrong:
     "rebuilt a once-ever segue" fired for 53% of shows, because 84% of this
     band's pairs ARE once-ever; "three jamchart takes" fired for 66%, because
     jamchart takes score well and good players pick them anyway.
     The percentages below are how often each CONDITION holds, independent of
     order, across 400 simulated shows spanning the skill range. Re-run
     heads.mjs and re-sort after touching any rule. */

  // Almost nobody does these.
  { id: 'sandwich',  when: s => s.sandwiches >= 1,
    text: 'Wrapped a whole song inside another one. Showoffs.' },
  { id: 'onceever',  when: s => s.rarestSegue === 1 && s.segues >= 3,
    text: 'Three transitions, none of which they have played twice. Tapers wept.' },
  { id: 'seguerun',  when: s => s.segues >= 3,
    text: 'Barely stopped to tune. One long exhale.' },
  { id: 'bustoutbig',when: s => s.bustouts >= 2,
    text: 'Two things nobody had heard in years. The lot is still arguing.' },

  // Things that went wrong. All 0% for a competent player — the game closes a
  // set when nothing else fits, so it is hard to run short — but when one is
  // true it is the whole story, so it outranks anything that went right.
  { id: 'shortall',  when: s => s.overallRatio < 0.7,
    text: 'Left the fans wanting more. And wanting a full set.' },
  { id: 'short',     when: s => s.overallRatio < 0.82,
    text: 'Ended early. The house lights came up on a confused room.' },
  { id: 'narrow',    when: s => s.breadthGot <= 1,
    text: 'One idea, played fifteen times. Committed, at least.' },
  { id: 'noencore',  when: s => s.encoreSongs === 0,
    text: 'No encore. Bold. The parking lot had opinions.' },
  { id: 'nocover',   when: s => !s.cards.has('cover') && s.songs >= 8,
    text: 'Not one song of somebody else\'s. Confident, that.' },
  { id: 'sprint',    when: s => s.avgLen > 0 && s.avgLen <= 420,
    text: 'No breathing room all night. A greatest-hits sprint.' },
  { id: 'set1thin',  when: s => s.setRatios[0] < SHORT_SET_RATIO,
    text: 'Set I ran out of road. Set II had to carry it.' },
  { id: 'set2thin',  when: s => s.setRatios[1] < SHORT_SET_RATIO,
    text: 'Front-loaded the night and coasted home.' },

  // The shape of the night, rarest first.
  { id: 'encorebig', when: s => s.encoreSongs >= 3,
    text: 'Banked the time and blew it all on a three-song encore.' },
  { id: 'jamheavy',  when: s => s.avgLen >= 900,
    text: 'Four songs an hour. The heads loved it.' },
  { id: 'monsterjam',when: s => s.longest >= 1500,
    text: 'One song ate half a set. Nobody wanted it to end.' },
  { id: 'coverheavy',when: s => s.covers >= 3,
    text: 'Half a covers set broke out. Depending who you ask, that is a compliment.' },
  { id: 'everything',when: s => s.breadthGot === 5,
    text: 'A cover, a bustout, a monster jam. Left nothing on the shelf.' },
  { id: 'bustout',   when: s => s.bustouts >= 1 && s.longest >= LEN_20MIN,
    text: 'A bustout and a twenty-minute jam. Somebody call in sick tomorrow.' },
  { id: 'archive',   when: s => s.jamcharts >= 3,
    text: 'Three takes straight out of the jamcharts. An archivist\'s night.' },

  // Timing last: 'full' holds for 92% of shows and 'good' for 100%, so these
  // can only ever be the fallback verdict rather than the story.
  { id: 'tothewire', when: s => s.overallRatio >= 0.96,
    text: 'Played the curfew like a fourth instrument.' },
  { id: 'full',      when: s => s.overallRatio >= 0.93,
    text: 'Every minute spent. Nobody checked a watch.' },
  { id: 'good',      when: s => s.overallRatio >= 0.88,
    text: 'Ran it close. A few minutes left in the tank.' },
  { id: 'solid',     when: () => true,
    text: 'A good night. Not one they will bootleg forever.' },
];




/** Per-set reaction, same idea at set scale. */
export function setNote(ratio, songs) {
  if (songs === 0) return 'Never happened.';
  if (ratio >= 0.97) return 'Filled to the curfew.';
  if (ratio >= 0.9) return 'Paced about right.';
  if (ratio >= SHORT_SET_RATIO) return 'A little room left on the table.';
  if (ratio >= 0.6) return 'Cut short. The crowd noticed.';
  return 'Barely a set.';
}

// ── fan reactions, song by song ──────────────────────────────────────────────
/*
 * What the room does when a song lands. Keyed to how the pick actually scored
 * relative to an ordinary one, so the reaction is earned rather than random —
 * a beloved song in the right place at twenty-two minutes should not draw the
 * same line as a filler track dropped in the wrong slot.
 *
 * Short and punchy on purpose: this plays back one song at a time, so anything
 * longer than a breath gets in the way of the next one.
 */
/*
 * The room, in the words the room actually uses.
 *
 * Vocabulary is taken from the community's own jamchart notes rather than
 * invented — across 753 write-ups the curators say "peak" 769 times, "bliss"
 * 93, "patient" 54, "whale" 50, "hose" 17, plus type II, jam vehicle, bustout
 * and plink. If it is not in the notes it is not in here.
 *
 * Checked most-specific first, so the line explains WHY the pick landed: a
 * 100-show bustout and a twenty-two minute type II are different nights and
 * should not draw the same sentence.
 */
export const RX = {
  /* Three tiers of not-played-in-a-while, because 22 shows and 300 shows are
     not the same event. The loudest ones say the number — a crowd that has
     waited two years knows exactly how long it has been.
     {gap} is the whole phrase ("147 shows"); {n} is the bare number. */
  rare: [
    'Not played in {gap}. Real cheer from down front.',
    '{gap} since the last one. The rail noticed immediately.',
    'Deep cut. A pocket of the floor lost it.',
    'Somebody in section 102 has waited all tour for that.',
    'Been a while. The people who knew went properly loud.',
    'Dusted off. Three rows understood immediately.',
  ],
  bustout: [
    'BUSTOUT. {gap}. Nobody had that on their card.',
    'Bustout! {gap} deep. The taper section audibly gasped.',
    'First time in {gap}. Phones up before the second bar.',
    '{gap} of waiting, gone in one downbeat.',
  ],
  unicorn: [
    '{gap}. The roof came off. Grown adults crying.',
    'Are you kidding. {gap}. The lot will talk for years.',
    'Nobody alive expected that. {gap} since the last one.',
    'A {n}-show bustout. Somebody just got their whitest whale.',
  ],
  /* A bustout in the wrong slot is two true things at once, and picking one
     lost the other: the room still erupts, and it was still the wrong place
     for it. So the line says both. */
  bustoutClash: [
    '{gap}! And they buried it. Still bedlam, mind.',
    'Huge bustout, wrong moment. The pop was real anyway.',
    '{gap} of waiting, spent in the wrong slot. Still counts.',
  ],
  bustoutCover: [
    'A cover nobody had heard in {gap}. Bedlam.',
    'Bustout AND a cover, {gap} deep. The floor came apart.',
    'They dusted off somebody else\'s song after {gap}.',
  ],
  legend: [
    'Full hose. The rail came apart.',
    'That is the version people will send each other.',
    'Type II and gone. Nobody sat down for that.',
    'Patient, then majestic. Absolute bliss.',
  ],
  monster: [
    'Twenty-plus and they went there.',
    'Went deep type II. The whole floor is up.',
    'Whale calls over the top. Enormous.',
    'Peaked, dropped, peaked again.',
  ],
  jam: [
    'Proper jam vehicle. Big peak on the end.',
    'Nice patient build. Room locked in.',
    'Plinko into bliss. Heads grinning up front.',
    'Legs on that one. Tapers are pleased.',
    'Found the groove and stayed in it. No complaints.',
    'Got weird in the middle. The right kind of weird.',
    'Second jam was better than the first. Rare.',
  ],
  cover: [
    'Cover! The floor clocked it inside two bars.',
    'Deep cut cover. Huge pop of recognition.',
    'Nobody expected that one. Big singalong.',
    'Took somebody else\'s song and kept it.',
    'Half the room knew it, the other half pretended.',
    'Covers night energy for three and a half minutes.',
  ],
  /* The come-down after a big one. The mechanic already scores this; the
     crowd had nothing to say about it, which made it invisible. */
  cooldown: [
    'Everybody exhales. Perfect place for it.',
    'Beers refilled, legs recovered. Exactly what that needed.',
    'The room comes down together. Nicely judged.',
    'Soft landing after all that. Somebody knew what to do.',
  ],
  tease: [
    'Barely a minute of it. The floor screamed anyway.',
    'A tease, and the room caught it instantly.',
    'Short, sharp, gone. Half the floor is asking what that was.',
  ],
  opening: [
    'Lights down, first notes. The place erupts.',
    'Openers do not usually get that reaction.',
    'Straight out of the gate. Nobody is sitting down tonight.',
  ],
  lastcall: [
    'Last one. Nobody wanted the lights.',
    'That is the night. House lights, everybody hoarse.',
    'Final note, and the room does not move for a second.',
  ],
  breather: [
    'Lighters up. Earned breather.',
    'Beautiful. The room finally exhaled.',
    'Pretty, patient, and needed after that.',
  ],
  opener: [
    'Strong opener. Sets the night up.',
    'Straight into it. Good call to start.',
  ],
  closer: [
    'Set closer, and it delivered.',
    'Big finish. Lights up on a roar.',
  ],
  encore: [
    'Encore. They sent everybody home happy.',
    'One more and it was the right one.',
  ],
  good: [
    'Solid. Crowd stayed with it.',
    'Kept it in the pocket. Easy sway.',
    'Well played, no notes.',
    'Tight. Nobody put their phone away, nobody left.',
    'Did the job. Good energy in the room.',
    'Clean version. The heads nodded along.',
  ],
  /* The commonest bucket by a distance — roughly a quarter of every song
     played — so it needs the deepest rotation. Three lines meant a player saw
     the same one four times a night. */
  flat: [
    'Straight ahead. Beer line got long.',
    'Fine. A few people sat down on the lawn.',
    'Polite. Setbreak energy, mid-set.',
    'Played it straight. Nobody minded.',
    'A song happened. The lot heard about it later.',
    'Serviceable. Good time to find your people.',
    'Held the room, did not move it.',
    'Nice enough. The rail checked their texts.',
  ],
  clash: [
    'Wrong read. That killed the momentum.',
    'Floor thinned out. The rail looked confused.',
    'Air came out of the room a bit.',
  ],
};

/**
 * A reaction line for one scored pick.
 * @param {object} score  the scorePerf result
 * @param {object} perf   the performance row, for the reason behind it
 * @param {number} seed   keeps a replay deterministic
 */
/*
 * GAP TIERS, SHARED WITH THE CARD.
 *
 * The draft card printed "43 SHOW GAP" and then the crowd said "beer line got
 * long", because the chip appeared at a gap of 20 and the bustout reaction
 * only fired at 50. 68% of every take wearing a gap chip was advertised as
 * rare and then greeted with silence. The card and the crowd now read the
 * same numbers, so they cannot drift apart again.
 */
export const GAP_RARE = 20;                       // 7.8% of drawable takes
export const GAP_BUSTOUT = BREADTH_BUSTOUT_GAP;   // 2.3%, and the breadth card
export const GAP_UNICORN = 100;                   // 1.6%, top gap on record 543

/** "147 shows" / "one show" — the phrase the loud lines drop into. */
export function gapPhrase(gap) {
  const n = Math.max(0, Math.round(Number(gap) || 0));
  return n === 1 ? 'one show' : `${n} shows`;
}

/**
 * What the room says about a song, given how it scored and what it was.
 *
 * @param {object} score  the scorePerf result
 * @param {object} perf   the performance row, for the reason behind it
 * @param {number} seed   keeps a replay deterministic
 * @param {object} ctx    where in the night it landed: {first, last, cooldown}
 */
export function reactionFor(score, perf, seed = 0, ctx = {}) {
  /* Rotate within a bucket across the night. Keying the line purely off a
     per-song seed put "section 102" on screen four times in one show, because
     a four-line bucket that fires five times will collide however clever the
     seed is. With a rotation the Nth use of a bucket takes the Nth line, so a
     repeat only happens once the bucket is genuinely exhausted. The offset
     keeps two shows from opening with the same lines, and comes from the
     show's own numbers so a replay is identical. */
  const pick = key => {
    const lines = RX[key];
    let i;
    if (ctx.rotation) {
      const used = ctx.rotation.get(key) || 0;
      ctx.rotation.set(key, used + 1);
      i = ((ctx.offset || 0) + used) % lines.length;
    } else {
      i = Math.abs(seed) % lines.length;
    }
    const n = Math.max(0, Math.round(Number(perf && perf.show_gap) || 0));
    return lines[i]
      .replace(/\{gap\}/g, gapPhrase(n))
      .replace(/\{n\}/g, String(n));
  };
  const gap = Number(perf && perf.show_gap) || 0;
  const len = lenOf(perf);
  const tags = tagsOf(perf);
  const cover = String(perf && perf.is_cover) === 'true';

  /* A real bustout outranks everything, including a bad fit. The room does not
     care that it landed in the wrong slot — it has not heard the song in two
     years. Below GAP_BUSTOUT a wrong slot still gets the wrong-slot line. */
  if (gap >= GAP_BUSTOUT && score.fit === 'bad') return pick('bustoutClash');
  if (gap >= GAP_UNICORN) return pick('unicorn');
  if (gap >= GAP_BUSTOUT) return pick(cover ? 'bustoutCover' : 'bustout');

  if (score.fit === 'bad') return pick('clash');
  if (gap >= GAP_RARE) return pick('rare');

  if (isRecommended(perf) && len >= LEN_20MIN) return pick('legend');
  if (len >= LEN_20MIN || (isRecommended(perf) && len >= LEN_15MIN)) return pick('monster');
  if (isJamchart(perf) || len >= LEN_15MIN) return pick('jam');
  // Scored by cooldowns(), so the crowd should hear it too.
  if (ctx.cooldown) return pick('cooldown');
  if (len > 0 && len < TEASE_SECONDS) return pick('tease');
  if (cover) return pick('cover');
  if (tags.includes('ballad')) return pick('breather');
  if (ctx.last) return pick('lastcall');
  if (score.role === 'Encore') return pick('encore');
  if (score.role === 'Closer' && score.fit !== 'neutral') return pick('closer');
  if (ctx.first) return pick('opening');
  if (score.role === 'Opener' && score.fit !== 'neutral') return pick('opener');
  if (score.subtotal >= 55) return pick('good');
  return pick('flat');
}


/*
 * WHY THE BAND WANTS A MINUTE.
 *
 * A respin costs stage time, which is the only currency in the game, so it
 * deserves a confirmation rather than a stray thumb. These are what the
 * confirmation says, and they rotate so the fourth one still lands.
 */
export const RESPIN_LINES = [
  'The band needs a minute to gameplan.',
  'Somebody broke a string. Again.',
  'Long look at the setlist taped to the monitor.',
  'A huddle by the drum riser. Nobody looks happy.',
  'Guitar tech sprinting. This will cost you.',
  'Tuning. Extremely thorough tuning.',
  'The keyboard player has an idea. It takes a while.',
  'Whispered conference at the mic stand.',
];

/** A rotating reason for the respin confirmation. */
export function respinLine(n = 0) {
  return RESPIN_LINES[Math.abs(n) % RESPIN_LINES.length];
}

/** The louder line for a segue, graded by what kind it was. */
export function eventLine(kinds, seed = 0) {
  if (!kinds) return null;
  const one = a => a[Math.abs(seed) % a.length];
  if (kinds.includes('sandwich')) return one([
    'And back into it. Sandwich closed, and the floor lost it.',
    'Came all the way back around. Sandwich complete.',
  ]);
  if (kinds.includes('chain')) return one([
    'Still no gap. Third one in a row.',
    'They have not stopped. Nobody is tuning.',
  ]);
  if (kinds.includes('exact')) return one([
    'Same transition as the tape. Seamless.',
    'Exactly like the version everybody knows. No gap.',
  ]);
  return one(['No gap. Straight in.', 'Ran it right into the next one.']);
}

/** What the room does between sets. */
export function setOpenLine(setIdx) {
  return ['Lights down. Here we go.',
          'Back from setbreak. Room is full again.',
          'Encore break. They are coming back out.'][setIdx] || '';
}

// ── the one that got away ────────────────────────────────────────────────────
/**
 * The best song a player was shown and did not play.
 *
 * Scored against the role it would most likely have filled, so the number is
 * comparable with what they did play rather than a raw song value. Every show
 * that appeared is a candidate, minus what actually made the setlist — a song
 * offered twice and never taken should still only surface once.
 *
 * @param {Array} seen        every performance row the player was shown
 * @param {Array<Array>} sets what they actually played
 */
export function theOneThatGotAway(seen, sets) {
  const played = new Set(sets.flat().map(p => p.song_id));
  let best = null, bestScore = -1;

  for (const p of seen) {
    if (played.has(p.song_id)) continue;
    if (!lenOf(p)) continue;
    // Judge it in the role it suits best — the fairest reading of what it was
    // worth, rather than punishing it for a slot the player never offered it.
    // One role of each kind the game can produce. roleAt(1,2,4) is the only way
    // to reach a pure Peak — at length 3 the last index is the Closer instead,
    // which was labelling every peak song a closer.
    for (const role of [roleAt(0, 0, 3),   // Opener
                        roleAt(0, 2, 3),   // Set I Closer  (closer|jam)
                        roleAt(1, 2, 4),   // Set II Peak
                        roleAt(1, 3, 4),   // Set II Closer (closer|peak)
                        roleAt(2, 0, 1),   // Encore
                        roleAt(0, 1, 3)]){ // Mid — where a ballad belongs
      const sc = scorePerf(p, role);
      if (sc.subtotal > bestScore) { bestScore = sc.subtotal; best = { perf: p, score: sc, role }; }
    }
  }
  // Only claim a role when the song actually suits one. When every role scores
  // the same the winner is just whichever was tested first, and "as opener it
  // was worth 161" about a twenty-two minute jam reads as nonsense.
  if (best && best.score.fit === 'neutral') best.role = null;
  return best;
}

// ── scoring a whole show ─────────────────────────────────────────────────────
/**
 * @param {Array<Array>} sets  three arrays of performance rows, in running order
 * @param {Set} segues canonical "songIdA|songIdB" pairs
 */
/*
 * RED, YELLOW, GREEN — the only thing a score's colour is allowed to mean.
 *
 * Graded on the TOTAL, not on points per song. Three of the four categories
 * are whole-show pools with fixed ceilings — time, flow and breadth do not
 * grow when you play more songs — so dividing by song count marked a
 * seventeen-song night down for the crime of being long.
 *
 * The cuts are the quartiles of 600 simulated shows across the skill range,
 * so roughly a quarter of nights come out green and a quarter red.
 *
 * During playback the running total is projected to full-show pace before it
 * is graded: "at this rate the night lands around here". At the last beat the
 * projection is the real total, so the colour the playback ends on is always
 * the colour the scorecard opens with.
 */
export const GRADE_WARM = 1036;
export const GRADE_HOT = 1156;
/** Songs to get through before the running colour means anything. */
export const GRADE_SETTLE = 3;

/** 'hot' | 'warm' | 'cold' — green, yellow, red. */
export function gradeScore(total) {
  return total >= GRADE_HOT ? 'hot' : total >= GRADE_WARM ? 'warm' : 'cold';
}

/**
 * Grade a running total part-way through a show.
 * @param {number} running points so far
 * @param {number} progress 0-1, how much of the night has been played
 */
export function gradeRunning(running, progress) {
  if (!progress || progress <= 0) return 'warm';
  if (progress >= 1) return gradeScore(running);
  return gradeScore(running / progress);
}

/* `suites` is optional: a Map of song_id to family key from dataLoader. Left
   out, suite links simply score as ordinary segues, which is what every
   caller did before suites existed. */
export function scoreShow(sets, segues, spent, segueCounts, suites) {
  const s = [sets[0] || [], sets[1] || [], sets[2] || []];
  const bud = budgets(s, undefined, spent);

  // Songs, scored against the role each ended up in.
  const perSet = s.map((songs, si) => songs.map((p, i) => {
    const role = roleAt(si, i, songs.length);
    const run = monotonyRun(songs, i, segues);
    return {
      perf: p,
      role,
      mono: run,
      score: scorePerf(p, role, monotonyMult(run.depth)),
    };
  }));
  const songTotal = perSet.flat().reduce((a, x) => a + x.score.subtotal, 0);

  // What the repetition cost, itemised, so the scorecard can show its working
  // rather than just handing back a smaller number than the player expected.
  const monoHits = [];
  perSet.forEach((songs, si) => songs.forEach((x, i) => {
    if (x.score.monotonyMult >= 1) return;
    const full = Math.round(x.score.base * x.score.versionMult * x.score.placementMult);
    monoHits.push({
      set: si, at: i, song: x.perf.song,
      kind: x.mono.kind, depth: x.mono.depth,
      mult: x.score.monotonyMult,
      lost: full - x.score.subtotal,
    });
  }));
  const monoLost = monoHits.reduce((a, x) => a + x.lost, 0);

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

  // Flow — segues only count between songs adjacent inside one set, and are
  // graded: a canonical pair, the exact pair that take played, a run of them,
  // and a closed sandwich are four different achievements.
  const segueHits = [];
  s.forEach((songs, si) => {
    let run = 0;
    // Movements of the current suite carried so far, so the third one can be
    // told from the second. Reset by anything that breaks the chain.
    let suiteRun = 0;
    for (let i = 0; i < songs.length - 1; i++) {
      const a = songs[i], b = songs[i + 1];
      // The take has to have actually segued. A clean take of the same song
      // stops here, which is what makes the arrow worth chasing.
      if (String(a.is_segue) !== 'true') { run = 0; suiteRun = 0; continue; }
      if (!segues || !segues.has(segueKey(a, b))) { run = 0; suiteRun = 0; continue; }
      run += 1;
      {
        const fa = suites && suites.get(a.song_id);
        const fb = suites && suites.get(b.song_id);
        // Two movements once the first link lands, then one per link after.
        suiteRun = (fa && fa === fb) ? (suiteRun ? suiteRun + 1 : 2) : 0;
      }

      const kinds = ['Segue'];
      let points = SEGUE_POINTS;

      // The pair this very performance played, rebuilt.
      if (a.segued_into_id && String(a.segued_into_id) === String(b.song_id)) {
        points += SEGUE_EXACT_BONUS;
        kinds.push('exact');
      }
      // Third consecutive link and beyond — a run, not a coincidence.
      if (run >= 3) { points += SEGUE_CHAIN_BONUS; kinds.push('chain'); }
      // Came back to where it started.
      if (songs.slice(0, i).some(p => p.song_id === b.song_id)) {
        points += SANDWICH_BONUS;
        kinds.push('sandwich');
      }

      /* A SUITE LINK, which is a different thing from a common segue. Two
         movements of one piece, so it is paid a bonus and exempted from both
         brakes below: discounting Seekers pt I > pt II for being played 57
         times punishes the player for the one property that makes it a suite.
         Cannot be farmed, being 8 songs in 3 families that have to turn up in
         consecutive rounds. */
      const suite = !!(suites && suites.get(a.song_id)
        && suites.get(a.song_id) === suites.get(b.song_id));
      if (suite) {
        points += SUITE_BONUS;
        kinds.push('suite');
        /* Past two movements. The band has carried a full Jive I > II > Lee
           exactly twice in 660 shows, so this is priced as the rarity it is.
           `suiteRun` counts movements, not links, hence >= 3 for the second. */
        if (suiteRun >= 3) { points += SUITE_FULL_BONUS; kinds.push('full suite'); }
      }

      // Then the two brakes, applied to the graded total: how routine this
      // pair is for the band, and how many links the night has already had.
      const times = (segueCounts && segueCounts.get(segueKey(a, b))) || 1;
      const fam = suite ? 1 : familiarityMult(times);
      const decay = suite ? 1 : segueDecay(segueHits.length + 1);
      const raw = points;
      points = Math.round(points * fam * decay);
      if (!suite && fam < 0.75) kinds.push('routine');

      segueHits.push({ set: si, from: i, to: i + 1, points, kinds, suite,
        raw, times, fam, decay, a: a.song, b: b.song });
    }
  });

  const all = perSet.flat();
  let dev = 0;
  all.forEach(x => { dev += Math.abs(energyOf(x.perf) - x.role.energy); });
  const avgDev = all.length ? dev / all.length : 0;
  const arc = all.length
    ? Math.max(0, Math.round(ARC_MAX * (1 - avgDev / ARC_ZERO_AT))) : 0;

  const roles = [...new Set(all.flatMap(x => tagsOf(x.perf)))];
  const flatSongs = all.map(x => x.perf);
  const breadth = BREADTH.map(c => {
    const got = all.length ? c.has(flatSongs) : false;
    return {
      id: c.id, label: c.label, blurb: c.blurb, points: c.points, got,
      missed: (!got && c.detail && all.length && c.detail(flatSongs)) || c.missed,
    };
  });
  const breadthTotal = breadth.reduce((a, c) => a + (c.got ? c.points : 0), 0);

  const coolHits = cooldowns(s);
  // Flow is how the picks hang together; breadth is what the night contained.
  // They are siblings, not one inside the other — a scoresheet heading has to
  // equal the rows printed under it.
  const flowTotal = segueHits.reduce((a, x) => a + x.points, 0)
    + coolHits.reduce((a, x) => a + x.points, 0) + arc;

  // The fan headline.
  const totalBudget = bud.reduce((a, b) => a + b, 0);
  const totalUsed = s.flat().reduce((a, p) => a + lenOf(p), 0);
  const cards = new Set(breadth.filter(c => c.got).map(c => c.id));
  const stats = {
    overallRatio: totalBudget ? totalUsed / totalBudget : 0,
    setRatios: time.map(t => t.ratio),
    encoreSongs: s[2].length,
    segues: segueHits.length,
    avgLen: all.length ? totalUsed / all.length : 0,
    songs: all.length,
    // What the night CONTAINED, so a headline can be about the show rather
    // than only about the clock.
    cards,
    breadthGot: cards.size,
    breadthTotal,
    longest: all.reduce((m, x) => Math.max(m, lenOf(x.perf)), 0),
    jamcharts: all.filter(x => isJamchart(x.perf)).length,
    covers: all.filter(x => flag(x.perf.is_cover)).length,
    bustouts: all.filter(x => (Number(x.perf.show_gap) || 0) >= BREADTH_BUSTOUT_GAP).length,
    // The rarest pair rebuilt all night — 1 means a once-ever transition.
    rarestSegue: segueHits.length
      ? Math.min(...segueHits.map(x => x.times)) : null,
    sandwiches: segueHits.filter(x => x.kinds.includes('sandwich')).length,
    cooldowns: coolHits.length,
    total: songTotal + timeTotal + flowTotal + breadthTotal,
  };
  const headline = (HEADLINES.find(h => h.when(stats)) || HEADLINES[HEADLINES.length - 1]).text;

  return {
    total: songTotal + timeTotal + flowTotal + breadthTotal,
    songTotal, timeTotal, flowTotal,
    perSet, time, arc, breadth, breadthTotal, roles,
    segues: segueHits, cooldowns: coolHits, monotony: monoHits, monoLost,
    headline, stats,
    totalUsed, totalBudget,
  };
}

/*
 * WHAT THE BEST LINE THROUGH YOUR OWN SHOWS WAS WORTH.
 *
 * A score with nothing to compare it to is a number. This replays the EXACT
 * shows the player drafted from, in the order they came up, and searches for
 * the best assignment: same shows, same number of picks, same rules, same
 * time already burned on respins. So the answer is always reachable — it is
 * not a fantasy setlist built from songs they never saw.
 *
 * It is a beam search, not an exhaustive one. The decision space is a set
 * partition on top of a per-round choice, and the honest thing is to call the
 * result the best line FOUND rather than the maximum — which is how the UI
 * words it. Beam width and the per-round candidate cap keep it to a few
 * thousand scoreShow calls, fast enough to run on a phone at the final
 * whistle.
 */
export const BEST_BEAM = 24;
export const BEST_CANDIDATES = 8;

/* `suites` threads through to scoreShow. WITHOUT IT THE CEILING IS WRONG in
   the one case that matters: a player who lands a suite would be measured
   against a best line scored as if suites paid nothing, and could beat 100%
   of a target that was supposed to be unreachable. */
export function bestPossible(drafted, segues, segueCounts, spent, suites) {
  const seq = (drafted || []).filter(d => d && d.show && d.show.songs && d.show.songs.length);
  if (!seq.length) return null;

  const clone = st => ({
    sets: st.sets.map(a => a.slice()),
    closed: st.closed.slice(),
    si: st.si,
    taken: new Set(st.taken),
    total: st.total,
  });
  const rank = st => scoreShow(st.sets, segues, spent, segueCounts, suites).total;

  const fresh = () => ({ sets: [[], [], []], closed: [false, false, false], si: 0,
                         taken: new Set(), total: 0 });
  let beam = [fresh()];

  /* The line the player actually played is walked alongside the beam and is
     never pruned. Without it a beam that took a wrong turn early could report
     a "best" BELOW what the player scored, which happened in 7 of 40 test
     games — once by 395 points. A ceiling under the thing it is a ceiling for
     is worse than no ceiling at all. */
  let mirror = fresh();

  /* A state with no legal move has not failed — its show is simply over, the
     same way the real game ends when nothing else fits. Dropping those was
     killing the whole beam: it spends its best songs early, fills all three
     sets, and by round 16 every branch is out of room at once. Keep them,
     stop expanding them, and let them compete on their final score. */
  const finished = [];

  for (const step of seq) {
    const show = step.show;
    const next = [];

    if (mirror) {
      const si = Math.min(step.si === undefined ? mirror.si : step.si, SETS.length - 1);
      while (mirror.si < si) { mirror.closed[mirror.si] = true; mirror.si += 1; }
      if (step.perf) {
        mirror.sets[mirror.si].push(step.perf);
        mirror.taken.add(step.perf.song_id);
        mirror.total = rank(mirror);
      }
    }

    for (const st of beam) {
      const before = next.length;
      // Either play into the current set, or close it first and play into the
      // next one. Closing is free of a round; it is a decision, not a pick.
      for (const advance of [false, true]) {
        const base = advance ? clone(st) : st;
        if (advance) {
          if (base.si >= SETS.length - 1) continue;
          if (danglingSegue(base.sets, base.si)) continue;
          base.closed[base.si] = true;
          base.si += 1;
        }
        const si = base.si;
        const legal = show.songs.filter(p => {
          const sandwich = closesSandwich(base.sets[si], p, segues);
          if (base.taken.has(p.song_id) && !sandwich) return false;
          if (!canPlace(base.sets, si, p, base.closed, spent)) return false;
          if (wouldStrand(base.sets, si, p, base.closed, spent)) return false;
          return true;
        });
        if (!legal.length) continue;
        // Pre-rank cheaply so the expensive full scoring only sees contenders.
        const role = roleAt(si, base.sets[si].length, base.sets[si].length + 1);
        const short = legal
          .map(p => [p, scorePerf(p, role).subtotal])
          .sort((a, b) => b[1] - a[1])
          .slice(0, BEST_CANDIDATES)
          .map(x => x[0]);
        for (const p of short) {
          const cand = clone(base);
          cand.sets[si].push(p);
          cand.taken.add(p.song_id);
          cand.total = rank(cand);
          next.push(cand);
        }
      }
      if (next.length === before) finished.push(st);
    }
    // A dead-ended beam must NOT end the loop: the mirror still has rounds of
    // the player's line left to walk, and cutting it short was reporting a
    // ceiling below the player's own score.
    next.sort((a, b) => b.total - a.total);
    beam = next.slice(0, BEST_BEAM);
  }

  const all = beam.concat(finished, [mirror]);
  let best = all[0];
  for (const st of all) if (st.total > best.total) best = st;
  return {
    total: scoreShow(best.sets, segues, spent, segueCounts, suites).total,
    sets: best.sets,
    // True when the search could not beat the line the player actually played.
    matchedPlayer: !!mirror && best === mirror,
  };
}

export function calcTotal(sets, segues, segueCounts, suites) {
  return scoreShow(sets, segues, undefined, segueCounts, suites).total;
}
