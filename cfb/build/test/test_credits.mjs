/* Whose touchdown it was, and how long the kick was.
 *
 *   node cfb/build/test/test_credits.mjs            # engine only
 *   (nohup node cfb/build/test/gzip_server.mjs &)
 *   node cfb/build/test/test_credits.mjs --browser  # and on the screen
 *
 * E.touchdownCredits hands every touchdown of yours to one of the drafted six and writes a
 * line of commentary for it. Three things have to hold and none of them is obvious from
 * reading the function:
 *
 *  1. IT NEVER TOUCHES THE SEASON'S RNG. One sequential stream plays every game in a run, so
 *     a draw taken from it here would consume a value the next week depends on and silently
 *     rewrite the rest of the year. Not a crash, just a leaderboard disagreeing with itself.
 *     The season below is played twice, once with the credits being built between the weeks
 *     and once without, and every result of both has to match.
 *
 *  2. THE PLAY FITS THE MAN. A quarterback credited with a touchdown ran it in; a receiver
 *     who never carries the ball is not credited with a rush; nobody catches a pass from
 *     himself.
 *
 *  3. THE SAME GAME TELLS THE SAME STORY. The broadcast calls a touchdown as it happens and
 *     the finished log lists it again, from the same seeded stream, so a player who watches
 *     a game and then reads the log has to see one game rather than two.
 *
 * The kicks are the other half. "You field goal" said nothing about what happened, and the
 * call now reads the distance. That distance is READ OFF THE DRIVE CHART sitting directly
 * above the log rather than drawn beside it, so the last section here draws the chart as it
 * ships, reads the bar off the canvas, converts where it stops back into a kick, and checks
 * the game would have called that number.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');
const E = require(path.join(ROOT, 'cfb/engine.js'));
const R = require(path.join(ROOT, 'cfb/run.js'));

let bad = 0;
const ok = (n, p, x) => { if (!p) bad++; console.log((p ? '  ok   ' : ' FAIL  ') + n + (x !== undefined ? '   ' + x : '')); };

const players = JSON.parse(fs.readFileSync(path.join(ROOT, 'cfb/data/cfb_player_seasons.json'), 'utf8'));
const teamSeasons = JSON.parse(fs.readFileSync(path.join(ROOT, 'cfb/data/cfb_team_seasons.json'), 'utf8'));
const leagueContext = JSON.parse(fs.readFileSync(path.join(ROOT, 'cfb/data/cfb_league_context.json'), 'utf8'));
const displayCal = JSON.parse(fs.readFileSync(path.join(ROOT, 'cfb/data/cfb_display_calibration.json'), 'utf8'));
const DATA = R.indexData(players, teamSeasons);

/* A roster the way the broadcast hands one over: the six men and the three columns that say
   what kind of player each of them is. */
const menOf = (roster, slotIndex) => roster.map((p, i) => ({
  name: p.name, pos: p.position, slot: E.SLOTS[slotIndex[i]],
  pass: p.pass_ppg || 0, rush: p.rush_ppg || 0, rec: p.rec_ppg || 0,
}));

/* ── 1. every touchdown of yours, and nothing else ──────────────────────────── */

const MEN = [
  { name: 'Vince Young', pos: 'QB', slot: 'QB', pass: 18.2, rush: 5.4, rec: 0 },
  { name: 'Reggie Bush', pos: 'RB', slot: 'RB', pass: 0, rush: 12.1, rec: 3.2 },
  { name: 'Larry Fitzgerald', pos: 'WR', slot: 'WR', pass: 0, rush: 0.2, rec: 14.8 },
  { name: 'Ted Ginn Jr.', pos: 'WR', slot: 'WR', pass: 0, rush: 0.6, rec: 9.1 },
  { name: 'Rob Gronkowski', pos: 'TE', slot: 'FLEX', pass: 0, rush: 0, rec: 7.4 },
  { name: 'Darren McFadden', pos: 'RB', slot: 'FLEX', pass: 0.3, rush: 10.5, rec: 2.1 },
];

/* The house rule is no en dashes and no em dashes anywhere, which includes the check for
   them: written as a literal or an escape this line would itself be an offender that
   scripts/check-dashes.mjs prints. Code points instead. */
const DASH_POINTS = [0x2013, 0x2014];
const hasDash = (s) => [...String(s)].some((ch) => DASH_POINTS.includes(ch.codePointAt(0)));

let scripts = 0, tds = 0, credits = 0, wrongAt = 0, qbCaught = 0, selfPass = 0;
let noRushCredited = 0, noRecCredited = 0, badYards = 0, emptyBlurb = 0, dashed = 0;
const scorers = new Map(), shapes = new Set();

