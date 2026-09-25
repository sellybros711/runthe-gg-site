/* Run The Diamond: game engine.
 *
 * Headless and dependency-free. Browser: window.RTD_ENGINE. Node:
 * require('./engine.js'). Mirror of The Perfect Season's engine.js,
 * adapted for baseball: 12-slot roster, 162-game season, BaseRuns
 * offense, Pythagorean expectation, LDS→LCS→World Series playoffs.
 */

'use strict';
(function() {

const CONSTANTS = {
  /* The budget has to say no, or there's no decision in the draft. At $245M
   * best-available was priced out on ~1.7 of 12 spins (it barely bit); $170M
   * makes the budget bite hard. You can't afford a star most spins, and a
   * strong roster takes real draft skill, not just best-available. */
  CAP_MUSD: 170,
  REGULAR_SEASON_GAMES: 162,

  RESPIN_LADDER_MUSD: [5, 10, 15],
  MAX_RESPINS: 3,
  MIN_RESERVE_PER_SLOT_MUSD: 1,

  /* Playoff thresholds, calibrated to the 162-game sim.
   * 95+ wins earns the division (top seed, LCS bye in a simplified bracket).
   * 88+ wins makes the wild card. Below 88 the season is over. */
  DIVISION_WINS: 95,
  WILD_CARD_WINS: 88,
  PLAYOFF_ROUNDS_DIVISION: 3,   // LDS → LCS → WS
  PLAYOFF_ROUNDS_WILD_CARD: 4,  // WC → LDS → LCS → WS

  /* Pythagorean exponent for baseball (empirical ~1.83). */
  PYTH_EXP: 1.83,

  /* League-average normalizer: what an average MLB team scores/allows per
   * game. Opponent quality factors below are expressed relative to this. */
  OPP_RUNS_MEAN: 4.5,
  OPP_RUNS_SD: 1.8,

  /* Your opponents are OTHER all-time rosters, not league-average teams.
   * They score more (OPP_OFF_MEAN) and allow less (OPP_DEF_MEAN) than the
   * league baseline. These two numbers are the primary difficulty knobs. */
  OPP_OFF_MEAN: 5.34,
  OPP_DEF_MEAN: 3.95,

  /* Consistency: how much each side's runs are pulled toward expected value.
   * At 0 pure variance; at 1 deterministic. */
  CONSISTENCY: 0.10,

  /* Playoff home-field advantage, same concept as football. */
  PLAYOFF_HOME_FIELD: 0.15,

  /* Playoff opponents get this much tougher each round. */
  PLAYOFF_ROUND_STEP: 0.12,

  /* The record to chase. */
  RECORD_WINS: 116,
  GOAT_WINS: 117,

  /* Closer save conversion rate: the base rate for an average closer. */
  CLOSER_BASE_SAVE_PCT: 0.80,
  CLOSER_WAR_SCALE: 0.02,

  /* League-average filler for rotation depth behind SP1/SP2. */
  FILLER_ERA: 4.50,
  FILLER_IP_SHARE: 0.55,

  /* SP anchor innings: the abstraction from GDD §8. */
  ANCHOR_IP: 210,
};

const ERAS = {
  '1900s': [1901, 1909],
  '1910s': [1910, 1919],
  '1920s': [1920, 1929],
  '1930s': [1930, 1939],
  '1940s': [1940, 1949],
  '1950s': [1950, 1959],
  '1960s': [1960, 1969],
  '1970s': [1970, 1979],
  '1980s': [1980, 1989],
  '1990s': [1990, 1999],
  '2000s': [2000, 2009],
  '2010s': [2010, 2019],
  '2020s': [2020, 2025],
};

/* Divisions, as they actually were.
 *
 * Scoped to 1994 onward, the three-division era, because that is the only period
 * where "AL East" names one stable thing a fan can picture. Divisions began in 1969
 * with two per league, and anything before that is just the two leagues.
 *
 * Each entry is [club, firstSeason, lastSeason], so a club sits in the division it
 * was really in that year: Detroit is AL East through 1997 and AL Central after,
 * Milwaukee is AL Central for four years before moving to the NL, Houston is NL
 * Central until 2013 and AL West after, and Montreal becomes Washington in 2005.
 * Drafting the 1996 AL West and getting Houston would be the whole point missed. */
const DIVISIONS = {
  'AL East': [['BAL', 1994, 2025], ['BOS', 1994, 2025], ['NYY', 1994, 2025],
    ['TOR', 1994, 2025], ['DET', 1994, 1997], ['TBD', 1998, 2007], ['TBR', 2008, 2025]],
  'AL Central': [['CHW', 1994, 2025], ['CLE', 1994, 2025], ['KCR', 1994, 2025],
    ['MIN', 1994, 2025], ['MIL', 1994, 1997], ['DET', 1998, 2025]],
  'AL West': [['OAK', 1994, 2024], ['SEA', 1994, 2025], ['TEX', 1994, 2025],
    ['ATH', 2025, 2025], ['CAL', 1994, 1996], ['ANA', 1997, 2004],
    ['LAA', 2005, 2025], ['HOU', 2013, 2025]],
  'NL East': [['ATL', 1994, 2025], ['NYM', 1994, 2025], ['PHI', 1994, 2025],
    ['FLA', 1994, 2011], ['MIA', 2012, 2025], ['MON', 1994, 2004], ['WSN', 2005, 2025]],
  'NL Central': [['CHC', 1994, 2025], ['CIN', 1994, 2025], ['PIT', 1994, 2025],
    ['STL', 1994, 2025], ['HOU', 1994, 2012], ['MIL', 1998, 2025]],
  'NL West': [['COL', 1994, 2025], ['LAD', 1994, 2025], ['SDP', 1994, 2025],
    ['SFG', 1994, 2025], ['ARI', 1998, 2025]],
};
const DIVISION_FIRST_SEASON = 1994;

/* A FRANCHISE outlives its club code, and until this table existed the game had
 * no way to say so.
 *
 * Baseball-Reference writes the code the club wore THAT YEAR, so one continuous
 * franchise arrives under several: the Marlins are FLA through 2011 and MIA after,
 * the Dodgers are BRO through 1957 and LAD after, the Athletics are PHA, KCA, OAK
 * and now ATH. Keyed on the raw code, One Franchise offered the Marlins as
 * 2012-2025 and fourteen seasons, of a club that has played since 1993. Reported
 * by a player. The Angels were worse and read as nonsense on the card: LAA is
 * 1961-1964 AND 2005-2025 with CAL and ANA in between, so the picker printed
 * "1961-2025, 25 seasons", a span of sixty-five years with forty missing.
 *
 * IT IS NOT ONLY THE PICKER, and the quieter half reaches every mode. The
 * chemistry franchise link asks whether two men played for the same club, so a
 * 2011 Marlin and a 2013 Marlin were strangers, and a 1952 Boston Brave and a 1954
 * Milwaukee Brave were strangers. Nothing throws: a link that does not fire is a
 * link nobody can see the absence of.
 *
 * [code, firstSeason, lastSeason], which is DIVISIONS' own shape, and the years
 * are load-bearing rather than tidy. Two codes in this data mean two different
 * things at two different times:
 *
 *   LAA  1961-1964 the Los Angeles Angels, and 2005-2025 the same franchise come
 *        back to the name, with CAL and ANA in the middle. A lineage keyed on
 *        codes alone would collapse the gap and claim the CAL and ANA years twice.
 *   BAL  1914-1915 is the FEDERAL LEAGUE Baltimore Terrapins, who folded, and
 *        1954-2025 is the Orioles, who are the St. Louis Browns moved. Those are
 *        two unrelated clubs on one code, so the Orioles lineage starts at 1954
 *        and the Terrapins belong to no franchise, which is the truth about them.
 *
 * ONLY A FRANCHISE THAT HAS WORN MORE THAN ONE CODE IS LISTED. `franchiseOf`
 * falls back to the code itself, so the Cubs need no row and cannot drift from
 * one. Everything here was validated against the pool before it was written: every
 * span holds real seasons, no season is claimed twice, and the only pool season no
 * lineage claims is the Terrapins. */
const FRANCHISES = {
  ATL: [['BSN', 1901, 1952], ['MLN', 1953, 1965], ['ATL', 1966, 2025]],
  BAL: [['MLA', 1901, 1901], ['SLB', 1902, 1953], ['BAL', 1954, 2025]],
  LAA: [['LAA', 1961, 1964], ['CAL', 1965, 1996], ['ANA', 1997, 2004], ['LAA', 2005, 2025]],
  LAD: [['BRO', 1901, 1957], ['LAD', 1958, 2025]],
  MIA: [['FLA', 1993, 2011], ['MIA', 2012, 2025]],
  MIL: [['SEP', 1969, 1969], ['MIL', 1970, 2025]],
  MIN: [['WSH', 1901, 1960], ['MIN', 1961, 2025]],
  NYY: [['BLA', 1901, 1902], ['NYY', 1903, 2025]],
  ATH: [['PHA', 1901, 1954], ['KCA', 1955, 1967], ['OAK', 1968, 2024], ['ATH', 2025, 2025]],
  SFG: [['NYG', 1901, 1957], ['SFG', 1958, 2025]],
  TBR: [['TBD', 1998, 2007], ['TBR', 2008, 2025]],
  TEX: [['WSA', 1961, 1971], ['TEX', 1972, 2025]],
  WSN: [['MON', 1969, 2004], ['WSN', 2005, 2025]],
};

/* THE THIRTY CLUBS PLAYING TODAY, and the only things One Franchise offers.
 *
 * Every earlier name is reached THROUGH the franchise that wears it now: the Boston
 * and Milwaukee Braves are the Atlanta Braves, the Montreal Expos are the Washington
 * Nationals, the St. Louis Browns are the Baltimore Orioles. The picker used to list
 * those fifteen a second time as cards of their own, which made one club two entries
 * and asked a reader to know that the Browns and the Orioles are the same history.
 *
 * It is a LIST rather than a filter on the pool, because the two questions are not
 * the same. "Which clubs may be drafted" is a fact about the league today; "which
 * clubs have enough men to fill a roster" is a fact about the data, and leaving the
 * first to fall out of the second is how a Negro League club or a Federal League
 * club appears the day somebody loosens a depth gate. Every key of FRANCHISES is in
 * here, and check-franchise.mjs holds the two together. */
const CURRENT_FRANCHISES = [
  'ARI', 'ATH', 'ATL', 'BAL', 'BOS', 'CHC', 'CHW', 'CIN', 'CLE', 'COL',
  'DET', 'HOU', 'KCR', 'LAA', 'LAD', 'MIA', 'MIL', 'MIN', 'NYM', 'NYY',
  'PHI', 'PIT', 'SDP', 'SEA', 'SFG', 'STL', 'TBR', 'TEX', 'TOR', 'WSN',
];

/* Does this club-season belong to this franchise? `fran` is normally one of the
 * thirty above. A BARE CODE still answers for itself, which the picker no longer
 * needs and a SAVED RUN does: a run started when the picker offered the Brooklyn
 * Dodgers on their own carries `franchise: 'BRO'`, and that run has to go on
 * drawing Brooklyn rather than quietly becoming a Los Angeles run or drawing
 * nothing at all. */
function inFranchise(fran, team, season) {
  const rows = FRANCHISES[fran];
  if (!rows) return team === fran;
  for (const [code, from, to] of rows) {
    if (code === team && season >= from && season <= to) return true;
  }
  return false;
}

/* Which franchise a club-season belongs to, as the code that franchise wears
 * today. The season is required and is not decoration: BAL in 1914 is a club
 * that folded and BAL in 1970 is the Orioles. */
function franchiseOf(team, season) {
  for (const fran of Object.keys(FRANCHISES)) {
    if (inFranchise(fran, team, season)) return fran;
  }
  /* A CODE THAT IS ITSELF A FRANCHISE KEY, IN A SEASON THAT KEY DOES NOT CLAIM,
     IS A DIFFERENT CLUB WEARING THE SAME THREE LETTERS. Returning the bare code
     here folded the 1914 Federal League Terrapins into the Baltimore Orioles: the
     picker counted their seasons on the Orioles card and the chemistry linked a
     Terrapin to an Oriole. Found by the guard rather than by reading, because a
     card one season wide of the truth looks exactly like a card.
     The star cannot collide with a real code, and it is ONE bucket rather than one
     per season, because the Terrapins were a club for two years and their own two
     seasons really are team-mates. */
  return FRANCHISES[team] ? team + '*' : team;
}

/* The codes a franchise has worn, oldest first, for the card and the guard. */
function franchiseCodes(fran) {
  const rows = FRANCHISES[fran];
  if (!rows) return [fran];
  const seen = [];
  for (const [code] of rows) if (!seen.includes(code)) seen.push(code);
  return seen;
}

/* Salary Cap Survivor.
 *
 * The draft is the same. What changes is that the roster does not stay bought:
 * five times across the season the market moves, somebody's number goes up, and if
 * that puts you over the cap you give a player away. The one you cut is replaced by
 * a league-minimum body, so the roster stays legal and the cost is felt in the runs
 * rather than in an error message.
 *
 * Shocks land on a fixed schedule so every run of this mode has the same shape, and
 * the raise is drawn from the run's own seeded rng so a replay is a replay. */
const MARKET = {
  GAMES: [18, 47, 76, 105, 134],   // five shocks, roughly a month apart
  RAISE_MIN: 0.18,
  RAISE_MAX: 0.62,
  MIN_RAISE_MUSD: 1.5,
};

/* A league-minimum body. Zero WAR, a million dollars, eligible where it has to be.
 * Not a real person: the name says so, because putting a real player's name on a
 * scrub would be a lie about that player. */
function replacementFor(slotName, season) {
  const pitcher = slotName === 'SP1' || slotName === 'SP2' || slotName === 'CL';
  const base = slotName.replace(/[12]$/, '');
  return {
    i: 'repl_' + base.toLowerCase(),
    n: 'Replacement ' + base,
    s: season || 2025,
    t: 'FA',
    r: pitcher ? 'p' : 'b',
    p: 1.0,
    w: 0.0,
    pp: base,
    ep: pitcher ? (base === 'CL' ? 'CL;RP' : 'SP') : base,
    _repl: true,
  };
}

/* Was this club in this division that season? */
function inDivision(division, team, season) {
  const rows = DIVISIONS[division];
  if (!rows) return false;
  for (const [code, from, to] of rows) {
    if (code === team && season >= from && season <= to) return true;
  }
  return false;
}

/* The clubs a division has ever held, newest membership first, for the picker. */
function divisionClubs(division) {
  const rows = DIVISIONS[division] || [];
  return rows.slice().sort((a, b) => b[2] - a[2]).map(r => r[0]);
}

/* 12 roster slots per GDD §3. */
const SLOTS = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH', 'SP1', 'SP2', 'CL'];

/* All-Time Staff draws twelve arms instead: a five-man rotation, a six-man pen and
 * a closer. The lineup behind them is league average, so the whole season turns on
 * run prevention. Slot names stay unique because the draft keys a pick to its slot. */
const STAFF_SLOTS = ['SP1', 'SP2', 'SP3', 'SP4', 'SP5',
  'RP1', 'RP2', 'RP3', 'RP4', 'RP5', 'SU', 'CL'];
const STAFF_ELIGIBILITY = {
  SP1: ['SP'], SP2: ['SP'], SP3: ['SP'], SP4: ['SP'], SP5: ['SP'],
  /* A starter can work out of the pen, which is what the bullpen of an all-time
   * staff would actually look like, and without it the pen has far too thin a pool. */
  RP1: ['RP', 'CL', 'SP'], RP2: ['RP', 'CL', 'SP'], RP3: ['RP', 'CL', 'SP'],
  RP4: ['RP', 'CL', 'SP'], RP5: ['RP', 'CL', 'SP'],
  SU: ['RP', 'CL', 'SP'],
  CL: ['CL', 'RP'],
};
/* The slot list and eligibility a run plays under. */
function slotsForMode(staff) { return staff ? STAFF_SLOTS : SLOTS; }
function eligibilityForMode(staff) { return staff ? STAFF_ELIGIBILITY : SLOT_ELIGIBILITY; }

/* ─── SLOTS THE SIM CANNOT TELL APART ───
 *
 * staffEra and staffRunPrevention AVERAGE the five rotation slots together, and
 * average RP1 through RP5 and SU together. So a staff's five starters are one job
 * with five names, its six relievers are one job with six names, and where an arm
 * lands inside its group changes nothing the season reads. The base game is the
 * same story at a smaller size: SP1 and SP2 are its two starters and teamStrength
 * adds them.
 *
 * The chooser has to know, and IT CANNOT WORK THIS OUT FROM THE NAME. A regex on
 * the string is the version that shipped, and the strings do not carry the answer:
 * SP2 and SP5 are the same job, RP5 and SU are the same job, and nothing in either
 * pair of names says so. What it produced was a sheet offering nine doors into
 * three rooms, with SP2 missing from it while SP5 was on it, because the regex
 * stripped a trailing 1 or 2 and left every other digit alone.
 *
 * CL is deliberately on its own. It is the one arm read by name, in saveRate.
 */
const STAFF_SLOT_GROUP = {
  SP1: 'ROTATION', SP2: 'ROTATION', SP3: 'ROTATION', SP4: 'ROTATION', SP5: 'ROTATION',
  RP1: 'BULLPEN', RP2: 'BULLPEN', RP3: 'BULLPEN', RP4: 'BULLPEN', RP5: 'BULLPEN',
  SU: 'BULLPEN',
};
const BASE_SLOT_GROUP = { SP1: 'ROTATION', SP2: 'ROTATION' };
function slotGroup(slotName, staff) {
  const m = staff ? STAFF_SLOT_GROUP : BASE_SLOT_GROUP;
  return m[slotName] || slotName;
}

/* What positions can fill each slot.
 * Hitter positions are currently blank in the data (pending Lahman),
 * so until POSITIONS_AVAILABLE is true, all batters can fill any fielding slot.
 * SP1/SP2 take starting pitchers; CL takes closers (RP/CL flagged). */
const SLOT_ELIGIBILITY = {
  C:   ['C'],
  '1B': ['1B'],
  '2B': ['2B'],
  '3B': ['3B'],
  SS:  ['SS'],
  LF:  ['LF', 'OF'],
  CF:  ['CF', 'OF'],
  RF:  ['RF', 'OF'],
  DH:  ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH', 'OF', 'IF'],
  SP1: ['SP'],
  SP2: ['SP'],
  CL:  ['CL', 'RP'],
};

/* When true, hitter slots are position-locked via eligible_pos.
 * When false (v1, no Lahman data), any batter can fill any fielding/DH slot. */
let POSITIONS_AVAILABLE = true;

function setPositionsAvailable(v) { POSITIONS_AVAILABLE = !!v; }

function respinCost(used) {
  const L = CONSTANTS.RESPIN_LADDER_MUSD;
  return L[Math.min(used, L.length - 1)];
}

function respinFees(used) {
  let total = 0;
  for (let i = 0; i < used; i++) total += respinCost(i);
  return total;
}

// ─── randomness ──────────────────────────────────────────────────────────────

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
  if (mean <= 0) return 0;
  if (!sd || sd <= 0) return mean;
  const variance = sd * sd;
  const shape = (mean * mean) / variance;
  const scale = variance / mean;
  return gammaShape(shape, rng) * scale;
}

// ─── player pool / data indexing ─────────────────────────────────────────────

/* Determine what slot(s) a player can fill. */
function playerPositions(player) {
  if (player.r === 'p') {
    if (player.ep === 'SP') return ['SP'];
    if (player.cl || (player.ep && player.ep.includes('CL'))) return ['CL', 'RP'];
    if (player.ep === 'RP') return ['RP'];
    return ['SP'];
  }
  // Batter
  if (POSITIONS_AVAILABLE && player.ep) {
    return player.ep.split(';').map(s => s.trim()).filter(Boolean);
  }
  // No position data: any fielding slot or DH
  return ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'];
}

/* Can this player fill this slot? */
function canFillSlot(player, slotName, elig) {
  const eligible = (elig || SLOT_ELIGIBILITY)[slotName];
  if (!eligible) return false;
  const positions = playerPositions(player);
  return positions.some(pos => eligible.includes(pos));
}

/* ─── PRIMARY POSITION ───
 *
 * A hitter is worth his full WAR at the position he actually played that season
 * (`pp`) and a little less anywhere else he is eligible. Before this the slot a man
 * stood in changed nothing: offense and defense both summed raw WAR, so putting a
 * shortstop at first cost exactly what putting him at short did, and the choice
 * the field asks for was not a choice.
 *
 * `pp` of OF is Baseball-Reference's "outfield" without a corner named, so any of
 * the three outfield spots is his. DH is the slot for anybody, and a fielder
 * standing there has given up his glove, so it is off-position for everyone but a
 * man whose season WAS the DH. Pitchers are placed by the staff rules and are never
 * off-position. A row with no `pp` is a Negro Leagues season Lahman cannot place,
 * so there is nothing to be off of.
 *
 * `slotWar` is the one reading, used by the offense and the defense the season runs
 * on. `squadRating` deliberately does NOT use it: that is the yardstick against real
 * clubs, whose men all played their own positions. */
const POSITION_FIT = {
  /* The share of a hitter's WAR lost off his position. A 10 WAR season loses 0.8,
   * about a win; a role player loses a tenth. Slight on purpose: the eligibility
   * list already says he really played there. */
  OFF: 0.08,
};

function slotBase(slotName) { return String(slotName || '').replace(/\d+$/, ''); }

function primaryAt(player, slotName) {
  if (!player || player.r !== 'b' || player._repl) return true;
  if (!player.pp || !slotName) return true;
  const base = slotBase(slotName);
  if (player.pp === base) return true;
  if (player.pp === 'OF' && (base === 'LF' || base === 'CF' || base === 'RF')) return true;
  return false;
}

function slotWar(player, slotName) {
  if (!player) return 0;
  const s = slotName || player._slot;
  if (primaryAt(player, s)) return player.w;
  return player.w - Math.abs(player.w) * POSITION_FIT.OFF;
}

/* Build the team-season ID from team + season. */
function teamSeasonId(team, season) {
  return `${team}_${season}`;
}

/*
 * Index the raw player array into lookup structures for the draft.
 * Mirrors football's prepareData().
 */
function indexData(players) {
  const byTeamSeason = {};
  const teamSeasons = [];
  const allPlayers = {};
  const sideSeen = {};

  for (const p of players) {
    const tsId = teamSeasonId(p.t, p.s);
    /* Role is part of the key: two-way players (e.g. 1919 Ruth) have both
     * a batter and a pitcher row for the same season, and they must not
     * collide or the board can resolve a click to the wrong row. */
    const key = `${p.i}|${p.s}|${p.r}`;
    allPlayers[key] = p;

    const sk = `${p.i}|${p.s}`;
    sideSeen[sk] = (!sideSeen[sk] || sideSeen[sk] === p.r) ? p.r : 'both';

    if (!byTeamSeason[tsId]) byTeamSeason[tsId] = [];
    byTeamSeason[tsId].push(p);
  }

  /* A two-way season arrives as two rows, one per side of the ball, because a
   * draft has to put a man in one slot. So the WAR on each row is HALF of what
   * a lookup shows for that season: Ohtani 2023 is 6.11 as a batter and 3.80 as
   * a pitcher against Baseball-Reference's combined figure. 42 seasons in the
   * pool are like this, and two of them are Ruth and Ohtani, so the row carries
   * which half it is and the page says so. Marked here rather than at build
   * time because it is derivable from the pool and a second copy would drift. */
  for (const p of players) {
    if (sideSeen[`${p.i}|${p.s}`] === 'both') p.half = p.r === 'b' ? 'batting' : 'pitching';
  }
  setCareers(players);

  // Only real rosters are spinnable: skip TOT (Baseball-Reference's
  // multi-team season totals, not an actual club) and team-seasons with
  // too few players to make a meaningful draw.
  const MIN_SPIN_ROSTER = 10;
  for (const roster of Object.values(byTeamSeason)) {
    const first = roster[0];
    if (first.t === 'TOT' || roster.length < MIN_SPIN_ROSTER) continue;
    teamSeasons.push({
      team_season_id: teamSeasonId(first.t, first.s),
      team: first.t,
      season: first.s,
      display: `${first.s} ${first.t}`,
    });
  }

  // Sort each team-season's players cheapest first (for floor calculations)
  for (const ts of Object.values(byTeamSeason)) {
    ts.sort((a, b) => a.p - b.p);
  }

  // Build cheapBy for reserve floor calculations
  const cheapBy = buildCheapBy(players);

  // Strength model: every spinnable team-season gets an offense/defense
  // estimate and a 0-100 rating from its own best lineup. These drive real
  // opponents (schedule) and national ranking (résumé): the "how good was
  // this really" layer that replaces flat win thresholds.
  const teamStats = {};
  const ratingTable = [];
  for (const ts of teamSeasons) {
    const roster = byTeamSeason[ts.team_season_id];
    const st = teamStrength(roster);
    st.rating = overallRating(teamWinPct(st.offense, st.defense));
    ts.rating = st.rating;
    ts.offMean = st.offense;
    ts.defMean = st.defense;
    teamStats[ts.team_season_id] = st;
    ratingTable.push(st.rating);
  }
  ratingTable.sort((a, b) => a - b);
  const oppPool = buildOpponentPool(teamSeasons);

  // Position scarcity: how many elite (6+ WAR) seasons can fill each slot.
  // Catchers and closers are rare; outfielders and DH abundant. Drives the
  // draft's "premium spot" nudge so you grab scarce positions when you can.
  const eliteBySlot = {};
  for (const slot of SLOTS) eliteBySlot[slot] = 0;
  for (const p of players) {
    if (p.t === 'TOT' || p.w < 6) continue;
    for (const slot of SLOTS) {
      if (slot === 'DH') continue; // everyone fills DH; not a scarcity signal
      if (canFillSlot(p, slot)) eliteBySlot[slot]++;
    }
  }
  // Scarcest slots (fewest elite options) get flagged premium.
  const scarcity = {};
  for (const slot of SLOTS) {
    const n = eliteBySlot[slot];
    scarcity[slot] = { elite: n, premium: slot !== 'DH' && n <= 60 };
  }

  return {
    players,
    allPlayers,
    byTeamSeason,
    teamSeasons,
    cheapBy,
    teamStats,
    ratingTable,
    oppPool,
    scarcity,
  };
}

/*
 * A team-season's implied strength if you drafted its best lineup: top 9
 * hitters for offense, top 2 starters + closer for run prevention. Uses the
 * same run-model formulas the season sim uses, so opponents are self-
 * consistent with your own roster.
 */
function teamStrength(players) {
  const hitters = players.filter(p => p.r === 'b').sort((a, b) => b.w - a.w).slice(0, 9);
  const sps = players.filter(p => p.r === 'p' && playerPositions(p).includes('SP'))
    .sort((a, b) => b.w - a.w);
  const hitWar = hitters.reduce((s, p) => s + p.w, 0);
  const offense = REPLACEMENT_RPG + hitWar * WAR_TO_RPG;

  const spEra = (sp) => sp ? Math.max(1.6, 5.0 - sp.w * 0.32) : CONSTANTS.FILLER_ERA;
  const anchorShare = 1 - CONSTANTS.FILLER_IP_SHARE;
  const staffEra = (spEra(sps[0]) + spEra(sps[1])) / 2 * anchorShare
    + CONSTANTS.FILLER_ERA * CONSTANTS.FILLER_IP_SHARE;
  const baseRA = staffEra * 1.08;
  const defWar = hitters.reduce((s, p) => s + Math.max(0, p.w - 2) * 0.15, 0);
  const defMod = Math.max(0.85, 1.0 - defWar * 0.005);
  const defense = baseRA * defMod;

  return { offense, defense, hitWar };
}

/* Expected win% for an offense/defense pair against the average all-time
 * opponent (Pythagorean, opponent-quality-adjusted like the real sim). */
function teamWinPct(offense, defense) {
  const N = CONSTANTS.OPP_RUNS_MEAN;
  const rf = offense * (CONSTANTS.OPP_DEF_MEAN / N);
  const ra = defense * (CONSTANTS.OPP_OFF_MEAN / N);
  return pythagorean(rf, ra);
}

/* Map an expected win% to a 0-100 team rating. Calibrated so ~.500 baseball
 * sits near 50, a 100-win team near 80, and the 116-win record near 98. */
function overallRating(winPct) {
  const wins = winPct * CONSTANTS.REGULAR_SEASON_GAMES;
  const r = (wins - 62) * (100 / 58) + 47;
  return Math.max(1, Math.min(100, Math.round(r * 10) / 10));
}

/* The rating and all-time rank the player is shown.
 *
 * Every real team-season in ratingTable is scored by teamStrength(), which
 * reads a roster's top nine bats and top two starters and applies neither a
 * chemistry nor a roster-shape multiplier. A drafted squad used to be scored
 * by its own pipeline instead, which applies both, so the two numbers were on
 * different scales: real clubs' projections median out near 64 wins and a
 * drafted squad's near 88, which lifted the squad clear of all 2,594 real
 * clubs. It billed 63% of finished seasons as the greatest team of all time,
 * printed directly above records like 74-88.
 *
 * So the shown rating scores the squad the same way the field is scored.
 * Chemistry and roster shape still do all their work: they move the runs the
 * team scores and therefore the record. They just stop being counted twice,
 * once in the season and again in the yardstick it is measured against. */
function squadRating(roster) {
  const st = teamStrength(roster);
  return overallRating(teamWinPct(st.offense, st.defense));
}

/*
 * THE NUMBER THE PLAYER IS SHOWN, and it is a different job from squadRating().
 *
 * squadRating() exists to put a drafted squad on the same yardstick as the 2,594
 * real team-seasons it is ranked against, so it reads what a real club has: nine
 * bats and two starters. That means it is blind to chemistry, to roster shape and
 * to the closer, which is most of what decides the season. Measured over ninety
 * drafts, three rosters inside 0.4 rating points of each other projected to 68,
 * 81 and 96 wins. A player was shown 94 above a 79-83 record and was right to
 * call it nonsense.
 *
 * So the shown rating is built from the offense and defense the season actually
 * runs on, which correlates .997 with the wins it produces, and then says what it
 * means in wins.
 *
 * TWO NUMBERS, TWO JOBS, and neither is allowed to do the other's:
 *   squadRating  the all-time rank, and the title difficulty in generatePlayoffs
 *   teamRating   the rating on the results and squad screens, and the badges
 * Do not merge them. The rank needs the same yardstick as the field, the shown
 * rating needs to predict the season, and no one number does both.
 */
const PROJ = {
  /* Pythagorean expectation understates the spread this game's schedule
   * produces: fitted over 220 drafted rosters against the season simulator,
   * rms 1.5 wins. Refit rather than nudged if the run model changes.
   *
   * RE-MEASURED over 208 rosters swept across eight drafting-quality levels,
   * from a bot holding back 94% of its budget to one spending the cap, each
   * played for 16 seasons: actual = 1.019 * projected + 1.61, rms 1.60 wins,
   * over a range of 50 to 107 actual wins. The projection is sound across the
   * whole range a draft can reach, so it was left alone and only the anchors
   * below moved. */
  SLOPE: 1.5047,
  INTERCEPT: -50.51,
  /*
   * THE SCALE IS ANCHORED ON WHAT A DRAFT CAN ACTUALLY PRODUCE, at both ends.
   *
   * It used to hang on 88 wins = 50 and 116 wins = 100, both of them real
   * things (the wild card line, and the all-time record). The trouble is that
   * a roster is not a real club: it is twelve men bought under a $170M cap,
   * and 116 wins is not on the menu. Measured over 240 drafts, four ways:
   *
   *     cheapest man every time   every run rated exactly 1.0
   *     best value per dollar     every run rated exactly 1.0
   *     at random                 median 6.5, best 49.4
   *     best available            median 37.5, best 71.4
   *
   * So the top 28 points were unreachable and the bottom was a WALL rather
   * than a scale: `Math.max(1, ...)` crushed every careless draft onto one
   * number, and two teams forty wins apart both read 1.0. A player reported a
   * 73-89 season rating 17 and was right that it meant nothing.
   *
   * Both ends are measured now, through the real draft loop:
   *
   *     FLOOR  take the worst man on every board, 60 drafts: 31 projected wins
   *     TOP    strong drafting, 250 drafts: p50 85, p95 98, best 106
   *
   * So 99 is the best roster this cap buys, reached about once in 250 good
   * drafts, and 1 is a draft nobody could do worse than. Every point between
   * is 0.77 of a win, and no part of the scale is unreachable in either
   * direction. Re-measure both ends if the cap or the player pool moves: they
   * are facts about the draft, not preferences. */
  FLOOR_WINS: 31, FLOOR_RATING: 1,
  TOP_WINS: 106, TOP_RATING: 99,
};

/* What a roster projects to win over 162, on this game's schedule. */
function projectedWins(offense, defense) {
  return PROJ.SLOPE * (teamWinPct(offense, defense) * CONSTANTS.REGULAR_SEASON_GAMES)
    + PROJ.INTERCEPT;
}

function teamRating(offense, defense) {
  const w = projectedWins(offense, defense);
  const k = (PROJ.TOP_RATING - PROJ.FLOOR_RATING) / (PROJ.TOP_WINS - PROJ.FLOOR_WINS);
  const r = (w - PROJ.FLOOR_WINS) * k + PROJ.FLOOR_RATING;
  return Math.max(PROJ.FLOOR_RATING, Math.min(PROJ.TOP_RATING, Math.round(r * 10) / 10));
}

/* National rank: where a finished season's rating places among all
 * spinnable team-seasons (1 = best ever). */
function nationalRank(rating, ratingTable) {
  if (!ratingTable || !ratingTable.length) return null;
  // ratingTable is ascending; count how many are strictly better.
  let lo = 0, hi = ratingTable.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (ratingTable[mid] <= rating) lo = mid + 1; else hi = mid;
  }
  const better = ratingTable.length - lo;
  return better + 1;
}

