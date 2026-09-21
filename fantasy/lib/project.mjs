/* A market becomes a projection, and two projections become an answer.
 *
 * This is the join between everything else: devig.mjs removes the margin,
 * dist.mjs recovers a shape from a line, copula.mjs correlates the draws, and
 * scoring.mjs turns a draw into points. Here they are assembled into the thing
 * Start/Sit actually shows.
 *
 *
 * THE OUTPUT IS A PROBABILITY, WHICH IS THE WHOLE POINT
 * ---------------------------------------------------------------------------
 * "Chase outscores Nabers 61 percent of the time, expected margin 2.8 points."
 * A rank says one is better. A probability says how much better, and a margin
 * says whether it is worth caring about. Two players with identical medians
 * and different spreads are the most important thing this tool can show, and
 * they are invisible to anything that compares point estimates.
 *
 * That answer cannot be computed from two separate projections. It needs the
 * two players simulated TOGETHER, in the same draws, with their correlation
 * applied. So the unit of work here is a comparison, not a player.
 *
 *
 * NO PROPS MEANS NO PROJECTION, AND IT IS STRUCTURAL
 * ---------------------------------------------------------------------------
 * The brief's strongest instruction. A player with no posted market gets no
 * number, and the absence is reported rather than filled in with a season
 * average that would sit in the same table looking identical.
 *
 * projectPlayer returns null. Not a zero, not a guess, not a flag on an
 * otherwise complete object. fantasy_projections has a CHECK refusing a row
 * that claims zero contributing markets, so the database agrees. There is no
 * code path that can produce a fabricated projection, which is a stronger
 * statement than nobody having written one yet.
 */
import { devigTwoWay, DEVIG_DEFAULT } from './devig.mjs';
import {
  fitGammaToTail, fitNegBinToTail, tdLambdaFromAnytime,
  gammaCdf, negBinPmf, rng, normalSampler, summarize,
  PLACEHOLDER_CV, PLACEHOLDER_DISPERSION,
} from './dist.mjs';
import { pointsFor, profile } from './scoring.mjs';
import { safeCholesky, correlatedUniforms, invGammaCdf, invDiscreteCdf } from './copula.mjs';

/* Which market feeds which stat. The keys are the provider's market names and
 * the values are the fields scoring.mjs knows, so a market added later is one
 * line here rather than a change in three files. */
export const MARKET_STAT = {
  player_pass_yds: 'passYd',
  player_pass_tds: 'passTd',
  player_rush_yds: 'rushYd',
  player_receptions: 'rec',
  player_reception_yds: 'recYd',
  player_anytime_td: 'anyTd',
};

/* ---------------------------------------------------------------------------
 * PLACEHOLDER CORRELATIONS
 * ------------------------------------------------------------------------ */

/* NAMED LOUDLY BECAUSE THEY ARE GUESSES. Every number below was written at a
 * keyboard, and the brief is explicit that anything not estimated in house is
 * folklore. They exist so the pipeline runs end to end before the cold path
 * does, and they are structured exactly as the real thing will be so swapping
 * them in is a data change rather than a rewrite.
 *
 * Replace with fantasy_priors rows of kind 'correlation', measured from our
 * own play by play. Until then, every number this produces carries the
 * `placeholderCorrelation: true` flag through to the caller, and the screen is
 * expected to say so. */
export const PLACEHOLDER_CORR = {
  /* Within one player, between his own markets. A receiver who goes over on
     yards almost always went over on catches. */
  withinPlayer: {
    'recYd|rec': 0.75,
    'recYd|anyTd': 0.45,
    'rec|anyTd': 0.35,
    'rushYd|anyTd': 0.50,
    'rushYd|rec': 0.10,
    'passYd|passTd': 0.55,
    'passYd|anyTd': 0.10,
  },
  /* Between two players. Same game lifts both, because a shootout is a
     shootout. Same team is stronger still for a passer and his target and
     WEAKER between two targets, who compete for the same throws. */
  sameTeamPasserTarget: 0.45,
  sameTeamTargets: -0.10,
  sameGameOpponents: 0.15,
  differentGame: 0.0,
};

