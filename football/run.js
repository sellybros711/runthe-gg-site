/* The Perfect Season, draft loop and run state.
 *
 * Headless and dependency-free. Browser: window.PS_RUN. Node: require.
 *
 * The run state is deliberately a plain serializable object with the seed inside
 * it, so a mode is a config flag rather than a rewrite: pass
 * `{ franchise: 'MIA' }` and every spin of the draft is a Dolphins season, which
 * is the whole of One Franchise mode.
 */

'use strict';

const E = (typeof require !== 'undefined')
  ? require('./engine.js')
  : window.PS_ENGINE;

/* PICK_FRANCHISE is gone. There is no favourite club to choose, so a run opens on the draft:
   the schedule is 17 random historic team-seasons and the playoffs are a fixed difficulty
   ladder, neither of which depends on who you support. */
const PHASES = {
  DRAFT: 'draft',
  SEASON: 'season',      // the 17 regular-season games
  SEEDING: 'seeding',    // record is final, showing where it left you
  PLAYOFFS: 'playoffs',  // one loss ends it
  OVER: 'over',
};

const pkey = (p) => `${p.player_id}|${p.season}`;

/**
 * What chemistry needs to know about the mode. One field, but it goes to five
 * call sites and every one of them has to agree: the preview on a draft tile, the
 * season's real multiplier, the best-possible-squad solver's objective and the
 * chemistry it reports. Get one wrong and the tile promises a bonus the season
 * does not pay.
 */
const chemOpts = (run) => ({ sameClub: !!(run && run.franchise) });

/**
 * Money still available. The re-spin fee comes out of the cap, so the budget
 * shrinks as you fish for a better team-season, a re-spin costs you a tier of
 * player somewhere else, which is the point.
 */
/*
 * MONEY IS ROUNDED TO THE CENT, and this is a bug fix rather than tidiness.
 *
 * Every price in the pool has one decimal place and so does the cap, so any sum
 * of them is exact to a cent. In binary floating point it is not: a five-man
 * roster costing $134.8M leaves 140 - 134.8 = 5.199999999999989, and the last
 * quarterback the club has left is priced at exactly $5.2M. He is 1.1e-14 too
 * expensive, so the wheel has nothing to land on and the draft dead-ends one
 * spin from the end with the money to finish it sitting right there.
 *
 * Found in One Franchise mode, where a club can have exactly one affordable man
 * left, but it was always possible in free play and nobody had hit it.
 */
const money = (v) => Math.round(v * 100) / 100;

function remaining(run) {
  const spent = run.roster.reduce((s, p) => s + p.price_musd, 0);
  const fees = E.respinFees(run.respinsUsed);
  return money(E.CONSTANTS.CAP_MUSD - spent - fees);
}

/** Slots still to fill, including the current one. */
const slotsLeft = (run) => E.SLOTS.length - run.roster.length;

/**
 * The floor the UI warns about: money you must keep back or you cannot legally
 * finish the draft.
 *
 * §5 wants this as a passive warning on signings, bankrupting yourself into
 * five minimum-salary scrubs is a lesson the game is allowed to teach. It is a
 * hard block on RE-SPINS only, because a re-spin that makes the draft
 * unfinishable is not a lesson, it is a dead end.
 *
 * WHY THIS IS NO LONGER A FLAT $3M A SLOT, and it is One Franchise mode that
 * broke it. $3M works in free play because the wheel draws from 861 team-seasons
 * and somewhere in there is a $3M man at every position. One club is twenty-odd
 * seasons, and a club can simply not have a cheap one: the cheapest quarterback
 * in Atlanta's whole history in this pool is $5.0M and Chicago's is $6.8M. So a
 * greedy draft spends down to $4.2M with the quarterback spot still open, every
 * remaining Falcons season is unaffordable, and the wheel has nothing to land
 * on. Measured before this: 90 of 1280 club drafts, 7%, dead-ended exactly that
 * way, and every one of them was a run the player could not finish.
 *
 * So the reserve is read off the pool this run actually draws from. The cheapest
 * man who can still fill each open spot is assigned to it, most-constrained spot
 * first, and the sum of those is what has to stay in the budget. Minus the
 * smallest of them, because one of those spots is the one you are filling right
 * now: whichever it turns out to be, dropping the cheapest is the safe bound.
 *
 * In free play the two formulas agree to the cent, which is not a coincidence:
 * the price floor is $3M and every position has somebody at it, so the pool
 * calculation lands on the same $3M a slot the constant always meant.
 */
function reserveFloor(run) {
  const flat = Math.max(0, slotsLeft(run) - 1) * E.CONSTANTS.MIN_RESERVE_PER_SLOT_MUSD;
  const per = assignedFloors(run);
  if (!per || per.length !== slotsLeft(run)) return flat;
  const sum = per.reduce((a, c) => a + c, 0);
  return money(Math.max(flat, sum - Math.min(...per)));
}

/**
 * What it would cost to fill EVERY open spot at the cheapest man left who can
 * take it. reserveFloor's answer plus the one it drops, and the right question
 * for a re-spin, which has to leave the whole roster fillable rather than all
 * but one of it.
 */
function fullFloor(run) {
  const per = assignedFloors(run);
  const flat = slotsLeft(run) * E.CONSTANTS.MIN_RESERVE_PER_SLOT_MUSD;
  if (!per || per.length !== slotsLeft(run)) return flat;
  return money(Math.max(flat, per.reduce((a, c) => a + c, 0)));
}

/**
 * One price per open spot: the cheapest unsigned man in this run's pool who can
 * fill it, with no man counted for two spots.
 *
 * Most-constrained spot first, which is exact here rather than a heuristic: the
 * eligibility sets are nested, QB takes only quarterbacks and FLEX takes
 * everything the other three do, so giving the narrow spots first pick can never
 * strand a wide one.
 *
 * Returns null before the first spin, when the pool is not known yet, and the
 * caller falls back to the flat constant.
 */
