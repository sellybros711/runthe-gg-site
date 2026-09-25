#!/usr/bin/env node
/* MythiBall: what does a PERSON get out of it?

   `calibrate.mjs` measures the duel from the mound, against the real CPU swing
   AI. `check-bat.mjs` measures the swing's own curves and proves that being on
   the ball pays. **Neither of them can say how hard the game is**, because
   neither models the two inputs a person supplies: a bat placed somewhere, and
   a swing at some moment, both slightly wrong.

   So this one does. A human model stands in the box: it reads the pitch's own
   landing spot and its own sweet moment, adds an error to each, and swings
   through `resolveSwing`, which is the game's own arithmetic. The SIZE of the
   error is the skill level, and the ladder runs from somebody who has never
   played to somebody who has played all afternoon. Then it reads back a batting
   line, which is the one thing everybody in this sport already knows how to
   judge.

   THE TIMING ERROR IS IN MILLISECONDS AND THAT IS THE WHOLE POINT. A person's
   hands are late or early by some number of milliseconds; they are not late by
   a fraction of whatever sweep the pitch happens to have. So the model converts
   ms to a fraction of THIS pitch, which is what makes `DIFF.speed` measurable
   at all: a slower pitch really is easier, by exactly the amount it is slower.
   Written as a fraction, every pitch in the game would be equally hard and the
   dial would be invisible.

   IT IS A PLATE APPEARANCE HARNESS, NOT A GAME. Timers are suppressed and the
   half inning is held open, so what it measures is the at bat: the count, the
   walk, the strikeout, and what a ball in play turns into. Runs are somebody
   else's instrument (`check-runs.mjs`), and the fielding windows are not in it.

     node mythiball/check-skill.mjs                   all three tiers
     node mythiball/check-skill.mjs --tier medium     one of them
     node mythiball/check-skill.mjs --pa 1200         a bigger sample
   `MYTHIBALL_PAGE` points it at another copy of the page. */

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }

const here = path.dirname(fileURLToPath(import.meta.url));
const URL = 'file://' + (process.env.MYTHIBALL_PAGE
  ? path.resolve(process.env.MYTHIBALL_PAGE)
  : path.join(here, 'index.html'));

