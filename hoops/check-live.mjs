/*
 * check-live.mjs - the game you play yourself, in the engine and on the page.
 *
 *   node hoops/check-live.mjs
 *   node hoops/check-live.mjs --quick     the engine half only, no browser
 *
 * ── WHY THIS FILE EXISTS SEPARATELY FROM verify.mjs ────────────────────────
 *
 * verify.mjs asks whether the model is right. Its subject is a season settled
 * by resolveGame, and every number in it comes out of a function it can call
 * in node. A live game is a sim playing forward while a screen animates it,
 * pauses for a decision, and writes a play by play beside it, and the engine
 * was correct the whole time the screen was not. That is check-boss.mjs's own
 * argument in the football game, arriving here.
 *
 * ── THE THREE THINGS THAT CAN GO WRONG AND SAY NOTHING ─────────────────────
 *
 * IT STOPS BEING resolveGame. The whole licence for a forward sim in this
 * engine is that it is FITTED to the resolver rather than being a second
 * opinion about basketball, because the win-share model behind resolveGame is
 * fitted to twenty-two real NBA records and every TARGETS band is anchored to
 * it. A live game quietly two points a side stronger would move the title
 * rate, and nothing anywhere would report it. So the fit is measured here,
 * against the same four matchups the constant was solved on.
 *
 * THE BOARD DISAGREES WITH ITS OWN LOG. This is the one screen on the site
 * that prints a running score beside a list of what produced it, so it is the
 * one screen where a reader can catch it, and the only one where getting it
 * wrong throws nothing. Asserted as a PROPERTY of the column rather than as a
 * final score: a pinned total passes on a log whose middle is nonsense.
 *
 * A GAME THE PLAYER WON IS NOT THE GAME THE BRACKET RECORDS. Playing decides
 * it, so the live result has to be what the series carries. Two paths reach
 * the bracket (the resolver and liveResult) and they answer in the same shape,
 * which is exactly the shape that lets one be silently dropped.
 *
 * NOTHING HERE REACHES A NETWORK. The Supabase host and the supabase-js CDN
 * are both refused, so this file cannot put a fixture on the real board.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PW = '/opt/node22/lib/node_modules/playwright/index.js';
const QUICK = process.argv.includes('--quick');

const require = createRequire(import.meta.url);
const E = require(path.join(HERE, 'engine.js'));
const R = require(path.join(HERE, 'run.js'));
const read = (f) => JSON.parse(fs.readFileSync(path.join(HERE, 'data', f), 'utf8'));
E.setTeams(read('teams.json'));
E.setCuratedChemistry(read('chemistry.json'));
const DATA = R.indexData(read('players.json'));

let pass = 0;
const failures = [];
const ok = (cond, what) => { if (cond) pass++; else failures.push(what); };
const near = (a, b, tol, what) => ok(Math.abs(a - b) <= tol,
  `${what}\n      ${a.toFixed(2)} against ${b.toFixed(2)}, tolerance ${tol}`);
const head = (s) => console.log('\n' + s + '\n' + '-'.repeat(s.length));

/* A FIXTURE ROSTER OFF A REAL CLUB, one man a slot. The slot list is the
   engine's own, never a copy: written out here it was `['PG','SG','SF','PF',
   'C','6TH']`, which is a second copy of a list that has since changed, and a
   fixture a slot longer than the game drafts is a fixture testing a roster
   nobody can build. */
function fixtureFive(season, club) {
  const rows = DATA.players.filter((p) => p.s === season && p.t === club)
    .slice(0, E.SLOTS.length);
  return rows.map((p, i) => ({ ...p, _slot: E.SLOTS[i] }));
}
const stats = (a) => {
  const m = a.reduce((s, x) => s + x, 0) / a.length;
  return { mean: m, sd: Math.sqrt(a.reduce((s, x) => s + (x - m) * (x - m), 0) / a.length) };
};

// ── 1. one game adds up ─────────────────────────────────────────────────────
head('1. a live game adds up, and its log agrees with its scoreboard');
{
  const men = fixtureFive(1996, 'CHI');
  ok(men.length === E.SLOTS.length,
    `the fixture is a real ${E.SLOTS.length} man roster (${men.length})`);

  let plays = 0, boxBad = 0, colBad = 0, parityBad = 0, ptsBad = 0, shotBad = 0;
  let lineSum = 0, scoreSum = 0, otGames = 0;
  const rng = E.createSeededRNG(7717);
  for (let g = 0; g < 400; g++) {
    const sim = E.liveCreate(men, 114.0, 110.0, rng, 1.02);
    const res = E.liveFinish(sim, rng);

    /* THE COLUMN, READ BOTTOM TO TOP. Only the side that had the ball may have
       moved, and it must have moved by exactly what the play was worth. A
       final score that happens to be right says nothing about the middle. */
    let you = 0, them = 0;
    for (const p of sim.plays) {
      plays++;
      if (p.mine) { you += p.pts; } else { them += p.pts; }
      if (p.you !== you || p.them !== them) colBad++;
    }
    if (you !== sim.you || them !== sim.them) colBad++;

    /* EXACTLY EQUAL, and the word is the assertion. Written as "within one"
       it passes on the defect it exists for: regulation divides into 198
       possessions, so an end condition read off the clock rather than off the
       count gave the side that goes first a 199th, in EVERY game, worth +1.3
       points and +4.1 of win rate against resolveGame. One is not a rounding
       allowance here, it is the whole bug. */
    const mine = sim.plays.filter((p) => p.mine).length;
    const theirs = sim.plays.length - mine;
    if (mine !== theirs) parityBad++;

    /* The box score is what happened rather than a decomposition, so it has
       to reconcile exactly: every point on the sheet is a point on the
       scoreboard, and nobody made more than he took. */
    let sum = 0;
    for (const l of res.lines) {
      sum += l.pts;
      if (l.pts !== 2 * (l.fgm - l.tpm) + 3 * l.tpm + l.ftm) ptsBad++;
      if (l.fgm > l.fga || l.tpm > l.tpa || l.ftm > l.fta || l.tpa > l.fga) shotBad++;
    }
    if (sum !== res.yourPoints) boxBad++;
    lineSum += sum; scoreSum += res.yourPoints;
    if (res.ot) otGames++;
    if (res.yourPoints < 50 || res.oppPoints < 50) boxBad++;
    if (res.won !== (res.yourPoints > res.oppPoints)) boxBad++;
    if (res.yourPoints === res.oppPoints) boxBad++;
  }
  ok(plays > 70000, `it actually played something (${plays} possessions)`);
  is0(colBad, 'the running score in the log is the score after every play');
  is0(parityBad, 'both sides get the same number of possessions');
  is0(boxBad, 'the box score is the scoreline, and nobody finishes level');
  is0(ptsBad, 'every points total is his own twos, threes and free throws');
  is0(shotBad, 'nobody makes more than he takes, or takes more threes than shots');
  ok(lineSum === scoreSum, 'the box score lines are the whole of the team score');
  ok(otGames > 0 && otGames < 100, `overtime happens and is rare (${otGames} of 400)`);
}