function assignedFloors(run) {
  const lists = run.floorLists;
  if (!lists) return null;
  const taken = new Set(run.usedPlayers);
  /* A CHEAP MAN THE WHEEL CANNOT REACH IS NOT A FLOOR. Houston's cheapest
     quarterback in the pool is Tom Savage at $8.1M and he plays for exactly one
     team-season, 2017; sign two other Texans out of 2017 and that season has had
     its two draws and can never come up again. Reserving $8.1M for a man behind a
     door that is already shut is how the last of these dead ends survived. */
  const spent = {};
  for (const id of run.usedTeamSeasons) spent[id] = (spent[id] || 0) + 1;
  const reachable = (c) => (spent[c.ts] || 0) < TUNING.MAX_DRAWS_PER_TEAM_SEASON;
  const open = openSlots(run).map((i) => E.SLOTS[i])
    .sort((a, b) => E.SLOT_ELIGIBILITY[a].length - E.SLOT_ELIGIBILITY[b].length);
  const out = [];
  for (const slot of open) {
    let best = null;
    for (const pos of E.SLOT_ELIGIBILITY[slot]) {
      for (const c of (lists[pos] || [])) {
        if (taken.has(c.id) || !reachable(c)) continue;
        if (best === null || c.price < best.price) best = c;
        break;                          // each list is cheapest first
      }
    }
    if (best === null) return null;     // a spot nobody left can fill: promise nothing
    taken.add(best.id);
    /* EVERY SPOT NEEDS ITS OWN SPIN, and a spin spends one of a team-season's two
       draws. So the man promised to one spot uses up the season he plays for, and
       the next spot cannot be promised somebody standing behind him in that same
       season. Miami's cheapest tight end and the only quarterback left inside the
       budget were the same team-season: counted separately the roster looked
       fillable, and taking the tight end shut the door on the quarterback. */
    spent[best.ts] = (spent[best.ts] || 0) + 1;
    out.push(best.price);
  }
  return out;
}

/**
 * The most you may commit on this signing.
 *
 * Rounded in its own right and not just built from two rounded numbers, because
 * the SUBTRACTION reintroduces the error: $8.2M less a $5.2M reserve is
 * 2.9999999999999991 in binary, and the last $3.0M tight end the club has left
 * is a cent too expensive again. One function, so every caller asks the same
 * question and gets the same answer.
 */
function spendable(run) {
  return money(remaining(run) - reserveFloor(run));
}

/**
 * Whether you can re-spin, and what it would cost.
 *
 * `kind` is 'team', 'year', or omitted for "either". Passing a kind also checks
 * that the wheel has somewhere else to land: keeping the year is no use if that
 * year holds only the team you are looking at, and there is no point charging for
 * it.
 */
function canRespin(run, kind, data) {
  const cost = E.respinCost(run.respinsUsed);
  if (run.phase !== PHASES.DRAFT) return { ok: false, reason: 'not drafting', cost };
  if (run.respinsUsed >= E.CONSTANTS.MAX_RESPINS) return { ok: false, reason: 'no re-spins left', cost };
  const draw = run.currentDraw;
  /*
   * EVERY QUESTION HERE IS ASKED OF THE STATE THE RE-SPIN WOULD LEAVE BEHIND, and
   * that is two changes rather than one. The fee is paid, which was always
   * simulated: charging $5M can push team-seasons out of reach, so a check run
   * against the pre-fee budget can approve a re-spin whose constraint is then
   * impossible to honor. And the team-season you are looking at is SPENT, which
   * was not: it goes into usedTeamSeasons the moment you re-spin, and if it was
   * the last reachable season holding the club's cheapest quarterback then the
   * money you have to keep back jumps the instant you press the button. Approve
   * against the old floor and the draft is unfinishable one spin later, with the
   * budget sitting a few million under what it now needs.
   *
   * Both are bumped and restored rather than threaded through drawable ->
   * affordableFrom -> blockFor -> remaining, which all read them.
   */
  run.respinsUsed++;
  if (draw) run.usedTeamSeasons.push(draw.team_season_id);
  let rest = null;
  let short = false;
  try {
    short = remaining(run) < fullFloor(run);
    if (!short && kind && draw && data) {
      rest = drawable(run, data).filter((t) => t.team_season_id !== draw.team_season_id);
    }
  } finally {
    if (draw) run.usedTeamSeasons.pop();
    run.respinsUsed--;
  }
  // Must still be able to fill every remaining slot at the cheapest man left who
  // can take it, which in One Franchise mode is not the same as $3M a slot.
  if (short) {
    return { ok: false, reason: 'would leave too little to fill your roster', cost };
  }
  if (rest) {
    /* Asked against the SAME constraint the re-spin will apply, or the check approves a
       re-spin the wheel then cannot honour and it falls back to an unconstrained draw. */
    const ok = kind === 'team'
      ? rest.some((t) => t.season === draw.season)
      : rest.some((t) => t.franchise === draw.franchise && t.season !== draw.season);
    if (!ok) {
      return {
        ok: false,
        cost,
        reason: kind === 'team'
          ? `no other ${draw.season} team you could use`
          : `no other ${E.nickname(draw.franchise)} season you could use`,
      };
    }
  }
  return { ok: true, cost };
}

/*
 * Why you cannot sign someone, kept as a reason rather than a filter.
 *
 * The draft list used to be cut down to what you could sign, so a team's best
 * player was simply absent and it read as missing data. Every player the team
 * had is on the board now, and an unavailable one carries the reason.
 */
const BLOCK = { DRAFTED: 'drafted', NO_SPOT: 'no_spot', PRICE: 'price' };

/**
 * Why this player is out, or null if you can sign him.
 *
 * A PERSON can only be drafted once, not a person-season. Two Tom Bradys in one
 * huddle is not a roster, and the wheel can offer the same man twice easily:
 * a team-season can come up twice, and any franchise you already signed from is
 * favored for later spins, so his other years keep reappearing.
 *
 * Order matters. Already drafted is permanent, so it wins over a price you
 * might still be able to afford after a cheaper signing elsewhere.
 */
function blockFor(run, player, teamSeasonId) {
  if (run.usedPlayers.includes(player.player_id)) return BLOCK.DRAFTED;
  if (slotForPlayer(run, player) === null) return BLOCK.NO_SPOT;
  if (!canFinishAfter(run, player, teamSeasonId)) return BLOCK.PRICE;
  return null;
}

