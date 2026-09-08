/*
 * check-badges.mjs - every Dynasty and Full Team badge is reachable, proved by playing.
 *
 *   node football/check-badges.mjs             the full sweep
 *   node football/check-badges.mjs --quick     fewer runs, for a fast loop
 *
 * WHY THIS EXISTS
 * ---------------
 * The basketball game shipped a badge catalog asking for three things that game could not
 * produce: six decorated players on one roster, a chemistry bonus of +2, missing the playoffs
 * at a rating of 80. NOTHING FAILED. The cabinet rendered, the squares stayed dark, and the
 * only symptom was three achievements nobody would ever earn. A badge is decoration, so a
 * badge that cannot be earned breaks no test, throws no error, and can sit there for a year.
 *
 * So this plays the mode for real, through run.js in the order the screens drive it, turns
 * each finished season into the board row the page would submit, and asks the catalog what
 * lights up. A badge nothing lights is reported by name.
 *
 * WHAT A FAILURE HERE MEANS, AND WHAT IT DOES NOT
 * -----------------------------------------------
 * An unreachable badge is EITHER a badge asking for something the mode cannot do, OR a gap in
 * this checker: no strategy here was trying to do that thing. Those are opposite problems and
 * the fix for the second is never to loosen the badge. Basketball hit exactly this: two
 * badges looked unreachable and were not, because no strategy in the check was chasing
 * chemistry or building under the cap. The fix was to add the strategies a player would use.
 *
 * Anything this reports as UNREACHED is therefore a question to answer, not a number to move.
 * The GRIND and SKILL lists below are the only exceptions, and neither is a free pass: each
 * entry names another badge that must actually light on this run, so an excuse collapses the
 * moment the thing it rests on stops being true.
 *
 * It has already earned its keep twice. Full Team's "rated 90 or better" was impossible,
 * because a full squad's rating is clamped to 100 and averaged across two units where a six
 * man offense is unclamped and already past 110: the threshold had been read off the wrong
 * ladder, and 350 simulated squads peaked at 54.9. And a title on top of a self chosen game
 * plan stacked two rare things, since choosing the plan means declining the coach.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const E = require(path.join(here, 'engine.js'));
const R = require(path.join(here, 'run.js'));

/* THE CATALOG IS BUILT AT REQUIRE TIME AND THE TWO MODES ARE GATED ON THEIR LIVE FLAGS, so
   these are set before achievements.js is loaded or it builds the shipped catalog, which
   today has neither shelf in it and this file would check nothing at all and pass. */
globalThis.PS_DYNASTY_ACCESS = { LIVE: true };
globalThis.PS_FULLTEAM_ACCESS = { LIVE: true };
const ACH = require(path.join(here, 'achievements.js'));

const QUICK = process.argv.includes('--quick');
const load = (f) => JSON.parse(fs.readFileSync(path.join(here, 'data', f), 'utf8'));
const players = load('player_seasons.json');
const teamSeasons = load('team_seasons.json');
const leagueContext = load('league_context.json').league_avg_pts_allowed_by_season;
const ctx = {
  battery: load('battery.json'), coaches: load('coaches.json'), curated: load('curated.json'),
  teamSeasons,
  coachColleges: (() => { try { return load('coach_colleges.json'); } catch (_) { return {}; } })(),
};
const DATA = R.indexData(players, teamSeasons);
/* THE DEFENDERS ARE A SECOND POOL AND A SECOND INDEX, exactly as the page keeps them. A Full
   Team draft fills twelve slots off whichever pool the NEXT OPEN SLOT belongs to, so a
   harness holding only the offense signs nobody and every Full Team badge reads as
   unreachable: the mode is fine and the check was blind. The page hit this same thing from
   the other end, where a cabinet derived before the defenders had loaded resolved every
   defense roster to nothing. */
const defenders = load('defender_seasons.json');
const DDATA = R.indexData(defenders, teamSeasons);
const DEF_SLOTS = new Set(['DL', 'LB', 'DB']);
const byKey = new Map();
for (const p of players) byKey.set(`${p.player_id}|${p.season}`, p);
for (const p of defenders) byKey.set(`${p.player_id}|${p.season}`, p);
const lastSeason = Math.max(...players.map((p) => p.season));