function is0(n, what) { ok(n === 0, `${what}\n      ${n} failures`); }

// ── 2. the fit against resolveGame ──────────────────────────────────────────
head('2. it is a second sampler of resolveGame and not a second model');
{
  /* THE SAME FOUR MATCHUPS LIVE.PULL WAS SOLVED ON, and four rather than one
     because the two ways this goes wrong are both invisible in an even game:
     a correction proportional to a team's own scoring rate shows up only as a
     favourite and an underdog landing on different spreads. */
  const CASES = [
    { n: 'even      ', pf: 113.4, pa: 110.2, adv: 1.02 },
    { n: 'favourite ', pf: 118.0, pa: 104.0, adv: 1.03 },
    { n: 'underdog  ', pf: 104.0, pa: 117.0, adv: 1.00 },
    { n: 'grind      ', pf: 98.0, pa: 99.5, adv: 1.02 },
  ];
  /* --quick DOES NOT CUT THIS SECTION, and the reason is the whole of why the
     first draft of it failed. A forward game is 198 possessions of arithmetic
     and nothing else: forty thousand of them take under two seconds. Cutting
     the sample bought a second and cost the band its teeth, because at 1,500
     a spread near 9 carries a standard error of 0.16 and a win rate near 66%
     carries 1.2 points, so the band had to be widened past the defect it
     exists to catch. A file that cannot resolve the move is not the file to
     measure it in, and here there was never any reason to be that file. */
  const N = 20000;
  /* THE BANDS ARE DERIVED AND NOT TYPED. One standard error on a spread near
     9 is 9/sqrt(2N), and on the DIFFERENCE of two independent arms it is
     sqrt(2) of that; a win rate's is the ordinary binomial one at the rate
     actually measured, because a favourite at 91% is far steadier than a
     coin flip and a worst-case 0.5 would hand that row four times the room
     it needs. Four of those plus the residual this was fitted to.
     The seeds are fixed, so this is deterministic rather than flaky: it
     passes or fails the same way every time, and the headroom is what stops
     a sample size change reading as a regression. */
  const sdTol = 0.15 + 4 * Math.SQRT2 * 9 / Math.sqrt(2 * N);
  const meanTol = 0.2 + 4 * Math.SQRT2 * 9 / Math.sqrt(N);
  const winTolAt = (p) => 1.3 + 4 * Math.SQRT2 * 100
    * Math.sqrt((p / 100) * (1 - p / 100) / N);
  console.log(`  bands at N=${N}: mean ${meanTol.toFixed(2)}, spread ${sdTol.toFixed(2)},`
    + ` win rate ${winTolAt(66).toFixed(2)} points at an even matchup`);
  const men = fixtureFive(1996, 'CHI');
  console.log('  matchup       resolver              live, every call auto');
  for (const c of CASES) {
    const r1 = E.createSeededRNG(4242);
    const ry = [], rt = []; let rw = 0;
    for (let i = 0; i < N; i++) {
      const r = E.resolveGame(c.pf, c.pa, r1, c.adv);
      ry.push(r.yourPoints); rt.push(r.oppPoints); if (r.won) rw++;
    }
    const r2 = E.createSeededRNG(4242);
    const ly = [], lt = []; let lw = 0;
    for (let i = 0; i < N; i++) {
      const sim = E.liveCreate(men, c.pf, c.pa, r2, c.adv);
      const res = E.liveFinish(sim, r2);
      ly.push(res.yourPoints); lt.push(res.oppPoints); if (res.won) lw++;
    }
    const a = stats(ry), b = stats(rt), x = stats(ly), y = stats(lt);
    const rwin = 100 * rw / N, lwin = 100 * lw / N;
    console.log(`  ${c.n} ${a.mean.toFixed(1)}/${a.sd.toFixed(2)} ${b.mean.toFixed(1)}/${b.sd.toFixed(2)} win ${rwin.toFixed(1)}%`
      + `   ${x.mean.toFixed(1)}/${x.sd.toFixed(2)} ${y.mean.toFixed(1)}/${y.sd.toFixed(2)} win ${lwin.toFixed(1)}%`);

    near(x.mean, a.mean, meanTol, `${c.n.trim()}: your points match resolveGame`);
    near(y.mean, b.mean, meanTol, `${c.n.trim()}: their points match resolveGame`);
    near(x.sd, a.sd, sdTol, `${c.n.trim()}: your spread matches resolveGame`);
    near(y.sd, b.sd, sdTol, `${c.n.trim()}: their spread matches resolveGame`);
    near(lwin, rwin, winTolAt(rwin), `${c.n.trim()}: the win rate matches resolveGame`);
  }

  /* AND THE FIT IS PROVED TO HAVE TEETH. A sim with the pull switched off is
     the honest failure mode of this whole section, and it has to fail. */
  const keep = E.LIVE.PULL;
  E.LIVE.PULL = 0;
  const men2 = fixtureFive(1996, 'CHI');
  const rn = E.createSeededRNG(99);
  const loose = [];
  for (let i = 0; i < 1200; i++) {
    const sim = E.liveCreate(men2, 113.4, 110.2, rn, 1.02);
    loose.push(E.liveFinish(sim, rn).yourPoints);
  }
  E.LIVE.PULL = keep;
  ok(stats(loose).sd > 11, 'with the pull removed the spread blows past the band'
    + ` (${stats(loose).sd.toFixed(2)})`);
}