for (let s = 0; s < 4000; s++) {
  const seed = 'credit|' + s;
  const you = 10 + Math.floor(60 * ((s * 2654435761) % 1000) / 1000);
  const them = 3 + Math.floor(50 * ((s * 40503) % 997) / 997);
  const script = E.scoringScript(you, them, you > them, E.createSeededRNG(E.hashSeed(seed)));
  if (!script.length) continue;
  scripts++;
  const c = E.touchdownCredits(script, MEN, E.createSeededRNG(E.hashSeed(seed + '|credits')));
  tds += script.filter((e) => e.team === 'you' && e.kind === 'TOUCHDOWN').length;
  credits += c.length;
  for (const x of c) {
    const e = script[x.at];
    if (!e || e.team !== 'you' || e.kind !== 'TOUCHDOWN') wrongAt++;
    const man = MEN.find((m) => m.name === x.scorer);
    if (man.pos === 'QB' && x.play === 'catch') qbCaught++;
    if (x.passer === x.scorer) selfPass++;
    if (x.play === 'run' && man.rush === 0) noRushCredited++;
    if (x.play === 'catch' && man.rec === 0) noRecCredited++;
    if (!(x.yards >= 1 && x.yards <= 99)) badYards++;
    if (!x.blurb || /undefined|NaN/.test(x.blurb + x.short)) emptyBlurb++;
    if (hasDash(x.blurb + x.short)) dashed++;
    scorers.set(x.scorer, (scorers.get(x.scorer) || 0) + 1);
    shapes.add(x.blurb.replace(/[0-9]+/g, '#').replace(/[A-Z][a-z]+/g, 'X'));
  }
}

console.log('\n=== the credits themselves ===');
ok('one credit per touchdown of yours, and none for anybody else', credits === tds,
  credits + ' credits for ' + tds + ' touchdowns across ' + scripts + ' games');
ok('every credit points at the play it belongs to', wrongAt === 0, String(wrongAt));
ok('a quarterback credited with a score ran it in', qbCaught === 0, String(qbCaught));
ok('nobody catches a pass from himself', selfPass === 0, String(selfPass));
ok('a man who never carries it is not credited with a run', noRushCredited === 0, String(noRushCredited));
ok('a man who never catches it is not credited with a catch', noRecCredited === 0, String(noRecCredited));
ok('every scoring play is a believable distance', badYards === 0, String(badYards));
ok('no blurb is empty or half-built', emptyBlurb === 0, String(emptyBlurb));
ok('no blurb carries a dash', dashed === 0, String(dashed));
ok('all six men score at some point', scorers.size === MEN.length,
  [...scorers].map(([k, v]) => k + ' ' + (100 * v / credits).toFixed(1) + '%').join(', '));
/* The point of several shapes per band is that a roster scoring four in a game does not read
   one sentence four times. If the pool ever collapses to a handful this catches it. */
ok('the commentary has real variety', shapes.size >= 12, shapes.size + ' distinct shapes');

/* Nobody should be able to hog the whole game, and nobody should be shut out of it: the
   weights are production times a form draw, so the spread has to stay inside reason. */
const share = [...scorers.values()].map((v) => 100 * v / credits).sort((a, b) => b - a);
ok('the best man does not score everything', share[0] < 40, share[0].toFixed(1) + '%');
ok('the sixth man is not shut out', share[share.length - 1] > 2, share[share.length - 1].toFixed(1) + '%');

/* ── 2. the same seed tells the same story ──────────────────────────────────── */

console.log('\n=== determinism ===');
let drifted = 0;
for (let s = 0; s < 300; s++) {
  const seed = 'same|' + s;
  const mk = () => E.touchdownCredits(
    E.scoringScript(35, 28, true, E.createSeededRNG(E.hashSeed(seed))),
    MEN, E.createSeededRNG(E.hashSeed(seed + '|credits')));
  if (JSON.stringify(mk()) !== JSON.stringify(mk())) drifted++;
}
ok('the same game credits the same men, every time', drifted === 0, String(drifted));

/* A roster with nobody who can reach an end zone gets no credits rather than a wrong one,
   and the broadcast falls back to what it always showed. */
const armless = MEN.map((m) => ({ ...m, rush: 0, rec: 0 }));
const someScript = E.scoringScript(31, 24, true, E.createSeededRNG(E.hashSeed('armless')));
ok('a roster that cannot reach an end zone is credited with nothing',
  E.touchdownCredits(someScript, armless, E.createSeededRNG(1)).length === 0);
ok('an empty roster is credited with nothing',
  E.touchdownCredits(someScript, [], E.createSeededRNG(1)).length === 0);

/* ── 2b. how long the kicks were ────────────────────────────────────────────── */

