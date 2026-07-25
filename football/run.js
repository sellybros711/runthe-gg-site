/* The Perfect Season, draft loop and run state.
 *
 * Headless and dependency-free. Browser: window.PS_RUN. Node: require.
 *
 * The run state is deliberately a plain serializable object with the seed inside
 * it, so daily mode is a config flag rather than a rewrite: pass
 * `{ daily: 'YYYY-MM-DD' }` and every player that day gets the same franchise,
 * the same six wheel results and the same schedule. That was §7's ask and §10's
 * open item.
 */

'use strict';

const E = (typeof require !== 'undefined')
  ? require('./engine.js')
  : window.PS_ENGINE;

const PHASES = {
  PICK_FRANCHISE: 'pick_franchise',
  DRAFT: 'draft',
  SEASON: 'season',      // the 17 regular-season games
  SEEDING: 'seeding',    // record is final, showing where it left you
  PLAYOFFS: 'playoffs',  // one loss ends it
  OVER: 'over',
};

const pkey = (p) => `${p.player_id}|${p.season}`;

/**
 * Money still available. The re-spin fee comes out of the cap, so the budget
 * shrinks as you fish for a better team-season, a re-spin costs you a tier of
 * player somewhere else, which is the point.
 */
function remaining(run) {
  const spent = run.roster.reduce((s, p) => s + p.price_musd, 0);
  const fees = E.respinFees(run.respinsUsed);
  return E.CONSTANTS.CAP_MUSD - spent - fees;
}

/** Slots still to fill, including the current one. */
const slotsLeft = (run) => E.SLOTS.length - run.roster.length;

/**
 * The floor the UI warns about: you must keep at least $3M per slot you have
 * not filled yet, or you cannot legally finish the draft.
 *
 * §5 wants this as a passive warning on signings, bankrupting yourself into
 * five minimum-salary scrubs is a lesson the game is allowed to teach. It is a
 * hard block on RE-SPINS only, because a re-spin that makes the draft
 * unfinishable is not a lesson, it is a dead end.
 */