/* The page's own resolve, so a pick key means here exactly what it means there. */
const resolve = (k) => {
  const i = String(k).lastIndexOf(':');
  return byKey.get(String(k).slice(0, i) + '|' + String(k).slice(i + 1)) || null;
};
const pairLinks = (a, b, sameClub) => {
  try { return E.pairLinks(a, b, ctx, sameClub ? { sameClub: true } : undefined); }
  catch (_) { return []; }
};

/* ---------------- drafting, the several ways a person does it ----------------
   ONE OF THESE PER THING THE BADGES ASK ABOUT. A single bot chasing wins never spends under
   $75M and never carries a roster of kids, so a catalog checked against it alone would call
   both of those unreachable and both would be wrong. */
const STRATS = {
  /* Most production the budget can carry, leaving a workable share per open slot.
     THE FLOOR SCALES WITH THE SQUAD. Six offensive slots can be filled cheaply at the end, so
     $4M a man held back is enough; twelve slots across two pools cannot, and a $4M floor let
     this spend the cap on the first four men and then strand the draft with defenders it
     could not afford. Unlike a dynasty there is no taking the field short in Full Team, so a
     stranded draft is a run that never happens at all. */
  stars: (men, r) => {
    const left = r.slots.length - r.roster.length;
    const floor = r.full ? 10 : 4;
    const budget = Math.max(floor, R.remaining(r) - floor * (left - 1));
    const ok = men.filter((p) => p.price_musd <= budget);
    return (ok.length ? ok : men).slice().sort((a, b) => b.ppr_ppg_mean - a.ppr_ppg_mean)[0];
  },
  /* An even spread, which is what keeps a dynasty affordable as everybody ages. */
  spread: (men, r) => {
    const share = R.remaining(r) / Math.max(1, r.slots.length - r.roster.length) * 1.6;
    const ok = men.filter((p) => p.price_musd <= share);
    return (ok.length ? ok : men).slice().sort((a, b) => b.ppr_ppg_mean - a.ppr_ppg_mean)[0];
  },
  /* DELIBERATELY CHEAP, for the badges about a small payroll. Nobody would call this the
     best way to play and that is not what it is here for. */
  frugal: (men, r) => {
    const cap = Math.max(3, R.remaining(r) * 0.14);
    const ok = men.filter((p) => p.price_musd <= cap);
    return (ok.length ? ok : men).slice().sort((a, b) => b.ppr_ppg_mean - a.ppr_ppg_mean)[0];
  },
  /* Points per dollar, which builds a different roster again. */
  value: (men) => men.slice().sort((a, b) =>
    (b.ppr_ppg_mean / Math.max(2, b.price_musd)) - (a.ppr_ppg_mean / Math.max(2, a.price_musd)))[0],
};

/* Which pool the next signing comes out of. Only a Full Team run ever changes pools mid
   draft, and it changes on the slot rather than on the run: see poolFor() in the page. */
function poolFor(run) {
  if (!run.full) return DATA;
  const open = R.openSlotNames(run) || [];
  return DEF_SLOTS.has(open[0]) ? DDATA : DATA;
}
function draftHoles(run, pick) {
  let guard = 0;
  while (run.roster.length < run.slots.length && guard++ < 240) {
    const pool = poolFor(run);
    let draw;
    try { draw = R.spin(run, pool); } catch (_) { return; }
    const men = R.affordableFrom(run, draw.team_season_id, pool.playersByTeamSeason);
    if (!men.length) continue;
    const want = pick(men, run);
    if (!want) continue;
    try { R.sign(run, want, R.slotChoices(run, want)[0]); } catch (_) { return; }
  }
}
function playSeason(run) {
  R.startSeason(run, DATA, ctx);
  let guard = 0;
  while (run.phase !== R.PHASES.OVER && guard++ < 60) {
    if (run.phase === R.PHASES.SEEDING) {
      if (run.playoffSeed.made) R.startPlayoffs(run); else break;
      continue;
    }
    R.advanceWeek(run, DATA, leagueContext);
  }
  return run.phase === R.PHASES.OVER;
}

