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
/*
 * HOW MANY SEASONS GO ROUND. The calendar is the mode: it runs the years in order and
 * turns over at the top rather than running out, so a lap is every season the pool holds
 * and getting back to the year you began in is the goal the game states.
 *
 * ASSERTED AGAINST THE ENGINE'S DEFAULT, because engine.js has to carry a number for the
 * callers that do not have the pool in front of them, and a stale one there is a lap that
 * quietly stops landing on the year the player was told to aim at.
 */
const LAP_SEASONS = new Set(players.map((p) => p.season)).size;

let fails = 0;
const ok = (label, cond, extra) => {
  if (!cond) fails++;
  if (!cond || process.env.VERBOSE) {
    console.log(`  ${cond ? 'ok  ' : 'FAIL'}  ${label}${extra ? '   ' + extra : ''}`);
  }
};

ok('the engine knows how long a lap is', E.DYNASTY_LAP_SEASONS === LAP_SEASONS,
  `engine says ${E.DYNASTY_LAP_SEASONS}, the pool holds ${LAP_SEASONS}`);
ok('and the calendar has no holes in it',
  lastSeason - firstSeason + 1 === LAP_SEASONS,
  `${firstSeason} to ${lastSeason} is ${lastSeason - firstSeason + 1} years, `
  + `${LAP_SEASONS} of them have players`);

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
const run = R.createRun({ dynasty: true, seed: 20260830, startYear: START });
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
ok('every man is from the league year',
  run.roster.every((p) => p.season === START),
  `seasons: ${[...new Set(run.roster.map((p) => p.season))].join(',')}`);
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
  seen.push(`${run.leagueYear}: ${v.wins}-${17 - v.wins} needed ${v.bar}`
    + (v.cleared ? ' PASS' : (v.fired ? ' FIRED' : ' on notice'))
    + `   ${String(run.history[run.history.length - 1].score).padStart(7)}`
    + `  (run ${v.score})`);
  /* FLAT INSIDE A LAP, +1 A LAP ROUND. The target is the same number all the way round
     the calendar, which is what makes "beat this season" one rule rather than a moving
     one, and it steps up when you come back to the year you started in. */
  ok(`season ${run.seasonNo} judged against its own target`,
    v.bar === E.DYNASTY_BASE_WINS + Math.floor((run.seasonNo - 1) / LAP_SEASONS),
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
  ok('the winter advanced the calendar', run.leagueYear === START + run.seasonNo - 1);
  ok('the cap grew six percent',
    Math.abs(run.capMusd - capBefore * E.DYNASTY_CAP_GROWTH) < 0.05,
    `$${capBefore}M -> $${run.capMusd}M`);
  ok('everybody kept is one year older',
    w.aged.every((a) => a.now.season === run.leagueYear && a.now.player_id === a.was.player_id));
  ok('no salary went down',
    w.aged.every((a) => a.salary >= a.wasSalary),
    w.aged.filter((a) => a.salary < a.wasSalary).map((a) => a.now.name).join(', '));
  ok('a man who aged out is off the books',
    w.gone.every((g) => !run.roster.some((p) => p.player_id === g.was.player_id)));
  ok('gone is said honestly',
    w.gone.every((g) => g.why === 'missed' || g.why === 'out' || g.why === 'retired'),
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
    ok('every new man is from the NEW league year',
      run.roster.every((p) => p.season === run.leagueYear),
      `seasons: ${[...new Set(run.roster.map((p) => p.season))].join(',')}`);
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
 * ─── THE CALENDAR TURNS OVER ────────────────────────────────────────────────────────
 *
 * The one thing in this mode with no natural test above it, because reaching it takes
 * twenty-odd seasons of not being fired. So it is driven straight: start the season before
 * the last one the pool holds and walk into the wrap.
 *
 * WHAT USED TO HAPPEN HERE. The year after the last had no clubs on the wheel and no next
 * season for anybody, so the whole roster aged into nothing and the refill threw "a team
 * needs somebody in it". The runway that held the opening year ten seasons back from the
 * end was a fence around that rather than a fix.
 */
{
  const w = R.createRun({ dynasty: true, seed: 4242, startYear: lastSeason - 1,
    lapSeasons: LAP_SEASONS });
  draftHoles(w, budgeted);
  ok('a run near the end of the data drafts normally', w.roster.length === 6);
  playSeason(w);
  R.ownerVerdict(w);
  R.beginOffseason(w, byKey, lastSeason, firstSeason);
  ok('the season before the last is an ordinary offseason',
    w.leagueYear === lastSeason && !w.winter.wrapped, `${w.leagueYear}`);
  R.finishOffseason(w);
  if (w.phase === R.PHASES.DRAFT) { draftHoles(w, budgeted); R.takeTheField(w); }

  const beforeCap = w.capMusd;
  const beforeUsed = w.usedPlayers.length;
  playSeason(w);
  R.ownerVerdict(w);
  R.beginOffseason(w, byKey, lastSeason, firstSeason);
  const win = w.winter;

  ok('past the last season the calendar goes back to the first',
    w.leagueYear === firstSeason, `${w.leagueYear}, expected ${firstSeason}`);
  ok('and it says so', win.wrapped === true);
  ok('nobody survives the turn', w.roster.length === 0 && win.aged.length === 0,
    `${w.roster.length} kept`);
  /* NOT LEFT TO COINCIDENCE. No man in this pool played both the first season and the
     last, so the aging lookup would have emptied the roster on its own. Relying on that is
     relying on who happens to be in the data. */
  ok('and every one of them is gone for the calendar, not for himself',
    win.gone.length > 0 && win.gone.every((g) => g.why === 'era'),
    [...new Set(win.gone.map((g) => g.why))].join(','));
  ok('the cap goes back to the one everybody starts with',
    w.capMusd === E.CONSTANTS.CAP_MUSD, `$${w.capMusd}M, was $${beforeCap}M`);
  /* A NEW LAP IS A NEW POOL OF MEN. Carried across, usedPlayers would delete every good
     player of the era just played from the era about to be replayed. */
  ok('and the men already used come back into the pool',
    w.usedPlayers.length === 0, `${beforeUsed} used, now ${w.usedPlayers.length}`);
  ok('the run is on its second time round', w.lap === 2, `lap ${w.lap}`);

  R.finishOffseason(w);
  ok('every spot is open again', w.slots.length - w.roster.length === 6);
  const err = draftHoles(w, budgeted);
  ok('and the first year of the pool has a wheel to draft off', !err, err || '');
  ok('six men signed out of the new era', w.roster.length === 6);
  ok('and every one of them is from the first season',
    w.roster.every((p) => p.season === firstSeason),
    [...new Set(w.roster.map((p) => p.season))].join(','));
  playSeason(w);
  const v2 = R.ownerVerdict(w);
  ok('the season after the turn plays', v2.wins >= 0 && v2.wins <= 17, `${v2.wins} wins`);
  ok('and it is still judged against the first lap target',
    v2.bar === E.DYNASTY_BASE_WINS, `bar ${v2.bar}`);
}

/*
 * ─── AND THE TARGET STEPS UP ONE LAP ROUND, NOT ONE SEASON ──────────────────────────
 */
ok('the target is flat all the way round a lap',
  [1, 2, 14, LAP_SEASONS].every((n) => E.dynastyWinBar(n, LAP_SEASONS) === E.DYNASTY_BASE_WINS),
  [1, 2, 14, LAP_SEASONS].map((n) => E.dynastyWinBar(n, LAP_SEASONS)).join(','));
ok('and steps up the season you get back to where you started',
  E.dynastyWinBar(LAP_SEASONS + 1, LAP_SEASONS) === E.DYNASTY_BASE_WINS + 1
  && E.dynastyWinBar(LAP_SEASONS * 2 + 1, LAP_SEASONS) === E.DYNASTY_BASE_WINS + 2,
  `${E.dynastyWinBar(LAP_SEASONS + 1, LAP_SEASONS)}, `
  + `${E.dynastyWinBar(LAP_SEASONS * 2 + 1, LAP_SEASONS)}`);
/* ONE LIFE, and the whole of it: a season at the target survives and one below it does
   not, whatever came before. */
ok('one miss ends a run of any length',
  !E.dynastySurvives([{ wins: 12 }, { wins: 12 }, { wins: 7 }], LAP_SEASONS)
  && E.dynastySurvives([{ wins: 7 }, { wins: 8 }], LAP_SEASONS) === true);

/* ─── and the modes that already ship are not a dynasty ──────────────────────────── */
const plain = R.createRun({ seed: 1 });
ok('a classic run has no dynasty state', !plain.dynasty && plain.salaries === null);
const full = R.createRun({ full: true, seed: 1 });
ok('a full team run is not a dynasty', full.full && !full.dynasty);

console.log('');
console.log(fails ? `${fails} FAILED` : 'all checks passed');
process.exit(fails ? 1 : 0);