/**
 * Could you still finish the draft having signed this man?
 *
 * ASKED PER PLAYER, and it has to be. reserveFloor() answers the same question
 * for the row of numbers at the top of the screen, where there is no player to
 * ask about, so it has to guess which spot you are about to fill and guesses the
 * cheapest. That is the safe guess for a display and the wrong one for a block:
 * sign a tight end out of the only Dallas season that still had a cheap
 * quarterback in it and that season is spent, the quarterback is gone, and the
 * money you now need jumps by six million after the signing rather than before
 * it. Twenty-five of 4,800 club drafts died exactly there, all of them with the
 * budget looking fine right up to the last spin.
 *
 * Simulating the signing costs nothing worth counting: the state is pushed and
 * popped, and it runs once per man on a twelve-man board.
 *
 * In free play this is the old rule to the cent. Every position has a $3M man
 * across 861 team-seasons, so "what is left after him" is always $3M a slot.
 */
function canFinishAfter(run, player, teamSeasonId) {
  const slot = slotForPlayer(run, player);
  if (slot === null) return false;
  /* The cheap reject first. Most blocked men are blocked because the budget will
     not cover them at all, and that costs one subtraction instead of building a
     whole assignment. This runs for every man on every team-season in the pool
     on every spin, so the constant matters. */
  if (player.price_musd > remaining(run)) return false;
  /* THE TEAM-SEASON HAS TO BE PASSED IN, not read off run.currentDraw, because
     drawable() asks this question about every season in the pool while
     currentDraw still holds the LAST one. Reading the wrong season made the
     board and sign() disagree, so a tile you could see refused to be taken. */
  const ts = teamSeasonId
    || (run.currentDraw && run.currentDraw.team_season_id);
  run.roster.push(player);
  run.slotIndex.push(slot);
  run.usedPlayers.push(player.player_id);
  if (ts) run.usedTeamSeasons.push(ts);
  try {
    return remaining(run) >= fullFloor(run);
  } finally {
    if (ts) run.usedTeamSeasons.pop();
    run.usedPlayers.pop();
    run.slotIndex.pop();
    run.roster.pop();
  }
}

/** Every player on a team-season, best first, each with the reason he is out. */
function boardFrom(run, teamSeasonId, playersByTeamSeason) {
  return (playersByTeamSeason[teamSeasonId] ?? [])
    .map((p) => ({ player: p, block: blockFor(run, p, teamSeasonId) }))
    .sort((a, b) => b.player.ppr_ppg_mean - a.player.ppr_ppg_mean);
}

/** Just the ones you could sign right now. */
function affordableFrom(run, teamSeasonId, playersByTeamSeason) {
  return boardFrom(run, teamSeasonId, playersByTeamSeason)
    .filter((r) => r.block === null)
    .map((r) => r.player);
}

/**
 * Is there ANYBODY here you could sign? The only thing drawable() needs to know,
 * and it used to ask by building the whole board and measuring it.
 *
 * That was free when affordability was one subtraction. It is not now: the check
 * simulates the signing, and drawable() runs it for every man of every
 * team-season in the pool on every spin. Stopping at the first man who passes
 * turns 861 full boards into 861 single tests, because indexData sorts each
 * team-season cheapest first and the cheapest man is the one most likely to fit.
 */
function someAffordable(run, teamSeasonId, playersByTeamSeason) {
  const list = playersByTeamSeason[teamSeasonId];
  if (!list) return false;
  for (const p of list) if (blockFor(run, p, teamSeasonId) === null) return true;
  return false;
}

/**
 * What signing this player would do to your chemistry, right now.
 *
 * Used to show the effect on every option BEFORE you commit, which is the whole
 * point of chemistry: it should pull you toward a cheaper signing you can see the
 * reason for, not reward you after the fact.
 */
function previewSigning(run, player, ctx) {
  const before = E.resolveChemistry(run.roster, ctx, chemOpts(run));
  const after = E.resolveChemistry(run.roster.concat([player]), ctx, chemOpts(run));
  const seen = new Set(before.links.map((l) => l.a + '|' + l.b + '|' + l.type));
  return {
    multiplier: after.multiplier,
    delta: after.multiplier - before.multiplier,
    newLinks: after.links.filter((l) => !seen.has(l.a + '|' + l.b + '|' + l.type)),
  };
}

function createRun(opts) {
  /* ONE FRANCHISE MODE IS ONE FIELD.
     A club code here locks every wheel in the draft to that club, so only the year moves
     and the run is an attempt at the best team that club could ever have fielded. Null is
     free play, where the wheel can land anywhere in the pool.

     Validated here rather than trusted, because everything downstream filters on it: an
     unknown code would silently empty the pool and the draft would open on "nothing left
     you can afford", which reads as a broken game rather than a bad argument. */
  const franchise = opts.franchise ?? null;
  if (franchise !== null && !E.TEAM_COLORS[franchise]) {
    throw new Error(`unknown franchise ${franchise}`);
  }
  const era = opts.era ?? null;
  if (era !== null && !E.ERAS[era]) {
    throw new Error(`unknown era ${era}`);
  }
  const seed = opts.seed ?? E.hashSeed(String(Math.random()));
  return {
    version: 1,
    franchise,
    era,
    seed,
    rngCalls: 0,
    phase: PHASES.DRAFT,
    roster: [],
    // Which slot each signed player fills, as an index into E.SLOTS. Kept
    // alongside roster rather than making roster sparse, so chemistry and cap
    // maths can keep treating roster as a dense list of who you have.
    slotIndex: [],
    // Player ids, not player-seasons: one man, one spot on the roster.
    usedPlayers: [],
    usedTeamSeasons: [],
    draws: [],
    respinsUsed: 0,
    freeRerolls: 0,
    currentDraw: null,
    schedule: null,
    playoffs: null,
    season: null,
    playoffSeed: null,
    outcome: null,
  };
}

/*
 * The RNG is rebuilt from (seed, rngCalls) on every use and the call count is
 * persisted, so a run reloaded from storage resumes the exact same stream. A
 * live closure would desynchronize the moment someone refreshed mid-draft.
 */
function rngFor(run) {
  const rng = E.createSeededRNG(run.seed);
  for (let i = 0; i < run.rngCalls; i++) rng();
  return () => { run.rngCalls++; return rng(); };
}