/*
 * A FINISHED SEASON AS THE ROW THE PAGE WOULD FILE. run.history already carries what
 * ownerVerdict banked, in the same units and rounded the same way, and recordRun sends those
 * plus the dynasty tag. Building the row from history rather than from a second reading of
 * the run is the point: if the two ever disagree, the badges are being checked against
 * numbers the leaderboard never sees.
 */
function rowsFrom(run, dynastyId, createdAt) {
  return (run.history || []).map((h, i) => ({
    id: dynastyId + ':' + i,
    created_at: new Date(createdAt + i * 3600000).toISOString(),
    wins: h.wins, losses: h.losses, games: 17,
    title_won: !!h.title, perfect: !!h.perfect, made_playoffs: !!h.made,
    seed_label: h.seedLabel || '', playoff_wins: h.playoffWins || 0,
    point_diff: null,
    chemistry_pct: h.chemistryPct, spend_musd: h.spendMusd, respins: 0,
    franchise: run.franchise || null,
    run_mode: 'dynasty',
    picks: h.picks, slots: h.slots,
    squad_fppg: h.squadFppg, structure_mult: h.structureMult,
    team_rating: h.rating, perfect_pct: null,
    dynasty_id: dynastyId, dynasty_season: h.seasonNo, dynasty_score: h.score,
  }));
}

/* One dynasty, played to the firing or to the season cap. */
function playDynasty(seed, stratName, opts) {
  const o = opts || {};
  const pick = STRATS[stratName];
  let st = seed >>> 0;
  const rnd = () => { st = (st * 1664525 + 1013904223) >>> 0; return st / 4294967296; };
  let run;
  try {
    run = R.createRun(Object.assign({ dynasty: true, seed },
      o.franchise ? { franchise: o.franchise } : {}));
  } catch (_) { return null; }
  draftHoles(run, pick);
  if (run.phase === R.PHASES.DRAFT) { try { R.takeTheField(run); } catch (_) { return null; } }

  const limit = o.limit || (QUICK ? 12 : 30);
  for (let s = 0; s < limit; s++) {
    if (run.phase === R.PHASES.DRAFT) { try { R.takeTheField(run); } catch (_) { break; } }
    if (run.phase !== R.PHASES.SEASON) break;
    if (!playSeason(run)) break;
    const v = R.ownerVerdict(run);
    if (v.fired) break;
    /* The marquee game, when there is one. Won or lost it changes no column on the row, but
       it changes how long the run lasts, so it has to be played rather than skipped. */
    if (R.bossPending(run)) {
      try {
        R.applyBossResult(run, o.bossWins !== false,
          run.roster.length ? run.roster[0].player_id : null);
      } catch (_) {}
    }
    try { R.beginOffseason(run, byKey, lastSeason); } catch (_) { break; }
    /* Cut only under cap pressure: a cut leaves a quarter of the deal dead, and cutting for
       the sake of it is how a bot talks itself into a firing. */
    let guard = 0;
    while (R.remaining(run) < 8 && run.roster.length && guard++ < 6) {
      const worst = run.roster
        .map((p, i) => ({ i, v: p.ppr_ppg_mean / Math.max(3, run.salaries[i]) }))
        .sort((a, b) => a.v - b.v)[0];
      try { R.releaseMan(run, worst.i); } catch (_) { break; }
    }
    try { R.finishOffseason(run); } catch (_) { break; }
    if (run.phase === R.PHASES.DRAFT) {
      draftHoles(run, pick);
      if (run.phase === R.PHASES.DRAFT) { try { R.takeTheField(run); } catch (_) { break; } }
    }
    if (run.challenge && !run.challenge.resolved) {
      try { R.applyChallengeResult(run); } catch (_) {}
    }
    if (rnd() < 0) break;                      // keeps rnd used, and the seed meaningful
  }
  return run;
}

/*
 * One Full Team season.
 *
 * A COACH AND A CHOSEN PLAN ARE MUTUALLY EXCLUSIVE, which is the mode's rule and not an
 * accident of this harness: hireCoach overwrites the plan with his scheme and setPlan throws
 * while anybody is hired, because hiring a man and then overruling him would make his
 * expertise free. So `coachIdx` below is either an index into the market or -1 for nobody,
 * and only the coachless seasons carry a plan of their own. Written the other way first, and
 * every setPlan threw into a catch: 27 seasons were played on three schemes and the plan
 * badges read as unreachable when the mode offers all 27 to anybody who declines a coach.
 */
