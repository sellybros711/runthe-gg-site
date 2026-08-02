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
     difficulty dial: raise it and every opponent is harder. It was 2.2, and came
     down when the cap did, so that a smaller budget did not quietly turn into a
     losing season. At 2.0, with two marquee games on the schedule, a squad
     drafted best-available wins 68% of its games, goes 12-0 in 2.2% of seasons
     and reaches the playoff in a quarter of them. It was 76%, 7% and 33% before
     the marquee games went in; that difficulty is the price of an unbeaten
     season being rare, and the two move together. */
  SCALE: 2.0,
  /* THE BUDGET HAS TO SAY NO, or there is no decision in the draft. At $14M it
     almost never did: drafting the highest scorer on every board spent 90% of it
     and ran into the price on 9% of picks. The NFL game, which is the same six
     slots and the same price curve at ten times the numbers, spends 98% and is
     priced out on 29%. $11M puts this game on that number. */
  CAP_MUSD: 11,
  RESPIN_LADDER_MUSD: [0.5, 1.0, 1.5],
  MAX_RESPINS: 3,
  MIN_RESERVE_PER_SLOT_MUSD: 0.3,
  REGULAR_SEASON_GAMES: 12,
  /* The 12-team College Football Playoff. You are not measured against a win
     total any more, you are ranked against the country: the top 12 get in, and
     the top 4 seeds sit out the first round. FIELD_SIZE is how many teams the
     country holds, so a percentile in the team data becomes a national ranking. */
  PLAYOFF_TEAMS: 12,
  PLAYOFF_BYES: 4,
  FIELD_SIZE: 134,
  // How a percentile inside the team data becomes a national rank. See nationalRank.
  POOL_GAMMA: 1.18,
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
  TITLE_FLOOR: 88,
  PERFECT_FLOOR: 90,
  ROUND_EDGE_MAX: 3.20,
  ROUND_EDGE_MIN: 0.86,
  ROUND_EDGE_SLOPE: 0.075,
  /* THE BAR RISES ROUND BY ROUND. One pivot each: the overall at which that
     round is an even game. A first-round opponent is beatable by a team that
     scraped into the field; the team waiting in the final is not. This is what
     makes how FAR a season goes track the roster rather than the draw. */
  ROUND_EDGE_PIVOT: {
    'CFP First Round': 82,
    'CFP Quarterfinal': 88,
    'CFP Semifinal': 93,
    'CFP Championship': 97,
  },
  // Extra, per point below TITLE_FLOOR, on top of the ordinary slope. Final only.
  TITLE_EDGE_CLIFF: 0.16,
  NY6_MAX_LOSSES: 3,
  BOWL_MAX_LOSSES: 5,
  MINOR_BOWL_MAX_LOSSES: 6,
  // How much each side's score is pulled toward its true mean each game. Higher
  // means less week-to-week noise, so roster strength wins out and better teams go
  // farther. The opponent used to be fully random (OPP_CONSISTENCY effectively 0),
  // which let weak opponents get hot and upset strong rosters regardless of talent;
  // damping both sides makes the playoff and a title track real quality.
  CONSISTENCY: 0.40,
  OPP_CONSISTENCY: 0.40,
  PLAYOFF_HOME_FIELD: 0.35,
  // How much of an opponent's defence is applied to your offence. See resolveGame.
  DEFENCE_WEIGHT: 0.65,
  /* CONFERENCE PLAY. When you represent a conference, this many of the twelve are
     against that conference and decide your standing in it; the rest are the
     non-conference slate. Eight is what a real Power 5 team plays. The top two in
     the final standings meet for the conference title, and winning it is an
     automatic playoff berth however the national ranking came out. */
  CONFERENCE_GAMES: 8,
  CONFERENCE_CHAMP_TOP: 2,
  // How many teams the standings table holds, you included.
  CONFERENCE_FIELD: 12,
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
   Records are normalised to a 12-game season so a team that played fourteen is
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
   the bottom still stretches out to last. Fitted so that the records the real
   12-team field is made of land where they land in life: every unbeaten and
   one-loss team in, about 45% of 11-2s, about 27% of 10-2s, next to none below. */
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
   falls out is flatter than a real team's. Measured over 17,000 seasons at every
   record from 6-6 to 12-0, a real team's strength_z is 1.30 times yours, with an
   intercept of 0.008 and an R2 of 0.974. Multiplying by that puts your season on
   the same scale as the teams it is being ranked against, which it was not
   before: without it you look better than a real team at 6-6 and worse at 12-0.
   Re-measure it with cfb/build/test/probe_economy.mjs if SCALE, the cap or
   DEFENCE_WEIGHT move, because all three change what a margin looks like. */
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
   average defence. */
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

