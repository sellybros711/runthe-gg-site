/* CFB Perfect Season, draft loop and run state.
 *
 * Headless and dependency-free. Browser: window.PS_CFB_RUN. Node: require.
 *
 * Mirrors football/run.js in architecture but tuned for college football:
 *   - 5 roster slots (QB, RB, WR, TE, FLEX)
 *   - $14M NIL cap
 *   - 12-game regular season
 *   - 12-0: CFP bye (2 wins to title), 11-1: CFP (3 wins to title)
 *   - Below 11 wins: bowl game or season over
 */

'use strict';
(function(){

const E = (typeof require !== 'undefined')
  ? require('./engine.js')
  : window.PS_CFB_ENGINE;

const PHASES = {
  DRAFT: 'draft',
  SEASON: 'season',
  SEEDING: 'seeding',
  PLAYOFFS: 'playoffs',
  BOWL: 'bowl',
  OVER: 'over',
};

const pkey = (p) => `${p.player_id}|${p.season}`;

const money = (v) => Math.round(v * 100) / 100;

function remaining(run) {
  const spent = run.roster.reduce((s, p) => s + p.price_musd, 0);
  const fees = E.respinFees(run.respinsUsed);
  return money(E.CONSTANTS.CAP_MUSD - spent - fees);
}

const slotsLeft = (run) => E.SLOTS.length - run.roster.length;

function reserveFloor(run) {
  const flat = Math.max(0, slotsLeft(run) - 1) * E.CONSTANTS.MIN_RESERVE_PER_SLOT_MUSD;
  const per = assignedFloors(run);
  if (!per || per.length !== slotsLeft(run)) return flat;
  const sum = per.reduce((a, c) => a + c, 0);
  return money(Math.max(flat, sum - Math.min(...per)));
}

function fullFloor(run) {
  const per = assignedFloors(run);
  const flat = slotsLeft(run) * E.CONSTANTS.MIN_RESERVE_PER_SLOT_MUSD;
  if (!per || per.length !== slotsLeft(run)) return flat;
  return money(Math.max(flat, per.reduce((a, c) => a + c, 0)));
}

function assignedFloors(run) {
  const lists = run.floorLists;
  if (!lists) return null;
  const taken = new Set(run.usedPlayers);
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
        break;
      }
    }
    if (best === null) return null;
    taken.add(best.id);
    spent[best.ts] = (spent[best.ts] || 0) + 1;
    out.push(best.price);
  }
  return out;
}

function spendable(run) {
  return money(remaining(run) - reserveFloor(run));
}

function canRespin(run, kind, data) {
  const cost = E.respinCost(run.respinsUsed);
  if (run.phase !== PHASES.DRAFT) return { ok: false, reason: 'not drafting', cost };
  if (run.respinsUsed >= E.CONSTANTS.MAX_RESPINS) return { ok: false, reason: 'no re-spins left', cost };
  const draw = run.currentDraw;
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
  if (short) {
    return { ok: false, reason: 'would leave too little to fill your roster', cost };
  }
  if (rest) {
    const ok = kind === 'team'
      ? rest.some((t) => t.season === draw.season)
      : rest.some((t) => t.school === draw.school && t.season !== draw.season);
    if (!ok) {
      return {
        ok: false,
        cost,
        reason: kind === 'team'
          ? `no other ${draw.season} team you could use`
          : `no other ${draw.school} season you could use`,
      };
    }
  }
  return { ok: true, cost };
}

const BLOCK = { DRAFTED: 'drafted', NO_SPOT: 'no_spot', PRICE: 'price' };

function blockFor(run, player, teamSeasonId) {
  if (run.usedPlayers.includes(player.player_id)) return BLOCK.DRAFTED;
  if (slotForPlayer(run, player) === null) return BLOCK.NO_SPOT;
  if (!canFinishAfter(run, player, teamSeasonId)) return BLOCK.PRICE;
  return null;
}

