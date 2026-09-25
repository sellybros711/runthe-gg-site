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

const MODES_API_VERSION = 1;
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

function cqCreate(data, seed) {
  const s = String(seed);
  return {
    v: 1,
    seed: s,
    roster: cqCrew(data, s),        // pkeys, in E.SLOTS order
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
  if (state.lost || state.pending) throw new Error('not ready to play');
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

/* ONE REAL TEAM THAT FELL SHORT, AND ONE MOVE.
 *
 * Every day the same club for everybody: a good team that did not win it. You
 * trade one of its five for anybody in history who costs no more, and the
 * season is played again.
 *
 * THE SCORE IS THE TITLE ODDS, NOT THE REPLAY. One replayed season is a coin
 * with a ring on one side, so two people who made the same move would land on
 * a leaderboard hundreds of places apart on the dice. The odds are the share of
 * FX.SIMS seasons the new five win, and the seeds are the day's, so the same
 * five always score the same number for everybody. The replay is the story: it
 * is played once, off the day's seed, and it is what the results screen shows.
 *
 * THE MOVE IS SALARY MATCHED. The new man may cost no more than the man he
 * replaces, which is the rule a real trade lives under and what stops the
 * answer being "swap anybody for 1996 Jordan". Price in this game is what the
 * market pays for points, and value is win shares, so the good moves are the
 * men the market underpaid: the rebounders, the defenders, the guy who made
 * everybody else better. That is fan knowledge, and that is the puzzle.
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
  const nine = [...(data.byTeamSeason[tsId] || [])].sort((a, b) => b.w - a.w)
    .slice(0, FX.POOL_DEPTH);
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

/* WHETHER A MOVE IS LEGAL: `inKey` replaces the man in slot `slot`, costs no
   more than him, can play the slot, is a real club's row rather than a
   traded-player total, and is not already one of the other four in some other
   season. Returns null when legal and a reason when not, because the page
   prints the reason. */
function fxRefusal(data, five, slot, inKey) {
  const p = data.allPlayers[inKey];
  if (!p || p.t === 'TOT') return 'not a player';
  const out = five[slot];
  if (!out) return 'no such slot';
  if (p.i === out.i && p.s === out.s && p.t === out.t) return 'that is the man you are trading';
  if (!E.canFillSlot(p, E.SLOTS[slot])) return 'cannot play ' + E.SLOTS[slot];
  if (p.p > out.p + 1e-9) return 'costs more than ' + E.lastNameOf(out.n);
  if (five.some((q, i) => i !== slot && q.i === p.i)) return 'already on this team';
  return null;
}

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
  cqPreview, cqIsBoss, cqPlay, cqSteals, cqSteal, cqStreak, cqOver, cqCleared,
  DAILY_EPOCH, dayNumberOf, dailyOrder,
  FX, slotFive, startingFive, fxCandidates, fxDaily, fxOdds, fxOddsStep, fxReplay, fxRefusal, fxApply,
  PS, psGraph, psBfs, psPath, psFamous, psDaily, psShared, psCanPass,
};

if (typeof module !== 'undefined' && module.exports) module.exports = publicAPI;
if (typeof window !== 'undefined') window.RTF_MODES = publicAPI;
})();