// ── 3. the two calls ────────────────────────────────────────────────────────
head('3. the calls are real, reachable, and only asked when they are calls');
{
  const men = fixtureFive(1996, 'CHI');
  const rng = E.createSeededRNG(31337);
  let games = 0, withCall = 0, calls = 0, shot = 0, foul = 0, wide = 0, early = 0;
  const seen = {};
  for (let g = 0; g < 600; g++) {
    const sim = E.liveCreate(men, 112.0, 111.0, rng, 1.0);
    let had = 0, guard = 0;
    while (!sim.over && guard++ < 4000) {
      const d = E.liveDecision(sim);
      if (d) {
        calls++; had++;
        if (d.kind === 'shot') shot++; else foul++;
        /* A call offered in a fifteen point game is a button rather than a
           decision, which is the whole reason both windows are late and
           close. */
        if (Math.abs(d.margin) > E.LIVE.LAST_SHOT_MARGIN) wide++;
        if (sim.clock > E.LIVE.LAST_SHOT_SECONDS) early++;
        if (d.options.length < 2) wide++;
        for (const o of d.options) seen[o.id] = (seen[o.id] || 0) + 1;
        E.liveStep(sim, rng, E.liveAutoCall(sim, d));
        continue;
      }
      E.liveStep(sim, rng, null);
    }
    games++;
    if (had) withCall++;
  }
  console.log(`  ${calls} calls over ${games} games, ${withCall} games with one`);
  console.log('  options offered: ' + Object.keys(seen).sort()
    .map((k) => k + ' ' + seen[k]).join(', '));
  ok(withCall > games * 0.10,
    `a call is reachable in ordinary play (${withCall} of ${games} games)`);
  ok(withCall < games * 0.80,
    `and it is not offered in most games (${withCall} of ${games})`);
  ok(shot > 0 && foul > 0, 'both kinds of call happen');
  is0(wide, 'no call is offered in a game that is not close');
  is0(early, 'no last shot call is offered with the clock not running out');

  /* EVERY OPTION THE SCREEN CAN DRAW HAS TO BE REACHABLE, which is the
     unearnable badge in a different coat: an option nobody meets is content
     that renders and is never read. */
  for (const id of ['three', 'quick2', 'two', 'iso', 'best', 'foul', 'defend']) {
    ok(seen[id] > 0, `the "${id}" option is reachable in real play`);
  }

  /* AND EVERY ONE OF THEM HAS TO BE ANSWERABLE, driven rather than reasoned
     about: a choice the engine does not know is a possession that silently
     falls through to the ordinary one. */
  for (const id of ['three', 'quick2', 'two', 'iso', 'best', 'foul', 'defend']) {
    const s2 = E.liveCreate(men, 112, 111, E.createSeededRNG(5), 1);
    const before = s2.n;
    E.liveStep(s2, E.createSeededRNG(5), id);
    ok(s2.n === before + 1 && s2.plays.length === 1,
      `answering "${id}" plays exactly one possession`);
  }
}

// ── 4. which games are offered ──────────────────────────────────────────────
head('4. the door opens on the games worth playing and no others');
{
  function draft(seed) {
    const run = R.createRun({ seed });
    let g = 0;
    while (run.phase === R.PHASES.DRAFT && g++ < 50) {
      const draw = R.spin(run, DATA);
      const opts = draw.options.map((k) => DATA.allPlayers[k]).filter(Boolean);
      if (!opts.length) return null;
      R.sign(run, opts.slice().sort((a, b) => b.w - a.w)[0]);
    }
    return run.phase === R.PHASES.SEASON ? run : null;
  }

  let runs = 0, brackets = 0, bigs = 0, wrong = 0, missedLast = 0;
  const per = [];
  for (let s = 1; s <= 200; s++) {
    const run = draft(s);
    if (!run) continue;
    runs++;
    R.playToPlayoffs(run);
    if (!run.po) continue;
    brackets++;
    let n = 0, guard = 0;
    while (guard++ < 200) {
      const next = R.pendingGame(run);
      if (!next) break;
      const canEnd = next.elimination || next.closeout;
      const shouldBe = canEnd || next.round === 'NBA Finals';
      if (next.big !== shouldBe) wrong++;
      if (next.big) { n++; bigs++; }
      /* The game that ENDED a round has to have been a big one, because a
         series ends on a game the series could end in, by definition. If that
         is ever false the rule has a hole in it.
         ASKED BY WHETHER THE ROUND GREW, which is the second version of this.
         The first read the last FINISHED round and compared its length to
         this game's index, so it was comparing a game in round three against
         a round one that finished half an hour of bracket ago, and reported
         54 holes in a rule that has none. */
      const roundsBefore = run.po.results.length;
      R.simGame(run);
      if (run.po.results.length > roundsBefore && !next.big) missedLast++;
    }
    per.push(n);
    R.finishRun(run);
  }
  const p = stats(per);
  const sorted = per.slice().sort((a, b) => a - b);
  console.log(`  ${brackets} brackets of ${runs} runs: mean ${p.mean.toFixed(1)} big games,`
    + ` median ${sorted[Math.floor(sorted.length / 2)]},`
    + ` p90 ${sorted[Math.floor(sorted.length * 0.9)]}, max ${sorted[sorted.length - 1]}`);
  is0(wrong, 'big is exactly: the series can end, or it is the Finals');
  is0(missedLast, 'the game that ends a round is always one of them');
  ok(p.mean > 1.2 && p.mean < 5,
    `a run is offered a handful and not a screenful (mean ${p.mean.toFixed(1)})`);
  ok(bigs > 0, 'the door opens at all');
}