/*
 * SPOTS ARE NOT LOCKED TO A SPIN ANY MORE.
 *
 * The GDD locked the slot before each spin (§2), reasoning that positional need
 * should not be random. The cost turned out to be that most spins were not a
 * decision at all. Measured over all 861 team-seasons:
 *
 *   spot   mean options   median   exactly 1
 *   QB          1.1          1        86%
 *   TE          2.2          2        14%
 *   RB          3.0          3         2%
 *   WR          4.6          5         0%
 *   FLEX        9.8         10         0%
 *
 * A team carries one starting quarterback, so a slot-locked QB spin can never be
 * a choice. FLEX already proved the fix: because it accepts three positions it
 * averages nearly ten options. So every spin now offers the whole roster and you
 * choose which empty spot to fill, which turns a one-option QB spin into a
 * decision between about eleven players (the median team-season has 11 eligible
 * skill players).
 *
 * The GDD's "unlucky, not unfair" concern still holds, and holds better: you can
 * always fill something, so a bad draw costs you value rather than stranding you.
 */

/** Slot indexes still empty, in E.SLOTS order. */
function openSlots(run) {
  const taken = new Set(run.slotIndex);
  return E.SLOTS.map((_, i) => i).filter((i) => !taken.has(i));
}

/** Which empty slot this player would fill, or null if none can take him. */
function slotForPlayer(run, player) {
  const open = openSlots(run);
  // Prefer a dedicated slot for his own position before spending FLEX on him.
  const dedicated = open.find((i) => E.SLOTS[i] === player.position);
  if (dedicated !== undefined) return dedicated;
  const flex = open.find((i) => E.SLOT_ELIGIBILITY[E.SLOTS[i]].includes(player.position));
  return flex === undefined ? null : flex;
}

/** Names of the spots still to fill, for display. */
function openSlotNames(run) {
  return openSlots(run).map((i) => E.SLOTS[i]);
}

/*
 * THE WHEEL IS RANDOM. THERE IS NO BIAS.
 *
 * There was one, and taking it out is the point of this comment. `CONNECTION_BIAS`
 * made about three spins in ten draw from a pool restricted to team-seasons
 * connected to somebody already signed, so that chemistry would build rather than
 * be lucked into. It was added because chemistry as specified could barely happen:
 * six uniform draws out of 861 team-seasons rarely share a franchise, a college or
 * a draft class, and the two biggest links in §6, Battery and Teammates, both need
 * two players off the SAME team-season.
 *
 * It was reported as the wheel forcing the same team back, and measuring it proved
 * the report right by a wide margin. Over 600 drafts:
 *
 *                                        with the bias    without
 *   the same franchise came up twice         87.7%          38.2%
 *   the same team-season came up twice       65.8%           1.8%
 *   most spins one franchise took             6 of 6         4 of 6
 *
 * A wheel that hands you the same franchise in seven runs out of eight is not a
 * wheel, whatever the tuning constant says. 0.3 per spin sounds mild and is not,
 * for two reasons that compound: every signing widens the connected set, so later
 * spins have far more to hit, and the tier walk below never actually declined a
 * tier, so once the bias fired the pool was always restricted.
 *
 * The cost is real and is accepted: average chemistry falls from +6.3% to +2.1%,
 * about a third of runs now finish with none at all, and Battery and Teammates go
 * back to being something you see a couple of times in a hundred runs. Chemistry is
 * a bonus you notice, not a subsidy every roster collects. That makes the game
 * harder, which is the direction it is meant to go.
 *
 * MAX_DRAWS_PER_TEAM_SEASON stays at 2, and deliberately. A genuinely random wheel
 * can repeat, and 1.8% of runs is what that looks like. Forbidding a repeat would
 * make each draw depend on the ones before it, which is less random rather than
 * more, and it is the same class of hidden rule that was just removed.
 */
const TUNING = {
  MAX_DRAWS_PER_TEAM_SEASON: 2,
};

/**
 * Draw a team-season for the current slot.
 *
 * Two filters stop dead ends, and both are required: the team-season must have
 * an eligible player at THIS slot (13 team-seasons in the pool have a slot
 * nobody qualifies for), and it must have one you can currently afford. If not,
 * the draw is free and re-rolls automatically, and the burned team-season is not
 * counted against its draw limit. A free re-roll should not quietly shrink the
 * pool you can still see.
 */
/**
 * Everything the wheels could legally land on right now.
 *
 * Split out of spin() because the two re-spin kinds have to ask the same question
 * before they are offered: a team re-spin is only worth $5M if there IS another
 * team in that year you could use.
 */
function drawable(run, data, limit) {
  const drawn = {};
  for (const id of run.usedTeamSeasons) drawn[id] = (drawn[id] || 0) + 1;
  const canFill = (t) => someAffordable(run, t.team_season_id, data.playersByTeamSeason);
  return data.teamSeasons
    /* ONE FRANCHISE MODE, in one line. The lock lives here rather than in spin() so that
       every other question about the pool answers correctly on its own: canRespin asks
       drawable() what is left, and with the filter here a "new team, same year" re-spin
       reports that there is no other team rather than being separately forbidden. One
       club has twenty-four to twenty-seven seasons in the pool and a draft draws six with
       a limit of two each, so the lock can never run the pool dry. */
    .filter((t) => !run.franchise || t.franchise === run.franchise)
    .filter((t) => { if (!run.era) return true; const r = E.ERAS[run.era]; return t.season >= r[0] && t.season <= r[1]; })
    .filter((t) => (drawn[t.team_season_id] || 0) < (limit ?? TUNING.MAX_DRAWS_PER_TEAM_SEASON))
    .filter(canFill);
}

/*
 * `constraint` is how a re-spin re-rolls one wheel and not the other:
 *   {season: 2014}     keep the year, land on a different team in it
 *   {notSeason: 2014}  land on a different year, then any team in it
 * plus `avoid`, the team-season you just paid to get away from. That one matters:
 * a team-season may be drawn twice in a run, so without it a $5M re-spin could
 * hand the same team straight back, which happened 132 times in 3,000 test runs.
 * Omitted for a normal spin.
 */
