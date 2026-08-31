/*
 * The Gauntlet, played through run.js exactly as the page will drive it.
 *
 *   node football/check-dynasty.mjs
 *
 * WHY THIS EXISTS AND WHY IT IS NOT THE SIMULATOR. simulator.js --dynasty answers a design
 * question, is the mode worth building, and it does that by reaching straight into the
 * engine. This answers a different one: does the LIFECYCLE hold. It drives the same
 * functions in the same order the screens will (beginOffseason, releaseMan, finishOffseason,
 * spin, sign, startSeason, advanceWeek, ownerVerdict) and asserts the things that would
 * quietly rot a save: that the wheel stays inside the league year, that salaries ratchet and
 * never fall, that a released man never comes back, that the cap is spent against salaries
 * rather than list prices, and that the owner fires on exactly the rule the engine states.
 *
 * It is fast and it needs no network, so it can run on every change to either file.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const E = require(path.join(here, 'engine.js'));
const R = require(path.join(here, 'run.js'));

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
/* One pool now: The Gauntlet drafts an offense, so the index beginOffseason ages against is
   the same one the wheel draws from, and the page's BYKEY is the same map. */
const byKey = new Map();
for (const p of players) byKey.set(`${p.player_id}|${p.season}`, p);
const lastSeason = Math.max(...players.map((p) => p.season));
const firstSeason = Math.min(...players.map((p) => p.season));
const POOL_SEASONS = new Set(players.map((p) => p.season)).size;
/* How often the target goes up a win. Nothing to do with the pool: see E.dynastyWinBar. */
const STEP = E.DYNASTY_STEP_SEASONS;

let fails = 0;
const ok = (label, cond, extra) => {
  if (!cond) fails++;
  if (!cond || process.env.VERBOSE) {
    console.log(`  ${cond ? 'ok  ' : 'FAIL'}  ${label}${extra ? '   ' + extra : ''}`);
  }
};

/* THE POOL IS CONTIGUOUS, which every man's clock depends on: he ages by looking for his
   own next season, and a hole in the calendar would retire a whole cohort at once. */
ok('the pool has a season for every year it spans',
  lastSeason - firstSeason + 1 === POOL_SEASONS,
  `${firstSeason} to ${lastSeason} is ${lastSeason - firstSeason + 1} years, `
  + `${POOL_SEASONS} of them have players`);

/*
 * THE POOL CARRIES WHAT THE WINTER READS OFF IT.
 *
 * The offseason shows four numbers per man: yards, catches or touchdowns per game, and the
 * games themselves. They come off `stats`, joined on by build/backfill-stats.mjs, and the
 * page reads them behind a `||{}` so a row without them renders four zeros rather than
 * throwing. That is the right thing at runtime and the wrong thing to find out about in
 * production, because a rebuild that forgets the join breaks nothing, fails nothing, and
 * quietly tells every visitor that Marshall Faulk gained no yards. So it is asserted here,
 * where a rebuild is what runs the check.
 */
{
  const missing = players.filter((p) => !p.stats);
  ok('every player-season carries its counting stats',
    missing.length === 0, `${missing.length} without`);
  ok('and every one of them played games to divide by',
    players.every((p) => p.games_played > 0));
  /* A MAN WITH NO NUMBERS IS ALLOWED, and 153 of them are: Devin Hester's 2006, Desmond
     Howard, Tamarick Vanover. Return men, who scored fantasy points from kicks and gained
     nothing from scrimmage. The pool has always shown them an empty stat line and the strip
     will show them four zeros, which is what happened.
     The invariant is not a count, it is agreement. The sentence and the numbers behind it
     come from the same totals, so a man blank in one must be blank in the other. A join
     that landed on the wrong key breaks that on the first row it touches. */
  const blank = players.filter((p) => p.stats && Object.keys(p.stats).length === 0);
  ok('and a man with no numbers has no stat line either',
    blank.every((p) => !p.stat_line),
    `${blank.length} blank, ${blank.filter((p) => p.stat_line).length} of them contradicted`);
  ok('and every man with a stat line has the numbers under it',
    players.every((p) => !p.stat_line || (p.stats && Object.keys(p.stats).length > 0)));
}