/* For each position, the cheapest players sorted by price. */
function buildCheapBy(players) {
  const byPos = {};
  for (const p of players) {
    const positions = playerPositions(p);
    for (const pos of positions) {
      if (!byPos[pos]) byPos[pos] = [];
      byPos[pos].push({
        id: `${p.i}|${p.s}|${p.r}`,
        ts: teamSeasonId(p.t, p.s),
        price: p.p,
      });
    }
  }
  for (const pos of Object.keys(byPos)) {
    byPos[pos].sort((a, b) => a.price - b.price);
    byPos[pos] = byPos[pos].slice(0, 200);
  }
  return { '*': byPos };
}

// ─── chemistry ───────────────────────────────────────────────────────────────

const CHEMISTRY = {
  VALUES: {
    /* Family is a real, rare, cross-era bond the formula can't infer. The
     * strongest link, because drafting two brothers is a genuine story. */
    family:    0.09,
    reunion:   0.08,
    battery:   0.07,
    dp_combo:  0.06,
    /* Real team-mates drafted from different seasons: Ted Williams '46 and
     * Johnny Pesky '50 wore the same shirt the same summers. Between a reunion
     * (the same drafted season) and a bare franchise tie. */
    teammates: 0.05,
    franchise: 0.03,
    /* Era is a weak ambient link, kept small so the deliberate links
     * (family/reunion/battery/DP) are what actually move the needle. */
    era:       0.005,
  },
  MIN: -0.10,
  MAX: 0.15,
};