function spin(run, data, constraint) {
  if (run.phase !== PHASES.DRAFT) throw new Error('not drafting');
  /* Attached on the first spin rather than at createRun(), which does not get the data.
     Before this point reserveFloor() has nothing to read and falls back to the flat
     constant, which is only ever the opening paint of an empty roster. */
  run.floorLists ??= (data.cheapBy && (data.cheapBy[run.franchise || '*'] || null));
  const rng = rngFor(run);

  let available = drawable(run, data);
  if (constraint) {
    const narrowed = available.filter((t) => t.team_season_id !== constraint.avoid
      && (constraint.franchise == null || t.franchise === constraint.franchise)
      && (constraint.season != null
        ? t.season === constraint.season
        : t.season !== constraint.notSeason));
    // Only honored when it leaves something. canRespin checks this first, so
    // falling back here is a backstop rather than an outcome anyone should see.
    if (narrowed.length) available = narrowed;
  }
  if (!available.length) throw new Error('nothing left you can afford');

  /*
   * ONE DRAW, uniform over everything you could have landed on.
   *
   * The wheels still reveal in two beats, year and then team, but the year is read
   * back off the team-season rather than chosen first. Choosing the year first made
   * each year equally likely and then split that evenly among the teams in it, so a
   * team-season in a thin year was likelier than one in a full year. Measured, that
   * skew is small: 1.03x between the luckiest and unluckiest team-season on the first
   * spin and 1.07x on a late one, because every year holds 30 to 32 teams and the
   * affordability filter almost never empties one. Nobody would have felt it. It is
   * fixed because a wheel that is supposed to be random costs nothing to make
   * exactly random, and because leaving a known lean in place is how the last one
   * grew.
   *
   * Both wheels stay honest either way: every face on either of them is a result
   * that was really reachable.
   */
  const pool = available;
  const t = pool[Math.floor(rng() * pool.length)];
  const season = t.season;
  const years = [...new Set(pool.map((x) => x.season))].sort((a, b) => a - b);
  const inYear = pool.filter((x) => x.season === season);

  const board = boardFrom(run, t.team_season_id, data.playersByTeamSeason);
  run.currentDraw = {
    season,
    team_season_id: t.team_season_id,
    franchise: t.franchise,
    display: t.display,
    teamName: t.display.replace(/^\d{4}\s+/, ''),
    yearOptions: years,
    teamOptions: inYear.map((x) => x.display.replace(/^\d{4}\s+/, '')),
    // The full squad for display, and the signable subset for validation. Two
    // fields on purpose: the board is what you look at, options is what the
    // game will actually let you do, and sign() only trusts the second one.
    board: board.map((r) => ({ key: pkey(r.player), block: r.block })),
    options: board.filter((r) => r.block === null).map((r) => pkey(r.player)),
  };
  return run.currentDraw;
}

/**
 * Pay the fee and re-roll ONE wheel.
 *
 * `kind` is 'team' to keep the year and land on a different team in it, or 'year'
 * to move to a different year and take whatever team comes up there. Both cost
 * the same, which is the point: you pick the wheel by what you want to change,
 * not by what is cheaper.
 */
function respin(run, data, kind) {
  const which = kind === 'year' ? 'year' : 'team';
  const check = canRespin(run, which, data);
  if (!check.ok) throw new Error(`cannot re-spin: ${check.reason}`);
  const draw = run.currentDraw;
  run.respinsUsed++;
  // The drawn team-season is consumed, you saw it and rejected it.
  if (draw) run.usedTeamSeasons.push(draw.team_season_id);
  run.currentDraw = null;
  /* EACH WHEEL HOLDS THE OTHER ONE STILL.
     "New team" keeps the year and draws a different club in it, which it always did.
     "New year" is supposed to keep the CLUB and draw a different season of it, and it did not:
     it only forbade the same season, so it re-rolled the team as well and the year wheel was
     the only one you could see moving. Both constraints now name what is held. */
  const constraint = !draw ? null
    : (which === 'team'
      ? { season: draw.season, avoid: draw.team_season_id }
      : { franchise: draw.franchise, notSeason: draw.season, avoid: draw.team_season_id });
  return spin(run, data, constraint);
}

function sign(run, player) {
  if (run.phase !== PHASES.DRAFT) throw new Error('not drafting');
  if (!run.currentDraw) throw new Error('nothing drawn');
  if (!run.currentDraw.options.includes(pkey(player))) throw new Error('player not on this team');
  /* The same predicate the board uses, so a tile you can see is a tile you can take. */
  if (!canFinishAfter(run, player, run.currentDraw.team_season_id)) throw new Error('cannot afford');
  const slot = slotForPlayer(run, player);
  if (slot === null) throw new Error('no empty spot for a ' + player.position);

  run.roster.push(player);
  run.slotIndex.push(slot);
  run.usedPlayers.push(player.player_id);
  run.usedTeamSeasons.push(run.currentDraw.team_season_id);
  // Which team-season filled which spot. Needed for the post-run reveal, which
  // can only consider the team-seasons the wheel actually gave you.
  run.draws.push({ slot: E.SLOTS[slot], team_season_id: run.currentDraw.team_season_id });
  run.currentDraw = null;

  if (run.roster.length === E.SLOTS.length) run.phase = PHASES.SEASON;
  return run;
}

/** Build the schedule. Deliberately after the draft, per §7. */
function startSeason(run, data, ctx) {
  if (run.phase !== PHASES.SEASON) throw new Error('draft not finished');
  const rng = rngFor(run);
  const chem = E.resolveChemistry(run.roster, ctx, chemOpts(run));
  const schedOpts = {};
  if (run.franchise) schedOpts.franchise = run.franchise;
  if (run.era) schedOpts.era = run.era;
  const sched = E.generateSchedule(data.prepared, rng, schedOpts);
  run.schedule = sched.games.map((g) => g.team_season_id);
  const poOpts = run.era ? { era: run.era } : {};
  run.playoffs = E.generatePlayoffs(data.prepared, rng, poOpts).map((g) => g.team_season_id);
  run.season = {
    chemistry: chem.multiplier,
    chemistryLinks: chem.links,
    week: 0,
    playoffRound: 0,
    wins: 0,
    losses: 0,
    regularWins: null,
    regularLosses: null,
    results: [],
  };
  return run;
}

/**
 * Play the next game and return its result.
 *
 * Covers the regular season and the playoffs. All 17 regular-season games are
 * always played, so a record always exists; between the two the run pauses on
 * SEEDING so the player can see where their record left them before anything
 * else happens.
 *
 * `displayCal` is optional; with it, each result also carries a football-looking
 * scoreline. The internal fantasy-space numbers stay on the result so the sim
 * remains auditable. The transform is presentation only and decides nothing.
 */