/* Fill every open slot off the wheel, the way a player does: spin, take a legal man, repeat.
   Takes the cheapest legal option so the roster is deliberately mediocre and the owner has
   something to be unhappy about. */
function draftHoles(run, pick) {
  let guard = 0;
  while (run.roster.length < run.slots.length && guard++ < 200) {
    const data = DATA;
    let draw;
    try { draw = R.spin(run, data); } catch (e) { return e.message; }
    /* THE SAME LIST THE BOARD SHOWS, through affordableFrom, which is the point. A bot
       reading remaining() directly signs men the live game would never have offered and
       then strands itself with two slots and $12M, which is not a finding about the mode,
       it is a finding about the bot. canFinishAfter exists precisely so that a tile you
       can see is a tile you can take. */
    const men = R.affordableFrom(run, draw.team_season_id, data.playersByTeamSeason);
    if (!men.length) continue;                     // a wasted spin, which is a real outcome
    const want = pick(men, run);
    R.sign(run, want, R.slotChoices(run, want)[0]);
  }
  return null;
}

/* Play the season out, however it goes. */
function playSeason(run) {
  R.startSeason(run, DATA, ctx);
  let guard = 0;
  while (run.phase !== R.PHASES.OVER && guard++ < 60) {
    if (run.phase === R.PHASES.SEEDING) {
      if (run.playoffSeed.made) R.startPlayoffs(run);
      else break;
      continue;
    }
    R.advanceWeek(run, DATA, leagueContext);
  }
  if (run.phase !== R.PHASES.OVER) throw new Error('season did not finish: ' + run.phase);
}

console.log('THE GAUNTLET, driven through run.js the way the screens will\n');

/* ─── one dynasty, all the way to the firing ─────────────────────────────────────── */
const START = 2004;
const run = R.createRun({ dynasty: true, seed: 20260830 });
ok('a dynasty is a six man offense, not a full team',
  run.dynasty && !run.full && !run.defense && run.slots.length === 6,
  `${run.slots.length} slots, full=${run.full}`);
ok('it opens on the draft', run.phase === R.PHASES.DRAFT);
ok('the cap is the one everybody starts with',
  run.capMusd === E.CONSTANTS.CAP_MUSD, `$${run.capMusd}M`);

/* Best man the board will let us have INSIDE A SHARE OF WHAT IS LEFT. Everything offered is
   already affordable, so taking the best of them every time is legal and spends the whole
   cap on the first four men: the lifecycle survives that, but a 1-16 season fires you in two
   winters and the offseason then only runs once. Budgeting keeps the dynasty alive long
   enough for the winter to be tested repeatedly, which is what this file is for. */
const budgeted = (men, r) => {
  const share = R.remaining(r) / Math.max(1, r.slots.length - r.roster.length) * 1.6;
  const within = men.filter((p) => p.price_musd <= share);
  return (within.length ? within : men).slice()
    .sort((a, b) => b.ppr_ppg_mean - a.ppr_ppg_mean)[0];
};

draftHoles(run, budgeted);
ok('six men signed', run.roster.length === 6);
/* NO LEAGUE YEAR TO BE FROM. The wheel is the ordinary one and a roster is six careers
   out of whatever decades it drew, which is the mode. */
ok('the six came out of more than one year',
  new Set(run.roster.map((p) => p.season)).size > 1,
  `seasons: ${[...new Set(run.roster.map((p) => p.season))].sort().join(',')}`);
ok('salaries were recorded, one per man', run.salaries.length === 6);
ok('a salary starts at his list price',
  run.roster.every((p, i) => run.salaries[i] === p.price_musd));
/* NO COACH STEP, WHICH IS THE POINT OF ASSERTING IT. Full Team stops at a hire between the
   last signing and the schedule; The Gauntlet does not, and the twelfth signing must land
   on the schedule itself. Measured before it was cut: the best coach the cap could reach
   was worth 0.11 wins a season, for a screen of fifty tiles. See sign() in run.js. */
