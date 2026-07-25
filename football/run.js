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
  const fees = run.respinsUsed * E.CONSTANTS.RESPIN_COST_MUSD;
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

function canRespin(run) {
  if (run.phase !== PHASES.DRAFT) return { ok: false, reason: 'not drafting' };
  if (run.respinsUsed >= E.CONSTANTS.MAX_RESPINS) return { ok: false, reason: 'no re-spins left' };
  const after = remaining(run) - E.CONSTANTS.RESPIN_COST_MUSD;
  // Must still be able to fill every remaining slot at the minimum price.
  if (after < slotsLeft(run) * E.CONSTANTS.MIN_RESERVE_PER_SLOT_MUSD) {
    return { ok: false, reason: 'would leave too little to fill your roster' };
  }
  return { ok: true };
}

/**
 * Everyone on a team-season you could sign right now: affordable, not already
 * signed, and able to fill one of your empty spots.
 */
function affordableFrom(run, teamSeasonId, playersByTeamSeason) {
  const budget = remaining(run) - reserveFloor(run);
  return (playersByTeamSeason[teamSeasonId] ?? [])
    .filter((p) => p.price_musd <= budget
      && !run.usedPlayers.includes(pkey(p))
      && slotForPlayer(run, p) !== null)
    .sort((a, b) => b.ppr_ppg_mean - a.ppr_ppg_mean);
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
 * How often the wheel favours a team-season that could link to the team you
 * already have, and how many times one team-season can come up in a run.
 *
 * Both exist because chemistry as specified could almost never happen. Measured
 * over 400 drafts by a player deliberately maximising it on every single pick,
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
const CONNECTION_BIAS = 0.5;
const MAX_DRAWS_PER_TEAM_SEASON = 2;

/** Team-seasons that could produce a link with the current roster. */
function connectedTeamSeasons(run, data) {
  const out = new Set();
  const pull = (set) => { if (set) for (const id of set) out.add(id); };
  for (const p of run.roster) {
    out.add(p.team_season_id);                 // teammates and battery
    pull(data.tsByFranchise[p.franchise]);     // same franchise, another year
    pull(data.tsByCollege[p.college]);
    pull(data.tsByDraftYear[p.draft_year]);
  }
  return out;
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
function spin(run, data) {
  if (run.phase !== PHASES.DRAFT) throw new Error('not drafting');
  const rng = rngFor(run);

  const drawn = {};
  for (const id of run.usedTeamSeasons) drawn[id] = (drawn[id] || 0) + 1;
  const canFill = (t) => affordableFrom(run, t.team_season_id, data.playersByTeamSeason).length > 0;
  const available = data.teamSeasons
    .filter((t) => (drawn[t.team_season_id] || 0) < MAX_DRAWS_PER_TEAM_SEASON)
    .filter(canFill);
  if (!available.length) throw new Error('nothing left you can afford');

  let pool = available;
  if (run.roster.length && rng() < CONNECTION_BIAS) {
    const linked = connectedTeamSeasons(run, data);
    const usable = available.filter((t) => linked.has(t.team_season_id));
    if (usable.length) pool = usable;
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

  const options = affordableFrom(run, t.team_season_id, data.playersByTeamSeason);
  run.currentDraw = {
    season,
    team_season_id: t.team_season_id,
    franchise: t.franchise,
    display: t.display,
    teamName: t.display.replace(/^\d{4}\s+/, ''),
    yearOptions: years,
    teamOptions: inYear.map((x) => x.display.replace(/^\d{4}\s+/, '')),
    options: options.map(pkey),
  };
  return run.currentDraw;
}

/** Pay the fee and draw again for the same slot. */
function respin(run, data) {
  const check = canRespin(run);
  if (!check.ok) throw new Error(`cannot re-spin: ${check.reason}`);
  run.respinsUsed++;
  // The drawn team-season is consumed, you saw it and rejected it.
  if (run.currentDraw) run.usedTeamSeasons.push(run.currentDraw.team_season_id);
  run.currentDraw = null;
  return spin(run, data);
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
  run.usedPlayers.push(pkey(player));
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
 * The reveal (§7): the highest-scoring squad the player COULD have built from
 * the six team-seasons the wheel actually gave them.
 *
 * Constrained the way the draft is: slot i may only use the team-season drawn at
 * spin i, and the whole thing must fit the cap after re-spin fees. Solved as a
 * DP over discretized budget, the same shape as the optimizer in simulator.js.
 *
 * Maximizes raw points rather than points x chemistry: chemistry is not separable
 * across slots, so a joint optimum would need a much heavier search for a screen
 * that exists to say "you left this on the table". The chemistry of the resulting
 * squad is reported alongside, so a missed battery is still visible.
 */
function bestPossibleSquad(run, data, ctx) {
  const BUCKET = 0.5;
  const budget = E.CONSTANTS.CAP_MUSD - run.respinsUsed * E.CONSTANTS.RESPIN_COST_MUSD;
  const NB = Math.round(budget / BUCKET) + 1;

  const perSlot = run.draws.map((d) => {
    const allowed = E.SLOT_ELIGIBILITY[d.slot];
    return (data.playersByTeamSeason[d.team_season_id] ?? [])
      .filter((p) => allowed.includes(p.position));
  });

  // best[i][b] = best ppg for slots i.. with b buckets left
  let next = new Array(NB).fill(0);
  const choice = [];
  for (let i = perSlot.length - 1; i >= 0; i--) {
    const cur = new Array(NB).fill(-Infinity);
    const pickAt = new Array(NB).fill(null);
    for (let b = 0; b < NB; b++) {
      for (const p of perSlot[i]) {
        const cost = Math.ceil(p.price_musd / BUCKET);
        if (cost > b) continue;
        const val = p.ppr_ppg_mean + next[b - cost];
        if (val > cur[b]) { cur[b] = val; pickAt[b] = { p, cost }; }
      }
    }
    choice[i] = pickAt;
    next = cur;
  }

  const squad = [];
  let b = NB - 1;
  for (let i = 0; i < perSlot.length; i++) {
    const c = choice[i][b];
    if (!c) return null;
    squad.push(c.p);
    b -= c.cost;
  }
  const chem = E.resolveChemistry(squad, ctx);
  const yours = run.roster.reduce((s, p) => s + p.ppr_ppg_mean, 0) * run.season.chemistry;
  const theirs = squad.reduce((s, p) => s + p.ppr_ppg_mean, 0) * chem.multiplier;
  return {
    squad,
    chemistry: chem.multiplier,
    chemistryLinks: chem.links,
    spend: squad.reduce((s, p) => s + p.price_musd, 0),
    yourProjected: yours,
    bestProjected: theirs,
    missedBy: theirs - yours,
    // Slots where you left real points on the table, worst first.
    misses: squad
      .map((p, i) => ({ slot: run.draws[i].slot, had: run.roster[i], could: p,
        delta: p.ppr_ppg_mean - run.roster[i].ppr_ppg_mean }))
      .filter((m) => m.delta > 0.5)
      .sort((a, b2) => b2.delta - a.delta),
  };
}

const api = {
  PHASES, createRun, pickFranchise, spin, respin, sign,
  startSeason, advanceWeek, startPlayoffs, indexData, bestPossibleSquad,
  previewSigning,
  remaining, reserveFloor, canRespin, slotsLeft, affordableFrom,
  openSlots, openSlotNames, slotForPlayer,
};

if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') window.PS_RUN = api;