function canFinishAfter(run, player, teamSeasonId) {
  const slot = slotForPlayer(run, player);
  if (slot === null) return false;
  if (player.price_musd > remaining(run)) return false;
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

function boardFrom(run, teamSeasonId, playersByTeamSeason) {
  return (playersByTeamSeason[teamSeasonId] ?? [])
    .map((p) => ({ player: p, block: blockFor(run, p, teamSeasonId) }))
    .sort((a, b) => b.player.ppr_ppg_mean - a.player.ppr_ppg_mean);
}

function affordableFrom(run, teamSeasonId, playersByTeamSeason) {
  return boardFrom(run, teamSeasonId, playersByTeamSeason)
    .filter((r) => r.block === null)
    .map((r) => r.player);
}

function someAffordable(run, teamSeasonId, playersByTeamSeason) {
  const list = playersByTeamSeason[teamSeasonId];
  if (!list) return false;
  for (const p of list) if (blockFor(run, p, teamSeasonId) === null) return true;
  return false;
}

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
  const seed = opts.seed ?? E.hashSeed(String(Math.random()));
  return {
    version: 1,
    seed,
    rngCalls: 0,
    phase: PHASES.DRAFT,
    roster: [],
    slotIndex: [],
    usedPlayers: [],
    usedTeamSeasons: [],
    draws: [],
    respinsUsed: 0,
    currentDraw: null,
    schedule: null,
    playoffs: null,
    season: null,
    playoffSeed: null,
    outcome: null,
    bowlInfo: null,
  };
}

function rngFor(run) {
  const rng = E.createSeededRNG(run.seed);
  for (let i = 0; i < run.rngCalls; i++) rng();
  return () => { run.rngCalls++; return rng(); };
}

function openSlots(run) {
  const taken = new Set(run.slotIndex);
  return E.SLOTS.map((_, i) => i).filter((i) => !taken.has(i));
}

function slotForPlayer(run, player) {
  const open = openSlots(run);
  const dedicated = open.find((i) => E.SLOTS[i] === player.position);
  if (dedicated !== undefined) return dedicated;
  const flex = open.find((i) => E.SLOT_ELIGIBILITY[E.SLOTS[i]].includes(player.position));
  return flex === undefined ? null : flex;
}

function openSlotNames(run) {
  return openSlots(run).map((i) => E.SLOTS[i]);
}

const TUNING = {
  MAX_DRAWS_PER_TEAM_SEASON: 2,
};

function drawable(run, data, limit) {
  const drawn = {};
  for (const id of run.usedTeamSeasons) drawn[id] = (drawn[id] || 0) + 1;
  const canFill = (t) => someAffordable(run, t.team_season_id, data.playersByTeamSeason);
  return data.teamSeasons
    .filter((t) => (drawn[t.team_season_id] || 0) < (limit ?? TUNING.MAX_DRAWS_PER_TEAM_SEASON))
    .filter(canFill);
}

function spin(run, data, constraint) {
  if (run.phase !== PHASES.DRAFT) throw new Error('not drafting');
  run.floorLists ??= (data.cheapBy && (data.cheapBy['*'] || null));
  const rng = rngFor(run);

  let available = drawable(run, data);
  if (constraint) {
    const narrowed = available.filter((t) => t.team_season_id !== constraint.avoid
      && (constraint.school == null || t.school === constraint.school)
      && (constraint.season != null
        ? t.season === constraint.season
        : t.season !== constraint.notSeason));
    if (narrowed.length) available = narrowed;
  }
  if (!available.length) throw new Error('nothing left you can afford');

  const pool = available;
  const t = pool[Math.floor(rng() * pool.length)];
  const season = t.season;
  const years = [...new Set(pool.map((x) => x.season))].sort((a, b) => a - b);
  const inYear = pool.filter((x) => x.season === season);

  const board = boardFrom(run, t.team_season_id, data.playersByTeamSeason);
  run.currentDraw = {
    season,
    team_season_id: t.team_season_id,
    school: t.school,
    display: t.display,
    teamName: t.display.replace(/^\d{4}\s+/, ''),
    yearOptions: years,
    teamOptions: inYear.map((x) => x.display.replace(/^\d{4}\s+/, '')),
    board: board.map((r) => ({ key: pkey(r.player), block: r.block })),
    options: board.filter((r) => r.block === null).map((r) => pkey(r.player)),
  };
  return run.currentDraw;
}