ok('the sixth signing goes straight to the schedule', run.phase === R.PHASES.SEASON,
  run.phase);
ok('and nobody is coaching', run.coach === null);

const seen = [];
let seasons = 0;
let lastScore = 0;
for (let s = 0; s < 30; s++) {
  const before = run.roster.map((p, i) => ({ id: p.player_id, sal: run.salaries[i] }));
  playSeason(run);
  const v = R.ownerVerdict(run);
  seasons++;
  seen.push(`s${String(run.seasonNo).padStart(2)}: ${v.wins}-${17 - v.wins} needed ${v.bar}`
    + `  [${run.roster.map((p) => p.season).sort().join(' ')}]`
    + (v.cleared ? ' PASS' : (v.fired ? ' FIRED' : ' on notice'))
    + `   ${String(run.history[run.history.length - 1].score).padStart(7)}`
    + `  (run ${v.score})`);
  /* FLAT INSIDE A LAP, +1 A LAP ROUND. The target is the same number all the way round
     the calendar, which is what makes "beat this season" one rule rather than a moving
     one, and it steps up when you come back to the year you started in. */
  ok(`season ${run.seasonNo} judged against its own target`,
    v.bar === E.DYNASTY_BASE_WINS + Math.floor((run.seasonNo - 1) / STEP),
    `bar ${v.bar} in season ${run.seasonNo}`);

  /* ---- the score ---- */
  const h = run.history[run.history.length - 1];
  ok('the season banked a score', typeof h.score === 'number' && h.score >= 0,
    `${h.score} = ${h.scoreBase} x${h.scoreMult}`);
  ok('the multiplier is the season number', h.scoreMult === run.seasonNo);
  ok('the total is the base times the multiplier', h.score === h.scoreBase * h.scoreMult);
  ok('the parts add up to the base',
    h.scoreParts.reduce((t, x) => t + x.points, 0) === h.scoreBase);
  ok('wins are paid at the stated rate',
    (h.scoreParts.find((x) => x.key === 'wins') || { points: 0 }).points
      === h.wins * E.GAUNTLET_POINTS.WIN);
  /* THE WINS LINE IS REGULAR SEASON ONLY. outcome.wins runs through January, so paying the
     wins rate on it and the playoff rate again on the same games is the double count this
     asserts against. */
  ok('a playoff win is not paid twice',
    h.wins <= 17 && h.wins === (run.outcome.regularWins ?? h.wins), `${h.wins}`);
  ok('the run total is every season added up',
    v.score === run.history.reduce((t, x) => t + x.score, 0), `${v.score}`);
  ok('the run total only ever grows', v.score >= lastScore, `${lastScore} -> ${v.score}`);
  lastScore = v.score;
  if (v.fired) break;

  /* ---- the winter ---- */
  const capBefore = run.capMusd;
  const w = R.beginOffseason(run, byKey, lastSeason);
  ok('the offseason advanced the season count', run.seasonNo === seasons + 1,
    `season ${run.seasonNo} after ${seasons} played`);
  ok('the cap grew six percent',
    Math.abs(run.capMusd - capBefore * E.DYNASTY_CAP_GROWTH) < 0.05,
    `$${capBefore}M -> $${run.capMusd}M`);
  /* EACH ON HIS OWN CLOCK. Not "the same year as everyone else" but "one year on from
     where HE was", which is the difference the whole mode turns on. */
  ok('everybody kept is one year older than he was',
    w.aged.every((a) => a.now.season === a.was.season + 1
      && a.now.player_id === a.was.player_id),
    w.aged.map((a) => `${a.was.season}->${a.now.season}`).join(' '));
  ok('no salary went down',
    w.aged.every((a) => a.salary >= a.wasSalary),
    w.aged.filter((a) => a.salary < a.wasSalary).map((a) => a.now.name).join(', '));
  ok('a man who aged out is off the books',
    w.gone.every((g) => !run.roster.some((p) => p.player_id === g.was.player_id)));
  ok('gone is said honestly',
    w.gone.every((g) => ['missed', 'out', 'retired', 'end'].indexOf(g.why) >= 0),
    [...new Set(w.gone.map((g) => g.why))].join(','));
  /* RETIRED IS A CLAIM ABOUT A REAL PERSON, so it is only ever made when last_season says
     he never played again. A man with a later season on record must never be called
     retired. */
  ok('nobody is called retired who played again',
    w.gone.every((g) => g.why !== 'retired'
      || (typeof g.was.last_season !== 'number' || g.was.last_season <= g.was.season)),
    w.gone.filter((g) => g.why === 'retired')
      .map((g) => `${g.was.name} ${g.was.season}/${g.was.last_season}`).join(', '));

  /* Release the worst value man, which is the decision the screen will offer. */
  if (run.roster.length) {
    const worst = run.roster
      .map((p, i) => ({ i, v: p.ppr_ppg_mean / Math.max(3, run.salaries[i]) }))
      .sort((a, b) => a.v - b.v)[0];
    const man = run.roster[worst.i];
    const payBefore = R.remaining(run);
    R.releaseMan(run, worst.i);
    ok('a release opens his salary',
      R.remaining(run) > payBefore,
      `$${payBefore.toFixed(1)}M -> $${R.remaining(run).toFixed(1)}M`);
    ok('a released man is still blocked from the wheel',
      run.usedPlayers.includes(man.player_id));
  }

  R.finishOffseason(run);
  ok('the winter ended at the draft or the schedule',
    run.phase === R.PHASES.DRAFT || run.phase === R.PHASES.SEASON);
  if (run.phase === R.PHASES.DRAFT) {
    const err = draftHoles(run, budgeted);
    /* A DRY WHEEL IS A LEGAL OUTCOME, not a failure: over the cap you sign nobody, so the
       holes stay open and the team takes the field short-handed. */
    if (run.phase === R.PHASES.DRAFT) {
      ok('a dry wheel really is dry', R.wheelIsDry(run, DATA) || !!err);
      const short = run.roster.length;
      R.takeTheField(run);
      ok('a short roster can still take the field',
        run.phase === R.PHASES.SEASON && run.roster.length === short, `${short} men`);
    }
    ok('the holes were filled or the wheel was dry', run.roster.length <= 6);
    /* THE REFILL DRAWS OFF THE WHOLE POOL, so the new man can be from anywhere, and how
       much of him is left is the second question the draft now asks. */
    ok('a refilled man has a season of his own',
      run.roster.every((p) => typeof p.season === 'number' && p.season >= firstSeason
        && p.season <= lastSeason),
      `seasons: ${[...new Set(run.roster.map((p) => p.season))].sort().join(',')}`);
    ok('a refilled roster goes back to the schedule', run.phase === R.PHASES.SEASON);
  }
  /* the ratchet, checked against what he was actually paid last year */
  for (const a of w.aged) {
    const was = before.find((b) => b.id === a.now.player_id);
    if (was) {
      ok(`${a.now.name} is paid at least what he was`, a.salary >= was.sal,
        `$${was.sal}M -> $${a.salary}M (market $${a.market}M)`);
    }
  }
  ok('the cap is spent against salaries, not list prices',
    Math.abs((run.capMusd - R.remaining(run))
      - (run.salaries.reduce((t, v) => t + v, 0) + (run.coach ? run.coach.price_musd : 0)
         + E.respinFees(run.respinsUsed))) < 0.05);
}