// ── 5. playing decides it, and only that game ───────────────────────────────
head('5. a played game is the game the bracket records');
{
  function seed6(seed) {
    const run = R.createRun({ seed });
    let g = 0;
    while (run.phase === R.PHASES.DRAFT && g++ < 50) {
      const draw = R.spin(run, DATA);
      const opts = draw.options.map((k) => DATA.allPlayers[k]).filter(Boolean);
      if (!opts.length) return null;
      R.sign(run, opts.slice().sort((a, b) => b.w - a.w)[0]);
    }
    return run.phase === R.PHASES.SEASON ? run : null;
  }

  let played = 0, mismatched = 0, notLive = 0, streamMoved = 0;
  let sheetBad = 0, sheetSimmed = 0;
  for (let s = 1; s <= 120; s++) {
    const run = seed6(s);
    if (!run) continue;
    R.playToPlayoffs(run);
    if (!run.po) continue;
    let guard = 0;
    while (guard++ < 200) {
      const next = R.pendingGame(run);
      if (!next) break;
      if (!next.big) { R.simGame(run); continue; }
      const g = R.liveGame(run);
      /* A LIVE GAME MUST NOT MOVE THE RUN'S OWN STREAM, because the run's
         stream is what every game AFTER this one is drawn from. Playing a
         Game 7 for four minutes and then finding the Finals drew a different
         opponent is the bug this guards, and it would look like nothing. */
      const before = run.rngCalls;
      const res = E.liveFinish(g.sim, g.rng);
      if (run.rngCalls !== before) streamMoved++;
      const roundsBefore = run.po.results.length;
      R.recordGame(run, g.next, res);
      played++;
      /* The row the bracket kept is the game that was played. */
      const cur = run.po.cur || run.po.results[run.po.results.length - 1];
      const games = cur.games;
      const row = games[games.length - 1];
      if (row.yourPoints !== res.yourPoints || row.oppPoints !== res.oppPoints
          || row.won !== res.won) mismatched++;
      if (!row.live) notLive++;
      if (run.po.results.length > roundsBefore + 1) mismatched++;
    }
    R.finishRun(run);

    /* AND THE SHEET A READER OPENS AFTERWARDS IS THE GAME THEY WATCHED.
       gameDetail's default is a decomposition drawn off the game's address,
       which is the honest answer for 82 games and the wrong one for the two
       or three somebody sat through: they would open their own Game 7 and
       find a third quarter that did not happen. */
    const rounds = (run.playoffs && run.playoffs.rounds) || [];
    for (let r = 0; r < rounds.length; r++) {
      for (let g = 0; g < rounds[r].games.length; g++) {
        const row = rounds[r].games[g];
        const d = R.gameDetail(run, { kind: 'playoff', round: r, game: g });
        if (!d) { sheetBad++; continue; }
        if (!row.live) {
          /* A resolved game keeps the sheet it always had, minutes and all. */
          if (d.live || !d.box.length || d.box[0].min == null) sheetSimmed++;
          continue;
        }
        if (!d.live) { sheetBad++; continue; }
        const q = d.quarters;
        const sumY = q.yours.reduce((a, b) => a + b, 0);
        const sumT = q.theirs.reduce((a, b) => a + b, 0);
        const sumBox = d.box.reduce((a, l) => a + l.pts, 0);
        if (sumY !== row.yourPoints || sumT !== row.oppPoints) sheetBad++;
        if (sumBox !== row.yourPoints) sheetBad++;
        if (q.yours.length !== 4 + (row.ot || 0)) sheetBad++;
        /* Nothing in a forward sim counts a rebound, so the sheet must not
           claim one. */
        if (d.box.some((l) => l.reb != null || l.ast != null || l.min != null)) sheetBad++;
      }
    }
  }
  console.log(`  ${played} games played forward across the sample`);
  ok(played > 40, 'the sample actually played some');
  is0(sheetBad, 'a played game keeps its own box score and its own quarters');
  is0(sheetSimmed, 'and a simmed one still gets the decomposition');
  is0(mismatched, 'the bracket keeps the score the live game finished on');
  is0(notLive, 'and marks it as played rather than resolved');
  is0(streamMoved, "a live game does not touch the run's own dice");

  /* AND SIMMING EVERY GAME IS STILL THE OLD BRACKET, byte for byte. This is
     what makes the whole refactor safe: playSeason and the game-at-a-time
     walk are one loop, so there is no bracket only one path can produce. */
  let differ = 0, compared = 0;
  for (let s = 400; s <= 480; s++) {
    const a = seed6(s), b = seed6(s);
    if (!a || !b) continue;
    compared++;
    const oa = R.playSeason(a);
    R.playToPlayoffs(b);
    let guard = 0;
    while (guard++ < 200 && R.pendingGame(b)) R.simGame(b);
    const ob = R.finishRun(b);
    if (JSON.stringify([a.season, a.playoffs, oa]) !== JSON.stringify([b.season, b.playoffs, ob])) differ++;
  }
  ok(compared > 30, `the comparison ran (${compared} runs)`);
  is0(differ, 'simming every game gives the bracket playSeason gives');
}

if (QUICK) { report(); process.exit(failures.length ? 1 : 0); }

// ── the browser half ────────────────────────────────────────────────────────

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2' };

async function serve(route) {
  const req = route.request();
  const u = new URL(req.url());
  /* Neither accounts nor the board have anything to say about a live game,
     and letting either out would put a real network request in here. */
  if (u.hostname !== 'local.test') return route.abort();
  let rel = decodeURIComponent(u.pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  const f = path.join(ROOT, rel);
  if (!fs.existsSync(f)) return route.abort();
  await route.fulfill({ status: 200,
    contentType: TYPES[path.extname(f)] || 'application/octet-stream',
    body: fs.readFileSync(f) });
}

/* A PHONE, NOT THIS HARNESS'S OWN WINDOW. The layout claims below are about
   what fits on the screen the game is played on, and a tall window passes a
   check on a screen that is broken. 740 is the short end of what people
   hold. */
const PHONE = { width: 360, height: 740 };

async function newPage(browser, boom, viewport) {
  const ctx = await browser.newContext({ viewport: viewport || PHONE, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => boom.push(String(e).slice(0, 220)));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (/net::|Failed to load resource/.test(t)) return;
    boom.push('console: ' + t.slice(0, 200));
  });
  await page.route('**/*', serve);
  return page;
}

/* WAIT ON THE ATTRIBUTE, NOT ON PLAYWRIGHT'S IDEA OF VISIBLE, and this cost a
   round. waitForSelector's default state is `visible`, which is a heuristic
   over the bounding box, and while Sim the rest is running the page turns a
   hundred and forty possessions over on zero-delay timers: the poller can sit
   behind that for the whole timeout on an element whose `hidden` came off
   seconds earlier. Instrumenting it with a polling loop made it pass, which is
   the tell. The claim being made here is that the page unhid the box, so that
   is the claim to write, and it polls on a timer rather than on a frame. */
const unhidden = (page, sel, ms) => page.waitForFunction(
  (q) => { const el = document.querySelector(q); return !!el && !el.hidden; },
  sel, { timeout: ms || 20000, polling: 100 });

