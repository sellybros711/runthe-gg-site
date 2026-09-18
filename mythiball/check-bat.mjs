/* WHAT A PLAYER'S BAT ACTUALLY DOES.

   node mythiball/check-bat.mjs            the sweeps and the bands
   node mythiball/check-bat.mjs --list     print every curve it reads

   calibrate.mjs measures this duel from the MOUND: real pitches from an
   unsteered arm against the real CPU swing AI. There has never been an
   equivalent for the half a person actually plays, which is why hitting
   has been graded on inspection while pitching has been graded on
   numbers.

   A player's swing has two inputs the CPU's does not: WHEN the bat comes
   through, and WHERE it is when it does. swingGeometry combines them and
   is PURE over (timing, aim, pitch, batter, mode), so the curves are
   swept directly rather than through played seasons, the way the football
   game guards its results arithmetic in the engine. What can go wrong
   here is a seam, not a season.

   THE PROPERTY THAT MATTERS MOST IS MONOTONICITY IN BOTH INPUTS. Swinging
   closer in TIME must never produce worse contact, and putting the bat
   closer in SPACE must never produce worse contact. That is `sendOdds`'
   rule ("a rating must never buy you less") applied to the player's own
   skill instead of to a rating, and this function is exactly the shape it
   goes wrong in: two clamped curves multiplied together, with a `through`
   cliff at 1.35 reaches and an `inZone` seam at locQ 0.18.

   WHAT THE BANDS ARE FOR is the other half. A sweep says the curve is the
   right shape; it cannot say the shape is worth playing. A perfect swing
   that produced contact half the time would pass every monotonicity
   assertion and be a miserable game.
*/
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { pathToFileURL } from 'url';
const LIST = process.argv.includes('--list');
const URL = pathToFileURL('mythiball/index.html').href;

const browser = await chromium.launch();
const pg = await browser.newPage();
const errors = []; pg.on('pageerror', e => errors.push(e.message));
await pg.goto(URL);
await pg.evaluate(() => localStorage.clear());
await pg.goto(URL);

/* The game is started FIRST and then waited on. batterCtx is not set
   synchronously by startGame, and throwPitch reads it, so a single
   evaluate that starts a game and swings in it throws on the first pitch.
   Same wait every harness here needs. */
await pg.evaluate(() => {
  Sound.muted = true; PREFS.cutscenes = false; PREFS.coach = false;
  window.confirm = () => true;
  State.difficulty = 'medium';
  State.team = ROSTER.slice(0, 9).map(c => c.k); State.teamName = 'Bat';
  State.opponent = OPPONENTS[0]; State.innings = 5; State.mode = 'exhibition';
  startGame({ mode: 'exhibition', youHome: false });   /* you bat first */
});
await pg.waitForTimeout(900);

