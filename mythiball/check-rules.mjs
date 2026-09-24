#!/usr/bin/env node
/* MythiBall: does it play baseball?

   `verify-rules.mjs` asks whether a SITUATION is handled: a walk-off walk, a
   mercy rule, a tag on a caught fly. Each of its scenarios is one the audit
   found the game getting wrong, so each is a claim about one line. What
   nothing here has ever asked is whether the sport's own ARITHMETIC holds
   over a whole game, and that is a different question with a different shape:
   it is a property of every state the game can reach rather than of a state
   somebody thought to set up.

   THE ONE THAT MATTERS IS THE IDENTITY. Every batter who comes to the plate
   in a half inning either makes an out, scores, or is standing on a base when
   it ends. So

       plate appearances = outs + runs + men left on base

   exactly, every half inning, with no tolerance, and it is violated by any
   runner who is duplicated, dropped, advanced twice or put out twice. That is
   most of the ways a base-running rule can be wrong, and not one of them
   throws: a runner who quietly vanishes off second leaves a game that renders
   perfectly and is missing a man.

   IT DRIVES THE REAL FUNCTIONS AND NEVER A COPY. `applyHitMutation`,
   `applyOutMutation`, `applyDoublePlayMutation`, `recordWalk`, `recordOut`,
   `afterHitTransition`, `afterOutTransition`, `checkWalkOff` and
   `endHalfInning` are the game's own, called in the order `scheduleContactPlay`
   calls them, so what is measured is the rules layer the page actually runs.
   What is left out is the ANIMATION layer, deliberately: a plate appearance
   here is the outcome applied and the transition taken, which is what the play
   timers do once the ball has landed. Timers are suppressed for the sweep, or
   a game would take its own eight minutes and the sweep would be a reading of
   one.

   Needs Playwright with Chromium.
     node mythiball/check-rules.mjs            120 games
     node mythiball/check-rules.mjs 400        more of them
   `MYTHIBALL_PAGE` points it at another copy of the page, which is how a
   guard here is proved to have teeth: reintroduce the defect in a copy and
   read the failure, rather than breaking the tree for the length of a run. */

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }

const here = path.dirname(fileURLToPath(import.meta.url));
const URL = 'file://' + (process.env.MYTHIBALL_PAGE
  ? path.resolve(process.env.MYTHIBALL_PAGE) : path.join(here, 'index.html'));

const GAMES = Number(process.argv[2] || 120);

let failures = 0;
const ok = (cond, what, detail) => {
  if (cond) { console.log('  ok   ' + what); return; }
  failures++;
  console.log('  FAIL ' + what + (detail ? '\n       ' + detail : ''));
};

/* The sweep, run inside the page. It returns every violation it saw plus a
   census of what it actually exercised, because a sweep that reached no extra
   inning proves nothing about extra innings and a count is the only thing
   that can say so. */