function playFull(seed, stratName, plan, coachIdx) {
  const pick = STRATS[stratName];
  let run;
  try { run = R.createRun({ full: true, seed }); } catch (_) { return null; }
  draftHoles(run, pick);
  if (run.phase === R.PHASES.COACH) {
    if (coachIdx >= 0) {
      /* coachMarket takes the TABLE, not the context: the page builds it with E.coachTable(CTX)
         and hands it in. Passing ctx instead threw inside the filter, which the catch
         swallowed, so every Full Team season here was played by nobody. */
      let market = [];
      try { market = R.coachMarket(run, E.coachTable(ctx) || []) || []; } catch (_) { market = []; }
      /* TWO WAYS OF HIRING, because the badges want two different things out of this. Walking
         the market by index is how twenty five different men get hired; taking the dearest one
         affordable is how a team good enough to win a January gets built, and a title is what
         four of the coach badges stand on. Doing only the first found no title in 422 seasons
         and a separate measurement then found four in 449, so the mode was fine and the hire
         was the difference. */
      const want = !market.length ? null
        : (coachIdx % 4 === 0 ? market[coachIdx % market.length]
          : market.slice().sort((a, b) => (b.price_musd || 0) - (a.price_musd || 0))[0]);
      if (want) { try { R.hireCoach(run, want); } catch (_) {} }
    } else if (plan) {
      try { R.setPlan(run, plan); } catch (_) {}
    }
    try { R.finishHiring(run); } catch (_) {}
  }
  if (run.phase !== R.PHASES.SEASON) return null;
  if (!playSeason(run)) return null;
  try { R.ownerVerdict(run); } catch (_) {}
  return run;
}

function fullRow(run, i, createdAt) {
  const o = run.outcome || {};
  const r1 = (v) => (v == null ? null : Math.round(v * 10) / 10);
  return {
    id: 'full:' + i,
    created_at: new Date(createdAt + i * 3600000).toISOString(),
    wins: o.regularWins ?? o.wins ?? 0, losses: 17 - (o.regularWins ?? o.wins ?? 0), games: 17,
    title_won: !!o.titleWon, perfect: !!o.perfect, made_playoffs: !!o.madePlayoffs,
    seed_label: o.seedLabel || '', playoff_wins: 0, point_diff: null,
    chemistry_pct: r1(run.season ? (run.season.chemistry - 1) * 100 : 0),
    spend_musd: r1(run.roster.reduce((t, p) => t + p.price_musd, 0)
      + ((run.coach && run.coach.price_musd) || 0)),
    respins: run.respinsUsed || 0,
    franchise: null, run_mode: 'fullteam',
    picks: run.roster.map((p) => p.player_id + ':' + p.season),
    slots: run.roster.map((p, i2) => run.slots[run.slotIndex[i2]]),
    squad_fppg: r1(run.roster.reduce((t, p) => t + (p.ppr_ppg_mean || 0), 0)),
    structure_mult: null,
    /* THE SAME READING THE PAGE FILES. run.outcome carries no teamRating (nothing sets one),
       so taking it from there filed null on every row and the rating badges could not fire.
       overallOf with the 'full' side is what teamRating() in the page resolves to. */
    team_rating: r1(E.overallOf(run.roster,
      run.season ? run.season.chemistry : 1, 'full', run.coach || null)),
    perfect_pct: null,
    coach: (run.coach && run.coach.name) || null,
    plan: run.plan ? E.normalizePlan(run.plan) : null,
  };
}

/* ---------------- the sweep ---------------- */
console.log('BADGES, checked by playing the modes they describe\n');
const t0 = Date.now();
const rows = [];
const base = Date.UTC(2026, 0, 1);
let clock = base;
const stats = { dynasties: 0, dynSeasons: 0, fulls: 0, deepest: 0, bestScore: 0 };

/* Dynasty. Every strategy against a spread of seeds, plus a pass locked to clubs so the One
   Franchise Dynasty badges have something to read. */