/* Ranking to postseason. Top 12 play for the title, top 4 of those get the week
   off; everyone else is sorted into bowls by how many games they lost. */
function seedFromRanking(rank, wins, conferenceChampion = false) {
  if (rank <= CONSTANTS.PLAYOFF_TEAMS) {
    const bye = rank <= CONSTANTS.PLAYOFF_BYES;
    return { made: true, seed: rank, rank, bye, conferenceChampion,
      rounds: bye ? CONSTANTS.PLAYOFF_ROUNDS_WITH_BYE : CONSTANTS.PLAYOFF_ROUNDS_NO_BYE,
      label: bye ? 'No. ' + rank + ' seed, first-round bye' : 'No. ' + rank + ' seed' };
  }
  /* THE AUTOMATIC BID. A conference champion is in however the national ranking
     came out, and it takes the last seed and the four-round road, because a bye
     is earned by ranking in the top four and a champ ranked outside the top
     twelve did not earn one. */
  if (conferenceChampion) {
    return { made: true, seed: CONSTANTS.PLAYOFF_TEAMS, rank, bye: false, conferenceChampion: true, autoBid: true,
      rounds: CONSTANTS.PLAYOFF_ROUNDS_NO_BYE,
      label: 'Conference champion, No. ' + CONSTANTS.PLAYOFF_TEAMS + ' seed' };
  }
  const losses = CONSTANTS.REGULAR_SEASON_GAMES - wins;
  const out = { made: false, seed: null, rank, bye: false };
  if (losses <= CONSTANTS.NY6_MAX_LOSSES) {
    return { ...out, bowl: 'ny6', rounds: 1, label: 'New Year\'s Six Bowl' };
  }
  if (losses <= CONSTANTS.BOWL_MAX_LOSSES) {
    return { ...out, bowl: 'bowl', rounds: 1, label: 'Bowl Game' };
  }
  if (losses <= CONSTANTS.MINOR_BOWL_MAX_LOSSES) {
    return { ...out, bowl: 'minor', rounds: 1, label: 'Minor Bowl' };
  }
  return { ...out, bowl: null, rounds: 0, label: 'Season over' };
}

/* THE CONFERENCE TABLE at the end of the regular season. You against the league
   you represent: your eight conference games are a real record, and every other
   member's is simulated once from its strength that year, a coin weighted by
   how good the team was, over the same eight games. Sorted on conference wins,
   ties broken by season quality. The top two play for the title; if you are one
   of them, the other is your opponent, a real team season the championship game
   is played against. Deterministic in the rng it is handed, so it is computed
   once on selection day and kept. */