async function boot(page) {
  await page.goto('http://local.test/hoops/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#b-start:not([disabled])', { timeout: 30000 });
  await page.evaluate(() => { const b = document.querySelector('#frg-x'); if (b) b.click(); });
  await page.waitForTimeout(200);
}

/* Draft best-available through the real board, then play the 82 and skip to
   the bracket. Lifted from check-board.mjs, including its note about why the
   wait is on the NEXT BOARD and not on the roster: the roster grows inside
   sign() and the next spin is a beat later, so a wait on the roster clicks a
   tile off a board that is about to be replaced. */
async function toBracket(page) {
  await page.evaluate(() => document.querySelector('#b-start').click());
  /* HOW MANY TO SIGN IS THE ENGINE'S ANSWER, never a literal: written 6 this
     loop presses one more time than the game drafts. */
  for (let i = 0; i < E.SLOTS.length; i++) {
      /* :not(.pending) IS LOAD-BEARING AND IT IS NOT BELT AND BRACES.
       `.opts.pending` hides the tile's CHILDREN and sets pointer-events
       none on the tile, so the tile itself is a visible box with a size and
       waitForSelector's own visibility test passes on a board that is still
       mid-spin. A scripted .click() ignores pointer-events, so the walk
       signed off a board nobody could have read, and `reelBusy` was still
       true when sign()'s own setTimeout(spin, 240) fired: drawInto returns
       at its first line while a reel is moving, so no draw was ever made
       and the draft sat on an empty board for ever. */
    await page.waitForSelector('.opts:not(.pending) .ptile:not(.off)', { timeout: 25000 });
    await page.evaluate(() =>
      document.querySelector('.opts:not(.pending) .ptile:not(.off)').click());
    await page.waitForFunction((a) => {
      try {
        const r = JSON.parse(localStorage.getItem('runthefloor_run_v1') || 'null');
        if (!r || !Array.isArray(r.roster) || r.roster.length < a.want) return false;
        if (r.roster.length >= a.full) return true;
        const opts = document.querySelector('.opts');
        return !!r.currentDraw && !!opts && !/pending/.test(opts.className);
      } catch (e) { return false; }
    }, { want: i + 1, full: E.SLOTS.length }, { timeout: 25000 });
  }
  await page.waitForTimeout(400);
  await page.evaluate(() => document.querySelector('#b-play').click());
  await page.waitForTimeout(700);
  await page.evaluate(() => { const b = document.querySelector('#b-skip'); if (b) b.click(); });
}

/* Walk the bracket until a door opens, taking Sim at any door before this
   one. Answers false if the run ends without offering any, which happens: a
   roster that misses the play-in never reaches a big game. */
async function waitForDoor(page, skipFirst) {
  let skipped = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < 60000) {
    if (await page.evaluate(() => !!document.querySelector('#s-over.active'))) return false;
    const open = await page.evaluate(() => {
      const d = document.querySelector('#lvdoor');
      return !!d && !d.hidden;
    });
    if (open) {
      if (skipped >= (skipFirst || 0)) return true;
      skipped++;
      await page.evaluate(() => document.querySelector('#b-lv-sim').click());
      await page.waitForTimeout(150);
      continue;
    }
    await page.waitForTimeout(120);
  }
  return false;
}

async function findRunWithDoor(browser, boom, existing) {
  /* A ROSTER HAS TO REACH THE PLAYOFFS, and the page's own walk does not draft
     well: it takes the first affordable tile on the board, which is not
     best-available, so a run misses the bracket a good deal more often than
     the engine-side sample in section 4 suggests. Rather than pinning a magic
     seed, which is the fixture trap this repo has been bitten by twice, it
     starts runs until one offers a door.

     ON ONE PAGE, and that is the fix rather than the first draft's six fresh
     contexts. A new context reloads and re-indexes sixteen thousand rows every
     go, which made each attempt cost most of a minute, so six of them was the
     most the file could afford and six was not enough: the second call came
     back empty and two assertions failed on the harness rather than on the
     page. Going home and pressing Start again is the same fresh run at a
     fraction of the cost, so it can afford to try until it gets one. */
  const page = existing || await newPage(browser, boom);
  if (!existing) await boot(page);
  for (let attempt = 0; attempt < 12; attempt++) {
    await page.evaluate(() => {
      try { localStorage.removeItem('runthefloor_run_v1'); } catch (e) {}
    });
    await toBracket(page);
    if (await waitForDoor(page, 0)) return page;
    /* Back to the front page for another go. The run that just finished is
       left where it is: the next Start replaces it. */
    await page.evaluate(() => { const b = document.querySelector('#b-home'); if (b) b.click(); });
    await page.waitForSelector('#b-start', { timeout: 10000 });
    await page.waitForTimeout(120);
  }
  return null;
}

function report() {
  console.log('');
  if (failures.length) {
    console.log(`${failures.length} FAILED:`);
    for (const f of failures) console.log('  x ' + f);
    console.log(`\n${pass} passed, ${failures.length} failed.`);
  } else {
    console.log(`${pass} assertions passed.`);
  }
}