console.log('  the dynasty, season by season:');
for (const line of seen) console.log('    ' + line);
console.log('');
ok('the run ended because the owner ended it', run.fired || seasons >= 30);
ok('seasons survived is the length of the history',
  R.seasonsSurvived(run) === run.history.length, `${R.seasonsSurvived(run)}`);
ok('the run carries its own score', run.score === E.gauntletRunScore(run.history),
  `${run.score}`);
/* A LATER SEASON IS WORTH MORE THAN AN EARLIER ONE AT THE SAME RECORD, which is the whole
   arcade shape and the thing a leaderboard on this score depends on. */
{
  const a = E.gauntletSeasonScore({ seasonNo: 1, wins: 10, bar: 8 });
  const b = E.gauntletSeasonScore({ seasonNo: 5, wins: 10, bar: 8 });
  ok('the same season is worth five times as much in year five',
    b.total === a.total * 5, `${a.total} -> ${b.total}`);
  const perfect = E.gauntletSeasonScore({ seasonNo: 1, wins: 17, bar: 8, playoffWins: 3,
    titleWon: true, undefeatedRegular: true, perfect: true });
  ok('a perfect season is far the biggest single year',
    perfect.total > a.total * 5, `${a.total} ordinary -> ${perfect.total} perfect`);
  /* AND SURVIVING STILL BEATS IT, which is the point of the multiplier rather than an
     accident of the numbers. One perfect season and then the sack scores 74,000; six
     ordinary ones score more, so the mode is about lasting and the bonuses are texture.
     If this ever inverts, the leaderboard stops being about the thing the mode is. */
  const six = [1, 2, 3, 4, 5, 6]
    .reduce((t, n) => t + E.gauntletSeasonScore({ seasonNo: n, wins: 10, bar: 8 }).total, 0);
  ok('six ordinary seasons beat one perfect one', six > perfect.total,
    `${six} against ${perfect.total}`);
}
ok('a fired run is terminal', !run.fired || run.phase === R.PHASES.OVER);
if (run.fired) {
  const h = run.history;
  /* ONE LIFE. The run ends on the season it ends on, and every season before it cleared
     its own target, or it would have ended there instead. */
  ok('the run ended on a miss', h.length >= 1
    && h[h.length - 1].wins < h[h.length - 1].bar,
    `${h[h.length - 1].wins}/${h[h.length - 1].bar}`);
  ok('and every season before it was a pass',
    h.slice(0, -1).every((x) => x.wins >= x.bar),
    h.map((x) => `${x.wins}/${x.bar}`).join(' '));
  let threw = false;
  try { R.beginOffseason(run, byKey, lastSeason, firstSeason); } catch (_) { threw = true; }
  ok('a finished dynasty cannot open another offseason', threw);
}