const out = await pg.evaluate(() => {
  /* A MIDDLING HITTER, not a star and not a statue, so the curves are
     about the mechanic rather than about one character. */
  const ctx = { pow: 60, con: 60, spd: 60, flags: {} };
  const pitch = { ideal: 0.5, loc: { x: 0, y: 0 } };
  const at = (t, ax, ay, mode) =>
    swingGeometry(t, { x: ax, y: ay }, pitch, ctx, mode || 'contact');

  const res = { curves: {}, modes: {}, con: {} };

  /* 1. CONTACT AGAINST TIMING, bat right on the ball. */
  for (const mode of ['contact', 'normal', 'power']) {
    const row = [];
    for (let i = 0; i <= 40; i++) {
      const err = i / 200;                       /* 0 to 0.20 of the meter */
      row.push([+err.toFixed(4), +at(0.5 + err, 0, 0, mode).contact.toFixed(4)]);
    }
    res.curves['timing:' + mode] = row;
  }
  /* 2. CONTACT AGAINST AIM, timed perfectly. Swept over and under rather
        than along, because the bat is a cylinder and a miss along it
        costs half as much, so the vertical axis is the strict one. */
  for (const mode of ['contact', 'normal', 'power']) {
    const row = [];
    for (let i = 0; i <= 40; i++) {
      const d = i / 40;                          /* 0 to 1.0 zone units */
      row.push([+d.toFixed(4), +at(0.5, 0, d, mode).contact.toFixed(4)]);
    }
    res.curves['aim:' + mode] = row;
  }
  /* 3. THE MODES, at their own best. Contact widens the timing window and
        the reach; power narrows both. */
  for (const mode of ['contact', 'normal', 'power']) {
    const g = at(0.5, 0, 0, mode);
    res.modes[mode] = { half: +g.half.toFixed(4), reach: +g.reach.toFixed(4),
                        best: +g.contact.toFixed(4) };
  }
  /* 4. CON, which is what the rating is FOR. */
  for (const con of [20, 40, 60, 80, 99]) {
    const c2 = { pow: 60, con, spd: 60, flags: {} };
    const g0 = swingGeometry(0.5, { x: 0, y: 0 }, pitch, c2, 'contact');
    /* a swing a little off in both, which is what a person does */
    const g1 = swingGeometry(0.53, { x: 0.12, y: 0.12 }, pitch, c2, 'contact');
    res.con[con] = { reach: +g0.reach.toFixed(4), best: +g0.contact.toFixed(4),
                     human: +g1.contact.toFixed(4) };
  }

  /* 5. THE PLAYED SWING. The curves say the shape; this says what comes
        off the bat, driven through resolveSwing against real pitches with
        the outcome read off g.lastSwing.res. Four kinds of swing, because
        what a meter has to separate is skill from luck. */
  const realTimeout = window.setTimeout;
  window.setTimeout = (fn) => 0;                 /* no beats, no animation */
  const swings = (n, terr, aerr) => {
    const tally = { hit: 0, foul: 0, whiff: 0, other: 0 };
    let qsum = 0, qn = 0;
    for (let i = 0; i < n; i++) {
      const g = State.game;
      if (!g || g.over) break;
      endAtBatCleanup();
      g.balls = 0; g.strikes = 0; g.outs = 0;
      /* a real pitch from the real arm, then swing at it on purpose */
      throwPitch();
      const p = g.pitch;
      if (!p) break;
      const jit = (e) => (Math.random() * 2 - 1) * e;
      const t = clamp(p.ideal + jit(terr), 0.02, 0.98);
      const aim = { x: p.loc.x + jit(aerr), y: p.loc.y + jit(aerr) };
      /* WHAT THE SWING WAS WORTH, off the same function the game uses to
         resolve it, read BEFORE resolving because resolveSwing advances
         the at bat out from under the pitch. */
      const bctx = g.batterCtx || ctx;
      qsum += swingGeometry(t, aim, p, bctx, g.swingMode || 'contact').contact;
      qn++;
      g.lastSwing = null;
      try { resolveSwing(t, aim); } catch (e) { /* the play may not finish */ }
      const r = g.lastSwing && g.lastSwing.res;
      if (r === 'hit') tally.hit++;
      else if (r === 'foul') tally.foul++;
      else if (r === 'whiff') tally.whiff++;
      else tally.other++;
    }
    const seen = tally.hit + tally.foul + tally.whiff + tally.other || 1;
    return { n: seen,
             hit: +(100 * tally.hit / seen).toFixed(1),
             foul: +(100 * tally.foul / seen).toFixed(1),
             whiff: +(100 * tally.whiff / seen).toFixed(1),
             q: +(qsum / (qn || 1)).toFixed(3) };
  };
  /* THE ERROR IS IN UNITS OF THE WINDOW, not of the meter, and the first
     draft of this was in meter units and said nothing. At medium the
     timing window is about an eighth of the meter wide, so a swing 0.07
     off is comfortably INSIDE it and makes contact every single time:
     three of the four rows came back at 100% and the sweep separated
     nobody. "Half a window off" is a thing a person can be; "0.07" is a
     number that means something different on every difficulty. */
  const win = swingGeometry(0.5, { x: 0, y: 0 }, pitch, ctx, 'contact');
  const T = win.half, A = win.reach;
  res.window = { half: +T.toFixed(4), reach: +A.toFixed(4) };
  const N = 400;
  res.played = {
    perfect:  swings(N, 0, 0),                  /* on it, both ways */
    sharp:    swings(N, T * 0.40, A * 0.35),    /* somebody good at this */
    ordinary: swings(N, T * 0.85, A * 0.75),    /* somebody playing it */
    blind:    swings(N, T * 2.20, A * 1.80),    /* eyes shut */
  };
  window.setTimeout = realTimeout;
  return res;
});
await browser.close();