/* ---------------------------------------------------------------------------
 * One player
 * ------------------------------------------------------------------------ */

/* Turn a player's posted markets into fitted marginals.
 *
 * `markets` is what the poller collected, already grouped:
 *   [{ market, line, overPrice, underPrice }, ...]
 *
 * Several books quote the same market. They are consensused by taking the
 * MEDIAN fair probability across books rather than the mean, because one book
 * with a stale line is a common event and a median ignores it while a mean
 * does not. The disagreement is kept and returned rather than averaged away,
 * because the brief wants it shown as a confidence indicator.
 */
export function fitPlayerMarkets(markets, {
  devigMethod = DEVIG_DEFAULT,
  cv = PLACEHOLDER_CV,
  dispersion = PLACEHOLDER_DISPERSION,
} = {}) {
  const byMarket = new Map();
  for (const m of markets) {
    if (!MARKET_STAT[m.market]) continue;          // a market we do not score
    if (!byMarket.has(m.market)) byMarket.set(m.market, []);
    byMarket.get(m.market).push(m);
  }

  const fits = {};
  const consensus = {};
  for (const [marketKey, quotes] of byMarket) {
    const fair = [];
    for (const q of quotes) {
      try {
        fair.push({ over: devigTwoWay(q.overPrice, q.underPrice, devigMethod).over, line: q.line });
      } catch (e) { /* a malformed price costs its own quote and nothing else */ }
    }
    if (!fair.length) continue;

    /* Median over, and the median LINE with it. Books sometimes quote
       different lines for the same player, and averaging a 61.5 with a 75.5
       would produce a line neither book posted. */
    const overs = fair.map((f) => f.over).sort((a, b) => a - b);
    const lines = fair.map((f) => f.line).sort((a, b) => a - b);
    const mid = (arr) => (arr.length % 2
      ? arr[(arr.length - 1) / 2]
      : (arr[arr.length / 2 - 1] + arr[arr.length / 2]) / 2);
    const over = mid(overs);
    const line = lines[0] === null ? null : mid(lines);

    consensus[marketKey] = {
      over,
      line,
      books: fair.length,
      /* How far apart the books are, in probability. Two books 0.01 apart and
         five books 0.09 apart are different situations and the screen should
         say which. */
      spread: overs.length > 1 ? overs[overs.length - 1] - overs[0] : 0,
    };

    const stat = MARKET_STAT[marketKey];
    try {
      if (stat === 'anyTd') {
        fits[stat] = { kind: 'poisson', lambda: tdLambdaFromAnytime(over) };
      } else if (stat === 'rec') {
        fits[stat] = fitNegBinToTail(line, over, dispersion.player_receptions);
      } else if (stat === 'passTd') {
        /* Passing touchdowns are a count with a half line, same shape as
           receptions and a tighter dispersion because a quarterback's
           opportunity is far more stable than a receiver's. */
        fits[stat] = fitNegBinToTail(line, over, dispersion.player_pass_tds ?? 8);
      } else {
        const c = cv[marketKey];
        if (!c) continue;                          // no prior, so no fit
        fits[stat] = fitGammaToTail(line, over, c);
      }
    } catch (e) {
      /* A fit that will not converge is a market we cannot use. Dropped from
         the fits, kept in consensus, so the caller can still show the line. */
    }
  }

  return { fits, consensus, marketCount: Object.keys(fits).length };
}

/* THE NO-PROPS ANSWER IS null, and every caller has to deal with it. */
export function projectPlayer(player, opts = {}) {
  const { fits, consensus, marketCount } = fitPlayerMarkets(player.markets || [], opts);
  if (!marketCount) return null;
  return {
    playerId: player.playerId,
    name: player.name,
    position: player.position || null,
    team: player.team || null,
    eventId: player.eventId || null,
    fits,
    consensus,
    marketCount,
    devigMethod: opts.devigMethod || DEVIG_DEFAULT,
  };
}

