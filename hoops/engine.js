/* Run The Floor: game engine.
 *
 * Headless and dependency-free. Browser: window.RTF_ENGINE. Node:
 * require('./engine.js'). Same architecture as football/engine.js and
 * cfb/engine.js, and the closest sibling is baseball/engine.js, which is the
 * previous reskin of that skeleton. Adapted for basketball:
 *
 *   5 roster slots (PG, SG, SF, PF, C)
 *   a $120M cap, in the range of a real NBA cap
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

/* Bumped when the page and this file can no longer be mixed. index.html checks
   it at boot and reloads once, because a returning visitor CAN hold a cached
   copy of this file against a current page. 2: playerTags() removed, wheel
   colors and title resolution added. 6: the roster is five men, so SLOTS is a
   different length and MINUTES_SHARE and minutesShare are gone. */
const ENGINE_API_VERSION = 6;

// ─── constants ──────────────────────────────────────────────────────────────

const CONSTANTS = {
  /* THE CAP HAS TO SAY NO, or the draft is not a decision, it is a sequence of
     clicks on whoever scored most. $120M is about $24M a slot across five
     players, and the priciest player in the data costs $60M. So one superstar
     eats half the roster and the other four have to come in under $60M.
     That is the shape of the squeeze: one great player is comfortable, two is
     tight, and three means filling the rest with minimum contracts.
     Best-available on every spin runs to about $300M and busts before the
     season starts, which is the point.

     THE NUMBER IS SWEPT, NOT PICKED. Every time the model underneath it
     changed, the cap was re-measured across its whole range rather than nudged:
     $145M when the ratings were guessed, $125M once they were fitted to real
     records, $138M once price stopped being a function of value and the playoff
     bracket was fitted to history, $134M once the schedule stopped being harder
     than a real one, $126M once a season's price started depending on how
     much of it the man actually played, and $120M when the roster went from
     six men to five.

     THAT LAST ONE WENT UP PER SLOT AND THE REASON IS NOT OBVIOUS. Six slots
     at $126M is $21M a slot and five at $120M is $24M, which reads like the
     draft got easier. It did not: dropping a man was paid for by re-solving
     OWS_TO_ORTG and DWS_TO_DRTG so five men rate where six did, so the cap is
     buying the same team out of fewer, better contracts. Swept at 98, 102,
     105, 108, 112, 116, 118, 120, 123 and 126: every target is out of band
     under about 108 and "beats 72" reaches 5.6 against a ceiling of 6 at the
     old 126, which is the flip-on-the-seed case this block already warns
     about. All four land inside their bands from 112 up.

     $123M PUTS THEM MARGINALLY NEARER THE MIDDLES AND IT SHIPS AT $120M,
     which is the call the weekly fantasy cap makes in as many words: the
     difference is three tenths of a win on the ceiling and a fifth of a point
     on the record rate, and $120M is a figure somebody can hold in their head
     while $123M is a figure nobody can. That last one moved the median price
     from $10.7M to $8.6M, which is a real economy change wearing the clothes of
     a data refresh: at the old cap "beats 72 wins" went out of band at 7.4%
     against a ceiling of 6, and the playoff rate for a thoughtless draft jumped
     from 53% to 65%. Swept again at 122, 126 and 130: all four targets land
     inside their bands at every one of those, and 126 puts each of them nearest
     the middle while reproducing the balance that shipped before the change
     (42 greedy wins and 50% playoffs against 43 and 53%).

     Priced against hoops/build/build-players.mjs, and the two numbers are one
     decision: moving either without the other breaks the draft. */
  CAP_MUSD: 120,
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

  /* ── THE FOUR NUMBERS THAT TURN WIN SHARES INTO A RECORD ─────────────────
   *
   * These were first solved against the 171 row hand-entered seed, using four
   * anchor points measured on it. That was the best available at the time and
   * it was badly wrong, because the seed was 22 all-time teams and the anchors
   * it produced described a league that does not exist.
   *
   * HOW WRONG, measured the only way that means anything: assemble a real
   * club's actual best men out of the real data, play the season, and compare
   * to what that club actually did. Across nineteen teams from 1983 to 2023 the
   * old constants were out by a MEAN OF 15.1 WINS, every single one of them low,
   * from 5.7 (2004 Pistons) to 25.6 (1989 Pistons). A model that under-rates
   * every real team by fifteen games is not a model of basketball.
   *
   * So they are now FITTED, not chosen. Least squares over twenty-two real
   * records spanning 1983 to 2023, with the league-average team pinned to 41
   * wins because that is what league average means. Root mean square error is
   * 3.48 wins.
   *
   * The fit is evaluated at a NEUTRAL schedule, and that matters: a real NBA
   * team plays a balanced one, because the league sums to zero. This game's
   * slate is deliberately about 1.5 net rating points harder (see SCHEDULE), so
   * the same men win roughly four fewer games here than the club did in life.
   * That gap is the difficulty, not an error.
   *
   * WHAT IT REPRODUCES WITHOUT BEING ASKED TO. Rating every one of the 1403
   * team-seasons in the data lands the worst at 10.5 wins and names it as the
   * 2012 Bobcats, who really were the worst team in the history of the league
   * at a 8.7 win pace, and the best at 73.8 and names it as the 1996 Bulls, who
   * won 72. Neither was a fit target.
   *
   * The two it misses are the two a short-roster model has to miss: the 1989
   * Pistons come out 10.2 wins light and the 2016 Warriors 6.8, both because a
   * great team is more than a starting five and Detroit in particular went
   * nine deep.
   *
   * THE ROSTER WENT FROM SIX TO FIVE AND THESE TWO WERE RE-SOLVED FOR IT.
   * The twenty-two records are hit THROUGH `teamStrength`, which rates a real
   * club by its best SLOTS.length men, so changing that number moves every one
   * of the twenty-two ratings and breaks the fit by the edit rather than by
   * anything about the data. The twenty-two are not in this repo, so what was
   * solved instead is the pair at five men that best reproduces the rating
   * every real club already had at six: least squares through the origin on
   * the win share term, replacement level held fixed because it is a fact
   * about a team of nobodies rather than about how many nobodies. 0.695 to
   * 0.7503 and 0.605 to 0.6838.
   *
   * WHAT IT COSTS, over all 1403 club-seasons and stated in wins rather than
   * in rating points: rms 1.08, worst 3.26, and the two clubs named above move
   * by 0.3 and 0.3. So the fit against the twenty-two is about 3.6 wins rms
   * now rather than 3.5. That is a real loss and it is smaller than one game.
   *
   * REFIT, DO NOT NUDGE. If the data changes shape again, or the roster size
   * does, run a solve rather than moving one of these by hand: they trade off
   * against each other, and the reason the old set was uniformly low is that
   * nobody could see that from any single number. */
  REPLACEMENT_ORTG: 106.25,
  REPLACEMENT_DRTG: 127.75,
  OWS_TO_ORTG: 0.7503,
  DWS_TO_DRTG: 0.6838,

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

/* A STARTING FIVE, AND THAT IS THE WHOLE ROSTER.
 *
 * It was five starters and a sixth man, to land on the six the football and
 * college games draft. Six is those games' number for their own reasons and it
 * was never this sport's: basketball puts FIVE on the floor, so a five man
 * roster is the one shape a fan already has a picture of, and the bench man
 * was the only slot on the screen that had to be explained.
 *
 * YOU CAN GO BIG OR SMALL, AND FOR A WHILE THE SLOTS COULD NOT SAY SO. The
 * first write-up of this change claimed the 6TH slot was the only place a
 * roster's shape could vary, and then in its next sentence that
 * SLOT_ELIGIBILITY keeps the shape a choice. Both halves cannot be true, and
 * at the time neither was: every row the fetch produced carried a SINGLE
 * position, so one position was legal at one slot, POSITION_MAX could never
 * bind, and every roster the game could draft was one of each. Measured over
 * 750 drafts with two bots deliberately stacking one end: one centre, every
 * time, in all 750.
 *
 * SO THE ELIGIBILITY IS DERIVED NOW, in `build-players.mjs`, off the
 * positions the source listed the same man at in the seasons either side.
 * 22.0% of rows play more than one. What that buys, measured over 400
 * best-available drafts: 25 distinct roster shapes where there was exactly
 * one, including two centres and no power forward 34 times, two small
 * forwards 31 times and two point guards 9 times. POSITION_MAX binds rather
 * than decorating: it refused 18 signings across 150 drafts by the bot that
 * chases guards, and no shape in 400 drafts holds three of anything.
 *
 * THE MAN MATTERS AS WELL AS THE SLOT. Your four and your five can be two men
 * who own the glass, or your five can be a shooter who never rebounds, and
 * those are different teams whatever the position codes say. That is why the
 * two systems that NAME those shapes ask what the five men do rather than
 * what they are listed as. See their entries.
 *
 * WHAT IS GENUINELY GONE is the 0.72: buying a great man at a discount and
 * playing him fewer minutes was a real play and there is no bench to do it on.
 *
 * NOTHING HERE MAY BE READ AS A LITERAL 5. Every count in this engine is
 * SLOTS.length, because the last change of this number is what proved which
 * numbers were derived and which were typed. */
const SLOTS = ['PG', 'SG', 'SF', 'PF', 'C'];

/* Eligibility is deliberately loose at the edges, because basketball positions
   are. A combo guard really can play either guard spot and a modern four really
   can play the five, so the list says so rather than pretending the sport has
   five sealed boxes. What it will not do is let a center play point guard.

   AND IT DECIDED NOTHING AT ALL FOR THE LIFE OF THIS FILE, which is a fact
   about the data rather than about this table: every row the fetch produced
   carried one position, so each man was legal at exactly one slot and the
   overlap was decoration. `deriveEligibility` in build-players.mjs fills it
   in now, off the positions the source listed the same man at in the seasons
   either side, and 22.0% of rows play more than one. Two point guards and no
   shooting guard is a roster somebody can draft. */
const SLOT_ELIGIBILITY = {
  PG:  ['PG', 'G'],
  SG:  ['SG', 'G', 'GF'],
  SF:  ['SF', 'F', 'GF', 'FC'],
  PF:  ['PF', 'F', 'FC'],
  C:   ['C', 'FC'],
};

/* HOW MANY OF ONE POSITION A ROSTER MAY HOLD. Five sealed slots do not settle
   this on their own, because the eligibility above overlaps on purpose: a man
   listed G can take either guard spot and a man listed F either forward spot,
   so a roster really can arrive as two point guards and no shooting guard. One
   extra of any position is the limit.
   IT BINDS. For the life of this file it could not, because every man carried
   one position; with eligibility derived it refused 18 signings across 150
   drafts by a bot chasing guards, and no roster in 400 best-available drafts
   holds three of anything. */
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
   wheel lands on a board with nothing on it.
   IT IS NOT SLOTS.length AND THAT IS ON PURPOSE. Six was the roster size when
   this was written and the comment said so; the roster is five now and this
   stayed, because what the number is really for is a board worth reading. Five
   would admit a club offering exactly one legal man per slot, which is a wheel
   landing on a decision that has already been made. Left where it is, and named
   for what it does rather than for a roster size it no longer matches. */
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

/* What a team-season is worth if you drafted its best SLOTS.length men.
 *
 * THE SAME FORMULAS YOUR OWN ROSTER RUNS THROUGH, CHEMISTRY INCLUDED. Leaving
 * chemistry off here quietly rigged every comparison in the player's favour: a
 * drafted roster collected a bonus and the real team it was being ranked
 * against did not, so a 43 win side came back third best in the data. And a real
 * team-season is the one roster in the whole game that is CERTAIN to have
 * chemistry, because every one of them is the same club in the same year. If
 * anything has earned the bonus it is these.
 *
 * Roster shape is deliberately NOT applied. Shape measures how well a drafted
 * roster was assembled, and nobody assembled these: they are the best men a
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
   Every man is a starter, so the sum is a plain one: see the note under
   rosterDefense for what used to weight it and why that is gone. */
function rosterOffense(roster, chemBonus, structureBonus) {
  const ows = roster.reduce((s, p) => s + Math.max(0, p.ow), 0);
  return CONSTANTS.REPLACEMENT_ORTG
    + ows * CONSTANTS.OWS_TO_ORTG
    + (chemBonus || 0) * CHEMISTRY.OFFENSE_SHARE
    + (structureBonus || 0);
}

/* DEFENSE, per 100 possessions, and LOWER IS BETTER. Which is the only reason
   the chemistry term is SUBTRACTED here and added above: it is the same bonus
   pointed at the other end of the game. */
function rosterDefense(roster, chemBonus) {
  const dws = roster.reduce((s, p) => s + Math.max(0, p.dw), 0);
  return CONSTANTS.REPLACEMENT_DRTG
    - dws * CONSTANTS.DWS_TO_DRTG
    - (chemBonus || 0) * (1 - CHEMISTRY.OFFENSE_SHARE);
}

/* EVERY MAN ON A FIVE MAN ROSTER IS A STARTER, so there is no share to take.
 *
 * `MINUTES_SHARE` was `{ starter: 1.0, sixth: 0.72 }` and `minutesShare(p)`
 * read `p._slot === '6TH'`. Both are gone rather than left answering 1.0 for
 * everybody: a constant nothing reads is a number the next person tunes
 * expecting something to happen, which is the note `FIELD_K` carries in the
 * baseball game for the same reason.
 *
 * WHAT WENT WITH IT IS A DECISION, and it is the second thing the five man
 * roster costs. The 0.72 was the only reason the bench slot was a cheaper
 * place to park a star than a starting spot was, so "buy a great man at a
 * discount and play him less" was a real play and is not available now.
 *
 * IT ALSO CLOSED A SEAM NOBODY HAD NOTICED. `teamStrength` rates a real club's
 * best men at full weight with no `_slot` on any of them, so the reference
 * every rating in this game is fitted against was summing SIX at 1.0 while a
 * drafted roster summed five at 1.0 and one at 0.72. The two sides of that
 * comparison were never the same shape. They are now. */

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
    blurb: 'Five men who all had the ball on their own team. Somebody here is not getting it back.',
    /* THE MARGIN IS A TEAM TOTAL AND WAS WRITTEN FOR SIX MEN. At +18 over the
       budget this gate was 90 shots, and the most a six man roster ever took
       across 960 drafts eight ways was 89.9; at five men the budget fell to 66
       and the most anybody took was 77.4 against a gate of 84. So it fired on
       nothing at either size and the roster it exists to catch went on being
       labelled Showtime, which is the defect written up above it. Eight is the
       margin that sits at the top of what a five man draft can actually reach:
       team shots run p99 72.0 and max 77.4. */
    detect: (r, P) => (P.shots > FIT.SHOT_BUDGET + 8 ? 1 : -1),
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
      /* NO TRUE CENTRE, AND IT IS NOT ASKED OF A POSITION CODE.
         This read `r.filter(p => p.pp === 'C').length` and refused any roster
         holding one, which was EVERY roster: there is a centre slot, every row
         the fetch produced carried one position, and only a C or an FC may
         fill it. So the test was false by construction and this system had
         never once been named, at five men or at six.

         DERIVED ELIGIBILITY MAKES THAT TEST SATISFIABLE AGAIN, and it is
         still the wrong test. A power forward who is also listed at centre
         can now hold the five, so a roster with no man whose primary is C is
         a roster somebody can draft, and some of those men are sevenfooters
         who happened to be listed PF the year before. A position code does
         not say whether he plays like a five.

         So it is asked of what the big man DOES. The lineup this is named
         after played Draymond Green at the five and he pulled down 9.5 a
         night, so the bar sits above him: a roster whose best rebounder is
         under a real centre's number is one playing a forward there, which is
         the whole idea. The original comment argued for exactly this and then
         tested the position anyway. */
      /* PER 36 MINUTES, AND THAT IS THE ONE PLACE IN THIS FILE THAT IS. Every
         other reading here is per game, because the fit model's constants were
         measured that way and the totals have to agree with them. This is not
         a total: it asks whether any ONE MAN is a centre, and a per-game
         average answers that with his rotation rather than with him. Andrew
         Bogut played 20.7 minutes for the 2016 Warriors, so he rebounds 7.3 a
         game and 12.7 per 36, and at a per-game bar this lineup came back as
         the Death Lineup with a true centre standing in it. That team is the
         reason the system exists and it is the one roster it must not claim,
         because the unit it is named after is the one Bogut is NOT in.
         11.5 is the middle of the real gap: Draymond Green, the man this is
         named for, reads 10.3, and Bogut reads 12.7. */
      const glass = Math.max(...r.map(p =>
        paceAdjust((p.reb || 0) / Math.max(12, p.mp || 36) * 36, p.s)));
      if (glass >= 11.5) return -1;
      if (P.spacing < 1.2 || P.steals < FIT.SWITCH_STEALS || P.tpa < FIT.MODERN_TPA) return -1;
      return fit(over(P.spacing, 1.2, 0.8), over(P.steals, FIT.SWITCH_STEALS, 2.6));
    },
    bonus: 0.60,
  },
  {
    /* ABOVE PICK AND ROLL, and it is where it belongs rather than where it
       fits. A roster with two men owning the glass almost always also holds a
       guard who passes and a big who scores, so below the looser rung the
       more distinctive shape is named on nothing. The two carry the same
       bonus, so the move costs no rating anywhere and only changes the word. */
    key: 'twin_towers',
    name: 'Twin Towers',
    blurb: 'Two genuine bigs, the glass owned at both ends, and nothing easy at the rim.',
    detect: (r, P) => {
      /* TWO MEN WHO REBOUND LIKE BIGS, not two men whose position says so.
         This asked for two players ELIGIBLE AT CENTRE, which was reachable
         while the sixth slot took anybody and became impossible the day the
         roster went to a starting five: one centre slot, one centre, because
         every man carried a single position. Measured either side of that
         change, it fired on 175 of 800 drafts at six men and 0 of 800 at
         five. Nothing threw, no check went red, and the only symptom was that
         going big stopped having a name.

         DERIVED ELIGIBILITY WOULD MAKE THAT TEST WORK AGAIN and it is not
         going back. Two men listed at centre is a claim about paperwork; two
         men taking nine boards a night is the thing a fan means, it is true
         of a frontcourt whose second big is listed PF, and it cannot be
         broken again by whatever the source decides to serve next.

         What going big MEANS on a starting five is that the frontcourt owns
         the glass, so that is the question. Nine boards a man, twice over,
         plus somebody protecting the rim: measured over 150 drafts a bot, it
         lands on 18% of best-available drafts, 27% of drafts chasing
         rebounds, and none at all of a careless one. */
      const towers = r.filter(p => paceAdjust(p.reb || 0, p.s) >= 9).length;
      if (towers < 2 || P.bestRim < 1.4) return -1;
      return fit(over(P.reb, 32, 8), over(P.bestRim, 1.4, 1.6));
    },
    bonus: 0.55,
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
    key: 'grit_and_grind',
    name: 'Grit and Grind',
    blurb: 'Nobody scores easily, nobody scores often, and the game is played in the mud.',
    detect: (r, P) => {
      const dws = r.reduce((s, p) => s + Math.max(0, p.dw), 0);
      const ows = r.reduce((s, p) => s + Math.max(0, p.ow), 0);
      /* THE SHOT GATE IS GONE, and it was the reason this missed the 1989
         Pistons. It read `P.shots > 70` to mean "nobody scores often", but the
         six best players on ANY real club take 70 to 76 of its 85 shots, so it
         was closer to a test of whether a roster had a bench than of how it
         played. Detroit's six took 75.0 and were labelled Showtime; the 2004
         Pistons scraped in at exactly 70.0. A threshold that puts two teams
         with the same identity on opposite sides of itself is measuring
         something else. Spacing and the defensive share do the real work. */
      /* 11 AND NOT 13, for the roster size and nothing else. Thirteen
         defensive win shares cleared 38.6% of six man drafts and 22.1% of
         five man ones. The SHARE below is a ratio and did not move. */
      if (dws < 11 || P.spacing > 1.0) return -1;
      /* THE SHARE, NOT THE TOTAL. Thirteen defensive win shares is true of
         almost any good roster, so on the total alone this became the label for
         half the league. What actually makes a team this is that its value sits
         disproportionately at the defensive end.

         MEASURED ON A REAL LEAGUE, the separation is wide and 38% was in the
         wrong place. The two clubs this system is named for sit at 0.478 (1989
         Pistons) and 0.605 (2004 Pistons). The next roster down is the 1996
         Bulls at 0.401, then the 1987 Lakers at 0.346, the 1998 Jazz at 0.300
         and the 2001 Lakers at 0.265. At 38% the 1996 Bulls, who led the league
         in offense, came back Grit and Grind. At 45% the two Pistons teams are
         in, everything else is out, and there is a clear gap either side. */
      const share = (ows + dws) > 0 ? dws / (ows + dws) : 0;
      if (share < 0.45) return -1;
      return fit(over(share, 0.45, 0.10), over(P.bestRim, 0.9, 1.6));
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
      /* 31 AND NOT 36. The points are one man's and did not move; the
         rebounds are the roster's and did, when the roster went to five. */
      return fit(over(paceAdjust(post.pts, post.s), 18, 10), over(P.reb, 31, 8));
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
      /* THE ASSISTS ARE A TEAM TOTAL AND THE SHOTS ARE ONE MAN'S, so only the
         first moved to five men: at 22 this cleared 26.7% of six man drafts
         and 5.9% of five man ones, which is a system quietly going rare. */
      const hog = Math.max(...r.map(p => paceAdjust(p.fga || 0, p.s)));
      if (hog > 17 || P.ast < 18) return -1;
      return fit(over(P.ast, 18, 6), 1 - over(hog, 12, 6));
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
     a starting five is not the whole team: the bench takes theirs too. 66 is
     what a real starting five accounts for. Every attempt over that is a shot
     somebody on this roster is not going to get, and it is charged for.

     MEASURED, NOT SCALED. Over all 1403 real club-seasons, the five men who
     played the most minutes take a pace-adjusted 63.7 attempts a game and the
     top six take 69.8, against the 72 this constant carried for the six man
     roster. The budget went with the roster: 72 x 63.7 / 69.8 is 65.7, and it
     ships at 66. Re-measure rather than re-scale if the roster size moves
     again, because the top man of a club takes far more than the sixth and a
     ratio drawn off the wrong end of that list would say the wrong thing. */
  SHOT_BUDGET: 66,
  SHOT_COST: 0.16,          // rating points per attempt over budget
  /* Under budget is a real problem too, but a much smaller one, because a
     roster nobody wants to shoot on has already been punished by having no
     offensive win shares. This is just the last nudge. */
  SHOT_SHY: 53,
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
  /* 20.0 at six men, measured the same way: a real top six assists 19.7 a game
     and a real top five 18.1. */
  TEAM_AST: 18.4,
  TEAM_AST_WEIGHT: 0.04,

  /* SOME SYSTEMS DID NOT EXIST BEFORE THE THREE-POINT LINE, and naming a roster
     after one of them because its era-relative spacing looked high is how the
     1986 Celtics came back labelled Moreyball. Era-relative is exactly right for
     the spacing PENALTY, because a 1972 team should not be docked for a shot
     nobody was taking. It is exactly wrong for naming a modern system, because
     a guard taking 1.2 threes a night in a league that took 2.4 is twice league
     average and still not spacing anybody out. So the modern identities carry an
     absolute floor in actual attempts on top of the relative one. */
  /* MODERN_TPA IS A TEAM TOTAL AND MODERN_SHOOTER_TPA IS ONE MAN'S, which is
     why only the first moved when the roster went from six men to five. At
     18.0 it cleared 20.0% of six man drafts and 8.6% of five man ones, so
     Moreyball, Seven Seconds, the Death Lineup and Pace and Space all went
     quietly rarer together with nothing anywhere reporting it. 14.7 is where
     18.0 sat, measured over 960 drafts eight ways at each size; it ships at
     the round number just above. */
  MODERN_TPA: 15.0,          // the roster's own three-point attempts per game
  MODERN_SHOOTER_TPA: 5.0,   // and what one man has to be taking

  /* SWITCHING. The roster's steals, which is the closest thing the box score
     has to "everybody can guard somebody". A team total, so it moved with the
     roster: 5.5 cleared 57.4% at six men and 4.7 is where that sits at five. */
  SWITCH_STEALS: 4.7,

  /* THE GLASS. A real starting five accounts for about 30 of a team's
     rebounds, measured over the same 1403 clubs: 29.6 against a top six's
     32.9, which is what the 34.0 here stood for. */
  REB_TARGET: 30.5,
  REB_WEIGHT: 0.07,
  REB_CAP: 1.2,
};

/* Everything the fit model needs about a roster, computed once. Pace-adjusted
   throughout, so a 1972 line and a 2023 line are being asked the same question.
   Every man is a starter, so the sums are plain and the spacing mean divides
   by the roster size. */
function rosterProfile(roster) {
  let shots = 0, ast = 0, reb = 0, spacing = 0, tpa = 0;
  let bestRim = 0, bestCreator = 0, bestSpacing = 0, steals = 0;

  for (const p of roster) {
    shots += paceAdjust(p.fga || 0, p.s);
    ast += paceAdjust(p.ast || 0, p.s);
    reb += paceAdjust(p.reb || 0, p.s);
    steals += paceAdjust(p.stl || 0, p.s);
    tpa += paceAdjust(p.tpa || 0, p.s);

    const si = spacingIndex(p);
    spacing += si;
    if (si > bestSpacing) bestSpacing = si;

    /* The anchors are a PERSON rather than a sum, so they are read off the best
       man on the roster whoever he is. */
    const blk = paceAdjust(p.blk || 0, p.s);
    if (blk > bestRim) bestRim = blk;
    const a = paceAdjust(p.ast || 0, p.s);
    if (a > bestCreator) bestCreator = a;
  }

  return {
    shots, ast, reb, steals, tpa,
    spacing: roster.length ? spacing / roster.length : 1,
    bestRim, bestCreator, bestSpacing,
  };
}

/* THE BOARD USED TO DESCRIBE EACH PLAYER, and playerTags() is what did it:
 * Shooter, Rim protector, Creator, Rebounder, Ball hawk, No range, each read
 * off this season's rate stats against the same thresholds rosterFit charges.
 *
 * It is gone rather than unused, and the reasons are worth keeping because they
 * are reasons not to build it again.
 *
 * IT PRINTED THIS MODEL'S ANSWER ON EVERY TILE. Everything below charges a
 * roster for having no rim protection, no creation and no spacing, and a board
 * that labels each candidate with which of those he supplies turns the draft
 * into collecting one of each colour. The fit model is only interesting while
 * working out who supplies what is the player's job.
 *
 * AND A RATE STAT FROM ONE SEASON IS NOT A FACT ABOUT A MAN. Karl-Anthony
 * Towns took 1.1 threes a game in 2016 and came back marked "No range", which
 * is a defensible reading of that column and an absurd claim about one of the
 * best shooting big men who has ever played. The tile is the wrong place for an
 * inference stated as a description.
 *
 * The board carries HARDWARE now: what the man actually won that season, which
 * is a fact, is what a fan already knows, and gives the model's homework away
 * to nobody. See hoops/build/fetch-awards.mjs.
 */

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

// ─── the box score ──────────────────────────────────────────────────────────

/* WHAT HAPPENED IN ONE GAME, FOR SIX REAL PLAYERS.
 *
 * You draft Jordan's 1996 and the game has never once told you what he did in
 * any of the 82. A scoreline is the result; a box score is the GAME, and it is
 * the whole reason to draft real people out of real seasons rather than six
 * ratings.
 *
 * IT IS A DECOMPOSITION OF A SCORE THAT IS ALREADY DECIDED, AND NEVER A SECOND
 * MODEL. This is the load-bearing decision in this section and it is worth the
 * paragraph. resolveGame settles the scoreline off the run's seed before any
 * of this runs, and these six lines are apportioned to hit that total exactly.
 * Two reasons, both of them things that have already gone wrong on this site:
 *
 *   - A possession sim that DECIDED the score would replace the win-share
 *     model fitted to twenty-two real NBA records at 3.5 wins rms, which is
 *     the only reason a roster in this game is worth what it was worth in
 *     life. Every TARGETS band would need re-solving and the answer would be
 *     worse.
 *   - Two models of one game disagree. verify.mjs already caught the animated
 *     season and the instant season producing different records off one seed
 *     when a home-court expression was written out twice. A box score that did
 *     not sum to the scoreline printed beside it is the same fault, visible to
 *     anybody who can add.
 *
 * So nothing downstream reads any of this. It is what the game SHOWS, and the
 * one property it must have is that it adds up.
 */

const BOX = {
  /* A scorer's night-to-night spread, as a multiple of the square root of his
   * average. Real NBA scoring is roughly sqrt-variance.
   *
   * IT ONLY GOVERNS THE TAIL, AND THAT IS THE MEASUREMENT WORTH NOT REPEATING.
   * Swept from 1.45 down to 0.55 over 2,460 team-games a row, the leading
   * scorer's share of his team moved 34.9% to 32.2% and the median game high
   * moved 41 to 38. It is not the reason a box score here is concentrated:
   *
   *   K      leader   40+     50+    60+   high med/p90/max
   *   1.45   34.9%    55.3%   17.6%  3.5%  41 / 53 / 83
   *   0.85   32.7%    44.9%    8.5%  0.7%  39 / 49 / 65
   *   0.55   32.2%    41.6%    6.5%  0.1%  38 / 48 / 69
   *
   * THE CONCENTRATION IS THE PREMISE AND NO CONSTANT FIXES IT. Six men cover
   * 240 minutes and score every point, where a real club spreads both over
   * ten, so the best man takes about a third of his team against a real 26%
   * and no amount of damping moves it. Anybody who comes here to make the box
   * scores look more like a real NBA game log is turning the wrong dial: the
   * dial is the roster size, and that is the game.
   *
   * So this is set for the TAIL alone. 3.5% of games with a 60 point scorer
   * is three a season and silly; 0.7% is one every other year and is the kind
   * of night somebody screenshots. 0.85 is the first value with real room
   * rather than the last one that passes, since 0.70 and 0.55 buy almost
   * nothing after it. */
  PTS_SD_K: 0.85,
  REB_SD_K: 1.00,
  AST_SD_K: 0.90,
  /* HOW FAR ATTEMPTS FOLLOW POINTS. A man who doubles his scoring did not
     double his shots: most of a big night is efficiency. At 0.30 a 40 point
     game off a 25 point average takes about 18% more shots than usual. */
  VOLUME_FOLLOW: 0.30,
  /* The share of a man's points that came from the line, and the league rate
     he shot there. Both are league constants standing in for per-player rates
     the data does not carry (there is no FTA column), and they are the only
     invented numbers in a line. The alternative is a box score claiming every
     30 point night came entirely from the field, which is worse. */
  FT_SHARE: 0.17,
  FT_PCT: 0.77,
  /* MINUTES ARE NOT HERE, and their absence is the point. See gameBox: five
     men share 240 player minutes, so every one of them plays 48 and there is
     nothing left to spread or to vary. `MIN_SD` and `MIN_FLOOR` were the
     spread and the floor of a split that no longer happens. */
};

/* Split a total into integer parts in the given proportions, hitting the total
   EXACTLY. Largest remainder, which is the method that never leaves a stray
   point over and never needs a fudge row to absorb one. */
function apportion(total, weights) {
  const n = weights.length;
  const out = new Array(n).fill(0);
  if (!n) return out;
  const T = Math.max(0, Math.round(total));
  const sum = weights.reduce((s, w) => s + Math.max(0, w), 0);
  if (!(sum > 0)) { out[0] = T; return out; }

  const exact = weights.map(w => Math.max(0, w) / sum * T);
  for (let i = 0; i < n; i++) out[i] = Math.floor(exact[i]);
  let left = T - out.reduce((s, v) => s + v, 0);
  const order = exact
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac);
  for (let k = 0; left > 0; k++) { out[order[k % n].i]++; left--; }
  return out;
}