let bad = 0;
const ok = (cond, what, detail) => {
  if (!cond) bad++;
  console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${what}${detail ? '   ' + detail : ''}`);
};
/* THE VALUE MUST NEVER RISE AS THE ERROR GROWS. The first draft of this
   took a `dir` and multiplied by it, which inverted the comparison and
   reported every correct curve as broken: "rises at 0.015, 1 to 0.9949"
   is a FALL. A checker whose first run fails on a healthy build is the
   same class of thing as one that passes on a broken one. */
const risesSomewhere = (row) => {
  for (let i = 1; i < row.length; i++) {
    if (row[i][1] - row[i - 1][1] > 1e-9) {
      return { at: row[i][0], from: row[i - 1][1], to: row[i][1] };
    }
  }
  return null;
};

console.log('what a player\'s bat actually does\n');

if (LIST) {
  for (const [k, row] of Object.entries(out.curves)) {
    console.log(`  ${k}`);
    console.log('    ' + row.map(([x, y]) => `${x}:${y}`).join(' '));
  }
  console.log('');
}

/* SWINGING CLOSER MUST NEVER BUY LESS, in either input. */
for (const [k, row] of Object.entries(out.curves)) {
  const turn = risesSomewhere(row);
  ok(!turn, `${k}: worse aim or timing never helps`,
     turn ? `rises at ${turn.at}, ${turn.from} to ${turn.to}` : '');
}

/* THE MODES ARE WHAT THEY SAY THEY ARE. */
const m = out.modes;
ok(m.contact.half > m.normal.half && m.normal.half > m.power.half,
   'contact widens the timing window and power narrows it',
   `half ${m.contact.half} / ${m.normal.half} / ${m.power.half}`);
ok(m.contact.reach > m.normal.reach && m.normal.reach > m.power.reach,
   'and the same for how far the bat reaches',
   `reach ${m.contact.reach} / ${m.normal.reach} / ${m.power.reach}`);

/* CON IS WHAT THE RATING IS FOR. */
const cons = Object.keys(out.con).map(Number).sort((a, b) => a - b);
const reaches = cons.map(c => out.con[c].reach);
const humans = cons.map(c => out.con[c].human);
ok(reaches.every((v, i) => i === 0 || v > reaches[i - 1]),
   'a better contact rating reaches further', reaches.join(' < '));
ok(humans.every((v, i) => i === 0 || v >= humans[i - 1]),
   'and makes better contact on the same imperfect swing', humans.join(' <= '));

/* THE BANDS. A curve of the right shape can still be a bad game. */
const p = out.played;
console.log(`\nTARGETS   difficulty medium, 400 swings a row`);
console.log(`  the window is ${out.window.half} of the meter and ${out.window.reach} of reach,`
  + ` and each row is a fraction of THAT`);
console.log('  how you swing        hit%   foul%  whiff%   quality');
for (const [name, row] of Object.entries(p)) {
  console.log(`  ${name.padEnd(20)} ${String(row.hit).padStart(5)}`
    + `  ${String(row.foul).padStart(5)}  ${String(row.whiff).padStart(6)}   ${row.q}`);
}

/* THE WINDOW IS CLOSE TO BINARY, AND THAT IS THE DESIGN RATHER THAN A
   DEFECT. Inside it you connect essentially always (100, 100, 95) and
   outside it you mostly do not (9). So HIT RATE is the wrong place to
   look for skill, and the first draft of this file banded it and reported
   three failures against a game that was behaving exactly as written.

   The gradient lives in contact QUALITY, which is what swingGeometry
   returns and what decides where the ball goes and how hard. That is
   where skill has to pay, so that is what is asserted. The two ends are
   still banded, because they are the claims a curve cannot make: a
   perfect swing has to connect, and a blind one mostly must not. */
const band = (name, v, lo, hi, what) => {
  const good = v >= lo && v <= hi;
  if (!good) bad++;
  console.log(`  ${good ? 'ok  ' : 'OUT '} ${name.padEnd(28)} ${String(v).padStart(5)}   band ${lo}-${hi}  ${what}`);
};
console.log('');
band('perfect swing, hit%', p.perfect.hit, 90, 100, 'being on it has to work');
band('blind swing, hit%', p.blind.hit, 0, 25, 'and hacking has to not');

ok(p.perfect.q > p.sharp.q && p.sharp.q > p.ordinary.q && p.ordinary.q > p.blind.q,
   'SKILL PAYS: every step down in accuracy is worse contact',
   [p.perfect.q, p.sharp.q, p.ordinary.q, p.blind.q].join(' > '));

if (errors.length) { bad++; console.log('\nPAGE ERRORS:\n ' + [...new Set(errors)].slice(0, 4).join('\n ')); }
console.log(bad ? `\n${bad} problem(s).` : '\nThe bat is the right shape, and swinging well pays.');
process.exit(bad ? 1 : 0);
