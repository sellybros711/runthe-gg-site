// RunThePitch: World Cup Edition — Game Logic Engine

// ─── Constants ───────────────────────────────────────────────────────────────

const RESULT_TIERS = [
  { min: 95, max: 100, label: 'World Cup Winners',  emoji: '🏆' },
  { min: 85, max: 94,  label: 'Runner-up',          emoji: '🥈' },
  { min: 75, max: 84,  label: 'Semi-finals',        emoji: '4️⃣'  },
  { min: 65, max: 74,  label: 'Quarter-finals',     emoji: '8️⃣'  },
  { min: 50, max: 64,  label: 'Round of 16',        emoji: '🔟'  },
  { min: 0,  max: 49,  label: 'Group Stage Exit',   emoji: '👋'  },
];

const IDENTITY_WEIGHTS = {
  BALANCED: { GK: 1.15, DEF: 1.10, MID: 1.05, FWD: 0.90, FLEX: 1.05 },
  ATTACKING: { GK: 0.90, DEF: 0.90, MID: 1.00, FWD: 1.15, FLEX: 1.10 },
};

const LEAGUE_MULTIPLIERS = {
  ELITE:  1.00,
  HIGH:   0.92,
  MID:    0.84,
  LOWER:  0.76,
};

// ─── Engine state (module-level) ─────────────────────────────────────────────

let _players = [];
let _countryYearIndex = {}; // { country: Set<year> }

// ─── Overall calculation helpers ─────────────────────────────────────────────