/* ENOUGH RUNS THAT A RARE THING HAPPENS. A dynasty title turns up in roughly one run in
   fifty, so a sweep of a hundred and thirty reported "no dynasty has ever won a title" and
   meant "we did not play enough". Volume is the whole answer to that class of miss, and it
   is the reason this file takes minutes rather than seconds. */
const SEEDS = QUICK ? 6 : 120;
const CLUBS = ACH.CLUBS;
for (const strat of Object.keys(STRATS)) {
  for (let i = 0; i < SEEDS; i++) {
    const run = playDynasty(90210 + i * 7919 + strat.length * 977, strat, {});
    if (!run || !run.history || !run.history.length) continue;
    stats.dynasties++;
    stats.dynSeasons += run.history.length;
    const rs = rowsFrom(run, 'dyn-' + strat + '-' + i, clock);
    clock += (rs.length + 1) * 3600000;
    rows.push(...rs);
    const last = rs[rs.length - 1];
    stats.deepest = Math.max(stats.deepest, Number(last.dynasty_season) || 0);
    stats.bestScore = Math.max(stats.bestScore, Number(last.dynasty_score) || 0);
  }
}
/* THE CLUB PASS. A One Franchise Dynasty is the same run with a club lock, and the badges
   count how many DIFFERENT clubs have been run, so every club gets a go. */
const CLUB_TRIES = QUICK ? 1 : 4;
for (let i = 0; i < CLUBS.length; i++) {
  for (let t = 0; t < CLUB_TRIES; t++) {
    const run = playDynasty(4242 + i * 613 + t * 20101,
      ['stars', 'spread', 'value', 'frugal'][t % 4],
      { franchise: CLUBS[i], limit: QUICK ? 4 : 30 });
    if (!run || !run.history || !run.history.length) continue;
    stats.dynasties++;
    stats.dynSeasons += run.history.length;
    const rs = rowsFrom(run, 'club-' + CLUBS[i] + '-' + t, clock);
    clock += (rs.length + 1) * 3600000;
    rows.push(...rs);
    stats.deepest = Math.max(stats.deepest, Number(rs[rs.length - 1].dynasty_season) || 0);
  }
}

/* Full Team. Every plan gets played, so the 27 plan collection has something to count, and
   the coach index walks the market so the hires are different men. */
const AX = [-1, 0, 1];
let fi = 0;
const pushFull = (run) => {
  if (!run) return;
  stats.fulls++;
  rows.push(fullRow(run, ++fi, clock));
  clock += 3600000;
};
/* EVERY ONE OF THE 27 PLANS, played coachless, which is the only way a plan is yours.
   RETRIED UNTIL EACH ONE ACTUALLY FINISHES A SEASON. A twelve man draft can strand itself
   with slots open and no money, and unlike a dynasty there is no taking the field short: that
   run simply ends. One attempt per plan left holes in the set, and "played 27 different game
   plans" then read as unreachable because four of them had never been played at all. */
for (const tempo of AX) {
  for (const fourth of AX) {
    for (const pressure of AX) {
      let run = null;
      for (let t = 0; t < (QUICK ? 3 : 8) && !run; t++) {
        run = playFull(50000 + fi * 271 + t * 3313, ['stars', 'spread', 'value'][t % 3],
          { tempo, fourth, pressure }, -1);
      }
      pushFull(run);
    }
  }
}
/* And a pass with coaches, walking the market so the hires are different men.
   LONG, AND THE LENGTH IS THE POINT. A Full Team squad reaches the Super Bowl in about one
   season in twenty and wins it in about one in a hundred: measured at 23 and 4 out of 449.
   A pass of 260 found no title and said so, which read exactly like "a full squad cannot win
   one" and was really "we did not play enough". Everything downstream of that title, the
   coach badges included, was excused against a thing that had simply not come up yet. */
const COACHED = QUICK ? 12 : 440;
for (let k = 0; k < COACHED; k++) {
  /* ALL OF THEM ON THE STRONG DRAFT. Alternating with `spread` halved the number of seasons
     played by a squad good enough to win a January, and a title is what four badges here
     stand on. The variety `spread` was buying is already bought by the 27 plan seasons above,
     which use it. */
  pushFull(playFull(70000 + k * 419, 'stars', null, k));
}