const argv = process.argv.slice(2);
const argOf = (name, dflt) => {
  const i = argv.indexOf('--' + name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};
const PA = Number(argOf('pa', 900));
const ONE_TIER = argOf('tier', null);
/* A width to run the player's timing window at, in place of the shipped one.
   It is how the shipped one was picked; a normal run passes nothing. */
const SWEET = argOf('sweet', null) == null ? null : Number(argOf('sweet', null));
const ONE_MODE = argOf('mode', null);
/* Ladder coefficients to run in place of the shipped ones, as `KEY=value` pairs
   (`--bat HIT_BASE=0.08,HIT_Q=0.27`). Also how the shipped ones were chosen. */
const BATOVER = (() => {
  const raw = argOf('bat', null);
  if (!raw) return null;
  const out = {};
  for (const part of raw.split(',')) {
    const [k, v] = part.split('=');
    if (k && v) out[k.trim()] = Number(v);
  }
  return out;
})();

let failures = 0;
const ok = (cond, what, detail) => {
  if (cond) { console.log('  ok   ' + what); return; }
  failures++;
  console.log('  FAIL ' + what + (detail ? '\n       ' + detail : ''));
};

/* THE LADDER. `aim` is in ZONE UNITS, where the strike zone is two units wide,
   so 0.5 is a quarter of the zone's width off. `ms` is how late or early the
   hands are. Both are a standard deviation, so two thirds of swings are inside
   the figure and the tail is what produces a whiff.

   The four rungs are a person who has never played, one who has played a game,
   one who has played all afternoon, and one who cannot be beaten. They are a
   ladder rather than a measurement of any particular human: what matters is
   that the game answers them differently and in the right order. */
const SKILLS = [
  { name: 'never played', aim: 0.70, ms: 150 },
  { name: 'one game in',  aim: 0.45, ms: 95 },
  { name: 'knows it',     aim: 0.26, ms: 55 },
  { name: 'cannot lose',  aim: 0.10, ms: 22 },
];

function sweep(pa, skills, tier, seed, sweet, mode, bat) {
  const realTimeout = window.setTimeout;
  window.setTimeout = () => 0;
  let s = seed >>> 0;
  const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  /* Box Muller off the harness's own stream, so a run is repeatable and the
     game's own `gauss` is left alone. */
  const nrm = () => {
    const u = Math.max(1e-9, rnd()), v = rnd();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };

  State.difficulty = tier;
  /* THE PLAYER'S TIMING WINDOW IS A DIAL AND THIS IS HOW IT WAS CHOSEN. Given
     a width it overrides the table, so the four rungs can be read at several
     widths in one run and the shipped number is the one the numbers pointed
     at. It reaches only the player's column: the CPU has its own window, which
     is why moving this does not move `calibrate.mjs`. */
  if (sweet != null) DIFF[tier].sweetWidth = sweet;
  /* And the outcome ladder, the same way and for the same reason. */
  if (bat) Object.assign(BAT, bat);
  State.team = ROSTER.slice(0, 9).map(c => c.k);
  State.teamName = 'Testers';
  State.opponent = OPPONENTS[0];
  State.innings = 9;
  State.mode = 'exhibition';
  startGame({ mode: 'exhibition', youHome: false });   /* you bat first */
  const g = State.game;

  const rows = [];
  for (const sk of skills) {
    const r = { name: sk.name, pa: 0, ab: 0, h: 0, d: 0, t: 0, hr: 0, bb: 0, k: 0,
                swings: 0, whiffs: 0, fouls: 0, inplay: 0, takes: 0, pitches: 0 };
    for (let i = 0; i < pa; i++) {
      /* A fresh plate appearance, held open: the half inning never ends, so
         what is measured is the at bat rather than a game. */
      g.outs = 0; g.balls = 0; g.strikes = 0; g.bases = [null, null, null];
      g.play = null; g.pitch = null; g.walkoff = false; g.over = false;
      g.away.idx = i % 9;
      const batter = currentBatter();
      g.batterCtx = batterContext(batter);
      /* THE SWING MODE IS ONE A PLAYER CAN ACTUALLY PICK, and the first version
         of this file used `normal`, which is the CPU's word. The three buttons
         are Contact, Power and Bunt, the default is Contact, and `normal` is
         what `resolveSwing` reads when the OTHER dugout swings.

         It is not a spelling difference. Contact widens the timing window by a
         quarter and then takes 55 per cent of the home run chance and 20 per
         cent of the extra base chance away; Power narrows the window and pays
         1.75 times on a home run. So a mode nobody can select measured a
         batting line nobody can produce: 15 per cent of plate appearances as
         home runs for a competent player, against 6 in the mode they are
         actually in. Same lesson as this repo's SQL fixture inventing a
         column, arriving at a game state. */
      g.swingMode = mode;
      r.pa++;
      let guard = 0;
      while (guard++ < 30) {
        const pick = cpuCallPitch();
        throwPitch(pick.pt, pick.zone);
        const p = g.pitch;
        if (!p) break;
        r.pitches++;
        /* WHAT THE PERSON SEES, plus an error. The pitch's landing spot and
           its sweet moment are what the ball and the bar are showing them;
           how wrong they read both is the skill. */
        const seen = { x: p.loc.x + nrm() * sk.aim * 0.55,
                       y: p.loc.y + nrm() * sk.aim * 0.55 };
        const looksStrike = Math.abs(seen.x) <= 1 && Math.abs(seen.y) <= 1;
        /* Two strikes and anything close gets protected, which is what a
           person does and is the difference between a strikeout rate and a
           called strikeout rate. */
        const protect = g.strikes >= 2 && Math.abs(seen.x) <= 1.35 && Math.abs(seen.y) <= 1.35;
        if (!looksStrike && !protect) {
          r.takes++;
          resolveCalledPitch();
          if (g.balls === 0 && g.strikes === 0) break;   /* walk or strikeout */
          continue;
        }
        g.pci = { x: p.loc.x + nrm() * sk.aim, y: p.loc.y + nrm() * sk.aim };
        const frac = sk.ms / 1000 / Math.max(0.2, p.speed);
        const t = Math.min(1, Math.max(0, p.ideal + nrm() * frac));
        r.swings++;
        p.swung = true;
        resolveSwing(t);
        const res = g.lastSwing ? g.lastSwing.res : null;
        if (res === 'whiff') r.whiffs++;
        else if (res === 'foul') r.fouls++;
        if (g.play) {
          r.inplay++;
          /* THE BOOK IS THE PAGE'S OWN AND THIS HARNESS KEEPS NONE OF ITS OWN.
             `scheduleContactPlay` decides the ball and then books it on a
             timer, and every timer here is suppressed, so the first version of
             this file counted hits itself off `g.play.kind` and then read
             `g.stats` over the top of its own tally: every rate came back .000
             with the in play column reading 88 to 100 per cent, which is a
             batting line that cannot happen. Two copies of the answer, and the
             one that was right was the one being overwritten.

             So the mutation is called here, which is the tail of
             `scheduleContactPlay` verbatim, and it is what books the at bat.
             That matters beyond the totals: whether a bunt or a fly ball is
             charged as an at bat at all is a RULE, and it lives in those
             functions rather than in any tally a checker could keep. */
          const pl = g.play;
          if (pl.doublePlay) applyDoublePlayMutation(batter);
          else if (pl.isOut) applyOutMutation(pl.kind, batter);
          else applyHitMutation(pl.kind, batter, { onError: pl.onError });
          g.play = null;
          break;
        }
        if (g.balls === 0 && g.strikes === 0) break;    /* the at bat ended */
      }
      /* The at bat's book, read off what the game recorded rather than
         counted here: a walk and a strikeout are the two that do not reach
         `g.play`. */
      const st = g.stats;
      r.bb = Object.values(st.bb || {}).reduce((a, b) => a + b, 0);
      r.k = Object.values(st.so || {}).reduce((a, b) => a + b, 0);
      r.ab = Object.values(st.ab || {}).reduce((a, b) => a + b, 0);
      r.h = Object.values(st.hits || {}).reduce((a, b) => a + b, 0);
      r.hr = Object.values(st.hr || {}).reduce((a, b) => a + b, 0);
      r.d = Object.values(st.d || {}).reduce((a, b) => a + b, 0);
      r.t = Object.values(st.t || {}).reduce((a, b) => a + b, 0);
    }
    rows.push(r);
    /* Wipe the book between rungs so each row is its own sample. */
    for (const key of Object.keys(g.stats)) g.stats[key] = {};
  }

  window.setTimeout = realTimeout;
  return rows;
}

const pct = (a, b) => (b ? Math.round(a / b * 1000) / 10 : 0);
const avg = (h, ab) => (ab ? (h / ab).toFixed(3).replace(/^0/, '') : '.000');

async function main() {
  const browser = await chromium.launch();
  const pg = await browser.newPage();
  const errors = [];
  pg.on('pageerror', e => errors.push(e.message));
  await pg.goto(URL);
  await pg.evaluate(() => localStorage.clear());
  await pg.goto(URL);
  await pg.evaluate(() => {
    Sound.muted = true; PREFS.cutscenes = false; PREFS.coach = false;
    window.confirm = () => true;
  });

  const tiers = ONE_TIER ? [ONE_TIER] : ['easy', 'medium', 'hard'];
  /* BOTH SWINGS A PLAYER CAN TAKE AT A PITCH. Contact is the default and is
     what most of the game is played in, so it is what the bands are written
     against; Power is the other real choice and its line is printed beside it,
     because a mode that is strictly worse is a button nobody should press. */
  const modes = ONE_MODE ? [ONE_MODE] : ['contact', 'power'];
  const all = {};
  for (const tier of tiers) for (const mode of modes) {
    const rows = await pg.evaluate(([pa, skills, tier, seed, src, sweet, mode, bat]) => {
      // eslint-disable-next-line no-new-func
      return new Function('pa', 'skills', 'tier', 'seed', 'sweet', 'mode', 'bat',
        'return (' + src + ')(pa, skills, tier, seed, sweet, mode, bat)')(
          pa, skills, tier, seed, sweet, mode, bat);
    }, [PA, SKILLS, tier, 20260924, sweep.toString(), SWEET, mode, BATOVER]);
    if (mode === 'contact') all[tier] = rows;
    console.log(`\n${tier.toUpperCase()} ${mode.toUpperCase()}   ${PA} plate appearances a rung`);
    console.log('  who               AVG   OBP   SLG    HR%    K%   BB%  ' +
                'swing%  whiff/sw  in play/sw');
    for (const r of rows) {
      const slg = r.ab ? ((r.h - r.d - r.t - r.hr) + r.d * 2 + r.t * 3 + r.hr * 4) / r.ab : 0;
      console.log(`  ${r.name.padEnd(16)} ${avg(r.h, r.ab)}  ${avg(r.h + r.bb, r.pa)}  ` +
        `${slg.toFixed(3).replace(/^0/, '')}  ${String(pct(r.hr, r.pa)).padStart(5)}  ` +
        `${String(pct(r.k, r.pa)).padStart(4)}  ${String(pct(r.bb, r.pa)).padStart(4)}  ` +
        `${String(pct(r.swings, r.pitches)).padStart(6)}  ${String(pct(r.whiffs, r.swings)).padStart(8)}  ` +
        `${String(pct(r.inplay, r.swings)).padStart(10)}`);
    }
  }

  /* WHAT A GAME HAS TO DO, and these are the claims a curve cannot make.
     A ladder that answers every rung the same is a game where skill does not
     pay; one where the bottom rung cannot make contact is a game nobody
     finishes; one where the top rung is perfect has no ceiling to chase. */
  console.log('');
  for (const tier of tiers) {
    const rows = all[tier];
    const by = {}; for (const r of rows) by[r.name] = r;
    const a = (n) => by[n].ab ? by[n].h / by[n].ab : 0;
    const order = SKILLS.map(s => s.name);
    const avgs = order.map(a);
    ok(avgs.every((v, i) => i === 0 || v > avgs[i - 1]),
       `${tier}: every rung of skill hits better than the one below`,
       order.map((n, i) => `${n} ${avgs[i].toFixed(3)}`).join(' / '));
    /* THE BANDS ARE WHERE THE DIALS WERE MEASURED TO LAND AND NOT WHERE ANY
       REAL SPORT SITS. This is an arcade baseball game, so a competent player
       hits well over .300; what the bands are for is that the bottom rung can
       still put a ball in play, the top rung is a CEILING rather than a place
       anybody arrives at in an afternoon, and the distance between the two is
       worth playing for. */
    ok(avgs[0] >= 0.180 && avgs[0] <= 0.330,
       `${tier}: somebody who has never played can still put it in play`,
       'never played hits ' + avgs[0].toFixed(3));
    ok(avgs[3] >= 0.490 && avgs[3] <= 0.640,
       `${tier}: and the best there is has a ceiling to chase`,
       'cannot lose hits ' + avgs[3].toFixed(3));
    ok(avgs[3] - avgs[1] >= 0.120,
       `${tier}: and the ceiling is a long way above a player one game in`,
       `${avgs[1].toFixed(3)} to ${avgs[3].toFixed(3)}`);
    ok(pct(by['knows it'].k, by['knows it'].pa) <= 32,
       `${tier}: a player who knows it is not struck out a third of the time`,
       pct(by['knows it'].k, by['knows it'].pa) + '% K');
  }
  if (tiers.length === 3) {
    /* WHAT A TIER BUYS THE PLAYER IS THE WINDOW, SO THE CLAIM IS THE WHIFFS.
       Written on the batting average it is a band this file cannot resolve: the
       easy to hard gap for a competent player measures about .03 against a
       standard error near .02 at 700 plate appearances, so it inverted between
       medium and hard on a page with nothing wrong with it. Raising the sample
       to where .03 is three sigma means five thousand appearances a rung, which
       is minutes a tier in CI for a claim about a side effect.

       The window is what `sweetWidth` actually moves, and whiffs per swing is
       what the window decides: at medium a competent player misses 5.3 per
       hundred swings against 6.9 on hard, and somebody who has never played
       misses 25.6 against 34.8. Nine points of a rate on four hundred swings is
       four sigma, so it is a claim rather than a coin toss. The averages are
       printed above either way, and pooled across the four rungs they are asked
       to agree with the ordering too, which is the most a sample this size can
       say about them. */
    const whiff = (t, n) => { const r = all[t].find(x => x.name === n);
      return r.swings ? r.whiffs / r.swings : 0; };
    const pool = (t) => all[t].reduce((a, r) => a + (r.ab ? r.h / r.ab : 0), 0) / all[t].length;
    for (const n of ['never played', 'knows it']) {
      ok(whiff('easy', n) < whiff('hard', n),
         `a ${n} player misses more on hard than on easy`,
         ['easy', 'medium', 'hard'].map(t => `${t} ${(whiff(t, n) * 100).toFixed(1)}%`).join(' / '));
    }
    ok(pool('easy') > pool('hard'),
       'and the tiers are in order across the four rungs',
       ['easy', 'medium', 'hard'].map(t => `${t} ${pool(t).toFixed(3)}`).join(' / '));
  }
  ok(errors.length === 0, 'no page errors', [...new Set(errors)].join(' | '));

  await pg.close();
  await browser.close();
  console.log(failures ? `\n${failures} FAILED` : '\nall good');
  process.exit(failures ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