function advanceWeek(run, data, leagueContext, displayCal) {
  const s = run.season;
  if (run.phase !== PHASES.SEASON && run.phase !== PHASES.PLAYOFFS) {
    throw new Error('no game to play in phase ' + run.phase);
  }

  const playoff = run.phase === PHASES.PLAYOFFS;
  /* End-aligned, via the engine's own helper. Indexing this list from the front would let a
     first-round bye skip the Super Bowl opponent, which is backwards. */
  const oppId = playoff
    ? E.playoffOpponent(run.playoffs, run.playoffSeed.rounds, s.playoffRound)
    : run.schedule[s.week];
  const opp = data.byTeamSeasonId[oppId];
  const rng = rngFor(run);
  const isFinal = playoff && s.playoffRound === run.playoffSeed.rounds - 1;
  const advantage = playoff && !isFinal
    ? 1 + (E.CONSTANTS.PLAYOFF_HOME_FIELD || 0)
      * Math.max(0, s.regularWins - E.CONSTANTS.PLAYOFF_WINS)
      / (E.CONSTANTS.REGULAR_SEASON_GAMES - E.CONSTANTS.PLAYOFF_WINS)
    : 1;
  const r = E.resolveGame(run.roster, s.chemistry, opp, leagueContext[opp.season] ?? 21.5, rng, E.CONSTANTS, advantage);
  const shown = displayCal ? E.toFootballScore(r.yourScore, r.oppScore, r.won, rng, displayCal) : null;

  const roundName = playoff ? run.playoffSeed.roundNames[s.playoffRound] : null;
  if (r.won) s.wins++; else s.losses++;
  const result = {
    week: playoff ? null : s.week + 1,
    round: roundName,
    playoff,
    opponent: opp.display,
    opponent_id: oppId,
    won: r.won,
    yourScore: Math.round(r.yourScore * 10) / 10,
    oppScore: Math.round(r.oppScore * 10) / 10,
    shownYou: shown ? shown.you : null,
    shownThem: shown ? shown.them : null,
  };
  s.results.push(result);

  if (playoff) {
    s.playoffRound++;
    if (!r.won) {
      finish(run, { eliminatedIn: roundName });
    } else if (s.playoffRound >= run.playoffSeed.rounds) {
      finish(run, { titleWon: true });
    }
  } else {
    s.week++;
    if (s.week >= run.schedule.length) {
      // Record is final. Work out the seed and pause so it can be shown.
      const seed = E.seedFromRecord(s.wins);
      run.playoffSeed = {
        ...seed,
        roundNames: seed.made ? E.playoffRoundNames(seed.rounds) : [],
        regularRecord: s.wins + '-' + s.losses,
      };
      s.regularWins = s.wins;
      s.regularLosses = s.losses;
      run.phase = PHASES.SEEDING;
      if (!seed.made) finish(run, { missedPlayoffs: true });
    }
  }
  return result;
}

/** Leave SEEDING and start the playoffs. */
function startPlayoffs(run) {
  if (run.phase !== PHASES.SEEDING) throw new Error('not at seeding');
  if (!run.playoffSeed.made) throw new Error('did not make the playoffs');
  run.season.playoffRound = 0;
  run.phase = PHASES.PLAYOFFS;
  return run;
}

function finish(run, how) {
  const s = run.season;
  run.phase = PHASES.OVER;
  run.outcome = {
    record: s.wins + '-' + s.losses,
    regularRecord: (s.regularWins ?? s.wins) + '-' + (s.regularLosses ?? s.losses),
    regularWins: s.regularWins ?? s.wins,
    wins: s.wins,
    losses: s.losses,
    madePlayoffs: !!run.playoffSeed && run.playoffSeed.made,
    seedLabel: run.playoffSeed ? run.playoffSeed.label : 'Missed the playoffs',
    titleWon: !!how.titleWon,
    eliminatedIn: how.eliminatedIn || null,
    missedPlayoffs: !!how.missedPlayoffs,
    undefeatedRegular: (s.regularLosses ?? s.losses) === 0,
    perfect: !!how.titleWon && s.losses === 0,
  };
  return run;
}

/** Index the data once; every function above takes this. */
function indexData(players, teamSeasons) {
  const playersByTeamSeason = {};
  for (const p of players) {
    if (!p.team_season_id) continue;
    (playersByTeamSeason[p.team_season_id] ??= []).push(p);
  }
  /* Cheapest first, which someAffordable() relies on to stop at the first man and
     which costs boardFrom() nothing: it sorts by points itself before drawing. */
  for (const list of Object.values(playersByTeamSeason)) {
    list.sort((a, b) => a.price_musd - b.price_musd);
  }
  const byTeamSeasonId = {};
  for (const t of teamSeasons) byTeamSeasonId[t.team_season_id] = t;
  /* The 1972 Dolphins are not in the data files, because the dataset starts in 1999. They
     are the Super Bowl opponent, so the lookup every screen uses has to resolve them or the
     final would render with a blank opponent name. */
  for (const t of E.LEGEND_TEAM_SEASONS) byTeamSeasonId[t.team_season_id] ??= t;

  /* The three reverse indexes that used to live here, team-seasons by franchise, by
     college and by draft class, existed only to find a team connected to somebody
     already signed. Nothing biases the wheel now, so nothing reads them. */

  /* THE CHEAPEST MEN AT EACH POSITION, per club and for the pool as a whole. This is
     what reserveFloor() reads, and the reason it is built here is that it is the same
     answer on every call and the pool never changes inside a run.

     FLOOR_DEPTH has to clear more than the twelve men a draft can consume: entries are
     also skipped when their team-season has had its two draws, and one exhausted season
     can take several cheap men out of a list at once. Forty-eight is the whole cheap end
     of every position for every club, and the table is still only a few thousand
     numbers. */
  const FLOOR_DEPTH = 48;
  const cheapBy = {};
  const add = (key, p) => {
    const at = ((cheapBy[key] ??= {})[p.position] ??= []);
    at.push({ id: p.player_id, price: p.price_musd, ts: p.team_season_id });
  };
  for (const p of players) {
    if (!p.position) continue;
    add('*', p);
    if (p.franchise) add(p.franchise, p);
  }
  for (const lists of Object.values(cheapBy)) {
    for (const pos of Object.keys(lists)) {
      lists[pos].sort((a, b) => a.price - b.price);
      lists[pos] = lists[pos].slice(0, FLOOR_DEPTH);
    }
  }

  return {
    players, teamSeasons, playersByTeamSeason, byTeamSeasonId, cheapBy,
    prepared: E.prepareData(teamSeasons),
  };
}