console.log(`played ${stats.dynasties} dynasties (${stats.dynSeasons} seasons, deepest `
  + `${stats.deepest}, best score ${stats.bestScore.toLocaleString()}) `
  + `and ${stats.fulls} Full Team seasons`);
console.log(`${rows.length} board rows in ${((Date.now() - t0) / 1000).toFixed(1)}s\n`);

/*
 * THE TWO KINDS OF BADGE A BOT CANNOT LIGHT, AND WHAT EACH ONE OWES.
 *
 * Some badges are out of reach here for reasons that are not "the mode cannot do it", and
 * excusing them by hand is how an impossible badge gets waved through. So an excuse is not a
 * note in a comment: it names ANOTHER BADGE that must actually be lit by this run, and the
 * check fails if that one is dark. The excuse is only as good as the thing it stands on.
 *
 *   GRIND   the same test with a bigger number in it. 100 seasons is 25 seasons four times,
 *           and nothing about the hundredth is different from the twenty-fifth.
 *
 *   SKILL   a feat the bots here are not good enough for. They never re-spin, they never
 *           plan a roster round a slot, and they take whatever the wheel offers. A player
 *           does all three. Each entry names the weaker fact it is built on, and where the
 *           badge is a conjunction it names EACH half, because a conjunction of two proved
 *           halves is a plausible ask and a conjunction resting on nothing is a guess.
 *
 * Anything in neither list has to light, or the run fails.
 */
const GRIND = {
  dyn_runs_25: 'dyn_runs_10',            // 25 dynasties started, against 10
  dyn_seasons_150: 'dyn_seasons_50',     // 150 dynasty seasons, against 50
  dyn_clubs_32: 'dyn_clubs_16',          // all 32 clubs, against half of them
  full_100: 'full_25',                   // 100 Full Team seasons, against 25
  full_coach_25: 'full_coach_10',        // 25 coaches hired, against 10
};
const SKILL = {
  /* The bot's deepest run is around 19 seasons. 25 is the mode's own design ceiling
     (E.DYNASTY_MAX_SEASONS) and every season past 19 is the same job done better. */
  dyn_reach_20: 'dyn_reach_18',
  dyn_reach_21: 'dyn_reach_18',
  dyn_reach_25: 'dyn_reach_18',
  /* A quarter million is reached by grinding seasons out and the bots do it. The two rungs
     above are that plus rings: a title pays 10,000 times the season number, so one in season
     20 is worth 200,000 by itself, and the bots almost never win one. */
  dyn_score_500000: 'dyn_score_250000',
  dyn_score_1000000: 'dyn_score_250000',
  /* January every year for a decade, and a whole run without a lean one. The five season
     version of each is lit, and the gap is patience rather than possibility. */
  dyn_po_streak_10: 'dyn_po_streak_5',
  dyn_never_missed_8: 'dyn_po_streak_5',
  /* Keeping a band of twelve together for eight winters. Holding one man that long is lit;
     doing it with the whole roster is the same trick repeated, and the bots churn because
     they take whatever the wheel offers rather than planning round who they already have. */
  dyn_loyal: 'dyn_held_8',
  /* A club dynasty is the ordinary one with the pool locked, so it runs shorter for the bots
     and every depth rung below is lit in the open mode. */
  dyn_club_10: 'dyn_club_5',
  dyn_club_15: 'dyn_club_5',
  dyn_club_ring: 'dyn_titles_1',
  /* Rings inside one run, each resting on the one below. */
  dyn_titles_2: 'dyn_titles_1',
  dyn_titles_3: 'dyn_titles_2',
  dyn_ring_streak_2: 'dyn_titles_2',
  dyn_ring_streak_3: 'dyn_titles_3',
  dyn_underdog: 'dyn_rating_100',
  dyn_club_ring_3: 'dyn_club_ring',
  /* Conjunctions. Each half is proved on its own by the badge named, and the second half of
     each pair is asserted below. */
  dyn_perfect: 'dyn_win_17',
  dyn_thrifty_ring: 'dyn_titles_1',
  dyn_bounce_back: 'dyn_titles_1',
  dyn_first_ring: 'dyn_titles_1',
  dyn_late_ring: 'dyn_reach_10',
  full_17: 'full_15',
  full_coach_ring: 'full_ring',
  full_coach_ring_3: 'full_coach_ring',
};
/* The second half of each conjunction above, so a two-part ask is not excused by one part. */
const ALSO = {
  dyn_perfect: 'dyn_titles_1',
  dyn_thrifty_ring: 'dyn_thrifty',
  dyn_bounce_back: 'dyn_reach_3',
  dyn_late_ring: 'dyn_titles_1',
  dyn_never_missed_8: 'dyn_reach_8',
  dyn_loyal: 'dyn_reach_8',
  dyn_club_10: 'dyn_reach_10',
  dyn_club_15: 'dyn_reach_15',
  dyn_club_ring: 'dyn_club_5',
  full_coach_ring: 'full_coach_3',
  full_coach_ring_3: 'full_coach_10',
};