/* apportion, with a floor and a ceiling on every part.
 *
 * The minutes column needs it and nothing else does: six men share 240 player
 * minutes, so the average is 40, and a plain proportional split handed the
 * heaviest man 67 of a 48 minute game. A cap cannot be applied afterwards
 * without breaking the total, so whatever a capped man gives up is
 * redistributed among the men still free to take it, and the pass repeats
 * because the redistribution can push somebody else over.
 *
 * It terminates: every pass pins at least one man or changes nothing, so the
 * bound is one pass per part.
 */
function apportionCapped(total, weights, lo, hi) {
  const n = weights.length;
  if (!n) return [];
  const out = new Array(n).fill(null);

  for (let pass = 0; pass <= n + 1; pass++) {
    const free = [];
    let spoken = 0;
    for (let i = 0; i < n; i++) {
      if (out[i] === null) free.push(i); else spoken += out[i];
    }
    if (!free.length) break;
    const share = apportion(total - spoken, free.map(i => weights[i]));

    /* ONE SIDE PER PASS, and getting this wrong is what made the first
       version wrong on 73% of inputs. Pinning the over-cap men AND the
       under-floor men together throws away the redistribution between them:
       weights [1,1,1,31.6,26.8,25.8] over 240 pinned three at the floor and
       three at the ceiling in a single pass, arrived at 198, and had nothing
       left unpinned to give the other 42 to. Clamp the ceiling, re-apportion
       what is left among everybody else, and the three cheap men land on 32
       apiece. */
    const over = [];
    for (let k = 0; k < free.length; k++) if (share[k] > hi) over.push(free[k]);
    if (over.length) { for (const i of over) out[i] = hi; continue; }

    const under = [];
    for (let k = 0; k < free.length; k++) if (share[k] < lo) under.push(free[k]);
    if (under.length) { for (const i of under) out[i] = lo; continue; }

    for (let k = 0; k < free.length; k++) out[free[k]] = share[k];
    break;
  }
  for (let i = 0; i < n; i++) if (out[i] === null) out[i] = lo;

  /* Only reachable when the caller asked for something the bounds cannot
     hold (n*lo above the total, or n*hi below it). Push what is left as far
     as the bounds allow rather than dropping it, and stop when a full sweep
     moves nothing, which is the honest "this total does not fit" answer. */
  let drift = Math.round(total) - out.reduce((s, v) => s + v, 0);
  while (drift !== 0) {
    let moved = 0;
    for (let i = 0; i < n && drift !== 0; i++) {
      if (drift > 0 && out[i] < hi) { out[i]++; drift--; moved++; }
      else if (drift < 0 && out[i] > lo) { out[i]--; drift++; moved++; }
    }
    if (!moved) break;
  }
  return out;
}