function sweep(games, seed) {
  /* Timers off for the length of the sweep. Every one of them is animation
     or pacing: the next at bat, the inning board, the result screen. The
     rules run synchronously inside the calls below. */
  const realTimeout = window.setTimeout;
  window.setTimeout = () => 0;

  let s = seed >>> 0;
  const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  const pick = (a) => a[Math.floor(rnd() * a.length) % a.length];

  const bad = [];
  const census = {
    games: 0, halves: 0, pa: 0, extras: 0, extraBottoms: 0, walkoffs: 0,
    mercies: 0, ties: 0, dp: 0, sacFly: 0, bunts: 0, homers: 0, errors: 0,
    thrownOutAtPlate: 0, awayWins: 0, homeWins: 0, maxInning: 0, runs: 0,
  };
  const say = (what, g, extra) => {
    if (bad.length > 40) return;
    bad.push(what + ' [' + (g ? `${g.half} ${g.inning}, ${g.outs} out, ${g.away.score}-${g.home.score}` : '-') + ']'
             + (extra ? ' ' + extra : ''));
  };

  for (let gi = 0; gi < games; gi++) {
    State.team = ROSTER.slice(0, 9).map(c => c.k);
    State.teamName = 'Testers';
    State.opponent = randomOpponent(null);
    State.innings = pick([5, 5, 9]);
    State.mode = 'exhibition';
    startGame({ mode: 'exhibition', youHome: rnd() < 0.5 });
    const g = State.game;
    g.sendRule = pick(['auto', 'auto', 'send', 'hold']);
    census.games++;

    /* The per half accounting. `pa` counts batters, `runs` the runs that
       crossed, and the stranded men are read at the moment the half ends. */
    let pa = 0, runsAtHalfStart = { away: g.away.score, home: g.home.score };
    let half = g.half, inning = g.inning;
    let prevIdx = { away: g.away.idx, home: g.home.idx };
    let prevScore = { away: g.away.score, home: g.home.score };

    /* OUTS ARE READ ABSOLUTE AND NEVER AS A DELTA, which the first draft of
       this got wrong and reported every half inning as unbalanced. The outs
       made in a half ARE `g.outs` at the moment it ends, because that counter
       is what endHalfInning resets; a delta over one plate appearance is the
       outs that appearance made, which is a different number and is never
       three. */
    const closeHalf = (outsMade, stranded) => {
      const key = half === 'top' ? 'away' : 'home';
      const runs = (key === 'away' ? g.away.score : g.home.score) - runsAtHalfStart[key];
      census.halves++;
      census.runs += runs;
      if (pa !== outsMade + runs + stranded) {
        say(`the half does not balance: ${pa} to the plate, ${outsMade} out, ${runs} in, ${stranded} left`,
            g, `(${half} ${inning})`);
      }
      pa = 0;
      runsAtHalfStart = { away: g.away.score, home: g.home.score };
    };

    let guard = 0;
    while (!g.over && !g.finished && guard++ < 900) {
      /* --- the state a plate appearance may start from --- */
      if (g.outs < 0 || g.outs > 2) say('an at bat starts with ' + g.outs + ' out', g);
      if (g.balls !== 0 || g.strikes !== 0) say(`the count is ${g.balls}-${g.strikes} before a pitch`, g);
      if (g.inning < 1) say('the inning is ' + g.inning, g);
      census.maxInning = Math.max(census.maxInning, g.inning);
      if (g.inning > g.innings) { census.extras = 1; if (g.half === 'bottom') census.extraBottoms++; }
      {
        const on = g.bases.filter(Boolean);
        const keys = on.map(c => c.k);
        if (new Set(keys).size !== keys.length) say('one runner is on two bases', g, keys.join(','));
      }
      /* THE HOME TEAM DOES NOT BAT WHEN IT CANNOT MATTER. A plate appearance
         in the bottom of the final inning or later with the home team already
         ahead is a game that should have ended. */
      if (g.half === 'bottom' && g.inning >= g.innings && g.home.score > g.away.score) {
        say('the home team bats while already ahead in the last of it', g);
      }

      const batter = currentBatter();
      const battingKey = g.half === 'top' ? 'away' : 'home';
      const startOuts = g.outs;
      const basesBefore = g.bases.slice();

      /* --- ONE PLATE APPEARANCE, AND THE TRANSITION IS THE GAME'S OWN ---

         The first draft of this decided for itself when a half inning was
         over: every branch carried its own `if (g.outs >= 3) endHalfInning()`
         before handing on. That is the harness doing the page's job, and it
         hid the defect it should have found, because a hit on which the third
         out is a runner gunned down at the plate went through a branch that
         ended the inning here and not there. What runs now is
         scheduleContactPlay's own four lines, in its own order, and the only
         thing this file decides is what the outcome was. */
      const r = rnd();
      let wasOut = false, wasDP = false, kind = 'single', ownTransition = false, isHit = false;
      /* What the board reads at the moment a half inning would end, captured
         where each path can still see it. */
      let endOuts = startOuts, endStranded = basesBefore.filter(Boolean).length;

      if (r < 0.185) {                                   /* strikeout */
        /* recordOut carries its own transition, and it hands to
           endHalfInning, which resets the counter: read after it, every half
           that ended on a strikeout reports nought out. A strikeout moves
           nobody, so the men on when it was thrown are the men left on. */
        endOuts = startOuts + 1;
        ownTransition = true;
        recordOut('swinging strikeout', true);
      } else if (r < 0.275) {                            /* walk */
        ownTransition = true;
        recordWalk();
      } else if (r < 0.315 && basesBefore[0] && startOuts < 2) {   /* double play */
        applyDoublePlayMutation(batter);
        census.dp++;
        wasOut = true; wasDP = true; kind = 'ground out';
      } else if (r < 0.345) {                            /* error */
        applyHitMutation('single', batter, { onError: true });
        census.errors++;
      } else if (r < 0.385 && startOuts < 2) {           /* bunt */
        census.bunts++;
        if (rnd() < 0.5) { applyOutMutation('bunt out', batter); wasOut = true; kind = 'bunt out'; }
        else applyHitMutation('single', batter);
      } else if (r < 0.615) {                            /* ground out */
        applyOutMutation('ground out', batter);
        wasOut = true; kind = 'ground out';
      } else if (r < 0.795) {                            /* fly out, and the tag */
        const third = g.bases[2];
        applyOutMutation('fly out', batter);
        if (third && g.bases[2] !== third) census.sacFly++;
        wasOut = true; kind = 'fly out';
      } else {                                           /* a hit */
        kind = r < 0.945 ? 'single' : (r < 0.975 ? 'double' : (r < 0.985 ? 'triple' : 'home run'));
        if (kind === 'home run') census.homers++;
        applyHitMutation(kind, batter);
        isHit = true;
      }
      pa++;
      /* An out on a HIT is a runner gunned down at the plate, and only a hit
         can produce one. Counted off `g.outs` across every branch it read the
         strikeouts too, which is 0.185 of every plate appearance wearing the
         name of the rarest out in the game. */
      if (isHit && g.outs > startOuts) census.thrownOutAtPlate++;

      if (!ownTransition) {
        endOuts = g.outs;
        endStranded = g.bases.filter(Boolean).length;
        /* scheduleContactPlay's own tail, verbatim. */
        if (checkWalkOff()) g.over = true;
        else if (wasDP && g.outs >= 3) endPlateAppearance();
        else if (wasOut) afterOutTransition();
        else afterHitTransition(kind);
      }
      if (g.half !== half || g.inning !== inning) closeHalf(endOuts, endStranded);

      census.pa++;

      /* --- what the plate appearance was allowed to do --- */
      if (g.away.score < prevScore.away || g.home.score < prevScore.home) {
        say('a score went down', g);
      }
      prevScore = { away: g.away.score, home: g.home.score };

      if (!g.over && !g.finished) {
        const t = battingKey === 'away' ? g.away : g.home;
        const want = (prevIdx[battingKey] + 1) % 9;
        if (t.idx !== want) say(`the order jumped: ${prevIdx[battingKey]} to ${t.idx}`, g);
      }
      prevIdx = { away: g.away.idx, home: g.home.idx };

      if (g.outs > 3) say('there are ' + g.outs + ' outs', g);

      /* the half may only move forward */
      if (g.inning !== inning || g.half !== half) {
        const fwd = g.inning > inning || (g.inning === inning && half === 'top' && g.half === 'bottom');
        if (!fwd) say(`the clock went back: ${half} ${inning} to ${g.half} ${g.inning}`, g);
        half = g.half; inning = g.inning;
        if (g.outs !== 0 && !g.over) say('a half inning starts with ' + g.outs + ' out', g);
      }

      /* the line score is the score */
      for (const key of ['away', 'home']) {
        const line = g.lineScore[key] || [];
        const sum = line.reduce((a, b) => a + (b | 0), 0);
        if (sum !== g[key].score) {
          say(`the ${key} line score reads ${sum} against ${g[key].score}`, g);
        }
      }
    }

    if (guard >= 900) say('the game never ended', g);

    /* --- how it ended --- */
    if (g.over) {
      if (g.walkoff) census.walkoffs++;
      if (g.mercy) census.mercies++;
      if (g.away.score === g.home.score) { census.ties++; say('the game ended level', g); }
      if (g.winner === 'away') census.awayWins++; else if (g.winner === 'home') census.homeWins++;
      const wantWinner = g.away.score > g.home.score ? 'away' : 'home';
      if (g.winner !== wantWinner) say(`the winner is ${g.winner} on ${g.away.score}-${g.home.score}`, g);
      /* A GAME THAT ENDS WITH THE HOME TEAM DUE UP. endHalfInning flips the
         half before it asks whether the game is over, so `bottom` at the
         final whistle means the home team has not batted in this inning. The
         only reason that is legal is that they are already ahead. */
      if (g.half === 'bottom' && g.home.score <= g.away.score && !g.mercy) {
        say('the game ended with the home team still to bat and not ahead', g);
      }
      /* Regulation is not over early. */
      if (!g.mercy && !g.walkoff && g.inning < g.innings) {
        say('the game ended before the last inning', g);
      }
    }
    abandonGame && null;
  }

  window.setTimeout = realTimeout;
  return { bad, census };
}