/*
 * ─── EVERY MAN ON HIS OWN CLOCK ─────────────────────────────────────────────────────
 *
 * The mode's whole mechanic, and the one thing no other check here can see: a roster is
 * six careers out of six different decades, each a different distance from its own end.
 */
{
  const w = R.createRun({ dynasty: true, seed: 77, stepSeasons: STEP });
  draftHoles(w, budgeted);
  ok('the wheel is not locked to one year any more',
    new Set(w.roster.map((p) => p.season)).size > 1,
    w.roster.map((p) => p.season).sort().join(','));
  const before = w.roster.map((p) => ({ id: p.player_id, season: p.season }));
  playSeason(w);
  R.ownerVerdict(w);
  R.beginOffseason(w, byKey, lastSeason);
  /* EACH MAN ADVANCED HIS OWN YEAR, not a shared one. A roster drafted out of 2003 and
     2019 becomes 2004 and 2020, and the two have nothing to do with each other. */
  ok('everybody kept moved on exactly one season of his own',
    w.winter.aged.every((a) => a.now.season === a.was.season + 1
      && a.now.player_id === a.was.player_id),
    w.winter.aged.map((a) => `${a.was.season}->${a.now.season}`).join(' '));
  ok('and they are still out of different years',
    new Set(w.roster.map((p) => p.season)).size > 1
    || w.roster.length < 2, w.roster.map((p) => p.season).join(','));
  ok('nobody was aged against a shared calendar',
    before.filter((b) => w.roster.some((p) => p.player_id === b.id))
      .every((b) => w.roster.find((p) => p.player_id === b.id).season === b.season + 1));
  R.finishOffseason(w);
  if (w.phase === R.PHASES.DRAFT) {
    const err = draftHoles(w, budgeted);
    /* FILLED, OR HONESTLY DRY. A bot that has spent the cap can leave itself with a spot
       and no money, which is the mode working rather than the pool failing, so the two
       outcomes are checked as one: either the spots closed or the wheel really has nothing
       this roster can afford. */
    ok('the refill either fills the spots or runs out of money',
      w.roster.length === w.slots.length || R.wheelIsDry(w, DATA) || !!err,
      `${w.roster.length}/${w.slots.length}${err ? ', ' + err : ''}`);
    ok('and anybody it did sign came from somewhere in the pool',
      w.roster.every((p) => p.season >= firstSeason && p.season <= lastSeason));
  }
}