const res = ACH.evaluate(rows, resolve, { pairLinks, nowIso: new Date(clock).toISOString() });
const earned = new Set(res.earned.map((a) => a.id));
const shelves = ['Dynasty', 'Full Team'];
let bad = 0, excused = 0;
/* An excuse holds only while everything it rests on is lit. Returns the reason to print, or
   null when the badge has to be reported. */
/* CHAINS RESOLVE ALL THE WAY DOWN TO SOMETHING THAT ACTUALLY LIT. Three rings inside one
   dynasty rests on two, and two rests on one, so writing each rung against the rung below is
   how the ladder reads. But an excuse standing on another EXCUSE is not evidence of anything,
   so the chain is followed to its end and only the end is asked whether it lit. Written as a
   single step first, and a ladder of three then failed at its second rung with "rests on
   dyn_titles_2, which did not light", which was true and was not the question. */
function excuseFor(id) {
  const kind = GRIND[id] ? 'grind' : (SKILL[id] ? 'skill' : null);
  if (!kind) return null;
  const chain = [];
  let at = id, guard = 0;
  while ((GRIND[at] || SKILL[at]) && guard++ < 12) {
    at = GRIND[at] || SKILL[at];
    if (chain.indexOf(at) >= 0) break;            // a cycle excuses nothing
    chain.push(at);
    if (earned.has(at)) break;
  }
  const root = chain[chain.length - 1];
  const on = [root].concat(ALSO[id] ? [ALSO[id]] : []);
  const dark = on.filter((x) => !earned.has(x));
  if (dark.length) return { ok: false, text: `rests on ${dark.join(' and ')}, which did not light` };
  return { ok: true, text: `${kind}, on ${on.join(' + ')}`
    + (chain.length > 1 ? ` (via ${chain.slice(0, -1).join(' > ')})` : '') };
}
for (const g of shelves) {
  const all = ACH.CATALOG.filter((a) => a.group === g);
  const got = all.filter((a) => earned.has(a.id));
  console.log(`${g}: ${got.length}/${all.length} reached`);
  for (const a of all) {
    if (earned.has(a.id)) continue;
    const ex = excuseFor(a.id);
    if (ex && ex.ok) { excused++; console.log(`  ok        ${a.id.padEnd(20)} ${ex.text}`); continue; }
    bad++;
    console.log(`  UNREACHED ${a.id.padEnd(20)} [${a.tier}] ${a.desc}`
      + (ex ? `\n            ${ex.text}` : ''));
  }
}

/* An excuse naming a badge that no longer exists silently excuses nothing while the badge it
   was written for goes unchecked, so a stale name is a failure in its own right. */
const ids = new Set(ACH.CATALOG.map((a) => a.id));
for (const [id, on] of Object.entries(Object.assign({}, GRIND, SKILL, ALSO))) {
  if (!ids.has(id)) { bad++; console.log(`  STALE     ${id} is excused and not in the catalog`); }
  if (!ids.has(on)) { bad++; console.log(`  STALE     ${id} rests on ${on}, which is not in the catalog`); }
}

console.log(`\n${bad} unreachable, ${excused} excused against a badge that did light`);
if (bad) {
  console.log('\nAn unreachable badge is a badge asking for something the mode cannot do, OR a');
  console.log('gap in this checker. Read the note at the top before touching a threshold.');
}
process.exit(bad ? 1 : 0);
