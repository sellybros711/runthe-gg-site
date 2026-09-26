/* Run The Diamond: draft loop and run state.
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

/* Opponent pool for a run. Always the global all-time pool. Even in Eras
 * mode you're measured against the best teams ever, which keeps every era a
 * real challenge. (Era-appropriate opponents were tested and made every era
 * trivial, since an all-decade dream team crushes individual decade clubs.) */
function poolFor(run) {
  return _data ? _data.oppPool : null;
}

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

/* How the era picker reads a decade's character. Forty is deep enough that one
 * freak season cannot swing it and shallow enough to be about the TOP of the
 * board, which is what a drafter meets. The two bands are set off the measured
 * spread (7 arms in the 2000s to 28 in the 1900s) rather than at halfway, so a
 * decade has to be genuinely lopsided to earn the line. */
const ERA_TOP_N = 40;
const ERA_ARMS_HI = 22;
const ERA_ARMS_LO = 12;

const TUNING = {
  MAX_DRAWS_PER_TEAM_SEASON: 2,
  SPIN_OPTIONS: 3,
};

function capOf(run) {
  return typeof run.capMusd === 'number' && isFinite(run.capMusd)
    ? run.capMusd : E.CONSTANTS.CAP_MUSD;
}

/* The slot list and eligibility this run plays under. All-Time Staff fields twelve
 * arms instead of a lineup, so nothing may read E.SLOTS directly once a run exists:
 * a draft that checks one slot set and a season that tags with another produces a
 * roster where every pick sits in the wrong place and nothing throws. */
function slotsOf(run) { return E.slotsForMode(run && run.staff); }
function eligOf(run) { return E.eligibilityForMode(run && run.staff); }
function fills(run, player, slotName) { return E.canFillSlot(player, slotName, eligOf(run)); }

function remaining(run) {
  const spent = run.roster.reduce((s, p) => s + p.p, 0);
  const fees = E.respinFees(run.respinsUsed);
  return money(capOf(run) - spent - fees);
}

const slotsLeft = (run) => slotsOf(run).length - run.roster.length;

/* Cheapest player that could still fill `slotName` right now: not already
 * used (by id or already earmarked), from a team-season not maxed on draws.
 * cheapBy[pos] is price-sorted, so the first valid candidate is the cheapest.
 * Returns the price and the earmarked key so the caller avoids double-count. */