/* Curated real-life relationships (families), loaded from data/chemistry.json.
 * A symmetric map: player id -> { otherId -> label }. */
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
/* WHO ACTUALLY PLAYED TOGETHER.
 *
 * Reunion, battery and the double-play combo used to need the two men drafted
 * from the SAME team-season. A board is one team-season and a pick uses it up, so
 * the only way to meet that was the same club being drawn twice: measured over 120
 * drafts, reunion lit on 3% of rosters and the battery and the DP combo on 1%.
 * Three of six links were decoration.
 *
 * A career is every franchise-season a man has a row in. Two men who share one
 * were real team-mates, whichever of their seasons was drafted, and that is the
 * bond the battery and the DP combo were always about. The pool is the build's own
 * WAR floor, so a season a man barely played is not in it and does not count;
 * that under-counts a little and never invents a pairing. */
let CAREERS = {};
function setCareers(players) {
  CAREERS = {};
  for (const p of players) {
    if (p.t === 'TOT' || p.t === 'FA') continue;
    (CAREERS[p.i] = CAREERS[p.i] || new Set()).add(franchiseOf(p.t, p.s) + '|' + p.s);
  }
}
/* The first franchise-season two players shared, or null. */
function sharedSeason(a, b) {
  if (!a || !b || a.i === b.i) return null;
  const A = CAREERS[a.i], B = CAREERS[b.i];
  if (!A || !B) return null;
  let first = null;
  const [small, big] = A.size <= B.size ? [A, B] : [B, A];
  for (const k of small) {
    if (!big.has(k)) continue;
    const yr = +k.split('|')[1];
    if (!first || yr < first.yr) first = { key: k, yr };
  }
  return first;
}

/* What a player is doing on this roster, for the links that name positions. A
 * placed man is read off his slot, so a shortstop drafted and put at first is not
 * half of a double-play combo; an unplaced one (a preview) off his eligibility. */
function playsAs(p, pos) {
  if (p._slot) {
    const base = slotBase(p._slot);
    if (pos === 'P') return p.r === 'p';
    return base === pos;
  }
  if (pos === 'P') return p.r === 'p';
  return playerPositions(p).includes(pos);
}

function familyLink(a, b) {
  const m = CURATED_FAMILY[a.i];
  return m && m[b.i] ? m[b.i] : null;
}

/*
 * Baseball chemistry per GDD §10:
 * - Reunion: same team + same season (e.g. three '27 Yankees)
 * - Franchise loyalty: same team, different seasons
 * - DP combo: 2B + SS from the same team-season
 * - Battery: C + pitcher from same team-season
 * - Era: within 3 seasons of each other
 */
/* A bond a mode hands you for free is not a bond.
 *
 * In Eras Mode every pair is inside one decade, so the "same era" link fires on
 * nearly all 66 pairs whatever you draft. In One Franchise every pair shares the
 * club by construction. Left in, those links push a constrained run straight to the
 * chemistry cap, which is worth about 21 wins: measured, Eras and Division runs came
 * out at 100-104 mean wins against the core game's 89 while carrying LESS talent and
 * a LOWER rating. The constraint was paying better than it cost.
 *
 * So a mode suppresses the link its own rule guarantees. The Perfect Season does the
 * same thing for the same reason. What remains is what you actually chose: the
 * batteries, the double-play combos, the families, and the clubs you chose to stack
 * inside a pool that did not force you to. */
function suppressedIn(opts) {
  return (opts && opts.suppress) || [];
}

function pairLinks(a, b, opts) {
  /* A REPLACEMENT IS NOBODY, AND NOBODY HAS TEAM-MATES. Every league-minimum
   * body carries t:'FA' and the cut man's season, so two of them read as the
   * same franchise, often the same season: a Cap Survivor that cut seven men
   * measured 62 of its 66 links BETWEEN replacements ("1985 FA reunion"),
   * saturated the +15% cap, drew "Great clubhouse chemistry" over a roster of
   * scrubs, and lit five chemistry badges for the cutting. Nothing threw and
   * every label was a well-formed label. Cutting a player must cost, which is
   * cutPlayer's own header, and this was the mechanic quietly paying it back. */
  if (a._repl || b._repl) return [];
  const off = suppressedIn(opts);
  const links = [];
  /* SAME FRANCHISE, NOT SAME CODE. Written `a.t === b.t` a rename made two
     team-mates strangers: a 2011 Marlin (FLA) and a 2013 Marlin (MIA) shared no
     link, nor a 1952 Boston Brave and a 1954 Milwaukee Brave. See FRANCHISES.
     `sameSeason` still guards the reunion and the double-play combo below, and a
     club cannot wear two codes in one year, so those are unaffected. */
  const franA = franchiseOf(a.t, a.s);
  const sameTeam = franA === franchiseOf(b.t, b.s);
  const sameSeason = a.s === b.s;

  // Family: a real relationship across any team or season (e.g. two Alous).
  const fam = familyLink(a, b);
  if (fam) {
    links.push({ type: 'family', value: CHEMISTRY.VALUES.family, label: fam });
  }

  if (sameTeam && sameSeason) {
    links.push({ type: 'reunion', value: CHEMISTRY.VALUES.reunion,
      label: `${a.s} ${a.t} reunion` });
  }

  /* Real team-mates from different drafted seasons. Checked before the bare
     franchise tie, which it replaces: two men who shared a clubhouse are more
     than two men who wore the same shirt decades apart. */
  const shared = (sameTeam && sameSeason) ? { yr: a.s } : sharedSeason(a, b);
  if (shared && !(sameTeam && sameSeason)) {
    links.push({ type: 'teammates', value: CHEMISTRY.VALUES.teammates,
      label: `Team-mates in ${shared.yr}` });
  }

  if (sameTeam && !sameSeason && !shared) {
    /* Name the code they actually shared when they shared one, and the franchise
       only when they did not. Two 1950s Boston Braves reading "ATL franchise"
       would be a link telling a reader something that never happened to them. */
    links.push({ type: 'franchise', value: CHEMISTRY.VALUES.franchise,
      label: `${a.t === b.t ? a.t : franA} franchise` });
  }

  // DP combo: a second baseman and a shortstop who really played together.
  if (shared && ((playsAs(a, '2B') && playsAs(b, 'SS')) || (playsAs(a, 'SS') && playsAs(b, '2B')))) {
    links.push({ type: 'dp_combo', value: CHEMISTRY.VALUES.dp_combo,
      label: 'Double-play combo' });
  }

  // Battery: a catcher and a pitcher who really played together.
  if (shared && ((playsAs(a, 'C') && playsAs(b, 'P')) || (playsAs(a, 'P') && playsAs(b, 'C')))) {
    links.push({ type: 'battery', value: CHEMISTRY.VALUES.battery,
      label: 'Batterymates' });
  }

  // Era: within 3 years
  if (Math.abs(a.s - b.s) <= 3 && !(sameTeam && sameSeason)) {
    links.push({ type: 'era', value: CHEMISTRY.VALUES.era,
      label: 'Same era' });
  }

  if (off.length) return links.filter(l => off.indexOf(l.type) === -1);

  return links;
}