function reserveFloor(run) {
  return Math.max(0, slotsLeft(run) - 1) * E.CONSTANTS.MIN_RESERVE_PER_SLOT_MUSD;
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
  const after = remaining(run) - cost;
  // Must still be able to fill every remaining slot at the minimum price.
  if (after < slotsLeft(run) * E.CONSTANTS.MIN_RESERVE_PER_SLOT_MUSD) {
    return { ok: false, reason: 'would leave too little to fill your roster', cost };
  }
  const draw = run.currentDraw;
  if (kind && draw && data) {
    /*
     * Judged with the fee ALREADY PAID. Charging $5M can push team-seasons out of
     * reach, so a check run against the pre-fee budget can approve a re-spin whose
     * constraint is then impossible to honor, and the wheel moves the wrong one.
     * Measured at 2 in 3,000 runs before this, which is rare and still wrong.
     *
     * The counter is bumped and restored rather than threaded through
     * drawable -> affordableFrom -> blockFor -> remaining, which all read it.
     */
    run.respinsUsed++;
    let rest;
    try {
      // The team you are looking at is spent either way, so ask what is left after it.
      rest = drawable(run, data).filter((t) => t.team_season_id !== draw.team_season_id);
    } finally {
      run.respinsUsed--;
    }
    const ok = kind === 'team'
      ? rest.some((t) => t.season === draw.season)
      : rest.some((t) => t.season !== draw.season);
    if (!ok) {
      return {
        ok: false,
        cost,
        reason: kind === 'team'
          ? `no other ${draw.season} team you could use`
          : 'no other year you could use',
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
function blockFor(run, player) {
  if (run.usedPlayers.includes(player.player_id)) return BLOCK.DRAFTED;
  if (slotForPlayer(run, player) === null) return BLOCK.NO_SPOT;
  if (player.price_musd > remaining(run) - reserveFloor(run)) return BLOCK.PRICE;
  return null;
}

/** Every player on a team-season, best first, each with the reason he is out. */
function boardFrom(run, teamSeasonId, playersByTeamSeason) {
  return (playersByTeamSeason[teamSeasonId] ?? [])
    .map((p) => ({ player: p, block: blockFor(run, p) }))
    .sort((a, b) => b.player.ppr_ppg_mean - a.player.ppr_ppg_mean);
}

/** Just the ones you could sign right now. */
function affordableFrom(run, teamSeasonId, playersByTeamSeason) {
  return boardFrom(run, teamSeasonId, playersByTeamSeason)
    .filter((r) => r.block === null)
    .map((r) => r.player);
}

/**
 * What signing this player would do to your chemistry, right now.
 *
 * Used to show the effect on every option BEFORE you commit, which is the whole
 * point of chemistry: it should pull you toward a cheaper signing you can see the
 * reason for, not reward you after the fact.
 */
function previewSigning(run, player, ctx) {
  const before = E.resolveChemistry(run.roster, ctx);
  const after = E.resolveChemistry(run.roster.concat([player]), ctx);
  const seen = new Set(before.links.map((l) => l.a + '|' + l.b + '|' + l.type));
  return {
    multiplier: after.multiplier,
    delta: after.multiplier - before.multiplier,
    newLinks: after.links.filter((l) => !seen.has(l.a + '|' + l.b + '|' + l.type)),
  };
}

function createRun(opts) {
  const daily = opts.daily ?? null;
  const seed = daily ? E.hashSeed(`perfect-season|${daily}`) : (opts.seed ?? E.hashSeed(String(Math.random())));
  return {
    version: 1,
    daily,
    seed,
    rngCalls: 0,
    phase: PHASES.PICK_FRANCHISE,
    franchise: null,
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

function pickFranchise(run, franchise) {
  if (run.phase !== PHASES.PICK_FRANCHISE) throw new Error('franchise already chosen');
  run.franchise = franchise;
  run.phase = PHASES.DRAFT;
  return run;
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
 * How often the wheel favors a team-season that could link to the team you
 * already have, and how many times one team-season can come up in a run.
 *
 * Both exist because chemistry as specified could almost never happen. Measured
 * over 400 drafts by a player deliberately maximizing it on every single pick,
 * the result was +2% every time, and college was the ONLY link type that ever
 * fired. Two reasons:
 *
 *   1. Six uniform draws out of 861 team-seasons rarely share a franchise, a
 *      college or a draft class, and draft_year is null for undrafted players,
 *      which removes that link for them entirely.
 *   2. §5 says a team-season may never repeat in a run, but Battery (+10%) and
 *      Teammates (+5%), the two largest links in §6, both need two players from
 *      the SAME team-season. Those rules contradict each other, so the biggest
 *      chemistry in the game was unreachable by construction.
 *
 * A team-season can now come up twice, which makes Battery and Teammates
 * reachable while still stopping a run from being six players off one roster.
 * And about half of the spins after the first prefer a team-season connected to
 * somebody already signed, so chemistry is something you watch build rather than
 * something you occasionally luck into.
 */
/*
 * Exported so it can be swept from the harness rather than guessed at. The
 * balance being struck: chemistry has to be reachable, but it must not be
 * ambient. Franchise, college and draft links attach to the TEAM, so once the
 * wheel hands you a connected team you get the link whoever you sign. Push the
 * bias too high and chemistry becomes a gift instead of a decision, which is the
 * opposite of §6's intent that it should "tempt you into a cheaper signing".
 */
const TUNING = {
  CONNECTION_BIAS: 0.3,
  TIER_TAKE: 0.6,          // chance of stopping at each tier, strongest first
  MAX_DRAWS_PER_TEAM_SEASON: 2,
};

/*
 * Connected team-seasons, split by how strong a link they would make.
 *
 * These have to be tiered rather than pooled. A flat "anything connected" set is
 * dominated by college and draft-class matches, because there are hundreds of
 * those and only a handful of team-seasons you have actually signed from. Pooling
 * them meant the strongest links stayed as rare as before the bias existed: over
 * six test drafts every single link came back in the weakest band, so the whole
 * point of coloring them by strength was invisible.
 */
function connectedTiers(run, data) {
  const same = new Set();      // the exact team-season: teammates, and battery
  const franchise = new Set(); // same team, another year
  const loose = new Set();     // same college or draft class
  const pull = (set, into) => { if (set) for (const id of set) into.add(id); };
  for (const p of run.roster) {
    same.add(p.team_season_id);
    pull(data.tsByFranchise[p.franchise], franchise);
    pull(data.tsByCollege[p.college], loose);
    pull(data.tsByDraftYear[p.draft_year], loose);
  }
  for (const id of same) franchise.delete(id);
  for (const id of same) loose.delete(id);
  for (const id of franchise) loose.delete(id);
  return [same, franchise, loose];
}

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
  const canFill = (t) => affordableFrom(run, t.team_season_id, data.playersByTeamSeason).length > 0;
  return data.teamSeasons
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
  const rng = rngFor(run);

  let available = drawable(run, data);
  if (constraint) {
    const narrowed = available.filter((t) => t.team_season_id !== constraint.avoid
      && (constraint.season != null
        ? t.season === constraint.season
        : t.season !== constraint.notSeason));
    // Only honored when it leaves something. canRespin checks this first, so
    // falling back here is a backstop rather than an outcome anyone should see.
    if (narrowed.length) available = narrowed;
  }
  if (!available.length) throw new Error('nothing left you can afford');

  /*
   * When the bias fires, walk the tiers strongest first and take each one with
   * TIER_TAKE probability. That gives the big links a real chance without making
   * a reunion spin the default.
   */
  let pool = available;
  if (run.roster.length && rng() < TUNING.CONNECTION_BIAS) {
    for (const tier of connectedTiers(run, data)) {
      if (!tier.size) continue;
      const usable = available.filter((t) => tier.has(t.team_season_id));
      if (!usable.length) continue;
      if (rng() < TUNING.TIER_TAKE) { pool = usable; break; }
      pool = usable;   // remember the weakest usable tier as a fallback
    }
  }

  /*
   * Two wheels, year first and then the team, so the reveal lands in two beats.
   * The year is picked from the years actually present in the pool, then the team
   * from that year's teams in the same pool, which keeps both wheels honest: every
   * face on either wheel is a result you could really have landed on.
   */
  const years = [...new Set(pool.map((t) => t.season))].sort((a, b) => a - b);
  const season = years[Math.floor(rng() * years.length)];
  const inYear = pool.filter((t) => t.season === season);
  const t = inYear[Math.floor(rng() * inYear.length)];

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
  const constraint = !draw ? null
    : (which === 'team'
      ? { season: draw.season, avoid: draw.team_season_id }
      : { notSeason: draw.season, avoid: draw.team_season_id });
  return spin(run, data, constraint);
}

function sign(run, player) {
  if (run.phase !== PHASES.DRAFT) throw new Error('not drafting');
  if (!run.currentDraw) throw new Error('nothing drawn');
  if (!run.currentDraw.options.includes(pkey(player))) throw new Error('player not on this team');
  if (player.price_musd > remaining(run) - reserveFloor(run)) throw new Error('cannot afford');
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
  const chem = E.resolveChemistry(run.roster, ctx);
  const sched = E.generateSchedule(run.franchise, data.prepared, rng);
  run.schedule = sched.games.map((g) => g.team_season_id);
  run.playoffs = E.generatePlayoffs(data.prepared, rng).map((g) => g.team_season_id);
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
  const oppId = playoff
    ? run.playoffs[s.playoffRound % run.playoffs.length]
    : run.schedule[s.week];
  const opp = data.byTeamSeasonId[oppId];
  const rng = rngFor(run);
  const r = E.resolveGame(run.roster, s.chemistry, opp, leagueContext[opp.season] ?? 21.5, rng);
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
  const byTeamSeasonId = {};
  for (const t of teamSeasons) byTeamSeasonId[t.team_season_id] = t;

  /*
   * Reverse indexes for the connection bias below: which team-seasons contain a
   * player who could link to somebody, by franchise, college and draft class.
   */
  const tsByFranchise = {}, tsByCollege = {}, tsByDraftYear = {};
  const add = (map, k, v) => { if (k === null || k === undefined || k === '') return;
    (map[k] ??= new Set()).add(v); };
  for (const p of players) {
    if (!p.team_season_id) continue;
    add(tsByFranchise, p.franchise, p.team_season_id);
    add(tsByCollege, p.college, p.team_season_id);
    add(tsByDraftYear, p.draft_year, p.team_season_id);
  }
  return {
    players, teamSeasons, playersByTeamSeason, byTeamSeasonId,
    tsByFranchise, tsByCollege, tsByDraftYear,
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
      * E.resolveChemistry(arr, ctx).multiplier
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

  const chem = E.resolveChemistry(best, ctx);
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
const RUN_API_VERSION = 10;

const api = {
  API_VERSION: RUN_API_VERSION,
  PHASES, createRun, pickFranchise, spin, respin, sign,
  startSeason, advanceWeek, startPlayoffs, indexData, bestPossibleSquad, projectSeason,
  previewSigning,
  remaining, reserveFloor, canRespin, slotsLeft, affordableFrom,
  boardFrom, blockFor, BLOCK,
  openSlots, openSlotNames, slotForPlayer, TUNING,
};

if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') window.PS_RUN = api;