/* A man's shooting line, solved BACKWARDS from the points he scored so the
 * arithmetic always closes: 2 * twos + 3 * threes + free throws is his points,
 * every time. A box score whose field goals do not produce its points is the
 * most obvious tell there is.
 *
 * The free throws are the free variable, which is what absorbs the parity
 * problem: points left after the threes have to be even to come out of two
 * pointers, and moving a free throw by one is how that is fixed without
 * touching the total.
 */
function shootingLine(p, pts, rng, load) {
  const avg = Math.max(1, p.pts || 1);

  /* TWO THINGS SCALE A MAN'S SCORING AND THEY MUST NOT BE CONFUSED, which the
   * first version did, and it put the league at 59% from the field.
   *
   * The STRUCTURAL one is `load`: six men play all 240 minutes here and absorb
   * a whole bench's shots, so the six season averages sum to about 78 against
   * a team total near 112. That is a real 1.4x of extra WORK, and the shots
   * come with it, so it passes into attempts in full.
   *
   * The NIGHT one is `heat`: how this game went against what he was already
   * due. Most of a big night is efficiency rather than volume, so only
   * VOLUME_FOLLOW of it reaches the attempts.
   *
   * Folded together, a man scoring 41 off a 30 average was credited with 20
   * shots instead of 27 and shot 60%. Separated, the league shoots what the
   * league shoots.
   */
  const scale = load > 0 ? load : 1;
  const heat = clamp(pts / (avg * scale), 0.15, 2.6);
  const follow = scale * (1 - BOX.VOLUME_FOLLOW + BOX.VOLUME_FOLLOW * heat);

  let fga = Math.max(pts > 0 ? 1 : 0, Math.round((p.fga || avg * 0.85) * follow));
  let tpa = Math.round((p.tpa || 0) * follow);
  if (tpa > fga) tpa = fga;

  /* Free throws first, then made from the line, then parity. */
  let ftm = Math.round(pts * BOX.FT_SHARE * (0.4 + rng() * 1.2));
  if (ftm > pts) ftm = pts;

  /* Of what is left, the threes, capped by what he actually attempts. A man
     who took none all season takes none tonight. */
  const threeRate = fga > 0 ? tpa / fga : 0;
  let tpm = Math.min(tpa, Math.max(0, Math.round((pts - ftm) * threeRate / 3)));

  /* The rest has to divide into two pointers, so nudge the line rather than
     leave a point unaccounted for. */
  let field = pts - ftm - 3 * tpm;
  if (field < 0) { tpm = Math.max(0, Math.floor((pts - ftm) / 3)); field = pts - ftm - 3 * tpm; }
  if (field % 2 !== 0) {
    /* EITHER WAY, CHOSEN ON THE DICE. The first version always went up, and
       always adding one free throw to half of all lines put the league's
       share of points from the line at 22% against a real 17%. A tie-break
       that only breaks one way is a bias with a rounding error's name on it. */
    const down = ftm > 0 && rng() < 0.5;
    if (down) { ftm--; field++; }
    else if (ftm + 1 <= pts) { ftm++; field--; }
    else if (tpm > 0) { tpm--; field += 3; ftm = pts - 3 * tpm - field; }
  }
  if (field < 0) field = 0;

  const twos = field / 2;
  const fgm = twos + tpm;
  if (fgm > fga) fga = fgm;
  let fta = Math.max(ftm, Math.round(ftm / BOX.FT_PCT));

  return { pts, fgm, fga, tpm, tpa, ftm, fta };
}

/* The lines for one side of one game, one per man. `teamPoints` is what the
   scoreline already says, and the points column sums to it exactly. */
function gameBox(roster, teamPoints, rng, ot) {
  const men = roster;

  /* Scoring weight is his real per-game average, jittered by his own spread.
     Negative draws are floored rather than reflected: a man can have a quiet
     night and cannot score less than nothing. */
  const weights = men.map((p) => {
    const base = Math.max(0.5, p.pts || 1);
    return Math.max(0, base + normal(rng) * BOX.PTS_SD_K * Math.sqrt(base));
  });
  const pts = apportion(teamPoints, weights);

  /* What the roster is carrying against what it averaged. See shootingLine:
     this is the structural half of the scale-up and it reaches the attempts
     in full. Guarded against a roster of men with no scoring at all, which
     the fixtures can build. */
  const expected = men.reduce((s, p) => s + Math.max(0, p.pts || 0), 0);
  const load = expected > 1 ? teamPoints / expected : 1;

  /* THE MINUTES COLUMN IS ARITHMETIC NOW, AND THAT IS WHAT FIVE MEANS.
   *
   * A basketball game is five men on the floor for 48 minutes, which is 240
   * player minutes, and this roster is exactly five men with nobody behind
   * them. So every one of them plays all of it. There is nothing to split and
   * nothing to jitter: a column of 48s is not a placeholder, it is the whole
   * statement of what a five man roster is.
   *
   * IT WAS A SPLIT AND THE SPLIT IS GONE. Six men over 240 needed apportioning,
   * a per man spread (`MIN_SD`) and a floor (`MIN_FLOOR`) to stop one man
   * taking 67 minutes of a 48 minute game. All three are deleted rather than
   * left computing a result that cannot vary: run through the old code five men
   * against a cap of 48 pins every one of them at the cap anyway, so the dice
   * were being rolled for nothing.
   *
   * An overtime is five more minutes with the same five men on the floor. */
  const extra = Math.max(0, ot | 0);
  const minutes = 48 + extra * 5;

  return men.map((p, i) => {
    const reb = Math.max(0, Math.round((p.reb || 0)
      + normal(rng) * BOX.REB_SD_K * Math.sqrt(Math.max(1, p.reb || 0))));
    const ast = Math.max(0, Math.round((p.ast || 0)
      + normal(rng) * BOX.AST_SD_K * Math.sqrt(Math.max(1, p.ast || 0))));
    /* Blocks and steals are small counts, so a normal draw around a mean under
       one produces a lot of negatives. Floored, which is what a real box score
       looks like: most nights most men have none. */
    const blk = Math.max(0, Math.round((p.blk || 0) + normal(rng) * 0.8));
    const stl = Math.max(0, Math.round((p.stl || 0) + normal(rng) * 0.8));
    return {
      i: p.i, n: p.n, slot: p._slot || null, min: minutes, reb, ast, blk, stl,
      ...shootingLine(p, pts[i], rng, load),
    };
  });
}

