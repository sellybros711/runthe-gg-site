/* Run The Diamond — game engine.
 *
 * Headless and dependency-free. Browser: window.RTD_ENGINE. Node:
 * require('./engine.js'). Mirror of The Perfect Season's engine.js,
 * adapted for baseball: 12-slot roster, 162-game season, BaseRuns
 * offense, Pythagorean expectation, LDS→LCS→World Series playoffs.
 */

'use strict';
(function() {

const CONSTANTS = {
  CAP_MUSD: 245,
  REGULAR_SEASON_GAMES: 162,

  RESPIN_LADDER_MUSD: [5, 10, 15],
  MAX_RESPINS: 3,
  MIN_RESERVE_PER_SLOT_MUSD: 1,

  /* Playoff thresholds — calibrated to the 162-game sim.
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
  OPP_OFF_MEAN: 5.25,
  OPP_DEF_MEAN: 3.98,

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

  /* Closer save conversion rate — base rate for an average closer. */
  CLOSER_BASE_SAVE_PCT: 0.80,
  CLOSER_WAR_SCALE: 0.02,

  /* League-average filler for rotation depth behind SP1/SP2. */
  FILLER_ERA: 4.50,
  FILLER_IP_SHARE: 0.55,

  /* SP anchor innings — the abstraction from GDD §8. */
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

/* 12 roster slots per GDD §3. */
const SLOTS = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH', 'SP1', 'SP2', 'CL'];

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
  LF:  ['LF'],
  CF:  ['CF'],
  RF:  ['RF'],
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
function canFillSlot(player, slotName) {
  const eligible = SLOT_ELIGIBILITY[slotName];
  if (!eligible) return false;
  const positions = playerPositions(player);
  return positions.some(pos => eligible.includes(pos));
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

  for (const p of players) {
    const tsId = teamSeasonId(p.t, p.s);
    /* Role is part of the key: two-way players (e.g. 1919 Ruth) have both
     * a batter and a pitcher row for the same season, and they must not
     * collide or the board can resolve a click to the wrong row. */
    const key = `${p.i}|${p.s}|${p.r}`;
    allPlayers[key] = p;

    if (!byTeamSeason[tsId]) byTeamSeason[tsId] = [];
    byTeamSeason[tsId].push(p);
  }

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

  return {
    players,
    allPlayers,
    byTeamSeason,
    teamSeasons,
    cheapBy,
  };
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
    reunion:   0.08,
    franchise: 0.04,
    dp_combo:  0.06,
    battery:   0.07,
    /* Era is a weak ambient link — kept small so the deliberate links
     * (reunion/battery/DP) are what actually move the needle. */
    era:       0.005,
  },
  MIN: -0.10,
  MAX: 0.15,
};

/*
 * Baseball chemistry per GDD §10:
 * - Reunion: same team + same season (e.g. three '27 Yankees)
 * - Franchise loyalty: same team, different seasons
 * - DP combo: 2B + SS from the same team-season
 * - Battery: C + pitcher from same team-season
 * - Era: within 3 seasons of each other
 */
function pairLinks(a, b) {
  const links = [];
  const sameTeam = a.t === b.t;
  const sameSeason = a.s === b.s;

  if (sameTeam && sameSeason) {
    links.push({ type: 'reunion', value: CHEMISTRY.VALUES.reunion,
      label: `${a.s} ${a.t} reunion` });
  }

  if (sameTeam && !sameSeason) {
    links.push({ type: 'franchise', value: CHEMISTRY.VALUES.franchise,
      label: `${a.t} franchise` });
  }

  // DP combo: 2B + SS from same team-season
  if (sameTeam && sameSeason) {
    const aPos = playerPositions(a);
    const bPos = playerPositions(b);
    const has2B = aPos.includes('2B') || bPos.includes('2B');
    const hasSS = aPos.includes('SS') || bPos.includes('SS');
    if (has2B && hasSS) {
      links.push({ type: 'dp_combo', value: CHEMISTRY.VALUES.dp_combo,
        label: 'Double-play combo' });
    }
  }

  // Battery: C + pitcher from same team-season
  if (sameTeam && sameSeason) {
    const aPos = playerPositions(a);
    const bPos = playerPositions(b);
    const hasC = aPos.includes('C');
    const hasPitcher = bPos.includes('SP') || bPos.includes('CL') || bPos.includes('RP');
    const hasCReverse = bPos.includes('C');
    const hasPitcherReverse = aPos.includes('SP') || aPos.includes('CL') || aPos.includes('RP');
    if ((hasC && hasPitcher) || (hasCReverse && hasPitcherReverse)) {
      links.push({ type: 'battery', value: CHEMISTRY.VALUES.battery,
        label: 'Batterymates' });
    }
  }

  // Era: within 3 years
  if (Math.abs(a.s - b.s) <= 3 && !(sameTeam && sameSeason)) {
    links.push({ type: 'era', value: CHEMISTRY.VALUES.era,
      label: 'Same era' });
  }

  return links;
}

function resolveChemistry(roster) {
  const links = [];
  for (let i = 0; i < roster.length; i++) {
    for (let j = i + 1; j < roster.length; j++) {
      const plinks = pairLinks(roster[i], roster[j]);
      for (const l of plinks) {
        links.push({ ...l, a: roster[i].n, b: roster[j].n });
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
  const totalWar = hitters.reduce((s, p) => s + p.w, 0);
  const baseRPG = REPLACEMENT_RPG + totalWar * WAR_TO_RPG;
  return baseRPG * chemMultiplier * (battingOrderBonus || 1.0);
}

/*
 * PITCHING + DEFENSE: Run prevention.
 *
 * SP1 and SP2 are rotation anchors (GDD §8). They cover ~45% of innings
 * between them; the rest is league-average filler.
 *
 * The closer converts save situations — a bad closer literally blows wins.
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
  const spEra = (sp) => {
    if (!sp) return CONSTANTS.FILLER_ERA;
    return Math.max(1.6, 5.0 - sp.w * 0.32);
  };

  const sp1Era = spEra(sp1);
  const sp2Era = spEra(sp2);

  // Weighted staff ERA: SP1+SP2 cover 45%, filler covers 55%
  const anchorShare = 1 - CONSTANTS.FILLER_IP_SHARE;
  const staffEra = (sp1Era + sp2Era) / 2 * anchorShare + CONSTANTS.FILLER_ERA * CONSTANTS.FILLER_IP_SHARE;

  // Convert ERA to runs allowed per game (ERA ≈ earned runs/9IP, close to R/G)
  const baseRA = staffEra * 1.08; // unearned run factor

  // Defense modifier from fielders' WAR (each WAR saves ~10 runs/162 games)
  const defWar = fielders.reduce((s, p) => s + Math.max(0, p.w - 2) * 0.15, 0);
  const defMod = Math.max(0.85, 1.0 - defWar * 0.005);

  return baseRA * defMod * (2 - chemMultiplier);
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
      oppRuns += margin + 0.5; // blown save — opponent scores to win
    }
  }

  // Round to whole runs for display
  const yR = Math.max(0, Math.round(yourRuns));
  const oR = Math.max(0, Math.round(oppRuns));

  let won;
  if (yR > oR) won = true;
  else if (yR < oR) won = false;
  else won = rng() < 0.5; // extra innings coin flip

  return {
    won,
    yourRuns: yR,
    oppRuns: oR,
  };
}

// ─── schedule ────────────────────────────────────────────────────────────────

function generateSchedule(rng, games) {
  const count = games || CONSTANTS.REGULAR_SEASON_GAMES;
  const schedule = [];
  for (let i = 0; i < count; i++) {
    // Opponent strength: how they hit (oppRunsScored) and how they pitch
    // (oppRunsAllowed), sampled around the all-time-roster baselines.
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
 * their scoring scales YOUR run prevention by their offense quality —
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

function generatePlayoffs(seed, runsFor, runsAgainst, savePct, rng, regularWins) {
  if (!seed.made) return null;

  const rounds = playoffRoundNames(seed.rounds);
  const results = [];
  let alive = true;

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
    // Opponents get tougher each round
    const roundDifficulty = 1 + i * CONSTANTS.PLAYOFF_ROUND_STEP;
    const oppRA = defAdj * roundDifficulty;

    // Best-of-5 for WC and LDS, best-of-7 for LCS and WS
    const bestOf = (roundName === 'Wild Card' || roundName === 'Division Series') ? 5 : 7;

    const adv = seed.bye ? baseAdv : Math.max(1, baseAdv * 0.85);

    const series = playoffSeries(offAdj, oppRA, savePct, rng, bestOf, adv);
    results.push({
      round: roundName,
      ...series,
    });

    if (!series.won) alive = false;
  }

  const won = results.length > 0 && results[results.length - 1].won &&
    results[results.length - 1].round === 'World Series';

  return { rounds: results, won };
}

// ─── full season play ────────────────────────────────────────────────────────

function playRun(roster, rng, slotNames) {
  // Tag each player with their actual slot. slotNames maps roster order to
  // slot names (players draft in random order); without it, fall back to
  // assuming the roster is already in SLOTS order.
  const tagged = roster.map((p, i) => ({ ...p, _slot: (slotNames && slotNames[i]) || SLOTS[i] }));

  const chem = resolveChemistry(tagged);
  const offense = rosterOffense(tagged, chem.multiplier, 1.0);
  const defense = rosterRunPrevention(tagged, chem.multiplier);
  const savePct = closerSavePct(tagged);

  // 162-game season
  const schedule = generateSchedule(rng, CONSTANTS.REGULAR_SEASON_GAMES);
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
  const playoffs = generatePlayoffs(seed, offense, defense, savePct, rng, wins);

  const titleWon = playoffs && playoffs.won;
  const isGOAT = wins >= CONSTANTS.GOAT_WINS;
  const beatRecord = wins >= CONSTANTS.RECORD_WINS;

  return {
    roster: tagged,
    chemistry: chem,
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
  POSITIONS_AVAILABLE: () => POSITIONS_AVAILABLE,
  setPositionsAvailable,
  hashSeed, createSeededRNG, sampleGamma,
  playerPositions, canFillSlot, teamSeasonId,
  indexData, buildCheapBy,
  pairLinks, resolveChemistry,
  generateSchedule, generatePlayoffs, gameMeans,
  resolveGame, playoffSeries, playRun,
  seedFromRecord, playoffRoundNames, PLAYOFF_ROUND_NAMES,
  respinCost, respinFees,
  pythagorean, rosterOffense, rosterRunPrevention, closerSavePct,
  TEAM_COLORS, teamColors,
};

if (typeof module !== 'undefined' && module.exports) module.exports = publicAPI;
if (typeof window !== 'undefined') window.RTD_ENGINE = publicAPI;
})();