/* ---------------------------------------------------------------------------
 * The correlation matrix for a set of players
 * ------------------------------------------------------------------------ */

/* One row per (player, stat), because that is the level the draws happen at.
 * Two players with three markets each is a six by six matrix. */
export function buildIndex(projections) {
  const idx = [];
  for (const p of projections) {
    for (const stat of Object.keys(p.fits)) idx.push({ playerId: p.playerId, stat, proj: p });
  }
  return idx;
}

/* THE KEYS ARE NORMALISED AT LOOKUP TIME, and the first version was not.
 *
 * withinPlayer is written by hand with keys like 'recYd|rec', and the lookup
 * sorted the pair before joining, which produces 'rec|recYd'. Those do not
 * match, so every within-player correlation silently fell through to zero: a
 * receiver's yards and his catches were treated as independent, which is
 * nonsense and which nothing about the output would have revealed. Every
 * player's own distribution stays correct, every probability comes out
 * plausible, and the joint structure inside a player is simply absent.
 *
 * Fixed by normalising the TABLE rather than by sorting the hand written keys,
 * because the next person to add a pair will write it in whichever order reads
 * naturally and should not have to know. */
function normalisePairs(table) {
  const out = {};
  for (const [k, v] of Object.entries(table || {})) {
    out[k.split('|').sort().join('|')] = v;
  }
  return out;
}

export function buildCorrelation(index, corr = PLACEHOLDER_CORR) {
  const n = index.length;
  const M = Array.from({ length: n }, (_, i) => Array.from({ length: n },
    (_, j) => (i === j ? 1 : 0)));

  const within = normalisePairs(corr.withinPlayer);
  const pairKey = (a, b) => [a, b].sort().join('|');

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const A = index[i], B = index[j];
      let r;
      if (A.playerId === B.playerId) {
        r = within[pairKey(A.stat, B.stat)] ?? 0;
      } else {
        const sameTeam = A.proj.team && A.proj.team === B.proj.team;
        const sameGame = A.proj.eventId && A.proj.eventId === B.proj.eventId;
        if (sameTeam) {
          const passer = A.proj.position === 'QB' || B.proj.position === 'QB';
          r = passer ? corr.sameTeamPasserTarget : corr.sameTeamTargets;
        } else if (sameGame) {
          r = corr.sameGameOpponents;
        } else {
          r = corr.differentGame;
        }
      }
      M[i][j] = r;
      M[j][i] = r;
    }
  }
  return M;
}

/* ---------------------------------------------------------------------------
 * Simulating a set of players together
 * ------------------------------------------------------------------------ */

/* SEEDED, because a projection that moves when you refresh is a projection
 * nobody trusts twice. The seed is derived from the week and the players, so
 * the same comparison always gives the same answer and a different one gives a
 * different set of draws. */
export function seedFor(parts) {
  let h = 2166136261;
  for (const s of parts) {
    const str = String(s);
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
  }
  return h >>> 0;
}

export function simulateTogether(projections, {
  n = 10000, scoring = 'ppr', corr = PLACEHOLDER_CORR, seed = null,
} = {}) {
  if (!projections.length) throw new Error('simulateTogether: no projections');
  const prof = profile(scoring);
  const index = buildIndex(projections);
  const M = buildCorrelation(index, corr);
  const { L, shrink } = safeCholesky(M);

  const next = rng(seed ?? seedFor([scoring, n, ...projections.map((p) => p.playerId)]));
  const normal = normalSampler(next);

  const draws = new Map(projections.map((p) => [p.playerId, new Array(n)]));

  for (let d = 0; d < n; d++) {
    const u = correlatedUniforms(L, normal);
    /* One stat line per player for this draw, so scoring sees a coherent game
       rather than a stat assembled from different universes. */
    const lines = new Map(projections.map((p) => [p.playerId, {}]));
    for (let i = 0; i < index.length; i++) {
      const { playerId, stat, proj } = index[i];
      const fit = proj.fits[stat];
      let v;
      if (fit.kind === 'gamma') {
        v = invGammaCdf(u[i], fit.shape, fit.scale, gammaCdf);
      } else if (fit.kind === 'negbin') {
        v = invDiscreteCdf(u[i], (k) => negBinPmf(k, fit.mean, fit.r));
      } else if (fit.kind === 'poisson') {
        const lam = fit.lambda;
        v = invDiscreteCdf(u[i], (k) => Math.exp(-lam + k * Math.log(lam)
          - lgammaInt(k + 1)));
      } else {
        throw new Error(`simulateTogether: unknown fit kind ${fit.kind}`);
      }
      lines.get(playerId)[stat] = v;
    }
    for (const p of projections) {
      draws.get(p.playerId)[d] = pointsFor(toStatLine(lines.get(p.playerId)), prof, p.position);
    }
  }

  const out = new Map();
  for (const p of projections) {
    out.set(p.playerId, { draws: draws.get(p.playerId), summary: summarize(draws.get(p.playerId)) });
  }
  return { players: out, shrink, n, scoring, placeholderCorrelation: corr === PLACEHOLDER_CORR };
}

