/*
 * The Long Game, played through run.js exactly as the page will drive it.
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
const defenders = load('defender_seasons.json');
for (const p of defenders) { p.ppr_ppg_mean = p.idp_ppg_mean; p.ppr_ppg_sd = p.idp_ppg_sd; }
const teamSeasons = load('team_seasons.json');
const leagueContext = load('league_context.json').league_avg_pts_allowed_by_season;
const ctx = {
  battery: load('battery.json'), coaches: load('coaches.json'), curated: load('curated.json'),
  teamSeasons,
  coachColleges: (() => { try { return load('coach_colleges.json'); } catch (_) { return {}; } })(),
};
const DATA = R.indexData(players, teamSeasons);
const DDATA = R.indexData(defenders, teamSeasons);
/* Both pools in one index, which is what beginOffseason needs and what the page already
   holds as BYKEY. */
const byKey = new Map();
for (const p of players.concat(defenders)) byKey.set(`${p.player_id}|${p.season}`, p);
const lastSeason = Math.max(...players.map((p) => p.season));

let fails = 0;
const ok = (label, cond, extra) => {
  if (!cond) fails++;
  if (!cond || process.env.VERBOSE) {
    console.log(`  ${cond ? 'ok  ' : 'FAIL'}  ${label}${extra ? '   ' + extra : ''}`);
  }
};

/* Which pool a slot draws from, the same question the page's dataNow asks. */
const sideOf = (i) => (E.FULL_SLOT_POS[i].some((x) => E.DEFENSE_POSITIONS.indexOf(x) >= 0)
  ? DDATA : DATA);

/* Fill every open slot off the wheel, the way a player does: spin, take a legal man, repeat.
   Takes the cheapest legal option so the roster is deliberately mediocre and the owner has
   something to be unhappy about. */
function draftHoles(run, pick) {
  let guard = 0;
  while (run.roster.length < run.slots.length && guard++ < 200) {
    const data = sideOf(run.roster.length);
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

console.log('THE LONG GAME, driven through run.js the way the screens will\n');

/* ─── one dynasty, all the way to the firing ─────────────────────────────────────── */
const START = 2004;
const run = R.createRun({ dynasty: true, seed: 20260830, startYear: START });
ok('a dynasty is a full team', run.full && run.dynasty && run.slots.length === 12);
ok('it opens on the draft', run.phase === R.PHASES.DRAFT);
ok('the cap is Full Team\'s', run.capMusd === E.FULL_CAP_MUSD, `$${run.capMusd}M`);

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
ok('twelve men signed', run.roster.length === 12);
ok('every man is from the league year',
  run.roster.every((p) => p.season === START),
  `seasons: ${[...new Set(run.roster.map((p) => p.season))].join(',')}`);
ok('salaries were recorded, one per man', run.salaries.length === 12);
ok('a salary starts at his list price',
  run.roster.every((p, i) => run.salaries[i] === p.price_musd));
ok('the draft ended at the coach', run.phase === R.PHASES.COACH);

const market = R.coachMarket(run, E.coachTable(ctx));
ok('there is a coach market', market.length > 0, `${market.length} affordable`);
if (market.length) R.hireCoach(run, market[0]);
R.finishHiring(run);
ok('hiring left us at the season', run.phase === R.PHASES.SEASON);

const seen = [];
let seasons = 0;
for (let s = 0; s < 30; s++) {
  const before = run.roster.map((p, i) => ({ id: p.player_id, sal: run.salaries[i] }));
  playSeason(run);
  const v = R.ownerVerdict(run);
  seasons++;
  seen.push(`${run.leagueYear}: ${v.wins}-${17 - v.wins} needed ${v.bar}`
    + (v.cleared ? ' PASS' : (v.fired ? ' FIRED' : ' on notice')));
  ok(`season ${run.seasonNo} judged against its own bar`,
    v.bar === Math.min(12, 7 + run.seasonNo), `bar ${v.bar}`);
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
    w.gone.every((g) => g.why === 'missed' || g.why === 'out'));

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
      ok('a dry wheel really is dry', R.wheelIsDry(run, sideOf(run.roster.length)) || !!err);
      const short = run.roster.length;
      R.takeTheField(run);
      ok('a short roster can still take the field',
        run.phase === R.PHASES.SEASON && run.roster.length === short, `${short} men`);
    }
    ok('the holes were filled or the wheel was dry', run.roster.length <= 12);
    ok('every new man is from the NEW league year',
      run.roster.every((p) => p.season === run.leagueYear),
      `seasons: ${[...new Set(run.roster.map((p) => p.season))].join(',')}`);
    ok('season two onward skips the coach screen', run.phase === R.PHASES.SEASON);
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
ok('a fired run is terminal', !run.fired || run.phase === R.PHASES.OVER);
if (run.fired) {
  const h = run.history;
  ok('fired means two consecutive misses',
    h.length >= 2 && h[h.length - 1].wins < h[h.length - 1].bar
      && h[h.length - 2].wins < h[h.length - 2].bar,
    h.slice(-2).map((x) => `${x.wins}/${x.bar}`).join(' then '));
  let threw = false;
  try { R.beginOffseason(run, byKey, lastSeason); } catch (_) { threw = true; }
  ok('a fired dynasty cannot open another winter', threw);
}

/* ─── and the modes that already ship are not a dynasty ──────────────────────────── */
const plain = R.createRun({ seed: 1 });
ok('a classic run has no dynasty state', !plain.dynasty && plain.salaries === null);
const full = R.createRun({ full: true, seed: 1 });
ok('a full team run is not a dynasty', full.full && !full.dynasty);

console.log('');
console.log(fails ? `${fails} FAILED` : 'all checks passed');
process.exit(fails ? 1 : 0);
