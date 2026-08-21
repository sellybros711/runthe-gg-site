/* Run The Floor: game engine.
 *
 * Headless and dependency-free. Browser: window.RTF_ENGINE. Node:
 * require('./engine.js'). Same architecture as football/engine.js and
 * cfb/engine.js, and the closest sibling is baseball/engine.js, which is the
 * previous reskin of that skeleton. Adapted for basketball:
 *
 *   6 roster slots (PG, SG, SF, PF, C, 6TH)
 *   a $145M cap, which is roughly the real NBA cap
 *   an 82 game season against real all-time team-seasons
 *   offense and defense expressed as ratings per 100 possessions, not per game
 *   Pythagorean expectation at the basketball exponent
 *   play-in, then First Round, Conference Semifinals, Conference Finals, Finals
 *
 * WHAT DID NOT SURVIVE THE PORT. Chemistry and roster shape are multipliers in
 * the baseball engine and RATING POINTS here, because basketball's Pythagorean
 * exponent is 13.91 against baseball's 1.83 and a percentage bonus carried
 * across unchanged would have outweighed every talent decision in the draft.
 * See PYTH_EXP. Anything else ported from a sibling engine deserves the same
 * question: does this quantity mean the same thing in a sport where the better
 * team wins 70% of the time?
 *
 * WHAT DRIVES A PLAYER'S VALUE. Every player carries win shares, split
 * offensive and defensive, which is the basketball number closest to the WAR
 * the baseball engine runs on and the one Basketball-Reference publishes. The
 * split is load-bearing rather than decoration: offensive win shares move what
 * you score and defensive win shares move what you allow, so a lockdown wing
 * and a scoring guard are not interchangeable piles of the same currency.
 *
 * NOTHING IN HERE TOUCHES THE DOM. That is what lets the whole season be
 * replayed from a seed in Node, which is how the balance numbers below were
 * measured, and it is the reason the file is testable at all.
 */