/*
 * ─── AND A MAN AT THE END OF THE DATA IS NOT A MAN WHO RETIRED ──────────────────────
 *
 * `last_season` is the final year he appeared as of the day the data was built, so for
 * anybody still playing it is the CURRENT year. Read as "he never played after this" it
 * said GEORGE KITTLE RETIRED about a man who is playing this autumn. Past the end of the
 * pool nothing is known and the only honest answer is that he is out of seasons.
 */
{
  const active = players.filter((p) => p.season === lastSeason
    && typeof p.last_season === 'number' && p.last_season > lastSeason);
  ok('the pool holds men whose careers run past the end of it',
    active.length > 0, `${active.length}`);
  ok('and not one of them is called retired',
    active.every((p) => E.dynastyGoneFor(p, byKey, p.season + 1, lastSeason) === 'end'),
    active.filter((p) => E.dynastyGoneFor(p, byKey, p.season + 1, lastSeason) !== 'end')
      .slice(0, 3).map((p) => p.name).join(', '));
  /* NOR IS A MAN THE POOL'S FLOOR DROPPED. At last_season exactly equal to the year being
     asked for he PLAYED that year and simply did not clear twelve minutes a game. */
  const wrong = players.filter((p) => p.season + 1 <= lastSeason
    && typeof p.last_season === 'number' && p.last_season >= p.season + 1
    && E.dynastyGoneFor(p, byKey, p.season + 1, lastSeason) === 'retired');
  ok('and nobody with a season still to come is either', wrong.length === 0,
    wrong.slice(0, 3).map((p) => `${p.name} ${p.season}/${p.last_season}`).join(', '));
  /* AND THE CLAIM IS STILL MADE WHEN IT IS TRUE, or the fix would just be silence. */
  const retired = players.filter((p) => p.season + 1 <= lastSeason
    && E.dynastyGoneFor(p, byKey, p.season + 1, lastSeason) === 'retired');
  ok('a man who really never played again is still called retired',
    retired.length > 100, `${retired.length} of them`);
}

/*
 * ─── AND THE TARGET STEPS UP ONE LAP ROUND, NOT ONE SEASON ──────────────────────────
 */
ok('the target is flat all the way through a stretch',
  [1, 2, STEP - 1, STEP].every((n) => E.dynastyWinBar(n, STEP) === E.DYNASTY_BASE_WINS),
  [1, 2, STEP - 1, STEP].map((n) => E.dynastyWinBar(n, STEP)).join(','));
ok('and goes up exactly one win when the stretch is done',
  E.dynastyWinBar(STEP + 1, STEP) === E.DYNASTY_BASE_WINS + 1
  && E.dynastyWinBar(STEP * 2 + 1, STEP) === E.DYNASTY_BASE_WINS + 2,
  `${E.dynastyWinBar(STEP + 1, STEP)}, `
  + `${E.dynastyWinBar(STEP * 2 + 1, STEP)}`);
/* ONE LIFE, and the whole of it: a season at the target survives and one below it does
   not, whatever came before. */
ok('one miss ends a run of any length',
  !E.dynastySurvives([{ wins: 12 }, { wins: 12 }, { wins: 7 }], STEP)
  && E.dynastySurvives([{ wins: 7 }, { wins: 8 }], STEP) === true);

/* ─── and the modes that already ship are not a dynasty ──────────────────────────── */
const plain = R.createRun({ seed: 1 });
ok('a classic run has no dynasty state', !plain.dynasty && plain.salaries === null);
const full = R.createRun({ full: true, seed: 1 });
ok('a full team run is not a dynasty', full.full && !full.dynasty);

console.log('');
console.log(fails ? `${fails} FAILED` : 'all checks passed');
process.exit(fails ? 1 : 0);