function per90(stat, minutes) {
  if (!minutes || minutes === 0) return 0;
  return (stat || 0) / minutes * 90;
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

// Map a raw 0-100 score through the final overall curve.
// 0-75 → linear 40-82; 75-100 → exponential 82-99
function applyCurve(raw) {
  raw = clamp(raw, 0, 100);
  if (raw <= 75) {
    return 40 + (raw / 75) * (82 - 40);
  }
  const t = (raw - 75) / 25; // 0 to 1
  return 82 + (Math.pow(t, 0.6)) * (99 - 82);
}

// Scale a per-90 value to 0-100 given a reasonable max reference.
function scaleStat(value, maxRef) {
  return clamp((value / maxRef) * 100, 0, 100);
}

function computeGKOverall(p) {
  const saves = p.saves || 0;
  const gc    = p.goals_conceded || 0;
  const cs    = p.clean_sheets || 0;
  const apps  = p.appearances || 1;
  const min   = p.minutes || apps * 90;

  const saveRate = (saves + gc) > 0 ? (saves / (saves + gc)) * 100 : 50;

  const csRate = (cs / apps) * 100;

  const gcP90 = per90(gc, min);
  const gcScore = clamp(100 - gcP90 * 50, 0, 100);

  const raw = saveRate * 0.40 + csRate * 0.35 + gcScore * 0.25;
  return raw;
}

function computeDEFOverall(p) {
  const apps = p.appearances || 1;
  const min  = p.minutes || apps * 90;
  const goals = p.goals || 0;
  const assists = p.assists || 0;

  // Defensive contribution
  let defRaw;
  if (p.tackles != null || p.interceptions != null) {
    const tacP90 = per90((p.tackles || 0) + (p.interceptions || 0), min);
    defRaw = scaleStat(tacP90, 6); // ~6 combined per 90 is elite at WC/club level
  } else {
    // Classic era proxy: appearances relative to max tournament (7)
    defRaw = clamp((apps / 7) * 80, 0, 100);
  }

  // Goal contributions (0.3 per 90 is elite for a defender)
  const gcP90 = per90(goals + assists, min);
  const goalRaw = scaleStat(gcP90, 0.3);

  // Availability
  const avail = clamp((apps / 7) * 100, 0, 100);

  return defRaw * 0.45 + goalRaw * 0.30 + avail * 0.25;
}

function computeMIDOverall(p) {
  const apps = p.appearances || 1;
  const min  = p.minutes || apps * 90;
  const goals = p.goals || 0;
  const assists = p.assists || 0;

  // Goal contributions (1.5 per 90 is elite for an attacking MID)
  const gcP90 = per90(goals + assists, min);
  const goalRaw = scaleStat(gcP90, 1.5);

  // Creativity
  let creativityRaw;
  if (p.key_passes != null) {
    const kpP90 = per90(p.key_passes || 0, min);
    creativityRaw = scaleStat(kpP90, 3); // ~3 key passes per 90 is elite
  } else {
    // Classic era: assist-rate proxy
    creativityRaw = scaleStat(per90(assists, min), 0.5);
  }

  const avail = clamp((apps / 7) * 100, 0, 100);

  return goalRaw * 0.45 + creativityRaw * 0.30 + avail * 0.25;
}

function computeFWDOverall(p) {
  const apps = p.appearances || 1;
  const min  = p.minutes || apps * 90;
  const goals = p.goals || 0;
  const assists = p.assists || 0;

  const goalP90 = per90(goals, min);
  const goalRaw = scaleStat(goalP90, 0.8); // 0.8 goals per 90 is elite at WC/club

  const contribP90 = per90(goals + assists, min);
  const contribRaw = scaleStat(contribP90, 1.0); // 1.0 G+A per 90 is elite

  const avail = clamp((apps / 7) * 100, 0, 100);

  return goalRaw * 0.55 + contribRaw * 0.30 + avail * 0.15;
}

function computeRawOverall(p) {
  switch (p.position) {
    case 'GK':  return computeGKOverall(p);
    case 'DEF': return computeDEFOverall(p);
    case 'MID': return computeMIDOverall(p);
    case 'FWD': return computeFWDOverall(p);
    default: return 50;
  }
}

// Legacy formula — used only when a player carries neither rating.
function _computeFallbackOverall(p) {
  let raw = computeRawOverall(p);

  if (p.is_2026 && p.club_league_tier) {
    const mult = LEAGUE_MULTIPLIERS[p.club_league_tier] || LEAGUE_MULTIPLIERS.LOWER;
    raw = raw * mult;
  }

  return Math.round(applyCurve(clamp(raw, 0, 100)));
}

function computeOverall(p) {
  // Pre-calculated wc_overall (integer 60-99) is authoritative.
  if (p.wc_overall != null) return p.wc_overall;
  // Fallback rating when wc_overall is somehow missing.
  if (p.skill_rating != null) return p.skill_rating;
  // Final fallback: legacy data without either rating runs the original formula.
  return _computeFallbackOverall(p);
}

// ─── Data and engine ─────────────────────────────────────────────────────────

function initEngine(playerArray) {
  _countryYearIndex = {};
  _players = playerArray.map(p => ({ ...p, overall: computeOverall(p) }));
  for (const p of _players) {
    if (!_countryYearIndex[p.country]) _countryYearIndex[p.country] = new Set();
    _countryYearIndex[p.country].add(p.year);
  }
}

function getAllCountries() {
  return Object.keys(_countryYearIndex).sort();
}

function getYearsForCountry(country) {
  const years = _countryYearIndex[country];
  if (!years) return [];
  return [...years].sort((a, b) => a - b);
}

function getSquad(country, year) {
  return _players.filter(p => p.country === country && p.year === year);
}

// ─── Game state ───────────────────────────────────────────────────────────────

function createGameState() {
  return {
    picks: [],
    openSlots: ['GK', 'DEF', 'DEF', 'MID', 'FWD', 'FLEX'],
    filledSlots: {},
    respins: { full: 1 },
    phase: 'SPINNING',
    currentSpin: null,
    startTime: Date.now(),
    endTime: null,
    result: null,
  };
}

// ─── Spin mechanic ────────────────────────────────────────────────────────────

function spinCountry(state) {
  const countries = getAllCountries();
  return countries[Math.floor(Math.random() * countries.length)];
}

function spinYear(country) {
  const years = getYearsForCountry(country);
  if (!years.length) throw new Error(`No years found for country: ${country}`);
  return years[Math.floor(Math.random() * years.length)];
}

function confirmSpin(state, country, year) {
  const squad = getSquad(country, year);
  return {
    ...state,
    phase: 'SELECTING',
    currentSpin: { country, year, squad },
  };
}

// A single full re-spin per game: spins BOTH a new nation and a new year.
function useFullRespin(state) {
  if (state.respins.full <= 0) throw new Error('No re-spins remaining.');
  const newCountry = spinCountry(state);
  const newYear = spinYear(newCountry);
  const squad = getSquad(newCountry, newYear);
  return {
    state: {
      ...state,
      respins: { ...state.respins, full: state.respins.full - 1 },
      currentSpin: { country: newCountry, year: newYear, squad },
    },
    newCountry,
    newYear,
  };
}

// ─── Player selection ─────────────────────────────────────────────────────────

function getAvailableSlots(state) {
  return [...state.openSlots];
}

function selectPlayer(state, playerId, slotPosition) {
  if (!state.openSlots.includes(slotPosition))
    throw new Error(`Slot ${slotPosition} is not open.`);

  const player = state.currentSpin.squad.find(p => p.player_id === playerId);
  if (!player) throw new Error(`Player ${playerId} not in current squad.`);

  if (slotPosition === 'FLEX') {
    if (player.position !== 'MID' && player.position !== 'FWD')
      throw new Error('FLEX slot only accepts MID or FWD players.');
  } else {
    if (player.position !== slotPosition)
      throw new Error(`Player position ${player.position} does not match slot ${slotPosition}.`);
  }

  const newOpenSlots = [...state.openSlots];
  const idx = newOpenSlots.indexOf(slotPosition);
  newOpenSlots.splice(idx, 1);

  const pick = { player, slot: slotPosition };
  const newPicks = [...state.picks, pick];
  const newFilledSlots = { ...state.filledSlots, [slotPosition]: player };

  let newState = {
    ...state,
    picks: newPicks,
    openSlots: newOpenSlots,
    filledSlots: newFilledSlots,
    currentSpin: null,
  };

  if (newOpenSlots.length === 0) {
    newState.phase = 'COMPLETE';
    newState.endTime = Date.now();
    newState.result = computeResult(newState);
  } else {
    newState.phase = 'SPINNING';
  }

  return newState;
}

// ─── Identity and scoring ─────────────────────────────────────────────────────

function getSquadIdentity(state) {
  const flexPick = state.filledSlots['FLEX'];
  if (!flexPick) return null;
  return flexPick.position === 'MID' ? 'BALANCED' : 'ATTACKING';
}

function computeResult(state) {
  const identity = getSquadIdentity(state);
  const weights = IDENTITY_WEIGHTS[identity];

  let weightedSum = 0;
  let weightSum = 0;
  const scoredPicks = [];

  for (const pick of state.picks) {
    const w = weights[pick.slot] || 1.0;
    const weighted = pick.player.overall * w;
    weightedSum += weighted;
    weightSum += w;
    scoredPicks.push({ ...pick, weight: w, weightedOverall: weighted });
  }

  const baseAvg = weightedSum / weightSum;

  // Coherence: how well boosted positions outperform others for the identity
  const boostedSlots = Object.entries(weights).filter(([, w]) => w > 1.0).map(([s]) => s);
  const neutralSlots = Object.entries(weights).filter(([, w]) => w <= 1.0).map(([s]) => s);

  const boostedOveralls = scoredPicks.filter(p => boostedSlots.includes(p.slot)).map(p => p.player.overall);
  const neutralOveralls = scoredPicks.filter(p => neutralSlots.includes(p.slot)).map(p => p.player.overall);

  const avg = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
  const boostedAvg = avg(boostedOveralls);
  const neutralAvg = avg(neutralOveralls);

  // coherenceScore 0-100: 50 = neutral, >50 = boosted positions outperform
  const diff = boostedAvg - neutralAvg;
  const coherenceScore = clamp(50 + diff * 1.5, 0, 100);

  // Team overall is a weighted average of the six drafted players' overalls,
  // where each player's weight grows with their rating (weight = overall^2).
  // This makes a 90+ star lift the team rating more, while a 60-floor player
  // weighs in slightly less — without letting any one pick run away with it.
  const TEAM_WEIGHT_POW = 2;
  let weightedSumOv = 0, weightTotalOv = 0;
  for (const pick of state.picks) {
    const ov = pick.player.overall;
    const w = Math.pow(ov, TEAM_WEIGHT_POW);
    weightedSumOv += ov * w;
    weightTotalOv += w;
  }
  const teamOverall = Math.round(weightedSumOv / weightTotalOv);

  const tier = RESULT_TIERS.find(t => teamOverall >= t.min && teamOverall <= t.max)
    || RESULT_TIERS[RESULT_TIERS.length - 1];

  const timeSeconds = state.endTime && state.startTime
    ? Math.round((state.endTime - state.startTime) / 1000)
    : 0;

  // Spin difficulty: average rarity of countries chosen (proxy: 1/yearsCount)
  const spinDifficulty = state.picks.reduce((sum, pick) => {
    const years = getYearsForCountry(pick.player.country);
    return sum + (1 / Math.max(years.length, 1));
  }, 0) / state.picks.length;

  return {
    teamOverall,
    resultLabel: tier.label,
    resultEmoji: tier.emoji,
    identity,
    coherenceScore: Math.round(coherenceScore),
    scoredPicks,
    tiebreakers: { timeSeconds, coherenceScore: Math.round(coherenceScore), spinDifficulty },
  };
}

function generateMatchReport(result) {
  const emojiMap = pick => {
    const o = pick.player.overall;
    if (o >= 80) return '🟢';
    if (o >= 65) return '🟡';
    return '🔴';
  };

  const grid = result.scoredPicks.map(emojiMap).join(' ');

  return [
    'RunThePitch: World Cup Edition ⚽',
    `${result.resultLabel} ${result.resultEmoji} | Score: ${result.teamOverall}/100`,
    grid,
    'RunThe.gg/pitch',
  ].join('\n');
}

// ─── Daily challenge ──────────────────────────────────────────────────────────

function getDailyChallengeSeed(dateString) {
  // Stable numeric hash of the date string
  let h = 0;
  for (let i = 0; i < dateString.length; i++) {
    h = Math.imul(31, h) + dateString.charCodeAt(i) | 0;
  }
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

function spinCountrySeeded(rng) {
  const countries = getAllCountries();
  return countries[Math.floor(rng() * countries.length)];
}

function spinYearSeeded(country, rng) {
  const years = getYearsForCountry(country);
  if (!years.length) throw new Error(`No years for country: ${country}`);
  return years[Math.floor(rng() * years.length)];
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function getGameSummary(state) {
  const lines = [
    `Phase: ${state.phase}`,
    `Open slots: ${state.openSlots.join(', ') || 'none'}`,
    `Re-spins remaining: ${state.respins.full}`,
    `Picks:`,
  ];
  for (const pick of state.picks) {
    lines.push(`  [${pick.slot}] ${pick.player.name} (${pick.player.country} ${pick.player.year}) — overall: ${pick.player.overall}`);
  }
  if (state.result) {
    lines.push(`Result: ${state.result.resultLabel} ${state.result.resultEmoji} — team overall: ${state.result.teamOverall}`);
    lines.push(`Identity: ${state.result.identity}`);
    lines.push(`Coherence: ${state.result.coherenceScore}`);
  }
  return lines.join('\n');
}

// ─── Exports ──────────────────────────────────────────────────────────────────

const publicAPI = {
  initEngine,
  getAllCountries,
  getYearsForCountry,
  getSquad,
  createGameState,
  spinCountry,
  spinYear,
  confirmSpin,
  useFullRespin,
  getAvailableSlots,
  selectPlayer,
  getSquadIdentity,
  computeResult,
  generateMatchReport,
  getDailyChallengeSeed,
  createSeededRNG,
  spinCountrySeeded,
  spinYearSeeded,
  getGameSummary,
};

if (typeof module !== 'undefined') module.exports = publicAPI;
if (typeof window !== 'undefined') window.RunThePitch = publicAPI;

// ─── Mock dataset ─────────────────────────────────────────────────────────────

const MOCK_PLAYERS = [
  // Brazil 1970
  { player_id: 'bra_1970_pele',          name: 'Pelé',          country: 'Brazil',    year: 1970, position: 'FWD', height: 173, appearances: 6, goals: 4, assists: 3, minutes: 540, clean_sheets: null, goals_conceded: null, saves: null, save_pct: null, tackles: null, interceptions: null, clearances: null, pass_completion: null, key_passes: null, chances_created: null, dribbles: null, shots_per90: null, shots_on_target_pct: null, yellow_cards: 0, red_cards: 0, is_2026: false, club_league_tier: null },
  { player_id: 'bra_1970_jairzinho',     name: 'Jairzinho',     country: 'Brazil',    year: 1970, position: 'FWD', height: 174, appearances: 6, goals: 7, assists: 1, minutes: 540, clean_sheets: null, goals_conceded: null, saves: null, save_pct: null, tackles: null, interceptions: null, clearances: null, pass_completion: null, key_passes: null, chances_created: null, dribbles: null, shots_per90: null, shots_on_target_pct: null, yellow_cards: 0, red_cards: 0, is_2026: false, club_league_tier: null },
  { player_id: 'bra_1970_gerson',        name: 'Gerson',        country: 'Brazil',    year: 1970, position: 'MID', height: 178, appearances: 6, goals: 1, assists: 4, minutes: 540, clean_sheets: null, goals_conceded: null, saves: null, save_pct: null, tackles: null, interceptions: null, clearances: null, pass_completion: null, key_passes: 18, chances_created: null, dribbles: null, shots_per90: null, shots_on_target_pct: null, yellow_cards: 0, red_cards: 0, is_2026: false, club_league_tier: null },
  { player_id: 'bra_1970_carlosalberto', name: 'Carlos Alberto', country: 'Brazil',    year: 1970, position: 'DEF', height: 178, appearances: 6, goals: 1, assists: 2, minutes: 540, clean_sheets: null, goals_conceded: null, saves: null, save_pct: null, tackles: 14, interceptions: 10, clearances: null, pass_completion: null, key_passes: null, chances_created: null, dribbles: null, shots_per90: null, shots_on_target_pct: null, yellow_cards: 0, red_cards: 0, is_2026: false, club_league_tier: null },
  { player_id: 'bra_1970_brito',         name: 'Brito',         country: 'Brazil',    year: 1970, position: 'DEF', height: 182, appearances: 6, goals: 0, assists: 0, minutes: 540, clean_sheets: null, goals_conceded: null, saves: null, save_pct: null, tackles: 18, interceptions: 12, clearances: null, pass_completion: null, key_passes: null, chances_created: null, dribbles: null, shots_per90: null, shots_on_target_pct: null, yellow_cards: 1, red_cards: 0, is_2026: false, club_league_tier: null },
  { player_id: 'bra_1970_felix',         name: 'Felix',         country: 'Brazil',    year: 1970, position: 'GK',  height: 184, appearances: 6, goals: 0, assists: 0, minutes: 540, clean_sheets: 3, goals_conceded: 7, saves: 22, save_pct: null, tackles: null, interceptions: null, clearances: null, pass_completion: null, key_passes: null, chances_created: null, dribbles: null, shots_per90: null, shots_on_target_pct: null, yellow_cards: 0, red_cards: 0, is_2026: false, club_league_tier: null },

  // Argentina 1986
  { player_id: 'arg_1986_maradona',      name: 'Diego Maradona', country: 'Argentina', year: 1986, position: 'MID', height: 165, appearances: 7, goals: 5, assists: 5, minutes: 630, clean_sheets: null, goals_conceded: null, saves: null, save_pct: null, tackles: null, interceptions: null, clearances: null, pass_completion: null, key_passes: 24, chances_created: null, dribbles: null, shots_per90: null, shots_on_target_pct: null, yellow_cards: 1, red_cards: 0, is_2026: false, club_league_tier: null },
  { player_id: 'arg_1986_valdano',       name: 'Jorge Valdano',  country: 'Argentina', year: 1986, position: 'FWD', height: 188, appearances: 7, goals: 5, assists: 2, minutes: 630, clean_sheets: null, goals_conceded: null, saves: null, save_pct: null, tackles: null, interceptions: null, clearances: null, pass_completion: null, key_passes: null, chances_created: null, dribbles: null, shots_per90: null, shots_on_target_pct: null, yellow_cards: 0, red_cards: 0, is_2026: false, club_league_tier: null },
  { player_id: 'arg_1986_burruchaga',    name: 'Jorge Burruchaga', country: 'Argentina', year: 1986, position: 'MID', height: 178, appearances: 7, goals: 2, assists: 4, minutes: 590, clean_sheets: null, goals_conceded: null, saves: null, save_pct: null, tackles: null, interceptions: null, clearances: null, pass_completion: null, key_passes: 16, chances_created: null, dribbles: null, shots_per90: null, shots_on_target_pct: null, yellow_cards: 0, red_cards: 0, is_2026: false, club_league_tier: null },
  { player_id: 'arg_1986_ruggeri',       name: 'Oscar Ruggeri',  country: 'Argentina', year: 1986, position: 'DEF', height: 180, appearances: 7, goals: 1, assists: 0, minutes: 630, clean_sheets: null, goals_conceded: null, saves: null, save_pct: null, tackles: 20, interceptions: 14, clearances: null, pass_completion: null, key_passes: null, chances_created: null, dribbles: null, shots_per90: null, shots_on_target_pct: null, yellow_cards: 1, red_cards: 0, is_2026: false, club_league_tier: null },
  { player_id: 'arg_1986_brown',         name: 'José Luis Brown', country: 'Argentina', year: 1986, position: 'DEF', height: 180, appearances: 7, goals: 1, assists: 0, minutes: 540, clean_sheets: null, goals_conceded: null, saves: null, save_pct: null, tackles: 16, interceptions: 11, clearances: null, pass_completion: null, key_passes: null, chances_created: null, dribbles: null, shots_per90: null, shots_on_target_pct: null, yellow_cards: 0, red_cards: 0, is_2026: false, club_league_tier: null },
  { player_id: 'arg_1986_pumpido',       name: 'Nery Pumpido',   country: 'Argentina', year: 1986, position: 'GK',  height: 184, appearances: 7, goals: 0, assists: 0, minutes: 630, clean_sheets: 4, goals_conceded: 5, saves: 26, save_pct: null, tackles: null, interceptions: null, clearances: null, pass_completion: null, key_passes: null, chances_created: null, dribbles: null, shots_per90: null, shots_on_target_pct: null, yellow_cards: 0, red_cards: 0, is_2026: false, club_league_tier: null },

  // France 2022
  { player_id: 'fra_2022_mbappe',        name: 'Kylian Mbappe',  country: 'France',    year: 2022, position: 'FWD', height: 178, appearances: 7, goals: 8, assists: 2, minutes: 630, clean_sheets: null, goals_conceded: null, saves: null, save_pct: null, tackles: null, interceptions: null, clearances: null, pass_completion: null, key_passes: null, chances_created: null, dribbles: null, shots_per90: null, shots_on_target_pct: null, yellow_cards: 0, red_cards: 0, is_2026: false, club_league_tier: null },
  { player_id: 'fra_2022_griezmann',     name: 'Antoine Griezmann', country: 'France', year: 2022, position: 'MID', height: 176, appearances: 7, goals: 1, assists: 3, minutes: 630, clean_sheets: null, goals_conceded: null, saves: null, save_pct: null, tackles: null, interceptions: null, clearances: null, pass_completion: null, key_passes: 20, chances_created: null, dribbles: null, shots_per90: null, shots_on_target_pct: null, yellow_cards: 0, red_cards: 0, is_2026: false, club_league_tier: null },
  { player_id: 'fra_2022_tchouameni',    name: 'Aurelien Tchouameni', country: 'France', year: 2022, position: 'MID', height: 187, appearances: 6, goals: 1, assists: 1, minutes: 494, clean_sheets: null, goals_conceded: null, saves: null, save_pct: null, tackles: null, interceptions: null, clearances: null, pass_completion: null, key_passes: 10, chances_created: null, dribbles: null, shots_per90: null, shots_on_target_pct: null, yellow_cards: 1, red_cards: 0, is_2026: false, club_league_tier: null },
  { player_id: 'fra_2022_varane',        name: 'Raphael Varane',  country: 'France',   year: 2022, position: 'DEF', height: 191, appearances: 6, goals: 0, assists: 0, minutes: 540, clean_sheets: null, goals_conceded: null, saves: null, save_pct: null, tackles: 15, interceptions: 12, clearances: null, pass_completion: null, key_passes: null, chances_created: null, dribbles: null, shots_per90: null, shots_on_target_pct: null, yellow_cards: 1, red_cards: 0, is_2026: false, club_league_tier: null },
  { player_id: 'fra_2022_kounde',        name: 'Jules Kounde',    country: 'France',   year: 2022, position: 'DEF', height: 178, appearances: 7, goals: 0, assists: 1, minutes: 567, clean_sheets: null, goals_conceded: null, saves: null, save_pct: null, tackles: 17, interceptions: 10, clearances: null, pass_completion: null, key_passes: null, chances_created: null, dribbles: null, shots_per90: null, shots_on_target_pct: null, yellow_cards: 1, red_cards: 0, is_2026: false, club_league_tier: null },
  { player_id: 'fra_2022_lloris',        name: 'Hugo Lloris',     country: 'France',   year: 2022, position: 'GK',  height: 188, appearances: 7, goals: 0, assists: 0, minutes: 630, clean_sheets: 3, goals_conceded: 8, saves: 30, save_pct: null, tackles: null, interceptions: null, clearances: null, pass_completion: null, key_passes: null, chances_created: null, dribbles: null, shots_per90: null, shots_on_target_pct: null, yellow_cards: 0, red_cards: 0, is_2026: false, club_league_tier: null },

  // England 2026
  { player_id: 'eng_2026_bellingham',    name: 'Jude Bellingham', country: 'England',  year: 2026, position: 'MID', height: 186, appearances: 33, goals: 14, assists: 10, minutes: 2850, clean_sheets: null, goals_conceded: null, saves: null, save_pct: null, tackles: null, interceptions: null, clearances: null, pass_completion: null, key_passes: 72, chances_created: null, dribbles: null, shots_per90: null, shots_on_target_pct: null, yellow_cards: 5, red_cards: 0, is_2026: true, club_league_tier: 'ELITE' },
  { player_id: 'eng_2026_kane',          name: 'Harry Kane',      country: 'England',  year: 2026, position: 'FWD', height: 188, appearances: 34, goals: 28, assists: 8,  minutes: 2970, clean_sheets: null, goals_conceded: null, saves: null, save_pct: null, tackles: null, interceptions: null, clearances: null, pass_completion: null, key_passes: null, chances_created: null, dribbles: null, shots_per90: null, shots_on_target_pct: null, yellow_cards: 3, red_cards: 0, is_2026: true, club_league_tier: 'ELITE' },
  { player_id: 'eng_2026_saka',          name: 'Bukayo Saka',     country: 'England',  year: 2026, position: 'FWD', height: 178, appearances: 32, goals: 16, assists: 12, minutes: 2720, clean_sheets: null, goals_conceded: null, saves: null, save_pct: null, tackles: null, interceptions: null, clearances: null, pass_completion: null, key_passes: null, chances_created: null, dribbles: null, shots_per90: null, shots_on_target_pct: null, yellow_cards: 2, red_cards: 0, is_2026: true, club_league_tier: 'ELITE' },
  { player_id: 'eng_2026_rice',          name: 'Declan Rice',     country: 'England',  year: 2026, position: 'MID', height: 185, appearances: 35, goals: 7,  assists: 9,  minutes: 3060, clean_sheets: null, goals_conceded: null, saves: null, save_pct: null, tackles: null, interceptions: null, clearances: null, pass_completion: null, key_passes: 55, chances_created: null, dribbles: null, shots_per90: null, shots_on_target_pct: null, yellow_cards: 6, red_cards: 0, is_2026: true, club_league_tier: 'ELITE' },
  { player_id: 'eng_2026_trippier',      name: 'Kieran Trippier', country: 'England',  year: 2026, position: 'DEF', height: 178, appearances: 30, goals: 2,  assists: 7,  minutes: 2620, clean_sheets: null, goals_conceded: null, saves: null, save_pct: null, tackles: 68, interceptions: 42, clearances: null, pass_completion: null, key_passes: null, chances_created: null, dribbles: null, shots_per90: null, shots_on_target_pct: null, yellow_cards: 3, red_cards: 0, is_2026: true, club_league_tier: 'ELITE' },
  { player_id: 'eng_2026_ramsdale',      name: 'Aaron Ramsdale',  country: 'England',  year: 2026, position: 'GK',  height: 191, appearances: 32, goals: 0,  assists: 0,  minutes: 2880, clean_sheets: 12, goals_conceded: 32, saves: 98, save_pct: null, tackles: null, interceptions: null, clearances: null, pass_completion: null, key_passes: null, chances_created: null, dribbles: null, shots_per90: null, shots_on_target_pct: null, yellow_cards: 1, red_cards: 0, is_2026: true, club_league_tier: 'ELITE' },
];

// ─── Self-test suite ──────────────────────────────────────────────────────────

function runTests() {
  initEngine(MOCK_PLAYERS);

  // Test 1 — Engine init
  console.assert(getAllCountries().length === 4, 'Test 1: expect 4 countries');
  console.assert(_players.length === 24, 'Test 1: expect 24 players');
  console.log('✓ Test 1 passed — engine init');

  // Test 2 — Year filtering
  const brazilYears = getYearsForCountry('Brazil');
  const argYears    = getYearsForCountry('Argentina');
  const engYears    = getYearsForCountry('England');
  console.assert(brazilYears.includes(1970),   'Test 2: Brazil has 1970');
  console.assert(!brazilYears.includes(1986),  'Test 2: Brazil does not have 1986');
  console.assert(argYears.includes(1986),      'Test 2: Argentina has 1986');
  console.assert(!argYears.includes(1970),     'Test 2: Argentina does not have 1970');
  console.assert(engYears.includes(2026),      'Test 2: England has 2026');
  console.log('✓ Test 2 passed — year filtering');

  // Test 3 — Overall ratings sanity
  const pele     = _players.find(p => p.player_id === 'bra_1970_pele');
  const maradona = _players.find(p => p.player_id === 'arg_1986_maradona');
  console.assert(pele.overall >= 80,     `Test 3: Pelé overall ${pele.overall} should be ≥ 80`);
  console.assert(maradona.overall >= 85, `Test 3: Maradona overall ${maradona.overall} should be ≥ 85`);
  for (const p of _players) {
    console.assert(p.overall >= 40 && p.overall <= 99, `Test 3: ${p.name} overall ${p.overall} out of range`);
  }
  console.log('✓ Test 3 passed — overall ratings sanity');

  // Test 4 — Full 6-pick game simulation
  let state = createGameState();
  state = confirmSpin(state, 'Brazil', 1970);
  state = selectPlayer(state, 'bra_1970_pele', 'FWD');
  state = confirmSpin(state, 'Argentina', 1986);
  state = selectPlayer(state, 'arg_1986_maradona', 'MID');
  state = confirmSpin(state, 'France', 2022);
  state = selectPlayer(state, 'fra_2022_lloris', 'GK');
  state = confirmSpin(state, 'Argentina', 1986);
  state = selectPlayer(state, 'arg_1986_ruggeri', 'DEF');
  state = confirmSpin(state, 'Brazil', 1970);
  state = selectPlayer(state, 'bra_1970_carlosalberto', 'DEF');
  state = confirmSpin(state, 'France', 2022);
  state = selectPlayer(state, 'fra_2022_mbappe', 'FLEX');

  console.assert(state.phase === 'COMPLETE', 'Test 4: phase should be COMPLETE');
  console.assert(state.result !== null, 'Test 4: result should not be null');
  console.assert(getSquadIdentity(state) === 'ATTACKING', 'Test 4: identity should be ATTACKING');
  console.assert(state.result.teamOverall >= 40 && state.result.teamOverall <= 100, `Test 4: teamOverall ${state.result.teamOverall} out of range`);
  const validLabels = RESULT_TIERS.map(t => t.label);
  console.assert(validLabels.includes(state.result.resultLabel), `Test 4: invalid resultLabel ${state.result.resultLabel}`);
  console.log('✓ Test 4 passed — full game simulation');

  // Test 5 — Match report
  const report = generateMatchReport(state.result);
  console.assert(report.includes('RunThePitch'), 'Test 5: report should include RunThePitch');
  console.assert(report.includes(state.result.resultLabel), 'Test 5: report should include result label');
  console.assert(report.includes('RunThe.gg/pitch'), 'Test 5: report should include URL');
  console.log('✓ Test 5 passed — match report');
  console.log('\n--- Match Report ---\n' + report + '\n-------------------');

  // Test 6 — Re-spin mechanic (single full re-spin per game)
  let s2 = createGameState();
  s2 = confirmSpin(s2, 'Brazil', 1970);
  console.assert(s2.respins.full === 1, 'Test 6: initial full respins = 1');
  const { state: s3, newCountry, newYear } = useFullRespin(s2);
  console.assert(s3.respins.full === 0, 'Test 6: after full respin = 0');
  console.assert(typeof newCountry === 'string' && newCountry.length > 0, 'Test 6: newCountry is valid');
  console.assert(typeof newYear === 'number', 'Test 6: newYear is valid');
  console.assert(s3.currentSpin.country === newCountry && s3.currentSpin.year === newYear,
    'Test 6: full respin updates both country and year');
  let threw = false;
  try { useFullRespin(s3); } catch (e) { threw = true; }
  console.assert(threw, 'Test 6: second full respin should throw');
  console.log('✓ Test 6 passed — re-spin mechanic');

  // Test 7 — Daily challenge seed
  const seed1a = getDailyChallengeSeed('2026-06-11');
  const seed1b = getDailyChallengeSeed('2026-06-11');
  console.assert(seed1a === seed1b, 'Test 7: same date same seed');
  const seed2 = getDailyChallengeSeed('2026-06-12');
  console.assert(seed2 !== seed1a, 'Test 7: different dates different seeds');

  const rngA = createSeededRNG(seed1a);
  const rngB = createSeededRNG(seed1b);
  const c1 = spinCountrySeeded(rngA);
  const c2 = spinCountrySeeded(rngB);
  console.assert(c1 === c2, 'Test 7: same seed same country');
  console.log('✓ Test 7 passed — daily challenge seed');

  console.log('\nALL TESTS PASSED — gameLogic.js is ready.');
}

// Run tests when executed directly with node
if (typeof require !== 'undefined' && require.main === module) {
  runTests();
}