console.log('\n=== the kicks ===');
{
  const rng = E.createSeededRNG(E.hashSeed('kicks'));
  const all = [];
  for (let i = 0; i < 40000; i++) all.push(E.fieldGoalYards(rng));
  all.sort((a, b) => a - b);
  const median = all[Math.floor(all.length / 2)];
  const pct = (f) => 100 * all.filter(f).length / all.length;
  const inRange = all.every((y) => y >= 18 && y <= 63 && Number.isInteger(y));
  ok('every kick is a legal distance', inRange, all[0] + ' to ' + all[all.length - 1]);
  /* The three numbers that say the distribution looks like football rather than a uniform
     draw across the legal range, which would put the median near 40 with far too many
     twenty yard kicks and far too few long ones. */
  ok('the median kick is a middling one', median >= 36 && median <= 44, String(median));
  ok('the fifty-plus kick is ordinary but not the norm',
    pct((y) => y >= 50) >= 15 && pct((y) => y >= 50) <= 27, pct((y) => y >= 50).toFixed(1) + '%');
  ok('the chip shot exists and is not the common case',
    pct((y) => y < 30) >= 15 && pct((y) => y < 30) <= 30, pct((y) => y < 30).toFixed(1) + '%');

  /* Only kicks get a distance, and every one of them gets exactly one. */
  const sc = E.scoringScript(31, 27, true, E.createSeededRNG(E.hashSeed('kickscript')));
  const map = E.fieldGoalDistances(sc, E.createSeededRNG(E.hashSeed('kickscript|fg')));
  const kicks = sc.filter((e) => e.kind === 'FIELD GOAL').length;
  ok('one distance per kick and none for anything else', map.size === kicks,
    map.size + ' for ' + kicks + ' kicks in ' + sc.length + ' scores');
  ok('every distance is keyed to a kick',
    [...map.keys()].every((i) => sc[i] && sc[i].kind === 'FIELD GOAL'));
  const again = E.fieldGoalDistances(sc, E.createSeededRNG(E.hashSeed('kickscript|fg')));
  ok('the same seed measures the same kicks',
    JSON.stringify([...map]) === JSON.stringify([...again]));
}

/* ── 3. the season is not disturbed by being narrated ───────────────────────── */

console.log('\n=== the season stream is untouched ===');

/* The best man on every board, which is probe_bracket.mjs's greedy policy and the shape of
   roster this is actually about: six men who score. */
const CTX = {
  battery: JSON.parse(fs.readFileSync(path.join(ROOT, 'cfb/data/cfb_battery.json'), 'utf8')),
  curated: JSON.parse(fs.readFileSync(path.join(ROOT, 'cfb/data/cfb_curated.json'), 'utf8')),
  coaches: JSON.parse(fs.readFileSync(path.join(ROOT, 'cfb/data/cfb_coaches.json'), 'utf8')),
};

function draft(seed) {
  const run = R.createRun({ seed });
  for (let i = 0; i < 14 && run.roster.length < E.SLOTS.length; i++) {
    let draw;
    try { draw = R.spin(run, DATA); } catch (e) { return null; }
    const list = DATA.playersByTeamSeason[draw.team_season_id] || [];
    const opts = draw.options.map((k) => {
      const [id, s] = k.split('|');
      return list.find((p) => String(p.player_id) === id && String(p.season) === s);
    }).filter(Boolean).filter((p) => R.slotForPlayer(run, p) !== null);
    if (!opts.length) return null;
    R.sign(run, opts.reduce((b, p) => (p.ppr_ppg_mean > b.ppr_ppg_mean ? p : b)));
  }
  return run.roster.length === E.SLOTS.length ? run : null;
}

/* A whole run, week by week, with the option of building the credits between the weeks
   exactly the way the screen does. If they ever drew from the season's own rng the two runs
   would part company at the first game after the first call. */
function playSeason(seed, narrate) {
  const run = draft(seed);
  if (!run) return null;
  R.startSeason(run, DATA, CTX);
  const men = menOf(run.roster, run.slotIndex);
  const out = [];
  const step = () => {
    const r = R.advanceWeek(run, DATA, leagueContext, displayCal);
    out.push((r.round || ('w' + r.week)) + ':' + r.shownYou + '-' + r.shownThem
      + '|' + r.won + '|' + r.opponent_id + '|' + r.yourScore + '|' + r.oppScore);
    if (narrate && r.shownYou != null) {
      const seedStr = run.seed + '|' + (r.round || 'week') + '|' + r.shownYou + '-' + r.shownThem;
      const script = E.scoringScript(r.shownYou, r.shownThem, r.won,
        E.createSeededRNG(E.hashSeed(seedStr)));
      E.touchdownCredits(script, men, E.createSeededRNG(E.hashSeed(seedStr + '|credits')));
    }
  };
  for (let w = 0; w < 40 && run.phase === R.PHASES.SEASON; w++) step();
  if (run.phase === R.PHASES.SEEDING && run.playoffSeed && run.playoffSeed.made) {
    R.startPlayoffs(run);
    for (let w = 0; w < 6 && run.phase === R.PHASES.PLAYOFFS; w++) step();
  } else if (run.phase === R.PHASES.SEEDING && run.playoffSeed && run.playoffSeed.bowl) {
    R.startBowl(run);
    const b = R.playBowlGame(run, DATA, leagueContext, displayCal);
    out.push('bowl:' + b.shownYou + '-' + b.shownThem + '|' + b.won);
  }
  out.push('end:' + JSON.stringify(run.outcome || null));
  return out.join(' ');
}