function resolveChemistry(roster, opts) {
  const links = [];
  for (let i = 0; i < roster.length; i++) {
    for (let j = i + 1; j < roster.length; j++) {
      const plinks = pairLinks(roster[i], roster[j], opts);
      for (const l of plinks) {
        // ai/bi are roster positions. Names alone cannot attribute a link when
        // a roster holds two players of the same name, which real data does.
        links.push({ ...l, a: roster[i].n, b: roster[j].n, ai: i, bi: j });
      }
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

/* Chemistry as points, for display.
 *
 * The VALUES above are already written as hundredths, so reading one as a whole
 * number of points is not a re-scaling, it is just dropping the percent sign:
 * family 0.09 is +9, a franchise tie 0.04 is +4, the ambient era link 0.005 is
 * +0.5. The cap is +15. That gives the player a small integer to compare
 * against, instead of a single team-wide percentage that never explains itself. */
function chemPoints(value) {
  return Math.round(value * 1000) / 10;
}

/* Chemistry attributed to each player on the roster.
 *
 * Every link pays both ends, so a player's total is the sum of every link they
 * appear in, and the totals deliberately add up to more than the team's raw
 * figure. That is the honest shape of the mechanic: a bond is a bond between
 * two players, and both of them are better for it.
 *
 * Returns one entry per roster position: total points, the links themselves,
 * the strongest single link (what the UI colors the badge by), and keyPoints,
 * which drops the ambient era link. Era is +0.5 against a cap of +15 and it
 * attaches to nearly everybody, so badging it would put a meaningless mark on
 * ten of twelve players and drown the bonds that were actually chosen. */
function chemistryByPlayer(roster, resolved, opts) {
  const res = resolved || resolveChemistry(roster, opts);
  const out = roster.map(() => ({ points: 0, keyPoints: 0, links: [], top: null }));
  for (const l of res.links) {
    if (l.value <= 0) continue;
    for (const idx of [l.ai, l.bi]) {
      if (typeof idx !== 'number' || !out[idx]) continue;
      const e = out[idx];
      e.points += chemPoints(l.value);
      if (l.type !== 'era') e.keyPoints += chemPoints(l.value);
      e.links.push(l);
      if (!e.top || l.value > e.top.value) e.top = l;
    }
  }
  for (const e of out) {
    e.points = Math.round(e.points * 10) / 10;
    e.keyPoints = Math.round(e.keyPoints * 10) / 10;
  }
  return out;
}

/* What chemistry is actually worth to this roster, in wins.
 *
 * The team rating deliberately excludes chemistry, because it is measured
 * against real clubs that are scored without it (see squadRating). So chemistry
 * never shows up in the headline number, only in the record, where the player
 * cannot see how much of the record it bought. This states it outright: play
 * the same roster with the bonus and without it, and take the difference. */
function chemistryWorth(roster, slotNames, opts) {
  const tagged = roster.map((p, i) => ({
    ...p, _slot: (slotNames && slotNames[i]) || p._slot || SLOTS[i],
  }));
  const chem = resolveChemistry(tagged, opts);
  const structure = rosterStructure(tagged);
  const winsAt = (mult) => teamWinPct(
    rosterOffense(tagged, mult, structure.multiplier),
    rosterRunPrevention(tagged, mult)
  ) * CONSTANTS.REGULAR_SEASON_GAMES;
  const withChem = winsAt(chem.multiplier);
  const without = winsAt(1);
  return {
    multiplier: chem.multiplier,
    wins: Math.round((withChem - without) * 10) / 10,
    points: chemPoints(chem.net),
  };
}

// ─── season simulation (GDD §7) ─────────────────────────────────────────────

/*
 * OFFENSE: BaseRuns / linear-weights estimate.
 *
 * A roster's run-scoring is derived from the 9 hitters' WAR values.
 * WAR already encodes runs above replacement; we convert team total WAR
 * to expected runs/game using historical MLB calibration:
 *   - Replacement-level team: ~48 wins in 162 games, ~3.5 R/G
 *   - Each additional WAR ≈ +10 runs per 162 games ≈ +0.062 R/G
 *
 * With chemistry and batting order bonuses applied.
 */

const REPLACEMENT_RPG = 3.5;
const WAR_TO_RPG = 0.062;

function rosterOffense(roster, chemMultiplier, battingOrderBonus) {
  const hitters = roster.filter(p => p.r === 'b');
  const totalWar = hitters.reduce((s, p) => s + slotWar(p), 0);
  const baseRPG = REPLACEMENT_RPG + totalWar * WAR_TO_RPG;
  return baseRPG * chemMultiplier * (battingOrderBonus || 1.0);
}

/* THE WAR A DRAFTED STARTER IS BOTH PRICED ON AND RATED ON.
 *
 * WAR is a COUNTING stat and an ERA is a RATE, so turning a whole season's WAR
 * straight into an ERA over-credits whoever threw the most innings: Walter
 * Johnson's 1913 is 15.2 WAR over 346 innings, and read as a rate that is a 0.14
 * ERA before the floor catches it.
 *
 * `build_positions.py` already knew this and PRICED a heavy starter on
 * `w * ANCHOR_IP/ip`, which is what he did at a standard workload. The engine did
 * not: `spEra` read the raw figure. So the two halves of the same man disagreed,
 * and the gap was a straight arbitrage rather than a rounding difference.
 * MEASURED over the shipped pool, holding the price band fixed, a starter over
 * 210 innings bought a better ERA than a light one at the same price in every
 * band there is: 0.30 better under $10M, 0.32 at $10-20M, 0.47 at $20-30M and
 * 0.50 at $30-45M. A drafter comparing two arms at one price had no way to see
 * it and no reason to take the light one, ever.
 *
 * REAL CLUBS ARE NOT NORMALISED, and `teamStrength` deliberately still reads the
 * raw figure. The 1908 White Sox really did get 464 innings of Ed Walsh, so the
 * all-time table they are ranked in is right to count them. A DRAFTED roster is
 * buying a standard season at a standard price, which is a different question.
 */
function workloadWar(p) {
  if (!p) return 0;
  if (p.r !== 'p' || p.pp !== 'SP') return p.w;
  if (!p.ip || p.ip <= CONSTANTS.ANCHOR_IP) return p.w;
  return p.w * (CONSTANTS.ANCHOR_IP / p.ip);
}

/*
 * PITCHING + DEFENSE: Run prevention.
 *
 * SP1 and SP2 are rotation anchors (GDD §8). They cover ~45% of innings
 * between them; the rest is league-average filler.
 *
 * The closer converts save situations, and a bad closer literally blows wins.
 *
 * Team defense from fielders' WAR provides a modifier.
 */
function rosterRunPrevention(roster, chemMultiplier) {
  const sp1 = roster.find(p => p._slot === 'SP1');
  const sp2 = roster.find(p => p._slot === 'SP2');
  const closer = roster.find(p => p._slot === 'CL');
  const fielders = roster.filter(p => p.r === 'b');

  // SP ERA estimate from WAR: higher WAR = lower ERA.
  // Replacement pitcher ~5.0 ERA; floor of 1.60 keeps historic aces great
  // without making a two-ace staff untouchable.
  /* STAFF.SP_ERA_PER_WAR rather than a literal, because this reads workloadWar
     and so is the same fit staffEra is: see the constant for why the number
     that goes with the season line is not the number that goes with this one.
     teamStrength keeps the season line AND the old 0.32, deliberately, because
     a real club really did throw those innings. */
  const spEra = (sp) => {
    if (!sp) return CONSTANTS.FILLER_ERA;
    return Math.max(1.6, 5.0 - workloadWar(sp) * STAFF.SP_ERA_PER_WAR);
  };

  const sp1Era = spEra(sp1);
  const sp2Era = spEra(sp2);

  // Weighted staff ERA: SP1+SP2 cover 45%, filler covers 55%
  const anchorShare = 1 - CONSTANTS.FILLER_IP_SHARE;
  const staffEra = (sp1Era + sp2Era) / 2 * anchorShare + CONSTANTS.FILLER_ERA * CONSTANTS.FILLER_IP_SHARE;

  // Convert ERA to runs allowed per game (ERA ≈ earned runs/9IP, close to R/G)
  const baseRA = staffEra * 1.08; // unearned run factor

  // Defense modifier from fielders' WAR (each WAR saves ~10 runs/162 games)
  const defWar = fielders.reduce((s, p) => s + Math.max(0, slotWar(p) - 2) * 0.15, 0);
  const defMod = Math.max(0.85, 1.0 - defWar * 0.005);

  return baseRA * defMod * (2 - chemMultiplier);
}

/* ─── All-Time Staff ───────────────────────────────────────────────────────
 * You drafted twelve arms and no bats, so the lineup behind them is league
 * average and the season is decided entirely on run prevention. */
const STAFF = {
  /* The lineup behind the staff: as good as the average opponent's, not as good
   * as real baseball's average. Everything you face in this game is an all-time
   * club, so OPP_RUNS_MEAN (4.5, the real league) is a league you never play in,
   * and pinning the bats there costs about thirteen wins before a pitch is thrown.
   * Measured at 4.5 the mode ran a mean of 74.5 against the core game's 88.9, and
   * at the opponent mean of 5.34 it overshot to 94. At 5.0 it sits with the rest. */
  LINEUP_RPG: 5.0,
  /* Five starters carry about seventy percent of the innings, the pen the rest.
   * Relief WAR is compressed against starter WAR (fewer innings for the same
   * quality), so a reliever's ERA falls faster per win above replacement. */
  ROTATION_IP_SHARE: 0.70,
  /* THE STARTER COEFFICIENT IS FITTED AGAINST workloadWar AND THE OLD ONE WAS
   * FITTED AGAINST THE SEASON LINE. Changing what goes in without refitting
   * what it is multiplied by is not a re-ranking, it is a nerf: measured over
   * 400 drafted starters a side, the anchor takes a mean 5.42 WAR down to 4.53,
   * so at 0.32 every rotation in the game got 0.29 of ERA worse and the
   * quick badge sweep went from nothing dark to 21 badges nothing could light.
   * The ratio is 1.20 for the three bots that draft real players (best 1.220,
   * careful 1.196, arms 1.206) and near 1.0 for the two that draft nobody,
   * because a $3M arm never threw 300 innings; the three that matter are what
   * this is solved against, since they are what a person plays like.
   *
   * IT REINTRODUCES NOTHING, and that is the point worth being sure of. The
   * arbitrage was that at equal PRICE a heavy arm bought a better ERA, and the
   * price is built on workloadWar, so once the ERA is too, two men at one price
   * have one ERA whatever this constant is. The coefficient only sets the
   * LEVEL. Refit it, never nudge it, and refit it against drafted starters
   * rather than the whole pool: the pool is mostly men nobody signs. */
  SP_ERA_BASE: 5.0, SP_ERA_PER_WAR: 0.386, SP_ERA_FLOOR: 1.60,
  RP_ERA_BASE: 4.60, RP_ERA_PER_WAR: 0.55, RP_ERA_FLOOR: 1.35,
  /* The two ends of the rating scale, in blended ERA. See staffRating for how
   * they were measured and for what went wrong when only one end was. */
  FLOOR_ERA: 4.63, FLOOR_RATING: 1,
  TOP_ERA: 2.91, TOP_RATING: 99,
};
function staffOffense() { return STAFF.LINEUP_RPG; }

/* Runs allowed by a twelve-arm staff. Every slot pitches, so unlike the main
 * game there is no league-average filler soaking up half the innings: what you
 * drafted is what takes the ball. */
/* The staff's blended ERA: the number the whole mode turns on. */
function staffEra(roster) {
  /* workloadWar for the same reason rosterRunPrevention uses it: this turns a
     counting stat into a rate, and a starter's price already carries the anchor.
     It is a no-op for every reliever, who are priced raw and have no anchor. */
  const era = (p, base, per, floor) =>
    p ? Math.max(floor, base - Math.max(0, workloadWar(p)) * per) : base;
  const at = (slot) => roster.find(p => p._slot === slot);
  const rot = ['SP1', 'SP2', 'SP3', 'SP4', 'SP5'].map(at);
  const penArms = ['RP1', 'RP2', 'RP3', 'RP4', 'RP5', 'SU', 'CL'].map(at);
  const rotEra = rot.reduce((s, p) =>
    s + era(p, STAFF.SP_ERA_BASE, STAFF.SP_ERA_PER_WAR, STAFF.SP_ERA_FLOOR), 0) / rot.length;
  const penEra = penArms.reduce((s, p) =>
    s + era(p, STAFF.RP_ERA_BASE, STAFF.RP_ERA_PER_WAR, STAFF.RP_ERA_FLOOR), 0) / penArms.length;
  return rotEra * STAFF.ROTATION_IP_SHARE + penEra * (1 - STAFF.ROTATION_IP_SHARE);
}

/* A staff's 0-100 rating, on its own scale.
 *
 * It cannot borrow the team rating: that one is anchored to real team-seasons
 * scored by teamStrength, and a roster with no hitters is not one of those. Nor can
 * it be overallRating(winPct), which saturates at 100 for anything projecting 93+
 * wins and pinned twelve of thirty test staffs at exactly 100.
 *
 * SO IT IS ANCHORED ON WHAT THIS MODE PRODUCES, AT BOTH ENDS, which is teamRating's
 * own rule and is why that one was rescaled. The first version was `50 + (3.40 -
 * era) * 55`, fitted to a median blended ERA of 3.22 over 60 drafts at three
 * spending strategies. Two things moved under it since: the rotation auto-sort,
 * which puts the best arms in the five slots carrying 70% of the innings, and the
 * workload reading with its refitted coefficient. Re-measured over 640 drafts at
 * eight grades of drafting quality plus 900 more sweeping how much budget is held
 * back, that line had the same two defects teamRating had:
 *
 *     THE TOP WAS DEAD      the best staff any strategy reached is 2.93 ERA, which
 *                           that line puts at 75.9. The top 24 points could not be
 *                           lit by anybody, and holding money back does not help:
 *                           greedy reaches 2.93 and so does every budget share.
 *     THE BOTTOM WAS A WALL 196 of 640 pinned at exactly 1.0, so two staffs a third
 *                           of a run apart in ERA read the same number.
 *
 * Both ends are measured now. Re-measure them if the cap, the pool or the ERA
 * model moves: they are facts about the draft, not preferences. */
function staffRating(roster) {
  const era = staffEra(roster);
  const k = (STAFF.TOP_RATING - STAFF.FLOOR_RATING) / (STAFF.FLOOR_ERA - STAFF.TOP_ERA);
  const r = STAFF.FLOOR_RATING + (STAFF.FLOOR_ERA - era) * k;
  return Math.max(1, Math.min(100, Math.round(r * 10) / 10));
}

function staffRunPrevention(roster, chemMultiplier) {
  /* The same reading staffEra uses, or the rating a staff is SHOWN and the runs
     it actually gives up would be built from two different numbers. */
  const era = (p, base, per, floor) =>
    p ? Math.max(floor, base - Math.max(0, workloadWar(p)) * per) : base;
  const at = (slot) => roster.find(p => p._slot === slot);
  const rot = ['SP1', 'SP2', 'SP3', 'SP4', 'SP5'].map(at);
  const pen = ['RP1', 'RP2', 'RP3', 'RP4', 'RP5', 'SU'].map(at);
  const closer = at('CL');

  const rotEra = rot.reduce((s, p) =>
    s + era(p, STAFF.SP_ERA_BASE, STAFF.SP_ERA_PER_WAR, STAFF.SP_ERA_FLOOR), 0) / rot.length;
  /* The pen plus the closer, who also throws relief innings. */
  const penArms = pen.concat([closer]);
  const penEra = penArms.reduce((s, p) =>
    s + era(p, STAFF.RP_ERA_BASE, STAFF.RP_ERA_PER_WAR, STAFF.RP_ERA_FLOOR), 0) / penArms.length;

  const blended = rotEra * STAFF.ROTATION_IP_SHARE + penEra * (1 - STAFF.ROTATION_IP_SHARE);
  const baseRA = blended * 1.08;   // unearned runs, same factor as the main game
  return baseRA * (2 - chemMultiplier);
}

/*
 * ROSTER STRUCTURE (shape multiplier).
 *
 * WAR sum measures raw talent; structure measures how well that talent is
 * arranged. A great roster isn't just a pile of WAR: it balances bats and
 * arms, has no dead slots, and isn't one injury from collapse. This is the
 * "shape matters as much as talent" layer, applied to offense.
 *
 * Three factors, each 1.0 when ideal and <1.0 when off:
 *  - balance:       hitting/pitching WAR split near ideal
 *  - floor:         the bottom of the roster isn't near-replacement scrubs
 *  - concentration: not one boom-or-bust star carrying everything
 * Damped by SHAPE_STRENGTH so shape modulates rather than dominates, plus a
 * small archetype bonus for a coherent identity.
 */
/* Thresholds are calibrated to real 12-man drafted rosters: median top-player
 * share ~0.16, bottom-4 share ~0.16, pitching share ~0.25. */
const STRUCTURE = {
  MIN: 0.84, MAX: 1.08,
  CONCENTRATION_START: 0.20, CONCENTRATION_WEIGHT: 0.85,
  FLOOR_START: 0.10, FLOOR_WEIGHT: 1.15,
  IDEAL_PITCH_SHARE: 0.26, PITCH_TOLERANCE: 0.08, BALANCE_WEIGHT: 1.05,
  SHAPE_STRENGTH: 0.55,
  ARCHETYPE_BONUS: 0.025,
};

/* Name the roster's identity: flavor for the coach report, plus a small
 * cohesion bonus when the shape reads as a deliberate build. */
function detectArchetype(m) {
  if (m.topShare >= 0.24)
    return { key: 'one_man_show', name: 'One-Man Show', bonus: 0 };
  if (m.floorShare >= 0.19 && m.topShare <= 0.17)
    return { key: 'no_weak_links', name: 'No Weak Links', bonus: STRUCTURE.ARCHETYPE_BONUS };
  if (m.pitchShare <= 0.19 && m.floorShare >= 0.14)
    return { key: 'murderers_row', name: "Murderers' Row", bonus: STRUCTURE.ARCHETYPE_BONUS };
  if (m.pitchShare >= 0.36)
    return { key: 'aces_wild', name: 'Aces Wild', bonus: STRUCTURE.ARCHETYPE_BONUS * 0.5 };
  if (m.pitchShare >= 0.22 && m.pitchShare <= 0.30 && m.floorShare >= 0.14 && m.topShare <= 0.19)
    return { key: 'balanced', name: 'Balanced Contender', bonus: STRUCTURE.ARCHETYPE_BONUS };
  return { key: 'mixed', name: 'Mixed Bag', bonus: 0 };
}

function rosterStructure(roster) {
  const wars = roster.map(p => Math.max(0, p.w));
  const total = wars.reduce((s, w) => s + w, 0) || 1;
  const sorted = [...wars].sort((a, b) => b - a);

  const topShare = sorted[0] / total;
  const floorShare = sorted.slice(-4).reduce((s, w) => s + w, 0) / total;
  const pitchWar = roster.filter(p => p.r === 'p').reduce((s, p) => s + Math.max(0, p.w), 0);
  const pitchShare = pitchWar / total;

  const S = STRUCTURE;
  const conc = 1 - S.CONCENTRATION_WEIGHT * Math.max(0, topShare - S.CONCENTRATION_START);
  const floor = 1 - S.FLOOR_WEIGHT * Math.max(0, S.FLOOR_START - floorShare);
  const balance = 1 - S.BALANCE_WEIGHT *
    Math.max(0, Math.abs(pitchShare - S.IDEAL_PITCH_SHARE) - S.PITCH_TOLERANCE);

  const metrics = { topShare, floorShare, pitchShare };
  const archetype = detectArchetype(metrics);
  const shape = Math.max(0.3, conc) * Math.max(0.3, floor) * Math.max(0.3, balance);
  const multiplier = Math.max(S.MIN, Math.min(S.MAX,
    1 + (shape - 1) * S.SHAPE_STRENGTH + archetype.bonus));

  return { multiplier, archetype, conc, floor, balance, ...metrics };
}

/*
 * Closer save conversion rate.
 * Base rate + bonus from closer WAR.
 */
function closerSavePct(roster) {
  const closer = roster.find(p => p._slot === 'CL');
  if (!closer) return CONSTANTS.CLOSER_BASE_SAVE_PCT;
  return Math.min(0.95, CONSTANTS.CLOSER_BASE_SAVE_PCT + closer.w * CONSTANTS.CLOSER_WAR_SCALE);
}

/*
 * PYTHAGOREAN EXPECTATION: convert runs scored/allowed to expected win%.
 * winPct = RS^exp / (RS^exp + RA^exp), exp ≈ 1.83
 */
function pythagorean(runsScored, runsAllowed, exp) {
  const e = exp || CONSTANTS.PYTH_EXP;
  const rs = Math.pow(Math.max(0.1, runsScored), e);
  const ra = Math.pow(Math.max(0.1, runsAllowed), e);
  return rs / (rs + ra);
}

// ─── game resolution ─────────────────────────────────────────────────────────

function resolveGame(runsFor, runsAgainst, savePct, rng, advantage) {
  const adv = advantage || 1;

  // Sample actual runs with variance
  const C = CONSTANTS.CONSISTENCY;
  let yourRuns = sampleGamma(runsFor, runsFor * 0.35, rng);
  let oppRuns = sampleGamma(runsAgainst, runsAgainst * 0.35, rng);

  // Consistency pull
  if (C > 0) {
    yourRuns = yourRuns * (1 - C) + runsFor * C;
    oppRuns = oppRuns * (1 - C) + runsAgainst * C;
  }

  // Home-field advantage
  oppRuns = oppRuns / adv;

  // Closer effect: in close games (within 3 runs), closer save pct matters
  const margin = yourRuns - oppRuns;
  if (margin > 0 && margin <= 3) {
    // Save situation: closer might blow it
    if (rng() > savePct) {
      oppRuns += margin + 0.5; // blown save, so the opponent scores to win
    }
  }

  // Round to whole runs for display
  let yR = Math.max(0, Math.round(yourRuns));
  let oR = Math.max(0, Math.round(oppRuns));

  let won;
  if (yR > oR) won = true;
  else if (yR < oR) won = false;
  else {
    // Baseball has no ties, so a level scoreboard goes to extra innings and
    // somebody walks it off. The coin flip already decided who; the winning
    // run has to appear on the scoreboard too, or the box score reads "4-4"
    // with a W beside it, which it did on the playoff bracket.
    won = rng() < 0.5;
    if (won) yR += 1; else oR += 1;
  }

  return {
    won,
    yourRuns: yR,
    oppRuns: oR,
  };
}

// ─── schedule ────────────────────────────────────────────────────────────────

/* Opponent scheduling constants: your slate is real all-time teams. */
const SCHEDULE = {
  CONTENDER_MIN_RATING: 66,   // the pool a title team faces all year
  MARQUEE_MIN_RATING: 82,     // elite opponents injected as marquee games
  MARQUEE_GAMES: 14,          // the gauntlet, why an unbeaten season is rare
  OPP_GAME_SD: 0.55,          // per-game noise around an opponent's true means
  // Real teams' run-prevention model floors around ~4.1; scale the pool so
  // these opponents play at the postseason intensity a title team faces all
  // year, holding the calibrated difficulty. These are the difficulty dial.
  OPP_OFF_SCALE: 1.02,
  OPP_DEF_SCALE: 0.95,
};

/* Build the pool of real team-seasons your schedule is drawn from. Returns
 * contenders (the season-long slate) and marquee (elite marquee opponents).
 * Pass the result to generateSchedule / playRun for real opponents. */
function buildOpponentPool(teamSeasons) {
  const contenders = [], marquee = [];
  for (const t of teamSeasons) {
    if (typeof t.rating !== 'number') continue;
    const o = {
      name: t.display, team: t.team, season: t.season, rating: t.rating,
      off: t.offMean * SCHEDULE.OPP_OFF_SCALE,
      def: t.defMean * SCHEDULE.OPP_DEF_SCALE,
    };
    if (t.rating >= SCHEDULE.CONTENDER_MIN_RATING) contenders.push(o);
    if (t.rating >= SCHEDULE.MARQUEE_MIN_RATING) marquee.push(o);
  }
  return { contenders, marquee };
}

function generateSchedule(rng, games, pool) {
  const count = games || CONSTANTS.REGULAR_SEASON_GAMES;
  const schedule = [];

  // Real-opponent path: draw a slate of actual all-time team-seasons, with
  // MARQUEE_GAMES hardest matchups sprinkled in.
  if (pool && pool.contenders && pool.contenders.length) {
    const marqueeSet = new Set();
    if (pool.marquee && pool.marquee.length) {
      while (marqueeSet.size < Math.min(SCHEDULE.MARQUEE_GAMES, count)) {
        marqueeSet.add(Math.floor(rng() * count));
      }
    }
    for (let i = 0; i < count; i++) {
      const bucket = marqueeSet.has(i) ? pool.marquee : pool.contenders;
      const opp = bucket[Math.floor(rng() * bucket.length)];
      const oppOff = Math.max(2.5, opp.off + normal(rng) * SCHEDULE.OPP_GAME_SD);
      const oppDef = Math.max(2.5, opp.def + normal(rng) * SCHEDULE.OPP_GAME_SD);
      schedule.push({
        game: i + 1,
        oppName: opp.name,
        oppRating: opp.rating,
        marquee: marqueeSet.has(i),
        oppRunsScored: Math.round(oppOff * 100) / 100,
        oppRunsAllowed: Math.round(oppDef * 100) / 100,
      });
    }
    return schedule;
  }

  // Fallback: abstract opponents around the all-time-roster baselines.
  for (let i = 0; i < count; i++) {
    const oppOff = Math.max(2.5, CONSTANTS.OPP_OFF_MEAN + normal(rng) * 0.8);
    const oppDef = Math.max(2.5, CONSTANTS.OPP_DEF_MEAN + normal(rng) * 0.7);
    schedule.push({
      game: i + 1,
      oppRunsScored: Math.round(oppOff * 100) / 100,
      oppRunsAllowed: Math.round(oppDef * 100) / 100,
    });
  }
  return schedule;
}

/* Per-game expected runs for both sides.
 * Your scoring scales with the opponent's pitching (oppRunsAllowed);
 * their scoring scales YOUR run prevention by their offense quality,
 * this is where SP1/SP2/defense enter every regular-season game. */
function gameMeans(offense, defense, game) {
  const N = CONSTANTS.OPP_RUNS_MEAN;
  return {
    runsFor: offense * (game.oppRunsAllowed / N),
    runsAgainst: defense * (game.oppRunsScored / N),
  };
}

// ─── playoffs ────────────────────────────────────────────────────────────────

const PLAYOFF_ROUND_NAMES = ['Wild Card', 'Division Series', 'Championship Series', 'World Series'];

function seedFromRecord(wins) {
  if (wins >= CONSTANTS.DIVISION_WINS) {
    return {
      made: true, bye: true,
      rounds: CONSTANTS.PLAYOFF_ROUNDS_DIVISION,
      label: 'Division winner',
    };
  }
  if (wins >= CONSTANTS.WILD_CARD_WINS) {
    return {
      made: true, bye: false,
      rounds: CONSTANTS.PLAYOFF_ROUNDS_WILD_CARD,
      label: 'Wild card',
    };
  }
  return { made: false, bye: false, rounds: 0, label: 'Missed the playoffs' };
}

function playoffRoundNames(rounds) {
  return PLAYOFF_ROUND_NAMES.slice(PLAYOFF_ROUND_NAMES.length - rounds);
}

/*
 * TITLE DIFFICULTY: the deepest rounds are scaled to your team rating, so a
 * title means you built a great team, not that you got hot in a short
 * series. A weak team that sneaks into October faces a stiffened opponent in
 * the LCS and World Series; an all-time roster gets a fair fight. Returns a
 * multiplier applied to the opponent's scoring (>1 = tougher).
 */
const TITLE = {
  PIVOT: 84,        // rating at/above which the title is a fair fight
  SLOPE: 0.011,     // how fast a weaker team's opponent stiffens
  MAX_EDGE: 1.34,
  SEMI_SHARE: 0.5,  // the Championship Series gets half the edge
};
function titleEdge(rating) {
  if (typeof rating !== 'number') return 1;
  return Math.max(1, Math.min(TITLE.MAX_EDGE, 1 + (TITLE.PIVOT - rating) * TITLE.SLOPE));
}

/*
 * Playoff series: best-of-5 for LDS, best-of-7 for LCS and WS.
 * Returns { won, gamesPlayed, seriesScore }.
 */
function playoffSeries(runsFor, runsAgainst, savePct, rng, bestOf, advantage) {
  const need = Math.ceil(bestOf / 2);
  let yourWins = 0, oppWins = 0;
  const games = [];

  while (yourWins < need && oppWins < need) {
    const result = resolveGame(runsFor, runsAgainst, savePct, rng, advantage);
    games.push(result);
    if (result.won) yourWins++; else oppWins++;
  }

  return {
    won: yourWins >= need,
    gamesPlayed: games.length,
    yourWins,
    oppWins,
    games,
  };
}

function generatePlayoffs(seed, runsFor, runsAgainst, savePct, rng, regularWins, rating, pool) {
  if (!seed.made) return null;
  const edge = titleEdge(rating);

  const rounds = playoffRoundNames(seed.rounds);
  const results = [];
  let alive = true;

  // Escalating real opponents for flavor: each round draws a tougher all-time
  // team from the elite pool, hardest saved for the World Series.
  const eliteSorted = (pool && pool.marquee && pool.marquee.length)
    ? pool.marquee.slice().sort((a, b) => a.rating - b.rating) : null;
  const oppFor = (roundIdx) => {
    if (!eliteSorted) return null;
    const frac = rounds.length > 1 ? roundIdx / (rounds.length - 1) : 1;
    const lo = Math.floor(frac * (eliteSorted.length - 1) * 0.7);
    const hi = eliteSorted.length - 1;
    return eliteSorted[lo + Math.floor(rng() * Math.max(1, hi - lo + 1))] || null;
  };

  // Home-field advantage scales with regular-season wins
  const baseAdv = 1 + CONSTANTS.PLAYOFF_HOME_FIELD *
    Math.min(1, Math.max(0, (regularWins - CONSTANTS.WILD_CARD_WINS) /
      (CONSTANTS.REGULAR_SEASON_GAMES - CONSTANTS.WILD_CARD_WINS)));

  // Same opponent-quality scaling as the regular season: playoff teams hit
  // like all-time offenses and pitch like all-time staffs.
  const N = CONSTANTS.OPP_RUNS_MEAN;
  const offAdj = runsFor * (CONSTANTS.OPP_DEF_MEAN / N);
  const defAdj = runsAgainst * (CONSTANTS.OPP_OFF_MEAN / N);

  for (let i = 0; i < rounds.length; i++) {
    if (!alive) break;

    const roundName = rounds[i];
    // Opponents get tougher each round, and the deepest rounds are further
    // stiffened for weaker teams (title difficulty scaled to your rating).
    const roundDifficulty = 1 + i * CONSTANTS.PLAYOFF_ROUND_STEP;
    let titleMult = 1;
    if (roundName === 'World Series') titleMult = edge;
    else if (roundName === 'Championship Series') titleMult = 1 + (edge - 1) * TITLE.SEMI_SHARE;
    const oppRA = defAdj * roundDifficulty * titleMult;

    // Best-of-5 for WC and LDS, best-of-7 for LCS and WS
    const bestOf = (roundName === 'Wild Card' || roundName === 'Division Series') ? 5 : 7;

    const adv = seed.bye ? baseAdv : Math.max(1, baseAdv * 0.85);

    const series = playoffSeries(offAdj, oppRA, savePct, rng, bestOf, adv);
    const opp = oppFor(i);
    results.push({
      round: roundName,
      oppName: opp ? opp.name : null,
      oppTeam: opp ? opp.team : null,   // club code, so the bracket can wear its colors
      oppSeason: opp ? opp.season : null, // and so the at-bat sim can bat their real nine
      oppRating: opp ? opp.rating : null,
      bestOf,
      homeField: !!seed.bye,
      ...series,
    });

    if (!series.won) alive = false;
  }

  const won = results.length > 0 && results[results.length - 1].won &&
    results[results.length - 1].round === 'World Series';

  return { rounds: results, won };
}

// ─── the bracket ─────────────────────────────────────────────────────────────

/*
 * Twelve clubs, four rounds, the field AROUND the player's path through October.
 *
 * IT DECIDES NOTHING, for the same reason the at-bat simulator below decides
 * nothing. Your opponents are generatePlayoffs()'s ladder and stay exactly that:
 * it picked them, stiffened them by round and by your rating, and the balance is
 * measured on that. What this builds is the eleven OTHER series, simulated for the
 * reveal alone off their own seeded RNG, so the screen can show a bracket filling
 * in rather than six numbers appearing on a stagger.
 *
 * ONE THING IS AUTHORED RATHER THAN DERIVED, and it follows from that: the seat
 * across from you carries the club the run really scheduled. The reseed decides who
 * everybody else plays, but if it disagreed with the ladder you would watch a series
 * against a club the bracket never put there.
 *
 * THE TWO SIDES ARE NOT THE AMERICAN AND NATIONAL LEAGUES and must not be labelled
 * as such. A roster is drafted across every era from 71 clubs, half of which no
 * longer exist and some of which were never in either league, so filing the 1931
 * Homestead Grays under the AL would be a tidy-looking lie. They are the player's
 * side and the other one.
 */
const BRACKET = {
  ROUNDS: PLAYOFF_ROUND_NAMES,
  SHORT: ['Wild Card', 'Division', 'Championship', 'World Series'],
  /* MLB's wild card round: the top two seeds sit it out, 3 hosts 6 and 4 hosts 5. */
  WC: [[3, 6], [4, 5]],
  BYES: [1, 2],
  BEST_OF: [3, 5, 7, 7],
  SIDES: ['near', 'far'],
};

/* Seeded on the record, the way the real thing is. A bye is a division winner by
 * definition (95+ wins), and the very best of those take the one seed. */
function bracketSeed(wins, bye) {
  const w = wins | 0;
  if (bye) return w >= 100 ? 1 : 2;
  if (w >= 93) return 3;
  if (w >= 91) return 4;
  if (w >= 89) return 5;
  return 6;
}

/*
 * opts: { seed, bye, rounds, wins, ladder, teamSeasons }
 *   ladder      the run's own opponents, in the order they are met
 *   teamSeasons the pool everybody else is drawn from
 *
 * Returns the field plus the four pairing helpers the screen walks. State
 * (`results`, `scores`, `revealed`) lives on the object so a bracket redrawn
 * mid-animation cannot change an answer it has already given.
 */
function createBracket(opts) {
  const rng = createSeededRNG(hashSeed(String(opts.seed) + '|bracket'));
  const bye = !!opts.bye;
  const mySeed = bracketSeed(opts.wins, bye);
  const firstCol = BRACKET.ROUNDS.length - (opts.rounds || 3);
  /* INDEX-ALIGNED WITH THE ROUNDS PLAYED, never compacted: ladder[i] is the opponent
   * in the run's round i, which sits in column firstCol + i. A hole stays a hole. */
  const ladder = (opts.ladder || []).slice();

  /* Every real opponent is reserved, not just the pinned ones: the seat across from
   * the player is overwritten with the run's own club each round, so a filler that
   * happened to be the same club would put that team on screen twice. */
  const used = {}, clubs = {};
  for (const t of ladder) if (t) { used[t.id] = 1; clubs[t.code] = 1; }

  /* Fillers are real all-time clubs, strongest first, ONE SEASON PER FRANCHISE.
   * Every year of every club is its own row, so drawing on rating alone seats the
   * 1927, 1939 and 1998 Yankees in the same bracket. A bracket with three of
   * anybody in it is not a bracket. */
  const pool = (opts.teamSeasons || [])
    .filter(t => t.rating != null && !used[t.team_season_id])
    .sort((a, b) => b.rating - a.rating).slice(0, 220);
  const take = (n) => {
    const out = [];
    while (out.length < n && pool.length) {
      const t = pool.splice(Math.floor(rng() * Math.min(pool.length, 26)), 1)[0];
      if (clubs[t.team]) continue;
      used[t.team_season_id] = 1; clubs[t.team] = 1;
      out.push({ code: t.team, season: t.season, rating: t.rating, id: t.team_season_id });
    }
    return out;
  };

  const near = new Array(7).fill(null), far = new Array(7).fill(null);
  near[mySeed] = { you: true, seed: mySeed };
  /* The World Series opponent is the far side's top seed, because the last rung of
   * the ladder has to be on the other half of the bracket to be met there at all.
   * The one before it takes the best seat left on the player's side. */
  /* PINNED BY COLUMN, NOT BY POSITION IN THE LADDER. run.playoffs.rounds stops at the
   * round the run went out in, so the last rung is only the World Series opponent when
   * the run got there. Taking it as one anyway seated the club that knocked the player
   * out in the Division Series as the other side's top seed, and that club then turned
   * up as the near champion too: a World Series between the 1951 Giants and the 1951
   * Giants. A run that never reached a round pins nobody for it, and the seats fill
   * with the rest of the field. */
  const ws = ladder[3 - firstCol] || null;
  let lcs = ladder[2 - firstCol] || null;
  /* THE LADDER CAN ALSO DRAW THE SAME CLUB TWICE, because generatePlayoffs() picks each
   * round's opponent at random out of the elite pool and nothing stops it landing on
   * the same one in consecutive rounds. Only the first pinning stands; the other round's
   * seat is filled by the override in colGames(), which shows the club the run really
   * scheduled. */
  if (ws) far[1] = { team: ws, seed: 1 };
  if (lcs && ws && lcs.id === ws.id) lcs = null;
  if (lcs) { const s = mySeed === 1 ? 2 : 1; if (!near[s]) near[s] = { team: lcs, seed: s }; }
  const fillNear = take(6 - near.filter(Boolean).length);
  for (let s = 1, i = 0; s <= 6; s++) if (!near[s]) near[s] = { team: fillNear[i++] || null, seed: s };
  const fillFar = take(6 - far.filter(Boolean).length);
  for (let s = 1, i = 0; s <= 6; s++) if (!far[s]) far[s] = { team: fillFar[i++] || null, seed: s };

  const B = {
    mySeed, bye, firstCol, near, far, ladder,
    results: {}, scores: {}, revealed: {},
    colOf: (i) => firstCol + i,
  };

  /* One simulated series. Rating decides it, with enough noise that a six seed can
   * turn one over: these are the series the player is not in, so they only have to
   * be plausible. */
  function play(key, a, b, r, bestOf) {
    if (B.results[key] !== undefined) return B.results[key];
    /* THE PLAYER'S LINE IS DRAWN FORWARD, never simulated. A bracket is drawn ahead
     * of the games, so their own path has to run to the World Series until the run
     * says otherwise, which it does through settleMine(). Left uncached so that
     * write wins: simulating it instead put the player out in the Division Series
     * on screen while they were still alive in the game. */
    if ((a && a.you) || (b && b.you)) return (a && a.you) ? a : b;
    let w;
    if (!a || !b) w = a || b || null;
    else {
      const ra = (a.team && a.team.rating) || 70, rb = (b.team && b.team.rating) || 70;
      const edge = (ra - rb) * 0.085 + ((b.seed || 6) - (a.seed || 6)) * 0.15;
      w = (r() < 1 / (1 + Math.exp(-edge))) ? a : b;
      const need = Math.ceil((bestOf || 7) / 2);
      B.scores[key] = need + '-' + Math.floor(r() * need);
    }
    B.results[key] = w;
    return w;
  }

  /* The four that survive a side, in seed order, once the wild card has been played. */
  function survivors(side, r) {
    const field = B[side];
    const out = BRACKET.BYES.map(s => field[s]);
    BRACKET.WC.forEach(([hi, lo], i) => { out.push(play(side + ':0:' + i, field[hi], field[lo], r, 3)); });
    return out.filter(Boolean).sort((x, y) => x.seed - y.seed);
  }

  /* RESEEDED EVERY ROUND, which is the thing that makes this a bracket and not a
   * fixed ladder: the best seed still alive always draws the worst seed still alive. */
  function pairs(side, col, r) {
    const field = B[side];
    if (col === 0) return BRACKET.WC.map(([hi, lo]) => [field[hi], field[lo]]);
    if (col === 1) { const v = survivors(side, r); return [[v[0], v[3]], [v[1], v[2]]]; }
    if (col === 2) {
      const d = pairs(side, 1, r).map(([a, b], i) => play(side + ':1:' + i, a, b, r, 5));
      return [[d[0], d[1]]];
    }
    return [];
  }

  /* Every series in a column, both sides, plus the World Series across the middle. */
  B.colGames = function (col) {
    const r = createSeededRNG(hashSeed(String(opts.seed) + '|brk|' + col));
    const mine = (g) => !!(g && ((g[0] && g[0].you) || (g[1] && g[1].you)));
    let out;
    if (col === 3) {
      const champ = (side) => {
        const p = pairs(side, 2, r);
        return p.length ? play(side + ':2:0', p[0][0], p[0][1], r, 7) : null;
      };
      const g = [champ('near'), champ('far')];
      out = [{ side: 'ws', i: 0, pair: g, me: mine(g), key: 'ws:3:0' }];
    } else {
      out = [];
      for (const side of BRACKET.SIDES) {
        pairs(side, col, r).forEach((pair, i) => {
          out.push({ side, i, pair, me: mine(pair), key: side + ':' + col + ':' + i });
        });
      }
    }
    /* THE PLAYER'S OPPONENT IS THE RUN'S, not the bracket's. Every other seat is
     * filled by the reseed above; the seat across from them carries whatever seed
     * the pairing gave it and the club the run really scheduled. */
    const opp = ladder[col - firstCol] || null;
    if (opp) for (const g of out) if (g.me) {
      const seat = g.pair[0] && g.pair[0].you ? 1 : 0;
      const cur = g.pair[seat];
      g.pair[seat] = { team: opp, seed: (cur && cur.seed) || 1 };
    }
    return out;
  };

  /*
   * Once the player's series has been played, its winner is the run's own result.
   *
   * EVERYTHING DOWNSTREAM IS THROWN AWAY, and it has to be. The player's line is
   * drawn forward, so every later round was worked out with them still in it: the
   * Championship Series was paired off a set of survivors that included them, and
   * that answer was cached under its slot. The moment they go out, the club that
   * beat them takes their place in the reseed and those pairings change, but the
   * cached winners do not. Left alone it showed a Championship Series between the
   * 1930 Athletics and the 1930 Athletics, and a club advancing out of a series it
   * was not in. Nothing past this column has been revealed yet (a column cannot be
   * shown before the one feeding it), so nothing on screen moves.
   */
  B.settleMine = function (i, won, score) {
    const col = firstCol + i;
    const g = B.colGames(col).find(x => x.me);
    if (!g) return;
    const me = g.pair[0] && g.pair[0].you ? g.pair[0] : g.pair[1];
    const them = g.pair[0] && g.pair[0].you ? g.pair[1] : g.pair[0];
    for (const key of Object.keys(B.results)) {
      if (parseInt(key.split(':')[1], 10) > col) {
        delete B.results[key]; delete B.scores[key]; delete B.revealed[key];
      }
    }
    B.results[g.key] = won ? me : them;
    if (score) B.scores[g.key] = score;
    B.revealed[g.key] = 1;
  };

  B.revealAll = function () {
    for (let c = 0; c < 4; c++) B.colGames(c).forEach(g => { B.revealed[g.key] = 1; });
  };

  /* A column is empty until the round that feeds it has been played. Every series is
   * decided the first time its pairing is asked for, so without this the bracket
   * prints the whole thing on the first screen and the World Series can be read
   * before the first pitch. */
  B.knownAt = function (col) {
    if (col === 0) return true;
    return B.colGames(col - 1).every(g => !!B.revealed[g.key]);
  };

  return B;
}

// ─── at-bat simulation ───────────────────────────────────────────────────────

/*
 * WHO WINS AND WHAT IT LOOKS LIKE ARE TWO DIFFERENT JOBS, and keeping them apart
 * is the whole design of this section.
 *
 * Everything above decides the season: resolveGame() samples runs, playoffSeries()
 * stacks those games into a bracket, and the balance of this game (88.9 mean wins,
 * 58% Octobers, 6.3% titles) was measured against exactly that model over thousands
 * of seasons. A second, independent simulator down here would quietly become a
 * second balance, and every one of those numbers would have to be re-tuned.
 *
 * So this does not decide anything. It is handed a final score that resolveGame()
 * already produced, spreads those runs across innings the way real innings bunch
 * up, and plays each half inning out batter by batter with real base and out state
 * until exactly that many runs are in. A 5-3 game is always the same 5-3 game; what
 * the at-bat engine supplies is the ninety plate appearances that got there.
 *
 * Nothing it draws touches the season's RNG either: the caller seeds it separately
 * (round and game index off the run seed), so watching a game and skipping it
 * produce the same bracket, and the same seed always replays the same game.
 *
 * The one rule imposed from outside is that the third out cannot be made until the
 * inning's runs are in. That is also the only rule real baseball enforces about
 * when an inning ends, so it never shows.
 */

/* Per plate appearance, roughly the modern league line: a .320 on-base rate split
 * into its parts. `heat` scales every way of reaching base at once and the leftover
 * is an out, which is how an inning that has runs to deliver gets them. */
const PA_RATES = { BB: 0.081, HBP: 0.009, '1B': 0.150, '2B': 0.045, '3B': 0.004, HR: 0.031 };
const PA_ON_BASE = 0.320;
const ON_BASE_CODES = ['BB', 'HBP', '1B', '2B', '3B', 'HR'];
const OUT_MIX = [['K', 0.36], ['GO', 0.28], ['FO', 0.22], ['LO', 0.09], ['PO', 0.05]];

const FIELD = {
  pull: ['left', 'left field', 'the left-field corner'],
  gap: ['left-center', 'right-center', 'the gap'],
  oppo: ['right', 'right field', 'the right-field corner'],
  inf: ['short', 'second', 'third', 'first'],
  air: ['left', 'center', 'right', 'left-center', 'right-center'],
};

function pickOne(list, rng) { return list[Math.floor(rng() * list.length)] || list[0]; }

function occupied(bases) { return (bases[0] ? 1 : 0) + (bases[1] ? 1 : 0) + (bases[2] ? 1 : 0); }

/*
 * How many runs a given outcome can drive in from this base state, as a range.
 * The floor is what the outcome forces (a runner on third scores on any hit); the
 * ceiling is what it allows (a runner on first may or may not score from first on
 * a double). The inning's run budget is spent by choosing a number inside this
 * range, which is why the simulation never has to be rejected and retried.
 */
function runRange(code, bases, outs) {
  const f = bases[0] ? 1 : 0, s = bases[1] ? 1 : 0, t = bases[2] ? 1 : 0;
  switch (code) {
    case 'HR': return [occupied(bases) + 1, occupied(bases) + 1];
    case '3B': return [occupied(bases), occupied(bases)];
    case '2B': return [t + s, t + s + f];
    case '1B': return [t, t + s];
    case 'BB': case 'HBP': return [(f && s && t) ? 1 : 0, (f && s && t) ? 1 : 0];
    case 'OUT': return [0, (t && outs < 2) ? 1 : 0];
    default: return [0, 0];
  }
}

/* Move the runners for `code`, driving in exactly `k` runs. Everything the range
 * above called optional is resolved here to hit that number. */
function advanceBases(st, code, batter, k, rng) {
  const f = st.bases[0], s = st.bases[1], t = st.bases[2];
  const scored = [];
  let nf = null, ns = null, nt = null;

  if (code === 'HR') {
    if (t) scored.push(t); if (s) scored.push(s); if (f) scored.push(f);
    scored.push(batter);
  } else if (code === '3B') {
    if (t) scored.push(t); if (s) scored.push(s); if (f) scored.push(f);
    nt = batter;
  } else if (code === '2B') {
    if (t) scored.push(t); if (s) scored.push(s);
    if (f) { if (k > scored.length) scored.push(f); else nt = f; }
    ns = batter;
  } else if (code === '1B') {
    if (t) scored.push(t);
    if (s) { if (k > scored.length) scored.push(s); else nt = s; }
    if (f) { if (!nt && rng() < 0.24) nt = f; else ns = f; }
    nf = batter;
  } else if (code === 'BB' || code === 'HBP') {
    ns = s; nt = t; nf = batter;
    if (f) {
      if (s) { if (t) scored.push(t); nt = s; ns = f; }
      else ns = f;
    }
  }
  st.bases = [nf, ns, nt];
  return scored;
}

/* An out, with the base running that comes with one. Returns the out type so the
 * play-by-play can say what it was. */
function makeOut(st, batter, k, rng, allowDouble) {
  const f = st.bases[0], s = st.bases[1], t = st.bases[2];
  const scored = [];
  let kind = null;
  let outs = 1;

  /* A run scoring on an out is a groundout to the right side or a sacrifice fly,
   * and both need a runner on third and fewer than two down. */
  if (k > 0) {
    kind = rng() < 0.55 ? 'SF' : 'GO';
    scored.push(t);
    st.bases = [f, s, null];
    if (kind === 'GO' && f && !s) st.bases = [null, f, null];
    return { kind, outs: 1, scored };
  }

  /* Two on the ground with a man on first is the double play a rally dies on, and
   * it is the one out that can end an inning from one out down. The caller refuses
   * it while the inning still owes runs, for the same reason it refuses the third
   * out: the inning has a total to deliver and cannot be cut short. */
  if (allowDouble && f && st.outs < 2 && rng() < 0.33) {
    kind = 'DP';
    outs = 2;
    st.bases = [null, s, t];
    if (s && !t && rng() < 0.3) st.bases = [null, null, s];
    return { kind, outs, scored };
  }

  let r = rng(), acc = 0;
  for (const [c, w] of OUT_MIX) { acc += w; if (r <= acc) { kind = c; break; } }
  if (!kind) kind = 'K';

  /* Runners move up on a ball in play often enough to matter to the picture. */
  if (kind === 'GO' && st.outs < 2) {
    if (s && !t && rng() < 0.35) st.bases = [f, null, s];
  }
  return { kind, outs, scored };
}

function describePlay(code, kind, batter, scored, rng, bases) {
  const n = batter.name;
  const on = occupied(bases);
  switch (code) {
    case 'BB': return n + ' draws a walk.';
    case 'HBP': return n + ' is hit by the pitch.';
    case '1B': return n + ' singles to ' + pickOne(FIELD.air, rng) + '.';
    case '2B': return n + ' doubles to ' + pickOne(FIELD.gap.concat(FIELD.pull, FIELD.oppo), rng) + '.';
    case '3B': return n + ' triples into ' + pickOne(FIELD.gap, rng) + '.';
    case 'HR':
      if (scored.length === 4) return n + ' hits a GRAND SLAM to ' + pickOne(FIELD.air, rng) + '.';
      if (scored.length === 3) return n + ' hits a three-run shot to ' + pickOne(FIELD.air, rng) + '.';
      if (scored.length === 2) return n + ' hits a two-run homer to ' + pickOne(FIELD.air, rng) + '.';
      return n + ' goes deep to ' + pickOne(FIELD.air, rng) + '.';
    default: break;
  }
  switch (kind) {
    case 'K': return n + (rng() < 0.6 ? ' strikes out swinging.' : ' is called out on strikes.');
    case 'DP': return n + ' grounds into a double play.';
    case 'SF': return n + ' lifts a sacrifice fly to ' + pickOne(FIELD.air, rng) + '.';
    case 'GO': return n + ' grounds out to ' + pickOne(FIELD.inf, rng) + '.';
    case 'FO': return n + ' flies out to ' + pickOne(FIELD.air, rng) + '.';
    case 'LO': return n + ' lines out to ' + pickOne(FIELD.inf, rng) + '.';
    case 'PO': return n + ' pops out to ' + pickOne(FIELD.inf, rng) + '.';
    default: return n + ' is retired.' + (on ? '' : '');
  }
}

/*
 * One half inning, worth exactly `target` runs.
 *
 * `need`, when given, is how many runs would put the batting side in front, and it
 * is only ever passed for a home team's last at-bat in a game it wins. It keeps the
 * lead from being taken twice: every play either leaves them behind or ends the
 * game, which is what a walk-off is.
 */
function simHalfInning(target, rng, ctx) {
  const lineup = ctx.lineup;
  const st = { outs: 0, bases: [null, null, null] };
  const plays = [];
  let runs = 0, hits = 0, order = ctx.order || 0;
  let guard = 0;

  while (st.outs < 3 && guard++ < 60) {
    const remaining = target - runs;
    const batter = lineup[order % lineup.length];
    const heat = remaining > 0 ? Math.min(2.4, 0.95 + 0.5 * remaining) : 0.60;

    /* Which outcomes this base-out state can afford, and how many runs each may
     * drive in without overshooting the inning or tripping the walk-off rule. */
    const choices = [];
    const codes = ON_BASE_CODES.slice();
    if (!(st.outs === 2 && remaining > 0)) codes.push('OUT');
    for (const c of codes) {
      const [lo, hi] = runRange(c, st.bases, st.outs);
      const ks = [];
      for (let k = lo; k <= hi && k <= remaining; k++) {
        if (ctx.need == null || runs + k < ctx.need || runs + k === target) ks.push(k);
      }
      if (!ks.length) continue;
      const w = c === 'OUT' ? Math.max(0.04, 1 - PA_ON_BASE * heat) : PA_RATES[c] * heat;
      choices.push([c, w, ks]);
    }
    /* Cannot happen with the rules above (a walk or a single with the bases not
     * loaded is always legal), but an inning that cannot be continued is worse
     * than one that ends early, so say so rather than spin. */
    if (!choices.length) break;

    let total = 0;
    for (const ch of choices) total += ch[1];
    let r = rng() * total, chosen = choices[choices.length - 1];
    for (const ch of choices) { r -= ch[1]; if (r <= 0) { chosen = ch; break; } }

    const code = chosen[0];
    const ks = chosen[2];
    /* Prefer the play that finishes the inning's business when one is on offer,
     * so a rally resolves rather than trickling. */
    let k = ks[Math.floor(rng() * ks.length)];
    if (ks.indexOf(remaining) !== -1 && remaining > 0 && rng() < 0.6) k = remaining;

    const before = st.bases.slice();
    const outsBefore = st.outs;
    let kind = code, scored;

    if (code === 'OUT') {
      const o = makeOut(st, batter, k, rng, remaining - k <= 0);
      kind = o.kind; scored = o.scored;
      st.outs = Math.min(3, st.outs + o.outs);
    } else {
      scored = advanceBases(st, code, batter, k, rng);
      if (code !== 'BB' && code !== 'HBP') hits++;
    }

    runs += scored.length;
    plays.push({
      code, kind, batter,
      pitcher: ctx.pitcherAt ? ctx.pitcherAt(order) : null,
      text: describePlay(code, kind, batter, scored, rng, before),
      scored: scored.map(p => p.name),
      rbi: scored.length,
      outsBefore, outs: st.outs,
      basesBefore: before.map(p => (p ? p.name : null)),
      bases: st.bases.map(p => (p ? p.name : null)),
      runs,
      hit: code !== 'BB' && code !== 'HBP' && code !== 'OUT',
      walkoff: ctx.need != null && runs >= ctx.need,
    });
    order++;

    if (ctx.need != null && runs >= ctx.need) break;
  }

  return { plays, runs, hits, order, lob: occupied(st.bases) };
}

/*
 * Spread a game's runs across its innings. Real runs arrive in bunches: most
 * innings are scoreless and the ones that are not tend to be worth more than one,
 * so this hands out chunks rather than single runs.
 */
const RUN_CHUNKS = [[1, 0.50], [2, 0.24], [3, 0.14], [4, 0.08], [5, 0.04]];
function spreadRuns(total, innings, rng) {
  const out = new Array(innings).fill(0);
  let left = total, guard = 0;
  while (left > 0 && guard++ < 80) {
    let r = rng(), acc = 0, chunk = 1;
    for (const [c, w] of RUN_CHUNKS) { acc += w; if (r <= acc) { chunk = c; break; } }
    chunk = Math.min(chunk, left);
    /* A fresh inning is three times likelier than one that has already scored,
     * which is about how often real clubs put up two crooked numbers. */
    const weights = out.map(v => (v === 0 ? 3 : 1));
    let tw = 0; for (const w of weights) tw += w;
    let pick = rng() * tw, idx = 0;
    for (let i = 0; i < innings; i++) { pick -= weights[i]; if (pick <= 0) { idx = i; break; } }
    out[idx] += chunk;
    left -= chunk;
  }
  if (left > 0) out[innings - 1] += left;
  return out;
}

/* A batting order off a slot-tagged roster: the best bat hits third, the next two
 * set the table, the rest fall in behind. */
function battingOrder(batters) {
  const s = batters.slice().sort((a, b) => (b.w || 0) - (a.w || 0));
  if (s.length < 3) return s;
  const head = [s[2], s[1], s[0]];
  return head.concat(s.slice(3));
}

const GENERIC_SPOTS = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'];

/*
 * The nine who bat, off whatever the run handed us. A lineup roster supplies real
 * names; All-Time Staff has no hitters at all, so it bats a nameless league-average
 * nine and the drama sits with the arms, which is where that mode puts it anyway.
 */
function lineupFromRoster(roster) {
  const batters = (roster || []).filter(p => p.r === 'b');
  if (batters.length >= 9) {
    return battingOrder(batters).slice(0, 9).map(p => ({
      name: p.n, slot: p._slot || (p.ep || '').split(';')[0] || '', team: p.t, season: p.s, w: p.w,
    }));
  }
  /* All-Time Staff drafts twelve arms and bats a league-average nine, so there
   * are no names to print. "Your 2B grounds out to third" says what happened
   * without inventing a person to have done it. */
  return GENERIC_SPOTS.map(spot => ({ name: 'Your ' + spot, slot: spot, generic: true }));
}

/* The arms, in the order they will be used. */
function staffFromRoster(roster, gameIndex) {
  const arms = (roster || []).filter(p => p.r === 'p');
  const by = (slot) => arms.find(p => p._slot === slot);
  const rot = ['SP1', 'SP2', 'SP3', 'SP4', 'SP5'].map(by).filter(Boolean);
  const pen = ['RP1', 'RP2', 'RP3', 'RP4', 'RP5', 'SU'].map(by).filter(Boolean);
  const cl = by('CL');
  const start = rot.length ? rot[(gameIndex || 0) % rot.length] : arms[0];
  const mid = pen.length ? pen[(gameIndex || 0) % pen.length] : null;
  const wrap = (p) => (p ? { name: p.n, slot: p._slot, team: p.t, season: p.s, w: p.w } : null);
  return { starter: wrap(start), reliever: wrap(mid) || wrap(start), closer: wrap(cl) || wrap(mid) };
}

/*
 * The same two things for a real club, off its own season's roster.
 *
 * A third of the great clubs in the data carry seven or eight qualifying bats,
 * because build time applies a playing-time floor and the bottom of a real
 * lineup does not always clear it. Refusing those clubs would send the 1927
 * Yankees out with nine nameless hitters, so the names that exist bat and the
 * rest of the order is filled by position: a spot with no name is a spot whose
 * man did not play enough to be in this data, which is the truth about it.
 */
function lineupFromTeamSeason(roster) {
  if (!roster || !roster.length) return null;
  const batters = roster.filter(p => p.r === 'b');
  if (batters.length < 4) return null;
  const out = battingOrder(batters).slice(0, 9).map(p => ({
    name: p.n, slot: (p.pp || (p.ep || '').split(';')[0] || ''), team: p.t, season: p.s, w: p.w,
  }));
  const taken = {};
  for (const p of out) taken[p.slot] = true;
  for (const spot of GENERIC_SPOTS) {
    if (out.length >= 9) break;
    if (taken[spot]) continue;
    out.push({ name: spot, slot: spot, generic: true });
    taken[spot] = true;
  }
  while (out.length < 9) out.push({ name: 'DH', slot: 'DH', generic: true });
  return out;
}

function staffFromTeamSeason(roster, gameIndex) {
  if (!roster || !roster.length) return { starter: null, reliever: null, closer: null };
  const arms = roster.filter(p => p.r === 'p').slice().sort((a, b) => (b.w || 0) - (a.w || 0));
  const sp = arms.filter(p => p.ep === 'SP' || (p.pp === 'SP'));
  const rp = arms.filter(p => p.ep !== 'SP' && p.pp !== 'SP');
  const wrap = (p) => (p ? { name: p.n, slot: p.pp || p.ep || '', team: p.t, season: p.s, w: p.w } : null);
  const rot = sp.length ? sp : arms;
  return {
    starter: wrap(rot[(gameIndex || 0) % Math.min(4, rot.length || 1)]),
    reliever: wrap(rp[0] || rot[rot.length - 1]),
    closer: wrap(rp.find(p => p.cl) || rp[1] || rp[0] || rot[0]),
  };
}

/*
 * The whole game, ready to animate.
 *
 * opts: { yourRuns, oppRuns, won, youHome, yourName, oppName, yourLineup, oppLineup,
 *         yourStaff, oppStaff, rng }
 *
 * Returns the line score, every half inning, and every plate appearance inside it.
 * The final line always equals the score it was handed.
 */
const INNINGS = 9;
function simGameScript(opts) {
  const rng = opts.rng;
  const youHome = !!opts.youHome;
  const awayRuns = youHome ? opts.oppRuns : opts.yourRuns;
  const homeRuns = youHome ? opts.yourRuns : opts.oppRuns;
  const homeWins = homeRuns > awayRuns;

  let away = spreadRuns(awayRuns, INNINGS, rng);
  let home = spreadRuns(homeRuns, INNINGS, rng);

  /*
   * Two rules about the last inning, both of them real. A home club that is ahead
   * after the top of the ninth does not bat, and a home club that wins while batting
   * does it by taking the lead on the last play of the game. Anything the spread
   * produced that breaks either one gets its ninth-inning runs moved earlier.
   */
  let need = null;
  if (homeWins && home[INNINGS - 1] > 0) {
    const through = homeRuns - home[INNINGS - 1];
    if (through > awayRuns || home[INNINGS - 1] > 4) {
      /* Deal the whole total again across the first eight, which keeps it exact. */
      home = spreadRuns(homeRuns, INNINGS - 1, rng).concat([0]);
    } else {
      need = awayRuns - through + 1;
    }
  }
  const homeBatsNinth = !(homeWins && home[INNINGS - 1] === 0);

  const awayName = youHome ? opts.oppName : opts.yourName;
  const homeName = youHome ? opts.yourName : opts.oppName;
  const awayLineup = youHome ? opts.oppLineup : opts.yourLineup;
  const homeLineup = youHome ? opts.yourLineup : opts.oppLineup;
  const awayStaff = youHome ? opts.oppStaff : opts.yourStaff;
  const homeStaff = youHome ? opts.yourStaff : opts.oppStaff;

  /* Who is on the mound: the starter into the seventh, a reliever after that, and
   * the closer for the ninth when the game is still a save. Decoration, but it is
   * the player's own bullpen doing the deciding, which is the point of drafting one. */
  const armFor = (staff, inning, lead) => {
    if (!staff) return null;
    if (inning >= 9 && lead > 0 && lead <= 3 && staff.closer) return staff.closer;
    if (inning >= 7 && staff.reliever) return staff.reliever;
    return staff.starter || staff.reliever;
  };

  const halves = [];
  const line = [];
  let aScore = 0, hScore = 0, aHits = 0, hHits = 0;
  let aOrder = 0, hOrder = 0;

  for (let i = 0; i < INNINGS; i++) {
    const top = simHalfInning(away[i], rng, {
      lineup: awayLineup, order: aOrder,
      pitcherAt: () => armFor(homeStaff, i + 1, hScore - aScore),
    });
    aOrder = top.order; aScore += top.runs; aHits += top.hits;
    halves.push({
      inning: i + 1, half: 'top', batting: youHome ? 'opp' : 'you',
      team: awayName, runs: top.runs, hits: top.hits, plays: top.plays,
      away: aScore, home: hScore,
    });
    const row = { top: top.runs, bot: null };

    const lastInning = i === INNINGS - 1;
    const skipBottom = lastInning && !homeBatsNinth;
    if (!skipBottom) {
      const bot = simHalfInning(home[i], rng, {
        lineup: homeLineup, order: hOrder,
        need: (lastInning && need != null) ? need : null,
        pitcherAt: () => armFor(awayStaff, i + 1, aScore - hScore),
      });
      hOrder = bot.order; hScore += bot.runs; hHits += bot.hits;
      halves.push({
        inning: i + 1, half: 'bot', batting: youHome ? 'you' : 'opp',
        team: homeName, runs: bot.runs, hits: bot.hits, plays: bot.plays,
        away: aScore, home: hScore,
        walkoff: lastInning && need != null,
      });
      row.bot = bot.runs;
    }
    line.push(row);
  }

  return {
    youHome,
    away: { name: awayName, lineup: awayLineup, staff: awayStaff, runs: aScore, hits: aHits },
    home: { name: homeName, lineup: homeLineup, staff: homeStaff, runs: hScore, hits: hHits },
    line, halves,
    walkoff: need != null,
    final: {
      away: aScore, home: hScore,
      yourRuns: youHome ? hScore : aScore,
      oppRuns: youHome ? aScore : hScore,
      won: !!opts.won,
    },
  };
}

/*
 * Home field across a best-of-seven is 2-2-1-1-1, and across a best-of-five 2-2-1.
 * Which end of it you are on is the one thing the bracket already knows, so the
 * caller passes it and the animation just has to agree with the line score.
 */
function homeGames(bestOf, hasHomeField) {
  const pattern = bestOf === 7 ? [1, 1, 0, 0, 0, 1, 1] : [1, 1, 0, 0, 1];
  return pattern.map(v => (hasHomeField ? !!v : !v));
}

// ─── coach report (narrative end screen) ─────────────────────────────────────

/*
 * A human read on the roster: concrete strengths, weaknesses, and a one-line
 * verdict. Drives the results screen's "coach's take" so a season ends with
 * words, not just a number. Expects a slot-tagged roster.
 */
function coachReport(roster, chem, structure, rating, unspentMusd) {
  const hitters = roster.filter(p => p.r === 'b');
  const sp1 = roster.find(p => p._slot === 'SP1');
  const sp2 = roster.find(p => p._slot === 'SP2');
  const closer = roster.find(p => p._slot === 'CL');
  const hitWar = hitters.reduce((s, p) => s + p.w, 0);
  const spWar = (sp1 ? sp1.w : 0) + (sp2 ? sp2.w : 0);
  const chemPct = chem ? (chem.multiplier - 1) * 100 : 0;
  const top = roster.slice().sort((a, b) => b.w - a.w)[0];

  const strengths = [], weaknesses = [];
  if (hitWar >= 42) strengths.push('Loaded lineup');
  else if (hitWar < 30) weaknesses.push('Light-hitting lineup');
  if (spWar >= 14) strengths.push('Ace-anchored rotation');
  else if (spWar < 8) weaknesses.push('Thin rotation');
  if (closer && closer.w >= 3) strengths.push('Lights-out bullpen');
  else if (!closer || closer.w < 1.2) weaknesses.push('Shaky closer');
  if (chemPct >= 9) strengths.push('Great clubhouse chemistry');
  else if (chemPct < 1) weaknesses.push('No real chemistry');
  if (structure && structure.archetype && structure.archetype.key === 'one_man_show')
    weaknesses.push(`Leans hard on ${top ? lastNameOf(top.n) : 'one star'}`);
  if (typeof unspentMusd === 'number' && unspentMusd >= 15)
    weaknesses.push(`$${unspentMusd.toFixed(0)}M left unspent`);
  if (structure && structure.archetype && structure.archetype.bonus > 0)
    strengths.push(structure.archetype.name);

  let verdict;
  /* Pinned to what the rating MEANS, re-measured over 390 drafts after the scale
   * was re-anchored on what a draft can actually produce:
   *
   *     90+     104.2 mean wins, 100% Octobers, 20% titles
   *     80-90    97.7 mean wins,  97% Octobers, 10% titles
   *     70-80    88.7 mean wins,  52% Octobers
   *     60-70    81.9 mean wins,  21% Octobers
   *     under 60 72.6 and below,   2% Octobers
   *
   * These moved WITH the scale rather than being retuned: the old set (70 / 55 /
   * 45 / 35) described a scale where 71 was the best anything reached, so left
   * alone it would have called an 88-win wild card team an all-time great. A
   * verdict that promises more than its band delivers is how a 79-83 season
   * ended up under those words the first time. */
  if (rating >= 90) verdict = 'All-time great';
  else if (rating >= 80) verdict = 'World Series contender';
  else if (rating >= 70) verdict = 'Playoff team';
  else if (rating >= 60) verdict = 'Fringe contender';
  else verdict = 'Rebuilding';

  return { strengths, weaknesses, verdict, archetype: structure && structure.archetype };
}

function lastNameOf(n) {
  const parts = String(n).trim().split(/\s+/);
  return parts[parts.length - 1];
}

// ─── full season play ────────────────────────────────────────────────────────

function playRun(roster, rng, slotNames, pool, opts) {
  const staffMode = !!(opts && opts.staff);
  // Tag each player with their actual slot. slotNames maps roster order to
  // slot names (players draft in random order); without it, fall back to
  // assuming the roster is already in SLOTS order.
  const tagged = roster.map((p, i) => ({ ...p, _slot: (slotNames && slotNames[i]) || SLOTS[i] }));

  const chem = resolveChemistry(tagged, opts);
  const structure = staffMode ? { multiplier: 1, archetype: null } : rosterStructure(tagged);
  const offense = staffMode ? staffOffense() : rosterOffense(tagged, chem.multiplier, structure.multiplier);
  const defense = staffMode ? staffRunPrevention(tagged, chem.multiplier)
                            : rosterRunPrevention(tagged, chem.multiplier);
  const savePct = closerSavePct(tagged);

  // 162-game season vs real all-time opponents (pool) or abstract fallback.
  const schedule = generateSchedule(rng, CONSTANTS.REGULAR_SEASON_GAMES, pool);
  const seasonGames = [];
  let wins = 0, losses = 0;
  let totalRS = 0, totalRA = 0;

  for (const game of schedule) {
    const means = gameMeans(offense, defense, game);
    const result = resolveGame(means.runsFor, means.runsAgainst, savePct, rng);
    seasonGames.push({
      game: game.game,
      ...result,
    });
    if (result.won) wins++; else losses++;
    totalRS += result.yourRuns;
    totalRA += result.oppRuns;
  }

  const record = { wins, losses };
  const seed = seedFromRecord(wins);
  /* `rating` is the yardstick: it ranks against real clubs and it sets the title
   * difficulty, and it stays exactly what it was so the balance does not move.
   * `shownRating` is the one the player reads. See teamRating() for why they are
   * two numbers and must not be merged. */
  const rating = staffMode ? staffRating(tagged) : squadRating(roster);
  const shownRating = staffMode ? staffRating(tagged) : teamRating(offense, defense);
  const playoffs = generatePlayoffs(seed, offense, defense, savePct, rng, wins, rating, pool);

  const titleWon = playoffs && playoffs.won;
  const isGOAT = wins >= CONSTANTS.GOAT_WINS;
  const beatRecord = wins >= CONSTANTS.RECORD_WINS;

  return {
    roster: tagged,
    chemistry: chem,
    structure,
    rating,
    shownRating,
    offense: Math.round(offense * 100) / 100,
    defense: Math.round(defense * 100) / 100,
    savePct: Math.round(savePct * 1000) / 1000,
    schedule,
    season: seasonGames,
    record,
    seed,
    playoffs,
    totalRS,
    totalRA,
    titleWon,
    isGOAT,
    beatRecord,
  };
}

// ─── team display data ───────────────────────────────────────────────────────

const TEAM_COLORS = {
  ARI: ['#A71930', '#E3D4AD'], ATL: ['#CE1141', '#13274F'], BAL: ['#DF4601', '#27251F'],
  BOS: ['#BD3039', '#0C2340'], CHC: ['#0E3386', '#CC3433'], CHW: ['#27251F', '#C4CED4'],
  CIN: ['#C6011F', '#000000'], CLE: ['#00385D', '#E31937'], COL: ['#33006F', '#C4CED4'],
  DET: ['#0C2340', '#FA4616'], HOU: ['#002D62', '#EB6E1F'], KCR: ['#004687', '#BD9B60'],
  LAA: ['#BA0021', '#003263'], LAD: ['#005A9C', '#EF3E42'], MIA: ['#00A3E0', '#EF3340'],
  MIL: ['#FFC52F', '#12284B'], MIN: ['#002B5C', '#D31145'], NYM: ['#002D72', '#FF5910'],
  NYY: ['#003087', '#C4CED4'], OAK: ['#003831', '#EFB21E'], PHI: ['#E81828', '#002D72'],
  PIT: ['#27251F', '#FDB827'], SDP: ['#2F241D', '#FFC425'], SFG: ['#FD5A1E', '#27251F'],
  SEA: ['#0C2C56', '#005C5C'], STL: ['#C41E3A', '#0C2340'], TBR: ['#092C5C', '#8FBCE6'],
  TEX: ['#003278', '#C0111F'], TOR: ['#134A8E', '#1D2D5C'], WSN: ['#AB0003', '#14225A'],
  // Historical teams
  BRO: ['#005A9C', '#FFFFFF'], NYG: ['#FD5A1E', '#27251F'], PHO: ['#003831', '#FFFFFF'],
  MLN: ['#CE1141', '#13274F'], MON: ['#003087', '#E4002B'], BSN: ['#CE1141', '#13274F'],
  WSH: ['#AB0003', '#14225A'], SLB: ['#BA0021', '#003263'],
  // The rest of the relocated and renamed clubs, so none of them falls back to
  // gray in the Franchise Mode picker. WSA is the expansion Senators and takes
  // the reverse of WSH's pairing, or the two cards read as the same club.
  PHA: ['#003278', '#C4CED4'], CAL: ['#BA0021', '#003263'], ANA: ['#BA0021', '#0C2340'],
  FLA: ['#0077C8', '#231F20'], TBD: ['#5F259F', '#00A3A3'], WSA: ['#14225A', '#AB0003'],
  KCA: ['#006341', '#FFB81C'],
  // Negro Leagues
  PS: ['#1a1a1a', '#d4af37'], CAG: ['#8B0000', '#FFFFFF'], KCM: ['#003087', '#C4CED4'],
  HG: ['#4A4A4A', '#C4CED4'], NLG: ['#2F4F4F', '#D4AF37'],
};

function teamColors(code) {
  return TEAM_COLORS[code] || ['#333333', '#CCCCCC'];
}

// ─── exports ─────────────────────────────────────────────────────────────────

const publicAPI = {
  CONSTANTS, ERAS, CHEMISTRY, SLOTS, SLOT_ELIGIBILITY,
  STAFF_SLOTS, STAFF_ELIGIBILITY, slotsForMode, eligibilityForMode, slotGroup,
  DIVISIONS, DIVISION_FIRST_SEASON, inDivision, divisionClubs,
  FRANCHISES, CURRENT_FRANCHISES, inFranchise, franchiseOf, franchiseCodes,
  MARKET, replacementFor, workloadWar,
  POSITIONS_AVAILABLE: () => POSITIONS_AVAILABLE,
  setPositionsAvailable,
  hashSeed, createSeededRNG, sampleGamma,
  playerPositions, canFillSlot, teamSeasonId,
  indexData, buildCheapBy,
  pairLinks, resolveChemistry, setCuratedChemistry, setCareers, sharedSeason,
  POSITION_FIT, primaryAt, slotWar, slotBase,
  chemPoints, chemistryByPlayer, chemistryWorth,
  teamStrength, teamWinPct, overallRating, squadRating, nationalRank,
  PROJ, projectedWins, teamRating,
  generateSchedule, buildOpponentPool, generatePlayoffs, gameMeans,
  resolveGame, playoffSeries, playRun,
  BRACKET, bracketSeed, createBracket,
  PA_RATES, simGameScript, simHalfInning, spreadRuns, battingOrder, homeGames,
  lineupFromRoster, staffFromRoster, lineupFromTeamSeason, staffFromTeamSeason,
  seedFromRecord, playoffRoundNames, PLAYOFF_ROUND_NAMES, titleEdge,
  respinCost, respinFees,
  pythagorean, rosterOffense, rosterRunPrevention, rosterStructure, closerSavePct,
  STAFF, staffOffense, staffRunPrevention, staffEra, staffRating,
  coachReport,
  TEAM_COLORS, teamColors,
};

if (typeof module !== 'undefined' && module.exports) module.exports = publicAPI;
if (typeof window !== 'undefined') window.RTD_ENGINE = publicAPI;
})();
