/* Run The Diamond — draft loop and run state.
 *
 * Headless and dependency-free. Browser: window.RTD_RUN. Node: require.
 *
 * Mirrors The Perfect Season's run.js: a plain serializable run object
 * with a seeded RNG, 12-slot roster (C/1B/2B/3B/SS/LF/CF/RF/DH/SP1/SP2/CL),
 * spin draft, $245M cap, season sim, playoffs.
 */

'use strict';
(function() {

const E = (typeof require !== 'undefined')
  ? require('./engine.js')
  : window.RTD_ENGINE;

/* Cached indexed data (opponent pool + rating table) for the sim, so the
 * season functions don't need `data` threaded through every call. */
let _data = null;

const PHASES = {
  DRAFT: 'draft',
  SEASON: 'season',
  SEEDING: 'seeding',
  PLAYOFFS: 'playoffs',
  OVER: 'over',
};

/* Role is part of the key so two-way players' batter and pitcher rows
 * (same id + season) never collide. Must match engine indexData. */
const pkey = (p) => `${p.i}|${p.s}|${p.r}`;

const money = (v) => Math.round(v * 100) / 100;

const TUNING = {
  MAX_DRAWS_PER_TEAM_SEASON: 2,
  SPIN_OPTIONS: 3,
};

function capOf(run) {
  return typeof run.capMusd === 'number' && isFinite(run.capMusd)
    ? run.capMusd : E.CONSTANTS.CAP_MUSD;
}

function remaining(run) {
  const spent = run.roster.reduce((s, p) => s + p.p, 0);
  const fees = E.respinFees(run.respinsUsed);
  return money(capOf(run) - spent - fees);
}

const slotsLeft = (run) => E.SLOTS.length - run.roster.length;

/* Cheapest player that could still fill `slotName` right now: not already
 * used (by id or already earmarked), from a team-season not maxed on draws.
 * cheapBy[pos] is price-sorted, so the first valid candidate is the cheapest.
 * Returns the price and the earmarked key so the caller avoids double-count. */
function cheapestForSlot(slotName, usedIds, drawn, taken) {
  const pool = _data && _data.cheapBy && _data.cheapBy['*'];
  const FLOOR = E.CONSTANTS.MIN_RESERVE_PER_SLOT_MUSD;
  if (!pool) return { price: FLOOR, key: null };
  const elig = E.SLOT_ELIGIBILITY[slotName] || [];
  let best = { price: Infinity, key: null };
  for (const pos of elig) {
    const list = pool[pos];
    if (!list) continue;
    for (const c of list) {
      if (c.price >= best.price) break;               // sorted; can't beat current best
      const pid = c.id.split('|')[0];
      if (usedIds.has(pid) || taken.has(c.id)) continue;
      if ((drawn[c.ts] || 0) >= TUNING.MAX_DRAWS_PER_TEAM_SEASON) continue;
      best = { price: c.price, key: c.id };
      break;                                          // first valid = cheapest for this pos
    }
  }
  return best.price === Infinity ? { price: FLOOR, key: null } : best;
}

/* Position-aware minimum cost to fill a set of open slots. Assigns narrowest-
 * eligibility slots first (a dedicated C before the flexible DH) and never
 * reuses a player, so the budget "knows" you still owe a catcher and a
 * closer and reserves enough to actually sign them. */
function assignedFloors(run, slotNames, excludeId) {
  const usedIds = new Set(run.usedPlayers);
  const drawn = {};
  for (const id of run.usedTeamSeasons) drawn[id] = (drawn[id] || 0) + 1;
  const taken = new Set();
  if (excludeId) taken.add(excludeId);
  const order = [...slotNames].sort(
    (a, b) => (E.SLOT_ELIGIBILITY[a] || []).length - (E.SLOT_ELIGIBILITY[b] || []).length);
  let total = 0, maxOne = 0;
  for (const slot of order) {
    const c = cheapestForSlot(slot, usedIds, drawn, taken);
    total += c.price;
    if (c.key) taken.add(c.key);
    if (c.price > maxOne) maxOne = c.price;
  }
  return { total, maxOne };
}

/* Minimum to fill every remaining slot. */
function fullFloor(run) {
  return assignedFloors(run, openSlotNames(run)).total;
}

/* What must stay in the bank after the current pick: enough to fill all
 * remaining slots except the priciest (which the current pick can cover). */
function reserveFloor(run) {
  const f = assignedFloors(run, openSlotNames(run));
  return Math.max(0, f.total - f.maxOne);
}

function spendable(run) {
  return money(remaining(run) - reserveFloor(run));
}

/* Could you still fill your roster after signing this player? Tentatively
 * assign them to their slot and check the remaining budget covers the
 * cheapest way to fill what's left. This is the authoritative price gate. */
function canFinishAfter(run, player) {
  const slot = slotForPlayer(run, player);
  if (slot === null) return false;
  const rest = openSlotNames(run).filter(s => s !== E.SLOTS[slot]);
  const need = assignedFloors(run, rest, pkey(player)).total;
  return money(remaining(run) - player.p) >= need - 1e-9;
}

function canRespin(run) {
  const cost = E.respinCost(run.respinsUsed);
  if (run.phase !== PHASES.DRAFT) return { ok: false, reason: 'not drafting', cost };
  if (run.respinsUsed >= E.CONSTANTS.MAX_RESPINS)
    return { ok: false, reason: 'no re-spins left', cost };

  run.respinsUsed++;
  let short = false;
  try {
    short = remaining(run) < fullFloor(run);
  } finally {
    run.respinsUsed--;
  }
  if (short) return { ok: false, reason: 'would leave too little to fill your roster', cost };
  return { ok: true, cost };
}

const BLOCK = { DRAFTED: 'drafted', NO_SPOT: 'no_spot', PRICE: 'price' };

function blockFor(run, player) {
  if (run.usedPlayers.includes(player.i)) return BLOCK.DRAFTED;
  if (slotForPlayer(run, player) === null) return BLOCK.NO_SPOT;
  if (!canFinishAfter(run, player)) return BLOCK.PRICE;
  return null;
}

function openSlots(run) {
  const taken = new Set(run.slotIndex);
  return E.SLOTS.map((_, i) => i).filter(i => !taken.has(i));
}

function slotForPlayer(run, player) {
  const open = openSlots(run);
  // Prefer a dedicated slot first
  const dedicated = open.find(i => E.canFillSlot(player, E.SLOTS[i]) && !isDhOrFlex(E.SLOTS[i]));
  if (dedicated !== undefined) return dedicated;
  // Then try DH and any remaining slots
  const any = open.find(i => E.canFillSlot(player, E.SLOTS[i]));
  return any === undefined ? null : any;
}

function isDhOrFlex(slot) {
  return slot === 'DH';
}

function openSlotNames(run) {
  return openSlots(run).map(i => E.SLOTS[i]);
}

function createRun(opts) {
  const era = opts.era ?? null;
  if (era !== null && !E.ERAS[era]) throw new Error(`unknown era ${era}`);
  const seed = opts.seed ?? E.hashSeed(String(Math.random()));
  return {
    version: 1,
    era,
    seed,
    rngCalls: 0,
    capMusd: E.CONSTANTS.CAP_MUSD,
    phase: PHASES.DRAFT,
    roster: [],
    slotIndex: [],
    usedPlayers: [],
    usedTeamSeasons: [],
    draws: [],
    respinsUsed: 0,
    currentDraw: null,
    currentSlotIndex: 0,
    schedule: null,
    playoffs: null,
    season: null,
    playoffSeed: null,
    outcome: null,
  };
}

function rngFor(run) {
  const rng = E.createSeededRNG(run.seed);
  for (let i = 0; i < run.rngCalls; i++) rng();
  return () => { run.rngCalls++; return rng(); };
}

/* What team-seasons can the wheel land on right now? */
function drawable(run, data) {
  const drawn = {};
  for (const id of run.usedTeamSeasons) drawn[id] = (drawn[id] || 0) + 1;

  const open = openSlots(run).map(i => E.SLOTS[i]);

  return data.teamSeasons
    .filter(t => {
      if (run.era) {
        const r = E.ERAS[run.era];
        return t.season >= r[0] && t.season <= r[1];
      }
      return true;
    })
    .filter(t => (drawn[t.team_season_id] || 0) < TUNING.MAX_DRAWS_PER_TEAM_SEASON)
    .filter(t => {
      const players = data.byTeamSeason[t.team_season_id];
      if (!players) return false;
      // Must contain at least one fully-signable player (affordable AND
      // leaves enough to finish the roster), so a draw never lands on a
      // team whose whole board is blocked.
      return players.some(p => blockFor(run, p) === null);
    });
}

/* Spin the draft: draw a team-season and build the board. */
function spin(run, data) {
  if (run.phase !== PHASES.DRAFT) throw new Error('not drafting');
  const rng = rngFor(run);

  const available = drawable(run, data);
  if (!available.length) throw new Error('nothing left you can afford');

  const t = available[Math.floor(rng() * available.length)];
  const open = openSlots(run).map(i => E.SLOTS[i]);

  // Build the board: all players from this team-season who can fill ANY open slot
  const allPlayers = data.byTeamSeason[t.team_season_id] || [];
  const board = allPlayers
    .map(p => ({
      player: p,
      block: blockFor(run, p),
      canFill: open.some(slot => E.canFillSlot(p, slot)),
    }))
    .filter(r => r.canFill)
    .sort((a, b) => b.player.w - a.player.w);

  run.currentDraw = {
    season: t.season,
    team_season_id: t.team_season_id,
    team: t.team,
    display: t.display,
    openSlots: open,
    board: board.map(r => ({ key: pkey(r.player), block: r.block })),
    options: board.filter(r => r.block === null).map(r => pkey(r.player)),
  };
  return run.currentDraw;
}

/* Re-spin: pay the fee and draw again. */
function respin(run, data) {
  const check = canRespin(run);
  if (!check.ok) throw new Error(`cannot re-spin: ${check.reason}`);
  const draw = run.currentDraw;
  run.respinsUsed++;
  if (draw) run.usedTeamSeasons.push(draw.team_season_id);
  run.currentDraw = null;
  return spin(run, data);
}

/* Sign a player from the current draw. */
function sign(run, player) {
  if (run.phase !== PHASES.DRAFT) throw new Error('not drafting');
  if (!run.currentDraw) throw new Error('nothing drawn');
  const key = pkey(player);
  if (!run.currentDraw.options.includes(key)) throw new Error('not an option');

  const slot = slotForPlayer(run, player);
  if (slot === null) throw new Error('no slot');

  run.roster.push(player);
  run.slotIndex.push(slot);
  run.usedPlayers.push(player.i);
  run.usedTeamSeasons.push(run.currentDraw.team_season_id);
  run.draws.push({
    team_season_id: run.currentDraw.team_season_id,
    player: key,
    slot: E.SLOTS[slot],
  });
  run.currentDraw = null;

  // Draft complete?
  if (run.roster.length >= E.SLOTS.length) {
    run.phase = PHASES.SEASON;
  }
}

/* Preview chemistry if you were to sign this player. */
function previewSigning(run, player) {
  const before = E.resolveChemistry(run.roster);
  const after = E.resolveChemistry(run.roster.concat([player]));
  const seen = new Set(before.links.map(l => l.a + '|' + l.b + '|' + l.type));
  return {
    multiplier: after.multiplier,
    delta: after.multiplier - before.multiplier,
    newLinks: after.links.filter(l => !seen.has(l.a + '|' + l.b + '|' + l.type)),
  };
}

/* Play the full season. Returns the complete result. */
function playSeason(run) {
  if (run.phase !== PHASES.SEASON) throw new Error('not in season phase');
  const rng = rngFor(run);
  const slotNames = run.slotIndex.map(i => E.SLOTS[i]);
  const pool = _data && _data.oppPool;
  const result = E.playRun(run.roster, rng, slotNames, pool);
  result.allTimeRank = _data ? E.nationalRank(result.rating, _data.ratingTable) : null;

  run.season = result.season;
  run.schedule = result.schedule;
  run.playoffs = result.playoffs;
  run.playoffSeed = result.seed;

  run.outcome = {
    record: result.record,
    wins: result.record.wins,
    losses: result.record.losses,
    madePlayoffs: result.seed.made,
    seedLabel: result.seed.label,
    titleWon: result.titleWon,
    isGOAT: result.isGOAT,
    beatRecord: result.beatRecord,
    totalRS: result.totalRS,
    totalRA: result.totalRA,
    chemistry: result.chemistry,
    structure: result.structure,
    rating: result.rating,
    allTimeRank: result.allTimeRank,
    offense: result.offense,
    defense: result.defense,
    savePct: result.savePct,
  };
  run.phase = PHASES.OVER;
  return run.outcome;
}

/* Simulate one game at a time (for animated season display). */
function advanceGame(run, gameIndex) {
  if (!run._simState) {
    // Initialize simulation state. Players draft in random order, so tag
    // each with their ACTUAL slot from slotIndex — the sim reads SP1/SP2/CL
    // from these tags.
    const rng = rngFor(run);
    const tagged = run.roster.map((p, k) => ({ ...p, _slot: E.SLOTS[run.slotIndex[k]] }));
    const chem = E.resolveChemistry(tagged);
    const structure = E.rosterStructure(tagged);
    const offense = E.rosterOffense(tagged, chem.multiplier, structure.multiplier);
    const defense = E.rosterRunPrevention(tagged, chem.multiplier);
    const savePct = E.closerSavePct(tagged);
    const pool = _data && _data.oppPool;
    const schedule = E.generateSchedule(rng, E.CONSTANTS.REGULAR_SEASON_GAMES, pool);
    const rating = E.overallRating(E.teamWinPct(offense, defense));

    run._simState = {
      rng, tagged, chem, structure, offense, defense, savePct, schedule, rating,
      results: [],
      wins: 0, losses: 0,
      totalRS: 0, totalRA: 0,
    };
  }

  const st = run._simState;
  if (gameIndex >= st.schedule.length) return null;

  const game = st.schedule[gameIndex];
  const means = E.gameMeans(st.offense, st.defense, game);
  const result = E.resolveGame(means.runsFor, means.runsAgainst, st.savePct, st.rng);
  st.results.push({ game: game.game, ...result });
  if (result.won) st.wins++; else st.losses++;
  st.totalRS += result.yourRuns;
  st.totalRA += result.oppRuns;

  return {
    game: gameIndex + 1,
    ...result,
    oppName: game.oppName || null,
    oppRating: game.oppRating || null,
    marquee: !!game.marquee,
    record: { wins: st.wins, losses: st.losses },
  };
}

/* Finalize the season after all 162 games have been advanced. */
function finalizeSeason(run) {
  const st = run._simState;
  if (!st) throw new Error('no sim state');

  const seed = E.seedFromRecord(st.wins);
  const playoffs = E.generatePlayoffs(seed, st.offense, st.defense, st.savePct, st.rng, st.wins, st.rating);
  const titleWon = playoffs && playoffs.won;
  const isGOAT = st.wins >= E.CONSTANTS.GOAT_WINS;
  const beatRecord = st.wins >= E.CONSTANTS.RECORD_WINS;

  run.season = st.results;
  run.schedule = st.schedule;
  run.playoffs = playoffs;
  run.playoffSeed = seed;

  run.outcome = {
    record: { wins: st.wins, losses: st.losses },
    wins: st.wins,
    losses: st.losses,
    madePlayoffs: seed.made,
    seedLabel: seed.label,
    titleWon,
    isGOAT,
    beatRecord,
    totalRS: st.totalRS,
    totalRA: st.totalRA,
    chemistry: st.chem,
    structure: st.structure,
    rating: st.rating,
    allTimeRank: _data ? E.nationalRank(st.rating, _data.ratingTable) : null,
    offense: Math.round(st.offense * 100) / 100,
    defense: Math.round(st.defense * 100) / 100,
    savePct: Math.round(st.savePct * 1000) / 1000,
  };
  run.phase = PHASES.OVER;
  delete run._simState;
  return run.outcome;
}

/*
 * The strongest legal 12-man roster you could have built from every team-
 * season you spun this run, under the cap. Drives the "draft efficiency"
 * gauge: how close your actual roster came to the best available from your
 * own draws. DP knapsack over $1M budget buckets, best WAR per slot.
 */
function bestPossibleSquad(run, data) {
  data = data || _data;
  if (!data) return null;
  const seen = [...new Set(run.usedTeamSeasons)];
  const poolMap = {};
  for (const ts of seen) {
    for (const p of (data.byTeamSeason[ts] || [])) poolMap[pkey(p)] = p;
  }
  const pool = Object.values(poolMap);
  if (!pool.length) return null;
  const CAP = Math.floor(capOf(run));

  const frontier = (slot) => {
    const elig = pool.filter(p => E.canFillSlot(p, slot)).sort((a, b) => a.p - b.p);
    const fr = []; let best = -1;
    for (const p of elig) { if (p.w > best) { fr.push(p); best = p.w; } }
    return fr;
  };

  let dp = new Array(CAP + 1).fill(-1); dp[0] = 0;
  let picks = new Array(CAP + 1).fill(null);
  for (const slot of E.SLOTS) {
    const fr = frontier(slot);
    const ndp = new Array(CAP + 1).fill(-1);
    const npk = new Array(CAP + 1).fill(null);
    for (let b = 0; b <= CAP; b++) {
      if (dp[b] < 0) continue;
      for (const p of fr) {
        const nb = b + Math.ceil(p.p);
        if (nb > CAP) break;
        const nw = dp[b] + p.w;
        if (nw > ndp[nb]) { ndp[nb] = nw; npk[nb] = { prev: b, p, prevPicks: picks[b] }; }
      }
    }
    dp = ndp; picks = npk;
  }
  let bestB = 0;
  for (let b = 0; b <= CAP; b++) if (dp[b] > dp[bestB]) bestB = b;
  if (dp[bestB] < 0) return null;
  const lineup = [];
  for (let n = picks[bestB]; n; n = n.prevPicks) lineup.unshift(n.p);
  const bestWar = dp[bestB];
  const actualWar = run.roster.reduce((s, p) => s + p.w, 0);
  return {
    bestWar: Math.round(bestWar * 10) / 10,
    actualWar: Math.round(actualWar * 10) / 10,
    efficiency: Math.max(0, Math.min(100, Math.round(actualWar / bestWar * 1000) / 10)),
    lineup,
    spend: bestB,
  };
}

/* Monte-Carlo the built roster to project the season before it plays: typical
 * / floor / ceiling wins and the odds of playoffs, the record, and a title. */
function projectSeason(run, trials) {
  const n = trials || 200;
  const slotNames = run.slotIndex.map(i => E.SLOTS[i]);
  const pool = _data && _data.oppPool;
  const wins = [];
  let po = 0, title = 0, rec = 0;
  for (let i = 0; i < n; i++) {
    const rng = E.createSeededRNG((run.seed ^ (i * 2654435761)) >>> 0);
    const out = E.playRun(run.roster, rng, slotNames, pool);
    wins.push(out.record.wins);
    if (out.seed.made) po++;
    if (out.titleWon) title++;
    if (out.beatRecord) rec++;
  }
  wins.sort((a, b) => a - b);
  const q = (p) => wins[Math.floor((n - 1) * p)];
  return {
    typical: q(0.5), lo: q(0.1), hi: q(0.9),
    mean: Math.round(wins.reduce((s, w) => s + w, 0) / n),
    playoffPct: Math.round(100 * po / n),
    titlePct: Math.round(100 * title / n),
    recordPct: Math.round(100 * rec / n),
  };
}

/* Index the raw player data for draft use. Caches the result so the season
 * sim can reach the opponent pool and rating table. */
function indexData(players) {
  _data = E.indexData(players);
  return _data;
}

// ─── exports ─────────────────────────────────────────────────────────────────

const publicAPI = {
  API_VERSION: 1,
  PHASES,
  createRun,
  spin, respin, sign,
  playSeason, advanceGame, finalizeSeason,
  previewSigning, bestPossibleSquad, projectSeason,
  indexData,
  remaining, reserveFloor, fullFloor, spendable, canRespin, canFinishAfter,
  openSlots, openSlotNames, slotForPlayer, slotsLeft,
  capOf, money, blockFor, BLOCK,
};

if (typeof module !== 'undefined' && module.exports) module.exports = publicAPI;
if (typeof window !== 'undefined') window.RTD_RUN = publicAPI;
})();
