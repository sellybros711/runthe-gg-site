/* The Perfect Season — draft loop and run state.
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

const PHASES = { PICK_FRANCHISE: 'pick_franchise', DRAFT: 'draft', SEASON: 'season', OVER: 'over' };

const pkey = (p) => `${p.player_id}|${p.season}`;

/**
 * Money still available. The re-spin fee comes out of the cap, so the budget
 * shrinks as you fish for a better team-season — a re-spin costs you a tier of
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
 * §5 wants this as a passive warning on signings — bankrupting yourself into
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

/** Players on a team-season who can fill this slot and are affordable now. */
function affordableFrom(run, teamSeasonId, slot, playersByTeamSeason) {
  const allowed = E.SLOT_ELIGIBILITY[slot];
  const budget = remaining(run) - reserveFloor(run);
  return (playersByTeamSeason[teamSeasonId] ?? [])
    .filter((p) => allowed.includes(p.position)
      && p.price_musd <= budget
      && !run.usedPlayers.includes(pkey(p)))
    .sort((a, b) => b.ppr_ppg_mean - a.ppr_ppg_mean);
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
    usedPlayers: [],
    usedTeamSeasons: [],
    respinsUsed: 0,
    freeRerolls: 0,
    currentDraw: null,
    schedule: null,
    playoffs: null,
    season: null,
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

const currentSlot = (run) => E.SLOTS[run.roster.length];

/**
 * Draw a team-season for the current slot.
 *
 * Uniform over the eligible pool — no weighting toward famous teams, per §5.
 * Two filters, both required to avoid dead ends:
 *   - the team-season must have an eligible player at THIS slot (13 team-seasons
 *     in the pool have a slot with nobody qualifying);
 *   - it must have one you can currently afford. If not, the draw is free and
 *     re-rolls automatically, and the burned team-season is NOT consumed —
 *     a free re-roll should not quietly shrink the pool you can still see.
 */
function spin(run, data) {
  if (run.phase !== PHASES.DRAFT) throw new Error('not drafting');
  const rng = rngFor(run);
  const slot = currentSlot(run);
  const pool = data.teamSeasons.filter((t) => !run.usedTeamSeasons.includes(t.team_season_id));

  for (let guard = 0; guard < 5000; guard++) {
    const t = pool[Math.floor(rng() * pool.length)];
    const options = affordableFrom(run, t.team_season_id, slot, data.playersByTeamSeason);
    if (!options.length) { run.freeRerolls++; continue; }
    run.currentDraw = { team_season_id: t.team_season_id, display: t.display, slot, options: options.map(pkey) };
    return run.currentDraw;
  }
  throw new Error('no affordable team-season for slot ' + slot);
}

/** Pay the fee and draw again for the same slot. */
function respin(run, data) {
  const check = canRespin(run);
  if (!check.ok) throw new Error(`cannot re-spin: ${check.reason}`);
  run.respinsUsed++;
  // The drawn team-season is consumed — you saw it and rejected it.
  if (run.currentDraw) run.usedTeamSeasons.push(run.currentDraw.team_season_id);
  run.currentDraw = null;
  return spin(run, data);
}

function sign(run, player) {
  if (run.phase !== PHASES.DRAFT) throw new Error('not drafting');
  if (!run.currentDraw) throw new Error('nothing drawn');
  if (!run.currentDraw.options.includes(pkey(player))) throw new Error('player not on the drawn team-season');
  if (player.price_musd > remaining(run) - reserveFloor(run)) throw new Error('cannot afford');

  run.roster.push(player);
  run.usedPlayers.push(pkey(player));
  run.usedTeamSeasons.push(run.currentDraw.team_season_id);
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
    wins: 0,
    losses: 0,
    results: [],
  };
  return run;
}

/** Advance exactly one week. The season is played one game at a time (§7). */
function advanceWeek(run, data, leagueContext) {
  if (run.phase !== PHASES.SEASON) throw new Error('season not active');
  const s = run.season;
  const ids = run.schedule.concat(run.playoffs);
  const oppId = ids[s.week];
  const opp = data.byTeamSeasonId[oppId];
  const rng = rngFor(run);
  const leagueAvg = leagueContext[opp.season] ?? 21.5;
  const r = E.resolveGame(run.roster, s.chemistry, opp, leagueAvg, rng);

  s.week++;
  if (r.won) s.wins++; else s.losses++;
  s.results.push({
    week: s.week,
    opponent: opp.display,
    opponent_id: oppId,
    playoff: s.week > run.schedule.length,
    won: r.won,
    yourScore: Math.round(r.yourScore * 10) / 10,
    oppScore: Math.round(r.oppScore * 10) / 10,
  });

  const outOfLives = s.losses > E.CONSTANTS.LIVES;
  const finished = s.week >= ids.length;
  if (outOfLives || finished) {
    run.phase = PHASES.OVER;
    run.outcome = {
      perfect: finished && s.losses === 0,
      beatBenchmark: finished && s.losses <= 1,
      weekReached: s.week,
      record: `${s.wins}-${s.losses}`,
      eliminated: outOfLives,
    };
  }
  return s.results[s.results.length - 1];
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
  return {
    players, teamSeasons, playersByTeamSeason, byTeamSeasonId,
    prepared: E.prepareData(teamSeasons),
  };
}

const api = {
  PHASES, createRun, pickFranchise, currentSlot, spin, respin, sign,
  startSeason, advanceWeek, indexData,
  remaining, reserveFloor, canRespin, slotsLeft, affordableFrom,
};

if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') window.PS_RUN = api;
