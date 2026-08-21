/* Run The Floor: draft loop and run state.
 *
 * Headless and dependency-free. Browser: window.RTF_RUN. Node: require.
 *
 * Mirrors baseball/run.js, which mirrors football/run.js: a run is a plain
 * serializable object plus a seeded RNG, so a run can be written to storage as
 * JSON, read back, and continued with the same dice it would have rolled.
 *
 * THE RUN OBJECT HOLDS NO PLAYER OBJECTS ON PURPOSE. It stores keys, and the
 * roster array holds the rows the caller signed. Anything that has to survive a
 * reload is a string or a number.
 */

'use strict';
(function() {

const E = (typeof require !== 'undefined')
  ? require('./engine.js')
  : window.RTF_ENGINE;

/* Indexed data, cached at module level so the season functions do not need it
   threaded through every call. Set by indexData below. */
let _data = null;

const PHASES = {
  DRAFT: 'draft',
  SEASON: 'season',
  SEEDING: 'seeding',
  PLAYOFFS: 'playoffs',
  OVER: 'over',
};

const pkey = E.pkey;
const money = (v) => Math.round(v * 100) / 100;

const TUNING = {
  /* How many players one team-season may give up across a whole run. Two, so a
     roster can hold a real pair off one club (which is the reunion link, and the
     best story in the draft) without a run becoming "spin the 1996 Bulls six
     times". */
  MAX_DRAWS_PER_TEAM_SEASON: 2,
};

function capOf(run) {
  return typeof run.capMusd === 'number' && isFinite(run.capMusd)
    ? run.capMusd : E.CONSTANTS.CAP_MUSD;
}

function remaining(run) {
  const spent = run.roster.reduce((s, p) => s + p.p, 0);
  return money(capOf(run) - spent - E.respinFees(run.respinsUsed));
}

const slotsLeft = (run) => E.SLOTS.length - run.roster.length;

/* The cheapest player who could still fill this slot right now: not already
   signed, not already earmarked by this same calculation, from a team-season
   that is not out of draws, and at a position the roster is not already full
   of. cheapBy is price-sorted, so the first candidate that passes every one of
   those is the cheapest one that exists.
 *
 * EVERY ONE OF THOSE CLAUSES IS LOAD-BEARING, and the position one was added
 * after it stranded a draft: Malone, O'Neal, Capela, Hornacek and Shumpert is
 * two centers and two shooting guards, so the sixth man slot had no legal
 * player left at any price, while the floor was still quoting $2.5M off a
 * center it was not allowed to sign. A floor that counts players the roster
 * cannot take is not a floor.
 */
function cheapestForSlot(slotName, usedIds, drawn, taken, posCount) {
  const pool = _data && _data.cheapBy && _data.cheapBy['*'];
  const FLOOR = E.CONSTANTS.MIN_RESERVE_PER_SLOT_MUSD;
  if (!pool) return { price: FLOOR, key: null, pp: null, ts: null };

  const eligible = E.SLOT_ELIGIBILITY[slotName] || [];
  let best = { price: Infinity, key: null, pp: null, ts: null };
  for (const pos of eligible) {
    const list = pool[pos];
    if (!list) continue;
    for (const c of list) {
      if (c.price >= best.price) break;            // sorted, cannot beat it now
      const id = c.id.split('|')[0];
      if (usedIds.has(id) || taken.has(c.id)) continue;
      if ((drawn[c.ts] || 0) >= TUNING.MAX_DRAWS_PER_TEAM_SEASON) continue;
      if ((posCount[c.pp] || 0) >= E.POSITION_MAX) continue;
      best = { price: c.price, key: c.id, pp: c.pp, ts: c.ts };
      break;                                       // first valid is the cheapest
    }
  }
  return best.price === Infinity ? { price: FLOOR, key: null, pp: null, ts: null } : best;
}

/* THE BUDGET HAS TO KNOW WHAT YOU STILL OWE. Without this, a draft can spend
   its way into a roster it cannot legally finish: five signed, one center slot
   open, and $3M left when the cheapest center in the data costs $4M. So the
   floor is position-aware and assigns the narrowest slot first (a dedicated
   center before the sixth man spot, which anybody can fill), and never counts
   one player twice. */
function assignedFloors(run, slotNames, pending) {
  const usedIds = new Set(run.usedPlayers);
  const drawn = {};
  for (const id of run.usedTeamSeasons) drawn[id] = (drawn[id] || 0) + 1;

  const taken = new Set();
  const posCount = {};
  for (const p of run.roster) {
    const primary = p.pp || E.positionsOf(p)[0];
    posCount[primary] = (posCount[primary] || 0) + 1;
  }
  /* `pending` is the player being tentatively signed. By the time these slots
     get filled he is on the roster, so he is off the board for the rest of this
     calculation, he counts against his position, AND HE COSTS HIS TEAM-SEASON A
     DRAW. That last one was missing and it stranded drafts: with two Mavericks
     already signed, the floor was still quoting a third Maverick for the last
     slot, off a club that had no draws left to give. */
  if (pending) {
    /* By ID, not by key. Signing a player takes EVERY season of his off the
       board, so a floor that only earmarked the one season being signed could
       still quote his cheaper other season for the next slot: 2018 Tucker at
       $8.6M signed, 2021 Tucker at $3.3M promised, and a draft $0.3M short of
       being able to finish. */
    usedIds.add(pending.i);
    taken.add(pkey(pending));
    const primary = pending.pp || E.positionsOf(pending)[0];
    posCount[primary] = (posCount[primary] || 0) + 1;
    const ts = E.teamSeasonId(pending.t, pending.s);
    drawn[ts] = (drawn[ts] || 0) + 1;
  }

  const order = [...slotNames].sort(
    (a, b) => (E.SLOT_ELIGIBILITY[a] || []).length - (E.SLOT_ELIGIBILITY[b] || []).length);

  let total = 0, maxOne = 0;
  for (const slot of order) {
    const c = cheapestForSlot(slot, usedIds, drawn, taken, posCount);
    total += c.price;
    /* Everything this loop earmarks is spent: the player, his position and his
       club's draw. Two slots can never be filled by the same man, and one
       team-season can never fill three. */
    if (c.key) taken.add(c.key);
    if (c.pp) posCount[c.pp] = (posCount[c.pp] || 0) + 1;
    if (c.ts) drawn[c.ts] = (drawn[c.ts] || 0) + 1;
    if (c.price > maxOne) maxOne = c.price;
  }
  return { total, maxOne };
}

const fullFloor = (run) => assignedFloors(run, openSlotNames(run)).total;

/* What must stay in the bank after this pick: enough to fill every remaining
   slot except the most expensive one, which is the slot this pick can cover. */
function reserveFloor(run) {
  const f = assignedFloors(run, openSlotNames(run));
  return Math.max(0, f.total - f.maxOne);
}

const spendable = (run) => money(remaining(run) - reserveFloor(run));

/* THE AUTHORITATIVE PRICE GATE. Tentatively put this player in the slot he
   would take, then ask whether the rest of the roster can still be filled. */
function canFinishAfter(run, player) {
  const slot = slotForPlayer(run, player);
  if (slot === null) return false;
  const rest = openSlotNames(run).filter(s => s !== E.SLOTS[slot]);
  const need = assignedFloors(run, rest, player).total;
  return money(remaining(run) - player.p) >= need - 1e-9;
}

function canRespin(run) {
  const cost = E.respinCost(run.respinsUsed);
  if (run.phase !== PHASES.DRAFT) return { ok: false, reason: 'not drafting', cost };
  if (run.respinsUsed >= E.CONSTANTS.MAX_RESPINS)
    return { ok: false, reason: 'no re-spins left', cost };

  /* Charge the fee, ask the question, put it back. A re-spin you cannot afford
     to pay for is a re-spin that would strand the roster. */
  run.respinsUsed++;
  let short = false;
  try { short = remaining(run) < fullFloor(run); }
  finally { run.respinsUsed--; }

  if (short) return { ok: false, reason: 'would leave too little to fill your roster', cost };
  return { ok: true, cost };
}

const BLOCK = {
  DRAFTED: 'drafted',
  NO_SPOT: 'no_spot',
  POSITION_FULL: 'position_full',
  PRICE: 'price',
};

const BLOCK_DRAWN = 'drawn_out';
BLOCK.DRAWN_OUT = BLOCK_DRAWN;

function blockFor(run, player) {
  if (run.usedPlayers.includes(player.i)) return BLOCK.DRAFTED;
  if (drawsUsed(run, player) >= TUNING.MAX_DRAWS_PER_TEAM_SEASON) return BLOCK.DRAWN_OUT;
  if (positionFull(run, player)) return BLOCK.POSITION_FULL;
  if (slotForPlayer(run, player) === null) return BLOCK.NO_SPOT;
  if (!canFinishAfter(run, player)) return BLOCK.PRICE;
  return null;
}

/* How many players this run has already taken off the player's own club. The
   board reads it so a club that has given up its two is greyed out on sight
   rather than only being invisible to the wheel. */
function drawsUsed(run, player) {
  const ts = E.teamSeasonId(player.t, player.s);
  let n = 0;
  for (const id of run.usedTeamSeasons) if (id === ts) n++;
  return n;
}

/* POSITION_MAX, enforced. A player counts against his primary position, so a
   roster can carry two centers and not three. Without this the sixth man slot
   turns into "a second of whoever was best", and every roster looks the same. */
function positionFull(run, player) {
  const primary = player.pp || E.positionsOf(player)[0];
  const held = run.roster.filter(p => (p.pp || E.positionsOf(p)[0]) === primary).length;
  return held >= E.POSITION_MAX;
}

function openSlots(run) {
  const taken = new Set(run.slotIndex);
  return E.SLOTS.map((_, i) => i).filter(i => !taken.has(i));
}

const openSlotNames = (run) => openSlots(run).map(i => E.SLOTS[i]);

/* Prefer a dedicated slot over the sixth man spot, so signing a center with
   both C and 6TH open puts him at center and leaves the flexible slot flexible.
   That is the same rule the college game uses for its FLEX. */
function slotForPlayer(run, player) {
  const open = openSlots(run);
  const dedicated = open.find(i => E.SLOTS[i] !== '6TH' && E.canFillSlot(player, E.SLOTS[i]));
  if (dedicated !== undefined) return dedicated;
  const any = open.find(i => E.canFillSlot(player, E.SLOTS[i]));
  return any === undefined ? null : any;
}

const eligibleOpenSlots = (run, player) =>
  openSlots(run).filter(i => E.canFillSlot(player, E.SLOTS[i]));

// ─── the run ────────────────────────────────────────────────────────────────

function createRun(opts) {
  const o = opts || {};
  const era = o.era ?? null;
  if (era !== null && !E.ERAS[era]) throw new Error(`unknown era ${era}`);
  return {
    version: 1,
    era,
    seed: o.seed ?? E.hashSeed(String(Math.random())),
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
    schedule: null,
    season: null,
    playoffs: null,
    playoffSeed: null,
    outcome: null,
  };
}

/* THE RNG IS REPLAYED, NOT STORED. rngCalls counts how far into the stream the
   run has gone, so reloading a saved run and continuing gives the same numbers
   it would have given without the reload. */
function rngFor(run) {
  const rng = E.createSeededRNG(run.seed);
  for (let i = 0; i < run.rngCalls; i++) rng();
  return () => { run.rngCalls++; return rng(); };
}

/* Which team-seasons the wheel may land on right now: inside the era if one is
   set, not out of draws, and holding at least one player this run can actually
   sign. That last clause is what stops the wheel dealing a board where every
   name is greyed out. */
function drawable(run, data) {
  const drawn = {};
  for (const id of run.usedTeamSeasons) drawn[id] = (drawn[id] || 0) + 1;

  return data.teamSeasons.filter(t => {
    if (run.era) {
      const r = E.ERAS[run.era];
      if (t.season < r[0] || t.season > r[1]) return false;
    }
    if ((drawn[t.team_season_id] || 0) >= TUNING.MAX_DRAWS_PER_TEAM_SEASON) return false;
    const players = data.byTeamSeason[t.team_season_id];
    return !!players && players.some(p => blockFor(run, p) === null);
  });
}

/* Spin: draw a team-season and build its board. */
function spin(run, data) {
  if (run.phase !== PHASES.DRAFT) throw new Error('not drafting');
  const rng = rngFor(run);

  const available = drawable(run, data);
  if (!available.length) throw new Error('nothing left you can afford');

  const t = available[Math.floor(rng() * available.length)];
  const open = openSlotNames(run);

  const board = (data.byTeamSeason[t.team_season_id] || [])
    .map(p => ({ player: p, block: blockFor(run, p),
      canFill: open.some(slot => E.canFillSlot(p, slot)) }))
    .filter(r => r.canFill)
    .sort((a, b) => b.player.w - a.player.w);

  run.currentDraw = {
    season: t.season,
    team: t.team,
    team_season_id: t.team_season_id,
    display: t.display,
    openSlots: open,
    board: board.map(r => ({ key: pkey(r.player), block: r.block })),
    options: board.filter(r => r.block === null).map(r => pkey(r.player)),
  };
  return run.currentDraw;
}

/* Re-spin: pay the fee, burn the team-season, draw again. Burning it is the
   point, otherwise the wheel can hand back what you just rejected. */
function respin(run, data) {
  const check = canRespin(run);
  if (!check.ok) throw new Error(`cannot re-spin: ${check.reason}`);
  const draw = run.currentDraw;
  run.respinsUsed++;
  if (draw) run.usedTeamSeasons.push(draw.team_season_id);
  run.currentDraw = null;
  return spin(run, data);
}

function sign(run, player, slotIdx) {
  if (run.phase !== PHASES.DRAFT) throw new Error('not drafting');
  if (!run.currentDraw) throw new Error('nothing drawn');
  if (!run.currentDraw.options.includes(pkey(player))) throw new Error('not an option');

  let slot;
  if (typeof slotIdx === 'number') {
    if (run.slotIndex.includes(slotIdx) || !E.canFillSlot(player, E.SLOTS[slotIdx]))
      throw new Error('invalid slot');
    slot = slotIdx;
  } else {
    slot = slotForPlayer(run, player);
  }
  if (slot === null) throw new Error('no slot');

  run.roster.push(player);
  run.slotIndex.push(slot);
  run.usedPlayers.push(player.i);
  run.usedTeamSeasons.push(run.currentDraw.team_season_id);
  run.draws.push({
    team_season_id: run.currentDraw.team_season_id,
    player: pkey(player),
    slot: E.SLOTS[slot],
  });
  run.currentDraw = null;

  if (run.roster.length >= E.SLOTS.length) run.phase = PHASES.SEASON;
  return run;
}

/* What signing this player would do to chemistry, before you commit. The links
   it reports are the NEW ones only, so the panel says what you are buying
   rather than restating what you already have. */
function previewSigning(run, player) {
  const before = E.resolveChemistry(run.roster);
  const after = E.resolveChemistry(run.roster.concat([player]));
  const seen = new Set(before.links.map(l => `${l.a}|${l.b}|${l.type}`));
  return {
    bonus: after.bonus,
    delta: after.bonus - before.bonus,
    newLinks: after.links.filter(l => !seen.has(`${l.a}|${l.b}|${l.type}`)),
  };
}

// ─── the season ─────────────────────────────────────────────────────────────

function playSeason(run) {
  if (run.phase !== PHASES.SEASON) throw new Error('not in season phase');
  const rng = rngFor(run);
  const slotNames = run.slotIndex.map(i => E.SLOTS[i]);
  const result = E.playRun(run.roster, rng, slotNames, _data && _data.oppPool);
  result.allTimeRank = _data ? E.nationalRank(result.rating, _data.ratingTable) : null;

  run.season = result.season;
  run.schedule = result.schedule;
  run.playoffs = result.playoffs;
  run.playoffSeed = result.seed;
  run.outcome = outcomeOf(run, result);
  run.phase = PHASES.OVER;
  return run.outcome;
}

function outcomeOf(run, r) {
  return {
    record: r.record,
    wins: r.record.wins,
    losses: r.record.losses,
    madePlayoffs: r.seed.made,
    seedLabel: r.seed.label,
    titleWon: r.titleWon,
    isGOAT: r.isGOAT,
    beatRecord: r.beatRecord,
    totalPF: r.totalPF,
    totalPA: r.totalPA,
    chemistry: r.chemistry,
    structure: r.structure,
    rating: r.rating,
    allTimeRank: r.allTimeRank ?? null,
    ortg: r.ortg,
    drtg: r.drtg,
    coach: E.coachReport(r.roster, r.chemistry, r.structure, r.rating, remaining(run), r.ortg, r.drtg),
  };
}

/* One game at a time, for the animated season screen. The sim state is built
   once on the first call and lives on the run object under a leading
   underscore, which is the marker for "do not serialize this". */
function advanceGame(run, gameIndex) {
  if (!run._simState) {
    const rng = rngFor(run);
    const tagged = run.roster.map((p, k) => ({ ...p, _slot: E.SLOTS[run.slotIndex[k]] }));
    const chem = E.resolveChemistry(tagged);
    const structure = E.rosterStructure(tagged);
    const ortg = E.rosterOffense(tagged, chem.bonus, structure.bonus);
    const drtg = E.rosterDefense(tagged, chem.bonus);
    const schedule = E.generateSchedule(
      rng, E.CONSTANTS.REGULAR_SEASON_GAMES, _data && _data.oppPool);

    run._simState = {
      rng, tagged, chem, structure, ortg, drtg, schedule,
      rating: E.overallRating(E.teamWinPct(ortg, drtg)),
      results: [], wins: 0, losses: 0, totalPF: 0, totalPA: 0,
    };
  }

  const st = run._simState;
  if (gameIndex >= st.schedule.length) return null;

  const game = st.schedule[gameIndex];
  const means = E.gameMeans(st.ortg, st.drtg, game);
  /* E.homeAdvantage, NOT a home-court expression written out again here. This
     line and the one inside playRun have to agree exactly or the animated
     season and the instant one are two different seasons off one seed, which is
     what verify.mjs caught when they briefly were. */
  const result = E.resolveGame(
    means.pointsFor, means.pointsAgainst, st.rng, E.homeAdvantage(game));

  st.results.push({ game: game.game, ...result });
  if (result.won) st.wins++; else st.losses++;
  st.totalPF += result.yourPoints;
  st.totalPA += result.oppPoints;

  return {
    game: gameIndex + 1,
    ...result,
    oppName: game.oppName || null,
    oppRating: game.oppRating || null,
    marquee: !!game.marquee,
    home: !!game.home,
    record: { wins: st.wins, losses: st.losses },
  };
}

function finalizeSeason(run) {
  const st = run._simState;
  if (!st) throw new Error('no sim state');

  const seed = E.seedFromRecord(st.wins);
  const playoffs = E.generatePlayoffs(seed, st.ortg, st.drtg, st.rng, st.wins, st.rating);

  run.season = st.results;
  run.schedule = st.schedule;
  run.playoffs = playoffs;
  run.playoffSeed = seed;
  run.outcome = outcomeOf(run, {
    record: { wins: st.wins, losses: st.losses },
    seed, playoffs,
    titleWon: !!(playoffs && playoffs.won),
    isGOAT: st.wins >= E.CONSTANTS.GOAT_WINS,
    beatRecord: st.wins >= E.CONSTANTS.RECORD_WINS,
    totalPF: st.totalPF,
    totalPA: st.totalPA,
    chemistry: st.chem,
    structure: st.structure,
    rating: st.rating,
    allTimeRank: _data ? E.nationalRank(st.rating, _data.ratingTable) : null,
    ortg: Math.round(st.ortg * 100) / 100,
    drtg: Math.round(st.drtg * 100) / 100,
    roster: st.tagged,
  });

  run.phase = PHASES.OVER;
  delete run._simState;
  return run.outcome;
}

// ─── measuring the draft ────────────────────────────────────────────────────

/* THE BEST SIX YOU COULD HAVE HAD, out of every team-season this run actually
   spun, under the same cap. That is the honest denominator for a draft grade:
   it does not punish a player for bad draws, only for what he did with them.
   A knapsack over $1M budget buckets, best win shares per slot. Prices round UP
   into their bucket, so the answer it names is always actually affordable.
 *
 * ONE PLAYER, ONE SLOT. A plain slot-by-slot knapsack has no memory of who it
 * already spent, so it will happily field the same man at three positions:
 * left alone it returned Kareem at small forward, power forward AND center.
 * That inflates the denominator, which quietly marks every real draft down. So
 * a duplicate is pinned to the slot where he is worth most, banned from the
 * others, and the whole thing runs again. Each pass removes at least one
 * duplicate, so it terminates in at most SLOTS passes.
 */
function bestPossibleSquad(run, data) {
  data = data || _data;
  if (!data) return null;

  const poolMap = {};
  for (const ts of new Set(run.usedTeamSeasons)) {
    for (const p of (data.byTeamSeason[ts] || [])) poolMap[pkey(p)] = p;
  }
  const pool = Object.values(poolMap);
  if (!pool.length) return null;

  const CAP = Math.floor(capOf(run));
  const banned = {};                                 // slot -> Set of player ids

  /* One ban per pass converges far too slowly to be worth doing: a lineup that
     fields one man at three slots carries two clashes, a repaired lineup can
     raise fresh ones, and at one ban a pass most drafts ran out of passes and
     came back null. So every clash in a lineup is banned in the same pass, and
     the budget is the size of the ban space rather than the number of slots. */
  const budget = Math.max(24, pool.length * E.SLOTS.length);

  for (let pass = 0; pass < budget; pass++) {
    const solved = knapsack(pool, CAP, banned);
    if (!solved) return null;

    const seen = {};
    const clashes = [];
    solved.lineup.forEach((p, i) => {
      if (seen[p.i] !== undefined) clashes.push({ id: p.i, slots: [seen[p.i], i] });
      else seen[p.i] = i;
    });

    if (!clashes.length) {
      const actualWs = run.roster.reduce((s, p) => s + p.w, 0);
      return {
        bestWs: Math.round(solved.value * 10) / 10,
        actualWs: Math.round(actualWs * 10) / 10,
        efficiency: clamp01(Math.round(actualWs / solved.value * 1000) / 10),
        lineup: solved.lineup,
        spend: solved.spend,
      };
    }

    /* Keep him where he is least replaceable and ban him from the other slot.
       Never ban him out of a slot he is the ONLY body for: with a pool drawn
       from six team-seasons that is a real possibility, and doing it empties
       the slot and makes the whole answer null. */
    let banned_any = false;
    for (const clash of clashes) {
      const [a, b] = clash.slots;
      const banFrom = (i) => {
        const slot = E.SLOTS[i];
        if (countAt(pool, slot, banned) <= 1) return false;
        const set = (banned[slot] = banned[slot] || new Set());
        if (set.has(clash.id)) return false;
        set.add(clash.id);
        return true;
      };
      const first = depthAt(pool, E.SLOTS[a], banned) >= depthAt(pool, E.SLOTS[b], banned) ? a : b;
      if (banFrom(first) || banFrom(first === a ? b : a)) banned_any = true;
    }
    // Nothing left to ban and still duplicated: this pool cannot field six men.
    if (!banned_any) return null;
  }
  return null;
}

const eligibleAt = (pool, slot, banned) => {
  const ban = banned[slot];
  return pool.filter(p => E.canFillSlot(p, slot) && !(ban && ban.has(p.i)));
};

const countAt = (pool, slot, banned) => eligibleAt(pool, slot, banned).length;

/* How much value sits at a slot BEHIND the best man there, as a stand-in for
   how replaceable he is at it. */
function depthAt(pool, slot, banned) {
  const ws = eligibleAt(pool, slot, banned).map(p => p.w).sort((x, y) => y - x);
  return ws.length > 1 ? ws[1] : 0;
}

function knapsack(pool, CAP, banned) {
  /* Only players on the price/value frontier can win a slot: if somebody costs
     more and is worth less, no budget ever prefers him. */
  const frontier = (slot) => {
    const ban = banned[slot];
    const eligible = pool
      .filter(p => E.canFillSlot(p, slot) && !(ban && ban.has(p.i)))
      .sort((a, b) => a.p - b.p);
    const out = [];
    let best = -Infinity;
    for (const p of eligible) if (p.w > best) { out.push(p); best = p.w; }
    return out;
  };

  let dp = new Array(CAP + 1).fill(-1); dp[0] = 0;
  let picks = new Array(CAP + 1).fill(null);

  for (const slot of E.SLOTS) {
    const fr = frontier(slot);
    if (!fr.length) return null;
    const ndp = new Array(CAP + 1).fill(-1);
    const npk = new Array(CAP + 1).fill(null);
    for (let b = 0; b <= CAP; b++) {
      if (dp[b] < 0) continue;
      for (const p of fr) {
        const nb = b + Math.ceil(p.p);
        if (nb > CAP) break;
        const nw = dp[b] + p.w;
        if (nw > ndp[nb]) { ndp[nb] = nw; npk[nb] = { p, prevPicks: picks[b] }; }
      }
    }
    dp = ndp; picks = npk;
  }

  let bestB = -1;
  for (let b = 0; b <= CAP; b++) if (dp[b] > (bestB < 0 ? -1 : dp[bestB])) bestB = b;
  if (bestB < 0 || dp[bestB] < 0) return null;

  const lineup = [];
  for (let n = picks[bestB]; n; n = n.prevPicks) lineup.unshift(n.p);
  return { lineup, value: dp[bestB], spend: bestB };
}

const clamp01 = (v) => Math.max(0, Math.min(100, v));

/* Monte-Carlo the roster before it plays a game: the typical season, the floor,
   the ceiling, and the odds of the three things worth chasing. Each trial gets
   its own seed off the run's, so the projection is stable for a given roster
   and does not consume the run's own RNG stream. */
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

function indexData(players) {
  _data = E.indexData(players);
  return _data;
}

// ─── exports ────────────────────────────────────────────────────────────────

const publicAPI = {
  API_VERSION: 1,
  PHASES, TUNING, BLOCK,
  createRun, spin, respin, sign,
  playSeason, advanceGame, finalizeSeason,
  previewSigning, bestPossibleSquad, projectSeason,
  indexData, drawable,
  remaining, reserveFloor, fullFloor, spendable, capOf, money,
  canRespin, canFinishAfter, blockFor, positionFull,
  openSlots, openSlotNames, slotForPlayer, eligibleOpenSlots, slotsLeft,
};

if (typeof module !== 'undefined' && module.exports) module.exports = publicAPI;
if (typeof window !== 'undefined') window.RTF_RUN = publicAPI;
})();
