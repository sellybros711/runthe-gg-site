/* CFB Perfect Season, game engine.
 *
 * Headless, dependency-free. Works in Node (module.exports) and in the browser
 * (window.PS_CFB_ENGINE). All game logic lives here: roster evaluation,
 * chemistry, scheduling, game resolution, display score mapping.
 *
 * Mirrors football/engine.js in architecture but tuned for college football:
 *   - NIL budget ($11M cap vs NFL $140M)
 *   - 12-game regular season
 *   - 12-team CFP (bye for 12-0, first round for 11-1)
 *   - Bowl games for non-playoff teams, themed by roster identity
 *   - CFB-specific chemistry (program, home state, conference, coach)
 *   - CFB-specific offensive schemes (Spread, Air Raid, RPO, etc.)
 */

'use strict';
(function(){

const ENGINE_API_VERSION = 1;

// ─── constants ──────────────────────────────────────────────────────────────

const CONSTANTS = {
  /* SCALE turns an opponent's real points a game into engine points, which is
     the only place the two sides of a scoreline meet. It is therefore the whole
     difficulty dial: raise it and every opponent is harder.

     IT IS ALSO WHERE THE CROSSOVER SITS, which is the thing that decides whether
     drafting well matters. Win probability is a sigmoid in (your mean minus
     theirs), and at 2.0 the crossover sat BELOW the entire roster range: a
     75-overall roster already outscored the average opponent, so 75 and 100
     both lived on the flat top of the curve and were worth 8.7 and 10.4 wins.
     Twenty points of overall, which is most of what a draft is, bought under two
     wins, and a roster at 85 or better went 12-0 in 12% of its seasons.

     At 2.3 the crossover lands inside the range instead, so the ladder is a
     ladder: about 4-8 for a bad draft, 8-4 in the middle, 10-2 at the top, 12-0
     in 5% of seasons rather than 12%.

     RAISING THIS ALONE MAKES A WORSE GAME, and so does damping alone. See
     CONSISTENCY below: the two are one change. */
  SCALE: 2.7,
  /* THE BUDGET HAS TO SAY NO, or there is no decision in the draft. At $14M it
     almost never did: drafting the highest scorer on every board spent 90% of it
     and ran into the price on 9% of picks. The NFL game, which is the same six
     slots and the same price curve at ten times the numbers, spends 98% and is
     priced out on 29%. $11M puts this game on that number. */
  CAP_MUSD: 11,
  RESPIN_LADDER_MUSD: [0.5, 1.0, 1.5],
  MAX_RESPINS: 3,
  /* HOW MANY OF ONE POSITION A ROSTER MAY HOLD. With two flex spots open to a
     running back, a roster could otherwise stack three of them, which is not a
     real offense. Two is the limit: one in the dedicated back spot and at most
     one more in a flex. Quarterbacks are capped at one by having a single slot
     and no flex eligibility; receivers and tight ends are left uncapped so an
     all-receiver Air Raid stays a legal choice. */
  POSITION_MAX: { RB: 2 },
  MIN_RESERVE_PER_SLOT_MUSD: 0.3,
  REGULAR_SEASON_GAMES: 12,
  /* The 12-team College Football Playoff. You are not measured against a win
     total any more, you are ranked against the country: the top 12 get in, and
     the top 4 seeds sit out the first round. FIELD_SIZE is how many teams the
     country holds, so a percentile in the team data becomes a national ranking. */
  PLAYOFF_TEAMS: 12,
  PLAYOFF_BYES: 4,
  FIELD_SIZE: 134,
  /* How a percentile inside the team data becomes a national rank. See
     nationalRank. Raised from 1.18 to widen the playoff field on purpose: a
     larger exponent compresses the top of the poll harder, so more good-not-great
     seasons rank inside the top twelve and more drafts reach the bracket. Making
     the field is meant to be common; winning it is not, and that half is the
     round pivots below, not this. */
  POOL_GAMMA: 1.55,
  PLAYOFF_ROUNDS_WITH_BYE: 3,
  PLAYOFF_ROUNDS_NO_BYE: 4,
  /* OFF, AND LEFT IN PLACE. Two of the twelve used to come from the eleven-win
     pool, to stop a merely good roster running the table. PERFECT_FLOOR does
     that job exactly now, and the marquee games were doing it by making the
     whole season harder for everybody: they cost eight points of win rate and
     took the top of the scale down with the bottom. At 0 the schedule is
     balanced the way it always was. See generateSchedule. */
  MARQUEE_GAMES: 0,
  /* THE TWO FLOORS UNDER THE TITLE. See teamRating() and titleEdge(). They are
     in rating points, which is what the screens show, because there is no scale
     factor any more: see teamOverall(). */
  /* Lowered with the season. These gate the last game on the roster, and they
     were set when the RECORD gated nothing: a 9-3 team could rank into the field,
     so something had to stop it winning the title. Now the field itself is the
     filter, and getting in means 11-1 or better. Best-available drafting lands
     around 90 overall, so a floor at 89 was barring half of the teams that had
     just gone unbeaten from finishing the job: going 12-0 converted to a title
     2.2% of the time, which is the wrong shape for an undefeated No. 1 seed.
     86 to 84 when PRICE_K came down and made a high overall dearer to assemble:
     the floor is a point on the overall scale, so squeezing the scale without
     moving the floor raises the bar by exactly as much as the prices did. Both
     floors follow the distribution rather than standing still in front of it. */
  TITLE_FLOOR: 84,
  /* THE SAME BAR AS THE TITLE, not a higher one. This used to sit above the title
     floor on the argument that the game's own name is on the outcome, and that
     was right when a mediocre roster could luck into 12-0 against a soft season.
     It cannot now: going unbeaten means winning twelve against a real schedule
     with the crossover inside the roster range, and then winning the bracket. At
     89 the floor was quietly disqualifying half of the undefeated champions the
     game produced, which is a strange thing to tell somebody who just went 12-0
     and won the national title. The record is the proof; the floor only has to
     agree with the one on the trophy. */
  PERFECT_FLOOR: 84,
  ROUND_EDGE_MAX: 3.20,
  ROUND_EDGE_MIN: 0.86,
  ROUND_EDGE_SLOPE: 0.075,
  /* THE BAR RISES ROUND BY ROUND. One pivot each: the overall at which that
     round is an even game. A first-round opponent is beatable by a team that
     scraped into the field; the team waiting in the final is not. This is what
     makes how FAR a season goes track the roster rather than the draw.
     The last two are set high on purpose so that winning it all is rare even
     with the field widened: the semifinal thins who reaches the final to
     near-elite rosters, and the championship needs a roster near the very top
     of what the wheel can hand you. RE-ANCHORED when the tight-end slot became
     a second flex: dropping the forced weak TE lifted the best draftable overall
     from about 102 to about 111 (p95 of the best-possible draft is ~104), which
     pulled title and perfect rates up by roughly half again. The semifinal and
     championship pivots move up with the ceiling to hold those rates where they
     were, and rose once more when the two-back cap landed: forbidding a third
     running back pushes the greedy drafter into a receiver, which the balance
     factor rewards, so the average roster got stronger and titles crept up
     again. Both still sit a clear eight-plus points under the 111 max, so a
     perfect season stays reachable rather than mathematically impossible. */
  /* The overall each round is played AGAINST. Lowered together when the season
     was re-tuned: they were set when a 90-overall roster reached the playoff 39%
     of the time and the rounds were the filter. Now the RECORD is the filter, and
     a team that gets in has already proved something, so the door it arrives at
     was gating almost nobody. Measured at the old numbers against the new season,
     titles came out at 0.0%. Re-anchored on the probe's greedy drafts. Lowered
     two more points each when PRICE_K came down, for the same reason as the two
     floors above: these are overalls, and the drafts that have to clear them all
     moved down together. Left where they were, the greedy drafter fell to 0.7%
     titles and 0.04% perfects. */
  ROUND_EDGE_PIVOT: {
    'CFP First Round': 74,
    'CFP Quarterfinal': 80,
    'CFP Semifinal': 84,
    'CFP Championship': 89,
  },
  // Extra, per point below TITLE_FLOOR, on top of the ordinary slope. Final only.
  TITLE_EDGE_CLIFF: 0.16,
  /* BOWL ELIGIBILITY IS SIX WINS, the way it is in real college football: win half
     your games and you have earned a bowl. Which bowl is set by where you finish
     in the country, not by your record, so a strong team that just missed the
     twelve gets a New Year's Six and a 6-6 team gets a lower one. The cutoffs are
     national ranks: outside the top twelve, the best non-playoff teams down to
     BOWL_NY6_RANK land in the six biggest, the next tier down to BOWL_MAJOR_RANK
     in the marquee bowls, and everyone else 6-win-eligible in the rest. */
  BOWL_MIN_WINS: 6,
  BOWL_NY6_RANK: 18,
  BOWL_MAJOR_RANK: 40,
  // How often, out of every bowl, the assignment is the house's own RunThe.GG Bowl.
  RUNTHE_BOWL_CHANCE: 0.05,
  /* How much each side's score is pulled toward its true mean each game. Higher
     means less week-to-week noise, so roster strength wins out.

     THESE ONLY WORK WITH SCALE, AND THE MEASUREMENT IS COUNTERINTUITIVE. Damping
     variance on its own made EVERY band win MORE, not just the good ones: at
     SCALE 2.0 your mean beat the average opponent's at essentially any roster
     quality, so variance was the only thing causing losses, and removing it just
     let the favourite always win. Raising both to 0.85 moved a 75-80 roster from
     8.7 wins to 9.3 and left the spread across the whole range unchanged.

     They are the steepness, not the level. SCALE puts the crossover inside the
     roster range; these sharpen the curve through it so landing on the right
     side of it is decided by the roster rather than by a hot week. Set together
     with SCALE 2.3, measured on real drafts with cfb/build/test/probe_economy.mjs.

     Your side is damped less than the opponent's on purpose: your six players
     having an off week is the drama the player owns, and theirs is the drama
     that happens to them. */
  CONSISTENCY: 0.80,
  OPP_CONSISTENCY: 0.85,
  /* See resolveGame. 1 is the real spread of college scoring offences and it is
     far wider than a draft can move a roster, which is why every draft used to
     end in one of three records. */
  OPP_SPREAD: 0.55,
  PLAYOFF_HOME_FIELD: 0.35,
  // How much of an opponent's defense is applied to your offense. See resolveGame.
  DEFENSE_WEIGHT: 0.65,
};

// ─── conferences ────────────────────────────────────────────────────────────

/* THE CONFERENCE ON A TEAM SEASON IS THE ONE THAT TEAM WAS IN THAT YEAR, not the
   one that school is in now, and a conference draft is far better for it: pick the
   Pac-12 and you get Pac-12 Oregon, USC, Washington and Stanford, as they were,
   rather than whichever four leagues those four ended up in.
   The one thing that needs saying out loud is the Pac-10, which is not a different
   conference from the Pac-12: it is the same one before Colorado and Utah arrived in
   2011. Left as two names it would split the league in half at 2011 and offer a
   ten-team draft nobody asked for. */
const CONFERENCE_LINEAGE = { 'Pac-10': 'Pac-12' };
const conferenceOf = (conf) => CONFERENCE_LINEAGE[conf] || conf || null;

/* The five a conference draft can be played in, with the years each one covers in
   this game's data. Held here rather than derived at runtime so the menu is stable:
   a conference that lost its last team season to a data change should disappear from
   the menu deliberately, not silently. */
const POWER_CONFERENCES = [
  { key: 'SEC',     name: 'SEC' },
  { key: 'Big Ten', name: 'Big Ten' },
  { key: 'Big 12',  name: 'Big 12' },
  { key: 'ACC',     name: 'ACC' },
  { key: 'Pac-12',  name: 'Pac-12' },
];
const isPowerConference = (key) => POWER_CONFERENCES.some((c) => c.key === key);

// ─── respin ─────────────────────────────────────────────────────────────────

function respinCost(used) {
  const L = CONSTANTS.RESPIN_LADDER_MUSD;
  return L[Math.min(used, L.length - 1)];
}

function respinFees(used) {
  let total = 0;
  for (let i = 0; i < used; i++) total += respinCost(i);
  return total;
}

// ─── scoring decomposition ──────────────────────────────────────────────────

const SCORE_KINDS = [
  { pts: 7, label: 'touchdown' },
  { pts: 3, label: 'field goal' },
  { pts: 6, label: 'TD (missed PAT)' },
  { pts: 2, label: 'safety' },
  { pts: 8, label: 'two-point conversion' },
];

function compositionsFor(n) {
  if (n <= 0) return [[0, 0, 0, 0, 0]];
  const results = [];
  const maxTds = Math.floor(n / 7);
  for (let td = maxTds; td >= 0; td--) {
    const r1 = n - td * 7;
    const maxFg = Math.floor(r1 / 3);
    for (let fg = maxFg; fg >= 0; fg--) {
      const r2 = r1 - fg * 3;
      if (r2 === 0) { results.push([td, fg, 0, 0, 0]); continue; }
      const maxMissed = Math.floor(r2 / 6);
      for (let missed = maxMissed; missed >= 0; missed--) {
        const r3 = r2 - missed * 6;
        const maxSafety = Math.floor(r3 / 2);
        for (let safety = maxSafety; safety >= 0; safety--) {
          const r4 = r3 - safety * 2;
          if (r4 === 0) results.push([td, fg, missed, safety, 0]);
          if (r4 === 8) results.push([td, fg, missed, safety, 1]);
        }
      }
    }
    if (results.length > 40) break;
  }
  return results.length ? results : [[0, 0, 0, 0, 0]];
}

function scoreParts(total, rng) {
  let left = Math.max(0, Math.round(total));
  if (left === 1) left = 2;
  if (left === 0) return [];
  const comps = compositionsFor(left);
  if (!comps.length) return [{ points: 7, kind: 'TOUCHDOWN' }];
  // A real game is touchdowns and field goals, the odd missed PAT or two-point
  // try, and safeties almost never. Picking a composition uniformly buried the
  // realistic ones under a pile of all-safety decompositions, so a box score
  // read as ten safeties. Weight the draw the way points are actually scored.
  const weight = (c) => Math.pow(1.95, c[0]) * Math.pow(0.05, c[3]) * Math.pow(0.4, c[2]) * Math.pow(0.5, c[4]);
  let totalW = 0; for (const cc of comps) totalW += weight(cc);
  let pick = rng() * totalW, c = comps[comps.length - 1];
  for (const cc of comps) { pick -= weight(cc); if (pick <= 0) { c = cc; break; } }
  const out = [];
  for (let i = 0; i < c[0]; i++) out.push({ points: 7, kind: 'TOUCHDOWN' });
  for (let i = 0; i < c[1]; i++) out.push({ points: 3, kind: 'FIELD GOAL' });
  for (let i = 0; i < c[2]; i++) out.push({ points: 6, kind: 'TOUCHDOWN', note: 'missed PAT' });
  for (let i = 0; i < c[3]; i++) out.push({ points: 2, kind: 'SAFETY' });
  for (let i = 0; i < c[4]; i++) out.push({ points: 8, kind: 'TOUCHDOWN', note: 'two-point conversion' });
  return out;
}

function scoringScript(you, them, won, rng) {
  const QUARTERS = 4, QSEC = 15 * 60, GAME = QUARTERS * QSEC;
  const yParts = scoreParts(you, rng).map((k) => ({ ...k, team: 'you' }));
  const tParts = scoreParts(them, rng).map((k) => ({ ...k, team: 'them' }));
  if (!yParts.length && !tParts.length) return [];

  const margin = you - them;
  const winner = margin >= 0 ? 'you' : 'them';
  let clincher = null;
  if (margin !== 0 && Math.abs(margin) <= 8) {
    clincher = (winner === 'you' ? yParts : tParts).pop();
  }

  const y = yParts.slice(), t = tParts.slice(), order = [];
  while (y.length || t.length) {
    const a = order.length;
    const twoSame = a >= 2 && order[a - 1].team === order[a - 2].team ? order[a - 1].team : null;
    let takeYou;
    if (!t.length) takeYou = true;
    else if (!y.length) takeYou = false;
    else if (twoSame === 'you') takeYou = false;
    else if (twoSame === 'them') takeYou = true;
    else takeYou = y.length >= t.length;
    order.push((takeYou ? y : t).shift());
  }
  if (clincher) order.push(clincher);

  const n = order.length;
  const el = [];
  for (let i = 0; i < n; i++) {
    if (clincher && i === n - 1) { el.push(GAME - (25 + Math.floor(rng() * (5 * 60)))); continue; }
    const lo = (i / n) * GAME, span = GAME / n;
    el.push(lo + span * (0.15 + rng() * 0.7));
  }

  const quarterOf = (t0) => Math.min(QUARTERS - 1, Math.floor(t0 / QSEC));
  const badLateFG = () => {
    const idx = order.map((e, i) => i).sort((a, b) => el[a] - el[b]);
    let ry = 0, rt = 0;
    for (const i of idx) {
      const e = order[i];
      const behind = e.team === 'you' ? rt - ry : ry - rt;
      if (e.kind === 'FIELD GOAL' && quarterOf(el[i]) === QUARTERS - 1 && behind > 3) return i;
      if (e.team === 'you') ry += e.points; else rt += e.points;
    }
    return -1;
  };
  for (let guard = 0; guard < n + 4; guard++) {
    const bad = badLateFG();
    if (bad < 0) break;
    el[bad] = Math.floor(rng() * (3 * QSEC));
  }

  const idx = order.map((e, i) => i).sort((a, b) => el[a] - el[b]);
  const secs = idx.map((i) => Math.max(1, Math.min(GAME - 1, Math.floor(el[i]))));
  for (let i = 1; i < secs.length; i++) if (secs[i] <= secs[i - 1]) secs[i] = Math.min(GAME - 1, secs[i - 1] + 1);

  let ry = 0, rt = 0;
  return idx.map((i, k) => {
    const e = order[i];
    const t0 = secs[k];
    const q = quarterOf(t0);
    const sec = Math.max(1, Math.min(QSEC - 1, QSEC - (t0 - q * QSEC)));
    if (e.team === 'you') ry += e.points; else rt += e.points;
    return {
      q: q + 1, sec,
      clock: Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0'),
      team: e.team, kind: e.kind, note: e.note || null, points: e.points,
      you: ry, them: rt,
    };
  });
}

// ─── playoff / bowl structure ───────────────────────────────────────────────

/* The bracket, deepest first. Seeds 5 to 12 play all four rounds; the top four
   skip the first and enter at the quarterfinal, so their names are the tail of
   this list. */
const PLAYOFF_ROUND_NAMES = ['CFP First Round', 'CFP Quarterfinal', 'CFP Semifinal', 'CFP Championship'];

function playoffRoundNames(rounds) {
  const n = Math.max(1, Math.min(PLAYOFF_ROUND_NAMES.length, rounds || PLAYOFF_ROUND_NAMES.length));
  return PLAYOFF_ROUND_NAMES.slice(PLAYOFF_ROUND_NAMES.length - n);
}

/* WHAT THE COMMITTEE WEIGHS. Wins and losses first, the way they do in life,
   then how good the team looked (scoring margin as a z-score) and who it played.
   Records are normalized to a 12-game season so a team that played fourteen is
   not rewarded for the extra chances.
   Z went from 1.8 to 4.5 so that margin can actually bridge a loss. At 1.8 one
   loss cost 7.5 resume points while the whole spread of margins inside a record
   was worth about 1.8, so being dominant was arithmetically incapable of making
   up for losing once, and the playoff was a cliff at eleven wins.
   Only WIN + LOSS matters for ordering, not the split: the formula is
   (WIN + LOSS) * w - LOSS * games, and the second term is the same for everyone. */
const RESUME = { WIN: 3.6, LOSS: 3.9, Z: 4.5, SOS: 1.8 };

function resumeScore(wins, losses, z, sos) {
  const played = wins + losses;
  const games = CONSTANTS.REGULAR_SEASON_GAMES;
  const w = played > 0 ? games * wins / played : 0;
  return RESUME.WIN * w - RESUME.LOSS * (games - w) + RESUME.Z * z + RESUME.SOS * sos;
}

/* Where a resume lands in the country, 1 to FIELD_SIZE.
   THE TEAM DATA IS NOT THE COUNTRY. It is the Power 5 plus the notable Group of
   5: about 66 programmes a season out of the 134 that play FBS football, and
   they are the better half. Treating a percentile inside it as a national
   ranking straight, which is what this used to do, quietly assumed the other 68
   teams did not exist. The effect was severe at the top: teams with one loss or
   none are 8.6% of the pool, so they filled the top 12 exactly, and a two-loss
   team could not be ranked twelfth however well it played. That is the whole
   reason a 10-2 season used to be worth nothing.
   POOL_GAMMA is the correction, one exponent: rank = FIELD_SIZE * p^gamma, so
   the top of the pool is compressed the way it is in a real poll (the best teams
   in the country are all in this pool, packed into its first few percent) while
   the bottom still stretches out to last. It is set to widen the field on
   purpose: more good seasons rank inside the top twelve, so making the playoff
   is common, while winning it stays rare through the round pivots. */
function nationalRank(resume, prepared) {
  const table = prepared && prepared.resumeTable;
  if (!table || !table.length) return CONSTANTS.FIELD_SIZE;
  let lo = 0, hi = table.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (table[mid] > resume) lo = mid + 1; else hi = mid; }
  const p = lo / table.length;
  return Math.max(1, Math.min(CONSTANTS.FIELD_SIZE,
    1 + Math.floor(Math.pow(p, CONSTANTS.POOL_GAMMA) * CONSTANTS.FIELD_SIZE)));
}

/* A finished regular season turned into a ranking. The margin arrives in engine
   points, so it is divided by SCALE back into real points and then standardised
   on the same scale the team data's strength_z uses.
   MARGIN_GAIN finishes that standardisation. Your margin is not a real point
   differential: it is your fantasy total against an opponent's real points, so
   the units on the two sides of the subtraction do not match and the z that
   falls out is flatter than a real team's.

   IT IS NO LONGER A CLEAN REGRESSION SLOPE, and the honest version of that is
   worth writing down. It was fitted once, at 1.30, against a five-slot roster
   and SCALE 2.0. `probe_economy.mjs margin` now refits it on demand, which the
   old comment told you to do without providing the tool. Two things it reports:
   at SCALE 2.0 with six slots the fit had already drifted to 1.15, so the
   constant was over-crediting every season by about 13% and quietly making the
   playoff easier than intended. And under the re-tuned season the relationship
   is not linear any more: damping the opponent flattened the margin at the top,
   so an unbeaten player wins by less than an unbeaten real team does and the
   per-record ratio runs from 0.6 to 2.4 (R2 0.90 against 0.99 before).

   So this is held at the value where the RANK LADDER comes out right, which is
   the thing it exists to serve, rather than at the raw slope of a fit that no
   longer describes a line. Check it against `probe_economy.mjs record`: 12-0
   should rank about 1st, 11-1 about 4th, 10-2 about 10th, 9-3 outside the field.
   Re-check after any move to SCALE, the cap, DEFENSE_WEIGHT or the consistency
   pair, because all of them change what a margin looks like. */
const MARGIN_GAIN = 1.30;

function rankSeason(wins, losses, marginPerGame, oppZs, prepared) {
  const mu = prepared && prepared.pointDiffMean != null ? prepared.pointDiffMean : 0;
  const sd = prepared && prepared.pointDiffSd ? prepared.pointDiffSd : 1;
  const z = (marginPerGame - mu) / sd * MARGIN_GAIN;
  const sos = oppZs && oppZs.length ? oppZs.reduce((a, b) => a + b, 0) / oppZs.length : 0;
  const resume = resumeScore(wins, losses, z, sos);
  return { z, sos, resume, rank: nationalRank(resume, prepared) };
}

/* THE RATING, owned here rather than by the page, because playRun needs it: the
   championship game is decided partly on it. It is resolveGame's own line with
   the per-opponent term removed, so it is what a roster is worth against an
   average defense. */
function teamRating(roster, chemistryMultiplier) {
  const fppg = roster.reduce((t, p) => t + p.ppr_ppg_mean, 0);
  return fppg * chemistryMultiplier * rosterStructure(roster).multiplier;
}
/* THE OVERALL IS THE RATING. There is no divisor and no maximum.
   It used to be divided by a constant measured from the best roster the wheel
   could ever hand somebody, which did two things wrong at once. It put a cap on
   a number that has no reason to have one, and the results screen had to explain
   the cap to make its own arithmetic add up, which meant printing the best draft
   in the game on the screen of somebody still trying to find it. Points a game
   needs no explaining and gives nothing away: a good roster is in the nineties,
   an exceptional one clears a hundred, and there is no number it cannot pass. */
function teamOverall(roster, chemistryMultiplier) {
  return teamRating(roster, chemistryMultiplier);
}

/* THE LAST GAME IS AGAINST THE BEST TEAM IN THE COUNTRY, and how far above you
   they are depends on how good you are. This returns the factor the championship
   opponent's score is multiplied by, so a roster short of championship calibre
   meets a team it cannot live with, and a roster at the top of the scale meets
   one it can.

   IT IS A RULE, not something that fell out of the simulation, and it is worth
   being straight about why. A title takes three or four wins, and the whole span
   from an 88 team to a 100 team is 11% of scoring. Eleven percent moves a single
   game from about a third to about two thirds, which compounds to 4% and 27%
   over three games, not to nothing and to plenty. Every attempt to get the low
   end to zero by hardening the bracket took the high end with it: a final that
   holds an 88 to 0.5% holds a 92 to the same, because they are nearly the same
   team. Taking the noise out of the game instead made the result depend on which
   opponent the bracket happened to draw, which broke the ordering the rating was
   just fixed to have.

   So the difference is put in on purpose, smoothly, and it is monotone in the
   rating by construction: every point of overall makes the last game easier, all
   the way up. Below TITLE_FLOOR the factor is large enough that no scoreline the
   engine can roll gets there. */
function roundEdge(overall, roundName, constants = CONSTANTS) {
  const pivot = (constants.ROUND_EDGE_PIVOT || {})[roundName];
  if (pivot == null) return 1;
  let raw = 1 + (pivot - overall) * constants.ROUND_EDGE_SLOPE;
  /* THE CLIFF IS ON THE LAST GAME ONLY. Below the floor the gap there opens much
     faster, so that "cannot win it" is what the scoreboard actually says rather
     than something rounded to zero in a table. It is still a slope and not a
     switch, so the ordering holds through it: an 87 is behind by less than an
     84, both by more than they can cover. The earlier rounds have no cliff,
     because a team is meant to be able to reach them and lose. */
  if (roundName === 'CFP Championship') {
    const under = constants.TITLE_FLOOR - overall;
    if (under > 0) raw += under * constants.TITLE_EDGE_CLIFF;
  }
  return Math.min(constants.ROUND_EDGE_MAX, Math.max(constants.ROUND_EDGE_MIN, raw));
}
/* Kept as a name because the final is the one with a floor under it. */
function titleEdge(overall, constants = CONSTANTS) {
  return roundEdge(overall, 'CFP Championship', constants);
}

/* Ranking to postseason. The top twelve play for the title, the top four of those
   get the week off. Everyone else who won at least six games goes bowling, and
   which bowl is set by where they finished in the country: the best of the teams
   left out get a New Year's Six, the next tier the marquee bowls, the rest one of
   the many. Under six wins there is no bowl. */
function seedFromRanking(rank, wins) {
  if (rank <= CONSTANTS.PLAYOFF_TEAMS) {
    const bye = rank <= CONSTANTS.PLAYOFF_BYES;
    return { made: true, seed: rank, rank, bye,
      rounds: bye ? CONSTANTS.PLAYOFF_ROUNDS_WITH_BYE : CONSTANTS.PLAYOFF_ROUNDS_NO_BYE,
      label: bye ? 'No. ' + rank + ' seed, first-round bye' : 'No. ' + rank + ' seed' };
  }
  const out = { made: false, seed: null, rank, bye: false };
  if (wins < CONSTANTS.BOWL_MIN_WINS) {
    return { ...out, bowl: null, rounds: 0, label: 'Season over' };
  }
  if (rank <= CONSTANTS.BOWL_NY6_RANK) {
    return { ...out, bowl: 'ny6', rounds: 1, label: 'New Year\'s Six Bowl' };
  }
  if (rank <= CONSTANTS.BOWL_MAJOR_RANK) {
    return { ...out, bowl: 'major', rounds: 1, label: 'Bowl Game' };
  }
  return { ...out, bowl: 'minor', rounds: 1, label: 'Bowl Game' };
}

/* Seeding is worth something. The top seeds host the first round and are the
   higher seed after it, so their path is easier; by the semifinal it is a
   neutral field and the bracket stops helping anybody. */
function seedAdvantage(seed, roundName, constants = CONSTANTS) {
  const H = constants.PLAYOFF_HOME_FIELD || 0;
  if (!seed) return 1;
  const edge = 1 - (seed - 1) / Math.max(1, constants.PLAYOFF_TEAMS - 1);
  const factor = roundName === 'CFP First Round' ? 1
    : roundName === 'CFP Quarterfinal' ? 0.5 : 0;
  return 1 + H * edge * factor;
}

// ─── the bowl system ────────────────────────────────────────────────────────

/* THE BOWLS, in three tiers the ranking sorts you into. The names are FICTIONAL,
   each one inspired by a real bowl but not the real thing: the geography and the
   flavour are kept, the trademarked names, sponsors and branded stadiums are
   invented around. Which tier you land in is set in seedFromRanking by your
   national rank; the name inside the tier is a seeded pick, so the same run
   always draws the same bowl. See BOWLS_HOUSE for the house's own. */
const BOWLS = {
  ny6: [
    { name: 'Garland Bowl', tagline: 'The granddaddy of them all, under the San Gabriel mountains.' },
    { name: 'Cane Bowl', tagline: 'New Orleans, and about the biggest stage a bowl can offer.' },
    { name: 'Sunshine Bowl', tagline: 'Miami at night, for the best team left out of the twelve.' },
    { name: 'Prairie Bowl', tagline: 'Eighty thousand deep outside Dallas, a big-six crown on the line.' },
    { name: 'Mesa Bowl', tagline: 'The Arizona desert\'s marquee, and a top-tier payout.' },
    { name: 'Orchard Bowl', tagline: 'Atlanta, a near-playoff field one seed short of the bracket.' },
  ],
  major: [
    { name: 'Grove Bowl', tagline: 'Orlando on New Year\'s, the pick of the teams just outside the six.' },
    { name: 'Landing Bowl', tagline: 'Jacksonville, a proud old bowl with a good name to beat.' },
    { name: 'Frontera Bowl', tagline: 'El Paso, one of the oldest bowls there is, played in the shadow of the Franklins.' },
    { name: 'Mission Bowl', tagline: 'San Antonio, routinely the best matchup of the non-playoff slate.' },
    { name: 'Melody Bowl', tagline: 'Nashville, and a downtown that does not sleep.' },
    { name: 'Neon Bowl', tagline: 'The Las Vegas Strip, the brightest lights in bowl season.' },
    { name: 'Yuletide Bowl', tagline: 'San Diego, palm trees and a December kickoff.' },
    { name: 'Bayshore Bowl', tagline: 'Tampa on New Year\'s Day, a bowl older than most in the room.' },
    { name: 'Sunrise Bowl', tagline: 'Orlando, a mascot you could eat, the most fun thirty seconds on the schedule.' },
    { name: 'Queen City Bowl', tagline: 'Charlotte, and a jar of something poured on the winning coach.' },
    { name: 'Lone Star Bowl', tagline: 'Houston, under the roof, a Southern tradition.' },
    { name: 'Ballpark Bowl', tagline: 'A ballpark in the Bronx, football played in the cold.' },
    { name: 'Crumb Bowl', tagline: 'Orlando, orange crumbs everywhere, and nobody minds a bit.' },
  ],
  minor: [
    { name: 'Buccaneer Bowl', tagline: 'Tampa, named for a pirate festival, and it plays like one.' },
    { name: 'Magic City Bowl', tagline: 'Birmingham, the heart of it all in Alabama.' },
    { name: 'Garrison Bowl', tagline: 'Fort Worth, a salute to the services at midfield.' },
    { name: 'Frontier Bowl', tagline: 'North Texas, a small stadium and a big December night.' },
    { name: 'Hope Bowl', tagline: 'Orlando, playing for cancer research and a trophy.' },
    { name: 'Magnolia Bowl', tagline: 'Montgomery, Alabama, a bowl with a flower and a following.' },
    { name: 'Rio Grande Bowl', tagline: 'Albuquerque, a mile up, where the ball flies a little farther.' },
    { name: 'Coral Bowl', tagline: 'South Florida in December, which is its own reward.' },
    { name: 'Pacific Bowl', tagline: 'Los Angeles, the fanciest building any six-win team will ever see.' },
    { name: 'Boardwalk Bowl', tagline: 'Conway, South Carolina, the boardwalk a short drive away.' },
    { name: 'Sentinel Bowl', tagline: 'Dallas, honoring the ones who run toward it.' },
    { name: 'Spud Bowl', tagline: 'Boise, on the blue turf, with a potato for a mascot.' },
    { name: 'Bayside Bowl', tagline: 'Mobile, Alabama, a bay-side send-off to the season.' },
    { name: 'Diamond Head Bowl', tagline: 'Honolulu, the last flight of the year and the best one.' },
    { name: 'Republic Bowl', tagline: 'Shreveport, one of the oldest names on the board.' },
    { name: 'Commonwealth Bowl', tagline: 'Football at an old ballpark in Boston, a big green wall in the background.' },
    { name: 'Paradise Bowl', tagline: 'Nassau, palm trees past the end zone, a passport for a bowl trip.' },
    { name: 'Salute Bowl', tagline: 'Annapolis, the Navy\'s backyard, a tribute at the coin toss.' },
  ],
};

const BOWLS_HOUSE = {
  name: 'RunThe.GG Bowl',
  tagline: 'The house bowl. No sponsor, no tie-in, just a trophy with our name on it and a team good enough to take it.',
};

/* Which bowl, given the tier the ranking chose. A small share of every bowl is
   the house's own RunThe.GG Bowl, a rare draw at any tier; the rest is a seeded
   pick from that tier's fictional bowls. The roster and chemistry are kept in the
   signature so callers do not have to change, though the pick no longer reads
   them: a bowl is where your season ranked, not what your offense looked like. */
function selectBowl(roster, chemResult, rng, tier = 'major') {
  const list = BOWLS[tier] || BOWLS.major;
  if (rng() < (CONSTANTS.RUNTHE_BOWL_CHANCE || 0)) {
    return { key: 'runthegg', name: BOWLS_HOUSE.name, tagline: BOWLS_HOUSE.tagline, tier, house: true };
  }
  const b = list[Math.floor(rng() * list.length)];
  return { key: bowlKey(b.name), name: b.name, tagline: b.tagline, tier };
}

/* The slug a bowl is stored under. One definition, because the leaderboard reads
   back what selectBowl() wrote and the two agreeing is the whole mechanism. */
function bowlKey(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

/* The name for a stored slug, or null.
 *
 * THE LOOKUP IS THE SECURITY BOUNDARY. cfb_runs stores the slug and never the
 * name, so a row can only ever be rendered as a bowl this table already knows
 * about. A slug from a crafted client resolves to null and the caller falls back
 * to the tier wording: the worst it achieves is a row that says less than it
 * could have, rather than text of somebody's choosing on a public board.
 *
 * Built once, lazily, rather than on every leaderboard row: a hundred-row board
 * would otherwise walk all thirty-odd bowls a hundred times to render a line of
 * text. */
let BOWL_BY_KEY = null;
function bowlName(key) {
  if (!key) return null;
  if (!BOWL_BY_KEY) {
    BOWL_BY_KEY = { runthegg: BOWLS_HOUSE.name };
    for (const tier of Object.keys(BOWLS)) {
      for (const b of BOWLS[tier]) BOWL_BY_KEY[bowlKey(b.name)] = b.name;
    }
  }
  return BOWL_BY_KEY[key] || null;
}

// ─── chemistry ──────────────────────────────────────────────────────────────

/* HALVED. Chemistry was worth +4.9% to a median roster and +11.5% at the top,
   which made "six men who happened to share a state" a bigger lever than most of
   what a player actually decides. It is a garnish on a roster, not the roster.
   Every link is worth half what it was and the asymptote came down with them, so
   a median team now gets about +2.5% and the very best about +6%. */
/* THE LADDER HAS TO BE A LADDER. These were nearly flat: a shared conference, a
   shared home state and a shared coach were all worth exactly the same 0.01,
   which said that having played in the same league is the same bond as having
   played for the same man. It also made 93% of every roster's links identical,
   so the chemistry rail drew every arc in one color and the tiers below could
   not tell them apart. They are spread now, in the order the bonds actually
   rank: same league at the bottom, then the same state, the same coach, the same
   school, then blood, then genuine teammates, then a quarterback and the man he
   threw to. The frequency-weighted average is held near where it was (about
   +3%), so this is a re-shaping and not a buff: see the chemistry numbers in the
   commit that made it. */
const CHEMISTRY = {
  VALUES: {
    battery: 0.05,
    teammates: 0.032,
    family: 0.026,
    program: 0.022,
    coach: 0.018,
    home_state: 0.014,
    /* Seven links in ten are this one, so it sets the average on its own: it is
       trimmed to hold total chemistry exactly where it was before the ladder
       spread, which is what makes this a re-shaping rather than a buff. */
    conference: 0.008,
  },
  MIN: -0.06,
  MAX: 0.08,
};

// ─── color utilities ────────────────────────────────────────────────────────

function relativeLuminance(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const f = (c) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(hex1, hex2) {
  const l1 = relativeLuminance(hex1);
  const l2 = relativeLuminance(hex2);
  const lighter = Math.max(l1, l2), darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function hexToHsl(hex) {
  let r = parseInt(hex.slice(1, 3), 16) / 255;
  let g = parseInt(hex.slice(3, 5), 16) / 255;
  let b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return [h * 360, s * 100, l * 100];
}

function hslToHex(h, s, l) {
  h /= 360; s /= 100; l /= 100;
  let r, g, b;
  if (s === 0) { r = g = b = l; }
  else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1; if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  const toHex = (c) => Math.round(c * 255).toString(16).padStart(2, '0');
  return '#' + toHex(r) + toHex(g) + toHex(b);
}

function washColor(hex, targetL, satCap = 40) {
  const [h, s, l] = hexToHsl(hex);
  return hslToHex(h, Math.min(s, satCap), targetL);
}

/* THE OPPONENT'S REAL COLOR, dark enough for the white scoreboard text but not
   washed to mud. It used to be pinned at lightness 15 with saturation capped at
   40, which turned a crimson like Georgia's #ba0c2f into a maroon; your own side
   sits near lightness 27 at full saturation, so the two never matched. The panel
   fill now lands at 30 with the cap at 64, which reads as the team's true hue and
   still carries white text, and a genuine gray or black (no hue to boost) stays
   gray rather than being invented into a dull red. */
function washColors(color, altColor) {
  const primary = color || '#333333';
  const bg = washColor(primary, 30, 64);
  /* The accent is the alternate color, but only if it actually has a hue: a lot
     of teams pair a bright primary with black or white, and a black alt washed
     out to a gray stripe next to a red panel. When the alt is achromatic, lift
     the primary instead so the stripe is a lighter shade of the team's own red or
     blue rather than a gray seam. */
  const altHasHue = altColor && chromaOf(altColor) >= CHROMA_FLOOR;
  const accent = washColor(altHasHue ? altColor : primary, altHasHue ? 46 : 52, 64);
  return { bg, accent };
}

// HOW FAR FROM GRAY A COLOR HAS TO BE BEFORE IT HAS A HUE AT ALL, as a 0..255
// spread between its brightest and darkest channel. White, black, silver and
// charcoal are all below this, and for all of them hexToHsl reports hue 0, which is
// not a fact about the color: it is what the formula returns when there is no hue
// to report.
const CHROMA_FLOOR = 20;
function chromaOf(hex) {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16),
        b = parseInt(hex.slice(5, 7), 16);
  return Math.max(r, g, b) - Math.min(r, g, b);
}

// The wheel wants the team's real colors, not paint-on-grass. Boost dull colors up
// to a saturation floor (already-vivid ones keep their own), and set a lightness
// that stays dark enough for the white landed text while reading as the true hue.
//
// A GRAY IS NOT A DULL RED. This used to force the saturation floor onto every
// input, and hexToHsl reports hue 0 for anything achromatic, so #ffffff came back
// as #dd3c3c and #000000 as #671e1e. Kentucky is blue and white and was drawn with
// a red border; Iowa is black and gold and was drawn on dark red. About half the
// schools in the game have a white, black or silver in their pair, so about half
// were wrong. Below the chroma floor the color keeps its neutrality and only its
// lightness is set.
function wheelColor(hex, minS, targetL, neutralL) {
  if (chromaOf(hex) < CHROMA_FLOOR) return hslToHex(0, 0, neutralL === undefined ? targetL : neutralL);
  const [h, s] = hexToHsl(hex);
  return hslToHex(h, Math.min(100, Math.max(s, minS)), targetL);
}

function wheelColors(color, altColor) {
  const primary = color || '#334155';
  const secondary = altColor || color || '#94a3b8';
  // A neutral primary lands near black rather than at mid gray, because a black
  // helmet school should read black: Iowa, Purdue, Oregon State.
  const bg = wheelColor(primary, 55, 26, 13);
  // A DARK NEUTRAL TRIM CANNOT BE DRAWN AS ITSELF. The accent is the box's border,
  // and Georgia's black on Georgia's red is a border nobody can see. A light neutral
  // would be a lie in the other direction, so a dark achromatic secondary falls back
  // to the school's OWN color lifted off the background: still the school's palette,
  // and actually visible. A light neutral is kept as one, which is the white trim on
  // Kentucky, Alabama and Penn State and the whole point of this.
  let accent;
  if (chromaOf(secondary) < CHROMA_FLOOR) {
    const [, , l] = hexToHsl(secondary);
    accent = l >= 50 ? wheelColor(secondary, 70, 55, 86)
                     : wheelColor(primary, 55, 58, 62);
  } else {
    accent = wheelColor(secondary, 70, 55);
  }
  return { bg, accent };
}

function teamColors(team) {
  return {
    color: team.color || '#333333',
    alt_color: team.alt_color || '#ffffff',
    abbreviation: team.abbreviation || team.school.slice(0, 4).toUpperCase(),
  };
}

function teamButton(team) {
  const c = teamColors(team);
  const bg = c.color;
  const onWhite = contrast(bg, '#ffffff');
  const onBlack = contrast(bg, '#000000');
  const ink = onWhite >= onBlack ? '#ffffff' : '#000000';
  return { bg, ink };
}

function teamInk(team) {
  const c = teamColors(team);
  const onWhite = contrast(c.color, '#ffffff');
  return onWhite >= 4.5 ? c.color : c.alt_color;
}

// ─── link tiers ─────────────────────────────────────────────────────────────

/* WHAT EACH TIER MEANS ON SCREEN, and the thresholds sit between the real link
   values rather than above them. The old floors wanted 0.08 for a strong link
   when the best link in the game is worth 0.05, so STRONG COULD NEVER BE EARNED
   and every arc on the chemistry rail drew in the weak color. Now:
     strong, gold  they actually played together, or are family, or are a
                   quarterback and his receiver
     good,   green they shared a school, a coach or a home state
     weak,   blue  they shared a conference, the loosest bond there is */
const LINK_TIERS = [
  { min: 0.025, label: 'strong' },
  { min: 0.012, label: 'good' },
  { min: 0.005, label: 'weak' },
];

function linkTier(value) {
  for (const t of LINK_TIERS) if (value >= t.min) return t.label;
  return 'none';
}

// ─── roster structure ───────────────────────────────────────────────────────

const STRUCTURE = {
  QB_BASELINE_PASS_PPG: 12.1,
  QB_SUPPORT_FLOOR: 0.62,
  QB_SUPPORT_CEIL: 1.18,
  IDEAL_RUSH_SHARE: 0.34,
  RUSH_SHARE_TOLERANCE: 0.12,
  BALANCE_WEIGHT: 1.05,
  IDEAL_TOP_SHARE: 0.24,
  CONCENTRATION_WEIGHT: 0.70,
  IDEAL_FLOOR_SHARE: 0.64,
  FLOOR_TOLERANCE: 0.14,
  FLOOR_WEIGHT: 1.30,
  SHAPE_STRENGTH: 0.5,
  MIN: 0.50,
  MAX: 1.18,
};

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const over = (v, min, span) => clamp(((v || 0) - min) / span, 0, 1);
const fitAvg = (...xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

/* WHO IS TAKING THE SNAPS. A roster's quarterback is normally the man listed at
   the position, but the quarterback slot can also be filled by somebody who
   played both, so a roster can have a quarterback without anyone whose PRIMARY
   position is one. Falling back to the best passer among the men who played the
   position keeps that roster from reading as having nobody under center. */
function findQB(roster) {
  return roster.find(p => p.position === 'QB')
    || roster.filter(p => p.alt_position === 'QB')
      .sort((a, b) => (b.pass_ppg || 0) - (a.pass_ppg || 0))[0];
}

const SCHEMES = [
  {
    key: 'spread',
    name: 'Spread Offense',
    detect(roster) {
      const qb = findQB(roster);
      if (!qb || (qb.pass_ppg || 0) < 13 || (qb.rush_ppg || 0) < 3) return -1;
      const wrs = roster.filter(p => p.position === 'WR' && (p.rec_ppg || 0) >= 6);
      if (wrs.length < 2) return -1;
      return fitAvg(over(qb.pass_ppg, 13, 7), over(qb.rush_ppg, 3, 5),
        over(wrs[0].rec_ppg, 6, 7), over(wrs[1].rec_ppg, 6, 7));
    },
    strength: 'Spread Offense. A mobile QB and receivers who stretch the field.',
  },
  {
    key: 'air_raid',
    name: 'Air Raid',
    detect(roster) {
      /* THE NO-TIGHT-END IDENTITY. With the TE slot gone, skipping the tight
         end for a third receiver is a real choice, and this is its reward: a
         big-arm quarterback and a deep receiver room, no in-line tight end,
         everything spread wide. A roster that signed a TE is not an Air Raid;
         it falls through to Pro Style or Power Run below. */
      if (roster.some(p => p.position === 'TE')) return -1;
      const qb = findQB(roster);
      if (!qb || (qb.pass_ppg || 0) < 16) return -1;
      const wrs = roster.filter(p => p.position === 'WR' && (p.rec_ppg || 0) >= 8)
        .sort((a, b) => (b.rec_ppg || 0) - (a.rec_ppg || 0));
      if (wrs.length < 2) return -1;
      /* A third receiving threat (the flex, usually a WR) deepens the room and
         lifts the fit, so a true three-wide set reads as a fuller Air Raid than
         a two-man one. */
      const third = roster.filter(p => (p.rec_ppg || 0) >= 6 && p !== wrs[0] && p !== wrs[1])
        .sort((a, b) => (b.rec_ppg || 0) - (a.rec_ppg || 0))[0];
      const parts = [over(qb.pass_ppg, 16, 7), over(wrs[0].rec_ppg, 8, 7), over(wrs[1].rec_ppg, 8, 7)];
      if (third) parts.push(over(third.rec_ppg, 6, 7));
      return fitAvg(...parts);
    },
    strength: 'Air Raid. No tight end, all receivers, the pass game carries it.',
  },
  {
    key: 'pro_style',
    name: 'Pro Style',
    detect(roster) {
      const qb = findQB(roster);
      if (!qb || (qb.pass_ppg || 0) < 12) return -1;
      const te = roster.filter(p => p.position === 'TE').sort((a, b) => (b.rec_ppg || 0) - (a.rec_ppg || 0))[0];
      if (!te || (te.rec_ppg || 0) < 5) return -1;
      const rb = roster.filter(p => p.position === 'RB').sort((a, b) => (b.rush_ppg || 0) - (a.rush_ppg || 0))[0];
      if (!rb || (rb.rush_ppg || 0) < 6) return -1;
      return fitAvg(over(qb.pass_ppg, 12, 8), over(te.rec_ppg, 5, 5), over(rb.rush_ppg, 6, 6));
    },
    strength: 'Pro Style. Balanced and disciplined at every position.',
  },
  {
    key: 'power_run',
    name: 'Power Run',
    detect(roster) {
      const rb = roster.filter(p => p.position === 'RB').sort((a, b) => (b.rush_ppg || 0) - (a.rush_ppg || 0))[0];
      if (!rb || (rb.rush_ppg || 0) < 10) return -1;
      const te = roster.filter(p => p.position === 'TE').sort((a, b) => b.ppr_ppg_mean - a.ppr_ppg_mean)[0];
      if (!te || te.ppr_ppg_mean < 5) return -1;
      return fitAvg(over(rb.rush_ppg, 10, 7), over(te.ppr_ppg_mean, 5, 8));
    },
    strength: 'Power Run. The ground game controls the clock.',
  },
  {
    key: 'rpo',
    name: 'RPO',
    detect(roster) {
      const qb = findQB(roster);
      if (!qb || (qb.rush_ppg || 0) < 4 || (qb.pass_ppg || 0) < 10) return -1;
      const rb = roster.filter(p => p.position === 'RB').sort((a, b) => (b.rush_ppg || 0) - (a.rush_ppg || 0))[0];
      if (!rb || (rb.rush_ppg || 0) < 7) return -1;
      return fitAvg(over(qb.rush_ppg, 4, 5), over(qb.pass_ppg, 10, 8), over(rb.rush_ppg, 7, 7));
    },
    strength: 'RPO. The defense never knows if it\'s a run or a pass.',
  },
  {
    key: 'dual_threat',
    name: 'Dual Threat',
    detect(roster) {
      const qb = findQB(roster);
      if (!qb || (qb.rush_ppg || 0) < 4) return -1;
      return over(qb.rush_ppg, 4, 6);
    },
    strength: 'Dual Threat quarterback. Defenses cannot key on one thing.',
  },
];

function detectScheme(roster) {
  for (const s of SCHEMES) {
    const fit = s.detect(roster);
    if (fit >= 0) return { key: s.key, name: s.name, fit: clamp(fit, 0, 1) };
  }
  return null;
}

function rosterStructure(roster) {
  const S = STRUCTURE;
  const sum = (f) => roster.reduce((t, p) => t + (f(p) || 0), 0);
  const total = sum(p => p.ppr_ppg_mean);
  if (!total) {
    return { multiplier: 1, qbSupport: 1, balance: 1, concentration: 1,
      rushShare: 0, topShare: 0, qbPass: 0 };
  }

  const qb = findQB(roster);
  const qbPass = qb ? (qb.pass_ppg || 0) : 0;
  const qbSupport = clamp(
    0.55 + 0.45 * (qbPass / S.QB_BASELINE_PASS_PPG),
    S.QB_SUPPORT_FLOOR, S.QB_SUPPORT_CEIL,
  );

  const rush = sum(p => p.rush_ppg);
  const rec = sum(p => p.rec_ppg);
  const ground = rush + rec;
  const rushShare = ground > 0 ? rush / ground : 0;
  const balance = 1 - S.BALANCE_WEIGHT
    * Math.max(0, Math.abs(rushShare - S.IDEAL_RUSH_SHARE) - S.RUSH_SHARE_TOLERANCE);

  const topShare = Math.max(...roster.map(p => p.ppr_ppg_mean)) / total;
  const concentration = 1 - S.CONCENTRATION_WEIGHT * Math.max(0, topShare - S.IDEAL_TOP_SHARE);

  const ppg = roster.map(p => p.ppr_ppg_mean).sort((x, y) => x - y);
  const avg = total / roster.length;
  const floorShare = roster.length >= 2 && avg > 0 ? ((ppg[0] + ppg[1]) / 2) / avg : 1;
  const floor = 1 - S.FLOOR_WEIGHT
    * Math.max(0, S.IDEAL_FLOOR_SHARE - floorShare - S.FLOOR_TOLERANCE);

  const scheme = detectScheme(roster);

  const effective = sum(p => p.pass_ppg) + rush + rec * qbSupport;
  const SCHEME_MIN_BONUS = 0.01, SCHEME_MAX_BONUS = 0.03;
  const schemeBonus = scheme
    ? SCHEME_MIN_BONUS + (SCHEME_MAX_BONUS - SCHEME_MIN_BONUS) * scheme.fit : 0;

  const shape = (effective / total) * balance * concentration * Math.max(0.3, floor);
  const shapeDamped = 1 + (shape - 1) * S.SHAPE_STRENGTH;
  const multiplier = clamp(shapeDamped + schemeBonus, S.MIN, S.MAX);

  return { multiplier, qbSupport, balance, concentration, floor, floorShare,
    rushShare, topShare, qbPass, total, scheme: scheme ? scheme.key : null,
    schemeBonus, shape, shapeDamped };
}

// ─── coach report ───────────────────────────────────────────────────────────

function coachReport(roster, chemResult) {
  const st = rosterStructure(roster);
  const spend = roster.reduce((s, p) => s + p.price_musd, 0);
  const total = st.total;
  const strengths = [];
  const weaknesses = [];

  if (st.qbPass >= 18) strengths.push('Elite arm. This quarterback can carry a game.');
  else if (st.qbPass < 6) weaknesses.push('No real passer. The receivers are stranded.');

  if (st.scheme) {
    const s = SCHEMES.find(x => x.key === st.scheme);
    if (s) strengths.push(s.strength);
  }

  if (st.balance >= 0.98) strengths.push('Good balance between run and pass.');
  else if (st.balance < 0.90) weaknesses.push('One-dimensional. Defenses will adjust.');

  if (st.concentration >= 0.98) strengths.push('Points spread across the roster.');
  else if (st.concentration < 0.90) weaknesses.push('Too reliant on one player.');

  if (st.floor >= 0.95) strengths.push('No weak links.');
  else if (st.floor < 0.80) weaknesses.push('The bottom of this roster is a liability.');

  const chem = chemResult ? chemResult.net : 0;
  if (chem >= 0.08) strengths.push('These players know each other, and it shows.');
  else if (chem < 0.01) weaknesses.push('No chemistry. Six strangers.');

  const unspent = CONSTANTS.CAP_MUSD - spend;
  if (unspent >= 3) weaknesses.push(`$${unspent.toFixed(1)}M unspent. That was a better player.`);
  else if (unspent <= 0.5) strengths.push('Used the whole NIL budget.');

  const swing = roster.reduce((t, p) => t + p.ppr_ppg_sd, 0) / Math.max(1, total);
  if (swing > 0.22) weaknesses.push('Boom-or-bust. Big upside but inconsistent.');
  else if (swing < 0.12) strengths.push('Consistent week to week.');

  let verdict;
  if (total >= 70 && st.multiplier >= 1.05 && chem >= 0.06) verdict = 'National championship contender.';
  else if (total >= 55 && st.multiplier >= 0.95) verdict = 'Playoff-caliber roster.';
  else if (total >= 40) verdict = 'Bowl-eligible. Maybe more with some luck.';
  else verdict = 'This team needs more talent.';

  return { structure: st, strengths, weaknesses, verdict, totalFppg: total, swing };
}

// ─── slots ──────────────────────────────────────────────────────────────────

/* NO DEDICATED TIGHT END SLOT. Only 73% of team-seasons field a TE at all, and
   the position's ceiling is far below WR and RB (its best season scores 24 to
   their 35), so a forced TE spot made every roster carry the pool's weakest
   position and quietly locked out most of the early-2000s teams that have no TE
   to draft. The tight end now competes for a FLEX spot instead, which turns him
   into a CHOICE: sign one for a balanced, two-way front (the Pro Style and Power
   Run schemes reward a real TE beside a real RB), or skip him for a third
   receiver and let the Air Raid carry you through the air. The TE entry stays in
   the eligibility map so a tight end is still FLEX-eligible. */
const SLOTS = ['QB', 'RB', 'WR', 'WR', 'FLEX', 'FLEX'];
const SLOT_ELIGIBILITY = {
  QB: ['QB'], RB: ['RB'], WR: ['WR'], TE: ['TE'], FLEX: ['RB', 'WR', 'TE'],
};

/* EVERY POSITION A MAN ACTUALLY PLAYED. Most players have one. The ones who
   genuinely lined up at two carry alt_position, set by the production in
   cfb/build/dual-positions.mjs, and they can be signed at either: Dexter
   McCluster at receiver or at back, Kerry Meier at receiver or under center.
   position stays the primary, so anything that wants a single answer (the chip
   color, the scheme detector) keeps reading the same field it always did. */
function positionsOf(player) {
  return player && player.alt_position
    ? [player.position, player.alt_position]
    : [player ? player.position : null];
}
/** Can this player fill this slot, at any of the positions he played? */
function canFillSlot(player, slot) {
  const allow = SLOT_ELIGIBILITY[slot];
  if (!allow) return false;
  return positionsOf(player).some((pos) => allow.includes(pos));
}

// ─── randomness ─────────────────────────────────────────────────────────────

function hashSeed(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = Math.imul(31, h) + str.charCodeAt(i) | 0;
  return Math.abs(h);
}

function createSeededRNG(seed) {
  let s = seed >>> 0;
  return function () {
    s += 0x6D2B79F5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normal(rng) {
  let u = 0;
  while (u === 0) u = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}

function gammaShape(k, rng) {
  if (k < 1) return gammaShape(1 + k, rng) * Math.pow(rng(), 1 / k);
  const d = k - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x, v;
    do { x = normal(rng); v = 1 + c * x; } while (v <= 0);
    v = v * v * v;
    const u = rng();
    if (u < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

function sampleGamma(mean, sd, rng) {
  if (!(mean > 0)) return 0;
  if (!(sd > 0)) return mean;
  const shape = (mean / sd) ** 2;
  const scale = (sd * sd) / mean;
  return gammaShape(shape, rng) * scale;
}

// ─── chemistry resolution ───────────────────────────────────────────────────

const pkey = (p) => `${p.player_id}|${p.season}`;

function pairLinks(a, b, ctx) {
  const out = [];
  const V = CHEMISTRY.VALUES;

  const bat = ctx.battery || {};
  for (const [qb, rec] of [[a, b], [b, a]]) {
    const list = bat[pkey(qb)];
    if (list) {
      const hit = list.find(l => l.receiver === pkey(rec));
      if (hit) out.push({ type: 'battery', value: V.battery, label: hit.label, short: 'Threw to him' });
    }
  }

  if (a.team_season_id && a.team_season_id === b.team_season_id) {
    out.push({
      type: 'teammates', value: V.teammates,
      label: `Teammates on the ${a.season} ${a.school}`,
      short: 'Teammates',
    });
  } else if (a.school && a.school === b.school) {
    out.push({
      type: 'program', value: V.program,
      label: `Both played at ${a.school}`,
      short: `Both ${a.school}`,
    });
  }

  const fam = (ctx.curated?.family || []).find(
    f => (f.a === a.name && f.b === b.name) || (f.a === b.name && f.b === a.name),
  );
  if (fam) {
    out.push({
      type: 'family', value: V.family,
      label: fam.kind === 'brothers' ? 'Brothers' : fam.label,
      short: 'Family',
    });
  }

  if (a.home_state && b.home_state && a.home_state === b.home_state) {
    out.push({
      type: 'home_state', value: V.home_state,
      label: `Both from ${a.home_state}`,
      short: `Both ${a.home_state}`,
    });
  }

  if (a.conference && b.conference && a.conference === b.conference) {
    out.push({
      type: 'conference', value: V.conference,
      label: `Both in the ${a.conference}`,
      short: a.conference,
    });
  }

  const coaches = ctx.coaches || {};
  const ca = coaches[a.team_season_id]?.hc;
  const cb = coaches[b.team_season_id]?.hc;
  if (ca && cb && ca === cb) {
    out.push({
      type: 'coach', value: V.coach,
      label: `Both coached by ${ca}`,
      short: ca.split(' ').slice(-1)[0] + ' coached both',
    });
  }

  out.sort((x, y) => y.value - x.value);
  return out;
}

function resolveChemistry(roster, ctx) {
  const links = [];
  for (let i = 0; i < roster.length; i++) {
    for (let j = i + 1; j < roster.length; j++) {
      const best = pairLinks(roster[i], roster[j], ctx)[0];
      if (best) links.push({ ...best, a: roster[i].name, b: roster[j].name });
    }
  }
  const positives = links.filter(l => l.value > 0).sort((a, b) => b.value - a.value);
  const negatives = links.filter(l => l.value < 0);

  const raw = positives.reduce((s, l) => s + l.value, 0);
  const saturated = CHEMISTRY.MAX * (1 - Math.exp(-raw / CHEMISTRY.MAX));
  const penalties = negatives.reduce((s, l) => s + l.value, 0);
  const net = Math.max(CHEMISTRY.MIN, Math.min(CHEMISTRY.MAX, saturated + penalties));

  return {
    multiplier: 1 + net,
    raw,
    saturated,
    net,
    links: positives.concat(negatives),
  };
}

// ─── schedule ───────────────────────────────────────────────────────────────

function orderSchedule(games, rng) {
  const sorted = [...games].sort((a, b) => a.strength_z - b.strength_z);
  const ordered = new Array(games.length);
  const mid = Math.floor(games.length / 2);
  let lo = 0, hi = games.length - 1;
  for (let i = 0; i < games.length; i++) {
    if (i % 2 === 0) ordered[mid + Math.floor(i / 2)] = sorted[hi--];
    else ordered[mid - Math.ceil(i / 2)] = sorted[lo++];
  }
  for (let i = ordered.length - 1; i > 0; i--) {
    const window = Math.min(3, i);
    const j = i - Math.floor(rng() * window);
    [ordered[i], ordered[j]] = [ordered[j], ordered[i]];
  }
  return ordered;
}

/* THE MARQUEE GAMES ARE WHY AN UNBEATEN SEASON IS RARE. Three of the twelve are
   drawn from the eleven-win pool: the rivalry games and the conference gauntlet a
   real perfect season has to survive. They REPLACE ordinary opponents rather than
   lengthening the season, so a team still plays twelve.

   This is aimed at one thing the playoff cannot reach. Going unbeaten and winning
   the title are the same run of games, so making the bracket harder makes both
   rarer together: measured, a championship opponent severe enough to stop an 87
   going perfect also drops a 92's title odds from 17% to 5%, which is the wall
   this game already had once. A hard game in September is different. It costs a
   merely good team its unbeaten record without costing it the title, because a
   team that loses in week three can still win everything from the 6 seed.

   Measured over 40 teams a band, 400 seasons each, this cut perfect seasons by
   62% at 85-90 and 55% at 95-100 while leaving 100+ within 4% of where it was,
   and left every band's title odds roughly alone.

   The nine ordinary games are still balanced to an average schedule, against a
   target scaled to nine, so the three hard ones are a deliberate addition and not
   an accident of a loose tolerance. */
function generateSchedule(data, rng, opts = {}) {
  const tolerance = opts.tolerance ?? 0.05;
  const maxElite = opts.maxElite ?? 3;
  const maxAttempts = opts.maxAttempts ?? 400;
  const count = opts.games ?? CONSTANTS.REGULAR_SEASON_GAMES;
  const marquee = Math.min(opts.marquee ?? CONSTANTS.MARQUEE_GAMES ?? 0, count);

  const { byProgram, eliteThreshold, meanScheduleStrength } = data;
  const programs = Object.keys(byProgram);
  const hard = (data.greatPool && data.greatPool.length) ? data.greatPool : null;
  const ordinary = count - (hard ? marquee : 0);
  const target = meanScheduleStrength * ordinary / count;

  let best = null;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const used = new Set();
    const unordered = [];
    let guard = 0;
    while (unordered.length < ordinary && guard++ < 500) {
      const p = programs[Math.floor(rng() * programs.length)];
      if (used.has(p)) continue;
      used.add(p);
      const pool = byProgram[p];
      unordered.push(pool[Math.floor(rng() * pool.length)]);
    }
    if (unordered.length < ordinary) continue;
    /* Balance is judged on the ordinary games only. The marquee ones are meant to
       be above average, so folding them in would just push the check to reject
       every schedule and fall through to the relaxed branch every time. */
    const ordTotal = unordered.reduce((sum, g) => sum + g.strength_z, 0);
    if (hard) {
      let hguard = 0;
      while (unordered.length < count && hguard++ < 500) {
        const g = hard[Math.floor(rng() * hard.length)];
        if (used.has(g.school)) continue;
        used.add(g.school);
        unordered.push(g);
      }
      /* If the pool could not supply enough distinct programmes, fill the rest
         the ordinary way rather than returning a short season. */
      while (unordered.length < count && guard++ < 900) {
        const p = programs[Math.floor(rng() * programs.length)];
        if (used.has(p)) continue;
        used.add(p);
        const pool = byProgram[p];
        unordered.push(pool[Math.floor(rng() * pool.length)]);
      }
      if (unordered.length < count) continue;
    }
    const ordered = orderSchedule(unordered, rng);
    const total = ordered.reduce((sum, g) => sum + g.strength_z, 0);
    const elite = ordered.filter(g => g.strength_z >= eliteThreshold).length;
    /* Both tests are on the ordinary games. Judging the whole twelve would fail
       every schedule, because the marquee three are above average and several of
       them are elite by construction, and the loop would spend four hundred
       attempts before falling through to the least bad one it saw. */
    const ordElite = unordered.slice(0, ordinary).filter(g => g.strength_z >= eliteThreshold).length;
    const drift = Math.abs(ordTotal - target);
    const ok = drift <= Math.abs(target * tolerance) + tolerance * ordinary
      && ordElite <= maxElite;
    if (ok) return { games: ordered, total, elite, attempts: attempt + 1 };
    if (!best || drift < best.drift) best = { games: ordered, total, elite, drift, attempts: attempt + 1 };
  }
  return { games: best.games, total: best.total, elite: best.elite,
    attempts: maxAttempts, relaxed: true };
}

// ─── playoff & bowl opponents ───────────────────────────────────────────────

function pickFrom(pool, rng) {
  return pool[Math.floor(rng() * pool.length)];
}

/* The four opponents a bracket can put in front of you, weakest first: a nine or
   ten win team in the first round, then a conference winner, then two of the
   best seasons in the game. A top-four seed never meets the first of them. */
function generatePlayoffs(data, rng, opts = {}) {
  const { goodPool, greatPool, elitePool } = data;
  const elite = elitePool.length ? elitePool : greatPool;
  /* THE BRACKET RAMPS, IT DOES NOT WALL OFF. It used to draw the semifinal and
     the final from the same elite pool, which meant a team that went undefeated
     and earned the bye still had to beat two all-time seasons back to back and
     won the title 2% of the time. A semifinal opponent is an eleven-win team,
     not a thirteen-win one; only the last team standing is drawn from the very
     best seasons in the data. */
  const great = greatPool.length ? greatPool : goodPool;
  const ladder = [
    pickFrom(goodPool.length ? goodPool : greatPool, rng),
    pickFrom(great, rng),
    pickFrom(great, rng),
    pickFrom(elite, rng),
  ];
  const count = opts.count;
  return count ? ladder.slice(ladder.length - Math.min(count, ladder.length)) : ladder;
}

/* Read the ladder from the back, so a team playing three rounds starts at the
   quarterfinal and a team playing four starts at the first round. */
function playoffOpponent(playoffs, rounds, roundIdx) {
  if (!playoffs || !playoffs.length) return null;
  const start = Math.max(0, playoffs.length - (rounds || playoffs.length));
  return playoffs[Math.min(start + roundIdx, playoffs.length - 1)];
}

function generateBowlOpponent(data, rng, tier) {
  if (tier === 'ny6') return pickFrom(data.greatPool.length ? data.greatPool : data.goodPool, rng);
  if (tier === 'major') return pickFrom(data.goodPool.length ? data.goodPool : data.bowlPool, rng);
  return pickFrom(data.bowlPool.length ? data.bowlPool : data.goodPool, rng);
}

// ─── game resolution ────────────────────────────────────────────────────────

function resolveGame(roster, chemistryMultiplier, opponent, leagueAvgAllowed, rng, constants = CONSTANTS, advantage = 1) {
  let raw = 0;
  for (const p of roster) raw += sampleGamma(p.ppr_ppg_mean, p.ppr_ppg_sd, rng);

  const C = constants.CONSISTENCY || 0;
  if (C > 0) {
    const expected = roster.reduce((s, p) => s + p.ppr_ppg_mean, 0);
    raw = raw * (1 - C) + expected * C;
  }

  const structure = rosterStructure(roster).multiplier;
  /* THE DEFENSE DAMPS YOUR OFFENSE, IT DOES NOT SCALE IT. The raw ratio treats a
     defense as if it multiplied your whole output: the best defenses in the data
     allow 17 points against a league average of 27, so a straight ratio cut your
     scoring by 37% before a snap was played. That is more than any real defense
     does, and it is why the last two playoff rounds used to be 25-point losses
     rather than games. DEFENSE_WEIGHT pulls the ratio toward 1, keeping the sign
     and the ordering while making the elasticity believable. */
  const defenseModifier = 1 +
    (opponent.pts_allowed_mean / leagueAvgAllowed - 1) * (constants.DEFENSE_WEIGHT ?? 1);
  const yourScore = raw * chemistryMultiplier * structure * defenseModifier;

  /* HOW FAR APART THE TEAMS YOU PLAY ARE, which is what decides whether your
     draft shows up in your record.

     Real scoring offences span 18 to 43 points a game, which is 41 to 99 engine
     points once SCALE is applied: a field 58 points wide. A roster range of 75 to
     100 overall spans 25. So moving your team twenty-five points, which is most
     of what a draft can do, crossed under half the field, and after in-game noise
     that came to about two wins. Meanwhile one roster's win count wanders 1.05
     season to season. The signal was the size of the noise, so a 78-overall
     roster and a 95 produced the same record and the draft stopped showing.

     This pulls every opponent toward the league average for its season, tightening
     the field so a point of overall is worth more of a game. It compresses the
     MEAN only: how much a team varies week to week is OPP_CONSISTENCY's job, and
     how good it was is still what strength_z says, so beating a ranked team is
     still worth what it was on the ranking even though the scoreboard is closer. */
  const spread = constants.OPP_SPREAD ?? 1;
  const oppMean = leagueAvgAllowed
    + (opponent.pts_scored_mean - leagueAvgAllowed) * spread;
  let oppRaw = sampleGamma(oppMean, opponent.pts_scored_sd, rng);
  const OC = constants.OPP_CONSISTENCY || 0;
  if (OC > 0) oppRaw = oppRaw * (1 - OC) + oppMean * OC;
  const oppScore = oppRaw * constants.SCALE / advantage;

  let won;
  if (yourScore > oppScore) won = true;
  else if (yourScore < oppScore) won = false;
  else won = rng() < 0.5;

  return { won, yourScore, oppScore, defenseModifier };
}

/* ─── the Challenge Bowl ──────────────────────────────────────────────────────
 * Two DRAFTED rosters against each other, which resolveGame cannot do: its
 * opponent is a real team season with a defense, and here both sides live in
 * fantasy space. Same shape as the NFL game's resolver.
 *
 * A single game is naturally a coin flip, which would reward luck over
 * roster-building, so the Bowl damps variance harder than a regular game via a
 * stronger consistency blend: the better-built roster wins the large majority
 * of the time, with upsets still possible for drama.
 *
 * Scoring is in a FIXED order (a then b) so the result is identical for
 * everyone who recomputes it from the same seed: the challenger, the friend,
 * and anyone they show it to. Callers always pass a = challenger, b = friend;
 * the UI decides which side is labeled "you". */
const BOWL_CONSISTENCY = 0.62;

function teamOffense(roster, chemistryMultiplier, rng, consistency) {
  let raw = 0;
  for (const p of roster) raw += sampleGamma(p.ppr_ppg_mean, p.ppr_ppg_sd, rng);
  const C = consistency || 0;
  if (C > 0) {
    const expected = roster.reduce((s, p) => s + p.ppr_ppg_mean, 0);
    raw = raw * (1 - C) + expected * C;
  }
  return raw * chemistryMultiplier * rosterStructure(roster).multiplier;
}

function resolveHeadToHead(a, b, rng, cal, constants = CONSTANTS) {
  const C = constants.BOWL_CONSISTENCY ?? BOWL_CONSISTENCY;
  const aPts = teamOffense(a.roster, a.chemistry ?? 1, rng, C);
  const bPts = teamOffense(b.roster, b.chemistry ?? 1, rng, C);
  let aWon;
  if (aPts > bPts) aWon = true;
  else if (aPts < bPts) aWon = false;
  else aWon = rng() < 0.5;
  const shown = cal ? toFootballScore(aPts, bPts, aWon, rng, cal) : null;
  return {
    aPts: Math.round(aPts * 10) / 10,
    bPts: Math.round(bPts * 10) / 10,
    aWon,
    shownA: shown ? shown.you : null,
    shownB: shown ? shown.them : null,
  };
}

// ─── display scores ─────────────────────────────────────────────────────────

function percentileIn(table, v) {
  let lo = 0, hi = table.length - 1;
  if (v <= table[0]) return 0;
  if (v >= table[hi]) return 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (table[mid] <= v) lo = mid; else hi = mid;
  }
  const span = table[hi] - table[lo];
  const frac = span > 0 ? (v - table[lo]) / span : 0;
  return (lo + frac) / (table.length - 1);
}

function valueAt(table, p) {
  const x = Math.min(1, Math.max(0, p)) * (table.length - 1);
  const i = Math.floor(x);
  const j = Math.min(table.length - 1, i + 1);
  return table[i] + (table[j] - table[i]) * (x - i);
}

const SCORELINE_TOLERANCE = { margin: 5.0, points: 6.0 };

function toFootballScore(yourScore, oppScore, won, rng, cal) {
  const internalMargin = Math.abs(yourScore - oppScore);
  const marginTarget = Math.max(1, valueAt(cal.real_margin_q,
    percentileIn(cal.internal_margin_q, internalMargin)));

  if (!cal.real_pairs || !cal.internal_offense_q) {
    return legacyFootballScore(marginTarget, won, rng, cal);
  }

  const pointsTarget = valueAt(cal.real_team_pts_q,
    percentileIn(cal.internal_offense_q, yourScore));

  const TM = SCORELINE_TOLERANCE.margin, TP = SCORELINE_TOLERANCE.points;
  const pairs = cal.real_pairs;
  let sum = 0;
  const w = new Array(pairs.length);
  for (let i = 0; i < pairs.length; i++) {
    const hi = pairs[i][0], lo = pairs[i][1], n = pairs[i][2];
    const mine = won ? hi : lo;
    const dm = (hi - lo - marginTarget) / TM;
    const dp = (mine - pointsTarget) / TP;
    const v = n * Math.exp(-0.5 * (dm * dm + dp * dp));
    w[i] = v;
    sum += v;
  }
  if (!(sum > 0)) return legacyFootballScore(marginTarget, won, rng, cal);

  let r = rng() * sum;
  let k = pairs.length - 1;
  for (let i = 0; i < pairs.length; i++) { r -= w[i]; if (r <= 0) { k = i; break; } }
  const hi = pairs[k][0], lo = pairs[k][1];
  return won ? { you: hi, them: lo } : { you: lo, them: hi };
}

function legacyFootballScore(marginTarget, won, rng, cal) {
  const bucket = cal.margin_buckets.findIndex((lo, i) =>
    marginTarget >= lo && marginTarget < (cal.margin_buckets[i + 1] ?? 1000));
  const totalQ = cal.totals_by_bucket_q[Math.max(0, bucket)] || cal.totals_by_bucket_q[0];
  const total = Math.round(valueAt(totalQ, rng()));
  const margin = Math.max(1, Math.round(marginTarget));
  const winnerPts = Math.round((total + margin) / 2);
  const loserPts = winnerPts - margin;
  return won ? { you: winnerPts, them: Math.max(0, loserPts) }
    : { you: Math.max(0, loserPts), them: winnerPts };
}

// ─── play a run ─────────────────────────────────────────────────────────────

function playRun(roster, chemistryMultiplier, schedule, playoffs, leagueContext, rng, prepared, constants = CONSTANTS) {
  const results = [];
  let wins = 0, losses = 0;

  const play = (opp, meta) => {
    const leagueAvg = leagueContext[opp.season] ?? 25;
    const r = resolveGame(roster, chemistryMultiplier, opp, leagueAvg, rng, constants);
    results.push({ opponent: opp.display, opponent_id: opp.team_season_id, ...meta, ...r });
    if (r.won) wins++; else losses++;
    return r.won;
  };

  for (let i = 0; i < schedule.length; i++) {
    play(schedule[i], { week: i + 1, playoff: false, bowl: false, round: null });
  }

  const regularWins = wins;
  const regularLosses = losses;

  /* SELECTION. The season becomes a resume: the record, the scoring margin in
     real points, and the strength of the twelve teams played. That resume is
     ranked against the country and the top twelve get in. */
  const margin = results.reduce((t, r) => t + (r.yourScore - r.oppScore), 0)
    / Math.max(1, results.length) / (constants.SCALE || 1);
  const ranking = rankSeason(regularWins, regularLosses, margin,
    schedule.map(t => t.strength_z || 0), prepared);
  const seed = seedFromRanking(ranking.rank, regularWins);

  let titleWon = false;
  let exitRound = null;
  let bowlResult = null;

  if (seed.made) {
    const names = playoffRoundNames(seed.rounds);
    for (let i = 0; i < seed.rounds; i++) {
      const opp = playoffOpponent(playoffs, seed.rounds, i);
      const leagueAvg = leagueContext[opp.season] ?? 25;
      /* EVERY ROUND is scaled to the roster in front of it, on its own pivot, so
         how far a season goes tracks the team rather than the draw. advantage
         divides the opponent's score, so dividing it by the edge multiplies
         their score by it. */
      const isFinal = names[i] === 'CFP Championship';
      const ovr = teamOverall(roster, chemistryMultiplier, constants);
      const edge = roundEdge(ovr, names[i], constants);
      const r = resolveGame(roster, chemistryMultiplier, opp, leagueAvg, rng, constants,
        seedAdvantage(seed.seed, names[i], constants) / edge);
      /* Under the floor the edge already wins this game about 999 times in 1000.
         This is the thousandth. The opponent's score is lifted past yours rather
         than the result being overturned afterwards, so the scoreline a player
         reads still explains the result it is printed next to. */
      if (isFinal && ovr < constants.TITLE_FLOOR && r.won) {
        r.oppScore = r.yourScore * 1.04;
        r.won = false;
      }
      results.push({ opponent: opp.display, opponent_id: opp.team_season_id,
        week: schedule.length + i + 1, playoff: true, bowl: false, round: names[i], ...r });
      if (r.won) wins++; else { losses++; exitRound = names[i]; break; }
      if (i === seed.rounds - 1) titleWon = true;
    }
  } else if (seed.bowl) {
    bowlResult = { tier: seed.bowl, label: seed.label };
  }

  return {
    results,
    wins,
    losses,
    regularWins,
    regularLosses,
    regularRecord: `${regularWins}-${regularLosses}`,
    record: `${wins}-${losses}`,
    seed,
    ranking,
    titleWon,
    exitRound,
    bowlResult,
    /* A perfect season is unbeaten AND champion AND a roster that belongs in the
       conversation. The first two are played out; the third is PERFECT_FLOOR,
       which is the SAME bar as the title floor, not a higher one. See the
       constant. Measured against the current season it blocks nobody: every
       roster that goes unbeaten and then wins four playoff games is already
       above it, which is the shape it is supposed to have. It stays because it
       is the backstop if the season is ever loosened again. */
    perfect: losses === 0 && titleWon
      && teamOverall(roster, chemistryMultiplier, constants) >= constants.PERFECT_FLOOR,
    undefeatedRegular: regularLosses === 0,
  };
}

function playBowlGame(roster, chemistryMultiplier, bowlOpp, leagueContext, rng, bowlInfo, constants = CONSTANTS) {
  const leagueAvg = leagueContext[bowlOpp.season] ?? 25;
  const r = resolveGame(roster, chemistryMultiplier, bowlOpp, leagueAvg, rng, constants);
  return {
    opponent: bowlOpp.display,
    opponent_id: bowlOpp.team_season_id,
    bowl: true,
    round: bowlInfo.name,
    bowlKey: bowlInfo.key,
    bowlTagline: bowlInfo.tagline,
    ...r,
  };
}

// ─── prepare data ───────────────────────────────────────────────────────────

function prepareData(teamSeasons) {
  const byProgram = {};
  for (const t of teamSeasons) (byProgram[t.school] ??= []).push(t);

  const zs = teamSeasons.map(t => t.strength_z).sort((a, b) => a - b);
  const q = (p) => zs[Math.min(zs.length - 1, Math.max(0, Math.round(p * (zs.length - 1))))];
  const eliteThreshold = q(0.90);

  const winsOf = (t) => Number(String(t.record).split('-')[0]) || 0;

  const goodPool = teamSeasons.filter(t => winsOf(t) >= 9 && winsOf(t) <= 10);
  const greatPool = teamSeasons.filter(t => winsOf(t) >= 11);
  const elitePool = teamSeasons.filter(t => winsOf(t) >= 12 || (winsOf(t) >= 11 && t.strength_z >= q(0.95)));
  const bowlPool = teamSeasons.filter(t => winsOf(t) >= 7 && winsOf(t) <= 9);

  const index = {};
  for (const t of teamSeasons) index[t.team_season_id] = t;

  /* THE NATIONAL LANDSCAPE, built once. Every team-season is scored on the same
     resume the player will be scored on, using its conference that year as its
     strength of schedule. Sorted, the list becomes the ranking a season is
     measured against. */
  const confSum = {}, confCount = {};
  for (const t of teamSeasons) {
    const k = t.season + '|' + t.conference;
    confSum[k] = (confSum[k] || 0) + t.strength_z;
    confCount[k] = (confCount[k] || 0) + 1;
  }
  const resumeTable = teamSeasons.map((t) => {
    const parts = String(t.record).split('-');
    const w = Number(parts[0]) || 0, l = Number(parts[1]) || 0;
    const k = t.season + '|' + t.conference;
    const sos = confCount[k] ? confSum[k] / confCount[k] : 0;
    return resumeScore(w, l, t.strength_z, sos);
  }).sort((a, b) => b - a);

  const diffs = teamSeasons.map(t => t.point_diff_pg || 0);
  const pointDiffMean = diffs.reduce((a, b) => a + b, 0) / (diffs.length || 1);
  const pointDiffSd = Math.sqrt(
    diffs.reduce((s, d) => s + (d - pointDiffMean) * (d - pointDiffMean), 0) / (diffs.length || 1)) || 1;

  const meanZ = zs.reduce((a, b) => a + b, 0) / zs.length;
  return {
    byProgram,
    eliteThreshold,
    goodPool,
    greatPool,
    elitePool,
    bowlPool,
    resumeTable,
    pointDiffMean,
    pointDiffSd,
    byId: (id) => index[id],
    meanScheduleStrength: meanZ * CONSTANTS.REGULAR_SEASON_GAMES,
  };
}

// ─── public API ─────────────────────────────────────────────────────────────

const publicAPI = {
  API_VERSION: ENGINE_API_VERSION,
  CONSTANTS, CHEMISTRY, SLOTS, SLOT_ELIGIBILITY, positionsOf, canFillSlot, findQB,
  hashSeed, createSeededRNG, sampleGamma,
  pairLinks, resolveChemistry,
  generateSchedule, generatePlayoffs, generateBowlOpponent,
  resolveGame, resolveHeadToHead, playRun, playBowlGame, prepareData, toFootballScore,
  playoffOpponent, playoffRoundNames,
  resumeScore, nationalRank, rankSeason, seedFromRanking, seedAdvantage,
  teamRating, teamOverall, titleEdge, roundEdge,
  respinCost, respinFees,
  scoringScript, scoreParts, SCORE_KINDS,
  contrast, teamColors, washColors, wheelColors, teamButton, teamInk,
  CONFERENCE_LINEAGE, conferenceOf, POWER_CONFERENCES, isPowerConference,
  LINK_TIERS, linkTier,
  rosterStructure, STRUCTURE, coachReport,
  selectBowl, BOWLS, bowlKey, bowlName, MARGIN_GAIN,
  SCHEME_NAMES: Object.fromEntries(SCHEMES.map(s => [s.key, s.name])),
  SCHEME_TAGLINES: Object.fromEntries(SCHEMES.map(s => {
    const cut = s.strength.indexOf('. ');
    return [s.key, cut >= 0 ? s.strength.slice(cut + 2) : s.strength];
  })),
};

if (typeof module !== 'undefined' && module.exports) module.exports = publicAPI;
if (typeof window !== 'undefined') window.PS_CFB_ENGINE = publicAPI;
})();