/* An anytime touchdown is scored as a touchdown of whichever kind the player
 * gets. A receiver's goes to recTd, a back's and a quarterback's rushing one
 * to rushTd; both are worth six, so the split only matters if a profile ever
 * scores them differently. Kept as a named step rather than assigned inline so
 * that the day somebody writes such a profile there is one place to fix. */
function toStatLine(raw) {
  const out = { ...raw };
  if (out.anyTd != null) {
    out.recTd = out.anyTd;
    delete out.anyTd;
  }
  return out;
}

/* log(k!) for small integer k, by direct product. Used only by the Poisson
 * inverse, where k never exceeds a handful. */
function lgammaInt(k) {
  let s = 0;
  for (let i = 2; i < k; i++) s += Math.log(i);
  return s;
}

/* ---------------------------------------------------------------------------
 * The answer
 * ------------------------------------------------------------------------ */

/* A pairwise comparison, which is what Start/Sit puts on the screen.
 *
 * TIES ARE SPLIT, not awarded to either side. Fantasy points land on tenths,
 * so exact ties happen: with standard scoring and no receptions they happen
 * often. Awarding them to whoever is checked first would put a thumb on the
 * scale in whichever direction the caller happened to order the arguments. */
export function compare(a, b, drawsA, drawsB) {
  if (drawsA.length !== drawsB.length) throw new Error('compare: samples differ in length');
  const n = drawsA.length;
  let win = 0, tie = 0, sum = 0;
  for (let i = 0; i < n; i++) {
    const d = drawsA[i] - drawsB[i];
    sum += d;
    if (d > 0) win++;
    else if (d === 0) tie++;
  }
  const p = (win + tie / 2) / n;
  return {
    a, b,
    pAWins: p,
    pBWins: 1 - p,
    expectedMargin: sum / n,
    ties: tie / n,
    /* The margin at the middle and the edges, because "2.8 on average" hides
       whether the call is close or whether one of them has a much wider range
       of outcomes. */
    n,
  };
}

/* Every player against every other, plus the probability each finishes highest,
 * which is the number the brief asks for by name and which is NOT derivable
 * from the pairwise probabilities. */
export function rank(sim) {
  const ids = [...sim.players.keys()];
  const n = sim.n;
  const highest = new Map(ids.map((id) => [id, 0]));

  for (let d = 0; d < n; d++) {
    let best = -Infinity;
    let winners = [];
    for (const id of ids) {
      const v = sim.players.get(id).draws[d];
      if (v > best) { best = v; winners = [id]; }
      else if (v === best) winners.push(id);
    }
    /* A tie at the top is split, for the reason compare() splits one. */
    for (const w of winners) highest.set(w, highest.get(w) + 1 / winners.length);
  }

  const pairs = [];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      pairs.push(compare(ids[i], ids[j],
        sim.players.get(ids[i]).draws, sim.players.get(ids[j]).draws));
    }
  }

  return {
    pHighest: new Map(ids.map((id) => [id, highest.get(id) / n])),
    pairs,
  };
}
