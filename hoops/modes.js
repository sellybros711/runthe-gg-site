/* Run The Floor: the three ways to play that are not a draft.
 *
 *   Conquest       winners stay on, against real teams, and you take a man off
 *                  every team you beat
 *   Fix History    the daily: one real team that fell short, one move, and the
 *                  title odds it buys
 *   Six Passes     the daily: get the ball from one player to another through
 *                  real teammates
 *
 * Headless and dependency-free apart from engine.js, so every rule in here can
 * be driven from node. Browser: window.RTF_MODES. Node: require.
 *
 * NOTHING HERE IS A SECOND MODEL OF BASKETBALL. Every rating is the engine's
 * own (resolveChemistry, rosterFit, rosterOffense, rosterDefense, the same
 * pipeline playRun runs a drafted five through), every game is resolveGame, and
 * every season is playRun. The modes decide WHO plays, never how a game goes,
 * so the calibration the draft is balanced on carries over untouched.
 */
'use strict';
(function() {

const E = (typeof require !== 'undefined')
  ? require('./engine.js')
  : window.RTF_ENGINE;

const MODES_API_VERSION = 3;
const C = E.CONSTANTS;

// ─── shared ────────────────────────────────────────────────────────────────

const rngFor = (seed, tag) => E.createSeededRNG(E.hashSeed(String(seed) + ':' + tag));

/* What five men are worth, through the pipeline a drafted roster runs. The
   roster rows have to carry `_slot`, because rosterFit and the systems read it. */
function strengthOf(roster) {
  const chem = E.resolveChemistry(roster);
  const fit = E.rosterFit(roster);
  const ortg = E.rosterOffense(roster, chem.bonus, fit.bonus);
  const drtg = E.rosterDefense(roster, chem.bonus);
  return {
    ortg, drtg,
    chem: chem.bonus,
    fit: fit.bonus,
    system: fit.system ? fit.system.name : null,
    rating: E.overallRating(E.teamWinPct(ortg, drtg)),
  };
}

/* A real club's best five, the same five teamStrength rates it on. Sorted by
   win shares so the man you are most likely to want is first on the card. */
function bestFive(data, tsId) {
  const all = data.byTeamSeason[tsId] || [];
  return [...all].sort((a, b) => b.w - a.w).slice(0, E.SLOTS.length);
}

/* The expected points each side scores against the other, the way gameMeans
   works a schedule game out, with the two real rosters standing in for the
   schedule's opponent. */
function meansOf(a, b) {
  const pace = C.LEAGUE_PACE / 100, L = C.LEAGUE_RTG;
  return {
    pointsFor: a.ortg * (b.drtg / L) * pace,
    pointsAgainst: b.ortg * (a.drtg / L) * pace,
  };
}

/* Standard normal CDF, Abramowitz and Stegun 26.2.17. Good to 7.5e-8, which is
   far more than a printed percentage needs. */
function phi(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp(-x * x / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}

/* THE CHANCE resolveGame HANDS THE FIRST SIDE THE GAME, read off its own
   arithmetic rather than simulated: each side is its mean plus GAME_SD of
   noise pulled back by CONSISTENCY, and the second side is then divided by
   the home court. Printed before tip-off, so it has to be the number the game
   actually plays, and check-modes.mjs holds it to a simulation. */
const GAME_SD = 11.0;
function winChance(means, adv) {
  const k = 1 - C.CONSISTENCY, a = adv || 1;
  const diff = means.pointsFor - means.pointsAgainst / a;
  const sd = GAME_SD * k * Math.sqrt(1 + 1 / (a * a));
  return phi(diff / sd);
}

// ─── Conquest ──────────────────────────────────────────────────────────────

/* WINNERS STAY ON.
 *
 * You start with five role players. Real teams line up, weakest first, and
 * you play them one game at a time. Beat one and you take a man off their
 * five, dropping one of your own. Lose and it costs a life, and the same team
 * stays on for a rematch. Three lives, and every boss you beat gives one back.
 *
 * ONE LOSS AND OUT WAS THE FIRST VERSION AND A SINGLE NBA GAME CANNOT CARRY
 * IT. resolveGame is fitted to real games, and in real games a team fifteen
 * rating points better wins about three in four. Measured over 200 runs a
 * bot, one loss and out gave a median of ONE win whatever the steals were,
 * and the smart bot and the one that never stole anything finished within a
 * game of each other. The steal did not matter, and the steal is the game.
 *
 * With three lives, 200 runs a bot:
 *
 *                     median   p90   clears all 25
 *   the best steal       6      23        6.5%
 *   the best man         5      19        7.0%
 *   never steals         4       9        0%
 *
 * So the steal decides the run and a run that never steals never clears,
 * which is the shape wanted. Re-measure before moving any number below:
 * START, CURVE and the crew all trade off against each other.
 *
 * THE LADDER IS REAL TEAM-SEASONS, NOT A DIFFICULTY NUMBER. Rung k aims at a
 * rating and takes a club near it, so the line of challengers is the 2012
 * Bobcats early and the 1996 Bulls at the top, and the story of a run is a
 * list of teams a fan already knows.
 *
 * THE STEAL IS THE WHOLE GAME, and position is what makes it a decision. The
 * man you take goes into the slot of the man you drop and has to be able to
 * play it, so taking a team's center means giving up your own. The shot
 * budget in rosterFit does the rest: taking the leading scorer off every club
 * you beat builds Too Many Mouths, which is the same lesson the draft teaches
 * arriving by a different door.
 */
const CQ = {
  RUNGS: 25,          // the ladder; the last rung is the best team there is
  START: 16,          // the rating the first challenger aims at
  CURVE: 1.25,        // how the aim climbs from START to the top
  NEAR: 6,            // pick among this many clubs nearest the aim
  HOME: true,         // winners stay on, and the court is theirs
  /* The five you start with: real role players, one per position. Scrubs were
     tried first and rated 1, which made the first game a 28% chance. A crew
     between 3 and 6 win shares rates about 26 and meets a 16 first. */
  CREW_MAX_WS: 6.0,
  CREW_MIN_WS: 3.0,
  BOSS_EVERY: 5,      // every fifth rung is a boss, played on the live board
  LIVES: 3,           // a loss costs one and the challenger stays on
  BOSS_LIFE: true,    // beating a boss gives one back, never past LIVES
};

/* The aim for rung k, in rating points. */
function cqAim(k) {
  const f = Math.min(1, k / (CQ.RUNGS - 1));
  return CQ.START + (100 - CQ.START) * Math.pow(f, CQ.CURVE);
}

/* THE LINE OF CHALLENGERS, decided once at the start of a run so the
   sideline can show who is coming. One club per rung and never the same
   team-season twice. The last rung is always the best-rated team-season in
   the data, whoever that is when the data is refreshed. */
function cqLadder(data, seed) {
  const rng = rngFor(seed, 'ladder');
  const pool = [...data.teamSeasons].sort((a, b) => a.rating - b.rating);
  const used = new Set();
  const top = pool[pool.length - 1];
  used.add(top.team_season_id);
  const out = [];
  for (let k = 0; k < CQ.RUNGS - 1; k++) {
    const aim = cqAim(k);
    const near = pool.filter(t => !used.has(t.team_season_id))
      .sort((a, b) => Math.abs(a.rating - aim) - Math.abs(b.rating - aim))
      .slice(0, CQ.NEAR);
    const pick = near[Math.floor(rng() * near.length)];
    used.add(pick.team_season_id);
    out.push(pick.team_season_id);
  }
  out.push(top.team_season_id);
  return out;
}

/* PAST THE LADDER THE COURT STAYS OPEN, against the best teams there are. A
   run that beats the 1996 Bulls has not lost, and "winners stay on" does not
   stop because a list ran out. Each extra challenger is one of the top forty,
   drawn off the run's seed and the rung so a reload meets the same one. */
function cqChallenger(state, data, k) {
  if (k < state.ladder.length) return state.ladder[k];
  const rng = rngFor(state.seed, 'legend:' + k);
  const top = [...data.teamSeasons].sort((a, b) => b.rating - a.rating).slice(0, 40);
  return top[Math.floor(rng() * top.length)].team_season_id;
}

/* Five role players, one per slot. */
function cqCrew(data, seed) {
  const rng = rngFor(seed, 'crew');
  const crew = [];
  const ids = new Set();
  for (const slot of E.SLOTS) {
    const pool = data.players.filter(p => p.t !== 'TOT' && !ids.has(p.i)
      && p.w >= CQ.CREW_MIN_WS && p.w <= CQ.CREW_MAX_WS && E.canFillSlot(p, slot));
    const p = pool[Math.floor(rng() * pool.length)];
    ids.add(p.i);
    crew.push(E.pkey(p));
  }
  return crew;
}

function cqCreate(data, seed, opts) {
  const s = String(seed);
  const draft = !!(opts && opts.draft);
  return {
    v: 1,
    seed: s,
    /* pkeys, in E.SLOTS order. A drafted run starts empty and fills one slot
       a pick; the dealt crew is kept for anything that asks without a draft. */
    roster: draft ? [] : cqCrew(data, s),
    drafting: draft,
    ladder: cqLadder(data, s),
    rung: 0,                        // the next challenger is ladder[rung]
    wins: [],                       // one per beaten team: {ts, you, opp, ot, took, dropped}
    pending: null,                  // a win waiting on its steal
    lives: CQ.LIVES,
    losses: [],                     // every game lost: {ts, rung, you, opp, ot}
    tries: 0,                       // games played against the current rung
    lost: null,                     // the game that ended it
  };
}

/* THE OPENING DRAFT: five picks, one a position, three cards each.
 *
 * Every card comes from the SAME TIER the dealt crew is drawn from, three to
 * six win shares, so choosing your five changes who they are and not how good
 * the start is. The ladder is tuned to that start, and the steal is still how
 * a run gets good. A cap draft was the other option and it would have made the
 * first ten rungs a formality.
 *
 * The cards are drawn off the run's seed and the slot, so a reload shows the
 * same three, and nobody already picked is offered again. */
const CQ_CARDS = 3;
function cqDraftCards(state, data) {
  if (!state.drafting || state.roster.length >= E.SLOTS.length) return [];
  const k = state.roster.length, slot = E.SLOTS[k];
  const rng = rngFor(state.seed, 'draft:' + k);
  const taken = new Set(state.roster.map(key => data.allPlayers[key].i));
  const pool = data.players.filter(p => p.t !== 'TOT' && !taken.has(p.i)
    && p.w >= CQ.CREW_MIN_WS && p.w <= CQ.CREW_MAX_WS && E.canFillSlot(p, slot));
  const out = [], seen = new Set();
  let guard = 0;
  while (out.length < CQ_CARDS && guard++ < 400 && pool.length) {
    const p = pool[Math.floor(rng() * pool.length)];
    if (seen.has(p.i)) continue;
    seen.add(p.i);
    out.push(E.pkey(p));
  }
  return out;
}

function cqDraftPick(state, data, key) {
  if (!state.drafting) throw new Error('not drafting');
  if (cqDraftCards(state, data).indexOf(key) < 0) throw new Error('not one of the cards');
  state.roster.push(key);
  if (state.roster.length === E.SLOTS.length) state.drafting = false;
  return state;
}

/* The roster as rows carrying their slots, which is what the engine reads. */
function cqRoster(state, data) {
  return state.roster.map((k, i) => ({ ...data.allPlayers[k], _slot: E.SLOTS[i] }));
}

function cqStrength(state, data) { return strengthOf(cqRoster(state, data)); }

/* What the next game looks like before it is played: who, how good, and the
   chance. */
function cqPreview(state, data) {
  const ts = cqChallenger(state, data, state.rung);
  const them = data.teamStats[ts];
  const you = cqStrength(state, data);
  const adv = CQ.HOME ? 1 + C.PLAYOFF_HOME_COURT : 1;
  const means = meansOf(you, them);
  return {
    ts,
    rung: state.rung,
    boss: cqIsBoss(state.rung),
    them, you, means, adv,
    chance: winChance(means, adv),
    five: bestFive(data, ts),
  };
}

const cqIsBoss = (rung) => (rung + 1) % CQ.BOSS_EVERY === 0 || rung === CQ.RUNGS - 1;

/* PLAY THE NEXT GAME. The rng is the run's seed and the rung, so the same
   run meets the same result whatever order anything else was drawn in, and
   a reload in the middle cannot reroll a loss. `result` lets a game played
   on the live board be recorded instead of resolved here. */
function cqPlay(state, data, result) {
  if (state.lost || state.pending || state.drafting) throw new Error('not ready to play');
  const pv = cqPreview(state, data);
  /* A REMATCH IS A NEW GAME, so the attempt is in the tag. Without it a
     loss would replay itself identically until the lives ran out. */
  const r = result || E.resolveGame(pv.means.pointsFor, pv.means.pointsAgainst,
    rngFor(state.seed, 'game:' + state.rung + ':' + state.tries), pv.adv);
  const rec = { ts: pv.ts, rung: state.rung, you: r.yourPoints, opp: r.oppPoints,
    ot: r.ot || 0, rating: pv.you.rating, oppRating: pv.them.rating, won: !!r.won,
    boss: pv.boss };
  state.tries++;
  if (r.won) {
    state.pending = rec;
  } else {
    state.losses.push(rec);
    state.lives--;
    if (state.lives <= 0) state.lost = rec;
  }
  return rec;
}

/* EVERY LEGAL STEAL. The man you take goes into the slot of the man you drop,
   so he has to be able to play it, and he cannot already be on your roster in
   another season. Each option carries the rating it would leave you with,
   because that is the number a player is choosing on. */
function cqSteals(state, data) {
  if (!state.pending) return [];
  const five = bestFive(data, state.pending.ts);
  const mine = cqRoster(state, data);
  const ids = new Set(mine.map(p => p.i));
  const base = strengthOf(mine).rating;
  const out = [];
  for (const p of five) {
    for (let s = 0; s < mine.length; s++) {
      const slot = E.SLOTS[s];
      if (!E.canFillSlot(p, slot)) continue;
      if (ids.has(p.i) && mine[s].i !== p.i) continue;
      const next = mine.slice();
      next[s] = { ...p, _slot: slot };
      const st = strengthOf(next);
      out.push({ take: E.pkey(p), drop: state.roster[s], slot: s,
        rating: st.rating, delta: Math.round((st.rating - base) * 10) / 10, system: st.system });
    }
  }
  return out;
}

/* Take a man, or pass. Either way the pending win is banked and the next
   challenger steps up. */
function cqSteal(state, data, take, slot) {
  if (!state.pending) throw new Error('no win to steal from');
  const rec = state.pending;
  if (take != null) {
    const legal = cqSteals(state, data).some(o => o.take === take && o.slot === slot);
    if (!legal) throw new Error('not a legal steal');
    rec.took = take;
    rec.dropped = state.roster[slot];
    state.roster[slot] = take;
  }
  if (rec.boss && CQ.BOSS_LIFE && state.lives < CQ.LIVES) { state.lives++; rec.life = true; }
  state.wins.push(rec);
  state.pending = null;
  state.rung++;
  state.tries = 0;
  return state;
}

const cqStreak = (state) => state.wins.length + (state.pending ? 1 : 0);
const cqOver = (state) => !!state.lost;
/* The ladder is cleared once the last rung is beaten; the court stays open. */
const cqCleared = (state) => cqStreak(state) >= CQ.RUNGS;

// ─── the daily clock ───────────────────────────────────────────────────────

/* Both dailies share the draft daily's calendar: day 1 is the epoch, and the
   day rolls at Eastern midnight. The page's own easternISO() and
   dayNumberOf() are the answer and these are copies only in the sense that
   node has no page; verify reads both and holds them to one epoch. */
const DAILY_EPOCH = '2026-09-18';
function dayNumberOf(iso) {
  const a = String(iso).split('-').map(Number), b = DAILY_EPOCH.split('-').map(Number);
  const ms = Date.UTC(a[0], a[1] - 1, a[2]) - Date.UTC(b[0], b[1] - 1, b[2]);
  return Math.round(ms / 86400000) + 1;
}

/* A permutation of `n` things fixed by `tag`, so day d takes item perm[d % n]
   and no item repeats until every one has been used. */
function dailyOrder(n, tag) {
  const rng = rngFor(tag, 'order');
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─── Fix History ───────────────────────────────────────────────────────────

/* ONE REAL TEAM THAT FELL SHORT, AND ONE TRADE.
 *
 * Every day the same club for everybody: a good team that did not win it. You
 * put one or two of its players on the block, starters or bench, and the rest
 * of the league that season makes offers. Take one and the season is played
 * again.
 *
 * THE SCORE IS THE TITLE ODDS, NOT THE REPLAY. One replayed season is a coin
 * with a ring on one side, so two people who made the same move would land on
 * a leaderboard hundreds of places apart on the dice. The odds are the share of
 * FX.SIMS seasons the new five win, and the seeds are the day's, so the same
 * five always score the same number for everybody. The replay is the story: it
 * is played once, off the day's seed, and it is what the results screen shows.
 *
 * IT IS A REAL TRADE IN A REAL SEASON. The first version let a starter go for
 * anybody since 1974 who cost no more, which is a history quiz rather than a
 * rebuild: the answer was always a bargain from another decade. Now every
 * partner is a club from the SAME season, and the deal has to pass the rule a
 * real one lives under: each side takes back no more than 125% of the salary
 * it sends, plus $0.1M. Price here is what the market pays for points and
 * value is win shares, so the good deals are still the men the market
 * underpaid. Now they have to be found in one year's league.
 *
 * THE BENCH IS CURRENCY. The engine plays five men, so a bench player matters
 * two ways: as salary to make a bigger deal work, and as a man who might be
 * better than a starter. After a trade the coach starts the best five who can
 * cover the positions, the same rule that picked the five as built, so a deal
 * that leaves nobody able to play center is refused before it is made.
 *
 * WHO STARTS AFTER A TRADE IS NOT SHOWN UNTIL IT IS DONE. The lineup is chosen
 * by win shares, so previewing it for every offer would print the answer key a
 * tap at a time.
 */
const FX = {
  SIMS: 1000,         // seasons per score; about 1.4 points of standard error at 20%
  MIN_RATING: 68,     // a real contender
  MAX_RATING: 90,     // and not a juggernaut the move cannot move
  POOL_DEPTH: 9,      // the five are chosen from a club's best nine
};

function permutations(a) {
  if (a.length < 2) return [a];
  const out = [];
  a.forEach((x, i) => permutations(a.slice(0, i).concat(a.slice(i + 1)))
    .forEach(p => out.push([x, ...p])));
  return out;
}

/* Five men in SLOTS order, or null if these five cannot cover the positions. */
function slotFive(five) {
  for (const p of permutations(five)) {
    if (p.every((x, i) => E.canFillSlot(x, E.SLOTS[i]))) return p;
  }
  return null;
}

/* A REAL CLUB'S STARTING FIVE is the best five of its top nine who can cover
   PG, SG, SF, PF and C between them. The best five by win shares alone fit the
   positions on only 533 of 1433 team-seasons, because plenty of great teams
   had three bigs among their five best men. */
function startingFive(data, tsId) {
  return fiveOf(data.byTeamSeason[tsId] || []);
}

/* The teams a day can land on: contenders that did not win it. Sorted by id so
   the list, and therefore the calendar, only moves when the data does. */
function fxCandidates(data) {
  return data.teamSeasons
    .filter(t => t.rating >= FX.MIN_RATING && t.rating <= FX.MAX_RATING
      && !E.wonTitle(t.team, t.season) && startingFive(data, t.team_season_id))
    .map(t => t.team_season_id)
    .sort();
}

/* Today's team. */
function fxDaily(data, day) {
  const list = fxCandidates(data);
  const order = dailyOrder(list.length, 'fix');
  const ts = list[order[((day % list.length) + list.length) % list.length]];
  return { day, ts, five: startingFive(data, ts) };
}

/* THE TITLE ODDS OF A FIVE, on the day's seeds. Deterministic: the same five
   on the same day is the same number on every device, which is what lets a
   leaderboard rank it. */
function fxOdds(data, five, day, sims) {
  const n = sims || FX.SIMS;
  const r = fxOddsStep(data, five, day, 0, n);
  return { odds: r.titles / n, wins: r.wins / n, sims: n };
}

/* Seasons [from, to) of the same count, so a screen can play the thousand a
   slice at a time and show the odds settling. It is the whole of fxOdds, not
   a copy of it: the seeds are addressed by index, so any split of the range
   adds up to the same answer. */
function fxOddsStep(data, five, day, from, to) {
  let titles = 0, wins = 0;
  const rows = five.map((p, i) => ({ ...p, _slot: E.SLOTS[i] }));
  for (let i = from; i < to; i++) {
    const run = E.playRun(rows, rngFor('fix:' + day, 'odds:' + i), E.SLOTS, data.oppPool);
    if (run.titleWon) titles++;
    wins += run.record.wins;
  }
  return { titles, wins };
}

/* The season as it is replayed for the story. */
function fxReplay(data, five, day) {
  const rows = five.map((p, i) => ({ ...p, _slot: E.SLOTS[i] }));
  return E.playRun(rows, rngFor('fix:' + day, 'replay'), E.SLOTS, data.oppPool);
}

/* THE SALARY RULE, one function so the finder, the refusal and the guard
   cannot disagree about it: each side takes back no more than 125% of what it
   sends, plus $0.1M. */
const TRADE = { MATCH: 1.25, SLACK: 0.1, MAX: 2 };
function salaryOk(outSal, inSal) {
  return inSal <= outSal * TRADE.MATCH + TRADE.SLACK + 1e-9
    && outSal <= inSal * TRADE.MATCH + TRADE.SLACK + 1e-9;
}
const sumPrice = (rows) => rows.reduce((s, p) => s + p.p, 0);

/* A club's roster that season, dearest first. */
function fxRoster(data, tsId) {
  return [...(data.byTeamSeason[tsId] || [])].sort((a, b) => b.p - a.p || b.mp - a.mp);
}

/* WHETHER SOME FIVE OF THESE MEN CAN COVER PG, SG, SF, PF AND C, one man a
   slot. A bipartite match, which is exact and cheap, so the finder can ask it
   of every offer without choosing a lineup it would then have to hide. */
function canCover(rows) {
  const owner = {};           // slot index -> row index
  const tryRow = (r, seen) => {
    for (let s = 0; s < E.SLOTS.length; s++) {
      if (seen[s] || !E.canFillSlot(rows[r], E.SLOTS[s])) continue;
      seen[s] = true;
      if (owner[s] === undefined || tryRow(owner[s], seen)) { owner[s] = r; return true; }
    }
    return false;
  };
  let filled = 0;
  for (let r = 0; r < rows.length && filled < E.SLOTS.length; r++) {
    if (tryRow(r, {})) filled++;
  }
  return filled === E.SLOTS.length;
}

/* The best five of any roster, by the rule the daily five was chosen with:
   the best five of the top `depth` men by win shares who can cover the
   positions. The daily five looks nine deep and must stay that way, or the
   calendar of teams would move. */
function fiveOf(rows, depth) {
  const nine = [...rows].sort((a, b) => b.w - a.w).slice(0, depth || FX.POOL_DEPTH);
  let best = null, bestW = -1;
  const n = nine.length;
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) for (let c = b + 1; c < n; c++)
    for (let d = c + 1; d < n; d++) for (let e = d + 1; e < n; e++) {
      const five = [nine[a], nine[b], nine[c], nine[d], nine[e]];
      const w = five.reduce((s, p) => s + p.w, 0);
      if (w <= bestW) continue;
      if (new Set(five.map(p => p.i)).size < 5) continue;
      const slotted = slotFive(five);
      if (slotted) { best = slotted; bestW = w; }
    }
  return best;
}

const seasonOfTs = (tsId) => Number(String(tsId).slice(-4));

// ─── Fix History, a season of trade windows ────────────────────────────────

/* FOUR WINDOWS, NOT ONE TRADE. Asked for in as many words: three or four
 * chances up to the deadline. The season is played between them, so a trade
 * made in preseason plays all 82 and one made at the deadline plays the last
 * 27 and the playoffs. `at` is the number of games already played when the
 * window opens. The NBA's deadline falls around game 55.
 *
 * ONE OFFER PER CLUB, IF ANY. Every club that is calling this window makes
 * the single best fair offer it can for your package: by MARKET PRICE it
 * sends no more than it receives, the salaries match both ways, and both
 * rosters can still field a five. Which clubs call is drawn off the day and
 * the window, never off the package, so reshaping a package cannot reshuffle
 * who is on the phone.
 *
 * PICKS ARE VALUE WITHOUT SALARY. A club counts a pick at market value and it
 * carries no salary, so adding one lets you take back more than you send, up
 * to the 125% the salary rule allows. That is what a pick is for in a real
 * deadline deal. This game is one season, so a pick is worth nothing to YOU
 * except what it buys, and you have five to spend across four windows. */
const FX_WINDOWS = [
  { at: 0,  name: 'Preseason',      short: 'Preseason' },
  { at: 20, name: 'Game 20',        short: 'Game 20' },
  { at: 40, name: 'Game 40',        short: 'Game 40' },
  { at: 55, name: 'Trade deadline', short: 'Deadline' },
];
Object.assign(TRADE, {
  MAX_OUT: 3,           // your package, players
  MAX_IN: 3,            // theirs
  ROSTER_MAX: 15,
  PICK1: 7,             // market value of a first-round pick, $M
  PICK2: 2,             // and a second
  BODY: 1,              // a club's offer pays this per extra man it sends, so it prefers fewer
  INTEREST: 0.7,        // share of clubs on the phone in a window
});

/* THE FRANCHISE PLAYER IS NOT FOR SALE. Market price is points, so without
   this a club gives up its star for anything that adds up to his salary, and
   the first probe traded Pierce and Garnett for LeBron's 2009 and Booker for
   Durant's 2021. A club's dearest man is untouchable, which is what a real
   club's answer to that phone call is. */
function untouchable(data, tsId) {
  const r = fxRoster(data, tsId);
  return r.length ? E.pkey(r[0]) : null;
}

/* A club's picks: its own firsts for the next three drafts and its seconds
   for the next two. There is no record of who owned what in 1987, so every
   club owns its own, which is the default the league starts from. */
function fxPicks(tsId) {
  const s = seasonOfTs(tsId), out = [];
  for (let y = 1; y <= 3; y++) out.push('R1Y' + (s + y));
  for (let y = 1; y <= 2; y++) out.push('R2Y' + (s + y));
  return out;
}
const pickValue = (id) => (/^R1/.test(id) ? TRADE.PICK1 : TRADE.PICK2);
const pickOk = (id) => /^R[12]Y[0-9]{4}$/.test(String(id));

function fxSeasonCreate(data, day) {
  const f = fxDaily(data, day);
  return { v: 2, day: f.day, ts: f.ts, win: 0, trades: [], done: false };
}

/* Your roster once every trade made at or before window k has gone through. */
function fxRosterAt(data, st, k) {
  let rows = fxRoster(data, st.ts);
  st.trades.filter(t => t.w <= k).forEach((t) => {
    const out = new Set(t.outs);
    rows = rows.filter(p => !out.has(E.pkey(p))).concat(t.ins.map(key => data.allPlayers[key]));
  });
  return rows;
}
function fxPicksLeft(st) {
  const gone = new Set();
  st.trades.forEach(t => (t.picks || []).forEach(id => gone.add(id)));
  return fxPicks(st.ts).filter(id => !gone.has(id));
}
function fxLineup(rows) { return fiveOf(rows) || fiveOf(rows, rows.length); }

function clubCalls(st, win, tsId) {
  return rngFor('fix:' + st.day, 'call:' + win + ':' + tsId)() < TRADE.INTEREST;
}

/* WHETHER A TRADE IS LEGAL in window `st.win`. null when it is, a reason when
   it is not. `outKeys` are players on your roster now, `picks` picks you still
   own, `withTs` a club from the same season, `inKeys` men on its roster. */
function fxDealRefusal(data, st, outKeys, picks, withTs, inKeys) {
  picks = picks || [];
  if (st.done || st.win >= FX_WINDOWS.length) return 'the deadline has passed';
  if (!Array.isArray(outKeys) || !outKeys.length) return 'put a player on the block';
  if (outKeys.length > TRADE.MAX_OUT) return 'three players at most';
  if (!Array.isArray(inKeys) || !inKeys.length || inKeys.length > TRADE.MAX_IN) return 'one to three players back';
  if (new Set(outKeys).size !== outKeys.length || new Set(inKeys).size !== inKeys.length) return 'the same man twice';
  if (!withTs || withTs === st.ts || seasonOfTs(withTs) !== seasonOfTs(st.ts)) return 'partners are other clubs from the same season';
  const mine = fxRosterAt(data, st, st.win), mineKeys = new Set(mine.map(p => E.pkey(p)));
  if (!outKeys.every(k => mineKeys.has(k))) return 'not on your roster';
  const left = new Set(fxPicksLeft(st));
  if (!picks.every(id => left.has(id)) || new Set(picks).size !== picks.length) return 'not a pick you own';
  const theirs = fxRoster(data, withTs), theirKeys = new Set(theirs.map(p => E.pkey(p)));
  if (!inKeys.every(k => theirKeys.has(k))) return 'not on their roster';
  if (inKeys.indexOf(untouchable(data, withTs)) >= 0) return 'their franchise player is not for sale';
  const ids = new Set(mine.map(p => p.i));
  const ins = inKeys.map(k => data.allPlayers[k]), outs = outKeys.map(k => data.allPlayers[k]);
  if (ins.some(p => ids.has(p.i))) return 'already on your team';
  const outSal = sumPrice(outs), inSal = sumPrice(ins);
  if (!salaryOk(outSal, inSal)) return 'the salaries do not match';
  const got = outSal + picks.reduce((s, id) => s + pickValue(id), 0);
  if (inSal > got + 1e-9) return 'they want more back';
  const after = mine.filter(p => outKeys.indexOf(E.pkey(p)) < 0).concat(ins);
  if (after.length > TRADE.ROSTER_MAX) return 'too many players';
  if (!canCover(after)) return 'leaves you nobody to play a position';
  const theirAfter = theirs.filter(p => inKeys.indexOf(E.pkey(p)) < 0).concat(outs);
  if (!canCover(theirAfter)) return 'leaves them nobody to play a position';
  return null;
}

/* THE PHONE: one offer from each club that is calling, for this package. A
   club sends the dearest package it can that is still fair to it, paying
   TRADE.BODY a man for every extra body so it prefers to send fewer. */
function fxCalls(data, st, outKeys, picks) {
  picks = picks || [];
  const season = seasonOfTs(st.ts), offers = [];
  if (!outKeys.length || st.done) return offers;
  const outs = outKeys.map(k => data.allPlayers[k]);
  const outSal = sumPrice(outs), got = outSal + picks.reduce((s, id) => s + pickValue(id), 0);
  const mine = fxRosterAt(data, st, st.win), ids = new Set(mine.map(p => p.i));
  const keep = mine.filter(p => outKeys.indexOf(E.pkey(p)) < 0);
  data.teamSeasons.forEach((t) => {
    const ts = t.team_season_id;
    if (t.season !== season || ts === st.ts || !clubCalls(st, st.win, ts) || fxHungUp(st, ts)) return;
    const star = untouchable(data, ts);
    const rows = fxRoster(data, ts).filter(p => !ids.has(p.i) && E.pkey(p) !== star);
    const theirs = fxRoster(data, ts);
    const cand = [];
    const n = rows.length;
    for (let a = 0; a < n; a++) {
      cand.push([rows[a]]);
      for (let b = a + 1; b < n; b++) {
        if (rows[b].i === rows[a].i) continue;
        cand.push([rows[a], rows[b]]);
        for (let c = b + 1; c < n; c++) {
          if (rows[c].i === rows[a].i || rows[c].i === rows[b].i) continue;
          cand.push([rows[a], rows[b], rows[c]]);
        }
      }
    }
    const scored = [];
    cand.forEach((ins) => {
      const inSal = sumPrice(ins);
      if (inSal > got + 1e-9 || !salaryOk(outSal, inSal)) return;
      if (keep.length + ins.length > TRADE.ROSTER_MAX) return;
      scored.push({ ins, inSal, score: inSal - TRADE.BODY * (ins.length - 1) });
    });
    scored.sort((x, y) => y.score - x.score || x.ins.length - y.ins.length);
    for (const c of scored) {
      if (!canCover(keep.concat(c.ins))) continue;
      const inKeys = c.ins.map(p => E.pkey(p));
      const theirAfter = theirs.filter(p => inKeys.indexOf(E.pkey(p)) < 0).concat(outs);
      if (!canCover(theirAfter)) continue;
      offers.push({ with: ts, ins: inKeys, sal: Math.round(c.inSal * 10) / 10 });
      break;
    }
  });
  return offers;
}

/* NEGOTIATING. An offer is the club's opening position, not the only deal
 * there is: you can ask for different men (never the franchise player) and
 * reshape your side, and the club answers each proposal.
 *
 * COUNTERING COSTS YOU. A club's offer is fair at market price; a proposal is
 * you asking for something, so proposal k wants TRADE.PREMIUM * k more value
 * than it gives. That is what makes a counter a decision rather than a free
 * menu: taking the offer is cheaper, and the men you actually want cost a
 * sweetener.
 *
 * TWO PROPOSALS A CLUB A WINDOW, then it hangs up for the window. A proposal
 * that breaks a rule (salaries, a side left without a five, too many men)
 * gets the reason and costs no patience, because that is the general manager
 * saying it does not work under the rules rather than saying no.
 *
 * WHEN IT IS SHORT, THE CLUB NAMES ITS PRICE: the single cheapest thing from
 * your side (a pick or a player) that would get it done. Deterministic, like
 * everything else here, so two people who make the same proposal hear the
 * same answer. */
Object.assign(TRADE, { PATIENCE: 2, PREMIUM: 0.05 });

function talksOf(st, withTs) {
  const w = String(st.win);
  st.talks = st.talks || {};
  st.talks[w] = st.talks[w] || {};
  return st.talks[w][withTs] || { tries: 0, hung: false };
}
function fxHungUp(st, withTs) { return !!talksOf(st, withTs).hung; }
function fxTriesLeft(st, withTs) { const t = talksOf(st, withTs); return t.hung ? 0 : TRADE.PATIENCE - t.tries; }

/* What a club wants back for sending `inKeys`, on proposal `attempt`. */
function fxAsking(data, inKeys, attempt) {
  return sumPrice(inKeys.map(k => data.allPlayers[k])) * (1 + TRADE.PREMIUM * attempt);
}

/* THE RULES WITHOUT THE PRICE: everything fxDealRefusal checks except whether
   the club gets enough back, which is what a proposal is haggling over. */
function fxRulesRefusal(data, st, outKeys, picks, withTs, inKeys) {
  const why = fxDealRefusal(data, st, outKeys, picks, withTs, inKeys);
  return why === 'they want more back' ? null : why;
}

function fxPropose(data, st, withTs, outKeys, picks, inKeys) {
  picks = picks || [];
  if (fxHungUp(st, withTs)) return { verdict: 'gone', reason: 'they hung up' };
  const illegal = fxRulesRefusal(data, st, outKeys, picks, withTs, inKeys);
  if (illegal) return { verdict: 'illegal', reason: illegal };
  const t = talksOf(st, withTs);
  const attempt = t.tries + 1;
  t.tries = attempt;
  st.talks[String(st.win)][withTs] = t;
  const need = fxAsking(data, inKeys, attempt);
  const value = (outs, pk) => sumPrice(outs.map(k => data.allPlayers[k])) + pk.reduce((s, id) => s + pickValue(id), 0);
  const got = value(outKeys, picks);
  if (got >= need - 1e-9) return { verdict: 'yes', attempt, need, got };
  // The cheapest single addition that closes it and keeps every rule.
  const mine = fxRosterAt(data, st, st.win);
  const adds = [];
  fxPicksLeft(st).filter(id => picks.indexOf(id) < 0)
    .forEach(id => adds.push({ kind: 'pick', key: id, v: pickValue(id), outs: outKeys, picks: picks.concat([id]) }));
  if (outKeys.length < TRADE.MAX_OUT) {
    mine.filter(p => outKeys.indexOf(E.pkey(p)) < 0).forEach(p =>
      adds.push({ kind: 'player', key: E.pkey(p), v: p.p, outs: outKeys.concat([E.pkey(p)]), picks }));
  }
  adds.sort((a, b) => a.v - b.v || (a.kind === 'pick' ? -1 : 1));
  for (const a of adds) {
    if (value(a.outs, a.picks) < need - 1e-9) continue;
    if (fxRulesRefusal(data, st, a.outs, a.picks, withTs, inKeys)) continue;
    return { verdict: 'counter', attempt, need, got, add: { kind: a.kind, key: a.key }, outs: a.outs, picks: a.picks };
  }
  if (attempt >= TRADE.PATIENCE) { t.hung = true; st.talks[String(st.win)][withTs] = t; }
  return { verdict: 'no', attempt, need, got, hung: !!t.hung };
}

function fxDeal(data, st, outKeys, picks, withTs, inKeys) {
  const why = fxDealRefusal(data, st, outKeys, picks, withTs, inKeys);
  if (why) throw new Error(why);
  st.trades.push({ w: st.win, with: withTs, outs: outKeys.slice(), picks: (picks || []).slice(), ins: inKeys.slice() });
  return st;
}
/* Close the window, with or without a deal. After the last one the season is
   done. */
function fxNextWindow(st) {
  st.win++;
  if (st.win >= FX_WINDOWS.length) st.done = true;
  return st;
}

/* THE LINEUP FOR EACH STRETCH OF THE SEASON: the five the coach starts from
   the roster as it stood when that window closed. Stretch k runs from window
   k's game to the next window's, and the last one runs to the end and the
   playoffs. A window not yet reached keeps the roster you have now. */
function fxStretches(data, st) {
  return FX_WINDOWS.map((w, k) => ({
    from: w.at,
    to: k + 1 < FX_WINDOWS.length ? FX_WINDOWS[k + 1].at : E.CONSTANTS.REGULAR_SEASON_GAMES,
    five: fxLineup(fxRosterAt(data, st, k)),
  }));
}

/* ONE SEASON PLAYED THROUGH THE STRETCHES. It draws from the rng in exactly
   the order playRun does (the schedule, then each game, then the playoffs),
   so a season with no trades is the season as built, draw for draw, and the
   games before a window never depend on anything decided at it. */
function fxPlayStretches(data, stretches, rng) {
  const rate = stretches.map((sg) => {
    const rows = sg.five.map((p, i) => ({ ...p, _slot: E.SLOTS[i] }));
    const chem = E.resolveChemistry(rows), fit = E.rosterFit(rows);
    return { ortg: E.rosterOffense(rows, chem.bonus, fit.bonus), drtg: E.rosterDefense(rows, chem.bonus) };
  });
  const schedule = E.generateSchedule(rng, E.CONSTANTS.REGULAR_SEASON_GAMES, data.oppPool);
  const games = [];
  let wins = 0;
  schedule.forEach((game, i) => {
    let k = 0;
    while (k + 1 < stretches.length && i >= stretches[k + 1].from) k++;
    const m = E.gameMeans(rate[k].ortg, rate[k].drtg, game);
    const r = E.resolveGame(m.pointsFor, m.pointsAgainst, rng, E.homeAdvantage(game));
    games.push(r.won);
    if (r.won) wins++;
  });
  const last = rate[rate.length - 1];
  const seed = E.seedFromRecord(wins);
  const rating = E.overallRating(E.teamWinPct(last.ortg, last.drtg));
  const playoffs = E.generatePlayoffs(seed, last.ortg, last.drtg, rng, wins, rating);
  return { games, wins, losses: games.length - wins, playoffs, titleWon: !!(playoffs && playoffs.won) };
}

/* The odds as the season stands, over seasons [from, to) of the day's seeds.
   Same seeds as fxOddsStep, so standing pat all season scores the odds as
   built exactly. */
function fxSeasonOddsStep(data, st, from, to) {
  const sg = fxStretches(data, st);
  let titles = 0, wins = 0;
  for (let i = from; i < to; i++) {
    const r = fxPlayStretches(data, sg, rngFor('fix:' + st.day, 'odds:' + i));
    if (r.titleWon) titles++;
    wins += r.wins;
  }
  return { titles, wins };
}
function fxSeasonReplay(data, st) {
  return fxPlayStretches(data, fxStretches(data, st), rngFor('fix:' + st.day, 'replay'));
}

/* The one-for-one move the first version filed, kept so a result saved by it
   still draws its five. */
function fxApply(five, slot, p) {
  const next = five.slice();
  next[slot] = p;
  return next;
}

// ─── Six Passes ────────────────────────────────────────────────────────────

/* GET THE BALL FROM ONE PLAYER TO ANOTHER, THROUGH REAL TEAMMATES.
 *
 * Two men from different eras. Every pass has to go to somebody the man with
 * the ball actually played with, on the same club in the same season. Fewest
 * passes wins, and par is the shortest chain that exists.
 *
 * TEAMMATE MEANS A ROW IN THE POOL, which is the men who cleared the playing
 * time floor. A man who played nine games for a club is not in the data and is
 * not a teammate here, and that is honest: this game only knows the men it
 * lets you draft.
 *
 * EVERY PASS IS FINAL. An undo turns it into a map to be searched at leisure,
 * and a bad pass in basketball is a turnover rather than a do-over. The shot
 * clock is the ceiling: PS.CLOCK passes and the possession is over.
 */
const PS = {
  CLOCK: 10,          // passes before the shot clock runs out
  PAR_MIN: 3,
  PAR_MAX: 5,
  STARS: 3,           // both ends are men with at least this many All-Star nods
  GAP: 20,            // and their careers start at least this many years apart
};

/* The teammate graph: for every player, the team-seasons he played and who
   was on them. Built once per page. */
function psGraph(data) {
  const clubs = {};                  // ts -> [player ids]
  const seasonsOf = {};              // id -> [ts]
  const nameOf = {};
  const span = {};
  const careerWs = {};
  const stars = {};
  for (const p of data.players) {
    if (p.aw && p.aw.includes('star')) stars[p.i] = (stars[p.i] || 0) + 1;
    if (p.t === 'TOT') continue;
    const ts = E.teamSeasonId(p.t, p.s);
    (clubs[ts] = clubs[ts] || []).push(p.i);
    (seasonsOf[p.i] = seasonsOf[p.i] || []).push(ts);
    nameOf[p.i] = p.n;
    const sp = span[p.i] || (span[p.i] = [p.s, p.s]);
    if (p.s < sp[0]) sp[0] = p.s;
    if (p.s > sp[1]) sp[1] = p.s;
    careerWs[p.i] = (careerWs[p.i] || 0) + p.w;
  }
  const adj = {};
  for (const id of Object.keys(seasonsOf)) {
    const set = new Set();
    for (const ts of seasonsOf[id]) for (const j of clubs[ts]) if (j !== id) set.add(j);
    adj[id] = [...set];
  }
  return { clubs, seasonsOf, nameOf, span, careerWs, stars, adj };
}

/* Shortest distance from `from` to every man it can reach. */
function psBfs(g, from) {
  const dist = { [from]: 0 };
  const q = [from];
  for (let h = 0; h < q.length; h++) {
    const u = q[h];
    for (const v of g.adj[u]) if (dist[v] == null) { dist[v] = dist[u] + 1; q.push(v); }
  }
  return dist;
}

/* One shortest chain, for the reveal after a finished puzzle. */
function psPath(g, from, to) {
  const prev = { [from]: null };
  const q = [from];
  for (let h = 0; h < q.length && !(to in prev); h++) {
    const u = q[h];
    for (const v of g.adj[u]) if (!(v in prev)) { prev[v] = u; q.push(v); }
  }
  if (!(to in prev)) return null;
  const path = [];
  for (let u = to; u != null; u = prev[u]) path.unshift(u);
  return path;
}

/* THE MEN A DAILY CAN NAME ARE ALL-STARS, several times over. The first
   version took the best careers by win shares and served Derrick McKey and
   Michael Cage, who were very good and whom nobody is going to recognise as
   the two ends of a puzzle. Three or more All-Star nods is 162 men, which is
   every name a fan expects and almost none they do not. */
function psFamous(g) {
  return Object.keys(g.stars).filter(i => g.stars[i] >= PS.STARS && g.adj[i]);
}

/* TODAY'S PUZZLE: two All-Stars far enough apart in time to need a chain, and
   a par between PAR_MIN and PAR_MAX. Tried in a fixed order off the day, so
   the answer is the same everywhere and never needs storing.

   THE GAP IS WHAT SETS THE PAR, measured over every pair of the 162: careers
   starting under ten years apart are par 2 nine times in ten, twenty to
   twenty-nine years apart are mostly par 3 with some 4s, and thirty or more
   are mostly 4 with a real share of 5s. A twenty year floor lands every day
   between 3 and 5, which is a chain long enough to need thinking about and
   short enough to fit inside six passes. */
function psDaily(g, day) {
  const famous = psFamous(g).sort();
  const rng = rngFor('passes:' + day, 'pick');
  for (let tries = 0; tries < 400; tries++) {
    const a = famous[Math.floor(rng() * famous.length)];
    const b = famous[Math.floor(rng() * famous.length)];
    if (a === b) continue;
    const gap = Math.abs(g.span[a][0] - g.span[b][0]);
    if (gap < PS.GAP) continue;
    const d = psBfs(g, a)[b];
    if (d == null || d < PS.PAR_MIN || d > PS.PAR_MAX) continue;
    /* The older man starts with the ball, so the chain runs forward in time,
       which is the direction a reader can reason about. */
    const [from, to] = g.span[a][0] <= g.span[b][0] ? [a, b] : [b, a];
    return { day, from, to, par: d };
  }
  return null;
}

/* The team-seasons two men shared, which is what a pass is printed with. */
function psShared(g, a, b) {
  const mine = new Set(g.seasonsOf[a] || []);
  return (g.seasonsOf[b] || []).filter(ts => mine.has(ts)).sort();
}

function psCanPass(g, a, b) { return a !== b && (g.adj[a] || []).includes(b); }

// ─── API ───────────────────────────────────────────────────────────────────

const publicAPI = {
  API_VERSION: MODES_API_VERSION,
  strengthOf, bestFive, meansOf, winChance, phi,
  CQ, cqAim, cqLadder, cqChallenger, cqCrew, cqCreate, cqRoster, cqStrength,
  cqDraftCards, cqDraftPick, CQ_CARDS,
  cqPreview, cqIsBoss, cqPlay, cqSteals, cqSteal, cqStreak, cqOver, cqCleared,
  DAILY_EPOCH, dayNumberOf, dailyOrder,
  FX, TRADE, salaryOk, slotFive, startingFive, fiveOf, canCover, fxCandidates, fxDaily, fxOdds, fxOddsStep, fxReplay,
  fxRoster, fxApply,
  FX_WINDOWS, fxPicks, pickValue, pickOk, fxSeasonCreate, fxRosterAt, fxPicksLeft, fxLineup, clubCalls,
  untouchable, fxDealRefusal, fxCalls, fxPropose, fxAsking, fxRulesRefusal, fxHungUp, fxTriesLeft, fxDeal, fxNextWindow, fxStretches, fxPlayStretches, fxSeasonOddsStep, fxSeasonReplay,
  PS, psGraph, psBfs, psPath, psFamous, psDaily, psShared, psCanPass,
};

if (typeof module !== 'undefined' && module.exports) module.exports = publicAPI;
if (typeof window !== 'undefined') window.RTF_MODES = publicAPI;
})();