let seasons = 0, diverged = 0, postseasons = 0;
for (let s = 0; s < 50; s++) {
  const quiet = playSeason(1000 + s, false);
  const loud = playSeason(1000 + s, true);
  if (quiet === null || loud === null) continue;
  seasons++;
  if (/CFP|bowl:/.test(quiet)) postseasons++;
  if (quiet !== loud) diverged++;
}
ok('the seasons this checks were actually played', seasons >= 40, seasons + ' seasons');
ok('and they reached a postseason', postseasons >= 20, postseasons + ' with a playoff or a bowl');
ok('narrating a season changes none of it', diverged === 0,
  diverged + ' of ' + seasons + ' seasons drifted');

/* ── 4. and on the screen ───────────────────────────────────────────────────── */

if (process.argv.includes('--browser')) {
  const { chromium } = await import('playwright');
  const SS = process.env.SS || '/tmp/';
  /* Seed 106 is test_bracket.mjs's bye-seed run: a four seed with three playoff games to
     watch. The same six picks, clicked by player and slot, so this drafts the roster node
     drafts rather than whatever the tiles happen to offer first. */
  const RUN_SEED = 106;
  const PICKS = ['243503|2009:0', '4047337|2019:1', '173412|2007:4', '4259550|2022:2',
    '381959|2010:3', '3126339|2017:5'];

  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 800 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.addInitScript((s) => { window.PS_CFB_SEED = s; }, RUN_SEED);
  await p.goto('http://localhost:8081/cfb/index.html', { waitUntil: 'domcontentloaded', timeout: 40000 });
  await p.waitForTimeout(2600);
  await p.evaluate(() => { const e = document.getElementById('b-play-intro'); if (e) e.click(); });
  await p.waitForTimeout(3000);

  for (const pick of PICKS) {
    const [key, want] = pick.split(':');
    let signed = false;
    for (let tries = 0; tries < 40 && !signed; tries++) {
      const slot = await p.$('#sheet.on .slotopt[data-i="' + want + '"]');
      if (slot) { await slot.click(); await p.waitForTimeout(800); continue; }
      signed = await p.evaluate((k) => {
        const hit = () => document.querySelector('#opts .tile[data-k="' + k + '"]');
        let t = hit();
        if (!t) { for (const tab of document.querySelectorAll('#tabs .tab')) { tab.click(); t = hit(); if (t) break; } }
        if (!t) return false;
        t.click(); return true;
      }, key);
      if (!signed) await p.waitForTimeout(700);
    }
    if (!signed) { ok('signs ' + key, false); break; }
    await p.waitForTimeout(2200);
    const after = await p.$('#sheet.on .slotopt[data-i="' + want + '"]');
    if (after) { await after.click(); await p.waitForTimeout(1400); }
  }
  ok('the draft fills the squad', !!(await p.$('#s-squad.on')));

  /* The names this run drafted, read off the squad rail, so the assertions below are about
     THIS roster rather than a list written down here that can go stale. The rail carries
     last names, which is exactly what a log line is keyed on. */
  const roster = await p.$$eval('#rail2 .rnm',
    (es) => es.map((e) => (e.textContent || '').trim()).filter(Boolean));

  await p.evaluate(() => document.getElementById('b-play').click());
  for (let i = 0; i < 30; i++) {
    if (await p.$('#s-seed.on')) break;
    await p.evaluate(() => { const e = document.getElementById('b-sim'); if (e && e.offsetParent) e.click(); });
    await p.waitForTimeout(900);
  }
  ok('the season ends at the seeding screen', !!(await p.$('#s-seed.on')));
  await p.evaluate(() => document.getElementById('b-po').click());

  /* THE CAPTION IS SAMPLED, NOT SNAPSHOTTED. A call is on screen for about a second before
     the next one replaces it, so reading it once tests the machine's speed rather than the
     game. Everything is collected across the whole postseason and the claims are made
     against what was seen. */
  const caps = new Set();
  const capH = new Set();
  let clipped = 0, overflowed = 0, sampled = 0, shot = false, kickShot = false;
  for (let i = 0; i < 900; i++) {
    if (await p.$('#s-po.on')) {
      const seen = await p.evaluate(() => {
        const cap = document.getElementById('po-cap');
        const doc = document.documentElement;
        const lines = [...document.querySelectorAll('#po-log .pl .w')];
        return {
          cap: (cap.textContent || '').trim(),
          h: cap.offsetHeight,
          clipped: lines.filter((e) => e.scrollWidth > e.clientWidth + 1).length,
          over: [...document.querySelectorAll('#s-po *')]
            .filter((e) => e.getBoundingClientRect().right > doc.clientWidth + 1).length,
        };
      });
      sampled++;
      if (seen.cap) caps.add(seen.cap);
      capH.add(seen.h);
      clipped += seen.clipped;
      overflowed += seen.over;
      if (!shot && /yards|yard/.test(seen.cap)) { await p.screenshot({ path: SS + 'cfb_credit_call.png' }); shot = true; }
      if (!kickShot && /YARD FIELD GOAL/.test(seen.cap)) { await p.screenshot({ path: SS + 'cfb_credit_kick.png' }); kickShot = true; }
    }
    if (await p.$('#s-over.on')) break;
    await p.waitForTimeout(120);
  }

  const log = await p.$$eval('#po-log .pl .w', (es) => es.map((e) => (e.textContent || '').trim()));
  const yourLog = await p.$$eval('#po-log .pl.you .w', (es) => es.map((e) => (e.textContent || '').trim()));
  const capText = [...caps].join(' ~ ');

  console.log('\n=== on the screen ===');
  console.log('  a call: ' + ([...caps].find((c) => /yard/.test(c)) || 'none seen'));
  console.log('  a line: ' + (log.find((l) => /yard/.test(l)) || 'none seen'));
  ok('the postseason was actually watched', sampled > 0, sampled + ' samples');
  ok('a touchdown of yours names the man who scored it',
    yourLog.some((l) => /\d+-yard TD (run|catch)/.test(l)), yourLog.slice(0, 4).join(' | '));
  ok('no touchdown of yours is still called "You touchdown"',
    !yourLog.some((l) => /^You touchdown/i.test(l)), yourLog.filter((l) => /^You touchdown/i.test(l)).join(' | '));
  ok('the call banner reads the commentary, not the word You',
    [...caps].some((c) => /yard/.test(c)), capText.slice(0, 160));
  ok('the squad rail was read', roster.length === E.SLOTS.length, roster.join(', '));
  ok('every name called is a man this run drafted',
    yourLog.filter((l) => /-yard TD /.test(l))
      .every((l) => roster.some((n) => n && l.startsWith(n + ' '))),
    roster.join(', '));
  ok('no log line is cut off mid-word', clipped === 0, String(clipped));
  ok('nothing on the broadcast runs off the side', overflowed === 0, String(overflowed));
  /* The call sits directly above the log, so a box that changes size moves every line under
     it in the middle of the animation. The reservation is two lines of commentary. */
  ok('the call box is the same size all game', capH.size === 1, [...capH].join(', '));
  /* Every kick in the game says how far, on both sides of the ball, and none of them is the
     old bare "field goal". */
  const kickLines = log.filter((l) => /field goal/i.test(l));
  ok('every field goal says how far it was',
    kickLines.length > 0 && kickLines.every((l) => /\d+-yard field goal/.test(l)),
    kickLines.slice(0, 4).join(' | ') || 'no kick in this game');
  ok('the kicks called are legal distances',
    kickLines.every((l) => { const m = /(\d+)-yard field goal/.exec(l); return m && +m[1] >= 18 && +m[1] <= 63; }),
    kickLines.slice(0, 4).join(' | '));
  ok('a kick is called in the banner as well as the log',
    [...caps].some((c) => /\d+-YARD FIELD GOAL/.test(c)),
    ([...caps].find((c) => /FIELD GOAL/.test(c)) || 'none seen'));
  ok('nothing logged', errs.length === 0, errs.join(' | ') || 'none');

  /* ── and the bowl, which is the other broadcast ──────────────────────────────
     A run that misses the twelve still plays a full game on the same clock and the same
     field, and it is the one a player who did NOT make the playoff watches.

     REACHED BY DRAFTING A GOOD-BUT-NOT-GREAT MAN ON EVERY BOARD, which needs no per-seed
     list of picks to reproduce: the cheapest man every time misses the postseason entirely
     (0 bowls in 60 seasons, measured) and the best man every time makes the field. A man a
     quarter of the way down a board priced high to low lands in a bowl about half the time,
     so a few seeds finds one. */
  console.log('\n=== the bowl ===');
  let bowlLog = null, bowlErrs = [];
  for (let attempt = 0; attempt < 5 && !bowlLog; attempt++) {
    const bp = await ctx.newPage();
    bp.on('pageerror', (e) => bowlErrs.push(e.message));
    await bp.addInitScript((s) => { window.PS_CFB_SEED = s; }, 500 + attempt);
    await bp.goto('http://localhost:8081/cfb/index.html', { waitUntil: 'domcontentloaded', timeout: 40000 });
    await bp.waitForTimeout(2600);
    await bp.evaluate(() => { const e = document.getElementById('b-play-intro'); if (e) e.click(); });
    await bp.waitForTimeout(2500);
    for (let g = 0; g < E.SLOTS.length; g++) {
      for (let tries = 0; tries < 30; tries++) {
        const slot = await bp.$('#sheet.on .slotopt[data-i]');
        if (slot) { await slot.click(); await bp.waitForTimeout(900); continue; }
        const took = await bp.evaluate(() => {
          const tiles = [...document.querySelectorAll('#opts .tile:not(.off)')];
          if (!tiles.length) return false;
          /* The ALL tab is priced high to low, so a quarter of the way down is a good man
             who is not the best man on the board. */
          tiles[Math.floor(tiles.length * 0.25)].click();
          return true;
        });
        if (took) { await bp.waitForTimeout(1600); break; }
        await bp.waitForTimeout(600);
      }
      const after = await bp.$('#sheet.on .slotopt[data-i]');
      if (after) { await after.click(); await bp.waitForTimeout(1400); }
    }
    if (!(await bp.$('#s-squad.on'))) { await bp.close(); continue; }
    await bp.evaluate(() => document.getElementById('b-play').click());
    for (let i = 0; i < 30; i++) {
      /* A run that misses BOTH the field and a bowl never reaches the seeding screen, so
         this has to give up on the over screen rather than sim thirty times into nothing. */
      if (await bp.$('#s-seed.on')) break;
      if (await bp.$('#s-over.on')) break;
      await bp.evaluate(() => { const e = document.getElementById('b-sim'); if (e && e.offsetParent) e.click(); });
      await bp.waitForTimeout(900);
    }
    if (!(await bp.$('#s-seed.on'))) { await bp.close(); continue; }
    const badge = ((await bp.textContent('#sd-badges')) || '').trim();
    if (/seed/i.test(badge)) { await bp.close(); continue; }   // it made the field after all
    await bp.evaluate(() => { const e = document.getElementById('b-po'); if (e) e.click(); });
    await bp.waitForTimeout(1200);
    if (!(await bp.$('#s-bowl.on'))) { await bp.close(); continue; }
    await bp.evaluate(() => { const e = document.getElementById('b-bowl-fast'); if (e) e.click(); });
    await bp.waitForTimeout(1500);
    const lines = await bp.$$eval('#bowl-log .pl.you .w', (es) => es.map((e) => (e.textContent || '').trim()));
    /* A bowl your side wins on field goals proves nothing about who scored the touchdowns,
       so keep going until one of them has a touchdown in it. */
    if (lines.some((l) => /TD (run|catch)|touchdown/i.test(l))) {
      bowlLog = lines;
      await bp.screenshot({ path: SS + 'cfb_credit_bowl.png' });
    }
    await bp.close();
  }
  if (bowlLog) {
    console.log('  a line: ' + (bowlLog.find((l) => /yard/.test(l)) || 'none seen'));
    ok('a bowl names its scorers too',
      bowlLog.some((l) => /\d+-yard TD (run|catch)/.test(l)),
      bowlLog.slice(0, 4).join(' | '));
    ok('no touchdown in a bowl is still called "You touchdown"',
      !bowlLog.some((l) => /^You touchdown/i.test(l)));
    ok('nothing logged in the bowl', bowlErrs.length === 0, bowlErrs.join(' | ') || 'none');
  } else {
    ok('a bowl run with a touchdown in it was reached', false,
      'five drafts and none of them reached a bowl your side scored a touchdown in');
  }

  /* THE WORST CALL THE ENGINE CAN WRITE, on the narrowest phone. Built from the two longest
     names in the data rather than from whatever this run happened to draft, because the run
     that finds it in the wild is somebody's and not this test's. */
  console.log('\n=== the longest possible call, at 320px ===');
  const longest = (pos) => players.filter((x) => x.position === pos)
    .reduce((a, x) => (x.name.length > a.name.length ? x : a));
  const worstMen = [
    { name: longest('QB').name, pos: 'QB', slot: 'QB', pass: 30, rush: 0, rec: 0 },
    { name: longest('WR').name, pos: 'WR', slot: 'WR', pass: 0, rush: 0, rec: 20 },
  ];
  /* Drawn rather than written down: whatever the longest form the pool holds turns out to
     be, this finds it. */
  let worst = '';
  for (let s = 0; s < 4000; s++) {
    const c = E.touchdownCredits(
      [{ team: 'you', kind: 'TOUCHDOWN', q: 4, sec: 60, you: 42, them: 35, note: 'two-point conversion' }],
      worstMen, E.createSeededRNG(E.hashSeed('worst|' + s)));
    if (c.length && c[0].blurb.length > worst.length) worst = c[0].blurb;
  }
  const narrow = await ctx.newPage();
  await narrow.setViewportSize({ width: 320, height: 720 });
  await narrow.goto('http://localhost:8081/cfb/index.html', { waitUntil: 'domcontentloaded', timeout: 40000 });
  await narrow.waitForTimeout(2000);
  const box = await narrow.evaluate((text) => {
    document.getElementById('s-po').classList.add('on');
    const cap = document.getElementById('po-cap');
    cap.innerHTML = '<div class="call you"><b>TOUCHDOWN</b><span>' + text
      + ', two-point conversion · 42-35</span></div>';
    const sp = cap.querySelector('span');
    const doc = document.documentElement;
    return {
      h: cap.offsetHeight,
      lines: Math.round(sp.offsetHeight / parseFloat(getComputedStyle(sp).lineHeight)),
      over: cap.getBoundingClientRect().right > doc.clientWidth + 1,
    };
  }, worst);
  console.log('  ' + worst);
  ok('even the longest call stays on the page', !box.over, JSON.stringify(box));
  /* Four is what the reservation above is written against, and it is the number the comment
     beside .pocap quotes. If a longer form is ever added to the pool this says so. */
  ok('and it does not run past four lines', box.lines <= 4, box.lines + ' lines, ' + box.h + 'px');

  /* ── the kick against the PIXELS of the picture ──────────────────────────────
     Everything above this reasons about d.endYard, which is the number both the call and the
     chart are supposed to come from. That is an argument about the code. This is the
     measurement: draw the chart as it ships, read the bar off the canvas, convert where it
     stops back into a kick, and check the game would have called that number.

     It matters because "the chart draws endYard" is only true for a FINISHED drive. The
     renderer interpolates one that is still running, and the call lands exactly on the
     boundary. If that ever moved by a frame the bar on screen and the number under it would
     part company, and no assertion about the data would notice.

     drawDriveChart is nested in the page's one script, so it is reached the way every harness
     for this page reaches anything: one hook at the boot() anchor, on a throwaway copy. */
  console.log('\n=== the kick, measured off the drawn chart ===');
  const PROBE = path.join(ROOT, 'cfb/__test_credits.html');
  const HOOK = `
window.__CR={
  /* Draw a chart of exactly these drives and measure where the last bar stops, in yards.
     The geometry is recomputed from drawDriveChart's own constants rather than guessed. */
  measure(drives,upTo){
    const W=680,H=210,dpr=window.devicePixelRatio||1;
    const c=document.createElement('canvas'); c.width=W; c.height=H;
    const ctx=c.getContext('2d',{willReadFrequently:true});
    const YOU='#00aaff', THEM='#ff5522';
    drawDriveChart(ctx,W,H,drives,upTo,YOU,THEM,'YOU','OPP');
    const padL=4*dpr,padT=10*dpr,padB=14*dpr;
    const fw=W-padL-4*dpr, fh=H-padT-padB;
    const ezW=Math.round(fw*0.06), pfL=padL+ezW, pfW=fw-ezW*2;
    const visible=drives.filter(d=>d.tStart<=upTo);
    const shown=visible.slice(Math.max(0,visible.length-7));
    const rowH=fh/7, i=shown.length-1;
    const y=Math.round(padT+i*rowH+rowH/2);
    const px=ctx.getImageData(0,y,W,1).data;
    const want=(hex)=>[parseInt(hex.slice(1,3),16),parseInt(hex.slice(3,5),16),parseInt(hex.slice(5,7),16)];
    const team=shown[i].team==='you'?want(YOU):want(THEM);
    /* The bar carries a sheen and sits over dark green, so a pixel is "the bar" by being
       nearer the team colour than the field is, not by equalling it. The arrow tip at the
       leading edge is the same colour and is deliberately included: it is part of what a
       player sees as the end of the drive. */
    const near=(o)=>{const dr=px[o]-team[0],dg=px[o+1]-team[1],db=px[o+2]-team[2];
      return Math.sqrt(dr*dr+dg*dg+db*db)<110;};
    let lo=-1,hi=-1;
    for(let x=0;x<W;x++){ if(near(x*4)){ if(lo<0)lo=x; hi=x; } }
    if(lo<0) return {found:false,row:y};
    const edge=shown[i].team==='you'?hi:lo;
    return {found:true,yards:(edge-pfL)/pfW*100,row:y,lo,hi,
      endYard:shown[i].endYard,team:shown[i].team};
  },
  /* The distances the game actually SAYS, after the chart's clamps have had their turn. The
     yard line a kick is drawn at cannot be behind where the drive started or past the 97, so
     the delivered numbers are not the raw band draw and have to be measured separately. */
  kicks(n){
    const out=[];
    for(let s=0;s<n;s++){
      const key='kickprobe|'+s;
      const script=E.scoringScript(21+(s%27),10+(s%23),true,E.createSeededRNG(E.hashSeed(key)));
      const drives=generateDrives(script,E.createSeededRNG(E.hashSeed(key+'|drives')));
      for(const [i,y] of kickDistances(script,drives,key)) out.push([y,script[i].team]);
    }
    return out;
  },
};
boot();`;
  const src = fs.readFileSync(path.join(ROOT, 'cfb/index.html'), 'utf8');
  if (src.split('\nboot();').length !== 2) throw new Error('the boot() anchor moved; update this file');
  fs.writeFileSync(PROBE, src.replace('\nboot();', HOOK));
  try {
    const pr = await ctx.newPage();
    pr.on('pageerror', (e) => { bad++; console.log(' FAIL  page error   ' + String(e.message).split('\n')[0]); });
    await pr.goto('http://localhost:8081/cfb/__test_credits.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await pr.waitForFunction(() => window.__CR, null, { timeout: 60000 });

    /* One kick per case, at both ends of the range and on both sides of the ball, plus a
       drive in front of it so the bar being measured is not also the first row. */
    const cases = [
      { tag: 'a 20 yard chip shot', team: 'you', startYard: 62, endYard: 97 },
      { tag: 'a 31 yarder', team: 'you', startYard: 40, endYard: 86 },
      { tag: 'a 52 yarder', team: 'you', startYard: 28, endYard: 65 },
      { tag: 'a 60 yarder from distance', team: 'you', startYard: 20, endYard: 57 },
      { tag: 'the opponent from 24', team: 'them', startYard: 70, endYard: 7 },
      { tag: 'the opponent from 49', team: 'them', startYard: 80, endYard: 32 },
    ];
    for (const c of cases) {
      const drives = [
        { team: c.team === 'you' ? 'them' : 'you', startYard: 50, endYard: 50, result: 'punt', tStart: 0, tEnd: 100 },
        { team: c.team, startYard: c.startYard, endYard: c.endYard, result: 'field goal', tStart: 100, tEnd: 400, at: 0 },
      ];
      const m = await pr.evaluate(([d, u]) => window.__CR.measure(d, u), [drives, 400]);
      /* What the page would say, from the same drive: kickDistances' own arithmetic. */
      const back = c.team === 'you' ? 100 - c.endYard : c.endYard;
      const called = Math.max(18, Math.min(63, Math.round(back) + 17));
      const drawnBack = m.found ? (c.team === 'you' ? 100 - m.yards : m.yards) : null;
      const drawnKick = m.found ? drawnBack + 17 : null;
      ok(c.tag + ': the bar stops where the call says it did',
        m.found && Math.abs(drawnKick - called) <= 2.2,
        JSON.stringify({ called, measuredOffCanvas: m.found ? +drawnKick.toFixed(1) : 'no bar found', endYard: c.endYard }));
    }
    /* And the boundary the whole thing turns on: at the instant the call is made the drive is
       finished rather than part drawn. A frame early and the bar is short of where the number
       says the kick was taken from. */
    const boundary = [
      { team: 'them', startYard: 50, endYard: 50, result: 'punt', tStart: 0, tEnd: 100 },
      { team: 'you', startYard: 40, endYard: 86, result: 'field goal', tStart: 100, tEnd: 400, at: 0 },
    ];
    const atCall = await pr.evaluate((d) => window.__CR.measure(d, 400), boundary);
    const midDrive = await pr.evaluate((d) => window.__CR.measure(d, 250), boundary);
    ok('the drive is complete at the moment the call is made, not still running',
      Math.abs((100 - atCall.yards) + 17 - 31) <= 2.2
      && (100 - midDrive.yards) + 17 > 31 + 4,
      JSON.stringify({ atTheCall: +((100 - atCall.yards) + 17).toFixed(1),
        halfway: +((100 - midDrive.yards) + 17).toFixed(1) }));

    /* And what the game says over a lot of games, which is not the same question as what the
       band draw returns: the yard line a kick is drawn at is clamped both ends, so a chip
       shot behind its own drive start gets pushed out and a 63 yarder gets pulled in. */
    const kicked = await pr.evaluate(() => window.__CR.kicks(1500));
    const ys = kicked.map((k) => k[0]).sort((a, b) => a - b);
    const kpct = (f) => 100 * ys.filter(f).length / ys.length;
    const mine = kicked.filter((k) => k[1] === 'you').length;
    console.log('  ' + ys.length + ' kicks: median ' + ys[Math.floor(ys.length / 2)]
      + ', ' + kpct((y) => y >= 50).toFixed(1) + '% from fifty plus, '
      + kpct((y) => y < 30).toFixed(1) + '% inside thirty');
    ok('the delivered kicks are all legal', ys[0] >= 18 && ys[ys.length - 1] <= 63,
      ys[0] + ' to ' + ys[ys.length - 1]);
    ok('the delivered median is still a middling kick',
      ys[Math.floor(ys.length / 2)] >= 34 && ys[Math.floor(ys.length / 2)] <= 46,
      String(ys[Math.floor(ys.length / 2)]));
    ok('the clamps have not piled the kicks into the tails',
      kpct((y) => y >= 50) <= 30 && kpct((y) => y < 30) <= 35,
      kpct((y) => y >= 50).toFixed(1) + '% long, ' + kpct((y) => y < 30).toFixed(1) + '% short');
    ok('both sides of the ball get their kicks called',
      mine > 0 && mine < kicked.length, mine + ' of ' + kicked.length + ' are yours');
    await pr.close();
  } finally {
    if (fs.existsSync(PROBE)) fs.unlinkSync(PROBE);
  }
  await b.close();
}

console.log(bad ? '\n' + bad + ' FAILED' : '\nall clear');
process.exit(bad ? 1 : 0);