/**
 * The strongest team your six spins could have produced.
 *
 * This is a joint optimization, not six independent comparisons, because the two
 * things that make a draft hard are both cumulative: money spent early is gone
 * later, and the spot a player fills closes that spot for everyone after him. So
 * it solves over (draw, spot, money) together with a DP across all 64 spot
 * combinations, which means it can tell you to take the quarterback off a team you
 * took a receiver from, and re-spend the difference somewhere else.
 *
 * Then a hill climb re-checks it with chemistry included, since chemistry depends
 * on the whole roster at once and cannot be folded into the DP.
 *
 * The honest limit: it holds your six drawn TEAMS fixed. It cannot know what the
 * wheel would have shown after a different pick, because the wheel reacts to who
 * you have already signed. The UI says so rather than implying otherwise.
 */
function bestPossibleSquad(run, data, ctx) {
  const BUCKET = 0.5;
  const budget = E.CONSTANTS.CAP_MUSD - E.respinFees(run.respinsUsed);
  const NB = Math.round(budget / BUCKET) + 1;
  const nSlots = E.SLOTS.length;
  const FULL = (1 << nSlots) - 1;

  // Everyone available from each drawn team, at any position.
  const pool = run.draws.map((d) => (data.playersByTeamSeason[d.team_season_id] ?? []));
  if (pool.some((list) => !list.length)) return null;

  const fits = (p, slot) => E.SLOT_ELIGIBILITY[E.SLOTS[slot]].includes(p.position);
  const popcount = (m) => { let c = 0; while (m) { c += m & 1; m >>= 1; } return c; };

  const NEG = -1e9;
  const masksByCount = Array.from({ length: nSlots + 1 }, () => []);
  for (let m = 0; m <= FULL; m++) masksByCount[popcount(m)].push(m);

  /*
   * dp[mask][b] = best raw points using the first popcount(mask) draws to fill
   * exactly the spots in mask, having spent b buckets. `banned` holds, per draw,
   * the player ids that draw may not use.
   */
  function solve(banned) {
    const lists = pool.map((list, i) => (banned[i].size
      ? list.filter((p) => !banned[i].has(p.player_id)) : list));
    if (lists.some((list) => !list.length)) return null;
    const dp = new Float64Array((FULL + 1) * NB).fill(NEG);
    const from = new Int32Array((FULL + 1) * NB).fill(-1);   // packed: player*8 + slot
    dp[0] = 0;

    for (let i = 0; i < nSlots; i++) {
      for (const mask of masksByCount[i]) {
        const base = mask * NB;
        for (let b = 0; b < NB; b++) {
          const cur = dp[base + b];
          if (cur <= NEG) continue;
          const list = lists[i];
          for (let pi = 0; pi < list.length; pi++) {
            const p = list[pi];
            const cost = Math.ceil(p.price_musd / BUCKET);
            const nb = b + cost;
            if (nb >= NB) continue;
            for (let s = 0; s < nSlots; s++) {
              if (mask & (1 << s)) continue;
              if (!fits(p, s)) continue;
              const nm = mask | (1 << s);
              const idx = nm * NB + nb;
              const val = cur + p.ppr_ppg_mean;
              if (val > dp[idx]) { dp[idx] = val; from[idx] = pi * 8 + s; }
            }
          }
        }
      }
    }

    let bestB = -1, bestVal = NEG;
    for (let b = 0; b < NB; b++) {
      const v = dp[FULL * NB + b];
      if (v > bestVal) { bestVal = v; bestB = b; }
    }
    if (bestB < 0) return null;

    // Walk back to recover which draw took which player into which spot.
    const bySlot = new Array(nSlots).fill(null);
    const drawOfSlot = new Array(nSlots).fill(-1);
    let mask = FULL, b = bestB;
    for (let i = nSlots - 1; i >= 0; i--) {
      const packed = from[mask * NB + b];
      if (packed < 0) return null;
      const pi = Math.floor(packed / 8), s = packed % 8;
      const p = lists[i][pi];
      bySlot[s] = p;
      drawOfSlot[s] = i;
      mask &= ~(1 << s);
      b -= Math.ceil(p.price_musd / BUCKET);
    }
    return { bySlot, drawOfSlot, value: bestVal };
  }

  /*
   * One man, one spot, same rule the draft itself enforces.
   *
   * The DP state cannot express it: it remembers how many spots are filled and
   * how much is spent, never WHO it took, so the same player can come back off
   * two different drawn teams. Widening the state to carry identity would blow
   * it up. Instead, when the optimum repeats somebody, re-solve twice with him
   * banned from one team or the other and keep the better answer. That is exact,
   * and it almost never recurses, because two of your drawn teams sharing a man
   * is rare and needs three of them to share him before it goes a level deeper.
   */
  const MAX_BANS = 8;
  function withoutRepeats(banned, depth) {
    const sol = solve(banned);
    if (!sol) return null;
    for (let a = 0; a < nSlots; a++) {
      for (let c = a + 1; c < nSlots; c++) {
        if (sol.bySlot[a].player_id !== sol.bySlot[c].player_id) continue;
        if (depth >= MAX_BANS) return null;
        const id = sol.bySlot[a].player_id;
        const branches = [sol.drawOfSlot[a], sol.drawOfSlot[c]]
          .map((di) => withoutRepeats(
            banned.map((set, i) => (i === di ? new Set(set).add(id) : set)), depth + 1))
          .filter(Boolean);
        if (!branches.length) return null;
        return branches.reduce((x, y) => (y.value > x.value ? y : x));
      }
    }
    return sol;
  }

  const sol = withoutRepeats(pool.map(() => new Set()), 0);
  if (!sol) return null;
  const { bySlot, drawOfSlot } = sol;

  // Hill climb with chemistry in the objective. Same-spot substitutions from the
  // same drawn team, keeping the total inside the cap.
  /*
   * The objective has to be the SAME thing the season rewards, or "best" is a
   * lie. Points and chemistry alone left roster shape out, and shape is a real
   * multiplier in resolveGame, so the optimizer could hand back a lineup that
   * genuinely wins fewer games than the one you drafted: on one test run the
   * comparison read YOURS 15-2, BEST 14-3, which is nonsense on its face.
   *
   * The DP above still maximizes raw points, since its state cannot express
   * either multiplier. This is where both get folded back in.
   */
  const score = (arr) => {
    const spend = arr.reduce((t, p) => t + p.price_musd, 0);
    if (spend > budget + 1e-9) return -1;
    return arr.reduce((t, p) => t + p.ppr_ppg_mean, 0)
      * E.resolveChemistry(arr, ctx, chemOpts(run)).multiplier
      * E.rosterStructure(arr).multiplier;
  };
  const climb = (start, ofSlot) => {
    let cur = start.slice(), curScore = score(cur);
    for (let pass = 0; pass < 3; pass++) {
      let improved = false;
      for (let s = 0; s < nSlots; s++) {
        for (const cand of pool[ofSlot[s]]) {
          if (!fits(cand, s)) continue;
          if (cur.some((p, j) => j !== s && p.player_id === cand.player_id)) continue;
          const trial = cur.slice();
          trial[s] = cand;
          const sc = score(trial);
          if (sc > curScore + 1e-9) { cur = trial; curScore = sc; improved = true; }
        }
      }
      if (!improved) break;
    }
    return { arr: cur, score: curScore };
  };

  const yourBySlot = new Array(nSlots).fill(null);
  const yourOfSlot = new Array(nSlots).fill(-1);
  run.roster.forEach((p, i) => { yourBySlot[run.slotIndex[i]] = p; yourOfSlot[run.slotIndex[i]] = i; });

  /*
   * Climb from the DP optimum AND from the lineup you actually drafted, then keep
   * whichever ends higher. A hill climb only swaps within a spot, so from the DP
   * start it can settle in a local optimum that your own lineup beats once shape
   * is in the objective. Without this second start, "the best you could have
   * done" was occasionally worse than what you did.
   */
  const runs = [climb(bySlot, drawOfSlot)];
  if (run.roster.length === nSlots) runs.push(climb(yourBySlot, yourOfSlot));
  const won = runs.reduce((a, b) => (b.score > a.score ? b : a));
  const best = won.arr, bestScore = won.score;

  const chem = E.resolveChemistry(best, ctx, chemOpts(run));
  const yourPts = run.roster.reduce((t, p) => t + p.ppr_ppg_mean, 0);

  return {
    squad: best,
    bySlot: best,
    chemistry: chem.multiplier,
    chemistryLinks: chem.links,
    spend: best.reduce((t, p) => t + p.price_musd, 0),
    yourSpend: run.roster.reduce((t, p) => t + p.price_musd, 0),
    yourChemistry: run.season.chemistry,
    yourStructure: E.rosterStructure(run.roster).multiplier,
    bestStructure: E.rosterStructure(best).multiplier,
    // Both sides measured the same way, so the ratio between them is the honest
    // answer to "how close was I", and cannot come out above 100%.
    yourProjected: yourPts * run.season.chemistry * E.rosterStructure(run.roster).multiplier,
    bestProjected: bestScore,
    /* One row per spot, so it always says who replaces whom. */
    lineup: E.SLOTS.map((slot, s) => {
      const had = yourBySlot[s], could = best[s];
      const same = had && could && had.player_id === could.player_id && had.season === could.season;
      return {
        slot,
        had,
        could,
        same,
        delta: had && could ? could.ppr_ppg_mean - had.ppr_ppg_mean : 0,
      };
    }),
  };
}