function respin(run, data, kind) {
  const which = kind === 'year' ? 'year' : 'team';
  const check = canRespin(run, which, data);
  if (!check.ok) throw new Error(`cannot re-spin: ${check.reason}`);
  const draw = run.currentDraw;
  run.respinsUsed++;
  if (draw) run.usedTeamSeasons.push(draw.team_season_id);
  run.currentDraw = null;
  const constraint = !draw ? null
    : (which === 'team'
      ? { season: draw.season, avoid: draw.team_season_id }
      : { school: draw.school, notSeason: draw.season, avoid: draw.team_season_id });
  return spin(run, data, constraint);
}

function sign(run, player) {
  if (run.phase !== PHASES.DRAFT) throw new Error('not drafting');
  if (!run.currentDraw) throw new Error('nothing drawn');
  if (!run.currentDraw.options.includes(pkey(player))) throw new Error('player not on this team');
  if (!canFinishAfter(run, player, run.currentDraw.team_season_id)) throw new Error('cannot afford');
  const slot = slotForPlayer(run, player);
  if (slot === null) throw new Error('no empty spot for a ' + player.position);

  run.roster.push(player);
  run.slotIndex.push(slot);
  run.usedPlayers.push(player.player_id);
  run.usedTeamSeasons.push(run.currentDraw.team_season_id);
  run.draws.push({ slot: E.SLOTS[slot], team_season_id: run.currentDraw.team_season_id });
  run.currentDraw = null;

  if (run.roster.length === E.SLOTS.length) run.phase = PHASES.SEASON;
  return run;
}

function startSeason(run, data, ctx) {
  if (run.phase !== PHASES.SEASON) throw new Error('draft not finished');
  const rng = rngFor(run);
  const chem = E.resolveChemistry(run.roster, ctx);
  const sched = E.generateSchedule(data.prepared, rng);
  run.schedule = sched.games.map((g) => g.team_season_id);
  run.playoffs = E.generatePlayoffs(data.prepared, rng).map((g) => g.team_season_id);
  run.season = {
    chemistry: chem.multiplier,
    chemistryResult: { net: chem.net, links: chem.links },
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

function advanceWeek(run, data, leagueContext, displayCal) {
  const s = run.season;
  if (run.phase !== PHASES.SEASON && run.phase !== PHASES.PLAYOFFS) {
    throw new Error('no game to play in phase ' + run.phase);
  }

  const playoff = run.phase === PHASES.PLAYOFFS;
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
  const r = E.resolveGame(run.roster, s.chemistry, opp, leagueContext[opp.season] ?? 25, rng, E.CONSTANTS, advantage);
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
      const seed = E.seedFromRecord(s.wins);
      run.playoffSeed = {
        ...seed,
        roundNames: seed.made ? E.playoffRoundNames(seed.rounds) : [],
        regularRecord: s.wins + '-' + s.losses,
      };
      s.regularWins = s.wins;
      s.regularLosses = s.losses;
      run.phase = PHASES.SEEDING;
      if (!seed.made && !seed.bowl) {
        finish(run, { missedPlayoffs: true });
      } else if (!seed.made && seed.bowl) {
        const rng2 = rngFor(run);
        const bowlOpp = E.generateBowlOpponent(data.prepared, rng2, seed.bowl);
        run.bowlOpponentId = bowlOpp.team_season_id;
        run.bowlInfo = E.selectBowl(run.roster, run.season.chemistryResult, rng2);
      }
    }
  }
  return result;
}

function startPlayoffs(run) {
  if (run.phase !== PHASES.SEEDING) throw new Error('not at seeding');
  if (!run.playoffSeed.made) throw new Error('did not make the playoffs');
  run.season.playoffRound = 0;
  run.phase = PHASES.PLAYOFFS;
  return run;
}

function startBowl(run) {
  if (run.phase !== PHASES.SEEDING) throw new Error('not at seeding');
  if (!run.playoffSeed.bowl) throw new Error('no bowl game');
  run.phase = PHASES.BOWL;
  return run;
}