/* HOW THE GAME GOT THERE: four quarters, plus whatever overtime the scoreline
 * already says it went to.
 *
 * THE OVERTIME CONSTRAINT IS THE WHOLE REASON THIS IS NOT FOUR RANDOM SPLITS.
 * resolveGame breaks a tie by adding points to ONE side, so a game that went
 * to overtime is a game that was level at the end of regulation, and quarters
 * that do not add up to a tie there are quarters describing a different game
 * from the one on the scoreboard. So regulation is apportioned to a level
 * score and each extra period is scored on top of it.
 *
 * The loser of an overtime still scores in it, which resolveGame does not
 * model and every real overtime does. That is invented, and it is invented in
 * the direction of the sport rather than away from it.
 */
function quarterLines(yourPoints, oppPoints, ot, rng) {
  const periods = 4 + Math.max(0, ot | 0);
  /* Level at the buzzer, and low enough that both sides have a real overtime
     to play: about eleven points each per extra period. */
  const otFloor = 9 + Math.round(rng() * 5);
  const level = ot > 0
    ? Math.max(20, Math.min(yourPoints, oppPoints) - ot * otFloor)
    : null;

  const yourReg = ot > 0 ? level : yourPoints;
  const oppReg = ot > 0 ? level : oppPoints;

  /* Quarters are close to even with real spread. Weighted rather than drawn
     directly so apportion can hit the total exactly. */
  const spread = () => Array.from({ length: 4 }, () => Math.max(0.35, 1 + normal(rng) * 0.17));
  const yours = apportion(yourReg, spread());
  const theirs = apportion(oppReg, spread());

  if (ot > 0) {
    const yourOT = apportion(yourPoints - level, spread().slice(0, ot).map(() => 1));
    const oppOT = apportion(oppPoints - level, spread().slice(0, ot).map(() => 1));
    for (let k = 0; k < ot; k++) { yours.push(yourOT[k]); theirs.push(oppOT[k]); }
  }

  const names = ['1st', '2nd', '3rd', '4th'];
  for (let k = 4; k < periods; k++) names.push(periods === 5 ? 'OT' : 'OT' + (k - 3));

  return { names, yours, theirs, periods };
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
 * the season averages out to SEASON_NET, whatever the pool happens to hold).
 * The spread between opponents survives; the level does not. That is what keeps
 * a fetch that doubles the dataset from also rebalancing the game.
 */
const SCHEDULE = {
  /* THE WHOLE LEAGUE, not the top of it. This drew from the best 60% of every
     team-season, which is not a schedule anybody has ever played: a real season
     is the Celtics some nights and the Wizards others, and it averages out to
     league average by definition, because the league is what it is averaged
     against.
   *
   * Drawing from the top and then adding a marquee slice on top of that was a
   * difficulty dial wearing a schedule's clothes. It cost about four wins a
   * season and had no basketball behind it, and it is most of why a sensible
   * draft came out at 43 wins and a coin flip on the play-in. */
  POOL_PERCENTILE: 0.0,
  MARQUEE_PERCENTILE: 0.88,     // the top 12% are the marquee nights
  MARQUEE_GAMES: 18,
  OPP_GAME_SD: 2.4,

  /* AND THE SEASON AVERAGES OUT TO THIS, which is zero: league average, the way
     a balanced schedule does. The marquee nights are still genuinely hard, so
     the ordinary nights carry the other side of it and come in slightly under
     average. That is arithmetic rather than a dial:
     (64 * ORDINARY + 18 * MARQUEE) / 82 = SEASON_NET. */
  SEASON_NET: 0.0,
  MARQUEE_NET: 5.0,
};

/* Solved rather than typed, so changing the marquee count or its strength
   cannot silently make the whole season harder. */
function ordinaryNet(){
  const games = CONSTANTS.REGULAR_SEASON_GAMES;
  const m = Math.min(SCHEDULE.MARQUEE_GAMES, games);
  return (SCHEDULE.SEASON_NET * games - m * SCHEDULE.MARQUEE_NET) / (games - m);
}

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
    contenders: normalizePool(asOpponents(cut(SCHEDULE.POOL_PERCENTILE)), ordinaryNet()),
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
    const net = SCHEDULE.SEASON_NET;
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

   THESE FIVE NUMBERS ARE FITTED TO HISTORY, not set by feel, and the thing they
   are fitted to is worth stating because it is a real measurement.

   teams.json carries every championship year, so every one of the 1403
   team-seasons in the data can be labelled champion or not, and the rate can be
   read off directly: a club this engine rates at 60 to 65 wins won the title
   20.3% of the time, 55 to 60 won 8.6%, 50 to 55 won 3.8%, 45 to 50 won 1.4%.
   That is the curve a playoff model has to reproduce.

   IT WAS NOT CLOSE BEFORE. On the old numbers a 65 win roster took the title
   84.5% of the time against a real 24.6%, and a 55 to 60 win roster 34.8%
   against a real 8.6%. The bracket was a formality for anybody good.

   Fitted with TITLE.SERIES_SD below, the model now returns 33.8, 19.7, 7.9, 3.4
   and 1.4 against a real 28.1, 17.6, 7.5, 3.9 and 1.4. Four of the five bands
   land within two points; the top band is high by about six and holds only 54
   team-seasons, so its real rate carries a similar error itself. */