/**
 * What a given roster would typically do over THIS run's schedule.
 *
 * A single replay would be worse than useless here: one season is mostly noise, so
 * a strong team can miss the playoffs and a weak one can luck into a title. Both
 * teams are therefore run many times over the same 17 opponents, and what comes
 * back is the distribution: the record you would usually post, and how often the
 * season ends each way.
 *
 * The RNG is seeded from the run so the numbers are stable if you reload the
 * results page, and separately from the season you actually played so this does
 * not just re-report the same luck.
 */
function projectSeason(roster, chemistry, run, data, leagueContext, trials = 400) {
  const schedule = run.schedule.map((id) => data.byTeamSeasonId[id]);
  const playoffs = run.playoffs.map((id) => data.byTeamSeasonId[id]);
  const wins = [];
  let madePlayoffs = 0, titles = 0, perfect = 0, bye = 0;

  for (let i = 0; i < trials; i++) {
    const rng = E.createSeededRNG(E.hashSeed(`project|${run.seed}|${i}`));
    const out = E.playRun(roster, chemistry, schedule, playoffs, leagueContext, rng);
    wins.push(out.regularWins);
    if (out.seed.made) madePlayoffs++;
    if (out.seed.bye) bye++;
    if (out.titleWon) titles++;
    if (out.perfect) perfect++;
  }
  wins.sort((a, b) => a - b);
  const games = E.CONSTANTS.REGULAR_SEASON_GAMES;
  const mid = wins[Math.floor(trials / 2)];
  return {
    typicalWins: mid,
    typicalRecord: `${mid}-${games - mid}`,
    meanWins: wins.reduce((a, b) => a + b, 0) / trials,
    bestWins: wins[trials - 1],
    worstWins: wins[0],
    playoffRate: madePlayoffs / trials,
    byeRate: bye / trials,
    titleRate: titles / trials,
    perfectRate: perfect / trials,
  };
}

/*
 * Bumped whenever index.html starts relying on something new here. The page
 * checks it at boot and reloads itself once if the numbers disagree.
 *
 * This is not hypothetical. The script tags carried ?v=2 for weeks while this
 * file kept changing, so iOS Safari served a months-old run.js against a current
 * index.html. The draw had no `board` on it, the draft screen threw
 * "draw.board is not iterable" after the wheels landed, and the game sat there
 * with no players and no way forward.
 */
const RUN_API_VERSION = 34;

const api = {
  API_VERSION: RUN_API_VERSION,
  PHASES, createRun, spin, respin, sign,
  startSeason, advanceWeek, startPlayoffs, indexData, bestPossibleSquad, projectSeason,
  previewSigning,
  remaining, reserveFloor, spendable, canRespin, slotsLeft, affordableFrom,
  boardFrom, blockFor, BLOCK, drawable,
  openSlots, openSlotNames, slotForPlayer, TUNING,
};

if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') window.PS_RUN = api;