function cheapestForSlot(slotName, usedIds, drawn, taken, elig) {
  const pool = _data && _data.cheapBy && _data.cheapBy['*'];
  const FLOOR = E.CONSTANTS.MIN_RESERVE_PER_SLOT_MUSD;
  if (!pool) return { price: FLOOR, key: null };
  const positions = (elig || E.SLOT_ELIGIBILITY)[slotName] || [];
  let best = { price: Infinity, key: null };
  for (const pos of positions) {
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
  const elig = eligOf(run);
  const order = [...slotNames].sort(
    (a, b) => (elig[a] || []).length - (elig[b] || []).length);
  let total = 0, maxOne = 0;
  for (const slot of order) {
    const c = cheapestForSlot(slot, usedIds, drawn, taken, elig);
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
  const rest = openSlotNames(run).filter(s => s !== slotsOf(run)[slot]);
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
  return slotsOf(run).map((_, i) => i).filter(i => !taken.has(i));
}

function slotForPlayer(run, player) {
  const open = openSlots(run);
  /* His own position first, because it is the one slot where he is worth his
     whole WAR (E.primaryAt). Then any other dedicated slot, then DH. */
  const own = open.find(i => fills(run, player, slotsOf(run)[i]) && E.primaryAt(player, slotsOf(run)[i]));
  if (own !== undefined) return own;
  // Prefer a dedicated slot first
  const dedicated = open.find(i => fills(run, player, slotsOf(run)[i]) && !isDhOrFlex(slotsOf(run)[i]));
  if (dedicated !== undefined) return dedicated;
  // Then try DH and any remaining slots
  const any = open.find(i => fills(run, player, slotsOf(run)[i]));
  return any === undefined ? null : any;
}

function isDhOrFlex(slot) {
  return slot === 'DH';
}

function openSlotNames(run) {
  return openSlots(run).map(i => slotsOf(run)[i]);
}

function createRun(opts) {
  const era = opts.era ?? null;
  if (era !== null && !E.ERAS[era]) throw new Error(`unknown era ${era}`);
  const franchise = opts.franchise ?? null;
  const division = opts.division ?? null;
  const capSurvivor = !!opts.capSurvivor;
  const staff = !!opts.staff;
  const tradeMachine = !!opts.tradeMachine;
  const daily = !!opts.daily;
  if (division !== null && !E.DIVISIONS[division]) throw new Error(`unknown division ${division}`);
  const seed = opts.seed ?? E.hashSeed(String(Math.random()));
  return {
    version: 1,
    era,
    franchise,
    division,
    capSurvivor,
    staff,
    tradeMachine,
    daily,
    trades: [],
    market: [],
    cuts: [],
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

/* What team-seasons can the wheel land on right now? An optional focus
 * narrows the pool to build chemistry deliberately: {franchise:'NYY'} draws
 * only that franchise's seasons, {era:'1970s'} only that decade. */
function drawable(run, data, focus) {
  const drawn = {};
  for (const id of run.usedTeamSeasons) drawn[id] = (drawn[id] || 0) + 1;

  const open = openSlots(run).map(i => slotsOf(run)[i]);

  return data.teamSeasons
    .filter(t => {
      if (run.era) {
        const r = E.ERAS[run.era];
        if (!(t.season >= r[0] && t.season <= r[1])) return false;
      }
      // Franchise mode. The lineage, not the code: see E.FRANCHISES.
      if (run.franchise && !E.inFranchise(run.franchise, t.team, t.season)) return false;
      if (run.division && !E.inDivision(run.division, t.team, t.season)) return false;
      if (focus && focus.franchise && !E.inFranchise(focus.franchise, t.team, t.season)) return false;
      if (focus && focus.era) {
        const r = E.ERAS[focus.era];
        if (!(r && t.season >= r[0] && t.season <= r[1])) return false;
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

/* Spin the draft: draw a team-season and build the board. An optional focus
 * steers the draw (franchise/era) to let you build chemistry on purpose;
 * falls back to an unfocused draw if the focus has nothing signable left. */
function spin(run, data, focus) {
  if (run.phase !== PHASES.DRAFT) throw new Error('not drafting');
  const rng = rngFor(run);

  let available = focus ? drawable(run, data, focus) : null;
  if (!available || !available.length) available = drawable(run, data);
  if (!available.length) throw new Error('nothing left you can afford');

  const t = available[Math.floor(rng() * available.length)];
  const open = openSlots(run).map(i => slotsOf(run)[i]);

  // Build the board: all players from this team-season who can fill ANY open slot
  const allPlayers = data.byTeamSeason[t.team_season_id] || [];
  const board = allPlayers
    .map(p => ({
      player: p,
      block: blockFor(run, p),
      canFill: open.some(slot => fills(run, p, slot)),
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

/* Re-spin: pay the fee and draw again, optionally toward a focus. */
function respin(run, data, focus) {
  const check = canRespin(run);
  if (!check.ok) throw new Error(`cannot re-spin: ${check.reason}`);
  const draw = run.currentDraw;
  run.respinsUsed++;
  if (draw) run.usedTeamSeasons.push(draw.team_season_id);
  run.currentDraw = null;
  return spin(run, data, focus);
}

/* Franchises deep enough to draft a full 12-man roster from: enough team-
 * seasons (you draw one team-season per pick, max 2 each) and at least one
 * eligible player for every hard slot (C, closer, two starters). Returns
 * codes sorted by pool depth, for the Franchise Mode picker. */
/* ONE CARD PER CLUB PLAYING TODAY, and every earlier name folded into it.
 *
 * The picker used to offer the fifteen earlier identities as cards of their own
 * beside the thirty, so the Braves were three entries, the Athletics four, and a
 * reader had to already know that the St. Louis Browns and the Baltimore Orioles
 * are one history to understand why both were there. Every one of those fifteen
 * resolves into a current franchise, so nothing is lost by dropping them: what the
 * card says instead is which names it contains.
 *
 * SCOPED TO E.CURRENT_FRANCHISES rather than to whatever clears the depth gates
 * below. Those gates are about the DATA (enough men to fill a roster) and this is
 * about the LEAGUE, and no club in the pool happens to clear them today that is not
 * one of the thirty. Leaving it to the gates means the day one is loosened a
 * Federal League club appears in the picker, which nothing would report. */
function eligibleFranchises(data) {
  const byTeam = {};
  const add = (key, ts, players) => {
    const info = (byTeam[key] = byTeam[key] || {
      seasons: 0, players: {}, lo: Infinity, hi: 0, codes: [],
    });
    info.seasons++;
    if (ts.season < info.lo) info.lo = ts.season;
    if (ts.season > info.hi) info.hi = ts.season;
    /* The codes this card can actually DRAW, collected rather than read off the
       lineage. `franchiseCodes('BAL')` names MLA, the 1901 Milwaukee Brewers, and
       the pool holds nine of their rows: too thin to survive indexData, so no
       board can ever land there. A card listing a club the lock will never offer
       is a card naming something a player cannot reach. */
    if (!info.codes.includes(ts.team)) info.codes.push(ts.team);
    for (const p of players) info.players[pkey(p)] = p;
  };
  const current = new Set(E.CURRENT_FRANCHISES);
  for (const ts of data.teamSeasons) {
    const fran = E.franchiseOf(ts.team, ts.season);
    /* A club-season that belongs to no club playing today is simply not in the
       picker. That is the Negro Leagues, the Federal League, and the 1914 Terrapins
       whose franchise is the sentinel `BAL*`. They stay fully draftable in Classic
       and Eras, where the wheel is not locked to one club. */
    if (!current.has(fran)) continue;
    add(fran, ts, data.byTeamSeason[ts.team_season_id] || []);
  }
  const out = [];
  for (const team of Object.keys(byTeam)) {
    const info = byTeam[team];
    if (info.seasons < 6) continue;
    const players = Object.values(info.players);
    const has = (slot) => players.some(p => E.canFillSlot(p, slot));
    const countSlot = (slot) => players.filter(p => E.canFillSlot(p, slot)).length;
    if (!has('C') || !has('CL') || countSlot('SP1') < 2) continue;
    if (players.length < 16) continue;
    // The best bat and the best arm the club can offer, as a teaser on the card.
    let bat = null, arm = null;
    for (const p of players) {
      if (p.r === 'p') { if (!arm || p.w > arm.w) arm = p; }
      else if (!bat || p.w > bat.w) bat = p;
    }
    out.push({
      team, seasons: info.seasons, depth: players.length,
      lo: info.lo, hi: info.hi,
      /* Oldest first, and only what this card can draw. One entry means a card
         whose club never changed its name, which is most of them. */
      codes: E.franchiseCodes(team).filter(c => info.codes.includes(c)),
      best: bat && arm ? (bat.w >= arm.w ? bat : arm) : (bat || arm),
    });
  }
  out.sort((a, b) => b.depth - a.depth);
  return out;
}

/* THE ERAS, WITH WHAT EACH DECADE ACTUALLY HOLDS.
 *
 * The picker was thirteen bare buttons standing beside a franchise grid that
 * carries a span, a lineage and a best player, so the mode with the most
 * character on the whole board read as the one with the least.
 *
 * Every figure here is READ OFF THE ROWS `drawable` filters, which is the only
 * honest span: `ERAS['1900s']` says 1901 to 1909 and what a run there can reach
 * is whatever survived the pool's own floor. Same rule that put `eraSeasons`
 * behind the era picker rather than the decade's nominal bounds.
 *
 * ONE PASS, bucketed. Thirteen walks of 44,344 rows is thirteen times the work
 * for an answer each row contributes to exactly once.
 */
function eligibleEras(data) {
  const bounds = Object.keys(E.ERAS).map(era => ({ era, from: E.ERAS[era][0], to: E.ERAS[era][1] }));
  const bucket = {};
  for (const b of bounds) bucket[b.era] = { clubs: new Set(), seasons: 0, lo: Infinity, hi: 0, rows: [] };
  for (const ts of data.teamSeasons) {
    const b = bounds.find(x => ts.season >= x.from && ts.season <= x.to);
    if (!b) continue;
    const e = bucket[b.era];
    /* A CLUB IS A FRANCHISE, NOT A CODE. Counting codes called the 2020s 31 clubs,
       because the Athletics are OAK and then ATH, and the 1950s 21, because the
       Braves, the A's, the Browns, the Dodgers and the Giants all moved and changed
       letters. Counted through `franchiseOf` a decade reads what the league really
       was: 16 clubs from 1901 to 1960, 24 by 1969, 30 now, with the Federal League
       in the 1910s and the Negro Leagues from the 1920s to the 1940s on top. */
    e.clubs.add(E.franchiseOf(ts.team, ts.season));
    e.seasons++;
    if (ts.season < e.lo) e.lo = ts.season;
    if (ts.season > e.hi) e.hi = ts.season;
    for (const p of (data.byTeamSeason[ts.team_season_id] || [])) e.rows.push(p);
  }
  const out = [];
  for (const b of bounds) {
    const e = bucket[b.era];
    if (!e.rows.length) continue;
    const top = e.rows.slice().sort((x, y) => y.w - x.w).slice(0, ERA_TOP_N);
    const arms = top.filter(p => p.r === 'p').length;
    /* WHAT THE DECADE WAS MADE OF, derived rather than written, because a
     * sentence typed here about the dead-ball years is a sentence that goes
     * stale the day the pool moves. Measured over the shipped rows, arms in a
     * decade's top forty run 7 (the 2000s) to 28 (the 1900s), so the axis is
     * real and wide. The bands leave seven of the thirteen decades unlabelled
     * ON PURPOSE: a note on every card is a note that says nothing, and a
     * balanced decade is a true thing to say nothing about. */
    const note = arms >= ERA_ARMS_HI ? 'Arms decade: the pitchers rule'
      : arms <= ERA_ARMS_LO ? 'Hitters’ decade: the bats rule'
      : '';
    out.push({
      era: b.era, lo: e.lo, hi: e.hi, clubs: e.clubs.size, seasons: e.seasons,
      depth: e.rows.length, arms, note, best: top[0] || null,
    });
  }
  return out;
}

/* Franchise focus targets: franchises you already have a player from that
 * still have a signable season on the wheel. Lets you deliberately stack a
 * franchise for chemistry. Returned most-invested first. */
function focusTargets(run, data) {
  if (run.phase !== PHASES.DRAFT) return [];
  /* Counted by FRANCHISE, because the chemistry this focus exists to stack is
     franchise-wide. Counted by code, a Marlin from 2011 and one from 2013 were
     two targets holding one man each, so the control offered to stack something
     the player had already stacked and under-reported what they held. */
  const counts = {};
  for (const p of run.roster) {
    const f = E.franchiseOf(p.t, p.s);
    counts[f] = (counts[f] || 0) + 1;
  }
  const targets = [];
  for (const team of Object.keys(counts)) {
    if (drawable(run, data, { franchise: team }).length > 0) {
      targets.push({ franchise: team, have: counts[team] });
    }
  }
  targets.sort((a, b) => b.have - a.have);
  return targets;
}

/* Open slot indices this player is eligible to fill (for the position chooser). */
function eligibleOpenSlots(run, player) {
  return openSlots(run).filter(i => fills(run, player, slotsOf(run)[i]));
}

/* ─── THE STAFF SORTS ITSELF ───
 *
 * All-Time Staff draws twelve arms into twelve named slots, and the page used to
 * stop on every pick to ask which one. Most of that question has no answer:
 * `staffEra` AVERAGES the five rotation slots and averages the seven relief slots,
 * so where a man sits INSIDE his group changes nothing the season reads. What the
 * player was being asked for, one pick at a time, was the difference between SP3
 * and SP4.
 *
 * So the draft assigns and this re-ranks. Two things are real and both are decided
 * here rather than asked:
 *
 * THE ROTATION TAKES THE BEST ARMS. A rotation slot is a fifth of 70% of the
 * innings and a relief slot a seventh of 30%, which is 14.0% against 4.3%, and
 * that gap beats the steeper return relief WAR pays (0.55 an ERA point against
 * 0.32). Worked through at every gap that comes up, the bigger arm belongs in the
 * rotation every time, by 0.021 of staff ERA per win above the man he displaces
 * and 0.207 at the worst pairing this actually produced.
 *
 * AND CL, because `closerSavePct` reads that slot by name and nothing else does.
 * Both slots sit in the same relief average, so the label costs nothing and can
 * only raise the save rate: the best closer-eligible arm takes it.
 *
 * A FIRST VERSION REFUSED TO MOVE A MAN ACROSS THE ROTATION LINE, on the argument
 * that a sort free to do so is an optimiser rather than a tidy-up and would drift
 * every win rate the mode is balanced on. That is the right worry about the wrong
 * rule. Driven for real it put Greg Maddux's 9.1 WAR at RP1 above a 4.7 WAR SP1,
 * because the rotation had filled in DRAFT ORDER and he was picked tenth. The card
 * read as broken, the staff really was worse, and "sorted by ranking" was the one
 * thing it was not. The cost is recorded rather than avoided: see the write-up.
 *
 * Within a group the order is pure display, so it is best first and SP1 is the
 * ace. A tie goes to whoever was drafted first, so the sort is stable and
 * re-sorting an unchanged staff moves nothing.
 */
function sortStaffSlots(run) {
  if (!run || !run.staff) return;
  const slots = slotsOf(run);
  const held = run.slotIndex.slice();
  const eligible = (k, slotName) => fills(run, run.roster[k], slotName);

  /* The slots this staff actually occupies, which partway through a draft is
     fewer than twelve. Reassigning among them is a permutation, so the draft's
     own choice of WHICH slots to fill is left alone and only who holds them moves. */
  const rotSlots = held.filter(si => E.slotGroup(slots[si], true) === 'ROTATION').sort((a, b) => a - b);
  const penSlots = held.filter(si => E.slotGroup(slots[si], true) !== 'ROTATION').sort((a, b) => a - b);

  /* Best first, index breaking the tie so the sort is stable. BEST BY WHAT THIS
     STAFF IS RATED ON, which is workloadWar: `staffEra` reads a starter over 210
     innings, so ranking on the season line puts a 300 inning arm at SP1 above the
     man who will actually be the better fifth of this rotation, and the card then
     says ace about somebody the ERA underneath it disagrees with. */
  const rank = run.roster.map((p, k) => k).sort((a, b) =>
    (E.workloadWar(run.roster[b]) - E.workloadWar(run.roster[a])) || (a - b));

  const put = [];
  const placed = new Set();
  /* The rotation first, from the whole staff rather than from whoever happens to
     be standing in it. A reliever cannot start, so eligibility is what stops this
     handing SP1 to a closer. */
  for (const si of rotSlots) {
    const who = rank.find(k => !placed.has(k) && eligible(k, slots[si]));
    if (who === undefined) continue;
    placed.add(who); put.push([who, si]);
  }
  /* Then CL, before the rest of the pen, because it is the one relief slot the sim
     reads by name AND the one not every arm may fill: a starter who overflowed
     into the bullpen is not closer-eligible. SO THIS CLAUSE IS NOT ONLY THE BUFF,
     IT IS WHAT KEEPS THE ROSTER LEGAL. Removed, the fill below hands CL to whoever
     the ranking leaves there, and nothing throws: the sim reads him as the closer
     and converts saves off his WAR. */
  const clSlot = penSlots.find(si => slots[si] === 'CL');
  if (clSlot !== undefined) {
    const who = rank.find(k => !placed.has(k) && eligible(k, 'CL'));
    if (who !== undefined) { placed.add(who); put.push([who, clSlot]); }
  }
  for (const si of penSlots) {
    if (si === clSlot && put.some(([, s]) => s === si)) continue;
    const who = rank.find(k => !placed.has(k) && eligible(k, slots[si]));
    if (who === undefined) continue;
    placed.add(who); put.push([who, si]);
  }

  /* ALL OR NOTHING. Every arm has to land or the staff comes back with two men in
     one slot and one slot empty, which is a legal-looking roster the sim reads
     without complaint. Eligibility makes a complete assignment possible here (each
     slot was filled by an eligible man at draft time), so a short answer is a bug
     in this function rather than a roster it cannot solve. */
  if (put.length !== run.roster.length) return;

  for (const [k, si] of put) {
    run.slotIndex[k] = si;
    /* `draws` records what a pick became. Nothing reads its slot today, and a
       field that quietly stops being true is how the next reader gets it wrong. */
    if (run.draws[k]) run.draws[k].slot = slots[si];
  }
}

/* WHERE THIS ARM WOULD ACTUALLY END UP, for the tile to print before the tap.
 *
 * `slotForPlayer` is the wrong answer to show: it says which slot the signing
 * TAKES, and the re-rank then moves everybody, so a tile promising the rotation to
 * the sixth-best starter on the board would be wrong a frame later. That is the
 * tile-and-sheet disagreement this mode has already had once, arriving at a tile
 * and a lineup card instead.
 *
 * It answers by doing it: a shallow clone, the real signing, the real sort. A
 * second copy of the ranking rule written out for display is how the two come
 * apart, and this way there is only ever one.
 */
function staffLanding(run, player) {
  if (!run || !run.staff) return null;
  const slot = slotForPlayer(run, player);
  if (slot === null) return null;
  const probe = {
    ...run,
    roster: run.roster.concat([player]),
    slotIndex: run.slotIndex.concat([slot]),
    draws: run.draws.concat([null]),
  };
  sortStaffSlots(probe);
  const name = slotsOf(run)[probe.slotIndex[probe.roster.length - 1]];
  if (name === 'CL') return 'Closer';
  return E.slotGroup(name, true) === 'ROTATION' ? 'Rotation' : 'Bullpen';
}

/* Sign a player from the current draw. Pass slotIdx to place them at a chosen
 * position (from the click-to-choose UI); otherwise auto-assign. */
function sign(run, player, slotIdx) {
  if (run.phase !== PHASES.DRAFT) throw new Error('not drafting');
  if (!run.currentDraw) throw new Error('nothing drawn');
  const key = pkey(player);
  if (!run.currentDraw.options.includes(key)) throw new Error('not an option');

  let slot;
  if (typeof slotIdx === 'number') {
    if (run.slotIndex.includes(slotIdx) || !fills(run, player, slotsOf(run)[slotIdx]))
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
    player: key,
    slot: slotsOf(run)[slot],
  });
  run.currentDraw = null;

  /* AT THE DRAFT AND NOWHERE ELSE. `cutPlayer` puts a replacement-level arm in the
     slot a man was cut from, mid-season, and re-sorting there would promote the
     best remaining reliever into CL and hand back save rate the player had just
     lost. A cut is meant to cost something. */
  sortStaffSlots(run);

  // Draft complete?
  if (run.roster.length >= slotsOf(run).length) {
    run.phase = PHASES.SEASON;
  }
}

/* What a mode suppresses, in one place.
 *
 * A link the mode's own rule guarantees is not a decision, so it does not pay. Eras
 * Mode bounds every pick to one decade, which fires the "same era" link on nearly
 * every pair; One Franchise puts all twelve in the same uniform. Everything that
 * touches chemistry goes through the helpers below rather than calling the engine
 * directly, because the draft board, the diamond and the season all have to agree:
 * a rail that draws links the season does not pay for is worse than no rail. */
function chemOpts(run) {
  const suppress = [];
  if (!run) return { suppress };
  // playRun reads staff off the same object, so the two travel together and a
  // season can never be simulated under one mode's rules and scored under another's.
  if (run.era) suppress.push('era');
  // One club, or a division's four to six of them: with twelve picks out of that
  // few, the pigeonhole alone guarantees repeats, so a franchise link is the mode
  // talking rather than a choice you made.
  if (run.franchise || run.division) suppress.push('franchise');
  return { suppress, staff: !!run.staff };
}
/* The chemistry of a run's roster (or any roster, under that run's rules). */
/* The roster with each man's slot on him. The double-play combo and the battery
   read the slot a man is PLAYING, so chemistry has to be asked of a tagged roster
   or a shortstop drafted and stood at first would still count at short. */
function placed(run, roster) {
  const r = roster || run.roster;
  if (r !== run.roster) return r;
  return r.map((p, k) => (p._slot ? p : { ...p, _slot: slotsOf(run)[run.slotIndex[k]] }));
}
function chemOf(run, roster) {
  return E.resolveChemistry(placed(run, roster), chemOpts(run));
}
function chemByPlayer(run, roster, resolved) {
  return E.chemistryByPlayer(placed(run, roster), resolved, chemOpts(run));
}
function chemWorth(run) {
  return E.chemistryWorth(run.roster, run.slotIndex.map(i => slotsOf(run)[i]), chemOpts(run));
}

/* Preview chemistry if you were to sign this player. */
function previewSigning(run, player) {
  const o = chemOpts(run);
  const mine = placed(run);
  const at = slotForPlayer(run, player);
  const cand = at === null ? player : { ...player, _slot: slotsOf(run)[at] };
  const before = E.resolveChemistry(mine, o);
  const after = E.resolveChemistry(mine.concat([cand]), o);
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
  const slotNames = run.slotIndex.map(i => slotsOf(run)[i]);
  const pool = poolFor(run);
  const result = E.playRun(run.roster, rng, slotNames, pool, chemOpts(run));
  result.allTimeRank = (_data && !run.staff) ? E.nationalRank(result.rating, _data.ratingTable) : null;

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
    shownRating: result.shownRating,
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
    // each with their ACTUAL slot from slotIndex, because the sim reads SP1/SP2/CL
    // from these tags.
    const rng = rngFor(run);
    const tagged = run.roster.map((p, k) => ({ ...p, _slot: slotsOf(run)[run.slotIndex[k]] }));
    const chem = E.resolveChemistry(tagged, chemOpts(run));
    const structure = run.staff ? { multiplier: 1, archetype: null } : E.rosterStructure(tagged);
    const offense = run.staff ? E.staffOffense()
      : E.rosterOffense(tagged, chem.multiplier, structure.multiplier);
    const defense = run.staff ? E.staffRunPrevention(tagged, chem.multiplier)
      : E.rosterRunPrevention(tagged, chem.multiplier);
    const savePct = E.closerSavePct(tagged);
    const pool = poolFor(run);
    const schedule = E.generateSchedule(rng, E.CONSTANTS.REGULAR_SEASON_GAMES, pool);
    /* Two numbers doing two jobs. `rating` is the yardstick against real clubs
       and the title difficulty; `shownRating` is what the player reads. See
       teamRating() in engine.js. */
    const rating = run.staff ? E.staffRating(tagged) : E.squadRating(run.roster);
    const shownRating = run.staff ? E.staffRating(tagged) : E.teamRating(offense, defense);

    run._simState = {
      rng, tagged, chem, structure, offense, defense, savePct, schedule, rating, shownRating,
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
/* ─── Salary Cap Survivor ───────────────────────────────────────────────── */

/* What the roster costs right now, after any raises the market has handed out. */
function payroll(run) {
  return money(run.roster.reduce((s, p) => s + p.p, 0) + E.respinFees(run.respinsUsed));
}
/* Over the cap by how much. Zero or less means you are fine. */
function overCap(run) {
  return money(payroll(run) - capOf(run));
}

/* Does a shock land on this game? Returns its 1-based number, or 0. */
function marketAt(run, gameIndex) {
  if (!run.capSurvivor) return 0;
  const i = E.MARKET.GAMES.indexOf(gameIndex);
  return i < 0 ? 0 : i + 1;
}

/* The market moves. One player's number goes up, weighted toward the good ones,
 * because it is the stars who get paid and taking the cheapest man on the roster
 * to arbitration is not a decision anybody has to think about.
 *
 * Returns what happened, including whether it put you over. Never raises a
 * replacement-level body: those are already at the minimum and raising them would
 * spend a shock on nothing. */
function applyMarket(run, gameIndex) {
  const n = marketAt(run, gameIndex);
  if (!n) return null;
  // Once per game, ever. The screen re-enters the same game index after a cut, and
  // without this the shock fires again on the way back in and the raise compounds.
  if ((run.market || []).some(m => m.gameIndex === gameIndex)) return null;
  const rng = rngFor(run);
  const already = new Set((run.market || []).map(m => m.rosterIdx));
  const live = run.roster.map((p, i) => ({ p, i })).filter(x => !x.p._repl);
  // Somebody new if there is anybody new. Weighting on WAR alone kept handing the
  // same star three of the five raises, which reads as the game picking on one man
  // rather than as a market.
  const fresh = live.filter(x => !already.has(x.i));
  const candidates = fresh.length ? fresh : live;
  if (!candidates.length) return null;
  // weight by WAR so the raise lands on somebody worth keeping
  const total = candidates.reduce((s, x) => s + Math.max(0.2, x.p.w), 0);
  let roll = rng() * total, pick = candidates[candidates.length - 1];
  for (const x of candidates) {
    roll -= Math.max(0.2, x.p.w);
    if (roll <= 0) { pick = x; break; }
  }
  const pct = E.MARKET.RAISE_MIN + rng() * (E.MARKET.RAISE_MAX - E.MARKET.RAISE_MIN);
  const before = pick.p.p;
  const raise = Math.max(E.MARKET.MIN_RAISE_MUSD, money(before * pct));
  // The roster array holds the player objects the sim reads, so raise in place.
  run.roster[pick.i] = { ...pick.p, p: money(before + raise) };
  run.market = run.market || [];
  const event = {
    shock: n, gameIndex, rosterIdx: pick.i,
    name: pick.p.n, before, after: money(before + raise), raise: money(raise),
  };
  run.market.push(event);
  event.over = overCap(run);
  return event;
}

/* Cut a player. A league-minimum body takes the slot, so the roster stays legal
 * and the loss shows up where it should: in the runs. */
function cutPlayer(run, rosterIdx) {
  const p = run.roster[rosterIdx];
  if (!p) throw new Error('no such player');
  if (p._repl) throw new Error('already a replacement');
  const slot = slotsOf(run)[run.slotIndex[rosterIdx]];
  run.roster[rosterIdx] = E.replacementFor(slot, p.s);
  run.cuts = run.cuts || [];
  run.cuts.push({ name: p.n, slot, price: p.p });
  // The sim caches a tagged roster; drop it so the next game reads the new one.
  if (run._simState) run._simState = rebuildSimState(run);
  return { name: p.n, slot, stillOver: overCap(run) };
}

/* Re-derive the cached season state after the roster changes mid-run, keeping the
 * games already played. Without this a cut costs you nothing: the sim would go on
 * reading the roster it tagged before the market moved. */
function rebuildSimState(run) {
  const st = run._simState;
  const tagged = run.roster.map((p, k) => ({ ...p, _slot: slotsOf(run)[run.slotIndex[k]] }));
  const chem = E.resolveChemistry(tagged, chemOpts(run));
  const structure = run.staff ? { multiplier: 1, archetype: null } : E.rosterStructure(tagged);
  const offense = run.staff ? E.staffOffense()
    : E.rosterOffense(tagged, chem.multiplier, structure.multiplier);
  const defense = run.staff ? E.staffRunPrevention(tagged, chem.multiplier)
    : E.rosterRunPrevention(tagged, chem.multiplier);
  return {
    ...st,
    tagged, chem, structure, offense, defense,
    savePct: E.closerSavePct(tagged),
    /* THE SAME FORMULA advanceGame() SEEDS, and for a while it was not.
     *
     * This rebuild used to write `overallRating(teamWinPct(offense, defense))`,
     * which is a THIRD number: teamRating's inputs through squadRating's tail. So
     * the yardstick a run was graded on depended on whether it had cut anybody,
     * and engine.js says in as many words that these two may not do each other's
     * job. Only two functions reach here, `cutPlayer` and `acceptTrade`, so it was
     * exactly Cap Survivor and the Trade Machine, and cutting is Cap Survivor's
     * whole loop: the market puts you over and the sheet reopens until you are
     * under. Nobody had to go looking for it.
     *
     * What it cost, driven over 25 Cap Survivor runs cutting the cheapest man:
     * the team got genuinely worse on 25 of 25 (shownRating always fell) and the
     * yardstick still ROSE a mean of 8.8 points, moving the all-time rank a mean
     * of 282 places better. The direction is arbitrary rather than generous,
     * because the two are different scales: over 180 rosters the swap ran a median
     * +15.1 and from -2.9 to +34.1. The Trade Machine takes three trades a run, so
     * it rebuilt three times, and finished on a mean all-time rank of FOURTH of
     * 2,594 real team-seasons (seventh on a greedier draft bot, second on the
     * sweep in check-yardstick: every reading of it is the top ten).
     *
     * It is a balance change and was made on purpose: a higher rating buys a
     * weaker opponent (titleEdge's PIVOT is 84), so at a fixed record a good
     * roster's title rate fell 7.7% back to 5.7% when this was corrected. */
    rating: run.staff ? E.staffRating(tagged) : E.squadRating(run.roster),
    shownRating: run.staff ? E.staffRating(tagged) : E.teamRating(offense, defense),
  };
}

/* ─── The Trade Machine ──────────────────────────────────────────────────
 *
 * You are handed a roster instead of drafting one. It is assembled at random
 * under the cap, so it is nobody's idea of a contender, and then three times
 * across the season the phone rings: somebody will give you a better player for
 * one of yours, and the difference comes out of your payroll.
 *
 * That is the whole mode. You cannot draft your way out of it, only deal. */
const TRADE = {
  WINDOWS: [38, 82, 120],   // three deadlines
  OFFERS: 3,
  /* An offer has to be an upgrade or there is no decision, and it has to cost
   * something or there is no decision either. */
  MIN_GAIN_WAR: 0.8,
};

/* Assemble a roster the player did not choose. Uses the ordinary draft machinery,
 * signing a random affordable option each spin, so whatever comes out is legal by
 * construction: every slot filled, every price gate respected. */
function dealRoster(run, data) {
  let guard = 0;
  while (run.phase === PHASES.DRAFT && guard++ < 600) {
    let draw;
    try { draw = spin(run, data); } catch (e) { return false; }
    const keys = (draw.options || []);
    if (!keys.length) {
      const rs = canRespin(run);
      if (rs.ok) { respin(run, data); continue; }
      return false;
    }
    const rng = rngFor(run);
    const players = keys.map(k => data.allPlayers[k]).filter(Boolean);
    if (!players.length) return false;
    /* Random, not best: the point is that you did not pick this team. But random
     * across the whole board buys scrubs, because most of any board is scrubs, and
     * a roster dealt that way spent $59M of $170M and won 56 games. So it spends
     * to its means: aim at the per-slot share of what is left and take one of the
     * three nearest to it. What comes out is a mid-tier club with no holes it
     * chose and no stars it earned, which is the team this mode is about. */
    const left = Math.max(1, slotsOf(run).length - run.roster.length);
    const target = remaining(run) / left;
    const near = players.slice()
      .sort((a, b) => Math.abs(a.p - target) - Math.abs(b.p - target))
      .slice(0, 3);
    const pick = near[Math.floor(rng() * near.length)];
    try { sign(run, pick); } catch (e) {
      let ok = false;
      for (const p of players) { try { sign(run, p); ok = true; break; } catch (_) {} }
      if (!ok) return false;
    }
  }
  return run.roster.length >= slotsOf(run).length;
}

/* Players who can fill a slot, built once per slot and kept on the data object.
 * Forty-four thousand player-seasons scanned per offer, three offers a window and
 * three windows, is a scan the phone can feel. */
function slotPool(run, data, slot) {
  data._slotPool = data._slotPool || {};
  const key = (run.staff ? 'staff:' : 'lineup:') + slot;
  if (!data._slotPool[key]) {
    const out = [];
    for (const k in data.allPlayers) {
      const p = data.allPlayers[k];
      if (p.t === 'TOT') continue;
      if (fills(run, p, slot)) out.push(p);
    }
    data._slotPool[key] = out;
  }
  return data._slotPool[key];
}

/* Is a trade window open on this game? Returns its 1-based number, or 0. */
function tradeAt(run, gameIndex) {
  if (!run.tradeMachine) return 0;
  const i = TRADE.WINDOWS.indexOf(gameIndex);
  return i < 0 ? 0 : i + 1;
}

/* Three offers: a better player for one of yours, at a price. Each one names the
 * slot it touches, so the swap is always legal, and each is affordable under the
 * cap as things stand or it is not offered at all. */
function tradeOffers(run, data, gameIndex) {
  const n = tradeAt(run, gameIndex);
  if (!n) return null;
  if ((run.trades || []).some(t => t.gameIndex === gameIndex)) return null;
  const rng = rngFor(run);
  const slots = slotsOf(run);
  const used = new Set(run.usedPlayers);
  const headroom = money(capOf(run) - payroll(run));
  const offers = [];
  /* Weakest first: those are the holes a real GM would be shopping. Weakest by
   * what he is WORTH TO THIS CLUB rather than by his season line, or a heavy
   * innings starter is read as the best arm on the roster and never shopped. */
  const mine = run.roster.map((p, i) => ({ p, i, slot: slots[run.slotIndex[i]] }))
    .sort((a, b) => E.workloadWar(a.p) - E.workloadWar(b.p));

  for (const own of mine) {
    if (offers.length >= TRADE.OFFERS) break;
    if (offers.some(o => o.slot === own.slot)) continue;
    const pool = slotPool(run, data, own.slot);
    const budget = own.p.p + headroom;
    /* MIN_GAIN_WAR IS A PROMISE AND IT WAS MEASURED ON THE WRONG NUMBER. This
     * mode's whole offer is a better player for one of yours, and a season WAR
     * is not what a heavy innings starter is worth here: the price was built on
     * 210 innings and, since workloadWar, so is the season. Filtered raw, one
     * offer in five advertised a gain that was really a loss or nothing, worst
     * case "+5.2 WAR" for a swap worth -0.5, measured over 1,578 real offers.
     * Nothing threw: every figure on the sheet was a true statement about a
     * season, and the only symptom was a mode that made your team worse. */
    const ownW = E.workloadWar(own.p);
    const cands = pool.filter(c =>
      E.workloadWar(c) >= ownW + TRADE.MIN_GAIN_WAR && c.p <= budget && !used.has(c.i));
    if (!cands.length) continue;
    const got = cands[Math.floor(rng() * cands.length)];
    offers.push({
      window: n, gameIndex, slot: own.slot, rosterIdx: own.i,
      /* `half` rides along because an offer is a flat projection rather than
       * the player row, and without it a two-way season's WAR reads on this
       * screen as the man's whole year when it is one side of his ball.
       *
       * `r`, `pp` and `ip` ride along for the same reason and a sharper one.
       * A heavy starter is priced on what he did in 210 innings AND, since
       * workloadWar, played on it, so his real value to your club is under the
       * figure this screen prints. Without these three the page's own heavyIP
       * reads `r` as undefined, answers no for every man alive, and the offer
       * is the one decision surface that cannot tell a 240 inning arm from a
       * 180 inning one. It failed that way silently: measured over 2,274 offer
       * sides it tagged exactly none of them, which reads as a pool with no
       * workhorses in it rather than as a projection missing a field. */
      out: { n: own.p.n, w: own.p.w, p: own.p.p, s: own.p.s, t: own.p.t, half: own.p.half,
        r: own.p.r, pp: own.p.pp, ip: own.p.ip },
      in: { n: got.n, w: got.w, p: got.p, s: got.s, t: got.t, half: got.half,
        r: got.r, pp: got.pp, ip: got.ip },
      cost: money(got.p - own.p.p),
      key: pkey(got),
    });
  }
  return offers.length ? offers : null;
}

/* Take the deal. */
function acceptTrade(run, data, offer) {
  const got = data.allPlayers[offer.key];
  if (!got) throw new Error('player gone');
  const outP = run.roster[offer.rosterIdx];
  run.roster[offer.rosterIdx] = got;
  const gi = run.usedPlayers.indexOf(outP.i);
  if (gi >= 0) run.usedPlayers.splice(gi, 1);
  run.usedPlayers.push(got.i);
  run.trades = run.trades || [];
  run.trades.push({ ...offer, accepted: true });
  if (run._simState) run._simState = rebuildSimState(run);
  return { out: offer.out, in: offer.in };
}
/* Pass, and record that the window is spent so it does not reopen. */
function declineTrades(run, gameIndex, windowNo) {
  run.trades = run.trades || [];
  run.trades.push({ gameIndex, window: windowNo, accepted: false });
}

function finalizeSeason(run) {
  const st = run._simState;
  if (!st) throw new Error('no sim state');

  const seed = E.seedFromRecord(st.wins);
  const playoffs = E.generatePlayoffs(seed, st.offense, st.defense, st.savePct, st.rng, st.wins, st.rating, poolFor(run));
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
    shownRating: st.shownRating,
    allTimeRank: (_data && !run.staff) ? E.nationalRank(st.rating, _data.ratingTable) : null,
    offense: Math.round(st.offense * 100) / 100,
    defense: Math.round(st.defense * 100) / 100,
    savePct: Math.round(st.savePct * 1000) / 1000,
  };
  run.phase = PHASES.OVER;
  /* Keep the game-by-game line before the sim state goes. The results screen and
   * the shareable grid are both drawn after this point, and one bit per game is
   * the whole of what they need. */
  run.gameLine = st.results.map(r => (r.won ? 1 : 0));
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
    const elig = pool.filter(p => fills(run, p, slot)).sort((a, b) => a.p - b.p);
    const fr = []; let best = -1;
    for (const p of elig) { if (p.w > best) { fr.push(p); best = p.w; } }
    return fr;
  };

  let dp = new Array(CAP + 1).fill(-1); dp[0] = 0;
  let picks = new Array(CAP + 1).fill(null);
  for (const slot of slotsOf(run)) {
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
  const slotNames = run.slotIndex.map(i => slotsOf(run)[i]);
  const pool = poolFor(run);
  const wins = [];
  let po = 0, title = 0, rec = 0;
  for (let i = 0; i < n; i++) {
    const rng = E.createSeededRNG((run.seed ^ (i * 2654435761)) >>> 0);
    const out = E.playRun(run.roster, rng, slotNames, pool, chemOpts(run));
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
  /* `drawable` is exported so a guard can ask the REAL rule what a lock allows.
     Driven through `spin` instead, the answer is one seeded sample and a season a
     mode can reach is indistinguishable from one it happened not to draw. */
  drawable,
  spin, respin, sign, focusTargets, eligibleFranchises, eligibleEras,
  chemOpts, chemOf, chemByPlayer, chemWorth,
  slotsOf, eligOf,
  payroll, overCap, marketAt, applyMarket, cutPlayer,
  TRADE, dealRoster, tradeAt, tradeOffers, acceptTrade, declineTrades,
  playSeason, advanceGame, finalizeSeason,
  previewSigning, bestPossibleSquad, projectSeason,
  indexData,
  remaining, reserveFloor, fullFloor, spendable, canRespin, canFinishAfter,
  openSlots, openSlotNames, slotForPlayer, eligibleOpenSlots, slotsLeft, sortStaffSlots, staffLanding,
  capOf, money, blockFor, BLOCK,
};

if (typeof module !== 'undefined' && module.exports) module.exports = publicAPI;
if (typeof window !== 'undefined') window.RTD_RUN = publicAPI;
})();