function conferenceStandings(conference, yourConfWins, yourZ, prepared, rng, constants = CONSTANTS) {
  const confN = constants.CONFERENCE_GAMES;
  const field = constants.CONFERENCE_FIELD || 12;
  const pool = (prepared && prepared.byConference && prepared.byConference[conference]) || [];
  const bySchool = {};
  for (const t of pool) (bySchool[t.school] ??= []).push(t);
  const schools = Object.keys(bySchool);
  /* Fisher-Yates on the rng so the rivals are a stable draw for this run. */
  for (let i = schools.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [schools[i], schools[j]] = [schools[j], schools[i]];
  }
  const rivalSchools = schools.slice(0, Math.max(1, Math.min(field - 1, schools.length)));
  const sigmoid = (z) => 1 / (1 + Math.exp(-0.9 * z));
  const rivals = rivalSchools.map((s) => {
    const list = bySchool[s];
    const t = list[Math.floor(rng() * list.length)];
    const p = sigmoid(t.strength_z);
    let w = 0;
    for (let i = 0; i < confN; i++) if (rng() < p) w++;
    return { name: t.school, id: t.team_season_id, team: t, wins: w, z: t.strength_z, you: false };
  });
  const me = { name: 'You', wins: Math.max(0, Math.min(confN, yourConfWins)), z: yourZ, you: true };
  const table = [...rivals, me].sort((a, b) => (b.wins - a.wins) || (b.z - a.z));
  const myPos = table.findIndex((r) => r.you) + 1;
  const top = constants.CONFERENCE_CHAMP_TOP;
  const inChampGame = myPos <= top;
  const other = inChampGame ? table.slice(0, top).find((r) => !r.you) : null;
  return {
    conference,
    table: table.map((r, i) => ({ pos: i + 1, name: r.name, wins: r.wins, losses: confN - r.wins, you: r.you })),
    myPos,
    inChampGame,
    opponent: other ? other.team : null,
    opponentName: other ? other.name : null,
  };
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

// ─── bowl theming ───────────────────────────────────────────────────────────

const BOWL_ARCHETYPES = [
  {
    key: 'air_raid',
    name: 'Air Raid Bowl',
    detect(roster) {
      const qb = roster.find(p => p.position === 'QB');
      if (!qb || (qb.pass_ppg || 0) < 14) return -1;
      const wrs = roster.filter(p => p.position === 'WR');
      const totalRec = wrs.reduce((s, p) => s + (p.rec_ppg || 0), 0);
      if (totalRec < 12) return -1;
      return clamp(((qb.pass_ppg || 0) - 14) / 10 + (totalRec - 12) / 10, 0, 1);
    },
    tagline: 'The passing game was the whole show.',
  },
  {
    key: 'ground_pound',
    name: 'Ground & Pound Bowl',
    detect(roster) {
      const rbs = roster.filter(p => p.position === 'RB');
      const totalRush = rbs.reduce((s, p) => s + (p.rush_ppg || 0), 0);
      if (totalRush < 10) return -1;
      return clamp((totalRush - 10) / 8, 0, 1);
    },
    tagline: 'They never stopped running.',
  },
  {
    key: 'brotherhood',
    name: 'Brotherhood Bowl',
    detect(roster, chemResult) {
      if (!chemResult || chemResult.net < 0.08) return -1;
      return clamp((chemResult.net - 0.08) / 0.07, 0, 1);
    },
    tagline: 'These players knew each other, and it showed.',
  },
  {
    key: 'one_man_army',
    name: 'One Man Army Bowl',
    detect(roster) {
      const total = roster.reduce((s, p) => s + p.ppr_ppg_mean, 0);
      if (!total) return -1;
      const topShare = Math.max(...roster.map(p => p.ppr_ppg_mean)) / total;
      if (topShare < 0.35) return -1;
      return clamp((topShare - 0.35) / 0.15, 0, 1);
    },
    tagline: 'One player carried this team on his back.',
  },
  {
    key: 'cinderella',
    name: 'Cinderella Bowl',
    detect(roster) {
      const spend = roster.reduce((s, p) => s + p.price_musd, 0);
      if (spend > CONSTANTS.CAP_MUSD * 0.6) return -1;
      return clamp((CONSTANTS.CAP_MUSD * 0.6 - spend) / (CONSTANTS.CAP_MUSD * 0.3), 0, 1);
    },
    tagline: 'Nobody expected this team to be here.',
  },
  {
    key: 'home_state',
    name: 'Home State Bowl',
    detect(roster) {
      const states = roster.map(p => p.home_state).filter(Boolean);
      if (states.length < 3) return -1;
      const counts = {};
      for (const s of states) counts[s] = (counts[s] || 0) + 1;
      const max = Math.max(...Object.values(counts));
      if (max < 3) return -1;
      return clamp((max - 3) / 2, 0, 1);
    },
    tagline: 'They all grew up in the same backyard.',
  },
];

const GENERIC_BOWL_NAMES = [
  'Independence Bowl', 'Sun Bowl', 'Liberty Bowl', 'Music City Bowl',
  'Gator Bowl', 'Citrus Bowl', 'Alamo Bowl', 'Holiday Bowl',
  'Las Vegas Bowl', 'Texas Bowl', 'Duke\'s Mayo Bowl', 'Pinstripe Bowl',
];

function selectBowl(roster, chemResult, rng) {
  let best = null, bestFit = -1;
  for (const arch of BOWL_ARCHETYPES) {
    const fit = arch.detect(roster, chemResult);
    if (fit > bestFit) { bestFit = fit; best = arch; }
  }
  if (best && bestFit >= 0) {
    return { key: best.key, name: best.name, tagline: best.tagline, fit: bestFit };
  }
  const name = GENERIC_BOWL_NAMES[Math.floor(rng() * GENERIC_BOWL_NAMES.length)];
  return { key: 'generic', name, tagline: 'A solid season deserves one more game.', fit: 0 };
}

// ─── chemistry ──────────────────────────────────────────────────────────────

/* HALVED. Chemistry was worth +4.9% to a median roster and +11.5% at the top,
   which made "six men who happened to share a state" a bigger lever than most of
   what a player actually decides. It is a garnish on a roster, not the roster.
   Every link is worth half what it was and the asymptote came down with them, so
   a median team now gets about +2.5% and the very best about +6%. */
const CHEMISTRY = {
  VALUES: {
    battery: 0.05,
    teammates: 0.025,
    program: 0.015,
    family: 0.015,
    home_state: 0.01,
    conference: 0.01,
    coach: 0.01,
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

function washColor(hex, targetL) {
  const [h, s, l] = hexToHsl(hex);
  return hslToHex(h, Math.min(s, 40), targetL);
}

function washColors(color, altColor) {
  const bg = washColor(color || '#333333', 15);
  const accent = washColor(altColor || color || '#666666', 30);
  return { bg, accent };
}

// HOW FAR FROM GREY A COLOR HAS TO BE BEFORE IT HAS A HUE AT ALL, as a 0..255
// spread between its brightest and darkest channel. White, black, silver and
// charcoal are all below this, and for all of them hexToHsl reports hue 0, which is
// not a fact about the colour: it is what the formula returns when there is no hue
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
// A GREY IS NOT A DULL RED. This used to force the saturation floor onto every
// input, and hexToHsl reports hue 0 for anything achromatic, so #ffffff came back
// as #dd3c3c and #000000 as #671e1e. Kentucky is blue and white and was drawn with
// a red border; Iowa is black and gold and was drawn on dark red. About half the
// schools in the game have a white, black or silver in their pair, so about half
// were wrong. Below the chroma floor the colour keeps its neutrality and only its
// lightness is set.
function wheelColor(hex, minS, targetL, neutralL) {
  if (chromaOf(hex) < CHROMA_FLOOR) return hslToHex(0, 0, neutralL === undefined ? targetL : neutralL);
  const [h, s] = hexToHsl(hex);
  return hslToHex(h, Math.min(100, Math.max(s, minS)), targetL);
}

function wheelColors(color, altColor) {
  const primary = color || '#334155';
  const secondary = altColor || color || '#94a3b8';
  // A neutral primary lands near black rather than at mid grey, because a black
  // helmet school should read black: Iowa, Purdue, Oregon State.
  const bg = wheelColor(primary, 55, 26, 13);
  // A DARK NEUTRAL TRIM CANNOT BE DRAWN AS ITSELF. The accent is the box's border,
  // and Georgia's black on Georgia's red is a border nobody can see. A light neutral
  // would be a lie in the other direction, so a dark achromatic secondary falls back
  // to the school's OWN colour lifted off the background: still the school's palette,
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

const LINK_TIERS = [
  { min: 0.08, label: 'strong' },
  { min: 0.04, label: 'good' },
  { min: 0.01, label: 'weak' },
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

const SCHEMES = [
  {
    key: 'spread',
    name: 'Spread Offense',
    detect(roster) {
      const qb = roster.find(p => p.position === 'QB');
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
      const qb = roster.find(p => p.position === 'QB');
      if (!qb || (qb.pass_ppg || 0) < 16) return -1;
      const wrs = roster.filter(p => p.position === 'WR' && (p.rec_ppg || 0) >= 8)
        .sort((a, b) => (b.rec_ppg || 0) - (a.rec_ppg || 0));
      if (wrs.length < 2) return -1;
      return fitAvg(over(qb.pass_ppg, 16, 7), over(wrs[0].rec_ppg, 8, 7), over(wrs[1].rec_ppg, 8, 7));
    },
    strength: 'Air Raid. The passing game can carry this team.',
  },
  {
    key: 'pro_style',
    name: 'Pro Style',
    detect(roster) {
      const qb = roster.find(p => p.position === 'QB');
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
      const qb = roster.find(p => p.position === 'QB');
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
      const qb = roster.find(p => p.position === 'QB');
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

  const qb = roster.find(p => p.position === 'QB');
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

const SLOTS = ['QB', 'RB', 'WR', 'WR', 'TE', 'FLEX'];
const SLOT_ELIGIBILITY = {
  QB: ['QB'], RB: ['RB'], WR: ['WR'], TE: ['TE'], FLEX: ['RB', 'WR', 'TE'],
};

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
/* A SCHEDULE FOR A TEAM THAT REPRESENTS A CONFERENCE. Eight of the twelve are
   against that conference, the members as they were that year, and they are the
   games the standing in the conference is read from; the other four are an
   ordinary non-conference slate drawn from anywhere. The eight are chosen to sit
   near the league's own average strength rather than stacking its best or its
   worst, so the conference race is fair, and the whole twelve is still nudged
   toward the same overall target the national schedule uses so ranking and the
   economy do not move. Returns the same shape as generateSchedule plus a Set of
   the team-season ids that are the conference games. */
function generateConferenceSchedule(data, rng, conference, opts = {}) {
  const { byProgram, byConference, meanScheduleStrength } = data;
  const count = opts.games ?? CONSTANTS.REGULAR_SEASON_GAMES;
  const confN = Math.min(opts.conferenceGames ?? CONSTANTS.CONFERENCE_GAMES, count);
  const pool = (byConference && byConference[conference]) || [];
  /* One team season per school, so a conference game is against a distinct
     programme; without enough of them the conference cannot fill a slate and the
     caller falls back to a normal schedule. */
  const bySchool = {};
  for (const t of pool) (bySchool[t.school] ??= []).push(t);
  const schools = Object.keys(bySchool);
  if (schools.length < confN) return null;

  const programs = Object.keys(byProgram);
  const overallTarget = meanScheduleStrength / count;

  let best = null;
  for (let attempt = 0; attempt < (opts.maxAttempts ?? 300); attempt++) {
    const used = new Set();
    const conf = [];
    let guard = 0;
    while (conf.length < confN && guard++ < 400) {
      const s = schools[Math.floor(rng() * schools.length)];
      if (used.has(s)) continue;
      used.add(s);
      const list = bySchool[s];
      conf.push(list[Math.floor(rng() * list.length)]);
    }
    if (conf.length < confN) return null;
    const nonN = count - confN;
    const non = [];
    let g2 = 0;
    while (non.length < nonN && g2++ < 600) {
      const p = programs[Math.floor(rng() * programs.length)];
      if (used.has(p)) continue;
      used.add(p);
      non.push(byProgram[p][Math.floor(rng() * byProgram[p].length)]);
    }
    if (non.length < nonN) continue;
    const all = conf.concat(non);
    const total = all.reduce((s, g) => s + g.strength_z, 0);
    const drift = Math.abs(total / count - overallTarget);
    if (!best || drift < best.drift) best = { conf, non, all, total, drift };
    if (drift <= 0.04) break;
  }
  if (!best) return null;
  const conferenceIds = new Set(best.conf.map((g) => g.team_season_id));
  const games = orderSchedule(best.all, rng);
  return { games, total: best.total, conferenceIds, conference };
}

function generateSchedule(data, rng, opts = {}) {
  if (opts.conference) {
    const cs = generateConferenceSchedule(data, rng, opts.conference, opts);
    if (cs) return cs;
  }
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
  if (tier === 'bowl') return pickFrom(data.goodPool.length ? data.goodPool : data.bowlPool, rng);
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
  /* THE DEFENCE DAMPS YOUR OFFENCE, IT DOES NOT SCALE IT. The raw ratio treats a
     defence as if it multiplied your whole output: the best defences in the data
     allow 17 points against a league average of 27, so a straight ratio cut your
     scoring by 37% before a snap was played. That is more than any real defence
     does, and it is why the last two playoff rounds used to be 25-point losses
     rather than games. DEFENCE_WEIGHT pulls the ratio toward 1, keeping the sign
     and the ordering while making the elasticity believable. */
  const defenseModifier = 1 +
    (opponent.pts_allowed_mean / leagueAvgAllowed - 1) * (constants.DEFENCE_WEIGHT ?? 1);
  const yourScore = raw * chemistryMultiplier * structure * defenseModifier;

  let oppRaw = sampleGamma(opponent.pts_scored_mean, opponent.pts_scored_sd, rng);
  const OC = constants.OPP_CONSISTENCY || 0;
  if (OC > 0) oppRaw = oppRaw * (1 - OC) + opponent.pts_scored_mean * OC;
  const oppScore = oppRaw * constants.SCALE / advantage;

  let won;
  if (yourScore > oppScore) won = true;
  else if (yourScore < oppScore) won = false;
  else won = rng() < 0.5;

  return { won, yourScore, oppScore, defenseModifier };
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

  if (!cal.real_pairs || !cal.internal_offence_q) {
    return legacyFootballScore(marginTarget, won, rng, cal);
  }

  const pointsTarget = valueAt(cal.real_team_pts_q,
    percentileIn(cal.internal_offence_q, yourScore));

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
       which sits two points above the title floor because the game's own name is
       on this outcome. */
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

  /* Every team season filed under the conference it played in that year, lineage
     folded in (Pac-10 into Pac-12), so a conference schedule can be drawn from
     the league as it actually was and the standings can be built from its real
     members. */
  const byConference = {};
  for (const t of teamSeasons) {
    const c = conferenceOf(t.conference);
    if (c) (byConference[c] ??= []).push(t);
  }

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
    byConference,
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
  CONSTANTS, CHEMISTRY, SLOTS, SLOT_ELIGIBILITY,
  hashSeed, createSeededRNG, sampleGamma,
  pairLinks, resolveChemistry,
  generateSchedule, generateConferenceSchedule, generatePlayoffs, generateBowlOpponent,
  resolveGame, playRun, playBowlGame, prepareData, toFootballScore,
  playoffOpponent, playoffRoundNames, conferenceStandings,
  resumeScore, nationalRank, rankSeason, seedFromRanking, seedAdvantage,
  teamRating, teamOverall, titleEdge, roundEdge,
  respinCost, respinFees,
  scoringScript, scoreParts, SCORE_KINDS,
  contrast, teamColors, washColors, wheelColors, teamButton, teamInk,
  CONFERENCE_LINEAGE, conferenceOf, POWER_CONFERENCES, isPowerConference,
  LINK_TIERS, linkTier,
  rosterStructure, STRUCTURE, coachReport,
  selectBowl, BOWL_ARCHETYPES, GENERIC_BOWL_NAMES,
  SCHEME_NAMES: Object.fromEntries(SCHEMES.map(s => [s.key, s.name])),
  SCHEME_TAGLINES: Object.fromEntries(SCHEMES.map(s => {
    const cut = s.strength.indexOf('. ');
    return [s.key, cut >= 0 ? s.strength.slice(cut + 2) : s.strength];
  })),
};

if (typeof module !== 'undefined' && module.exports) module.exports = publicAPI;
if (typeof window !== 'undefined') window.PS_CFB_ENGINE = publicAPI;
})();