const ROUND_NET = {
  'Play-In': 1.5,
  'First Round': 4.1,
  'Conference Semifinals': 6.7,
  'Conference Finals': 9.3,
  'NBA Finals': 11.9,
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
  /* HOW FAR THE CLUB YOU ACTUALLY MEET VARIES FROM ITS SEED, in net rating
     points, and the single term that made the playoff model match history.

     Without it no arrangement of ROUND_NET could fit: holding a great roster
     down to its real title rate required putting a seventy win team in the
     Finals, and that in turn drove a 55 win roster to 0.8% against a real 8.6%.
     Nine points of spread fixes both at once, because it is the thing actually
     missing. A seven game series turns on who is healthy in May and whether the
     matchup takes your centre off the floor, and neither is in a season rating.

     Fitted at 9.0 over the whole 45-plus-win population.

     WHAT IT COSTS, MEASURED, so the next reader does not think this is an
     oversight. Because the opponent is drawn independently of how good YOU are,
     the median playoff series in this model has a 7.1 point net gap between the
     two sides, and a third of them have a gap over 10. A ten point gap sweeps
     57% of the time, which is correct physics on a matchup that should be rare
     and is not. The result is that 4-0 is the MOST COMMON series result at 28%
     of best-of-sevens, where a real bracket is clearly a minority of sweeps.
     Game sevens, by contrast, land at 17.8%, which is about right.

     LOWERING IT DOES NOT PAY. Swept on 400 real playoff rosters at 40 replays
     each: SD 6 gives 23% sweeps, SD 4 gives 19%, SD 3 gives 18%. But the title
     rate for a median 49-win playoff roster falls from 1.0% to 0.3% on the same
     move, against a real-history anchor of 1.4% for a 45 to 50 win club. That
     trades a curve fitted against every championship since 1974 for a
     distribution nobody fitted, which is the wrong way round.

     THE REAL FIX IS STRUCTURAL and is not a number in this object. A real
     bracket is SEEDED: good teams meet good teams, so the field is compressed
     and upsets come from series variance rather than from drawing a weak
     opponent. Modelling that means correlating the opponent with your own
     strength and refitting ROUND_NET against both targets at once. Worth doing;
     too big to do as a nudge. */
  SERIES_SD: 9.0,
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

/* ── THE BRACKET, AS SOMETHING YOU CAN STOP IN THE MIDDLE OF ────────────────
 *
 * It used to be one function that played every round and handed back a
 * finished bracket. That is still what generatePlayoffs does, and it is still
 * what every simmed run uses. But a game the player is going to PLAY cannot be
 * settled before they see it, and the rest of the bracket after it depends on
 * how it went, so the loop has to be turnable one game at a time.
 *
 * IT IS THE SAME LOOP, NOT A SECOND ONE. generatePlayoffs is now four lines
 * over this runner, so there is no version of the bracket that only the
 * animated path takes. Two of them would drift the first time a round was
 * added, and the symptom would be a simmed season and a played one giving one
 * seed two different brackets.
 *
 * THE RNG IS DRAWN IN EXACTLY THE OLD ORDER, which is what lets verify.mjs go
 * on pinning a seed: the round's opponent first, then its games one at a time.
 */
function poCreate(seed, ortg, drtg, regularWins, rating) {
  if (!seed || !seed.made) return null;
  /* Home court through the bracket scales with the regular season. Win 60 and
     you have it all the way; scrape the play-in and you do not have it once. */
  const span = CONSTANTS.REGULAR_SEASON_GAMES - CONSTANTS.PLAY_IN_WINS;
  return {
    ortg, drtg, rating,
    edge: titleEdge(rating),
    names: playoffRoundNames(seed.rounds),
    bye: !!seed.bye,
    baseAdv: 1 + CONSTANTS.PLAYOFF_HOME_COURT *
      clamp((regularWins - CONSTANTS.PLAY_IN_WINS) / span, 0, 1),
    results: [], r: 0, cur: null, done: false, won: false,
  };
}

/* 2-2-1-1-1, which is the real format and the reason home court is worth
   having: games 1, 2, 5 and 7 are yours. */
const PO_HOME = { 7: [1, 1, 0, 0, 1, 0, 1], 5: [1, 1, 0, 0, 1], 1: [1] };

function poBeginRound(po, rng) {
  const roundName = po.names[po.r];

  /* The opponent for this round, built as a net rating and converted to
     points once. A weaker roster meets a stiffer version of the last two
     opponents; a great one meets them as they are. */
  let oppNet = ROUND_NET[roundName] ?? 2.0;
  if (roundName === 'NBA Finals') oppNet += po.edge;
  else if (roundName === 'Conference Finals') oppNet += po.edge * TITLE.SEMI_SHARE;

  /* AND THE SERIES IS NOT THE RATINGS. This is the term that makes the
     playoffs the playoffs, and without it the model was badly wrong in a way
     measurable against history: teams it rates at 55 to 60 wins took the
     title 0.8% of the time against a real 8.6%, and the only way to hold the
     top of the curve down was to put a mythical seventy win team in the
     Finals.
   *
   * A seven game series turns on things a season rating cannot carry: who is
   * healthy in May, whether the matchup takes your centre off the floor, and
   * whether a shooter is hot for two weeks. So the club you actually meet is
   * drawn AROUND its seed's strength rather than being it exactly.
   *
   * It cuts both ways and that is the point. It is the reason a 73 win team
   * can lose a Finals and a 47 win team can reach one, both of which happened
   * and neither of which a deterministic bracket will ever produce. */
  /* BOUNDED ONLY WHERE BASKETBALL IS. The first attempt clamped this to a
     respectable playoff side at both ends and fitted measurably WORSE, which
     is the data pointing out that the weak tail is not noise: the 1999 Knicks
     reached a Finals as an eight seed and the 2020 Heat did it at 44 wins.
     Cutting that off is cutting off the thing being modelled.
     The upper bound stays, because no club has ever been +20. */
  oppNet = clamp(oppNet + normal(rng) * TITLE.SERIES_SD, -8.0, 16.0);

  const L = CONSTANTS.LEAGUE_RTG;
  const pace = CONSTANTS.LEAGUE_PACE / 100;
  const oppOrtg = L + oppNet / 2;
  const oppDrtg = L - oppNet / 2;
  // The play-in is one game. Everything after it is a seven game series.
  const bestOf = roundName === 'Play-In' ? 1 : 7;

  po.cur = {
    round: roundName, roundIndex: po.r, oppNet: round2(oppNet),
    pointsFor: po.ortg * (oppDrtg / L) * pace,
    pointsAgainst: po.drtg * (oppOrtg / L) * pace,
    adv: po.bye ? po.baseAdv : Math.max(1, po.baseAdv * 0.85),
    bestOf, need: Math.ceil(bestOf / 2),
    yourWins: 0, oppWins: 0, games: [],
  };
}

/* The game about to be played, or null once the bracket is finished. Begins
   the round if one is not in progress, which is the only reason it takes an
   rng: the opponent is drawn once per round and never once per read. */
function poNext(po, rng) {
  if (!po || po.done) return null;
  if (!po.cur) poBeginRound(po, rng);
  const c = po.cur;
  const home = (PO_HOME[c.bestOf] || [1])[c.games.length] === 1;
  const facing = c.oppWins === c.need - 1;
  const closing = c.yourWins === c.need - 1;
  return {
    round: c.round, roundIndex: c.roundIndex, game: c.games.length,
    bestOf: c.bestOf, need: c.need,
    yourWins: c.yourWins, oppWins: c.oppWins,
    home, adv: home ? c.adv : 1 / c.adv,
    pointsFor: c.pointsFor, pointsAgainst: c.pointsAgainst,
    /* Lose this and the run is over. */
    elimination: facing,
    /* Win this and the round is. */
    closeout: closing,
    /* WHICH GAMES ARE WORTH PLAYING, and it is one rule rather than a list.
       A game the series can END in, either way, plus every Finals game.
       Measured over 170 playoff runs: mean 2.6 of them, median 2, p90 5. A
       year that reaches a game seven Finals can offer thirteen, which is the
       run that deserves them. */
    big: facing || closing || c.round === 'NBA Finals',
    /* A game seven, which is the only one both sides face elimination in.
       BEST OF SEVEN IS PART OF THE CLAIM. In a one game round the need is 1,
       so both sides are at need minus one before a ball is thrown and the
       two flags are true by arithmetic: the play-in door read PLAY-IN over
       GAME 7, which is a sentence about a series that does not exist. */
    decider: c.bestOf > 1 && facing && closing,
  };
}

/* Fold a result into the bracket, however it was arrived at. resolveGame and
   liveResult answer in the same shape, which is the whole reason the live sim
   was written to. */
function poRecord(po, next, result) {
  const c = po.cur;
  if (!c || !next) return null;
  const row = {
    won: !!result.won, yourPoints: result.yourPoints,
    oppPoints: result.oppPoints, ot: result.ot || 0,
    home: next.home,
  };
  /* WRITTEN ONLY WHEN IT IS TRUE, so a simmed bracket is byte for byte the
     bracket this refactor replaced. Proved that way rather than assumed: the
     two generatePlayoffs were run over 4,000 seeds and `live: false` on every
     row was the entire difference. It also means a run saved before any of
     this reads correctly, since absent and false are the same answer here. */
  if (result.live) {
    row.live = true;
    /* AND WHAT ACTUALLY HAPPENED IN IT, kept rather than reconstructed. A
       resolved game's box score is a decomposition drawn off the game's own
       address, so opening it twice shows the same 41 points; a played game
       already HAS a box score, and re-deriving one would show somebody a
       different third quarter from the one they sat through. Two to four
       games a run carry this, which is a couple of kilobytes on the save. */
    row.lines = result.lines;
    row.quarters = result.quarters;
  }
  c.games.push(row);
  if (result.won) c.yourWins++; else c.oppWins++;

  if (c.yourWins >= c.need || c.oppWins >= c.need) {
    po.results.push({
      round: c.round, oppNet: c.oppNet, won: c.yourWins >= c.need,
      gamesPlayed: c.games.length, yourWins: c.yourWins, oppWins: c.oppWins,
      games: c.games,
    });
    if (c.yourWins >= c.need) { po.r++; if (po.r >= po.names.length) po.done = true; }
    else po.done = true;
    po.cur = null;
  }
  if (po.done) {
    const last = po.results[po.results.length - 1];
    po.won = !!(last && last.won && last.round === 'NBA Finals');
  }
  return next;
}

/* Play the pending game the way every other game in the run is played. */
function poAdvance(po, rng) {
  const next = poNext(po, rng);
  if (!next) return null;
  const result = resolveGame(next.pointsFor, next.pointsAgainst, rng, next.adv);
  poRecord(po, next, result);
  return { ...next, result };
}

function poFinal(po) {
  return po ? { rounds: po.results, won: po.won } : null;
}

function generatePlayoffs(seed, ortg, drtg, rng, regularWins, rating) {
  const po = poCreate(seed, ortg, drtg, regularWins, rating);
  if (!po) return null;
  let guard = 0;
  while (!po.done && guard++ < 200) poAdvance(po, rng);
  return poFinal(po);
}

// ─── one game, played forward ───────────────────────────────────────────────

/* A GAME SEVEN IS NOT A SCORELINE, AND THIS IS THE ONE PLACE THAT IS TRUE.
 *
 * resolveGame samples two totals and gameBox decomposes one of them into six
 * lines. That is the right shape for 82 games and it is the wrong shape for
 * the game a whole run comes down to, because there is nothing in it to
 * decide: the score exists before the first possession and every screen after
 * it is a reading of a number that was already there.
 *
 * So an elimination game or a Finals game can be PLAYED. Possession by
 * possession, a real clock, a real running score, and it stops at the two
 * calls a coach actually makes.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * IT IS NOT A SECOND MODEL, AND THAT IS THE WHOLE ENGINEERING PROBLEM.
 *
 * gameBox's header argues at length that a possession sim which DECIDED the
 * score would replace the win-share model fitted to twenty-two real NBA
 * records, and that two models of one game disagree. Both are still true. What
 * has changed is that this sim does not get to be a different model: it is
 * FITTED TO resolveGame and measured against it, so a neutral caller playing a
 * game forward and the resolver settling the same game are two samplers of one
 * distribution rather than two opinions about basketball.
 *
 * Matching the MEAN is arithmetic: the per-possession scoring rate is solved
 * from the same `pointsFor` and `pointsAgainst` the resolver is handed.
 *
 * MATCHING THE SPREAD IS NOT, and it is the reason LIVE.PULL exists. A real
 * possession is worth 0, 2 or 3 points with a standard deviation near 1.16, so
 * ninety-nine independent ones give a game total SD near 11.5. resolveGame's
 * effective SD is GAME_SD * (1 - CONSISTENCY), which is 9.02. Left alone, every
 * series played live would be wider than every series simmed, a seven game
 * bracket would swing more, and the title rate would move: the one number this
 * game's whole calibration is anchored to.
 *
 * So possessions are not independent. Each one's scoring rate is pulled back
 * toward the pro-rata expectation by how far the running total has drifted from
 * it, which is CONSISTENCY's own idea applied inside the game rather than to
 * its total. It is also the truest thing here: a team that falls behind presses
 * and a team well ahead stops trying, and neither keeps scoring at the rate
 * that got them there.
 *
 * PULL IS FITTED, NOT CHOSEN. hoops/check-live.mjs sweeps it and asserts the
 * match.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * WHAT THE RESIDUAL IS, MEASURED AND NOT ARGUED.
 *
 * Fitted, over 10,000 games of each of four matchups, against the same
 * matchup settled by resolveGame:
 *
 *   mean            +0.2 points, both sides, every matchup
 *   spread          within 0.15 of the resolver's 8.9 to 9.1
 *   win rate        within 0.6 points with the calls suppressed
 *   win rate        within 1.3 points with the auto caller answering them
 *
 * So PLAYING A GAME IS WORTH ABOUT SEVEN TENTHS OF A POINT OF WIN RATE over
 * having it resolved, before the player makes a single call of their own, and
 * that is the auto caller: two late decisions the resolver never asks. It is
 * recorded rather than compensated, which is the football game's own note on
 * its forward sim, and it is the right sign. A mode that asked somebody to
 * play four games and then handed them a worse result than skipping would be
 * a mode nobody should play.
 */
/* THE NUMBER THE WHOLE FIT IS AGAINST, derived and never typed.
   resolveGame draws N(0, GAME_SD) and then pulls the result CONSISTENCY of the
   way back to the mean, so what a season actually sees is this. Written out as
   a literal it would go stale the first time either constant is swept, and the
   symptom would be a live game quietly wider or tighter than the simmed one it
   is meant to match. */
const LIVE_SD = GAME_SD * (1 - CONSTANTS.CONSISTENCY);

const LIVE = {
  /* Possessions a side in a regulation game, from the league pace the rest of
     the engine already uses. A real NBA game is about 99 each. */
  POSS: Math.round(CONSTANTS.LEAGUE_PACE),
  /* Seconds of regulation, and of one overtime. */
  REG_SECONDS: 48 * 60,
  OT_SECONDS: 5 * 60,

  /* The possession mix, which is what makes the texture real. Measured against
     the modern NBA rather than fitted to anything here: the mean is solved
     separately, so these only decide what a possession LOOKS like. */
  TURNOVER: 0.125,      // no shot at all
  THREE_RATE: 0.39,     // of the possessions that do produce a shot
  /* A three goes in about seven tenths as often as a two. The scalar that
     makes the MEAN come out right multiplies both, so this ratio is the only
     shape decision in here. */
  THREE_OVER_TWO: 0.70,
  /* Of the two point attempts, how many draw a shooting foul. Free throws are
     what keep a live box score's split honest against shootingLine's. */
  FOUL_RATE: 0.16,
  FT_MAKE: 0.775,

  /* THE FITTED ONE. How hard each possession's rate is pulled back toward the
     pro-rata expectation, per standard deviation of drift.

     MEASURED AGAINST THE SPREAD AND NOT AGAINST THE TOTAL, which is the first
     version of this and it did almost nothing: a ten point drift is 9% of a
     113 point total, so at any sane coefficient the correction was under one
     per cent of the make probability and the sweep came back flat. Swept from
     0 to 0.22 against the total it moved the SD from 12.6 to 11.5 and never
     reached the 9.0 it was written for. Against the SD the same drift is one
     whole unit, which is the scale the correction actually has to work on.

     SWEPT OVER FOUR MATCHUPS AND NOT ONE, because the two things that go
     wrong here are both invisible in an even game: a level-dependent
     correction (see livePossession) shows up as a favourite and an underdog
     landing on different spreads, and a one-matchup fit cannot see it. Even,
     a favourite at 118 against 101, the same game from the other side, and a
     grind at 98 apiece, 10,000 games each:

       PULL   spread, yours/theirs      win rate against resolveGame
       0      12.4 / 12.2               up to 7.7 points out
       0.04    9.9 / 10.2               up to 3.0 out
       0.065   9.0 /  9.1               within 0.7
       0.10    7.9 /  8.0               up to 3.1 out

     The win error tracks the spread exactly, in both directions: a live game
     wider than the resolver pushes every matchup toward a coin flip and a
     tighter one pushes it away. So one dial lands both, and a fit that got
     the spread right and the win rate wrong would mean something else was
     broken. */
  PULL: 0.065,

  /* A CALL ONLY COMES UP WHEN IT IS REALLY A CALL. Both windows are late and
     close, because a decision offered in a fifteen point game is a button, not
     a decision, and a screen full of those teaches somebody to stop reading. */
  LAST_SHOT_SECONDS: 25,
  LAST_SHOT_MARGIN: 3,
  FOUL_SECONDS: 12,
};

/* The per-possession scoring rate that produces `total` points over `poss`
   possessions, given the mix above. Returned as the scalar the make
   probabilities are multiplied by, so the mix keeps its shape at every level
   of offence. */
/* Expected points on one possession at a given make scale, written ONCE and
   read by both the solve below and nothing else. It has to be the arithmetic
   livePossession actually plays, which is the thing the first version got
   wrong: it assumed a shooting foul was always two free throws, where the code
   shoots one on an and-one and two on a miss. Expected shots are therefore
   (2 - k) rather than 2, the solve came out 0.038 points a possession short,
   and every live game finished about FOUR POINTS under what the resolver would
   have given the same matchup. Nothing threw; the sim just quietly played a
   worse team than the one that was drafted. */
function livePerPossession(k) {
  const shot = 1 - LIVE.TURNOVER;
  const three = LIVE.THREE_RATE, two = 1 - LIVE.THREE_RATE;
  const q2 = Math.min(1, k), q3 = Math.min(1, k * LIVE.THREE_OVER_TWO);
  const field = shot * (three * 3 * q3 + two * 2 * q2);
  /* A foul happens on a two. One shot when it went in, two when it did not. */
  const ftShots = q2 * 1 + (1 - q2) * 2;
  const line = shot * two * LIVE.FOUL_RATE * ftShots * LIVE.FT_MAKE;
  return field + line;
}

/* The make scale that produces `total` points over `poss` possessions.
   SOLVED NUMERICALLY rather than rearranged, because the expression above is
   not linear in k (the free throw count depends on it) and because the mix is
   a set of constants somebody will change: a bisection keeps working when the
   algebra behind a closed form would have to be re-derived and would fail
   silently if it were not. Twenty-eight steps is exact to about 1e-8. */
/* The make scale of a LEAGUE AVERAGE team, which is what the pull is measured
   against so that every team is corrected by the same number of points rather
   than by the same fraction of its own. Derived from the two constants the
   rest of the engine already keeps, never typed. */
let LIVE_KREF = 0;

function liveMakeScale(total, poss) {
  const want = total / Math.max(1, poss);
  let lo = 0.02, hi = 1.0;
  if (livePerPossession(hi) < want) return hi;
  for (let i = 0; i < 28; i++) {
    const mid = (lo + hi) / 2;
    if (livePerPossession(mid) < want) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/* Assigned here rather than at the declaration above, because a const read
   before its own line throws TDZ and takes the whole file with it. The
   football results screen has already shipped that once. */
LIVE_KREF = liveMakeScale(CONSTANTS.LEAGUE_RTG * LIVE.POSS / 100, LIVE.POSS);

/* Who takes the shot. The same weights gameBox scores a resolved game with, so
   the man who leads a live box score is the man who would have led the sampled
   one. Built once per game rather than per possession. */
function liveShooters(roster) {
  const men = roster.map((p, i) => {
    const share = 1;
    return {
      i, p, share,
      /* His share of this team's shots: his own scoring, scaled by the minutes
         his slot plays. A man who averaged 30 takes the ball more often than a
         man who averaged 6, which is the entire reason to draft him. */
      weight: Math.max(0.4, (p.pts || 1) * share),
      /* How often HE shoots a three, which is what keeps a live box score's
         split as honest as shootingLine's. */
      threeRate: clamp((p.tpa || 0) / Math.max(1, p.fga || 1), 0, 0.85),
      pts: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0,
    };
  });
  const total = men.reduce((s, m) => s + m.weight, 0) || 1;
  men.forEach((m) => { m.share_shots = m.weight / total; });
  return men;
}

function livePick(men, rng, bias) {
  /* `bias` names one man to feed. Weighted rather than forced, because a star
     isolating still passes out of a double team, and a call that made him take
     it every single time would be a different sport. */
  let pool = men, total = 0;
  const w = pool.map((m) => {
    const x = m.share_shots * (bias != null && m.i === bias ? 3.2 : 1);
    total += x;
    return x;
  });
  let r = rng() * total;
  for (let i = 0; i < pool.length; i++) { r -= w[i]; if (r <= 0) return pool[i]; }
  return pool[pool.length - 1];
}

/* A new live game. `pointsFor` and `pointsAgainst` are exactly what
   resolveGame would have been handed, so the two are always talking about the
   same matchup. */
function liveCreate(roster, pointsFor, pointsAgainst, rng, advantage, meta) {
  const adv = advantage || 1;
  /* THE ADVANTAGE IS APPLIED THE WAY THE RESOLVER APPLIES IT, which is to the
     other team's points and not to yours. Written the other way round the two
     would disagree by the square of it on every home game. */
  const pf = pointsFor;
  const pa = pointsAgainst / adv;
  return {
    pf, pa, adv,
    poss: LIVE.POSS,
    kYou: liveMakeScale(pf, LIVE.POSS),
    kThem: liveMakeScale(pa, LIVE.POSS),
    men: liveShooters(roster),
    n: 0,                    // possessions each side has had
    you: 0, them: 0,
    clock: LIVE.REG_SECONDS,
    quarter: 1,
    ot: 0,
    plays: [],
    pending: null,
    over: false,
    meta: meta || null,
  };
}

/* What one possession is worth, and what it looked like. Pure except for the
   rng and the tallies it writes. */
function livePossession(sim, mine, rng, opts) {
  const o = opts || {};
  const total = mine ? sim.pf : sim.pa;
  const scored = mine ? sim.you : sim.them;
  const k0 = mine ? sim.kYou : sim.kThem;

  /* THE PULL. How far this side has drifted from where it was due, in units of
     the spread resolveGame allows, turned into a nudge on the make
     probability. Behind the pace lifts it, ahead of it lowers it. */
  /* HOW MANY POSSESSIONS THIS SIDE HAS ALREADY HAD, which is not `sim.n`.
     `n` counts both teams, so dividing it by one team's possession count made
     every side permanently two whole games behind its own pace: the pull then
     cranked the make probability as far as the clamp allowed, all game, and a
     sweep that should have tightened the spread produced 200 point finals
     instead. The two sides alternate from n = 0, so mine has had ceil(n/2) and
     theirs has had floor(n/2). */
  const had = mine ? Math.ceil(sim.n / 2) : Math.floor(sim.n / 2);
  const due = total * (had / Math.max(1, sim.poss));
  const drift = scored - due;
  /* AGAINST A FIXED REFERENCE AND NOT AGAINST THIS TEAM'S OWN RATE, which is
     the difference between the two sides of a mismatch getting the same
     spread and getting two different ones. Written `k0 * (1 - pull)` the
     correction is worth a fixed FRACTION of a make, so it moves more points
     for a team scoring 118 than for one scoring 101. Measured over four
     matchups, that put a favourite's spread at 8.57 against an underdog's
     9.02 on the same dial, mirrored on the other side, where resolveGame
     allows every team the same 9.02 whatever it scores. */
  let k = k0 - LIVE.PULL * LIVE_KREF * drift / LIVE_SD;
  /* A call can lift or lower the odds on this one possession. */
  if (o.edge) k *= o.edge;
  k = clamp(k, 0.05, 1.6);

  if (!o.mustShoot && rng() < LIVE.TURNOVER) {
    return { pts: 0, kind: 'to', mine };
  }

  /* Which shot. `force` lets a call say two or three rather than leaving it to
     the mix, which is the whole of the down-two decision. */
  const wantThree = o.force === 3 ? true
    : o.force === 2 ? false
    : rng() < LIVE.THREE_RATE;

  const shooter = mine ? livePick(sim.men, rng, o.bias) : null;
  const q = wantThree ? k * LIVE.THREE_OVER_TWO : k;
  const made = rng() < q;

  if (shooter) {
    shooter.fga++;
    if (wantThree) shooter.tpa++;
    if (made) { shooter.fgm++; if (wantThree) shooter.tpm++; }
  }

  let pts = made ? (wantThree ? 3 : 2) : 0;
  let kind = made ? (wantThree ? 'three' : 'two') : 'miss';

  /* The foul line. Only on twos, which is the common case and keeps the
     arithmetic in liveMakeScale's solve honest. */
  if (!wantThree && rng() < LIVE.FOUL_RATE) {
    let ft = 0;
    const shots = made ? 1 : 2;
    for (let s = 0; s < shots; s++) if (rng() < LIVE.FT_MAKE) ft++;
    if (shooter) { shooter.fta += shots; shooter.ftm += ft; }
    pts += ft;
    if (ft > 0) kind = made ? 'and1' : 'ft';
  }

  if (shooter) shooter.pts += pts;
  return { pts, kind, mine, who: shooter ? shooter.i : null,
    name: shooter ? shooter.p.n : null };
}

/* How much clock one possession eats. Real enough to read, and it is what the
   two call windows are measured against.

   THE POSSESSION COUNT IS THE AUTHORITY AND THE CLOCK FOLLOWS IT, which is a
   fix rather than a preference. Written the other way round, as a fixed tick
   against a clock that decided when the game was over, the two desynced two
   different ways at once and both were silent:

   - A fast game ran 199 possessions EVERY TIME. Regulation divides into 198
     exactly, so after 198 ticks the clock is a hair above zero rather than on
     it, and the 199th possession belongs to whoever went first. That is a
     whole extra possession for YOUR side in every simmed game: measured at
     +1.3 points and +4.1 points of win rate against resolveGame, with the
     other side landing exact, which is what an asymmetry that size looks like.
   - A jittered game ran 198 usually and up to 206 sometimes. So a game a
     player WATCHED and the same game simmed were not the same game.

   Dividing what is left by what is left to play cannot drift: the pace
   self-corrects after a long possession and both sides always get `poss` of
   them.

   THERE IS NO FAST CLOCK, AND THERE WAS. An earlier draft took a `fast` flag
   that dropped the jitter, used by liveFinish so a simmed game did not bother
   rolling for it. That is a SECOND GAME: both call windows are measured
   against this clock, so an evenly ticking one asks a different set of
   questions at a different set of scores. "Sim the rest" is allowed to hurry
   the screen and never the basketball, which is the football boss battle's
   own rule, and the cheapest way to keep it is to have one clock. */
function liveTick(sim, rng) {
  const left = sim.poss * 2 - sim.n;
  /* The last one eats the rest, so the horn and the clock agree. */
  if (left <= 1) return sim.clock;
  const base = sim.clock / left;
  return Math.min(sim.clock, Math.max(2, base * (0.45 + rng() * 1.15)));
}

/* THE TWO CALLS, ASKED OF THE SITUATION AND NEVER OF A COUNTER.
 *
 * Both are late and close, because a decision offered in a fifteen point game
 * is a button rather than a decision. Answered here so the sim, the auto
 * caller and the screen all agree about when one exists. */
function liveDecision(sim) {
  const margin = sim.you - sim.them;
  const mine = sim.n % 2 === 0;        // whose possession is next

  if (mine && sim.clock <= LIVE.LAST_SHOT_SECONDS
      && Math.abs(margin) <= LIVE.LAST_SHOT_MARGIN) {
    /* THE LAST SHOT. Down three it is a three or nothing, down two it is the
       real question, and level or up it is who you trust. The options are
       built from the situation so the screen never offers a tie to somebody
       who is already ahead. */
    const best = sim.men.slice().sort((a, b) => b.weight - a.weight)[0];
    const opts = [];
    if (margin <= -3) {
      opts.push({ id: 'three', label: 'Three for the tie',
        why: best.p.n + ' from deep. Nothing else keeps you alive.' });
      opts.push({ id: 'quick2', label: 'Quick two, then foul',
        why: 'Score, stop the clock, and hope for one more.' });
    } else if (margin === -2 || margin === -1) {
      opts.push({ id: 'two', label: margin === -2 ? 'Two for the tie' : 'Two to win',
        why: 'The best look you can get. Overtime if it drops.' });
      opts.push({ id: 'three', label: 'Three to win',
        why: 'No overtime. Win it here or lose it here.' });
    } else {
      opts.push({ id: 'iso', label: 'Give it to ' + lastNameOf(best.p.n),
        why: 'Your best scorer, one on one, clock running out.' });
      opts.push({ id: 'best', label: 'Run the offense',
        why: 'Whoever the defense leaves. Better shot, smaller name.' });
    }
    return { kind: 'shot', margin, clock: Math.round(sim.clock), options: opts };
  }

  if (!mine && sim.clock <= LIVE.FOUL_SECONDS && margin === 3) {
    /* UP THREE, THE CALL EVERY COACH ARGUES ABOUT. Fouling gives away two and
       the ball; defending gives away a look at a three. Neither is wrong, and
       which is better here depends on the roster. */
    return { kind: 'foul', margin, clock: Math.round(sim.clock), options: [
      { id: 'foul', label: 'Foul them', why: 'Two free throws. They cannot tie it.' },
      { id: 'defend', label: 'Play defense', why: 'Make them beat you from three.' },
    ] };
  }
  return null;
}

/* What the auto caller picks. This is what "simulate it" answers with, and it
   is also the backstop for a live game somebody walks away from.

   THE STANDARD ANSWER, never the optimal one, and the difference matters: a
   perfect caller would make simming strictly better than playing, which is the
   opposite of the point. Down two it takes the tie, up three it fouls, and
   level it feeds the star. Every one of those is what most coaches do. */
function liveAutoCall(sim, decision) {
  if (!decision) return null;
  if (decision.kind === 'foul') return 'foul';
  const ids = decision.options.map((o) => o.id);
  if (ids.indexOf('two') >= 0) return 'two';
  if (ids.indexOf('three') >= 0 && ids.indexOf('quick2') >= 0) return 'three';
  return ids[0];
}

/* Play one possession, or ask for a call first. Returns what happened, or
   `{ pending }` when the screen has to stop and ask. */
function liveAdvance(sim, rng, opts) {
  const o = opts || {};
  if (sim.over) return null;
  if (sim.pending) return { pending: sim.pending };

  if (!o.skipDecision) {
    const d = liveDecision(sim);
    if (d) { sim.pending = d; return { pending: d }; }
  }
  return liveStep(sim, rng, null, o);
}

/* The possession itself, with whatever the call decided folded in. Split from
   liveAdvance so answering a call and playing an ordinary possession go
   through one body: two of them would drift the moment a third call is
   added. */
function liveStep(sim, rng, choice, opts) {
  const o = opts || {};
  const mine = sim.n % 2 === 0;
  const pOpts = {};
  let note = null;

  if (choice === 'iso') { pOpts.bias = topManIndex(sim); pOpts.edge = 1.06; note = 'Iso'; }
  else if (choice === 'best') { pOpts.edge = 1.12; pOpts.mustShoot = true; note = 'Open look'; }
  else if (choice === 'two') { pOpts.force = 2; pOpts.mustShoot = true; note = 'Two for it'; }
  else if (choice === 'three') { pOpts.force = 3; pOpts.mustShoot = true; note = 'From deep'; }
  else if (choice === 'quick2') { pOpts.force = 2; pOpts.edge = 1.2; pOpts.mustShoot = true; note = 'Quick two'; }

  let play;
  if (choice === 'foul') {
    /* A deliberate foul is two free throws and the ball back, which is why it
       is not a possession in the ordinary sense: nobody shoots from the floor
       and the clock barely moves. */
    let ft = 0;
    for (let s = 0; s < 2; s++) if (rng() < LIVE.FT_MAKE) ft++;
    play = { pts: ft, kind: 'ft', mine: false, name: null };
    sim.them += ft;
    sim.clock = Math.max(0, sim.clock - 3);
    sim.plays.push(livePlay(sim, play, 'Fouled'));
    sim.pending = null;
    /* The ball comes back to you, so the next possession is yours whatever the
       parity says. Recorded rather than inferred, because `n` is what decides
       whose ball it is everywhere else. */
    sim.n += 1;
    /* AND THE SAME END CHECK, because this branch returns early. Without it a
       foul on the last possession of the game leaves the game running, and the
       next possession is a free one for you after the horn. */
    liveMaybeEnd(sim, rng);
    return play;
  }
  if (choice === 'defend') { pOpts.force = 3; pOpts.edge = 0.92; note = 'They shoot it'; }

  play = livePossession(sim, mine, rng, pOpts);
  if (mine) sim.you += play.pts; else sim.them += play.pts;
  sim.n += 1;
  sim.clock = Math.max(0, sim.clock - liveTick(sim, rng));
  sim.pending = null;

  /* The quarter, derived from the clock rather than counted, so a possession
     that eats an unusual amount of it cannot desync the two. */
  if (!sim.ot) {
    sim.quarter = clamp(5 - Math.ceil(sim.clock / (LIVE.REG_SECONDS / 4)), 1, 4);
  }
  sim.plays.push(livePlay(sim, play, note));

  liveMaybeEnd(sim, rng);
  return play;
}

function topManIndex(sim) {
  let best = sim.men[0];
  for (const m of sim.men) if (m.weight > best.weight) best = m;
  return best.i;
}

function livePlay(sim, play, note) {
  return {
    q: sim.ot ? 'OT' + sim.ot : 'Q' + sim.quarter,
    clock: Math.max(0, Math.round(sim.clock)),
    mine: play.mine, pts: play.pts, kind: play.kind,
    /* WHO IT WAS, BY INDEX AND NOT ONLY BY NAME. The name is what the line
       over the board reads; the index is what a caller keeping a running
       total per man looks him up by. It was missing, so the six live point
       totals on the board sat at zero for a whole game while the play by
       play beside them named the scorer every time. Nothing threw: the page
       guards on `who != null` and undefined is not null. */
    who: play.who == null ? null : play.who,
    name: play.name || null, note: note || null,
    you: sim.you, them: sim.them,
  };
}

/* Is the period over. ASKED OF THE POSSESSIONS AND NEVER OF THE CLOCK, per
   liveTick's note: the clock is drawn from what is left to play, so it reaches
   zero when this does, and reading it instead is what let a rounding error
   hand one side an extra possession every game. */
function liveMaybeEnd(sim, rng) {
  if (sim.n < sim.poss * 2) return;
  sim.clock = 0;
  liveEndPeriod(sim, rng);
}

/* Regulation is over. Level means five more minutes, which is a real overtime
   rather than resolveGame's bump: the whole reason to play it forward is that
   the last two minutes are the game. */
function liveEndPeriod(sim, rng) {
  if (sim.you !== sim.them) { sim.over = true; return; }
  sim.ot++;
  /* A safety valve, because a tie that will not break is a page that never
     finishes. Four overtimes has happened twice in NBA history. */
  if (sim.ot > 4) { sim.you += 1; sim.over = true; return; }
  sim.clock = LIVE.OT_SECONDS;
  const extra = Math.round(LIVE.POSS * (LIVE.OT_SECONDS / LIVE.REG_SECONDS));
  sim.poss += extra;
  sim.pf += sim.pf * (extra / (sim.poss - extra));
  sim.pa += sim.pa * (extra / (sim.poss - extra));
}

/* Play the rest of it with nobody watching, which is what "simulate it" does
   and what the backstop does when a live game is abandoned. The auto caller
   still answers every call, so a simmed game and a played one differ by the
   calls rather than by whether the calls happened. */
function liveFinish(sim, rng, cap) {
  let guard = 0;
  const limit = cap || 4000;
  while (!sim.over && guard++ < limit) {
    if (sim.pending) {
      liveStep(sim, rng, liveAutoCall(sim, sim.pending));
      continue;
    }
    const d = liveDecision(sim);
    if (d) { liveStep(sim, rng, liveAutoCall(sim, d)); continue; }
    liveStep(sim, rng, null);
  }
  if (!sim.over) sim.over = true;
  return liveResult(sim);
}

/* The result, in exactly the shape resolveGame answers in, so a caller can
   hand either to the same code. `live` says which it was rather than leaving a
   reader to infer it, which is the football game's own note. */
function liveResult(sim) {
  return {
    won: sim.you > sim.them,
    yourPoints: sim.you,
    oppPoints: sim.them,
    ot: sim.ot,
    live: true,
    /* The box score is what actually happened rather than a decomposition of
       a total, which is the one thing a live game can say that a resolved one
       cannot. Rebounds and assists are absent on purpose: nothing here models
       them, and inventing a column to match the other sheet's shape would be
       the invented-opponent mistake in miniature. */
    lines: sim.men.map((m) => ({
      i: m.p.i, n: m.p.n, slot: m.p._slot || null,
      pts: m.pts, fgm: m.fgm, fga: m.fga, tpm: m.tpm, tpa: m.tpa,
      ftm: m.ftm, fta: m.fta,
    })),
    /* AND THE QUARTERS ARE COUNTED, not apportioned. quarterLines splits a
       finished total into four plausible periods, which is the right answer
       for a game that was never played and the wrong one for a game somebody
       WATCHED: they would open their own Game 7 from the results table and
       find a third quarter that did not happen. In the same shape, so a
       reader can hand either to the same code. */
    quarters: liveQuarters(sim),
  };
}

function liveQuarters(sim) {
  const periods = 4 + Math.max(0, sim.ot | 0);
  const names = ['1st', '2nd', '3rd', '4th'];
  for (let k = 4; k < periods; k++) names.push(periods === 5 ? 'OT' : 'OT' + (k - 3));
  const yours = new Array(periods).fill(0);
  const theirs = new Array(periods).fill(0);
  for (const p of sim.plays) {
    if (!p.pts) continue;
    const at = p.q.charAt(0) === 'O'
      ? 3 + (parseInt(p.q.slice(2), 10) || 1)
      : (parseInt(p.q.slice(1), 10) || 1) - 1;
    const k = clamp(at, 0, periods - 1);
    if (p.mine) yours[k] += p.pts; else theirs[k] += p.pts;
  }
  return { names, yours, theirs, periods };
}

// ─── the coach report ───────────────────────────────────────────────────────

/* A human read on the roster: what it does, what it cannot do, and a verdict.
   The results screen ends on words rather than a number, which is the whole
   reason this exists. Expects a slot-tagged roster. */
/* JUDGE THE ROSTER ON WHAT IT RATES, NOT ON WHAT IT ADDS UP TO. Reading raw
   win share sums here told a 39 win team it had an elite offense AND locked
   teams down, while the page beside it printed a defensive rating of 113.4,
   which is exactly average. Sums do not know about minutes, about roster shape,
   or about the fact that fifteen defensive win shares spread over a whole
   roster is ordinary. The ratings do, they are the numbers the season is actually played
   with, and they are what the player is looking at. */
/* THE TWO ENDS OF THE WEAKEST STARTER, read off what a draft actually
 * produces rather than picked. The line they replace read the SIXTH MAN at 8
 * win shares and under 2, which are numbers about a different man on a roster
 * that no longer exists.
 *
 * Measured over 150 drafts each of the three ways anybody drafts, at the
 * shipped cap, on the weakest man of a finished roster:
 *
 *            median   p90   max
 *   greedy     1.7    3.6   6.1
 *   value      1.4    2.2   3.9
 *   cheapest   0.2    0.8   1.7
 *
 * BOTH ENDS ARE THE UNEARNABLE BADGE IN A DIFFERENT COAT if they are set off
 * the eye. The first draft of this block carried 4.6 and 1.4, and against the
 * table above that is a strength a greedy draft reaches on under one run in
 * twenty and a weakness it collects on half of them: a compliment nobody gets
 * and a complaint everybody gets, which is two dead lines rather than two
 * verdicts.
 *
 * 3.5 is greedy's p90, so a roster whose FIFTH best man is that good was
 * drafted deliberately. 0.8 is a quarter of greedy's runs and the top of the
 * cheapest bot's whole range, so it names a roster that really did fill a
 * starting spot with nobody. */
const WEAK_LINK = { STRONG: 3.5, HOLE: 0.8 };

function coachReport(roster, chem, structure, rating, unspentMusd, ortg, drtg) {
  const L = CONSTANTS.LEAGUE_RTG;
  const chemBonus = chem ? chem.bonus : 0;
  const top = [...roster].sort((a, b) => b.w - a.w)[0];
  /* THE WEAKEST STARTER, which is the observation a five man roster makes
     that a six man one could not. There is no bench, so the man at the bottom
     of this list is on the floor for all 48 minutes of every game and there is
     nobody to hide him behind. That is the whole difference between a roster
     with a star and four holes and a roster that can play. */
  const weakest = [...roster].sort((a, b) => a.w - b.w)[0];

  const strengths = [], weaknesses = [];
  if (typeof ortg === 'number') {
    if (ortg >= L + 5) strengths.push('Elite offense');
    else if (ortg < L - 3) weaknesses.push('Cannot score enough');
  }
  if (typeof drtg === 'number') {
    if (drtg <= L - 5) strengths.push('Locks teams down');
    else if (drtg > L + 3) weaknesses.push('Nobody guards anybody');
  }
  if (weakest && weakest.w >= WEAK_LINK.STRONG) strengths.push('No weak link');
  else if (!weakest || weakest.w < WEAK_LINK.HOLE) weaknesses.push('A hole in the five');
  if (chemBonus >= 1.6) strengths.push('Real chemistry');
  else if (chemBonus < 0.4) weaknesses.push('Five strangers');
  /* 'iso', AND IT READ 'hero_ball' FOR THE LIFE OF THIS FUNCTION. No system
     has ever carried that key, so this weakness had never printed once, while
     the system it means is the second most common label a drafted roster
     gets. An undefined key compares false rather than throwing, which is why
     nothing ever said so. Same class as the results screen reading a field
     off an outcome that has no such field. */
  if (structure && structure.archetype && structure.archetype.key === 'iso')
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
  CAP: 'Bullets', CHA: 'Bobcats', KCO: 'Kings', NOJ: 'Jazz', NYN: 'Nets',
  CHP: 'Packers', CHZ: 'Zephyrs', FTW: 'Pistons', MLH: 'Hawks', MNL: 'Lakers',
  PHW: 'Warriors', ROC: 'Royals', SDA: 'Sails', SDR: 'Rockets',
  SYR: 'Nationals', TRI: 'Blackhawks', NYA: 'Nets',
};

/* [primary, secondary] for every club the wheel can land on, under the code
 * Basketball-Reference uses for it. Defunct clubs carry the colors they wore,
 * not their successor's: the Buffalo Braves were orange and black and it would
 * be a strange thing to draw them in Milwaukee's green.
 *
 * A club's own palette is often more than two colors. What goes here is the
 * pair a fan would name if you asked, because that is what the wheel is
 * claiming when it paints itself. */
const TEAM_COLORS = {
  ATL: ['#E03A3E', '#C1D32F'], BOS: ['#007A33', '#BA9653'], BRK: ['#000000', '#FFFFFF'],
  CHI: ['#CE1141', '#000000'], CHO: ['#1D1160', '#00788C'], CLE: ['#860038', '#FDBB30'],
  DAL: ['#00538C', '#B8C4CA'], DEN: ['#0E2240', '#FEC524'], DET: ['#C8102E', '#1D42BA'],
  GSW: ['#1D428A', '#FFC72C'], HOU: ['#CE1141', '#C4CED4'], IND: ['#002D62', '#FDBB30'],
  LAC: ['#C8102E', '#1D428A'], LAL: ['#552583', '#FDB927'], MEM: ['#5D76A9', '#F5B112'],
  MIA: ['#98002E', '#F9A01B'], MIL: ['#00471B', '#EEE1C6'], MIN: ['#0C2340', '#78BE20'],
  NOP: ['#0C2340', '#C8102E'], NYK: ['#006BB6', '#F58426'], OKC: ['#007AC1', '#EF3B24'],
  ORL: ['#0077C0', '#C4CED4'], PHI: ['#006BB6', '#ED174C'], PHO: ['#1D1160', '#E56020'],
  POR: ['#E03A3E', '#000000'], SAC: ['#5A2D81', '#63727A'], SAS: ['#000000', '#C4CED4'],
  TOR: ['#CE1141', '#000000'], UTA: ['#002B5C', '#F9A01B'], WAS: ['#002B5C', '#E31837'],
  // Franchises in the colors they wore under the name they wore.
  SEA: ['#00653A', '#FFC200'], NJN: ['#002A60', '#DA2032'], VAN: ['#00B2A9', '#BC7844'],
  CHH: ['#00778B', '#280071'], WSB: ['#002B5C', '#E31837'], KCK: ['#00509D', '#C8102E'],
  SDC: ['#E35205', '#00285E'], NOH: ['#00778B', '#1D1160'], NOK: ['#00778B', '#1D1160'],
  BAL: ['#002B5C', '#E31837'], BUF: ['#F47B20', '#000000'], CIN: ['#C8102E', '#00509D'],
  SFW: ['#1D428A', '#FFC72C'], STL: ['#E03A3E', '#26282A'],
  CAP: ['#002B5C', '#E31837'], CHA: ['#F9423A', '#00778B'], KCO: ['#00509D', '#C8102E'],
  NOJ: ['#5A2D81', '#FDB927'], NYN: ['#CE1141', '#002A60'], NYA: ['#CE1141', '#002A60'],
  CHP: ['#002B5C', '#E31837'],
  CHZ: ['#002B5C', '#E31837'], FTW: ['#C8102E', '#1D42BA'], MLH: ['#E03A3E', '#26282A'],
  MNL: ['#552583', '#FDB927'], PHW: ['#1D428A', '#FFC72C'], ROC: ['#C8102E', '#00509D'],
  SDA: ['#E35205', '#00285E'], SDR: ['#CE1141', '#C4CED4'], SYR: ['#006BB6', '#ED174C'],
  TRI: ['#E03A3E', '#26282A'],
};

function teamColors(code) {
  return TEAM_COLORS[code] || ['#2b2b33', '#c9ccd6'];
}

/* ── PAINTING THE WHEEL IN A CLUB'S COLORS ──────────────────────────────────
 *
 * Ported from cfb/engine.js, which solved this for 130-odd schools. The problem
 * is the same one and it is not "use the hex the club publishes":
 *
 *   A dark ground is not a white one. This page is #0d1117. San Antonio's black
 *   and Brooklyn's black are the club's real primary and they are invisible on
 *   it, and so is every navy: Denver, Minnesota, Utah, Washington and the two
 *   Pelicans codes are all within a hair of the page.
 *
 *   A neutral second color cannot be drawn as itself either. Chicago's black on
 *   Chicago's red is a band nobody can see, and Portland's black on Portland's
 *   red is the same. But San Antonio's silver and Brooklyn's white are the whole
 *   point of those clubs and have to survive.
 *
 * So a color with real hue keeps its hue exactly and gets its saturation floored
 * and its lightness set; a color with no hue is treated as what it is. A dark
 * neutral falls back to the club's OWN primary, lifted, which is still the
 * club's palette and is actually visible. A light neutral stays light, which is
 * how the Spurs keep their silver.
 */
const CHROMA_FLOOR = 20;
/* How far the band has to stand off the fill it sits on. 2.6:1 is above the 3:1
   bar for a graphical object read at a glance, which a 1.5px border is not, and
   below the point where every club's second color has to be lifted into pastel
   to reach it. Six clubs need the lift; the rest clear it as they are. */
const ACCENT_MIN = 2.6;

function chromaOf(hex) {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16),
        b = parseInt(hex.slice(5, 7), 16);
  return Math.max(r, g, b) - Math.min(r, g, b);
}

function hexToHsl(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.substr(i, 2), 16) / 255);
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  const l = (mx + mn) / 2;
  let h = 0, s = 0;
  if (d) {
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    if (mx === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return [h, s * 100, l * 100];
}

function hslToHex(h, s, l) {
  const S = s / 100, L = l / 100;
  const c = (1 - Math.abs(2 * L - 1)) * S;
  const x = c * (1 - Math.abs((((h % 360) + 360) % 360 / 60) % 2 - 1));
  const m = L - c / 2;
  const seg = Math.floor((((h % 360) + 360) % 360) / 60);
  const rgb = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][seg];
  return '#' + rgb.map((v) => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('');
}

function relativeLuminance(hex) {
  const ch = [1, 3, 5].map((i) => parseInt(hex.substr(i, 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

function contrast(a, b) {
  const hi = Math.max(relativeLuminance(a), relativeLuminance(b));
  const lo = Math.min(relativeLuminance(a), relativeLuminance(b));
  return (hi + 0.05) / (lo + 0.05);
}

/** One club color, floored into a range that shows. Hue never moves: hue is the
 *  identity. A color with no hue at all returns a grey at neutralL, because an
 *  invented hue would be a lie about the club. */
function wheelColor(hex, minS, targetL, neutralL) {
  if (chromaOf(hex) < CHROMA_FLOOR) {
    return hslToHex(0, 0, neutralL === undefined ? targetL : neutralL);
  }
  const [h, s] = hexToHsl(hex);
  return hslToHex(h, Math.min(100, Math.max(s, minS)), targetL);
}

/**
 * The pair the reel paints itself with: a fill dark enough to carry white text,
 * and an accent bright enough to be a band around it.
 */
function wheelColors(primaryHex, secondaryHex) {
  const primary = primaryHex || '#334155';
  const secondary = secondaryHex || primary;
  // A neutral primary lands near black rather than at mid grey, because a club
  // that wears black should read black: San Antonio, Brooklyn.
  const bg = wheelColor(primary, 55, 26, 13);
  let accent;
  if (chromaOf(secondary) < CHROMA_FLOOR) {
    const l = hexToHsl(secondary)[2];
    // Light neutral stays light, which is the Spurs' silver and the Nets' white.
    // Dark neutral would be a band nobody can see, so it becomes the club's own
    // primary lifted off the fill instead.
    accent = l >= 50 ? wheelColor(secondary, 70, 55, 86)
                     : wheelColor(primary, 55, 58, 62);
  } else {
    accent = wheelColor(secondary, 70, 55);
  }
  /* THEN LIFT IT UNTIL IT IS ACTUALLY VISIBLE, measured against the fill rather
   * than assumed from the number we just set.
   *
   * HSL lightness is not brightness. A violet at lightness 55 is DARKER to the
   * eye than a teal at 26, so the original Hornets came back as a purple band on
   * a teal box at 1.16:1, which is one flat color with a seam in it. Vancouver's
   * bronze on Vancouver's turquoise did the same at 1.57.
   *
   * So the hue and the saturation stay exactly where the club put them and only
   * the lightness climbs, two points at a time, until the band clears the fill.
   * Every club that already passed is untouched, because the loop does not run. */
  for (let guard = 0; guard < 24 && contrast(accent, bg) < ACCENT_MIN; guard++) {
    const [h, s, l] = hexToHsl(accent);
    if (l >= 92) break;
    accent = hslToHex(h, s, Math.min(92, l + 2));
  }
  // Whichever of white or near-black actually survives on the fill, measured
  // rather than assumed. A hand-written list of "bright" clubs is wrong for
  // about a fifth of any league.
  const on = contrast(bg, '#ffffff') >= contrast(bg, '#0b1220') ? '#ffffff' : '#0b1220';
  return { bg, accent, on };
}

/** The whole palette for one club code, ready to hand to CSS. */
function clubSkin(code) {
  const [primary, secondary] = teamColors(code);
  const w = wheelColors(primary, secondary);
  return { primary, secondary, bg: w.bg, accent: w.accent, on: w.on };
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
/* `${code}|${season}` for every club that won the title THAT season, under the
   code it wore at the time. Built once, at setTeams. See titlesByCode. */
let TITLE_AT = null;
/* Every title the whole franchise has won, reachable from any of its codes. */
let LINEAGE_TITLES = null;
/* Every code one franchise has ever worn, reachable from any of them. Built at
   setTeams off the same `became` chain the titles use, because a franchise is
   one thing and two walks of the same table would be two answers to it. */
let LINEAGE_CODES = null;

function setTeams(json) {
  TEAMS = (json && json.teams) || null;
  const built = titlesByCode(TEAMS);
  TITLE_AT = built.at;
  LINEAGE_TITLES = built.lineage;
  LINEAGE_CODES = built.codes;
}

/* ── A TITLE BELONGS TO THE CLUB THAT WORE THE NAME ────────────────────────
 *
 * teams.json files every championship under the franchise's CURRENT code,
 * because that is how a franchise table is written: one row of honours per
 * club as it exists today. Basketball-Reference does not name a season that
 * way, and neither does anybody else.
 *
 * So `WAS` carries 1978 and the 1978 roster is filed under `WSB`. `OKC`
 * carries 1979 and the 1979 roster is Seattle. Both of those rings simply did
 * not join to anybody, and neither did anything fail: the roster note for the
 * 1978 Bullets read "founded 1974 · later the Washington Wizards" and never
 * mentioned that they were the reigning champions of the world.
 *
 * This walks each franchise's aliases and hands each title year to the record
 * whose own lifetime contains it, preferring the NARROWEST window when two
 * overlap, since the alias is always more specific than the modern row it
 * eventually became.
 */
function titlesByCode(teams) {
  const at = Object.create(null), lineage = Object.create(null);
  const codes = Object.create(null);
  if (!teams) return { at, lineage, codes };

  /* Follow `became` to the row the franchise is today.
   *
   * STOPS AT THE LAST ROW THAT EXISTS, never at the name of one that does not.
   * A `became` pointing at a code nobody wrote is a typo in a hand-maintained
   * table, and walking into it would file the franchise under a phantom root
   * whose titles array is empty, dropping every championship it has won without
   * anything failing. Stopping short keeps them on the row that listed them.
   *
   * The hop limit is for a cycle in the same hand-maintained table, which would
   * otherwise hang the boot. */
  const rootOf = (code) => {
    let c = code;
    for (let hop = 0; hop < 12; hop++) {
      const t = teams[c];
      if (!t || !t.became || t.became === c || !teams[t.became]) return c;
      c = t.became;
    }
    return c;
  };

  const family = Object.create(null);
  for (const code of Object.keys(teams)) {
    const root = rootOf(code);
    (family[root] || (family[root] = [])).push(code);
  }

  for (const root of Object.keys(family)) {
    const titles = (teams[root] && teams[root].titles) || [];
    /* Sorted so the list is stable whatever order Object.keys came back in:
       this is read by the club lock, and a set that reshuffles between boots
       would reshuffle a seeded run. */
    const all = family[root].slice().sort();
    for (const code of family[root]) { lineage[code] = titles; codes[code] = all; }
    for (const year of titles) {
      let best = root, bestWidth = Infinity;
      for (const code of family[root]) {
        const t = teams[code];
        if (!t) continue;
        const from = t.founded, to = t.folded;
        if (typeof from === 'number' && year < from) continue;
        if (typeof to === 'number' && year > to) continue;
        const width = (typeof to === 'number' ? to : 9999) - (typeof from === 'number' ? from : 0);
        if (width < bestWidth) { best = code; bestWidth = width; }
      }
      at[`${best}|${year}`] = true;
    }
  }
  return { at, lineage, codes };
}

/* EVERY CODE THIS FRANCHISE HAS EVER WORN, including the one asked for.
 *
 * The club lock reads this, and it is the whole reason a Thunder fan gets
 * Gary Payton and a Grizzlies fan gets Vancouver. Written as a lookup rather
 * than a walk because the walk is already done once at setTeams, and two
 * walks of one hand-maintained table is two answers to "what is a franchise".
 *
 * Falls back to the code alone, which is what an engine with no teams.json
 * loaded has to say: one code is a franchise of one, which is wrong about
 * history and right about the data it can see.
 */
function franchiseCodes(code) {
  return (LINEAGE_CODES && LINEAGE_CODES[code]) || [code];
}

/* The thirty clubs that exist today, each with its whole lineage behind it,
   sorted by the name a fan would look for. This is the club picker's list. */
function franchises() {
  if (!TEAMS) return [];
  return Object.keys(TEAMS)
    .filter(c => TEAMS[c].current !== false)
    .map(c => ({
      code: c,
      name: TEAMS[c].name || c,
      full: TEAMS[c].full || TEAMS[c].name || c,
      city: TEAMS[c].city || '',
      founded: TEAMS[c].founded || null,
      titles: (LINEAGE_TITLES && LINEAGE_TITLES[c]) || TEAMS[c].titles || [],
      codes: franchiseCodes(c),
    }))
    .sort((a, b) => a.full.localeCompare(b.full));
}

/** Did this club, under this code, win the championship in this season? */
function wonTitle(code, season) {
  if (!TITLE_AT) return false;
  return TITLE_AT[`${code}|${season}`] === true;
}

function team(code) {
  const t = TEAMS && TEAMS[code];
  if (t) return t;
  const name = TEAM_NAMES[code];
  return name ? { code, name, full: name, titles: [] } : { code, name: code, full: code, titles: [] };
}

/* DOES ANY TABLE ACTUALLY KNOW THIS CODE.
 *
 * team() cannot answer it: its last fallback returns { name: code }, so
 * `team('NOPE').name` is the truthy string 'NOPE' and every existence check
 * written against it passes for every string there is. That is by design
 * there, because a name is always wanted and a code is a better name than
 * nothing. It is the wrong shape for a gate, and the club lock is a gate: an
 * unknown code silently empties the wheel rather than being refused. */
function hasTeam(code) {
  return !!((TEAMS && TEAMS[code]) || TEAM_NAMES[code]);
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
  /* THE FRANCHISE'S TITLES, not the row's. A club that has since been renamed
     carries an empty titles array, because teams.json files the honours under
     the modern code, so the 1978 Bullets used to be described as a club that
     had never won anything in the season they won it. */
  const owned = (LINEAGE_TITLES && LINEAGE_TITLES[code]) || t.titles;
  if (owned && owned.length) {
    /* Titles won BY this season, because a 1987 roster has not won the ones
       that came later and saying otherwise is just wrong. */
    const won = typeof season === 'number' ? owned.filter(y => y <= season) : owned;
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
  SLOTS, SLOT_ELIGIBILITY, POSITION_MAX,
  positionsOf, canFillSlot, teamSeasonId, pkey,
  hashSeed, createSeededRNG, normal,
  indexData, buildCheapBy, teamStrength,
  pairLinks, resolveChemistry, setCuratedChemistry,
  rosterOffense, rosterDefense, rosterFit, detectSystem,
  rosterProfile, spacingIndex, paceAdjust, eraOf, ERA_CONTEXT, SYSTEMS, FIT,
  teamWinPct, overallRating, nationalRank, pythagorean,
  buildOpponentPool, generateSchedule, gameMeans,
  resolveGame, playoffSeries, generatePlayoffs, playRun, homeAdvantage,
  poCreate, poNext, poRecord, poAdvance, poFinal,
  LIVE, liveCreate, liveAdvance, liveStep, liveDecision, liveAutoCall,
  liveFinish, liveResult, liveMakeScale,
  BOX, gameBox, quarterLines, apportion, apportionCapped, shootingLine,
  ROUND_NET,
  seedFromRecord, playoffRoundNames, PLAYOFF_ROUND_NAMES, titleEdge,
  respinCost, respinFees,
  coachReport, lastNameOf,
  TEAM_NAMES, TEAM_COLORS, teamColors, teamName,
  wheelColors, clubSkin, contrast, chromaOf, hexToHsl, hslToHex,
  setTeams, team, hasTeam, teamDisplay, teamNote, wonTitle, titlesByCode,
  franchiseCodes, franchises,
};

if (typeof module !== 'undefined' && module.exports) module.exports = publicAPI;
if (typeof window !== 'undefined') window.RTF_ENGINE = publicAPI;
})();