const main = async () => {
  const pw = (await import(PW)).default;
  const browser = await pw.chromium.launch({ executablePath: CHROME });
  const boom = [];

  // ── 6. the door, and the board it opens ──────────────────────────────────
  head('6. the door, and the board behind it');
  const page = await findRunWithDoor(browser, boom);
  ok(!!page, 'a run reached a game worth playing');
  if (!page) { await browser.close(); report(); process.exit(1); }

  {
    const d = await page.evaluate(() => ({
      eye: document.querySelector('#lvd-eye').textContent,
      title: document.querySelector('#lvd-title').textContent,
      why: document.querySelector('#lvd-why').textContent,
      play: !!document.querySelector('#b-lv-play'),
      sim: !!document.querySelector('#b-lv-sim'),
      playBox: document.querySelector('#b-lv-play').getBoundingClientRect().height,
    }));
    ok(/Play-In|Round|Final|Semi|Conference/i.test(d.eye),
      `the door names the round (${JSON.stringify(d.eye)})`);
    ok(d.title.length > 2, `and says what kind of game it is (${JSON.stringify(d.title)})`);
    ok(/Series|One game/.test(d.why), 'and where the series stands');
    ok(d.play && d.sim, 'both answers are offered');
    ok(d.playBox > 30, 'Play it is a real control');

    await page.evaluate(() => document.querySelector('#b-lv-play').click());
    await page.waitForSelector('#s-live.active', { timeout: 10000 });
    const start = await page.evaluate(() => ({
      you: document.querySelector('#lv-you').textContent,
      them: document.querySelector('#lv-them').textContent,
      q: document.querySelector('#lv-q').textContent,
      men: document.querySelectorAll('#lv-men .lvman').length,
      log: document.querySelectorAll('#lv-log .lvrow').length,
    }));
    ok(start.you === '0' && start.them === '0', 'it tips off at nothing apiece');
    ok(start.q === 'Q1', 'in the first quarter');
    ok(start.men === E.SLOTS.length,
      `with every man on the board (${start.men} of ${E.SLOTS.length})`);
    ok(start.log === 0, 'and an empty play by play');
  }

  let normalRate = 0;

  // ── 7. it plays, and the clock only goes one way ─────────────────────────
  head('7. it plays forward, and nothing on the board goes backwards');
  {
    /* SAMPLED WHILE IT RUNS, never re-derived. Every duration on this board is
       a setTimeout, so a checker could add them up and would then be a second
       copy of the answer. What it cannot do is notice a clock that jumps. */
    const tape = await page.evaluate(() => new Promise((done) => {
      const out = [];
      const read = () => ({
        q: document.querySelector('#lv-q').textContent,
        c: document.querySelector('#lv-clock').textContent,
        y: +document.querySelector('#lv-you').textContent,
        t: +document.querySelector('#lv-them').textContent,
        n: window.RTF_LIVE.sim ? window.RTF_LIVE.sim.n : -1,
      });
      const obs = new MutationObserver(() => { out.push(read()); });
      obs.observe(document.querySelector('#lv-clock'),
        { childList: true, characterData: true, subtree: true });
      setTimeout(() => { obs.disconnect(); done(out); }, 7000);
    }));
    ok(tape.length > 25, `the board is actually moving (${tape.length} clock writes)`);
    /* THE PACE AT WHICH IT IS WATCHED, measured here so section 9 has
       something real to compare Sim the rest against. A wall clock rather
       than a sum of the setTimeouts, which would be a second copy of the
       answer and could not drift. */
    normalRate = (tape[tape.length - 1].n - tape[0].n) / 7;
    console.log(`  watched pace: ${normalRate.toFixed(1)} possessions a second`);
    ok(normalRate > 2 && normalRate < 40,
      `the watched pace is a pace (${normalRate.toFixed(1)} possessions a second)`);

    const secs = (s) => { const p = s.split(':'); return (+p[0]) * 60 + (+p[1]); };
    let backClock = 0, backScore = 0, quarters = {};
    for (let i = 1; i < tape.length; i++) {
      const a = tape[i - 1], b = tape[i];
      quarters[b.q] = 1;
      if (a.q === b.q && secs(b.c) > secs(a.c)) backClock++;
      if (b.y < a.y || b.t < a.t) backScore++;
    }
    is0(backClock, 'the game clock never runs backwards inside a quarter');
    is0(backScore, 'neither score ever goes down');
    ok(Object.keys(quarters).length >= 1, 'the quarter is named on the board');

    /* The log and the scoreboard are the same game. This is the one screen
       where a reader can catch a disagreement, so it is the one worth
       reading off the DOM rather than off the sim. */
    const agree = await page.evaluate(() => {
      const rows = [...document.querySelectorAll('#lv-log .lvrow')];
      if (!rows.length) return { rows: 0 };
      const top = rows[0].querySelector('.lvs').textContent.split('-');
      return { rows: rows.length, y: +top[0], t: +top[1],
        boardY: +document.querySelector('#lv-you').textContent,
        boardT: +document.querySelector('#lv-them').textContent };
    });
    ok(agree.rows > 10, `the play by play is filling (${agree.rows} rows)`);
    ok(agree.y === agree.boardY && agree.t === agree.boardT,
      `the newest log row is the score on the board (${agree.y}-${agree.t}`
      + ` against ${agree.boardY}-${agree.boardT})`);
  }

  // ── 8. sim the rest, and the verdict ─────────────────────────────────────
  head('8. sim the rest hurries the basketball, and the game finishes');
  {
    const left = await page.evaluate(() =>
      window.RTF_LIVE.sim.poss * 2 - window.RTF_LIVE.sim.n);
    const t0 = Date.now();
    await page.evaluate(() => document.querySelector('#b-lv-fast').click());
    /* SIM THE REST STOPS FOR A CALL, and that is the design rather than a
       hang, so the walk has to answer one. This section timed out on about
       one run in five and finished in a second on the rest, which is exactly
       the rate a late close game comes up at: a fixed wait on the verdict was
       measuring whether this game happened to have a decision in it. */
    let answered = 0;
    while (Date.now() - t0 < 40000) {
      const st = await page.evaluate(() => ({
        done: !document.querySelector('#lv-verdict').hidden,
        call: !document.querySelector('#lv-call').hidden,
      }));
      if (st.done) break;
      if (st.call) {
        answered++;
        await page.evaluate(() => document.querySelectorAll('.lvc-opt')[0].click());
      }
      await page.waitForTimeout(60);
    }
    await unhidden(page, '#lv-verdict', 10000);
    const took = Date.now() - t0;
    if (answered) console.log(`  it stopped for ${answered} call(s) on the way`);
    /* MEASURED AGAINST THE PACE THIS GAME WAS ACTUALLY BEING WATCHED AT, not
       against a number. A threshold in seconds is a claim about the machine
       the checker happens to run on; the claim being made is that pressing
       this hurried the basketball, and the only honest form of that is the
       rate before against the rate after. */
    const wouldHave = left / Math.max(0.1, normalRate);
    console.log(`  ${left} possessions left: ${(took / 1000).toFixed(1)}s simmed`
      + `, about ${wouldHave.toFixed(1)}s watched`);
    ok(took / 1000 < wouldHave / 3,
      `Sim the rest really hurries it (${(took / 1000).toFixed(1)}s against`
      + ` ${wouldHave.toFixed(1)}s at the watched pace)`);
    ok(took < 20000, `and finishes (${(took / 1000).toFixed(1)}s)`);

    const v = await page.evaluate(() => {
      const sim = window.RTF_LIVE.sim;
      return {
        res: document.querySelector('#lvv-res').textContent,
        score: document.querySelector('#lvv-score').textContent,
        line: document.querySelector('#lvv-line').textContent,
        cls: document.querySelector('#lv-verdict').className,
        you: sim.you, them: sim.them, over: sim.over,
        next: !!document.querySelector('#b-lv-next'),
        nextBottom: document.querySelector('#b-lv-next').getBoundingClientRect().bottom,
        vh: window.innerHeight,
        men: [...document.querySelectorAll('#lv-men .lvman .mp')].map((e) => +e.textContent),
      };
    });
    ok(v.over, 'the game is over');
    ok(v.score === v.you + '-' + v.them || v.score.indexOf(v.you + '-' + v.them) === 0,
      `the verdict prints the score it finished on (${v.score} against ${v.you}-${v.them})`);
    ok((v.you > v.them) === /You take it/.test(v.res),
      `and says who won (${JSON.stringify(v.res)})`);
    ok(/w|l/.test(v.cls.split(' ').pop()), 'the verdict is coloured by the result');
    /* THE STARTERS ADD UP TO THE TEAM, on the screen and not only in the engine. */
    ok(v.men.reduce((a, b) => a + b, 0) === v.you,
      `the men on the board add to the team score (${v.men.join('+')} against ${v.you})`);
    ok(v.nextBottom <= v.vh,
      `Continue is on the screen (${Math.round(v.nextBottom)} of ${v.vh})`);
  }

  // ── 9. and the bracket keeps it ─────────────────────────────────────────
  head('9. Continue folds the played game into the bracket');
  {
    const played = await page.evaluate(() => ({
      you: window.RTF_LIVE.sim.you, them: window.RTF_LIVE.sim.them,
      run: JSON.parse(localStorage.getItem('runthefloor_run_v1')),
    }));
    const cur = played.run.po.cur || played.run.po.results[played.run.po.results.length - 1];
    const row = cur.games[cur.games.length - 1];
    ok(row.yourPoints === played.you && row.oppPoints === played.them,
      `the saved run carries the played score (${row.yourPoints}-${row.oppPoints})`);
    ok(row.live === true, 'and marks it as a game that was played');

    await page.evaluate(() => document.querySelector('#b-lv-next').click());
    await page.waitForTimeout(400);
    const back = await page.evaluate(() => ({
      screen: (document.querySelector('.screen.active') || {}).id,
      live: window.RTF_LIVE.state,
    }));
    ok(back.screen === 's-brk' || back.screen === 's-over',
      `Continue goes back to the bracket (${back.screen})`);
    ok(back.live === null, 'and lets the live game go');

    /* And the run finishes. Any further door is simmed, because what is under
       test here is that a played game does not strand the walk. */
    const t0 = Date.now();
    while (Date.now() - t0 < 60000) {
      if (await page.evaluate(() => !!document.querySelector('#s-over.active'))) break;
      const open = await page.evaluate(() => {
        const d = document.querySelector('#lvdoor');
        if (!d || d.hidden) return false;
        document.querySelector('#b-lv-sim').click();
        return true;
      });
      await page.waitForTimeout(open ? 120 : 200);
    }
    const done = await page.evaluate(() => ({
      screen: (document.querySelector('.screen.active') || {}).id,
      run: JSON.parse(localStorage.getItem('runthefloor_run_v1')),
    }));
    ok(done.screen === 's-over', 'the run reaches its results screen');
    ok(done.run && done.run.phase === 'over' && !!done.run.outcome,
      'and the saved run is finished with an outcome on it');
    ok(done.run && done.run.playoffs && done.run.playoffs.rounds.length > 0,
      'with a bracket on it');
    /* The played game survives into the finished run, which is the only place
       a reader will ever go looking for it again. */
    const anyLive = (done.run.playoffs.rounds || [])
      .some((rd) => (rd.games || []).some((g) => g.live));
    ok(anyLive, 'and the game that was played is still marked as played in it');
  }

  // ── 10. a reload mid-bracket ─────────────────────────────────────────────
  head('10. a run stopped at a door comes back to it');
  /* A SECOND RUN, and it earns its cost twice. The reload claim needs a run
     sitting at a door, and so does section 11: driving a call consumes the
     endgame of whatever game it is driven in, so it cannot be done in the
     game section 8 already simmed to the horn. */
  const p2 = await findRunWithDoor(browser, boom, page);
  {
    ok(!!p2, 'a second run reached a door');
    if (p2) {
      const saved = await p2.evaluate(() => {
        const r = JSON.parse(localStorage.getItem('runthefloor_run_v1'));
        return { phase: r.phase, hasPo: !!r.po, rounds: r.po ? r.po.results.length : -1 };
      });
      ok(saved.phase === 'playoffs', `the saved run says where it is (${saved.phase})`);
      ok(saved.hasPo, 'and carries its bracket, which means it survives JSON');

      await p2.reload({ waitUntil: 'domcontentloaded' });
      await p2.waitForSelector('#b-start:not([disabled])', { timeout: 30000 });
      const home = await p2.evaluate(() => ({
        title: document.querySelector('#rz-title').textContent,
        where: document.querySelector('#rz-where').textContent,
        shown: document.querySelector('#home-resume').style.display !== 'none',
      }));
      ok(home.shown, 'the front page offers the run back');
      ok(/playoff/i.test(home.title), `and says it is in the playoffs (${JSON.stringify(home.title)})`);
      ok(home.where.length > 4 && !/82 to play/.test(home.where),
        `and where it got to (${JSON.stringify(home.where)})`);

      await p2.evaluate(() => document.querySelector('#b-resume').click());
      await p2.waitForTimeout(700);
      const res = await p2.evaluate(() => ({
        screen: (document.querySelector('.screen.active') || {}).id,
        cols: document.querySelectorAll('#brk-rail .brk-col').length,
        settled: document.querySelectorAll('#brk-rail .brk-t.won').length,
      }));
      /* THE BRACKET IS WHERE THE RUN IS, so that is where a reload lands. It
         used to come back to the season screen and rebuild the 82 game strip,
         which is a reveal of something the player has already watched. */
      ok(res.screen === 's-brk', `resuming lands on the bracket (${res.screen})`);
      ok(res.cols >= 4, `with the whole field on it (${res.cols} rounds)`);
      ok(saved.rounds === 0 || res.settled > 0,
        `and the rounds already played still settled (${res.settled})`);
    }
  }

  // ── 11. a call, driven rather than waited for ─────────────────────────────
  head('11. a call stops the game, is answerable, and lands in the record');
  if (!p2) { ok(false, 'a second run was available to play a call in'); }
  else {
    /* Back to a door on the resumed run, and this time take it. */
    ok(await waitForDoor(p2, 0), 'the resumed run reaches a door to play');
    await p2.evaluate(() => document.querySelector('#b-lv-play').click());
    await p2.waitForSelector('#s-live.active', { timeout: 10000 });

    /* A GENUINE CALL IS RARE ENOUGH THAT WAITING FOR ONE LEAVES THIS DARK
       MOST RUNS, which is the badge nothing can light. So the state is
       DRIVEN to one: the board is put into a real last shot and the page's
       own loop is asked to carry on. Nothing about the decision is faked and
       the page code under test is untouched.

       SIM THE REST IS PRESSED FIRST, IN THE SAME CALL, and that is what makes
       this one fixture answer two questions instead of two fixtures
       answering one each. The pacing control must never take a decision away,
       which is the football boss battle's rule verbatim, so the question
       coming up here with the flag already set IS that claim.

       One evaluate, because there must be no gap: pressing the button starts
       a zero-delay loop that would finish the game in about a second, and the
       first draft set the fixture up in a second round trip after answering
       an earlier call, by which time the game was over and the board had
       nothing left to stop for. */
    const set = await p2.evaluate(() => {
      const L = window.RTF_LIVE;
      if (!L || !L.sim || L.sim.over) return 'no live game';
      document.querySelector('#b-lv-fast').click();
      const s = L.sim;
      /* Your ball, two down, twenty seconds. That is a last shot and it is
         the branch with the most options on it. The parity is what decides
         whose ball it is everywhere in the engine, so it is set rather than
         hoped for.
         THE CLOCK AND THE POSSESSION COUNT HAVE TO AGREE, which the first
         version of this fixture did not: twenty seconds with a hundred and
         fifty possessions still to play makes EVERY remaining possession a
         last shot, so the board stopped and asked about all of them and the
         next section waited for a verdict that could never arrive. The two
         are locked together in a real game, so the fixture locks them too. */
      s.n = s.poss * 2 - 2;
      s.you = 100; s.them = 102;
      s.clock = 20; s.ot = 0; s.quarter = 4;
      L.resume();
      return 'ok';
    });
    ok(set === 'ok', 'the board could be put into a last shot');
    const stopped = await unhidden(p2, '#lv-call', 8000)
      .then(() => true).catch(() => false);
    ok(stopped, 'Sim the rest still stops for a call');

    const call = stopped ? await p2.evaluate(() => {
      const opts = [...document.querySelectorAll('.lvc-opt')];
      const box = document.querySelector('#lv-call').getBoundingClientRect();
      const last = opts[opts.length - 1].getBoundingClientRect();
      return {
        q: document.querySelector('#lvc-q').textContent,
        n: opts.length,
        labels: opts.map((o) => o.querySelector('b').textContent),
        whys: opts.map((o) => o.querySelector('span').textContent),
        top: box.top, deepest: last.bottom, vh: window.innerHeight,
        logTop: document.querySelector('#lv-log').getBoundingClientRect().top,
      };
    }) : null;
    if (!call) { ok(false, 'the call could be read'); }
    else {
      ok(call.n >= 2, `the call offers a real choice (${call.n} options)`);
      ok(/Down 2/.test(call.q), `it says the situation (${JSON.stringify(call.q)})`);
      ok(call.labels.every((s2) => s2.length > 3), 'every option is labelled');
      ok(call.whys.every((s2) => s2.length > 10), 'and every one says what it means');

      /* A CONTROL THE GAME IS WAITING ON GOES ABOVE THE RECORD OF IT. The log
         is capped at 40vh and fills all game, so anything under it walks off
         the bottom of a phone by the fourth quarter. Measured against a 740px
         phone rather than against this harness's own window. */
      ok(call.top < call.logTop,
        `the call is above the play by play (${Math.round(call.top)} against`
        + ` ${Math.round(call.logTop)})`);
      ok(call.deepest <= call.vh,
        `the deepest option is on the screen (${Math.round(call.deepest)} of ${call.vh})`);

      const before = await p2.evaluate(() => window.RTF_LIVE.sim.n);
      await p2.evaluate(() => document.querySelectorAll('.lvc-opt')[0].click());
      await p2.waitForTimeout(250);
      const after = await p2.evaluate(() => ({
        n: window.RTF_LIVE.sim.n,
        hidden: document.querySelector('#lv-call').hidden,
        noted: [...document.querySelectorAll('#lv-log .lvrow.call')].length,
      }));
      /* ADVANCED, not "advanced by exactly one". The flag is on, so the
         possession after the answer plays in the same breath. That the
         answer is worth exactly one possession is asserted headlessly in
         section 3, through the engine, where the clock is not racing. */
      ok(after.n > before, 'answering plays the possession');
      ok(after.hidden, 'and puts the question away');
      /* THE CALLS GO IN THE LOG, which is the half a reader keeps: the line
         over the board is painted over by the next possession, and under Sim
         the rest it is gone in a frame. */
      ok(after.noted > 0, 'and the call itself is marked in the play by play');

      /* Any further call is answered too, because a game can genuinely ask
         twice, and then the game has to finish. */
      const t1 = Date.now();
      while (Date.now() - t1 < 25000) {
        const st = await p2.evaluate(() => ({
          done: !document.querySelector('#lv-verdict').hidden,
          call: !document.querySelector('#lv-call').hidden,
        }));
        if (st.done) break;
        if (st.call) await p2.evaluate(() => document.querySelectorAll('.lvc-opt')[0].click());
        await p2.waitForTimeout(60);
      }
      const done = await p2.evaluate(() => !document.querySelector('#lv-verdict').hidden);
      ok(done, 'and the game finishes once it is answered');
    }
  }

  ok(boom.length === 0, 'nothing threw and the console stayed clean\n      '
    + boom.slice(0, 4).join('\n      '));
  await browser.close();
  report();
  process.exit(failures.length ? 1 : 0);
};

main().catch((e) => { console.error(e); process.exit(1); });