async function main() {
  const browser = await chromium.launch();
  const pg = await browser.newPage();
  const errors = [];
  pg.on('pageerror', e => errors.push(e.message));
  await pg.goto(URL);
  await pg.evaluate(() => localStorage.clear());
  await pg.goto(URL);
  await pg.evaluate(() => {
    Sound.muted = true;
    PREFS.cutscenes = false;
    PREFS.coach = false;
    window.confirm = () => true;
    State.gameSpeed = 'fast'; applyGameSpeed();
  });

  console.log(`the sport's own arithmetic, over ${GAMES} games`);
  const r = await pg.evaluate(([n, seed, src]) => {
    // eslint-disable-next-line no-new-func
    return new Function('games', 'seed', 'return (' + src + ')(games, seed)')(n, seed);
  }, [GAMES, 20260924, sweep.toString()]);

  const c = r.census;
  console.log(`       ${c.games} games, ${c.halves} half innings, ${c.pa} plate appearances`);
  console.log(`       ${c.homeWins} home wins, ${c.awayWins} away, ${c.walkoffs} walk-offs, ` +
              `${c.mercies} mercies, longest ${c.maxInning} innings`);
  console.log(`       ${(c.runs / c.halves * 9).toFixed(2)} runs per nine innings a side`);
  console.log(`       ${c.dp} double plays, ${c.sacFly} sacrifice flies, ${c.bunts} bunts, ` +
              `${c.homers} homers, ${c.thrownOutAtPlate} gunned down at the plate`);

  /* COVERAGE IS HALF THE CHECK. A sweep that never reached an extra inning
     says nothing about extra innings, and a sweep with no runner thrown out
     at the plate never tested the one out that is charged to a man who came
     to the plate an at bat ago. */
  ok(c.games === GAMES, 'every game finished', `${c.games} of ${GAMES}`);
  ok(c.halves > GAMES * 6, 'it played whole games', c.halves + ' half innings');
  ok(c.extraBottoms > 0, 'it reached the bottom of an extra inning', 'none');
  ok(c.walkoffs > 0, 'it saw a walk-off', String(c.walkoffs));
  ok(c.dp > 0 && c.sacFly > 0 && c.thrownOutAtPlate > 0,
     'it saw a double play, a sacrifice fly and an out at the plate',
     `${c.dp} / ${c.sacFly} / ${c.thrownOutAtPlate}`);

  ok(r.bad.length === 0, 'every half inning balances and every game ends legally',
     r.bad.slice(0, 20).join('\n       '));

  /* THE TWO THE SWEEP CAN ONLY MEET BY LUCK. A random sweep reaches an extra
     inning on a few games in a hundred and reaches one in which the away team
     scores on fewer still, so leaving the claim to the sweep is leaving it to
     the seed. Both are set by hand here, which is what verify-rules does with
     every situation it holds. */
  console.log('the situations a sweep meets by luck');
  const sit = await pg.evaluate(() => {
    const rt = window.setTimeout; window.setTimeout = () => 0;
    const open = (innings, youHome) => {
      State.team = ROSTER.slice(0, 9).map(c => c.k); State.teamName = 'Testers';
      State.opponent = randomOpponent(null); State.innings = innings;
      State.mode = 'exhibition';
      startGame({ mode: 'exhibition', youHome });
      return State.game;
    };
    const out = {};

    /* The away team takes the lead in the top of an extra inning. The home
       team has to get its half. */
    {
      const g = open(5, true);
      g.half = 'top'; g.inning = 6; g.outs = 2;
      g.away.score = 4; g.home.score = 3; g.bases = [null, null, null];
      endHalfInning();
      out.extra = { over: !!g.over, half: g.half, inning: g.inning, winner: g.winner };
    }
    /* And the home team answering it wins on the spot. */
    {
      const g = open(5, true);
      g.half = 'bottom'; g.inning = 6; g.outs = 1;
      g.away.score = 4; g.home.score = 4; g.bases = [null, null, null];
      applyHitMutation('home run', g.home.batters[4]);
      out.extraAnswer = { home: g.home.score, walkoff: !!g.walkoff, over: !!checkWalkOff() };
    }
    /* The home team leads after the top of the last. It does not bat. */
    {
      const g = open(5, true);
      g.half = 'top'; g.inning = 5; g.outs = 2; g.away.score = 1; g.home.score = 3;
      endHalfInning();
      out.noBottom = { over: !!g.over, winner: g.winner, half: g.half };
    }
    /* Level after the last. It plays on. */
    {
      const g = open(5, true);
      g.half = 'bottom'; g.inning = 5; g.outs = 2; g.away.score = 2; g.home.score = 2;
      endHalfInning();
      out.tied = { over: !!g.over, half: g.half, inning: g.inning };
    }
    /* THE ORDER IS CONTINUOUS. The man who makes the third out does not lead
       off the next inning; the next man in the order does. Asked three ways,
       because three different functions end a half inning: a strikeout goes
       through recordOut, a ground out through afterOutTransition, and a
       runner gunned down at the plate hands straight to endHalfInning. */
    {
      const g = open(5, true);
      g.half = 'top'; g.inning = 1; g.outs = 2; g.away.idx = 4;
      recordOut('swinging strikeout', true);
      out.orderK = g.away.idx;
    }
    {
      const g = open(5, true);
      g.half = 'top'; g.inning = 1; g.outs = 2; g.away.idx = 7;
      applyOutMutation('ground out', g.away.batters[7]);
      afterOutTransition();
      out.orderGround = g.away.idx;
    }
    {
      const g = open(5, true);
      g.half = 'top'; g.inning = 1; g.outs = 2; g.away.idx = 8;
      g.bases = [g.away.batters[0], null, null];
      applyDoublePlayMutation(g.away.batters[8]);
      if (g.outs >= 3) endPlateAppearance();
      out.orderDp = g.away.idx;
    }
    /* A walk with the bases loaded forces in exactly one. */
    {
      const g = open(5, true);
      g.half = 'top'; g.inning = 1; g.outs = 1; g.away.idx = 3;
      const b = g.away.batters;
      g.bases = [b[0], b[1], b[2]];
      recordWalk();
      out.forcedIn = { runs: g.away.score, on: g.bases.filter(Boolean).length };
    }
    /* A GROUND OUT MOVES THE MEN IT FORCED, AND ONLY THEM. */
    {
      const g = open(5, true); const b = g.away.batters;
      g.half = 'top'; g.inning = 1; g.outs = 0; g.away.idx = 5;
      g.bases = [b[0], null, null];
      applyOutMutation('ground out', b[5]);
      out.forceOne = g.bases.map(x => (x ? 1 : 0)).join('');
    }
    {
      const g = open(5, true); const b = g.away.batters;
      g.half = 'top'; g.inning = 1; g.outs = 0; g.away.idx = 5;
      g.bases = [null, b[1], b[2]];
      applyOutMutation('ground out', b[5]);
      out.forceNone = { on: g.bases.map(x => (x ? 1 : 0)).join(''), runs: g.away.score };
    }
    {
      const g = open(5, true); const b = g.away.batters;
      g.half = 'top'; g.inning = 1; g.outs = 1; g.away.idx = 5;
      g.bases = [b[0], b[1], b[2]];
      applyOutMutation('ground out', b[5]);
      out.forceLoaded = { on: g.bases.map(x => (x ? 1 : 0)).join(''), runs: g.away.score };
    }
    {
      const g = open(5, true); const b = g.away.batters;
      g.half = 'top'; g.inning = 1; g.outs = 2; g.away.idx = 5;
      g.bases = [b[0], b[1], b[2]];
      applyOutMutation('ground out', b[5]);
      out.forceThirdOut = { runs: g.away.score, outs: g.outs };
    }
    /* A HOME TEAM THAT DID NOT NEED TO BAT GETS AN X, not a blank. */
    {
      const g = open(5, true);
      g.half = 'top'; g.inning = 5; g.outs = 2; g.away.score = 1; g.home.score = 3;
      endHalfInning();
      out.xCell = { last: lineBlank(true, 4), unplayed: lineBlank(true, 5), away: lineBlank(false, 4) };
    }
    /* A SACRIFICE IS NOT AN AT BAT. */
    {
      const g = open(5, true); const b = g.away.batters;
      g.half = 'top'; g.inning = 1; g.outs = 0; g.away.idx = 5;
      g.bases = [b[0], null, null];
      applyOutMutation('bunt out', b[5]);
      out.sacBunt = { ab: g.stats.ab[b[5].k] | 0, on: g.bases.map(x => (x ? 1 : 0)).join('') };
    }
    {
      const g = open(5, true); const b = g.away.batters;
      g.half = 'top'; g.inning = 1; g.outs = 0; g.away.idx = 5;
      g.bases = [null, null, null];
      applyOutMutation('bunt out', b[5]);
      out.plainBunt = { ab: g.stats.ab[b[5].k] | 0 };
    }
    {
      /* THE AWAY SIDE HAS TO BE YOURS AND THE DICE HAVE TO BE PINNED. tagUp
         reads the SEND button only for the team you are managing and the
         other dugout is always on auto, so on a game you are playing at home
         this scenario sets a rule nobody consults, and then rolls for the
         throw. Written that way it passed or failed on how fast the man on
         third happened to be. */
      const g = open(5, false); const b = g.away.batters;
      g.half = 'top'; g.inning = 1; g.outs = 0; g.away.idx = 5;
      g.bases = [null, null, b[2]];
      g.sendRule = 'send';
      const rr = Math.random; Math.random = () => 0;
      applyOutMutation('fly out', b[5]);
      Math.random = rr;
      out.sacFly = { ab: g.stats.ab[b[5].k] | 0, runs: g.away.score };
    }
    {
      const g = open(5, false); const b = g.away.batters;
      g.half = 'top'; g.inning = 1; g.outs = 0; g.away.idx = 5;
      g.bases = [null, null, null];
      applyOutMutation('fly out', b[5]);
      out.plainFly = { ab: g.stats.ab[b[5].k] | 0 };
    }
    window.setTimeout = rt;
    return out;
  });

  ok(sit.extra.over === false && sit.extra.half === 'bottom',
     'the home team bats in the bottom of an extra inning', JSON.stringify(sit.extra));
  ok(sit.extraAnswer.home === 5 && sit.extraAnswer.walkoff === true && sit.extraAnswer.over === true,
     'and answering it wins the game there and then', JSON.stringify(sit.extraAnswer));
  ok(sit.noBottom.over === true && sit.noBottom.winner === 'home',
     'a home team already ahead does not bat in the last of it', JSON.stringify(sit.noBottom));
  ok(sit.tied.over === false && sit.tied.inning === 6,
     'level after the last plays on', JSON.stringify(sit.tied));
  ok(sit.orderK === 5, 'the order carries over a strikeout that ends the inning', 'idx=' + sit.orderK);
  ok(sit.orderGround === 8, 'and over a ground out that ends it', 'idx=' + sit.orderGround);
  ok(sit.orderDp === 0, 'and over a double play that ends it', 'idx=' + sit.orderDp);
  ok(sit.forcedIn.runs === 1 && sit.forcedIn.on === 3,
     'a walk with the bases loaded forces in one', JSON.stringify(sit.forcedIn));

  ok(sit.forceOne === '010', 'a ground out sends the man on first to second', sit.forceOne);
  ok(sit.forceNone.on === '011' && sit.forceNone.runs === 0,
     'and leaves a man it never forced where he stood', JSON.stringify(sit.forceNone));
  ok(sit.forceLoaded.on === '011' && sit.forceLoaded.runs === 1,
     'the bases loaded send one home on it', JSON.stringify(sit.forceLoaded));
  ok(sit.forceThirdOut.runs === 0 && sit.forceThirdOut.outs === 3,
     'and nobody scores when it is the third out', JSON.stringify(sit.forceThirdOut));
  ok(sit.sacBunt.ab === 0 && sit.sacBunt.on === '010',
     'a sacrifice bunt is not an at bat', JSON.stringify(sit.sacBunt));
  ok(sit.plainBunt.ab === 1, 'a bunt with nobody on is', JSON.stringify(sit.plainBunt));
  ok(sit.sacFly.runs === 1 && sit.sacFly.ab === 0,
     'a sacrifice fly is not an at bat', JSON.stringify(sit.sacFly));
  ok(sit.plainFly.ab === 1, 'an ordinary fly out is', JSON.stringify(sit.plainFly));
  ok(sit.xCell.last === 'X' && sit.xCell.unplayed === '' && sit.xCell.away === '',
     'a home team that did not need to bat gets an X', JSON.stringify(sit.xCell));

  ok(errors.length === 0, 'no page errors', errors.join(' | '));

  await pg.close();
  await browser.close();
  console.log(failures ? `\n${failures} FAILED` : '\nall good');
  process.exit(failures ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