'use strict';
(function() {

const ENGINE_API_VERSION = 1;

// ─── constants ──────────────────────────────────────────────────────────────

const CONSTANTS = {
  /* THE CAP HAS TO SAY NO, or the draft is not a decision, it is a sequence of
     clicks on whoever scored most. $145M is roughly the real NBA cap, it is
     $24M a slot across six players, and the priciest player in the data costs
     $60M. So one superstar eats 41% of the roster and the other five have to
     come in under $85M. That is the shape of the squeeze: one great player is
     comfortable, two is tight, and three means filling the rest of the roster
     with minimum contracts. Best-available on every spin runs to about $300M
     and busts before the season starts, which is the point.

     Priced against hoops/build/build-players.mjs, and the two numbers are one
     decision: moving either without the other breaks the draft. */
  CAP_MUSD: 145,
  REGULAR_SEASON_GAMES: 82,

  RESPIN_LADDER_MUSD: [5, 10, 15],
  MAX_RESPINS: 3,
  MIN_RESERVE_PER_SLOT_MUSD: 2,

  /* PACE: possessions per 48 minutes. Ratings below are per 100 possessions,
     which is how basketball actually measures a team, so points per game only
     appears at the very end when a scoreline has to be printed. Holding the
     league at one pace means a 1996 roster and a 2023 roster meet on the same
     terms instead of the 2023 one winning on possessions alone. */
  LEAGUE_PACE: 99.0,

  /* WHAT LEAGUE AVERAGE IS. Offense and defense are the same thing counted from
     the two ends, so league-average offensive rating and league-average
     defensive rating are the SAME NUMBER by definition. Everything that
     compares one team to another is normalized against it. 113 is roughly the
     modern league. */
  LEAGUE_RTG: 113.0,

  /* THE TWO SCALES, and they were solved rather than guessed. Measured over 200
     drafts per strategy against the data in data/players.json: a six-man core
     drafted on price alone totals about 10 offensive and 6 defensive win
     shares, one drafted on talent alone totals 34 and 17, and the best six the
     cap can buy totals 38 and 24. The best six of a real team-season, which is
     what an opponent is, sits at 30 and 15.4 in the middle of the pool.

     Those four points pin the line: the median team-season has to land exactly
     on league average, because it IS the league, and the best six the cap can
     buy has to land around a 65 win team, because that is a title favorite and
     not a lock for the record. Both scales fall out of that.

     RAISING EITHER ONE ALONE MAKES A WORSE GAME. They set the spread between a
     good roster and a bad one, and the Pythagorean exponent below turns that
     spread into wins at about 2.7 wins per point of net rating. */
  REPLACEMENT_ORTG: 99.5,
  REPLACEMENT_DRTG: 121.5,
  OWS_TO_ORTG: 0.45,
  DWS_TO_DRTG: 0.55,

  /* Morey's exponent, and IT IS WHY THIS ENGINE IS NOT THE BASEBALL ENGINE WITH
     THE WORDS CHANGED. Basketball's Pythagorean curve is far steeper than
     baseball's 1.83, because a basketball game is 200 possessions and a
     baseball game is 70 plate appearances: the better side wins far more often,
     so a small edge in points is a large edge in wins.

     The practical consequence runs through every number below. At 1.83 a 15%
     chemistry bonus is a nudge. At 13.91 the same 15% is a 30 win swing, which
     is why chemistry and roster shape are RATING POINTS in this game and
     multipliers in that one. A percentage bonus ported straight across from
     baseball would have been the single largest term in the model. */
  PYTH_EXP: 13.91,

  /* CONSISTENCY: how far each side's points are pulled toward the expected
     value. At 0 a game is pure variance and at 1 it is decided before tipoff.
     Basketball sits much higher than baseball, at 0.18 against 0.10, and that
     is the sport rather than a preference: the better team wins about 70% of
     regular-season games in the NBA and about 60% in MLB. Drop this and 20 win
     rosters start beating 60 win rosters often enough that the draft stops
     mattering. */
  CONSISTENCY: 0.18,

  /* Home court, as a fraction knocked off the visiting side's points. Real home
     court in the NBA is worth about two and a half points a game. */
  PLAYOFF_HOME_COURT: 0.022,

  /* SEEDING. 50 wins is a real top-six seed in a real conference, 43 is the
     play-in, and below that the season ends in the lottery. Both numbers are
     what the modern league actually pays out, not a curve fitted to the sim. */
  TOP_SIX_WINS: 50,
  PLAY_IN_WINS: 43,
  PLAYOFF_ROUNDS_SEEDED: 4,     // First Round, Semis, Conference Finals, Finals
  PLAYOFF_ROUNDS_PLAY_IN: 5,    // and a play-in game in front of all of it

  /* The two records worth chasing. 72 is the 1996 Bulls, 73 is the 2016
     Warriors, and 74 has never happened. */
  RECORD_WINS: 72,
  GOAT_WINS: 74,
};

/* Eras, so a run can be restricted to one. Seasons are keyed by the year the
   season ENDS, which is the Basketball-Reference convention: the 1995-96 Bulls
   are season 1996. Every date in this game follows that rule. */
const ERAS = {
  seventies: [1970, 1979],
  eighties:  [1980, 1989],
  nineties:  [1990, 1999],
  aughts:    [2000, 2009],
  tens:      [2010, 2019],
  twenties:  [2020, 2026],
};

// ─── roster shape ───────────────────────────────────────────────────────────

/* FIVE STARTERS AND A SIXTH MAN. The football game drafts six, the college game
   drafts six, and a basketball starting five plus the first man off the bench
   is the honest way to land on the same number in this sport. The sixth man
   slot is this game's FLEX: it takes anybody, so a roster can go big or small
   without the slot list forbidding it. */
const SLOTS = ['PG', 'SG', 'SF', 'PF', 'C', '6TH'];

/* Eligibility is deliberately loose at the edges, because basketball positions
   are. A combo guard really can play either guard spot and a modern four really
   can play the five, so the list says so rather than pretending the sport has
   five sealed boxes. What it will not do is let a center play point guard. */
const SLOT_ELIGIBILITY = {
  PG:  ['PG', 'G'],
  SG:  ['SG', 'G', 'GF'],
  SF:  ['SF', 'F', 'GF', 'FC'],
  PF:  ['PF', 'F', 'FC'],
  C:   ['C', 'FC'],
  '6TH': ['PG', 'SG', 'SF', 'PF', 'C', 'G', 'F', 'GF', 'FC'],
};

/* HOW MANY OF ONE POSITION A ROSTER MAY HOLD. With the sixth man slot open to
   anybody, a roster could otherwise carry two centers and no wing, which is not
   a basketball team. One extra of any position is the limit, so a second center
   is legal in the sixth man slot and a third is not. */
const POSITION_MAX = 2;

function positionsOf(player) {
  if (!player.ep) return [player.pp || 'SF'];
  return String(player.ep).split(';').map(s => s.trim()).filter(Boolean);
}

function canFillSlot(player, slotName) {
  const eligible = SLOT_ELIGIBILITY[slotName];
  if (!eligible) return false;
  return positionsOf(player).some(pos => eligible.includes(pos));
}

function teamSeasonId(team, season) {
  return `${team}_${season}`;
}

// ─── random ─────────────────────────────────────────────────────────────────

function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/* mulberry32. Small, fast, and good enough that a season's worth of draws does
   not show structure. Seeded so a run replays identically, which is what makes
   the calibration numbers in this file reproducible. */
function createSeededRNG(seed) {
  let a = seed >>> 0;
  return function() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normal(rng) {
  let u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// ─── re-spin pricing ────────────────────────────────────────────────────────

function respinCost(used) {
  const ladder = CONSTANTS.RESPIN_LADDER_MUSD;
  return ladder[Math.min(used, ladder.length - 1)];
}

function respinFees(used) {
  let total = 0;
  for (let i = 0; i < used; i++) total += respinCost(i);
  return total;
}

// ─── indexing the data ──────────────────────────────────────────────────────

/* Every spinnable team-season needs at least this many drawable players, or the
   wheel lands on a board with nothing on it. Six is the roster size, so six is
   the floor. */
const MIN_SPIN_ROSTER = 6;

function indexData(players) {
  const byTeamSeason = {};
  const allPlayers = {};
  const teamSeasons = [];

  for (const p of players) {
    const tsId = teamSeasonId(p.t, p.s);
    allPlayers[pkey(p)] = p;
    (byTeamSeason[tsId] = byTeamSeason[tsId] || []).push(p);
  }

  for (const roster of Object.values(byTeamSeason)) {
    const first = roster[0];
    /* TOT is Basketball-Reference's row for a player who changed teams
       mid-season. It is a stat line, not a club, and it must never be a thing
       the wheel can land on. */
    if (first.t === 'TOT' || roster.length < MIN_SPIN_ROSTER) continue;
    teamSeasons.push({
      team_season_id: teamSeasonId(first.t, first.s),
      team: first.t,
      season: first.s,
      display: teamDisplay(first.t, first.s),
    });
  }

  // Cheapest first, so the budget floor logic can stop at the first hit.
  for (const roster of Object.values(byTeamSeason)) roster.sort((a, b) => a.p - b.p);

  const teamStats = {};
  const ratingTable = [];
  for (const ts of teamSeasons) {
    const st = teamStrength(byTeamSeason[ts.team_season_id]);
    st.rating = overallRating(teamWinPct(st.ortg, st.drtg));
    ts.rating = st.rating;
    ts.ortg = st.ortg;
    ts.drtg = st.drtg;
    teamStats[ts.team_season_id] = st;
    ratingTable.push(st.rating);
  }
  ratingTable.sort((a, b) => a - b);

  return {
    players,
    allPlayers,
    byTeamSeason,
    teamSeasons,
    teamStats,
    ratingTable,
    cheapBy: buildCheapBy(players),
    oppPool: buildOpponentPool(teamSeasons),
  };
}

/* THE KEY A PLAYER-SEASON IS ADDRESSED BY: id, season, AND CLUB.
 *
 * The club is in there because "a player has one row per season" is false, and
 * it is false in a way that only a real league shows you. A man who is traded in
 * February has TWO rows that season, one per club, and both are real: the 2021
 * Bucks P.J. Tucker and the 2021 Rockets P.J. Tucker are different roster spots
 * a draft can land on.
 *
 * Keyed on id and season alone those two collide, the lookup table keeps
 * whichever was written last, and a board built from one club resolves to the
 * other one's row. The first real data run died on exactly that: a player was
 * offered at a slot his colliding twin could not play, and signing him threw
 * "no slot" from a code path that had been correct for every one of the 171
 * hand-entered rows, because no hand-entered row was ever traded.
 *
 * Signing is still blocked by PLAYER ID, not by this key, so drafting one
 * P.J. Tucker still takes the other off the board. That part was already right.
 *
 * A run stores keys rather than objects so it stays serializable. */
const pkey = (p) => `${p.i}|${p.s}|${p.t}`;

/* What a team-season is worth if you drafted its best six.
 *
 * THE SAME FORMULAS YOUR OWN ROSTER RUNS THROUGH, CHEMISTRY INCLUDED. Leaving
 * chemistry off here quietly rigged every comparison in the player's favour: a
 * drafted roster collected a bonus and the real team it was being ranked
 * against did not, so a 43 win side came back third best in the data. And a real
 * team-season is the one roster in the whole game that is CERTAIN to have
 * chemistry, because all six of them are the same club in the same year. If
 * anything has earned the bonus it is these.
 *
 * Roster shape is deliberately NOT applied. Shape measures how well a drafted
 * six was assembled, and nobody assembled these: they are the six best men a
 * real club happened to have. */
function teamStrength(players) {
  const best = [...players].sort((a, b) => b.w - a.w).slice(0, SLOTS.length);
  const chem = resolveChemistry(best);
  return {
    ortg: rosterOffense(best, chem.bonus, 0),
    drtg: rosterDefense(best, chem.bonus),
    chem: chem.bonus,
    ws: best.reduce((s, p) => s + p.w, 0),
  };
}

/* For each position, the cheapest players sorted by price. The reserve floor
   asks this "what is the least a point guard can cost me" thousands of times
   during a draft, so it is precomputed and capped at 200 per position. */
function buildCheapBy(players) {
  const byPos = {};
  for (const p of players) {
    for (const pos of positionsOf(p)) {
      (byPos[pos] = byPos[pos] || []).push({
        id: pkey(p), ts: teamSeasonId(p.t, p.s), price: p.p,
        /* The PRIMARY position rides along because POSITION_MAX is counted on
           it, and the reserve floor has to respect that limit. A floor that
           promises a cheap center you are not allowed to sign is not a floor,
           it is a draft that strands itself five picks later. */
        pp: p.pp || positionsOf(p)[0],
      });
    }
  }
  for (const pos of Object.keys(byPos)) {
    byPos[pos].sort((a, b) => a.price - b.price);
    byPos[pos] = byPos[pos].slice(0, 200);
  }
  return { '*': byPos };
}

// ─── rating and ranking ─────────────────────────────────────────────────────

/* Expected win% for a rating pair against a LEAGUE AVERAGE opponent, which is
   what a team rating means: how good is this roster, not what did this roster's
   particular slate do to it. The schedule is harder than league average on
   purpose (see SCHEDULE below), so a finished record sits a few games under
   what the rating implies, and that gap is the schedule rather than a bug. */
function teamWinPct(ortg, drtg) {
  const pace = CONSTANTS.LEAGUE_PACE / 100;
  return pythagorean(ortg * pace, drtg * pace);
}

/* A 0 to 100 team rating off expected win%. Pinned at two real points: 41 wins
   is a .500 team and reads 50, and 73 wins is the record and reads 98. Every
   number a player sees on the results screen comes off this line. */
function overallRating(winPct) {
  const wins = winPct * CONSTANTS.REGULAR_SEASON_GAMES;
  const r = 50 + (wins - 41) * 1.5;
  return clamp(Math.round(r * 10) / 10, 1, 100);
}

/* Where a finished season's rating places among every spinnable team-season.
   1 is the best there has ever been. */
function nationalRank(rating, ratingTable) {
  if (!ratingTable || !ratingTable.length) return null;
  let lo = 0, hi = ratingTable.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (ratingTable[mid] <= rating) lo = mid + 1; else hi = mid;
  }
  return (ratingTable.length - lo) + 1;
}

function pythagorean(pointsFor, pointsAgainst, exp) {
  const e = exp || CONSTANTS.PYTH_EXP;
  const pf = Math.pow(Math.max(1, pointsFor), e);
  const pa = Math.pow(Math.max(1, pointsAgainst), e);
  return pf / (pf + pa);
}

// ─── chemistry ──────────────────────────────────────────────────────────────

/* WHAT A LINK IS WORTH, IN RATING POINTS PER 100 POSSESSIONS. Not a percentage:
   see PYTH_EXP above for why a percentage would swamp the entire model in this
   sport. A point of net rating is worth about 2.7 wins, so the ceiling here is
   a shade under seven wins for a perfectly connected roster. That is a real
   prize and it is not a substitute for talent, which is the balance the whole
   feature lives or dies on.

   The deliberate links are the ones a player can go hunting for during a draft,
   so they carry the weight. Era is ambient and nearly free: it exists so a
   coherent all-1980s roster gets a nod, not a bonus. */
const CHEMISTRY = {
  VALUES: {
    family:      1.20,   // curated, and the rarest thing on the board
    reunion:     1.00,   // same club, same season: you drafted actual teammates
    backcourt:   0.80,   // two guards who really did share a backcourt
    frontcourt:  0.80,   // a four and a five who really did share a frontcourt
    alma_mater:  0.60,   // same college, any era
    franchise:   0.50,   // same club, different seasons
    draft_class: 0.25,   // drafted the same year
    era:         0.05,
  },
  MIN: -1.5,
  MAX: 2.5,
  /* Chemistry is mostly about knowing where the other man is going to be, which
     is an offensive fact more than a defensive one. So most of the bonus lands
     on the offensive rating and the rest comes off the defensive one. */
  OFFENSE_SHARE: 0.6,
};

/* Curated real relationships the formula cannot infer, loaded from
   data/chemistry.json. Brothers are the whole of it for now: a symmetric map of
   player id to { otherId: label }. */
let CURATED_FAMILY = {};
function setCuratedChemistry(json) {
  CURATED_FAMILY = {};
  if (!json || !json.families) return;
  for (const fam of json.families) {
    const ids = fam.ids || [];
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        (CURATED_FAMILY[ids[i]] = CURATED_FAMILY[ids[i]] || {})[ids[j]] = fam.label;
        (CURATED_FAMILY[ids[j]] = CURATED_FAMILY[ids[j]] || {})[ids[i]] = fam.label;
      }
    }
  }
}

function familyLink(a, b) {
  const m = CURATED_FAMILY[a.i];
  return m && m[b.i] ? m[b.i] : null;
}

const hasAny = (positions, wanted) => positions.some(p => wanted.includes(p));

function pairLinks(a, b) {
  const links = [];
  const V = CHEMISTRY.VALUES;
  const sameTeam = a.t === b.t;
  const sameSeason = a.s === b.s;
  const aPos = positionsOf(a);
  const bPos = positionsOf(b);

  const fam = familyLink(a, b);
  if (fam) links.push({ type: 'family', value: V.family, label: fam });

  if (sameTeam && sameSeason) {
    links.push({ type: 'reunion', value: V.reunion,
      label: `${a.s} ${TEAM_NAMES[a.t] || a.t} reunion` });

    /* The two positional links only fire on players who were ACTUALLY
       teammates. A point guard from one club and a shooting guard from another
       are not a backcourt, they are two guards, and paying for that would make
       the link free. */
    const guards = ['PG', 'SG', 'G'];
    const bigs = ['PF', 'C', 'FC'];
    if ((hasAny(aPos, ['PG']) && hasAny(bPos, ['SG', 'G'])) ||
        (hasAny(bPos, ['PG']) && hasAny(aPos, ['SG', 'G']))) {
      links.push({ type: 'backcourt', value: V.backcourt, label: 'Backcourt partners' });
    } else if (hasAny(aPos, guards) && hasAny(bPos, guards)) {
      links.push({ type: 'backcourt', value: V.backcourt, label: 'Backcourt partners' });
    }
    if ((hasAny(aPos, ['PF']) && hasAny(bPos, ['C', 'FC'])) ||
        (hasAny(bPos, ['PF']) && hasAny(aPos, ['C', 'FC']))) {
      links.push({ type: 'frontcourt', value: V.frontcourt, label: 'Frontcourt partners' });
    }
  }

  if (sameTeam && !sameSeason) {
    links.push({ type: 'franchise', value: V.franchise,
      label: `${TEAM_NAMES[a.t] || a.t} franchise` });
  }

  if (a.col && b.col && a.col === b.col) {
    links.push({ type: 'alma_mater', value: V.alma_mater, label: `${a.col} men` });
  }

  if (a.dr && b.dr && a.dr === b.dr && a.i !== b.i) {
    links.push({ type: 'draft_class', value: V.draft_class, label: `${a.dr} draft class` });
  }

  if (Math.abs(a.s - b.s) <= 3 && !(sameTeam && sameSeason)) {
    links.push({ type: 'era', value: V.era, label: 'Same era' });
  }

  return links;
}

/* SATURATION IS THE POINT. Raw link value is run through
 * MAX * (1 - e^(-raw/MAX)), so the first link is worth nearly its face value
 * and the eighth is worth almost nothing. Without it a six-man roster off one
 * team-season would collect fifteen reunion links, and chemistry alone would
 * dwarf every talent decision in the draft.
 *
 * Returns a bonus in rating points. `multiplier` is carried alongside as the
 * number a player reads on the roster panel, and is display only: nothing in
 * the model multiplies by it.
 */
function resolveChemistry(roster) {
  const links = [];
  for (let i = 0; i < roster.length; i++) {
    for (let j = i + 1; j < roster.length; j++) {
      for (const l of pairLinks(roster[i], roster[j])) {
        links.push({ ...l, a: roster[i].n, b: roster[j].n });
      }
    }
  }

  const positives = links.filter(l => l.value > 0).sort((a, b) => b.value - a.value);
  const negatives = links.filter(l => l.value < 0);
  const raw = positives.reduce((s, l) => s + l.value, 0);
  const saturated = CHEMISTRY.MAX * (1 - Math.exp(-raw / CHEMISTRY.MAX));
  const penalties = negatives.reduce((s, l) => s + l.value, 0);
  const bonus = clamp(saturated + penalties, CHEMISTRY.MIN, CHEMISTRY.MAX);

  return {
    bonus,
    raw,
    saturated,
    multiplier: 1 + bonus / CONSTANTS.LEAGUE_RTG,
    links: positives.concat(negatives),
  };
}

// ─── the two ratings a roster produces ──────────────────────────────────────

/* OFFENSE, per 100 possessions. Offensive win shares only: a defensive
   specialist contributes here by being on the roster at all, not by having his
   defensive value quietly counted a second time.
   The sixth man is real but partial, see MINUTES_SHARE. */
function rosterOffense(roster, chemBonus, structureBonus) {
  const ows = roster.reduce((s, p) => s + Math.max(0, p.ow) * minutesShare(p), 0);
  return CONSTANTS.REPLACEMENT_ORTG
    + ows * CONSTANTS.OWS_TO_ORTG
    + (chemBonus || 0) * CHEMISTRY.OFFENSE_SHARE
    + (structureBonus || 0);
}

/* DEFENSE, per 100 possessions, and LOWER IS BETTER. Which is the only reason
   the chemistry term is SUBTRACTED here and added above: it is the same bonus
   pointed at the other end of the game. */
function rosterDefense(roster, chemBonus) {
  const dws = roster.reduce((s, p) => s + Math.max(0, p.dw) * minutesShare(p), 0);
  return CONSTANTS.REPLACEMENT_DRTG
    - dws * CONSTANTS.DWS_TO_DRTG
    - (chemBonus || 0) * (1 - CHEMISTRY.OFFENSE_SHARE);
}

/* A starter plays starter minutes and the sixth man does not. 0.72 is about
   what the sixth man on a real rotation gets against a starter, and it is the
   only reason the 6TH slot is a cheaper place to put a star than a starting
   spot is. */
const MINUTES_SHARE = { starter: 1.0, sixth: 0.72 };
function minutesShare(p) {
  return p._slot === '6TH' ? MINUTES_SHARE.sixth : MINUTES_SHARE.starter;
}

// ─── what this team actually plays ──────────────────────────────────────────

/* THE SYSTEMS ARE REAL AND SO ARE THE TEAMS THEY ARE NAMED FOR. Every one of
 * these is a way an actual NBA team actually won games, detected off the six
 * players in front of you rather than picked from a menu, and the point of them
 * is that a fan should be able to look at a finished roster and say "yes, that
 * is what that is" before reading the label.
 *
 * They are ordered MOST SPECIFIC FIRST and the first match wins, because the
 * demanding identities are the interesting ones: a roster that genuinely is the
 * Death Lineup also satisfies Pace and Space, and being told it is Pace and
 * Space would be true and boring.
 *
 * The bonus is small on purpose, a fraction of a rating point. A system is a
 * reward for building something coherent, not a substitute for building
 * something good, and a player who chases the label at the cost of two win
 * shares has made a bad trade. That is the correct trade to make available.
 */
const SYSTEMS = [
  {
    /* CHECKED FIRST, BECAUSE IT OVERRIDES EVERYTHING. A roster whose six men
       want thirty more shots a night than exist is not playing a system, it is
       six players taking turns, and whatever else it might have qualified for
       is not what a fan would call it. This was found the honest way: a roster
       of Jordan, Harden, Bryant, Malone and O'Neal came back labelled Showtime,
       off Harden's assist average, while the shot model was charging it eight
       and a half rating points for being unplayable. */
    key: 'too_many_mouths',
    name: 'Too Many Mouths',
    blurb: 'Six men who all had the ball on their own team. Somebody here is not getting it back.',
    detect: (r, P) => (P.shots > FIT.SHOT_BUDGET + 18 ? 1 : -1),
    bonus: 0,
  },
  {
    key: 'point_centre',
    name: 'Point Centre',
    blurb: 'The offense runs through a seven footer at the elbow. Everything is a read, and he makes all of them.',
    detect: (r, P) => {
      /* HIS PRIMARY POSITION, not merely eligible there. Draymond Green can
         play the five and passed like a guard, and on eligibility alone the
         2016 Warriors came back Point Centre rather than the spacing team the
         whole league spent five years copying. */
      const big = r.filter(p => p.pp === 'C')
        .sort((a, b) => paceAdjust(b.ast || 0, b.s) - paceAdjust(a.ast || 0, a.s))[0];
      if (!big || paceAdjust(big.ast || 0, big.s) < 6.0) return -1;
      /* And he has to be the one doing it, not a passing big standing next to a
         nine assist point guard. */
      if (paceAdjust(big.ast, big.s) < P.bestCreator - 0.5) return -1;
      return fit(over(paceAdjust(big.ast, big.s), 6.0, 4.0));
    },
    bonus: 0.55,
  },
  {
    key: 'moreyball',
    name: 'Moreyball',
    blurb: 'Threes and layups, nothing in between. A guard who shoots from the logo and a centre who only dunks.',
    detect: (r, P) => {
      const shooter = r.filter(p => hasAny(positionsOf(p), ['PG', 'SG', 'G', 'GF']))
        .map(spacingIndex).sort((a, b) => b - a)[0] || 0;
      if (shooter < 1.35 || P.tpa < FIT.MODERN_TPA) return -1;
      const topTpa = Math.max(...r.map(p => paceAdjust(p.tpa || 0, p.s)));
      if (topTpa < FIT.MODERN_SHOOTER_TPA) return -1;
      /* The other half of it, and the half people forget: a rim runner who
         never shoots. The shape is deliberate, not a gap in the roster. */
      const rimRunner = r.find(p => hasAny(positionsOf(p), ['C', 'FC'])
        && (p.tpa || 0) < 1.0 && paceAdjust(p.reb || 0, p.s) >= 8);
      if (!rimRunner || P.bestCreator < 6.0) return -1;
      return fit(over(shooter, 1.35, 1.0), over(P.bestCreator, 6.0, 4.0));
    },
    bonus: 0.50,
  },
  {
    key: 'seven_seconds',
    name: 'Seven Seconds or Less',
    blurb: 'A shooting point guard, a floor stretched to the arc, and a shot up before the defense is set.',
    detect: (r, P) => {
      const pg = r.find(p => (p._slot || p.pp) === 'PG');
      if (!pg || spacingIndex(pg) < 1.4 || paceAdjust(pg.ast || 0, pg.s) < 5.5) return -1;
      if (P.spacing < 1.25 || P.tpa < FIT.MODERN_TPA) return -1;
      if (paceAdjust(pg.tpa || 0, pg.s) < FIT.MODERN_SHOOTER_TPA) return -1;
      return fit(over(P.spacing, 1.25, 0.7), over(spacingIndex(pg), 1.4, 1.4));
    },
    bonus: 0.60,
  },
  {
    key: 'death_lineup',
    name: 'The Death Lineup',
    blurb: 'No true centre, five men who can switch every screen, and shooting at every position.',
    detect: (r, P) => {
      /* A TRUE CENTRE BY POSITION, not by rebound count. The lineup this is
         named after played Draymond Green at the five and he pulled down 9.5 a
         night, so testing on rebounds excluded the exact roster the system
         exists to recognise. What makes it the Death Lineup is that the biggest
         man on the floor is a forward. */
      const centres = r.filter(p => p.pp === 'C').length;
      if (centres) return -1;
      if (P.spacing < 1.2 || P.steals < 5.5 || P.tpa < FIT.MODERN_TPA) return -1;
      return fit(over(P.spacing, 1.2, 0.8), over(P.steals, 5.5, 3.0));
    },
    bonus: 0.60,
  },
  {
    key: 'pick_and_roll',
    name: 'Pick and Roll',
    blurb: 'A guard who reads it perfectly and a big who sets it and dives. Two men, and nobody has ever guarded it.',
    detect: (r, P) => {
      const guard = r.filter(p => hasAny(positionsOf(p), ['PG', 'G']))
        .sort((a, b) => paceAdjust(b.ast || 0, b.s) - paceAdjust(a.ast || 0, a.s))[0];
      if (!guard || paceAdjust(guard.ast || 0, guard.s) < 7.0) return -1;
      const big = r.filter(p => hasAny(positionsOf(p), ['PF', 'C', 'FC']))
        .sort((a, b) => paceAdjust(b.pts || 0, b.s) - paceAdjust(a.pts || 0, a.s))[0];
      if (!big || paceAdjust(big.pts || 0, big.s) < 18) return -1;
      return fit(over(paceAdjust(guard.ast, guard.s), 7.0, 5.0),
                 over(paceAdjust(big.pts, big.s), 18, 10));
    },
    bonus: 0.55,
  },
  {
    key: 'twin_towers',
    name: 'Twin Towers',
    blurb: 'Two genuine bigs, the glass owned at both ends, and nothing easy at the rim.',
    detect: (r, P) => {
      const bigs = r.filter(p => hasAny(positionsOf(p), ['C', 'FC'])
        && paceAdjust(p.reb || 0, p.s) >= 8).length;
      if (bigs < 2 || P.bestRim < 1.4) return -1;
      return fit(over(P.reb, 38, 10), over(P.bestRim, 1.4, 1.6));
    },
    bonus: 0.55,
  },
  {
    key: 'grit_and_grind',
    name: 'Grit and Grind',
    blurb: 'Nobody scores easily, nobody scores often, and the game is played in the mud.',
    detect: (r, P) => {
      const dws = r.reduce((s, p) => s + Math.max(0, p.dw), 0);
      const ows = r.reduce((s, p) => s + Math.max(0, p.ow), 0);
      if (dws < 13 || P.spacing > 1.0 || P.shots > 70) return -1;
      /* THE SHARE, NOT THE TOTAL. Thirteen defensive win shares is true of
         almost any good roster, so on the total alone this became the label for
         half the league: the 2013 Heat and the 2023 Nuggets both came back Grit
         and Grind, which is not what either of those teams was. What actually
         makes a team this is that its value sits disproportionately at the
         defensive end. Above 38% is the 1989 Pistons and the 2004 Pistons; the
         2013 Heat are at 30% and are correctly something else. */
      const share = (ows + dws) > 0 ? dws / (ows + dws) : 0;
      if (share < 0.38) return -1;
      return fit(over(share, 0.38, 0.10), over(P.bestRim, 0.9, 1.6));
    },
    bonus: 0.55,
  },
  {
    key: 'triangle',
    name: 'The Triangle',
    blurb: 'A dominant wing, a post to play through, and everybody spaced where the read expects them.',
    detect: (r, P) => {
      const wing = r.filter(p => hasAny(positionsOf(p), ['SG', 'SF', 'GF']))
        .sort((a, b) => (b.ow || 0) - (a.ow || 0))[0];
      if (!wing || (wing.ow || 0) < 8) return -1;
      /* NINE POINTS, NOT TWELVE. The triangle needs somebody who can catch it
         and play out of the post, not a scoring centre: Luc Longley averaged
         9.1 on the team this offense is most famous for, and a threshold of
         twelve excluded the 1996 Bulls from the system they ran. */
      const post = r.find(p => hasAny(positionsOf(p), ['C', 'FC'])
        && paceAdjust(p.pts || 0, p.s) >= 9);
      if (!post) return -1;
      /* The triangle famously does not need a point guard, and that is the
         thing to detect: a roster whose creation comes from the wing rather
         than from a lead guard. */
      if (P.bestCreator > 8.0) return -1;
      /* AND IT IS NOT A SPACING OFFENSE. The triangle is read-and-react out of
         the post with the floor divided into strong side and weak side, which
         is close to the opposite of pulling everybody to the arc. Without this
         it claimed the 2017 Warriors, who are the team that ended the argument
         in favour of the other thing. */
      if (P.spacing > 1.05) return -1;
      return fit(over(wing.ow, 8, 6), over(paceAdjust(post.pts, post.s), 12, 10));
    },
    bonus: 0.55,
  },
  {
    key: 'seven_footers',
    name: 'Bully Ball',
    blurb: 'The ball goes inside, it stays inside, and the rest of the league gets tired.',
    detect: (r, P) => {
      const post = r.filter(p => hasAny(positionsOf(p), ['C', 'FC'])
        && paceAdjust(p.pts || 0, p.s) >= 18)[0];
      if (!post || P.spacing > 1.0) return -1;
      return fit(over(paceAdjust(post.pts, post.s), 18, 10), over(P.reb, 36, 10));
    },
    bonus: 0.45,
  },
  {
    key: 'showtime',
    name: 'Showtime',
    blurb: 'A great passer pushing it every time, and wings who beat everybody down the floor.',
    detect: (r, P) => {
      if (P.bestCreator < 8.0) return -1;
      const bigs = r.filter(p => hasAny(positionsOf(p), ['C', 'FC'])).length;
      if (bigs > 2) return -1;
      /* EVERYBODY PASSED, which is the half a single assist average cannot see.
         One man averaging nine assists on a roster that never moves the ball is
         not Showtime, it is a great point guard on an iso team, and the ratio
         of the roster's assists to its shots is what tells them apart. */
      if (!P.shots || P.ast / P.shots < 0.32) return -1;
      return fit(over(P.bestCreator, 8.0, 5.0), over(P.ast / P.shots, 0.32, 0.08));
    },
    bonus: 0.55,
  },
  {
    key: 'motion',
    name: 'Motion Offense',
    blurb: 'Nobody dominates the ball, everybody touches it, and the extra pass is always there.',
    detect: (r, P) => {
      const hog = Math.max(...r.map(p => paceAdjust(p.fga || 0, p.s)));
      if (hog > 17 || P.ast < 22) return -1;
      return fit(over(P.ast, 22, 8), 1 - over(hog, 12, 6));
    },
    bonus: 0.50,
  },
  {
    key: 'pace_and_space',
    name: 'Pace and Space',
    blurb: 'Shooting everywhere, a rim runner to finish, and the floor pulled wide open.',
    detect: (r, P) => {
      if (P.spacing < 1.05 || P.tpa < FIT.MODERN_TPA) return -1;
      return fit(over(P.spacing, 1.05, 0.9));
    },
    bonus: 0.45,
  },
  {
    key: 'iso',
    name: 'Iso Ball',
    blurb: 'One man with the ball and four men watching. It works right up until it does not.',
    detect: (r, P) => {
      /* SHARE, not attempts. Every good team has a man taking twenty shots a
         night: Jordan took 22.6 on a 72 win team. What makes it iso ball is
         that nobody ELSE is taking any, so this reads his share of the
         roster's shots rather than his raw total. */
      const hog = Math.max(...r.map(p => paceAdjust(p.fga || 0, p.s)));
      const share = P.shots ? hog / P.shots : 0;
      if (share < 0.32 || P.bestCreator > 7.0) return -1;
      return fit(over(share, 0.32, 0.12));
    },
    /* NO BONUS. Iso ball is a real identity and a real way to lose in May, so
       it is named without being rewarded. Naming it is the point: a player who
       drafts three volume scorers should be told what he has built. */
    bonus: 0,
  },
];

const over = (v, min, span) => clamp(((v || 0) - min) / span, 0, 1);
const fit = (...xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

/* First match wins, most specific first. A roster that matches nothing is not
   punished, it is just told it has no identity, which is information. */
function detectSystem(roster, profile) {
  const P = profile || rosterProfile(roster);
  for (const s of SYSTEMS) {
    const f = s.detect(roster, P);
    if (f >= 0) {
      return {
        key: s.key,
        name: s.name,
        blurb: s.blurb,
        fit: clamp(f, 0, 1),
        /* A partial fit earns a partial bonus, so scraping into an identity is
           worth less than genuinely being one. */
        bonus: s.bonus * (0.55 + 0.45 * clamp(f, 0, 1)),
      };
    }
  }
  return null;
}

// ─── the league a player came from ──────────────────────────────────────────

/* WHAT THE GAME WAS LIKE WHEN HE PLAYED IT, and the reason this table exists at
 * all: without it, "does this roster space the floor" is a question that
 * punishes every player who retired before 1980 for a line that did not exist
 * yet. Jerry West attempted zero three-pointers in 1972. So did everybody. That
 * is a fact about the league, not about Jerry West, and a game that reads it as
 * a flaw in his game is not a basketball game, it is a spreadsheet with a
 * scoreboard on it.
 *
 * So spacing is measured RELATIVE TO ERA. A player is compared to what his own
 * league shot, and a 1972 roster comes out neutral rather than broken.
 *
 * The boundaries are real rule changes and real inflection points, which is why
 * they are uneven:
 *
 *   1980  the three-point line arrives, and nobody trusts it for years
 *   1995  the line is SHORTENED to a uniform 22 feet and volume triples
 *   1998  the line goes back out, and scoring collapses to a modern low
 *   2002  the illegal defense rules go, zone comes in
 *   2005  hand-checking is outlawed, guards get the league back
 *   2015  the pace-and-space era proper
 *   2018  freedom of movement is re-emphasised and volume explodes again
 *
 * PACE is possessions per 48 minutes and it is the other half of era
 * translation: a 1972 team played about 108 possessions a night and a 1999 team
 * played 89. Raw per-game numbers are not comparable across that gap, and a
 * game that pretends otherwise hands the 1960s and 1970s an enormous unearned
 * edge in every counting stat.
 */
const ERA_CONTEXT = [
  { from: 0,    to: 1979, pace: 108.0, tpa: 0.0,  name: 'Before the three' },
  { from: 1980, to: 1986, pace: 103.0, tpa: 2.4,  name: 'The line arrives' },
  { from: 1987, to: 1994, pace: 97.0,  tpa: 7.0,  name: 'The late eighties' },
  { from: 1995, to: 1997, pace: 92.0,  tpa: 15.3, name: 'The shortened line' },
  { from: 1998, to: 2004, pace: 90.5,  tpa: 13.7, name: 'Hand-check basketball' },
  { from: 2005, to: 2011, pace: 92.0,  tpa: 18.1, name: 'Freedom of movement' },
  { from: 2012, to: 2017, pace: 95.0,  tpa: 22.4, name: 'Pace and space' },
  { from: 2018, to: 9999, pace: 99.5,  tpa: 33.0, name: 'The three-point revolution' },
];

function eraOf(season) {
  for (const e of ERA_CONTEXT) if (season >= e.from && season <= e.to) return e;
  return ERA_CONTEXT[ERA_CONTEXT.length - 1];
}

/* Per-game counting stats, translated out of the player's own pace and into the
   league this game is played at. A 1972 line is deflated because 1972 played
   nineteen more possessions a night than the game does here; a 1999 line is
   inflated for the same reason in reverse. */
function paceAdjust(value, season) {
  return value * (CONSTANTS.LEAGUE_PACE / eraOf(season).pace);
}

/* HOW MUCH THIS MAN SPACED THE FLOOR, as a share of what his own league shot
   from three. 1.0 is exactly a league-average volume shooter for his era, 2.0
   is double it, and a player from before the line comes back 1.0 rather than 0:
   he is neither credited nor punished for a shot nobody was taking.

   Volume rather than percentage on purpose. A defense has to decide whether to
   leave a man, and it decides on whether he SHOOTS, which is why a 38% shooter
   who takes nine of them bends a defense further out of shape than a 44%
   shooter who takes one. */
/* TWO HALVES, BECAUSE VOLUME ALONE GETS STEVE KERR WRONG.
 *
 * On volume against his era, the best shooter of the 1990s reads as exactly
 * average: Kerr attempted 2.9 threes a night in a league attempting 15.3 across
 * five men, so the ratio is 0.95 and the model had nothing to say about him.
 * That is plainly a wrong answer about a man who took half his shots from
 * behind the line.
 *
 * So the other half is SHOT PROFILE: what share of his own attempts came from
 * three, against what share his league took. Kerr is 48% against a league at
 * 17%, which is the number that actually describes him. Curry scores high on
 * both. A centre who never shoots one scores zero on both. Averaging them means
 * a man is a spacer if he shoots a lot of them, or if that is mostly what he
 * shoots, and most if both.
 *
 * Both halves are still era-relative, so a player from before the line comes
 * back 1.0 and is neither credited nor punished for a shot nobody was taking. */
const LEAGUE_FGA = 88;                         // attempts by a whole team, a night
/* Both halves are ratios against a league average, and in an era that barely
   shot threes at all the denominator is tiny: Larry Bird's 2.3 attempts a night
   in 1986 came out at four and a half times league average on volume and over
   four times on rate. Uncapped, that made the early eighties read as the best
   spacing era in the game, which is the opposite of true. */
const SPACING_CAP = 2.5;

function spacingIndex(player) {
  const era = eraOf(player.s);
  if (!era.tpa) return 1.0;

  const perMan = era.tpa / 5;
  const volume = clamp((player.tpa || 0) / perMan, 0, SPACING_CAP);

  const leagueRate = era.tpa / LEAGUE_FGA;
  const rate = (player.fga || 0) > 0 && leagueRate > 0
    ? clamp(((player.tpa || 0) / player.fga) / leagueRate, 0, SPACING_CAP)
    : 0;

  return clamp((volume + rate) / 2, 0, SPACING_CAP);
}

// ─── roster fit ─────────────────────────────────────────────────────────────

/* WIN SHARES MEASURE TALENT. FIT MEASURES WHETHER THESE PARTICULAR SIX CAN PLAY
 * TOGETHER, and it is where this stops being a game about picking the biggest
 * numbers.
 *
 * Five components, each worth rating points, each one an argument basketball
 * fans have already been having for forty years:
 *
 *   SHOTS      the ball only bounces once. Six players who each took twenty
 *              shots a night cannot all take twenty on the same team.
 *   SPACING    somebody has to be able to shoot, or the paint is a car park.
 *   RIM        an anchor at the back, or every drive is a layup.
 *   CREATION   somebody has to make the pass, or the offense is five men
 *              taking turns.
 *   GLASS      possessions, which is the oldest argument in the sport.
 *
 * WHY POINTS AND NOT PERCENTAGES. Same reason as chemistry: at a Pythagorean
 * exponent of 13.91 a percentage bonus becomes the largest term in the whole
 * model. See PYTH_EXP. Everything that shapes a roster in this engine is
 * denominated in rating points so it can be compared to everything else, and so
 * the results screen can print "spacing cost you 1.4" and have that mean
 * something exact.
 */
const FIT = {
  MIN: -6.0,
  MAX: 3.0,

  /* THE SHOT BUDGET. An NBA team takes about 88 field goal attempts a game, and
     a six man core is not the whole team: the rest of the bench takes theirs
     too. 72 is what a real core six accounts for. Every attempt over that is a
     shot somebody on this roster is not going to get, and it is charged for. */
  SHOT_BUDGET: 72,
  SHOT_COST: 0.16,          // rating points per attempt over budget
  /* Under budget is a real problem too, but a much smaller one, because a
     roster nobody wants to shoot on has already been punished by having no
     offensive win shares. This is just the last nudge. */
  SHOT_SHY: 58,
  SHOT_SHY_COST: 0.07,

  /* SPACING. The roster's mean spacing index, where 1.0 is five league-average
     volume shooters for their own eras. Below 0.75 the paint closes. */
  SPACING_FLOOR: 0.75,
  SPACING_GOOD: 1.35,
  SPACING_COST: 3.4,        // points lost at zero spacing
  SPACING_GAIN: 1.2,        // points gained at elite spacing

  /* RIM PROTECTION IS AN ANCHOR, NOT A SUM. Five men with 0.4 blocks each do
     not add up to a rim protector; one man with 2.0 is one. So this reads the
     best shot blocker on the roster, not the total. */
  RIM_ANCHOR: 1.30,
  RIM_NONE: 0.45,
  RIM_COST: 2.2,
  RIM_GAIN: 0.9,

  /* CREATION. Same shape: a primary creator is a person, not a committee. Read
     off the best passer, with a smaller nod to the roster's total. */
  CREATOR: 5.5,
  CREATOR_NONE: 2.5,
  CREATION_COST: 2.0,
  CREATION_GAIN: 0.8,
  TEAM_AST: 20.0,
  TEAM_AST_WEIGHT: 0.04,

  /* SOME SYSTEMS DID NOT EXIST BEFORE THE THREE-POINT LINE, and naming a roster
     after one of them because its era-relative spacing looked high is how the
     1986 Celtics came back labelled Moreyball. Era-relative is exactly right for
     the spacing PENALTY, because a 1972 team should not be docked for a shot
     nobody was taking. It is exactly wrong for naming a modern system, because
     a guard taking 1.2 threes a night in a league that took 2.4 is twice league
     average and still not spacing anybody out. So the modern identities carry an
     absolute floor in actual attempts on top of the relative one. */
  MODERN_TPA: 18.0,          // the roster's own three-point attempts per game
  MODERN_SHOOTER_TPA: 5.0,   // and what one man has to be taking

  /* THE GLASS. A core six accounts for about 34 of a team's rebounds. */
  REB_TARGET: 34.0,
  REB_WEIGHT: 0.07,
  REB_CAP: 1.2,
};

/* Everything the fit model needs about a roster, computed once. Pace-adjusted
   throughout, so a 1972 line and a 2023 line are being asked the same question.
   The sixth man contributes at his minutes share, like everywhere else. */
function rosterProfile(roster) {
  let shots = 0, ast = 0, reb = 0, spacing = 0, weight = 0, tpa = 0;
  let bestRim = 0, bestCreator = 0, bestSpacing = 0, steals = 0;

  for (const p of roster) {
    const m = minutesShare(p);
    shots += paceAdjust(p.fga || 0, p.s) * m;
    ast += paceAdjust(p.ast || 0, p.s) * m;
    reb += paceAdjust(p.reb || 0, p.s) * m;
    steals += paceAdjust(p.stl || 0, p.s) * m;
    tpa += paceAdjust(p.tpa || 0, p.s) * m;

    const si = spacingIndex(p);
    spacing += si * m;
    weight += m;
    if (si > bestSpacing) bestSpacing = si;

    /* The anchors are read at full strength whoever they are. A rim protector
       coming off the bench still protects the rim while he is out there, and
       docking him for it would say something false about basketball. */
    const blk = paceAdjust(p.blk || 0, p.s);
    if (blk > bestRim) bestRim = blk;
    const a = paceAdjust(p.ast || 0, p.s);
    if (a > bestCreator) bestCreator = a;
  }

  return {
    shots, ast, reb, steals, tpa,
    spacing: weight ? spacing / weight : 1,
    bestRim, bestCreator, bestSpacing,
  };
}

/* WHAT THIS MAN IS FOR, in the words the game charges for.
 *
 * The fit model is only strategy if a player can look at a board and see which
 * of these five names is missing from his roster. Showing the SIGNED CHANGE to
 * each component instead was the first attempt and it was useless: on a two man
 * roster every candidate reads as a huge improvement to everything, because
 * what is actually being measured is that the roster has four empty slots.
 *
 * So a board says what a player IS, and the roster panel says what the roster
 * still NEEDS, and the two meet in the middle. Thresholds are the same ones
 * rosterFit charges against, so a badge is never a claim the model disagrees
 * with. Pace-adjusted, so a 1972 line and a 2023 line earn the same badge on
 * the same evidence.
 */
function playerTags(player) {
  const tags = [];
  const si = spacingIndex(player);
  const fga = paceAdjust(player.fga || 0, player.s);
  const ast = paceAdjust(player.ast || 0, player.s);
  const blk = paceAdjust(player.blk || 0, player.s);
  const reb = paceAdjust(player.reb || 0, player.s);
  const stl = paceAdjust(player.stl || 0, player.s);

  if (si >= 1.35) tags.push({ key: 'shooter', label: 'Shooter', good: true });
  if (blk >= FIT.RIM_ANCHOR) tags.push({ key: 'rim', label: 'Rim protector', good: true });
  if (ast >= FIT.CREATOR) tags.push({ key: 'creator', label: 'Creator', good: true });
  if (reb >= 9.5) tags.push({ key: 'glass', label: 'Rebounder', good: true });
  if (stl >= 1.8) tags.push({ key: 'hands', label: 'Ball hawk', good: true });

  /* THE ONE THAT COSTS. A high volume scorer is not a bad player, he is an
     expensive one in a currency that is not dollars, and the badge is there so
     that cost is visible before the click rather than after the season. */
  if (fga >= 17) tags.push({ key: 'volume', label: `${fga.toFixed(0)} shots`, good: false });
  if (si < 0.35 && eraOf(player.s).tpa > 0) {
    tags.push({ key: 'nonshooter', label: 'No range', good: false });
  }
  return tags;
}

/* A component's contribution, in rating points: nothing in the dead band, a
   linear penalty below it, a linear (and smaller) bonus above. */
function band(value, floor, good, cost, gain) {
  if (value < floor) return -cost * clamp((floor - value) / floor, 0, 1);
  if (value > good) return gain * clamp((value - good) / good, 0, 1);
  return 0;
}

function rosterFit(roster) {
  const P = rosterProfile(roster);
  const F = FIT;

  // The ball only bounces once.
  let shots = 0;
  if (P.shots > F.SHOT_BUDGET) shots = -(P.shots - F.SHOT_BUDGET) * F.SHOT_COST;
  else if (P.shots < F.SHOT_SHY) shots = -(F.SHOT_SHY - P.shots) * F.SHOT_SHY_COST;

  const spacing = band(P.spacing, F.SPACING_FLOOR, F.SPACING_GOOD,
    F.SPACING_COST, F.SPACING_GAIN);
  const rim = band(P.bestRim, F.RIM_ANCHOR, F.RIM_ANCHOR * 1.7,
    F.RIM_COST, F.RIM_GAIN) - (P.bestRim < F.RIM_NONE ? F.RIM_COST * 0.35 : 0);

  const creation = band(P.bestCreator, F.CREATOR, F.CREATOR * 1.5,
    F.CREATION_COST, F.CREATION_GAIN)
    - (P.bestCreator < F.CREATOR_NONE ? F.CREATION_COST * 0.4 : 0)
    + clamp((P.ast - F.TEAM_AST) * F.TEAM_AST_WEIGHT, -1.0, 0.8);

  const glass = clamp((P.reb - F.REB_TARGET) * F.REB_WEIGHT, -F.REB_CAP, F.REB_CAP);

  const system = detectSystem(roster, P);
  const parts = { shots, spacing, rim, creation, glass, system: system ? system.bonus : 0 };
  const bonus = clamp(shots + spacing + rim + creation + glass + parts.system, F.MIN, F.MAX);

  return {
    bonus,
    parts,
    profile: P,
    system,
    /* Kept for the sibling engines' vocabulary and for anything that still reads
       an archetype off a roster. The system IS the archetype in this game. */
    archetype: system
      ? { key: system.key, name: system.name, bonus: system.bonus }
      : { key: 'mixed', name: 'No Identity', bonus: 0 },
    multiplier: 1 + bonus / CONSTANTS.LEAGUE_RTG,   // display only
  };
}


// ─── one game ───────────────────────────────────────────────────────────────

/* A basketball scoreline, from two expected point totals. The spread around
   each side is about 11 points, which is what a real team's game-to-game
   scoring actually looks like, then CONSISTENCY pulls both back toward the
   mean. Overtime is a coin flip, because a tie at the buzzer genuinely is one
   at this level of detail. */
const GAME_SD = 11.0;

function resolveGame(pointsFor, pointsAgainst, rng, advantage) {
  const adv = advantage || 1;
  const C = CONSTANTS.CONSISTENCY;

  let yours = pointsFor + normal(rng) * GAME_SD;
  let theirs = pointsAgainst + normal(rng) * GAME_SD;

  yours = yours * (1 - C) + pointsFor * C;
  theirs = theirs * (1 - C) + pointsAgainst * C;
  theirs = theirs / adv;

  let y = Math.max(50, Math.round(yours));
  let t = Math.max(50, Math.round(theirs));
  let ot = 0;
  while (y === t) {
    // Overtime: five more minutes of the same two teams, decided on the flip.
    ot++;
    const bump = 8 + Math.round(rng() * 6);
    if (rng() < 0.5) y += bump + 2; else t += bump + 2;
    if (ot > 3) { y += 1; break; }
  }

  return { won: y > t, yourPoints: y, oppPoints: t, ot };
}

// ─── the schedule ───────────────────────────────────────────────────────────

/* YOUR SLATE IS REAL TEAMS. Every opponent is a team-season out of the same
   data you drafted from, which is what stops the season being 82 games against
   an abstraction.
 *
 * TWO THINGS IN HERE ARE DELIBERATELY NOT ABSOLUTE NUMBERS, and both were
 * absolute numbers first. The pool was selected by "rating at least 44", which
 * on the seed dataset selected NOTHING, because the best team-season in it
 * rates 42 and the whole slate silently fell back to abstract opponents. A
 * threshold that depends on the data landing where you expected it is a
 * difficulty setting that changes the first time the data does, and this data
 * is going to change: the seed is 22 all-time teams and the finished dataset is
 * an entire league, most of which is average by construction.
 *
 * So the pool is a PERCENTILE (the slate always exists, whatever it is drawn
 * from), and its strength is NORMALIZED (the average opponent is always
 * SLATE_NET better than league average, whatever the pool happens to hold).
 * The spread between opponents survives; the level does not. That is what keeps
 * a fetch that doubles the dataset from also rebalancing the game.
 */
const SCHEDULE = {
  CONTENDER_PERCENTILE: 0.40,   // the slate is drawn from the top 60%
  MARQUEE_PERCENTILE: 0.88,     // the top 12% are the marquee nights
  MARQUEE_GAMES: 18,
  OPP_GAME_SD: 2.4,
  /* THE DIFFICULTY DIAL, in net rating points. The average night is a slightly
     above average team and a marquee night is a title contender, which over 82
     games works out at about 1.5 points of net rating harder than a neutral
     schedule: roughly four wins, and most of the reason 72 is hard. */
  SLATE_NET: 0.5,
  MARQUEE_NET: 5.0,
};

/* Re-center a set of opponents so their MEAN net rating is `targetNet` and
   their mean offensive rating sits where league average puts it, without
   touching how spread out they are. */
function normalizePool(pool, targetNet) {
  if (!pool.length) return pool;
  const meanOf = (f) => pool.reduce((s, o) => s + f(o), 0) / pool.length;
  const shift = (targetNet - meanOf(o => o.ortg - o.drtg)) / 2;
  for (const o of pool) { o.ortg += shift; o.drtg -= shift; }
  const level = (CONSTANTS.LEAGUE_RTG + targetNet / 2) - meanOf(o => o.ortg);
  for (const o of pool) { o.ortg += level; o.drtg += level; }
  return pool;
}

function buildOpponentPool(teamSeasons) {
  const rated = teamSeasons.filter(t => typeof t.rating === 'number');
  if (!rated.length) return { contenders: [], marquee: [] };

  const ranked = [...rated].sort((a, b) => a.rating - b.rating);
  const cut = (q) => ranked.slice(Math.floor(ranked.length * q));
  const asOpponents = (list) => list.map(t => ({
    name: t.display, rating: t.rating, ortg: t.ortg, drtg: t.drtg,
  }));

  return {
    contenders: normalizePool(asOpponents(cut(SCHEDULE.CONTENDER_PERCENTILE)), SCHEDULE.SLATE_NET),
    marquee: normalizePool(asOpponents(cut(SCHEDULE.MARQUEE_PERCENTILE)), SCHEDULE.MARQUEE_NET),
  };
}

function generateSchedule(rng, games, pool) {
  const count = games || CONSTANTS.REGULAR_SEASON_GAMES;
  const schedule = [];

  if (pool && pool.contenders && pool.contenders.length) {
    const marqueeSet = new Set();
    if (pool.marquee && pool.marquee.length) {
      const want = Math.min(SCHEDULE.MARQUEE_GAMES, count);
      let guard = 0;
      while (marqueeSet.size < want && guard++ < count * 8) {
        marqueeSet.add(Math.floor(rng() * count));
      }
    }
    for (let i = 0; i < count; i++) {
      const bucket = marqueeSet.has(i) && pool.marquee.length ? pool.marquee : pool.contenders;
      const opp = bucket[Math.floor(rng() * bucket.length)];
      schedule.push({
        game: i + 1,
        oppName: opp.name,
        oppRating: opp.rating,
        marquee: marqueeSet.has(i),
        /* Home and away alternate rather than being drawn, so a run cannot
           deal itself 50 home games. */
        home: i % 2 === 0,
        oppOrtg: round2(Math.max(95, opp.ortg + normal(rng) * SCHEDULE.OPP_GAME_SD)),
        oppDrtg: round2(Math.max(95, opp.drtg + normal(rng) * SCHEDULE.OPP_GAME_SD)),
      });
    }
    return schedule;
  }

  /* Fallback, for data no opponent pool could be built from. It should never
     run in the shipped game, and it exists so that a broken dataset produces a
     playable season rather than a crash. */
  for (let i = 0; i < count; i++) {
    const net = SCHEDULE.SLATE_NET;
    schedule.push({
      game: i + 1,
      home: i % 2 === 0,
      oppOrtg: round2(CONSTANTS.LEAGUE_RTG + net / 2 + normal(rng) * 3.2),
      oppDrtg: round2(CONSTANTS.LEAGUE_RTG - net / 2 + normal(rng) * 3.0),
    });
  }
  return schedule;
}

/* Expected points for both sides in one game. Your scoring scales with the
   opponent's defense and theirs scales with your defense, which is where the
   defensive half of a draft finally shows up in a scoreline. Both sides are
   normalized against LEAGUE_RTG, so a league-average opponent leaves your own
   ratings exactly as they are. */
function gameMeans(ortg, drtg, game) {
  const pace = CONSTANTS.LEAGUE_PACE / 100;
  const L = CONSTANTS.LEAGUE_RTG;
  return {
    pointsFor: ortg * (game.oppDrtg / L) * pace,
    pointsAgainst: drtg * (game.oppOrtg / L) * pace,
  };
}

const round2 = (v) => Math.round(v * 100) / 100;

/* Home court, and it CUTS BOTH WAYS. Applying the bonus at home and nothing on
   the road hands out an average of half a home court every night, which over 82
   games is free wins nobody earned. The schedule alternates, so symmetric comes
   out neutral across a season and still swings the individual game. */
function homeAdvantage(game) {
  const h = 1 + CONSTANTS.PLAYOFF_HOME_COURT;
  return game.home ? h : 1 / h;
}

// ─── the playoffs ───────────────────────────────────────────────────────────

const PLAYOFF_ROUND_NAMES = [
  'Play-In', 'First Round', 'Conference Semifinals', 'Conference Finals', 'NBA Finals',
];

function seedFromRecord(wins) {
  if (wins >= CONSTANTS.TOP_SIX_WINS) {
    return { made: true, bye: true, rounds: CONSTANTS.PLAYOFF_ROUNDS_SEEDED,
      label: 'Top six seed' };
  }
  if (wins >= CONSTANTS.PLAY_IN_WINS) {
    return { made: true, bye: false, rounds: CONSTANTS.PLAYOFF_ROUNDS_PLAY_IN,
      label: 'Play-in' };
  }
  return { made: false, bye: false, rounds: 0, label: 'Lottery' };
}

function playoffRoundNames(rounds) {
  return PLAYOFF_ROUND_NAMES.slice(PLAYOFF_ROUND_NAMES.length - rounds);
}

/* WHO YOU MEET IN EACH ROUND, as the opponent's net rating. Stated per round
   BY NAME rather than as a step per round index, because the play-in exists:
   indexing from the front would make the Finals a different opponent depending
   on whether you got in the easy way, and the Finals is the Finals. A play-in
   opponent is a .500 team, a first round opponent is a decent playoff team, and
   the team waiting in the Finals is a title team.

   These five numbers ARE the difficulty of winning a ring, and they were set
   against the top of the game rather than the middle: the best six the cap can
   buy takes the title about one run in ten. */
const ROUND_NET = {
  'Play-In': 0.5,
  'First Round': 2.0,
  'Conference Semifinals': 4.0,
  'Conference Finals': 5.5,
  'NBA Finals': 7.0,
};

/* TITLE DIFFICULTY. The last two rounds stiffen for a weaker team, so a ring
   means the roster was good rather than that a mediocre one got hot for two
   months. Above PIVOT nothing is added and the fight is fair. In rating points,
   like everything else that moves a matchup in this engine. */
const TITLE = {
  PIVOT: 86,
  SLOPE: 0.08,
  MAX_EDGE: 4.0,
  SEMI_SHARE: 0.5,
};

function titleEdge(rating) {
  if (typeof rating !== 'number') return 0;
  return clamp((TITLE.PIVOT - rating) * TITLE.SLOPE, 0, TITLE.MAX_EDGE);
}

function playoffSeries(pointsFor, pointsAgainst, rng, bestOf, advantage) {
  const need = Math.ceil(bestOf / 2);
  let yourWins = 0, oppWins = 0;
  const games = [];
  /* 2-2-1-1-1, which is the real format and the reason home court is worth
     having: games 1, 2, 5 and 7 are yours. */
  const homePattern = bestOf === 7 ? [1, 1, 0, 0, 1, 0, 1]
    : bestOf === 5 ? [1, 1, 0, 0, 1] : [1];

  while (yourWins < need && oppWins < need) {
    const home = homePattern[games.length] === 1;
    const adv = home ? advantage : 1 / advantage;
    const result = resolveGame(pointsFor, pointsAgainst, rng, adv);
    games.push({ ...result, home });
    if (result.won) yourWins++; else oppWins++;
  }

  return { won: yourWins >= need, gamesPlayed: games.length, yourWins, oppWins, games };
}

function generatePlayoffs(seed, ortg, drtg, rng, regularWins, rating) {
  if (!seed.made) return null;
  const edge = titleEdge(rating);
  const rounds = playoffRoundNames(seed.rounds);
  const results = [];
  let alive = true;

  /* Home court through the bracket scales with the regular season. Win 60 and
     you have it all the way; scrape the play-in and you do not have it once. */
  const span = CONSTANTS.REGULAR_SEASON_GAMES - CONSTANTS.PLAY_IN_WINS;
  const baseAdv = 1 + CONSTANTS.PLAYOFF_HOME_COURT *
    clamp((regularWins - CONSTANTS.PLAY_IN_WINS) / span, 0, 1);

  const pace = CONSTANTS.LEAGUE_PACE / 100;
  const L = CONSTANTS.LEAGUE_RTG;

  for (let i = 0; i < rounds.length && alive; i++) {
    const roundName = rounds[i];

    /* The opponent for this round, built as a net rating and converted to
       points once. A weaker roster meets a stiffer version of the last two
       opponents; a great one meets them as they are. */
    let oppNet = ROUND_NET[roundName] ?? 2.0;
    if (roundName === 'NBA Finals') oppNet += edge;
    else if (roundName === 'Conference Finals') oppNet += edge * TITLE.SEMI_SHARE;

    const oppOrtg = L + oppNet / 2;
    const oppDrtg = L - oppNet / 2;
    const pointsFor = ortg * (oppDrtg / L) * pace;
    const pointsAgainst = drtg * (oppOrtg / L) * pace;

    // The play-in is one game. Everything after it is a seven game series.
    const bestOf = roundName === 'Play-In' ? 1 : 7;
    const adv = seed.bye ? baseAdv : Math.max(1, baseAdv * 0.85);

    const series = playoffSeries(pointsFor, pointsAgainst, rng, bestOf, adv);
    results.push({ round: roundName, oppNet: round2(oppNet), ...series });
    if (!series.won) alive = false;
  }

  const last = results[results.length - 1];
  const won = !!(last && last.won && last.round === 'NBA Finals');
  return { rounds: results, won };
}

// ─── the coach report ───────────────────────────────────────────────────────

/* A human read on the roster: what it does, what it cannot do, and a verdict.
   The results screen ends on words rather than a number, which is the whole
   reason this exists. Expects a slot-tagged roster. */
/* JUDGE THE ROSTER ON WHAT IT RATES, NOT ON WHAT IT ADDS UP TO. Reading raw
   win share sums here told a 39 win team it had an elite offense AND locked
   teams down, while the page beside it printed a defensive rating of 113.4,
   which is exactly average. Sums do not know about minutes, about roster shape,
   or about the fact that fifteen defensive win shares spread over six men is
   ordinary. The ratings do, they are the numbers the season is actually played
   with, and they are what the player is looking at. */
function coachReport(roster, chem, structure, rating, unspentMusd, ortg, drtg) {
  const L = CONSTANTS.LEAGUE_RTG;
  const chemBonus = chem ? chem.bonus : 0;
  const top = [...roster].sort((a, b) => b.w - a.w)[0];
  const sixth = roster.find(p => p._slot === '6TH');

  const strengths = [], weaknesses = [];
  if (typeof ortg === 'number') {
    if (ortg >= L + 5) strengths.push('Elite offense');
    else if (ortg < L - 3) weaknesses.push('Cannot score enough');
  }
  if (typeof drtg === 'number') {
    if (drtg <= L - 5) strengths.push('Locks teams down');
    else if (drtg > L + 3) weaknesses.push('Nobody guards anybody');
  }
  if (sixth && sixth.w >= 8) strengths.push('Sixth man carries the bench');
  else if (!sixth || sixth.w < 2) weaknesses.push('No bench to speak of');
  if (chemBonus >= 1.6) strengths.push('Real chemistry');
  else if (chemBonus < 0.4) weaknesses.push('Six strangers');
  if (structure && structure.archetype && structure.archetype.key === 'hero_ball')
    weaknesses.push(`Leans hard on ${top ? lastNameOf(top.n) : 'one star'}`);
  if (typeof unspentMusd === 'number' && unspentMusd >= 15)
    weaknesses.push(`$${unspentMusd.toFixed(0)}M left on the table`);
  if (structure && structure.archetype && structure.archetype.bonus > 0)
    strengths.push(structure.archetype.name);

  let verdict;
  if (rating >= 93) verdict = 'All-time great';
  else if (rating >= 84) verdict = 'Title favorite';
  else if (rating >= 70) verdict = 'Playoff team';
  else if (rating >= 55) verdict = 'Play-in team';
  else verdict = 'Lottery bound';

  return { strengths, weaknesses, verdict, archetype: structure && structure.archetype };
}

function lastNameOf(n) {
  const parts = String(n).trim().split(/\s+/);
  return parts[parts.length - 1];
}

// ─── a whole season, start to finish ────────────────────────────────────────

function playRun(roster, rng, slotNames, pool) {
  /* Players draft in whatever order the wheel deals them, so the roster array
     is not in SLOTS order and the slot each one actually occupies has to be
     carried alongside. Everything downstream reads _slot, never the index. */
  const tagged = roster.map((p, i) => ({ ...p, _slot: (slotNames && slotNames[i]) || SLOTS[i] }));

  const chem = resolveChemistry(tagged);
  const structure = rosterFit(tagged);
  const ortg = rosterOffense(tagged, chem.bonus, structure.bonus);
  const drtg = rosterDefense(tagged, chem.bonus);

  const schedule = generateSchedule(rng, CONSTANTS.REGULAR_SEASON_GAMES, pool);
  const seasonGames = [];
  let wins = 0, losses = 0, totalPF = 0, totalPA = 0;

  for (const game of schedule) {
    const means = gameMeans(ortg, drtg, game);
    const result = resolveGame(means.pointsFor, means.pointsAgainst, rng, homeAdvantage(game));
    seasonGames.push({ game: game.game, ...result });
    if (result.won) wins++; else losses++;
    totalPF += result.yourPoints;
    totalPA += result.oppPoints;
  }

  const seed = seedFromRecord(wins);
  const rating = overallRating(teamWinPct(ortg, drtg));
  const playoffs = generatePlayoffs(seed, ortg, drtg, rng, wins, rating);

  return {
    roster: tagged,
    chemistry: chem,
    structure,
    rating,
    ortg: round2(ortg),
    drtg: round2(drtg),
    schedule,
    season: seasonGames,
    record: { wins, losses },
    seed,
    playoffs,
    totalPF,
    totalPA,
    titleWon: !!(playoffs && playoffs.won),
    isGOAT: wins >= CONSTANTS.GOAT_WINS,
    beatRecord: wins >= CONSTANTS.RECORD_WINS,
  };
}

// ─── team display data ──────────────────────────────────────────────────────

/* Name and colorway per franchise code. Historical codes are in here too, so a
   1985 roster prints as the club it was rather than the club that plays in that
   city now. */
const TEAM_NAMES = {
  ATL: 'Hawks', BOS: 'Celtics', BRK: 'Nets', CHI: 'Bulls', CHO: 'Hornets',
  CLE: 'Cavaliers', DAL: 'Mavericks', DEN: 'Nuggets', DET: 'Pistons',
  GSW: 'Warriors', HOU: 'Rockets', IND: 'Pacers', LAC: 'Clippers',
  LAL: 'Lakers', MEM: 'Grizzlies', MIA: 'Heat', MIL: 'Bucks', MIN: 'Timberwolves',
  NOP: 'Pelicans', NYK: 'Knicks', OKC: 'Thunder', ORL: 'Magic', PHI: '76ers',
  PHO: 'Suns', POR: 'Trail Blazers', SAC: 'Kings', SAS: 'Spurs',
  TOR: 'Raptors', UTA: 'Jazz', WAS: 'Wizards',
  // Franchises under the name they carried at the time.
  SEA: 'SuperSonics', NJN: 'Nets', VAN: 'Grizzlies', CHH: 'Hornets',
  WSB: 'Bullets', KCK: 'Kings', SDC: 'Clippers', NOH: 'Hornets', NOK: 'Hornets',
  BAL: 'Bullets', BUF: 'Braves', CIN: 'Royals', SFW: 'Warriors', STL: 'Hawks',
};

const TEAM_COLORS = {
  ATL: ['#E03A3E', '#26282A'], BOS: ['#007A33', '#BA9653'], BRK: ['#000000', '#FFFFFF'],
  CHI: ['#CE1141', '#000000'], CHO: ['#1D1160', '#00788C'], CLE: ['#860038', '#FDBB30'],
  DAL: ['#00538C', '#002B5E'], DEN: ['#0E2240', '#FEC524'], DET: ['#C8102E', '#1D42BA'],
  GSW: ['#1D428A', '#FFC72C'], HOU: ['#CE1141', '#000000'], IND: ['#002D62', '#FDBB30'],
  LAC: ['#C8102E', '#1D428A'], LAL: ['#552583', '#FDB927'], MEM: ['#5D76A9', '#12173F'],
  MIA: ['#98002E', '#F9A01B'], MIL: ['#00471B', '#EEE1C6'], MIN: ['#0C2340', '#236192'],
  NOP: ['#0C2340', '#C8102E'], NYK: ['#006BB6', '#F58426'], OKC: ['#007AC1', '#EF3B24'],
  ORL: ['#0077C0', '#C4CED4'], PHI: ['#006BB6', '#ED174C'], PHO: ['#1D1160', '#E56020'],
  POR: ['#E03A3E', '#000000'], SAC: ['#5A2D81', '#63727A'], SAS: ['#C4CED4', '#000000'],
  TOR: ['#CE1141', '#000000'], UTA: ['#002B5C', '#00471B'], WAS: ['#002B5C', '#E31837'],
  SEA: ['#00653A', '#FFC200'], NJN: ['#002A60', '#DA2032'], VAN: ['#00B2A9', '#E43C40'],
  CHH: ['#1D1160', '#00778B'], WSB: ['#002B5C', '#E31837'], KCK: ['#5A2D81', '#63727A'],
  SDC: ['#C8102E', '#1D428A'], NOH: ['#0C2340', '#C8102E'], NOK: ['#0C2340', '#C8102E'],
  BAL: ['#002B5C', '#E31837'], BUF: ['#00471B', '#EEE1C6'], CIN: ['#5A2D81', '#63727A'],
  SFW: ['#1D428A', '#FFC72C'], STL: ['#E03A3E', '#26282A'],
};

function teamColors(code) {
  return TEAM_COLORS[code] || ['#2b2b33', '#c9ccd6'];
}

/* REAL FRANCHISE DATA, when the page has loaded it.
 *
 * data/teams.json carries the city, the full name, the year the club was
 * founded and every championship it has won, for the thirty current franchises
 * and the nineteen defunct ones this game can still draw. The table above stays
 * as a fallback so the engine is a working engine with no data file at all,
 * which is what lets verify.mjs and the fixtures run without one.
 */
let TEAMS = null;
function setTeams(json) {
  TEAMS = (json && json.teams) || null;
}

function team(code) {
  const t = TEAMS && TEAMS[code];
  if (t) return t;
  const name = TEAM_NAMES[code];
  return name ? { code, name, full: name, titles: [] } : { code, name: code, full: code, titles: [] };
}

function teamName(code) {
  const t = TEAMS && TEAMS[code];
  return (t && t.name) || TEAM_NAMES[code] || code;
}

/* "1996 Chicago Bulls", with the city the club actually played in that year.
   A 1995 Vancouver roster is not a Memphis roster, and this is where that
   distinction reaches the screen. */
function teamDisplay(code, season) {
  const t = team(code);
  return `${season} ${t.full || t.name}`;
}

/* One line of context a fan would recognise: when they started, what they won.
   Returns null rather than an empty string when there is nothing to say. */
function teamNote(code, season) {
  const t = team(code);
  const bits = [];
  if (t.founded) bits.push(`founded ${t.founded}`);
  if (t.titles && t.titles.length) {
    /* Titles won BY this season, because a 1987 roster has not won the ones
       that came later and saying otherwise is just wrong. */
    const won = typeof season === 'number' ? t.titles.filter(y => y <= season) : t.titles;
    if (won.length) {
      bits.push(won.length === 1 ? '1 championship' : `${won.length} championships`);
      if (won.length <= 3) bits.push(`(${won.join(', ')})`);
    }
  }
  /* The FULL name of what they became, because half of these kept their
     nickname and moved city: "the Vancouver Grizzlies, later the Grizzlies"
     tells a reader nothing at all. */
  if (t.current === false && t.became) {
    const now = team(t.became);
    bits.push(`later the ${now.full || now.name}`);
  }
  return bits.length ? bits.join(' · ') : null;
}

// ─── exports ────────────────────────────────────────────────────────────────

const publicAPI = {
  API_VERSION: ENGINE_API_VERSION,
  CONSTANTS, ERAS, CHEMISTRY, SCHEDULE, TITLE,
  SLOTS, SLOT_ELIGIBILITY, POSITION_MAX, MINUTES_SHARE,
  positionsOf, canFillSlot, teamSeasonId, pkey,
  hashSeed, createSeededRNG, normal,
  indexData, buildCheapBy, teamStrength,
  pairLinks, resolveChemistry, setCuratedChemistry,
  rosterOffense, rosterDefense, rosterFit, detectSystem, minutesShare,
  rosterProfile, spacingIndex, paceAdjust, eraOf, ERA_CONTEXT, SYSTEMS, FIT,
  playerTags,
  teamWinPct, overallRating, nationalRank, pythagorean,
  buildOpponentPool, generateSchedule, gameMeans,
  resolveGame, playoffSeries, generatePlayoffs, playRun, homeAdvantage,
  ROUND_NET,
  seedFromRecord, playoffRoundNames, PLAYOFF_ROUND_NAMES, titleEdge,
  respinCost, respinFees,
  coachReport, lastNameOf,
  TEAM_NAMES, TEAM_COLORS, teamColors, teamName,
  setTeams, team, teamDisplay, teamNote,
};

if (typeof module !== 'undefined' && module.exports) module.exports = publicAPI;
if (typeof window !== 'undefined') window.RTF_ENGINE = publicAPI;
})();