function playBowlGame(run, data, leagueContext, displayCal) {
  if (run.phase !== PHASES.BOWL) throw new Error('not in bowl phase');
  const opp = data.byTeamSeasonId[run.bowlOpponentId];
  const rng = rngFor(run);
  const s = run.season;
  const r = E.resolveGame(run.roster, s.chemistry, opp, leagueContext[opp.season] ?? 25, rng);
  const shown = displayCal ? E.toFootballScore(r.yourScore, r.oppScore, r.won, rng, displayCal) : null;

  if (r.won) s.wins++; else s.losses++;
  const result = {
    week: null,
    round: run.bowlInfo.name,
    playoff: false,
    bowl: true,
    bowlKey: run.bowlInfo.key,
    bowlTagline: run.bowlInfo.tagline,
    opponent: opp.display,
    opponent_id: run.bowlOpponentId,
    won: r.won,
    yourScore: Math.round(r.yourScore * 10) / 10,
    oppScore: Math.round(r.oppScore * 10) / 10,
    shownYou: shown ? shown.you : null,
    shownThem: shown ? shown.them : null,
  };
  s.results.push(result);
  finish(run, { bowlGame: true, bowlWon: r.won });
  return result;
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
    seedLabel: run.playoffSeed ? run.playoffSeed.label : 'Season over',
    titleWon: !!how.titleWon,
    eliminatedIn: how.eliminatedIn || null,
    missedPlayoffs: !!how.missedPlayoffs,
    bowlGame: !!how.bowlGame,
    bowlWon: !!how.bowlWon,
    bowlInfo: run.bowlInfo || null,
    undefeatedRegular: (s.regularLosses ?? s.losses) === 0,
    perfect: !!how.titleWon && s.losses === 0,
  };
  return run;
}

function indexData(players, teamSeasons) {
  const playersByTeamSeason = {};
  for (const p of players) {
    if (!p.team_season_id) continue;
    (playersByTeamSeason[p.team_season_id] ??= []).push(p);
  }
  for (const list of Object.values(playersByTeamSeason)) {
    list.sort((a, b) => a.price_musd - b.price_musd);
  }
  const byTeamSeasonId = {};
  for (const t of teamSeasons) byTeamSeasonId[t.team_season_id] = t;

  const FLOOR_DEPTH = 48;
  const cheapBy = {};
  const add = (key, p) => {
    const at = ((cheapBy[key] ??= {})[p.position] ??= []);
    at.push({ id: p.player_id, price: p.price_musd, ts: p.team_season_id });
  };
  for (const p of players) {
    if (!p.position) continue;
    add('*', p);
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

function bestPossibleSquad(run, data, ctx) {
  const BUCKET = 0.5;
  const budget = E.CONSTANTS.CAP_MUSD - E.respinFees(run.respinsUsed);
  const NB = Math.round(budget / BUCKET) + 1;
  const nSlots = E.SLOTS.length;
  const FULL = (1 << nSlots) - 1;

  const pool = run.draws.map((d) => (data.playersByTeamSeason[d.team_season_id] ?? []));
  if (pool.some((list) => !list.length)) return null;

  const fits = (p, slot) => E.SLOT_ELIGIBILITY[E.SLOTS[slot]].includes(p.position);
  const popcount = (m) => { let c = 0; while (m) { c += m & 1; m >>= 1; } return c; };

  const NEG = -1e9;
  const masksByCount = Array.from({ length: nSlots + 1 }, () => []);
  for (let m = 0; m <= FULL; m++) masksByCount[popcount(m)].push(m);

  function solve(banned) {
    const lists = pool.map((list, i) => (banned[i].size
      ? list.filter((p) => !banned[i].has(p.player_id)) : list));
    if (lists.some((list) => !list.length)) return null;
    const dp = new Float64Array((FULL + 1) * NB).fill(NEG);
    const from = new Int32Array((FULL + 1) * NB).fill(-1);
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
    yourProjected: yourPts * run.season.chemistry * E.rosterStructure(run.roster).multiplier,
    bestProjected: bestScore,
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

const RUN_API_VERSION = 1;

const api = {
  API_VERSION: RUN_API_VERSION,
  PHASES, createRun, spin, respin, sign,
  startSeason, advanceWeek, startPlayoffs, startBowl, playBowlGame,
  indexData, bestPossibleSquad, projectSeason,
  previewSigning,
  remaining, reserveFloor, spendable, canRespin, slotsLeft, affordableFrom,
  boardFrom, blockFor, BLOCK, drawable,
  openSlots, openSlotNames, slotForPlayer, TUNING,
};

if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') window.PS_CFB_RUN = api;
})();
